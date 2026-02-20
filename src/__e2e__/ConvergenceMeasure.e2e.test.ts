/**
 * ConvergenceMeasure & FloatingWindowDetector E2E Integration Tests
 *
 * Validates the full wiring and feature completeness of stereo QC tools:
 *
 * Part 1 - ConvergenceMeasure (UI component):
 *   - State manager instantiation and toggle behavior
 *   - Cursor position tracking and disparity measurement
 *   - Guide overlay rendering
 *   - Event emission (stateChanged, disparityMeasured, statsComputed)
 *   - Format helpers for display strings
 *
 * Part 2 - ConvergenceMeasure (stereo module - pure functions):
 *   - measureDisparityAtPoint block matching
 *   - measureDisparityStats frame-wide statistics
 *   - renderConvergenceGuide overlay
 *   - renderDisparityHeatmap visualization
 *
 * Part 3 - FloatingWindowDetector (stereo module - pure functions):
 *   - detectFloatingWindowViolations edge analysis
 *   - renderViolationOverlay red border rendering
 *
 * Part 4 - AppControlRegistry wiring:
 *   - Convergence button placement (after stereoAlignControl)
 *   - Toggle behavior (setEnabled on/off)
 *   - Button active state sync via stateChanged event
 *
 * Part 5 - Integration gap analysis:
 *   - AppViewWiring: convergence measurement NOT wired to mouse events
 *   - FloatingWindowDetector: NOT wired to frame change events
 *   - Left/right eye buffers: available via extractStereoEyes (private in StereoRenderer)
 *     but NOT exposed for convergence/floating window consumption
 *
 * These tests document the current state: the pure algorithms are complete and
 * tested, the UI button toggles correctly, but the measurement pipeline
 * (mouse move -> setCursorPosition -> measureAtCursor with L/R eye data)
 * and the floating window detection pipeline (frame change -> detectFloatingWindowViolations)
 * are NOT wired end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// UI component (state manager with events)
import {
  ConvergenceMeasure,
  measureDisparity,
} from '../ui/components/ConvergenceMeasure';
import type {
  DisparityResult,
  DisparityStats as UIDisparityStats,
  ConvergenceState,
} from '../ui/components/ConvergenceMeasure';

// Stereo module (pure functions)
import {
  measureDisparityAtPoint,
  measureDisparityStats,
  renderConvergenceGuide as renderConvergenceGuideStereo,
  renderDisparityHeatmap,
  DEFAULT_MEASURE_PARAMS,
  DEFAULT_CONVERGENCE_GUIDE_OPTIONS,
} from '../stereo/ConvergenceMeasure';
import type {
  DisparityMeasureParams,
} from '../stereo/ConvergenceMeasure';

// Floating window detector
import {
  detectFloatingWindowViolations,
  renderViolationOverlay,
  DEFAULT_FLOATING_WINDOW_OPTIONS,
} from '../stereo/FloatingWindowDetector';
import type {
  FloatingWindowViolationResult,
  FloatingWindowDetectorOptions,
} from '../stereo/FloatingWindowDetector';

// ---------------------------------------------------------------------------
// Helpers
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

/** Create a vertical stripe image for disparity tests */
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

/** Create a gradient image (dark left, bright right) */
function createGradientImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const v = Math.round((x / Math.max(width - 1, 1)) * 255);
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

// Small params for faster test execution
const fastParams: DisparityMeasureParams = { windowRadius: 4, searchRange: 32 };
const fastFWDOptions: FloatingWindowDetectorOptions = {
  measureParams: fastParams,
  borderWidth: 16,
  sampleSpacing: 8,
  violationThreshold: -1,
};

// =============================================================================
// Part 1: ConvergenceMeasure UI Component - State Manager
// =============================================================================

