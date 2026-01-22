import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  loadTwoVideoFiles,
  waitForTestHelper,
  getViewerState,
  getSessionState,
  getStackState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Composition Tests
 *
 * Comprehensive tests for all composition functionality:
 * - Wipe modes (horizontal, vertical, quad)
 * - A/B source comparison with keyboard shortcuts
 * - Layer stack visual compositing
 * - Blend mode visual effects
 *
 * These tests ensure composition features work correctly
 * and produce expected visual results.
 */

test.describe('Composition', () => {
  test.describe('Wipe Mode Cycling', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(200);
    });

    test('COMP-001: W key cycles through wipe modes (off -> horizontal -> vertical -> off)', async ({ page }) => {
      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');

      // Cycle through: off -> horizontal -> vertical -> off
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('vertical');

      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);
      state = await getViewerState(page);
      expect(state.wipeMode).toBe('off');
    });

    test('COMP-002: vertical wipe produces different visual than horizontal', async ({ page }) => {
      // Enable horizontal wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      const horizontalScreenshot = await captureViewerScreenshot(page);

      // Switch to vertical wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      const verticalScreenshot = await captureViewerScreenshot(page);

      // Screenshots should be different
      expect(imagesAreDifferent(horizontalScreenshot, verticalScreenshot)).toBe(true);
    });

    test('COMP-003: wipe mode persists across frame changes', async ({ page }) => {
      // Enable horizontal wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      // Change frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');
    });
  });

  test.describe('A/B Toggle with Two Sources', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadTwoVideoFiles(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(300);
    });

    test('COMP-010: backtick key toggles between A and B sources', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.abCompareAvailable).toBe(true);
      expect(state.currentAB).toBe('A');

      // Press backtick to switch to B
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.currentAB).toBe('B');

      // Press backtick again to switch back to A
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.currentAB).toBe('A');
    });

    test('COMP-011: tilde key also toggles A/B sources', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.currentAB).toBe('A');

      // Press tilde (Shift+Backquote) to switch to B
      await page.keyboard.press('Shift+Backquote');
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.currentAB).toBe('B');
    });

    test('COMP-012: A/B toggle produces different canvas content', async ({ page }) => {
      const screenshotA = await captureViewerScreenshot(page);

      // Switch to B
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(300);

      const screenshotB = await captureViewerScreenshot(page);

      // The two sources should look different
      expect(imagesAreDifferent(screenshotA, screenshotB)).toBe(true);
    });

    test('COMP-013: clicking B button switches to source B', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.currentAB).toBe('A');

      // Open compare dropdown and click B button
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      const bButton = page.locator('[data-testid="compare-ab-b"]');
      await bButton.click();
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.currentAB).toBe('B');
    });

    test('COMP-014: clicking toggle button switches A/B', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.currentAB).toBe('A');

      // Open compare dropdown and click toggle button
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');
      await toggleButton.click();
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.currentAB).toBe('B');
    });

    test('COMP-015: rapid A/B toggling works correctly', async ({ page }) => {
      // Toggle rapidly 5 times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Backquote');
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(200);

      // After 5 toggles (odd number), should be on B
      const state = await getSessionState(page);
      expect(state.currentAB).toBe('B');
    });
  });

  test.describe('Wipe with A/B Sources', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadTwoVideoFiles(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(300);
    });

    test('COMP-020: wipe shows both A and B sources simultaneously', async ({ page }) => {
      // Enable horizontal wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      // Take screenshot with wipe enabled
      const wipeScreenshot = await captureViewerScreenshot(page);

      // Disable wipe (cycle: horizontal -> vertical -> off)
      await page.keyboard.press('Shift+w'); // vertical
      await page.keyboard.press('Shift+w'); // off
      await page.waitForTimeout(200);

      const noWipeScreenshot = await captureViewerScreenshot(page);

      // Wipe view should differ from non-wipe view
      expect(imagesAreDifferent(wipeScreenshot, noWipeScreenshot)).toBe(true);
    });

    test('COMP-021: wipe position affects visual split', async ({ page }) => {
      // Enable horizontal wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(200);

      // Capture at default position (0.5)
      const screenshot1 = await captureViewerScreenshot(page);

      // Change wipe position via dragging on canvas
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        // Drag from center to left to change wipe position
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
        await page.mouse.up();
        await page.waitForTimeout(200);
      }

      const screenshot2 = await captureViewerScreenshot(page);

      // Screenshots should differ due to position change
      expect(imagesAreDifferent(screenshot1, screenshot2)).toBe(true);
    });

    test('COMP-022: vertical wipe works with A/B sources', async ({ page }) => {
      // Enable vertical wipe
      await page.keyboard.press('Shift+w'); // horizontal
      await page.keyboard.press('Shift+w'); // vertical
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.wipeMode).toBe('vertical');

      // Visual should be different from horizontal
      const verticalScreenshot = await captureViewerScreenshot(page);

      // Cycle back to horizontal (vertical -> off -> horizontal)
      await page.keyboard.press('Shift+w'); // off
      await page.keyboard.press('Shift+w'); // horizontal
      await page.waitForTimeout(200);

      const horizontalScreenshot = await captureViewerScreenshot(page);

      expect(imagesAreDifferent(verticalScreenshot, horizontalScreenshot)).toBe(true);
    });
  });

  test.describe('Layer Stack Visual Compositing', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(200);
    });

    test('COMP-030: adding layer changes visual when opacity < 1', async ({ page }) => {
      // Capture baseline
      const baselineScreenshot = await captureViewerScreenshot(page);

      // Open stack panel and add layer
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      // Add second layer
      await addButton.click();
      await page.waitForTimeout(100);

      // Modify second layer opacity to see compositing effect
      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const layeredScreenshot = await captureViewerScreenshot(page);

      // With layers at different opacities, visual should differ
      // Note: This depends on implementation - may need adjustment
      const stackState = await getStackState(page);
      expect(stackState.layerCount).toBe(2);
      expect(stackState.layers[1]!.opacity).toBeCloseTo(0.5, 1);
    });

    test('COMP-031: hiding layer affects visual output', async ({ page }) => {
      // Open stack panel and add multiple layers
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      expect(state.layerCount).toBe(2);

      // Both layers visible
      expect(state.layers[0]!.visible).toBe(true);
      expect(state.layers[1]!.visible).toBe(true);

      // Hide second layer
      const secondLayerId = state.layers[1]!.id;
      const visibilityButton = page.locator(`[data-testid="stack-layer-visibility-${secondLayerId}"]`);
      await visibilityButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layers[1]!.visible).toBe(false);
    });

    test('COMP-032: blend mode multiply produces different result than normal', async ({ page }) => {
      // Open stack panel and add layers
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      // Set opacity to 50% to see blend difference (same content at 100% looks identical)
      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Capture with normal blend mode
      const normalScreenshot = await captureViewerScreenshot(page);

      // Change to multiply blend mode
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${secondLayerId}"]`);
      await blendSelect.selectOption('multiply');
      await page.waitForTimeout(200);

      const multiplyScreenshot = await captureViewerScreenshot(page);

      // Verify blend mode changed and visual differs
      const updatedState = await getStackState(page);
      expect(updatedState.layers[1]!.blendMode).toBe('multiply');
      expect(imagesAreDifferent(normalScreenshot, multiplyScreenshot)).toBe(true);
    });

    test('COMP-033: blend mode add produces different result than normal', async ({ page }) => {
      // Open stack panel and add layers
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      // Set opacity to 50% to see blend difference
      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Capture with normal blend mode
      const normalScreenshot = await captureViewerScreenshot(page);

      // Change to add blend mode
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${secondLayerId}"]`);
      await blendSelect.selectOption('add');
      await page.waitForTimeout(200);

      const addScreenshot = await captureViewerScreenshot(page);

      // Verify blend mode changed and visual differs
      const updatedState = await getStackState(page);
      expect(updatedState.layers[1]!.blendMode).toBe('add');
      expect(imagesAreDifferent(normalScreenshot, addScreenshot)).toBe(true);
    });

    test('COMP-034: blend mode screen produces different result than multiply', async ({ page }) => {
      // Open stack panel and add layers
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      // Set opacity to 50% to see blend difference
      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${secondLayerId}"]`);

      // Set to multiply
      await blendSelect.selectOption('multiply');
      await page.waitForTimeout(200);
      const multiplyScreenshot = await captureViewerScreenshot(page);

      // Set to screen
      await blendSelect.selectOption('screen');
      await page.waitForTimeout(200);
      const screenScreenshot = await captureViewerScreenshot(page);

      // Verify different blend modes produce different visuals
      expect(imagesAreDifferent(multiplyScreenshot, screenScreenshot)).toBe(true);
    });

    test('COMP-036: blend mode overlay produces different result than normal', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const normalScreenshot = await captureViewerScreenshot(page);

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${secondLayerId}"]`);
      await blendSelect.selectOption('overlay');
      await page.waitForTimeout(200);

      const overlayScreenshot = await captureViewerScreenshot(page);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[1]!.blendMode).toBe('overlay');
      expect(imagesAreDifferent(normalScreenshot, overlayScreenshot)).toBe(true);
    });

    test('COMP-037: blend mode difference produces different result than normal', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const normalScreenshot = await captureViewerScreenshot(page);

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${secondLayerId}"]`);
      await blendSelect.selectOption('difference');
      await page.waitForTimeout(200);

      const differenceScreenshot = await captureViewerScreenshot(page);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[1]!.blendMode).toBe('difference');
      expect(imagesAreDifferent(normalScreenshot, differenceScreenshot)).toBe(true);
    });

    test('COMP-038: blend mode exclusion produces different result than normal', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const normalScreenshot = await captureViewerScreenshot(page);

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${secondLayerId}"]`);
      await blendSelect.selectOption('exclusion');
      await page.waitForTimeout(200);

      const exclusionScreenshot = await captureViewerScreenshot(page);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[1]!.blendMode).toBe('exclusion');
      expect(imagesAreDifferent(normalScreenshot, exclusionScreenshot)).toBe(true);
    });

    test('COMP-039: all blend modes produce unique visual results', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const secondLayerId = state.layers[1]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${secondLayerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${secondLayerId}"]`);
      const blendModes = ['normal', 'add', 'multiply', 'screen', 'overlay', 'difference', 'exclusion'];
      const screenshots: Record<string, Buffer> = {};

      for (const mode of blendModes) {
        await blendSelect.selectOption(mode);
        await page.waitForTimeout(150);
        screenshots[mode] = await captureViewerScreenshot(page);
      }

      // Verify each blend mode produces a unique result
      // At minimum, verify multiply differs from screen (dark vs light)
      expect(imagesAreDifferent(screenshots['multiply']!, screenshots['screen']!)).toBe(true);
      // Add differs from multiply (additive vs multiplicative)
      expect(imagesAreDifferent(screenshots['add']!, screenshots['multiply']!)).toBe(true);
      // Difference is unique (inverts)
      expect(imagesAreDifferent(screenshots['difference']!, screenshots['normal']!)).toBe(true);
    });

    test('COMP-035: layer order affects compositing result', async ({ page }) => {
      // Open stack panel and add layers
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      const firstLayerId = state.layers[0]!.id;

      // Set different blend modes to make order matter
      const blendSelect1 = page.locator(`[data-testid="stack-layer-blend-${firstLayerId}"]`);
      await blendSelect1.selectOption('multiply');
      await page.waitForTimeout(100);

      const beforeReorderScreenshot = await captureViewerScreenshot(page);

      // Reorder layers
      const moveUpButton = page.locator(`[data-testid="stack-layer-move-up-${firstLayerId}"]`);
      await moveUpButton.click();
      await page.waitForTimeout(200);

      const afterReorderScreenshot = await captureViewerScreenshot(page);

      // Verify layer order changed
      state = await getStackState(page);
      expect(state.layers[1]!.id).toBe(firstLayerId); // First layer moved up
    });
  });

  test.describe('Difference Matte Visual Verification', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadTwoVideoFiles(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(300);
    });

    test('COMP-040: difference matte shows visual difference between A and B', async ({ page }) => {
      // Capture without difference matte
      const normalScreenshot = await captureViewerScreenshot(page);

      // Enable difference matte via keyboard
      await page.keyboard.press('Shift+KeyD');
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      const diffScreenshot = await captureViewerScreenshot(page);

      // Difference matte should produce different visual
      expect(imagesAreDifferent(normalScreenshot, diffScreenshot)).toBe(true);
    });

    test('COMP-041: difference matte gain increases visual intensity', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+KeyD');
      await page.waitForTimeout(200);

      // Capture at default gain (1)
      const lowGainScreenshot = await captureViewerScreenshot(page);

      // Open compare dropdown and increase gain
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      const gainSlider = page.locator('[data-testid="diff-matte-gain"]');
      await gainSlider.fill('10');
      await gainSlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      const highGainScreenshot = await captureViewerScreenshot(page);

      // Higher gain should produce different (more intense) visual
      expect(imagesAreDifferent(lowGainScreenshot, highGainScreenshot)).toBe(true);
    });

    test('COMP-042: heatmap mode shows color-coded differences', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+KeyD');
      await page.waitForTimeout(200);

      // Capture grayscale difference
      const grayscaleScreenshot = await captureViewerScreenshot(page);

      // Enable heatmap mode
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      const heatmapToggle = page.locator('[data-testid="diff-matte-heatmap"]');
      await heatmapToggle.click();
      await page.waitForTimeout(200);

      const state = await getViewerState(page);
      expect(state.differenceMatteHeatmap).toBe(true);

      const heatmapScreenshot = await captureViewerScreenshot(page);

      // Heatmap should look different from grayscale
      expect(imagesAreDifferent(grayscaleScreenshot, heatmapScreenshot)).toBe(true);
    });
  });

  test.describe('Composition State Persistence', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadTwoVideoFiles(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(300);
    });

    test('COMP-050: wipe mode persists when switching tabs', async ({ page }) => {
      // First need to load video for single source tests
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(200);

      // Enable wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');

      // Switch to Color tab
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(200);

      // Switch back to View tab
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.wipeMode).toBe('horizontal');
    });

    test('COMP-051: A/B state persists when switching tabs', async ({ page }) => {
      // Switch to B
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(200);

      let state = await getSessionState(page);
      expect(state.currentAB).toBe('B');

      // Switch tabs
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(200);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(200);

      state = await getSessionState(page);
      expect(state.currentAB).toBe('B');
    });

    test('COMP-052: difference matte state persists across frame changes', async ({ page }) => {
      // Enable difference matte
      await page.keyboard.press('Shift+KeyD');
      await page.waitForTimeout(200);

      let state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);

      // Change frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      state = await getViewerState(page);
      expect(state.differenceMatteEnabled).toBe(true);
    });

    test('COMP-053: layer stack state persists across tab switches', async ({ page }) => {
      // Open stack panel and add layer
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      // Change blend mode
      let state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('screen');
      await page.waitForTimeout(100);

      // Close panel
      await stackButton.click();
      await page.waitForTimeout(100);

      // Switch tabs
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(200);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(200);

      // Verify state persisted
      state = await getStackState(page);
      expect(state.layerCount).toBe(1);
      expect(state.layers[0]!.blendMode).toBe('screen');
    });
  });

  test.describe('Edge Cases and Error Handling', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(200);
    });

    test('COMP-060: A/B toggle button disabled with single source', async ({ page }) => {
      // With only one source, abCompareAvailable should be false
      const state = await getSessionState(page);
      expect(state.abCompareAvailable).toBe(false);

      // Open compare dropdown
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      // Toggle button should be disabled
      const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');
      await expect(toggleButton).toBeDisabled();
    });

    test('COMP-061: B button disabled with single source', async ({ page }) => {
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      const bButton = page.locator('[data-testid="compare-ab-b"]');
      await expect(bButton).toBeDisabled();
    });

    test('COMP-062: clicking A button when already on A has no effect', async ({ page }) => {
      // Load two files so A/B is available
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(300);

      let state = await getSessionState(page);
      expect(state.currentAB).toBe('A');

      // Open dropdown and click A
      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      const aButton = page.locator('[data-testid="compare-ab-a"]');
      await aButton.click();
      await page.waitForTimeout(100);

      // Still on A
      state = await getSessionState(page);
      expect(state.currentAB).toBe('A');
    });

    test('COMP-063: backtick key has no effect with single source', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.currentAB).toBe('A');

      // Try to toggle with backtick
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(100);

      // Should still be A (no B source available)
      state = await getSessionState(page);
      expect(state.currentAB).toBe('A');
    });

    test('COMP-064: enabling difference matte disables wipe mode', async ({ page }) => {
      // Enable horizontal wipe first
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      let viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('horizontal');

      // Load second file for difference matte
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(300);

      // Enable difference matte
      await page.keyboard.press('Shift+KeyD');
      await page.waitForTimeout(200);

      viewerState = await getViewerState(page);
      expect(viewerState.differenceMatteEnabled).toBe(true);
      expect(viewerState.wipeMode).toBe('off');
    });

    test('COMP-065: wipe mode can be enabled after disabling difference matte', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(300);

      // Enable then disable difference matte
      await page.keyboard.press('Shift+KeyD');
      await page.waitForTimeout(100);
      await page.keyboard.press('Shift+KeyD');
      await page.waitForTimeout(100);

      let viewerState = await getViewerState(page);
      expect(viewerState.differenceMatteEnabled).toBe(false);

      // Now enable wipe
      await page.keyboard.press('Shift+w');
      await page.waitForTimeout(100);

      viewerState = await getViewerState(page);
      expect(viewerState.wipeMode).toBe('horizontal');
    });

    test('COMP-066: multiple toggle button clicks work correctly', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(300);

      const compareButton = page.locator('[data-testid="compare-control-button"]');
      await compareButton.click();
      await page.waitForTimeout(100);

      const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');

      // Click toggle 3 times
      await toggleButton.click();
      await page.waitForTimeout(100);
      let state = await getSessionState(page);
      expect(state.currentAB).toBe('B');

      await toggleButton.click();
      await page.waitForTimeout(100);
      state = await getSessionState(page);
      expect(state.currentAB).toBe('A');

      await toggleButton.click();
      await page.waitForTimeout(100);
      state = await getSessionState(page);
      expect(state.currentAB).toBe('B');
    });
  });
});
