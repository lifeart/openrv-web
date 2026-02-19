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

export interface GainmapInfo {
  baseImageOffset: number;
  baseImageLength: number;
  gainmapOffset: number;
  gainmapLength: number;
  /** HDR headroom (typically 2.0-8.0 stops) */
  headroom: number;
}

/**
 * Check if a buffer contains a JPEG file with a gainmap (MPF APP2 marker).
 */
export function isGainmapJPEG(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer);

  // Check JPEG SOI marker
  if (buffer.byteLength < 4) return false;
  if (view.getUint16(0) !== 0xFFD8) return false;

  // Scan for MPF APP2 marker (0xFFE2 with 'MPF\0' identifier)
  return findMPFMarkerOffset(view) !== -1;
}

/**
 * Parse a gainmap JPEG and extract offsets and headroom.
 * Returns null if the file is not a valid gainmap JPEG.
 */
export function parseGainmapJPEG(buffer: ArrayBuffer): GainmapInfo | null {
  const view = new DataView(buffer);

  // Verify JPEG
  if (view.getUint16(0) !== 0xFFD8) return null;

  // Find MPF marker
  const mpfOffset = findMPFMarkerOffset(view);
  if (mpfOffset === -1) return null;

  // Parse MPF index IFD to find image offsets
  const images = parseMPFEntries(view, mpfOffset);
  if (!images || images.length < 2) return null;

  // First image is the base (SDR), second is the gainmap
  const baseImage = images[0]!;
  const gainmapImage = images[1]!;

  // Extract headroom from XMP metadata
  // First try the primary image's XMP (Apple format)
  let headroom = extractHeadroomFromXMP(buffer, 0, undefined);
  if (headroom === null && gainmapImage.offset > 0 && gainmapImage.size > 0) {
    // Try the gainmap image's own XMP (Google Ultra HDR format)
    headroom = extractHeadroomFromXMP(buffer, gainmapImage.offset, gainmapImage.offset + gainmapImage.size);
  }

  const finalHeadroom = headroom ?? 2.0;

  return {
    baseImageOffset: baseImage.offset,
    baseImageLength: baseImage.size,
    gainmapOffset: gainmapImage.offset,
    gainmapLength: gainmapImage.size,
    headroom: finalHeadroom,
  };
}

/**
 * Decode a gainmap JPEG to a float32 IPImage with HDR data.
 * Uses browser's built-in JPEG decoder via createImageBitmap.
 */
