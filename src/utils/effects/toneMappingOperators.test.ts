/**
 * Tone Mapping Operators - Unit Tests
 *
 * Tests for the CPU-side tone mapping math functions in effectProcessing.shared.ts.
 * These verify mathematical correctness, monotonicity, boundary behavior,
 * operator comparison, and negative value visualization.
 */

import { describe, it, expect } from 'vitest';
import {
  tonemapReinhardChannel,
  tonemapFilmicChannel,
  tonemapACESChannel,
  tonemapAgX,
  tonemapPBRNeutral,
  tonemapGTChannel,
  tonemapACESHill,
  applyToneMappingToChannel,
  applyToneMappingToRGB,
  applyToneMappingToData,
} from './effectProcessing.shared';

// ============================================================================
// Reinhard Tone Mapping
// ============================================================================

describe('Reinhard Tone Mapping', () => {
  it('HDRTM-U001: black (0) maps to 0', () => {
    expect(tonemapReinhardChannel(0)).toBe(0);
  });

  it('HDRTM-U002: output equals 1.0 at white point and exceeds above', () => {
    // Extended Reinhard: output = 1.0 at L = whitePoint
    const atWhitePoint = tonemapReinhardChannel(4.0); // default wp=4.0
    expect(atWhitePoint).toBeCloseTo(1.0, 10);
    // Values above white point map above 1.0 (will be clamped by display)
    const aboveWp = tonemapReinhardChannel(10.0);
    expect(aboveWp).toBeGreaterThan(1.0);
  });

  it('HDRTM-U003: monotonically increasing', () => {
    const values = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
    const outputs = values.map(v => tonemapReinhardChannel(v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThan(outputs[i - 1]!);
    }
  });

  it('HDRTM-U004: extended reinhard formula L * (1 + L/Lw^2) / (1 + L)', () => {
    const input = 0.5;
    const wp = 4.0; // default white point
    const wp2 = wp * wp;
    const expected = input * (1.0 + input / wp2) / (1.0 + input);
    expect(tonemapReinhardChannel(input)).toBeCloseTo(expected, 10);
  });

  it('HDRTM-U005: value 1.0 maps to ~0.53125 with default white point 4.0', () => {
    // 1.0 * (1 + 1/16) / (1 + 1) = 1.0625 / 2.0 = 0.53125
    expect(tonemapReinhardChannel(1.0)).toBeCloseTo(0.53125, 10);
  });

  it('HDRTM-U006: handles NaN input', () => {
    expect(tonemapReinhardChannel(NaN)).toBe(0);
  });

  it('HDRTM-U007: handles Infinity input', () => {
    expect(tonemapReinhardChannel(Infinity)).toBe(0);
  });

  it('HDRTM-U008: handles negative input', () => {
    expect(tonemapReinhardChannel(-0.5)).toBe(0);
  });

  it('HDRTM-U009: operates per-channel independently', () => {
    const wp = 4.0;
    const wp2 = wp * wp;
    const r = tonemapReinhardChannel(0.5);
    const g = tonemapReinhardChannel(1.0);
    const b = tonemapReinhardChannel(2.0);
    // Each should match extended reinhard: L * (1 + L/wp2) / (1 + L)
    expect(r).toBeCloseTo(0.5 * (1.0 + 0.5 / wp2) / (1.0 + 0.5), 10);
    expect(g).toBeCloseTo(1.0 * (1.0 + 1.0 / wp2) / (1.0 + 1.0), 10);
    expect(b).toBeCloseTo(2.0 * (1.0 + 2.0 / wp2) / (1.0 + 2.0), 10);
  });

  it('HDRTM-U009b: custom white point is respected', () => {
    const wp = 2.0;
    const wp2 = wp * wp;
    const input = 1.0;
    const expected = input * (1.0 + input / wp2) / (1.0 + input);
    expect(tonemapReinhardChannel(input, wp)).toBeCloseTo(expected, 10);
  });
});

// ============================================================================
// Filmic Tone Mapping
// ============================================================================

describe('Filmic Tone Mapping', () => {
  it('HDRTM-U010: black (0) maps to approximately 0', () => {
    const result = tonemapFilmicChannel(0);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(0.01);
  });

  it('HDRTM-U011: high input maps close to 1.0', () => {
    const result = tonemapFilmicChannel(10.0);
    expect(result).toBeGreaterThan(0.9);
    // Filmic Hable curve can slightly exceed 1.0 for very high inputs due to whiteScale normalization
    expect(result).toBeLessThanOrEqual(1.2);
  });

  it('HDRTM-U012: monotonically increasing for positive input', () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapFilmicChannel(v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThan(outputs[i - 1]!);
    }
  });

  it('HDRTM-U013: S-curve has shoulder region with lower slope', () => {
    const mid1 = tonemapFilmicChannel(0.2);
    const mid2 = tonemapFilmicChannel(0.4);
    const shoulder1 = tonemapFilmicChannel(2.0);
    const shoulder2 = tonemapFilmicChannel(4.0);

    const midSlope = (mid2 - mid1) / (0.4 - 0.2);
    const shoulderSlope = (shoulder2 - shoulder1) / (4.0 - 2.0);
    expect(shoulderSlope).toBeLessThan(midSlope);
  });

  it('HDRTM-U014: output is non-negative for all positive inputs', () => {
    const values = [0, 0.001, 0.01, 0.1, 1.0, 10.0];
    for (const v of values) {
      expect(tonemapFilmicChannel(v)).toBeGreaterThanOrEqual(0);
    }
  });

  it('HDRTM-U015: handles NaN input', () => {
    expect(tonemapFilmicChannel(NaN)).toBe(0);
  });

  it('HDRTM-U016: handles negative input', () => {
    expect(tonemapFilmicChannel(-1.0)).toBe(0);
  });
});

