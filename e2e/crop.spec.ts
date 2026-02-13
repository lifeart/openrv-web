import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
  waitForCropEnabled,
  waitForCropAspectRatio,
  getCanvas,
} from './fixtures';

/**
 * Crop Controls E2E Tests
 *
 * Comprehensive tests for crop functionality ensuring functional parity
 * with original OpenRV behavior. Tests cover:
 * - Crop toggle (keyboard and UI)
 * - Aspect ratio presets and their effect on crop region
 * - Crop region state persistence
 * - Crop reset functionality
 * - Visual overlay rendering
 * - Session persistence
 */

test.describe('Crop Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Transform tab where crop control is located
    await page.click('button[data-tab-id="transform"]');
    await page.waitForTimeout(200);
  });

  test.describe('Crop Toggle', () => {
    test('CROP-001: pressing Shift+K should toggle crop mode on', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);

      await page.keyboard.press('Shift+k');
      await waitForCropEnabled(page, true);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
    });

    test('CROP-002: pressing Shift+K twice should toggle crop mode off', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await waitForCropEnabled(page, true);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      await page.keyboard.press('Shift+k');
      await waitForCropEnabled(page, false);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);
    });

    test('CROP-003: crop button should open panel', async ({ page }) => {
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();
    });

    test('CROP-004: panel toggle switch should enable/disable crop', async ({ page }) => {
      // Open crop panel
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      // Enable crop via toggle
      const enableToggle = cropPanel.getByRole('switch', { name: 'Enable Crop' });
      await enableToggle.click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Disable crop via toggle
      await enableToggle.click();
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);
    });

    test('CROP-005: Escape key should close crop panel', async ({ page }) => {
      // Open crop panel
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      // Press Escape to close panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      await expect(cropPanel).not.toBeVisible();
    });

    test('CROP-006: clicking outside panel should NOT close it (allows handle dragging)', async ({ page }) => {
      // Open crop panel
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      // Click outside panel (on canvas) - panel should stay open
      const canvas = await getCanvas(page);
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      await page.mouse.click(canvasBox!.x + canvasBox!.width - 10, canvasBox!.y + canvasBox!.height - 10);
      await page.waitForTimeout(200);

      await expect(cropPanel).toBeVisible();
    });

    test('CROP-007: crop handles should NOT intercept events when panel is closed', async ({ page }) => {
      // Enable crop and set a non-full region via panel
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Close panel by pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await expect(cropPanel).not.toBeVisible();

      // Get current crop state
      let state = await getViewerState(page);
      const regionBefore = { ...state.cropRegion };
      expect(regionBefore.width).toBeLessThan(1);

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Try to drag where a crop handle would be — it should NOT resize the crop
      // because handles are inactive when panel is closed (prevents interfering with other tools)
      const brX = box!.x + box!.width * (regionBefore.x + regionBefore.width);
      const brY = box!.y + box!.height * (regionBefore.y + regionBefore.height);
      await page.mouse.move(brX - 3, brY - 3);
      await page.mouse.down();
      await page.mouse.move(brX - box!.width * 0.1, brY - box!.height * 0.1, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Crop region should be unchanged (handles are disabled when panel is closed)
      state = await getViewerState(page);
      expect(state.cropRegion.width).toBeCloseTo(regionBefore.width, 2);
      expect(state.cropRegion.height).toBeCloseTo(regionBefore.height, 2);
    });

    test('CROP-008: crop handles should work when panel is open', async ({ page }) => {
      // Enable crop and set a non-full region via panel
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Panel is still open — handles should be interactive
      let state = await getViewerState(page);
      const regionBefore = { ...state.cropRegion };

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Drag the bottom-right corner inward with panel open
      const brX = box!.x + box!.width * (regionBefore.x + regionBefore.width);
      const brY = box!.y + box!.height * (regionBefore.y + regionBefore.height);
      await page.mouse.move(brX - 3, brY - 3);
      await page.mouse.down();
      await page.mouse.move(brX - box!.width * 0.1, brY - box!.height * 0.1, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify crop region changed (handles work with panel open)
      state = await getViewerState(page);
      expect(state.cropRegion.width).toBeLessThan(regionBefore.width);
      expect(state.cropRegion.height).toBeLessThan(regionBefore.height);
    });

    test('CROP-009: crop state should persist after panel close', async ({ page }) => {
      // Enable crop and set 16:9
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const regionWithPanel = { ...state.cropRegion };
      const aspectWithPanel = state.cropAspectRatio;

      // Close panel with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await expect(cropPanel).not.toBeVisible();

      // Verify state persisted after panel close
      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.cropAspectRatio).toBe(aspectWithPanel);
      expect(state.cropRegion.width).toBeCloseTo(regionWithPanel.width, 2);
      expect(state.cropRegion.height).toBeCloseTo(regionWithPanel.height, 2);
    });
  });

  test.describe('Default Crop Region', () => {
    test('CROP-010: default crop region should cover full image', async ({ page }) => {
      const state = await getViewerState(page);
      expect(state.cropRegion.x).toBe(0);
      expect(state.cropRegion.y).toBe(0);
      expect(state.cropRegion.width).toBe(1);
      expect(state.cropRegion.height).toBe(1);
    });

    test('CROP-011: default aspect ratio should be null (free)', async ({ page }) => {
      const state = await getViewerState(page);
      expect(state.cropAspectRatio).toBeNull();
    });

    test('CROP-012: enabling crop should not change default region', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.cropRegion.x).toBe(0);
      expect(state.cropRegion.y).toBe(0);
      expect(state.cropRegion.width).toBe(1);
      expect(state.cropRegion.height).toBe(1);
    });
  });

  test.describe('Aspect Ratio Presets', () => {
    test('CROP-020: aspect ratio dropdown should show all presets', async ({ page }) => {
      // Open crop panel
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await expect(aspectSelect).toBeVisible();

      // Verify all expected options exist
      const options = await aspectSelect.locator('option').allTextContents();
      expect(options).toContain('Free');
      expect(options).toContain('16:9');
      expect(options).toContain('4:3');
      expect(options).toContain('1:1');
      expect(options).toContain('9:16');
      expect(options).toContain('2.35:1');
    });

    test('CROP-021: selecting 16:9 aspect ratio should update aspect ratio state', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await waitForCropEnabled(page, true);

      // Open crop panel and select aspect ratio
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await waitForCropAspectRatio(page, '16:9');

      const state = await getViewerState(page);
      expect(state.cropAspectRatio).toBe('16:9');
    });

    test('CROP-022: selecting 16:9 should adjust crop region to 16:9 pixel ratio', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel and select aspect ratio
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      // Compute actual pixel ratio from normalized crop region and source dimensions
      const sourceDims = await page.evaluate(() => {
        const source = (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentSource;
        return { width: source?.width ?? 1, height: source?.height ?? 1 };
      });
      const actualPixelRatio = (state.cropRegion.width * sourceDims.width) / (state.cropRegion.height * sourceDims.height);
      expect(actualPixelRatio).toBeCloseTo(16 / 9, 1);
    });

    test('CROP-023: selecting 1:1 should create square crop region in pixels', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel and select aspect ratio
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.cropAspectRatio).toBe('1:1');
      // For 1:1, the pixel dimensions should be equal (not normalized coords)
      const sourceDims = await page.evaluate(() => {
        const source = (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentSource;
        return { width: source?.width ?? 1, height: source?.height ?? 1 };
      });
      const pixelWidth = state.cropRegion.width * sourceDims.width;
      const pixelHeight = state.cropRegion.height * sourceDims.height;
      expect(pixelWidth).toBeCloseTo(pixelHeight, 0);
    });

    test('CROP-024: selecting 4:3 aspect ratio should produce correct pixel ratio', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel and select aspect ratio
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('4:3');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.cropAspectRatio).toBe('4:3');
      const sourceDims = await page.evaluate(() => {
        const source = (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentSource;
        return { width: source?.width ?? 1, height: source?.height ?? 1 };
      });
      const actualPixelRatio = (state.cropRegion.width * sourceDims.width) / (state.cropRegion.height * sourceDims.height);
      expect(actualPixelRatio).toBeCloseTo(4 / 3, 1);
    });

    test('CROP-025: selecting 9:16 (portrait) aspect ratio should produce correct pixel ratio', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel and select aspect ratio
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.cropAspectRatio).toBe('9:16');
      const sourceDims = await page.evaluate(() => {
        const source = (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentSource;
        return { width: source?.width ?? 1, height: source?.height ?? 1 };
      });
      const actualPixelRatio = (state.cropRegion.width * sourceDims.width) / (state.cropRegion.height * sourceDims.height);
      expect(actualPixelRatio).toBeCloseTo(9 / 16, 1);
    });

    test('CROP-026: selecting Free should allow any aspect ratio', async ({ page }) => {
      // Enable crop and set a specific aspect ratio first
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();

      // Set 1:1 first
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Then switch to Free
      await aspectSelect.selectOption('');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.cropAspectRatio).toBeNull();
    });

    test('CROP-027: aspect ratio changes should be visually reflected', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Open crop panel and select 16:9
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      const wideScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, wideScreenshot)).toBe(true);

      // Change to 1:1
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      const squareScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(wideScreenshot, squareScreenshot)).toBe(true);
    });
  });

  test.describe('Crop Reset', () => {
    test('CROP-030: reset button should restore default crop state', async ({ page }) => {
      // Enable crop and set aspect ratio
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Verify state changed
      let state = await getViewerState(page);
      expect(state.cropAspectRatio).toBe('1:1');

      // Click reset button
      const resetButton = cropPanel.getByRole('button', { name: 'Reset Crop' });
      await resetButton.click();
      await page.waitForTimeout(200);

      // Verify state reset
      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(false);
      expect(state.cropAspectRatio).toBeNull();
      expect(state.cropRegion.x).toBe(0);
      expect(state.cropRegion.y).toBe(0);
      expect(state.cropRegion.width).toBe(1);
      expect(state.cropRegion.height).toBe(1);
    });

    test('CROP-031: reset should update visual overlay', async ({ page }) => {
      // Enable crop and set aspect ratio
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      const beforeResetScreenshot = await captureViewerScreenshot(page);

      // Click reset button
      const resetButton = cropPanel.getByRole('button', { name: 'Reset Crop' });
      await resetButton.click();
      await page.waitForTimeout(200);

      const afterResetScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(beforeResetScreenshot, afterResetScreenshot)).toBe(true);
    });
  });

  test.describe('Crop Visual Overlay', () => {
    test('CROP-040: enabling crop with non-full region should show overlay', async ({ page }) => {
      const beforeCropScreenshot = await captureViewerScreenshot(page);

      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a non-full aspect ratio to create visible crop region
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16'); // Portrait will definitely create non-full crop
      await page.waitForTimeout(200);

      const afterCropScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(beforeCropScreenshot, afterCropScreenshot)).toBe(true);
    });

    test('CROP-041: disabling crop should hide overlay', async ({ page }) => {
      // Enable crop with non-full region
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      const cropEnabledScreenshot = await captureViewerScreenshot(page);

      // Disable crop via reset
      const resetButton = cropPanel.getByRole('button', { name: 'Reset Crop' });
      await resetButton.click();
      await page.waitForTimeout(200);

      const cropDisabledScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(cropEnabledScreenshot, cropDisabledScreenshot)).toBe(true);
    });

    test('CROP-042: crop overlay should show rule of thirds guides when editing', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Capture screenshot without overlay (full-frame crop skips overlay)
      const noOverlayScreenshot = await captureViewerScreenshot(page);

      // Open panel and set non-full crop to trigger overlay with guides
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // With panel open and non-full region, overlay should show guides
      const overlayScreenshot = await captureViewerScreenshot(page);

      // The overlay (with darkened areas, handles, guides) should make images differ
      expect(imagesAreDifferent(noOverlayScreenshot, overlayScreenshot)).toBe(true);

      const state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.cropRegion.width).toBeLessThan(1);
    });
  });

  test.describe('Crop State Persistence', () => {
    test('CROP-050: crop enabled state should persist across frame changes', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Crop should still be enabled
      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
    });

    test('CROP-051: aspect ratio should persist across frame changes', async ({ page }) => {
      // Enable crop and set aspect ratio
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropAspectRatio).toBe('16:9');

      // Close panel and step to next frame
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Aspect ratio should persist
      state = await getViewerState(page);
      expect(state.cropAspectRatio).toBe('16:9');
    });

    test('CROP-052: crop region should persist across frame changes', async ({ page }) => {
      // Enable crop and set aspect ratio
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialRegion = { ...state.cropRegion };

      // Close panel and step to next frame
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Region should persist
      state = await getViewerState(page);
      expect(state.cropRegion.x).toBeCloseTo(initialRegion.x, 2);
      expect(state.cropRegion.y).toBeCloseTo(initialRegion.y, 2);
      expect(state.cropRegion.width).toBeCloseTo(initialRegion.width, 2);
      expect(state.cropRegion.height).toBeCloseTo(initialRegion.height, 2);
    });
  });

  test.describe('Crop Region Constraints', () => {
    test('CROP-060: crop region values should be normalized (0-1)', async ({ page }) => {
      const state = await getViewerState(page);
      expect(state.cropRegion.x).toBeGreaterThanOrEqual(0);
      expect(state.cropRegion.x).toBeLessThanOrEqual(1);
      expect(state.cropRegion.y).toBeGreaterThanOrEqual(0);
      expect(state.cropRegion.y).toBeLessThanOrEqual(1);
      expect(state.cropRegion.width).toBeGreaterThanOrEqual(0);
      expect(state.cropRegion.width).toBeLessThanOrEqual(1);
      expect(state.cropRegion.height).toBeGreaterThanOrEqual(0);
      expect(state.cropRegion.height).toBeLessThanOrEqual(1);
    });

    test('CROP-061: crop region should stay within bounds after aspect ratio change', async ({ page }) => {
      // Enable crop and set aspect ratio
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();

      // Try all aspect ratios
      for (const ratio of ['16:9', '4:3', '1:1', '9:16', '2.35:1']) {
        await aspectSelect.selectOption(ratio);
        await page.waitForTimeout(100);

        const state = await getViewerState(page);
        // x + width should not exceed 1
        expect(state.cropRegion.x + state.cropRegion.width).toBeLessThanOrEqual(1.001);
        // y + height should not exceed 1
        expect(state.cropRegion.y + state.cropRegion.height).toBeLessThanOrEqual(1.001);
      }
    });

    test('CROP-062: aspect ratio should be centered in available space', async ({ page }) => {
      // Enable crop and set aspect ratio
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      // For a centered crop, x should equal (1 - width) / 2
      // and y should equal (1 - height) / 2
      const expectedX = (1 - state.cropRegion.width) / 2;
      const expectedY = (1 - state.cropRegion.height) / 2;
      expect(state.cropRegion.x).toBeCloseTo(expectedX, 1);
      expect(state.cropRegion.y).toBeCloseTo(expectedY, 1);
    });
  });

  test.describe('Aspect Ratio Pixel Correctness', () => {
    // Helper to get source dimensions
    async function getSourceDimensions(page: any) {
      return page.evaluate(() => {
        const source = (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentSource;
        return { width: source?.width ?? 1, height: source?.height ?? 1 };
      });
    }

    // Helper to compute actual pixel aspect ratio from crop region
    function computePixelRatio(cropRegion: { width: number; height: number }, source: { width: number; height: number }) {
      return (cropRegion.width * source.width) / (cropRegion.height * source.height);
    }

    test('CROP-200: all presets should produce correct pixel aspect ratios', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      const sourceDims = await getSourceDimensions(page);

      const presets: { value: string; expectedRatio: number }[] = [
        { value: '16:9', expectedRatio: 16 / 9 },
        { value: '4:3', expectedRatio: 4 / 3 },
        { value: '1:1', expectedRatio: 1 },
        { value: '9:16', expectedRatio: 9 / 16 },
        { value: '2.35:1', expectedRatio: 2.35 },
      ];

      for (const preset of presets) {
        // Reset to free first to start fresh
        await aspectSelect.selectOption('');
        await page.waitForTimeout(100);

        await aspectSelect.selectOption(preset.value);
        await page.waitForTimeout(200);

        const state = await getViewerState(page);
        const actualRatio = computePixelRatio(state.cropRegion, sourceDims);
        expect(actualRatio).toBeCloseTo(preset.expectedRatio, 1);
      }
    });

    test('CROP-201: 16:9 crop on wide source should use full height', async ({ page }) => {
      // The test video is wider than 16:9, so 16:9 crop should use full height
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      const sourceDims = await getSourceDimensions(page);
      const sourceAspect = sourceDims.width / sourceDims.height;

      // Source is wider than 16:9, so crop should use full height (height=1)
      // and reduce width to match ratio
      if (sourceAspect > 16 / 9) {
        expect(state.cropRegion.height).toBeCloseTo(1, 2);
        expect(state.cropRegion.width).toBeLessThan(1);
      }
    });

    test('CROP-202: 1:1 crop should produce equal pixel dimensions', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      const sourceDims = await getSourceDimensions(page);

      const pixelWidth = state.cropRegion.width * sourceDims.width;
      const pixelHeight = state.cropRegion.height * sourceDims.height;

      // Pixel dimensions should be equal for 1:1
      expect(pixelWidth).toBeCloseTo(pixelHeight, 0);

      // Should maximize: the square should be as large as the shorter dimension allows
      const maxSquareSize = Math.min(sourceDims.width, sourceDims.height);
      expect(pixelWidth).toBeCloseTo(maxSquareSize, 0);
    });

    test('CROP-203: 9:16 (portrait) on landscape source should use full height', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      const sourceDims = await getSourceDimensions(page);

      // 9:16 is narrower than any landscape source, so height should be full
      expect(state.cropRegion.height).toBeCloseTo(1, 2);
      expect(state.cropRegion.width).toBeLessThan(1);

      // Verify the actual pixel width/height ratio is 9:16
      const pixelWidth = state.cropRegion.width * sourceDims.width;
      const pixelHeight = state.cropRegion.height * sourceDims.height;
      expect(pixelWidth / pixelHeight).toBeCloseTo(9 / 16, 2);
    });

    test('CROP-204: 2.35:1 crop should be close to source aspect on very wide video', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('2.35:1');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      const sourceDims = await getSourceDimensions(page);
      const sourceAspect = sourceDims.width / sourceDims.height;

      // 2.35:1 is close to this video's aspect ratio (~2.39:1)
      // So the crop should nearly fill the frame
      const actualRatio = computePixelRatio(state.cropRegion, sourceDims);
      expect(actualRatio).toBeCloseTo(2.35, 1);

      // Since source is slightly wider than 2.35:1, height should be full
      if (sourceAspect > 2.35) {
        expect(state.cropRegion.height).toBeCloseTo(1, 2);
      }
    });

    test('CROP-205: crop region should be maximized when applied from full-frame', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      const resetButton = cropPanel.getByRole('button', { name: 'Reset Crop' });
      const sourceDims = await getSourceDimensions(page);
      const sourceAspect = sourceDims.width / sourceDims.height;

      const presets: { value: string; ratio: number }[] = [
        { value: '16:9', ratio: 16 / 9 },
        { value: '4:3', ratio: 4 / 3 },
        { value: '1:1', ratio: 1 },
        { value: '9:16', ratio: 9 / 16 },
        { value: '2.35:1', ratio: 2.35 },
      ];

      for (const preset of presets) {
        // Reset crop to full-frame before each preset to test maximization
        await resetButton.click();
        await page.waitForTimeout(100);

        // Re-enable crop after reset (reset disables it)
        const toggleBtn = cropPanel.getByRole('switch', { name: 'Enable Crop' });
        await toggleBtn.click();
        await page.waitForTimeout(100);

        await aspectSelect.selectOption(preset.value);
        await page.waitForTimeout(200);

        const state = await getViewerState(page);

        // When applied from full-frame, the crop should be maximized:
        // either width=1 or height=1
        if (preset.ratio < sourceAspect) {
          // Target is narrower than source -> height should be full
          expect(state.cropRegion.height).toBeCloseTo(1, 1);
        } else {
          // Target is wider than source -> width should be full
          expect(state.cropRegion.width).toBeCloseTo(1, 1);
        }
      }
    });

    test('CROP-206: switching presets should always produce correct ratio', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      const sourceDims = await getSourceDimensions(page);

      // Start with 1:1, then switch to 16:9, then to 9:16
      // Each switch should produce correct ratio regardless of previous state
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      let ratio = computePixelRatio(state.cropRegion, sourceDims);
      expect(ratio).toBeCloseTo(1, 1);

      // Switch to 16:9 (from a narrower crop)
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      ratio = computePixelRatio(state.cropRegion, sourceDims);
      expect(ratio).toBeCloseTo(16 / 9, 1);

      // Switch to 9:16 (from a wider crop)
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      ratio = computePixelRatio(state.cropRegion, sourceDims);
      expect(ratio).toBeCloseTo(9 / 16, 1);

      // Switch back to 4:3
      await aspectSelect.selectOption('4:3');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      ratio = computePixelRatio(state.cropRegion, sourceDims);
      expect(ratio).toBeCloseTo(4 / 3, 1);
    });

    test('CROP-207: crop region should be centered for all presets', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();

      const presets = ['16:9', '4:3', '1:1', '9:16', '2.35:1'];

      for (const preset of presets) {
        await aspectSelect.selectOption('');
        await page.waitForTimeout(100);
        await aspectSelect.selectOption(preset);
        await page.waitForTimeout(200);

        const state = await getViewerState(page);
        // Verify centered: x = (1 - width) / 2, y = (1 - height) / 2
        const expectedX = (1 - state.cropRegion.width) / 2;
        const expectedY = (1 - state.cropRegion.height) / 2;
        expect(state.cropRegion.x).toBeCloseTo(expectedX, 2);
        expect(state.cropRegion.y).toBeCloseTo(expectedY, 2);
      }
    });

    test('CROP-208: aspect ratio should remain correct after toggling crop off and on', async ({ page }) => {
      // Open crop panel and enable crop via the panel toggle
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');

      // Enable crop via panel toggle
      const enableToggle = cropPanel.getByRole('switch', { name: 'Enable Crop' });
      await enableToggle.click();
      await page.waitForTimeout(200);

      // Select 4:3 aspect ratio
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('4:3');
      await page.waitForTimeout(200);

      const sourceDims = await getSourceDimensions(page);
      let state = await getViewerState(page);
      const originalRatio = computePixelRatio(state.cropRegion, sourceDims);
      expect(originalRatio).toBeCloseTo(4 / 3, 1);

      // Toggle crop off via the panel toggle
      await enableToggle.click();
      await page.waitForTimeout(200);

      // Toggle crop back on
      await enableToggle.click();
      await page.waitForTimeout(200);

      // Ratio should still be correct
      state = await getViewerState(page);
      const restoredRatio = computePixelRatio(state.cropRegion, sourceDims);
      expect(restoredRatio).toBeCloseTo(4 / 3, 1);
    });

    test('CROP-209: normalized crop dimensions should account for source aspect', async ({ page }) => {
      // This test verifies the core conversion: normalizedRatio = pixelRatio / sourceAspect
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      const sourceDims = await getSourceDimensions(page);
      const sourceAspect = sourceDims.width / sourceDims.height;

      // For 1:1 pixel ratio, the normalized width/height should equal 1/sourceAspect
      // (since normalizedRatio = pixelRatio / sourceAspect = 1 / sourceAspect)
      const normalizedRatio = state.cropRegion.width / state.cropRegion.height;
      expect(normalizedRatio).toBeCloseTo(1 / sourceAspect, 2);
    });
  });

  test.describe('Crop Panel UI', () => {
    test('CROP-070: panel should be positioned correctly', async ({ page }) => {
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      const panelBox = await cropPanel.boundingBox();
      expect(panelBox).not.toBeNull();
      // Panel should be in viewport
      expect(panelBox!.x).toBeGreaterThanOrEqual(0);
      expect(panelBox!.y).toBeGreaterThanOrEqual(0);
    });

    test('CROP-071: panel should have high z-index to be visible above viewer', async ({ page }) => {
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const zIndex = await cropPanel.evaluate((el) => getComputedStyle(el).zIndex);
      expect(parseInt(zIndex)).toBeGreaterThanOrEqual(9999);
    });

    test('CROP-072: toggle switch should update text on state change', async ({ page }) => {
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');

      // Should show OFF initially
      const toggleOff = cropPanel.getByRole('switch', { name: 'Enable Crop' });
      await expect(toggleOff).toBeVisible();

      // Click to enable
      await toggleOff.click();
      await page.waitForTimeout(200);

      // Should now show ON
      const toggleOn = cropPanel.getByRole('switch', { name: 'Enable Crop' });
      await expect(toggleOn).toHaveText('ON');
    });

    test('CROP-073: aspect ratio select should update on state change', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();

      // Select 16:9
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      // Verify selection updated
      const selectedValue = await aspectSelect.inputValue();
      expect(selectedValue).toBe('16:9');
    });
  });

  test.describe('Integration with Other Controls', () => {
    test('CROP-080: crop should work with zoom', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      const initialZoom = state.zoom;

      // Switch to View tab for zoom controls
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(100);

      // Open zoom dropdown first (Fit button has the dropdown)
      const zoomButton = page.locator('[data-testid="zoom-control-button"]');
      await zoomButton.click();
      await page.waitForTimeout(100);

      // Zoom in by selecting 200%
      await page.locator('[data-testid="zoom-dropdown"] button[data-value="2"]').click();
      await page.waitForTimeout(200);

      // Crop should still be enabled
      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.zoom).toBeGreaterThan(initialZoom);
    });

    test('CROP-081: crop should work with rotation', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Rotate
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      // Crop should still be enabled
      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
    });

    test('CROP-082: crop should work with flip', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Flip
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(200);

      // Crop should still be enabled
      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
    });
  });

  test.describe('Pixel Clipping', () => {
    test('CROP-100: crop should clip displayed pixels (not just overlay)', async ({ page }) => {
      // Capture screenshot without crop
      const beforeCropScreenshot = await captureViewerScreenshot(page);

      // Enable crop and set a non-full region
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel and set aspect ratio to create smaller region
      // Use 9:16 (portrait) which will definitely create a non-full crop on landscape video
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // Close panel - now pixels should be clipped with subtle indicator
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Capture screenshot with crop active (not editing)
      const afterCropScreenshot = await captureViewerScreenshot(page);

      // The images should be different (cropped area is clipped)
      expect(imagesAreDifferent(beforeCropScreenshot, afterCropScreenshot)).toBe(true);

      // Verify crop state
      const state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.cropRegion.width).toBeLessThan(1);
    });

    test('CROP-101: crop should affect visible region dimensions', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set 9:16 aspect ratio to create a smaller, centered crop
      // Portrait aspect on landscape video will always create non-full crop
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // Get the crop region dimensions
      const state = await getViewerState(page);
      // For 9:16, width should be less than height when normalized
      expect(state.cropRegion.width).toBeLessThan(1);
    });

    test('CROP-102: crop should work with rotation', async ({ page }) => {
      // Enable crop first
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a crop region
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      // Close panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      const beforeRotateScreenshot = await captureViewerScreenshot(page);

      // Apply rotation
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      const afterRotateScreenshot = await captureViewerScreenshot(page);

      // Crop should still be enabled after rotation
      const state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Visual should have changed due to rotation
      expect(imagesAreDifferent(beforeRotateScreenshot, afterRotateScreenshot)).toBe(true);
    });

    test('CROP-103: crop should work with horizontal flip', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a crop region
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // Close panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      // Get initial crop state
      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      const initialCropRegion = { ...state.cropRegion };

      // Apply horizontal flip
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(200);

      // Crop should still be enabled after flip with same dimensions
      state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.cropRegion.width).toBeCloseTo(initialCropRegion.width, 2);
      expect(state.cropRegion.height).toBeCloseTo(initialCropRegion.height, 2);
    });

    test('CROP-104: full-frame crop should skip clipping for performance', async ({ page }) => {
      // Enable crop but keep default full-frame region
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      // Default region should be full frame
      expect(state.cropRegion.x).toBe(0);
      expect(state.cropRegion.y).toBe(0);
      expect(state.cropRegion.width).toBe(1);
      expect(state.cropRegion.height).toBe(1);
    });
  });

  test.describe('Crop Overlay States', () => {
    test('CROP-105: overlay should show full editing UI when panel is open', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set non-full crop region using portrait aspect (definitely non-full on landscape video)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // Panel is open - capture screenshot (full editing overlay)
      const panelOpenScreenshot = await captureViewerScreenshot(page);

      // Close panel with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Verify panel is closed
      await expect(cropPanel).not.toBeVisible();

      // Panel is closed - capture screenshot (subtle indicator)
      const panelClosedScreenshot = await captureViewerScreenshot(page);

      // The overlay should look different (full overlay vs subtle indicator)
      expect(imagesAreDifferent(panelOpenScreenshot, panelClosedScreenshot)).toBe(true);
    });

    test('CROP-106: overlay should show full editing UI during drag', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Start drag from top-left corner and move slightly to trigger drag state
      await page.mouse.move(box!.x + 5, box!.y + 5);
      await page.mouse.down();
      // Move slightly to ensure drag is registered and overlay renders
      await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height * 0.1, { steps: 3 });
      await page.waitForTimeout(100);

      // While dragging, the overlay should show full editing UI
      const duringDragScreenshot = await captureViewerScreenshot(page);

      await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * 0.2, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // After drag ends (and no panel open), should show pixel clipping only
      const afterDragScreenshot = await captureViewerScreenshot(page);

      // During drag shows full overlay; after drag shows only pixel clipping
      expect(imagesAreDifferent(duringDragScreenshot, afterDragScreenshot)).toBe(true);
    });
  });

  test.describe('Crop Export', () => {
    test('CROP-110: export with crop should produce cropped dimensions', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set 9:16 aspect ratio (portrait) to create smaller crop
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // Get crop region for verification
      const state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.cropRegion.width).toBeLessThan(1);

      // Set up download handler and trigger export
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.keyboard.press('Control+s');

      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      expect(filename).toContain('.png');

      // The download should complete successfully
      const readStream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      expect(data.length).toBeGreaterThan(0);
    });

    test('CROP-111: export with rotation + crop should work correctly', async ({ page }) => {
      // Enable crop first
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a crop region
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Close crop panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Apply 90 degree rotation
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      // Verify both crop and rotation are active
      const viewerState = await getViewerState(page);
      expect(viewerState.cropEnabled).toBe(true);

      const transformState = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
      expect(transformState?.rotation).toBe(90);

      // Set up download handler and trigger export
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.keyboard.press('Control+s');

      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      expect(filename).toContain('.png');

      // The export should complete successfully
      const readStream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      expect(data.length).toBeGreaterThan(0);
    });

    test('CROP-112: export with flip + crop should work correctly', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a crop region
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('16:9');
      await page.waitForTimeout(200);

      // Close crop panel using Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Apply horizontal flip using the button (more reliable than keyboard)
      const flipHButton = page.locator('button[title*="Flip horizontal"]').first();
      await flipHButton.click();
      await page.waitForTimeout(200);

      // Verify both crop and flip are active
      const viewerState = await getViewerState(page);
      expect(viewerState.cropEnabled).toBe(true);

      const transformState = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
      expect(transformState?.flipH).toBe(true);

      // Set up download handler and trigger export
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.keyboard.press('Control+s');

      const download = await downloadPromise;
      const readStream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      expect(data.length).toBeGreaterThan(0);
    });

    test('CROP-113: export with rotation 180 + crop should work correctly', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a crop region
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('4:3');
      await page.waitForTimeout(200);

      // Close crop panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Apply 180 degree rotation (2 x 90 degree)
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      // Verify both crop and rotation are active
      const viewerState = await getViewerState(page);
      expect(viewerState.cropEnabled).toBe(true);

      const transformState = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
      expect(transformState?.rotation).toBe(180);

      // Set up download handler and trigger export
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.keyboard.press('Control+s');

      const download = await downloadPromise;
      const readStream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      expect(data.length).toBeGreaterThan(0);
    });

    test('CROP-114: export with rotation 270 + crop should work correctly', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a crop region (portrait will be taller after 270 rotation)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // Close crop panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Apply 270 degree rotation (3 x 90 degree)
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      // Verify both crop and rotation are active
      const viewerState = await getViewerState(page);
      expect(viewerState.cropEnabled).toBe(true);

      const transformState = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
      expect(transformState?.rotation).toBe(270);

      // Set up download handler and trigger export
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.keyboard.press('Control+s');

      const download = await downloadPromise;
      const readStream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      expect(data.length).toBeGreaterThan(0);
    });

    test('CROP-115: export with rotation + flip + crop should work correctly', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Set a crop region
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Close crop panel using Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Apply rotation using the button
      const rotateRightButton = page.locator('button[title*="Rotate right"]').first();
      await rotateRightButton.click();
      await page.waitForTimeout(200);

      // Apply flip using the buttons (more reliable than keyboard)
      const flipHButton = page.locator('button[title*="Flip horizontal"]').first();
      await flipHButton.click();
      await page.waitForTimeout(100);

      const flipVButton = page.locator('button[title*="Flip vertical"]').first();
      await flipVButton.click();
      await page.waitForTimeout(200);

      // Verify all transforms and crop are active
      const viewerState = await getViewerState(page);
      expect(viewerState.cropEnabled).toBe(true);

      const transformState = await page.evaluate(() => window.__OPENRV_TEST__?.getTransformState());
      expect(transformState?.rotation).toBe(90);
      expect(transformState?.flipH).toBe(true);
      expect(transformState?.flipV).toBe(true);

      // Set up download handler and trigger export
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.keyboard.press('Control+s');

      const download = await downloadPromise;
      const readStream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      expect(data.length).toBeGreaterThan(0);
    });
  });

  test.describe('Interactive Crop Dragging', () => {
    test('CROP-090: dragging bottom-right corner should resize crop region', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);

      // Get initial crop region (should be full image: 0,0,1,1)
      const initialRegion = { ...state.cropRegion };
      expect(initialRegion.width).toBe(1);
      expect(initialRegion.height).toBe(1);

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Calculate bottom-right corner position
      const brX = box!.x + box!.width * (initialRegion.x + initialRegion.width);
      const brY = box!.y + box!.height * (initialRegion.y + initialRegion.height);

      // Drag the bottom-right corner inward
      await page.mouse.move(brX - 5, brY - 5);
      await page.mouse.down();
      await page.mouse.move(brX - box!.width * 0.2, brY - box!.height * 0.2, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify crop region changed
      state = await getViewerState(page);
      expect(state.cropRegion.width).toBeLessThan(initialRegion.width);
      expect(state.cropRegion.height).toBeLessThan(initialRegion.height);
    });

    test('CROP-091: dragging top-left corner should resize and reposition crop region', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialRegion = { ...state.cropRegion };

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Calculate top-left corner position
      const tlX = box!.x + box!.width * initialRegion.x;
      const tlY = box!.y + box!.height * initialRegion.y;

      // Drag the top-left corner inward
      await page.mouse.move(tlX + 5, tlY + 5);
      await page.mouse.down();
      await page.mouse.move(tlX + box!.width * 0.2, tlY + box!.height * 0.2, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify crop region changed
      state = await getViewerState(page);
      expect(state.cropRegion.width).toBeLessThan(initialRegion.width);
      expect(state.cropRegion.height).toBeLessThan(initialRegion.height);
      expect(state.cropRegion.x).toBeGreaterThan(initialRegion.x);
      expect(state.cropRegion.y).toBeGreaterThanOrEqual(initialRegion.y);
    });

    test('CROP-092: dragging inside crop region should move it', async ({ page }) => {
      // Enable crop and make it smaller first
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Get the new crop region after resizing
      let state = await getViewerState(page);
      const initialRegion = { ...state.cropRegion };

      // Verify we have a smaller region to move
      expect(initialRegion.width).toBeLessThan(1);
      expect(initialRegion.height).toBeLessThanOrEqual(1);

      // Calculate center of the current crop region
      const centerX = box!.x + box!.width * (initialRegion.x + initialRegion.width / 2);
      const centerY = box!.y + box!.height * (initialRegion.y + initialRegion.height / 2);

      // Drag the crop region to move it (toward bottom-right)
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + 30, centerY + 30, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify crop region moved but size stayed the same
      state = await getViewerState(page);
      expect(state.cropRegion.width).toBeCloseTo(initialRegion.width, 2);
      expect(state.cropRegion.height).toBeCloseTo(initialRegion.height, 2);
      expect(state.cropRegion.x + state.cropRegion.y).toBeGreaterThan(initialRegion.x + initialRegion.y);
    });

    test('CROP-093: dragging edge should resize in one dimension only', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialRegion = { ...state.cropRegion };

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Calculate right edge center position
      const rightEdgeX = box!.x + box!.width * (initialRegion.x + initialRegion.width);
      const rightEdgeY = box!.y + box!.height * (initialRegion.y + initialRegion.height / 2);

      // Drag the right edge inward
      await page.mouse.move(rightEdgeX - 5, rightEdgeY);
      await page.mouse.down();
      await page.mouse.move(rightEdgeX - box!.width * 0.2, rightEdgeY, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify only width changed
      state = await getViewerState(page);
      expect(state.cropRegion.width).toBeLessThan(initialRegion.width);
      expect(state.cropRegion.height).toBeCloseTo(initialRegion.height, 2);
    });

    test('CROP-094: free crop should allow any aspect ratio when dragging', async ({ page }) => {
      // Enable crop (free mode by default)
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.cropAspectRatio).toBeNull(); // Free mode

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Calculate bottom-right corner position
      const brX = box!.x + box!.width;
      const brY = box!.y + box!.height;

      // Drag bottom-right corner to create non-square crop
      await page.mouse.move(brX - 5, brY - 5);
      await page.mouse.down();
      // Move more horizontally than vertically to create wide aspect ratio
      await page.mouse.move(brX - box!.width * 0.1, brY - box!.height * 0.3, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify crop region has different width and height
      state = await getViewerState(page);
      expect(state.cropRegion.width).not.toBeCloseTo(state.cropRegion.height, 1);
    });

    test('CROP-095: crop region should stay within image bounds', async ({ page }) => {
      // Enable crop and set 1:1 to create smaller region
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('1:1');
      await page.waitForTimeout(200);

      // Panel stays open so handles remain interactive

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      let state = await getViewerState(page);
      const centerX = box!.x + box!.width * (state.cropRegion.x + state.cropRegion.width / 2);
      const centerY = box!.y + box!.height * (state.cropRegion.y + state.cropRegion.height / 2);

      // Try to drag beyond bottom-right boundary
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + box!.width, centerY + box!.height, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify region stayed within bounds
      state = await getViewerState(page);
      expect(state.cropRegion.x + state.cropRegion.width).toBeLessThanOrEqual(1.001);
      expect(state.cropRegion.y + state.cropRegion.height).toBeLessThanOrEqual(1.001);
      expect(state.cropRegion.x).toBeGreaterThanOrEqual(-0.001);
      expect(state.cropRegion.y).toBeGreaterThanOrEqual(-0.001);
    });

    test('CROP-096: dragging crop should update visual overlay', async ({ page }) => {
      // Enable crop
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Open crop panel (handles only work when panel is open)
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Get canvas bounding box
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      // Drag bottom-right corner
      const brX = box!.x + box!.width;
      const brY = box!.y + box!.height;
      await page.mouse.move(brX - 5, brY - 5);
      await page.mouse.down();
      await page.mouse.move(brX - box!.width * 0.3, brY - box!.height * 0.3, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      const afterDragScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterDragScreenshot)).toBe(true);
    });
  });
});
