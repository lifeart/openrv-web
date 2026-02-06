import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  captureCanvasState,
} from './fixtures';

/**
 * Tone Mapping Per-Operator Parameters E2E Tests
 *
 * These tests verify the per-operator parameter sliders feature for tone mapping:
 * - Reinhard: "White Point" slider (range 0.5 - 10.0, default 4.0)
 * - Filmic: "Exposure Bias" slider (range 0.5 - 8.0, default 2.0)
 *           "White Point" slider (range 2.0 - 20.0, default 11.2)
 * - ACES: No per-operator parameter sliders
 * - Off: No per-operator parameter sliders
 *
 * All state changes are performed through real UI interactions
 * (clicking buttons, adjusting sliders). page.evaluate() is only
 * used for state verification (reading state to assert).
 */

/**
 * Wait for tone mapping state to match expected values
 */
async function waitForToneMappingState(
  page: import('@playwright/test').Page,
  expected: { enabled?: boolean; operator?: string },
) {
  await page.waitForFunction(
    (exp) => {
      const state = window.__OPENRV_TEST__?.getToneMappingState();
      if (!state) return false;
      if (exp.enabled !== undefined && state.enabled !== exp.enabled) return false;
      if (exp.operator !== undefined && state.operator !== exp.operator) return false;
      return true;
    },
    expected,
    { timeout: 5000 },
  );
}

/**
 * Helper: Navigate to View tab and open the tone mapping dropdown.
 * Returns after the dropdown is visible.
 */
async function openToneMappingDropdown(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="view"]');
  const control = page.locator('[data-testid="tone-mapping-control-button"]');
  await expect(control).toBeVisible();
  await control.click();
  const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
  await expect(dropdown).toBeVisible();
}

/**
 * Helper: Select a tone mapping operator via the dropdown UI.
 * Opens the View tab, opens the dropdown, then clicks the operator button.
 */
async function selectOperatorViaUI(
  page: import('@playwright/test').Page,
  operator: 'off' | 'reinhard' | 'filmic' | 'aces',
) {
  await openToneMappingDropdown(page);
  await page.click(`[data-testid="tone-mapping-operator-${operator}"]`);
  const expectedEnabled = operator !== 'off';
  await waitForToneMappingState(page, { enabled: expectedEnabled, operator });
}

/**
 * Helper: Locate the parameter section container within the dropdown.
 */
function getParamsSection(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="tone-mapping-params"]');
}

/**
 * Helper: Find a slider (input[type="range"]) inside the params section
 * that is associated with a given label text.
 * The component renders a label span followed by a sibling input slider
 * within the same parent row.
 */
function getParamSliderByLabel(page: import('@playwright/test').Page, label: string) {
  // Each param row contains a label span with the label text and an input[type="range"]
  // We locate the params section, then find the row containing the label text
  return page
    .locator('[data-testid="tone-mapping-params"]')
    .locator(`xpath=.//div[.//span[text()="${label}"]]//input[@type="range"]`);
}

/**
 * Helper: Get the displayed value text for a param slider by its label.
 * The value span is the second span in the label row (sibling of the label span).
 */
function getParamValueByLabel(page: import('@playwright/test').Page, label: string) {
  return page
    .locator('[data-testid="tone-mapping-params"]')
    .locator(`xpath=.//div[.//span[text()="${label}"]]//span[2]`);
}

