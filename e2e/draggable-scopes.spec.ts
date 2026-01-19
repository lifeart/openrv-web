import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
} from './fixtures';

/**
 * Draggable Scopes Feature Tests
 *
 * These tests verify the draggable container functionality for
 * Histogram, Waveform, and Vectorscope overlays.
 */

test.describe('Histogram Dragging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
  });

  test('DRAG-H001: histogram container is visible and has draggable header', async ({ page }) => {
    const container = page.locator('.histogram-container');
    await expect(container).toBeVisible();

    const header = page.locator('[data-testid="histogram-header"]');
    await expect(header).toBeVisible();

    // Header should have grab cursor
    const cursor = await header.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('grab');
  });

  test('DRAG-H002: histogram can be dragged to a new position', async ({ page }) => {
    const container = page.locator('.histogram-container');
    const header = page.locator('[data-testid="histogram-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag the header
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 100, initialBox!.y + 50);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Get new position
    const newBox = await container.boundingBox();
    expect(newBox).not.toBeNull();

    // Position should have changed
    expect(newBox!.x).not.toBe(initialBox!.x);
    expect(newBox!.y).not.toBe(initialBox!.y);
  });

  test('DRAG-H003: histogram position persists after dragging', async ({ page }) => {
    const container = page.locator('.histogram-container');
    const header = page.locator('[data-testid="histogram-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag to new position
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 80, initialBox!.y + 60);
    await page.mouse.up();
    await page.waitForTimeout(100);

    const afterDragBox = await container.boundingBox();
    expect(afterDragBox).not.toBeNull();

    // Change frame (should not reset position)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const afterFrameChangeBox = await container.boundingBox();
    expect(afterFrameChangeBox).not.toBeNull();

    // Position should remain the same
    expect(Math.abs(afterFrameChangeBox!.x - afterDragBox!.x)).toBeLessThan(2);
    expect(Math.abs(afterFrameChangeBox!.y - afterDragBox!.y)).toBeLessThan(2);
  });

  test('DRAG-H004: clicking close button still works after dragging', async ({ page }) => {
    const container = page.locator('.histogram-container');
    const header = page.locator('[data-testid="histogram-header"]');
    const closeButton = page.locator('[data-testid="histogram-close-button"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Now click close button
    await closeButton.click();
    await page.waitForTimeout(100);

    // Histogram should be hidden
    await expect(container).toBeHidden();
  });

  test('DRAG-H005: mode button still works after dragging', async ({ page }) => {
    const container = page.locator('.histogram-container');
    const header = page.locator('[data-testid="histogram-header"]');
    const modeButton = page.locator('[data-testid="histogram-mode-button"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Verify initial mode
    await expect(modeButton).toHaveText('RGB');

    // Click mode button
    await modeButton.click();
    await page.waitForTimeout(100);

    // Mode should change
    await expect(modeButton).toHaveText('Luma');
  });
});

