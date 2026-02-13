/**
 * ViewerEffects Highlights/Shadows HDR Tests
 *
 * Tests for CPU-based highlight/shadow recovery with HDR float data (HL-006).
 */

import { describe, it, expect } from 'vitest';
import { applyHighlightsShadows, applyHighlightsShadowsHDR } from './ViewerEffects';
import type { HighlightsShadowsParams } from './ViewerEffects';

/** Helper: create 1-pixel ImageData */
function createImageData1px(r: number, g: number, b: number, a = 255): ImageData {
  return {
    data: new Uint8ClampedArray([r, g, b, a]),
    width: 1,
    height: 1,
    colorSpace: 'srgb',
  } as ImageData;
}

/** Helper: create multi-pixel ImageData */
function createImageDataNpx(count: number): ImageData {
  return {
    data: new Uint8ClampedArray(count * 4),
    width: count,
    height: 1,
    colorSpace: 'srgb',
  } as ImageData;
}

const DEFAULT_PARAMS: HighlightsShadowsParams = { highlights: 0, shadows: 0, whites: 0, blacks: 0 };

describe('applyHighlightsShadows (SDR)', () => {
  it('HL-SDR-001: zero params leaves pixels unchanged', () => {
    const img = createImageData1px(128, 200, 50);
    applyHighlightsShadows(img, DEFAULT_PARAMS);
    expect(img.data[0]).toBe(128);
    expect(img.data[1]).toBe(200);
    expect(img.data[2]).toBe(50);
    expect(img.data[3]).toBe(255); // alpha unchanged
  });

  it('HL-SDR-002: positive highlights compress bright pixels', () => {
    const img = createImageData1px(240, 240, 240);
    applyHighlightsShadows(img, { ...DEFAULT_PARAMS, highlights: 80 });
    // Formula: r -= highlights * highlightMask * 128
    // Positive highlights subtracts from bright pixels → compresses highlights
    expect(img.data[0]!).toBeLessThan(240);
  });

  it('HL-SDR-003: positive shadows lifts dark pixels', () => {
    const img = createImageData1px(20, 20, 20);
    applyHighlightsShadows(img, { ...DEFAULT_PARAMS, shadows: 80 });
    // Formula: r += shadows * shadowMask * 128
    // Positive shadows adds to dark pixels → lifts shadows
    expect(img.data[0]!).toBeGreaterThan(20);
  });
});

