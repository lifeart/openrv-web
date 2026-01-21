import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getSafeAreasState,
  waitForTestHelper,
} from './fixtures';

/**
 * Safe Areas Feature Tests
 *
 * These tests verify the safe areas overlay functionality,
 * including toggling, guide types, and aspect ratio overlays.
 */

test.describe('Safe Areas Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SA-E001: safe areas are disabled by default', async ({ page }) => {
    const state = await getSafeAreasState(page);
    expect(state.enabled).toBe(false);
  });

  test('SA-E002: pressing semicolon toggles safe areas', async ({ page }) => {
    let state = await getSafeAreasState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press(';');
    await page.waitForTimeout(100);

    state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press(';');
    await page.waitForTimeout(100);

    state = await getSafeAreasState(page);
    expect(state.enabled).toBe(false);
  });

  test('SA-E003: safe areas overlay is visible when enabled', async ({ page }) => {
    await page.keyboard.press(';');
    await page.waitForTimeout(100);

    const overlay = page.locator('[data-testid="safe-areas-overlay"], .safe-areas-overlay');
    await expect(overlay).toBeVisible();
  });
});

test.describe('Safe Areas Guide Types', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable safe areas
    await page.keyboard.press(';');
    await page.waitForTimeout(100);
  });

  test('SA-E010: title safe is enabled by default', async ({ page }) => {
    const state = await getSafeAreasState(page);
    expect(state.titleSafe).toBe(true);
  });

  test('SA-E011: action safe is enabled by default', async ({ page }) => {
    const state = await getSafeAreasState(page);
    expect(state.actionSafe).toBe(true);
  });

  test('SA-E012: center crosshair is disabled by default', async ({ page }) => {
    const state = await getSafeAreasState(page);
    expect(state.centerCrosshair).toBe(false);
  });

  test('SA-E013: rule of thirds is disabled by default', async ({ page }) => {
    const state = await getSafeAreasState(page);
    expect(state.ruleOfThirds).toBe(false);
  });

  test('SA-E014: toggling title safe updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.toggleTitleSafe();
    });
    await page.waitForTimeout(100);

    const state = await getSafeAreasState(page);
    expect(state.titleSafe).toBe(false);
  });

  test('SA-E015: toggling action safe updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.toggleActionSafe();
    });
    await page.waitForTimeout(100);

    const state = await getSafeAreasState(page);
    expect(state.actionSafe).toBe(false);
  });

  test('SA-E016: toggling center crosshair updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.toggleCenterCrosshair();
    });
    await page.waitForTimeout(100);

    const state = await getSafeAreasState(page);
    expect(state.centerCrosshair).toBe(true);
  });

  test('SA-E017: toggling rule of thirds updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.toggleRuleOfThirds();
    });
    await page.waitForTimeout(100);

    const state = await getSafeAreasState(page);
    expect(state.ruleOfThirds).toBe(true);
  });
});

test.describe('Safe Areas Aspect Ratios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press(';');
    await page.waitForTimeout(100);
  });

  test('SA-E020: no aspect ratio overlay by default', async ({ page }) => {
    const state = await getSafeAreasState(page);
    expect(state.aspectRatio).toBeNull();
  });

  test('SA-E021: setting 16:9 aspect ratio updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.setAspectRatio('16:9');
    });
    await page.waitForTimeout(100);

    const state = await getSafeAreasState(page);
    expect(state.aspectRatio).toBe('16:9');
  });

  test('SA-E022: setting 2.39:1 aspect ratio updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.setAspectRatio('2.39:1');
    });
    await page.waitForTimeout(100);

    const state = await getSafeAreasState(page);
    expect(state.aspectRatio).toBe('2.39:1');
  });

  test('SA-E023: clearing aspect ratio updates state', async ({ page }) => {
    // Set an aspect ratio first
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.setAspectRatio('16:9');
    });
    await page.waitForTimeout(100);

    // Clear it
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.setAspectRatio(null);
    });
    await page.waitForTimeout(100);

    const state = await getSafeAreasState(page);
    expect(state.aspectRatio).toBeNull();
  });
});

test.describe('Safe Areas UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SA-E030: safe areas control exists in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Look for safe areas control
    const control = page.locator('[data-testid="safe-areas-control"], button:has-text("Safe"), button:has-text("Guides")');
    await expect(control.first()).toBeVisible();
  });
});

test.describe('Safe Areas State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SA-E040: safe areas state persists when changing frames', async ({ page }) => {
    await page.keyboard.press(';');
    await page.waitForTimeout(100);

    let state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);
  });

  test('SA-E041: safe areas guide settings persist when changing frames', async ({ page }) => {
    await page.keyboard.press(';');
    await page.waitForTimeout(100);

    // Enable rule of thirds
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.safeAreasControl?.toggleRuleOfThirds();
    });
    await page.waitForTimeout(100);

    let state = await getSafeAreasState(page);
    expect(state.ruleOfThirds).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getSafeAreasState(page);
    expect(state.ruleOfThirds).toBe(true);
  });

  test('SA-E042: safe areas state persists when changing tabs', async ({ page }) => {
    await page.keyboard.press(';');
    await page.waitForTimeout(100);

    let state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);

    // Switch tabs
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);
  });
});

