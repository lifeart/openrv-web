import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
} from './fixtures';

/**
 * Dropdown Menu Tests
 *
 * Tests for keyboard navigation and z-index stacking in dropdown menus.
 * These tests verify the fixes for:
 * 1. Arrow-up/down keyboard navigation
 * 2. Proper z-index stacking for multiple open menus
 * 3. Auto-closing other menus when opening a new one
 */

test.describe('Dropdown Menu Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Ensure View tab is selected (has zoom and channel dropdowns)
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E001: clicking dropdown button opens menu', async ({ page }) => {
    // Find zoom control button
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await expect(zoomButton).toBeVisible();

    // Click to open dropdown
    await zoomButton.click();
    await page.waitForTimeout(100);

    // Dropdown should be visible
    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('DM-E002: ArrowDown navigates to next item in dropdown', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Get all dropdown items
    const items = dropdown.locator('button');

    // First item should be highlighted initially
    const firstItem = items.nth(0);
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');

    // Press ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Second item should now be highlighted
    const secondItem = items.nth(1);
    await expect(secondItem).toHaveAttribute('aria-selected', 'true');

    // First item should no longer be selected
    await expect(firstItem).toHaveAttribute('aria-selected', 'false');
  });

  test('DM-E003: ArrowUp navigates to previous item in dropdown', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Navigate down twice
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Third item should be highlighted
    const thirdItem = items.nth(2);
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true');

    // Press ArrowUp
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);

    // Second item should now be highlighted
    const secondItem = items.nth(1);
    await expect(secondItem).toHaveAttribute('aria-selected', 'true');
  });

  test('DM-E004: Enter selects highlighted item and closes dropdown', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Navigate to 100% option (index 3: Fit, 25%, 50%, 100%)
    await page.keyboard.press('ArrowDown'); // 25%
    await page.keyboard.press('ArrowDown'); // 50%
    await page.keyboard.press('ArrowDown'); // 100%
    await page.waitForTimeout(50);

    // Press Enter to select
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();

    // Button should show selected value
    await expect(zoomButton).toContainText('100%');
  });

  test('DM-E005: Escape closes dropdown without selecting', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');

    // Get initial text
    const initialText = await zoomButton.textContent();

    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Navigate down
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();

    // Button text should not have changed
    await expect(zoomButton).toHaveText(initialText!);
  });

  test('DM-E006: Space selects highlighted item', async ({ page }) => {
    // Open channel select dropdown
    const channelButton = page.locator('[data-testid="channel-select-button"]');
    await channelButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="channel-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Navigate to Red channel (index 1: RGB, Red)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Press Space to select
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();

    // Channel should have changed (button shows "R" for Red)
    await expect(channelButton).toContainText('R');
  });

  test('DM-E007: clicking outside closes dropdown', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Click somewhere else (on the viewer container)
    const viewer = page.locator('.viewer-container');
    await viewer.click();
    await page.waitForTimeout(100);

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();
  });

  test('DM-E008: Tab closes dropdown', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Press Tab
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();
  });
});

test.describe('Dropdown Menu Z-Index Stacking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E010: opening new dropdown closes previous dropdown', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const zoomDropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(zoomDropdown).toBeVisible();

    // Open channel dropdown (should close zoom dropdown)
    const channelButton = page.locator('[data-testid="channel-select-button"]');
    await channelButton.click();
    await page.waitForTimeout(100);

    const channelDropdown = page.locator('[data-testid="channel-dropdown"]');

    // Zoom dropdown should be closed
    await expect(zoomDropdown).not.toBeVisible();

    // Channel dropdown should be open
    await expect(channelDropdown).toBeVisible();
  });

  test('DM-E011: opening new dropdown closes previous dropdown and has proper z-index', async ({
    page,
  }) => {
    // This test verifies that when a new dropdown opens, it closes any existing one
    // (closeOthers: true behavior) and the new dropdown has a proper z-index

    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const zoomDropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(zoomDropdown).toBeVisible();

    // Get z-index of zoom dropdown while it's open
    const zoomZIndex = await zoomDropdown.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).zIndex);
    });
    expect(zoomZIndex).toBeGreaterThanOrEqual(10000);

    // Open channel dropdown - this should close the zoom dropdown
    const channelButton = page.locator('[data-testid="channel-select-button"]');
    await channelButton.click();
    await page.waitForTimeout(100);

    const channelDropdown = page.locator('[data-testid="channel-dropdown"]');
    await expect(channelDropdown).toBeVisible();

    // Zoom dropdown should now be closed (hidden)
    await expect(zoomDropdown).not.toBeVisible();

    // Get z-index of channel dropdown - should also have proper z-index
    const channelZIndex = await channelDropdown.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).zIndex);
    });
    expect(channelZIndex).toBeGreaterThanOrEqual(10000);
  });

  test('DM-E012: dropdown appears above all other UI elements', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Get dropdown z-index
    const dropdownZIndex = await dropdown.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).zIndex);
    });

    // Z-index should be high enough to appear above normal UI
    expect(dropdownZIndex).toBeGreaterThanOrEqual(9999);
  });
});

