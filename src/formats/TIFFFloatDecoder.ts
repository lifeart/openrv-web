/**
 * TIFF Image Format Decoder
 *
 * Supports:
 * - 16-bit IEEE half-float, 32-bit float, and 64-bit double pixel data
 *   (decodeTIFFFloat, scene-linear)
 * - Unsigned 1/2/4/8/16/32-bit integer data: grayscale, RGB(A) and palette
 *   (decodeTIFFInteger, display-referred)
 * - RGB and RGBA images
 * - Big-endian and little-endian byte order
 * - Uncompressed (1), LZW (5), Deflate/ZIP (8, 32946), and PackBits (32773) compression
 * - Horizontal differencing predictor (2) and floating-point predictor (3)
 * - Strip-based image organization
 * - Tiled image organization (TileWidth, TileLength, TileOffsets, TileByteCounts)
 *
 * Not yet supported:
 * - Signed integer samples, CMYK, YCbCr, CIELab
 * - Planar (separate-plane) layout
 * - JPEG compression
 *
 * Based on TIFF 6.0 specification.
 */

import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';
import {
  COMPRESSION_LZW,
  COMPRESSION_NAMES,
  COMPRESSION_NONE,
  COMPRESSION_PACKBITS,
  type IntegerLayout,
  PHOTOMETRIC_PALETTE,
  PHOTOMETRIC_RGB,
  PHOTOMETRIC_WHITE_IS_ZERO,
  PLANAR_CHUNKY,
  PREDICTOR_FLOATING_POINT,
  PREDICTOR_HORIZONTAL,
  PREDICTOR_NONE,
  SAMPLE_FORMAT_FLOAT,
  SAMPLE_FORMAT_INT,
  SAMPLE_FORMAT_UINT,
  SUPPORTED_COMPRESSIONS,
  TAG_BITS_PER_SAMPLE,
  TAG_COLOR_MAP,
  TAG_COMPRESSION,
  TAG_IMAGE_LENGTH,
  TAG_IMAGE_WIDTH,
  TAG_PHOTOMETRIC,
  TAG_PLANAR_CONFIGURATION,
  TAG_PREDICTOR,
  TAG_ROWS_PER_STRIP,
  TAG_SAMPLES_PER_PIXEL,
  TAG_SAMPLE_FORMAT,
  TAG_STRIP_BYTE_COUNTS,
  TAG_STRIP_OFFSETS,
  TAG_TILE_BYTE_COUNTS,
  TAG_TILE_LENGTH,
  TAG_TILE_OFFSETS,
  TAG_TILE_WIDTH,
  TIFF_BE,
  TIFF_LE,
  TIFF_MAGIC,
  describeIntegerLayout,
  getTagMultipleValues,
  getTagSingleValue,
  parseIFD,
} from './TIFFTags';

export { isTIFFFile, isIntegerTIFF } from './TIFFTags';

export interface TIFFInfo {
  width: number;
  height: number;
  bitsPerSample: number;
  sampleFormat: string; // 'uint' | 'int' | 'float'
  channels: number;
  compression: number;
  bigEndian: boolean;
}

export interface TIFFDecodeResult {
  width: number;
  height: number;
  data: Float32Array; // RGBA interleaved
  channels: number; // always 4
  /** 'linear' for float data, 'srgb' (display-referred) for integer data */
  colorSpace: 'linear' | 'srgb';
  metadata: Record<string, unknown>;
}

/**
 * Check if a TIFF file contains float data
 */
export function isFloatTIFF(buffer: ArrayBuffer): boolean {
  const info = getTIFFInfo(buffer);
  if (!info) return false;
  return (
    info.sampleFormat === 'float' &&
    (info.bitsPerSample === 16 || info.bitsPerSample === 32 || info.bitsPerSample === 64)
  );
}

/**
 * Decompress LZW-compressed TIFF data.
 * TIFF uses MSB-first (big-endian) bit packing, unlike GIF which uses LSB-first.
 * Variable code width starts at 9 bits and increases up to 12 bits.
 */
