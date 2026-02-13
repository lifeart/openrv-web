/**
 * RAW Image Preview Decoder
 *
 * Extracts embedded JPEG previews from camera RAW formats (CR2, NEF, ARW, DNG, etc.).
 * These formats use TIFF as their container, embedding full-resolution JPEG previews
 * in IFD entries. We extract the largest embedded JPEG without decoding RAW sensor data.
 *
 * Supported formats: CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF, SRW
 */

import { isTIFFFile, isFloatTIFF } from './TIFFFloatDecoder';

// TIFF byte order marks
const TIFF_LE = 0x4949; // "II" - Intel byte order (little-endian)
const TIFF_BE = 0x4d4d; // "MM" - Motorola byte order (big-endian)

// TIFF Tag IDs used for RAW preview extraction
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_COMPRESSION = 259;
const TAG_MAKE = 271;
const TAG_MODEL = 272;
const TAG_STRIP_OFFSETS = 273;
const TAG_ORIENTATION = 274;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_SUB_IFDS = 330;
const TAG_DATE_TIME = 306;
const TAG_EXPOSURE_TIME = 33434;
const TAG_FNUMBER = 33437;
const TAG_ISO = 34855;
const TAG_FOCAL_LENGTH = 37386;
const TAG_JPEG_INTERCHANGE_FORMAT = 513;
const TAG_JPEG_INTERCHANGE_FORMAT_LENGTH = 514;

// JPEG compression values in TIFF
const COMPRESSION_JPEG_OLD = 6;
const COMPRESSION_JPEG = 7;

// JPEG SOI marker
const JPEG_SOI = 0xffd8;

// Maximum IFDs to visit (cycle/runaway guard)
const MAX_IFDS = 100;

// RAW file extensions
const RAW_EXTENSIONS = new Set([
  'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw',
]);

/**
 * EXIF metadata extracted from RAW file IFD0
 */
export interface RAWExifMetadata {
  make: string | null;
  model: string | null;
  iso: number | null;
  exposureTime: number | null;
  fNumber: number | null;
  focalLength: number | null;
  dateTime: string | null;
  orientation: number | null;
}

/**
 * Result of RAW preview extraction
 */
export interface RAWPreviewResult {
  jpegBlob: Blob;
  exif: RAWExifMetadata;
  previewWidth: number;
  previewHeight: number;
}

interface TIFFTag {
  id: number;
  type: number;
  count: number;
  valueOffset: number;
}

interface JPEGCandidate {
  offset: number;
  length: number;
  width: number;
  height: number;
}

/**
 * Get the byte size of a TIFF data type
 */
function getTypeSize(type: number): number {
  switch (type) {
    case 1: return 1;  // BYTE
    case 2: return 1;  // ASCII
    case 3: return 2;  // SHORT
    case 4: return 4;  // LONG
    case 5: return 8;  // RATIONAL (two LONGs)
    case 7: return 1;  // UNDEFINED
    default: return 1;
  }
}

/**
 * Parse IFD tags from a TIFF DataView at the given offset
 */
function parseIFDTags(
  view: DataView,
  ifdOffset: number,
  le: boolean
): { tags: Map<number, TIFFTag>; nextIFDOffset: number } {
  const tags = new Map<number, TIFFTag>();

  if (ifdOffset + 2 > view.byteLength) {
    return { tags, nextIFDOffset: 0 };
  }

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

  // Next IFD offset follows the tag entries
  const nextOffset = pos;
  const nextIFDOffset = nextOffset + 4 <= view.byteLength
    ? view.getUint32(nextOffset, le)
    : 0;

  return { tags, nextIFDOffset };
}

/**
 * Read a single numeric value from a tag
 */
function getTagValue(
  view: DataView,
  tags: Map<number, TIFFTag>,
  tagId: number,
  le: boolean,
  defaultValue: number
): number {
  const tag = tags.get(tagId);
  if (!tag) return defaultValue;

  if (tag.valueOffset + 2 > view.byteLength) return defaultValue;

  if (tag.type === 3) { // SHORT
    return view.getUint16(tag.valueOffset, le);
  }
  if (tag.type === 4) { // LONG
    if (tag.valueOffset + 4 > view.byteLength) return defaultValue;
    return view.getUint32(tag.valueOffset, le);
  }
  if (tag.type === 1) { // BYTE
    return view.getUint8(tag.valueOffset);
  }
  return defaultValue;
}

/**
 * Read multiple LONG/SHORT values from a tag
 */