test.describe('Tone Mapping Parameters - Reinhard Operator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E001: Reinhard operator shows White Point slider', async ({ page }) => {
    // Select reinhard operator via UI
    await selectOperatorViaUI(page, 'reinhard');

    // Open dropdown to inspect parameters
    await openToneMappingDropdown(page);

    // The parameter section should be visible
    const paramsSection = getParamsSection(page);
    await expect(paramsSection).toBeVisible();

    // A "White Point" slider should be present
    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await expect(whitePointSlider).toBeVisible();
  });

  test('TMP-E002: Reinhard White Point slider has correct default value', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    const value = await whitePointSlider.inputValue();
    // Default Reinhard white point is 4.0
    expect(parseFloat(value)).toBeCloseTo(4.0, 1);
  });

  test('TMP-E003: Reinhard White Point displayed value matches slider', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const valueDisplay = getParamValueByLabel(page, 'White Point');
    const displayText = await valueDisplay.textContent();
    expect(displayText).toBe('4.0');
  });

  test('TMP-E004: Reinhard does not show Exposure Bias slider', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    // Exposure Bias should NOT be present for Reinhard
    const exposureBiasSlider = getParamSliderByLabel(page, 'Exposure Bias');
    await expect(exposureBiasSlider).toHaveCount(0);
  });
});

test.describe('Tone Mapping Parameters - Filmic Operator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E010: Filmic operator shows Exposure Bias slider', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const paramsSection = getParamsSection(page);
    await expect(paramsSection).toBeVisible();

    const exposureBiasSlider = getParamSliderByLabel(page, 'Exposure Bias');
    await expect(exposureBiasSlider).toBeVisible();
  });

  test('TMP-E011: Filmic operator shows White Point slider', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await expect(whitePointSlider).toBeVisible();
  });

  test('TMP-E012: Filmic Exposure Bias has correct default value', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'Exposure Bias');
    const value = await slider.inputValue();
    // Default Filmic exposure bias is 2.0
    expect(parseFloat(value)).toBeCloseTo(2.0, 1);
  });

  test('TMP-E013: Filmic White Point has correct default value', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'White Point');
    const value = await slider.inputValue();
    // Default Filmic white point is 11.2
    expect(parseFloat(value)).toBeCloseTo(11.2, 1);
  });

  test('TMP-E014: Filmic shows both Exposure Bias and White Point sliders simultaneously', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const exposureBiasSlider = getParamSliderByLabel(page, 'Exposure Bias');
    const whitePointSlider = getParamSliderByLabel(page, 'White Point');

    await expect(exposureBiasSlider).toBeVisible();
    await expect(whitePointSlider).toBeVisible();
  });
});

test.describe('Tone Mapping Parameters - ACES Operator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E020: ACES operator shows no extra parameter sliders', async ({ page }) => {
    await selectOperatorViaUI(page, 'aces');
    await openToneMappingDropdown(page);

    // The parameter section should be hidden (display: none) for ACES
    const paramsSection = getParamsSection(page);
    await expect(paramsSection).toBeHidden();
  });

  test('TMP-E021: ACES has no White Point slider', async ({ page }) => {
    await selectOperatorViaUI(page, 'aces');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'White Point');
    await expect(slider).toHaveCount(0);
  });

  test('TMP-E022: ACES has no Exposure Bias slider', async ({ page }) => {
    await selectOperatorViaUI(page, 'aces');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'Exposure Bias');
    await expect(slider).toHaveCount(0);
  });
});

test.describe('Tone Mapping Parameters - Off Operator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E025: Off operator shows no parameter sliders', async ({ page }) => {
    // First enable an operator, then switch to off
    await selectOperatorViaUI(page, 'reinhard');
    await selectOperatorViaUI(page, 'off');
    await openToneMappingDropdown(page);

    const paramsSection = getParamsSection(page);
    await expect(paramsSection).toBeHidden();
  });
});