// ============================================================================
// ACES Tone Mapping
// ============================================================================

describe('ACES Tone Mapping', () => {
  it('HDRTM-U020: black maps to near-black', () => {
    const result = tonemapACESChannel(0);
    expect(result).toBeCloseTo(0, 2);
  });

  it('HDRTM-U021: output clamped to [0, 1]', () => {
    const inputs = [0.1, 0.5, 1.0, 5.0, 100.0];
    for (const val of inputs) {
      const result = tonemapACESChannel(val);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });

  it('HDRTM-U022: monotonically increasing', () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapACESChannel(v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThan(outputs[i - 1]!);
    }
  });

  it('HDRTM-U023: mid-grey (0.18) maps to reasonable display value', () => {
    const result = tonemapACESChannel(0.18);
    expect(result).toBeGreaterThan(0.05);
    expect(result).toBeLessThan(0.30);
  });

  it('HDRTM-U024: handles NaN input', () => {
    expect(tonemapACESChannel(NaN)).toBe(0);
  });

  it('HDRTM-U025: handles Infinity input', () => {
    expect(tonemapACESChannel(Infinity)).toBe(0);
  });

  it('HDRTM-U026: handles negative input', () => {
    expect(tonemapACESChannel(-0.5)).toBe(0);
  });

  it('HDRTM-U027: ACES formula verification for known value', () => {
    // ACES: (x * (2.51x + 0.03)) / (x * (2.43x + 0.59) + 0.14)
    const x = 0.5;
    const expected = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    expect(tonemapACESChannel(x)).toBeCloseTo(expected, 10);
  });
});

// ============================================================================
// AgX Tone Mapping
// ============================================================================