export async function decodeGainmapToFloat32(
  buffer: ArrayBuffer,
  info: GainmapInfo
): Promise<{
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
}> {
  // Slice out the base JPEG and gainmap JPEG blobs
  // For the first image (offset 0), use gainmap offset as the end boundary.
  // MPF size fields can underreport the first image's actual size (missing EOI marker),
  // and JPEG decoders ignore trailing bytes after EOI, so this is safe.
  const baseEnd = info.baseImageOffset === 0 && info.gainmapOffset > info.baseImageLength
    ? info.gainmapOffset
    : info.baseImageOffset + info.baseImageLength;
  const baseBlob = new Blob(
    [buffer.slice(info.baseImageOffset, baseEnd)],
    { type: 'image/jpeg' }
  );
  const gainmapBlob = new Blob(
    [buffer.slice(info.gainmapOffset, info.gainmapOffset + info.gainmapLength)],
    { type: 'image/jpeg' }
  );

  // Parse EXIF orientation from the original JPEG (applied by browser to base but not to gainmap)
  const orientation = extractJPEGOrientation(buffer);

  // Decode both using browser's JPEG decoder
  const [baseBitmap, gainmapBitmap] = await Promise.all([
    createImageBitmap(baseBlob),
    createImageBitmap(gainmapBlob),
  ]);

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

  // Apply HDR reconstruction per-pixel
  // HDR_linear = sRGB_to_linear(base) * exp2(gainmap_gray * headroom)
  const pixelCount = width * height;
  const result = new Float32Array(pixelCount * 4); // RGBA
  const headroom = info.headroom;

  // Pre-compute sRGB-to-linear LUT for uint8 values (0-255)
  const srgbLUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    srgbLUT[i] = srgbToLinear(i / 255.0);
  }

  // Pre-compute gain LUT: gainmap values come from uint8 source (0-255),
  // so there are only 256 possible gain multipliers.
  // gain = 2^(v/255 * headroom) = exp(v/255 * headroom * LN2)
  const gainLUT = new Float32Array(256);
  const headroomLN2 = headroom * Math.LN2;
  for (let i = 0; i < 256; i++) {
    gainLUT[i] = Math.exp((i / 255.0) * headroomLN2);
  }

  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4;
    const dstIdx = i * 4;

    // sRGB to linear via pre-computed LUT
    const r = srgbLUT[baseData[srcIdx]!]!;
    const g = srgbLUT[baseData[srcIdx + 1]!]!;
    const b = srgbLUT[baseData[srcIdx + 2]!]!;

    // Gainmap is grayscale - use red channel; gain via pre-computed LUT
    const gain = gainLUT[gainData[srcIdx]!]!;

    result[dstIdx] = r * gain;
    result[dstIdx + 1] = g * gain;
    result[dstIdx + 2] = b * gain;
    result[dstIdx + 3] = 1.0; // Full alpha
  }

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
  if (view.getUint16(0) !== 0xFFD8) return 1;

  let offset = 2;
  const length = buffer.byteLength;

  while (offset < length - 4) {
    if (view.getUint8(offset) !== 0xFF) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOS or EOI — stop scanning
    if (marker === 0xDA || marker === 0xD9) break;

    // Skip padding bytes
    if (marker === 0xFF) { offset++; continue; }

    // Skip standalone markers
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0xD8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    if (offset + 3 >= length) break;
    const segmentLength = view.getUint16(offset + 2);

    // APP1 marker (0xFFE1) — may contain EXIF
    if (marker === 0xE1) {
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
        if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) break;

        // Verify TIFF magic 0x002A
        if (view.getUint16(tiffStart + 2, isLE) !== 0x002A) break;

        // Read IFD0 offset (relative to tiffStart)
        const ifdOffset = view.getUint32(tiffStart + 4, isLE);
        const ifdStart = tiffStart + ifdOffset;

        if (ifdStart + 2 > Math.min(segEnd, length)) break;

        const entryCount = view.getUint16(ifdStart, isLE);

        for (let i = 0; i < entryCount; i++) {
          const entryStart = ifdStart + 2 + i * 12;
          if (entryStart + 12 > Math.min(segEnd, length)) break;

          const tag = view.getUint16(entryStart, isLE);
          if (tag === 0x0112) { // Orientation tag (274)
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

/**
 * sRGB to linear conversion (gamma decode)
 */
function srgbToLinear(s: number): number {
  if (s <= 0.04045) {
    return s / 12.92;
  }
  return Math.pow((s + 0.055) / 1.055, 2.4);
}

interface MPFImageEntry {
  offset: number;
  size: number;
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
    if (view.getUint8(offset) !== 0xFF) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOS (Start of Scan) - stop scanning markers
    if (marker === 0xDA) break;

    // EOI (End of Image) - stop scanning
    if (marker === 0xD9) break;

    // Skip padding bytes (0xFF 0xFF)
    if (marker === 0xFF) {
      offset++;
      continue;
    }

    // Skip standalone markers (RST, SOI, etc.)
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0xD8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    // Read segment length
    if (offset + 3 >= length) break;
    const segmentLength = view.getUint16(offset + 2);

    // APP2 marker (0xFFE2) - check for MPF identifier
    if (marker === 0xE2) {
      // Check for 'MPF\0' identifier
      if (
        offset + 7 < length &&
        view.getUint8(offset + 4) === 0x4D && // 'M'
        view.getUint8(offset + 5) === 0x50 && // 'P'
        view.getUint8(offset + 6) === 0x46 && // 'F'
        view.getUint8(offset + 7) === 0x00    // '\0'
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
 */
function parseMPFEntries(view: DataView, mpfMarkerOffset: number): MPFImageEntry[] | null {
  const entries: MPFImageEntry[] = [];

  // MPF data starts after marker (2 bytes) + length (2 bytes) + 'MPF\0' (4 bytes)
  const mpfDataStart = mpfMarkerOffset + 8;

  if (mpfDataStart + 8 > view.byteLength) return null;

  // Read byte order (II = little-endian, MM = big-endian)
  const byteOrder = view.getUint16(mpfDataStart);
  const isLittleEndian = byteOrder === 0x4949; // 'II'
  if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) return null;

  // Verify TIFF magic (0x002A)
  const magic = view.getUint16(mpfDataStart + 2, isLittleEndian);
  if (magic !== 0x002A) return null;

  // Read offset to first IFD (relative to mpfDataStart)
  const ifdOffset = view.getUint32(mpfDataStart + 4, isLittleEndian);
  const ifdStart = mpfDataStart + ifdOffset;

  if (ifdStart + 2 > view.byteLength) return null;

  // Read number of IFD entries
  const entryCount = view.getUint16(ifdStart, isLittleEndian);

  // Look for MPEntry tag (0xB002) in IFD
  let mpEntryOffset = -1;
  let mpEntryCount = 0;

  for (let i = 0; i < entryCount; i++) {
    const entryStart = ifdStart + 2 + i * 12;
    if (entryStart + 12 > view.byteLength) break;

    const tag = view.getUint16(entryStart, isLittleEndian);
    const count = view.getUint32(entryStart + 4, isLittleEndian);
    const valueOffset = view.getUint32(entryStart + 8, isLittleEndian);

    if (tag === 0xB001) {
      // NumberOfImages tag: type=LONG, count=1
      // The value field contains the actual number of images
      mpEntryCount = valueOffset;
    }

    if (tag === 0xB002) {
      // MPEntry tag: type=UNDEFINED, count=total bytes
      // Each entry is 16 bytes; count is byte length, not entry count
      if (mpEntryCount === 0) {
        mpEntryCount = Math.floor(count / 16);
      }
      // If data > 4 bytes, valueOffset is relative to mpfDataStart
      mpEntryOffset = mpfDataStart + valueOffset;
    }
  }

  if (mpEntryOffset === -1 || mpEntryCount === 0) return null;

  // Parse MP entries (each 16 bytes: attributes(4) + size(4) + offset(4) + dep1(2) + dep2(2))
  for (let i = 0; i < mpEntryCount; i++) {
    const entryStart = mpEntryOffset + i * 16;
    if (entryStart + 16 > view.byteLength) break;

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
function extractHeadroomFromXMP(buffer: ArrayBuffer, startOffset: number, endOffset: number | undefined): number | null {
  const view = new DataView(buffer);

  // Skip SOI marker if we're at one
  let offset = startOffset;
  if (offset + 1 < view.byteLength && view.getUint8(offset) === 0xFF && view.getUint8(offset + 1) === 0xD8) {
    offset += 2;
  }

  const scanEnd = Math.min(endOffset ?? (startOffset + 65536), view.byteLength);

  while (offset < scanEnd - 4) {
    if (view.getUint8(offset) !== 0xFF) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // SOS - stop scanning
    if (marker === 0xDA) break;

    // Skip padding / standalone markers
    if (marker === 0xFF) { offset++; continue; }
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0xD8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    if (offset + 3 >= scanEnd) break;
    const segmentLength = view.getUint16(offset + 2);

    // APP1 marker (0xFFE1) - may contain XMP
    if (marker === 0xE1) {
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
