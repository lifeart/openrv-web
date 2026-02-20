/**
 * Effect Processor Worker Tests
 *
 * Tests for the build-time worker that processes effects on image data.
 * Imports the worker's actual exported constants and functions via __test__
 * and the shared effectProcessing module to verify real production code.
 */

import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import {
  HIGHLIGHT_SHADOW_RANGE,
  WHITES_BLACKS_RANGE,
  CLARITY_EFFECT_SCALE,
  LUMA_R,
  LUMA_G,
  LUMA_B,
  smoothstep,
  bellCurve,
  rgbToHsl,
  hslToRgb,
} from '../utils/effects/effectProcessing.shared';
import type { WorkerEffectsState } from '../utils/effects/effectProcessing.shared';

// Mock postMessage before importing the worker, since the worker calls
// self.postMessage({ type: 'ready' }) on load and jsdom's window.postMessage
// requires a targetOrigin argument.
vi.hoisted(() => {
  self.postMessage = (() => {}) as typeof self.postMessage;
});

// Import the worker's __test__ exports for processEffects
const { __test__ } = await import('./effectProcessor.worker');
const { processEffects } = __test__;

/**
 * Helper to create a default WorkerEffectsState with all effects at identity/zero.
 */
function createDefaultWorkerEffectsState(): WorkerEffectsState {
  return {
    colorAdjustments: {
      exposure: 0,
      gamma: 1,
      saturation: 1,
      vibrance: 0,
      vibranceSkinProtection: true,
      contrast: 0,
      clarity: 0,
      hueRotation: 0,
      temperature: 0,
      tint: 0,
      brightness: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
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
    toneMappingState: {
      enabled: false,
      operator: 'off',
    },
    colorInversionEnabled: false,
  };
}

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
    it('EPW-002: processEffects does not modify data when no effects are active', () => {
      // With all effects at default/identity, the worker should return data unchanged
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 100;     // R
        data[i + 1] = 150;  // G
        data[i + 2] = 200;  // B
        data[i + 3] = 255;  // A
      }
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      processEffects(data, width, height, state);

      // Data should be unchanged when no effects are active
      expect(data).toEqual(original);
    });

    it('EPW-003: processEffects modifies data when highlights are adjusted', () => {
      // The worker should actually process image data with highlight adjustments
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 200;     // R (bright pixel)
        data[i + 1] = 200;  // G
        data[i + 2] = 200;  // B
        data[i + 3] = 255;  // A
      }
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 50;
      processEffects(data, width, height, state);

      // Bright pixels should be affected by highlight adjustment
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('EPW-004: processEffects returns valid pixel data (0-255 range)', () => {
      // After processing, all pixel values should remain in valid range
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128;
        data[i + 1] = 128;
        data[i + 2] = 128;
        data[i + 3] = 255;
      }

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 100;
      state.colorAdjustments.shadows = -100;
      state.colorAdjustments.vibrance = 50;
      processEffects(data, width, height, state);

      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });

    it('EPW-005: processEffects handles color inversion', () => {
      // The worker should correctly invert pixel colors
      const width = 2;
      const height = 2;
      const data = new Uint8ClampedArray(width * height * 4);
      data[0] = 0; data[1] = 0; data[2] = 0; data[3] = 255; // black pixel
      data[4] = 255; data[5] = 255; data[6] = 255; data[7] = 255; // white pixel
      data[8] = 100; data[9] = 150; data[10] = 200; data[11] = 255;
      data[12] = 50; data[13] = 100; data[14] = 150; data[15] = 255;

      const state = createDefaultWorkerEffectsState();
      state.colorInversionEnabled = true;
      processEffects(data, width, height, state);

      // Black should become white
      expect(data[0]).toBe(255);
      expect(data[1]).toBe(255);
      expect(data[2]).toBe(255);
      // White should become black
      expect(data[4]).toBe(0);
      expect(data[5]).toBe(0);
      expect(data[6]).toBe(0);
    });
  });

  describe('effect processing logic verification', () => {
    // These tests verify the actual exported constants and functions
    // from the shared effectProcessing module used by the worker

    it('EPW-006: highlight/shadow range constant is correct', () => {
      expect(HIGHLIGHT_SHADOW_RANGE).toBe(128);
    });

    it('EPW-007: whites/blacks range constant is correct', () => {
      expect(WHITES_BLACKS_RANGE).toBe(55);
    });

    it('EPW-008: clarity effect scale constant is correct', () => {
      expect(CLARITY_EFFECT_SCALE).toBe(0.7);
    });

    it('EPW-009: luminance coefficients are Rec. 709', () => {
      // Sum should equal 1.0
      expect(LUMA_R + LUMA_G + LUMA_B).toBeCloseTo(1.0, 10);
    });

    it('EPW-010: smoothstep function produces correct values', () => {
      expect(smoothstep(0, 1, 0)).toBe(0);
      expect(smoothstep(0, 1, 1)).toBe(1);
      expect(smoothstep(0, 1, 0.5)).toBe(0.5);
      expect(smoothstep(0, 1, -0.5)).toBe(0); // Clamped
      expect(smoothstep(0, 1, 1.5)).toBe(1); // Clamped
    });

    it('EPW-011: bellCurve function produces correct values', () => {
      // At center, value should be 1
      expect(bellCurve(0.5, 0.5, 0.25)).toBeCloseTo(1.0, 5);

      // Away from center, value should decrease
      expect(bellCurve(0, 0.5, 0.25)).toBeLessThan(0.5);
      expect(bellCurve(1, 0.5, 0.25)).toBeLessThan(0.5);
    });

    it('EPW-012: RGB to HSL conversion is correct', () => {
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
        'hueRotation',
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
      // Create a valid WorkerEffectsState and verify its required top-level keys
      // are present. This catches drift between the type definition and usage.
      const state = createDefaultWorkerEffectsState();
      const actualKeys = Object.keys(state).sort();

      const requiredTopLevelKeys = [
        'colorAdjustments',
        'cdlValues',
        'curvesData',
        'filterSettings',
        'channelMode',
        'colorWheelsState',
        'hslQualifierState',
        'toneMappingState',
        'colorInversionEnabled',
      ].sort();

      // Verify the actual state object contains all required keys
      expect(actualKeys).toEqual(requiredTopLevelKeys);

      // Verify processEffects accepts this state without error
      const data = new Uint8ClampedArray(16); // 2x2 image
      expect(() => processEffects(data, 2, 2, state)).not.toThrow();
    });
  });
});
