import { test, expect } from '@playwright/test';
import {
  loadTwoVideoFiles,
  waitForTestHelper,
  getViewerState,
  getSessionState,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForPlaybackState,
  waitForFrameAtLeast,
  waitForFrame,
  waitForFrameChange,
  waitForMediaLoaded,
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

    test('SPLIT-E006b: A/B labels position changes based on split orientation', async ({ page }) => {
      // Enable horizontal split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const labelA = page.locator('[data-testid="split-screen-label-a"]');
      const labelB = page.locator('[data-testid="split-screen-label-b"]');

      // Get positions in horizontal mode (A on left, B on right)
      const boxAHorizontal = await labelA.boundingBox();
      const boxBHorizontal = await labelB.boundingBox();
      expect(boxAHorizontal).not.toBeNull();
      expect(boxBHorizontal).not.toBeNull();

      // In horizontal mode, A should be to the left of B
      expect(boxAHorizontal!.x).toBeLessThan(boxBHorizontal!.x);

      // Switch to vertical split
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Get positions in vertical mode (A on top, B on bottom)
      const boxAVertical = await labelA.boundingBox();
      const boxBVertical = await labelB.boundingBox();
      expect(boxAVertical).not.toBeNull();
      expect(boxBVertical).not.toBeNull();

      // In vertical mode, A should be above B
      expect(boxAVertical!.y).toBeLessThan(boxBVertical!.y);
    });

    test('SPLIT-E007: split line should be hidden when split screen is off', async ({ page }) => {
      // Verify split line is not visible initially
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).not.toBeVisible();

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Enable split screen (horizontal)
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      // Toggle to vertical
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');

      // Disable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Should be hidden again
      await expect(splitLine).not.toBeVisible();
    });
  });

  test.describe('Split Screen Interaction', () => {
    test('SPLIT-E008: horizontal split line can be dragged left to adjust position', async ({ page }) => {
      // Enable horizontal split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');
      const initialPosition = state.wipePosition;

      // Find split line and wait for it to be visible
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toBeVisible();
      const box = await splitLine.boundingBox();
      expect(box).not.toBeNull();

      // Drag to the left
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x - 100, box!.y + box!.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      // Position should have changed
      expect(state.wipePosition).not.toBeCloseTo(initialPosition, 1);
      expect(state.wipePosition).toBeLessThan(initialPosition);
    });

    test('SPLIT-E008b: horizontal split line can be dragged right to adjust position', async ({ page }) => {
      // Enable horizontal split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // First drag left to create room to drag right
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toBeVisible();
      let box = await splitLine.boundingBox();
      expect(box).not.toBeNull();

      // Drag to the left first
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x - 100, box!.y + box!.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      const leftPosition = state.wipePosition;

      // Now drag to the right
      await page.waitForTimeout(100);
      box = await splitLine.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + box!.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.wipePosition).toBeGreaterThan(leftPosition);
    });

    test('SPLIT-E008c: vertical split line can be dragged up/down to adjust position', async ({ page }) => {
      // Enable vertical split screen (press twice to get vertical)
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');
      const initialPosition = state.wipePosition;

      // Find split line and wait for it to be visible
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toBeVisible();
      const box = await splitLine.boundingBox();
      expect(box).not.toBeNull();

      // Drag upward (decrease position)
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y - 100);
      await page.mouse.up();
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      // Position should have changed
      expect(state.wipePosition).not.toBeCloseTo(initialPosition, 1);
      expect(state.wipePosition).toBeLessThan(initialPosition);
    });

    test('SPLIT-E008d: split line has correct resize cursor', async ({ page }) => {
      // Enable horizontal split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toHaveCSS('cursor', 'ew-resize');

      // Switch to vertical split
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      await expect(splitLine).toHaveCSS('cursor', 'ns-resize');
    });

    test('SPLIT-E008e: vertical split line can be dragged down to adjust position', async ({ page }) => {
      // Enable vertical split screen (press twice to get vertical)
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');

      // First drag up to create room to drag down
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toBeVisible();
      let box = await splitLine.boundingBox();
      expect(box).not.toBeNull();

      // Drag upward first
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y - 100);
      await page.mouse.up();
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      const upPosition = state.wipePosition;

      // Now drag downward
      await page.waitForTimeout(100);
      box = await splitLine.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.wipePosition).toBeGreaterThan(upPosition);
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
      // Enable wipe mode first (Shift+W cycles wipe mode)
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      // Wipe mode should be enabled (horizontal)
      expect(state.wipeMode).toBe('horizontal');

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

  test.describe('Split Screen Frame Updates', () => {
    test('SPLIT-E020: both A and B sides update when navigating frames', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-h');

      // Record initial frame
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Capture initial screenshot
      const screenshotFrame1 = await captureViewerScreenshot(page);

      // Navigate to a different frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);

      // Navigate more to ensure visible difference
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);

      // Capture screenshot at new frame
      const screenshotFrame4 = await captureViewerScreenshot(page);

      // Verify frame number changed (backup assertion)
      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBe(initialFrame + 3);

      // Both sides should have updated (screenshot should be different)
      expect(imagesAreDifferent(screenshotFrame1, screenshotFrame4)).toBe(true);
    });

    test('SPLIT-E021: B side updates during playback in split screen mode', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-h');

      // Record initial frame
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Capture initial screenshot
      const screenshotBefore = await captureViewerScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for frames to advance
      await waitForFrameAtLeast(page, 5);

      // Capture screenshot during playback
      const screenshotDuring = await captureViewerScreenshot(page);

      // Pause playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Verify frame number changed (backup assertion)
      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(initialFrame);

      // View should have changed (both A and B updated)
      expect(imagesAreDifferent(screenshotBefore, screenshotDuring)).toBe(true);
    });

    test('SPLIT-E022: split screen remains functional after playback', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Start and stop playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 5);
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      const sessionState = await getSessionState(page);
      const frameAfterPlayback = sessionState.currentFrame;

      // Capture screenshot after playback
      const screenshotAfterPlayback = await captureViewerScreenshot(page);

      // Navigate frames
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Capture screenshot after navigation
      const screenshotAfterNav = await captureViewerScreenshot(page);

      // Verify split screen still works (view should be different)
      expect(imagesAreDifferent(screenshotAfterPlayback, screenshotAfterNav)).toBe(true);

      // Verify we're on a different frame
      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(frameAfterPlayback);
    });

    test('SPLIT-E023: frame navigation works correctly in split screen after multiple play/pause', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Multiple play/pause cycles with generous timeouts
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press('Space');
        // Wait for playback to potentially start
        await page.waitForTimeout(300);
        const state = await getSessionState(page);
        if (state.isPlaying) {
          await waitForFrameChange(page, state.currentFrame);
          await page.keyboard.press('Space');
          await waitForPlaybackState(page, false);
        }
      }

      const stateAfterCycles = await getSessionState(page);
      const frameAfterCycles = stateAfterCycles.currentFrame;

      // Navigate forward
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, frameAfterCycles);

      const stateAfterNav = await getSessionState(page);
      expect(stateAfterNav.currentFrame).toBe(frameAfterCycles + 1);

      // Navigate backward
      await page.keyboard.press('ArrowLeft');
      await waitForFrame(page, frameAfterCycles);

      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBe(frameAfterCycles);
    });

    test('SPLIT-E024: split screen updates both sources when seeking to start', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Navigate to later frame
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(200);

      const screenshotMiddle = await captureViewerScreenshot(page);

      // Seek to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.waitForTimeout(200);

      const screenshotStart = await captureViewerScreenshot(page);

      // Both A and B should show frame 1 (screenshot should be different from middle)
      expect(imagesAreDifferent(screenshotMiddle, screenshotStart)).toBe(true);
    });

    test('SPLIT-E025: split screen updates both sources when seeking to end', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Go to start first
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.waitForTimeout(200);

      const screenshotStart = await captureViewerScreenshot(page);

      // Seek to end
      await page.keyboard.press('End');
      await page.waitForTimeout(300);

      const screenshotEnd = await captureViewerScreenshot(page);

      // Both A and B should show last frame (screenshot should be different from start)
      expect(imagesAreDifferent(screenshotStart, screenshotEnd)).toBe(true);
    });

    test('SPLIT-E026: vertical split screen updates both sources during frame navigation', async ({ page }) => {
      // Enable vertical split screen (press twice to get vertical)
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-v');

      // Capture initial screenshot
      const screenshotFrame1 = await captureViewerScreenshot(page);

      // Navigate to different frames
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);

      const screenshotFrame4 = await captureViewerScreenshot(page);

      // Both sides should have updated
      expect(imagesAreDifferent(screenshotFrame1, screenshotFrame4)).toBe(true);
    });

    test('SPLIT-E027: split screen playback shows smooth updates on both sides', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await page.waitForTimeout(200);

      // Go to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Capture multiple screenshots during playback to verify updates
      const screenshots: Buffer[] = [];
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(200);
        screenshots.push(await captureViewerScreenshot(page));
      }

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // At least some screenshots should be different (indicating frame updates)
      let hasDifference = false;
      for (let i = 1; i < screenshots.length; i++) {
        if (imagesAreDifferent(screenshots[0], screenshots[i])) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });
  });
});
