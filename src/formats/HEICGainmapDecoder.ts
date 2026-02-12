/**
 * HEICGainmapDecoder - HEIC HDR (Gainmap) decoder
 *
 * Decodes HDR HEIC files (iPhone photos) that contain an embedded gain map.
 * HEIC uses the same ISOBMFF container as AVIF with HEVC (H.265) codec.
 *
 * Reuses ISOBMFF parsing infrastructure from AVIFGainmapDecoder.
 *
 * HEIC gain maps use:
 * - Primary image item (hvc1) — SDR base
 * - Auxiliary image item linked via `auxC` with type:
 *   - `urn:com:apple:photo:2020:aux:hdrgainmap` (Apple iPhone)
 *   - `urn:com:photo:aux:hdrgainmap` (ISO 21496-1 standard)
 * - Headroom stored in XMP metadata or tmap box
 *
 * HDR reconstruction formula (same as AVIF/JPEG gainmap):
 *   HDR_linear = sRGB_to_linear(base) * exp2(gainmap_gray * headroom)
 */

import {
  readBoxType,
  readBox,
  findBox,
  readNullTerminatedString,
  parsePitm,
  parseIinf,
  parseIloc,
  findItemWithProperty,
  findAuxlItem,
  extractHeadroom,
  srgbToLinear,
  type BoxInfo,
} from './AVIFGainmapDecoder';

// =============================================================================
// Types
// =============================================================================

export interface HEICGainmapInfo {
  primaryItemId: number;
  gainmapItemId: number;
  primaryOffset: number;
  primaryLength: number;
  gainmapOffset: number;
  gainmapLength: number;
  /** HDR headroom (typically 2.0-8.0 stops) */
  headroom: number;
  /** Raw hvcC box bytes for the gainmap item (needed by standalone wrapper) */
  gainmapHvcC: Uint8Array | null;
}

export interface HEICColorInfo {
  transferFunction: 'pq' | 'hlg' | 'srgb';
  colorPrimaries: 'bt2020' | 'bt709';
  isHDR: boolean;
}

// =============================================================================
// Brand detection
// =============================================================================

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevx']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

const APPLE_GAINMAP_URN = 'urn:com:apple:photo:2020:aux:hdrgainmap';
const ISO_GAINMAP_URN = 'urn:com:photo:aux:hdrgainmap';

// =============================================================================
// Detection
// =============================================================================

/**
 * Check if a buffer contains a HEIC file.
 * Checks ftyp box for HEIC-specific brands (heic, heix, hevc, heim, heis, hevm, hevx).
 * Returns false for AVIF files to avoid false positives.
 * Accepts mif1 only when compatible brands contain a HEVC brand.
 */
export function isHEICFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 16) return false;
  const view = new DataView(buffer);

  // Verify ftyp box at offset 4
  if (readBoxType(view, 4) !== 'ftyp') return false;

  const ftypSize = view.getUint32(0);
  if (ftypSize < 16 || ftypSize > buffer.byteLength) return false;

  const majorBrand = readBoxType(view, 8);

  // Exclude AVIF brands
  if (AVIF_BRANDS.has(majorBrand)) return false;

  // Direct HEIC brand match
  if (HEIC_BRANDS.has(majorBrand)) return true;

  // For mif1: scan compatible brands for HEVC brand
  if (majorBrand === 'mif1') {
    // Compatible brands start at offset 16 (after size+type+major_brand+minor_version)
    for (let offset = 16; offset + 4 <= ftypSize; offset += 4) {
      const compatBrand = readBoxType(view, offset);
      // If we find an AVIF brand first, this is AVIF not HEIC
      if (AVIF_BRANDS.has(compatBrand)) return false;
      if (HEIC_BRANDS.has(compatBrand)) return true;
    }
  }

  return false;
}

/**
 * Check if a HEIC buffer contains a gainmap auxiliary image.
 * Looks for auxC box with Apple or ISO gainmap URN in ipco.
 */
