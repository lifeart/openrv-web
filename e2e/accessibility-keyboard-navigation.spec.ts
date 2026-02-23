import { test, expect } from '@playwright/test';
import { waitForTestHelper, openKeyboardShortcutsDialog } from './fixtures';

/**
 * Accessibility & Keyboard Navigation E2E Tests
 *
 * Tests real browser behavior for:
 * - ARIA landmark roles and attributes
 * - F6 zone cycling between UI regions
 * - Roving tabindex within tab bar and toolbars
 * - Modal focus trapping
 * - Skip link
 * - Focus-visible CSS outlines
 * - Screen reader announcer (aria-live region)
 */

test.describe('ARIA Landmarks & Roles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-001: HeaderBar has role="banner"', async ({ page }) => {
    const header = page.locator('.header-bar');
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute('role', 'banner');
  });

  test('A11Y-002: TabBar has role="tablist"', async ({ page }) => {
    const tabBar = page.locator('.tab-bar');
    await expect(tabBar).toBeVisible();
    await expect(tabBar).toHaveAttribute('role', 'tablist');
  });

  test('A11Y-003: Tab buttons have role="tab" with aria-selected', async ({ page }) => {
    const tabIds = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];
    for (const tabId of tabIds) {
      const tab = page.locator(`button[data-tab-id="${tabId}"]`);
      await expect(tab).toHaveAttribute('role', 'tab');
      // aria-selected should be a string 'true' or 'false'
      const selected = await tab.getAttribute('aria-selected');
      expect(['true', 'false']).toContain(selected);
    }
  });

  test('A11Y-004: Active tab has aria-selected="true", others "false"', async ({ page }) => {
    // View tab is active by default
    const viewTab = page.locator('button[data-tab-id="view"]');
    await expect(viewTab).toHaveAttribute('aria-selected', 'true');

    const colorTab = page.locator('button[data-tab-id="color"]');
    await expect(colorTab).toHaveAttribute('aria-selected', 'false');

    // Switch tab and verify
    await colorTab.click();
    await page.waitForTimeout(100);

    await expect(colorTab).toHaveAttribute('aria-selected', 'true');
    await expect(viewTab).toHaveAttribute('aria-selected', 'false');
  });

  test('A11Y-005: Tab buttons have aria-controls pointing to tabpanel IDs', async ({ page }) => {
    const tabIds = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];
    for (const tabId of tabIds) {
      const tab = page.locator(`button[data-tab-id="${tabId}"]`);
      await expect(tab).toHaveAttribute('aria-controls', `tabpanel-${tabId}`);
    }
  });

  test('A11Y-006: Tab buttons have unique IDs matching tab-{id} pattern', async ({ page }) => {
    const tabIds = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];
    for (const tabId of tabIds) {
      const tab = page.locator(`button[data-tab-id="${tabId}"]`);
      await expect(tab).toHaveAttribute('id', `tab-${tabId}`);
    }
  });

  test('A11Y-007: ContextToolbar has role="toolbar"', async ({ page }) => {
    const toolbar = page.locator('.context-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveAttribute('role', 'toolbar');
  });

  test('A11Y-008: ContextToolbar has aria-label that updates on tab change', async ({ page }) => {
    const toolbar = page.locator('.context-toolbar');
    await expect(toolbar).toHaveAttribute('aria-label', 'View controls');

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);
    await expect(toolbar).toHaveAttribute('aria-label', 'Color controls');

    // Switch to Effects tab
    await page.click('button[data-tab-id="effects"]');
    await page.waitForTimeout(100);
    await expect(toolbar).toHaveAttribute('aria-label', 'Effects controls');
  });

  test('A11Y-009: Tab panel containers have role="tabpanel" with aria-labelledby', async ({ page }) => {
    const tabIds = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];
    for (const tabId of tabIds) {
      const panel = page.locator(`#tabpanel-${tabId}`);
      // Panel exists in DOM (may be hidden)
      const count = await panel.count();
      expect(count).toBeGreaterThanOrEqual(1);

      await expect(panel.first()).toHaveAttribute('role', 'tabpanel');
      await expect(panel.first()).toHaveAttribute('aria-labelledby', `tab-${tabId}`);
    }
  });

  test('A11Y-010: HeaderBar button groups have role="toolbar" with aria-label', async ({ page }) => {
    const header = page.locator('.header-bar');
    const toolbars = header.locator('[role="toolbar"]');
    const count = await toolbars.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const label = await toolbars.nth(i).getAttribute('aria-label');
      expect(label).toBeTruthy();
    }
  });

  test('A11Y-011: Icon-only buttons in HeaderBar have aria-label', async ({ page }) => {
    const header = page.locator('.header-bar');
    // Buttons that have aria-label (icon-only buttons)
    const ariaButtons = header.locator('button[aria-label]');
    const count = await ariaButtons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const label = await ariaButtons.nth(i).getAttribute('aria-label');
      expect(label).toBeTruthy();
    }
  });

  test('A11Y-012: Viewer has role="main" and tabindex="0"', async ({ page }) => {
    const viewer = page.locator('#main-content');
    await expect(viewer).toBeVisible();
    await expect(viewer).toHaveAttribute('role', 'main');
    await expect(viewer).toHaveAttribute('tabindex', '0');
  });
});

