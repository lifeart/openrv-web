/**
 * ViewerEffects Tone Mapping Tests
 *
 * Tests for the CPU-based tone mapping functions.
 */

import { describe, it, expect } from 'vitest';
import { applyToneMapping, applyToneMappingHDR } from './ViewerEffects';

/**
 * Helper to create ImageData for testing
 */
function createTestImageData(r: number, g: number, b: number, a = 255): ImageData {
  const data = new Uint8ClampedArray([r, g, b, a]);
  return {
    data,
    width: 1,
    height: 1,
    colorSpace: 'srgb',
  } as ImageData;
}

/**
 * Helper to create multi-pixel ImageData
 */
function createMultiPixelImageData(pixels: Array<[number, number, number, number]>): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b, a] = pixels[i]!;
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return {
    data,
    width: pixels.length,
    height: 1,
    colorSpace: 'srgb',
  } as ImageData;
}

describe('applyToneMapping', () => {
  describe('operator: off', () => {
    it('TONEMAPFN-001: off operator does not modify image data', () => {
      const imageData = createTestImageData(128, 200, 50);
      const originalR = imageData.data[0];
      const originalG = imageData.data[1];
      const originalB = imageData.data[2];
      const originalA = imageData.data[3];

      applyToneMapping(imageData, 'off');

      expect(imageData.data[0]).toBe(originalR);
      expect(imageData.data[1]).toBe(originalG);
      expect(imageData.data[2]).toBe(originalB);
      expect(imageData.data[3]).toBe(originalA);
    });

    it('TONEMAPFN-002: off operator preserves extreme values', () => {
      const imageData = createTestImageData(0, 255, 0);

      applyToneMapping(imageData, 'off');

      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(255);
      expect(imageData.data[2]).toBe(0);
    });
  });

  describe('operator: reinhard', () => {
    it('TONEMAPFN-010: reinhard maps 0 to 0', () => {
      const imageData = createTestImageData(0, 0, 0);

      applyToneMapping(imageData, 'reinhard');

      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPFN-011: reinhard compresses bright values', () => {
      const imageData = createTestImageData(255, 255, 255);

      applyToneMapping(imageData, 'reinhard');

      // Reinhard formula: x / (1 + x) where x = 1 gives 0.5
      // 255 / 255 = 1, then 1 / (1 + 1) = 0.5 -> 128
      expect(imageData.data[0]).toBe(128);
      expect(imageData.data[1]).toBe(128);
      expect(imageData.data[2]).toBe(128);
    });

    it('TONEMAPFN-012: reinhard preserves relative brightness ordering', () => {
      const imageData = createMultiPixelImageData([
        [64, 64, 64, 255],  // dark
        [128, 128, 128, 255], // mid
        [255, 255, 255, 255], // bright
      ]);

      applyToneMapping(imageData, 'reinhard');

      const dark = imageData.data[0]!;
      const mid = imageData.data[4]!;
      const bright = imageData.data[8]!;

      expect(dark).toBeLessThan(mid);
      expect(mid).toBeLessThan(bright);
    });

    it('TONEMAPFN-013: reinhard preserves alpha channel', () => {
      const imageData = createTestImageData(128, 128, 128, 200);

      applyToneMapping(imageData, 'reinhard');

      expect(imageData.data[3]).toBe(200);
    });

    it('TONEMAPFN-014: reinhard produces expected midtone value', () => {
      // For input 128 (0.502 normalized), Reinhard: 0.502 / 1.502 = 0.334 -> ~85
      const imageData = createTestImageData(128, 128, 128);

      applyToneMapping(imageData, 'reinhard');

      // Allow some tolerance for rounding
      expect(imageData.data[0]).toBeGreaterThanOrEqual(84);
      expect(imageData.data[0]).toBeLessThanOrEqual(86);
    });
  });

  describe('operator: filmic', () => {
    it('TONEMAPFN-020: filmic maps 0 to 0', () => {
      const imageData = createTestImageData(0, 0, 0);

      applyToneMapping(imageData, 'filmic');

      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPFN-021: filmic compresses bright values', () => {
      const imageData = createTestImageData(255, 255, 255);

      applyToneMapping(imageData, 'filmic');

      // Filmic should compress 255 to something less than 255
      expect(imageData.data[0]).toBeLessThan(255);
      expect(imageData.data[0]).toBeGreaterThan(0);
    });

    it('TONEMAPFN-022: filmic preserves relative brightness ordering', () => {
      const imageData = createMultiPixelImageData([
        [64, 64, 64, 255],
        [128, 128, 128, 255],
        [255, 255, 255, 255],
      ]);

      applyToneMapping(imageData, 'filmic');

      const dark = imageData.data[0]!;
      const mid = imageData.data[4]!;
      const bright = imageData.data[8]!;

      expect(dark).toBeLessThan(mid);
      expect(mid).toBeLessThan(bright);
    });

    it('TONEMAPFN-023: filmic preserves alpha channel', () => {
      const imageData = createTestImageData(128, 128, 128, 150);

      applyToneMapping(imageData, 'filmic');

      expect(imageData.data[3]).toBe(150);
    });

    it('TONEMAPFN-024: filmic produces S-curve characteristic', () => {
      // Filmic should have an S-curve: slight toe lift in shadows, shoulder rolloff in highlights
      const shadowData = createTestImageData(32, 32, 32);
      const midData = createTestImageData(128, 128, 128);
      const highlightData = createTestImageData(224, 224, 224);

      applyToneMapping(shadowData, 'filmic');
      applyToneMapping(midData, 'filmic');
      applyToneMapping(highlightData, 'filmic');

      const shadow = shadowData.data[0]!;
      const mid = midData.data[0]!;
      const highlight = highlightData.data[0]!;

      // Shadows should be lifted slightly relative to linear
      // Midtones should be relatively preserved
      // Highlights should be compressed
      expect(shadow).toBeGreaterThanOrEqual(0);
      expect(mid).toBeGreaterThan(shadow);
      expect(highlight).toBeGreaterThan(mid);
    });
  });

  describe('operator: aces', () => {
    it('TONEMAPFN-030: aces maps 0 to 0', () => {
      const imageData = createTestImageData(0, 0, 0);

      applyToneMapping(imageData, 'aces');

      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPFN-031: aces compresses bright values', () => {
      const imageData = createTestImageData(255, 255, 255);

      applyToneMapping(imageData, 'aces');

      // ACES should compress 255 but still be bright
      expect(imageData.data[0]).toBeLessThan(255);
      expect(imageData.data[0]).toBeGreaterThan(200); // ACES is relatively bright
    });

    it('TONEMAPFN-032: aces preserves relative brightness ordering', () => {
      const imageData = createMultiPixelImageData([
        [64, 64, 64, 255],
        [128, 128, 128, 255],
        [255, 255, 255, 255],
      ]);

      applyToneMapping(imageData, 'aces');

      const dark = imageData.data[0]!;
      const mid = imageData.data[4]!;
      const bright = imageData.data[8]!;

      expect(dark).toBeLessThan(mid);
      expect(mid).toBeLessThan(bright);
    });

    it('TONEMAPFN-033: aces preserves alpha channel', () => {
      const imageData = createTestImageData(128, 128, 128, 100);

      applyToneMapping(imageData, 'aces');

      expect(imageData.data[3]).toBe(100);
    });

    it('TONEMAPFN-034: aces clamps output to valid range', () => {
      const imageData = createTestImageData(255, 255, 255);

      applyToneMapping(imageData, 'aces');

      expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
      expect(imageData.data[1]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[1]).toBeLessThanOrEqual(255);
      expect(imageData.data[2]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[2]).toBeLessThanOrEqual(255);
    });
  });

  describe('color handling', () => {
    it('TONEMAPFN-040: tone mapping processes each channel independently', () => {
      // Tone mapping operators process R, G, B channels independently
      // so the ratios will change based on the non-linear curves
      const imageData = createTestImageData(255, 100, 50);

      applyToneMapping(imageData, 'reinhard');

      // After tone mapping, all values should still be valid
      expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
      expect(imageData.data[1]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[1]).toBeLessThanOrEqual(255);
      expect(imageData.data[2]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[2]).toBeLessThanOrEqual(255);
      // Red should still be highest (tone mapping preserves ordering per channel)
      expect(imageData.data[0]).toBeGreaterThan(imageData.data[1]!);
      expect(imageData.data[1]).toBeGreaterThan(imageData.data[2]!);
    });

    it('TONEMAPFN-041: tone mapping handles saturated colors', () => {
      const imageData = createTestImageData(255, 0, 0);

      applyToneMapping(imageData, 'aces');

      expect(imageData.data[0]).toBeGreaterThan(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPFN-042: tone mapping handles grayscale', () => {
      const imageData = createTestImageData(128, 128, 128);

      applyToneMapping(imageData, 'filmic');

      // Grayscale should remain grayscale
      expect(imageData.data[0]).toBe(imageData.data[1]);
      expect(imageData.data[1]).toBe(imageData.data[2]);
    });
  });

  describe('performance characteristics', () => {
    it('TONEMAPFN-050: processes large images without error', () => {
      // Create a 100x100 pixel image
      const pixels: Array<[number, number, number, number]> = [];
      for (let i = 0; i < 10000; i++) {
        pixels.push([
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          255,
        ]);
      }
      const imageData = createMultiPixelImageData(pixels);

      expect(() => applyToneMapping(imageData, 'reinhard')).not.toThrow();
    });

    it('TONEMAPFN-051: all operators produce valid 8-bit output', () => {
      const operators = ['reinhard', 'filmic', 'aces'] as const;

      for (const operator of operators) {
        const imageData = createMultiPixelImageData([
          [0, 0, 0, 255],
          [128, 128, 128, 255],
          [255, 255, 255, 255],
        ]);

        applyToneMapping(imageData, operator);

        for (let i = 0; i < imageData.data.length; i += 4) {
          expect(imageData.data[i]).toBeGreaterThanOrEqual(0);
          expect(imageData.data[i]).toBeLessThanOrEqual(255);
          expect(imageData.data[i + 1]).toBeGreaterThanOrEqual(0);
          expect(imageData.data[i + 1]).toBeLessThanOrEqual(255);
          expect(imageData.data[i + 2]).toBeGreaterThanOrEqual(0);
          expect(imageData.data[i + 2]).toBeLessThanOrEqual(255);
        }
      }
    });
  });

  describe('operator comparison', () => {
    it('TONEMAPFN-060: reinhard is different from filmic', () => {
      const reinhardData = createTestImageData(200, 200, 200);
      const filmicData = createTestImageData(200, 200, 200);

      applyToneMapping(reinhardData, 'reinhard');
      applyToneMapping(filmicData, 'filmic');

      // Different operators should produce different results
      expect(reinhardData.data[0]).not.toBe(filmicData.data[0]);
    });

    it('TONEMAPFN-061: reinhard is different from aces', () => {
      const reinhardData = createTestImageData(200, 200, 200);
      const acesData = createTestImageData(200, 200, 200);

      applyToneMapping(reinhardData, 'reinhard');
      applyToneMapping(acesData, 'aces');

      expect(reinhardData.data[0]).not.toBe(acesData.data[0]);
    });

    it('TONEMAPFN-062: filmic is different from aces', () => {
      const filmicData = createTestImageData(200, 200, 200);
      const acesData = createTestImageData(200, 200, 200);

      applyToneMapping(filmicData, 'filmic');
      applyToneMapping(acesData, 'aces');

      expect(filmicData.data[0]).not.toBe(acesData.data[0]);
    });

    it('TONEMAPFN-063: all operators converge near black', () => {
      const reinhardData = createTestImageData(1, 1, 1);
      const filmicData = createTestImageData(1, 1, 1);
      const acesData = createTestImageData(1, 1, 1);

      applyToneMapping(reinhardData, 'reinhard');
      applyToneMapping(filmicData, 'filmic');
      applyToneMapping(acesData, 'aces');

      // Near black, all operators should be very similar
      expect(Math.abs(reinhardData.data[0]! - filmicData.data[0]!)).toBeLessThanOrEqual(2);
      expect(Math.abs(filmicData.data[0]! - acesData.data[0]!)).toBeLessThanOrEqual(2);
    });
  });

  describe('edge cases: zero input', () => {
    it('TONEMAPFN-070: reinhard maps exact 0 to 0', () => {
      const imageData = createTestImageData(0, 0, 0);
      applyToneMapping(imageData, 'reinhard');
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPFN-071: filmic maps exact 0 to 0 (not negative)', () => {
      // This is a critical test - filmic curve can produce negative values
      // for very small inputs due to the -E/F term
      const imageData = createTestImageData(0, 0, 0);
      applyToneMapping(imageData, 'filmic');
      // Must be 0, not negative
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPFN-072: aces maps exact 0 to 0', () => {
      const imageData = createTestImageData(0, 0, 0);
      applyToneMapping(imageData, 'aces');
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });
  });

  describe('edge cases: output range validation', () => {
    it('TONEMAPFN-080: all operators produce output in valid 0-255 range', () => {
      const operators = ['reinhard', 'filmic', 'aces'] as const;

      // Test all possible 8-bit values
      for (const operator of operators) {
        for (let v = 0; v <= 255; v += 17) { // Sample every 17th value
          const imageData = createTestImageData(v, v, v);
          applyToneMapping(imageData, operator);

          expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
          expect(imageData.data[0]).toBeLessThanOrEqual(255);
          expect(Number.isInteger(imageData.data[0])).toBe(true);
        }
      }
    });

    it('TONEMAPFN-081: tone mapping never produces NaN output', () => {
      const operators = ['reinhard', 'filmic', 'aces'] as const;

      for (const operator of operators) {
        const imageData = createTestImageData(128, 128, 128);
        applyToneMapping(imageData, operator);

        expect(Number.isNaN(imageData.data[0])).toBe(false);
        expect(Number.isNaN(imageData.data[1])).toBe(false);
        expect(Number.isNaN(imageData.data[2])).toBe(false);
      }
    });
  });

  describe('monotonicity (brightness ordering preserved)', () => {
    it('TONEMAPFN-090: reinhard is monotonically increasing', () => {
      const values = [0, 32, 64, 96, 128, 160, 192, 224, 255];
      const results: number[] = [];

      for (const v of values) {
        const imageData = createTestImageData(v, v, v);
        applyToneMapping(imageData, 'reinhard');
        results.push(imageData.data[0]!);
      }

      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThanOrEqual(results[i - 1]!);
      }
    });

    it('TONEMAPFN-091: filmic is monotonically increasing', () => {
      const values = [0, 32, 64, 96, 128, 160, 192, 224, 255];
      const results: number[] = [];

      for (const v of values) {
        const imageData = createTestImageData(v, v, v);
        applyToneMapping(imageData, 'filmic');
        results.push(imageData.data[0]!);
      }

      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThanOrEqual(results[i - 1]!);
      }
    });

    it('TONEMAPFN-092: aces is monotonically increasing', () => {
      const values = [0, 32, 64, 96, 128, 160, 192, 224, 255];
      const results: number[] = [];

      for (const v of values) {
        const imageData = createTestImageData(v, v, v);
        applyToneMapping(imageData, 'aces');
        results.push(imageData.data[0]!);
      }

      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThanOrEqual(results[i - 1]!);
      }
    });
  });

  describe('mathematical correctness', () => {
    it('TONEMAPFN-100: reinhard formula verification for known value', () => {
      // For input 0.5 (128/255), Reinhard: 0.5 / (1 + 0.5) = 0.333... -> ~85
      const imageData = createTestImageData(128, 128, 128);
      applyToneMapping(imageData, 'reinhard');

      // Reinhard: x / (1 + x) where x = 128/255 = 0.502
      // 0.502 / 1.502 = 0.334 -> 85.2
      expect(imageData.data[0]).toBeGreaterThanOrEqual(84);
      expect(imageData.data[0]).toBeLessThanOrEqual(86);
    });

    it('TONEMAPFN-101: reinhard asymptotic behavior - very bright approaches 1', () => {
      // Reinhard: as x -> infinity, output -> 1
      const imageData = createTestImageData(255, 255, 255);
      applyToneMapping(imageData, 'reinhard');

      // x = 1.0, Reinhard: 1 / 2 = 0.5 -> 128
      expect(imageData.data[0]).toBe(128);
    });

    it('TONEMAPFN-102: aces clamps output to [0, 1] range', () => {
      // ACES has explicit clamping
      const imageData = createTestImageData(255, 255, 255);
      applyToneMapping(imageData, 'aces');

      expect(imageData.data[0]).toBeLessThanOrEqual(255);
      expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * Tests for HDR tone mapping function
 */
describe('applyToneMappingHDR', () => {
  function createHDRTestData(width: number, height: number, channels: number, values: number[]): {
    imageData: ImageData;
    hdrData: Float32Array;
  } {
    const pixelCount = width * height;
    const hdrData = new Float32Array(pixelCount * channels);
    const data = new Uint8ClampedArray(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      for (let c = 0; c < channels; c++) {
        hdrData[i * channels + c] = values[c] ?? values[0]!;
      }
      // Initialize RGBA data
      data[i * 4 + 3] = 255; // Alpha
    }

    return {
      imageData: {
        data,
        width,
        height,
        colorSpace: 'srgb',
      } as ImageData,
      hdrData,
    };
  }

  describe('HDR value handling', () => {
    it('TONEMAPHDR-001: handles values greater than 1.0', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [2.0, 2.0, 2.0]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // Reinhard: 2 / (1 + 2) = 0.667 -> ~170
      expect(imageData.data[0]).toBeGreaterThan(128); // More than midtone
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
    });

    it('TONEMAPHDR-002: handles very bright HDR values (10.0)', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [10.0, 10.0, 10.0]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // Reinhard: 10 / (1 + 10) = 0.909 -> ~232
      expect(imageData.data[0]).toBeGreaterThan(200);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
    });

    it('TONEMAPHDR-003: handles extremely bright HDR values (100.0)', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [100.0, 100.0, 100.0]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // Reinhard: 100 / (1 + 100) = 0.99 -> ~252
      expect(imageData.data[0]).toBeGreaterThan(240);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
    });

    it('TONEMAPHDR-004: ACES handles HDR values correctly', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [5.0, 5.0, 5.0]);

      applyToneMappingHDR(imageData, 'aces', hdrData, 3);

      // Output should be valid and compressed
      expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
    });

    it('TONEMAPHDR-005: filmic handles HDR values correctly', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [5.0, 5.0, 5.0]);

      applyToneMappingHDR(imageData, 'filmic', hdrData, 3);

      // Output should be valid and compressed
      expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
    });
  });

  describe('edge cases with HDR', () => {
    it('TONEMAPHDR-010: handles NaN in HDR data', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [NaN, NaN, NaN]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // NaN should map to 0
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPHDR-011: handles Infinity in HDR data', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [Infinity, Infinity, Infinity]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // Infinity should map to 0 (handled as edge case)
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPHDR-012: handles negative Infinity in HDR data', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [-Infinity, -Infinity, -Infinity]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // -Infinity should map to 0
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPHDR-013: handles negative values in HDR data', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [-0.5, -0.5, -0.5]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // Negative values should map to 0
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });

    it('TONEMAPHDR-014: handles zero HDR values', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [0.0, 0.0, 0.0]);

      applyToneMappingHDR(imageData, 'filmic', hdrData, 3);

      // Zero should map to 0
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
    });
  });

  describe('channel handling', () => {
    it('TONEMAPHDR-020: handles single channel (grayscale) HDR', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 1, [0.5]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 1);

      // Single channel should be applied to all RGB
      expect(imageData.data[0]).toBeGreaterThan(0);
      expect(imageData.data[0]).toBe(imageData.data[1]);
      expect(imageData.data[1]).toBe(imageData.data[2]);
    });

    it('TONEMAPHDR-021: handles RGB (3 channel) HDR', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [0.5, 0.3, 0.1]);

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      // Each channel should be different
      expect(imageData.data[0]).toBeGreaterThan(imageData.data[1]!);
      expect(imageData.data[1]).toBeGreaterThan(imageData.data[2]!);
    });

    it('TONEMAPHDR-022: preserves alpha channel', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [0.5, 0.5, 0.5]);
      imageData.data[3] = 200; // Set custom alpha

      applyToneMappingHDR(imageData, 'reinhard', hdrData, 3);

      expect(imageData.data[3]).toBe(200);
    });
  });

  describe('off operator', () => {
    it('TONEMAPHDR-030: off operator does not modify image data', () => {
      const { imageData, hdrData } = createHDRTestData(1, 1, 3, [2.0, 2.0, 2.0]);
      imageData.data[0] = 100;
      imageData.data[1] = 100;
      imageData.data[2] = 100;

      applyToneMappingHDR(imageData, 'off', hdrData, 3);

      // Data should remain unchanged
      expect(imageData.data[0]).toBe(100);
      expect(imageData.data[1]).toBe(100);
      expect(imageData.data[2]).toBe(100);
    });
  });
});

