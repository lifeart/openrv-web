import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getPresentationState,
  getFullscreenState,
} from './fixtures';

test.describe('Fullscreen / Presentation Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  // === FULLSCREEN BUTTON TESTS ===

  test('FS-001: fullscreen button is visible in header bar', async ({ page }) => {
    const button = page.locator('[data-testid="fullscreen-toggle-button"]');
    await expect(button).toBeVisible();
  });

  test('FS-002: fullscreen button has correct tooltip', async ({ page }) => {
    const button = page.locator('[data-testid="fullscreen-toggle-button"]');
    const title = await button.getAttribute('title');
    expect(title).toContain('Fullscreen');
  });

  // Note: FS-002/003 (enter/exit fullscreen via button) cannot be reliably tested
  // in headless Playwright as the Fullscreen API requires user gesture and may be
  // blocked in headless browsers. These are tested via unit tests.

  test('FS-005: fullscreen state defaults to false', async ({ page }) => {
    const state = await getFullscreenState(page);
    expect(state.isFullscreen).toBe(false);
  });

  // === PRESENTATION MODE BUTTON TESTS ===

  test('FS-010: presentation mode button is visible in header bar', async ({ page }) => {
    const button = page.locator('[data-testid="presentation-mode-button"]');
    await expect(button).toBeVisible();
  });

  test('FS-011: enter presentation mode hides UI', async ({ page }) => {
    // Click presentation mode button
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500); // Wait for transition + display:none

    // Verify state
    const state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Header bar should be hidden
    const headerBar = page.locator('.header-bar');
    await expect(headerBar).toBeHidden();
  });

  test('FS-012: exit presentation mode shows UI', async ({ page }) => {
    // Enter presentation mode
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500);

    let state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Exit via ESC key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Verify state
    state = await getPresentationState(page);
    expect(state.enabled).toBe(false);

    // Header bar should be visible again
    const headerBar = page.locator('.header-bar');
    await expect(headerBar).toBeVisible();
  });

  test('FS-013: presentation mode keyboard shortcut Ctrl+Shift+P', async ({ page }) => {
    // Press Ctrl+Shift+P
    await page.keyboard.press('Control+Shift+p');
    await page.waitForTimeout(500);

    // Verify state
    const state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Header bar should be hidden
    const headerBar = page.locator('.header-bar');
    await expect(headerBar).toBeHidden();
  });

  test('FS-020: presentation mode default state', async ({ page }) => {
    const state = await getPresentationState(page);
    expect(state.enabled).toBe(false);
    expect(state.cursorAutoHide).toBe(true);
    expect(state.cursorHideDelay).toBe(3000);
  });

  test('FS-040: playback controls work in presentation mode', async ({ page }) => {
    // Enter presentation mode
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500);

    const state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Arrow keys should still step frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // Space should toggle playback (we just verify no error occurs)
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
  });

  test('FS-041: ESC exits presentation mode, pressing again does not re-enter', async ({ page }) => {
    // Enter presentation mode
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500);

    let state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // ESC should exit presentation mode
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    state = await getPresentationState(page);
    expect(state.enabled).toBe(false);

    // Second ESC should not re-enter (just close panels normally)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    state = await getPresentationState(page);
    expect(state.enabled).toBe(false);
  });
});
