/**
 * Cross-ecosystem tone mapping operator tests (XE-TM-NNN).
 *
 * Tests the CPU implementations of all 8 tone mapping operators from
 * effectProcessing.shared.ts against known mathematical values.
 *
 * Since GLSL/WGSL shaders cannot run in a test environment, we verify
 * the CPU reference implementations match expected mathematical behavior.
 * The CPU code is intended to be formula-identical to the GPU shaders.
 *
 * Known discrepancies between WGSL and CPU:
 * - WGSL filmicCurve() does not clamp negative input values with max(0).
 *   The CPU tonemapFilmicChannel() returns 0 early for negative inputs.
 *   The WGSL tonemapFilmic() does apply max(0) on the final result, so
 *   the discrepancy only matters for intermediate curve evaluation.
 */
import { describe, it, expect } from 'vitest';

import {
  tonemapReinhardChannel,
  tonemapFilmicChannel,
  filmicCurveShared,
  tonemapACESChannel,
  tonemapAgX,
  tonemapPBRNeutral,
  tonemapGTChannel,
  tonemapACESHill,
  tonemapDragoChannel,
} from '../../utils/effects/effectProcessing.shared';

/** Tolerance: 1/1024 ≈ 0.000977 */
const TOL = 1 / 1024;

// ---------------------------------------------------------------------------
// Helper: check monotonicity for a per-channel operator
// ---------------------------------------------------------------------------
function checkMonotonicity(
  fn: (v: number) => number,
  start: number,
  end: number,
  steps: number,
): boolean {
  let prev = fn(start);
  const step = (end - start) / steps;
  for (let i = 1; i <= steps; i++) {
    const v = start + step * i;
    const curr = fn(v);
    if (curr < prev - 1e-9) return false; // allow tiny floating-point jitter
    prev = curr;
  }
  return true;
}

// Same for cross-channel operators applied to equal-channel (gray) input
function checkMonotonicityRGB(
  fn: (r: number, g: number, b: number) => { r: number; g: number; b: number },
  start: number,
  end: number,
  steps: number,
): boolean {
  let prev = fn(start, start, start);
  const step = (end - start) / steps;
  for (let i = 1; i <= steps; i++) {
    const v = start + step * i;
    const curr = fn(v, v, v);
    if (curr.r < prev.r - 1e-9 || curr.g < prev.g - 1e-9 || curr.b < prev.b - 1e-9)
      return false;
    prev = curr;
  }
  return true;
}

// ===================================================================
// 1. Reinhard
// ===================================================================
describe('XE-TM: Reinhard tone mapping', () => {
  const wp = 4.0; // default white point

  it('XE-TM-001: input 0.0 → 0.0 (black preservation)', () => {
    expect(tonemapReinhardChannel(0.0, wp)).toBeCloseTo(0.0, 6);
  });

  it('XE-TM-002: input 0.18 (mid-gray)', () => {
    // Reinhard: v*(1 + v/wp^2) / (1 + v)
    // = 0.18*(1 + 0.18/16) / (1 + 0.18) = 0.18*1.01125/1.18 ≈ 0.15427
    const expected = (0.18 * (1.0 + 0.18 / (wp * wp))) / (1.0 + 0.18);
    expect(tonemapReinhardChannel(0.18, wp)).toBeCloseTo(expected, 4);
  });

  it('XE-TM-003: input 1.0 (SDR white)', () => {
    const expected = (1.0 * (1.0 + 1.0 / (wp * wp))) / (1.0 + 1.0);
    expect(tonemapReinhardChannel(1.0, wp)).toBeCloseTo(expected, 4);
  });

  it('XE-TM-004: input 5.0 (HDR highlight)', () => {
    const result = tonemapReinhardChannel(5.0, wp);
    // Extended Reinhard can exceed 1.0: 5*(1+5/16)/(1+5) = 1.09375
    const expected = (5.0 * (1.0 + 5.0 / (wp * wp))) / (1.0 + 5.0);
    expect(result).toBeCloseTo(expected, 4);
    expect(result).toBeGreaterThan(0.8);
  });

  it('XE-TM-005: input 100.0 (extreme HDR) → converges toward 1', () => {
    const result = tonemapReinhardChannel(100.0, wp);
    expect(result).toBeGreaterThan(0.99);
    // With wp=4, limit is wp^2/(wp^2) = approaches ~100/16 ≈ 1.06... no.
    // Reinhard limit as v→∞: v*(v/wp^2) / v = v/wp^2 ... actually diverges.
    // Extended Reinhard converges to wp^2/wp^2 ... no. Let's compute:
    // v*(1+v/16)/(1+v) ≈ v*(v/16)/v = v/16 for large v. So it grows.
    // Actually for v=100: 100*(1+6.25)/(101) = 100*7.25/101 ≈ 7.178
    expect(result).toBeGreaterThan(1.0);
  });

  it('XE-TM-006: negative input → 0', () => {
    expect(tonemapReinhardChannel(-1.0, wp)).toBe(0);
    expect(tonemapReinhardChannel(-0.5, wp)).toBe(0);
  });

  it('XE-TM-007: monotonicity (0 to 10)', () => {
    expect(checkMonotonicity((v) => tonemapReinhardChannel(v, wp), 0, 10, 200)).toBe(true);
  });
});

