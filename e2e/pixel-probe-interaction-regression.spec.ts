import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getCanvas,
  getPixelProbeState,
} from './fixtures';

test.describe('Pixel Probe Interaction Regression', () => {
  test('PPR-E001: format buttons are clickable with real mouse movement', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(150);

    const canvas = await getCanvas(page);
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    // Place probe near center first.
    await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
    await page.waitForTimeout(150);

    for (const format of ['hsl', 'hex', 'ire'] as const) {
      const btn = page.locator(`[data-testid="pixel-probe-overlay"] button[data-format="${format}"]`);
      await expect(btn).toBeVisible();

      const box = await btn.boundingBox();
      expect(box).not.toBeNull();

      // Use real pointer move + click (not DOM click) to catch chase/follow issues.
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 24 });
      await page.waitForTimeout(60);
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(120);

      const state = await getPixelProbeState(page);
      expect(state.format).toBe(format);
    }
  });

  test('PPR-E002: precision toggle is clickable with real mouse movement', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(150);

    const canvas = await getCanvas(page);
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
    await page.waitForTimeout(150);

    const precisionBtn = page.locator('[data-testid="pixel-probe-precision-toggle"]');
    await expect(precisionBtn).toBeVisible();

    const rgb01El = page.locator('[data-testid="pixel-probe-rgb01"]');
    await expect(rgb01El).toBeVisible();

    const initialText = (await rgb01El.textContent()) ?? '';
    const initialDecimals = Array.from(initialText.matchAll(/\d+\.(\d+)/g))
      .reduce((max, m) => Math.max(max, (m[1] ?? '').length), 0);

    const btnBox = await precisionBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    await page.mouse.move(btnBox!.x + btnBox!.width / 2, btnBox!.y + btnBox!.height / 2, { steps: 24 });
    await page.waitForTimeout(60);
    await page.mouse.click(btnBox!.x + btnBox!.width / 2, btnBox!.y + btnBox!.height / 2);
    await page.waitForTimeout(120);

    const updatedText = (await rgb01El.textContent()) ?? '';
    const updatedDecimals = Array.from(updatedText.matchAll(/\d+\.(\d+)/g))
      .reduce((max, m) => Math.max(max, (m[1] ?? '').length), 0);
    expect(updatedDecimals).toBeGreaterThan(initialDecimals);
  });

  test('PPR-E003: sample/source buttons are clickable with real mouse movement', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(150);

    const canvas = await getCanvas(page);
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
    await page.waitForTimeout(150);

    const btn3x3 = page.locator('[data-testid="pixel-probe-overlay"] button[data-sample-size="3"]');
    const srcBtn = page.locator('[data-testid="pixel-probe-overlay"] button[data-source-mode="source"]');
    await expect(btn3x3).toBeVisible();
    await expect(srcBtn).toBeVisible();

    const sizeBox = await btn3x3.boundingBox();
    expect(sizeBox).not.toBeNull();
    await page.mouse.move(sizeBox!.x + sizeBox!.width / 2, sizeBox!.y + sizeBox!.height / 2, { steps: 20 });
    await page.mouse.click(sizeBox!.x + sizeBox!.width / 2, sizeBox!.y + sizeBox!.height / 2);
    await page.waitForTimeout(120);

    let state = await getPixelProbeState(page);
    expect(state.sampleSize).toBe(3);

    const srcBox = await srcBtn.boundingBox();
    expect(srcBox).not.toBeNull();
    await page.mouse.move(srcBox!.x + srcBox!.width / 2, srcBox!.y + srcBox!.height / 2, { steps: 20 });
    await page.mouse.click(srcBox!.x + srcBox!.width / 2, srcBox!.y + srcBox!.height / 2);
    await page.waitForTimeout(120);

    state = await getPixelProbeState(page);
    expect(state.sourceMode).toBe('source');
  });
});
