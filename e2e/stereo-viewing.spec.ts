import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForStereoMode,
  waitForTabActive,
  waitForCondition,
  waitForFrameChange,
} from './fixtures';

/**
 * Stereo Viewing Modes Feature Tests
 *
 * These tests verify the stereoscopic 3D viewing functionality,
 * including UI interaction, keyboard shortcuts, and actual
 * visual changes to the canvas.
 *
 * Reference: OpenRV StereoIPNode.cpp, stereo_autoload plugin
 */

test.describe('Stereo Viewing Modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ST-001: default stereo mode is off', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('off');
    expect(state.stereoEyeSwap).toBe(false);
    expect(state.stereoOffset).toBe(0);
  });

  test('ST-002: stereo control is visible in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Check that stereo control exists
    const stereoControl = page.locator('[data-testid="stereo-control"]');
    await expect(stereoControl).toBeVisible();
  });

  test('ST-003: clicking stereo button opens mode dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Click stereo mode button
    await page.click('[data-testid="stereo-mode-button"]');

    // Check dropdown is visible
    const dropdown = page.locator('[data-testid="stereo-mode-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('ST-004: selecting side-by-side mode from dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Open dropdown and select side-by-side
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="side-by-side"]');
    await waitForStereoMode(page, 'side-by-side');

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('side-by-side');
  });

  test('ST-005: selecting over-under mode from dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="over-under"]');
    await waitForStereoMode(page, 'over-under');

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('over-under');
  });

  test('ST-006: selecting mirror mode from dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="mirror"]');
    await waitForStereoMode(page, 'mirror');

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('mirror');
  });

  test('ST-007: selecting anaglyph mode from dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('anaglyph');
  });

  test('ST-008: selecting anaglyph-luminance mode from dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph-luminance"]');
    await waitForStereoMode(page, 'anaglyph-luminance');

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('anaglyph-luminance');
  });

  test('ST-009: selecting checkerboard mode from dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="checkerboard"]');
    await waitForStereoMode(page, 'checkerboard');

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('checkerboard');
  });

  test('ST-010: selecting scanline mode from dropdown', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="scanline"]');
    await waitForStereoMode(page, 'scanline');

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('scanline');
  });

  test('ST-011: selecting off mode disables stereo', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // First enable a stereo mode
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');

    let state = await getViewerState(page);
    expect(state.stereoMode).toBe('anaglyph');

    // Now select off
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="off"]');
    await waitForStereoMode(page, 'off');

    state = await getViewerState(page);
    expect(state.stereoMode).toBe('off');
  });
});

test.describe('Stereo Eye Swap Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ST-020: eye swap button appears when stereo mode is active', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Eye swap should be hidden when stereo is off
    const eyeSwapButton = page.locator('[data-testid="stereo-eye-swap"]');
    await expect(eyeSwapButton).not.toBeVisible();

    // Enable a stereo mode
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');

    // Eye swap should now be visible
    await expect(eyeSwapButton).toBeVisible();
  });

  test('ST-021: clicking eye swap toggles eye swap state', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Enable stereo mode
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');

    let state = await getViewerState(page);
    expect(state.stereoEyeSwap).toBe(false);

    // Click eye swap
    await page.click('[data-testid="stereo-eye-swap"]');
    await waitForCondition(page, '(() => { const s = window.__OPENRV_TEST__?.getViewerState(); return s?.stereoEyeSwap === true; })()');

    state = await getViewerState(page);
    expect(state.stereoEyeSwap).toBe(true);

    // Click again to toggle off
    await page.click('[data-testid="stereo-eye-swap"]');
    await waitForCondition(page, '(() => { const s = window.__OPENRV_TEST__?.getViewerState(); return s?.stereoEyeSwap === false; })()');

    state = await getViewerState(page);
    expect(state.stereoEyeSwap).toBe(false);
  });
});

test.describe('Stereo Offset Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ST-030: offset slider appears when stereo mode is active', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Offset container should be hidden when stereo is off
    const offsetContainer = page.locator('[data-testid="stereo-offset-container"]');
    await expect(offsetContainer).not.toBeVisible();

    // Enable a stereo mode
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="side-by-side"]');
    await waitForStereoMode(page, 'side-by-side');

    // Offset container should now be visible
    await expect(offsetContainer).toBeVisible();
  });

  test('ST-031: adjusting offset slider changes stereo offset', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Enable stereo mode
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="side-by-side"]');
    await waitForStereoMode(page, 'side-by-side');

    // Initial offset should be 0
    let state = await getViewerState(page);
    expect(state.stereoOffset).toBe(0);

    // Adjust offset slider
    const slider = page.locator('[data-testid="stereo-offset-slider"]');
    await slider.fill('5');
    await slider.dispatchEvent('input');
    await waitForCondition(page, '(() => { const s = window.__OPENRV_TEST__?.getViewerState(); return s?.stereoOffset === 5; })()');

    state = await getViewerState(page);
    expect(state.stereoOffset).toBe(5);
  });
});

