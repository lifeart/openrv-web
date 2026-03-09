/**
 * Cross-ecosystem tests for LUT interpolation, premultiply/unpremultiply,
 * and HSL qualifier.
 *
 * Verifies mathematical consistency between the TypeScript reference
 * implementations (ported from GLSL/WGSL) and CPU implementations.
 *
 * Test ID convention: XE-LUT3D-NNN, XE-LUT1D-NNN, XE-PREMULT-NNN, XE-QUAL-NNN
 */

import { describe, it, expect } from 'vitest';
import {
  applyLUT3DTrilinear,
  premultiplyAlpha,
  unpremultiplyAlpha,
  hslQualifierMatte,
  apply1DCurvesLUT,
} from './shaderMathReference';

// CPU implementations for cross-verification
import { applyLUT3D } from '../../color/LUTLoader';
import { applyLUT3DTetrahedral } from '../../color/TetrahedralInterp';
import type { LUT3D } from '../../color/LUTLoader';

// Precision (number of decimal digits for toBeCloseTo)
const PREMULT_DIGITS = 10;
const QUAL_DIGITS = 5;

// =============================================================================
// Helpers: Generate test LUTs
// =============================================================================

/**
 * Create an identity 3D LUT in RGBA format (for applyLUT3DTrilinear).
 * Each texel at grid position (r, g, b) outputs the normalized (r, g, b) color.
 */
function createIdentityLUT_RGBA(size: number): Float32Array {
  const data = new Float32Array(size * size * size * 4);
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const idx = (bi * size * size + gi * size + ri) * 4;
        data[idx] = ri / (size - 1);
        data[idx + 1] = gi / (size - 1);
        data[idx + 2] = bi / (size - 1);
        data[idx + 3] = 1.0;
      }
    }
  }
  return data;
}

/**
 * Create an identity 3D LUT in RGB format (for CPU LUTLoader/TetrahedralInterp).
 * Data layout: R varies fastest (inner loop), then G, then B.
 */
function createIdentityLUT3D(size: number): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  for (let ri = 0; ri < size; ri++) {
    for (let gi = 0; gi < size; gi++) {
      for (let bi = 0; bi < size; bi++) {
        const idx = (ri * size * size + gi * size + bi) * 3;
        data[idx] = ri / (size - 1);
        data[idx + 1] = gi / (size - 1);
        data[idx + 2] = bi / (size - 1);
      }
    }
  }
  return {
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

/**
 * Create a non-identity 3D LUT that applies a color transform.
 * Each output = input^2 (gamma 2.0 per channel).
 */
function createGammaLUT_RGBA(size: number): Float32Array {
  const data = new Float32Array(size * size * size * 4);
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const idx = (bi * size * size + gi * size + ri) * 4;
        const rn = ri / (size - 1);
        const gn = gi / (size - 1);
        const bn = bi / (size - 1);
        data[idx] = rn * rn;
        data[idx + 1] = gn * gn;
        data[idx + 2] = bn * bn;
        data[idx + 3] = 1.0;
      }
    }
  }
  return data;
}

/**
 * Create an identity 1D curves LUT (RGBA texture data).
 * Identity: per-channel curves are identity, master curve is also identity.
 */
function createIdentityCurvesLUT(width: number): Float32Array {
  const data = new Float32Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = i / (width - 1);
    data[i * 4] = v;       // R channel curve
    data[i * 4 + 1] = v;   // G channel curve
    data[i * 4 + 2] = v;   // B channel curve
    data[i * 4 + 3] = v;   // Master curve (alpha)
  }
  return data;
}

/**
 * Create a gamma 2.2 curves LUT (RGBA texture data).
 * Each channel: output = pow(input, 2.2)
 * Master curve: identity
 */
function createGammaCurvesLUT(width: number): Float32Array {
  const data = new Float32Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = i / (width - 1);
    const gv = Math.pow(v, 2.2);
    data[i * 4] = gv;       // R
    data[i * 4 + 1] = gv;   // G
    data[i * 4 + 2] = gv;   // B
    data[i * 4 + 3] = v;    // Master = identity
  }
  return data;
}

// =============================================================================
// 3D LUT Trilinear (XE-LUT3D-NNN)
// =============================================================================

