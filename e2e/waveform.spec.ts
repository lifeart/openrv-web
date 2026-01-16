import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
} from './fixtures';

/**
 * Waveform Monitor Feature Tests
 *
 * These tests verify the waveform display functionality,
 * including visibility toggle, mode cycling, and button controls.
 */

test.describe('Waveform Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('WF-E001: waveform is hidden by default', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
  });

  test('WF-E002: pressing w toggles waveform visibility', async ({ page }) => {
    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);

    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
  });

  test('WF-E003: waveform container is visible when shown', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    const waveform = page.locator('.waveform-container');
    await expect(waveform).toBeVisible();
  });

  test('WF-E004: waveform has canvas element', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    const canvas = page.locator('.waveform-container canvas');
    await expect(canvas).toBeVisible();
  });

  test('WF-E005: clicking Waveform button in View tab toggles waveform', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Click the Waveform button
    const waveformButton = page.locator('button:has-text("Waveform")');
    await expect(waveformButton).toBeVisible();

    await waveformButton.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Click again to hide
    await waveformButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
  });
});

test.describe('Waveform Modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('WF-E010: default mode is luma', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.waveformMode).toBe('luma');
  });

  test('WF-E011: cycling mode changes waveform mode state', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.waveform?.cycleMode();
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('rgb');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.waveform?.cycleMode();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.waveform?.cycleMode();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('luma');
  });

  test('WF-E012: setMode changes waveform mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.waveform?.setMode('rgb');
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('rgb');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.waveform?.setMode('parade');
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');
  });
});

test.describe('Waveform Closing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('WF-E030: hide method hides waveform', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.waveform?.hide();
    });
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);

    const waveform = page.locator('.waveform-container');
    await expect(waveform).toBeHidden();
  });
});

test.describe('Waveform Internal Button Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('WF-E050: clicking mode button inside waveform cycles modes', async ({ page }) => {
    const waveformContainer = page.locator('.waveform-container');
    await expect(waveformContainer).toBeVisible();

    // Find the mode button by data-testid
    const modeButton = page.locator('[data-testid="waveform-mode-button"]');
    await expect(modeButton).toBeVisible();
    await expect(modeButton).toHaveText('Luma');

    // Click to change from Luma to RGB
    await modeButton.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('rgb');
    await expect(modeButton).toHaveText('RGB');

    // Click to change from RGB to Parade
    await modeButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');
    await expect(modeButton).toHaveText('Parade');

    // Click to change from Parade back to Luma
    await modeButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformMode).toBe('luma');
    await expect(modeButton).toHaveText('Luma');
  });

  test('WF-E052: clicking close button inside waveform hides waveform', async ({ page }) => {
    const waveformContainer = page.locator('.waveform-container');
    await expect(waveformContainer).toBeVisible();

    // Find the close button by data-testid
    const closeButton = page.locator('[data-testid="waveform-close-button"]');
    await expect(closeButton).toBeVisible();

    // Click to close
    await closeButton.click();
    await page.waitForTimeout(100);

    // Waveform should be hidden
    const state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
    await expect(waveformContainer).toBeHidden();
  });
});

test.describe('Waveform State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('WF-E040: waveform visibility persists when changing frames', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);
  });

  test('WF-E041: waveform mode persists when changing frames', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    // Change to parade mode using direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.waveform?.setMode('parade');
    });
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');
  });

  test('WF-E042: waveform visibility persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);
  });
});
