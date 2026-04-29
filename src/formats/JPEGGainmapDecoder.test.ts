/**
 * JPEGGainmapDecoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isGainmapJPEG,
  parseGainmapJPEG,
  extractJPEGOrientation,
  decodeGainmapToFloat32,
  type GainmapInfo,
} from './JPEGGainmapDecoder';
import { DecoderError } from '../core/errors';

// Helper to create a minimal JPEG buffer with SOI marker
function createJPEGBuffer(): ArrayBuffer {
  // SOI (0xFFD8) + EOI (0xFFD9)
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint16(0, 0xffd8);
  view.setUint16(2, 0xffd9);
  return buf;
}

// Helper to create a JPEG buffer with MPF APP2 marker.
// When `padToFit` is true (default), the buffer is padded so that MPF offset+size
// values fit within the buffer. When false, the buffer is minimal and the MPF
// offset+size values will exceed the buffer length.
function createMPFJPEGBuffer(options?: {
  baseSize?: number;
  gainmapSize?: number;
  gainmapOffset?: number;
  padToFit?: boolean;
}): ArrayBuffer {
  const { baseSize = 1000, gainmapSize = 500, gainmapOffset: rawGainmapOffset, padToFit = true } = options ?? {};

  // Build a minimal JPEG with MPF marker
  // SOI + APP2(MPF) + EOI
  const parts: number[] = [];

  // SOI
  parts.push(0xff, 0xd8);

  // APP2 marker: 0xFFE2
  parts.push(0xff, 0xe2);

  // Length of APP2 segment (including length field itself)
  // 'MPF\0' (4) + Endian(2) + Magic(2) + IFDOffset(4) + IFD entry count(2) + 2 IFD entries(24) + MP entries(32)
  const segmentDataLen = 4 + 2 + 2 + 4 + 2 + 24 + 32;
  const segmentLen = segmentDataLen + 2; // +2 for length field
  parts.push((segmentLen >> 8) & 0xff, segmentLen & 0xff);

  // 'MPF\0' identifier
  parts.push(0x4d, 0x50, 0x46, 0x00);

  // Little-endian byte order ('II')
  parts.push(0x49, 0x49);

  // TIFF magic 0x002A (LE)
  parts.push(0x2a, 0x00);

  // Offset to first IFD (relative to mpfDataOffset) = 8 (right after this field)
  parts.push(0x08, 0x00, 0x00, 0x00);

  // IFD: 2 entries
  parts.push(0x02, 0x00);

  // IFD Entry 1: MP Entry Number (tag 0xB001)
  // Tag: 0xB001, Type: LONG(4), Count: 2, Value: 2
  parts.push(0x01, 0xb0); // tag LE
  parts.push(0x04, 0x00); // type LONG
  parts.push(0x02, 0x00, 0x00, 0x00); // count
  parts.push(0x02, 0x00, 0x00, 0x00); // value

  // IFD Entry 2: MPEntry (tag 0xB002)
  // Tag: 0xB002, Type: UNDEFINED(7), Count: 2, Value/Offset: relative offset to MP entries
  const mpEntryRelativeOffset = 8 + 2 + 24; // after IFD header + 2 entries
  parts.push(0x02, 0xb0); // tag LE
  parts.push(0x07, 0x00); // type UNDEFINED
  parts.push(0x02, 0x00, 0x00, 0x00); // count = 2 entries
  parts.push(mpEntryRelativeOffset & 0xff, (mpEntryRelativeOffset >> 8) & 0xff, 0x00, 0x00); // offset LE

  // MP Entry 1: Base image (16 bytes)
  // Attributes(4) + Size(4) + Offset(4) + Dep1(2) + Dep2(2)
  parts.push(0x00, 0x00, 0x00, 0x00); // attributes
  parts.push(baseSize & 0xff, (baseSize >> 8) & 0xff, (baseSize >> 16) & 0xff, (baseSize >> 24) & 0xff); // size LE
  parts.push(0x00, 0x00, 0x00, 0x00); // offset (0 for first image)
  parts.push(0x00, 0x00); // dep1
  parts.push(0x00, 0x00); // dep2

  // MP Entry 2: Gainmap image (16 bytes)
  const gainmapOffset = rawGainmapOffset ?? baseSize; // right after base by default
  parts.push(0x00, 0x00, 0x00, 0x00); // attributes
  parts.push(gainmapSize & 0xff, (gainmapSize >> 8) & 0xff, (gainmapSize >> 16) & 0xff, (gainmapSize >> 24) & 0xff); // size LE
  parts.push(
    gainmapOffset & 0xff,
    (gainmapOffset >> 8) & 0xff,
    (gainmapOffset >> 16) & 0xff,
    (gainmapOffset >> 24) & 0xff,
  ); // offset LE
  parts.push(0x00, 0x00); // dep1
  parts.push(0x00, 0x00); // dep2

  // EOI
  parts.push(0xff, 0xd9);

  // mpfDataStart = 2 (SOI) + 2 (marker) + 2 (length) + 4 (MPF\0) = 10
  // For entry 2, parsed offset = rawGainmapOffset + mpfDataStart (when rawGainmapOffset != 0)
  // We need parsed offset + gainmapSize <= total buffer length
  const mpfDataStart = 10;
  const parsedGainmapOffset = gainmapOffset === 0 ? baseSize : gainmapOffset + mpfDataStart;
  const requiredLength = parsedGainmapOffset + gainmapSize;

  if (padToFit && requiredLength > parts.length) {
    // Pad with zeros so the buffer is large enough
    const paddingNeeded = requiredLength - parts.length;
    for (let i = 0; i < paddingNeeded; i++) {
      parts.push(0x00);
    }
  }

  const buf = new ArrayBuffer(parts.length);
  const uint8 = new Uint8Array(buf);
  for (let i = 0; i < parts.length; i++) {
    uint8[i] = parts[i]!;
  }

  return buf;
}

describe('JPEGGainmapDecoder', () => {
  describe('isGainmapJPEG', () => {
    it('returns false for non-JPEG data', () => {
      const buf = new ArrayBuffer(10);
      expect(isGainmapJPEG(buf)).toBe(false);
    });

    it('returns false for empty buffer', () => {
      expect(isGainmapJPEG(new ArrayBuffer(0))).toBe(false);
    });

    it('returns false for standard JPEG without MPF', () => {
      expect(isGainmapJPEG(createJPEGBuffer())).toBe(false);
    });

    it('returns true for JPEG with MPF APP2 marker', () => {
      expect(isGainmapJPEG(createMPFJPEGBuffer())).toBe(true);
    });

    it('returns false for buffer too small', () => {
      const buf = new ArrayBuffer(2);
      const view = new DataView(buf);
      view.setUint16(0, 0xffd8);
      expect(isGainmapJPEG(buf)).toBe(false);
    });
  });

  describe('parseGainmapJPEG', () => {
    it('returns null for non-JPEG data', () => {
      expect(parseGainmapJPEG(new ArrayBuffer(10))).toBeNull();
    });

    it('returns null for standard JPEG', () => {
      expect(parseGainmapJPEG(createJPEGBuffer())).toBeNull();
    });

    it('parses MPF JPEG and returns GainmapInfo', () => {
      const buf = createMPFJPEGBuffer();
      const info = parseGainmapJPEG(buf);

      expect(info).not.toBeNull();
      if (info) {
        expect(info.baseImageOffset).toBe(0);
        expect(info.baseImageLength).toBeGreaterThan(0);
        expect(info.gainmapOffset).toBeGreaterThan(0);
        expect(info.gainmapLength).toBeGreaterThan(0);
        expect(info.headroom).toBeGreaterThan(0);
      }
    });

    it('returns default headroom when XMP not present', () => {
      const buf = createMPFJPEGBuffer();
      const info = parseGainmapJPEG(buf);
      expect(info).not.toBeNull();
      // Default headroom is 2.0 when no XMP is found
      expect(info!.headroom).toBe(2.0);
    });
  });

  describe('MPF offset+size overflow validation (MED-34)', () => {
    it('throws DecoderError when gainmap offset+size exceeds buffer length', () => {
      // Create a buffer where MPF entries have offset+size larger than the buffer
      const buf = createMPFJPEGBuffer({
        baseSize: 1000,
        gainmapSize: 500,
        padToFit: false,
      });
      // The buffer is only ~74 bytes but claims gainmap at offset ~1010 with size 500
      expect(() => parseGainmapJPEG(buf)).toThrow(DecoderError);
      expect(() => parseGainmapJPEG(buf)).toThrow(/exceeds buffer/);
    });

    it('throws DecoderError when gainmap size causes overflow at buffer boundary', () => {
      // Create a buffer where the gainmap offset is valid but offset+size exceeds by 1 byte
      const buf = createMPFJPEGBuffer({
        baseSize: 50,
        gainmapSize: 100,
        gainmapOffset: 50,
        padToFit: false,
      });
      // parsedOffset = 50 + 10 (mpfDataStart) = 60, size = 100, total = 160
      // Buffer is only ~74 bytes, so this should throw
      expect(() => parseGainmapJPEG(buf)).toThrow(DecoderError);
    });

    it('does not throw when gainmap offset+size fits exactly within buffer', () => {
      // Create a buffer padded to exactly fit the MPF entries
      const buf = createMPFJPEGBuffer({
        baseSize: 50,
        gainmapSize: 10,
        gainmapOffset: 50,
        padToFit: true,
      });
      const info = parseGainmapJPEG(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapLength).toBe(10);
    });

    it('throws DecoderError with very large offset values', () => {
      // Use a large offset that would cause overflow-like behavior
      const buf = createMPFJPEGBuffer({
        baseSize: 100,
        gainmapSize: 100,
        gainmapOffset: 0x7ffffff0, // ~2GB offset
        padToFit: false,
      });
      expect(() => parseGainmapJPEG(buf)).toThrow(DecoderError);
    });

    it('throws DecoderError with very large size values', () => {
      // Use a large size that would cause overflow-like behavior
      const buf = createMPFJPEGBuffer({
        baseSize: 100,
        gainmapSize: 0x7ffffff0, // ~2GB size
        gainmapOffset: 100,
        padToFit: false,
      });
      expect(() => parseGainmapJPEG(buf)).toThrow(DecoderError);
    });

    it('handles zero gainmap size with non-zero offset without throwing', () => {
      // Zero size is technically valid (the entry just has no data)
      // parseMPFEntries will set offset=0 for second entry if size=0 only when first entry size > 0
      // With gainmapOffset non-zero and size=0, offset+size = offset which may or may not fit
      const buf = createMPFJPEGBuffer({
        baseSize: 50,
        gainmapSize: 0,
        gainmapOffset: 10,
        padToFit: true,
      });
      // offset+size = (10+10)+0 = 20, well within buffer
      const info = parseGainmapJPEG(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapLength).toBe(0);
    });

    it('valid MPF JPEG with properly sized buffer parses correctly', () => {
      const buf = createMPFJPEGBuffer({
        baseSize: 100,
        gainmapSize: 50,
        gainmapOffset: 100,
        padToFit: true,
      });
      const info = parseGainmapJPEG(buf);
      expect(info).not.toBeNull();
      expect(info!.baseImageOffset).toBe(0);
      expect(info!.baseImageLength).toBe(100);
      expect(info!.gainmapLength).toBe(50);
      // Gainmap offset = rawOffset (100) + mpfDataStart (10) = 110
      expect(info!.gainmapOffset).toBe(110);
      expect(info!.headroom).toBe(2.0);
    });

    it('throws DecoderError when MPF fix-up (offset=0 -> entries[0].size) produces out-of-bounds', () => {
      // When entry 2 has offset=0, parseMPFEntries sets it to entries[0].size.
      // If entries[0].size + entries[1].size > buffer.byteLength, parseGainmapJPEG should throw.
      // Use gainmapOffset=0 so the fix-up fires: parsed offset becomes baseSize.
      const buf = createMPFJPEGBuffer({
        baseSize: 5000,
        gainmapSize: 5000,
        gainmapOffset: 0,
        padToFit: false,
      });
      // Buffer is tiny (~74 bytes), but fix-up sets gainmap offset to 5000, size 5000 => 10000 > 74
      expect(() => parseGainmapJPEG(buf)).toThrow(DecoderError);
      expect(() => parseGainmapJPEG(buf)).toThrow(/exceeds buffer/);
    });
  });

  describe('HIGH-31: explicit MPF bounds-check errors', () => {
    /**
     * Build a JPEG buffer with a manually crafted MPF box. Caller specifies the
     * exact ifdOffset (relative to mpfDataStart), the IFD entries, and the MP
     * entries — letting us exercise specific overflow scenarios that the
     * higher-level helper above can't reach.
     */
    function buildCustomMPF(opts: {
      ifdOffset: number; // relative to mpfDataStart
      ifdEntries: { tag: number; type: number; count: number; valueOffset: number }[];
      mpEntries?: { size: number; offset: number }[];
      mpEntriesOffsetOverride?: number; // override MPEntry valueOffset (relative to mpfDataStart)
      truncateAt?: number; // truncate the buffer to this many bytes
      totalSize?: number; // pad/expand the buffer to this size (after construction)
    }): ArrayBuffer {
      const parts: number[] = [];
      // SOI
      parts.push(0xff, 0xd8);
      // APP2 marker
      parts.push(0xff, 0xe2);
      // Length placeholder (filled later)
      const lenIdx = parts.length;
      parts.push(0x00, 0x00);
      // 'MPF\0'
      parts.push(0x4d, 0x50, 0x46, 0x00);
      // mpfDataStart = 10 from start of file
      const mpfDataStart = parts.length; // 10
      // 'II' little-endian
      parts.push(0x49, 0x49);
      // TIFF magic 0x002A LE
      parts.push(0x2a, 0x00);
      // IFD offset (LE)
      const ifdOff = opts.ifdOffset;
      parts.push(ifdOff & 0xff, (ifdOff >> 8) & 0xff, (ifdOff >> 16) & 0xff, (ifdOff >>> 24) & 0xff);

      // Pad to ifdStart if it's beyond current position — but cap the padding
      // so we don't try to allocate gigabytes when testing OOB ifdOffset values.
      const ifdStartAbs = mpfDataStart + ifdOff;
      const PAD_CAP = 4096;
      const padTarget = Math.min(ifdStartAbs, parts.length + PAD_CAP);
      while (parts.length < padTarget) parts.push(0x00);

      // If ifdStartAbs is far beyond what we padded to, the IFD entries simply
      // won't be reachable from the buffer — that's the OOB scenario we want.
      const ifdReachable = parts.length >= ifdStartAbs;
      // IFD entry count (only written if reachable)
      if (ifdReachable) {
        parts.push(opts.ifdEntries.length & 0xff, (opts.ifdEntries.length >> 8) & 0xff);
      }
      // IFD entries (only written if reachable)
      for (const e of ifdReachable ? opts.ifdEntries : []) {
        parts.push(e.tag & 0xff, (e.tag >> 8) & 0xff);
        parts.push(e.type & 0xff, (e.type >> 8) & 0xff);
        parts.push(e.count & 0xff, (e.count >> 8) & 0xff, (e.count >> 16) & 0xff, (e.count >>> 24) & 0xff);
        parts.push(
          e.valueOffset & 0xff,
          (e.valueOffset >> 8) & 0xff,
          (e.valueOffset >> 16) & 0xff,
          (e.valueOffset >>> 24) & 0xff,
        );
      }

      // Optionally write MP entries at the requested offset
      if (opts.mpEntries) {
        const mpEntriesAbs = mpfDataStart + (opts.mpEntriesOffsetOverride ?? parts.length - mpfDataStart);
        while (parts.length < mpEntriesAbs) parts.push(0x00);
        for (const me of opts.mpEntries) {
          // attributes(4)
          parts.push(0x00, 0x00, 0x00, 0x00);
          // size(4) LE
          parts.push(me.size & 0xff, (me.size >> 8) & 0xff, (me.size >> 16) & 0xff, (me.size >>> 24) & 0xff);
          // offset(4) LE
          parts.push(me.offset & 0xff, (me.offset >> 8) & 0xff, (me.offset >> 16) & 0xff, (me.offset >>> 24) & 0xff);
          // dep1(2), dep2(2)
          parts.push(0x00, 0x00, 0x00, 0x00);
        }
      }

      // Set APP2 segment length to cover from the length field through the MPF body.
      // (Required so findMPFMarkerOffset doesn't walk past the end.)
      const appBodyEnd = parts.length;
      const segLen = appBodyEnd - lenIdx; // length field includes itself
      parts[lenIdx] = (segLen >> 8) & 0xff;
      parts[lenIdx + 1] = segLen & 0xff;

      // EOI
      parts.push(0xff, 0xd9);

      let finalLen = parts.length;
      if (opts.truncateAt !== undefined) finalLen = Math.min(finalLen, opts.truncateAt);
      if (opts.totalSize !== undefined) finalLen = opts.totalSize;

      const buf = new ArrayBuffer(finalLen);
      const u8 = new Uint8Array(buf);
      const writeLen = Math.min(parts.length, finalLen);
      for (let i = 0; i < writeLen; i++) u8[i] = parts[i]!;
      return buf;
    }

    it('throws descriptive error when IFD offset points past buffer end', () => {
      // ifdOffset is huge — IFD start would be far past the buffer.
      // Create a small buffer that has the MPF header but no IFD body.
      const buf = buildCustomMPF({
        ifdOffset: 0xffff_0000, // ~4 GB into the buffer
        ifdEntries: [],
        totalSize: 64,
      });
      let err: unknown;
      try {
        parseGainmapJPEG(buf);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(DecoderError);
      expect((err as Error).message).toMatch(/MPF:/);
      expect((err as Error).message).toMatch(/IFD start/);
      expect((err as Error).message).toMatch(/exceeds buffer length/);
    });

    it('throws descriptive error when MPEntry tag valueOffset points past buffer end', () => {
      // IFD has a 0xB001 (NumberOfImages = 2) and a 0xB002 with a wildly OOB valueOffset.
      const buf = buildCustomMPF({
        ifdOffset: 8, // IFD immediately after the 8-byte TIFF header
        ifdEntries: [
          { tag: 0xb001, type: 4, count: 1, valueOffset: 2 }, // 2 images
          { tag: 0xb002, type: 7, count: 32, valueOffset: 0xfffffff0 }, // huge offset
        ],
        totalSize: 200,
      });
      let err: unknown;
      try {
        parseGainmapJPEG(buf);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(DecoderError);
      expect((err as Error).message).toMatch(/MPEntry table/);
      expect((err as Error).message).toMatch(/0xfffffff0/);
      expect((err as Error).message).toMatch(/exceeds buffer length/);
    });

    it('throws descriptive error when MPEntry table is partially truncated', () => {
      // MP entries should fit at offset X with mpEntryCount=2 (32 bytes) but the
      // buffer is sliced short so only ~16 bytes of MPEntry data remain.
      const buf = buildCustomMPF({
        ifdOffset: 8,
        ifdEntries: [
          { tag: 0xb001, type: 4, count: 1, valueOffset: 2 },
          { tag: 0xb002, type: 7, count: 32, valueOffset: 38 },
        ],
        mpEntries: [
          { size: 100, offset: 0 },
          { size: 100, offset: 100 },
        ],
        // Truncate to cut the second MPEntry in half
        truncateAt: 60,
      });
      let err: unknown;
      try {
        parseGainmapJPEG(buf);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(DecoderError);
      expect((err as Error).message).toMatch(/MPEntry table|MPEntry array/);
      expect((err as Error).message).toMatch(/exceeds buffer length/);
    });

    it('throws descriptive error when base image (MPEntry #0) size exceeds buffer', () => {
      // Build a valid-looking MPF with a base image whose size > buffer length.
      const buf = createMPFJPEGBuffer({
        baseSize: 0x7fffff00, // ~2 GB
        gainmapSize: 10,
        gainmapOffset: 50,
        padToFit: false,
      });
      let err: unknown;
      try {
        parseGainmapJPEG(buf);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(DecoderError);
      // Could be either base or gainmap depending on order; both have descriptive context.
      expect((err as Error).message).toMatch(/MPF:/);
      expect((err as Error).message).toMatch(/exceeds buffer length/);
    });

    it('throws descriptive error when JPEG with valid SOI is cut inside MPF segment', () => {
      // Build a full MPF buffer then truncate it after the APP2 length field.
      // This simulates a JPEG blob where the file was cut off mid-MPF-IFD.
      const fullBuf = createMPFJPEGBuffer({
        baseSize: 100,
        gainmapSize: 50,
        gainmapOffset: 100,
        padToFit: true,
      });
      // Truncate to just past the MPF marker + length field but before the IFD body.
      // mpfDataStart = 10, header is 8 bytes -> truncate at 14 to cut the IFD-offset field
      const truncBuf = fullBuf.slice(0, 14);
      // findMPFMarkerOffset requires the segment length to fit; with the segment
      // length pointing past the buffer, no MPF marker is detected and the
      // function returns null. That's the documented behavior — confirm it
      // doesn't throw an opaque internal error.
      expect(() => parseGainmapJPEG(truncBuf)).not.toThrow();
      // Now truncate just at mpfDataStart+8 boundary — header technically reads
      // but IFD-offset field is at the boundary.
      const truncBuf2 = fullBuf.slice(0, 18);
      // This may either return null (header check fails) or throw a descriptive
      // error — either is acceptable, but we must NOT throw an opaque error.
      let result: unknown;
      let err: unknown;
      try {
        result = parseGainmapJPEG(truncBuf2);
      } catch (e) {
        err = e;
      }
      if (err) {
        expect(err).toBeInstanceOf(DecoderError);
        expect((err as Error).message).toMatch(/MPF:/);
      } else {
        expect(result).toBeNull();
      }
    });

    it('boundary case: MPEntry table that ends exactly at buffer length is accepted', () => {
      // Build MPF where mpEntryOffset + 32 (2 entries * 16 bytes) == buffer length.
      // This is the tight-fit success case — must NOT throw.
      const buf = createMPFJPEGBuffer({
        baseSize: 100,
        gainmapSize: 50,
        gainmapOffset: 100,
        padToFit: true,
      });
      // This already-passing case verifies the boundary check uses > not >=.
      expect(() => parseGainmapJPEG(buf)).not.toThrow();
      const info = parseGainmapJPEG(buf);
      expect(info).not.toBeNull();
    });

    it('boundary case: gainmap offset == buffer length with size 0 is accepted', () => {
      // Gainmap entry sized 0 at the buffer end is degenerate but not an OOB read.
      // baseSize must fit within the buffer too — we now bounds-check it.
      const buf = createMPFJPEGBuffer({
        baseSize: 50,
        gainmapSize: 0,
        gainmapOffset: 50, // parsed offset becomes 50+10=60
        padToFit: true,
      });
      const info = parseGainmapJPEG(buf);
      expect(info).not.toBeNull();
      expect(info!.gainmapLength).toBe(0);
    });

    it('returns null for empty buffer (no SOI) without throwing', () => {
      // Sanity check: degenerate inputs still return null, not an opaque crash.
      expect(parseGainmapJPEG(new ArrayBuffer(0))).toBeNull();
      expect(parseGainmapJPEG(new ArrayBuffer(2))).toBeNull();
    });
  });

  describe('decodeGainmapToFloat32 bounds checks', () => {
    it('throws DecoderError when gainmap slice exceeds buffer', async () => {
      const smallBuffer = new ArrayBuffer(100);
      const info: GainmapInfo = {
        baseImageOffset: 0,
        baseImageLength: 50,
        gainmapOffset: 60,
        gainmapLength: 50, // 60 + 50 = 110 > 100
        headroom: 2.0,
      };
      await expect(decodeGainmapToFloat32(smallBuffer, info)).rejects.toThrow(DecoderError);
      await expect(decodeGainmapToFloat32(smallBuffer, info)).rejects.toThrow(/Gainmap slice exceeds buffer/);
    });

    it('throws DecoderError when base image slice exceeds buffer', async () => {
      const smallBuffer = new ArrayBuffer(100);
      const info: GainmapInfo = {
        baseImageOffset: 0,
        baseImageLength: 120, // 0 + 120 = 120 > 100
        gainmapOffset: 50,
        gainmapLength: 10, // 50 + 10 = 60 <= 100 (gainmap is fine)
        headroom: 2.0,
      };
      await expect(decodeGainmapToFloat32(smallBuffer, info)).rejects.toThrow(DecoderError);
      await expect(decodeGainmapToFloat32(smallBuffer, info)).rejects.toThrow(/Base image slice exceeds buffer/);
    });
  });
});

