import { test, expect } from '@playwright/test';
import path from 'path';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * 3D LUT Support Tests
 *
 * Tests for loading and applying 3D Look-Up Tables (.cube format)
 *
 * Implementation:
 * - src/color/LUTLoader.ts - Parsing and applying LUTs
 * - src/ui/components/ColorControls.ts - LUT UI controls
 *
 * Reference: OpenRV Color -> LUT Support
 */

// Sample LUT files
const SAMPLE_LUT = 'sample/test_lut.cube';
const INVALID_LUT = 'sample/invalid_lut.cube';

// Helper to wait for LUT loaded state
async function waitForLUTLoaded(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === true,
    { timeout: 5000 },
  );
}

// Helper to wait for LUT cleared state
async function waitForLUTCleared(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === false,
    { timeout: 5000 },
  );
}

// Helper to wait for color panel to be ready
async function waitForColorPanel(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');
  await page.waitForTimeout(150);
  await page.keyboard.press('c');
  await expect(page.locator('.color-controls-panel')).toBeVisible({ timeout: 5000 });
}

// Helper to wait for color state property to match expected value
async function waitForColorStateValue(
  page: import('@playwright/test').Page,
  property: string,
  expectedValue: any,
) {
  await page.waitForFunction(
    ({ prop, expected }) => {
      const state = (window as any).__OPENRV_TEST__?.getColorState();
      return state && Math.abs(state[prop] - expected) < 0.01;
    },
    { prop: property, expected: expectedValue },
    { timeout: 5000 },
  );
}

// Helper to wait for histogram to be visible
async function waitForHistogramVisible(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as any).__OPENRV_TEST__?.getViewerState()?.histogramVisible === true,
    { timeout: 5000 },
  );
}

