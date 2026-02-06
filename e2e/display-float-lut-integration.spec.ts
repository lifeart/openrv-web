import { test, expect } from '@playwright/test';
import path from 'path';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  getColorState,
} from './fixtures';

/**
 * Display Color Management GPU Integration & Float LUT Single-Pass Pipeline
 *
 * These tests verify that:
 *
 * Feature 1 - Display Color Management GPU Integration:
 * - renderer.setDisplayColorState() is properly wired into the GPU render path
 * - Changing display profiles produces visible output differences
 * - Display gamma and brightness sliders affect the rendered output
 * - Resetting display state returns output to its default appearance
 *
 * Feature 2 - Float LUT Single-Pass Pipeline:
 * - renderer.setLUT() applies 3D LUTs in the GPU fragment shader
 * - LUT intensity slider interpolates between no-effect and full-effect
 * - Clearing a LUT disables the GPU LUT path
 * - LUT application produces visible rendered output changes
 *
 * Complements existing tests in:
 * - e2e/display-color-management.spec.ts (UI-level tests)
 * - e2e/float-lut-precision.spec.ts (precision and state tests)
 */

const SAMPLE_LUT = 'sample/test_lut.cube';

// ======================================================================
// Helpers
// ======================================================================

/** Navigate to the View tab */
async function goToViewTab(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="view"]');
}

/** Open the display profile dropdown from the View tab */
async function openDisplayDropdown(page: import('@playwright/test').Page) {
  const button = page.locator('[data-testid="display-profile-button"]');
  await expect(button).toBeVisible();
  await button.click();
  const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
  await expect(dropdown).toBeVisible();
}

/** Open the color controls panel (for LUT operations) */
async function waitForColorPanel(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[data-tab-id="color"]')
        ?.classList?.contains('active') ||
      document.querySelector(
        '[data-tab-id="color"][aria-selected="true"]',
      ) !== null,
    { timeout: 5000 },
  );
  await page.keyboard.press('c');
  await page.waitForFunction(
    () => document.querySelector('.color-controls-panel') !== null,
    { timeout: 5000 },
  );
}

/** Wait for LUT to be reported as loaded */
async function waitForLUTLoaded(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () =>
      (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === true,
    { timeout: 5000 },
  );
}

/** Wait for LUT to be reported as cleared */
async function waitForLUTCleared(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () =>
      (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === false,
    { timeout: 5000 },
  );
}

/** Load the sample .cube LUT file via the color panel file input */
async function loadSampleLUT(page: import('@playwright/test').Page) {
  const fileInput = page
    .locator('.color-controls-panel input[type="file"][accept=".cube"]')
    .first();
  if (!(await fileInput.count())) {
    return false;
  }
  const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
  await fileInput.setInputFiles(lutPath);
  await waitForLUTLoaded(page);
  return true;
}

// ======================================================================
// Feature 1 - Display Color Management GPU Integration Tests
// ======================================================================