describe('3D LUT Trilinear Interpolation', () => {
  const size = 17;
  const identityRGBA = createIdentityLUT_RGBA(size);
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];

  it('XE-LUT3D-001: Identity LUT preserves input', () => {
    const testColors: [number, number, number][] = [
      [0.0, 0.0, 0.0],
      [1.0, 1.0, 1.0],
      [0.5, 0.5, 0.5],
      [0.25, 0.75, 0.1],
      [0.8, 0.2, 0.6],
    ];

    for (const [r, g, b] of testColors) {
      const [outR, outG, outB] = applyLUT3DTrilinear(
        r, g, b, identityRGBA, size, domainMin, domainMax, 1.0,
      );
      expect(outR).toBeCloseTo(r, 4);
      expect(outG).toBeCloseTo(g, 4);
      expect(outB).toBeCloseTo(b, 4);
    }
  });

  it('XE-LUT3D-002: Domain [0.1, 0.9] correctly remaps', () => {
    const dMin: [number, number, number] = [0.1, 0.1, 0.1];
    const dMax: [number, number, number] = [0.9, 0.9, 0.9];

    // Input at domain min should map to (0,0,0) in LUT, which outputs (0,0,0)
    const [r0, g0, b0] = applyLUT3DTrilinear(
      0.1, 0.1, 0.1, identityRGBA, size, dMin, dMax, 1.0,
    );
    expect(r0).toBeCloseTo(0.0, 4);
    expect(g0).toBeCloseTo(0.0, 4);
    expect(b0).toBeCloseTo(0.0, 4);

    // Input at domain max should map to (1,1,1) in LUT, which outputs (1,1,1)
    const [r1, g1, b1] = applyLUT3DTrilinear(
      0.9, 0.9, 0.9, identityRGBA, size, dMin, dMax, 1.0,
    );
    expect(r1).toBeCloseTo(1.0, 4);
    expect(g1).toBeCloseTo(1.0, 4);
    expect(b1).toBeCloseTo(1.0, 4);

    // Input at domain midpoint should map to (0.5, 0.5, 0.5)
    const [rm, gm, bm] = applyLUT3DTrilinear(
      0.5, 0.5, 0.5, identityRGBA, size, dMin, dMax, 1.0,
    );
    expect(rm).toBeCloseTo(0.5, 4);
    expect(gm).toBeCloseTo(0.5, 4);
    expect(bm).toBeCloseTo(0.5, 4);
  });

  it('XE-LUT3D-003: Intensity=0 returns original color; intensity=1 returns full LUT', () => {
    const gammaRGBA = createGammaLUT_RGBA(size);
    const input: [number, number, number] = [0.5, 0.5, 0.5];

    // Intensity 0: should return original
    const [r0, g0, b0] = applyLUT3DTrilinear(
      ...input, gammaRGBA, size, domainMin, domainMax, 0.0,
    );
    expect(r0).toBeCloseTo(0.5, 5);
    expect(g0).toBeCloseTo(0.5, 5);
    expect(b0).toBeCloseTo(0.5, 5);

    // Intensity 1: should return LUT value (0.5^2 = 0.25)
    const [r1, g1, b1] = applyLUT3DTrilinear(
      ...input, gammaRGBA, size, domainMin, domainMax, 1.0,
    );
    expect(r1).toBeCloseTo(0.25, 3);
    expect(g1).toBeCloseTo(0.25, 3);
    expect(b1).toBeCloseTo(0.25, 3);

    // Intensity 0.5: should blend halfway
    const [rh, gh, bh] = applyLUT3DTrilinear(
      ...input, gammaRGBA, size, domainMin, domainMax, 0.5,
    );
    expect(rh).toBeCloseTo(0.375, 3);
    expect(gh).toBeCloseTo(0.375, 3);
    expect(bh).toBeCloseTo(0.375, 3);
  });

  it('XE-LUT3D-004: Corner values (0,0,0) and (1,1,1) match LUT entries exactly', () => {
    const gammaRGBA = createGammaLUT_RGBA(size);

    // (0,0,0) -> 0^2 = 0
    const [r0, g0, b0] = applyLUT3DTrilinear(
      0, 0, 0, gammaRGBA, size, domainMin, domainMax, 1.0,
    );
    expect(r0).toBeCloseTo(0.0, 10);
    expect(g0).toBeCloseTo(0.0, 10);
    expect(b0).toBeCloseTo(0.0, 10);

    // (1,1,1) -> 1^2 = 1
    const [r1, g1, b1] = applyLUT3DTrilinear(
      1, 1, 1, gammaRGBA, size, domainMin, domainMax, 1.0,
    );
    expect(r1).toBeCloseTo(1.0, 10);
    expect(g1).toBeCloseTo(1.0, 10);
    expect(b1).toBeCloseTo(1.0, 10);
  });

  it('XE-LUT3D-005: Mid-point interpolation between neighbors', () => {
    // For a size-3 LUT, grid points are at 0, 0.5, 1.0
    // Input 0.25 should be midway between grid 0 and grid 0.5
    const smallSize = 3;
    const smallLUT = createGammaLUT_RGBA(smallSize);

    // At 0.25: midway between grid[0]=0 (output 0^2=0) and grid[1]=0.5 (output 0.5^2=0.25)
    // Trilinear: lerp(0.0, 0.25, 0.5) = 0.125
    const [r, g, b] = applyLUT3DTrilinear(
      0.25, 0.25, 0.25, smallLUT, smallSize, domainMin, domainMax, 1.0,
    );
    expect(r).toBeCloseTo(0.125, 4);
    expect(g).toBeCloseTo(0.125, 4);
    expect(b).toBeCloseTo(0.125, 4);
  });

  it('XE-LUT3D-006: Cross-check CPU TetrahedralInterp produces similar results', () => {
    // Both trilinear and tetrahedral should agree on identity LUT
    const cpuLut = createIdentityLUT3D(size);
    const testColors: [number, number, number][] = [
      [0.3, 0.5, 0.7],
      [0.1, 0.9, 0.4],
      [0.6, 0.2, 0.8],
    ];

    for (const [r, g, b] of testColors) {
      const trilinear = applyLUT3DTrilinear(
        r, g, b, identityRGBA, size, domainMin, domainMax, 1.0,
      );
      const tetrahedral = applyLUT3DTetrahedral(cpuLut, r, g, b);
      const cpuTrilinear = applyLUT3D(cpuLut, r, g, b);

      // All three methods should agree on identity LUT
      expect(trilinear[0]).toBeCloseTo(tetrahedral[0], 3);
      expect(trilinear[1]).toBeCloseTo(tetrahedral[1], 3);
      expect(trilinear[2]).toBeCloseTo(tetrahedral[2], 3);

      expect(trilinear[0]).toBeCloseTo(cpuTrilinear[0], 3);
      expect(trilinear[1]).toBeCloseTo(cpuTrilinear[1], 3);
      expect(trilinear[2]).toBeCloseTo(cpuTrilinear[2], 3);
    }
  });
});

