import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  getColorState,
  waitForPlaybackState,
  waitForFrameAtLeast,
  waitForMediaLoaded,
  isUsingMediabunny,
} from './fixtures';

/**
 * Playback After Effects Tests
 *
 * These tests verify the fix for the _pendingPlayPromise leak in Session.play().
 * The bug caused video playback to stop (and not restart) after applying color
 * correction effects such as exposure, brightness, contrast, saturation, etc.
 *
 * - EFFECT-PLAY-001: Video continues playing after applying exposure adjustment
 * - EFFECT-PLAY-002: Video continues playing after applying brightness adjustment
 * - EFFECT-PLAY-003: Video continues playing after applying contrast adjustment
 * - EFFECT-PLAY-004: Video continues playing after applying saturation adjustment
 * - EFFECT-PLAY-010: Play/pause/play cycle works with effects active
 * - EFFECT-PLAY-011: Playback resumes after pause with multiple effects active
 * - EFFECT-PLAY-020: Multiple sequential effect changes don't prevent playback restart
 * - EFFECT-PLAY-021: Rapid effect changes during playback don't stall frames
 * - EFFECT-PLAY-030: Playback continues after applying and then resetting effects
 * - EFFECT-PLAY-031: Full play/effect/reset/play cycle works end-to-end
 */

/**
 * Helper to apply color adjustments via the test API.
 * Uses the app's colorControls.setAdjustments() which triggers the
 * adjustmentsChanged event and updates both UI and viewer.
 */
async function applyColorAdjustments(
  page: import('@playwright/test').Page,
  adjustments: Record<string, number | boolean>
): Promise<void> {
  await page.evaluate((adj) => {
    const app = (window as any).__OPENRV_TEST__?.app;
    if (!app) throw new Error('Test helper not available');
    const colorControls = (app as any).colorControls;
    if (!colorControls) throw new Error('Color controls not available');
    colorControls.setAdjustments(adj);
  }, adjustments);
}

/**
 * Helper to reset color adjustments to defaults via the test API.
 */
async function resetColorAdjustments(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const app = (window as any).__OPENRV_TEST__?.app;
    if (!app) throw new Error('Test helper not available');
    const colorControls = (app as any).colorControls;
    if (!colorControls) throw new Error('Color controls not available');
    colorControls.reset();
  });
}

