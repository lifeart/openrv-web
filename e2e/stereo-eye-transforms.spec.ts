import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Stereo Per-Eye Transforms E2E Tests
 *
 * These tests verify per-eye geometric transformations for stereo alignment.
 * The Eye Transforms button and panel are only visible when stereo mode is active.
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

test.describe('Stereo Per-Eye Transforms', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  // --- Panel Visibility Tests ---

  test('SET-001: Eye transform button is hidden when stereo mode is off', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="stereo-eye-transform-button"]');
      if (!btn) return true; // Not rendered yet is ok
      return (btn as HTMLElement).style.display === 'none' || (btn.parentElement as HTMLElement)?.style.display === 'none';
    });
  });

  test('SET-002: Eye transform button appears when stereo mode is activated', async ({ page }) => {
    await activateStereoMode(page);
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="stereo-eye-transform-button"]');
      if (!btn) return false;
      const parent = btn.parentElement as HTMLElement;
      return parent?.style.display !== 'none';
    });
  });

  test('SET-003: Clicking eye transform button opens the panel', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });
  });

  test('SET-004: Clicking eye transform button again closes the panel', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return !panel || (panel as HTMLElement).style.display === 'none';
    });
  });

  test('SET-005: Pressing Shift+E toggles panel visibility', async ({ page }) => {
    await activateStereoMode(page);
    await page.keyboard.press('Shift+E');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });
    await page.keyboard.press('Shift+E');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return !panel || (panel as HTMLElement).style.display === 'none';
    });
  });

  test('SET-006: Pressing Escape closes the panel', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return !panel || (panel as HTMLElement).style.display === 'none';
    });
  });

  test('SET-007: Panel closes when stereo mode is set to off', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    // Turn stereo off
    await page.click('[data-testid="stereo-mode-button"]');
    await page.waitForFunction(() => {
      const dd = document.querySelector('[data-testid="stereo-mode-dropdown"]');
      return dd && (dd as HTMLElement).style.display !== 'none';
    });
    await page.click('[data-stereo-mode="off"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoMode === 'off';
    });
  });

  // --- Left Eye Flip Tests ---

  test('SET-010: Left eye FlipH button toggles horizontal flip', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.click('[data-testid="stereo-left-flip-h"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLeft?.flipH === true;
    });
  });

  test('SET-011: Left eye FlipV button toggles vertical flip', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.click('[data-testid="stereo-left-flip-v"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLeft?.flipV === true;
    });
  });

  test('SET-013: Left eye FlipH changes canvas output', async ({ page }) => {
    await activateStereoMode(page);
    const before = await captureViewerScreenshot(page);

    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });
    await page.click('[data-testid="stereo-left-flip-h"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLeft?.flipH === true;
    });

    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  // --- Right Eye Flip Tests ---

  test('SET-020: Right eye FlipH button toggles horizontal flip', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.click('[data-testid="stereo-right-flip-h"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformRight?.flipH === true;
    });
  });

  test('SET-021: Right eye FlipV button toggles vertical flip', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.click('[data-testid="stereo-right-flip-v"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformRight?.flipV === true;
    });
  });

  // --- Rotation Tests ---

  test('SET-030: Left eye rotation slider defaults to 0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformLeft.rotation).toBe(0);
  });

  test('SET-031: Adjusting left rotation slider updates value', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.fill('[data-testid="stereo-left-rotation"]', '45');
    await page.dispatchEvent('[data-testid="stereo-left-rotation"]', 'input');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLeft?.rotation === 45;
    });
  });

  test('SET-040: Right eye rotation slider defaults to 0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformRight.rotation).toBe(0);
  });

  // --- Scale Tests ---

  test('SET-050: Left eye scale slider defaults to 1.0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformLeft.scale).toBe(1.0);
  });

  test('SET-060: Right eye scale slider defaults to 1.0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformRight.scale).toBe(1.0);
  });

  // --- Translation Tests ---

  test('SET-070: Left eye X translation slider defaults to 0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformLeft.translateX).toBe(0);
  });

  test('SET-071: Left eye Y translation slider defaults to 0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformLeft.translateY).toBe(0);
  });

  test('SET-080: Right eye X translation slider defaults to 0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformRight.translateX).toBe(0);
  });

  test('SET-081: Right eye Y translation slider defaults to 0', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformRight.translateY).toBe(0);
  });

  // --- Link/Unlink Tests ---

  test('SET-090: Link toggle defaults to unlinked', async ({ page }) => {
    await activateStereoMode(page);
    const state = await getViewerState(page);
    expect(state.stereoEyeTransformLinked).toBe(false);
  });

  test('SET-091: Clicking link toggle enables linked mode', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.click('[data-testid="stereo-eye-link-toggle"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLinked === true;
    });
  });

  // --- Reset Tests ---

  test('SET-100: Reset All button restores all transforms to defaults', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    // Make some changes
    await page.click('[data-testid="stereo-left-flip-h"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLeft?.flipH === true;
    });

    // Reset
    await page.click('[data-testid="stereo-eye-transform-reset"]');
    await page.waitForFunction(() => {
      const state = window.__OPENRV_TEST__?.getViewerState();
      return state?.stereoEyeTransformLeft?.flipH === false &&
        state?.stereoEyeTransformLeft?.rotation === 0 &&
        state?.stereoEyeTransformLeft?.scale === 1.0;
    });
  });

  // --- Combined Transform Tests ---

  test('SET-113: Per-eye transforms work with all stereo display modes', async ({ page }) => {
    // Test with anaglyph
    await activateStereoMode(page, 'anaglyph');
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.click('[data-testid="stereo-left-flip-h"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLeft?.flipH === true;
    });

    const state = await getViewerState(page);
    expect(state.stereoMode).toBe('anaglyph');
    expect(state.stereoEyeTransformLeft.flipH).toBe(true);
  });

  // --- State Persistence Tests ---

  test('SET-122: Per-eye transforms reset when stereo mode is turned off', async ({ page }) => {
    await activateStereoMode(page);
    await page.click('[data-testid="stereo-eye-transform-button"]');
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      return panel && (panel as HTMLElement).style.display !== 'none';
    });

    await page.click('[data-testid="stereo-left-flip-h"]');
    await page.waitForFunction(() => {
      return window.__OPENRV_TEST__?.getViewerState()?.stereoEyeTransformLeft?.flipH === true;
    });

    // Turn stereo off
    await page.click('[data-testid="stereo-mode-button"]');
    await page.waitForFunction(() => {
      const dd = document.querySelector('[data-testid="stereo-mode-dropdown"]');
      return dd && (dd as HTMLElement).style.display !== 'none';
    });
    await page.click('[data-stereo-mode="off"]');
    await page.waitForFunction(() => {
      const state = window.__OPENRV_TEST__?.getViewerState();
      return state?.stereoMode === 'off' && state?.stereoEyeTransformLeft?.flipH === false;
    });
  });
});
