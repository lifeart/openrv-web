/**
 * Radiance HDR (.hdr / .pic) File Format Decoder
 *
 * Supports:
 * - RGBE pixel format (XYZE files are decoded as-is without XYZ→RGB conversion)
 * - New-style adaptive run-length encoding (RLE)
 * - Uncompressed RGBE data
 * - Standard header fields (FORMAT, EXPOSURE, GAMMA, PRIMARIES)
 * - Resolution line parsing with full orientation support (all 8 modes rearranged to -Y +X)
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
  /** Width of the image in its final display orientation (after rearrangement). */
  width: number;
  /** Height of the image in its final display orientation (after rearrangement). */
  height: number;
  /** Width as read from the resolution line (scan-order width, i.e. number of pixels per scanline). */
  scanWidth: number;
  /** Height as read from the resolution line (scan-order height, i.e. number of scanlines). */
  scanHeight: number;
  /** First axis from the resolution line, e.g. '-Y' or '+X'. */
  firstAxis: string;
  /** Second axis from the resolution line, e.g. '+X' or '-Y'. */
  secondAxis: string;
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
  // All 8 orientation variants are parsed. Pixel data rearrangement to
  // standard -Y +X orientation is handled by rearrangeOrientation().
  const resMatch = resLine.match(/^([+-][XY])\s+(\d+)\s+([+-][XY])\s+(\d+)$/);
  if (!resMatch) {
    throw new DecoderError('HDR', `Invalid HDR resolution line: "${resLine}"`);
  }

  const firstAxis = resMatch[1]!;
  const firstDim = parseInt(resMatch[2]!, 10);
  const secondAxis = resMatch[3]!;
  const secondDim = parseInt(resMatch[4]!, 10);

  // Scan-order dimensions: first dimension is number of scanlines (rows),
  // second dimension is number of pixels per scanline (columns).
  const scanWidth = secondDim;
  const scanHeight = firstDim;

  // Final display dimensions: for Y-first orientations, first dim is height,
  // second is width. For X-first (transposed) orientations, first dim is width,
  // second is height — so we swap to get the final output size.
  let width: number;
  let height: number;

  if (firstAxis.charAt(1) === 'Y') {
    height = firstDim;
    width = secondDim;
  } else {
    width = firstDim;
    height = secondDim;
  }

  return {
    headers: { format, exposure, gamma, primaries },
    width,
    height,
    scanWidth,
    scanHeight,
    firstAxis,
    secondAxis,
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
 * Rearrange RGB float pixel data from file scan order to standard -Y +X orientation.
 *
 * The HDR file stores pixels in scan order defined by the resolution line. The first
 * axis is rows (scanlines) and the second axis is columns (pixels per scanline).
 * This function remaps pixel positions to standard top-to-bottom, left-to-right order.
 *
 * For Y-first orientations (1-4): scanWidth = output width, scanHeight = output height
 * For X-first orientations (5-8): scanWidth = output height, scanHeight = output width (transposed)
 *
 * @param rgbFloat - Source pixel data in scan order (3 channels per pixel)
 * @param scanWidth - Number of pixels per scanline
 * @param scanHeight - Number of scanlines
 * @param firstAxis - First axis from resolution line (e.g. '-Y', '+Y', '-X', '+X')
 * @param secondAxis - Second axis from resolution line (e.g. '+X', '-X', '+Y', '-Y')
 * @returns Rearranged pixel data and final dimensions in standard orientation
 */
function rearrangeOrientation(
  rgbFloat: Float32Array,
  scanWidth: number,
  scanHeight: number,
  firstAxis: string,
  secondAxis: string,
): { data: Float32Array; width: number; height: number } {
  // Standard orientation: no rearrangement needed
  if (firstAxis === '-Y' && secondAxis === '+X') {
    return { data: rgbFloat, width: scanWidth, height: scanHeight };
  }

  const isTransposed = firstAxis.charAt(1) === 'X';

  // Final output dimensions in standard -Y +X space
  let outWidth: number;
  let outHeight: number;
  if (isTransposed) {
    // X-first: scan rows become columns in the output
    outWidth = scanHeight;
    outHeight = scanWidth;
  } else {
    outWidth = scanWidth;
    outHeight = scanHeight;
  }

  const totalPixels = scanWidth * scanHeight;
  const result = new Float32Array(totalPixels * 3);

  for (let row = 0; row < scanHeight; row++) {
    for (let col = 0; col < scanWidth; col++) {
      const srcIdx = (row * scanWidth + col) * 3;

      // Determine destination (outY, outX) in standard -Y +X coordinate space.
      //
      // In the file, "row" runs along the first axis direction and "col" runs
      // along the second axis direction. We map these to standard coordinates:
      //   standard Y (top-to-bottom): -Y means row 0 is top, +Y means row 0 is bottom
      //   standard X (left-to-right): +X means col 0 is left, -X means col 0 is right
      let outX: number;
      let outY: number;

      if (!isTransposed) {
        // Y-first orientations: first axis is Y, second is X
        // Row maps to Y, col maps to X
        outY = firstAxis === '-Y' ? row : (scanHeight - 1 - row);
        outX = secondAxis === '+X' ? col : (scanWidth - 1 - col);
      } else {
        // X-first orientations (transposed): first axis is X, second is Y
        // Row maps to X, col maps to Y
        outX = firstAxis === '+X' ? row : (scanHeight - 1 - row);
        outY = secondAxis === '-Y' ? col : (scanWidth - 1 - col);
      }

      const dstIdx = (outY * outWidth + outX) * 3;
      result[dstIdx] = rgbFloat[srcIdx]!;
      result[dstIdx + 1] = rgbFloat[srcIdx + 1]!;
      result[dstIdx + 2] = rgbFloat[srcIdx + 2]!;
    }
  }

  return { data: result, width: outWidth, height: outHeight };
}

/**
 * Decode a Radiance HDR file from an ArrayBuffer
 */
export async function decodeHDR(buffer: ArrayBuffer): Promise<HDRDecodeResult> {
  const data = new Uint8Array(buffer);

  if (!isHDRFile(buffer)) {
    throw new DecoderError('HDR', 'Invalid HDR file: wrong magic signature');
  }

  const { headers, width, height, scanWidth, scanHeight, firstAxis, secondAxis, dataOffset } = parseHeader(data);

  validateImageDimensions(width, height, 'HDR');

  const totalPixels = scanWidth * scanHeight;
  const rgbFloat = new Float32Array(totalPixels * 3);

  let offset = dataOffset;

  // Determine encoding: new-style RLE if scanline starts with [2, 2, hi, lo]
  // where (hi << 8 | lo) matches the expected scanline width, and scanWidth is in [8, 32767].
  // Checking the encoded width prevents false positives when uncompressed pixel
  // data happens to start with R=2, G=2.
  const useNewRLE = scanWidth >= 8 && scanWidth <= 32767 &&
    offset + 4 <= data.length &&
    data[offset] === 2 && data[offset + 1] === 2 &&
    ((data[offset + 2]! << 8) | data[offset + 3]!) === scanWidth;

  if (useNewRLE) {
    // New-style adaptive RLE: each scanline independently encoded
    for (let y = 0; y < scanHeight; y++) {
      if (offset + 4 > data.length) {
        throw new DecoderError('HDR', 'Truncated HDR file: unexpected end of data');
      }

      const { scanline, bytesRead } = readRLEScanline(data, offset, scanWidth);
      offset += bytesRead;

      // Convert RGBE to float
      for (let x = 0; x < scanWidth; x++) {
        const srcIdx = x * 4;
        const dstIdx = (y * scanWidth + x) * 3;
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

  // Rearrange pixel data from file scan order to standard -Y +X orientation
  const oriented = rearrangeOrientation(rgbFloat, scanWidth, scanHeight, firstAxis, secondAxis);

  // Convert 3-channel RGB to 4-channel RGBA
  const rgbaData = sharedToRGBA(oriented.data, oriented.width, oriented.height, 3);

  return {
    width: oriented.width,
    height: oriented.height,
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
