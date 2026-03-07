/**
 * Core UI Screenshots (01-10)
 *
 * Captures documentation-quality screenshots of the main UI elements:
 * empty state, loaded video, header bar, each toolbar tab, color panel,
 * and timeline with markers.
 */

import { test, expect } from '@playwright/test';
import {
  initApp,
  initWithVideo,
  takeDocScreenshot,
  takeElementScreenshot,
  switchTab,
  waitForCanvasStable,
} from './screenshot-helpers';

test.describe('Core UI Screenshots', () => {
  // ── 01: Empty app state ──────────────────────────────────────────────

  test('01-empty-app', async ({ page }) => {
    await initApp(page);
    await takeDocScreenshot(page, '01-empty-app');
  });

  // ── 02: Video loaded (full UI) ───────────────────────────────────────

  test('02-video-loaded', async ({ page }) => {
    await initWithVideo(page);
    await takeDocScreenshot(page, '02-video-loaded');
  });

  // ── 03: Header bar close-up ──────────────────────────────────────────

  test('03-header-bar', async ({ page }) => {
    await initWithVideo(page);

    const headerBar = page.locator('.header-bar').first();
    const box = await headerBar.boundingBox();
    expect(box).toBeTruthy();

    await takeDocScreenshot(page, '03-header-bar', {
      clip: {
        x: Math.floor(box!.x),
        y: Math.floor(box!.y),
        width: Math.floor(box!.width),
        height: Math.floor(box!.height),
      },
    });
  });

  // ── 04: View tab toolbar ─────────────────────────────────────────────

  test('04-tab-view', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'view');
    await takeDocScreenshot(page, '04-tab-view');
  });

  // ── 05: Color tab toolbar ────────────────────────────────────────────

  test('05-tab-color', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');
    await takeDocScreenshot(page, '05-tab-color');
  });

  // ── 06: Effects tab toolbar ──────────────────────────────────────────

  test('06-tab-effects', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'effects');
    await takeDocScreenshot(page, '06-tab-effects');
  });

  // ── 07: Transform tab toolbar ────────────────────────────────────────

  test('07-tab-transform', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'transform');
    await takeDocScreenshot(page, '07-tab-transform');
  });

  // ── 08: Annotate tab toolbar ─────────────────────────────────────────

  test('08-tab-annotate', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'annotate');
    await takeDocScreenshot(page, '08-tab-annotate');
  });

  // ── 09: Color controls panel expanded ────────────────────────────────

  test('09-color-panel', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');

    // 'c' toggles the color controls panel (panel.color -> KeyC)
    await page.keyboard.press('c');
    // Wait for the panel to appear
    await page.waitForSelector('.color-controls-panel', { timeout: 3000 });
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '09-color-panel');
  });

  // ── 10: Timeline with markers ────────────────────────────────────────

  test('10-timeline-markers', async ({ page }) => {
    await initWithVideo(page);

    // Add markers via keyboard shortcut (M to toggle mark at current frame)
    // Seek to different frames and mark each one
    for (const frame of [10, 30, 50, 70]) {
      await page.evaluate((f) => {
        window.__OPENRV_TEST__?.seekToFrame?.(f);
      }, frame);
      await page.waitForTimeout(200);
      await page.keyboard.press('m');
      await page.waitForTimeout(100);
    }

    // Wait for markers to render
    await page.waitForTimeout(500);

    // Capture the timeline region
    const timeline = page.locator('.timeline-container').first();
    const box = await timeline.boundingBox();
    expect(box).toBeTruthy();

    await takeDocScreenshot(page, '10-timeline-markers', {
      clip: {
        x: Math.floor(box!.x),
        y: Math.max(0, Math.floor(box!.y) - 10),
        width: Math.floor(box!.width),
        height: Math.floor(box!.height) + 20,
      },
    });
  });
});