export function isGainmapHEIC(buffer: ArrayBuffer): boolean {
  if (!isHEICFile(buffer)) return false;

  const view = new DataView(buffer);
  const length = buffer.byteLength;

  const ftypSize = view.getUint32(0);

  // Find meta box (FullBox)
  const meta = findBox(view, 'meta', ftypSize, length, true);
  if (!meta) return false;

  // Find iprp → ipco
  const iprp = findBox(view, 'iprp', meta.dataStart, meta.dataEnd);
  if (!iprp) return false;

  const ipco = findBox(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return false;

  // Scan ipco for auxC box with gainmap URN (Apple or ISO)
  return hasHEICGainmapAuxC(view, ipco.dataStart, ipco.dataEnd);
}

/**
 * Check if ipco contains an auxC box matching a HEIC gainmap URN.
 */
function hasHEICGainmapAuxC(view: DataView, start: number, end: number): boolean {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(view, offset, end);
    if (!box) break;
    if (box.type === 'auxC') {
      // auxC is FullBox: header(8) + version+flags(4) then null-terminated string
      const auxTypeStart = offset + 12;
      if (auxTypeStart < box.boxEnd) {
        const auxType = readNullTerminatedString(view, auxTypeStart, box.boxEnd);
        if (auxType === APPLE_GAINMAP_URN || auxType === ISO_GAINMAP_URN) return true;
      }
    }
    offset = box.boxEnd;
  }
  return false;
}

// =============================================================================
// Parsing
// =============================================================================

/**
 * Find the 1-based property index of the auxC gainmap box in ipco.
 * Checks both Apple and ISO gainmap URNs (unlike AVIF which only checks ISO).
 */
function findHEICGainmapPropertyIndex(view: DataView, ipcoStart: number, ipcoEnd: number): number {
  let index = 0;
  let offset = ipcoStart;
  while (offset + 8 <= ipcoEnd) {
    const box = readBox(view, offset, ipcoEnd);
    if (!box) break;
    index++;

    if (box.type === 'auxC') {
      const auxTypeStart = offset + 12;
      if (auxTypeStart < box.boxEnd) {
        const str = readNullTerminatedString(view, auxTypeStart, box.boxEnd);
        if (str === APPLE_GAINMAP_URN || str === ISO_GAINMAP_URN) return index;
      }
    }

    offset = box.boxEnd;
  }
  return -1;
}

interface IpcoProperty {
  index: number;
  type: string;
  boxStart: number;
  boxEnd: number;
}

/**
 * Enumerate all properties in ipco with their 1-based indices and types.
 */
function enumerateIpcoProperties(view: DataView, ipcoStart: number, ipcoEnd: number): IpcoProperty[] {
  const properties: IpcoProperty[] = [];
  let index = 0;
  let offset = ipcoStart;
  while (offset + 8 <= ipcoEnd) {
    const box = readBox(view, offset, ipcoEnd);
    if (!box) break;
    index++;
    properties.push({
      index,
      type: box.type,
      boxStart: box.boxStart,
      boxEnd: box.boxEnd,
    });
    offset = box.boxEnd;
  }
  return properties;
}

/**
 * Get all property indices associated with an item ID from ipma box.
 */
function getItemPropertyIndices(view: DataView, ipma: BoxInfo, itemId: number): number[] {
  let pos = ipma.dataStart;
  const version = view.getUint8(ipma.boxStart + 8);
  const flags = view.getUint8(ipma.boxStart + 11);

  if (pos + 4 > ipma.dataEnd) return [];
  const entryCount = view.getUint32(pos);
  pos += 4;

  for (let i = 0; i < entryCount && pos < ipma.dataEnd; i++) {
    let currentItemId: number;
    if (version < 1) {
      if (pos + 2 > ipma.dataEnd) return [];
      currentItemId = view.getUint16(pos);
      pos += 2;
    } else {
      if (pos + 4 > ipma.dataEnd) return [];
      currentItemId = view.getUint32(pos);
      pos += 4;
    }

    if (pos + 1 > ipma.dataEnd) return [];
    const assocCount = view.getUint8(pos);
    pos += 1;

    const indices: number[] = [];
    for (let j = 0; j < assocCount && pos < ipma.dataEnd; j++) {
      let propIdx: number;
      if (flags & 1) {
        if (pos + 2 > ipma.dataEnd) return [];
        propIdx = view.getUint16(pos) & 0x7FFF;
        pos += 2;
      } else {
        if (pos + 1 > ipma.dataEnd) return [];
        propIdx = view.getUint8(pos) & 0x7F;
        pos += 1;
      }
      indices.push(propIdx);
    }

    if (currentItemId === itemId) return indices;
  }

  return [];
}