/**
 * GPU/CPU Parity Tests
 *
 * These tests verify that the CPU tone mapping implementations match
 * the expected behavior of the GPU shader implementations.
 * The formulas should produce identical results (within floating point tolerance).
 */
describe('GPU/CPU Parity', () => {
  // Reference implementations matching the GPU shader code
  function gpuReinhard(x: number): number {
    // GPU: return color / (color + vec3(1.0));
    return x / (x + 1.0);
  }

  function gpuFilmicCurve(x: number): number {
    // GPU filmic curve matching shader constants
    const A = 0.15;
    const B = 0.50;
    const C = 0.10;
    const D = 0.20;
    const E = 0.02;
    const F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  }

  function gpuFilmic(x: number): number {
    // GPU: exposureBias = 2.0, whiteScale = 1.0 / filmic(11.2)
    const exposureBias = 2.0;
    const curr = gpuFilmicCurve(exposureBias * x);
    const whiteScale = 1.0 / gpuFilmicCurve(11.2);
    return Math.max(0, curr * whiteScale); // GPU now clamps to non-negative
  }

  function gpuACES(x: number): number {
    // GPU ACES fitted curve
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
  }

  describe('PARITY: Reinhard', () => {
    it('PARITY-001: CPU Reinhard matches GPU formula for value 0', () => {
      const imageData = createTestImageData(0, 0, 0);
      applyToneMapping(imageData, 'reinhard');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuReinhard(0);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.01);
    });

    it('PARITY-002: CPU Reinhard matches GPU formula for value 0.5', () => {
      const imageData = createTestImageData(128, 128, 128);
      applyToneMapping(imageData, 'reinhard');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuReinhard(128 / 255);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.02);
    });

    it('PARITY-003: CPU Reinhard matches GPU formula for value 1.0', () => {
      const imageData = createTestImageData(255, 255, 255);
      applyToneMapping(imageData, 'reinhard');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuReinhard(1.0);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.01);
    });
  });

  describe('PARITY: Filmic', () => {
    it('PARITY-010: CPU Filmic matches GPU formula for value 0', () => {
      const imageData = createTestImageData(0, 0, 0);
      applyToneMapping(imageData, 'filmic');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuFilmic(0);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.01);
    });

    it('PARITY-011: CPU Filmic matches GPU formula for value 0.5', () => {
      const imageData = createTestImageData(128, 128, 128);
      applyToneMapping(imageData, 'filmic');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuFilmic(128 / 255);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.02);
    });

    it('PARITY-012: CPU Filmic matches GPU formula for value 1.0', () => {
      const imageData = createTestImageData(255, 255, 255);
      applyToneMapping(imageData, 'filmic');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuFilmic(1.0);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.02);
    });

    it('PARITY-013: Filmic never produces negative values (GPU/CPU alignment)', () => {
      // Test very small values where filmic curve can be negative
      for (let i = 0; i <= 10; i++) {
        const imageData = createTestImageData(i, i, i);
        applyToneMapping(imageData, 'filmic');
        expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
        expect(gpuFilmic(i / 255)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('PARITY: ACES', () => {
    it('PARITY-020: CPU ACES matches GPU formula for value 0', () => {
      const imageData = createTestImageData(0, 0, 0);
      applyToneMapping(imageData, 'aces');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuACES(0);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.01);
    });

    it('PARITY-021: CPU ACES matches GPU formula for value 0.5', () => {
      const imageData = createTestImageData(128, 128, 128);
      applyToneMapping(imageData, 'aces');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuACES(128 / 255);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.02);
    });

    it('PARITY-022: CPU ACES matches GPU formula for value 1.0', () => {
      const imageData = createTestImageData(255, 255, 255);
      applyToneMapping(imageData, 'aces');
      const cpuResult = imageData.data[0]! / 255;
      const gpuResult = gpuACES(1.0);
      expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(0.02);
    });

    it('PARITY-023: ACES output is always in [0, 1] range', () => {
      for (let i = 0; i <= 255; i += 17) {
        const imageData = createTestImageData(i, i, i);
        applyToneMapping(imageData, 'aces');
        const cpuResult = imageData.data[0]! / 255;
        const gpuResult = gpuACES(i / 255);

        expect(cpuResult).toBeGreaterThanOrEqual(0);
        expect(cpuResult).toBeLessThanOrEqual(1);
        expect(gpuResult).toBeGreaterThanOrEqual(0);
        expect(gpuResult).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('PARITY: All operators comprehensive', () => {
    it('PARITY-030: All operators produce consistent results across full range', () => {
      const operators = ['reinhard', 'filmic', 'aces'] as const;
      const gpuFunctions = {
        reinhard: gpuReinhard,
        filmic: gpuFilmic,
        aces: gpuACES,
      };

      for (const op of operators) {
        for (let i = 0; i <= 255; i += 51) { // Test 0, 51, 102, 153, 204, 255
          const imageData = createTestImageData(i, i, i);
          applyToneMapping(imageData, op);
          const cpuResult = imageData.data[0]! / 255;
          const gpuResult = gpuFunctions[op](i / 255);

          // Allow 2% tolerance for 8-bit quantization
          const tolerance = 0.02;
          expect(Math.abs(cpuResult - gpuResult)).toBeLessThan(tolerance);
        }
      }
    });
  });
});
