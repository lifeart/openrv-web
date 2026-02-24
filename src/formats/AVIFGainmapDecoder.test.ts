/**
 * AVIFGainmapDecoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isGainmapAVIF,
  parseGainmapAVIF,
  buildStandaloneAVIF,
  parseHeadroomFromXMPText,
  parseISOBMFFOrientation,
  parseISOBMFFTransforms,
  parseTmapBox,
} from './AVIFGainmapDecoder';

// =============================================================================
// Helper: build a test AVIF buffer with ISOBMFF gainmap structure
// =============================================================================

/**
 * Build a minimal valid ISOBMFF AVIF buffer with gainmap aux image for testing.
 * Structure: ftyp + meta(pitm, iinf, iprp/ipco/auxC, ipma, iloc, [iref]) + mdat
 */
function createTestAVIFGainmapBuffer(options: {
  brand?: string;
  includeGainmapAuxC?: boolean;
  includeXMP?: boolean;
  xmpHeadroom?: number;
  primaryDataSize?: number;
  gainmapDataSize?: number;
  /** If true, also include a colr(nclx) box with PQ transfer */
  includeNclxHDR?: boolean;
  /** If provided, include a spec-compliant ISO 21496-1 tmap box in ipco */
  tmapData?: {
    channelCount?: number;
    gainMapMinN?: number[];
    gainMapMinD?: number[];
    gainMapMaxN?: number[];
    gainMapMaxD?: number[];
    gainMapGammaN?: number[];
    gainMapGammaD?: number[];
    baseOffsetN?: number[];
    baseOffsetD?: number[];
    alternateOffsetN?: number[];
    alternateOffsetD?: number[];
    baseHdrHeadroomN?: number;
    baseHdrHeadroomD?: number;
    alternateHdrHeadroomN?: number;
    alternateHdrHeadroomD?: number;
  };
  /** If true, skip pitm box */
  skipPitm?: boolean;
  /** If true, skip meta box entirely (only ftyp + mdat) */
  skipMeta?: boolean;
} = {}): ArrayBuffer {
  const {
    brand = 'avif',
    includeGainmapAuxC = true,
    includeXMP = false,
    xmpHeadroom = 3.5,
    primaryDataSize = 100,
    gainmapDataSize = 50,
    includeNclxHDR = false,
    tmapData,
    skipPitm = false,
    skipMeta = false,
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

  // --- ftyp box (16 bytes) ---
  pushUint32BE(16);
  pushString('ftyp');
  pushString(brand.padEnd(4, ' ').slice(0, 4));
  pushUint32BE(0);

  if (skipMeta) {
    // Only ftyp + mdat, no meta box
    const mdatTotalSize = 8 + primaryDataSize + gainmapDataSize;
    pushUint32BE(mdatTotalSize);
    pushString('mdat');
    for (let i = 0; i < primaryDataSize; i++) parts.push(0xAA);
    for (let i = 0; i < gainmapDataSize; i++) parts.push(0xBB);

    const buf = new ArrayBuffer(parts.length);
    const uint8 = new Uint8Array(buf);
    for (let i = 0; i < parts.length; i++) {
      uint8[i] = parts[i]!;
    }
    return buf;
  }

  // --- Build meta box content ---
  const metaContentParts: number[][] = [];

  // -- pitm (FullBox, version 0): primary item ID = 1 --
  if (!skipPitm) {
    const pitm: number[] = [];
    const pitmSize = 14; // 4(size) + 4(type) + 4(ver+flags) + 2(item_id)
    pitm.push(...uint32BE(pitmSize));
    pitm.push(...strBytes('pitm'));
    pitm.push(0, 0, 0, 0); // version=0, flags=0
    pitm.push(...uint16BE(1)); // primary item ID = 1
    metaContentParts.push(pitm);
  }

  // -- iinf (FullBox) with infe entries --
  // Items: 1=av01 (primary), 2=av01 (gainmap), optionally 3=mime (XMP)
  const itemCount = includeXMP ? 3 : 2;
  const infeEntries: number[][] = [];

  // infe for item 1 (primary, av01)
  infeEntries.push(buildInfe(1, 'av01'));
  // infe for item 2 (gainmap, av01)
  infeEntries.push(buildInfe(2, 'av01'));
  // infe for item 3 (XMP mime) if needed
  if (includeXMP) {
    infeEntries.push(buildInfe(3, 'mime'));
  }

  const infeTotalSize = infeEntries.reduce((s, e) => s + e.length, 0);
  const iinfSize = 4 + 4 + 4 + 2 + infeTotalSize; // size + type + ver+flags + count + entries
  const iinf: number[] = [];
  iinf.push(...uint32BE(iinfSize));
  iinf.push(...strBytes('iinf'));
  iinf.push(0, 0, 0, 0); // version=0, flags=0
  iinf.push(...uint16BE(itemCount));
  for (const entry of infeEntries) iinf.push(...entry);
  metaContentParts.push(iinf);

  // -- iprp -> ipco -> auxC (+ optional colr + optional tmap) + ipma --
  // Build ipco content
  const ipcoContent: number[] = [];

  // Property 1: auxC box (FullBox) with gainmap URN
  if (includeGainmapAuxC) {
    const urn = 'urn:com:photo:aux:hdrgainmap';
    const auxCSize = 4 + 4 + 4 + urn.length + 1; // size + type + ver+flags + urn + null
    ipcoContent.push(...uint32BE(auxCSize));
    ipcoContent.push(...strBytes('auxC'));
    ipcoContent.push(0, 0, 0, 0); // version=0, flags=0
    for (let i = 0; i < urn.length; i++) ipcoContent.push(urn.charCodeAt(i));
    ipcoContent.push(0); // null terminator
  }

  // Property 2 (optional): colr(nclx) with PQ transfer
  if (includeNclxHDR) {
    const colrSize = 4 + 4 + 4 + 2 + 2 + 2 + 1; // size + type + nclx + primaries + transfer + matrix + range
    ipcoContent.push(...uint32BE(colrSize));
    ipcoContent.push(...strBytes('colr'));
    ipcoContent.push(...strBytes('nclx'));
    ipcoContent.push(...uint16BE(9)); // BT.2020 primaries
    ipcoContent.push(...uint16BE(16)); // PQ transfer
    ipcoContent.push(...uint16BE(0)); // matrix
    ipcoContent.push(1); // full range
  }

  // Property (optional): tmap box with ISO 21496-1 structure
  if (tmapData) {
    const cc = tmapData.channelCount ?? 1;
    const flagsByte = cc === 3 ? 1 : 0;

    // Defaults: all zeros except what is explicitly provided
    const defaults = (count: number, val: number) => {
      const arr = [];
      for (let i = 0; i < count; i++) arr.push(val);
      return arr;
    };

    const gainMapMinN = tmapData.gainMapMinN ?? defaults(cc, 0);
    const gainMapMinD = tmapData.gainMapMinD ?? defaults(cc, 1);
    const gainMapMaxN = tmapData.gainMapMaxN ?? defaults(cc, 1);
    const gainMapMaxD = tmapData.gainMapMaxD ?? defaults(cc, 1);
    const gainMapGammaN = tmapData.gainMapGammaN ?? defaults(cc, 1);
    const gainMapGammaD = tmapData.gainMapGammaD ?? defaults(cc, 1);
    const baseOffsetN = tmapData.baseOffsetN ?? defaults(cc, 0);
    const baseOffsetD = tmapData.baseOffsetD ?? defaults(cc, 1);
    const alternateOffsetN = tmapData.alternateOffsetN ?? defaults(cc, 0);
    const alternateOffsetD = tmapData.alternateOffsetD ?? defaults(cc, 1);
    const baseHdrHeadroomN = tmapData.baseHdrHeadroomN ?? 0;
    const baseHdrHeadroomD = tmapData.baseHdrHeadroomD ?? 1;
    const alternateHdrHeadroomN = tmapData.alternateHdrHeadroomN ?? 0;
    const alternateHdrHeadroomD = tmapData.alternateHdrHeadroomD ?? 1;

    // Compute data size: version(1) + flags(3) + per-channel arrays(5 pairs * cc * 2 * 4) + scalars(4 * 4)
    const tmapPayloadSize = 4 + (cc * 2 * 4 * 5) + (4 * 4);
    const tmapSize = 8 + tmapPayloadSize; // box header + payload
    ipcoContent.push(...uint32BE(tmapSize));
    ipcoContent.push(...strBytes('tmap'));

    // version (1 byte) + flags (3 bytes)
    ipcoContent.push(0); // version = 0
    ipcoContent.push(0, 0, flagsByte); // flags

    // Per-channel arrays: N then D for each parameter
    for (const n of gainMapMinN) ipcoContent.push(...uint32BE(n));
    for (const d of gainMapMinD) ipcoContent.push(...uint32BE(d));
    for (const n of gainMapMaxN) ipcoContent.push(...uint32BE(n));
    for (const d of gainMapMaxD) ipcoContent.push(...uint32BE(d));
    for (const n of gainMapGammaN) ipcoContent.push(...uint32BE(n));
    for (const d of gainMapGammaD) ipcoContent.push(...uint32BE(d));
    for (const n of baseOffsetN) ipcoContent.push(...uint32BE(n));
    for (const d of baseOffsetD) ipcoContent.push(...uint32BE(d));
    for (const n of alternateOffsetN) ipcoContent.push(...uint32BE(n));
    for (const d of alternateOffsetD) ipcoContent.push(...uint32BE(d));

    // Scalar headroom values
    ipcoContent.push(...uint32BE(baseHdrHeadroomN));
    ipcoContent.push(...uint32BE(baseHdrHeadroomD));
    ipcoContent.push(...uint32BE(alternateHdrHeadroomN));
    ipcoContent.push(...uint32BE(alternateHdrHeadroomD));
  }

  const ipcoSize = 8 + ipcoContent.length;

  // Build ipma (FullBox, version=0, flags bit0=0 -> 8-bit property entries)
  // Associate item 2 with property index 1 (the auxC box)
  const ipma: number[] = [];
  const ipmaEntryCount = 1; // just item 2 -> auxC
  const ipmaSize = 4 + 4 + 4 + 4 + 2 + 1 + 1; // size + type + ver+flags + entry_count + item_id + assoc_count + entry
  ipma.push(...uint32BE(ipmaSize));
  ipma.push(...strBytes('ipma'));
  ipma.push(0, 0, 0, 0); // version=0, flags=0
  ipma.push(...uint32BE(ipmaEntryCount));
  ipma.push(...uint16BE(2)); // item_id = 2 (gainmap)
  ipma.push(1); // association_count = 1
  ipma.push(0x81); // essential=1, property_index=1 (8-bit: 1 bit essential + 7 bits index)

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
  // offset_size=4, length_size=4, base_offset_size=0
  // Items: primary (item 1), gainmap (item 2), optional XMP (item 3)
  const ilocItemCount = includeXMP ? 3 : 2;

  // Each item: item_id(2) + data_ref_index(2) + extent_count(2) + extent_offset(4) + extent_length(4) = 14
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
  const metaSize = 12 + metaContentSize; // 12 = size(4) + type(4) + ver+flags(4)

  // mdat starts after ftyp + meta
  const mdatStart = 16 + metaSize;
  const mdatHeaderSize = 8;
  const mdatDataStart = mdatStart + mdatHeaderSize;

  // Primary data at mdatDataStart, gainmap after, XMP after gainmap
  const primaryOffset = mdatDataStart;
  const gainmapOffset = primaryOffset + primaryDataSize;
  const xmpOffset = gainmapOffset + gainmapDataSize;

  // Now build iloc with correct offsets
  const iloc: number[] = [];
  iloc.push(...uint32BE(ilocSize));
  iloc.push(...strBytes('iloc'));
  iloc.push(0, 0, 0, 0); // version=0, flags=0
  iloc.push(0x44); // offset_size=4, length_size=4
  iloc.push(0x00); // base_offset_size=0
  iloc.push(...uint16BE(ilocItemCount));

  // Item 1 (primary)
  iloc.push(...uint16BE(1)); // item_id
  iloc.push(...uint16BE(0)); // data_ref_index
  iloc.push(...uint16BE(1)); // extent_count
  iloc.push(...uint32BE(primaryOffset));
  iloc.push(...uint32BE(primaryDataSize));

  // Item 2 (gainmap)
  iloc.push(...uint16BE(2)); // item_id
  iloc.push(...uint16BE(0)); // data_ref_index
  iloc.push(...uint16BE(1)); // extent_count
  iloc.push(...uint32BE(gainmapOffset));
  iloc.push(...uint32BE(gainmapDataSize));

  // Item 3 (XMP)
  if (includeXMP) {
    iloc.push(...uint16BE(3)); // item_id
    iloc.push(...uint16BE(0)); // data_ref_index
    iloc.push(...uint16BE(1)); // extent_count
    iloc.push(...uint32BE(xmpOffset));
    iloc.push(...uint32BE(xmpData.length));
  }

  // --- Assemble meta box ---
  // meta header
  pushUint32BE(metaSize);
  pushString('meta');
  pushBytes(0, 0, 0, 0); // version + flags

  // meta content
  for (const part of metaContentParts) parts.push(...part);
  parts.push(...iloc);

  // --- mdat box ---
  const mdatTotalSize = mdatHeaderSize + primaryDataSize + gainmapDataSize + xmpData.length;
  pushUint32BE(mdatTotalSize);
  pushString('mdat');

  // Primary data (dummy bytes)
  for (let i = 0; i < primaryDataSize; i++) parts.push(0xAA);
  // Gainmap data (dummy bytes)
  for (let i = 0; i < gainmapDataSize; i++) parts.push(0xBB);
  // XMP data
  parts.push(...xmpData);

  // Convert to ArrayBuffer
  const buf = new ArrayBuffer(parts.length);
  const uint8 = new Uint8Array(buf);
  for (let i = 0; i < parts.length; i++) {
    uint8[i] = parts[i]!;
  }
  return buf;
}

// Utility helpers for the test buffer builder
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
  // infe FullBox version 2: size(4) + type(4) + ver+flags(4) + item_id(2) + protection_index(2) + item_type(4) = 20
  const size = 20;
  return [
    ...uint32BE(size),
    ...strBytes('infe'),
    0x02, 0x00, 0x00, 0x00, // version=2, flags=0
    ...uint16BE(itemId),
    ...uint16BE(0), // protection index
    ...strBytes(itemType),
  ];
}