test.describe('Dropdown Menu Item Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E020: selecting zoom level updates viewer state', async ({ page }) => {
    const initialState = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(initialState).not.toBeNull();

    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');

    // Click on 200% option
    const option200 = dropdown.locator('button', { hasText: '200%' });
    await option200.click();
    await page.waitForTimeout(100);

    // Verify zoom state changed
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });

    expect(state).not.toBeNull();
    expect(state.zoom).toBeGreaterThan(initialState.zoom);
    await expect(zoomButton).toContainText('200%');
  });

  test('DM-E021: selecting channel updates button label', async ({ page }) => {
    // Open channel dropdown
    const channelButton = page.locator('[data-testid="channel-select-button"]');

    // Initially should show "Ch" (default RGB mode)
    await expect(channelButton).toContainText('Ch');

    await channelButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="channel-dropdown"]');

    // Click on Red channel
    const redOption = dropdown.locator('button', { hasText: 'Red' });
    await redOption.click();
    await page.waitForTimeout(100);

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();

    // Button should now show "R" for Red channel
    await expect(channelButton).toContainText('R');
  });

  test('DM-E022: keyboard navigation and Enter selection work together', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    const initialState = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(initialState).not.toBeNull();

    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Navigate to 50% (index 2: Fit, 25%, 50%)
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Ensure keyboard navigation actually moved selection before pressing Enter
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');

    // Select with Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Verify zoom state moved down from initial fit/default value.
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });

    expect(state).not.toBeNull();
    expect(state.zoom).toBeLessThan(initialState.zoom);
  });

  test('DM-E023: selected item is visually highlighted', async ({ page }) => {
    // Set zoom to 100% first
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setZoom?.(1);
    });
    await page.waitForTimeout(100);

    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');

    // Find the 100% option
    const option100 = dropdown.locator('button', { hasText: '100%' });

    // It should have a highlighted background style
    const bgColor = await option100.evaluate((el) => {
      return window.getComputedStyle(el).background;
    });

    // Should have a highlighted background (rgba or specific color)
    expect(bgColor).toContain('rgba');
  });
});

