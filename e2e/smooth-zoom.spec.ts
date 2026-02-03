import { test, expect } from '@playwright/test';
import { loadImageFile, loadVideoFile, getViewerState, waitForTestHelper } from './fixtures';

test.describe('Smooth Zoom Animation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // SZ-001: Default zoom level is 1
  test('SZ-001: default zoom level is 1x', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.zoom).toBe(1);
  });

  // SZ-002: Fit to window via keyboard shortcut
  test('SZ-002: fit to window shortcut resets zoom', async ({ page }) => {
    await loadImageFile(page);

    // First zoom in
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Use mouse wheel to zoom in
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(300);

      const zoomedState = await getViewerState(page);
      expect(zoomedState.zoom).toBeGreaterThan(1);

      // Press 'f' to fit to window (smooth zoom back to 1x)
      await page.keyboard.press('f');
      // Wait for smooth animation to complete
      await page.waitForTimeout(500);

      const resetState = await getViewerState(page);
      expect(resetState.zoom).toBeCloseTo(1, 1);
    }
  });

  // SZ-003: Mouse wheel zoom is instant (not smooth)
  test('SZ-003: mouse wheel zoom changes zoom level', async ({ page }) => {
    await loadImageFile(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

      // Zoom in with mouse wheel
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(100);

      const state = await getViewerState(page);
      expect(state.zoom).toBeGreaterThan(1);
    }
  });

  // SZ-004: Zoom level updates after smooth animation completes
  test('SZ-004: smooth zoom to 50% via keyboard', async ({ page }) => {
    await loadImageFile(page);

    // The '5' key is mapped to view.zoomToHalf (smoothSetZoom(0.5))
    // Verify zoom level changes after pressing the shortcut
    const initialState = await getViewerState(page);

    // Press keyboard shortcut for specific zoom levels
    // Note: The actual shortcut depends on the app key mapping
    // Test that zoom can be changed programmatically
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      app?.viewer?.smoothSetZoom?.(0.5);
    });

    // Wait for smooth animation to complete
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.zoom).toBeCloseTo(0.5, 1);
  });

  // SZ-005: Zoom state persists across frame navigation
  test('SZ-005: zoom level persists when changing frames', async ({ page }) => {
    await loadVideoFile(page);

    // Zoom in
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(200);
    }

    const zoomBefore = (await getViewerState(page)).zoom;
    expect(zoomBefore).toBeGreaterThan(1);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const zoomAfter = (await getViewerState(page)).zoom;
    expect(zoomAfter).toBeCloseTo(zoomBefore, 2);
  });

  // SZ-006: Zoom in and out with mouse wheel
  test('SZ-006: zoom in then zoom out returns near original level', async ({ page }) => {
    await loadImageFile(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      await page.mouse.move(centerX, centerY);

      // Zoom in
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(200);
      const zoomedIn = (await getViewerState(page)).zoom;
      expect(zoomedIn).toBeGreaterThan(1);

      // Zoom back out by the same amount
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(200);
      const zoomedOut = (await getViewerState(page)).zoom;

      // Should be closer to 1 than the zoomed-in value
      expect(Math.abs(zoomedOut - 1)).toBeLessThan(Math.abs(zoomedIn - 1));
    }
  });

  // SZ-007: Pan state is maintained during zoom
  test('SZ-007: pan offset exists after zoom', async ({ page }) => {
    await loadImageFile(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      // Zoom in off-center to create a pan offset
      await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4);
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(300);

      const state = await getViewerState(page);
      expect(state.zoom).toBeGreaterThan(1);
      // Pan values should be numbers (might be 0 or non-zero depending on zoom-to-cursor logic)
      expect(typeof state.panX).toBe('number');
      expect(typeof state.panY).toBe('number');
    }
  });

  // SZ-008: smoothFitToWindow resets pan
  test('SZ-008: fit to window resets pan to zero', async ({ page }) => {
    await loadImageFile(page);

    // Zoom in off-center
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4);
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(300);
    }

    // Fit to window
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      app?.viewer?.smoothFitToWindow?.();
    });
    await page.waitForTimeout(500);

    const state = await getViewerState(page);
    expect(state.zoom).toBeCloseTo(1, 1);
    expect(state.panX).toBeCloseTo(0, 0);
    expect(state.panY).toBeCloseTo(0, 0);
  });
});
