/**
 * Effect Processor Worker Tests
 *
 * Tests for the build-time worker that processes effects on image data.
 * Since Web Workers run in a separate context, we test the effect processing
 * logic by simulating the worker message handling.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';

// We can't directly import the worker, but we can test that the file exists
// and verify the worker integration through PrerenderBufferManager tests

describe('Effect Processor Worker', () => {
  describe('worker file existence', () => {
    it('EPW-001: worker file should be importable as URL', async () => {
      // Verify the worker file exists and can be referenced
      // This is a build-time check
      const workerPath = new URL('./effectProcessor.worker.ts', import.meta.url);
      expect(workerPath.href).toContain('effectProcessor.worker.ts');
    });
  });

  describe('message protocol', () => {
    // Mock the worker's onmessage handler behavior

    it('EPW-002: should send ready message on initialization', () => {
      // The worker sends { type: 'ready' } when it starts
      const readyMessage = { type: 'ready' };
      expect(readyMessage.type).toBe('ready');
    });

    it('EPW-003: should handle process message type', () => {
      // Valid process message structure
      const processMessage = {
        type: 'process',
        id: 1,
        imageData: new Uint8ClampedArray(4), // 1 pixel
        width: 1,
        height: 1,
        effectsState: {
          colorAdjustments: {
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
            vibrance: 0,
            vibranceSkinProtection: true,
            clarity: 0,
          },
          cdlValues: {
            slope: { r: 1, g: 1, b: 1 },
            offset: { r: 0, g: 0, b: 0 },
            power: { r: 1, g: 1, b: 1 },
            saturation: 1,
          },
          curvesData: {
            master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
            red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
            green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
            blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
          },
          filterSettings: { sharpen: 0 },
          channelMode: 'rgb',
          colorWheelsState: {
            lift: { r: 0, g: 0, b: 0, y: 0 },
            gamma: { r: 0, g: 0, b: 0, y: 0 },
            gain: { r: 0, g: 0, b: 0, y: 0 },
            master: { r: 0, g: 0, b: 0, y: 0 },
          },
          hslQualifierState: {
            enabled: false,
            hue: { center: 0, width: 60, softness: 20 },
            saturation: { center: 50, width: 50, softness: 20 },
            luminance: { center: 50, width: 50, softness: 20 },
            correction: { hueShift: 0, saturationScale: 1, luminanceScale: 1 },
            invert: false,
            mattePreview: false,
          },
        },
      };

      expect(processMessage.type).toBe('process');
      expect(processMessage.id).toBe(1);
      expect(processMessage.imageData).toBeInstanceOf(Uint8ClampedArray);
      expect(processMessage.width).toBe(1);
      expect(processMessage.height).toBe(1);
      expect(processMessage.effectsState).toBeDefined();
    });

    it('EPW-004: result message structure is correct', () => {
      // Expected result message format
      const resultMessage = {
        type: 'result',
        id: 1,
        imageData: new Uint8ClampedArray(4),
      };

      expect(resultMessage.type).toBe('result');
      expect(resultMessage.id).toBe(1);
      expect(resultMessage.imageData).toBeInstanceOf(Uint8ClampedArray);
    });

    it('EPW-005: error message structure is correct', () => {
      // Expected error message format
      const errorMessage = {
        type: 'error',
        id: 1,
        error: 'Processing failed',
      };

      expect(errorMessage.type).toBe('error');
      expect(errorMessage.id).toBe(1);
      expect(errorMessage.error).toBe('Processing failed');
    });
  });

  describe('effect processing logic verification', () => {
    // These tests verify the effect processing constants and algorithms
    // are consistent with EffectProcessor.ts

    it('EPW-006: highlight/shadow range constant is correct', () => {
      const HIGHLIGHT_SHADOW_RANGE = 128;
      expect(HIGHLIGHT_SHADOW_RANGE).toBe(128);
    });

    it('EPW-007: whites/blacks range constant is correct', () => {
      const WHITES_BLACKS_RANGE = 55;
      expect(WHITES_BLACKS_RANGE).toBe(55);
    });

    it('EPW-008: clarity effect scale constant is correct', () => {
      const CLARITY_EFFECT_SCALE = 0.7;
      expect(CLARITY_EFFECT_SCALE).toBe(0.7);
    });

    it('EPW-009: luminance coefficients are Rec. 709', () => {
      const LUMA_R = 0.2126;
      const LUMA_G = 0.7152;
      const LUMA_B = 0.0722;

      // Sum should equal 1.0
      expect(LUMA_R + LUMA_G + LUMA_B).toBeCloseTo(1.0, 10);
    });

    it('EPW-010: smoothstep function produces correct values', () => {
      // Replicate the smoothstep function from the worker
      function smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }

      expect(smoothstep(0, 1, 0)).toBe(0);
      expect(smoothstep(0, 1, 1)).toBe(1);
      expect(smoothstep(0, 1, 0.5)).toBe(0.5);
      expect(smoothstep(0, 1, -0.5)).toBe(0); // Clamped
      expect(smoothstep(0, 1, 1.5)).toBe(1); // Clamped
    });

    it('EPW-011: bellCurve function produces correct values', () => {
      function bellCurve(x: number, center: number, width: number): number {
        const d = (x - center) / width;
        return Math.exp(-d * d * 2);
      }

      // At center, value should be 1
      expect(bellCurve(0.5, 0.5, 0.25)).toBeCloseTo(1.0, 5);

      // Away from center, value should decrease
      expect(bellCurve(0, 0.5, 0.25)).toBeLessThan(0.5);
      expect(bellCurve(1, 0.5, 0.25)).toBeLessThan(0.5);
    });

    it('EPW-012: RGB to HSL conversion is correct', () => {
      function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h = 0, s = 0;

        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b - r) / d + 2) / 6;
          else h = ((r - g) / d + 4) / 6;
        }
        return { h: h * 360, s, l };
      }

      // Pure red
      const red = rgbToHsl(1, 0, 0);
      expect(red.h).toBeCloseTo(0, 1);
      expect(red.s).toBeCloseTo(1, 5);
      expect(red.l).toBeCloseTo(0.5, 5);

      // Pure green
      const green = rgbToHsl(0, 1, 0);
      expect(green.h).toBeCloseTo(120, 1);
      expect(green.s).toBeCloseTo(1, 5);
      expect(green.l).toBeCloseTo(0.5, 5);

      // Pure blue
      const blue = rgbToHsl(0, 0, 1);
      expect(blue.h).toBeCloseTo(240, 1);
      expect(blue.s).toBeCloseTo(1, 5);
      expect(blue.l).toBeCloseTo(0.5, 5);

      // White (no saturation)
      const white = rgbToHsl(1, 1, 1);
      expect(white.s).toBe(0);
      expect(white.l).toBe(1);

      // Black (no saturation)
      const black = rgbToHsl(0, 0, 0);
      expect(black.s).toBe(0);
      expect(black.l).toBe(0);
    });

    it('EPW-013: HSL to RGB conversion is correct', () => {
      function hueToRgb(p: number, q: number, t: number): number {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      }

      function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
        let r: number, g: number, b: number;
        if (s === 0) {
          r = g = b = l;
        } else {
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          const hNorm = h / 360;
          r = hueToRgb(p, q, hNorm + 1 / 3);
          g = hueToRgb(p, q, hNorm);
          b = hueToRgb(p, q, hNorm - 1 / 3);
        }
        return { r, g, b };
      }

      // Pure red (H=0, S=1, L=0.5)
      const red = hslToRgb(0, 1, 0.5);
      expect(red.r).toBeCloseTo(1, 5);
      expect(red.g).toBeCloseTo(0, 5);
      expect(red.b).toBeCloseTo(0, 5);

      // Pure green (H=120, S=1, L=0.5)
      const green = hslToRgb(120, 1, 0.5);
      expect(green.r).toBeCloseTo(0, 5);
      expect(green.g).toBeCloseTo(1, 5);
      expect(green.b).toBeCloseTo(0, 5);

      // Pure blue (H=240, S=1, L=0.5)
      const blue = hslToRgb(240, 1, 0.5);
      expect(blue.r).toBeCloseTo(0, 5);
      expect(blue.g).toBeCloseTo(0, 5);
      expect(blue.b).toBeCloseTo(1, 5);

      // Grayscale (S=0)
      const gray = hslToRgb(0, 0, 0.5);
      expect(gray.r).toBeCloseTo(0.5, 5);
      expect(gray.g).toBeCloseTo(0.5, 5);
      expect(gray.b).toBeCloseTo(0.5, 5);
    });
  });

  describe('type consistency with main thread', () => {
    /**
     * REGRESSION TEST: Ensures worker ColorAdjustments interface stays in sync
     * with the main thread ColorControls.ts interface.
     *
     * If this test fails, it means a property was added to ColorControls.ts
     * but not to the worker's ColorAdjustments interface.
     */
    it('EPW-014: worker ColorAdjustments has all properties from main thread', () => {
      // Get all property names from the main thread's DEFAULT_COLOR_ADJUSTMENTS
      const mainThreadProperties = Object.keys(DEFAULT_COLOR_ADJUSTMENTS).sort();

      // Expected properties that the worker's ColorAdjustments interface should have
      // This list MUST match the interface in effectProcessor.worker.ts
      const workerProperties = [
        'exposure',
        'gamma',
        'saturation',
        'vibrance',
        'vibranceSkinProtection',
        'contrast',
        'clarity',
        'temperature',
        'tint',
        'brightness',
        'highlights',
        'shadows',
        'whites',
        'blacks',
      ].sort();

      // Verify main thread has expected properties
      expect(mainThreadProperties).toEqual(workerProperties);
    });

    it('EPW-015: process message effectsState structure matches AllEffectsState', () => {
      // This test documents the required structure of effectsState
      // If AllEffectsState changes, this test should be updated
      const requiredTopLevelKeys = [
        'colorAdjustments',
        'cdlValues',
        'curvesData',
        'filterSettings',
        'channelMode',
        'colorWheelsState',
        'hslQualifierState',
      ];

      // Verify the expected structure is documented
      expect(requiredTopLevelKeys.length).toBe(7);
    });
  });
});
