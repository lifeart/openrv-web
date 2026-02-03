import { test, expect } from '@playwright/test';
import { loadVideoFile, getSessionState, waitForTestHelper } from './fixtures';

/**
 * Helper: open the speed context menu by right-clicking on the speed button.
 */
async function openSpeedMenu(page: import('@playwright/test').Page): Promise<void> {
  const speedButton = page.locator('[data-testid="playback-speed-button"]');
  await expect(speedButton).toBeVisible();
  await speedButton.click({ button: 'right' });
  await page.waitForTimeout(200);
}

test.describe('Audio Pitch Correction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // APC-001: Default pitch correction is enabled
  test('APC-001: pitch correction is enabled by default', async ({ page }) => {
    const state = await getSessionState(page);
    expect(state.preservesPitch).toBe(true);
  });

  // APC-002: Pitch correction toggle is in speed context menu
  test('APC-002: pitch correction toggle exists in speed menu', async ({ page }) => {
    await loadVideoFile(page);

    // Open the playback speed menu via right-click
    await openSpeedMenu(page);

    // Check for pitch correction toggle
    const pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await expect(pitchToggle).toBeVisible();
  });

  // APC-003: Toggling pitch correction changes state
  test('APC-003: clicking pitch toggle disables pitch correction', async ({ page }) => {
    await loadVideoFile(page);

    // Verify initial state
    let state = await getSessionState(page);
    expect(state.preservesPitch).toBe(true);

    // Open speed menu via right-click and toggle pitch correction
    await openSpeedMenu(page);

    const pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    // Verify state changed
    state = await getSessionState(page);
    expect(state.preservesPitch).toBe(false);
  });

  // APC-004: Toggle pitch correction back on
  test('APC-004: toggling pitch correction twice restores original state', async ({ page }) => {
    await loadVideoFile(page);

    // Open speed menu via right-click and toggle off
    await openSpeedMenu(page);

    let pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    // Verify it's off
    let state = await getSessionState(page);
    expect(state.preservesPitch).toBe(false);

    // Re-open speed menu via right-click and toggle back on
    await openSpeedMenu(page);

    pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    // Verify it's back on
    state = await getSessionState(page);
    expect(state.preservesPitch).toBe(true);
  });

  // APC-005: Pitch correction toggle via speed menu (round-trip)
  test('APC-005: speed menu pitch toggle works for disable and re-enable', async ({ page }) => {
    await loadVideoFile(page);

    // Disable pitch correction via speed context menu
    await openSpeedMenu(page);
    let pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    let state = await getSessionState(page);
    expect(state.preservesPitch).toBe(false);

    // Re-enable via speed context menu
    await openSpeedMenu(page);
    pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    state = await getSessionState(page);
    expect(state.preservesPitch).toBe(true);
  });

  // APC-006: Pitch correction persists across speed changes
  test('APC-006: pitch correction state persists when changing speed', async ({ page }) => {
    await loadVideoFile(page);

    // Disable pitch correction via speed context menu
    await openSpeedMenu(page);
    const pitchToggle = page.locator('[data-testid="pitch-correction-toggle"]');
    await pitchToggle.click();
    await page.waitForTimeout(200);

    // Verify it's disabled
    let state = await getSessionState(page);
    expect(state.preservesPitch).toBe(false);

    // Change playback speed via the speed context menu
    await openSpeedMenu(page);

    // Select a different speed preset (2x)
    const speed2x = page.locator('[data-testid="speed-preset-2"]');
    if (await speed2x.isVisible()) {
      await speed2x.click();
      await page.waitForTimeout(200);
    }

    // Pitch correction should still be disabled
    state = await getSessionState(page);
    expect(state.preservesPitch).toBe(false);
  });

  // APC-007: Default playback speed is 1x
  test('APC-007: default playback speed is 1x', async ({ page }) => {
    const state = await getSessionState(page);
    expect(state.playbackSpeed).toBe(1);
  });
});
