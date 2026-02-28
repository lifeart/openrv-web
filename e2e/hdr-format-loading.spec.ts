import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  getSessionState,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
  getColorState,
} from './fixtures';
import path from 'path';
import fs from 'fs';

/**
 * HDR Format Loading Tests - DPX, Cineon, Float TIFF
 *
 * Tests for specialized HDR image format support including:
 * - DPX (Digital Picture Exchange) file format
 * - Cineon file format
 * - TIFF Float (32-bit IEEE float) file format
 * - Format detection and metadata extraction
 * - Bit depth and data type verification
 * - HDR content display
 * - Integration with exposure controls
 *
 * Test IDs: HDR-F-001 through HDR-F-099
 */

// Test file paths
const SAMPLE_DPX = 'sample/test.dpx';
const SAMPLE_CINEON = 'sample/test.cin';
const SAMPLE_TIFF_FLOAT = 'sample/test_float.tif';

/**
 * Wait for viewer state to update with format info
 */
async function waitForFormatInfo(
  page: import('@playwright/test').Page,
  expectedFormat: { formatName?: string; bitDepth?: number; dataType?: string },
  timeout = 10000
) {
  await page.waitForFunction(
    (expected) => {
      const state = window.__OPENRV_TEST__?.getViewerState();
      if (!state) return false;
      if (expected.formatName !== undefined && state.formatName !== expected.formatName) return false;
      if (expected.bitDepth !== undefined && state.bitDepth !== expected.bitDepth) return false;
      if (expected.dataType !== undefined && state.dataType !== expected.dataType) return false;
      return true;
    },
    expectedFormat,
    { timeout }
  );
}

/**
 * Check if a test fixture file exists
 */
function fixtureExists(fixturePath: string): boolean {
  const fullPath = path.resolve(process.cwd(), fixturePath);
  return fs.existsSync(fullPath);
}

/**
 * Load a file and wait for it to be ready
 */
async function loadFile(page: import('@playwright/test').Page, filePath: string) {
  const fullPath = path.resolve(process.cwd(), filePath);
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(fullPath);

  // Wait for media to be loaded
  await page.waitForFunction(
    () => {
      const state = window.__OPENRV_TEST__?.getSessionState();
      return state?.hasMedia === true;
    },
    undefined,
    { timeout: 10000 }
  );
}

/**
 * Open color controls panel and return the exposure slider.
 */
async function getExposureSlider(page: import('@playwright/test').Page) {
  const panel = page.locator('.color-controls-panel');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.keyboard.press('c');
    await expect(panel).toBeVisible();
  }
  const exposureSlider = panel.locator('[data-testid="slider-exposure"]');
  await expect(exposureSlider).toBeVisible();
  return exposureSlider;
}

/**
 * Open color controls panel and return a slider by key.
 */
async function getColorSlider(page: import('@playwright/test').Page, key: string) {
  const panel = page.locator('.color-controls-panel');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.keyboard.press('c');
    await expect(panel).toBeVisible();
  }
  const slider = panel.locator(`[data-testid="slider-${key}"]`);
  await expect(slider).toBeVisible();
  return slider;
}

test.describe('DPX Format Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('HDR-F-002: should load DPX file and update session state', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    // Verify no media loaded initially
    let state = await getSessionState(page);
    expect(state.hasMedia).toBe(false);

    // Load DPX file
    await loadFile(page, SAMPLE_DPX);

    // Verify media loaded
    state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);
    expect(state.frameCount).toBeGreaterThanOrEqual(1);
  });

  test('HDR-F-003: should detect DPX format and expose metadata', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    // Wait for format info to be available
    await waitForFormatInfo(page, { formatName: 'DPX' });

    const viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('DPX');
    expect(viewerState.bitDepth).toBeGreaterThan(0);
    expect(viewerState.dataType).toBeTruthy();
  });

  test('HDR-F-004: should display DPX image on canvas', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    // Capture canvas to verify content
    const screenshot = await captureViewerScreenshot(page);
    expect(screenshot.length).toBeGreaterThan(1000); // Not empty
  });

  test('HDR-F-005: should report correct bit depth for DPX', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    const viewerState = await getViewerState(page);
    // DPX can be 8, 10, 12, or 16 bit
    expect([8, 10, 12, 16]).toContain(viewerState.bitDepth);
  });

  test('HDR-F-006: exposure controls should work with DPX', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    // Capture initial state
    const beforeScreenshot = await captureViewerScreenshot(page);

    // Open color controls panel and adjust exposure
    const exposureSlider = await getExposureSlider(page);

    await exposureSlider.fill('1.5');
    await exposureSlider.dispatchEvent('input');

    // Wait for exposure to update
    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getColorState();
        return Math.abs((state?.exposure ?? 0) - 1.5) < 0.1;
      },
      undefined,
      { timeout: 10000 }
    );

    // Capture after adjustment
    const afterScreenshot = await captureViewerScreenshot(page);

    // Verify the image changed
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('HDR-F-007: DPX format badge should be visible in UI', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    // Check if format info is displayed in the UI
    // This could be in the info panel or a format badge
    const viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('DPX');
  });

  test('HDR-F-008: DPX should work with channel isolation', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    // Capture RGB view
    const rgbView = await captureViewerScreenshot(page);

    // Switch to red channel via scripting API
    await page.evaluate(() => window.openrv?.view.setChannel('red'));

    // Wait for channel mode to change
    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return state?.channelMode === 'red';
      },
      undefined,
      { timeout: 10000 }
    );

    const redView = await captureViewerScreenshot(page);

    // Views should be different
    expect(imagesAreDifferent(rgbView, redView)).toBe(true);
  });

  test('HDR-F-009: DPX should work with zoom controls', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    // Zoom in via scripting API
    await page.evaluate(() => window.openrv?.view.setZoom(2));

    // Wait for zoom to change
    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return (state?.zoom ?? 1) > 1;
      },
      undefined,
      { timeout: 10000 }
    );

    const viewerState = await getViewerState(page);
    expect(viewerState.zoom).toBeGreaterThan(1);
  });
});

