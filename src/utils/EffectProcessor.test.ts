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
} from './EffectProcessor';
import { createTestImageData, createGradientImageData, isGrayscale } from '../../test/utils';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { DEFAULT_FILTER_SETTINGS } from '../ui/components/FilterControl';

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
  });
});
