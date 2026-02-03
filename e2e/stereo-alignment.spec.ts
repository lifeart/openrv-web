import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Stereo Alignment Overlay E2E Tests
 *
 * These tests verify alignment overlay tools (grid, crosshair, difference, edges)
 * used for stereo correction. The Align button is only visible when stereo mode is active.
 */

// Helper to activate stereo mode
async function activateStereoMode(page: import('@playwright/test').Page, mode = 'side-by-side') {
  await page.click('button[data-tab-id="view"]');
  await page.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="stereo-mode-button"]');
    return btn !== null;
  });
  await page.click('[data-testid="stereo-mode-button"]');
  await page.waitForFunction(() => {
    const dd = document.querySelector('[data-testid="stereo-mode-dropdown"]');
    return dd && (dd as HTMLElement).style.display !== 'none';
  });
  await page.click(`[data-stereo-mode="${mode}"]`);
  await page.waitForFunction(
    (m) => window.__OPENRV_TEST__?.getViewerState()?.stereoMode === m,
    mode
  );
}

// Helper to select alignment mode from dropdown
async function selectAlignMode(page: import('@playwright/test').Page, mode: string) {
  await page.click('[data-testid="stereo-align-button"]');
  await page.waitForFunction(() => {
    const dd = document.querySelector('[data-testid="stereo-align-dropdown"]');
    return dd && (dd as HTMLElement).style.display !== 'none';
  });
  await page.click(`[data-stereo-align="${mode}"]`);
  await page.waitForFunction(
    (m) => window.__OPENRV_TEST__?.getViewerState()?.stereoAlignMode === m,
    mode
  );
}

test.describe('Stereo Alignment Overlays', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  // --- Visibility Tests ---

  test('SAL-001: Alignment button is hidden when stereo mode is off', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="stereo-align-button"]');
      if (!btn) return true;
      return (btn as HTMLElement).style.display === 'none' || (btn.parentElement as HTMLElement)?.style.display === 'none';
    });
  });

  test('SAL-002: Alignment button appears when stereo mode is activated', async ({ page }) => {
    await activateStereoMode(page);
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="stereo-align-button"]');
      if (!btn) return false;
      const parent = btn.parentElement as HTMLElement;
      return parent?.style.display !== 'none';
    });
  });

  test('SAL-003: Clicking alignment button opens mode dropdown', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-align-button"]');
    await page.waitForFunction(() => {
      const dd = document.querySelector('[data-testid="stereo-align-dropdown"]');
      return dd && (dd as HTMLElement).style.display !== 'none';
    });
  });

  test('SAL-004: Default alignment mode is off', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoAlignMode).toBe('off');
  });

  // --- Grid Overlay Tests ---

  test('SAL-010: Selecting grid mode shows grid overlay on canvas', async ({ page }) => {
    await activateStereoMode(page);
    await selectAlignMode(page, 'grid');
    const state = await getViewerState(page);
    expect(state.stereoAlignMode).toBe('grid');
  });

  test('SAL-011: Grid overlay changes canvas output', async ({ page }) => {
    await activateStereoMode(page);
    const before = await captureViewerScreenshot(page);

    await selectAlignMode(page, 'grid');
    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // --- Crosshair Overlay Tests ---

  test('SAL-020: Selecting crosshair mode shows crosshair overlay', async ({ page }) => {
    await activateStereoMode(page);
    await selectAlignMode(page, 'crosshair');
    const state = await getViewerState(page);
    expect(state.stereoAlignMode).toBe('crosshair');
  });

  test('SAL-021: Crosshair overlay changes canvas output', async ({ page }) => {
    await activateStereoMode(page);
    const before = await captureViewerScreenshot(page);

    await selectAlignMode(page, 'crosshair');
    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // --- Difference Mode Tests ---

  test('SAL-030: Selecting difference mode shows difference image', async ({ page }) => {
    await activateStereoMode(page);
    await selectAlignMode(page, 'difference');
    const state = await getViewerState(page);
    expect(state.stereoAlignMode).toBe('difference');
  });

  test('SAL-031: Difference mode changes canvas output', async ({ page }) => {
    await activateStereoMode(page);
    const before = await captureViewerScreenshot(page);

    await selectAlignMode(page, 'difference');
    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // --- Edge Overlay Tests ---

  test('SAL-040: Selecting edge mode shows edge overlay', async ({ page }) => {
    await activateStereoMode(page);
    await selectAlignMode(page, 'edges');
    const state = await getViewerState(page);
    expect(state.stereoAlignMode).toBe('edges');
  });

  test('SAL-041: Edge overlay changes canvas output', async ({ page }) => {
    await activateStereoMode(page);
    const before = await captureViewerScreenshot(page);

    await selectAlignMode(page, 'edges');
    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // --- Mode Cycling Tests ---

  test('SAL-050: Shift+4 cycles through alignment modes', async ({ page }) => {
    await activateStereoMode(page);

    await page.keyboard.press('Shift+4');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoAlignMode === 'grid';
    });

    await page.keyboard.press('Shift+4');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoAlignMode === 'crosshair';
    });

    await page.keyboard.press('Shift+4');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoAlignMode === 'difference';
    });

    await page.keyboard.press('Shift+4');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoAlignMode === 'edges';
    });
  });

  test('SAL-051: Cycling wraps from edges back to off', async ({ page }) => {
    await activateStereoMode(page);

    // Press 5 times to cycle off->grid->crosshair->difference->edges->off
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+4');
    }

    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoAlignMode === 'off';
    });
  });

  // --- Cleanup Tests ---

  test('SAL-070: Alignment overlay removed when stereo mode is turned off', async ({ page }) => {
    await activateStereoMode(page);
    await selectAlignMode(page, 'grid');

    // Turn stereo off
    await page.click('[data-testid="stereo-mode-button"]');
    await page.waitForFunction(() => {
      const dd = document.querySelector('[data-testid="stereo-mode-dropdown"]');
      return dd && (dd as HTMLElement).style.display !== 'none';
    });
    await page.click('[data-stereo-mode="off"]');

    await page.waitForFunction(() => {
      const state = window.__OPENRV_TEST__?.getViewerState();
      return state?.stereoMode === 'off' && state?.stereoAlignMode === 'off';
    });
  });

  test('SAL-071: Selecting off removes alignment overlay from canvas', async ({ page }) => {
    await activateStereoMode(page);
    await selectAlignMode(page, 'grid');
    const withGrid = await captureViewerScreenshot(page);

    await selectAlignMode(page, 'off');
    const afterOff = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(withGrid, afterOff)).toBe(true);
  });
});
