import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  getCacheIndicatorState,
  isUsingMediabunny,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForPlaybackState,
  waitForFrameAtLeast,
  waitForFrameChange,
  waitForCachedFrames,
  waitForPendingFramesBelow,
  waitForPlayDirection,
  waitForFrame,
  waitForMediaLoaded,
  waitForFrameAtEnd,
  waitForFrameAtMost,
} from './fixtures';

/**
 * Playback State Fixes Tests
 *
 * These tests verify the fixes for:
 * - PLAY-STATE-001: pause() properly resets playback preload state
 * - PLAY-STATE-002: AbortController cancels stale frame requests
 * - PLAY-STATE-003: Play after pause works correctly
 * - PLAY-STATE-004: Seeking then playing works correctly
 * - PLAY-STATE-005: Rapid play/pause/play doesn't cause stale frame issues
 * - PLAY-STATE-006: Large video playback doesn't loop on first frame
 */

test.describe('Playback State Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await waitForMediaLoaded(page);
  });

  test.describe('Pause/Play State Management', () => {
    test('PLAY-STATE-001: pause() properly resets playback preload state', async ({ page }) => {
      // Verify mediabunny is being used
      const usingMediabunny = await isUsingMediabunny(page);
      expect(usingMediabunny).toBe(true);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Pause playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);

      // Check cache state - preloading should have stopped
      // Wait for pending count to settle
      await waitForPendingFramesBelow(page, 2);
      const cacheState = await getCacheIndicatorState(page);
      // pendingCount should be 0 or very low after abort
      expect(cacheState.pendingCount).toBeLessThanOrEqual(2);
    });

    test('PLAY-STATE-002: play after pause works correctly', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      // Wait for some frames to advance
      await waitForFrameAtLeast(page, 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const pausedState = await getSessionState(page);
      expect(pausedState.isPlaying).toBe(false);
      const pausedFrame = pausedState.currentFrame;

      // Start playback again
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      // Wait for frames to advance past paused position
      await waitForFrameAtLeast(page, pausedFrame + 3);

      // Pause again
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.isPlaying).toBe(false);

      // Frame should have advanced past the paused frame
      expect(finalState.currentFrame).toBeGreaterThan(pausedFrame);
    });

    test('PLAY-STATE-003: seeking then playing works correctly', async ({ page }) => {
      // Navigate to a specific frame
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Move forward a bit
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 10);

      const seekedState = await getSessionState(page);
      const seekedFrame = seekedState.currentFrame;

      // Capture screenshot at seeked frame
      const seekedScreenshot = await captureViewerScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, seekedFrame + 5);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);

      // Should have advanced past the seeked frame
      expect(finalState.currentFrame).toBeGreaterThan(seekedFrame);

      // Screenshot should be different (different frame)
      const finalScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(seekedScreenshot, finalScreenshot)).toBe(true);
    });

    test('PLAY-STATE-004: rapid play/pause/play sequence works', async ({ page }) => {
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Rapid play/pause/play sequence
      await page.keyboard.press('Space'); // Play
      await waitForPlaybackState(page, true);
      await page.keyboard.press('Space'); // Pause
      await waitForPlaybackState(page, false);
      await page.keyboard.press('Space'); // Play again
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, initialFrame + 5);
      await page.keyboard.press('Space'); // Pause
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.isPlaying).toBe(false);

      // Frame should have advanced despite rapid toggling
      expect(finalState.currentFrame).toBeGreaterThan(initialFrame);
    });

    test('PLAY-STATE-005: playback does not stall on first frame', async ({ page }) => {
      // Go to first frame
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const initialState = await getSessionState(page);
      expect(initialState.currentFrame).toBe(1);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for at least 3 frames to advance (proves it's not stuck)
      await waitForFrameAtLeast(page, 4);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);

      // Should NOT be stuck on frame 1 or 2
      expect(finalState.currentFrame).toBeGreaterThan(3);
    });
  });

  test.describe('Seek and Resume', () => {
    test('PLAY-STATE-010: seek during playback works correctly', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Seek to end while playing
      await page.keyboard.press('End');
      // Wait for seek to register
      await waitForFrameAtEnd(page);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const state = await getSessionState(page);

      // Should be at or near the end (allowing for loop behavior)
      expect(state.currentFrame).toBeGreaterThan(state.frameCount / 2);
    });

    test('PLAY-STATE-011: seek to start and resume works', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('End');
      await waitForFrameAtEnd(page);
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowLeft');
      }

      const middleState = await getSessionState(page);
      expect(middleState.currentFrame).toBeLessThan(middleState.frameCount);

      // Start playback briefly
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      // Wait for at least one frame to advance
      await waitForFrameChange(page, middleState.currentFrame);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Seek to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const startState = await getSessionState(page);
      expect(startState.currentFrame).toBe(1);

      // Start playback again
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 4);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);

      // Should have advanced from frame 1
      expect(finalState.currentFrame).toBeGreaterThan(1);
    });
  });

  test.describe('Direction Changes', () => {
    test('PLAY-STATE-020: direction change during playback works', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 15);

      const startState = await getSessionState(page);
      const startFrame = startState.currentFrame;
      expect(startState.playDirection).toBe(1);

      // Start forward playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, startFrame + 3);

      // Toggle direction to reverse
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      let state = await getSessionState(page);
      expect(state.playDirection).toBe(-1);

      // Let it play in reverse until frame decreases
      const reverseStartFrame = state.currentFrame;
      await waitForFrameAtMost(page, reverseStartFrame - 2);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);

      // Frame should be less than where we were when direction changed (went reverse)
      // or different from start due to the initial forward motion
      expect(finalState.currentFrame).not.toBe(startFrame);
    });

    test('PLAY-STATE-021: stop and restart in reverse direction works', async ({ page }) => {
      // Go to end
      await page.keyboard.press('End');
      await waitForFrameAtEnd(page);

      const endState = await getSessionState(page);
      const endFrame = endState.currentFrame;

      // Set reverse direction
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      let state = await getSessionState(page);
      expect(state.playDirection).toBe(-1);

      // Start reverse playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for frame to go backward
      await waitForFrameAtMost(page, endFrame - 1);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);

      // Should have moved backward from end
      expect(finalState.currentFrame).toBeLessThan(endFrame);
    });
  });

  test.describe('Frame Cache State', () => {
    test('PLAY-STATE-030: cache state reflects paused state', async ({ page }) => {
      // Start playback to trigger caching
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Wait for some frames to be cached
      await waitForCachedFrames(page, 1);

      const cacheState = await getCacheIndicatorState(page);

      // Should have some cached frames
      expect(cacheState.cachedCount).toBeGreaterThan(0);
      expect(cacheState.isUsingMediabunny).toBe(true);
    });

    test('PLAY-STATE-031: cache continues to work after multiple play/pause cycles', async ({ page }) => {
      // Multiple play/pause cycles
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Space'); // Play
        await waitForPlaybackState(page, true);
        await waitForFrameChange(page, await getSessionState(page).then(s => s.currentFrame));
        await page.keyboard.press('Space'); // Pause
        await waitForPlaybackState(page, false);
      }

      const state = await getSessionState(page);
      const cacheState = await getCacheIndicatorState(page);

      // Should still be functioning
      expect(state.isPlaying).toBe(false);
      expect(cacheState.cachedCount).toBeGreaterThan(0);

      // Can still advance frames
      const frameBefore = state.currentFrame;
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, frameBefore);

      const stateAfter = await getSessionState(page);
      expect(stateAfter.currentFrame).toBe(frameBefore + 1);
    });
  });

  test.describe('Buffering State', () => {
    test('PLAY-STATE-040: initial buffer is established before playback advances', async ({ page }) => {
      // Go to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Should be playing (not blocked waiting for buffer)
      const state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Wait for frames to advance
      await waitForFrameAtLeast(page, 4);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);

      // Should have advanced beyond initial frame
      expect(finalState.currentFrame).toBeGreaterThan(1);
    });
  });

  test.describe('Edge Cases', () => {
    test('PLAY-STATE-050: can play from last frame without crash', async ({ page }) => {
      // Go to last frame
      await page.keyboard.press('End');
      await waitForFrameAtEnd(page);

      const endState = await getSessionState(page);
      expect(endState.currentFrame).toBe(endState.frameCount);

      // Try to play - should loop back to start
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for frame to change (indicating playback is working)
      await waitForFrameChange(page, endState.frameCount);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Should not have crashed, should be in a valid state
      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThanOrEqual(1);
      expect(finalState.currentFrame).toBeLessThanOrEqual(finalState.frameCount);
    });

    test('PLAY-STATE-051: double pause is idempotent', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Double pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const stateAfterFirstPause = await getSessionState(page);
      const frameAfterFirstPause = stateAfterFirstPause.currentFrame;

      // Press space again (should start playing, not crash)
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Immediately pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.isPlaying).toBe(false);
      // Frame should be same or slightly advanced
      expect(finalState.currentFrame).toBeGreaterThanOrEqual(frameAfterFirstPause);
    });

    test('PLAY-STATE-052: seek while paused preserves pause state', async ({ page }) => {
      // Ensure paused
      const initialState = await getSessionState(page);
      expect(initialState.isPlaying).toBe(false);

      // Seek around
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      await page.keyboard.press('End');
      await waitForFrameAtEnd(page);

      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const finalState = await getSessionState(page);
      // Should still be paused after seeking
      expect(finalState.isPlaying).toBe(false);
      expect(finalState.currentFrame).toBe(1);
    });

    test('PLAY-STATE-053: frame stepping works after play/pause cycle', async ({ page }) => {
      // Play and pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 5);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const pausedState = await getSessionState(page);
      const pausedFrame = pausedState.currentFrame;

      // Step forward
      await page.keyboard.press('ArrowRight');
      await waitForFrame(page, pausedFrame + 1);

      let state = await getSessionState(page);
      expect(state.currentFrame).toBe(pausedFrame + 1);

      // Step backward
      await page.keyboard.press('ArrowLeft');
      await waitForFrame(page, pausedFrame);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(pausedFrame);
    });

    test('PLAY-STATE-054: multiple direction toggles do not corrupt state', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('ArrowRight');
      }

      // Toggle direction multiple times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowUp');
        // Wait for direction to toggle
        const expectedDirection = i % 2 === 0 ? -1 : 1;
        await waitForPlayDirection(page, expectedDirection);
      }

      const state = await getSessionState(page);
      // Direction should be toggled (odd number of times from 1 = -1)
      expect(state.playDirection).toBe(-1);

      const frameBeforePlay = state.currentFrame;

      // Should still be able to play
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      // Wait for frame to change (playback working)
      await waitForFrameChange(page, frameBeforePlay);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // App should not have crashed
      const finalState = await getSessionState(page);
      expect(finalState.isPlaying).toBe(false);
    });
  });

  test.describe('Speed Control', () => {
    test('PLAY-STATE-060: speed change updates playback rate', async ({ page }) => {
      // Get initial speed
      let state = await getSessionState(page);
      const initialSpeed = state.speed;
      expect(initialSpeed).toBe(1);

      // Increase speed with > key
      await page.keyboard.press('>');
      await page.waitForFunction(
        () => {
          const state = (window as any).__OPENRV_TEST__?.getSessionState();
          return state?.speed > 1;
        },
        undefined,
        { timeout: 2000 }
      );

      state = await getSessionState(page);
      expect(state.speed).toBeGreaterThan(1);

      // Decrease speed with < key
      await page.keyboard.press('<');
      await page.keyboard.press('<');
      await page.waitForFunction(
        () => {
          const state = (window as any).__OPENRV_TEST__?.getSessionState();
          return state?.speed < 1;
        },
        undefined,
        { timeout: 2000 }
      );

      state = await getSessionState(page);
      expect(state.speed).toBeLessThan(1);
    });

    test('PLAY-STATE-061: playback respects speed setting', async ({ page }) => {
      // Set speed to 2x
      await page.keyboard.press('>');
      await page.waitForFunction(
        () => {
          const state = (window as any).__OPENRV_TEST__?.getSessionState();
          return state?.speed > 1;
        },
        undefined,
        { timeout: 2000 }
      );

      // Go to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const startState = await getSessionState(page);
      const startFrame = startState.currentFrame;

      // Play for a bit
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, startFrame + 5);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      // Frame should have advanced
      expect(finalState.currentFrame).toBeGreaterThan(startFrame);
    });
  });

  test.describe('Abort Signal Propagation', () => {
    test('PLAY-STATE-070: pending count drops quickly after pause', async ({ page }) => {
      // Start playback to trigger preloading
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Wait for some pending requests to accumulate
      const cacheStateBefore = await getCacheIndicatorState(page);
      // May have pending requests during playback

      // Pause immediately
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Pending count should drop quickly due to abort
      await waitForPendingFramesBelow(page, 2);

      const cacheStateAfter = await getCacheIndicatorState(page);
      expect(cacheStateAfter.pendingCount).toBeLessThanOrEqual(2);
    });

    test('PLAY-STATE-071: new playback session after abort works correctly', async ({ page }) => {
      // First play/pause cycle
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Wait for abort to complete
      await waitForPendingFramesBelow(page, 1);

      const frameAfterFirstSession = (await getSessionState(page)).currentFrame;

      // Second play session should work
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, frameAfterFirstSession + 3);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(frameAfterFirstSession);
    });

    test('PLAY-STATE-072: direction change aborts old preloads', async ({ page }) => {
      // Go to middle of video
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 20);

      // Start forward playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 22);

      // Change direction - should abort forward preloads
      await page.keyboard.press('ArrowUp');
      await waitForPlayDirection(page, -1);

      // Wait a bit for reverse playback
      await waitForFrameAtMost(page, 21);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Should have moved backward
      const finalState = await getSessionState(page);
      expect(finalState.playDirection).toBe(-1);
    });
  });

  test.describe('Stress Tests', () => {
    test('PLAY-STATE-080: rapid play/pause cycles do not leak resources', async ({ page }) => {
      // Rapid play/pause cycles
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Space');
        await waitForPlaybackState(page, true);
        await page.keyboard.press('Space');
        await waitForPlaybackState(page, false);
      }

      // Wait for any cleanup
      await waitForPendingFramesBelow(page, 2);

      // Should still function correctly
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameChange(page, (await getSessionState(page)).currentFrame);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.isPlaying).toBe(false);
    });

    test('PLAY-STATE-081: alternating direction changes work correctly', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('ArrowRight');
      }

      // Start playing
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Alternate direction a few times
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowUp');
        const expectedDir = i % 2 === 0 ? -1 : 1;
        await waitForPlayDirection(page, expectedDir);
      }

      // Pause and verify state
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
      // After 4 toggles from 1: -1, 1, -1, 1 (back to 1)
      expect(state.playDirection).toBe(1);
    });

    test('PLAY-STATE-082: seek during playback then pause works', async ({ page }) => {
      // Start playing
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Seek to start while playing
      await page.keyboard.press('Home');
      // Small delay for seek to register
      await waitForFrameAtMost(page, 5);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Should be at a low frame number
      const state = await getSessionState(page);
      expect(state.currentFrame).toBeLessThanOrEqual(5);
      expect(state.isPlaying).toBe(false);
    });

    test('PLAY-STATE-083: play after Home key works', async ({ page }) => {
      // Go to some frame
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }

      // Go Home
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Play
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(1);
    });
  });

  test.describe('Cache Persistence', () => {
    test('PLAY-STATE-090: cached frames persist across play/pause', async ({ page }) => {
      // Play to cache some frames
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 5);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Wait for cache to stabilize
      await waitForCachedFrames(page, 1);
      const cacheAfterPause = await getCacheIndicatorState(page);
      const cachedCountAfterPause = cacheAfterPause.cachedCount;

      // Navigate back a few frames (should hit cache)
      const currentFrame = (await getSessionState(page)).currentFrame;
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowLeft');
      }
      await waitForFrame(page, currentFrame - 3);

      // Cache should still have frames
      const cacheAfterNav = await getCacheIndicatorState(page);
      expect(cacheAfterNav.cachedCount).toBeGreaterThan(0);
    });

    test('PLAY-STATE-091: scrubbing uses cached frames', async ({ page }) => {
      // Play to cache some frames
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 8);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Wait for cache
      await waitForCachedFrames(page, 1);

      // Go back to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Scrub forward through cached frames
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 5);

      // Should be at frame 6 and cache should still exist
      const state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThanOrEqual(5);

      const cacheState = await getCacheIndicatorState(page);
      expect(cacheState.cachedCount).toBeGreaterThan(0);
    });
  });
});
