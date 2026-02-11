import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
  SAMPLE_EXR_MULTILAYER,
} from './fixtures';
import path from 'path';

/**
 * EXR Layer/AOV Selection Tests
 *
 * Tests for multi-layer EXR support including:
 * - Layer detection and listing
 * - Layer selection UI
 * - Visual changes when switching layers
 */

async function selectChannelMode(
  page: import('@playwright/test').Page,
  channel: 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance'
): Promise<void> {
  await page.click('[data-testid="channel-select-button"]');
  const dropdown = page.locator('[data-testid="channel-dropdown"]');
  await expect(dropdown).toBeVisible();
  await dropdown.locator(`button[data-value="${channel}"]`).click();
  await page.waitForTimeout(100);
}

test.describe('EXR Layer Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test.describe('Layer Detection', () => {
    test('AOV-001: should detect multiple layers in multi-layer EXR', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Check viewer state for layer info
      const viewerState = await getViewerState(page);

      // Should have detected multiple layers
      expect(viewerState.exrLayerCount).toBeGreaterThan(1);
      expect(viewerState.exrAvailableLayers).toContain('RGBA');
      expect(viewerState.exrAvailableLayers).toContain('diffuse');
      expect(viewerState.exrAvailableLayers).toContain('specular');
    });

    test('AOV-002: should default to RGBA layer', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      const viewerState = await getViewerState(page);

      // Default selection should be null (RGBA)
      expect(viewerState.exrSelectedLayer).toBeNull();
    });
  });

  test.describe('Layer Selector UI', () => {
    test('AOV-010: should show layer selector for multi-layer EXR', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Layer selector should be visible
      const layerSelector = page.locator('[data-testid="exr-layer-select"]');
      await expect(layerSelector).toBeVisible();
    });

    test('AOV-011: should not show layer selector for single-layer EXR', async ({ page }) => {
      // Load single-layer EXR file (test_hdr.exr has only RGBA)
      const filePath = path.resolve(process.cwd(), 'sample/test_hdr.exr');
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for media to load
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getSessionState();
          return state?.hasMedia === true;
        },
        { timeout: 5000 }
      );

      // Layer selector should not be visible
      const layerSelector = page.locator('[data-testid="exr-layer-select"]');
      await expect(layerSelector).not.toBeVisible();
    });

    test('AOV-012: should open layer dropdown on click', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Click the layer button
      const layerButton = page.locator('[data-testid="exr-layer-button"]');
      await layerButton.click();

      // Dropdown should be visible
      const dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
    });

    test('AOV-013: should list all available layers in dropdown', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Click the layer button to open dropdown
      const layerButton = page.locator('[data-testid="exr-layer-button"]');
      await layerButton.click();

      // Dropdown should be visible
      const dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Check for layer options
      const options = dropdown.locator('button[role="option"]');

      // Should have at least RGBA, diffuse, specular
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThanOrEqual(3);

      // Check specific layer names
      await expect(dropdown.getByText('RGBA')).toBeVisible();
      await expect(dropdown.getByText('diffuse')).toBeVisible();
      await expect(dropdown.getByText('specular')).toBeVisible();
    });
  });

  test.describe('Layer Selection', () => {
    test('AOV-020: clicking layer should update state', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Open dropdown and select diffuse
      const layerButton = page.locator('[data-testid="exr-layer-button"]');
      await layerButton.click();

      const dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
      await dropdown.getByText('diffuse').click();

      // Wait for layer selection to update
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrSelectedLayer === 'diffuse';
        },
        { timeout: 5000 }
      );

      // Check state
      const viewerState = await getViewerState(page);
      expect(viewerState.exrSelectedLayer).toBe('diffuse');
    });

    test('AOV-021: selecting layer should change canvas content', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Capture RGBA view
      const rgbaScreenshot = await captureViewerScreenshot(page);

      // Select diffuse layer
      const layerButton = page.locator('[data-testid="exr-layer-button"]');
      await layerButton.click();

      const dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
      await dropdown.getByText('diffuse').click();

      // Wait for layer selection to update
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrSelectedLayer === 'diffuse';
        },
        { timeout: 5000 }
      );

      // Capture diffuse view
      const diffuseScreenshot = await captureViewerScreenshot(page);

      // Views should be different (RGBA is reddish, diffuse is greenish)
      expect(imagesAreDifferent(rgbaScreenshot, diffuseScreenshot)).toBe(true);
    });

    test('AOV-022: should switch back to RGBA layer', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Select diffuse layer
      let layerButton = page.locator('[data-testid="exr-layer-button"]');
      await layerButton.click();

      let dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
      await dropdown.getByText('diffuse').click();

      // Wait for layer selection to update
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrSelectedLayer === 'diffuse';
        },
        { timeout: 5000 }
      );

      let viewerState = await getViewerState(page);
      expect(viewerState.exrSelectedLayer).toBe('diffuse');

      // Select RGBA layer
      await layerButton.click();

      dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
      await dropdown.getByText('RGBA').click();

      // Wait for layer selection to update back to null (RGBA)
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrSelectedLayer === null;
        },
        { timeout: 5000 }
      );

      viewerState = await getViewerState(page);
      expect(viewerState.exrSelectedLayer).toBeNull();
    });

    test('AOV-023: layer button should highlight when non-default layer selected', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      const layerButton = page.locator('[data-testid="exr-layer-button"]');

      // Initially should not have accent color
      const initialColor = await layerButton.evaluate(el => el.style.color);
      expect(initialColor).not.toBe('var(--accent-primary)');

      // Select diffuse layer
      await layerButton.click();

      const dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
      await dropdown.getByText('diffuse').click();

      // Wait for layer selection to update
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrSelectedLayer === 'diffuse';
        },
        { timeout: 5000 }
      );

      // Should now have accent color
      const activeColor = await layerButton.evaluate(el => el.style.color);
      expect(activeColor).toBe('var(--accent-primary)');
    });
  });

  test.describe('Layer Selection with Channel Isolation', () => {
    test('AOV-030: channel isolation should work with selected layer', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Select diffuse layer
      const layerButton = page.locator('[data-testid="exr-layer-button"]');
      await layerButton.click();

      const dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
      await dropdown.getByText('diffuse').click();

      // Wait for layer selection to update
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrSelectedLayer === 'diffuse';
        },
        { timeout: 5000 }
      );

      // Apply red channel isolation
      await selectChannelMode(page, 'red');

      // Verify channel mode changed
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.channelMode === 'red' && state?.exrSelectedLayer === 'diffuse';
        },
        { timeout: 5000 },
      );

      const viewerState = await getViewerState(page);
      expect(viewerState.channelMode).toBe('red');
      expect(viewerState.exrSelectedLayer).toBe('diffuse');
    });

    test('AOV-031: layer selection should persist through channel mode changes', async ({ page }) => {
      // Load multi-layer EXR file
      const filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Select specular layer
      const layerButton = page.locator('[data-testid="exr-layer-button"]');
      await layerButton.click();

      const dropdown = page.locator('[data-testid="exr-layer-dropdown"]');
      await expect(dropdown).toBeVisible();
      await dropdown.getByText('specular').click();

      // Wait for layer selection to update
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrSelectedLayer === 'specular';
        },
        { timeout: 5000 }
      );

      // Apply channel isolation
      await selectChannelMode(page, 'green');

      // Reset to RGB
      await selectChannelMode(page, 'rgb');

      // Layer selection should still be specular
      const viewerState = await getViewerState(page);
      expect(viewerState.exrSelectedLayer).toBe('specular');
      expect(viewerState.channelMode).toBe('rgb');
    });
  });

  test.describe('Layer Selection Cleanup', () => {
    test('AOV-040: should clear layers when loading non-EXR file', async ({ page }) => {
      // Reload the page to start fresh (no sources)
      await page.reload();
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load multi-layer EXR file first
      let filePath = path.resolve(process.cwd(), SAMPLE_EXR_MULTILAYER);
      let fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for EXR layers to be detected
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getViewerState();
          return state?.exrLayerCount > 1;
        },
        { timeout: 5000 }
      );

      // Verify layers are detected
      let viewerState = await getViewerState(page);
      expect(viewerState.exrLayerCount).toBeGreaterThan(1);

      // Reload the page to clear sources
      await page.reload();
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Load a PNG file
      filePath = path.resolve(process.cwd(), 'sample/test_image.png');
      fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Wait for media to load
      await page.waitForFunction(
        () => {
          const state = window.__OPENRV_TEST__?.getSessionState();
          return state?.hasMedia === true;
        },
        { timeout: 5000 }
      );

      // Layers should be cleared since PNG has no layer support
      viewerState = await getViewerState(page);
      expect(viewerState.exrLayerCount).toBe(0);
      expect(viewerState.exrSelectedLayer).toBeNull();

      // Layer selector should not be visible
      const layerSelector = page.locator('[data-testid="exr-layer-select"]');
      await expect(layerSelector).not.toBeVisible();
    });
  });
});
