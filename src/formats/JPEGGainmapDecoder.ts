/**
 * JPEGGainmapDecoder - JPEG HDR (Gainmap) decoder
 *
 * Decodes HDR JPEG files that contain an embedded gainmap via MPF
 * (Multi-Picture Format, APP2 marker) per ISO 21496-1.
 *
 * Supported formats:
 * - Apple iPhone HDR JPEG (apple:hdrgainmapheadroom in primary XMP)
 * - Google Ultra HDR (hdrgm:GainMapMax in gainmap's own XMP, GContainer metadata)
 *
 * Structure:
 * 1. SDR base image (standard JPEG)
 * 2. Grayscale gainmap (smaller JPEG, embedded via MPF)
 *
 * HDR reconstruction formula (ISO 21496-1 simplified when offsets=0):
 *   HDR_linear = sRGB_to_linear(base) * exp2(gainmap * headroom)
 *
 * The headroom value is in XMP metadata:
 *   apple:hdrgainmapheadroom or hdrgm:GainMapMax
 */

import { drawImageWithOrientation } from './shared';
import {
  type GainMapMetadata,
  parseGainMapMetadataFromXMP,
  reconstructHDR,
  defaultGainMapMetadata,
} from './GainMapMetadata';
import { DecoderError } from '../core/errors';

export interface GainmapInfo {
  baseImageOffset: number;
  baseImageLength: number;
  gainmapOffset: number;
  gainmapLength: number;
  /** HDR headroom (typically 2.0-8.0 stops) */
  headroom: number;
  /** Full gain map metadata (ISO 21496-1) */
  gainMapMetadata?: GainMapMetadata;
}

/**
 * Check if a buffer contains a JPEG file with a gainmap (MPF APP2 marker).
 */
export function isGainmapJPEG(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer);

  // Check JPEG SOI marker
  if (buffer.byteLength < 4) return false;
  if (view.getUint16(0) !== 0xffd8) return false;

  // Scan for MPF APP2 marker (0xFFE2 with 'MPF\0' identifier)
  return findMPFMarkerOffset(view) !== -1;
}

/**
 * Parse a gainmap JPEG and extract offsets and headroom.
 * Returns null if the file is not a valid gainmap JPEG.
 */
export function parseGainmapJPEG(buffer: ArrayBuffer): GainmapInfo | null {
  // Need at least 4 bytes to read SOI + APP0/APP2 marker.
  if (buffer.byteLength < 4) return null;

  const view = new DataView(buffer);

  // Verify JPEG
  if (view.getUint16(0) !== 0xffd8) return null;

  // Find MPF marker
  const mpfOffset = findMPFMarkerOffset(view);
  if (mpfOffset === -1) return null;

  // Parse MPF index IFD to find image offsets
  const images = parseMPFEntries(view, mpfOffset);
  if (!images || images.length < 2) return null;

  // First image is the base (SDR), second is the gainmap
  const baseImage = images[0]!;
  const gainmapImage = images[1]!;

  // Validate base image entry bounds. The base image (entry 0) is structurally
  // forced to offset=0 in parseMPFEntries; the only attacker-controlled field
  // is `size`. If size > buffer length, the later slice would silently clamp
  // to a 0-byte blob and createImageBitmap would fail with an opaque error.
  ensureMPFRange(baseImage.offset, baseImage.size, buffer.byteLength, 'base image (MPEntry #0)');

  // Validate gainmap entry bounds against actual buffer. uint32+uint32 cannot
  // exceed Number.MAX_SAFE_INTEGER, so the addition itself is safe; we just
  // need to ensure the range fits.
  ensureMPFRange(gainmapImage.offset, gainmapImage.size, buffer.byteLength, 'gainmap image (MPEntry #1)');

  // Extract headroom and full metadata from XMP
  // First try the primary image's XMP (Apple format)
  let xmpResult = extractXMPFromJPEG(buffer, 0, undefined);
  if (xmpResult === null && gainmapImage.offset > 0 && gainmapImage.size > 0) {
    // Try the gainmap image's own XMP (Google Ultra HDR format)
    xmpResult = extractXMPFromJPEG(buffer, gainmapImage.offset, gainmapImage.offset + gainmapImage.size);
  }

  let gainMapMetadata: GainMapMetadata | undefined;
  let headroom: number | null = null;

  if (xmpResult) {
    gainMapMetadata = parseGainMapMetadataFromXMP(xmpResult) ?? undefined;
    if (gainMapMetadata) {
      headroom = gainMapMetadata.hdrCapacityMax;
    } else {
      headroom = parseHeadroomFromXMPText(xmpResult);
    }
  }

  // Fallback: try legacy headroom extraction
  if (headroom === null) {
    headroom = extractHeadroomFromXMP(buffer, 0, undefined);
    if (headroom === null && gainmapImage.offset > 0 && gainmapImage.size > 0) {
      headroom = extractHeadroomFromXMP(buffer, gainmapImage.offset, gainmapImage.offset + gainmapImage.size);
    }
  }

  const finalHeadroom = headroom ?? 2.0;
  if (!gainMapMetadata) {
    gainMapMetadata = defaultGainMapMetadata(finalHeadroom);
  }

  return {
    baseImageOffset: baseImage.offset,
    baseImageLength: baseImage.size,
    gainmapOffset: gainmapImage.offset,
    gainmapLength: gainmapImage.size,
    headroom: finalHeadroom,
    gainMapMetadata,
  };
}

