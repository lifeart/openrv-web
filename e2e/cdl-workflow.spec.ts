import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  sampleCanvasPixels,
  getCanvasBrightness,
  captureCanvasState,
  verifyCanvasChanged,
  clickTab,
} from './fixtures';

/**
 * CDL (Color Decision List) Workflow Tests
 *
 * Tests for the ASC CDL color correction panel accessible from the color tab.
 * The CDL control provides per-channel slope, offset, power sliders and a
 * global saturation slider. The panel is opened by clicking the CDL button
 * (title="ASC CDL Color Correction") in the color tab context toolbar.
 *
 * Panel structure (from CDLControl.ts):
 * - Container class: .cdl-control-container
 * - Panel class: .cdl-panel (appended to document.body when shown)
 * - Slope section: R/G/B sliders (range 0-4, default 1)
 * - Offset section: R/G/B sliders (range -1 to 1, default 0)
 * - Power section: R/G/B sliders (range 0.1-4, default 1)
 * - Saturation slider (range 0-2, default 1)
 * - Header buttons: Load, Save, Reset
 */

// ============================================================================
// Helpers
// ============================================================================

/** Open the CDL panel by clicking the CDL button in the color tab toolbar */
async function openCDLPanel(page: import('@playwright/test').Page): Promise<void> {
  const cdlButton = page.locator('button[title="ASC CDL Color Correction"]');
  await expect(cdlButton).toBeVisible({ timeout: 5000 });
  await cdlButton.click();
  await expect(page.locator('.cdl-panel')).toBeVisible({ timeout: 3000 });
}

/**
 * Get a CDL slider by its section and channel using a more robust approach.
 * Sections appear in order: Slope (index 0), Offset (index 1), Power (index 2).
 * Within each section, channels appear as R (0), G (1), B (2).
 */
async function getCDLSlider(
  page: import('@playwright/test').Page,
  section: 'slope' | 'offset' | 'power',
  channel: 'r' | 'g' | 'b',
): Promise<import('@playwright/test').Locator> {
  const sectionIndex = section === 'slope' ? 0 : section === 'offset' ? 1 : 2;
  const channelIndex = channel === 'r' ? 0 : channel === 'g' ? 1 : 2;
  // Each section has 3 sliders (R, G, B). The overall slider index is:
  const sliderIndex = sectionIndex * 3 + channelIndex;
  return page.locator('.cdl-panel input[type="range"]').nth(sliderIndex);
}

/** Get the CDL saturation slider (last slider in the panel) */
async function getCDLSaturationSlider(
  page: import('@playwright/test').Page,
): Promise<import('@playwright/test').Locator> {
  // Saturation is the 10th slider (index 9) -- after 3 sections x 3 channels = 9 channel sliders
  return page.locator('.cdl-panel input[type="range"]').nth(9);
}