test.describe('Waveform Dragging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('DRAG-W001: waveform container is visible and has draggable header', async ({ page }) => {
    const container = page.locator('.waveform-container');
    await expect(container).toBeVisible();

    const header = page.locator('[data-testid="waveform-header"]');
    await expect(header).toBeVisible();

    // Header should have grab cursor
    const cursor = await header.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('grab');
  });

  test('DRAG-W002: waveform can be dragged to a new position', async ({ page }) => {
    const container = page.locator('.waveform-container');
    const header = page.locator('[data-testid="waveform-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag the header
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 100, initialBox!.y + 50);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Get new position
    const newBox = await container.boundingBox();
    expect(newBox).not.toBeNull();

    // Position should have changed
    expect(newBox!.x).not.toBe(initialBox!.x);
    expect(newBox!.y).not.toBe(initialBox!.y);
  });

  test('DRAG-W003: waveform position persists after dragging', async ({ page }) => {
    const container = page.locator('.waveform-container');
    const header = page.locator('[data-testid="waveform-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag to new position
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 80, initialBox!.y + 60);
    await page.mouse.up();
    await page.waitForTimeout(100);

    const afterDragBox = await container.boundingBox();
    expect(afterDragBox).not.toBeNull();

    // Change frame (should not reset position)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const afterFrameChangeBox = await container.boundingBox();
    expect(afterFrameChangeBox).not.toBeNull();

    // Position should remain the same
    expect(Math.abs(afterFrameChangeBox!.x - afterDragBox!.x)).toBeLessThan(2);
    expect(Math.abs(afterFrameChangeBox!.y - afterDragBox!.y)).toBeLessThan(2);
  });

  test('DRAG-W004: clicking close button still works after dragging', async ({ page }) => {
    const container = page.locator('.waveform-container');
    const header = page.locator('[data-testid="waveform-header"]');
    const closeButton = page.locator('[data-testid="waveform-close-button"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Now click close button
    await closeButton.click();
    await page.waitForTimeout(100);

    // Waveform should be hidden
    await expect(container).toBeHidden();
  });

  test('DRAG-W005: mode button still works after dragging', async ({ page }) => {
    const container = page.locator('.waveform-container');
    const header = page.locator('[data-testid="waveform-header"]');
    const modeButton = page.locator('[data-testid="waveform-mode-button"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Verify initial mode
    await expect(modeButton).toHaveText('Luma');

    // Click mode button
    await modeButton.click();
    await page.waitForTimeout(100);

    // Mode should change
    await expect(modeButton).toHaveText('RGB');
  });
});

test.describe('Vectorscope Dragging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show vectorscope
    await page.keyboard.press('y');
    await page.waitForTimeout(100);
  });

  test('DRAG-V001: vectorscope container is visible and has draggable header', async ({ page }) => {
    const container = page.locator('.vectorscope-container');
    await expect(container).toBeVisible();

    const header = page.locator('[data-testid="vectorscope-header"]');
    await expect(header).toBeVisible();

    // Header should have grab cursor
    const cursor = await header.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('grab');
  });

  test('DRAG-V002: vectorscope can be dragged to a new position', async ({ page }) => {
    const container = page.locator('.vectorscope-container');
    const header = page.locator('[data-testid="vectorscope-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag the header
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 100, initialBox!.y - 50);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Get new position
    const newBox = await container.boundingBox();
    expect(newBox).not.toBeNull();

    // Position should have changed (at least one coordinate)
    const xChanged = Math.abs(newBox!.x - initialBox!.x) > 5;
    const yChanged = Math.abs(newBox!.y - initialBox!.y) > 5;
    expect(xChanged || yChanged).toBe(true);
  });

  test('DRAG-V003: vectorscope position persists after dragging', async ({ page }) => {
    const container = page.locator('.vectorscope-container');
    const header = page.locator('[data-testid="vectorscope-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag to new position (move up since vectorscope starts at bottom)
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 80, initialBox!.y - 60);
    await page.mouse.up();
    await page.waitForTimeout(100);

    const afterDragBox = await container.boundingBox();
    expect(afterDragBox).not.toBeNull();

    // Change frame (should not reset position)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const afterFrameChangeBox = await container.boundingBox();
    expect(afterFrameChangeBox).not.toBeNull();

    // Position should remain the same
    expect(Math.abs(afterFrameChangeBox!.x - afterDragBox!.x)).toBeLessThan(2);
    expect(Math.abs(afterFrameChangeBox!.y - afterDragBox!.y)).toBeLessThan(2);
  });

  test('DRAG-V004: clicking close button still works after dragging', async ({ page }) => {
    const container = page.locator('.vectorscope-container');
    const header = page.locator('[data-testid="vectorscope-header"]');
    const closeButton = page.locator('[data-testid="vectorscope-close-button"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y - 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Now click close button
    await closeButton.click();
    await page.waitForTimeout(100);

    // Vectorscope should be hidden
    await expect(container).toBeHidden();
  });

  test('DRAG-V005: zoom button still works after dragging', async ({ page }) => {
    const container = page.locator('.vectorscope-container');
    const header = page.locator('[data-testid="vectorscope-header"]');
    const zoomButton = page.locator('[data-testid="vectorscope-zoom-button"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y - 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Verify initial zoom is Auto (shows A:Nx after update)
    await expect(zoomButton).toContainText('A:');

    // Click zoom button to cycle to 1x
    await zoomButton.click();
    await page.waitForTimeout(100);

    // Zoom should change to 1x
    await expect(zoomButton).toHaveText('1x');
  });

  test('DRAG-V006: vectorscope starts with auto zoom by default', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="vectorscope-zoom-button"]');

    // Default zoom should be Auto (shows A:Nx format after image update)
    await expect(zoomButton).toContainText('A:');
  });

  test('DRAG-V007: auto zoom cycles through all levels', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="vectorscope-zoom-button"]');

    // Start at Auto (shows A:Nx after update)
    await expect(zoomButton).toContainText('A:');

    // Cycle: Auto -> 1x
    await zoomButton.click();
    await page.waitForTimeout(100);
    await expect(zoomButton).toHaveText('1x');

    // Cycle: 1x -> 2x
    await zoomButton.click();
    await page.waitForTimeout(100);
    await expect(zoomButton).toHaveText('2x');

    // Cycle: 2x -> 4x
    await zoomButton.click();
    await page.waitForTimeout(100);
    await expect(zoomButton).toHaveText('4x');

    // Cycle: 4x -> Auto (back to auto mode)
    await zoomButton.click();
    await page.waitForTimeout(100);
    await expect(zoomButton).toContainText('A:');
  });

  test('DRAG-V008: auto zoom shows calculated zoom level format', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="vectorscope-zoom-button"]');

    // In auto mode, button should show "A:Nx" format (e.g., A:1x, A:2x, A:4x)
    const buttonText = await zoomButton.textContent();
    expect(buttonText).toMatch(/^A:[124]x$/);
  });
});

