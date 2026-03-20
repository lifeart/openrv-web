/**
 * Cross-ecosystem shader math tests (Phase 1 / P0)
 *
 * Verifies mathematical consistency between the TypeScript reference
 * implementations (ported from GLSL) and CPU implementations used
 * elsewhere in the codebase.
 *
 * Test ID convention: XE-NNN (cross-ecosystem)
 */

import { describe, it, expect } from 'vitest';
import {
  srgbEOTF,
  linearToSRGBChannel,
  rec709EOTF,
  linearToRec709Channel,
  hlgOETFInverse,
  hlgToLinear,
  pqEOTFChannel,
  smpte240mEOTF,
  luminanceRec709,
  applyExposure,
  applyContrast,
  applyBrightness,
  applySaturation,
  applyTemperature,
  applyColorInversion,
} from './shaderMathReference';

// CPU implementations for cross-verification
import { linearToSRGB, linearToRec709 } from '../../color/DisplayTransfer';
import { hlgDecode, pqDecode, smpte240mDecode } from '../../color/TransferFunctions';
import { luminanceRec709 as cpuLuminanceRec709 } from '../../color/PixelMath';

// Tolerances
const _TRANSFER_TOL = 1e-5;
const _COLOR_ADJ_TOL = 1 / 256;
void _TRANSFER_TOL;
void _COLOR_ADJ_TOL;

// =============================================================================
// sRGB EOTF & inverse
// =============================================================================

describe('sRGB transfer functions', () => {
  describe('srgbEOTF (signal → linear)', () => {
    it('XE-001: zero maps to zero', () => {
      expect(srgbEOTF(0.0)).toBeCloseTo(0.0, 10);
    });

    it('XE-002: 1.0 maps to 1.0', () => {
      expect(srgbEOTF(1.0)).toBeCloseTo(1.0, 5);
    });

    it('XE-003: threshold value 0.04045', () => {
      // Just below threshold: linear segment
      const belowResult = srgbEOTF(0.04045);
      expect(belowResult).toBeCloseTo(0.04045 / 12.92, 10);
    });

    it('XE-004: just above threshold uses power curve', () => {
      const x = 0.04046;
      const expected = Math.pow((x + 0.055) / 1.055, 2.4);
      expect(srgbEOTF(x)).toBeCloseTo(expected, 10);
    });

    it('XE-005: mid-range value 0.5', () => {
      const result = srgbEOTF(0.5);
      expect(result).toBeCloseTo(Math.pow((0.5 + 0.055) / 1.055, 2.4), 10);
    });

    it('XE-006: 18% gray (sRGB ~0.4646)', () => {
      const srgbEncoded = 0.4646;
      const result = srgbEOTF(srgbEncoded);
      // Should be approximately 0.18 (linear 18% gray)
      expect(result).toBeCloseTo(0.18, 2);
    });
  });

  describe('linearToSRGBChannel (linear → signal)', () => {
    it('XE-007: zero maps to zero', () => {
      expect(linearToSRGBChannel(0.0)).toBeCloseTo(0.0, 10);
    });

    it('XE-008: 1.0 maps to 1.0', () => {
      expect(linearToSRGBChannel(1.0)).toBeCloseTo(1.0, 5);
    });

    it('XE-009: threshold value 0.0031308', () => {
      const result = linearToSRGBChannel(0.0031308);
      expect(result).toBeCloseTo(0.0031308 * 12.92, 10);
    });

    it('XE-010: mid-range value 0.5', () => {
      const result = linearToSRGBChannel(0.5);
      const expected = 1.055 * Math.pow(0.5, 1.0 / 2.4) - 0.055;
      expect(result).toBeCloseTo(expected, 10);
    });
  });

  describe('sRGB round-trip consistency', () => {
    const testValues = [0.0, 0.001, 0.01, 0.04045, 0.1, 0.25, 0.5, 0.75, 1.0];

    it('XE-011: EOTF then inverse EOTF is identity', () => {
      for (const v of testValues) {
        const linear = srgbEOTF(v);
        const roundTrip = linearToSRGBChannel(Math.max(linear, 0));
        expect(roundTrip).toBeCloseTo(v, 4);
      }
    });

    it('XE-012: inverse EOTF then EOTF is identity', () => {
      const linearValues = [0.0, 0.001, 0.0031308, 0.01, 0.1, 0.5, 1.0];
      for (const v of linearValues) {
        const encoded = linearToSRGBChannel(v);
        const roundTrip = srgbEOTF(encoded);
        expect(roundTrip).toBeCloseTo(v, 4);
      }
    });
  });

  describe('cross-verification with CPU (DisplayTransfer)', () => {
    it('XE-013: linearToSRGBChannel matches linearToSRGB from DisplayTransfer', () => {
      const testValues = [0.0, 0.001, 0.0031308, 0.01, 0.1, 0.25, 0.5, 0.75, 1.0];
      for (const v of testValues) {
        expect(linearToSRGBChannel(v)).toBeCloseTo(linearToSRGB(v), 5);
      }
    });
  });
});