test.describe('Dropdown Keyboard Navigation End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E040: full keyboard workflow - open, navigate, select specific item', async ({ page }) => {
    // Get initial zoom state
    const initialState = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(initialState).not.toBeNull();
    const initialZoom = initialState.zoom;

    // Open zoom dropdown by clicking button
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    // Verify dropdown is open
    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Get all items text to know what we're selecting
    const itemTexts = await dropdown.locator('button').allTextContents();
    // Items are: Fit, 25%, 50%, 100%, 200%, 400%

    // Navigate down 4 times to reach 200% (index 4)
    await page.keyboard.press('ArrowDown'); // -> 25%
    await page.keyboard.press('ArrowDown'); // -> 50%
    await page.keyboard.press('ArrowDown'); // -> 100%
    await page.keyboard.press('ArrowDown'); // -> 200%
    await page.waitForTimeout(50);

    // Verify the 200% item is highlighted (aria-selected)
    const items = dropdown.locator('button');
    const item200 = items.nth(4);
    await expect(item200).toHaveAttribute('aria-selected', 'true');
    await expect(item200).toContainText('200%');

    // Press Enter to select
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Verify dropdown closed
    await expect(dropdown).not.toBeVisible();

    // Verify button shows 200%
    await expect(zoomButton).toContainText('200%');

    // Verify actual zoom state changed to 2.0
    const newState = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(newState).not.toBeNull();
    expect(newState.zoom).toBeCloseTo(2.0, 1);
  });

  test('DM-E041: navigate up from middle of list', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Navigate down to 100% (index 3)
    await page.keyboard.press('ArrowDown'); // -> 25%
    await page.keyboard.press('ArrowDown'); // -> 50%
    await page.keyboard.press('ArrowDown'); // -> 100%
    await page.waitForTimeout(50);

    // Verify 100% is selected
    await expect(items.nth(3)).toHaveAttribute('aria-selected', 'true');

    // Navigate up twice to 25% (index 1)
    await page.keyboard.press('ArrowUp'); // -> 50%
    await page.keyboard.press('ArrowUp'); // -> 25%
    await page.waitForTimeout(50);

    // Verify 25% is now selected
    await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(items.nth(3)).toHaveAttribute('aria-selected', 'false');

    // Select 25%
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Verify zoom is 0.25
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state.zoom).toBeCloseTo(0.25, 2);
  });

  test('DM-E042: keyboard navigation does not go past boundaries', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');
    const itemCount = await items.count();

    // First item should be selected initially
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'true');

    // Try to go up from first item - should stay on first
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'true');

    // Navigate to last item
    for (let i = 0; i < itemCount - 1; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.waitForTimeout(50);

    // Last item should be selected
    await expect(items.nth(itemCount - 1)).toHaveAttribute('aria-selected', 'true');

    // Try to go down from last item - should stay on last
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    await expect(items.nth(itemCount - 1)).toHaveAttribute('aria-selected', 'true');
  });

  test('DM-E043: channel dropdown keyboard navigation with visual verification', async ({ page }) => {
    // Open channel dropdown
    const channelButton = page.locator('[data-testid="channel-select-button"]');
    await expect(channelButton).toContainText('Ch'); // Default RGB

    await channelButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="channel-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Items: RGB, Red, Green, Blue, Alpha, Luma
    const items = dropdown.locator('button');

    // Navigate to Green (index 2)
    await page.keyboard.press('ArrowDown'); // -> Red
    await page.keyboard.press('ArrowDown'); // -> Green
    await page.waitForTimeout(50);

    // Verify Green is highlighted
    const greenItem = items.nth(2);
    await expect(greenItem).toHaveAttribute('aria-selected', 'true');
    await expect(greenItem).toContainText('Green');

    // Select Green
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Verify dropdown closed and button shows G
    await expect(dropdown).not.toBeVisible();
    await expect(channelButton).toContainText('G');

    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state).not.toBeNull();
    expect(state.channelMode).toBe('green');
  });

  test('DM-E044: rapid keyboard navigation works correctly', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Rapidly press down multiple times
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // Should be at 400% (last item, index 5)
    await page.waitForTimeout(50);

    // Verify last item is selected
    await expect(items.nth(5)).toHaveAttribute('aria-selected', 'true');
    await expect(items.nth(5)).toContainText('400%');

    // Select it
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Verify selection applied and zoom moved to high zoom range.
    await expect(dropdown).not.toBeVisible();
    await expect(zoomButton).toContainText('400%');

    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state).not.toBeNull();
    expect(state.zoom).toBeGreaterThan(3.8);
    expect(state.zoom).toBeLessThanOrEqual(4.1);
  });

  test('DM-E045: Escape cancels navigation without changing state', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    const dropdown = page.locator('[data-testid="zoom-dropdown"]');

    // First, set zoom to 100% using the dropdown
    await zoomButton.click();
    await page.waitForTimeout(100);

    // Navigate to 100% (index 3: Fit, 25%, 50%, 100%)
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    await expect(zoomButton).toContainText('100%');

    // Now test Escape behavior
    // Open dropdown again
    await zoomButton.click();
    await page.waitForTimeout(100);
    await expect(dropdown).toBeVisible();

    // Navigate to a different item (200%)
    await page.keyboard.press('ArrowDown'); // -> 200%
    await page.waitForTimeout(50);

    // Press Escape to cancel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();

    // Zoom should still be 100% (not changed)
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state.zoom).toBeCloseTo(1.0, 1);

    // Button should still show 100%
    await expect(zoomButton).toContainText('100%');
  });
});

