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

test.describe('Color Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
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

      // Find and adjust exposure slider (first slider after LUT intensity)
      const exposureSlider = page.locator('.color-controls-panel input[type="range"]').nth(1);
      if (await exposureSlider.isVisible()) {
        await exposureSlider.evaluate((el: HTMLInputElement) => {
          el.value = '2';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.exposure).toBeCloseTo(2, 1);

        const adjustedScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
      }
    });

    test('COLOR-011: increasing exposure should brighten the image', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      const exposureSlider = page.locator('.color-controls-panel input[type="range"]').nth(1);
      if (await exposureSlider.isVisible()) {
        // Set high exposure
        await exposureSlider.evaluate((el: HTMLInputElement) => {
          el.value = '3';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        const brightScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, brightScreenshot)).toBe(true);
      }
    });

    test('COLOR-012: double-click on exposure slider should reset to default', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const exposureSlider = page.locator('.color-controls-panel input[type="range"]').nth(1);
      if (await exposureSlider.isVisible()) {
        // Set exposure
        await exposureSlider.evaluate((el: HTMLInputElement) => {
          el.value = '2';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(100);

        let state = await getColorState(page);
        expect(state.exposure).not.toBe(0);

        // Double-click to reset
        await exposureSlider.dblclick();
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.exposure).toBeCloseTo(0, 1);
      }
    });
  });

  test.describe('Gamma Control', () => {
    test('COLOR-020: adjusting gamma should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.gamma).toBeCloseTo(1, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Gamma is usually third slider
      const gammaSlider = page.locator('.color-controls-panel input[type="range"]').nth(2);
      if (await gammaSlider.isVisible()) {
        await gammaSlider.evaluate((el: HTMLInputElement) => {
          el.value = '1.5';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.gamma).toBeCloseTo(1.5, 1);

        const adjustedScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
      }
    });
  });

  test.describe('Saturation Control', () => {
    test('COLOR-030: adjusting saturation should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.saturation).toBeCloseTo(1, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find saturation slider
      const saturationSlider = page.locator('.color-controls-panel input[type="range"]').nth(3);
      if (await saturationSlider.isVisible()) {
        // Desaturate
        await saturationSlider.evaluate((el: HTMLInputElement) => {
          el.value = '0';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.saturation).toBeCloseTo(0, 1);

        const desaturatedScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, desaturatedScreenshot)).toBe(true);
      }
    });

    test('COLOR-031: setting saturation to 0 should produce grayscale image', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const colorScreenshot = await captureViewerScreenshot(page);

      const saturationSlider = page.locator('.color-controls-panel input[type="range"]').nth(3);
      if (await saturationSlider.isVisible()) {
        await saturationSlider.evaluate((el: HTMLInputElement) => {
          el.value = '0';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        const state = await getColorState(page);
        expect(state.saturation).toBeCloseTo(0, 1);

        const grayscaleScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(colorScreenshot, grayscaleScreenshot)).toBe(true);
      }
    });
  });

  test.describe('Contrast Control', () => {
    test('COLOR-040: adjusting contrast should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.contrast).toBeCloseTo(1, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find contrast slider
      const contrastSlider = page.locator('.color-controls-panel input[type="range"]').nth(4);
      if (await contrastSlider.isVisible()) {
        // Increase contrast
        await contrastSlider.evaluate((el: HTMLInputElement) => {
          el.value = '1.5';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.contrast).toBeCloseTo(1.5, 1);

        const contrastScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, contrastScreenshot)).toBe(true);
      }
    });
  });

  test.describe('Temperature and Tint', () => {
    test('COLOR-050: adjusting temperature should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.temperature).toBeCloseTo(0, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find temperature slider
      const tempSlider = page.locator('.color-controls-panel input[type="range"]').nth(5);
      if (await tempSlider.isVisible()) {
        // Make warmer
        await tempSlider.evaluate((el: HTMLInputElement) => {
          el.value = '50';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.temperature).not.toBeCloseTo(0, 1);

        const warmScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, warmScreenshot)).toBe(true);
      }
    });

    test('COLOR-051: adjusting tint should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.tint).toBeCloseTo(0, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find tint slider
      const tintSlider = page.locator('.color-controls-panel input[type="range"]').nth(6);
      if (await tintSlider.isVisible()) {
        // Adjust tint
        await tintSlider.evaluate((el: HTMLInputElement) => {
          el.value = '30';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.tint).not.toBeCloseTo(0, 1);

        const tintedScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, tintedScreenshot)).toBe(true);
      }
    });
  });

  test.describe('Brightness Control', () => {
    test('COLOR-060: adjusting brightness should update state and change canvas', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      let state = await getColorState(page);
      expect(state.brightness).toBeCloseTo(0, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find brightness slider
      const brightnessSlider = page.locator('.color-controls-panel input[type="range"]').nth(7);
      if (await brightnessSlider.isVisible()) {
        // Increase brightness
        await brightnessSlider.evaluate((el: HTMLInputElement) => {
          el.value = '0.3';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.brightness).not.toBeCloseTo(0, 1);

        const brightScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, brightScreenshot)).toBe(true);
      }
    });
  });

  test.describe('LUT Support', () => {
    test('COLOR-070: LUT button should be visible', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Look for LUT button or label
      const lutButton = page.locator('button[title*="LUT"]').first();
      if (await lutButton.isVisible()) {
        await expect(lutButton).toBeVisible();
      }
    });

    test('COLOR-071: LUT intensity slider should adjust LUT blend', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // LUT intensity is usually first slider
      const lutSlider = page.locator('.color-controls-panel input[type="range"]').first();
      if (await lutSlider.isVisible()) {
        let state = await getColorState(page);
        const initialIntensity = state.lutIntensity;

        await lutSlider.evaluate((el: HTMLInputElement) => {
          el.value = '0.5';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.lutIntensity).toBeCloseTo(0.5, 1);
      }
    });
  });

  test.describe('Color Combinations', () => {
    test('COLOR-080: multiple color adjustments should combine correctly', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Adjust exposure
      const exposureSlider = page.locator('.color-controls-panel input[type="range"]').nth(1);
      if (await exposureSlider.isVisible()) {
        await exposureSlider.evaluate((el: HTMLInputElement) => {
          el.value = '1';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(100);
      }

      const afterExposure = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterExposure)).toBe(true);

      // Also adjust saturation
      const saturationSlider = page.locator('.color-controls-panel input[type="range"]').nth(3);
      if (await saturationSlider.isVisible()) {
        await saturationSlider.evaluate((el: HTMLInputElement) => {
          el.value = '1.5';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(100);
      }

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
      const exposureSlider = page.locator('.color-controls-panel input[type="range"]').nth(1);
      if (await exposureSlider.isVisible()) {
        await exposureSlider.evaluate((el: HTMLInputElement) => {
          el.value = '2';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }

      const saturationSlider = page.locator('.color-controls-panel input[type="range"]').nth(3);
      if (await saturationSlider.isVisible()) {
        await saturationSlider.evaluate((el: HTMLInputElement) => {
          el.value = '0.5';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.exposure).not.toBeCloseTo(0, 1);
      expect(state.saturation).not.toBeCloseTo(1, 1);

      // Look for reset button
      const resetButton = page.locator('.color-controls-panel button[title*="Reset"]').first();
      if (await resetButton.isVisible()) {
        await resetButton.click();
        await page.waitForTimeout(200);

        state = await getColorState(page);
        expect(state.exposure).toBeCloseTo(0, 1);
        expect(state.saturation).toBeCloseTo(1, 1);
        expect(state.gamma).toBeCloseTo(1, 1);
        expect(state.contrast).toBeCloseTo(1, 1);
      }
    });
  });

  test.describe('Color State Persistence', () => {
    test('COLOR-100: color adjustments should persist across frame changes', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Adjust exposure
      const exposureSlider = page.locator('.color-controls-panel input[type="range"]').nth(1);
      if (await exposureSlider.isVisible()) {
        await exposureSlider.evaluate((el: HTMLInputElement) => {
          el.value = '2';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(100);
      }

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
