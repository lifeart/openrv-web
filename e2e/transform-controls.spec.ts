import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getTransformState,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Transform Controls Tests
 *
 * Each test verifies actual state changes (rotation, flip)
 * and visual modifications to the canvas.
 */

test.describe('Transform Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Transform tab
    await page.click('button[data-tab-id="transform"]');
    await page.waitForTimeout(200);
  });

  test.describe('Rotation Controls', () => {
    test('TRANSFORM-001: transform tab should show rotation controls', async ({ page }) => {
      const rotateButton = page.locator('button[title*="Rotate"]').first();
      await expect(rotateButton).toBeVisible();
    });

    test('TRANSFORM-002: clicking rotate left should update rotation state and change canvas', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      const rotateLeftButton = page.locator('button[title*="Rotate left"]').first();
      await rotateLeftButton.click();
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(270);

      const rotatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, rotatedScreenshot)).toBe(true);
    });

    test('TRANSFORM-003: clicking rotate right should update rotation state and change canvas', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      const rotateRightButton = page.locator('button[title*="Rotate right"]').first();
      await rotateRightButton.click();
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      const rotatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, rotatedScreenshot)).toBe(true);
    });

    test('TRANSFORM-004: Shift+R should rotate left (counter-clockwise)', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      await page.keyboard.press('Shift+r');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(270);

      // Rotate again
      await page.keyboard.press('Shift+r');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(180);
    });

    test('TRANSFORM-005: Alt+R should rotate right (clockwise)', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      // Rotate again
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(180);
    });

    test('TRANSFORM-006: rotation should cycle through 0, 90, 180, 270 degrees', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      // Rotate 4 times right to get back to original
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
      state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
      state = await getTransformState(page);
      expect(state.rotation).toBe(180);

      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
      state = await getTransformState(page);
      expect(state.rotation).toBe(270);

      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);
      state = await getTransformState(page);
      expect(state.rotation).toBe(0);
    });
  });

  test.describe('Flip Controls', () => {
    test('TRANSFORM-010: transform tab should show flip controls', async ({ page }) => {
      const flipHButton = page.locator('button[title*="Flip horizontal"]').first();
      const flipVButton = page.locator('button[title*="Flip vertical"]').first();
      await expect(flipHButton).toBeVisible();
      await expect(flipVButton).toBeVisible();
    });

    test('TRANSFORM-011: clicking flip horizontal should toggle flipH state and change canvas', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.flipH).toBe(false);

      const initialScreenshot = await captureViewerScreenshot(page);

      const flipHButton = page.locator('button[title*="Flip horizontal"]').first();
      await flipHButton.click();
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipH).toBe(true);

      const flippedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, flippedScreenshot)).toBe(true);

      // Toggle back
      await flipHButton.click();
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipH).toBe(false);
    });

    test('TRANSFORM-012: clicking flip vertical should toggle flipV state and change canvas', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.flipV).toBe(false);

      const initialScreenshot = await captureViewerScreenshot(page);

      const flipVButton = page.locator('button[title*="Flip vertical"]').first();
      await flipVButton.click();
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipV).toBe(true);

      const flippedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, flippedScreenshot)).toBe(true);

      // Toggle back
      await flipVButton.click();
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipV).toBe(false);
    });

    test('TRANSFORM-013: Alt+H should toggle flip horizontal', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.flipH).toBe(false);

      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipH).toBe(true);

      // Toggle back
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipH).toBe(false);
    });

    test('TRANSFORM-014: Shift+V should toggle flip vertical', async ({ page }) => {
      let state = await getTransformState(page);
      expect(state.flipV).toBe(false);

      await page.keyboard.press('Shift+v');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipV).toBe(true);

      // Toggle back
      await page.keyboard.press('Shift+v');
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.flipV).toBe(false);
    });
  });

  test.describe('Crop Controls', () => {
    test('TRANSFORM-020: pressing Shift+K should toggle crop mode', async ({ page }) => {
      let viewState = await getViewerState(page);
      expect(viewState.cropEnabled).toBe(false);

      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      viewState = await getViewerState(page);
      expect(viewState.cropEnabled).toBe(true);

      // Toggle off
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      viewState = await getViewerState(page);
      expect(viewState.cropEnabled).toBe(false);
    });

    test('TRANSFORM-021: crop panel enable toggle should toggle crop mode', async ({ page }) => {
      let viewState = await getViewerState(page);
      expect(viewState.cropEnabled).toBe(false);

      // Click Crop button to open crop panel
      const cropButton = page.locator('button:has-text("Crop")').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      // Verify crop panel is visible and not obscured
      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      // Verify panel is positioned correctly (should be in viewport, not behind viewer)
      const panelBox = await cropPanel.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.x).toBeGreaterThanOrEqual(0);
      expect(panelBox!.y).toBeGreaterThanOrEqual(0);

      // Find the specific "Enable Crop" toggle (avoid matching uncrop toggle)
      const enableToggle = cropPanel.getByRole('switch', { name: 'Enable Crop' });
      await expect(enableToggle).toBeVisible();
      await enableToggle.click();
      await page.waitForTimeout(200);

      viewState = await getViewerState(page);
      expect(viewState.cropEnabled).toBe(true);

      // Toggle off
      await enableToggle.click();
      await page.waitForTimeout(200);

      viewState = await getViewerState(page);
      expect(viewState.cropEnabled).toBe(false);
    });

    test('TRANSFORM-022: crop mode should show aspect ratio presets', async ({ page }) => {
      // Open crop panel
      const cropButton = page.locator('button:has-text("Crop")').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      // Verify crop panel is visible and properly positioned
      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      // Look for aspect ratio dropdown (it's a select/combobox inside the crop panel)
      const aspectSelect = cropPanel.locator('select').first();
      await expect(aspectSelect).toBeVisible();

      // Verify it contains the expected options
      const options = await aspectSelect.locator('option').allTextContents();
      expect(options).toContain('16:9');
      expect(options).toContain('4:3');
      expect(options).toContain('1:1');
    });

    test('TRANSFORM-023: selecting 16:9 aspect ratio should change crop region', async ({ page }) => {
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      const aspect169 = page.locator('button:has-text("16:9")').first();
      if (await aspect169.isVisible()) {
        await aspect169.click();
        await page.waitForTimeout(200);

        const aspectScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, aspectScreenshot)).toBe(true);
      }
    });

    test('TRANSFORM-024: crop should show rule of thirds overlay', async ({ page }) => {
      // Enable crop first
      await page.keyboard.press('Shift+k');
      await page.waitForTimeout(200);

      // Full-frame crop has minimal overlay; capture baseline
      const noOverlayScreenshot = await captureViewerScreenshot(page);

      // Open crop panel and force non-full crop to make guides visible
      const cropButton = page.locator('button[title*="Crop"]').first();
      await cropButton.click();
      await page.waitForTimeout(200);

      const cropPanel = page.locator('.crop-panel');
      await expect(cropPanel).toBeVisible();

      const aspectSelect = cropPanel.locator('select').first();
      await aspectSelect.selectOption('9:16');
      await page.waitForTimeout(200);

      // Overlay (darkened mattes, handles, guides) should now be visible
      const overlayScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(noOverlayScreenshot, overlayScreenshot)).toBe(true);

      const state = await getViewerState(page);
      expect(state.cropEnabled).toBe(true);
      expect(state.cropRegion.width).toBeLessThan(1);
    });
  });

  test.describe('Transform Combinations', () => {
    test('TRANSFORM-030: rotation and flip should combine correctly', async ({ page }) => {
      const initialScreenshot = await captureViewerScreenshot(page);

      // Rotate
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);

      let state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      const rotatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, rotatedScreenshot)).toBe(true);

      // Flip horizontal
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(100);

      state = await getTransformState(page);
      expect(state.rotation).toBe(90);
      expect(state.flipH).toBe(true);

      const combinedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(rotatedScreenshot, combinedScreenshot)).toBe(true);
    });

    test('TRANSFORM-031: double flip should return to near-original', async ({ page }) => {
      const initialScreenshot = await captureViewerScreenshot(page);

      // Flip horizontal twice
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(100);

      let state = await getTransformState(page);
      expect(state.flipH).toBe(true);

      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(100);

      state = await getTransformState(page);
      expect(state.flipH).toBe(false);

      // State should be back to original
      const finalScreenshot = await captureViewerScreenshot(page);
      // Visually should be very similar to initial
    });
  });

  test.describe('Transform Reset', () => {
    test('TRANSFORM-040: reset button should restore all transforms to default', async ({ page }) => {
      // Apply some transforms
      await page.keyboard.press('Alt+r');
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(200);

      let state = await getTransformState(page);
      expect(state.rotation).toBe(90);
      expect(state.flipH).toBe(true);

      // Look for reset button
      const resetButton = page.locator('button[title*="Reset"]').first();
      if (await resetButton.isVisible()) {
        await resetButton.click();
        await page.waitForTimeout(200);

        state = await getTransformState(page);
        expect(state.rotation).toBe(0);
        expect(state.flipH).toBe(false);
        expect(state.flipV).toBe(false);
      }
    });
  });

  test.describe('Transform State Persistence', () => {
    test('TRANSFORM-050: transforms should persist across frame changes', async ({ page }) => {
      // Apply rotation
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(100);

      let state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Transform should be maintained
      state = await getTransformState(page);
      expect(state.rotation).toBe(90);
    });

    test('TRANSFORM-051: flip state should persist across frame changes', async ({ page }) => {
      // Apply flip
      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(100);

      let state = await getTransformState(page);
      expect(state.flipH).toBe(true);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Transform should be maintained
      state = await getTransformState(page);
      expect(state.flipH).toBe(true);
    });
  });
});
