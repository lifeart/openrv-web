/**
 * AVIFGainmapDecoder - AVIF HDR (Gainmap) decoder
 *
 * Decodes HDR AVIF files that contain an embedded gain map via ISOBMFF
 * auxiliary image items per ISO 21496-1.
 *
 * AVIF gain maps use:
 * - Primary image item (av01) — SDR base
 * - Auxiliary image item linked via `auxC` with type `urn:com:photo:aux:hdrgainmap`
 * - Headroom stored in XMP metadata (mime item) or tmap box
 *
 * HDR reconstruction formula (same as JPEG gainmap):
 *   HDR_linear = sRGB_to_linear(base) * exp2(gainmap_gray * headroom)
 */

import { drawImageWithOrientation } from './shared';

export interface AVIFGainmapInfo {
  primaryItemId: number;
  gainmapItemId: number;
  primaryOffset: number;
  primaryLength: number;
  gainmapOffset: number;
  gainmapLength: number;
  /** HDR headroom (typically 2.0-8.0 stops) */
  headroom: number;
}

// =============================================================================
// ISOBMFF box traversal helpers
// =============================================================================

export function readBoxType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

export interface BoxInfo {
  type: string;
  /** Byte offset where the box starts (box header) */
  boxStart: number;
  headerSize: number;
  dataStart: number;
  dataEnd: number;
  boxEnd: number;
}

/**
 * Read box header at given offset. Returns null if not enough bytes.
 * For FullBox types, set isFullBox=true to skip version+flags (4 bytes).
 */
export function readBox(view: DataView, offset: number, end: number, isFullBox = false): BoxInfo | null {
  if (offset + 8 > end) return null;
  let boxSize = view.getUint32(offset);
  const type = readBoxType(view, offset + 4);

  let headerSize = 8;
  if (boxSize === 1) {
    // Extended size (64-bit)
    if (offset + 16 > end) return null;
    const high = view.getUint32(offset + 8);
    const low = view.getUint32(offset + 12);
    boxSize = high * 0x100000000 + low;
    headerSize = 16;
  } else if (boxSize === 0) {
    // Box extends to end of container
    boxSize = end - offset;
  }

  if (boxSize < headerSize || offset + boxSize > end) return null;

  const fullBoxExtra = isFullBox ? 4 : 0;
  return {
    type,
    boxStart: offset,
    headerSize: headerSize + fullBoxExtra,
    dataStart: offset + headerSize + fullBoxExtra,
    dataEnd: offset + boxSize,
    boxEnd: offset + boxSize,
  };
}

/**
 * Find a box by type within a range.
 */
export function findBox(view: DataView, type: string, start: number, end: number, isFullBox = false): BoxInfo | null {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(view, offset, end, isFullBox);
    if (!box) break;
    if (box.type === type) return box;
    offset = box.boxEnd;
  }
  return null;
}

// =============================================================================
// Detection
// =============================================================================

/**
 * Check if a buffer contains an AVIF file with a gainmap auxiliary image.
 * Looks for auxC box with `urn:com:photo:aux:hdrgainmap` in ipco.
 */
