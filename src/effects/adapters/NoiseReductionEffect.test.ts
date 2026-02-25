import { describe, it, expect, beforeEach } from 'vitest';
import { noiseReductionEffect } from './NoiseReductionEffect';
import { EffectRegistry } from '../EffectRegistry';
import { deinterlaceEffect } from '../index';

/** Create a size x size ImageData with noisy pixels (grey base ±30). */
function createNoisyImageData(size = 4): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const noise = ((x + y) % 2 === 0) ? 30 : -30;
      data[i] = 128 + noise;
      data[i + 1] = 128 + noise;
      data[i + 2] = 128 + noise;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, size, size);
}

/** Create a size x size ImageData with color noise (R/G/B vary independently). */
function createColorNoisyImageData(size = 6): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = 128 + ((x * 37 + y * 13) % 60) - 30;     // R
      data[i + 1] = 128 + ((x * 17 + y * 41) % 60) - 30;  // G
      data[i + 2] = 128 + ((x * 29 + y * 7) % 60) - 30;   // B
      data[i + 3] = 200;
    }
  }
  return new ImageData(data, size, size);
}

function createUniformImageData(value: number, size = 4, alpha = 255): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = alpha;
  }
  return new ImageData(data, size, size);
}

/** Compute R-channel variance of an ImageData. */
function computeVariance(img: ImageData): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    sum += img.data[i]!;
    sumSq += img.data[i]! * img.data[i]!;
    count++;
  }
  return sumSq / count - (sum / count) ** 2;
}