/**
 * Decode a gainmap JPEG to a float32 IPImage with HDR data.
 * Uses browser's built-in JPEG decoder via createImageBitmap.
 */
export async function decodeGainmapToFloat32(
  buffer: ArrayBuffer,
  info: GainmapInfo,
): Promise<{
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
}> {
  // Validate that the gainmap and base image regions are within buffer bounds.
  // Use the shared `ensureMPFRange` helper so error UX (NaN/negative/OOB) is
  // unified with the parser path; previously the inline check formatted offsets
  // in decimal while the parser used hex.
  ensureMPFRange(info.gainmapOffset, info.gainmapLength, buffer.byteLength, 'gainmap slice (decode)');
  ensureMPFRange(info.baseImageOffset, info.baseImageLength, buffer.byteLength, 'base image slice (decode)');

  // Slice out the base JPEG and gainmap JPEG blobs
  // For the first image (offset 0), use gainmap offset as the end boundary.
  // MPF size fields can underreport the first image's actual size (missing EOI marker),
  // and JPEG decoders ignore trailing bytes after EOI, so this is safe.
  const baseEnd =
    info.baseImageOffset === 0 && info.gainmapOffset > info.baseImageLength
      ? info.gainmapOffset
      : info.baseImageOffset + info.baseImageLength;
  const baseBlob = new Blob([buffer.slice(info.baseImageOffset, baseEnd)], { type: 'image/jpeg' });
  const gainmapBlob = new Blob([buffer.slice(info.gainmapOffset, info.gainmapOffset + info.gainmapLength)], {
    type: 'image/jpeg',
  });

  // Parse EXIF orientation from the original JPEG (applied by browser to base but not to gainmap)
  const orientation = extractJPEGOrientation(buffer);

  // Decode both using browser's JPEG decoder
  const [baseBitmap, gainmapBitmap] = await Promise.all([createImageBitmap(baseBlob), createImageBitmap(gainmapBlob)]);

  const width = baseBitmap.width;
  const height = baseBitmap.height;

  function createCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(w, h);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Draw to canvases and get pixel data
  const baseCanvas = createCanvas(width, height);
  const baseCtx = baseCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  baseCtx.drawImage(baseBitmap, 0, 0);
  const baseData = baseCtx.getImageData(0, 0, width, height).data;
  baseBitmap.close();

  // Gainmap may be smaller - scale up to base image size
  // Apply orientation transform so gainmap pixels align with the display-rotated base
  const gainCanvas = createCanvas(width, height);
  const gainCtx = gainCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  drawImageWithOrientation(gainCtx, gainmapBitmap, width, height, orientation);
  const gainData = gainCtx.getImageData(0, 0, width, height).data;
  gainmapBitmap.close();

  // Apply HDR reconstruction per-pixel using shared module
  const pixelCount = width * height;
  const meta = info.gainMapMetadata ?? defaultGainMapMetadata(info.headroom);
  const result = reconstructHDR(baseData, gainData, pixelCount, meta);

  return { width, height, data: result, channels: 4 };
}