export function isGainmapAVIF(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  const length = buffer.byteLength;

  // Verify ftyp box
  const boxType = readBoxType(view, 4);
  if (boxType !== 'ftyp') return false;
  const brand = readBoxType(view, 8);
  if (brand !== 'avif' && brand !== 'avis' && brand !== 'mif1') return false;

  const ftypSize = view.getUint32(0);
  if (ftypSize < 8 || ftypSize > length) return false;

  // Find meta box (FullBox)
  const meta = findBox(view, 'meta', ftypSize, length, true);
  if (!meta) return false;

  // Find iprp → ipco
  const iprp = findBox(view, 'iprp', meta.dataStart, meta.dataEnd);
  if (!iprp) return false;

  const ipco = findBox(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return false;

  // Scan ipco for auxC box with gainmap URN
  return hasGainmapAuxC(view, ipco.dataStart, ipco.dataEnd);
}

const GAINMAP_URN = 'urn:com:photo:aux:hdrgainmap';

/**
 * Check if ipco contains an auxC box matching the gainmap URN.
 * Iterates property boxes WITHOUT FullBox assumption — only auxC
 * is read as FullBox (version+flags skipped manually).
 */
function hasGainmapAuxC(view: DataView, start: number, end: number): boolean {
  let offset = start;
  while (offset + 8 <= end) {
    // Read as plain box — ipco properties are NOT all FullBoxes
    const box = readBox(view, offset, end);
    if (!box) break;
    if (box.type === 'auxC') {
      // auxC IS a FullBox: data is at offset+8 (basic header) + 4 (version+flags) = offset+12
      const auxTypeStart = offset + 12;
      if (auxTypeStart < box.boxEnd) {
        const auxType = readNullTerminatedString(view, auxTypeStart, box.boxEnd);
        if (auxType === GAINMAP_URN) return true;
      }
    }
    offset = box.boxEnd;
  }
  return false;
}

export function readNullTerminatedString(view: DataView, start: number, end: number): string {
  const chars: string[] = [];
  for (let i = start; i < end; i++) {
    const byte = view.getUint8(i);
    if (byte === 0) break;
    chars.push(String.fromCharCode(byte));
  }
  return chars.join('');
}

// =============================================================================
// Parsing
// =============================================================================

export interface ItemEntry {
  id: number;
  type: string;
}

export interface ItemLocation {
  itemId: number;
  constructionMethod: number;
  baseOffset: number;
  extents: { offset: number; length: number }[];
}

/**
 * Parse a gainmap AVIF and extract item IDs, offsets, and headroom.
 * Returns null if the file is not a valid gainmap AVIF.
 */
export function parseGainmapAVIF(buffer: ArrayBuffer): AVIFGainmapInfo | null {
  if (buffer.byteLength < 12) return null;
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

  // 3. Find iprp → ipco: enumerate properties with 1-based index
  const iprp = findBox(view, 'iprp', meta.dataStart, meta.dataEnd);
  if (!iprp) return null;

  const ipco = findBox(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return null;

  // Find the 1-based index of the auxC gainmap property
  const gainmapPropertyIndex = findGainmapPropertyIndex(view, ipco.dataStart, ipco.dataEnd);
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

  return {
    primaryItemId,
    gainmapItemId,
    primaryOffset,
    primaryLength,
    gainmapOffset,
    gainmapLength,
    headroom,
  };
}

// =============================================================================
// ISOBMFF sub-box parsers
// =============================================================================

/**
 * Parse pitm (primary item ID) box.
 */
export function parsePitm(view: DataView, start: number, end: number): number | null {
  const pitm = findBox(view, 'pitm', start, end, true);
  if (!pitm) return null;

  // Read version from FullBox header (at boxStart + 8)
  const version = view.getUint8(pitm.boxStart + 8);
  if (version === 0) {
    if (pitm.dataStart + 2 > pitm.dataEnd) return null;
    return view.getUint16(pitm.dataStart);
  } else {
    // version >= 1: item_id is uint32
    if (pitm.dataStart + 4 > pitm.dataEnd) return null;
    return view.getUint32(pitm.dataStart);
  }
}

/**
 * Parse iinf box → list of infe entries with item IDs and types.
 */
export function parseIinf(view: DataView, metaStart: number, metaEnd: number): ItemEntry[] {
  const iinf = findBox(view, 'iinf', metaStart, metaEnd, true);
  if (!iinf) return [];

  const items: ItemEntry[] = [];

  // Read iinf version from FullBox header
  const iinfVersion = view.getUint8(iinf.boxStart + 8);

  let countOffset = iinf.dataStart;
  let entryCount: number;
  if (iinfVersion === 0) {
    if (countOffset + 2 > iinf.dataEnd) return [];
    entryCount = view.getUint16(countOffset);
    countOffset += 2;
  } else {
    if (countOffset + 4 > iinf.dataEnd) return [];
    entryCount = view.getUint32(countOffset);
    countOffset += 4;
  }

  // Parse infe boxes
  let offset = countOffset;
  for (let i = 0; i < entryCount && offset + 8 <= iinf.dataEnd; i++) {
    const infe = readBox(view, offset, iinf.dataEnd, true);
    if (!infe || infe.type !== 'infe') {
      if (!infe) break;
      offset = infe.boxEnd;
      continue;
    }

    // Read infe version from FullBox header
    const infeVersion = view.getUint8(infe.boxStart + 8);

    if (infeVersion >= 2) {
      let pos = infe.dataStart;
      let itemId: number;
      if (infeVersion === 2) {
        if (pos + 2 > infe.dataEnd) { offset = infe.boxEnd; continue; }
        itemId = view.getUint16(pos);
        pos += 2;
      } else {
        // version 3: uint32
        if (pos + 4 > infe.dataEnd) { offset = infe.boxEnd; continue; }
        itemId = view.getUint32(pos);
        pos += 4;
      }
      pos += 2; // skip item_protection_index

      if (pos + 4 > infe.dataEnd) { offset = infe.boxEnd; continue; }
      const itemType = readBoxType(view, pos);
      items.push({ id: itemId, type: itemType });
    }

    offset = infe.boxEnd;
  }

  return items;
}

/**
 * Find the 1-based property index of the auxC gainmap box in ipco.
 * Iterates property boxes as plain boxes (not FullBox).
 */
function findGainmapPropertyIndex(view: DataView, ipcoStart: number, ipcoEnd: number): number {
  let index = 0;
  let offset = ipcoStart;
  while (offset + 8 <= ipcoEnd) {
    const box = readBox(view, offset, ipcoEnd);
    if (!box) break;
    index++; // 1-based

    if (box.type === 'auxC') {
      // auxC is a FullBox: data at offset+8 (header) + 4 (version+flags) = offset+12
      const auxTypeStart = offset + 12;
      if (auxTypeStart < box.boxEnd) {
        const str = readNullTerminatedString(view, auxTypeStart, box.boxEnd);
        if (str === GAINMAP_URN) return index;
      }
    }

    offset = box.boxEnd;
  }
  return -1;
}

/**
 * Parse ipma box to find which item ID is associated with a given property index.
 * Takes the full BoxInfo so version can be read from the box header.
 */
export function findItemWithProperty(view: DataView, ipma: BoxInfo, propertyIndex: number): number {
  let pos = ipma.dataStart;

  // Read version and flags from FullBox header
  const version = view.getUint8(ipma.boxStart + 8);
  const flags = view.getUint8(ipma.boxStart + 11);

  if (pos + 4 > ipma.dataEnd) return -1;
  const entryCount = view.getUint32(pos);
  pos += 4;

  for (let i = 0; i < entryCount && pos < ipma.dataEnd; i++) {
    let itemId: number;
    if (version < 1) {
      if (pos + 2 > ipma.dataEnd) return -1;
      itemId = view.getUint16(pos);
      pos += 2;
    } else {
      if (pos + 4 > ipma.dataEnd) return -1;
      itemId = view.getUint32(pos);
      pos += 4;
    }

    if (pos + 1 > ipma.dataEnd) return -1;
    const assocCount = view.getUint8(pos);
    pos += 1;

    for (let j = 0; j < assocCount && pos < ipma.dataEnd; j++) {
      let propIdx: number;
      if (flags & 1) {
        // 16-bit entries: 1 bit essential + 15 bits property index
        if (pos + 2 > ipma.dataEnd) return -1;
        const val = view.getUint16(pos);
        propIdx = val & 0x7FFF;
        pos += 2;
      } else {
        // 8-bit entries: 1 bit essential + 7 bits property index
        if (pos + 1 > ipma.dataEnd) return -1;
        const val = view.getUint8(pos);
        propIdx = val & 0x7F;
        pos += 1;
      }

      if (propIdx === propertyIndex) return itemId;
    }
  }

  return -1;
}

/**
 * Find auxiliary item ID from iref box (auxl reference type).
 * Takes the full BoxInfo so version can be read from the box header.
 */
export function findAuxlItem(view: DataView, iref: BoxInfo, primaryItemId: number): number {
  let offset = iref.dataStart;
  // Read version from FullBox header
  const version = view.getUint8(iref.boxStart + 8);

  while (offset + 8 <= iref.dataEnd) {
    const box = readBox(view, offset, iref.dataEnd);
    if (!box) break;

    if (box.type === 'auxl') {
      let pos = box.dataStart;
      let fromItemId: number;
      let refCount: number;

      if (version === 0) {
        if (pos + 4 > box.dataEnd) { offset = box.boxEnd; continue; }
        fromItemId = view.getUint16(pos); pos += 2;
        refCount = view.getUint16(pos); pos += 2;
      } else {
        if (pos + 6 > box.dataEnd) { offset = box.boxEnd; continue; }
        fromItemId = view.getUint32(pos); pos += 4;
        refCount = view.getUint16(pos); pos += 2;
      }

      // auxl: from=gainmap_item, to=primary_item
      for (let i = 0; i < refCount; i++) {
        let toItemId: number;
        if (version === 0) {
          if (pos + 2 > box.dataEnd) break;
          toItemId = view.getUint16(pos); pos += 2;
        } else {
          if (pos + 4 > box.dataEnd) break;
          toItemId = view.getUint32(pos); pos += 4;
        }
        if (toItemId === primaryItemId) return fromItemId;
      }
    }

    offset = box.boxEnd;
  }
  return -1;
}

/**
 * Parse iloc box to get item locations.
 */
export function parseIloc(view: DataView, metaStart: number, metaEnd: number): ItemLocation[] {
  const iloc = findBox(view, 'iloc', metaStart, metaEnd, true);
  if (!iloc) return [];

  // Read version from FullBox header
  const version = view.getUint8(iloc.boxStart + 8);

  let pos = iloc.dataStart;
  if (pos + 2 > iloc.dataEnd) return [];

  // Size fields packed into two bytes
  const sizeByte1 = view.getUint8(pos);
  const sizeByte2 = view.getUint8(pos + 1);
  pos += 2;

  const offsetSize = (sizeByte1 >> 4) & 0xF;
  const lengthSize = sizeByte1 & 0xF;
  const baseOffsetSize = (sizeByte2 >> 4) & 0xF;
  const indexSize = version >= 1 ? (sizeByte2 & 0xF) : 0;

  let itemCount: number;
  if (version < 2) {
    if (pos + 2 > iloc.dataEnd) return [];
    itemCount = view.getUint16(pos);
    pos += 2;
  } else {
    if (pos + 4 > iloc.dataEnd) return [];
    itemCount = view.getUint32(pos);
    pos += 4;
  }

  const locations: ItemLocation[] = [];

  for (let i = 0; i < itemCount && pos < iloc.dataEnd; i++) {
    let itemId: number;
    if (version < 2) {
      if (pos + 2 > iloc.dataEnd) break;
      itemId = view.getUint16(pos);
      pos += 2;
    } else {
      if (pos + 4 > iloc.dataEnd) break;
      itemId = view.getUint32(pos);
      pos += 4;
    }

    let constructionMethod = 0;
    if (version >= 1) {
      if (pos + 2 > iloc.dataEnd) break;
      constructionMethod = view.getUint16(pos) & 0xF;
      pos += 2;
    }

    // data_reference_index (uint16)
    if (pos + 2 > iloc.dataEnd) break;
    pos += 2; // skip

    // base_offset
    const baseOffset = readSizedUint(view, pos, baseOffsetSize);
    pos += baseOffsetSize;

    // extent_count (uint16)
    if (pos + 2 > iloc.dataEnd) break;
    const extentCount = view.getUint16(pos);
    pos += 2;

    const extents: { offset: number; length: number }[] = [];
    for (let j = 0; j < extentCount && pos < iloc.dataEnd; j++) {
      if (version >= 1 && indexSize > 0) {
        pos += indexSize; // skip extent_index
      }
      const extOffset = readSizedUint(view, pos, offsetSize);
      pos += offsetSize;
      const extLength = readSizedUint(view, pos, lengthSize);
      pos += lengthSize;
      extents.push({ offset: extOffset, length: extLength });
    }

    locations.push({ itemId, constructionMethod, baseOffset, extents });
  }

  return locations;
}

/**
 * Read an unsigned integer of the given byte size from a DataView.
 * Valid ISOBMFF sizes are 0, 2, 4, or 8.
 */
function readSizedUint(view: DataView, offset: number, size: number): number {
  switch (size) {
    case 0: return 0;
    case 2: return view.getUint16(offset);
    case 4: return view.getUint32(offset);
    case 8: {
      const high = view.getUint32(offset);
      const low = view.getUint32(offset + 4);
      return high * 0x100000000 + low;
    }
    default: return 0;
  }
}

// =============================================================================
// Headroom extraction
// =============================================================================

/**
 * Extract headroom from XMP metadata (mime items) or tmap box.
 */
export function extractHeadroom(
  view: DataView,
  buffer: ArrayBuffer,
  items: ItemEntry[],
  locations: ItemLocation[],
  ipcoStart: number,
  ipcoEnd: number
): number | null {
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
        const headroom = parseHeadroomFromXMPText(text);
        if (headroom !== null) return headroom;
      }
    }
  }

  // Try tmap box in ipco (ISO 21496-1 tone map metadata)
  let offset = ipcoStart;
  while (offset + 8 <= ipcoEnd) {
    const box = readBox(view, offset, ipcoEnd);
    if (!box) break;
    if (box.type === 'tmap') {
      const headroom = parseTmapHeadroom(view, box.dataStart, box.dataEnd);
      if (headroom !== null) return headroom;
    }
    offset = box.boxEnd;
  }

  return null;
}

