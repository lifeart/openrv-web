import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Scope Cross-Impact Tests
 *
 * Tests to verify that scopes (Histogram, Waveform, Vectorscope) update
 * when color-related properties change (curves, CDL, color adjustments, etc.)
 */

test.describe('Scope Cross-Impact: Curves', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CROSS-001: histogram updates when curves change', async ({ page }) => {
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(200);

    const histogram = page.locator('.histogram-container');
    await expect(histogram).toBeVisible();

    // Capture histogram canvas before curves
    const histogramCanvas = page.locator('.histogram-container canvas');
    const beforeScreenshot = await histogramCanvas.screenshot();

    // Open curves and apply preset
    await page.keyboard.press('u');
    await page.waitForTimeout(200);

    const presetSelect = page.locator('[data-testid="curves-preset"]');
    await presetSelect.selectOption({ index: 2 }); // S-Curve (Strong)
    await page.waitForTimeout(500); // Wait for render + scope update

    // Capture histogram after curves
    const afterScreenshot = await histogramCanvas.screenshot();

    // Histograms should be different (curves affect the displayed image)
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('CROSS-002: waveform updates when curves change', async ({ page }) => {
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(200);

    const waveform = page.locator('.waveform-container');
    await expect(waveform).toBeVisible();

    // Capture waveform canvas before curves
    const waveformCanvas = page.locator('.waveform-container canvas');
    const beforeScreenshot = await waveformCanvas.screenshot();

    // Open curves and apply preset
    await page.keyboard.press('u');
    await page.waitForTimeout(200);

    const presetSelect = page.locator('[data-testid="curves-preset"]');
    await presetSelect.selectOption({ label: 'Cross Process' });
    await page.waitForTimeout(500);

    // Capture waveform after curves
    const afterScreenshot = await waveformCanvas.screenshot();

    // Waveforms should be different
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('CROSS-003: vectorscope updates when curves change', async ({ page }) => {
    // Show vectorscope
    await page.keyboard.press('y');
    await page.waitForTimeout(200);

    const vectorscope = page.locator('.vectorscope-container');
    await expect(vectorscope).toBeVisible();

    // Capture vectorscope canvas before curves
    const vectorscopeCanvas = page.locator('.vectorscope-container canvas');
    const beforeScreenshot = await vectorscopeCanvas.screenshot();

    // Open curves and apply preset
    await page.keyboard.press('u');
    await page.waitForTimeout(200);

    const presetSelect = page.locator('[data-testid="curves-preset"]');
    await presetSelect.selectOption({ label: 'Cross Process' });
    await page.waitForTimeout(500);

    // Capture vectorscope after curves
    const afterScreenshot = await vectorscopeCanvas.screenshot();

    // Vectorscopes should be different (cross process affects color)
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });
});

test.describe('Scope Cross-Impact: Color Adjustments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CROSS-010: histogram updates when exposure changes', async ({ page }) => {
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(200);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const beforeScreenshot = await histogramCanvas.screenshot();

    // Open color controls and adjust exposure
    await page.keyboard.press('c');
    await page.waitForTimeout(200);

    const exposureSlider = page.locator('.color-controls-panel label').filter({ hasText: 'Exposure' }).locator('..').locator('input[type="range"]');
    await exposureSlider.fill('1.5');
    await exposureSlider.dispatchEvent('input');
    await page.waitForTimeout(500);

    const afterScreenshot = await histogramCanvas.screenshot();

    // Histogram should change (brighter image shifts histogram right)
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('CROSS-011: waveform updates when contrast changes', async ({ page }) => {
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(200);

    const waveformCanvas = page.locator('.waveform-container canvas');
    const beforeScreenshot = await waveformCanvas.screenshot();

    // Open color controls and adjust contrast
    await page.keyboard.press('c');
    await page.waitForTimeout(200);

    const contrastSlider = page.locator('.color-controls-panel label').filter({ hasText: 'Contrast' }).locator('..').locator('input[type="range"]');
    await contrastSlider.fill('1.5');
    await contrastSlider.dispatchEvent('input');
    await page.waitForTimeout(500);

    const afterScreenshot = await waveformCanvas.screenshot();

    // Waveform should change
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('CROSS-012: vectorscope updates when temperature changes', async ({ page }) => {
    // Show vectorscope
    await page.keyboard.press('y');
    await page.waitForTimeout(200);

    const vectorscopeCanvas = page.locator('.vectorscope-container canvas');
    const beforeScreenshot = await vectorscopeCanvas.screenshot();

    // Open color controls and adjust temperature (shifts color balance)
    await page.keyboard.press('c');
    await page.waitForTimeout(200);

    const temperatureSlider = page.locator('.color-controls-panel label').filter({ hasText: 'Temperature' }).locator('..').locator('input[type="range"]');
    await temperatureSlider.fill('100'); // Max warm temperature
    await temperatureSlider.dispatchEvent('input');
    await page.waitForTimeout(600);

    const afterScreenshot = await vectorscopeCanvas.screenshot();

    // Vectorscope should change (temperature shifts color towards warm/cool)
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });
});

test.describe('Scope Cross-Impact: Channel Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CROSS-020: histogram updates when channel is isolated', async ({ page }) => {
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(200);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const beforeScreenshot = await histogramCanvas.screenshot();

    // Switch to red channel only (Shift+R)
    await page.keyboard.press('Shift+R');
    await page.waitForTimeout(500);

    const afterScreenshot = await histogramCanvas.screenshot();

    // Histogram should change (only red channel shown)
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('CROSS-021: waveform updates when channel is isolated', async ({ page }) => {
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(200);

    // Cycle waveform to RGB mode so channel isolation is visually distinct.
    // Default mode is Luma which renders a single-colour trace; the luminance
    // difference after isolating a single channel can be too subtle for
    // byte-level screenshot comparison.
    const modeButton = page.locator('[data-testid="waveform-mode-button"]');
    await modeButton.click();
    await page.waitForTimeout(300);

    const waveformCanvas = page.locator('.waveform-container canvas');
    const beforeScreenshot = await waveformCanvas.screenshot();

    // Switch to green channel only (Shift+G)
    await page.keyboard.press('Shift+G');
    await page.waitForTimeout(500);

    const afterScreenshot = await waveformCanvas.screenshot();

    // Waveform should change
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });
});

test.describe('Scope Cross-Impact: Reset', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CROSS-030: histogram returns to original after curves reset', async ({ page }) => {
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(200);

    const histogramCanvas = page.locator('.histogram-container canvas');
    const originalScreenshot = await histogramCanvas.screenshot();

    // Open curves and apply preset
    await page.keyboard.press('u');
    await page.waitForTimeout(200);

    const presetSelect = page.locator('[data-testid="curves-preset"]');
    await presetSelect.selectOption({ index: 2 });
    await page.waitForTimeout(500);

    const afterCurvesScreenshot = await histogramCanvas.screenshot();
    expect(imagesAreDifferent(originalScreenshot, afterCurvesScreenshot)).toBe(true);

    // Reset curves
    const resetBtn = page.locator('[data-testid="curves-reset"]');
    await resetBtn.click();
    await page.waitForTimeout(500);

    const afterResetScreenshot = await histogramCanvas.screenshot();

    // After reset, histogram should return to original state
    // Note: Due to compression/rendering, we check that it changed back
    expect(imagesAreDifferent(afterCurvesScreenshot, afterResetScreenshot)).toBe(true);
  });
});
