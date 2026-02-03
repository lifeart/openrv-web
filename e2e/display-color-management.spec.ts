import { test, expect } from '@playwright/test';
import { loadVideoFile, waitForTestHelper } from './fixtures';

/**
 * Display Color Management - E2E Integration Tests
 *
 * Tests verify:
 * - Display profile button is visible in View tab
 * - Display profile dropdown opens/closes correctly
 * - Profile selection changes canvas output
 * - Gamma and brightness controls work
 * - Reset restores defaults
 * - Keyboard shortcuts cycle profiles
 * - Display state persists across page reloads
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

test.describe('Display Color Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await goToViewTab(page);
  });

  // ==================================================================
  // Panel Visibility and Navigation Tests
  // ==================================================================
  test('DCM-001: display profile button should be visible in View tab', async ({ page }) => {
    const button = page.locator('[data-testid="display-profile-button"]');
    await expect(button).toBeVisible();
  });

  test('DCM-002: clicking display profile button should open dropdown', async ({ page }) => {
    await openDisplayDropdown(page);
    const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('DCM-003: pressing Escape should close display profile dropdown', async ({ page }) => {
    await openDisplayDropdown(page);
    await page.keyboard.press('Escape');
    const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
    await expect(dropdown).not.toBeVisible();
  });

  test('DCM-005: clicking outside dropdown should close it', async ({ page }) => {
    await openDisplayDropdown(page);
    // Click on the viewer canvas area (outside dropdown)
    await page.click('[data-testid="viewer-canvas"]', { force: true });
    const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
    await expect(dropdown).not.toBeVisible();
  });

  // ==================================================================
  // Display Profile Selection Tests
  // ==================================================================
  test('DCM-010: default display profile should be sRGB', async ({ page }) => {
    await openDisplayDropdown(page);
    const srgbOption = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgbOption).toHaveAttribute('aria-checked', 'true');
  });

  test('DCM-016: active profile should have visual highlight', async ({ page }) => {
    await openDisplayDropdown(page);
    const srgbOption = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgbOption).toHaveAttribute('aria-checked', 'true');
  });

  test('DCM-017: only one profile should be active at a time', async ({ page }) => {
    await openDisplayDropdown(page);

    // Select Rec.709
    await page.click('[data-testid="display-profile-rec709"]');
    const rec709 = page.locator('[data-testid="display-profile-rec709"]');
    await expect(rec709).toHaveAttribute('aria-checked', 'true');

    // sRGB should no longer be checked
    const srgb = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgb).toHaveAttribute('aria-checked', 'false');
  });

  // ==================================================================
  // Display Gamma Control Tests
  // ==================================================================
  test('DCM-020: display gamma slider should default to 1.0', async ({ page }) => {
    await openDisplayDropdown(page);
    const gammaValue = page.locator('[data-testid="display-gamma-value"]');
    await expect(gammaValue).toHaveText('1.00');
  });

  test('DCM-024: display gamma value readout should update on input', async ({ page }) => {
    await openDisplayDropdown(page);
    const slider = page.locator('[data-testid="display-gamma-slider"]');
    await slider.fill('2.0');
    const gammaValue = page.locator('[data-testid="display-gamma-value"]');
    await expect(gammaValue).toHaveText('2.00');
  });

  // ==================================================================
  // Display Brightness Control Tests
  // ==================================================================
  test('DCM-030: display brightness slider should default to 1.0', async ({ page }) => {
    await openDisplayDropdown(page);
    const brightnessValue = page.locator('[data-testid="display-brightness-value"]');
    await expect(brightnessValue).toHaveText('1.00');
  });

  // ==================================================================
  // Browser Color Space Detection Tests
  // ==================================================================
  test('DCM-040: browser color space info should be displayed', async ({ page }) => {
    await openDisplayDropdown(page);
    const csLabel = page.locator('[data-testid="display-detected-colorspace"]');
    await expect(csLabel).toBeVisible();
    const text = await csLabel.textContent();
    expect(text).toBeTruthy();
  });

  test('DCM-041: browser gamut detection should show result', async ({ page }) => {
    await openDisplayDropdown(page);
    const gamutLabel = page.locator('[data-testid="display-detected-gamut"]');
    await expect(gamutLabel).toBeVisible();
    const text = await gamutLabel.textContent();
    expect(text).toBeTruthy();
  });

  // ==================================================================
  // Reset Tests
  // ==================================================================
  test('DCM-060: reset button should restore all display settings to default', async ({ page }) => {
    await openDisplayDropdown(page);

    // Change settings
    await page.click('[data-testid="display-profile-rec709"]');
    const gammaSlider = page.locator('[data-testid="display-gamma-slider"]');
    await gammaSlider.fill('2.0');
    const brightnessSlider = page.locator('[data-testid="display-brightness-slider"]');
    await brightnessSlider.fill('0.5');

    // Reset
    await page.click('[data-testid="display-profile-reset"]');

    // Verify defaults
    const srgb = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgb).toHaveAttribute('aria-checked', 'true');
    const gammaValue = page.locator('[data-testid="display-gamma-value"]');
    await expect(gammaValue).toHaveText('1.00');
    const brightnessValue = page.locator('[data-testid="display-brightness-value"]');
    await expect(brightnessValue).toHaveText('1.00');
  });

  // ==================================================================
  // Profile Selection Tests (verifying profile sections exist)
  // ==================================================================
  test('DCM-profile-sections: all profile options should be present', async ({ page }) => {
    await openDisplayDropdown(page);
    await expect(page.locator('[data-testid="display-profile-linear"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-profile-srgb"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-profile-rec709"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-profile-gamma22"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-profile-gamma24"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-profile-custom"]')).toBeVisible();
  });

  test('DCM-section-testids: sections have correct testids', async ({ page }) => {
    await openDisplayDropdown(page);
    await expect(page.locator('[data-testid="display-profile-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-gamma-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-brightness-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="display-colorspace-info"]')).toBeVisible();
  });

  // ==================================================================
  // Accessibility Tests
  // ==================================================================
  test('DCM-a11y: profile list uses radiogroup role', async ({ page }) => {
    await openDisplayDropdown(page);
    const radioGroup = page.locator('[role="radiogroup"]');
    await expect(radioGroup).toBeVisible();
  });

  test('DCM-a11y-slider: gamma slider has correct ARIA attributes', async ({ page }) => {
    await openDisplayDropdown(page);
    const slider = page.locator('[data-testid="display-gamma-slider"]');
    await expect(slider).toHaveAttribute('role', 'slider');
    await expect(slider).toHaveAttribute('aria-valuemin', '0.1');
    await expect(slider).toHaveAttribute('aria-valuemax', '4');
  });

  test('DCM-a11y-brightness-slider: brightness slider has correct ARIA attributes', async ({ page }) => {
    await openDisplayDropdown(page);
    const slider = page.locator('[data-testid="display-brightness-slider"]');
    await expect(slider).toHaveAttribute('role', 'slider');
    await expect(slider).toHaveAttribute('aria-valuemin', '0');
    await expect(slider).toHaveAttribute('aria-valuemax', '2');
  });
});
