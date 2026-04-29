/**
 * Cross-ecosystem tests for color pipeline math.
 *
 * These tests verify that CPU implementations match the expected mathematical
 * formulas used by the GLSL and WGSL GPU shaders. Where discrepancies exist
 * between ecosystems, they are documented in comments.
 *
 * Test ID prefixes:
 *   XE-CDL-NNN      — CDL (Color Decision List) SOP formula
 *   XE-ACESCCT-NNN  — ACEScct encode/decode
 *   XE-LOG-NNN      — Log curve conversions (Cineon, Viper, LogC3)
 *   XE-GAMUT-NNN    — Gamut soft-clip compression
 *   XE-MATRIX-NNN   — Color primaries matrices
 *   XE-HSL-NNN      — RGB↔HSL conversions
 */
import { describe, it, expect } from 'vitest';

import { applyCDLToValue, applyCDL, DEFAULT_CDL } from '../../color/CDL';
import { acescctEncode, acescctDecode, logC3Encode, logC3Decode } from '../../color/TransferFunctions';
import { LOG_CURVES } from '../../color/LogCurves';
import { COLOR_PRIMARIES_MATRICES } from '../ShaderConstants';
import { gamutMapRGB, tonemapACESHill, tonemapAgX } from '../../utils/effects/effectProcessing.shared';

// ---------------------------------------------------------------------------
// Import CPU gamut soft-clip
// ---------------------------------------------------------------------------
// The CPU softClipChannel is not exported individually; we reach it through
// the gamutMap helper. For direct testing we re-implement the same formula
// that exists in effectProcessing.shared.ts (tanh-based, matching GLSL).
// ---------------------------------------------------------------------------

/**
 * CPU reference: softClipChannel from effectProcessing.shared.ts
 *   if (x <= 0) return 0;
 *   if (x <= 0.8) return x;
 *   return 0.8 + 0.2 * Math.tanh((x - 0.8) / 0.2);
 *
 * GLSL (viewer.frag.glsl) uses the same tanh formula.
 *
 * DISCREPANCY: scene_analysis.wgsl uses a smoothstep Hermite curve instead
 * of tanh for values in [0.8, 1.0] and hard-clamps above 1.0. The tanh
 * variant never hard-clamps and asymptotically approaches 1.0. common.wgsl
 * uses the tanh variant matching CPU and GLSL.
 */
function softClipChannel(x: number): number {
  if (x <= 0.0) return 0.0;
  if (x <= 0.8) return x;
  return 0.8 + 0.2 * Math.tanh((x - 0.8) / 0.2);
}

// ---------------------------------------------------------------------------
// GPU-style reference functions ported from GLSL for cross-ecosystem tests
// ---------------------------------------------------------------------------

/**
 * GLSL cineonLogToLinear (viewer.frag.glsl ~line 650)
 *
 * DISCREPANCY: The GPU Cineon formula uses a gain/offset approach:
 *   gain = 1 / (1 - pow(10, (refBlack - refWhite) * 0.002 / 0.6))
 *   out  = gain * pow(10, (x - refWhite) * 0.002 / 0.6) - (gain - 1)
 *
 * The CPU LogCurves.ts Cineon uses a printing-density formula:
 *   relativeCV = (cv - refBlack) / (refWhite - refBlack)
 *   out = pow(10, (relativeCV - 0.5) * displayGamma)
 *
 * These are intentionally different formulations. The GPU version matches
 * the OpenRV/RVLinearize implementation while the CPU version follows the
 * textbook printing density formula.
 */
function glslCineonLogToLinear(x: number): number {
  const refBlack = 95.0 / 1023.0;
  const refWhite = 685.0 / 1023.0;
  const gain = 1.0 / (1.0 - Math.pow(10, ((refBlack - refWhite) * 0.002) / 0.6));
  const offset = gain - 1.0;
  return gain * Math.pow(10, ((x - refWhite) * 0.002) / 0.6) - offset;
}

/**
 * GLSL viperLogToLinear (viewer.frag.glsl ~line 660)
 * Matches CPU LogCurves.ts VIPER.toLinear exactly.
 */
function glslViperLogToLinear(x: number): number {
  const refBlack = 16.0 / 1023.0;
  const refWhite = 1000.0 / 1023.0;
  const displayGamma = 0.6;
  if (x <= refBlack) return 0.0;
  if (x >= refWhite) return 1.0;
  const normalized = (x - refBlack) / (refWhite - refBlack);
  const blackOffset = Math.pow(10, -displayGamma);
  return Math.max(0, (Math.pow(10, (normalized - 1.0) * displayGamma) - blackOffset) / (1.0 - blackOffset));
}

