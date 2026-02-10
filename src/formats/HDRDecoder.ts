/**
 * Radiance HDR (.hdr / .pic) File Format Decoder
 *
 * Supports:
 * - RGBE pixel format (XYZE files are decoded as-is without XYZ→RGB conversion)
 * - New-style adaptive run-length encoding (RLE)
 * - Uncompressed RGBE data
 * - Standard header fields (FORMAT, EXPOSURE, GAMMA, PRIMARIES)
 * - Resolution line parsing (all orientations parsed; only -Y +X rendered correctly)
 *
 * Radiance HDR stores high dynamic range images using a shared-exponent
 * RGBE encoding: 3 mantissa bytes (R, G, B) + 1 shared exponent byte (E).
 * Linear float value: component = (byte + 0.5) / 256 * 2^(E - 128)
 */

import { validateImageDimensions, toRGBA as sharedToRGBA } from './shared';
import { DecoderError } from '../core/errors';

export interface HDRInfo {
  width: number;
  height: number;
  exposure: number;
  gamma: number;
  format: string;
  primaries?: string;
}

export interface HDRDecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  colorSpace: string;
  metadata: Record<string, unknown>;
}

const RADIANCE_MAGIC = '#?RADIANCE';
const RGBE_MAGIC = '#?RGBE';

/**
 * Check if a buffer contains a Radiance HDR file by checking the magic signature
 */
export function isHDRFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < RGBE_MAGIC.length) {
    return false;
  }
  const readLen = Math.min(buffer.byteLength, RADIANCE_MAGIC.length);
  const bytes = new Uint8Array(buffer, 0, readLen);
  const header = String.fromCharCode(...bytes);
  return header.startsWith(RADIANCE_MAGIC) || header.startsWith(RGBE_MAGIC);
}

/**
 * Get basic info from HDR header without fully decoding pixel data
 */
export function getHDRInfo(buffer: ArrayBuffer): HDRInfo | null {
  try {
    if (!isHDRFile(buffer)) {
      return null;
    }

    const { headers, width, height } = parseHeader(new Uint8Array(buffer));

    return {
      width,
      height,
      exposure: headers.exposure,
      gamma: headers.gamma,
      format: headers.format,
      primaries: headers.primaries,
    };
  } catch {
    return null;
  }
}

interface ParsedHeader {
  headers: {
    format: string;
    exposure: number;
    gamma: number;
    primaries?: string;
  };
  width: number;
  height: number;
  dataOffset: number;
}

/**
 * Parse the text header and resolution line from HDR data.
 * Returns parsed metadata and the byte offset where pixel data begins.
 */
function parseHeader(data: Uint8Array): ParsedHeader {
  // Find the end of header (empty line = two consecutive newlines)
  let offset = 0;
  const length = data.length;
  const lines: string[] = [];
  let lineStart = 0;

  // Read lines until we find an empty line (header/data separator)
  let foundEmptyLine = false;
  while (offset < length) {
    if (data[offset] === 0x0a) { // newline
      const line = decodeASCII(data, lineStart, offset);
      if (line.length === 0 && lines.length > 0) {
        foundEmptyLine = true;
        offset++;
        break;
      }
      lines.push(line);
      lineStart = offset + 1;
    }
    offset++;
  }

  if (!foundEmptyLine) {
    throw new DecoderError('HDR', 'Invalid HDR file: missing header separator');
  }

  // Parse header fields
  let format = '32-bit_rle_rgbe';
  let exposure = 1.0;
  let gamma = 1.0;
  let primaries: string | undefined;

  for (const line of lines) {
    if (line.startsWith('#')) continue; // comment or magic line

    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    const key = line.substring(0, eqIdx).trim().toUpperCase();
    const value = line.substring(eqIdx + 1).trim();

    switch (key) {
      case 'FORMAT':
        format = value;
        break;
      case 'EXPOSURE':
        exposure *= parseFloat(value) || 1.0;
        break;
      case 'GAMMA':
        gamma = parseFloat(value) || 1.0;
        break;
      case 'PRIMARIES':
        primaries = value;
        break;
    }
  }

  // Read resolution line (next line after the empty line)
  lineStart = offset;
  while (offset < length && data[offset] !== 0x0a) {
    offset++;
  }

  const resLine = decodeASCII(data, lineStart, offset);
  offset++; // skip past the newline

  // Parse resolution: "-Y <H> +X <W>" is most common.
  // All 8 orientation variants are parsed for dimensions, but pixel data
  // is stored in file scan order — only the standard -Y +X orientation
  // will display with correct orientation.
  const resMatch = resLine.match(/^([+-][XY])\s+(\d+)\s+([+-][XY])\s+(\d+)$/);
  if (!resMatch) {
    throw new DecoderError('HDR', `Invalid HDR resolution line: "${resLine}"`);
  }

  let width: number;
  let height: number;

  // The first axis is rows (height), second is columns (width)
  if (resMatch[1]!.charAt(1) === 'Y') {
    height = parseInt(resMatch[2]!, 10);
    width = parseInt(resMatch[4]!, 10);
  } else {
    width = parseInt(resMatch[2]!, 10);
    height = parseInt(resMatch[4]!, 10);
  }

  return {
    headers: { format, exposure, gamma, primaries },
    width,
    height,
    dataOffset: offset,
  };
}

/**
 * Decode ASCII text from a byte range
 */
function decodeASCII(data: Uint8Array, start: number, end: number): string {
  let result = '';
  for (let i = start; i < end; i++) {
    // Strip carriage returns for Windows-style line endings
    if (data[i] !== 0x0d) {
      result += String.fromCharCode(data[i]!);
    }
  }
  return result;
}