describe('noiseReductionEffect adapter', () => {
  it('has correct metadata', () => {
    expect(noiseReductionEffect.name).toBe('noiseReduction');
    expect(noiseReductionEffect.label).toBe('Noise Reduction');
    expect(noiseReductionEffect.category).toBe('spatial');
  });

  // =================================================================
  // isActive
  // =================================================================
  describe('isActive', () => {
    it('returns false when strength is 0', () => {
      expect(noiseReductionEffect.isActive({ noiseReductionStrength: 0 })).toBe(false);
    });

    it('returns false when strength key is missing (defaults to 0)', () => {
      expect(noiseReductionEffect.isActive({})).toBe(false);
    });

    it('returns true when strength > 0', () => {
      expect(noiseReductionEffect.isActive({ noiseReductionStrength: 50 })).toBe(true);
    });

    it('returns true for minimal strength (1)', () => {
      expect(noiseReductionEffect.isActive({ noiseReductionStrength: 1 })).toBe(true);
    });

    it('returns true for maximum strength (100)', () => {
      expect(noiseReductionEffect.isActive({ noiseReductionStrength: 100 })).toBe(true);
    });

    it('returns false for negative strength', () => {
      expect(noiseReductionEffect.isActive({ noiseReductionStrength: -10 })).toBe(false);
    });

    it('returns false when strength is null (falls back to 0 via ??)', () => {
      expect(noiseReductionEffect.isActive({ noiseReductionStrength: null })).toBe(false);
    });
  });

  // =================================================================
  // apply — core behavior
  // =================================================================
  describe('apply', () => {
    it('reduces variance in noisy image', () => {
      const img = createNoisyImageData();
      const varianceBefore = computeVariance(img);

      noiseReductionEffect.apply(img, {
        noiseReductionStrength: 80,
        noiseReductionRadius: 2,
      });

      expect(computeVariance(img)).toBeLessThan(varianceBefore);
    });

    it('preserves alpha channel', () => {
      const img = createColorNoisyImageData();
      noiseReductionEffect.apply(img, { noiseReductionStrength: 50 });

      for (let i = 3; i < img.data.length; i += 4) {
        expect(img.data[i]).toBe(200);
      }
    });

    it('does not modify pixels when strength is 0', () => {
      const img = createUniformImageData(128);
      const original = new Uint8ClampedArray(img.data);

      noiseReductionEffect.apply(img, { noiseReductionStrength: 0 });

      expect(img.data).toEqual(original);
    });

    it('higher strength produces more smoothing', () => {
      const imgLow = createNoisyImageData(8);
      const imgHigh = createNoisyImageData(8);

      noiseReductionEffect.apply(imgLow, { noiseReductionStrength: 20, noiseReductionRadius: 2 });
      noiseReductionEffect.apply(imgHigh, { noiseReductionStrength: 100, noiseReductionRadius: 2 });

      expect(computeVariance(imgHigh)).toBeLessThanOrEqual(computeVariance(imgLow));
    });

    it('larger radius produces more smoothing', () => {
      const imgSmall = createNoisyImageData(8);
      const imgLarge = createNoisyImageData(8);

      noiseReductionEffect.apply(imgSmall, { noiseReductionStrength: 60, noiseReductionRadius: 1 });
      noiseReductionEffect.apply(imgLarge, { noiseReductionStrength: 60, noiseReductionRadius: 5 });

      expect(computeVariance(imgLarge)).toBeLessThanOrEqual(computeVariance(imgSmall));
    });
  });

  // =================================================================
  // apply — param defaults
  // =================================================================
  describe('param defaults', () => {
    it('uses default values when only strength is provided', () => {
      const img1 = createNoisyImageData(6);
      const img2 = createNoisyImageData(6);

      noiseReductionEffect.apply(img1, { noiseReductionStrength: 60 });
      noiseReductionEffect.apply(img2, {
        noiseReductionStrength: 60,
        noiseReductionLuminanceStrength: 50,
        noiseReductionChromaStrength: 75,
        noiseReductionRadius: 2,
      });

      expect(img1.data).toEqual(img2.data);
    });

    it('null param values fall back to defaults via ??', () => {
      const img1 = createNoisyImageData(6);
      const img2 = createNoisyImageData(6);

      noiseReductionEffect.apply(img1, {
        noiseReductionStrength: 60,
        noiseReductionRadius: null,
      });
      noiseReductionEffect.apply(img2, {
        noiseReductionStrength: 60,
        noiseReductionRadius: 2,
      });

      expect(img1.data).toEqual(img2.data);
    });

    it('undefined param values fall back to defaults via ??', () => {
      const img1 = createNoisyImageData(6);
      const img2 = createNoisyImageData(6);

      noiseReductionEffect.apply(img1, {
        noiseReductionStrength: 60,
        noiseReductionLuminanceStrength: undefined,
      });
      noiseReductionEffect.apply(img2, {
        noiseReductionStrength: 60,
        noiseReductionLuminanceStrength: 50,
      });

      expect(img1.data).toEqual(img2.data);
    });
  });

  // =================================================================
  // apply — boundary / edge cases
  // =================================================================
  describe('boundary cases', () => {
    it('radius=1 (3x3 kernel) works without error', () => {
      const img = createNoisyImageData();
      const original = new Uint8ClampedArray(img.data);

      noiseReductionEffect.apply(img, { noiseReductionStrength: 60, noiseReductionRadius: 1 });

      let changed = false;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('radius=5 (11x11 kernel) works without error', () => {
      const img = createNoisyImageData(12);
      const original = new Uint8ClampedArray(img.data);

      noiseReductionEffect.apply(img, { noiseReductionStrength: 60, noiseReductionRadius: 5 });

      let changed = false;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('strength=100 at full blast does not corrupt pixel values', () => {
      const img = createNoisyImageData(6);

      noiseReductionEffect.apply(img, {
        noiseReductionStrength: 100,
        noiseReductionLuminanceStrength: 100,
        noiseReductionChromaStrength: 100,
        noiseReductionRadius: 5,
      });

      for (let i = 0; i < img.data.length; i += 4) {
        expect(img.data[i]).toBeGreaterThanOrEqual(0);
        expect(img.data[i]).toBeLessThanOrEqual(255);
      }
    });

    it('2x2 image does not crash', () => {
      const img = createNoisyImageData(2);
      expect(() => {
        noiseReductionEffect.apply(img, { noiseReductionStrength: 50 });
      }).not.toThrow();
    });

    it('1x1 image does not crash', () => {
      const data = new Uint8ClampedArray([128, 100, 80, 255]);
      const img = new ImageData(data, 1, 1);
      expect(() => {
        noiseReductionEffect.apply(img, { noiseReductionStrength: 50 });
      }).not.toThrow();
    });
  });

  // =================================================================
  // chromaStrength independence
  // =================================================================
  describe('chromaStrength', () => {
    it('different chromaStrength values produce different results on color image', () => {
      const imgHigh = createColorNoisyImageData(8);
      const imgZero = createColorNoisyImageData(8);

      noiseReductionEffect.apply(imgHigh, {
        noiseReductionStrength: 80,
        noiseReductionChromaStrength: 100,
        noiseReductionRadius: 2,
      });

      noiseReductionEffect.apply(imgZero, {
        noiseReductionStrength: 80,
        noiseReductionChromaStrength: 0,
        noiseReductionRadius: 2,
      });

      // On a color image with independent R/G/B noise, different chroma
      // handling must produce different per-channel results
      let diff = 0;
      for (let i = 0; i < imgHigh.data.length; i += 4) {
        diff += Math.abs(imgHigh.data[i]! - imgZero.data[i]!);
        diff += Math.abs(imgHigh.data[i + 1]! - imgZero.data[i + 1]!);
        diff += Math.abs(imgHigh.data[i + 2]! - imgZero.data[i + 2]!);
      }
      expect(diff).toBeGreaterThan(0);
    });
  });

  // =================================================================
  // registry integration
  // =================================================================
  describe('registry integration', () => {
    let registry: EffectRegistry;

    beforeEach(() => {
      registry = new EffectRegistry();
    });

    it('registers as spatial category', () => {
      registry.register(noiseReductionEffect);
      const spatial = registry.getByCategory('spatial');
      expect(spatial.map(e => e.name)).toContain('noiseReduction');
    });

    it('applyAll skips when strength is 0', () => {
      registry.register(noiseReductionEffect);
      const img = createUniformImageData(128);
      const original = new Uint8ClampedArray(img.data);

      registry.applyAll(img, { noiseReductionStrength: 0 });

      expect(img.data).toEqual(original);
    });

    it('applyAll applies when strength > 0', () => {
      registry.register(noiseReductionEffect);
      const img = createNoisyImageData();
      const original = new Uint8ClampedArray(img.data);

      registry.applyAll(img, { noiseReductionStrength: 60 });

      let changed = false;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('applyByCategory spatial applies noise reduction', () => {
      registry.register(noiseReductionEffect);
      const img = createNoisyImageData();
      const original = new Uint8ClampedArray(img.data);

      registry.applyByCategory('spatial', img, { noiseReductionStrength: 60 });

      let changed = false;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });

    it('applyByCategory color does NOT apply noise reduction', () => {
      registry.register(noiseReductionEffect);
      const img = createNoisyImageData();
      const original = new Uint8ClampedArray(img.data);

      registry.applyByCategory('color', img, { noiseReductionStrength: 60 });

      expect(img.data).toEqual(original);
    });

    it('chains with deinterlace in applyAll (both spatial)', () => {
      registry.register(deinterlaceEffect);
      registry.register(noiseReductionEffect);

      const img = createNoisyImageData(8);
      const original = new Uint8ClampedArray(img.data);

      registry.applyAll(img, {
        deinterlaceEnabled: true,
        deinterlaceMethod: 'blend',
        noiseReductionStrength: 60,
      });

      let changed = false;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] !== original[i]) { changed = true; break; }
      }
      expect(changed).toBe(true);
    });
  });
});
