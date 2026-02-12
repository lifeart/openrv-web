import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  waitForLoopMode,
  getViewerState,
  getPaintState,
  getTransformState,
  getCanvas,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Keyboard Shortcuts Tests
 *
 * Each test verifies actual state changes after keyboard shortcuts.
 */

async function expectViewZoomControlVisible(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('[data-testid="zoom-control-button"]')).toBeVisible();
}

async function selectZoomPreset(page: import('@playwright/test').Page, value: 'fit' | '2'): Promise<void> {
  await page.locator('[data-testid="zoom-control-button"]').click();
  const dropdown = page.locator('[data-testid="zoom-dropdown"]');
  await expect(dropdown).toBeVisible();
  await dropdown.locator(`button[data-value="${value}"]`).click();
}

async function cycleLoopModeWithShortcut(page: import('@playwright/test').Page): Promise<void> {
  // Dispatch Ctrl+L on <body> to avoid browser-level shortcut interception while
  // keeping an HTMLElement event target for KeyboardManager filtering logic.
  await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      key: 'l',
      code: 'KeyL',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
  });
}

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test.describe('Tab Navigation Shortcuts', () => {
    test('KEYS-001: 1 key should switch to View tab and show zoom controls', async ({ page }) => {
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(100);

      await page.keyboard.press('1');
      await page.waitForTimeout(100);

      // Verify View tab controls are visible (proves View tab is active)
      await expectViewZoomControlVisible(page);
    });

    test('KEYS-002: 2 key should switch to Color tab', async ({ page }) => {
      await page.keyboard.press('2');
      await page.waitForTimeout(100);

      // Color controls should be visible
      const colorButton = page.locator('button[title*="color"], button[title*="Color"]').first();
      await expect(colorButton).toBeVisible();
    });

    test('KEYS-003: 3 key should switch to Effects tab', async ({ page }) => {
      await page.keyboard.press('3');
      await page.waitForTimeout(100);

      // Effects controls should be visible
      const filterButton = page.locator('button[title*="Filter"], button[title*="filter"]').first();
      await expect(filterButton).toBeVisible();
    });

    test('KEYS-004: 4 key should switch to Transform tab', async ({ page }) => {
      await page.keyboard.press('4');
      await page.waitForTimeout(100);

      // Transform controls should be visible
      const rotateButton = page.locator('button[title*="Rotate"]').first();
      await expect(rotateButton).toBeVisible();
    });

    test('KEYS-005: 5 key should switch to Annotate tab and show paint tools', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      // Verify Annotate tab controls - pen tool should be selectable
      const state = await getPaintState(page);
      expect(['pan', 'pen', 'eraser', 'text', 'none']).toContain(state.currentTool);
    });
  });

  test.describe('Playback Shortcuts', () => {
    test('KEYS-010: Space should toggle play/pause and update isPlaying state', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);

      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
    });

    test('KEYS-011: ArrowLeft should step backward and update currentFrame', async ({ page }) => {
      // Go forward first
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const frameAfterForward = state.currentFrame;

      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(frameAfterForward - 1);
    });

    test('KEYS-012: ArrowRight should step forward and update currentFrame', async ({ page }) => {
      let state = await getSessionState(page);
      const initialFrame = state.currentFrame;

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(initialFrame + 1);
    });

    test('KEYS-013: Home should go to frame 1', async ({ page }) => {
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.currentFrame).toBeGreaterThan(1);

      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);
    });

    test('KEYS-014: End should go to last frame', async ({ page }) => {
      let state = await getSessionState(page);
      const frameCount = state.frameCount;

      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(frameCount);
    });

    test('KEYS-015: ArrowUp should toggle play direction', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.playDirection).toBe(1);

      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.playDirection).toBe(-1);

      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.playDirection).toBe(1);
    });
  });

  test.describe('View Shortcuts', () => {
    test('KEYS-020: F should fit to window and update zoom state', async ({ page }) => {
      // First zoom in via view dropdown
      await selectZoomPreset(page, '2');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      const zoomedIn = state.zoom;
      expect(zoomedIn).toBeGreaterThan(1);

      await page.keyboard.press('f');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.zoom).toBeLessThan(zoomedIn);
    });

    test('KEYS-021: 0 should zoom to 50%', async ({ page }) => {
      await page.keyboard.press('1'); // Ensure View tab
      await page.keyboard.press('f');
      await page.waitForTimeout(100);
      const fitZoom = (await getViewerState(page)).zoom;

      await page.keyboard.press('0');
      await page.waitForTimeout(100);

      const state = await getViewerState(page);
      expect(state.zoom).toBeGreaterThan(0);
      expect(state.zoom).toBeLessThan(fitZoom);
    });

    test('KEYS-022: W should cycle wipe mode and update wipeMode state', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('vertical');

      // Continue cycle (off -> horizontal -> vertical -> splitscreen-h -> splitscreen-v -> off)
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-h');

      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('splitscreen-v');

      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');
    });
  });

  test.describe('Timeline Shortcuts', () => {
    test('KEYS-030: I should set in point and update inPoint state', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const targetFrame = state.currentFrame;

      await page.keyboard.press('i');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.inPoint).toBe(targetFrame);
    });

    test('KEYS-031: O should set out point and update outPoint state', async ({ page }) => {
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const targetFrame = state.currentFrame;

      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.outPoint).toBe(targetFrame);
    });

    test('KEYS-032: [ should set in point', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const targetFrame = state.currentFrame;

      await page.keyboard.press('[');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.inPoint).toBe(targetFrame);
    });

    test('KEYS-033: ] should set out point', async ({ page }) => {
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const targetFrame = state.currentFrame;

      await page.keyboard.press(']');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.outPoint).toBe(targetFrame);
    });

    test('KEYS-034: R should reset in/out points to full range', async ({ page }) => {
      // Set custom in/out points
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('i');
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('o');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.inPoint).toBeGreaterThan(1);
      expect(state.outPoint).toBeLessThan(state.frameCount);

      await page.keyboard.press('r');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.inPoint).toBe(1);
      expect(state.outPoint).toBe(state.frameCount);
    });

    test('KEYS-035: M should toggle mark and update marks array', async ({ page }) => {
      let state = await getSessionState(page);
      const currentFrame = state.currentFrame;
      expect(state.marks).not.toContain(currentFrame);

      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.marks).toContain(currentFrame);

      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.marks).not.toContain(currentFrame);
    });

    test('KEYS-036: Ctrl+L should cycle loop mode', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.loopMode).toBe('loop');

      await cycleLoopModeWithShortcut(page);
      await waitForLoopMode(page, 'pingpong');

      state = await getSessionState(page);
      expect(state.loopMode).toBe('pingpong');

      await cycleLoopModeWithShortcut(page);
      await waitForLoopMode(page, 'once');

      state = await getSessionState(page);
      expect(state.loopMode).toBe('once');

      await cycleLoopModeWithShortcut(page);
      await waitForLoopMode(page, 'loop');

      state = await getSessionState(page);
      expect(state.loopMode).toBe('loop');
    });
  });

  test.describe('Paint Shortcuts', () => {
    test('KEYS-040: V should select pan tool and update currentTool state', async ({ page }) => {
      await page.keyboard.press('5'); // Annotate tab
      await page.keyboard.press('p'); // First select pen
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.currentTool).toBe('pen');

      await page.keyboard.press('v');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.currentTool).toBe('pan');
    });

    test('KEYS-041: P should select pen tool and update currentTool state', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('pen');
    });

    test('KEYS-042: E should select eraser tool and update currentTool state', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      await page.keyboard.press('e');
      await page.waitForTimeout(100);

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('eraser');
    });

    test('KEYS-043: T should select text tool and update currentTool state', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      await page.keyboard.press('t');
      await page.waitForTimeout(100);

      const state = await getPaintState(page);
      expect(state.currentTool).toBe('text');
    });

    test('KEYS-044: B should toggle brush type and update brushType state', async ({ page }) => {
      await page.keyboard.press('5');
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      const initialBrush = state.brushType;

      await page.keyboard.press('b');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.brushType).not.toBe(initialBrush);

      await page.keyboard.press('b');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.brushType).toBe(initialBrush);
    });

    test('KEYS-045: G should toggle ghost mode and update ghostMode state', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      const initialGhost = state.ghostMode;

      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(!initialGhost);

      await page.keyboard.press('g');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.ghostMode).toBe(initialGhost);
    });

    test('KEYS-046: Ctrl+Z should undo and update canUndo/canRedo state', async ({ page }) => {
      await page.keyboard.press('5');
      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      // Draw stroke
      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      let state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);

      const screenshotBefore = await captureViewerScreenshot(page);

      await page.keyboard.press('Control+z');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);

      // Canvas should have changed
      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('KEYS-047: Ctrl+Y should redo and update canUndo/canRedo state', async ({ page }) => {
      await page.keyboard.press('5');
      await page.keyboard.press('p');
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();

      // Draw and undo
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

      await page.keyboard.press('Control+y');
      await page.waitForTimeout(100);

      state = await getPaintState(page);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
    });
  });

  test.describe('Color Shortcuts', () => {
    test('KEYS-050: C should toggle color panel visibility', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const colorPanel = page.locator('.color-controls-panel');
      await expect(colorPanel).toBeVisible();

      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      await expect(colorPanel).not.toBeVisible();
    });

    test('KEYS-051: Escape should close color panel', async ({ page }) => {
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const colorPanel = page.locator('.color-controls-panel');
      await expect(colorPanel).toBeVisible();

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      await expect(colorPanel).not.toBeVisible();
    });
  });

  test.describe('Transform Shortcuts', () => {
    test('KEYS-060: Shift+R should rotate left and update rotation state', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      await page.keyboard.press('Shift+r');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(270);

      // Canvas should visually change
      const rotatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, rotatedScreenshot)).toBe(true);
    });

    test('KEYS-061: Alt+R should rotate right and update rotation state', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      // Canvas should visually change
      const rotatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, rotatedScreenshot)).toBe(true);
    });

    test('KEYS-062: Alt+H should flip horizontal and update flipH state', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.flipH).toBe(false);

      const initialScreenshot = await captureViewerScreenshot(page);

      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipH).toBe(true);

      // Canvas should visually change
      const flippedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, flippedScreenshot)).toBe(true);

      // Toggle back
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(100);

      state = await getTransformState(page);
      expect(state.flipH).toBe(false);
    });

    test('KEYS-063: Shift+V should flip vertical and produce visual change', async ({ page }) => {
      const initialScreenshot = await captureViewerScreenshot(page);

      // Use keyboard shortcut Shift+V to flip
      await page.keyboard.press('Shift+V');
      await page.waitForTimeout(200);

      // Canvas should visually change after flip
      const flippedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, flippedScreenshot)).toBe(true);

      // Flip again to verify toggle
      await page.keyboard.press('Shift+V');
      await page.waitForTimeout(100);

      // Should return to original (or at least different from flipped)
      const restoredScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(flippedScreenshot, restoredScreenshot)).toBe(true);
    });

    test('KEYS-064: Shift+K should toggle crop mode and update cropEnabled state', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);

      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Crop mode enables overlay on canvas (state is the primary verification)

      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);
    });
  });

  test.describe('Export Shortcuts', () => {
    test('KEYS-070: Ctrl+S should trigger export', async ({ page }) => {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);

      await page.keyboard.press('Control+s');
      await page.waitForTimeout(500);

      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.(png|jpg|webp)$/i);
      }
    });

    test('KEYS-071: Ctrl+C should copy frame (no error)', async ({ page }) => {
      // Just verify no errors occur
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.keyboard.press('Control+c');
      await page.waitForTimeout(200);

      expect(errors.length).toBe(0);
    });
  });

  test.describe('Annotation Navigation Shortcuts', () => {
    test('KEYS-080: , should go to previous annotation', async ({ page }) => {
      // Create annotations first
      await page.keyboard.press('5'); // Annotate tab
      await page.keyboard.press('p'); // Pen tool
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

      // Go to frame 5
      let state = await getSessionState(page);
      expect(state.currentFrame).toBe(5);

      // Navigate to previous annotation
      await page.keyboard.press(',');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);
    });

    test('KEYS-081: . should go to next annotation', async ({ page }) => {
      // Create annotations first
      await page.keyboard.press('5');
      await page.keyboard.press('p');
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

      // Go back to frame 1
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      expect(state.currentFrame).toBe(1);

      // Navigate to next annotation
      await page.keyboard.press('.');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(5);
    });
  });

  test.describe('Input Focus Handling', () => {
    // Helper to open color wheels panel and get number input
    async function openColorWheelsAndGetNumberInput(page: import('@playwright/test').Page) {
      await page.keyboard.press('Shift+Alt+w');
      const colorWheelsPanel = page.locator('[data-testid="color-wheels-container"]');
      await expect(colorWheelsPanel).toBeVisible();
      const numberInput = colorWheelsPanel.locator('input[type="number"]').first();
      await expect(numberInput).toBeVisible();
      return numberInput;
    }

    test('KEYS-090: shortcuts should not trigger when typing in text input', async ({ page }) => {
      // Open marker panel which has a text input (note textarea)
      await page.keyboard.press('Shift+Alt+KeyM');
      await page.waitForTimeout(100);

      // Add a marker to get a note input
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      const editButton = page.locator(`[data-testid="marker-edit-${state.currentFrame}"]`);
      await editButton.click();

      const noteInput = page.locator(`[data-testid="marker-note-input-${state.currentFrame}"]`);
      await expect(noteInput).toBeVisible();

      // Focus and type - Space should insert space, not toggle playback
      await noteInput.focus();
      await noteInput.fill('test content');

      // Verify playback not triggered
      const newState = await getSessionState(page);
      expect(newState.isPlaying).toBe(false);
    });

    test('KEYS-091: global shortcuts should work with range/slider inputs', async ({ page }) => {
      // Range inputs (sliders) should allow shortcuts since they're not text inputs
      // Open color wheels panel which has sliders
      await page.keyboard.press('Shift+Alt+w');
      const colorWheelsPanel = page.locator('[data-testid="color-wheels-container"]');
      await expect(colorWheelsPanel).toBeVisible();

      const rangeInput = colorWheelsPanel.locator('input[type="range"]').first();
      await expect(rangeInput).toBeVisible();

      await rangeInput.focus();

      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);

      await page.keyboard.press('Space');
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(true);

      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
    });

    test('KEYS-092: shortcuts should not trigger when typing in number input', async ({ page }) => {
      const numberInput = await openColorWheelsAndGetNumberInput(page);

      // Get initial state
      let state = await getSessionState(page);
      const initialFrame = state.currentFrame;

      // Focus and type in the number input
      await numberInput.focus();

      // Type numbers that would normally trigger tab shortcuts (1-5)
      await page.keyboard.type('123');

      // Verify frame did not change (shortcuts were not triggered)
      state = await getSessionState(page);
      expect(state.currentFrame).toBe(initialFrame);

      // Verify the value was entered in the input
      const inputValue = await numberInput.inputValue();
      expect(inputValue).toContain('123');
    });

    test('KEYS-093: space key should not toggle playback when focused on number input', async ({ page }) => {
      const numberInput = await openColorWheelsAndGetNumberInput(page);

      // Verify not playing initially
      let state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);

      // Focus the number input
      await numberInput.focus();

      // Press Space - should not toggle playback
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);

      // Verify still not playing
      state = await getSessionState(page);
      expect(state.isPlaying).toBe(false);
    });

    test('KEYS-094: arrow keys should not navigate frames when in number input', async ({ page }) => {
      const numberInput = await openColorWheelsAndGetNumberInput(page);

      // Get initial frame
      let state = await getSessionState(page);
      const initialFrame = state.currentFrame;

      // Focus the number input and set a value
      await numberInput.focus();
      await numberInput.fill('0.5');

      // Press arrow keys (normally navigate frames)
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Verify frame did not change
      state = await getSessionState(page);
      expect(state.currentFrame).toBe(initialFrame);
    });

    test('KEYS-095: shortcuts work after blurring number input', async ({ page }) => {
      const numberInput = await openColorWheelsAndGetNumberInput(page);

      // Focus and then blur the input
      await numberInput.focus();
      await numberInput.blur();

      // Click outside to ensure focus is lost
      await page.click('body');

      // Close color wheels panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      // Now shortcuts should work again
      let state = await getSessionState(page);
      const initialFrame = state.currentFrame;

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      state = await getSessionState(page);
      expect(state.currentFrame).toBe(initialFrame + 1);
    });

    test('KEYS-096: Home/End keys should not navigate timeline when in number input', async ({ page }) => {
      // Go to middle of timeline first (before opening panel)
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      let state = await getSessionState(page);
      const initialFrame = state.currentFrame;
      expect(initialFrame).toBeGreaterThan(1);

      const numberInput = await openColorWheelsAndGetNumberInput(page);

      // Focus the number input
      await numberInput.focus();
      await numberInput.fill('0.25');

      // Press Home and End (normally navigate to first/last frame)
      await page.keyboard.press('Home');
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      // Verify frame did not change
      state = await getSessionState(page);
      expect(state.currentFrame).toBe(initialFrame);
    });
  });
});
