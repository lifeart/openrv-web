/**
 * JPEG gain map: metadata sources (Ultra HDR XMP split across images, ISO
 * 21496-1 APP2), ICC-declared base colour, and the decode result labelling.
 * JPEG buffers are assembled in code (marker segments only, no entropy data).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseGainmapJPEG, decodeGainmapToFloat32, _internal } from './JPEGGainmapDecoder';
import { buildICC, DISPLAY_P3_ICC } from './__tests__/iccFixtures';

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function segment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}

function xmpSegment(body: string): number[] {
  return segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/\0'), ...ascii(body)]);
}

function iccSegment(icc: Uint8Array): number[] {
  return segment(0xe2, [...ascii('ICC_PROFILE\0'), 1, 1, ...icc]);
}

/** ISO 21496-1 APP2 (one channel, separate denominators). */
function isoSegment(m: { baseH: number; altH: number; min: number; max: number; gamma?: number }): number[] {
  const body = new Uint8Array(5 + 4 * 14);
  const v = new DataView(body.buffer);
  const words = [m.baseH, 1, m.altH, 1, m.min, 1, m.max, 1, m.gamma ?? 1, 1, 1, 64, 1, 64];
  words.forEach((w, i) => v.setInt32(5 + i * 4, w));
  return segment(0xe2, [...ascii('urn:iso:std:iso:ts:21496:-1\0'), ...body]);
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Primary JPEG (+ optional XMP / ICC) with an MPF index pointing at a gain map JPEG. */
function buildGainmapJPEG(opts: { primary?: number[][]; gainmap?: number[][] }): ArrayBuffer {
  const gainmap = [0xff, 0xd8, ...(opts.gainmap ?? []).flat(), 0xff, 0xd9];
  const head = [0xff, 0xd8, ...(opts.primary ?? []).flat()];
  const mpfMarkerOffset = head.length;
  const mpfDataStart = mpfMarkerOffset + 8;
  const mpfPayloadLen = 4 + 8 + 2 + 24 + 32;
  const primaryLen = head.length + 4 + mpfPayloadLen + 2;
  const gainmapRel = primaryLen - mpfDataStart;
  const mpf = segment(0xe2, [
    ...ascii('MPF\0'),
    0x49,
    0x49,
    0x2a,
    0x00,
    ...u32le(8),
    0x02,
    0x00,
    ...[0x01, 0xb0, 0x04, 0x00, ...u32le(1), ...u32le(2)],
    ...[0x02, 0xb0, 0x07, 0x00, ...u32le(32), ...u32le(34)],
    ...[...u32le(0), ...u32le(primaryLen), ...u32le(0), 0, 0, 0, 0],
    ...[...u32le(0), ...u32le(gainmap.length), ...u32le(gainmapRel), 0, 0, 0, 0],
  ]);
  const bytes = new Uint8Array([...head, ...mpf, 0xff, 0xd9, ...gainmap]);
  expect(head.length + mpf.length + 2).toBe(primaryLen);
  return bytes.buffer;
}

const HDRGM_NS = 'xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"';

describe('parseGainmapJPEG metadata sources', () => {
  it('JGC-001: Ultra HDR: full hdrgm metadata from the gain map XMP when the primary has only Version', () => {
    const buf = buildGainmapJPEG({
      primary: [xmpSegment(`<rdf:Description ${HDRGM_NS} hdrgm:Version="1.0"/>`)],
      gainmap: [
        xmpSegment(
          `<rdf:Description ${HDRGM_NS} hdrgm:Version="1.0" hdrgm:GainMapMin="-1" hdrgm:GainMapMax="3" ` +
            `hdrgm:Gamma="2" hdrgm:OffsetSDR="0.015625" hdrgm:OffsetHDR="0.03125" ` +
            `hdrgm:HDRCapacityMin="0.5" hdrgm:HDRCapacityMax="3"/>`,
        ),
      ],
    });
    const info = parseGainmapJPEG(buf)!;
    const m = info.gainMapMetadata!;
    expect(m.gainMapMin).toEqual([-1]);
    expect(m.gamma).toEqual([2]);
    expect(m.offsetHDR).toEqual([0.03125]);
    expect(m.hdrCapacityMin).toBe(0.5);
    expect(info.headroom).toBe(3);
  });

  it('JGC-002: ISO 21496-1 APP2 metadata is used when there is no hdrgm XMP', () => {
    const buf = buildGainmapJPEG({ gainmap: [isoSegment({ baseH: 0, altH: 3, min: 0, max: 3, gamma: 1 })] });
    const m = parseGainmapJPEG(buf)!.gainMapMetadata!;
    expect(m.gainMapMax).toEqual([3]);
    expect(m.hdrCapacityMax).toBe(3);
    expect(m.offsetSDR).toEqual([1 / 64]);
    expect(m.baseRenditionIsHDR).toBe(false);
  });

  it('JGC-003: an ISO HDR-base gain map sets baseRenditionIsHDR', () => {
    const buf = buildGainmapJPEG({ gainmap: [isoSegment({ baseH: 2, altH: 0, min: -2, max: 0 })] });
    const m = parseGainmapJPEG(buf)!.gainMapMetadata!;
    expect(m.baseRenditionIsHDR).toBe(true);
    expect(m.hdrCapacityMax).toBe(2);
    expect(m.gainMapMin).toEqual([2]);
  });

  it('JGC-004: hdrgm XMP takes precedence over ISO APP2', () => {
    const buf = buildGainmapJPEG({
      gainmap: [
        xmpSegment(`<rdf:Description ${HDRGM_NS} hdrgm:GainMapMax="4" hdrgm:HDRCapacityMax="4"/>`),
        isoSegment({ baseH: 0, altH: 3, min: 0, max: 3 }),
      ],
    });
    expect(parseGainmapJPEG(buf)!.headroom).toBe(4);
  });

  it('JGC-005: the primary ICC profile declares the base colour', () => {
    const p3 = buildGainmapJPEG({ primary: [iccSegment(buildICC(DISPLAY_P3_ICC))] });
    expect(parseGainmapJPEG(p3)!.baseColor).toEqual({ primaries: 'p3', transfer: null });
    expect(parseGainmapJPEG(buildGainmapJPEG({}))!.baseColor).toBeNull();
  });

  it('JGC-006: multi-chunk ICC profiles are reassembled in sequence order', () => {
    const icc = buildICC(DISPLAY_P3_ICC);
    const half = Math.floor(icc.length / 2);
    const chunk = (seq: number, bytes: Uint8Array) => segment(0xe2, [...ascii('ICC_PROFILE\0'), seq, 2, ...bytes]);
    const buf = buildGainmapJPEG({ primary: [chunk(2, icc.subarray(half)), chunk(1, icc.subarray(0, half))] });
    expect(Array.from(_internal.extractICCFromJPEG(buf, 0, undefined)!)).toEqual(Array.from(icc));
  });
});

describe('decodeGainmapToFloat32 colour handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('JGC-010: P3 base decoded via a display-p3 canvas; result labelled linear / p3 with ISO math applied', async () => {
    const contexts: Array<string | undefined> = [];
    const bitmapOptions: Array<ImageBitmapOptions | undefined> = [];
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext(_t: string, s?: { colorSpace?: string }) {
        contexts.push(s?.colorSpace);
        return {
          save: vi.fn(),
          restore: vi.fn(),
          drawImage: vi.fn(),
          getImageData: (_x: number, _y: number, w: number, h: number, ds?: { colorSpace?: string }) => ({
            data: new Uint8ClampedArray(w * h * 4).fill(255),
            colorSpace: ds?.colorSpace ?? 'srgb',
          }),
        };
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (_b: Blob, o?: ImageBitmapOptions) => {
        bitmapOptions.push(o);
        return { width: 1, height: 1, close: vi.fn() };
      }),
    );

    const buf = buildGainmapJPEG({
      primary: [iccSegment(buildICC(DISPLAY_P3_ICC))],
      gainmap: [isoSegment({ baseH: 0, altH: 2, min: 0, max: 2 })],
    });
    const info = parseGainmapJPEG(buf)!;
    const out = await decodeGainmapToFloat32(buf, info);

    expect(contexts).toEqual(['display-p3', 'srgb']); // base, then gain map
    expect(bitmapOptions).toContainEqual({ colorSpaceConversion: 'none' }); // gain map read raw
    expect(out.colorPrimaries).toBe('p3');
    expect(out.transferFunction).toBe('linear');
    // base 1.0, G = 2, offsets 1/64: (1 + 1/64) * 4 - 1/64 = 4.046875
    expect(out.data[0]).toBeCloseTo(4.046875, 5);
    expect(out.data[3]).toBe(1);
  });
});
