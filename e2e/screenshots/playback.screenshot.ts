/**
 * Playback Screenshots (43-47)
 *
 * Captures documentation-quality screenshots of playback features:
 * audio waveform, JKL speed indicator, loop modes, viewer navigation,
 * and image sequences.
 */

import { test, expect } from '@playwright/test';
import {
  initApp,
  initWithVideo,
  takeDocScreenshot,
  takeElementScreenshot,
  waitForCanvasStable,
} from './screenshot-helpers';

test.describe('Playback Screenshots', () => {
  // ── 43: Audio waveform on timeline ──────────────────────────────────

  test('43-audio-waveform', async ({ page }) => {
    await initWithVideo(page);

    // Wait for audio waveform to render on timeline
    await page.waitForTimeout(1000);

    // Capture the timeline region showing waveform
    const timeline = page.locator('.timeline-container').first();
    const box = await timeline.boundingBox();
    expect(box).toBeTruthy();

    await takeDocScreenshot(page, '43-audio-waveform', {
      clip: {
        x: Math.floor(box!.x),
        y: Math.max(0, Math.floor(box!.y) - 20),
        width: Math.floor(box!.width),
        height: Math.floor(box!.height) + 40,
      },
    });
  });

  // ── 44: JKL speed indicator ─────────────────────────────────────────

  test('44-jkl-speed', async ({ page }) => {
    await initWithVideo(page);

    // Press L twice to set 2x forward speed
    await page.keyboard.press('l');
    await page.waitForTimeout(200);
    await page.keyboard.press('l');
    await page.waitForTimeout(500);

    // Pause playback but keep speed indicator showing
    await page.keyboard.press('k');
    await page.waitForTimeout(300);

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '44-jkl-speed');
  });

  // ── 45: Loop mode button ────────────────────────────────────────────

  test('45-loop-mode', async ({ page }) => {
    await initWithVideo(page);

    // Cycle loop mode to ping-pong using the loop button (title="Cycle loop mode (L)")
    const loopButton = page.locator('button[title*="loop mode"], button[title*="Loop"]').first();
    if (await loopButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Click to cycle: once -> loop, twice -> pingpong
      await loopButton.click();
      await page.waitForTimeout(200);
      await loopButton.click();
      await page.waitForTimeout(300);
    } else {
      // Fallback: use test helper to set loop mode
      await page.evaluate(() => {
        (window as any).__OPENRV_TEST__?.setLoopMode?.('pingpong');
      });
      await page.waitForTimeout(300);
    }

    await takeDocScreenshot(page, '45-loop-mode');
  });

  // ── 46: Viewer zoomed in (pan/zoom navigation) ─────────────────────

  test('46-viewer-zoomed', async ({ page }) => {
    await initWithVideo(page);

    // Zoom to 200% using Ctrl+2 (view.zoom2to1 -> Ctrl+Digit2)
    await page.keyboard.press('Control+2');
    await page.waitForTimeout(500);

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '46-viewer-zoomed');
  });

  // ── 47: Image sequence loaded ───────────────────────────────────────

  test('47-image-sequence', async ({ page }) => {
    await initApp(page);

    // Load image sequence from sample directory via file input
    // Use the test helper if available
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.loadSequence?.('sample/sequence/');
    });
    await page.waitForTimeout(1000);

    // Fallback: try loading via file input if test helper didn't work
    const hasMedia = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getSessionState?.()?.hasMedia;
    });

    if (!hasMedia) {
      // Try loading a single sequence frame which may trigger sequence detection
      const fileInput = page.locator('input[type="file"]').first();
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles('sample/sequence/frame_0001.png');
        await page.waitForTimeout(2000);
      }
    }

    await waitForCanvasStable(page, 3000);
    await takeDocScreenshot(page, '47-image-sequence');
  });
});
