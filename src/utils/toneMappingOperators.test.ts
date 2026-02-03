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
  applyToneMappingToChannel,
  applyToneMappingToData,
} from './effectProcessing.shared';

// ============================================================================
// Reinhard Tone Mapping
// ============================================================================

describe('Reinhard Tone Mapping', () => {
  it('HDRTM-U001: black (0) maps to 0', () => {
    expect(tonemapReinhardChannel(0)).toBe(0);
  });

  it('HDRTM-U002: output is always less than 1.0 for finite input', () => {
    const r = tonemapReinhardChannel(100);
    expect(r).toBeLessThan(1.0);
    expect(r).toBeGreaterThan(0.99);
  });

  it('HDRTM-U003: monotonically increasing', () => {
    const values = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
    const outputs = values.map(v => tonemapReinhardChannel(v));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThan(outputs[i - 1]!);
    }
  });

  it('HDRTM-U004: basic reinhard formula c / (c + 1)', () => {
    const input = 0.5;
    const expected = input / (input + 1); // 0.5 / 1.5 = 0.333...
    expect(tonemapReinhardChannel(input)).toBeCloseTo(expected, 10);
  });

  it('HDRTM-U005: value 1.0 maps to 0.5', () => {
    expect(tonemapReinhardChannel(1.0)).toBeCloseTo(0.5, 10);
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
    const r = tonemapReinhardChannel(0.5);
    const g = tonemapReinhardChannel(1.0);
    const b = tonemapReinhardChannel(2.0);
    // Each should be the same as individually computed
    expect(r).toBeCloseTo(0.5 / 1.5, 10);
    expect(g).toBeCloseTo(1.0 / 2.0, 10);
    expect(b).toBeCloseTo(2.0 / 3.0, 10);
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
  });

  it('HDRTM-U062: all operators compress HDR range to SDR', () => {
    const hdrValue = 10.0;
    const rR = tonemapReinhardChannel(hdrValue);
    const rF = tonemapFilmicChannel(hdrValue);
    const rA = tonemapACESChannel(hdrValue);

    expect(rR).toBeLessThanOrEqual(1.0);
    // Filmic Hable curve can slightly exceed 1.0 for very high inputs
    expect(rF).toBeLessThanOrEqual(1.2);
    expect(rA).toBeLessThanOrEqual(1.0);
    expect(rR).toBeGreaterThan(0.9);
    expect(rF).toBeGreaterThan(0.9);
    expect(rA).toBeGreaterThan(0.9);
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

  it('returns value unchanged for off operator', () => {
    expect(applyToneMappingToChannel(0.5, 'off')).toBe(0.5);
  });

  it('returns value unchanged for unknown operator', () => {
    expect(applyToneMappingToChannel(0.5, 'unknown')).toBe(0.5);
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
    // 255/255=1.0, reinhard(1.0) = 0.5, 0.5*255 = 128
    expect(data[0]).toBe(128);
    expect(data[1]).toBe(128);
    expect(data[2]).toBe(128);
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

  it('preserves brightness ordering across operators', () => {
    const operators = ['reinhard', 'filmic', 'aces'] as const;

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
    const reinhardData = createPixelData(200, 200, 200);
    const filmicData = createPixelData(200, 200, 200);
    const acesData = createPixelData(200, 200, 200);

    applyToneMappingToData(reinhardData, 'reinhard');
    applyToneMappingToData(filmicData, 'filmic');
    applyToneMappingToData(acesData, 'aces');

    expect(reinhardData[0]).not.toBe(filmicData[0]);
    expect(filmicData[0]).not.toBe(acesData[0]);
    expect(reinhardData[0]).not.toBe(acesData[0]);
  });
});

// ============================================================================
// GPU/CPU Parity
// ============================================================================

describe('GPU/CPU Parity with shared functions', () => {
  it('Reinhard matches GPU formula: c / (c + 1)', () => {
    const testValues = [0, 0.25, 0.5, 0.75, 1.0];
    for (const x of testValues) {
      const gpuResult = x / (x + 1.0);
      const cpuResult = tonemapReinhardChannel(x);
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
});
