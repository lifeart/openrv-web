import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getSessionState,
  getViewerState,
  getColorState,
  getTransformState,
  getPaintState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForFrame,
  waitForPlaybackState,
  waitForLoopMode,
  waitForCondition,
  waitForRotation,
  waitForTool,
  waitForWipeMode,
  waitForCropEnabled,
  waitForTabActive,
} from './fixtures';

/**
 * Business Logic Tests
 *
 * These tests verify actual application state and business rules,
 * not just UI visibility. Each test has meaningful assertions about
 * the expected behavior of the application.
 */

test.describe('Session State Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('BIZ-001: loading media should initialize session with correct state', async ({ page }) => {
    // Before loading - no media
    const stateBefore = await getSessionState(page);
    expect(stateBefore.hasMedia).toBe(false);
    expect(stateBefore.frameCount).toBe(0);

    // Load video
    await loadVideoFile(page);

    // After loading - media present with valid state
    const stateAfter = await getSessionState(page);
    expect(stateAfter.hasMedia).toBe(true);
    expect(stateAfter.mediaType).toBe('video');
    expect(stateAfter.frameCount).toBeGreaterThan(0);
    expect(stateAfter.currentFrame).toBeGreaterThanOrEqual(1);
    expect(stateAfter.inPoint).toBe(1);
    expect(stateAfter.outPoint).toBe(stateAfter.frameCount);
    expect(stateAfter.fps).toBeGreaterThan(0);
  });

  test('BIZ-002: frame navigation should update currentFrame correctly', async ({ page }) => {
    await loadVideoFile(page);
    const initialState = await getSessionState(page);

    // Go to start
    await page.keyboard.press('Home');
    await waitForFrame(page, 1);

    let state = await getSessionState(page);
    expect(state.currentFrame).toBe(1);

    // Step forward
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 2);

    state = await getSessionState(page);
    expect(state.currentFrame).toBe(2);

    // Step forward again
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 3);

    state = await getSessionState(page);
    expect(state.currentFrame).toBe(3);

    // Step backward
    await page.keyboard.press('ArrowLeft');
    await waitForFrame(page, 2);

    state = await getSessionState(page);
    expect(state.currentFrame).toBe(2);

    // Go to end
    await page.keyboard.press('End');
    await waitForFrame(page, initialState.frameCount);

    state = await getSessionState(page);
    expect(state.currentFrame).toBe(initialState.frameCount);
  });

  test('BIZ-003: in/out points should constrain playback range', async ({ page }) => {
    await loadVideoFile(page);
    const initialState = await getSessionState(page);

    // Set in point at frame 3
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 3);
    await page.keyboard.press('i');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.inPoint === 3; })()`);

    let state = await getSessionState(page);
    expect(state.inPoint).toBe(3);
    expect(state.outPoint).toBe(initialState.frameCount); // Unchanged

    // Go to frame 5 and set out point
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 5);
    await page.keyboard.press('o');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.outPoint === 5; })()`);

    state = await getSessionState(page);
    expect(state.inPoint).toBe(3);
    expect(state.outPoint).toBe(5);

    // Reset in/out points
    await page.keyboard.press('r');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.inPoint === 1 && s?.outPoint === ${initialState.frameCount}; })()`);

    state = await getSessionState(page);
    expect(state.inPoint).toBe(1);
    expect(state.outPoint).toBe(initialState.frameCount);
  });

  test('BIZ-004: loop mode should cycle through all modes', async ({ page }) => {
    await loadVideoFile(page);

    // Initial state should be 'loop'
    let state = await getSessionState(page);
    expect(state.loopMode).toBe('loop');

    // Press Ctrl+L to cycle to 'pingpong'
    await page.keyboard.press('Control+l');
    await waitForLoopMode(page, 'pingpong');

    state = await getSessionState(page);
    expect(state.loopMode).toBe('pingpong');

    // Press Ctrl+L to cycle to 'once'
    await page.keyboard.press('Control+l');
    await waitForLoopMode(page, 'once');

    state = await getSessionState(page);
    expect(state.loopMode).toBe('once');

    // Press Ctrl+L to cycle back to 'loop'
    await page.keyboard.press('Control+l');
    await waitForLoopMode(page, 'loop');

    state = await getSessionState(page);
    expect(state.loopMode).toBe('loop');
  });

  test('BIZ-005: marks should be toggleable and persist', async ({ page }) => {
    await loadVideoFile(page);

    // Initially no marks
    let state = await getSessionState(page);
    expect(state.marks).toHaveLength(0);

    // Add mark at frame 1
    await page.keyboard.press('Home');
    await waitForFrame(page, 1);
    await page.keyboard.press('m');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.marks?.length === 1; })()`);

    state = await getSessionState(page);
    expect(state.marks).toContain(1);

    // Go to frame 5 and add another mark
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 5);
    await page.keyboard.press('m');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.marks?.length === 2; })()`);

    state = await getSessionState(page);
    expect(state.marks).toHaveLength(2);
    expect(state.marks).toContain(1);
    expect(state.marks).toContain(5);

    // Toggle off the mark at frame 5
    await page.keyboard.press('m');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.marks?.length === 1; })()`);

    state = await getSessionState(page);
    expect(state.marks).toHaveLength(1);
    expect(state.marks).toContain(1);
    expect(state.marks).not.toContain(5);
  });

  test('BIZ-006: playback toggle should update isPlaying state', async ({ page }) => {
    await loadVideoFile(page);

    // Initially not playing
    let state = await getSessionState(page);
    expect(state.isPlaying).toBe(false);

    // Start playback
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, true);

    state = await getSessionState(page);
    expect(state.isPlaying).toBe(true);

    // Stop playback
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, false);

    state = await getSessionState(page);
    expect(state.isPlaying).toBe(false);
  });
});

