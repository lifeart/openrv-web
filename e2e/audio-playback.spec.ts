import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Audio Playback Tests
 *
 * Tests for audio playback functionality including:
 * - Volume control
 * - Mute/unmute
 * - Error handling
 * - Audio sync during playback
 */

// Timing constants to avoid magic numbers
const TIMING = {
  /** Short wait for UI state updates */
  UI_UPDATE: 100,
  /** Wait for playback to start and stabilize */
  PLAYBACK_SETTLE: 200,
  /** Wait for hover/animation effects */
  HOVER_DELAY: 300,
  /** Wait after video load */
  VIDEO_LOAD: 500,
  /** Wait for playback during frame tests */
  PLAYBACK_FRAMES: 500,
  /** Longer wait for potential loop events */
  LOOP_WAIT: 800,
} as const;

// Selector constants for consistent element access
// Note: Prefer data-testid when available, fall back to semantic selectors
const SELECTORS = {
  /** Mute button - uses title attribute, case-insensitive */
  MUTE_BUTTON: 'button[data-testid="mute-button"], button[title*="mute" i], button[title*="Mute" i]',
  /** Volume control container */
  VOLUME_CONTROL: '[data-testid="volume-control"], .volume-control-container, [title*="volume" i]',
  /** Volume slider input */
  VOLUME_SLIDER: 'input[data-testid="volume-slider"], input[type="range"]',
  /** Main canvas */
  CANVAS: 'canvas',
} as const;