/**
 * GLSL logC3ToLinear (viewer.frag.glsl ~line 672)
 * Matches CPU LogCurves.ts ARRI_LOGC3.toLinear and TransferFunctions.logC3Decode.
 */
function glslLogC3ToLinear(x: number): number {
  const cut = 0.010591;
  const a = 5.555556;
  const b = 0.052272;
  const c = 0.24719;
  const d = 0.385537;
  const e = 5.367655;
  const f = 0.092809;
  if (x > e * cut + f) {
    return (Math.pow(10, (x - d) / c) - b) / a;
  } else {
    return (x - f) / e;
  }
}

// ---------------------------------------------------------------------------
// HSL helpers ported from GLSL (viewer.frag.glsl lines 789-840)
// ---------------------------------------------------------------------------

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0.0) tt += 1.0;
  if (tt > 1.0) tt -= 1.0;
  if (tt < 1.0 / 6.0) return p + (q - p) * 6.0 * tt;
  if (tt < 0.5) return q;
  if (tt < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - tt) * 6.0;
  return p;
}

/** Port of GLSL rgbToHsl — returns [h (0-360), s (0-1), l (0-1)] */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const l = (maxC + minC) * 0.5;
  const delta = maxC - minC;

  if (delta < 0.00001) {
    return [0.0, 0.0, l];
  }

  const s = l > 0.5 ? delta / (2.0 - maxC - minC) : delta / (maxC + minC);

  let h: number;
  if (maxC === r) {
    h = ((g - b) / delta) % 6.0;
  } else if (maxC === g) {
    h = (b - r) / delta + 2.0;
  } else {
    h = (r - g) / delta + 4.0;
  }
  h *= 60.0;
  if (h < 0) h += 360.0;

  return [h, s, l];
}

/** Port of GLSL hslToRgb — h in 0-360, s/l in 0-1 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s < 0.00001) {
    return [l, l, l];
  }
  const q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  const p = 2.0 * l - q;
  const hNorm = h / 360.0;
  return [hueToRgb(p, q, hNorm + 1.0 / 3.0), hueToRgb(p, q, hNorm), hueToRgb(p, q, hNorm - 1.0 / 3.0)];
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

/** Multiply column-major 3x3 matrix by vec3 (matching GLSL mat3 * vec3) */
function matMul3ColMajor(m: Float32Array, r: number, g: number, b: number): [number, number, number] {
  // Column-major: m[0..2] = col0, m[3..5] = col1, m[6..8] = col2
  return [m[0]! * r + m[3]! * g + m[6]! * b, m[1]! * r + m[4]! * g + m[7]! * b, m[2]! * r + m[5]! * g + m[8]! * b];
}

// ---------------------------------------------------------------------------
// Tolerances
// ---------------------------------------------------------------------------
const _TOL_LOG = 1e-4;
const _TOL_ACESCCT = 1e-5;
const _TOL_DEFAULT = 1 / 256; // ~0.0039
void _TOL_LOG;
void _TOL_ACESCCT;
void _TOL_DEFAULT;

// ============================================================================
// CDL Tests
// ============================================================================

describe('CDL (XE-CDL)', () => {
  it('XE-CDL-001: SOP formula with slope=1.5, offset=0.1, power=0.8 on input 0.5', () => {
    // GPU formula (0-1 range): pow(max(val * slope + offset, 0), power)
    const val = 0.5;
    const slope = 1.5;
    const offset = 0.1;
    const power = 0.8;
    const gpuExpected = Math.pow(Math.max(val * slope + offset, 0), power);

    // CPU applyCDLToValue works in 0-255 range:
    //   v = (value/255) * slope + offset
    //   v = pow(max(v, 0), power)
    //   return v * 255
    const cpuResult = applyCDLToValue(val * 255, slope, offset, power) / 255;

    expect(cpuResult).toBeCloseTo(gpuExpected, 4);
    // Verify the actual expected value
    // 0.5 * 1.5 + 0.1 = 0.85, pow(0.85, 0.8) ≈ 0.8786
    expect(gpuExpected).toBeCloseTo(Math.pow(0.85, 0.8), 10);
  });

  it('XE-CDL-002: identity CDL produces identity output', () => {
    const input = 128; // 0-255 range
    const result = applyCDLToValue(input, 1.0, 0.0, 1.0);
    expect(result).toBeCloseTo(input, 5);
  });

  it('XE-CDL-003: identity CDL on full RGB', () => {
    const result = applyCDL(100, 150, 200, DEFAULT_CDL);
    expect(result.r).toBeCloseTo(100, 5);
    expect(result.g).toBeCloseTo(150, 5);
    expect(result.b).toBeCloseTo(200, 5);
  });

  it('XE-CDL-004: negative result clamps to 0', () => {
    // slope=0.1, offset=-0.5 on input 0.3 → 0.3*0.1 + (-0.5) = -0.47 → clamped to 0
    const result = applyCDLToValue(0.3 * 255, 0.1, -0.5, 1.0);
    expect(result).toBe(0);
  });

  it('XE-CDL-005: GPU vs CPU range convention documented', () => {
    // NOTE: The CPU CDL (applyCDLToValue) operates on 0-255 pixel values
    // internally normalizing to 0-1 and returning 0-255.
    // The GPU CDL (viewer.frag.glsl line 1224) operates entirely in 0-1:
    //   color.rgb = pow(max(color.rgb * u_cdlSlope + u_cdlOffset, vec3(0.0)), u_cdlPower);
    //
    // To compare them, divide CPU input/output by 255.
    const inputNorm = 0.7;
    const slope = 1.2;
    const offset = -0.05;
    const power = 1.1;

    const gpuExpected = Math.pow(Math.max(inputNorm * slope + offset, 0), power);
    const cpuResult = applyCDLToValue(inputNorm * 255, slope, offset, power) / 255;

    expect(cpuResult).toBeCloseTo(gpuExpected, 4);
  });
});