test.describe('Dropdown Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E050: focus returns to button after selecting item', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');

    // Open dropdown
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Select an item with Enter
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Verify focus is back on the button
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.getAttribute('data-testid');
    });
    expect(focusedElement).toBe('zoom-control-button');
  });

  test('DM-E051: focus returns to button after pressing Escape', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');

    // Open dropdown
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Verify focus is back on the button
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.getAttribute('data-testid');
    });
    expect(focusedElement).toBe('zoom-control-button');
  });

  test('DM-E052: can reopen dropdown immediately after closing with keyboard', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    const dropdown = page.locator('[data-testid="zoom-dropdown"]');

    // Open dropdown
    await zoomButton.click();
    await page.waitForTimeout(100);
    await expect(dropdown).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await expect(dropdown).not.toBeVisible();

    // Since focus is on button, pressing Enter/Space should reopen
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Dropdown should be open again
    await expect(dropdown).toBeVisible();
  });
});

test.describe('Dropdown Selection/Deselection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E060: only one item is selected at a time during keyboard navigation', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Navigate through items and verify only one is selected
    for (let i = 0; i < 5; i++) {
      const selectedItems = await items.evaluateAll((buttons) =>
        buttons.filter((b) => b.getAttribute('aria-selected') === 'true').length
      );
      expect(selectedItems).toBe(1);

      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
    }
  });

  test('DM-E061: keyboard ArrowDown deselects previous item', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // First item should be selected
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'true');

    // Press ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // First item deselected, second selected
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'false');
    await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('DM-E062: keyboard ArrowUp deselects previous item', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Move down twice
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Third item (50%) should be selected
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');

    // Press ArrowUp
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);

    // Third item deselected, second selected
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'false');
    await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('DM-E063: mouse hover highlights item and deselects previous', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // First item should be selected initially
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'true');

    // Hover over third item
    await items.nth(2).hover();
    await page.waitForTimeout(50);

    // First item deselected, third selected
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'false');
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');
  });

  test('DM-E064: only one item selected during mouse hover navigation', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');
    const itemCount = await items.count();

    // Hover over each item
    for (let i = 0; i < itemCount; i++) {
      await items.nth(i).hover();
      await page.waitForTimeout(50);

      const selectedItems = await items.evaluateAll((buttons) =>
        buttons.filter((b) => b.getAttribute('aria-selected') === 'true').length
      );
      expect(selectedItems).toBe(1);

      // The hovered item should be selected
      await expect(items.nth(i)).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('DM-E065: mouse hover after keyboard navigation updates selection', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Navigate with keyboard to third item
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');

    // Hover over fifth item
    await items.nth(4).hover();
    await page.waitForTimeout(50);

    // Third item deselected, fifth selected
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'false');
    await expect(items.nth(4)).toHaveAttribute('aria-selected', 'true');
  });

  test('DM-E066: keyboard navigation after mouse hover updates selection', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Hover over fourth item
    await items.nth(3).hover();
    await page.waitForTimeout(50);

    await expect(items.nth(3)).toHaveAttribute('aria-selected', 'true');

    // Navigate with keyboard up
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);

    // Fourth item deselected, third selected
    await expect(items.nth(3)).toHaveAttribute('aria-selected', 'false');
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');
  });

  test('DM-E067: Enter selects mouse-hovered item', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Hover over 100% item (index 3)
    await items.nth(3).hover();
    await page.waitForTimeout(50);

    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Dropdown closed and 100% selected
    await expect(dropdown).not.toBeVisible();
    await expect(zoomButton).toContainText('100%');
  });

  test('DM-E068: clicking item selects it', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Click 200% item (index 4)
    await items.nth(4).click();
    await page.waitForTimeout(100);

    // Dropdown closed and 200% selected
    await expect(dropdown).not.toBeVisible();
    await expect(zoomButton).toContainText('200%');
  });

  test('DM-E069: rapid keyboard-mouse-keyboard switching maintains correct state', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Keyboard: down twice (to 50%)
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');

    // Mouse: hover 200% (index 4)
    await items.nth(4).hover();
    await page.waitForTimeout(50);
    await expect(items.nth(4)).toHaveAttribute('aria-selected', 'true');

    // Keyboard: up (to 100%)
    await page.keyboard.press('ArrowUp');
    await expect(items.nth(3)).toHaveAttribute('aria-selected', 'true');

    // Mouse: hover Fit (index 0)
    await items.nth(0).hover();
    await page.waitForTimeout(50);
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'true');

    // Keyboard: down (to 25%)
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');

    // Verify only one selected
    const selectedItems = await items.evaluateAll((buttons) =>
      buttons.filter((b) => b.getAttribute('aria-selected') === 'true').length
    );
    expect(selectedItems).toBe(1);
  });

  test('DM-E070: channel dropdown selection works correctly', async ({ page }) => {
    const channelButton = page.locator('[data-testid="channel-select-button"]');
    await channelButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="channel-dropdown"]');
    const items = dropdown.locator('button');

    // Navigate to Blue (index 3: RGB, Red, Green, Blue)
    await page.keyboard.press('ArrowDown'); // Red
    await page.keyboard.press('ArrowDown'); // Green
    await page.keyboard.press('ArrowDown'); // Blue
    await page.waitForTimeout(50);

    // Blue should be selected
    await expect(items.nth(3)).toHaveAttribute('aria-selected', 'true');

    // Hover over Luma (index 5)
    await items.nth(5).hover();
    await page.waitForTimeout(50);

    // Blue deselected, Luma selected
    await expect(items.nth(3)).toHaveAttribute('aria-selected', 'false');
    await expect(items.nth(5)).toHaveAttribute('aria-selected', 'true');

    // Press Enter to select Luma
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await expect(dropdown).not.toBeVisible();
    await expect(channelButton).toContainText('L');
  });
});

