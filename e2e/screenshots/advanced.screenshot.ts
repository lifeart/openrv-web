/**
 * Advanced Feature Screenshots (53-58)
 *
 * Captures documentation-quality screenshots of advanced features:
 * filters panel, transform controls, playlist panel, quad view,
 * OCIO panel, and EXR layer selector.
 */

import { test, expect } from '@playwright/test';
import { initApp, initWithVideo, takeDocScreenshot, switchTab, waitForCanvasStable } from './screenshot-helpers';
import { loadTwoVideoFiles, loadExrFile } from '../fixtures';

test.describe('Advanced Feature Screenshots', () => {
  // ── 53: Filters panel ───────────────────────────────────────────────

  test('53-filters-panel', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'effects');
    await page.waitForTimeout(300);

    // Open filters panel via Shift+Alt+E or click button
    const filterButton = page
      .locator('[data-testid="filter-control-button"], button:has-text("Filter"), [title*="Filter"]')
      .first();
    if (await filterButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filterButton.click();
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Shift+Alt+e');
      await page.waitForTimeout(500);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '53-filters-panel');
  });

  // ── 54: Transform controls (crop/rotation) ─────────────────────────

  test('54-transform-controls', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'transform');
    await page.waitForTimeout(300);

    // Enable crop mode via toolbar button (data-testid="crop-control-button")
    const cropButton = page
      .locator('[data-testid="crop-control-button"], button:has-text("Crop"), [title*="Crop"]')
      .first();
    if (await cropButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cropButton.click();
      await page.waitForTimeout(500);
    } else {
      // Fallback: enable crop via test helper
      await page.evaluate(() => {
        (window as any).__OPENRV_TEST__?.enableCrop?.();
      });
      await page.waitForTimeout(500);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '54-transform-controls');
  });

  // ── 55: Playlist panel ──────────────────────────────────────────────

  test('55-playlist-panel', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // Open playlist panel
    const playlistButton = page
      .locator('[data-testid="playlist-panel"], button:has-text("Playlist"), [title*="Playlist"]')
      .first();
    if (await playlistButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await playlistButton.click();
      await page.waitForTimeout(500);
    } else {
      // Try via test helper or keyboard shortcut
      await page.evaluate(() => {
        (window as any).__OPENRV_TEST__?.togglePlaylist?.();
      });
      await page.waitForTimeout(500);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '55-playlist-panel');
  });

  // ── 56: Quad view comparison ────────────────────────────────────────

  test('56-quad-view', async ({ page }) => {
    await initApp(page);
    await loadTwoVideoFiles(page);
    await waitForCanvasStable(page);

    // First open the compare control dropdown
    const compareButton = page.locator('[data-testid="compare-control-button"]').first();
    if (await compareButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await compareButton.click();
      await page.waitForTimeout(500);

      // Now click quad-view-toggle inside the dropdown
      const quadToggle = page.locator('[data-testid="quad-view-toggle"]').first();
      if (await quadToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
        await quadToggle.click();
        await page.waitForTimeout(500);
      }
    } else {
      // Cycle wipe mode to quad: Shift+W multiple times
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Shift+w');
        await page.waitForTimeout(300);
      }
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '56-quad-view');
  });

  // ── 57: OCIO panel ─────────────────────────────────────────────────

  test('57-ocio-panel', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');
    await page.waitForTimeout(300);

    // Open OCIO panel via Shift+O or click button
    const ocioButton = page
      .locator('[data-testid="ocio-panel-button"], button:has-text("OCIO"), [title*="OCIO"], [title*="OpenColorIO"]')
      .first();
    if (await ocioButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ocioButton.click();
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Shift+o');
      await page.waitForTimeout(500);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '57-ocio-panel');
  });

  // ── 58: EXR layer selector ──────────────────────────────────────────

  test('58-exr-layers', async ({ page }) => {
    await initApp(page);

    // Load multilayer EXR specifically (not the single-layer test_hdr.exr)
    const path = await import('path');
    const filePath = path.default.resolve(process.cwd(), 'sample/test_multilayer.exr');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(3000);
    await waitForCanvasStable(page, 3000);

    // Open the EXR layer selector dropdown (data-testid="exr-layer-button")
    const layerButton = page.locator('[data-testid="exr-layer-button"]').first();
    if (await layerButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await layerButton.click();
      await page.waitForTimeout(500);
    }

    await takeDocScreenshot(page, '58-exr-layers');
  });
});
