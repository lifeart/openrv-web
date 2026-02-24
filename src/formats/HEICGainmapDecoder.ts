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
  getItemPropertyIndices,
  parseISOBMFFOrientation,
  parseISOBMFFTransforms,
  parseTmapBox,
} from './AVIFGainmapDecoder';
import { drawImageWithOrientation } from './shared';
import { type GainMapMetadata, parseGainMapMetadataFromXMP, tmapToGainMapMetadata, reconstructHDR, defaultGainMapMetadata } from './GainMapMetadata';

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
  /** Gainmap image width from ispe property */
  gainmapWidth: number;
  /** Gainmap image height from ispe property */
  gainmapHeight: number;
  /** Full gain map metadata (ISO 21496-1) */
  gainMapMetadata?: GainMapMetadata;
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

// getItemPropertyIndices is imported from AVIFGainmapDecoder

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

  // 6. Extract headroom and full metadata from XMP mime items or tmap box
  const metaResult = extractHEICGainMapMetadata(view, buffer, items, locations, ipco.dataStart, ipco.dataEnd);
  let headroom = metaResult?.headroom ?? null;
  const gainMapMetadata = metaResult?.metadata;

  if (headroom === null) {
    headroom = extractHeadroom(view, buffer, items, locations, ipco.dataStart, ipco.dataEnd) ?? 2.0;
  }

  // 7. Extract hvcC and ispe for gainmap item (needed by standalone HEIC wrapper)
  let gainmapHvcC: Uint8Array | null = null;
  let gainmapWidth = 0;
  let gainmapHeight = 0;
  if (ipma) {
    const properties = enumerateIpcoProperties(view, ipco.dataStart, ipco.dataEnd);
    const gainmapPropIndices = getItemPropertyIndices(view, ipma, gainmapItemId);
    for (const propIdx of gainmapPropIndices) {
      const prop = properties.find(p => p.index === propIdx);
      if (prop && prop.type === 'hvcC') {
        // Copy the entire hvcC box (including header) for embedding in standalone wrapper
        gainmapHvcC = new Uint8Array(buffer.slice(prop.boxStart, prop.boxEnd));
      } else if (prop && prop.type === 'ispe') {
        // ispe FullBox: header(8) + version+flags(4) + width(4) + height(4)
        const ispeDataStart = prop.boxStart + 12;
        if (ispeDataStart + 8 <= prop.boxEnd) {
          gainmapWidth = view.getUint32(ispeDataStart);
          gainmapHeight = view.getUint32(ispeDataStart + 4);
        }
      }
    }
    // Fallback: if gainmap has no hvcC, use primary's hvcC (shared decoder config)
    if (!gainmapHvcC) {
      const primaryPropIndices = getItemPropertyIndices(view, ipma, primaryItemId);
      for (const propIdx of primaryPropIndices) {
        const prop = properties.find(p => p.index === propIdx);
        if (prop && prop.type === 'hvcC') {
          gainmapHvcC = new Uint8Array(buffer.slice(prop.boxStart, prop.boxEnd));
          break;
        }
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
    gainmapWidth,
    gainmapHeight,
    gainMapMetadata,
  };
}

/**
 * Extract full gain map metadata from HEIC XMP or tmap box.
 */
function extractHEICGainMapMetadata(
  view: DataView,
  buffer: ArrayBuffer,
  items: import('./AVIFGainmapDecoder').ItemEntry[],
  locations: import('./AVIFGainmapDecoder').ItemLocation[],
  ipcoStart: number,
  ipcoEnd: number
): { headroom: number; metadata: GainMapMetadata } | null {
  // Try XMP from mime-type items
  for (const item of items) {
    if (item.type === 'mime') {
      const loc = locations.find(l => l.itemId === item.id);
      if (!loc || loc.extents.length === 0) continue;

      const offset = loc.baseOffset + loc.extents[0]!.offset;
      const length = loc.extents.reduce((sum, e) => sum + e.length, 0);
      if (offset + length > buffer.byteLength) continue;

      const bytes = new Uint8Array(buffer, offset, length);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

      if (text.includes('xmlns:') || text.includes('http://ns.adobe.com/')) {
        const meta = parseGainMapMetadataFromXMP(text);
        if (meta) {
          return { headroom: meta.hdrCapacityMax, metadata: meta };
        }
      }
    }
  }

  // Try tmap box in ipco
  let offset = ipcoStart;
  while (offset + 8 <= ipcoEnd) {
    const box = readBox(view, offset, ipcoEnd);
    if (!box) break;
    if (box.type === 'tmap') {
      const tmap = parseTmapBox(view, box.dataStart, box.dataEnd);
      if (tmap) {
        const meta = tmapToGainMapMetadata(tmap);
        return { headroom: meta.hdrCapacityMax, metadata: meta };
      }
    }
    offset = box.boxEnd;
  }

  return null;
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
 * @param width - Image width (from ispe property)
 * @param height - Image height (from ispe property)
 * @param irotAngle - Optional irot rotation angle (0-3) to embed
 * @param imirAxis - Optional imir mirror axis (0 or 1) to embed
 */
export function buildStandaloneHEIC(
  codedData: Uint8Array, hvcC: Uint8Array, width: number, height: number,
  irotAngle?: number, imirAxis?: number,
): ArrayBuffer {
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
  const ftypSize = 24; // size(4) + type(4) + major(4) + minor(4) + 2 compatible brands(8)
  pushUint32BE(ftypSize);
  pushString('ftyp');
  pushString('heic');
  pushUint32BE(0); // minor_version
  pushString('mif1'); // compatible brand (required by libheif)
  pushString('heic'); // compatible brand

  // --- meta box (FullBox) ---
  const hdlrSize = 33;
  const pitmSize = 14;
  const infeSize = 20;
  const iinfSize = 14 + infeSize;
  // ipco contains hvcC + ispe boxes, plus optional irot and imir
  const ispeSize = 20; // size(4) + type(4) + version+flags(4) + width(4) + height(4)
  const hasIrot = irotAngle !== undefined;
  const hasImir = imirAxis !== undefined;
  const irotBoxSize = hasIrot ? 9 : 0; // size(4) + type(4) + angle(1)
  const imirBoxSize = hasImir ? 9 : 0; // size(4) + type(4) + axis(1)
  const ipcoSize = 8 + hvcC.length + ispeSize + irotBoxSize + imirBoxSize;
  // ipma: version=0, flags=0, entry_count(4) + item_id(2) + assoc_count(1) + N entries
  const assocCount = 2 + (hasIrot ? 1 : 0) + (hasImir ? 1 : 0);
  const ipmaSize = 4 + 4 + 4 + 4 + 2 + 1 + assocCount;
  const iprpSize = 8 + ipcoSize + ipmaSize;
  const ilocSize = 30;
  const mdatSize = 8 + codedData.length;
  const metaContentSize = hdlrSize + pitmSize + iinfSize + iprpSize + ilocSize;
  const metaSize = 12 + metaContentSize;
  const mdatDataOffset = ftypSize + metaSize + 8;

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

  // ipco (contains hvcC + ispe + optional irot + optional imir boxes)
  pushUint32BE(ipcoSize);
  pushString('ipco');
  parts.push(hvcC);

  // ispe (image spatial extents)
  pushUint32BE(ispeSize);
  pushString('ispe');
  pushUint32BE(0); // version=0, flags=0
  pushUint32BE(width);
  pushUint32BE(height);

  // Optional irot box (property index = 3 if present)
  if (hasIrot) {
    pushUint32BE(9);
    pushString('irot');
    pushBytes(irotAngle! & 0x03);
  }

  // Optional imir box (property index = 3 or 4 depending on irot)
  if (hasImir) {
    pushUint32BE(9);
    pushString('imir');
    pushBytes(imirAxis! & 0x01);
  }

  // ipma (associate item 1 with properties)
  pushUint32BE(ipmaSize);
  pushString('ipma');
  pushUint32BE(0); // version=0, flags=0
  pushUint32BE(1); // entry_count=1
  pushUint16BE(1); // item_id=1
  pushBytes(assocCount); // association_count
  pushBytes(0x81); // essential=1, property_index=1 (hvcC)
  pushBytes(0x82); // essential=1, property_index=2 (ispe)
  let nextPropIdx = 3;
  if (hasIrot) {
    pushBytes(0x80 | nextPropIdx); // essential=1, property_index for irot
    nextPropIdx++;
  }
  if (hasImir) {
    pushBytes(0x80 | nextPropIdx); // essential=1, property_index for imir
  }

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

  // Parse orientation from HEIC ISOBMFF container
  const heicView = new DataView(buffer);
  const ftypSize = heicView.getUint32(0);
  const meta = findBox(heicView, 'meta', ftypSize, buffer.byteLength, true);
  const orientation = meta ? parseISOBMFFOrientation(heicView, meta.dataStart, meta.dataEnd) : 1;

  // Build standalone HEIC for the gain map's coded data
  const gainmapCodedData = new Uint8Array(buffer, info.gainmapOffset, info.gainmapLength);

  try {
    // Native path (Safari)
    const baseBlob = new Blob([buffer], { type: 'image/heic' });

    let gainmapBlob: Blob;
    if (info.gainmapHvcC) {
      const gainmapHEIC = buildStandaloneHEIC(gainmapCodedData, info.gainmapHvcC, info.gainmapWidth, info.gainmapHeight);
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
    // Apply orientation transform so gainmap pixels align with the display-rotated base
    const gainCanvas = createCanvas(width, height);
    const gainCtx = gainCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    drawImageWithOrientation(gainCtx, gainmapBitmap, width, height, orientation);
    gainData = gainCtx.getImageData(0, 0, width, height).data;
    gainmapBitmap.close();
  } catch {
    // WASM fallback (Chrome/Firefox/Edge)
    // Embed matching irot/imir boxes so libheif applies the same rotation to gainmap
    const transforms = meta ? parseISOBMFFTransforms(heicView, meta.dataStart, meta.dataEnd) : {};
    const { decodeHEICToImageData } = await import('./HEICWasmDecoder');

    const baseResult = await decodeHEICToImageData(buffer);
    width = baseResult.width;
    height = baseResult.height;
    baseData = baseResult.data;

    // Decode gainmap via standalone HEIC wrapper with matching transforms
    if (!info.gainmapHvcC) {
      throw new Error('Cannot decode HEIC gainmap: no hvcC decoder configuration found');
    }
    const gainmapHEIC = buildStandaloneHEIC(
      gainmapCodedData, info.gainmapHvcC, info.gainmapWidth, info.gainmapHeight,
      transforms.irotAngle, transforms.imirAxis
    );
    const gainResult = await decodeHEICToImageData(gainmapHEIC);

    // Scale gainmap to base dimensions if they differ
    gainData = scaleImageData(
      gainResult.data,
      gainResult.width,
      gainResult.height,
      width,
      height
    );
  }

  // Apply HDR reconstruction per-pixel using shared module
  const pixelCount = width * height;
  const gainMeta = info.gainMapMetadata ?? defaultGainMapMetadata(info.headroom);
  const result = reconstructHDR(baseData, gainData, pixelCount, gainMeta);

  return { width, height, data: result, channels: 4 };
}
