/**
 * MP4Muxer Unit Tests
 *
 * Tests for the minimal ISO BMFF muxer that wraps encoded video chunks
 * into a valid MP4 container.
 */

import { describe, it, expect } from 'vitest';
import { muxToMP4, muxToMP4Blob, buildAVCDecoderConfig, type MuxerConfig } from './MP4Muxer';
import type { EncodedChunk } from './VideoExporter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultMuxerConfig(overrides?: Partial<MuxerConfig>): MuxerConfig {
  return {
    codec: 'avc1.42001f',
    width: 640,
    height: 480,
    fps: 24,
    ...overrides,
  };
}

/**
 * Create a fake H.264 Annex B keyframe with SPS and PPS NAL units.
 * This simulates what a real WebCodecs encoder would produce.
 */
function fakeH264KeyFrame(timestamp: number): EncodedChunk {
  // Minimal SPS NAL unit (type 7): start code + header + profile/level
  const sps = new Uint8Array([
    0x00, 0x00, 0x00, 0x01,  // Start code
    0x67, 0x42, 0x00, 0x1f,  // SPS: type=7, profile=66 (Baseline), compat=0, level=31
    0xe9, 0x40, 0x10, 0x18,  // Encoded SPS data (dummy)
  ]);
  // Minimal PPS NAL unit (type 8)
  const pps = new Uint8Array([
    0x00, 0x00, 0x00, 0x01,  // Start code
    0x68, 0xce, 0x38, 0x80,  // PPS: type=8 + dummy data
  ]);
  // IDR slice NAL unit (type 5)
  const idr = new Uint8Array([
    0x00, 0x00, 0x00, 0x01,  // Start code
    0x65, 0x88, 0x80, 0x40,  // IDR: type=5 + dummy data
    0x00, 0x01, 0x02, 0x03,
  ]);

  const data = new Uint8Array(sps.length + pps.length + idr.length);
  data.set(sps, 0);
  data.set(pps, sps.length);
  data.set(idr, sps.length + pps.length);

  return {
    data,
    type: 'key',
    timestamp,
    duration: Math.round(1_000_000 / 24),
  };
}

function fakeDeltaFrame(timestamp: number): EncodedChunk {
  // Non-IDR slice (type 1)
  const data = new Uint8Array([
    0x00, 0x00, 0x00, 0x01,  // Start code
    0x41, 0x9a, 0x00, 0x04,  // non-IDR: type=1 + dummy data
    0x10, 0x20, 0x30, 0x40,
  ]);
  return {
    data,
    type: 'delta',
    timestamp,
    duration: Math.round(1_000_000 / 24),
  };
}

/**
 * Read a big-endian 32-bit uint from a buffer at a given offset.
 */
function readU32(buf: Uint8Array, offset: number): number {
  return ((buf[offset]! << 24) | (buf[offset + 1]! << 16) |
    (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0;
}

/**
 * Read a 4-char box type from a buffer.
 */
function readType(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset]!, buf[offset + 1]!, buf[offset + 2]!, buf[offset + 3]!);
}

/**
 * Find all top-level ISO BMFF boxes in a buffer.
 */
function findBoxes(buf: Uint8Array, startOffset = 0): Array<{ type: string; offset: number; size: number }> {
  const boxes: Array<{ type: string; offset: number; size: number }> = [];
  let offset = startOffset;
  while (offset + 8 <= buf.length) {
    const size = readU32(buf, offset);
    if (size < 8) break;
    const type = readType(buf, offset + 4);
    boxes.push({ type, offset, size });
    offset += size;
  }
  return boxes;
}

/**
 * Recursively find a box by type inside a container.
 */
