import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  loadVideoFile,
  getSessionState,
  waitForPlaybackState,
  waitForMediaLoaded,
} from './fixtures';

/**
 * HeaderBar Mobile Horizontal Scroll Tests
 *
 * Verifies that the header bar (file controls + playback controls + utility controls)
 * is horizontally scrollable on narrow (mobile) viewports so that all controls,
 * including play/pause, remain accessible.
 */

test.describe('HeaderBar Mobile Scroll', () => {
  test.beforeEach(async ({ page }) => {
    // Set a narrow mobile viewport so header bar content overflows
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('HDRSCROLL-001: header bar should be horizontally scrollable on narrow viewport', async ({ page }) => {
    const headerBarScroll = page.locator('.header-bar-scroll');
    await expect(headerBarScroll).toBeVisible();

    // The header bar's scroll width should exceed its client width on narrow screens
    const isScrollable = await headerBarScroll.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(isScrollable).toBe(true);
  });

  test('HDRSCROLL-002: header bar scrollbar should be hidden', async ({ page }) => {
    const headerBarScroll = page.locator('.header-bar-scroll');

    // Verify CSS property that hides the scrollbar
    const scrollbarWidth = await headerBarScroll.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.scrollbarWidth;
    });
    expect(scrollbarWidth).toBe('none');
  });

  test('HDRSCROLL-003: play/pause button should be accessible via scroll on narrow viewport', async ({ page }) => {
    await loadVideoFile(page);
    await waitForMediaLoaded(page);

    const playButton = page.locator('button[title*="Play"], button[title*="Pause"]').first();
    await expect(playButton).toBeAttached();

    // Scroll the play button into view and verify it's visible
    await playButton.scrollIntoViewIfNeeded();
    await expect(playButton).toBeVisible();
  });

  test('HDRSCROLL-004: play/pause button should work after scrolling on mobile', async ({ page }) => {
    await loadVideoFile(page);
    await waitForMediaLoaded(page);

    let state = await getSessionState(page);
    expect(state.isPlaying).toBe(false);

    // Scroll to and click play button
    const playButton = page.locator('button[title*="Play"], button[title*="Pause"]').first();
    await playButton.scrollIntoViewIfNeeded();
    await playButton.click();
    await waitForPlaybackState(page, true);

    state = await getSessionState(page);
    expect(state.isPlaying).toBe(true);

    // Pause
    await playButton.click();
    await waitForPlaybackState(page, false);

    state = await getSessionState(page);
    expect(state.isPlaying).toBe(false);
  });

  test('HDRSCROLL-005: file operation buttons should be visible without scrolling', async ({ page }) => {
    // File operations group is first in the header bar, should be visible without scroll
    const openButton = page.locator('button[title*="Open media"]');
    await expect(openButton).toBeVisible();

    // Check it's within the viewport (not scrolled out)
    const isInView = await openButton.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    });
    expect(isInView).toBe(true);
  });

  test('HDRSCROLL-006: all playback control buttons should be in the DOM on narrow viewport', async ({ page }) => {
    // Verify all playback buttons exist in the DOM even if off-screen
    const buttons = [
      'button[title*="Go to start"]',
      'button[title*="Step back"]',
      'button[title*="Play"], button[title*="Pause"]',
      'button[title*="Step forward"]',
      'button[title*="Go to end"]',
    ];

    for (const selector of buttons) {
      const button = page.locator(selector).first();
      await expect(button).toBeAttached();
    }
  });

  test('HDRSCROLL-007: header bar should allow scrolling to utility controls', async ({ page }) => {
    // The fullscreen button is in the utility group (far right)
    const fullscreenButton = page.locator('[data-testid="fullscreen-toggle-button"]');
    await expect(fullscreenButton).toBeAttached();

    // Scroll it into view
    await fullscreenButton.scrollIntoViewIfNeeded();
    await expect(fullscreenButton).toBeVisible();

    // Verify it's within the viewport after scroll
    const isInView = await fullscreenButton.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    });
    expect(isInView).toBe(true);
  });

  test('HDRSCROLL-008: header bar controls should not be compressed on narrow viewport', async ({ page }) => {
    // Playback controls group should maintain its natural width (not be squished)
    const playButton = page.locator('button[title*="Play"], button[title*="Pause"]').first();
    const speedButton = page.locator('[data-testid="playback-speed-button"]');

    const playButtonWidth = await playButton.evaluate((el) => {
      return el.getBoundingClientRect().width;
    });
    const speedButtonWidth = await speedButton.evaluate((el) => {
      return el.getBoundingClientRect().width;
    });

    // Play button should be at least 28px wide (its min-width)
    expect(playButtonWidth).toBeGreaterThanOrEqual(28);
    // Speed button should be at least 42px wide (its min-width)
    expect(speedButtonWidth).toBeGreaterThanOrEqual(42);
  });
});
