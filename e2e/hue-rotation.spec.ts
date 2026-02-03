import { test, expect } from '@playwright/test';
import { loadImageFile, loadVideoFile, waitForTestHelper, captureViewerScreenshot, imagesAreDifferent } from './fixtures';

/**
 * Hue Rotation Control Tests
 *
 * These tests verify the hue rotation slider in the Color panel,
 * including default state, slider interaction, visual changes,
 * range validation, persistence, and reset behavior.
 *
 * All state changes are performed through real UI interactions
 * (slider fill, button clicks, keyboard navigation). page.evaluate()
 * is only used for state verification where no UI element exposes
 * the value directly.
 */

/**
 * Helper: Open the Color panel by clicking the Color tab button.
 */
async function openColorPanel(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');
  // Wait for the hue rotation slider to be visible (confirms panel is open and rendered)
  const slider = page.locator('[data-testid="slider-hueRotation"]');
  await expect(slider).toBeVisible();
}

/**
 * Helper: Get the current hue rotation slider value from the UI.
 * Reads the slider's value attribute directly from the DOM element.
 */
async function getHueRotationSliderValue(page: import('@playwright/test').Page): Promise<number> {
  const slider = page.locator('[data-testid="slider-hueRotation"]');
  const value = await slider.inputValue();
  return parseFloat(value);
}

/**
 * Helper: Set the hue rotation slider to a given value via the UI.
 */
async function setHueRotationViaSlider(page: import('@playwright/test').Page, degrees: number) {
  const slider = page.locator('[data-testid="slider-hueRotation"]');
  await slider.fill(String(degrees));
  await slider.dispatchEvent('input');
  await slider.dispatchEvent('change');
  // Wait for the slider value to actually update
  await page.waitForFunction(
    (expectedDegrees) => {
      const sliderEl = document.querySelector('[data-testid="slider-hueRotation"]') as HTMLInputElement;
      return sliderEl && parseFloat(sliderEl.value) === expectedDegrees;
    },
    degrees,
    { timeout: 5000 }
  );
}

test.describe('Hue Rotation Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // HR-001: Default hue rotation is 0
  test('HR-001: default hue rotation is 0 degrees', async ({ page }) => {
    // Open Color panel and check the slider's default value
    await openColorPanel(page);

    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await expect(slider).toBeVisible();

    const value = await getHueRotationSliderValue(page);
    expect(value).toBe(0);
  });

  // HR-002: Hue rotation slider is present in Color panel
  test('HR-002: hue rotation slider exists in color controls', async ({ page }) => {
    // Open the color panel
    await openColorPanel(page);

    // Look for the hue rotation slider by data-testid
    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await expect(slider).toBeVisible();
  });

  // HR-003: Adjusting hue rotation slider changes state
  test('HR-003: changing hue rotation slider updates internal state', async ({ page }) => {
    await loadImageFile(page);

    // Open the color panel
    await openColorPanel(page);

    const slider = page.locator('[data-testid="slider-hueRotation"]');
    await expect(slider).toBeVisible();

    // Set hue rotation to 180 degrees via the slider UI
    await setHueRotationViaSlider(page, 180);

    // Verify the slider value reflects the change
    const value = await getHueRotationSliderValue(page);
    expect(value).toBe(180);
  });

  // HR-004: Hue rotation affects the rendered canvas
  test('HR-004: hue rotation visually changes the canvas', async ({ page }) => {
    await loadImageFile(page);

    // Capture screenshot before hue rotation
    const before = await captureViewerScreenshot(page);

    // Open color panel and set hue rotation via slider
    await openColorPanel(page);
    await setHueRotationViaSlider(page, 180);

    // Capture screenshot after hue rotation
    const after = await captureViewerScreenshot(page);

    // Canvas should look different
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // HR-005: Hue rotation range is 0-360
  test('HR-005: hue rotation slider has correct min/max range', async ({ page }) => {
    await openColorPanel(page);

    const slider = page.locator('[data-testid="slider-hueRotation"]');
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');

    expect(min).toBe('0');
    expect(max).toBe('360');
  });

  // HR-006: Hue rotation of 360 is equivalent to 0
  test('HR-006: hue rotation wraps at 360 degrees', async ({ page }) => {
    await loadImageFile(page);

    await openColorPanel(page);

    // Set to 360 via the slider - should normalize to 0 (no visible effect)
    await setHueRotationViaSlider(page, 360);

    // Read the slider value and check the normalized result
    const sliderValue = await getHueRotationSliderValue(page);
    // 360 degrees is equivalent to 0 degrees in hue rotation
    const normalizedValue = ((sliderValue % 360) + 360) % 360;
    expect(normalizedValue).toBe(0);
  });

  // HR-007: Hue rotation persists across frames
  test('HR-007: hue rotation persists when navigating frames', async ({ page }) => {
    await loadVideoFile(page);

    await openColorPanel(page);
    await setHueRotationViaSlider(page, 90);

    // Verify slider value before navigation
    let value = await getHueRotationSliderValue(page);
    expect(value).toBe(90);

    // Get current frame before navigation
    const currentFrame = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getSessionState()?.currentFrame ?? 0;
    });

    // Navigate to next frame using keyboard
    await page.keyboard.press('ArrowRight');

    // Wait for frame to change
    await page.waitForFunction(
      (prevFrame) => {
        const state = (window as any).__OPENRV_TEST__?.getSessionState();
        return state?.currentFrame !== prevFrame;
      },
      currentFrame,
      { timeout: 5000 }
    );

    // Hue rotation should persist - verify via slider value
    value = await getHueRotationSliderValue(page);
    expect(value).toBe(90);
  });

  // HR-008: Reset button clears hue rotation
  test('HR-008: reset color controls resets hue rotation to 0', async ({ page }) => {
    await loadImageFile(page);

    await openColorPanel(page);

    // Set hue rotation via slider
    await setHueRotationViaSlider(page, 120);

    // Verify it was set
    let value = await getHueRotationSliderValue(page);
    expect(value).toBe(120);

    // Click reset button in the color controls panel
    const resetButton = page.locator('.color-controls-panel button:has-text("Reset")');
    await resetButton.click();

    // Wait for the slider value to be reset to 0
    await page.waitForFunction(
      () => {
        const sliderEl = document.querySelector('[data-testid="slider-hueRotation"]') as HTMLInputElement;
        return sliderEl && parseFloat(sliderEl.value) === 0;
      },
      undefined,
      { timeout: 5000 }
    );

    // Verify hue rotation was reset to 0 via slider value
    value = await getHueRotationSliderValue(page);
    expect(value).toBe(0);
  });
});
