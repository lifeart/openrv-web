import { describe, it, expect } from 'vitest';
import {
  colorInfoFromCICP,
  colorInfoFromICC,
  isWideGamut,
  parsePNGcICP,
  primariesFromCICP,
  transferFromCICP,
} from './EmbeddedColorInfo';
import { CHROMATICITIES } from './ColorPrimariesMath';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** PNG chunk list (CRCs are not checked by the parser, so they are zero). */
function buildPNG(chunks: { type: string; data: number[] }[]): ArrayBuffer {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const { type, data } of chunks) {
    const n = data.length;
    bytes.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    for (const c of type) bytes.push(c.charCodeAt(0));
    bytes.push(...data, 0, 0, 0, 0);
  }
  return new Uint8Array(bytes).buffer;
}

const IHDR = { type: 'IHDR', data: [0, 0, 0, 1, 0, 0, 0, 1, 16, 2, 0, 0, 0] };
const IDAT = { type: 'IDAT', data: [0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1] };
const IEND = { type: 'IEND', data: [] };

const s15 = (v: number) => Math.round(v * 65536);

/** Minimal ICC profile with optional desc / colorant / chad / cicp tags. */
function buildICC(opts: {
  desc?: string;
  colorants?: readonly number[]; // row-major RGB->XYZ (D50 PCS)
  chad?: readonly number[];
  cicp?: [number, number, number, number];
}): ArrayBuffer {
  const tags: { sig: string; data: number[] }[] = [];
  const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const str = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  if (opts.desc !== undefined) {
    tags.push({ sig: 'desc', data: [...str('desc'), 0, 0, 0, 0, ...u32(opts.desc.length + 1), ...str(opts.desc), 0] });
  }
  if (opts.colorants) {
    const m = opts.colorants;
    ['rXYZ', 'gXYZ', 'bXYZ'].forEach((sig, col) => {
      tags.push({
        sig,
        data: [...str('XYZ '), 0, 0, 0, 0, ...u32(s15(m[col]!)), ...u32(s15(m[3 + col]!)), ...u32(s15(m[6 + col]!))],
      });
    });
  }
  if (opts.chad) {
    tags.push({ sig: 'chad', data: [...str('sf32'), 0, 0, 0, 0, ...opts.chad.flatMap((v) => u32(s15(v)))] });
  }
  if (opts.cicp) tags.push({ sig: 'cicp', data: [...str('cicp'), 0, 0, 0, 0, ...opts.cicp] });

  const tableEnd = 132 + tags.length * 12;
  let offset = tableEnd;
  const table: number[] = [];
  const data: number[] = [];
  for (const t of tags) {
    table.push(...str(t.sig), ...u32(offset), ...u32(t.data.length));
    data.push(...t.data);
    while (data.length % 4) data.push(0);
    offset = tableEnd + data.length;
  }
  const total = tableEnd + data.length;
  const header = new Array<number>(128).fill(0);
  header.splice(0, 4, ...u32(total));
  header.splice(12, 4, ...str('mntr'));
  header.splice(16, 4, ...str('RGB '));
  header.splice(20, 4, ...str('XYZ '));
  header.splice(36, 4, ...str('acsp'));
  return new Uint8Array([...header, ...u32(tags.length), ...table, ...data]).buffer;
}

// Display P3 colorants as written by Apple's "Display P3" profile (D50 PCS) and its chad.
const DISPLAY_P3_D50 = [0.515121, 0.291977, 0.157104, 0.241196, 0.692245, 0.0665741, -0.00105286, 0.0418854, 0.784073];
const CHAD_D65_TO_D50 = [
  1.04788, 0.0229187, -0.0502014, 0.0295868, 0.990479, -0.0170593, -0.00923157, 0.0150757, 0.751678,
];
// sRGB IEC61966-2.1 colorants (D50 PCS)
const SRGB_D50 = [0.436066, 0.385147, 0.143066, 0.222488, 0.716873, 0.0606079, 0.0139313, 0.0970764, 0.714096];
// Rec.2020 colorants (D50 PCS, Bradford)
const BT2020_D50 = [0.673459, 0.165661, 0.1251, 0.279033, 0.675338, 0.0456288, -0.00193139, 0.0299794, 0.797162];

// ---------------------------------------------------------------------------

