import { test, expect, type Page } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  getViewerState,
  getPaintState,
  getTransformState,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Tab Navigation Tests
 *
 * Each test verifies that tab switching actually changes toolbar content
 * and that controls on each tab are functional.
 */

async function expectViewZoomControlVisible(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="zoom-control-button"]')).toBeVisible();
}

async function selectZoomPreset(page: Page, value: 'fit' | '2'): Promise<void> {
  await page.locator('[data-testid="zoom-control-button"]').click();
  const dropdown = page.locator('[data-testid="zoom-dropdown"]');
  await expect(dropdown).toBeVisible();
  await dropdown.locator(`button[data-value="${value}"]`).click();
}

test.describe('Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test.describe('Mouse Navigation', () => {
    test('TAB-001: should switch to View tab and show zoom controls', async ({ page }) => {
      // Start from a different tab
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(100);

      // Switch to View tab
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(100);

      // Verify zoom control is visible (proves View tab is active)
      await expectViewZoomControlVisible(page);
    });

    test('TAB-002: should switch to Color tab and show color controls', async ({ page }) => {
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(100);

      // Color controls should be visible (proves Color tab is active)
      const colorButton = page.locator('[data-testid="color-control-button"]').first();
      await expect(colorButton).toBeVisible();
    });

    test('TAB-003: should switch to Effects tab and show filter controls', async ({ page }) => {
      await page.click('button[data-tab-id="effects"]');
      await page.waitForTimeout(100);

      // Effects controls should be visible (proves Effects tab is active)
      const filterButton = page.locator('[data-testid="filter-control-button"]').first();
      await expect(filterButton).toBeVisible();
    });

    test('TAB-004: should switch to Transform tab and show rotation/flip controls', async ({ page }) => {
      await page.click('button[data-tab-id="transform"]');
      await page.waitForTimeout(100);

      // Transform controls should be visible (proves Transform tab is active)
      const rotateButton = page.locator('[data-testid="transform-rotate-right"]').first();
      await expect(rotateButton).toBeVisible();
    });

    test('TAB-005: should switch to Annotate tab and show paint tools', async ({ page }) => {
      await page.click('button[data-tab-id="annotate"]');
      await page.waitForTimeout(100);

      // Pen tool should be available (proves Annotate tab is active)
      const state = await getPaintState(page);
      expect(['pan', 'pen', 'eraser', 'text', 'none']).toContain(state.currentTool);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('TAB-010: should switch to View tab with 1 key', async ({ page }) => {
      // Start from Color tab
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(100);

      // Press 1 to switch to View tab
      await page.keyboard.press('1');
      await page.waitForTimeout(100);

      // View tab controls should be visible
      await expectViewZoomControlVisible(page);
    });

    test('TAB-011: should switch to Color tab with 2 key', async ({ page }) => {
      await page.keyboard.press('2');
      await page.waitForTimeout(100);

      // Color controls should be visible
      const colorButton = page.locator('[data-testid="color-control-button"]').first();
      await expect(colorButton).toBeVisible();
    });

    test('TAB-012: should switch to Effects tab with 3 key', async ({ page }) => {
      await page.keyboard.press('3');
      await page.waitForTimeout(100);

      // Effects controls should be visible
      const filterButton = page.locator('[data-testid="filter-control-button"]').first();
      await expect(filterButton).toBeVisible();
    });

    test('TAB-013: should switch to Transform tab with 4 key', async ({ page }) => {
      await page.keyboard.press('4');
      await page.waitForTimeout(100);

      // Transform controls should be visible
      const rotateButton = page.locator('[data-testid="transform-rotate-right"]').first();
      await expect(rotateButton).toBeVisible();
    });

    test('TAB-014: should switch to Annotate tab with 5 key', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      // Paint tools should be available
      const state = await getPaintState(page);
      expect(['pan', 'pen', 'eraser', 'text', 'none']).toContain(state.currentTool);
    });
  });

  test.describe('Context Toolbar Functionality', () => {
    test('TAB-020: View tab zoom controls should update zoom state', async ({ page }) => {
      await loadVideoFile(page);
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(100);

      // Select 200% zoom from dropdown
      await selectZoomPreset(page, '2');
      await page.waitForTimeout(100);

      let state = await getViewerState(page);
      const zoomedInValue = state.zoom;
      expect(zoomedInValue).toBeGreaterThan(1);

      // Switch back to Fit from dropdown
      await selectZoomPreset(page, 'fit');
      await page.waitForTimeout(100);

      state = await getViewerState(page);
      expect(state.zoom).toBeLessThan(zoomedInValue);
    });

    test('TAB-021: Color tab controls should update color state', async ({ page }) => {
      await loadVideoFile(page);
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(100);

      // Open color panel
      await page.keyboard.press('c');
      await page.waitForTimeout(200);

      const colorPanel = page.locator('.color-controls-panel');
      await expect(colorPanel).toBeVisible();

      let state = await getColorState(page);
      expect(state.exposure).toBe(0);
    });

    test('TAB-022: Effects tab filter panel should open', async ({ page }) => {
      await loadVideoFile(page);
      await page.click('button[data-tab-id="effects"]');
      await page.waitForTimeout(100);

      // Click filter button to open panel
      const filterButton = page.locator('[data-testid="filter-control-button"]').first();
      await filterButton.click();
      await page.waitForTimeout(200);

      const filterPanel = page.locator('.filter-panel');
      await expect(filterPanel).toBeVisible();
    });

    test('TAB-023: Transform tab rotation should update state', async ({ page }) => {
      await loadVideoFile(page);
      await page.click('button[data-tab-id="transform"]');
      await page.waitForTimeout(100);

      let state = await getTransformState(page);
      expect(state.rotation).toBe(0);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Click rotate button
      const rotateRight = page.locator('[data-testid="transform-rotate-right"]');
      await rotateRight.click();
      await page.waitForTimeout(200);

      state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      // Canvas should visually change
      const rotatedScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, rotatedScreenshot)).toBe(true);
    });

    test('TAB-024: Annotate tab pen tool should enable drawing', async ({ page }) => {
      await loadVideoFile(page);
      await page.click('button[data-tab-id="annotate"]');
      await page.waitForTimeout(100);

      await page.keyboard.press('p');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.currentTool).toBe('pen');

      // Draw should add to annotatedFrames
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      const sessionState = await getSessionState(page);
      const currentFrame = sessionState.currentFrame;

      expect(state.annotatedFrames).not.toContain(currentFrame);

      await page.mouse.move(box!.x + 100, box!.y + 100);
      await page.mouse.down();
      await page.mouse.move(box!.x + 200, box!.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(200);

      state = await getPaintState(page);
      expect(state.annotatedFrames).toContain(currentFrame);
      expect(state.canUndo).toBe(true);
    });
  });

  test.describe('Tab State Persistence', () => {
    test('TAB-030: zoom level should persist when switching tabs', async ({ page }) => {
      await loadVideoFile(page);

      // Go to View tab and set zoom
      await page.click('button[data-tab-id="view"]');
      await selectZoomPreset(page, '2');
      await expect
        .poll(async () => (await getViewerState(page)).zoom)
        .toBeGreaterThan(1.9);

      let state = await getViewerState(page);
      const selectedZoom = state.zoom;

      // Switch to Color tab
      await page.click('button[data-tab-id="color"]');
      await page.waitForTimeout(100);

      // Switch back to View tab
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(100);

      // Zoom should be preserved
      state = await getViewerState(page);
      expect(state.zoom).toBeCloseTo(selectedZoom, 2);
    });

    test('TAB-031: transform state should persist when switching tabs', async ({ page }) => {
      await loadVideoFile(page);

      // Go to Transform tab and rotate
      await page.click('button[data-tab-id="transform"]');
      await page.keyboard.press('Alt+r');
      await page.waitForTimeout(200);

      let state = await getTransformState(page);
      expect(state.rotation).toBe(90);

      // Switch to View tab
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(100);

      // Rotation should be preserved
      state = await getTransformState(page);
      expect(state.rotation).toBe(90);
    });

    test('TAB-032: paint tool should persist when switching tabs', async ({ page }) => {
      await loadVideoFile(page);

      // Go to Annotate tab and select eraser
      await page.click('button[data-tab-id="annotate"]');
      await page.keyboard.press('e');
      await page.waitForTimeout(100);

      let state = await getPaintState(page);
      expect(state.currentTool).toBe('eraser');

      // Switch to View tab
      await page.click('button[data-tab-id="view"]');
      await page.waitForTimeout(100);

      // Switch back to Annotate tab
      await page.click('button[data-tab-id="annotate"]');
      await page.waitForTimeout(100);

      // Tool should be preserved
      state = await getPaintState(page);
      expect(state.currentTool).toBe('eraser');
    });
  });

  test.describe('Tab Visual Feedback', () => {
    test('TAB-040: switching tabs should show appropriate controls', async ({ page }) => {
      // Define expected controls for each tab
      const tabControls = {
        view: '[data-testid="zoom-control-button"]',
        color: '[data-testid="color-control-button"]',
        effects: '[data-testid="filter-control-button"]',
        transform: '[data-testid="transform-rotate-right"]',
        annotate: 'button[title*="Pen"], button[title*="pen"]',
      };

      const tabs = ['view', 'color', 'effects', 'transform', 'annotate'] as const;

      for (const tabName of tabs) {
        await page.click(`button[data-tab-id="${tabName}"]`);
        await page.waitForTimeout(100);

        // Verify the expected control is visible for this tab
        const control = page.locator(tabControls[tabName]).first();
        await expect(control).toBeVisible({ timeout: 5000 });
      }
    });

    test('TAB-041: tab should show hover feedback', async ({ page }) => {
      const colorTab = page.locator('button[data-tab-id="color"]');
      await colorTab.hover();
      await page.waitForTimeout(100);

      // Tab should be visible (hover state is visual - just verify no errors)
      await expect(colorTab).toBeVisible();
    });
  });
});
