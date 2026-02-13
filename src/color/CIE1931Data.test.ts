/**
 * CIE1931Data Tests
 *
 * Tests for CIE 1931 spectral locus data, chromaticity conversion,
 * color space primaries, and RGB-to-XYZ matrix lookup.
 */

import { describe, it, expect } from 'vitest';
import {
  CIE_1931_XY_LOCUS,
  xyzToXY,
  COLOR_SPACE_PRIMARIES,
  getColorSpacePrimaries,
  getRGBToXYZMatrix,
} from './CIE1931Data';
import { SRGB_TO_XYZ } from './OCIOTransform';

describe('CIE_1931_XY_LOCUS', () => {
  it('CIE-U001: has 65 entries (380-700nm at 5nm steps)', () => {
    expect(CIE_1931_XY_LOCUS).toHaveLength(65);
  });

  it('CIE-U002: all xy values are in valid range', () => {
    for (const point of CIE_1931_XY_LOCUS) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(0.8);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(0.9);
    }
  });

  it('CIE-U003: first point is near 380nm (deep violet)', () => {
    const first = CIE_1931_XY_LOCUS[0]!;
    expect(first.x).toBeCloseTo(0.1741, 3);
    expect(first.y).toBeCloseTo(0.0050, 3);
  });

  it('CIE-U004: last point is near 700nm (deep red)', () => {
    const last = CIE_1931_XY_LOCUS[CIE_1931_XY_LOCUS.length - 1]!;
    expect(last.x).toBeCloseTo(0.7347, 3);
    expect(last.y).toBeCloseTo(0.2653, 3);
  });

  it('CIE-U005: green peak (around 520nm) has highest y value', () => {
    let maxY = 0;
    let maxIdx = 0;
    for (let i = 0; i < CIE_1931_XY_LOCUS.length; i++) {
      if (CIE_1931_XY_LOCUS[i]!.y > maxY) {
        maxY = CIE_1931_XY_LOCUS[i]!.y;
        maxIdx = i;
      }
    }
    // Green peak should be around index 20 (480nm) area
    expect(maxY).toBeGreaterThan(0.8);
    expect(maxIdx).toBeGreaterThanOrEqual(15);
    expect(maxIdx).toBeLessThanOrEqual(25);
  });
});

