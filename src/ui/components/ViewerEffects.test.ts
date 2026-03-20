/**
 * ViewerEffects Integration Tests
 *
 * Tests for pixel-level image processing utilities:
 * - applyHighlightsShadows (SDR)
 * - applyHighlightsShadowsHDR
 * - applyVibrance
 * - applyClarity
 * - applyToneMapping
 * - applyToneMappingWithParams
 * - applyToneMappingHDR
 * - applySharpenCPU
 */

import { describe, it, expect } from 'vitest';
import {
  applyHighlightsShadows,
  applyHighlightsShadowsHDR,
  applyVibrance,
  applyClarity,
  applyToneMapping,
  applyToneMappingWithParams,
  applyToneMappingHDR,
  applySharpenCPU,
  type HighlightsShadowsParams,
} from './ViewerEffects';
import type { ToneMappingState } from './ToneMappingControl';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal 1-pixel ImageData with the given RGBA values. */
function makePixel(r: number, g: number, b: number, a = 255): ImageData {
  const data = new Uint8ClampedArray([r, g, b, a]);
  return { data, width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
}

/** Create a uniform NxN ImageData filled with a single colour. */
function makeUniform(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
}

/** Read a single pixel from ImageData at (x, y). */
function readPixel(img: ImageData, x: number, y: number) {
  const idx = (y * img.width + x) * 4;
  return {
    r: img.data[idx]!,
    g: img.data[idx + 1]!,
    b: img.data[idx + 2]!,
    a: img.data[idx + 3]!,
  };
}

/** Default "no-op" highlights/shadows params. */
const NEUTRAL_HS: HighlightsShadowsParams = {
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
};

// ---------------------------------------------------------------------------
// applyHighlightsShadows (SDR)
// ---------------------------------------------------------------------------

describe('applyHighlightsShadows', () => {
  it('leaves pixels unchanged when all params are zero', () => {
    const img = makePixel(128, 64, 200);
    applyHighlightsShadows(img, NEUTRAL_HS);
    expect(img.data[0]).toBe(128);
    expect(img.data[1]).toBe(64);
    expect(img.data[2]).toBe(200);
    expect(img.data[3]).toBe(255); // alpha unchanged
  });

  it('preserves alpha channel', () => {
    const img = makePixel(200, 200, 200, 42);
    applyHighlightsShadows(img, { highlights: -50, shadows: 0, whites: 0, blacks: 0 });
    expect(img.data[3]).toBe(42);
  });

  it('negative highlights recovers (brightens) bright pixels', () => {
    // Bright pixel (high luminance) — negative highlights recovery pushes highlights brighter
    // highlightAdjust = highlights(-1) * mask * 128 => negative => r = r - negative => increases
    const img = makePixel(200, 200, 200);
    const before = img.data[0]!;
    applyHighlightsShadows(img, { highlights: -100, shadows: 0, whites: 0, blacks: 0 });
    // Should have strictly increased
    expect(img.data[0]!).toBeGreaterThan(before);
  });

  it('positive highlights compresses (decreases) bright pixels', () => {
    // Moderately bright pixel — not already at 255
    const img = makePixel(180, 180, 180);
    const before = img.data[0]!;
    applyHighlightsShadows(img, { highlights: 100, shadows: 0, whites: 0, blacks: 0 });
    // highlightAdjust = highlights(+1) * mask * 128 => positive => r = r - positive => decreases
    expect(img.data[0]!).toBeLessThan(before);
  });

  it('does not affect dark pixels when adjusting highlights', () => {
    // Dark pixel — luminance well below 0.5 threshold
    const img = makePixel(10, 10, 10);
    applyHighlightsShadows(img, { highlights: -100, shadows: 0, whites: 0, blacks: 0 });
    // Highlight mask is ~0 for dark pixels, so no change expected
    expect(img.data[0]).toBe(10);
    expect(img.data[1]).toBe(10);
    expect(img.data[2]).toBe(10);
  });

  it('positive shadows lifts dark pixels', () => {
    const img = makePixel(20, 20, 20);
    const before = img.data[0]!;
    applyHighlightsShadows(img, { highlights: 0, shadows: 100, whites: 0, blacks: 0 });
    expect(img.data[0]!).toBeGreaterThan(before);
  });

  it('negative shadows crushes dark pixels', () => {
    const img = makePixel(40, 40, 40);
    const before = img.data[0]!;
    applyHighlightsShadows(img, { highlights: 0, shadows: -100, whites: 0, blacks: 0 });
    expect(img.data[0]!).toBeLessThan(before);
  });

  it('does not affect bright pixels when adjusting shadows', () => {
    const img = makePixel(240, 240, 240);
    applyHighlightsShadows(img, { highlights: 0, shadows: 100, whites: 0, blacks: 0 });
    // Shadow mask is ~0 for bright pixels
    expect(img.data[0]).toBe(240);
  });

  it('positive whites lowers white clipping point (clips brights)', () => {
    const img = makePixel(230, 230, 230);
    applyHighlightsShadows(img, { highlights: 0, shadows: 0, whites: 100, blacks: 0 });
    // White point moves down from 255 to 200 — remapping stretches [0,200] to [0,255]
    // 230 is above the new whitePoint of 200, so should clip to 255
    expect(img.data[0]!).toBe(255);
  });

  it('positive blacks raises black clipping point (clips darks)', () => {
    const img = makePixel(30, 30, 30);
    applyHighlightsShadows(img, { highlights: 0, shadows: 0, whites: 0, blacks: 100 });
    // Black point raises to 55, so value 30 (below blackPoint) maps to 0
    expect(img.data[0]!).toBe(0);
  });

  it('clamps output values to [0, 255] under extreme settings', () => {
    // Extreme combined settings that would push values out of range without clamping
    const img = makePixel(250, 5, 128);
    applyHighlightsShadows(img, { highlights: -100, shadows: 100, whites: 100, blacks: 100 });
    for (let c = 0; c < 3; c++) {
      const val = img.data[c]!;
      expect(Number.isFinite(val)).toBe(true);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(255);
    }
    // Verify the extreme settings actually modified the pixel values (not a no-op)
    const originalG = 5;
    expect(img.data[1]!).not.toBe(originalG);
  });

  it('processes multi-pixel images correctly', () => {
    const img = makeUniform(4, 4, 200, 200, 200);
    applyHighlightsShadows(img, { highlights: -50, shadows: 0, whites: 0, blacks: 0 });
    // All pixels should be identical (uniform input => uniform output)
    const first = readPixel(img, 0, 0);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const p = readPixel(img, x, y);
        expect(p.r).toBe(first.r);
        expect(p.g).toBe(first.g);
        expect(p.b).toBe(first.b);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// applyHighlightsShadowsHDR
// ---------------------------------------------------------------------------

describe('applyHighlightsShadowsHDR', () => {
  it('leaves pixels unchanged when all params are zero', () => {
    const img = makePixel(128, 128, 128);
    const hdr = new Float32Array([0.5, 0.5, 0.5]);
    applyHighlightsShadowsHDR(img, NEUTRAL_HS, hdr, 3, 1.0);
    expect(img.data[0]).toBe(128);
    expect(img.data[1]).toBe(128);
    expect(img.data[2]).toBe(128);
  });

  it('preserves alpha channel', () => {
    const img = makePixel(128, 128, 128, 99);
    const hdr = new Float32Array([0.5, 0.5, 0.5]);
    applyHighlightsShadowsHDR(img, { highlights: -50, shadows: 50, whites: 0, blacks: 0 }, hdr, 3, 1.0);
    expect(img.data[3]).toBe(99);
  });

  it('handles HDR values exceeding 1.0', () => {
    const img = makePixel(255, 255, 255);
    const hdr = new Float32Array([3.0, 3.0, 3.0]);
    applyHighlightsShadowsHDR(img, { highlights: -100, shadows: 0, whites: 0, blacks: 0 }, hdr, 3, 5.0);
    // With peak=5.0, normalized luminance=3.0/5.0=0.6, which is in the highlight mask range
    // Should compress the value
    for (let c = 0; c < 3; c++) {
      expect(img.data[c]!).toBeGreaterThanOrEqual(0);
      expect(img.data[c]!).toBeLessThanOrEqual(255);
    }
  });

  it('handles single-channel HDR data', () => {
    const img = makePixel(128, 128, 128);
    const hdr = new Float32Array([0.8]);
    applyHighlightsShadowsHDR(img, NEUTRAL_HS, hdr, 1, 1.0);
    // Single channel is replicated to g and b
    expect(img.data[0]).toBe(img.data[1]);
    expect(img.data[1]).toBe(img.data[2]);
  });

  it('defaults peak to 1.0 when not specified', () => {
    const img = makePixel(128, 128, 128);
    const hdr = new Float32Array([0.5, 0.5, 0.5]);
    applyHighlightsShadowsHDR(img, NEUTRAL_HS, hdr, 3);
    expect(img.data[0]).toBe(128);
  });

  it('clamps output to [0, 255]', () => {
    const img = makePixel(0, 0, 0);
    const hdr = new Float32Array([2.0, 2.0, 2.0]);
    applyHighlightsShadowsHDR(img, { highlights: -100, shadows: 100, whites: 100, blacks: 100 }, hdr, 3, 2.0);
    for (let c = 0; c < 3; c++) {
      expect(img.data[c]!).toBeGreaterThanOrEqual(0);
      expect(img.data[c]!).toBeLessThanOrEqual(255);
    }
  });

  it('whites/blacks clip HDR data correctly', () => {
    // Bright HDR pixel — whites clips highlight region
    const imgWhites = makePixel(255, 255, 255);
    const hdrWhites = new Float32Array([0.9, 0.9, 0.9]);
    applyHighlightsShadowsHDR(imgWhites, { highlights: 0, shadows: 0, whites: 100, blacks: 0 }, hdrWhites, 3, 1.0);
    // With whites=100, whitePoint drops — 0.9 exceeds it so should clip to 255
    expect(imgWhites.data[0]!).toBe(255);

    // Dark HDR pixel — blacks clips shadow region
    const imgBlacks = makePixel(128, 128, 128);
    const hdrBlacks = new Float32Array([0.1, 0.1, 0.1]);
    applyHighlightsShadowsHDR(imgBlacks, { highlights: 0, shadows: 0, whites: 0, blacks: 100 }, hdrBlacks, 3, 1.0);
    // With blacks=100, blackPoint raises — 0.1 falls below it so should clip to 0
    expect(imgBlacks.data[0]!).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyVibrance
// ---------------------------------------------------------------------------

describe('applyVibrance', () => {
  it('leaves pixels unchanged when vibrance is zero', () => {
    const img = makePixel(200, 100, 50);
    applyVibrance(img, { vibrance: 0, skinProtection: false });
    expect(img.data[0]).toBe(200);
    expect(img.data[1]).toBe(100);
    expect(img.data[2]).toBe(50);
  });

  it('preserves alpha channel', () => {
    const img = makePixel(200, 100, 50, 77);
    applyVibrance(img, { vibrance: 50, skinProtection: false });
    expect(img.data[3]).toBe(77);
  });

  it('achromatic pixels are affected by vibrance (satFactor is max at s=0)', () => {
    // Grey pixel has saturation 0, but satFactor = 1-0*0.5 = 1.0,
    // so vibrance fully applies, pushing saturation from 0 towards 1.
    // This converts the achromatic pixel to a saturated colour via HSL.
    const img = makePixel(128, 128, 128);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    // The pixel should have changed (hue=0 => red-ish after saturation boost)
    const changed = img.data[0] !== 128 || img.data[1] !== 128 || img.data[2] !== 128;
    expect(changed).toBe(true);
  });

  it('positive vibrance increases saturation of low-saturation colours', () => {
    // A slightly warm grey (low saturation)
    const img = makePixel(140, 130, 120);
    const before = [img.data[0]!, img.data[1]!, img.data[2]!];
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    // At least one channel should have changed
    const changed = before.some((v, i) => v !== img.data[i]!);
    expect(changed).toBe(true);
  });

  it('negative vibrance decreases saturation', () => {
    const img = makePixel(255, 0, 0); // Fully saturated red
    applyVibrance(img, { vibrance: -100, skinProtection: false });
    // Should desaturate — green and blue should increase, red may decrease
    // The channels should converge towards the luminance
    expect(img.data[1]!).toBeGreaterThan(0);
  });

  it('skin protection reduces effect for skin-tone hues', () => {
    // Skin-tone colour: warm orange, moderate saturation, mid-lightness
    // Hue ~30 degrees, which is in the 20-50 range
    // RGB for ~30deg hue, ~40% sat, ~50% lightness
    const imgNoProtection = makePixel(179, 145, 112);
    const imgWithProtection = makePixel(179, 145, 112);

    applyVibrance(imgNoProtection, { vibrance: 100, skinProtection: false });
    applyVibrance(imgWithProtection, { vibrance: 100, skinProtection: true });

    // With skin protection, the change should be less pronounced
    const diffNoProtect = Math.abs(imgNoProtection.data[0]! - 179);
    const diffWithProtect = Math.abs(imgWithProtection.data[0]! - 179);
    // Guard: vibrance must actually change the pixel without protection
    expect(diffNoProtect).toBeGreaterThan(0);
    // With protection, change should be strictly less than without
    expect(diffWithProtect).toBeLessThan(diffNoProtect);
  });

  it('clamps output to [0, 255]', () => {
    const img = makePixel(254, 1, 128);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    for (let c = 0; c < 3; c++) {
      expect(img.data[c]!).toBeGreaterThanOrEqual(0);
      expect(img.data[c]!).toBeLessThanOrEqual(255);
    }
  });
});

// ---------------------------------------------------------------------------
// applyClarity
// ---------------------------------------------------------------------------

describe('applyClarity', () => {
  it('leaves image unchanged when clarity is zero', () => {
    const img = makeUniform(4, 4, 128, 128, 128);
    const before = new Uint8ClampedArray(img.data);
    applyClarity(img, 0);
    expect(img.data).toEqual(before);
  });

  it('preserves alpha channel', () => {
    const img = makeUniform(4, 4, 128, 128, 128, 42);
    applyClarity(img, 50);
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(42);
    }
  });

  it('uniform image stays unchanged regardless of clarity (no high-frequency detail)', () => {
    const img = makeUniform(8, 8, 100, 100, 100);
    const before = new Uint8ClampedArray(img.data);
    applyClarity(img, 100);
    // A uniform image has no high-frequency content, so clarity should have no visible effect
    expect(img.data).toEqual(before);
  });

  it('positive clarity enhances edges in non-uniform image', () => {
    // Create a simple image with a hard edge (left half dark, right half bright)
    const w = 8;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const val = x < w / 2 ? 60 : 200;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
    const before = new Uint8ClampedArray(data);

    applyClarity(img, 100);

    // The pixels near the edge should differ from the original
    let anyChanged = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== before[i]) {
        anyChanged = true;
        break;
      }
    }
    expect(anyChanged).toBe(true);
  });

  it('negative clarity softens edges', () => {
    const w = 8;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const val = x < w / 2 ? 60 : 200;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
    const before = new Uint8ClampedArray(data);

    applyClarity(img, -100);

    // Should have changed some pixels
    let anyChanged = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== before[i]) {
        anyChanged = true;
        break;
      }
    }
    expect(anyChanged).toBe(true);
  });

  it('clamps output to [0, 255]', () => {
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = i % 8 === 0 ? 5 : 250;
      data[i + 1] = data[i]!;
      data[i + 2] = data[i]!;
      data[i + 3] = 255;
    }
    const img = { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
    applyClarity(img, 100);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        expect(data[i + c]!).toBeGreaterThanOrEqual(0);
        expect(data[i + c]!).toBeLessThanOrEqual(255);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// applyToneMapping
// ---------------------------------------------------------------------------

describe('applyToneMapping', () => {
  it('does nothing when operator is "off"', () => {
    const img = makePixel(128, 64, 200);
    applyToneMapping(img, 'off');
    expect(img.data[0]).toBe(128);
    expect(img.data[1]).toBe(64);
    expect(img.data[2]).toBe(200);
  });

  it('preserves alpha channel', () => {
    const img = makePixel(200, 200, 200, 42);
    applyToneMapping(img, 'reinhard');
    expect(img.data[3]).toBe(42);
  });

  it('reinhard operator compresses values', () => {
    const img = makePixel(200, 200, 200);
    applyToneMapping(img, 'reinhard');
    // Reinhard maps x/(1+x) — output should be less than input for values above midtone
    for (let c = 0; c < 3; c++) {
      expect(img.data[c]!).toBeLessThan(200);
      expect(img.data[c]!).toBeGreaterThan(0);
    }
  });

  it('handles black pixels without NaN', () => {
    const img = makePixel(0, 0, 0);
    applyToneMapping(img, 'reinhard');
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(0);
  });

  it('handles white pixels without overflow', () => {
    const img = makePixel(255, 255, 255);
    applyToneMapping(img, 'aces');
    for (let c = 0; c < 3; c++) {
      // ACES compresses white — output should be less than 255
      expect(img.data[c]!).toBeLessThan(255);
      expect(img.data[c]!).toBeGreaterThan(0);
    }
  });

  it.each(['reinhard', 'filmic', 'aces', 'agx', 'pbrNeutral', 'gt', 'acesHill', 'drago'] as const)(
    '%s operator produces valid output that differs from input',
    (operator) => {
      const img = makePixel(180, 90, 45);
      applyToneMapping(img, operator);
      for (let c = 0; c < 3; c++) {
        expect(img.data[c]!).toBeGreaterThanOrEqual(0);
        expect(img.data[c]!).toBeLessThanOrEqual(255);
      }
      // Tone mapping should actually transform the pixel values
      expect(img.data[0]!).not.toBe(180);
    },
  );
});

// ---------------------------------------------------------------------------
// applyToneMappingWithParams
// ---------------------------------------------------------------------------

describe('applyToneMappingWithParams', () => {
  it('does nothing when state.enabled is false', () => {
    const img = makePixel(128, 64, 200);
    const state: ToneMappingState = { enabled: false, operator: 'reinhard' };
    applyToneMappingWithParams(img, state);
    expect(img.data[0]).toBe(128);
    expect(img.data[1]).toBe(64);
  });

  it('does nothing when operator is "off" even if enabled', () => {
    const img = makePixel(128, 64, 200);
    const state: ToneMappingState = { enabled: true, operator: 'off' };
    applyToneMappingWithParams(img, state);
    expect(img.data[0]).toBe(128);
  });

  it('applies tone mapping when enabled with valid operator', () => {
    const img = makePixel(200, 200, 200);
    const before = img.data[0]!;
    const state: ToneMappingState = {
      enabled: true,
      operator: 'reinhard',
      reinhardWhitePoint: 4.0,
    };
    applyToneMappingWithParams(img, state);
    // Should have changed the pixel
    expect(img.data[0]!).not.toBe(before);
  });

  it('passes per-operator parameters through', () => {
    // Two different white points should yield different results
    const img1 = makePixel(200, 200, 200);
    const img2 = makePixel(200, 200, 200);

    applyToneMappingWithParams(img1, {
      enabled: true,
      operator: 'reinhard',
      reinhardWhitePoint: 1.0,
    });
    applyToneMappingWithParams(img2, {
      enabled: true,
      operator: 'reinhard',
      reinhardWhitePoint: 10.0,
    });

    // Different parameters should produce different results
    const same = img1.data[0] === img2.data[0] && img1.data[1] === img2.data[1];
    expect(same).toBe(false);
  });

  it('preserves alpha channel', () => {
    const img = makePixel(200, 200, 200, 50);
    applyToneMappingWithParams(img, { enabled: true, operator: 'filmic' });
    expect(img.data[3]).toBe(50);
  });

  it('drago-specific parameters affect output', () => {
    const img1 = makePixel(200, 200, 200);
    const img2 = makePixel(200, 200, 200);

    applyToneMappingWithParams(img1, {
      enabled: true,
      operator: 'drago',
      dragoBias: 0.5,
      dragoLwa: 0.1,
      dragoLmax: 1.0,
      dragoBrightness: 1.0,
    });
    applyToneMappingWithParams(img2, {
      enabled: true,
      operator: 'drago',
      dragoBias: 1.0,
      dragoLwa: 0.5,
      dragoLmax: 5.0,
      dragoBrightness: 4.0,
    });

    // Different drago parameters should produce different results
    const same = img1.data[0] === img2.data[0] && img1.data[1] === img2.data[1];
    expect(same).toBe(false);
    // Both should still produce valid output
    for (let c = 0; c < 3; c++) {
      expect(img1.data[c]!).toBeGreaterThanOrEqual(0);
      expect(img1.data[c]!).toBeLessThanOrEqual(255);
      expect(img2.data[c]!).toBeGreaterThanOrEqual(0);
      expect(img2.data[c]!).toBeLessThanOrEqual(255);
    }
  });
});

// ---------------------------------------------------------------------------
// applyToneMappingHDR
// ---------------------------------------------------------------------------

describe('applyToneMappingHDR', () => {
  it('does nothing when operator is "off"', () => {
    const img = makePixel(128, 128, 128);
    const hdr = new Float32Array([0.5, 0.5, 0.5]);
    applyToneMappingHDR(img, 'off', hdr, 3);
    expect(img.data[0]).toBe(128);
  });

  it('maps HDR values > 1.0 into [0, 255]', () => {
    const img = makePixel(0, 0, 0);
    const hdr = new Float32Array([5.0, 3.0, 1.0]);
    applyToneMappingHDR(img, 'reinhard', hdr, 3);
    for (let c = 0; c < 3; c++) {
      expect(img.data[c]!).toBeGreaterThanOrEqual(0);
      expect(img.data[c]!).toBeLessThanOrEqual(255);
    }
    // Higher HDR value should map to higher output
    expect(img.data[0]!).toBeGreaterThan(img.data[2]!);
  });

  it('handles single-channel HDR data (greyscale)', () => {
    const img = makePixel(0, 0, 0);
    const hdr = new Float32Array([0.5]);
    applyToneMappingHDR(img, 'reinhard', hdr, 1);
    // Single channel replicated to g and b
    expect(img.data[0]).toBe(img.data[1]);
    expect(img.data[1]).toBe(img.data[2]);
  });

  it('handles two-channel HDR data', () => {
    const img = makePixel(0, 0, 0);
    const hdr = new Float32Array([0.8, 0.4]);
    applyToneMappingHDR(img, 'reinhard', hdr, 2);
    // channel 0 = r, channel 1 = g, b copies r
    expect(img.data[0]).toBe(img.data[2]); // b = r for 2-channel
  });

  it('preserves alpha channel', () => {
    const img = makePixel(0, 0, 0, 77);
    const hdr = new Float32Array([1.0, 1.0, 1.0]);
    applyToneMappingHDR(img, 'aces', hdr, 3);
    expect(img.data[3]).toBe(77);
  });

  it('handles 4-channel HDR data (RGBA float)', () => {
    const img = makePixel(0, 0, 0);
    // 4-channel HDR data: R=2.0, G=1.0, B=0.5, A=1.0 (alpha channel in float data)
    const hdr = new Float32Array([2.0, 1.0, 0.5, 1.0]);
    applyToneMappingHDR(img, 'reinhard', hdr, 4);
    // channels >= 3, so R, G, B are read from the first 3 floats
    // Higher HDR value should produce higher output
    expect(img.data[0]!).toBeGreaterThan(img.data[2]!);
    expect(img.data[0]!).toBeGreaterThan(0);
    expect(img.data[1]!).toBeGreaterThan(0);
    expect(img.data[2]!).toBeGreaterThan(0);
    // Alpha in ImageData should be preserved (unchanged from makePixel)
    expect(img.data[3]!).toBe(255);
  });

  it('handles NaN/Infinity in HDR data gracefully', () => {
    const img = makePixel(0, 0, 0);
    const hdr = new Float32Array([NaN, Infinity, -Infinity]);
    applyToneMappingHDR(img, 'reinhard', hdr, 3);
    // NaN should map to 0 (the fallback path)
    expect(img.data[0]!).toBe(0);
    // All channels should be valid finite integers in [0, 255]
    for (let c = 0; c < 3; c++) {
      expect(Number.isFinite(img.data[c]!)).toBe(true);
      expect(Number.isInteger(img.data[c]!)).toBe(true);
      expect(img.data[c]!).toBeGreaterThanOrEqual(0);
      expect(img.data[c]!).toBeLessThanOrEqual(255);
    }
  });
});

// ---------------------------------------------------------------------------
// applySharpenCPU
// ---------------------------------------------------------------------------

describe('applySharpenCPU', () => {
  it('leaves image unchanged when amount is 0', () => {
    const img = makeUniform(4, 4, 128, 128, 128);
    const before = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 0);
    expect(img.data).toEqual(before);
  });

  it('preserves alpha channel', () => {
    const img = makeUniform(4, 4, 128, 128, 128, 33);
    applySharpenCPU(img, 1.0);
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(33);
    }
  });

  it('does not modify border pixels (1px boundary skipped)', () => {
    const w = 6;
    const h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        // Checkerboard pattern for high-frequency content
        const val = (x + y) % 2 === 0 ? 50 : 200;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
    const before = new Uint8ClampedArray(data);

    applySharpenCPU(img, 1.0);

    // Top-left corner pixel (0,0) should remain unchanged — border
    expect(data[0]).toBe(before[0]);
    expect(data[1]).toBe(before[1]);
    expect(data[2]).toBe(before[2]);

    // Bottom-right corner pixel should remain unchanged
    const brIdx = ((h - 1) * w + (w - 1)) * 4;
    expect(data[brIdx]).toBe(before[brIdx]);
  });

  it('sharpens inner pixels of a non-uniform image', () => {
    const w = 6;
    const h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const val = (x + y) % 2 === 0 ? 50 : 200;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
    const before = new Uint8ClampedArray(data);

    applySharpenCPU(img, 1.0);

    // At least some inner pixel should have changed
    let anyChanged = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx] !== before[idx]) {
          anyChanged = true;
          break;
        }
      }
      if (anyChanged) break;
    }
    expect(anyChanged).toBe(true);
  });

  it('uniform image stays unchanged after sharpening (no edges)', () => {
    const img = makeUniform(6, 6, 100, 100, 100);
    const before = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 1.0);
    expect(img.data).toEqual(before);
  });

  it('blends based on amount parameter', () => {
    const w = 6;
    const h = 6;
    const makeCheckerboard = () => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const val = (x + y) % 2 === 0 ? 50 : 200;
          d[idx] = val;
          d[idx + 1] = val;
          d[idx + 2] = val;
          d[idx + 3] = 255;
        }
      }
      return { data: d, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
    };

    const imgLow = makeCheckerboard();
    const imgHigh = makeCheckerboard();
    applySharpenCPU(imgLow, 0.2);
    applySharpenCPU(imgHigh, 1.0);

    // Higher amount should produce more extreme changes at the same pixel
    // Pick an inner pixel
    const idx = (2 * w + 2) * 4;
    const original = 50; // pixel at (2,2) in checkerboard: (2+2)%2===0 → light
    const diffLow = Math.abs(imgLow.data[idx]! - original);
    const diffHigh = Math.abs(imgHigh.data[idx]! - original);
    expect(diffHigh).toBeGreaterThanOrEqual(diffLow);
  });
});
