import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Color Inversion E2E Tests
 *
 * Tests for the global color inversion toggle feature.
 */

/** Wait for color inversion state to match expected value */
async function waitForInversion(page: import('@playwright/test').Page, expected: boolean) {
  await page.waitForFunction(
    (exp) => window.__OPENRV_TEST__?.getViewerState()?.colorInversionEnabled === exp,
    expected,
    { timeout: 5000 }
  );
}

test.describe('Color Inversion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForFunction(() => {
      const colorTab = document.querySelector('button:has-text("Color")');
      return colorTab?.classList.contains('active') || colorTab?.getAttribute('aria-selected') === 'true';
    });
  });

  test.describe('Toggle Visibility', () => {
    test('INV-001: color tab should show inversion toggle button', async ({ page }) => {
      const invertButton = page.locator('[data-testid="color-inversion-toggle"]');
      await expect(invertButton).toBeVisible();
    });

    test('INV-002: inversion toggle should have correct data-testid', async ({ page }) => {
      const button = page.locator('[data-testid="color-inversion-toggle"]');
      await expect(button).toHaveCount(1);
    });

    test('INV-003: inversion should be off by default', async ({ page }) => {
      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(false);
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('INV-010: pressing Ctrl+I should toggle color inversion on', async ({ page }) => {
      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);

      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(true);
    });

    test('INV-011: pressing Ctrl+I again should toggle color inversion off', async ({ page }) => {
      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);
      await page.keyboard.press('Control+i');
      await waitForInversion(page, false);

      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(false);
    });

    test('INV-012: Ctrl+I should work from any tab', async ({ page }) => {
      // Switch to View tab
      await page.locator('button:has-text("View")').first().click();
      await page.waitForFunction(() => {
        const viewTab = document.querySelector('button:has-text("View")');
        return viewTab?.classList.contains('active') || viewTab?.getAttribute('aria-selected') === 'true';
      });

      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);

      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(true);
    });
  });

  test.describe('Visual Effect', () => {
    test('INV-020: enabling inversion should visually change the canvas', async ({ page }) => {
      const before = await captureViewerScreenshot(page);

      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);
      // Wait for canvas to render the inversion effect
      await page.waitForFunction(() => {
        return window.__OPENRV_TEST__?.getViewerState()?.colorInversionEnabled === true;
      }, { timeout: 2000 });

      const after = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(before, after)).toBe(true);
    });

    test('INV-023: double inversion should restore original image', async ({ page }) => {
      const original = await captureViewerScreenshot(page);

      // Toggle on
      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);
      // Wait for canvas to render the inversion effect
      await page.waitForFunction(() => {
        return window.__OPENRV_TEST__?.getViewerState()?.colorInversionEnabled === true;
      }, { timeout: 2000 });

      // Toggle off
      await page.keyboard.press('Control+i');
      await waitForInversion(page, false);
      // Wait for canvas to render without inversion
      await page.waitForFunction(() => {
        return window.__OPENRV_TEST__?.getViewerState()?.colorInversionEnabled === false;
      }, { timeout: 2000 });

      const restored = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(original, restored)).toBe(false);
    });
  });

  test.describe('Button State', () => {
    test('INV-030: clicking invert button should activate it', async ({ page }) => {
      const button = page.locator('[data-testid="color-inversion-toggle"]');
      await button.click();
      await waitForInversion(page, true);

      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(true);
    });

    test('INV-031: clicking active invert button should deactivate it', async ({ page }) => {
      const button = page.locator('[data-testid="color-inversion-toggle"]');
      await button.click();
      await waitForInversion(page, true);
      await button.click();
      await waitForInversion(page, false);

      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(false);
    });
  });

  test.describe('Interaction with Other Corrections', () => {
    test('INV-040: inversion should combine with exposure adjustment', async ({ page }) => {
      // Set exposure
      await page.keyboard.press('c');
      // Wait for color controls panel to open
      await page.waitForFunction(() => {
        const panel = document.querySelector('.color-controls-panel');
        return panel && (panel as HTMLElement).style.display !== 'none';
      });
      const exposureSlider = page.locator('.color-controls-panel input[data-testid="slider-exposure"]');
      await exposureSlider.fill('2');
      // Wait for exposure state to update
      await page.waitForFunction(() => {
        return window.__OPENRV_TEST__?.getColorState()?.exposure === 2;
      }, { timeout: 2000 });

      const beforeInversion = await captureViewerScreenshot(page);

      // Enable inversion
      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);
      // Wait for canvas to render the inversion effect
      await page.waitForFunction(() => {
        return window.__OPENRV_TEST__?.getViewerState()?.colorInversionEnabled === true;
      }, { timeout: 2000 });

      const afterInversion = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(beforeInversion, afterInversion)).toBe(true);
    });
  });

  test.describe('State Persistence', () => {
    test('INV-051: inversion state should persist across tab switches', async ({ page }) => {
      // Enable inversion
      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);

      // Switch to View tab
      await page.locator('button:has-text("View")').first().click();
      await page.waitForFunction(() => {
        const viewTab = document.querySelector('button:has-text("View")');
        return viewTab?.classList.contains('active') || viewTab?.getAttribute('aria-selected') === 'true';
      });

      // Switch back to Color tab
      await page.locator('button:has-text("Color")').first().click();
      await page.waitForFunction(() => {
        const colorTab = document.querySelector('button:has-text("Color")');
        return colorTab?.classList.contains('active') || colorTab?.getAttribute('aria-selected') === 'true';
      });

      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(true);
    });
  });

  test.describe('Reset Behavior', () => {
    test('INV-060: color controls reset should NOT reset inversion', async ({ page }) => {
      // Enable inversion
      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);

      // Open color panel and reset
      await page.keyboard.press('c');
      // Wait for color controls panel to open
      await page.waitForFunction(() => {
        const panel = document.querySelector('.color-controls-panel');
        return panel && (panel as HTMLElement).style.display !== 'none';
      });
      const resetButton = page.locator('.color-controls-panel button:has-text("Reset")');
      if (await resetButton.isVisible()) {
        await resetButton.click();
        // Wait for color state to reset (exposure should be 0)
        await page.waitForFunction(() => {
          return window.__OPENRV_TEST__?.getColorState()?.exposure === 0;
        }, { timeout: 2000 });
      }

      // Inversion should still be active
      const state = await getViewerState(page);
      expect(state.colorInversionEnabled).toBe(true);
    });

    test('INV-061: toggling inversion off should restore pre-inversion image', async ({ page }) => {
      const original = await captureViewerScreenshot(page);

      await page.keyboard.press('Control+i');
      await waitForInversion(page, true);
      // Wait for canvas to render the inversion effect
      await page.waitForFunction(() => {
        return window.__OPENRV_TEST__?.getViewerState()?.colorInversionEnabled === true;
      }, { timeout: 2000 });

      await page.keyboard.press('Control+i');
      await waitForInversion(page, false);
      // Wait for canvas to render without inversion
      await page.waitForFunction(() => {
        return window.__OPENRV_TEST__?.getViewerState()?.colorInversionEnabled === false;
      }, { timeout: 2000 });

      const restored = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(original, restored)).toBe(false);
    });
  });
});
