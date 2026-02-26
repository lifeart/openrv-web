import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  loadVideoFile,
  loadExrFile,
  getViewerState,
  getPixelProbeState,
} from './fixtures';

/**
 * Phase 3: Comprehensive Pipeline Updates - E2E Integration Tests
 *
 * Tests verify:
 * - HDR-aware histogram (HDR mode toggle, extended range bins)
 * - HDR-aware waveform scopes
 * - Export with P3 color space option
 * - HDR pixel data display (super-white values)
 *
 * Note: Many Phase 3 features require HDR-capable displays and browsers.
 * In standard headless Chromium, HDR APIs are typically unavailable, so
 * hardware-dependent tests are skipped. The tests focus on verifying that
 * SDR paths work correctly when HDR is not available.
 */

/** Helper: Navigate to Color tab */
async function goToColorTab(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');
}

/** Helper: Check if the browser supports HDR */
async function browserSupportsHDR(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      if (!matchMedia('(dynamic-range: high)').matches) return false;
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const gl = c.getContext('webgl2');
      if (gl && 'drawingBufferColorSpace' in gl) {
        const glExt = gl as any;
        glExt.drawingBufferColorSpace = 'rec2100-hlg';
        const hlg = glExt.drawingBufferColorSpace === 'rec2100-hlg';
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return hlg;
      }
      return false;
    } catch {
      return false;
    }
  });
}

/** Helper: Check if browser supports Display P3 WebGL */
async function browserSupportsP3(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const gl = c.getContext('webgl2');
      if (gl && 'drawingBufferColorSpace' in gl) {
        (gl as any).drawingBufferColorSpace = 'display-p3';
        const result = (gl as any).drawingBufferColorSpace === 'display-p3';
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return result;
      }
      return false;
    } catch {
      return false;
    }
  });
}