describe('AgX Tone Mapping', () => {
  it('black (0,0,0) maps to near-black', () => {
    const result = tonemapAgX(0, 0, 0);
    expect(result.r).toBeCloseTo(0, 1);
    expect(result.g).toBeCloseTo(0, 1);
    expect(result.b).toBeCloseTo(0, 1);
  });

  it('output is bounded to [0, 1]', () => {
    const inputs = [
      [0.1, 0.2, 0.3],
      [0.5, 0.5, 0.5],
      [1.0, 1.0, 1.0],
      [5.0, 3.0, 1.0],
      [10.0, 10.0, 10.0],
    ];
    for (const [r, g, b] of inputs) {
      const result = tonemapAgX(r!, g!, b!);
      expect(result.r).toBeGreaterThanOrEqual(0);
      expect(result.r).toBeLessThanOrEqual(1);
      expect(result.g).toBeGreaterThanOrEqual(0);
      expect(result.g).toBeLessThanOrEqual(1);
      expect(result.b).toBeGreaterThanOrEqual(0);
      expect(result.b).toBeLessThanOrEqual(1);
    }
  });

  it('monotonically increasing for equal-channel input', () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapAgX(v, v, v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]!.r).toBeGreaterThan(outputs[i - 1]!.r);
    }
  });

  it('preserves hue direction for saturated red input', () => {
    const result = tonemapAgX(1.0, 0.1, 0.1);
    // Red channel should be dominant
    expect(result.r).toBeGreaterThan(result.g);
    expect(result.r).toBeGreaterThan(result.b);
  });

  it('preserves hue direction for saturated green input', () => {
    const result = tonemapAgX(0.1, 1.0, 0.1);
    expect(result.g).toBeGreaterThan(result.r);
    expect(result.g).toBeGreaterThan(result.b);
  });

  it('preserves hue direction for saturated blue input', () => {
    const result = tonemapAgX(0.1, 0.1, 1.0);
    expect(result.b).toBeGreaterThan(result.r);
    expect(result.b).toBeGreaterThan(result.g);
  });

  it('handles NaN input', () => {
    const result = tonemapAgX(NaN, 0.5, 0.5);
    expect(Number.isFinite(result.r)).toBe(true);
    expect(Number.isFinite(result.g)).toBe(true);
    expect(Number.isFinite(result.b)).toBe(true);
  });

  it('handles negative input', () => {
    const result = tonemapAgX(-0.5, 0.5, 0.5);
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.g).toBeGreaterThanOrEqual(0);
    expect(result.b).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// PBR Neutral Tone Mapping
// ============================================================================

describe('PBR Neutral Tone Mapping', () => {
  it('black (0,0,0) maps to near-black', () => {
    const result = tonemapPBRNeutral(0, 0, 0);
    expect(result.r).toBeCloseTo(0, 2);
    expect(result.g).toBeCloseTo(0, 2);
    expect(result.b).toBeCloseTo(0, 2);
  });

  it('low values pass through nearly unchanged', () => {
    // PBR Neutral is designed to be near-identity for low values
    const result = tonemapPBRNeutral(0.2, 0.2, 0.2);
    expect(result.r).toBeCloseTo(0.2, 1);
    expect(result.g).toBeCloseTo(0.2, 1);
    expect(result.b).toBeCloseTo(0.2, 1);
  });

  it('output is bounded for high inputs', () => {
    const inputs = [
      [1.0, 1.0, 1.0],
      [5.0, 3.0, 1.0],
      [10.0, 10.0, 10.0],
    ];
    for (const [r, g, b] of inputs) {
      const result = tonemapPBRNeutral(r!, g!, b!);
      expect(result.r).toBeGreaterThanOrEqual(0);
      expect(result.g).toBeGreaterThanOrEqual(0);
      expect(result.b).toBeGreaterThanOrEqual(0);
      // PBR Neutral compresses to approximately [0, 1]
      expect(result.r).toBeLessThanOrEqual(1.1);
      expect(result.g).toBeLessThanOrEqual(1.1);
      expect(result.b).toBeLessThanOrEqual(1.1);
    }
  });

  it('monotonically increasing for equal-channel input', () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapPBRNeutral(v, v, v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]!.r).toBeGreaterThan(outputs[i - 1]!.r);
    }
  });

  it('preserves hue direction for saturated red input', () => {
    const result = tonemapPBRNeutral(1.0, 0.1, 0.1);
    expect(result.r).toBeGreaterThan(result.g);
    expect(result.r).toBeGreaterThan(result.b);
  });

  it('handles NaN input', () => {
    const result = tonemapPBRNeutral(NaN, 0.5, 0.5);
    expect(Number.isFinite(result.r)).toBe(true);
    expect(Number.isFinite(result.g)).toBe(true);
    expect(Number.isFinite(result.b)).toBe(true);
  });

  it('handles negative input', () => {
    const result = tonemapPBRNeutral(-0.5, 0.5, 0.5);
    expect(result.r).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// GT (Gran Turismo) Tone Mapping
// ============================================================================

describe('GT Tone Mapping', () => {
  it('black (0) maps to 0', () => {
    expect(tonemapGTChannel(0)).toBeCloseTo(0, 2);
  });

  it('output approaches 1.0 for high input', () => {
    const result = tonemapGTChannel(10.0);
    expect(result).toBeGreaterThan(0.9);
    expect(result).toBeLessThanOrEqual(1.01);
  });

  it('monotonically increasing', () => {
    const values = [0.01, 0.1, 0.22, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapGTChannel(v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]!);
    }
  });

  it('output is bounded to [0, 1]', () => {
    const values = [0, 0.01, 0.1, 0.5, 1.0, 5.0, 100.0];
    for (const v of values) {
      const result = tonemapGTChannel(v);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1.01);
    }
  });

  it('handles NaN input', () => {
    expect(tonemapGTChannel(NaN)).toBe(0);
  });

  it('handles Infinity input', () => {
    expect(tonemapGTChannel(Infinity)).toBe(0);
  });

  it('handles negative input', () => {
    expect(tonemapGTChannel(-0.5)).toBe(0);
  });

  it('has smooth transition through linear section', () => {
    // The linear section starts at m=0.22
    const v1 = tonemapGTChannel(0.22);
    const v2 = tonemapGTChannel(0.30);
    const v3 = tonemapGTChannel(0.40);
    // All should be increasing
    expect(v2).toBeGreaterThan(v1);
    expect(v3).toBeGreaterThan(v2);
  });
});

