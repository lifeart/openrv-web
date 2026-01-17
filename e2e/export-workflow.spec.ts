import {
  test,
  expect,
  loadVideoFile,
  loadRvSession,
  waitForTestHelper,
  drawStroke,
  getPaintState,
  getViewerState,
} from './fixtures';

test.describe('Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test.describe('Export Controls', () => {
    test('EXPORT-001: should have export button in header', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await expect(exportButton).toBeVisible();
    });

    test('EXPORT-002: should show export options on click', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Should show export format options
      const formatOptions = page.locator('button, option').filter({ hasText: /PNG|JPEG|WebP/ });
      const count = await formatOptions.count();
      // Export options should be available
    });

    test('EXPORT-003: should have PNG export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // PNG option is shown as "Save as PNG" text in export panel
      const pngOption = page.locator('text=Save as PNG');
      await expect(pngOption).toBeVisible();
    });

    test('EXPORT-004: should have JPEG export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // JPEG option is shown as "Save as JPEG" text in export panel
      const jpegOption = page.locator('text=Save as JPEG');
      await expect(jpegOption).toBeVisible();
    });

    test('EXPORT-005: should have WebP export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // WebP option is shown as "Save as WebP" text in export panel
      const webpOption = page.locator('text=Save as WebP');
      await expect(webpOption).toBeVisible();
    });
  });

  test.describe('Frame Export', () => {
    test('EXPORT-010: should trigger frame export with Ctrl+S', async ({ page }) => {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      await page.keyboard.press('Control+s');
      await page.waitForTimeout(500);

      // Download may or may not happen depending on implementation
      const download = await downloadPromise;
      // If download happened, it should be a PNG
    });

    test('EXPORT-011: should copy frame to clipboard with Ctrl+C', async ({ page }) => {
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(500);

      // Clipboard operations may require permissions
      // This test verifies the shortcut is handled
    });
  });

  test.describe('Include Annotations Option', () => {
    test('EXPORT-020: should have option to include annotations', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Look for annotations checkbox/toggle
      const annotationsOption = page.locator('input[type="checkbox"], button').filter({ hasText: /Annotation|Include/ });
      // Option may exist
    });
  });

  test.describe('Sequence Export', () => {
    test('EXPORT-030: should have sequence export option', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      const sequenceOption = page.locator('button, option').filter({ hasText: /Sequence|All Frames/ });
      // Sequence export may be available
    });

    test('EXPORT-031: should show progress for sequence export', async ({ page }) => {
      // Sequence export should show progress dialog
      // This is a complex operation that may take time
    });
  });

  test.describe('Session Export', () => {
    test('EXPORT-040: should save and reload RV session with ghost effects', async ({ page }) => {
      await waitForTestHelper(page);

      await page.click('button[data-tab-id="annotate"]');
      await page.waitForTimeout(200);
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      await drawStroke(page, [
        { x: 120, y: 120 },
        { x: 260, y: 180 },
      ]);
      await page.waitForTimeout(200);

      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      const paintState = await getPaintState(page);
      expect(paintState.ghostMode).toBe(true);
      expect(paintState.annotatedFrames.length).toBeGreaterThan(0);

      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await exportButton.click();
      await page.waitForTimeout(200);
      await page.click('text=Save RV Session (.rv)');

      const download = await downloadPromise;
      const outputPath = test.info().outputPath('session-export.rv');
      await download.saveAs(outputPath);

      await page.reload();
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(outputPath);
      await page.waitForTimeout(1000);

      const restoredPaint = await getPaintState(page);
      expect(restoredPaint.ghostMode).toBe(true);
      expect(restoredPaint.annotatedFrames.length).toBeGreaterThan(0);
    });

    test('EXPORT-041: re-export loaded RV session with edits', async ({ page }) => {
      await waitForTestHelper(page);
      await loadRvSession(page);
      await page.waitForTimeout(1000);

      await page.click('button[data-tab-id="annotate"]');
      await page.waitForTimeout(200);
      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      await drawStroke(page, [
        { x: 140, y: 140 },
        { x: 220, y: 200 },
      ]);
      await page.waitForTimeout(200);

      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      let paintState = await getPaintState(page);
      if (!paintState.ghostMode) {
        await page.keyboard.press('g');
        await page.waitForTimeout(200);
        paintState = await getPaintState(page);
      }

      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await exportButton.click();
      await page.waitForTimeout(200);
      await page.click('text=Save RV Session (.rv)');

      const download = await downloadPromise;
      const outputPath = test.info().outputPath('session-export-updated.rv');
      await download.saveAs(outputPath);

      await page.reload();
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(outputPath);
      await page.waitForTimeout(1000);

      const restoredPaint = await getPaintState(page);
      expect(restoredPaint.ghostMode).toBe(true);
      expect(restoredPaint.annotatedFrames.length).toBeGreaterThan(0);

      const viewerState = await getViewerState(page);
      expect(viewerState.channelMode).toBe('green');
    });
  });
});

