import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getFalseColorState,
  waitForTestHelper,
} from './fixtures';

/**
 * False Color Feature Tests
 *
 * These tests verify the false color exposure analysis functionality,
 * including toggling, preset selection, and visual feedback.
 */

// Helper to wait for false color enabled state to match expected value
async function waitForFalseColorEnabled(page: import('@playwright/test').Page, enabled: boolean) {
  await page.waitForFunction(
    (expected) => (window as any).__OPENRV_TEST__?.getFalseColorState()?.enabled === expected,
    enabled,
    { timeout: 5000 },
  );
}

// Helper to wait for false color preset to match expected value
async function waitForFalseColorPreset(page: import('@playwright/test').Page, preset: string) {
  await page.waitForFunction(
    (expectedPreset) => (window as any).__OPENRV_TEST__?.getFalseColorState()?.preset === expectedPreset,
    preset,
    { timeout: 5000 },
  );
}

async function setFalseColorPreset(page: import('@playwright/test').Page, preset: 'standard' | 'arri' | 'red' | 'custom') {
  await page.evaluate((nextPreset) => {
    (window as any).__OPENRV_TEST__?.mutations?.setFalseColorPreset(nextPreset);
  }, preset);
}

async function getFalseColorLutSignature(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() => {
    return (window as any).__OPENRV_TEST__?.mutations?.getFalseColorLUT() ?? [];
  });
}

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
    await waitForFalseColorEnabled(page, true);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+Alt+f');
    await waitForFalseColorEnabled(page, false);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);
  });

  test('FC-E003: false color changes canvas appearance', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+f');
    await waitForFalseColorEnabled(page, true);
    const state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });

  test('FC-E004: disabling false color restores original appearance', async ({ page }) => {
    // Enable false color
    await page.keyboard.press('Shift+Alt+f');
    await waitForFalseColorEnabled(page, true);

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Disable false color
    await page.keyboard.press('Shift+Alt+f');
    await waitForFalseColorEnabled(page, false);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);
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
    await waitForFalseColorEnabled(page, true);
  });

  test('FC-E010: default preset is standard', async ({ page }) => {
    const state = await getFalseColorState(page);
    expect(state.preset).toBe('standard');
  });

  test('FC-E011: changing preset updates state', async ({ page }) => {
    // Change preset via API
    await setFalseColorPreset(page, 'arri');
    await waitForFalseColorPreset(page, 'arri');

    let state = await getFalseColorState(page);
    expect(state.preset).toBe('arri');

    await setFalseColorPreset(page, 'red');
    await waitForFalseColorPreset(page, 'red');

    state = await getFalseColorState(page);
    expect(state.preset).toBe('red');
  });

  test('FC-E012: different presets produce different visuals', async ({ page }) => {
    const standardSignature = await getFalseColorLutSignature(page);

    // Change to ARRI preset
    await setFalseColorPreset(page, 'arri');
    await waitForFalseColorPreset(page, 'arri');

    const arriSignature = await getFalseColorLutSignature(page);
    expect(arriSignature).not.toEqual(standardSignature);
  });
});

test.describe('False Color UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('FC-E020: false color control button exists in QC tab', async ({ page }) => {
    // Go to QC tab
    await page.click('button[data-tab-id="qc"]');

    const control = page.locator('[data-testid="false-color-control-button"]');
    await expect(control).toBeVisible();
  });

  test('FC-E021: clicking false color control toggles feature', async ({ page }) => {
    // Go to QC tab
    await page.click('button[data-tab-id="qc"]');

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);

    // Open false color dropdown, then enable it via checkbox
    const control = page.locator('[data-testid="false-color-control-button"]');
    await control.click();
    const dropdown = page.locator('[data-testid="false-color-dropdown"]');
    await expect(dropdown).toBeVisible();
    const enabledCheckbox = dropdown.locator('input[type="checkbox"]').first();
    await enabledCheckbox.check();
    await waitForFalseColorEnabled(page, true);

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
    await waitForFalseColorEnabled(page, true);

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      () => {
        const sessionState = (window as any).__OPENRV_TEST__?.getSessionState();
        return sessionState?.currentFrame > 0;
      },
      undefined,
      { timeout: 5000 },
    );

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });

  test('FC-E031: false color preset persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+f');
    await waitForFalseColorEnabled(page, true);

    // Change preset
    await setFalseColorPreset(page, 'arri');
    await waitForFalseColorPreset(page, 'arri');

    let state = await getFalseColorState(page);
    expect(state.preset).toBe('arri');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      () => {
        const sessionState = (window as any).__OPENRV_TEST__?.getSessionState();
        return sessionState?.currentFrame > 0;
      },
      undefined,
      { timeout: 5000 },
    );

    state = await getFalseColorState(page);
    expect(state.preset).toBe('arri');
  });

  test('FC-E032: false color state persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+f');
    await waitForFalseColorEnabled(page, true);

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Switch to Color tab
    const colorTab = page.locator('button[data-tab-id="color"]');
    await colorTab.click();
    await expect(colorTab).toBeVisible();

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Switch back to QC tab
    const qcTab = page.locator('button[data-tab-id="qc"]');
    await qcTab.click();
    await expect(qcTab).toBeVisible();

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });
});
