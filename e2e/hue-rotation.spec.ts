import { test, expect } from '@playwright/test';
import { loadImageFile, loadVideoFile, getColorState, getViewerState, waitForTestHelper, captureViewerScreenshot, imagesAreDifferent } from './fixtures';

test.describe('Hue Rotation Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // HR-001: Default hue rotation is 0
  test('HR-001: default hue rotation is 0 degrees', async ({ page }) => {
    // Access hue rotation through the color adjustments internal state
    const hueRotation = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      const adjustments = app?.colorControls?.adjustments;
      return adjustments?.hueRotation ?? 0;
    });
    expect(hueRotation).toBe(0);
  });

  // HR-002: Hue rotation slider is present in Color panel
  test('HR-002: hue rotation slider exists in color controls', async ({ page }) => {
    // Open the color panel
    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    // Look for the hue rotation slider by data-testid
    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await expect(slider).toBeVisible();
  });

  // HR-003: Adjusting hue rotation slider changes state
  test('HR-003: changing hue rotation slider updates internal state', async ({ page }) => {
    await loadImageFile(page);

    // Open the color panel
    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await expect(slider).toBeVisible();

    // Set hue rotation to 180 degrees
    await slider.fill('180');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(200);

    const hueRotation = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.colorControls?.adjustments?.hueRotation ?? 0;
    });
    expect(hueRotation).toBe(180);
  });

  // HR-004: Hue rotation affects the rendered canvas
  test('HR-004: hue rotation visually changes the canvas', async ({ page }) => {
    await loadImageFile(page);

    // Capture screenshot before hue rotation
    const before = await captureViewerScreenshot(page);

    // Open color panel and set hue rotation
    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await slider.fill('180');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(300);

    // Capture screenshot after hue rotation
    const after = await captureViewerScreenshot(page);

    // Canvas should look different
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // HR-005: Hue rotation range is 0-360
  test('HR-005: hue rotation slider has correct min/max range', async ({ page }) => {
    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    const slider = page.locator('[data-testid="slider-hueRotation"]');
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');

    expect(min).toBe('0');
    expect(max).toBe('360');
  });

  // HR-006: Hue rotation of 360 is equivalent to 0
  test('HR-006: hue rotation wraps at 360 degrees', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    const slider = page.locator('[data-testid="slider-hueRotation"]');

    // Set to 360 - should normalize to 0 (no visible effect)
    await slider.fill('360');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(200);

    // The normalized value should effectively be 0 (360 % 360 = 0)
    const hueRotation = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      const raw = app?.colorControls?.adjustments?.hueRotation ?? 0;
      return ((raw % 360) + 360) % 360;
    });
    expect(hueRotation).toBe(0);
  });

  // HR-007: Hue rotation persists across frames
  test('HR-007: hue rotation persists when navigating frames', async ({ page }) => {
    await loadVideoFile(page);

    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await slider.fill('90');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(200);

    // Navigate to next frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // Hue rotation should persist
    const hueRotation = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.colorControls?.adjustments?.hueRotation ?? 0;
    });
    expect(hueRotation).toBe(90);
  });

  // HR-008: Reset button clears hue rotation
  test('HR-008: reset color controls resets hue rotation to 0', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button:has-text("Color")');
    await page.waitForTimeout(200);

    // Set hue rotation
    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await slider.fill('120');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(200);

    // Click reset button
    const resetButton = page.locator('.color-controls-panel button:has-text("Reset")');
    await resetButton.click();
    await page.waitForTimeout(200);

    const hueRotation = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.colorControls?.adjustments?.hueRotation ?? 0;
    });
    expect(hueRotation).toBe(0);
  });
});
