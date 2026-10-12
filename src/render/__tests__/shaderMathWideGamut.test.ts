/**
 * Wide-gamut working space (review item H7) — reference math.
 *
 * The viewer shader grades in linear BT.709 but clamps negatives in the
 * source primaries, maps gamut in the target gamut, and runs vibrance and the
 * HSL qualifier on HDR values scaled to [0,1] by their largest channel. These
 * tests pin the reference implementations that the real-GLSL tests in
 * src/render/__gpu__/wide-gamut.gpu-test.ts compare against.
 */
import { describe, it, expect } from 'vitest';
import { COLOR_PRIMARIES_INVERSE_MATRICES, COLOR_PRIMARIES_MATRICES, invertMat3ColMajor } from '../ShaderConstants';
import {
  applyGamutMappingWorking,
  applyHSLQualifierCorrection,
  applyMat3,
  applyVibrance,
  clampToSourceGamut,
  hdrNormalizedHsl,
  hslToRgb,
  rgbToHsl,
} from './shaderMathReference';

const M = COLOR_PRIMARIES_MATRICES;
const INV = COLOR_PRIMARIES_INVERSE_MATRICES;

function mulColMajor(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[k * 3 + row]! * b[col * 3 + k]!;
      out.push(sum);
    }
  }
  return out;
}

function expectIdentity(m: number[]): void {
  m.forEach((v, i) => expect(v).toBeCloseTo(i % 4 === 0 ? 1 : 0, 6));
}

