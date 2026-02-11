import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Highlight/Shadow Recovery Tests
 *
 * Tests for recovering detail in blown highlights and crushed shadows
 * without affecting midtones.
 *
 * Test cases from features.md section 1.2:
 * - HL-001: Highlight slider recovers blown-out areas
 * - HL-002: Shadow slider reveals shadow detail
 * - HL-003: Whites slider clips white point
 * - HL-004: Blacks slider clips black point
 * - HL-005: Recovery preserves color hue
 * - HL-006: Works correctly with HDR content (skip - no HDR test content)
 * - HL-007: Scopes reflect highlight/shadow changes
 */

// Helper to get slider by label name
async function getSliderByLabel(page: import('@playwright/test').Page, label: string) {
  return page.locator('.color-controls-panel label').filter({ hasText: label }).locator('..').locator('input[type="range"]');
}

test.describe('Highlight/Shadow Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);
  });

  test.describe('Highlight Control', () => {
    test('HL-001: highlight slider recovers blown-out areas', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Verify default state
      let state = await getColorState(page);
      expect(state.highlights).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply negative highlights to recover blown-out areas
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.fill('-50');
      await highlightsSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      // Verify state updated
      state = await getColorState(page);
      expect(state.highlights).toBe(-50);

      // Canvas should have changed (highlights compressed)
      const recoveredScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, recoveredScreenshot)).toBe(true);

      // Apply positive highlights to boost
      await highlightsSlider.fill('50');
      await highlightsSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.highlights).toBe(50);

      const boostedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, boostedScreenshot)).toBe(true);
      expect(imagesAreDifferent(recoveredScreenshot, boostedScreenshot)).toBe(true);
    });

    test('HL-001b: highlight recovery extreme values work', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Test extreme negative (full recovery)
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.fill('-100');
      await highlightsSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const state = await getColorState(page);
      expect(state.highlights).toBe(-100);

      const extremeScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, extremeScreenshot)).toBe(true);
    });
  });

  test.describe('Shadow Control', () => {
    test('HL-002: shadow slider reveals shadow detail', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Verify default state
      let state = await getColorState(page);
      expect(state.shadows).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply positive shadows to lift/reveal shadow detail
      const shadowsSlider = await getSliderByLabel(page, 'Shadows');
      await shadowsSlider.fill('50');
      await shadowsSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      // Verify state updated
      state = await getColorState(page);
      expect(state.shadows).toBe(50);

      // Canvas should have changed (shadows lifted)
      const liftedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, liftedScreenshot)).toBe(true);

      // Apply negative shadows to crush
      await shadowsSlider.fill('-50');
      await shadowsSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.shadows).toBe(-50);

      const crushedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, crushedScreenshot)).toBe(true);
      expect(imagesAreDifferent(liftedScreenshot, crushedScreenshot)).toBe(true);
    });
  });

  test.describe('Whites Control', () => {
    test('HL-003: whites slider clips white point', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Verify default state
      let state = await getColorState(page);
      expect(state.whites).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply positive whites to clip (lower white point)
      const whitesSlider = await getSliderByLabel(page, 'Whites');
      await whitesSlider.fill('50');
      await whitesSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.whites).toBe(50);

      // Canvas should have changed (white point lowered, brighter overall)
      const clippedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, clippedScreenshot)).toBe(true);

      // Apply negative whites to extend white point
      await whitesSlider.fill('-50');
      await whitesSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.whites).toBe(-50);

      const extendedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(clippedScreenshot, extendedScreenshot)).toBe(true);
    });
  });

  test.describe('Blacks Control', () => {
    test('HL-004: blacks slider clips black point', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Verify default state
      let state = await getColorState(page);
      expect(state.blacks).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply positive blacks to raise black point
      const blacksSlider = await getSliderByLabel(page, 'Blacks');
      await blacksSlider.fill('50');
      await blacksSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.blacks).toBe(50);

      // Canvas should have changed (black point raised, darker overall)
      const raisedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, raisedScreenshot)).toBe(true);

      // Apply negative blacks to extend black point
      await blacksSlider.fill('-50');
      await blacksSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.blacks).toBe(-50);

      const extendedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(raisedScreenshot, extendedScreenshot)).toBe(true);
    });
  });

  test.describe('Color Preservation', () => {
    test('HL-005: recovery preserves color hue', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply both highlight recovery and shadow lift
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.fill('-30');
      await highlightsSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const shadowsSlider = await getSliderByLabel(page, 'Shadows');
      await shadowsSlider.fill('30');
      await shadowsSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      // Verify both states
      const state = await getColorState(page);
      expect(state.highlights).toBe(-30);
      expect(state.shadows).toBe(30);

      // Canvas should be different but colors should be preserved
      // (we can only verify visual change, not hue preservation programmatically)
      const adjustedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
    });
  });

  test.describe('Scope Integration', () => {
    test('HL-007: scopes reflect highlight/shadow changes', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Enable histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      const initialHistogram = await captureViewerScreenshot(page);

      // Apply highlight recovery
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.fill('-70');
      await highlightsSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Histogram should have updated (shows different distribution)
      const afterHighlightsHistogram = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialHistogram, afterHighlightsHistogram)).toBe(true);

      // Apply shadow lift
      const shadowsSlider = await getSliderByLabel(page, 'Shadows');
      await shadowsSlider.fill('70');
      await shadowsSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Histogram should have updated again
      const afterShadowsHistogram = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(afterHighlightsHistogram, afterShadowsHistogram)).toBe(true);
    });
  });

  test.describe('Edge Cases', () => {
    test('HL-010: double-click sliders reset to default', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Set highlights
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.fill('-50');
      await highlightsSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.highlights).toBe(-50);

      // Double-click to reset
      await highlightsSlider.dblclick();
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.highlights).toBe(0);
    });

    test('HL-011: highlight/shadow adjustments persist across frame changes', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Set highlights and shadows
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.evaluate((el, val) => {
        const input = el as HTMLInputElement;
        input.value = String(val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, -40);

      const shadowsSlider = await getSliderByLabel(page, 'Shadows');
      await shadowsSlider.evaluate((el, val) => {
        const input = el as HTMLInputElement;
        input.value = String(val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, 40);
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getColorState?.();
          return !!state && state.highlights === -40 && state.shadows === 40;
        },
        undefined,
        { timeout: 5000 },
      );

      let state = await getColorState(page);
      expect(state.highlights).toBe(-40);
      expect(state.shadows).toBe(40);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Settings should persist
      state = await getColorState(page);
      expect(state.highlights).toBe(-40);
      expect(state.shadows).toBe(40);
    });

    test('HL-012: reset button clears all highlight/shadow adjustments', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Set all four sliders
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.fill('-50');
      await highlightsSlider.dispatchEvent('input');

      const shadowsSlider = await getSliderByLabel(page, 'Shadows');
      await shadowsSlider.fill('50');
      await shadowsSlider.dispatchEvent('input');

      const whitesSlider = await getSliderByLabel(page, 'Whites');
      await whitesSlider.fill('30');
      await whitesSlider.dispatchEvent('input');

      const blacksSlider = await getSliderByLabel(page, 'Blacks');
      await blacksSlider.fill('20');
      await blacksSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.highlights).toBe(-50);
      expect(state.shadows).toBe(50);
      expect(state.whites).toBe(30);
      expect(state.blacks).toBe(20);

      // Click reset button
      const resetButton = page.locator('.color-controls-panel button:has-text("Reset")');
      await resetButton.click();
      await page.waitForTimeout(200);

      // All should be reset
      state = await getColorState(page);
      expect(state.highlights).toBe(0);
      expect(state.shadows).toBe(0);
      expect(state.whites).toBe(0);
      expect(state.blacks).toBe(0);
    });

    test('HL-013: combined highlight/shadow with whites/blacks', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply whites and blacks first (affects clipping points)
      const whitesSlider = await getSliderByLabel(page, 'Whites');
      await whitesSlider.fill('20');
      await whitesSlider.dispatchEvent('input');

      const blacksSlider = await getSliderByLabel(page, 'Blacks');
      await blacksSlider.fill('20');
      await blacksSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const afterClippingScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterClippingScreenshot)).toBe(true);

      // Then apply highlights and shadows (affects tone mapping)
      const highlightsSlider = await getSliderByLabel(page, 'Highlights');
      await highlightsSlider.fill('-30');
      await highlightsSlider.dispatchEvent('input');

      const shadowsSlider = await getSliderByLabel(page, 'Shadows');
      await shadowsSlider.fill('30');
      await shadowsSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      // Verify all states
      const state = await getColorState(page);
      expect(state.whites).toBe(20);
      expect(state.blacks).toBe(20);
      expect(state.highlights).toBe(-30);
      expect(state.shadows).toBe(30);

      const combinedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(afterClippingScreenshot, combinedScreenshot)).toBe(true);
    });
  });
});
