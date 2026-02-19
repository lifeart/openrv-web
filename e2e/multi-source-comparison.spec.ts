import { test, expect } from '@playwright/test';
import {
  loadTwoVideoFiles,
  waitForTestHelper,
  getSessionState,
  getViewerState,
  captureViewerScreenshot,
  captureASideScreenshot,
  captureBSideScreenshot,
  waitForMediaLoaded,
  waitForFrame,
  waitForWipeMode,
  waitForABCompareAvailable,
  waitForDifferenceMatteEnabled,
  clickTab,
  waitForCondition,
} from './fixtures';

/**
 * Multi-Source Comparison Workflow Tests
 *
 * Tests the full A/B comparison workflow including source switching,
 * wipe modes, and difference matte.
 */

test.describe('Multi-Source Comparison', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadTwoVideoFiles(page);
  });

  test('MSC-001: Loading two videos enables A/B compare', async ({ page }) => {
    const state = await getSessionState(page);
    expect(state.abCompareAvailable).toBe(true);
    expect(state.hasMedia).toBe(true);
  });

  test('MSC-002: Can switch between A and B sources', async ({ page }) => {
    // Capture A source screenshot
    const screenshotA = await captureViewerScreenshot(page);

    // Switch to B source
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setCurrentAB?.('B');
    });
    await waitForCondition(page, `
      (() => {
        const state = window.__OPENRV_TEST__?.getSessionState();
        return state?.currentAB === 'B';
      })()
    `);
    await page.waitForTimeout(200);

    // Capture B source screenshot
    const screenshotB = await captureViewerScreenshot(page);

    // A and B should show different content (different videos)
    expect(screenshotA.equals(screenshotB)).toBe(false);
  });

  test('MSC-003: Horizontal wipe shows both sources', async ({ page }) => {
    await clickTab(page, 'view');

    // Enable horizontal wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setWipeMode?.('horizontal');
    });
    await waitForWipeMode(page, 'horizontal');
    await page.waitForTimeout(300);

    // Capture both sides
    const aSide = await captureASideScreenshot(page);
    const bSide = await captureBSideScreenshot(page);

    // Both sides should have content (non-empty)
    expect(aSide.length).toBeGreaterThan(100);
    expect(bSide.length).toBeGreaterThan(100);

    // The two sides should show different content
    expect(aSide.equals(bSide)).toBe(false);
  });

  test('MSC-004: Wipe position affects visible area', async ({ page }) => {
    // Enable horizontal wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setWipeMode?.('horizontal');
    });
    await waitForWipeMode(page, 'horizontal');
    await page.waitForTimeout(200);

    // Capture with default wipe position (0.5)
    const defaultScreenshot = await captureViewerScreenshot(page);

    // Move wipe position to 0.25 (A side smaller)
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setWipePosition?.(0.25);
    });
    await waitForCondition(page, `
      (() => {
        const state = window.__OPENRV_TEST__?.getViewerState();
        return state != null && Math.abs(state.wipePosition - 0.25) < 0.05;
      })()
    `);
    await page.waitForTimeout(200);

    const movedScreenshot = await captureViewerScreenshot(page);

    // Screenshots should differ since wipe position changed
    expect(defaultScreenshot.equals(movedScreenshot)).toBe(false);
  });

  test('MSC-005: Difference matte shows visual change', async ({ page }) => {
    // Capture normal view
    const normalScreenshot = await captureViewerScreenshot(page);

    // Enable difference matte
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setDifferenceMatteEnabled?.(true);
    });
    await waitForDifferenceMatteEnabled(page, true);
    await page.waitForTimeout(300);

    const diffScreenshot = await captureViewerScreenshot(page);

    // Difference matte should produce a visually different image
    expect(normalScreenshot.equals(diffScreenshot)).toBe(false);
  });

  test('MSC-006: Disabling wipe returns to single source view', async ({ page }) => {
    // Enable wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setWipeMode?.('horizontal');
    });
    await waitForWipeMode(page, 'horizontal');
    await page.waitForTimeout(200);

    const wipeScreenshot = await captureViewerScreenshot(page);

    // Disable wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setWipeMode?.('off');
    });
    await waitForWipeMode(page, 'off');
    await page.waitForTimeout(200);

    const normalScreenshot = await captureViewerScreenshot(page);

    // Should look different (wipe vs no wipe)
    expect(wipeScreenshot.equals(normalScreenshot)).toBe(false);
  });
});