function decompressLZW(compressed: Uint8Array): Uint8Array {
  const CLEAR_CODE = 256;
  const EOI_CODE = 257;
  const MAX_CODE = 4095; // 12-bit max
  const MAX_CHAIN_DEPTH = 4096; // Maximum prefix chain depth to detect cycles

  // Output buffer - grow as needed
  const output: number[] = [];

  // LZW table: prefix chain + suffix byte
  // Using typed arrays for performance
  const tablePrefix = new Int32Array(4096);
  const tableSuffix = new Uint8Array(4096);
  // Use Uint32Array instead of Uint16Array to prevent any possibility of overflow.
  // With 12-bit codes (max 4096 entries), the theoretical max string length is ~3838,
  // well within Uint16Array's 65535 limit for valid data. However, Uint32Array provides
  // defense-in-depth against corrupted data that might cause unexpected length accumulation,
  // at negligible cost (4096 entries = 16KB vs 8KB).
  const tableLength = new Uint32Array(4096);

  let codeSize = 9;
  let nextCode = 258;
  let oldCode = -1;

  // Bit reader state (MSB-first for TIFF)
  // Use separate high/low parts to avoid JavaScript's 32-bit integer overflow
  // during bitwise operations when accumulating bits.
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let bytePos = 0;

  function readCode(): number {
    while (bitsInBuffer < codeSize) {
      if (bytePos >= compressed.length) return EOI_CODE;
      bitBuffer = (bitBuffer << 8) | (compressed[bytePos++] ?? 0);
      bitsInBuffer += 8;
    }
    bitsInBuffer -= codeSize;
    // Mask bitBuffer to keep only the relevant bits, preventing overflow
    // from accumulating beyond 32 bits across multiple readCode() calls.
    const code = (bitBuffer >>> bitsInBuffer) & ((1 << codeSize) - 1);
    // Trim bitBuffer to only retain the remaining valid bits.
    // After subtraction, bitsInBuffer is always in [0, 11] (max: we entered
    // the loop needing 12 bits with 11 already buffered, added 8 → 19, then
    // subtracted 12 → 7; the theoretical max is 11 = 12 - 1). So the mask
    // (1 << bitsInBuffer) - 1 is always safe — no 32-bit overflow concern.
    bitBuffer = bitBuffer & ((1 << bitsInBuffer) - 1);
    return code;
  }

  // Helper to output the string for a code, with chain integrity validation
  function outputString(code: number): void {
    if (code < 256) {
      output.push(code);
      return;
    }
    // Build string by following prefix chain (in reverse), then output
    const len = tableLength[code] ?? 0;
    const startIdx = output.length;
    // Extend output array
    output.length += len;
    let c = code;
    let idx = startIdx + len - 1;
    let depth = 0;
    while (c >= 256) {
      if (++depth > MAX_CHAIN_DEPTH) {
        throw new DecoderError('TIFF', `LZW chain corruption detected: prefix chain cycle at code ${code}`);
      }
      output[idx--] = tableSuffix[c] ?? 0;
      c = tablePrefix[c] ?? 0;
    }
    output[idx] = c; // first character
  }

  function firstChar(code: number): number {
    let c = code;
    let depth = 0;
    while (c >= 256) {
      if (++depth > MAX_CHAIN_DEPTH) {
        throw new DecoderError('TIFF', `LZW chain corruption detected: prefix chain cycle at code ${code}`);
      }
      c = tablePrefix[c] ?? 0;
    }
    return c;
  }

  // Initialize table
  for (let i = 0; i < 256; i++) {
    tablePrefix[i] = -1;
    tableSuffix[i] = i;
    tableLength[i] = 1;
  }

  while (bytePos < compressed.length || bitsInBuffer >= codeSize) {
    const code = readCode();

    if (code === EOI_CODE) break;

    if (code === CLEAR_CODE) {
      codeSize = 9;
      nextCode = 258;
      oldCode = -1;
      continue;
    }

    if (oldCode === -1) {
      // First code after clear
      if (code >= 256) {
        throw new DecoderError(
          'TIFF',
          `LZW corruption: first code after clear must be a literal byte (0-255), got ${code}`,
        );
      }
      outputString(code);
      oldCode = code;
      continue;
    }

    if (code < nextCode) {
      // Code is in the table
      outputString(code);

      // Add new entry: oldCode + firstChar(code)
      if (nextCode <= MAX_CODE) {
        tablePrefix[nextCode] = oldCode;
        tableSuffix[nextCode] = firstChar(code);
        tableLength[nextCode] = (oldCode < 256 ? 1 : (tableLength[oldCode] ?? 0)) + 1;
        nextCode++;
      }
    } else if (code === nextCode) {
      // Special case: code === nextCode (string not yet in table)
      const fc = firstChar(oldCode);

      // Add new entry first
      if (nextCode <= MAX_CODE) {
        tablePrefix[nextCode] = oldCode;
        tableSuffix[nextCode] = fc;
        tableLength[nextCode] = (oldCode < 256 ? 1 : (tableLength[oldCode] ?? 0)) + 1;
        nextCode++;
      }

      // Output the new entry
      outputString(code);
    } else {
      // code > nextCode: invalid, indicates corrupted LZW data
      throw new DecoderError('TIFF', `LZW corruption: received code ${code} but next expected code is ${nextCode}`);
    }

    // Increase code size one code early ("early change"), as libtiff and
    // every TIFF writer do: 10 bits once code 511 is assigned, not 512.
    if (nextCode >= (1 << codeSize) - 1 && codeSize < 12) {
      codeSize++;
    }

    oldCode = code;
  }

  return new Uint8Array(output);
}

/**
 * Decompress deflate/zlib compressed TIFF data using DecompressionStream.
 * Unlike EXR, TIFF does NOT apply predictor reconstruction inside the decompressor.
 */
async function decompressDeflate(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new DecoderError('TIFF', 'Deflate decompression requires DecompressionStream support');
  }

  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  await writer.write(new Uint8Array(compressed));
  await writer.close();

  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Decompress PackBits (run-length encoding) compressed TIFF data.
 *
 * PackBits is a simple RLE scheme defined in the TIFF 6.0 spec:
 * - If n is 0..127: copy next n+1 bytes literally
 * - If n is -127..-1: repeat next byte (1-n) times
 * - If n is -128: no-op (skip)
 */
