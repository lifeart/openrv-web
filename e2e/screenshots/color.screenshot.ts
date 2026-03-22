/**
 * Color Management Screenshots (26-33)
 *
 * Captures documentation-quality screenshots of color management features:
 * color wheels, HSL qualifier, CDL controls, LUT loaded state,
 * log curves, display profiles, color inversion, and hue rotation.
 */

import { test } from '@playwright/test';
import { initWithVideo, takeDocScreenshot, switchTab, waitForCanvasStable } from './screenshot-helpers';

test.describe('Color Management Screenshots', () => {
  // ── 26: Color wheels panel ─────────────────────────────────────────

  test('26-color-wheels', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');

    // Shift+Alt+W toggles the color wheels (color.toggleColorWheels -> Shift+Alt+KeyW)
    await page.keyboard.press('Shift+Alt+w');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '26-color-wheels');
  });

  // ── 27: HSL qualifier panel ────────────────────────────────────────

  test('27-hsl-qualifier', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');

    // Shift+H toggles the HSL qualifier (color.toggleHSLQualifier -> Shift+KeyH)
    await page.keyboard.press('Shift+h');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '27-hsl-qualifier');
  });

  // ── 28: CDL controls ──────────────────────────────────────────────

  test('28-cdl-controls', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');
    await page.waitForTimeout(300);

    // Click the CDL button in the color tab toolbar
    const cdlButton = page.locator('[data-testid="cdl-button"], button:has-text("CDL"), [title*="CDL"]').first();
    if (await cdlButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cdlButton.click();
      await page.waitForTimeout(300);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '28-cdl-controls');
  });

  // ── 29: LUT loaded state ──────────────────────────────────────────

  test('29-lut-loaded', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');
    await page.waitForTimeout(300);

    // Click the LUT button in the color tab toolbar
    const lutButton = page.locator('[data-testid="lut-button"], button:has-text("LUT"), [title*="LUT"]').first();
    if (await lutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lutButton.click();
      await page.waitForTimeout(300);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '29-lut-loaded');
  });

  // ── 30: Log curves ────────────────────────────────────────────────

  test('30-log-curves', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');
    await page.waitForTimeout(300);

    // Click the Log button in the color tab toolbar
    const logButton = page.locator('[data-testid="log-button"], button:has-text("Log"), [title*="Log"]').first();
    if (await logButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logButton.click();
      await page.waitForTimeout(300);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '30-log-curves');
  });

  // ── 31: Display profiles ──────────────────────────────────────────

  test('31-display-profiles', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');
    await page.waitForTimeout(300);

    // Shift+Alt+D cycles display profile (display.cycleProfile -> Shift+Alt+KeyD)
    await page.keyboard.press('Shift+Alt+d');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '31-display-profiles');
  });

  // ── 32: Color inversion ───────────────────────────────────────────

  test('32-color-inversion', async ({ page }) => {
    await initWithVideo(page);

    // Ctrl+I toggles color inversion (color.toggleInversion -> Ctrl+KeyI)
    await page.keyboard.press('Control+i');
    await page.waitForTimeout(500);
    await waitForCanvasStable(page, 2000);

    await takeDocScreenshot(page, '32-color-inversion');
  });

  // ── 33: Hue rotation ──────────────────────────────────────────────

  test('33-hue-rotation', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'color');

    // Open color controls panel to access hue rotation
    await page.keyboard.press('c');
    await page.waitForSelector('.color-controls-panel', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Look for hue rotation slider and set it to a visible value
    const hueSlider = page
      .locator('[data-testid="hue-rotation"], input[aria-label*="Hue"], .hue-rotation-slider input')
      .first();
    if (await hueSlider.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hueSlider.fill('120');
      await page.waitForTimeout(300);
    } else {
      // Fallback: use the test helper to set hue rotation
      await page.evaluate(() => {
        (window as any).__OPENRV_TEST__?.setHueRotation?.(120);
      });
      await page.waitForTimeout(300);
    }

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '33-hue-rotation');
  });
});