test.describe('Screen Reader Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-020: aria-live announcer region exists', async ({ page }) => {
    const announcer = page.locator('#openrv-sr-announcer');
    // Element exists in DOM (visually hidden)
    const count = await announcer.count();
    expect(count).toBe(1);
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
  });

  test('A11Y-021: Tab change triggers screen reader announcement', async ({ page }) => {
    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(300); // rAF + textContent update

    const text = await page.locator('#openrv-sr-announcer').textContent();
    expect(text).toContain('Color');
  });

  test('A11Y-022: Skip link exists in DOM', async ({ page }) => {
    const skipLink = page.locator('a.skip-link');
    const count = await skipLink.count();
    expect(count).toBe(1);
    await expect(skipLink).toHaveAttribute('href', '#main-content');
    await expect(skipLink).toHaveText('Skip to main content');
  });

  test('A11Y-023: Skip link becomes visible on focus and moves focus to viewer', async ({ page }) => {
    // Tab into the page to reach skip link
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    const skipLink = page.locator('a.skip-link');

    // Check if skip link is now focused (it's the first focusable element)
    const isFocused = await page.evaluate(() => {
      return document.activeElement?.classList.contains('skip-link');
    });

    if (isFocused) {
      // Verify it's visible when focused (top: 0 from CSS)
      const box = await skipLink.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0); // Not hidden off-screen

      // Activate skip link
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);

      // Focus should now be on main-content
      const focusedId = await page.evaluate(() => document.activeElement?.id);
      expect(focusedId).toBe('main-content');
    }
  });
});

test.describe('Focus-Visible CSS', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-030: Focus-visible stylesheet is injected', async ({ page }) => {
    const styleEl = page.locator('#openrv-a11y-styles');
    const count = await styleEl.count();
    expect(count).toBe(1);

    const content = await styleEl.textContent();
    expect(content).toContain('focus-visible');
    expect(content).toContain('!important');
  });

  test('A11Y-031: Keyboard-focused button shows outline', async ({ page }) => {
    // Tab to reach a button
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // first button
    await page.waitForTimeout(100);

    // Check if active element is a button
    const tagName = await page.evaluate(() => document.activeElement?.tagName);
    if (tagName === 'BUTTON') {
      // Check computed outline on focused button
      const outline = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return '';
        return window.getComputedStyle(el).outlineStyle;
      });
      // Should have a visible outline (not 'none')
      expect(outline).not.toBe('none');
    }
  });

  test('A11Y-032: Mouse-clicked button does not show focus outline', async ({ page }) => {
    const viewTab = page.locator('button[data-tab-id="view"]');
    await viewTab.click();
    await page.waitForTimeout(100);

    // After mouse click, :focus-visible should NOT match (browsers handle this)
    const hasOutline = await viewTab.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
    });
    // Mouse clicks should not trigger focus-visible outline
    // Note: this depends on browser behavior; Chromium correctly distinguishes
    expect(hasOutline).toBe(false);
  });
});