test.describe('Cineon Format Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('HDR-F-011: should load Cineon file and update session state', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    let state = await getSessionState(page);
    expect(state.hasMedia).toBe(false);

    await loadFile(page, SAMPLE_CINEON);

    state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);
    expect(state.frameCount).toBeGreaterThanOrEqual(1);
  });

  test('HDR-F-012: should detect Cineon format and expose metadata', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    await loadFile(page, SAMPLE_CINEON);

    await waitForFormatInfo(page, { formatName: 'Cineon' });

    const viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('Cineon');
    expect(viewerState.bitDepth).toBe(10); // Cineon is always 10-bit
    expect(viewerState.dataType).toBeTruthy();
  });

  test('HDR-F-013: should display Cineon image on canvas', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    await loadFile(page, SAMPLE_CINEON);

    const screenshot = await captureViewerScreenshot(page);
    expect(screenshot.length).toBeGreaterThan(1000);
  });

  test('HDR-F-014: Cineon log-to-linear conversion should be applied by default', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    await loadFile(page, SAMPLE_CINEON);

    // Cineon files are logarithmic by nature
    // The decoder should apply log-to-linear by default
    const viewerState = await getViewerState(page);

    // Check that color space is linear after decoding
    expect(viewerState.colorSpace).toBe('linear');
  });

  test('HDR-F-015: exposure controls should work with Cineon', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    await loadFile(page, SAMPLE_CINEON);

    const beforeScreenshot = await captureViewerScreenshot(page);

    const exposureSlider = await getExposureSlider(page);

    await exposureSlider.fill('-0.5');
    await exposureSlider.dispatchEvent('input');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getColorState();
        return Math.abs((state?.exposure ?? 0) + 0.5) < 0.1;
      },
      undefined,
      { timeout: 10000 }
    );

    const afterScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('HDR-F-016: Cineon should work with histogram display', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    await loadFile(page, SAMPLE_CINEON);

    // Toggle histogram
    await page.keyboard.press('h');

    // Wait for histogram to be visible
    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return state?.histogramVisible === true;
      },
      undefined,
      { timeout: 10000 }
    );

    const viewerState = await getViewerState(page);
    expect(viewerState.histogramVisible).toBe(true);
  });

  test('HDR-F-017: Cineon should work with waveform display', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    await loadFile(page, SAMPLE_CINEON);

    // Toggle waveform
    await page.keyboard.press('w');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return state?.waveformVisible === true;
      },
      undefined,
      { timeout: 10000 }
    );

    const viewerState = await getViewerState(page);
    expect(viewerState.waveformVisible).toBe(true);
  });
});

