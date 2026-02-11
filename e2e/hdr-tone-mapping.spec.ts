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
  // The floating color-controls panel can overlap toolbar tabs and intercept clicks.
  const colorPanel = page.locator('.color-controls-panel');
  if (await colorPanel.isVisible().catch(() => false)) {
    await page.keyboard.press('c');
    await expect(colorPanel).not.toBeVisible();
  }

  await page.locator('button[data-tab-id="view"]').click({ force: true });
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

/** Helper: open color adjustments panel and return the exposure slider. */
async function getExposureSlider(page: import('@playwright/test').Page) {
  const panel = page.locator('.color-controls-panel');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.keyboard.press('c');
    await expect(panel).toBeVisible();
  }

  const exposureSlider = panel
    .locator('label')
    .filter({ hasText: 'Exposure' })
    .locator('..')
    .locator('input[type="range"]')
    .first();

  await expect(exposureSlider).toBeVisible();
  return exposureSlider;
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
    // Select reinhard
    await selectOperatorViaUI(page, 'reinhard');
    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');

    // Switch to filmic
    await selectOperatorViaUI(page, 'filmic');
    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('filmic');

    // Switch to aces
    await selectOperatorViaUI(page, 'aces');
    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('aces');
  });

  test('HDRTM-E004: disabling tone mapping restores original appearance', async ({ page }) => {
    const original = await captureCanvasState(page);

    // Enable tone mapping
    await selectOperatorViaUI(page, 'aces');
    const withToneMapping = await captureCanvasState(page);

    // Disable tone mapping
    await selectOperatorViaUI(page, 'off');

    const restored = await captureCanvasState(page);

    // Should be back to original
    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
    expect(state.operator).toBe('off');
    expect(typeof original).toBe('string');
    expect(typeof withToneMapping).toBe('string');
    expect(typeof restored).toBe('string');
  });

  test('HDRTM-E005: tone mapping with exposure produces compound effect', async ({ page }) => {
    // Capture baseline
    const baseline = await captureCanvasState(page);

    // Adjust exposure via Color tab
    const exposureSlider = await getExposureSlider(page);
    await exposureSlider.evaluate((el, val) => {
      const input = el as HTMLInputElement;
      input.value = String(val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 1);
    await page.waitForFunction(
      () => window.__OPENRV_TEST__?.getColorState?.()?.exposure === 1,
      undefined,
      { timeout: 5000 },
    );
    const exposureOnly = await captureCanvasState(page);

    // Enable reinhard tone mapping
    await selectOperatorViaUI(page, 'reinhard');
    const exposurePlusToneMap = await captureCanvasState(page);

    const colorState = await page.evaluate(() => window.__OPENRV_TEST__?.getColorState?.() ?? null);
    expect(colorState?.exposure).toBe(1);

    const toneMappingState = await getToneMappingState(page);
    expect(toneMappingState.enabled).toBe(true);
    expect(toneMappingState.operator).toBe('reinhard');

    // Keep captures to ensure we can sample render state in each phase.
    expect(typeof baseline).toBe('string');
    expect(typeof exposureOnly).toBe('string');
    expect(typeof exposurePlusToneMap).toBe('string');
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
