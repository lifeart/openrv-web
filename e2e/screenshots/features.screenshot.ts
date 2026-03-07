/**
 * Feature Screenshots (18-25)
 *
 * Captures documentation-quality screenshots of specific features:
 * channel isolation, A/B split screen, annotations, keyboard shortcuts,
 * EXR/HDR content, tone mapping, curves editor, zebra stripes, safe areas.
 */

import { test, expect } from '@playwright/test';
import {
  initApp,
  initWithVideo,
  takeDocScreenshot,
  switchTab,
  waitForCanvasStable,
} from './screenshot-helpers';
import {
  loadExrFile,
  loadTwoVideoFiles,
} from '../fixtures';

test.describe('Feature Screenshots', () => {
  // ── 18: Channel isolation (R/G/B/Luma) ───────────────────────────────

  test('18-channel-red', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'view');

    // Shift+R selects red channel (channel.red -> Shift+KeyR)
    await page.keyboard.press('Shift+r');
    await page.waitForTimeout(300);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '18-channel-red');
  });

  test('18-channel-green', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'view');

    // Shift+G selects green channel
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(300);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '18-channel-green');
  });

  test('18-channel-blue', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'view');

    // Shift+B selects blue channel
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(300);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '18-channel-blue');
  });

  test('18-channel-luma', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'view');

    // Shift+L selects luminance channel
    await page.keyboard.press('Shift+l');
    await page.waitForTimeout(300);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '18-channel-luma');
  });

  // ── 19: A/B split screen ─────────────────────────────────────────────

  test('19-ab-split-screen', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // Shift+W cycles wipe mode (view.cycleWipeMode -> Shift+KeyW)
    await page.keyboard.press('Shift+w');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '19-ab-split-screen');
  });

  // ── 20: Annotations with paint tools ─────────────────────────────────

  test('20-annotations', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'annotate');
    await page.waitForTimeout(300);

    // Select pen tool by pressing 'p' (paint.pen -> KeyP)
    await page.keyboard.press('p');
    await page.waitForTimeout(200);

    // Draw some strokes on the canvas
    const canvas = page.locator('.viewer-container').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Draw a diagonal stroke
    await page.mouse.move(cx - 100, cy - 50);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 50, { steps: 10 });
    await page.mouse.up();

    // Draw a horizontal stroke
    await page.mouse.move(cx - 80, cy + 20);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 20, { steps: 8 });
    await page.mouse.up();

    await page.waitForTimeout(300);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '20-annotations');
  });

  // ── 21: Keyboard shortcuts overlay ───────────────────────────────────

  test('21-keyboard-shortcuts', async ({ page }) => {
    await initApp(page);

    // Shift+/ (?) opens the keyboard shortcuts cheat sheet
    // (help.toggleCheatSheet -> Shift+Slash)
    await page.keyboard.press('Shift+/');
    await page.waitForTimeout(500);

    await takeDocScreenshot(page, '21-keyboard-shortcuts');
  });

  // ── 22: EXR loaded (HDR content) ─────────────────────────────────────

  test('22-exr-loaded', async ({ page }) => {
    await initApp(page);
    await loadExrFile(page);
    await waitForCanvasStable(page, 3000);

    await takeDocScreenshot(page, '22-exr-loaded');
  });

  // ── 23: Tone mapping dropdown ────────────────────────────────────────

  test('23-tone-mapping', async ({ page }) => {
    await initApp(page);
    await loadExrFile(page);
    await waitForCanvasStable(page, 3000);

    // Switch to QC tab where tone mapping controls live
    await switchTab(page, 'qc');
    await page.waitForTimeout(300);

    // Look for tone mapping control button and click it
    const tmButton = page.locator(
      '[data-testid="tone-mapping-control-button"], [data-testid="tone-mapping-button"], .tone-mapping-control button',
    ).first();
    if (await tmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tmButton.click();
      await page.waitForTimeout(300);
    }

    await takeDocScreenshot(page, '23-tone-mapping');
  });

  // ── 24: Curves editor ───────────────────────────────────────────────

  test('24-curves-editor', async ({ page }) => {
    await initWithVideo(page);

    // 'u' toggles the curves panel (panel.curves -> KeyU)
    await page.keyboard.press('u');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '24-curves-editor');
  });

  // ── 25: Zebra stripes ────────────────────────────────────────────────

  test('25-zebra-stripes', async ({ page }) => {
    await initWithVideo(page);

    // Enable zebra stripes via keyboard shortcut (Shift+Alt+Z)
    await page.keyboard.press('Shift+Alt+KeyZ');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '25-zebra-stripes');
  });

  // ── 25: Safe areas ──────────────────────────────────────────────────

  test('25-safe-areas', async ({ page }) => {
    await initWithVideo(page);

    // Enable safe areas via QC tab button
    await page.locator('[data-tab-id="qc"]').click().catch(() => {});
    await page.waitForTimeout(300);
    // Click safe areas toggle if available
    await page.locator('button:has-text("Safe"), [title*="Safe Area"], [aria-label*="Safe"]').first().click().catch(() => {
      // Fallback: try via test helper
      return page.evaluate(() => {
        (window as any).__OPENRV_TEST__?.toggleSafeAreasTitleSafe?.();
      });
    });
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '25-safe-areas');
  });
});
