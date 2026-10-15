/**
 * TIFF container parsing shared by the TIFF decoder and the decoder
 * registry's format detection: header and IFD tag reading, and the checks
 * that decide whether the first image is one we decode.
 *
 * Kept free of the decompressors so the registry can import it without
 * pulling the full decoder into the initial bundle.
 */

import { DecoderError } from '../core/errors';

// TIFF byte order marks
export const TIFF_LE = 0x4949; // "II" - Intel byte order (little-endian)
export const TIFF_BE = 0x4d4d; // "MM" - Motorola byte order (big-endian)
export const TIFF_MAGIC = 42;

// TIFF Tag IDs
export const TAG_IMAGE_WIDTH = 256;
export const TAG_IMAGE_LENGTH = 257;
export const TAG_BITS_PER_SAMPLE = 258;
export const TAG_COMPRESSION = 259;
export const TAG_STRIP_OFFSETS = 273;
export const TAG_SAMPLES_PER_PIXEL = 277;
export const TAG_ROWS_PER_STRIP = 278;
export const TAG_STRIP_BYTE_COUNTS = 279;
export const TAG_TILE_WIDTH = 322;
export const TAG_TILE_LENGTH = 323;
export const TAG_TILE_OFFSETS = 324;
export const TAG_TILE_BYTE_COUNTS = 325;
export const TAG_SAMPLE_FORMAT = 339;
export const TAG_PHOTOMETRIC = 262;
export const TAG_PLANAR_CONFIGURATION = 284;
export const TAG_COLOR_MAP = 320;
export const TAG_NEW_SUBFILE_TYPE = 254;
export const TAG_DNG_VERSION = 50706;

// Photometric interpretation values
export const PHOTOMETRIC_WHITE_IS_ZERO = 0;
export const PHOTOMETRIC_BLACK_IS_ZERO = 1;
export const PHOTOMETRIC_RGB = 2;
export const PHOTOMETRIC_PALETTE = 3;

// PlanarConfiguration: 1 = chunky (interleaved samples)
export const PLANAR_CHUNKY = 1;

// Sample format values
export const SAMPLE_FORMAT_UINT = 1;
export const SAMPLE_FORMAT_INT = 2;
export const SAMPLE_FORMAT_FLOAT = 3;

// Compression values
export const COMPRESSION_NONE = 1;
export const COMPRESSION_LZW = 5;
export const COMPRESSION_DEFLATE = 8;
export const COMPRESSION_JPEG = 7;
export const COMPRESSION_ADOBE_DEFLATE = 32946;
export const COMPRESSION_PACKBITS = 32773;

export const SUPPORTED_COMPRESSIONS = [
  COMPRESSION_NONE,
  COMPRESSION_LZW,
  COMPRESSION_DEFLATE,
  COMPRESSION_ADOBE_DEFLATE,
  COMPRESSION_PACKBITS,
];

/** Human-readable names for known TIFF compression codes */
export const COMPRESSION_NAMES: Record<number, string> = {
  [COMPRESSION_NONE]: 'Uncompressed',
  2: 'CCITT Group 3',
  3: 'CCITT T.4',
  4: 'CCITT T.6',
  [COMPRESSION_LZW]: 'LZW',
  [COMPRESSION_JPEG]: 'JPEG',
  [COMPRESSION_DEFLATE]: 'Deflate',
  [COMPRESSION_PACKBITS]: 'PackBits',
  [COMPRESSION_ADOBE_DEFLATE]: 'Adobe Deflate',
};

export const TAG_PREDICTOR = 317;

export const PREDICTOR_NONE = 1;
export const PREDICTOR_HORIZONTAL = 2;
export const PREDICTOR_FLOATING_POINT = 3;

/**
 * Maximum number of IFD entries allowed per directory.
 *
 * The TIFF spec stores the entry count as a uint16 (max 65535), but real TIFF
 * files rarely exceed ~50 entries. A count near the uint16 maximum in a
 * malformed or malicious file would waste CPU iterating over bogus entries.
 * We cap at 1024, which is far above any legitimate TIFF while still
 * rejecting clearly unreasonable values.
 */
export const MAX_IFD_ENTRIES = 1024;