function findBoxRecursive(
  buf: Uint8Array,
  targetType: string,
  start = 0,
  end = buf.length,
): { offset: number; size: number } | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size = readU32(buf, offset);
    if (size < 8 || offset + size > end) break;
    const type = readType(buf, offset + 4);
    if (type === targetType) return { offset, size };

    // Recurse into container boxes
    const containerTypes = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'stsd', 'avc1', 'vp09', 'av01'];
    if (containerTypes.includes(type)) {
      const inner = findBoxRecursive(buf, targetType, offset + 8, offset + size);
      if (inner) return inner;
    }

    offset += size;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildAVCDecoderConfig', () => {
  it('MUX-001: produces correct AVCC structure', () => {
    const sps = new Uint8Array([0x67, 0x42, 0x00, 0x1f, 0xe9, 0x40]);
    const pps = new Uint8Array([0x68, 0xce, 0x38, 0x80]);

    const config = buildAVCDecoderConfig(sps, pps);

    expect(config[0]).toBe(1);        // configurationVersion
    expect(config[1]).toBe(0x42);     // AVCProfileIndication (from sps[1])
    expect(config[2]).toBe(0x00);     // profile_compatibility (from sps[2])
    expect(config[3]).toBe(0x1f);     // AVCLevelIndication (from sps[3])
    expect(config[4]).toBe(0xff);     // lengthSizeMinusOne = 3
    expect(config[5]).toBe(0xe1);     // numOfSequenceParameterSets = 1
  });

  it('MUX-002: includes SPS and PPS data', () => {
    const sps = new Uint8Array([0x67, 0x42, 0x00, 0x1f]);
    const pps = new Uint8Array([0x68, 0xce]);

    const config = buildAVCDecoderConfig(sps, pps);

    // Total size: 5 (header) + 1 (numSPS) + 2 (spsLen) + sps.len + 1 (numPPS) + 2 (ppsLen) + pps.len
    expect(config.length).toBe(11 + sps.length + pps.length);
  });
});

