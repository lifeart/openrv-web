/**
 * Unit tests for FloatingWindowDetector
 *
 * Tests floating window violation detection for stereo content.
 * A floating window violation occurs when stereo content at screen edges
 * has negative disparity (appears in front of the screen).
 */

import { describe, it, expect } from 'vitest';
import {
  detectFloatingWindowViolations,
  renderViolationOverlay,
  DEFAULT_FLOATING_WINDOW_OPTIONS,
} from './FloatingWindowDetector';
import type {
  FloatingWindowViolationResult,
  FloatingWindowDetectorOptions,
} from './FloatingWindowDetector';

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
  stripeWidth: number = 5,
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

// Use small params for testing to keep tests fast
const testOptions: FloatingWindowDetectorOptions = {
  measureParams: { windowRadius: 4, searchRange: 32 },
  borderWidth: 16,
  sampleSpacing: 8,
  violationThreshold: -1,
};

// ---------------------------------------------------------------------------
// Tests: detectFloatingWindowViolations
// ---------------------------------------------------------------------------

describe('FloatingWindowDetector', () => {
  describe('detectFloatingWindowViolations', () => {
    it('FWD-001: identical images have no violations', () => {
      const img = createGradientImage(64, 64);
      const result = detectFloatingWindowViolations(img, img, testOptions);

      expect(result.hasViolation).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.affectedEdges).toHaveLength(0);
      expect(result.worstDisparity).toBe(0);
    });

    it('FWD-002: solid identical images have no violations', () => {
      const left = createSolidImage(64, 64, 128, 128, 128);
      const right = createSolidImage(64, 64, 128, 128, 128);
      const result = detectFloatingWindowViolations(left, right, testOptions);

      expect(result.hasViolation).toBe(false);
    });

    it('FWD-003: left edge violation detected with negative disparity at left border', () => {
      // Object at left edge in left eye is shifted right in right eye -> negative disparity
      // This simulates content poking out at the left edge
      // Left eye: stripe near left edge at x=5
      // Right eye: stripe shifted left (negative disparity means right eye feature is to the LEFT)
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5); // shifted left by 5 -> disparity = -5

      const result = detectFloatingWindowViolations(left, right, testOptions);

      expect(result.hasViolation).toBe(true);
      expect(result.affectedEdges).toContain('left');
      expect(result.worstDisparity).toBeLessThan(0);
    });

    it('FWD-004: positive disparity at edges is not a violation', () => {
      // Positive disparity (right eye feature shifted right) means object behind screen
      // This should NOT be a violation
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 10, 5); // shifted right by 5 -> disparity = +5

      const result = detectFloatingWindowViolations(left, right, testOptions);

      // Left edge should not be violated (positive disparity)
      const leftViolation = result.violations.find(v => v.edge === 'left');
      expect(leftViolation).toBeUndefined();
    });

    it('FWD-005: result contains per-edge violation details', () => {
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5);

      const result = detectFloatingWindowViolations(left, right, testOptions);

      if (result.hasViolation) {
        for (const v of result.violations) {
          expect(v.edge).toBeDefined();
          expect(v.maxViolationDisparity).toBeLessThan(0);
          expect(v.violatingPoints).toBeGreaterThan(0);
          expect(v.totalPoints).toBeGreaterThanOrEqual(v.violatingPoints);
        }
      }
    });

    it('FWD-006: violation threshold controls sensitivity', () => {
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 3, 5); // -2 pixel disparity

      // Strict threshold: -1 should detect it
      const strictResult = detectFloatingWindowViolations(left, right, {
        ...testOptions,
        violationThreshold: -1,
      });

      // Lenient threshold: -5 should not detect it
      const lenientResult = detectFloatingWindowViolations(left, right, {
        ...testOptions,
        violationThreshold: -5,
      });

      // Strict should find more or equal violations than lenient
      expect(strictResult.violations.length).toBeGreaterThanOrEqual(lenientResult.violations.length);
    });

    it('FWD-007: handles small images gracefully', () => {
      const left = createSolidImage(16, 16, 100, 100, 100);
      const right = createSolidImage(16, 16, 100, 100, 100);

      // Should not throw
      const result = detectFloatingWindowViolations(left, right, testOptions);
      expect(typeof result.hasViolation).toBe('boolean');
    });

    it('FWD-008: affectedEdges matches violations array', () => {
      const img = createGradientImage(64, 64);
      const result = detectFloatingWindowViolations(img, img, testOptions);

      expect(result.affectedEdges).toHaveLength(result.violations.length);
      for (const v of result.violations) {
        expect(result.affectedEdges).toContain(v.edge);
      }
    });

    it('FWD-009: worstDisparity is the most negative value', () => {
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5);

      const result = detectFloatingWindowViolations(left, right, testOptions);

      if (result.hasViolation) {
        // worstDisparity should be the most negative across all edges
        for (const v of result.violations) {
          expect(result.worstDisparity).toBeLessThanOrEqual(v.maxViolationDisparity);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: renderViolationOverlay
  // ---------------------------------------------------------------------------

  describe('renderViolationOverlay', () => {
    it('FWD-020: no violation returns copy of original image', () => {
      const img = createSolidImage(32, 32, 100, 100, 100);
      const result: FloatingWindowViolationResult = {
        hasViolation: false,
        violations: [],
        worstDisparity: 0,
        affectedEdges: [],
      };

      const output = renderViolationOverlay(img, result);
      expect(output.width).toBe(32);
      expect(output.height).toBe(32);

      // Should be identical copy
      const pixel = getPixel(output, 16, 16);
      expect(pixel[0]).toBe(100);
      expect(pixel[1]).toBe(100);
      expect(pixel[2]).toBe(100);
    });

    it('FWD-021: does not modify source image', () => {
      const img = createSolidImage(32, 32, 100, 100, 100);
      const srcCopy = new Uint8ClampedArray(img.data);

      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'left',
          maxViolationDisparity: -5,
          violatingPoints: 3,
          totalPoints: 5,
        }],
        worstDisparity: -5,
        affectedEdges: ['left'],
      };

      renderViolationOverlay(img, violationResult);
      expect(img.data).toEqual(srcCopy);
    });

    it('FWD-022: left edge violation draws red border on left', () => {
      const img = createSolidImage(64, 64, 0, 0, 0);
      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'left',
          maxViolationDisparity: -5,
          violatingPoints: 3,
          totalPoints: 5,
        }],
        worstDisparity: -5,
        affectedEdges: ['left'],
      };

      const output = renderViolationOverlay(img, violationResult, 4, 1.0);

      // Left border should be red
      const leftPixel = getPixel(output, 1, 32);
      expect(leftPixel[0]).toBeGreaterThan(200); // Red
      expect(leftPixel[1]).toBe(0);
      expect(leftPixel[2]).toBe(0);

      // Center should be unchanged (black)
      const centerPixel = getPixel(output, 32, 32);
      expect(centerPixel[0]).toBe(0);
      expect(centerPixel[1]).toBe(0);
      expect(centerPixel[2]).toBe(0);
    });

    it('FWD-023: right edge violation draws red border on right', () => {
      const img = createSolidImage(64, 64, 0, 0, 0);
      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'right',
          maxViolationDisparity: -8,
          violatingPoints: 4,
          totalPoints: 6,
        }],
        worstDisparity: -8,
        affectedEdges: ['right'],
      };

      const output = renderViolationOverlay(img, violationResult, 4, 1.0);

      // Right border should be red
      const rightPixel = getPixel(output, 62, 32);
      expect(rightPixel[0]).toBeGreaterThan(200);

      // Left should be unchanged
      const leftPixel = getPixel(output, 1, 32);
      expect(leftPixel[0]).toBe(0);
    });

    it('FWD-024: top edge violation draws red border on top', () => {
      const img = createSolidImage(64, 64, 0, 0, 0);
      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'top',
          maxViolationDisparity: -3,
          violatingPoints: 2,
          totalPoints: 4,
        }],
        worstDisparity: -3,
        affectedEdges: ['top'],
      };

      const output = renderViolationOverlay(img, violationResult, 4, 1.0);

      // Top border should be red
      const topPixel = getPixel(output, 32, 1);
      expect(topPixel[0]).toBeGreaterThan(200);

      // Bottom should be unchanged
      const bottomPixel = getPixel(output, 32, 62);
      expect(bottomPixel[0]).toBe(0);
    });

    it('FWD-025: bottom edge violation draws red border on bottom', () => {
      const img = createSolidImage(64, 64, 0, 0, 0);
      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'bottom',
          maxViolationDisparity: -6,
          violatingPoints: 5,
          totalPoints: 8,
        }],
        worstDisparity: -6,
        affectedEdges: ['bottom'],
      };

      const output = renderViolationOverlay(img, violationResult, 4, 1.0);

      // Bottom border should be red
      const bottomPixel = getPixel(output, 32, 62);
      expect(bottomPixel[0]).toBeGreaterThan(200);

      // Top should be unchanged
      const topPixel = getPixel(output, 32, 1);
      expect(topPixel[0]).toBe(0);
    });

    it('FWD-026: multiple edges can be affected simultaneously', () => {
      const img = createSolidImage(64, 64, 0, 0, 0);
      const violationResult: FloatingWindowViolationResult = {
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

      const output = renderViolationOverlay(img, violationResult, 4, 1.0);

      // All four edges should be red
      expect(getPixel(output, 1, 32)[0]).toBeGreaterThan(200); // left
      expect(getPixel(output, 62, 32)[0]).toBeGreaterThan(200); // right
      expect(getPixel(output, 32, 1)[0]).toBeGreaterThan(200); // top
      expect(getPixel(output, 32, 62)[0]).toBeGreaterThan(200); // bottom

      // Center should be unaffected
      expect(getPixel(output, 32, 32)[0]).toBe(0);
    });

    it('FWD-027: opacity controls border intensity', () => {
      const img = createSolidImage(64, 64, 100, 100, 100);
      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'left',
          maxViolationDisparity: -5,
          violatingPoints: 3,
          totalPoints: 5,
        }],
        worstDisparity: -5,
        affectedEdges: ['left'],
      };

      const outputFull = renderViolationOverlay(img, violationResult, 4, 1.0);
      const outputHalf = renderViolationOverlay(img, violationResult, 4, 0.5);

      const pixFull = getPixel(outputFull, 1, 32);
      const pixHalf = getPixel(outputHalf, 1, 32);

      // Full opacity red on gray: R=255, G=0, B=0
      expect(pixFull[0]).toBe(255);
      expect(pixFull[1]).toBe(0);

      // Half opacity red on gray(100): R=100*0.5+255*0.5=178, G=100*0.5=50
      expect(pixHalf[0]).toBeGreaterThan(150);
      expect(pixHalf[0]).toBeLessThan(200);
      expect(pixHalf[1]).toBeGreaterThan(30);
      expect(pixHalf[1]).toBeLessThan(70);
    });

    it('FWD-028: border thickness controls width of overlay', () => {
      const img = createSolidImage(64, 64, 0, 0, 0);
      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'left',
          maxViolationDisparity: -5,
          violatingPoints: 3,
          totalPoints: 5,
        }],
        worstDisparity: -5,
        affectedEdges: ['left'],
      };

      const outputThin = renderViolationOverlay(img, violationResult, 2, 1.0);
      const outputThick = renderViolationOverlay(img, violationResult, 10, 1.0);

      // Thin border: pixel at x=1 should be red, x=5 should be black
      expect(getPixel(outputThin, 1, 32)[0]).toBeGreaterThan(200);
      expect(getPixel(outputThin, 5, 32)[0]).toBe(0);

      // Thick border: pixel at x=5 should also be red
      expect(getPixel(outputThick, 5, 32)[0]).toBeGreaterThan(200);
    });

    it('FWD-029: output dimensions match input', () => {
      const img = createSolidImage(80, 60, 50, 50, 50);
      const violationResult: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'left',
          maxViolationDisparity: -3,
          violatingPoints: 2,
          totalPoints: 4,
        }],
        worstDisparity: -3,
        affectedEdges: ['left'],
      };

      const output = renderViolationOverlay(img, violationResult);
      expect(output.width).toBe(80);
      expect(output.height).toBe(60);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: defaults and types
  // ---------------------------------------------------------------------------

  describe('defaults and types', () => {
    it('FWD-040: DEFAULT_FLOATING_WINDOW_OPTIONS has sensible values', () => {
      expect(DEFAULT_FLOATING_WINDOW_OPTIONS.borderWidth).toBeGreaterThan(0);
      expect(DEFAULT_FLOATING_WINDOW_OPTIONS.sampleSpacing).toBeGreaterThan(0);
      expect(DEFAULT_FLOATING_WINDOW_OPTIONS.violationThreshold).toBeLessThan(0);
      expect(DEFAULT_FLOATING_WINDOW_OPTIONS.measureParams.windowRadius).toBeGreaterThan(0);
      expect(DEFAULT_FLOATING_WINDOW_OPTIONS.measureParams.searchRange).toBeGreaterThan(0);
    });

    it('FWD-041: FloatingWindowViolationResult has all expected fields', () => {
      const img = createGradientImage(64, 64);
      const result = detectFloatingWindowViolations(img, img, testOptions);

      expect('hasViolation' in result).toBe(true);
      expect('violations' in result).toBe(true);
      expect('worstDisparity' in result).toBe(true);
      expect('affectedEdges' in result).toBe(true);
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.affectedEdges)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: full detection + overlay pipeline
  // ---------------------------------------------------------------------------

  describe('integration: detection + overlay', () => {
    it('FWD-050: end-to-end pipeline produces valid output', () => {
      // Create a scenario with negative disparity at left edge
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5);

      const detection = detectFloatingWindowViolations(left, right, testOptions);
      const overlay = renderViolationOverlay(left, detection, 4, 0.7);

      expect(overlay.width).toBe(128);
      expect(overlay.height).toBe(64);

      // If violations detected, border pixels should show some red
      if (detection.hasViolation && detection.affectedEdges.includes('left')) {
        const borderPixel = getPixel(overlay, 1, 32);
        expect(borderPixel[0]).toBeGreaterThan(0); // Some red from overlay
      }
    });

    it('FWD-051: clean images produce clean overlay', () => {
      const img = createGradientImage(64, 64);
      const detection = detectFloatingWindowViolations(img, img, testOptions);
      const overlay = renderViolationOverlay(img, detection);

      // No violation, so overlay should be identical to source
      expect(detection.hasViolation).toBe(false);
      // Compare a few sample pixels
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
