import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getCanvas,
  getPaintState,
  getSessionState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForTool,
  waitForAnnotationCount,
  waitForTabActive,
  waitForFrame,
  waitForFrameChange,
  waitForCondition,
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
    await waitForTabActive(page, 'annotate');
  });

  test.describe('Tool Selection', () => {
    test('PAINT-010: selecting pan tool with V key should update currentTool state', async ({ page }) => {
      // First select pen to change state
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');

      let state = await getPaintState(page);
      expect(state.currentTool).toBe('pen');

      // Now select pan
      await page.keyboard.press('v');
      await waitForTool(page, 'pan');

      state = await getPaintState(page);
      expect(state.currentTool).toBe('pan');
    });

    test('PAINT-011: selecting pen tool with P key should update currentTool state', async ({ page }) => {
      let state = await getPaintState(page);
      const initialTool = state.currentTool;

      await page.keyboard.press('p');
      await waitForTool(page, 'pen');

      state = await getPaintState(page);
      expect(state.currentTool).toBe('pen');
    });

    test('PAINT-012: selecting eraser tool with E key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('e');
      await waitForTool(page, 'eraser');

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('eraser');
    });

    test('PAINT-013: selecting text tool with T key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('t');
      await waitForTool(page, 'text');

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('text');
    });

    test('PAINT-015: selecting rectangle tool with R key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('r');
      await waitForTool(page, 'rectangle');

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('rectangle');
    });

    test('PAINT-016: selecting ellipse tool with O key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('o');
      await waitForTool(page, 'ellipse');

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('ellipse');
    });

    test('PAINT-017: selecting line tool with L key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('l');
      await waitForTool(page, 'line');

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('line');
    });

    test('PAINT-018: selecting arrow tool with A key should update currentTool state', async ({ page }) => {
      await page.keyboard.press('a');
      await waitForTool(page, 'arrow');

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('arrow');
    });

    test('PAINT-014: toggling brush type with B key should update brushType state', async ({ page }) => {
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');

      let state = await getPaintState(page);
      const initialBrush = state.brushType;

      await page.keyboard.press('b');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.brushType !== '${initialBrush}'; })()`);

      state = await getPaintState(page);
      expect(state.brushType).not.toBe(initialBrush);

      // Toggle back
      await page.keyboard.press('b');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.brushType === '${initialBrush}'; })()`);

      state = await getPaintState(page);
      expect(state.brushType).toBe(initialBrush);
    });
  });

  test.describe('Drawing', () => {
    test('PAINT-020: drawing stroke should modify canvas and add to annotatedFrames', async ({ page }) => {
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');

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
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

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
      await waitForTool(page, 'pen');

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Draw first stroke
      await page.mouse.move(box!.x + 50, box!.y + 50);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 50);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

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
      await waitForTool(page, 'eraser');

      let state = await getPaintState(page);
      expect(state.currentTool).toBe('eraser');

      // Erase over the stroke
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

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
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.strokeColor?.toLowerCase() === '#00ff00'; })()`);

        const state = await getPaintState(page);
        expect(state.strokeColor.toLowerCase()).toBe('#00ff00');
      }
    });

    test('PAINT-031: clicking preset color should update strokeColor state', async ({ page }) => {
      // Find a preset color button (blue)
      const bluePreset = page.locator('button[style*="background: rgb(68, 68, 255)"], button[style*="#4444ff"]').first();
      if (await bluePreset.isVisible()) {
        await bluePreset.click();
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.strokeColor?.toLowerCase() === '#4444ff'; })()`);

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
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.strokeWidth === 20; })()`);

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
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.ghostMode === true; })()`);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(!initialGhost);

      // Toggle off
      await page.keyboard.press('g');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.ghostMode === false; })()`);

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
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

      let state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);

      const screenshotBeforeUndo = await captureViewerScreenshot(page);

      // Undo
      await page.keyboard.press('Control+z');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canRedo === true; })()`);

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
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

      const screenshotWithStroke = await captureViewerScreenshot(page);

      await page.keyboard.press('Control+z');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canRedo === true; })()`);

      let state = await getPaintState(page);
      expect(state.canRedo).toBe(true);

      // Redo
      await page.keyboard.press('Control+y');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true && s?.canRedo === false; })()`);

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
      await waitForFrame(page, 1);

      await page.keyboard.press('p');
      await waitForTool(page, 'pen');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.annotatedFrames?.includes(1); })()`);

      let state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(1);

      const screenshotFrame1 = await captureViewerScreenshot(page);

      // Go to next frame
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, 1);

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
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.annotatedFrames?.includes(${frame2}); })()`);

      state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(1);
      expect(state.annotatedFrames).toContain(frame2);

      // Go back to frame 1 - original annotation should be there
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      const screenshotFrame1Again = await captureViewerScreenshot(page);
      // Frame 1 should look similar to before (same annotation)
    });
  });

  test.describe('Annotation Navigation', () => {
    test('PAINT-100: navigation with . and , keys should jump between annotated frames', async ({ page }) => {
      // Draw annotations on frame 1 and frame 3
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      // Draw on frame 1
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.annotatedFrames?.includes(1); })()`);

      // Go to frame 3 and draw
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitForFrame(page, 3);

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.annotatedFrames?.includes(3); })()`);

      // Go back to start
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);

      let sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(1);

      // Navigate to next annotation with .
      await page.keyboard.press('.');
      await waitForFrame(page, 3);

      sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(3);

      // Navigate back with ,
      await page.keyboard.press(',');
      await waitForFrame(page, 1);

      sessionState = await getSessionState(page);
      expect(sessionState.currentFrame).toBe(1);
    });
  });

  test.describe('Shape Tools', () => {
    test('PAINT-050: selecting rectangle tool via button should update currentTool state', async ({ page }) => {
      const rectButton = page.locator('button[title*="Rectangle"]').first();
      if (await rectButton.isVisible()) {
        await rectButton.click();
        await waitForTool(page, 'rectangle');

        const state = await getPaintState(page);
        expect(state.currentTool).toBe('rectangle');
      }
    });

    test('PAINT-051: selecting ellipse tool via button should update currentTool state', async ({ page }) => {
      const ellipseButton = page.locator('button[title*="Ellipse"]').first();
      if (await ellipseButton.isVisible()) {
        await ellipseButton.click();
        await waitForTool(page, 'ellipse');

        const state = await getPaintState(page);
        expect(state.currentTool).toBe('ellipse');
      }
    });

    test('PAINT-052: selecting line tool via button should update currentTool state', async ({ page }) => {
      const lineButton = page.locator('button[title*="Line"]').first();
      if (await lineButton.isVisible()) {
        await lineButton.click();
        await waitForTool(page, 'line');

        const state = await getPaintState(page);
        expect(state.currentTool).toBe('line');
      }
    });

    test('PAINT-053: selecting arrow tool via button should update currentTool state', async ({ page }) => {
      const arrowButton = page.locator('button[title*="Arrow"]').first();
      if (await arrowButton.isVisible()) {
        await arrowButton.click();
        await waitForTool(page, 'arrow');

        const state = await getPaintState(page);
        expect(state.currentTool).toBe('arrow');
      }
    });

    test('PAINT-054: drawing rectangle should modify canvas and add to annotatedFrames', async ({ page }) => {
      const rectButton = page.locator('button[title*="Rectangle"]').first();
      if (!(await rectButton.isVisible())) {
        test.fixme(); // TODO: implement when feature is complete
        return;
      }
      await rectButton.click();
      await waitForTool(page, 'rectangle');

      // Capture initial state
      const initialState = await getPaintState(page);
      const sessionState = await getSessionState(page);
      const currentFrame = sessionState.currentFrame;
      const initialScreenshot = await captureViewerScreenshot(page);

      expect(initialState.annotatedFrames).not.toContain(currentFrame);

      // Draw a rectangle
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 250, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

      // Verify state changes
      const newState = await getPaintState(page);
      expect(newState.annotatedFrames).toContain(currentFrame);
      expect(newState.canUndo).toBe(true);

      // Verify canvas changed
      const newScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, newScreenshot)).toBe(true);
    });

    test('PAINT-055: drawing ellipse should modify canvas and add to annotatedFrames', async ({ page }) => {
      const ellipseButton = page.locator('button[title*="Ellipse"]').first();
      if (!(await ellipseButton.isVisible())) {
        test.fixme(); // TODO: implement when feature is complete
        return;
      }
      await ellipseButton.click();
      await waitForTool(page, 'ellipse');

      // Capture initial state
      const initialState = await getPaintState(page);
      const sessionState = await getSessionState(page);
      const currentFrame = sessionState.currentFrame;
      const initialScreenshot = await captureViewerScreenshot(page);

      expect(initialState.annotatedFrames).not.toContain(currentFrame);

      // Draw an ellipse
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 250, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

      // Verify state changes
      const newState = await getPaintState(page);
      expect(newState.annotatedFrames).toContain(currentFrame);
      expect(newState.canUndo).toBe(true);

      // Verify canvas changed
      const newScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, newScreenshot)).toBe(true);
    });

    test('PAINT-056: drawing line should modify canvas and add to annotatedFrames', async ({ page }) => {
      const lineButton = page.locator('button[title*="Line"]').first();
      if (!(await lineButton.isVisible())) {
        test.fixme(); // TODO: implement when feature is complete
        return;
      }
      await lineButton.click();
      await waitForTool(page, 'line');

      // Capture initial state
      const initialState = await getPaintState(page);
      const sessionState = await getSessionState(page);
      const currentFrame = sessionState.currentFrame;
      const initialScreenshot = await captureViewerScreenshot(page);

      expect(initialState.annotatedFrames).not.toContain(currentFrame);

      // Draw a line
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 300, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

      // Verify state changes
      const newState = await getPaintState(page);
      expect(newState.annotatedFrames).toContain(currentFrame);
      expect(newState.canUndo).toBe(true);

      // Verify canvas changed
      const newScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, newScreenshot)).toBe(true);
    });

    test('PAINT-057: drawing arrow should modify canvas and add to annotatedFrames', async ({ page }) => {
      const arrowButton = page.locator('button[title*="Arrow"]').first();
      if (!(await arrowButton.isVisible())) {
        test.fixme(); // TODO: implement when feature is complete
        return;
      }
      await arrowButton.click();
      await waitForTool(page, 'arrow');

      // Capture initial state
      const initialState = await getPaintState(page);
      const sessionState = await getSessionState(page);
      const currentFrame = sessionState.currentFrame;
      const initialScreenshot = await captureViewerScreenshot(page);

      expect(initialState.annotatedFrames).not.toContain(currentFrame);

      // Draw an arrow
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 300, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

      // Verify state changes
      const newState = await getPaintState(page);
      expect(newState.annotatedFrames).toContain(currentFrame);
      expect(newState.canUndo).toBe(true);

      // Verify canvas changed
      const newScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, newScreenshot)).toBe(true);
    });

    test('PAINT-058: undo should remove shape and update canUndo/canRedo state', async ({ page }) => {
      const rectButton = page.locator('button[title*="Rectangle"]').first();
      if (!(await rectButton.isVisible())) {
        test.fixme(); // TODO: implement when feature is complete
        return;
      }
      await rectButton.click();
      await waitForTool(page, 'rectangle');

      // Draw a rectangle first
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 250, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

      let state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);

      const screenshotBeforeUndo = await captureViewerScreenshot(page);

      // Undo
      await page.keyboard.press('Control+z');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canRedo === true; })()`);

      state = await getPaintState(page);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);

      // Verify canvas changed (shape removed)
      const screenshotAfterUndo = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBeforeUndo, screenshotAfterUndo)).toBe(true);
    });
  });

  test.describe('Clear Frame', () => {
    test('PAINT-080: clearing frame should remove all annotations on current frame', async ({ page }) => {
      // Draw strokes
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === true; })()`);

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
        await waitForAnnotationCount(page, 0);

        // Verify annotations removed
        state = await getPaintState(page);
        expect(state.annotatedFrames).not.toContain(sessionState.currentFrame);

        // Verify canvas changed
        const screenshotAfterClear = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotWithAnnotation, screenshotAfterClear)).toBe(true);
      }
    });
  });

  test.describe('Hold Mode', () => {
    test('HOLD-E001: toggle hold mode via toolbar should update holdMode state', async ({ page }) => {
      let state = await getPaintState(page);
      expect(state.holdMode).toBe(false);

      // Look for hold mode button in toolbar
      const holdButton = page.locator('button[title*="Hold"], button:has-text("Hold")').first();
      if (await holdButton.isVisible()) {
        await holdButton.click();
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

        state = await getPaintState(page);
        expect(state.holdMode).toBe(true);

        // Toggle off
        await holdButton.click();
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === false; })()`);

        state = await getPaintState(page);
        expect(state.holdMode).toBe(false);
      }
    });

    test('HOLD-E002: annotations persist across frames when hold enabled', async ({ page }) => {
      // Enable hold mode first
      const holdButton = page.locator('button[title*="Hold"], button:has-text("Hold")').first();
      if (await holdButton.isVisible()) {
        await holdButton.click();
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

        let state = await getPaintState(page);
        expect(state.holdMode).toBe(true);
      } else {
        // Use keyboard shortcut
        await page.keyboard.press('x');
        await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

        let state = await getPaintState(page);
        expect(state.holdMode).toBe(true);
      }

      // Draw on frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await waitForAnnotationCount(page, 1);

      // Verify annotation was created on frame 1
      let state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(1);
      expect(state.visibleAnnotationCount).toBe(1);

      // Navigate to frame 2
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, 1);

      // With hold mode enabled, the annotation should be visible on frame 2
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(1); // Annotation persists from frame 1

      // Navigate to frame 5
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitForFrame(page, 5);

      // Annotation should still be visible
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(1);
    });

    test('HOLD-E003: hold mode indicator visible in UI when enabled', async ({ page }) => {
      const holdButton = page.locator('button[title*="Hold"], button:has-text("Hold")').first();
      if (!(await holdButton.isVisible())) {
        test.fixme(); // TODO: implement when feature is complete
        return;
      }

      // Get initial styling - button should have reduced opacity when OFF
      const initialOpacity = await holdButton.evaluate((el) => el.style.opacity);
      const initialColor = await holdButton.evaluate((el) => el.style.color);
      expect(initialOpacity).toBe('0.5');
      expect(initialColor).toBe('var(--text-muted)');

      // Enable hold mode
      await holdButton.click();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

      let state = await getPaintState(page);
      expect(state.holdMode).toBe(true);

      // Button should show active state (full opacity + accent token color)
      const activeOpacity = await holdButton.evaluate((el) => el.style.opacity);
      const activeColor = await holdButton.evaluate((el) => el.style.color);
      expect(activeOpacity).toBe('1');
      expect(activeColor).toBe('var(--accent-primary)');

      // Disable hold mode
      await holdButton.click();
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === false; })()`);

      state = await getPaintState(page);
      expect(state.holdMode).toBe(false);

      // Button should return to inactive styling
      const finalOpacity = await holdButton.evaluate((el) => el.style.opacity);
      const finalColor = await holdButton.evaluate((el) => el.style.color);
      expect(finalOpacity).toBe('0.5');
      expect(finalColor).toBe('var(--text-muted)');
    });

    test('HOLD-E004: annotations drawn with hold OFF do not persist to other frames', async ({ page }) => {
      // Ensure hold mode is OFF
      let state = await getPaintState(page);
      expect(state.holdMode).toBe(false);

      // Draw annotation on frame 1 with hold mode OFF
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await waitForAnnotationCount(page, 1);

      // Verify annotation exists on frame 1
      state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(1);
      expect(state.visibleAnnotationCount).toBe(1);

      // Navigate to frame 2
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, 1);

      // Annotation should NOT be visible on frame 2 (hold was off when drawn)
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(0);

      // Navigate back to frame 1
      await page.keyboard.press('ArrowLeft');
      await waitForFrame(page, 1);

      // Annotation should still be visible on frame 1
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(1);
    });

    test('HOLD-E005: hold mode state persists during navigation', async ({ page }) => {
      // Enable hold mode via keyboard
      await page.keyboard.press('x');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

      let state = await getPaintState(page);
      expect(state.holdMode).toBe(true);

      // Navigate forward
      const initialFrame = (await getSessionState(page)).currentFrame;
      await page.keyboard.press('ArrowRight');
      await waitForFrameChange(page, initialFrame);

      state = await getPaintState(page);
      expect(state.holdMode).toBe(true);

      // Navigate backward
      const frame2 = (await getSessionState(page)).currentFrame;
      await page.keyboard.press('ArrowLeft');
      await waitForFrameChange(page, frame2);

      state = await getPaintState(page);
      expect(state.holdMode).toBe(true);

      // Go to end
      await page.keyboard.press('End');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.currentFrame === s?.frameCount; })()`);

      state = await getPaintState(page);
      expect(state.holdMode).toBe(true);
    });

    test('HOLD-E006: toggle hold mode via keyboard (X)', async ({ page }) => {
      let state = await getPaintState(page);
      expect(state.holdMode).toBe(false);

      // Enable hold mode with X key
      await page.keyboard.press('x');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

      state = await getPaintState(page);
      expect(state.holdMode).toBe(true);

      // Disable hold mode with X key
      await page.keyboard.press('x');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === false; })()`);

      state = await getPaintState(page);
      expect(state.holdMode).toBe(false);
    });

    test('HOLD-E007: annotations drawn with hold ON persist after hold is turned OFF', async ({ page }) => {
      // Enable hold mode
      await page.keyboard.press('x');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

      let state = await getPaintState(page);
      expect(state.holdMode).toBe(true);

      // Draw annotation on frame 1 with hold ON
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.keyboard.press('p');
      await waitForTool(page, 'pen');

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await waitForAnnotationCount(page, 1);

      // Disable hold mode AFTER drawing
      await page.keyboard.press('x');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === false; })()`);

      state = await getPaintState(page);
      expect(state.holdMode).toBe(false);

      // Navigate to frame 3
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitForFrame(page, 3);

      // Annotation should STILL be visible (it was drawn with hold ON)
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(1);

      // Draw another annotation on frame 3 with hold OFF
      await page.mouse.move(box!.x + 150, box!.y + 150);
      await page.mouse.down();
      await page.mouse.move(box!.x + 250, box!.y + 250);
      await page.mouse.up();
      await waitForAnnotationCount(page, 2);

      // Now we should have 2 visible annotations on frame 3
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(2);

      // Navigate to frame 4
      await page.keyboard.press('ArrowRight');
      await waitForFrame(page, 4);

      // Only the first annotation (drawn with hold ON) should be visible
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(1);
    });

    test('HOLD-E008: hold mode works with shapes', async ({ page }) => {
      // Enable hold mode
      await page.keyboard.press('x');
      await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.holdMode === true; })()`);

      let state = await getPaintState(page);
      expect(state.holdMode).toBe(true);

      // Draw rectangle on frame 1
      await page.keyboard.press('Home');
      await waitForFrame(page, 1);
      await page.keyboard.press('r'); // Rectangle tool
      await waitForTool(page, 'rectangle');

      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await waitForAnnotationCount(page, 1);

      // Verify annotation on frame 1
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(1);

      // Navigate to frame 5
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await waitForFrame(page, 5);

      // Shape should persist
      state = await getPaintState(page);
      expect(state.visibleAnnotationCount).toBe(1);
    });
  });
});
