import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getOCIOState,
  captureViewerScreenshot,
  imagesAreDifferent,
  sampleCanvasPixels,
  getCanvasBrightness,
  captureCanvasState,
  verifyCanvasChanged,
} from './fixtures';

/**
 * OCIO Color Management Tests
 *
 * Tests for the OpenColorIO color management pipeline including:
 * - Panel visibility and controls
 * - Configuration selection
 * - Color space selection
 * - Display and view transforms
 * - Keyboard shortcuts
 * - **Canvas visual verification** - OCIO transforms actually affect rendered output
 */

/** Helper: open OCIO panel and enable the pipeline */
async function enableOCIO(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-testid="ocio-panel-button"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="ocio-enable-toggle"]').click();
  await page.waitForTimeout(300);
}

/** Helper: select a dropdown option by clicking the trigger then the option text */
async function selectDropdownOption(
  page: import('@playwright/test').Page,
  triggerTestId: string,
  optionText: string
): Promise<void> {
  await page.locator(`[data-testid="${triggerTestId}"]`).click();
  await page.waitForTimeout(150);
  const dropdown = page.locator('.dropdown-menu').last();
  await dropdown.locator('button', { hasText: optionText }).click();
  await page.waitForTimeout(300);
}

test.describe('OCIO Color Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);
  });

  test.describe('Panel Visibility', () => {
    test('OCIO-E001: OCIO button should be visible in color tab', async ({ page }) => {
      const ocioButton = page.locator('[data-testid="ocio-panel-button"]');
      await expect(ocioButton).toBeVisible();
      await expect(ocioButton).toContainText('OCIO');
    });

    test('OCIO-E002: clicking OCIO button should open panel', async ({ page }) => {
      const ocioButton = page.locator('[data-testid="ocio-panel-button"]');
      await ocioButton.click();
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();
    });

    test('OCIO-E003: Shift+O keyboard shortcut should toggle panel', async ({ page }) => {
      // Open panel with shortcut
      await page.keyboard.press('Shift+O');
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();

      // Close with shortcut
      await page.keyboard.press('Shift+O');
      await page.waitForTimeout(200);
      await expect(ocioPanel).not.toBeVisible();
    });

    test('OCIO-E004: close button should hide panel', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();

      // Click close button
      await page.locator('[data-testid="ocio-panel-close"]').click();
      await page.waitForTimeout(200);
      await expect(ocioPanel).not.toBeVisible();
    });

    test('OCIO-E005: clicking outside panel should close it', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();

      // Click on the viewer area (outside panel)
      await page.locator('.viewer-container canvas').first().click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(200);
      await expect(ocioPanel).not.toBeVisible();
    });
  });

  test.describe('Default State', () => {
    test('OCIO-E010: default state should have OCIO disabled', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.enabled).toBe(false);
    });

    test('OCIO-E011: default config should be aces_1.2', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.configName).toBe('aces_1.2');
    });

    test('OCIO-E012: default input color space should be Auto', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.inputColorSpace).toBe('Auto');
    });

    test('OCIO-E013: default working color space should be ACEScg', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.workingColorSpace).toBe('ACEScg');
    });

    test('OCIO-E014: default display should be sRGB', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.display).toBe('sRGB');
    });
  });

  test.describe('Enable Toggle', () => {
    test('OCIO-E020: enable toggle should enable OCIO pipeline', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      let state = await getOCIOState(page);
      expect(state.enabled).toBe(false);

      // Enable OCIO
      const enableToggle = page.locator('[data-testid="ocio-enable-toggle"]');
      await enableToggle.click();
      await page.waitForTimeout(200);

      state = await getOCIOState(page);
      expect(state.enabled).toBe(true);
    });

    test('OCIO-E021: enable toggle should update button style', async ({ page }) => {
      const ocioButton = page.locator('[data-testid="ocio-panel-button"]');

      // Open panel and enable
      await ocioButton.click();
      await page.waitForTimeout(200);

      await page.locator('[data-testid="ocio-enable-toggle"]').click();
      await page.waitForTimeout(200);

      // Button should have active style (highlighted border)
      const borderColor = await ocioButton.evaluate((el) =>
        getComputedStyle(el).borderColor
      );
      expect(borderColor).not.toBe('transparent');
    });
  });

  test.describe('Configuration Selection', () => {
    test('OCIO-E030: config dropdown should show available configurations', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click config dropdown
      await page.locator('[data-testid="ocio-config-select"]').click();
      await page.waitForTimeout(200);

      // Should show ACES and sRGB options
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Input Color Space Selection', () => {
    test('OCIO-E040: input color space dropdown should show available spaces', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click input color space dropdown
      await page.locator('[data-testid="ocio-input-colorspace"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Display Selection', () => {
    test('OCIO-E050: display dropdown should show available displays', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click display dropdown
      await page.locator('[data-testid="ocio-display-select"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('View Selection', () => {
    test('OCIO-E060: view dropdown should show available views', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click view dropdown
      await page.locator('[data-testid="ocio-view-select"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Look Selection', () => {
    test('OCIO-E070: look dropdown should show available looks', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click look dropdown
      await page.locator('[data-testid="ocio-look-select"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Reset Button', () => {
    test('OCIO-E080: reset button should restore defaults', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Enable OCIO and change some settings
      await page.locator('[data-testid="ocio-enable-toggle"]').click();
      await page.waitForTimeout(200);

      let state = await getOCIOState(page);
      expect(state.enabled).toBe(true);

      // Click reset
      await page.locator('[data-testid="ocio-reset-button"]').click();
      await page.waitForTimeout(200);

      state = await getOCIOState(page);
      expect(state.enabled).toBe(false);
      expect(state.inputColorSpace).toBe('Auto');
    });
  });

  test.describe('Panel Content', () => {
    test('OCIO-E090: panel should display current configuration name', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="ocio-panel"]');
      // Should contain config description
      await expect(panel).toContainText('Academy');
    });

    test('OCIO-E091: panel should display section headers', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="ocio-panel"]');
      await expect(panel).toContainText('Configuration');
      await expect(panel).toContainText('Input');
      await expect(panel).toContainText('Working');
      await expect(panel).toContainText('Display');
      await expect(panel).toContainText('Look');
    });

    test('OCIO-E092: panel should display detected color space field', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const detectedLabel = page.locator('[data-testid="ocio-detected-colorspace"]');
      await expect(detectedLabel).toBeVisible();
    });
  });

  // =========================================================================
  // CANVAS VISUAL VERIFICATION TESTS
  // These tests verify that OCIO transforms actually change the rendered output
  // =========================================================================

  test.describe('Canvas Visual Effects', () => {
    test('OCIO-E100: enabling OCIO should visually change the canvas', async ({ page }) => {
      // Capture canvas before enabling OCIO
      const screenshotBefore = await captureViewerScreenshot(page);

      // Enable OCIO pipeline
      await enableOCIO(page);

      // Verify state is enabled
      const state = await getOCIOState(page);
      expect(state.enabled).toBe(true);

      // Capture canvas after enabling OCIO
      const screenshotAfter = await captureViewerScreenshot(page);

      // The ACES transform should produce a visibly different image
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('OCIO-E101: disabling OCIO should restore canvas brightness', async ({ page }) => {
      // Measure original brightness
      const brightnessOriginal = await getCanvasBrightness(page);

      // Enable OCIO
      await enableOCIO(page);
      const brightnessEnabled = await getCanvasBrightness(page);
      expect(brightnessOriginal).not.toBeCloseTo(brightnessEnabled, 0);

      // Disable OCIO
      await page.locator('[data-testid="ocio-enable-toggle"]').click();
      await page.waitForTimeout(300);

      const state = await getOCIOState(page);
      expect(state.enabled).toBe(false);

      // Brightness should return close to original
      const brightnessDisabled = await getCanvasBrightness(page);
      expect(brightnessDisabled).toBeCloseTo(brightnessOriginal, 0);
    });

    test('OCIO-E102: OCIO should change actual pixel values on canvas', async ({ page }) => {
      // Sample pixels at center of canvas before OCIO
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      const centerX = Math.round(box!.width / 2);
      const centerY = Math.round(box!.height / 2);
      const samplePoints = [
        { x: centerX, y: centerY },
        { x: Math.round(box!.width / 4), y: Math.round(box!.height / 4) },
        { x: Math.round(box!.width * 3 / 4), y: Math.round(box!.height * 3 / 4) },
      ];

      const pixelsBefore = await sampleCanvasPixels(page, samplePoints);

      // Enable OCIO
      await enableOCIO(page);

      const pixelsAfter = await sampleCanvasPixels(page, samplePoints);

      // At least some sampled pixels should have different values
      let pixelsChanged = false;
      for (let i = 0; i < pixelsBefore.length; i++) {
        if (
          pixelsBefore[i].r !== pixelsAfter[i].r ||
          pixelsBefore[i].g !== pixelsAfter[i].g ||
          pixelsBefore[i].b !== pixelsAfter[i].b
        ) {
          pixelsChanged = true;
          break;
        }
      }
      expect(pixelsChanged).toBe(true);
    });

    test('OCIO-E103: changing display should produce different visual output', async ({ page }) => {
      // Enable OCIO first
      await enableOCIO(page);

      // Capture with default display (sRGB)
      const screenshotSRGB = await captureViewerScreenshot(page);

      const stateBefore = await getOCIOState(page);
      expect(stateBefore.display).toBe('sRGB');

      // Change display to Rec.709
      await selectDropdownOption(page, 'ocio-display-select', 'Rec.709');

      const stateAfter = await getOCIOState(page);
      expect(stateAfter.display).toBe('Rec.709');

      // Capture with Rec.709 display
      const screenshotRec709 = await captureViewerScreenshot(page);

      // Different display transform = different visual output
      expect(imagesAreDifferent(screenshotSRGB, screenshotRec709)).toBe(true);
    });

    test('OCIO-E104: changing input color space should produce different visual output', async ({ page }) => {
      // Enable OCIO
      await enableOCIO(page);

      // Capture with Auto input
      const screenshotAuto = await captureViewerScreenshot(page);

      // Change input to ARRI LogC3 (EI 800)
      await selectDropdownOption(page, 'ocio-input-colorspace', 'ARRI LogC3');

      const state = await getOCIOState(page);
      expect(state.inputColorSpace).toContain('ARRI LogC3');

      // Capture with ARRI LogC3 input
      const screenshotLogC = await captureViewerScreenshot(page);

      // Different input color space interpretation = different output
      expect(imagesAreDifferent(screenshotAuto, screenshotLogC)).toBe(true);
    });

    test('OCIO-E105: changing working color space should produce different visual output', async ({ page }) => {
      // Enable OCIO
      await enableOCIO(page);

      // Capture with default working space (ACEScg)
      const screenshotACES = await captureViewerScreenshot(page);

      // Change working space to Linear sRGB
      await selectDropdownOption(page, 'ocio-working-colorspace', 'Linear sRGB');

      const state = await getOCIOState(page);
      expect(state.workingColorSpace).toBe('Linear sRGB');

      const screenshotLinear = await captureViewerScreenshot(page);

      // Different working space affects the transform chain
      expect(imagesAreDifferent(screenshotACES, screenshotLinear)).toBe(true);
    });

    test('OCIO-E106: canvas brightness should change when OCIO is enabled', async ({ page }) => {
      // Measure brightness before OCIO
      const brightnessBefore = await getCanvasBrightness(page);

      // Enable OCIO (ACES transform typically changes overall brightness)
      await enableOCIO(page);

      const brightnessAfter = await getCanvasBrightness(page);

      // Brightness should measurably change (the ACES tone mapping curve
      // remaps values, so overall perceived brightness will differ)
      expect(brightnessBefore).not.toBeCloseTo(brightnessAfter, 0);
    });
  });

  test.describe('State Persistence', () => {
    test('OCIO-E110: OCIO settings should persist across frame changes', async ({ page }) => {
      // Enable OCIO and change display to Rec.709
      await enableOCIO(page);
      await selectDropdownOption(page, 'ocio-display-select', 'Rec.709');

      let state = await getOCIOState(page);
      expect(state.enabled).toBe(true);
      expect(state.display).toBe('Rec.709');

      // Navigate to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // OCIO state should persist
      state = await getOCIOState(page);
      expect(state.enabled).toBe(true);
      expect(state.display).toBe('Rec.709');
    });

    test('OCIO-E111: OCIO visual effect should persist across frame changes', async ({ page }) => {
      // Enable OCIO
      await enableOCIO(page);

      // Capture with OCIO enabled on current frame
      const screenshotFrame1 = await captureViewerScreenshot(page);

      // Navigate forward
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Disable OCIO on the new frame to compare
      await page.locator('[data-testid="ocio-enable-toggle"]').click();
      await page.waitForTimeout(300);

      const screenshotFrame2NoOCIO = await captureViewerScreenshot(page);

      // Re-enable OCIO
      await page.locator('[data-testid="ocio-enable-toggle"]').click();
      await page.waitForTimeout(300);

      const screenshotFrame2WithOCIO = await captureViewerScreenshot(page);

      // OCIO should still affect the canvas on the new frame
      expect(imagesAreDifferent(screenshotFrame2NoOCIO, screenshotFrame2WithOCIO)).toBe(true);
    });
  });

  test.describe('Reset Visual Effects', () => {
    test('OCIO-E120: reset should restore original canvas brightness', async ({ page }) => {
      // Measure original brightness
      const brightnessOriginal = await getCanvasBrightness(page);

      // Enable OCIO and change settings
      await enableOCIO(page);
      await selectDropdownOption(page, 'ocio-display-select', 'Rec.709');
      await page.waitForTimeout(200);

      const brightnessModified = await getCanvasBrightness(page);
      expect(brightnessOriginal).not.toBeCloseTo(brightnessModified, 0);

      // Click reset
      await page.locator('[data-testid="ocio-reset-button"]').click();
      await page.waitForTimeout(300);

      // State should be back to defaults
      const state = await getOCIOState(page);
      expect(state.enabled).toBe(false);
      expect(state.display).toBe('sRGB');

      // Canvas brightness should return close to original
      const brightnessReset = await getCanvasBrightness(page);
      expect(brightnessReset).toBeCloseTo(brightnessOriginal, 0);
    });
  });

  test.describe('Configuration Change Visual Effects', () => {
    test('OCIO-E130: switching config from ACES to sRGB should change canvas', async ({ page }) => {
      // Enable OCIO with default ACES config
      await enableOCIO(page);
      const screenshotACES = await captureViewerScreenshot(page);

      let state = await getOCIOState(page);
      expect(state.configName).toBe('aces_1.2');

      // Switch to sRGB config
      await selectDropdownOption(page, 'ocio-config-select', 'sRGB');
      await page.waitForTimeout(300);

      state = await getOCIOState(page);
      expect(state.configName).toBe('srgb');

      const screenshotSRGB = await captureViewerScreenshot(page);

      // Different config = different transform pipeline = different visual
      expect(imagesAreDifferent(screenshotACES, screenshotSRGB)).toBe(true);
    });
  });

  test.describe('OCIO Combined with Other Effects', () => {
    test('OCIO-E140: OCIO should work together with color adjustments', async ({ page }) => {
      // Enable OCIO
      await enableOCIO(page);
      const screenshotOCIOOnly = await captureViewerScreenshot(page);

      // Close OCIO panel first
      await page.locator('[data-testid="ocio-panel-close"]').click();
      await page.waitForTimeout(100);

      // Open color adjustments and increase exposure
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const exposureSlider = page.locator('.color-controls-panel label')
        .filter({ hasText: 'Exposure' })
        .locator('..')
        .locator('input[type="range"]');

      if (await exposureSlider.isVisible()) {
        await exposureSlider.fill('2');
        await exposureSlider.dispatchEvent('input');
        await page.waitForTimeout(300);
      }

      const screenshotOCIOPlusExposure = await captureViewerScreenshot(page);

      // Combined OCIO + exposure should differ from OCIO alone
      expect(imagesAreDifferent(screenshotOCIOOnly, screenshotOCIOPlusExposure)).toBe(true);
    });
  });
});
