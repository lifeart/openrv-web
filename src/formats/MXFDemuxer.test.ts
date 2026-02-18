/**
 * Tests for MXF Demuxer
 *
 * Builds MXF-like binary data programmatically to test detection,
 * KLV parsing, partition parsing, metadata extraction, essence
 * descriptor parsing, full demux, and error handling.
 */

import { describe, it, expect } from 'vitest';
import {
  isMXFFile,
  parseKLV,
  matchUL,
  parsePartitionPack,
  parseMXFHeader,
  demuxMXF,
  framesToTimecode,
  framesToTimecodeDF,
} from './MXFDemuxer';

// ---------------------------------------------------------------------------
// Test helpers: build binary buffers programmatically
// ---------------------------------------------------------------------------

/**
 * Create a DataView-backed buffer from an array of byte values.
 */
function bytesToBuffer(bytes: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    u8[i] = bytes[i]!;
  }
  return buf;
}

/**
 * Write a 16-byte SMPTE UL key into a byte array at the given position.
 */
function writeUL(arr: number[], offset: number, ul: readonly number[]): void {
  for (let i = 0; i < 16; i++) {
    arr[offset + i] = ul[i] ?? 0;
  }
}

/**
 * Write a BER short-form length byte.
 */
function writeBERShort(arr: number[], offset: number, length: number): number {
  arr[offset] = length;
  return 1;
}

/**
 * Write a BER long-form length (1-byte variant: 0x81 + 1 byte).
 */
function writeBERLong1(arr: number[], offset: number, length: number): number {
  arr[offset] = 0x81;
  arr[offset + 1] = length & 0xff;
  return 2;
}

/**
 * Write a BER long-form length (2-byte variant: 0x82 + 2 bytes big-endian).
 */
function writeBERLong2(arr: number[], offset: number, length: number): number {
  arr[offset] = 0x82;
  arr[offset + 1] = (length >> 8) & 0xff;
  arr[offset + 2] = length & 0xff;
  return 3;
}

/**
 * Write a 32-bit big-endian integer.
 */
function writeUint32BE(arr: number[], offset: number, value: number): void {
  arr[offset] = (value >>> 24) & 0xff;
  arr[offset + 1] = (value >>> 16) & 0xff;
  arr[offset + 2] = (value >>> 8) & 0xff;
  arr[offset + 3] = value & 0xff;
}

/**
 * Write a 64-bit big-endian integer (as two 32-bit parts).
 */
function writeUint64BE(arr: number[], offset: number, value: number): void {
  const hi = Math.floor(value / 0x100000000);
  const lo = value >>> 0;
  writeUint32BE(arr, offset, hi);
  writeUint32BE(arr, offset + 4, lo);
}

/**
 * Write a 16-bit big-endian integer.
 */
function writeUint16BE(arr: number[], offset: number, value: number): void {
  arr[offset] = (value >> 8) & 0xff;
  arr[offset + 1] = value & 0xff;
}

// Well-known UL constants
const SMPTE_UL_PREFIX = [0x06, 0x0e, 0x2b, 0x34];

const HEADER_PARTITION_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01,
  0x0d, 0x01, 0x02, 0x01, 0x01, 0x02, 0x01, 0x00,
];

const BODY_PARTITION_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01,
  0x0d, 0x01, 0x02, 0x01, 0x01, 0x03, 0x01, 0x00,
];

const FOOTER_PARTITION_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01,
  0x0d, 0x01, 0x02, 0x01, 0x01, 0x04, 0x01, 0x00,
];

const ESSENCE_ELEMENT_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x01, 0x02, 0x01, 0x01,
  0x0d, 0x01, 0x03, 0x01, 0x15, 0x01, 0x05, 0x01,
];

const CDCI_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x28, 0x00,
];

const RGBA_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x29, 0x00,
];

const JPEG2000_SUB_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x5a, 0x00,
];

const WAVE_AUDIO_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x48, 0x00,
];

const PREFACE_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x2f, 0x00,
];

const MATERIAL_PACKAGE_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x36, 0x00,
];

const TIMELINE_TRACK_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x11, 0x00,
];

const SEQUENCE_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x0f, 0x00,
];

/** OP1a UL */
const OP1A_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x01,
  0x0d, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00, 0x00,
];

/** Essence Container UL for JPEG 2000 */
const ESSENCE_CONTAINER_JPEG2000 = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x07,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x0c, 0x01, 0x00,
];

/** Essence Container UL for ProRes */
const ESSENCE_CONTAINER_PRORES = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x0d,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x1c, 0x01, 0x00,
];

/** Essence Container UL for PCM Audio */
const ESSENCE_CONTAINER_PCM = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x01,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x06, 0x01, 0x00,
];

/** Essence Container UL for DNxHD */
const ESSENCE_CONTAINER_DNXHD = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x0a,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x11, 0x01, 0x00,
];

/** Essence Container UL for AVC/H.264 */
const ESSENCE_CONTAINER_AVC = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x0a,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x10, 0x01, 0x00,
];

