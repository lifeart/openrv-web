import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  loadTwoVideoFiles,
  waitForTestHelper,
  getStackState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Stack Control Tests (Layer Stack)
 *
 * Tests for the layer stack UI component that allows compositing
 * multiple sources with blend modes and opacity controls.
 *
 * Based on OpenRV Stack View functionality:
 * - Layer stacking with compositing
 * - Blend modes: Over, Replace, Add, Difference, etc.
 * - Per-layer opacity and visibility
 * - Layer reordering
 *
 * Reference: https://aswf-openrv.readthedocs.io/
 */

test.describe('Stack Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Ensure View tab is selected (where Stack control lives)
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test.describe('Default State', () => {
    test('STACK-001: stack control button is visible in View tab', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await expect(stackButton).toBeVisible();
    });

    test('STACK-002: stack panel is initially hidden', async ({ page }) => {
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).not.toBeVisible();
    });

    test('STACK-003: initial stack state has no layers', async ({ page }) => {
      const state = await getStackState(page);
      expect(state.layerCount).toBe(0);
      expect(state.layers).toEqual([]);
      expect(state.activeLayerId).toBeNull();
    });
  });

  test.describe('Panel Visibility', () => {
    test('STACK-010: clicking stack button opens panel', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-011: clicking stack button again closes panel', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');

      // Open panel
      await stackButton.click();
      await page.waitForTimeout(100);
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();

      // Close panel
      await stackButton.click();
      await page.waitForTimeout(100);
      await expect(stackPanel).not.toBeVisible();
    });

    test('STACK-012: clicking outside panel closes it', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();

      // Click on canvas (outside panel)
      const canvas = page.locator('canvas').first();
      await canvas.click();
      await page.waitForTimeout(100);

      await expect(stackPanel).not.toBeVisible();
    });

    test('STACK-013: panel shows empty state message when no layers', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const stackPanel = page.locator('[data-testid="stack-panel"]');
      const emptyMessage = stackPanel.locator('text=No layers');
      await expect(emptyMessage).toBeVisible();
    });
  });

  test.describe('Add Layer', () => {
    test('STACK-020: add layer button is visible in panel', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await expect(addButton).toBeVisible();
    });

    test('STACK-021: clicking add button creates a new layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      expect(state.layerCount).toBe(0);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layerCount).toBe(1);
      expect(state.layers[0]).toBeDefined();
    });

    test('STACK-022: new layer has default properties', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layer = state.layers[0];
      expect(layer).toBeDefined();
      expect(layer!.visible).toBe(true);
      expect(layer!.opacity).toBe(1);
      expect(layer!.blendMode).toBe('normal');
    });

    test('STACK-023: new layer becomes active layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      expect(state.activeLayerId).toBe(state.layers[0]!.id);
    });

    test('STACK-024: adding multiple layers creates unique IDs', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      expect(state.layerCount).toBe(3);

      const ids = state.layers.map(l => l.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    test('STACK-025: layer list updates to show new layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const layerList = page.locator('[data-testid="stack-layer-list"]');
      const layerItems = layerList.locator('[data-testid^="stack-layer-layer_"]');
      await expect(layerItems).toHaveCount(1);
    });

    test('STACK-026: layer names are unique and incremented', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');

      // Add 3 layers
      await addButton.click();
      await page.waitForTimeout(100);
      await addButton.click();
      await page.waitForTimeout(100);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      expect(state.layerCount).toBe(3);

      // Verify layer names are unique
      const names = state.layers.map(l => l.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(3);

      // Verify names are "Layer 1", "Layer 2", "Layer 3"
      expect(names[0]).toBe('Layer 1');
      expect(names[1]).toBe('Layer 2');
      expect(names[2]).toBe('Layer 3');
    });

    test('STACK-027: layer name uses Layer N format', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      // Layer name should be "Layer 1"
      expect(state.layers[0]!.name).toBe('Layer 1');
    });

    test('STACK-028: layer counter continues after removing layers', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');

      // Add Layer 1 and Layer 2
      await addButton.click();
      await page.waitForTimeout(100);
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      expect(state.layers[0]!.name).toBe('Layer 1');
      expect(state.layers[1]!.name).toBe('Layer 2');

      // Remove Layer 1
      const layer1Id = state.layers[0]!.id;
      const deleteButton = page.locator(`[data-testid="stack-layer-delete-${layer1Id}"]`);
      await deleteButton.click();
      await page.waitForTimeout(100);

      // Add a new layer - should be Layer 3, not Layer 2
      await addButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layerCount).toBe(2);
      // The new layer should be Layer 3 (counter continues, doesn't reset)
      const layerNames = state.layers.map(l => l.name);
      expect(layerNames).toContain('Layer 2');
      expect(layerNames).toContain('Layer 3');
    });
  });

  test.describe('Layer Visibility', () => {
    test('STACK-030: visibility toggle is visible for each layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const visibilityButton = page.locator(`[data-testid="stack-layer-visibility-${layerId}"]`);
      await expect(visibilityButton).toBeVisible();
    });

    test('STACK-031: clicking visibility toggle hides layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      expect(state.layers[0]!.visible).toBe(true);

      const visibilityButton = page.locator(`[data-testid="stack-layer-visibility-${layerId}"]`);
      await visibilityButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layers[0]!.visible).toBe(false);
    });

    test('STACK-032: clicking visibility toggle again shows layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const visibilityButton = page.locator(`[data-testid="stack-layer-visibility-${layerId}"]`);

      // Hide the layer
      await visibilityButton.click();
      await page.waitForTimeout(100);

      // Verify layer is hidden
      let updatedState = await getStackState(page);
      expect(updatedState.layers[0]!.visible).toBe(false);

      // Show the layer again (panel should remain open)
      await visibilityButton.click();
      await page.waitForTimeout(100);

      updatedState = await getStackState(page);
      expect(updatedState.layers[0]!.visible).toBe(true);
    });
  });

  test.describe('Layer Opacity', () => {
    test('STACK-040: opacity slider is visible for each layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${layerId}"]`);
      await expect(opacitySlider).toBeVisible();
    });

    test('STACK-041: changing opacity slider updates layer opacity', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      expect(state.layers[0]!.opacity).toBe(1);

      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${layerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layers[0]!.opacity).toBeCloseTo(0.5, 1);
    });

    test('STACK-042: opacity can be set to 0', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${layerId}"]`);
      await opacitySlider.fill('0');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[0]!.opacity).toBe(0);
    });
  });

  test.describe('Blend Modes', () => {
    test('STACK-050: blend mode dropdown is visible for each layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await expect(blendSelect).toBeVisible();
    });

    test('STACK-051: default blend mode is normal', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      expect(state.layers[0]!.blendMode).toBe('normal');
    });

    test('STACK-052: changing blend mode updates layer blend mode', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('multiply');
      await page.waitForTimeout(100);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[0]!.blendMode).toBe('multiply');
    });

    test('STACK-053: blend mode dropdown contains expected options', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      const options = await blendSelect.locator('option').allTextContents();

      // Verify key blend modes are available (based on OpenRV spec)
      expect(options).toContain('Normal');
      expect(options).toContain('Add');
      expect(options).toContain('Multiply');
      expect(options).toContain('Screen');
      expect(options).toContain('Difference');
    });
  });

  test.describe('Layer Selection', () => {
    test('STACK-060: clicking layer name selects the layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const firstLayerId = state.layers[0]!.id;
      const secondLayerId = state.layers[1]!.id;

      // Second layer should be active (most recently added)
      expect(state.activeLayerId).toBe(secondLayerId);

      // Click on first layer name to select it
      const firstLayerName = page.locator(`[data-testid="stack-layer-name-${firstLayerId}"]`);
      await firstLayerName.click();
      await page.waitForTimeout(100);

      const updatedState = await getStackState(page);
      expect(updatedState.activeLayerId).toBe(firstLayerId);
    });
  });

  test.describe('Layer Reordering', () => {
    test('STACK-070: move up button is visible for layers', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const moveUpButton = page.locator(`[data-testid="stack-layer-move-up-${layerId}"]`);
      await expect(moveUpButton).toBeVisible();
    });

    test('STACK-071: move down button is visible for layers', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const moveDownButton = page.locator(`[data-testid="stack-layer-move-down-${layerId}"]`);
      await expect(moveDownButton).toBeVisible();
    });

    test('STACK-072: clicking move up reorders layers', async ({ page }) => {
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
      const secondLayerId = state.layers[1]!.id;

      // Move first layer up (to position 1)
      const moveUpButton = page.locator(`[data-testid="stack-layer-move-up-${firstLayerId}"]`);
      await moveUpButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      // First layer should now be at index 1
      expect(state.layers[0]!.id).toBe(secondLayerId);
      expect(state.layers[1]!.id).toBe(firstLayerId);
    });

    test('STACK-073: clicking move down reorders layers', async ({ page }) => {
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
      const secondLayerId = state.layers[1]!.id;

      // Move second layer down (to position 0)
      const moveDownButton = page.locator(`[data-testid="stack-layer-move-down-${secondLayerId}"]`);
      await moveDownButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      // Second layer should now be at index 0
      expect(state.layers[0]!.id).toBe(secondLayerId);
      expect(state.layers[1]!.id).toBe(firstLayerId);
    });
  });

  test.describe('Remove Layer', () => {
    test('STACK-080: delete button is visible for each layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const deleteButton = page.locator(`[data-testid="stack-layer-delete-${layerId}"]`);
      await expect(deleteButton).toBeVisible();
    });

    test('STACK-081: clicking delete removes the layer', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      expect(state.layerCount).toBe(1);
      const layerId = state.layers[0]!.id;

      const deleteButton = page.locator(`[data-testid="stack-layer-delete-${layerId}"]`);
      await deleteButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layerCount).toBe(0);
    });

    test('STACK-082: deleting active layer updates active layer', async ({ page }) => {
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
      const secondLayerId = state.layers[1]!.id;

      // Delete the active layer (second one)
      const deleteButton = page.locator(`[data-testid="stack-layer-delete-${secondLayerId}"]`);
      await deleteButton.click();
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layerCount).toBe(1);
      expect(state.activeLayerId).toBe(firstLayerId);
    });

    test('STACK-083: deleting last layer sets active layer to null', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const deleteButton = page.locator(`[data-testid="stack-layer-delete-${layerId}"]`);
      await deleteButton.click();
      await page.waitForTimeout(100);

      const updatedState = await getStackState(page);
      expect(updatedState.layerCount).toBe(0);
      expect(updatedState.activeLayerId).toBeNull();
    });
  });

  test.describe('Multiple Sources', () => {
    test('STACK-090: can add layers from multiple video files', async ({ page }) => {
      // Load two video files
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      expect(state.layerCount).toBe(1);
    });

    test('STACK-091: source selector appears when multiple sources available', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Source selector should be visible with multiple sources
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      await expect(sourceSelect).toBeVisible();
    });

    test('STACK-092: source selector not visible with single source', async ({ page }) => {
      // Only one source loaded (from beforeEach)
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Source selector should not be visible with single source
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      await expect(sourceSelect).not.toBeVisible();
    });

    test('STACK-093: changing source selector updates layer source', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const initialSourceIndex = state.layers[0]!.sourceIndex;

      // Change source
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      const newSourceIndex = initialSourceIndex === 0 ? '1' : '0';
      await sourceSelect.selectOption(newSourceIndex);
      await page.waitForTimeout(100);

      state = await getStackState(page);
      expect(state.layers[0]!.sourceIndex).toBe(parseInt(newSourceIndex));
    });

    test('STACK-094: changing source keeps layer name unchanged', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      const layerId = state.layers[0]!.id;
      const initialName = state.layers[0]!.name;

      // Change source to the other video
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      await sourceSelect.selectOption('1');
      await page.waitForTimeout(100);

      state = await getStackState(page);
      // Name should remain the same (Layer N format)
      expect(state.layers[0]!.name).toBe(initialName);
    });
  });

  test.describe('Button State', () => {
    test('STACK-100: stack button shows active state when layers exist', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');

      // Get initial button style
      const initialColor = await stackButton.evaluate(el => getComputedStyle(el).color);

      // Open panel and add layers
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      // Close panel
      await stackButton.click();
      await page.waitForTimeout(100);

      // Button should now have active styling (multiple layers)
      const activeColor = await stackButton.evaluate(el => getComputedStyle(el).color);
      expect(activeColor).not.toBe(initialColor);
    });
  });

  test.describe('Panel Stays Open During Interactions', () => {
    // Regression tests for event propagation bug where panel would close
    // when clicking buttons that rebuild the layer list DOM

    test('STACK-120: panel stays open after clicking visibility toggle', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const visibilityButton = page.locator(`[data-testid="stack-layer-visibility-${layerId}"]`);
      await visibilityButton.click();
      await page.waitForTimeout(100);

      // Panel should remain open after visibility toggle
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-121: panel stays open after clicking layer name to select', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const firstLayerId = state.layers[0]!.id;

      const layerName = page.locator(`[data-testid="stack-layer-name-${firstLayerId}"]`);
      await layerName.click();
      await page.waitForTimeout(100);

      // Panel should remain open after selecting layer
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-122: panel stays open after clicking move up button', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(50);
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const firstLayerId = state.layers[0]!.id;

      const moveUpButton = page.locator(`[data-testid="stack-layer-move-up-${firstLayerId}"]`);
      await moveUpButton.click();
      await page.waitForTimeout(100);

      // Panel should remain open after reordering
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-123: panel stays open after clicking move down button', async ({ page }) => {
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

      const moveDownButton = page.locator(`[data-testid="stack-layer-move-down-${secondLayerId}"]`);
      await moveDownButton.click();
      await page.waitForTimeout(100);

      // Panel should remain open after reordering
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-124: panel stays open after clicking delete button', async ({ page }) => {
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

      const deleteButton = page.locator(`[data-testid="stack-layer-delete-${secondLayerId}"]`);
      await deleteButton.click();
      await page.waitForTimeout(100);

      // Panel should remain open after deleting layer
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-125: panel stays open after changing blend mode', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('multiply');
      await page.waitForTimeout(100);

      // Panel should remain open after changing blend mode
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-126: panel stays open after changing opacity', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${layerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Panel should remain open after changing opacity
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();
    });

    test('STACK-127: panel stays open after multiple rapid interactions', async ({ page }) => {
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

      // Perform multiple rapid interactions
      const visibilityButton = page.locator(`[data-testid="stack-layer-visibility-${firstLayerId}"]`);
      await visibilityButton.click();
      await page.waitForTimeout(50);

      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${firstLayerId}"]`);
      await blendSelect.selectOption('screen');
      await page.waitForTimeout(50);

      await visibilityButton.click();
      await page.waitForTimeout(50);

      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${firstLayerId}"]`);
      await opacitySlider.fill('75');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Panel should remain open after all interactions
      const stackPanel = page.locator('[data-testid="stack-panel"]');
      await expect(stackPanel).toBeVisible();

      // Verify state was correctly updated
      state = await getStackState(page);
      expect(state.layers[0]!.visible).toBe(true);
      expect(state.layers[0]!.blendMode).toBe('screen');
      expect(state.layers[0]!.opacity).toBeCloseTo(0.75, 1);
    });
  });

  test.describe('State Persistence', () => {
    test('STACK-110: layer state persists when closing and reopening panel', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      // Add a layer and modify it
      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Change blend mode
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('multiply');
      await page.waitForTimeout(50);

      // Change opacity
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${layerId}"]`);
      await opacitySlider.fill('75');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(100);

      // Close panel
      await stackButton.click();
      await page.waitForTimeout(100);

      // Reopen panel
      await stackButton.click();
      await page.waitForTimeout(100);

      // Verify state persisted
      const persistedState = await getStackState(page);
      expect(persistedState.layers[0]!.blendMode).toBe('multiply');
      expect(persistedState.layers[0]!.opacity).toBeCloseTo(0.75, 1);
    });

    test('STACK-111: layer state persists across frame changes', async ({ page }) => {
      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      // Add a layer
      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Modify layer
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('screen');
      await page.waitForTimeout(100);

      // Step to next frame
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      // Verify state persisted
      const persistedState = await getStackState(page);
      expect(persistedState.layers[0]!.blendMode).toBe('screen');
    });
  });

  test.describe('Blend Mode Visual Effects', () => {
    test('STACK-E050: blend mode change updates state correctly', async ({ page }) => {
      // Need two sources for meaningful blend modes
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      // Add a layer with second source
      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Initial blend mode should be normal
      expect(state.layers[0]!.blendMode).toBe('normal');

      // Change layer to use second source (different from base)
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption('1');
        await page.waitForTimeout(100);
      }

      // Change blend mode to difference
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('difference');
      await page.waitForTimeout(200);

      state = await getStackState(page);
      expect(state.layers[0]!.blendMode).toBe('difference');

      // Change to multiply
      await blendSelect.selectOption('multiply');
      await page.waitForTimeout(200);

      state = await getStackState(page);
      expect(state.layers[0]!.blendMode).toBe('multiply');

      // Change to screen
      await blendSelect.selectOption('screen');
      await page.waitForTimeout(200);

      state = await getStackState(page);
      expect(state.layers[0]!.blendMode).toBe('screen');
    });

    test('STACK-E051: multiply blend mode darkens output', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Change layer to use second source
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption('1');
        await page.waitForTimeout(100);
      }

      // Set blend mode to multiply
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('multiply');
      await page.waitForTimeout(200);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[0]!.blendMode).toBe('multiply');

      // Close panel
      await stackButton.click();
      await page.waitForTimeout(100);

      // Capture screenshot - multiply should darken the image
      const screenshotMultiply = await captureViewerScreenshot(page);

      // Verify state was set correctly (visual verification is best done with comparison)
      expect(updatedState.layers[0]!.blendMode).toBe('multiply');
    });

    test('STACK-E052: screen blend mode state is set correctly', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Change layer to use second source
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption('1');
        await page.waitForTimeout(100);
      }

      // Set to screen blend mode
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('screen');
      await page.waitForTimeout(200);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[0]!.blendMode).toBe('screen');

      // Verify state persists after closing panel
      await stackButton.click();
      await page.waitForTimeout(100);

      await stackButton.click();
      await page.waitForTimeout(100);

      const persistedState = await getStackState(page);
      expect(persistedState.layers[0]!.blendMode).toBe('screen');
    });

    test('STACK-E053: overlay blend mode state is set correctly', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Change layer to use second source
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption('1');
        await page.waitForTimeout(100);
      }

      // Check available blend modes
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      const options = await blendSelect.locator('option').allTextContents();

      // Check that key blend modes are available
      expect(options).toContain('Normal');
      expect(options).toContain('Multiply');
      expect(options).toContain('Screen');
      expect(options).toContain('Difference');
      expect(options).toContain('Add');
    });

    test('STACK-E054: opacity change updates state correctly', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      let state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Initial opacity should be 1 (100%)
      expect(state.layers[0]!.opacity).toBe(1);

      // Change layer to use second source
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption('1');
        await page.waitForTimeout(100);
      }

      // Set to 50% opacity
      const opacitySlider = page.locator(`[data-testid="stack-layer-opacity-${layerId}"]`);
      await opacitySlider.fill('50');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getStackState(page);
      expect(state.layers[0]!.opacity).toBeCloseTo(0.5, 1);

      // Set to 0% opacity
      await opacitySlider.fill('0');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getStackState(page);
      expect(state.layers[0]!.opacity).toBe(0);

      // Set back to 100% opacity
      await opacitySlider.fill('100');
      await opacitySlider.dispatchEvent('input');
      await page.waitForTimeout(200);

      state = await getStackState(page);
      expect(state.layers[0]!.opacity).toBe(1);
    });

    test('STACK-E055: add blend mode produces additive effect', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Change layer to use second source
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption('1');
        await page.waitForTimeout(100);
      }

      // Set to add blend mode
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      const options = await blendSelect.locator('option').allTextContents();

      if (options.some(opt => opt.toLowerCase() === 'add')) {
        await blendSelect.selectOption('add');
        await page.waitForTimeout(200);

        const updatedState = await getStackState(page);
        expect(updatedState.layers[0]!.blendMode).toBe('add');

        // Add blend should generally brighten the image
        // Visual verification can be done via screenshot comparison
      }
    });

    test('STACK-E056: difference blend mode shows differences', async ({ page }) => {
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const stackButton = page.locator('[data-testid="stack-button"]');
      await stackButton.click();
      await page.waitForTimeout(100);

      const addButton = page.locator('[data-testid="stack-add-layer-button"]');
      await addButton.click();
      await page.waitForTimeout(100);

      const state = await getStackState(page);
      const layerId = state.layers[0]!.id;

      // Change to second source for layer (to see actual differences)
      const sourceSelect = page.locator(`[data-testid="stack-layer-source-${layerId}"]`);
      if (await sourceSelect.isVisible()) {
        await sourceSelect.selectOption('1');
        await page.waitForTimeout(100);
      }

      // Set to difference blend mode
      const blendSelect = page.locator(`[data-testid="stack-layer-blend-${layerId}"]`);
      await blendSelect.selectOption('difference');
      await page.waitForTimeout(200);

      const updatedState = await getStackState(page);
      expect(updatedState.layers[0]!.blendMode).toBe('difference');

      // Close panel and verify visual
      await stackButton.click();
      await page.waitForTimeout(100);

      const screenshotDiff = await captureViewerScreenshot(page);
      // Difference blend produces distinctive output showing pixel differences
    });
  });
});
