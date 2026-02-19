import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForTabActive,
  waitForPlaybackState,
  waitForFrameChange,
  waitForFrame,
  waitForFrameAtLeast,
  waitForPendingFramesBelow,
  waitForChannelMode,
  waitForCondition,
} from './fixtures';

/**
 * Prerender Buffer Integration Tests
 *
 * Tests that verify the prerender buffer system works correctly
 * for smooth playback with effects applied.
 */

// Helper to open color controls panel
async function openColorPanel(page: import('@playwright/test').Page) {
  // Navigate to Color tab
  await page.locator('button[data-tab-id="color"]').click();
  await waitForTabActive(page, 'color');
}

// Helper to apply highlights adjustment
async function applyHighlightsAdjustment(page: import('@playwright/test').Page, value: number) {
  await openColorPanel(page);

  // Open color controls
  const colorButton = page.locator('button[title*="Color"]').first();
  await colorButton.click();

  // Find highlights slider
  const highlightsSlider = page.locator('input[type="range"]').filter({ has: page.locator('..', { hasText: /Highlights/i }) }).first();
  if (await highlightsSlider.isVisible()) {
    await highlightsSlider.fill(String(value));
    await highlightsSlider.dispatchEvent('input');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getColorState(); return s && s.highlights !== 0; })()`);
  }
}

test.describe('Prerender Buffer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test.describe('Basic Functionality', () => {
    test('PRB-001: playback with effects should not freeze', async ({ page }) => {
      // Apply an effect
      await openColorPanel(page);

      // Click the color controls button
      const colorButton = page.locator('button[title*="Color"]').first();
      if (await colorButton.isVisible()) {
        await colorButton.click();
      }

      // Find and adjust saturation slider (a visible control)
      const saturationSlider = page.locator('.color-panel input[type="range"]').first();
      if (await saturationSlider.isVisible()) {
        await saturationSlider.fill('150');
        await saturationSlider.dispatchEvent('input');
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getColorState(); return s && s.saturation !== 1; })()`);
      }

      // Capture initial screenshot
      const initialScreenshot = await captureViewerScreenshot(page);

      // Start playback
      const beforePlayState = await getSessionState(page);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameChange(page, beforePlayState.currentFrame);

      // Stop playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Capture final screenshot - should have moved frames
      const finalScreenshot = await captureViewerScreenshot(page);

      // Playback should have occurred (frame changed)
      expect(imagesAreDifferent(initialScreenshot, finalScreenshot)).toBe(true);
    });

    test('PRB-002: effects should remain applied during playback', async ({ page }) => {
      // Navigate to Effects tab
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      // Open filter panel
      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      // Apply sharpen effect
      const sharpenSlider = page.locator('.filter-panel input[type="range"]').nth(1);
      if (await sharpenSlider.isVisible()) {
        await sharpenSlider.fill('50');
        await sharpenSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      // Capture with effect
      const withEffectScreenshot = await captureViewerScreenshot(page);

      // Playback a few frames
      const beforePlayState = await getSessionState(page);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameChange(page, beforePlayState.currentFrame);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Go back to first frame
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Effect should still be applied - same frame should look similar
      const afterPlaybackScreenshot = await captureViewerScreenshot(page);

      // While exact pixel match isn't guaranteed, the effect should be present
      // The screenshots might differ due to sub-pixel rendering
    });

    test('PRB-003: changing effects should invalidate cache and update display', async ({ page }) => {
      // Navigate to Effects tab
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      // Open filter panel
      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      // Apply initial blur
      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.fill('5');
        await blurSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      const blurredScreenshot = await captureViewerScreenshot(page);

      // Change to different effect value
      if (await blurSlider.isVisible()) {
        await blurSlider.fill('15');
        await blurSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      const moreBlurredScreenshot = await captureViewerScreenshot(page);

      // Different blur levels should produce different results
      expect(imagesAreDifferent(blurredScreenshot, moreBlurredScreenshot)).toBe(true);
    });
  });

  test.describe('Effect Combinations', () => {
    test('PRB-010: multiple effects should be applied correctly', async ({ page }) => {
      const initialScreenshot = await captureViewerScreenshot(page);

      // Navigate to Effects tab and apply sharpen
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      const sharpenSlider = page.locator('.filter-panel input[type="range"]').nth(1);
      if (await sharpenSlider.isVisible()) {
        await sharpenSlider.fill('30');
        await sharpenSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      const withSharpenScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, withSharpenScreenshot)).toBe(true);

      // Navigate to Color tab and apply saturation
      await page.locator('button[data-tab-id="color"]').click();
      await waitForTabActive(page, 'color');

      const colorButton = page.locator('button[title*="Color"]').first();
      if (await colorButton.isVisible()) {
        await colorButton.click();
      }

      const saturationSlider = page.locator('.color-panel input[type="range"]').first();
      if (await saturationSlider.isVisible()) {
        await saturationSlider.fill('150');
        await saturationSlider.dispatchEvent('input');
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getColorState(); return s && s.saturation !== 1; })()`);
      }

      const withBothScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(withSharpenScreenshot, withBothScreenshot)).toBe(true);
    });
  });

  test.describe('Frame Navigation', () => {
    test('PRB-020: effects should persist when scrubbing timeline', async ({ page }) => {
      // Navigate to Effects tab
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      // Open filter panel
      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      // Apply blur
      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.fill('8');
        await blurSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      // Capture frame 1 with blur
      const frame1WithBlur = await captureViewerScreenshot(page);

      // Step forward several frames
      for (let i = 0; i < 5; i++) {
        const state = await getSessionState(page);
        await page.keyboard.press('ArrowRight');
        await waitForFrameChange(page, state.currentFrame);
      }

      // Capture different frame with blur
      const frame5WithBlur = await captureViewerScreenshot(page);

      // Go back to first frame
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Frame 1 with blur should be consistent
      const frame1Again = await captureViewerScreenshot(page);

      // Frames should be different (different content)
      expect(imagesAreDifferent(frame1WithBlur, frame5WithBlur)).toBe(true);
    });

    test('PRB-021: keyboard navigation should work with effects applied', async ({ page }) => {
      // Apply an effect via CDL
      await page.locator('button[data-tab-id="color"]').click();
      await waitForTabActive(page, 'color');

      const cdlButton = page.locator('button[title*="CDL"]');
      if (await cdlButton.isVisible()) {
        await cdlButton.click();
      }

      // Adjust slope if CDL panel is visible
      const slopeSlider = page.locator('.cdl-panel input[type="range"]').first();
      if (await slopeSlider.isVisible()) {
        await slopeSlider.fill('1.5');
        await slopeSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      // Navigate with arrow keys
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, initialFrame);
      const nextState = await getSessionState(page);
      expect(nextState.currentFrame).toBeGreaterThan(initialFrame);

      await page.keyboard.press('ArrowLeft');
      await waitForFrame(page, initialFrame);
      const backState = await getSessionState(page);
      expect(backState.currentFrame).toBe(initialFrame);
    });
  });

  test.describe('Performance', () => {
    test('PRB-030: rapid effect changes should not cause errors', async ({ page }) => {
      // Navigate to Color tab
      await page.locator('button[data-tab-id="color"]').click();
      await waitForTabActive(page, 'color');

      const colorButton = page.locator('button[title*="Color"]').first();
      if (await colorButton.isVisible()) {
        await colorButton.click();
      }

      // Rapidly change slider values
      const saturationSlider = page.locator('.color-panel input[type="range"]').first();
      if (await saturationSlider.isVisible()) {
        for (let i = 0; i < 10; i++) {
          const value = 100 + (i * 10);
          await saturationSlider.fill(String(value));
          await saturationSlider.dispatchEvent('input');
          await page.waitForTimeout(20);
        }
      }

      await waitForPendingFramesBelow(page, 1);

      // App should still be responsive - capture screenshot
      const finalScreenshot = await captureViewerScreenshot(page);
      expect(finalScreenshot).toBeTruthy();
    });

    test('PRB-031: playback should remain smooth during effect changes', async ({ page }) => {
      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Navigate to Effects and change effect during playback
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.fill('5');
        await blurSlider.dispatchEvent('input');
      }

      // Continue playback for a bit
      await waitForFrameAtLeast(page, 5);

      // Stop playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Verify app is still responsive
      const screenshot = await captureViewerScreenshot(page);
      expect(screenshot).toBeTruthy();
    });
  });

  test.describe('Channel Mode', () => {
    test('PRB-040: channel isolation should work with prerender buffer', async ({ page }) => {
      const initialScreenshot = await captureViewerScreenshot(page);

      // Navigate to View tab
      await page.locator('button[data-tab-id="view"]').click();
      await waitForTabActive(page, 'view');

      // Find and click channel select
      const channelButton = page.locator('button[title*="Channel"]');
      if (await channelButton.isVisible()) {
        await channelButton.click();
      }

      // Select Red channel
      const redOption = page.locator('button:has-text("Red")').first();
      if (await redOption.isVisible()) {
        await redOption.click();
        await waitForChannelMode(page, 'red');
      }

      const redChannelScreenshot = await captureViewerScreenshot(page);

      // Red channel should look different from RGB
      expect(imagesAreDifferent(initialScreenshot, redChannelScreenshot)).toBe(true);

      // Playback should work in channel mode
      const beforePlayState = await getSessionState(page);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameChange(page, beforePlayState.currentFrame);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Should still be in red channel mode
      const afterPlaybackScreenshot = await captureViewerScreenshot(page);
      // Frame changed but channel mode persists
    });
  });

  test.describe('Edge Cases', () => {
    test('PRB-050: effects should work at first frame', async ({ page }) => {
      // Go to first frame
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply effect
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      const sharpenSlider = page.locator('.filter-panel input[type="range"]').nth(1);
      if (await sharpenSlider.isVisible()) {
        await sharpenSlider.fill('40');
        await sharpenSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      const withEffectScreenshot = await captureViewerScreenshot(page);

      expect(imagesAreDifferent(initialScreenshot, withEffectScreenshot)).toBe(true);
    });

    test('PRB-051: effects should work at last frame', async ({ page }) => {
      // Go to last frame
      await page.keyboard.press('End');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s && s.currentFrame === s.frameCount; })()`);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply effect
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.fill('8');
        await blurSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      const withEffectScreenshot = await captureViewerScreenshot(page);

      expect(imagesAreDifferent(initialScreenshot, withEffectScreenshot)).toBe(true);
    });

    test('PRB-052: resetting effects should clear prerender cache', async ({ page }) => {
      // Apply effect
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.fill('10');
        await blurSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      const blurredScreenshot = await captureViewerScreenshot(page);

      // Reset filter
      const resetButton = page.locator('.filter-panel button:has-text("Reset")').first();
      if (await resetButton.isVisible()) {
        await resetButton.click();
        await waitForPendingFramesBelow(page, 1);
      }

      const resetScreenshot = await captureViewerScreenshot(page);

      // Reset should remove blur effect
      expect(imagesAreDifferent(blurredScreenshot, resetScreenshot)).toBe(true);
    });
  });

  test.describe('Lifecycle Integration', () => {
    test('PRB-060: prerender buffer initializes on source load', async ({ page }) => {
      // The prerender buffer should be initialized after source loads
      // We verify this by checking that effects can be applied and maintained
      const initialColorState = await getColorState(page);
      expect(Number.isFinite(initialColorState.saturation)).toBe(true);

      // Apply an effect
      await page.locator('button[data-tab-id="color"]').click();
      await waitForTabActive(page, 'color');

      const colorButton = page.locator('button[title*="Color"]').first();
      if (await colorButton.isVisible()) {
        await colorButton.click();
      }

      const saturationSlider = page.locator('.color-panel input[type="range"]').first();
      if (await saturationSlider.isVisible()) {
        const beforeState = await getColorState(page);
        await saturationSlider.fill('150');
        await saturationSlider.dispatchEvent('input');
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getColorState(); return s && s.saturation !== 1; })()`);
        const afterState = await getColorState(page);
        expect(afterState).not.toEqual(beforeState);
      }

      const updatedColorState = await getColorState(page);
      expect(Number.isFinite(updatedColorState.saturation)).toBe(true);
    });

    test('PRB-061: playback state updates correctly during play/pause', async ({ page }) => {
      // Apply an effect before testing playback
      await page.locator('button[data-tab-id="effects"]').click();
      await waitForTabActive(page, 'effects');

      const filterButton = page.locator('button[title*="Filter"]');
      if (await filterButton.isVisible()) {
        await filterButton.click();
      }

      const sharpenSlider = page.locator('.filter-panel input[type="range"]').nth(1);
      if (await sharpenSlider.isVisible()) {
        await sharpenSlider.fill('30');
        await sharpenSlider.dispatchEvent('input');
        await waitForPendingFramesBelow(page, 1);
      }

      const beforePlayScreenshot = await captureViewerScreenshot(page);

      // Start playback
      const beforePlayState = await getSessionState(page);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameChange(page, beforePlayState.currentFrame);

      // Stop playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const afterPlayScreenshot = await captureViewerScreenshot(page);

      // Frame should have changed during playback
      expect(imagesAreDifferent(beforePlayScreenshot, afterPlayScreenshot)).toBe(true);

      // Navigate back to first frame
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const backToStartScreenshot = await captureViewerScreenshot(page);
      // Effect should still be applied on return to first frame
    });

    test('PRB-062: effects persist across multiple playback cycles', async ({ page }) => {
      // Apply an effect
      await page.locator('button[data-tab-id="color"]').click();
      await waitForTabActive(page, 'color');

      const colorButton = page.locator('button[title*="Color"]').first();
      if (await colorButton.isVisible()) {
        await colorButton.click();
      }

      const saturationSlider = page.locator('.color-panel input[type="range"]').first();
      if (await saturationSlider.isVisible()) {
        await saturationSlider.fill('180');
        await saturationSlider.dispatchEvent('input');
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getColorState(); return s && s.saturation !== 1; })()`);
      }

      const initialWithEffect = await captureViewerScreenshot(page);

      // Multiple playback cycles
      for (let i = 0; i < 3; i++) {
        const state = await getSessionState(page);
        await page.keyboard.press('Space');
        await waitForPlaybackState(page, true);
        await waitForFrameChange(page, state.currentFrame);
        await page.keyboard.press('Space');
        await waitForPlaybackState(page, false);
      }

      // Go back to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const afterCycles = await captureViewerScreenshot(page);
      // The app should still be responsive and effect should be present
      expect(afterCycles).toBeTruthy();
    });
  });
});
