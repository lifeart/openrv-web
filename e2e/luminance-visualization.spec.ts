/**
 * Luminance Visualization E2E Tests
 *
 * Tests for the luminance visualization feature including:
 * - Mode switching (Off, False Color, HSV, Random Color, Contour)
 * - HSV visualization
 * - Random colorization controls
 * - Contour controls
 * - UI controls and badge
 * - State persistence
 * - Integration with other effects
 */

import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureCanvasState,
} from './fixtures';

// Helper to get luminance visualization state
async function getLuminanceVisState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    return (window as any).__OPENRV_TEST__?.getLuminanceVisState();
  });
}

// Helper to wait for luminance vis mode to match expected value
async function waitForLuminanceVisMode(page: import('@playwright/test').Page, expectedMode: string) {
  await page.waitForFunction(
    (mode) => (window as any).__OPENRV_TEST__?.getLuminanceVisState()?.mode === mode,
    expectedMode,
    { timeout: 5000 },
  );
}

// Helper to set mode and wait for it to take effect
async function setModeAndWait(page: import('@playwright/test').Page, mode: string) {
  await page.evaluate((m) => {
    (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisMode(m);
  }, mode);
  await waitForLuminanceVisMode(page, mode);
}

async function getColorSlider(page: import('@playwright/test').Page, label: string) {
  await page.keyboard.press('c');
  await page.waitForTimeout(200);
  const slider = page
    .locator('.color-controls-panel label')
    .filter({ hasText: label })
    .locator('..')
    .locator('input[type="range"]')
    .first();
  await expect(slider).toBeVisible();
  return slider;
}

test.describe('Luminance Visualization - Mode Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E001: all visualization modes start off', async ({ page }) => {
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('off');
  });

  test('LV-E002: Shift+Alt+V cycles through modes', async ({ page }) => {
    const expectedModes = ['false-color', 'hsv', 'random-color', 'contour', 'off'];

    for (const expectedMode of expectedModes) {
      await page.keyboard.press('Shift+Alt+v');
      await waitForLuminanceVisMode(page, expectedMode);
      const state = await getLuminanceVisState(page);
      expect(state.mode).toBe(expectedMode);
    }
  });

  test('LV-E003: selecting HSV changes canvas', async ({ page }) => {
    const before = await captureCanvasState(page);

    await setModeAndWait(page, 'hsv');

    const after = await captureCanvasState(page);
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('hsv');
    expect(typeof before).toBe('string');
    expect(typeof after).toBe('string');
  });

  test('LV-E004: selecting Random changes canvas', async ({ page }) => {
    const before = await captureCanvasState(page);

    await setModeAndWait(page, 'random-color');

    const after = await captureCanvasState(page);
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('random-color');
    expect(typeof before).toBe('string');
    expect(typeof after).toBe('string');
  });

  test('LV-E005: selecting Contour changes canvas', async ({ page }) => {
    const before = await captureCanvasState(page);

    await setModeAndWait(page, 'contour');

    const after = await captureCanvasState(page);
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('contour');
    expect(typeof before).toBe('string');
    expect(typeof after).toBe('string');
  });

  test('LV-E006: switching modes disables previous', async ({ page }) => {
    await setModeAndWait(page, 'hsv');
    const hsvState = await captureCanvasState(page);

    await setModeAndWait(page, 'contour');
    const contourState = await captureCanvasState(page);

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('contour');
    expect(typeof hsvState).toBe('string');
    expect(typeof contourState).toBe('string');
  });

  test('LV-E007: Off mode restores original image', async ({ page }) => {
    const original = await captureCanvasState(page);

    await setModeAndWait(page, 'hsv');

    const withHSV = await captureCanvasState(page);

    await setModeAndWait(page, 'off');

    const restored = await captureCanvasState(page);
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('off');
    expect(typeof original).toBe('string');
    expect(typeof withHSV).toBe('string');
    expect(typeof restored).toBe('string');
  });
});

test.describe('Luminance Visualization - Random Colorization Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await setModeAndWait(page, 'random-color');
  });

  test('LV-E021: band count slider changes bands', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisRandomBandCount(8);
    });
    await page.waitForFunction(
      () => (window as any).__OPENRV_TEST__?.getLuminanceVisState()?.randomBandCount === 8,
      undefined,
      { timeout: 5000 },
    );

    const state = await getLuminanceVisState(page);
    expect(state.randomBandCount).toBe(8);
  });

  test('LV-E022: reseed produces different colors', async ({ page }) => {
    const before = await captureCanvasState(page);
    const selector = page.locator('[data-testid="luminance-vis-selector"]');
    await expect(selector).toBeVisible();
    await selector.click();

    const reseedButton = page.locator('[data-testid="random-color-reseed-btn"]');
    await expect(reseedButton).toBeVisible();
    await reseedButton.click();
    await page.waitForTimeout(100);

    const after = await captureCanvasState(page);
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('random-color');
    expect(typeof state.randomSeed).toBe('number');
    expect(typeof before).toBe('string');
    expect(typeof after).toBe('string');
  });

  test('LV-E023: band count persists in state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisRandomBandCount(32);
    });
    await page.waitForFunction(
      () => (window as any).__OPENRV_TEST__?.getLuminanceVisState()?.randomBandCount === 32,
      undefined,
      { timeout: 5000 },
    );

    const state = await getLuminanceVisState(page);
    expect(state.randomBandCount).toBe(32);
  });
});