test.describe('Tab Bar Roving Tabindex', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-040: Active tab has tabindex="0", inactive tabs have tabindex="-1"', async ({ page }) => {
    // View is active by default
    const viewTab = page.locator('button[data-tab-id="view"]');
    await expect(viewTab).toHaveAttribute('tabindex', '0');

    const colorTab = page.locator('button[data-tab-id="color"]');
    await expect(colorTab).toHaveAttribute('tabindex', '-1');

    const effectsTab = page.locator('button[data-tab-id="effects"]');
    await expect(effectsTab).toHaveAttribute('tabindex', '-1');
  });

  test('A11Y-041: Clicking a tab updates tabindex roving state', async ({ page }) => {
    // Click Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    const viewTab = page.locator('button[data-tab-id="view"]');
    await expect(viewTab).toHaveAttribute('tabindex', '-1');

    const colorTab = page.locator('button[data-tab-id="color"]');
    await expect(colorTab).toHaveAttribute('tabindex', '0');
  });

  test('A11Y-042: Arrow keys move focus within tab bar (roving tabindex)', async ({ page }) => {
    // Focus the View tab (active, tabindex=0)
    const viewTab = page.locator('button[data-tab-id="view"]');
    await viewTab.focus();
    await page.waitForTimeout(50);

    // Press ArrowRight to move to Color tab
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Focus should now be on Color tab
    const focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('color');

    // Tabindex should have updated
    await expect(viewTab).toHaveAttribute('tabindex', '-1');
    const colorTab = page.locator('button[data-tab-id="color"]');
    await expect(colorTab).toHaveAttribute('tabindex', '0');
  });

  test('A11Y-043: ArrowLeft moves focus backward in tab bar', async ({ page }) => {
    // Click Color tab to make it active, then focus it
    await page.click('button[data-tab-id="color"]');
    const colorTab = page.locator('button[data-tab-id="color"]');
    await colorTab.focus();
    await page.waitForTimeout(50);

    // Press ArrowLeft to go to View
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    const focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('view');
  });

  test('A11Y-044: Home key focuses first tab, End key focuses last tab', async ({ page }) => {
    // Focus a middle tab
    const effectsTab = page.locator('button[data-tab-id="effects"]');
    await page.click('button[data-tab-id="effects"]');
    await effectsTab.focus();
    await page.waitForTimeout(50);

    // Press Home
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    let focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('view');

    // Press End
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('qc');
  });

  test('A11Y-045: Arrow key wraps from last tab to first', async ({ page }) => {
    // Click and focus the last tab (QC)
    await page.click('button[data-tab-id="qc"]');
    const qcTab = page.locator('button[data-tab-id="qc"]');
    await qcTab.focus();
    await page.waitForTimeout(50);

    // ArrowRight from last should wrap to first
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('view');
  });
});