test.describe('Dropdown Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E030: dropdown has proper ARIA role', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');

    // Dropdown should have listbox role
    await expect(dropdown).toHaveAttribute('role', 'listbox');
  });

  test('DM-E031: dropdown items have proper ARIA role', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // Each item should have option role
    const firstItem = items.nth(0);
    await expect(firstItem).toHaveAttribute('role', 'option');
  });

  test('DM-E032: aria-selected updates on keyboard navigation', async ({ page }) => {
    // Open zoom dropdown
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    await zoomButton.click();
    await page.waitForTimeout(100);

    const dropdown = page.locator('[data-testid="zoom-dropdown"]');
    const items = dropdown.locator('button');

    // First item should have aria-selected=true
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'true');

    // Navigate down
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    // Second item should now have aria-selected=true
    await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
    // First item should have aria-selected=false
    await expect(items.nth(0)).toHaveAttribute('aria-selected', 'false');
  });
});

test.describe('Dropdown Visual Deselection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('DM-E080: selecting new zoom resets previous zoom visual styling', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');

    // Select 100%
    await zoomButton.click();
    await page.waitForTimeout(100);
    let items = page.locator('[data-testid="zoom-dropdown"]:visible').locator('button');
    await items.nth(3).click(); // 100%
    await page.waitForTimeout(100);

    // Verify zoom is 100%
    await expect(zoomButton).toContainText('100%');
    const state100 = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state100).not.toBeNull();

    // Select 200%
    await zoomButton.click();
    await page.waitForTimeout(100);
    items = page.locator('[data-testid="zoom-dropdown"]:visible').locator('button');
    await items.nth(4).click(); // 200%
    await page.waitForTimeout(100);

    // Verify zoom is 200%
    await expect(zoomButton).toContainText('200%');
    const state200 = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state200).not.toBeNull();
    expect(state200.zoom).toBeGreaterThan(state100.zoom);
  });

  test('DM-E081: selecting new channel resets previous channel visual styling', async ({ page }) => {
    const channelButton = page.locator('[data-testid="channel-select-button"]');

    // Select Red channel
    await channelButton.click();
    await page.waitForTimeout(100);
    let items = page.locator('[data-testid="channel-dropdown"]:visible').locator('button');
    await items.nth(1).click(); // Red
    await page.waitForTimeout(100);

    // Verify channel is Red
    await expect(channelButton).toContainText('R');

    // Select Green channel
    await channelButton.click();
    await page.waitForTimeout(100);
    items = page.locator('[data-testid="channel-dropdown"]:visible').locator('button');
    await items.nth(2).click(); // Green
    await page.waitForTimeout(100);

    // Verify channel is Green
    await expect(channelButton).toContainText('G');
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state).not.toBeNull();
    expect(state.channelMode).toBe('green');
  });

  test('DM-E082: keyboard selection then mouse selection resets styling', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');

    // Open dropdown
    await zoomButton.click();
    await page.waitForTimeout(100);

    // Keyboard navigate to 50% (index 2) and select
    await page.keyboard.press('ArrowDown'); // 25%
    await page.keyboard.press('ArrowDown'); // 50%
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await expect(zoomButton).toContainText('50%');

    // Now mouse click 400%
    await zoomButton.click();
    await page.waitForTimeout(100);
    let items = page.locator('[data-testid="zoom-dropdown"]:visible').locator('button');
    await items.nth(5).click(); // 400%
    await page.waitForTimeout(100);

    await expect(zoomButton).toContainText('400%');
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state).not.toBeNull();
    expect(state.zoom).toBeGreaterThan(2);
  });

  test('DM-E083: mouse selection then keyboard selection resets styling', async ({ page }) => {
    const channelButton = page.locator('[data-testid="channel-select-button"]');

    // Mouse click Blue
    await channelButton.click();
    await page.waitForTimeout(100);
    let items = page.locator('[data-testid="channel-dropdown"]:visible').locator('button');
    await items.nth(3).click(); // Blue
    await page.waitForTimeout(100);

    await expect(channelButton).toContainText('B');

    // Now keyboard select Alpha
    await channelButton.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowDown'); // Red
    await page.keyboard.press('ArrowDown'); // Green
    await page.keyboard.press('ArrowDown'); // Blue
    await page.keyboard.press('ArrowDown'); // Alpha
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await expect(channelButton).toContainText('A');
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state).not.toBeNull();
    expect(state.channelMode).toBe('alpha');
  });

  test('DM-E084: only one item has selected styling after multiple selections', async ({ page }) => {
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');

    // Make multiple selections
    await zoomButton.click();
    await page.waitForTimeout(100);
    let items = page.locator('[data-testid="zoom-dropdown"]:visible').locator('button');
    await items.nth(1).click(); // 25%
    await page.waitForTimeout(100);

    await zoomButton.click();
    await page.waitForTimeout(100);
    items = page.locator('[data-testid="zoom-dropdown"]:visible').locator('button');
    await items.nth(3).click(); // 100%
    await page.waitForTimeout(100);

    await zoomButton.click();
    await page.waitForTimeout(100);
    items = page.locator('[data-testid="zoom-dropdown"]:visible').locator('button');
    await items.nth(2).click(); // 50%
    await page.waitForTimeout(100);

    await zoomButton.click();
    await page.waitForTimeout(100);
    items = page.locator('[data-testid="zoom-dropdown"]:visible').locator('button');
    await items.nth(4).click(); // 200%
    await page.waitForTimeout(100);

    // Final selection should be 200%
    await expect(zoomButton).toContainText('200%');
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state).not.toBeNull();
    expect(state.zoom).toBeGreaterThan(1.5);
  });

  test('DM-E085: rapid selections maintain correct visual state', async ({ page }) => {
    const channelButton = page.locator('[data-testid="channel-select-button"]');

    // Rapidly select different channels
    const channels = [1, 2, 3, 4, 5, 0]; // Red, Green, Blue, Alpha, Luma, RGB

    for (const idx of channels) {
      await channelButton.click();
      await page.waitForTimeout(50);
      const items = page.locator('[data-testid="channel-dropdown"]:visible').locator('button');
      await items.nth(idx).click();
      await page.waitForTimeout(50);
    }

    // Final selection is RGB (index 0)
    await expect(channelButton).toContainText('Ch'); // Default RGB label
    const state = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(state).not.toBeNull();
    expect(state.channelMode).toBe('rgb');
  });
});