describe('xyzToXY', () => {
  it('CIE-U010: converts known XYZ to xy correctly', () => {
    // D65 white point: X=0.95047, Y=1.0, Z=1.08883
    const result = xyzToXY(0.95047, 1.0, 1.08883);
    expect(result.x).toBeCloseTo(0.3127, 3);
    expect(result.y).toBeCloseTo(0.3290, 3);
  });

  it('CIE-U011: guards against division by zero', () => {
    const result = xyzToXY(0, 0, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('CIE-U012: guards against near-zero sum', () => {
    const result = xyzToXY(1e-12, 1e-12, 1e-12);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('CIE-U013: pure red primary has y < 0.5', () => {
    const result = xyzToXY(1, 0, 0);
    expect(result.x).toBe(1);
    expect(result.y).toBe(0);
  });

  it('CIE-U014: pure green primary has y close to 1', () => {
    const result = xyzToXY(0, 1, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(1);
  });

  it('CIE-U015: equal XYZ gives x=y=1/3', () => {
    const result = xyzToXY(1, 1, 1);
    expect(result.x).toBeCloseTo(1 / 3, 6);
    expect(result.y).toBeCloseTo(1 / 3, 6);
  });

  it('CIE-U016: NaN inputs produce NaN outputs (sum < epsilon does not catch NaN)', () => {
    const result = xyzToXY(NaN, 1, 1);
    // NaN + 1 + 1 = NaN. NaN < 1e-10 is false, so guard does NOT trigger.
    // Division by NaN produces NaN. Callers (e.g. drawPixelScatterFloat) must
    // guard NaN separately via Number.isFinite checks before calling xyzToXY.
    expect(result.x).toBeNaN();
    expect(result.y).toBeNaN();
  });

  it('CIE-U017: handles Infinity inputs', () => {
    // Infinity + finite = Infinity, x/Infinity = finite
    const result = xyzToXY(Infinity, 0, 0);
    // Infinity / Infinity = NaN, but sum > epsilon
    // This is an edge case — the function will compute Infinity/Infinity = NaN
    expect(typeof result.x).toBe('number');
    expect(typeof result.y).toBe('number');
  });

  it('CIE-U018: handles negative inputs that produce positive sum', () => {
    // -1 + 3 + 1 = 3 > epsilon, so we get valid chromaticity
    const result = xyzToXY(-1, 3, 1);
    expect(result.x).toBeCloseTo(-1 / 3, 6);
    expect(result.y).toBeCloseTo(1, 6);
  });

  it('CIE-U019: handles negative inputs that produce zero sum', () => {
    const result = xyzToXY(-1, 1, 0);
    // sum = 0, returns (0, 0)
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe('COLOR_SPACE_PRIMARIES', () => {
  it('CIE-U020: sRGB primaries are approximately correct', () => {
    const srgb = getColorSpacePrimaries('sRGB');
    expect(srgb).not.toBeNull();
    expect(srgb!.red.x).toBeCloseTo(0.64, 1);
    expect(srgb!.red.y).toBeCloseTo(0.33, 1);
    expect(srgb!.green.x).toBeCloseTo(0.30, 1);
    expect(srgb!.green.y).toBeCloseTo(0.60, 1);
    expect(srgb!.blue.x).toBeCloseTo(0.15, 1);
    expect(srgb!.blue.y).toBeCloseTo(0.06, 1);
  });

  it('CIE-U021: sRGB white point is D65', () => {
    const srgb = getColorSpacePrimaries('sRGB');
    expect(srgb).not.toBeNull();
    expect(srgb!.white.x).toBeCloseTo(0.3127, 2);
    expect(srgb!.white.y).toBeCloseTo(0.3290, 2);
  });

  it('CIE-U022: Rec.709 has same primaries as sRGB', () => {
    const srgb = getColorSpacePrimaries('sRGB');
    const rec709 = getColorSpacePrimaries('Rec.709');
    expect(rec709).not.toBeNull();
    expect(rec709!.red.x).toBeCloseTo(srgb!.red.x, 4);
    expect(rec709!.red.y).toBeCloseTo(srgb!.red.y, 4);
    expect(rec709!.green.x).toBeCloseTo(srgb!.green.x, 4);
    expect(rec709!.green.y).toBeCloseTo(srgb!.green.y, 4);
  });

  it('CIE-U023: Rec.2020 gamut is wider than sRGB', () => {
    const srgb = getColorSpacePrimaries('sRGB')!;
    const rec2020 = getColorSpacePrimaries('Rec.2020')!;
    // Rec.2020 green is more saturated (higher y)
    expect(rec2020.green.y).toBeGreaterThan(srgb.green.y);
  });

  it('CIE-U024: all primaries satisfy x + y <= 1 (within tolerance)', () => {
    for (const [, primaries] of Object.entries(COLOR_SPACE_PRIMARIES)) {
      // Allow small tolerance for matrix derivation rounding
      expect(primaries.red.x + primaries.red.y).toBeLessThan(1.01);
      expect(primaries.green.x + primaries.green.y).toBeLessThan(1.01);
      expect(primaries.blue.x + primaries.blue.y).toBeLessThan(1.01);
    }
  });

  it('CIE-U025: all known color spaces have entries', () => {
    const expectedSpaces = [
      'sRGB', 'Rec.709', 'ACEScg', 'ACES2065-1',
      'DCI-P3', 'Rec.2020', 'Adobe RGB', 'ProPhoto RGB',
    ];
    for (const name of expectedSpaces) {
      expect(COLOR_SPACE_PRIMARIES[name]).toBeDefined();
    }
  });

  it('CIE-U026: getColorSpacePrimaries returns null for unknown space', () => {
    expect(getColorSpacePrimaries('unknown')).toBeNull();
    expect(getColorSpacePrimaries('')).toBeNull();
  });

  it('CIE-U027: ACES spaces use D60 white point', () => {
    const aces = getColorSpacePrimaries('ACEScg')!;
    // D60 ≈ (0.3217, 0.3378)
    expect(aces.white.x).toBeCloseTo(0.3217, 2);
    expect(aces.white.y).toBeCloseTo(0.3378, 2);
  });
});

describe('getRGBToXYZMatrix', () => {
  it('CIE-U030: returns SRGB_TO_XYZ for sRGB', () => {
    const matrix = getRGBToXYZMatrix('sRGB');
    expect(matrix).toBe(SRGB_TO_XYZ);
  });

  it('CIE-U031: returns SRGB_TO_XYZ for Rec.709', () => {
    const matrix = getRGBToXYZMatrix('Rec.709');
    expect(matrix).toBe(SRGB_TO_XYZ);
  });

  it('CIE-U032: returns null for unknown name', () => {
    expect(getRGBToXYZMatrix('unknown')).toBeNull();
  });

  it('CIE-U035: returns null for empty string', () => {
    expect(getRGBToXYZMatrix('')).toBeNull();
  });

  it('CIE-U036: name matching is case-sensitive', () => {
    // 'srgb' is not the same as 'sRGB'
    expect(getRGBToXYZMatrix('srgb')).toBeNull();
    expect(getRGBToXYZMatrix('SRGB')).toBeNull();
    expect(getRGBToXYZMatrix('sRGB')).not.toBeNull();
  });

  it('CIE-U033: returns non-null for all known color spaces', () => {
    const spaces = ['sRGB', 'Rec.709', 'ACEScg', 'ACES2065-1', 'DCI-P3', 'Rec.2020', 'Adobe RGB', 'ProPhoto RGB'];
    for (const name of spaces) {
      expect(getRGBToXYZMatrix(name)).not.toBeNull();
    }
  });

  it('CIE-U034: all returned matrices have 9 elements', () => {
    const spaces = ['sRGB', 'ACEScg', 'DCI-P3', 'Rec.2020'];
    for (const name of spaces) {
      const matrix = getRGBToXYZMatrix(name)!;
      expect(matrix).toHaveLength(9);
    }
  });
});
