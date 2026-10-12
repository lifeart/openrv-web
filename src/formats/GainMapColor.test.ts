/**
 * GainMapColor Unit Tests: declared base colour (CICP / ICC / colr), decode
 * planning, linearisation to 1.0 = SDR white, and the browser decode helpers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  colorFromCicp,
  decodeGainMapBase,
  GAIN_MAP_BITMAP_OPTIONS,
  iccColorantsFor,
  linearizeBasePixels,
  mergeBaseColor,
  parseColrPayload,
  parseICCProfileColor,
  planBaseDecode,
  rawBaseInterpretation,
  readGainMapPixels,
} from './GainMapColor';
import { srgbToLinear } from './GainMapMetadata';
import { buildICC, SRGB_ICC, DISPLAY_P3_ICC, ADOBE_RGB_ICC } from './__tests__/iccFixtures';

describe('colorFromCicp', () => {
  it('GMC-001: maps H.273 primaries and transfer codes', () => {
    expect(colorFromCicp(1, 13)).toEqual({ primaries: 'bt709', transfer: 'srgb' });
    expect(colorFromCicp(12, 13)).toEqual({ primaries: 'p3', transfer: 'srgb' });
    expect(colorFromCicp(9, 16)).toEqual({ primaries: 'bt2020', transfer: 'pq' });
    expect(colorFromCicp(9, 18)).toEqual({ primaries: 'bt2020', transfer: 'hlg' });
    expect(colorFromCicp(1, 8)).toEqual({ primaries: 'bt709', transfer: 'linear' });
    expect(colorFromCicp(2, 2)).toEqual({ primaries: null, transfer: null });
    expect(colorFromCicp(11, 17).primaries).toBe('other'); // DCI-P3 (DCI white)
  });
});

describe('ICC profiles', () => {
  it('GMC-010: computed D50 colorants match published profiles', () => {
    const close = (a: number[][], b: number[][]) =>
      a.forEach((col, k) => col.forEach((v, i) => expect(v).toBeCloseTo(b[k]![i]!, 3)));
    close(iccColorantsFor('bt709'), SRGB_ICC);
    close(iccColorantsFor('p3'), DISPLAY_P3_ICC);
  });

  it('GMC-011: classifies sRGB, Display P3, BT.2020 and unknown profiles by colorants', () => {
    expect(parseICCProfileColor(buildICC(SRGB_ICC))).toEqual({ primaries: 'bt709', transfer: null });
    expect(parseICCProfileColor(buildICC(DISPLAY_P3_ICC))).toEqual({ primaries: 'p3', transfer: null });
    expect(parseICCProfileColor(buildICC(iccColorantsFor('bt2020')))!.primaries).toBe('bt2020');
    expect(parseICCProfileColor(buildICC(ADOBE_RGB_ICC))!.primaries).toBe('other');
  });

  it('GMC-012: a cicp tag (ICC v4.4) wins and carries the transfer', () => {
    expect(parseICCProfileColor(buildICC(SRGB_ICC, [9, 16]))).toEqual({ primaries: 'bt2020', transfer: 'pq' });
  });

  it('GMC-013: rejects non-ICC data and non-RGB profiles', () => {
    expect(parseICCProfileColor(new Uint8Array(200))).toBeNull();
    const gray = buildICC(SRGB_ICC);
    gray.set([0x47, 0x52, 0x41, 0x59], 16); // 'GRAY'
    expect(parseICCProfileColor(gray)).toBeNull();
  });

  it('GMC-014: colr payloads (nclx and prof)', () => {
    const nclx = new Uint8Array([0x6e, 0x63, 0x6c, 0x78, 0, 12, 0, 13, 0, 1, 0x80]);
    expect(parseColrPayload(new DataView(nclx.buffer), 0, nclx.byteLength)).toEqual({
      primaries: 'p3',
      transfer: 'srgb',
    });
    const icc = buildICC(DISPLAY_P3_ICC);
    const prof = new Uint8Array(4 + icc.byteLength);
    prof.set([0x70, 0x72, 0x6f, 0x66]);
    prof.set(icc, 4);
    expect(parseColrPayload(new DataView(prof.buffer), 0, prof.byteLength)!.primaries).toBe('p3');
  });

  it('GMC-015: mergeBaseColor prefers declared transfer and known primaries', () => {
    expect(
      mergeBaseColor([
        { primaries: 'other', transfer: null },
        { primaries: 'bt2020', transfer: 'hlg' },
      ]),
    ).toEqual({ primaries: 'bt2020', transfer: 'hlg' });
    expect(mergeBaseColor([null, { primaries: null, transfer: null }])).toBeNull();
  });
});

describe('planBaseDecode', () => {
  it('GMC-020: SDR sRGB / undeclared -> managed sRGB canvas', () => {
    expect(planBaseDecode(null)).toEqual({ kind: 'managed', canvasColorSpace: 'srgb' });
    expect(planBaseDecode({ primaries: 'bt709', transfer: 'srgb' })).toEqual({
      kind: 'managed',
      canvasColorSpace: 'srgb',
    });
  });

  it('GMC-021: Display P3 and unknown ICC primaries -> managed display-p3 canvas', () => {
    expect(planBaseDecode({ primaries: 'p3', transfer: null })).toEqual({
      kind: 'managed',
      canvasColorSpace: 'display-p3',
    });
    expect(planBaseDecode({ primaries: 'other', transfer: null })).toEqual({
      kind: 'managed',
      canvasColorSpace: 'display-p3',
    });
  });

  it('GMC-022: PQ / HLG / linear / BT.2020 SDR -> raw code values', () => {
    expect(planBaseDecode({ primaries: null, transfer: 'pq' })).toEqual({
      kind: 'raw',
      transfer: 'pq',
      primaries: 'bt2020',
    });
    expect(planBaseDecode({ primaries: 'p3', transfer: 'hlg' })).toEqual({
      kind: 'raw',
      transfer: 'hlg',
      primaries: 'p3',
    });
    expect(planBaseDecode({ primaries: null, transfer: 'linear' })).toEqual({
      kind: 'raw',
      transfer: 'linear',
      primaries: 'bt709',
    });
    expect(planBaseDecode({ primaries: 'bt2020', transfer: 'srgb' })).toEqual({
      kind: 'raw',
      transfer: 'srgb',
      primaries: 'bt2020',
    });
  });

  it('GMC-023: raw interpretation for colour-unmanaged decoders (libheif)', () => {
    expect(rawBaseInterpretation({ primaries: 'p3', transfer: null })).toEqual({ transfer: 'srgb', primaries: 'p3' });
    expect(rawBaseInterpretation(null)).toEqual({ transfer: 'srgb', primaries: 'bt709' });
    expect(rawBaseInterpretation({ primaries: 'bt2020', transfer: 'pq' })).toEqual({
      transfer: 'pq',
      primaries: 'bt2020',
    });
  });
});

describe('linearizeBasePixels', () => {
  const px = (...codes: number[]) => new Uint8ClampedArray(codes.flatMap((c) => [c, c, c, 255]));

  it('GMC-030: sRGB: code 255 = SDR white = 1.0', () => {
    const out = linearizeBasePixels(px(255, 128, 0), 3, 'srgb');
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[4]).toBeCloseTo(srgbToLinear(128 / 255), 6);
    expect(out[8]).toBe(0);
    expect(out[3]).toBe(1);
  });

  it('GMC-031: PQ: 203 cd/m2 (code ~0.5806) -> 1.0, peak -> 10000/203', () => {
    const out = linearizeBasePixels(px(148, 255), 2, 'pq');
    expect(out[0]).toBeCloseTo(1.0, 1); // 148/255 = 0.5804
    expect(out[4]).toBeCloseTo(10000 / 203, 2);
  });

  it('GMC-032: HLG: 75% signal on white -> 203 cd/m2 = 1.0 (BT.2408), 100% -> 1000/203', () => {
    const out = linearizeBasePixels(px(191, 255), 2, 'hlg', 'bt2020');
    // 191/255 = 0.749 (75% HLG): 1000 * 0.2645^1.2 / 203 ~= 0.998
    expect(out[0]).toBeCloseTo(1.0, 1);
    expect(out[4]).toBeCloseTo(1000 / 203, 2);
  });

  it('GMC-033: linear: code / 255', () => {
    expect(linearizeBasePixels(px(51), 1, 'linear')[0]).toBeCloseTo(0.2, 6);
  });
});

// =============================================================================
// Browser decode helpers (stubbed createImageBitmap / OffscreenCanvas)
// =============================================================================

interface FakeCtxCall {
  contextColorSpace: string | undefined;
  imageDataColorSpace: string | undefined;
}

function stubBrowser(opts: { pixel: [number, number, number]; supportsP3: boolean }) {
  const calls: FakeCtxCall[] = [];
  const bitmapOptions: Array<ImageBitmapOptions | undefined> = [];
  const closed: number[] = [];
  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext(_type: string, settings?: { colorSpace?: string }) {
      const call: FakeCtxCall = { contextColorSpace: settings?.colorSpace, imageDataColorSpace: undefined };
      calls.push(call);
      const width = this.width;
      const height = this.height;
      return {
        save: vi.fn(),
        restore: vi.fn(),
        drawImage: vi.fn(),
        getImageData: (_x: number, _y: number, _w: number, _h: number, s?: { colorSpace?: string }) => {
          call.imageDataColorSpace = s?.colorSpace;
          const data = new Uint8ClampedArray(width * height * 4);
          for (let i = 0; i < width * height; i++) data.set([...opts.pixel, 255], i * 4);
          const colorSpace = s?.colorSpace === 'display-p3' && opts.supportsP3 ? 'display-p3' : 'srgb';
          return { data, colorSpace };
        },
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (_blob: Blob, o?: ImageBitmapOptions) => {
      bitmapOptions.push(o);
      const id = bitmapOptions.length;
      return { width: 2, height: 1, close: () => closed.push(id) };
    }),
  );
  return { calls, bitmapOptions, closed };
}

describe('decodeGainMapBase / readGainMapPixels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GMC-040: Display P3 base is read through a display-p3 canvas and labelled p3', async () => {
    const env = stubBrowser({ pixel: [255, 0, 0], supportsP3: true });
    const out = await decodeGainMapBase(new Blob([]), { primaries: 'p3', transfer: null });
    expect(env.calls[0]).toEqual({ contextColorSpace: 'display-p3', imageDataColorSpace: 'display-p3' });
    expect(env.bitmapOptions[0]).toBeUndefined(); // colour-managed decode
    expect(out.colorPrimaries).toBe('p3');
    expect(out.width).toBe(2);
    expect(Array.from(out.data.subarray(0, 4))).toEqual([1, 0, 0, 1]);
    expect(env.closed).toEqual([1]);
  });

  it('GMC-041: falls back to sRGB (bt709) when the browser has no P3 canvas', async () => {
    stubBrowser({ pixel: [255, 255, 255], supportsP3: false });
    const out = await decodeGainMapBase(new Blob([]), { primaries: 'p3', transfer: null });
    expect(out.colorPrimaries).toBe('bt709');
  });

  it('GMC-042: PQ base is decoded raw (no colour conversion) and linearised with the PQ EOTF', async () => {
    const env = stubBrowser({ pixel: [255, 255, 255], supportsP3: true });
    const out = await decodeGainMapBase(new Blob([]), { primaries: 'bt2020', transfer: 'pq' });
    expect(env.bitmapOptions[0]).toEqual({ colorSpaceConversion: 'none' });
    expect(env.calls[0]!.contextColorSpace).toBe('srgb');
    expect(out.colorPrimaries).toBe('bt2020');
    expect(out.data[0]).toBeCloseTo(10000 / 203, 2);
  });

  it('GMC-043: gain map samples are read raw on an sRGB canvas', () => {
    const env = stubBrowser({ pixel: [10, 20, 30], supportsP3: true });
    let closed = false;
    const bitmap = { width: 1, height: 1, close: () => (closed = true) } as unknown as ImageBitmap;
    const data = readGainMapPixels(bitmap, 2, 1, 1);
    expect(Array.from(data.subarray(0, 4))).toEqual([10, 20, 30, 255]);
    expect(env.calls[0]!.contextColorSpace).toBe('srgb');
    expect(closed).toBe(true);
    expect(GAIN_MAP_BITMAP_OPTIONS).toEqual({ colorSpaceConversion: 'none' });
  });
});
