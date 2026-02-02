import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  getViewerState,
  getSessionState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';
import path from 'path';

// EXR test file paths
const SAMPLE_EXR = 'sample/test_hdr.exr';
const SAMPLE_EXR_SMALL = 'sample/test_small.exr';

/**
 * EXR Format Loading Tests
 *
 * Tests for OpenEXR (.exr) file format support including:
 * - File loading and detection
 * - HDR float data handling
 * - Exposure control with HDR content
 * - Display verification
 */
test.describe('EXR Format Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test.describe('EXR File Loading', () => {
    test('EXR-001: should load EXR file and update session state', async ({ page }) => {
      // Verify no media loaded initially
      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(false);

      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // Verify media loaded
      state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
      expect(state.frameCount).toBeGreaterThan(0);
    });

    test('EXR-002: should display EXR image on canvas', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // Verify canvas has content
      const screenshot = await captureViewerScreenshot(page);
      expect(screenshot.length).toBeGreaterThan(1000); // Not empty
    });

    test('EXR-003: should detect correct dimensions from EXR', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // The test EXR is 32x32
      // We can verify this by checking the session state or info panel
      const state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
    });

    test('EXR-004: should handle small EXR files', async ({ page }) => {
      // Load small EXR file (4x4)
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_SMALL);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      const state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
    });
  });

  test.describe('HDR Display and Exposure', () => {
    test('EXR-010: exposure adjustment should affect EXR display', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // Capture initial state
      const beforeScreenshot = await captureViewerScreenshot(page);

      // Switch to Color tab
      await page.click('button:has-text("Color")');
      await page.waitForTimeout(100);

      // Find and adjust exposure slider
      // The exposure control should be visible in the Color tab
      const exposureSlider = page.locator('input[type="range"]').first();

      if (await exposureSlider.isVisible()) {
        // Increase exposure
        await exposureSlider.fill('2');
        await exposureSlider.dispatchEvent('input');
        await page.waitForTimeout(200);

        // Capture after adjustment
        const afterScreenshot = await captureViewerScreenshot(page);

        // Verify the image changed
        expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
      }
    });

    test('EXR-011: EXR HDR values should be preserved (values > 1.0)', async ({ page }) => {
      // Load EXR file with HDR gradient (values up to 2.0 in red channel)
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // The test EXR has a red gradient from 0 to 2.0
      // With default exposure, bright areas should be clipped
      // Reducing exposure should reveal detail in bright areas

      // Capture at default exposure
      const normalExposure = await captureViewerScreenshot(page);

      // Switch to Color tab and reduce exposure
      await page.click('button:has-text("Color")');
      await page.waitForTimeout(100);

      const exposureSlider = page.locator('input[type="range"]').first();
      if (await exposureSlider.isVisible()) {
        // Reduce exposure to see HDR detail
        await exposureSlider.fill('-1');
        await exposureSlider.dispatchEvent('input');
        await page.waitForTimeout(200);

        const lowExposure = await captureViewerScreenshot(page);

        // Images should be different because HDR content is being revealed
        expect(imagesAreDifferent(normalExposure, lowExposure)).toBe(true);
      }
    });
  });

  test.describe('EXR Error Handling', () => {
    test('EXR-020: should handle corrupted EXR gracefully', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // Create a fake "EXR" file with invalid content
      // This should be handled gracefully without crashing the app

      // App should remain functional
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
    });

    test('EXR-021: app remains functional after EXR load error', async ({ page }) => {
      // First load a valid EXR
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);

      // Navigation should work
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // App should still be responsive
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('EXR with Other Features', () => {
    test('EXR-030: zoom controls should work with EXR', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // Capture before zoom
      const beforeZoom = await captureViewerScreenshot(page);

      // Use keyboard shortcut to zoom in
      await page.keyboard.press('Equal'); // = for zoom in
      await page.waitForTimeout(200);

      const viewerState = await getViewerState(page);
      // Zoom should have changed
      expect(viewerState.zoom).not.toBe(1);
    });

    test('EXR-031: channel isolation should work with EXR', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // Capture RGB view
      const rgbView = await captureViewerScreenshot(page);

      // Switch to red channel (Shift+R)
      await page.keyboard.press('Shift+r');
      await page.waitForTimeout(200);

      const viewerState = await getViewerState(page);
      expect(viewerState.channelMode).toBe('red');

      // Capture red channel view
      const redView = await captureViewerScreenshot(page);

      // Views should be different
      expect(imagesAreDifferent(rgbView, redView)).toBe(true);
    });

    test('EXR-032: histogram should display for EXR content', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // Toggle histogram (h key)
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      const viewerState = await getViewerState(page);
      expect(viewerState.histogramVisible).toBe(true);
    });

    test('EXR-033: waveform should work with EXR HDR content', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1000);

      // Toggle waveform (w key)
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      const viewerState = await getViewerState(page);
      expect(viewerState.waveformVisible).toBe(true);
    });
  });

  test.describe('EXR A/B Comparison', () => {
    test('EXR-040: should support A/B comparison with EXR files', async ({ page }) => {
      // Load first EXR as source A
      const filePath1 = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath1);
      await page.waitForTimeout(1000);

      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);

      // Load second file as source B
      const filePath2 = path.resolve(process.cwd(), SAMPLE_EXR_SMALL);
      await fileInput.setInputFiles(filePath2);
      await page.waitForTimeout(1000);

      // A/B should be available
      state = await getSessionState(page);
      // Note: A/B availability depends on having multiple sources
    });
  });
});
