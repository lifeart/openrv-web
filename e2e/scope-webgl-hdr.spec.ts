import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  loadExrFile,
  loadImageFile,
  waitForTestHelper,
  getViewerState,
  imagesAreDifferent,
} from './fixtures';

/**
 * Scope WebGL & HDR Tests
 *
 * Tests verifying that scope widgets (Histogram, Waveform, Vectorscope) work
 * correctly when WebGL rendering is active and when HDR content is displayed.
 *
 * These tests focus on the NEW HDR data pipeline (getScopeImageData, float readback,
 * HDR mode activation). Generic scope behavior (mode cycling, log scale, zoom) is
 * already covered in histogram.spec.ts, waveform.spec.ts, vectorscope.spec.ts,
 * and scope-cross-impact.spec.ts.
 *
 * Test groups:
 * A. Scope Data with WebGL Active (SWG-*) — verifies scopes get data when GL renders
 * B. Scope Data with HDR Content (SHD-*) — verifies HDR-specific behavior
 * C. Scope Updates During Playback (SPB-*) — verifies live updates
 * D. Edge Cases (EDGE-*) — stability and transitions
 */

// Helper to get color control slider by label
async function getSliderByLabel(page: import('@playwright/test').Page, label: string) {
  return page.locator('.color-controls-panel label')
    .filter({ hasText: label })
    .locator('..')
    .locator('input[type="range"]');
}

// =========================================================================
// A. Scope Data with WebGL Active
// =========================================================================

test.describe('Scope Data with WebGL Active', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(200);
  });

  test('SWG-005: scope canvas is non-empty when WebGL active', async ({ page }) => {
    // Apply an exposure adjustment to ensure WebGL rendering is active
    await page.keyboard.press('c');
    await page.waitForTimeout(200);
    const exposureSlider = await getSliderByLabel(page, 'Exposure');
    await exposureSlider.fill('1.5');
    await exposureSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
    expect(state.histogramPixelCount).toBeGreaterThan(0);
  });

  test('SWG-006: all three scopes reflect GPU effects simultaneously', async ({ page }) => {
    // Show all scopes
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await page.keyboard.press('y');
    await page.waitForTimeout(300);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const waveformCanvas = page.locator('.waveform-container canvas');
    const vectorscopeCanvas = page.locator('.vectorscope-container canvas');

    const beforeH = await histogramCanvas.screenshot();
    const beforeW = await waveformCanvas.screenshot();
    const beforeV = await vectorscopeCanvas.screenshot();

    // Set saturation to 0 (desaturate) — affects all three scopes
    await page.keyboard.press('c');
    await page.waitForTimeout(200);
    const satSlider = await getSliderByLabel(page, 'Saturation');
    await satSlider.fill('0');
    await satSlider.dispatchEvent('input');
    await page.waitForTimeout(500);

    const afterH = await histogramCanvas.screenshot();
    const afterW = await waveformCanvas.screenshot();
    const afterV = await vectorscopeCanvas.screenshot();

    expect(imagesAreDifferent(beforeH, afterH)).toBe(true);
    expect(imagesAreDifferent(beforeW, afterW)).toBe(true);
    expect(imagesAreDifferent(beforeV, afterV)).toBe(true);
  });
});

// =========================================================================
// B. Scope Data with HDR Content
// =========================================================================

