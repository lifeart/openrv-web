import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getPixelProbeState,
  waitForTestHelper,
  getCanvas,
} from './fixtures';

/**
 * Pixel Probe Feature Tests
 *
 * These tests verify the pixel probe functionality,
 * including toggling, locking, and color value display.
 */

test.describe('Pixel Probe Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('PP-E001: pixel probe is disabled by default', async ({ page }) => {
    const state = await getPixelProbeState(page);
    expect(state.enabled).toBe(false);
  });

  test('PP-E002: pressing Shift+I toggles pixel probe', async ({ page }) => {
    let state = await getPixelProbeState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(false);
  });

  test('PP-E003: pixel probe container is visible when enabled', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);

    const probe = page.locator('[data-testid="pixel-probe"], .pixel-probe');
    await expect(probe).toBeVisible();
  });

  test('PP-E004: pixel probe shows RGB values', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);

    // Move mouse over canvas to update probe values
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
    }

    const state = await getPixelProbeState(page);
    expect(state.rgb).toBeDefined();
    expect(typeof state.rgb.r).toBe('number');
    expect(typeof state.rgb.g).toBe('number');
    expect(typeof state.rgb.b).toBe('number');
  });

  test('PP-E005: pixel probe shows coordinates', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);

    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
    }

    const state = await getPixelProbeState(page);
    expect(typeof state.x).toBe('number');
    expect(typeof state.y).toBe('number');
  });
});

test.describe('Pixel Probe Locking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable pixel probe
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);
  });

  test('PP-E010: pixel probe is not locked by default', async ({ page }) => {
    const state = await getPixelProbeState(page);
    expect(state.locked).toBe(false);
  });

  test('PP-E011: clicking on canvas locks pixel probe position', async ({ page }) => {
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
    }

    const state = await getPixelProbeState(page);
    expect(state.locked).toBe(true);
  });

  test('PP-E012: locked position persists when moving mouse', async ({ page }) => {
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (!box) return;

    // Click to lock at center
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    const lockedState = await getPixelProbeState(page);
    const lockedX = lockedState.x;
    const lockedY = lockedState.y;

    // Move mouse to different position
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.waitForTimeout(100);

    const afterMoveState = await getPixelProbeState(page);
    expect(afterMoveState.x).toBe(lockedX);
    expect(afterMoveState.y).toBe(lockedY);
  });
});

test.describe('Pixel Probe IRE Values', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);
  });

  test('PP-E020: pixel probe shows IRE value', async ({ page }) => {
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
    }

    const state = await getPixelProbeState(page);
    expect(typeof state.ire).toBe('number');
    // IRE should be between 0 and 109 (7.5 IRE setup to super white)
    expect(state.ire).toBeGreaterThanOrEqual(0);
    expect(state.ire).toBeLessThanOrEqual(109);
  });
});

test.describe('Pixel Probe State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('PP-E030: pixel probe visibility persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);

    let state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);
  });

  test('PP-E031: pixel probe visibility persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);

    let state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);
  });
});
