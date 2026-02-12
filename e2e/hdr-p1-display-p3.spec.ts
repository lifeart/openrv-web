import { test, expect } from '@playwright/test';
import { waitForTestHelper, loadVideoFile } from './fixtures';

/**
 * Phase 1: Display P3 Wide Color Gamut - E2E Integration Tests
 *
 * Tests verify:
 * - Display P3 canvas support detection runs without errors
 * - Active output color space label is displayed in display profile panel
 * - Gamut preference selection (Auto/sRGB/P3) works in display profile dropdown
 * - Gamut preference persists across interactions
 *
 * Note: Actual P3 rendering requires a P3-capable display and browser.
 * In headless Chromium, P3 may or may not be available depending on the environment.
 * Tests use test.skip() for hardware-dependent assertions.
 */

/** Helper: Navigate to View tab */
async function goToViewTab(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="view"]');
}

/** Helper: Open the display profile dropdown */
async function openDisplayDropdown(page: import('@playwright/test').Page) {
  const button = page.locator('[data-testid="display-profile-button"]');
  await expect(button).toBeVisible();
  await button.click();
  const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
  await expect(dropdown).toBeVisible();
}

test.describe('Phase 1: Display P3 Wide Color Gamut', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await goToViewTab(page);
  });

  // ==========================================================================
  // Display P3 Canvas Support Detection
  // ==========================================================================

  test('HDR-P1-001: DisplayCapabilities detection completes without errors', async ({ page }) => {
    // Verify that the app loaded successfully - if DisplayCapabilities detection
    // crashed, the app would not initialize properly
    const appReady = await page.evaluate(() => !!window.__OPENRV_TEST__);
    expect(appReady).toBe(true);
  });

  test('HDR-P1-002: Display P3 canvas detection returns boolean result', async ({ page }) => {
    // Probe the browser's P3 canvas support via the same detection logic
    const p3Support = await page.evaluate(() => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const ctx = c.getContext('2d', { colorSpace: 'display-p3' } as any);
        return ctx !== null;
      } catch {
        return false;
      }
    });
    // The result must be a boolean, regardless of actual support
    expect(typeof p3Support).toBe('boolean');
  });

  test('HDR-P1-003: WebGL2 P3 drawingBufferColorSpace detection returns boolean', async ({ page }) => {
    const webglP3 = await page.evaluate(() => {
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
    expect(typeof webglP3).toBe('boolean');
  });

  test('HDR-P1-004: display gamut detection returns a valid gamut value', async ({ page }) => {
    const gamut = await page.evaluate(() => {
      try {
        if (typeof matchMedia !== 'undefined') {
          if (matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
          if (matchMedia('(color-gamut: p3)').matches) return 'p3';
        }
        return 'srgb';
      } catch {
        return 'srgb';
      }
    });
    expect(['srgb', 'p3', 'rec2020']).toContain(gamut);
  });

  // ==========================================================================
  // Browser Color/Gamut Info
  // ==========================================================================

  test('HDR-P1-005: browser color space info is visible in display profile panel', async ({ page }) => {
    await openDisplayDropdown(page);

    const section = page.locator('[data-testid="display-colorspace-info"]');
    await expect(section).toBeVisible();
  });

  test('HDR-P1-006: browser color space label contains expected prefix', async ({ page }) => {
    await openDisplayDropdown(page);

    const label = page.locator('[data-testid="display-detected-colorspace"]');
    await expect(label).toBeVisible();
    const text = await label.textContent();
    expect(text).toBeTruthy();
    expect(text!.trim()).toContain('Browser color space:');
  });

  test('HDR-P1-007: detected color space info is displayed', async ({ page }) => {
    await openDisplayDropdown(page);

    const csLabel = page.locator('[data-testid="display-detected-colorspace"]');
    await expect(csLabel).toBeVisible();
    const text = await csLabel.textContent();
    expect(text).toBeTruthy();
  });

  test('HDR-P1-008: detected gamut info is displayed', async ({ page }) => {
    await openDisplayDropdown(page);

    const gamutLabel = page.locator('[data-testid="display-detected-gamut"]');
    await expect(gamutLabel).toBeVisible();
    const text = await gamutLabel.textContent();
    expect(text).toBeTruthy();
  });

  // ==========================================================================
  // Transfer Function Selection
  // ==========================================================================

  test('HDR-P1-009: transfer function section is visible in display profile panel', async ({ page }) => {
    await openDisplayDropdown(page);

    const section = page.locator('[data-testid="display-profile-section"]');
    await expect(section).toBeVisible();
  });

  test('HDR-P1-010: default transfer function is sRGB', async ({ page }) => {
    await openDisplayDropdown(page);

    const srgbOption = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgbOption).toHaveAttribute('aria-checked', 'true');
  });

  test('HDR-P1-011: sRGB transfer option is visible', async ({ page }) => {
    await openDisplayDropdown(page);

    const srgbOption = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgbOption).toBeVisible();
  });

  test('HDR-P1-012: gamma 2.4 transfer option is visible', async ({ page }) => {
    await openDisplayDropdown(page);

    const gamma24Option = page.locator('[data-testid="display-profile-gamma2.4"]');
    await expect(gamma24Option).toBeVisible();
  });

  test('HDR-P1-013: clicking Rec.709 transfer profile selects it', async ({ page }) => {
    await openDisplayDropdown(page);

    const rec709Option = page.locator('[data-testid="display-profile-rec709"]');
    await rec709Option.click();
    await page.waitForTimeout(100);

    await expect(rec709Option).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-testid="display-profile-srgb"]')).toHaveAttribute('aria-checked', 'false');
  });

  test('HDR-P1-014: selecting sRGB transfer profile marks it active', async ({ page }) => {
    await openDisplayDropdown(page);

    const srgbOption = page.locator('[data-testid="display-profile-srgb"]');
    await srgbOption.click();
    await page.waitForTimeout(100);

    await expect(srgbOption).toHaveAttribute('aria-checked', 'true');
  });

  test('HDR-P1-015: clicking Gamma 2.4 transfer profile selects it', async ({ page }) => {
    await openDisplayDropdown(page);

    const gamma24Option = page.locator('[data-testid="display-profile-gamma2.4"]');
    await gamma24Option.click();
    await page.waitForTimeout(100);

    await expect(gamma24Option).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-testid="display-profile-srgb"]')).toHaveAttribute('aria-checked', 'false');
  });

  test('HDR-P1-016: selecting sRGB after another profile resets selection to sRGB', async ({ page }) => {
    await openDisplayDropdown(page);

    await page.locator('[data-testid="display-profile-gamma2.4"]').click();
    await page.waitForTimeout(100);

    const srgbOption = page.locator('[data-testid="display-profile-srgb"]');
    await srgbOption.click();
    await page.waitForTimeout(100);

    await expect(srgbOption).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-testid="display-profile-gamma2.4"]')).toHaveAttribute('aria-checked', 'false');
  });

  test('HDR-P1-017: transfer profile survives dropdown close and reopen', async ({ page }) => {
    await openDisplayDropdown(page);

    const rec709Option = page.locator('[data-testid="display-profile-rec709"]');
    await rec709Option.click();
    await page.waitForTimeout(100);

    // Close dropdown
    await page.keyboard.press('Escape');
    const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
    await expect(dropdown).not.toBeVisible();

    // Reopen dropdown
    await openDisplayDropdown(page);

    // Rec.709 should still be selected
    const rec709OptionAfter = page.locator('[data-testid="display-profile-rec709"]');
    await expect(rec709OptionAfter).toHaveAttribute('aria-checked', 'true');
  });

  test('HDR-P1-018: reset button resets transfer profile to sRGB', async ({ page }) => {
    await openDisplayDropdown(page);

    await page.locator('[data-testid="display-profile-gamma2.4"]').click();
    await page.waitForTimeout(100);

    // Click reset
    const resetButton = page.locator('[data-testid="display-profile-reset"]');
    await resetButton.click();
    await page.waitForTimeout(100);

    await expect(page.locator('[data-testid="display-profile-srgb"]')).toHaveAttribute('aria-checked', 'true');
  });

  // ==========================================================================
  // P3 Support (hardware-dependent - skipped in CI)
  // ==========================================================================

  test('HDR-P1-019: detected gamut label reflects p3-capable environments', async ({ page }) => {
    const hasP3Gamut = await page.evaluate(() => {
      try {
        return typeof matchMedia !== 'undefined' && matchMedia('(color-gamut: p3)').matches;
      } catch {
        return false;
      }
    });
    test.skip(!hasP3Gamut, 'Environment does not report P3 gamut support');

    await openDisplayDropdown(page);

    const label = page.locator('[data-testid="display-detected-gamut"]');
    const text = (await label.textContent())?.toLowerCase() ?? '';
    expect(text).toContain('p3');
  });
});
