import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getToneMappingState,
  waitForTestHelper,
  captureCanvasState,
} from './fixtures';

/**
 * HDR Tone Mapping Operators - E2E Integration Tests
 *
 * Tests verify:
 * - Tone mapping dropdown is visible and functional
 * - Enabling tone mapping visually changes the canvas
 * - Different operators produce different visual results
 * - Disabling tone mapping restores original appearance
 * - Tone mapping integrates correctly with color adjustments
 */

/** Wait for tone mapping state to match expected values */
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

/** Helper: Navigate to View tab and open the tone mapping dropdown. */
async function openToneMappingDropdown(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="view"]');
  const control = page.locator('[data-testid="tone-mapping-control-button"]');
  await expect(control).toBeVisible();
  await control.click();
  const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
  await expect(dropdown).toBeVisible();
}

/** Helper: Select a tone mapping operator via the dropdown UI. */
async function selectOperatorViaUI(
  page: import('@playwright/test').Page,
  operator: 'off' | 'reinhard' | 'filmic' | 'aces',
) {
  await openToneMappingDropdown(page);
  await page.click(`[data-testid="tone-mapping-operator-${operator}"]`);
  const expectedEnabled = operator !== 'off';
  await waitForToneMappingState(page, { enabled: expectedEnabled, operator });
}

test.describe('HDR Tone Mapping Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HDRTM-E001: tone mapping dropdown is visible in View tab', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');

    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await expect(control).toBeVisible();
  });

  test('HDRTM-E002: enabling reinhard tone mapping changes canvas', async ({ page }) => {
    const original = await captureCanvasState(page);

    await selectOperatorViaUI(page, 'reinhard');

    const withToneMapping = await captureCanvasState(page);

    // Verify state is correct
    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');

    // Canvas should have changed
    expect(original).not.toEqual(withToneMapping);
  });

  test('HDRTM-E003: different operators produce different results', async ({ page }) => {
    // Capture with reinhard
    await selectOperatorViaUI(page, 'reinhard');
    const reinhardState = await captureCanvasState(page);

    // Capture with filmic
    await selectOperatorViaUI(page, 'filmic');
    const filmicState = await captureCanvasState(page);

    // Capture with aces
    await selectOperatorViaUI(page, 'aces');
    const acesState = await captureCanvasState(page);

    // Different operators should produce different results
    expect(reinhardState).not.toEqual(filmicState);
    expect(filmicState).not.toEqual(acesState);
    expect(reinhardState).not.toEqual(acesState);
  });

  test('HDRTM-E004: disabling tone mapping restores original appearance', async ({ page }) => {
    const original = await captureCanvasState(page);

    // Enable tone mapping
    await selectOperatorViaUI(page, 'aces');

    // Disable tone mapping
    await selectOperatorViaUI(page, 'off');

    const restored = await captureCanvasState(page);

    // Should be back to original
    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
    expect(state.operator).toBe('off');
    expect(original).toEqual(restored);
  });

  test('HDRTM-E005: tone mapping with exposure produces compound effect', async ({ page }) => {
    // Capture baseline
    const baseline = await captureCanvasState(page);

    // Adjust exposure via Color tab
    await page.click('button[data-tab-id="color"]');
    const exposureSlider = page.locator('[data-testid="slider-exposure"]');
    await expect(exposureSlider).toBeVisible();
    await exposureSlider.fill('1');
    await exposureSlider.dispatchEvent('input');
    await exposureSlider.dispatchEvent('change');
    await page.waitForFunction(
      () => window.__OPENRV_TEST__?.getViewerState()?.colorAdjustments?.exposure === 1,
      undefined,
      { timeout: 5000 },
    );
    const exposureOnly = await captureCanvasState(page);

    // Enable reinhard tone mapping
    await selectOperatorViaUI(page, 'reinhard');
    const exposurePlusToneMap = await captureCanvasState(page);

    // All three states should differ
    expect(baseline).not.toEqual(exposureOnly);
    expect(exposureOnly).not.toEqual(exposurePlusToneMap);
    expect(baseline).not.toEqual(exposurePlusToneMap);
  });

  test('HDRTM-E006: tone mapping state persists when changing frames', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');

    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await waitForToneMappingState(page, { enabled: true, operator: 'reinhard' });

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');
  });

  test('HDRTM-E007: Shift+Alt+J toggles tone mapping on/off', async ({ page }) => {
    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+Alt+j');
    await waitForToneMappingState(page, { enabled: true });

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+Alt+j');
    await waitForToneMappingState(page, { enabled: false });

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
  });

  test('HDRTM-E008: dropdown has all operator buttons', async ({ page }) => {
    await openToneMappingDropdown(page);

    await expect(page.locator('[data-testid="tone-mapping-operator-off"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-reinhard"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-filmic"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-aces"]')).toBeVisible();
  });

  test('HDRTM-E009: enable checkbox toggles tone mapping', async ({ page }) => {
    // Select aces first to enable tone mapping
    await selectOperatorViaUI(page, 'aces');

    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);

    // Open dropdown and uncheck
    await openToneMappingDropdown(page);
    const checkbox = page.locator('[data-testid="tone-mapping-enable-checkbox"]');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await waitForToneMappingState(page, { enabled: false });

    const stateAfter = await getToneMappingState(page);
    expect(stateAfter.enabled).toBe(false);
    // Operator should still be aces even though disabled
    expect(stateAfter.operator).toBe('aces');
  });
});