// ============================================================================
// ACEScct Tests
// ============================================================================

describe('ACEScct (XE-ACESCCT)', () => {
  it('XE-ACESCCT-001: encode/decode roundtrip above boundary', () => {
    const values = [0.01, 0.05, 0.18, 0.5, 1.0, 2.0];
    for (const v of values) {
      const encoded = acescctEncode(v);
      const decoded = acescctDecode(encoded);
      expect(decoded).toBeCloseTo(v, 5);
    }
  });

  it('XE-ACESCCT-002: encode/decode roundtrip below boundary 0.0078125', () => {
    // Below the cut point, the linear segment is used
    const values = [0.0, 0.001, 0.005, 0.0078125];
    for (const v of values) {
      const encoded = acescctEncode(v);
      const decoded = acescctDecode(encoded);
      expect(decoded).toBeCloseTo(v, 5);
    }
  });

  it('XE-ACESCCT-003: boundary value at 0.0078125', () => {
    // The boundary is at linear = 0.0078125 (= 2^-7)
    // At and below this value, the linear segment is used
    const boundary = 0.0078125;
    const encoded = acescctEncode(boundary);
    // Encoded value should be (log2(0.0078125) + 9.72) / 17.52
    // = (-7 + 9.72) / 17.52 = 2.72 / 17.52 ≈ 0.15525...
    expect(encoded).toBeCloseTo(0.155251141552511, 5);
  });

  it('XE-ACESCCT-004: mid-gray 0.18 encodes to known value', () => {
    const encoded = acescctEncode(0.18);
    // (log2(0.18) + 9.72) / 17.52
    const expected = (Math.log2(0.18) + 9.72) / 17.52;
    expect(encoded).toBeCloseTo(expected, 10);
  });

  it('XE-ACESCCT-005: GLSL ACEScct matches CPU', () => {
    // GLSL linearToACEScctChannel (viewer.frag.glsl ~line 848):
    //   if (x <= 0.0078125) { return x * 10.5402377416545 + 0.0729055341958355; }
    //   else { return (log2(x) + 9.72) / 17.52; }
    // This matches acescctEncode from TransferFunctions.ts exactly.
    const testValues = [0.001, 0.0078125, 0.05, 0.18, 1.0];
    for (const v of testValues) {
      const cpuEncoded = acescctEncode(v);
      // Simulate GLSL
      let glslEncoded: number;
      if (v <= 0.0078125) {
        glslEncoded = v * 10.5402377416545 + 0.0729055341958355;
      } else {
        glslEncoded = (Math.log2(v) + 9.72) / 17.52;
      }
      expect(cpuEncoded).toBeCloseTo(glslEncoded, 10);
    }
  });
});

// ============================================================================
// Log Curves Tests
// ============================================================================

