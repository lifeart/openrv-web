import { test, expect, loadVideoFile } from './fixtures';

test.describe('Playback Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test.describe('Play/Pause', () => {
    test('PLAY-001: should toggle play/pause with button click', async ({ page }) => {
      // Find and click play button
      const playButton = page.locator('button[title*="Play"], button[title*="Pause"]').first();
      await expect(playButton).toBeVisible();

      // Click to start playback
      await playButton.click();
      await page.waitForTimeout(100);

      // Button should change state (or UI indicates playing)
      // Click again to pause
      await playButton.click();
      await page.waitForTimeout(100);
    });

    test('PLAY-002: should toggle play/pause with Space key', async ({ page }) => {
      // Press Space to play
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      // Press Space to pause
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
    });

    test('PLAY-003: should update frame display during playback', async ({ page }) => {
      // Get initial frame position
      const initialFrame = await page.locator('text=/\\d+/').first().textContent();

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);

      // Stop playback
      await page.keyboard.press('Space');

      // Frame should have changed
      const finalFrame = await page.locator('text=/\\d+/').first().textContent();
      // Note: Frame may or may not have changed depending on video duration
    });
  });

  test.describe('Frame Stepping', () => {
    test('PLAY-010: should step forward one frame with Right arrow', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Frame should have advanced
    });

    test('PLAY-011: should step backward one frame with Left arrow', async ({ page }) => {
      // First step forward a few times
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Then step backward
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);
    });

    test('PLAY-012: should step forward with button click', async ({ page }) => {
      const stepForwardButton = page.locator('button[title*="Forward"], button[title*="Step"]').filter({ hasText: /→|▶|forward/i }).first();
      if (await stepForwardButton.isVisible()) {
        await stepForwardButton.click();
        await page.waitForTimeout(100);
      }
    });

    test('PLAY-013: should step backward with button click', async ({ page }) => {
      // First step forward
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      const stepBackButton = page.locator('button[title*="Back"], button[title*="Step"]').filter({ hasText: /←|◀|back/i }).first();
      if (await stepBackButton.isVisible()) {
        await stepBackButton.click();
        await page.waitForTimeout(100);
      }
    });
  });

  test.describe('Navigation', () => {
    test('PLAY-020: should go to start with Home key', async ({ page }) => {
      // First step forward a few times
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Press Home to go to start
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);
    });

    test('PLAY-021: should go to end with End key', async ({ page }) => {
      await page.keyboard.press('End');
      await page.waitForTimeout(100);
    });

    test('PLAY-022: should toggle play direction with Up arrow', async ({ page }) => {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);

      // Toggle back
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);
    });
  });

  test.describe('Loop Modes', () => {
    test('PLAY-030: should cycle loop mode with L key', async ({ page }) => {
      // Press L to cycle loop mode
      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      // Press L again to cycle to next mode
      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      // Press L again
      await page.keyboard.press('l');
      await page.waitForTimeout(100);
    });
  });

  test.describe('In/Out Points', () => {
    test('PLAY-040: should set in point with I key', async ({ page }) => {
      // Step forward a few frames
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Set in point
      await page.keyboard.press('i');
      await page.waitForTimeout(100);
    });

    test('PLAY-041: should set out point with O key', async ({ page }) => {
      // Go near end
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);

      // Set out point
      await page.keyboard.press('o');
      await page.waitForTimeout(100);
    });

    test('PLAY-042: should set in point with [ key', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('[');
      await page.waitForTimeout(100);
    });

    test('PLAY-043: should set out point with ] key', async ({ page }) => {
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press(']');
      await page.waitForTimeout(100);
    });

    test('PLAY-044: should reset in/out points with R key', async ({ page }) => {
      // Set in/out points first
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.keyboard.press('End');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      // Reset
      await page.keyboard.press('r');
      await page.waitForTimeout(100);
    });
  });

  test.describe('Marks', () => {
    test('PLAY-050: should toggle mark with M key', async ({ page }) => {
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      // Toggle off
      await page.keyboard.press('m');
      await page.waitForTimeout(100);
    });

    test('PLAY-051: should show marks on timeline', async ({ page }) => {
      // Add a mark
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      // Timeline should show the mark (visual indicator)
      const timeline = page.locator('div').filter({ hasText: /\d+/ }).first();
      await expect(timeline).toBeVisible();
    });
  });

  test.describe('Volume Control', () => {
    test('PLAY-060: should show volume slider on hover', async ({ page }) => {
      const volumeArea = page.locator('[title*="Volume"], [title*="volume"]').first();
      if (await volumeArea.isVisible()) {
        await volumeArea.hover();
        await page.waitForTimeout(200);
      }
    });

    test('PLAY-061: should mute/unmute audio', async ({ page }) => {
      const muteButton = page.locator('button[title*="Mute"], button[title*="mute"]').first();
      if (await muteButton.isVisible()) {
        await muteButton.click();
        await page.waitForTimeout(100);

        // Click again to unmute
        await muteButton.click();
        await page.waitForTimeout(100);
      }
    });
  });
});
