/**
 * FilmEmulation Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  applyFilmEmulation,
  isFilmEmulationActive,
  getFilmStock,
  getFilmStocks,
  FILM_STOCKS,
  DEFAULT_FILM_EMULATION_PARAMS,
} from './FilmEmulation';

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

// Helper to create a colorful test image (gradient with variation)
function createColorTestImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / (width - 1)) * 255);     // R gradient left-right
      data[i + 1] = Math.round((y / (height - 1)) * 255); // G gradient top-bottom
      data[i + 2] = 128;                                   // B constant
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('FilmEmulation', () => {
  describe('DEFAULT_FILM_EMULATION_PARAMS', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_FILM_EMULATION_PARAMS.enabled).toBe(false);
      expect(DEFAULT_FILM_EMULATION_PARAMS.stock).toBe('kodak-portra-400');
      expect(DEFAULT_FILM_EMULATION_PARAMS.intensity).toBe(100);
      expect(DEFAULT_FILM_EMULATION_PARAMS.grainIntensity).toBe(30);
      expect(DEFAULT_FILM_EMULATION_PARAMS.grainSeed).toBe(0);
    });
  });

  describe('isFilmEmulationActive', () => {
    it('should return false when disabled', () => {
      expect(isFilmEmulationActive({
        ...DEFAULT_FILM_EMULATION_PARAMS,
        enabled: false,
      })).toBe(false);
    });

    it('should return false when intensity is 0', () => {
      expect(isFilmEmulationActive({
        ...DEFAULT_FILM_EMULATION_PARAMS,
        enabled: true,
        intensity: 0,
      })).toBe(false);
    });

    it('should return true when enabled with intensity > 0', () => {
      expect(isFilmEmulationActive({
        ...DEFAULT_FILM_EMULATION_PARAMS,
        enabled: true,
        intensity: 50,
      })).toBe(true);
    });
  });

  describe('getFilmStock / getFilmStocks', () => {
    it('should return all 6 film stocks', () => {
      expect(getFilmStocks()).toHaveLength(6);
    });

    it('should find each stock by ID', () => {
      for (const stock of FILM_STOCKS) {
        expect(getFilmStock(stock.id)).toBeDefined();
        expect(getFilmStock(stock.id)!.name).toBe(stock.name);
      }
    });

    it('should return undefined for unknown ID', () => {
      expect(getFilmStock('nonexistent' as any)).toBeUndefined();
    });
  });

  describe('applyFilmEmulation', () => {
    it('should not modify image when disabled', () => {
      const imageData = createColorTestImage(10, 10);
      const originalData = new Uint8ClampedArray(imageData.data);

      applyFilmEmulation(imageData, {
        ...DEFAULT_FILM_EMULATION_PARAMS,
        enabled: false,
      });

      expect(imageData.data).toEqual(originalData);
    });

    it('should not modify image when intensity is 0', () => {
      const imageData = createColorTestImage(10, 10);
      const originalData = new Uint8ClampedArray(imageData.data);

      applyFilmEmulation(imageData, {
        ...DEFAULT_FILM_EMULATION_PARAMS,
        enabled: true,
        intensity: 0,
      });

      expect(imageData.data).toEqual(originalData);
    });

    it('FILM-001: preset applies characteristic look (modifies pixels)', () => {
      for (const stock of FILM_STOCKS) {
        const imageData = createColorTestImage(10, 10);
        const originalData = new Uint8ClampedArray(imageData.data);

        applyFilmEmulation(imageData, {
          enabled: true,
          stock: stock.id,
          intensity: 100,
          grainIntensity: 0, // No grain to isolate color effect
          grainSeed: 0,
        });

        // Should be different from original for a colorful image
        let isDifferent = false;
        for (let i = 0; i < imageData.data.length; i += 4) {
          if (imageData.data[i] !== originalData[i] ||
              imageData.data[i + 1] !== originalData[i + 1] ||
              imageData.data[i + 2] !== originalData[i + 2]) {
            isDifferent = true;
            break;
          }
        }
        expect(isDifferent).toBe(true);
      }
    });

    it('FILM-002: intensity scales effect properly', () => {
      const imageData25 = createColorTestImage(10, 10);
      const imageData100 = createColorTestImage(10, 10);
      const original = createColorTestImage(10, 10);

      applyFilmEmulation(imageData25, {
        enabled: true,
        stock: 'kodak-portra-400',
        intensity: 25,
        grainIntensity: 0,
        grainSeed: 0,
      });

      applyFilmEmulation(imageData100, {
        enabled: true,
        stock: 'kodak-portra-400',
        intensity: 100,
        grainIntensity: 0,
        grainSeed: 0,
      });

      // 25% intensity should be closer to original than 100% intensity
      let diff25 = 0;
      let diff100 = 0;
      for (let i = 0; i < original.data.length; i += 4) {
        diff25 += Math.abs(imageData25.data[i]! - original.data[i]!);
        diff25 += Math.abs(imageData25.data[i + 1]! - original.data[i + 1]!);
        diff25 += Math.abs(imageData25.data[i + 2]! - original.data[i + 2]!);
        diff100 += Math.abs(imageData100.data[i]! - original.data[i]!);
        diff100 += Math.abs(imageData100.data[i + 1]! - original.data[i + 1]!);
        diff100 += Math.abs(imageData100.data[i + 2]! - original.data[i + 2]!);
      }

      expect(diff25).toBeLessThan(diff100);
    });

    it('FILM-003: grain animates over frames (different seeds produce different output)', () => {
      const imageData1 = createTestImageData(20, 20, [128, 128, 128, 255]);
      const imageData2 = createTestImageData(20, 20, [128, 128, 128, 255]);

      applyFilmEmulation(imageData1, {
        enabled: true,
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 42,
      });

      applyFilmEmulation(imageData2, {
        enabled: true,
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 99,
      });

      // Different seeds should produce different pixel values
      let isDifferent = false;
      for (let i = 0; i < imageData1.data.length; i++) {
        if (imageData1.data[i] !== imageData2.data[i]) {
          isDifferent = true;
          break;
        }
      }
      expect(isDifferent).toBe(true);
    });

    it('FILM-003b: same seed produces identical output (deterministic)', () => {
      const imageData1 = createTestImageData(20, 20, [128, 128, 128, 255]);
      const imageData2 = createTestImageData(20, 20, [128, 128, 128, 255]);

      const params = {
        enabled: true as const,
        stock: 'kodak-tri-x-400' as const,
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 42,
      };

      applyFilmEmulation(imageData1, params);
      applyFilmEmulation(imageData2, params);

      expect(imageData1.data).toEqual(imageData2.data);
    });

    it('FILM-004: multiple presets can be compared (each produces distinct result)', () => {
      const results: Uint8ClampedArray[] = [];

      for (const stock of FILM_STOCKS) {
        const imageData = createColorTestImage(10, 10);
        applyFilmEmulation(imageData, {
          enabled: true,
          stock: stock.id,
          intensity: 100,
          grainIntensity: 0,
          grainSeed: 0,
        });
        results.push(new Uint8ClampedArray(imageData.data));
      }

      // Every pair of presets should produce different results
      for (let a = 0; a < results.length; a++) {
        for (let b = a + 1; b < results.length; b++) {
          let isDifferent = false;
          for (let i = 0; i < results[a]!.length; i++) {
            if (results[a]![i] !== results[b]![i]) {
              isDifferent = true;
              break;
            }
          }
          expect(isDifferent).toBe(true);
        }
      }
    });

    it('should preserve alpha channel', () => {
      const imageData = createTestImageData(10, 10, [128, 128, 128, 200]);

      applyFilmEmulation(imageData, {
        enabled: true,
        stock: 'kodak-portra-400',
        intensity: 100,
        grainIntensity: 50,
        grainSeed: 1,
      });

      for (let i = 3; i < imageData.data.length; i += 4) {
        expect(imageData.data[i]).toBe(200);
      }
    });

    it('should handle small images (2x2)', () => {
      const imageData = createTestImageData(2, 2, [128, 128, 128, 255]);

      expect(() => {
        applyFilmEmulation(imageData, {
          enabled: true,
          stock: 'fuji-velvia-50',
          intensity: 100,
          grainIntensity: 50,
          grainSeed: 1,
        });
      }).not.toThrow();
    });

    it('B&W stocks should desaturate the image', () => {
      const imageData = createColorTestImage(10, 10);

      applyFilmEmulation(imageData, {
        enabled: true,
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 0,
        grainSeed: 0,
      });

      // For B&W stock, R ≈ G ≈ B for each pixel
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i]!;
        const g = imageData.data[i + 1]!;
        const b = imageData.data[i + 2]!;
        expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
        expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
      }
    });

    it('grain should be luminance-dependent (stronger in midtones)', () => {
      // Black image: grain should be near zero
      const blackImg = createTestImageData(20, 20, [0, 0, 0, 255]);
      const blackOriginal = new Uint8ClampedArray(blackImg.data);

      applyFilmEmulation(blackImg, {
        enabled: true,
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 42,
      });

      // Midtone image: grain should be stronger
      const midImg = createTestImageData(20, 20, [128, 128, 128, 255]);
      const midOriginal = new Uint8ClampedArray(midImg.data);

      applyFilmEmulation(midImg, {
        enabled: true,
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 42,
      });

      // Calculate average deviation for each
      let blackDiff = 0;
      let midDiff = 0;
      const pixelCount = 20 * 20;

      for (let i = 0; i < blackImg.data.length; i += 4) {
        blackDiff += Math.abs(blackImg.data[i]! - blackOriginal[i]!);
        midDiff += Math.abs(midImg.data[i]! - midOriginal[i]!);
      }

      blackDiff /= pixelCount;
      midDiff /= pixelCount;

      // Midtone grain deviation should be higher than shadow grain
      expect(midDiff).toBeGreaterThan(blackDiff);
    });
  });
});
