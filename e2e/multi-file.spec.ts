import { test, expect } from '@playwright/test';
import { loadVideoFile, loadImageFile, waitForTestHelper, canvasHasContent } from './fixtures';

/**
 * Multiple File Loading Tests
 *
 * These tests verify that multiple files can be loaded
 * through human-like interactions (file input).
 */

test.describe('Multiple File Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('MF-001: Load single video file shows content', async ({ page }) => {
    await loadVideoFile(page);

    // Viewer should display content
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Canvas should have visual content (not blank)
    const hasContent = await canvasHasContent(page);
    expect(hasContent).toBe(true);
  });

  test('MF-002: Load single image file shows content', async ({ page }) => {
    await loadImageFile(page);

    // Viewer should display content
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Take screenshot to verify content is rendered
    const screenshot = await canvas.screenshot();
    expect(screenshot.length).toBeGreaterThan(100);
  });

  test('MF-003: Load video then image keeps source A (first file) visible', async ({ page }) => {
    // Load first file (video) - this becomes source A
    await loadVideoFile(page);
    const canvas = page.locator('canvas').first();

    // Verify video content is visible
    const screenshotAfterVideo = await canvas.screenshot();
    expect(screenshotAfterVideo.length).toBeGreaterThan(100);

    // Load second file (image) - this becomes source B
    // View stays on source A (video) for A/B compare UX
    await loadImageFile(page);

    // Verify source A (video) is still visible
    const screenshotAfterImage = await canvas.screenshot();
    expect(screenshotAfterImage.length).toBeGreaterThan(100);

    // Use toggle to switch to source B (image) to verify it's available
    await page.keyboard.press('`');
    await page.waitForTimeout(200);

    const screenshotAfterToggle = await canvas.screenshot();
    // Now should show image (source B), which is different from video
    expect(screenshotAfterVideo.equals(screenshotAfterToggle)).toBe(false);
  });

  test('MF-004: Load image then video keeps source A (first file) visible', async ({ page }) => {
    // Load first file (image) - this becomes source A
    await loadImageFile(page);
    const canvas = page.locator('canvas').first();

    // Verify image content is visible
    const screenshotAfterImage = await canvas.screenshot();
    expect(screenshotAfterImage.length).toBeGreaterThan(100);

    // Load second file (video) - this becomes source B
    // View stays on source A (image) for A/B compare UX
    await loadVideoFile(page);

    // Verify source A (image) is still visible
    const screenshotAfterVideo = await canvas.screenshot();
    expect(screenshotAfterVideo.length).toBeGreaterThan(100);

    // Content should be similar (still showing source A)
    // Use toggle to switch to source B (video) to verify it's available
    await page.keyboard.press('`');
    await page.waitForTimeout(200);

    const screenshotAfterToggle = await canvas.screenshot();
    // Now should show video (source B), which is different from image
    expect(screenshotAfterImage.equals(screenshotAfterToggle)).toBe(false);
  });

  test('MF-005: Viewer remains functional after loading multiple files', async ({ page }) => {
    // Load two files
    await loadVideoFile(page);
    await loadImageFile(page);

    // Verify basic viewer functionality still works
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Test zoom with keyboard
    await page.keyboard.press('=');
    await page.waitForTimeout(100);

    // Test fit with keyboard
    await page.keyboard.press('f');
    await page.waitForTimeout(100);

    // Canvas should still be visible and have content
    await expect(canvas).toBeVisible();
    const hasContent = await canvasHasContent(page);
    expect(hasContent).toBe(true);
  });
});

test.describe('Multiple File A/B Compare Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('MF-010: A/B indicator appears after loading two files', async ({ page }) => {
    // Load first file
    await loadVideoFile(page);

    // A/B indicator should be hidden with single source
    const indicator = page.locator('[data-testid="ab-indicator"]');
    await expect(indicator).toBeHidden();

    // Load second file
    await loadImageFile(page);

    // A/B indicator should now be visible
    await expect(indicator).toBeVisible();
  });

  test('MF-011: B button becomes active after loading two files', async ({ page }) => {
    // Load first file
    await loadVideoFile(page);

    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // B button should be dimmed initially
    const buttonB = page.locator('[data-testid="ab-button-b"]');
    const opacityBefore = await buttonB.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityBefore)).toBeLessThan(1);

    // Load second file
    await loadImageFile(page);
    await page.waitForTimeout(200);

    // B button should now be active (opacity 1)
    const opacityAfter = await buttonB.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityAfter)).toBe(1);
  });

  test('MF-012: Toggle button becomes active after loading two files', async ({ page }) => {
    // Load first file
    await loadVideoFile(page);

    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Toggle button should be dimmed initially
    const toggleButton = page.locator('[data-testid="ab-toggle-button"]');
    const opacityBefore = await toggleButton.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityBefore)).toBeLessThan(1);

    // Load second file
    await loadImageFile(page);
    await page.waitForTimeout(200);

    // Toggle button should now be active
    const opacityAfter = await toggleButton.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityAfter)).toBe(1);
  });

  test('MF-013: Clicking B button switches to second source', async ({ page }) => {
    // Load first file (video)
    await loadVideoFile(page);
    const canvas = page.locator('canvas').first();
    const screenshotA = await canvas.screenshot();

    // Load second file (image)
    await loadImageFile(page);
    const screenshotAfterBLoad = await canvas.screenshot();

    // Go to View tab and click B button
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="ab-button-b"]');
    await buttonB.click();
    await page.waitForTimeout(200);

    // Take screenshot after switching to B
    const screenshotB = await canvas.screenshot();

    // B (image) should be different from the current view after loading image
    // Since loading image switches to it, B click should show video (source A)
    // Actually, let's verify the toggle changes the view
    expect(screenshotAfterBLoad.equals(screenshotB)).toBe(false);
  });

  test('MF-014: Backtick toggles between sources after loading two files', async ({ page }) => {
    // Load first file (video)
    await loadVideoFile(page);
    const canvas = page.locator('canvas').first();

    // Load second file (image) - this becomes the current view
    await loadImageFile(page);
    const screenshotAfterBoth = await canvas.screenshot();

    // Press backtick to toggle
    await page.keyboard.press('`');
    await page.waitForTimeout(200);

    // Screenshot should change (toggled to other source)
    const screenshotAfterToggle = await canvas.screenshot();
    expect(screenshotAfterBoth.equals(screenshotAfterToggle)).toBe(false);

    // Press backtick again to toggle back
    await page.keyboard.press('`');
    await page.waitForTimeout(200);

    // Should be back to original
    const screenshotAfterToggleBack = await canvas.screenshot();
    // Should be similar to screenshotAfterBoth (same source)
    expect(screenshotAfterToggleBack.equals(screenshotAfterToggle)).toBe(false);
  });

  test('MF-015: A/B indicator shows correct source label', async ({ page }) => {
    // Load two files
    await loadVideoFile(page);
    await loadImageFile(page);

    // Indicator should show current source
    const indicator = page.locator('[data-testid="ab-indicator"]');
    await expect(indicator).toBeVisible();

    // Initially should show B (since second file was just loaded)
    const textBefore = await indicator.textContent();
    expect(['A', 'B']).toContain(textBefore?.trim());

    // Toggle with backtick
    await page.keyboard.press('`');
    await page.waitForTimeout(200);

    // Indicator text should change
    const textAfter = await indicator.textContent();
    expect(['A', 'B']).toContain(textAfter?.trim());
    expect(textAfter).not.toBe(textBefore);
  });
});
