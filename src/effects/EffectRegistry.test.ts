import { describe, it, expect, beforeEach } from 'vitest';
import {
  EffectRegistry,
  colorInversionEffect,
  cdlEffect,
  hueRotationEffect,
  highlightsShadowsEffect,
  toneMappingEffect,
  deinterlaceEffect,
  filmEmulationEffect,
  noiseReductionEffect,
} from './index';
import type { ImageEffect } from './ImageEffect';
import { DEFAULT_CDL } from '../color/CDL';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a tiny 2x2 ImageData filled with a single RGBA colour. */
function createTestImageData(
  r: number,
  g: number,
  b: number,
  a = 255
): ImageData {
  const data = new Uint8ClampedArray(4 * 4); // 2x2
  for (let i = 0; i < 16; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return new ImageData(data, 2, 2);
}

// ---------------------------------------------------------------------------
// EffectRegistry unit tests
// ---------------------------------------------------------------------------

describe('EffectRegistry', () => {
  let registry: EffectRegistry;

  beforeEach(() => {
    registry = new EffectRegistry();
  });

  it('registers and retrieves an effect by name', () => {
    registry.register(colorInversionEffect);
    expect(registry.get('colorInversion')).toBe(colorInversionEffect);
  });

  it('throws on duplicate registration', () => {
    registry.register(colorInversionEffect);
    expect(() => registry.register(colorInversionEffect)).toThrow(
      /already registered/
    );
  });

  it('returns undefined for unknown effect', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('unregisters an effect', () => {
    registry.register(colorInversionEffect);
    expect(registry.unregister('colorInversion')).toBe(true);
    expect(registry.get('colorInversion')).toBeUndefined();
    expect(registry.unregister('colorInversion')).toBe(false);
  });

  it('getByCategory returns effects in the requested category', () => {
    registry.register(colorInversionEffect); // color
    registry.register(cdlEffect); // color
    registry.register(highlightsShadowsEffect); // tone

    const color = registry.getByCategory('color');
    expect(color.map((e) => e.name)).toEqual(['colorInversion', 'cdl']);

    const tone = registry.getByCategory('tone');
    expect(tone.map((e) => e.name)).toEqual(['highlightsShadows']);
  });

  it('getAll returns all effects in registration order', () => {
    registry.register(highlightsShadowsEffect);
    registry.register(colorInversionEffect);
    expect(registry.getAll().map((e) => e.name)).toEqual([
      'highlightsShadows',
      'colorInversion',
    ]);
  });

  it('names() lists all registered effect names', () => {
    registry.register(cdlEffect);
    registry.register(toneMappingEffect);
    expect(registry.names()).toEqual(['cdl', 'toneMapping']);
  });

  it('size reflects number of registered effects', () => {
    expect(registry.size).toBe(0);
    registry.register(colorInversionEffect);
    expect(registry.size).toBe(1);
  });

  it('clear() removes all effects', () => {
    registry.register(colorInversionEffect);
    registry.register(cdlEffect);
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it('applyAll skips inactive effects', () => {
    registry.register(colorInversionEffect);

    const img = createTestImageData(100, 150, 200);
    // colorInversionEnabled is false -> effect should be skipped
    registry.applyAll(img, { colorInversionEnabled: false });
    expect(img.data[0]).toBe(100);
    expect(img.data[1]).toBe(150);
    expect(img.data[2]).toBe(200);
  });

  it('applyAll applies active effects in order', () => {
    registry.register(colorInversionEffect);

    const img = createTestImageData(100, 150, 200);
    registry.applyAll(img, { colorInversionEnabled: true });
    // Inversion: 255 - original
    expect(img.data[0]).toBe(155);
    expect(img.data[1]).toBe(105);
    expect(img.data[2]).toBe(55);
  });

  it('applyByCategory applies only effects in the given category', () => {
    registry.register(colorInversionEffect); // color
    registry.register(highlightsShadowsEffect); // tone

    const img = createTestImageData(100, 150, 200);
    registry.applyByCategory('color', img, {
      colorInversionEnabled: true,
      highlights: 50,
    });
    // Only inversion applied, not highlights
    expect(img.data[0]).toBe(155);
  });
});

// ---------------------------------------------------------------------------
// Adapter: ColorInversion
// ---------------------------------------------------------------------------

describe('colorInversionEffect adapter', () => {
  it('isActive returns false when disabled', () => {
    expect(colorInversionEffect.isActive({ colorInversionEnabled: false })).toBe(false);
    expect(colorInversionEffect.isActive({})).toBe(false);
  });

  it('isActive returns true when enabled', () => {
    expect(colorInversionEffect.isActive({ colorInversionEnabled: true })).toBe(true);
  });

  it('inverts pixel values', () => {
    const img = createTestImageData(0, 128, 255);
    colorInversionEffect.apply(img, {});
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBe(127);
    expect(img.data[2]).toBe(0);
    expect(img.data[3]).toBe(255); // alpha preserved
  });
});

// ---------------------------------------------------------------------------
// Adapter: CDL
// ---------------------------------------------------------------------------

describe('cdlEffect adapter', () => {
  it('isActive returns false for default CDL', () => {
    expect(cdlEffect.isActive({ cdlValues: DEFAULT_CDL })).toBe(false);
  });

  it('isActive returns false when no cdlValues key', () => {
    expect(cdlEffect.isActive({})).toBe(false);
  });

  it('isActive returns true for non-default CDL', () => {
    const cdl = {
      ...DEFAULT_CDL,
      slope: { r: 1.2, g: 1.0, b: 1.0 },
    };
    expect(cdlEffect.isActive({ cdlValues: cdl })).toBe(true);
  });

  it('applies CDL slope to pixels', () => {
    const img = createTestImageData(128, 128, 128);
    const cdl = {
      slope: { r: 2.0, g: 1.0, b: 0.5 },
      offset: { r: 0, g: 0, b: 0 },
      power: { r: 1, g: 1, b: 1 },
      saturation: 1.0,
    };
    cdlEffect.apply(img, { cdlValues: cdl });
    // R channel: round(min(1, 128/255 * 2.0) * 255) = 255  (clamped)
    expect(img.data[0]).toBe(255);
    // G channel unchanged
    expect(img.data[1]).toBe(128);
    // B channel: round(min(1, 128/255 * 0.5) * 255) ~ 64
    expect(img.data[2]).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// Adapter: Hue Rotation
// ---------------------------------------------------------------------------

describe('hueRotationEffect adapter', () => {
  it('isActive returns false for 0 degrees', () => {
    expect(hueRotationEffect.isActive({ hueRotation: 0 })).toBe(false);
  });

  it('isActive returns false when key is missing', () => {
    expect(hueRotationEffect.isActive({})).toBe(false);
  });

  it('isActive returns true for non-zero degrees', () => {
    expect(hueRotationEffect.isActive({ hueRotation: 90 })).toBe(true);
  });

  it('rotates hues (pure red at 120 degrees should shift towards green/blue)', () => {
    const img = createTestImageData(255, 0, 0);
    hueRotationEffect.apply(img, { hueRotation: 120 });
    // After 120 degree rotation, red should shift towards blue
    // Exact values depend on the luminance-preserving matrix, but R should decrease
    expect(img.data[0]).toBeLessThan(255);
  });
});

// ---------------------------------------------------------------------------
// Adapter: Highlights / Shadows
// ---------------------------------------------------------------------------

describe('highlightsShadowsEffect adapter', () => {
  it('isActive returns false when all params are 0', () => {
    expect(
      highlightsShadowsEffect.isActive({
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
      })
    ).toBe(false);
  });

  it('isActive returns false when params are missing', () => {
    expect(highlightsShadowsEffect.isActive({})).toBe(false);
  });

  it('isActive returns true when highlights is nonzero', () => {
    expect(highlightsShadowsEffect.isActive({ highlights: -50 })).toBe(true);
  });

  it('applies highlight recovery to bright pixels', () => {
    const img = createTestImageData(240, 240, 240);
    // Positive highlights: highlightAdjust = highlights * mask * 128, subtracted from pixel.
    // For bright pixel (240), the highlight mask is high, so the result should decrease.
    highlightsShadowsEffect.apply(img, { highlights: 100 });
    expect(img.data[0]).toBeLessThan(240);
  });
});

// ---------------------------------------------------------------------------
// Adapter: Tone Mapping
// ---------------------------------------------------------------------------

describe('toneMappingEffect adapter', () => {
  it('isActive returns false when disabled', () => {
    expect(
      toneMappingEffect.isActive({
        toneMappingEnabled: false,
        toneMappingOperator: 'reinhard',
      })
    ).toBe(false);
  });

  it('isActive returns false when operator is off', () => {
    expect(
      toneMappingEffect.isActive({
        toneMappingEnabled: true,
        toneMappingOperator: 'off',
      })
    ).toBe(false);
  });

  it('isActive returns true when enabled with valid operator', () => {
    expect(
      toneMappingEffect.isActive({
        toneMappingEnabled: true,
        toneMappingOperator: 'aces',
      })
    ).toBe(true);
  });

  it('applies tone mapping (Reinhard) and compresses values', () => {
    const img = createTestImageData(200, 200, 200);
    toneMappingEffect.apply(img, {
      toneMappingEnabled: true,
      toneMappingOperator: 'reinhard',
    });
    // Reinhard: v / (1 + v). For 200/255 ~ 0.784 -> 0.784/1.784 ~ 0.439 -> ~112
    // Values should be compressed (lower than original)
    expect(img.data[0]).toBeLessThan(200);
    expect(img.data[0]).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Adapter: Deinterlace
// ---------------------------------------------------------------------------

describe('deinterlaceEffect adapter', () => {
  it('isActive returns false when disabled', () => {
    expect(deinterlaceEffect.isActive({ deinterlaceEnabled: false })).toBe(false);
    expect(deinterlaceEffect.isActive({})).toBe(false);
  });

  it('isActive returns false for weave (no-op) even when enabled', () => {
    expect(
      deinterlaceEffect.isActive({
        deinterlaceEnabled: true,
        deinterlaceMethod: 'weave',
      })
    ).toBe(false);
  });

  it('isActive returns true for bob when enabled', () => {
    expect(
      deinterlaceEffect.isActive({
        deinterlaceEnabled: true,
        deinterlaceMethod: 'bob',
      })
    ).toBe(true);
  });

  it('isActive returns true for blend when enabled', () => {
    expect(
      deinterlaceEffect.isActive({
        deinterlaceEnabled: true,
        deinterlaceMethod: 'blend',
      })
    ).toBe(true);
  });

  it('bob deinterlace modifies interlaced pattern', () => {
    // Create interlaced pattern: even lines white (255), odd lines black (0)
    const data = new Uint8ClampedArray(4 * 4 * 4); // 4x4
    for (let y = 0; y < 4; y++) {
      const value = y % 2 === 0 ? 255 : 0;
      for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 4;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
    }
    const img = new ImageData(data, 4, 4);

    deinterlaceEffect.apply(img, {
      deinterlaceEnabled: true,
      deinterlaceMethod: 'bob',
      deinterlaceFieldOrder: 'tff',
    });

    // TFF bob keeps even lines (white=255), interpolates odd lines
    // Odd line 1: average of line 0 (255) and line 2 (255) = 255
    // So after bob TFF on this pattern, all lines should be 255
    expect(img.data[0]).toBe(255); // line 0 kept
    expect(img.data[4 * 4]).toBe(255); // line 1 interpolated: (255+255)/2
  });

  it('weave returns data unchanged', () => {
    const img = createTestImageData(100, 200, 50);
    const original = new Uint8ClampedArray(img.data);

    deinterlaceEffect.apply(img, {
      deinterlaceEnabled: true,
      deinterlaceMethod: 'weave',
    });

    expect(img.data).toEqual(original);
  });

  it('preserves alpha channel', () => {
    const img = createTestImageData(128, 128, 128, 200);

    deinterlaceEffect.apply(img, {
      deinterlaceEnabled: true,
      deinterlaceMethod: 'bob',
      deinterlaceFieldOrder: 'tff',
    });

    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// Adapter: Film Emulation
// ---------------------------------------------------------------------------

describe('filmEmulationEffect adapter', () => {
  it('isActive returns false when disabled', () => {
    expect(filmEmulationEffect.isActive({ filmEmulationEnabled: false })).toBe(false);
    expect(filmEmulationEffect.isActive({})).toBe(false);
  });

  it('isActive returns false when intensity is 0', () => {
    expect(
      filmEmulationEffect.isActive({
        filmEmulationEnabled: true,
        filmEmulationIntensity: 0,
      })
    ).toBe(false);
  });

  it('isActive returns true when enabled with default intensity', () => {
    expect(
      filmEmulationEffect.isActive({
        filmEmulationEnabled: true,
      })
    ).toBe(true);
  });

  it('applies film emulation and modifies pixels', () => {
    const img = createTestImageData(128, 128, 128);

    filmEmulationEffect.apply(img, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'kodak-portra-400',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 0,
      filmEmulationSeed: 0,
    });

    // Portra has warm shift + saturation change, so pixels should differ
    const changed = img.data[0] !== 128 || img.data[1] !== 128 || img.data[2] !== 128;
    expect(changed).toBe(true);
  });

  it('does not modify pixels when disabled', () => {
    const img = createTestImageData(128, 128, 128);
    const original = new Uint8ClampedArray(img.data);

    filmEmulationEffect.apply(img, {
      filmEmulationEnabled: false,
      filmEmulationStock: 'kodak-portra-400',
    });

    expect(img.data).toEqual(original);
  });

  it('different stocks produce different results', () => {
    const img1 = createTestImageData(128, 100, 80);
    const img2 = createTestImageData(128, 100, 80);

    filmEmulationEffect.apply(img1, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'kodak-portra-400',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 0,
    });

    filmEmulationEffect.apply(img2, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'fuji-velvia-50',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 0,
    });

    let isDifferent = false;
    for (let i = 0; i < img1.data.length; i += 4) {
      if (img1.data[i] !== img2.data[i] || img1.data[i + 1] !== img2.data[i + 1] || img1.data[i + 2] !== img2.data[i + 2]) {
        isDifferent = true;
        break;
      }
    }
    expect(isDifferent).toBe(true);
  });

  it('B&W stock desaturates to grayscale', () => {
    const img = createTestImageData(200, 100, 50);

    filmEmulationEffect.apply(img, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'kodak-tri-x-400',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 0,
    });

    // R ≈ G ≈ B for B&W stock
    expect(Math.abs(img.data[0]! - img.data[1]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(img.data[1]! - img.data[2]!)).toBeLessThanOrEqual(1);
  });

  it('preserves alpha channel', () => {
    const img = createTestImageData(128, 128, 128, 180);

    filmEmulationEffect.apply(img, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'kodak-portra-400',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 50,
      filmEmulationSeed: 42,
    });

    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(180);
    }
  });

  it('intensity controls blend strength', () => {
    const imgLow = createTestImageData(128, 100, 80);
    const imgHigh = createTestImageData(128, 100, 80);
    const original = createTestImageData(128, 100, 80);

    filmEmulationEffect.apply(imgLow, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'fuji-velvia-50',
      filmEmulationIntensity: 25,
      filmEmulationGrain: 0,
    });

    filmEmulationEffect.apply(imgHigh, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'fuji-velvia-50',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 0,
    });

    // Low intensity should be closer to original than high intensity
    let diffLow = 0;
    let diffHigh = 0;
    for (let i = 0; i < original.data.length; i += 4) {
      diffLow += Math.abs(imgLow.data[i]! - original.data[i]!);
      diffHigh += Math.abs(imgHigh.data[i]! - original.data[i]!);
    }
    expect(diffLow).toBeLessThan(diffHigh);
  });
});

// ---------------------------------------------------------------------------
// Registry integration: Deinterlace + Film Emulation in pipeline
// ---------------------------------------------------------------------------

describe('EffectRegistry pipeline with new effects', () => {
  let registry: EffectRegistry;

  beforeEach(() => {
    registry = new EffectRegistry();
  });

  it('deinterlace is categorized as spatial', () => {
    registry.register(deinterlaceEffect);
    const spatial = registry.getByCategory('spatial');
    expect(spatial.map((e) => e.name)).toContain('deinterlace');
  });

  it('filmEmulation is categorized as color', () => {
    registry.register(filmEmulationEffect);
    const color = registry.getByCategory('color');
    expect(color.map((e) => e.name)).toContain('filmEmulation');
  });

  it('applyAll skips disabled deinterlace and film emulation', () => {
    registry.register(deinterlaceEffect);
    registry.register(filmEmulationEffect);

    const img = createTestImageData(128, 128, 128);
    const original = new Uint8ClampedArray(img.data);

    registry.applyAll(img, {
      deinterlaceEnabled: false,
      filmEmulationEnabled: false,
    });

    expect(img.data).toEqual(original);
  });

  it('applyAll applies active deinterlace effect', () => {
    registry.register(deinterlaceEffect);

    // Create 2x2 interlaced pattern
    const data = new Uint8ClampedArray(2 * 2 * 4);
    // Line 0: white
    data[0] = 255; data[1] = 255; data[2] = 255; data[3] = 255;
    data[4] = 255; data[5] = 255; data[6] = 255; data[7] = 255;
    // Line 1: black
    data[8] = 0; data[9] = 0; data[10] = 0; data[11] = 255;
    data[12] = 0; data[13] = 0; data[14] = 0; data[15] = 255;
    const img = new ImageData(data, 2, 2);

    registry.applyAll(img, {
      deinterlaceEnabled: true,
      deinterlaceMethod: 'blend',
    });

    // Blend: line 0 averaged with line 1 → ~127, line 1 averaged with line 0 → ~127
    expect(img.data[0]).toBeGreaterThan(100);
    expect(img.data[0]).toBeLessThan(160);
    expect(img.data[8]).toBeGreaterThan(100);
    expect(img.data[8]).toBeLessThan(160);
  });

  it('applyAll applies active film emulation effect', () => {
    registry.register(filmEmulationEffect);

    const img = createTestImageData(128, 128, 128);
    registry.applyAll(img, {
      filmEmulationEnabled: true,
      filmEmulationStock: 'kodak-ektar-100',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 0,
    });

    // Ektar has strong S-curve + high saturation — gray input changes
    const changed = img.data[0] !== 128 || img.data[1] !== 128 || img.data[2] !== 128;
    expect(changed).toBe(true);
  });

  it('applyByCategory spatial applies deinterlace but not film emulation', () => {
    registry.register(deinterlaceEffect); // spatial
    registry.register(filmEmulationEffect); // color

    const data = new Uint8ClampedArray(2 * 2 * 4);
    data[0] = 255; data[1] = 255; data[2] = 255; data[3] = 255;
    data[4] = 255; data[5] = 255; data[6] = 255; data[7] = 255;
    data[8] = 0; data[9] = 0; data[10] = 0; data[11] = 255;
    data[12] = 0; data[13] = 0; data[14] = 0; data[15] = 255;
    const img = new ImageData(data, 2, 2);

    registry.applyByCategory('spatial', img, {
      deinterlaceEnabled: true,
      deinterlaceMethod: 'blend',
      filmEmulationEnabled: true,
      filmEmulationStock: 'kodak-portra-400',
    });

    // Only deinterlace should have run (spatial), not film emulation (color)
    // Blend averages lines → midtones
    expect(img.data[0]).toBeGreaterThan(100);
    expect(img.data[0]).toBeLessThan(160);
  });

  it('multiple effects chain correctly: deinterlace then film emulation', () => {
    registry.register(deinterlaceEffect);
    registry.register(filmEmulationEffect);

    const data = new Uint8ClampedArray(2 * 2 * 4);
    data[0] = 255; data[1] = 255; data[2] = 255; data[3] = 255;
    data[4] = 255; data[5] = 255; data[6] = 255; data[7] = 255;
    data[8] = 0; data[9] = 0; data[10] = 0; data[11] = 255;
    data[12] = 0; data[13] = 0; data[14] = 0; data[15] = 255;
    const img = new ImageData(data, 2, 2);

    registry.applyAll(img, {
      deinterlaceEnabled: true,
      deinterlaceMethod: 'blend',
      filmEmulationEnabled: true,
      filmEmulationStock: 'kodak-tri-x-400',
      filmEmulationIntensity: 100,
      filmEmulationGrain: 0,
    });

    // Both effects ran: deinterlace blended, then B&W film applied
    // Result should be grayscale midtones
    expect(img.data[0]).toBeGreaterThan(50);
    expect(img.data[0]).toBeLessThan(220);
    // B&W: R ≈ G ≈ B
    expect(Math.abs(img.data[0]! - img.data[1]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(img.data[1]! - img.data[2]!)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Interface contract tests
// ---------------------------------------------------------------------------

describe('ImageEffect interface contract', () => {
  const allAdapters: ImageEffect[] = [
    colorInversionEffect,
    cdlEffect,
    hueRotationEffect,
    highlightsShadowsEffect,
    toneMappingEffect,
    deinterlaceEffect,
    filmEmulationEffect,
    noiseReductionEffect,
  ];

  it('every adapter has a non-empty name', () => {
    for (const effect of allAdapters) {
      expect(effect.name).toBeTruthy();
      expect(typeof effect.name).toBe('string');
    }
  });

  it('every adapter has a non-empty label', () => {
    for (const effect of allAdapters) {
      expect(effect.label).toBeTruthy();
      expect(typeof effect.label).toBe('string');
    }
  });

  it('every adapter has a valid category', () => {
    const valid = new Set(['color', 'tone', 'spatial', 'diagnostic']);
    for (const effect of allAdapters) {
      expect(valid.has(effect.category)).toBe(true);
    }
  });

  it('all adapter names are unique', () => {
    const names = allAdapters.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
