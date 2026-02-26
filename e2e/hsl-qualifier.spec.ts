import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getHSLQualifierState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * HSL Qualifier Tests
 *
 * Tests for HSL-based secondary color correction:
 * - HSL-001: Hue selection isolates specific color
 * - HSL-002: Saturation range filters by color intensity
 * - HSL-003: Luminance range filters by brightness
 * - HSL-004: Soft falloff creates smooth matte edges
 * - HSL-005: Matte preview shows selection accurately
 * - HSL-006: Invert selection works correctly
 * - HSL-007: Corrections apply only to selected region
 * - HSL-008: Hue wrap-around handles red correctly
 */

test.describe('HSL Qualifier', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(200);
    await page.click('button[data-tab-id="qc"]');
  });

  test.describe('Basic Functionality', () => {
    test('HSL qualifier should be disabled by default', async ({ page }) => {
      const state = await getHSLQualifierState(page);
      expect(state.enabled).toBe(false);
    });

    test('HSL qualifier toggle button should be visible', async ({ page }) => {
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await expect(toggleButton).toBeVisible();
    });

    test('clicking toggle button should open dropdown', async ({ page }) => {
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      const dropdown = page.locator('[data-testid="hsl-qualifier-dropdown"]');
      await expect(dropdown).toBeVisible();
    });

    test('enable checkbox should toggle HSL qualifier', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Enable HSL qualifier
      const enableCheckbox = page.locator('[data-testid="hsl-enable-checkbox"]');
      await enableCheckbox.check();
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.enabled).toBe(true);
    });

    test('Shift+H keyboard shortcut should toggle HSL qualifier', async ({ page }) => {
      // Verify disabled initially
      let state = await getHSLQualifierState(page);
      expect(state.enabled).toBe(false);

      // Press Shift+H to enable
      await page.keyboard.press('Shift+H');
      await page.waitForTimeout(100);

      state = await getHSLQualifierState(page);
      expect(state.enabled).toBe(true);

      // Press Shift+H again to disable
      await page.keyboard.press('Shift+H');
      await page.waitForTimeout(100);

      state = await getHSLQualifierState(page);
      expect(state.enabled).toBe(false);
    });
  });

  test.describe('HSL Range Controls', () => {
    test('hue slider should update hue center value', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Adjust hue center slider
      const hueSlider = page.locator('[data-testid="hsl-hue-center"]');
      await hueSlider.fill('180');
      await hueSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.hue.center).toBe(180);
    });

    test('hue width slider should update selection width', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Adjust hue width slider
      const widthSlider = page.locator('[data-testid="hsl-hue-width"]');
      await widthSlider.fill('60');
      await widthSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.hue.width).toBe(60);
    });

    test('saturation center slider should update value', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Adjust saturation center slider
      const satSlider = page.locator('[data-testid="hsl-saturation-center"]');
      await satSlider.fill('75');
      await satSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.saturation.center).toBe(75);
    });

    test('luminance center slider should update value', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Adjust luminance center slider
      const lumSlider = page.locator('[data-testid="hsl-luminance-center"]');
      await lumSlider.fill('25');
      await lumSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.luminance.center).toBe(25);
    });
  });

  test.describe('Correction Controls', () => {
    test('hue shift slider should update correction value', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Adjust hue shift
      const hueShiftSlider = page.locator('[data-testid="hsl-correction-hueShift"]');
      await hueShiftSlider.fill('45');
      await hueShiftSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.correction.hueShift).toBe(45);
    });

    test('saturation scale slider should update correction value', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Adjust saturation scale
      const satScaleSlider = page.locator('[data-testid="hsl-correction-saturationScale"]');
      await satScaleSlider.fill('1.5');
      await satScaleSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.correction.saturationScale).toBe(1.5);
    });

    test('luminance scale slider should update correction value', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Adjust luminance scale
      const lumScaleSlider = page.locator('[data-testid="hsl-correction-luminanceScale"]');
      await lumScaleSlider.fill('0.8');
      await lumScaleSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.correction.luminanceScale).toBe(0.8);
    });
  });

  test.describe('Options', () => {
    test('invert checkbox should toggle invert mode', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Toggle invert
      const invertCheckbox = page.locator('[data-testid="hsl-invert-checkbox"]');
      await invertCheckbox.check();
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.invert).toBe(true);
    });

    test('HSL-005: matte preview checkbox should toggle matte preview mode', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Toggle matte preview
      const matteCheckbox = page.locator('[data-testid="hsl-matte-checkbox"]');
      await matteCheckbox.check();
      await page.waitForTimeout(100);

      const state = await getHSLQualifierState(page);
      expect(state.mattePreview).toBe(true);
    });
  });

  test.describe('Reset', () => {
    test('reset button should restore default values', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Make some changes
      const hueSlider = page.locator('[data-testid="hsl-hue-center"]');
      await hueSlider.fill('180');
      await hueSlider.dispatchEvent('input');

      const hueShiftSlider = page.locator('[data-testid="hsl-correction-hueShift"]');
      await hueShiftSlider.fill('60');
      await hueShiftSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Verify changes were made
      let state = await getHSLQualifierState(page);
      expect(state.hue.center).toBe(180);
      expect(state.correction.hueShift).toBe(60);

      // Click reset
      const resetButton = page.locator('[data-testid="hsl-reset-button"]');
      await resetButton.click();
      await page.waitForTimeout(100);

      // Verify reset to defaults
      state = await getHSLQualifierState(page);
      expect(state.hue.center).toBe(0);
      expect(state.correction.hueShift).toBe(0);
    });
  });

  test.describe('Visual Effects', () => {
    test('HSL-007: enabling HSL qualifier with corrections should change canvas appearance', async ({ page }) => {
      // Take initial screenshot
      const initialScreenshot = await captureViewerScreenshot(page);

      // Open dropdown and enable with strong corrections
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Enable HSL qualifier
      const enableCheckbox = page.locator('[data-testid="hsl-enable-checkbox"]');
      await enableCheckbox.check();
      await page.waitForTimeout(100);

      // Set wide selection (to affect most of the image)
      const satSlider = page.locator('[data-testid="hsl-saturation-center"]');
      await satSlider.fill('50');
      await satSlider.dispatchEvent('input');

      const satWidthSlider = page.locator('[data-testid="hsl-saturation-width"]');
      await satWidthSlider.fill('100');
      await satWidthSlider.dispatchEvent('input');

      // Apply strong hue shift
      const hueShiftSlider = page.locator('[data-testid="hsl-correction-hueShift"]');
      await hueShiftSlider.fill('90');
      await hueShiftSlider.dispatchEvent('input');
      await page.waitForTimeout(300);

      // Take screenshot after enabling
      const afterScreenshot = await captureViewerScreenshot(page);

      // Canvas should look different
      expect(imagesAreDifferent(initialScreenshot, afterScreenshot)).toBe(true);
    });

    test('matte preview should show grayscale selection mask', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Enable HSL qualifier
      const enableCheckbox = page.locator('[data-testid="hsl-enable-checkbox"]');
      await enableCheckbox.check();
      await page.waitForTimeout(100);

      // Take screenshot before matte preview
      const beforeMatte = await captureViewerScreenshot(page);

      // Enable matte preview
      const matteCheckbox = page.locator('[data-testid="hsl-matte-checkbox"]');
      await matteCheckbox.check();
      await page.waitForTimeout(300);

      // Take screenshot after matte preview
      const afterMatte = await captureViewerScreenshot(page);

      // Matte preview should look different (grayscale instead of color)
      expect(imagesAreDifferent(beforeMatte, afterMatte)).toBe(true);
    });

    test('HSL-006: invert should create opposite selection', async ({ page }) => {
      // Open dropdown and enable
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      const enableCheckbox = page.locator('[data-testid="hsl-enable-checkbox"]');
      await enableCheckbox.check();
      await page.waitForTimeout(100);

      // Enable matte preview to visualize selection
      const matteCheckbox = page.locator('[data-testid="hsl-matte-checkbox"]');
      await matteCheckbox.check();
      await page.waitForTimeout(200);

      // Take screenshot of normal selection
      const normalSelection = await captureViewerScreenshot(page);

      // Enable invert
      const invertCheckbox = page.locator('[data-testid="hsl-invert-checkbox"]');
      await invertCheckbox.check();
      await page.waitForTimeout(200);

      // Take screenshot of inverted selection
      const invertedSelection = await captureViewerScreenshot(page);

      // Inverted selection should look different
      expect(imagesAreDifferent(normalSelection, invertedSelection)).toBe(true);
    });
  });

  test.describe('Eyedropper', () => {
    test('eyedropper button should be visible in dropdown', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      const eyedropperButton = page.locator('[data-testid="hsl-eyedropper-button"]');
      await expect(eyedropperButton).toBeVisible();
    });
  });

  test.describe('Persistence', () => {
    test('state should persist when closing and reopening dropdown', async ({ page }) => {
      // Open dropdown
      const toggleButton = page.locator('[data-testid="hsl-qualifier-control-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Make changes
      const hueSlider = page.locator('[data-testid="hsl-hue-center"]');
      await hueSlider.fill('120');
      await hueSlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Close dropdown by clicking outside
      await page.click('body', { position: { x: 10, y: 10 } });
      await page.waitForTimeout(100);

      // Reopen dropdown
      await toggleButton.click();
      await page.waitForTimeout(100);

      // Verify state persists
      const state = await getHSLQualifierState(page);
      expect(state.hue.center).toBe(120);
    });
  });
});