test.describe('Tone Mapping Parameters - Switching Operators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E030: switching from Reinhard to Filmic changes visible parameters', async ({ page }) => {
    // Select Reinhard first
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    // Reinhard shows only White Point
    const reinhardWhitePoint = getParamSliderByLabel(page, 'White Point');
    await expect(reinhardWhitePoint).toBeVisible();
    const reinhardExposureBias = getParamSliderByLabel(page, 'Exposure Bias');
    await expect(reinhardExposureBias).toHaveCount(0);

    // Switch to Filmic within the open dropdown
    await page.click('[data-testid="tone-mapping-operator-filmic"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'filmic' });

    // Filmic shows Exposure Bias and White Point
    const filmicExposureBias = getParamSliderByLabel(page, 'Exposure Bias');
    await expect(filmicExposureBias).toBeVisible();
    const filmicWhitePoint = getParamSliderByLabel(page, 'White Point');
    await expect(filmicWhitePoint).toBeVisible();
  });

  test('TMP-E031: switching from Filmic to ACES hides parameter sliders', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    // Filmic has visible params
    const paramsSection = getParamsSection(page);
    await expect(paramsSection).toBeVisible();

    // Switch to ACES
    await page.click('[data-testid="tone-mapping-operator-aces"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'aces' });

    // ACES hides the params section
    await expect(paramsSection).toBeHidden();
  });

  test('TMP-E032: switching from ACES to Reinhard shows parameter sliders', async ({ page }) => {
    await selectOperatorViaUI(page, 'aces');
    await openToneMappingDropdown(page);

    const paramsSection = getParamsSection(page);
    await expect(paramsSection).toBeHidden();

    // Switch to Reinhard
    await page.click('[data-testid="tone-mapping-operator-reinhard"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'reinhard' });

    await expect(paramsSection).toBeVisible();
    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await expect(whitePointSlider).toBeVisible();
  });

  test('TMP-E033: switching to Off from Filmic hides parameter sliders', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const paramsSection = getParamsSection(page);
    await expect(paramsSection).toBeVisible();

    // Switch to Off
    await page.click('[data-testid="tone-mapping-operator-off"]');
    await waitForToneMappingState(page, { enabled: false, operator: 'off' });

    await expect(paramsSection).toBeHidden();
  });
});

