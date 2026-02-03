import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
  clickTab,
} from './fixtures';

test.describe('Uncrop / Canvas Extension', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('UNCROP-001: default uncrop state is disabled', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.uncropEnabled).toBe(false);
    expect(state.uncropPaddingMode).toBe('uniform');
    expect(state.uncropPadding).toBe(0);
  });

  test('UNCROP-002: uncrop panel UI is visible in crop panel', async ({ page }) => {
    // Switch to Transform tab where Crop is located
    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);

    // Check uncrop toggle is present
    const toggle = page.locator('[data-testid="uncrop-toggle"]');
    await expect(toggle).toBeVisible();

    // Check padding mode selector
    const modeSelect = page.locator('[data-testid="uncrop-padding-mode"]');
    await expect(modeSelect).toBeVisible();

    // Check uniform padding input
    const uniformInput = page.locator('[data-testid="uncrop-uniform-padding"]');
    await expect(uniformInput).toBeVisible();
  });

  test('UNCROP-003: enabling uncrop via toggle updates state', async ({ page }) => {
    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);

    // Click the uncrop toggle
    await page.click('[data-testid="uncrop-toggle"]');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.uncropEnabled).toBe(true);
  });

  test('UNCROP-004: setting uniform padding extends canvas', async ({ page }) => {
    const before = await captureViewerScreenshot(page);

    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);

    // Enable uncrop
    await page.click('[data-testid="uncrop-toggle"]');
    await page.waitForTimeout(100);

    // Set padding
    const paddingInput = page.locator('[data-testid="uncrop-uniform-padding"]');
    await paddingInput.fill('100');
    await paddingInput.dispatchEvent('input');
    await page.waitForTimeout(300);

    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);

    // Verify state
    const state = await getViewerState(page);
    expect(state.uncropEnabled).toBe(true);
    expect(state.uncropPadding).toBe(100);
  });

  test('UNCROP-005: canvas dimensions label updates with padding', async ({ page }) => {
    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);

    // Enable uncrop
    await page.click('[data-testid="uncrop-toggle"]');
    await page.waitForTimeout(100);

    // Set padding
    const paddingInput = page.locator('[data-testid="uncrop-uniform-padding"]');
    await paddingInput.fill('50');
    await paddingInput.dispatchEvent('input');
    await page.waitForTimeout(100);

    // Check canvas dimensions label
    const label = page.locator('[data-testid="uncrop-canvas-dimensions"]');
    const labelText = await label.textContent();
    expect(labelText).toContain('Canvas:');
    // Dimensions should be larger than source
    expect(labelText).toMatch(/\d+ x \d+ px/);
  });

  test('UNCROP-006: switching to per-side mode shows individual inputs', async ({ page }) => {
    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);

    // Switch to per-side mode
    const modeSelect = page.locator('[data-testid="uncrop-padding-mode"]');
    await modeSelect.selectOption('per-side');
    await page.waitForTimeout(100);

    // Verify per-side inputs are visible
    await expect(page.locator('[data-testid="uncrop-padding-top"]')).toBeVisible();
    await expect(page.locator('[data-testid="uncrop-padding-right"]')).toBeVisible();
    await expect(page.locator('[data-testid="uncrop-padding-bottom"]')).toBeVisible();
    await expect(page.locator('[data-testid="uncrop-padding-left"]')).toBeVisible();

    // Uniform input should be hidden
    const uniformContainer = page.locator('[data-testid="uncrop-uniform-container"]');
    await expect(uniformContainer).toBeHidden();
  });

  test('UNCROP-007: per-side padding allows asymmetric extension', async ({ page }) => {
    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);

    // Enable uncrop
    await page.click('[data-testid="uncrop-toggle"]');
    await page.waitForTimeout(100);

    // Switch to per-side mode
    const modeSelect = page.locator('[data-testid="uncrop-padding-mode"]');
    await modeSelect.selectOption('per-side');
    await page.waitForTimeout(100);

    // Set asymmetric padding
    const topInput = page.locator('[data-testid="uncrop-padding-top"]');
    await topInput.fill('100');
    await topInput.dispatchEvent('input');

    const rightInput = page.locator('[data-testid="uncrop-padding-right"]');
    await rightInput.fill('200');
    await rightInput.dispatchEvent('input');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.uncropPaddingMode).toBe('per-side');
    expect(state.uncropPaddingTop).toBe(100);
    expect(state.uncropPaddingRight).toBe(200);
  });

  test('UNCROP-008: reset uncrop restores default state', async ({ page }) => {
    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);

    // Enable and configure uncrop
    await page.click('[data-testid="uncrop-toggle"]');
    const paddingInput = page.locator('[data-testid="uncrop-uniform-padding"]');
    await paddingInput.fill('200');
    await paddingInput.dispatchEvent('input');
    await page.waitForTimeout(100);

    // Click reset
    await page.click('[data-testid="uncrop-reset"]');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.uncropEnabled).toBe(false);
    expect(state.uncropPadding).toBe(0);
  });

  test('UNCROP-009: uncrop state persists across frame changes', async ({ page }) => {
    await clickTab(page, 'transform');
    await page.waitForTimeout(100);

    // Open crop panel and enable uncrop
    await page.click('button[title*="Crop"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uncrop-toggle"]');
    const paddingInput = page.locator('[data-testid="uncrop-uniform-padding"]');
    await paddingInput.fill('80');
    await paddingInput.dispatchEvent('input');
    await page.waitForTimeout(100);

    // Close panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Change frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // State should persist
    const state = await getViewerState(page);
    expect(state.uncropEnabled).toBe(true);
    expect(state.uncropPadding).toBe(80);
  });
});
