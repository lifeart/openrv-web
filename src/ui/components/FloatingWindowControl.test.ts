/**
 * FloatingWindowControl Component Tests
 *
 * Tests for the on-demand floating window violation detection control.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FloatingWindowControl, DEFAULT_FLOATING_WINDOW_CONTROL_STATE } from './FloatingWindowControl';
import type { FloatingWindowViolationResult } from '../../stereo/FloatingWindowDetector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FloatingWindowControl', () => {
  let control: FloatingWindowControl;

  beforeEach(() => {
    control = new FloatingWindowControl();
  });

  describe('initialization', () => {
    it('FWC-U001: should initialize with default state', () => {
      expect(control.getState()).toEqual(DEFAULT_FLOATING_WINDOW_CONTROL_STATE);
    });

    it('FWC-U002: hasResult should be false initially', () => {
      expect(control.hasResult()).toBe(false);
    });

    it('FWC-U003: hasViolation should be false initially', () => {
      expect(control.hasViolation()).toBe(false);
    });

    it('FWC-U004: getLastResult should be null initially', () => {
      expect(control.getLastResult()).toBeNull();
    });

    it('FWC-U005: isDetecting should be false initially', () => {
      expect(control.isDetecting()).toBe(false);
    });
  });

  describe('detect', () => {
    it('FWC-U010: detect with identical images returns no violations', () => {
      const img = createGradientImage(64, 64);
      const result = control.detect(img, img);

      expect(result.hasViolation).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('FWC-U011: detect stores result in state', () => {
      const img = createGradientImage(64, 64);
      control.detect(img, img);

      expect(control.hasResult()).toBe(true);
      expect(control.getLastResult()).not.toBeNull();
    });

    it('FWC-U012: detect emits detectionComplete event', () => {
      const handler = vi.fn();
      control.on('detectionComplete', handler);

      const img = createGradientImage(64, 64);
      control.detect(img, img);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ hasViolation: false }));
    });

    it('FWC-U013: detect emits stateChanged event', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);

      const img = createGradientImage(64, 64);
      control.detect(img, img);

      // Should emit at least twice: once for detecting=true, once for detecting=false
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('FWC-U014: after detect, isDetecting is false', () => {
      const img = createGradientImage(64, 64);
      control.detect(img, img);

      expect(control.isDetecting()).toBe(false);
    });

    it('FWC-U015: detect with negative disparity at edge detects violation', () => {
      // Left eye: stripe near left edge at x=5
      // Right eye: stripe shifted left -> negative disparity
      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5);

      const result = control.detect(left, right);

      expect(result.hasViolation).toBe(true);
      expect(control.hasViolation()).toBe(true);
    });

    it('FWC-U016: detect returns the same result stored in state', () => {
      const img = createGradientImage(64, 64);
      const returned = control.detect(img, img);
      const stored = control.getLastResult();

      expect(returned.hasViolation).toBe(stored!.hasViolation);
      expect(returned.violations).toEqual(stored!.violations);
    });

    it('FWC-U017: subsequent detect calls overwrite previous result', () => {
      const img1 = createGradientImage(64, 64);
      control.detect(img1, img1);
      expect(control.hasViolation()).toBe(false);

      const left = createStripeImage(128, 64, 5, 5);
      const right = createStripeImage(128, 64, 0, 5);
      control.detect(left, right);
      expect(control.hasViolation()).toBe(true);
    });
  });

  describe('clearResult', () => {
    it('FWC-U020: clearResult resets result state', () => {
      const img = createGradientImage(64, 64);
      control.detect(img, img);
      expect(control.hasResult()).toBe(true);

      control.clearResult();
      expect(control.hasResult()).toBe(false);
      expect(control.getLastResult()).toBeNull();
      expect(control.hasViolation()).toBe(false);
    });

    it('FWC-U021: clearResult emits stateChanged event', () => {
      const img = createGradientImage(64, 64);
      control.detect(img, img);

      const handler = vi.fn();
      control.on('stateChanged', handler);

      control.clearResult();
      expect(handler).toHaveBeenCalled();
    });

    it('FWC-U022: clearResult on empty state does not emit', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);

      control.clearResult();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('formatResult', () => {
    it('FWC-U030: formats clean result', () => {
      const result: FloatingWindowViolationResult = {
        hasViolation: false,
        violations: [],
        worstDisparity: 0,
        affectedEdges: [],
      };

      const text = control.formatResult(result);
      expect(text).toBe('No floating window violations detected');
    });

    it('FWC-U031: formats violation result with affected edges', () => {
      const result: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [{
          edge: 'left',
          maxViolationDisparity: -5,
          violatingPoints: 3,
          totalPoints: 10,
        }],
        worstDisparity: -5,
        affectedEdges: ['left'],
      };

      const text = control.formatResult(result);
      expect(text).toContain('left');
      expect(text).toContain('-5.0');
      expect(text).toContain('Floating window violation');
    });

    it('FWC-U032: formats result with multiple affected edges', () => {
      const result: FloatingWindowViolationResult = {
        hasViolation: true,
        violations: [
          { edge: 'left', maxViolationDisparity: -3, violatingPoints: 2, totalPoints: 5 },
          { edge: 'right', maxViolationDisparity: -7, violatingPoints: 4, totalPoints: 5 },
        ],
        worstDisparity: -7,
        affectedEdges: ['left', 'right'],
      };

      const text = control.formatResult(result);
      expect(text).toContain('left');
      expect(text).toContain('right');
      expect(text).toContain('-7.0');
    });
  });

  describe('state management', () => {
    it('FWC-U040: getState returns a copy', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('FWC-U041: mutations to returned state do not affect internal state', () => {
      const img = createGradientImage(64, 64);
      control.detect(img, img);

      const returned = control.getState();
      returned.hasResult = false;
      returned.lastResult = null;

      expect(control.hasResult()).toBe(true);
      expect(control.getLastResult()).not.toBeNull();
    });
  });

  describe('dispose', () => {
    it('FWC-U050: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('FWC-U051: dispose resets state', () => {
      const img = createGradientImage(64, 64);
      control.detect(img, img);

      control.dispose();
      expect(control.getState()).toEqual(DEFAULT_FLOATING_WINDOW_CONTROL_STATE);
    });

    it('FWC-U052: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('FWC-U053: events are not fired after dispose', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);

      control.dispose();

      // After dispose, listeners are removed
      const img = createGradientImage(64, 64);
      control.detect(img, img);
      // The handler should not have been called after dispose removed it
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
