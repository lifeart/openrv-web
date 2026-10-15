import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  loadSequenceFiles,
  getSessionState,
  waitForPlaybackState,
  waitForPlaybackSpeed,
  waitForPlayDirection,
} from './fixtures';

/**
 * J/K/L shuttle (RV / NLE style) on an image sequence, so it runs without
 * a video codec. L/J start at 1x and each further press in the same
 * direction goes faster; the opposite key turns around at 1x; K stops.
 */
test.describe('J/K/L shuttle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadSequenceFiles(page);
  });

  test('JKL-001: L plays forward and each press goes faster, up to 8x', async ({ page }) => {
    await page.keyboard.press('l');
    await waitForPlaybackState(page, true);
    let state = await getSessionState(page);
    expect(state.playDirection).toBe(1);
    expect(state.playbackSpeed).toBe(1);

    for (const speed of [2, 4, 8, 8]) {
      await page.keyboard.press('l');
      await waitForPlaybackSpeed(page, speed);
    }
    state = await getSessionState(page);
    expect(state.isPlaying).toBe(true);
    expect(state.playDirection).toBe(1);
  });

  test('JKL-002: J plays in reverse and stops at the 4x reverse limit', async ({ page }) => {
    await page.keyboard.press('End');
    await page.keyboard.press('j');
    await waitForPlaybackState(page, true);
    await waitForPlayDirection(page, -1);
    await waitForPlaybackSpeed(page, 1);

    for (const speed of [2, 4, 4]) {
      await page.keyboard.press('j');
      await waitForPlaybackSpeed(page, speed);
    }
  });

  test('JKL-003: the opposite key turns around at 1x, K stops, L restarts at 1x', async ({ page }) => {
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await waitForPlaybackSpeed(page, 4);

    await page.keyboard.press('j');
    await waitForPlayDirection(page, -1);
    await waitForPlaybackSpeed(page, 1);
    expect((await getSessionState(page)).isPlaying).toBe(true);

    await page.keyboard.press('k');
    await waitForPlaybackState(page, false);

    await page.keyboard.press('l');
    await waitForPlaybackState(page, true);
    const state = await getSessionState(page);
    expect(state.playDirection).toBe(1);
    expect(state.playbackSpeed).toBe(1);
  });

  test('JKL-004: a quick K tap pauses playback started with Space', async ({ page }) => {
    // K is also the contrast virtual-slider key; a tap must still pause.
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, true);
    await page.keyboard.press('k');
    await waitForPlaybackState(page, false);
  });
});
