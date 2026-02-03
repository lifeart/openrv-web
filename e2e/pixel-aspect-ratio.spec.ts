import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

test.describe('Pixel Aspect Ratio (PAR)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('PAR-001: PAR is disabled by default', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.parEnabled).toBe(false);
    expect(state.parValue).toBe(1.0);
    expect(state.parPreset).toBe('square');
  });

  test('PAR-002: PAR control is visible in View tab', async ({ page }) => {
    // Click View tab
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);

    const control = page.locator('[data-testid="par-control"]');
    await expect(control).toBeVisible();
  });

  test('PAR-003: PAR button exists with correct label', async ({ page }) => {
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);

    const button = page.locator('[data-testid="par-control-button"]');
    await expect(button).toBeVisible();
    await expect(button).toContainText('PAR');
  });

  test('PAR-004: clicking PAR button opens dropdown', async ({ page }) => {
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);

    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="par-control-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('PAR-005: dropdown shows presets', async ({ page }) => {
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);

    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);

    // Check for some key presets
    const squarePreset = page.locator('[data-testid="par-preset-square"]');
    await expect(squarePreset).toBeVisible();

    const anamorphicPreset = page.locator('[data-testid="par-preset-anamorphic-2x"]');
    await expect(anamorphicPreset).toBeVisible();

    const ntscPreset = page.locator('[data-testid="par-preset-ntsc-dv"]');
    await expect(ntscPreset).toBeVisible();
  });

  test('PAR-006: selecting anamorphic 2:1 updates state', async ({ page }) => {
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);

    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);

    await page.click('[data-testid="par-preset-anamorphic-2x"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.parEnabled).toBe(true);
    expect(state.parValue).toBe(2.0);
    expect(state.parPreset).toBe('anamorphic-2x');
  });

  test('PAR-007: anamorphic 2:1 changes display (canvas appears wider)', async ({ page }) => {
    // Capture before
    const before = await captureViewerScreenshot(page);

    // Enable anamorphic 2:1
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-preset-anamorphic-2x"]');
    await page.waitForTimeout(300);

    // Capture after
    const after = await captureViewerScreenshot(page);

    // Visual difference expected - image should now be displayed wider
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  test('PAR-008: Shift+P toggles PAR correction', async ({ page }) => {
    // First set a non-square PAR so toggle has visible effect
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-preset-anamorphic-2x"]');
    await page.waitForTimeout(200);

    let state = await getViewerState(page);
    expect(state.parEnabled).toBe(true);

    // Toggle off with keyboard
    await page.keyboard.press('Shift+p');
    await page.waitForTimeout(200);

    state = await getViewerState(page);
    expect(state.parEnabled).toBe(false);

    // Toggle on again
    await page.keyboard.press('Shift+p');
    await page.waitForTimeout(200);

    state = await getViewerState(page);
    expect(state.parEnabled).toBe(true);
  });

  test('PAR-009: PAR state persists across frame changes', async ({ page }) => {
    // Enable anamorphic PAR
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-preset-anamorphic-2x"]');
    await page.waitForTimeout(200);

    let state = await getViewerState(page);
    expect(state.parEnabled).toBe(true);
    expect(state.parValue).toBe(2.0);

    // Change frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // PAR should still be active
    state = await getViewerState(page);
    expect(state.parEnabled).toBe(true);
    expect(state.parValue).toBe(2.0);
  });

  test('PAR-010: selecting square pixels resets to 1.0', async ({ page }) => {
    // First set anamorphic
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-preset-anamorphic-2x"]');
    await page.waitForTimeout(200);

    let state = await getViewerState(page);
    expect(state.parValue).toBe(2.0);

    // Now select square
    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-preset-square"]');
    await page.waitForTimeout(200);

    state = await getViewerState(page);
    expect(state.parValue).toBe(1.0);
    expect(state.parPreset).toBe('square');
  });

  test('PAR-011: enable checkbox toggles PAR correction', async ({ page }) => {
    await page.click('button:has-text("View")');
    await page.waitForTimeout(100);
    await page.click('[data-testid="par-control-button"]');
    await page.waitForTimeout(100);

    const checkbox = page.locator('[data-testid="par-enable-checkbox"]');
    await expect(checkbox).toBeVisible();

    // Check the checkbox
    await checkbox.check();
    await page.waitForTimeout(200);

    let state = await getViewerState(page);
    expect(state.parEnabled).toBe(true);

    // Uncheck
    await checkbox.uncheck();
    await page.waitForTimeout(200);

    state = await getViewerState(page);
    expect(state.parEnabled).toBe(false);
  });
});
