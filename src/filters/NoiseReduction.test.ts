/**
 * NoiseReduction Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  applyNoiseReduction,
  isNoiseReductionActive,
  createNoiseReductionParams,
  NoiseReductionParams,
  DEFAULT_NOISE_REDUCTION_PARAMS,
} from './NoiseReduction';

// Helper to create test ImageData
function createTestImageData(width: number, height: number, fill?: number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0] ?? 128;
      data[i + 1] = fill[1] ?? 128;
      data[i + 2] = fill[2] ?? 128;
      data[i + 3] = fill[3] ?? 255;
    }
  }
  return new ImageData(data, width, height);
}

// Helper to create noisy test image
function createNoisyImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.floor(Math.random() * 50) - 25; // ±25 noise
    data[i] = Math.max(0, Math.min(255, 128 + noise));
    data[i + 1] = Math.max(0, Math.min(255, 128 + noise));
    data[i + 2] = Math.max(0, Math.min(255, 128 + noise));
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

// Helper to calculate variance of image data
function calculateVariance(imageData: ImageData): number {
  const data = imageData.data;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Calculate luminance
    const luma = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    sum += luma;
    sumSq += luma * luma;
    count++;
  }

  const mean = sum / count;
  return sumSq / count - mean * mean;
}

describe('NoiseReduction', () => {
  describe('DEFAULT_NOISE_REDUCTION_PARAMS', () => {
    it('NR-U001: should have correct default values', () => {
      expect(DEFAULT_NOISE_REDUCTION_PARAMS.strength).toBe(0);
      expect(DEFAULT_NOISE_REDUCTION_PARAMS.luminanceStrength).toBe(50);
      expect(DEFAULT_NOISE_REDUCTION_PARAMS.chromaStrength).toBe(75);
      expect(DEFAULT_NOISE_REDUCTION_PARAMS.radius).toBe(2);
    });
  });

  describe('isNoiseReductionActive', () => {
    it('NR-U002: should return false when strength is 0', () => {
      const params: NoiseReductionParams = {
        ...DEFAULT_NOISE_REDUCTION_PARAMS,
        strength: 0,
      };
      expect(isNoiseReductionActive(params)).toBe(false);
    });

    it('NR-U003: should return true when strength > 0', () => {
      const params: NoiseReductionParams = {
        ...DEFAULT_NOISE_REDUCTION_PARAMS,
        strength: 50,
      };
      expect(isNoiseReductionActive(params)).toBe(true);
    });

    it('NR-U004: should return true for minimal strength', () => {
      const params: NoiseReductionParams = {
        ...DEFAULT_NOISE_REDUCTION_PARAMS,
        strength: 1,
      };
      expect(isNoiseReductionActive(params)).toBe(true);
    });
  });

  describe('createNoiseReductionParams', () => {
    it('NR-U005: should create params with specified strength', () => {
      const params = createNoiseReductionParams(50);
      expect(params.strength).toBe(50);
    });

    it('NR-U006: should auto-set luminance strength to match', () => {
      const params = createNoiseReductionParams(50);
      expect(params.luminanceStrength).toBe(50);
    });

    it('NR-U007: should auto-set chroma strength to 1.5x', () => {
      const params = createNoiseReductionParams(50);
      expect(params.chromaStrength).toBe(75);
    });

    it('NR-U008: should clamp strength to 0-100', () => {
      expect(createNoiseReductionParams(-10).strength).toBe(0);
      expect(createNoiseReductionParams(150).strength).toBe(100);
    });

    it('NR-U009: should cap chroma strength at 100', () => {
      const params = createNoiseReductionParams(80);
      expect(params.chromaStrength).toBeLessThanOrEqual(100);
    });
  });

  describe('applyNoiseReduction', () => {
    it('NR-U010: should not modify image when strength is 0', () => {
      const imageData = createTestImageData(10, 10, [100, 150, 200, 255]);
      const originalData = new Uint8ClampedArray(imageData.data);

      applyNoiseReduction(imageData, {
        ...DEFAULT_NOISE_REDUCTION_PARAMS,
        strength: 0,
      });

      expect(imageData.data).toEqual(originalData);
    });

    it('NR-U011: should modify image when strength > 0', () => {
      const imageData = createNoisyImageData(10, 10);
      const originalData = new Uint8ClampedArray(imageData.data);

      applyNoiseReduction(imageData, {
        strength: 50,
        luminanceStrength: 50,
        chromaStrength: 75,
        radius: 2,
      });

      // Should be different from original
      let isDifferent = false;
      for (let i = 0; i < imageData.data.length; i++) {
        if (imageData.data[i] !== originalData[i]) {
          isDifferent = true;
          break;
        }
      }
      expect(isDifferent).toBe(true);
    });

    it('NR-U012: should reduce variance in noisy image', () => {
      const imageData = createNoisyImageData(20, 20);
      const varianceBefore = calculateVariance(imageData);

      applyNoiseReduction(imageData, {
        strength: 80,
        luminanceStrength: 80,
        chromaStrength: 80,
        radius: 3,
      });

      const varianceAfter = calculateVariance(imageData);
      expect(varianceAfter).toBeLessThan(varianceBefore);
    });

    it('NR-U013: should preserve alpha channel', () => {
      const imageData = createTestImageData(5, 5, [100, 150, 200, 128]);

      applyNoiseReduction(imageData, {
        strength: 50,
        luminanceStrength: 50,
        chromaStrength: 75,
        radius: 2,
      });

      // Check all alpha values are preserved
      for (let i = 3; i < imageData.data.length; i += 4) {
        expect(imageData.data[i]).toBe(128);
      }
    });

    it('NR-U014: should handle small images', () => {
      const imageData = createTestImageData(2, 2, [128, 128, 128, 255]);

      // Should not throw
      expect(() => {
        applyNoiseReduction(imageData, {
          strength: 50,
          luminanceStrength: 50,
          chromaStrength: 75,
          radius: 2,
        });
      }).not.toThrow();
    });

    it('NR-U015: should handle radius 1', () => {
      const imageData = createNoisyImageData(10, 10);

      expect(() => {
        applyNoiseReduction(imageData, {
          strength: 50,
          luminanceStrength: 50,
          chromaStrength: 75,
          radius: 1,
        });
      }).not.toThrow();
    });

    it('NR-U016: should handle radius 5', () => {
      const imageData = createNoisyImageData(10, 10);

      expect(() => {
        applyNoiseReduction(imageData, {
          strength: 50,
          luminanceStrength: 50,
          chromaStrength: 75,
          radius: 5,
        });
      }).not.toThrow();
    });

    it('NR-U017: should handle uniform color image', () => {
      const imageData = createTestImageData(10, 10, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(imageData.data);

      applyNoiseReduction(imageData, {
        strength: 100,
        luminanceStrength: 100,
        chromaStrength: 100,
        radius: 3,
      });

      // Uniform image should remain largely unchanged (bilateral filter preserves edges)
      let maxDiff = 0;
      for (let i = 0; i < imageData.data.length; i++) {
        const diff = Math.abs(imageData.data[i]! - originalData[i]!);
        maxDiff = Math.max(maxDiff, diff);
      }
      // Should be very close to original (tolerance for floating point)
      expect(maxDiff).toBeLessThan(2);
    });

    it('NR-U018: higher strength should produce more smoothing', () => {
      // Create two identical noisy images with smooth-area noise
      const width = 20;
      const height = 20;
      const data1 = new Uint8ClampedArray(width * height * 4);
      const data2 = new Uint8ClampedArray(width * height * 4);

      // Create a base gray image with subtle noise pattern (simulating sensor noise)
      // Use sine wave pattern for reproducible, smooth-area-appropriate noise
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          // Small noise that varies smoothly (not edge-like)
          const noise = Math.sin(x * 0.5) * 10 + Math.cos(y * 0.7) * 10;
          const base = Math.round(128 + noise);
          data1[i] = data2[i] = base;
          data1[i + 1] = data2[i + 1] = base;
          data1[i + 2] = data2[i + 2] = base;
          data1[i + 3] = data2[i + 3] = 255;
        }
      }

      const imageData1 = new ImageData(data1, width, height);
      const imageData2 = new ImageData(data2, width, height);

      applyNoiseReduction(imageData1, {
        strength: 20,
        luminanceStrength: 20,
        chromaStrength: 30,
        radius: 2,
      });

      applyNoiseReduction(imageData2, {
        strength: 100,
        luminanceStrength: 100,
        chromaStrength: 100,
        radius: 2,
      });

      const variance1After = calculateVariance(imageData1);
      const variance2After = calculateVariance(imageData2);

      // Higher strength should produce lower variance (more smoothing)
      expect(variance2After).toBeLessThanOrEqual(variance1After);
    });
  });
});
