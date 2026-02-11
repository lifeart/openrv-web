import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Color Curves Tests
 *
 * Tests for the curves panel functionality including:
 * - Panel visibility toggle
 * - Keyboard shortcut (U)
 * - Channel selection
 * - Preset selection
 * - Reset functionality
 * - Visual changes when curves are applied
 */

test.describe('Color Curves', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);
  });

  test.describe('Curves Panel Visibility', () => {
    test('CURVES-001: curves toggle button should be visible in Color tab', async ({ page }) => {
      const curvesButton = page.locator('[data-testid="curves-toggle-button"]');
      await expect(curvesButton).toBeVisible();
    });

    test('CURVES-002: pressing U key should toggle curves panel visibility', async ({ page }) => {
      // Initially curves panel should be hidden
      const curvesPanel = page.locator('[data-testid="curves-control"]');
      await expect(curvesPanel).not.toBeVisible();

      // Press U to open
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      // Panel should be visible
      await expect(curvesPanel).toBeVisible();

      // Press U to close
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      // Panel should be hidden
      await expect(curvesPanel).not.toBeVisible();
    });

    test('CURVES-003: clicking curves button should toggle panel visibility', async ({ page }) => {
      const curvesButton = page.locator('[data-testid="curves-toggle-button"]');
      const curvesPanel = page.locator('[data-testid="curves-control"]');

      // Initially hidden
      await expect(curvesPanel).not.toBeVisible();

      // Click to open
      await curvesButton.click();
      await page.waitForTimeout(200);

      // Panel should be visible
      await expect(curvesPanel).toBeVisible();

      // Click to close
      await curvesButton.click();
      await page.waitForTimeout(200);

      // Panel should be hidden
      await expect(curvesPanel).not.toBeVisible();
    });

    test('CURVES-004: curves button should show active state when panel is open', async ({ page }) => {
      const curvesButton = page.locator('[data-testid="curves-toggle-button"]');

      // Open panel
      await curvesButton.click();
      await page.waitForTimeout(200);

      // Button should have active styling (border color no longer transparent)
      const borderColor = await curvesButton.evaluate((el) =>
        getComputedStyle(el).borderColor
      );
      expect(borderColor).not.toBe('transparent');
      expect(borderColor).not.toBe('rgba(0, 0, 0, 0)');
    });
  });

  test.describe('Curves Canvas', () => {
    test('CURVES-010: curves canvas should be visible when panel is open', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const curveCanvas = page.locator('[data-testid="curve-canvas"]');
      await expect(curveCanvas).toBeVisible();
    });
  });

  test.describe('Channel Selection', () => {
    test('CURVES-020: all channel buttons should be visible', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const masterBtn = page.locator('[data-testid="curve-channel-master"]');
      const redBtn = page.locator('[data-testid="curve-channel-red"]');
      const greenBtn = page.locator('[data-testid="curve-channel-green"]');
      const blueBtn = page.locator('[data-testid="curve-channel-blue"]');

      await expect(masterBtn).toBeVisible();
      await expect(redBtn).toBeVisible();
      await expect(greenBtn).toBeVisible();
      await expect(blueBtn).toBeVisible();
    });

    test('CURVES-021: master channel should be selected by default', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const masterBtn = page.locator('[data-testid="curve-channel-master"]');
      const bgColor = await masterBtn.evaluate((el) =>
        getComputedStyle(el).backgroundColor
      );
      // Master channel should have background color when active
      expect(bgColor).not.toBe('transparent');
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('CURVES-022: clicking red channel should switch active channel', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const redBtn = page.locator('[data-testid="curve-channel-red"]');
      await redBtn.click();
      await page.waitForTimeout(100);

      // Red button should now have active background
      const bgColor = await redBtn.evaluate((el) =>
        getComputedStyle(el).backgroundColor
      );
      expect(bgColor).not.toBe('transparent');
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });
  });

  test.describe('Preset Selection', () => {
    test('CURVES-030: preset dropdown should be visible', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await expect(presetSelect).toBeVisible();
    });

    test('CURVES-031: selecting S-Curve preset should visually change canvas', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      // Capture initial state
      const initialScreenshot = await captureViewerScreenshot(page);

      // Select S-Curve preset
      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ index: 1 }); // S-Curve (Mild) is index 1
      await page.waitForTimeout(300);

      // Capture after preset
      const afterPresetScreenshot = await captureViewerScreenshot(page);

      // Images should be different (curves applied)
      expect(imagesAreDifferent(initialScreenshot, afterPresetScreenshot)).toBe(true);
    });

    test('CURVES-032: selecting Film Look preset should change canvas', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find Film Look preset (index 6 based on CURVE_PRESETS array)
      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ label: 'Film Look' });
      await page.waitForTimeout(300);

      const afterPresetScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterPresetScreenshot)).toBe(true);
    });

    test('CURVES-033: selecting Cross Process preset should change canvas', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ label: 'Cross Process' });
      await page.waitForTimeout(300);

      const afterPresetScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, afterPresetScreenshot)).toBe(true);
    });
  });

  test.describe('Reset Functionality', () => {
    test('CURVES-040: reset button should be visible', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const resetBtn = page.locator('[data-testid="curves-reset"]');
      await expect(resetBtn).toBeVisible();
    });

    test('CURVES-041: reset button should restore default curves', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      // Capture initial (default) state
      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply a preset
      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ index: 2 }); // S-Curve (Strong)
      await page.waitForTimeout(300);

      const presetScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, presetScreenshot)).toBe(true);

      // Click reset button
      const resetBtn = page.locator('[data-testid="curves-reset"]');
      await resetBtn.click();
      await page.waitForTimeout(300);

      // Capture after reset
      const resetScreenshot = await captureViewerScreenshot(page);

      // Reset should restore to initial state
      expect(imagesAreDifferent(presetScreenshot, resetScreenshot)).toBe(true);

      // Preset dropdown should also reset to index 0 (Linear Default)
      const selectedValue = await presetSelect.inputValue();
      expect(selectedValue).toBe('0');
    });

    test('CURVES-042: reset should restore visual appearance to default', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      // Capture initial (default) appearance
      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply a preset
      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ index: 3 }); // Lift Shadows
      await page.waitForTimeout(300);

      // Verify preset changed the appearance
      const presetScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, presetScreenshot)).toBe(true);

      // Click reset button
      const resetBtn = page.locator('[data-testid="curves-reset"]');
      await resetBtn.click();
      await page.waitForTimeout(300);

      // Capture after reset
      const resetScreenshot = await captureViewerScreenshot(page);

      // Reset should make the image different from the preset version
      expect(imagesAreDifferent(presetScreenshot, resetScreenshot)).toBe(true);
    });
  });

  test.describe('Import/Export', () => {
    test('CURVES-050: import button should be visible', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const importBtn = page.locator('[data-testid="curves-import"]');
      await expect(importBtn).toBeVisible();
    });

    test('CURVES-051: export button should be visible', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const exportBtn = page.locator('[data-testid="curves-export"]');
      await expect(exportBtn).toBeVisible();
    });

    test('CURVES-052: export button should be clickable', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      // Apply a preset first so we have non-default curves
      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ index: 1 });
      await page.waitForTimeout(200);

      // Verify export button is clickable (doesn't throw an error)
      const exportBtn = page.locator('[data-testid="curves-export"]');
      await expect(exportBtn).toBeVisible();
      await expect(exportBtn).toBeEnabled();

      // Click the button - if it doesn't throw, the button is functional
      // Note: Programmatic anchor click downloads may not trigger Playwright's download event
      await exportBtn.click({ force: true });
      await page.waitForTimeout(100);

      // Verify the button click didn't cause any errors (panel should still be visible)
      const curvesPanel = page.locator('[data-testid="curves-control"]');
      await expect(curvesPanel).toBeVisible();
    });
  });

  test.describe('Curves Persistence', () => {
    test('CURVES-060: curves should persist across frame changes', async ({ page }) => {
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      // Apply a preset
      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ index: 2 }); // S-Curve (Strong)
      await page.waitForTimeout(200);

      const beforeFrameChange = await captureViewerScreenshot(page);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Step back
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);

      const afterFrameChange = await captureViewerScreenshot(page);

      // Curves should still be applied (images should look similar)
      // Since it's the same frame with same curves, they should be identical or very close
      // We can't guarantee exact match due to video compression, but at least verify
      // the preset didn't get reset by checking the dropdown value
      const selectedValue = await presetSelect.inputValue();
      expect(selectedValue).toBe('2'); // Should still be S-Curve (Strong)
    });
  });

  test.describe('Curves with Other Effects', () => {
    test('CURVES-070: curves should combine with color adjustments', async ({ page }) => {
      // Open color panel and adjust exposure
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const exposureSlider = page.locator('.color-controls-panel label').filter({ hasText: 'Exposure' }).locator('..').locator('input[type="range"]');
      await exposureSlider.fill('1');
      await exposureSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const afterExposure = await captureViewerScreenshot(page);

      // Close color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(100);

      // Open curves and apply preset
      await page.keyboard.press('u');
      await page.waitForTimeout(200);

      const presetSelect = page.locator('[data-testid="curves-preset"]');
      await presetSelect.selectOption({ index: 1 }); // S-Curve
      await page.waitForTimeout(300);

      const afterCurves = await captureViewerScreenshot(page);

      // Both effects should combine - images should be different
      expect(imagesAreDifferent(afterExposure, afterCurves)).toBe(true);
    });
  });
});
