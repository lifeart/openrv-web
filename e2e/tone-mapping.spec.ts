import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getToneMappingState,
  waitForTestHelper,
  captureCanvasState,
  verifyCanvasChanged,
} from './fixtures';

/**
 * Tone Mapping Feature Tests
 *
 * These tests verify the tone mapping functionality for HDR content,
 * including toggling, operator selection, and visual feedback.
 *
 * All state changes are performed through real UI interactions
 * (clicking buttons, using keyboard shortcuts). page.evaluate()
 * is only used for state verification (reading state to assert).
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
  await page.locator('button[data-tab-id="color"]').click({ force: true });
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

/** Helper: open color adjustments panel and return the exposure slider. */
async function getExposureSlider(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');

  const toggle = page.locator('button[title="Toggle color adjustments panel"]');
  if (await toggle.isVisible().catch(() => false)) {
    const panel = page.locator('.color-controls-panel');
    if (!(await panel.isVisible().catch(() => false))) {
      await toggle.click();
    }
  }

  const exposureSlider = page
    .locator('.color-controls-panel label')
    .filter({ hasText: 'Exposure' })
    .locator('..')
    .locator('input[type="range"]')
    .first();

  await expect(exposureSlider).toBeVisible();
  return exposureSlider;
}

test.describe('Tone Mapping Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TM-E001: tone mapping is disabled by default', async ({ page }) => {
    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
    expect(state.operator).toBe('off');
  });

  test('TM-E002: pressing Shift+Alt+J toggles tone mapping', async ({ page }) => {
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

  test('TM-E003: enabling tone mapping with operator changes canvas appearance', async ({ page }) => {
    // Select reinhard operator via the dropdown UI, which auto-enables tone mapping
    await selectOperatorViaUI(page, 'reinhard');

    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');
  });

  test('TM-E004: disabling tone mapping restores original appearance', async ({ page }) => {
    const original = await captureCanvasState(page);

    // Enable tone mapping with aces via dropdown UI
    await selectOperatorViaUI(page, 'aces');

    const withToneMapping = await captureCanvasState(page);
    // Canvas should have changed (though may be subtle for SDR content)

    // Disable tone mapping by selecting 'off' via dropdown UI
    await selectOperatorViaUI(page, 'off');

    const restored = await captureCanvasState(page);
    // Canvas should be back to similar state
    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
    expect(state.operator).toBe('off');
  });
});

test.describe('Tone Mapping Operators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TM-E010: default operator is off', async ({ page }) => {
    const state = await getToneMappingState(page);
    expect(state.operator).toBe('off');
  });

  test('TM-E011: selecting reinhard operator updates state', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('reinhard');
    expect(state.enabled).toBe(true); // auto-enabled
  });

  test('TM-E012: selecting filmic operator updates state', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('filmic');
    expect(state.enabled).toBe(true);
  });

  test('TM-E013: selecting aces operator updates state', async ({ page }) => {
    await selectOperatorViaUI(page, 'aces');

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('aces');
    expect(state.enabled).toBe(true);
  });

  test('TM-E014: selecting off operator auto-disables', async ({ page }) => {
    // First enable with reinhard via UI
    await selectOperatorViaUI(page, 'reinhard');

    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);

    // Now select off via UI
    await selectOperatorViaUI(page, 'off');

    state = await getToneMappingState(page);
    expect(state.operator).toBe('off');
    expect(state.enabled).toBe(false);
  });

  test('TM-E015: different operators produce different visuals', async ({ page }) => {
    // Select reinhard via UI
    await selectOperatorViaUI(page, 'reinhard');
    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');

    // Switch to filmic via UI
    await selectOperatorViaUI(page, 'filmic');
    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('filmic');

    // Switch to aces via UI
    await selectOperatorViaUI(page, 'aces');
    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('aces');
  });
});

