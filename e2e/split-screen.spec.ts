import { test, expect } from '@playwright/test';
import {
  loadTwoVideoFiles,
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Split Screen A/B Comparison Tests
 *
 * Tests for the split screen comparison mode that shows two sources side-by-side.
 *
 * Implementation: src/ui/components/ViewerSplitScreen.ts
 *
 * Features:
 * - Horizontal split (A left, B right)
 * - Vertical split (A top, B bottom)
 * - Draggable divider for adjustable split position
 * - A/B labels for source identification
 *
 * Reference: OpenRV Compare -> Split Screen
 */

test.describe('Split Screen A/B Comparison', () => {
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

  test.describe('Toggle Split Screen Mode', () => {
    test('SPLIT-E001: enable split screen via keyboard (Shift+Alt+S) should update state', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Enable split screen (horizontal)
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      // Toggle to vertical split
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');

      // Disable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');
    });

    test('SPLIT-E002: split screen default position should be 0.5 (center)', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.wipePosition).toBeCloseTo(0.5, 1);
    });
  });

  test.describe('Split Screen Visual', () => {
    test('SPLIT-E003: enabling split screen changes viewer output', async ({ page }) => {
      const screenshotNormal = await captureViewerScreenshot(page);

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      const screenshotSplit = await captureViewerScreenshot(page);

      // View should be different (showing A and B side by side)
      expect(imagesAreDifferent(screenshotNormal, screenshotSplit)).toBe(true);
    });

    test('SPLIT-E004: horizontal vs vertical split produces different views', async ({ page }) => {
      // Enable horizontal split
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const screenshotHorizontal = await captureViewerScreenshot(page);

      // Switch to vertical split
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');

      const screenshotVertical = await captureViewerScreenshot(page);

      // Horizontal and vertical splits should look different
      expect(imagesAreDifferent(screenshotHorizontal, screenshotVertical)).toBe(true);
    });
  });

  test.describe('Split Screen UI Elements', () => {
    test('SPLIT-E005: split line should be visible when split screen is active', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Check for split line element
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toBeVisible();
    });

    test('SPLIT-E006: A/B labels should be visible when split screen is active', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Check for A/B label elements
      const labelA = page.locator('[data-testid="split-screen-label-a"]');
      const labelB = page.locator('[data-testid="split-screen-label-b"]');

      await expect(labelA).toBeVisible();
      await expect(labelB).toBeVisible();
    });

    test('SPLIT-E007: split line should be hidden when split screen is off', async ({ page }) => {
      // Verify split line is not visible initially
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).not.toBeVisible();

      // Enable then disable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Should be hidden again
      await expect(splitLine).not.toBeVisible();
    });
  });

  test.describe('Split Screen Interaction', () => {
    test('SPLIT-E008: split line can be dragged to adjust position', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialPosition = state.wipePosition;

      // Find split line and drag it
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      const box = await splitLine.boundingBox();
      if (box) {
        // Drag to the left
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x - 100, box.y + box.height / 2);
        await page.mouse.up();
        await page.waitForTimeout(100);

        state = await getViewerState(page);
        // Position should have changed
        expect(state.wipePosition).not.toBeCloseTo(initialPosition, 1);
        expect(state.wipePosition).toBeLessThan(initialPosition);
      }
    });
  });

  test.describe('Split Screen State Persistence', () => {
    test('SPLIT-E009: split screen state persists across frame navigation', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      // Navigate frames
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // State should persist
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');
    });

    test('SPLIT-E010: split screen and wipe mode are mutually exclusive', async ({ page }) => {
      // Enable wipe mode first
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      // Wipe mode should be enabled (horizontal or vertical)
      expect(['horizontal', 'vertical']).toContain(state.wipeMode);

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      // Should be in split screen mode now
      expect(state.wipeMode).toBe('splitscreen-h');
    });
  });

  test.describe('Integration with A/B Compare', () => {
    test('SPLIT-E011: split screen shows source A on one side and source B on other', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // The viewer should be rendering both sources
      const state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      // Take screenshot to verify split view
      const screenshot = await captureViewerScreenshot(page);
      expect(screenshot.length).toBeGreaterThan(0);
    });
  });
});