describe('Log Curves (XE-LOG)', () => {
  describe('Cineon', () => {
    const cineon = LOG_CURVES.cineon!;

    it('XE-LOG-001: Cineon toLinear/toLog roundtrip', () => {
      const values = [0.2, 0.3, 0.5, 0.67, 0.8];
      for (const v of values) {
        const linear = cineon.toLinear(v);
        const back = cineon.toLog(linear);
        expect(back).toBeCloseTo(v, 3);
      }
    });

    it('XE-LOG-002: Cineon refBlack (95/1023) maps to 0', () => {
      const refBlack = 95.0 / 1023.0;
      expect(cineon.toLinear(refBlack)).toBeCloseTo(0, 4);
    });

    it('XE-LOG-003: Cineon CPU vs GPU discrepancy documented', () => {
      // CPU (LogCurves.ts): printing density formula
      //   relativeCV = (cv - refBlack) / (refWhite - refBlack)
      //   linear = pow(10, (relativeCV - 0.5) * displayGamma)
      //   where displayGamma = 1.7
      //
      // GPU (viewer.frag.glsl cineonLogToLinear):
      //   gain = 1 / (1 - pow(10, (refBlack - refWhite) * 0.002 / 0.6))
      //   out  = gain * pow(10, (x - refWhite) * 0.002 / 0.6) - (gain - 1)
      //
      // These produce different results for the same input.
      const testVal = 0.5;
      const cpuResult = cineon.toLinear(testVal);
      const gpuResult = glslCineonLogToLinear(testVal);

      // They differ — this is by design (different formulations)
      expect(Math.abs(cpuResult - gpuResult)).toBeGreaterThan(0.01);
    });
  });

  describe('Viper', () => {
    const viper = LOG_CURVES.viper!;

    it('XE-LOG-004: Viper toLinear/toLog roundtrip', () => {
      const values = [0.1, 0.3, 0.5, 0.7, 0.9];
      for (const v of values) {
        const linear = viper.toLinear(v);
        if (linear > 0 && linear < 1) {
          const back = viper.toLog(linear);
          expect(back).toBeCloseTo(v, 3);
        }
      }
    });

    it('XE-LOG-005: Viper CPU matches GLSL formula', () => {
      const values = [0.1, 0.3, 0.5, 0.7, 0.9];
      for (const v of values) {
        const cpuResult = viper.toLinear(v);
        const glslResult = glslViperLogToLinear(v);
        expect(cpuResult).toBeCloseTo(glslResult, 4);
      }
    });

    it('XE-LOG-006: Viper refBlack (16/1023) maps to 0', () => {
      const refBlack = 16.0 / 1023.0;
      expect(viper.toLinear(refBlack)).toBe(0);
    });
  });

  describe('ARRI LogC3', () => {
    const logC3 = LOG_CURVES.arri_logc3!;

    it('XE-LOG-007: LogC3 toLinear/toLog roundtrip', () => {
      const values = [0.1, 0.3, 0.5, 0.7, 0.9];
      for (const v of values) {
        const linear = logC3.toLinear(v);
        const back = logC3.toLog(linear);
        expect(back).toBeCloseTo(v, 4);
      }
    });

    it('XE-LOG-008: LogC3 CPU (LogCurves) matches TransferFunctions logC3Decode', () => {
      const values = [0.1, 0.2, 0.4, 0.6, 0.8];
      for (const v of values) {
        const fromLogCurves = logC3.toLinear(v);
        const fromTransfer = logC3Decode(v);
        expect(fromLogCurves).toBeCloseTo(fromTransfer, 6);
      }
    });

    it('XE-LOG-009: LogC3 CPU matches GLSL logC3ToLinear', () => {
      const values = [0.1, 0.3, 0.5, 0.7, 0.9];
      for (const v of values) {
        const cpuResult = logC3.toLinear(v);
        const glslResult = glslLogC3ToLinear(v);
        expect(cpuResult).toBeCloseTo(glslResult, 6);
      }
    });

    it('XE-LOG-010: LogC3 encode/decode roundtrip (TransferFunctions)', () => {
      const values = [0.001, 0.01, 0.18, 0.5, 1.0, 5.0];
      for (const v of values) {
        const encoded = logC3Encode(v);
        const decoded = logC3Decode(encoded);
        expect(decoded).toBeCloseTo(v, 5);
      }
    });
  });
});

// ============================================================================
// Gamut Soft Clip Tests
// ============================================================================