test.describe('Curves Panel Dragging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show curves panel
    await page.keyboard.press('u');
    await page.waitForTimeout(100);
  });

  test('DRAG-C001: curves panel is visible and has draggable header', async ({ page }) => {
    const container = page.locator('[data-testid="curves-control"]');
    await expect(container).toBeVisible();

    const header = page.locator('[data-testid="curves-control-header"]');
    await expect(header).toBeVisible();

    // Header should have grab cursor
    const cursor = await header.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('grab');
  });

  test('DRAG-C002: curves panel can be dragged to a new position', async ({ page }) => {
    const container = page.locator('[data-testid="curves-control"]');
    const header = page.locator('[data-testid="curves-control-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag the header
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 100, initialBox!.y + 50);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Get new position
    const newBox = await container.boundingBox();
    expect(newBox).not.toBeNull();

    // Position should have changed
    expect(newBox!.x).not.toBe(initialBox!.x);
    expect(newBox!.y).not.toBe(initialBox!.y);
  });

  test('DRAG-C003: curves panel position persists after dragging', async ({ page }) => {
    const container = page.locator('[data-testid="curves-control"]');
    const header = page.locator('[data-testid="curves-control-header"]');

    // Get initial position
    const initialBox = await container.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag to new position
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 80, initialBox!.y + 60);
    await page.mouse.up();
    await page.waitForTimeout(100);

    const afterDragBox = await container.boundingBox();
    expect(afterDragBox).not.toBeNull();

    // Change frame (should not reset position)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const afterFrameChangeBox = await container.boundingBox();
    expect(afterFrameChangeBox).not.toBeNull();

    // Position should remain the same
    expect(Math.abs(afterFrameChangeBox!.x - afterDragBox!.x)).toBeLessThan(2);
    expect(Math.abs(afterFrameChangeBox!.y - afterDragBox!.y)).toBeLessThan(2);
  });

  test('DRAG-C004: clicking close button still works after dragging', async ({ page }) => {
    const container = page.locator('[data-testid="curves-control"]');
    const header = page.locator('[data-testid="curves-control-header"]');
    const closeButton = page.locator('[data-testid="curves-control-close-button"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Now click close button
    await closeButton.click();
    await page.waitForTimeout(100);

    // Curves panel should be hidden
    await expect(container).toBeHidden();
  });

  test('DRAG-C005: reset button still works after dragging', async ({ page }) => {
    const container = page.locator('[data-testid="curves-control"]');
    const header = page.locator('[data-testid="curves-control-header"]');
    const resetBtn = page.locator('[data-testid="curves-reset"]');
    const presetSelect = page.locator('[data-testid="curves-preset"]');

    // Change preset first
    await presetSelect.selectOption({ index: 1 });
    await page.waitForTimeout(100);

    // Drag the panel
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Click reset button
    await resetBtn.click();
    await page.waitForTimeout(100);

    // Preset should be reset to index 0
    const selectedValue = await presetSelect.inputValue();
    expect(selectedValue).toBe('0');
  });

  test('DRAG-C006: preset dropdown still works after dragging', async ({ page }) => {
    const container = page.locator('[data-testid="curves-control"]');
    const header = page.locator('[data-testid="curves-control-header"]');
    const presetSelect = page.locator('[data-testid="curves-preset"]');

    // Drag first
    const initialBox = await container.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 50, initialBox!.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Select a preset
    await presetSelect.selectOption({ index: 2 });
    await page.waitForTimeout(100);

    // Verify preset changed
    const selectedValue = await presetSelect.inputValue();
    expect(selectedValue).toBe('2');
  });
});

