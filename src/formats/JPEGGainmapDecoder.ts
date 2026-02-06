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

  console.log(`[GainmapJPEG] MPF found: ${images.length} images`);
  console.log(`[GainmapJPEG] Base image: offset=${baseImage.offset}, size=${baseImage.size}`);
  console.log(`[GainmapJPEG] Gainmap: offset=${gainmapImage.offset}, size=${gainmapImage.size}`);

  // Extract headroom from XMP metadata
  // First try the primary image's XMP (Apple format)
  let headroom = extractHeadroomFromXMP(buffer, 0, undefined);
  let headroomSource = 'primary XMP';
  if (headroom === null && gainmapImage.offset > 0 && gainmapImage.size > 0) {
    // Try the gainmap image's own XMP (Google Ultra HDR format)
    headroom = extractHeadroomFromXMP(buffer, gainmapImage.offset, gainmapImage.offset + gainmapImage.size);
    headroomSource = 'gainmap XMP';
  }
  if (headroom === null) {
    headroomSource = 'default';
  }

  const finalHeadroom = headroom ?? 2.0;
  console.log(`[GainmapJPEG] Headroom: ${finalHeadroom} (source: ${headroomSource})`);

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
  const baseCtx = baseCanvas.getContext('2d')!;
  baseCtx.drawImage(baseBitmap, 0, 0);
  const baseData = baseCtx.getImageData(0, 0, width, height).data;
  baseBitmap.close();

  // Gainmap may be smaller - scale up to base image size
  const gainmapOrigWidth = gainmapBitmap.width;
  const gainmapOrigHeight = gainmapBitmap.height;
  const gainCanvas = createCanvas(width, height);
  const gainCtx = gainCanvas.getContext('2d')!;
  gainCtx.drawImage(gainmapBitmap, 0, 0, width, height);
  const gainData = gainCtx.getImageData(0, 0, width, height).data;
  gainmapBitmap.close();

  console.log(`[GainmapJPEG] Decoding: base=${width}x${height}, gainmap=${gainmapOrigWidth}x${gainmapOrigHeight} (scaled to base), headroom=${info.headroom}`);

  // Apply HDR reconstruction per-pixel
  // HDR_linear = sRGB_to_linear(base) * exp2(gainmap_gray * headroom)
  const pixelCount = width * height;
  const result = new Float32Array(pixelCount * 4); // RGBA
  const headroom = info.headroom;
  let maxValue = 0;

  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4;
    const dstIdx = i * 4;

    // sRGB to linear conversion for base image
    const r = srgbToLinear(baseData[srcIdx]! / 255.0);
    const g = srgbToLinear(baseData[srcIdx + 1]! / 255.0);
    const b = srgbToLinear(baseData[srcIdx + 2]! / 255.0);

    // Gainmap is grayscale - use red channel (0-1 range)
    const gainValue = gainData[srcIdx]! / 255.0;

    // Apply gain: HDR = base_linear * 2^(gainmap * headroom)
    const gain = Math.pow(2, gainValue * headroom);

    result[dstIdx] = r * gain;
    result[dstIdx + 1] = g * gain;
    result[dstIdx + 2] = b * gain;
    result[dstIdx + 3] = 1.0; // Full alpha

    const pixelMax = Math.max(r * gain, g * gain, b * gain);
    if (pixelMax > maxValue) maxValue = pixelMax;
  }

  console.log(`[GainmapJPEG] HDR reconstruction complete: ${pixelCount} pixels, peak value=${maxValue.toFixed(3)}`);

  return { width, height, data: result, channels: 4 };
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