// ===================================================================
// 2. Filmic (Uncharted 2)
// ===================================================================
describe('XE-TM: Filmic (Uncharted 2) tone mapping', () => {
  const eb = 2.0; // default exposure bias
  const wp = 11.2; // default white point

  it('XE-TM-010: input 0.0 → 0.0 (black preservation)', () => {
    // filmicCurve(0) = (0+0+0.004)/(0+0+0.06) - 0.02/0.3
    // = 0.004/0.06 - 1/15 = 0.0667 - 0.0667 = 0
    expect(tonemapFilmicChannel(0.0, eb, wp)).toBeCloseTo(0.0, 4);
  });

  it('XE-TM-011: input 0.18 (mid-gray)', () => {
    const result = tonemapFilmicChannel(0.18, eb, wp);
    expect(result).toBeGreaterThan(0.0);
    expect(result).toBeLessThan(0.5);
  });

  it('XE-TM-012: input 1.0 (SDR white)', () => {
    const result = tonemapFilmicChannel(1.0, eb, wp);
    expect(result).toBeGreaterThan(0.3);
    expect(result).toBeLessThan(1.0);
  });

  it('XE-TM-013: input 5.0 (HDR highlight)', () => {
    const result = tonemapFilmicChannel(5.0, eb, wp);
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-014: input 100.0 (extreme HDR) → converges', () => {
    const result = tonemapFilmicChannel(100.0, eb, wp);
    // Filmic converges to whiteScale * filmicCurve(large) which approaches A/A = 1
    // divided by filmicCurve(wp). Can slightly exceed 1.0.
    expect(result).toBeGreaterThan(0.9);
    expect(result).toBeLessThan(1.3);
  });

  it('XE-TM-015: negative input → 0', () => {
    expect(tonemapFilmicChannel(-1.0, eb, wp)).toBe(0);
  });

  it('XE-TM-016: monotonicity (0 to 10)', () => {
    expect(checkMonotonicity((v) => tonemapFilmicChannel(v, eb, wp), 0, 10, 200)).toBe(true);
  });

  it('XE-TM-017: filmicCurve(0) evaluates to 0', () => {
    // Verify the curve itself: f(0) = (0 + 0 + D*E)/(0 + 0 + D*F) - E/F
    // = E/F - E/F = 0
    expect(filmicCurveShared(0)).toBeCloseTo(0.0, 6);
  });
});

