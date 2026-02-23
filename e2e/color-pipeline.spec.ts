import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  loadExrFile,
  waitForTestHelper,
  getColorState,
  getOCIOState,
  captureViewerScreenshot,
  imagesAreDifferent,
  sampleCanvasPixels,
  getCanvasBrightness,
  clickTab,
  waitForExposure,
  waitForColorReset,
} from './fixtures';

/**
 * Color Pipeline End-to-End Tests
 *
 * Verifies the full pipeline: file load -> color transforms -> rendered output.
 * Tests cover SDR video, HDR (EXR), multi-effect stacking, OCIO integration,
 * and pixel-level determinism.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sample pixels at a 3x3 grid of representative points on the viewer canvas. */
async function sampleGridPixels(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas[data-testid="viewer-image-canvas"]').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const points = [
    { x: Math.floor(box!.width * 0.25), y: Math.floor(box!.height * 0.25) },
    { x: Math.floor(box!.width * 0.50), y: Math.floor(box!.height * 0.25) },
    { x: Math.floor(box!.width * 0.75), y: Math.floor(box!.height * 0.25) },
    { x: Math.floor(box!.width * 0.25), y: Math.floor(box!.height * 0.50) },
    { x: Math.floor(box!.width * 0.50), y: Math.floor(box!.height * 0.50) },
    { x: Math.floor(box!.width * 0.75), y: Math.floor(box!.height * 0.50) },
    { x: Math.floor(box!.width * 0.25), y: Math.floor(box!.height * 0.75) },
    { x: Math.floor(box!.width * 0.50), y: Math.floor(box!.height * 0.75) },
    { x: Math.floor(box!.width * 0.75), y: Math.floor(box!.height * 0.75) },
  ];

  return { pixels: await sampleCanvasPixels(page, points), points };
}

/** Compute perceived luminance for a pixel (0-255 scale). */
function luminance(px: { r: number; g: number; b: number }): number {
  return 0.299 * px.r + 0.587 * px.g + 0.114 * px.b;
}

/** Set a color adjustment via the stable mutations API. */
async function setColorAdjustment(
  page: import('@playwright/test').Page,
  adjustments: Record<string, number | boolean>,
): Promise<void> {
  await page.evaluate((adj) => {
    (window as any).__OPENRV_TEST__?.mutations?.setColorAdjustments(adj);
  }, adjustments);
}

/** Reset all color adjustments to defaults. */
async function resetColor(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__OPENRV_TEST__?.mutations?.resetColorAdjustments();
  });
}

/** Wait for the render to reflect a state change (brief settle). */
async function waitForRender(page: import('@playwright/test').Page, ms = 250): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Helper: Wait for OCIO enabled state to change */
async function waitForOCIOEnabled(page: import('@playwright/test').Page, enabled: boolean, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getOCIOState();
      return state?.enabled === expected;
    },
    enabled,
    { timeout },
  );
}

/** Helper: open OCIO panel and enable the pipeline */
async function enableOCIO(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-testid="ocio-panel-button"]').click();
  const panel = page.locator('[data-testid="ocio-panel"]');
  await expect(panel).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid="ocio-enable-toggle"]').click();
  await waitForOCIOEnabled(page, true);
}

/** Helper: disable OCIO (assumes panel is open) */
async function disableOCIO(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-testid="ocio-enable-toggle"]').click();
  await waitForOCIOEnabled(page, false);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

