/**
 * Comparison & Gamut Screenshots (34-38)
 *
 * Captures documentation-quality screenshots of comparison features:
 * A/B switching, split screen, difference matte, blend modes / onion skin,
 * and the CIE gamut diagram scope.
 */

import { test } from '@playwright/test';
import {
  initApp,
  initWithVideo,
  takeDocScreenshot,
  switchTab,
  waitForCanvasStable,
} from './screenshot-helpers';
import {
  loadTwoVideoFiles,
} from '../fixtures';

test.describe('Comparison & Gamut Screenshots', () => {
  // ── 34: A/B switching UI ──────────────────────────────────────────

  test('34-ab-switching', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // Toggle to source B using backtick (view.toggleAB -> Backquote)
    await page.keyboard.press('`');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '34-ab-switching');
  });

  // ── 35: Split screen comparison ───────────────────────────────────

  test('35-split-screen', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // Shift+Alt+S toggles split screen (view.toggleSplitScreen -> Shift+Alt+KeyS)
    await page.keyboard.press('Shift+Alt+s');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '35-split-screen');
  });

  // ── 36: Difference matte ──────────────────────────────────────────

  test('36-difference-matte', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // Shift+D toggles difference matte (view.toggleDifferenceMatte -> Shift+KeyD)
    await page.keyboard.press('Shift+d');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '36-difference-matte');
  });

  // ── 37: Blend mode / onion skin ───────────────────────────────────

  test('37-blend-modes', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // Toggle ghost frames / onion skin (view.toggleGhostFrames -> Ctrl+KeyG)
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(500);

    // Also try clicking the onion skin button in the compare dropdown
    const onionButton = page.locator(
      '[data-testid="onion-skin-button"], button:has-text("Onion"), [title*="Onion"]',
    ).first();
    if (await onionButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await onionButton.click();
      await page.waitForTimeout(300);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '37-blend-modes');
  });

  // ── 38: Gamut diagram scope ───────────────────────────────────────

  test('38-gamut-diagram', async ({ page }) => {
    await initWithVideo(page);

    // Open the gamut diagram panel
    // panel.gamutDiagram is bound to KeyG in 'panel' context
    // Try clicking the gamut button or using keyboard
    await switchTab(page, 'qc');
    await page.waitForTimeout(300);

    const gamutButton = page.locator(
      '[data-testid="gamut-diagram-button"], button:has-text("Gamut"), [title*="Gamut"], [title*="CIE"]',
    ).first();
    if (await gamutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await gamutButton.click();
      await page.waitForTimeout(500);
    } else {
      // Fallback: try pressing 'g' which may activate panel.gamutDiagram
      await page.keyboard.press('g');
      await page.waitForTimeout(500);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '38-gamut-diagram');
  });
});
