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

  // BG-004: Select grey18 — state + visual
  test('BG-004: selecting Grey 18% changes background', async ({ page }) => {
    await loadImageFile(page);
    const viewer = page.locator('.viewer-container');

    const bgBefore = await viewer.evaluate(el => getComputedStyle(el).backgroundColor);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="grey18"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey18');

    // Viewer container CSS background should have changed
    const bgAfter = await viewer.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgAfter).not.toBe(bgBefore);
  });

  // BG-005: Select grey50
  test('BG-005: selecting Grey 50% changes background', async ({ page }) => {
    await loadImageFile(page);
    const viewer = page.locator('.viewer-container');

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="grey50"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey50');

    // rgb(128, 128, 128) = #808080 = grey 50%
    const bg = await viewer.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(128, 128, 128)');
  });

  // BG-006: Select white
  test('BG-006: selecting White changes background', async ({ page }) => {
    await loadImageFile(page);
    const viewer = page.locator('.viewer-container');

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="white"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('white');

    const bg = await viewer.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  // BG-007: Select checkerboard
  test('BG-007: selecting Checkerboard changes state and viewer', async ({ page }) => {
    await loadImageFile(page);
    const viewer = page.locator('.viewer-container');

    const screenshotBefore = await viewer.screenshot();

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    // Viewer should look different with checkerboard background
    const screenshotAfter = await viewer.screenshot();
    expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
  });

  // BG-008: Checkerboard size options
  test('BG-008: checkerboard size can be changed', async ({ page }) => {
    await loadImageFile(page);

    // Enable checkerboard — dropdown stays open to show size options
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');
    expect(state.backgroundCheckerSize).toBe('medium');

    // Size buttons may extend past viewport in fixed dropdown — dispatch click via JS
    await page.locator('[data-checker-size="large"]').dispatchEvent('click');
    await page.waitForTimeout(200);

    state = await getViewerState(page);
    expect(state.backgroundCheckerSize).toBe('large');
  });

  // BG-009: Select crosshatch
  test('BG-009: selecting Crosshatch changes state', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="crosshatch"]');
    await page.waitForTimeout(200);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('crosshatch');
  });

  // BG-010: Keyboard shortcut Shift+B cycles patterns
  test('BG-010: Shift+B cycles through background patterns', async ({ page }) => {
    await loadImageFile(page);

    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');

    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey18');

    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('grey50');

    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-011: Keyboard shortcut Shift+Alt+B toggles checkerboard
  test('BG-011: Shift+Alt+B toggles checkerboard on/off', async ({ page }) => {
    await loadImageFile(page);

    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');

    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');
  });

  // BG-012: Button shows active state when non-default pattern selected
  test('BG-012: button shows active state for non-default pattern', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    const button = page.locator('[data-testid="background-pattern-button"]');

    // Default state (black) — button should not have accent border
    const borderBefore = await button.evaluate(el => getComputedStyle(el).borderColor);

    // Select checkerboard
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="checker"]');
    await page.waitForTimeout(100);

    // Button should now have active styling (border changed)
    const borderAfter = await button.evaluate(el => getComputedStyle(el).borderColor);
    expect(borderAfter).not.toBe(borderBefore);
  });

  // BG-013: State persists across frames
  test('BG-013: background pattern persists when changing frames', async ({ page }) => {
    await loadVideoFile(page);

    await page.keyboard.press('Shift+Alt+b');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('checker');
  });

  // BG-014: Dropdown closes on selection of solid patterns
  test('BG-014: dropdown closes after selecting solid pattern', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');

    const dropdown = page.locator('[data-testid="background-pattern-dropdown"]');
    await expect(dropdown).toBeVisible();

    await page.click('[data-bg-pattern="grey18"]');
    await page.waitForTimeout(100);

    await expect(dropdown).not.toBeVisible();
  });

  // BG-015: Custom color option
  test('BG-015: custom color option sets pattern to custom', async ({ page }) => {
    await loadImageFile(page);

    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="custom"]');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('custom');
  });

  // BG-016: Checker size default
  test('BG-016: default checker size is medium', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.backgroundCheckerSize).toBe('medium');
  });

  // BG-017: Background pattern visible in viewer (screenshot comparison with video)
  test('BG-017: background pattern produces visible change with opaque video', async ({ page }) => {
    await loadVideoFile(page);
    const viewer = page.locator('.viewer-container');

    const screenshotBefore = await viewer.screenshot();

    // Select white background (maximum visual contrast)
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="white"]');
    await page.waitForTimeout(200);

    const screenshotAfter = await viewer.screenshot();
    expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
  });

  // BG-018: Canvas element CSS background also updates
  test('BG-018: canvas element background matches pattern', async ({ page }) => {
    await loadVideoFile(page);
    const canvas = page.locator('.viewer-container canvas').first();

    // Default should be black
    const bgBefore = await canvas.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgBefore).toBe('rgb(0, 0, 0)');

    // Change to white
    await page.click('button[data-tab-id="view"]');
    await page.click('[data-testid="background-pattern-button"]');
    await page.click('[data-bg-pattern="white"]');
    await page.waitForTimeout(200);

    const bgAfter = await canvas.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgAfter).toBe('rgb(255, 255, 255)');
  });

  // BG-019: Background resets properly when cycling back to black
  test('BG-019: CSS background resets when switching back to black', async ({ page }) => {
    await loadVideoFile(page);
    const viewer = page.locator('.viewer-container');

    // Record the default (theme) background
    const bgDefault = await viewer.evaluate(el => getComputedStyle(el).backgroundColor);

    // Change to grey50
    await page.keyboard.press('Shift+b'); // grey18
    await page.keyboard.press('Shift+b'); // grey50
    await page.waitForTimeout(100);

    const bgGrey = await viewer.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgGrey).toBe('rgb(128, 128, 128)');

    // Change back to black
    await page.keyboard.press('Shift+b'); // checker
    await page.keyboard.press('Shift+b'); // black
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.backgroundPattern).toBe('black');

    // Should restore to the original theme background, not hardcoded black
    const bgRestored = await viewer.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgRestored).toBe(bgDefault);
  });
});