/**
 * Extract EXIF orientation tag (tag 274) from a JPEG buffer.
 * Scans APP1 markers for Exif\0\0 header, parses TIFF IFD0.
 * Returns 1-8, defaults to 1 if not found or invalid.
 */
export function extractJPEGOrientation(buffer: ArrayBuffer): number {
  if (buffer.byteLength < 4) return 1;
  const view = new DataView(buffer);

  // Verify JPEG SOI
  if (view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  const length = buffer.byteLength;

  while (offset < length - 4) {
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOS or EOI — stop scanning
    if (marker === 0xda || marker === 0xd9) break;

    // Skip padding bytes
    if (marker === 0xff) {
      offset++;
      continue;
    }

    // Skip standalone markers
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    if (offset + 3 >= length) break;
    const segmentLength = view.getUint16(offset + 2);

    // Defense-in-depth against malformed JPEGs.
    // ITU-T T.81 §B.1.1.4: APP/COM segment length is 2 bytes BE and
    // *includes its own 2 bytes*, so the minimum legal value is 2. A
    // value < 2 violates the spec. The current loop body always advances
    // `offset` by `2 + segmentLength`, so a literal infinite loop on `<2`
    // is not reproducible here — but allowing parsing to continue past a
    // spec-violating length means we re-interpret arbitrary bytes (whose
    // alignment is now wrong) as further markers. Bail to the default
    // orientation rather than producing garbage.
    if (segmentLength < 2) break;

    // APP1 marker (0xFFE1) — may contain EXIF
    if (marker === 0xe1) {
      // Check for 'Exif\0\0' identifier (6 bytes at offset+4)
      if (
        offset + 13 < length &&
        view.getUint8(offset + 4) === 0x45 && // 'E'
        view.getUint8(offset + 5) === 0x78 && // 'x'
        view.getUint8(offset + 6) === 0x69 && // 'i'
        view.getUint8(offset + 7) === 0x66 && // 'f'
        view.getUint8(offset + 8) === 0x00 &&
        view.getUint8(offset + 9) === 0x00
      ) {
        // TIFF header starts at offset+10
        const tiffStart = offset + 10;
        const segEnd = offset + 2 + segmentLength;
        if (tiffStart + 8 > Math.min(segEnd, length)) break;

        // Read byte order
        const byteOrder = view.getUint16(tiffStart);
        const isLE = byteOrder === 0x4949; // 'II' = little-endian
        if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) break;

        // Verify TIFF magic 0x002A
        if (view.getUint16(tiffStart + 2, isLE) !== 0x002a) break;

        // Read IFD0 offset (relative to tiffStart)
        const ifdOffset = view.getUint32(tiffStart + 4, isLE);
        const ifdStart = tiffStart + ifdOffset;

        if (ifdStart + 2 > Math.min(segEnd, length)) break;

        const entryCount = view.getUint16(ifdStart, isLE);

        for (let i = 0; i < entryCount; i++) {
          const entryStart = ifdStart + 2 + i * 12;
          if (entryStart + 12 > Math.min(segEnd, length)) break;

          const tag = view.getUint16(entryStart, isLE);
          if (tag === 0x0112) {
            // Orientation tag (274)
            const type = view.getUint16(entryStart + 2, isLE);
            // type 3 = SHORT (uint16), value in first 2 bytes of value field
            if (type === 3) {
              const val = view.getUint16(entryStart + 8, isLE);
              if (val >= 1 && val <= 8) return val;
            }
            return 1;
          }
        }
        // EXIF found but no orientation tag
        return 1;
      }
    }

    offset += 2 + segmentLength;
  }

  return 1;
}

// =============================================================================
// Internal helpers
// =============================================================================