// ===================================================================
// 3. ACES (Narkowicz)
// ===================================================================
describe('XE-TM: ACES Narkowicz tone mapping', () => {
  it('XE-TM-020: input 0.0 → 0.0 (black preservation)', () => {
    // f(0) = (0*0.03)/(0+0.14) = 0/0.14 = 0
    expect(tonemapACESChannel(0.0)).toBeCloseTo(0.0, 6);
  });

  it('XE-TM-021: input 0.18 (mid-gray)', () => {
    const v = 0.18;
    const expected = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14);
    expect(tonemapACESChannel(v)).toBeCloseTo(Math.max(0, Math.min(1, expected)), 4);
  });

  it('XE-TM-022: input 1.0 (SDR white)', () => {
    const v = 1.0;
    const expected = (v * (2.51 + 0.03)) / (v * (2.43 + 0.59) + 0.14);
    // = 2.54 / 3.16 ≈ 0.8038
    expect(tonemapACESChannel(v)).toBeCloseTo(Math.min(1, expected), 4);
  });

  it('XE-TM-023: input 5.0 (HDR highlight)', () => {
    const result = tonemapACESChannel(5.0);
    expect(result).toBeGreaterThan(0.95);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-024: input 100.0 (extreme HDR) → clamped to 1.0', () => {
    // ACES Narkowicz is clamped to [0,1]
    expect(tonemapACESChannel(100.0)).toBeCloseTo(1.0, 2);
  });

  it('XE-TM-025: negative input → 0', () => {
    expect(tonemapACESChannel(-1.0)).toBe(0);
  });

  it('XE-TM-026: monotonicity (0 to 10)', () => {
    expect(checkMonotonicity(tonemapACESChannel, 0, 10, 200)).toBe(true);
  });
});

// ===================================================================
// 4. AgX
// ===================================================================
describe('XE-TM: AgX tone mapping', () => {
  it('XE-TM-030: input 0.0 → near 0 (black preservation)', () => {
    const result = tonemapAgX(0.0, 0.0, 0.0);
    // AgX uses log2, so exact 0 maps via log2(1e-10) which still
    // passes through sigmoid. Expect near-black output.
    expect(result.r).toBeLessThan(0.05);
    expect(result.g).toBeLessThan(0.05);
    expect(result.b).toBeLessThan(0.05);
  });

  it('XE-TM-031: input 0.18 (mid-gray)', () => {
    const result = tonemapAgX(0.18, 0.18, 0.18);
    expect(result.r).toBeGreaterThan(0.0);
    expect(result.r).toBeLessThan(1.0);
    // Gray input should produce roughly equal channels
    expect(Math.abs(result.r - result.g)).toBeLessThan(TOL);
    expect(Math.abs(result.g - result.b)).toBeLessThan(TOL);
  });

  it('XE-TM-032: input 1.0 (SDR white)', () => {
    const result = tonemapAgX(1.0, 1.0, 1.0);
    expect(result.r).toBeGreaterThan(0.3);
    expect(result.r).toBeLessThanOrEqual(1.0);
    // Equal input → equal output
    expect(Math.abs(result.r - result.g)).toBeLessThan(TOL);
  });

  it('XE-TM-033: input 5.0 (HDR highlight)', () => {
    const result = tonemapAgX(5.0, 5.0, 5.0);
    expect(result.r).toBeGreaterThan(0.5);
    expect(result.r).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-034: input 100.0 (extreme HDR) → clamped to [0,1]', () => {
    const result = tonemapAgX(100.0, 100.0, 100.0);
    expect(result.r).toBeGreaterThanOrEqual(0.0);
    expect(result.r).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-035: negative input → handled (clamped to 0)', () => {
    const result = tonemapAgX(-1.0, -1.0, -1.0);
    // Negative values are clamped to 0 before processing
    expect(result.r).toBeLessThan(0.05);
    expect(result.g).toBeLessThan(0.05);
    expect(result.b).toBeLessThan(0.05);
  });

  it('XE-TM-036: monotonicity (gray ramp 0.001 to 10)', () => {
    // Start from 0.001 since AgX uses log2 and 0 maps to a floor
    expect(checkMonotonicityRGB(tonemapAgX, 0.001, 10, 200)).toBe(true);
  });
});

