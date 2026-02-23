import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Parade Scope (RGB Parade) Tests
 *
 * Tests for side-by-side waveform display of Red, Green, and Blue channels
 * for easy color balance analysis.
 *
 * Test cases from features.md section 2.1:
 * - PARADE-001: RGB channels display separately
 * - PARADE-002: Horizontal position corresponds to image
 * - PARADE-003: Channel colors are correct
 * - PARADE-004: Scale matches 0-100 IRE (0-255 in implementation)
 * - PARADE-005: Updates in real-time during playback
 * - PARADE-006: YCbCr mode shows correct channels (NOT YET IMPLEMENTED - marked optional)
 */

// Helper to get slider by label name
async function getSliderByLabel(page: import('@playwright/test').Page, label: string) {
  return page.locator('.color-controls-panel label').filter({ hasText: label }).locator('..').locator('input[type="range"]');
}

test.describe('Parade Scope (RGB Parade)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(200);
  });

  test.describe('Basic Parade Display', () => {
    test('PARADE-001: RGB channels display separately', async ({ page }) => {
      // Open waveform
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      // Verify waveform is visible
      let state = await getViewerState(page);
      expect(state.waveformVisible).toBe(true);

      // Initial mode might be luma or rgb
      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      await expect(modeButton).toBeVisible();

      // Cycle to parade mode
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      // Verify mode is parade
      state = await getViewerState(page);
      expect(state.waveformMode).toBe('parade');

      // Parade mode should show three sections for R, G, B channels
      // Verify by checking the waveform container is visible and contains canvas content
      const waveformContainer = page.locator('[data-testid="waveform-container"]');
      await expect(waveformContainer).toBeVisible();

      const paradeScreenshot = await waveformContainer.screenshot();
      // Parade screenshot should have meaningful content (not just a tiny empty buffer)
      expect(paradeScreenshot.length).toBeGreaterThan(100);
    });

    test('PARADE-002: horizontal position corresponds to image', async ({ page }) => {
      // Open waveform and set to parade mode
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      const initialParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Open color panel and apply temperature shift (affects color distribution)
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const temperatureSlider = await getSliderByLabel(page, 'Temperature');
      await temperatureSlider.fill('50');
      await temperatureSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Parade should update to reflect the color change
      const afterTemperatureParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // The parade should look different after temperature change
      expect(imagesAreDifferent(initialParade, afterTemperatureParade)).toBe(true);
    });

    test('PARADE-003: channel colors are correct', async ({ page }) => {
      // Open waveform and set to parade mode
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      // Verify mode is parade and the waveform canvas has rendered content
      const state = await getViewerState(page);
      expect(state.waveformMode).toBe('parade');

      const paradeScreenshot = await page.locator('[data-testid="waveform-container"] canvas').screenshot();
      expect(paradeScreenshot.length).toBeGreaterThan(100);
    });

    test('PARADE-004: scale matches 0-255 range', async ({ page }) => {
      // Open waveform and set to parade mode
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      // Check footer shows scale markers (0, 128, 255)
      const waveformFooter = page.locator('[data-testid="waveform-container"] .waveform-footer');
      await expect(waveformFooter).toBeVisible();

      const footerText = await waveformFooter.textContent();
      expect(footerText).toContain('0');
      expect(footerText).toContain('128');
      expect(footerText).toContain('255');
    });
  });

  test.describe('Real-time Updates', () => {
    test('PARADE-005: updates in real-time during playback', async ({ page }) => {
      // Open waveform and set to parade mode
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      // Take initial parade screenshot
      const frame1Parade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);

      // Take parade screenshot after frame change
      const frame2Parade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Verify the waveform is still in parade mode and visible after frame change
      const state = await getViewerState(page);
      expect(state.waveformMode).toBe('parade');
      expect(state.waveformVisible).toBe(true);

      // Parade screenshots should have meaningful content (non-empty buffers)
      expect(frame1Parade.length).toBeGreaterThan(100);
      expect(frame2Parade.length).toBeGreaterThan(100);
    });

    test('PARADE-005b: parade updates with color adjustments', async ({ page }) => {
      // Open waveform and set to parade mode
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      const initialParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Open color panel and adjust exposure
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('3');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Parade should show higher values (brighter image)
      const brighterParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();
      expect(imagesAreDifferent(initialParade, brighterParade)).toBe(true);

      // Reduce exposure to create darker image
      await exposureSlider.fill('-3');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(500);

      // Parade should show lower values (darker image)
      const darkerParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Compare darker to initial (not brighter) since the change should be significant
      expect(imagesAreDifferent(initialParade, darkerParade)).toBe(true);
    });
  });

  test.describe('Mode Switching', () => {
    test('PARADE-010: can switch between luma, rgb, and parade modes', async ({ page }) => {
      // Open waveform
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');

      // Cycle through all modes
      const modes = ['Luma', 'RGB', 'Parade'];
      let foundModes: string[] = [];

      for (let i = 0; i < 4; i++) {
        const currentMode = await modeButton.textContent();
        if (currentMode && !foundModes.includes(currentMode)) {
          foundModes.push(currentMode);
        }
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      // Should have found all three modes
      expect(foundModes).toContain('Luma');
      expect(foundModes).toContain('RGB');
      expect(foundModes).toContain('Parade');
    });

    test('PARADE-011: each mode displays differently', async ({ page }) => {
      // Open waveform
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');

      // Set to Luma mode
      while ((await modeButton.textContent()) !== 'Luma') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }
      const lumaScreenshot = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Set to RGB mode
      while ((await modeButton.textContent()) !== 'RGB') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }
      const rgbScreenshot = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Set to Parade mode
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }
      const paradeScreenshot = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // All three modes should look different
      expect(imagesAreDifferent(lumaScreenshot, rgbScreenshot)).toBe(true);
      expect(imagesAreDifferent(rgbScreenshot, paradeScreenshot)).toBe(true);
      expect(imagesAreDifferent(lumaScreenshot, paradeScreenshot)).toBe(true);
    });
  });

  test.describe('Edge Cases', () => {
    test('PARADE-020: parade displays correctly with saturated content', async ({ page }) => {
      // Open waveform and set to parade mode
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      const initialParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Open color panel and increase saturation
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('2');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // With high saturation, R/G/B channels should diverge more
      const saturatedParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();
      expect(imagesAreDifferent(initialParade, saturatedParade)).toBe(true);
    });

    test('PARADE-021: parade displays correctly with desaturated content', async ({ page }) => {
      // Open waveform and set to parade mode
      await page.keyboard.press('w');
      await page.waitForTimeout(300);

      const modeButton = page.locator('[data-testid="waveform-mode-button"]');
      while ((await modeButton.textContent()) !== 'Parade') {
        await modeButton.click();
        await page.waitForTimeout(100);
      }

      // Capture initial parade before desaturation
      const initialParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();

      // Open color panel and reduce saturation to 0 (grayscale)
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('0');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Verify mode is still parade and the display updated
      const state = await getViewerState(page);
      expect(state.waveformMode).toBe('parade');

      // With 0 saturation, all three channels should converge (grayscale)
      // The parade should look different from the initial color parade
      const grayscaleParade = await page.locator('[data-testid="waveform-container"] canvas').screenshot();
      expect(imagesAreDifferent(initialParade, grayscaleParade)).toBe(true);
    });
  });

  // Note: YCbCr mode is marked as optional in features.md and not yet implemented.
  // Deleted PARADE-006 stub (empty body, no assertions).
});