function decompressPackBits(compressed: Uint8Array, expectedSize?: number): Uint8Array {
  const output: number[] = [];
  let pos = 0;

  while (pos < compressed.length) {
    // Read header byte as signed
    let n = compressed[pos++] ?? 0;
    if (n > 127) n -= 256; // Convert to signed

    if (n >= 0 && n <= 127) {
      // Literal run: copy next n+1 bytes
      const count = n + 1;
      for (let i = 0; i < count && pos < compressed.length; i++) {
        output.push(compressed[pos++] ?? 0);
      }
    } else if (n >= -127 && n <= -1) {
      // Repeated run: repeat next byte (1-n) times
      if (pos >= compressed.length) break;
      const value = compressed[pos++] ?? 0;
      const count = 1 - n;
      for (let i = 0; i < count; i++) {
        output.push(value);
      }
    }
    // n === -128: no-op
  }

  const result = new Uint8Array(output);

  // If we know the expected size and got less, pad with zeros
  if (expectedSize !== undefined && result.length < expectedSize) {
    const padded = new Uint8Array(expectedSize);
    padded.set(result);
    return padded;
  }

  return result;
}

/**
 * Apply TIFF predictor reconstruction to decompressed strip/tile data.
 *
 * Predictor 2 (horizontal differencing): each *sample word* (16/32/64-bit,
 * read in the file's byte order) is stored as the difference from the same
 * channel of the previous pixel. Accumulation is done modulo 2^bits on whole
 * words (matching libtiff's horAcc16/32/64), not per byte, so carries between
 * bytes are handled correctly.
 *
 * Predictor 3 (floating-point): bytes are first delta-decoded (stride 1),
 * then un-rearranged from byte planes to interleaved samples. Per the
 * Adobe TIFF Technical Note 3 / libtiff fpAcc, the first plane always holds
 * the most significant byte of every sample regardless of the file's byte
 * order, so the reconstructed bytes are written in the file's byte order
 * (`le`) so downstream readers can keep using the file byte order.
 */
function applyPredictor(
  data: Uint8Array,
  predictor: number,
  width: number,
  samplesPerPixel: number,
  bytesPerSample: number,
  rowCount: number,
  le: boolean,
): Uint8Array {
  if (predictor === PREDICTOR_NONE) return data;

  const rowBytes = width * samplesPerPixel * bytesPerSample;

  if (predictor === PREDICTOR_HORIZONTAL) {
    const result = new Uint8Array(data);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    const stride = samplesPerPixel * bytesPerSample;
    for (let row = 0; row < rowCount; row++) {
      const rowStart = row * rowBytes;
      const rowEnd = Math.min(rowStart + rowBytes, result.length);
      for (let i = rowStart + stride; i + bytesPerSample <= rowEnd; i += bytesPerSample) {
        const prev = i - stride;
        if (bytesPerSample === 1) {
          result[i] = ((result[i] ?? 0) + (result[prev] ?? 0)) & 0xff;
        } else if (bytesPerSample === 2) {
          view.setUint16(i, (view.getUint16(i, le) + view.getUint16(prev, le)) & 0xffff, le);
        } else if (bytesPerSample === 4) {
          view.setUint32(i, (view.getUint32(i, le) + view.getUint32(prev, le)) >>> 0, le);
        } else {
          view.setBigUint64(i, BigInt.asUintN(64, view.getBigUint64(i, le) + view.getBigUint64(prev, le)), le);
        }
      }
    }
    return result;
  }

  if (predictor === PREDICTOR_FLOATING_POINT) {
    const result = new Uint8Array(data.length);
    const temp = new Uint8Array(data.length);
    const wordCount = width * samplesPerPixel;

    for (let row = 0; row < rowCount; row++) {
      const rowStart = row * rowBytes;
      if (rowStart >= data.length) break;
      const rowEnd = Math.min(rowStart + rowBytes, data.length);
      // Step 1: undo byte-level delta (stride 1)
      temp[rowStart] = data[rowStart] ?? 0;
      for (let i = rowStart + 1; i < rowEnd; i++) {
        temp[i] = ((temp[i - 1] ?? 0) + (data[i] ?? 0)) & 0xff;
      }

      // Step 2: plane b holds byte b of each sample counting from the MSB.
      for (let i = 0; i < wordCount; i++) {
        for (let b = 0; b < bytesPerSample; b++) {
          const srcIdx = rowStart + b * wordCount + i;
          const dstByte = le ? bytesPerSample - 1 - b : b;
          const dstIdx = rowStart + i * bytesPerSample + dstByte;
          if (srcIdx < rowEnd && dstIdx < rowEnd) {
            result[dstIdx] = temp[srcIdx] ?? 0;
          }
        }
      }
    }
    return result;
  }

  throw new DecoderError(
    'TIFF',
    `Unsupported TIFF predictor: ${predictor}. Supported: 1 (none), 2 (horizontal), 3 (floating-point).`,
  );
}