test.describe('Color Adjustments State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('BIZ-010: default color state should be neutral', async ({ page }) => {
    const state = await getColorState(page);

    // All adjustments should be at neutral/default values
    expect(state.exposure).toBe(0);
    expect(state.gamma).toBe(1);
    expect(state.saturation).toBe(1);
    expect(state.contrast).toBe(1);
    expect(state.temperature).toBe(0);
    expect(state.tint).toBe(0);
    expect(state.brightness).toBe(0);
    expect(state.hasLUT).toBe(false);
    expect(state.lutIntensity).toBe(1);
  });

  test('BIZ-011: adjusting exposure should update state and visually change image', async ({ page }) => {
    test.slow(); // Video loading + color controls initialisation can be slow under parallel load
    // Capture initial state and screenshot
    const initialState = await getColorState(page);
    const initialScreenshot = await captureViewerScreenshot(page);

    // Set exposure to +3 via the test helper API.
    // Under parallel load, colorControls may not be ready yet (setExposure
    // silently no-ops when controls are null), so we retry inside the
    // polling loop until the value is actually applied.
    await page.waitForFunction(
      ({ v, t }) => {
        const helper = (window as any).__OPENRV_TEST__;
        if (!helper) return false;
        helper.setExposure(v);
        const state = helper.getColorState();
        return state != null && Math.abs(state.exposure - v) <= t;
      },
      { v: 3, t: 0.01 },
      { timeout: 15000 }
    );

    // Verify state updated
    const newState = await getColorState(page);
    expect(newState.exposure).toBe(3);
    expect(newState.gamma).toBe(initialState.gamma); // Others unchanged
    expect(newState.saturation).toBe(initialState.saturation);

    // Verify visual change
    const newScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, newScreenshot)).toBe(true);
  });

  test('BIZ-012: resetting exposure should return to default state', async ({ page }) => {
    test.slow(); // Video loading + color controls initialisation can be slow under parallel load
    // Set exposure to +3 via the test helper API.
    // Retry inside the polling loop in case colorControls is not ready.
    await page.waitForFunction(
      ({ v, t }) => {
        const helper = (window as any).__OPENRV_TEST__;
        if (!helper) return false;
        helper.setExposure(v);
        const state = helper.getColorState();
        return state != null && Math.abs(state.exposure - v) <= t;
      },
      { v: 3, t: 0.01 },
      { timeout: 15000 }
    );

    let state = await getColorState(page);
    expect(state.exposure).toBe(3);

    // Reset exposure back to default — same retry pattern
    await page.waitForFunction(
      ({ v, t }) => {
        const helper = (window as any).__OPENRV_TEST__;
        if (!helper) return false;
        helper.setExposure(v);
        const state = helper.getColorState();
        return state != null && Math.abs(state.exposure - v) <= t;
      },
      { v: 0, t: 0.01 },
      { timeout: 15000 }
    );

    state = await getColorState(page);
    expect(state.exposure).toBe(0); // Back to default
  });
});

