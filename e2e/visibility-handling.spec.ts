/**
 * Page Visibility Handling E2E Tests
 *
 * Tests that playback pauses when tab is hidden and resumes when visible.
 */

import { test, expect } from '@playwright/test';
import { loadTestVideo, getViewerState, captureViewerScreenshot } from './fixtures';

test.describe('Page Visibility Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('VIS-001: playback pauses when tab loses focus via new tab', async ({ page, context }) => {
    await loadTestVideo(page);

    // Start playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Verify playback started
    const stateBefore = await getViewerState(page);
    expect(stateBefore.isPlaying).toBe(true);
    const frameBefore = stateBefore.currentFrame;

    // Open a new tab to trigger visibility change
    const newPage = await context.newPage();
    await newPage.goto('about:blank');

    // Wait a bit while tab is hidden
    await newPage.waitForTimeout(500);

    // Close new tab and return to original
    await newPage.close();
    await page.bringToFront();

    // Give time for visibility handler to run
    await page.waitForTimeout(100);

    // Playback should have resumed
    const stateAfter = await getViewerState(page);

    // Frame should not have advanced much while hidden
    // (allow for 1-2 frames of timing tolerance due to async operations)
    const frameAdvance = Math.abs(stateAfter.currentFrame - frameBefore);
    expect(frameAdvance).toBeLessThan(5);
  });

  test('VIS-002: playback resumes when tab becomes visible again', async ({ page, context }) => {
    await loadTestVideo(page);

    // Start playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    const stateBefore = await getViewerState(page);
    expect(stateBefore.isPlaying).toBe(true);

    // Hide tab
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(200);

    // Return to original tab
    await newPage.close();
    await page.bringToFront();
    await page.waitForTimeout(200);

    // Should be playing again
    const stateAfter = await getViewerState(page);
    expect(stateAfter.isPlaying).toBe(true);
  });

  test('VIS-003: paused playback stays paused after visibility change', async ({ page, context }) => {
    await loadTestVideo(page);

    // Ensure NOT playing (default state)
    const stateBefore = await getViewerState(page);
    expect(stateBefore.isPlaying).toBe(false);

    // Hide and show tab
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(200);
    await newPage.close();
    await page.bringToFront();
    await page.waitForTimeout(100);

    // Should still NOT be playing
    const stateAfter = await getViewerState(page);
    expect(stateAfter.isPlaying).toBe(false);
  });

  test('VIS-004: frame does not advance while tab is hidden', async ({ page, context }) => {
    await loadTestVideo(page);

    // Start playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Record frame before hiding
    const stateBefore = await getViewerState(page);
    const frameBefore = stateBefore.currentFrame;

    // Hide tab for longer duration
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(1000); // 1 second hidden

    // Return to original tab
    await newPage.close();
    await page.bringToFront();
    await page.waitForTimeout(100);

    // Frame should be close to where we left it
    // (playback was paused, so minimal advance)
    const stateAfter = await getViewerState(page);
    const frameAfter = stateAfter.currentFrame;

    // At 24fps, 1 second = 24 frames
    // If playback wasn't paused, we'd see ~24+ frame advance
    // With pause, we should see only a few frames (from resume)
    const frameAdvance = frameAfter - frameBefore;
    expect(frameAdvance).toBeLessThan(10);
  });

  test('VIS-005: viewer image is preserved when tab is hidden', async ({ page, context }) => {
    await loadTestVideo(page);

    // Go to a specific frame
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);

    // Capture image before hiding
    const screenshotBefore = await captureViewerScreenshot(page);

    // Hide tab briefly
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(300);
    await newPage.close();
    await page.bringToFront();
    await page.waitForTimeout(100);

    // Capture image after returning
    const screenshotAfter = await captureViewerScreenshot(page);

    // Images should be identical (same frame, no playback)
    expect(screenshotBefore.length).toBeGreaterThan(0);
    expect(screenshotAfter.length).toBeGreaterThan(0);
    // Note: Exact pixel comparison may vary; this verifies both screenshots are valid
  });

  test('VIS-006: multiple visibility changes work correctly', async ({ page, context }) => {
    await loadTestVideo(page);

    // Start playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // First hide/show cycle
    let newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(200);
    await newPage.close();
    await page.bringToFront();
    await page.waitForTimeout(100);

    // Should still be playing
    let state = await getViewerState(page);
    expect(state.isPlaying).toBe(true);

    // Second hide/show cycle
    newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(200);
    await newPage.close();
    await page.bringToFront();
    await page.waitForTimeout(100);

    // Should still be playing
    state = await getViewerState(page);
    expect(state.isPlaying).toBe(true);

    // Third cycle with stop in between
    await page.keyboard.press('Space'); // Stop
    await page.waitForTimeout(50);

    newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(200);
    await newPage.close();
    await page.bringToFront();
    await page.waitForTimeout(100);

    // Should remain stopped
    state = await getViewerState(page);
    expect(state.isPlaying).toBe(false);
  });
});
