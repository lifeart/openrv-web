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
 * including toggling, locking, color value display,
 * area averaging, source/rendered toggle, and alpha display.
 */

async function clickPixelProbeSampleSize(page: import('@playwright/test').Page, size: 1 | 3 | 5 | 9): Promise<void> {
  await page.evaluate((sampleSize) => {
    const selector = `[data-testid="pixel-probe-sample-size"] button[data-sample-size="${sampleSize}"]`;
    const button = document.querySelector(selector) as HTMLButtonElement | null;
    if (!button) {
      throw new Error(`Pixel probe sample size button not found: ${sampleSize}`);
    }
    button.click();
  }, size);
}

async function clickPixelProbeSourceMode(page: import('@playwright/test').Page, mode: 'rendered' | 'source'): Promise<void> {
  await page.evaluate((sourceMode) => {
    const selector = `[data-testid="pixel-probe-source-mode"] button[data-source-mode="${sourceMode}"]`;
    const button = document.querySelector(selector) as HTMLButtonElement | null;
    if (!button) {
      throw new Error(`Pixel probe source mode button not found: ${sourceMode}`);
    }
    button.click();
  }, mode);
}

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

    const probe = page.locator('[data-testid="pixel-probe-overlay"], .pixel-probe');
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

  test('PP-E006: pixel probe shows alpha value', async ({ page }) => {
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
    expect(typeof state.alpha).toBe('number');
    expect(state.alpha).toBeGreaterThanOrEqual(0);
    expect(state.alpha).toBeLessThanOrEqual(255);
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

    // Switch back to QC tab
    await page.click('button[data-tab-id="qc"]');
    await page.waitForTimeout(100);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);
  });
});

test.describe('Pixel Probe Sample Size (Area Averaging)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);
  });

  test('PP-E040: default sample size is 1x1', async ({ page }) => {
    const state = await getPixelProbeState(page);
    expect(state.sampleSize).toBe(1);
  });

  test('PP-E041: sample size buttons are visible in overlay', async ({ page }) => {
    const sampleSizeContainer = page.locator('[data-testid="pixel-probe-sample-size"]');
    await expect(sampleSizeContainer).toBeVisible();

    // Check that all sample size options are present
    const button1x1 = sampleSizeContainer.locator('button[data-sample-size="1"]');
    const button3x3 = sampleSizeContainer.locator('button[data-sample-size="3"]');
    const button5x5 = sampleSizeContainer.locator('button[data-sample-size="5"]');
    const button9x9 = sampleSizeContainer.locator('button[data-sample-size="9"]');

    await expect(button1x1).toBeVisible();
    await expect(button3x3).toBeVisible();
    await expect(button5x5).toBeVisible();
    await expect(button9x9).toBeVisible();
  });

  test('PP-E042: clicking 3x3 changes sample size', async ({ page }) => {
    await clickPixelProbeSampleSize(page, 3);
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    expect(state.sampleSize).toBe(3);
  });

  test('PP-E043: clicking 5x5 changes sample size', async ({ page }) => {
    await clickPixelProbeSampleSize(page, 5);
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    expect(state.sampleSize).toBe(5);
  });

  test('PP-E044: clicking 9x9 changes sample size', async ({ page }) => {
    await clickPixelProbeSampleSize(page, 9);
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    expect(state.sampleSize).toBe(9);
  });

  test('PP-E045: sample size persists when moving mouse', async ({ page }) => {
    // Set sample size to 5x5
    await clickPixelProbeSampleSize(page, 5);
    await page.waitForTimeout(100);

    // Move mouse over canvas
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
    }

    const state = await getPixelProbeState(page);
    expect(state.sampleSize).toBe(5);
  });
});

test.describe('Pixel Probe Source Mode (Source vs Rendered)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);
  });

  test('PP-E050: default source mode is rendered', async ({ page }) => {
    const state = await getPixelProbeState(page);
    expect(state.sourceMode).toBe('rendered');
  });

  test('PP-E051: source mode buttons are visible in overlay', async ({ page }) => {
    const sourceModeContainer = page.locator('[data-testid="pixel-probe-source-mode"]');
    await expect(sourceModeContainer).toBeVisible();

    // Check that both source mode options are present
    const renderedButton = sourceModeContainer.locator('button[data-source-mode="rendered"]');
    const sourceButton = sourceModeContainer.locator('button[data-source-mode="source"]');

    await expect(renderedButton).toBeVisible();
    await expect(sourceButton).toBeVisible();
  });

  test('PP-E052: clicking Source changes source mode', async ({ page }) => {
    await clickPixelProbeSourceMode(page, 'source');
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    expect(state.sourceMode).toBe('source');
  });

  test('PP-E053: clicking Rendered changes source mode back', async ({ page }) => {
    // First switch to source
    await clickPixelProbeSourceMode(page, 'source');
    await page.waitForTimeout(100);

    // Then switch back to rendered
    await clickPixelProbeSourceMode(page, 'rendered');
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    expect(state.sourceMode).toBe('rendered');
  });

  test('PP-E054: source mode persists when moving mouse', async ({ page }) => {
    // Set source mode
    await clickPixelProbeSourceMode(page, 'source');
    await page.waitForTimeout(100);

    // Move mouse over canvas
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
    }

    const state = await getPixelProbeState(page);
    expect(state.sourceMode).toBe('source');
  });
});

test.describe('Pixel Probe UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(100);
  });

  test('PP-E060: overlay shows color swatch', async ({ page }) => {
    const swatch = page.locator('[data-testid="pixel-probe-swatch"]');
    await expect(swatch).toBeVisible();
  });

  test('PP-E061: overlay shows coordinates', async ({ page }) => {
    const coords = page.locator('[data-testid="pixel-probe-coords"]');
    await expect(coords).toBeVisible();
  });

  test('PP-E062: overlay shows alpha value row', async ({ page }) => {
    const alphaRow = page.locator('[data-testid="pixel-probe-alpha"]');
    await expect(alphaRow).toBeVisible();
  });

  test('PP-E063: overlay shows RGB value row', async ({ page }) => {
    const rgbRow = page.locator('[data-testid="pixel-probe-rgb"]');
    await expect(rgbRow).toBeVisible();
  });
});