interface MPFImageEntry {
  offset: number;
  size: number;
}

/**
 * Throws a DecoderError if a [start, end) byte range falls outside [0, bufferLength].
 *
 * Catches three failure modes that ArrayBuffer.slice would otherwise silently
 * clamp into a 0-byte (or short) view, producing an opaque downstream error:
 *  - `start` is negative (e.g., a uint32 read as signed produced a wrap)
 *  - `start` is at or past the buffer end
 *  - `start + size` exceeds the buffer length (truncated MPF segment)
 *
 * `context` is included verbatim in the error message so call sites can
 * disambiguate which structural element (IFD entry N, sub-image M, value
 * offset for tag 0xB002, etc.) was being read.
 */
function ensureMPFRange(start: number, size: number, bufferLength: number, context: string): void {
  // Both start and size are uint32 values from the file; their sum is at most
  // ~8.6e9, well within Number.MAX_SAFE_INTEGER. The arithmetic itself is safe;
  // we still need to detect ranges that point past the buffer end or have
  // negative components.
  if (!Number.isFinite(start) || !Number.isFinite(size)) {
    throw new DecoderError('JPEG Gainmap', `MPF: ${context} non-finite offset=${start} size=${size}`);
  }
  if (start < 0 || size < 0) {
    throw new DecoderError(
      'JPEG Gainmap',
      `MPF: ${context} negative offset=${start} or size=${size} (buffer length 0x${bufferLength.toString(16)})`,
    );
  }
  if (start + size > bufferLength) {
    throw new DecoderError(
      'JPEG Gainmap',
      `MPF: ${context} offset 0x${start.toString(16)} + size 0x${size.toString(16)} exceeds buffer length 0x${bufferLength.toString(16)}`,
    );
  }
}

/**
 * Find the byte offset of the MPF APP2 marker in a JPEG DataView.
 * Returns -1 if not found.
 */
function findMPFMarkerOffset(view: DataView): number {
  let offset = 2; // Skip SOI (0xFFD8)
  const length = view.byteLength;

  while (offset < length - 4) {
    // Look for marker prefix
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOS (Start of Scan) - stop scanning markers
    if (marker === 0xda) break;

    // EOI (End of Image) - stop scanning
    if (marker === 0xd9) break;

    // Skip padding bytes (0xFF 0xFF)
    if (marker === 0xff) {
      offset++;
      continue;
    }

    // Skip standalone markers (RST, SOI, etc.)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    // Read segment length
    if (offset + 3 >= length) break;
    const segmentLength = view.getUint16(offset + 2);

    // Defense-in-depth against malformed JPEGs.
    // ITU-T T.81 §B.1.1.4: APP/COM segment length is 2 bytes BE and
    // *includes its own 2 bytes*, so values < 2 are spec-violating. The
    // existing `offset += 2 + segmentLength` always advances at least 2
    // bytes per iteration, so a strict-`<2` value alone won't infinite-loop
    // here — but continuing to parse past a corrupt length means we re-read
    // misaligned bytes as new markers. For a hostile file where the length
    // field bytes themselves form `0xFFxx`, that re-traversal can scan a
    // large region many times. Bail with "no MPF found" — the caller
    // (isGainmapJPEG) will correctly report the file as not a gainmap JPEG.
    if (segmentLength < 2) break;

    // APP2 marker (0xFFE2) - check for MPF identifier
    if (marker === 0xe2) {
      // Check for 'MPF\0' identifier
      if (
        offset + 7 < length &&
        view.getUint8(offset + 4) === 0x4d && // 'M'
        view.getUint8(offset + 5) === 0x50 && // 'P'
        view.getUint8(offset + 6) === 0x46 && // 'F'
        view.getUint8(offset + 7) === 0x00 // '\0'
      ) {
        return offset;
      }
    }

    // Move to next marker
    offset += 2 + segmentLength;
  }

  return -1;
}

