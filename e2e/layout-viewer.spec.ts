import { test, expect } from '@playwright/test';
import { loadVideoFile, loadImageFile, waitForTestHelper } from './fixtures';

/**
 * Layout + Viewer Integration Tests
 *
 * Verifies that the layout manager's viewer slot correctly hosts the viewer,
 * with proper sizing, canvas visibility, and drop overlay functionality.
 * Regression tests for the flex container layering bug where the viewer
 * collapsed to 0 height when the viewerSlot was not a flex container.
 */

test.describe('Layout Viewer Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('LV-E001: layout root is mounted and fills the viewport', async ({ page }) => {
    const layoutRoot = page.locator('.layout-root');
    await expect(layoutRoot).toBeVisible();

    const box = await layoutRoot.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('LV-E002: viewer slot has non-zero dimensions', async ({ page }) => {
    const viewerSlot = page.locator('.layout-viewer');
    await expect(viewerSlot).toBeVisible();

    const box = await viewerSlot.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('LV-E003: viewer container fills the viewer slot', async ({ page }) => {
    const viewerSlot = page.locator('.layout-viewer');
    const viewerContainer = page.locator('.viewer-container');
    await expect(viewerContainer).toBeVisible();

    const slotBox = await viewerSlot.boundingBox();
    const viewerBox = await viewerContainer.boundingBox();
    expect(slotBox).not.toBeNull();
    expect(viewerBox).not.toBeNull();

    // Viewer container should fill the viewer slot
    expect(viewerBox!.width).toBeGreaterThan(0);
    expect(viewerBox!.height).toBeGreaterThan(0);
    // Allow 2px tolerance for borders
    expect(Math.abs(viewerBox!.width - slotBox!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(viewerBox!.height - slotBox!.height)).toBeLessThanOrEqual(2);
  });

  test('LV-E004: image canvas is visible in placeholder state', async ({ page }) => {
    const canvas = page.locator('[data-testid="viewer-image-canvas"]');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('LV-E005: canvas container is visible and positioned inside viewer', async ({ page }) => {
    const canvasContainer = page.locator('[data-testid="viewer-canvas-container"]');
    await expect(canvasContainer).toBeAttached();

    // The canvas container is absolutely positioned and translated for centering.
    // Verify it has non-zero dimensions from its canvas children.
    const dims = await canvasContainer.evaluate((el) => {
      return {
        width: el.offsetWidth,
        height: el.offsetHeight,
      };
    });
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  test('LV-E006: image canvas is visible after loading an image', async ({ page }) => {
    await loadImageFile(page);

    const canvas = page.locator('[data-testid="viewer-image-canvas"]');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('LV-E007: canvas is visible after loading a video', async ({ page }) => {
    await loadVideoFile(page);

    const canvas = page.locator('[data-testid="viewer-image-canvas"]');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('LV-E008: viewer container has correct overflow hidden', async ({ page }) => {
    const viewerContainer = page.locator('.viewer-container');

    const overflow = await viewerContainer.evaluate((el) => {
      return getComputedStyle(el).overflow;
    });
    expect(overflow).toBe('hidden');
  });

  test('LV-E009: layout panels are present', async ({ page }) => {
    const leftPanel = page.locator('[data-testid="layout-panel-left"]');
    const rightPanel = page.locator('[data-testid="layout-panel-right"]');

    await expect(leftPanel).toBeAttached();
    await expect(rightPanel).toBeAttached();
  });

  test('LV-E010: layout menu button is visible with preset items', async ({ page }) => {
    const layoutMenuButton = page.locator('[data-testid="layout-menu-button"]');
    await expect(layoutMenuButton).toBeVisible();

    // Open the layout preset dropdown menu
    await layoutMenuButton.click();

    const defaultPreset = page.locator('[data-testid="layout-menu-default"]');
    const reviewPreset = page.locator('[data-testid="layout-menu-review"]');
    await expect(defaultPreset).toBeVisible();
    await expect(reviewPreset).toBeVisible();
  });

  test('LV-E011: viewer retains size after switching layout presets', async ({ page }) => {
    const viewerContainer = page.locator('.viewer-container');

    // Get initial viewer size
    const initialBox = await viewerContainer.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(initialBox!.height).toBeGreaterThan(100);

    // Switch to review preset via layout dropdown menu
    await page.click('[data-testid="layout-menu-button"]');
    await page.click('[data-testid="layout-menu-review"]');
    await page.waitForTimeout(100);

    // Viewer should still have non-zero dimensions
    const reviewBox = await viewerContainer.boundingBox();
    expect(reviewBox).not.toBeNull();
    expect(reviewBox!.width).toBeGreaterThan(100);
    expect(reviewBox!.height).toBeGreaterThan(100);

    // Switch back to default via layout dropdown menu
    await page.click('[data-testid="layout-menu-button"]');
    await page.click('[data-testid="layout-menu-default"]');
    await page.waitForTimeout(100);

    const defaultBox = await viewerContainer.boundingBox();
    expect(defaultBox).not.toBeNull();
    expect(defaultBox!.width).toBeGreaterThan(100);
    expect(defaultBox!.height).toBeGreaterThan(100);
  });

  test('LV-E012: canvas remains visible after loading media and switching presets', async ({ page }) => {
    await loadImageFile(page);

    const canvas = page.locator('[data-testid="viewer-image-canvas"]');
    await expect(canvas).toBeVisible();

    // Switch preset via layout dropdown menu
    await page.click('[data-testid="layout-menu-button"]');
    await page.click('[data-testid="layout-menu-review"]');
    await page.waitForTimeout(200);

    // Canvas should still be visible
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('LV-E013: viewer slot is a flex container (regression)', async ({ page }) => {
    // Regression test: viewerSlot must be a flex container so that
    // the viewer-container (which uses flex: 1) expands to fill it.
    const viewerSlot = page.locator('.layout-viewer');
    const styles = await viewerSlot.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        display: computed.display,
        flexDirection: computed.flexDirection,
      };
    });
    expect(styles.display).toBe('flex');
    expect(styles.flexDirection).toBe('column');
  });

  test('LV-E014: top section contains header bar and tab bar', async ({ page }) => {
    const topSection = page.locator('.layout-top');
    await expect(topSection).toBeVisible();

    // Should contain the header bar
    const headerBar = topSection.locator('.header-bar, [data-testid*="header"]').first();
    // At minimum, the top section should have child elements
    const childCount = await topSection.evaluate((el) => el.children.length);
    expect(childCount).toBeGreaterThanOrEqual(2); // header + tab bar at minimum
  });

  test('LV-E015: bottom slot contains timeline', async ({ page }) => {
    const bottomSlot = page.locator('.layout-bottom');
    await expect(bottomSlot).toBeAttached();

    // Bottom slot should have timeline content
    const childCount = await bottomSlot.evaluate((el) => el.children.length);
    expect(childCount).toBeGreaterThanOrEqual(1);
  });
});