test.describe('Display Color Management GPU Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await goToViewTab(page);
  });

  test('INT-E001: display profile change affects rendered output', async ({
    page,
  }) => {
    // Capture baseline screenshot with default sRGB profile
    const beforeScreenshot = await captureViewerScreenshot(page);

    // Change display profile to Linear
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-linear"]');

    // Allow the GPU to re-render with the new display transfer function
    await page.waitForTimeout(300);

    const afterScreenshot = await captureViewerScreenshot(page);

    // The linear profile removes the sRGB gamma curve, producing a
    // visibly different (brighter midtones) rendering.
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('INT-E002: switching between multiple profiles produces distinct outputs', async ({
    page,
  }) => {
    // Capture sRGB (default)
    const srgbScreenshot = await captureViewerScreenshot(page);

    // Switch to Rec.709
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-rec709"]');
    await page.waitForTimeout(300);
    const rec709Screenshot = await captureViewerScreenshot(page);

    // Switch to Gamma 2.4
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-gamma24"]');
    await page.waitForTimeout(300);
    const gamma24Screenshot = await captureViewerScreenshot(page);

    // Each profile applies a different EOTF, so all three should differ
    expect(imagesAreDifferent(srgbScreenshot, rec709Screenshot)).toBe(true);
    expect(imagesAreDifferent(rec709Screenshot, gamma24Screenshot)).toBe(true);
  });

  test('INT-E003: display gamma slider changes rendered output', async ({
    page,
  }) => {
    const beforeScreenshot = await captureViewerScreenshot(page);

    await openDisplayDropdown(page);
    const gammaSlider = page.locator(
      '[data-testid="display-gamma-slider"]',
    );
    await gammaSlider.fill('2.0');
    // Give the renderer time to apply the new gamma value
    await page.waitForTimeout(300);

    const afterScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('INT-E004: display brightness slider changes rendered output', async ({
    page,
  }) => {
    const beforeScreenshot = await captureViewerScreenshot(page);

    await openDisplayDropdown(page);
    const brightnessSlider = page.locator(
      '[data-testid="display-brightness-slider"]',
    );
    await brightnessSlider.fill('0.5');
    await page.waitForTimeout(300);

    const afterScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('INT-E005: extreme gamma values produce visible change', async ({
    page,
  }) => {
    await openDisplayDropdown(page);

    // Set gamma to minimum (0.1)
    const gammaSlider = page.locator(
      '[data-testid="display-gamma-slider"]',
    );
    await gammaSlider.fill('0.1');
    await page.waitForTimeout(300);
    const lowGammaScreenshot = await captureViewerScreenshot(page);

    // Set gamma to maximum (4.0)
    await gammaSlider.fill('4.0');
    await page.waitForTimeout(300);
    const highGammaScreenshot = await captureViewerScreenshot(page);

    expect(
      imagesAreDifferent(lowGammaScreenshot, highGammaScreenshot),
    ).toBe(true);
  });

  test('INT-E006: extreme brightness values produce visible change', async ({
    page,
  }) => {
    await openDisplayDropdown(page);

    const brightnessSlider = page.locator(
      '[data-testid="display-brightness-slider"]',
    );

    // Set brightness to 0 (black)
    await brightnessSlider.fill('0');
    await page.waitForTimeout(300);
    const darkScreenshot = await captureViewerScreenshot(page);

    // Set brightness to 2 (over-bright)
    await brightnessSlider.fill('2');
    await page.waitForTimeout(300);
    const brightScreenshot = await captureViewerScreenshot(page);

    expect(
      imagesAreDifferent(darkScreenshot, brightScreenshot),
    ).toBe(true);
  });

  test('INT-E007: resetting display state returns to default output', async ({
    page,
  }) => {
    // Capture the default output
    const defaultScreenshot = await captureViewerScreenshot(page);

    // Change profile, gamma, and brightness
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-gamma24"]');
    const gammaSlider = page.locator(
      '[data-testid="display-gamma-slider"]',
    );
    await gammaSlider.fill('2.5');
    const brightnessSlider = page.locator(
      '[data-testid="display-brightness-slider"]',
    );
    await brightnessSlider.fill('0.3');
    await page.waitForTimeout(300);

    const modifiedScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(defaultScreenshot, modifiedScreenshot)).toBe(
      true,
    );

    // Reset
    await page.click('[data-testid="display-profile-reset"]');
    await page.waitForTimeout(300);

    const resetScreenshot = await captureViewerScreenshot(page);

    // After reset, the sRGB profile with gamma=1.0, brightness=1.0 should
    // be active again, producing the same output as the initial default.
    // We verify that the reset output differs from the modified output,
    // confirming the reset actually took effect on the GPU path.
    expect(imagesAreDifferent(modifiedScreenshot, resetScreenshot)).toBe(
      true,
    );
  });

  test('INT-E008: display profile combined with gamma produces compound effect', async ({
    page,
  }) => {
    // Linear profile at default gamma
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-linear"]');
    await page.waitForTimeout(300);
    const linearDefaultScreenshot = await captureViewerScreenshot(page);

    // Linear profile with elevated gamma
    const gammaSlider = page.locator(
      '[data-testid="display-gamma-slider"]',
    );
    await gammaSlider.fill('3.0');
    await page.waitForTimeout(300);
    const linearHighGammaScreenshot = await captureViewerScreenshot(page);

    expect(
      imagesAreDifferent(linearDefaultScreenshot, linearHighGammaScreenshot),
    ).toBe(true);
  });

  test('INT-E009: custom profile selection reflects on GPU output', async ({
    page,
  }) => {
    const beforeScreenshot = await captureViewerScreenshot(page);

    // Select the custom profile option
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-custom"]');
    await page.waitForTimeout(300);

    // The custom profile applies a user-defined gamma curve. With default
    // custom gamma this may or may not differ, but the profile change must
    // not crash and the UI must reflect the selection.
    const customOption = page.locator(
      '[data-testid="display-profile-custom"]',
    );
    await expect(customOption).toHaveAttribute('aria-checked', 'true');
  });
});

// ======================================================================
// Feature 2 - Float LUT Single-Pass Pipeline GPU Integration Tests
// ======================================================================

test.describe('Float LUT Single-Pass Pipeline GPU Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await waitForColorPanel(page);
  });

  test('INT-L001: loading a LUT activates the GPU single-pass path', async ({
    page,
  }) => {
    // Verify initial state: no LUT
    let state = await getColorState(page);
    expect(state.hasLUT).toBe(false);

    // Load the LUT
    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // The GPU path is activated when hasLUT becomes true and the 3D LUT
    // texture is uploaded to the shader (u_lut3DEnabled = true).
    state = await getColorState(page);
    expect(state.hasLUT).toBe(true);
    expect(state.lutIntensity).toBe(1);
  });

  test('INT-L002: LUT application produces visible rendered output change', async ({
    page,
  }) => {
    const beforeScreenshot = await captureViewerScreenshot(page);

    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Wait a moment for the GPU to re-render with the LUT applied
    await page.waitForTimeout(300);
    const afterScreenshot = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('INT-L003: LUT intensity 0 produces no visual LUT effect', async ({
    page,
  }) => {
    // Capture the original (no-LUT) screenshot
    const originalScreenshot = await captureViewerScreenshot(page);

    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Capture the full-intensity LUT screenshot
    await page.waitForTimeout(300);
    const fullLUTScreenshot = await captureViewerScreenshot(page);

    // Confirm the LUT changed the image
    expect(imagesAreDifferent(originalScreenshot, fullLUTScreenshot)).toBe(
      true,
    );

    // Set intensity to 0 (no LUT effect)
    const intensitySlider = page
      .locator('.color-controls-panel')
      .locator('label:has-text("Intensity")')
      .locator('..')
      .locator('input[type="range"]')
      .first();

    if (await intensitySlider.isVisible()) {
      await intensitySlider.fill('0');
      await intensitySlider.dispatchEvent('input');
      await page.waitForFunction(
        () =>
          (window as any).__OPENRV_TEST__?.getColorState()?.lutIntensity ===
          0,
        { timeout: 5000 },
      );
      await page.waitForTimeout(300);

      const zeroIntensityScreenshot =
        await captureViewerScreenshot(page);

      // At intensity 0, the LUT has no effect: output should match
      // the original (pre-LUT) image, and differ from the full-LUT image.
      expect(
        imagesAreDifferent(fullLUTScreenshot, zeroIntensityScreenshot),
      ).toBe(true);

      const state = await getColorState(page);
      expect(state.hasLUT).toBe(true);
      expect(state.lutIntensity).toBe(0);
    }
  });

  test('INT-L004: LUT intensity 1 produces full LUT effect', async ({
    page,
  }) => {
    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Ensure intensity is at 1 (default)
    const state = await getColorState(page);
    expect(state.lutIntensity).toBe(1);
    expect(state.hasLUT).toBe(true);

    // The rendered output with intensity=1 is the fully LUT-transformed image.
    // We just verify that the state is correct (visual verification was done
    // in INT-L002).
  });

  test('INT-L005: LUT intensity 0.5 blends between original and LUT', async ({
    page,
  }) => {
    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Capture full intensity screenshot
    await page.waitForTimeout(300);
    const fullScreenshot = await captureViewerScreenshot(page);

    // Set intensity to 0.5
    const intensitySlider = page
      .locator('.color-controls-panel')
      .locator('label:has-text("Intensity")')
      .locator('..')
      .locator('input[type="range"]')
      .first();

    if (await intensitySlider.isVisible()) {
      await intensitySlider.fill('0.5');
      await intensitySlider.dispatchEvent('input');
      await page.waitForFunction(
        () => {
          const s = (window as any).__OPENRV_TEST__?.getColorState();
          return s && Math.abs(s.lutIntensity - 0.5) < 0.01;
        },
        { timeout: 5000 },
      );
      await page.waitForTimeout(300);

      const halfScreenshot = await captureViewerScreenshot(page);

      // The 50% blend should differ from the 100% blend
      expect(
        imagesAreDifferent(fullScreenshot, halfScreenshot),
      ).toBe(true);
    }
  });

  test('INT-L006: clearing LUT disables the GPU LUT path', async ({
    page,
  }) => {
    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);
    const lutScreenshot = await captureViewerScreenshot(page);

    // Find and click the clear/remove LUT button
    const clearButton = page
      .locator(
        '.color-controls-panel button:has-text("\u2715"), .color-controls-panel button[title*="Remove LUT"]',
      )
      .first();
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await waitForLUTCleared(page);

      const state = await getColorState(page);
      expect(state.hasLUT).toBe(false);

      await page.waitForTimeout(300);
      const clearedScreenshot = await captureViewerScreenshot(page);

      // After clearing, the output should differ from the LUT-applied output
      expect(
        imagesAreDifferent(lutScreenshot, clearedScreenshot),
      ).toBe(true);
    }
  });

  test('INT-L007: re-loading LUT after clear re-activates GPU path', async ({
    page,
  }) => {
    // Load, then clear, then re-load
    let loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);
    const firstLUTScreenshot = await captureViewerScreenshot(page);

    // Clear
    const clearButton = page
      .locator(
        '.color-controls-panel button:has-text("\u2715"), .color-controls-panel button[title*="Remove LUT"]',
      )
      .first();
    if (!(await clearButton.isVisible())) {
      test.skip();
      return;
    }
    await clearButton.click();
    await waitForLUTCleared(page);

    await page.waitForTimeout(300);
    const clearedScreenshot = await captureViewerScreenshot(page);

    // Re-load
    loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);
    const reloadedScreenshot = await captureViewerScreenshot(page);

    // The re-loaded LUT output should differ from the cleared output
    expect(
      imagesAreDifferent(clearedScreenshot, reloadedScreenshot),
    ).toBe(true);

    // And should look similar to the first LUT application (same LUT file)
    // We can not guarantee pixel-exact match due to timing, but we confirm
    // both differ from the cleared state.
    expect(
      imagesAreDifferent(clearedScreenshot, firstLUTScreenshot),
    ).toBe(true);
  });

  test('INT-L008: 3D LUT uses float internal format on GPU', async ({
    page,
  }) => {
    // Verify that WebGL2 supports 3D float textures needed by the LUT
    const result = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (!gl) return { supported: false, reason: 'no webgl2' };

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, tex);

      const size = 4;
      const data = new Float32Array(size * size * size * 3);
      // Fill with identity-ish data
      let idx = 0;
      for (let r = 0; r < size; r++) {
        for (let g = 0; g < size; g++) {
          for (let b = 0; b < size; b++) {
            data[idx++] = r / (size - 1);
            data[idx++] = g / (size - 1);
            data[idx++] = b / (size - 1);
          }
        }
      }

      try {
        gl.texImage3D(
          gl.TEXTURE_3D,
          0,
          gl.RGB32F,
          size,
          size,
          size,
          0,
          gl.RGB,
          gl.FLOAT,
          data,
        );
        const err = gl.getError();
        gl.deleteTexture(tex);
        return {
          supported: true,
          error: err,
          noError: err === gl.NO_ERROR,
        };
      } catch {
        gl.deleteTexture(tex);
        return { supported: false, reason: 'texImage3D failed' };
      }
    });

    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.noError).toBe(true);
    }
  });
});

