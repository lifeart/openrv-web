/**
 * OCIOTransform Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  OCIOTransform,
  SRGB_TO_XYZ,
  XYZ_TO_SRGB,
  ACESCG_TO_XYZ,
  XYZ_TO_ACESCG,
  REC709_TO_XYZ,
  XYZ_TO_REC709,
  REC2020_TO_XYZ,
  XYZ_TO_REC2020,
  ADOBERGB_TO_XYZ,
  XYZ_TO_ADOBERGB,
  PROPHOTO_TO_XYZ_D50,
  XYZ_D50_TO_PROPHOTO,
  ARRI_WIDE_GAMUT3_TO_XYZ,
  XYZ_TO_ARRI_WIDE_GAMUT3,
  ARRI_WIDE_GAMUT4_TO_XYZ,
  XYZ_TO_ARRI_WIDE_GAMUT4,
  REDWIDEGAMUT_TO_XYZ,
  XYZ_TO_REDWIDEGAMUT,
  SGAMUT3_TO_XYZ,
  XYZ_TO_SGAMUT3,
  SGAMUT3CINE_TO_XYZ,
  XYZ_TO_SGAMUT3CINE,
  DCIP3_TO_XYZ,
  XYZ_TO_DCIP3,
  D60_TO_D65,
  D65_TO_D60,
  D50_TO_D65,
  D65_TO_D50,
  D55_TO_D65,
  D65_TO_D55,
  A_TO_D65,
  D65_TO_A,
  D65_WHITE,
  chromaticAdaptationMatrix,
  multiplyMatrices,
  multiplyMatrixVector,
  composeMatrices,
  IDENTITY,
  srgbEncode,
  srgbDecode,
  rec709Encode,
  rec709Decode,
  acesToneMap,
  normalizeColorSpaceName,
} from './OCIOTransform';
import type { Matrix3x3, RGB } from './OCIOTransform';
import { createTestImageData } from '../../test/utils';

describe('OCIOTransform', () => {
  describe('Matrix constants', () => {
    it('OCIO-T001: sRGB matrices are inverses', () => {
      // Multiply SRGB_TO_XYZ by XYZ_TO_SRGB should give identity
      const identity = multiplyMatrices(SRGB_TO_XYZ, XYZ_TO_SRGB);
      // Check diagonal elements are close to 1
      expect(identity[0]).toBeCloseTo(1, 4);
      expect(identity[4]).toBeCloseTo(1, 4);
      expect(identity[8]).toBeCloseTo(1, 4);
      // Check off-diagonal elements are close to 0
      expect(identity[1]).toBeCloseTo(0, 4);
      expect(identity[2]).toBeCloseTo(0, 4);
      expect(identity[3]).toBeCloseTo(0, 4);
    });

    it('OCIO-T002: ACEScg matrices are inverses', () => {
      const identity = multiplyMatrices(ACESCG_TO_XYZ, XYZ_TO_ACESCG);
      expect(identity[0]).toBeCloseTo(1, 4);
      expect(identity[4]).toBeCloseTo(1, 4);
      expect(identity[8]).toBeCloseTo(1, 4);
    });

    it('OCIO-T003: Rec.709 matrices are inverses', () => {
      const identity = multiplyMatrices(REC709_TO_XYZ, XYZ_TO_REC709);
      expect(identity[0]).toBeCloseTo(1, 4);
      expect(identity[4]).toBeCloseTo(1, 4);
      expect(identity[8]).toBeCloseTo(1, 4);
    });
  });

  describe('multiplyMatrices', () => {
    it('OCIO-T004: multiplies identity correctly', () => {
      const identity: [number, number, number, number, number, number, number, number, number] = [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ];
      const result = multiplyMatrices(SRGB_TO_XYZ, identity);
      for (let i = 0; i < 9; i++) {
        expect(result[i]!).toBeCloseTo(SRGB_TO_XYZ[i]!, 6);
      }
    });
  });

  describe('multiplyMatrixVector', () => {
    it('OCIO-T005: transforms white correctly', () => {
      // White in sRGB (1,1,1) should give D65 white point in XYZ
      const white: [number, number, number] = [1, 1, 1];
      const xyz = multiplyMatrixVector(SRGB_TO_XYZ, white);
      // D65 white point is approximately (0.95047, 1.0, 1.08883)
      expect(xyz[0]).toBeCloseTo(0.95047, 2);
      expect(xyz[1]).toBeCloseTo(1.0, 2);
      expect(xyz[2]).toBeCloseTo(1.08883, 2);
    });

    it('OCIO-T006: transforms black correctly', () => {
      const black: [number, number, number] = [0, 0, 0];
      const xyz = multiplyMatrixVector(SRGB_TO_XYZ, black);
      expect(xyz[0]).toBeCloseTo(0, 6);
      expect(xyz[1]).toBeCloseTo(0, 6);
      expect(xyz[2]).toBeCloseTo(0, 6);
    });

    it('OCIO-T007: round-trip preserves color', () => {
      const original: [number, number, number] = [0.5, 0.3, 0.8];
      const xyz = multiplyMatrixVector(SRGB_TO_XYZ, original);
      const result = multiplyMatrixVector(XYZ_TO_SRGB, xyz);
      expect(result[0]).toBeCloseTo(original[0], 5);
      expect(result[1]).toBeCloseTo(original[1], 5);
      expect(result[2]).toBeCloseTo(original[2], 5);
    });
  });

  describe('sRGB transfer functions', () => {
    it('OCIO-T008: srgbDecode handles black', () => {
      expect(srgbDecode(0)).toBe(0);
    });

    it('OCIO-T009: srgbDecode handles white', () => {
      expect(srgbDecode(1)).toBeCloseTo(1, 6);
    });

    it('OCIO-T010: srgbEncode handles black', () => {
      expect(srgbEncode(0)).toBe(0);
    });

    it('OCIO-T011: srgbEncode handles white', () => {
      expect(srgbEncode(1)).toBeCloseTo(1, 6);
    });

    it('OCIO-T012: sRGB round-trip preserves values', () => {
      const testValues = [0, 0.01, 0.1, 0.18, 0.5, 0.9, 1];
      for (const v of testValues) {
        const encoded = srgbEncode(srgbDecode(v));
        expect(encoded).toBeCloseTo(v, 5);
      }
    });

    it('OCIO-T013: srgbDecode applies gamma > 1 to midtones', () => {
      // Linear is darker than sRGB, so decoded value should be less
      const srgbMid = 0.5;
      const linear = srgbDecode(srgbMid);
      expect(linear).toBeLessThan(srgbMid);
    });

    it('OCIO-T014: srgbEncode applies gamma < 1 to midtones', () => {
      // sRGB is brighter than linear, so encoded value should be more
      const linearMid = 0.18; // 18% gray
      const srgbVal = srgbEncode(linearMid);
      expect(srgbVal).toBeGreaterThan(linearMid);
    });
  });

  describe('Rec.709 transfer functions', () => {
    it('OCIO-T015: rec709Decode handles extremes', () => {
      expect(rec709Decode(0)).toBe(0);
      expect(rec709Decode(1)).toBeCloseTo(1, 6);
    });

    it('OCIO-T016: rec709Encode handles extremes', () => {
      expect(rec709Encode(0)).toBe(0);
      expect(rec709Encode(1)).toBeCloseTo(1, 6);
    });

    it('OCIO-T017: Rec.709 round-trip preserves values', () => {
      const testValues = [0, 0.01, 0.1, 0.5, 0.9, 1];
      for (const v of testValues) {
        const encoded = rec709Encode(rec709Decode(v));
        expect(encoded).toBeCloseTo(v, 5);
      }
    });
  });

  describe('acesToneMap', () => {
    it('OCIO-T018: passes black unchanged', () => {
      expect(acesToneMap(0)).toBe(0);
    });

    it('OCIO-T019: maps mid-gray reasonably', () => {
      // 0.18 linear should map to something visible
      const result = acesToneMap(0.18);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('OCIO-T020: compresses highlights', () => {
      // Values > 1 should compress towards 1
      const bright = acesToneMap(2);
      expect(bright).toBeLessThan(2);
      expect(bright).toBeGreaterThan(0.5);
    });

    it('OCIO-T021: handles very bright values', () => {
      const veryBright = acesToneMap(10);
      // Very bright values should be clamped or compressed to near 1
      expect(veryBright).toBeLessThanOrEqual(1);
      expect(veryBright).toBeGreaterThan(0.8);
    });

    it('OCIO-T022: is monotonic', () => {
      // Brighter input should produce brighter output
      let prev = 0;
      for (let i = 0; i <= 10; i += 0.5) {
        const curr = acesToneMap(i);
        expect(curr).toBeGreaterThanOrEqual(prev);
        prev = curr;
      }
    });
  });

  describe('OCIOTransform class', () => {
    it('OCIO-T023: creates transform for same color space (identity)', () => {
      const transform = new OCIOTransform('sRGB', 'sRGB');
      // Identity should preserve color
      const result = transform.apply(0.5, 0.5, 0.5);
      expect(result[0]).toBeCloseTo(0.5, 2);
      expect(result[1]).toBeCloseTo(0.5, 2);
      expect(result[2]).toBeCloseTo(0.5, 2);
    });

    it('OCIO-T024: transforms ACEScg to sRGB', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      // ACEScg 18% gray should map to something visible
      const result = transform.apply(0.18, 0.18, 0.18);
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(1);
      // Should be roughly neutral
      expect(result[0]).toBeCloseTo(result[1], 1);
      expect(result[1]).toBeCloseTo(result[2], 1);
    });

    it('OCIO-T025: transforms sRGB to ACEScg', () => {
      const transform = new OCIOTransform('sRGB', 'ACEScg');
      const result = transform.apply(0.5, 0.5, 0.5);
      // Linear values should be darker than sRGB
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(0.5);
    });

    it('OCIO-T026: handles ARRI LogC3 input', () => {
      const transform = new OCIOTransform('ARRI LogC3 (EI 800)', 'sRGB');
      // LogC 18% gray equivalent (~0.39)
      const result = transform.apply(0.39, 0.39, 0.39);
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(1);
    });

    it('OCIO-T027: clamps output to valid range', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      // Very bright values should clamp
      const result = transform.apply(10, 10, 10);
      expect(result[0]).toBeLessThanOrEqual(1);
      expect(result[1]).toBeLessThanOrEqual(1);
      expect(result[2]).toBeLessThanOrEqual(1);
    });

    it('OCIO-T028: preserves black point', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      const result = transform.apply(0, 0, 0);
      expect(result[0]).toBeCloseTo(0, 4);
      expect(result[1]).toBeCloseTo(0, 4);
      expect(result[2]).toBeCloseTo(0, 4);
    });
  });

  describe('applyToImageData', () => {
    it('OCIO-T029: transforms all pixels', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
      const originalR = imageData.data[0];

      transform.applyToImageData(imageData);

      // Should have changed
      expect(imageData.data[0]).not.toBe(originalR);
    });

    it('OCIO-T030: preserves alpha channel', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 200 });

      transform.applyToImageData(imageData);

      // Alpha should be unchanged
      expect(imageData.data[3]).toBe(200);
    });

    it('OCIO-T031: identity transform preserves image', () => {
      const transform = new OCIOTransform('sRGB', 'sRGB');
      const imageData = createTestImageData(10, 10, { r: 128, g: 100, b: 200 });

      transform.applyToImageData(imageData);

      // Should be close to original (small rounding differences possible)
      expect(Math.abs(imageData.data[0]! - 128)).toBeLessThan(2);
      expect(Math.abs(imageData.data[1]! - 100)).toBeLessThan(2);
      expect(Math.abs(imageData.data[2]! - 200)).toBeLessThan(2);
    });
  });

  describe('createDisplayTransform', () => {
    it('OCIO-T032: creates valid transform', () => {
      const transform = OCIOTransform.createDisplayTransform(
        'ACEScg',
        'ACEScg',
        'sRGB',
        'ACES 1.0 SDR-video'
      );
      expect(transform).toBeInstanceOf(OCIOTransform);
    });

    it('OCIO-T033: applies to colors correctly', () => {
      const transform = OCIOTransform.createDisplayTransform(
        'ACEScg',
        'ACEScg',
        'sRGB',
        'ACES 1.0 SDR-video'
      );
      const result = transform.apply(0.18, 0.18, 0.18);
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(1);
    });
  });

  describe('createWithLook', () => {
    it('OCIO-T034: creates transform without look', () => {
      const transform = OCIOTransform.createWithLook(
        'ACEScg',
        'sRGB',
        'Standard',
        'None',
        'forward'
      );
      expect(transform).toBeInstanceOf(OCIOTransform);
    });

    it('OCIO-T035: creates transform with look name', () => {
      const transform = OCIOTransform.createWithLook(
        'ACEScg',
        'sRGB',
        'Standard',
        'Filmic',
        'forward'
      );
      expect(transform).toBeInstanceOf(OCIOTransform);
    });
  });

  describe('normalizeColorSpaceName', () => {
    it('OCIO-T036: removes parenthetical info', () => {
      expect(normalizeColorSpaceName('ARRI LogC3 (EI 800)')).toBe('ARRI LogC3');
    });

    it('OCIO-T037: trims whitespace', () => {
      expect(normalizeColorSpaceName('  sRGB  ')).toBe('sRGB');
    });

    it('OCIO-T038: normalizes multiple spaces', () => {
      expect(normalizeColorSpaceName('Linear  sRGB')).toBe('Linear sRGB');
    });

    it('OCIO-T039: handles simple names', () => {
      expect(normalizeColorSpaceName('sRGB')).toBe('sRGB');
      expect(normalizeColorSpaceName('ACEScg')).toBe('ACEScg');
    });
  });

  // =========================================================================
  // Edge Case Tests - NaN, Infinity, and Out-of-Gamut Values
  // =========================================================================

  describe('Edge cases: NaN and Infinity handling', () => {
    describe('sRGB transfer functions with special values', () => {
      it('OCIO-T040: srgbEncode handles NaN', () => {
        expect(srgbEncode(NaN)).toBe(0);
      });

      it('OCIO-T041: srgbEncode handles positive Infinity', () => {
        expect(srgbEncode(Infinity)).toBe(1);
      });

      it('OCIO-T042: srgbEncode handles negative Infinity', () => {
        expect(srgbEncode(-Infinity)).toBe(0);
      });

      it('OCIO-T043: srgbDecode handles NaN', () => {
        expect(srgbDecode(NaN)).toBe(0);
      });

      it('OCIO-T044: srgbDecode handles positive Infinity', () => {
        expect(srgbDecode(Infinity)).toBe(1);
      });

      it('OCIO-T045: srgbDecode handles negative Infinity', () => {
        expect(srgbDecode(-Infinity)).toBe(0);
      });
    });

    describe('Rec.709 transfer functions with special values', () => {
      it('OCIO-T046: rec709Encode handles NaN', () => {
        expect(rec709Encode(NaN)).toBe(0);
      });

      it('OCIO-T047: rec709Encode handles positive Infinity', () => {
        expect(rec709Encode(Infinity)).toBe(1);
      });

      it('OCIO-T048: rec709Encode handles negative Infinity', () => {
        expect(rec709Encode(-Infinity)).toBe(0);
      });

      it('OCIO-T049: rec709Decode handles NaN', () => {
        expect(rec709Decode(NaN)).toBe(0);
      });

      it('OCIO-T050: rec709Decode handles positive Infinity', () => {
        expect(rec709Decode(Infinity)).toBe(1);
      });

      it('OCIO-T051: rec709Decode handles negative Infinity', () => {
        expect(rec709Decode(-Infinity)).toBe(0);
      });
    });

    describe('ACES tone map with special values', () => {
      it('OCIO-T052: acesToneMap handles NaN', () => {
        expect(acesToneMap(NaN)).toBe(0);
      });

      it('OCIO-T053: acesToneMap handles positive Infinity', () => {
        expect(acesToneMap(Infinity)).toBe(1);
      });

      it('OCIO-T054: acesToneMap handles negative Infinity', () => {
        expect(acesToneMap(-Infinity)).toBe(0);
      });

      it('OCIO-T055: acesToneMap handles negative values', () => {
        expect(acesToneMap(-0.5)).toBe(0);
        expect(acesToneMap(-1)).toBe(0);
      });
    });

    describe('OCIOTransform with special input values', () => {
      it('OCIO-T056: handles NaN input values', () => {
        const transform = new OCIOTransform('ACEScg', 'sRGB');
        const result = transform.apply(NaN, 0.5, 0.5);
        // NaN should be sanitized to 0
        expect(Number.isNaN(result[0])).toBe(false);
        expect(Number.isNaN(result[1])).toBe(false);
        expect(Number.isNaN(result[2])).toBe(false);
      });

      it('OCIO-T057: handles Infinity input values', () => {
        const transform = new OCIOTransform('ACEScg', 'sRGB');
        const result = transform.apply(Infinity, 0.5, 0.5);
        // Infinity should be clamped
        expect(Number.isFinite(result[0])).toBe(true);
        expect(Number.isFinite(result[1])).toBe(true);
        expect(Number.isFinite(result[2])).toBe(true);
      });

      it('OCIO-T058: handles negative Infinity input values', () => {
        const transform = new OCIOTransform('ACEScg', 'sRGB');
        const result = transform.apply(-Infinity, 0.5, 0.5);
        expect(Number.isFinite(result[0])).toBe(true);
        expect(Number.isFinite(result[1])).toBe(true);
        expect(Number.isFinite(result[2])).toBe(true);
      });

      it('OCIO-T059: handles all NaN input', () => {
        const transform = new OCIOTransform('sRGB', 'Linear sRGB');
        const result = transform.apply(NaN, NaN, NaN);
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        expect(result[2]).toBe(0);
      });
    });
  });

  describe('Edge cases: Negative and out-of-gamut colors', () => {
    it('OCIO-T060: srgbEncode handles negative values (extended range)', () => {
      const result = srgbEncode(-0.5);
      // Should be negative (mirrored)
      expect(result).toBeLessThan(0);
      // And symmetric: encode(-x) = -encode(x)
      expect(result).toBeCloseTo(-srgbEncode(0.5), 5);
    });

    it('OCIO-T061: srgbDecode handles negative values (extended range)', () => {
      const result = srgbDecode(-0.5);
      expect(result).toBeLessThan(0);
      expect(result).toBeCloseTo(-srgbDecode(0.5), 5);
    });

    it('OCIO-T062: rec709Encode handles negative values (extended range)', () => {
      const result = rec709Encode(-0.5);
      expect(result).toBeLessThan(0);
      expect(result).toBeCloseTo(-rec709Encode(0.5), 5);
    });

    it('OCIO-T063: rec709Decode handles negative values (extended range)', () => {
      const result = rec709Decode(-0.5);
      expect(result).toBeLessThan(0);
      expect(result).toBeCloseTo(-rec709Decode(0.5), 5);
    });

    it('OCIO-T064: sRGB extended range round-trip preserves values', () => {
      const testValues = [-1, -0.5, -0.1, 0.1, 0.5, 1];
      for (const v of testValues) {
        const encoded = srgbEncode(srgbDecode(v));
        expect(encoded).toBeCloseTo(v, 5);
      }
    });

    it('OCIO-T065: transform handles out-of-gamut colors', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      // Very saturated color that may be out of sRGB gamut
      const result = transform.apply(2, -0.5, 0.1);
      // Should not produce NaN or Infinity
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
    });

    it('OCIO-T066: transform clamps to valid range in applyToImageData', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      // Create image with values that will transform to out-of-range
      const imageData = createTestImageData(2, 2, { r: 255, g: 0, b: 0 });
      transform.applyToImageData(imageData);

      // All values should be clamped to 0-255
      for (let i = 0; i < imageData.data.length; i++) {
        expect(imageData.data[i]).toBeGreaterThanOrEqual(0);
        expect(imageData.data[i]).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('Edge cases: Very large and very small values', () => {
    it('OCIO-T067: handles very large positive values', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      const result = transform.apply(1e6, 1e6, 1e6);
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
    });

    it('OCIO-T068: handles very small positive values', () => {
      const transform = new OCIOTransform('ACEScg', 'sRGB');
      const result = transform.apply(1e-10, 1e-10, 1e-10);
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
      // Should be very close to 0
      expect(result[0]).toBeCloseTo(0, 3);
    });

    it('OCIO-T069: handles values at sRGB linear threshold', () => {
      // Test values right at the linear/gamma threshold (0.0031308)
      const nearThreshold = 0.0031308;

      const encoded1 = srgbEncode(nearThreshold - 0.0001);
      const encoded2 = srgbEncode(nearThreshold + 0.0001);

      // Both should be finite and relatively close
      expect(Number.isFinite(encoded1)).toBe(true);
      expect(Number.isFinite(encoded2)).toBe(true);
      expect(Math.abs(encoded1 - encoded2)).toBeLessThan(0.01);
    });

    it('OCIO-T070: handles values at Rec.709 linear threshold', () => {
      // Test values right at the linear/gamma threshold (0.018)
      const nearThreshold = 0.018;

      const encoded1 = rec709Encode(nearThreshold - 0.001);
      const encoded2 = rec709Encode(nearThreshold + 0.001);

      expect(Number.isFinite(encoded1)).toBe(true);
      expect(Number.isFinite(encoded2)).toBe(true);
      expect(Math.abs(encoded1 - encoded2)).toBeLessThan(0.02);
    });
  });

  describe('Edge cases: Empty and degenerate transforms', () => {
    it('OCIO-T071: Raw passthrough preserves all values', () => {
      const transform = new OCIOTransform('Raw', 'sRGB');
      // Raw should pass through unchanged
      const result = transform.apply(0.123, 0.456, 0.789);
      expect(result[0]).toBeCloseTo(0.123, 5);
      expect(result[1]).toBeCloseTo(0.456, 5);
      expect(result[2]).toBeCloseTo(0.789, 5);
    });

    it('OCIO-T072: sRGB to Raw passthrough', () => {
      const transform = new OCIOTransform('sRGB', 'Raw');
      const result = transform.apply(0.5, 0.5, 0.5);
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[1]).toBeCloseTo(0.5, 5);
      expect(result[2]).toBeCloseTo(0.5, 5);
    });

    it('OCIO-T073: Unknown color space results in identity transform', () => {
      // Unknown spaces should just pass through
      const transform = new OCIOTransform('UnknownSpace', 'AnotherUnknown');
      const result = transform.apply(0.3, 0.6, 0.9);
      expect(result[0]).toBeCloseTo(0.3, 5);
      expect(result[1]).toBeCloseTo(0.6, 5);
      expect(result[2]).toBeCloseTo(0.9, 5);
    });
  });

  describe('Matrix math edge cases', () => {
    it('OCIO-T074: multiplyMatrixVector handles zero vector', () => {
      const zero: [number, number, number] = [0, 0, 0];
      const result = multiplyMatrixVector(SRGB_TO_XYZ, zero);
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });

    it('OCIO-T075: multiplyMatrices with identity is idempotent', () => {
      const identity: [number, number, number, number, number, number, number, number, number] = [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ];
      const result1 = multiplyMatrices(identity, identity);
      const result2 = multiplyMatrices(result1, identity);

      for (let i = 0; i < 9; i++) {
        expect(result1[i]).toBeCloseTo(result2[i]!, 10);
      }
    });

    it('OCIO-T076: matrix chain maintains precision', () => {
      // Chain multiple transforms and verify we don't accumulate too much error
      const original: [number, number, number] = [0.5, 0.3, 0.8];

      // sRGB -> XYZ -> sRGB should be identity
      const xyz = multiplyMatrixVector(SRGB_TO_XYZ, original);
      const result = multiplyMatrixVector(XYZ_TO_SRGB, xyz);

      expect(result[0]).toBeCloseTo(original[0], 5);
      expect(result[1]).toBeCloseTo(original[1], 5);
      expect(result[2]).toBeCloseTo(original[2], 5);
    });
  });

  // ===========================================================================
  // CIE XYZ Color Space Matrices - Feature 2 Spec Tests (CSM-001 through CSM-012)
  // ===========================================================================

  describe('CIE XYZ Color Space Matrices (Feature 2)', () => {
    /** Helper: check matrix roundtrip for a color */
    function expectRoundtrip(
      toXYZ: Matrix3x3,
      fromXYZ: Matrix3x3,
      color: RGB,
      tolerance: number = 5
    ) {
      const xyz = multiplyMatrixVector(toXYZ, color);
      const result = multiplyMatrixVector(fromXYZ, xyz);
      expect(result[0]).toBeCloseTo(color[0], tolerance);
      expect(result[1]).toBeCloseTo(color[1], tolerance);
      expect(result[2]).toBeCloseTo(color[2], tolerance);
    }

    /** Helper: check matrix pair are inverses (product is identity) */
    function expectInverse(a: Matrix3x3, b: Matrix3x3, tolerance: number = 4) {
      const identity = multiplyMatrices(a, b);
      expect(identity[0]).toBeCloseTo(1, tolerance);
      expect(identity[4]).toBeCloseTo(1, tolerance);
      expect(identity[8]).toBeCloseTo(1, tolerance);
      expect(identity[1]).toBeCloseTo(0, tolerance);
      expect(identity[2]).toBeCloseTo(0, tolerance);
      expect(identity[3]).toBeCloseTo(0, tolerance);
      expect(identity[5]).toBeCloseTo(0, tolerance);
      expect(identity[6]).toBeCloseTo(0, tolerance);
      expect(identity[7]).toBeCloseTo(0, tolerance);
    }

    describe('CSM-001: sRGB -> XYZ -> sRGB roundtrip', () => {
      it('identity within 1e-6 tolerance for various colors', () => {
        const colors: RGB[] = [
          [0.5, 0.3, 0.8],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [1, 1, 1],
          [0.18, 0.18, 0.18],
        ];
        for (const c of colors) {
          expectRoundtrip(SRGB_TO_XYZ, XYZ_TO_SRGB, c, 5);
        }
      });

      it('matrices are proper inverses', () => {
        expectInverse(SRGB_TO_XYZ, XYZ_TO_SRGB);
      });
    });

    describe('CSM-002: ACEScg -> XYZ -> ACEScg roundtrip', () => {
      it('identity within 1e-6 tolerance', () => {
        const colors: RGB[] = [
          [0.5, 0.3, 0.8],
          [1, 1, 1],
          [0.18, 0.18, 0.18],
        ];
        for (const c of colors) {
          expectRoundtrip(ACESCG_TO_XYZ, XYZ_TO_ACESCG, c, 5);
        }
      });

      it('matrices are proper inverses', () => {
        expectInverse(ACESCG_TO_XYZ, XYZ_TO_ACESCG);
      });
    });

    describe('CSM-003: Rec.2020 -> XYZ -> Rec.2020 roundtrip', () => {
      it('identity within 1e-6 tolerance', () => {
        const colors: RGB[] = [
          [0.5, 0.3, 0.8],
          [1, 1, 1],
          [0.18, 0.18, 0.18],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];
        for (const c of colors) {
          expectRoundtrip(REC2020_TO_XYZ, XYZ_TO_REC2020, c, 5);
        }
      });

      it('matrices are proper inverses', () => {
        expectInverse(REC2020_TO_XYZ, XYZ_TO_REC2020);
      });
    });

    describe('CSM-004: Adobe RGB -> XYZ -> Adobe RGB roundtrip', () => {
      it('identity within 1e-6 tolerance', () => {
        const colors: RGB[] = [
          [0.5, 0.3, 0.8],
          [1, 1, 1],
          [0.18, 0.18, 0.18],
        ];
        for (const c of colors) {
          expectRoundtrip(ADOBERGB_TO_XYZ, XYZ_TO_ADOBERGB, c, 5);
        }
      });

      it('matrices are proper inverses', () => {
        expectInverse(ADOBERGB_TO_XYZ, XYZ_TO_ADOBERGB);
      });
    });

    describe('Additional matrix roundtrip tests', () => {
      it('DCI-P3 -> XYZ -> DCI-P3 roundtrip', () => {
        expectRoundtrip(DCIP3_TO_XYZ, XYZ_TO_DCIP3, [0.5, 0.3, 0.8]);
        expectInverse(DCIP3_TO_XYZ, XYZ_TO_DCIP3);
      });

      it('ProPhoto RGB -> XYZ (D50) -> ProPhoto RGB roundtrip', () => {
        expectRoundtrip(PROPHOTO_TO_XYZ_D50, XYZ_D50_TO_PROPHOTO, [0.5, 0.3, 0.8]);
        expectInverse(PROPHOTO_TO_XYZ_D50, XYZ_D50_TO_PROPHOTO);
      });

      it('ARRI Wide Gamut 3 -> XYZ -> ARRI Wide Gamut 3 roundtrip', () => {
        expectRoundtrip(ARRI_WIDE_GAMUT3_TO_XYZ, XYZ_TO_ARRI_WIDE_GAMUT3, [0.5, 0.3, 0.8]);
        expectInverse(ARRI_WIDE_GAMUT3_TO_XYZ, XYZ_TO_ARRI_WIDE_GAMUT3, 3);
      });

      it('ARRI Wide Gamut 4 -> XYZ -> ARRI Wide Gamut 4 roundtrip', () => {
        expectRoundtrip(ARRI_WIDE_GAMUT4_TO_XYZ, XYZ_TO_ARRI_WIDE_GAMUT4, [0.5, 0.3, 0.8]);
        expectInverse(ARRI_WIDE_GAMUT4_TO_XYZ, XYZ_TO_ARRI_WIDE_GAMUT4, 3);
      });

      it('REDWideGamutRGB -> XYZ -> REDWideGamutRGB roundtrip', () => {
        expectRoundtrip(REDWIDEGAMUT_TO_XYZ, XYZ_TO_REDWIDEGAMUT, [0.5, 0.3, 0.8]);
        expectInverse(REDWIDEGAMUT_TO_XYZ, XYZ_TO_REDWIDEGAMUT, 3);
      });

      it('S-Gamut3 -> XYZ -> S-Gamut3 roundtrip', () => {
        expectRoundtrip(SGAMUT3_TO_XYZ, XYZ_TO_SGAMUT3, [0.5, 0.3, 0.8]);
        expectInverse(SGAMUT3_TO_XYZ, XYZ_TO_SGAMUT3, 3);
      });

      it('S-Gamut3.Cine -> XYZ -> S-Gamut3.Cine roundtrip', () => {
        expectRoundtrip(SGAMUT3CINE_TO_XYZ, XYZ_TO_SGAMUT3CINE, [0.5, 0.3, 0.8]);
        expectInverse(SGAMUT3CINE_TO_XYZ, XYZ_TO_SGAMUT3CINE, 3);
      });
    });

    describe('CSM-005: D60 -> D65 -> D60 adaptation roundtrip', () => {
      it('identity within 1e-5 tolerance', () => {
        const original: RGB = [0.5, 0.3, 0.8];
        const adapted = multiplyMatrixVector(D60_TO_D65, original);
        const result = multiplyMatrixVector(D65_TO_D60, adapted);
        expect(result[0]).toBeCloseTo(original[0], 4);
        expect(result[1]).toBeCloseTo(original[1], 4);
        expect(result[2]).toBeCloseTo(original[2], 4);
      });

      it('D50 -> D65 -> D50 adaptation roundtrip', () => {
        const original: RGB = [0.5, 0.3, 0.8];
        const adapted = multiplyMatrixVector(D50_TO_D65, original);
        const result = multiplyMatrixVector(D65_TO_D50, adapted);
        expect(result[0]).toBeCloseTo(original[0], 4);
        expect(result[1]).toBeCloseTo(original[1], 4);
        expect(result[2]).toBeCloseTo(original[2], 4);
      });

      it('D55 -> D65 -> D55 adaptation roundtrip', () => {
        const original: RGB = [0.5, 0.3, 0.8];
        const adapted = multiplyMatrixVector(D55_TO_D65, original);
        const result = multiplyMatrixVector(D65_TO_D55, adapted);
        expect(result[0]).toBeCloseTo(original[0], 4);
        expect(result[1]).toBeCloseTo(original[1], 4);
        expect(result[2]).toBeCloseTo(original[2], 4);
      });

      it('A -> D65 -> A adaptation roundtrip', () => {
        const original: RGB = [0.5, 0.3, 0.8];
        const adapted = multiplyMatrixVector(A_TO_D65, original);
        const result = multiplyMatrixVector(D65_TO_A, adapted);
        expect(result[0]).toBeCloseTo(original[0], 4);
        expect(result[1]).toBeCloseTo(original[1], 4);
        expect(result[2]).toBeCloseTo(original[2], 4);
      });

      it('Von Kries adaptation roundtrip', () => {
        const original: RGB = [0.5, 0.3, 0.8];
        const vkD60D65 = chromaticAdaptationMatrix([0.95265, 1.0, 1.00883], [0.95047, 1.0, 1.08883], 'vonKries');
        const vkD65D60 = chromaticAdaptationMatrix([0.95047, 1.0, 1.08883], [0.95265, 1.0, 1.00883], 'vonKries');
        const adapted = multiplyMatrixVector(vkD60D65, original);
        const result = multiplyMatrixVector(vkD65D60, adapted);
        expect(result[0]).toBeCloseTo(original[0], 4);
        expect(result[1]).toBeCloseTo(original[1], 4);
        expect(result[2]).toBeCloseTo(original[2], 4);
      });
    });

    describe('CSM-006: sRGB encode/decode roundtrip', () => {
      it('identity within 1e-6 tolerance', () => {
        const testValues = [0, 0.001, 0.01, 0.1, 0.18, 0.5, 0.9, 1.0];
        for (const v of testValues) {
          const encoded = srgbEncode(v);
          const decoded = srgbDecode(encoded);
          expect(decoded).toBeCloseTo(v, 5);
        }
      });
    });

    describe('CSM-010: Matrix composition produces same result as sequential', () => {
      it('within 1e-6 tolerance', () => {
        // Compose sRGB -> XYZ -> Rec.2020 as a single matrix
        const composed = composeMatrices(SRGB_TO_XYZ, XYZ_TO_REC2020);

        // Apply sequentially
        const original: RGB = [0.5, 0.3, 0.8];
        const sequential = multiplyMatrixVector(XYZ_TO_REC2020, multiplyMatrixVector(SRGB_TO_XYZ, original));
        const composedResult = multiplyMatrixVector(composed, original);

        expect(composedResult[0]).toBeCloseTo(sequential[0], 5);
        expect(composedResult[1]).toBeCloseTo(sequential[1], 5);
        expect(composedResult[2]).toBeCloseTo(sequential[2], 5);
      });

      it('compose with identity is identity', () => {
        const composed = composeMatrices(IDENTITY);
        for (let i = 0; i < 9; i++) {
          expect(composed[i]).toBeCloseTo(IDENTITY[i]!, 6);
        }
      });

      it('compose empty returns identity', () => {
        const composed = composeMatrices();
        for (let i = 0; i < 9; i++) {
          expect(composed[i]).toBeCloseTo(IDENTITY[i]!, 6);
        }
      });

      it('compose three matrices matches sequential application', () => {
        // sRGB -> XYZ (D65) -> D65->D60 -> ACEScg
        const composed = composeMatrices(SRGB_TO_XYZ, D65_TO_D60, XYZ_TO_ACESCG);

        const original: RGB = [0.5, 0.3, 0.8];
        const step1 = multiplyMatrixVector(SRGB_TO_XYZ, original);
        const step2 = multiplyMatrixVector(D65_TO_D60, step1);
        const sequential = multiplyMatrixVector(XYZ_TO_ACESCG, step2);
        const composedResult = multiplyMatrixVector(composed, original);

        expect(composedResult[0]).toBeCloseTo(sequential[0], 5);
        expect(composedResult[1]).toBeCloseTo(sequential[1], 5);
        expect(composedResult[2]).toBeCloseTo(sequential[2], 5);
      });
    });

    describe('CSM-011: sRGB white point maps to D65 XYZ', () => {
      it('maps [1,1,1] to D65 white point [0.95047, 1.0, 1.08883]', () => {
        const white: RGB = [1, 1, 1];
        const xyz = multiplyMatrixVector(SRGB_TO_XYZ, white);
        expect(xyz[0]).toBeCloseTo(0.95047, 3);
        expect(xyz[1]).toBeCloseTo(1.0, 3);
        expect(xyz[2]).toBeCloseTo(1.08883, 3);
      });
    });

    describe('CSM-012: Known color values through Rec.2020', () => {
      it('Rec.2020 white maps to D65 XYZ white', () => {
        const white: RGB = [1, 1, 1];
        const xyz = multiplyMatrixVector(REC2020_TO_XYZ, white);
        // Should map to D65 white point
        expect(xyz[0]).toBeCloseTo(D65_WHITE[0], 2);
        expect(xyz[1]).toBeCloseTo(1.0, 2);
        expect(xyz[2]).toBeCloseTo(D65_WHITE[2], 2);
      });

      it('Rec.2020 black maps to XYZ origin', () => {
        const black: RGB = [0, 0, 0];
        const xyz = multiplyMatrixVector(REC2020_TO_XYZ, black);
        expect(xyz[0]).toBeCloseTo(0, 6);
        expect(xyz[1]).toBeCloseTo(0, 6);
        expect(xyz[2]).toBeCloseTo(0, 6);
      });

      it('Rec.2020 primary red has expected XYZ', () => {
        const red: RGB = [1, 0, 0];
        const xyz = multiplyMatrixVector(REC2020_TO_XYZ, red);
        // Rec.2020 red primary
        expect(xyz[0]).toBeCloseTo(0.6369580, 4);
        expect(xyz[1]).toBeCloseTo(0.2627002, 4);
        expect(xyz[2]).toBeCloseTo(0.0000000, 4);
      });

      it('Rec.2020 to sRGB transform produces reasonable values', () => {
        const transform = new OCIOTransform('Rec.2020', 'sRGB');
        // 18% gray in Rec.2020 linear -> sRGB should be visible
        const result = transform.apply(0.18, 0.18, 0.18);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
        // Should be roughly neutral
        expect(result[0]).toBeCloseTo(result[1], 1);
        expect(result[1]).toBeCloseTo(result[2], 1);
      });
    });

    describe('New color space transforms via OCIOTransform class', () => {
      it('Adobe RGB to sRGB produces visible result', () => {
        const transform = new OCIOTransform('Adobe RGB', 'sRGB');
        const result = transform.apply(0.5, 0.5, 0.5);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
      });

      it('ProPhoto RGB to sRGB produces visible result', () => {
        const transform = new OCIOTransform('ProPhoto RGB', 'sRGB');
        const result = transform.apply(0.5, 0.5, 0.5);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
      });

      it('ARRI LogC4 to sRGB produces visible result', () => {
        const transform = new OCIOTransform('ARRI LogC4', 'sRGB');
        // LogC4 18% gray encodes to approximately 0.64
        const result = transform.apply(0.64, 0.64, 0.64);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
      });

      it('Sony S-Log3 to sRGB produces visible result', () => {
        const transform = new OCIOTransform('Sony S-Log3', 'sRGB');
        const result = transform.apply(0.41, 0.41, 0.41);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
      });

      it('RED Log3G10 to sRGB produces visible result', () => {
        const transform = new OCIOTransform('RED Log3G10', 'sRGB');
        const result = transform.apply(0.33, 0.33, 0.33);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
      });

      it('DCI-P3 to sRGB applies gamma 2.6 decode before matrix transform', () => {
        const transform = new OCIOTransform('DCI-P3', 'sRGB');
        // A pure gamma 2.6 encoded 50% gray: pow(0.5, 2.6) ~ 0.1649
        // The DCI-P3 -> sRGB path should first decode gamma 2.6, then apply matrix.
        // Input is gamma-encoded DCI-P3 value; output is sRGB-encoded.
        const result = transform.apply(0.5, 0.5, 0.5);
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
        // Result should be roughly neutral (gray in = gray out for DCI-P3/sRGB near-match)
        expect(result[0]).toBeCloseTo(result[1], 1);
        expect(result[1]).toBeCloseTo(result[2], 1);
      });

      it('DCI-P3 to sRGB: white (1,1,1) maps near white', () => {
        const transform = new OCIOTransform('DCI-P3', 'sRGB');
        // pow(1, 2.6) = 1, so gamma decode preserves it
        // DCI-P3 white in linear -> sRGB should be near (1,1,1) after gamut clip
        const result = transform.apply(1, 1, 1);
        expect(result[0]).toBeCloseTo(1, 1);
        expect(result[1]).toBeCloseTo(1, 1);
        expect(result[2]).toBeCloseTo(1, 1);
      });

      it('DCI-P3 to sRGB: black (0,0,0) maps to black', () => {
        const transform = new OCIOTransform('DCI-P3', 'sRGB');
        const result = transform.apply(0, 0, 0);
        expect(result[0]).toBeCloseTo(0, 5);
        expect(result[1]).toBeCloseTo(0, 5);
        expect(result[2]).toBeCloseTo(0, 5);
      });

      it('DCI-P3 to sRGB: gamma 2.6 linearization is applied (midtone check)', () => {
        const transform = new OCIOTransform('DCI-P3', 'sRGB');
        // 0.5 gamma-encoded -> pow(0.5, 2.6) = ~0.1649 linear
        // After DCI-P3 -> sRGB matrix (gamuts are close) and sRGB encode,
        // the result should be darker than 0.5 since gamma 2.6 linearize is applied
        const result = transform.apply(0.5, 0.5, 0.5);
        // pow(0.1649, 1/2.4) * 1.055 - 0.055 ~ 0.45  (sRGB encode of ~0.165 linear)
        // The result should be noticeably less than 0.5
        expect(result[0]).toBeLessThan(0.5);
        expect(result[1]).toBeLessThan(0.5);
        expect(result[2]).toBeLessThan(0.5);
      });
    });
  });

  // ==========================================================================
  // Look Transform Tests (v2)
  // ==========================================================================

  describe('Look transforms', () => {
    it('OCIO-V2-T001: createWithLook with None is same as basic transform', () => {
      const basic = new OCIOTransform('ACEScg', 'sRGB');
      const withNone = OCIOTransform.createWithLook('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'None', 'forward');

      const basicResult = basic.apply(0.18, 0.18, 0.18);
      const noneResult = withNone.apply(0.18, 0.18, 0.18);

      expect(noneResult[0]).toBeCloseTo(basicResult[0], 5);
      expect(noneResult[1]).toBeCloseTo(basicResult[1], 5);
      expect(noneResult[2]).toBeCloseTo(basicResult[2], 5);
    });

    it('OCIO-V2-T002: createWithLook with ACES 1.0 is same as basic transform', () => {
      const basic = new OCIOTransform('ACEScg', 'sRGB');
      const withAces = OCIOTransform.createWithLook('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'ACES 1.0', 'forward');

      const basicResult = basic.apply(0.18, 0.18, 0.18);
      const acesResult = withAces.apply(0.18, 0.18, 0.18);

      expect(acesResult[0]).toBeCloseTo(basicResult[0], 5);
      expect(acesResult[1]).toBeCloseTo(basicResult[1], 5);
      expect(acesResult[2]).toBeCloseTo(basicResult[2], 5);
    });

    it('OCIO-V2-T003: createWithLook with Filmic differs from basic transform', () => {
      const basic = new OCIOTransform('ACEScg', 'sRGB');
      const withFilmic = OCIOTransform.createWithLook('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'Filmic', 'forward');

      const basicResult = basic.apply(0.18, 0.18, 0.18);
      const filmicResult = withFilmic.apply(0.18, 0.18, 0.18);

      // Filmic look should produce different results
      expect(filmicResult[0]).not.toBeCloseTo(basicResult[0], 3);
    });

    it('OCIO-V2-T004: Filmic look forward vs inverse differ', () => {
      const forward = OCIOTransform.createWithLook('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'Filmic', 'forward');
      const inverse = OCIOTransform.createWithLook('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'Filmic', 'inverse');

      const fResult = forward.apply(0.5, 0.5, 0.5);
      const iResult = inverse.apply(0.5, 0.5, 0.5);

      expect(fResult[0]).not.toBeCloseTo(iResult[0], 3);
    });

    it('OCIO-V2-T005: Filmic look produces values in valid range', () => {
      const withFilmic = OCIOTransform.createWithLook('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'Filmic', 'forward');

      const result = withFilmic.apply(0.18, 0.18, 0.18);
      expect(result[0]).toBeGreaterThanOrEqual(0);
      expect(result[0]).toBeLessThanOrEqual(1);
      expect(result[1]).toBeGreaterThanOrEqual(0);
      expect(result[1]).toBeLessThanOrEqual(1);
      expect(result[2]).toBeGreaterThanOrEqual(0);
      expect(result[2]).toBeLessThanOrEqual(1);
    });

    it('OCIO-V2-T006: unknown look name acts as passthrough', () => {
      const basic = new OCIOTransform('ACEScg', 'sRGB');
      const withUnknown = OCIOTransform.createWithLook('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'UnknownLook', 'forward');

      const basicResult = basic.apply(0.18, 0.18, 0.18);
      const unknownResult = withUnknown.apply(0.18, 0.18, 0.18);

      expect(unknownResult[0]).toBeCloseTo(basicResult[0], 5);
      expect(unknownResult[1]).toBeCloseTo(basicResult[1], 5);
      expect(unknownResult[2]).toBeCloseTo(basicResult[2], 5);
    });
  });

  // ==========================================================================
  // Display Transform with Working Space (v2)
  // ==========================================================================

  describe('Display transform with working space', () => {
    it('OCIO-V2-T007: createDisplayTransform with working space produces valid output', () => {
      const transform = OCIOTransform.createDisplayTransform(
        'ARRI LogC3 (EI 800)', 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video'
      );

      const result = transform.apply(0.41, 0.41, 0.41);
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
    });

    it('OCIO-V2-T008: createDisplayTransform with look and working space', () => {
      const withLook = OCIOTransform.createDisplayTransform(
        'ARRI LogC3 (EI 800)', 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'Filmic', 'forward'
      );
      const withoutLook = OCIOTransform.createDisplayTransform(
        'ARRI LogC3 (EI 800)', 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video'
      );

      const lookResult = withLook.apply(0.41, 0.41, 0.41);
      const noLookResult = withoutLook.apply(0.41, 0.41, 0.41);

      // With look should differ from without
      expect(lookResult[0]).not.toBeCloseTo(noLookResult[0], 3);
    });

    it('OCIO-V2-T009: identity when input equals display skips working space', () => {
      const transform = OCIOTransform.createDisplayTransform(
        'sRGB', 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video'
      );

      // sRGB -> sRGB should be identity
      const result = transform.apply(0.5, 0.3, 0.8);
      expect(result[0]).toBeCloseTo(0.5, 4);
      expect(result[1]).toBeCloseTo(0.3, 4);
      expect(result[2]).toBeCloseTo(0.8, 4);
    });

    it('OCIO-V2-T010: createDisplayTransform handles black correctly', () => {
      const transform = OCIOTransform.createDisplayTransform(
        'ACEScg', 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video'
      );

      const result = transform.apply(0, 0, 0);
      expect(result[0]).toBeCloseTo(0, 3);
      expect(result[1]).toBeCloseTo(0, 3);
      expect(result[2]).toBeCloseTo(0, 3);
    });
  });
});
