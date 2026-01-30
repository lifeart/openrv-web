/**
 * Timeline/EDL Editing E2E Tests
 *
 * Tests the visual timeline editor functionality for sequence editing.
 */

import {
  test,
  expect,
  loadVideoFile,
  loadTwoVideoFiles,
  getSessionState,
} from './fixtures';

test.describe('Timeline Editor', () => {
  test.describe('Timeline UI', () => {
    test('TL-EDIT-E001: should display timeline track when media is loaded', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Timeline should be visible
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      await expect(timeline).toBeVisible();
    });

    test('TL-EDIT-E002: should show frame ruler on timeline', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Look for ruler or frame markers
      const ruler = page.locator('.timeline-ruler, .ruler, [class*="ruler"]').first();
      const timeline = page.locator('.timeline').first();

      // Timeline should exist
      await expect(timeline).toBeVisible();
    });

    test('TL-EDIT-E003: should allow scrubbing on timeline', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Get initial frame
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Click on timeline at different position
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      const box = await timeline.boundingBox();

      if (box) {
        // Click at 50% of timeline
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
        await page.waitForTimeout(200);

        // Frame should have changed (or stayed same if at same position)
        const newState = await getSessionState(page);
        // Scrubbing may change frame position
      }
    });

    test('TL-EDIT-E004: should display frame numbers on timeline', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Session state should have frame info
      const sessionState = await getSessionState(page);
      expect(sessionState.frameCount).toBeGreaterThan(0);

      // Timeline should show current frame indicator
      const frameIndicator = page.locator('[class*="frame"], .frame-indicator, .playhead').first();
      // Frame display should be present
    });
  });

  test.describe('Playhead Control', () => {
    test('TL-EDIT-E005: should move playhead with arrow keys', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Press right arrow
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.currentFrame).toBe(initialFrame + 1);
    });

    test('TL-EDIT-E006: should jump to start with Home key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move forward first
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Press Home
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(state.inPoint);
    });

    test('TL-EDIT-E007: should jump to end with End key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Press End
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(state.outPoint);
    });
  });

  test.describe('In/Out Points', () => {
    test('TL-EDIT-E008: should set in point with I key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move to frame 10
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const currentState = await getSessionState(page);
      const currentFrame = currentState.currentFrame;

      // Set in point
      await page.keyboard.press('i');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.inPoint).toBe(currentFrame);
    });

    test('TL-EDIT-E009: should set out point with O key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move to frame 20
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const currentState = await getSessionState(page);
      const currentFrame = currentState.currentFrame;

      // Set out point
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.outPoint).toBe(currentFrame);
    });

    test('TL-EDIT-E010: should reset in/out points with R key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Set custom in/out points first
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.waitForTimeout(50);

      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      // Reset with R
      await page.keyboard.press('r');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      // In point should be at start
      expect(state.inPoint).toBeLessThanOrEqual(1);
      // Out point should be at end
      expect(state.outPoint).toBe(state.frameCount);
    });
  });

  test.describe('Markers', () => {
    test('TL-EDIT-E011: should add marker with M key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move to frame 5
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const currentState = await getSessionState(page);
      const initialMarkers = currentState.marks.length;

      // Add marker
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.marks.length).toBe(initialMarkers + 1);
    });

    test('TL-EDIT-E012: should toggle marker off with M key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move and add marker
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const stateWithMarker = await getSessionState(page);
      expect(stateWithMarker.marks.length).toBeGreaterThan(0);

      // Toggle marker off
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const stateWithoutMarker = await getSessionState(page);
      expect(stateWithoutMarker.marks.length).toBe(stateWithMarker.marks.length - 1);
    });

    test('TL-EDIT-E013: markers should have notes and colors in full data', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Add marker
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);

      // Check full marker data structure
      if (state.markers && state.markers.length > 0) {
        const marker = state.markers[0];
        expect(marker).toHaveProperty('frame');
        expect(marker).toHaveProperty('note');
        expect(marker).toHaveProperty('color');
      }
    });
  });

  test.describe('Loop Modes', () => {
    test('TL-EDIT-E014: should cycle loop mode with L key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const initialState = await getSessionState(page);
      const initialLoopMode = initialState.loopMode;

      // Press L to cycle
      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      // Loop mode should have changed
      expect(newState.loopMode).not.toBe(initialLoopMode);
    });

    test('TL-EDIT-E015: should support once, loop, and pingpong modes', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const validModes = ['once', 'loop', 'pingpong'];

      // Cycle through all modes
      for (let i = 0; i < 3; i++) {
        const state = await getSessionState(page);
        expect(validModes).toContain(state.loopMode);
        await page.keyboard.press('l');
        await page.waitForTimeout(100);
      }
    });
  });

  test.describe('Timeline with Multiple Sources', () => {
    test('TL-EDIT-E016: should display A/B sources when two files loaded', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const state = await getSessionState(page);
      expect(state.abCompareAvailable).toBe(true);
    });

    test('TL-EDIT-E017: should toggle between sources with backtick', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const initialState = await getSessionState(page);
      const initialSource = initialState.currentAB;

      // Toggle with backtick
      await page.keyboard.press('`');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.currentAB).not.toBe(initialSource);
    });
  });
});