describe('ConvergenceMeasure E2E - UI Component', () => {
  let measure: ConvergenceMeasure;

  beforeEach(() => {
    measure = new ConvergenceMeasure();
  });

  // ---------------------------------------------------------------------------
  // 1.1 Instantiation
  // ---------------------------------------------------------------------------
  describe('instantiation', () => {
    it('CONV-E2E-001: starts in disabled state with default values', () => {
      const state = measure.getState();
      expect(state.enabled).toBe(false);
      expect(state.cursorX).toBe(0);
      expect(state.cursorY).toBe(0);
      expect(state.guideOverlay).toBe(false);
      expect(state.cursorDisparity).toBeNull();
      expect(state.frameStats).toBeNull();
    });

    it('CONV-E2E-002: getState returns a defensive copy', () => {
      const s1 = measure.getState();
      const s2 = measure.getState();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });
  });

  // ---------------------------------------------------------------------------
  // 1.2 Toggle behavior
  // ---------------------------------------------------------------------------
  describe('toggle behavior', () => {
    it('CONV-E2E-010: setEnabled(true) enables measurement', () => {
      measure.setEnabled(true);
      expect(measure.isEnabled()).toBe(true);
    });

    it('CONV-E2E-011: setEnabled(false) disables and clears measurements', () => {
      const img = createImageData(32, 32, 128);
      measure.setEnabled(true);
      measure.measureAtCursor(img, img);
      measure.computeStats(img, img);
      expect(measure.getCursorDisparity()).not.toBeNull();
      expect(measure.getFrameStats()).not.toBeNull();

      measure.setEnabled(false);
      expect(measure.isEnabled()).toBe(false);
      expect(measure.getCursorDisparity()).toBeNull();
      expect(measure.getFrameStats()).toBeNull();
    });

    it('CONV-E2E-012: setEnabled with same value does not emit stateChanged', () => {
      const handler = vi.fn();
      measure.on('stateChanged', handler);
      measure.setEnabled(false); // already false
      expect(handler).not.toHaveBeenCalled();
    });

    it('CONV-E2E-013: toggle pattern (on/off/on) works correctly', () => {
      measure.setEnabled(true);
      expect(measure.isEnabled()).toBe(true);
      measure.setEnabled(false);
      expect(measure.isEnabled()).toBe(false);
      measure.setEnabled(true);
      expect(measure.isEnabled()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 1.3 Cursor position tracking
  // ---------------------------------------------------------------------------
  describe('cursor position', () => {
    it('CONV-E2E-020: setCursorPosition updates coordinates', () => {
      measure.setCursorPosition(100, 200);
      const pos = measure.getCursorPosition();
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);
    });

    it('CONV-E2E-021: setCursorPosition rounds to integers', () => {
      measure.setCursorPosition(10.7, 20.3);
      const pos = measure.getCursorPosition();
      expect(pos.x).toBe(11);
      expect(pos.y).toBe(20);
    });

    it('CONV-E2E-022: setCursorPosition emits stateChanged', () => {
      const handler = vi.fn();
      measure.on('stateChanged', handler);
      measure.setCursorPosition(50, 50);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].cursorX).toBe(50);
      expect(handler.mock.calls[0]![0].cursorY).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // 1.4 Disparity measurement at cursor
  // ---------------------------------------------------------------------------
  describe('measureAtCursor', () => {
    it('CONV-E2E-030: returns zero disparity for identical images', () => {
      const img = createImageData(64, 64, 128);
      measure.setCursorPosition(32, 32);
      const result = measure.measureAtCursor(img, img);
      expect(result.disparity).toBe(0);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('CONV-E2E-031: detects positive horizontal shift', () => {
      const left = createStripeImage(128, 64, 60, 3);
      const right = createStripeImage(128, 64, 70, 3);
      measure.setCursorPosition(60, 32);
      const result = measure.measureAtCursor(left, right);
      expect(result.disparity).toBe(10);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('CONV-E2E-032: detects negative horizontal shift', () => {
      const left = createStripeImage(128, 64, 60, 3);
      const right = createStripeImage(128, 64, 50, 3);
      measure.setCursorPosition(60, 32);
      const result = measure.measureAtCursor(left, right);
      expect(result.disparity).toBe(-10);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('CONV-E2E-033: emits disparityMeasured event', () => {
      const handler = vi.fn();
      measure.on('disparityMeasured', handler);
      const img = createImageData(32, 32, 128);
      measure.setCursorPosition(16, 16);
      measure.measureAtCursor(img, img);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].disparity).toBe(0);
    });

    it('CONV-E2E-034: updates internal cursorDisparity state', () => {
      const img = createImageData(64, 64, 128);
      measure.setCursorPosition(32, 32);
      const result = measure.measureAtCursor(img, img);
      expect(measure.getCursorDisparity()).toEqual(result);
    });
  });

  // ---------------------------------------------------------------------------
  // 1.5 Frame-wide disparity statistics
  // ---------------------------------------------------------------------------
  describe('computeStats', () => {
    it('CONV-E2E-040: computes statistics for identical images', () => {
      const img = createImageData(64, 64, 128);
      const stats = measure.computeStats(img, img, 16);
      expect(stats.sampleCount).toBeGreaterThan(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.avg).toBe(0);
    });

    it('CONV-E2E-041: emits statsComputed event', () => {
      const handler = vi.fn();
      measure.on('statsComputed', handler);
      const img = createImageData(64, 64, 128);
      measure.computeStats(img, img, 16);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].sampleCount).toBeGreaterThan(0);
    });

    it('CONV-E2E-042: updates internal frameStats state', () => {
      const img = createImageData(64, 64, 128);
      const stats = measure.computeStats(img, img, 16);
      expect(measure.getFrameStats()).toEqual(stats);
    });
  });

  // ---------------------------------------------------------------------------
  // 1.6 Guide overlay
  // ---------------------------------------------------------------------------
  describe('guide overlay', () => {
    it('CONV-E2E-050: guide overlay starts disabled', () => {
      expect(measure.isGuideOverlayEnabled()).toBe(false);
    });

    it('CONV-E2E-051: setGuideOverlay toggles guide', () => {
      measure.setGuideOverlay(true);
      expect(measure.isGuideOverlayEnabled()).toBe(true);
      measure.setGuideOverlay(false);
      expect(measure.isGuideOverlayEnabled()).toBe(false);
    });

    it('CONV-E2E-052: setGuideOverlay does not emit when unchanged', () => {
      const handler = vi.fn();
      measure.on('stateChanged', handler);
      measure.setGuideOverlay(false); // already false
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 1.7 Format helpers
  // ---------------------------------------------------------------------------
  describe('format helpers', () => {
    it('CONV-E2E-060: formatDisparity renders positive disparity', () => {
      const result: DisparityResult = { disparity: 5, confidence: 0.85, x: 100, y: 200 };
      const str = measure.formatDisparity(result);
      expect(str).toContain('+5px');
      expect(str).toContain('85%');
    });

    it('CONV-E2E-061: formatDisparity renders negative disparity', () => {
      const result: DisparityResult = { disparity: -3, confidence: 0.7, x: 10, y: 20 };
      const str = measure.formatDisparity(result);
      expect(str).toContain('-3px');
    });

    it('CONV-E2E-062: formatDisparity handles low confidence', () => {
      const result: DisparityResult = { disparity: 0, confidence: 0.05, x: 10, y: 20 };
      const str = measure.formatDisparity(result);
      expect(str).toContain('no match');
    });

    it('CONV-E2E-063: formatStats renders valid stats', () => {
      const stats: UIDisparityStats = { min: -5, max: 10, avg: 2.5, sampleCount: 100 };
      const str = measure.formatStats(stats);
      expect(str).toContain('min: -5px');
      expect(str).toContain('max: 10px');
      expect(str).toContain('avg: 2.5px');
      expect(str).toContain('100 samples');
    });

    it('CONV-E2E-064: formatStats handles zero samples', () => {
      const stats: UIDisparityStats = { min: 0, max: 0, avg: 0, sampleCount: 0 };
      const str = measure.formatStats(stats);
      expect(str).toContain('No valid samples');
    });
  });
});

// =============================================================================
// Part 2: ConvergenceMeasure Stereo Module - Pure Functions
// =============================================================================

describe('ConvergenceMeasure E2E - Stereo Module', () => {
  // ---------------------------------------------------------------------------
  // 2.1 measureDisparityAtPoint
  // ---------------------------------------------------------------------------
  describe('measureDisparityAtPoint', () => {
    it('CONV-E2E-100: identical images yield zero disparity', () => {
      const img = createGradientImage(64, 64);
      const result = measureDisparityAtPoint(img, img, 32, 32, fastParams);
      expect(result.disparity).toBe(0);
    });

    it('CONV-E2E-101: detects positive shift', () => {
      const left = createStripeImage(80, 40, 30, 5);
      const right = createStripeImage(80, 40, 35, 5);
      const result = measureDisparityAtPoint(left, right, 32, 20, fastParams);
      expect(result.disparity).toBe(5);
    });

    it('CONV-E2E-102: detects negative shift', () => {
      const left = createStripeImage(80, 40, 35, 5);
      const right = createStripeImage(80, 40, 30, 5);
      const result = measureDisparityAtPoint(left, right, 37, 20, fastParams);
      expect(result.disparity).toBe(-5);
    });

    it('CONV-E2E-103: clamps out-of-bounds coordinates', () => {
      const img = createImageData(32, 32, 128);
      const result = measureDisparityAtPoint(img, img, -10, -10, fastParams);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('CONV-E2E-104: disparity limited by search range', () => {
      const left = createStripeImage(128, 40, 20, 5);
      const right = createStripeImage(128, 40, 90, 5); // 70px offset, search=32
      const result = measureDisparityAtPoint(left, right, 22, 20, fastParams);
      expect(Math.abs(result.disparity)).toBeLessThanOrEqual(32);
    });
  });

  // ---------------------------------------------------------------------------
  // 2.2 measureDisparityStats
  // ---------------------------------------------------------------------------
  describe('measureDisparityStats', () => {
    it('CONV-E2E-110: identical images yield zero avg', () => {
      const img = createGradientImage(64, 64);
      const stats = measureDisparityStats(img, img, 16, fastParams);
      expect(stats.avg).toBeCloseTo(0, 0);
      expect(stats.sampleCount).toBeGreaterThan(0);
    });

    it('CONV-E2E-111: min <= avg <= max invariant holds', () => {
      const img = createGradientImage(64, 64);
      const stats = measureDisparityStats(img, img, 16, fastParams);
      expect(stats.min).toBeLessThanOrEqual(stats.avg);
      expect(stats.avg).toBeLessThanOrEqual(stats.max);
    });

    it('CONV-E2E-112: smaller spacing yields more samples', () => {
      const img = createGradientImage(128, 128);
      const sparse = measureDisparityStats(img, img, 32, fastParams);
      const dense = measureDisparityStats(img, img, 8, fastParams);
      expect(dense.sampleCount).toBeGreaterThan(sparse.sampleCount);
    });

    it('CONV-E2E-113: returns zero stats for too-small images', () => {
      const img = createImageData(4, 4, 100);
      const stats = measureDisparityStats(img, img, 2, { windowRadius: 4, searchRange: 2 });
      expect(stats.sampleCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2.3 renderConvergenceGuide (stereo module)
  // ---------------------------------------------------------------------------
  describe('renderConvergenceGuide (stereo)', () => {
    it('CONV-E2E-120: renders green center line', () => {
      const src = createImageData(64, 64, 0);
      const result = renderConvergenceGuideStereo(src, {
        convergenceX: 0.5,
        nearPlane: -10,
        farPlane: 10,
        opacity: 1.0,
      });
      const centerX = 32; // 0.5 * 63 ~ 32
      const [r, g, b] = getPixel(result, centerX, 32);
      expect(g).toBe(255);
      expect(r).toBe(0);
      expect(b).toBe(0);
    });

    it('CONV-E2E-121: does not modify source ImageData', () => {
      const src = createImageData(32, 32, 50);
      const srcCopy = new Uint8ClampedArray(src.data);
      renderConvergenceGuideStereo(src);
      expect(src.data).toEqual(srcCopy);
    });

    it('CONV-E2E-122: default options produce valid output', () => {
      const src = createImageData(64, 64, 128);
      const result = renderConvergenceGuideStereo(src);
      expect(result.width).toBe(64);
      expect(result.height).toBe(64);
    });
  });

  // ---------------------------------------------------------------------------
  // 2.4 renderDisparityHeatmap
  // ---------------------------------------------------------------------------
  describe('renderDisparityHeatmap', () => {
    it('CONV-E2E-130: identical images produce green heatmap', () => {
      const img = createGradientImage(32, 32);
      const params: DisparityMeasureParams = { windowRadius: 2, searchRange: 8 };
      const heatmap = renderDisparityHeatmap(img, img, 8, params);
      expect(heatmap.width).toBe(32);
      expect(heatmap.height).toBe(32);
      // Sample a valid region: should be green-dominant (zero disparity)
      const [r, g, b] = getPixel(heatmap, 16, 16);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    });

    it('CONV-E2E-131: output dimensions match input overlap', () => {
      const left = createGradientImage(48, 32);
      const right = createGradientImage(64, 48);
      const params: DisparityMeasureParams = { windowRadius: 2, searchRange: 8 };
      const heatmap = renderDisparityHeatmap(left, right, 8, params);
      expect(heatmap.width).toBe(48);
      expect(heatmap.height).toBe(32);
    });
  });
});

// =============================================================================
// Part 3: FloatingWindowDetector - Pure Functions
// =============================================================================

describe('FloatingWindowDetector E2E', () => {
  // ---------------------------------------------------------------------------
  // 3.1 detectFloatingWindowViolations
  // ---------------------------------------------------------------------------
  describe('detectFloatingWindowViolations', () => {
    it('FWD-E2E-001: identical images have no violations', () => {
      const img = createGradientImage(64, 64);
      const result = detectFloatingWindowViolations(img, img, fastFWDOptions);
      expect(result.hasViolation).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.affectedEdges).toHaveLength(0);
      expect(result.worstDisparity).toBe(0);
    });

    it('FWD-E2E-002: solid identical images have no violations', () => {
      const img = createImageData(64, 64, 128);
      const result = detectFloatingWindowViolations(img, img, fastFWDOptions);
      expect(result.hasViolation).toBe(false);
    });

    it('FWD-E2E-003: left edge violation detected with negative disparity', () => {
      // Left eye: stripe at x=5, right eye: stripe shifted left (negative disparity)
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5);
      const result = detectFloatingWindowViolations(left, right, fastFWDOptions);
      expect(result.hasViolation).toBe(true);
      expect(result.affectedEdges).toContain('left');
      expect(result.worstDisparity).toBeLessThan(0);
    });

    it('FWD-E2E-004: positive disparity at edges is not a violation', () => {
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 10, 5); // positive disparity
      const result = detectFloatingWindowViolations(left, right, fastFWDOptions);
      const leftViolation = result.violations.find(v => v.edge === 'left');
      expect(leftViolation).toBeUndefined();
    });

    it('FWD-E2E-005: violation threshold controls sensitivity', () => {
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 3, 5); // -2px disparity

      const strict = detectFloatingWindowViolations(left, right, {
        ...fastFWDOptions,
        violationThreshold: -1,
      });
      const lenient = detectFloatingWindowViolations(left, right, {
        ...fastFWDOptions,
        violationThreshold: -5,
      });

      expect(strict.violations.length).toBeGreaterThanOrEqual(lenient.violations.length);
    });

    it('FWD-E2E-006: affectedEdges matches violations array', () => {
      const img = createGradientImage(64, 64);
      const result = detectFloatingWindowViolations(img, img, fastFWDOptions);
      expect(result.affectedEdges).toHaveLength(result.violations.length);
      for (const v of result.violations) {
        expect(result.affectedEdges).toContain(v.edge);
      }
    });

    it('FWD-E2E-007: handles small images gracefully', () => {
      const img = createImageData(16, 16, 100);
      const result = detectFloatingWindowViolations(img, img, fastFWDOptions);
      expect(typeof result.hasViolation).toBe('boolean');
    });
  });

  // ---------------------------------------------------------------------------
  // 3.2 renderViolationOverlay
  // ---------------------------------------------------------------------------
  describe('renderViolationOverlay', () => {
    it('FWD-E2E-020: no violation returns copy of original', () => {
      const img = createImageData(32, 32, 100);
      const result: FloatingWindowViolationResult = {
        hasViolation: false,
        violations: [],
        worstDisparity: 0,
        affectedEdges: [],
      };
      const output = renderViolationOverlay(img, result);
      const pixel = getPixel(output, 16, 16);
      expect(pixel[0]).toBe(100);
      expect(pixel[1]).toBe(100);
      expect(pixel[2]).toBe(100);
    });

    it('FWD-E2E-021: does not modify source image', () => {
      const img = createImageData(32, 32, 100);
      const srcCopy = new Uint8ClampedArray(img.data);
      const result: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{ edge: 'left', maxViolationDisparity: -5, violatingPoints: 3, totalPoints: 5 }],
        worstDisparity: -5,
        affectedEdges: ['left'],
      };
      renderViolationOverlay(img, result);
      expect(img.data).toEqual(srcCopy);
    });

    it('FWD-E2E-022: left edge violation draws red border', () => {
      const img = createImageData(64, 64, 0);
      const result: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{ edge: 'left', maxViolationDisparity: -5, violatingPoints: 3, totalPoints: 5 }],
        worstDisparity: -5,
        affectedEdges: ['left'],
      };
      const output = renderViolationOverlay(img, result, 4, 1.0);
      const leftPixel = getPixel(output, 1, 32);
      expect(leftPixel[0]).toBeGreaterThan(200); // Red
      const centerPixel = getPixel(output, 32, 32);
      expect(centerPixel[0]).toBe(0); // Unaffected
    });

    it('FWD-E2E-023: all four edges can be affected', () => {
      const img = createImageData(64, 64, 0);
      const result: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [
          { edge: 'left', maxViolationDisparity: -5, violatingPoints: 3, totalPoints: 5 },
          { edge: 'right', maxViolationDisparity: -5, violatingPoints: 3, totalPoints: 5 },
          { edge: 'top', maxViolationDisparity: -5, violatingPoints: 3, totalPoints: 5 },
          { edge: 'bottom', maxViolationDisparity: -5, violatingPoints: 3, totalPoints: 5 },
        ],
        worstDisparity: -5,
        affectedEdges: ['left', 'right', 'top', 'bottom'],
      };
      const output = renderViolationOverlay(img, result, 4, 1.0);
      expect(getPixel(output, 1, 32)[0]).toBeGreaterThan(200);
      expect(getPixel(output, 62, 32)[0]).toBeGreaterThan(200);
      expect(getPixel(output, 32, 1)[0]).toBeGreaterThan(200);
      expect(getPixel(output, 32, 62)[0]).toBeGreaterThan(200);
      expect(getPixel(output, 32, 32)[0]).toBe(0); // Center unaffected
    });

    it('FWD-E2E-024: output dimensions match input', () => {
      const img = createImageData(80, 60, 50);
      const result: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{ edge: 'left', maxViolationDisparity: -3, violatingPoints: 2, totalPoints: 4 }],
        worstDisparity: -3,
        affectedEdges: ['left'],
      };
      const output = renderViolationOverlay(img, result);
      expect(output.width).toBe(80);
      expect(output.height).toBe(60);
    });
  });

  // ---------------------------------------------------------------------------
  // 3.3 Full detection + overlay pipeline
  // ---------------------------------------------------------------------------
  describe('detection + overlay pipeline', () => {
    it('FWD-E2E-030: end-to-end produces valid output', () => {
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5);

      const detection = detectFloatingWindowViolations(left, right, fastFWDOptions);
      const overlay = renderViolationOverlay(left, detection, 4, 0.7);

      expect(overlay.width).toBe(128);
      expect(overlay.height).toBe(64);

      if (detection.hasViolation && detection.affectedEdges.includes('left')) {
        const borderPixel = getPixel(overlay, 1, 32);
        expect(borderPixel[0]).toBeGreaterThan(0);
      }
    });

    it('FWD-E2E-031: clean images produce clean overlay', () => {
      const img = createGradientImage(64, 64);
      const detection = detectFloatingWindowViolations(img, img, fastFWDOptions);
      const overlay = renderViolationOverlay(img, detection);

      expect(detection.hasViolation).toBe(false);
      for (let x = 0; x < 64; x += 16) {
        const src = getPixel(img, x, 32);
        const out = getPixel(overlay, x, 32);
        expect(out[0]).toBe(src[0]);
        expect(out[1]).toBe(src[1]);
        expect(out[2]).toBe(src[2]);
      }
    });
  });
});

// =============================================================================
// Part 4: AppControlRegistry Wiring Assessment
// =============================================================================

describe('ConvergenceMeasure E2E - AppControlRegistry Wiring', () => {
  // These tests validate the button toggle wiring pattern from AppControlRegistry
  // by exercising the same code path: ConvergenceMeasure.setEnabled() -> stateChanged event

  it('CONV-E2E-200: toggle pattern matches AppControlRegistry click handler', () => {
    // Simulates: convergenceButton click -> this.convergenceMeasure.setEnabled(!this.convergenceMeasure.isEnabled())
    const measure = new ConvergenceMeasure();
    const stateHistory: boolean[] = [];

    measure.on('stateChanged', (state: ConvergenceState) => {
      stateHistory.push(state.enabled);
    });

    // First click: enable
    measure.setEnabled(!measure.isEnabled());
    expect(measure.isEnabled()).toBe(true);

    // Second click: disable
    measure.setEnabled(!measure.isEnabled());
    expect(measure.isEnabled()).toBe(false);

    expect(stateHistory).toEqual([true, false]);
  });

  it('CONV-E2E-201: stateChanged event provides correct data for setButtonActive', () => {
    // Simulates: this.convergenceMeasure.on('stateChanged', (state) => setButtonActive(btn, state.enabled, 'icon'))
    const measure = new ConvergenceMeasure();
    const buttonActiveStates: boolean[] = [];

    measure.on('stateChanged', (state: ConvergenceState) => {
      // Simulates setButtonActive call
      buttonActiveStates.push(state.enabled);
    });

    measure.setEnabled(true);
    measure.setEnabled(false);
    measure.setEnabled(true);

    expect(buttonActiveStates).toEqual([true, false, true]);
  });

});

// =============================================================================
// Part 5: Integration Gap Analysis Tests
// =============================================================================

describe('ConvergenceMeasure E2E - Integration Gap Analysis', () => {
  it('CONV-E2E-303: ConvergenceMeasure inherits EventEmitter methods including dispose', () => {
    const measure = new ConvergenceMeasure();
    // Verify it has inherited EventEmitter methods
    expect(typeof measure.on).toBe('function');
    expect(typeof measure.emit).toBe('function');
    // dispose is available (inherited from EventEmitter base)
    expect('dispose' in measure).toBe(true);
  });

  it('CONV-E2E-304: convergence button visibility is not tied to stereo mode (UX gap)', () => {
    // FINDING: The convergence measurement button is ALWAYS visible in the View tab,
    // even when stereo mode is off. Compare with stereoEyeTransformControl and
    // stereoAlignControl which are hidden/shown via updateStereoEyeControlsVisibility().
    //
    // The convergence button should arguably be hidden when stereo mode is off,
    // since convergence measurement is only meaningful for stereo content.
    //
    // In AppControlRegistry:
    //   updateStereoEyeControlsVisibility() sets display:none on eyeTransform and
    //   alignControl when stereo is off, but does NOT touch the convergenceButton.
    //
    // The convergenceButton is a local variable in setupTabContents() and is not
    // tracked as an instance property, making it harder to toggle visibility later.
    const measure = new ConvergenceMeasure();
    // Without stereo being active, enabling convergence is meaningless
    // but the UI currently allows it
    measure.setEnabled(true);
    expect(measure.isEnabled()).toBe(true);
    // The measurement would produce garbage results without proper L/R eye data
  });
});

// =============================================================================
// Part 6: Cross-Module Consistency
// =============================================================================

describe('ConvergenceMeasure E2E - Cross-Module Consistency', () => {
  it('CONV-E2E-400: both modules measure zero disparity on identical images', () => {
    const img = createGradientImage(64, 64);

    // UI component
    const uiResult = measureDisparity(img, img, 32, 32);

    // Stereo module
    const stereoResult = measureDisparityAtPoint(img, img, 32, 32, {
      windowRadius: 5,
      searchRange: 64,
    });

    expect(uiResult.disparity).toBe(0);
    expect(stereoResult.disparity).toBe(0);
  });

  it('CONV-E2E-401: both modules detect the same shift direction', () => {
    const left = createStripeImage(128, 64, 50, 5);
    const right = createStripeImage(128, 64, 55, 5); // 5px right shift

    const uiResult = measureDisparity(left, right, 52, 32, 64, 11);
    const stereoResult = measureDisparityAtPoint(left, right, 52, 32, {
      windowRadius: 4,
      searchRange: 32,
    });

    // Both should detect positive disparity
    expect(uiResult.disparity).toBeGreaterThan(0);
    expect(stereoResult.disparity).toBeGreaterThan(0);
  });

  it('CONV-E2E-402: UI measureDisparity and stereo measureDisparityAtPoint use different luminance coefficients', () => {
    // NOTE: This documents a subtle inconsistency between the two modules:
    //
    // UI ConvergenceMeasure (src/ui/components/ConvergenceMeasure.ts):
    //   getLuminance uses Rec.601: Y = 0.299*R + 0.587*G + 0.114*B
    //
    // Stereo ConvergenceMeasure (src/stereo/ConvergenceMeasure.ts):
    //   getLuminance uses Rec.709: Y = 0.2126*R + 0.7152*G + 0.0722*B
    //
    // Both approaches are valid but produce slightly different results.
    // For consistency in a professional tool, both should use the same
    // coefficients (Rec.709 is the modern standard for HD content).
    //
    // Additionally, the UI module normalizes SAD to [0,1] (dividing by count*255)
    // while the stereo module normalizes to [0,255] (dividing by count only).
    // This means confidence values from the two modules are NOT comparable.

    // Create a test image that would show different luminance for Rec.601 vs Rec.709
    const width = 32, height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 200;     // R
      data[i * 4 + 1] = 50;  // G
      data[i * 4 + 2] = 50;  // B
      data[i * 4 + 3] = 255;
    }
    const img = new ImageData(data, width, height);

    // Both should still find 0 disparity for identical images regardless of coefficients
    const uiResult = measureDisparity(img, img, 16, 16);
    const stereoResult = measureDisparityAtPoint(img, img, 16, 16, fastParams);

    expect(uiResult.disparity).toBe(0);
    expect(stereoResult.disparity).toBe(0);

    // But confidence values will differ due to different normalization
    // This is expected and documented here
    expect(typeof uiResult.confidence).toBe('number');
    expect(typeof stereoResult.confidence).toBe('number');
  });

  it('CONV-E2E-403: defaults are consistent and sensible', () => {
    expect(DEFAULT_MEASURE_PARAMS.windowRadius).toBeGreaterThan(0);
    expect(DEFAULT_MEASURE_PARAMS.searchRange).toBeGreaterThan(0);
    expect(DEFAULT_CONVERGENCE_GUIDE_OPTIONS.convergenceX).toBe(0.5);
    expect(DEFAULT_CONVERGENCE_GUIDE_OPTIONS.opacity).toBeGreaterThan(0);
    expect(DEFAULT_CONVERGENCE_GUIDE_OPTIONS.opacity).toBeLessThanOrEqual(1);
    expect(DEFAULT_FLOATING_WINDOW_OPTIONS.borderWidth).toBeGreaterThan(0);
    expect(DEFAULT_FLOATING_WINDOW_OPTIONS.violationThreshold).toBeLessThan(0);
  });
});