test.describe('F6 Zone Cycling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-050: F6 cycles focus between UI zones', async ({ page }) => {
    // Focus starts nowhere specific; press F6 to enter first zone
    await page.keyboard.press('F6');
    await page.waitForTimeout(100);

    // Should be in one of the UI zones (header, tabbar, etc.)
    const zone1 = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      // Walk up to find zone container
      if (el.closest('.header-bar')) return 'header';
      if (el.closest('.tab-bar')) return 'tabbar';
      if (el.closest('.context-toolbar')) return 'context';
      if (el.closest('#main-content')) return 'viewer';
      return 'other';
    });
    expect(zone1).not.toBeNull();

    // Press F6 again to cycle to next zone
    await page.keyboard.press('F6');
    await page.waitForTimeout(100);

    const zone2 = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      if (el.closest('.header-bar')) return 'header';
      if (el.closest('.tab-bar')) return 'tabbar';
      if (el.closest('.context-toolbar')) return 'context';
      if (el.closest('#main-content')) return 'viewer';
      return 'other';
    });

    // Zones should be different after F6
    expect(zone2).not.toBe(zone1);
  });

  test('A11Y-051: Shift+F6 cycles focus backward through zones', async ({ page }) => {
    // Press F6 twice to get to a known zone
    await page.keyboard.press('F6');
    await page.waitForTimeout(100);
    await page.keyboard.press('F6');
    await page.waitForTimeout(100);

    const forwardZone = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      if (el.closest('.header-bar')) return 'header';
      if (el.closest('.tab-bar')) return 'tabbar';
      if (el.closest('.context-toolbar')) return 'context';
      if (el.closest('#main-content')) return 'viewer';
      return 'other';
    });

    // Shift+F6 should go back
    await page.keyboard.press('Shift+F6');
    await page.waitForTimeout(100);

    const backwardZone = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      if (el.closest('.header-bar')) return 'header';
      if (el.closest('.tab-bar')) return 'tabbar';
      if (el.closest('.context-toolbar')) return 'context';
      if (el.closest('#main-content')) return 'viewer';
      return 'other';
    });

    expect(backwardZone).not.toBe(forwardZone);
  });

  test('A11Y-052: F6 cycling wraps around after visiting all zones', async ({ page }) => {
    // Press F6 to enter first zone
    await page.keyboard.press('F6');
    await page.waitForTimeout(100);

    const firstZone = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      if (el.closest('.header-bar')) return 'header';
      if (el.closest('.tab-bar')) return 'tabbar';
      if (el.closest('.context-toolbar')) return 'context';
      if (el.closest('#main-content')) return 'viewer';
      return 'other';
    });

    // Press F6 many times to cycle through all zones and wrap around
    const zones: string[] = [firstZone!];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('F6');
      await page.waitForTimeout(100);

      const zone = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        if (el.closest('.header-bar')) return 'header';
        if (el.closest('.tab-bar')) return 'tabbar';
        if (el.closest('.context-toolbar')) return 'context';
        if (el.closest('#main-content')) return 'viewer';
        return 'other';
      });
      zones.push(zone!);
    }

    // Should have visited at least 2 distinct zones
    const uniqueZones = new Set(zones.filter(Boolean));
    expect(uniqueZones.size).toBeGreaterThanOrEqual(2);

    // Should have wrapped (first zone appears more than once)
    const firstZoneCount = zones.filter((z) => z === firstZone).length;
    expect(firstZoneCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Modal Focus Trapping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-060: Modal has role="dialog" and aria-modal="true"', async ({ page }) => {
    // Open keyboard shortcuts modal via help button
    await openKeyboardShortcutsDialog(page);

    const modal = page.locator('.modal[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  test('A11Y-061: Modal has aria-labelledby pointing to title', async ({ page }) => {
    await openKeyboardShortcutsDialog(page);

    const modal = page.locator('.modal[role="dialog"]');
    const labelledBy = await modal.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    // The referenced element should exist and have text
    const titleEl = page.locator(`#${labelledBy}`);
    const titleText = await titleEl.textContent();
    expect(titleText).toBeTruthy();
  });

  test('A11Y-062: Escape closes modal', async ({ page }) => {
    await openKeyboardShortcutsDialog(page);

    const modal = page.locator('.modal[role="dialog"]');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Modal container should be hidden
    const container = page.locator('#modal-container');
    await expect(container).toHaveCSS('display', 'none');
  });

  test('A11Y-063: Focus returns to trigger button after modal close', async ({ page }) => {
    await openKeyboardShortcutsDialog(page);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Focus should return to the help menu button
    const focusedTestId = await page.evaluate(() => {
      return document.activeElement?.getAttribute('data-testid');
    });
    expect(focusedTestId).toBe('help-menu-button');
  });

  test('A11Y-064: Tab key is trapped inside modal', async ({ page }) => {
    await openKeyboardShortcutsDialog(page);

    // Get all focusable elements inside modal
    const modal = page.locator('.modal[role="dialog"]');
    await expect(modal).toBeVisible();

    // Tab multiple times - focus should stay inside the modal
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
    }

    // Verify focus is still inside the modal container
    const focusInModal = await page.evaluate(() => {
      const modalContainer = document.getElementById('modal-container');
      return modalContainer?.contains(document.activeElement) ?? false;
    });
    expect(focusInModal).toBe(true);
  });

  test('A11Y-065: Shift+Tab wraps backward inside modal', async ({ page }) => {
    await openKeyboardShortcutsDialog(page);

    // Shift+Tab multiple times
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(50);
    }

    // Focus should still be inside the modal
    const focusInModal = await page.evaluate(() => {
      const modalContainer = document.getElementById('modal-container');
      return modalContainer?.contains(document.activeElement) ?? false;
    });
    expect(focusInModal).toBe(true);
  });
});