describe('applyHighlightsShadowsHDR (HL-006)', () => {
  it('HL-006-001: zero params produces correct 8-bit output from HDR data', () => {
    const img = createImageDataNpx(1);
    const hdr = new Float32Array([0.5, 0.3, 0.1]); // within SDR range
    applyHighlightsShadowsHDR(img, DEFAULT_PARAMS, hdr, 3, 1.0);
    expect(img.data[0]).toBe(128); // 0.5 * 255 ≈ 128
    expect(img.data[1]).toBe(77);  // 0.3 * 255 ≈ 77
    expect(img.data[2]).toBe(26);  // 0.1 * 255 ≈ 26
    expect(img.data[3]).toBe(0);   // alpha unset in this helper
  });

  it('HL-006-002: HDR values above 1.0 are preserved (not clipped to 255)', () => {
    // peak=3.0 means values up to 3.0 are normalized to 0-255 display
    const img = createImageDataNpx(1);
    const hdr = new Float32Array([3.0, 1.5, 0.0]); // HDR values
    applyHighlightsShadowsHDR(img, DEFAULT_PARAMS, hdr, 3, 3.0);
    // 3.0/3.0 = 1.0 → 255, 1.5/3.0 = 0.5 → 128, 0/3.0 = 0 → 0
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBe(128);
    expect(img.data[2]).toBe(0);
  });

  it('HL-006-003: highlight adjustment scales with HDR peak', () => {
    // Two pixels: one bright (HDR), one dark
    const img = createImageDataNpx(2);
    const hdr = new Float32Array([
      2.5, 2.5, 2.5, // bright HDR pixel (lum ~2.5)
      0.1, 0.1, 0.1, // dark pixel
    ]);
    const peak = 3.0;
    applyHighlightsShadowsHDR(
      img,
      { ...DEFAULT_PARAMS, highlights: 50 },
      hdr, 3, peak,
    );
    // Bright pixel: normalized lum = 2.5/3 ≈ 0.833, highlightMask > 0
    // Adjustment applied and scaled by peak. Should be darker than original.
    const originalBright = Math.round((2.5 / 3.0) * 255); // ~213
    expect(img.data[0]!).toBeLessThan(originalBright);

    // Dark pixel: normalized lum = 0.1/3 ≈ 0.033, highlightMask ≈ 0
    // Should be essentially unchanged
    const originalDark = Math.round((0.1 / 3.0) * 255); // ~8
    expect(Math.abs(img.data[4]! - originalDark)).toBeLessThanOrEqual(1);
  });

  it('HL-006-004: shadow adjustment scales with HDR peak', () => {
    const img = createImageDataNpx(2);
    const hdr = new Float32Array([
      0.2, 0.2, 0.2, // dark pixel (lum ~0.2)
      2.5, 2.5, 2.5, // bright HDR pixel
    ]);
    const peak = 3.0;
    applyHighlightsShadowsHDR(
      img,
      { ...DEFAULT_PARAMS, shadows: 50 },
      hdr, 3, peak,
    );
    // Dark pixel: normalized lum = 0.2/3 ≈ 0.067, shadowMask ≈ 1.0
    // Shadow lift applied. Should be brighter than original.
    const originalDark = Math.round((0.2 / 3.0) * 255); // ~17
    expect(img.data[0]!).toBeGreaterThan(originalDark);

    // Bright pixel: normalized lum = 2.5/3 ≈ 0.833, shadowMask ≈ 0
    // Should be essentially unchanged
    const originalBright = Math.round((2.5 / 3.0) * 255); // ~213
    expect(Math.abs(img.data[4]! - originalBright)).toBeLessThanOrEqual(1);
  });

  it('HL-006-005: luminance masking differentiates across full HDR range', () => {
    // Three pixels at different HDR levels
    const img = createImageDataNpx(3);
    const hdr = new Float32Array([
      0.5, 0.5, 0.5, // low (normalized: 0.1)
      2.5, 2.5, 2.5, // mid-high (normalized: 0.5)
      4.5, 4.5, 4.5, // very bright (normalized: 0.9)
    ]);
    const peak = 5.0;
    applyHighlightsShadowsHDR(
      img,
      { ...DEFAULT_PARAMS, highlights: 80 },
      hdr, 3, peak,
    );
    // With peak=5, the highlight mask should differentiate:
    // 0.5/5=0.1 → almost no highlight effect
    // 2.5/5=0.5 → edge of highlight zone (smoothstep 0.5-1.0 at 0.5 = 0)
    // 4.5/5=0.9 → strong highlight zone

    // Pixel 0 (dark): should be barely affected
    const p0 = img.data[0]!;
    // Pixel 1 (mid): at smoothstep boundary, low effect
    const p1 = img.data[4]!;
    // Pixel 2 (bright): strong highlight compression
    const p2 = img.data[8]!;

    // The brighter pixel should be darkened the most by positive highlights
    const orig0 = Math.round((0.5 / 5.0) * 255);
    const orig1 = Math.round((2.5 / 5.0) * 255);
    const orig2 = Math.round((4.5 / 5.0) * 255);

    // Dark pixel barely changed
    expect(Math.abs(p0 - orig0)).toBeLessThan(5);
    // Mid pixel: at smoothstep boundary (0.5), mask = 0, so also barely changed
    expect(Math.abs(p1 - orig1)).toBeLessThan(5);
    // Bright pixel: strong effect
    expect(orig2 - p2).toBeGreaterThan(20);
  });

  it('HL-006-006: whites/blacks clipping scales with HDR peak', () => {
    const img = createImageDataNpx(1);
    const hdr = new Float32Array([2.0, 2.0, 2.0]);
    const peak = 3.0;
    // Apply whites=50 to compress the white point
    applyHighlightsShadowsHDR(
      img,
      { ...DEFAULT_PARAMS, whites: 50 },
      hdr, 3, peak,
    );
    // With whites=50: whitePoint = 3.0 * (1 - 0.5 * 55/255) = 3.0 * 0.892 ≈ 2.676
    // blackPoint = 0
    // Remapped: (2.0 - 0) / 2.676 * 3.0 = 2.243
    // Normalized to display: 2.243/3.0 * 255 ≈ 190
    // Value should be higher than the zero-adjustment output (2.0/3.0*255≈170)
    const withWhites = img.data[0]!;
    expect(withWhites).toBeGreaterThan(170);
    expect(withWhites).toBeLessThan(255);
  });

  it('HL-006-007: negative values are clamped to zero (not negative)', () => {
    const img = createImageDataNpx(1);
    // Very dark pixel with strong shadow crush
    const hdr = new Float32Array([0.05, 0.05, 0.05]);
    applyHighlightsShadowsHDR(
      img,
      { ...DEFAULT_PARAMS, shadows: -100 },
      hdr, 3, 1.0,
    );
    // Should not produce negative display values
    expect(img.data[0]!).toBeGreaterThanOrEqual(0);
    expect(img.data[1]!).toBeGreaterThanOrEqual(0);
    expect(img.data[2]!).toBeGreaterThanOrEqual(0);
  });

  it('HL-006-008: alpha channel is preserved', () => {
    const img = createImageDataNpx(1);
    img.data[3] = 200; // set alpha
    const hdr = new Float32Array([1.0, 1.0, 1.0]);
    applyHighlightsShadowsHDR(
      img,
      { ...DEFAULT_PARAMS, highlights: -50 },
      hdr, 3, 1.0,
    );
    expect(img.data[3]).toBe(200);
  });

  it('HL-006-009: single-channel HDR data replicates to all channels', () => {
    const img = createImageDataNpx(1);
    const hdr = new Float32Array([0.5]);
    applyHighlightsShadowsHDR(img, DEFAULT_PARAMS, hdr, 1, 1.0);
    // All channels should be the same (r=g=b)
    expect(img.data[0]).toBe(img.data[1]);
    expect(img.data[1]).toBe(img.data[2]);
    expect(img.data[0]).toBe(128); // 0.5 * 255
  });

  it('HL-006-010: NaN/Infinity values produce 0 output', () => {
    const img = createImageDataNpx(1);
    const hdr = new Float32Array([NaN, Infinity, -Infinity]);
    applyHighlightsShadowsHDR(img, DEFAULT_PARAMS, hdr, 3, 1.0);
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(0);
  });

  it('HL-006-011: peak=1.0 produces same output as SDR path for 0-1 range', () => {
    // Create the same data for both SDR and HDR paths
    const sdrImg = createImageData1px(128, 64, 200);
    const hdrImg = createImageDataNpx(1);
    const hdrData = new Float32Array([128 / 255, 64 / 255, 200 / 255]);

    const params: HighlightsShadowsParams = { highlights: -30, shadows: 20, whites: 10, blacks: 5 };
    applyHighlightsShadows(sdrImg, params);
    applyHighlightsShadowsHDR(hdrImg, params, hdrData, 3, 1.0);

    // Should produce very similar results (small rounding differences are OK)
    expect(Math.abs(sdrImg.data[0]! - hdrImg.data[0]!)).toBeLessThanOrEqual(2);
    expect(Math.abs(sdrImg.data[1]! - hdrImg.data[1]!)).toBeLessThanOrEqual(2);
    expect(Math.abs(sdrImg.data[2]! - hdrImg.data[2]!)).toBeLessThanOrEqual(2);
  });
});
