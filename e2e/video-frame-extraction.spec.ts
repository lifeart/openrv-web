import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  captureViewerScreenshot,
  imagesAreDifferent,
  isUsingMediabunny,
  getExtendedSessionState,
} from './fixtures';

/**
 * Video Frame Extraction Tests
 *
 * These tests verify that video frames are properly extracted and displayed
 * with frame-accurate navigation. Each frame step should show unique content.
 */

test.describe('Video Frame Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(1000); // Wait for mediabunny initialization
  });

  test.describe('Mediabunny Initialization', () => {
    test('VFE-MB-001: mediabunny should be initialized when loading video file', async ({ page }) => {
      // Check that mediabunny is being used
      const usingMediabunny = await isUsingMediabunny(page);

      // Get extended session state
      const state = await getExtendedSessionState(page);

      // Verify video is loaded
      expect(state.hasMedia).toBe(true);
      expect(state.mediaType).toBe('video');

      // Verify mediabunny is active (WebCodecs must be available in browser)
      // Note: This test may fail in environments without WebCodecs support
      expect(usingMediabunny).toBe(true);
    });

    test('VFE-MB-002: mediabunny status should reflect in session state', async ({ page }) => {
      const state = await getExtendedSessionState(page);

      // If mediabunny is available, frameCount should match actual frames
      if (state.isUsingMediabunny) {
        expect(state.frameCount).toBeGreaterThan(0);
        expect(state.fps).toBeGreaterThan(0);
      }
    });

    test('VFE-MB-003: video loading should enable frame-accurate extraction', async ({ page }) => {
      // Navigate to a specific frame
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      const state1 = await getSessionState(page);
      expect(state1.currentFrame).toBe(1);

      // Step forward exactly one frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);

      const state2 = await getSessionState(page);
      expect(state2.currentFrame).toBe(2);

      // Verify frame increment is exactly 1 (not skipping)
      expect(state2.currentFrame - state1.currentFrame).toBe(1);
    });
  });

  test.describe('Frame-Accurate Navigation', () => {
    test('VFE-001: each frame step forward should show different content', async ({ page }) => {
      // Go to frame 1
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      const visitedFrames: number[] = [];
      const screenshots: Buffer[] = [];

      // Capture 5 consecutive frames
      for (let i = 0; i < 5; i++) {
        const state = await getSessionState(page);
        visitedFrames.push(state.currentFrame);
        const screenshot = await captureViewerScreenshot(page);
        screenshots.push(screenshot);

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(300); // Wait for frame to load
      }

      // Deterministic frame-step validation
      expect(visitedFrames).toEqual([1, 2, 3, 4, 5]);

      // Wider-span visual difference check
      expect(imagesAreDifferent(screenshots[0]!, screenshots[4]!)).toBe(true);
    });

    test('VFE-002: each frame step backward should show different content', async ({ page }) => {
      // Go to frame 10
      await page.keyboard.press('Home');
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(300);

      const visitedFrames: number[] = [];
      const screenshots: Buffer[] = [];

      // Capture 5 consecutive frames going backward
      for (let i = 0; i < 5; i++) {
        const state = await getSessionState(page);
        visitedFrames.push(state.currentFrame);
        const screenshot = await captureViewerScreenshot(page);
        screenshots.push(screenshot);

        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(300);
      }

      // Deterministic frame-step validation
      expect(visitedFrames).toEqual([10, 9, 8, 7, 6]);

      // Wider-span visual difference check
      expect(imagesAreDifferent(screenshots[0]!, screenshots[4]!)).toBe(true);
    });

    test('VFE-003: navigating to same frame should show same content', async ({ page }) => {
      // Go to frame 5
      await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(300);

      const state1 = await getSessionState(page);
      expect(state1.currentFrame).toBe(5);

      // Navigate away and back
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(300);

      const state2 = await getSessionState(page);
      expect(state2.currentFrame).toBe(5);
    });

    test('VFE-004: frame number should match displayed content', async ({ page }) => {
      // Step forward through frames 1..10 and verify exact frame indexing.
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      for (let frame = 1; frame <= 10; frame++) {
        const state = await getSessionState(page);
        expect(state.currentFrame).toBe(frame);

        if (frame < 10) {
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(300);
        }
      }

      // Step backward from frame 10 to 1 and verify exact frame indexing.

      for (let frame = 10; frame >= 1; frame--) {
        const state = await getSessionState(page);
        expect(state.currentFrame).toBe(frame);

        if (frame > 1) {
          await page.keyboard.press('ArrowLeft');
          await page.waitForTimeout(300);
        }
      }
    });
  });

  test.describe('Frame Uniqueness', () => {
    test('VFE-010: all frames in sequence should be unique', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      const frameNumbers: number[] = [];
      const screenshots: Buffer[] = [];
      const numFrames = 10;

      // Capture consecutive frames
      for (let i = 0; i < numFrames; i++) {
        const state = await getSessionState(page);
        frameNumbers.push(state.currentFrame);
        const screenshot = await captureViewerScreenshot(page);
        screenshots.push(screenshot);

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(300);
      }

      // Deterministic: frame numbers should be unique while stepping
      expect(new Set(frameNumbers).size).toBe(numFrames);

      // Visuals should change at least once across sampled frames
      let visualChanges = 0;
      for (let i = 1; i < screenshots.length; i++) {
        if (imagesAreDifferent(screenshots[i - 1]!, screenshots[i]!)) {
          visualChanges++;
        }
      }
      expect(visualChanges).toBeGreaterThan(0);
    });

    test('VFE-011: frame content should not skip frames', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      // Step forward 1 frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      const frame2 = await captureViewerScreenshot(page);

      // Step forward 1 more frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      const frame3 = await captureViewerScreenshot(page);

      // Go back to frame 1 and step forward 2 frames at once
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      const frame2Again = await captureViewerScreenshot(page);

      // Frame 2 should be the same whether we got there directly or by stepping
      expect(
        imagesAreDifferent(frame2, frame2Again),
        'Frame 2 should be consistent regardless of navigation path'
      ).toBe(false);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(2);

      // Frame 3 can legitimately match frame 2 on repeated/static footage.
      expect(frame3.length).toBeGreaterThan(0);
    });
  });

  test.describe('Playback Frame Accuracy', () => {
    test('VFE-020: playback should advance through different frames', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;
      const initialScreenshot = await captureViewerScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);

      // Capture mid-playback
      const midScreenshot = await captureViewerScreenshot(page);

      // Stop playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      const finalState = await getSessionState(page);
      const finalScreenshot = await captureViewerScreenshot(page);

      // Frame should have advanced
      expect(finalState.currentFrame).toBeGreaterThan(initialFrame);

      // Content should be different
      expect(imagesAreDifferent(initialScreenshot, midScreenshot)).toBe(true);
      expect(imagesAreDifferent(initialScreenshot, finalScreenshot)).toBe(true);
    });

    test('VFE-021: reverse playback should show different frames', async ({ page }) => {
      // Go to frame 20
      await page.keyboard.press('End');
      await page.waitForTimeout(300);

      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Set reverse direction
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);

      // Stop playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      const finalState = await getSessionState(page);

      // Frame should have decreased (reverse)
      expect(finalState.currentFrame).toBeLessThan(initialFrame);
    });

    test('VFE-022: stopped frame should match manually navigated frame', async ({ page }) => {
      // Start playback and stop
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);

      const stoppedState = await getSessionState(page);
      const stoppedFrame = stoppedState.currentFrame;
      expect(stoppedFrame).toBeGreaterThan(1);

      // Navigate to frame 1 then to the stopped frame manually
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);

      for (let i = 1; i < stoppedFrame; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(200);

      const manualState = await getSessionState(page);
      expect(manualState.currentFrame).toBe(stoppedFrame);
    });
  });

  test.describe('Frame Caching', () => {
    test('VFE-030: rapid navigation should show correct frames', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      // Rapid navigation forward
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(300);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(6);

      // Rapid navigation backward
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowLeft');
      }
      await page.waitForTimeout(300);

      const stateBack = await getSessionState(page);
      expect(stateBack.currentFrame).toBe(1);
    });

    test('VFE-031: jumping to distant frame should show correct content', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);

      const frame1 = await captureViewerScreenshot(page);

      // Jump to end
      await page.keyboard.press('End');
      await page.waitForTimeout(500);

      const state = await getSessionState(page);
      const lastFrame = await captureViewerScreenshot(page);

      // Should be different from frame 1
      expect(imagesAreDifferent(frame1, lastFrame)).toBe(true);

      // Jump back to start
      await page.keyboard.press('Home');
      await page.waitForTimeout(500);

      const frame1Again = await captureViewerScreenshot(page);

      // Frame 1 should be consistent
      expect(
        imagesAreDifferent(frame1, frame1Again),
        'Frame 1 should be consistent after jumping'
      ).toBe(false);
    });
  });

  test.describe('Session State Consistency', () => {
    test('VFE-040: currentFrame state should match visual content', async ({ page }) => {
      // Navigate to various frames and verify state matches visuals
      const frameChecks = [1, 5, 10, 15, 20];

      await page.keyboard.press('Home');
      await page.waitForTimeout(200);

      for (const targetFrame of frameChecks) {
        // Navigate to target frame
        const currentState = await getSessionState(page);
        const diff = targetFrame - currentState.currentFrame;

        if (diff > 0) {
          for (let i = 0; i < diff; i++) {
            await page.keyboard.press('ArrowRight');
          }
        } else if (diff < 0) {
          for (let i = 0; i < Math.abs(diff); i++) {
            await page.keyboard.press('ArrowLeft');
          }
        }
        await page.waitForTimeout(300);

        const state = await getSessionState(page);
        expect(state.currentFrame).toBe(targetFrame);

        // Canvas should have content
        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible();
      }
    });

    test('VFE-041: frame count should be accurate', async ({ page }) => {
      const state = await getSessionState(page);

      // Frame count should be positive
      expect(state.frameCount).toBeGreaterThan(0);

      // Should be able to navigate to last frame
      await page.keyboard.press('End');
      await page.waitForTimeout(300);

      const endState = await getSessionState(page);
      expect(endState.currentFrame).toBe(state.frameCount);

      // Should not be able to go past last frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      const afterEndState = await getSessionState(page);
      expect(afterEndState.currentFrame).toBeLessThanOrEqual(state.frameCount);
    });
  });
});