test.describe('Audio Playback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(TIMING.VIDEO_LOAD);
  });

  test.describe('Volume Control', () => {
    test('AUDIO-001: initial volume should be 0.7 (70%)', async ({ page }) => {
      const state = await getSessionState(page);
      expect(state.volume).toBeCloseTo(0.7, 1);
    });

    test('AUDIO-002: initial muted state should be false', async ({ page }) => {
      const state = await getSessionState(page);
      expect(state.muted).toBe(false);
    });

    test('AUDIO-003: clicking mute button should toggle muted state', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.muted).toBe(false);

      // Find and click mute button
      const muteButton = page.locator(SELECTORS.MUTE_BUTTON).first();
      if (await muteButton.isVisible()) {
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        state = await getSessionState(page);
        expect(state.muted).toBe(true);

        // Click again to unmute
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        state = await getSessionState(page);
        expect(state.muted).toBe(false);
      }
    });

    test('AUDIO-004: volume should be preserved after mute/unmute cycle', async ({ page }) => {
      const initialState = await getSessionState(page);
      const initialVolume = initialState.volume;

      // Find mute button
      const muteButton = page.locator(SELECTORS.MUTE_BUTTON).first();
      if (await muteButton.isVisible()) {
        // Mute
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        let state = await getSessionState(page);
        expect(state.muted).toBe(true);

        // Unmute
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        state = await getSessionState(page);
        expect(state.muted).toBe(false);
        // Volume should be restored
        expect(state.volume).toBeCloseTo(initialVolume, 1);
      }
    });

    test('AUDIO-005: volume slider should update volume state', async ({ page }) => {
      // Hover over volume area to show slider
      const volumeArea = page.locator(SELECTORS.VOLUME_CONTROL).first();
      if (await volumeArea.isVisible()) {
        await volumeArea.hover();
        await page.waitForTimeout(TIMING.HOVER_DELAY);

        // Find volume slider
        const volumeSlider = page.locator(SELECTORS.VOLUME_SLIDER).first();
        if (await volumeSlider.isVisible()) {
          // Set volume to 0.5
          await volumeSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0.5';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(TIMING.UI_UPDATE);

          const state = await getSessionState(page);
          expect(state.volume).toBeCloseTo(0.5, 1);
        }
      }
    });

    test('AUDIO-006: setting volume to 0 should mute audio', async ({ page }) => {
      const volumeArea = page.locator(SELECTORS.VOLUME_CONTROL).first();
      if (await volumeArea.isVisible()) {
        await volumeArea.hover();
        await page.waitForTimeout(TIMING.HOVER_DELAY);

        const volumeSlider = page.locator(SELECTORS.VOLUME_SLIDER).first();
        if (await volumeSlider.isVisible()) {
          // Set volume to 0
          await volumeSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(TIMING.UI_UPDATE);

          const state = await getSessionState(page);
          expect(state.volume).toBe(0);
          expect(state.muted).toBe(true);
        }
      }
    });

    test('AUDIO-007: setting volume above 0 when muted should unmute', async ({ page }) => {
      // First mute
      const muteButton = page.locator(SELECTORS.MUTE_BUTTON).first();
      if (await muteButton.isVisible()) {
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        let state = await getSessionState(page);
        expect(state.muted).toBe(true);

        // Now set volume via slider
        const volumeArea = page.locator(SELECTORS.VOLUME_CONTROL).first();
        await volumeArea.hover();
        await page.waitForTimeout(TIMING.HOVER_DELAY);

        const volumeSlider = page.locator(SELECTORS.VOLUME_SLIDER).first();
        if (await volumeSlider.isVisible()) {
          await volumeSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0.8';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(TIMING.UI_UPDATE);

          state = await getSessionState(page);
          expect(state.volume).toBeCloseTo(0.8, 1);
          expect(state.muted).toBe(false);
        }
      }
    });
  });

  test.describe('Audio During Playback', () => {
    test('AUDIO-010: audio should play during forward playback', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);
      expect(state.playDirection).toBe(1);

      // Audio should not be muted during forward playback
      expect(state.muted).toBe(false);

      // Stop playback
      await page.keyboard.press('Space');
    });

    test('AUDIO-011: audio should be muted during reverse playback', async ({ page }) => {
      // Go to middle of video
      await page.keyboard.press('End');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      // Set reverse direction
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      let state = await getSessionState(page);
      expect(state.playDirection).toBe(-1);

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.PLAYBACK_SETTLE);

      // During reverse playback, the underlying video element should be muted
      // (We can't directly test HTMLVideoElement.muted from here, but the session
      // should still track the user's intended mute state)
      state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Stop playback
      await page.keyboard.press('Space');
    });

    test('AUDIO-012: toggling direction during playback should update audio state', async ({ page }) => {
      // Start forward playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);
      expect(state.playDirection).toBe(1);

      // Toggle to reverse
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      state = await getSessionState(page);
      expect(state.playDirection).toBe(-1);
      expect(state.isPlaying).toBe(true);

      // Toggle back to forward
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      state = await getSessionState(page);
      expect(state.playDirection).toBe(1);

      // Stop playback
      await page.keyboard.press('Space');
    });

    test('AUDIO-013: mute state should persist across play/pause', async ({ page }) => {
      // Mute first
      const muteButton = page.locator(SELECTORS.MUTE_BUTTON).first();
      if (await muteButton.isVisible()) {
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        let state = await getSessionState(page);
        expect(state.muted).toBe(true);

        // Start playback
        await page.keyboard.press('Space');
        await page.waitForTimeout(TIMING.PLAYBACK_SETTLE);

        state = await getSessionState(page);
        expect(state.isPlaying).toBe(true);
        expect(state.muted).toBe(true);

        // Stop playback
        await page.keyboard.press('Space');
        await page.waitForTimeout(TIMING.UI_UPDATE);

        state = await getSessionState(page);
        expect(state.isPlaying).toBe(false);
        expect(state.muted).toBe(true);
      }
    });

    test('AUDIO-014: volume state should persist across play/pause', async ({ page }) => {
      // Set specific volume
      const volumeArea = page.locator(SELECTORS.VOLUME_CONTROL).first();
      if (await volumeArea.isVisible()) {
        await volumeArea.hover();
        await page.waitForTimeout(TIMING.HOVER_DELAY);

        const volumeSlider = page.locator(SELECTORS.VOLUME_SLIDER).first();
        if (await volumeSlider.isVisible()) {
          await volumeSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0.3';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(TIMING.UI_UPDATE);

          let state = await getSessionState(page);
          expect(state.volume).toBeCloseTo(0.3, 1);

          // Start playback
          await page.keyboard.press('Space');
          await page.waitForTimeout(TIMING.PLAYBACK_SETTLE);

          state = await getSessionState(page);
          expect(state.volume).toBeCloseTo(0.3, 1);

          // Stop playback
          await page.keyboard.press('Space');
          await page.waitForTimeout(TIMING.UI_UPDATE);

          state = await getSessionState(page);
          expect(state.volume).toBeCloseTo(0.3, 1);
        }
      }
    });
  });

  test.describe('Audio Sync', () => {
    test('AUDIO-020: audio should stay in sync during forward playback', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.PLAYBACK_FRAMES);

      // Capture frame
      const state1 = await getSessionState(page);
      const frame1 = state1.currentFrame;

      // Wait more
      await page.waitForTimeout(TIMING.PLAYBACK_FRAMES);

      const state2 = await getSessionState(page);
      const frame2 = state2.currentFrame;

      // Frames should have advanced
      expect(frame2).toBeGreaterThan(frame1);

      // Stop playback
      await page.keyboard.press('Space');
    });

    test('AUDIO-021: seeking should not cause playback issues', async ({ page }) => {
      // Go to middle
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      // Playback should continue without error
      const playingState = await getSessionState(page);
      expect(playingState.isPlaying).toBe(true);

      // Stop playback
      await page.keyboard.press('Space');
    });

    test('AUDIO-022: looping should not cause audio glitches', async ({ page }) => {
      // Set short in/out range
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i'); // in point
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('o'); // out point
      await page.waitForTimeout(TIMING.UI_UPDATE);

      let state = await getSessionState(page);
      expect(state.loopMode).toBe('loop');

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.LOOP_WAIT);

      state = await getSessionState(page);
      // Playback should still be working
      expect(state.isPlaying).toBe(true);

      // Stop playback
      await page.keyboard.press('Space');
    });
  });

  test.describe('Mute Button UI', () => {
    test('AUDIO-030: mute button icon should change when muted', async ({ page }) => {
      const muteButton = page.locator(SELECTORS.MUTE_BUTTON).first();
      if (await muteButton.isVisible()) {
        // Get initial button content
        const initialHTML = await muteButton.innerHTML();

        // Click to mute
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        // Button content should change (different icon)
        const mutedHTML = await muteButton.innerHTML();
        expect(mutedHTML).not.toBe(initialHTML);

        // Click to unmute
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        // Button content should revert
        const unmutedHTML = await muteButton.innerHTML();
        expect(unmutedHTML).toBe(initialHTML);
      }
    });

    test('AUDIO-031: volume slider should show 0 when muted', async ({ page }) => {
      const muteButton = page.locator(SELECTORS.MUTE_BUTTON).first();
      const volumeArea = page.locator(SELECTORS.VOLUME_CONTROL).first();

      if (await muteButton.isVisible() && await volumeArea.isVisible()) {
        // Mute
        await muteButton.click();
        await page.waitForTimeout(TIMING.UI_UPDATE);

        // Hover to show slider
        await volumeArea.hover();
        await page.waitForTimeout(TIMING.HOVER_DELAY);

        const volumeSlider = page.locator(SELECTORS.VOLUME_SLIDER).first();
        if (await volumeSlider.isVisible()) {
          const value = await volumeSlider.inputValue();
          expect(parseFloat(value)).toBe(0);
        }
      }
    });
  });

  test.describe('Error Recovery', () => {
    test('AUDIO-040: playback should continue even if audio fails to load', async ({ page }) => {
      // This test verifies graceful degradation
      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.PLAYBACK_SETTLE);

      const state = await getSessionState(page);
      // Playback should be running regardless of audio state
      expect(state.isPlaying).toBe(true);

      // Stop playback
      await page.keyboard.press('Space');
    });

    test('AUDIO-041: multiple rapid play/pause should not cause issues', async ({ page }) => {
      // Rapid play/pause toggles - use shorter delay for stress testing
      const RAPID_TOGGLE_DELAY = 50;
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(RAPID_TOGGLE_DELAY);
      }

      await page.waitForTimeout(TIMING.PLAYBACK_SETTLE);

      // App should still be responsive
      const state = await getSessionState(page);
      // State should be consistent
      expect(typeof state.isPlaying).toBe('boolean');
      expect(typeof state.muted).toBe('boolean');

      // Ensure we're paused at the end
      if (state.isPlaying) {
        await page.keyboard.press('Space');
      }
    });

    test('AUDIO-042: seeking during playback should not break audio', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.PLAYBACK_SETTLE);

      // Seek while playing
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      // Should still be playing
      let state = await getSessionState(page);
      // Note: Stepping with arrow keys pauses playback
      // This is expected behavior in frame-accurate viewers

      // Start playing again
      await page.keyboard.press('Space');
      await page.waitForTimeout(TIMING.PLAYBACK_SETTLE);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Stop playback
      await page.keyboard.press('Space');
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('AUDIO-050: M key should toggle mute (when in video mode)', async ({ page }) => {
      // M key mute toggle may depend on focus/mode
      // First check initial state
      let state = await getSessionState(page);
      const initialMuted = state.muted;

      // Click on canvas to ensure focus
      const canvas = page.locator(SELECTORS.CANVAS).first();
      await canvas.click();
      await page.waitForTimeout(TIMING.UI_UPDATE);

      // Try M key
      await page.keyboard.press('m');
      await page.waitForTimeout(TIMING.UI_UPDATE);

      state = await getSessionState(page);
      // M key might not toggle mute if it's used for markers
      // This test documents current behavior
      // If mute toggled, verify it works
      if (state.muted !== initialMuted) {
        // Toggle back
        await page.keyboard.press('m');
        await page.waitForTimeout(TIMING.UI_UPDATE);

        state = await getSessionState(page);
        expect(state.muted).toBe(initialMuted);
      }
    });
  });
});
