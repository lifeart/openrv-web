/**
 * Integration tests for the MED-25 OutsideClickRegistry migration.
 *
 * These tests open real migrated components (BugOverlaySettingsMenu and
 * InfoStripSettingsMenu) and verify that clicking outside the popover (via
 * the centralized registry) still dismisses them, that clicking inside does
 * not, and that disposing the menu deregisters from the central registry.
 *
 * They also assert the registry-level invariant: opening N popovers does
 * NOT add N global document listeners — the registry maintains exactly one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BugOverlaySettingsMenu } from './BugOverlaySettingsMenu';
import { InfoStripSettingsMenu } from './InfoStripSettingsMenu';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

function bugOverlayMock() {
  let state = {
    enabled: false,
    imageUrl: null as string | null,
    position: 'bottom-right' as const,
    size: 0.08,
    opacity: 0.8,
    margin: 12,
  };
  return {
    getState: () => ({ ...state }),
    hasImage: () => state.imageUrl !== null,
    loadImage: vi.fn(async (imageUrl: string) => {
      state = { ...state, imageUrl, enabled: true };
    }),
    removeImage: () => {
      state = { ...state, imageUrl: null, enabled: false };
    },
    setPosition: (position: any) => {
      state = { ...state, position };
    },
    setSize: (size: number) => {
      state = { ...state, size };
    },
    setOpacity: (opacity: number) => {
      state = { ...state, opacity };
    },
    setMargin: (margin: number) => {
      state = { ...state, margin };
    },
  };
}

function infoStripMock() {
  let state = { showFullPath: false, backgroundOpacity: 0.6 };
  return {
    getState: () => ({ ...state }),
    setShowFullPath: (v: boolean) => {
      state = { ...state, showFullPath: v };
    },
    setBackgroundOpacity: (v: number) => {
      state = { ...state, backgroundOpacity: v };
    },
  };
}

describe('OutsideClickRegistry — integration with migrated components', () => {
  beforeEach(() => {
    // Make sure no leftover registrations leak from prior test files.
    outsideClickRegistry.reset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    outsideClickRegistry.reset();
    vi.restoreAllMocks();
  });

  describe('BugOverlaySettingsMenu', () => {
    it('dismisses on mousedown outside the menu', () => {
      const overlay = bugOverlayMock();
      const menu = new BugOverlaySettingsMenu(overlay as any);

      menu.show(100, 100);
      expect(menu.isVisible()).toBe(true);
      expect(outsideClickRegistry.getRegistrationCount()).toBe(1);

      // Click outside (a fresh element appended to body, not inside the menu).
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(menu.isVisible()).toBe(false);
      expect(outsideClickRegistry.getRegistrationCount()).toBe(0);
    });

    it('does NOT dismiss on mousedown inside the menu', () => {
      const overlay = bugOverlayMock();
      const menu = new BugOverlaySettingsMenu(overlay as any);

      menu.show(100, 100);
      const menuEl = document.querySelector('.bug-overlay-settings-menu')!;
      expect(menuEl).toBeTruthy();

      menuEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(menu.isVisible()).toBe(true);
    });

    it('dismisses on Escape key', () => {
      const overlay = bugOverlayMock();
      const menu = new BugOverlaySettingsMenu(overlay as any);

      menu.show(100, 100);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(menu.isVisible()).toBe(false);
    });

    it('deregisters on dispose', () => {
      const overlay = bugOverlayMock();
      const menu = new BugOverlaySettingsMenu(overlay as any);

      menu.show(100, 100);
      expect(outsideClickRegistry.getRegistrationCount()).toBe(1);

      menu.dispose();
      expect(outsideClickRegistry.getRegistrationCount()).toBe(0);
    });
  });

  describe('InfoStripSettingsMenu', () => {
    it('dismisses on mousedown outside the menu', () => {
      const overlay = infoStripMock();
      const menu = new InfoStripSettingsMenu(overlay as any);

      menu.show(100, 100);
      expect(menu.isVisible()).toBe(true);

      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(menu.isVisible()).toBe(false);
    });

    it('does NOT dismiss on mousedown inside the menu', () => {
      const overlay = infoStripMock();
      const menu = new InfoStripSettingsMenu(overlay as any);

      menu.show(100, 100);
      const menuEl = document.querySelector('.info-strip-settings-menu')!;
      menuEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(menu.isVisible()).toBe(true);
    });
  });

  describe('listener count invariant', () => {
    it('opening multiple popovers does not add multiple global mousedown listeners', () => {
      // Spy BEFORE any popover opens — we want to count document-level adds.
      const addSpy = vi.spyOn(document, 'addEventListener');

      const m1 = new BugOverlaySettingsMenu(bugOverlayMock() as any);
      const m2 = new InfoStripSettingsMenu(infoStripMock() as any);

      m1.show(100, 100);
      m2.show(200, 200);

      // The registry attaches its global listeners exactly once — after that
      // additional `register()` calls do not add more `addEventListener`
      // invocations to document. Filter for the event types the registry uses.
      const registryEventTypes = ['mousedown', 'click', 'keydown'];
      const calls = addSpy.mock.calls.filter((c) => registryEventTypes.includes(c[0] as string));
      // At most one of each type from the registry. (Other code in the
      // component may add unrelated listeners — but we filter for the
      // global capture-phase listeners the registry installs.)
      // We assert: no listener type was added more than once for the
      // duration of two open popovers.
      const counts = new Map<string, number>();
      for (const c of calls) {
        const t = c[0] as string;
        // Only count *capture-phase* listeners (the registry uses capture).
        const useCapture = c[2] === true || (typeof c[2] === 'object' && (c[2] as any)?.capture === true);
        if (!useCapture) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      for (const [, n] of counts) {
        expect(n).toBeLessThanOrEqual(1);
      }

      m1.dispose();
      m2.dispose();
      addSpy.mockRestore();
    });

    it('LIFO dismissal: opening menu B over menu A; clicking outside dismisses both', () => {
      const m1 = new BugOverlaySettingsMenu(bugOverlayMock() as any);
      const m2 = new InfoStripSettingsMenu(infoStripMock() as any);

      m1.show(100, 100);
      m2.show(200, 200);

      expect(outsideClickRegistry.getRegistrationCount()).toBe(2);

      // Click far outside both menus.
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(m1.isVisible()).toBe(false);
      expect(m2.isVisible()).toBe(false);
      expect(outsideClickRegistry.getRegistrationCount()).toBe(0);
    });
  });
});