test.describe('Scope Data with HDR Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadExrFile(page);
    await page.waitForTimeout(500);
  });

  test('SHD-001: histogram enters HDR mode for EXR', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
    expect(state.histogramHDRActive).toBe(true);
  });

  test('SHD-002: histogram maxValue is greater than 1.0 in HDR mode', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.histogramHDRActive).toBe(true);
    expect(state.histogramMaxValue).toBeGreaterThan(1.0);
  });

  test('SHD-003: histogram pixel count is valid for HDR content', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.histogramHDRActive).toBe(true);
    expect(state.histogramPixelCount).toBeGreaterThan(0);
  });

  test('SHD-004: histogram updates with exposure on HDR content', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(300);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const beforeScreenshot = await histogramCanvas.screenshot();

    // Adjust exposure
    await page.keyboard.press('c');
    await page.waitForTimeout(200);
    const exposureSlider = await getSliderByLabel(page, 'Exposure');
    await exposureSlider.fill('2.0');
    await exposureSlider.dispatchEvent('input');
    await page.waitForTimeout(500);

    const afterScreenshot = await histogramCanvas.screenshot();
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('SHD-005: waveform renders content for EXR HDR', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(500);

    const waveformCanvas = page.locator('.waveform-container canvas');
    await expect(waveformCanvas).toBeVisible();

    // Verify the canvas actually has non-empty pixel data (not just visible)
    const hasContent = await waveformCanvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d') || el.getContext('webgl2') || el.getContext('webgl');
      if (!ctx) return false;
      if (ctx instanceof CanvasRenderingContext2D) {
        const data = ctx.getImageData(0, 0, el.width, el.height).data;
        return data.some((v, i) => i % 4 !== 3 && v > 10);
      }
      // For WebGL canvas, read pixels
      const gl = ctx as WebGL2RenderingContext;
      const pixels = new Uint8Array(el.width * el.height * 4);
      gl.readPixels(0, 0, el.width, el.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels.some((v, i) => i % 4 !== 3 && v > 10);
    });
    expect(hasContent).toBe(true);
  });

  test('SHD-006: vectorscope renders content for EXR HDR', async ({ page }) => {
    await page.keyboard.press('y');
    await page.waitForTimeout(500);

    const vectorscopeCanvas = page.locator('.vectorscope-container canvas');
    await expect(vectorscopeCanvas).toBeVisible();

    // Verify the canvas actually has non-empty pixel data (not just visible)
    const hasContent = await vectorscopeCanvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d') || el.getContext('webgl2') || el.getContext('webgl');
      if (!ctx) return false;
      if (ctx instanceof CanvasRenderingContext2D) {
        const data = ctx.getImageData(0, 0, el.width, el.height).data;
        return data.some((v, i) => i % 4 !== 3 && v > 10);
      }
      // For WebGL canvas, read pixels
      const gl = ctx as WebGL2RenderingContext;
      const pixels = new Uint8Array(el.width * el.height * 4);
      gl.readPixels(0, 0, el.width, el.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels.some((v, i) => i % 4 !== 3 && v > 10);
    });
    expect(hasContent).toBe(true);
  });

  test('SHD-007: HDR mode deactivates on switch to SDR', async ({ page }) => {
    // First confirm HDR mode is active with EXR
    await page.keyboard.press('h');
    await page.waitForTimeout(500);

    let state = await getViewerState(page);
    expect(state.histogramHDRActive).toBe(true);

    // Load SDR video (replaces EXR)
    await loadVideoFile(page);
    await page.waitForTimeout(500);

    state = await getViewerState(page);
    expect(state.histogramHDRActive).toBe(false);
    expect(state.histogramMaxValue).toBe(1.0);
  });
});

// =========================================================================
// C. Scope Updates During Playback
// =========================================================================

test.describe('Scope Updates During Playback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(200);
  });

  test('SPB-001: histogram updates during playback', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(300);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const beforeScreenshot = await histogramCanvas.screenshot();

    // Start playback and wait for several frames
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Space'); // Pause

    await page.waitForTimeout(300);
    const afterScreenshot = await histogramCanvas.screenshot();

    // Histogram should differ after playback moved to different frames
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('SPB-002: waveform updates during playback', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(300);

    const waveformCanvas = page.locator('.waveform-container canvas');
    const beforeScreenshot = await waveformCanvas.screenshot();

    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Space');

    await page.waitForTimeout(300);
    const afterScreenshot = await waveformCanvas.screenshot();

    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('SPB-003: scopes remain visible through play/pause cycles', async ({ page }) => {
    // Show all scopes
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await page.keyboard.press('y');
    await page.waitForTimeout(200);

    // Play/pause cycle
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Another cycle
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
    expect(state.waveformVisible).toBe(true);
    expect(state.vectorscopeVisible).toBe(true);
  });

  test('SPB-004: scope data non-empty after pause mid-playback', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(200);

    // Play then pause
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.histogramPixelCount).toBeGreaterThan(0);
  });
});

