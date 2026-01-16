import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
} from './fixtures';

/**
 * Histogram Feature Tests
 *
 * These tests verify the histogram display functionality,
 * including visibility toggle, mode cycling, and log scale.
 */

test.describe('Histogram Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HG-E001: histogram is hidden by default', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(false);
  });

  test('HG-E002: pressing H toggles histogram visibility', async ({ page }) => {
    let state = await getViewerState(page);
    expect(state.histogramVisible).toBe(false);

    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);

    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramVisible).toBe(false);
  });

  test('HG-E003: histogram container is visible when shown', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    const histogram = page.locator('.histogram-container');
    await expect(histogram).toBeVisible();
  });

  test('HG-E004: histogram has canvas element', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    const canvas = page.locator('.histogram-container canvas');
    await expect(canvas).toBeVisible();
  });

  test('HG-E005: clicking Histogram button in View tab toggles histogram', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Click the Histogram button
    const histogramButton = page.locator('button:has-text("Histogram")');
    await expect(histogramButton).toBeVisible();

    await histogramButton.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);

    // Click again to hide
    await histogramButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramVisible).toBe(false);
  });
});

test.describe('Histogram Modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
  });

  test('HG-E010: default mode is RGB', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.histogramMode).toBe('rgb');
  });

  test('HG-E011: cycling mode changes histogram mode state', async ({ page }) => {
    // Use direct method call instead of button click
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.cycleMode();
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.histogramMode).toBe('luminance');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.cycleMode();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.histogramMode).toBe('separate');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.cycleMode();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.histogramMode).toBe('rgb');
  });

  test('HG-E012: setMode changes histogram mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.setMode('luminance');
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.histogramMode).toBe('luminance');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.setMode('separate');
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.histogramMode).toBe('separate');
  });
});

test.describe('Histogram Log Scale', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
  });

  test('HG-E020: default log scale is disabled', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.histogramLogScale).toBe(false);
  });

  test('HG-E021: toggleLogScale toggles log scale state', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.toggleLogScale();
    });
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.histogramLogScale).toBe(true);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.toggleLogScale();
    });
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramLogScale).toBe(false);
  });
});

test.describe('Histogram Closing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
  });

  test('HG-E030: hide method hides histogram', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.hide();
    });
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(false);

    const histogram = page.locator('.histogram-container');
    await expect(histogram).toBeHidden();
  });
});

test.describe('Histogram Internal Button Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
  });

  test('HG-E050: clicking mode button inside histogram cycles modes', async ({ page }) => {
    // Mode button shows current mode label: RGB -> Luma -> Sep -> RGB
    const histogramContainer = page.locator('.histogram-container');
    await expect(histogramContainer).toBeVisible();

    // Find the mode button by data-testid
    const modeButton = page.locator('[data-testid="histogram-mode-button"]');
    await expect(modeButton).toBeVisible();
    await expect(modeButton).toHaveText('RGB');

    // Click to change from RGB to Luminance
    await modeButton.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.histogramMode).toBe('luminance');
    await expect(modeButton).toHaveText('Luma');

    // Click to change from Luminance to Separate
    await modeButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramMode).toBe('separate');
    await expect(modeButton).toHaveText('Sep');

    // Click to change from Separate back to RGB
    await modeButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramMode).toBe('rgb');
    await expect(modeButton).toHaveText('RGB');
  });

  test('HG-E051: clicking log scale button inside histogram toggles log scale', async ({ page }) => {
    const histogramContainer = page.locator('.histogram-container');
    await expect(histogramContainer).toBeVisible();

    // Find the log scale button by data-testid
    const logButton = page.locator('[data-testid="histogram-log-button"]');
    await expect(logButton).toBeVisible();
    await expect(logButton).toHaveText('Lin');

    // Click to enable log scale
    await logButton.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.histogramLogScale).toBe(true);
    await expect(logButton).toHaveText('Log');

    // Click to disable log scale
    await logButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramLogScale).toBe(false);
    await expect(logButton).toHaveText('Lin');
  });

  test('HG-E052: clicking close button inside histogram hides histogram', async ({ page }) => {
    const histogramContainer = page.locator('.histogram-container');
    await expect(histogramContainer).toBeVisible();

    // Find the close button by data-testid
    const closeButton = page.locator('[data-testid="histogram-close-button"]');
    await expect(closeButton).toBeVisible();

    // Click to close
    await closeButton.click();
    await page.waitForTimeout(100);

    // Histogram should be hidden
    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(false);
    await expect(histogramContainer).toBeHidden();
  });
});

test.describe('Histogram State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HG-E040: histogram visibility persists when changing frames', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
  });

  test('HG-E041: histogram mode persists when changing frames', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    // Change to luminance mode using direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.histogram?.setMode('luminance');
    });
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.histogramMode).toBe('luminance');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramMode).toBe('luminance');
  });

  test('HG-E042: histogram visibility persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
  });
});