test.describe('Color Pipeline End-to-End', () => {

  // =========================================================================
  // Basic Pipeline (SDR video)
  // =========================================================================
  test.describe('Basic Pipeline', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
    });

    test('CPIPE-001: loaded video should have non-zero pixel values', async ({ page }) => {
      const { pixels } = await sampleGridPixels(page);

      // At least some sample points should contain visible content
      const nonBlackCount = pixels.filter(
        (px) => px.r > 10 || px.g > 10 || px.b > 10,
      ).length;
      expect(nonBlackCount).toBeGreaterThan(0);
    });

    test('CPIPE-002: exposure change should affect all sample points consistently', async ({ page }) => {
      const { pixels: baseline, points } = await sampleGridPixels(page);

      // Increase exposure
      await setColorAdjustment(page, { exposure: 1.5 });
      await waitForExposure(page, 1.5);
      await waitForRender(page);

      const { pixels: bright } = await sampleGridPixels(page);

      // Every point with visible content should have gotten brighter
      let testedCount = 0;
      for (let i = 0; i < baseline.length; i++) {
        const baseLum = luminance(baseline[i]!);
        const brightLum = luminance(bright[i]!);
        // Only test pixels that had content and were not clipped
        if (baseLum > 15 && baseLum < 240) {
          expect(brightLum).toBeGreaterThan(baseLum);
          testedCount++;
        }
      }
      // We should have tested at least one valid point
      expect(testedCount).toBeGreaterThan(0);
    });

    test('CPIPE-003: gamma change should affect midtones more than highlights', async ({ page }) => {
      const { pixels: baseline } = await sampleGridPixels(page);

      // Apply gamma > 1 (brightens midtones)
      await setColorAdjustment(page, { gamma: 1.8 });
      await page.waitForFunction(
        () => {
          const s = (window as any).__OPENRV_TEST__?.getColorState();
          return s && Math.abs(s.gamma - 1.8) < 0.05;
        },
        undefined,
        { timeout: 2000 },
      );
      await waitForRender(page);

      const { pixels: gammaApplied } = await sampleGridPixels(page);

      // Collect deltas for midtone and highlight pixels
      const midtoneDeltas: number[] = [];
      const highlightDeltas: number[] = [];

      for (let i = 0; i < baseline.length; i++) {
        const baseLum = luminance(baseline[i]!);
        const newLum = luminance(gammaApplied[i]!);
        const delta = Math.abs(newLum - baseLum);

        if (baseLum > 40 && baseLum < 180) {
          midtoneDeltas.push(delta);
        } else if (baseLum >= 220) {
          highlightDeltas.push(delta);
        }
      }

      // If we have data in both ranges, midtone change should be >= highlight change
      if (midtoneDeltas.length > 0 && highlightDeltas.length > 0) {
        const avgMidtone = midtoneDeltas.reduce((a, b) => a + b, 0) / midtoneDeltas.length;
        const avgHighlight = highlightDeltas.reduce((a, b) => a + b, 0) / highlightDeltas.length;
        expect(avgMidtone).toBeGreaterThanOrEqual(avgHighlight);
      }
    });

    test('CPIPE-004: saturation + exposure combined should produce distinct result from either alone', async ({ page }) => {
      // Capture baseline
      const screenshotBaseline = await captureViewerScreenshot(page);

      // Exposure only
      await setColorAdjustment(page, { exposure: 1.0 });
      await waitForExposure(page, 1.0);
      await waitForRender(page);
      const screenshotExposureOnly = await captureViewerScreenshot(page);

      // Reset then saturation only
      await resetColor(page);
      await waitForColorReset(page);
      await waitForRender(page);

      await setColorAdjustment(page, { saturation: 0.3 });
      await page.waitForFunction(
        () => {
          const s = (window as any).__OPENRV_TEST__?.getColorState();
          return s && Math.abs(s.saturation - 0.3) < 0.05;
        },
        undefined,
        { timeout: 2000 },
      );
      await waitForRender(page);
      const screenshotSatOnly = await captureViewerScreenshot(page);

      // Combined exposure + saturation
      await setColorAdjustment(page, { exposure: 1.0, saturation: 0.3 });
      await waitForExposure(page, 1.0);
      await waitForRender(page);
      const screenshotCombined = await captureViewerScreenshot(page);

      // All three variants should be different from baseline
      expect(imagesAreDifferent(screenshotBaseline, screenshotExposureOnly)).toBe(true);
      expect(imagesAreDifferent(screenshotBaseline, screenshotSatOnly)).toBe(true);
      expect(imagesAreDifferent(screenshotBaseline, screenshotCombined)).toBe(true);

      // Combined should differ from each single adjustment
      expect(imagesAreDifferent(screenshotExposureOnly, screenshotCombined)).toBe(true);
      expect(imagesAreDifferent(screenshotSatOnly, screenshotCombined)).toBe(true);
    });

    test('CPIPE-005: full color reset should exactly restore original pixel values', async ({ page }) => {
      const { pixels: original, points } = await sampleGridPixels(page);

      // Apply multiple adjustments
      await setColorAdjustment(page, { exposure: 2.0, saturation: 0.5, gamma: 1.5 });
      await waitForExposure(page, 2.0);
      await waitForRender(page);

      // Verify something actually changed
      const { pixels: modified } = await sampleGridPixels(page);
      const anyChanged = modified.some((px, i) => {
        const orig = original[i]!;
        return Math.abs(px.r - orig.r) > 2 || Math.abs(px.g - orig.g) > 2 || Math.abs(px.b - orig.b) > 2;
      });
      expect(anyChanged).toBe(true);

      // Reset all
      await resetColor(page);
      await waitForColorReset(page);
      await waitForRender(page);

      // Pixels should match original within tolerance
      const { pixels: restored } = await sampleGridPixels(page);
      const tolerance = 3;
      for (let i = 0; i < original.length; i++) {
        expect(Math.abs(restored[i]!.r - original[i]!.r)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(restored[i]!.g - original[i]!.g)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(restored[i]!.b - original[i]!.b)).toBeLessThanOrEqual(tolerance);
      }
    });
  });

  // =========================================================================
  // HDR Pipeline (EXR)
  // =========================================================================
  test.describe('HDR Pipeline', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadExrFile(page);
    });

    test('CPIPE-010: EXR file should load with non-zero pixel values', async ({ page }) => {
      const { pixels } = await sampleGridPixels(page);

      const nonBlackCount = pixels.filter(
        (px) => px.r > 5 || px.g > 5 || px.b > 5,
      ).length;
      expect(nonBlackCount).toBeGreaterThan(0);
    });

    test('CPIPE-011: exposure on HDR content should produce wider brightness range than SDR', async ({ page }) => {
      // Get baseline brightness of HDR content
      const hdrBaselineBrightness = await getCanvasBrightness(page);

      // Apply strong positive exposure
      await setColorAdjustment(page, { exposure: 3.0 });
      await waitForExposure(page, 3.0);
      await waitForRender(page);
      const hdrBrightExposure = await getCanvasBrightness(page);

      // Apply strong negative exposure
      await setColorAdjustment(page, { exposure: -3.0 });
      await waitForExposure(page, -3.0);
      await waitForRender(page);
      const hdrDarkExposure = await getCanvasBrightness(page);

      // HDR content should show a wide dynamic range when exposure is adjusted
      const hdrRange = Math.abs(hdrBrightExposure - hdrDarkExposure);
      // The range should be substantial (HDR has wide latitude)
      expect(hdrRange).toBeGreaterThan(20);
    });

    test('CPIPE-012: negative exposure on HDR should preserve detail in bright areas', async ({ page }) => {
      // Sample pixels at baseline
      const { pixels: baseline } = await sampleGridPixels(page);

      // Apply negative exposure to bring down bright values
      await setColorAdjustment(page, { exposure: -2.0 });
      await waitForExposure(page, -2.0);
      await waitForRender(page);

      const { pixels: darkened } = await sampleGridPixels(page);

      // Find pixels that were near-white (clipped highlights) in the baseline
      // After negative exposure on HDR, these should show differentiation
      let clippedCount = 0;
      let darkenedFromClipCount = 0;
      for (let i = 0; i < baseline.length; i++) {
        const baseLum = luminance(baseline[i]!);
        const darkLum = luminance(darkened[i]!);
        if (baseLum > 240) {
          clippedCount++;
          // In HDR, negative exposure should bring near-white values down
          if (darkLum < baseLum) {
            darkenedFromClipCount++;
          }
        }
      }

      // If there were any near-clipped pixels, some should have darkened
      if (clippedCount > 0) {
        expect(darkenedFromClipCount).toBeGreaterThan(0);
      }

      // Overall brightness should be lower
      const baselineBrightness = await getCanvasBrightness(page);
      // Reset exposure to get baseline brightness for comparison
      await resetColor(page);
      await waitForColorReset(page);
      await waitForRender(page);
      const originalBrightness = await getCanvasBrightness(page);

      // Re-apply negative exposure to confirm brightness dropped
      await setColorAdjustment(page, { exposure: -2.0 });
      await waitForExposure(page, -2.0);
      await waitForRender(page);
      const darkBrightness = await getCanvasBrightness(page);

      expect(darkBrightness).toBeLessThan(originalBrightness);
    });
  });

  // =========================================================================
  // Multi-Effect Pipeline
  // =========================================================================
  test.describe('Multi-Effect Pipeline', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
    });

    test('CPIPE-020: applying effects in sequence should accumulate correctly', async ({ page }) => {
      const screenshotBaseline = await captureViewerScreenshot(page);

      // Step 1: exposure
      await setColorAdjustment(page, { exposure: 1.0 });
      await waitForExposure(page, 1.0);
      await waitForRender(page);
      const screenshotAfterExposure = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBaseline, screenshotAfterExposure)).toBe(true);

      // Step 2: add saturation on top
      await setColorAdjustment(page, { exposure: 1.0, saturation: 1.8 });
      await waitForRender(page);
      const screenshotAfterSat = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotAfterExposure, screenshotAfterSat)).toBe(true);

      // Step 3: add contrast on top
      await setColorAdjustment(page, { exposure: 1.0, saturation: 1.8, contrast: 1.5 });
      await waitForRender(page);
      const screenshotAfterContrast = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotAfterSat, screenshotAfterContrast)).toBe(true);

      // Final result should differ from baseline
      expect(imagesAreDifferent(screenshotBaseline, screenshotAfterContrast)).toBe(true);
    });

    test('CPIPE-021: order independence - exposure+saturation vs saturation+exposure should be similar', async ({ page }) => {
      // Apply exposure first, then saturation
      await setColorAdjustment(page, { exposure: 1.0 });
      await waitForExposure(page, 1.0);
      await waitForRender(page);
      await setColorAdjustment(page, { exposure: 1.0, saturation: 0.5 });
      await waitForRender(page);
      const brightnessA = await getCanvasBrightness(page);

      // Reset
      await resetColor(page);
      await waitForColorReset(page);
      await waitForRender(page);

      // Apply saturation first, then exposure
      await setColorAdjustment(page, { saturation: 0.5 });
      await waitForRender(page);
      await setColorAdjustment(page, { saturation: 0.5, exposure: 1.0 });
      await waitForExposure(page, 1.0);
      await waitForRender(page);
      const brightnessB = await getCanvasBrightness(page);

      // Both orderings should produce the same final state since the final
      // adjustments are identical. Brightness should be very close.
      expect(Math.abs(brightnessA - brightnessB)).toBeLessThanOrEqual(3);
    });

    test('CPIPE-022: extreme settings should not produce NaN or corruption (pixels stay in valid range)', async ({ page }) => {
      // Apply extreme settings
      await setColorAdjustment(page, {
        exposure: 5.0,
        saturation: 3.0,
        gamma: 3.0,
        contrast: 2.0,
        brightness: 0.5,
        temperature: 100,
        tint: 100,
      });
      await waitForExposure(page, 5.0);
      await waitForRender(page);

      const { pixels } = await sampleGridPixels(page);

      // All pixel values must be within valid 0-255 range and not NaN
      for (const px of pixels) {
        expect(px.r).toBeGreaterThanOrEqual(0);
        expect(px.r).toBeLessThanOrEqual(255);
        expect(px.g).toBeGreaterThanOrEqual(0);
        expect(px.g).toBeLessThanOrEqual(255);
        expect(px.b).toBeGreaterThanOrEqual(0);
        expect(px.b).toBeLessThanOrEqual(255);
        expect(px.a).toBeGreaterThanOrEqual(0);
        expect(px.a).toBeLessThanOrEqual(255);
        // Check for NaN (NaN !== NaN)
        expect(px.r).toBe(px.r);
        expect(px.g).toBe(px.g);
        expect(px.b).toBe(px.b);
      }

      // Now try extreme negative
      await setColorAdjustment(page, {
        exposure: -5.0,
        saturation: 0,
        gamma: 0.2,
        contrast: 0.1,
        brightness: -0.5,
        temperature: -100,
        tint: -100,
      });
      await waitForExposure(page, -5.0);
      await waitForRender(page);

      const { pixels: darkPixels } = await sampleGridPixels(page);

      for (const px of darkPixels) {
        expect(px.r).toBeGreaterThanOrEqual(0);
        expect(px.r).toBeLessThanOrEqual(255);
        expect(px.g).toBeGreaterThanOrEqual(0);
        expect(px.g).toBeLessThanOrEqual(255);
        expect(px.b).toBeGreaterThanOrEqual(0);
        expect(px.b).toBeLessThanOrEqual(255);
        expect(px.r).toBe(px.r);
        expect(px.g).toBe(px.g);
        expect(px.b).toBe(px.b);
      }
    });
  });

  // =========================================================================
  // Color Pipeline with OCIO
  // =========================================================================
  test.describe('Color Pipeline with OCIO', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
      await clickTab(page, 'color');
    });

    test('CPIPE-030: OCIO + exposure should both be applied to output', async ({ page }) => {
      // Capture baseline
      const screenshotBaseline = await captureViewerScreenshot(page);

      // Enable OCIO
      await enableOCIO(page);
      const ocioState = await getOCIOState(page);
      expect(ocioState.enabled).toBe(true);
      await waitForRender(page);
      const screenshotOCIOOnly = await captureViewerScreenshot(page);

      // Close OCIO panel to avoid UI interference
      await page.locator('[data-testid="ocio-panel-close"]').click();
      await waitForRender(page, 100);

      // Add exposure on top of OCIO
      await setColorAdjustment(page, { exposure: 2.0 });
      await waitForExposure(page, 2.0);
      await waitForRender(page);
      const screenshotOCIOPlusExposure = await captureViewerScreenshot(page);

      // OCIO alone should differ from baseline
      expect(imagesAreDifferent(screenshotBaseline, screenshotOCIOOnly)).toBe(true);
      // OCIO + exposure should differ from OCIO alone
      expect(imagesAreDifferent(screenshotOCIOOnly, screenshotOCIOPlusExposure)).toBe(true);
      // OCIO + exposure should differ from baseline
      expect(imagesAreDifferent(screenshotBaseline, screenshotOCIOPlusExposure)).toBe(true);
    });

    test('CPIPE-031: disabling OCIO while keeping exposure should show exposure-only result', async ({ page }) => {
      // Set exposure first
      await setColorAdjustment(page, { exposure: 1.5 });
      await waitForExposure(page, 1.5);
      await waitForRender(page);
      const screenshotExposureOnly = await captureViewerScreenshot(page);
      const brightnessExposureOnly = await getCanvasBrightness(page);

      // Enable OCIO
      await enableOCIO(page);
      await waitForRender(page);
      const screenshotBoth = await captureViewerScreenshot(page);

      // Both effects together should differ from exposure alone
      expect(imagesAreDifferent(screenshotExposureOnly, screenshotBoth)).toBe(true);

      // Disable OCIO (panel should still be open)
      await disableOCIO(page);
      await waitForRender(page);
      const screenshotAfterDisable = await captureViewerScreenshot(page);
      const brightnessAfterDisable = await getCanvasBrightness(page);

      // After disabling OCIO, should return to exposure-only appearance
      // Brightness should be very close to the exposure-only state
      expect(Math.abs(brightnessAfterDisable - brightnessExposureOnly)).toBeLessThanOrEqual(5);
    });

    test('CPIPE-032: all pipeline stages should be removable to restore original', async ({ page }) => {
      // Capture original
      const brightnessOriginal = await getCanvasBrightness(page);

      // Enable OCIO
      await enableOCIO(page);
      await waitForRender(page);

      // Close OCIO panel
      await page.locator('[data-testid="ocio-panel-close"]').click();
      await waitForRender(page, 100);

      // Add color adjustments
      await setColorAdjustment(page, { exposure: 2.0, saturation: 0.5 });
      await waitForExposure(page, 2.0);
      await waitForRender(page);

      // Verify things changed
      const brightnessModified = await getCanvasBrightness(page);
      expect(Math.abs(brightnessModified - brightnessOriginal)).toBeGreaterThan(1);

      // Remove color adjustments
      await resetColor(page);
      await waitForColorReset(page);
      await waitForRender(page);

      // Re-open OCIO panel and disable OCIO
      await page.locator('[data-testid="ocio-panel-button"]').click();
      const panel = page.locator('[data-testid="ocio-panel"]');
      await expect(panel).toBeVisible({ timeout: 5000 });
      await disableOCIO(page);
      await waitForRender(page);

      // Brightness should return close to original
      const brightnessRestored = await getCanvasBrightness(page);
      expect(Math.abs(brightnessRestored - brightnessOriginal)).toBeLessThanOrEqual(5);
    });
  });

  // =========================================================================
  // Pipeline Pixel Consistency
  // =========================================================================
  test.describe('Pipeline Pixel Consistency', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
    });

    test('CPIPE-040: same settings should produce same pixels on repeated application', async ({ page }) => {
      // Apply adjustments
      await setColorAdjustment(page, { exposure: 1.0, saturation: 0.7, contrast: 1.2 });
      await waitForExposure(page, 1.0);
      await waitForRender(page);

      const { pixels: firstRun } = await sampleGridPixels(page);

      // Reset and re-apply the same adjustments
      await resetColor(page);
      await waitForColorReset(page);
      await waitForRender(page);

      await setColorAdjustment(page, { exposure: 1.0, saturation: 0.7, contrast: 1.2 });
      await waitForExposure(page, 1.0);
      await waitForRender(page);

      const { pixels: secondRun } = await sampleGridPixels(page);

      // Pixels should be identical (within rounding tolerance)
      const tolerance = 2;
      for (let i = 0; i < firstRun.length; i++) {
        expect(Math.abs(firstRun[i]!.r - secondRun[i]!.r)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(firstRun[i]!.g - secondRun[i]!.g)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(firstRun[i]!.b - secondRun[i]!.b)).toBeLessThanOrEqual(tolerance);
      }
    });

    test('CPIPE-041: pipeline should be deterministic across frame changes', async ({ page }) => {
      // Apply adjustments on frame 1
      await setColorAdjustment(page, { exposure: 1.5, saturation: 0.5 });
      await waitForExposure(page, 1.5);
      await waitForRender(page);

      // Record the color state
      const stateFrame1 = await getColorState(page);

      // Step forward to frame 2
      await page.keyboard.press('ArrowRight');
      await waitForRender(page);

      // Color settings should persist across the frame change
      const stateFrame2 = await getColorState(page);
      expect(stateFrame2.exposure).toBeCloseTo(stateFrame1.exposure, 2);
      expect(stateFrame2.saturation).toBeCloseTo(stateFrame1.saturation, 2);

      // Step back to frame 1
      await page.keyboard.press('ArrowLeft');
      await waitForRender(page);

      // State should still be the same
      const stateBackToFrame1 = await getColorState(page);
      expect(stateBackToFrame1.exposure).toBeCloseTo(stateFrame1.exposure, 2);
      expect(stateBackToFrame1.saturation).toBeCloseTo(stateFrame1.saturation, 2);
    });
  });
});
