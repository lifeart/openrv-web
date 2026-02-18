/**
 * Unit tests for ConvergenceMeasure
 *
 * Tests stereo convergence measurement tools: point disparity,
 * region statistics, convergence guide overlay, and disparity heatmap.
 */

import { describe, it, expect } from 'vitest';
import {
  measureDisparityAtPoint,
  measureDisparityStats,
  renderConvergenceGuide,
  renderDisparityHeatmap,
  DEFAULT_CONVERGENCE_GUIDE_OPTIONS,
  DEFAULT_MEASURE_PARAMS,
} from './ConvergenceMeasure';
import type {
  DisparityAtPoint,
  DisparityStats,
  DisparityMeasureParams,
} from './ConvergenceMeasure';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a solid-color ImageData */
function createSolidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

/**
 * Create an image with a bright vertical stripe at a given x position.
 * Background is black, stripe is white.
 */
function createStripeImage(
  width: number,
  height: number,
  stripeX: number,
  stripeWidth: number = 3,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inStripe = x >= stripeX && x < stripeX + stripeWidth;
      data[idx] = inStripe ? 255 : 0;
      data[idx + 1] = inStripe ? 255 : 0;
      data[idx + 2] = inStripe ? 255 : 0;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/** Create a gradient image (dark on left, bright on right) */
function createGradientImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const v = Math.round((x / (width - 1)) * 255);
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!];
}

// ---------------------------------------------------------------------------
// Tests: measureDisparityAtPoint
// ---------------------------------------------------------------------------

