import { describe, it, expect } from 'vitest';
import {
  clampLuminance,
  estimateSceneKey,
  computeExposureFromKey,
  computeSceneLuminance,
} from './SceneAnalysis';

describe('SceneAnalysis', () => {
  describe('clampLuminance', () => {
    it('returns MIN_LUMINANCE for NaN', () => {
      expect(clampLuminance(NaN)).toBe(1e-6);
    });

    it('returns MIN_LUMINANCE for Infinity', () => {
      expect(clampLuminance(Infinity)).toBe(1e-6);
    });

    it('returns MIN_LUMINANCE for negative infinity', () => {
      expect(clampLuminance(-Infinity)).toBe(1e-6);
    });

    it('returns MIN_LUMINANCE for zero', () => {
      expect(clampLuminance(0)).toBe(1e-6);
    });

    it('returns MIN_LUMINANCE for negative values', () => {
      expect(clampLuminance(-5)).toBe(1e-6);
    });

    it('clamps to MAX_LUMINANCE for very large values', () => {
      expect(clampLuminance(1e10)).toBe(1e6);
    });

    it('passes through values in valid range', () => {
      expect(clampLuminance(0.5)).toBe(0.5);
      expect(clampLuminance(100)).toBe(100);
    });
  });

  describe('estimateSceneKey', () => {
    it('returns a key in valid range for typical luminance', () => {
      const key = estimateSceneKey(0.18);
      expect(key).toBeGreaterThan(0);
      expect(key).toBeLessThan(1);
    });

    it('returns higher key for brighter scenes', () => {
      const darkKey = estimateSceneKey(0.01);
      const brightKey = estimateSceneKey(10.0);
      expect(brightKey).toBeGreaterThan(darkKey);
    });

    it('handles very small luminance', () => {
      const key = estimateSceneKey(1e-10);
      expect(Number.isFinite(key)).toBe(true);
      expect(key).toBeGreaterThan(0);
    });

    it('handles NaN input via clampLuminance', () => {
      const key = estimateSceneKey(NaN);
      expect(Number.isFinite(key)).toBe(true);
    });
  });

  describe('computeExposureFromKey', () => {
    it('returns 0 for average luminance equal to target key', () => {
      const exposure = computeExposureFromKey(0.18, 0.18);
      expect(exposure).toBeCloseTo(0, 5);
    });

    it('returns positive exposure for dark scene', () => {
      const exposure = computeExposureFromKey(0.01, 0.18);
      expect(exposure).toBeGreaterThan(0);
    });

    it('returns negative exposure for bright scene', () => {
      const exposure = computeExposureFromKey(2.0, 0.18);
      expect(exposure).toBeLessThan(0);
    });

    it('handles zero luminance via clampLuminance', () => {
      const exposure = computeExposureFromKey(0, 0.18);
      expect(Number.isFinite(exposure)).toBe(true);
    });
  });

  describe('computeSceneLuminance', () => {
    it('returns valid stats for pure black image', () => {
      const data = new Uint8ClampedArray(16 * 16 * 4); // all zeros
      const stats = computeSceneLuminance(data, 16, 16);
      expect(stats.avgLogLuminance).toBeGreaterThan(0);
      expect(stats.maxLuminance).toBeGreaterThan(0);
    });

    it('returns valid stats for pure white image', () => {
      const data = new Uint8ClampedArray(16 * 16 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
      const stats = computeSceneLuminance(data, 16, 16);
      expect(stats.avgLogLuminance).toBeGreaterThan(0);
      expect(stats.maxLuminance).toBeCloseTo(1.0, 0);
    });

    it('returns higher luminance for brighter images', () => {
      const dark = new Uint8ClampedArray(16 * 16 * 4);
      for (let i = 0; i < dark.length; i += 4) {
        dark[i] = 30;
        dark[i + 1] = 30;
        dark[i + 2] = 30;
        dark[i + 3] = 255;
      }
      const bright = new Uint8ClampedArray(16 * 16 * 4);
      for (let i = 0; i < bright.length; i += 4) {
        bright[i] = 200;
        bright[i + 1] = 200;
        bright[i + 2] = 200;
        bright[i + 3] = 255;
      }
      const darkStats = computeSceneLuminance(dark, 16, 16);
      const brightStats = computeSceneLuminance(bright, 16, 16);
      expect(brightStats.avgLogLuminance).toBeGreaterThan(darkStats.avgLogLuminance);
    });

    it('handles zero-size image', () => {
      const data = new Uint8ClampedArray(0);
      const stats = computeSceneLuminance(data, 0, 0);
      expect(stats.avgLogLuminance).toBe(1e-6);
      expect(stats.maxLuminance).toBe(1e-6);
    });
  });
});