/**
 * Parse MPF index IFD to extract image entries.
 * MPF structure follows TIFF-like IFD format.
 *
 * Returns null when the MPF header itself is structurally invalid (e.g., wrong
 * byte-order marker, missing TIFF magic) so callers can fall back gracefully.
 *
 * Throws a DecoderError when the MPF header looks valid but offsets/sizes
 * inside it point outside the buffer — those cases indicate a truncated or
 * corrupted file and would otherwise produce a silent ArrayBuffer.slice clamp.
 */
function parseMPFEntries(view: DataView, mpfMarkerOffset: number): MPFImageEntry[] | null {
  const entries: MPFImageEntry[] = [];
  const bufferLength = view.byteLength;

  // MPF data starts after marker (2 bytes) + length (2 bytes) + 'MPF\0' (4 bytes)
  const mpfDataStart = mpfMarkerOffset + 8;

  // Need at least byte-order(2) + magic(2) + IFD-offset(4) = 8 bytes for the header.
  if (mpfDataStart + 8 > bufferLength) return null;

  // Read byte order (II = little-endian, MM = big-endian)
  const byteOrder = view.getUint16(mpfDataStart);
  const isLittleEndian = byteOrder === 0x4949; // 'II'
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;

  // Verify TIFF magic (0x002A)
  const magic = view.getUint16(mpfDataStart + 2, isLittleEndian);
  if (magic !== 0x002a) return null;

  // Past this point we've confirmed it's a real MPF/TIFF box, so any offsets
  // pointing outside the buffer are a corruption error worth reporting clearly,
  // not a "this isn't an MPF" signal.

  // Read offset to first IFD (relative to mpfDataStart). uint32 values up to
  // 4 GB are well within Number.MAX_SAFE_INTEGER, so the addition is safe; we
  // just need to bounds-check the result against the buffer.
  const ifdOffset = view.getUint32(mpfDataStart + 4, isLittleEndian);
  const ifdStart = mpfDataStart + ifdOffset;

  // Need 2 bytes at ifdStart for the entry count.
  ensureMPFRange(ifdStart, 2, bufferLength, 'IFD start (mpfDataStart + ifdOffset) reading entry count');

  // Read number of IFD entries
  const entryCount = view.getUint16(ifdStart, isLittleEndian);

  // Bounds-check the entire IFD-entry array up front. Each entry is 12 bytes.
  if (entryCount > 0) {
    ensureMPFRange(ifdStart + 2, entryCount * 12, bufferLength, `IFD with ${entryCount} entries`);
  }

  // Look for MPEntry tag (0xB002) in IFD
  let mpEntryOffset = -1;
  let mpEntryCount = 0;

  for (let i = 0; i < entryCount; i++) {
    const entryStart = ifdStart + 2 + i * 12;

    const tag = view.getUint16(entryStart, isLittleEndian);
    const count = view.getUint32(entryStart + 4, isLittleEndian);
    const valueOffset = view.getUint32(entryStart + 8, isLittleEndian);

    if (tag === 0xb001) {
      // NumberOfImages tag: type=LONG, count=1
      // The value field contains the actual number of images.
      // MPF practically caps the image count at uint16 range; values larger
      // than 65535 are either corrupt or hostile (e.g., a uint32 wrap into
      // the giga-range that would later survive `ensureMPFRange` only if the
      // file were also massive). Short-circuit with a descriptive error.
      if (valueOffset > 65535) {
        throw new DecoderError(
          'JPEG Gainmap',
          `MPF: NumberOfImages (tag 0xB001) value ${valueOffset} exceeds sanity cap 65535`,
        );
      }
      mpEntryCount = valueOffset;
    }

    if (tag === 0xb002) {
      // MPEntry tag: type=UNDEFINED, count=total bytes
      // Each entry is 16 bytes; count is byte length, not entry count
      if (mpEntryCount === 0) {
        mpEntryCount = Math.floor(count / 16);
      }
      // If data > 4 bytes, valueOffset is relative to mpfDataStart
      mpEntryOffset = mpfDataStart + valueOffset;

      // Validate the MPEntry table fits within the buffer. We may not yet
      // know mpEntryCount (if the 0xB001 tag comes after 0xB002 in the IFD),
      // so use whichever bound we can derive. `count` is the byte length per
      // the MPF spec for tag 0xB002.
      const tableBytes = count > 0 ? count : mpEntryCount * 16;
      if (tableBytes > 0) {
        ensureMPFRange(
          mpEntryOffset,
          tableBytes,
          bufferLength,
          `MPEntry table (tag 0xB002 valueOffset=0x${valueOffset.toString(16)})`,
        );
      } else {
        // Empty table: at least make sure the offset itself is in-buffer.
        ensureMPFRange(mpEntryOffset, 0, bufferLength, 'MPEntry table (tag 0xB002) offset');
      }
    }
  }

  if (mpEntryOffset === -1 || mpEntryCount === 0) return null;

  // Parse MP entries (each 16 bytes: attributes(4) + size(4) + offset(4) + dep1(2) + dep2(2)).
  // Validate the full entry array fits before reading individual entries; this
  // converts a silent "ran out of buffer" truncation into a descriptive error.
  ensureMPFRange(
    mpEntryOffset,
    mpEntryCount * 16,
    bufferLength,
    `MPEntry array of ${mpEntryCount} entries (16 bytes each) at offset 0x${mpEntryOffset.toString(16)}`,
  );

  for (let i = 0; i < mpEntryCount; i++) {
    const entryStart = mpEntryOffset + i * 16;

    const size = view.getUint32(entryStart + 4, isLittleEndian);
    let offset = view.getUint32(entryStart + 8, isLittleEndian);

    // First image offset is 0 (refers to start of file)
    // Subsequent image offsets are relative to mpfDataStart (after MPF\0 header)
    if (i === 0) {
      offset = 0;
    } else if (offset !== 0) {
      offset = offset + mpfDataStart;
    }

    entries.push({ offset, size });
  }

  // Fix gainmap offset: if offset is 0 for the second image, it's often
  // stored right after the base JPEG image
  if (entries.length >= 2 && entries[1]!.offset === 0 && entries[0]!.size > 0) {
    entries[1]!.offset = entries[0]!.size;
  }

  return entries;
}