/**
 * Get basic info from TIFF header without fully decoding
 */
export function getTIFFInfo(buffer: ArrayBuffer): TIFFInfo | null {
  try {
    if (buffer.byteLength < 8) {
      return null;
    }

    const view = new DataView(buffer);
    const byteOrder = view.getUint16(0, false);

    let bigEndian: boolean;
    if (byteOrder === TIFF_LE) {
      bigEndian = false;
    } else if (byteOrder === TIFF_BE) {
      bigEndian = true;
    } else {
      return null;
    }

    const le = !bigEndian;
    const magic = view.getUint16(2, le);
    if (magic !== TIFF_MAGIC) {
      return null;
    }

    // Read IFD offset
    const ifdOffset = view.getUint32(4, le);
    if (ifdOffset >= buffer.byteLength) return null;

    // Parse IFD
    const tags = parseIFD(view, ifdOffset, le);

    const width = getTagSingleValue(view, tags, TAG_IMAGE_WIDTH, le, 0);
    const height = getTagSingleValue(view, tags, TAG_IMAGE_LENGTH, le, 0);
    const bitsPerSample = getTagSingleValue(view, tags, TAG_BITS_PER_SAMPLE, le, 8);
    const compression = getTagSingleValue(view, tags, TAG_COMPRESSION, le, 1);
    const samplesPerPixel = getTagSingleValue(view, tags, TAG_SAMPLES_PER_PIXEL, le, 1);
    const sampleFormatValue = getTagSingleValue(view, tags, TAG_SAMPLE_FORMAT, le, SAMPLE_FORMAT_UINT);

    let sampleFormat: string;
    switch (sampleFormatValue) {
      case SAMPLE_FORMAT_FLOAT:
        sampleFormat = 'float';
        break;
      case SAMPLE_FORMAT_INT:
        sampleFormat = 'int';
        break;
      default:
        sampleFormat = 'uint';
        break;
    }

    return {
      width,
      height,
      bitsPerSample,
      sampleFormat,
      channels: samplesPerPixel,
      compression,
      bigEndian,
    };
  } catch {
    return null;
  }
}

/**
 * Decode a float TIFF file from an ArrayBuffer
 *
 * @param buffer - The TIFF file data
 * @returns Decoded image data as RGBA Float32Array
 */

/**
 * Convert a 16-bit IEEE 754 half-precision float to a 32-bit float.
 * Format: 1 sign bit, 5 exponent bits, 10 mantissa bits.
 */
function float16ToFloat32(h: number): number {
  const sign = (h >>> 15) & 0x1;
  const exp = (h >>> 10) & 0x1f;
  const mant = h & 0x3ff;

  if (exp === 0) {
    if (mant === 0) {
      // Zero (positive or negative)
      return sign ? -0 : 0;
    }
    // Subnormal: value = (-1)^sign * 2^-14 * (mant / 1024)
    const val = (mant / 1024) * Math.pow(2, -14);
    return sign ? -val : val;
  } else if (exp === 0x1f) {
    if (mant === 0) {
      return sign ? -Infinity : Infinity;
    }
    return NaN;
  }

  // Normalized: value = (-1)^sign * 2^(exp-15) * (1 + mant/1024)
  const val = (1 + mant / 1024) * Math.pow(2, exp - 15);
  return sign ? -val : val;
}

/**
 * Read a single float sample from a DataView at the given byte offset,
 * handling 16-bit, 32-bit, and 64-bit float formats.
 */
function readFloatSample(srcView: DataView, byteOffset: number, bytesPerSample: number, le: boolean): number {
  if (bytesPerSample === 4) {
    return srcView.getFloat32(byteOffset, le);
  } else if (bytesPerSample === 8) {
    // Read float64 and truncate to float32 precision
    return srcView.getFloat64(byteOffset, le);
  } else if (bytesPerSample === 2) {
    // 2 bytes = 16-bit half float
    const bits = srcView.getUint16(byteOffset, le);
    return float16ToFloat32(bits);
  } else {
    throw new DecoderError(
      'TIFF',
      `Unsupported bytes per sample: ${bytesPerSample}. Supported: 2 (half-float), 4 (float32), 8 (float64).`,
    );
  }
}

/**
 * Expand source pixel channels to RGBA output.
 * - 1 channel (grayscale): replicate to R, G, B; alpha = 1.0 (pre-initialized)
 * - 2 channels (luminance + alpha): replicate luminance to R, G, B; copy alpha
 * - 3 channels (RGB): copy R, G, B; alpha = 1.0 (pre-initialized)
 * - 4 channels (RGBA): copy all four
 */