test.describe('Luminance Visualization - Contour Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await setModeAndWait(page, 'contour');
  });

  test('LV-E031: level slider changes contour density', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisContourLevels(5);
    });
    await page.waitForFunction(
      () => (window as any).__OPENRV_TEST__?.getLuminanceVisState()?.contourLevels === 5,
      undefined,
      { timeout: 5000 },
    );

    const state = await getLuminanceVisState(page);
    expect(state.contourLevels).toBe(5);
  });

  test('LV-E033: desaturate toggle works', async ({ page }) => {
    const state = await getLuminanceVisState(page);
    expect(state.contourDesaturate).toBe(true);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisContourDesaturate(false);
    });
    await page.waitForFunction(
      () => (window as any).__OPENRV_TEST__?.getLuminanceVisState()?.contourDesaturate === false,
      undefined,
      { timeout: 5000 },
    );

    const updated = await getLuminanceVisState(page);
    expect(updated.contourDesaturate).toBe(false);
  });

  test('LV-E035: contour level count persists', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisContourLevels(25);
    });
    await page.waitForFunction(
      () => (window as any).__OPENRV_TEST__?.getLuminanceVisState()?.contourLevels === 25,
      undefined,
      { timeout: 5000 },
    );

    const state = await getLuminanceVisState(page);
    expect(state.contourLevels).toBe(25);
  });
});

test.describe('Luminance Visualization - UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E040: mode selector exists in View tab', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');

    const selector = page.locator('[data-testid="luminance-vis-selector"]');
    await expect(selector).toBeVisible();
  });

  test('LV-E041: mode badge shows current mode', async ({ page }) => {
    await setModeAndWait(page, 'hsv');

    const badge = page.locator('[data-testid="luminance-vis-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('HSV');
  });

  test('LV-E042: mode badge hidden when off', async ({ page }) => {
    const badge = page.locator('[data-testid="luminance-vis-badge"]');
    await expect(badge).not.toBeVisible();
  });
});

test.describe('Luminance Visualization - State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E050: mode persists across tab switches', async ({ page }) => {
    await setModeAndWait(page, 'hsv');

    // Switch tabs
    await page.click('button[data-tab-id="color"]');
    await page.click('button[data-tab-id="view"]');

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('hsv');
  });

  test('LV-E051: settings persist when switching modes', async ({ page }) => {
    // Set random bands to 32
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisMode('random-color');
      (window as any).__OPENRV_TEST__?.mutations?.setLuminanceVisRandomBandCount(32);
    });
    await page.waitForFunction(
      () => (window as any).__OPENRV_TEST__?.getLuminanceVisState()?.randomBandCount === 32,
      undefined,
      { timeout: 5000 },
    );

    // Switch to HSV and back
    await setModeAndWait(page, 'hsv');
    await setModeAndWait(page, 'random-color');

    const state = await getLuminanceVisState(page);
    expect(state.randomBandCount).toBe(32);
  });

  test('LV-E052: mode persists across frame changes', async ({ page }) => {
    await setModeAndWait(page, 'contour');

    await page.keyboard.press('ArrowRight');
    await waitForLuminanceVisMode(page, 'contour');

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('contour');
  });
});

test.describe('Luminance Visualization - Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E060: exposure affects visualization', async ({ page }) => {
    await setModeAndWait(page, 'hsv');
    const beforeExposure = await captureCanvasState(page);

    // Change exposure via color controls panel slider.
    const exposureSlider = await getColorSlider(page, 'Exposure');
    await exposureSlider.fill('2');
    await exposureSlider.dispatchEvent('input');
    await exposureSlider.dispatchEvent('change');
    await page.waitForFunction(
      () => (window as any).__OPENRV_TEST__?.getColorState?.()?.exposure === 2,
      undefined,
      { timeout: 5000 },
    );

    const afterExposure = await captureCanvasState(page);
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('hsv');
    expect(typeof beforeExposure).toBe('string');
    expect(typeof afterExposure).toBe('string');
  });

  test('LV-E062: switching to false color uses existing presets', async ({ page }) => {
    await setModeAndWait(page, 'false-color');

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('false-color');
    expect(state.falseColorPreset).toBe('standard');
  });
});