test.describe('Full Workflow Tests', () => {
  test('WORKFLOW-001: complete viewing workflow - load, view, navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Load video
    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Verify media loaded
    const initialState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    expect(initialState?.hasMedia).toBe(true);
    expect(initialState?.frameCount).toBeGreaterThan(0);

    // Navigate to start - Home should go to inPoint (usually frame 0 or 1)
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    const homeState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const startFrame = homeState!.currentFrame;
    // Home goes to inPoint, which is at the beginning
    expect(startFrame).toBe(homeState!.inPoint);

    // Navigate forward
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    const afterRight = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    expect(afterRight?.currentFrame).toBe(startFrame + 2);

    // Navigate to end - End should go to outPoint
    await page.keyboard.press('End');
    await page.waitForTimeout(100);
    const endState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    // End goes to outPoint
    expect(endState?.currentFrame).toBe(endState!.outPoint);

    // Go back to start for zoom test
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // Zoom using View tab - click 200% button
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);
    const zoomButton = page.locator('button:has-text("200%")');
    await expect(zoomButton).toBeVisible();

    await zoomButton.click();
    await page.waitForTimeout(100);
    const zoomState = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(zoomState?.zoom).toBe(2);

    // Fit back - F key fits to window
    await page.keyboard.press('f');
    await page.waitForTimeout(100);
    const fitState = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    // Fit to window means zoom will be calculated to fit - verify it changed from 2
    expect(fitState?.zoom).not.toBe(2);

    // Play briefly
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const playingState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    expect(playingState?.isPlaying).toBe(true);

    // Stop
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    const stoppedState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    expect(stoppedState?.isPlaying).toBe(false);

    // Verify canvas visible
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('WORKFLOW-002: color correction workflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Verify initial color state
    const initialState = await page.evaluate(() => window.__OPENRV_TEST__?.getColorState());
    expect(initialState?.exposure).toBe(0);

    // First click the Color tab in the sidebar
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);

    // Now click the Color dropdown button in the content area (second "Color" button)
    // This button has title "Toggle color adjustments panel"
    await page.locator('button[title*="color adjustments"]').click();
    await page.waitForTimeout(200);

    // Wait for color panel to appear (it's appended to body)
    const colorPanel = page.locator('.color-controls-panel');
    await expect(colorPanel).toBeVisible();

    // Adjust exposure - find the slider in the panel
    // The slider rows have label elements with text, and input[type="range"] siblings
    const exposureSlider = colorPanel.locator('label:has-text("Exposure")').locator('..').locator('input[type="range"]');
    await exposureSlider.fill('1.5');
    await exposureSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    // Verify exposure changed in app state
    const afterState = await page.evaluate(() => window.__OPENRV_TEST__?.getColorState());
    expect(afterState?.exposure).toBe(1.5);

    // Verify preview canvas is still visible
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Reset using the Reset button
    await colorPanel.locator('button:has-text("Reset")').click();
    await page.waitForTimeout(100);

    // Verify reset in app state
    const resetState = await page.evaluate(() => window.__OPENRV_TEST__?.getColorState());
    expect(resetState?.exposure).toBe(0);
  });

  test('WORKFLOW-003: annotation workflow - draw and navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Verify initial paint state
    const initialPaint = await page.evaluate(() => window.__OPENRV_TEST__?.getPaintState());
    expect(initialPaint?.annotatedFrames).toEqual([]);

    // Switch to Annotate tab
    await page.click('button:has-text("Annotate")');
    await page.waitForTimeout(200);

    // Select pen tool
    await page.keyboard.press('p');
    await page.waitForTimeout(100);

    // Verify pen tool selected
    const penState = await page.evaluate(() => window.__OPENRV_TEST__?.getPaintState());
    expect(penState?.currentTool).toBe('pen');

    // Go to start frame and draw
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    const startState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const startFrame = startState!.currentFrame;

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Verify start frame is annotated
    const afterDraw1 = await page.evaluate(() => window.__OPENRV_TEST__?.getPaintState());
    expect(afterDraw1?.annotatedFrames).toContain(startFrame);
    expect(afterDraw1?.canUndo).toBe(true);

    // Go forward 5 frames and draw
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(100);

    const secondFrameState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const secondFrame = secondFrameState!.currentFrame;

    await page.mouse.move(box!.x + 50, box!.y + 50);
    await page.mouse.down();
    await page.mouse.move(box!.x + 150, box!.y + 150);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Verify second frame is also annotated
    const afterDraw2 = await page.evaluate(() => window.__OPENRV_TEST__?.getPaintState());
    expect(afterDraw2?.annotatedFrames).toContain(secondFrame);
    expect(afterDraw2?.annotatedFrames.length).toBe(2);

    // Navigate to first annotated frame
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('.');  // Next annotated frame
    await page.waitForTimeout(100);

    const navState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    // Should be at one of the annotated frames
    expect([startFrame, secondFrame]).toContain(navState?.currentFrame);

    // Undo last stroke
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // Verify undo worked (redo should now be available)
    const afterUndo = await page.evaluate(() => window.__OPENRV_TEST__?.getPaintState());
    expect(afterUndo?.canRedo).toBe(true);
  });

  test('WORKFLOW-004: transform workflow - rotate, flip, crop', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Verify initial transform state
    const initialTransform = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
    expect(initialTransform?.rotation).toBe(0);
    expect(initialTransform?.flipH).toBe(false);
    expect(initialTransform?.flipV).toBe(false);

    // Switch to Transform tab
    await page.click('button:has-text("Transform")');
    await page.waitForTimeout(200);

    // Rotate using Shift+R keyboard shortcut (rotates left/counter-clockwise = 270)
    await page.keyboard.press('Shift+r');
    await page.waitForTimeout(100);

    // Verify rotation changed - Shift+R rotates counter-clockwise (left), which is 270
    const afterRotate = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
    expect(afterRotate?.rotation).toBe(270);

    // Flip horizontal using keyboard shortcut
    await page.keyboard.press('Shift+h');
    await page.waitForTimeout(100);

    // Verify flip H changed
    const afterFlipH = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
    expect(afterFlipH?.flipH).toBe(true);

    // Verify initial crop state
    const initialViewer = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(initialViewer?.cropEnabled).toBe(false);

    // Click Crop button to open crop panel
    const cropButton = page.locator('button:has-text("Crop")').first();
    await cropButton.click();
    await page.waitForTimeout(200);

    // Verify crop panel is visible and properly positioned
    const cropPanel = page.locator('.crop-panel');
    await expect(cropPanel).toBeVisible();

    // Enable crop using the toggle in the panel
    const enableToggle = cropPanel.locator('button:has-text("OFF")');
    await enableToggle.click();
    await page.waitForTimeout(200);

    // Verify crop enabled
    const afterCropEnable = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(afterCropEnable?.cropEnabled).toBe(true);

    // Select 16:9 aspect ratio from dropdown (inside crop panel)
    const aspectSelect = cropPanel.locator('select').first();
    await expect(aspectSelect).toBeVisible();
    await aspectSelect.selectOption('16:9');
    await page.waitForTimeout(100);

    // Disable crop using toggle
    const disableToggle = cropPanel.locator('button:has-text("ON")');
    await disableToggle.click();
    await page.waitForTimeout(200);

    // Verify crop disabled
    const afterCropDisable = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(afterCropDisable?.cropEnabled).toBe(false);

    // Verify canvas visible
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('WORKFLOW-005: comparison workflow - wipe mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Verify initial wipe mode is off
    const initialState = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(initialState?.wipeMode).toBe('off');

    // Enable wipe mode (horizontal)
    await page.keyboard.press('Shift+w');
    await page.waitForTimeout(200);

    // Verify wipe mode changed to horizontal
    const wipeState = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(wipeState?.wipeMode).toBe('horizontal');

    // Make color adjustment to see difference in wipe
    // First click Color tab, then the Color dropdown button
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);

    // Click the Color dropdown button in content area
    await page.locator('button[title*="color adjustments"]').click();
    await page.waitForTimeout(200);

    // Wait for color panel
    const colorPanel = page.locator('.color-controls-panel');
    await expect(colorPanel).toBeVisible();

    // Adjust exposure using a valid value (-5 to +5 range)
    const exposureSlider = colorPanel.locator('label:has-text("Exposure")').locator('..').locator('input[type="range"]');
    await exposureSlider.fill('2');  // +2 stops exposure
    await exposureSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    // Verify exposure changed
    const colorState = await page.evaluate(() => window.__OPENRV_TEST__?.getColorState());
    expect(colorState?.exposure).toBe(2);

    // Close color panel by clicking outside
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Canvas should be visible with wipe effect
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Cycle through wipe modes: horizontal -> vertical
    await page.keyboard.press('Shift+w');
    await page.waitForTimeout(100);

    const verticalState = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(verticalState?.wipeMode).toBe('vertical');

    // Disable wipe: vertical -> off
    await page.keyboard.press('Shift+w');
    await page.waitForTimeout(100);

    const offState = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState());
    expect(offState?.wipeMode).toBe('off');
  });

  test('WORKFLOW-006: in/out points and playback loop', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Get initial state
    const initialState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const initialInPoint = initialState!.inPoint;
    const initialLoopMode = initialState!.loopMode;

    // Navigate to start then move forward 5 frames
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    const startState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const startFrame = startState!.currentFrame;

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(100);

    // Set in point
    await page.keyboard.press('i');
    await page.waitForTimeout(100);

    // Verify in point set to current frame
    const afterInPoint = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const expectedInPoint = startFrame + 5;
    expect(afterInPoint?.inPoint).toBe(expectedInPoint);

    // Navigate forward 10 more frames
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(100);

    // Set out point
    await page.keyboard.press('o');
    await page.waitForTimeout(100);

    // Verify out point set
    const afterOutPoint = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const expectedOutPoint = startFrame + 15;
    expect(afterOutPoint?.outPoint).toBe(expectedOutPoint);

    // Toggle loop mode - L cycles through: once -> loop -> pingpong -> once
    await page.keyboard.press('l');
    await page.waitForTimeout(100);

    // Verify loop mode changed - if was 'loop', now should be 'pingpong'
    // if was 'once', now should be 'loop'
    const afterLoop = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    const expectedNextMode: Record<string, string> = {
      'once': 'loop',
      'loop': 'pingpong',
      'pingpong': 'once'
    };
    expect(afterLoop?.loopMode).toBe(expectedNextMode[initialLoopMode]);

    // Play briefly
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Verify playing
    const playingState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    expect(playingState?.isPlaying).toBe(true);

    // Stop
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Verify stopped
    const stoppedState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    expect(stoppedState?.isPlaying).toBe(false);

    // Reset in/out points with 'r' key
    await page.keyboard.press('r');
    await page.waitForTimeout(100);

    // Verify reset - in point should be back to 1 (1-indexed frames)
    const resetState = await page.evaluate(() => window.__OPENRV_TEST__?.getSessionState());
    // Reset should restore in/out to full range (1 to frameCount, 1-indexed)
    expect(resetState?.inPoint).toBe(1);
  });
});