// ============================================================================
// ACES Hill Tone Mapping
// ============================================================================

describe('ACES Hill Tone Mapping', () => {
  it('black (0,0,0) maps to near-black', () => {
    const result = tonemapACESHill(0, 0, 0);
    expect(result.r).toBeCloseTo(0, 2);
    expect(result.g).toBeCloseTo(0, 2);
    expect(result.b).toBeCloseTo(0, 2);
  });

  it('output is bounded to [0, 1]', () => {
    const inputs = [
      [0.1, 0.2, 0.3],
      [0.5, 0.5, 0.5],
      [1.0, 1.0, 1.0],
      [5.0, 3.0, 1.0],
      [10.0, 10.0, 10.0],
    ];
    for (const [r, g, b] of inputs) {
      const result = tonemapACESHill(r!, g!, b!);
      expect(result.r).toBeGreaterThanOrEqual(0);
      expect(result.r).toBeLessThanOrEqual(1);
      expect(result.g).toBeGreaterThanOrEqual(0);
      expect(result.g).toBeLessThanOrEqual(1);
      expect(result.b).toBeGreaterThanOrEqual(0);
      expect(result.b).toBeLessThanOrEqual(1);
    }
  });

  it('monotonically increasing for equal-channel input', () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapACESHill(v, v, v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]!.r).toBeGreaterThan(outputs[i - 1]!.r);
    }
  });

  it('preserves hue direction for saturated red input', () => {
    const result = tonemapACESHill(1.0, 0.1, 0.1);
    expect(result.r).toBeGreaterThan(result.g);
    expect(result.r).toBeGreaterThan(result.b);
  });

  it('preserves hue direction for saturated green input', () => {
    const result = tonemapACESHill(0.1, 1.0, 0.1);
    expect(result.g).toBeGreaterThan(result.r);
    expect(result.g).toBeGreaterThan(result.b);
  });

  it('preserves hue direction for saturated blue input', () => {
    const result = tonemapACESHill(0.1, 0.1, 1.0);
    expect(result.b).toBeGreaterThan(result.r);
    expect(result.b).toBeGreaterThan(result.g);
  });

  it('handles NaN input', () => {
    const result = tonemapACESHill(NaN, 0.5, 0.5);
    expect(Number.isFinite(result.r)).toBe(true);
    expect(Number.isFinite(result.g)).toBe(true);
    expect(Number.isFinite(result.b)).toBe(true);
  });

  it('handles negative input', () => {
    const result = tonemapACESHill(-0.5, 0.5, 0.5);
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.g).toBeGreaterThanOrEqual(0);
    expect(result.b).toBeGreaterThanOrEqual(0);
  });

  it('mid-grey (0.18) maps to reasonable display value', () => {
    const result = tonemapACESHill(0.18, 0.18, 0.18);
    expect(result.r).toBeGreaterThan(0.05);
    expect(result.r).toBeLessThan(0.40);
  });
});