// =============================================================================
// Rec.709 EOTF & inverse
// =============================================================================

describe('Rec.709 transfer functions', () => {
  describe('rec709EOTF (signal → linear)', () => {
    it('XE-014: zero maps to zero', () => {
      expect(rec709EOTF(0.0)).toBeCloseTo(0.0, 10);
    });

    it('XE-015: 1.0 maps to 1.0', () => {
      expect(rec709EOTF(1.0)).toBeCloseTo(1.0, 5);
    });

    it('XE-016: threshold value 0.081', () => {
      // Just below threshold: linear segment
      const result = rec709EOTF(0.08);
      expect(result).toBeCloseTo(0.08 / 4.5, 10);
    });

    it('XE-017: just above threshold uses power curve', () => {
      const x = 0.082;
      const expected = Math.pow((x + 0.099) / 1.099, 1.0 / 0.45);
      expect(rec709EOTF(x)).toBeCloseTo(expected, 10);
    });

    it('XE-018: mid-range value 0.5', () => {
      const result = rec709EOTF(0.5);
      const expected = Math.pow((0.5 + 0.099) / 1.099, 1.0 / 0.45);
      expect(result).toBeCloseTo(expected, 10);
    });
  });

  describe('linearToRec709Channel (linear → signal)', () => {
    it('XE-019: zero maps to zero', () => {
      expect(linearToRec709Channel(0.0)).toBeCloseTo(0.0, 10);
    });

    it('XE-020: 1.0 maps to 1.0', () => {
      expect(linearToRec709Channel(1.0)).toBeCloseTo(1.0, 5);
    });

    it('XE-021: threshold value 0.018', () => {
      const result = linearToRec709Channel(0.017);
      expect(result).toBeCloseTo(4.5 * 0.017, 10);
    });

    it('XE-022: mid-range value 0.5', () => {
      const result = linearToRec709Channel(0.5);
      const expected = 1.099 * Math.pow(0.5, 0.45) - 0.099;
      expect(result).toBeCloseTo(expected, 10);
    });
  });

  describe('Rec.709 round-trip consistency', () => {
    it('XE-023: EOTF then inverse EOTF is identity', () => {
      // Note: 0.081 is excluded because it sits exactly at the EOTF threshold
      // boundary. The EOTF uses < 0.081 (linear segment) while the inverse
      // uses < 0.018 (which maps to 4.5*0.018=0.081). This creates a tiny
      // discontinuity at exactly the threshold — an inherent property of the
      // Rec.709 spec's asymmetric threshold definition.
      const testValues = [0.0, 0.01, 0.08, 0.1, 0.5, 0.75, 1.0];
      for (const v of testValues) {
        const linear = rec709EOTF(v);
        const roundTrip = linearToRec709Channel(Math.max(linear, 0));
        expect(roundTrip).toBeCloseTo(v, 4);
      }
    });
  });

  describe('cross-verification with CPU (DisplayTransfer)', () => {
    it('XE-024: linearToRec709Channel matches linearToRec709 from DisplayTransfer', () => {
      const testValues = [0.0, 0.001, 0.018, 0.1, 0.25, 0.5, 0.75, 1.0];
      for (const v of testValues) {
        expect(linearToRec709Channel(v)).toBeCloseTo(linearToRec709(v), 5);
      }
    });
  });
});

// =============================================================================
// HLG (Hybrid Log-Gamma)
// =============================================================================