test.describe('Multiple Scopes Dragging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('DRAG-M001: multiple scopes can be shown and dragged independently', async ({ page }) => {
    // Show all three scopes
    await page.keyboard.press('h'); // Histogram
    await page.waitForTimeout(100);
    await page.keyboard.press('w'); // Waveform
    await page.waitForTimeout(100);
    await page.keyboard.press('y'); // Vectorscope
    await page.waitForTimeout(100);

    // Verify all are visible
    const histogram = page.locator('.histogram-container');
    const waveform = page.locator('.waveform-container');
    const vectorscope = page.locator('.vectorscope-container');

    await expect(histogram).toBeVisible();
    await expect(waveform).toBeVisible();
    await expect(vectorscope).toBeVisible();

    // Get initial positions
    const histogramBox = await histogram.boundingBox();
    const waveformBox = await waveform.boundingBox();

    // Drag histogram
    const histogramHeader = page.locator('[data-testid="histogram-header"]');
    await histogramHeader.hover();
    await page.mouse.down();
    await page.mouse.move(histogramBox!.x - 100, histogramBox!.y + 50);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Drag waveform
    const waveformHeader = page.locator('[data-testid="waveform-header"]');
    await waveformHeader.hover();
    await page.mouse.down();
    await page.mouse.move(waveformBox!.x + 100, waveformBox!.y + 100);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Verify positions changed independently
    const newHistogramBox = await histogram.boundingBox();
    const newWaveformBox = await waveform.boundingBox();

    // Histogram should have moved
    expect(newHistogramBox!.x).not.toBe(histogramBox!.x);

    // Waveform should have moved
    expect(newWaveformBox!.x).not.toBe(waveformBox!.x);
    expect(newWaveformBox!.y).not.toBe(waveformBox!.y);
  });

  test('DRAG-M002: scope positions persist when switching tabs', async ({ page }) => {
    // Show histogram
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    const histogram = page.locator('.histogram-container');
    const header = page.locator('[data-testid="histogram-header"]');

    // Drag to new position
    const initialBox = await histogram.boundingBox();
    await header.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox!.x + 100, initialBox!.y + 50);
    await page.mouse.up();
    await page.waitForTimeout(100);

    const afterDragBox = await histogram.boundingBox();

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    // Histogram should still be visible at same position
    await expect(histogram).toBeVisible();
    const afterTabSwitchBox = await histogram.boundingBox();

    expect(Math.abs(afterTabSwitchBox!.x - afterDragBox!.x)).toBeLessThan(2);
    expect(Math.abs(afterTabSwitchBox!.y - afterDragBox!.y)).toBeLessThan(2);

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Position should still be preserved
    const finalBox = await histogram.boundingBox();
    expect(Math.abs(finalBox!.x - afterDragBox!.x)).toBeLessThan(2);
    expect(Math.abs(finalBox!.y - afterDragBox!.y)).toBeLessThan(2);
  });
});
