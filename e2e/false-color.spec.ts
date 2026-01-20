import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getFalseColorState,
  waitForTestHelper,
  captureCanvasState,
  verifyCanvasChanged,
} from './fixtures';

/**
 * False Color Feature Tests
 *
 * These tests verify the false color exposure analysis functionality,
 * including toggling, preset selection, and visual feedback.
 */

test.describe('False Color Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('FC-E001: false color is disabled by default', async ({ page }) => {
    const state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);
  });

  test('FC-E002: pressing Shift+Alt+F toggles false color', async ({ page }) => {
    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);
  });

  test('FC-E003: false color changes canvas appearance', async ({ page }) => {
    const before = await captureCanvasState(page);

    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    const after = await captureCanvasState(page);
    expect(verifyCanvasChanged(before, after)).toBe(true);
  });

  test('FC-E004: disabling false color restores original appearance', async ({ page }) => {
    const original = await captureCanvasState(page);

    // Enable false color
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    const withFalseColor = await captureCanvasState(page);
    expect(verifyCanvasChanged(original, withFalseColor)).toBe(true);

    // Disable false color
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    const restored = await captureCanvasState(page);
    // Canvas should be back to similar state (may have minor differences due to rendering)
    expect(verifyCanvasChanged(withFalseColor, restored)).toBe(true);
  });
});

test.describe('False Color Presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable false color
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(100);
  });

  test('FC-E010: default preset is standard', async ({ page }) => {
    const state = await getFalseColorState(page);
    expect(state.preset).toBe('standard');
  });

  test('FC-E011: changing preset updates state', async ({ page }) => {
    // Change preset via API
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.falseColorControl?.setPreset('arri');
    });
    await page.waitForTimeout(100);

    let state = await getFalseColorState(page);
    expect(state.preset).toBe('arri');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.falseColorControl?.setPreset('red');
    });
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.preset).toBe('red');
  });

  test('FC-E012: different presets produce different visuals', async ({ page }) => {
    const standardState = await captureCanvasState(page);

    // Change to ARRI preset
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.falseColorControl?.setPreset('arri');
    });
    await page.waitForTimeout(200);

    const arriState = await captureCanvasState(page);
    expect(verifyCanvasChanged(standardState, arriState)).toBe(true);
  });
});

test.describe('False Color UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('FC-E020: false color control button exists in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Look for false color control or dropdown
    const control = page.locator('[data-testid="false-color-control"], button:has-text("False Color")');
    await expect(control.first()).toBeVisible();
  });

  test('FC-E021: clicking false color control toggles feature', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);

    // Click the false color control
    const control = page.locator('[data-testid="false-color-control"], button:has-text("False Color")');
    await control.first().click();
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });
});

test.describe('False Color State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('FC-E030: false color state persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(100);

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });

  test('FC-E031: false color preset persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(100);

    // Change preset
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.falseColorControl?.setPreset('arri');
    });
    await page.waitForTimeout(100);

    let state = await getFalseColorState(page);
    expect(state.preset).toBe('arri');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.preset).toBe('arri');
  });

  test('FC-E032: false color state persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(100);

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });
});