// =============================================================================
// 1D Curves LUT (XE-LUT1D-NNN)
// =============================================================================

describe('1D Curves LUT', () => {
  it('XE-LUT1D-001: Identity curve produces identity output', () => {
    const width = 256;
    const lutData = createIdentityCurvesLUT(width);

    const testValues: [number, number, number][] = [
      [0.0, 0.0, 0.0],
      [1.0, 1.0, 1.0],
      [0.5, 0.5, 0.5],
      [0.25, 0.75, 0.1],
    ];

    for (const [r, g, b] of testValues) {
      const [outR, outG, outB] = apply1DCurvesLUT(r, g, b, lutData, width);
      expect(outR).toBeCloseTo(r, 4);
      expect(outG).toBeCloseTo(g, 4);
      expect(outB).toBeCloseTo(b, 4);
    }
  });

  it('XE-LUT1D-002: Gamma curve (pow(x, 2.2)) produces expected output', () => {
    const width = 256;
    const lutData = createGammaCurvesLUT(width);

    // The per-channel curves apply pow(x, 2.2), then master is identity
    // So final output should be approximately pow(x, 2.2)
    const testInputs = [0.0, 0.25, 0.5, 0.75, 1.0];
    for (const v of testInputs) {
      const expected = Math.pow(v, 2.2);
      const [outR] = apply1DCurvesLUT(v, v, v, lutData, width);
      // Allow small tolerance due to LUT quantization
      expect(outR).toBeCloseTo(expected, 2);
    }
  });

  it('XE-LUT1D-003: Clamp behavior at boundaries', () => {
    const width = 256;
    const lutData = createIdentityCurvesLUT(width);

    // Values below 0 should be clamped to 0 for LUT lookup
    const [rLow] = apply1DCurvesLUT(-0.5, 0.5, 0.5, lutData, width);
    expect(rLow).toBeCloseTo(-0.5, 4); // excess = -0.5, clamped lookup = 0, result = 0 + (-0.5) = -0.5

    // Values above 1 should be clamped to 1 for LUT lookup, excess preserved
    const [rHigh] = apply1DCurvesLUT(1.5, 0.5, 0.5, lutData, width);
    expect(rHigh).toBeCloseTo(1.5, 4); // excess = 0.5, clamped lookup = 1.0, result = 1.0 + 0.5 = 1.5
  });
});

// =============================================================================
// Premultiply / Unpremultiply (XE-PREMULT-NNN)
// =============================================================================