function getTagValues(
  view: DataView,
  tag: TIFFTag,
  le: boolean
): number[] {
  const values: number[] = [];

  // valueOffset is already resolved by parseIFDTags (inline or dereferenced)
  const dataOffset = tag.valueOffset;

  for (let i = 0; i < tag.count; i++) {
    if (tag.type === 3) { // SHORT
      const off = dataOffset + i * 2;
      if (off + 2 > view.byteLength) break;
      values.push(view.getUint16(off, le));
    } else if (tag.type === 4) { // LONG
      const off = dataOffset + i * 4;
      if (off + 4 > view.byteLength) break;
      values.push(view.getUint32(off, le));
    }
  }

  return values;
}

/**
 * Read a RATIONAL value (two LONGs: numerator/denominator)
 */
function getTagRational(
  view: DataView,
  tags: Map<number, TIFFTag>,
  tagId: number,
  le: boolean
): number | null {
  const tag = tags.get(tagId);
  if (!tag || tag.type !== 5) return null; // RATIONAL type = 5

  const offset = tag.valueOffset;
  if (offset + 8 > view.byteLength) return null;

  const numerator = view.getUint32(offset, le);
  const denominator = view.getUint32(offset + 4, le);
  if (denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Read an ASCII string from a tag
 */
function getTagString(
  view: DataView,
  tags: Map<number, TIFFTag>,
  tagId: number
): string | null {
  const tag = tags.get(tagId);
  if (!tag || tag.type !== 2) return null; // ASCII type = 2

  // valueOffset is already resolved by parseIFDTags (inline or dereferenced)
  const dataOffset = tag.valueOffset;

  const chars: string[] = [];
  for (let i = 0; i < tag.count; i++) {
    const off = dataOffset + i;
    if (off >= view.byteLength) break;
    const c = view.getUint8(off);
    if (c === 0) break; // null terminator
    chars.push(String.fromCharCode(c));
  }

  return chars.length > 0 ? chars.join('') : null;
}

/**
 * Check if a filename or extension indicates a camera RAW format.
 * Accepts full filenames ("IMG_1234.CR2"), dotted extensions (".cr2"), or bare extensions ("cr2").
 */
export function isRAWExtension(filenameOrExt: string): boolean {
  const ext = filenameOrExt.split('.').pop()?.toLowerCase() ?? '';
  return RAW_EXTENSIONS.has(ext);
}

/**
 * Check if a buffer contains a RAW file (TIFF-based but not float TIFF)
 */
export function isRAWFile(buffer: ArrayBuffer): boolean {
  return isTIFFFile(buffer) && !isFloatTIFF(buffer);
}

/**
 * Extract the largest embedded JPEG preview from a camera RAW file.
 *
 * Walks the TIFF IFD chain and SubIFD pointers, collecting all JPEG-compressed
 * images, and returns the largest one along with EXIF metadata from IFD0.
 *
 * Returns null if no valid JPEG preview is found.
 */
export function extractRAWPreview(buffer: ArrayBuffer): RAWPreviewResult | null {
  try {
    if (buffer.byteLength < 8) return null;

    const view = new DataView(buffer);
    const byteOrder = view.getUint16(0, false);

    let le: boolean;
    if (byteOrder === TIFF_LE) {
      le = true;
    } else if (byteOrder === TIFF_BE) {
      le = false;
    } else {
      return null;
    }

    const magic = view.getUint16(2, le);
    if (magic !== 42) return null;

    const firstIFDOffset = view.getUint32(4, le);
    if (firstIFDOffset === 0 || firstIFDOffset >= buffer.byteLength) return null;

    // Collect all JPEG candidates across all IFDs
    const jpegCandidates: JPEGCandidate[] = [];
    const visitedOffsets = new Set<number>();
    let exif: RAWExifMetadata | null = null;

    // Queue of IFD offsets to visit
    const ifdQueue: number[] = [firstIFDOffset];

    while (ifdQueue.length > 0 && visitedOffsets.size < MAX_IFDS) {
      const ifdOffset = ifdQueue.shift()!;

      // Cycle guard
      if (visitedOffsets.has(ifdOffset)) continue;
      if (ifdOffset === 0 || ifdOffset >= buffer.byteLength) continue;
      visitedOffsets.add(ifdOffset);

      const { tags, nextIFDOffset } = parseIFDTags(view, ifdOffset, le);

      // Extract EXIF from IFD0 (first IFD visited)
      if (exif === null) {
        exif = extractExifFromTags(view, tags, le);
      }

      // Check for SubIFDs (tag 330)
      const subIFDTag = tags.get(TAG_SUB_IFDS);
      if (subIFDTag) {
        const subIFDOffsets = getTagValues(view, subIFDTag, le);
        for (const subOffset of subIFDOffsets) {
          if (subOffset > 0 && subOffset < buffer.byteLength) {
            ifdQueue.push(subOffset);
          }
        }
      }

      // Check if this IFD has JPEG compression
      const compression = getTagValue(view, tags, TAG_COMPRESSION, le, 0);
      const isJPEG = compression === COMPRESSION_JPEG_OLD || compression === COMPRESSION_JPEG;

      if (isJPEG) {
        // Try JPEGInterchangeFormat first (tags 513/514)
        const jpegOffset = getTagValue(view, tags, TAG_JPEG_INTERCHANGE_FORMAT, le, 0);
        const jpegLength = getTagValue(view, tags, TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, le, 0);

        if (jpegOffset > 0 && jpegLength > 0 && jpegOffset + jpegLength <= buffer.byteLength) {
          // Verify JPEG SOI marker
          if (jpegOffset + 2 <= buffer.byteLength && view.getUint16(jpegOffset, false) === JPEG_SOI) {
            const width = getTagValue(view, tags, TAG_IMAGE_WIDTH, le, 0);
            const height = getTagValue(view, tags, TAG_IMAGE_LENGTH, le, 0);
            jpegCandidates.push({ offset: jpegOffset, length: jpegLength, width, height });
          }
        } else {
          // Fallback: try StripOffsets/StripByteCounts (tags 273/279)
          const stripOffsetTag = tags.get(TAG_STRIP_OFFSETS);
          const stripByteCountTag = tags.get(TAG_STRIP_BYTE_COUNTS);

          if (stripOffsetTag && stripByteCountTag) {
            const offsets = getTagValues(view, stripOffsetTag, le);
            const counts = getTagValues(view, stripByteCountTag, le);

            if (offsets.length > 0 && counts.length > 0) {
              const stripOffset = offsets[0]!;
              // Sum all strip byte counts for total JPEG length
              let totalLength = 0;
              for (const c of counts) totalLength += c;

              if (stripOffset > 0 && totalLength > 0 && stripOffset + totalLength <= buffer.byteLength) {
                // Verify JPEG SOI marker
                if (stripOffset + 2 <= buffer.byteLength && view.getUint16(stripOffset, false) === JPEG_SOI) {
                  const width = getTagValue(view, tags, TAG_IMAGE_WIDTH, le, 0);
                  const height = getTagValue(view, tags, TAG_IMAGE_LENGTH, le, 0);
                  jpegCandidates.push({ offset: stripOffset, length: totalLength, width, height });
                }
              }
            }
          }
        }
      }

      // Follow IFD chain
      if (nextIFDOffset > 0 && nextIFDOffset < buffer.byteLength) {
        ifdQueue.push(nextIFDOffset);
      }
    }

    if (jpegCandidates.length === 0) return null;

    // Pick largest JPEG by byte length (full-resolution preview is typically largest)
    let best = jpegCandidates[0]!;
    for (let i = 1; i < jpegCandidates.length; i++) {
      if (jpegCandidates[i]!.length > best.length) {
        best = jpegCandidates[i]!;
      }
    }

    const jpegData = new Uint8Array(buffer, best.offset, best.length);
    const jpegBlob = new Blob([jpegData], { type: 'image/jpeg' });

    return {
      jpegBlob,
      exif: exif ?? {
        make: null,
        model: null,
        iso: null,
        exposureTime: null,
        fNumber: null,
        focalLength: null,
        dateTime: null,
        orientation: null,
      },
      previewWidth: best.width,
      previewHeight: best.height,
    };
  } catch {
    return null;
  }
}

/**
 * Extract EXIF metadata from IFD0 tags
 */
function extractExifFromTags(
  view: DataView,
  tags: Map<number, TIFFTag>,
  le: boolean
): RAWExifMetadata {
  return {
    make: getTagString(view, tags, TAG_MAKE),
    model: getTagString(view, tags, TAG_MODEL),
    orientation: tags.has(TAG_ORIENTATION)
      ? getTagValue(view, tags, TAG_ORIENTATION, le, 0) || null
      : null,
    dateTime: getTagString(view, tags, TAG_DATE_TIME),
    exposureTime: getTagRational(view, tags, TAG_EXPOSURE_TIME, le),
    fNumber: getTagRational(view, tags, TAG_FNUMBER, le),
    iso: tags.has(TAG_ISO) ? getTagValue(view, tags, TAG_ISO, le, 0) || null : null,
    focalLength: getTagRational(view, tags, TAG_FOCAL_LENGTH, le),
  };
}
