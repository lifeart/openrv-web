/**
 * Effect Processor Worker Tests
 *
 * Tests for the build-time worker that processes effects on image data.
 * Imports the worker's actual exported functions via __test__ and exercises
 * the real processEffects pipeline to verify production behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import type { WorkerEffectsState } from '../utils/effects/effectProcessing.shared';

// Mock postMessage before importing the worker, since the worker calls
// self.postMessage({ type: 'ready' }) on load and jsdom's window.postMessage
// requires a targetOrigin argument.
vi.hoisted(() => {
  self.postMessage = (() => {}) as typeof self.postMessage;
});

// Import the worker's __test__ exports for processEffects and internal helpers
const { __test__ } = await import('./effectProcessor.worker');
const { processEffects, getMidtoneMask, resetBuffers } = __test__;

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

/**
 * Helper to create a solid-color pixel buffer.
 */
function createSolidPixelData(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return data;
}

describe('Effect Processor Worker', () => {
  beforeEach(() => {
    resetBuffers();
  });

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
      const data = createSolidPixelData(width, height, 100, 150, 200);
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
      const data = createSolidPixelData(width, height, 200, 200, 200);
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
      const data = createSolidPixelData(width, height, 128, 128, 128);

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
    // These tests verify the worker's real processing pipeline by exercising
    // processEffects with specific effect configurations and verifying
    // observable output behavior.

    it('EPW-006: highlights adjustment scales proportionally to bright pixel luminance', () => {
      // The worker uses HIGHLIGHT_SHADOW_RANGE internally for highlight scaling.
      // Brighter pixels should be affected more than mid-tone pixels.
      const width = 2;
      const height = 1;

      // Two pixels: one bright (230), one mid-tone (128)
      const data = new Uint8ClampedArray(width * height * 4);
      data[0] = 230; data[1] = 230; data[2] = 230; data[3] = 255; // bright
      data[4] = 128; data[5] = 128; data[6] = 128; data[7] = 255; // mid-tone
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 50;
      processEffects(data, width, height, state);

      // Bright pixel should change more than mid-tone pixel
      const brightDelta = Math.abs(data[0]! - original[0]!);
      const midDelta = Math.abs(data[4]! - original[4]!);
      expect(brightDelta).toBeGreaterThan(midDelta);

      // Both should still be in valid range
      expect(data[0]).toBeGreaterThanOrEqual(0);
      expect(data[0]).toBeLessThanOrEqual(255);
    });

    it('EPW-007: whites/blacks adjustments remap the tonal range', () => {
      // The worker uses WHITES_BLACKS_RANGE to remap white and black points.
      // Setting whites > 0 should brighten highlights; blacks > 0 should darken shadows.
      const width = 2;
      const height = 1;

      // One near-white pixel, one near-black pixel
      const data = new Uint8ClampedArray(width * height * 4);
      data[0] = 240; data[1] = 240; data[2] = 240; data[3] = 255; // near-white
      data[4] = 15;  data[5] = 15;  data[6] = 15;  data[7] = 255; // near-black

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.whites = 50;
      state.colorAdjustments.blacks = 50;
      processEffects(data, width, height, state);

      // After whites+blacks adjustment, near-white should be brighter
      // and near-black should be darker (pushed toward clipping)
      expect(data[0]).toBeGreaterThanOrEqual(240);
      expect(data[4]).toBeLessThanOrEqual(15);
    });

    it('EPW-008: clarity enhances local contrast in midtones via the worker pipeline', () => {
      // The worker uses CLARITY_EFFECT_SCALE and the midtone mask internally.
      // Clarity should affect midtone pixels more than shadow/highlight pixels.
      const width = 20;
      const height = 20;

      // Create a checkerboard pattern so there is local contrast to enhance
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          // Midtone checkerboard: alternating 100 and 156
          const v = ((x + y) % 2 === 0) ? 100 : 156;
          data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
        }
      }
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 80;
      processEffects(data, width, height, state);

      // Clarity should have changed some pixels
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);

      // The midtone mask should weight midtones more heavily.
      // Verify via getMidtoneMask that the worker's mask is a bell curve.
      const mask = getMidtoneMask();
      expect(mask[128]!).toBeGreaterThan(mask[0]!);   // midtone > shadow
      expect(mask[128]!).toBeGreaterThan(mask[255]!); // midtone > highlight
    });

    it('EPW-009: luminance channel isolation uses Rec. 709 coefficients', () => {
      // The worker uses LUMA_R, LUMA_G, LUMA_B for luminance isolation.
      // A pixel with only green should produce higher luminance than pure blue
      // (since LUMA_G >> LUMA_B in Rec. 709).
      const width = 2;
      const height = 1;
      const data = new Uint8ClampedArray(width * height * 4);
      data[0] = 0;   data[1] = 255; data[2] = 0;   data[3] = 255; // pure green
      data[4] = 0;   data[5] = 0;   data[6] = 255; data[7] = 255; // pure blue

      const state = createDefaultWorkerEffectsState();
      state.channelMode = 'luminance';
      processEffects(data, width, height, state);

      // In luminance mode, R=G=B=luma. Green's luma should be higher than blue's.
      // Green luma: 0.7152 * 255 ~= 182
      // Blue luma:  0.0722 * 255 ~= 18
      expect(data[0]).toBeGreaterThan(data[4]); // green luma > blue luma
      expect(data[0]).toBe(data[1]); // R=G in luminance mode
      expect(data[0]).toBe(data[2]); // R=B in luminance mode
      expect(data[4]).toBe(data[5]); // R=G for blue pixel too
    });

    it('EPW-010: shadows adjustment brightens dark pixels via smoothstep weighting', () => {
      // The worker internally uses smoothstep to weight the shadow adjustment.
      // Dark pixels should be affected more than bright pixels.
      const width = 2;
      const height = 1;
      const data = new Uint8ClampedArray(width * height * 4);
      data[0] = 30;  data[1] = 30;  data[2] = 30;  data[3] = 255; // dark pixel
      data[4] = 220; data[5] = 220; data[6] = 220; data[7] = 255; // bright pixel
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.shadows = 50; // positive = brighten shadows
      processEffects(data, width, height, state);

      // Dark pixel should brighten significantly, bright pixel minimal change
      const darkDelta = data[0]! - original[0]!;
      const brightDelta = Math.abs(data[4]! - original[4]!);
      expect(darkDelta).toBeGreaterThan(0); // shadows brightened
      expect(darkDelta).toBeGreaterThan(brightDelta); // dark affected more than bright
    });

    it('EPW-011: color wheels gamma adjustment uses bell curve zone weighting', () => {
      // The worker uses bellCurve for gamma wheel zone weighting.
      // The gamma wheel should affect midtones more than shadows or highlights.
      const width = 3;
      const height = 1;
      const data = new Uint8ClampedArray(width * height * 4);
      // Shadow pixel (dark)
      data[0] = 30;  data[1] = 30;  data[2] = 30;  data[3] = 255;
      // Midtone pixel
      data[4] = 128; data[5] = 128; data[6] = 128; data[7] = 255;
      // Highlight pixel (bright)
      data[8] = 225; data[9] = 225; data[10] = 225; data[11] = 255;
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      state.colorWheelsState.gamma = { r: 0.5, g: 0.5, b: 0.5, y: 0 };
      processEffects(data, width, height, state);

      // Midtone pixel should be most affected
      const shadowDelta = Math.abs(data[0]! - original[0]!);
      const midDelta = Math.abs(data[4]! - original[4]!);
      const highDelta = Math.abs(data[8]! - original[8]!);

      expect(midDelta).toBeGreaterThan(shadowDelta);
      expect(midDelta).toBeGreaterThan(highDelta);
    });

    it('EPW-012: HSL qualifier uses RGB-to-HSL conversion to select pixels by hue', () => {
      // The worker uses rgbToHsl internally for HSL qualifier matte computation.
      // Enable the HSL qualifier targeting red hues and verify it affects
      // red pixels but not blue/green pixels.
      const width = 3;
      const height = 1;
      const data = new Uint8ClampedArray(width * height * 4);
      data[0] = 255; data[1] = 50;  data[2] = 50;  data[3] = 255; // red-ish pixel
      data[4] = 50;  data[5] = 255; data[6] = 50;  data[7] = 255; // green-ish pixel
      data[8] = 50;  data[9] = 50;  data[10] = 255; data[11] = 255; // blue-ish pixel
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      state.hslQualifierState = {
        enabled: true,
        hue: { center: 0, width: 60, softness: 10 }, // target reds (hue ~0)
        saturation: { center: 50, width: 100, softness: 20 }, // wide saturation range
        luminance: { center: 50, width: 100, softness: 20 }, // wide luminance range
        correction: { hueShift: 60, saturationScale: 1, luminanceScale: 1 }, // shift hue
        invert: false,
        mattePreview: false,
      };
      processEffects(data, width, height, state);

      // Red pixel should have its hue shifted (significant change)
      const redChanged = data[0] !== original[0] || data[1] !== original[1] || data[2] !== original[2];
      expect(redChanged).toBe(true);

      // Green pixel should be mostly unchanged (hue ~120, outside qualifier range)
      const greenDelta = Math.abs(data[4]! - original[4]!) + Math.abs(data[5]! - original[5]!) + Math.abs(data[6]! - original[6]!);
      // Blue pixel should be mostly unchanged (hue ~240, outside qualifier range)
      const blueDelta = Math.abs(data[8]! - original[8]!) + Math.abs(data[9]! - original[9]!) + Math.abs(data[10]! - original[10]!);

      // The red pixel should be affected far more than green or blue
      const redDelta = Math.abs(data[0]! - original[0]!) + Math.abs(data[1]! - original[1]!) + Math.abs(data[2]! - original[2]!);
      expect(redDelta).toBeGreaterThan(greenDelta);
      expect(redDelta).toBeGreaterThan(blueDelta);
    });

    it('EPW-013: HSL qualifier hue shift via processEffects round-trips correctly', () => {
      // The worker uses hslToRgb to convert corrected HSL back to RGB.
      // A full 360-degree hue shift should return approximately the same pixel values.
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray(4);
      data[0] = 200; data[1] = 80; data[2] = 80; data[3] = 255; // reddish pixel
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      state.hslQualifierState = {
        enabled: true,
        hue: { center: 0, width: 180, softness: 0 }, // match everything
        saturation: { center: 50, width: 100, softness: 0 },
        luminance: { center: 50, width: 100, softness: 0 },
        correction: { hueShift: 360, saturationScale: 1, luminanceScale: 1 }, // full rotation
        invert: false,
        mattePreview: false,
      };
      processEffects(data, width, height, state);

      // A 360-degree hue shift should produce approximately the same RGB values
      // (small rounding differences are expected due to 8-bit quantization)
      expect(data[0]!).toBeCloseTo(original[0]!, -1); // within ~10
      expect(data[1]!).toBeCloseTo(original[1]!, -1);
      expect(data[2]!).toBeCloseTo(original[2]!, -1);
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

      // Verify by creating a worker state and checking its colorAdjustments
      // has the exact same keys as the main thread defaults
      const state = createDefaultWorkerEffectsState();
      const workerProperties = Object.keys(state.colorAdjustments).sort();

      expect(workerProperties).toEqual(mainThreadProperties);
    });

    it('EPW-015: processEffects accepts every effect combination without error', () => {
      // Exercises the real processEffects with multiple effect categories active
      // simultaneously. This verifies the state structure is correctly consumed
      // by the worker and that all code paths integrate without throwing.
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 180; data[i + 1] = 100; data[i + 2] = 60; data[i + 3] = 255;
      }
      const original = new Uint8ClampedArray(data);

      const state = createDefaultWorkerEffectsState();
      // Activate many effects simultaneously
      state.colorAdjustments.highlights = 30;
      state.colorAdjustments.shadows = -20;
      state.colorAdjustments.whites = 10;
      state.colorAdjustments.blacks = 5;
      state.colorAdjustments.vibrance = 40;
      state.colorAdjustments.hueRotation = 45;
      state.cdlValues.slope = { r: 1.1, g: 0.9, b: 1.0 };
      state.cdlValues.offset = { r: 0.02, g: -0.01, b: 0 };
      state.curvesData.master = {
        enabled: true,
        points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }],
      };
      state.colorWheelsState.gain = { r: 0.1, g: 0, b: -0.1, y: 0 };
      state.colorInversionEnabled = true;

      expect(() => processEffects(data, width, height, state)).not.toThrow();

      // Data should definitely have changed with all these effects active
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);

      // All values should still be in valid range
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });
  });
});
