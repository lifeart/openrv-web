/**
 * Scope/Analysis Screenshots (11-17)
 *
 * Captures documentation-quality screenshots of analysis tools:
 * histogram (RGB + luminance), waveform, vectorscope, parade scope,
 * pixel probe, and false color.
 */

import { test, expect } from '@playwright/test';
import { initWithVideo, takeDocScreenshot, waitForCanvasStable } from './screenshot-helpers';

test.describe('Scope/Analysis Screenshots', () => {
  // ── 11: Histogram RGB ────────────────────────────────────────────────

  test('11-histogram-rgb', async ({ page }) => {
    await initWithVideo(page);

    // 'h' toggles the histogram (panel.histogram -> KeyH)
    await page.keyboard.press('h');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '11-histogram-rgb');
  });

  // ── 12: Histogram luminance ──────────────────────────────────────────

  test('12-histogram-luminance', async ({ page }) => {
    await initWithVideo(page);

    // Open histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(500);

    // Switch to luminance mode by clicking the mode toggle button
    // The histogram has a mode button that cycles through rgb/luminance/separate
    const modeButton = page.locator('.histogram-mode-button, [data-testid="histogram-mode-button"]').first();
    if (await modeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modeButton.click();
      await page.waitForTimeout(300);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '12-histogram-luminance');
  });

  // ── 13: Waveform ─────────────────────────────────────────────────────

  test('13-waveform', async ({ page }) => {
    await initWithVideo(page);

    // 'w' toggles the waveform (panel.waveform -> KeyW)
    await page.keyboard.press('w');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '13-waveform');
  });

  // ── 14: Vectorscope ──────────────────────────────────────────────────

  test('14-vectorscope', async ({ page }) => {
    await initWithVideo(page);

    // 'y' toggles the vectorscope (panel.vectorscope -> KeyY)
    await page.keyboard.press('y');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '14-vectorscope');
  });

  // ── 15: Parade scope ─────────────────────────────────────────────────

  test('15-parade-scope', async ({ page }) => {
    await initWithVideo(page);

    // Open waveform first
    await page.keyboard.press('w');
    await page.waitForTimeout(500);

    // Cycle the waveform mode to "parade" by clicking mode button
    // Waveform modes: luma -> rgb -> parade
    const modeButton = page.locator('.waveform-mode-button, [data-testid="waveform-mode-button"]').first();
    if (await modeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Click twice to cycle luma -> rgb -> parade
      await modeButton.click();
      await page.waitForTimeout(200);
      await modeButton.click();
      await page.waitForTimeout(200);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '15-parade-scope');
  });

  // ── 16: Pixel probe ──────────────────────────────────────────────────

  test('16-pixel-probe', async ({ page }) => {
    await initWithVideo(page);

    // Shift+I toggles the pixel probe (view.togglePixelProbe -> Shift+KeyI)
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(500);

    // Move mouse to canvas center to show probe values
    const canvas = page.locator('.viewer-container').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(300);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '16-pixel-probe');
  });

  // ── 17: False color ──────────────────────────────────────────────────

  test('17-false-color', async ({ page }) => {
    await initWithVideo(page);

    // Shift+Alt+F toggles false color (view.toggleFalseColor -> Shift+Alt+KeyF)
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '17-false-color');
  });
});
