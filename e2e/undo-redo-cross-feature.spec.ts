import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  getTransformState,
  getPaintState,
  getHistoryPanelState,
  waitForMediaLoaded,
  waitForFrame,
  waitForExposure,
  waitForRotation,
  waitForTool,
  waitForColorReset,
  waitForCondition,
  clickTab,
  drawStroke,
} from './fixtures';

/**
 * Undo/Redo Cross-Feature Tests
 *
 * Tests that undo/redo works correctly across different operation types
 * (color changes, annotations, transforms) and that history is ordered.
 */

test.describe('Undo/Redo Cross-Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('URXF-001: Undo reverts color exposure change', async ({ page }) => {
    await clickTab(page, 'color');

    // Set exposure
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(1.5);
    });
    await waitForExposure(page, 1.5);

    const colorBefore = await getColorState(page);
    expect(colorBefore.exposure).toBeCloseTo(1.5, 1);

    // Undo
    await page.keyboard.press('Control+z');
    await waitForExposure(page, 0);

    const colorAfter = await getColorState(page);
    expect(colorAfter.exposure).toBeCloseTo(0, 1);
  });

  test('URXF-002: Undo reverts rotation', async ({ page }) => {
    await clickTab(page, 'transform');

    // Rotate 90 degrees
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setRotation?.(90);
    });
    await waitForRotation(page, 90);

    const transformBefore = await getTransformState(page);
    expect(transformBefore.rotation).toBe(90);

    // Undo
    await page.keyboard.press('Control+z');
    await waitForRotation(page, 0);

    const transformAfter = await getTransformState(page);
    expect(transformAfter.rotation).toBe(0);
  });

  test('URXF-003: Multiple undos revert in correct order', async ({ page }) => {
    // Step 1: Change exposure
    await clickTab(page, 'color');
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(1.0);
    });
    await waitForExposure(page, 1.0);

    // Step 2: Change exposure again
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(2.0);
    });
    await waitForExposure(page, 2.0);

    // Step 3: Rotate
    await clickTab(page, 'transform');
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setRotation?.(90);
    });
    await waitForRotation(page, 90);

    // Undo step 3 (rotation)
    await page.keyboard.press('Control+z');
    await waitForRotation(page, 0);
    const t1 = await getTransformState(page);
    expect(t1.rotation).toBe(0);

    // Undo step 2 (exposure 2.0 → 1.0)
    await page.keyboard.press('Control+z');
    await waitForExposure(page, 1.0);
    const c1 = await getColorState(page);
    expect(c1.exposure).toBeCloseTo(1.0, 1);

    // Undo step 1 (exposure 1.0 → 0)
    await page.keyboard.press('Control+z');
    await waitForExposure(page, 0);
    const c2 = await getColorState(page);
    expect(c2.exposure).toBeCloseTo(0, 1);
  });

  test('URXF-004: Redo restores undone operations', async ({ page }) => {
    await clickTab(page, 'color');

    // Set exposure
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(1.5);
    });
    await waitForExposure(page, 1.5);

    // Undo
    await page.keyboard.press('Control+z');
    await waitForExposure(page, 0);

    // Redo
    await page.keyboard.press('Control+Shift+z');
    await waitForExposure(page, 1.5);

    const colorState = await getColorState(page);
    expect(colorState.exposure).toBeCloseTo(1.5, 1);
  });

  test('URXF-005: History panel reflects operation count', async ({ page }) => {
    // Perform several operations
    await clickTab(page, 'color');
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(1.0);
    });
    await waitForExposure(page, 1.0);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setExposure?.(2.0);
    });
    await waitForExposure(page, 2.0);

    const historyState = await getHistoryPanelState(page);
    // Should have at least 2 entries (the two exposure changes)
    expect(historyState.entryCount).toBeGreaterThanOrEqual(2);
    expect(historyState.canUndo).toBe(true);
  });

  test('URXF-006: Undo after annotation removes the annotation', async ({ page }) => {
    await clickTab(page, 'annotate');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setTool?.('pen');
    });
    await waitForTool(page, 'pen');

    // Draw a stroke
    await drawStroke(page, [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
    ]);
    await page.waitForTimeout(200);

    const beforeUndo = await getPaintState(page);
    const countBefore = beforeUndo.visibleAnnotationCount;
    expect(countBefore).toBeGreaterThan(0);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const afterUndo = await getPaintState(page);
    expect(afterUndo.visibleAnnotationCount).toBeLessThan(countBefore);
  });
});
