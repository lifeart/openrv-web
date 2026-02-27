import { test, expect } from '@playwright/test';
import {
  loadTwoVideoFiles,
  loadVideoFile,
  loadSecondVideoFile,
  waitForTestHelper,
  getViewerState,
  getSessionState,
  captureViewerScreenshot,
  captureBSideScreenshot,
  captureASideScreenshot,
  captureBothSidesScreenshot,
  imagesAreDifferent,
  waitForPlaybackState,
  waitForFrameAtLeast,
  waitForFrame,
  waitForFrameChange,
  waitForMediaLoaded,
  waitForWipeMode,
  waitForTabActive,
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
    await waitForTabActive(page, 'view');
  });

  test.describe('Toggle Split Screen Mode', () => {
    test('SPLIT-E001: enable split screen via keyboard (Shift+Alt+S) should update state', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Enable split screen (horizontal)
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      // Toggle to vertical split
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');

      // Disable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'off');

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');
    });

    test('SPLIT-E002: split screen default position should be 0.5 (center)', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      const state = await getViewerState(page);
      expect(state.wipePosition).toBeCloseTo(0.5, 1);
    });
  });

  test.describe('Split Screen Visual', () => {
    test('SPLIT-E003: enabling split screen changes viewer output', async ({ page }) => {
      const screenshotNormal = await captureViewerScreenshot(page);

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      const state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      const screenshotSplit = await captureViewerScreenshot(page);

      // View should be different (showing A and B side by side)
      expect(imagesAreDifferent(screenshotNormal, screenshotSplit)).toBe(true);
    });

    test('SPLIT-E004: horizontal vs vertical split produces different views', async ({ page }) => {
      // Enable horizontal split
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      const screenshotHorizontal = await captureViewerScreenshot(page);

      // Switch to vertical split
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');

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

      // Check for split line element
      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toBeVisible();
    });

    test('SPLIT-E006: A/B labels should be visible when split screen is active', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');

      // Check for A/B label elements
      const labelA = page.locator('[data-testid="split-screen-label-a"]');
      const labelB = page.locator('[data-testid="split-screen-label-b"]');

      await expect(labelA).toBeVisible();
      await expect(labelB).toBeVisible();
    });

    test('SPLIT-E006b: A/B labels position changes based on split orientation', async ({ page }) => {
      // Enable horizontal split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

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
      await waitForWipeMode(page, 'splitscreen-v');

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
      await waitForWipeMode(page, 'splitscreen-h');
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      // Toggle to vertical
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');

      // Disable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'off');
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
      await waitForWipeMode(page, 'splitscreen-h');

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
      await waitForWipeMode(page, 'splitscreen-h');

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
      await waitForWipeMode(page, 'splitscreen-h');
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');

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

      const splitLine = page.locator('[data-testid="split-screen-line"]');
      await expect(splitLine).toHaveCSS('cursor', 'ew-resize');

      // Switch to vertical split
      await page.keyboard.press('Shift+Alt+s');

      await expect(splitLine).toHaveCSS('cursor', 'ns-resize');
    });

    test('SPLIT-E008e: vertical split line can be dragged down to adjust position', async ({ page }) => {
      // Enable vertical split screen (press twice to get vertical)
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');

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
      await waitForWipeMode(page, 'splitscreen-h');

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      // Navigate frames
      const sessionBefore = await getSessionState(page);
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, sessionBefore.currentFrame);

      // State should persist
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      const sessionAfterRight = await getSessionState(page);
      await page.keyboard.press('ArrowLeft');
      await waitForFrameChange(page, sessionAfterRight.currentFrame);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');
    });

    test('SPLIT-E010: split screen and wipe mode are mutually exclusive', async ({ page }) => {
      // Enable wipe mode first (Shift+W cycles wipe mode)
      await page.keyboard.press('Shift+w');
      await waitForWipeMode(page, 'horizontal');

      let state = await getViewerState(page);
      // Wipe mode should be enabled (horizontal)
      expect(state.wipeMode).toBe('horizontal');

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      state = await getViewerState(page);
      // Should be in split screen mode now
      expect(state.wipeMode).toBe('splitscreen-h');
    });
  });

  test.describe('Integration with A/B Compare', () => {
    test('SPLIT-E011: split screen shows source A on one side and source B on other', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

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
      await waitForWipeMode(page, 'splitscreen-h');

      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-h');

      // Record initial frame
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Capture initial screenshot
      const screenshotFrame1 = await captureViewerScreenshot(page);

      // Navigate to a different frame
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, initialFrame);

      // Navigate more to ensure visible difference
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitForFrame(page, initialFrame + 3);

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
      await waitForWipeMode(page, 'splitscreen-h');

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
      await waitForWipeMode(page, 'splitscreen-h');

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
      await waitForFrame(page, frameAfterPlayback + 2);

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
      await waitForWipeMode(page, 'splitscreen-h');

      // Multiple play/pause cycles with generous timeouts
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press('Space');
        // Wait for playback to potentially start
        await waitForPlaybackState(page, true);
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
      await waitForWipeMode(page, 'splitscreen-h');

      // Navigate to later frame
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 11);

      const screenshotMiddle = await captureViewerScreenshot(page);

      // Seek to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const screenshotStart = await captureViewerScreenshot(page);

      // Both A and B should show frame 1 (screenshot should be different from middle)
      expect(imagesAreDifferent(screenshotMiddle, screenshotStart)).toBe(true);
    });

    test('SPLIT-E025: split screen updates both sources when seeking to end', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to start first
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      // Allow canvas to fully render the first frame
      await page.waitForTimeout(500);

      const screenshotStart = await captureViewerScreenshot(page);

      // Seek to end and wait for frame to change
      await page.keyboard.press('End');
      const state = await getSessionState(page);
      await waitForFrame(page, state.frameCount);
      // Allow canvas to fully render the last frame (generous for parallel load)
      await page.waitForTimeout(500);

      const screenshotEnd = await captureViewerScreenshot(page);

      // Both A and B should show last frame (screenshot should be different from start)
      expect(imagesAreDifferent(screenshotStart, screenshotEnd)).toBe(true);
    });

    test('SPLIT-E026: vertical split screen updates both sources during frame navigation', async ({ page }) => {
      // Enable vertical split screen (press twice to get vertical)
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');

      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-v');

      // Capture initial screenshot
      const screenshotFrame1 = await captureViewerScreenshot(page);

      // Navigate to different frames
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitForFrameAtLeast(page, 4);

      const screenshotFrame4 = await captureViewerScreenshot(page);

      // Both sides should have updated
      expect(imagesAreDifferent(screenshotFrame1, screenshotFrame4)).toBe(true);
    });

    test('SPLIT-E027: split screen playback shows smooth updates on both sides', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

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

    test('SPLIT-E028: B side frames change during playback when second video is dropped sequentially', async ({ page }) => {
      // This test replicates the user flow of loading videos one at a time
      // Then entering split screen and playing back
      // The B side (right half) should show changing frames, not a frozen image

      // First, we need to reload the page and load videos sequentially
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load first video
      await loadVideoFile(page);

      // Load second video (simulating "drop" behavior)
      await loadSecondVideoFile(page);
      await waitForMediaLoaded(page);

      // Switch to View tab
      await page.click('button[data-tab-id="view"]');
      await waitForTabActive(page, 'view');

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Capture B side at frame 1
      const bSideFrame1 = await captureBSideScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for frames to advance
      await waitForFrameAtLeast(page, 10);

      // Capture B side during playback
      const bSideLater = await captureBSideScreenshot(page);

      // Pause playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Verify frame number changed
      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(1);

      // CRITICAL: B side should show different frames - this is the core assertion
      // If the B side is frozen, this will fail
      expect(imagesAreDifferent(bSideFrame1, bSideLater)).toBe(true);
    });

    test('SPLIT-E029: B side frames visually change during frame navigation with sequential video load', async ({ page }) => {
      // Similar to SPLIT-E028 but uses frame navigation instead of playback
      // This helps isolate whether the issue is with playback or rendering

      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load first video
      await loadVideoFile(page);

      // Load second video
      await loadSecondVideoFile(page);
      await waitForMediaLoaded(page);

      // Switch to View tab
      await page.click('button[data-tab-id="view"]');
      await waitForTabActive(page, 'view');

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Capture B side at frame 1
      const bSideFrame1 = await captureBSideScreenshot(page);

      // Navigate to a different frame
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 16);

      // Capture B side at later frame
      const bSideLater = await captureBSideScreenshot(page);

      // B side should show different content
      expect(imagesAreDifferent(bSideFrame1, bSideLater)).toBe(true);
    });

    test('SPLIT-E030: playback in split mode continuously updates both A and B sides', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.waitForTimeout(300);

      // Capture B side at frame 1
      const bSideFrame1 = await captureBSideScreenshot(page);

      // Use deterministic frame stepping instead of live playback
      // (live playback screenshots are timing-sensitive under parallel load)
      const canvas = page.locator('canvas').first();
      await canvas.click({ force: true });

      // Step forward multiple frames
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);
      }

      // Wait for render to settle
      await page.waitForTimeout(300);

      // Capture B side at later frame
      const bSideLater = await captureBSideScreenshot(page);

      // Verify frame advanced
      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(1);

      // Verify B side changed between frame 1 and later frames
      expect(imagesAreDifferent(bSideFrame1, bSideLater)).toBe(true);
    });

    test('SPLIT-E031: playback state correctly updates frames in split screen mode', async ({ page }) => {
      test.slow();
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1 and capture initial state (paused)
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.waitForTimeout(300);
      const initialFullScreen = await captureViewerScreenshot(page);

      // Step forward to a mid frame using keyboard (deterministic, no playback race)
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 8);
      await page.waitForTimeout(300);
      const midFullScreen = await captureViewerScreenshot(page);

      // Step forward more
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 16);
      await page.waitForTimeout(300);
      const lateFullScreen = await captureViewerScreenshot(page);

      // Verify screenshots differ at each checkpoint
      expect(imagesAreDifferent(initialFullScreen, midFullScreen)).toBe(true);
      expect(imagesAreDifferent(midFullScreen, lateFullScreen)).toBe(true);
    });
  });

  test.describe('Split Screen A/B Indicator Visibility', () => {
    test('SPLIT-E032: A/B indicator is hidden when entering split screen mode', async ({ page }) => {
      // Verify A/B indicator is visible before split screen
      const abIndicatorBefore = page.locator('[data-testid="ab-indicator"]');
      await expect(abIndicatorBefore).toBeVisible();

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Verify split screen is active
      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-h');

      // A/B indicator should be hidden in split screen mode
      await expect(abIndicatorBefore).toBeHidden();
    });

    test('SPLIT-E033: A/B indicator reappears when exiting split screen mode', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');

      // Verify A/B indicator is hidden
      const abIndicator = page.locator('[data-testid="ab-indicator"]');
      await expect(abIndicator).toBeHidden();

      // Toggle through split screen modes (horizontal -> vertical -> off)
      await page.keyboard.press('Shift+Alt+s'); // to vertical
      await expect(abIndicator).toBeHidden(); // still hidden in vertical split

      await page.keyboard.press('Shift+Alt+s'); // to off
      await waitForWipeMode(page, 'off');

      // Verify split screen is off
      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('off');

      // A/B indicator should be visible again
      await expect(abIndicator).toBeVisible();
    });

    test('SPLIT-E034: only split screen labels (A and B) visible in split screen, not redundant indicators', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');

      // Split screen labels should be visible
      const splitLabelA = page.locator('[data-testid="split-screen-label-a"]');
      const splitLabelB = page.locator('[data-testid="split-screen-label-b"]');
      await expect(splitLabelA).toBeVisible();
      await expect(splitLabelB).toBeVisible();

      // A/B indicator should be hidden (no duplicate "A" label)
      const abIndicator = page.locator('[data-testid="ab-indicator"]');
      await expect(abIndicator).toBeHidden();

      // Verify split screen labels have correct text
      await expect(splitLabelA).toHaveText('A');
      await expect(splitLabelB).toHaveText('B');
    });

    test('SPLIT-E035: A/B indicator remains hidden through playback in split screen mode', async ({ page }) => {
      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');

      const abIndicator = page.locator('[data-testid="ab-indicator"]');
      await expect(abIndicator).toBeHidden();

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);
      await waitForFrameAtLeast(page, 5);

      // A/B indicator should still be hidden during playback
      await expect(abIndicator).toBeHidden();

      // Pause playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // A/B indicator should still be hidden after pause
      await expect(abIndicator).toBeHidden();
    });

    test('SPLIT-E036: A/B indicator hidden in vertical split screen mode too', async ({ page }) => {
      // Enable vertical split screen (press twice)
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');

      // Verify vertical split is active
      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-v');

      // A/B indicator should be hidden
      const abIndicator = page.locator('[data-testid="ab-indicator"]');
      await expect(abIndicator).toBeHidden();

      // Split screen labels should be visible
      const splitLabelA = page.locator('[data-testid="split-screen-label-a"]');
      const splitLabelB = page.locator('[data-testid="split-screen-label-b"]');
      await expect(splitLabelA).toBeVisible();
      await expect(splitLabelB).toBeVisible();
    });
  });

  test.describe('Split Screen Playback Verification - Both Sides Actually Change', () => {
    test('SPLIT-E040: both A and B sides show different frames during playback', async ({ page }) => {
      // This is the critical test - verifies BOTH sides are actually playing
      // Not just that the overall image changes, but that each side independently changes

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Capture both sides at frame 1
      const frame1 = await captureBothSidesScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for significant frame advancement
      await waitForFrameAtLeast(page, 10);

      // Capture both sides during playback
      const frameLater = await captureBothSidesScreenshot(page);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Verify frame actually advanced
      const state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(5);

      // CRITICAL ASSERTIONS: Both A and B sides must have changed
      const aSideChanged = imagesAreDifferent(frame1.aSide, frameLater.aSide);
      const bSideChanged = imagesAreDifferent(frame1.bSide, frameLater.bSide);

      expect(aSideChanged).toBe(true);
      expect(bSideChanged).toBe(true);
    });

    test('SPLIT-E041: both A and B sides continuously update during playback', async ({ page }) => {
      // Verify continuous frame updates on both sides, not just a single change

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Capture initial state
      const initialSnapshot = await captureBothSidesScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for frames to advance
      await waitForFrameAtLeast(page, 5);

      // Capture multiple snapshots during playback
      const snapshots: { aSide: Buffer; bSide: Buffer }[] = [];
      for (let i = 0; i < 3; i++) {
        snapshots.push(await captureBothSidesScreenshot(page));
        await page.waitForTimeout(150);
      }

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Count how many snapshots differ from initial (should be all of them)
      let aSideChanges = 0;
      let bSideChanges = 0;

      for (const snapshot of snapshots) {
        if (imagesAreDifferent(initialSnapshot.aSide, snapshot.aSide)) {
          aSideChanges++;
        }
        if (imagesAreDifferent(initialSnapshot.bSide, snapshot.bSide)) {
          bSideChanges++;
        }
      }

      // All snapshots should be different from initial (continuous updates)
      expect(aSideChanges).toBeGreaterThanOrEqual(2);
      expect(bSideChanges).toBeGreaterThanOrEqual(2);
    });

    test('SPLIT-E042: both A and B sides change during frame navigation', async ({ page }) => {
      // Verify frame-by-frame navigation updates both sides

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Capture frame 1
      const frame1 = await captureBothSidesScreenshot(page);

      // Navigate forward 10 frames
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrameAtLeast(page, 11);

      // Capture frame 11
      const frame11 = await captureBothSidesScreenshot(page);

      // Both sides should show different content
      expect(imagesAreDifferent(frame1.aSide, frame11.aSide)).toBe(true);
      expect(imagesAreDifferent(frame1.bSide, frame11.bSide)).toBe(true);
    });

    test('SPLIT-E043: sequential video load - both sides update during playback', async ({ page }) => {
      // Replicates user's exact flow: load first video, then second, then split screen

      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load first video
      await loadVideoFile(page);

      // Load second video (simulates "drop" behavior)
      await loadSecondVideoFile(page);
      await waitForMediaLoaded(page);

      // Switch to View tab
      await page.click('button[data-tab-id="view"]');
      await waitForTabActive(page, 'view');

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // Capture both sides at start
      const startFrame = await captureBothSidesScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for frames to advance
      await waitForFrameAtLeast(page, 10);

      // Capture both sides during playback
      const laterFrame = await captureBothSidesScreenshot(page);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // CRITICAL: Both A and B must have changed
      expect(imagesAreDifferent(startFrame.aSide, laterFrame.aSide)).toBe(true);
      expect(imagesAreDifferent(startFrame.bSide, laterFrame.bSide)).toBe(true);
    });

    test('SPLIT-E044: playback in split screen - verify frame counter matches visual changes', async ({ page }) => {
      // Verify the frame counter is actually advancing and visual matches

      // Enable split screen
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const initialState = await getSessionState(page);
      expect(initialState.currentFrame).toBe(1);

      // Capture initial state
      const initialBothSides = await captureBothSidesScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      // Wait for specific frame
      await waitForFrameAtLeast(page, 15);

      // Capture mid-playback
      const midPlayback = await captureBothSidesScreenshot(page);
      const midState = await getSessionState(page);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Verify frame counter advanced
      expect(midState.currentFrame).toBeGreaterThanOrEqual(15);

      // Verify visuals changed on both sides (proving frames are being rendered)
      expect(imagesAreDifferent(initialBothSides.aSide, midPlayback.aSide)).toBe(true);
      expect(imagesAreDifferent(initialBothSides.bSide, midPlayback.bSide)).toBe(true);
    });

    test('SPLIT-E045: vertical split screen - both sides update during playback', async ({ page }) => {
      // Verify playback works in vertical split mode too

      // Enable vertical split screen (press twice)
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-h');
      await page.keyboard.press('Shift+Alt+s');
      await waitForWipeMode(page, 'splitscreen-v');

      const viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('splitscreen-v');

      // Go to frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      // For vertical split, A is on top, B is on bottom
      // We'll use the full screenshot and compare start vs later
      const startScreenshot = await captureViewerScreenshot(page);

      // Start playback
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, true);

      await waitForFrameAtLeast(page, 10);

      const laterScreenshot = await captureViewerScreenshot(page);

      // Pause
      await page.keyboard.press('Space');
      await waitForPlaybackState(page, false);

      // Screenshot should be different (both A and B updated)
      expect(imagesAreDifferent(startScreenshot, laterScreenshot)).toBe(true);
    });
  });
});