/** Essence Container UL for MPEG-2 */
const ESSENCE_CONTAINER_MPEG2 = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x01,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x04, 0x01, 0x00,
];

/** Essence Container UL for MPEG-2 D10 */
const ESSENCE_CONTAINER_MPEG2_D10 = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x01,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x02, 0x01, 0x00,
];

/** Essence Container UL for HEVC/H.265 */
const ESSENCE_CONTAINER_HEVC = [
  0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x0d,
  0x0d, 0x01, 0x03, 0x01, 0x02, 0x1e, 0x01, 0x00,
];

/** Timecode Component UL */
const TIMECODE_COMPONENT_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x14, 0x00,
];

// ---------------------------------------------------------------------------
// Helpers: build complete MXF-like structures
// ---------------------------------------------------------------------------

/**
 * Build a minimal header partition pack KLV with the given operational pattern.
 * The partition pack value is 88 bytes minimum (to include the OP UL).
 */
function buildHeaderPartitionKLV(opUL?: number[], headerByteCount?: number): number[] {
  const valueSize = 88;
  const klv: number[] = new Array(16 + 1 + valueSize).fill(0);
  writeUL(klv, 0, HEADER_PARTITION_UL);
  // BER short form length
  writeBERShort(klv, 16, valueSize);

  const valueStart = 17;
  // Major version = 1
  writeUint16BE(klv, valueStart + 0, 1);
  // Minor version = 3
  writeUint16BE(klv, valueStart + 2, 3);
  // KAG size = 1
  writeUint32BE(klv, valueStart + 4, 1);
  // This Partition = 0
  writeUint64BE(klv, valueStart + 8, 0);
  // Previous Partition = 0
  writeUint64BE(klv, valueStart + 16, 0);
  // Footer Partition = 0
  writeUint64BE(klv, valueStart + 24, 0);
  // Header Byte Count
  writeUint64BE(klv, valueStart + 32, headerByteCount ?? 0);
  // Index Byte Count = 0
  writeUint64BE(klv, valueStart + 40, 0);
  // Index SID = 0
  writeUint32BE(klv, valueStart + 48, 0);
  // Body Offset = 0
  writeUint64BE(klv, valueStart + 52, 0);
  // Body SID = 0
  writeUint32BE(klv, valueStart + 60, 0);
  // Operational Pattern UL (16 bytes at offset 64)
  if (opUL) {
    writeUL(klv, valueStart + 64, opUL);
  }
  // Essence Containers batch: count=0, size=0 (8 bytes at offset 80)
  writeUint32BE(klv, valueStart + 80, 0);
  writeUint32BE(klv, valueStart + 84, 0);

  return klv;
}

/**
 * Build a KLV with a given UL key and value bytes.
 * Automatically selects BER short-form (for lengths < 128) or
 * BER long-form 1-byte (for lengths 128-255) or 2-byte (for larger).
 */
function buildKLV(ul: number[], value: number[]): number[] {
  let berSize: number;
  if (value.length < 128) {
    berSize = 1;
  } else if (value.length <= 255) {
    berSize = 2;
  } else {
    berSize = 3;
  }
  const klv: number[] = new Array(16 + berSize + value.length).fill(0);
  writeUL(klv, 0, ul);
  if (value.length < 128) {
    writeBERShort(klv, 16, value.length);
  } else if (value.length <= 255) {
    writeBERLong1(klv, 16, value.length);
  } else {
    writeBERLong2(klv, 16, value.length);
  }
  const valueStart = 16 + berSize;
  for (let i = 0; i < value.length; i++) {
    klv[valueStart + i] = value[i]!;
  }
  return klv;
}

/**
 * Build a local set value with tag-value pairs.
 */
function buildLocalSetValue(entries: Array<{ tag: number; value: number[] }>): number[] {
  const result: number[] = [];
  for (const entry of entries) {
    // 2 byte tag + 2 byte length + value
    result.push((entry.tag >> 8) & 0xff, entry.tag & 0xff);
    result.push((entry.value.length >> 8) & 0xff, entry.value.length & 0xff);
    result.push(...entry.value);
  }
  return result;
}

/**
 * Build a rational value (two 32-bit big-endian ints).
 */
function buildRational(num: number, den: number): number[] {
  const bytes: number[] = new Array(8).fill(0);
  writeUint32BE(bytes, 0, num);
  writeUint32BE(bytes, 4, den);
  return bytes;
}

/**
 * Build a 64-bit big-endian value.
 */
function buildUint64(value: number): number[] {
  const bytes: number[] = new Array(8).fill(0);
  writeUint64BE(bytes, 0, value);
  return bytes;
}

/**
 * Build a 32-bit big-endian value.
 */
function buildUint32(value: number): number[] {
  const bytes: number[] = new Array(4).fill(0);
  writeUint32BE(bytes, 0, value);
  return bytes;
}

/**
 * Build a UTF-16BE string value.
 */