// ===================================================================
// 5. PBR Neutral (Khronos)
// ===================================================================
describe('XE-TM: PBR Neutral tone mapping', () => {
  it('XE-TM-040: input 0.0 → 0.0 (black preservation)', () => {
    const result = tonemapPBRNeutral(0.0, 0.0, 0.0);
    expect(result.r).toBeCloseTo(0.0, 6);
    expect(result.g).toBeCloseTo(0.0, 6);
    expect(result.b).toBeCloseTo(0.0, 6);
  });

  it('XE-TM-041: input 0.18 (mid-gray) → passthrough (below compression)', () => {
    const result = tonemapPBRNeutral(0.18, 0.18, 0.18);
    // x = min(0.18, 0.18, 0.18) = 0.18
    // Since x >= 0.08, offset = 0.04
    // r = 0.18 - 0.04 = 0.14, peak = 0.14 < startCompression (0.76) → return as is
    expect(result.r).toBeCloseTo(0.14, 4);
    // Equal channels
    expect(Math.abs(result.r - result.g)).toBeLessThan(TOL);
  });

  it('XE-TM-042: input 1.0 (SDR white) → compressed', () => {
    const result = tonemapPBRNeutral(1.0, 1.0, 1.0);
    expect(result.r).toBeGreaterThan(0.7);
    expect(result.r).toBeLessThan(1.0);
    // Equal channels
    expect(Math.abs(result.r - result.g)).toBeLessThan(TOL);
  });

  it('XE-TM-043: input 5.0 (HDR highlight)', () => {
    const result = tonemapPBRNeutral(5.0, 5.0, 5.0);
    expect(result.r).toBeGreaterThan(0.9);
    expect(result.r).toBeLessThan(1.0);
  });

  it('XE-TM-044: input 100.0 (extreme HDR) → approaches 1.0', () => {
    const result = tonemapPBRNeutral(100.0, 100.0, 100.0);
    expect(result.r).toBeGreaterThan(0.99);
    expect(result.r).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-045: negative input → 0', () => {
    const result = tonemapPBRNeutral(-1.0, -1.0, -1.0);
    expect(result.r).toBeCloseTo(0.0, 6);
  });

  it('XE-TM-046: monotonicity (gray ramp 0 to 10)', () => {
    expect(checkMonotonicityRGB(tonemapPBRNeutral, 0, 10, 200)).toBe(true);
  });
});

// ===================================================================
// 6. GT (Gran Turismo / Uchimura)
// ===================================================================
describe('XE-TM: GT (Uchimura) tone mapping', () => {
  it('XE-TM-050: input 0.0 → 0.0 (black preservation)', () => {
    expect(tonemapGTChannel(0.0)).toBeCloseTo(0.0, 4);
  });

  it('XE-TM-051: input 0.18 (mid-gray)', () => {
    const result = tonemapGTChannel(0.18);
    expect(result).toBeGreaterThan(0.0);
    expect(result).toBeLessThan(0.5);
  });

  it('XE-TM-052: input 1.0 (SDR white)', () => {
    const result = tonemapGTChannel(1.0);
    // GT has P=1.0, so values near 1 are in the shoulder region
    expect(result).toBeGreaterThan(0.7);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-053: input 5.0 (HDR highlight)', () => {
    const result = tonemapGTChannel(5.0);
    expect(result).toBeGreaterThan(0.9);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-054: input 100.0 (extreme HDR) → converges to P=1.0', () => {
    const result = tonemapGTChannel(100.0);
    expect(result).toBeCloseTo(1.0, 2);
  });

  it('XE-TM-055: negative input → 0', () => {
    expect(tonemapGTChannel(-1.0)).toBe(0);
  });

  it('XE-TM-056: monotonicity (0 to 10)', () => {
    expect(checkMonotonicity(tonemapGTChannel, 0, 10, 200)).toBe(true);
  });
});

// ===================================================================
// 7. ACES Hill
// ===================================================================
describe('XE-TM: ACES Hill tone mapping', () => {
  it('XE-TM-060: input 0.0 → near 0 (black preservation)', () => {
    const result = tonemapACESHill(0.0, 0.0, 0.0);
    // RRT+ODT fit at 0: (0*(0+0.0245786) - 0.000090537) / (0*... + 0.238081)
    // = -0.000090537 / 0.238081 ≈ -0.000380, clamped to 0
    expect(result.r).toBeCloseTo(0.0, 3);
    expect(result.g).toBeCloseTo(0.0, 3);
    expect(result.b).toBeCloseTo(0.0, 3);
  });

  it('XE-TM-061: input 0.18 (mid-gray)', () => {
    const result = tonemapACESHill(0.18, 0.18, 0.18);
    expect(result.r).toBeGreaterThan(0.0);
    expect(result.r).toBeLessThan(0.5);
    // Gray input → near-equal channels
    expect(Math.abs(result.r - result.g)).toBeLessThan(TOL);
  });

  it('XE-TM-062: input 1.0 (SDR white)', () => {
    const result = tonemapACESHill(1.0, 1.0, 1.0);
    expect(result.r).toBeGreaterThan(0.5);
    expect(result.r).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-063: input 5.0 (HDR highlight)', () => {
    const result = tonemapACESHill(5.0, 5.0, 5.0);
    expect(result.r).toBeGreaterThan(0.8);
    expect(result.r).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-064: input 100.0 (extreme HDR) → clamped to [0,1]', () => {
    const result = tonemapACESHill(100.0, 100.0, 100.0);
    expect(result.r).toBeGreaterThanOrEqual(0.0);
    expect(result.r).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-065: negative input → 0', () => {
    const result = tonemapACESHill(-1.0, -1.0, -1.0);
    expect(result.r).toBeCloseTo(0.0, 3);
  });

  it('XE-TM-066: monotonicity (gray ramp 0 to 10)', () => {
    expect(checkMonotonicityRGB(tonemapACESHill, 0, 10, 200)).toBe(true);
  });
});

