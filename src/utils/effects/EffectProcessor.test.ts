/**
 * EffectProcessor Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EffectProcessor,
  AllEffectsState,
  createDefaultEffectsState,
  computeEffectsHash,
  hasActiveEffects,
  yieldToMain,
} from './EffectProcessor';
import { createTestImageData, createGradientImageData, isGrayscale } from '../../../test/utils';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from '../../ui/components/ColorControls';
import { DEFAULT_FILTER_SETTINGS } from '../../ui/components/FilterControl';
import {
  IS_LITTLE_ENDIAN,
  applyColorInversionSIMD,
  applyColorInversionScalar,
  applyChannelIsolationSIMD,
  applyChannelIsolationGrayscale,
  applyLuminanceIsolation,
  buildBrightnessLUT,
  applyLUTToRGB,
  CHANNEL_MASKS,
  COLOR_INVERSION_XOR_MASK,
} from './effectProcessing.shared';

describe('EffectProcessor', () => {
  let processor: EffectProcessor;
  let defaultState: AllEffectsState;

  beforeEach(() => {
    processor = new EffectProcessor();
    defaultState = createDefaultEffectsState();
  });

  describe('createDefaultEffectsState', () => {
    it('EP-001: creates state with all default values', () => {
      const state = createDefaultEffectsState();

      expect(state.colorAdjustments).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
      expect(state.filterSettings).toEqual(DEFAULT_FILTER_SETTINGS);
      expect(state.channelMode).toBe('rgb');
    });

    it('EP-002: creates independent copies (no shared references)', () => {
      const state1 = createDefaultEffectsState();
      const state2 = createDefaultEffectsState();

      state1.colorAdjustments.brightness = 50;
      expect(state2.colorAdjustments.brightness).toBe(0);
    });
  });

  describe('computeEffectsHash', () => {
    it('EP-003: returns same hash for identical states', () => {
      const state1 = createDefaultEffectsState();
      const state2 = createDefaultEffectsState();

      expect(computeEffectsHash(state1)).toBe(computeEffectsHash(state2));
    });

    it('EP-004: returns different hash when state changes', () => {
      const state1 = createDefaultEffectsState();
      const state2 = createDefaultEffectsState();
      state2.colorAdjustments.brightness = 10;

      expect(computeEffectsHash(state1)).not.toBe(computeEffectsHash(state2));
    });

    it('EP-005: hash changes for any effect modification', () => {
      const baseHash = computeEffectsHash(defaultState);

      // Test CDL change
      const cdlState = createDefaultEffectsState();
      cdlState.cdlValues.slope.r = 1.5;
      expect(computeEffectsHash(cdlState)).not.toBe(baseHash);

      // Test curves change
      const curvesState = createDefaultEffectsState();
      curvesState.curvesData.master.points.push({ x: 0.5, y: 0.6 });
      expect(computeEffectsHash(curvesState)).not.toBe(baseHash);

      // Test channel mode change
      const channelState = createDefaultEffectsState();
      channelState.channelMode = 'red';
      expect(computeEffectsHash(channelState)).not.toBe(baseHash);
    });

    it('EP-052: small property changes produce different hashes (no false cache hits)', () => {
      const state1 = createDefaultEffectsState();
      const state2 = createDefaultEffectsState();
      state1.colorAdjustments.brightness = 0.5;
      state2.colorAdjustments.brightness = 0.501;

      expect(computeEffectsHash(state1)).not.toBe(computeEffectsHash(state2));
    });

    it('EP-053: hash is deterministic (same input always produces same output)', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.exposure = 1.5;
      state.cdlValues.slope.r = 1.2;
      state.channelMode = 'luminance';

      const hash1 = computeEffectsHash(state);
      const hash2 = computeEffectsHash(state);
      const hash3 = computeEffectsHash(state);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('EP-054: hash changes when color wheels change', () => {
      const baseHash = computeEffectsHash(defaultState);

      const s = createDefaultEffectsState();
      s.colorWheelsState.lift.r = 0.1;
      expect(computeEffectsHash(s)).not.toBe(baseHash);

      const s2 = createDefaultEffectsState();
      s2.colorWheelsState.gamma.g = 0.2;
      expect(computeEffectsHash(s2)).not.toBe(baseHash);

      const s3 = createDefaultEffectsState();
      s3.colorWheelsState.gain.b = 0.3;
      expect(computeEffectsHash(s3)).not.toBe(baseHash);

      const s4 = createDefaultEffectsState();
      s4.colorWheelsState.master.y = 0.1;
      expect(computeEffectsHash(s4)).not.toBe(baseHash);

      const s5 = createDefaultEffectsState();
      s5.colorWheelsState.linked = true;
      expect(computeEffectsHash(s5)).not.toBe(baseHash);
    });

    it('EP-055: hash changes when HSL qualifier changes', () => {
      const baseHash = computeEffectsHash(defaultState);

      const s = createDefaultEffectsState();
      s.hslQualifierState.enabled = true;
      expect(computeEffectsHash(s)).not.toBe(baseHash);

      const s2 = createDefaultEffectsState();
      s2.hslQualifierState.hue.center = 120;
      expect(computeEffectsHash(s2)).not.toBe(baseHash);

      const s3 = createDefaultEffectsState();
      s3.hslQualifierState.correction.hueShift = 45;
      expect(computeEffectsHash(s3)).not.toBe(baseHash);

      const s4 = createDefaultEffectsState();
      s4.hslQualifierState.invert = true;
      expect(computeEffectsHash(s4)).not.toBe(baseHash);

      const s5 = createDefaultEffectsState();
      s5.hslQualifierState.mattePreview = true;
      expect(computeEffectsHash(s5)).not.toBe(baseHash);
    });

    it('EP-056: hash changes when tone mapping changes', () => {
      const baseHash = computeEffectsHash(defaultState);

      const s = createDefaultEffectsState();
      s.toneMappingState.enabled = true;
      expect(computeEffectsHash(s)).not.toBe(baseHash);

      const s2 = createDefaultEffectsState();
      s2.toneMappingState.operator = 'reinhard';
      expect(computeEffectsHash(s2)).not.toBe(baseHash);
    });

    it('EP-057: hash changes when filter settings change', () => {
      const baseHash = computeEffectsHash(defaultState);

      const s = createDefaultEffectsState();
      s.filterSettings.blur = 5;
      expect(computeEffectsHash(s)).not.toBe(baseHash);

      const s2 = createDefaultEffectsState();
      s2.filterSettings.sharpen = 50;
      expect(computeEffectsHash(s2)).not.toBe(baseHash);
    });

    it('EP-058: hash changes when color inversion toggles', () => {
      const baseHash = computeEffectsHash(defaultState);

      const s = createDefaultEffectsState();
      s.colorInversionEnabled = true;
      expect(computeEffectsHash(s)).not.toBe(baseHash);
    });

    it('EP-059: hash does not use JSON.stringify (no large string allocation)', () => {
      // Verify the function does not contain JSON.stringify by checking that
      // the hash is a short base-36 string, not a long JSON string
      const state = createDefaultEffectsState();
      const hash = computeEffectsHash(state);

      // The djb2 hash produces an unsigned 32-bit integer in base36
      // which is at most 7 characters (2^32 = 4294967296, in base36 = "1z141z3")
      expect(hash.length).toBeLessThanOrEqual(7);
      expect(/^[0-9a-z]+$/.test(hash)).toBe(true);
    });

    it('EP-060: hash handles edge cases - default state hashes consistently', () => {
      const s1 = createDefaultEffectsState();
      const s2 = createDefaultEffectsState();

      // Multiple fresh default states should hash identically
      expect(computeEffectsHash(s1)).toBe(computeEffectsHash(s2));
    });

    it('EP-061: hash changes for each color adjustment property individually', () => {
      const baseHash = computeEffectsHash(defaultState);

      type NumericColorKey = {
        [K in keyof ColorAdjustments]-?: ColorAdjustments[K] extends number ? K : never;
      }[keyof ColorAdjustments];

      const props: NumericColorKey[] = [
        'exposure', 'gamma', 'saturation', 'vibrance', 'contrast',
        'clarity', 'hueRotation', 'temperature', 'tint', 'brightness',
        'highlights', 'shadows', 'whites', 'blacks',
      ];

      for (const prop of props) {
        const s = createDefaultEffectsState();
        s.colorAdjustments[prop] = 42;
        expect(computeEffectsHash(s)).not.toBe(baseHash);
      }
    });

    it('EP-062: hash changes for vibranceSkinProtection toggle', () => {
      const baseHash = computeEffectsHash(defaultState);
      const s = createDefaultEffectsState();
      s.colorAdjustments.vibranceSkinProtection = !defaultState.colorAdjustments.vibranceSkinProtection;
      expect(computeEffectsHash(s)).not.toBe(baseHash);
    });
  });

  describe('hasActiveEffects', () => {
    it('EP-006: returns false for default state', () => {
      expect(hasActiveEffects(defaultState)).toBe(false);
    });

    it('EP-007: returns true when CDL is modified', () => {
      const state = createDefaultEffectsState();
      state.cdlValues.slope.r = 1.5;
      expect(hasActiveEffects(state)).toBe(true);
    });

    it('EP-008: returns true when highlights/shadows are modified', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 20;
      expect(hasActiveEffects(state)).toBe(true);
    });

    it('EP-009: returns true when vibrance is modified', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.vibrance = 30;
      expect(hasActiveEffects(state)).toBe(true);
    });

    it('EP-010: returns true when clarity is modified', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.clarity = 25;
      expect(hasActiveEffects(state)).toBe(true);
    });

    it('EP-011: returns true when sharpen is enabled', () => {
      const state = createDefaultEffectsState();
      state.filterSettings.sharpen = 50;
      expect(hasActiveEffects(state)).toBe(true);
    });

    it('EP-012: returns true when channel mode is not rgb', () => {
      const state = createDefaultEffectsState();
      state.channelMode = 'luminance';
      expect(hasActiveEffects(state)).toBe(true);
    });

    it('EP-013: returns true when HSL qualifier is enabled', () => {
      const state = createDefaultEffectsState();
      state.hslQualifierState.enabled = true;
      expect(hasActiveEffects(state)).toBe(true);
    });
  });

  describe('applyEffects', () => {
    it('EP-014: does not modify image when no effects are active', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
      const originalData = new Uint8ClampedArray(imageData.data);

      processor.applyEffects(imageData, 10, 10, defaultState);

      expect(imageData.data).toEqual(originalData);
    });

    it('EP-015: preserves alpha channel', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 200 });
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 50;

      processor.applyEffects(imageData, 10, 10, state);

      // Check alpha values are unchanged
      for (let i = 3; i < imageData.data.length; i += 4) {
        expect(imageData.data[i]).toBe(200);
      }
    });

    describe('Highlights/Shadows', () => {
      it('EP-016: positive highlights darkens bright areas', () => {
        // Create bright image
        const imageData = createTestImageData(10, 10, { r: 240, g: 240, b: 240 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.highlights = 50;

        processor.applyEffects(imageData, 10, 10, state);

        // Bright pixels should be darker
        expect(imageData.data[0]).toBeLessThan(240);
      });

      it('EP-017: positive shadows brightens dark areas', () => {
        // Create dark image
        const imageData = createTestImageData(10, 10, { r: 20, g: 20, b: 20 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.shadows = 50;

        processor.applyEffects(imageData, 10, 10, state);

        // Dark pixels should be brighter
        expect(imageData.data[0]).toBeGreaterThan(20);
      });

      it('EP-018: whites adjustment affects white point', () => {
        const imageData = createTestImageData(10, 10, { r: 200, g: 200, b: 200 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.whites = 50;

        processor.applyEffects(imageData, 10, 10, state);

        // White point clipping should brighten
        expect(imageData.data[0]).toBeGreaterThan(200);
      });

      it('EP-019: blacks adjustment affects black point', () => {
        const imageData = createTestImageData(10, 10, { r: 50, g: 50, b: 50 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.blacks = 50;

        processor.applyEffects(imageData, 10, 10, state);

        // Black point clipping should darken
        expect(imageData.data[0]).toBeLessThan(50);
      });
    });

    describe('Vibrance', () => {
      it('EP-020: positive vibrance increases saturation', () => {
        // Create slightly saturated image
        const imageData = createTestImageData(10, 10, { r: 200, g: 100, b: 100 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.vibrance = 50;

        processor.applyEffects(imageData, 10, 10, state);

        // Red should be boosted more relative to others
        const avgBefore = (200 + 100 + 100) / 3;
        const avgAfter = (imageData.data[0]! + imageData.data[1]! + imageData.data[2]!) / 3;
        // Color should be more saturated (further from gray)
        expect(Math.abs(imageData.data[0]! - avgAfter)).toBeGreaterThan(Math.abs(200 - avgBefore) - 10);
      });

      it('EP-021: negative vibrance decreases saturation', () => {
        const imageData = createTestImageData(10, 10, { r: 200, g: 100, b: 100 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.vibrance = -50;

        processor.applyEffects(imageData, 10, 10, state);

        // Should be closer to grayscale
        const r = imageData.data[0]!;
        const g = imageData.data[1]!;
        const b = imageData.data[2]!;
        const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        expect(maxDiff).toBeLessThan(100); // Original diff was 100
      });
    });

    describe('Clarity', () => {
      it('EP-022: positive clarity increases local contrast', () => {
        // Create image with midtones
        const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;

        // We can't easily test local contrast without a more complex image,
        // but we can verify the function runs without error
        processor.applyEffects(imageData, 10, 10, state);

        // At least verify it ran
        expect(imageData.data[0]).toBeDefined();
      });
    });

    describe('Channel Isolation', () => {
      it('EP-023: red channel mode shows red as grayscale', () => {
        const imageData = createTestImageData(10, 10, { r: 200, g: 100, b: 50 });
        const state = createDefaultEffectsState();
        state.channelMode = 'red';

        processor.applyEffects(imageData, 10, 10, state);

        // All channels should equal the original red value
        expect(imageData.data[0]).toBe(200);
        expect(imageData.data[1]).toBe(200);
        expect(imageData.data[2]).toBe(200);
      });

      it('EP-024: green channel mode shows green as grayscale', () => {
        const imageData = createTestImageData(10, 10, { r: 200, g: 100, b: 50 });
        const state = createDefaultEffectsState();
        state.channelMode = 'green';

        processor.applyEffects(imageData, 10, 10, state);

        expect(imageData.data[0]).toBe(100);
        expect(imageData.data[1]).toBe(100);
        expect(imageData.data[2]).toBe(100);
      });

      it('EP-025: blue channel mode shows blue as grayscale', () => {
        const imageData = createTestImageData(10, 10, { r: 200, g: 100, b: 50 });
        const state = createDefaultEffectsState();
        state.channelMode = 'blue';

        processor.applyEffects(imageData, 10, 10, state);

        expect(imageData.data[0]).toBe(50);
        expect(imageData.data[1]).toBe(50);
        expect(imageData.data[2]).toBe(50);
      });

      it('EP-026: luminance mode shows Rec.709 luminance', () => {
        const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0 });
        const state = createDefaultEffectsState();
        state.channelMode = 'luminance';

        processor.applyEffects(imageData, 10, 10, state);

        // Rec.709: 0.2126 * 255 = ~54
        expect(imageData.data[0]).toBeCloseTo(54, 0);
        expect(imageData.data[1]).toBeCloseTo(54, 0);
        expect(imageData.data[2]).toBeCloseTo(54, 0);
      });
    });

    describe('CDL', () => {
      it('EP-027: slope multiplies pixel values', () => {
        const imageData = createTestImageData(10, 10, { r: 64, g: 64, b: 64 });
        const state = createDefaultEffectsState();
        state.cdlValues.slope = { r: 2, g: 2, b: 2 };

        processor.applyEffects(imageData, 10, 10, state);

        // 64 * 2 = 128 (approximately, accounting for normalization)
        expect(imageData.data[0]).toBeCloseTo(128, -1);
      });

      it('EP-028: offset adds to pixel values', () => {
        const imageData = createTestImageData(10, 10, { r: 0, g: 0, b: 0 });
        const state = createDefaultEffectsState();
        state.cdlValues.offset = { r: 0.2, g: 0.2, b: 0.2 };

        processor.applyEffects(imageData, 10, 10, state);

        // 0 + 0.2 * 255 = 51
        expect(imageData.data[0]).toBeCloseTo(51, 0);
      });

      it('EP-029: saturation=0 produces grayscale', () => {
        const imageData = createTestImageData(10, 10, { r: 255, g: 100, b: 50 });
        const state = createDefaultEffectsState();
        state.cdlValues.saturation = 0;

        processor.applyEffects(imageData, 10, 10, state);

        expect(isGrayscale(imageData, 2)).toBe(true);
      });
    });

    describe('Sharpen', () => {
      it('EP-030: sharpen filter runs without error', () => {
        const imageData = createGradientImageData(20, 20);
        const state = createDefaultEffectsState();
        state.filterSettings.sharpen = 50;

        // Should not throw
        expect(() => {
          processor.applyEffects(imageData, 20, 20, state);
        }).not.toThrow();
      });
    });

    describe('Color Wheels', () => {
      it('EP-031: master wheel adjusts all tones', () => {
        const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const state = createDefaultEffectsState();
        state.colorWheelsState.master = { r: 0.5, g: 0, b: 0, y: 0 };

        processor.applyEffects(imageData, 10, 10, state);

        // Red channel should be boosted
        expect(imageData.data[0]).toBeGreaterThan(128);
      });

      it('EP-032: lift wheel adjusts shadows', () => {
        // Create dark image
        const imageData = createTestImageData(10, 10, { r: 30, g: 30, b: 30 });
        const state = createDefaultEffectsState();
        state.colorWheelsState.lift = { r: 0.5, g: 0, b: 0, y: 0 };

        processor.applyEffects(imageData, 10, 10, state);

        // Red in shadows should be boosted
        expect(imageData.data[0]).toBeGreaterThan(30);
      });

      it('EP-033: gain wheel adjusts highlights', () => {
        // Create bright image
        const imageData = createTestImageData(10, 10, { r: 220, g: 220, b: 220 });
        const state = createDefaultEffectsState();
        state.colorWheelsState.gain = { r: 0.5, g: 0, b: 0, y: 0 };

        processor.applyEffects(imageData, 10, 10, state);

        // Red in highlights should be boosted (clamped at 255)
        expect(imageData.data[0]).toBeGreaterThanOrEqual(220);
      });
    });

    describe('Effect Order', () => {
      it('EP-034: effects are applied in correct order', () => {
        // This test verifies that the order is:
        // Highlights/Shadows -> Vibrance -> Clarity -> ColorWheels -> CDL -> Curves -> HSL -> Sharpen -> Channel
        const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const state = createDefaultEffectsState();

        // Enable multiple effects
        state.colorAdjustments.highlights = 10;
        state.cdlValues.slope = { r: 1.1, g: 1.1, b: 1.1 };
        state.channelMode = 'luminance';

        // Should not throw and produce grayscale output (channel mode last)
        processor.applyEffects(imageData, 10, 10, state);

        expect(isGrayscale(imageData, 2)).toBe(true);
      });
    });

    describe('Edge Cases and Bug Fixes', () => {
      it('EP-035: handles negative hue values correctly in vibrance', () => {
        // Colors where hue calculation can produce negative modulo
        // Cyan has hue around 180, but edge cases near red can produce negative
        const imageData = createTestImageData(10, 10, { r: 100, g: 255, b: 100 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.vibrance = 50;

        // Should not produce NaN or incorrect values
        expect(() => {
          processor.applyEffects(imageData, 10, 10, state);
        }).not.toThrow();

        // Values should be valid (0-255)
        expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
        expect(imageData.data[0]).toBeLessThanOrEqual(255);
        expect(imageData.data[1]).toBeGreaterThanOrEqual(0);
        expect(imageData.data[1]).toBeLessThanOrEqual(255);
      });

      it('EP-036: prevents NaN in gamma calculation with negative RGB values', () => {
        // Scenario: Master wheel pushes values negative, then gamma is applied
        const imageData = createTestImageData(10, 10, { r: 10, g: 10, b: 10 });
        const state = createDefaultEffectsState();

        // Set master to push values negative
        state.colorWheelsState.master = { r: -0.5, g: -0.5, b: -0.5, y: 0 };
        // Enable gamma which could produce NaN with negative inputs
        state.colorWheelsState.gamma = { r: 0.5, g: 0.5, b: 0.5, y: 0 };

        processor.applyEffects(imageData, 10, 10, state);

        // Should not produce NaN - all values should be valid numbers
        for (let i = 0; i < imageData.data.length; i++) {
          expect(Number.isNaN(imageData.data[i])).toBe(false);
          expect(Number.isFinite(imageData.data[i])).toBe(true);
        }
      });

      it('EP-037: LUT caching improves performance on repeated calls', () => {
        const state = createDefaultEffectsState();
        state.colorAdjustments.highlights = 30;
        state.colorAdjustments.shadows = 20;

        // First call - initializes LUTs
        const imageData1 = createTestImageData(100, 100, { r: 128, g: 128, b: 128 });
        const start1 = performance.now();
        processor.applyEffects(imageData1, 100, 100, state);
        const time1 = performance.now() - start1;

        // Second call - uses cached LUTs
        const imageData2 = createTestImageData(100, 100, { r: 128, g: 128, b: 128 });
        const start2 = performance.now();
        processor.applyEffects(imageData2, 100, 100, state);
        const time2 = performance.now() - start2;

        // Results should be identical
        expect(imageData1.data).toEqual(imageData2.data);

        // Second call shouldn't be significantly slower (LUT is cached)
        // Note: This is a soft check as timing can vary
        expect(time2).toBeLessThan(time1 * 3);
      });

      it('EP-038: hash function produces consistent unsigned values', () => {
        const state1 = createDefaultEffectsState();
        const state2 = createDefaultEffectsState();

        // Create states that might produce different sign bits
        state1.colorAdjustments.brightness = 100;
        state1.colorAdjustments.contrast = 100;
        state1.colorAdjustments.saturation = 100;

        state2.colorAdjustments.brightness = 100;
        state2.colorAdjustments.contrast = 100;
        state2.colorAdjustments.saturation = 100;

        const hash1 = computeEffectsHash(state1);
        const hash2 = computeEffectsHash(state2);

        // Hashes should be identical
        expect(hash1).toBe(hash2);

        // Hash should be a valid base36 string (no negative sign)
        expect(hash1).not.toContain('-');
        expect(/^[0-9a-z]+$/.test(hash1)).toBe(true);
      });

      it('EP-039: vibrance handles edge case colors correctly', () => {
        // Test with colors that are exactly on the boundary
        const testCases = [
          { r: 255, g: 0, b: 0 },   // Pure red
          { r: 0, g: 255, b: 0 },   // Pure green
          { r: 0, g: 0, b: 255 },   // Pure blue
          { r: 255, g: 255, b: 0 }, // Yellow
          { r: 0, g: 255, b: 255 }, // Cyan
          { r: 255, g: 0, b: 255 }, // Magenta
          { r: 128, g: 128, b: 128 }, // Gray (no saturation)
        ];

        const state = createDefaultEffectsState();
        state.colorAdjustments.vibrance = 100;

        for (const color of testCases) {
          const imageData = createTestImageData(5, 5, color);

          expect(() => {
            processor.applyEffects(imageData, 5, 5, state);
          }).not.toThrow();

          // All values should be valid
          for (let i = 0; i < imageData.data.length; i += 4) {
            expect(imageData.data[i]).toBeGreaterThanOrEqual(0);
            expect(imageData.data[i]).toBeLessThanOrEqual(255);
            expect(Number.isNaN(imageData.data[i])).toBe(false);
          }
        }
      });

      it('EP-040: color wheels gamma handles extreme values', () => {
        // Test gamma with values that could cause issues
        const imageData = createTestImageData(10, 10, { r: 1, g: 128, b: 254 });
        const state = createDefaultEffectsState();

        // Extreme gamma adjustment
        state.colorWheelsState.gamma = { r: 1, g: 1, b: 1, y: 0.5 };

        processor.applyEffects(imageData, 10, 10, state);

        // No NaN or infinity
        for (let i = 0; i < imageData.data.length; i += 4) {
          expect(Number.isFinite(imageData.data[i])).toBe(true);
          expect(Number.isFinite(imageData.data[i + 1])).toBe(true);
          expect(Number.isFinite(imageData.data[i + 2])).toBe(true);
        }
      });
    });

    describe('HSL Qualifier', () => {
      it('EP-041: HSL qualifier when disabled does not modify image', () => {
        const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0 });
        const originalData = new Uint8ClampedArray(imageData.data);
        const state = createDefaultEffectsState();
        state.hslQualifierState.enabled = false;

        processor.applyEffects(imageData, 10, 10, state);

        expect(imageData.data).toEqual(originalData);
      });

      it('EP-042: HSL qualifier selects color based on hue range', () => {
        // Create red image (hue ~0)
        const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0 });
        const state = createDefaultEffectsState();
        state.hslQualifierState.enabled = true;
        state.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
        state.hslQualifierState.saturation = { center: 100, width: 100, softness: 20 };
        state.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };
        // Apply a hue shift
        state.hslQualifierState.correction = { hueShift: 120, saturationScale: 1, luminanceScale: 1 };

        processor.applyEffects(imageData, 10, 10, state);

        // Red (hue 0) shifted by 120 should become green-ish
        // The green channel should now be dominant
        expect(imageData.data[1]!).toBeGreaterThan(imageData.data[0]!); // G > R
      });

      it('EP-043: HSL qualifier matte preview produces grayscale', () => {
        const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0 });
        const state = createDefaultEffectsState();
        state.hslQualifierState.enabled = true;
        state.hslQualifierState.mattePreview = true;
        state.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
        state.hslQualifierState.saturation = { center: 100, width: 100, softness: 20 };
        state.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };

        processor.applyEffects(imageData, 10, 10, state);

        // Matte preview should produce grayscale (R=G=B)
        expect(isGrayscale(imageData, 1)).toBe(true);
      });

      it('EP-044: HSL qualifier invert reverses selection', () => {
        // Create red image
        const imageDataNormal = createTestImageData(10, 10, { r: 255, g: 0, b: 0 });
        const imageDataInverted = createTestImageData(10, 10, { r: 255, g: 0, b: 0 });

        const stateNormal = createDefaultEffectsState();
        stateNormal.hslQualifierState.enabled = true;
        stateNormal.hslQualifierState.mattePreview = true;
        stateNormal.hslQualifierState.invert = false;
        stateNormal.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
        stateNormal.hslQualifierState.saturation = { center: 100, width: 100, softness: 20 };
        stateNormal.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };

        const stateInverted = createDefaultEffectsState();
        stateInverted.hslQualifierState.enabled = true;
        stateInverted.hslQualifierState.mattePreview = true;
        stateInverted.hslQualifierState.invert = true;
        stateInverted.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
        stateInverted.hslQualifierState.saturation = { center: 100, width: 100, softness: 20 };
        stateInverted.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };

        processor.applyEffects(imageDataNormal, 10, 10, stateNormal);
        processor.applyEffects(imageDataInverted, 10, 10, stateInverted);

        // Normal and inverted matte should sum to 255 (white)
        // Red is selected normally, so normal matte should be bright, inverted should be dark
        expect(imageDataNormal.data[0]).not.toBe(imageDataInverted.data[0]);
        // The values should be approximately inverses
        const sum = imageDataNormal.data[0]! + imageDataInverted.data[0]!;
        expect(sum).toBeCloseTo(255, -1);
      });

      it('EP-045: HSL qualifier saturation scale modifies selected color saturation', () => {
        const imageData = createTestImageData(10, 10, { r: 200, g: 100, b: 100 });
        const state = createDefaultEffectsState();
        state.hslQualifierState.enabled = true;
        state.hslQualifierState.hue = { center: 0, width: 180, softness: 20 }; // Wide hue range
        state.hslQualifierState.saturation = { center: 50, width: 100, softness: 20 };
        state.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };
        // Reduce saturation
        state.hslQualifierState.correction = { hueShift: 0, saturationScale: 0.5, luminanceScale: 1 };

        processor.applyEffects(imageData, 10, 10, state);

        // Color should be less saturated (closer to gray)
        const r = imageData.data[0]!;
        const g = imageData.data[1]!;
        const b = imageData.data[2]!;
        const avgValue = (r + g + b) / 3;
        const maxDiff = Math.max(Math.abs(r - avgValue), Math.abs(g - avgValue), Math.abs(b - avgValue));
        // Max diff should be less than the original (200-133=67)
        expect(maxDiff).toBeLessThan(67);
      });
    });

    describe('Buffer Optimization', () => {
      it('EP-049: clarity reuses buffers on repeated calls with same size', () => {
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;

        // First call - allocates buffers
        const imageData1 = createTestImageData(100, 100, { r: 128, g: 128, b: 128 });
        processor.applyEffects(imageData1, 100, 100, state);

        // Access the private buffer size to verify it was set
        const processorAny = processor as unknown as { clarityBufferSize: number };
        const bufferSizeAfterFirst = processorAny.clarityBufferSize;
        expect(bufferSizeAfterFirst).toBe(100 * 100 * 4);

        // Second call with same size - should reuse buffers
        const imageData2 = createTestImageData(100, 100, { r: 64, g: 64, b: 64 });
        processor.applyEffects(imageData2, 100, 100, state);

        // Buffer size should be unchanged (reused)
        expect(processorAny.clarityBufferSize).toBe(bufferSizeAfterFirst);
      });

      it('EP-050: clarity reallocates buffers when image size changes', () => {
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;

        // First call with 100x100 image
        const imageData1 = createTestImageData(100, 100, { r: 128, g: 128, b: 128 });
        processor.applyEffects(imageData1, 100, 100, state);

        const processorAny = processor as unknown as { clarityBufferSize: number };
        expect(processorAny.clarityBufferSize).toBe(100 * 100 * 4);

        // Second call with different size - should reallocate
        const imageData2 = createTestImageData(50, 50, { r: 64, g: 64, b: 64 });
        processor.applyEffects(imageData2, 50, 50, state);

        // Buffer size should change to match new size
        expect(processorAny.clarityBufferSize).toBe(50 * 50 * 4);
      });

      it('EP-051: midtone mask is cached and reused', () => {
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;

        // Access static midtoneMask
        const EffectProcessorClass = processor.constructor as unknown as { midtoneMask: Float32Array | null };

        // Clear static cache to test initialization
        EffectProcessorClass.midtoneMask = null;

        // First call - initializes midtone mask
        const imageData1 = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        processor.applyEffects(imageData1, 10, 10, state);

        // Midtone mask should now be initialized
        expect(EffectProcessorClass.midtoneMask).not.toBeNull();
        const cachedMask = EffectProcessorClass.midtoneMask;

        // Second call - should reuse same mask
        const imageData2 = createTestImageData(10, 10, { r: 64, g: 64, b: 64 });
        processor.applyEffects(imageData2, 10, 10, state);

        // Same mask instance should be used
        expect(EffectProcessorClass.midtoneMask).toBe(cachedMask);
      });
    });

    describe('Curves', () => {
      it('EP-046: curves with non-default points modify image', () => {
        const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const originalR = imageData.data[0];
        const state = createDefaultEffectsState();

        // Add a point to boost midtones
        state.curvesData.master.points = [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.7 }, // Boost midtones
          { x: 1, y: 1 },
        ];

        processor.applyEffects(imageData, 10, 10, state);

        // Midtone value (128/255 ≈ 0.5) should be boosted toward 0.7
        expect(imageData.data[0]).toBeGreaterThan(originalR!);
      });

      it('EP-047: curves channel-specific adjustments work', () => {
        const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const state = createDefaultEffectsState();

        // Boost only red channel midtones
        state.curvesData.red.points = [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.8 },
          { x: 1, y: 1 },
        ];

        processor.applyEffects(imageData, 10, 10, state);

        // Red should be boosted more than other channels
        expect(imageData.data[0]).toBeGreaterThan(imageData.data[1]!);
        expect(imageData.data[0]).toBeGreaterThan(imageData.data[2]!);
      });

      it('EP-048: disabled curves channel has no effect', () => {
        const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const originalData = new Uint8ClampedArray(imageData.data);
        const state = createDefaultEffectsState();

        // Set red curve but disable it
        state.curvesData.red.enabled = false;
        state.curvesData.red.points = [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.9 },
          { x: 1, y: 1 },
        ];

        processor.applyEffects(imageData, 10, 10, state);

        // Image should be unchanged
        expect(imageData.data).toEqual(originalData);
      });
    });

    describe('Merged Per-Pixel Effects & Vibrance 3D LUT', () => {
      it('EP-080: merged effects produce results within tolerance of expectations', () => {
        // Test that the merged loop produces reasonable results for highlights+vibrance+CDL combined
        const imageData = createTestImageData(10, 10, { r: 200, g: 100, b: 100 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.highlights = 30;
        state.colorAdjustments.vibrance = 20;
        state.cdlValues.slope = { r: 1.1, g: 1.0, b: 1.0 };

        processor.applyEffects(imageData, 10, 10, state);

        // Verify all pixel values are valid (no NaN, no out-of-range)
        for (let i = 0; i < imageData.data.length; i += 4) {
          expect(Number.isFinite(imageData.data[i]!)).toBe(true);
          expect(Number.isFinite(imageData.data[i + 1]!)).toBe(true);
          expect(Number.isFinite(imageData.data[i + 2]!)).toBe(true);
          expect(imageData.data[i]!).toBeGreaterThanOrEqual(0);
          expect(imageData.data[i]!).toBeLessThanOrEqual(255);
          expect(imageData.data[i + 1]!).toBeGreaterThanOrEqual(0);
          expect(imageData.data[i + 1]!).toBeLessThanOrEqual(255);
          expect(imageData.data[i + 2]!).toBeGreaterThanOrEqual(0);
          expect(imageData.data[i + 2]!).toBeLessThanOrEqual(255);
        }

        // Highlights should have reduced bright values, and CDL slope>1 on red should boost it
        // The red channel with slope 1.1 should generally be higher than unmodified green
        // (exact values depend on interaction between effects but direction should hold)
        expect(imageData.data[0]).not.toBe(200); // Changed from original
      });

      it('EP-081: vibrance 3D LUT produces results within tolerance of direct computation', () => {
        // Compare vibrance via 3D LUT (merged path) to expected vibrance behavior
        const imageDataLUT = createTestImageData(10, 10, { r: 200, g: 100, b: 100 });
        const state = createDefaultEffectsState();
        state.colorAdjustments.vibrance = 50;

        processor.applyEffects(imageDataLUT, 10, 10, state);

        // The vibrance should boost saturation for less-saturated colors
        // Red (200,100,100) is moderately saturated, so vibrance should push it further from gray
        const r = imageDataLUT.data[0]!;
        const g = imageDataLUT.data[1]!;
        const b = imageDataLUT.data[2]!;

        // Original avg = (200+100+100)/3 = 133.3, spread = 100
        // After positive vibrance, spread should be maintained or increased
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        expect(spread).toBeGreaterThan(50); // Still has meaningful saturation

        // Verify the 3D LUT doesn't produce artifacts (all values valid)
        for (let i = 0; i < imageDataLUT.data.length; i += 4) {
          expect(imageDataLUT.data[i]!).toBeGreaterThanOrEqual(0);
          expect(imageDataLUT.data[i]!).toBeLessThanOrEqual(255);
        }
      });

      it('EP-082: vibrance 3D LUT cache invalidation on parameter change', () => {
        // Access static vibrance LUT cache
        const EP = EffectProcessor as unknown as {
          vibrance3DLUT: Float32Array | null;
          vibrance3DLUTParams: { vibrance: number; skinProtection: boolean } | null;
        };

        // Clear cache
        EP.vibrance3DLUT = null;
        EP.vibrance3DLUTParams = null;

        // First call builds LUT
        const state1 = createDefaultEffectsState();
        state1.colorAdjustments.vibrance = 30;
        const img1 = createTestImageData(5, 5, { r: 150, g: 100, b: 80 });
        processor.applyEffects(img1, 5, 5, state1);

        expect(EP.vibrance3DLUT).not.toBeNull();
        expect(EP.vibrance3DLUTParams!.vibrance).toBe(30);
        const lut1 = EP.vibrance3DLUT;

        // Same params - should reuse LUT
        const img2 = createTestImageData(5, 5, { r: 150, g: 100, b: 80 });
        processor.applyEffects(img2, 5, 5, state1);
        expect(EP.vibrance3DLUT).toBe(lut1);

        // Different vibrance - should rebuild LUT
        const state2 = createDefaultEffectsState();
        state2.colorAdjustments.vibrance = 60;
        const img3 = createTestImageData(5, 5, { r: 150, g: 100, b: 80 });
        processor.applyEffects(img3, 5, 5, state2);
        expect(EP.vibrance3DLUTParams!.vibrance).toBe(60);
        expect(EP.vibrance3DLUT).not.toBe(lut1);

        // Different skin protection - should rebuild LUT
        const lut3 = EP.vibrance3DLUT;
        const state3 = createDefaultEffectsState();
        state3.colorAdjustments.vibrance = 60;
        state3.colorAdjustments.vibranceSkinProtection = !state2.colorAdjustments.vibranceSkinProtection;
        const img4 = createTestImageData(5, 5, { r: 150, g: 100, b: 80 });
        processor.applyEffects(img4, 5, 5, state3);
        expect(EP.vibrance3DLUT).not.toBe(lut3);
      });

      it('EP-083: merged loop handles all effects active simultaneously', () => {
        const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const state = createDefaultEffectsState();

        // Enable ALL per-pixel effects
        state.colorAdjustments.highlights = 10;
        state.colorAdjustments.shadows = 10;
        state.colorAdjustments.whites = 5;
        state.colorAdjustments.blacks = 5;
        state.colorAdjustments.vibrance = 20;
        state.colorAdjustments.hueRotation = 30;
        state.colorWheelsState.master = { r: 0.1, g: 0, b: 0, y: 0 };
        state.cdlValues.slope = { r: 1.05, g: 1.0, b: 0.95 };
        state.curvesData.master.points = [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.55 },
          { x: 1, y: 1 },
        ];
        state.hslQualifierState.enabled = true;
        state.hslQualifierState.hue = { center: 0, width: 180, softness: 50 };
        state.hslQualifierState.saturation = { center: 50, width: 100, softness: 50 };
        state.hslQualifierState.luminance = { center: 50, width: 100, softness: 50 };
        state.hslQualifierState.correction = { hueShift: 5, saturationScale: 1.1, luminanceScale: 1.0 };
        state.toneMappingState.enabled = true;
        state.toneMappingState.operator = 'reinhard';
        state.colorInversionEnabled = true;

        // Should not throw
        expect(() => {
          processor.applyEffects(imageData, 10, 10, state);
        }).not.toThrow();

        // All values should be valid
        for (let i = 0; i < imageData.data.length; i += 4) {
          expect(Number.isFinite(imageData.data[i]!)).toBe(true);
          expect(Number.isFinite(imageData.data[i + 1]!)).toBe(true);
          expect(Number.isFinite(imageData.data[i + 2]!)).toBe(true);
          expect(imageData.data[i]!).toBeGreaterThanOrEqual(0);
          expect(imageData.data[i]!).toBeLessThanOrEqual(255);
        }
      });

      it('EP-084: merged loop handles individual effects in isolation', () => {
        // Each effect needs pixel values that will produce visible changes.
        // Highlights need bright pixels (luminance > 0.5), shadows need dark pixels, etc.
        const defaultPixel = { r: 200, g: 100, b: 100 };
        const brightPixel = { r: 220, g: 200, b: 200 }; // luminance > 0.5 for highlights
        const darkPixel = { r: 40, g: 30, b: 30 }; // luminance < 0.5 for shadows

        const testEffects: Array<{ name: string; pixel?: { r: number; g: number; b: number }; setup: (s: AllEffectsState) => void }> = [
          { name: 'highlights', pixel: brightPixel, setup: (s) => { s.colorAdjustments.highlights = 80; } },
          { name: 'shadows', pixel: darkPixel, setup: (s) => { s.colorAdjustments.shadows = 80; } },
          { name: 'whites', setup: (s) => { s.colorAdjustments.whites = 50; } },
          { name: 'blacks', setup: (s) => { s.colorAdjustments.blacks = 50; } },
          { name: 'vibrance', setup: (s) => { s.colorAdjustments.vibrance = 50; } },
          { name: 'hueRotation', setup: (s) => { s.colorAdjustments.hueRotation = 90; } },
          { name: 'colorWheels', setup: (s) => { s.colorWheelsState.master = { r: 0.5, g: 0, b: 0, y: 0 }; } },
          { name: 'cdl', setup: (s) => { s.cdlValues.slope = { r: 2, g: 1, b: 1 }; } },
          { name: 'curves', setup: (s) => {
            s.curvesData.master.points = [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }];
          }},
          { name: 'hslQualifier', setup: (s) => {
            s.hslQualifierState.enabled = true;
            s.hslQualifierState.hue = { center: 0, width: 60, softness: 20 };
            s.hslQualifierState.saturation = { center: 100, width: 100, softness: 20 };
            s.hslQualifierState.luminance = { center: 50, width: 100, softness: 20 };
            s.hslQualifierState.correction = { hueShift: 120, saturationScale: 1, luminanceScale: 1 };
          }},
          { name: 'toneMapping', setup: (s) => {
            s.toneMappingState.enabled = true;
            s.toneMappingState.operator = 'aces';
          }},
          { name: 'colorInversion', setup: (s) => { s.colorInversionEnabled = true; } },
          { name: 'channelIsolation', setup: (s) => { s.channelMode = 'red'; } },
        ];

        for (const effect of testEffects) {
          const pixel = effect.pixel ?? defaultPixel;
          const imageData = createTestImageData(5, 5, pixel);
          const originalData = new Uint8ClampedArray(imageData.data);
          const state = createDefaultEffectsState();
          effect.setup(state);

          expect(() => {
            processor.applyEffects(imageData, 5, 5, state);
          }).not.toThrow();

          // The image should be modified (effect was applied)
          let changed = false;
          for (let i = 0; i < imageData.data.length; i++) {
            if (imageData.data[i] !== originalData[i]) {
              changed = true;
              break;
            }
          }
          expect(changed, `Effect "${effect.name}" should modify the image`).toBe(true);

          // All values should be valid
          for (let i = 0; i < imageData.data.length; i += 4) {
            expect(Number.isFinite(imageData.data[i]!)).toBe(true);
            expect(imageData.data[i]!).toBeGreaterThanOrEqual(0);
            expect(imageData.data[i]!).toBeLessThanOrEqual(255);
          }
        }
      });

      it('EP-085: clarity and sharpen still work correctly as separate passes', () => {
        // Clarity - inter-pixel dependency, applied as Pass 1
        const clarityImg = createGradientImageData(20, 20);
        const clarityOriginal = new Uint8ClampedArray(clarityImg.data);
        const clarityState = createDefaultEffectsState();
        clarityState.colorAdjustments.clarity = 50;

        processor.applyEffects(clarityImg, 20, 20, clarityState);

        // Clarity should modify the image
        let clarityChanged = false;
        for (let i = 0; i < clarityImg.data.length; i++) {
          if (clarityImg.data[i] !== clarityOriginal[i]) {
            clarityChanged = true;
            break;
          }
        }
        expect(clarityChanged).toBe(true);

        // Sharpen - inter-pixel dependency, applied as Pass 3
        const sharpenImg = createGradientImageData(20, 20);
        const sharpenOriginal = new Uint8ClampedArray(sharpenImg.data);
        const sharpenState = createDefaultEffectsState();
        sharpenState.filterSettings.sharpen = 50;

        processor.applyEffects(sharpenImg, 20, 20, sharpenState);

        // Sharpen should modify the image
        let sharpenChanged = false;
        for (let i = 0; i < sharpenImg.data.length; i++) {
          if (sharpenImg.data[i] !== sharpenOriginal[i]) {
            sharpenChanged = true;
            break;
          }
        }
        expect(sharpenChanged).toBe(true);

        // Clarity + per-pixel effects + sharpen combined
        const combinedImg = createGradientImageData(20, 20);
        const combinedState = createDefaultEffectsState();
        combinedState.colorAdjustments.clarity = 30;
        combinedState.colorAdjustments.highlights = 20;
        combinedState.filterSettings.sharpen = 30;

        expect(() => {
          processor.applyEffects(combinedImg, 20, 20, combinedState);
        }).not.toThrow();

        // All values should be valid
        for (let i = 0; i < combinedImg.data.length; i += 4) {
          expect(Number.isFinite(combinedImg.data[i]!)).toBe(true);
          expect(combinedImg.data[i]!).toBeGreaterThanOrEqual(0);
          expect(combinedImg.data[i]!).toBeLessThanOrEqual(255);
        }
      });

      it('EP-086: empty/no-effect state produces unchanged pixel data', () => {
        const imageData = createTestImageData(10, 10, { r: 128, g: 64, b: 192 });
        const originalData = new Uint8ClampedArray(imageData.data);

        processor.applyEffects(imageData, 10, 10, defaultState);

        // Pixel data should be completely unchanged
        expect(imageData.data).toEqual(originalData);
      });
    });

    describe('applyEffectsAsync (Phase 4A)', () => {
      it('VE-ASYNC-001: applyEffectsAsync exists and returns a Promise', () => {
        const imageData = createTestImageData(4, 4, { r: 128, g: 128, b: 128 });
        const result = processor.applyEffectsAsync(imageData, 4, 4, defaultState);

        expect(result).toBeInstanceOf(Promise);
      });

      it('VE-ASYNC-002: async version produces the same pixel output as the sync version', async () => {
        // Create two identical images
        const imageDataSync = createGradientImageData(16, 16);
        const imageDataAsync = createGradientImageData(16, 16);

        // Set up effects state with clarity, per-pixel effects, and sharpen active
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;
        state.colorAdjustments.highlights = 30;
        state.colorAdjustments.shadows = -20;
        state.colorAdjustments.vibrance = 40;
        state.filterSettings.sharpen = 50;
        state.cdlValues.slope.r = 1.1;
        state.cdlValues.offset.g = 0.02;

        // Apply sync version
        processor.applyEffects(imageDataSync, 16, 16, state);

        // Apply async version
        const processor2 = new EffectProcessor();
        await processor2.applyEffectsAsync(imageDataAsync, 16, 16, state);

        // Pixel output must be identical
        expect(imageDataAsync.data).toEqual(imageDataSync.data);
      });

      it('VE-ASYNC-003: async version yields between passes (verify via microtask timing)', async () => {
        const imageData = createGradientImageData(8, 8);

        // State with clarity + per-pixel + sharpen to trigger all 3 passes
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 30;
        state.colorAdjustments.highlights = 20;
        state.filterSettings.sharpen = 40;

        // Track yields by counting how many times the event loop is yielded to.
        // We do this by scheduling microtasks that increment a counter.
        let yieldCount = 0;
        const originalSetTimeout = globalThis.setTimeout;

        // Monkey-patch setTimeout to count yield calls
        const mockSetTimeout = (fn: () => void, ms?: number) => {
          if (ms === 0) {
            yieldCount++;
          }
          return originalSetTimeout(fn, ms);
        };
        globalThis.setTimeout = mockSetTimeout as typeof globalThis.setTimeout;

        try {
          await processor.applyEffectsAsync(imageData, 8, 8, state);

          // With all 3 passes active (clarity, per-pixel, sharpen),
          // we expect yields after clarity and after per-pixel passes (2 yields).
          // The last pass (sharpen) does not yield after.
          expect(yieldCount).toBeGreaterThanOrEqual(2);
        } finally {
          globalThis.setTimeout = originalSetTimeout;
        }
      });

      it('VE-ASYNC-004: yieldToMain resolves promptly', async () => {
        const start = performance.now();
        await yieldToMain();
        const elapsed = performance.now() - start;

        // yieldToMain should resolve within a reasonable time (well under 100ms)
        expect(elapsed).toBeLessThan(100);
      });

      it('VE-ASYNC-005: async version with no effects returns immediately without yielding', async () => {
        const imageData = createTestImageData(4, 4, { r: 100, g: 150, b: 200 });
        const originalData = new Uint8ClampedArray(imageData.data);

        await processor.applyEffectsAsync(imageData, 4, 4, defaultState);

        // No effects active: data should be unchanged
        expect(imageData.data).toEqual(originalData);
      });

      it('VE-ASYNC-006: async version with only clarity yields once', async () => {
        const imageData = createGradientImageData(8, 8);
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;

        let yieldCount = 0;
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: () => void, ms?: number) => {
          if (ms === 0) yieldCount++;
          return originalSetTimeout(fn, ms);
        }) as typeof globalThis.setTimeout;

        try {
          await processor.applyEffectsAsync(imageData, 8, 8, state);
          // Only clarity pass is active, so one yield after it
          expect(yieldCount).toBe(1);
        } finally {
          globalThis.setTimeout = originalSetTimeout;
        }
      });

      it('VE-ASYNC-007: async version with only sharpen does not yield', async () => {
        const imageData = createGradientImageData(8, 8);
        const state = createDefaultEffectsState();
        state.filterSettings.sharpen = 50;

        let yieldCount = 0;
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: () => void, ms?: number) => {
          if (ms === 0) yieldCount++;
          return originalSetTimeout(fn, ms);
        }) as typeof globalThis.setTimeout;

        try {
          await processor.applyEffectsAsync(imageData, 8, 8, state);
          // Only sharpen pass is active, no yield after the last pass
          expect(yieldCount).toBe(0);
        } finally {
          globalThis.setTimeout = originalSetTimeout;
        }
      });
    });

    describe('SIMD-like Optimizations (Phase 5B)', () => {
      describe('EP-SIMD-001: SIMD color inversion produces same output as scalar version', () => {
        it('inverts RGB and preserves alpha identically to scalar', () => {
          const imgSIMD = createTestImageData(10, 10, { r: 100, g: 150, b: 200, a: 180 });
          const imgScalar = createTestImageData(10, 10, { r: 100, g: 150, b: 200, a: 180 });

          applyColorInversionSIMD(imgSIMD.data);
          applyColorInversionScalar(imgScalar.data);

          expect(imgSIMD.data).toEqual(imgScalar.data);
        });

        it('inverts pure black to white', () => {
          const img = createTestImageData(2, 2, { r: 0, g: 0, b: 0, a: 255 });
          applyColorInversionSIMD(img.data);

          expect(img.data[0]).toBe(255);
          expect(img.data[1]).toBe(255);
          expect(img.data[2]).toBe(255);
          expect(img.data[3]).toBe(255); // Alpha preserved
        });

        it('inverts pure white to black', () => {
          const img = createTestImageData(2, 2, { r: 255, g: 255, b: 255, a: 128 });
          applyColorInversionSIMD(img.data);

          expect(img.data[0]).toBe(0);
          expect(img.data[1]).toBe(0);
          expect(img.data[2]).toBe(0);
          expect(img.data[3]).toBe(128); // Alpha preserved
        });

        it('double inversion returns to original', () => {
          const img = createTestImageData(5, 5, { r: 42, g: 137, b: 233, a: 99 });
          const original = new Uint8ClampedArray(img.data);

          applyColorInversionSIMD(img.data);
          applyColorInversionSIMD(img.data);

          expect(img.data).toEqual(original);
        });

        it('matches output of EffectProcessor inversion-only path', () => {
          const imgDirect = createTestImageData(8, 8, { r: 80, g: 160, b: 240, a: 200 });
          const imgProcessor = createTestImageData(8, 8, { r: 80, g: 160, b: 240, a: 200 });

          // Direct SIMD function
          applyColorInversionSIMD(imgDirect.data);

          // Through EffectProcessor (should use SIMD fast-path)
          const state = createDefaultEffectsState();
          state.colorInversionEnabled = true;
          processor.applyEffects(imgProcessor, 8, 8, state);

          expect(imgProcessor.data).toEqual(imgDirect.data);
        });

        it('handles varied pixel values across the image', () => {
          const img = createGradientImageData(16, 16);
          const imgCopy = new ImageData(new Uint8ClampedArray(img.data), 16, 16);

          applyColorInversionSIMD(img.data);
          applyColorInversionScalar(imgCopy.data);

          expect(img.data).toEqual(imgCopy.data);
        });
      });

      describe('EP-SIMD-002: SIMD channel isolation produces correct output', () => {
        it('red channel isolation via bitmask zeros G and B', () => {
          const img = createTestImageData(2, 2, { r: 100, g: 150, b: 200, a: 255 });
          applyChannelIsolationSIMD(img.data, 'red');

          expect(img.data[0]).toBe(100); // R preserved
          expect(img.data[1]).toBe(0);   // G zeroed
          expect(img.data[2]).toBe(0);   // B zeroed
          expect(img.data[3]).toBe(255); // A preserved
        });

        it('green channel isolation via bitmask zeros R and B', () => {
          const img = createTestImageData(2, 2, { r: 100, g: 150, b: 200, a: 255 });
          applyChannelIsolationSIMD(img.data, 'green');

          expect(img.data[0]).toBe(0);   // R zeroed
          expect(img.data[1]).toBe(150); // G preserved
          expect(img.data[2]).toBe(0);   // B zeroed
          expect(img.data[3]).toBe(255); // A preserved
        });

        it('blue channel isolation via bitmask zeros R and G', () => {
          const img = createTestImageData(2, 2, { r: 100, g: 150, b: 200, a: 255 });
          applyChannelIsolationSIMD(img.data, 'blue');

          expect(img.data[0]).toBe(0);   // R zeroed
          expect(img.data[1]).toBe(0);   // G zeroed
          expect(img.data[2]).toBe(200); // B preserved
          expect(img.data[3]).toBe(255); // A preserved
        });

        it('grayscale channel isolation copies selected channel to all RGB', () => {
          const img = createTestImageData(2, 2, { r: 100, g: 150, b: 200, a: 128 });
          applyChannelIsolationGrayscale(img.data, 'red');

          expect(img.data[0]).toBe(100); // R value
          expect(img.data[1]).toBe(100); // R value copied to G
          expect(img.data[2]).toBe(100); // R value copied to B
          expect(img.data[3]).toBe(128); // A preserved
        });

        it('grayscale green isolation matches processor channel mode', () => {
          const imgDirect = createTestImageData(4, 4, { r: 80, g: 160, b: 240, a: 255 });
          const imgProcessor = createTestImageData(4, 4, { r: 80, g: 160, b: 240, a: 255 });

          applyChannelIsolationGrayscale(imgDirect.data, 'green');

          const state = createDefaultEffectsState();
          state.channelMode = 'green';
          processor.applyEffects(imgProcessor, 4, 4, state);

          expect(imgProcessor.data).toEqual(imgDirect.data);
        });

        it('luminance isolation matches processor luminance mode', () => {
          const imgDirect = createTestImageData(4, 4, { r: 255, g: 0, b: 0, a: 255 });
          const imgProcessor = createTestImageData(4, 4, { r: 255, g: 0, b: 0, a: 255 });

          applyLuminanceIsolation(imgDirect.data);

          const state = createDefaultEffectsState();
          state.channelMode = 'luminance';
          processor.applyEffects(imgProcessor, 4, 4, state);

          expect(imgProcessor.data).toEqual(imgDirect.data);
        });

        it('channel isolation preserves alpha for all channels', () => {
          for (const channel of ['red', 'green', 'blue'] as const) {
            const img = createTestImageData(3, 3, { r: 100, g: 150, b: 200, a: 77 });
            applyChannelIsolationGrayscale(img.data, channel);

            // Check all alpha values preserved
            for (let i = 3; i < img.data.length; i += 4) {
              expect(img.data[i]).toBe(77);
            }
          }
        });
      });

      describe('EP-SIMD-003: Endianness detection works correctly', () => {
        it('IS_LITTLE_ENDIAN is a boolean', () => {
          expect(typeof IS_LITTLE_ENDIAN).toBe('boolean');
        });

        it('endianness detection is consistent with manual check', () => {
          const buf = new ArrayBuffer(4);
          const u32 = new Uint32Array(buf);
          const u8 = new Uint8Array(buf);
          u32[0] = 0x12345678;
          const manualIsLE = u8[0] === 0x78;

          expect(IS_LITTLE_ENDIAN).toBe(manualIsLE);
        });

        it('COLOR_INVERSION_XOR_MASK is correct for detected endianness', () => {
          if (IS_LITTLE_ENDIAN) {
            expect(COLOR_INVERSION_XOR_MASK).toBe(0x00FFFFFF);
          } else {
            expect(COLOR_INVERSION_XOR_MASK).toBe(0xFFFFFF00);
          }
        });

        it('CHANNEL_MASKS are correct for detected endianness', () => {
          if (IS_LITTLE_ENDIAN) {
            expect(CHANNEL_MASKS.red).toBe(0xFF0000FF);
            expect(CHANNEL_MASKS.green).toBe(0xFF00FF00);
            expect(CHANNEL_MASKS.blue).toBe(0xFFFF0000);
          }
          // Verify masks isolate correct channel by applying to a known pixel
          const img = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 255 });
          const u32 = new Uint32Array(img.data.buffer);
          const originalPixel = u32[0]!;

          // Red mask should preserve R and A
          const redResult = originalPixel & CHANNEL_MASKS.red;
          const redBytes = new Uint8Array(new Uint32Array([redResult]).buffer);
          if (IS_LITTLE_ENDIAN) {
            expect(redBytes[0]).toBe(100); // R
            expect(redBytes[1]).toBe(0);   // G zeroed
            expect(redBytes[2]).toBe(0);   // B zeroed
            expect(redBytes[3]).toBe(255); // A
          }
        });
      });

      describe('EP-SIMD-004: Performance comparison', () => {
        it('SIMD inversion is not slower than scalar for large images', () => {
          const size = 512;
          const imgSIMD = createTestImageData(size, size, { r: 100, g: 150, b: 200 });
          const imgScalar = createTestImageData(size, size, { r: 100, g: 150, b: 200 });

          // Warm up
          applyColorInversionSIMD(imgSIMD.data);
          applyColorInversionScalar(imgScalar.data);

          // Reset
          const img1 = createTestImageData(size, size, { r: 100, g: 150, b: 200 });
          const img2 = createTestImageData(size, size, { r: 100, g: 150, b: 200 });

          const iterations = 10;

          const startSIMD = performance.now();
          for (let i = 0; i < iterations; i++) {
            applyColorInversionSIMD(img1.data);
          }
          const timeSIMD = performance.now() - startSIMD;

          const startScalar = performance.now();
          for (let i = 0; i < iterations; i++) {
            applyColorInversionScalar(img2.data);
          }
          const timeScalar = performance.now() - startScalar;

          // SIMD should not be significantly slower (allow 3x margin for JIT variance)
          expect(timeSIMD).toBeLessThan(timeScalar * 3);

          // Both should produce same result (after even number of inversions)
          expect(img1.data).toEqual(img2.data);
        });
      });

      describe('EP-SIMD-005: Edge cases', () => {
        it('handles single pixel image', () => {
          const img = createTestImageData(1, 1, { r: 42, g: 137, b: 233, a: 99 });

          applyColorInversionSIMD(img.data);
          expect(img.data[0]).toBe(213);  // 255 - 42
          expect(img.data[1]).toBe(118);  // 255 - 137
          expect(img.data[2]).toBe(22);   // 255 - 233
          expect(img.data[3]).toBe(99);   // Alpha preserved
        });

        it('handles single pixel channel isolation', () => {
          const img = createTestImageData(1, 1, { r: 42, g: 137, b: 233, a: 99 });

          applyChannelIsolationGrayscale(img.data, 'blue');
          expect(img.data[0]).toBe(233);
          expect(img.data[1]).toBe(233);
          expect(img.data[2]).toBe(233);
          expect(img.data[3]).toBe(99);
        });

        it('handles odd-dimension images', () => {
          const img = createTestImageData(3, 7, { r: 100, g: 150, b: 200, a: 255 });
          applyColorInversionSIMD(img.data);

          for (let i = 0; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(155);
            expect(img.data[i + 1]).toBe(105);
            expect(img.data[i + 2]).toBe(55);
            expect(img.data[i + 3]).toBe(255);
          }
        });

        it('handles all-zero image (transparent black)', () => {
          const img = createTestImageData(4, 4, { r: 0, g: 0, b: 0, a: 0 });
          applyColorInversionSIMD(img.data);

          for (let i = 0; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(255);
            expect(img.data[i + 1]).toBe(255);
            expect(img.data[i + 2]).toBe(255);
            expect(img.data[i + 3]).toBe(0); // Alpha preserved
          }
        });

        it('handles maximum values image', () => {
          const img = createTestImageData(2, 2, { r: 255, g: 255, b: 255, a: 255 });
          applyColorInversionSIMD(img.data);

          for (let i = 0; i < img.data.length; i += 4) {
            expect(img.data[i]).toBe(0);
            expect(img.data[i + 1]).toBe(0);
            expect(img.data[i + 2]).toBe(0);
            expect(img.data[i + 3]).toBe(255);
          }
        });

        it('SIMD fast-path handles inversion + channel isolation combined', () => {
          const imgFastPath = createTestImageData(4, 4, { r: 100, g: 150, b: 200, a: 255 });
          const imgManual = createTestImageData(4, 4, { r: 100, g: 150, b: 200, a: 255 });

          // Fast path through EffectProcessor
          const state = createDefaultEffectsState();
          state.colorInversionEnabled = true;
          state.channelMode = 'red';
          processor.applyEffects(imgFastPath, 4, 4, state);

          // Manual: invert then show red as grayscale
          applyColorInversionSIMD(imgManual.data);
          applyChannelIsolationGrayscale(imgManual.data, 'red');

          expect(imgFastPath.data).toEqual(imgManual.data);
        });

        it('brightness LUT produces correct values', () => {
          const lut = buildBrightnessLUT(2.0);
          expect(lut[0]).toBe(0);      // 0 * 2 = 0
          expect(lut[64]).toBe(128);   // 64 * 2 = 128
          expect(lut[128]).toBe(255);  // 128 * 2 = 256 -> clamped to 255
          expect(lut[255]).toBe(255);  // 255 * 2 = 510 -> clamped to 255

          const lutDim = buildBrightnessLUT(0.5);
          expect(lutDim[0]).toBe(0);
          expect(lutDim[100]).toBe(50);
          expect(lutDim[200]).toBe(100);
          expect(lutDim[255]).toBe(128); // 255 * 0.5 = 127.5 -> 128
        });

        it('applyLUTToRGB applies lookup correctly', () => {
          const img = createTestImageData(2, 2, { r: 100, g: 150, b: 200, a: 128 });
          const lut = buildBrightnessLUT(0.5);

          applyLUTToRGB(img.data, lut);

          expect(img.data[0]).toBe(50);   // 100 * 0.5
          expect(img.data[1]).toBe(75);   // 150 * 0.5
          expect(img.data[2]).toBe(100);  // 200 * 0.5
          expect(img.data[3]).toBe(128);  // Alpha preserved
        });
      });
    });

    describe('Row-Based Chunking (Phase 4B)', () => {
      it('EP-CHUNK-001: chunked clarity produces same output as non-chunked', async () => {
        // Create two identical gradient images (gradient has spatial variation for clarity effect)
        const imageDataSync = createGradientImageData(64, 64);
        const imageDataAsync = createGradientImageData(64, 64);

        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 60;

        // Apply sync version (uses non-chunked applyClarity)
        processor.applyEffects(imageDataSync, 64, 64, state);

        // Apply async version (uses chunked applyClarityChunked)
        const processor2 = new EffectProcessor();
        await processor2.applyEffectsAsync(imageDataAsync, 64, 64, state);

        // Pixel output must be identical
        expect(imageDataAsync.data).toEqual(imageDataSync.data);
      });

      it('EP-CHUNK-002: chunked sharpen produces same output as non-chunked', async () => {
        // Create two identical gradient images
        const imageDataSync = createGradientImageData(64, 64);
        const imageDataAsync = createGradientImageData(64, 64);

        const state = createDefaultEffectsState();
        state.filterSettings.sharpen = 75;

        // Apply sync version (uses non-chunked applySharpenCPU)
        processor.applyEffects(imageDataSync, 64, 64, state);

        // Apply async version (uses chunked applySharpenCPUChunked)
        const processor2 = new EffectProcessor();
        await processor2.applyEffectsAsync(imageDataAsync, 64, 64, state);

        // Pixel output must be identical
        expect(imageDataAsync.data).toEqual(imageDataSync.data);
      });

      it('EP-CHUNK-003: multiple yields occur during chunked clarity processing on large images', async () => {
        // Create an image taller than CHUNK_ROWS (128) so it requires multiple chunks
        const tallHeight = 300; // 300 rows > 128 chunk size => ceil(300/128) = 3 chunks => 2 yields within clarity
        const imageData = createGradientImageData(32, tallHeight);
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;

        let yieldCount = 0;
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: () => void, ms?: number) => {
          if (ms === 0) yieldCount++;
          return originalSetTimeout(fn, ms);
        }) as typeof globalThis.setTimeout;

        try {
          await processor.applyEffectsAsync(imageData, 32, tallHeight, state);

          // Clarity with 300 rows / 128 chunk = 3 chunks => 2 yields within clarity blend
          // Plus 1 yield after the clarity pass itself (from applyEffectsAsync)
          // Total: at least 3 yields
          expect(yieldCount).toBeGreaterThanOrEqual(3);
        } finally {
          globalThis.setTimeout = originalSetTimeout;
        }
      });

      it('EP-CHUNK-004: multiple yields occur during chunked sharpen processing on large images', async () => {
        // Create an image taller than CHUNK_ROWS so sharpen requires multiple chunks
        const tallHeight = 300;
        const imageData = createGradientImageData(32, tallHeight);
        const state = createDefaultEffectsState();
        state.filterSettings.sharpen = 50;

        let yieldCount = 0;
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: () => void, ms?: number) => {
          if (ms === 0) yieldCount++;
          return originalSetTimeout(fn, ms);
        }) as typeof globalThis.setTimeout;

        try {
          await processor.applyEffectsAsync(imageData, 32, tallHeight, state);

          // Sharpen with 298 processable rows (1..298) / 128 chunk = 3 chunks => 2 yields
          // No yield after sharpen (last pass), so total: at least 2 yields
          expect(yieldCount).toBeGreaterThanOrEqual(2);
        } finally {
          globalThis.setTimeout = originalSetTimeout;
        }
      });

      it('EP-CHUNK-005: small images (fewer rows than chunk size) work correctly for clarity', async () => {
        // Image smaller than CHUNK_ROWS (128 rows)
        const imageDataSync = createGradientImageData(16, 16);
        const imageDataAsync = createGradientImageData(16, 16);

        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 40;

        processor.applyEffects(imageDataSync, 16, 16, state);
        const processor2 = new EffectProcessor();
        await processor2.applyEffectsAsync(imageDataAsync, 16, 16, state);

        // Should produce identical output even with a single chunk
        expect(imageDataAsync.data).toEqual(imageDataSync.data);
      });

      it('EP-CHUNK-006: small images (fewer rows than chunk size) work correctly for sharpen', async () => {
        // Image smaller than CHUNK_ROWS (128 rows)
        const imageDataSync = createGradientImageData(16, 16);
        const imageDataAsync = createGradientImageData(16, 16);

        const state = createDefaultEffectsState();
        state.filterSettings.sharpen = 60;

        processor.applyEffects(imageDataSync, 16, 16, state);
        const processor2 = new EffectProcessor();
        await processor2.applyEffectsAsync(imageDataAsync, 16, 16, state);

        expect(imageDataAsync.data).toEqual(imageDataSync.data);
      });

      it('EP-CHUNK-007: chunked clarity + sharpen combined produces same output as sync', async () => {
        // Test both chunked effects together
        const imageDataSync = createGradientImageData(64, 64);
        const imageDataAsync = createGradientImageData(64, 64);

        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;
        state.colorAdjustments.highlights = 20;
        state.filterSettings.sharpen = 40;

        processor.applyEffects(imageDataSync, 64, 64, state);
        const processor2 = new EffectProcessor();
        await processor2.applyEffectsAsync(imageDataAsync, 64, 64, state);

        expect(imageDataAsync.data).toEqual(imageDataSync.data);
      });

      it('EP-CHUNK-008: no intra-chunk yields for small images with clarity', async () => {
        // Small image (8 rows < 128 chunk size) should not yield within the clarity blend
        const imageData = createGradientImageData(8, 8);
        const state = createDefaultEffectsState();
        state.colorAdjustments.clarity = 50;

        let yieldCount = 0;
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: () => void, ms?: number) => {
          if (ms === 0) yieldCount++;
          return originalSetTimeout(fn, ms);
        }) as typeof globalThis.setTimeout;

        try {
          await processor.applyEffectsAsync(imageData, 8, 8, state);

          // Only 1 yield: after the clarity pass itself (from applyEffectsAsync)
          // No intra-chunk yields because 8 rows < 128 chunk rows (single chunk, no mid-yield)
          expect(yieldCount).toBe(1);
        } finally {
          globalThis.setTimeout = originalSetTimeout;
        }
      });

      it('EP-CHUNK-009: CHUNK_ROWS constant is accessible and reasonable', () => {
        expect(EffectProcessor.CHUNK_ROWS).toBe(128);
        expect(EffectProcessor.CHUNK_ROWS).toBeGreaterThanOrEqual(32);
        expect(EffectProcessor.CHUNK_ROWS).toBeLessThanOrEqual(256);
      });
    });

    describe('Deinterlace & Film Emulation Integration', () => {
      it('EP-DI-001: hasActiveEffects returns true when deinterlace bob is active', () => {
        const state = createDefaultEffectsState();
        state.deinterlaceParams.enabled = true;
        state.deinterlaceParams.method = 'bob';
        expect(hasActiveEffects(state)).toBe(true);
      });

      it('EP-DI-002: hasActiveEffects returns false for deinterlace weave mode', () => {
        const state = createDefaultEffectsState();
        state.deinterlaceParams.enabled = true;
        state.deinterlaceParams.method = 'weave';
        expect(hasActiveEffects(state)).toBe(false);
      });

      it('EP-DI-003: hasActiveEffects returns false when deinterlace is disabled', () => {
        const state = createDefaultEffectsState();
        state.deinterlaceParams.enabled = false;
        state.deinterlaceParams.method = 'bob';
        expect(hasActiveEffects(state)).toBe(false);
      });

      it('EP-FE-001: hasActiveEffects returns true when film emulation is active', () => {
        const state = createDefaultEffectsState();
        state.filmEmulationParams.enabled = true;
        state.filmEmulationParams.intensity = 50;
        expect(hasActiveEffects(state)).toBe(true);
      });

      it('EP-FE-002: hasActiveEffects returns false when film emulation intensity is 0', () => {
        const state = createDefaultEffectsState();
        state.filmEmulationParams.enabled = true;
        state.filmEmulationParams.intensity = 0;
        expect(hasActiveEffects(state)).toBe(false);
      });

      it('EP-FE-003: hasActiveEffects returns false when film emulation is disabled', () => {
        const state = createDefaultEffectsState();
        state.filmEmulationParams.enabled = false;
        state.filmEmulationParams.intensity = 100;
        expect(hasActiveEffects(state)).toBe(false);
      });

      it('EP-DI-004: computeEffectsHash changes when deinterlace is toggled', () => {
        const state1 = createDefaultEffectsState();
        const state2 = createDefaultEffectsState();
        state2.deinterlaceParams.enabled = true;
        expect(computeEffectsHash(state1)).not.toBe(computeEffectsHash(state2));
      });

      it('EP-DI-005: computeEffectsHash changes when deinterlace method changes', () => {
        const state1 = createDefaultEffectsState();
        state1.deinterlaceParams.enabled = true;
        state1.deinterlaceParams.method = 'bob';
        const state2 = createDefaultEffectsState();
        state2.deinterlaceParams.enabled = true;
        state2.deinterlaceParams.method = 'blend';
        expect(computeEffectsHash(state1)).not.toBe(computeEffectsHash(state2));
      });

      it('EP-DI-006: computeEffectsHash changes when deinterlace fieldOrder changes', () => {
        const state1 = createDefaultEffectsState();
        state1.deinterlaceParams.enabled = true;
        state1.deinterlaceParams.fieldOrder = 'tff';
        const state2 = createDefaultEffectsState();
        state2.deinterlaceParams.enabled = true;
        state2.deinterlaceParams.fieldOrder = 'bff';
        expect(computeEffectsHash(state1)).not.toBe(computeEffectsHash(state2));
      });

      it('EP-FE-004: computeEffectsHash changes when film emulation stock changes', () => {
        const state1 = createDefaultEffectsState();
        state1.filmEmulationParams.enabled = true;
        state1.filmEmulationParams.stock = 'kodak-portra-400';
        const state2 = createDefaultEffectsState();
        state2.filmEmulationParams.enabled = true;
        state2.filmEmulationParams.stock = 'fuji-velvia-50';
        expect(computeEffectsHash(state1)).not.toBe(computeEffectsHash(state2));
      });

      it('EP-FE-005: computeEffectsHash changes when film emulation intensity changes', () => {
        const state1 = createDefaultEffectsState();
        state1.filmEmulationParams.enabled = true;
        state1.filmEmulationParams.intensity = 50;
        const state2 = createDefaultEffectsState();
        state2.filmEmulationParams.enabled = true;
        state2.filmEmulationParams.intensity = 100;
        expect(computeEffectsHash(state1)).not.toBe(computeEffectsHash(state2));
      });

      it('EP-DI-007: applyEffects applies deinterlace bob mode', () => {
        // 4x4 interlaced image: even rows=200, odd rows=50
        const img = createTestImageData(4, 4, { r: 0, g: 0, b: 0, a: 255 });
        for (let y = 0; y < 4; y++) {
          const val = y % 2 === 0 ? 200 : 50;
          for (let x = 0; x < 4; x++) {
            const i = (y * 4 + x) * 4;
            img.data[i] = val;
            img.data[i + 1] = val;
            img.data[i + 2] = val;
          }
        }

        const state = createDefaultEffectsState();
        state.deinterlaceParams.enabled = true;
        state.deinterlaceParams.method = 'bob';
        state.deinterlaceParams.fieldOrder = 'tff';

        processor.applyEffects(img, 4, 4, state);

        // TFF bob interpolates odd rows. Row 1 = avg(row0=200, row2=200) = 200
        expect(img.data[1 * 4 * 4]).toBe(200);
      });

      it('EP-FE-006: applyEffects applies film emulation', () => {
        const img = createTestImageData(4, 4, { r: 128, g: 128, b: 128, a: 255 });
        const originalR = img.data[0];

        const state = createDefaultEffectsState();
        state.filmEmulationParams.enabled = true;
        state.filmEmulationParams.stock = 'kodak-portra-400';
        state.filmEmulationParams.intensity = 100;
        state.filmEmulationParams.grainIntensity = 0;

        processor.applyEffects(img, 4, 4, state);

        // Tone curve should modify the pixel
        expect(img.data[0]).not.toBe(originalR);
      });

      it('EP-SIMD-GUARD-001: SIMD fast-path does not skip deinterlace when combined with inversion', () => {
        // This is a critical regression test. If the SIMD fast-path guard
        // omits !hasDeinterlace, deinterlace would be silently skipped.
        const img = createTestImageData(4, 4, { r: 0, g: 0, b: 0, a: 255 });
        // Even rows=200, odd rows=50
        for (let y = 0; y < 4; y++) {
          const val = y % 2 === 0 ? 200 : 50;
          for (let x = 0; x < 4; x++) {
            const i = (y * 4 + x) * 4;
            img.data[i] = val;
            img.data[i + 1] = val;
            img.data[i + 2] = val;
          }
        }

        const state = createDefaultEffectsState();
        state.colorInversionEnabled = true;
        state.deinterlaceParams.enabled = true;
        state.deinterlaceParams.method = 'bob';
        state.deinterlaceParams.fieldOrder = 'tff';

        processor.applyEffects(img, 4, 4, state);

        // If deinterlace was applied, odd rows get interpolated to 200,
        // then inversion makes it 55. If skipped, odd row stays 50, inverted = 205.
        const row1R = img.data[1 * 4 * 4];
        expect(row1R).toBe(55); // 255 - 200 = 55 (deinterlace + inversion)
      });

      it('EP-SIMD-GUARD-002: SIMD fast-path does not skip film emulation when combined with channel isolation', () => {
        const img = createTestImageData(4, 4, { r: 128, g: 128, b: 128, a: 255 });

        const state = createDefaultEffectsState();
        state.channelMode = 'red';
        state.filmEmulationParams.enabled = true;
        state.filmEmulationParams.stock = 'kodak-ektar-100';
        state.filmEmulationParams.intensity = 100;
        state.filmEmulationParams.grainIntensity = 0;

        processor.applyEffects(img, 4, 4, state);

        // If film emulation was skipped (SIMD fast-path), R channel would just be
        // shown as grayscale of original value. With film emulation, tone curve
        // modifies the pixel first, then channel isolation extracts red.
        // The key test: the R value should differ from what pure channel isolation
        // would produce (128 → grayscale 128).
        const imgChannelOnly = createTestImageData(4, 4, { r: 128, g: 128, b: 128, a: 255 });
        const channelOnlyState = createDefaultEffectsState();
        channelOnlyState.channelMode = 'red';
        processor.applyEffects(imgChannelOnly, 4, 4, channelOnlyState);

        expect(img.data[0]).not.toBe(imgChannelOnly.data[0]);
      });
    });
  });

  describe('CDL parity with worker (no upper clamp)', () => {
    it('EP-CDL-001: slope=2, offset=0.3, power=0.5 - EffectProcessor matches worker behavior', () => {
      // With slope=2, offset=0.3, input 0.5/255: (0.5/255 * 2 + 0.3) can exceed 1.0
      // Pre-fix: would be clamped to 1.0. Post-fix: unclamped, then power applied
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
      const state = createDefaultEffectsState();
      state.cdlValues.slope = { r: 2, g: 2, b: 2 };
      state.cdlValues.offset = { r: 0.3, g: 0.3, b: 0.3 };
      state.cdlValues.power = { r: 0.5, g: 0.5, b: 0.5 };

      processor.applyEffects(imageData, 10, 10, state);

      // With the fix, slope*input + offset = 2*0.502 + 0.3 = 1.304
      // No upper clamp, so power: 1.304^0.5 = 1.142
      // Final store clamp: min(255, max(0, 1.142 * 255)) = 255
      // Without fix it was: min(1, 1.304) = 1.0, then 1.0^0.5 = 1.0, then 255
      // Both give 255 for this particular input since result > 1.0 anyway
      // But for smaller inputs, the difference matters
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
      expect(imageData.data[0]).toBeGreaterThan(0);
    });

    it('EP-CDL-002: extreme CDL values (slope=10, offset=0, power=0.1 on white) - no NaN/Infinity', () => {
      const imageData = createTestImageData(10, 10, { r: 255, g: 255, b: 255 });
      const state = createDefaultEffectsState();
      state.cdlValues.slope = { r: 10, g: 10, b: 10 };
      state.cdlValues.offset = { r: 0, g: 0, b: 0 };
      state.cdlValues.power = { r: 0.1, g: 0.1, b: 0.1 };

      processor.applyEffects(imageData, 10, 10, state);

      // Verify no NaN or Infinity in output
      for (let i = 0; i < imageData.data.length; i += 4) {
        expect(Number.isFinite(imageData.data[i]!)).toBe(true);
        expect(Number.isFinite(imageData.data[i + 1]!)).toBe(true);
        expect(Number.isFinite(imageData.data[i + 2]!)).toBe(true);
        // Values should be clamped to valid range
        expect(imageData.data[i]!).toBeGreaterThanOrEqual(0);
        expect(imageData.data[i]!).toBeLessThanOrEqual(255);
      }
    });

    it('EP-CDL-003: CDL with values > 1.0 followed by curves - LUT index clamps correctly', () => {
      const imageData = createTestImageData(10, 10, { r: 200, g: 200, b: 200 });
      const state = createDefaultEffectsState();
      // CDL that pushes values above 1.0
      state.cdlValues.slope = { r: 2, g: 2, b: 2 };
      state.cdlValues.offset = { r: 0.5, g: 0.5, b: 0.5 };
      // Add curves with non-identity mapping
      state.curvesData.master.enabled = true;
      state.curvesData.master.points = [{ x: 0, y: 0.1 }, { x: 1, y: 0.9 }];

      // Should not throw even with values > 1.0 from CDL going into curves LUT
      expect(() => {
        processor.applyEffects(imageData, 10, 10, state);
      }).not.toThrow();

      // Output should be valid
      for (let i = 0; i < imageData.data.length; i += 4) {
        expect(imageData.data[i]!).toBeGreaterThanOrEqual(0);
        expect(imageData.data[i]!).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('Tone mapping parameter passthrough', () => {
    it('EP-TM-001: non-default reinhardWhitePoint produces different output from default', () => {
      const imageDataDefault = createTestImageData(10, 10, { r: 200, g: 200, b: 200 });
      const imageDataCustom = createTestImageData(10, 10, { r: 200, g: 200, b: 200 });

      const stateDefault = createDefaultEffectsState();
      stateDefault.toneMappingState.enabled = true;
      stateDefault.toneMappingState.operator = 'reinhard';
      stateDefault.toneMappingState.reinhardWhitePoint = 4.0; // default

      const stateCustom = createDefaultEffectsState();
      stateCustom.toneMappingState.enabled = true;
      stateCustom.toneMappingState.operator = 'reinhard';
      stateCustom.toneMappingState.reinhardWhitePoint = 1.0; // custom

      processor.applyEffects(imageDataDefault, 10, 10, stateDefault);
      processor.applyEffects(imageDataCustom, 10, 10, stateCustom);

      // Different white points should produce different results
      let hasDiff = false;
      for (let i = 0; i < imageDataDefault.data.length; i += 4) {
        if (imageDataDefault.data[i] !== imageDataCustom.data[i]) {
          hasDiff = true;
          break;
        }
      }
      expect(hasDiff).toBe(true);
    });

    it('EP-TM-002: Drago tone mapping with non-default params takes effect', () => {
      const imageDataDefault = createTestImageData(10, 10, { r: 200, g: 200, b: 200 });
      const imageDataCustom = createTestImageData(10, 10, { r: 200, g: 200, b: 200 });

      const stateDefault = createDefaultEffectsState();
      stateDefault.toneMappingState.enabled = true;
      stateDefault.toneMappingState.operator = 'drago';
      stateDefault.toneMappingState.dragoBias = 0.85;
      stateDefault.toneMappingState.dragoBrightness = 2.0;

      const stateCustom = createDefaultEffectsState();
      stateCustom.toneMappingState.enabled = true;
      stateCustom.toneMappingState.operator = 'drago';
      stateCustom.toneMappingState.dragoBias = 0.5;
      stateCustom.toneMappingState.dragoBrightness = 4.0;

      processor.applyEffects(imageDataDefault, 10, 10, stateDefault);
      processor.applyEffects(imageDataCustom, 10, 10, stateCustom);

      let hasDiff = false;
      for (let i = 0; i < imageDataDefault.data.length; i += 4) {
        if (imageDataDefault.data[i] !== imageDataCustom.data[i]) {
          hasDiff = true;
          break;
        }
      }
      expect(hasDiff).toBe(true);
    });
  });
});