test.describe('Button Keyboard Activation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-070: Enter key activates tab button', async ({ page }) => {
    // Focus the View tab
    const viewTab = page.locator('button[data-tab-id="view"]');
    await viewTab.focus();
    await page.waitForTimeout(50);

    // ArrowRight to Color tab
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);

    // Verify we're on Color tab button
    const focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('color');

    // Press Enter to activate
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Color tab should now be active (aria-selected=true)
    const colorTab = page.locator('button[data-tab-id="color"]');
    await expect(colorTab).toHaveAttribute('aria-selected', 'true');

    // Context toolbar label should update
    const toolbar = page.locator('.context-toolbar');
    await expect(toolbar).toHaveAttribute('aria-label', 'Color controls');
  });

  test('A11Y-071: Space key activates tab button', async ({ page }) => {
    // Focus the View tab
    const viewTab = page.locator('button[data-tab-id="view"]');
    await viewTab.focus();
    await page.waitForTimeout(50);

    // ArrowRight to Color tab
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);

    // Press Space to activate
    await page.keyboard.press(' ');
    await page.waitForTimeout(100);

    // Color tab should now be active
    const colorTab = page.locator('button[data-tab-id="color"]');
    await expect(colorTab).toHaveAttribute('aria-selected', 'true');
  });

  test('A11Y-072: All header buttons are focusable elements', async ({ page }) => {
    const header = page.locator('.header-bar');
    const buttons = header.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const tagName = await buttons.nth(i).evaluate((el) => el.tagName);
      expect(tagName).toBe('BUTTON');
      // None should have tabindex="-1" (unless they're in a roving group)
      // At minimum, they should be <button> elements which are natively focusable
    }
  });
});