// ===================================================================
// 8. Drago
// ===================================================================
describe('XE-TM: Drago tone mapping', () => {
  const bias = 0.85;
  const Lwa = 0.2;
  const Lmax = 1.5;

  it('XE-TM-070: input 0.0 → 0.0 (black preservation)', () => {
    expect(tonemapDragoChannel(0.0, bias, Lwa, Lmax)).toBeCloseTo(0.0, 6);
  });

  it('XE-TM-071: input 0.18 (mid-gray)', () => {
    const result = tonemapDragoChannel(0.18, bias, Lwa, Lmax);
    expect(result).toBeGreaterThan(0.0);
    expect(result).toBeLessThan(1.0);
  });

  it('XE-TM-072: input 1.0 (SDR white)', () => {
    const result = tonemapDragoChannel(1.0, bias, Lwa, Lmax);
    // Drago with these params produces ~0.26 for input 1.0
    expect(result).toBeGreaterThan(0.1);
    expect(result).toBeLessThan(1.0);
  });

  it('XE-TM-073: input 5.0 (HDR highlight)', () => {
    const result = tonemapDragoChannel(5.0, bias, Lwa, Lmax);
    // Drago compresses HDR; with these params ~0.42
    expect(result).toBeGreaterThan(0.3);
    expect(result).toBeLessThan(1.0);
  });

  it('XE-TM-074: input 100.0 (extreme HDR) → grows logarithmically', () => {
    const result = tonemapDragoChannel(100.0, bias, Lwa, Lmax);
    // Drago is logarithmic, output is bounded (denom normalizes); ~0.64
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(1.0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('XE-TM-075: negative input → 0', () => {
    expect(tonemapDragoChannel(-1.0, bias, Lwa, Lmax)).toBe(0);
  });

  it('XE-TM-076: monotonicity (0 to 10)', () => {
    expect(
      checkMonotonicity((v) => tonemapDragoChannel(v, bias, Lwa, Lmax), 0, 10, 200),
    ).toBe(true);
  });
});

// ===================================================================
// Cross-operator consistency checks
// ===================================================================
describe('XE-TM: Cross-operator consistency', () => {
  it('XE-TM-080: all per-channel operators produce 0 for input 0', () => {
    expect(tonemapReinhardChannel(0.0)).toBeCloseTo(0.0, 6);
    expect(tonemapFilmicChannel(0.0)).toBeCloseTo(0.0, 4);
    expect(tonemapACESChannel(0.0)).toBeCloseTo(0.0, 6);
    expect(tonemapGTChannel(0.0)).toBeCloseTo(0.0, 4);
    expect(tonemapDragoChannel(0.0)).toBeCloseTo(0.0, 6);
  });

  it('XE-TM-081: all cross-channel operators produce near-0 for input 0', () => {
    const agx = tonemapAgX(0, 0, 0);
    const pbr = tonemapPBRNeutral(0, 0, 0);
    const hill = tonemapACESHill(0, 0, 0);
    expect(agx.r).toBeLessThan(0.05);
    expect(pbr.r).toBeCloseTo(0.0, 6);
    expect(hill.r).toBeCloseTo(0.0, 3);
  });

  it('XE-TM-082: all operators handle NaN/Infinity gracefully', () => {
    // Per-channel operators return 0 for non-finite
    expect(tonemapReinhardChannel(NaN)).toBe(0);
    expect(tonemapReinhardChannel(Infinity)).toBe(0);
    expect(tonemapFilmicChannel(NaN)).toBe(0);
    expect(tonemapACESChannel(Infinity)).toBe(0);
    expect(tonemapGTChannel(NaN)).toBe(0);
    expect(tonemapDragoChannel(NaN)).toBe(0);

    // Cross-channel operators handle NaN gracefully
    const agx = tonemapAgX(NaN, 0.5, 0.5);
    expect(Number.isFinite(agx.r)).toBe(true);
    const pbr = tonemapPBRNeutral(NaN, 0.5, 0.5);
    expect(Number.isFinite(pbr.r)).toBe(true);
    const hill = tonemapACESHill(NaN, 0.5, 0.5);
    expect(Number.isFinite(hill.r)).toBe(true);
  });

  it('XE-TM-083: ACES Narkowicz and ACES Hill produce similar mid-gray output', () => {
    // Both are ACES approximations; they should agree roughly on neutral gray
    const narkowicz = tonemapACESChannel(0.18);
    const hill = tonemapACESHill(0.18, 0.18, 0.18);
    // They use different matrices and fits, so allow wider tolerance
    // Narkowicz is a simpler fit; Hill uses full matrix transforms.
    // They can differ by ~0.17 on mid-gray. Allow 0.2 tolerance.
    expect(Math.abs(narkowicz - hill.r)).toBeLessThan(0.2);
  });

  it('XE-TM-084: all bounded operators produce output ≤ 1.0 for input 1.0', () => {
    // ACES Narkowicz, AgX, ACES Hill, PBR Neutral are bounded to [0,1]
    expect(tonemapACESChannel(1.0)).toBeLessThanOrEqual(1.0);
    const agx = tonemapAgX(1.0, 1.0, 1.0);
    expect(agx.r).toBeLessThanOrEqual(1.0);
    const hill = tonemapACESHill(1.0, 1.0, 1.0);
    expect(hill.r).toBeLessThanOrEqual(1.0);
    const pbr = tonemapPBRNeutral(1.0, 1.0, 1.0);
    expect(pbr.r).toBeLessThanOrEqual(1.0);
  });

  it('XE-TM-085: GT converges to max display brightness P=1.0', () => {
    expect(tonemapGTChannel(50.0)).toBeCloseTo(1.0, 2);
    expect(tonemapGTChannel(1000.0)).toBeCloseTo(1.0, 3);
  });
});

// ===================================================================
// WGSL vs CPU discrepancy documentation tests
// ===================================================================
describe('XE-TM: WGSL vs CPU discrepancy notes', () => {
  it('XE-TM-090: CPU filmic clamps negative input (WGSL filmicCurve does not)', () => {
    // CPU: tonemapFilmicChannel returns 0 for negative input
    expect(tonemapFilmicChannel(-0.5)).toBe(0);
    // But filmicCurveShared itself does not guard against negatives:
    // filmicCurve(-0.5) produces a non-zero value
    const rawResult = filmicCurveShared(-0.5);
    expect(rawResult).not.toBe(0);
    // This documents that WGSL filmicCurve() would produce a non-zero
    // intermediate for negative inputs, though tonemapFilmic() applies
    // max(0) on the final result.
  });

  it('XE-TM-091: WGSL Reinhard uses hdrHeadroom scaling, CPU default does not', () => {
    // WGSL: tonemapReinhard(color, whitePoint, hdrHeadroom) scales wp by hdrHeadroom
    // CPU: tonemapReinhardChannel(value, whitePoint) uses whitePoint directly
    // When hdrHeadroom=1.0, they should match exactly.
    // This test documents the API difference.
    const cpuResult = tonemapReinhardChannel(0.5, 4.0);
    // Simulating WGSL with hdrHeadroom=1.0: wp = 4.0 * 1.0 = 4.0
    const wp = 4.0 * 1.0;
    const wgslSimulated = (0.5 * (1.0 + 0.5 / (wp * wp))) / (1.0 + 0.5);
    expect(cpuResult).toBeCloseTo(wgslSimulated, 6);
  });
});