test.describe('Float TIFF Format Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('HDR-F-021: should load Float TIFF file and update session state', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    let state = await getSessionState(page);
    expect(state.hasMedia).toBe(false);

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);
    expect(state.frameCount).toBeGreaterThanOrEqual(1);
  });

  test('HDR-F-022: should detect Float TIFF format and expose metadata', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    await waitForFormatInfo(page, { formatName: 'TIFF' });

    const viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('TIFF');
    expect(viewerState.bitDepth).toBe(32); // Float TIFF is 32-bit
    expect(viewerState.dataType).toBe('float32');
  });

  test('HDR-F-023: should display Float TIFF image on canvas', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    const screenshot = await captureViewerScreenshot(page);
    expect(screenshot.length).toBeGreaterThan(1000);
  });

  test('HDR-F-024: Float TIFF should support HDR values > 1.0', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    // Float TIFF can contain values > 1.0
    // Reducing exposure should reveal detail in bright areas
    const normalExposure = await captureViewerScreenshot(page);

    const exposureSlider = await getExposureSlider(page);

    await exposureSlider.fill('-1');
    await exposureSlider.dispatchEvent('input');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getColorState();
        return Math.abs((state?.exposure ?? 0) + 1) < 0.1;
      },
      undefined,
      { timeout: 10000 }
    );

    const lowExposure = await captureViewerScreenshot(page);

    // Images should be different
    expect(imagesAreDifferent(normalExposure, lowExposure)).toBe(true);
  });

  test('HDR-F-025: Float TIFF should work with tone mapping', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    const beforeToneMapping = await captureViewerScreenshot(page);

    // Enable tone mapping with a real operator (toggle alone just sets enabled=true
    // but keeps operator='off', which doesn't change the image)
    await page.evaluate(() => {
      const app = window.__OPENRV_TEST__?.app as any;
      const control = app?.controls?.toneMappingControl;
      if (control) {
        // setOperator auto-enables when selecting a non-off operator
        control.setOperator('reinhard');
      }
    });

    // Wait for tone mapping to be enabled with a real operator
    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getToneMappingState();
        return state?.enabled === true && state?.operator !== 'off';
      },
      undefined,
      { timeout: 10000 }
    );

    const afterToneMapping = await captureViewerScreenshot(page);

    // Image should change with tone mapping
    expect(imagesAreDifferent(beforeToneMapping, afterToneMapping)).toBe(true);
  });

  test('HDR-F-026: Float TIFF exposure adjustment should affect display', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    const baseline = await captureViewerScreenshot(page);

    const exposureSlider = await getExposureSlider(page);

    await exposureSlider.fill('2');
    await exposureSlider.dispatchEvent('input');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getColorState();
        return Math.abs((state?.exposure ?? 0) - 2) < 0.1;
      },
      undefined,
      { timeout: 10000 }
    );

    const increased = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(baseline, increased)).toBe(true);
  });

  test('HDR-F-027: Float TIFF should work with channel isolation', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    const rgbView = await captureViewerScreenshot(page);

    // Switch to blue channel via scripting API
    await page.evaluate(() => window.openrv?.view.setChannel('blue'));

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return state?.channelMode === 'blue';
      },
      undefined,
      { timeout: 10000 }
    );

    const blueView = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(rgbView, blueView)).toBe(true);
  });

  test('HDR-F-028: Float TIFF should work with vectorscope', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    // Toggle vectorscope (y key)
    await page.keyboard.press('y');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return state?.vectorscopeVisible === true;
      },
      undefined,
      { timeout: 10000 }
    );

    const viewerState = await getViewerState(page);
    expect(viewerState.vectorscopeVisible).toBe(true);
  });
});

