import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
} from './fixtures';

/**
 * Vectorscope Feature Tests
 *
 * These tests verify the vectorscope display functionality,
 * including visibility toggle, zoom control, and button controls.
 */

test.describe('Vectorscope Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('VS-E001: vectorscope is hidden by default', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(false);
  });

  test('VS-E002: pressing v toggles vectorscope visibility', async ({ page }) => {
    let state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(false);

    await page.keyboard.press('y');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);

    await page.keyboard.press('y');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(false);
  });

  test('VS-E003: vectorscope container is visible when shown', async ({ page }) => {
    await page.keyboard.press('y');
    await page.waitForTimeout(100);

    const vectorscope = page.locator('.vectorscope-container');
    await expect(vectorscope).toBeVisible();
  });

  test('VS-E004: vectorscope has canvas element', async ({ page }) => {
    await page.keyboard.press('y');
    await page.waitForTimeout(100);

    const canvas = page.locator('.vectorscope-container canvas');
    await expect(canvas).toBeVisible();
  });

  test('VS-E005: clicking Vectorscope button in QC tab toggles vectorscope', async ({ page }) => {
    // Go to QC tab
    await page.click('button[data-tab-id="qc"]');
    await page.waitForTimeout(100);

    // Open scopes dropdown then toggle the vectorscope option
    const scopesButton = page.locator('[data-testid="scopes-control-button"]');
    await expect(scopesButton).toBeVisible();
    await scopesButton.click();

    const vectorscopeOption = page.locator('[data-scope-type="vectorscope"]');
    await expect(vectorscopeOption).toBeVisible();
    await vectorscopeOption.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);

    // Click again to hide
    await vectorscopeOption.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(false);
  });
});

test.describe('Vectorscope Zoom', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show vectorscope
    await page.keyboard.press('y');
    await page.waitForTimeout(100);
  });

  test('VS-E010: default zoom mode is auto', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe('auto');
  });

  test('VS-E011: cycling zoom changes vectorscope zoom state', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleVectorscopeZoom();
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(1);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleVectorscopeZoom();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(2);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleVectorscopeZoom();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(4);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleVectorscopeZoom();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe('auto');
  });

  test('VS-E012: setZoom changes vectorscope zoom', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setVectorscopeZoom(2);
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(2);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setVectorscopeZoom(4);
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(4);
  });
});

test.describe('Vectorscope Closing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show vectorscope
    await page.keyboard.press('y');
    await page.waitForTimeout(100);
  });

  test('VS-E030: hide method hides vectorscope', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.hideVectorscope();
    });
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(false);

    const vectorscope = page.locator('.vectorscope-container');
    await expect(vectorscope).toBeHidden();
  });
});

test.describe('Vectorscope Internal Button Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show vectorscope
    await page.keyboard.press('y');
    await page.waitForTimeout(100);
  });

  test('VS-E050: clicking zoom button inside vectorscope cycles zoom', async ({ page }) => {
    const vectorscopeContainer = page.locator('.vectorscope-container');
    await expect(vectorscopeContainer).toBeVisible();

    // Find the zoom button by data-testid
    const zoomButton = page.locator('[data-testid="vectorscope-zoom-button"]');
    await expect(zoomButton).toBeVisible();
    await expect(zoomButton).toHaveText(/A:[124]x/);

    // Click to change from auto to 1x
    await zoomButton.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(1);
    await expect(zoomButton).toHaveText('1x');

    // Click to change from 1x to 2x
    await zoomButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(2);
    await expect(zoomButton).toHaveText('2x');

    // Click to change from 2x to 4x
    await zoomButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(4);
    await expect(zoomButton).toHaveText('4x');

    // Click to change from 4x back to auto
    await zoomButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe('auto');
    await expect(zoomButton).toHaveText(/A:[124]x/);
  });

  test('VS-E052: clicking close button inside vectorscope hides vectorscope', async ({ page }) => {
    const vectorscopeContainer = page.locator('.vectorscope-container');
    await expect(vectorscopeContainer).toBeVisible();

    // Find the close button by data-testid
    const closeButton = page.locator('[data-testid="vectorscope-close-button"]');
    await expect(closeButton).toBeVisible();

    // Click to close
    await closeButton.click();
    await page.waitForTimeout(100);

    // Vectorscope should be hidden
    const state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(false);
    await expect(vectorscopeContainer).toBeHidden();
  });
});

test.describe('Vectorscope State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('VS-E040: vectorscope visibility persists when changing frames', async ({ page }) => {
    await page.keyboard.press('y');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);
  });

  test('VS-E041: vectorscope zoom persists when changing frames', async ({ page }) => {
    await page.keyboard.press('y');
    await page.waitForTimeout(100);

    // Change to 2x zoom using direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setVectorscopeZoom(2);
    });
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(2);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeZoom).toBe(2);
  });

  test('VS-E042: vectorscope visibility persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('y');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);

    // Switch back to QC tab
    await page.click('button[data-tab-id="qc"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.vectorscopeVisible).toBe(true);
  });
});
