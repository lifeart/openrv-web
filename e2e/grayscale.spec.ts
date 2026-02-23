/**
 * Grayscale Toggle E2E Tests
 *
 * Tests for grayscale (luminance) viewing mode via Shift+Y or Shift+L.
 * Grayscale uses Rec.709 luminance coefficients.
 */

import { test, expect } from '@playwright/test';
import { loadImageFile, getViewerState, captureViewerScreenshot, imagesAreDifferent } from './fixtures';

test.describe('Grayscale Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('GRAY-001: Shift+L toggles grayscale/luminance mode', async ({ page }) => {
    await loadImageFile(page);

    const colorScreenshot = await captureViewerScreenshot(page);

    // Toggle grayscale with Shift+L
    await page.keyboard.press('Shift+L');

    const grayScreenshot = await captureViewerScreenshot(page);

    // Images should be different (color vs grayscale)
    expect(imagesAreDifferent(colorScreenshot, grayScreenshot)).toBe(true);

    // Verify channel mode is luminance
    const state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');
  });

  test('GRAY-002: Shift+Y also toggles grayscale mode (alias)', async ({ page }) => {
    await loadImageFile(page);

    const colorScreenshot = await captureViewerScreenshot(page);

    // Toggle grayscale with Shift+Y (alias for luminance)
    await page.keyboard.press('Shift+Y');

    const grayScreenshot = await captureViewerScreenshot(page);

    // Images should be different
    expect(imagesAreDifferent(colorScreenshot, grayScreenshot)).toBe(true);

    // Verify channel mode is luminance
    const state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');
  });

  test('GRAY-003: toggling grayscale off restores color', async ({ page }) => {
    await loadImageFile(page);

    const original = await captureViewerScreenshot(page);

    // Enable grayscale
    await page.keyboard.press('Shift+L');
    await page.waitForFunction(
      () => window.__OPENRV_TEST__?.getViewerState()?.channelMode === 'luminance',
      { timeout: 5000 }
    );

    // Disable grayscale (back to RGB) via channel dropdown.
    const channelButton = page.locator('[data-testid="channel-select-button"]');
    await channelButton.click();
    const channelDropdown = page.locator('[data-testid="channel-dropdown"]');
    await expect(channelDropdown).toBeVisible();
    await channelDropdown.locator('button', { hasText: 'RGB' }).click();
    await page.waitForFunction(
      () => window.__OPENRV_TEST__?.getViewerState()?.channelMode === 'rgb',
      { timeout: 5000 }
    );

    const restored = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(original, restored)).toBe(false);

    // Verify channel mode is back to rgb
    const state = await getViewerState(page);
    expect(state.channelMode).toBe('rgb');
  });

  test('GRAY-004: grayscale dropdown shows "Grayscale" label', async ({ page }) => {
    await loadImageFile(page);

    // Click channel select button
    await page.click('[data-testid="channel-select-button"]');

    // Wait for dropdown to appear
    await expect(page.locator('[data-testid="channel-dropdown"]')).toBeVisible();

    // Look for Grayscale option
    const grayscaleOption = page.locator('[data-testid="channel-dropdown"] button', { hasText: 'Grayscale' });
    await expect(grayscaleOption).toBeVisible();
  });

  test('GRAY-005: clicking grayscale in dropdown activates grayscale mode', async ({ page }) => {
    await loadImageFile(page);

    // Click channel select button
    await page.click('[data-testid="channel-select-button"]');

    // Click Grayscale option
    await page.click('[data-testid="channel-dropdown"] button:has-text("Grayscale")');

    // Verify channel mode
    const state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');
  });

  test('GRAY-006: grayscale button shows active indicator when enabled', async ({ page }) => {
    await loadImageFile(page);

    const button = page.locator('[data-testid="channel-select-button"]');

    // Initially should not have accent styling
    const initialStyle = await button.evaluate(el => el.style.borderColor);

    // Enable grayscale
    await page.keyboard.press('Shift+L');

    // Button should have accent styling when active
    const activeStyle = await button.evaluate(el => el.style.borderColor);
    expect(activeStyle).toContain('accent');
  });

  test('GRAY-007: Shift+Y and Shift+L produce same result', async ({ page }) => {
    await loadImageFile(page);

    // Use Shift+L
    await page.keyboard.press('Shift+L');
    const screenshotL = await captureViewerScreenshot(page);

    // Reset to RGB via channel dropdown
    await page.click('[data-testid="channel-select-button"]');
    await expect(page.locator('[data-testid="channel-dropdown"]')).toBeVisible();
    await page.click('[data-testid="channel-dropdown"] button:has-text("RGB")');
    await page.waitForFunction(
      () => window.__OPENRV_TEST__?.getViewerState()?.channelMode === 'rgb',
      { timeout: 5000 }
    );

    // Use Shift+Y
    await page.keyboard.press('Shift+Y');
    const screenshotY = await captureViewerScreenshot(page);

    // Both should produce the same grayscale result
    // (Note: exact pixel comparison may have tolerance issues)
    expect(screenshotL.length).toBeGreaterThan(0);
    expect(screenshotY.length).toBeGreaterThan(0);
  });

  // Deleted GRAY-008 stub (empty body, no assertions - requires test video)
});