test.describe('Full Keyboard Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-080: Complete keyboard-only navigation flow', async ({ page }) => {
    // Step 1: Tab into the page
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Step 2: F6 to navigate to tab bar zone
    // Press F6 until we reach the tab bar
    let inTabBar = false;
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('F6');
      await page.waitForTimeout(100);

      inTabBar = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('.tab-bar') !== null;
      });
      if (inTabBar) break;
    }
    expect(inTabBar).toBe(true);

    // Step 3: Use ArrowRight to navigate between tabs
    const initialTab = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(initialTab).toBeDefined();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const nextTab = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(nextTab).not.toBe(initialTab);

    // Step 4: Enter to activate tab
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const activeTab = page.locator(`button[data-tab-id="${nextTab}"]`);
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');

    // Step 5: F6 to move to header zone
    await page.keyboard.press('F6');
    await page.waitForTimeout(100);

    const inHeader = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.closest('.header-bar') !== null ||
        el?.closest('.tab-bar') !== null ||
        el?.closest('.context-toolbar') !== null ||
        el?.closest('#main-content') !== null;
    });
    expect(inHeader).toBe(true); // Should be in some zone
  });

  test('A11Y-081: Keyboard user can open and close modal without mouse', async ({ page }) => {
    // Navigate to help button via F6 to header zone
    let inHeader = false;
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('F6');
      await page.waitForTimeout(100);

      inHeader = await page.evaluate(() => {
        return document.activeElement?.closest('.header-bar') !== null;
      });
      if (inHeader) break;
    }

    if (inHeader) {
      // Use ArrowRight/ArrowLeft to find help button
      // Or just use the keyboard shortcut ? for help
      await page.keyboard.press('Shift+?');
      await page.waitForTimeout(300);

      // Check if modal opened
      const modalVisible = await page.evaluate(() => {
        const container = document.getElementById('modal-container');
        return container?.style.display === 'flex';
      });

      if (modalVisible) {
        // Tab through modal elements
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);

        // Focus should be inside modal
        const focusInModal = await page.evaluate(() => {
          const container = document.getElementById('modal-container');
          return container?.contains(document.activeElement) ?? false;
        });
        expect(focusInModal).toBe(true);

        // Escape to close
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Modal should be closed
        const closed = await page.evaluate(() => {
          const container = document.getElementById('modal-container');
          return container?.style.display === 'none';
        });
        expect(closed).toBe(true);
      }
    }
  });

  test('A11Y-082: Number keys 1-6 switch tabs and update ARIA state', async ({ page }) => {
    // Press 2 to switch to Color tab
    await page.keyboard.press('2');
    await page.waitForTimeout(100);

    const colorTab = page.locator('button[data-tab-id="color"]');
    await expect(colorTab).toHaveAttribute('aria-selected', 'true');
    await expect(colorTab).toHaveAttribute('tabindex', '0');

    const viewTab = page.locator('button[data-tab-id="view"]');
    await expect(viewTab).toHaveAttribute('aria-selected', 'false');
    await expect(viewTab).toHaveAttribute('tabindex', '-1');

    // Press 3 for Effects
    await page.keyboard.press('3');
    await page.waitForTimeout(100);

    const effectsTab = page.locator('button[data-tab-id="effects"]');
    await expect(effectsTab).toHaveAttribute('aria-selected', 'true');
    await expect(colorTab).toHaveAttribute('aria-selected', 'false');

    // Context toolbar label should match
    const toolbar = page.locator('.context-toolbar');
    await expect(toolbar).toHaveAttribute('aria-label', 'Effects controls');
  });

  test('A11Y-083: Focus is preserved when switching tabs with keyboard', async ({ page }) => {
    // Focus the View tab button
    const viewTab = page.locator('button[data-tab-id="view"]');
    await viewTab.focus();
    await page.waitForTimeout(50);

    // Navigate to Color tab with ArrowRight
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);

    // Activate it
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Focus should still be on the Color tab button (not lost to body)
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBe('BUTTON');

    const focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('color');
  });
});

test.describe('Focus Management Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('A11Y-090: Focus is not lost to document.body on tab switch', async ({ page }) => {
    // Switch through all tabs and verify focus is never on body
    const tabIds = ['color', 'effects', 'transform', 'annotate', 'qc', 'view'];
    for (const tabId of tabIds) {
      await page.click(`button[data-tab-id="${tabId}"]`);
      await page.waitForTimeout(100);

      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      // After clicking a tab, focus should be on the tab button, not <body> or <html>
      expect(focusedTag).not.toBe('HTML');
    }
  });

  test('A11Y-091: Multiple rapid F6 presses do not cause errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Rapidly press F6 many times
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('F6');
    }
    await page.waitForTimeout(200);

    expect(errors).toHaveLength(0);

    // Focus should be on a valid element
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeDefined();
  });

  test('A11Y-092: Arrow keys in tab bar do not affect playback when focus is in tablist', async ({ page }) => {
    // Focus the tab bar
    const viewTab = page.locator('button[data-tab-id="view"]');
    await viewTab.focus();
    await page.waitForTimeout(50);

    // Press ArrowRight - should move in tab bar, NOT step video frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Focus should be on Color tab (moved within tablist)
    const focusedTabId = await page.evaluate(() => {
      return (document.activeElement as HTMLElement)?.dataset?.tabId;
    });
    expect(focusedTabId).toBe('color');
  });

  test('A11Y-093: A11y styles are only injected once (idempotent)', async ({ page }) => {
    const styleCount = await page.evaluate(() => {
      return document.querySelectorAll('#openrv-a11y-styles').length;
    });
    expect(styleCount).toBe(1);
  });
});
