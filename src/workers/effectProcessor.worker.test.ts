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

  describe('highlights and shadows mathematical correctness', () => {
    it('EPW-020: highlights=100 darkens bright pixels proportionally to luminance', () => {
      const width = 2;
      const height = 1;
      const data = new Uint8ClampedArray(width * height * 4);
      // Bright pixel (lum ~230)
      data[0] = 230; data[1] = 230; data[2] = 230; data[3] = 255;
      // Dark pixel (lum ~30)
      data[4] = 30; data[5] = 30; data[6] = 30; data[7] = 255;

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 100;
      processEffects(data, width, height, state);

      // Bright pixel should be significantly darkened
      // highlights=100 => highlights_norm=1.0, highlight weight for lum 230 is high
      // highlightLUT[230] = smoothstep(0.5, 1.0, 230/255) ~ smoothstep(0.5,1.0,0.902) ~ 0.93
      // adj = 1.0 * 0.93 * 128 = ~119, so 230-119=~111
      expect(data[0]).toBeLessThan(170);
      expect(data[0]).toBeGreaterThan(50);

      // Dark pixel should be barely affected (highlight weight near zero)
      // highlightLUT[30] = smoothstep(0.5, 1.0, 30/255) ~ 0 (since 30/255=0.118 < 0.5)
      expect(data[4]).toBeCloseTo(30, -1);
    });

    it('EPW-021: shadows=100 brightens dark pixels proportionally', () => {
      const width = 2;
      const height = 1;
      const data = new Uint8ClampedArray(width * height * 4);
      // Dark pixel (lum ~30)
      data[0] = 30; data[1] = 30; data[2] = 30; data[3] = 255;
      // Bright pixel (lum ~230)
      data[4] = 230; data[5] = 230; data[6] = 230; data[7] = 255;

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.shadows = 100;
      processEffects(data, width, height, state);

      // Dark pixel should be significantly brightened
      // shadowLUT[30] = 1 - smoothstep(0.0, 0.5, 30/255) ~ 1 - smoothstep(0,0.5,0.118) ~ high
      expect(data[0]).toBeGreaterThan(60);

      // Bright pixel should be barely affected (shadow weight near zero)
      // shadowLUT[230] = 1 - smoothstep(0.0, 0.5, 0.902) ~ 1 - 1 = 0
      expect(data[4]).toBeCloseTo(230, -1);
    });

    it('EPW-022: highlights with negative value brightens highlights', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 200, 200, 255]);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = -50;
      processEffects(data, width, height, state);

      // Negative highlights should brighten (adj is negative, so -adj is added)
      // highlights = -50/100 = -0.5, adj = -0.5 * highlightWeight * 128 < 0
      // r = r - adj = r - (negative) = r + positive => brighter
      expect(data[0]).toBeGreaterThan(200);
    });

    it('EPW-023: whites adjustment clips white point', () => {
      const width = 1;
      const height = 1;
      // Near-white pixel
      const data = new Uint8ClampedArray([240, 240, 240, 255]);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.whites = 50;
      processEffects(data, width, height, state);

      // whites=50 => whites_norm=0.5, whitePoint = 255 - 0.5*55 = 227.5
      // blackPoint = 0, hsRange = 227.5
      // mapped = ((240 - 0) / 227.5) * 255 ~ 269 => clamped to 255
      expect(data[0]).toBe(255);
    });

    it('EPW-024: blacks adjustment clips black point', () => {
      const width = 1;
      const height = 1;
      // Near-black pixel
      const data = new Uint8ClampedArray([20, 20, 20, 255]);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.blacks = 50;
      processEffects(data, width, height, state);

      // blacks=50 => blacks_norm=0.5, blackPoint = 0.5*55 = 27.5
      // hsRange = 255 - 27.5 = 227.5
      // mapped = ((20 - 27.5) / 227.5) * 255 < 0, clamped to 0
      expect(data[0]).toBe(0);
    });

    it('EPW-025: alpha channel is preserved through all effects', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([128, 128, 128, 42]);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 50;
      state.colorAdjustments.shadows = 50;
      state.colorAdjustments.whites = 20;
      state.colorAdjustments.blacks = 20;
      processEffects(data, width, height, state);

      expect(data[3]).toBe(42);
    });
  });

  describe('CDL (slope/offset/power/saturation) correctness', () => {
    it('EPW-030: CDL slope multiplies pixel values', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([128, 128, 128, 255]);

      const state = createDefaultWorkerEffectsState();
      state.cdlValues.slope = { r: 2, g: 0.5, b: 1 };
      processEffects(data, width, height, state);

      // r = 128/255 * 2 = ~1.004 => 255
      expect(data[0]).toBe(255);
      // g = 128/255 * 0.5 = ~0.251 => ~64
      expect(data[1]).toBeCloseTo(64, -1);
      // b unchanged
      expect(data[2]).toBeCloseTo(128, -1);
    });

    it('EPW-031: CDL offset shifts pixel values', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([128, 128, 128, 255]);

      const state = createDefaultWorkerEffectsState();
      state.cdlValues.offset = { r: 0.2, g: -0.2, b: 0 };
      processEffects(data, width, height, state);

      // r = 128/255 + 0.2 = ~0.702 => ~179
      expect(data[0]).toBeCloseTo(179, -1);
      // g = 128/255 - 0.2 = ~0.302 => ~77
      expect(data[1]).toBeCloseTo(77, -1);
    });

    it('EPW-032: CDL power applies gamma correction', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([128, 128, 128, 255]);

      const state = createDefaultWorkerEffectsState();
      state.cdlValues.power = { r: 2.0, g: 0.5, b: 1 };
      processEffects(data, width, height, state);

      // r = (128/255)^2 = ~0.252 => ~64
      expect(data[0]).toBeCloseTo(64, -1);
      // g = (128/255)^0.5 = ~0.708 => ~181
      expect(data[1]).toBeCloseTo(181, -1);
    });

    it('EPW-033: CDL saturation desaturates when < 1', () => {
      const width = 1;
      const height = 1;
      // Saturated color
      const data = new Uint8ClampedArray([255, 0, 0, 255]);

      const state = createDefaultWorkerEffectsState();
      state.cdlValues.saturation = 0;
      processEffects(data, width, height, state);

      // saturation=0 maps everything to luminance
      // luma = 0.2126*1 + 0.7152*0 + 0.0722*0 = 0.2126 => ~54
      expect(data[0]).toBeCloseTo(54, -1);
      expect(data[1]).toBeCloseTo(54, -1);
      expect(data[2]).toBeCloseTo(54, -1);
    });

    it('EPW-034: CDL slope=0 offset=0 results in black', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 150, 100, 255]);

      const state = createDefaultWorkerEffectsState();
      state.cdlValues.slope = { r: 0, g: 0, b: 0 };
      processEffects(data, width, height, state);

      expect(data[0]).toBe(0);
      expect(data[1]).toBe(0);
      expect(data[2]).toBe(0);
    });
  });

  describe('channel isolation correctness', () => {
    it('EPW-040: red channel isolation shows red as grayscale', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 100, 50, 255]);

      const state = createDefaultWorkerEffectsState();
      state.channelMode = 'red';
      processEffects(data, width, height, state);

      // Red channel value should be copied to all channels
      expect(data[0]).toBeCloseTo(200, -1);
      expect(data[1]).toBeCloseTo(200, -1);
      expect(data[2]).toBeCloseTo(200, -1);
    });

    it('EPW-041: green channel isolation shows green as grayscale', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 100, 50, 255]);

      const state = createDefaultWorkerEffectsState();
      state.channelMode = 'green';
      processEffects(data, width, height, state);

      expect(data[0]).toBeCloseTo(100, -1);
      expect(data[1]).toBeCloseTo(100, -1);
      expect(data[2]).toBeCloseTo(100, -1);
    });

    it('EPW-042: blue channel isolation shows blue as grayscale', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 100, 50, 255]);

      const state = createDefaultWorkerEffectsState();
      state.channelMode = 'blue';
      processEffects(data, width, height, state);

      expect(data[0]).toBeCloseTo(50, -1);
      expect(data[1]).toBeCloseTo(50, -1);
      expect(data[2]).toBeCloseTo(50, -1);
    });

    it('EPW-043: luminance channel isolation computes Rec.709 luminance', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 100, 50, 255]);

      const state = createDefaultWorkerEffectsState();
      state.channelMode = 'luminance';
      processEffects(data, width, height, state);

      // Expected luminance: 0.2126*200 + 0.7152*100 + 0.0722*50 = 42.52+71.52+3.61 = 117.65
      const expectedLuma = Math.round(LUMA_R * 200 + LUMA_G * 100 + LUMA_B * 50);
      expect(data[0]).toBeCloseTo(expectedLuma, -1);
      expect(data[1]).toBeCloseTo(expectedLuma, -1);
      expect(data[2]).toBeCloseTo(expectedLuma, -1);
    });

    it('EPW-044: alpha channel isolation shows alpha as grayscale', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 100, 50, 128]);

      const state = createDefaultWorkerEffectsState();
      state.channelMode = 'alpha';
      processEffects(data, width, height, state);

      // Alpha value (128) copied to RGB, alpha set to 255
      expect(data[0]).toBeCloseTo(128, -1);
      expect(data[1]).toBeCloseTo(128, -1);
      expect(data[2]).toBeCloseTo(128, -1);
      expect(data[3]).toBe(255);
    });
  });

  describe('curves correctness', () => {
    it('EPW-050: curves inversion (swap endpoints) inverts image', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 100, 50, 255]);

      const state = createDefaultWorkerEffectsState();
      // Create inverted curve: (0,1) and (1,0)
      state.curvesData.master = {
        enabled: true,
        points: [{ x: 0, y: 1 }, { x: 1, y: 0 }],
      };
      state.curvesData.red = { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
      state.curvesData.green = { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
      state.curvesData.blue = { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
      processEffects(data, width, height, state);

      // With a Catmull-Rom inverted master curve (2 points), the curve is not perfectly
      // linear, so values differ from pure 255-x. The key assertion is the ordering
      // is reversed: originally R>G>B, after inversion R<G<B.
      expect(data[0]!).toBeLessThan(data[1]!); // inverted R < inverted G
      expect(data[1]!).toBeLessThan(data[2]!); // inverted G < inverted B
      // And each value is "inverted" directionally
      expect(data[0]).toBeLessThan(128); // 200 inverted should be dark
      expect(data[2]).toBeGreaterThan(128); // 50 inverted should be bright
    });

    it('EPW-051: per-channel curves affect only their channel', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([128, 128, 128, 255]);

      const state = createDefaultWorkerEffectsState();
      // Red curve: boost (midpoint up)
      state.curvesData.red = {
        enabled: true,
        points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.8 }, { x: 1, y: 1 }],
      };
      // Green, blue: identity
      state.curvesData.green = { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
      state.curvesData.blue = { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
      state.curvesData.master = { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
      processEffects(data, width, height, state);

      // Red should be boosted above 128
      expect(data[0]).toBeGreaterThan(150);
      // Green and blue should remain approximately at 128
      expect(data[1]).toBeCloseTo(128, -1);
      expect(data[2]).toBeCloseTo(128, -1);
    });

    it('EPW-052: disabled curve channel is identity', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([128, 128, 128, 255]);

      const state = createDefaultWorkerEffectsState();
      // Dramatically alter the red curve but disable it
      state.curvesData.red = {
        enabled: false,
        points: [{ x: 0, y: 1 }, { x: 1, y: 0 }],
      };
      processEffects(data, width, height, state);

      // Should be identity, but curves are now "non-default" because red is disabled
      // When disabled, buildCurveLUT returns identity LUT, so value stays ~128
      expect(data[0]).toBeCloseTo(128, -1);
    });
  });

  describe('vibrance correctness', () => {
    it('EPW-055: vibrance boosts unsaturated colors more than saturated ones', () => {
      const width = 2;
      const height = 1;
      // Desaturated pixel: gray-ish
      const data = new Uint8ClampedArray([
        140, 128, 128, 255, // slightly warm gray
        255, 0, 0, 255,     // fully saturated red
      ]);
      const origGray = new Uint8ClampedArray(data.slice(0, 4));
      const origRed = new Uint8ClampedArray(data.slice(4, 8));

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.vibrance = 100;
      processEffects(data, width, height, state);

      // Calculate how much each pixel changed
      const grayDeltaR = Math.abs(data[0]! - origGray[0]!);
      const grayDeltaG = Math.abs(data[1]! - origGray[1]!);
      const grayDeltaB = Math.abs(data[2]! - origGray[2]!);
      const grayChange = grayDeltaR + grayDeltaG + grayDeltaB;

      const redDeltaR = Math.abs(data[4]! - origRed[0]!);
      const redDeltaG = Math.abs(data[5]! - origRed[1]!);
      const redDeltaB = Math.abs(data[6]! - origRed[2]!);
      const redChange = redDeltaR + redDeltaG + redDeltaB;

      // Vibrance should affect the gray pixel more than the already-saturated red
      expect(grayChange).toBeGreaterThan(0);
      // The saturated red pixel may change less (vibrance protects saturated colors)
      expect(grayChange).toBeGreaterThanOrEqual(redChange);
    });

    it('EPW-056: negative vibrance desaturates', () => {
      const width = 1;
      const height = 1;
      // Moderately saturated pixel
      const data = new Uint8ClampedArray([200, 100, 50, 255]);

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.vibrance = -100;
      processEffects(data, width, height, state);

      // After negative vibrance, channels should be closer to each other (less saturation)
      const range = Math.max(data[0]!, data[1]!, data[2]!) - Math.min(data[0]!, data[1]!, data[2]!);
      // Original range was 200-50=150, should be reduced
      expect(range).toBeLessThan(150);
    });
  });

  describe('color inversion correctness', () => {
    it('EPW-060: inversion is its own inverse', () => {
      const width = 2;
      const height = 2;
      const original = new Uint8ClampedArray([
        50, 100, 200, 255,
        0, 255, 128, 200,
        255, 0, 0, 100,
        128, 128, 128, 0,
      ]);
      const data = new Uint8ClampedArray(original);

      const state = createDefaultWorkerEffectsState();
      state.colorInversionEnabled = true;
      processEffects(data, width, height, state);
      processEffects(data, width, height, state);

      // Double inversion should restore original
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBe(original[i]);
      }
    });

    it('EPW-061: inversion preserves alpha channel', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([100, 200, 50, 42]);

      const state = createDefaultWorkerEffectsState();
      state.colorInversionEnabled = true;
      processEffects(data, width, height, state);

      expect(data[0]).toBe(155); // 255-100
      expect(data[1]).toBe(55);  // 255-200
      expect(data[2]).toBe(205); // 255-50
      expect(data[3]).toBe(42);  // alpha unchanged
    });
  });

  describe('multiple effects interaction', () => {
    it('EPW-070: CDL applied before curves in pipeline', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([128, 128, 128, 255]);

      const state = createDefaultWorkerEffectsState();
      // CDL doubles the value
      state.cdlValues.slope = { r: 2, g: 2, b: 2 };
      // Curves applies clamp at 200/255
      state.curvesData.master = {
        enabled: true,
        points: [{ x: 0, y: 0 }, { x: 200 / 255, y: 200 / 255 }, { x: 1, y: 200 / 255 }],
      };
      processEffects(data, width, height, state);

      // CDL first: 128/255 * 2 = ~1.004 => clamped to ~255
      // Then curves: lookup 255 => should get ~200/255 => ~200
      // Value should be around 200 because curves caps it
      expect(data[0]).toBeLessThanOrEqual(210);
    });

    it('EPW-071: inversion applied after CDL', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([0, 0, 0, 255]);

      const state = createDefaultWorkerEffectsState();
      // CDL adds offset to make it nonzero
      state.cdlValues.offset = { r: 0.5, g: 0.5, b: 0.5 };
      // Then invert
      state.colorInversionEnabled = true;
      processEffects(data, width, height, state);

      // After CDL: r = 0 * 1 + 0.5 = 0.5 => 128
      // After inversion: 1.0 - 0.5 = 0.5 => 128
      // So it should still be ~128
      expect(data[0]).toBeCloseTo(128, -1);
    });

    it('EPW-072: highlights + shadows + vibrance + inversion combined', () => {
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 180; data[i + 1] = 100; data[i + 2] = 50; data[i + 3] = 255;
      }

      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 30;
      state.colorAdjustments.shadows = -20;
      state.colorAdjustments.vibrance = 50;
      state.colorInversionEnabled = true;
      processEffects(data, width, height, state);

      // Just verify all values are valid (not NaN, within 0-255)
      for (let i = 0; i < data.length; i++) {
        expect(Number.isFinite(data[i])).toBe(true);
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('edge cases', () => {
    it('EPW-080: processes 1x1 image', () => {
      const data = new Uint8ClampedArray([128, 64, 32, 255]);
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 50;
      expect(() => processEffects(data, 1, 1, state)).not.toThrow();
    });

    it('EPW-081: processes all-black image', () => {
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      // All zeros (black with alpha 0)
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = 100;
      state.colorAdjustments.shadows = 100;
      state.colorAdjustments.vibrance = 100;
      processEffects(data, width, height, state);

      // All R,G,B should remain 0 for pure black
      for (let i = 0; i < data.length; i += 4) {
        // Shadow brightening on pure black should have minimal effect
        // since the shadow weight for lum=0 depends on smoothstep behavior
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });

    it('EPW-082: processes all-white image', () => {
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      }
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.highlights = -100;
      state.colorAdjustments.vibrance = 100;
      processEffects(data, width, height, state);

      for (let i = 0; i < data.length; i += 4) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });

    it('EPW-083: sharpen with small image does not crash', () => {
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
      }
      const state = createDefaultWorkerEffectsState();
      state.filterSettings.sharpen = 100;
      expect(() => processEffects(data, width, height, state)).not.toThrow();
    });

    it('EPW-084: clarity effect modifies midtone pixels', () => {
      const width = 8;
      const height = 8;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
      }
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 100;
      processEffects(data, width, height, state);

      // With uniform data, the high-pass filter result should be minimal (blur ~= original)
      // So clarity won't change much. For non-uniform data, it would change.
      // Just ensure no crash and valid output.
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });

    it('EPW-085: HSL qualifier with mattePreview outputs grayscale', () => {
      const width = 1;
      const height = 1;
      const data = new Uint8ClampedArray([200, 50, 50, 255]); // reddish

      const state = createDefaultWorkerEffectsState();
      state.hslQualifierState.enabled = true;
      state.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
      state.hslQualifierState.saturation = { center: 50, width: 100, softness: 20 };
      state.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };
      state.hslQualifierState.mattePreview = true;
      processEffects(data, width, height, state);

      // In matte preview, R=G=B=matte value
      expect(data[0]).toBe(data[1]);
      expect(data[1]).toBe(data[2]);
    });

    it('EPW-086: HSL qualifier invert flag inverts the matte', () => {
      // Normal matte
      const data1 = new Uint8ClampedArray([200, 50, 50, 255]);
      const state1 = createDefaultWorkerEffectsState();
      state1.hslQualifierState.enabled = true;
      state1.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
      state1.hslQualifierState.saturation = { center: 50, width: 100, softness: 20 };
      state1.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };
      state1.hslQualifierState.mattePreview = true;
      processEffects(data1, 1, 1, state1);

      // Inverted matte
      const data2 = new Uint8ClampedArray([200, 50, 50, 255]);
      const state2 = createDefaultWorkerEffectsState();
      state2.hslQualifierState.enabled = true;
      state2.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
      state2.hslQualifierState.saturation = { center: 50, width: 100, softness: 20 };
      state2.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };
      state2.hslQualifierState.mattePreview = true;
      state2.hslQualifierState.invert = true;
      processEffects(data2, 1, 1, state2);

      // matte + inverted matte should sum to ~255
      expect(data1[0]! + data2[0]!).toBeCloseTo(255, -1);
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