/**
 * Extract HDR headroom from XMP metadata in a JPEG region.
 * Scans APP1 markers for apple:hdrgainmapheadroom or hdrgm:GainMapMax.
 *
 * @param buffer - Full file buffer
 * @param startOffset - Byte offset to start scanning (0 for primary, gainmapOffset for secondary)
 * @param endOffset - Byte offset to stop scanning (undefined = startOffset + 65536)
 * @returns headroom value or null if not found
 */
function extractHeadroomFromXMP(
  buffer: ArrayBuffer,
  startOffset: number,
  endOffset: number | undefined,
): number | null {
  const view = new DataView(buffer);

  // Skip SOI marker if we're at one
  let offset = startOffset;
  if (offset + 1 < view.byteLength && view.getUint8(offset) === 0xff && view.getUint8(offset + 1) === 0xd8) {
    offset += 2;
  }

  const scanEnd = Math.min(endOffset ?? startOffset + 65536, view.byteLength);

  while (offset < scanEnd - 4) {
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOS - stop scanning
    if (marker === 0xda) break;

    // Skip padding / standalone markers
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    if (offset + 3 >= scanEnd) break;
    const segmentLength = view.getUint16(offset + 2);

    // Defense-in-depth against malformed JPEGs.
    // ITU-T T.81 §B.1.1.4: APP/COM segment length is 2 bytes BE and
    // *includes its own 2 bytes*, so values < 2 are spec-violating. Even
    // though the loop's `offset += 2 + segmentLength` advances by at least
    // 2 bytes (so a literal infinite loop on `<2` doesn't reproduce here),
    // continuing past a corrupt length re-interprets misaligned bytes as
    // further markers. Treat the whole region as "no headroom found" and
    // let the caller fall back to the default rather than emit a parsed
    // value derived from garbage.
    if (segmentLength < 2) return null;

    // APP1 marker (0xFFE1) - may contain XMP
    if (marker === 0xe1) {
      const dataLen = Math.min(segmentLength - 2, buffer.byteLength - offset - 4);
      if (dataLen > 0) {
        const segmentData = new Uint8Array(buffer, offset + 4, dataLen);
        const text = new TextDecoder('ascii', { fatal: false }).decode(segmentData);

        // Check for XMP namespace
        if (text.includes('http://ns.adobe.com/xap/') || text.includes('xmlns:')) {
          const headroom = parseHeadroomFromXMPText(text);
          if (headroom !== null) return headroom;
        }
      }
    }

    offset += 2 + segmentLength;
  }

  return null;
}

