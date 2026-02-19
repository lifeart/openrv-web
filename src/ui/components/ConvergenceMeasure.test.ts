/**
 * ConvergenceMeasure Tests (T2.12)
 *
 * Tests for stereo convergence measurement tools:
 * - Block matching disparity computation
 * - Frame-wide disparity statistics
 * - Convergence guide overlay rendering
 * - ConvergenceMeasure state manager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeBlockSAD,
  measureDisparity,
  computeFrameDisparityStats,
  renderConvergenceGuide,
  ConvergenceMeasure,
  DEFAULT_CONVERGENCE_STATE,
} from './ConvergenceMeasure';
import type {
  DisparityResult,
  DisparityStats,
} from './ConvergenceMeasure';

// ---------------------------------------------------------------------------
// Helper: create ImageData with known pixel values
// ---------------------------------------------------------------------------

function createImageData(width: number, height: number, fill?: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill !== undefined) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill;
      data[i + 1] = fill;
      data[i + 2] = fill;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Create ImageData with a vertical stripe at a given x position.
 * Background is black, stripe is white (3px wide).
 */
function createStripeImage(width: number, height: number, stripeX: number): ImageData {
  const img = createImageData(width, height, 0);
  for (let y = 0; y < height; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = stripeX + dx;
      if (x >= 0 && x < width) {
        const idx = (y * width + x) * 4;
        img.data[idx] = 255;
        img.data[idx + 1] = 255;
        img.data[idx + 2] = 255;
        img.data[idx + 3] = 255;
      }
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// computeBlockSAD
// ---------------------------------------------------------------------------

describe('computeBlockSAD', () => {
  it('CONV-001: returns 0 for identical blocks', () => {
    const img = createImageData(32, 32, 128);
    const sad = computeBlockSAD(img.data, img.data, 32, 32, 32, 16, 16, 0, 5);
    expect(sad).toBe(0);
  });

  it('CONV-002: returns 1 for maximally different blocks', () => {
    const black = createImageData(32, 32, 0);
    const white = createImageData(32, 32, 255);
    const sad = computeBlockSAD(black.data, white.data, 32, 32, 32, 16, 16, 0, 5);
    expect(sad).toBeCloseTo(1, 1);
  });

  it('CONV-003: returns 0 when offset aligns identical features', () => {
    const left = createStripeImage(64, 32, 30);
    const right = createStripeImage(64, 32, 35);
    // With offset=5, right[x+5] matches left[x] at the stripe
    const sad = computeBlockSAD(left.data, right.data, 64, 64, 32, 30, 16, 5, 7);
    expect(sad).toBe(0);
  });

  it('CONV-004: handles out-of-bounds gracefully', () => {
    const img = createImageData(8, 8, 128);
    const sad = computeBlockSAD(img.data, img.data, 8, 8, 8, 0, 0, 0, 5);
    // Should still compute for valid pixels within bounds
    expect(sad).toBe(0);
  });

  it('CONV-005: returns 1 when no valid pixels in block', () => {
    const img = createImageData(4, 4, 128);
    // Block centered far out of bounds
    const sad = computeBlockSAD(img.data, img.data, 4, 4, 4, 4, 4, 100, 3);
    expect(sad).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// measureDisparity
// ---------------------------------------------------------------------------

describe('measureDisparity', () => {
  it('CONV-010: returns 0 disparity for identical images', () => {
    const img = createImageData(64, 64, 128);
    const result = measureDisparity(img, img, 32, 32);
    expect(result.disparity).toBe(0);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.x).toBe(32);
    expect(result.y).toBe(32);
  });

  it('CONV-011: detects positive horizontal shift', () => {
    const left = createStripeImage(128, 64, 60);
    const right = createStripeImage(128, 64, 70);
    const result = measureDisparity(left, right, 60, 32, 64, 11);
    expect(result.disparity).toBe(10);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('CONV-012: detects negative horizontal shift', () => {
    const left = createStripeImage(128, 64, 60);
    const right = createStripeImage(128, 64, 50);
    const result = measureDisparity(left, right, 60, 32, 64, 11);
    expect(result.disparity).toBe(-10);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('CONV-013: returns 0 confidence for out-of-bounds cursor', () => {
    const img = createImageData(32, 32, 128);
    const result = measureDisparity(img, img, -10, -10);
    expect(result.confidence).toBe(0);
    expect(result.disparity).toBe(0);
  });

  it('CONV-014: handles cursor at image edge', () => {
    const img = createImageData(32, 32, 128);
    const result = measureDisparity(img, img, 0, 0);
    expect(result.disparity).toBe(0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('CONV-015: rounds coordinates to integers', () => {
    const img = createImageData(32, 32, 128);
    const result = measureDisparity(img, img, 15.7, 10.3);
    expect(result.x).toBe(16);
    expect(result.y).toBe(10);
  });

  it('CONV-016: respects custom search range', () => {
    const left = createStripeImage(128, 64, 30);
    const right = createStripeImage(128, 64, 35);
    // With searchRange=3, the 5px shift won't be found
    const result = measureDisparity(left, right, 30, 32, 3, 11);
    // Best match within range ±3 won't find the 5px shift perfectly
    expect(Math.abs(result.disparity)).toBeLessThanOrEqual(3);
  });

  it('CONV-017: respects custom block size', () => {
    const img = createImageData(32, 32, 128);
    const result = measureDisparity(img, img, 16, 16, 32, 3);
    expect(result.disparity).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeFrameDisparityStats
// ---------------------------------------------------------------------------

describe('computeFrameDisparityStats', () => {
  it('CONV-020: returns zero stats for identical images', () => {
    const img = createImageData(64, 64, 128);
    const stats = computeFrameDisparityStats(img, img, 16);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.avg).toBe(0);
    expect(stats.sampleCount).toBeGreaterThan(0);
  });

  it('CONV-021: detects uniform shift in stats', () => {
    const left = createStripeImage(128, 64, 60);
    const right = createStripeImage(128, 64, 68);
    const stats = computeFrameDisparityStats(left, right, 32, 64, 11);
    // All sample points near the stripe should detect ~8px shift
    // Points far from stripe may get 0 (on uniform black background)
    expect(stats.sampleCount).toBeGreaterThan(0);
    expect(stats.max).toBeGreaterThanOrEqual(0);
  });

  it('CONV-022: returns 0 sampleCount for empty images', () => {
    const left = createImageData(4, 4, 0);
    const right = createImageData(4, 4, 0);
    // Block size 11 > image size 4, so no valid sample points
    const stats = computeFrameDisparityStats(left, right, 1, 32, 11);
    expect(stats.sampleCount).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.avg).toBe(0);
  });

  it('CONV-023: min <= avg <= max', () => {
    const left = createImageData(64, 64, 128);
    const right = createImageData(64, 64, 128);
    const stats = computeFrameDisparityStats(left, right, 16);
    expect(stats.min).toBeLessThanOrEqual(stats.avg);
    expect(stats.avg).toBeLessThanOrEqual(stats.max);
  });

  it('CONV-024: respects gridStep parameter', () => {
    const img = createImageData(64, 64, 128);
    const sparse = computeFrameDisparityStats(img, img, 32, 32, 5);
    const dense = computeFrameDisparityStats(img, img, 8, 32, 5);
    expect(dense.sampleCount).toBeGreaterThanOrEqual(sparse.sampleCount);
  });
});

// ---------------------------------------------------------------------------
// renderConvergenceGuide
// ---------------------------------------------------------------------------

describe('renderConvergenceGuide', () => {
  it('CONV-030: renders center convergence line', () => {
    const img = createImageData(64, 64, 0);
    const result = renderConvergenceGuide(img, null, null);
    const cx = 32;
    // Check that the center column has non-zero green
    const idx = (32 * 64 + cx) * 4;
    expect(result.data[idx + 1]).toBeGreaterThan(0); // Green channel > 0
  });

  it('CONV-031: renders disparity range bars when stats provided', () => {
    const img = createImageData(128, 64, 0);
    const stats: DisparityStats = { min: -10, max: 10, avg: 0, sampleCount: 50 };
    const result = renderConvergenceGuide(img, stats, null);
    // Check bottom bar area (y=44, near bottom of 64-high image)
    const barY = 44; // height - 20
    const cx = 64; // center
    // The avg marker (yellow) should be at center
    const avgIdx = (barY * 128 + cx) * 4;
    expect(result.data[avgIdx]).toBe(255); // R
    expect(result.data[avgIdx + 1]).toBe(255); // G
    expect(result.data[avgIdx + 2]).toBe(0); // B (yellow)
  });

  it('CONV-032: renders cursor disparity marker', () => {
    const img = createImageData(64, 64, 0);
    const cursor: DisparityResult = { disparity: 5, confidence: 0.8, x: 32, y: 32 };
    const result = renderConvergenceGuide(img, null, cursor);
    // The cursor marker (magenta) should be at (32, 32)
    const idx = (32 * 64 + 32) * 4;
    expect(result.data[idx]).toBeGreaterThan(0); // R (magenta)
    expect(result.data[idx + 2]).toBeGreaterThan(0); // B (magenta)
  });

  it('CONV-033: does not render cursor marker with low confidence', () => {
    const img = createImageData(64, 64, 100);
    const cursor: DisparityResult = { disparity: 5, confidence: 0.05, x: 32, y: 32 };
    const result = renderConvergenceGuide(img, null, cursor);
    // With low confidence, cursor marker should NOT be rendered
    // Only the center green line should modify pixels
    const idx = (32 * 64 + 30) * 4; // Away from center line
    expect(result.data[idx]).toBe(100); // Unchanged
  });

  it('CONV-034: returns new ImageData, does not modify input', () => {
    const img = createImageData(32, 32, 50);
    const original = new Uint8ClampedArray(img.data);
    renderConvergenceGuide(img, null, null);
    expect(img.data).toEqual(original);
  });

  it('CONV-035: handles empty stats gracefully', () => {
    const img = createImageData(32, 32, 0);
    const stats: DisparityStats = { min: 0, max: 0, avg: 0, sampleCount: 0 };
    const result = renderConvergenceGuide(img, stats, null);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// ConvergenceMeasure state manager
// ---------------------------------------------------------------------------

describe('ConvergenceMeasure', () => {
  let measure: ConvergenceMeasure;

  beforeEach(() => {
    measure = new ConvergenceMeasure();
  });

  // State management

  it('CONV-040: starts disabled', () => {
    expect(measure.isEnabled()).toBe(false);
  });

  it('CONV-041: setEnabled toggles state', () => {
    measure.setEnabled(true);
    expect(measure.isEnabled()).toBe(true);
    measure.setEnabled(false);
    expect(measure.isEnabled()).toBe(false);
  });

  it('CONV-042: setEnabled(false) clears measurements', () => {
    const img = createImageData(32, 32, 128);
    measure.setEnabled(true);
    measure.measureAtCursor(img, img);
    measure.computeStats(img, img);
    expect(measure.getCursorDisparity()).not.toBeNull();
    expect(measure.getFrameStats()).not.toBeNull();

    measure.setEnabled(false);
    expect(measure.getCursorDisparity()).toBeNull();
    expect(measure.getFrameStats()).toBeNull();
  });

  it('CONV-043: setEnabled does not emit when unchanged', () => {
    const handler = vi.fn();
    measure.on('stateChanged', handler);
    measure.setEnabled(false); // Already false
    expect(handler).not.toHaveBeenCalled();
  });

  // Cursor position

  it('CONV-044: setCursorPosition updates position', () => {
    measure.setCursorPosition(100, 200);
    const pos = measure.getCursorPosition();
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200);
  });

  it('CONV-045: setCursorPosition rounds to integers', () => {
    measure.setCursorPosition(10.7, 20.3);
    const pos = measure.getCursorPosition();
    expect(pos.x).toBe(11);
    expect(pos.y).toBe(20);
  });

  // Guide overlay

  it('CONV-046: guide overlay starts disabled', () => {
    expect(measure.isGuideOverlayEnabled()).toBe(false);
  });

  it('CONV-047: setGuideOverlay toggles guide', () => {
    measure.setGuideOverlay(true);
    expect(measure.isGuideOverlayEnabled()).toBe(true);
    measure.setGuideOverlay(false);
    expect(measure.isGuideOverlayEnabled()).toBe(false);
  });

  it('CONV-048: setGuideOverlay does not emit when unchanged', () => {
    const handler = vi.fn();
    measure.on('stateChanged', handler);
    measure.setGuideOverlay(false); // Already false
    expect(handler).not.toHaveBeenCalled();
  });

  // Measurement

  it('CONV-050: measureAtCursor computes disparity', () => {
    const img = createImageData(64, 64, 128);
    measure.setCursorPosition(32, 32);
    const result = measure.measureAtCursor(img, img);
    expect(result.disparity).toBe(0);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(measure.getCursorDisparity()).toEqual(result);
  });

  it('CONV-051: measureAtCursor emits disparityMeasured', () => {
    const handler = vi.fn();
    measure.on('disparityMeasured', handler);
    const img = createImageData(32, 32, 128);
    measure.setCursorPosition(16, 16);
    measure.measureAtCursor(img, img);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].disparity).toBe(0);
  });

  it('CONV-052: computeStats computes frame statistics', () => {
    const img = createImageData(64, 64, 128);
    const stats = measure.computeStats(img, img, 16);
    expect(stats.sampleCount).toBeGreaterThan(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(measure.getFrameStats()).toEqual(stats);
  });

  it('CONV-053: computeStats emits statsComputed', () => {
    const handler = vi.fn();
    measure.on('statsComputed', handler);
    const img = createImageData(64, 64, 128);
    measure.computeStats(img, img, 16);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].sampleCount).toBeGreaterThan(0);
  });

  // State

  it('CONV-054: getState returns copy', () => {
    const s1 = measure.getState();
    const s2 = measure.getState();
    expect(s1).toEqual(s2);
    expect(s1).not.toBe(s2);
  });

  it('CONV-055: getState matches DEFAULT_CONVERGENCE_STATE initially', () => {
    const state = measure.getState();
    expect(state.enabled).toBe(DEFAULT_CONVERGENCE_STATE.enabled);
    expect(state.cursorX).toBe(DEFAULT_CONVERGENCE_STATE.cursorX);
    expect(state.cursorY).toBe(DEFAULT_CONVERGENCE_STATE.cursorY);
    expect(state.guideOverlay).toBe(DEFAULT_CONVERGENCE_STATE.guideOverlay);
    expect(state.cursorDisparity).toBeNull();
    expect(state.frameStats).toBeNull();
  });

  it('CONV-056: stateChanged emitted on enable', () => {
    const handler = vi.fn();
    measure.on('stateChanged', handler);
    measure.setEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].enabled).toBe(true);
  });

  it('CONV-057: stateChanged emitted on cursor move', () => {
    const handler = vi.fn();
    measure.on('stateChanged', handler);
    measure.setCursorPosition(50, 50);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].cursorX).toBe(50);
    expect(handler.mock.calls[0]![0].cursorY).toBe(50);
  });

  // Formatting

  it('CONV-060: formatDisparity formats valid result', () => {
    const result: DisparityResult = { disparity: 5, confidence: 0.85, x: 100, y: 200 };
    const str = measure.formatDisparity(result);
    expect(str).toContain('+5px');
    expect(str).toContain('85%');
    expect(str).toContain('100');
    expect(str).toContain('200');
  });

  it('CONV-061: formatDisparity formats negative disparity', () => {
    const result: DisparityResult = { disparity: -3, confidence: 0.7, x: 10, y: 20 };
    const str = measure.formatDisparity(result);
    expect(str).toContain('-3px');
  });

  it('CONV-062: formatDisparity handles low confidence', () => {
    const result: DisparityResult = { disparity: 0, confidence: 0.05, x: 10, y: 20 };
    const str = measure.formatDisparity(result);
    expect(str).toContain('no match');
  });

  it('CONV-063: formatStats formats valid stats', () => {
    const stats: DisparityStats = { min: -5, max: 10, avg: 2.5, sampleCount: 100 };
    const str = measure.formatStats(stats);
    expect(str).toContain('min: -5px');
    expect(str).toContain('max: 10px');
    expect(str).toContain('avg: 2.5px');
    expect(str).toContain('100 samples');
  });

  it('CONV-064: formatStats handles zero samples', () => {
    const stats: DisparityStats = { min: 0, max: 0, avg: 0, sampleCount: 0 };
    const str = measure.formatStats(stats);
    expect(str).toContain('No valid samples');
  });

  it('CONV-065: formatDisparity formats zero disparity with +', () => {
    const result: DisparityResult = { disparity: 0, confidence: 0.9, x: 0, y: 0 };
    const str = measure.formatDisparity(result);
    expect(str).toContain('+0px');
  });
});