export interface TIFFTag {
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
 * Parse IFD (Image File Directory) tags
 */
export function parseIFD(view: DataView, ifdOffset: number, le: boolean): Map<number, TIFFTag> {
  const tags = new Map<number, TIFFTag>();

  if (ifdOffset + 2 > view.byteLength) return tags;

  const numEntries = view.getUint16(ifdOffset, le);

  if (numEntries > MAX_IFD_ENTRIES) {
    throw new DecoderError(
      'TIFF',
      `IFD entry count ${numEntries} exceeds maximum of ${MAX_IFD_ENTRIES}. File may be malformed.`,
    );
  }

  let pos = ifdOffset + 2;

  for (let i = 0; i < numEntries; i++) {
    if (pos + 12 > view.byteLength) break;

    const id = view.getUint16(pos, le);
    const type = view.getUint16(pos + 2, le);
    const count = view.getUint32(pos + 4, le);

    const typeSize = getTypeSize(type);

    // TIFF 6.0 Section 7: skip fields with unknown/unsupported type
    if (typeSize === 0) {
      pos += 12;
      continue;
    }

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
 * Get the byte size of a TIFF data type.
 * Covers all standard TIFF 6.0 types (1–12).
 * Returns 0 for unknown types so that callers can skip the entry
 * (TIFF 6.0 Section 7: "Readers should skip over fields containing
 * an unexpected field type.").
 */
export function getTypeSize(type: number): number {
  switch (type) {
    case 1:
      return 1; // BYTE
    case 2:
      return 1; // ASCII
    case 3:
      return 2; // SHORT
    case 4:
      return 4; // LONG
    case 5:
      return 8; // RATIONAL (two LONGs)
    case 6:
      return 1; // SBYTE
    case 7:
      return 1; // UNDEFINED
    case 8:
      return 2; // SSHORT
    case 9:
      return 4; // SLONG
    case 10:
      return 8; // SRATIONAL (two SLONGs)
    case 11:
      return 4; // FLOAT (IEEE 32-bit)
    case 12:
      return 8; // DOUBLE (IEEE 64-bit)
    default:
      return 0; // Unknown type — caller should skip this entry
  }
}

/**
 * Read a tag value that may be inline or at an offset
 */
export function getTagSingleValue(
  view: DataView,
  tags: Map<number, TIFFTag>,
  tagId: number,
  le: boolean,
  defaultValue: number,
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
export function getTagMultipleValues(view: DataView, tags: Map<number, TIFFTag>, tagId: number, le: boolean): number[] {
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

/** Validated layout of an integer TIFF's first image. */
export interface IntegerLayout {
  bitsPerSample: number;
  samplesPerPixel: number;
  photometric: number;
}

/**
 * Return the layout of an integer image in the first IFD, or null when the
 * IFD is not an integer image this decoder handles.
 */
export function describeIntegerLayout(view: DataView, tags: Map<number, TIFFTag>, le: boolean): IntegerLayout | null {
  if (tags.has(TAG_DNG_VERSION)) return null;
  if ((getTagSingleValue(view, tags, TAG_NEW_SUBFILE_TYPE, le, 0) & 1) !== 0) return null;
  if (getTagSingleValue(view, tags, TAG_SAMPLE_FORMAT, le, SAMPLE_FORMAT_UINT) !== SAMPLE_FORMAT_UINT) return null;
  if (getTagSingleValue(view, tags, TAG_PLANAR_CONFIGURATION, le, PLANAR_CHUNKY) !== PLANAR_CHUNKY) return null;
  if (!SUPPORTED_COMPRESSIONS.includes(getTagSingleValue(view, tags, TAG_COMPRESSION, le, COMPRESSION_NONE))) {
    return null;
  }

  const bitsPerSample = getTagSingleValue(view, tags, TAG_BITS_PER_SAMPLE, le, 1);
  const samplesPerPixel = getTagSingleValue(view, tags, TAG_SAMPLES_PER_PIXEL, le, 1);
  const photometric = getTagSingleValue(view, tags, TAG_PHOTOMETRIC, le, -1);
  if (samplesPerPixel < 1) return null;

  switch (photometric) {
    case PHOTOMETRIC_WHITE_IS_ZERO:
    case PHOTOMETRIC_BLACK_IS_ZERO:
      if (![1, 2, 4, 8, 16, 32].includes(bitsPerSample)) return null;
      break;
    case PHOTOMETRIC_RGB:
      if (samplesPerPixel < 3 || ![8, 16, 32].includes(bitsPerSample)) return null;
      break;
    case PHOTOMETRIC_PALETTE:
      if (![1, 2, 4, 8, 16].includes(bitsPerSample) || !tags.has(TAG_COLOR_MAP)) return null;
      break;
    default:
      // CMYK, YCbCr, CIELab and missing Photometric are not handled.
      return null;
  }
  return { bitsPerSample, samplesPerPixel, photometric };
}

/**
 * Check if a TIFF holds an integer image that {@link decodeTIFFInteger} can
 * decode, and that is the file's main picture.
 *
 * Camera RAW files are TIFF containers too. Their first IFD is either the
 * sensor data (12/14-bit or vendor compression, rejected by the bit-depth and
 * compression checks) or a reduced-resolution thumbnail (NewSubfileType bit 0,
 * or a DNGVersion tag). Those are left to the RAW preview decoder.
 */
export function isIntegerTIFF(buffer: ArrayBuffer): boolean {
  try {
    if (!isTIFFFile(buffer) || buffer.byteLength < 8) return false;
    const view = new DataView(buffer);
    const le = view.getUint16(0, false) === TIFF_LE;
    const ifdOffset = view.getUint32(4, le);
    if (ifdOffset + 2 > buffer.byteLength) return false;
    const tags = parseIFD(view, ifdOffset, le);
    return describeIntegerLayout(view, tags, le) !== null;
  } catch {
    return false;
  }
}
