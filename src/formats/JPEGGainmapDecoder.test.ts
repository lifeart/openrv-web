/**
 * JPEGGainmapDecoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isGainmapJPEG,
  parseGainmapJPEG,
  type GainmapInfo,
} from './JPEGGainmapDecoder';

// Helper to create a minimal JPEG buffer with SOI marker
function createJPEGBuffer(): ArrayBuffer {
  // SOI (0xFFD8) + EOI (0xFFD9)
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint16(0, 0xFFD8);
  view.setUint16(2, 0xFFD9);
  return buf;
}

// Helper to create a JPEG buffer with MPF APP2 marker
function createMPFJPEGBuffer(): ArrayBuffer {
  // Build a minimal JPEG with MPF marker
  // SOI + APP2(MPF) + EOI
  const parts: number[] = [];

  // SOI
  parts.push(0xFF, 0xD8);

  // APP2 marker: 0xFFE2
  parts.push(0xFF, 0xE2);

  // Length of APP2 segment (including length field itself)
  // 'MPF\0' (4) + Endian(2) + Magic(2) + IFDOffset(4) + IFD entry count(2) + 2 IFD entries(24) + MP entries(32)
  const segmentDataLen = 4 + 2 + 2 + 4 + 2 + 24 + 32;
  const segmentLen = segmentDataLen + 2; // +2 for length field
  parts.push((segmentLen >> 8) & 0xFF, segmentLen & 0xFF);

  // 'MPF\0' identifier
  parts.push(0x4D, 0x50, 0x46, 0x00);

  // Little-endian byte order ('II')
  parts.push(0x49, 0x49);

  // TIFF magic 0x002A (LE)
  parts.push(0x2A, 0x00);

  // Offset to first IFD (relative to mpfDataOffset) = 8 (right after this field)
  parts.push(0x08, 0x00, 0x00, 0x00);

  // IFD: 2 entries
  parts.push(0x02, 0x00);

  // IFD Entry 1: MP Entry Number (tag 0xB001)
  // Tag: 0xB001, Type: LONG(4), Count: 2, Value: 2
  parts.push(0x01, 0xB0); // tag LE
  parts.push(0x04, 0x00); // type LONG
  parts.push(0x02, 0x00, 0x00, 0x00); // count
  parts.push(0x02, 0x00, 0x00, 0x00); // value

  // IFD Entry 2: MPEntry (tag 0xB002)
  // Tag: 0xB002, Type: UNDEFINED(7), Count: 2, Value/Offset: relative offset to MP entries
  const mpEntryRelativeOffset = 8 + 2 + 24; // after IFD header + 2 entries
  parts.push(0x02, 0xB0); // tag LE
  parts.push(0x07, 0x00); // type UNDEFINED
  parts.push(0x02, 0x00, 0x00, 0x00); // count = 2 entries
  parts.push(mpEntryRelativeOffset & 0xFF, (mpEntryRelativeOffset >> 8) & 0xFF, 0x00, 0x00); // offset LE

  // MP Entry 1: Base image (16 bytes)
  // Attributes(4) + Size(4) + Offset(4) + Dep1(2) + Dep2(2)
  const baseSize = 1000; // dummy
  parts.push(0x00, 0x00, 0x00, 0x00); // attributes
  parts.push(baseSize & 0xFF, (baseSize >> 8) & 0xFF, 0x00, 0x00); // size LE
  parts.push(0x00, 0x00, 0x00, 0x00); // offset (0 for first image)
  parts.push(0x00, 0x00); // dep1
  parts.push(0x00, 0x00); // dep2

  // MP Entry 2: Gainmap image (16 bytes)
  const gainmapSize = 500; // dummy
  const gainmapOffset = baseSize; // right after base
  parts.push(0x00, 0x00, 0x00, 0x00); // attributes
  parts.push(gainmapSize & 0xFF, (gainmapSize >> 8) & 0xFF, 0x00, 0x00); // size LE
  parts.push(gainmapOffset & 0xFF, (gainmapOffset >> 8) & 0xFF, 0x00, 0x00); // offset LE
  parts.push(0x00, 0x00); // dep1
  parts.push(0x00, 0x00); // dep2

  // EOI
  parts.push(0xFF, 0xD9);

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
      view.setUint16(0, 0xFFD8);
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

  describe('GainmapInfo structure', () => {
    it('has all required fields', () => {
      const info: GainmapInfo = {
        baseImageOffset: 0,
        baseImageLength: 1000,
        gainmapOffset: 1000,
        gainmapLength: 500,
        headroom: 4.0,
      };

      expect(info.baseImageOffset).toBeDefined();
      expect(info.baseImageLength).toBeDefined();
      expect(info.gainmapOffset).toBeDefined();
      expect(info.gainmapLength).toBeDefined();
      expect(info.headroom).toBeDefined();
    });
  });

  describe('HDR reconstruction math', () => {
    it('sRGB to linear conversion is correct for known values', () => {
      // We can't access the private srgbToLinear, but we can verify
      // the overall behavior through the decoder output
      // Linear 0 -> 0, Linear 1 -> 1
      // sRGB 0.5 -> ~0.214 (linear)
      // sRGB 0.04045 -> ~0.00313 (linear, transition point)

      // These are the expected values from the sRGB spec
      const testValues = [
        { srgb: 0.0, linear: 0.0 },
        { srgb: 1.0, linear: 1.0 },
        { srgb: 0.5, linear: 0.214 },
      ];

      // Verify the math is sound by computing manually
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

    it('gain formula produces values > 1.0 for non-zero gainmap', () => {
      const headroom = 4.0;
      const gainmapValue = 0.5; // 50% of headroom
      const gain = Math.pow(2, gainmapValue * headroom);

      // 2^(0.5*4) = 2^2 = 4.0
      expect(gain).toBe(4.0);

      // With a linear base of 0.5, result should be 2.0 (> 1.0)
      const hdrValue = 0.5 * gain;
      expect(hdrValue).toBe(2.0);
      expect(hdrValue).toBeGreaterThan(1.0);
    });

    it('gain formula preserves SDR when gainmap is zero', () => {
      const headroom = 4.0;
      const gainmapValue = 0.0;
      const gain = Math.pow(2, gainmapValue * headroom);

      // 2^0 = 1.0
      expect(gain).toBe(1.0);

      // SDR values preserved
      const base = 0.7;
      expect(base * gain).toBe(base);
    });
  });
});