/**
 * Parse headroom value from XMP text content.
 * Matches apple:hdrgainmapheadroom, hdrgm:GainMapMax, or HDRGainMapHeadroom attributes.
 */
export function parseHeadroomFromXMPText(xmpText: string): number | null {
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

/**
 * Parsed ISO 21496-1 tone_map_metadata from tmap box.
 */
export interface TmapMetadata {
  channelCount: number;
  gainMapMin: number[];
  gainMapMax: number[];
  gainMapGamma: number[];
  baseOffset: number[];
  alternateOffset: number[];
  baseHdrHeadroom: number;
  alternateHdrHeadroom: number;
}

/**
 * Parse tmap box per ISO 21496-1 tone_map_metadata_box structure.
 *
 * Layout (all uint32 big-endian):
 *   version (1 byte): 0
 *   flags (3 bytes): bit 0 of flags byte = channel_count flag
 *     0 → 1 channel (monochrome gain map), 1 → 3 channels
 *   Per-channel arrays (1 or 3 values each):
 *     gainMapMinN[], gainMapMinD[]
 *     gainMapMaxN[], gainMapMaxD[]
 *     gainMapGammaN[], gainMapGammaD[]
 *     baseOffsetN[], baseOffsetD[]
 *     alternateOffsetN[], alternateOffsetD[]
 *   Scalar fields:
 *     baseHdrHeadroomN (uint32), baseHdrHeadroomD (uint32)
 *     alternateHdrHeadroomN (uint32), alternateHdrHeadroomD (uint32)
 */
export function parseTmapBox(view: DataView, start: number, end: number): TmapMetadata | null {
  // Need at least version(1) + flags(3) = 4 bytes
  if (start + 4 > end) return null;

  const version = view.getUint8(start);
  if (version !== 0) return null;

  // flags: 3 bytes at start+1..start+3; channel_count flag is bit 0 of the flags field
  const flagsByte = view.getUint8(start + 3);
  const channelCount = (flagsByte & 1) ? 3 : 1;

  let pos = start + 4;

  function readUint32(): number | null {
    if (pos + 4 > end) return null;
    const val = view.getUint32(pos);
    pos += 4;
    return val;
  }

  function readRatioArray(count: number): number[] | null {
    const numerators: number[] = [];
    const denominators: number[] = [];
    for (let i = 0; i < count; i++) {
      const n = readUint32();
      if (n === null) return null;
      numerators.push(n);
    }
    for (let i = 0; i < count; i++) {
      const d = readUint32();
      if (d === null) return null;
      denominators.push(d);
    }
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      result.push(denominators[i]! === 0 ? 0 : numerators[i]! / denominators[i]!);
    }
    return result;
  }

  function readRatio(): number | null {
    const n = readUint32();
    const d = readUint32();
    if (n === null || d === null) return null;
    return d === 0 ? 0 : n / d;
  }

  const gainMapMin = readRatioArray(channelCount);
  if (!gainMapMin) return null;

  const gainMapMax = readRatioArray(channelCount);
  if (!gainMapMax) return null;

  const gainMapGamma = readRatioArray(channelCount);
  if (!gainMapGamma) return null;

  const baseOffset = readRatioArray(channelCount);
  if (!baseOffset) return null;

  const alternateOffset = readRatioArray(channelCount);
  if (!alternateOffset) return null;

  const baseHdrHeadroom = readRatio();
  if (baseHdrHeadroom === null) return null;

  const alternateHdrHeadroom = readRatio();
  if (alternateHdrHeadroom === null) return null;

  return {
    channelCount,
    gainMapMin,
    gainMapMax,
    gainMapGamma,
    baseOffset,
    alternateOffset,
    baseHdrHeadroom,
    alternateHdrHeadroom,
  };
}

