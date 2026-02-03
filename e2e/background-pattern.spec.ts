import { test, expect } from '@playwright/test';
import { loadImageFile, loadVideoFile, getViewerState, waitForTestHelper, captureViewerScreenshot, imagesAreDifferent } from './fixtures';

test.describe('Background Pattern Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // BG-001: Default state
  test('BG-001: default background pattern is black', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-002: Control visibility
  test('BG-002: background pattern control is visible in View tab', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    const control = page.locator('[data-testid="background-pattern-button"]');
    await expect(control).toBeVisible();
  });

  // BG-003: Dropdown opens
  test('BG-003: clicking button opens dropdown menu', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.waitForTimeout(100);
    const dropdown = page.locator('[data-testid="background-pattern-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  // BG-004: Select grey18
  test('BG-004: selecting Grey 18% changes background', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="grey18"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey18');
  });

  // BG-005: Select grey50
  test('BG-005: selecting Grey 50% changes background', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="grey50"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey50');
  });

  // BG-006: Select white
  test('BG-006: selecting White changes background', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="white"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('white');
  });

  // BG-007: Select checkerboard
  test('BG-007: selecting Checkerboard changes state', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');
  });

  // BG-008: Select crosshatch
  test('BG-008: selecting Crosshatch changes state', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="crosshatch"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('crosshatch');
  });

  // BG-009: Keyboard shortcut Shift+B cycles patterns
  test('BG-009: Shift+B cycles through background patterns', async ({ page }) => {
    await loadImageFile(page);

    // Start at black (default)
    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');

    // Cycle to grey18
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey18');

    // Cycle to grey50
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey50');

    // Cycle to checker
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    // Cycle back to black
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-010: Keyboard shortcut Shift+Alt+B toggles checkerboard
  test('BG-010: Shift+Alt+B toggles checkerboard on/off', async ({ page }) => {
    await loadImageFile(page);

    // Start at black
    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');

    // Toggle to checkerboard
    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    // Toggle back to black
    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-011: Dropdown closes on selection of solid patterns
  test('BG-011: dropdown closes after selecting solid pattern', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');

    const dropdown = page.locator('[data-testid="background-pattern-dropdown"]');
    await expect(dropdown).toBeVisible();

    await page.click('[data-bg-pattern="grey18"]');
    await page.waitForTimeout(100);

    await expect(dropdown).not.toBeVisible();
  });

  // BG-012: State persists across frames
  test('BG-012: background pattern persists when changing frames', async ({ page }) => {
    await loadVideoFile(page);

    // Set to checkerboard via keyboard
    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    // Change frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Pattern should persist
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');
  });

  // BG-013: Checker size default
  test('BG-013: default checker size is medium', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.backgroundCheckerSize).toBe('medium');
  });

  // BG-014: Custom color
  test('BG-014: custom color option sets pattern to custom', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="custom"]');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('custom');
  });
});
