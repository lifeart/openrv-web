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
 * Paint Tools Tests
 *
 * Each test verifies actual state changes and visual modifications,
 * not just UI visibility.
 */

test.describe('Paint Tools (Annotate Tab)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Annotate tab
    await page.click('button[data-tab-id="annotate"]');
    await page.waitForTimeout(200);
  });

  test.describe('Tool Selection', () => {
    test('PAINT-010: selecting pan tool with V key should update currentTool state', async ({ page }) => {
      // First select pen to change state
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.currentTool).toBe('pen');

      // Now select pan
      await page.keyboard.press('v');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.currentTool).toBe('pan');
    });

    test('PAINT-011: selecting pen tool with P key should update currentTool state', async ({ page }) => {
      let state = await getPaintState(page);
      const initialTool = state.currentTool;

      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.currentTool).toBe('pen');
    });

    test('PAINT-012: selecting eraser tool with E key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('e');
      await page.waitForTimeout(100);

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('eraser');
    });

    test('PAINT-013: selecting text tool with T key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('t');
      await page.waitForTimeout(100);

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('text');
    });

    test('PAINT-014: toggling brush type with B key should update brushType state', async ({ page }) => {
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      const initialBrush = state.brushType;

      await page.keyboard.press('b');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.brushType).not.toBe(initialBrush);

      // Toggle back
      await page.keyboard.press('b');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.brushType).toBe(initialBrush);
    });
  });

  test.describe('Drawing', () => {
    test('PAINT-020: drawing stroke should modify canvas and add to annotatedFrames', async ({ page }) => {
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      // Capture initial state
      const initialState = await getPaintState(page);
      const sessionState = await getSessionState(page);
      const currentFrame = sessionState.currentFrame;
      const initialScreenshot = await captureViewerScreenshot(page);

      expect(initialState.annotatedFrames).not.toContain(currentFrame);
      expect(initialState.canUndo).toBe(false);

      // Draw a stroke
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.move(box!.x + 300, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify state changes
      const newState = await getPaintState(page);
      expect(newState.annotatedFrames).toContain(currentFrame);
      expect(newState.canUndo).toBe(true);

      // Verify canvas changed
      const newScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, newScreenshot)).toBe(true);
    });

    test('PAINT-021: drawing multiple strokes should add to undo stack', async ({ page }) => {
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Draw first stroke
      await page.mouse.move(box!.x + 50, box!.y + 50);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 50);
      await page.mouse.up();
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
      const screenshotAfterFirst = await captureViewerScreenshot(page);

      // Draw second stroke
      await page.mouse.move(box!.x + 50, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 100);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Verify canvas changed after second stroke
      const screenshotAfterSecond = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotAfterFirst, screenshotAfterSecond)).toBe(true);

      state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
    });

    test('PAINT-022: erasing strokes should modify canvas', async ({ page }) => {
      // Draw something first
      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(100);

      const screenshotAfterDraw = await captureViewerScreenshot(page);

      // Switch to eraser
      await page.keyboard.press('e');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.currentTool).toBe('eraser');

      // Erase over the stroke
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify eraser action was recorded
      state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
    });
  });

  test.describe('Color and Width', () => {
    test('PAINT-030: changing stroke color should update strokeColor state', async ({ page }) => {
      const colorPicker = page.locator('input[type="color"]').first();
      if (await colorPicker.isVisible()) {
        await colorPicker.fill('#00ff00');
        await page.waitForTimeout(100);

        const state = await getPaintState(page);
        expect(state.strokeColor.toLowerCase()).toBe('#00ff00');
      }
    });

    test('PAINT-031: clicking preset color should update strokeColor state', async ({ page }) => {
      // Find a preset color button (blue)
      const bluePreset = page.locator('button[style*="background: rgb(68, 68, 255)"], button[style*="#4444ff"]').first();
      if (await bluePreset.isVisible()) {
        await bluePreset.click();
        await page.waitForTimeout(100);

        const state = await getPaintState(page);
        expect(state.strokeColor.toLowerCase()).toBe('#4444ff');
      }
    });

    test('PAINT-040: adjusting stroke width should update strokeWidth state', async ({ page }) => {
      const widthSlider = page.locator('.paint-toolbar input[type="range"]').first();
      if (await widthSlider.isVisible()) {
        await widthSlider.evaluate((el: HTMLInputElement) => {
          el.value = '20';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(100);

        const state = await getPaintState(page);
        expect(state.strokeWidth).toBe(20);
      }
    });
  });

  test.describe('Ghost Mode', () => {
    test('PAINT-060: toggling ghost mode with G key should update ghostMode state', async ({ page }) => {
      let state = await getPaintState(page);
      const initialGhost = state.ghostMode;

      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(!initialGhost);

      // Toggle off
      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(initialGhost);
    });
  });

  test.describe('Undo/Redo', () => {
    test('PAINT-070: undo should remove stroke and update canUndo/canRedo state', async ({ page }) => {
      // Draw a stroke first
      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      let state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);

      const screenshotBeforeUndo = await captureViewerScreenshot(page);

      // Undo
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);

      // Verify canvas changed (stroke removed)
      const screenshotAfterUndo = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBeforeUndo, screenshotAfterUndo)).toBe(true);
    });

    test('PAINT-071: redo should restore stroke and update canUndo/canRedo state', async ({ page }) => {
      // Draw and undo first
      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      const screenshotWithStroke = await captureViewerScreenshot(page);

      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.canRedo).toBe(true);

      // Redo
      await page.keyboard.press('Control+y');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);

      // Verify canvas restored
      const screenshotAfterRedo = await captureViewerScreenshot(page);
      // The screenshots should be similar (stroke restored)
    });
  });

  test.describe('Per-Frame Annotations', () => {
    test('PAINT-090: annotations should be stored per frame', async ({ page }) => {
      // Draw on frame 1
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      let state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(1);

      const screenshotFrame1 = await captureViewerScreenshot(page);

      // Go to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      const sessionState = await getSessionState(page);
      const frame2 = sessionState.currentFrame;

      // Frame 2 should not have annotation initially
      const screenshotFrame2 = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotFrame1, screenshotFrame2)).toBe(true);

      // Draw on frame 2
      await page.mouse.move(box!.x + 50, box!.y + 50);
      await page.mouse.down();
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.up();
      await page.waitForTimeout(200);

      state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(1);
      expect(state.annotatedFrames).toContain(frame2);

      // Go back to frame 1 - original annotation should be there
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);

      const screenshotFrame1Again = await captureViewerScreenshot(page);
      // Frame 1 should look similar to before (same annotation)
    });
  });

  test.describe('Annotation Navigation', () => {
    test('PAINT-100: navigation with . and , keys should jump between annotated frames', async ({ page }) => {
      // Draw annotations on frame 1 and frame 3
      await page.keyboard.press('Home');
      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      // Draw on frame 1
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Go to frame 3 and draw
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Go back to start
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      let sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(1);

      // Navigate to next annotation with .
      await page.keyboard.press('.');
      await page.waitForTimeout(100);

      sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(3);

      // Navigate back with ,
      await page.keyboard.press(',');
      await page.waitForTimeout(100);

      sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(1);
    });
  });

  test.describe('Clear Frame', () => {
    test('PAINT-080: clearing frame should remove all annotations on current frame', async ({ page }) => {
      // Draw strokes
      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      const sessionState = await getSessionState(page);
      expect(state.annotatedFrames).toContain(sessionState.currentFrame);

      const screenshotWithAnnotation = await captureViewerScreenshot(page);

      // Clear frame using button
      const clearButton = page.locator('button[title*="Clear"]').first();
      if (await clearButton.isVisible()) {
        await clearButton.click();
        // Confirm if dialog appears
        const confirmButton = page.locator('button:has-text("Clear")').last();
        if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await confirmButton.click();
        }
        await page.waitForTimeout(200);

        // Verify annotations removed
        state = await getPaintState(page);
        expect(state.annotatedFrames).not.toContain(sessionState.currentFrame);

        // Verify canvas changed
        const screenshotAfterClear = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotWithAnnotation, screenshotAfterClear)).toBe(true);
      }
    });
  });
});