function expandPixelToRGBA(
  srcView: DataView,
  srcByteOffset: number,
  outputData: Float32Array,
  outputIdx: number,
  readChannels: number,
  le: boolean,
  bytesPerSample: number = 4,
): void {
  if (readChannels === 1) {
    // Grayscale: replicate single value to R, G, B
    const v = readFloatSample(srcView, srcByteOffset, bytesPerSample, le);
    outputData[outputIdx] = v;
    outputData[outputIdx + 1] = v;
    outputData[outputIdx + 2] = v;
    // Alpha already initialized to 1.0
  } else if (readChannels === 2) {
    // Luminance + Alpha: replicate luminance to R, G, B; copy alpha
    const lum = readFloatSample(srcView, srcByteOffset, bytesPerSample, le);
    const alpha = readFloatSample(srcView, srcByteOffset + bytesPerSample, bytesPerSample, le);
    outputData[outputIdx] = lum;
    outputData[outputIdx + 1] = lum;
    outputData[outputIdx + 2] = lum;
    outputData[outputIdx + 3] = alpha;
  } else if (readChannels === 3) {
    // RGB: copy R, G, B; alpha already initialized to 1.0
    outputData[outputIdx] = readFloatSample(srcView, srcByteOffset, bytesPerSample, le);
    outputData[outputIdx + 1] = readFloatSample(srcView, srcByteOffset + bytesPerSample, bytesPerSample, le);
    outputData[outputIdx + 2] = readFloatSample(srcView, srcByteOffset + 2 * bytesPerSample, bytesPerSample, le);
  } else {
    // RGBA (4 channels): copy all four
    outputData[outputIdx] = readFloatSample(srcView, srcByteOffset, bytesPerSample, le);
    outputData[outputIdx + 1] = readFloatSample(srcView, srcByteOffset + bytesPerSample, bytesPerSample, le);
    outputData[outputIdx + 2] = readFloatSample(srcView, srcByteOffset + 2 * bytesPerSample, bytesPerSample, le);
    outputData[outputIdx + 3] = readFloatSample(srcView, srcByteOffset + 3 * bytesPerSample, bytesPerSample, le);
  }
}

export async function decodeTIFFFloat(buffer: ArrayBuffer): Promise<TIFFDecodeResult> {
  return decodeTIFFImage(buffer, 'float');
}

/**
 * Decode an integer TIFF (1/2/4/8/16/32-bit unsigned) from an ArrayBuffer.
 *
 * Browsers other than Safari cannot decode TIFF at all, so 8- and 16-bit
 * plates are decoded here. Samples are normalized to [0, 1] and stay
 * display-referred (the returned colorSpace is 'srgb'), like the 8-bit
 * browser path; only the precision differs.
 *
 * Supports grayscale (BlackIsZero / WhiteIsZero), RGB(A) and palette images,
 * strips or tiles, with the same compressions and predictors as float TIFF.
 */
export async function decodeTIFFInteger(buffer: ArrayBuffer): Promise<TIFFDecodeResult> {
  return decodeTIFFImage(buffer, 'integer');
}

type TIFFDecodeMode = 'float' | 'integer';

/** Writes one source pixel to RGBA output. */
type PixelWriter = (src: DataView, byteOffset: number, out: Float32Array, outIdx: number) => void;

/**
 * Build the pixel writer for an integer layout. Sub-byte samples arrive
 * already unpacked to one byte each (see {@link unpackSubByteRows}).
 */
function createIntegerPixelWriter(layout: IntegerLayout, le: boolean, colorMap: number[]): PixelWriter {
  const { bitsPerSample, samplesPerPixel, photometric } = layout;
  const bytesPerSample = storedBytesPerSample(bitsPerSample);
  const maxValue = bitsPerSample === 32 ? 4294967295 : 2 ** bitsPerSample - 1;
  const read = (src: DataView, off: number): number =>
    bytesPerSample === 1 ? src.getUint8(off) : bytesPerSample === 2 ? src.getUint16(off, le) : src.getUint32(off, le);

  if (photometric === PHOTOMETRIC_PALETTE) {
    // ColorMap holds all reds, then all greens, then all blues (16-bit each).
    const entries = 2 ** bitsPerSample;
    const palette = normalizeColorMap(colorMap);
    return (src, off, out, idx) => {
      const index = read(src, off);
      out[idx] = palette[index] ?? 0;
      out[idx + 1] = palette[entries + index] ?? 0;
      out[idx + 2] = palette[2 * entries + index] ?? 0;
      if (samplesPerPixel >= 2) out[idx + 3] = read(src, off + bytesPerSample) / maxValue;
    };
  }

  if (photometric === PHOTOMETRIC_RGB) {
    return (src, off, out, idx) => {
      out[idx] = read(src, off) / maxValue;
      out[idx + 1] = read(src, off + bytesPerSample) / maxValue;
      out[idx + 2] = read(src, off + 2 * bytesPerSample) / maxValue;
      if (samplesPerPixel >= 4) out[idx + 3] = read(src, off + 3 * bytesPerSample) / maxValue;
    };
  }

  const invert = photometric === PHOTOMETRIC_WHITE_IS_ZERO;
  return (src, off, out, idx) => {
    const raw = read(src, off) / maxValue;
    const v = invert ? 1 - raw : raw;
    out[idx] = v;
    out[idx + 1] = v;
    out[idx + 2] = v;
    if (samplesPerPixel >= 2) out[idx + 3] = read(src, off + bytesPerSample) / maxValue;
  };
}

