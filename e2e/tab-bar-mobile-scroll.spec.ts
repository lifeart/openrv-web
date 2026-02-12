import { test, expect } from '@playwright/test';
import { waitForTestHelper } from './fixtures';

/**
 * TabBar Mobile Horizontal Scroll Tests
 *
 * Verifies that the tab bar [View, Color, Effects, Transform, Annotate]
 * is horizontally scrollable on narrow (mobile) viewports and all tabs
 * remain accessible.
 */

test.describe('TabBar Mobile Scroll', () => {
  test.beforeEach(async ({ page }) => {
    // Set a narrow mobile viewport so tabs overflow
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('TABSCROLL-001: tab bar should be horizontally scrollable on narrow viewport', async ({ page }) => {
    const tabBar = page.locator('.tab-bar');
    await expect(tabBar).toBeVisible();

    // The tab bar's scroll width should exceed its client width on narrow screens
    const isScrollable = await tabBar.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(isScrollable).toBe(true);
  });

  test('TABSCROLL-002: all 5 tabs should be present in the DOM on narrow viewport', async ({ page }) => {
    const tabs = ['view', 'color', 'effects', 'transform', 'annotate'];
    for (const tabId of tabs) {
      const tabButton = page.locator(`button[data-tab-id="${tabId}"]`);
      await expect(tabButton).toBeAttached();
    }
  });

  test('TABSCROLL-003: clicking last tab should scroll it into view and activate it', async ({ page }) => {
    // The "Annotate" tab (last) may be off-screen on 320px viewport
    const annotateTab = page.locator('button[data-tab-id="annotate"]');

    // Scroll it into view and click
    await annotateTab.scrollIntoViewIfNeeded();
    await annotateTab.click();
    await page.waitForTimeout(300);

    // Verify it is now the active tab
    const activeColor = await annotateTab.evaluate((el) => el.style.color);
    expect(activeColor).toBe('var(--text-primary)');
  });

  test('TABSCROLL-004: keyboard navigation should work and scroll tab into view', async ({ page }) => {
    // Press 5 to select Annotate tab via keyboard
    await page.keyboard.press('5');
    await page.waitForTimeout(300);

    const annotateTab = page.locator('button[data-tab-id="annotate"]');
    const activeColor = await annotateTab.evaluate((el) => el.style.color);
    expect(activeColor).toBe('var(--text-primary)');

    // The tab should be at least partially visible after scrolling
    const isVisible = await annotateTab.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const parentRect = el.closest('.tab-bar')!.getBoundingClientRect();
      // Tab's right edge should be within or close to the container's right edge
      return rect.left < parentRect.right && rect.right > parentRect.left;
    });
    expect(isVisible).toBe(true);
  });

  test('TABSCROLL-005: cycling through all tabs should work on narrow viewport', async ({ page }) => {
    const tabs = ['view', 'color', 'effects', 'transform', 'annotate'] as const;

    for (const tabId of tabs) {
      const tabButton = page.locator(`button[data-tab-id="${tabId}"]`);
      await tabButton.scrollIntoViewIfNeeded();
      await tabButton.click();
      await page.waitForTimeout(200);

      // Verify it is active
      const activeColor = await tabButton.evaluate((el) => el.style.color);
      expect(activeColor).toBe('var(--text-primary)');
    }
  });

  test('TABSCROLL-006: tab bar scrollbar should be hidden', async ({ page }) => {
    const tabBar = page.locator('.tab-bar');

    // Verify CSS properties that hide the scrollbar
    const scrollbarWidth = await tabBar.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.scrollbarWidth;
    });
    expect(scrollbarWidth).toBe('none');
  });

  test('TABSCROLL-007: tab indicator should follow active tab after scroll', async ({ page }) => {
    // Click the last tab
    const annotateTab = page.locator('button[data-tab-id="annotate"]');
    await annotateTab.scrollIntoViewIfNeeded();
    await annotateTab.click();
    await page.waitForTimeout(300);

    // Check that the indicator is positioned under the Annotate tab
    const tabBar = page.locator('.tab-bar');
    const indicatorLeft = await tabBar.evaluate((el) => {
      const indicator = el.querySelector('div[style*="position: absolute"]') as HTMLElement;
      return parseFloat(indicator?.style.left || '0');
    });

    const annotateLeft = await annotateTab.evaluate((el) => {
      const parentScrollLeft = el.closest('.tab-bar')!.scrollLeft;
      const rect = el.getBoundingClientRect();
      const parentRect = el.closest('.tab-bar')!.getBoundingClientRect();
      return rect.left - parentRect.left + parentScrollLeft;
    });

    // Indicator should be approximately aligned with the Annotate tab
    expect(indicatorLeft).toBeCloseTo(annotateLeft, 0);
  });
});
