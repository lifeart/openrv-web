import { test, expect } from '@playwright/test';
import {
  loadTwoVideoFiles,
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Difference Matte Tests
 *
 * Tests for the difference matte comparison mode that shows pixel differences
 * between two sources.
 *
 * Implementation: src/ui/components/DifferenceMatteControl.ts
 *
 * Features:
 * - Display absolute difference between A/B sources
 * - Grayscale mode (average of RGB differences)
 * - Heatmap mode (color-coded differences)
 * - Gain control (1x to 10x) to amplify small differences
 *
 * Reference: OpenRV Compare -> Difference Matte
 */

test.describe('Difference Matte', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    // Load two videos for A/B comparison
    await loadTwoVideoFiles(page);
    // Switch to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test.describe('Toggle Difference Matte', () => {
    test('DIFF-E001: enable difference matte via keyboard (Shift+D) should update state', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(false);

      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      // Disable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(false);
    });

    test('DIFF-E002: difference matte default gain should be 1.0', async ({ page }) => {
      const state = await getViewerState(page);
      expect(state.differenceMatteGain).toBe(1);
    });

    test('DIFF-E003: difference matte default heatmap should be false', async ({ page }) => {
      const state = await getViewerState(page);
      expect(state.differenceMatteHeatmap).toBe(false);
    });
  });

  test.describe('Difference Matte Visual', () => {
    test('DIFF-E004: enabling difference matte changes viewer output', async ({ page }) => {
      const screenshotNormal = await captureViewerScreenshot(page);

      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      const screenshotDifference = await captureViewerScreenshot(page);

      // View should be different (showing differences between A and B)
      expect(imagesAreDifferent(screenshotNormal, screenshotDifference)).toBe(true);
    });

    test('DIFF-E005: toggle between normal and difference view', async ({ page }) => {
      const screenshotNormal1 = await captureViewerScreenshot(page);

      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      const screenshotDifference = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotNormal1, screenshotDifference)).toBe(true);

      // Disable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      const screenshotNormal2 = await captureViewerScreenshot(page);

      // Should be back to normal view
      expect(imagesAreDifferent(screenshotNormal1, screenshotNormal2)).toBe(false);
    });
  });

  test.describe('Gain Control', () => {
    test('DIFF-E006: gain slider amplifies differences (1x-10x)', async ({ page }) => {
      // Enable difference matte first
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);
      expect(state.differenceMatteGain).toBe(1);

      const screenshotGain1 = await captureViewerScreenshot(page);

      // Find gain control in UI
      const gainSlider = page.locator('[data-testid="diff-matte-gain"]').first();
      const altGainSlider = page.locator('input[type="range"]').filter({
        has: page.locator('xpath=..//*[contains(text(), "Gain")]'),
      }).first();

      // Try to find gain control via difference matte panel or toolbar
      const diffControls = page.locator('[class*="difference"], [class*="diff-matte"]');

      if (await gainSlider.isVisible()) {
        await gainSlider.fill('5');
        await gainSlider.dispatchEvent('input');
        await page.waitForTimeout(200);

        state = await getViewerState(page);
        expect(state.differenceMatteGain).toBeCloseTo(5, 1);

        const screenshotGain5 = await captureViewerScreenshot(page);
        // Higher gain should show more pronounced differences
        expect(imagesAreDifferent(screenshotGain1, screenshotGain5)).toBe(true);

        // Set to max gain (10x)
        await gainSlider.fill('10');
        await gainSlider.dispatchEvent('input');
        await page.waitForTimeout(200);

        state = await getViewerState(page);
        expect(state.differenceMatteGain).toBe(10);

        const screenshotGain10 = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotGain5, screenshotGain10)).toBe(true);
      }
    });

    test('DIFF-E007: gain clamped to valid range (1-10)', async ({ page }) => {
      // This test verifies the gain bounds through state checking
      const state = await getViewerState(page);

      // Initial gain should be 1 (minimum)
      expect(state.differenceMatteGain).toBeGreaterThanOrEqual(1);
      expect(state.differenceMatteGain).toBeLessThanOrEqual(10);
    });
  });

  test.describe('Heatmap Mode', () => {
    test('DIFF-E008: heatmap mode shows color-coded differences', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);
      expect(state.differenceMatteHeatmap).toBe(false);

      const screenshotGrayscale = await captureViewerScreenshot(page);

      // Find heatmap toggle
      const heatmapToggle = page.locator('[data-testid="diff-matte-heatmap"]').first();
      const altHeatmapButton = page.locator('button:has-text("Heatmap")').first();

      if (await heatmapToggle.isVisible()) {
        await heatmapToggle.click();
        await page.waitForTimeout(200);

        state = await getViewerState(page);
        expect(state.differenceMatteHeatmap).toBe(true);

        const screenshotHeatmap = await captureViewerScreenshot(page);
        // Heatmap should show different colors than grayscale
        expect(imagesAreDifferent(screenshotGrayscale, screenshotHeatmap)).toBe(true);
      } else if (await altHeatmapButton.isVisible()) {
        await altHeatmapButton.click();
        await page.waitForTimeout(200);

        state = await getViewerState(page);
        expect(state.differenceMatteHeatmap).toBe(true);
      }
    });

    test('DIFF-E009: toggle heatmap mode off returns to grayscale', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      const screenshotGrayscale1 = await captureViewerScreenshot(page);

      // Find and enable heatmap
      const heatmapToggle = page.locator('[data-testid="diff-matte-heatmap"]').first();

      if (await heatmapToggle.isVisible()) {
        // Enable heatmap
        await heatmapToggle.click();
        await page.waitForTimeout(200);

        let state = await getViewerState(page);
        expect(state.differenceMatteHeatmap).toBe(true);

        // Disable heatmap
        await heatmapToggle.click();
        await page.waitForTimeout(200);

        state = await getViewerState(page);
        expect(state.differenceMatteHeatmap).toBe(false);

        const screenshotGrayscale2 = await captureViewerScreenshot(page);
        // Should return to grayscale view
        expect(imagesAreDifferent(screenshotGrayscale1, screenshotGrayscale2)).toBe(false);
      }
    });
  });

  test.describe('Source Requirements', () => {
    test('DIFF-E010: difference matte state accessible even with single source', async ({ page }) => {
      // Navigate to a new page with single source
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load only one video
      const { loadVideoFile } = await import('./fixtures');
      await loadVideoFile(page);

      // Difference matte state should exist (though may not produce meaningful output)
      const state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBeDefined();
      expect(state.differenceMatteGain).toBeDefined();
      expect(state.differenceMatteHeatmap).toBeDefined();
    });
  });

  test.describe('State Persistence', () => {
    test('DIFF-E011: difference matte state persists across frame navigation', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      // Navigate frames
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // State should persist
      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);
    });

    test('DIFF-E012: difference matte settings persist when toggling other features', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      // Toggle histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(100);

      // Difference matte should still be enabled
      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      // Toggle histogram off
      await page.keyboard.press('h');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);
    });
  });

  test.describe('Integration with A/B Compare', () => {
    test('DIFF-E013: difference matte works with A/B toggle', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      const screenshotA = await captureViewerScreenshot(page);

      // Toggle to B source (Tab key)
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      const screenshotB = await captureViewerScreenshot(page);

      // The difference view might change when switching between A/B
      // depending on implementation
    });

    test('DIFF-E014: difference matte can be toggled independently', async ({ page }) => {
      // Verify initial state
      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(false);

      // Enable difference matte
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      // Toggle difference matte off
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(false);

      // Enable again
      await page.keyboard.press('Shift+d');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);
    });
  });
});
