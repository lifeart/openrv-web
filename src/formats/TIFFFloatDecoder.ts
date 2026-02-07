/**
 * TIFF Float Image Format Decoder
 *
 * Supports:
 * - 32-bit IEEE float pixel data
 * - RGB and RGBA images
 * - Big-endian and little-endian byte order
 * - Uncompressed data (compression=1)
 * - Strip-based image organization
 *
 * Not yet supported:
 * - LZW compression (5)
 * - Deflate/ZIP compression (8)
 * - Tiled TIFF images
 * - Non-float sample formats
 *
 * Based on TIFF 6.0 specification.
 */

import { validateImageDimensions } from './shared';

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
const TAG_SAMPLE_FORMAT = 339;

// Sample format values
const SAMPLE_FORMAT_UINT = 1;
const SAMPLE_FORMAT_INT = 2;
const SAMPLE_FORMAT_FLOAT = 3;

// Compression values
const COMPRESSION_NONE = 1;

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
    throw new Error('Invalid TIFF file: unrecognized byte order');
  }

  const le = !bigEndian;
  const magic = view.getUint16(2, le);
  if (magic !== TIFF_MAGIC) {
    throw new Error('Invalid TIFF file: wrong magic number');
  }

  // Read IFD offset
  const ifdOffset = view.getUint32(4, le);
  if (ifdOffset >= buffer.byteLength) {
    throw new Error('Invalid TIFF file: IFD offset out of range');
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

  // Validate dimensions
  validateImageDimensions(width, height, 'TIFF');

  if (sampleFormatValue !== SAMPLE_FORMAT_FLOAT) {
    throw new Error(`Not a float TIFF: sample format is ${sampleFormatValue}, expected ${SAMPLE_FORMAT_FLOAT} (IEEE float)`);
  }

  if (bitsPerSample !== 32) {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}. Only 32-bit float is supported.`);
  }

  if (compression !== COMPRESSION_NONE) {
    throw new Error(`Unsupported TIFF compression: ${compression}. Only uncompressed (1) is supported.`);
  }

  if (samplesPerPixel < 3 || samplesPerPixel > 4) {
    throw new Error(`Unsupported samples per pixel: ${samplesPerPixel}. Only 3 (RGB) or 4 (RGBA) are supported.`);
  }

  // Read strip offsets and byte counts
  const stripOffsets = getTagMultipleValues(view, tags, TAG_STRIP_OFFSETS, le);
  const stripByteCounts = getTagMultipleValues(view, tags, TAG_STRIP_BYTE_COUNTS, le);

  if (stripOffsets.length === 0) {
    throw new Error('Invalid TIFF: no strip offsets found');
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

    // Use StripByteCounts to bound reads, fall back to computed size
    const expectedStripBytes = stripPixels * bytesPerPixel;
    const stripByteCount = stripByteCounts[stripIdx] ?? expectedStripBytes;
    const maxPixelsInStrip = Math.floor(stripByteCount / bytesPerPixel);
    const pixelsToRead = Math.min(stripPixels, maxPixelsInStrip);

    // Read float values from strip
    for (let p = 0; p < pixelsToRead; p++) {
      const srcByteOffset = stripOffset + p * bytesPerPixel;

      // Calculate actual row and column
      const row = currentRow + Math.floor(p / width);
      const col = p % width;
      const outputIdx = (row * width + col) * 4;

      if (srcByteOffset + bytesPerPixel > buffer.byteLength) break;

      for (let c = 0; c < samplesPerPixel && c < 4; c++) {
        outputData[outputIdx + c] = view.getFloat32(srcByteOffset + c * 4, le);
      }

      // Set alpha to 1.0 if not present
      if (samplesPerPixel === 3) {
        outputData[outputIdx + 3] = 1.0;
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
