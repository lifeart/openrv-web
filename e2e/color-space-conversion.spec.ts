import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getOCIOState,
  captureCanvasState,
  verifyCanvasChanged,
  getCanvasBrightness,
  sampleCanvasPixels,
} from './fixtures';

/**
 * Color Space Conversion E2E Tests
 *
 * Verifies the OCIO color management pipeline produces correct visual output
 * in the browser when different color spaces and transforms are applied.
 */

/** Helper: Wait for OCIO enabled state to change */
async function waitForOCIOEnabled(page: import('@playwright/test').Page, enabled: boolean, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getOCIOState();
      return state?.enabled === expected;
    },
    enabled,
    { timeout }
  );
}

/** Helper: Wait for OCIO panel visibility */
async function waitForOCIOPanel(page: import('@playwright/test').Page, visible: boolean, timeout = 5000): Promise<void> {
  const panel = page.locator('[data-testid="ocio-panel"]');
  if (visible) {
    await expect(panel).toBeVisible({ timeout });
  } else {
    await expect(panel).not.toBeVisible({ timeout });
  }
}

/** Helper: open OCIO panel and enable the pipeline */
async function enableOCIO(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-testid="ocio-panel-button"]').click();
  await waitForOCIOPanel(page, true);
  await page.locator('[data-testid="ocio-enable-toggle"]').click();
  await waitForOCIOEnabled(page, true);
}

/** Helper: select a dropdown option by clicking the trigger then the option text */
async function selectDropdownOption(
  page: import('@playwright/test').Page,
  triggerTestId: string,
  optionText: string
): Promise<void> {
  await page.locator(`[data-testid="${triggerTestId}"]`).click();
  const dropdown = page.locator('.dropdown-menu').last();
  await expect(dropdown).toBeVisible({ timeout: 5000 });
  await dropdown.locator('button', { hasText: optionText }).click();
  await expect(dropdown).not.toBeVisible({ timeout: 5000 });
}