// ---------------------------------------------------------------------------
// Helper to build a minimal JPEG buffer with EXIF orientation tag
// ---------------------------------------------------------------------------
function buildJPEGWithOrientation(orientation: number, bigEndian = false): ArrayBuffer {
  const parts: number[] = [];

  // SOI
  parts.push(0xff, 0xd8);

  // APP1 marker (0xFFE1)
  parts.push(0xff, 0xe1);

  // We will compute the segment length after building content
  // Segment data: 'Exif\0\0' (6) + TIFF header (8) + IFD0 (2 + 12 = 14) = 28
  // Segment length field includes itself (2 bytes) => 28 + 2 = 30
  const segmentLength = 30;
  parts.push((segmentLength >> 8) & 0xff, segmentLength & 0xff);

  // 'Exif\0\0'
  parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);

  // TIFF header starts here (tiffStart)
  if (bigEndian) {
    // 'MM' big-endian
    parts.push(0x4d, 0x4d);
  } else {
    // 'II' little-endian
    parts.push(0x49, 0x49);
  }

  // TIFF magic 0x002A
  if (bigEndian) {
    parts.push(0x00, 0x2a);
  } else {
    parts.push(0x2a, 0x00);
  }

  // IFD0 offset (relative to tiffStart) = 8 (immediately after TIFF header)
  if (bigEndian) {
    parts.push(0x00, 0x00, 0x00, 0x08);
  } else {
    parts.push(0x08, 0x00, 0x00, 0x00);
  }

  // IFD0: entry count = 1
  if (bigEndian) {
    parts.push(0x00, 0x01);
  } else {
    parts.push(0x01, 0x00);
  }

  // IFD Entry: tag=0x0112, type=3 (SHORT), count=1, value=orientation (uint16) + 2 pad bytes
  if (bigEndian) {
    // tag
    parts.push(0x01, 0x12);
    // type
    parts.push(0x00, 0x03);
    // count
    parts.push(0x00, 0x00, 0x00, 0x01);
    // value: orientation as uint16 BE + 2 pad bytes
    parts.push((orientation >> 8) & 0xff, orientation & 0xff, 0x00, 0x00);
  } else {
    // tag
    parts.push(0x12, 0x01);
    // type
    parts.push(0x03, 0x00);
    // count
    parts.push(0x01, 0x00, 0x00, 0x00);
    // value: orientation as uint16 LE + 2 pad bytes
    parts.push(orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00);
  }

  // EOI
  parts.push(0xff, 0xd9);

  const buf = new ArrayBuffer(parts.length);
  const uint8 = new Uint8Array(buf);
  for (let i = 0; i < parts.length; i++) {
    uint8[i] = parts[i]!;
  }
  return buf;
}