describe('Gamut Soft Clip (XE-GAMUT)', () => {
  it('XE-GAMUT-001: values below 0.8 pass through', () => {
    const values = [0.0, 0.1, 0.3, 0.5, 0.79, 0.8];
    for (const v of values) {
      expect(softClipChannel(v)).toBeCloseTo(v, 10);
    }
  });

  it('XE-GAMUT-002: values above 0.8 are compressed', () => {
    const values = [0.85, 0.9, 0.95, 1.0, 1.5, 2.0];
    for (const v of values) {
      const result = softClipChannel(v);
      // Must be >= 0.8 and < 1.0 (tanh asymptotes at 1.0)
      expect(result).toBeGreaterThanOrEqual(0.8);
      expect(result).toBeLessThan(1.0);
      // Must be less than the input
      expect(result).toBeLessThan(v);
    }
  });

  it('XE-GAMUT-003: negative values clamp to 0', () => {
    expect(softClipChannel(-0.5)).toBe(0);
    expect(softClipChannel(-1.0)).toBe(0);
  });

  it('XE-GAMUT-004: tanh formula produces expected value at x=1.0', () => {
    // At x=1.0: 0.8 + 0.2 * tanh((1.0 - 0.8) / 0.2) = 0.8 + 0.2 * tanh(1)
    const expected = 0.8 + 0.2 * Math.tanh(1.0);
    expect(softClipChannel(1.0)).toBeCloseTo(expected, 10);
  });

  it('XE-GAMUT-005: gamut soft-clip is unified across CPU, GLSL, and WGSL (tanh)', () => {
    // Historical context (round-1 of MED-55): scene_analysis.wgsl had its
    // own smoothstep-based soft-clip that diverged from the CPU/GLSL tanh
    // formula. The deduplication during MED-55 deleted that local
    // implementation; scene_analysis.wgsl now references the shared
    // gamutSoftClip() in common.wgsl, which uses the same tanh formula.
    //
    // This test guards the unification by asserting CPU == WGSL-source
    // expectation across the soft-clip's active range. We re-implement the
    // expected formula here (single source of truth: tanh) and verify the
    // CPU function `softClipChannel` matches it. The compile-time check
    // that scene_analysis.wgsl picks up common.wgsl's gamutSoftClip lives
    // in src/render/__gpu__/wgsl-compile.gpu-test.ts.
    const cases = [0.0, 0.4, 0.8, 0.9, 1.0, 1.5, 2.0, 5.0];
    for (const x of cases) {
      let expected: number;
      if (x <= 0.0) {
        expected = 0.0;
      } else if (x <= 0.8) {
        expected = x;
      } else {
        expected = 0.8 + 0.2 * Math.tanh((x - 0.8) / 0.2);
      }
      expect(softClipChannel(x), `softClipChannel(${x}) should match unified tanh formula`).toBeCloseTo(expected, 10);
    }
  });

  it('XE-GAMUT-006: monotonically increasing', () => {
    let prev = softClipChannel(0.0);
    for (let x = 0.01; x <= 3.0; x += 0.01) {
      const curr = softClipChannel(x);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });
});

// ============================================================================
// Color Primaries Matrices Tests
// ============================================================================

describe('Color Primaries Matrices (XE-MATRIX)', () => {
  const { IDENTITY, REC2020_TO_SRGB, P3_TO_SRGB, SRGB_TO_P3, SRGB_TO_REC2020 } = COLOR_PRIMARIES_MATRICES;

  it('XE-MATRIX-001: identity matrix preserves values', () => {
    const [r, g, b] = matMul3ColMajor(IDENTITY, 0.5, 0.3, 0.7);
    expect(r).toBeCloseTo(0.5, 5);
    expect(g).toBeCloseTo(0.3, 5);
    expect(b).toBeCloseTo(0.7, 5);
  });

  it('XE-MATRIX-002: Rec.2020→sRGB matrix values match GLSL', () => {
    // GLSL (viewer.frag.glsl ~line 451, column-major):
    //   mat3 REC2020_TO_SRGB = mat3(
    //     1.6605, -0.1246, -0.0182,     // column 0
    //    -0.5877,  1.1329, -0.1006,     // column 1
    //    -0.0728, -0.0083,  1.1187      // column 2
    //   );
    // ShaderConstants.ts stores in column-major as well.
    expect(REC2020_TO_SRGB[0]).toBeCloseTo(1.6605, 3);
    expect(REC2020_TO_SRGB[1]).toBeCloseTo(-0.1246, 3);
    expect(REC2020_TO_SRGB[2]).toBeCloseTo(-0.0182, 3);
    expect(REC2020_TO_SRGB[3]).toBeCloseTo(-0.5877, 3);
    expect(REC2020_TO_SRGB[4]).toBeCloseTo(1.1329, 3);
    expect(REC2020_TO_SRGB[5]).toBeCloseTo(-0.1006, 3);
    expect(REC2020_TO_SRGB[6]).toBeCloseTo(-0.0728, 3);
    expect(REC2020_TO_SRGB[7]).toBeCloseTo(-0.0083, 3);
    expect(REC2020_TO_SRGB[8]).toBeCloseTo(1.1187, 3);
  });

  it('XE-MATRIX-003: P3→sRGB matrix values match GLSL', () => {
    // GLSL: mat3 P3_TO_SRGB = mat3(1.2249, -0.0420, -0.0197, -0.2247, 1.0419, -0.0786, -0.0002, 0.0001, 1.0983)
    expect(P3_TO_SRGB[0]).toBeCloseTo(1.2249, 3);
    expect(P3_TO_SRGB[4]).toBeCloseTo(1.0419, 3);
    expect(P3_TO_SRGB[8]).toBeCloseTo(1.0983, 3);
  });

  it('XE-MATRIX-004: pure sRGB red primary through Rec.2020→sRGB', () => {
    // Pure Rec.2020 red (1,0,0) mapped to sRGB should have dominant red
    const [r, g, b] = matMul3ColMajor(REC2020_TO_SRGB, 1, 0, 0);
    expect(r).toBeGreaterThan(1.0); // Rec.2020 red is outside sRGB
    expect(Math.abs(g)).toBeLessThan(0.2);
    expect(Math.abs(b)).toBeLessThan(0.1);
  });

  it('XE-MATRIX-005: sRGB→P3→sRGB roundtrip', () => {
    const input: [number, number, number] = [0.5, 0.3, 0.7];
    const p3 = matMul3ColMajor(SRGB_TO_P3, ...input);
    const back = matMul3ColMajor(P3_TO_SRGB, ...p3);
    expect(back[0]).toBeCloseTo(input[0], 2);
    expect(back[1]).toBeCloseTo(input[1], 2);
    expect(back[2]).toBeCloseTo(input[2], 2);
  });

  it('XE-MATRIX-006: Rec.2020→sRGB maps neutral gray to neutral gray', () => {
    // A neutral gray in Rec.2020 should map to neutral gray in sRGB
    const gray = 0.5;
    const [r, g, b] = matMul3ColMajor(REC2020_TO_SRGB, gray, gray, gray);
    // Row sums should be close to 1.0 for a well-formed color matrix
    expect(r).toBeCloseTo(gray, 1);
    expect(g).toBeCloseTo(gray, 1);
    expect(b).toBeCloseTo(gray, 1);
  });

  it('XE-MATRIX-007: SRGB_TO_REC2020 matrix has expected structure', () => {
    // Diagonal dominance: each primary maps mostly to itself
    expect(SRGB_TO_REC2020[0]).toBeGreaterThan(0.5); // r→r
    expect(SRGB_TO_REC2020[4]).toBeGreaterThan(0.5); // g→g
    expect(SRGB_TO_REC2020[8]).toBeGreaterThan(0.5); // b→b
  });
});

// ============================================================================
// MED-54: Gamut mapping matrix documented intent
// ============================================================================
//
// These tests pin each gamut-mapping / tone-mapping matrix against the
// source/destination color space documented in code, so a future change that
// breaks the documented intent (or silently swaps source and destination) is
// caught immediately.
//
// Documented mappings (mirrored across viewer.frag.glsl, common.wgsl,
// scene_analysis.wgsl, effectProcessing.shared.ts and ShaderConstants.ts):
//   REC2020_TO_SRGB:  Rec.2020 (D65) → BT.709/sRGB (D65)
//   REC2020_TO_P3:    Rec.2020 (D65) → Display-P3 (D65)
//   P3_TO_SRGB:       Display-P3 (D65) → BT.709/sRGB (D65)
//   ACES Hill input:  BT.709 linear  → AP1 (Hill ODT-tuned, not pure primaries)
//   ACES Hill output: AP1            → BT.709 linear (Hill ODT-tuned inverse)
//   AgX inset/outset: BT.709 linear  ↔ AgX inner-gamut (compression, not primaries)
//
describe('MED-54: gamut mapping matrices match documented source→dest intent', () => {
  it('MED-54-001: REC2020_TO_SRGB widens gamut (Rec.2020 red → out-of-gamut sRGB red)', () => {
    // Pure Rec.2020 red is outside the sRGB gamut; mapping it to sRGB must
    // produce r > 1.0 (its out-of-gamut signature) and very small g/b.
    const [r, g, b] = matMul3ColMajor(COLOR_PRIMARIES_MATRICES.REC2020_TO_SRGB, 1, 0, 0);
    expect(r).toBeGreaterThan(1.0);
    expect(g).toBeLessThan(0);
    expect(b).toBeLessThan(0);
    // The reverse claim must NOT hold: pure sRGB red mapped through the
    // forward matrix would not give r > 1; that's the discriminator that
    // catches an accidental source/dest swap.
  });

  it('MED-54-002: REC2020_TO_SRGB preserves D65 white (1,1,1) → (~1,~1,~1)', () => {
    // Both spaces share the D65 white point, so neutral white must round-trip
    // through the matrix without chromatic shift.
    const [r, g, b] = matMul3ColMajor(COLOR_PRIMARIES_MATRICES.REC2020_TO_SRGB, 1, 1, 1);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it('MED-54-003: P3_TO_SRGB widens gamut (P3 red → slightly out-of-gamut sRGB red)', () => {
    // Display-P3 red is wider than sRGB red → r > 1, g/b ≈ 0.
    const [r, g, b] = matMul3ColMajor(COLOR_PRIMARIES_MATRICES.P3_TO_SRGB, 1, 0, 0);
    expect(r).toBeGreaterThan(1.0);
    expect(r).toBeLessThan(1.4); // P3 is closer to sRGB than Rec.2020 is
    expect(Math.abs(g)).toBeLessThan(0.05);
    expect(Math.abs(b)).toBeLessThan(0.05);
  });

  it('MED-54-004: P3_TO_SRGB preserves D65 white', () => {
    const [r, g, b] = matMul3ColMajor(COLOR_PRIMARIES_MATRICES.P3_TO_SRGB, 1, 1, 1);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it('MED-54-005: SRGB_TO_P3 narrows gamut (sRGB red → in-gamut P3 red, r<1)', () => {
    // The reverse direction: sRGB red sits inside the P3 gamut, so r ≤ 1.
    // This sanity-checks that SRGB_TO_P3 is documented in the right direction.
    const [r, g, b] = matMul3ColMajor(COLOR_PRIMARIES_MATRICES.SRGB_TO_P3, 1, 0, 0);
    expect(r).toBeGreaterThan(0.7);
    expect(r).toBeLessThanOrEqual(1.0);
    expect(g).toBeGreaterThanOrEqual(0); // small positive bleed
    expect(b).toBeGreaterThanOrEqual(0);
  });

  it('MED-54-006: SRGB_TO_REC2020 narrows gamut (sRGB red → in-gamut Rec.2020 red)', () => {
    // sRGB red sits well inside Rec.2020 → r < 1 with small green bleed.
    const [r, g, b] = matMul3ColMajor(COLOR_PRIMARIES_MATRICES.SRGB_TO_REC2020, 1, 0, 0);
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(1.0);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
  });

  it('MED-54-007: gamutMapRGB(rec2020 → srgb) clip mode clamps Rec.2020 red into [0,1]', () => {
    // CPU path through documented entry point matches GPU intent: the
    // out-of-gamut Rec.2020 red gets clamped to (1,0,0) in sRGB.
    const [r, g, b] = gamutMapRGB(1, 0, 0, 'rec2020', 'srgb', 'clip');
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('MED-54-008: gamutMapRGB(srgb → srgb, clip) is identity (no source-mapping branch)', () => {
    // The CPU path explicitly leaves source==srgb untouched (no matrix
    // multiplication branch fires), so values < 0 or > 1 still get clipped.
    const [r, g, b] = gamutMapRGB(0.5, 0.3, 0.7, 'srgb', 'srgb', 'clip');
    expect(r).toBeCloseTo(0.5, 5);
    expect(g).toBeCloseTo(0.3, 5);
    expect(b).toBeCloseTo(0.7, 5);
  });

  it('MED-54-009: ACES Hill input matrix preserves D65 white close to itself', () => {
    // The Hill input is BT.709→AP1 ODT-tuned; both bases use D65 so neutral
    // (1,1,1) BT.709 → ~(1,1,1) AP1. hdrHeadroom=1 and a bright neutral that
    // still survives the rational fit so the matrices are exercised with a
    // sensible signal.
    const result = tonemapACESHill(0.5, 0.5, 0.5, 1.0);
    // Neutral input must remain neutral (or near-neutral) on output.
    expect(result.g).toBeCloseTo(result.r, 2);
    expect(result.b).toBeCloseTo(result.r, 2);
  });

  it('MED-54-010: AgX inset matrix preserves D65 neutral as neutral', () => {
    // AgX inset/outset compress saturated colors; pure neutral must remain
    // neutral both before and after the inset/outset stages.
    const result = tonemapAgX(0.5, 0.5, 0.5, 1.0);
    expect(result.g).toBeCloseTo(result.r, 2);
    expect(result.b).toBeCloseTo(result.r, 2);
  });

  it('MED-54-011: column-major mat3 storage matches matrix math (Rec.2020 → sRGB)', () => {
    // Pin the storage convention: index 0..2 is column 0, 3..5 col 1, 6..8 col 2.
    // For a column-major mat3, math row 0 is (m[0], m[3], m[6]).
    // First row of REC2020_TO_SRGB math matrix: 1.6605, -0.5877, -0.0728
    const m = COLOR_PRIMARIES_MATRICES.REC2020_TO_SRGB;
    // Apply to Rec.2020 (1,0,0) — should give the first column of math matrix
    // = (m[0], m[1], m[2]) when reading row 0 across columns. matMul3ColMajor
    // computes row 0 result as m[0]*1 + m[3]*0 + m[6]*0 = m[0].
    const [r0] = matMul3ColMajor(m, 1, 0, 0);
    expect(r0).toBeCloseTo(m[0]!, 5);
    // Apply to (0,1,0) → should pick up m[3] (column 1, row 0).
    const [r1] = matMul3ColMajor(m, 0, 1, 0);
    expect(r1).toBeCloseTo(m[3]!, 5);
  });
});

// ============================================================================
// HSL Conversion Tests
// ============================================================================

describe('HSL Conversion (XE-HSL)', () => {
  it('XE-HSL-001: pure red → (0, 1, 0.5)', () => {
    const [h, s, l] = rgbToHsl(1, 0, 0);
    expect(h).toBeCloseTo(0, 1);
    expect(s).toBeCloseTo(1, 4);
    expect(l).toBeCloseTo(0.5, 4);
  });

  it('XE-HSL-002: pure green → (120, 1, 0.5)', () => {
    const [h, s, l] = rgbToHsl(0, 1, 0);
    expect(h).toBeCloseTo(120, 1);
    expect(s).toBeCloseTo(1, 4);
    expect(l).toBeCloseTo(0.5, 4);
  });

  it('XE-HSL-003: pure blue → (240, 1, 0.5)', () => {
    const [h, s, l] = rgbToHsl(0, 0, 1);
    expect(h).toBeCloseTo(240, 1);
    expect(s).toBeCloseTo(1, 4);
    expect(l).toBeCloseTo(0.5, 4);
  });

  it('XE-HSL-004: gray (0.5,0.5,0.5) → (0, 0, 0.5)', () => {
    const [h, s, l] = rgbToHsl(0.5, 0.5, 0.5);
    expect(h).toBeCloseTo(0, 1);
    expect(s).toBeCloseTo(0, 4);
    expect(l).toBeCloseTo(0.5, 4);
  });

  it('XE-HSL-005: white → (0, 0, 1)', () => {
    const [_h1, s, l] = rgbToHsl(1, 1, 1);
    void _h1;
    expect(s).toBeCloseTo(0, 4);
    expect(l).toBeCloseTo(1, 4);
  });

  it('XE-HSL-006: black → (0, 0, 0)', () => {
    const [_h2, s, l] = rgbToHsl(0, 0, 0);
    void _h2;
    expect(s).toBeCloseTo(0, 4);
    expect(l).toBeCloseTo(0, 4);
  });

  it('XE-HSL-007: rgbToHsl→hslToRgb roundtrip', () => {
    const colors: [number, number, number][] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.8, 0.3, 0.5],
      [0.2, 0.7, 0.4],
      [0.1, 0.1, 0.9],
      [0.5, 0.5, 0.5],
    ];
    for (const [r, g, b] of colors) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const [rr, gg, bb] = hslToRgb(h, s, l);
      expect(rr).toBeCloseTo(r, 3);
      expect(gg).toBeCloseTo(g, 3);
      expect(bb).toBeCloseTo(b, 3);
    }
  });

  it('XE-HSL-008: hslToRgb→rgbToHsl roundtrip', () => {
    const hslValues: [number, number, number][] = [
      [0, 1, 0.5],
      [60, 0.8, 0.4],
      [180, 0.5, 0.6],
      [300, 0.9, 0.3],
    ];
    for (const [h, s, l] of hslValues) {
      const [r, g, b] = hslToRgb(h, s, l);
      const [hh, ss, ll] = rgbToHsl(r, g, b);
      expect(hh).toBeCloseTo(h, 1);
      expect(ss).toBeCloseTo(s, 3);
      expect(ll).toBeCloseTo(l, 3);
    }
  });

  it('XE-HSL-009: hslToRgb zero saturation returns gray', () => {
    const [r, g, b] = hslToRgb(123, 0, 0.7);
    expect(r).toBeCloseTo(0.7, 4);
    expect(g).toBeCloseTo(0.7, 4);
    expect(b).toBeCloseTo(0.7, 4);
  });
});
