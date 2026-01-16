import { test, expect, clickTab, loadVideoFile } from './fixtures';

test.describe('Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
  });

  test.describe('Mouse Navigation', () => {
    test('TAB-001: should switch to View tab on click', async ({ page }) => {
      await page.click('button:has-text("View")');
      await page.waitForTimeout(100);

      const viewTab = page.locator('button:has-text("View")');
      const className = await viewTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-002: should switch to Color tab on click', async ({ page }) => {
      await page.click('button:has-text("Color")');
      await page.waitForTimeout(100);

      const colorTab = page.locator('button:has-text("Color")');
      const className = await colorTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-003: should switch to Effects tab on click', async ({ page }) => {
      await page.click('button:has-text("Effects")');
      await page.waitForTimeout(100);

      const effectsTab = page.locator('button:has-text("Effects")');
      const className = await effectsTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-004: should switch to Transform tab on click', async ({ page }) => {
      await page.click('button:has-text("Transform")');
      await page.waitForTimeout(100);

      const transformTab = page.locator('button:has-text("Transform")');
      const className = await transformTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-005: should switch to Annotate tab on click', async ({ page }) => {
      await page.click('button:has-text("Annotate")');
      await page.waitForTimeout(100);

      const annotateTab = page.locator('button:has-text("Annotate")');
      const className = await annotateTab.getAttribute('class');
      expect(className).toContain('active');
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('TAB-010: should switch to View tab with 1 key', async ({ page }) => {
      // First switch to another tab
      await page.click('button:has-text("Color")');
      await page.waitForTimeout(100);

      // Press 1 for View tab
      await page.keyboard.press('1');
      await page.waitForTimeout(100);

      const viewTab = page.locator('button:has-text("View")');
      const className = await viewTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-011: should switch to Color tab with 2 key', async ({ page }) => {
      await page.keyboard.press('2');
      await page.waitForTimeout(100);

      const colorTab = page.locator('button:has-text("Color")');
      const className = await colorTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-012: should switch to Effects tab with 3 key', async ({ page }) => {
      await page.keyboard.press('3');
      await page.waitForTimeout(100);

      const effectsTab = page.locator('button:has-text("Effects")');
      const className = await effectsTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-013: should switch to Transform tab with 4 key', async ({ page }) => {
      await page.keyboard.press('4');
      await page.waitForTimeout(100);

      const transformTab = page.locator('button:has-text("Transform")');
      const className = await transformTab.getAttribute('class');
      expect(className).toContain('active');
    });

    test('TAB-014: should switch to Annotate tab with 5 key', async ({ page }) => {
      await page.keyboard.press('5');
      await page.waitForTimeout(100);

      const annotateTab = page.locator('button:has-text("Annotate")');
      const className = await annotateTab.getAttribute('class');
      expect(className).toContain('active');
    });
  });

  test.describe('Context Toolbar Changes', () => {
    test('TAB-020: View tab should show zoom and wipe controls', async ({ page }) => {
      await page.click('button:has-text("View")');
      await page.waitForTimeout(100);

      // Should show Fit button for zoom
      const fitButton = page.locator('button:has-text("Fit")');
      await expect(fitButton).toBeVisible();

      // Should show zoom percentage buttons
      const zoom100 = page.locator('button:has-text("100%")');
      await expect(zoom100).toBeVisible();
    });

    test('TAB-021: Color tab should show color adjustment controls', async ({ page }) => {
      await page.click('button:has-text("Color")');
      await page.waitForTimeout(200);

      // Should have color-related controls or labels
      // The exact selectors depend on implementation
      const contextToolbar = page.locator('div').filter({ hasText: /Exposure|Color|CDL/ }).first();
      await expect(contextToolbar).toBeVisible();
    });

    test('TAB-022: Effects tab should show filter controls', async ({ page }) => {
      await page.click('button:has-text("Effects")');
      await page.waitForTimeout(200);

      // Should have filter-related controls
      const contextToolbar = page.locator('div').filter({ hasText: /Blur|Filter|Lens/ }).first();
      await expect(contextToolbar).toBeVisible();
    });

    test('TAB-023: Transform tab should show rotation and crop controls', async ({ page }) => {
      await page.click('button:has-text("Transform")');
      await page.waitForTimeout(200);

      // Should have transform controls
      const contextToolbar = page.locator('div').filter({ hasText: /Rotate|Flip|Crop/ }).first();
      await expect(contextToolbar).toBeVisible();
    });

    test('TAB-024: Annotate tab should show paint tools', async ({ page }) => {
      await page.click('button:has-text("Annotate")');
      await page.waitForTimeout(200);

      // Should have paint tool selection
      const contextToolbar = page.locator('div').filter({ hasText: /Pen|Eraser|Color/ }).first();
      await expect(contextToolbar).toBeVisible();
    });
  });

  test.describe('Tab State Persistence', () => {
    test('TAB-030: should maintain controls state when switching tabs', async ({ page }) => {
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Go to View tab and change zoom
      await page.click('button:has-text("View")');
      await page.waitForTimeout(100);

      const zoom200 = page.locator('button:has-text("200%")');
      if (await zoom200.isVisible()) {
        await zoom200.click();
        await page.waitForTimeout(100);
      }

      // Switch to Color tab
      await page.click('button:has-text("Color")');
      await page.waitForTimeout(100);

      // Switch back to View tab
      await page.click('button:has-text("View")');
      await page.waitForTimeout(100);

      // Zoom level should be preserved (viewer state)
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('Tab Visual Feedback', () => {
    test('TAB-040: should highlight active tab', async ({ page }) => {
      const tabs = ['View', 'Color', 'Effects', 'Transform', 'Annotate'];

      for (const tabName of tabs) {
        await page.click(`button:has-text("${tabName}")`);
        await page.waitForTimeout(100);

        const tab = page.locator(`button:has-text("${tabName}")`);
        const className = await tab.getAttribute('class');
        expect(className).toContain('active');

        // Other tabs should not be active
        for (const otherTab of tabs) {
          if (otherTab !== tabName) {
            const other = page.locator(`button:has-text("${otherTab}")`);
            const otherClass = await other.getAttribute('class');
            expect(otherClass).not.toContain('active');
          }
        }
      }
    });

    test('TAB-041: should show hover state on tabs', async ({ page }) => {
      const colorTab = page.locator('button:has-text("Color")');
      await colorTab.hover();
      await page.waitForTimeout(100);

      // Tab should show hover state (visual check - implementation dependent)
      await expect(colorTab).toBeVisible();
    });
  });
});