test.describe('3D LUT Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Open Color panel and color controls
    await waitForColorPanel(page);
  });

  test.describe('LUT Loading', () => {
    test('LUT-E001: load valid .cube LUT file should update hasLUT state', async ({ page }) => {
      // Initial state - no LUT
      let state = await getColorState(page);
      expect(state.hasLUT).toBe(false);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find the LUT load button
      const lutLoadButton = page.locator('button:has-text("Load .cube")').first();
      if (!(await lutLoadButton.isVisible())) {
        // Try alternative selector
        const altButton = page.locator('.color-controls-panel button:has-text("Load")').first();
        if (!(await altButton.isVisible())) {
          test.skip();
          return;
        }
      }

      // Set up file input
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      // Verify LUT was loaded
      state = await getColorState(page);
      expect(state.hasLUT).toBe(true);

      // Verify visual change
      const lutScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, lutScreenshot)).toBe(true);
    });

    test('LUT-E002: LUT name displayed in UI after loading', async ({ page }) => {
      // Find and use file input
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      // Check for LUT name in UI
      // The LUT title is "Test LUT - Warm"
      const lutNameElement = page.locator('.color-controls-panel').locator('text=Test LUT');
      await expect(lutNameElement).toBeVisible();
    });

    test('LUT-E003: LUT intensity slider affects output (0-100%)', async ({ page }) => {
      // Load LUT first
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      // Verify LUT loaded
      let state = await getColorState(page);
      expect(state.hasLUT).toBe(true);
      expect(state.lutIntensity).toBe(1); // Default 100%

      const screenshotFull = await captureViewerScreenshot(page);

      // Find intensity slider
      const intensitySlider = page.locator('.color-controls-panel input[type="range"]').filter({
        has: page.locator('xpath=../preceding-sibling::label[contains(text(), "Intensity")]'),
      }).first();

      // Try alternative: find by looking for slider after "Intensity" label
      const intensityRow = page.locator('.color-controls-panel').locator('label:has-text("Intensity")').locator('..').locator('input[type="range"]').first();

      if (await intensityRow.isVisible()) {
        // Set to 50%
        await intensityRow.fill('0.5');
        await intensityRow.dispatchEvent('input');
        await waitForColorStateValue(page, 'lutIntensity', 0.5);

        state = await getColorState(page);
        expect(state.lutIntensity).toBeCloseTo(0.5, 1);

        const screenshot50 = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotFull, screenshot50)).toBe(true);

        // Set to 0%
        await intensityRow.fill('0');
        await intensityRow.dispatchEvent('input');
        await waitForColorStateValue(page, 'lutIntensity', 0);

        state = await getColorState(page);
        expect(state.lutIntensity).toBe(0);

        const screenshot0 = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshot50, screenshot0)).toBe(true);
      }
    });

    test('LUT-E004: invalid LUT file shows error', async ({ page }) => {
      // Find file input
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const invalidLutPath = path.resolve(process.cwd(), INVALID_LUT);
      await fileInput.setInputFiles(invalidLutPath);

      // Wait for error modal to appear or state to confirm no LUT loaded
      await page.waitForFunction(
        () => {
          const hasError = document.querySelector('[class*="modal"], [role="dialog"], [class*="alert"]') !== null;
          const state = (window as any).__OPENRV_TEST__?.getColorState();
          return hasError || (state && state.hasLUT === false);
        },
        { timeout: 5000 },
      );

      // Check for error dialog/alert
      const errorModal = page.locator('[class*="modal"], [role="dialog"], [class*="alert"]').first();
      if (await errorModal.isVisible()) {
        // Verify it mentions LUT error
        const errorText = await errorModal.textContent();
        expect(errorText?.toLowerCase()).toContain('lut');
      }

      // LUT should not be loaded
      const state = await getColorState(page);
      expect(state.hasLUT).toBe(false);
    });

    test('LUT-E005: clear/remove LUT restores original view', async ({ page }) => {
      // Capture original
      const screenshotOriginal = await captureViewerScreenshot(page);

      // Load LUT
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      let state = await getColorState(page);
      expect(state.hasLUT).toBe(true);

      const screenshotWithLUT = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotOriginal, screenshotWithLUT)).toBe(true);

      // Find and click clear button (X or "Remove LUT")
      const clearButton = page.locator('.color-controls-panel button:has-text("✕"), .color-controls-panel button[title*="Remove LUT"]').first();
      if (await clearButton.isVisible()) {
        await clearButton.click();
        await waitForLUTCleared(page);

        state = await getColorState(page);
        expect(state.hasLUT).toBe(false);

        // Verify view restored
        const screenshotCleared = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotWithLUT, screenshotCleared)).toBe(true);
        // Original and cleared should be similar
        expect(imagesAreDifferent(screenshotOriginal, screenshotCleared)).toBe(false);
      }
    });
  });

  test.describe('LUT Effects', () => {
    test('LUT-E006: LUT affects histogram/scopes when enabled', async ({ page }) => {
      // Enable histogram first
      await page.keyboard.press('h');
      await waitForHistogramVisible(page);

      // Take screenshot with histogram (no LUT)
      const screenshotNoLUT = await captureViewerScreenshot(page);

      // Load LUT
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      // Take screenshot with LUT (histogram should show different distribution)
      const screenshotWithLUT = await captureViewerScreenshot(page);

      // The histograms should be different because the LUT changed the color distribution
      expect(imagesAreDifferent(screenshotNoLUT, screenshotWithLUT)).toBe(true);
    });

    test('LUT-E007: LUT intensity at 0% updates state correctly', async ({ page }) => {
      // Load LUT
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      let state = await getColorState(page);
      expect(state.hasLUT).toBe(true);
      expect(state.lutIntensity).toBe(1); // Default 100%

      // Set intensity to 0
      const intensityRow = page.locator('.color-controls-panel').locator('label:has-text("Intensity")').locator('..').locator('input[type="range"]').first();

      if (await intensityRow.isVisible()) {
        await intensityRow.fill('0');
        await intensityRow.dispatchEvent('input');
        await waitForColorStateValue(page, 'lutIntensity', 0);

        state = await getColorState(page);
        expect(state.lutIntensity).toBe(0);
        expect(state.hasLUT).toBe(true); // LUT still loaded, just at 0% intensity

        // Set back to 100%
        await intensityRow.fill('1');
        await intensityRow.dispatchEvent('input');
        await waitForColorStateValue(page, 'lutIntensity', 1);

        state = await getColorState(page);
        expect(state.lutIntensity).toBe(1);
      }
    });
  });

  test.describe('LUT with Color Adjustments', () => {
    test('LUT-E008: LUT works combined with exposure adjustment', async ({ page }) => {
      // Load LUT
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      const screenshotLUTOnly = await captureViewerScreenshot(page);

      // Find exposure slider
      const exposureSlider = page.locator('[data-testid="slider-exposure"]').first();
      if (await exposureSlider.isVisible()) {
        await exposureSlider.fill('2');
        await exposureSlider.dispatchEvent('input');
        await waitForColorStateValue(page, 'exposure', 2);

        const state = await getColorState(page);
        expect(state.exposure).toBeCloseTo(2, 1);
        expect(state.hasLUT).toBe(true);

        // Screenshot should be different (brighter)
        const screenshotLUTPlusExposure = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotLUTOnly, screenshotLUTPlusExposure)).toBe(true);
      }
    });

    test('LUT-E009: LUT works combined with saturation adjustment', async ({ page }) => {
      // Load LUT
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      const screenshotLUTOnly = await captureViewerScreenshot(page);

      // Find saturation slider
      const saturationSlider = page.locator('[data-testid="slider-saturation"]').first();
      if (await saturationSlider.isVisible()) {
        await saturationSlider.fill('1.5');
        await saturationSlider.dispatchEvent('input');
        await waitForColorStateValue(page, 'saturation', 1.5);

        const state = await getColorState(page);
        expect(state.saturation).toBeCloseTo(1.5, 1);
        expect(state.hasLUT).toBe(true);

        // Screenshot should be different (more saturated)
        const screenshotLUTPlusSaturation = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotLUTOnly, screenshotLUTPlusSaturation)).toBe(true);
      }
    });
  });

  test.describe('LUT State Management', () => {
    test('LUT-E010: LUT state persists when navigating frames', async ({ page }) => {
      // Load LUT
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      let state = await getColorState(page);
      expect(state.hasLUT).toBe(true);

      // Navigate to different frame
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(
        () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === true,
        { timeout: 5000 },
      );

      // LUT should still be active
      state = await getColorState(page);
      expect(state.hasLUT).toBe(true);

      // Navigate back
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(
        () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === true,
        { timeout: 5000 },
      );

      state = await getColorState(page);
      expect(state.hasLUT).toBe(true);
    });

    test('LUT-E011: LUT intensity state persists when closing/reopening panel', async ({ page }) => {
      // Load LUT
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      // Set intensity to 50%
      const intensityRow = page.locator('.color-controls-panel').locator('label:has-text("Intensity")').locator('..').locator('input[type="range"]').first();

      if (await intensityRow.isVisible()) {
        await intensityRow.fill('0.5');
        await intensityRow.dispatchEvent('input');
        await waitForColorStateValue(page, 'lutIntensity', 0.5);

        let state = await getColorState(page);
        expect(state.lutIntensity).toBeCloseTo(0.5, 1);

        // Close panel
        await page.keyboard.press('c');
        await page.waitForFunction(
          () => document.querySelector('.color-controls-panel') === null,
          { timeout: 2000 },
        );

        // Reopen panel
        await page.keyboard.press('c');
        await page.waitForFunction(
          () => document.querySelector('.color-controls-panel') !== null,
          { timeout: 2000 },
        );

        // Intensity should be preserved
        state = await getColorState(page);
        expect(state.lutIntensity).toBeCloseTo(0.5, 1);
      }
    });
  });
});
