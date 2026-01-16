import { test, expect } from '@playwright/test';
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
      const zoom200 = page.locator('button:has-text("200%")');
      await zoom200.click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(2, 1);

      const zoomedScreenshot = await captureViewerScreenshot(page);

      // Now fit
      const fitButton = page.locator('button:has-text("Fit")');
      await fitButton.click();
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.zoom).toBeLessThan(2);

      const fittedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(zoomedScreenshot, fittedScreenshot)).toBe(true);
    });

    test('VIEW-002: clicking 50% zoom should update zoom state to 0.5', async ({ page }) => {
      const zoom50 = page.locator('button:has-text("50%")');
      await zoom50.click();
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(0.5, 1);
    });

    test('VIEW-003: clicking 100% zoom should update zoom state to 1.0', async ({ page }) => {
      const zoom100 = page.locator('button:has-text("100%")');
      await zoom100.click();
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(1, 1);
    });

    test('VIEW-004: clicking 200% zoom should update zoom state to 2.0', async ({ page }) => {
      const zoom200 = page.locator('button:has-text("200%")');
      await zoom200.click();
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(2, 1);
    });

    test('VIEW-005: clicking 400% zoom should update zoom state to 4.0', async ({ page }) => {
      const zoom400 = page.locator('button:has-text("400%")');
      await zoom400.click();
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(4, 1);
    });

    test('VIEW-006: pressing F key should fit to window', async ({ page }) => {
      // First zoom in
      await page.locator('button:has-text("200%")').click();
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
      // Zoom in first to enable panning
      await page.locator('button:has-text("200%")').click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialPanX = state.panX;
      const initialPanY = state.panY;

      const initialScreenshot = await captureViewerScreenshot(page);

      // Pan the image
      await dragOnCanvas(page, 100, 100, 200, 200);
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      // Pan values should have changed
      expect(state.panX !== initialPanX || state.panY !== initialPanY).toBe(true);

      const pannedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, pannedScreenshot)).toBe(true);
    });

    test('VIEW-011: fit to window should reset pan position', async ({ page }) => {
      // Zoom and pan
      await page.locator('button:has-text("200%")').click();
      await dragOnCanvas(page, 100, 100, 200, 200);
      await page.waitForTimeout(100);

      // Fit should reset pan
      await page.locator('button:has-text("Fit")').click();
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      // Pan should be reset to center (0, 0)
      expect(Math.abs(state.panX)).toBeLessThan(10);
      expect(Math.abs(state.panY)).toBeLessThan(10);
    });
  });

  test.describe('Wipe Control', () => {
    test('VIEW-020: wipe button should be visible in View tab', async ({ page }) => {
      const wipeButton = page.locator('button[title*="Wipe"]').first();
      await expect(wipeButton).toBeVisible();
    });

    test('VIEW-021: pressing W key should cycle through wipe modes and update state', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Press W to enable horizontal wipe
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      // Verify visual change
      const horizontalScreenshot = await captureViewerScreenshot(page);

      // Press W to switch to vertical wipe
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('vertical');

      const verticalScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(horizontalScreenshot, verticalScreenshot)).toBe(true);

      // Press W to switch to quad wipe
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('quad');

      // Press W to turn off
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');
    });

    test('VIEW-022: clicking wipe mode button should toggle wipe', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      const wipeButton = page.locator('button[title*="Wipe"]').first();
      await wipeButton.click();
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).not.toBe('off');
    });

    test('VIEW-023: dragging in wipe mode should change wipe position', async ({ page }) => {
      // Enable wipe mode
      await page.keyboard.press('w');
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
    test('VIEW-030: pressing K key should enable crop mode and show crop UI', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);

      // Press K to enable crop
      await page.keyboard.press('k');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Crop UI should be visible - look for aspect ratio buttons
      const aspectRatioButtons = page.locator('button:has-text("16:9"), button:has-text("4:3"), button:has-text("1:1")');
      const buttonCount = await aspectRatioButtons.count();
      expect(buttonCount).toBeGreaterThan(0);

      // Canvas should show crop overlay
      const cropOverlay = await captureViewerScreenshot(page);

      // Disable crop
      await page.keyboard.press('k');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);
    });

    test('VIEW-031: clicking crop button should toggle crop mode', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);

      const cropButton = page.locator('button[title*="Crop"]').first();
      if (await cropButton.isVisible()) {
        await cropButton.click();
        await page.waitForTimeout(200);

        state = await getViewerState(page);
        expect(state.cropEnabled).toBe(true);

        // Toggle off
        await cropButton.click();
        await page.waitForTimeout(200);

        state = await getViewerState(page);
        expect(state.cropEnabled).toBe(false);
      }
    });

    test('VIEW-032: crop aspect ratio buttons should update crop region visually', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('k');
      await page.waitForTimeout(200);

      const freeScreenshot = await captureViewerScreenshot(page);

      // Click 16:9 aspect ratio
      const aspect169 = page.locator('button:has-text("16:9")').first();
      if (await aspect169.isVisible()) {
        await aspect169.click();
        await page.waitForTimeout(200);

        const wideScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(freeScreenshot, wideScreenshot)).toBe(true);

        // Click 1:1 aspect ratio
        const aspect11 = page.locator('button:has-text("1:1")').first();
        if (await aspect11.isVisible()) {
          await aspect11.click();
          await page.waitForTimeout(200);

          const squareScreenshot = await captureViewerScreenshot(page);
          expect(imagesAreDifferent(wideScreenshot, squareScreenshot)).toBe(true);
        }
      }
    });

    test('VIEW-033: dragging crop handles should resize crop region', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('k');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Drag from corner to resize crop
      await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height * 0.1);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.3);
      await page.mouse.up();
      await page.waitForTimeout(200);

      const resizedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, resizedScreenshot)).toBe(true);
    });
  });

  test.describe('View State Persistence', () => {
    test('VIEW-040: zoom level should persist across frame changes', async ({ page }) => {
      // Set zoom to 200%
      await page.locator('button:has-text("200%")').click();
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
      // Zoom and pan
      await page.locator('button:has-text("200%")').click();
      await dragOnCanvas(page, 100, 100, 200, 200);
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
      await page.keyboard.press('w');
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
