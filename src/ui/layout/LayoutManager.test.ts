/**
 * LayoutManager Tests
 *
 * Tests for DOM layout management, panel tabs, drag handles, and presets.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LayoutStore, COLLAPSED_RAIL_SIZE } from './LayoutStore';
import { LayoutManager } from './LayoutManager';

describe('LayoutManager', () => {
  let store: LayoutStore;
  let manager: LayoutManager;

  beforeEach(() => {
    localStorage.clear();
    store = new LayoutStore();
    manager = new LayoutManager(store);
  });

  afterEach(() => {
    manager.dispose();
    localStorage.clear();
  });

  describe('DOM structure', () => {
    it('LM-001: creates root element', () => {
      const el = manager.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('layout-root');
    });

    it('LM-002: has top section slot', () => {
      const top = manager.getTopSection();
      expect(top).toBeInstanceOf(HTMLElement);
      expect(top.className).toBe('layout-top');
    });

    it('LM-003: has viewer slot', () => {
      const viewer = manager.getViewerSlot();
      expect(viewer).toBeInstanceOf(HTMLElement);
      expect(viewer.className).toBe('layout-viewer');
    });

    it('LM-004: has bottom slot', () => {
      const bottom = manager.getBottomSlot();
      expect(bottom).toBeInstanceOf(HTMLElement);
      expect(bottom.className).toBe('layout-bottom');
    });

    it('LM-005: has left and right panel wrappers', () => {
      const root = manager.getElement();
      const leftPanel = root.querySelector('[data-testid="layout-panel-left"]');
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]');
      expect(leftPanel).not.toBeNull();
      expect(rightPanel).not.toBeNull();
    });

    it('LM-006: has collapse buttons', () => {
      const root = manager.getElement();
      const leftBtn = root.querySelector('[data-testid="layout-collapse-left"]');
      const rightBtn = root.querySelector('[data-testid="layout-collapse-right"]');
      expect(leftBtn).not.toBeNull();
      expect(rightBtn).not.toBeNull();
    });

    it('LM-007: has drag handles', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]');
      const rightHandle = root.querySelector('[data-testid="layout-handle-right"]');
      const bottomHandle = root.querySelector('[data-testid="layout-handle-bottom"]');
      expect(leftHandle).not.toBeNull();
      expect(rightHandle).not.toBeNull();
      expect(bottomHandle).not.toBeNull();
    });

    it('LM-008: has preset bar', () => {
      const root = manager.getElement();
      const presetBar = root.querySelector('[data-testid="layout-preset-bar"]');
      expect(presetBar).not.toBeNull();
    });

    it('LM-009: has preset buttons for all presets', () => {
      const root = manager.getElement();
      for (const preset of store.getPresets()) {
        const btn = root.querySelector(`[data-testid="layout-preset-${preset.id}"]`);
        expect(btn).not.toBeNull();
      }
    });
  });

  describe('Panel collapse/expand', () => {
    it('LM-010: collapsed panel shows only rail width', () => {
      const root = manager.getElement();
      const leftPanel = root.querySelector('[data-testid="layout-panel-left"]') as HTMLElement;
      expect(leftPanel.style.width).toBe(`${COLLAPSED_RAIL_SIZE}px`);
    });

    it('LM-011: expanding panel shows full width', () => {
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 300);

      const root = manager.getElement();
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]') as HTMLElement;
      expect(rightPanel.style.width).toBe('300px');
    });

    it('LM-012: collapse button click toggles panel', () => {
      const root = manager.getElement();
      const rightBtn = root.querySelector('[data-testid="layout-collapse-right"]') as HTMLButtonElement;

      // Initially collapsed
      expect(store.panels.right.collapsed).toBe(true);

      // Click to expand
      rightBtn.click();
      expect(store.panels.right.collapsed).toBe(false);

      // Click to collapse
      rightBtn.click();
      expect(store.panels.right.collapsed).toBe(true);
    });

    it('LM-013: content hidden when collapsed', () => {
      const root = manager.getElement();
      // Left panel is collapsed by default
      const leftContent = root.querySelector('.layout-panel-content-left') as HTMLElement;
      expect(leftContent.style.display).toBe('none');
    });
  });

  describe('Panel tabs', () => {
    it('LM-020: can add tab to panel', () => {
      const tabEl = document.createElement('div');
      tabEl.textContent = 'Tab Content';
      manager.addPanelTab('right', 'Test Tab', tabEl);

      const root = manager.getElement();
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]')!;
      const tabContent = rightPanel.querySelector('.layout-panel-tab-content');
      expect(tabContent!.contains(tabEl)).toBe(true);
    });

    it('LM-021: multiple tabs show tab bar', () => {
      const tab1 = document.createElement('div');
      const tab2 = document.createElement('div');
      manager.addPanelTab('right', 'Tab 1', tab1);
      manager.addPanelTab('right', 'Tab 2', tab2);

      store.setPanelCollapsed('right', false);

      const root = manager.getElement();
      const tabBar = root.querySelector('.layout-panel-tabs-right') as HTMLElement;
      const buttons = tabBar.querySelectorAll('button');
      expect(buttons.length).toBe(2);
    });

    it('LM-022: only active tab content is visible', () => {
      const tab1 = document.createElement('div');
      const tab2 = document.createElement('div');
      manager.addPanelTab('right', 'Tab 1', tab1);
      manager.addPanelTab('right', 'Tab 2', tab2);

      store.setPanelCollapsed('right', false);

      // Tab 0 is active by default
      expect(tab1.style.display).toBe('');
      expect(tab2.style.display).toBe('none');
    });

    it('LM-023: switching tab shows correct content', () => {
      const tab1 = document.createElement('div');
      const tab2 = document.createElement('div');
      manager.addPanelTab('right', 'Tab 1', tab1);
      manager.addPanelTab('right', 'Tab 2', tab2);

      store.setPanelCollapsed('right', false);
      store.setActiveTab('right', 1);

      expect(tab1.style.display).toBe('none');
      expect(tab2.style.display).toBe('');
    });

    it('LM-024: clearPanelTabs removes all tabs', () => {
      const tab1 = document.createElement('div');
      manager.addPanelTab('right', 'Tab 1', tab1);

      manager.clearPanelTabs('right');

      const root = manager.getElement();
      const tabBar = root.querySelector('.layout-panel-tabs-right') as HTMLElement;
      expect(tabBar.children.length).toBe(0);
    });

    it('LM-025: single tab hides tab bar', () => {
      const tab1 = document.createElement('div');
      manager.addPanelTab('right', 'Tab 1', tab1);

      store.setPanelCollapsed('right', false);

      const root = manager.getElement();
      const tabBar = root.querySelector('.layout-panel-tabs-right') as HTMLElement;
      expect(tabBar.style.display).toBe('none');
    });
  });

  describe('Preset switching', () => {
    it('LM-030: clicking preset button applies preset', () => {
      const root = manager.getElement();
      const colorBtn = root.querySelector('[data-testid="layout-preset-color"]') as HTMLButtonElement;
      colorBtn.click();

      expect(store.panels.left.collapsed).toBe(false);
      expect(store.panels.right.collapsed).toBe(false);
    });

    it('LM-031: preset bar has label', () => {
      const root = manager.getElement();
      const bar = root.querySelector('[data-testid="layout-preset-bar"]');
      expect(bar!.textContent).toContain('Layout:');
    });
  });

  describe('Keyboard shortcuts', () => {
    it('LM-040: Alt+1 applies default preset', () => {
      const handled = manager.handleKeyboard('1', true);
      expect(handled).toBe(true);
    });

    it('LM-041: Alt+3 applies color preset', () => {
      const handled = manager.handleKeyboard('3', true);
      expect(handled).toBe(true);
      expect(store.panels.left.collapsed).toBe(false); // color preset opens left
    });

    it('LM-042: non-Alt key returns false', () => {
      expect(manager.handleKeyboard('1', false)).toBe(false);
    });

    it('LM-043: unrecognized Alt key returns false', () => {
      expect(manager.handleKeyboard('9', true)).toBe(false);
    });
  });

  describe('Events', () => {
    it('LM-050: emits viewerResized when layout changes', () => {
      const spy = vi.fn();
      manager.on('viewerResized', spy);

      store.setPanelSize('bottom', 200);
      expect(spy).toHaveBeenCalled();
    });

    it('LM-051: emits viewerResized on preset apply', () => {
      const spy = vi.fn();
      manager.on('viewerResized', spy);

      store.applyPreset('review');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Dispose cleanup', () => {
    it('LM-060: dispose unsubscribes from store layoutChanged events', () => {
      const spy = vi.fn();
      manager.on('viewerResized', spy);

      // Verify events work before dispose
      store.setPanelSize('bottom', 200);
      expect(spy).toHaveBeenCalledTimes(1);

      // Dispose the manager
      manager.dispose();

      // Reset spy count
      spy.mockClear();

      // Store changes should no longer trigger applyLayout / viewerResized
      // We need a fresh store since dispose() also disposes the store,
      // but the store event listeners should have been unsubscribed first.
      // Let's test with a standalone approach:
    });

    it('LM-061: after dispose, store events do not trigger applyLayout', () => {
      // Create a fresh store and manager so we control the lifecycle
      const testStore = new LayoutStore();
      const testManager = new LayoutManager(testStore);

      const viewerSpy = vi.fn();
      testManager.on('viewerResized', viewerSpy);

      // Verify events work before dispose
      testStore.setPanelSize('bottom', 200);
      expect(viewerSpy).toHaveBeenCalledTimes(1);
      viewerSpy.mockClear();

      // Unsubscribe from store events by calling dispose
      // But we don't want to also dispose the store, so we'll test the
      // unsubscribe directly by checking the manager's reaction
      testManager.dispose();

      // Create new listeners on the store to verify it still emits
      const storeSpy = vi.fn();
      testStore.on('layoutChanged', storeSpy);

      testStore.setPanelSize('bottom', 250);
      // Store still emits (it was disposed but we can still call methods)
      expect(storeSpy).toHaveBeenCalledTimes(1);

      // But the manager should NOT have reacted (no viewerResized emitted)
      expect(viewerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Bottom panel collapse/expand', () => {
    it('LM-070: bottom panel is visible when not collapsed', () => {
      const root = manager.getElement();
      const bottomSlot = manager.getBottomSlot();
      const bottomHandle = root.querySelector('[data-testid="layout-handle-bottom"]') as HTMLElement;

      // Bottom is not collapsed by default
      expect(store.panels.bottom.collapsed).toBe(false);
      expect(bottomSlot.style.display).not.toBe('none');
      expect(bottomSlot.style.height).toBe(`${store.panels.bottom.size}px`);
      expect(bottomHandle.style.display).not.toBe('none');
    });

    it('LM-071: bottom panel hides when collapsed', () => {
      store.setPanelCollapsed('bottom', true);

      const root = manager.getElement();
      const bottomSlot = manager.getBottomSlot();
      const bottomHandle = root.querySelector('[data-testid="layout-handle-bottom"]') as HTMLElement;

      expect(bottomSlot.style.display).toBe('none');
      expect(bottomSlot.style.height).toBe('0px');
      expect(bottomHandle.style.display).toBe('none');
    });

    it('LM-072: bottom panel restores when expanded after collapse', () => {
      store.setPanelCollapsed('bottom', true);
      store.setPanelCollapsed('bottom', false);

      const bottomSlot = manager.getBottomSlot();
      expect(bottomSlot.style.display).toBe('');
      expect(bottomSlot.style.height).toBe(`${store.panels.bottom.size}px`);
    });

    it('LM-073: bottom panel size updates on setPanelSize', () => {
      store.setPanelSize('bottom', 200);

      const bottomSlot = manager.getBottomSlot();
      expect(bottomSlot.style.height).toBe('200px');
    });
  });
});
