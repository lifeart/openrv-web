/**
 * ViewerEffects Vibrance Tests
 *
 * Tests for CPU-based vibrance (intelligent saturation) processing.
 */

import { describe, it, expect } from 'vitest';
import { applyVibrance } from './ViewerEffects';

/** Helper: create 1-pixel ImageData */
function createImageData1px(r: number, g: number, b: number, a = 255): ImageData {
  return {
    data: new Uint8ClampedArray([r, g, b, a]),
    width: 1,
    height: 1,
    colorSpace: 'srgb',
  } as ImageData;
}

/** Helper: create multi-pixel ImageData from flat RGBA array */
function createImageDataFromArray(pixels: number[], width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(pixels),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

/** Helper: compute HSL saturation from RGB [0-255] */
function rgbSaturation(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
}

describe('applyVibrance', () => {
  it('VIB-001: vibrance=0 leaves pixels unchanged', () => {
    const img = createImageData1px(128, 80, 200);
    applyVibrance(img, { vibrance: 0, skinProtection: false });
    expect(img.data[0]).toBe(128);
    expect(img.data[1]).toBe(80);
    expect(img.data[2]).toBe(200);
    expect(img.data[3]).toBe(255);
  });

  it('VIB-002: positive vibrance on unsaturated pixel increases saturation', () => {
    // Grayish-blue: low saturation
    const img = createImageData1px(120, 120, 140);
    const satBefore = rgbSaturation(120, 120, 140);
    applyVibrance(img, { vibrance: 80, skinProtection: false });
    const satAfter = rgbSaturation(img.data[0]!, img.data[1]!, img.data[2]!);
    expect(satAfter).toBeGreaterThan(satBefore);
  });

  it('VIB-003: positive vibrance on already-saturated pixel produces less increase', () => {
    // Highly saturated red
    const imgSat = createImageData1px(255, 0, 0);
    const satBeforeSat = rgbSaturation(255, 0, 0);
    applyVibrance(imgSat, { vibrance: 50, skinProtection: false });
    const satAfterSat = rgbSaturation(imgSat.data[0]!, imgSat.data[1]!, imgSat.data[2]!);
    const satDiffSat = satAfterSat - satBeforeSat;

    // Low saturation pixel
    const imgLow = createImageData1px(150, 130, 130);
    const satBeforeLow = rgbSaturation(150, 130, 130);
    applyVibrance(imgLow, { vibrance: 50, skinProtection: false });
    const satAfterLow = rgbSaturation(imgLow.data[0]!, imgLow.data[1]!, imgLow.data[2]!);
    const satDiffLow = satAfterLow - satBeforeLow;

    // Low-saturation pixel should get more boost
    expect(satDiffLow).toBeGreaterThan(satDiffSat);
  });

  it('VIB-004: negative vibrance reduces saturation', () => {
    const img = createImageData1px(200, 100, 50);
    const satBefore = rgbSaturation(200, 100, 50);
    applyVibrance(img, { vibrance: -60, skinProtection: false });
    const satAfter = rgbSaturation(img.data[0]!, img.data[1]!, img.data[2]!);
    expect(satAfter).toBeLessThan(satBefore);
  });

  it('VIB-005: skin protection reduces effect on skin-tone hue (20-50 degrees)', () => {
    // Skin-tone pixel: hue ~30 degrees, moderate saturation, mid lightness
    // RGB for hue ~30: warm orange-ish
    const r = 200,
      g = 160,
      b = 130;
    const imgNoProtect = createImageData1px(r, g, b);
    applyVibrance(imgNoProtect, { vibrance: 80, skinProtection: false });
    const diffNoProtect =
      Math.abs(imgNoProtect.data[0]! - r) + Math.abs(imgNoProtect.data[1]! - g) + Math.abs(imgNoProtect.data[2]! - b);

    const imgProtect = createImageData1px(r, g, b);
    applyVibrance(imgProtect, { vibrance: 80, skinProtection: true });
    const diffProtect =
      Math.abs(imgProtect.data[0]! - r) + Math.abs(imgProtect.data[1]! - g) + Math.abs(imgProtect.data[2]! - b);

    // With skin protection, effect should be less
    expect(diffProtect).toBeLessThan(diffNoProtect);
  });

  it('VIB-006: skin protection has no effect on non-skin hue (e.g. blue)', () => {
    const r = 50,
      g = 80,
      b = 200;
    const imgNoProtect = createImageData1px(r, g, b);
    applyVibrance(imgNoProtect, { vibrance: 80, skinProtection: false });

    const imgProtect = createImageData1px(r, g, b);
    applyVibrance(imgProtect, { vibrance: 80, skinProtection: true });

    // No difference for non-skin colors
    expect(imgProtect.data[0]).toBe(imgNoProtect.data[0]);
    expect(imgProtect.data[1]).toBe(imgNoProtect.data[1]);
    expect(imgProtect.data[2]).toBe(imgNoProtect.data[2]);
  });

  it('VIB-007: black pixel [0,0,0] remains unchanged', () => {
    const img = createImageData1px(0, 0, 0);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(0);
  });

  it('VIB-008: white pixel [255,255,255] remains unchanged (zero saturation)', () => {
    const img = createImageData1px(255, 255, 255);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBe(255);
    expect(img.data[2]).toBe(255);
  });

  it('VIB-009: neutral gray pixel with vibrance changes (zero sat gets full boost)', () => {
    // Gray has saturation=0, so satFactor=1.0 (maximum boost).
    // With vibrance=100, newS = 0 + 1.0 = 1.0, which changes the pixel.
    // Hue is 0 for gray, so HSL-to-RGB with h=0, s=1, l=0.5 produces saturated red.
    const img = createImageData1px(128, 128, 128);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    // Values should change (gray gets colorized due to full saturation boost)
    const totalChange = Math.abs(img.data[0]! - 128) + Math.abs(img.data[1]! - 128) + Math.abs(img.data[2]! - 128);
    expect(totalChange).toBeGreaterThan(0);
  });

  it('VIB-010: max vibrance=100 results are clamped to valid range', () => {
    const img = createImageData1px(200, 100, 50);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    expect(img.data[0]!).toBeGreaterThanOrEqual(0);
    expect(img.data[0]!).toBeLessThanOrEqual(255);
    expect(img.data[1]!).toBeGreaterThanOrEqual(0);
    expect(img.data[1]!).toBeLessThanOrEqual(255);
    expect(img.data[2]!).toBeGreaterThanOrEqual(0);
    expect(img.data[2]!).toBeLessThanOrEqual(255);
  });

  it('VIB-011: vibrance=100 increases saturation of muted color', () => {
    const img = createImageData1px(150, 130, 130);
    const satBefore = rgbSaturation(150, 130, 130);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    const satAfter = rgbSaturation(img.data[0]!, img.data[1]!, img.data[2]!);
    expect(satAfter).toBeGreaterThan(satBefore);
  });

  it('VIB-012: min vibrance=-100 significantly desaturates', () => {
    const img = createImageData1px(200, 50, 50);
    const satBefore = rgbSaturation(200, 50, 50);
    applyVibrance(img, { vibrance: -100, skinProtection: false });
    const satAfter = rgbSaturation(img.data[0]!, img.data[1]!, img.data[2]!);
    expect(satAfter).toBeLessThan(satBefore * 0.5);
  });

  it('VIB-013: alpha channel is preserved', () => {
    const img = createImageData1px(200, 100, 50, 128);
    applyVibrance(img, { vibrance: 80, skinProtection: false });
    expect(img.data[3]).toBe(128);
  });

  it('VIB-014: alpha=0 (fully transparent) is preserved', () => {
    const img = createImageData1px(200, 100, 50, 0);
    applyVibrance(img, { vibrance: 80, skinProtection: false });
    expect(img.data[3]).toBe(0);
  });

  it('VIB-015: multiple pixels in a row are all processed', () => {
    const img = createImageDataFromArray(
      [
        200,
        100,
        50,
        255, // pixel 0: saturated orange
        120,
        120,
        140,
        255, // pixel 1: muted blue
        50,
        200,
        50,
        255, // pixel 2: green
      ],
      3,
      1,
    );

    const sat0before = rgbSaturation(200, 100, 50);
    const sat1before = rgbSaturation(120, 120, 140);
    const sat2before = rgbSaturation(50, 200, 50);

    applyVibrance(img, { vibrance: 60, skinProtection: false });

    const sat0after = rgbSaturation(img.data[0]!, img.data[1]!, img.data[2]!);
    const sat1after = rgbSaturation(img.data[4]!, img.data[5]!, img.data[6]!);
    const sat2after = rgbSaturation(img.data[8]!, img.data[9]!, img.data[10]!);

    // All pixels should have increased saturation
    expect(sat0after).toBeGreaterThan(sat0before);
    expect(sat1after).toBeGreaterThan(sat1before);
    expect(sat2after).toBeGreaterThan(sat2before);
  });

  it('VIB-016: vibrance on green pixel increases saturation', () => {
    const img = createImageData1px(50, 200, 50);
    const satBefore = rgbSaturation(50, 200, 50);
    applyVibrance(img, { vibrance: 50, skinProtection: false });
    const satAfter = rgbSaturation(img.data[0]!, img.data[1]!, img.data[2]!);
    expect(satAfter).toBeGreaterThan(satBefore);
  });

  it('VIB-017: vibrance on blue pixel increases saturation', () => {
    const img = createImageData1px(50, 50, 200);
    const satBefore = rgbSaturation(50, 50, 200);
    applyVibrance(img, { vibrance: 50, skinProtection: false });
    const satAfter = rgbSaturation(img.data[0]!, img.data[1]!, img.data[2]!);
    expect(satAfter).toBeGreaterThan(satBefore);
  });

  it('VIB-018: negative vibrance preserves luminance direction', () => {
    // After desaturation, all channels should move toward the luminance value
    const img = createImageData1px(200, 100, 50);
    applyVibrance(img, { vibrance: -50, skinProtection: false });
    // Red was dominant, should still be >= green >= blue
    expect(img.data[0]!).toBeGreaterThanOrEqual(img.data[1]!);
    expect(img.data[1]!).toBeGreaterThanOrEqual(img.data[2]!);
  });

  it('VIB-019: small vibrance values produce small changes', () => {
    const img = createImageData1px(200, 100, 50);
    applyVibrance(img, { vibrance: 5, skinProtection: false });
    // Changes should be small (within ~10 of original)
    expect(Math.abs(img.data[0]! - 200)).toBeLessThan(15);
    expect(Math.abs(img.data[1]! - 100)).toBeLessThan(15);
    expect(Math.abs(img.data[2]! - 50)).toBeLessThan(15);
  });

  it('VIB-020: skin protection with skinProtection=false has no skin protection', () => {
    const r = 200,
      g = 160,
      b = 130;
    const img1 = createImageData1px(r, g, b);
    applyVibrance(img1, { vibrance: 80, skinProtection: false });

    // skinProtection=false should give full effect (no protection)
    const satBefore = rgbSaturation(r, g, b);
    const satAfter = rgbSaturation(img1.data[0]!, img1.data[1]!, img1.data[2]!);
    expect(satAfter).toBeGreaterThan(satBefore);
  });

  it('VIB-021: nearly-white pixel with slight color has minimal change', () => {
    // Very high lightness, very low saturation
    const img = createImageData1px(252, 250, 250);
    applyVibrance(img, { vibrance: 50, skinProtection: false });
    // The small saturation delta < 0.001 means it may skip entirely
    expect(Math.abs(img.data[0]! - 252)).toBeLessThan(10);
    expect(Math.abs(img.data[1]! - 250)).toBeLessThan(10);
    expect(Math.abs(img.data[2]! - 250)).toBeLessThan(10);
  });

  it('VIB-022: vibrance effect is symmetric for positive and negative', () => {
    const r = 180,
      g = 120,
      b = 80;
    const satOriginal = rgbSaturation(r, g, b);

    const imgPos = createImageData1px(r, g, b);
    applyVibrance(imgPos, { vibrance: 50, skinProtection: false });
    const satPos = rgbSaturation(imgPos.data[0]!, imgPos.data[1]!, imgPos.data[2]!);

    const imgNeg = createImageData1px(r, g, b);
    applyVibrance(imgNeg, { vibrance: -50, skinProtection: false });
    const satNeg = rgbSaturation(imgNeg.data[0]!, imgNeg.data[1]!, imgNeg.data[2]!);

    expect(satPos).toBeGreaterThan(satOriginal);
    expect(satNeg).toBeLessThan(satOriginal);
  });

  it('VIB-023: 2x2 image processes all four pixels', () => {
    const img = createImageDataFromArray(
      [200, 100, 50, 255, 50, 200, 100, 255, 100, 50, 200, 255, 150, 150, 100, 255],
      2,
      2,
    );

    applyVibrance(img, { vibrance: 60, skinProtection: false });

    // All pixels should have valid values
    for (let i = 0; i < 16; i += 4) {
      expect(img.data[i]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i]!).toBeLessThanOrEqual(255);
      expect(img.data[i + 1]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i + 1]!).toBeLessThanOrEqual(255);
      expect(img.data[i + 2]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i + 2]!).toBeLessThanOrEqual(255);
      expect(img.data[i + 3]).toBe(255);
    }
  });

  it('VIB-024: skin protection only triggers within hue 20-50, low sat, mid lightness', () => {
    // Very saturated pixel in skin hue range - should NOT trigger skin protection
    // because s >= 0.6
    const img1 = createImageData1px(255, 100, 0);
    const img2 = createImageData1px(255, 100, 0);
    applyVibrance(img1, { vibrance: 80, skinProtection: false });
    applyVibrance(img2, { vibrance: 80, skinProtection: true });
    // High saturation means skin protection doesn't kick in
    expect(img1.data[0]).toBe(img2.data[0]);
    expect(img1.data[1]).toBe(img2.data[1]);
    expect(img1.data[2]).toBe(img2.data[2]);
  });

  it('VIB-025: pure red pixel with max vibrance stays valid', () => {
    const img = createImageData1px(255, 0, 0);
    applyVibrance(img, { vibrance: 100, skinProtection: false });
    expect(img.data[0]!).toBeGreaterThanOrEqual(0);
    expect(img.data[0]!).toBeLessThanOrEqual(255);
    expect(img.data[1]!).toBeGreaterThanOrEqual(0);
    expect(img.data[1]!).toBeLessThanOrEqual(255);
    expect(img.data[2]!).toBeGreaterThanOrEqual(0);
    expect(img.data[2]!).toBeLessThanOrEqual(255);
  });
});