test.describe('Playback After Effects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await waitForMediaLoaded(page);
  });

  test.describe('Playback Continues After Single Effect', () => {
    test('EFFECT-PLAY-001: video continues playing after applying exposure adjustment', async ({ page }) => {
      // Verify mediabunny is being used
      const usingMediabunny = await isUsingMediabunny(page);
      expect(usingMediabunny).toBe(true);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Apply exposure adjustment while playing
      await applyColorAdjustments(page, { exposure: 1.5 });

      // Verify the exposure was applied
      const colorState = await getColorState(page);
      expect(colorState.exposure).toBeCloseTo(1.5, 1);

      // Verify playback is still active
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Wait for more frames to advance (proves playback didn't stall)
      const frameAfterEffect = state.currentFrame;
      await waitForFrameAtLeast(page, frameAfterEffect + 3);

      // Pause and verify state
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
      expect(state.currentFrame).toBeGreaterThan(frameAfterEffect);
    });

    test('EFFECT-PLAY-002: video continues playing after applying brightness adjustment', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Apply brightness adjustment while playing
      await applyColorAdjustments(page, { brightness: 0.5 });

      const colorState = await getColorState(page);
      expect(colorState.brightness).toBeCloseTo(0.5, 1);

      // Verify playback continues
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      const frameAfterEffect = state.currentFrame;
      await waitForFrameAtLeast(page, frameAfterEffect + 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(frameAfterEffect);
    });

    test('EFFECT-PLAY-003: video continues playing after applying contrast adjustment', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Apply contrast adjustment while playing
      await applyColorAdjustments(page, { contrast: 1.5 });

      const colorState = await getColorState(page);
      expect(colorState.contrast).toBeCloseTo(1.5, 1);

      // Verify playback continues
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      const frameAfterEffect = state.currentFrame;
      await waitForFrameAtLeast(page, frameAfterEffect + 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(frameAfterEffect);
    });

    test('EFFECT-PLAY-004: video continues playing after applying saturation adjustment', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Apply saturation adjustment while playing
      await applyColorAdjustments(page, { saturation: 1.8 });

      const colorState = await getColorState(page);
      expect(colorState.saturation).toBeCloseTo(1.8, 1);

      // Verify playback continues
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      const frameAfterEffect = state.currentFrame;
      await waitForFrameAtLeast(page, frameAfterEffect + 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(frameAfterEffect);
    });
  });

  test.describe('Play/Pause Cycle With Effects Active', () => {
    test('EFFECT-PLAY-010: play/pause/play cycle works with effects active', async ({ page }) => {
      // Apply effects before starting playback
      await applyColorAdjustments(page, { exposure: 1.0, saturation: 1.5, contrast: 1.3 });

      // Verify effects are applied
      const colorState = await getColorState(page);
      expect(colorState.exposure).toBeCloseTo(1.0, 1);
      expect(colorState.saturation).toBeCloseTo(1.5, 1);
      expect(colorState.contrast).toBeCloseTo(1.3, 1);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const pausedState = await getSessionState(page);
      const pausedFrame = pausedState.currentFrame;
      expect(pausedState.isPlaying).toBe(false);

      // Resume playback (this is the critical test - _pendingPlayPromise leak
      // would prevent this from working)
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Frames must advance past paused position
      await waitForFrameAtLeast(page, pausedFrame + 3);

      // Final pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.isPlaying).toBe(false);
      expect(finalState.currentFrame).toBeGreaterThan(pausedFrame);
    });

    test('EFFECT-PLAY-011: playback resumes after pause with multiple effects active', async ({ page }) => {
      // Start playback first
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Apply multiple effects during playback
      await applyColorAdjustments(page, {
        exposure: 0.8,
        brightness: 0.3,
        contrast: 1.4,
        saturation: 0.7,
        temperature: 20,
        tint: -10,
      });

      // Verify effects are applied
      const colorState = await getColorState(page);
      expect(colorState.exposure).toBeCloseTo(0.8, 1);
      expect(colorState.brightness).toBeCloseTo(0.3, 1);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const pausedFrame = (await getSessionState(page)).currentFrame;

      // Resume - the bug would cause this to fail
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, pausedFrame + 3);

      // Pause again
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(pausedFrame);

      // Verify effects are still active
      const finalColorState = await getColorState(page);
      expect(finalColorState.exposure).toBeCloseTo(0.8, 1);
      expect(finalColorState.saturation).toBeCloseTo(0.7, 1);
    });
  });

  test.describe('Multiple Effect Changes During Playback', () => {
    test('EFFECT-PLAY-020: multiple sequential effect changes don\'t prevent playback restart', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 2);

      // Apply effects one by one during playback
      await applyColorAdjustments(page, { exposure: 0.5 });
      await applyColorAdjustments(page, { brightness: 0.2 });
      await applyColorAdjustments(page, { contrast: 1.3 });
      await applyColorAdjustments(page, { saturation: 1.5 });
      await applyColorAdjustments(page, { temperature: 15 });

      // Verify playback is still active after all changes
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      const frameAfterEffects = state.currentFrame;
      await waitForFrameAtLeast(page, frameAfterEffects + 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const pausedFrame = (await getSessionState(page)).currentFrame;

      // Resume playback after multiple effect changes
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, pausedFrame + 3);

      // Final pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(pausedFrame);
    });

    test('EFFECT-PLAY-021: rapid effect changes during playback don\'t stall frames', async ({ page }) => {
      // Go to start
      await page.keyboard.press('Home');

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 2);

      const frameBeforeRapidChanges = (await getSessionState(page)).currentFrame;

      // Rapidly change effects
      for (let i = 0; i < 5; i++) {
        await applyColorAdjustments(page, { exposure: i * 0.3 });
        await applyColorAdjustments(page, { saturation: 1 + i * 0.1 });
      }

      // Playback should still be running
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Frames should have advanced despite rapid changes
      await waitForFrameAtLeast(page, frameBeforeRapidChanges + 2);

      // Pause and verify
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
      expect(state.currentFrame).toBeGreaterThan(frameBeforeRapidChanges);
    });
  });

  test.describe('Playback After Effect Reset', () => {
    test('EFFECT-PLAY-030: playback continues after applying and then resetting effects', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 3);

      // Apply effects
      await applyColorAdjustments(page, {
        exposure: 2.0,
        contrast: 1.8,
        saturation: 0.5,
        brightness: 0.4,
      });

      // Verify effects are applied
      let colorState = await getColorState(page);
      expect(colorState.exposure).toBeCloseTo(2.0, 1);

      // Wait for a few more frames to confirm playback continues with effects
      const frameWithEffects = (await getSessionState(page)).currentFrame;
      await waitForFrameAtLeast(page, frameWithEffects + 2);

      // Reset all effects
      await resetColorAdjustments(page);

      // Verify effects are reset
      colorState = await getColorState(page);
      expect(colorState.exposure).toBe(0);
      expect(colorState.contrast).toBe(1);
      expect(colorState.saturation).toBe(1);
      expect(colorState.brightness).toBe(0);

      // Verify playback is still active after reset
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      const frameAfterReset = state.currentFrame;
      await waitForFrameAtLeast(page, frameAfterReset + 3);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(frameAfterReset);
    });

    test('EFFECT-PLAY-031: full play/effect/reset/play cycle works end-to-end', async ({ page }) => {
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Step 1: Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, initialFrame + 3);

      // Step 2: Apply effects during playback
      await applyColorAdjustments(page, { exposure: 1.5, saturation: 1.8 });

      let colorState = await getColorState(page);
      expect(colorState.exposure).toBeCloseTo(1.5, 1);

      // Step 3: Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const frameAfterFirstPlay = (await getSessionState(page)).currentFrame;
      expect(frameAfterFirstPlay).toBeGreaterThan(initialFrame);

      // Step 4: Reset effects while paused
      await resetColorAdjustments(page);

      colorState = await getColorState(page);
      expect(colorState.exposure).toBe(0);
      expect(colorState.saturation).toBe(1);

      // Step 5: Resume playback after reset - this is the critical path
      // that the _pendingPlayPromise fix enables
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, frameAfterFirstPlay + 3);

      // Step 6: Apply new effects during resumed playback
      await applyColorAdjustments(page, { contrast: 1.6, brightness: -0.2 });

      colorState = await getColorState(page);
      expect(colorState.contrast).toBeCloseTo(1.6, 1);

      // Step 7: Verify frames still advancing
      const frameAfterNewEffects = (await getSessionState(page)).currentFrame;
      await waitForFrameAtLeast(page, frameAfterNewEffects + 2);

      // Step 8: Final pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const finalState = await getSessionState(page);
      expect(finalState.isPlaying).toBe(false);
      expect(finalState.currentFrame).toBeGreaterThan(frameAfterFirstPlay);
    });
  });
});