test.describe('Tone Mapping Parameters - Value Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E040: Reinhard white point value persists after switching away and back', async ({ page }) => {
    // Select Reinhard and change white point
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await whitePointSlider.fill('7.5');
    await whitePointSlider.dispatchEvent('input');

    // Verify value changed
    const valueDisplay = getParamValueByLabel(page, 'White Point');
    const displayText = await valueDisplay.textContent();
    expect(displayText).toBe('7.5');

    // Switch to ACES
    await page.click('[data-testid="tone-mapping-operator-aces"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'aces' });

    // Switch back to Reinhard
    await page.click('[data-testid="tone-mapping-operator-reinhard"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'reinhard' });

    // White point should retain the value we set
    const restoredSlider = getParamSliderByLabel(page, 'White Point');
    const restoredValue = await restoredSlider.inputValue();
    expect(parseFloat(restoredValue)).toBeCloseTo(7.5, 1);
  });

  test('TMP-E041: Filmic exposure bias persists after switching away and back', async ({ page }) => {
    // Select Filmic and change exposure bias
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const exposureBiasSlider = getParamSliderByLabel(page, 'Exposure Bias');
    await exposureBiasSlider.fill('5.0');
    await exposureBiasSlider.dispatchEvent('input');

    // Switch to Reinhard
    await page.click('[data-testid="tone-mapping-operator-reinhard"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'reinhard' });

    // Switch back to Filmic
    await page.click('[data-testid="tone-mapping-operator-filmic"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'filmic' });

    // Exposure bias should retain the value we set
    const restoredSlider = getParamSliderByLabel(page, 'Exposure Bias');
    const restoredValue = await restoredSlider.inputValue();
    expect(parseFloat(restoredValue)).toBeCloseTo(5.0, 1);
  });

  test('TMP-E042: Filmic white point persists after switching away and back', async ({ page }) => {
    // Select Filmic and change white point
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await whitePointSlider.fill('15.0');
    await whitePointSlider.dispatchEvent('input');

    // Switch to ACES
    await page.click('[data-testid="tone-mapping-operator-aces"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'aces' });

    // Switch back to Filmic
    await page.click('[data-testid="tone-mapping-operator-filmic"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'filmic' });

    // White point should retain the value we set
    const restoredSlider = getParamSliderByLabel(page, 'White Point');
    const restoredValue = await restoredSlider.inputValue();
    expect(parseFloat(restoredValue)).toBeCloseTo(15.0, 1);
  });

  test('TMP-E043: parameter values persist across dropdown close/open', async ({ page }) => {
    // Select Reinhard and change white point
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await whitePointSlider.fill('6.0');
    await whitePointSlider.dispatchEvent('input');

    // Close dropdown by clicking outside
    await page.click('canvas');
    await page.waitForTimeout(200);

    // Re-open dropdown
    await openToneMappingDropdown(page);

    // Slider value should still be 6.0
    const restoredSlider = getParamSliderByLabel(page, 'White Point');
    const restoredValue = await restoredSlider.inputValue();
    expect(parseFloat(restoredValue)).toBeCloseTo(6.0, 1);
  });
});

test.describe('Tone Mapping Parameters - Visual Impact', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E050: changing Reinhard white point affects rendered output', async ({ page }) => {
    // Select Reinhard with default params
    await selectOperatorViaUI(page, 'reinhard');
    await page.waitForTimeout(300);

    // Capture screenshot with default white point (4.0)
    const screenshotDefault = await captureViewerScreenshot(page);

    // Open dropdown and change white point
    await openToneMappingDropdown(page);
    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await whitePointSlider.fill('1.0');
    await whitePointSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    // Capture screenshot with modified white point
    const screenshotModified = await captureViewerScreenshot(page);

    // The two screenshots should differ
    expect(imagesAreDifferent(screenshotDefault, screenshotModified)).toBe(true);
  });

  test('TMP-E051: changing Filmic exposure bias affects rendered output', async ({ page }) => {
    // Select Filmic with default params
    await selectOperatorViaUI(page, 'filmic');
    await page.waitForTimeout(300);

    // Capture screenshot with default exposure bias (2.0)
    const screenshotDefault = await captureViewerScreenshot(page);

    // Open dropdown and change exposure bias
    await openToneMappingDropdown(page);
    const slider = getParamSliderByLabel(page, 'Exposure Bias');
    await slider.fill('7.0');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(300);

    // Capture screenshot with modified exposure bias
    const screenshotModified = await captureViewerScreenshot(page);

    // The two screenshots should differ
    expect(imagesAreDifferent(screenshotDefault, screenshotModified)).toBe(true);
  });

  test('TMP-E052: changing Filmic white point affects rendered output', async ({ page }) => {
    // Select Filmic with default params
    await selectOperatorViaUI(page, 'filmic');
    await page.waitForTimeout(300);

    // Capture screenshot with default white point (11.2)
    const screenshotDefault = await captureViewerScreenshot(page);

    // Open dropdown and change white point
    await openToneMappingDropdown(page);
    const slider = getParamSliderByLabel(page, 'White Point');
    await slider.fill('3.0');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(300);

    // Capture screenshot with modified white point
    const screenshotModified = await captureViewerScreenshot(page);

    // The two screenshots should differ
    expect(imagesAreDifferent(screenshotDefault, screenshotModified)).toBe(true);
  });

  test('TMP-E053: different Reinhard white point values produce different visuals', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    // Set white point to 1.0 (low)
    const slider = getParamSliderByLabel(page, 'White Point');
    await slider.fill('1.0');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(300);
    const canvasStateLow = await captureCanvasState(page);

    // Set white point to 10.0 (high)
    await slider.fill('10.0');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(300);
    const canvasStateHigh = await captureCanvasState(page);

    // Low and high white point values should produce different canvas states
    expect(canvasStateLow).not.toEqual(canvasStateHigh);
  });
});

