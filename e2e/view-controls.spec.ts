import { test, expect, Page } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
  dragOnCanvas,
} from './fixtures';

/**
 * View Controls Tests
 *
 * Each test verifies actual state changes (zoom, pan, wipe, crop)
 * and visual modifications to the canvas.
 */

// Helper to select a zoom level from the ZoomControl dropdown
async function selectZoomLevel(page: Page, label: string) {
  // Open zoom dropdown
  await page.click('[data-testid="zoom-control-button"]');
  await page.waitForTimeout(100);
  // Click the dropdown option - dropdown options use role="option"
  await page.click(`[role="option"]:has-text("${label}")`);
  await page.waitForTimeout(100);
}

test.describe('View Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Ensure View tab is selected
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test.describe('Zoom Controls', () => {
    test('VIEW-001: clicking Fit button should update zoom state and change canvas', async ({ page }) => {
      // First zoom to 200% to set a known state
      await selectZoomLevel(page, '200%');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(2, 1);

      const zoomedScreenshot = await captureViewerScreenshot(page);

      // Now fit
      await selectZoomLevel(page, 'Fit');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.zoom).toBeLessThan(2);

      const fittedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(zoomedScreenshot, fittedScreenshot)).toBe(true);
    });

    test('VIEW-002: clicking 50% zoom should update zoom state to 0.5', async ({ page }) => {
      await selectZoomLevel(page, '50%');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(0.5, 1);
    });

    test('VIEW-003: clicking 100% zoom should update zoom state to 1.0', async ({ page }) => {
      await selectZoomLevel(page, '100%');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(1, 1);
    });

    test('VIEW-004: clicking 200% zoom should update zoom state to 2.0', async ({ page }) => {
      await selectZoomLevel(page, '200%');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(2, 1);
    });

    test('VIEW-005: clicking 400% zoom should update zoom state to 4.0', async ({ page }) => {
      await selectZoomLevel(page, '400%');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(4, 1);
    });

    test('VIEW-006: pressing F key should fit to window', async ({ page }) => {
      // First zoom in
      await selectZoomLevel(page, '200%');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      const zoomedIn = state.zoom;

      // Press F to fit
      await page.keyboard.press('f');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.zoom).toBeLessThan(zoomedIn);
    });

    test('VIEW-007: scroll wheel should change zoom level', async ({ page }) => {
      const initialState = await getViewerState(page);
      const initialZoom = initialState.zoom;

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Scroll to zoom in
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(200);

      const zoomedInState = await getViewerState(page);
      expect(zoomedInState.zoom).toBeGreaterThan(initialZoom);

      // Scroll to zoom out
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(200);

      const zoomedOutState = await getViewerState(page);
      expect(zoomedOutState.zoom).toBeLessThan(zoomedInState.zoom);
    });
  });

  test.describe('Pan Controls', () => {
    test('VIEW-010: dragging canvas at high zoom should update pan position', async ({ page }) => {
      // Ensure pan mode is selected (V key selects pan/none tool)
      await page.keyboard.press('v');
      await page.waitForTimeout(100);

      // Zoom in first to enable visible panning
      await selectZoomLevel(page, '200%');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialPanX = state.panX;
      const initialPanY = state.panY;

      const initialScreenshot = await captureViewerScreenshot(page);

      // Get the viewer container (where pointer events are handled)
      const viewerContainer = page.locator('.viewer-container').first();
      const box = await viewerContainer.boundingBox();
      expect(box).not.toBeNull();

      // Pan the image using mouse drag - use center of container
      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;
      const endX = startX + 100;
      const endY = startY + 100;

      await page.mouse.move(startX, startY);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      // Pan values should have changed
      expect(state.panX !== initialPanX || state.panY !== initialPanY).toBe(true);

      const pannedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, pannedScreenshot)).toBe(true);
    });

    test('VIEW-011: fit to window should reset pan position', async ({ page }) => {
      // Ensure pan mode is selected
      await page.keyboard.press('v');
      await page.waitForTimeout(100);

      // Zoom in
      await selectZoomLevel(page, '200%');
      await page.waitForTimeout(100);

      // Get the viewer container
      const viewerContainer = page.locator('.viewer-container').first();
      const box = await viewerContainer.boundingBox();
      expect(box).not.toBeNull();

      // Pan the image
      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(startX + 100, startY + 100, { steps: 10 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(100);

      // Fit should reset pan
      await selectZoomLevel(page, 'Fit');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      // Pan should be reset to center (0, 0)
      expect(Math.abs(state.panX)).toBeLessThan(10);
      expect(Math.abs(state.panY)).toBeLessThan(10);
    });
  });

  test.describe('Wipe Control (via CompareControl)', () => {
    test('VIEW-020: compare control button should be visible in View tab', async ({ page }) => {
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await expect(compareButton).toBeVisible();
    });

    test('VIEW-021: pressing Shift+W key should cycle through wipe modes and update state', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Press Shift+W to enable horizontal wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      // Verify visual change
      const horizontalScreenshot = await captureViewerScreenshot(page);

      // Press Shift+W to switch to vertical wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('vertical');

      const verticalScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(horizontalScreenshot, verticalScreenshot)).toBe(true);

      // Press Shift+W to turn off (cycles: off -> horizontal -> vertical -> off)
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');
    });

    test('VIEW-022: clicking wipe mode in compare dropdown should toggle wipe', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Open Compare dropdown
      await page.click('[data-testid="compare-control-button"]');
      await page.waitForTimeout(100);

      // Click H-Wipe option
      await page.click('[data-wipe-mode="horizontal"]');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');
    });

    test('VIEW-023: dragging in wipe mode should change wipe position', async ({ page }) => {
      // Enable wipe mode
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialPosition = state.wipePosition;

      const initialScreenshot = await captureViewerScreenshot(page);

      // Drag to change wipe position
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 3, box!.y + box!.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      // Position should have changed
      expect(state.wipePosition).not.toBeCloseTo(initialPosition, 1);

      const newScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, newScreenshot)).toBe(true);
    });
  });

  test.describe('Crop Control', () => {
    test('VIEW-030: pressing Shift+K should enable crop mode and update state', async ({ page }) => {
      // Switch to Transform tab where crop control is located
      await page.click('button[data-tab-id="transform"]');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);

      // Press K to enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Click crop button to open panel with aspect ratio options
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      // Crop UI should now be visible - look for aspect ratio select dropdown
      const aspectSelect = page.locator('[data-testid="crop-aspect-select"]');
      await expect(aspectSelect).toBeVisible();

      // Verify options exist
      const options = aspectSelect.locator('option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(1); // Should have Free, 16:9, 4:3, 1:1, etc.

      // Disable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);
    });

    test('VIEW-031: clicking crop button should open panel and enable crop via toggle', async ({ page }) => {
      // Switch to Transform tab where crop control is located
      await page.click('button[data-tab-id="transform"]');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);

      // Click crop button to open panel
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      // Verify crop panel is visible and properly positioned (not behind viewer)
      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();
      const panelBox = await cropPanel.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.y).toBeGreaterThanOrEqual(0);

      // Click the toggle switch inside the crop panel to enable crop
      const toggleSwitch = cropPanel.locator('button:has-text("OFF")').first();
      await expect(toggleSwitch).toBeVisible();
      await toggleSwitch.click();
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Toggle off by clicking ON button
      const toggleOn = cropPanel.locator('button:has-text("ON")').first();
      await toggleOn.click();
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);
    });

    test('VIEW-032: crop aspect ratio select should update crop region visually', async ({ page }) => {
      // Switch to Transform tab where crop control is located
      await page.click('button[data-tab-id="transform"]');
      await page.waitForTimeout(100);

      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Click crop button to open panel
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      // Verify crop panel is visible
      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      const freeScreenshot = await captureViewerScreenshot(page);

      // Select 16:9 aspect ratio from dropdown inside crop panel
      const aspectSelect = cropPanel.locator('select').first();
      await expect(aspectSelect).toBeVisible();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      const wideScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(freeScreenshot, wideScreenshot)).toBe(true);

      // Select 1:1 aspect ratio
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      const squareScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(wideScreenshot, squareScreenshot)).toBe(true);
    });

    test('VIEW-033: dragging crop handles should resize crop region', async ({ page }) => {
      // Switch to Transform tab where crop control is located
      await page.click('button[data-tab-id="transform"]');
      await page.waitForTimeout(100);

      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Drag from bottom-right corner to resize crop (crop starts at full image)
      const brX = box!.x + box!.width;
      const brY = box!.y + box!.height;
      await page.mouse.move(brX - 5, brY - 5);
      await page.mouse.down();
      await page.mouse.move(brX - box!.width * 0.3, brY - box!.height * 0.3, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      const resizedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, resizedScreenshot)).toBe(true);
    });
  });

  test.describe('View State Persistence', () => {
    test('VIEW-040: zoom level should persist across frame changes', async ({ page }) => {
      // Set zoom to 200%
      await selectZoomLevel(page, '200%');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(2, 1);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Zoom should be maintained
      state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(2, 1);
    });

    test('VIEW-041: pan position should persist across frame changes', async ({ page }) => {
      // Ensure pan mode is selected
      await page.keyboard.press('v');
      await page.waitForTimeout(100);

      // Zoom in
      await selectZoomLevel(page, '200%');
      await page.waitForTimeout(100);

      // Get the viewer container
      const viewerContainer = page.locator('.viewer-container').first();
      const box = await viewerContainer.boundingBox();
      expect(box).not.toBeNull();

      // Pan the image
      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(startX + 100, startY + 100, { steps: 10 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      const panX = state.panX;
      const panY = state.panY;

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Pan should be maintained
      state = await getViewerState(page);
      expect(state.panX).toBeCloseTo(panX, 0);
      expect(state.panY).toBeCloseTo(panY, 0);
    });

    test('VIEW-042: wipe mode should persist across frame changes', async ({ page }) => {
      // Enable horizontal wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Wipe mode should be maintained
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');
    });
  });
});