// =============================================================================
// Tests
// =============================================================================

describe('AVIFGainmapDecoder', () => {
  describe('isGainmapAVIF', () => {
    it('AGM-001: returns true for AVIF with auxC gainmap property', () => {
      const buf = createTestAVIFGainmapBuffer({ includeGainmapAuxC: true });
      expect(isGainmapAVIF(buf)).toBe(true);
    });

    it('AGM-002: returns false for standard AVIF (no auxC)', () => {
      const buf = createTestAVIFGainmapBuffer({ includeGainmapAuxC: false });
      expect(isGainmapAVIF(buf)).toBe(false);
    });

    it('AGM-003: returns false for HDR AVIF (PQ nclx, no auxC)', () => {
      const buf = createTestAVIFGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclxHDR: true,
      });
      expect(isGainmapAVIF(buf)).toBe(false);
    });

    it('AGM-004: returns false for non-AVIF buffer', () => {
      // PNG magic
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint32(0, 0x89504e47, false);
      expect(isGainmapAVIF(buf)).toBe(false);
    });

    it('AGM-005: returns false for buffer too small', () => {
      expect(isGainmapAVIF(new ArrayBuffer(4))).toBe(false);
      expect(isGainmapAVIF(new ArrayBuffer(0))).toBe(false);
    });

    it('AGM-006: returns true for AVIF with mif1 brand', () => {
      const buf = createTestAVIFGainmapBuffer({
        brand: 'mif1',
        includeGainmapAuxC: true,
      });
      expect(isGainmapAVIF(buf)).toBe(true);
    });

    it('AGM-007: returns true for AVIF with avis brand', () => {
      const buf = createTestAVIFGainmapBuffer({
        brand: 'avis',
        includeGainmapAuxC: true,
      });
      expect(isGainmapAVIF(buf)).toBe(true);
    });

    it('AGM-008: returns false for unknown brand', () => {
      const buf = createTestAVIFGainmapBuffer({
        brand: 'heic',
        includeGainmapAuxC: true,
      });
      expect(isGainmapAVIF(buf)).toBe(false);
    });
  });

  describe('parseGainmapAVIF', () => {
    it('AGM-010: extracts primary and gainmap item IDs', () => {
      const buf = createTestAVIFGainmapBuffer();
      const info = parseGainmapAVIF(buf);

      expect(info).not.toBeNull();
      expect(info!.primaryItemId).toBe(1);
      expect(info!.gainmapItemId).toBe(2);
    });

    it('AGM-011: extracts correct byte offsets from iloc', () => {
      const buf = createTestAVIFGainmapBuffer({
        primaryDataSize: 200,
        gainmapDataSize: 80,
      });
      const info = parseGainmapAVIF(buf);

      expect(info).not.toBeNull();
      expect(info!.primaryLength).toBe(200);
      expect(info!.gainmapLength).toBe(80);
      expect(info!.primaryOffset).toBeGreaterThan(0);
      expect(info!.gainmapOffset).toBe(info!.primaryOffset + 200);
    });

    it('AGM-012: extracts headroom from XMP mime item', () => {
      const buf = createTestAVIFGainmapBuffer({
        includeXMP: true,
        xmpHeadroom: 5.2,
      });
      const info = parseGainmapAVIF(buf);

      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(5.2, 1);
    });

    it('AGM-013: uses fallback headroom 2.0 when no XMP', () => {
      const buf = createTestAVIFGainmapBuffer({ includeXMP: false });
      const info = parseGainmapAVIF(buf);

      expect(info).not.toBeNull();
      expect(info!.headroom).toBe(2.0);
    });

    it('AGM-014: returns null for non-gainmap AVIF', () => {
      const buf = createTestAVIFGainmapBuffer({ includeGainmapAuxC: false });
      const info = parseGainmapAVIF(buf);
      expect(info).toBeNull();
    });

    it('AGM-015: returns null for buffer with ftyp but no meta box', () => {
      const buf = createTestAVIFGainmapBuffer({ skipMeta: true });
      const info = parseGainmapAVIF(buf);
      expect(info).toBeNull();
    });

    it('AGM-016: returns null for buffer with meta but no pitm box', () => {
      const buf = createTestAVIFGainmapBuffer({ skipPitm: true });
      const info = parseGainmapAVIF(buf);
      expect(info).toBeNull();
    });

    it('AGM-017: returns null for non-AVIF buffer', () => {
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint32(0, 0x89504e47, false); // PNG magic
      expect(parseGainmapAVIF(buf)).toBeNull();
    });

    it('AGM-018: returns null for buffer too small', () => {
      expect(parseGainmapAVIF(new ArrayBuffer(4))).toBeNull();
      expect(parseGainmapAVIF(new ArrayBuffer(0))).toBeNull();
    });

    it('AGM-019: extracts headroom from tmap box when no XMP', () => {
      // Include a tmap box with alternateHdrHeadroom = 4/1 = 4.0 stops
      const buf = createTestAVIFGainmapBuffer({
        includeXMP: false,
        tmapData: {
          alternateHdrHeadroomN: 4,
          alternateHdrHeadroomD: 1,
        },
      });
      const info = parseGainmapAVIF(buf);

      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(4.0, 1);
    });

    it('AGM-020: XMP headroom takes priority over tmap headroom', () => {
      // Include both XMP and tmap; XMP should win because extractHeadroom checks XMP first
      const buf = createTestAVIFGainmapBuffer({
        includeXMP: true,
        xmpHeadroom: 6.0,
        tmapData: {
          alternateHdrHeadroomN: 3,
          alternateHdrHeadroomD: 1,
        },
      });
      const info = parseGainmapAVIF(buf);

      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(6.0, 1);
    });

    it('AGM-021: handles different primary and gainmap data sizes', () => {
      const sizes = [
        { primary: 1, gainmap: 1 },
        { primary: 10000, gainmap: 5000 },
        { primary: 512, gainmap: 256 },
      ];

      for (const { primary, gainmap } of sizes) {
        const buf = createTestAVIFGainmapBuffer({
          primaryDataSize: primary,
          gainmapDataSize: gainmap,
        });
        const info = parseGainmapAVIF(buf);
        expect(info).not.toBeNull();
        expect(info!.primaryLength).toBe(primary);
        expect(info!.gainmapLength).toBe(gainmap);
      }
    });
  });

  describe('parseHeadroomFromXMPText', () => {
    it('parses apple:hdrgainmapheadroom', () => {
      const xmp = '<rdf:Description apple:hdrgainmapheadroom="4.5"/>';
      expect(parseHeadroomFromXMPText(xmp)).toBeCloseTo(4.5);
    });

    it('parses hdrgm:GainMapMax', () => {
      const xmp = '<rdf:Description hdrgm:GainMapMax="6.0"/>';
      expect(parseHeadroomFromXMPText(xmp)).toBeCloseTo(6.0);
    });

    it('parses HDRGainMapHeadroom', () => {
      const xmp = '<rdf:Description HDRGainMapHeadroom="2.5"/>';
      expect(parseHeadroomFromXMPText(xmp)).toBeCloseTo(2.5);
    });

    it('returns null for no headroom info', () => {
      expect(parseHeadroomFromXMPText('<rdf:Description/>')).toBeNull();
    });

    it('returns null for zero headroom value', () => {
      const xmp = '<rdf:Description apple:hdrgainmapheadroom="0"/>';
      expect(parseHeadroomFromXMPText(xmp)).toBeNull();
    });

    it('returns null for negative headroom value', () => {
      const xmp = '<rdf:Description apple:hdrgainmapheadroom="-1.5"/>';
      expect(parseHeadroomFromXMPText(xmp)).toBeNull();
    });

    it('returns null for NaN headroom value', () => {
      const xmp = '<rdf:Description apple:hdrgainmapheadroom="abc"/>';
      expect(parseHeadroomFromXMPText(xmp)).toBeNull();
    });

    it('parses headroom with integer value', () => {
      const xmp = '<rdf:Description apple:hdrgainmapheadroom="8"/>';
      expect(parseHeadroomFromXMPText(xmp)).toBeCloseTo(8.0);
    });

    it('prefers apple:hdrgainmapheadroom when multiple present', () => {
      const xmp = '<rdf:Description apple:hdrgainmapheadroom="3.5" hdrgm:GainMapMax="7.0"/>';
      // apple match is checked first
      expect(parseHeadroomFromXMPText(xmp)).toBeCloseTo(3.5);
    });
  });

  describe('parseTmapBox (ISO 21496-1)', () => {
    /**
     * Build a raw tmap box payload (without box header) for direct parseTmapBox testing.
     */
    function buildTmapPayload(opts: {
      version?: number;
      channelCount?: number;
      gainMapMinN?: number[];
      gainMapMinD?: number[];
      gainMapMaxN?: number[];
      gainMapMaxD?: number[];
      gainMapGammaN?: number[];
      gainMapGammaD?: number[];
      baseOffsetN?: number[];
      baseOffsetD?: number[];
      alternateOffsetN?: number[];
      alternateOffsetD?: number[];
      baseHdrHeadroomN?: number;
      baseHdrHeadroomD?: number;
      alternateHdrHeadroomN?: number;
      alternateHdrHeadroomD?: number;
    } = {}): ArrayBuffer {
      const cc = opts.channelCount ?? 1;
      const version = opts.version ?? 0;
      const flagsByte = cc === 3 ? 1 : 0;
      const defaults = (count: number, val: number) => Array(count).fill(val) as number[];

      const gainMapMinN = opts.gainMapMinN ?? defaults(cc, 0);
      const gainMapMinD = opts.gainMapMinD ?? defaults(cc, 1);
      const gainMapMaxN = opts.gainMapMaxN ?? defaults(cc, 1);
      const gainMapMaxD = opts.gainMapMaxD ?? defaults(cc, 1);
      const gainMapGammaN = opts.gainMapGammaN ?? defaults(cc, 1);
      const gainMapGammaD = opts.gainMapGammaD ?? defaults(cc, 1);
      const baseOffsetN = opts.baseOffsetN ?? defaults(cc, 0);
      const baseOffsetD = opts.baseOffsetD ?? defaults(cc, 1);
      const alternateOffsetN = opts.alternateOffsetN ?? defaults(cc, 0);
      const alternateOffsetD = opts.alternateOffsetD ?? defaults(cc, 1);
      const baseHdrHeadroomN = opts.baseHdrHeadroomN ?? 0;
      const baseHdrHeadroomD = opts.baseHdrHeadroomD ?? 1;
      const alternateHdrHeadroomN = opts.alternateHdrHeadroomN ?? 0;
      const alternateHdrHeadroomD = opts.alternateHdrHeadroomD ?? 1;

      const size = 4 + (cc * 2 * 4 * 5) + (4 * 4);
      const buf = new ArrayBuffer(size);
      const view = new DataView(buf);
      let pos = 0;

      view.setUint8(pos, version); pos += 1;
      view.setUint8(pos, 0); pos += 1;
      view.setUint8(pos, 0); pos += 1;
      view.setUint8(pos, flagsByte); pos += 1;

      const writeArray = (arr: number[]) => {
        for (const v of arr) { view.setUint32(pos, v); pos += 4; }
      };

      writeArray(gainMapMinN);
      writeArray(gainMapMinD);
      writeArray(gainMapMaxN);
      writeArray(gainMapMaxD);
      writeArray(gainMapGammaN);
      writeArray(gainMapGammaD);
      writeArray(baseOffsetN);
      writeArray(baseOffsetD);
      writeArray(alternateOffsetN);
      writeArray(alternateOffsetD);

      view.setUint32(pos, baseHdrHeadroomN); pos += 4;
      view.setUint32(pos, baseHdrHeadroomD); pos += 4;
      view.setUint32(pos, alternateHdrHeadroomN); pos += 4;
      view.setUint32(pos, alternateHdrHeadroomD); pos += 4;

      return buf;
    }

    it('AGM-030: parses single-channel tmap with alternateHdrHeadroom', () => {
      const buf = buildTmapPayload({
        channelCount: 1,
        alternateHdrHeadroomN: 4,
        alternateHdrHeadroomD: 1,
      });
      const view = new DataView(buf);
      const result = parseTmapBox(view, 0, buf.byteLength);

      expect(result).not.toBeNull();
      expect(result!.channelCount).toBe(1);
      expect(result!.alternateHdrHeadroom).toBe(4.0);
    });

    it('AGM-031: parses 3-channel tmap with per-channel gainMapMax', () => {
      const buf = buildTmapPayload({
        channelCount: 3,
        gainMapMaxN: [3, 4, 5],
        gainMapMaxD: [1, 1, 1],
        alternateHdrHeadroomN: 6,
        alternateHdrHeadroomD: 1,
      });
      const view = new DataView(buf);
      const result = parseTmapBox(view, 0, buf.byteLength);

      expect(result).not.toBeNull();
      expect(result!.channelCount).toBe(3);
      expect(result!.gainMapMax).toEqual([3, 4, 5]);
      expect(result!.alternateHdrHeadroom).toBe(6.0);
    });

    it('AGM-032: computes fractional headroom from numerator/denominator', () => {
      const buf = buildTmapPayload({
        channelCount: 1,
        alternateHdrHeadroomN: 7,
        alternateHdrHeadroomD: 2,
      });
      const view = new DataView(buf);
      const result = parseTmapBox(view, 0, buf.byteLength);

      expect(result).not.toBeNull();
      expect(result!.alternateHdrHeadroom).toBe(3.5);
    });

    it('AGM-033: returns null for truncated tmap data', () => {
      // Only 2 bytes - not enough for version + flags
      const buf = new ArrayBuffer(2);
      const view = new DataView(buf);
      expect(parseTmapBox(view, 0, buf.byteLength)).toBeNull();
    });

    it('AGM-034: returns null for unsupported version', () => {
      const buf = buildTmapPayload({ channelCount: 1 });
      const view = new DataView(buf);
      // Override version to 1
      view.setUint8(0, 1);
      expect(parseTmapBox(view, 0, buf.byteLength)).toBeNull();
    });

    it('AGM-035: handles zero denominator gracefully (returns 0)', () => {
      const buf = buildTmapPayload({
        channelCount: 1,
        alternateHdrHeadroomN: 5,
        alternateHdrHeadroomD: 0,
      });
      const view = new DataView(buf);
      const result = parseTmapBox(view, 0, buf.byteLength);

      expect(result).not.toBeNull();
      expect(result!.alternateHdrHeadroom).toBe(0);
    });

    it('AGM-036: parses all per-channel fields correctly for single channel', () => {
      const buf = buildTmapPayload({
        channelCount: 1,
        gainMapMinN: [1],
        gainMapMinD: [4],
        gainMapMaxN: [10],
        gainMapMaxD: [2],
        gainMapGammaN: [3],
        gainMapGammaD: [2],
        baseOffsetN: [1],
        baseOffsetD: [10],
        alternateOffsetN: [2],
        alternateOffsetD: [5],
        baseHdrHeadroomN: 1,
        baseHdrHeadroomD: 2,
        alternateHdrHeadroomN: 8,
        alternateHdrHeadroomD: 1,
      });
      const view = new DataView(buf);
      const result = parseTmapBox(view, 0, buf.byteLength);

      expect(result).not.toBeNull();
      expect(result!.channelCount).toBe(1);
      expect(result!.gainMapMin).toEqual([0.25]);
      expect(result!.gainMapMax).toEqual([5]);
      expect(result!.gainMapGamma).toEqual([1.5]);
      expect(result!.baseOffset).toEqual([0.1]);
      expect(result!.alternateOffset).toEqual([0.4]);
      expect(result!.baseHdrHeadroom).toBe(0.5);
      expect(result!.alternateHdrHeadroom).toBe(8);
    });

    it('AGM-037: parses all per-channel fields correctly for 3 channels', () => {
      const buf = buildTmapPayload({
        channelCount: 3,
        gainMapMinN: [1, 2, 3],
        gainMapMinD: [10, 10, 10],
        gainMapMaxN: [5, 6, 7],
        gainMapMaxD: [1, 1, 1],
        gainMapGammaN: [1, 1, 1],
        gainMapGammaD: [1, 1, 1],
        baseOffsetN: [0, 0, 0],
        baseOffsetD: [1, 1, 1],
        alternateOffsetN: [0, 0, 0],
        alternateOffsetD: [1, 1, 1],
        baseHdrHeadroomN: 0,
        baseHdrHeadroomD: 1,
        alternateHdrHeadroomN: 3,
        alternateHdrHeadroomD: 1,
      });
      const view = new DataView(buf);
      const result = parseTmapBox(view, 0, buf.byteLength);

      expect(result).not.toBeNull();
      expect(result!.channelCount).toBe(3);
      expect(result!.gainMapMin).toEqual([0.1, 0.2, 0.3]);
      expect(result!.gainMapMax).toEqual([5, 6, 7]);
      expect(result!.alternateHdrHeadroom).toBe(3);
    });

    it('AGM-038: returns null when tmap data is truncated mid-field', () => {
      // Build valid payload, then truncate it
      const fullBuf = buildTmapPayload({
        channelCount: 1,
        alternateHdrHeadroomN: 4,
        alternateHdrHeadroomD: 1,
      });
      // Truncate to just past version+flags+some fields but before headroom
      const truncated = fullBuf.slice(0, 20);
      const view = new DataView(truncated);
      expect(parseTmapBox(view, 0, truncated.byteLength)).toBeNull();
    });

    it('AGM-039: tmap with zero alternateHdrHeadroom falls back to gainMapMax', () => {
      const buf = createTestAVIFGainmapBuffer({
        includeXMP: false,
        tmapData: {
          gainMapMaxN: [5],
          gainMapMaxD: [1],
          alternateHdrHeadroomN: 0,
          alternateHdrHeadroomD: 1,
        },
      });
      const info = parseGainmapAVIF(buf);
      expect(info).not.toBeNull();
      expect(info!.headroom).toBeCloseTo(5.0, 1);
    });
  });

  describe('readSizedUint edge cases (via iloc configurations)', () => {
    it('AGM-040: iloc with offset_size=4, length_size=4 (standard)', () => {
      // This is the default configuration used by our test helper
      const buf = createTestAVIFGainmapBuffer({
        primaryDataSize: 1024,
        gainmapDataSize: 512,
      });
      const info = parseGainmapAVIF(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryLength).toBe(1024);
      expect(info!.gainmapLength).toBe(512);
    });

    it('AGM-041: iloc with large data sizes exercises uint32 path', () => {
      // Use a data size that requires full uint32 range (just under 64KB)
      const buf = createTestAVIFGainmapBuffer({
        primaryDataSize: 65000,
        gainmapDataSize: 32000,
      });
      const info = parseGainmapAVIF(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryLength).toBe(65000);
      expect(info!.gainmapLength).toBe(32000);
      // Verify offsets are sequential: gainmap starts right after primary
      expect(info!.gainmapOffset).toBe(info!.primaryOffset + 65000);
    });

    it('AGM-042: iloc with minimal data sizes (1 byte each)', () => {
      const buf = createTestAVIFGainmapBuffer({
        primaryDataSize: 1,
        gainmapDataSize: 1,
      });
      const info = parseGainmapAVIF(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryLength).toBe(1);
      expect(info!.gainmapLength).toBe(1);
    });
  });

  describe('buildStandaloneAVIF', () => {
    it('AGM-023: produces valid ISOBMFF structure', () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const result = buildStandaloneAVIF(testData);

      expect(result.byteLength).toBeGreaterThan(testData.length);

      const view = new DataView(result);
      // Check ftyp box
      const ftypType = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
      );
      expect(ftypType).toBe('ftyp');

      // Check brand
      const brand = String.fromCharCode(
        view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
      );
      expect(brand).toBe('mif1');

      // Find meta box at offset 16
      const metaType = String.fromCharCode(
        view.getUint8(20), view.getUint8(21), view.getUint8(22), view.getUint8(23)
      );
      expect(metaType).toBe('meta');

      // Verify mdat contains our data
      const bytes = new Uint8Array(result);
      // Find mdat marker
      let mdatPos = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i + 4] === 0x6D && bytes[i + 5] === 0x64 &&
            bytes[i + 6] === 0x61 && bytes[i + 7] === 0x74) { // 'mdat'
          mdatPos = i;
          break;
        }
      }
      expect(mdatPos).toBeGreaterThan(0);

      // Check coded data is in mdat
      const mdatDataStart = mdatPos + 8;
      for (let i = 0; i < testData.length; i++) {
        expect(bytes[mdatDataStart + i]).toBe(testData[i]);
      }
    });

    it('AGM-023b: mdat size matches coded data', () => {
      const testData = new Uint8Array(42);
      for (let i = 0; i < 42; i++) testData[i] = i;

      const result = buildStandaloneAVIF(testData);
      const view = new DataView(result);

      // Find mdat box
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
      expect(mdatSize).toBe(8 + 42); // header + data
    });

    it('AGM-023c: iloc extent offset and length are consistent with mdat', () => {
      const testData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      const result = buildStandaloneAVIF(testData);
      const view = new DataView(result);
      const bytes = new Uint8Array(result);

      // Find mdat box
      let mdatPos = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i + 4] === 0x6D && bytes[i + 5] === 0x64 &&
            bytes[i + 6] === 0x61 && bytes[i + 7] === 0x74) {
          mdatPos = i;
          break;
        }
      }
      expect(mdatPos).toBeGreaterThan(0);

      // Find iloc box to read the extent offset
      let ilocPos = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (bytes[i + 4] === 0x69 && bytes[i + 5] === 0x6C &&
            bytes[i + 6] === 0x6F && bytes[i + 7] === 0x63) { // 'iloc'
          ilocPos = i;
          break;
        }
      }
      expect(ilocPos).toBeGreaterThan(0);

      // iloc structure (version=0):
      // size(4) + type(4) + version+flags(4) + size_fields(2) + item_count(2)
      // then per item: item_id(2) + data_ref_index(2) + extent_count(2) + [offset(4) + length(4)]
      const ilocDataStart = ilocPos + 8 + 4; // after header + version+flags
      // Skip size_fields(2) + item_count(2) = 4 bytes
      // First item: item_id(2) + data_ref_index(2) + extent_count(2) = 6 bytes, then offset(4)
      const extentOffsetPos = ilocDataStart + 4 + 6;
      const extentOffset = view.getUint32(extentOffsetPos);
      const extentLength = view.getUint32(extentOffsetPos + 4);

      // Extent length should match our test data length
      expect(extentLength).toBe(testData.length);

      // Extent offset should point somewhere within the file and after the meta box
      expect(extentOffset).toBeGreaterThan(0);
      expect(extentOffset).toBeLessThan(result.byteLength);

      // The offset should be in the vicinity of the mdat box
      // (within mdat_start .. mdat_end range)
      const mdatSize = view.getUint32(mdatPos);
      expect(extentOffset).toBeGreaterThanOrEqual(mdatPos);
      expect(extentOffset + extentLength).toBeLessThanOrEqual(mdatPos + mdatSize);
    });

    it('AGM-023d: empty coded data produces valid structure', () => {
      const testData = new Uint8Array(0);
      const result = buildStandaloneAVIF(testData);
      const view = new DataView(result);

      // Should still produce valid ftyp + meta + mdat
      expect(result.byteLength).toBeGreaterThan(0);

      const ftypType = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
      );
      expect(ftypType).toBe('ftyp');
    });
  });

  // ===========================================================================
  // Helper: build a minimal meta box content for orientation/transform tests
  // ===========================================================================

  /**
   * Build meta box content (the bytes between metaStart and metaEnd) containing:
   *   pitm (primary item ID = 1)
   *   iprp ( ipco ( [irot] [imir] ) + ipma (item 1 → listed properties) )
   *
   * Properties are 1-indexed in ipco. If irotAngle is provided, it becomes
   * property 1 (or 2 if imir comes first — but here irot always comes first).
   */
  function buildMetaContent(options: { irotAngle?: number; imirAxis?: number } = {}): ArrayBuffer {
    const parts: number[] = [];

    // --- pitm (FullBox, version=0): 14 bytes ---
    // size(4) + "pitm"(4) + version+flags(4) + item_id(2)
    parts.push(...uint32BE(14));
    parts.push(...strBytes('pitm'));
    parts.push(0, 0, 0, 0); // version=0, flags=0
    parts.push(...uint16BE(1)); // primary item ID = 1

    // --- Build ipco property boxes ---
    const ipcoProperties: number[][] = [];
    if (options.irotAngle !== undefined) {
      // irot: plain box, 9 bytes: size(4) + "irot"(4) + angle(1)
      ipcoProperties.push([
        ...uint32BE(9),
        0x69, 0x72, 0x6F, 0x74, // "irot"
        options.irotAngle & 0x03,
      ]);
    }
    if (options.imirAxis !== undefined) {
      // imir: plain box, 9 bytes: size(4) + "imir"(4) + axis(1)
      ipcoProperties.push([
        ...uint32BE(9),
        0x69, 0x6D, 0x69, 0x72, // "imir"
        options.imirAxis & 0x01,
      ]);
    }

    const ipcoContentBytes: number[] = [];
    for (const prop of ipcoProperties) ipcoContentBytes.push(...prop);
    const ipcoSize = 8 + ipcoContentBytes.length; // size(4) + "ipco"(4) + content

    // --- Build ipma (FullBox, version=0, flags=0) ---
    // Associates item 1 with all properties in ipco (1-indexed)
    const propCount = ipcoProperties.length;
    // ipma: size(4) + "ipma"(4) + version+flags(4) + entry_count(4)
    //       + item_id(2) + assoc_count(1) + N * association(1 each)
    const ipmaSize = 4 + 4 + 4 + 4 + 2 + 1 + propCount;
    const ipmaBytes: number[] = [];
    ipmaBytes.push(...uint32BE(ipmaSize));
    ipmaBytes.push(...strBytes('ipma'));
    ipmaBytes.push(0, 0, 0, 0); // version=0, flags=0
    ipmaBytes.push(...uint32BE(propCount > 0 ? 1 : 0)); // entry_count (1 entry for item 1, or 0 if no props)
    if (propCount > 0) {
      ipmaBytes.push(...uint16BE(1)); // item_id = 1 (primary)
      ipmaBytes.push(propCount); // association count
      for (let i = 1; i <= propCount; i++) {
        ipmaBytes.push(0x80 | i); // essential=1, property_index=i (8-bit: 1 bit essential + 7 bits index)
      }
    }

    // --- Build iprp (plain box) wrapping ipco + ipma ---
    const iprpSize = 8 + ipcoSize + ipmaBytes.length;
    parts.push(...uint32BE(iprpSize));
    parts.push(...strBytes('iprp'));
    // ipco
    parts.push(...uint32BE(ipcoSize));
    parts.push(...strBytes('ipco'));
    parts.push(...ipcoContentBytes);
    // ipma
    parts.push(...ipmaBytes);

    const buf = new ArrayBuffer(parts.length);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < parts.length; i++) u8[i] = parts[i]!;
    return buf;
  }

  // ===========================================================================
  // parseISOBMFFOrientation tests
  // ===========================================================================

  describe('parseISOBMFFOrientation', () => {
    it('AGM-050: returns 1 when no irot/imir boxes exist', () => {
      const buf = buildMetaContent({}); // no irot, no imir
      const view = new DataView(buf);
      expect(parseISOBMFFOrientation(view, 0, buf.byteLength)).toBe(1);
    });

    it('AGM-051: returns 6 for irot angle=3 (270 CCW = 90 CW)', () => {
      const buf = buildMetaContent({ irotAngle: 3 });
      const view = new DataView(buf);
      expect(parseISOBMFFOrientation(view, 0, buf.byteLength)).toBe(6);
    });

    it('AGM-052: returns 8 for irot angle=1 (90 CCW)', () => {
      const buf = buildMetaContent({ irotAngle: 1 });
      const view = new DataView(buf);
      expect(parseISOBMFFOrientation(view, 0, buf.byteLength)).toBe(8);
    });

    it('AGM-053: returns 3 for irot angle=2 (180)', () => {
      const buf = buildMetaContent({ irotAngle: 2 });
      const view = new DataView(buf);
      expect(parseISOBMFFOrientation(view, 0, buf.byteLength)).toBe(3);
    });

    it('AGM-054: returns 2 for imir axis=0 (flip H) without irot', () => {
      const buf = buildMetaContent({ imirAxis: 0 });
      const view = new DataView(buf);
      expect(parseISOBMFFOrientation(view, 0, buf.byteLength)).toBe(2);
    });

    it('AGM-055: returns 5 for imir axis=0 + irot angle=1 (flip H + 90 CCW)', () => {
      const buf = buildMetaContent({ irotAngle: 1, imirAxis: 0 });
      const view = new DataView(buf);
      expect(parseISOBMFFOrientation(view, 0, buf.byteLength)).toBe(5);
    });

    it('AGM-056: returns 4 for imir axis=1 (flip V) without irot', () => {
      const buf = buildMetaContent({ imirAxis: 1 });
      const view = new DataView(buf);
      expect(parseISOBMFFOrientation(view, 0, buf.byteLength)).toBe(4);
    });
  });

  // ===========================================================================
  // parseISOBMFFTransforms tests
  // ===========================================================================

  describe('parseISOBMFFTransforms', () => {
    it('AGM-060: returns empty {} when no irot/imir', () => {
      const buf = buildMetaContent({});
      const view = new DataView(buf);
      const result = parseISOBMFFTransforms(view, 0, buf.byteLength);
      expect(result.irotAngle).toBeUndefined();
      expect(result.imirAxis).toBeUndefined();
    });

    it('AGM-061: returns { irotAngle: 3 } for 90 CW rotation', () => {
      const buf = buildMetaContent({ irotAngle: 3 });
      const view = new DataView(buf);
      const result = parseISOBMFFTransforms(view, 0, buf.byteLength);
      expect(result.irotAngle).toBe(3);
      expect(result.imirAxis).toBeUndefined();
    });

    it('AGM-062: returns { imirAxis: 1 } for flip V only', () => {
      const buf = buildMetaContent({ imirAxis: 1 });
      const view = new DataView(buf);
      const result = parseISOBMFFTransforms(view, 0, buf.byteLength);
      expect(result.irotAngle).toBeUndefined();
      expect(result.imirAxis).toBe(1);
    });

    it('AGM-063: returns both irotAngle and imirAxis when combined', () => {
      const buf = buildMetaContent({ irotAngle: 2, imirAxis: 0 });
      const view = new DataView(buf);
      const result = parseISOBMFFTransforms(view, 0, buf.byteLength);
      expect(result.irotAngle).toBe(2);
      expect(result.imirAxis).toBe(0);
    });
  });
});
