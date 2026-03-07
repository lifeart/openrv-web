/**
 * Export Screenshots (48-52)
 *
 * Captures documentation-quality screenshots of export features:
 * frame export menu, video export menu, slate editor (via video export flow),
 * session save, and annotation export options.
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
  loadTwoVideoFiles,
} from '../fixtures';

test.describe('Export Screenshots', () => {
  // ── 48: Frame export menu ───────────────────────────────────────────

  test('48-frame-export-dialog', async ({ page }) => {
    await initWithVideo(page);

    // Open the export dropdown via the export button (title="Export current frame (Ctrl+S)")
    const exportButton = page.locator(
      '[title*="Export"], [aria-label*="Export"], .export-control-container button',
    ).first();
    await exportButton.click();
    await page.waitForTimeout(500);

    // The export dropdown should now be visible showing all export options
    await page.locator('.export-dropdown').first().waitFor({ state: 'visible', timeout: 3000 });

    await takeDocScreenshot(page, '48-frame-export-dialog');
  });

  // ── 49: Video export (trigger export, capture progress dialog) ──────

  test('49-video-export-dialog', async ({ page }) => {
    await initWithVideo(page);

    // Open export dropdown
    const exportButton = page.locator(
      '[title*="Export"], [aria-label*="Export"], .export-control-container button',
    ).first();
    await exportButton.click();
    await page.waitForTimeout(300);

    // Click video export option
    const videoExportOption = page.locator(
      '.export-dropdown >> text=Export MP4',
    ).first();
    if (await videoExportOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await videoExportOption.click();
      await page.waitForTimeout(1000);
    }

    // Wait for the export progress dialog
    await page.locator(
      '[data-testid="export-progress-status"]',
    ).first().waitFor({ timeout: 5000 }).catch(() => {});

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '49-video-export-dialog');
  });

  // ── 50: Annotation export options visible in dropdown ───────────────

  test('50-slate-editor', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'annotate');

    // Draw a quick annotation so export options are meaningful
    await page.keyboard.press('p');
    await page.waitForTimeout(200);

    const canvas = page.locator('.viewer-container').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx - 50, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Open the export dropdown
    const exportButton = page.locator(
      '[title*="Export"], [aria-label*="Export"], .export-control-container button',
    ).first();
    await exportButton.click();
    await page.waitForTimeout(500);

    // Scroll the dropdown to show annotations section if needed
    await page.locator('.export-dropdown').first().waitFor({ state: 'visible', timeout: 3000 });

    await takeDocScreenshot(page, '50-slate-editor');
  });

  // ── 51: Session save via Ctrl+Shift+S ───────────────────────────────

  test('51-session-save', async ({ page }) => {
    await initWithVideo(page);

    // Add some state to make the save meaningful
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Open export dropdown and show session section
    const exportButton = page.locator(
      '[title*="Export"], [aria-label*="Export"], .export-control-container button',
    ).first();
    await exportButton.click();
    await page.waitForTimeout(500);

    await page.locator('.export-dropdown').first().waitFor({ state: 'visible', timeout: 3000 });

    await takeDocScreenshot(page, '51-session-save');
  });

  // ── 52: Playlist panel with EDL export button ───────────────────────

  test('52-edl-export', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // Open playlist panel which contains EDL export
    const playlistButton = page.locator(
      '[data-testid="playlist-panel"], button:has-text("Playlist"), [title*="Playlist"]',
    ).first();
    if (await playlistButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await playlistButton.click();
      await page.waitForTimeout(500);
    } else {
      await page.evaluate(() => {
        (window as any).__OPENRV_TEST__?.togglePlaylist?.();
      });
      await page.waitForTimeout(500);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '52-edl-export');
  });
});
