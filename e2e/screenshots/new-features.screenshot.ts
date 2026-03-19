/**
 * New Feature Screenshots (59-67)
 *
 * Captures documentation-quality screenshots of newly added features:
 * spotlight overlay, info strip overlay, FPS indicator, presence overlay,
 * remote cursors overlay, representation selector, shot status badge,
 * display profile indicator, and contextual shortcuts editor.
 */

import { test } from '@playwright/test';
import {
  initApp,
  initWithVideo,
  takeDocScreenshot,
  takeElementScreenshot,
  waitForCanvasStable,
} from './screenshot-helpers';

test.describe('New Feature Screenshots', () => {
  // ── 59: Spotlight Overlay (circle) ──────────────────────────────────

  test('59-spotlight-overlay', async ({ page }) => {
    await initWithVideo(page);

    // Enable the spotlight overlay with a circular shape, centered
    await page.evaluate(() => {
      const viewer = (window as any).__OPENRV_TEST_APP__?.viewer;
      const spotlight = viewer?.getSpotlightOverlay?.();
      if (spotlight) {
        spotlight.setState({
          enabled: true,
          shape: 'circle',
          x: 0.5,
          y: 0.5,
          width: 0.2,
          height: 0.2,
          dimAmount: 0.7,
          feather: 0.05,
        });
      }
    });
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '59-spotlight-overlay');
  });

  // ── 60: Info Strip Overlay ──────────────────────────────────────────

  test('60-info-strip-overlay', async ({ page }) => {
    await initWithVideo(page);

    // Enable the info strip overlay at the bottom of the viewer
    await page.evaluate(() => {
      const viewer = (window as any).__OPENRV_TEST_APP__?.viewer;
      const infoStrip = viewer?.getInfoStripOverlay?.();
      if (infoStrip) {
        infoStrip.setState({ enabled: true, showFullPath: false });
      }
    });
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '60-info-strip-overlay');
  });

  // ── 61: FPS Indicator ──────────────────────────────────────────────

  test('61-fps-indicator', async ({ page }) => {
    await initWithVideo(page);

    // Enable the FPS indicator and force it visible with mock data
    await page.evaluate(() => {
      const viewer = (window as any).__OPENRV_TEST_APP__?.viewer;
      const fps = viewer?.getFPSIndicator?.();
      if (fps) {
        fps.setState({
          enabled: true,
          position: 'top-right',
          showDroppedFrames: true,
          showTargetFps: true,
        });
        // Force the container visible (normally only shown during playback)
        const el = fps.getElement();
        if (el) el.style.display = 'block';
      }
    });
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '61-fps-indicator');
  });

  // ── 62: Presence Overlay ───────────────────────────────────────────

  test('62-presence-overlay', async ({ page }) => {
    await initWithVideo(page);

    // Show the presence overlay with mock users
    await page.evaluate(() => {
      const viewer = (window as any).__OPENRV_TEST_APP__?.viewer;
      const presence = viewer?.getPresenceOverlay?.();
      if (presence) {
        presence.show();
        presence.setUsers([
          { id: 'user-1', name: 'Alice', color: '#3b82f6' },
          { id: 'user-2', name: 'Bob', color: '#ef4444' },
          { id: 'user-3', name: 'Carol', color: '#22c55e' },
        ]);
      }
    });
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '62-presence-overlay');
  });

  // ── 63: Remote Cursors Overlay ─────────────────────────────────────

  test('63-remote-cursors-overlay', async ({ page }) => {
    await initWithVideo(page);

    // Activate the remote cursors overlay with mock cursor positions
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST_APP__;
      const overlay = app?.remoteCursorsOverlay;
      if (overlay) {
        overlay.setViewerDimensions(1440, 900);
        overlay.setActive(true);
        overlay.setUsers([
          { id: 'user-a', name: 'Alice', color: '#3b82f6' },
          { id: 'user-b', name: 'Bob', color: '#ef4444' },
        ]);
        overlay.updateCursor({ userId: 'user-a', x: 0.3, y: 0.4 });
        overlay.updateCursor({ userId: 'user-b', x: 0.6, y: 0.6 });
      }
    });
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '63-remote-cursors-overlay');
  });

  // ── 64: Representation Selector ────────────────────────────────────

  test('64-representation-selector', async ({ page }) => {
    await initWithVideo(page);

    // The representation selector only appears when a source has multiple
    // representations. Force-show the container for the screenshot.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="representation-selector"]') as HTMLElement;
      if (el) {
        el.style.display = 'flex';
      }
    });
    await page.waitForTimeout(300);

    // Click the selector button to open the dropdown (if visible)
    const selectorBtn = page.locator('[data-testid="representation-selector-button"]').first();
    if (await selectorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await selectorBtn.click();
      await page.waitForTimeout(500);
    }

    await takeDocScreenshot(page, '64-representation-selector');
  });

  // ── 65: Shot Status Badge ──────────────────────────────────────────

  test('65-shot-status-badge', async ({ page }) => {
    await initWithVideo(page);

    // Click the shot status badge to open the status dropdown
    const badge = page.locator('[data-testid="shot-status-badge"]').first();
    if (await badge.isVisible({ timeout: 2000 }).catch(() => false)) {
      await badge.click();
      await page.waitForTimeout(500);

      await takeDocScreenshot(page, '65-shot-status-badge');
    } else {
      // Badge may not be visible without a source; take screenshot of header area
      await takeDocScreenshot(page, '65-shot-status-badge');
    }
  });

  // ── 66: Display Profile Indicator ──────────────────────────────────

  test('66-display-profile-indicator', async ({ page }) => {
    await initWithVideo(page);

    // Enable the display profile indicator overlay
    await page.evaluate(() => {
      const viewer = (window as any).__OPENRV_TEST_APP__?.viewer;
      const indicator = viewer?.overlayManager?.getDisplayProfileIndicator?.();
      if (indicator) {
        indicator.setState({ enabled: true, backgroundOpacity: 0.5 });
        // Force full opacity for the screenshot
        const el = indicator.getElement();
        if (el) el.style.opacity = '1';
      }
    });
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '66-display-profile-indicator');
  });

  // ── 67: Contextual Shortcuts Editor ────────────────────────────────

  test('67-contextual-shortcuts', async ({ page }) => {
    await initApp(page);

    // Open the keyboard shortcuts cheat sheet via Shift+?
    await page.keyboard.press('Shift+/');
    await page.waitForTimeout(500);

    // If there is a search input, type a filter to show contextual behavior
    const searchInput = page
      .locator('.cheatsheet-overlay input[type="text"], .cheatsheet-overlay input[type="search"]')
      .first();
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.fill('play');
      await page.waitForTimeout(300);
    }

    await takeDocScreenshot(page, '67-contextual-shortcuts');
  });
});