describe('WG-MAT: inverse input-primaries matrices', () => {
  it('WG-MAT-001: invertMat3ColMajor inverts a general matrix', () => {
    const m = new Float32Array([2, 0.5, 0.1, -0.3, 1.5, 0.2, 0.4, -0.2, 3]);
    expectIdentity(mulColMajor(invertMat3ColMajor(m), m));
    expectIdentity(mulColMajor(m, invertMat3ColMajor(m)));
  });

  it('WG-MAT-002: singular matrix falls back to identity', () => {
    const inv = invertMat3ColMajor(new Float32Array(9));
    expect(Array.from(inv)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('WG-MAT-003: SRGB_TO_P3 / SRGB_TO_REC2020 inverses round-trip exactly', () => {
    expectIdentity(mulColMajor(INV.SRGB_TO_P3, M.P3_TO_SRGB));
    expectIdentity(mulColMajor(INV.SRGB_TO_REC2020, M.REC2020_TO_SRGB));
  });

  it('WG-MAT-004: inverses agree with the published 4-decimal tables', () => {
    INV.SRGB_TO_P3.forEach((v, i) => expect(v).toBeCloseTo(M.SRGB_TO_P3[i]!, 3));
    INV.SRGB_TO_REC2020.forEach((v, i) => expect(v).toBeCloseTo(M.SRGB_TO_REC2020[i]!, 3));
  });
});

describe('WG-CLAMP: clampToSourceGamut', () => {
  it('WG-CLAMP-001: BT.709 sources clamp at zero', () => {
    expect(clampToSourceGamut(-0.2, 0.5, 1.5, null, null)).toEqual([0, 0.5, 1.5]);
  });

  it('WG-CLAMP-002: a P3 primary in the 709 working space is left untouched', () => {
    const w = applyMat3(Array.from(M.P3_TO_SRGB), 1, 0, 0);
    expect(w[1]).toBeLessThan(0);
    const c = clampToSourceGamut(...w, M.P3_TO_SRGB, INV.SRGB_TO_P3);
    c.forEach((v, i) => expect(v).toBeCloseTo(w[i]!, 6));
  });

  it('WG-CLAMP-003: a BT.2020 primary survives; a 709 clamp would not', () => {
    const w = applyMat3(Array.from(M.REC2020_TO_SRGB), 0, 1, 0);
    const c = clampToSourceGamut(...w, M.REC2020_TO_SRGB, INV.SRGB_TO_REC2020);
    c.forEach((v, i) => expect(v).toBeCloseTo(w[i]!, 6));
    const naive = clampToSourceGamut(...w, null, null);
    expect(naive[0]).toBe(0);
    expect(w[0]).toBeLessThan(-0.5);
  });

  it('WG-CLAMP-004: values negative in the source primaries are clamped there', () => {
    // A colour below the P3 gamut (negative P3 green) returns non-negative in P3.
    const w = applyMat3(Array.from(M.P3_TO_SRGB), 0.5, -0.1, 0.2);
    const c = clampToSourceGamut(...w, M.P3_TO_SRGB, INV.SRGB_TO_P3);
    const backInP3 = applyMat3(Array.from(INV.SRGB_TO_P3), ...c);
    expect(backInP3[0]).toBeCloseTo(0.5, 5);
    expect(backInP3[1]).toBeCloseTo(0, 5);
    expect(backInP3[2]).toBeCloseTo(0.2, 5);
  });
});

describe('WG-HSL: HDR-safe HSL for vibrance and the HSL qualifier', () => {
  it('WG-HSL-001: SDR colours use a scale of exactly 1 (unchanged HSL)', () => {
    const [scale, h, s, l] = hdrNormalizedHsl(0.8, 0.3, 0.5);
    expect(scale).toBe(1);
    expect([h, s, l]).toEqual(rgbToHsl(0.8, 0.3, 0.5));
  });

  it('WG-HSL-002: HDR colours keep their hue (no [0,1] clamp)', () => {
    const [scale, h] = hdrNormalizedHsl(4, 2, 0.3);
    expect(scale).toBe(4);
    const [clampedH] = rgbToHsl(1, 1, 0.3);
    expect(clampedH).toBeCloseTo(60, 5);
    expect(h).toBeCloseTo(rgbToHsl(1, 0.5, 0.075)[0], 6);
    expect(h).toBeLessThan(35);
  });

  it('WG-HSL-003: negative components are clamped for the hue math', () => {
    const [scale, , , l] = hdrNormalizedHsl(0.5, -0.2, 0.1);
    expect(scale).toBe(1);
    expect(l).toBeCloseTo(0.25, 6);
  });

  it('WG-HSL-004: vibrance on SDR values matches the [0,1]-clamped formula', () => {
    const [h, s, l] = rgbToHsl(0.6, 0.45, 0.4);
    const newS = Math.min(1, s + 0.3 * (1 - s * 0.5));
    const expected = hslToRgb(h, newS, l);
    const got = applyVibrance(0.6, 0.45, 0.4, 0.3);
    got.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 6));
  });

  it('WG-HSL-005: vibrance keeps HDR values above 1.0', () => {
    const got = applyVibrance(4, 2, 1, -0.5);
    expect(Math.max(...got)).toBeGreaterThan(3);
    // Desaturated: the channel spread shrinks.
    expect(got[0] - got[2]).toBeLessThan(3);
    // Equivalent to vibrance on the normalised colour, scaled back up.
    const sdr = applyVibrance(1, 0.5, 0.25, -0.5);
    got.forEach((v, i) => expect(v).toBeCloseTo(sdr[i]! * 4, 6));
  });

  it('WG-HSL-006: HSL qualifier correction keeps HDR values above 1.0', () => {
    const got = applyHSLQualifierCorrection(3, 0.6, 0.3, 1, 0, 0.5, 1);
    expect(got[0]).toBeGreaterThan(2);
    const sdr = applyHSLQualifierCorrection(1, 0.2, 0.1, 1, 0, 0.5, 1);
    got.forEach((v, i) => expect(v).toBeCloseTo(sdr[i]! * 3, 6));
  });

  it('WG-HSL-007: HSL qualifier passes unmatched pixels through untouched', () => {
    expect(applyHSLQualifierCorrection(5, -0.1, 0.2, 0, 30, 2, 2)).toEqual([5, -0.1, 0.2]);
  });
});

describe('WG-GAMUT: gamut mapping in the working space', () => {
  it('WG-GAMUT-001: tagged in-gamut P3 colour passes through (no second conversion)', () => {
    const w = applyMat3(Array.from(M.P3_TO_SRGB), 0.6, 0.5, 0.4);
    const out = applyGamutMappingWorking(w, null, null, null, 'clip');
    out.forEach((v, i) => expect(v).toBeCloseTo(w[i]!, 6));
  });

  it('WG-GAMUT-002: untagged P3 red clips to 709 red', () => {
    const out = applyGamutMappingWorking([1, 0, 0], M.P3_TO_SRGB, null, null, 'clip');
    expect(out).toEqual([1, 0, 0]);
  });

  it('WG-GAMUT-003: BT.2020 green maps onto the P3 gamut boundary', () => {
    const w = applyMat3(Array.from(M.REC2020_TO_SRGB), 0, 1, 0);
    const out = applyGamutMappingWorking(w, null, M.SRGB_TO_P3, M.P3_TO_SRGB, 'clip');
    const inP3 = applyMat3(Array.from(M.SRGB_TO_P3), ...out);
    inP3.forEach((v) => expect(v).toBeGreaterThan(-2e-3));
    inP3.forEach((v) => expect(v).toBeLessThan(1 + 2e-3));
    // Still outside 709: a wide-gamut output keeps the extra saturation.
    expect(Math.min(...out)).toBeLessThan(-0.01);
  });

  it('WG-GAMUT-004: the range ceiling follows HDR headroom', () => {
    expect(applyGamutMappingWorking([3, 3, 3], null, null, null, 'clip', 4)).toEqual([3, 3, 3]);
    expect(applyGamutMappingWorking([3, 3, 3], null, null, null, 'clip', 1)).toEqual([1, 1, 1]);
    const c = applyGamutMappingWorking([2, 2, 2], null, null, null, 'compress', 4);
    c.forEach((v) => expect(v).toBeCloseTo(2, 6));
  });
});