test.describe('Transform State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('BIZ-020: default transform state should be identity', async ({ page }) => {
    const state = await getTransformState(page);

    expect(state.rotation).toBe(0);
    expect(state.flipH).toBe(false);
    expect(state.flipV).toBe(false);
  });

  test('BIZ-021: rotation should cycle through 0, 90, 180, 270 degrees', async ({ page }) => {
    // Go to Transform tab
    await page.click('button[data-tab-id="transform"]');
    await waitForTabActive(page, 'transform');

    let state = await getTransformState(page);
    expect(state.rotation).toBe(0);

    // Rotate right (clockwise)
    await page.locator('button[title*="Rotate right"]').click();
    await waitForRotation(page, 90);

    state = await getTransformState(page);
    expect(state.rotation).toBe(90);

    // Rotate right again
    await page.locator('button[title*="Rotate right"]').click();
    await waitForRotation(page, 180);

    state = await getTransformState(page);
    expect(state.rotation).toBe(180);

    // Rotate right again
    await page.locator('button[title*="Rotate right"]').click();
    await waitForRotation(page, 270);

    state = await getTransformState(page);
    expect(state.rotation).toBe(270);

    // Rotate right again - should wrap to 0
    await page.locator('button[title*="Rotate right"]').click();
    await waitForRotation(page, 0);

    state = await getTransformState(page);
    expect(state.rotation).toBe(0);
  });

  test('BIZ-022: flip horizontal should toggle flipH state', async ({ page }) => {
    await page.click('button[data-tab-id="transform"]');
    await waitForTabActive(page, 'transform');

    let state = await getTransformState(page);
    expect(state.flipH).toBe(false);

    // Flip horizontal
    await page.locator('button[title*="Flip horizontal"]').click();
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getTransformState(); return s?.flipH === true; })()`);

    state = await getTransformState(page);
    expect(state.flipH).toBe(true);
    expect(state.flipV).toBe(false); // V unchanged

    // Flip horizontal again - should toggle off
    await page.locator('button[title*="Flip horizontal"]').click();
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getTransformState(); return s?.flipH === false; })()`);

    state = await getTransformState(page);
    expect(state.flipH).toBe(false);
  });

  test('BIZ-023: flip vertical should toggle flipV state', async ({ page }) => {
    await page.click('button[data-tab-id="transform"]');
    await waitForTabActive(page, 'transform');

    let state = await getTransformState(page);
    expect(state.flipV).toBe(false);

    // Flip vertical
    await page.locator('button[title*="Flip vertical"]').click();
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getTransformState(); return s?.flipV === true; })()`);

    state = await getTransformState(page);
    expect(state.flipV).toBe(true);
    expect(state.flipH).toBe(false); // H unchanged

    // Flip vertical again - should toggle off
    await page.locator('button[title*="Flip vertical"]').click();
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getTransformState(); return s?.flipV === false; })()`);

    state = await getTransformState(page);
    expect(state.flipV).toBe(false);
  });

  test('BIZ-024: reset should restore default transform', async ({ page }) => {
    await page.click('button[data-tab-id="transform"]');
    await waitForTabActive(page, 'transform');

    // Apply various transforms
    await page.locator('button[title*="Rotate right"]').click();
    await page.locator('button[title*="Flip horizontal"]').click();
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getTransformState(); return s?.rotation === 90 && s?.flipH === true; })()`);

    let state = await getTransformState(page);
    expect(state.rotation).toBe(90);
    expect(state.flipH).toBe(true);

    // Reset transforms
    await page.locator('button[title="Reset transforms"]').click();
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getTransformState(); return s?.rotation === 0 && s?.flipH === false && s?.flipV === false; })()`);

    state = await getTransformState(page);
    expect(state.rotation).toBe(0);
    expect(state.flipH).toBe(false);
    expect(state.flipV).toBe(false);
  });
});

