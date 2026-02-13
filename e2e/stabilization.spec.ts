import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Stabilization Control E2E Tests
 *
 * Verifies the stabilization control UI in the Effects tab.
 */

test.describe('Stabilization Control E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.locator('button[data-tab-id="effects"]').click({ force: true });
    await page.waitForTimeout(200);
  });

  test('STAB-E001: control button visible in Effects tab', async ({ page }) => {
    const button = page.locator('[data-testid="stabilization-control-button"]');
    await expect(button).toBeVisible();
  });

  test('STAB-E002: click button opens and closes panel', async ({ page }) => {
    const button = page.locator('[data-testid="stabilization-control-button"]');

    // Open panel
    await button.click();
    await page.waitForTimeout(200);
    const panel = page.locator('[data-testid="stabilization-panel"]');
    await expect(panel).toBeVisible();

    // Close panel
    await button.click();
    await page.waitForTimeout(200);
    await expect(panel).not.toBeVisible();
  });

  test('STAB-E003: enable with non-zero crop changes canvas', async ({ page }) => {
    const button = page.locator('[data-testid="stabilization-control-button"]');
    await button.click();
    await page.waitForTimeout(200);

    const initialScreenshot = await captureViewerScreenshot(page);

    // Enable stabilization
    const checkbox = page.locator('[data-testid="stabilization-enabled-checkbox"]');
    await checkbox.check();
    await page.waitForTimeout(500);

    // Verify canvas changed (crop border appears)
    const afterScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, afterScreenshot)).toBe(true);
  });

  test('STAB-E004: reset restores defaults and undoes canvas change', async ({ page }) => {
    // Open panel and enable
    const button = page.locator('[data-testid="stabilization-control-button"]');
    await button.click();
    await page.waitForTimeout(200);

    const checkbox = page.locator('[data-testid="stabilization-enabled-checkbox"]');
    await checkbox.check();
    await page.waitForTimeout(500);

    // Take screenshot with effect active
    const activeScreenshot = await captureViewerScreenshot(page);

    // Reset
    const resetBtn = page.locator('[data-testid="stabilization-reset-button"]');
    await resetBtn.click();
    await page.waitForTimeout(500);

    // Verify checkbox unchecked (defaults restored)
    await expect(checkbox).not.toBeChecked();

    // Verify canvas changed from the active state (effect was removed)
    const afterResetScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(activeScreenshot, afterResetScreenshot)).toBe(true);
  });

  test('STAB-E005: slider interaction updates crop', async ({ page }) => {
    const button = page.locator('[data-testid="stabilization-control-button"]');
    await button.click();
    await page.waitForTimeout(200);

    // Enable first
    const checkbox = page.locator('[data-testid="stabilization-enabled-checkbox"]');
    await checkbox.check();
    await page.waitForTimeout(300);

    const beforeSlider = await captureViewerScreenshot(page);

    // Increase crop amount
    const cropSlider = page.locator('[data-testid="stabilization-crop-slider"]');
    await cropSlider.fill('48');
    await cropSlider.dispatchEvent('input');
    await page.waitForTimeout(500);

    const afterSlider = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(beforeSlider, afterSlider)).toBe(true);
  });
});