/**
 * Parse tmap box for headroom info (ISO 21496-1).
 *
 * Extracts alternateHdrHeadroom from the spec-compliant tmap structure.
 * Falls back to gainMapMax[0] if alternateHdrHeadroom is zero.
 */
function parseTmapHeadroom(view: DataView, start: number, end: number): number | null {
  const tmap = parseTmapBox(view, start, end);
  if (!tmap) return null;

  // Prefer alternateHdrHeadroom (the HDR headroom of the alternate rendering)
  if (tmap.alternateHdrHeadroom > 0) return tmap.alternateHdrHeadroom;

  // Fall back to gainMapMax (first channel)
  if (tmap.gainMapMax.length > 0 && tmap.gainMapMax[0]! > 0) return tmap.gainMapMax[0]!;

  return null;
}

// =============================================================================
// ISOBMFF orientation parsing
// =============================================================================

/**
 * Get all property indices associated with an item ID from ipma box.
 * Shared helper used by both HEIC and AVIF decoders.
 */
export function getItemPropertyIndices(view: DataView, ipma: BoxInfo, itemId: number): number[] {
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
 * Raw ISOBMFF transform info (irot angle + imir axis).
 * Used to embed matching transforms in standalone wrappers.
 */
export interface ISOBMFFTransformInfo {
  irotAngle?: number;
  imirAxis?: number;
}

/**
 * Parse raw irot/imir transform boxes from ISOBMFF meta box.
 * Returns the raw angle and axis values for embedding in standalone wrappers.
 *
 * Finds transforms associated with the primary item via ipma.
 */
export function parseISOBMFFTransforms(
  view: DataView,
  metaStart: number,
  metaEnd: number,
): ISOBMFFTransformInfo {
  const result: ISOBMFFTransformInfo = {};

  // Find primary item ID
  const primaryItemId = parsePitm(view, metaStart, metaEnd);
  if (primaryItemId === null) return result;

  // Find iprp → ipco, ipma
  const iprp = findBox(view, 'iprp', metaStart, metaEnd);
  if (!iprp) return result;

  const ipco = findBox(view, 'ipco', iprp.dataStart, iprp.dataEnd);
  if (!ipco) return result;

  const ipma = findBox(view, 'ipma', iprp.dataStart, iprp.dataEnd, true);
  if (!ipma) return result;

  // Get property indices for primary item
  const propIndices = getItemPropertyIndices(view, ipma, primaryItemId);

  // Enumerate ipco properties
  const properties: { index: number; type: string; boxStart: number; boxEnd: number }[] = [];
  let idx = 0;
  let offset = ipco.dataStart;
  while (offset + 8 <= ipco.dataEnd) {
    const box = readBox(view, offset, ipco.dataEnd);
    if (!box) break;
    idx++;
    properties.push({ index: idx, type: box.type, boxStart: box.boxStart, boxEnd: box.boxEnd });
    offset = box.boxEnd;
  }

  // Find irot and imir among primary item's properties
  for (const propIdx of propIndices) {
    const prop = properties.find(p => p.index === propIdx);
    if (!prop) continue;

    if (prop.type === 'irot') {
      // irot: plain Box (9 bytes): size(4) + type(4) + angle(1)
      const angleOffset = prop.boxStart + 8;
      if (angleOffset < prop.boxEnd) {
        result.irotAngle = view.getUint8(angleOffset) & 0x03;
      }
    } else if (prop.type === 'imir') {
      // imir: plain Box (9 bytes): size(4) + type(4) + axis(1)
      const axisOffset = prop.boxStart + 8;
      if (axisOffset < prop.boxEnd) {
        result.imirAxis = view.getUint8(axisOffset) & 0x01;
      }
    }
  }

  return result;
}

/**
 * Parse ISOBMFF orientation from irot/imir boxes into EXIF-equivalent orientation (1-8).
 *
 * irot angle → rotation (all CCW):
 *   0 = 0°, 1 = 90° CCW, 2 = 180°, 3 = 270° CCW (= 90° CW)
 *
 * imir axis: 0 = flip around vertical axis (flip H), 1 = flip around horizontal axis (flip V)
 *
 * Combined mapping:
 *   No mirror + irot 0 → EXIF 1
 *   No mirror + irot 1 → EXIF 8
 *   No mirror + irot 2 → EXIF 3
 *   No mirror + irot 3 → EXIF 6
 *   imir 0 (flip H) + irot 0 → EXIF 2
 *   imir 0 (flip H) + irot 1 → EXIF 5
 *   imir 0 (flip H) + irot 2 → EXIF 4
 *   imir 0 (flip H) + irot 3 → EXIF 7
 *   imir 1 (flip V) + irot 0 → EXIF 4
 *   imir 1 (flip V) + irot 1 → EXIF 7
 *   imir 1 (flip V) + irot 2 → EXIF 2
 *   imir 1 (flip V) + irot 3 → EXIF 5
 */
export function parseISOBMFFOrientation(
  view: DataView,
  metaStart: number,
  metaEnd: number,
): number {
  const transforms = parseISOBMFFTransforms(view, metaStart, metaEnd);

  const angle = transforms.irotAngle ?? 0;
  const hasImir = transforms.imirAxis !== undefined;
  const axis = transforms.imirAxis ?? 0;

  if (!hasImir) {
    // Rotation only
    switch (angle) {
      case 0: return 1;
      case 1: return 8;
      case 2: return 3;
      case 3: return 6;
      default: return 1;
    }
  }

  // Mirror + rotation
  if (axis === 0) {
    // Flip horizontal
    switch (angle) {
      case 0: return 2;
      case 1: return 5;
      case 2: return 4;
      case 3: return 7;
      default: return 2;
    }
  } else {
    // Flip vertical
    switch (angle) {
      case 0: return 4;
      case 1: return 7;
      case 2: return 2;
      case 3: return 5;
      default: return 4;
    }
  }
}

// =============================================================================
// Decoding
// =============================================================================

/**
 * sRGB to linear conversion (gamma decode)
 */
export function srgbToLinear(s: number): number {
  if (s <= 0.04045) {
    return s / 12.92;
  }
  return Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Build a minimal standalone AVIF file wrapping raw AV1 item data.
 * Produces: ftyp + meta(hdlr, pitm, iinf/infe, iloc) + mdat
 */
export function buildStandaloneAVIF(codedData: Uint8Array): ArrayBuffer {
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
  pushString('mif1');
  pushUint32BE(0); // minor_version

  // --- meta box (FullBox) ---
  const hdlrSize = 33;
  const pitmSize = 14;
  const infeSize = 20;
  const iinfSize = 14 + infeSize;
  const ilocSize = 26;
  const mdatSize = 8 + codedData.length;
  const metaContentSize = hdlrSize + pitmSize + iinfSize + ilocSize;
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

  // infe (version 2)
  pushUint32BE(infeSize);
  pushString('infe');
  pushUint32BE(0x02000000); // version=2, flags=0
  pushUint16BE(1);
  pushUint16BE(0);
  pushString('av01');

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

/**
 * Decode a gainmap AVIF to a float32 image with HDR data.
 * Uses browser's AVIF decoder via createImageBitmap for both base and gain map.
 */
export async function decodeAVIFGainmapToFloat32(
  buffer: ArrayBuffer,
  info: AVIFGainmapInfo
): Promise<{
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
}> {
  // Parse orientation from ISOBMFF container
  const view = new DataView(buffer);
  const ftypSize = view.getUint32(0);
  const meta = findBox(view, 'meta', ftypSize, buffer.byteLength, true);
  const orientation = meta ? parseISOBMFFOrientation(view, meta.dataStart, meta.dataEnd) : 1;

  // Decode base image: pass entire buffer (browser picks primary item)
  const baseBlob = new Blob([buffer], { type: 'image/avif' });

  // Build standalone AVIF for the gain map's coded data
  const gainmapCodedData = new Uint8Array(buffer, info.gainmapOffset, info.gainmapLength);
  const gainmapAVIF = buildStandaloneAVIF(gainmapCodedData);
  const gainmapBlob = new Blob([gainmapAVIF], { type: 'image/avif' });

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

  // Draw base to canvas and get pixel data
  const baseCanvas = createCanvas(width, height);
  const baseCtx = baseCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  baseCtx.drawImage(baseBitmap, 0, 0);
  const baseData = baseCtx.getImageData(0, 0, width, height).data;
  baseBitmap.close();

  // Gainmap may be smaller — scale up to base image size
  // Apply orientation transform so gainmap pixels align with the display-rotated base
  const gainCanvas = createCanvas(width, height);
  const gainCtx = gainCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  drawImageWithOrientation(gainCtx, gainmapBitmap, width, height, orientation);
  const gainData = gainCtx.getImageData(0, 0, width, height).data;
  gainmapBitmap.close();

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
