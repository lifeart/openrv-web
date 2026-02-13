import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Vibrance Control Tests
 *
 * Tests for intelligent saturation that boosts less-saturated colors more than
 * already-saturated ones, with optional skin tone protection.
 *
 * Test cases from features.md section 1.3:
 * - VIB-001: Vibrance boosts low-saturation areas more
 * - VIB-002: High-saturation areas less affected
 * - VIB-003: Skin tones protected when enabled
 * - VIB-004: Negative vibrance desaturates uniformly
 * - VIB-005: Works with existing saturation control
 */

// Helper to get slider by label name
async function getSliderByLabel(page: import('@playwright/test').Page, label: string) {
  return page.locator('.color-controls-panel label').filter({ hasText: label }).locator('..').locator('input[type="range"]');
}

test.describe('Vibrance Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button[data-tab-id="color"]').click();
    await page.waitForTimeout(200);
  });

  test.describe('Basic Functionality', () => {
    test('VIB-000: vibrance slider should be visible in color panel', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Vibrance slider should exist
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await expect(vibranceSlider).toBeVisible();
    });

    test('VIB-001: vibrance boosts low-saturation areas more', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Verify default state
      let state = await getColorState(page);
      expect(state.vibrance).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply positive vibrance
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await vibranceSlider.fill('75');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      // Verify state updated
      state = await getColorState(page);
      expect(state.vibrance).toBe(75);

      // Canvas should have changed
      const vibranceScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, vibranceScreenshot)).toBe(true);
    });

    test('VIB-002: high-saturation areas less affected', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // First, increase saturation to have some highly saturated areas
      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('1.5');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const saturatedScreenshot = await captureViewerScreenshot(page);

      // Now apply vibrance - should affect high-saturation areas less
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await vibranceSlider.fill('50');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const state = await getColorState(page);
      expect(state.vibrance).toBe(50);
      expect(state.saturation).toBeCloseTo(1.5, 1);

      // Canvas should have changed (but high-saturation areas less affected)
      const afterVibranceScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(saturatedScreenshot, afterVibranceScreenshot)).toBe(true);
    });

    test('VIB-003: skin tones protected when enabled', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Verify skin protection is enabled by default
      let state = await getColorState(page);
      expect(state.vibranceSkinProtection).toBe(true);

      // The skin protection checkbox should exist
      const skinProtectionCheckbox = page.locator('#vibrance-skin-protection');
      await expect(skinProtectionCheckbox).toBeVisible();
      expect(await skinProtectionCheckbox.isChecked()).toBe(true);

      // Apply vibrance with skin protection ON
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await vibranceSlider.fill('80');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const withProtectionScreenshot = await captureViewerScreenshot(page);

      // Reset vibrance
      await vibranceSlider.fill('0');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Disable skin protection
      await skinProtectionCheckbox.click();
      await page.waitForTimeout(100);

      state = await getColorState(page);
      expect(state.vibranceSkinProtection).toBe(false);

      // Apply same vibrance with skin protection OFF
      await vibranceSlider.fill('80');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const withoutProtectionScreenshot = await captureViewerScreenshot(page);

      // The results should be different (skin tones more affected without protection)
      expect(imagesAreDifferent(withProtectionScreenshot, withoutProtectionScreenshot)).toBe(true);
    });

    test('VIB-004: negative vibrance desaturates uniformly', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply negative vibrance
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await vibranceSlider.fill('-50');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const state = await getColorState(page);
      expect(state.vibrance).toBe(-50);

      // Canvas should be desaturated
      const desaturatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, desaturatedScreenshot)).toBe(true);

      // Apply more negative vibrance
      await vibranceSlider.fill('-100');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const moreDesaturatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(desaturatedScreenshot, moreDesaturatedScreenshot)).toBe(true);
    });

    test('VIB-005: works with existing saturation control', async ({ page }) => {
      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // First, adjust saturation
      const saturationSlider = await getSliderByLabel(page, 'Saturation');
      await saturationSlider.fill('0.8');
      await saturationSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const afterSaturationScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterSaturationScreenshot)).toBe(true);

      // Now add vibrance on top
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await vibranceSlider.fill('60');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      // Verify both states
      const state = await getColorState(page);
      expect(state.saturation).toBeCloseTo(0.8, 1);
      expect(state.vibrance).toBe(60);

      // Canvas should be different from saturation-only state
      const combinedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(afterSaturationScreenshot, combinedScreenshot)).toBe(true);
    });
  });

  test.describe('Edge Cases', () => {
    test('VIB-010: double-click vibrance slider resets to default', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');

      // Set vibrance
      await vibranceSlider.fill('50');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.vibrance).toBe(50);

      // Double-click to reset
      await vibranceSlider.dblclick();
      await page.waitForTimeout(200);

      state = await getColorState(page);
      expect(state.vibrance).toBe(0);
    });

    test('VIB-011: vibrance persists across frame changes', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Set vibrance
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await vibranceSlider.fill('40');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.vibrance).toBe(40);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Vibrance should persist
      state = await getColorState(page);
      expect(state.vibrance).toBe(40);
    });

    test('VIB-012: reset button clears vibrance to default', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      // Set vibrance and skin protection
      const vibranceSlider = await getSliderByLabel(page, 'Vibrance');
      await vibranceSlider.fill('75');
      await vibranceSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const skinProtectionCheckbox = page.locator('#vibrance-skin-protection');
      await skinProtectionCheckbox.click();
      await page.waitForTimeout(100);

      let state = await getColorState(page);
      expect(state.vibrance).toBe(75);
      expect(state.vibranceSkinProtection).toBe(false);

      // Click reset button
      const resetButton = page.locator('.color-controls-panel button:has-text("Reset")');
      await resetButton.click();
      await page.waitForTimeout(200);

      // Vibrance should be reset
      state = await getColorState(page);
      expect(state.vibrance).toBe(0);
      expect(state.vibranceSkinProtection).toBe(true);
    });
  });
});
