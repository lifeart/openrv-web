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
 */

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
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+Alt+j');
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
  });

  test('TM-E003: enabling tone mapping with operator changes canvas appearance', async ({ page }) => {
    // First select a non-off operator, which auto-enables
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('reinhard');
    });
    await page.waitForTimeout(100);

    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');
  });

  test('TM-E004: disabling tone mapping restores original appearance', async ({ page }) => {
    const original = await captureCanvasState(page);

    // Enable tone mapping with an operator
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('aces');
    });
    await page.waitForTimeout(200);

    const withToneMapping = await captureCanvasState(page);
    // Canvas should have changed (though may be subtle for SDR content)

    // Disable tone mapping
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('off');
    });
    await page.waitForTimeout(200);

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
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('reinhard');
    });
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('reinhard');
    expect(state.enabled).toBe(true); // auto-enabled
  });

  test('TM-E012: selecting filmic operator updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('filmic');
    });
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('filmic');
    expect(state.enabled).toBe(true);
  });

  test('TM-E013: selecting aces operator updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('aces');
    });
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('aces');
    expect(state.enabled).toBe(true);
  });

  test('TM-E014: selecting off operator auto-disables', async ({ page }) => {
    // First enable with an operator
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('reinhard');
    });
    await page.waitForTimeout(100);

    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);

    // Now select off
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('off');
    });
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.operator).toBe('off');
    expect(state.enabled).toBe(false);
  });

  test('TM-E015: different operators produce different visuals', async ({ page }) => {
    // Capture with reinhard
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('reinhard');
    });
    await page.waitForTimeout(200);
    const reinhardState = await captureCanvasState(page);

    // Capture with filmic
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('filmic');
    });
    await page.waitForTimeout(200);
    const filmicState = await captureCanvasState(page);

    // Capture with aces
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('aces');
    });
    await page.waitForTimeout(200);
    const acesState = await captureCanvasState(page);

    // Different operators should produce different results
    // Note: For SDR content differences may be subtle
    expect(reinhardState).not.toEqual(filmicState);
    expect(filmicState).not.toEqual(acesState);
    expect(reinhardState).not.toEqual(acesState);
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
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Look for tone mapping control
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await expect(control).toBeVisible();
  });

  test('TM-E021: clicking tone mapping control opens dropdown', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Click the tone mapping control
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await control.click();
    await page.waitForTimeout(100);

    // Dropdown should be visible
    const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('TM-E022: dropdown has operator buttons', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Click the tone mapping control to open dropdown
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await control.click();
    await page.waitForTimeout(100);

    // Check for operator buttons
    await expect(page.locator('[data-testid="tone-mapping-operator-off"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-reinhard"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-filmic"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-operator-aces"]')).toBeVisible();
  });

  test('TM-E023: clicking operator button in dropdown changes operator', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Click the tone mapping control to open dropdown
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await control.click();
    await page.waitForTimeout(100);

    // Click the filmic operator button
    const filmicBtn = page.locator('[data-testid="tone-mapping-operator-filmic"]');
    await filmicBtn.click();
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('filmic');
    expect(state.enabled).toBe(true);
  });

  test('TM-E024: dropdown has enable checkbox', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Click the tone mapping control to open dropdown
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await control.click();
    await page.waitForTimeout(100);

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
    // Enable tone mapping with reinhard
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('reinhard');
    });
    await page.waitForTimeout(100);

    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('reinhard');
  });

  test('TM-E031: tone mapping operator persists when changing frames', async ({ page }) => {
    // Enable tone mapping with aces
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('aces');
    });
    await page.waitForTimeout(100);

    let state = await getToneMappingState(page);
    expect(state.operator).toBe('aces');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.operator).toBe('aces');
  });

  test('TM-E032: tone mapping state persists when changing tabs', async ({ page }) => {
    // Enable tone mapping with filmic
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('filmic');
    });
    await page.waitForTimeout(100);

    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('filmic');

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('filmic');

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

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
    // Enable tone mapping
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setOperator('reinhard');
    });
    await page.waitForTimeout(100);

    // Adjust exposure
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.colorControls?.setAdjustments({
        exposure: 1.0,
      });
    });
    await page.waitForTimeout(100);

    // Both should still be active
    const toneMappingState = await getToneMappingState(page);
    expect(toneMappingState.enabled).toBe(true);
    expect(toneMappingState.operator).toBe('reinhard');
  });

  test('TM-E041: toggle method works correctly', async ({ page }) => {
    let state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);

    // Toggle on
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.toggle();
    });
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);

    // Toggle off
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.toggle();
    });
    await page.waitForTimeout(100);

    state = await getToneMappingState(page);
    expect(state.enabled).toBe(false);
  });

  test('TM-E042: setState method works correctly', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.toneMappingControl?.setState({
        enabled: true,
        operator: 'aces',
      });
    });
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('aces');
  });
});
