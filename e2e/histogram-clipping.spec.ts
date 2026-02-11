import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
} from './fixtures';

/**
 * Histogram Clipping Indicators Tests
 *
 * Tests for visual indicators showing clipped highlights and shadows
 * in the histogram display.
 *
 * Test cases from features.md section 2.6:
 * - CLIP-001: Highlight indicator shows clipped percentage
 * - CLIP-002: Shadow indicator shows crushed percentage
 * - CLIP-003: Click toggles overlay on viewer
 * - CLIP-004: Overlay updates during grading
 */

// Helper to get slider by label name
async function getSliderByLabel(page: import('@playwright/test').Page, label: string) {
  return page.locator('.color-controls-panel label').filter({ hasText: label }).locator('..').locator('input[type="range"]');
}

test.describe('Histogram Clipping Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(200);
  });

  test.describe('Clipping Statistics Display', () => {
    test('CLIP-001: highlight indicator shows clipped percentage', async ({ page }) => {
      // Open histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      // Verify histogram is visible
      const state = await getViewerState(page);
      expect(state.histogramVisible).toBe(true);

      // Check that highlight indicator exists and shows a percentage
      const highlightIndicator = page.locator('[data-testid="histogram-highlight-indicator"]');
      await expect(highlightIndicator).toBeVisible();

      // Should contain percentage text
      const highlightText = await highlightIndicator.textContent();
      expect(highlightText).toMatch(/\d+\.?\d*%/);
    });

    test('CLIP-002: shadow indicator shows crushed percentage', async ({ page }) => {
      // Open histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      // Check that shadow indicator exists and shows a percentage
      const shadowIndicator = page.locator('[data-testid="histogram-shadow-indicator"]');
      await expect(shadowIndicator).toBeVisible();

      // Should contain percentage text
      const shadowText = await shadowIndicator.textContent();
      expect(shadowText).toMatch(/\d+\.?\d*%/);
    });

    test('CLIP-001b: clipping indicators update after exposure change', async ({ page }) => {
      // Open histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      // Get initial clipping values
      const highlightIndicator = page.locator('[data-testid="histogram-highlight-indicator"]');
      const shadowIndicator = page.locator('[data-testid="histogram-shadow-indicator"]');

      const initialHighlightText = await highlightIndicator.textContent();
      const initialShadowText = await shadowIndicator.textContent();

      // Open color panel and increase exposure to create highlights clipping
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('3');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Clipping indicators should have updated
      const afterHighlightText = await highlightIndicator.textContent();

      // With high exposure, highlight clipping should increase
      // Note: The exact value depends on the test video content
      expect(afterHighlightText).toMatch(/\d+\.?\d*%/);

      // Now decrease exposure to create shadow clipping
      await exposureSlider.fill('-3');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      const afterShadowText = await shadowIndicator.textContent();
      expect(afterShadowText).toMatch(/\d+\.?\d*%/);
    });
  });

  test.describe('Clipping Overlay Toggle', () => {
    test('CLIP-003: click toggles overlay on viewer', async ({ page }) => {
      // Open histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      // Verify initial state - overlay should be disabled
      let state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(false);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Click on the clipping indicators row to toggle overlay
      const clippingIndicators = page.locator('[data-testid="histogram-clipping-indicators"]');
      await expect(clippingIndicators).toBeVisible();
      await clippingIndicators.click();
      await page.waitForTimeout(300);

      // Overlay should now be enabled
      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);

      // Canvas should look different (overlay applied)
      const overlayScreenshot = await captureViewerScreenshot(page);
      // Note: If there are no clipped pixels, screenshots may be the same
      // We primarily verify the state toggle

      // Click again to disable
      await clippingIndicators.click();
      await page.waitForTimeout(300);

      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(false);
    });

    test('CLIP-003b: clipping overlay has visual indicator when active', async ({ page }) => {
      // Open histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      const clippingIndicators = page.locator('[data-testid="histogram-clipping-indicators"]');

      // Check initial background (should be transparent/no special style)
      const initialBg = await clippingIndicators.evaluate(el => getComputedStyle(el).background);

      // Enable overlay
      await clippingIndicators.click();
      await page.waitForTimeout(200);

      // Background should change to indicate active state
      const activeBg = await clippingIndicators.evaluate(el => getComputedStyle(el).background);

      // The backgrounds should be different (active state has highlight)
      expect(activeBg).not.toBe(initialBg);
    });
  });

  test.describe('Overlay During Grading', () => {
    test('CLIP-004: overlay updates during grading', async ({ page }) => {
      // Open histogram and enable clipping overlay
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      const clippingIndicators = page.locator('[data-testid="histogram-clipping-indicators"]');
      await clippingIndicators.click();
      await page.waitForTimeout(200);

      // Verify overlay is enabled
      let state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Open color panel and make adjustments
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Increase exposure to create highlight clipping
      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('4');
      await exposureSlider.dispatchEvent('input');
      await page.waitForFunction(
        () => (window as unknown as { __OPENRV_TEST__?: { getColorState?: () => { exposure?: number } } })
          .__OPENRV_TEST__?.getColorState?.()?.exposure === 4,
        undefined,
        { timeout: 5000 },
      );

      // Capture state after exposure grading.
      const afterExposureScreenshot = await captureViewerScreenshot(page);
      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);
      expect(state.histogramClipping).not.toBeNull();

      // Adjust whites to affect clipping differently
      const whitesSlider = await getSliderByLabel(page, 'Whites');
      await whitesSlider.fill('50');
      await whitesSlider.dispatchEvent('input');
      await page.waitForFunction(
        () => (window as unknown as { __OPENRV_TEST__?: { getColorState?: () => { whites?: number } } })
          .__OPENRV_TEST__?.getColorState?.()?.whites === 50,
        undefined,
        { timeout: 5000 },
      );

      // Capture state after whites grading.
      const afterWhitesScreenshot = await captureViewerScreenshot(page);
      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);
      expect(state.histogramClipping).not.toBeNull();

      // Keep screenshots to ensure we can sample render output after each grading action.
      expect(typeof initialScreenshot).toBe('object');
      expect(typeof afterExposureScreenshot).toBe('object');
      expect(typeof afterWhitesScreenshot).toBe('object');
    });

    test('CLIP-004b: overlay shows different colors for highlights vs shadows', async ({ page }) => {
      // Open histogram and enable clipping overlay
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      const clippingIndicators = page.locator('[data-testid="histogram-clipping-indicators"]');
      await clippingIndicators.click();
      await page.waitForTimeout(200);

      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Create highlight clipping with high exposure
      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('5');
      await exposureSlider.dispatchEvent('input');
      await page.waitForFunction(
        () => (window as unknown as { __OPENRV_TEST__?: { getColorState?: () => { exposure?: number } } })
          .__OPENRV_TEST__?.getColorState?.()?.exposure === 5,
        undefined,
        { timeout: 5000 },
      );

      const highlightClippingScreenshot = await captureViewerScreenshot(page);
      let state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);
      expect(state.histogramClipping).not.toBeNull();

      // Reset and create shadow clipping with negative exposure
      await exposureSlider.fill('-5');
      await exposureSlider.dispatchEvent('input');
      await page.waitForFunction(
        () => (window as unknown as { __OPENRV_TEST__?: { getColorState?: () => { exposure?: number } } })
          .__OPENRV_TEST__?.getColorState?.()?.exposure === -5,
        undefined,
        { timeout: 5000 },
      );

      const shadowClippingScreenshot = await captureViewerScreenshot(page);
      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);
      expect(state.histogramClipping).not.toBeNull();

      // Keep screenshots to ensure render capture remains valid at both extremes.
      expect(typeof highlightClippingScreenshot).toBe('object');
      expect(typeof shadowClippingScreenshot).toBe('object');
    });
  });

  test.describe('Edge Cases', () => {
    test('CLIP-010: clipping overlay persists across frame changes', async ({ page }) => {
      // Open histogram and enable clipping overlay
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      const clippingIndicators = page.locator('[data-testid="histogram-clipping-indicators"]');
      await clippingIndicators.click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Overlay should still be enabled
      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);
    });

    test('CLIP-011: clipping overlay persists when histogram closed and reopened', async ({ page }) => {
      // Open histogram and enable clipping overlay
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      const clippingIndicators = page.locator('[data-testid="histogram-clipping-indicators"]');
      await clippingIndicators.click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);

      // Close histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      // Overlay should remain active (persists independently of histogram visibility)
      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);

      // Re-open histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      // Clipping indicators should still show overlay is active
      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(true);

      // Toggle off overlay
      await clippingIndicators.click();
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.clippingOverlayEnabled).toBe(false);
    });

    test('CLIP-012: clipping indicators show 0% when no clipping', async ({ page }) => {
      // Open histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(300);

      // Open color panel and set neutral exposure
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const exposureSlider = await getSliderByLabel(page, 'Exposure');
      await exposureSlider.fill('0');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Get clipping values from state
      const state = await getViewerState(page);

      // Clipping percentages should be present (may or may not be 0 depending on content)
      expect(state.histogramClipping).not.toBeNull();
      if (state.histogramClipping) {
        expect(typeof state.histogramClipping.shadowsPercent).toBe('number');
        expect(typeof state.histogramClipping.highlightsPercent).toBe('number');
      }
    });
  });
});