/** Set a CDL slider value and dispatch the input event */
async function setCDLSliderValue(
  slider: import('@playwright/test').Locator,
  value: number,
): Promise<void> {
  await slider.evaluate((el, val) => {
    const input = el as HTMLInputElement;
    input.value = String(val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Click the Reset button in the CDL panel header */
async function clickCDLReset(page: import('@playwright/test').Page): Promise<void> {
  const resetButton = page.locator('.cdl-panel button:has-text("Reset")');
  await expect(resetButton).toBeVisible();
  await resetButton.click();
}

/** Wait a short duration for render updates after slider changes */
async function waitForRender(page: import('@playwright/test').Page, ms = 300): Promise<void> {
  await page.waitForTimeout(ms);
}

// ============================================================================
// Tests
// ============================================================================

test.describe('CDL Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await clickTab(page, 'color');
  });

  test.describe('CDL Panel', () => {
    test('CDL-E001: CDL controls should be accessible in color tab', async ({ page }) => {
      // The CDL button should be visible in the color tab toolbar
      const cdlButton = page.locator('button[title="ASC CDL Color Correction"]');
      await expect(cdlButton).toBeVisible();

      // Click to open the panel
      await cdlButton.click();
      await expect(page.locator('.cdl-panel')).toBeVisible();
    });

    test('CDL-E002: CDL panel should have slope/offset/power/saturation controls', async ({ page }) => {
      await openCDLPanel(page);

      const panel = page.locator('.cdl-panel');

      // Verify section headers are present (textContent is title-case; CSS text-transform displays uppercase)
      await expect(panel.locator('div:text-is("Slope")')).toBeVisible();
      await expect(panel.locator('div:text-is("Offset")')).toBeVisible();
      await expect(panel.locator('div:text-is("Power")')).toBeVisible();
      await expect(panel.locator('span:text-is("Saturation")')).toBeVisible();

      // Verify there are 10 sliders total (3 per section x 3 + 1 saturation)
      const sliders = panel.locator('input[type="range"]');
      await expect(sliders).toHaveCount(10);

      // Verify header buttons: Load, Save, Reset
      await expect(panel.locator('button:has-text("Load")')).toBeVisible();
      await expect(panel.locator('button:has-text("Save")')).toBeVisible();
      await expect(panel.locator('button:has-text("Reset")')).toBeVisible();
    });
  });

  test.describe('CDL Slope Adjustment', () => {
    test('CDL-E010: increasing slope should brighten the image', async ({ page }) => {
      await openCDLPanel(page);

      const initialBrightness = await getCanvasBrightness(page);
      const initialScreenshot = await captureViewerScreenshot(page);

      // Increase all slope channels to 2.0 (brightens)
      for (const ch of ['r', 'g', 'b'] as const) {
        const slider = await getCDLSlider(page, 'slope', ch);
        await setCDLSliderValue(slider, 2.0);
      }
      await waitForRender(page);

      const adjustedBrightness = await getCanvasBrightness(page);
      const adjustedScreenshot = await captureViewerScreenshot(page);

      // Increasing slope multiplies pixel values, making the image brighter
      expect(adjustedBrightness).toBeGreaterThan(initialBrightness);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });

    test('CDL-E011: slope changes should be visible on canvas', async ({ page }) => {
      await openCDLPanel(page);

      const beforeState = await captureCanvasState(page);

      // Set slope R to 2.0 (warm tint by boosting red channel)
      const slopeR = await getCDLSlider(page, 'slope', 'r');
      await setCDLSliderValue(slopeR, 2.0);
      await waitForRender(page);

      const afterState = await captureCanvasState(page);
      expect(verifyCanvasChanged(beforeState, afterState)).toBe(true);
    });
  });

  test.describe('CDL Offset Adjustment', () => {
    test('CDL-E020: positive offset should lift shadow values', async ({ page }) => {
      await openCDLPanel(page);

      const initialBrightness = await getCanvasBrightness(page);
      const initialScreenshot = await captureViewerScreenshot(page);

      // Set positive offset on all channels (lifts shadows)
      for (const ch of ['r', 'g', 'b'] as const) {
        const slider = await getCDLSlider(page, 'offset', ch);
        await setCDLSliderValue(slider, 0.3);
      }
      await waitForRender(page);

      const adjustedBrightness = await getCanvasBrightness(page);
      const adjustedScreenshot = await captureViewerScreenshot(page);

      // Positive offset adds a constant, lifting dark values
      expect(adjustedBrightness).toBeGreaterThan(initialBrightness);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });

    test('CDL-E021: negative offset should darken the image', async ({ page }) => {
      await openCDLPanel(page);

      const initialBrightness = await getCanvasBrightness(page);
      const initialScreenshot = await captureViewerScreenshot(page);

      // Set negative offset on all channels
      for (const ch of ['r', 'g', 'b'] as const) {
        const slider = await getCDLSlider(page, 'offset', ch);
        await setCDLSliderValue(slider, -0.3);
      }
      await waitForRender(page);

      const adjustedBrightness = await getCanvasBrightness(page);
      const adjustedScreenshot = await captureViewerScreenshot(page);

      // Negative offset subtracts, darkening the image
      expect(adjustedBrightness).toBeLessThan(initialBrightness);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });
  });

  test.describe('CDL Power Adjustment', () => {
    test('CDL-E030: power > 1 should darken midtones (gamma correction)', async ({ page }) => {
      await openCDLPanel(page);

      const initialBrightness = await getCanvasBrightness(page);
      const initialScreenshot = await captureViewerScreenshot(page);

      // Power > 1 darkens midtones (raises the gamma exponent)
      for (const ch of ['r', 'g', 'b'] as const) {
        const slider = await getCDLSlider(page, 'power', ch);
        await setCDLSliderValue(slider, 2.0);
      }
      await waitForRender(page);

      const adjustedBrightness = await getCanvasBrightness(page);
      const adjustedScreenshot = await captureViewerScreenshot(page);

      // Power > 1 applies pow(x, 2.0) which darkens midtones
      expect(adjustedBrightness).toBeLessThan(initialBrightness);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });

    test('CDL-E031: power < 1 should brighten midtones', async ({ page }) => {
      await openCDLPanel(page);

      const initialBrightness = await getCanvasBrightness(page);
      const initialScreenshot = await captureViewerScreenshot(page);

      // Power < 1 brightens midtones (lowers the gamma exponent)
      for (const ch of ['r', 'g', 'b'] as const) {
        const slider = await getCDLSlider(page, 'power', ch);
        await setCDLSliderValue(slider, 0.5);
      }
      await waitForRender(page);

      const adjustedBrightness = await getCanvasBrightness(page);
      const adjustedScreenshot = await captureViewerScreenshot(page);

      // Power < 1 applies pow(x, 0.5) which brightens midtones
      expect(adjustedBrightness).toBeGreaterThan(initialBrightness);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });
  });

  test.describe('CDL Saturation', () => {
    test('CDL-E040: saturation 0 should produce grayscale output', async ({ page }) => {
      await openCDLPanel(page);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Set saturation to 0 (fully desaturated)
      const satSlider = await getCDLSaturationSlider(page);
      await setCDLSliderValue(satSlider, 0);
      await waitForRender(page, 500);

      const desaturatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, desaturatedScreenshot)).toBe(true);

      // Verify grayscale: sample multiple pixels and check R ~= G ~= B
      const pixels = await sampleCanvasPixels(page, [
        { x: 100, y: 100 },
        { x: 200, y: 150 },
        { x: 150, y: 200 },
      ]);

      for (const pixel of pixels) {
        // In grayscale, R, G, B should be very close to each other
        // Allow tolerance of 5 for rounding and compression artifacts
        if (pixel.a > 0) {
          expect(Math.abs(pixel.r - pixel.g)).toBeLessThanOrEqual(5);
          expect(Math.abs(pixel.g - pixel.b)).toBeLessThanOrEqual(5);
          expect(Math.abs(pixel.r - pixel.b)).toBeLessThanOrEqual(5);
        }
      }
    });

    test('CDL-E041: saturation > 1 should increase color intensity', async ({ page }) => {
      await openCDLPanel(page);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Increase saturation beyond 1.0
      const satSlider = await getCDLSaturationSlider(page);
      await setCDLSliderValue(satSlider, 1.8);
      await waitForRender(page);

      const saturatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, saturatedScreenshot)).toBe(true);
    });
  });

  test.describe('CDL Combined', () => {
    test('CDL-E050: multiple CDL adjustments should combine correctly', async ({ page }) => {
      await openCDLPanel(page);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply slope adjustment (warm tint)
      const slopeR = await getCDLSlider(page, 'slope', 'r');
      await setCDLSliderValue(slopeR, 1.3);
      const slopeB = await getCDLSlider(page, 'slope', 'b');
      await setCDLSliderValue(slopeB, 0.8);
      await waitForRender(page);

      const afterSlope = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterSlope)).toBe(true);

      // Add offset adjustment
      const offsetR = await getCDLSlider(page, 'offset', 'r');
      await setCDLSliderValue(offsetR, 0.05);
      await waitForRender(page);

      const afterOffset = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(afterSlope, afterOffset)).toBe(true);

      // Add power adjustment
      const powerG = await getCDLSlider(page, 'power', 'g');
      await setCDLSliderValue(powerG, 1.2);
      await waitForRender(page);

      const afterPower = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(afterOffset, afterPower)).toBe(true);
    });

    test('CDL-E051: CDL should work with other color adjustments (exposure)', async ({ page }) => {
      // First apply exposure via the color controls panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find and adjust exposure slider in the color controls panel
      const exposureSlider = page
        .locator('.color-controls-panel label')
        .filter({ hasText: 'Exposure' })
        .locator('..')
        .locator('input[type="range"]');
      await exposureSlider.fill('1.5');
      await exposureSlider.dispatchEvent('input');
      await waitForRender(page);

      const afterExposure = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterExposure)).toBe(true);

      // Close color controls panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Now open CDL panel and apply slope adjustment
      await openCDLPanel(page);
      const slopeR = await getCDLSlider(page, 'slope', 'r');
      await setCDLSliderValue(slopeR, 1.5);
      await waitForRender(page);

      const afterCDL = await captureViewerScreenshot(page);
      // CDL on top of exposure should produce a different result
      expect(imagesAreDifferent(afterExposure, afterCDL)).toBe(true);
    });
  });

  test.describe('CDL Reset', () => {
    test('CDL-E060: reset should restore original appearance', async ({ page }) => {
      await openCDLPanel(page);

      const initialScreenshot = await captureViewerScreenshot(page);
      const initialBrightness = await getCanvasBrightness(page);

      // Apply various CDL adjustments
      const slopeR = await getCDLSlider(page, 'slope', 'r');
      await setCDLSliderValue(slopeR, 2.0);
      const offsetG = await getCDLSlider(page, 'offset', 'g');
      await setCDLSliderValue(offsetG, 0.2);
      const powerB = await getCDLSlider(page, 'power', 'b');
      await setCDLSliderValue(powerB, 0.7);
      const satSlider = await getCDLSaturationSlider(page);
      await setCDLSliderValue(satSlider, 0.5);
      await waitForRender(page, 500);

      const adjustedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);

      // Click Reset
      await clickCDLReset(page);
      await waitForRender(page, 500);

      const resetScreenshot = await captureViewerScreenshot(page);
      const resetBrightness = await getCanvasBrightness(page);

      // After reset, the image should return to approximately the original appearance.
      // The reset screenshot should differ from the adjusted one.
      expect(imagesAreDifferent(adjustedScreenshot, resetScreenshot)).toBe(true);

      // Brightness should be close to original (within tolerance for render timing)
      expect(Math.abs(resetBrightness - initialBrightness)).toBeLessThan(5);
    });

    test('CDL-E061: CDL state should persist across frame changes', async ({ page }) => {
      await openCDLPanel(page);

      // Apply a CDL adjustment
      const slopeR = await getCDLSlider(page, 'slope', 'r');
      await setCDLSliderValue(slopeR, 1.8);
      await waitForRender(page);

      const adjustedScreenshot = await captureViewerScreenshot(page);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await waitForRender(page, 500);

      // The CDL panel should still show the adjusted value
      // Re-read the slope R slider value
      const slopeRAfterFrame = await getCDLSlider(page, 'slope', 'r');
      const sliderValue = await slopeRAfterFrame.inputValue();
      expect(parseFloat(sliderValue)).toBeCloseTo(1.8, 1);

      // Visual output should still show the CDL effect (different from default)
      // Step back to original frame to compare
      await page.keyboard.press('ArrowLeft');
      await waitForRender(page, 500);

      const returnedScreenshot = await captureViewerScreenshot(page);
      // The screenshot on the same frame should match the adjusted state
      // (CDL persists, so the same frame should look the same)
      expect(imagesAreDifferent(adjustedScreenshot, returnedScreenshot)).toBe(false);
    });
  });
});