test.describe('Stereo Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ST-040: Shift+3 cycles through stereo modes', async ({ page }) => {
    // Initial state should be off
    let state = await getViewerState(page);
    expect(state.stereoMode).toBe('off');

    // Press Shift+3 to cycle to next mode (side-by-side)
    await page.keyboard.press('Shift+3');
    await waitForStereoMode(page, 'side-by-side');

    state = await getViewerState(page);
    expect(state.stereoMode).toBe('side-by-side');

    // Press again to cycle to over-under
    await page.keyboard.press('Shift+3');
    await waitForStereoMode(page, 'over-under');

    state = await getViewerState(page);
    expect(state.stereoMode).toBe('over-under');

    // Continue cycling
    await page.keyboard.press('Shift+3');
    await waitForStereoMode(page, 'mirror');

    state = await getViewerState(page);
    expect(state.stereoMode).toBe('mirror');
  });
});

test.describe('Stereo Visual Changes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ST-050: side-by-side mode produces different image than original', async ({ page }) => {
    // Capture original screenshot
    const originalScreenshot = await captureViewerScreenshot(page);

    // Enable side-by-side mode
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="side-by-side"]');
    await waitForStereoMode(page, 'side-by-side');
    await page.waitForTimeout(200);

    // Capture stereo screenshot
    const stereoScreenshot = await captureViewerScreenshot(page);

    // Images should be different
    expect(imagesAreDifferent(originalScreenshot, stereoScreenshot)).toBe(true);
  });

  test('ST-051: anaglyph mode produces different image than original', async ({ page }) => {
    const originalScreenshot = await captureViewerScreenshot(page);

    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');
    await page.waitForTimeout(200);

    const anaglyphScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(originalScreenshot, anaglyphScreenshot)).toBe(true);
  });

  test('ST-052: checkerboard mode produces different image than original', async ({ page }) => {
    const originalScreenshot = await captureViewerScreenshot(page);

    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="checkerboard"]');
    await waitForStereoMode(page, 'checkerboard');
    await page.waitForTimeout(200);

    const checkerboardScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(originalScreenshot, checkerboardScreenshot)).toBe(true);
  });

  test('ST-053: each stereo mode produces a unique image', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Capture side-by-side
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="side-by-side"]');
    await waitForStereoMode(page, 'side-by-side');
    await page.waitForTimeout(200);
    const sideBySideScreenshot = await captureViewerScreenshot(page);

    // Capture anaglyph
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');
    await page.waitForTimeout(200);
    const anaglyphScreenshot = await captureViewerScreenshot(page);

    // Capture checkerboard
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="checkerboard"]');
    await waitForStereoMode(page, 'checkerboard');
    await page.waitForTimeout(200);
    const checkerboardScreenshot = await captureViewerScreenshot(page);

    // Each should be different from the others
    expect(imagesAreDifferent(sideBySideScreenshot, anaglyphScreenshot)).toBe(true);
    expect(imagesAreDifferent(anaglyphScreenshot, checkerboardScreenshot)).toBe(true);
    expect(imagesAreDifferent(sideBySideScreenshot, checkerboardScreenshot)).toBe(true);
  });

  test('ST-054: disabling stereo mode restores original image', async ({ page }) => {
    // Capture original
    const originalScreenshot = await captureViewerScreenshot(page);

    // Enable anaglyph mode
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');
    await page.waitForTimeout(200);

    // Disable stereo mode
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="off"]');
    await waitForStereoMode(page, 'off');
    await page.waitForTimeout(200);

    // Capture restored
    const restoredScreenshot = await captureViewerScreenshot(page);

    // Images should be the same
    expect(imagesAreDifferent(originalScreenshot, restoredScreenshot)).toBe(false);
  });
});

test.describe('Stereo State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ST-060: stereo mode persists when changing frames', async ({ page }) => {
    // Enable anaglyph mode
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="anaglyph"]');
    await waitForStereoMode(page, 'anaglyph');

    let state = await getViewerState(page);
    expect(state.stereoMode).toBe('anaglyph');

    // Navigate to next frame
    await page.keyboard.press('ArrowRight');
    await waitForFrameChange(page, 1);

    // Stereo mode should still be anaglyph
    state = await getViewerState(page);
    expect(state.stereoMode).toBe('anaglyph');

    // Navigate back
    await page.keyboard.press('ArrowLeft');
    await waitForFrameChange(page, 2);

    // Stereo mode should still be anaglyph
    state = await getViewerState(page);
    expect(state.stereoMode).toBe('anaglyph');
  });

  test('ST-061: stereo mode persists when changing tabs', async ({ page }) => {
    // Enable side-by-side mode
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');
    await page.click('[data-testid="stereo-mode-button"]');
    await page.click('[data-stereo-mode="side-by-side"]');
    await waitForStereoMode(page, 'side-by-side');

    let state = await getViewerState(page);
    expect(state.stereoMode).toBe('side-by-side');

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await waitForTabActive(page, 'color');

    // Stereo mode should still be side-by-side
    state = await getViewerState(page);
    expect(state.stereoMode).toBe('side-by-side');

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await waitForTabActive(page, 'view');

    // Stereo mode should still be side-by-side
    state = await getViewerState(page);
    expect(state.stereoMode).toBe('side-by-side');
  });
});