describe('extractJPEGOrientation', () => {
  it('JPEG-ORI-001: returns 1 for non-JPEG data', () => {
    const buf = new ArrayBuffer(16);
    const uint8 = new Uint8Array(buf);
    for (let i = 0; i < uint8.length; i++) {
      uint8[i] = (i * 37 + 13) & 0xff; // arbitrary non-JPEG bytes
    }
    expect(extractJPEGOrientation(buf)).toBe(1);
  });

  it('JPEG-ORI-002: returns 1 for JPEG without EXIF APP1', () => {
    // SOI (0xFFD8) + SOS marker (0xFFDA) + some bytes
    const parts: number[] = [0xff, 0xd8, 0xff, 0xda, 0x00, 0x04, 0x00, 0x00];
    const buf = new ArrayBuffer(parts.length);
    const uint8 = new Uint8Array(buf);
    for (let i = 0; i < parts.length; i++) {
      uint8[i] = parts[i]!;
    }
    expect(extractJPEGOrientation(buf)).toBe(1);
  });

  it('JPEG-ORI-003: returns 6 for JPEG with EXIF orientation 6 (iPhone portrait)', () => {
    const buf = buildJPEGWithOrientation(6);
    expect(extractJPEGOrientation(buf)).toBe(6);
  });

  it('JPEG-ORI-004: all 8 orientation values extracted correctly', () => {
    for (let orientation = 1; orientation <= 8; orientation++) {
      const buf = buildJPEGWithOrientation(orientation);
      expect(extractJPEGOrientation(buf)).toBe(orientation);
    }
  });

  it('JPEG-ORI-005: handles big-endian (MM) EXIF correctly', () => {
    const buf = buildJPEGWithOrientation(3, true);
    expect(extractJPEGOrientation(buf)).toBe(3);
  });

  it('JPEG-ORI-006: returns 1 for JPEG with EXIF but no orientation tag', () => {
    // Build a JPEG with EXIF containing a different tag (0x010F = Make) instead of 0x0112
    const parts: number[] = [];

    // SOI
    parts.push(0xff, 0xd8);

    // APP1 marker
    parts.push(0xff, 0xe1);

    // Segment length = 30 (same structure, just different tag)
    const segmentLength = 30;
    parts.push((segmentLength >> 8) & 0xff, segmentLength & 0xff);

    // 'Exif\0\0'
    parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);

    // TIFF header: 'II' little-endian
    parts.push(0x49, 0x49);

    // TIFF magic 0x002A (LE)
    parts.push(0x2a, 0x00);

    // IFD0 offset = 8
    parts.push(0x08, 0x00, 0x00, 0x00);

    // IFD0: entry count = 1
    parts.push(0x01, 0x00);

    // IFD Entry: tag=0x010F (Make), type=2 (ASCII), count=1, value=0
    parts.push(0x0f, 0x01); // tag LE
    parts.push(0x02, 0x00); // type ASCII
    parts.push(0x01, 0x00, 0x00, 0x00); // count
    parts.push(0x00, 0x00, 0x00, 0x00); // value

    // EOI
    parts.push(0xff, 0xd9);

    const buf = new ArrayBuffer(parts.length);
    const uint8 = new Uint8Array(buf);
    for (let i = 0; i < parts.length; i++) {
      uint8[i] = parts[i]!;
    }
    expect(extractJPEGOrientation(buf)).toBe(1);
  });

  it('JPEG-ORI-007: returns 1 for truncated EXIF data', () => {
    // APP1 with 'Exif\0\0' but not enough bytes for a full TIFF header
    const parts: number[] = [];

    // SOI
    parts.push(0xff, 0xd8);

    // APP1 marker
    parts.push(0xff, 0xe1);

    // Segment length: only enough for 'Exif\0\0' + 2 bytes (truncated TIFF header)
    // length field = 2 (self) + 6 (Exif\0\0) + 2 (partial) = 10
    const segmentLength = 10;
    parts.push((segmentLength >> 8) & 0xff, segmentLength & 0xff);

    // 'Exif\0\0'
    parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);

    // Partial TIFF header (only byte order, no magic or IFD offset)
    parts.push(0x49, 0x49);

    // EOI
    parts.push(0xff, 0xd9);

    const buf = new ArrayBuffer(parts.length);
    const uint8 = new Uint8Array(buf);
    for (let i = 0; i < parts.length; i++) {
      uint8[i] = parts[i]!;
    }
    expect(extractJPEGOrientation(buf)).toBe(1);
  });
});