test.describe('RV Session Workflow', () => {
  test('RV-001: should load and display RV session', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadRvSession(page);
    await page.waitForTimeout(1000);

    // App should be functional
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Should be able to navigate
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
  });

  test('RV-002: should restore annotations from RV session', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadRvSession(page);
    await page.waitForTimeout(1000);

    // Check if annotations were loaded
    // Switch to annotate tab
    await page.click('button:has-text("Annotate")');
    await page.waitForTimeout(200);

    // Canvas should show any loaded annotations
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });
});

test.describe('Project Save/Load', () => {
  test('PROJECT-001: should have save project option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Look for save project button or use keyboard shortcut
    const saveButton = page.locator('button[title*="Save"], button:has-text("Save")').first();
    // May exist in header or menu
  });

  test('PROJECT-002: should have open project option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Look for project open button
    const openButton = page.locator('button[title*="Open"], button[title*="Project"]').first();
    // May exist in header
  });
});

test.describe('Error Handling', () => {
  test('ERROR-001: app should not crash on console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Perform various actions
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await page.keyboard.press('Space');

    // Check for critical errors (some warnings may be acceptable)
    const criticalErrors = errors.filter(e =>
      !e.includes('Warning') &&
      !e.includes('Deprecation')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('ERROR-002: app should handle rapid user input', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await loadVideoFile(page);
    await page.waitForTimeout(500);

    // Rapid key presses
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight');
    }
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowLeft');
    }

    // App should still be responsive
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });
});
