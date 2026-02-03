import { test, expect } from '@playwright/test';
import { loadVideoFile, getSessionState, waitForTestHelper } from './fixtures';

test.describe('Audio Pitch Correction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // APC-001: Default pitch correction is enabled
  test('APC-001: pitch correction is enabled by default', async ({ page }) => {
    const preservesPitch = await page.evaluate(() => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.preservesPitch;
    });
    expect(preservesPitch).toBe(true);
  });

  // APC-002: Pitch correction toggle is in speed context menu
  test('APC-002: pitch correction toggle exists in speed menu', async ({ page }) => {
    await loadVideoFile(page);

    // Open the playback speed menu
    const speedButton = page.locator('[data-testid="playback-speed-button"]');
    await expect(speedButton).toBeVisible();
    await speedButton.click();
    await page.waitForTimeout(200);

    // Check for pitch correction toggle
    const pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await expect(pitchToggle).toBeVisible();
  });

  // APC-003: Toggling pitch correction changes state
  test('APC-003: clicking pitch toggle disables pitch correction', async ({ page }) => {
    await loadVideoFile(page);

    // Verify initial state
    let preservesPitch = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getSessionState()?.preservesPitch;
    });
    expect(preservesPitch).toBe(true);

    // Open speed menu and toggle pitch correction
    const speedButton = page.locator('[data-testid="playback-speed-button"]');
    await speedButton.click();
    await page.waitForTimeout(200);

    const pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    // Verify state changed
    preservesPitch = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getSessionState()?.preservesPitch;
    });
    expect(preservesPitch).toBe(false);
  });

  // APC-004: Toggle pitch correction back on
  test('APC-004: toggling pitch correction twice restores original state', async ({ page }) => {
    await loadVideoFile(page);

    // Open speed menu
    const speedButton = page.locator('[data-testid="playback-speed-button"]');
    await speedButton.click();
    await page.waitForTimeout(200);

    // Toggle off
    let pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    // Re-open speed menu (may have closed)
    await speedButton.click();
    await page.waitForTimeout(200);

    // Toggle back on
    pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    const preservesPitch = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getSessionState()?.preservesPitch;
    });
    expect(preservesPitch).toBe(true);
  });

  // APC-005: Pitch correction state via scripting API
  test('APC-005: scripting API can control pitch correction', async ({ page }) => {
    await loadVideoFile(page);

    // Disable via scripting API
    await page.evaluate(() => {
      const api = (window as any).openrv;
      api?.audio?.setPreservesPitch?.(false);
    });
    await page.waitForTimeout(100);

    let preservesPitch = await page.evaluate(() => {
      const api = (window as any).openrv;
      return api?.audio?.getPreservesPitch?.();
    });
    expect(preservesPitch).toBe(false);

    // Re-enable via scripting API
    await page.evaluate(() => {
      const api = (window as any).openrv;
      api?.audio?.setPreservesPitch?.(true);
    });
    await page.waitForTimeout(100);

    preservesPitch = await page.evaluate(() => {
      const api = (window as any).openrv;
      return api?.audio?.getPreservesPitch?.();
    });
    expect(preservesPitch).toBe(true);
  });

  // APC-006: Pitch correction persists across speed changes
  test('APC-006: pitch correction state persists when changing speed', async ({ page }) => {
    await loadVideoFile(page);

    // Disable pitch correction
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.preservesPitch = false;
      }
    });

    // Change playback speed
    const speedButton = page.locator('[data-testid="playback-speed-button"]');
    await speedButton.click();
    await page.waitForTimeout(200);

    // Select a different speed preset
    const speed2x = page.locator('[data-testid="speed-preset-2"]');
    if (await speed2x.isVisible()) {
      await speed2x.click();
      await page.waitForTimeout(200);
    }

    // Pitch correction should still be disabled
    const preservesPitch = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getSessionState()?.preservesPitch;
    });
    expect(preservesPitch).toBe(false);
  });

  // APC-007: Default playback speed is 1x
  test('APC-007: default playback speed is 1x', async ({ page }) => {
    const state = await getSessionState(page);
    expect(state.playbackSpeed).toBe(1);
  });
});
