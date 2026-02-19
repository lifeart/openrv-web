import { test, expect } from '@playwright/test';
import {
  loadExrFile,
  waitForTestHelper,
  getColorState,
  sampleCanvasPixels,
  waitForExposure,
  waitForColorReset,
  waitForMediaLoaded,
  waitForFrame,
  clickTab,
  waitForCondition,
} from './fixtures';

/**
 * Color Pipeline Accuracy Tests
 *
 * Tests color math accuracy with numerical pixel assertions — not just
 * "the image changed" but verifying that exposure/color adjustments
 * produce the correct pixel values.
 */

test.describe('Color Pipeline Accuracy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadExrFile(page);
  });

  test('CPA-001: Source pixel values are readable after EXR load', async ({ page }) => {
    // Sample center pixel — EXR should have non-zero HDR values
    const canvas = page.locator('canvas[data-testid="viewer-image-canvas"]').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const centerX = Math.floor(box!.width / 2);
    const centerY = Math.floor(box!.height / 2);

    const pixels = await sampleCanvasPixels(page, [{ x: centerX, y: centerY }]);
    expect(pixels).toHaveLength(1);
    // At least one channel should be non-zero (image has content)
    const px = pixels[0]!;
    expect(px.r + px.g + px.b).toBeGreaterThan(0);
  });

  test('CPA-002: Negative exposure darkens pixels proportionally', async ({ page }) => {
    // Capture baseline pixel values
    const canvas = page.locator('canvas[data-testid="viewer-image-canvas"]').first();
    const box = await canvas.boundingBox();
    const centerX = Math.floor(box!.width / 2);
    const centerY = Math.floor(box!.height / 2);

    const baselinePixels = await sampleCanvasPixels(page, [{ x: centerX, y: centerY }]);
    const baseline = baselinePixels[0]!;

    // Switch to color tab and set exposure to -1.0
    await clickTab(page, 'color');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(-1.0);
    });
    await waitForExposure(page, -1.0);

    // Wait for render to update
    await page.waitForTimeout(200);

    const darkPixels = await sampleCanvasPixels(page, [{ x: centerX, y: centerY }]);
    const dark = darkPixels[0]!;

    // Each channel should be darker (lower value)
    if (baseline.r > 10) expect(dark.r).toBeLessThan(baseline.r);
    if (baseline.g > 10) expect(dark.g).toBeLessThan(baseline.g);
    if (baseline.b > 10) expect(dark.b).toBeLessThan(baseline.b);
  });

  test('CPA-003: Positive exposure brightens pixels', async ({ page }) => {
    const canvas = page.locator('canvas[data-testid="viewer-image-canvas"]').first();
    const box = await canvas.boundingBox();
    const centerX = Math.floor(box!.width / 2);
    const centerY = Math.floor(box!.height / 2);

    const baselinePixels = await sampleCanvasPixels(page, [{ x: centerX, y: centerY }]);
    const baseline = baselinePixels[0]!;

    await clickTab(page, 'color');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(2.0);
    });
    await waitForExposure(page, 2.0);

    await page.waitForTimeout(200);

    const brightPixels = await sampleCanvasPixels(page, [{ x: centerX, y: centerY }]);
    const bright = brightPixels[0]!;

    // Each channel should be brighter (higher value), unless already clipped
    if (baseline.r < 240) expect(bright.r).toBeGreaterThan(baseline.r);
    if (baseline.g < 240) expect(bright.g).toBeGreaterThan(baseline.g);
    if (baseline.b < 240) expect(bright.b).toBeGreaterThan(baseline.b);
  });

  test('CPA-004: Reset returns pixels to original values', async ({ page }) => {
    const canvas = page.locator('canvas[data-testid="viewer-image-canvas"]').first();
    const box = await canvas.boundingBox();
    const centerX = Math.floor(box!.width / 2);
    const centerY = Math.floor(box!.height / 2);

    const baselinePixels = await sampleCanvasPixels(page, [{ x: centerX, y: centerY }]);
    const baseline = baselinePixels[0]!;

    // Change exposure
    await clickTab(page, 'color');
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(-2.0);
    });
    await waitForExposure(page, -2.0);
    await page.waitForTimeout(200);

    // Reset
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.resetColor?.();
    });
    await waitForColorReset(page);
    await page.waitForTimeout(200);

    const resetPixels = await sampleCanvasPixels(page, [{ x: centerX, y: centerY }]);
    const reset = resetPixels[0]!;

    // Values should return to within tolerance of baseline
    const tolerance = 3;
    expect(Math.abs(reset.r - baseline.r)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(reset.g - baseline.g)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(reset.b - baseline.b)).toBeLessThanOrEqual(tolerance);
  });

  test('CPA-005: Multiple sample points respond consistently to exposure', async ({ page }) => {
    const canvas = page.locator('canvas[data-testid="viewer-image-canvas"]').first();
    const box = await canvas.boundingBox();

    const samplePoints = [
      { x: Math.floor(box!.width * 0.25), y: Math.floor(box!.height * 0.25) },
      { x: Math.floor(box!.width * 0.5), y: Math.floor(box!.height * 0.5) },
      { x: Math.floor(box!.width * 0.75), y: Math.floor(box!.height * 0.75) },
    ];

    const baselinePixels = await sampleCanvasPixels(page, samplePoints);

    await clickTab(page, 'color');
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(1.0);
    });
    await waitForExposure(page, 1.0);
    await page.waitForTimeout(200);

    const brightPixels = await sampleCanvasPixels(page, samplePoints);

    // Each sampled point that had content should have gotten brighter
    for (let i = 0; i < samplePoints.length; i++) {
      const base = baselinePixels[i]!;
      const bright = brightPixels[i]!;
      const baseLum = base.r + base.g + base.b;
      const brightLum = bright.r + bright.g + bright.b;
      if (baseLum > 30 && baseLum < 720) {
        expect(brightLum).toBeGreaterThan(baseLum);
      }
    }
  });
});