/**
 * Parse a HEIC gainmap file and extract item IDs, offsets, headroom, and hvcC.
 * Returns null if the file is not a valid HEIC gainmap.
 */
export function parseHEICGainmapInfo(buffer: ArrayBuffer): HEICGainmapInfo | null {
  if (buffer.byteLength < 16) return null;
  const view = new DataView(buffer);
  const length = buffer.byteLength;

  // Verify ftyp
  if (readBoxType(view, 4) !== 'ftyp') return null;
  const ftypSize = view.getUint32(0);
  if (ftypSize < 8 || ftypSize > length) return null;

  // Find meta box (FullBox)
  const meta = findBox(view, 'meta', ftypSize, length, true);
  if (!meta) return null;

  // 1. Parse pitm (primary item ID)
  const primaryItemId = parsePitm(view, meta.dataStart, meta.dataEnd);
  if (primaryItemId === null) return null;

  // 2. Parse iinf → infe entries (item IDs and types)
  const items = parseIinf(view, meta.dataStart, meta.dataEnd);

  // 3. Find iprp → ipco
  const iprp = findBox(view, 'iprp', meta.dataStart, meta.dataEnd);
  if (!iprp) return null;

  const ipco = findBox(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return null;

  // Find the 1-based index of the auxC gainmap property
  const gainmapPropertyIndex = findHEICGainmapPropertyIndex(view, ipco.dataStart, ipco.dataEnd);
  if (gainmapPropertyIndex === -1) return null;

  // 4. Parse ipma → find which item is associated with the gainmap property
  const ipma = findBox(view, 'ipma', iprp.dataStart, iprp.dataEnd, true);
  let gainmapItemId = -1;
  if (ipma) {
    gainmapItemId = findItemWithProperty(view, ipma, gainmapPropertyIndex);
  }

  // Fallback: check iref for auxl references
  if (gainmapItemId === -1) {
    const iref = findBox(view, 'iref', meta.dataStart, meta.dataEnd, true);
    if (iref) {
      gainmapItemId = findAuxlItem(view, iref, primaryItemId);
    }
  }

  if (gainmapItemId === -1) return null;

  // 5. Parse iloc → get byte ranges for primary and gainmap items
  const locations = parseIloc(view, meta.dataStart, meta.dataEnd);
  const primaryLoc = locations.find(l => l.itemId === primaryItemId);
  const gainmapLoc = locations.find(l => l.itemId === gainmapItemId);

  if (!primaryLoc || !gainmapLoc) return null;
  if (primaryLoc.extents.length === 0 || gainmapLoc.extents.length === 0) return null;

  const primaryOffset = primaryLoc.baseOffset + primaryLoc.extents[0]!.offset;
  const primaryLength = primaryLoc.extents.reduce((sum, e) => sum + e.length, 0);
  const gainmapOffset = gainmapLoc.baseOffset + gainmapLoc.extents[0]!.offset;
  const gainmapLength = gainmapLoc.extents.reduce((sum, e) => sum + e.length, 0);

  // 6. Extract headroom from XMP mime items or tmap box
  let headroom = extractHeadroom(view, buffer, items, locations, ipco.dataStart, ipco.dataEnd);
  if (headroom === null) {
    headroom = 2.0; // fallback
  }

  // 7. Extract hvcC for gainmap item (needed by standalone HEIC wrapper)
  let gainmapHvcC: Uint8Array | null = null;
  if (ipma) {
    const properties = enumerateIpcoProperties(view, ipco.dataStart, ipco.dataEnd);
    const gainmapPropIndices = getItemPropertyIndices(view, ipma, gainmapItemId);
    for (const propIdx of gainmapPropIndices) {
      const prop = properties.find(p => p.index === propIdx);
      if (prop && prop.type === 'hvcC') {
        // Copy the entire hvcC box (including header) for embedding in standalone wrapper
        gainmapHvcC = new Uint8Array(buffer.slice(prop.boxStart, prop.boxEnd));
        break;
      }
    }
  }

  return {
    primaryItemId,
    gainmapItemId,
    primaryOffset,
    primaryLength,
    gainmapOffset,
    gainmapLength,
    headroom,
    gainmapHvcC,
  };
}

// =============================================================================
// Color Info (Milestone 2)
// =============================================================================

/**
 * Parse HEIC ISOBMFF to extract color info from colr(nclx) box.
 * Same ISOBMFF structure as AVIF: meta → iprp → ipco → colr(nclx).
 */
export function parseHEICColorInfo(buffer: ArrayBuffer): HEICColorInfo | null {
  if (buffer.byteLength < 16) return null;
  const view = new DataView(buffer);
  const length = buffer.byteLength;

  if (readBoxType(view, 4) !== 'ftyp') return null;
  const ftypSize = view.getUint32(0);
  if (ftypSize < 8 || ftypSize > length) return null;

  const meta = findBox(view, 'meta', ftypSize, length, true);
  if (!meta) return null;

  const iprp = findBox(view, 'iprp', meta.dataStart, meta.dataEnd);
  if (!iprp) return null;

  const ipco = findBox(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return null;

  // Scan for colr(nclx) box in ipco
  let offset = ipco.dataStart;
  while (offset + 8 <= ipco.dataEnd) {
    const box = readBox(view, offset, ipco.dataEnd);
    if (!box) break;

    if (box.type === 'colr') {
      const cStart = box.dataStart;
      const cEnd = box.dataEnd;
      if (cStart + 4 <= cEnd) {
        const colourType = readBoxType(view, cStart);
        if (colourType === 'nclx' && cStart + 8 <= cEnd) {
          const primariesCode = view.getUint16(cStart + 4);
          const transferCode = view.getUint16(cStart + 6);

          let transferFunction: 'pq' | 'hlg' | 'srgb';
          if (transferCode === 16) {
            transferFunction = 'pq';
          } else if (transferCode === 18) {
            transferFunction = 'hlg';
          } else {
            transferFunction = 'srgb';
          }

          const colorPrimaries: 'bt2020' | 'bt709' = primariesCode === 9 ? 'bt2020' : 'bt709';
          const isHDR = transferFunction === 'pq' || transferFunction === 'hlg';

          if (isHDR) {
            return { transferFunction, colorPrimaries, isHDR: true };
          }
        }
      }
    }

    offset = box.boxEnd;
  }

  return null;
}

// =============================================================================
// Standalone HEIC builder
// =============================================================================

/**
 * Build a minimal standalone HEIC file wrapping raw HEVC item data.
 * Produces: ftyp(heic) + meta(hdlr, pitm, iinf/infe(hvc1), iprp/ipco/hvcC+ipma, iloc) + mdat
 *
 * Unlike AVIF (which doesn't need av1C), HEIC requires the hvcC (HEVC decoder
 * config record) in ipco for Safari's HEVC decoder to initialize. The hvcC
 * contains VPS/SPS/PPS NAL units.
 *
 * @param codedData - Raw HEVC coded data for the image item
 * @param hvcC - Complete hvcC box (including size+type header) from the source file
 */
export function buildStandaloneHEIC(codedData: Uint8Array, hvcC: Uint8Array): ArrayBuffer {
  const parts: Uint8Array[] = [];

  function pushUint32BE(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value);
    parts.push(buf);
  }

  function pushUint16BE(value: number): void {
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, value);
    parts.push(buf);
  }

  function pushString(str: string): void {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    parts.push(bytes);
  }

  function pushBytes(...values: number[]): void {
    parts.push(new Uint8Array(values));
  }

  // --- ftyp box ---
  pushUint32BE(16);
  pushString('ftyp');
  pushString('heic');
  pushUint32BE(0); // minor_version

  // --- meta box (FullBox) ---
  const hdlrSize = 33;
  const pitmSize = 14;
  const infeSize = 20;
  const iinfSize = 14 + infeSize;
  // ipco contains the hvcC box
  const ipcoSize = 8 + hvcC.length;
  // ipma: version=0, flags=0, entry_count(4) + item_id(2) + assoc_count(1) + entry(1)
  const ipmaSize = 4 + 4 + 4 + 4 + 2 + 1 + 1;
  const iprpSize = 8 + ipcoSize + ipmaSize;
  const ilocSize = 26;
  const mdatSize = 8 + codedData.length;
  const metaContentSize = hdlrSize + pitmSize + iinfSize + iprpSize + ilocSize;
  const metaSize = 12 + metaContentSize;
  const mdatDataOffset = 16 + metaSize + 8;

  pushUint32BE(metaSize);
  pushString('meta');
  pushUint32BE(0); // version + flags

  // hdlr
  pushUint32BE(hdlrSize);
  pushString('hdlr');
  pushUint32BE(0);
  pushUint32BE(0);
  pushString('pict');
  pushUint32BE(0);
  pushUint32BE(0);
  pushUint32BE(0);
  pushBytes(0);

  // pitm
  pushUint32BE(pitmSize);
  pushString('pitm');
  pushUint32BE(0);
  pushUint16BE(1);

  // iinf
  pushUint32BE(iinfSize);
  pushString('iinf');
  pushUint32BE(0);
  pushUint16BE(1);

  // infe (version 2, type='hvc1')
  pushUint32BE(infeSize);
  pushString('infe');
  pushUint32BE(0x02000000); // version=2, flags=0
  pushUint16BE(1);
  pushUint16BE(0);
  pushString('hvc1');

  // iprp
  pushUint32BE(iprpSize);
  pushString('iprp');

  // ipco (contains hvcC box as-is)
  pushUint32BE(ipcoSize);
  pushString('ipco');
  parts.push(hvcC);

  // ipma (associate item 1 with property 1 = hvcC)
  pushUint32BE(ipmaSize);
  pushString('ipma');
  pushUint32BE(0); // version=0, flags=0
  pushUint32BE(1); // entry_count=1
  pushUint16BE(1); // item_id=1
  pushBytes(1);    // association_count=1
  pushBytes(0x81); // essential=1, property_index=1

  // iloc (version 0, offset_size=4, length_size=4, base_offset_size=0)
  pushUint32BE(ilocSize);
  pushString('iloc');
  pushUint32BE(0);
  pushBytes(0x44);
  pushBytes(0x00);
  pushUint16BE(1);
  pushUint16BE(1);
  pushUint16BE(0);
  pushUint16BE(1);
  pushUint32BE(mdatDataOffset);
  pushUint32BE(codedData.length);

  // --- mdat ---
  pushUint32BE(mdatSize);
  pushString('mdat');
  parts.push(codedData);

  // Combine
  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  return result.buffer;
}