test.describe('Paint/Annotation State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="annotate"]');
    await waitForTabActive(page, 'annotate');
  });

  test('BIZ-030: selecting tools should update currentTool state', async ({ page }) => {
    // Default should be pan
    let state = await getPaintState(page);

    // Select pen
    await page.keyboard.press('p');
    await waitForTool(page, 'pen');

    state = await getPaintState(page);
    expect(state.currentTool).toBe('pen');

    // Select eraser
    await page.keyboard.press('e');
    await waitForTool(page, 'eraser');

    state = await getPaintState(page);
    expect(state.currentTool).toBe('eraser');

    // Select text
    await page.keyboard.press('t');
    await waitForTool(page, 'text');

    state = await getPaintState(page);
    expect(state.currentTool).toBe('text');

    // Select pan
    await page.keyboard.press('v');
    await waitForTool(page, 'pan');

    state = await getPaintState(page);
    expect(state.currentTool).toBe('pan');
  });

  test('BIZ-031: drawing should add frame to annotatedFrames and enable undo', async ({ page }) => {
    // Select pen
    await page.keyboard.press('p');
    await waitForTool(page, 'pen');

    // Initially no annotations
    let state = await getPaintState(page);
    expect(state.annotatedFrames).toHaveLength(0);
    expect(state.canUndo).toBe(false);

    // Get current frame
    const sessionState = await getSessionState(page);
    const currentFrame = sessionState.currentFrame;

    // Draw a stroke
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Should have annotation on current frame
    state = await getPaintState(page);
    expect(state.annotatedFrames).toContain(currentFrame);
    expect(state.canUndo).toBe(true);
  });

  test('BIZ-032: undo should remove stroke and canRedo should become true', async ({ page }) => {
    await page.keyboard.press('p');
    await waitForTool(page, 'pen');

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw
    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(200);

    let state = await getPaintState(page);
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);

    // Undo
    await page.keyboard.press('Control+z');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.canUndo === false && s?.canRedo === true; })()`);

    state = await getPaintState(page);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(true);
  });

  test('BIZ-033: redo should restore stroke', async ({ page }) => {
    await page.keyboard.press('p');
    await waitForTool(page, 'pen');

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw
    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Undo
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
  });

  test('BIZ-034: toggling brush type should update brushType state', async ({ page }) => {
    await page.keyboard.press('p');
    await waitForTool(page, 'pen');

    let state = await getPaintState(page);
    const initialBrush = state.brushType;
    const expectedBrush = initialBrush === 'circle' ? 'gaussian' : 'circle';

    // Toggle brush
    await page.keyboard.press('b');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.brushType === '${expectedBrush}'; })()`);

    state = await getPaintState(page);
    expect(state.brushType).not.toBe(initialBrush);

    // Toggle back
    await page.keyboard.press('b');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getPaintState(); return s?.brushType === '${initialBrush}'; })()`);

    state = await getPaintState(page);
    expect(state.brushType).toBe(initialBrush);
  });
});

test.describe('Viewer State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('BIZ-040: wipe mode should cycle correctly', async ({ page }) => {
    let state = await getViewerState(page);
    expect(state.wipeMode).toBe('off');

    // Press W to cycle
    await page.keyboard.press('Shift+w');
    await waitForWipeMode(page, 'horizontal');

    state = await getViewerState(page);
    expect(state.wipeMode).toBe('horizontal');

    await page.keyboard.press('Shift+w');
    await waitForWipeMode(page, 'vertical');

    state = await getViewerState(page);
    expect(state.wipeMode).toBe('vertical');

    await page.keyboard.press('Shift+w');
    await waitForWipeMode(page, 'splitscreen-h');

    state = await getViewerState(page);
    expect(state.wipeMode).toBe('splitscreen-h');

    await page.keyboard.press('Shift+w');
    await waitForWipeMode(page, 'splitscreen-v');

    state = await getViewerState(page);
    expect(state.wipeMode).toBe('splitscreen-v');

    await page.keyboard.press('Shift+w');
    await waitForWipeMode(page, 'off');

    state = await getViewerState(page);
    expect(state.wipeMode).toBe('off');
  });

  test('BIZ-041: crop toggle should update cropEnabled state', async ({ page }) => {
    let state = await getViewerState(page);
    expect(state.cropEnabled).toBe(false);

    // Toggle crop with Shift+K
    await page.keyboard.press('Shift+k');
    await waitForCropEnabled(page, true);

    state = await getViewerState(page);
    expect(state.cropEnabled).toBe(true);

    // Toggle off
    await page.keyboard.press('Shift+k');
    await waitForCropEnabled(page, false);

    state = await getViewerState(page);
    expect(state.cropEnabled).toBe(false);
  });
});

test.describe('End-to-End Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('BIZ-050: complete color grading workflow', async ({ page }) => {
    test.slow(); // Video loading + color controls initialisation can be slow under parallel load
    // 1. Load media
    await loadVideoFile(page);
    let session = await getSessionState(page);
    expect(session.hasMedia).toBe(true);

    // 2. Navigate to specific frame
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 3);

    session = await getSessionState(page);
    expect(session.currentFrame).toBe(3);

    // 3. Apply color adjustments via the test helper API.
    //    Retry inside the polling loop in case colorControls is not ready.
    await page.click('button[data-tab-id="color"]');
    await page.waitForFunction(
      ({ v, t }) => {
        const helper = (window as any).__OPENRV_TEST__;
        if (!helper) return false;
        helper.setExposure(v);
        const state = helper.getColorState();
        return state != null && Math.abs(state.exposure - v) <= t;
      },
      { v: 1.5, t: 0.01 },
      { timeout: 15000 }
    );

    const colorState = await getColorState(page);
    expect(colorState.exposure).toBe(1.5);

    // 4. Enable wipe to compare
    await page.keyboard.press('Shift+w');
    await waitForWipeMode(page, 'horizontal');

    const viewerState = await getViewerState(page);
    expect(viewerState.wipeMode).toBe('horizontal');

    // 5. Verify all states are consistent
    const finalSession = await getSessionState(page);
    expect(finalSession.currentFrame).toBe(3);
    expect(finalSession.hasMedia).toBe(true);
  });

  test('BIZ-051: complete annotation workflow', async ({ page }) => {
    // 1. Load media
    await loadVideoFile(page);

    // 2. Go to frame 1
    await page.keyboard.press('Home');
    await waitForFrame(page, 1);

    let session = await getSessionState(page);
    expect(session.currentFrame).toBe(1);

    // 3. Switch to annotate and select pen
    await page.click('button[data-tab-id="annotate"]');
    await page.keyboard.press('p');
    await waitForTool(page, 'pen');

    let paint = await getPaintState(page);
    expect(paint.currentTool).toBe('pen');

    // 4. Draw annotation on frame 1
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(200);

    paint = await getPaintState(page);
    expect(paint.annotatedFrames).toContain(1);
    expect(paint.canUndo).toBe(true);

    // 5. Navigate to frame 5
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitForFrame(page, 5);

    session = await getSessionState(page);
    expect(session.currentFrame).toBe(5);

    // 6. Draw annotation on frame 5
    await page.mouse.move(box!.x + 150, box!.y + 150);
    await page.mouse.down();
    await page.mouse.move(box!.x + 250, box!.y + 250);
    await page.mouse.up();
    await page.waitForTimeout(200);

    paint = await getPaintState(page);
    expect(paint.annotatedFrames).toContain(1);
    expect(paint.annotatedFrames).toContain(5);

    // 7. Navigate between annotations
    await page.keyboard.press(','); // Previous annotation
    await waitForFrame(page, 1);

    session = await getSessionState(page);
    expect(session.currentFrame).toBe(1);

    await page.keyboard.press('.'); // Next annotation
    await waitForFrame(page, 5);

    session = await getSessionState(page);
    expect(session.currentFrame).toBe(5);
  });

  test('BIZ-052: transform and playback workflow', async ({ page }) => {
    // 1. Load media
    await loadVideoFile(page);
    let session = await getSessionState(page);
    const totalFrames = session.frameCount;

    // 2. Apply transforms
    await page.click('button[data-tab-id="transform"]');
    await waitForTabActive(page, 'transform');

    await page.locator('button[title*="Rotate right"]').click();
    await page.locator('button[title*="Flip horizontal"]').click();
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getTransformState(); return s?.rotation === 90 && s?.flipH === true; })()`);

    let transform = await getTransformState(page);
    expect(transform.rotation).toBe(90);
    expect(transform.flipH).toBe(true);

    // 3. Set in/out points
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('i');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.inPoint === 3; })()`);

    session = await getSessionState(page);
    expect(session.inPoint).toBe(3);

    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('o');
    await waitForCondition(page, `(() => { const s = window.__OPENRV_TEST__?.getSessionState(); return s?.outPoint === ${totalFrames - 1}; })()`);

    session = await getSessionState(page);
    expect(session.outPoint).toBe(totalFrames - 1);

    // 4. Start playback — click the viewer first to move focus away from
    //    transform buttons, otherwise Space re-clicks the focused button
    //    instead of toggling playback.
    const canvas = page.locator('canvas').first();
    await canvas.click();
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, true);

    session = await getSessionState(page);
    expect(session.isPlaying).toBe(true);

    // 5. Stop playback
    await page.keyboard.press('Space');
    await waitForPlaybackState(page, false);

    session = await getSessionState(page);
    expect(session.isPlaying).toBe(false);

    // 6. Transforms should still be applied
    transform = await getTransformState(page);
    expect(transform.rotation).toBe(90);
    expect(transform.flipH).toBe(true);
  });
});