test.describe('Color Space Conversion E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button[data-tab-id="color"]').click({ force: true });
    await expect(page.locator('[data-testid="ocio-panel-button"]')).toBeVisible();
  });

  test('CS-E001: enabling OCIO changes canvas brightness', async ({ page }) => {
    const beforeBrightness = await getCanvasBrightness(page);

    await enableOCIO(page);
    // Wait for render
    await page.waitForTimeout(500);

    const afterBrightness = await getCanvasBrightness(page);

    // Enabling OCIO with default ACEScg→sRGB pipeline should change brightness
    expect(Math.abs(afterBrightness - beforeBrightness)).toBeGreaterThan(0);
  });

  test('CS-E002: switching input color space changes canvas', async ({ page }) => {
    await enableOCIO(page);
    await page.waitForTimeout(300);

    const stateA = await captureCanvasState(page);

    // Switch input color space
    await selectDropdownOption(page, 'ocio-input-colorspace', 'ARRI LogC3 (EI 800)');
    await page.waitForTimeout(500);

    const stateB = await captureCanvasState(page);

    expect(verifyCanvasChanged(stateA, stateB)).toBe(true);
  });

  test('CS-E003: ARRI LogC3→sRGB produces valid rendered output (no NaN)', async ({ page }) => {
    await enableOCIO(page);

    // Select LogC3 input
    await selectDropdownOption(page, 'ocio-input-colorspace', 'ARRI LogC3 (EI 800)');
    await page.waitForTimeout(500);

    // Sample canvas pixels — they should all be valid numbers in 0-255
    const pixels = await sampleCanvasPixels(page, [
      { x: 50, y: 50 },
      { x: 100, y: 100 },
      { x: 150, y: 150 },
    ]);

    for (const pixel of pixels) {
      expect(pixel.r).toBeGreaterThanOrEqual(0);
      expect(pixel.r).toBeLessThanOrEqual(255);
      expect(pixel.g).toBeGreaterThanOrEqual(0);
      expect(pixel.g).toBeLessThanOrEqual(255);
      expect(pixel.b).toBeGreaterThanOrEqual(0);
      expect(pixel.b).toBeLessThanOrEqual(255);
      // NaN would fail this check
      expect(Number.isFinite(pixel.r)).toBe(true);
    }
  });

  test('CS-E004: sRGB→Rec.709 produces minimal visual change (shared primaries)', async ({ page }) => {
    await enableOCIO(page);

    // Set input to sRGB and display to sRGB (baseline)
    await selectDropdownOption(page, 'ocio-input-colorspace', 'sRGB');
    await page.waitForTimeout(300);
    const pixelsBaseline = await sampleCanvasPixels(page, [
      { x: 80, y: 80 },
    ]);

    // Change display to Rec.709 (same primaries as sRGB, only OETF differs)
    await selectDropdownOption(page, 'ocio-display', 'Rec.709');
    await page.waitForTimeout(300);
    const pixelsRec709 = await sampleCanvasPixels(page, [
      { x: 80, y: 80 },
    ]);

    // Change should be small (shared primaries) — within ~30 levels on 8-bit
    const dr = Math.abs(pixelsBaseline[0]!.r - pixelsRec709[0]!.r);
    const dg = Math.abs(pixelsBaseline[0]!.g - pixelsRec709[0]!.g);
    const db = Math.abs(pixelsBaseline[0]!.b - pixelsRec709[0]!.b);
    expect(dr + dg + db).toBeLessThan(90);
  });

  test('CS-E005: OCIO round-trip (enable→modify→reset) restores original', async ({ page }) => {
    const beforeState = await captureCanvasState(page);

    // Enable OCIO
    await enableOCIO(page);
    await page.waitForTimeout(300);

    // Disable OCIO
    await page.locator('[data-testid="ocio-enable-toggle"]').click();
    await waitForOCIOEnabled(page, false);
    await page.waitForTimeout(300);

    const afterState = await captureCanvasState(page);

    // Should be back to original after disabling
    expect(beforeState).toBe(afterState);
  });

  test('CS-E006: pixel sample with OCIO enabled shows different values than disabled', async ({ page }) => {
    const pixelsBefore = await sampleCanvasPixels(page, [
      { x: 60, y: 60 },
    ]);

    await enableOCIO(page);
    await page.waitForTimeout(500);

    const pixelsAfter = await sampleCanvasPixels(page, [
      { x: 60, y: 60 },
    ]);

    // At least one channel should differ
    const differs =
      pixelsBefore[0]!.r !== pixelsAfter[0]!.r ||
      pixelsBefore[0]!.g !== pixelsAfter[0]!.g ||
      pixelsBefore[0]!.b !== pixelsAfter[0]!.b;
    expect(differs).toBe(true);
  });

  test('CS-E007: with OCIO enabled, waveform scope updates', async ({ page }) => {
    // Enable waveform scope
    await page.keyboard.press('w');
    await page.waitForTimeout(300);

    const scopeBefore = await captureCanvasState(page);

    // Enable OCIO
    await enableOCIO(page);
    await page.waitForTimeout(500);

    const scopeAfter = await captureCanvasState(page);

    // Canvas should have changed due to OCIO + scope interaction
    expect(verifyCanvasChanged(scopeBefore, scopeAfter)).toBe(true);
  });

  test('CS-E008: OCIO state getters report correct color spaces', async ({ page }) => {
    await enableOCIO(page);

    const state = await getOCIOState(page);
    expect(state.enabled).toBe(true);
    expect(state.display).toBe('sRGB');
    expect(state.workingColorSpace).toBe('ACEScg');

    // Change input color space
    await selectDropdownOption(page, 'ocio-input-colorspace', 'ARRI LogC3 (EI 800)');
    await page.waitForTimeout(200);

    const updatedState = await getOCIOState(page);
    expect(updatedState.inputColorSpace).toBe('ARRI LogC3 (EI 800)');
  });
});