test.describe('Tone Mapping Parameters - Reset Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E060: disabling and re-enabling tone mapping preserves parameter values', async ({ page }) => {
    // Select Reinhard and modify white point
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const whitePointSlider = getParamSliderByLabel(page, 'White Point');
    await whitePointSlider.fill('8.0');
    await whitePointSlider.dispatchEvent('input');

    // Disable tone mapping via checkbox
    const checkbox = page.locator('[data-testid="tone-mapping-enable-checkbox"]');
    await checkbox.uncheck();
    await waitForToneMappingState(page, { enabled: false });

    // Re-enable tone mapping via checkbox
    await checkbox.check();
    await waitForToneMappingState(page, { enabled: true });

    // White point should still be 8.0
    const restoredSlider = getParamSliderByLabel(page, 'White Point');
    const restoredValue = await restoredSlider.inputValue();
    expect(parseFloat(restoredValue)).toBeCloseTo(8.0, 1);
  });

  test('TMP-E061: toggling tone mapping with keyboard preserves parameter values', async ({ page }) => {
    // Select Filmic and modify exposure bias
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'Exposure Bias');
    await slider.fill('6.0');
    await slider.dispatchEvent('input');

    // Close dropdown
    await page.click('canvas');
    await page.waitForTimeout(200);

    // Toggle off with keyboard shortcut
    await page.keyboard.press('Shift+Alt+j');
    await waitForToneMappingState(page, { enabled: false });

    // Toggle back on with keyboard shortcut
    await page.keyboard.press('Shift+Alt+j');
    await waitForToneMappingState(page, { enabled: true });

    // Open dropdown to verify
    await openToneMappingDropdown(page);
    const restoredSlider = getParamSliderByLabel(page, 'Exposure Bias');
    const restoredValue = await restoredSlider.inputValue();
    expect(parseFloat(restoredValue)).toBeCloseTo(6.0, 1);
  });
});

test.describe('Tone Mapping Parameters - Slider Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TMP-E070: Reinhard White Point slider has correct min/max/step attributes', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'White Point');
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');
    const step = await slider.getAttribute('step');

    expect(parseFloat(min!)).toBe(0.5);
    expect(parseFloat(max!)).toBe(10.0);
    expect(parseFloat(step!)).toBe(0.1);
  });

  test('TMP-E071: Filmic Exposure Bias slider has correct min/max/step attributes', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'Exposure Bias');
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');
    const step = await slider.getAttribute('step');

    expect(parseFloat(min!)).toBe(0.5);
    expect(parseFloat(max!)).toBe(8.0);
    expect(parseFloat(step!)).toBe(0.1);
  });

  test('TMP-E072: Filmic White Point slider has correct min/max/step attributes', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'White Point');
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');
    const step = await slider.getAttribute('step');

    expect(parseFloat(min!)).toBe(2.0);
    expect(parseFloat(max!)).toBe(20.0);
    expect(parseFloat(step!)).toBe(0.1);
  });

  test('TMP-E073: adjusting slider updates displayed value in real time', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const slider = getParamSliderByLabel(page, 'White Point');
    const valueDisplay = getParamValueByLabel(page, 'White Point');

    // Set to a new value
    await slider.fill('5.5');
    await slider.dispatchEvent('input');

    const displayText = await valueDisplay.textContent();
    expect(displayText).toBe('5.5');

    // Set to another value
    await slider.fill('2.3');
    await slider.dispatchEvent('input');

    const displayText2 = await valueDisplay.textContent();
    expect(displayText2).toBe('2.3');
  });

  test('TMP-E074: parameter section header changes with operator', async ({ page }) => {
    // Select Reinhard and check header
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const paramsSection = getParamsSection(page);
    const reinhardHeader = await paramsSection.textContent();
    expect(reinhardHeader).toContain('Reinhard Parameters');

    // Switch to Filmic and check header
    await page.click('[data-testid="tone-mapping-operator-filmic"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'filmic' });

    const filmicHeader = await paramsSection.textContent();
    expect(filmicHeader).toContain('Filmic Parameters');
  });
});
