/**
 * LUT Precision Analysis Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  comparePrecision,
  measureLUTAccuracy,
  quantizeTo8Bit,
  quantizeToFloat16,
  measureQuantizationLoss,
  generateTestGradient,
  generateHDRTestGradient,
} from './LUTPrecision';
import type { LUT3D } from './LUTLoader';

/**
 * Create an identity 3D LUT of given size
 */
function createIdentityLUT3D(size: number): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  let idx = 0;
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        data[idx++] = r / (size - 1);
        data[idx++] = g / (size - 1);
        data[idx++] = b / (size - 1);
      }
    }
  }
  return {
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

/**
 * Create a gamma 3D LUT
 */
function createGammaLUT3D(size: number, gamma: number): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  let idx = 0;
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        data[idx++] = Math.pow(r / (size - 1), gamma);
        data[idx++] = Math.pow(g / (size - 1), gamma);
        data[idx++] = Math.pow(b / (size - 1), gamma);
      }
    }
  }
  return {
    title: 'Gamma LUT',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

describe('LUTPrecision', () => {
  describe('comparePrecision', () => {
    it('PREC-001: identical buffers produce zero error', () => {
      const data = new Float32Array([0.5, 0.3, 0.8, 1.0, 0.1, 0.9, 0.4, 1.0]);

      const result = comparePrecision(data, data);

      expect(result.maxError).toBe(0);
      expect(result.meanAbsoluteError).toBe(0);
      expect(result.rmse).toBe(0);
      expect(result.psnr).toBe(Infinity);
      expect(result.sampleCount).toBe(2);
    });

    it('PREC-002: detects known error magnitude', () => {
      const reference = new Float32Array([0.5, 0.5, 0.5, 1.0]);
      const actual = new Float32Array([0.6, 0.4, 0.5, 1.0]);

      const result = comparePrecision(reference, actual);

      expect(result.maxError).toBeCloseTo(0.1, 5);
      expect(result.meanAbsoluteError).toBeCloseTo(0.1 * 2 / 3, 5); // Two channels off by 0.1
      expect(result.sampleCount).toBe(1);
    });

    it('PREC-003: throws on buffer length mismatch', () => {
      const a = new Float32Array(8);
      const b = new Float32Array(12);

      expect(() => comparePrecision(a, b)).toThrow('Buffer length mismatch');
    });

    it('PREC-004: PSNR is finite for non-identical buffers', () => {
      const reference = new Float32Array([0.5, 0.5, 0.5, 1.0]);
      const actual = new Float32Array([0.51, 0.49, 0.5, 1.0]);

      const result = comparePrecision(reference, actual);

      expect(result.psnr).toBeGreaterThan(0);
      expect(isFinite(result.psnr)).toBe(true);
    });

    it('PREC-005: per-channel max errors are tracked independently', () => {
      const reference = new Float32Array([0.5, 0.5, 0.5, 1.0]);
      const actual = new Float32Array([0.7, 0.55, 0.4, 1.0]); // R:0.2, G:0.05, B:0.1

      const result = comparePrecision(reference, actual);

      expect(result.maxErrorPerChannel[0]).toBeCloseTo(0.2, 5);
      expect(result.maxErrorPerChannel[1]).toBeCloseTo(0.05, 5);
      expect(result.maxErrorPerChannel[2]).toBeCloseTo(0.1, 5);
    });

    it('PREC-006: RMSE is computed correctly', () => {
      const reference = new Float32Array([1.0, 0.0, 0.0, 1.0]);
      const actual = new Float32Array([0.0, 0.0, 0.0, 1.0]); // Only R channel has error of 1.0

      const result = comparePrecision(reference, actual);

      // MSE = (1^2 + 0 + 0) / 3 = 1/3
      // RMSE = sqrt(1/3) ~= 0.577
      expect(result.rmse).toBeCloseTo(Math.sqrt(1 / 3), 5);
    });

    it('PREC-007: handles multiple pixels', () => {
      const reference = new Float32Array([
        0.5, 0.5, 0.5, 1.0,
        0.3, 0.3, 0.3, 1.0,
      ]);
      const actual = new Float32Array([
        0.6, 0.5, 0.5, 1.0,
        0.3, 0.4, 0.3, 1.0,
      ]);

      const result = comparePrecision(reference, actual);

      expect(result.sampleCount).toBe(2);
      expect(result.maxError).toBeCloseTo(0.1, 5);
    });
  });

  describe('measureLUTAccuracy', () => {
    it('PREC-010: identity LUT has near-zero error against identity function', () => {
      const lut = createIdentityLUT3D(17);
      const identityFn = (r: number, g: number, b: number): [number, number, number] => [r, g, b];

      const result = measureLUTAccuracy(lut, identityFn, 'tetrahedral', 5);

      expect(result.maxError).toBeLessThan(0.01);
      expect(result.psnr).toBeGreaterThan(40);
    });

    it('PREC-011: gamma LUT has bounded error against gamma function', () => {
      const gamma = 2.2;
      const lut = createGammaLUT3D(17, gamma);
      const gammaFn = (r: number, g: number, b: number): [number, number, number] => [
        Math.pow(r, gamma),
        Math.pow(g, gamma),
        Math.pow(b, gamma),
      ];

      const result = measureLUTAccuracy(lut, gammaFn, 'tetrahedral', 8);

      // With a 17-point LUT, error should be small
      expect(result.maxError).toBeLessThan(0.05);
      expect(result.psnr).toBeGreaterThan(20);
    });

    it('PREC-012: higher LUT resolution gives better accuracy', () => {
      const gamma = 2.2;
      const gammaFn = (r: number, g: number, b: number): [number, number, number] => [
        Math.pow(r, gamma),
        Math.pow(g, gamma),
        Math.pow(b, gamma),
      ];

      const lut4 = createGammaLUT3D(4, gamma);
      const lut17 = createGammaLUT3D(17, gamma);

      const result4 = measureLUTAccuracy(lut4, gammaFn, 'tetrahedral', 5);
      const result17 = measureLUTAccuracy(lut17, gammaFn, 'tetrahedral', 5);

      expect(result17.maxError).toBeLessThan(result4.maxError);
      expect(result17.psnr).toBeGreaterThan(result4.psnr);
    });

    it('PREC-013: trilinear method also works', () => {
      const lut = createIdentityLUT3D(4);
      const identityFn = (r: number, g: number, b: number): [number, number, number] => [r, g, b];

      const result = measureLUTAccuracy(lut, identityFn, 'trilinear', 5);

      expect(result.maxError).toBeLessThan(0.02);
    });
  });

  describe('quantizeTo8Bit', () => {
    it('PREC-020: quantizes values to 1/255 steps', () => {
      const data = new Float32Array([0.5, 0.0, 1.0, 1.0]);
      const result = quantizeTo8Bit(data);

      expect(result[0]).toBeCloseTo(128 / 255, 5);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(1);
      expect(result[3]).toBe(1);
    });

    it('PREC-021: clamps values to [0, 1] range', () => {
      const data = new Float32Array([-0.5, 1.5, 0.5, 1.0]);
      const result = quantizeTo8Bit(data);

      expect(result[0]).toBe(0);
      expect(result[1]).toBe(1);
      expect(result[2]).toBeCloseTo(128 / 255, 5);
    });

    it('PREC-022: quantization introduces measurable error', () => {
      const data = new Float32Array([0.123, 0.456, 0.789, 1.0]);
      const quantized = quantizeTo8Bit(data);

      // Max quantization error for 8-bit is 0.5/255 ~= 0.00196
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(data[i]! - quantized[i]!)).toBeLessThanOrEqual(0.5 / 255 + 1e-10);
      }
    });
  });

  describe('quantizeToFloat16', () => {
    it('PREC-030: preserves exact representable values', () => {
      const data = new Float32Array([0.0, 0.5, 1.0, 1.0]);
      const result = quantizeToFloat16(data);

      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0.5);
      expect(result[2]).toBe(1.0);
    });

    it('PREC-031: preserves values greater than 1.0', () => {
      const data = new Float32Array([2.0, 5.0, 100.0, 1.0]);
      const result = quantizeToFloat16(data);

      expect(result[0]).toBeCloseTo(2.0, 1);
      expect(result[1]).toBeCloseTo(5.0, 1);
      expect(result[2]).toBeCloseTo(100.0, 0);
    });

    it('PREC-032: has better precision than 8-bit', () => {
      const data = new Float32Array([0.123456, 0.654321, 0.999, 1.0]);

      const q8 = quantizeTo8Bit(data);
      const q16 = quantizeToFloat16(data);

      // Float16 should be closer to original than uint8
      const error8 = Math.abs(data[0]! - q8[0]!);
      const error16 = Math.abs(data[0]! - q16[0]!);

      expect(error16).toBeLessThanOrEqual(error8);
    });

    it('PREC-033: handles zero correctly', () => {
      const data = new Float32Array([0.0, 0.0, 0.0, 0.0]);
      const result = quantizeToFloat16(data);

      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });
  });

  describe('measureQuantizationLoss', () => {
    it('PREC-040: float32 has zero error', () => {
      const data = new Float32Array([0.5, 0.3, 0.8, 1.0]);
      const result = measureQuantizationLoss(data);

      expect(result.float32.maxError).toBe(0);
      expect(result.float32.psnr).toBe(Infinity);
    });

    it('PREC-041: uint8 has highest error', () => {
      const data = generateTestGradient(10, 10);
      const result = measureQuantizationLoss(data);

      expect(result.uint8.maxError).toBeGreaterThan(result.float16.maxError);
      expect(result.uint8.psnr).toBeLessThan(result.float16.psnr);
    });

    it('PREC-042: float16 has less error than uint8', () => {
      const data = generateTestGradient(10, 10);
      const result = measureQuantizationLoss(data);

      expect(result.float16.maxError).toBeLessThan(result.uint8.maxError);
    });

    it('PREC-043: uint8 PSNR is in expected range for gradients', () => {
      const data = generateTestGradient(10, 10);
      const result = measureQuantizationLoss(data);

      // 8-bit quantization PSNR should be around 48-52 dB for normalized data
      expect(result.uint8.psnr).toBeGreaterThan(40);
      expect(result.uint8.psnr).toBeLessThan(60);
    });
  });

  describe('generateTestGradient', () => {
    it('PREC-050: creates buffer of correct size', () => {
      const data = generateTestGradient(10, 5);

      expect(data.length).toBe(10 * 5 * 4);
      expect(data).toBeInstanceOf(Float32Array);
    });

    it('PREC-051: values are in [0, 1] range', () => {
      const data = generateTestGradient(10, 10);

      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(1);
      }
    });

    it('PREC-052: R increases horizontally', () => {
      const data = generateTestGradient(10, 5);

      // First row: x=0 should have R=0, x=9 should have R=1
      expect(data[0]).toBeCloseTo(0, 5); // R at (0,0)
      expect(data[9 * 4]).toBeCloseTo(1, 5); // R at (9,0)
    });

    it('PREC-053: G increases vertically', () => {
      const data = generateTestGradient(10, 5);

      // First column: y=0 should have G=0, y=4 should have G=1
      expect(data[1]).toBeCloseTo(0, 5); // G at (0,0)
      expect(data[4 * 10 * 4 + 1]).toBeCloseTo(1, 5); // G at (0,4)
    });

    it('PREC-054: alpha is always 1.0', () => {
      const data = generateTestGradient(10, 10);

      for (let i = 3; i < data.length; i += 4) {
        expect(data[i]).toBe(1.0);
      }
    });
  });

  describe('generateHDRTestGradient', () => {
    it('PREC-060: creates buffer with values exceeding 1.0', () => {
      const data = generateHDRTestGradient(10, 5, 5.0);

      let hasAboveOne = false;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          if (data[i + c]! > 1.0) {
            hasAboveOne = true;
            break;
          }
        }
        if (hasAboveOne) break;
      }

      expect(hasAboveOne).toBe(true);
    });

    it('PREC-061: max value matches parameter', () => {
      const maxValue = 3.0;
      const data = generateHDRTestGradient(10, 5, maxValue);

      let maxFound = 0;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          maxFound = Math.max(maxFound, data[i + c]!);
        }
      }

      expect(maxFound).toBeCloseTo(maxValue, 1);
    });

    it('PREC-062: alpha is always 1.0', () => {
      const data = generateHDRTestGradient(10, 10);

      for (let i = 3; i < data.length; i += 4) {
        expect(data[i]).toBe(1.0);
      }
    });
  });
});