// =============================================================================
// Decoding
// =============================================================================

/**
 * Create canvas helper for pixel extraction.
 */
function createCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Scale a Uint8ClampedArray image to target dimensions via canvas.
 * Used when gainmap dimensions differ from base image dimensions.
 */
function scaleImageData(
  data: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8ClampedArray {
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    return data;
  }
  const srcCanvas = createCanvas(srcWidth, srcHeight);
  const srcCtx = srcCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  const imgData = srcCtx.createImageData(srcWidth, srcHeight);
  imgData.data.set(data);
  srcCtx.putImageData(imgData, 0, 0);

  const dstCanvas = createCanvas(dstWidth, dstHeight);
  const dstCtx = dstCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  dstCtx.drawImage(srcCanvas as CanvasImageSource, 0, 0, dstWidth, dstHeight);
  return dstCtx.getImageData(0, 0, dstWidth, dstHeight).data;
}

/**
 * Decode a HEIC gainmap to a float32 image with HDR data.
 *
 * Uses browser's native HEIC decoder via createImageBitmap (Safari),
 * with a WASM fallback via libheif-js for Chrome/Firefox/Edge.
 */
export async function decodeHEICGainmapToFloat32(
  buffer: ArrayBuffer,
  info: HEICGainmapInfo
): Promise<{
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
}> {
  let baseData: Uint8ClampedArray;
  let gainData: Uint8ClampedArray;
  let width: number;
  let height: number;

  // Build standalone HEIC for the gain map's coded data
  const gainmapCodedData = new Uint8Array(buffer, info.gainmapOffset, info.gainmapLength);

  try {
    // Native path (Safari)
    const baseBlob = new Blob([buffer], { type: 'image/heic' });

    let gainmapBlob: Blob;
    if (info.gainmapHvcC) {
      const gainmapHEIC = buildStandaloneHEIC(gainmapCodedData, info.gainmapHvcC);
      gainmapBlob = new Blob([gainmapHEIC], { type: 'image/heic' });
    } else {
      gainmapBlob = new Blob([gainmapCodedData], { type: 'image/heic' });
    }

    const [baseBitmap, gainmapBitmap] = await Promise.all([
      createImageBitmap(baseBlob),
      createImageBitmap(gainmapBlob),
    ]);

    width = baseBitmap.width;
    height = baseBitmap.height;

    // Draw base to canvas and get pixel data
    const baseCanvas = createCanvas(width, height);
    const baseCtx = baseCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    baseCtx.drawImage(baseBitmap, 0, 0);
    baseData = baseCtx.getImageData(0, 0, width, height).data;
    baseBitmap.close();

    // Gainmap may be smaller — scale up to base image size
    const gainCanvas = createCanvas(width, height);
    const gainCtx = gainCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    gainCtx.drawImage(gainmapBitmap, 0, 0, width, height);
    gainData = gainCtx.getImageData(0, 0, width, height).data;
    gainmapBitmap.close();
  } catch {
    // WASM fallback (Chrome/Firefox/Edge)
    const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

    const baseResult = await decodeHEICToImageData(buffer);
    width = baseResult.width;
    height = baseResult.height;
    baseData = baseResult.data;

    // Decode gainmap: build standalone HEIC wrapper then decode via WASM
    const gainmapBuffer = info.gainmapHvcC
      ? buildStandaloneHEIC(gainmapCodedData, info.gainmapHvcC)
      : buffer.slice(info.gainmapOffset, info.gainmapOffset + info.gainmapLength);
    const gainResult = await decodeHEICToImageData(gainmapBuffer);

    // Scale gainmap to base dimensions if they differ
    gainData = scaleImageData(
      gainResult.data,
      gainResult.width,
      gainResult.height,
      width,
      height
    );
  }

  // Apply HDR reconstruction per-pixel
  // HDR_linear = sRGB_to_linear(base) * exp2(gainmap_gray * headroom)
  const pixelCount = width * height;
  const result = new Float32Array(pixelCount * 4);
  const headroom = info.headroom;

  // Pre-compute sRGB-to-linear LUT for uint8 values (0-255)
  const srgbLUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    srgbLUT[i] = srgbToLinear(i / 255.0);
  }

  // Pre-compute gain LUT: gain = 2^(v/255 * headroom) = exp(v/255 * headroom * LN2)
  const gainLUT = new Float32Array(256);
  const headroomLN2 = headroom * Math.LN2;
  for (let i = 0; i < 256; i++) {
    gainLUT[i] = Math.exp((i / 255.0) * headroomLN2);
  }

  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4;
    const dstIdx = i * 4;

    const r = srgbLUT[baseData[srcIdx]!]!;
    const g = srgbLUT[baseData[srcIdx + 1]!]!;
    const b = srgbLUT[baseData[srcIdx + 2]!]!;

    // Gainmap is grayscale — use red channel
    const gain = gainLUT[gainData[srcIdx]!]!;

    result[dstIdx] = r * gain;
    result[dstIdx + 1] = g * gain;
    result[dstIdx + 2] = b * gain;
    result[dstIdx + 3] = 1.0;
  }

  return { width, height, data: result, channels: 4 };
}