/**
 * Scale 16-bit ColorMap entries to [0, 1].
 *
 * Many writers (Pillow among them) store 8-bit palettes as v * 256, and old
 * ones store plain 8-bit values; like libtiff's colormap check, those are
 * read back as 8-bit so 255 stays exactly 1.0.
 */
function normalizeColorMap(colorMap: number[]): Float32Array {
  const out = new Float32Array(colorMap.length);
  if (colorMap.every((v) => v < 256)) {
    colorMap.forEach((v, i) => (out[i] = v / 255));
  } else if (colorMap.every((v) => (v & 0xff) === 0 || (v & 0xff) === v >> 8)) {
    colorMap.forEach((v, i) => (out[i] = (v >> 8) / 255));
  } else {
    colorMap.forEach((v, i) => (out[i] = v / 65535));
  }
  return out;
}

/** Bytes per sample after unpacking: sub-byte samples take one byte each. */
function storedBytesPerSample(bitsPerSample: number): number {
  return bitsPerSample < 8 ? 1 : bitsPerSample / 8;
}

/**
 * Expand 1/2/4-bit samples to one byte per sample. TIFF packs them MSB-first
 * and pads every row to a byte boundary.
 */
function unpackSubByteRows(
  data: Uint8Array,
  bitsPerSample: number,
  samplesPerRow: number,
  rowCount: number,
): Uint8Array {
  const packedRowBytes = Math.ceil((samplesPerRow * bitsPerSample) / 8);
  const out = new Uint8Array(samplesPerRow * rowCount);
  const mask = (1 << bitsPerSample) - 1;
  for (let row = 0; row < rowCount; row++) {
    const rowStart = row * packedRowBytes;
    for (let i = 0; i < samplesPerRow; i++) {
      const bit = i * bitsPerSample;
      const byte = data[rowStart + (bit >> 3)] ?? 0;
      out[row * samplesPerRow + i] = (byte >> (8 - bitsPerSample - (bit & 7))) & mask;
    }
  }
  return out;
}

/** Decompress one strip or tile with the file's compression. */
async function decompressBlock(
  compressed: Uint8Array,
  compression: number,
  expectedBytes: number,
): Promise<Uint8Array> {
  if (compression === COMPRESSION_NONE) {
    // Copy so the predictor can work in place
    return compressed.slice();
  }
  if (compression === COMPRESSION_LZW) {
    return decompressLZW(compressed);
  }
  if (compression === COMPRESSION_PACKBITS) {
    return decompressPackBits(compressed, expectedBytes);
  }
  // Deflate or Adobe Deflate
  return decompressDeflate(compressed);
}

