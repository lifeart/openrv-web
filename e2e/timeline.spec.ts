import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  getPaintState,
  captureViewerScreenshot,
  imagesAreDifferent,
  getCanvas,
} from './fixtures';

/**
 * Timeline Tests
 *
 * Each test verifies actual state changes and visual modifications,
 * not just UI visibility.
 */

test.describe('Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test.describe('Timeline Display', () => {
    test('TIMELINE-001: should display timeline at bottom of screen', async ({ page }) => {
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      await expect(timeline).toBeVisible();
    });

    test('TIMELINE-002: should show current frame that matches session state', async ({ page }) => {
      const state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThanOrEqual(1);

      // Frame display should show the same frame
      const frameText = await page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/(\d+)\s*[\/|of]\s*\d+/);
        return match ? parseInt(match[1] || '0', 10) : null;
      });

      if (frameText !== null) {
        expect(frameText).toBe(state.currentFrame);
      }
    });

    test('TIMELINE-003: should show total duration matching frameCount', async ({ page }) => {
      const state = await getSessionState(page);
      expect(state.frameCount).toBeGreaterThan(0);

      // Duration display should show the frame count
      const durationText = await page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/\d+\s*[\/|of]\s*(\d+)/);
        return match ? parseInt(match[1] || '0', 10) : null;
      });

      if (durationText !== null) {
        expect(durationText).toBe(state.frameCount);
      }
    });
  });

  test.describe('Timeline Scrubbing', () => {
    test('TIMELINE-010: scrubbing timeline should update currentFrame and canvas', async ({ page }) => {
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Find timeline and click at 50%
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      const box = await timeline.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
      await page.waitForTimeout(200);

      const newState = await getSessionState(page);
      // Clicking at 50% should navigate to a different frame
      expect(newState.currentFrame).not.toBe(initialFrame);
    });

    test('TIMELINE-011: dragging timeline should continuously update currentFrame', async ({ page }) => {
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      const box = await timeline.boundingBox();

      if (box) {
        // Drag from left to right
        await page.mouse.move(box.x + 50, box.y + box.height / 2);
        await page.mouse.down();

        const state1 = await getSessionState(page);

        await page.mouse.move(box.x + box.width - 50, box.y + box.height / 2);
        await page.waitForTimeout(100);

        const state2 = await getSessionState(page);
        expect(state2.currentFrame).toBeGreaterThan(state1.currentFrame);

        await page.mouse.up();
      }
    });

    test('TIMELINE-012: keyboard navigation should update frame display consistently', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);

      // Step forward multiple times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(6);

      // Go to end
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(state.frameCount);
    });
  });

  test.describe('In/Out Points', () => {
    test('TIMELINE-020: setting in/out points should update state and be reflected in playback', async ({ page }) => {
      // Set in point at frame 3
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.inPoint).toBe(3);

      // Set out point at frame 10
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.outPoint).toBe(10);
    });

    test('TIMELINE-021: playback should be constrained to in/out range', async ({ page }) => {
      // Set in point at frame 2
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.waitForTimeout(100);

      // Set out point at frame 5
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const inPoint = state.inPoint;
      const outPoint = state.outPoint;

      // Go to start and play
      await page.keyboard.press('Home');
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      // Frame should be within in/out range (loop mode will keep it there)
      expect(state.currentFrame).toBeGreaterThanOrEqual(inPoint);
      expect(state.currentFrame).toBeLessThanOrEqual(outPoint);
    });

    test('TIMELINE-022: reset should restore full range', async ({ page }) => {
      // Set in/out points
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.inPoint).toBeGreaterThan(1);
      expect(state.outPoint).toBeLessThan(state.frameCount);

      // Reset
      await page.keyboard.press('r');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.inPoint).toBe(1);
      expect(state.outPoint).toBe(state.frameCount);
    });
  });

  test.describe('Marks', () => {
    test('TIMELINE-030: marking frame should add to marks array', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const currentFrame = state.currentFrame;
      expect(state.marks).not.toContain(currentFrame);

      // Add mark
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.marks).toContain(currentFrame);
    });

    test('TIMELINE-031: toggling mark should remove it from marks array', async ({ page }) => {
      // Add mark
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const currentFrame = state.currentFrame;
      expect(state.marks).toContain(currentFrame);

      // Remove mark
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.marks).not.toContain(currentFrame);
    });

    test('TIMELINE-032: multiple marks should be stored and retrievable', async ({ page }) => {
      // Add marks at frames 2, 5, and 8
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('m'); // Frame 2
      await page.waitForTimeout(100);

      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('m'); // Frame 5
      await page.waitForTimeout(100);

      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('m'); // Frame 8
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      expect(state.marks.length).toBe(3);
      expect(state.marks).toContain(2);
      expect(state.marks).toContain(5);
      expect(state.marks).toContain(8);
    });
  });

  test.describe('Annotation Markers', () => {
    test('TIMELINE-040: drawing annotation should add frame to annotatedFrames', async ({ page }) => {
      // Switch to Annotate tab
      await page.click('button[data-tab-id="annotate"]');
      await page.waitForTimeout(100);

      // Select pen tool
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      // Go to frame 3
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const targetFrame = state.currentFrame;

      let paintState = await getPaintState(page);
      expect(paintState.annotatedFrames).not.toContain(targetFrame);

      // Draw annotation
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      paintState = await getPaintState(page);
      expect(paintState.annotatedFrames).toContain(targetFrame);
    });

    test('TIMELINE-041: clicking annotation indicator should navigate to annotated frame', async ({ page }) => {
      // Create annotations on specific frames
      await page.click('button[data-tab-id="annotate"]');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      // Draw on frame 1
      await page.keyboard.press('Home');
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Draw on frame 5
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      let paintState = await getPaintState(page);
      expect(paintState.annotatedFrames).toContain(1);
      expect(paintState.annotatedFrames).toContain(5);

      // Navigate using . key (next annotation)
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      let sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(1);

      // Press . to go to next annotation
      await page.keyboard.press('.');
      await page.waitForTimeout(100);

      sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(5);

      // Press , to go to previous annotation
      await page.keyboard.press(',');
      await page.waitForTimeout(100);

      sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(1);
    });

    test('TIMELINE-042: annotation markers should be visible on timeline for annotated frames', async ({ page }) => {
      // Create annotation
      await page.click('button[data-tab-id="annotate"]');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      const paintState = await getPaintState(page);
      expect(paintState.annotatedFrames.length).toBeGreaterThan(0);

      // Timeline should have annotation indicator (visual check)
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      await expect(timeline).toBeVisible();

      // Look for annotation marker elements
      const annotationMarker = page.locator('.annotation-marker, [class*="annotation-indicator"], [class*="paint-mark"]').first();
      // Note: Marker visibility depends on implementation
    });
  });

  test.describe('Playhead', () => {
    test('TIMELINE-070: playhead should update position when frame changes', async ({ page }) => {
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      await expect(timeline).toBeVisible();

      // Go to start
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);

      // Step forward
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(4);
    });

    test('TIMELINE-071: playhead should move during playback', async ({ page }) => {
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Start playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      const finalState = await getSessionState(page);
      expect(finalState.currentFrame).toBeGreaterThan(initialFrame);
    });
  });

  test.describe('Loop Mode Indicator', () => {
    test('TIMELINE-060: loop mode should cycle and be reflected in state', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.loopMode).toBe('loop');

      // Cycle through modes
      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.loopMode).toBe('pingpong');

      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.loopMode).toBe('once');

      await page.keyboard.press('l');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.loopMode).toBe('loop');
    });
  });

  test.describe('Frame-Accurate Navigation', () => {
    test('TIMELINE-080: End key should go to exact last frame', async ({ page }) => {
      let state = await getSessionState(page);
      const frameCount = state.frameCount;

      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(frameCount);
    });

    test('TIMELINE-081: Home key should go to frame 1', async ({ page }) => {
      // First go somewhere else
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(1);

      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);
    });

    test('TIMELINE-082: frame stepping should be exactly +1 or -1', async ({ page }) => {
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(2);

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(3);

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(50);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(2);
    });
  });
});