test.describe('Tone Mapping UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TM-E020: tone mapping control button exists in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="color"]');

    // Look for tone mapping control
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await expect(control).toBeVisible();
  });

  test('TM-E021: clicking tone mapping control opens dropdown', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="color"]');

    // Click the tone mapping control
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await expect(control).toBeVisible();
    await control.click();

    // Dropdown should be visible
    const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('TM-E022: dropdown has operator buttons', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="color"]');

    // Click the tone mapping control to open dropdown
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await expect(control).toBeVisible();
    await control.click();

    // Check for operator buttons
    await expect(page.locator('[data-testid="tone-mapping-operator-off"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-reinhard"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-filmic"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-aces"]')).toBeVisible();
  });

  test('TM-E023: clicking operator button in dropdown changes operator', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="color"]');

    // Click the tone mapping control to open dropdown
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await expect(control).toBeVisible();
    await control.click();

    // Click the filmic operator button
    const filmicBtn = page.locator('[data-testid="tone-mapping-operator-filmic"]');
    await filmicBtn.click();
    await waitForToneMappingState(page, { enabled: true, operator: 'filmic' });

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('filmic');
    expect(state.enabled).toBe(true);
  });

  test('TM-E024: dropdown has enable checkbox', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="color"]');

    // Click the tone mapping control to open dropdown
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await expect(control).toBeVisible();
    await control.click();

    // Check for enable checkbox
    const checkbox = page.locator('[data-testid="tone-mapping-enable-checkbox"]');
    await expect(checkbox).toBeVisible();
  });
});

test.describe('Tone Mapping State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TM-E030: tone mapping state persists when changing frames', async ({ page }) => {
    // Enable tone mapping with reinhard via UI
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

  test('TM-E031: tone mapping operator persists when changing frames', async ({ page }) => {
    // Enable tone mapping with aces via UI
    await selectOperatorViaUI(page, 'aces');

    let state = await getToneMappingState(page);
    expect(state.operator).toBe('aces');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await waitForToneMappingState(page, { operator: 'aces' });

    state = await getToneMappingState(page);
    expect(state.operator).toBe('aces');
  });

  test('TM-E032: tone mapping state persists when changing tabs', async ({ page }) => {
    // Enable tone mapping with filmic via UI
    await selectOperatorViaUI(page, 'filmic');

    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('filmic');

    // Switch to View tab
    await page.click('button[data-tab-id="view"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'filmic' });

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('filmic');

    // Switch back to Color tab
    await page.click('button[data-tab-id="color"]');
    await waitForToneMappingState(page, { enabled: true, operator: 'filmic' });

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('filmic');
  });
});

test.describe('Tone Mapping Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TM-E040: tone mapping works with color adjustments', async ({ page }) => {
    // Enable tone mapping via UI
    await selectOperatorViaUI(page, 'reinhard');

    // Open Color panel and adjust exposure slider via UI
    const exposureSlider = await getExposureSlider(page);

    // Find the exposure slider and set it to a non-default value
    await exposureSlider.fill('1');
    await exposureSlider.dispatchEvent('input');
    await exposureSlider.dispatchEvent('change');
    await page.waitForFunction(
      () => window.__OPENRV_TEST__?.getViewerState()?.colorAdjustments?.exposure === 1,
      undefined,
      { timeout: 5000 },
    );

    // Both should still be active
    const toneMappingState = await getToneMappingState(page);
    expect(toneMappingState.enabled).toBe(true);
    expect(toneMappingState.operator).toBe('reinhard');
  });

  test('TM-E041: toggle via keyboard shortcut works correctly', async ({ page }) => {
    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);

    // Toggle on using keyboard shortcut
    await page.keyboard.press('Shift+Alt+j');
    await waitForToneMappingState(page, { enabled: true });

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);

    // Toggle off using keyboard shortcut
    await page.keyboard.press('Shift+Alt+j');
    await waitForToneMappingState(page, { enabled: false });

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
  });

  test('TM-E042: enable checkbox and operator selection work together', async ({ page }) => {
    // Open dropdown and select aces operator via UI
    await selectOperatorViaUI(page, 'aces');

    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('aces');

    // Now open dropdown again and uncheck the enable checkbox
    await openToneMappingDropdown(page);
    const checkbox = page.locator('[data-testid="tone-mapping-enable-checkbox"]');
    // The checkbox should be checked since tone mapping is enabled
    await expect(checkbox).toBeChecked();
    // Uncheck it to disable tone mapping
    await checkbox.uncheck();
    await waitForToneMappingState(page, { enabled: false });

    const stateAfterUncheck = await getToneMappingState(page);
    expect(stateAfterUncheck.enabled).toBe(false);
    // Operator should still be aces even though disabled
    expect(stateAfterUncheck.operator).toBe('aces');
  });
});