async function decodeTIFFImage(buffer: ArrayBuffer, mode: TIFFDecodeMode): Promise<TIFFDecodeResult> {
  const view = new DataView(buffer);
  const byteOrder = view.getUint16(0, false);

  let bigEndian: boolean;
  if (byteOrder === TIFF_LE) {
    bigEndian = false;
  } else if (byteOrder === TIFF_BE) {
    bigEndian = true;
  } else {
    throw new DecoderError('TIFF', 'Invalid TIFF file: unrecognized byte order');
  }

  const le = !bigEndian;
  const magic = view.getUint16(2, le);
  if (magic !== TIFF_MAGIC) {
    throw new DecoderError('TIFF', 'Invalid TIFF file: wrong magic number');
  }

  // Read IFD offset
  const ifdOffset = view.getUint32(4, le);
  if (ifdOffset >= buffer.byteLength) {
    throw new DecoderError('TIFF', 'Invalid TIFF file: IFD offset out of range');
  }

  // Parse IFD
  const tags = parseIFD(view, ifdOffset, le);

  const width = getTagSingleValue(view, tags, TAG_IMAGE_WIDTH, le, 0);
  const height = getTagSingleValue(view, tags, TAG_IMAGE_LENGTH, le, 0);
  const bitsPerSample = getTagSingleValue(view, tags, TAG_BITS_PER_SAMPLE, le, mode === 'float' ? 8 : 1);
  const compression = getTagSingleValue(view, tags, TAG_COMPRESSION, le, 1);
  const samplesPerPixel = getTagSingleValue(view, tags, TAG_SAMPLES_PER_PIXEL, le, 1);
  const rowsPerStrip = getTagSingleValue(view, tags, TAG_ROWS_PER_STRIP, le, height);
  const sampleFormatValue = getTagSingleValue(view, tags, TAG_SAMPLE_FORMAT, le, SAMPLE_FORMAT_UINT);
  const predictor = getTagSingleValue(view, tags, TAG_PREDICTOR, le, PREDICTOR_NONE);

  // Validate dimensions
  validateImageDimensions(width, height, 'TIFF');

  let writePixel: PixelWriter;
  let photometric: number | undefined;
  if (mode === 'float') {
    if (sampleFormatValue !== SAMPLE_FORMAT_FLOAT) {
      throw new DecoderError(
        'TIFF',
        `Not a float TIFF: sample format is ${sampleFormatValue}, expected ${SAMPLE_FORMAT_FLOAT} (IEEE float)`,
      );
    }

    if (bitsPerSample !== 16 && bitsPerSample !== 32 && bitsPerSample !== 64) {
      throw new DecoderError(
        'TIFF',
        `Unsupported float bits per sample: ${bitsPerSample}. Supported: 16-bit half-float, 32-bit float, 64-bit double.`,
      );
    }
    // For 5+ channels, we only read the first 4 (RGBA) and ignore extras
    const readChannels = Math.min(samplesPerPixel, 4);
    const bytes = bitsPerSample / 8;
    writePixel = (src, off, out, idx) => expandPixelToRGBA(src, off, out, idx, readChannels, le, bytes);
  } else {
    const layout = describeIntegerLayout(view, tags, le);
    if (!layout) {
      throw new DecoderError(
        'TIFF',
        `Unsupported integer TIFF: ${bitsPerSample}-bit, sample format ${sampleFormatValue}, ` +
          `photometric ${getTagSingleValue(view, tags, TAG_PHOTOMETRIC, le, -1)}, ` +
          `planar configuration ${getTagSingleValue(view, tags, TAG_PLANAR_CONFIGURATION, le, PLANAR_CHUNKY)}. ` +
          'Supported: unsigned 1/2/4/8/16/32-bit grayscale, 8/16/32-bit RGB(A) and palette, chunky layout.',
      );
    }
    photometric = layout.photometric;
    const colorMap =
      layout.photometric === PHOTOMETRIC_PALETTE ? getTagMultipleValues(view, tags, TAG_COLOR_MAP, le) : [];
    writePixel = createIntegerPixelWriter(layout, le, colorMap);
  }

  if (!SUPPORTED_COMPRESSIONS.includes(compression)) {
    const compressionName = COMPRESSION_NAMES[compression] ?? 'unknown';
    const msg =
      `Unsupported TIFF compression: ${compression} (${compressionName}). ` +
      `Supported modes: Uncompressed (1), LZW (5), Deflate (8, 32946), PackBits (32773).`;
    throw new DecoderError('TIFF', msg);
  }

  if (predictor !== PREDICTOR_NONE && predictor !== PREDICTOR_HORIZONTAL && predictor !== PREDICTOR_FLOATING_POINT) {
    throw new DecoderError(
      'TIFF',
      `Unsupported TIFF predictor: ${predictor}. Supported: 1 (none), 2 (horizontal), 3 (floating-point).`,
    );
  }

  if (samplesPerPixel < 1) {
    throw new DecoderError(
      'TIFF',
      `Unsupported samples per pixel: ${samplesPerPixel}. At least 1 sample per pixel is required.`,
    );
  }

  const block: BlockFormat = {
    bitsPerSample,
    samplesPerPixel,
    compression,
    predictor,
    le,
    writePixel,
  };

  const metadata: Record<string, unknown> = {
    format: 'tiff',
    bitsPerSample,
    sampleFormat: mode === 'float' ? 'float' : 'uint',
    compression,
    bigEndian,
    originalChannels: samplesPerPixel,
    ...(photometric !== undefined ? { photometric } : {}),
  };
  const colorSpace: TIFFDecodeResult['colorSpace'] = mode === 'float' ? 'linear' : 'srgb';

  // Detect tiled vs strip layout
  const tileWidth = getTagSingleValue(view, tags, TAG_TILE_WIDTH, le, 0);
  const tileLength = getTagSingleValue(view, tags, TAG_TILE_LENGTH, le, 0);
  const tileOffsets = getTagMultipleValues(view, tags, TAG_TILE_OFFSETS, le);
  const tileByteCounts = getTagMultipleValues(view, tags, TAG_TILE_BYTE_COUNTS, le);

  const isTiled = tileWidth > 0 && tileLength > 0 && tileOffsets.length > 0;

  const outputData = new Float32Array(width * height * 4); // Always RGBA
  // Initialize alpha to 1.0; writers overwrite it when the file has alpha.
  for (let i = 3; i < outputData.length; i += 4) {
    outputData[i] = 1.0;
  }

  if (isTiled) {
    await decodeTiles(
      buffer,
      view,
      block,
      outputData,
      width,
      height,
      tileWidth,
      tileLength,
      tileOffsets,
      tileByteCounts,
    );
    return {
      width,
      height,
      data: outputData,
      channels: 4,
      colorSpace,
      metadata: { ...metadata, tiled: true, tileWidth, tileLength },
    };
  }

  // Read strip offsets and byte counts
  const stripOffsets = getTagMultipleValues(view, tags, TAG_STRIP_OFFSETS, le);
  const stripByteCounts = getTagMultipleValues(view, tags, TAG_STRIP_BYTE_COUNTS, le);

  if (stripOffsets.length === 0) {
    throw new DecoderError('TIFF', 'Invalid TIFF: no strip offsets and no tile offsets found');
  }

  let currentRow = 0;
  for (let stripIdx = 0; stripIdx < stripOffsets.length && currentRow < height; stripIdx++) {
    const stripRows = Math.min(rowsPerStrip, height - currentRow);
    await decodeBlock(buffer, view, block, outputData, width, {
      offset: stripOffsets[stripIdx] ?? 0,
      byteCount: stripByteCounts[stripIdx],
      blockWidth: width,
      blockRows: stripRows,
      outX: 0,
      outY: currentRow,
      copyWidth: width,
      copyRows: stripRows,
    });
    currentRow += stripRows;
  }

  return {
    width,
    height,
    data: outputData,
    channels: 4,
    colorSpace,
    metadata,
  };
}

