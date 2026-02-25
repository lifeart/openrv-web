/**
 * TIFF Float Image Format Decoder
 *
 * Supports:
 * - 32-bit IEEE float pixel data
 * - RGB and RGBA images
 * - Big-endian and little-endian byte order
 * - Uncompressed (1), LZW (5), and Deflate/ZIP (8, 32946) compression
 * - Horizontal differencing predictor (2) and floating-point predictor (3)
 * - Strip-based image organization
 * - Tiled image organization (TileWidth, TileLength, TileOffsets, TileByteCounts)
 *
 * Not yet supported:
 * - Non-float sample formats
 *
 * Based on TIFF 6.0 specification.
 */

import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';

// TIFF byte order marks
const TIFF_LE = 0x4949; // "II" - Intel byte order (little-endian)
const TIFF_BE = 0x4d4d; // "MM" - Motorola byte order (big-endian)
const TIFF_MAGIC = 42;

// TIFF Tag IDs
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
// TAG_PHOTOMETRIC (262) is used for writing but not needed for decode
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_TILE_WIDTH = 322;
const TAG_TILE_LENGTH = 323;
const TAG_TILE_OFFSETS = 324;
const TAG_TILE_BYTE_COUNTS = 325;
const TAG_SAMPLE_FORMAT = 339;

// Sample format values
const SAMPLE_FORMAT_UINT = 1;
const SAMPLE_FORMAT_INT = 2;
const SAMPLE_FORMAT_FLOAT = 3;

// Compression values
const COMPRESSION_NONE = 1;
const COMPRESSION_LZW = 5;
const COMPRESSION_DEFLATE = 8;
const COMPRESSION_ADOBE_DEFLATE = 32946;

const TAG_PREDICTOR = 317;

const PREDICTOR_NONE = 1;
const PREDICTOR_HORIZONTAL = 2;
const PREDICTOR_FLOATING_POINT = 3;

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
  colorSpace: 'linear';
  metadata: Record<string, unknown>;
}

interface TIFFTag {
  id: number;
  type: number;
  count: number;
  valueOffset: number;
}

/**
 * Check if a buffer contains a TIFF file by checking magic number
 */
export function isTIFFFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) {
    return false;
  }
  const view = new DataView(buffer);
  const byteOrder = view.getUint16(0, false);
  if (byteOrder !== TIFF_LE && byteOrder !== TIFF_BE) {
    return false;
  }
  const le = byteOrder === TIFF_LE;
  const magic = view.getUint16(2, le);
  return magic === TIFF_MAGIC;
}

/**
 * Check if a TIFF file contains float data
 */
export function isFloatTIFF(buffer: ArrayBuffer): boolean {
  const info = getTIFFInfo(buffer);
  if (!info) return false;
  return info.sampleFormat === 'float' && info.bitsPerSample === 32;
}

/**
 * Parse IFD (Image File Directory) tags
 */
function parseIFD(
  view: DataView,
  ifdOffset: number,
  le: boolean
): Map<number, TIFFTag> {
  const tags = new Map<number, TIFFTag>();

  if (ifdOffset + 2 > view.byteLength) return tags;

  const numEntries = view.getUint16(ifdOffset, le);
  let pos = ifdOffset + 2;

  for (let i = 0; i < numEntries; i++) {
    if (pos + 12 > view.byteLength) break;

    const id = view.getUint16(pos, le);
    const type = view.getUint16(pos + 2, le);
    const count = view.getUint32(pos + 4, le);

    const typeSize = getTypeSize(type);
    const totalSize = typeSize * count;

    // If value fits in 4 bytes, it's stored inline at pos+8
    // Otherwise, pos+8 contains a pointer to the data
    const valueOffset = totalSize <= 4 ? pos + 8 : view.getUint32(pos + 8, le);

    tags.set(id, { id, type, count, valueOffset });

    pos += 12;
  }

  return tags;
}

/**
 * Get the byte size of a TIFF data type
 */
function getTypeSize(type: number): number {
  switch (type) {
    case 1: return 1; // BYTE
    case 2: return 1; // ASCII
    case 3: return 2; // SHORT
    case 4: return 4; // LONG
    case 5: return 8; // RATIONAL
    default: return 1;
  }
}

