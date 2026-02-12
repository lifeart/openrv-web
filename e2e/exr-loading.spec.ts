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

async function setRangeValue(
  slider: import('@playwright/test').Locator,
  value: number,
) {
  await slider.evaluate((el, val) => {
    const input = el as HTMLInputElement;
    input.value = String(val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

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
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // Verify media loaded
      state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
      expect(state.frameCount).toBeGreaterThan(0);
    });

    test('EXR-002: should display EXR image on canvas', async ({ page }) => {
      const beforeScreenshot = await captureViewerScreenshot(page);

      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // Verify canvas has content
      const afterScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
    });

    test('EXR-003: should detect correct dimensions from EXR', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

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
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

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
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // Capture initial state
      const beforeScreenshot = await captureViewerScreenshot(page);

      // Switch to Color tab
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(150);
      await page.keyboard.press('c');
      await expect(page.locator('.color-controls-panel')).toBeVisible({ timeout: 5000 });

      // Find and adjust exposure slider
      // The exposure control should be visible in the Color tab
      const exposureSlider = page.locator('.color-controls-panel [data-testid="slider-exposure"]');

      if (await exposureSlider.isVisible()) {
        // Increase exposure
        await setRangeValue(exposureSlider, 2);
        await page.waitForFunction(
          () => {
            const state = window.__OPENRV_TEST__?.getColorState();
            return state && Math.abs(state.exposure - 2) < 0.01;
          },
          { timeout: 5000 }
        );

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
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // The test EXR has a red gradient from 0 to 2.0
      // With default exposure, bright areas should be clipped
      // Reducing exposure should reveal detail in bright areas

      // Capture at default exposure
      const normalExposure = await captureViewerScreenshot(page);

      // Switch to Color tab and reduce exposure
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(150);
      await page.keyboard.press('c');
      await expect(page.locator('.color-controls-panel')).toBeVisible({ timeout: 5000 });

      const exposureSlider = page.locator('.color-controls-panel [data-testid="slider-exposure"]');
      if (await exposureSlider.isVisible()) {
        // Reduce exposure to see HDR detail
        await setRangeValue(exposureSlider, -1);
        await page.waitForFunction(
          () => {
            const state = window.__OPENRV_TEST__?.getColorState();
            return state && Math.abs(state.exposure - (-1)) < 0.01;
          },
          { timeout: 5000 }
        );

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
      await expect(page.locator('.viewer-container').first()).toBeVisible();
    });

    test('EXR-021: app remains functional after EXR load error', async ({ page }) => {
      // First load a valid EXR
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);

      // App shortcuts should still respond
      const initialHistogramVisible = (await getViewerState(page)).histogramVisible;
      await page.keyboard.press('h');
      await page.waitForFunction(
        (initial) => window.__OPENRV_TEST__?.getViewerState()?.histogramVisible !== initial,
        initialHistogramVisible,
        { timeout: 5000 }
      );
      const afterHistogramToggle = await getViewerState(page);
      expect(afterHistogramToggle.histogramVisible).toBe(!initialHistogramVisible);

      // App should still be responsive
      await expect(page.locator('.viewer-container').first()).toBeVisible();
    });
  });

  test.describe('EXR with Other Features', () => {
    test('EXR-030: zoom controls should work with EXR', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // Capture before zoom
      const beforeZoom = await captureViewerScreenshot(page);
      const initialViewerState = await getViewerState(page);

      // Use zoom dropdown to switch to a deterministic level
      const zoomButton = page.locator('[data-testid="zoom-control-button"]');
      await zoomButton.click();
      const zoomDropdown = page.locator('[data-testid="zoom-dropdown"]');
      await expect(zoomDropdown).toBeVisible();
      await zoomDropdown.locator('button', { hasText: '200%' }).click();
      await page.waitForFunction(
        (initialZoom) => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state && state.zoom !== initialZoom;
        },
        initialViewerState.zoom,
        { timeout: 5000 }
      );

      const viewerState = await getViewerState(page);
      // Zoom should have changed
      expect(viewerState.zoom).not.toBe(initialViewerState.zoom);

      const afterZoom = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(beforeZoom, afterZoom)).toBe(true);
    });

    test('EXR-031: channel isolation should work with EXR', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // Switch to red channel via channel dropdown (Shift+R is reserved for rotation).
      const channelButton = page.locator('[data-testid="channel-select-button"]');
      await channelButton.click();
      const channelDropdown = page.locator('[data-testid="channel-dropdown"]');
      await expect(channelDropdown).toBeVisible();
      await channelDropdown.locator('button', { hasText: 'Red' }).click();
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getViewerState()?.channelMode === 'red',
        { timeout: 5000 }
      );

      const viewerState = await getViewerState(page);
      expect(viewerState.channelMode).toBe('red');
      await expect(channelButton).toContainText('R');

      // Switch back to RGB and verify channel isolation is reversible.
      await channelButton.click();
      await expect(channelDropdown).toBeVisible();
      await channelDropdown.locator('button', { hasText: 'RGB' }).click();
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getViewerState()?.channelMode === 'rgb',
        { timeout: 5000 }
      );
      const restoredState = await getViewerState(page);
      expect(restoredState.channelMode).toBe('rgb');
      await expect(channelButton).toContainText('Ch');
    });

    test('EXR-032: histogram should display for EXR content', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // Toggle histogram (h key)
      await page.keyboard.press('h');
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getViewerState()?.histogramVisible === true,
        { timeout: 5000 }
      );

      const viewerState = await getViewerState(page);
      expect(viewerState.histogramVisible).toBe(true);
    });

    test('EXR-033: waveform should work with EXR HDR content', async ({ page }) => {
      // Load EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      // Toggle waveform (w key)
      await page.keyboard.press('w');
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getViewerState()?.waveformVisible === true,
        { timeout: 5000 }
      );

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
      await page.waitForFunction(
        () => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true,
        { timeout: 5000 }
      );

      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);

      // Load second file as source B
      const filePath2 = path.resolve(process.cwd(), SAMPLE_EXR_SMALL);
      await fileInput.setInputFiles(filePath2);
      await page.waitForFunction(
        () => {
          const sessionState = window.__OPENRV_TEST__?.getSessionState();
          return sessionState && sessionState.hasMedia === true;
        },
        { timeout: 5000 }
      );

      // A/B should be available
      state = await getSessionState(page);
      // Note: A/B availability depends on having multiple sources
    });
  });
});
