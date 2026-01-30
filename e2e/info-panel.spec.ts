import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getInfoPanelState,
  getSessionState,
  waitForTestHelper,
} from './fixtures';

/**
 * Info Panel Feature Tests
 *
 * These tests verify the info panel overlay functionality,
 * including toggling, position, and metadata display.
 */

test.describe('Info Panel Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('IP-E001: info panel is disabled by default', async ({ page }) => {
    const state = await getInfoPanelState(page);
    expect(state.enabled).toBe(false);
  });

  test('IP-E002: pressing Shift+Alt+I toggles info panel', async ({ page }) => {
    let state = await getInfoPanelState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);

    state = await getInfoPanelState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);

    state = await getInfoPanelState(page);
    expect(state.enabled).toBe(false);
  });

  test('IP-E003: info panel is visible when enabled', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);

    const panel = page.locator('[data-testid="info-panel"], .info-panel');
    await expect(panel).toBeVisible();
  });
});

test.describe('Info Panel Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable info panel
    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);
  });

  test('IP-E010: info panel shows filename', async ({ page }) => {
    const state = await getInfoPanelState(page);
    expect(state.filename).not.toBeNull();
    expect(typeof state.filename).toBe('string');
  });

  test('IP-E011: info panel shows resolution', async ({ page }) => {
    const state = await getInfoPanelState(page);
    expect(state.resolution).not.toBeNull();
    // Resolution should be in format like "1920x1080"
    expect(state.resolution).toMatch(/\d+x\d+/);
  });

  test('IP-E012: info panel shows current frame', async ({ page }) => {
    const state = await getInfoPanelState(page);
    expect(typeof state.currentFrame).toBe('number');
    expect(state.currentFrame).toBeGreaterThanOrEqual(0);
  });

  test('IP-E013: info panel shows total frames', async ({ page }) => {
    const state = await getInfoPanelState(page);
    expect(typeof state.totalFrames).toBe('number');
    expect(state.totalFrames).toBeGreaterThan(0);
  });

  test('IP-E014: info panel shows fps', async ({ page }) => {
    const state = await getInfoPanelState(page);
    expect(typeof state.fps).toBe('number');
    expect(state.fps).toBeGreaterThan(0);
  });

  test('IP-E015: info panel frame updates when navigating', async ({ page }) => {
    const initialState = await getInfoPanelState(page);
    const initialFrame = initialState.currentFrame;

    // Navigate forward
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const updatedState = await getInfoPanelState(page);
    expect(updatedState.currentFrame).toBe(initialFrame + 1);
  });
});

test.describe('Info Panel Position', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);
  });

  test('IP-E020: default position is top-left', async ({ page }) => {
    const state = await getInfoPanelState(page);
    expect(state.position).toBe('top-left');
  });

  test('IP-E021: changing position to top-right updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.infoPanel?.setPosition('top-right');
    });
    await page.waitForTimeout(100);

    const state = await getInfoPanelState(page);
    expect(state.position).toBe('top-right');
  });

  test('IP-E022: changing position to bottom-left updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.infoPanel?.setPosition('bottom-left');
    });
    await page.waitForTimeout(100);

    const state = await getInfoPanelState(page);
    expect(state.position).toBe('bottom-left');
  });

  test('IP-E023: changing position to bottom-right updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.infoPanel?.setPosition('bottom-right');
    });
    await page.waitForTimeout(100);

    const state = await getInfoPanelState(page);
    expect(state.position).toBe('bottom-right');
  });
});

test.describe('Info Panel UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('IP-E030: info panel control exists in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Look for info panel toggle button (icon-only button)
    const control = page.locator('[data-testid="info-panel-toggle"]');
    await expect(control).toBeVisible();
  });
});

test.describe('Info Panel State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('IP-E040: info panel state persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);

    let state = await getInfoPanelState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getInfoPanelState(page);
    expect(state.enabled).toBe(true);
  });

  test('IP-E041: info panel position persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);

    // Change position
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.infoPanel?.setPosition('bottom-right');
    });
    await page.waitForTimeout(100);

    let state = await getInfoPanelState(page);
    expect(state.position).toBe('bottom-right');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getInfoPanelState(page);
    expect(state.position).toBe('bottom-right');
  });

  test('IP-E042: info panel state persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);

    let state = await getInfoPanelState(page);
    expect(state.enabled).toBe(true);

    // Switch tabs
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getInfoPanelState(page);
    expect(state.enabled).toBe(true);
  });
});

test.describe('Info Panel Synchronization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+Alt+i');
    await page.waitForTimeout(100);
  });

  test('IP-E050: info panel frame matches session frame', async ({ page }) => {
    const infoPanelState = await getInfoPanelState(page);
    const sessionState = await getSessionState(page);

    expect(infoPanelState.currentFrame).toBe(sessionState.currentFrame);
  });

  test('IP-E051: info panel total frames matches session frame count', async ({ page }) => {
    const infoPanelState = await getInfoPanelState(page);
    const sessionState = await getSessionState(page);

    expect(infoPanelState.totalFrames).toBe(sessionState.frameCount);
  });

  test('IP-E052: info panel fps matches session fps', async ({ page }) => {
    const infoPanelState = await getInfoPanelState(page);
    const sessionState = await getSessionState(page);

    expect(infoPanelState.fps).toBe(sessionState.fps);
  });
});