/**
 * Convert RGBE bytes to linear float value.
 * When exponent is 0, the pixel is black.
 * Otherwise: value = (byte + 0.5) / 256 * 2^(exponent - 128)
 */
function rgbeToFloat(r: number, g: number, b: number, e: number): [number, number, number] {
  if (e === 0) {
    return [0, 0, 0];
  }
  const scale = Math.pow(2, e - 128) / 256;
  return [
    (r + 0.5) * scale,
    (g + 0.5) * scale,
    (b + 0.5) * scale,
  ];
}

/**
 * Read new-style adaptive RLE scanline data.
 * Each scanline starts with [2, 2, widthHi, widthLo].
 * Then each of the 4 components (R, G, B, E) is independently RLE-encoded.
 */
function readRLEScanline(data: Uint8Array, offset: number, width: number): { scanline: Uint8Array; bytesRead: number } {
  const scanline = new Uint8Array(width * 4);

  // Verify new-style RLE marker
  if (data[offset] !== 2 || data[offset + 1] !== 2) {
    throw new DecoderError('HDR', 'Invalid RLE scanline marker');
  }

  const encodedWidth = (data[offset + 2]! << 8) | data[offset + 3]!;
  if (encodedWidth !== width) {
    throw new DecoderError('HDR', `RLE scanline width mismatch: expected ${width}, got ${encodedWidth}`);
  }

  let pos = offset + 4;

  // Read each component separately (R, then G, then B, then E)
  for (let component = 0; component < 4; component++) {
    let pixelIdx = 0;
    while (pixelIdx < width) {
      if (pos >= data.length) {
        throw new DecoderError('HDR', 'Truncated RLE data');
      }

      const code = data[pos++]!;
      if (code > 128) {
        // Run: repeat next byte (code - 128) times
        const count = code - 128;
        if (pixelIdx + count > width) {
          throw new DecoderError('HDR', 'RLE run exceeds scanline width');
        }
        const value = data[pos++]!;
        for (let i = 0; i < count; i++) {
          scanline[(pixelIdx + i) * 4 + component] = value;
        }
        pixelIdx += count;
      } else {
        // Literal: read next `code` bytes
        const count = code;
        if (pixelIdx + count > width) {
          throw new DecoderError('HDR', 'RLE literal exceeds scanline width');
        }
        for (let i = 0; i < count; i++) {
          scanline[(pixelIdx + i) * 4 + component] = data[pos++]!;
        }
        pixelIdx += count;
      }
    }
  }

  return { scanline, bytesRead: pos - offset };
}

/**
 * Decode a Radiance HDR file from an ArrayBuffer
 */
export async function decodeHDR(buffer: ArrayBuffer): Promise<HDRDecodeResult> {
  const data = new Uint8Array(buffer);

  if (!isHDRFile(buffer)) {
    throw new DecoderError('HDR', 'Invalid HDR file: wrong magic signature');
  }

  const { headers, width, height, dataOffset } = parseHeader(data);

  validateImageDimensions(width, height, 'HDR');

  const totalPixels = width * height;
  const rgbFloat = new Float32Array(totalPixels * 3);

  let offset = dataOffset;

  // Determine encoding: new-style RLE if scanline starts with [2, 2, hi, lo]
  // where (hi << 8 | lo) matches the expected width, and width is in [8, 32767].
  // Checking the encoded width prevents false positives when uncompressed pixel
  // data happens to start with R=2, G=2.
  const useNewRLE = width >= 8 && width <= 32767 &&
    offset + 4 <= data.length &&
    data[offset] === 2 && data[offset + 1] === 2 &&
    ((data[offset + 2]! << 8) | data[offset + 3]!) === width;

  if (useNewRLE) {
    // New-style adaptive RLE: each scanline independently encoded
    for (let y = 0; y < height; y++) {
      if (offset + 4 > data.length) {
        throw new DecoderError('HDR', 'Truncated HDR file: unexpected end of data');
      }

      const { scanline, bytesRead } = readRLEScanline(data, offset, width);
      offset += bytesRead;

      // Convert RGBE to float
      for (let x = 0; x < width; x++) {
        const srcIdx = x * 4;
        const dstIdx = (y * width + x) * 3;
        const [rf, gf, bf] = rgbeToFloat(
          scanline[srcIdx]!,
          scanline[srcIdx + 1]!,
          scanline[srcIdx + 2]!,
          scanline[srcIdx + 3]!
        );
        rgbFloat[dstIdx] = rf;
        rgbFloat[dstIdx + 1] = gf;
        rgbFloat[dstIdx + 2] = bf;
      }
    }
  } else {
    // Uncompressed: raw RGBE quads
    for (let i = 0; i < totalPixels; i++) {
      if (offset + 4 > data.length) {
        throw new DecoderError('HDR', 'Truncated HDR file: unexpected end of pixel data');
      }
      const r = data[offset]!;
      const g = data[offset + 1]!;
      const b = data[offset + 2]!;
      const e = data[offset + 3]!;
      offset += 4;

      const [rf, gf, bf] = rgbeToFloat(r, g, b, e);
      const dstIdx = i * 3;
      rgbFloat[dstIdx] = rf;
      rgbFloat[dstIdx + 1] = gf;
      rgbFloat[dstIdx + 2] = bf;
    }
  }

  // Convert 3-channel RGB to 4-channel RGBA
  const rgbaData = sharedToRGBA(rgbFloat, width, height, 3);

  return {
    width,
    height,
    data: rgbaData,
    channels: 4,
    colorSpace: 'linear',
    metadata: {
      format: 'hdr',
      hdrFormat: headers.format,
      exposure: headers.exposure,
      gamma: headers.gamma,
      ...(headers.primaries ? { primaries: headers.primaries } : {}),
    },
  };
}
