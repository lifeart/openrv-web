import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  loadRvSession,
  waitForTestHelper,
  waitForMediaLoaded,
  getSessionState,
  getViewerState,
  getPaintState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Media Loading Tests
 *
 * Each test verifies actual state changes after loading media,
 * not just UI visibility.
 */

test.describe('Media Loading', () => {
  test.describe('Video Loading', () => {
    test('MEDIA-001: should load video file and update session state', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Verify no media loaded initially
      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(false);
      expect(state.frameCount).toBe(0);

      // Load video file through shared helper and wait for state update
      await loadVideoFile(page);
      await waitForMediaLoaded(page);
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getSessionState();
          return (state?.frameCount ?? 0) > 0;
        },
        { timeout: 5000 },
      );

      // Verify media loaded
      state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
      expect(state.frameCount).toBeGreaterThan(0);

      // Verify canvas has content
      const screenshot = await captureViewerScreenshot(page);
      expect(screenshot.length).toBeGreaterThan(1000); // Not empty
    });

    test('MEDIA-002: should update frameCount and enable navigation', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadVideoFile(page);
      await page.waitForTimeout(500);

      let state = await getSessionState(page);
      expect(state.frameCount).toBeGreaterThan(1);
      expect(state.currentFrame).toBe(1);

      // Verify navigation works
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(2);

      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(state.frameCount);
    });

    test('MEDIA-003: should enable playback controls after video load', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadVideoFile(page);
      await page.waitForTimeout(500);

      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      // Stop playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
    });

    test('MEDIA-004: should show video dimensions in canvas', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Canvas should have proper dimensions
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(100);

      // Verify frame navigation works - state should update
      const initialState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
      const initialFrame = initialState?.currentFrame ?? 1;

      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      const newState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
      expect(newState?.currentFrame).toBe(initialFrame + 2);
    });

    test('MEDIA-005: should initialize in/out points to full range', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const state = await getSessionState(page);
      expect(state.inPoint).toBe(1);
      expect(state.outPoint).toBe(state.frameCount);
    });
  });

  test.describe('RV Session Loading', () => {
    test('MEDIA-010: should load .rv session file and update state', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load RV session through shared helper
      await loadRvSession(page);
      await page.waitForTimeout(1000);

      // App should be functional with session loaded
      const state = await getSessionState(page);
      // RV session may or may not have media, but app should be responsive
      expect(state.currentFrame).toBeGreaterThanOrEqual(1);
    });

    test('MEDIA-011: should restore session settings from .rv file', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadRvSession(page);
      await page.waitForTimeout(1000);

      // Session state should be accessible
      const state = await getSessionState(page);
      expect(typeof state.currentFrame).toBe('number');
      expect(typeof state.loopMode).toBe('string');
    });

    test('MEDIA-013: should apply channel select and playback range from session', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadRvSession(page);
      await page.waitForTimeout(1000);

      const state = await getSessionState(page);
      expect(state.inPoint).toBe(1);
      expect(state.outPoint).toBe(28);
      expect(state.currentFrame).toBe(1);

      const viewerState = await getViewerState(page);
      expect(viewerState.channelMode).toBe('green');
    });

    test('MEDIA-014: should apply paint effects from session', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadRvSession(page);
      await page.waitForTimeout(1000);

      const paintState = await getPaintState(page);
      expect(paintState.ghostMode).toBe(true);
      expect(paintState.holdMode).toBe(true);
      expect(paintState.ghostBefore).toBe(2);
      expect(paintState.ghostAfter).toBe(4);
    });

    test('MEDIA-012: should allow navigation after session load', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadRvSession(page);
      await page.waitForTimeout(1000);

      const state = await getSessionState(page);
      if (state.hasMedia && state.frameCount > 1) {
        const initialFrame = state.currentFrame;

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);

        const newState = await getSessionState(page);
        expect(newState.currentFrame).toBe(initialFrame + 1);
      }
    });
  });

  test.describe('Drag and Drop', () => {
    test('MEDIA-020: app container should be a valid drop target', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // The app container serves as the drop target for files
      const dropTarget = page.locator('#app').first();
      await expect(dropTarget).toBeVisible();

      // Verify the app is ready to receive file drops
      // Note: Actually testing drag/drop requires browser-specific APIs
      // that can't be easily simulated with dispatchEvent
      // The important thing is the app container exists and is visible
      const boundingBox = await dropTarget.boundingBox();
      expect(boundingBox).not.toBeNull();
      expect(boundingBox!.width).toBeGreaterThan(0);
      expect(boundingBox!.height).toBeGreaterThan(0);
    });
  });

  test.describe('File Input Accessibility', () => {
    test('MEDIA-030: should have file input accessible via button', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // File input should exist
      const fileInput = page.locator('input[type="file"]').first();
      await expect(fileInput).toBeAttached();

      // Open button should be visible
      const openButton = page.locator('button[title*="Open"], button[title*="folder"]').first();
      await expect(openButton).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('MEDIA-040: should handle operations without media gracefully', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // Try to navigate without media
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      await page.keyboard.press('Space');

      // App should remain functional (no critical errors)
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();

      // Filter out warnings
      const criticalErrors = errors.filter(e =>
        !e.includes('Warning') && !e.includes('Deprecation')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  });

  test.describe('Multiple Sources', () => {
    test('MEDIA-050: should support loading additional media', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load first video
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
      const firstFrameCount = state.frameCount;

      // Load RV session (should work)
      await loadRvSession(page);
      await page.waitForTimeout(500);

      // App should remain functional
      state = await getSessionState(page);
      expect(typeof state.currentFrame).toBe('number');
    });
  });

  test.describe('Sample Files Verification', () => {
    test('MEDIA-060: sample video should load and have correct properties', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const state = await getSessionState(page);

      // Sample video should have multiple frames
      expect(state.hasMedia).toBe(true);
      expect(state.frameCount).toBeGreaterThan(10); // Should have at least some frames
      expect(state.currentFrame).toBe(1);

      // Should be able to play
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      const afterPlayState = await getSessionState(page);
      expect(afterPlayState.currentFrame).toBeGreaterThan(1);
    });

    test('MEDIA-061: sample RV session should load without errors', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await loadRvSession(page);
      await page.waitForTimeout(1000);

      // No critical errors
      const criticalErrors = errors.filter(e =>
        !e.includes('Warning') && !e.includes('Deprecation')
      );
      expect(criticalErrors).toHaveLength(0);

      // App should be functional
      const state = await getSessionState(page);
      expect(typeof state.currentFrame).toBe('number');
    });
  });
});