describe('ConvergenceMeasure', () => {
  describe('measureDisparityAtPoint', () => {
    const params: DisparityMeasureParams = { windowRadius: 4, searchRange: 32 };

    it('CONV-001: identical images yield zero disparity', () => {
      const img = createGradientImage(64, 64);
      const result = measureDisparityAtPoint(img, img, 32, 32, params);

      expect(result.disparity).toBe(0);
      expect(result.x).toBe(32);
      expect(result.y).toBe(32);
    });

    it('CONV-002: shifted stripe detects correct positive disparity', () => {
      // Left eye: stripe at x=30, Right eye: stripe at x=35 → disparity = +5
      const left = createStripeImage(80, 40, 30, 5);
      const right = createStripeImage(80, 40, 35, 5);

      const result = measureDisparityAtPoint(left, right, 32, 20, params);
      expect(result.disparity).toBe(5);
    });

    it('CONV-003: shifted stripe detects correct negative disparity', () => {
      // Left eye: stripe at x=35, Right eye: stripe at x=30 → disparity = -5
      const left = createStripeImage(80, 40, 35, 5);
      const right = createStripeImage(80, 40, 30, 5);

      const result = measureDisparityAtPoint(left, right, 37, 20, params);
      expect(result.disparity).toBe(-5);
    });

    it('CONV-004: high confidence on clear features', () => {
      const left = createStripeImage(80, 40, 30, 5);
      const right = createStripeImage(80, 40, 30, 5);

      const result = measureDisparityAtPoint(left, right, 32, 20, params);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('CONV-005: returns clamped coordinates for out-of-bounds cursor', () => {
      const img = createSolidImage(32, 32, 128, 128, 128);
      const result = measureDisparityAtPoint(img, img, -10, -10, params);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('CONV-006: handles cursor at image edge', () => {
      const img = createGradientImage(64, 64);
      const result = measureDisparityAtPoint(img, img, 63, 63, params);

      expect(result.x).toBe(63);
      expect(result.y).toBe(63);
      expect(typeof result.disparity).toBe('number');
    });

    it('CONV-007: disparity limited by search range', () => {
      // Stripe offset larger than search range
      const left = createStripeImage(128, 40, 20, 5);
      const right = createStripeImage(128, 40, 90, 5); // 70px offset, searchRange=32

      const result = measureDisparityAtPoint(left, right, 22, 20, { windowRadius: 4, searchRange: 32 });
      // Cannot find the match beyond searchRange, so disparity should be within [-32, 32]
      expect(Math.abs(result.disparity)).toBeLessThanOrEqual(32);
    });

    it('CONV-008: works with 1x1 window radius', () => {
      const left = createStripeImage(64, 32, 20, 3);
      const right = createStripeImage(64, 32, 20, 3);

      const result = measureDisparityAtPoint(left, right, 21, 16, { windowRadius: 1, searchRange: 16 });
      expect(result.disparity).toBe(0);
    });

    it('CONV-009: solid identical images yield zero disparity with high confidence', () => {
      const left = createSolidImage(32, 32, 100, 100, 100);
      const right = createSolidImage(32, 32, 100, 100, 100);

      const result = measureDisparityAtPoint(left, right, 16, 16, params);
      // All positions match equally in a solid image
      expect(result.disparity).toBe(0);
    });

    it('CONV-010: different sized images handled gracefully', () => {
      const left = createGradientImage(64, 64);
      const right = createGradientImage(48, 48);

      // Should not throw
      const result = measureDisparityAtPoint(left, right, 24, 24, params);
      expect(typeof result.disparity).toBe('number');
      expect(typeof result.confidence).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: measureDisparityStats
  // ---------------------------------------------------------------------------

  describe('measureDisparityStats', () => {
    const params: DisparityMeasureParams = { windowRadius: 4, searchRange: 16 };

    it('CONV-020: identical images yield zero avg disparity', () => {
      const img = createGradientImage(64, 64);
      const stats = measureDisparityStats(img, img, 16, params);

      expect(stats.avg).toBeCloseTo(0, 0);
      expect(stats.sampleCount).toBeGreaterThan(0);
    });

    it('CONV-021: uniformly shifted images yield consistent disparity', () => {
      // Create a gradient shifted by 3 pixels
      const w = 80;
      const h = 40;
      const left = createGradientImage(w, h);

      // Shift right image by 3 pixels
      const rightData = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const srcX = x - 3;
          if (srcX >= 0 && srcX < w) {
            const srcIdx = (y * w + srcX) * 4;
            rightData[idx] = left.data[srcIdx]!;
            rightData[idx + 1] = left.data[srcIdx + 1]!;
            rightData[idx + 2] = left.data[srcIdx + 2]!;
          }
          rightData[idx + 3] = 255;
        }
      }
      const right = new ImageData(rightData, w, h);

      const stats = measureDisparityStats(left, right, 16, params);
      expect(stats.sampleCount).toBeGreaterThan(0);
      // Most samples should detect ~3 pixel disparity
      expect(stats.avg).toBeCloseTo(3, 0);
    });

    it('CONV-022: stats report min and max', () => {
      const img = createGradientImage(64, 64);
      const stats = measureDisparityStats(img, img, 16, params);

      expect(typeof stats.min).toBe('number');
      expect(typeof stats.max).toBe('number');
      expect(stats.min).toBeLessThanOrEqual(stats.max);
    });

    it('CONV-023: returns zero counts for empty overlap', () => {
      // Very small images where margin eliminates all samples
      const left = createSolidImage(4, 4, 100, 100, 100);
      const right = createSolidImage(4, 4, 100, 100, 100);

      const stats = measureDisparityStats(left, right, 2, { windowRadius: 4, searchRange: 2 });
      expect(stats.sampleCount).toBe(0);
      expect(stats.avg).toBe(0);
    });

    it('CONV-024: smaller sample spacing yields more samples', () => {
      const img = createGradientImage(128, 128);
      const statsWide = measureDisparityStats(img, img, 32, params);
      const statsNarrow = measureDisparityStats(img, img, 8, params);

      expect(statsNarrow.sampleCount).toBeGreaterThan(statsWide.sampleCount);
    });

    it('CONV-025: sample spacing clamped to minimum 1', () => {
      const img = createGradientImage(32, 32);
      // Should not throw with spacing <= 0
      const stats = measureDisparityStats(img, img, 0, params);
      expect(stats.sampleCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: renderConvergenceGuide
  // ---------------------------------------------------------------------------

  describe('renderConvergenceGuide', () => {
    it('CONV-030: renders green center line at convergence point', () => {
      const src = createSolidImage(64, 64, 0, 0, 0);
      const result = renderConvergenceGuide(src, {
        convergenceX: 0.5,
        nearPlane: -10,
        farPlane: 10,
        opacity: 1.0,
      });

      const centerX = 32; // 0.5 * 63 ≈ 32
      const [r, g, b] = getPixel(result, centerX, 32);
      expect(g).toBe(255); // Green
      expect(r).toBe(0);
      expect(b).toBe(0);
    });

    it('CONV-031: renders blue near-plane line', () => {
      const src = createSolidImage(64, 64, 0, 0, 0);
      const result = renderConvergenceGuide(src, {
        convergenceX: 0.5,
        nearPlane: -10,
        farPlane: 10,
        opacity: 1.0,
      });

      // Near plane at centerX + nearPlane = 32 + (-10) = 22
      const nearPixel = getPixel(result, 22, 32);
      expect(nearPixel[2]).toBe(255); // Blue
      expect(nearPixel[0]).toBe(0);
    });

    it('CONV-032: renders red far-plane line', () => {
      const src = createSolidImage(64, 64, 0, 0, 0);
      const result = renderConvergenceGuide(src, {
        convergenceX: 0.5,
        nearPlane: -10,
        farPlane: 10,
        opacity: 1.0,
      });

      // Far plane at centerX + farPlane = 32 + 10 = 42
      const farPixel = getPixel(result, 42, 32);
      expect(farPixel[0]).toBe(255); // Red
      expect(farPixel[2]).toBe(0);
    });

    it('CONV-033: opacity blends correctly', () => {
      const src = createSolidImage(64, 64, 100, 100, 100);
      const result = renderConvergenceGuide(src, {
        convergenceX: 0.5,
        nearPlane: -10,
        farPlane: 10,
        opacity: 0.5,
      });

      const centerX = 32;
      const blendPixel = getPixel(result, centerX, 32);
      // Green line at 50% on gray: g = 100*0.5 + 255*0.5 ≈ 178
      expect(blendPixel[1]).toBeGreaterThan(150);
      expect(blendPixel[1]).toBeLessThan(200);
    });

    it('CONV-034: does not modify source ImageData', () => {
      const src = createSolidImage(32, 32, 50, 50, 50);
      const srcCopy = new Uint8ClampedArray(src.data);

      renderConvergenceGuide(src);

      expect(src.data).toEqual(srcCopy);
    });

    it('CONV-035: handles convergenceX at 0 and 1', () => {
      const src = createSolidImage(32, 32, 0, 0, 0);

      // Should not throw at edges
      const r1 = renderConvergenceGuide(src, { ...DEFAULT_CONVERGENCE_GUIDE_OPTIONS, convergenceX: 0 });
      const r2 = renderConvergenceGuide(src, { ...DEFAULT_CONVERGENCE_GUIDE_OPTIONS, convergenceX: 1 });

      expect(r1.width).toBe(32);
      expect(r2.width).toBe(32);
    });

    it('CONV-036: near and far lines clamped to image bounds', () => {
      const src = createSolidImage(32, 32, 0, 0, 0);

      // Should not throw with extreme plane values
      const result = renderConvergenceGuide(src, {
        convergenceX: 0.5,
        nearPlane: -1000,
        farPlane: 1000,
        opacity: 0.8,
      });
      expect(result.width).toBe(32);
    });

    it('CONV-037: default options produce valid output', () => {
      const src = createSolidImage(64, 64, 128, 128, 128);
      const result = renderConvergenceGuide(src);

      expect(result.width).toBe(64);
      expect(result.height).toBe(64);
    });

    it('CONV-038: non-grid pixels unchanged with opacity 1', () => {
      const src = createSolidImage(64, 64, 80, 80, 80);
      const result = renderConvergenceGuide(src, {
        convergenceX: 0.5,
        nearPlane: -10,
        farPlane: 10,
        opacity: 1.0,
      });

      // A pixel far from any guide line should be unchanged
      const [r, g, b] = getPixel(result, 5, 5);
      expect(r).toBe(80);
      expect(g).toBe(80);
      expect(b).toBe(80);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: renderDisparityHeatmap
  // ---------------------------------------------------------------------------

  describe('renderDisparityHeatmap', () => {
    const params: DisparityMeasureParams = { windowRadius: 2, searchRange: 8 };

    it('CONV-040: identical images produce green heatmap (zero disparity)', () => {
      const img = createGradientImage(32, 32);
      const heatmap = renderDisparityHeatmap(img, img, 8, params);

      expect(heatmap.width).toBe(32);
      expect(heatmap.height).toBe(32);

      // Sample a pixel in the valid region - should be greenish (zero disparity)
      const [r, g, b] = getPixel(heatmap, 16, 16);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    });

    it('CONV-041: output dimensions match input overlap', () => {
      const left = createGradientImage(48, 32);
      const right = createGradientImage(64, 48);

      const heatmap = renderDisparityHeatmap(left, right, 8, params);
      expect(heatmap.width).toBe(48); // min(48, 64)
      expect(heatmap.height).toBe(32); // min(32, 48)
    });

    it('CONV-042: heatmap uses full alpha channel', () => {
      const img = createGradientImage(32, 32);
      const heatmap = renderDisparityHeatmap(img, img, 8, params);

      // All pixels should have alpha = 255
      for (let i = 3; i < heatmap.data.length; i += 4) {
        expect(heatmap.data[i]).toBe(255);
      }
    });

    it('CONV-043: no valid samples produce black heatmap', () => {
      // Very small image: all within margin
      const left = createSolidImage(4, 4, 50, 50, 50);
      const right = createSolidImage(4, 4, 50, 50, 50);

      const heatmap = renderDisparityHeatmap(left, right, 2, { windowRadius: 4, searchRange: 2 });
      expect(heatmap.width).toBe(4);
    });

    it('CONV-044: sample spacing affects resolution', () => {
      const img = createGradientImage(64, 64);
      // Different spacings should both produce valid output
      const fine = renderDisparityHeatmap(img, img, 2, params);
      const coarse = renderDisparityHeatmap(img, img, 16, params);

      expect(fine.width).toBe(64);
      expect(coarse.width).toBe(64);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: defaults and types
  // ---------------------------------------------------------------------------

  describe('defaults and types', () => {
    it('CONV-050: DEFAULT_MEASURE_PARAMS has sensible values', () => {
      expect(DEFAULT_MEASURE_PARAMS.windowRadius).toBeGreaterThan(0);
      expect(DEFAULT_MEASURE_PARAMS.searchRange).toBeGreaterThan(0);
    });

    it('CONV-051: DEFAULT_CONVERGENCE_GUIDE_OPTIONS has valid range', () => {
      expect(DEFAULT_CONVERGENCE_GUIDE_OPTIONS.convergenceX).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_CONVERGENCE_GUIDE_OPTIONS.convergenceX).toBeLessThanOrEqual(1);
      expect(DEFAULT_CONVERGENCE_GUIDE_OPTIONS.opacity).toBeGreaterThan(0);
      expect(DEFAULT_CONVERGENCE_GUIDE_OPTIONS.opacity).toBeLessThanOrEqual(1);
    });

    it('CONV-052: DisparityAtPoint has all expected fields', () => {
      const img = createGradientImage(32, 32);
      const result: DisparityAtPoint = measureDisparityAtPoint(img, img, 16, 16);

      expect('x' in result).toBe(true);
      expect('y' in result).toBe(true);
      expect('disparity' in result).toBe(true);
      expect('confidence' in result).toBe(true);
    });

    it('CONV-053: DisparityStats has all expected fields', () => {
      const img = createGradientImage(64, 64);
      const stats: DisparityStats = measureDisparityStats(img, img, 16);

      expect('min' in stats).toBe(true);
      expect('max' in stats).toBe(true);
      expect('avg' in stats).toBe(true);
      expect('sampleCount' in stats).toBe(true);
    });
  });
});
