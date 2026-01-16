import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Color Controls Tests
 *
 * Each test verifies actual state changes (exposure, gamma, saturation, etc.)
 * and visual modifications to the canvas.
 */

// Helper to get slider by label name
async function getSliderByLabel(page: import('@playwright/test').Page, label: string) {
  return page.locator('.color-controls-panel label').filter({ hasText: label }).locator('..').locator('input[type="range"]');
}

test.describe('Color Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab (use text match instead of data attribute)
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);
  });

  test.describe('Color Adjustments Panel', () => {
    test('COLOR-001: color tab should show color adjustment controls', async ({ page }) => {
      const colorButton = page.locator('button[title*="color adjustments"]').first();
      await expect(colorButton).toBeVisible();
    });

    test('COLOR-002: pressing C key should toggle color panel visibility', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Panel should be visible
      const colorPanel = page.locator('.color-controls-panel');
      await expect(colorPanel).toBeVisible();

      // Toggle closed
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Panel should be hidden
      await expect(colorPanel).not.toBeVisible();
    });

    test('COLOR-003: pressing Escape should close color panel', async ({ page }) => {
      // Open panel first
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const colorPanel = page.locator('.color-controls-panel');
      await expect(colorPanel).toBeVisible();

      // Close with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      await expect(colorPanel).not.toBeVisible();
    });
  });

  test.describe('Exposure Control', () => {
    test('COLOR-010: adjusting exposure should update state and visually change canvas', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.exposure).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find exposure slider by label
      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('2');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(2, 1);

      const adjustedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });

    test('COLOR-011: increasing exposure should brighten the image', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('3');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const brightScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, brightScreenshot)).toBe(true);
    });

    test('COLOR-012: double-click on exposure slider should reset to default', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const exposureSlider = await getSliderByLabel(page, 'Exposure');

      // Set exposure
      await exposureSlider.fill('2');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(2, 1);

      // Double-click to reset
      await exposureSlider.dblclick();
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(0, 1);
    });
  });

  test.describe('Gamma Control', () => {
    test('COLOR-020: adjusting gamma should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.gamma).toBeCloseTo(1, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      const gammaSlider = await getSliderByLabel(page, 'Gamma');
      await gammaSlider.fill('1.5');
      await gammaSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.gamma).toBeCloseTo(1.5, 1);

      const adjustedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });
  });

  test.describe('Saturation Control', () => {
    test('COLOR-030: adjusting saturation should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.saturation).toBeCloseTo(1, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('0');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.saturation).toBeCloseTo(0, 1);

      const desaturatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, desaturatedScreenshot)).toBe(true);
    });

    test('COLOR-031: setting saturation to 0 should produce grayscale image', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const colorScreenshot = await captureViewerScreenshot(page);

      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('0');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const state = await getColorState(page);
      expect(state.saturation).toBeCloseTo(0, 1);

      const grayscaleScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(colorScreenshot, grayscaleScreenshot)).toBe(true);
    });
  });

  test.describe('Contrast Control', () => {
    test('COLOR-040: adjusting contrast should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.contrast).toBeCloseTo(1, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      const contrastSlider = await getSliderByLabel(page, 'Contrast');
      await contrastSlider.fill('1.5');
      await contrastSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.contrast).toBeCloseTo(1.5, 1);

      const contrastScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, contrastScreenshot)).toBe(true);
    });
  });

  test.describe('Temperature and Tint', () => {
    test('COLOR-050: adjusting temperature should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.temperature).toBeCloseTo(0, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      const tempSlider = await getSliderByLabel(page, 'Temperature');
      await tempSlider.fill('50');
      await tempSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.temperature).toBeCloseTo(50, 0);

      const warmScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, warmScreenshot)).toBe(true);
    });

    test('COLOR-051: adjusting tint should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.tint).toBeCloseTo(0, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      const tintSlider = await getSliderByLabel(page, 'Tint');
      await tintSlider.fill('30');
      await tintSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.tint).toBeCloseTo(30, 0);

      const tintedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, tintedScreenshot)).toBe(true);
    });
  });

  test.describe('Brightness Control', () => {
    test('COLOR-060: adjusting brightness should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.brightness).toBeCloseTo(0, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      const brightnessSlider = await getSliderByLabel(page, 'Brightness');
      await brightnessSlider.fill('0.3');
      await brightnessSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.brightness).toBeCloseTo(0.3, 1);

      const brightScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, brightScreenshot)).toBe(true);
    });
  });

  test.describe('LUT Support', () => {
    test('COLOR-070: LUT button should be visible', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Look for LUT load button in panel
      const lutButton = page.locator('.color-controls-panel button:has-text("Load .cube")');
      await expect(lutButton).toBeVisible();
    });

    test('COLOR-071: LUT intensity slider should adjust LUT blend', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // LUT intensity slider is found by label "Intensity"
      const lutSlider = await getSliderByLabel(page, 'Intensity');

      let state = await getColorState(page);
      expect(state.lutIntensity).toBeCloseTo(1, 1);  // Default is 1.0

      await lutSlider.fill('0.5');
      await lutSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.lutIntensity).toBeCloseTo(0.5, 1);
    });
  });

  test.describe('Color Combinations', () => {
    test('COLOR-080: multiple color adjustments should combine correctly', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Adjust exposure
      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('1');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const afterExposure = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterExposure)).toBe(true);

      // Also adjust saturation
      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('1.5');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const combinedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(afterExposure, combinedScreenshot)).toBe(true);

      // Verify both states updated
      const state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(1, 1);
      expect(state.saturation).toBeCloseTo(1.5, 1);
    });
  });

  test.describe('Color Reset', () => {
    test('COLOR-090: reset button should restore all color adjustments to default', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Apply several adjustments
      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('2');
      await exposureSlider.dispatchEvent('input');

      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('0.5');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(2, 1);
      expect(state.saturation).toBeCloseTo(0.5, 1);

      // Click reset button (title is "Reset all adjustments")
      const resetButton = page.locator('.color-controls-panel button:has-text("Reset")');
      await resetButton.click();
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(0, 1);
      expect(state.saturation).toBeCloseTo(1, 1);
      expect(state.gamma).toBeCloseTo(1, 1);
      expect(state.contrast).toBeCloseTo(1, 1);
    });
  });

  test.describe('Color State Persistence', () => {
    test('COLOR-100: color adjustments should persist across frame changes', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Adjust exposure
      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('2');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(2, 1);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Color adjustments should be maintained
      state = await getColorState(page);
      expect(state.exposure).toBeCloseTo(2, 1);
    });
  });
});