// ============================================================================
// Operator Comparison
// ============================================================================

describe('Operator Comparison', () => {
  it('HDRTM-U060: all operators produce different output for same input', () => {
    const input = 0.5;
    const rReinhard = tonemapReinhardChannel(input);
    const rFilmic = tonemapFilmicChannel(input);
    const rACES = tonemapACESChannel(input);

    expect(rReinhard).not.toBeCloseTo(rFilmic, 3);
    expect(rFilmic).not.toBeCloseTo(rACES, 3);
    expect(rReinhard).not.toBeCloseTo(rACES, 3);
  });

  it('HDRTM-U061: all operators map 0 to approximately 0', () => {
    expect(tonemapReinhardChannel(0)).toBeCloseTo(0, 2);
    expect(tonemapFilmicChannel(0)).toBeCloseTo(0, 1);
    expect(tonemapACESChannel(0)).toBeCloseTo(0, 2);
    expect(tonemapGTChannel(0)).toBeCloseTo(0, 2);

    const agx = tonemapAgX(0, 0, 0);
    expect(agx.r).toBeCloseTo(0, 1);

    const pbr = tonemapPBRNeutral(0, 0, 0);
    expect(pbr.r).toBeCloseTo(0, 2);

    const hill = tonemapACESHill(0, 0, 0);
    expect(hill.r).toBeCloseTo(0, 2);
  });

  it('HDRTM-U062: all operators compress HDR range toward SDR', () => {
    const hdrValue = 10.0;
    const rR = tonemapReinhardChannel(hdrValue);
    const rF = tonemapFilmicChannel(hdrValue);
    const rA = tonemapACESChannel(hdrValue);
    const rGT = tonemapGTChannel(hdrValue);
    const rAgX = tonemapAgX(hdrValue, hdrValue, hdrValue);
    const rPBR = tonemapPBRNeutral(hdrValue, hdrValue, hdrValue);
    const rHill = tonemapACESHill(hdrValue, hdrValue, hdrValue);

    // Extended Reinhard: values above white point (4.0) can exceed 1.0
    expect(rR).toBeGreaterThan(1.0);
    expect(rR).toBeLessThan(hdrValue); // but still compressed from input
    // Filmic Hable curve can slightly exceed 1.0 for very high inputs
    expect(rF).toBeLessThanOrEqual(1.2);
    expect(rA).toBeLessThanOrEqual(1.0);
    expect(rF).toBeGreaterThan(0.9);
    expect(rA).toBeGreaterThan(0.9);

    // New operators compress to [0, 1]
    expect(rGT).toBeLessThanOrEqual(1.01);
    expect(rGT).toBeGreaterThan(0.9);
    expect(rAgX.r).toBeLessThanOrEqual(1.0);
    expect(rAgX.r).toBeGreaterThan(0.5);
    expect(rPBR.r).toBeLessThanOrEqual(1.1);
    expect(rPBR.r).toBeGreaterThan(0.5);
    expect(rHill.r).toBeLessThanOrEqual(1.0);
    expect(rHill.r).toBeGreaterThan(0.5);
  });

  it('all seven operators produce distinct results for grey input', () => {
    const v = 0.5;
    const results = [
      tonemapReinhardChannel(v),
      tonemapFilmicChannel(v),
      tonemapACESChannel(v),
      tonemapGTChannel(v),
      tonemapAgX(v, v, v).r,
      tonemapPBRNeutral(v, v, v).r,
      tonemapACESHill(v, v, v).r,
    ];
    // Check all pairs are different
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        expect(Math.abs(results[i]! - results[j]!)).toBeGreaterThan(0.001);
      }
    }
  });
});

// ============================================================================
// applyToneMappingToChannel dispatcher
// ============================================================================