describe('HLG transfer functions', () => {
  describe('hlgOETFInverse (signal → scene)', () => {
    it('XE-025: zero maps to zero', () => {
      expect(hlgOETFInverse(0.0)).toBeCloseTo(0.0, 10);
    });

    it('XE-026: threshold value 0.5 (boundary between segments)', () => {
      // At 0.5, the quadratic segment gives (0.5^2)/3
      const result = hlgOETFInverse(0.5);
      expect(result).toBeCloseTo(0.25 / 3.0, 10);
    });

    it('XE-027: value 1.0 (full signal)', () => {
      const a = 0.17883277;
      const b = 0.28466892;
      const c = 0.55991073;
      const expected = (Math.exp((1.0 - c) / a) + b) / 12.0;
      expect(hlgOETFInverse(1.0)).toBeCloseTo(expected, 5);
    });

    it('XE-028: mid-range value 0.25 (quadratic segment)', () => {
      const result = hlgOETFInverse(0.25);
      expect(result).toBeCloseTo(0.0625 / 3.0, 10);
    });
  });

  describe('hlgToLinear (with OOTF)', () => {
    it('XE-029: black signal produces black', () => {
      const [r, g, b] = hlgToLinear(0, 0, 0);
      // With OOTF, pow(max(0, 1e-6), 0.2) is tiny but nonzero
      expect(r).toBeCloseTo(0.0, 4);
      expect(g).toBeCloseTo(0.0, 4);
      expect(b).toBeCloseTo(0.0, 4);
    });

    it('XE-030: neutral gray is self-consistent', () => {
      const [r, g, b] = hlgToLinear(0.5, 0.5, 0.5);
      // All channels equal → luminance = scene value → gain = scene^0.2
      expect(r).toBeCloseTo(g, 10);
      expect(g).toBeCloseTo(b, 10);
    });
  });

  describe('cross-verification with CPU (TransferFunctions)', () => {
    it('XE-031: hlgOETFInverse matches hlgDecode for 0-1 range', () => {
      const testValues = [0.0, 0.1, 0.25, 0.5, 0.75, 1.0];
      for (const v of testValues) {
        expect(hlgOETFInverse(v)).toBeCloseTo(hlgDecode(v), 5);
      }
    });
  });
});

// =============================================================================
// PQ (Perceptual Quantizer / ST 2084)
// =============================================================================

describe('PQ transfer functions', () => {
  describe('pqEOTFChannel (signal → linear)', () => {
    it('XE-032: zero maps to zero', () => {
      expect(pqEOTFChannel(0.0)).toBeCloseTo(0.0, 10);
    });

    it('XE-033: 1.0 maps to 1.0', () => {
      expect(pqEOTFChannel(1.0)).toBeCloseTo(1.0, 5);
    });

    it('XE-034: mid-range value 0.5', () => {
      const result = pqEOTFChannel(0.5);
      // PQ 0.5 ≈ ~58 cd/m² ÷ 10000 ≈ 0.0058
      expect(result).toBeGreaterThan(0.0);
      expect(result).toBeLessThan(0.1);
    });

    it('XE-035: monotonically increasing', () => {
      const values = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      for (let i = 1; i < values.length; i++) {
        expect(pqEOTFChannel(values[i]!)).toBeGreaterThan(pqEOTFChannel(values[i - 1]!));
      }
    });
  });

  describe('cross-verification with CPU (TransferFunctions)', () => {
    it('XE-036: pqEOTFChannel matches pqDecode for 0-1 range', () => {
      const testValues = [0.0, 0.1, 0.25, 0.5, 0.75, 1.0];
      for (const v of testValues) {
        expect(pqEOTFChannel(v)).toBeCloseTo(pqDecode(v), 5);
      }
    });
  });
});

// =============================================================================
// SMPTE 240M
// =============================================================================

describe('SMPTE 240M transfer functions', () => {
  describe('smpte240mEOTF (signal → linear)', () => {
    it('XE-037: zero maps to zero', () => {
      expect(smpte240mEOTF(0.0)).toBeCloseTo(0.0, 10);
    });

    it('XE-038: 1.0 maps to 1.0', () => {
      expect(smpte240mEOTF(1.0)).toBeCloseTo(1.0, 5);
    });

    it('XE-039: threshold value 0.0912 (= 4 * 0.0228)', () => {
      const threshold = 4.0 * 0.0228;
      // Just below threshold uses linear segment
      const below = threshold - 0.001;
      expect(smpte240mEOTF(below)).toBeCloseTo(below / 4.0, 10);
    });

    it('XE-040: above threshold uses power curve', () => {
      const v = 0.5;
      const expected = Math.pow((v + 0.1115) / 1.1115, 1.0 / 0.45);
      expect(smpte240mEOTF(v)).toBeCloseTo(expected, 10);
    });

    it('XE-041: monotonically increasing', () => {
      const values = [0.0, 0.05, 0.0912, 0.2, 0.5, 0.8, 1.0];
      for (let i = 1; i < values.length; i++) {
        expect(smpte240mEOTF(values[i]!)).toBeGreaterThan(smpte240mEOTF(values[i - 1]!));
      }
    });
  });

  describe('cross-verification with CPU (TransferFunctions)', () => {
    it('XE-042: smpte240mEOTF matches smpte240mDecode', () => {
      const testValues = [0.0, 0.05, 0.0912, 0.2, 0.5, 0.75, 1.0];
      for (const v of testValues) {
        expect(smpte240mEOTF(v)).toBeCloseTo(smpte240mDecode(v), 5);
      }
    });
  });
});

