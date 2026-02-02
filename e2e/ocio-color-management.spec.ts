import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getOCIOState,
} from './fixtures';

/**
 * OCIO Color Management Tests
 *
 * Tests for the OpenColorIO color management pipeline including:
 * - Panel visibility and controls
 * - Configuration selection
 * - Color space selection
 * - Display and view transforms
 * - Keyboard shortcuts
 */

test.describe('OCIO Color Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);
  });

  test.describe('Panel Visibility', () => {
    test('OCIO-E001: OCIO button should be visible in color tab', async ({ page }) => {
      const ocioButton = page.locator('[data-testid="ocio-panel-button"]');
      await expect(ocioButton).toBeVisible();
      await expect(ocioButton).toContainText('OCIO');
    });

    test('OCIO-E002: clicking OCIO button should open panel', async ({ page }) => {
      const ocioButton = page.locator('[data-testid="ocio-panel-button"]');
      await ocioButton.click();
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();
    });

    test('OCIO-E003: Shift+O keyboard shortcut should toggle panel', async ({ page }) => {
      // Open panel with shortcut
      await page.keyboard.press('Shift+O');
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();

      // Close with shortcut
      await page.keyboard.press('Shift+O');
      await page.waitForTimeout(200);
      await expect(ocioPanel).not.toBeVisible();
    });

    test('OCIO-E004: close button should hide panel', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();

      // Click close button
      await page.locator('[data-testid="ocio-panel-close"]').click();
      await page.waitForTimeout(200);
      await expect(ocioPanel).not.toBeVisible();
    });

    test('OCIO-E005: clicking outside panel should close it', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const ocioPanel = page.locator('[data-testid="ocio-panel"]');
      await expect(ocioPanel).toBeVisible();

      // Click on the viewer area (outside panel)
      await page.locator('.viewer-container canvas').first().click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(200);
      await expect(ocioPanel).not.toBeVisible();
    });
  });

  test.describe('Default State', () => {
    test('OCIO-E010: default state should have OCIO disabled', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.enabled).toBe(false);
    });

    test('OCIO-E011: default config should be aces_1.2', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.configName).toBe('aces_1.2');
    });

    test('OCIO-E012: default input color space should be Auto', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.inputColorSpace).toBe('Auto');
    });

    test('OCIO-E013: default working color space should be ACEScg', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.workingColorSpace).toBe('ACEScg');
    });

    test('OCIO-E014: default display should be sRGB', async ({ page }) => {
      const state = await getOCIOState(page);
      expect(state.display).toBe('sRGB');
    });
  });

  test.describe('Enable Toggle', () => {
    test('OCIO-E020: enable toggle should enable OCIO pipeline', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      let state = await getOCIOState(page);
      expect(state.enabled).toBe(false);

      // Enable OCIO
      const enableToggle = page.locator('[data-testid="ocio-enable-toggle"]');
      await enableToggle.click();
      await page.waitForTimeout(200);

      state = await getOCIOState(page);
      expect(state.enabled).toBe(true);
    });

    test('OCIO-E021: enable toggle should update button style', async ({ page }) => {
      const ocioButton = page.locator('[data-testid="ocio-panel-button"]');

      // Open panel and enable
      await ocioButton.click();
      await page.waitForTimeout(200);

      await page.locator('[data-testid="ocio-enable-toggle"]').click();
      await page.waitForTimeout(200);

      // Button should have active style (highlighted border)
      const borderColor = await ocioButton.evaluate((el) =>
        getComputedStyle(el).borderColor
      );
      expect(borderColor).not.toBe('transparent');
    });
  });

  test.describe('Configuration Selection', () => {
    test('OCIO-E030: config dropdown should show available configurations', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click config dropdown
      await page.locator('[data-testid="ocio-config-select"]').click();
      await page.waitForTimeout(200);

      // Should show ACES and sRGB options
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Input Color Space Selection', () => {
    test('OCIO-E040: input color space dropdown should show available spaces', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click input color space dropdown
      await page.locator('[data-testid="ocio-input-colorspace"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Display Selection', () => {
    test('OCIO-E050: display dropdown should show available displays', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click display dropdown
      await page.locator('[data-testid="ocio-display-select"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('View Selection', () => {
    test('OCIO-E060: view dropdown should show available views', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click view dropdown
      await page.locator('[data-testid="ocio-view-select"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Look Selection', () => {
    test('OCIO-E070: look dropdown should show available looks', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Click look dropdown
      await page.locator('[data-testid="ocio-look-select"]').click();
      await page.waitForTimeout(200);

      // Should show dropdown
      const dropdown = page.locator('.dropdown-menu');
      await expect(dropdown).toBeVisible();
    });
  });

  test.describe('Reset Button', () => {
    test('OCIO-E080: reset button should restore defaults', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      // Enable OCIO and change some settings
      await page.locator('[data-testid="ocio-enable-toggle"]').click();
      await page.waitForTimeout(200);

      let state = await getOCIOState(page);
      expect(state.enabled).toBe(true);

      // Click reset
      await page.locator('[data-testid="ocio-reset-button"]').click();
      await page.waitForTimeout(200);

      state = await getOCIOState(page);
      expect(state.enabled).toBe(false);
      expect(state.inputColorSpace).toBe('Auto');
    });
  });

  test.describe('Panel Content', () => {
    test('OCIO-E090: panel should display current configuration name', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="ocio-panel"]');
      // Should contain config description
      await expect(panel).toContainText('Academy');
    });

    test('OCIO-E091: panel should display section headers', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const panel = page.locator('[data-testid="ocio-panel"]');
      await expect(panel).toContainText('Configuration');
      await expect(panel).toContainText('Input');
      await expect(panel).toContainText('Working');
      await expect(panel).toContainText('Display');
      await expect(panel).toContainText('Look');
    });

    test('OCIO-E092: panel should display detected color space field', async ({ page }) => {
      // Open panel
      await page.locator('[data-testid="ocio-panel-button"]').click();
      await page.waitForTimeout(200);

      const detectedLabel = page.locator('[data-testid="ocio-detected-colorspace"]');
      await expect(detectedLabel).toBeVisible();
    });
  });
});