describe('muxToMP4', () => {
  it('MUX-003: produces a valid MP4 buffer', () => {
    const chunks = [
      fakeH264KeyFrame(0),
      fakeDeltaFrame(41667),
      fakeDeltaFrame(83333),
    ];

    const mp4 = muxToMP4(chunks, defaultMuxerConfig());

    expect(mp4).toBeInstanceOf(Uint8Array);
    expect(mp4.length).toBeGreaterThan(0);
  });

  it('MUX-004: starts with ftyp box', () => {
    const chunks = [fakeH264KeyFrame(0), fakeDeltaFrame(41667)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const boxes = findBoxes(buf);
    expect(boxes.length).toBeGreaterThanOrEqual(3); // ftyp, moov, mdat
    expect(boxes[0]!.type).toBe('ftyp');
  });

  it('MUX-005: contains moov box with video track', () => {
    const chunks = [fakeH264KeyFrame(0), fakeDeltaFrame(41667)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const boxes = findBoxes(buf);
    const moov = boxes.find(b => b.type === 'moov');
    expect(moov).toBeDefined();

    // Should contain trak inside moov
    const trak = findBoxRecursive(buf, 'trak', moov!.offset + 8, moov!.offset + moov!.size);
    expect(trak).not.toBeNull();
  });

  it('MUX-006: contains mdat box with sample data', () => {
    const chunks = [fakeH264KeyFrame(0), fakeDeltaFrame(41667)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const boxes = findBoxes(buf);
    const mdat = boxes.find(b => b.type === 'mdat');
    expect(mdat).toBeDefined();
    expect(mdat!.size).toBeGreaterThan(8); // More than just header
  });

  it('MUX-007: contains avcC box for H.264', () => {
    const chunks = [fakeH264KeyFrame(0)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    // avcC is nested inside avc1 sample entry which has non-standard layout,
    // so we scan for the 'avcC' type tag directly in the buffer
    let found = false;
    for (let i = 0; i < buf.length - 8; i++) {
      if (buf[i + 4] === 0x61 && buf[i + 5] === 0x76 && buf[i + 6] === 0x63 && buf[i + 7] === 0x43) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('MUX-008: contains stts box (time-to-sample)', () => {
    const chunks = [fakeH264KeyFrame(0), fakeDeltaFrame(41667), fakeDeltaFrame(83333)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const stts = findBoxRecursive(buf, 'stts');
    expect(stts).not.toBeNull();
  });

  it('MUX-009: contains stsz box (sample sizes)', () => {
    const chunks = [fakeH264KeyFrame(0), fakeDeltaFrame(41667)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const stsz = findBoxRecursive(buf, 'stsz');
    expect(stsz).not.toBeNull();
  });

  it('MUX-010: contains stss box for sync samples (keyframes)', () => {
    const chunks = [
      fakeH264KeyFrame(0),
      fakeDeltaFrame(41667),
      fakeDeltaFrame(83333),
    ];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const stss = findBoxRecursive(buf, 'stss');
    expect(stss).not.toBeNull();
  });

  it('MUX-011: omits stss when all frames are keyframes', () => {
    const chunks = [
      fakeH264KeyFrame(0),
      fakeH264KeyFrame(41667),
    ];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    // When all samples are sync, stss can be omitted
    const stss = findBoxRecursive(buf, 'stss');
    expect(stss).toBeNull();
  });

  it('MUX-012: handles single-frame video', () => {
    const chunks = [fakeH264KeyFrame(0)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    expect(buf.length).toBeGreaterThan(0);
    const boxes = findBoxes(buf);
    expect(boxes.length).toBe(3); // ftyp, moov, mdat
  });

  it('MUX-013: moov comes before mdat (fast-start)', () => {
    const chunks = [fakeH264KeyFrame(0), fakeDeltaFrame(41667)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const boxes = findBoxes(buf);
    const moovIdx = boxes.findIndex(b => b.type === 'moov');
    const mdatIdx = boxes.findIndex(b => b.type === 'mdat');
    expect(moovIdx).toBeLessThan(mdatIdx);
  });

  it('MUX-014: works with VP9 codec', () => {
    const chunks: EncodedChunk[] = [{
      data: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
      type: 'key',
      timestamp: 0,
    }];

    const buf = muxToMP4(chunks, defaultMuxerConfig({ codec: 'vp09.00.10.08' }));
    expect(buf.length).toBeGreaterThan(0);
  });

  it('MUX-015: stco offset points into mdat', () => {
    const chunks = [fakeH264KeyFrame(0), fakeDeltaFrame(41667)];
    const buf = muxToMP4(chunks, defaultMuxerConfig());

    const boxes = findBoxes(buf);
    const mdatBox = boxes.find(b => b.type === 'mdat');
    expect(mdatBox).toBeDefined();

    // The stco chunk offset should point to the data within mdat (after header)
    const stco = findBoxRecursive(buf, 'stco');
    expect(stco).not.toBeNull();

    // Read the chunk offset from stco (fullbox: 4 size + 4 type + 4 ver+flags + 4 count + 4 offset)
    const offsetPos = stco!.offset + 16;
    const chunkOffset = readU32(buf, offsetPos);

    // Should point to the first byte after mdat header (mdat offset + 8)
    expect(chunkOffset).toBe(mdatBox!.offset + 8);
  });

  it('MUX-016: throws on empty chunks array', () => {
    expect(() => muxToMP4([], defaultMuxerConfig())).toThrow('no chunks to mux');
  });

  it('MUX-017: throws on dimensions exceeding 65535', () => {
    const chunks = [fakeH264KeyFrame(0)];
    expect(() => muxToMP4(chunks, defaultMuxerConfig({ width: 70000 }))).toThrow('exceed 65535');
  });

  it('MUX-018: muxToMP4Blob returns Blob with correct type', () => {
    const chunks = [fakeH264KeyFrame(0)];
    const blob = muxToMP4Blob(chunks, defaultMuxerConfig());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBeGreaterThan(0);
  });
});