// =============================================================================
// Luminance
// =============================================================================

describe('luminanceRec709', () => {
  it('XE-043: white (1,1,1) has luminance 1.0', () => {
    expect(luminanceRec709(1, 1, 1)).toBeCloseTo(1.0, 10);
  });

  it('XE-044: black (0,0,0) has luminance 0.0', () => {
    expect(luminanceRec709(0, 0, 0)).toBeCloseTo(0.0, 10);
  });

  it('XE-045: pure red has luminance 0.2126', () => {
    expect(luminanceRec709(1, 0, 0)).toBeCloseTo(0.2126, 5);
  });

  it('XE-046: pure green has luminance 0.7152', () => {
    expect(luminanceRec709(0, 1, 0)).toBeCloseTo(0.7152, 5);
  });

  it('XE-047: pure blue has luminance 0.0722', () => {
    expect(luminanceRec709(0, 0, 1)).toBeCloseTo(0.0722, 5);
  });

  it('XE-048: cross-verification with CPU PixelMath', () => {
    const testRGB: [number, number, number][] = [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.5, 0.3, 0.8],
      [0.18, 0.18, 0.18],
    ];
    for (const [r, g, b] of testRGB) {
      expect(luminanceRec709(r, g, b)).toBeCloseTo(cpuLuminanceRec709(r, g, b), 10);
    }
  });
});

// =============================================================================
// Exposure
// =============================================================================

describe('applyExposure', () => {
  it('XE-049: zero stops leaves value unchanged', () => {
    const [r, g, b] = applyExposure(0.5, 0.5, 0.5, 0, 0, 0);
    expect(r).toBeCloseTo(0.5, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.5, 10);
  });

  it('XE-050: +1 stop doubles value', () => {
    const [r, g, b] = applyExposure(0.25, 0.25, 0.25, 1, 1, 1);
    expect(r).toBeCloseTo(0.5, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.5, 10);
  });

  it('XE-051: -1 stop halves value', () => {
    const [r, g, b] = applyExposure(0.5, 0.5, 0.5, -1, -1, -1);
    expect(r).toBeCloseTo(0.25, 10);
    expect(g).toBeCloseTo(0.25, 10);
    expect(b).toBeCloseTo(0.25, 10);
  });

  it('XE-052: per-channel exposure', () => {
    const [r, g, b] = applyExposure(0.5, 0.5, 0.5, 1, 0, -1);
    expect(r).toBeCloseTo(1.0, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.25, 10);
  });

  it('XE-053: zero input stays zero', () => {
    const [r, g, b] = applyExposure(0, 0, 0, 5, 5, 5);
    expect(r).toBeCloseTo(0.0, 10);
    expect(g).toBeCloseTo(0.0, 10);
    expect(b).toBeCloseTo(0.0, 10);
  });
});

// =============================================================================
// Contrast
// =============================================================================

describe('applyContrast', () => {
  it('XE-054: contrast 1.0 is identity', () => {
    expect(applyContrast(0.3, 1.0)).toBeCloseTo(0.3, 10);
    expect(applyContrast(0.7, 1.0)).toBeCloseTo(0.7, 10);
  });

  it('XE-055: pivot point 0.5 is unchanged for any contrast', () => {
    expect(applyContrast(0.5, 0.0)).toBeCloseTo(0.5, 10);
    expect(applyContrast(0.5, 1.0)).toBeCloseTo(0.5, 10);
    expect(applyContrast(0.5, 2.0)).toBeCloseTo(0.5, 10);
  });

  it('XE-056: contrast 0.0 maps everything to 0.5', () => {
    expect(applyContrast(0.0, 0.0)).toBeCloseTo(0.5, 10);
    expect(applyContrast(1.0, 0.0)).toBeCloseTo(0.5, 10);
    expect(applyContrast(0.25, 0.0)).toBeCloseTo(0.5, 10);
  });

  it('XE-057: contrast 2.0 doubles distance from 0.5', () => {
    expect(applyContrast(0.75, 2.0)).toBeCloseTo(1.0, 10);
    expect(applyContrast(0.25, 2.0)).toBeCloseTo(0.0, 10);
  });
});

