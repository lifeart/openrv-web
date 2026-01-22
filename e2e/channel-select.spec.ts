import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Channel Select Feature Tests
 *
 * These tests verify the channel isolation functionality,
 * including UI interaction, keyboard shortcuts, and actual
 * visual changes to the canvas.
 */

async function openChannelSelect(page: Page): Promise<void> {
  await page.click('button[data-tab-id="view"]');
  await page.waitForTimeout(100);
  await page.click('[data-testid="channel-select-button"]');
  await page.waitForTimeout(100);
}

async function selectChannel(page: Page, channel: string): Promise<void> {
  await openChannelSelect(page);
  await page.click(`button[data-value="${channel}"]`);
  await page.waitForTimeout(100);
}

test.describe('Channel Select', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CS-001: default channel mode is RGB', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.channelMode).toBe('rgb');
  });

  test('CS-002: clicking R button selects red channel', async ({ page }) => {
    await selectChannel(page, 'red');

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('red');
  });

  test('CS-003: clicking G button selects green channel', async ({ page }) => {
    await selectChannel(page, 'green');

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('green');
  });

  test('CS-004: clicking B button selects blue channel', async ({ page }) => {
    await selectChannel(page, 'blue');

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('blue');
  });

  test('CS-005: clicking A button selects alpha channel', async ({ page }) => {
    await selectChannel(page, 'alpha');

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('alpha');
  });

  test('CS-006: clicking Luma button selects luminance channel', async ({ page }) => {
    await selectChannel(page, 'luminance');

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');
  });

  test('CS-007: clicking RGB button returns to all channels', async ({ page }) => {
    await selectChannel(page, 'red');

    let state = await getViewerState(page);
    expect(state.channelMode).toBe('red');

    await selectChannel(page, 'rgb');

    state = await getViewerState(page);
    expect(state.channelMode).toBe('rgb');
  });
});

test.describe('Channel Select Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CS-010: Shift+G selects green channel', async ({ page }) => {
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('green');
  });

  test('CS-011: Shift+B selects blue channel', async ({ page }) => {
    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('blue');
  });

  test('CS-012: Shift+A selects alpha channel', async ({ page }) => {
    await page.keyboard.press('Shift+a');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('alpha');
  });

  test('CS-013: Shift+L selects luminance channel', async ({ page }) => {
    await page.keyboard.press('Shift+l');
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');
  });

  test('CS-014: Shift+N returns to RGB channel', async ({ page }) => {
    // First select a different channel
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.channelMode).toBe('green');

    // Press Shift+N to return to normal
    await page.keyboard.press('Shift+n');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.channelMode).toBe('rgb');
  });

  test('CS-015: Shift+R does NOT select red channel (used for rotation)', async ({ page }) => {
    // Shift+R is reserved for rotation, not red channel
    await page.keyboard.press('Shift+r');
    await page.waitForTimeout(100);

    // Channel should still be RGB
    const state = await getViewerState(page);
    expect(state.channelMode).toBe('rgb');
  });
});

test.describe('Channel Select Visual Changes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CS-020: red channel isolation produces different image than RGB', async ({ page }) => {
    // Capture RGB screenshot
    const rgbScreenshot = await captureViewerScreenshot(page);

    // Select red channel
    await selectChannel(page, 'red');
    await page.waitForTimeout(100);

    // Capture red channel screenshot
    const redScreenshot = await captureViewerScreenshot(page);

    // Images should be different
    expect(imagesAreDifferent(rgbScreenshot, redScreenshot)).toBe(true);
  });

  test('CS-021: green channel isolation produces different image than RGB', async ({ page }) => {
    const rgbScreenshot = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    const greenScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(rgbScreenshot, greenScreenshot)).toBe(true);
  });

  test('CS-022: blue channel isolation produces different image than RGB', async ({ page }) => {
    const rgbScreenshot = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+b');
    await page.waitForTimeout(200);

    const blueScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(rgbScreenshot, blueScreenshot)).toBe(true);
  });

  test('CS-023: luminance produces different image than RGB', async ({ page }) => {
    const rgbScreenshot = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+l');
    await page.waitForTimeout(200);

    const lumaScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(rgbScreenshot, lumaScreenshot)).toBe(true);
  });

  test('CS-024: switching back to RGB restores original image', async ({ page }) => {
    // Capture original
    const originalScreenshot = await captureViewerScreenshot(page);

    // Switch to green
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    // Switch back to RGB
    await page.keyboard.press('Shift+n');
    await page.waitForTimeout(200);

    // Capture restored
    const restoredScreenshot = await captureViewerScreenshot(page);

    // Images should be the same
    expect(imagesAreDifferent(originalScreenshot, restoredScreenshot)).toBe(false);
  });

  test('CS-025: each channel produces a unique grayscale image', async ({ page }) => {
    // Capture each channel
    await selectChannel(page, 'red');
    await page.waitForTimeout(200);
    const redScreenshot = await captureViewerScreenshot(page);

    await selectChannel(page, 'green');
    await page.waitForTimeout(200);
    const greenScreenshot = await captureViewerScreenshot(page);

    await selectChannel(page, 'blue');
    await page.waitForTimeout(200);
    const blueScreenshot = await captureViewerScreenshot(page);

    // Each should be different from the others
    expect(imagesAreDifferent(redScreenshot, greenScreenshot)).toBe(true);
    expect(imagesAreDifferent(greenScreenshot, blueScreenshot)).toBe(true);
    expect(imagesAreDifferent(redScreenshot, blueScreenshot)).toBe(true);
  });
});

test.describe('Channel Select State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('CS-030: channel mode persists when changing frames', async ({ page }) => {
    // Select red channel
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.channelMode).toBe('green');

    // Navigate to next frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Channel should still be green
    state = await getViewerState(page);
    expect(state.channelMode).toBe('green');

    // Navigate back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    // Channel should still be green
    state = await getViewerState(page);
    expect(state.channelMode).toBe('green');
  });

  test('CS-031: channel mode persists when changing tabs', async ({ page }) => {
    // Select luminance channel
    await page.keyboard.press('Shift+l');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    // Channel should still be luminance
    state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Channel should still be luminance
    state = await getViewerState(page);
    expect(state.channelMode).toBe('luminance');
  });
});