describe('applyToneMappingToChannel', () => {
  it('dispatches to reinhard correctly', () => {
    const result = applyToneMappingToChannel(0.5, 'reinhard');
    expect(result).toBeCloseTo(tonemapReinhardChannel(0.5), 10);
  });

  it('dispatches to filmic correctly', () => {
    const result = applyToneMappingToChannel(0.5, 'filmic');
    expect(result).toBeCloseTo(tonemapFilmicChannel(0.5), 10);
  });

  it('dispatches to aces correctly', () => {
    const result = applyToneMappingToChannel(0.5, 'aces');
    expect(result).toBeCloseTo(tonemapACESChannel(0.5), 10);
  });

  it('dispatches to gt correctly', () => {
    const result = applyToneMappingToChannel(0.5, 'gt');
    expect(result).toBeCloseTo(tonemapGTChannel(0.5), 10);
  });

  it('returns value unchanged for off operator', () => {
    expect(applyToneMappingToChannel(0.5, 'off')).toBe(0.5);
  });

  it('returns value unchanged for unknown operator', () => {
    expect(applyToneMappingToChannel(0.5, 'unknown')).toBe(0.5);
  });
});

// ============================================================================
// applyToneMappingToRGB dispatcher
// ============================================================================

describe('applyToneMappingToRGB', () => {
  it('dispatches to reinhard correctly', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'reinhard');
    expect(result.r).toBeCloseTo(tonemapReinhardChannel(0.5), 10);
    expect(result.g).toBeCloseTo(tonemapReinhardChannel(0.3), 10);
    expect(result.b).toBeCloseTo(tonemapReinhardChannel(0.7), 10);
  });

  it('dispatches to filmic correctly', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'filmic');
    expect(result.r).toBeCloseTo(tonemapFilmicChannel(0.5), 10);
    expect(result.g).toBeCloseTo(tonemapFilmicChannel(0.3), 10);
    expect(result.b).toBeCloseTo(tonemapFilmicChannel(0.7), 10);
  });

  it('dispatches to aces correctly', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'aces');
    expect(result.r).toBeCloseTo(tonemapACESChannel(0.5), 10);
    expect(result.g).toBeCloseTo(tonemapACESChannel(0.3), 10);
    expect(result.b).toBeCloseTo(tonemapACESChannel(0.7), 10);
  });

  it('dispatches to agx correctly', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'agx');
    const direct = tonemapAgX(0.5, 0.3, 0.7);
    expect(result.r).toBeCloseTo(direct.r, 10);
    expect(result.g).toBeCloseTo(direct.g, 10);
    expect(result.b).toBeCloseTo(direct.b, 10);
  });

  it('dispatches to pbrNeutral correctly', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'pbrNeutral');
    const direct = tonemapPBRNeutral(0.5, 0.3, 0.7);
    expect(result.r).toBeCloseTo(direct.r, 10);
    expect(result.g).toBeCloseTo(direct.g, 10);
    expect(result.b).toBeCloseTo(direct.b, 10);
  });

  it('dispatches to gt correctly', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'gt');
    expect(result.r).toBeCloseTo(tonemapGTChannel(0.5), 10);
    expect(result.g).toBeCloseTo(tonemapGTChannel(0.3), 10);
    expect(result.b).toBeCloseTo(tonemapGTChannel(0.7), 10);
  });

  it('dispatches to acesHill correctly', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'acesHill');
    const direct = tonemapACESHill(0.5, 0.3, 0.7);
    expect(result.r).toBeCloseTo(direct.r, 10);
    expect(result.g).toBeCloseTo(direct.g, 10);
    expect(result.b).toBeCloseTo(direct.b, 10);
  });

  it('returns value unchanged for off operator', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'off');
    expect(result.r).toBe(0.5);
    expect(result.g).toBe(0.3);
    expect(result.b).toBe(0.7);
  });

  it('returns value unchanged for unknown operator', () => {
    const result = applyToneMappingToRGB(0.5, 0.3, 0.7, 'unknown');
    expect(result.r).toBe(0.5);
    expect(result.g).toBe(0.3);
    expect(result.b).toBe(0.7);
  });
});

// ============================================================================
// applyToneMappingToData (pixel array processing)
// ============================================================================