/**
 * Read a tag value that may be inline or at an offset
 */
function getTagSingleValue(
  view: DataView,
  tags: Map<number, TIFFTag>,
  tagId: number,
  le: boolean,
  defaultValue: number
): number {
  const tag = tags.get(tagId);
  if (!tag) return defaultValue;

  const typeSize = getTypeSize(tag.type);
  const totalSize = typeSize * tag.count;

  if (totalSize <= 4) {
    // Inline value
    if (tag.type === 3) {
      return view.getUint16(tag.valueOffset, le);
    }
    if (tag.type === 4) {
      return view.getUint32(tag.valueOffset, le);
    }
    return view.getUint8(tag.valueOffset);
  }

  // Value at offset
  if (tag.type === 3) {
    return view.getUint16(tag.valueOffset, le);
  }
  if (tag.type === 4) {
    return view.getUint32(tag.valueOffset, le);
  }
  return defaultValue;
}

/**
 * Read multiple values from a tag
 */
function getTagMultipleValues(
  view: DataView,
  tags: Map<number, TIFFTag>,
  tagId: number,
  le: boolean
): number[] {
  const tag = tags.get(tagId);
  if (!tag) return [];

  const typeSize = getTypeSize(tag.type);
  const totalSize = typeSize * tag.count;
  const values: number[] = [];

  if (tag.count === 1 && totalSize <= 4) {
    // Single inline value
    if (tag.type === 3) {
      values.push(view.getUint16(tag.valueOffset, le));
    } else if (tag.type === 4) {
      values.push(view.getUint32(tag.valueOffset, le));
    }
    return values;
  }

  // For inline values (count=2 shorts)
  if (totalSize <= 4) {
    for (let i = 0; i < tag.count; i++) {
      if (tag.type === 3) {
        values.push(view.getUint16(tag.valueOffset + i * 2, le));
      } else if (tag.type === 4) {
        values.push(view.getUint32(tag.valueOffset + i * 4, le));
      }
    }
    return values;
  }

  // Values at offset
  const offset = tag.valueOffset;
  for (let i = 0; i < tag.count; i++) {
    if (tag.type === 3) {
      if (offset + i * 2 + 2 <= view.byteLength) {
        values.push(view.getUint16(offset + i * 2, le));
      }
    } else if (tag.type === 4) {
      if (offset + i * 4 + 4 <= view.byteLength) {
        values.push(view.getUint32(offset + i * 4, le));
      }
    }
  }

  return values;
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

  // Output buffer - grow as needed
  const output: number[] = [];

  // LZW table: prefix chain + suffix byte
  // Using typed arrays for performance
  const tablePrefix = new Int32Array(4096);
  const tableSuffix = new Uint8Array(4096);
  const tableLength = new Uint16Array(4096); // length of string for each code

  let codeSize = 9;
  let nextCode = 258;
  let oldCode = -1;

  // Bit reader state (MSB-first for TIFF)
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let bytePos = 0;

  function readCode(): number {
    while (bitsInBuffer < codeSize) {
      if (bytePos >= compressed.length) return EOI_CODE;
      bitBuffer = (bitBuffer << 8) | compressed[bytePos++]!;
      bitsInBuffer += 8;
    }
    bitsInBuffer -= codeSize;
    const code = (bitBuffer >> bitsInBuffer) & ((1 << codeSize) - 1);
    return code;
  }

  // Helper to output the string for a code
  function outputString(code: number): void {
    if (code < 256) {
      output.push(code);
      return;
    }
    // Build string by following prefix chain (in reverse), then output
    const len = tableLength[code]!;
    const startIdx = output.length;
    // Extend output array
    output.length += len;
    let c = code;
    let idx = startIdx + len - 1;
    while (c >= 256) {
      output[idx--] = tableSuffix[c]!;
      c = tablePrefix[c]!;
    }
    output[idx] = c; // first character
  }

  function firstChar(code: number): number {
    let c = code;
    while (c >= 256) {
      c = tablePrefix[c]!;
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
        tableLength[nextCode] = (oldCode < 256 ? 1 : tableLength[oldCode]!) + 1;
        nextCode++;
      }
    } else {
      // code === nextCode (special case)
      const fc = firstChar(oldCode);

      // Add new entry first
      if (nextCode <= MAX_CODE) {
        tablePrefix[nextCode] = oldCode;
        tableSuffix[nextCode] = fc;
        tableLength[nextCode] = (oldCode < 256 ? 1 : tableLength[oldCode]!) + 1;
        nextCode++;
      }

      // Output the new entry
      outputString(code);
    }

    // Increase code size when needed
    if (nextCode > (1 << codeSize) - 1 && codeSize < 12) {
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
 * Apply TIFF predictor reconstruction to decompressed strip data.
 *
 * Predictor 2 (horizontal differencing): Each byte after the first in a row
 * is stored as the difference from the previous byte, with a stride equal
 * to samplesPerPixel * bytesPerSample.
 *
 * Predictor 3 (floating-point): Bytes are first delta-decoded (stride 1),
 * then un-rearranged from planar (all first bytes, all second bytes, ...)
 * to interleaved byte order.
 */
function applyPredictor(
  data: Uint8Array,
  predictor: number,
  width: number,
  samplesPerPixel: number,
  bytesPerSample: number,
  rowCount: number,
): Uint8Array {
  if (predictor === PREDICTOR_NONE) return data;

  const result = new Uint8Array(data.length);
  const rowBytes = width * samplesPerPixel * bytesPerSample;

  if (predictor === PREDICTOR_HORIZONTAL) {
    // Horizontal differencing: undo byte-level delta with stride = samplesPerPixel * bytesPerSample
    const stride = samplesPerPixel * bytesPerSample;
    for (let row = 0; row < rowCount; row++) {
      const rowStart = row * rowBytes;
      // First pixel's bytes are stored directly
      for (let i = 0; i < stride && rowStart + i < data.length; i++) {
        result[rowStart + i] = data[rowStart + i]!;
      }
      // Subsequent bytes: accumulate
      for (let i = stride; i < rowBytes && rowStart + i < data.length; i++) {
        result[rowStart + i] = (result[rowStart + i - stride]! + data[rowStart + i]!) & 0xff;
      }
    }
    return result;
  }

  if (predictor === PREDICTOR_FLOATING_POINT) {
    // Floating-point predictor: undo byte-level delta (stride 1), then un-rearrange
    const temp = new Uint8Array(data.length);

    for (let row = 0; row < rowCount; row++) {
      const rowStart = row * rowBytes;
      // Step 1: undo byte-level delta (stride 1)
      temp[rowStart] = data[rowStart]!;
      for (let i = 1; i < rowBytes && rowStart + i < data.length; i++) {
        temp[rowStart + i] = (temp[rowStart + i - 1]! + data[rowStart + i]!) & 0xff;
      }

      // Step 2: un-rearrange from planar to interleaved
      // The data is arranged as: all first bytes of each sample, all second bytes, etc.
      // We need to reconstruct interleaved float bytes
      const pixelCount = width * samplesPerPixel;
      for (let i = 0; i < pixelCount && i * bytesPerSample < rowBytes; i++) {
        for (let b = 0; b < bytesPerSample; b++) {
          const srcIdx = rowStart + b * pixelCount + i;
          const dstIdx = rowStart + i * bytesPerSample + b;
          if (srcIdx < temp.length && dstIdx < result.length) {
            result[dstIdx] = temp[srcIdx]!;
          }
        }
      }
    }
    return result;
  }

  throw new DecoderError('TIFF', `Unsupported TIFF predictor: ${predictor}. Supported: 1 (none), 2 (horizontal), 3 (floating-point).`);
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
export async function decodeTIFFFloat(buffer: ArrayBuffer): Promise<TIFFDecodeResult> {
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
  const bitsPerSample = getTagSingleValue(view, tags, TAG_BITS_PER_SAMPLE, le, 8);
  const compression = getTagSingleValue(view, tags, TAG_COMPRESSION, le, 1);
  const samplesPerPixel = getTagSingleValue(view, tags, TAG_SAMPLES_PER_PIXEL, le, 1);
  const rowsPerStrip = getTagSingleValue(view, tags, TAG_ROWS_PER_STRIP, le, height);
  const sampleFormatValue = getTagSingleValue(view, tags, TAG_SAMPLE_FORMAT, le, SAMPLE_FORMAT_UINT);
  const predictor = getTagSingleValue(view, tags, TAG_PREDICTOR, le, PREDICTOR_NONE);

  // Validate dimensions
  validateImageDimensions(width, height, 'TIFF');

  if (sampleFormatValue !== SAMPLE_FORMAT_FLOAT) {
    throw new DecoderError('TIFF', `Not a float TIFF: sample format is ${sampleFormatValue}, expected ${SAMPLE_FORMAT_FLOAT} (IEEE float)`);
  }

  if (bitsPerSample !== 32) {
    throw new DecoderError('TIFF', `Unsupported bits per sample: ${bitsPerSample}. Only 32-bit float is supported.`);
  }

  const supportedCompressions = [COMPRESSION_NONE, COMPRESSION_LZW, COMPRESSION_DEFLATE, COMPRESSION_ADOBE_DEFLATE];
  if (!supportedCompressions.includes(compression)) {
    throw new DecoderError('TIFF', `Unsupported TIFF compression: ${compression}. Supported: uncompressed (1), LZW (5), Deflate (8, 32946).`);
  }

  if (predictor !== PREDICTOR_NONE && predictor !== PREDICTOR_HORIZONTAL && predictor !== PREDICTOR_FLOATING_POINT) {
    throw new DecoderError('TIFF', `Unsupported TIFF predictor: ${predictor}. Supported: 1 (none), 2 (horizontal), 3 (floating-point).`);
  }

  if (samplesPerPixel < 3 || samplesPerPixel > 4) {
    throw new DecoderError('TIFF', `Unsupported samples per pixel: ${samplesPerPixel}. Only 3 (RGB) or 4 (RGBA) are supported.`);
  }

  // Detect tiled vs strip layout
  const tileWidth = getTagSingleValue(view, tags, TAG_TILE_WIDTH, le, 0);
  const tileLength = getTagSingleValue(view, tags, TAG_TILE_LENGTH, le, 0);
  const tileOffsets = getTagMultipleValues(view, tags, TAG_TILE_OFFSETS, le);
  const tileByteCounts = getTagMultipleValues(view, tags, TAG_TILE_BYTE_COUNTS, le);

  const isTiled = tileWidth > 0 && tileLength > 0 && tileOffsets.length > 0;

  if (isTiled) {
    return decodeTiledTIFF(
      buffer, view, le, width, height, tileWidth, tileLength,
      tileOffsets, tileByteCounts, samplesPerPixel, compression, predictor,
      bitsPerSample, bigEndian
    );
  }

  // Read strip offsets and byte counts
  const stripOffsets = getTagMultipleValues(view, tags, TAG_STRIP_OFFSETS, le);
  const stripByteCounts = getTagMultipleValues(view, tags, TAG_STRIP_BYTE_COUNTS, le);

  if (stripOffsets.length === 0) {
    throw new DecoderError('TIFF', 'Invalid TIFF: no strip offsets and no tile offsets found');
  }

  // Read float data from strips
  const totalPixels = width * height;
  const outputData = new Float32Array(totalPixels * 4); // Always RGBA

  // Initialize alpha to 1.0 if RGB input
  if (samplesPerPixel === 3) {
    for (let i = 3; i < outputData.length; i += 4) {
      outputData[i] = 1.0;
    }
  }

  let currentRow = 0;
  const bytesPerPixel = samplesPerPixel * 4; // float32

  for (let stripIdx = 0; stripIdx < stripOffsets.length; stripIdx++) {
    const stripOffset = stripOffsets[stripIdx]!;
    const stripRows = Math.min(rowsPerStrip, height - currentRow);
    const stripPixels = stripRows * width;

    const expectedStripBytes = stripPixels * bytesPerPixel;
    const stripByteCount = stripByteCounts[stripIdx] ?? expectedStripBytes;

    if (compression === COMPRESSION_NONE) {
      // Uncompressed path (original logic)
      const maxPixelsInStrip = Math.floor(stripByteCount / bytesPerPixel);
      const pixelsToRead = Math.min(stripPixels, maxPixelsInStrip);

      for (let p = 0; p < pixelsToRead; p++) {
        const srcByteOffset = stripOffset + p * bytesPerPixel;
        const row = currentRow + Math.floor(p / width);
        const col = p % width;
        const outputIdx = (row * width + col) * 4;

        if (srcByteOffset + bytesPerPixel > buffer.byteLength) break;

        for (let c = 0; c < samplesPerPixel && c < 4; c++) {
          outputData[outputIdx + c] = view.getFloat32(srcByteOffset + c * 4, le);
        }

        if (samplesPerPixel === 3) {
          outputData[outputIdx + 3] = 1.0;
        }
      }
    } else {
      // Compressed path — validate buffer bounds
      if (stripOffset + stripByteCount > buffer.byteLength) {
        continue; // Skip truncated strip
      }
      const compressedBytes = new Uint8Array(buffer, stripOffset, stripByteCount);

      let decompressed: Uint8Array;
      if (compression === COMPRESSION_LZW) {
        decompressed = decompressLZW(compressedBytes);
      } else {
        // Deflate or Adobe Deflate
        decompressed = await decompressDeflate(compressedBytes);
      }

      // Apply predictor if needed
      if (predictor !== PREDICTOR_NONE) {
        decompressed = applyPredictor(decompressed, predictor, width, samplesPerPixel, 4, stripRows);
      }

      // Parse floats from decompressed data
      const stripView = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
      const maxPixelsInStrip = Math.floor(decompressed.length / bytesPerPixel);
      const pixelsToRead = Math.min(stripPixels, maxPixelsInStrip);

      for (let p = 0; p < pixelsToRead; p++) {
        const srcByteOffset = p * bytesPerPixel;
        const row = currentRow + Math.floor(p / width);
        const col = p % width;
        const outputIdx = (row * width + col) * 4;

        if (srcByteOffset + bytesPerPixel > decompressed.length) break;

        for (let c = 0; c < samplesPerPixel && c < 4; c++) {
          outputData[outputIdx + c] = stripView.getFloat32(srcByteOffset + c * 4, le);
        }

        if (samplesPerPixel === 3) {
          outputData[outputIdx + 3] = 1.0;
        }
      }
    }

    currentRow += stripRows;
  }

  return {
    width,
    height,
    data: outputData,
    channels: 4,
    colorSpace: 'linear',
    metadata: {
      format: 'tiff',
      bitsPerSample,
      sampleFormat: 'float',
      compression,
      bigEndian,
      originalChannels: samplesPerPixel,
    },
  };
}

/**
 * Decode a tiled float TIFF file.
 *
 * Tiles are stored left-to-right, top-to-bottom in the tile offset array.
 * Partial tiles at the right and bottom edges are handled by clamping the
 * number of pixels read from those tiles.
 */
async function decodeTiledTIFF(
  buffer: ArrayBuffer,
  view: DataView,
  le: boolean,
  width: number,
  height: number,
  tileWidth: number,
  tileLength: number,
  tileOffsets: number[],
  tileByteCounts: number[],
  samplesPerPixel: number,
  compression: number,
  predictor: number,
  bitsPerSample: number,
  bigEndian: boolean,
): Promise<TIFFDecodeResult> {
  const totalPixels = width * height;
  const outputData = new Float32Array(totalPixels * 4); // Always RGBA
  const bytesPerPixel = samplesPerPixel * 4; // float32

  // Initialize alpha to 1.0 if RGB input
  if (samplesPerPixel === 3) {
    for (let i = 3; i < outputData.length; i += 4) {
      outputData[i] = 1.0;
    }
  }

  // Calculate tile grid dimensions
  const tilesAcross = Math.ceil(width / tileWidth);
  const tilesDown = Math.ceil(height / tileLength);

  // Iterate over tiles (left-to-right, top-to-bottom)
  for (let tileRow = 0; tileRow < tilesDown; tileRow++) {
    for (let tileCol = 0; tileCol < tilesAcross; tileCol++) {
      const tileIdx = tileRow * tilesAcross + tileCol;

      if (tileIdx >= tileOffsets.length) break;

      const tileOffset = tileOffsets[tileIdx]!;

      // Actual pixel dimensions of this tile (handle partial tiles at edges)
      const actualTileW = Math.min(tileWidth, width - tileCol * tileWidth);
      const actualTileH = Math.min(tileLength, height - tileRow * tileLength);

      if (actualTileW <= 0 || actualTileH <= 0) continue;

      // The tile data size in bytes (full tile, even for partial edge tiles -
      // TIFF spec requires all tiles to be full-sized in the file, but we
      // only read pixels that map to the image)
      const expectedTileBytes = tileWidth * tileLength * bytesPerPixel;
      const tileByteCount = tileByteCounts[tileIdx] ?? expectedTileBytes;

      if (compression === COMPRESSION_NONE) {
        // Uncompressed tiles
        // Note: data in file is stored as tileWidth * tileLength even for partial tiles
        for (let ty = 0; ty < actualTileH; ty++) {
          for (let tx = 0; tx < actualTileW; tx++) {
            // Source position within the full tile
            const srcByteOffset = tileOffset + (ty * tileWidth + tx) * bytesPerPixel;

            // Destination position in the output image
            const outX = tileCol * tileWidth + tx;
            const outY = tileRow * tileLength + ty;
            const outputIdx = (outY * width + outX) * 4;

            if (srcByteOffset + bytesPerPixel > buffer.byteLength) continue;

            for (let c = 0; c < samplesPerPixel && c < 4; c++) {
              outputData[outputIdx + c] = view.getFloat32(srcByteOffset + c * 4, le);
            }

            if (samplesPerPixel === 3) {
              outputData[outputIdx + 3] = 1.0;
            }
          }
        }
      } else {
        // Compressed tiles — validate buffer bounds
        if (tileOffset + tileByteCount > buffer.byteLength) {
          continue; // Skip truncated tile
        }
        const compressedBytes = new Uint8Array(buffer, tileOffset, tileByteCount);

        let decompressed: Uint8Array;
        if (compression === COMPRESSION_LZW) {
          decompressed = decompressLZW(compressedBytes);
        } else {
          // Deflate or Adobe Deflate
          decompressed = await decompressDeflate(compressedBytes);
        }

        // Apply predictor if needed
        // For predictors, we use tileWidth as the row width and tileLength as the row count,
        // since the tile data is stored as a full-sized tile
        if (predictor !== PREDICTOR_NONE) {
          decompressed = applyPredictor(decompressed, predictor, tileWidth, samplesPerPixel, 4, tileLength);
        }

        const tileView = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);

        for (let ty = 0; ty < actualTileH; ty++) {
          for (let tx = 0; tx < actualTileW; tx++) {
            // Source position within the full (decompressed) tile
            const srcByteOffset = (ty * tileWidth + tx) * bytesPerPixel;

            const outX = tileCol * tileWidth + tx;
            const outY = tileRow * tileLength + ty;
            const outputIdx = (outY * width + outX) * 4;

            if (srcByteOffset + bytesPerPixel > decompressed.length) continue;

            for (let c = 0; c < samplesPerPixel && c < 4; c++) {
              outputData[outputIdx + c] = tileView.getFloat32(srcByteOffset + c * 4, le);
            }

            if (samplesPerPixel === 3) {
              outputData[outputIdx + 3] = 1.0;
            }
          }
        }
      }
    }
  }

  return {
    width,
    height,
    data: outputData,
    channels: 4,
    colorSpace: 'linear',
    metadata: {
      format: 'tiff',
      bitsPerSample,
      sampleFormat: 'float',
      compression,
      bigEndian,
      originalChannels: samplesPerPixel,
      tiled: true,
      tileWidth,
      tileLength,
    },
  };
}