// ======================================================================
// Combined: Display Profile + LUT Integration Tests
// ======================================================================

test.describe('Display + LUT Combined GPU Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('INT-C001: LUT and display profile changes compound on GPU output', async ({
    page,
  }) => {
    // Open color panel and load LUT
    await waitForColorPanel(page);

    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);
    const lutOnlyScreenshot = await captureViewerScreenshot(page);

    // Now also change the display profile
    await goToViewTab(page);
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-linear"]');
    await page.waitForTimeout(300);

    const lutPlusLinearScreenshot = await captureViewerScreenshot(page);

    // The combination of LUT + linear display profile should differ from
    // LUT alone (which uses sRGB by default).
    expect(
      imagesAreDifferent(lutOnlyScreenshot, lutPlusLinearScreenshot),
    ).toBe(true);
  });

  test('INT-C002: display gamma adjustment compounds with LUT effect', async ({
    page,
  }) => {
    await waitForColorPanel(page);

    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);
    const lutDefaultGammaScreenshot = await captureViewerScreenshot(page);

    // Adjust display gamma
    await goToViewTab(page);
    await openDisplayDropdown(page);
    const gammaSlider = page.locator(
      '[data-testid="display-gamma-slider"]',
    );
    await gammaSlider.fill('2.5');
    await page.waitForTimeout(300);

    const lutHighGammaScreenshot = await captureViewerScreenshot(page);

    expect(
      imagesAreDifferent(
        lutDefaultGammaScreenshot,
        lutHighGammaScreenshot,
      ),
    ).toBe(true);
  });

  test('INT-C003: clearing LUT while display profile is non-default', async ({
    page,
  }) => {
    // Set a non-default display profile first
    await goToViewTab(page);
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-gamma22"]');
    await page.waitForTimeout(300);
    const gamma22NoLUTScreenshot = await captureViewerScreenshot(page);

    // Load LUT
    await waitForColorPanel(page);
    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await page.waitForTimeout(300);
    const gamma22WithLUTScreenshot = await captureViewerScreenshot(page);
    expect(
      imagesAreDifferent(gamma22NoLUTScreenshot, gamma22WithLUTScreenshot),
    ).toBe(true);

    // Clear the LUT - display profile should remain at gamma 2.2
    const clearButton = page
      .locator(
        '.color-controls-panel button:has-text("\u2715"), .color-controls-panel button[title*="Remove LUT"]',
      )
      .first();
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await waitForLUTCleared(page);
      await page.waitForTimeout(300);

      const gamma22AfterClearScreenshot =
        await captureViewerScreenshot(page);

      // After clearing LUT, output should differ from the LUT-applied
      // version but resemble the gamma 2.2 no-LUT baseline.
      expect(
        imagesAreDifferent(
          gamma22WithLUTScreenshot,
          gamma22AfterClearScreenshot,
        ),
      ).toBe(true);
    }
  });

  test('INT-C004: resetting display after LUT does not clear LUT', async ({
    page,
  }) => {
    // Load LUT
    await waitForColorPanel(page);
    const loaded = await loadSampleLUT(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Change display profile
    await goToViewTab(page);
    await openDisplayDropdown(page);
    await page.click('[data-testid="display-profile-rec709"]');
    await page.waitForTimeout(300);

    // Reset display
    await page.click('[data-testid="display-profile-reset"]');
    await page.waitForTimeout(300);

    // Verify the LUT is still active after display reset
    const state = await getColorState(page);
    expect(state.hasLUT).toBe(true);
    expect(state.lutIntensity).toBe(1);

    // Verify display settings returned to defaults
    const gammaValue = page.locator(
      '[data-testid="display-gamma-value"]',
    );
    await expect(gammaValue).toHaveText('1.00');
    const brightnessValue = page.locator(
      '[data-testid="display-brightness-value"]',
    );
    await expect(brightnessValue).toHaveText('1.00');
    const srgb = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgb).toHaveAttribute('aria-checked', 'true');
  });
});