describe('applyToneMappingToData', () => {
  function createPixelData(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
    return new Uint8ClampedArray([r, g, b, a]);
  }

  it('off operator does not modify data', () => {
    const data = createPixelData(128, 200, 50);
    const originalR = data[0];
    const originalG = data[1];
    const originalB = data[2];
    const originalA = data[3];

    applyToneMappingToData(data, 'off');

    expect(data[0]).toBe(originalR);
    expect(data[1]).toBe(originalG);
    expect(data[2]).toBe(originalB);
    expect(data[3]).toBe(originalA);
  });

  it('reinhard maps black to black', () => {
    const data = createPixelData(0, 0, 0);
    applyToneMappingToData(data, 'reinhard');
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  it('reinhard compresses bright values', () => {
    const data = createPixelData(255, 255, 255);
    applyToneMappingToData(data, 'reinhard');
    // 255/255=1.0, extended reinhard with wp=4.0: 1.0*(1+1/16)/(1+1) = 0.53125, 0.53125*255 ~= 135
    expect(data[0]).toBe(135);
    expect(data[1]).toBe(135);
    expect(data[2]).toBe(135);
  });

  it('preserves alpha channel', () => {
    const data = createPixelData(128, 128, 128, 200);
    applyToneMappingToData(data, 'reinhard');
    expect(data[3]).toBe(200);
  });

  it('filmic maps black to black', () => {
    const data = createPixelData(0, 0, 0);
    applyToneMappingToData(data, 'filmic');
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
  });

  it('aces produces valid output for all input values', () => {
    for (let v = 0; v <= 255; v += 51) {
      const data = createPixelData(v, v, v);
      applyToneMappingToData(data, 'aces');
      expect(data[0]).toBeGreaterThanOrEqual(0);
      expect(data[0]).toBeLessThanOrEqual(255);
    }
  });

  it('new operators produce valid output for all input values', () => {
    const newOps = ['agx', 'pbrNeutral', 'gt', 'acesHill'];
    for (const op of newOps) {
      for (let v = 0; v <= 255; v += 51) {
        const data = createPixelData(v, v, v);
        applyToneMappingToData(data, op);
        expect(data[0]).toBeGreaterThanOrEqual(0);
        expect(data[0]).toBeLessThanOrEqual(255);
        expect(data[3]).toBe(255); // alpha preserved
      }
    }
  });

  it('preserves brightness ordering across all operators', () => {
    const operators = ['reinhard', 'filmic', 'aces', 'agx', 'pbrNeutral', 'gt', 'acesHill'] as const;

    for (const op of operators) {
      const dark = createPixelData(64, 64, 64);
      const mid = createPixelData(128, 128, 128);
      const bright = createPixelData(255, 255, 255);

      applyToneMappingToData(dark, op);
      applyToneMappingToData(mid, op);
      applyToneMappingToData(bright, op);

      expect(dark[0]).toBeLessThan(mid[0]!);
      expect(mid[0]).toBeLessThan(bright[0]!);
    }
  });

  it('processes multiple pixels correctly', () => {
    const data = new Uint8ClampedArray([
      64, 64, 64, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);

    applyToneMappingToData(data, 'reinhard');

    // All should be valid
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
      // Alpha should be preserved
      expect(data[i + 3]).toBe(255);
    }

    // Ordering preserved
    expect(data[0]).toBeLessThan(data[4]!);
    expect(data[4]).toBeLessThan(data[8]!);
  });

  it('different operators produce different results', () => {
    const operators = ['reinhard', 'filmic', 'aces', 'agx', 'gt', 'pbrNeutral', 'acesHill'];
    const results = operators.map((op) => {
      const data = createPixelData(200, 200, 200);
      applyToneMappingToData(data, op);
      return data[0];
    });

    // Not all operators should produce the same result
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);

    // At least some known-different pairs should differ
    expect(results[0]).not.toBe(results[1]); // reinhard vs filmic
    expect(results[1]).not.toBe(results[2]); // filmic vs aces
  });

  it('agx preserves alpha channel on pixel data', () => {
    const data = createPixelData(200, 100, 50, 128);
    applyToneMappingToData(data, 'agx');
    expect(data[3]).toBe(128);
  });

  it('acesHill preserves alpha channel on pixel data', () => {
    const data = createPixelData(200, 100, 50, 128);
    applyToneMappingToData(data, 'acesHill');
    expect(data[3]).toBe(128);
  });
});

// ============================================================================
// GPU/CPU Parity
// ============================================================================

describe('GPU/CPU Parity with shared functions', () => {
  it('Reinhard matches GPU formula: c * (1 + c/wp2) / (1 + c) with default wp=4.0', () => {
    const testValues = [0, 0.25, 0.5, 0.75, 1.0, 2.0, 5.0];
    const wp = 4.0;
    const wp2 = wp * wp;
    for (const x of testValues) {
      const gpuResult = x * (1.0 + x / wp2) / (1.0 + x);
      const cpuResult = tonemapReinhardChannel(x);
      expect(cpuResult).toBeCloseTo(gpuResult, 10);
    }
  });

  it('Reinhard matches GPU formula with custom white point', () => {
    const testValues = [0, 0.25, 0.5, 0.75, 1.0, 2.0, 5.0];
    const wp = 2.0;
    const wp2 = wp * wp;
    for (const x of testValues) {
      const gpuResult = x * (1.0 + x / wp2) / (1.0 + x);
      const cpuResult = tonemapReinhardChannel(x, wp);
      expect(cpuResult).toBeCloseTo(gpuResult, 10);
    }
  });

  it('Filmic matches GPU formula with custom parameters', () => {
    const testValues = [0.1, 0.25, 0.5, 0.75, 1.0];
    const exposureBias = 3.0;
    const whitePoint = 8.0;
    for (const x of testValues) {
      // GPU: filmic(exposureBias * color) / filmic(whitePoint)
      const A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
      const filmicFn = (v: number) => ((v * (A * v + C * B) + D * E) / (v * (A * v + B) + D * F)) - E / F;
      const gpuResult = Math.max(0, filmicFn(exposureBias * x) / filmicFn(whitePoint));
      const cpuResult = tonemapFilmicChannel(x, exposureBias, whitePoint);
      expect(cpuResult).toBeCloseTo(gpuResult, 10);
    }
  });

  it('ACES matches GPU formula', () => {
    const testValues = [0, 0.25, 0.5, 0.75, 1.0];
    for (const x of testValues) {
      const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      const gpuResult = Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
      const cpuResult = tonemapACESChannel(x);
      expect(cpuResult).toBeCloseTo(gpuResult, 10);
    }
  });

  it('Filmic never produces negative values', () => {
    for (let i = 0; i <= 255; i++) {
      const x = i / 255;
      expect(tonemapFilmicChannel(x)).toBeGreaterThanOrEqual(0);
    }
  });

  it('ACES Hill CPU matches GPU matrix+RRT formula', () => {
    // Verify the CPU implementation matches the ACES Hill GPU formula
    const testValues = [0.1, 0.25, 0.5, 0.75, 1.0];
    for (const v of testValues) {
      const r = v, g = v, b = v;

      // GPU formula (row-major interpretation):
      // ACESInput: sRGB → AP1
      const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
      const ig = 0.07600 * r + 0.90834 * g + 0.01566 * b;
      const ib = 0.02840 * r + 0.13383 * g + 0.83777 * b;

      // RRT+ODT fit
      const fitR = (ir * (ir + 0.0245786) - 0.000090537) / (ir * (0.983729 * ir + 0.4329510) + 0.238081);
      const fitG = (ig * (ig + 0.0245786) - 0.000090537) / (ig * (0.983729 * ig + 0.4329510) + 0.238081);
      const fitB = (ib * (ib + 0.0245786) - 0.000090537) / (ib * (0.983729 * ib + 0.4329510) + 0.238081);

      // ACESOutput: AP1 → sRGB
      const gpuR = Math.max(0, Math.min(1,  1.60475 * fitR + (-0.53108) * fitG + (-0.07367) * fitB));
      const gpuG = Math.max(0, Math.min(1, (-0.10208) * fitR + 1.10813 * fitG + (-0.00605) * fitB));
      const gpuB = Math.max(0, Math.min(1, (-0.00327) * fitR + (-0.07276) * fitG + 1.07602 * fitB));

      const cpuResult = tonemapACESHill(r, g, b);
      expect(cpuResult.r).toBeCloseTo(gpuR, 10);
      expect(cpuResult.g).toBeCloseTo(gpuG, 10);
      expect(cpuResult.b).toBeCloseTo(gpuB, 10);
    }
  });

  it('GT never produces negative values', () => {
    for (let i = 0; i <= 255; i++) {
      const x = i / 255;
      expect(tonemapGTChannel(x)).toBeGreaterThanOrEqual(0);
    }
  });
});