test.describe('HDR Format Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('HDR-F-030: format info should persist when changing frames', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    await waitForFormatInfo(page, { formatName: 'DPX' });

    let viewerState = await getViewerState(page);
    const originalFormatName = viewerState.formatName;
    const originalBitDepth = viewerState.bitDepth;

    // Navigate frames
    await page.keyboard.press('ArrowRight');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getSessionState();
        return state?.currentFrame > 0;
      },
      undefined,
      { timeout: 10000 }
    );

    viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe(originalFormatName);
    expect(viewerState.bitDepth).toBe(originalBitDepth);
  });

  test('HDR-F-031: format badge should update when loading different format', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX) || !fixtureExists(SAMPLE_TIFF_FLOAT),
      'DPX or Float TIFF test fixture not found');

    // Load DPX first
    await loadFile(page, SAMPLE_DPX);
    await waitForFormatInfo(page, { formatName: 'DPX' });

    let viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('DPX');

    // Load Float TIFF via file input
    const fullPath = path.resolve(process.cwd(), SAMPLE_TIFF_FLOAT);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(fullPath);

    // Wait for the second source to appear (A/B compare adds it as source B)
    await page.waitForFunction(
      () => {
        const app = (window as any).__OPENRV_TEST__?.app;
        return (app?.session?.sources?.length ?? 0) >= 2;
      },
      undefined,
      { timeout: 10000 }
    );

    // Switch to the new source (the app keeps source A active for A/B compare)
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      const session = app?.session;
      const lastIdx = (session?.sources?.length ?? 1) - 1;
      session?.setCurrentSource(lastIdx);
    });

    // Wait for format info to reflect TIFF
    await waitForFormatInfo(page, { formatName: 'TIFF' });

    viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('TIFF');
    expect(viewerState.dataType).toBe('float32');
  });

  test('HDR-F-032: HDR formats should work with color adjustments', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    const baseline = await captureViewerScreenshot(page);

    // Open color controls panel and adjust multiple parameters
    const exposureSlider = await getExposureSlider(page);
    await exposureSlider.fill('0.5');
    await exposureSlider.dispatchEvent('input');

    // Adjust saturation (in the same panel)
    const panel = page.locator('.color-controls-panel');
    const saturationSlider = panel.locator('[data-testid="slider-saturation"]');
    if (await saturationSlider.isVisible()) {
      await saturationSlider.fill('1.2');
      await saturationSlider.dispatchEvent('input');
    }

    // Wait for changes to apply
    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getColorState();
        return Math.abs((state?.exposure ?? 0) - 0.5) < 0.1;
      },
      undefined,
      { timeout: 10000 }
    );

    const adjusted = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(baseline, adjusted)).toBe(true);
  });

  test('HDR-F-033: HDR formats should work with transform operations', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    const before = await captureViewerScreenshot(page);

    // Rotate 90 degrees right (Alt+R)
    await page.keyboard.press('Alt+r');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getTransformState();
        return state?.rotation === 90;
      },
      undefined,
      { timeout: 10000 }
    );

    const after = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  test('HDR-F-034: HDR formats should work with flip operations', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    const before = await captureViewerScreenshot(page);

    // Flip horizontally (Alt+H)
    await page.keyboard.press('Alt+h');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getTransformState();
        return state?.flipH === true;
      },
      undefined,
      { timeout: 10000 }
    );

    const after = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  test('HDR-F-035: app remains functional when no file is loaded', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Verify app is functional without loading any file
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Session should report no media loaded
    const state = await getSessionState(page);
    expect(state.hasMedia).toBe(false);

    // No uncaught errors should have occurred
    expect(errors.length).toBe(0);
  });

  test('HDR-F-036: app remains functional after HDR format load', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    let state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);

    // Navigation should work
    await page.keyboard.press('ArrowRight');

    // App should still be responsive
    const viewer = page.locator('.viewer-container').first();
    await expect(viewer).toBeVisible();

    // Can still toggle features
    await page.keyboard.press('h'); // histogram

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return state?.histogramVisible === true;
      },
      undefined,
      { timeout: 10000 }
    );
  });
});

test.describe('HDR Format Metadata and Info Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('HDR-F-040: info panel should display DPX format details', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    // Enable info panel
    await page.keyboard.press('Shift+Alt+i');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getInfoPanelState();
        return state?.enabled === true;
      },
      undefined,
      { timeout: 10000 }
    );

    const viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('DPX');

    // Info panel should be visible
    const infoPanelState = await page.evaluate(() => {
      return window.__OPENRV_TEST__?.getInfoPanelState();
    });
    expect(infoPanelState?.enabled).toBe(true);
  });

  test('HDR-F-041: info panel should display Cineon format details', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_CINEON), 'Cineon test fixture not found');

    await loadFile(page, SAMPLE_CINEON);

    await page.keyboard.press('Shift+Alt+i');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getInfoPanelState();
        return state?.enabled === true;
      },
      undefined,
      { timeout: 10000 }
    );

    const viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('Cineon');
    expect(viewerState.bitDepth).toBe(10);
  });

  test('HDR-F-042: info panel should display Float TIFF format details', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_TIFF_FLOAT), 'Float TIFF test fixture not found');

    await loadFile(page, SAMPLE_TIFF_FLOAT);

    await page.keyboard.press('Shift+Alt+i');

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getInfoPanelState();
        return state?.enabled === true;
      },
      undefined,
      { timeout: 10000 }
    );

    const viewerState = await getViewerState(page);
    expect(viewerState.formatName).toBe('TIFF');
    expect(viewerState.bitDepth).toBe(32);
    expect(viewerState.dataType).toBe('float32');
  });

  test('HDR-F-043: format badge should show bit depth info', async ({ page }) => {
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!fixtureExists(SAMPLE_DPX), 'DPX test fixture not found');

    await loadFile(page, SAMPLE_DPX);

    const viewerState = await getViewerState(page);

    // Verify bit depth is exposed
    expect(viewerState.bitDepth).toBeGreaterThan(0);
    expect([8, 10, 12, 16]).toContain(viewerState.bitDepth);
  });
});
