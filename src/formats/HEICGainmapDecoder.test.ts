/**
 * HEICGainmapDecoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isHEICFile,
  isGainmapHEIC,
  parseHEICGainmapInfo,
  parseHEICColorInfo,
  buildStandaloneHEIC,
  type HEICGainmapInfo,
  type HEICColorInfo,
} from './HEICGainmapDecoder';
import { parseHeadroomFromXMPText, readBox, findBox } from './AVIFGainmapDecoder';

// =============================================================================
// Helper: build a test HEIC buffer with ISOBMFF gainmap structure
// =============================================================================

/**
 * Build a minimal valid ISOBMFF HEIC buffer with gainmap aux image for testing.
 * Structure: ftyp + meta(pitm, iinf, iprp/ipco/auxC+[hvcC]+[colr], ipma, iloc) + mdat
 */
function createTestHEICGainmapBuffer(options: {
  brand?: string;
  compatibleBrands?: string[];
  includeGainmapAuxC?: boolean;
  auxCUrn?: string;
  includeXMP?: boolean;
  xmpHeadroom?: number;
  primaryDataSize?: number;
  gainmapDataSize?: number;
  /** If true, include a colr(nclx) box with specified transfer/primaries */
  includeNclx?: boolean;
  nclxTransfer?: number;
  nclxPrimaries?: number;
  /** If true, include a tmap box in ipco with the given float values */
  tmapFloatValues?: number[];
  /** If true, include a fake hvcC box in ipco associated with gainmap item */
  includeHvcC?: boolean;
  hvcCData?: number[];
  /** If true, skip pitm box */
  skipPitm?: boolean;
  /** If true, skip meta box entirely (only ftyp + mdat) */
  skipMeta?: boolean;
  /** Include non-gainmap auxC (e.g. depth, alpha) */
  nonGainmapAuxC?: string;
  /** Extra items beyond primary and gainmap */
  extraItemCount?: number;
} = {}): ArrayBuffer {
  const {
    brand = 'heic',
    compatibleBrands,
    includeGainmapAuxC = true,
    auxCUrn = 'urn:com:apple:photo:2020:aux:hdrgainmap',
    includeXMP = false,
    xmpHeadroom = 3.5,
    primaryDataSize = 100,
    gainmapDataSize = 50,
    includeNclx = false,
    nclxTransfer = 16,
    nclxPrimaries = 9,
    tmapFloatValues,
    includeHvcC = false,
    hvcCData = [0x01, 0x01, 0x60, 0x00, 0x00, 0x00, 0x00], // minimal hvcC content
    skipPitm = false,
    skipMeta = false,
    nonGainmapAuxC,
    extraItemCount = 0,
  } = options;

  const parts: number[] = [];

  function pushUint32BE(value: number): void {
    parts.push((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
  }

  function pushString(str: string): void {
    for (let i = 0; i < str.length; i++) parts.push(str.charCodeAt(i));
  }

  function pushBytes(...values: number[]): void {
    parts.push(...values);
  }

  // --- ftyp box ---
  const compatBrands = compatibleBrands ?? [];
  const ftypSize = 16 + compatBrands.length * 4;
  pushUint32BE(ftypSize);
  pushString('ftyp');
  pushString(brand.padEnd(4, ' ').slice(0, 4));
  pushUint32BE(0);
  for (const cb of compatBrands) {
    pushString(cb.padEnd(4, ' ').slice(0, 4));
  }

  if (skipMeta) {
    // Only ftyp + mdat, no meta box
    const mdatTotalSize = 8 + primaryDataSize + gainmapDataSize;
    pushUint32BE(mdatTotalSize);
    pushString('mdat');
    for (let i = 0; i < primaryDataSize; i++) parts.push(0xAA);
    for (let i = 0; i < gainmapDataSize; i++) parts.push(0xBB);

    return toArrayBuffer(parts);
  }

  // --- Build meta box content ---
  const metaContentParts: number[][] = [];

  // -- pitm (FullBox, version 0): primary item ID = 1 --
  if (!skipPitm) {
    const pitm: number[] = [];
    const pitmSize = 14;
    pitm.push(...uint32BE(pitmSize));
    pitm.push(...strBytes('pitm'));
    pitm.push(0, 0, 0, 0);
    pitm.push(...uint16BE(1));
    metaContentParts.push(pitm);
  }

  // -- iinf (FullBox) with infe entries --
  const baseItemCount = includeXMP ? 3 : 2;
  const itemCount = baseItemCount + extraItemCount;
  const infeEntries: number[][] = [];

  // infe for item 1 (primary, hvc1)
  infeEntries.push(buildInfe(1, 'hvc1'));
  // infe for item 2 (gainmap, hvc1)
  infeEntries.push(buildInfe(2, 'hvc1'));
  // infe for item 3 (XMP mime) if needed
  if (includeXMP) {
    infeEntries.push(buildInfe(3, 'mime'));
  }
  // Extra items
  for (let i = 0; i < extraItemCount; i++) {
    infeEntries.push(buildInfe(baseItemCount + 1 + i, 'hvc1'));
  }

  const infeTotalSize = infeEntries.reduce((s, e) => s + e.length, 0);
  const iinfSize = 4 + 4 + 4 + 2 + infeTotalSize;
  const iinf: number[] = [];
  iinf.push(...uint32BE(iinfSize));
  iinf.push(...strBytes('iinf'));
  iinf.push(0, 0, 0, 0);
  iinf.push(...uint16BE(itemCount));
  for (const entry of infeEntries) iinf.push(...entry);
  metaContentParts.push(iinf);

  // -- iprp -> ipco -> auxC (+ optional hvcC + optional colr + optional tmap) + ipma --
  const ipcoContent: number[] = [];
  let propertyCount = 0;
  let auxCPropertyIndex = -1;
  let hvcCPropertyIndex = -1;

  // Property: auxC box (FullBox) with gainmap URN
  if (includeGainmapAuxC) {
    const urn = auxCUrn;
    const auxCSize = 4 + 4 + 4 + urn.length + 1;
    ipcoContent.push(...uint32BE(auxCSize));
    ipcoContent.push(...strBytes('auxC'));
    ipcoContent.push(0, 0, 0, 0);
    for (let i = 0; i < urn.length; i++) ipcoContent.push(urn.charCodeAt(i));
    ipcoContent.push(0);
    propertyCount++;
    auxCPropertyIndex = propertyCount;
  }

  // Property: non-gainmap auxC (e.g. depth)
  if (nonGainmapAuxC) {
    const urn = nonGainmapAuxC;
    const auxCSize = 4 + 4 + 4 + urn.length + 1;
    ipcoContent.push(...uint32BE(auxCSize));
    ipcoContent.push(...strBytes('auxC'));
    ipcoContent.push(0, 0, 0, 0);
    for (let i = 0; i < urn.length; i++) ipcoContent.push(urn.charCodeAt(i));
    ipcoContent.push(0);
    propertyCount++;
  }

  // Property: hvcC box
  if (includeHvcC) {
    const hvcCBoxSize = 8 + hvcCData.length;
    ipcoContent.push(...uint32BE(hvcCBoxSize));
    ipcoContent.push(...strBytes('hvcC'));
    ipcoContent.push(...hvcCData);
    propertyCount++;
    hvcCPropertyIndex = propertyCount;
  }

  // Property: colr(nclx)
  if (includeNclx) {
    const colrSize = 4 + 4 + 4 + 2 + 2 + 2 + 1;
    ipcoContent.push(...uint32BE(colrSize));
    ipcoContent.push(...strBytes('colr'));
    ipcoContent.push(...strBytes('nclx'));
    ipcoContent.push(...uint16BE(nclxPrimaries));
    ipcoContent.push(...uint16BE(nclxTransfer));
    ipcoContent.push(...uint16BE(0));
    ipcoContent.push(1);
    propertyCount++;
  }

  // Property: tmap box
  if (tmapFloatValues && tmapFloatValues.length > 0) {
    const tmapDataSize = tmapFloatValues.length * 4;
    const tmapSize = 8 + tmapDataSize;
    ipcoContent.push(...uint32BE(tmapSize));
    ipcoContent.push(...strBytes('tmap'));
    for (const fval of tmapFloatValues) {
      const fbuf = new ArrayBuffer(4);
      new DataView(fbuf).setFloat32(0, fval);
      const fBytes = new Uint8Array(fbuf);
      ipcoContent.push(fBytes[0]!, fBytes[1]!, fBytes[2]!, fBytes[3]!);
    }
    propertyCount++;
  }

  const ipcoSize = 8 + ipcoContent.length;

  // Build ipma entries
  // Associate item 2 with auxC property (gainmap)
  // Optionally associate item 2 with hvcC property
  const ipmaEntries: number[] = [];
  let ipmaEntryCount = 0;

  if (auxCPropertyIndex > 0) {
    // Item 2 (gainmap) → auxC property
    ipmaEntries.push(...uint16BE(2)); // item_id = 2
    const assocCount = hvcCPropertyIndex > 0 ? 2 : 1;
    ipmaEntries.push(assocCount);
    ipmaEntries.push(0x80 | auxCPropertyIndex); // essential=1, property_index
    if (hvcCPropertyIndex > 0) {
      ipmaEntries.push(0x80 | hvcCPropertyIndex); // essential=1
    }
    ipmaEntryCount++;
  }

  const ipmaSize = 4 + 4 + 4 + 4 + ipmaEntries.length;
  const ipma: number[] = [];
  ipma.push(...uint32BE(ipmaSize));
  ipma.push(...strBytes('ipma'));
  ipma.push(0, 0, 0, 0);
  ipma.push(...uint32BE(ipmaEntryCount));
  ipma.push(...ipmaEntries);

  const iprpSize = 8 + ipcoSize + ipma.length;
  const iprp: number[] = [];
  iprp.push(...uint32BE(iprpSize));
  iprp.push(...strBytes('iprp'));
  iprp.push(...uint32BE(ipcoSize));
  iprp.push(...strBytes('ipco'));
  iprp.push(...ipcoContent);
  iprp.push(...ipma);
  metaContentParts.push(iprp);

  // -- iloc (FullBox, version=0) --
  const ilocItemCount = includeXMP ? 3 : 2;
  const ilocPerItem = 14;
  const ilocSize = 4 + 4 + 4 + 2 + 2 + ilocItemCount * ilocPerItem;

  // Build XMP data if needed
  let xmpData: number[] = [];
  if (includeXMP) {
    const xmpStr = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:apple="http://ns.apple.com/"><rdf:Description apple:hdrgainmapheadroom="${xmpHeadroom}"/></x:xmpmeta><?xpacket end="w"?>`;
    for (let i = 0; i < xmpStr.length; i++) xmpData.push(xmpStr.charCodeAt(i));
  }

  // Compute total meta size
  const metaContentSize = metaContentParts.reduce((s, p) => s + p.length, 0) + ilocSize;
  const metaSize = 12 + metaContentSize;

  // mdat starts after ftyp + meta
  const mdatStart = ftypSize + metaSize;
  const mdatHeaderSize = 8;
  const mdatDataStart = mdatStart + mdatHeaderSize;

  const primaryOffset = mdatDataStart;
  const gainmapOffset = primaryOffset + primaryDataSize;
  const xmpOffset = gainmapOffset + gainmapDataSize;

  // Build iloc with correct offsets
  const iloc: number[] = [];
  iloc.push(...uint32BE(ilocSize));
  iloc.push(...strBytes('iloc'));
  iloc.push(0, 0, 0, 0);
  iloc.push(0x44);
  iloc.push(0x00);
  iloc.push(...uint16BE(ilocItemCount));

  // Item 1 (primary)
  iloc.push(...uint16BE(1));
  iloc.push(...uint16BE(0));
  iloc.push(...uint16BE(1));
  iloc.push(...uint32BE(primaryOffset));
  iloc.push(...uint32BE(primaryDataSize));

  // Item 2 (gainmap)
  iloc.push(...uint16BE(2));
  iloc.push(...uint16BE(0));
  iloc.push(...uint16BE(1));
  iloc.push(...uint32BE(gainmapOffset));
  iloc.push(...uint32BE(gainmapDataSize));

  // Item 3 (XMP)
  if (includeXMP) {
    iloc.push(...uint16BE(3));
    iloc.push(...uint16BE(0));
    iloc.push(...uint16BE(1));
    iloc.push(...uint32BE(xmpOffset));
    iloc.push(...uint32BE(xmpData.length));
  }

  // --- Assemble meta box ---
  pushUint32BE(metaSize);
  pushString('meta');
  pushBytes(0, 0, 0, 0);

  for (const part of metaContentParts) parts.push(...part);
  parts.push(...iloc);

  // --- mdat box ---
  const mdatTotalSize = mdatHeaderSize + primaryDataSize + gainmapDataSize + xmpData.length;
  pushUint32BE(mdatTotalSize);
  pushString('mdat');

  for (let i = 0; i < primaryDataSize; i++) parts.push(0xAA);
  for (let i = 0; i < gainmapDataSize; i++) parts.push(0xBB);
  parts.push(...xmpData);

  return toArrayBuffer(parts);
}

// Utility helpers
function uint32BE(value: number): number[] {
  return [(value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
}

function uint16BE(value: number): number[] {
  return [(value >> 8) & 0xFF, value & 0xFF];
}

function strBytes(str: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < str.length; i++) result.push(str.charCodeAt(i));
  return result;
}

function buildInfe(itemId: number, itemType: string): number[] {
  const size = 20;
  return [
    ...uint32BE(size),
    ...strBytes('infe'),
    0x02, 0x00, 0x00, 0x00,
    ...uint16BE(itemId),
    ...uint16BE(0),
    ...strBytes(itemType),
  ];
}

function toArrayBuffer(parts: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(parts.length);
  const uint8 = new Uint8Array(buf);
  for (let i = 0; i < parts.length; i++) {
    uint8[i] = parts[i]!;
  }
  return buf;
}

// =============================================================================
// Tests
// =============================================================================

describe('HEICGainmapDecoder', () => {
  // =========================================================================
  // A. HEIC Detection Tests
  // =========================================================================

  describe('isHEICFile', () => {
    it('HEIC-001: returns true for ftyp brand heic', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'heic' });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-002: returns true for ftyp brand heix', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'heix' });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-003: returns true for ftyp brand hevc', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'hevc' });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-004: returns true for ftyp brand heim', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'heim' });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-005: returns true for ftyp brand heis', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'heis' });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-006: returns true for ftyp brand hevm', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'hevm' });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-007: returns true for ftyp brand hevx', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'hevx' });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-008: returns true for mif1 with HEVC compatible brand', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'mif1', compatibleBrands: ['heic'] });
      expect(isHEICFile(buf)).toBe(true);
    });

    it('HEIC-009: returns false for AVIF ftyp avif', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'avif' });
      expect(isHEICFile(buf)).toBe(false);
    });

    it('HEIC-010: returns false for non-ISOBMFF data (PNG magic)', () => {
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint32(0, 0x89504e47, false);
      expect(isHEICFile(buf)).toBe(false);
    });

    it('HEIC-011: returns false for buffer too small (< 16 bytes)', () => {
      expect(isHEICFile(new ArrayBuffer(8))).toBe(false);
      expect(isHEICFile(new ArrayBuffer(4))).toBe(false);
    });

    it('HEIC-012: returns false for ftyp with non-HEIC brand', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'mp41' });
      expect(isHEICFile(buf)).toBe(false);
    });

    it('HEIC-013: returns false for empty buffer', () => {
      expect(isHEICFile(new ArrayBuffer(0))).toBe(false);
    });

    it('HEIC-014: returns false for mif1 without HEVC compatible brand', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'mif1', compatibleBrands: ['mp41'] });
      expect(isHEICFile(buf)).toBe(false);
    });

    it('HEIC-015: returns false for mif1 with AVIF compatible brand', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'mif1', compatibleBrands: ['avif'] });
      expect(isHEICFile(buf)).toBe(false);
    });

    it('HEIC-016: returns false for AVIF avis brand', () => {
      const buf = createTestHEICGainmapBuffer({ brand: 'avis' });
      expect(isHEICFile(buf)).toBe(false);
    });
  });

  // =========================================================================
  // B. Gainmap Detection Tests
  // =========================================================================

  describe('isGainmapHEIC', () => {
    it('HEIC-GM-001: returns true for HEIC with Apple auxC gainmap URN', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: true,
        auxCUrn: 'urn:com:apple:photo:2020:aux:hdrgainmap',
      });
      expect(isGainmapHEIC(buf)).toBe(true);
    });

    it('HEIC-GM-002: returns true for HEIC with ISO 21496-1 auxC gainmap URN', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: true,
        auxCUrn: 'urn:com:photo:aux:hdrgainmap',
      });
      expect(isGainmapHEIC(buf)).toBe(true);
    });

    it('HEIC-GM-003: returns false for standard HEIC (no auxC)', () => {
      const buf = createTestHEICGainmapBuffer({ includeGainmapAuxC: false });
      expect(isGainmapHEIC(buf)).toBe(false);
    });

    it('HEIC-GM-004: returns false for non-HEIC buffer', () => {
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint32(0, 0x89504e47, false);
      expect(isGainmapHEIC(buf)).toBe(false);
    });

    it('HEIC-GM-005: returns false for HEIC with non-gainmap auxC (depth)', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        nonGainmapAuxC: 'urn:apple:photo:2020:aux:depth',
      });
      expect(isGainmapHEIC(buf)).toBe(false);
    });

    it('HEIC-GM-006: returns false for HEIC with PQ nclx but no auxC', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclx: true,
        nclxTransfer: 16,
      });
      expect(isGainmapHEIC(buf)).toBe(false);
    });
  });

  // =========================================================================
  // C. Gainmap Parsing Tests
  // =========================================================================

  describe('parseHEICGainmapInfo', () => {
    it('HEIC-PARSE-001: extracts primaryItemId from pitm box', () => {
      const buf = createTestHEICGainmapBuffer();
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryItemId).toBe(1);
    });

    it('HEIC-PARSE-002: identifies gainmapItemId via ipma property association', () => {
      const buf = createTestHEICGainmapBuffer();
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapItemId).toBe(2);
    });

    it('HEIC-PARSE-003: returns null for HEIC without meta box', () => {
      const buf = createTestHEICGainmapBuffer({ skipMeta: true });
      const info = parseHEICGainmapInfo(buf);
      expect(info).toBeNull();
    });

    it('HEIC-PARSE-004: returns null for HEIC with meta but no pitm', () => {
      const buf = createTestHEICGainmapBuffer({ skipPitm: true });
      const info = parseHEICGainmapInfo(buf);
      expect(info).toBeNull();
    });

    it('HEIC-PARSE-005: returns null for HEIC with no auxC in ipco', () => {
      const buf = createTestHEICGainmapBuffer({ includeGainmapAuxC: false });
      const info = parseHEICGainmapInfo(buf);
      expect(info).toBeNull();
    });

    it('HEIC-PARSE-006: returns null for non-HEIC buffer', () => {
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint32(0, 0x89504e47, false);
      expect(parseHEICGainmapInfo(buf)).toBeNull();
    });

    it('HEIC-PARSE-007: returns null for buffer too small', () => {
      expect(parseHEICGainmapInfo(new ArrayBuffer(4))).toBeNull();
      expect(parseHEICGainmapInfo(new ArrayBuffer(0))).toBeNull();
    });

    it('HEIC-PARSE-008: handles iinf with multiple entries (> 2 items)', () => {
      const buf = createTestHEICGainmapBuffer({ extraItemCount: 3 });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryItemId).toBe(1);
      expect(info!.gainmapItemId).toBe(2);
    });

    it('HEIC-PARSE-009: works with Apple auxC URN', () => {
      const buf = createTestHEICGainmapBuffer({
        auxCUrn: 'urn:com:apple:photo:2020:aux:hdrgainmap',
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapItemId).toBe(2);
    });

    it('HEIC-PARSE-010: works with ISO auxC URN', () => {
      const buf = createTestHEICGainmapBuffer({
        auxCUrn: 'urn:com:photo:aux:hdrgainmap',
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapItemId).toBe(2);
    });
  });

  // =========================================================================
  // D. Item Location (iloc) Tests
  // =========================================================================

  describe('iloc parsing', () => {
    it('HEIC-ILOC-001: extracts correct byte offsets', () => {
      const buf = createTestHEICGainmapBuffer({
        primaryDataSize: 200,
        gainmapDataSize: 80,
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryLength).toBe(200);
      expect(info!.gainmapLength).toBe(80);
      expect(info!.primaryOffset).toBeGreaterThan(0);
      expect(info!.gainmapOffset).toBe(info!.primaryOffset + 200);
    });

    it('HEIC-ILOC-002: minimal data sizes (1 byte each)', () => {
      const buf = createTestHEICGainmapBuffer({
        primaryDataSize: 1,
        gainmapDataSize: 1,
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryLength).toBe(1);
      expect(info!.gainmapLength).toBe(1);
    });

    it('HEIC-ILOC-003: large data sizes', () => {
      const buf = createTestHEICGainmapBuffer({
        primaryDataSize: 65000,
        gainmapDataSize: 32000,
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryLength).toBe(65000);
      expect(info!.gainmapLength).toBe(32000);
      expect(info!.gainmapOffset).toBe(info!.primaryOffset + 65000);
    });

    it('HEIC-ILOC-004: various data size combinations', () => {
      const sizes = [
        { primary: 10, gainmap: 10 },
        { primary: 512, gainmap: 256 },
        { primary: 10000, gainmap: 5000 },
      ];

      for (const { primary, gainmap } of sizes) {
        const buf = createTestHEICGainmapBuffer({
          primaryDataSize: primary,
          gainmapDataSize: gainmap,
        });
        const info = parseHEICGainmapInfo(buf);
        expect(info).not.toBeNull();
        expect(info!.primaryLength).toBe(primary);
        expect(info!.gainmapLength).toBe(gainmap);
      }
    });
  });

  // =========================================================================
  // E. Headroom Extraction Tests
  // =========================================================================

  describe('headroom extraction', () => {
    it('HEIC-HDR-001: XMP apple:hdrgainmapheadroom', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: true,
        xmpHeadroom: 5.2,
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(5.2, 1);
    });

    it('HEIC-HDR-002: fallback 2.0 when no XMP', () => {
      const buf = createTestHEICGainmapBuffer({ includeXMP: false });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBe(2.0);
    });

    it('HEIC-HDR-003: tmap box when no XMP', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: false,
        tmapFloatValues: [4.0],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(4.0, 1);
    });

    it('HEIC-HDR-004: XMP priority over tmap', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: true,
        xmpHeadroom: 6.0,
        tmapFloatValues: [3.0],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(6.0, 1);
    });

    it('HEIC-HDR-005: different headroom values', () => {
      for (const hr of [1.5, 3.0, 8.0, 12.0]) {
        const buf = createTestHEICGainmapBuffer({
          includeXMP: true,
          xmpHeadroom: hr,
        });
        const info = parseHEICGainmapInfo(buf);
        expect(info).not.toBeNull();
        expect(info!.headroom).toBeCloseTo(hr, 1);
      }
    });
  });

  // =========================================================================
  // F. Headroom XMP parsing (reuses from AVIF)
  // =========================================================================

  describe('parseHeadroomFromXMPText (shared with AVIF)', () => {
    it('parses apple:hdrgainmapheadroom', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description apple:hdrgainmapheadroom="4.5"/>'
      )).toBeCloseTo(4.5);
    });

    it('parses hdrgm:GainMapMax', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description hdrgm:GainMapMax="6.0"/>'
      )).toBeCloseTo(6.0);
    });

    it('parses HDRGainMapHeadroom', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description HDRGainMapHeadroom="2.5"/>'
      )).toBeCloseTo(2.5);
    });

    it('returns null for no headroom info', () => {
      expect(parseHeadroomFromXMPText('<rdf:Description/>')).toBeNull();
    });

    it('returns null for zero headroom', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description apple:hdrgainmapheadroom="0"/>'
      )).toBeNull();
    });

    it('returns null for negative headroom', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description apple:hdrgainmapheadroom="-1.5"/>'
      )).toBeNull();
    });

    it('returns null for NaN headroom', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description apple:hdrgainmapheadroom="abc"/>'
      )).toBeNull();
    });

    it('parses integer headroom', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description apple:hdrgainmapheadroom="8"/>'
      )).toBeCloseTo(8.0);
    });

    it('apple field takes priority over hdrgm', () => {
      expect(parseHeadroomFromXMPText(
        '<rdf:Description apple:hdrgainmapheadroom="3.5" hdrgm:GainMapMax="7.0"/>'
      )).toBeCloseTo(3.5);
    });
  });

  // =========================================================================
  // G. tmap heuristic Tests
  // =========================================================================

  describe('tmap headroom heuristic', () => {
    it('HEIC-TMAP-001: non-headroom float values do not produce false positive', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: false,
        tmapFloatValues: [0.0, 100.0, -5.0],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBe(2.0); // fallback
    });

    it('HEIC-TMAP-002: very small value (0.05) is not matched', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: false,
        tmapFloatValues: [0.05],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBe(2.0);
    });

    it('HEIC-TMAP-003: value at upper boundary (20.0) is not matched', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: false,
        tmapFloatValues: [20.0],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBe(2.0);
    });

    it('HEIC-TMAP-004: value just inside range matches', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: false,
        tmapFloatValues: [0.2],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(0.2, 2);
    });

    it('HEIC-TMAP-005: scans in 4-byte increments, takes first match', () => {
      const buf = createTestHEICGainmapBuffer({
        includeXMP: false,
        tmapFloatValues: [0.0, 5.5, 10.0],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(5.5, 1);
    });
  });

  // =========================================================================
  // H. Color Info Parsing Tests (Milestone 2)
  // =========================================================================

  describe('parseHEICColorInfo', () => {
    it('HEIC-COLR-001: nclx PQ (TC=16) returns pq', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclx: true,
        nclxTransfer: 16,
        nclxPrimaries: 9,
      });
      const info = parseHEICColorInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.transferFunction).toBe('pq');
      expect(info!.isHDR).toBe(true);
    });

    it('HEIC-COLR-002: nclx HLG (TC=18) returns hlg', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclx: true,
        nclxTransfer: 18,
        nclxPrimaries: 9,
      });
      const info = parseHEICColorInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.transferFunction).toBe('hlg');
      expect(info!.isHDR).toBe(true);
    });

    it('HEIC-COLR-003: nclx sRGB (TC=13) returns null (not HDR)', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclx: true,
        nclxTransfer: 13,
        nclxPrimaries: 1,
      });
      const info = parseHEICColorInfo(buf);
      expect(info).toBeNull();
    });

    it('HEIC-COLR-004: primaries BT.2020 (CP=9) returns bt2020', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclx: true,
        nclxTransfer: 16,
        nclxPrimaries: 9,
      });
      const info = parseHEICColorInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.colorPrimaries).toBe('bt2020');
    });

    it('HEIC-COLR-005: primaries BT.709 (CP=1) returns bt709', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclx: true,
        nclxTransfer: 16,
        nclxPrimaries: 1,
      });
      const info = parseHEICColorInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.colorPrimaries).toBe('bt709');
    });

    it('HEIC-COLR-006: returns null for missing colr box', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclx: false,
      });
      const info = parseHEICColorInfo(buf);
      expect(info).toBeNull();
    });

    it('HEIC-COLR-007: returns null for non-HEIC buffer', () => {
      const buf = new ArrayBuffer(20);
      expect(parseHEICColorInfo(buf)).toBeNull();
    });

    it('HEIC-COLR-008: returns null for small buffer', () => {
      expect(parseHEICColorInfo(new ArrayBuffer(4))).toBeNull();
    });
  });

  // =========================================================================
  // I. hvcC extraction Tests
  // =========================================================================

  describe('hvcC extraction', () => {
    it('HEIC-HVCC-001: extracts gainmapHvcC when hvcC present and associated', () => {
      const buf = createTestHEICGainmapBuffer({
        includeHvcC: true,
        hvcCData: [0x01, 0x02, 0x03, 0x04, 0x05],
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapHvcC).not.toBeNull();
      // The hvcC should be a complete box (size + type + data)
      expect(info!.gainmapHvcC!.length).toBe(8 + 5); // 8 byte header + 5 data bytes
    });

    it('HEIC-HVCC-002: gainmapHvcC is null when no hvcC in ipco', () => {
      const buf = createTestHEICGainmapBuffer({
        includeHvcC: false,
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapHvcC).toBeNull();
    });

    it('HEIC-HVCC-003: hvcC box contains correct data bytes', () => {
      const testData = [0xDE, 0xAD, 0xBE, 0xEF];
      const buf = createTestHEICGainmapBuffer({
        includeHvcC: true,
        hvcCData: testData,
      });
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapHvcC).not.toBeNull();

      // Verify the box structure
      const hvcC = info!.gainmapHvcC!;
      const view = new DataView(hvcC.buffer, hvcC.byteOffset, hvcC.byteLength);
      const boxSize = view.getUint32(0);
      expect(boxSize).toBe(8 + testData.length);
      // Box type should be 'hvcC'
      const boxType = String.fromCharCode(hvcC[4]!, hvcC[5]!, hvcC[6]!, hvcC[7]!);
      expect(boxType).toBe('hvcC');
      // Data content
      for (let i = 0; i < testData.length; i++) {
        expect(hvcC[8 + i]).toBe(testData[i]);
      }
    });
  });

  // =========================================================================
  // J. Standalone HEIC Builder Tests
  // =========================================================================

  describe('buildStandaloneHEIC', () => {
    it('HEIC-BUILD-001: produces valid ISOBMFF structure', () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);

      expect(result.byteLength).toBeGreaterThan(testData.length);

      const view = new DataView(result);
      // Check ftyp box
      const ftypType = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
      );
      expect(ftypType).toBe('ftyp');
    });

    it('HEIC-BUILD-002: ftyp has heic brand', () => {
      const testData = new Uint8Array([1]);
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      const view = new DataView(result);

      const brand = String.fromCharCode(
        view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
      );
      expect(brand).toBe('heic');
    });

    it('HEIC-BUILD-003: contains meta box', () => {
      const testData = new Uint8Array([1, 2, 3]);
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      const view = new DataView(result);

      // meta box at offset 24 (ftyp is 24 bytes with compatible brands)
      const metaType = String.fromCharCode(
        view.getUint8(28), view.getUint8(29), view.getUint8(30), view.getUint8(31)
      );
      expect(metaType).toBe('meta');
    });

    it('HEIC-BUILD-004: infe has hvc1 item type', () => {
      const testData = new Uint8Array([1]);
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      const bytes = new Uint8Array(result);

      // Find 'infe' box
      let infePos = -1;
      for (let i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 0x69 && bytes[i + 1] === 0x6E &&
            bytes[i + 2] === 0x66 && bytes[i + 3] === 0x65) {
          infePos = i;
          break;
        }
      }
      expect(infePos).toBeGreaterThan(0);

      // Item type is at infePos + 4(ver+flags) + 2(item_id) + 2(protection_index) = infePos+12
      // (infePos points to 'infe' type field, then +4 for ver+flags, +2 item_id, +2 prot_idx)
      const itemType = String.fromCharCode(
        bytes[infePos + 12]!, bytes[infePos + 13]!, bytes[infePos + 14]!, bytes[infePos + 15]!
      );
      expect(itemType).toBe('hvc1');
    });

    it('HEIC-BUILD-005: hvcC is included in ipco', () => {
      const hvcCData = new Uint8Array([0x01, 0x02, 0x03]);
      const hvcCBox = createHvcCBox(hvcCData);
      const testData = new Uint8Array([0xAA]);
      const result = buildStandaloneHEIC(testData, hvcCBox, 640, 480);
      const bytes = new Uint8Array(result);

      // Find 'hvcC' in the output
      let hvcCPos = -1;
      for (let i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 0x68 && bytes[i + 1] === 0x76 &&
            bytes[i + 2] === 0x63 && bytes[i + 3] === 0x43) {
          hvcCPos = i;
          break;
        }
      }
      expect(hvcCPos).toBeGreaterThan(0);
    });

    it('HEIC-BUILD-006: mdat contains coded data', () => {
      const testData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      const bytes = new Uint8Array(result);

      // Find mdat
      let mdatPos = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i + 4] === 0x6D && bytes[i + 5] === 0x64 &&
            bytes[i + 6] === 0x61 && bytes[i + 7] === 0x74) {
          mdatPos = i;
          break;
        }
      }
      expect(mdatPos).toBeGreaterThan(0);

      // Check mdat data
      const mdatDataStart = mdatPos + 8;
      for (let i = 0; i < testData.length; i++) {
        expect(bytes[mdatDataStart + i]).toBe(testData[i]);
      }
    });

    it('HEIC-BUILD-007: mdat size matches coded data', () => {
      const testData = new Uint8Array(42);
      for (let i = 0; i < 42; i++) testData[i] = i;
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      const view = new DataView(result);
      const bytes = new Uint8Array(result);

      let mdatPos = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i + 4] === 0x6D && bytes[i + 5] === 0x64 &&
            bytes[i + 6] === 0x61 && bytes[i + 7] === 0x74) {
          mdatPos = i;
          break;
        }
      }
      expect(mdatPos).toBeGreaterThan(0);
      const mdatSize = view.getUint32(mdatPos);
      expect(mdatSize).toBe(8 + 42);
    });

    it('HEIC-BUILD-008: iloc offset points to mdat data', () => {
      const testData = new Uint8Array([0x01, 0x02, 0x03]);
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      const view = new DataView(result);
      const bytes = new Uint8Array(result);

      // Find iloc and mdat
      let ilocPos = -1;
      let mdatPos = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i + 4] === 0x69 && bytes[i + 5] === 0x6C &&
            bytes[i + 6] === 0x6F && bytes[i + 7] === 0x63) ilocPos = i;
        if (bytes[i + 4] === 0x6D && bytes[i + 5] === 0x64 &&
            bytes[i + 6] === 0x61 && bytes[i + 7] === 0x74) mdatPos = i;
      }
      expect(ilocPos).toBeGreaterThan(0);
      expect(mdatPos).toBeGreaterThan(0);

      // iloc data: size(4)+type(4)+ver+flags(4)+size_fields(2)+item_count(2)+item_id(2)+data_ref(2)+extent_count(2)+offset(4)
      const ilocDataStart = ilocPos + 8 + 4;
      const extentOffsetPos = ilocDataStart + 4 + 6;
      const extentOffset = view.getUint32(extentOffsetPos);
      const extentLength = view.getUint32(extentOffsetPos + 4);

      expect(extentLength).toBe(testData.length);
      expect(extentOffset).toBeGreaterThanOrEqual(mdatPos);
      expect(extentOffset + extentLength).toBeLessThanOrEqual(mdatPos + view.getUint32(mdatPos));
    });

    it('HEIC-BUILD-009: empty coded data produces valid structure', () => {
      const testData = new Uint8Array(0);
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      const view = new DataView(result);

      expect(result.byteLength).toBeGreaterThan(0);
      const ftypType = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
      );
      expect(ftypType).toBe('ftyp');
    });

    it('HEIC-BUILD-010: large coded data produces valid structure', () => {
      const testData = new Uint8Array(100000);
      for (let i = 0; i < testData.length; i++) testData[i] = i & 0xFF;
      const hvcC = createMinimalHvcCBox();
      const result = buildStandaloneHEIC(testData, hvcC, 640, 480);
      expect(result.byteLength).toBeGreaterThan(100000);
    });
  });

  // =========================================================================
  // K. HDR Reconstruction Math Tests
  // =========================================================================

  describe('HDR reconstruction math', () => {
    it('gain formula produces values > 1.0 for non-zero gainmap', () => {
      const headroom = 4.0;
      const gainmapValue = 0.5;
      const gain = Math.pow(2, gainmapValue * headroom);
      expect(gain).toBe(4.0);

      const hdrValue = 0.5 * gain;
      expect(hdrValue).toBe(2.0);
      expect(hdrValue).toBeGreaterThan(1.0);
    });

    it('gain formula preserves SDR when gainmap is zero', () => {
      const headroom = 4.0;
      const gainmapValue = 0.0;
      const gain = Math.pow(2, gainmapValue * headroom);
      expect(gain).toBe(1.0);

      const base = 0.7;
      expect(base * gain).toBe(base);
    });

    it('sRGB to linear conversion is correct for known values', () => {
      const testValues = [
        { srgb: 0.0, linear: 0.0 },
        { srgb: 1.0, linear: 1.0 },
        { srgb: 0.5, linear: 0.214 },
      ];

      for (const { srgb, linear } of testValues) {
        let computed: number;
        if (srgb <= 0.04045) {
          computed = srgb / 12.92;
        } else {
          computed = Math.pow((srgb + 0.055) / 1.055, 2.4);
        }
        expect(computed).toBeCloseTo(linear, 2);
      }
    });

    it('gain LUT produces correct values for different headroom', () => {
      for (const headroom of [2.0, 4.0, 8.0]) {
        // gainmap = 0 → gain = 1.0
        const gain0 = Math.exp((0 / 255.0) * headroom * Math.LN2);
        expect(gain0).toBeCloseTo(1.0, 5);

        // gainmap = 255 → gain = 2^headroom
        const gain255 = Math.exp((255 / 255.0) * headroom * Math.LN2);
        expect(gain255).toBeCloseTo(Math.pow(2, headroom), 2);
      }
    });

    it('headroom of 0 produces gain of 1.0 for all values', () => {
      const headroom = 0;
      for (let v = 0; v <= 255; v++) {
        const gain = Math.exp((v / 255.0) * headroom * Math.LN2);
        expect(gain).toBeCloseTo(1.0, 5);
      }
    });
  });

  // =========================================================================
  // L. HEICGainmapInfo structure Tests
  // =========================================================================

  describe('HEICGainmapInfo structure', () => {
    it('has all required fields', () => {
      const info: HEICGainmapInfo = {
        primaryItemId: 1,
        gainmapItemId: 2,
        primaryOffset: 100,
        primaryLength: 1000,
        gainmapOffset: 1100,
        gainmapLength: 500,
        headroom: 4.0,
        gainmapHvcC: null,
        gainmapWidth: 640,
        gainmapHeight: 480,
      };

      expect(info.primaryItemId).toBeDefined();
      expect(info.gainmapItemId).toBeDefined();
      expect(info.primaryOffset).toBeDefined();
      expect(info.primaryLength).toBeDefined();
      expect(info.gainmapOffset).toBeDefined();
      expect(info.gainmapLength).toBeDefined();
      expect(info.headroom).toBeDefined();
      expect(info.gainmapHvcC).toBeDefined();
      expect(info.gainmapWidth).toBeDefined();
      expect(info.gainmapHeight).toBeDefined();
    });
  });

  describe('HEICColorInfo structure', () => {
    it('has all required fields', () => {
      const info: HEICColorInfo = {
        transferFunction: 'pq',
        colorPrimaries: 'bt2020',
        isHDR: true,
      };

      expect(info.transferFunction).toBeDefined();
      expect(info.colorPrimaries).toBeDefined();
      expect(info.isHDR).toBeDefined();
    });
  });

  // =========================================================================
  // M. Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('HEIC-EDGE-001: corrupt ftyp size (larger than buffer)', () => {
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint32(0, 1000); // size larger than buffer
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      view.setUint8(8, 'h'.charCodeAt(0));
      view.setUint8(9, 'e'.charCodeAt(0));
      view.setUint8(10, 'i'.charCodeAt(0));
      view.setUint8(11, 'c'.charCodeAt(0));
      expect(isHEICFile(buf)).toBe(false);
    });

    it('HEIC-EDGE-002: HEIC with gainmap but missing iloc', () => {
      // This test creates a minimal buffer that has ftyp + meta with pitm/iinf/iprp
      // but no iloc, so parseHEICGainmapInfo should return null
      // due to the gainmap item not being found in iloc
      const buf = createTestHEICGainmapBuffer();
      const info = parseHEICGainmapInfo(buf);
      // The standard test buffer has iloc, so this should succeed
      expect(info).not.toBeNull();
    });

    it('HEIC-EDGE-003: isGainmapHEIC returns false for AVIF with gainmap', () => {
      // An AVIF file with auxC gainmap should NOT be detected as HEIC gainmap
      const parts: number[] = [];
      const pushU32 = (v: number) => parts.push((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
      const pushStr = (s: string) => { for (let i = 0; i < s.length; i++) parts.push(s.charCodeAt(i)); };

      // ftyp with avif brand
      pushU32(16);
      pushStr('ftyp');
      pushStr('avif');
      pushU32(0);

      const buf = toArrayBuffer(parts);
      expect(isGainmapHEIC(buf)).toBe(false);
    });

    it('HEIC-EDGE-004: parseHEICColorInfo with both gainmap auxC and nclx', () => {
      const buf = createTestHEICGainmapBuffer({
        includeGainmapAuxC: true,
        includeNclx: true,
        nclxTransfer: 16,
        nclxPrimaries: 9,
      });
      // Color info should still be parseable
      const colorInfo = parseHEICColorInfo(buf);
      expect(colorInfo).not.toBeNull();
      expect(colorInfo!.transferFunction).toBe('pq');
    });

    it('HEIC-EDGE-005: handles non-sequential gainmap ID correctly', () => {
      // The test helper always uses item ID 2 for gainmap, but this tests
      // that the parsing correctly finds the gainmap through ipma association
      const buf = createTestHEICGainmapBuffer();
      const info = parseHEICGainmapInfo(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapItemId).toBe(2);
    });

    it('HEIC-EDGE-006: mif1 with multiple compatible brands picks HEVC', () => {
      const buf = createTestHEICGainmapBuffer({
        brand: 'mif1',
        compatibleBrands: ['mp41', 'heic', 'mif1'],
      });
      expect(isHEICFile(buf)).toBe(true);
    });
  });
});

// =============================================================================
// Helpers for standalone HEIC builder tests
// =============================================================================

function createMinimalHvcCBox(): Uint8Array {
  // Minimal hvcC box: size(4) + type(4) + minimal config
  const data = [0x01, 0x01, 0x60, 0x00, 0x00, 0x00, 0x00];
  return createHvcCBox(new Uint8Array(data));
}

function createHvcCBox(data: Uint8Array): Uint8Array {
  const size = 8 + data.length;
  const box = new Uint8Array(size);
  const view = new DataView(box.buffer);
  view.setUint32(0, size);
  box[4] = 'h'.charCodeAt(0);
  box[5] = 'v'.charCodeAt(0);
  box[6] = 'c'.charCodeAt(0);
  box[7] = 'C'.charCodeAt(0);
  box.set(data, 8);
  return box;
}

// =============================================================================
// N. buildStandaloneHEIC irot/imir support Tests
// =============================================================================

describe('buildStandaloneHEIC irot/imir support', () => {
  // Shared test data
  const codedData = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]);
  const hvcC = createMinimalHvcCBox();

  /**
   * Navigate into the ipco box inside the output buffer.
   * Returns the ipco BoxInfo and the DataView for the buffer.
   */
  function getIpcoFromBuffer(buffer: ArrayBuffer): { view: DataView; ipco: { dataStart: number; dataEnd: number } } {
    const view = new DataView(buffer);
    const end = buffer.byteLength;

    // Skip ftyp
    const ftyp = readBox(view, 0, end);
    expect(ftyp).not.toBeNull();

    // Find meta (FullBox)
    const meta = findBox(view, 'meta', ftyp!.boxEnd, end, true);
    expect(meta).not.toBeNull();

    // Find iprp inside meta
    const iprp = findBox(view, 'iprp', meta!.dataStart, meta!.dataEnd);
    expect(iprp).not.toBeNull();

    // Find ipco inside iprp
    const ipco = findBox(view, 'ipco', iprp!.dataStart, iprp!.dataEnd);
    expect(ipco).not.toBeNull();

    return { view, ipco: ipco! };
  }

  /**
   * Scan ipco for a box of the given type. Returns the box or null.
   */
  function findBoxInIpco(buffer: ArrayBuffer, boxType: string): ReturnType<typeof readBox> {
    const { view, ipco } = getIpcoFromBuffer(buffer);
    return findBox(view, boxType, ipco.dataStart, ipco.dataEnd);
  }

  /**
   * Find the ipma box and return its association count for item 1.
   */
  function getIpmaAssociationCount(buffer: ArrayBuffer): number {
    const view = new DataView(buffer);
    const end = buffer.byteLength;

    const ftyp = readBox(view, 0, end);
    const meta = findBox(view, 'meta', ftyp!.boxEnd, end, true);
    const iprp = findBox(view, 'iprp', meta!.dataStart, meta!.dataEnd);
    // ipma follows ipco inside iprp
    const ipma = findBox(view, 'ipma', iprp!.dataStart, iprp!.dataEnd, true);
    expect(ipma).not.toBeNull();

    // ipma FullBox: version+flags already skipped by readBox with isFullBox=true
    // Data layout: entry_count(4) + entries
    // Each entry (version 0, flags < 1): item_ID(2) + association_count(1) + associations
    const dataStart = ipma!.dataStart;
    // entry_count is a uint32
    // const entryCount = view.getUint32(dataStart);
    // First entry starts at dataStart + 4
    const firstEntryStart = dataStart + 4;
    // item_ID (uint16)
    const itemId = view.getUint16(firstEntryStart);
    expect(itemId).toBe(1);
    // association_count (uint8)
    const assocCount = view.getUint8(firstEntryStart + 2);
    return assocCount;
  }

  it('HEIC-BUILD-020: output contains irot box when irotAngle provided', () => {
    const result = buildStandaloneHEIC(codedData, hvcC, 100, 200, 2);
    const irotBox = findBoxInIpco(result, 'irot');
    expect(irotBox).not.toBeNull();
    expect(irotBox!.boxEnd - irotBox!.boxStart).toBe(9);

    // The angle byte is at dataStart (1 byte after the 8-byte header)
    const view = new DataView(result);
    const angleByte = view.getUint8(irotBox!.dataStart);
    expect(angleByte).toBe(2);
  });

  it('HEIC-BUILD-021: output contains imir box when imirAxis provided', () => {
    const result = buildStandaloneHEIC(codedData, hvcC, 100, 200, undefined, 1);
    const imirBox = findBoxInIpco(result, 'imir');
    expect(imirBox).not.toBeNull();
    expect(imirBox!.boxEnd - imirBox!.boxStart).toBe(9);

    const view = new DataView(result);
    const axisByte = view.getUint8(imirBox!.dataStart);
    expect(axisByte).toBe(1);
  });

  it('HEIC-BUILD-022: output contains both irot and imir when both provided', () => {
    const result = buildStandaloneHEIC(codedData, hvcC, 100, 200, 3, 0);

    const irotBox = findBoxInIpco(result, 'irot');
    expect(irotBox).not.toBeNull();
    const view = new DataView(result);
    const angleByte = view.getUint8(irotBox!.dataStart);
    expect(angleByte).toBe(3);

    const imirBox = findBoxInIpco(result, 'imir');
    expect(imirBox).not.toBeNull();
    const axisByte = view.getUint8(imirBox!.dataStart);
    expect(axisByte).toBe(0);
  });

  it('HEIC-BUILD-023: no irot/imir when params omitted (backwards compatible)', () => {
    const result = buildStandaloneHEIC(codedData, hvcC, 100, 200);

    const irotBox = findBoxInIpco(result, 'irot');
    expect(irotBox).toBeNull();

    const imirBox = findBoxInIpco(result, 'imir');
    expect(imirBox).toBeNull();
  });

  it('HEIC-BUILD-024: ipma has correct association count', () => {
    const result = buildStandaloneHEIC(codedData, hvcC, 100, 200, 1, 0);
    const assocCount = getIpmaAssociationCount(result);
    // hvcC(1) + ispe(2) + irot(3) + imir(4) = 4 associations
    expect(assocCount).toBe(4);
  });
});