describe('Premultiply / Unpremultiply Alpha', () => {
  it('XE-PREMULT-001: Premultiply with alpha=1 is identity', () => {
    const [r, g, b, a] = premultiplyAlpha(0.5, 0.7, 0.3, 1.0);
    expect(r).toBeCloseTo(0.5, PREMULT_DIGITS);
    expect(g).toBeCloseTo(0.7, PREMULT_DIGITS);
    expect(b).toBeCloseTo(0.3, PREMULT_DIGITS);
    expect(a).toBeCloseTo(1.0, PREMULT_DIGITS);
  });

  it('XE-PREMULT-002: Premultiply with alpha=0.5 halves RGB', () => {
    const [r, g, b, a] = premultiplyAlpha(0.8, 0.6, 0.4, 0.5);
    expect(r).toBeCloseTo(0.4, 10);
    expect(g).toBeCloseTo(0.3, 10);
    expect(b).toBeCloseTo(0.2, 10);
    expect(a).toBeCloseTo(0.5, 10);
  });

  it('XE-PREMULT-003: Unpremultiply with alpha=0.5 doubles RGB', () => {
    const [r, g, b, a] = unpremultiplyAlpha(0.4, 0.3, 0.2, 0.5);
    expect(r).toBeCloseTo(0.8, 10);
    expect(g).toBeCloseTo(0.6, 10);
    expect(b).toBeCloseTo(0.4, 10);
    expect(a).toBeCloseTo(0.5, 10);
  });

  it('XE-PREMULT-004: Unpremultiply with alpha=0 returns (0,0,0,0), no division by zero', () => {
    const [r, g, b, a] = unpremultiplyAlpha(0.5, 0.7, 0.3, 0.0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(0.0);
  });

  it('XE-PREMULT-005: Premultiply then unpremultiply is a roundtrip', () => {
    const origR = 0.8,
      origG = 0.6,
      origB = 0.4,
      origA = 0.7;
    const [pR, pG, pB, pA] = premultiplyAlpha(origR, origG, origB, origA);
    const [uR, uG, uB, uA] = unpremultiplyAlpha(pR, pG, pB, pA);
    expect(uR).toBeCloseTo(origR, 10);
    expect(uG).toBeCloseTo(origG, 10);
    expect(uB).toBeCloseTo(origB, 10);
    expect(uA).toBeCloseTo(origA, 10);
  });
});

// =============================================================================
// HSL Qualifier (XE-QUAL-NNN)
// =============================================================================

describe('HSL Qualifier Matte', () => {
  // Helper: wide-open qualifier that matches everything
  // hueCenter=180, hueWidth=360, hueSoftness=0
  // satCenter=50, satWidth=100, satSoftness=0
  // lumCenter=50, lumWidth=100, lumSoftness=0

  it('XE-QUAL-001: Pixel exactly matching qualifier returns matte=1.0', () => {
    // Qualifier centered on hue=120, width=60 (range 90-150)
    // satCenter=50, width=100 (range 0-100)
    // lumCenter=50, width=100 (range 0-100)
    const matte = hslQualifierMatte(
      120, 0.5, 0.5,    // pixel: h=120, s=0.5, l=0.5
      120, 60, 0,        // hue: center=120, width=60, softness=0
      50, 100, 0,        // sat: center=50, width=100, softness=0
      50, 100, 0,        // lum: center=50, width=100, softness=0
    );
    expect(matte).toBeCloseTo(1.0, QUAL_DIGITS);
  });

  it('XE-QUAL-002: Pixel outside all ranges returns matte=0.0', () => {
    // Qualifier for hue=120 with width=20 (range 110-130)
    // Pixel at hue=0 is well outside
    const matte = hslQualifierMatte(
      0, 0.5, 0.5,       // pixel: h=0
      120, 20, 0,          // hue: center=120, width=20, no softness
      50, 100, 0,          // sat: wide open
      50, 100, 0,          // lum: wide open
    );
    expect(matte).toBeCloseTo(0.0, QUAL_DIGITS);
  });

  it('XE-QUAL-003: Hue softness creates smooth falloff', () => {
    // Qualifier: hue center=120, width=40 (inner=20), softness=50 (outer=20+20=40)
    // Pixel at hue=135: hueDist=15, which is within inner (20) -> matte=1
    const matteInside = hslQualifierMatte(
      135, 0.5, 0.5,
      120, 40, 50,
      50, 100, 0,
      50, 100, 0,
    );
    expect(matteInside).toBeCloseTo(1.0, QUAL_DIGITS);

    // Pixel at hue=150: hueDist=30, which is in softness zone (20..40)
    const matteSoft = hslQualifierMatte(
      150, 0.5, 0.5,
      120, 40, 50,
      50, 100, 0,
      50, 100, 0,
    );
    expect(matteSoft).toBeGreaterThan(0.0);
    expect(matteSoft).toBeLessThan(1.0);

    // Pixel at hue=170: hueDist=50, which is outside outer (40) -> matte=0
    const matteOutside = hslQualifierMatte(
      170, 0.5, 0.5,
      120, 40, 50,
      50, 100, 0,
      50, 100, 0,
    );
    expect(matteOutside).toBeCloseTo(0.0, QUAL_DIGITS);
  });

  it('XE-QUAL-004: Circular hue wrapping (hueCenter=350, hueWidth=40 catches hue=10)', () => {
    // Qualifier: hueCenter=350, hueWidth=40 (range wraps: 330-10)
    // Pixel at hue=10: circular distance = |10-350| = 340, wrapped = 360-340 = 20
    // hueInner = 20, so hueDist(20) <= hueInner(20) -> match
    const matte = hslQualifierMatte(
      10, 0.5, 0.5,
      350, 40, 0,
      50, 100, 0,
      50, 100, 0,
    );
    expect(matte).toBeCloseTo(1.0, QUAL_DIGITS);

    // Pixel at hue=340: circular distance = |340-350| = 10
    // hueInner = 20, so 10 <= 20 -> match
    const matte2 = hslQualifierMatte(
      340, 0.5, 0.5,
      350, 40, 0,
      50, 100, 0,
      50, 100, 0,
    );
    expect(matte2).toBeCloseTo(1.0, QUAL_DIGITS);

    // Pixel at hue=180: circular distance = |180-350| = 170, no wrap needed
    // hueInner = 20, so 170 > 20 -> no match
    const matte3 = hslQualifierMatte(
      180, 0.5, 0.5,
      350, 40, 0,
      50, 100, 0,
      50, 100, 0,
    );
    expect(matte3).toBeCloseTo(0.0, QUAL_DIGITS);
  });

  it('XE-QUAL-005: Saturation range with softness', () => {
    // Qualifier: satCenter=50, satWidth=40 (range 30-70 in 0-100 scale)
    // softness=50 -> outer = 20 + 20 = 40
    // Pixel s=0.5 -> qS=50, satDist=0, inside -> match
    const matteInside = hslQualifierMatte(
      120, 0.5, 0.5,
      120, 360, 0,         // hue: wide open
      50, 40, 50,           // sat: center=50, width=40, softness=50
      50, 100, 0,           // lum: wide open
    );
    expect(matteInside).toBeCloseTo(1.0, QUAL_DIGITS);

    // Pixel s=0.25 -> qS=25, satDist=25, outside inner(20) but within outer(40)
    const matteSoft = hslQualifierMatte(
      120, 0.25, 0.5,
      120, 360, 0,
      50, 40, 50,
      50, 100, 0,
    );
    expect(matteSoft).toBeGreaterThan(0.0);
    expect(matteSoft).toBeLessThan(1.0);

    // Pixel s=0.0 -> qS=0, satDist=50, outside outer(40) -> no match
    const matteOutside = hslQualifierMatte(
      120, 0.0, 0.5,
      120, 360, 0,
      50, 40, 50,
      50, 100, 0,
    );
    expect(matteOutside).toBeCloseTo(0.0, QUAL_DIGITS);
  });

  it('XE-QUAL-006: Luminance range with softness', () => {
    // Qualifier: lumCenter=50, lumWidth=40 (range 30-70 in 0-100 scale)
    // softness=50 -> outer = 20 + 20 = 40
    // Pixel l=0.5 -> qL=50, lumDist=0, inside -> match
    const matteInside = hslQualifierMatte(
      120, 0.5, 0.5,
      120, 360, 0,
      50, 100, 0,
      50, 40, 50,           // lum: center=50, width=40, softness=50
    );
    expect(matteInside).toBeCloseTo(1.0, QUAL_DIGITS);

    // Pixel l=0.25 -> qL=25, lumDist=25, in softness zone
    const matteSoft = hslQualifierMatte(
      120, 0.5, 0.25,
      120, 360, 0,
      50, 100, 0,
      50, 40, 50,
    );
    expect(matteSoft).toBeGreaterThan(0.0);
    expect(matteSoft).toBeLessThan(1.0);

    // Pixel l=0.0 -> qL=0, lumDist=50, outside outer(40) -> no match
    const matteOutside = hslQualifierMatte(
      120, 0.5, 0.0,
      120, 360, 0,
      50, 100, 0,
      50, 40, 50,
    );
    expect(matteOutside).toBeCloseTo(0.0, QUAL_DIGITS);
  });
});
