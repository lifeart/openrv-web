import { describe, it, expect, beforeEach } from 'vitest';
import {
  EffectRegistry,
  colorInversionEffect,
  cdlEffect,
  hueRotationEffect,
  highlightsShadowsEffect,
  toneMappingEffect,
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
// Interface contract tests
// ---------------------------------------------------------------------------

describe('ImageEffect interface contract', () => {
  const allAdapters: ImageEffect[] = [
    colorInversionEffect,
    cdlEffect,
    hueRotationEffect,
    highlightsShadowsEffect,
    toneMappingEffect,
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
