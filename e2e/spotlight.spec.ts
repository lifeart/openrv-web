import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getSpotlightState,
  waitForTestHelper,
  captureCanvasState,
  verifyCanvasChanged,
} from './fixtures';

/**
 * Spotlight Feature Tests
 *
 * These tests verify the spotlight/vignette functionality,
 * including toggling, position, and appearance settings.
 */

test.describe('Spotlight Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E001: spotlight is disabled by default', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);
  });

  test('SL-E002: pressing Shift+Q toggles spotlight', async ({ page }) => {
    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);
  });

  test('SL-E003: spotlight changes canvas appearance', async ({ page }) => {
    const before = await captureCanvasState(page);

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(200);

    const after = await captureCanvasState(page);
    expect(verifyCanvasChanged(before, after)).toBe(true);
  });

  test('SL-E004: spotlight overlay is visible when enabled', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    const overlay = page.locator('[data-testid="spotlight-overlay"], .spotlight-overlay');
    await expect(overlay).toBeVisible();
  });
});

test.describe('Spotlight Properties', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable spotlight
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E010: default shape is circle', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.shape).toBe('circle');
  });

  test('SL-E011: default position is center (0.5, 0.5)', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.5, 1);
    expect(state.y).toBeCloseTo(0.5, 1);
  });

  test('SL-E012: default dim amount is 0.7', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.dimAmount).toBeCloseTo(0.7, 1);
  });

  test('SL-E013: changing position updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.spotlightOverlay?.setPosition(0.3, 0.7);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.3, 1);
    expect(state.y).toBeCloseTo(0.7, 1);
  });

  test('SL-E014: changing size updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.spotlightOverlay?.setSize(0.4, 0.4);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.width).toBeCloseTo(0.4, 1);
    expect(state.height).toBeCloseTo(0.4, 1);
  });

  test('SL-E015: changing dim amount updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.spotlightOverlay?.setDimAmount(0.5);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.dimAmount).toBeCloseTo(0.5, 1);
  });

  test('SL-E016: changing feather updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.spotlightOverlay?.setFeather(0.1);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.feather).toBeCloseTo(0.1, 1);
  });
});

test.describe('Spotlight Shape', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E020: changing shape to rectangle updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.spotlightOverlay?.setShape('rectangle');
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.shape).toBe('rectangle');
  });

  test('SL-E021: different shapes produce different visuals', async ({ page }) => {
    const circleState = await captureCanvasState(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.spotlightOverlay?.setShape('rectangle');
    });
    await page.waitForTimeout(200);

    const rectangleState = await captureCanvasState(page);
    expect(verifyCanvasChanged(circleState, rectangleState)).toBe(true);
  });
});

test.describe('Spotlight UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E030: spotlight control exists in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Look for spotlight control
    const control = page.locator('[data-testid="spotlight-control"], button:has-text("Spotlight"), button:has-text("Focus")');
    await expect(control.first()).toBeVisible();
  });
});

test.describe('Spotlight State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E040: spotlight state persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
  });

  test('SL-E041: spotlight position persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    // Change position
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.spotlightOverlay?.setPosition(0.3, 0.7);
    });
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.3, 1);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.3, 1);
  });

  test('SL-E042: spotlight state persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Switch tabs
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
  });
});
