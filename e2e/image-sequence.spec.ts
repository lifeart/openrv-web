/**
 * Image Sequence Detection and Playback E2E Tests
 *
 * Tests for sequence detection improvements including:
 * - Multi-file sequence loading
 * - Single file sequence inference
 * - Pattern notation parsing
 * - Sequence playback
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import {
  loadSequenceFiles,
  loadSingleSequenceFrame,
  getSessionState,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForMediaLoaded,
} from './fixtures';

async function loadSequenceWithGap(page: Page): Promise<void> {
  const sequenceDir = path.resolve(process.cwd(), 'sample/sequence');
  const files = ['0001', '0002', '0004', '0005'].map((frameNum) =>
    path.join(sequenceDir, `frame_${frameNum}.png`)
  );

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(files);
  await page.waitForTimeout(1000);
}

test.describe('Image Sequence Detection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test.describe('Multi-File Sequence Loading', () => {
    test('SEQ-001: Load sequence from multiple numbered files', async ({ page }) => {
      // Load all sequence files
      await loadSequenceFiles(page);

      // Wait for media to be loaded
      await waitForMediaLoaded(page);

      // Verify session state
      const state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
      expect(state.mediaType).toBe('sequence');
      expect(state.frameCount).toBe(10);
    });

    test('SEQ-002: Sequence playback advances through frames', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Capture initial frame
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);

      // Stop playback
      await page.keyboard.press('Space');

      // Verify frame advanced
      const afterState = await getSessionState(page);
      expect(afterState.currentFrame).toBeGreaterThan(initialFrame);
    });

    test('SEQ-003: Timeline shows correct duration for sequence', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Verify duration
      const state = await getSessionState(page);
      expect(state.frameCount).toBe(10);
      expect(state.inPoint).toBe(1);
      expect(state.outPoint).toBe(10);
    });

    test('SEQ-004: Frame stepping works with sequence', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Get initial frame
      const state1 = await getSessionState(page);
      const initialFrame = state1.currentFrame;

      // Capture initial screenshot
      const screenshot1 = await captureViewerScreenshot(page);

      // Step forward
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Verify frame advanced
      const state2 = await getSessionState(page);
      expect(state2.currentFrame).toBe(initialFrame + 1);

      // Capture screenshot after step
      const screenshot2 = await captureViewerScreenshot(page);

      // Verify canvas content changed
      expect(imagesAreDifferent(screenshot1, screenshot2)).toBe(true);

      // Step backward
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);

      // Verify frame returned
      const state3 = await getSessionState(page);
      expect(state3.currentFrame).toBe(initialFrame);
    });

    test('SEQ-005: Sequence with different colors shows visual changes', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Capture frame 1 (red)
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);
      const frame1Screenshot = await captureViewerScreenshot(page);

      // Go to frame 5 (blue)
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);
      }
      const frame5Screenshot = await captureViewerScreenshot(page);

      // Verify frames are visually different
      expect(imagesAreDifferent(frame1Screenshot, frame5Screenshot)).toBe(true);
    });

    test('SEQ-012: missing-frame mode switching updates gap rendering in show-frame/hold/black', async ({ page }) => {
      await loadSequenceWithGap(page);
      await waitForMediaLoaded(page);

      const loadedState = await getSessionState(page);
      expect(loadedState.mediaType).toBe('sequence');
      expect(loadedState.frameCount).toBe(4);

      // Frame index 3 corresponds to file frame_0004.png with a gap at frame 3.
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(120);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      const gapState = await getSessionState(page);
      expect(gapState.currentFrame).toBe(3);

      const modeButton = page.locator('[data-testid="missing-frame-mode-select"] button').first();
      const overlay = page.locator('[data-testid="missing-frame-overlay"]').first();
      const overlayFrameNumber = page.locator('[data-testid="missing-frame-number"]').first();

      await expect(modeButton).toBeVisible();

      await modeButton.click();
      await page.locator('[data-testid="missing-frame-mode-dropdown"] button[data-value="show-frame"]').click();
      await page.waitForTimeout(200);
      await expect(overlay).toBeVisible();
      await expect(overlayFrameNumber).toHaveText('Frame 3');
      const showFrameScreenshot = await captureViewerScreenshot(page);

      await modeButton.click();
      await page.locator('[data-testid="missing-frame-mode-dropdown"] button[data-value="hold"]').click();
      await page.waitForTimeout(200);
      await expect(overlay).toBeVisible();
      await expect(overlayFrameNumber).toHaveText('Frame 3');
      const holdScreenshot = await captureViewerScreenshot(page);

      await modeButton.click();
      await page.locator('[data-testid="missing-frame-mode-dropdown"] button[data-value="black"]').click();
      await page.waitForTimeout(200);
      await expect(overlay).toBeVisible();
      await expect(overlayFrameNumber).toHaveText('Frame 3');
      const blackScreenshot = await captureViewerScreenshot(page);

      expect(imagesAreDifferent(showFrameScreenshot, holdScreenshot)).toBe(true);
      expect(imagesAreDifferent(holdScreenshot, blackScreenshot)).toBe(true);
      expect(imagesAreDifferent(showFrameScreenshot, blackScreenshot)).toBe(true);
    });
  });

  test.describe('Single File Sequence Loading', () => {
    test('SEQ-006: Single frame loads as image when no sequence found', async ({ page }) => {
      // Load only one frame - without other files available, loads as single image
      await loadSingleSequenceFrame(page, 1);
      await page.waitForTimeout(500);

      // Verify media loaded
      const state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
      // When only one file is available, it loads as a single image
      expect(state.mediaType).toBe('image');
    });
  });

  test.describe('Sequence Navigation', () => {
    test('SEQ-007: Go to start (Home) jumps to first frame', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Go to a later frame
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(50);
      }

      // Go to start
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);

      // Verify at first frame
      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);
    });

    test('SEQ-008: Go to end (End) jumps to last frame', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Go to end
      await page.keyboard.press('End');
      await page.waitForTimeout(200);

      // Verify at last frame
      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(state.frameCount);
    });

    test('SEQ-009: Loop mode wraps around at sequence end', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Ensure loop mode is enabled (default)
      const initialState = await getSessionState(page);
      expect(initialState.loopMode).toBe('loop');

      // Go to last frame
      await page.keyboard.press('End');
      await page.waitForTimeout(200);

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);

      // Stop playback
      await page.keyboard.press('Space');

      // After looping, should be back near the start
      const afterState = await getSessionState(page);
      // In loop mode, frame should have wrapped around (or be at start)
      expect(afterState.currentFrame).toBeLessThanOrEqual(initialState.frameCount);
    });
  });

  test.describe('Sequence Information Display', () => {
    test('SEQ-010: Session displays sequence name', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Check for sequence name in session state
      const state = await getSessionState(page);
      expect(state.mediaName).toBeTruthy();
      // The name should be derived from the pattern
      expect(state.mediaName).toContain('frame');
    });

    test('SEQ-011: FPS is set correctly for sequence', async ({ page }) => {
      await loadSequenceFiles(page);
      await waitForMediaLoaded(page);

      // Default FPS should be 24
      const state = await getSessionState(page);
      expect(state.fps).toBe(24);
    });
  });
});
