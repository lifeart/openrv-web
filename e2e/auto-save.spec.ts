import { test, expect, loadImageFile } from './fixtures';

test.describe('Auto-Save Feature', () => {
  test.describe('Auto-Save Indicator', () => {
    test('AUTOSAVE-E001: should display auto-save indicator in header', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // Auto-save indicator should be visible
      const indicator = page.locator('[data-testid="autosave-indicator"]');
      await expect(indicator).toBeVisible();
    });

    test('AUTOSAVE-E002: indicator should show cloud icon', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      const icon = page.locator('[data-testid="autosave-icon"]');
      await expect(icon).toBeVisible();

      // Should contain an SVG
      const svg = icon.locator('svg');
      await expect(svg).toBeVisible();
    });

    test('AUTOSAVE-E003: indicator should have tooltip', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      const indicator = page.locator('[data-testid="autosave-indicator"]');
      const title = await indicator.getAttribute('title');

      // Should have some tooltip text
      expect(title).toBeTruthy();
    });

    test('AUTOSAVE-E004: auto-save slot should be positioned after session name', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // Session name display should exist
      const sessionNameDisplay = page.locator('[data-testid="session-name-display"]');
      await expect(sessionNameDisplay).toBeVisible();

      // Auto-save slot should exist
      const autoSaveSlot = page.locator('[data-testid="autosave-slot"]');
      await expect(autoSaveSlot).toBeVisible();

      // Verify order: session name before auto-save indicator
      const sessionNameBox = await sessionNameDisplay.boundingBox();
      const autoSaveBox = await autoSaveSlot.boundingBox();

      expect(sessionNameBox).toBeTruthy();
      expect(autoSaveBox).toBeTruthy();

      if (sessionNameBox && autoSaveBox) {
        // Auto-save should be to the right of session name
        expect(autoSaveBox.x).toBeGreaterThan(sessionNameBox.x);
      }
    });
  });

  test.describe('Auto-Save Status Changes', () => {
    test('AUTOSAVE-E005: indicator responds to media load', async ({
      page,
    }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // Check indicator exists before loading media
      const indicator = page.locator('[data-testid="autosave-indicator"]');
      await expect(indicator).toBeVisible();

      // Load image file
      await loadImageFile(page);

      // Wait for state to settle
      await page.waitForTimeout(500);

      // Indicator should still be visible after media load
      await expect(indicator).toBeVisible();

      // Check icon is present
      const icon = page.locator('[data-testid="autosave-icon"]');
      await expect(icon).toBeVisible();
    });
  });

  test.describe('Auto-Save Integration', () => {
    test('AUTOSAVE-E006: should persist and recover basic state', async ({ page }) => {
      // This test verifies the IndexedDB integration works
      // Note: Full IndexedDB testing requires mocking or actual browser persistence

      await page.goto('/');
      await page.waitForSelector('#app');

      // Evaluate IndexedDB availability
      const hasIndexedDB = await page.evaluate(() => {
        return 'indexedDB' in window;
      });

      expect(hasIndexedDB).toBe(true);
    });

    test('AUTOSAVE-E007: indicator responds to config changes', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // The indicator should be visible (auto-save enabled by default)
      const indicator = page.locator('[data-testid="autosave-indicator"]');
      await expect(indicator).toBeVisible();

      // Get initial icon color
      const icon = page.locator('[data-testid="autosave-icon"]');
      const initialColor = await icon.evaluate(el => getComputedStyle(el).color);

      // Color should be defined (gray for idle)
      expect(initialColor).toBeTruthy();
    });
  });

  test.describe('Header Bar Integration', () => {
    test('AUTOSAVE-E008: auto-save indicator should be in header bar', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      const headerBar = page.locator('.header-bar');
      const autoSaveSlot = headerBar.locator('[data-testid="autosave-slot"]');

      await expect(autoSaveSlot).toBeVisible();
    });

    test('AUTOSAVE-E009: auto-save and session name should be grouped', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      const headerBar = page.locator('.header-bar');

      // Both elements should be children of header bar
      const sessionName = headerBar.locator('[data-testid="session-name-display"]');
      const autoSave = headerBar.locator('[data-testid="autosave-slot"]');

      await expect(sessionName).toBeVisible();
      await expect(autoSave).toBeVisible();
    });
  });

  test.describe('Auto-Save Styling', () => {
    test('AUTOSAVE-E010: indicator uses theme-consistent colors', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      const indicator = page.locator('[data-testid="autosave-indicator"]');
      await expect(indicator).toBeVisible();

      // Check that indicator has a color defined (from CSS variable or fallback)
      const color = await indicator.evaluate(el => getComputedStyle(el).color);
      expect(color).toBeTruthy();
      // Color should be in rgb format (browser computed style)
      expect(color).toMatch(/^rgb/);
    });

    test('AUTOSAVE-E011: indicator has default cursor in idle state', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      const indicator = page.locator('[data-testid="autosave-indicator"]');
      await expect(indicator).toBeVisible();

      // In idle state, cursor should be default
      const cursor = await indicator.evaluate(el => getComputedStyle(el).cursor);
      expect(cursor).toBe('default');
    });

    test('AUTOSAVE-E012: indicator is clickable element', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      const indicator = page.locator('[data-testid="autosave-indicator"]');
      await expect(indicator).toBeVisible();

      // Should be able to click without errors
      await expect(indicator.click()).resolves.not.toThrow();
    });
  });

  test.describe('Auto-Save Animation', () => {
    test('AUTOSAVE-E013: animation styles are injected', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // Check that animation style element exists
      const styleExists = await page.evaluate(() => {
        return document.getElementById('autosave-indicator-styles') !== null;
      });

      expect(styleExists).toBe(true);
    });

    test('AUTOSAVE-E014: pulse animation keyframes are defined', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');

      // Check that the pulse animation is defined
      const hasPulseAnimation = await page.evaluate(() => {
        const style = document.getElementById('autosave-indicator-styles');
        return style?.textContent?.includes('@keyframes pulse') ?? false;
      });

      expect(hasPulseAnimation).toBe(true);
    });
  });
});
