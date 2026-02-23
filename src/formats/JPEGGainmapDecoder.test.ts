/**
 * JPEGGainmapDecoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isGainmapJPEG,
  parseGainmapJPEG,
  extractJPEGOrientation,
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

});

// ---------------------------------------------------------------------------
// Helper to build a minimal JPEG buffer with EXIF orientation tag
// ---------------------------------------------------------------------------
function buildJPEGWithOrientation(orientation: number, bigEndian = false): ArrayBuffer {
  const parts: number[] = [];

  // SOI
  parts.push(0xFF, 0xD8);

  // APP1 marker (0xFFE1)
  parts.push(0xFF, 0xE1);

  // We will compute the segment length after building content
  // Segment data: 'Exif\0\0' (6) + TIFF header (8) + IFD0 (2 + 12 = 14) = 28
  // Segment length field includes itself (2 bytes) => 28 + 2 = 30
  const segmentLength = 30;
  parts.push((segmentLength >> 8) & 0xFF, segmentLength & 0xFF);

  // 'Exif\0\0'
  parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);

  // TIFF header starts here (tiffStart)
  if (bigEndian) {
    // 'MM' big-endian
    parts.push(0x4D, 0x4D);
  } else {
    // 'II' little-endian
    parts.push(0x49, 0x49);
  }

  // TIFF magic 0x002A
  if (bigEndian) {
    parts.push(0x00, 0x2A);
  } else {
    parts.push(0x2A, 0x00);
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
    parts.push((orientation >> 8) & 0xFF, orientation & 0xFF, 0x00, 0x00);
  } else {
    // tag
    parts.push(0x12, 0x01);
    // type
    parts.push(0x03, 0x00);
    // count
    parts.push(0x01, 0x00, 0x00, 0x00);
    // value: orientation as uint16 LE + 2 pad bytes
    parts.push(orientation & 0xFF, (orientation >> 8) & 0xFF, 0x00, 0x00);
  }

  // EOI
  parts.push(0xFF, 0xD9);

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
      uint8[i] = (i * 37 + 13) & 0xFF; // arbitrary non-JPEG bytes
    }
    expect(extractJPEGOrientation(buf)).toBe(1);
  });

  it('JPEG-ORI-002: returns 1 for JPEG without EXIF APP1', () => {
    // SOI (0xFFD8) + SOS marker (0xFFDA) + some bytes
    const parts: number[] = [0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x04, 0x00, 0x00];
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
    parts.push(0xFF, 0xD8);

    // APP1 marker
    parts.push(0xFF, 0xE1);

    // Segment length = 30 (same structure, just different tag)
    const segmentLength = 30;
    parts.push((segmentLength >> 8) & 0xFF, segmentLength & 0xFF);

    // 'Exif\0\0'
    parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);

    // TIFF header: 'II' little-endian
    parts.push(0x49, 0x49);

    // TIFF magic 0x002A (LE)
    parts.push(0x2A, 0x00);

    // IFD0 offset = 8
    parts.push(0x08, 0x00, 0x00, 0x00);

    // IFD0: entry count = 1
    parts.push(0x01, 0x00);

    // IFD Entry: tag=0x010F (Make), type=2 (ASCII), count=1, value=0
    parts.push(0x0F, 0x01); // tag LE
    parts.push(0x02, 0x00); // type ASCII
    parts.push(0x01, 0x00, 0x00, 0x00); // count
    parts.push(0x00, 0x00, 0x00, 0x00); // value

    // EOI
    parts.push(0xFF, 0xD9);

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
    parts.push(0xFF, 0xD8);

    // APP1 marker
    parts.push(0xFF, 0xE1);

    // Segment length: only enough for 'Exif\0\0' + 2 bytes (truncated TIFF header)
    // length field = 2 (self) + 6 (Exif\0\0) + 2 (partial) = 10
    const segmentLength = 10;
    parts.push((segmentLength >> 8) & 0xFF, segmentLength & 0xFF);

    // 'Exif\0\0'
    parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00);

    // Partial TIFF header (only byte order, no magic or IFD offset)
    parts.push(0x49, 0x49);

    // EOI
    parts.push(0xFF, 0xD9);

    const buf = new ArrayBuffer(parts.length);
    const uint8 = new Uint8Array(buf);
    for (let i = 0; i < parts.length; i++) {
      uint8[i] = parts[i]!;
    }
    expect(extractJPEGOrientation(buf)).toBe(1);
  });
});
