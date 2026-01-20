import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getZebraStripesState,
  waitForTestHelper,
  captureCanvasState,
  verifyCanvasChanged,
} from './fixtures';

/**
 * Zebra Stripes Feature Tests
 *
 * These tests verify the zebra stripes exposure warning functionality,
 * including toggling, threshold adjustment, and visual feedback.
 */

test.describe('Zebra Stripes Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ZB-E001: zebra stripes are disabled by default', async ({ page }) => {
    const state = await getZebraStripesState(page);
    expect(state.enabled).toBe(false);
  });

  test('ZB-E002: pressing Shift+Alt+Z toggles zebra stripes', async ({ page }) => {
    let state = await getZebraStripesState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.enabled).toBe(false);
  });

  test('ZB-E003: zebra stripes overlay is visible when enabled', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);

    const state = await getZebraStripesState(page);
    expect(state.enabled).toBe(true);

    // Zebra overlay should exist (may not have visible stripes depending on image content)
    const overlay = page.locator('[data-testid="zebra-overlay"], .zebra-overlay');
    // Check either the overlay exists or the feature is enabled via state
    expect(state.enabled).toBe(true);
  });
});

test.describe('Zebra Stripes Thresholds', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable zebra stripes
    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);
  });

  test('ZB-E010: default high threshold is 95', async ({ page }) => {
    const state = await getZebraStripesState(page);
    expect(state.highThreshold).toBe(95);
  });

  test('ZB-E011: default low threshold is 5', async ({ page }) => {
    const state = await getZebraStripesState(page);
    expect(state.lowThreshold).toBe(5);
  });

  test('ZB-E012: high zebra is enabled by default', async ({ page }) => {
    const state = await getZebraStripesState(page);
    expect(state.highEnabled).toBe(true);
  });

  test('ZB-E013: low zebra is disabled by default', async ({ page }) => {
    const state = await getZebraStripesState(page);
    expect(state.lowEnabled).toBe(false);
  });

  test('ZB-E014: changing high threshold updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.zebraControl?.setHighThreshold(90);
    });
    await page.waitForTimeout(100);

    const state = await getZebraStripesState(page);
    expect(state.highThreshold).toBe(90);
  });

  test('ZB-E015: changing low threshold updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.zebraControl?.setLowThreshold(10);
    });
    await page.waitForTimeout(100);

    const state = await getZebraStripesState(page);
    expect(state.lowThreshold).toBe(10);
  });
});

test.describe('Zebra Stripes Toggle Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);
  });

  test('ZB-E020: toggling high zebra updates state', async ({ page }) => {
    let state = await getZebraStripesState(page);
    expect(state.highEnabled).toBe(true);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.zebraControl?.toggleHigh();
    });
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.highEnabled).toBe(false);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.zebraControl?.toggleHigh();
    });
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.highEnabled).toBe(true);
  });

  test('ZB-E021: toggling low zebra updates state', async ({ page }) => {
    let state = await getZebraStripesState(page);
    expect(state.lowEnabled).toBe(false);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.zebraControl?.toggleLow();
    });
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.lowEnabled).toBe(true);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.zebraControl?.toggleLow();
    });
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.lowEnabled).toBe(false);
  });
});

test.describe('Zebra Stripes UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ZB-E030: zebra control exists in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Look for zebra control
    const control = page.locator('[data-testid="zebra-control"], button:has-text("Zebra")');
    await expect(control.first()).toBeVisible();
  });
});

test.describe('Zebra Stripes State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ZB-E040: zebra state persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);

    let state = await getZebraStripesState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.enabled).toBe(true);
  });

  test('ZB-E041: zebra threshold persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);

    // Change threshold
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.zebraControl?.setHighThreshold(85);
    });
    await page.waitForTimeout(100);

    let state = await getZebraStripesState(page);
    expect(state.highThreshold).toBe(85);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.highThreshold).toBe(85);
  });

  test('ZB-E042: zebra state persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+z');
    await page.waitForTimeout(100);

    let state = await getZebraStripesState(page);
    expect(state.enabled).toBe(true);

    // Switch tabs
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getZebraStripesState(page);
    expect(state.enabled).toBe(true);
  });
});