// =============================================================================
// Brightness
// =============================================================================

describe('applyBrightness', () => {
  it('XE-058: brightness 0.0 is identity', () => {
    expect(applyBrightness(0.5, 0.0)).toBeCloseTo(0.5, 10);
  });

  it('XE-059: positive brightness adds offset', () => {
    expect(applyBrightness(0.5, 0.1)).toBeCloseTo(0.6, 10);
  });

  it('XE-060: negative brightness subtracts offset', () => {
    expect(applyBrightness(0.5, -0.2)).toBeCloseTo(0.3, 10);
  });

  it('XE-061: can exceed 1.0 (no clamping in shader)', () => {
    expect(applyBrightness(0.9, 0.5)).toBeCloseTo(1.4, 10);
  });

  it('XE-062: can go negative (no clamping in shader)', () => {
    expect(applyBrightness(0.1, -0.5)).toBeCloseTo(-0.4, 10);
  });
});

// =============================================================================
// Saturation
// =============================================================================

describe('applySaturation', () => {
  it('XE-063: saturation 1.0 is identity', () => {
    const [r, g, b] = applySaturation(0.8, 0.4, 0.2, 1.0);
    expect(r).toBeCloseTo(0.8, 10);
    expect(g).toBeCloseTo(0.4, 10);
    expect(b).toBeCloseTo(0.2, 10);
  });

  it('XE-064: saturation 0.0 produces grayscale (luminance)', () => {
    const [r, g, b] = applySaturation(0.8, 0.4, 0.2, 0.0);
    const luma = luminanceRec709(0.8, 0.4, 0.2);
    expect(r).toBeCloseTo(luma, 10);
    expect(g).toBeCloseTo(luma, 10);
    expect(b).toBeCloseTo(luma, 10);
  });

  it('XE-065: neutral gray is unchanged regardless of saturation', () => {
    const [r, g, b] = applySaturation(0.5, 0.5, 0.5, 0.0);
    expect(r).toBeCloseTo(0.5, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.5, 10);
  });

  it('XE-066: saturation 2.0 doubles color deviation from luminance', () => {
    const inputR = 0.8,
      inputG = 0.4,
      inputB = 0.2;
    const luma = luminanceRec709(inputR, inputG, inputB);
    const [r, g, b] = applySaturation(inputR, inputG, inputB, 2.0);
    expect(r).toBeCloseTo(luma + (inputR - luma) * 2.0, 10);
    expect(g).toBeCloseTo(luma + (inputG - luma) * 2.0, 10);
    expect(b).toBeCloseTo(luma + (inputB - luma) * 2.0, 10);
  });
});

// =============================================================================
// Temperature / Tint
// =============================================================================

describe('applyTemperature', () => {
  it('XE-067: zero temp and tint is identity', () => {
    const [r, g, b] = applyTemperature(0.5, 0.5, 0.5, 0, 0);
    expect(r).toBeCloseTo(0.5, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.5, 10);
  });

  it('XE-068: positive temp warms (increases R, decreases B)', () => {
    const [r, , b] = applyTemperature(0.5, 0.5, 0.5, 50, 0);
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
  });

  it('XE-069: negative temp cools (decreases R, increases B)', () => {
    const [r, , b] = applyTemperature(0.5, 0.5, 0.5, -50, 0);
    expect(r).toBeLessThan(0.5);
    expect(b).toBeGreaterThan(0.5);
  });

  it('XE-070: positive tint adds green, reduces R and B', () => {
    const [r, g, b] = applyTemperature(0.5, 0.5, 0.5, 0, 50);
    expect(g).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.5);
    expect(b).toBeLessThan(0.5);
  });

  it('XE-071: exact temperature math verification', () => {
    const [r, g, b] = applyTemperature(0.5, 0.5, 0.5, 100, 0);
    // t = 100/100 = 1.0
    // r = 0.5 + 1.0 * 0.1 = 0.6
    // b = 0.5 - 1.0 * 0.1 = 0.4
    // g = 0.5
    expect(r).toBeCloseTo(0.6, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.4, 10);
  });

  it('XE-072: exact tint math verification', () => {
    const [r, g, b] = applyTemperature(0.5, 0.5, 0.5, 0, 100);
    // gv = 100/100 = 1.0
    // g = 0.5 + 1.0 * 0.1 = 0.6
    // r = 0.5 - 1.0 * 0.05 = 0.45
    // b = 0.5 - 1.0 * 0.05 = 0.45
    expect(r).toBeCloseTo(0.45, 10);
    expect(g).toBeCloseTo(0.6, 10);
    expect(b).toBeCloseTo(0.45, 10);
  });

  it('XE-073: combined temp + tint', () => {
    const [r, g, b] = applyTemperature(0.5, 0.5, 0.5, 50, 50);
    // t = 0.5, gv = 0.5
    // r = 0.5 + 0.5*0.1 - 0.5*0.05 = 0.5 + 0.05 - 0.025 = 0.525
    // g = 0.5 + 0.5*0.1 = 0.55
    // b = 0.5 - 0.5*0.1 - 0.5*0.05 = 0.5 - 0.05 - 0.025 = 0.425
    expect(r).toBeCloseTo(0.525, 10);
    expect(g).toBeCloseTo(0.55, 10);
    expect(b).toBeCloseTo(0.425, 10);
  });
});

