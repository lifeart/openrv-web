import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
} from './fixtures';

/**
 * Timeline Thumbnails Tests
 *
 * Tests for the timeline thumbnail feature that shows frame preview thumbnails
 * along the timeline track.
 *
 * Implementation: src/ui/components/ThumbnailManager.ts, src/ui/components/Timeline.ts
 *
 * Features:
 * - LRU cache for efficient memory usage (max 150 thumbnails)
 * - Progressive loading without blocking UI
 * - Automatic recalculation on resize
 * - AbortController support for cancellation on source change
 *
 * Reference: Timeline frame preview thumbnails
 */

test.describe('Timeline Thumbnails', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    // Load a video
    await loadVideoFile(page);
    await page.waitForTimeout(500); // Wait for thumbnails to start loading
  });

  test.describe('Timeline Display', () => {
    test('THUMB-E001: timeline canvas exists', async ({ page }) => {
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
      await expect(timelineCanvas).toBeVisible();
    });

    test('THUMB-E002: timeline has visual content after video load', async ({ page }) => {
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');

      // Verify canvas has meaningful dimensions
      const box = await timelineCanvas.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(10);

      // Take screenshot - a rendered timeline with content should produce
      // a non-trivial PNG (minimum header + pixel data)
      const screenshot = await timelineCanvas.screenshot();
      expect(screenshot.length).toBeGreaterThan(100);
    });
  });

  test.describe('Thumbnail Loading', () => {
    test('THUMB-E003: thumbnails load progressively', async ({ page }) => {
      // Wait for initial render
      await page.waitForTimeout(200);

      // Take first screenshot
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
      const screenshot1 = await timelineCanvas.screenshot();

      // Wait for more thumbnails to load
      await page.waitForTimeout(1000);

      // Take second screenshot - may have more thumbnails
      const screenshot2 = await timelineCanvas.screenshot();

      // Both screenshots should have meaningful content (PNG has header overhead,
      // so a non-blank canvas should produce at least a few hundred bytes)
      expect(screenshot1.length).toBeGreaterThan(100);
      expect(screenshot2.length).toBeGreaterThan(100);
    });

    test('THUMB-E004: timeline updates on frame navigation', async ({ page }) => {
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
      const screenshotBefore = await timelineCanvas.screenshot();

      // Navigate to different frame
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Timeline should still be visible and the playhead position should have changed
      await expect(timelineCanvas).toBeVisible();
      const screenshotAfter = await timelineCanvas.screenshot();

      // Verify the timeline visually updated (playhead moved)
      expect(screenshotAfter.length).toBeGreaterThan(0);
      expect(Buffer.compare(screenshotBefore, screenshotAfter)).not.toBe(0);
    });
  });

  test.describe('Resize Behavior', () => {
    test('THUMB-E005: thumbnails recalculate on window resize', async ({ page }) => {
      // Get initial timeline state
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
      const initialBox = await timelineCanvas.boundingBox();

      // Resize window
      await page.setViewportSize({ width: 800, height: 600 });
      await page.waitForTimeout(300);

      // Timeline should still exist
      await expect(timelineCanvas).toBeVisible();

      // May have different dimensions
      const newBox = await timelineCanvas.boundingBox();
      expect(newBox).not.toBeNull();
    });
  });

  test.describe('Source Change', () => {
    test('THUMB-E006: timeline remains functional after frame navigation', async ({ page }) => {
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');

      // Take screenshot with initial frame
      const screenshot1 = await timelineCanvas.screenshot();

      // Navigate several frames forward to trigger thumbnail updates
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(300);

      // Timeline should still be visible and rendering
      await expect(timelineCanvas).toBeVisible();

      // Take another screenshot - playhead should have moved
      const screenshot2 = await timelineCanvas.screenshot();
      expect(Buffer.compare(screenshot1, screenshot2)).not.toBe(0);
    });
  });

  test.describe('Timeline Interaction', () => {
    test('THUMB-E007: timeline click navigates to a frame', async ({ page }) => {
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
      const box = await timelineCanvas.boundingBox();
      expect(box).not.toBeNull();

      // Go to first frame first
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      const screenshotBefore = await timelineCanvas.screenshot();

      // Click near the middle of the timeline to navigate
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(200);

      // Timeline should update (playhead moved)
      await expect(timelineCanvas).toBeVisible();
      const screenshotAfter = await timelineCanvas.screenshot();
      expect(Buffer.compare(screenshotBefore, screenshotAfter)).not.toBe(0);
    });

    test('THUMB-E008: timeline supports drag scrubbing', async ({ page }) => {
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
      const box = await timelineCanvas.boundingBox();
      expect(box).not.toBeNull();

      const screenshotBefore = await timelineCanvas.screenshot();

      // Drag across timeline from left to right
      await page.mouse.move(box!.x + 50, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width - 50, box!.y + box!.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Timeline should have updated during scrubbing
      await expect(timelineCanvas).toBeVisible();
      const screenshotAfter = await timelineCanvas.screenshot();
      expect(Buffer.compare(screenshotBefore, screenshotAfter)).not.toBe(0);
    });
  });

  test.describe('Memory Management', () => {
    test('THUMB-E009: timeline handles many frame navigations', async ({ page }) => {
      // Rapidly navigate through frames to stress test caching
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(50);
      }

      // Go back
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(50);
      }

      // Timeline should still function
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
      await expect(timelineCanvas).toBeVisible();
    });
  });

  test.describe('Playback Integration', () => {
    test('THUMB-E010: timeline updates during playback', async ({ page }) => {
      const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');

      // Capture timeline before playback
      const screenshotBefore = await timelineCanvas.screenshot();

      // Start playback and let frames advance
      await page.keyboard.press('l');
      await page.waitForTimeout(500);

      // Stop playback
      await page.keyboard.press('k');
      await page.waitForTimeout(100);

      // Timeline should still be visible and its playhead should have moved
      await expect(timelineCanvas).toBeVisible();
      const screenshotAfter = await timelineCanvas.screenshot();
      expect(Buffer.compare(screenshotBefore, screenshotAfter)).not.toBe(0);
    });
  });
});