// =========================================================================
// D. Regression: SDR baseline with new HDR state fields
// =========================================================================

test.describe('Regression: SDR Scope Baseline', () => {
  test('SREG-001: histogram works with SDR image (PNG) and reports non-HDR', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);

    await loadImageFile(page);
    await page.waitForTimeout(500);

    await page.keyboard.press('h');
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
    expect(state.histogramPixelCount).toBeGreaterThan(0);
    expect(state.histogramHDRActive).toBe(false);
    expect(state.histogramMaxValue).toBe(1.0);
  });
});

// =========================================================================
// E. Edge Cases
// =========================================================================

test.describe('Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('EDGE-001: scope handles no media gracefully', async ({ page }) => {
    // No media loaded
    await page.keyboard.press('h');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
    // Should not crash, pixel count should be 0 (no media)
    expect(state.histogramPixelCount).toBe(0);
  });

  test('EDGE-002: HDR to SDR switch updates scopes visually', async ({ page }) => {
    // Load EXR (HDR)
    await loadExrFile(page);
    await page.waitForTimeout(500);

    await page.keyboard.press('h');
    await page.waitForTimeout(300);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const hdrScreenshot = await histogramCanvas.screenshot();

    let state = await getViewerState(page);
    expect(state.histogramHDRActive).toBe(true);

    // Load SDR video
    await loadVideoFile(page);
    await page.waitForTimeout(500);

    state = await getViewerState(page);
    expect(state.histogramHDRActive).toBe(false);

    const sdrScreenshot = await histogramCanvas.screenshot();
    expect(imagesAreDifferent(hdrScreenshot, sdrScreenshot)).toBe(true);
  });

  test('EDGE-003: rapid scope toggle during playback', async ({ page }) => {
    await loadVideoFile(page);
    await page.waitForTimeout(200);

    // Start playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Rapidly toggle histogram 5 times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('h');
      await page.waitForTimeout(50);
    }

    // Stop playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Should not have crashed - verify page is still responsive
    const state = await getViewerState(page);
    // After odd number of toggles, histogram should be visible
    expect(state.histogramVisible).toBe(true);
  });

  test('EDGE-004: all scopes visible simultaneously with HDR content', async ({ page }) => {
    await loadExrFile(page);
    await page.waitForTimeout(500);

    // Show all three scopes
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await page.keyboard.press('y');
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.histogramVisible).toBe(true);
    expect(state.waveformVisible).toBe(true);
    expect(state.vectorscopeVisible).toBe(true);
    expect(state.histogramHDRActive).toBe(true);
    expect(state.histogramPixelCount).toBeGreaterThan(0);
  });

  test('EDGE-005: scope mode change works with HDR content', async ({ page }) => {
    await loadExrFile(page);
    await page.waitForTimeout(500);

    // Show histogram and cycle modes
    await page.keyboard.press('h');
    await page.waitForTimeout(300);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const rgbScreenshot = await histogramCanvas.screenshot();

    const modeButton = page.locator('[data-testid="histogram-mode-button"]');
    await modeButton.click();
    await page.waitForTimeout(300);

    const lumaScreenshot = await histogramCanvas.screenshot();
    expect(imagesAreDifferent(rgbScreenshot, lumaScreenshot)).toBe(true);

    const state = await getViewerState(page);
    expect(state.histogramMode).toBe('luminance');
    expect(state.histogramHDRActive).toBe(true);
  });
});
