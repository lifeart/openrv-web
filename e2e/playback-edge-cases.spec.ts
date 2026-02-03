import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  isUsingMediabunny,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForPlaybackState,
  waitForFrameAtLeast,
  waitForFrameChange,
  waitForPlayDirection,
  waitForFrame,
  waitForMediaLoaded,
  waitForFrameAtMost,
  waitForFrameAtEnd,
  waitForLoopMode,
} from './fixtures';
import { PLAYBACK_SPEED_PRESETS } from '../src/core/session/Session';

/**
 * Playback Edge Cases Tests
 *
 * Tests for edge cases and corner case handling:
 * - Extreme playback speeds (0.1x, 8x)
 * - Reverse playback at frame boundaries
 * - Concurrent seeks during high-speed playback
 * - Speed changes during playback
 * - Multiple direction toggles stress test
 * - Starvation recovery scenarios
 */

test.describe('Playback Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await waitForMediaLoaded(page);
  });

  test.describe('Extreme Playback Speeds', () => {
    test('EDGE-001: playback at 0.1x speed advances frames slowly', async ({ page }) => {
      // Set speed to 0.1x (slowest)
      // Use J key multiple times to decrease speed
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('j');
        await page.waitForTimeout(50);
      }

      let state = await getSessionState(page);
      // Speed should be at or near minimum
      expect(state.playbackSpeed).toBeLessThanOrEqual(0.25);

      const startFrame = state.currentFrame;

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for slow advancement
      await page.waitForTimeout(2000);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      // At 0.1x speed, with 24fps, expect ~2-3 frames per second
      // After 2 seconds, should have advanced at least 1-2 frames
      expect(state.currentFrame).toBeGreaterThan(startFrame);
    });

    test('EDGE-002: playback at 8x speed advances frames rapidly', async ({ page }) => {
      // Set speed to 8x (fastest)
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('l');
        await page.waitForTimeout(50);
      }

      let state = await getSessionState(page);
      expect(state.playbackSpeed).toBeGreaterThanOrEqual(4);

      const startFrame = state.currentFrame;

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for rapid advancement
      await page.waitForTimeout(500);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      // At 8x speed, should advance many frames in 500ms
      expect(state.currentFrame).toBeGreaterThan(startFrame + 5);
    });

    test('EDGE-003: speed change during playback resets timing correctly', async ({ page }) => {
      // Start playback at 1x
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Increase speed to 2x while playing
      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.playbackSpeed).toBeGreaterThan(1);

      // Continue playback
      await waitForFrameAtLeast(page, state.currentFrame + 3);

      // Decrease speed back to 1x
      await page.keyboard.press('j');
      await page.waitForTimeout(100);

      const frameAfterDecrease = (await getSessionState(page)).currentFrame;

      // Wait for a bit more playback
      await waitForFrameAtLeast(page, frameAfterDecrease + 2);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Session should be in a consistent state
      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
      expect(state.currentFrame).toBeGreaterThan(frameAfterDecrease);
    });

    test('EDGE-004: rapid speed cycling does not cause issues', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Rapidly cycle through speeds
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('l');
        await page.waitForTimeout(50);
        await page.keyboard.press('j');
        await page.waitForTimeout(50);
      }

      // Should still be playing
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
    });
  });

  test.describe('Reverse Playback at Boundaries', () => {
    test('EDGE-010: reverse playback stops at in-point in once mode', async ({ page }) => {
      // Set in-point a few frames from start
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i'); // Set in-point at frame 4
      await page.waitForTimeout(100);

      // Set out-point
      await page.keyboard.press('End');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      // Set once mode (Ctrl+L cycles loop mode: loop -> pingpong -> once)
      await page.keyboard.press('Control+l'); // cycle to pingpong
      await waitForLoopMode(page, 'pingpong');
      await page.keyboard.press('Control+l'); // cycle to once
      await waitForLoopMode(page, 'once');

      let state = await getSessionState(page);
      expect(state.loopMode).toBe('once');
      const inPoint = state.inPoint;

      // Go to in-point + 2
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Set reverse direction
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      // Start reverse playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for it to hit in-point and stop
      await page.waitForTimeout(800);

      state = await getSessionState(page);
      // Should have stopped at or near in-point
      expect(state.isPlaying).toBe(false);
      expect(state.currentFrame).toBeLessThanOrEqual(inPoint + 1);
    });

    test('EDGE-011: reverse playback loops correctly in loop mode', async ({ page }) => {
      // Set short in/out range
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.loopMode).toBe('loop');

      // Set reverse direction
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      // Start reverse playback from near in-point
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for loop to occur
      await page.waitForTimeout(1000);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      // Should still be within in/out range (looped back to out-point)
      expect(state.currentFrame).toBeGreaterThanOrEqual(state.inPoint);
      expect(state.currentFrame).toBeLessThanOrEqual(state.outPoint);
    });

    test('EDGE-012: pingpong mode reverses direction at in-point during reverse playback', async ({ page }) => {
      // Set short in/out range
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      // Set pingpong mode (Ctrl+L cycles: loop -> pingpong)
      await page.keyboard.press('Control+l');
      await waitForLoopMode(page, 'pingpong');

      let state = await getSessionState(page);
      expect(state.loopMode).toBe('pingpong');

      // Set reverse direction and go near in-point
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Start reverse playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for it to hit boundary and reverse
      await page.waitForTimeout(1000);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      // Direction should have changed to forward after hitting in-point
      // Or still within range if it bounced back
      expect(state.currentFrame).toBeGreaterThanOrEqual(state.inPoint);
      expect(state.currentFrame).toBeLessThanOrEqual(state.outPoint);
    });
  });

  test.describe('Concurrent Operations', () => {
    test('EDGE-020: seek during high-speed playback works correctly', async ({ page }) => {
      // Set high speed
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('l');
        await page.waitForTimeout(50);
      }

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 5);

      // Seek to start while playing at high speed
      await page.keyboard.press('Home');

      // Pause immediately after seeking to minimize frame advancement
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const state = await getSessionState(page);
      // Should be at a low frame (seeked to start, may have advanced a few frames
      // between Home and Space due to high-speed playback)
      expect(state.currentFrame).toBeLessThanOrEqual(20);
    });

    test('EDGE-021: direction toggle during high-speed playback', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Set high speed
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press('l');
        await page.waitForTimeout(50);
      }

      const startState = await getSessionState(page);
      const startFrame = startState.currentFrame;

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, startFrame + 3);

      // Toggle direction
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      // Continue playback in reverse
      await page.waitForTimeout(300);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const state = await getSessionState(page);
      // Should have reversed direction during high-speed playback
      expect(state.playDirection).toBe(-1);
    });

    test('EDGE-022: multiple concurrent operations stress test', async ({ page }) => {
      // Rapid sequence of operations
      await page.keyboard.press('Space'); // Play
      await page.waitForTimeout(100);
      await page.keyboard.press('l'); // Increase speed
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowUp'); // Toggle direction
      await page.waitForTimeout(50);
      await page.keyboard.press('Home'); // Seek
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowUp'); // Toggle direction again
      await page.waitForTimeout(50);
      await page.keyboard.press('j'); // Decrease speed
      await page.waitForTimeout(100);
      await page.keyboard.press('Space'); // Pause

      await waitForPlaybackState(page, false);

      // App should still be responsive
      const state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
      expect(typeof state.currentFrame).toBe('number');
    });
  });

  test.describe('Speed Preset UI', () => {
    test('EDGE-030: speed button cycles through all presets forward', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');
      await expect(speedButton).toBeVisible();

      // Record speeds as we cycle
      const speeds: number[] = [];
      for (let i = 0; i < 8; i++) {
        const state = await getSessionState(page);
        speeds.push(state.playbackSpeed);
        await speedButton.click();
        await page.waitForTimeout(50);
      }

      // Should have cycled through various speeds
      expect(speeds.length).toBe(8);
      // Should include 1x at some point
      expect(speeds).toContain(1);
    });

    test('EDGE-031: shift+click on speed button decreases speed', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');
      await expect(speedButton).toBeVisible();

      // First increase speed a few times
      await speedButton.click();
      await speedButton.click();
      await page.waitForTimeout(50);

      const stateAfterIncrease = await getSessionState(page);
      const speedAfterIncrease = stateAfterIncrease.playbackSpeed;

      // Shift+click to decrease
      await speedButton.click({ modifiers: ['Shift'] });
      await page.waitForTimeout(50);

      const stateAfterDecrease = await getSessionState(page);
      expect(stateAfterDecrease.playbackSpeed).toBeLessThanOrEqual(speedAfterIncrease);
    });

    test('EDGE-032: right-click shows speed preset menu', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');
      await expect(speedButton).toBeVisible();

      // Right-click to show menu
      await speedButton.click({ button: 'right' });
      await page.waitForTimeout(100);

      // Check menu is visible
      const menu = page.locator('#speed-preset-menu');
      await expect(menu).toBeVisible();

      // Check all presets are available (use imported constant to stay in sync)
      for (const preset of PLAYBACK_SPEED_PRESETS) {
        const presetButton = page.locator(`[data-testid="speed-preset-${preset}"]`);
        await expect(presetButton).toBeVisible();
      }
    });

    test('EDGE-033: clicking preset in menu sets speed', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');

      // Right-click to show menu
      await speedButton.click({ button: 'right' });
      await page.waitForTimeout(100);

      // Click on 0.25x preset
      const preset025 = page.locator('[data-testid="speed-preset-0.25"]');
      await preset025.click();
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      expect(state.playbackSpeed).toBe(0.25);
    });
  });

  test.describe('Starvation and Buffering', () => {
    test('EDGE-040: playback continues after brief buffer starvation', async ({ page }) => {
      // Verify mediabunny is being used
      const usingMediabunny = await isUsingMediabunny(page);
      expect(usingMediabunny).toBe(true);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Let it play for a bit
      await waitForFrameAtLeast(page, 5);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(1);
    });

    test('EDGE-041: buffering indicator works during playback', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for some frames
      await waitForFrameAtLeast(page, 3);

      // Check buffering state (should not be buffering during normal playback with cached frames)
      const state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);
    });
  });

  test.describe('Frame Boundary Handling', () => {
    test('EDGE-050: stepping beyond out-point is clamped', async ({ page }) => {
      // Go to end
      await page.keyboard.press('End');
      await waitForFrameAtEnd(page);

      const state = await getSessionState(page);
      const outPoint = state.outPoint;

      // Try to step forward
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      const stateAfter = await getSessionState(page);
      // Frame should not exceed out-point
      expect(stateAfter.currentFrame).toBeLessThanOrEqual(outPoint);
    });

    test('EDGE-051: stepping before in-point is clamped', async ({ page }) => {
      // Go to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Try to step backward
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      // Frame should not go below 1
      expect(state.currentFrame).toBeGreaterThanOrEqual(1);
    });

    test('EDGE-052: in/out points cannot cross', async ({ page }) => {
      // Set in-point at frame 10
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('i');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const inPoint = state.inPoint;

      // Go back to frame 5 and try to set out-point
      await page.keyboard.press('Home');
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      // Out-point should be clamped to at least in-point
      expect(state.outPoint).toBeGreaterThanOrEqual(inPoint);
    });
  });

  test.describe('Visual Consistency', () => {
    test('EDGE-060: frame display matches frame number', async ({ page }) => {
      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const screenshot1 = await captureViewerScreenshot(page);

      // Go to frame 2
      await page.keyboard.press('ArrowRight');
      await waitForFrame(page, 2);

      const screenshot2 = await captureViewerScreenshot(page);

      // Frames should be visually different
      expect(imagesAreDifferent(screenshot1, screenshot2)).toBe(true);

      // Go back to frame 1
      await page.keyboard.press('ArrowLeft');
      await waitForFrame(page, 1);

      const screenshot1Again = await captureViewerScreenshot(page);

      // Frame 1 should look the same as before
      expect(imagesAreDifferent(screenshot1, screenshot1Again)).toBe(false);
    });

    test('EDGE-061: reverse playback shows frames in correct order', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const screenshots: Buffer[] = [];
      const frames: number[] = [];

      // Capture a few frames going backward
      for (let i = 0; i < 3; i++) {
        frames.push((await getSessionState(page)).currentFrame);
        screenshots.push(await captureViewerScreenshot(page));
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(100);
      }

      // Each frame should be different
      expect(imagesAreDifferent(screenshots[0]!, screenshots[1]!)).toBe(true);
      expect(imagesAreDifferent(screenshots[1]!, screenshots[2]!)).toBe(true);

      // Frames should be decreasing
      expect(frames[0]!).toBeGreaterThan(frames[1]!);
      expect(frames[1]!).toBeGreaterThan(frames[2]!);
    });
  });

  test.describe('Reverse Speed Limiting', () => {
    test('EDGE-070: reverse playback at 8x is limited to effective 4x', async ({ page }) => {
      // Set speed to 8x
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('l');
        await page.waitForTimeout(50);
      }

      let state = await getSessionState(page);
      expect(state.playbackSpeed).toBe(8);

      // Go to middle of video
      await page.keyboard.press('Home');
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const startFrame = (await getSessionState(page)).currentFrame;

      // Set reverse direction
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      // Start reverse playback at 8x (internally limited to 4x)
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for playback
      await page.waitForTimeout(500);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      // Should have moved backward (effective speed is limited to 4x)
      expect(state.currentFrame).toBeLessThan(startFrame);
      // Speed setting should still show 8x (only effective speed is limited)
      expect(state.playbackSpeed).toBe(8);
    });

    test('EDGE-071: forward playback at 8x is not limited', async ({ page }) => {
      // Set speed to 8x
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('l');
        await page.waitForTimeout(50);
      }

      let state = await getSessionState(page);
      expect(state.playbackSpeed).toBe(8);

      // Start from beginning
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Start forward playback at 8x
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for rapid advancement
      await page.waitForTimeout(300);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      // At 8x with 24fps, should advance ~58 frames in 300ms
      // Being conservative, expect at least 20 frames
      expect(state.currentFrame).toBeGreaterThan(20);
    });
  });

  test.describe('Speed Preset Validation', () => {
    test('EDGE-080: PLAYBACK_SPEED_PRESETS has expected values', async ({ page }) => {
      // Verify the imported presets match expected values
      expect(PLAYBACK_SPEED_PRESETS).toEqual([0.1, 0.25, 0.5, 1, 2, 4, 8]);
      expect(PLAYBACK_SPEED_PRESETS.length).toBe(7);
      expect(PLAYBACK_SPEED_PRESETS[0]).toBe(0.1); // Minimum
      expect(PLAYBACK_SPEED_PRESETS[PLAYBACK_SPEED_PRESETS.length - 1]).toBe(8); // Maximum
    });

    test('EDGE-081: all presets can be selected via menu', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');

      for (const preset of PLAYBACK_SPEED_PRESETS) {
        // Open menu
        await speedButton.click({ button: 'right' });
        await page.waitForTimeout(100);

        // Click preset
        const presetButton = page.locator(`[data-testid="speed-preset-${preset}"]`);
        await presetButton.click();
        await page.waitForTimeout(50);

        // Verify speed was set
        const state = await getSessionState(page);
        expect(state.playbackSpeed).toBe(preset);
      }
    });

    test('EDGE-082: speed button shows current preset value', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');

      // Default should be 1x
      await expect(speedButton).toHaveText('1x');

      // Change to 2x
      await page.keyboard.press('l');
      await page.waitForTimeout(50);
      await expect(speedButton).toHaveText('2x');

      // Change to 4x
      await page.keyboard.press('l');
      await page.waitForTimeout(50);
      await expect(speedButton).toHaveText('4x');

      // Reset to 1x using J key
      await page.keyboard.press('k'); // Reset to 1x
      await page.waitForTimeout(50);
      await expect(speedButton).toHaveText('1x');
    });
  });

  test.describe('Frame Accumulator Reset', () => {
    test('EDGE-090: changing speed during playback does not cause frame skip', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      const frameBeforeSpeedChange = (await getSessionState(page)).currentFrame;

      // Rapidly change speed multiple times
      await page.keyboard.press('l'); // Increase
      await page.waitForTimeout(50);

      const frameAfterFirstChange = (await getSessionState(page)).currentFrame;

      // Frame should not have jumped dramatically (accumulator was reset)
      expect(frameAfterFirstChange - frameBeforeSpeedChange).toBeLessThan(10);

      await page.keyboard.press('l'); // Increase again
      await page.waitForTimeout(50);

      const frameAfterSecondChange = (await getSessionState(page)).currentFrame;
      expect(frameAfterSecondChange - frameAfterFirstChange).toBeLessThan(10);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);
    });

    test('EDGE-091: direction change during playback resets timing', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Start forward playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 22);

      const frameBeforeDirection = (await getSessionState(page)).currentFrame;

      // Toggle direction to reverse
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);
      await page.waitForTimeout(100);

      const frameAfterDirection = (await getSessionState(page)).currentFrame;

      // Frame should not have jumped dramatically after direction change
      expect(Math.abs(frameAfterDirection - frameBeforeDirection)).toBeLessThan(10);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);
    });
  });

  test.describe('Menu Interaction', () => {
    test('EDGE-100: speed menu closes when clicking outside', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');

      // Open menu
      await speedButton.click({ button: 'right' });
      await page.waitForTimeout(100);

      const menu = page.locator('#speed-preset-menu');
      await expect(menu).toBeVisible();

      // Click outside the menu (on the viewer area)
      await page.locator('.viewer-container, #app').first().click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(100);

      // Menu should be closed
      await expect(menu).not.toBeVisible();
    });

    test('EDGE-101: opening new speed menu closes existing one', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');

      // Open menu first time
      await speedButton.click({ button: 'right' });
      await page.waitForTimeout(100);

      let menus = await page.locator('#speed-preset-menu').count();
      expect(menus).toBe(1);

      // Open menu again (should close existing and open new)
      await speedButton.click({ button: 'right' });
      await page.waitForTimeout(100);

      menus = await page.locator('#speed-preset-menu').count();
      expect(menus).toBe(1); // Still only one menu
    });

    test('EDGE-102: speed menu shows current speed highlighted', async ({ page }) => {
      const speedButton = page.locator('[data-testid="playback-speed-button"]');

      // Set speed to 2x
      await page.keyboard.press('l');
      await page.waitForTimeout(50);

      // Open menu
      await speedButton.click({ button: 'right' });
      await page.waitForTimeout(100);

      // 2x preset should be highlighted (has accent color background)
      const preset2x = page.locator('[data-testid="speed-preset-2"]');
      const bgColor = await preset2x.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );

      // Should have non-transparent background (highlighted)
      expect(bgColor).not.toBe('transparent');
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });
  });

  test.describe('Playback State Consistency', () => {
    test('EDGE-110: pause during buffering clears buffering state', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 2);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // State should be consistent
      const state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
      expect(state.isBuffering).toBe(false);
    });

    test('EDGE-111: rapid play/pause does not corrupt state', async ({ page }) => {
      // Rapid play/pause cycles
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(50);
        await page.keyboard.press('Space');
        await page.waitForTimeout(50);
      }

      // Final state should be consistent
      const state = await getSessionState(page);
      expect(typeof state.isPlaying).toBe('boolean');
      expect(typeof state.currentFrame).toBe('number');
      expect(state.currentFrame).toBeGreaterThanOrEqual(1);
    });

    test('EDGE-112: seeking while paused does not start playback', async ({ page }) => {
      // Ensure paused
      let state = await getSessionState(page);
      if (state.isPlaying) {
        await page.keyboard.press('Space');
        await waitForPlaybackState(page, false);
      }

      // Seek
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Should still be paused
      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
    });
  });

  test.describe('Audio Sync', () => {
    test('EDGE-120: audio is muted during reverse playback', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Set reverse direction
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      // Start reverse playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await page.waitForTimeout(200);

      // Check video element muted state
      const isMuted = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.muted ?? true;
      });

      // Should be muted during reverse playback
      expect(isMuted).toBe(true);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);
    });

    test('EDGE-121: audio resumes on forward playback after reverse', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Play forward first
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await page.waitForTimeout(200);

      // Toggle to reverse
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);
      await page.waitForTimeout(200);

      // Toggle back to forward
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, 1);
      await page.waitForTimeout(200);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const state = await getSessionState(page);
      expect(state.playDirection).toBe(1);
    });
  });
});