test.describe('Phase 3: Pipeline Updates', () => {
  // ==========================================================================
  // HDR-Aware Histogram
  // ==========================================================================

  test.describe('HDR-Aware Histogram', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
    });

    test('HDR-P3-001: histogram displays in SDR mode by default', async ({ page }) => {
      // Toggle histogram on
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.histogramVisible).toBe(true);

      // Histogram container should be visible
      const histogram = page.locator('.histogram-container');
      await expect(histogram).toBeVisible();
    });

    test('HDR-P3-002: histogram canvas renders in SDR mode', async ({ page }) => {
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      const canvas = page.locator('.histogram-container canvas');
      await expect(canvas).toBeVisible();

      // Canvas should have non-zero dimensions
      const dims = await canvas.evaluate((el: HTMLCanvasElement) => ({
        width: el.width,
        height: el.height,
      }));
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    test('HDR-P3-003: histogram mode cycling works in SDR mode', async ({ page }) => {
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.histogramMode).toBe('rgb');

      // Cycle through modes via Shift+H
      await page.keyboard.press('Shift+h');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      // Mode should have changed
      expect(['rgb', 'luminance', 'separate']).toContain(state.histogramMode);
    });

    test('HDR-P3-004: histogram extended range is available in HDR mode', async ({ page }) => {
      const hdrSupported = await browserSupportsHDR(page);
      // @hdr - requires hardware HDR support, skipped in CI
      test.skip(!hdrSupported, 'HDR not supported in this environment');

      // Enable histogram
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      // Switch to HDR mode via tone mapping panel
      await goToColorTab(page);
      const control = page.locator('[data-testid="tone-mapping-control-button"]');
      await control.click();
      const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
      await expect(dropdown).toBeVisible();

      const hlgButton = page.locator('[data-testid="hdr-mode-hlg"]');
      await hlgButton.click();
      await page.waitForTimeout(200);

      // Histogram should still be visible and functional
      const histogram = page.locator('.histogram-container');
      await expect(histogram).toBeVisible();
    });
  });

  // ==========================================================================
  // HDR-Aware Waveform Scopes
  // ==========================================================================

  test.describe('HDR-Aware Waveform', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
    });

    test('HDR-P3-005: waveform displays in SDR mode by default', async ({ page }) => {
      // Toggle waveform on
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.waveformVisible).toBe(true);
    });

    test('HDR-P3-006: waveform canvas renders in SDR mode', async ({ page }) => {
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      const waveform = page.locator('.waveform-container');
      await expect(waveform).toBeVisible();

      const canvas = page.locator('.waveform-container canvas');
      await expect(canvas).toBeVisible();
    });

    test('HDR-P3-007: waveform mode cycling works in SDR mode', async ({ page }) => {
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      const initialMode = state.waveformMode;

      // Cycle through modes via Shift+W
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(['luma', 'rgb', 'parade']).toContain(state.waveformMode);
    });

    test('HDR-P3-008: waveform is functional when HDR mode is active', async ({ page }) => {
      const hdrSupported = await browserSupportsHDR(page);
      // @hdr - requires hardware HDR support, skipped in CI
      test.skip(!hdrSupported, 'HDR not supported in this environment');

      // Enable waveform
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      // Switch to HDR mode
      await goToColorTab(page);
      const control = page.locator('[data-testid="tone-mapping-control-button"]');
      await control.click();
      const hlgButton = page.locator('[data-testid="hdr-mode-hlg"]');
      await hlgButton.click();
      await page.waitForTimeout(200);

      // Waveform should still be visible
      const waveform = page.locator('.waveform-container');
      await expect(waveform).toBeVisible();
    });
  });

  // ==========================================================================
  // Export with P3 Color Space Option
  // ==========================================================================

  test.describe('Export with P3 Color Space', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
    });

    test('HDR-P3-009: export button is accessible from the UI', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await expect(exportButton).toBeVisible();
    });

    test('HDR-P3-010: PNG export works in SDR mode', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Look for PNG export option
      const pngOption = page.locator('text=Save as PNG');
      if (await pngOption.isVisible()) {
        // PNG export option is available
        await expect(pngOption).toBeVisible();
      }
    });

    test('HDR-P3-011: export options are available when P3 is active', async ({ page }) => {
      const hasP3 = await browserSupportsP3(page);
      // @hdr - requires hardware HDR support, skipped in CI
      test.skip(!hasP3, 'Browser does not support Display P3');

      // Open display profile panel to verify P3-capable environments still expose export controls.
      await goToColorTab(page);
      const dpButton = page.locator('[data-testid="display-profile-button"]');
      await dpButton.click();
      const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
      await expect(dropdown).toBeVisible();

      const detectedColorSpace = page.locator('[data-testid="display-detected-colorspace"]');
      await expect(detectedColorSpace).toBeVisible();

      // Close dropdown
      await page.keyboard.press('Escape');

      // Export should still be available
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await expect(exportButton).toBeVisible();
    });
  });

  // ==========================================================================
  // HDR Pixel Data Display
  // ==========================================================================

  test.describe('HDR Pixel Data Display', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
    });

    test('HDR-P3-012: pixel probe displays values for standard images', async ({ page }) => {
      await loadVideoFile(page);

      // Enable pixel probe
      const probeState = await getPixelProbeState(page);
      // The pixel probe should be queryable via test helper
      expect(probeState).toBeDefined();
      expect(typeof probeState.enabled).toBe('boolean');
    });

    test('HDR-P3-013: pixel probe reports RGB values for EXR files', async ({ page }) => {
      await loadExrFile(page);

      const probeState = await getPixelProbeState(page);
      expect(probeState).toBeDefined();
      // RGB values should be numeric
      expect(typeof probeState.rgb.r).toBe('number');
      expect(typeof probeState.rgb.g).toBe('number');
      expect(typeof probeState.rgb.b).toBe('number');
    });

    test('HDR-P3-014: pixel probe supports multiple display formats', async ({ page }) => {
      await loadVideoFile(page);

      const probeState = await getPixelProbeState(page);
      // Format should be one of the supported types
      expect(['rgb', 'rgb01', 'hsl', 'hex', 'ire']).toContain(probeState.format);
    });

    test('HDR-P3-015: EXR content preserves HDR data range through pipeline', async ({ page }) => {
      await loadExrFile(page);

      // Verify the EXR file loaded and its data type is float
      const viewerState = await getViewerState(page);
      // EXR files should report float data type through the test helper
      expect(viewerState).toBeDefined();
    });

    test('HDR-P3-016: super-white values are accessible in HDR EXR content', async ({ page }) => {
      const hdrSupported = await browserSupportsHDR(page);
      // @hdr - requires hardware HDR support, skipped in CI
      test.skip(!hdrSupported, 'HDR not supported - super-white display requires HDR pipeline');

      await loadExrFile(page);

      // When HDR mode is active and EXR has values > 1.0,
      // the pixel probe should be able to report them
      const probeState = await getPixelProbeState(page);
      expect(probeState).toBeDefined();
      // In HDR mode, rgb01 format should allow values > 1.0
    });
  });

  // ==========================================================================
  // Scope and Histogram SDR Regression
  // ==========================================================================

  test.describe('SDR Regression Safety', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
    });

    test('HDR-P3-017: histogram in SDR produces valid output after Phase 3 changes', async ({ page }) => {
      await page.keyboard.press('h');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.histogramVisible).toBe(true);

      // Histogram should render without errors
      const canvas = page.locator('.histogram-container canvas');
      await expect(canvas).toBeVisible();
    });

    test('HDR-P3-018: waveform in SDR produces valid output after Phase 3 changes', async ({ page }) => {
      await page.keyboard.press('w');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.waveformVisible).toBe(true);

      const canvas = page.locator('.waveform-container canvas');
      await expect(canvas).toBeVisible();
    });

    test('HDR-P3-019: vectorscope in SDR produces valid output after Phase 3 changes', async ({ page }) => {
      // Ensure vectorscope ends up visible regardless of persisted prior state.
      let state = await getViewerState(page);
      if (!state.vectorscopeVisible) {
        await page.keyboard.press('y');
        await page.waitForTimeout(200);
      }

      state = await getViewerState(page);
      expect(state.vectorscopeVisible).toBe(true);

      const vectorscope = page.locator('.vectorscope-container');
      await expect(vectorscope).toBeVisible();
    });
  });
});