/** Per-image values shared by every strip or tile. */
interface BlockFormat {
  bitsPerSample: number;
  samplesPerPixel: number;
  compression: number;
  predictor: number;
  le: boolean;
  writePixel: PixelWriter;
}

/** Where one strip or tile sits in the file and in the output image. */
interface BlockPlacement {
  offset: number;
  /** Stored byte count; undefined when the file omits it. */
  byteCount: number | undefined;
  /** Stored row width in pixels (tile width for tiles, image width for strips). */
  blockWidth: number;
  /** Stored row count (full tile length for tiles). */
  blockRows: number;
  outX: number;
  outY: number;
  /** Pixels per row that land inside the image (edge tiles are partial). */
  copyWidth: number;
  copyRows: number;
}

/**
 * Decode one strip or tile into the RGBA output.
 */
async function decodeBlock(
  buffer: ArrayBuffer,
  view: DataView,
  fmt: BlockFormat,
  outputData: Float32Array,
  imageWidth: number,
  p: BlockPlacement,
): Promise<void> {
  const { bitsPerSample, samplesPerPixel, compression, predictor, le, writePixel } = fmt;
  const subByte = bitsPerSample < 8;
  const bytesPerPixel = samplesPerPixel * storedBytesPerSample(bitsPerSample);
  const packedRowBytes = Math.ceil((p.blockWidth * samplesPerPixel * bitsPerSample) / 8);
  const expectedBytes = packedRowBytes * p.blockRows;
  const byteCount = p.byteCount ?? expectedBytes;

  let src: DataView;
  let base: number;
  let srcLength: number;

  if (compression === COMPRESSION_NONE && predictor === PREDICTOR_NONE && !subByte) {
    // Uncompressed: read straight from the file buffer
    src = view;
    base = p.offset;
    srcLength = Math.min(buffer.byteLength, p.offset + byteCount);
  } else {
    // Compressed path — validate buffer bounds
    if (p.offset + byteCount > buffer.byteLength) {
      return; // Skip truncated block
    }
    let data = await decompressBlock(new Uint8Array(buffer, p.offset, byteCount), compression, expectedBytes);
    if (predictor !== PREDICTOR_NONE && !subByte) {
      data = applyPredictor(data, predictor, p.blockWidth, samplesPerPixel, bitsPerSample / 8, p.blockRows, le);
    }
    if (subByte) {
      data = unpackSubByteRows(data, bitsPerSample, p.blockWidth * samplesPerPixel, p.blockRows);
    }
    src = new DataView(data.buffer, data.byteOffset, data.byteLength);
    base = 0;
    srcLength = data.byteLength;
  }

  for (let y = 0; y < p.copyRows; y++) {
    for (let x = 0; x < p.copyWidth; x++) {
      const srcByteOffset = base + (y * p.blockWidth + x) * bytesPerPixel;
      if (srcByteOffset + bytesPerPixel > srcLength) return;
      const outputIdx = ((p.outY + y) * imageWidth + p.outX + x) * 4;
      writePixel(src, srcByteOffset, outputData, outputIdx);
    }
  }
}

/**
 * Decode a tiled TIFF.
 *
 * Tiles are stored left-to-right, top-to-bottom in the tile offset array.
 * Every tile is stored full-size, so partial tiles at the right and bottom
 * edges only copy the pixels that land inside the image.
 */
async function decodeTiles(
  buffer: ArrayBuffer,
  view: DataView,
  fmt: BlockFormat,
  outputData: Float32Array,
  width: number,
  height: number,
  tileWidth: number,
  tileLength: number,
  tileOffsets: number[],
  tileByteCounts: number[],
): Promise<void> {
  const tilesAcross = Math.ceil(width / tileWidth);
  const tilesDown = Math.ceil(height / tileLength);

  for (let tileRow = 0; tileRow < tilesDown; tileRow++) {
    for (let tileCol = 0; tileCol < tilesAcross; tileCol++) {
      const tileIdx = tileRow * tilesAcross + tileCol;
      if (tileIdx >= tileOffsets.length) return;

      const copyWidth = Math.min(tileWidth, width - tileCol * tileWidth);
      const copyRows = Math.min(tileLength, height - tileRow * tileLength);
      if (copyWidth <= 0 || copyRows <= 0) continue;

      await decodeBlock(buffer, view, fmt, outputData, width, {
        offset: tileOffsets[tileIdx] ?? 0,
        byteCount: tileByteCounts[tileIdx],
        blockWidth: tileWidth,
        blockRows: tileLength,
        outX: tileCol * tileWidth,
        outY: tileRow * tileLength,
        copyWidth,
        copyRows,
      });
    }
  }
}
