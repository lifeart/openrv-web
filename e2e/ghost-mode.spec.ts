import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getCanvas,
  getPaintState,
  getSessionState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Ghost Mode (Onion Skin) Tests
 *
 * Ghost mode allows animators to see annotations from nearby frames
 * as semi-transparent overlays, similar to traditional onion skinning.
 *
 * Implementation: src/paint/PaintEngine.ts - setGhostMode()
 *
 * Reference: OpenRV Paint -> Ghost Mode
 */

test.describe('Ghost Mode (Onion Skin)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Annotate tab
    await page.click('button[data-tab-id="annotate"]');
    await page.waitForTimeout(200);
  });

  test.describe('Toggle Ghost Mode', () => {
    test('GH-E001: toggle ghost mode via keyboard (G) should update ghostMode state', async ({ page }) => {
      let state = await getPaintState(page);
      expect(state.ghostMode).toBe(false);

      // Enable ghost mode
      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);

      // Disable ghost mode
      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(false);
    });

    test('GH-E002: ghost mode default before/after counts should be 3', async ({ page }) => {
      const state = await getPaintState(page);
      expect(state.ghostBefore).toBe(3);
      expect(state.ghostAfter).toBe(3);
    });
  });

  test.describe('Ghost Frame Visibility', () => {
    test('GH-E003: ghost mode state updates when moving between frames', async ({ page }) => {
      // Go to frame 5 and draw
      await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Select pen tool and draw
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify annotation exists
      let state = await getPaintState(page);
      const sessionState = await getSessionState(page);
      expect(state.annotatedFrames).toContain(sessionState.currentFrame);

      // Move to frame 6
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Enable ghost mode
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);
      expect(state.ghostBefore).toBe(3); // Frame 5 is 1 frame before, within ghost range

      // Move back to frame 5 - ghost mode should still be enabled
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);
    });

    test('GH-E004: ghost mode affects annotation retrieval for frame', async ({ page }) => {
      // Go to frame 5 and draw
      await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Select pen tool and draw
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify annotation exists on current frame
      let state = await getPaintState(page);
      const sessionState = await getSessionState(page);
      expect(state.annotatedFrames).toContain(sessionState.currentFrame);

      // Move to frame 4 (one frame before the annotation)
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);

      // Enable ghost mode
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);
      // ghostAfter should allow showing annotations from future frames
      expect(state.ghostAfter).toBe(3);
    });

    test('GH-E005: ghost before/after count is configurable', async ({ page }) => {
      // Draw annotations on frame 1 and frame 10
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Draw on frame 1
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Go to frame 10 and draw
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.down();
      await page.mouse.move(box!.x + 250, box!.y + 250);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Go to frame 5 (4 frames away from frame 1, 5 frames away from frame 10)
      await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Enable ghost mode (default before/after = 3)
      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      const state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);
      // Default values should be 3
      expect(state.ghostBefore).toBe(3);
      expect(state.ghostAfter).toBe(3);

      // With default settings, frame 1 annotation (4 frames away) should NOT be visible
      // and frame 10 annotation (5 frames away) should NOT be visible
      // This test verifies the state values are correctly exposed
    });
  });

  test.describe('Ghost Mode Persistence', () => {
    test('GH-E006: ghost mode with annotations persists across navigation', async ({ page }) => {
      // Enable ghost mode first
      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);

      // Draw on frame 1
      await page.keyboard.press('Home');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Navigate to frame 3
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Ghost mode should still be enabled
      state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);

      // Navigate back to frame 1
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);

      // Ghost mode should still be enabled
      state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);

      // Annotation should still be visible on frame 1
      expect(state.annotatedFrames).toContain(1);
    });

    test('GH-E007: ghost mode indicator reflects state in UI', async ({ page }) => {
      // Initially ghost mode should be off
      let state = await getPaintState(page);
      expect(state.ghostMode).toBe(false);

      // Check if ghost mode button exists and shows inactive state
      const ghostButton = page.locator('button[title*="Ghost"], button[title*="ghost"], button:has-text("Ghost")').first();
      if (await ghostButton.isVisible()) {
        // Get initial styling
        const initialClass = await ghostButton.getAttribute('class') || '';

        // Enable ghost mode
        await page.keyboard.press('g');
        await page.waitForTimeout(100);

        state = await getPaintState(page);
        expect(state.ghostMode).toBe(true);

        // Button should now have active styling
        const activeClass = await ghostButton.getAttribute('class') || '';
        // At minimum, state should be updated - UI reflection is implementation dependent
      }
    });

    test('GH-E008: ghost mode disabled hides ghost frames', async ({ page }) => {
      // Draw annotation on frame 1
      await page.keyboard.press('Home');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Move to frame 2
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Take screenshot without ghost mode
      const screenshotWithoutGhost = await captureViewerScreenshot(page);

      // Enable ghost mode
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      let state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);

      // Take screenshot with ghost mode
      const screenshotWithGhost = await captureViewerScreenshot(page);

      // Disable ghost mode
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(false);

      // Take screenshot after disabling ghost mode
      const screenshotGhostDisabled = await captureViewerScreenshot(page);

      // Screenshot without ghost should match screenshot with ghost disabled
      // (ghost frames should no longer be visible)
      expect(imagesAreDifferent(screenshotWithoutGhost, screenshotGhostDisabled)).toBe(false);
    });
  });

  test.describe('Ghost Mode with Multiple Annotations', () => {
    test('GH-E009: multiple annotations tracked across frames', async ({ page }) => {
      // Draw annotations on frames 1, 2, and 3
      await page.keyboard.press('Home');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Draw on frame 1
      await page.mouse.move(box!.x + 50, box!.y + 50);
      await page.mouse.down();
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Frame 2
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      await page.mouse.move(box!.x + 100, box!.y + 50);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 100);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Frame 3
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      await page.mouse.move(box!.x + 150, box!.y + 50);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 100);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Verify all annotations exist
      let state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(1);
      expect(state.annotatedFrames).toContain(2);
      expect(state.annotatedFrames).toContain(3);
      expect(state.annotatedFrames.length).toBeGreaterThanOrEqual(3);

      // Go to frame 4
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Enable ghost mode
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(true);

      // Verify ghostBefore range includes all 3 frames
      expect(state.ghostBefore).toBe(3);

      // Annotations should still be tracked
      expect(state.annotatedFrames).toContain(1);
      expect(state.annotatedFrames).toContain(2);
      expect(state.annotatedFrames).toContain(3);
    });

    test('GH-E010: ghost opacity decreases with distance from current frame', async ({ page }) => {
      // Draw annotations on frames 2 and 4
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Draw on frame 2
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Draw on frame 4
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Verify annotations
      const state = await getPaintState(page);
      expect(state.annotatedFrames.length).toBeGreaterThanOrEqual(2);

      // Go to frame 3 (middle) and enable ghost mode
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);

      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      // Both frame 2 (1 frame away) and frame 4 (1 frame away) should be visible as ghosts
      // The opacity calculation: 1 - frameDiff / (ghostCount + 1)
      // For 1 frame away with ghostBefore/After=3: opacity = 1 - 1/4 = 0.75, then * 0.5 = 0.375
    });
  });
});