/**
 * Extract raw XMP text from a JPEG region.
 * Scans APP1 markers for XMP data.
 */
function extractXMPFromJPEG(buffer: ArrayBuffer, startOffset: number, endOffset: number | undefined): string | null {
  const view = new DataView(buffer);

  let offset = startOffset;
  if (offset + 1 < view.byteLength && view.getUint8(offset) === 0xff && view.getUint8(offset + 1) === 0xd8) {
    offset += 2;
  }

  const scanEnd = Math.min(endOffset ?? startOffset + 65536, view.byteLength);

  while (offset < scanEnd - 4) {
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    if (marker === 0xda) break;
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    if (offset + 3 >= scanEnd) break;
    const segmentLength = view.getUint16(offset + 2);

    // Defense-in-depth against malformed JPEGs.
    // ITU-T T.81 §B.1.1.4: APP/COM segment length is 2 bytes BE and
    // *includes its own 2 bytes*, so values < 2 are spec-violating. The
    // loop already advances by at least 2 bytes per iteration, so this
    // isn't a literal infinite-loop guard — but continuing past a corrupt
    // length re-interprets misaligned bytes as further markers, which can
    // produce phantom XMP matches on adversarial inputs. Treat the whole
    // region as "no XMP here" so the caller falls back to the default.
    if (segmentLength < 2) return null;

    if (marker === 0xe1) {
      const dataLen = Math.min(segmentLength - 2, buffer.byteLength - offset - 4);
      if (dataLen > 0) {
        const segmentData = new Uint8Array(buffer, offset + 4, dataLen);
        const text = new TextDecoder('ascii', { fatal: false }).decode(segmentData);
        if (text.includes('http://ns.adobe.com/xap/') || text.includes('xmlns:')) {
          return text;
        }
      }
    }

    offset += 2 + segmentLength;
  }

  return null;
}

/**
 * Test-only export of internal helpers. Not part of the public API — consumers
 * should not import from this namespace; it exists so unit tests can directly
 * exercise small internal helpers like `ensureMPFRange` without round-tripping
 * through crafted MPF buffers for every branch.
 *
 * `extractHeadroomFromXMP` and `extractXMPFromJPEG` are exposed here so unit
 * tests can drive their `segmentLength < 2` defense-in-depth branches directly,
 * without needing to fold a corrupt APP1 region into a structurally-valid MPF
 * JPEG and rely on the parent parser to delegate.
 */
export const _internal = {
  ensureMPFRange,
  extractHeadroomFromXMP,
  extractXMPFromJPEG,
};

/**
 * Parse headroom value from XMP text content.
 */
function parseHeadroomFromXMPText(xmpText: string): number | null {
  // Try apple:hdrgainmapheadroom="X.X"
  const appleMatch = xmpText.match(/apple:hdrgainmapheadroom="([^"]+)"/i);
  if (appleMatch?.[1]) {
    const val = parseFloat(appleMatch[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }

  // Try hdrgm:GainMapMax="X.X"
  const hdrgmMatch = xmpText.match(/hdrgm:GainMapMax="([^"]+)"/i);
  if (hdrgmMatch?.[1]) {
    const val = parseFloat(hdrgmMatch[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }

  // Try HDRGainMapHeadroom attribute (various capitalizations)
  const genericMatch = xmpText.match(/HDRGainMapHeadroom="([^"]+)"/i);
  if (genericMatch?.[1]) {
    const val = parseFloat(genericMatch[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }

  return null;
}