function buildUTF16BE(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes;
}

/**
 * Build an MXF timestamp (8 bytes: year(2) month(1) day(1) hour(1) min(1) sec(1) qms(1)).
 */
function buildTimestamp(year: number, month: number, day: number, hour: number, min: number, sec: number): number[] {
  const bytes: number[] = new Array(8).fill(0);
  writeUint16BE(bytes, 0, year);
  bytes[2] = month;
  bytes[3] = day;
  bytes[4] = hour;
  bytes[5] = min;
  bytes[6] = sec;
  bytes[7] = 0; // quarter milliseconds
  return bytes;
}

// ===========================================================================
// Test Suites
// ===========================================================================

describe('MXF Demuxer', () => {
  // =========================================================================
  // Detection Tests
  // =========================================================================
  describe('Detection', () => {
    it('MXF-DET-001: should detect valid MXF file header', () => {
      const bytes = buildHeaderPartitionKLV(OP1A_UL);
      const buffer = bytesToBuffer(bytes);
      expect(isMXFFile(buffer)).toBe(true);
    });

    it('MXF-DET-002: should reject non-MXF buffer', () => {
      // JPEG SOI marker
      const buffer = bytesToBuffer([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);
      expect(isMXFFile(buffer)).toBe(false);
    });

    it('MXF-DET-003: should reject empty buffer', () => {
      const buffer = bytesToBuffer([]);
      expect(isMXFFile(buffer)).toBe(false);
    });

    it('MXF-DET-004: should reject truncated header (less than 14 bytes)', () => {
      const buffer = bytesToBuffer([0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01]);
      expect(isMXFFile(buffer)).toBe(false);
    });

    it('MXF-DET-005: should reject buffer with correct prefix but wrong partition pack bytes', () => {
      // SMPTE prefix OK but bytes 4-7 don't match partition pack identification
      const buffer = bytesToBuffer([
        0x06, 0x0e, 0x2b, 0x34, 0x01, 0x02, 0x03, 0x04,
        0x0d, 0x01, 0x02, 0x01, 0x01, 0x02,
      ]);
      expect(isMXFFile(buffer)).toBe(false);
    });
  });

  // =========================================================================
  // KLV Parsing Tests
  // =========================================================================
  describe('KLV Parsing', () => {
    it('MXF-KLV-001: should parse KLV with short-form BER length', () => {
      // 16-byte key + 1-byte BER length (10) + 10 bytes value
      const bytes: number[] = new Array(27).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 10; // short form length = 10
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 0);
      expect(klv.length).toBe(10);
      expect(klv.valueOffset).toBe(17);
      expect(klv.key.length).toBe(16);
    });

    it('MXF-KLV-002: should parse KLV with long-form 1-byte BER length', () => {
      // 16-byte key + 0x81 + 1-byte length (200) + 200 bytes value
      const totalSize = 16 + 2 + 200;
      const bytes: number[] = new Array(totalSize).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0x81;
      bytes[17] = 200;
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 0);
      expect(klv.length).toBe(200);
      expect(klv.valueOffset).toBe(18);
    });

    it('MXF-KLV-003: should parse KLV with long-form 2-byte BER length', () => {
      // 16-byte key + 0x82 + 2-byte length (1024) + value (just partial)
      const bytes: number[] = new Array(20).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0x82;
      bytes[17] = 0x04; // high byte
      bytes[18] = 0x00; // low byte -> 1024
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 0);
      expect(klv.length).toBe(1024);
      expect(klv.valueOffset).toBe(19);
    });

    it('MXF-KLV-004: should extract correct key bytes', () => {
      const testUL = [
        0x06, 0x0e, 0x2b, 0x34, 0x01, 0x02, 0x03, 0x04,
        0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
      ];
      const bytes: number[] = new Array(17).fill(0);
      writeUL(bytes, 0, testUL);
      bytes[16] = 0; // zero-length value
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 0);
      expect(Array.from(klv.key)).toEqual(testUL);
    });
  });

  // =========================================================================
  // Partition Pack Parsing Tests
  // =========================================================================
  describe('Partition Parsing', () => {
    it('MXF-PART-001: should parse header partition pack', () => {
      const bytes = buildHeaderPartitionKLV(OP1A_UL, 5000);
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);
      const klv = parseKLV(view, 0);
      const partition = parsePartitionPack(view, 0, klv);

      expect(partition.type).toBe('header');
      expect(partition.offset).toBe(0);
      expect(partition.headerByteCount).toBe(5000);
    });

    it('MXF-PART-002: should parse body partition pack', () => {
      const valueSize = 88;
      const bytes: number[] = new Array(16 + 1 + valueSize).fill(0);
      writeUL(bytes, 0, BODY_PARTITION_UL);
      writeBERShort(bytes, 16, valueSize);
      // Fill partition pack fields
      writeUint16BE(bytes, 17, 1); // major version
      writeUint16BE(bytes, 19, 3); // minor version
      writeUint32BE(bytes, 21, 1); // KAG size

      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);
      const klv = parseKLV(view, 0);
      const partition = parsePartitionPack(view, 0, klv);

      expect(partition.type).toBe('body');
    });

    it('MXF-PART-003: should parse footer partition pack', () => {
      const valueSize = 88;
      const bytes: number[] = new Array(16 + 1 + valueSize).fill(0);
      writeUL(bytes, 0, FOOTER_PARTITION_UL);
      writeBERShort(bytes, 16, valueSize);
      writeUint16BE(bytes, 17, 1);
      writeUint16BE(bytes, 19, 3);
      writeUint32BE(bytes, 21, 1);

      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);
      const klv = parseKLV(view, 0);
      const partition = parsePartitionPack(view, 0, klv);

      expect(partition.type).toBe('footer');
    });
  });

  // =========================================================================
  // Metadata Extraction Tests
  // =========================================================================
  describe('Metadata Extraction', () => {
    it('MXF-META-001: should detect OP1a operational pattern', () => {
      const bytes = buildHeaderPartitionKLV(OP1A_UL);
      const buffer = bytesToBuffer(bytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.operationalPattern).toBe('OP1a');
    });

    it('MXF-META-002: should extract edit rate from timeline track', () => {
      // Build: header partition + timeline track with edit rate
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 1000);

      const trackValue = buildLocalSetValue([
        { tag: 0x4801, value: buildRational(24, 1) }, // Edit Rate = 24/1
      ]);
      const trackKLV = buildKLV(TIMELINE_TRACK_UL, trackValue);

      const allBytes = [...partitionBytes, ...trackKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.editRate).toBeDefined();
      expect(metadata.editRate!.num).toBe(24);
      expect(metadata.editRate!.den).toBe(1);
    });

    it('MXF-META-003: should extract duration from sequence', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 1000);

      const seqValue = buildLocalSetValue([
        { tag: 0x0202, value: buildUint64(240) }, // Duration = 240 frames
      ]);
      const seqKLV = buildKLV(SEQUENCE_UL, seqValue);

      const allBytes = [...partitionBytes, ...seqKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.duration).toBe(240);
    });

    it('MXF-META-004: should extract timecode from Timecode Component set', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 1000);

      // Timeline track with edit rate (so timecode conversion uses correct fps)
      const trackValue = buildLocalSetValue([
        { tag: 0x4801, value: buildRational(24, 1) },
      ]);
      const trackKLV = buildKLV(TIMELINE_TRACK_UL, trackValue);

      // Timecode Component with start timecode (86400 frames = 01:00:00:00 at 24fps)
      const TIMECODE_COMPONENT_UL = [
        0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
        0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x14, 0x00,
      ];
      const tcValue = buildLocalSetValue([
        { tag: 0x1501, value: buildUint64(86400) }, // Start timecode
        { tag: 0x1502, value: [0x00] }, // DropFrame = false
      ]);
      const tcKLV = buildKLV(TIMECODE_COMPONENT_UL, tcValue);

      const allBytes = [...partitionBytes, ...trackKLV, ...tcKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.startTimecode).toBe('01:00:00:00');
    });

    it('MXF-META-005: should extract material package info', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 1000);

      const pkgValue = buildLocalSetValue([
        { tag: 0x4402, value: buildUTF16BE('Test Clip') },
        { tag: 0x3b02, value: buildTimestamp(2024, 6, 15, 10, 30, 0) },
        { tag: 0x3b03, value: buildTimestamp(2024, 6, 15, 11, 0, 0) },
      ]);
      const pkgKLV = buildKLV(MATERIAL_PACKAGE_UL, pkgValue);

      const allBytes = [...partitionBytes, ...pkgKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.materialPackageInfo).toBeDefined();
      expect(metadata.materialPackageInfo!.name).toBe('Test Clip');
      expect(metadata.materialPackageInfo!.creationDate).toBe('2024-06-15T10:30:00');
      expect(metadata.materialPackageInfo!.modifiedDate).toBe('2024-06-15T11:00:00');
    });
  });

  // =========================================================================
  // Essence Descriptor Parsing Tests
  // =========================================================================
  describe('Essence Descriptor Parsing', () => {
    it('MXF-ESS-001: should parse video CDCI descriptor', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(1920) },   // Stored Width
        { tag: 0x3202, value: buildUint32(1080) },   // Stored Height
        { tag: 0x320e, value: buildRational(16, 9) }, // Aspect Ratio
        { tag: 0x3301, value: buildUint32(10) },      // Component Depth (bit depth)
        { tag: 0x3002, value: buildUint64(1000) },    // Container Duration
        { tag: 0x3001, value: buildRational(24, 1) }, // Sample Rate
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.essenceDescriptors.length).toBeGreaterThanOrEqual(1);
      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.width).toBe(1920);
      expect(videoDesc!.height).toBe(1080);
      expect(videoDesc!.aspectRatio).toEqual({ num: 16, den: 9 });
      expect(videoDesc!.bitDepth).toBe(10);
      expect(videoDesc!.containerDuration).toBe(1000);
      expect(videoDesc!.sampleRate).toEqual({ num: 24, den: 1 });
      expect(videoDesc!.colorSpace).toBe('YCbCr');
    });

    it('MXF-ESS-002: should parse wave audio descriptor', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const audioValue = buildLocalSetValue([
        { tag: 0x3d07, value: buildUint32(2) },           // Channel Count
        { tag: 0x3d03, value: buildRational(48000, 1) },   // Audio Sampling Rate
        { tag: 0x3d01, value: buildUint32(24) },           // Quantization Bits
        { tag: 0x3002, value: buildUint64(2400000) },      // Container Duration
      ]);
      const audioKLV = buildKLV(WAVE_AUDIO_DESCRIPTOR_UL, audioValue);

      const allBytes = [...partitionBytes, ...audioKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const audioDesc = metadata.essenceDescriptors.find(d => d.type === 'audio');
      expect(audioDesc).toBeDefined();
      expect(audioDesc!.audioChannels).toBe(2);
      expect(audioDesc!.audioSampleRate).toBe(48000);
      expect(audioDesc!.audioBitDepth).toBe(24);
      expect(audioDesc!.containerDuration).toBe(2400000);
      expect(audioDesc!.codec).toBe('pcm');
    });

    it('MXF-ESS-003: should detect JPEG 2000 codec from sub-descriptor', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      // CDCI descriptor with uncompressed codec (no essence container tag)
      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(4096) },
        { tag: 0x3202, value: buildUint32(2160) },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      // JPEG 2000 sub-descriptor (its mere presence signals JPEG 2000)
      const jp2SubValue = buildLocalSetValue([]);
      const jp2SubKLV = buildKLV(JPEG2000_SUB_DESCRIPTOR_UL, jp2SubValue);

      const allBytes = [...partitionBytes, ...cdciKLV, ...jp2SubKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('jpeg2000');
    });

    it('MXF-ESS-004: should detect ProRes codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(1920) },
        { tag: 0x3202, value: buildUint32(1080) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_PRORES }, // Essence Container UL
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('prores');
    });
  });

  // =========================================================================
  // Full Demux Tests
  // =========================================================================
  describe('Full Demux', () => {
    it('MXF-DEMUX-001: should locate essence element offsets', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL);

      // Essence element with 100 bytes of "video" data
      const essenceData = new Array(100).fill(0xab);
      const essenceKLV = buildKLV(ESSENCE_ELEMENT_UL, essenceData);

      const allBytes = [...partitionBytes, ...essenceKLV];
      const buffer = bytesToBuffer(allBytes);
      const result = demuxMXF(buffer);

      expect(result.essenceOffsets.length).toBe(1);
      expect(result.essenceOffsets[0]!.length).toBe(100);
      expect(result.metadata.operationalPattern).toBe('OP1a');
    });

    it('MXF-DEMUX-002: should handle multi-track essence elements', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL);

      // Two essence elements on different tracks
      const videoEssenceUL = [...ESSENCE_ELEMENT_UL];
      videoEssenceUL[15] = 0x01; // track 1
      const videoData = new Array(200).fill(0x11);
      const videoKLV = buildKLV(videoEssenceUL, videoData);

      const audioEssenceUL = [...ESSENCE_ELEMENT_UL];
      audioEssenceUL[15] = 0x02; // track 2
      const audioData = new Array(50).fill(0x22);
      const audioKLV = buildKLV(audioEssenceUL, audioData);

      const allBytes = [...partitionBytes, ...videoKLV, ...audioKLV];
      const buffer = bytesToBuffer(allBytes);
      const result = demuxMXF(buffer);

      expect(result.essenceOffsets.length).toBe(2);
      expect(result.essenceOffsets[0]!.length).toBe(200);
      expect(result.essenceOffsets[0]!.trackIndex).toBe(0); // track 1 -> index 0
      expect(result.essenceOffsets[1]!.length).toBe(50);
      expect(result.essenceOffsets[1]!.trackIndex).toBe(1); // track 2 -> index 1
    });

    it('MXF-DEMUX-003: should handle files with no essence (metadata-only)', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL);
      const buffer = bytesToBuffer(partitionBytes);
      const result = demuxMXF(buffer);

      expect(result.essenceOffsets.length).toBe(0);
      expect(result.metadata.operationalPattern).toBe('OP1a');
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================
  describe('Error Handling', () => {
    it('MXF-ERR-001: should throw on corrupt KLV (truncated key)', () => {
      // Only 10 bytes -- not enough for a 16-byte KLV key
      const bytes: number[] = new Array(10).fill(0x06);
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      expect(() => parseKLV(view, 0)).toThrow(/Truncated KLV key/);
    });

    it('MXF-ERR-002: should handle truncated partition pack gracefully', () => {
      // A buffer that starts with valid MXF header (14+ bytes with partition pack prefix)
      // but is too short for a full KLV triplet.
      // parseMXFHeader succeeds in detection, but the KLV loop doesn't execute
      // because offset + 17 > byteLength, so it returns default (empty) metadata.
      const bytes = [
        0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01,
        0x0d, 0x01, 0x02, 0x01, 0x01, 0x02,
      ];
      const buffer = bytesToBuffer(bytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.operationalPattern).toBe('unknown');
      expect(metadata.essenceDescriptors.length).toBe(0);
    });

    it('MXF-ERR-003: should throw on invalid BER encoding (indefinite length)', () => {
      // 16-byte key + 0x80 (indefinite length marker)
      const bytes: number[] = new Array(17).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0x80; // indefinite length
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      expect(() => parseKLV(view, 0)).toThrow(/Indefinite BER length/);
    });
  });

  // =========================================================================
  // matchUL Tests
  // =========================================================================
  describe('UL Matching', () => {
    it('should match when key equals target prefix', () => {
      const key = new Uint8Array([0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01, 0x0d, 0x01, 0x02, 0x01, 0x01, 0x02, 0x01, 0x00]);
      expect(matchUL(key, SMPTE_UL_PREFIX)).toBe(true);
    });

    it('should not match when key differs from target', () => {
      const key = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(matchUL(key, SMPTE_UL_PREFIX)).toBe(false);
    });

    it('should match full 16-byte UL', () => {
      const key = new Uint8Array(HEADER_PARTITION_UL);
      expect(matchUL(key, HEADER_PARTITION_UL)).toBe(true);
    });
  });

  // =========================================================================
  // Additional edge cases
  // =========================================================================
  describe('Edge Cases', () => {
    it('should handle RGBA descriptor', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const rgbaValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(3840) },
        { tag: 0x3202, value: buildUint32(2160) },
      ]);
      const rgbaKLV = buildKLV(RGBA_DESCRIPTOR_UL, rgbaValue);

      const allBytes = [...partitionBytes, ...rgbaKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.width).toBe(3840);
      expect(videoDesc!.height).toBe(2160);
      expect(videoDesc!.colorSpace).toBe('RGBA');
    });

    it('should detect OPAtom operational pattern', () => {
      const opAtomUL = [
        0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x01,
        0x0d, 0x01, 0x02, 0x01, 0x10, 0x01, 0x00, 0x00,
      ];
      const bytes = buildHeaderPartitionKLV(opAtomUL);
      const buffer = bytesToBuffer(bytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.operationalPattern).toBe('OPAtom');
    });

    it('should handle non-MXF buffer in parseMXFHeader', () => {
      const buffer = bytesToBuffer([0xff, 0xd8, 0xff, 0xe0]);
      expect(() => parseMXFHeader(buffer)).toThrow(/Not a valid MXF file/);
    });

    it('should detect JPEG 2000 codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(2048) },
        { tag: 0x3202, value: buildUint32(1080) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_JPEG2000 },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('jpeg2000');
    });

    it('should detect PCM audio codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const audioValue = buildLocalSetValue([
        { tag: 0x3d07, value: buildUint32(6) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_PCM },
      ]);
      const audioKLV = buildKLV(WAVE_AUDIO_DESCRIPTOR_UL, audioValue);

      const allBytes = [...partitionBytes, ...audioKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const audioDesc = metadata.essenceDescriptors.find(d => d.type === 'audio');
      expect(audioDesc).toBeDefined();
      expect(audioDesc!.codec).toBe('pcm');
      expect(audioDesc!.audioChannels).toBe(6);
    });

    it('should parse Preface set for operational pattern', () => {
      const partitionBytes = buildHeaderPartitionKLV(undefined, 2000);

      const prefaceValue = buildLocalSetValue([
        { tag: 0x3b09, value: OP1A_UL }, // Operational Pattern
      ]);
      const prefaceKLV = buildKLV(PREFACE_UL, prefaceValue);

      const allBytes = [...partitionBytes, ...prefaceKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.operationalPattern).toBe('OP1a');
    });

    it('should handle multiple descriptors (video + audio)', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 5000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(1920) },
        { tag: 0x3202, value: buildUint32(1080) },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const audioValue = buildLocalSetValue([
        { tag: 0x3d07, value: buildUint32(2) },
        { tag: 0x3d01, value: buildUint32(24) },
      ]);
      const audioKLV = buildKLV(WAVE_AUDIO_DESCRIPTOR_UL, audioValue);

      const allBytes = [...partitionBytes, ...cdciKLV, ...audioKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.essenceDescriptors.length).toBe(2);
      expect(metadata.essenceDescriptors.filter(d => d.type === 'video').length).toBe(1);
      expect(metadata.essenceDescriptors.filter(d => d.type === 'audio').length).toBe(1);
    });

    it('should parse BER long-form length with more than 2 bytes', () => {
      // Test BER with 4-byte length encoding
      const bytes: number[] = new Array(21).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0x84; // 4-byte long form
      bytes[17] = 0x00;
      bytes[18] = 0x01;
      bytes[19] = 0x00;
      bytes[20] = 0x00; // length = 65536
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 0);
      expect(klv.length).toBe(65536);
      expect(klv.valueOffset).toBe(21);
    });

    it('should handle KLV at non-zero offset', () => {
      // Pad with 10 bytes, then a KLV
      const padding = new Array(10).fill(0x00);
      const klvBytes: number[] = new Array(17).fill(0);
      writeUL(klvBytes, 0, HEADER_PARTITION_UL);
      klvBytes[16] = 5; // 5-byte value
      const allBytes = [...padding, ...klvBytes, 0, 0, 0, 0, 0];
      const buffer = bytesToBuffer(allBytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 10);
      expect(klv.length).toBe(5);
      expect(klv.valueOffset).toBe(27); // 10 + 16 + 1
    });
  });

  // =========================================================================
  // Timecode Tests (NDF and DF)
  // =========================================================================
  describe('Timecode', () => {
    it('MXF-TC-001: NDF timecode at 24fps', () => {
      // 86400 frames at 24fps = 01:00:00:00
      expect(framesToTimecode(86400, 24)).toBe('01:00:00:00');
      // 0 frames
      expect(framesToTimecode(0, 24)).toBe('00:00:00:00');
      // 90000 frames at 24fps = 01:02:30:00
      expect(framesToTimecode(90000, 24)).toBe('01:02:30:00');
    });

    it('MXF-TC-002: DF timecode at 29.97fps', () => {
      // At 29.97fps drop-frame, 00:01:00;02 follows 00:00:59;29
      // 0 frames
      expect(framesToTimecodeDF(0, 29.97)).toBe('00:00:00;00');
      // 30 frames = 00:00:01;00
      expect(framesToTimecodeDF(30, 29.97)).toBe('00:00:01;00');
      // 1798 frames = 00:00:59;28
      expect(framesToTimecodeDF(1798, 29.97)).toBe('00:00:59;28');
      // 1799 frames = 00:00:59;29
      expect(framesToTimecodeDF(1799, 29.97)).toBe('00:00:59;29');
      // 1800 frames = 00:01:00;02 (frames 00 and 01 are dropped at the minute mark)
      expect(framesToTimecodeDF(1800, 29.97)).toBe('00:01:00;02');
      // 17982 frames = 00:10:00;00 (no drop at 10-minute mark)
      expect(framesToTimecodeDF(17982, 29.97)).toBe('00:10:00;00');
    });

    it('MXF-TC-003: NDF timecode with zero fps returns default', () => {
      expect(framesToTimecode(100, 0)).toBe('00:00:00:00');
      expect(framesToTimecodeDF(100, 0)).toBe('00:00:00;00');
    });

    it('MXF-TC-004: DF timecode uses semicolon separator', () => {
      const tc = framesToTimecodeDF(100, 29.97);
      expect(tc).toContain(';');
      expect(tc).not.toMatch(/:\d{2}$/); // should not end with colon+frames
    });
  });

  // =========================================================================
  // Timecode Component Set Parsing Tests
  // =========================================================================
  describe('Timecode Component Parsing', () => {
    it('MXF-TC-COMP-001: should parse NDF timecode from Timecode Component set', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const trackValue = buildLocalSetValue([
        { tag: 0x4801, value: buildRational(25, 1) }, // Edit Rate = 25fps
      ]);
      const trackKLV = buildKLV(TIMELINE_TRACK_UL, trackValue);

      // 90000 frames at 25fps = 01:00:00:00
      const tcValue = buildLocalSetValue([
        { tag: 0x1501, value: buildUint64(90000) }, // Start timecode
        { tag: 0x1502, value: [0x00] }, // DropFrame = false (NDF)
      ]);
      const tcKLV = buildKLV(TIMECODE_COMPONENT_UL, tcValue);

      const allBytes = [...partitionBytes, ...trackKLV, ...tcKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.startTimecode).toBe('01:00:00:00');
    });

    it('MXF-TC-COMP-002: should parse DF timecode from Timecode Component set', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const trackValue = buildLocalSetValue([
        { tag: 0x4801, value: buildRational(30000, 1001) }, // Edit Rate = 29.97fps
      ]);
      const trackKLV = buildKLV(TIMELINE_TRACK_UL, trackValue);

      // 1800 frames at 29.97fps DF = 00:01:00;02
      const tcValue = buildLocalSetValue([
        { tag: 0x1501, value: buildUint64(1800) },
        { tag: 0x1502, value: [0x01] }, // DropFrame = true
      ]);
      const tcKLV = buildKLV(TIMECODE_COMPONENT_UL, tcValue);

      const allBytes = [...partitionBytes, ...trackKLV, ...tcKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.startTimecode).toBe('00:01:00;02');
    });

    it('MXF-TC-COMP-003: should parse timecode at frame 0', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const trackValue = buildLocalSetValue([
        { tag: 0x4801, value: buildRational(24, 1) },
      ]);
      const trackKLV = buildKLV(TIMELINE_TRACK_UL, trackValue);

      const tcValue = buildLocalSetValue([
        { tag: 0x1501, value: buildUint64(0) }, // Start timecode = 0
        { tag: 0x1502, value: [0x00] },
      ]);
      const tcKLV = buildKLV(TIMECODE_COMPONENT_UL, tcValue);

      const allBytes = [...partitionBytes, ...trackKLV, ...tcKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.startTimecode).toBe('00:00:00:00');
    });
  });

  // =========================================================================
  // Additional Codec Detection Tests
  // =========================================================================
  describe('Codec Detection', () => {
    it('MXF-CODEC-001: should detect DNxHD codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(1920) },
        { tag: 0x3202, value: buildUint32(1080) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_DNXHD },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('dnxhd');
    });

    it('MXF-CODEC-002: should detect AVC codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(1920) },
        { tag: 0x3202, value: buildUint32(1080) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_AVC },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('avc');
    });

    it('MXF-CODEC-003: should detect MPEG-2 codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(720) },
        { tag: 0x3202, value: buildUint32(576) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_MPEG2 },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('mpeg2');
    });

    it('MXF-CODEC-004: should detect MPEG-2 D10 codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(720) },
        { tag: 0x3202, value: buildUint32(576) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_MPEG2_D10 },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('mpeg2-d10');
    });

    it('MXF-CODEC-005: should detect HEVC codec from essence container UL', () => {
      const partitionBytes = buildHeaderPartitionKLV(OP1A_UL, 2000);

      const cdciValue = buildLocalSetValue([
        { tag: 0x3203, value: buildUint32(3840) },
        { tag: 0x3202, value: buildUint32(2160) },
        { tag: 0x3004, value: ESSENCE_CONTAINER_HEVC },
      ]);
      const cdciKLV = buildKLV(CDCI_DESCRIPTOR_UL, cdciValue);

      const allBytes = [...partitionBytes, ...cdciKLV];
      const buffer = bytesToBuffer(allBytes);
      const metadata = parseMXFHeader(buffer);

      const videoDesc = metadata.essenceDescriptors.find(d => d.type === 'video');
      expect(videoDesc).toBeDefined();
      expect(videoDesc!.codec).toBe('hevc');
    });
  });

  // =========================================================================
  // BER Edge Cases
  // =========================================================================
  describe('BER Edge Cases', () => {
    it('MXF-BER-001: should handle zero-length KLV value', () => {
      const bytes: number[] = new Array(17).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0; // short form length = 0
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 0);
      expect(klv.length).toBe(0);
      expect(klv.valueOffset).toBe(17);
    });

    it('MXF-BER-002: should reject excessive BER length bytes (> 8)', () => {
      const bytes: number[] = new Array(26).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0x89; // 9-byte long form (invalid, max is 8)
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      expect(() => parseKLV(view, 0)).toThrow(/exceeds maximum/);
    });

    it('MXF-BER-003: should handle BER long-form with zero length bytes (0x80 = indefinite)', () => {
      const bytes: number[] = new Array(17).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0x80; // indefinite length
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      expect(() => parseKLV(view, 0)).toThrow(/Indefinite BER length/);
    });

    it('MXF-BER-004: should handle BER long-form with 8-byte length', () => {
      // 16-byte key + 0x88 + 8-byte length
      const bytes: number[] = new Array(25).fill(0);
      writeUL(bytes, 0, HEADER_PARTITION_UL);
      bytes[16] = 0x88; // 8-byte long form
      // Set a reasonable length value (256)
      bytes[23] = 0x01;
      bytes[24] = 0x00;
      const buffer = bytesToBuffer(bytes);
      const view = new DataView(buffer);

      const klv = parseKLV(view, 0);
      expect(klv.length).toBe(256);
      expect(klv.valueOffset).toBe(25);
    });
  });

  // =========================================================================
  // OP UL Version Byte Flexibility Tests
  // =========================================================================
  describe('OP UL Version Byte', () => {
    it('should detect OP1a with different version byte', () => {
      // OP1a UL with version byte 0x02 instead of 0x01
      const opULv2 = [
        0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x02,
        0x0d, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00, 0x00,
      ];
      const bytes = buildHeaderPartitionKLV(opULv2);
      const buffer = bytesToBuffer(bytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.operationalPattern).toBe('OP1a');
    });

    it('should detect OP1a with version byte 0x0d', () => {
      const opULv13 = [
        0x06, 0x0e, 0x2b, 0x34, 0x04, 0x01, 0x01, 0x0d,
        0x0d, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00, 0x00,
      ];
      const bytes = buildHeaderPartitionKLV(opULv13);
      const buffer = bytesToBuffer(bytes);
      const metadata = parseMXFHeader(buffer);

      expect(metadata.operationalPattern).toBe('OP1a');
    });
  });
});