describe('EmbeddedColorInfo', () => {
  describe('CICP code points', () => {
    it('maps primaries codes', () => {
      expect(primariesFromCICP(1)).toEqual({ colorPrimaries: 'bt709' });
      expect(primariesFromCICP(9)).toEqual({ colorPrimaries: 'bt2020' });
      expect(primariesFromCICP(12)).toEqual({ colorPrimaries: 'p3' });
      expect(primariesFromCICP(11)).toEqual({ chromaticities: [...CHROMATICITIES.dciP3] });
      expect(primariesFromCICP(2)).toEqual({}); // unspecified
      expect(primariesFromCICP(200)).toEqual({});
    });

    it('maps transfer codes', () => {
      expect(transferFromCICP(16)).toBe('pq');
      expect(transferFromCICP(18)).toBe('hlg');
      expect(transferFromCICP(13)).toBe('srgb');
      expect(transferFromCICP(8)).toBe('linear');
      expect(transferFromCICP(2)).toBeUndefined();
    });

    it('combines both', () => {
      expect(colorInfoFromCICP({ primaries: 12, transfer: 13 })).toEqual({
        colorPrimaries: 'p3',
        transferFunction: 'srgb',
      });
      expect(colorInfoFromCICP({ primaries: 9, transfer: 16 })).toEqual({
        colorPrimaries: 'bt2020',
        transferFunction: 'pq',
      });
    });
  });

  describe('parsePNGcICP', () => {
    it('reads a cICP chunk before IDAT', () => {
      const png = buildPNG([IHDR, { type: 'cICP', data: [9, 16, 0, 1] }, IDAT, IEND]);
      expect(parsePNGcICP(png)).toEqual({ primaries: 9, transfer: 16, matrix: 0, fullRange: true });
    });

    it('reads HLG / P3 combinations', () => {
      const png = buildPNG([IHDR, { type: 'iCCP', data: [65, 0, 0, 1, 2, 3] }, { type: 'cICP', data: [12, 18, 0, 1] }]);
      const cicp = parsePNGcICP(png)!;
      expect(colorInfoFromCICP(cicp)).toEqual({ colorPrimaries: 'p3', transferFunction: 'hlg' });
    });

    it('ignores cICP after IDAT and files without one', () => {
      expect(parsePNGcICP(buildPNG([IHDR, IDAT, { type: 'cICP', data: [9, 16, 0, 1] }, IEND]))).toBeNull();
      expect(parsePNGcICP(buildPNG([IHDR, IDAT, IEND]))).toBeNull();
    });

    it('rejects non-PNG data, malformed chunks and truncated heads', () => {
      expect(parsePNGcICP(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer)).toBeNull();
      expect(parsePNGcICP(buildPNG([IHDR, { type: 'cICP', data: [9, 16, 0] }]))).toBeNull();
      const full = new Uint8Array(buildPNG([IHDR, { type: 'cICP', data: [9, 16, 0, 1] }]));
      expect(parsePNGcICP(full.slice(0, full.length - 8).buffer)).toBeNull();
    });
  });

  describe('colorInfoFromICC', () => {
    it("labels a Display P3 profile 'p3' from its colorants (with chad)", () => {
      const info = colorInfoFromICC(buildICC({ colorants: DISPLAY_P3_D50, chad: CHAD_D65_TO_D50 }))!;
      expect(info.colorPrimaries).toBe('p3');
      expect(info.primariesSource).toBe('colorants');
      expect(isWideGamut(info)).toBe(true);
    });

    it("labels Display P3 colorants 'p3' without chad (D65 assumed) and ignores a misleading description", () => {
      const info = colorInfoFromICC(buildICC({ desc: 'Generic RGB', colorants: DISPLAY_P3_D50 }))!;
      expect(info.colorPrimaries).toBe('p3');
      expect(info.description).toBe('Generic RGB');
    });

    it('labels sRGB colorants bt709 (not wide gamut)', () => {
      const info = colorInfoFromICC(buildICC({ desc: 'sRGB IEC61966-2.1', colorants: SRGB_D50 }))!;
      expect(info.colorPrimaries).toBe('bt709');
      expect(isWideGamut(info)).toBe(false);
    });

    it('labels BT.2020 colorants bt2020', () => {
      expect(colorInfoFromICC(buildICC({ colorants: BT2020_D50 }))!.colorPrimaries).toBe('bt2020');
    });

    it('passes unknown colorants (Adobe RGB) through as chromaticities', () => {
      // Adobe RGB (1998), D50 PCS
      const adobe = [0.609741, 0.205276, 0.149185, 0.311111, 0.625671, 0.0632172, 0.0194702, 0.0608673, 0.744568];
      const info = colorInfoFromICC(buildICC({ colorants: adobe }))!;
      expect(info.colorPrimaries).toBeUndefined();
      expect(info.chromaticities?.[0]).toBeCloseTo(0.64, 2);
      expect(info.chromaticities?.[2]).toBeCloseTo(0.21, 2);
      expect(info.chromaticities?.[3]).toBeCloseTo(0.71, 2);
    });

    it('prefers the cicp tag (primaries and transfer)', () => {
      const info = colorInfoFromICC(buildICC({ colorants: SRGB_D50, cicp: [9, 16, 0, 1] }))!;
      expect(info.colorPrimaries).toBe('bt2020');
      expect(info.transferFunction).toBe('pq');
      expect(info.primariesSource).toBe('cicp');
    });

    it('falls back to the description', () => {
      expect(colorInfoFromICC(buildICC({ desc: 'Display P3' }))!.colorPrimaries).toBe('p3');
      expect(colorInfoFromICC(buildICC({ desc: 'Rec. 2020 PQ' }))!.colorPrimaries).toBe('bt2020');
      expect(colorInfoFromICC(buildICC({ desc: 'sRGB built-in' }))!.colorPrimaries).toBeUndefined();
    });

    it('returns null for data too short to be a profile', () => {
      expect(colorInfoFromICC(new ArrayBuffer(64))).toBeNull();
    });
  });
});