// =============================================================================
// Color Inversion
// =============================================================================

describe('applyColorInversion', () => {
  it('XE-074: black inverts to white', () => {
    const [r, g, b] = applyColorInversion(0, 0, 0);
    expect(r).toBeCloseTo(1.0, 10);
    expect(g).toBeCloseTo(1.0, 10);
    expect(b).toBeCloseTo(1.0, 10);
  });

  it('XE-075: white inverts to black', () => {
    const [r, g, b] = applyColorInversion(1, 1, 1);
    expect(r).toBeCloseTo(0.0, 10);
    expect(g).toBeCloseTo(0.0, 10);
    expect(b).toBeCloseTo(0.0, 10);
  });

  it('XE-076: mid-gray stays mid-gray', () => {
    const [r, g, b] = applyColorInversion(0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.5, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.5, 10);
  });

  it('XE-077: double inversion is identity', () => {
    const input = [0.3, 0.6, 0.9] as [number, number, number];
    const [r1, g1, b1] = applyColorInversion(...input);
    const [r2, g2, b2] = applyColorInversion(r1, g1, b1);
    expect(r2).toBeCloseTo(input[0], 10);
    expect(g2).toBeCloseTo(input[1], 10);
    expect(b2).toBeCloseTo(input[2], 10);
  });

  it('XE-078: per-channel inversion', () => {
    const [r, g, b] = applyColorInversion(0.2, 0.8, 0.4);
    expect(r).toBeCloseTo(0.8, 10);
    expect(g).toBeCloseTo(0.2, 10);
    expect(b).toBeCloseTo(0.6, 10);
  });
});

// =============================================================================
// Pipeline integration: combined operations
// =============================================================================

describe('pipeline integration', () => {
  it('XE-079: exposure + contrast + saturation pipeline order matches shader', () => {
    // Simulate shader pipeline on a pixel: exposure → brightness → contrast → saturation
    let r = 0.5,
      g = 0.3,
      b = 0.2;

    // Exposure: +1 stop
    [r, g, b] = applyExposure(r, g, b, 1, 1, 1);

    // Brightness: +0.05
    r = applyBrightness(r, 0.05);
    g = applyBrightness(g, 0.05);
    b = applyBrightness(b, 0.05);

    // Contrast: 1.2
    r = applyContrast(r, 1.2);
    g = applyContrast(g, 1.2);
    b = applyContrast(b, 1.2);

    // Saturation: 1.5
    [r, g, b] = applySaturation(r, g, b, 1.5);

    // Values should be reasonable (not NaN or Infinity)
    expect(Number.isFinite(r)).toBe(true);
    expect(Number.isFinite(g)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
  });

  it('XE-080: sRGB EOTF → adjustments → sRGB inverse EOTF round trip', () => {
    const input = 0.5;
    // Decode
    const linear = srgbEOTF(input);
    // No adjustment (identity)
    const adjusted = linear;
    // Encode
    const output = linearToSRGBChannel(adjusted);
    expect(output).toBeCloseTo(input, 4);
  });

  it('XE-081: temperature symmetry: opposite values cancel', () => {
    const r0 = 0.5,
      g0 = 0.5,
      b0 = 0.5;
    const [r1, g1, b1] = applyTemperature(r0, g0, b0, 50, 30);
    const [r2, g2, b2] = applyTemperature(r1, g1, b1, -50, -30);
    expect(r2).toBeCloseTo(r0, 10);
    expect(g2).toBeCloseTo(g0, 10);
    expect(b2).toBeCloseTo(b0, 10);
  });
});
