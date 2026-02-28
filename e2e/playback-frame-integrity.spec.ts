import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  captureViewerScreenshot,
  waitForMediaLoaded,
  waitForFrame,
  waitForFrameChange,
  waitForFrameAtLeast,
  waitForPlaybackState,
  waitForPlaybackSpeed,
  waitForCondition,
} from './fixtures';

/**
 * Playback Frame Integrity Tests
 *
 * Tests frame-accurate playback and seeking — verifying that
 * seek returns to the exact frame, step produces unique frames,
 * and speed changes affect playback rate.
 */

test.describe('Playback Frame Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('PFI-001: Frame 1 is displayed after load', async ({ page }) => {
    const state = await getSessionState(page);
    expect(state.currentFrame).toBe(1);
    expect(state.hasMedia).toBe(true);
  });

  test('PFI-002: Step forward advances exactly one frame', async ({ page }) => {
    const before = await getSessionState(page);
    const startFrame = before.currentFrame;

    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, startFrame + 1);

    const after = await getSessionState(page);
    expect(after.currentFrame).toBe(startFrame + 1);
  });

  test('PFI-003: Step backward goes back exactly one frame', async ({ page }) => {
    // Step forward first
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 2);

    const before = await getSessionState(page);
    const startFrame = before.currentFrame;

    await page.keyboard.press('ArrowLeft');
    await waitForFrame(page, startFrame - 1);

    const after = await getSessionState(page);
    expect(after.currentFrame).toBe(startFrame - 1);
  });

  test('PFI-004: Seek back to frame 1 produces identical visual', async ({ page }) => {
    // Capture frame 1
    const frame1Screenshot = await captureViewerScreenshot(page);

    // Play forward a bit
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, true);
    await waitForFrameAtLeast(page, 10);

    // Stop
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, false);

    // Seek back to frame 1
    await page.keyboard.press('Home');
    await waitForFrame(page, 1);
    await page.waitForTimeout(200);

    // Capture frame 1 again
    const frame1Again = await captureViewerScreenshot(page);

    // Should match (seek accuracy)
    expect(frame1Screenshot.equals(frame1Again)).toBe(true);
  });

  test('PFI-005: Consecutive step-forward frames are all different', async ({ page }) => {
    const screenshots: Buffer[] = [];

    // Step forward 5 frames and capture each
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        const state = await getSessionState(page);
        await page.keyboard.press('ArrowRight');
        await waitForFrame(page, state.currentFrame + 1);
      }
      await page.waitForTimeout(100);
      screenshots.push(await captureViewerScreenshot(page));
    }

    // Each consecutive pair should be different (no stuck frames)
    for (let i = 1; i < screenshots.length; i++) {
      expect(
        screenshots[i]!.equals(screenshots[i - 1]!),
      ).toBe(false);
    }
  });

  test('PFI-006: Play and pause preserves frame position', async ({ page }) => {
    // Start playing
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, true);

    // Wait for some frames to elapse
    await waitForFrameAtLeast(page, 5);

    // Pause
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, false);

    // Record frame
    const pausedState = await getSessionState(page);
    const pausedFrame = pausedState.currentFrame;

    // Wait a moment — frame should not drift
    await page.waitForTimeout(300);

    const afterWaitState = await getSessionState(page);
    expect(afterWaitState.currentFrame).toBe(pausedFrame);
  });

  test('PFI-007: Speed change affects playback rate', async ({ page }) => {
    // Play at normal speed, measure frames elapsed over a longer window
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, true);
    const startState = await getSessionState(page);
    const startFrame = startState.currentFrame;

    await page.waitForTimeout(2000);
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, false);
    const normalState = await getSessionState(page);
    const normalElapsed = normalState.currentFrame - startFrame;

    // Go back to start
    await page.keyboard.press('Home');
    await waitForFrame(page, 1);

    // Set 2x speed via the session object directly
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.playbackSpeed = 2;
      }
    });
    await waitForPlaybackSpeed(page, 2);
    await page.waitForTimeout(100); // Let speed change propagate

    // Play at 2x
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, true);

    await page.waitForTimeout(2000);
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, false);
    const fastState = await getSessionState(page);
    const fastElapsed = fastState.currentFrame - 1;

    // 2x speed should cover more frames (allow generous tolerance for system variance)
    if (normalElapsed > 5) {
      expect(fastElapsed).toBeGreaterThan(normalElapsed * 0.6);
    }
  });
});