test.describe('Safe Areas HiDPI Scaling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable safe areas
    await page.keyboard.press(';');
    await page.waitForTimeout(100);
  });

  test('SA-E050: safe areas overlay canvas has correct CSS dimensions for HiDPI', async ({ page }) => {
    // This test ensures the canvas CSS dimensions match the viewer canvas
    // and physical dimensions scale properly with DPR
    const dimensionCheck = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="safe-areas-overlay"]') as HTMLCanvasElement;
      const viewerCanvas = document.querySelector('.viewer-container canvas:first-of-type') as HTMLCanvasElement;
      if (!overlay || !viewerCanvas) return null;

      const overlayRect = overlay.getBoundingClientRect();
      const viewerRect = viewerCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      return {
        overlayCssWidth: overlayRect.width,
        overlayCssHeight: overlayRect.height,
        viewerCssWidth: viewerRect.width,
        viewerCssHeight: viewerRect.height,
        overlayPhysicalWidth: overlay.width,
        overlayPhysicalHeight: overlay.height,
        dpr,
        // CSS dimensions should match viewer
        cssWidthMatches: Math.abs(overlayRect.width - viewerRect.width) < 2,
        cssHeightMatches: Math.abs(overlayRect.height - viewerRect.height) < 2,
        // Physical dimensions should be CSS * DPR
        physicalWidthMatchesDpr: Math.abs(overlay.width - overlayRect.width * dpr) < 2,
        physicalHeightMatchesDpr: Math.abs(overlay.height - overlayRect.height * dpr) < 2,
      };
    });

    expect(dimensionCheck).not.toBeNull();
    if (dimensionCheck) {
      // CSS dimensions should match viewer canvas
      expect(dimensionCheck.cssWidthMatches).toBe(true);
      expect(dimensionCheck.cssHeightMatches).toBe(true);
      // Physical dimensions should scale with DPR
      expect(dimensionCheck.physicalWidthMatchesDpr).toBe(true);
      expect(dimensionCheck.physicalHeightMatchesDpr).toBe(true);
    }
  });

  test('SA-E051: safe areas overlay is not oversized (regression test for HiDPI bug)', async ({ page }) => {
    // This test catches the bug where setStyle: false caused canvas to display at physical pixel size
    const dimensionCheck = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="safe-areas-overlay"]') as HTMLCanvasElement;
      const viewerCanvas = document.querySelector('.viewer-container canvas:first-of-type') as HTMLCanvasElement;
      if (!overlay || !viewerCanvas) return null;

      const overlayRect = overlay.getBoundingClientRect();
      const viewerRect = viewerCanvas.getBoundingClientRect();

      return {
        overlayCssWidth: overlayRect.width,
        overlayCssHeight: overlayRect.height,
        viewerCssWidth: viewerRect.width,
        viewerCssHeight: viewerRect.height,
        // Overlay should NOT be larger than viewer
        overlayNotOversizedWidth: overlayRect.width <= viewerRect.width + 2,
        overlayNotOversizedHeight: overlayRect.height <= viewerRect.height + 2,
      };
    });

    expect(dimensionCheck).not.toBeNull();
    if (dimensionCheck) {
      // Overlay canvas CSS size should not exceed viewer canvas CSS size
      expect(dimensionCheck.overlayNotOversizedWidth).toBe(true);
      expect(dimensionCheck.overlayNotOversizedHeight).toBe(true);
    }
  });

  test('SA-E052: matte overlay canvas has correct CSS dimensions for HiDPI', async ({ page }) => {
    // Enable matte overlay
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getMatteOverlay?.()?.enable?.();
    });
    await page.waitForTimeout(100);

    const dimensionCheck = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="matte-overlay"]') as HTMLCanvasElement;
      const viewerCanvas = document.querySelector('.viewer-container canvas:first-of-type') as HTMLCanvasElement;
      if (!overlay || !viewerCanvas) return null;

      const overlayRect = overlay.getBoundingClientRect();
      const viewerRect = viewerCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      return {
        overlayCssWidth: overlayRect.width,
        overlayCssHeight: overlayRect.height,
        viewerCssWidth: viewerRect.width,
        viewerCssHeight: viewerRect.height,
        dpr,
        // CSS dimensions should match viewer
        cssWidthMatches: Math.abs(overlayRect.width - viewerRect.width) < 2,
        cssHeightMatches: Math.abs(overlayRect.height - viewerRect.height) < 2,
        // Physical dimensions should be CSS * DPR
        physicalWidthMatchesDpr: Math.abs(overlay.width - overlayRect.width * dpr) < 2,
        physicalHeightMatchesDpr: Math.abs(overlay.height - overlayRect.height * dpr) < 2,
      };
    });

    expect(dimensionCheck).not.toBeNull();
    if (dimensionCheck) {
      // CSS dimensions should match viewer canvas
      expect(dimensionCheck.cssWidthMatches).toBe(true);
      expect(dimensionCheck.cssHeightMatches).toBe(true);
      // Physical dimensions should scale with DPR
      expect(dimensionCheck.physicalWidthMatchesDpr).toBe(true);
      expect(dimensionCheck.physicalHeightMatchesDpr).toBe(true);
    }
  });
});
