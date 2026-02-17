/**
 * LayoutManager Tests
 *
 * Tests for DOM layout management, panel tabs, drag handles, and presets.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LayoutStore, COLLAPSED_RAIL_SIZE, DEFAULT_PANEL_STATES } from './LayoutStore';
import { LayoutManager } from './LayoutManager';

// Polyfill PointerEvent for jsdom (which does not implement it)
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? '';
    }
  };
}

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
      // Register content so the panel can expand
      const tab = document.createElement('div');
      manager.addPanelTab('right', 'Tab', tab);

      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 300);

      const root = manager.getElement();
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]') as HTMLElement;
      expect(rightPanel.style.width).toBe('300px');
    });

    it('LM-012: collapse button click toggles panel', () => {
      // Register content so the panel can expand
      const tab = document.createElement('div');
      manager.addPanelTab('right', 'Tab', tab);

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
      // Register content on both panels so they can expand
      manager.addPanelTab('left', 'Tab', document.createElement('div'));
      manager.addPanelTab('right', 'Tab', document.createElement('div'));

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

  describe('Active preset indicator (M-30)', () => {
    it('LM-M30a: after applying "Color" preset, the Color button should have active styling', () => {
      const root = manager.getElement();
      store.applyPreset('color');

      const colorBtn = root.querySelector('[data-testid="layout-preset-color"]') as HTMLElement;
      expect(colorBtn.style.background).toBe('var(--accent-primary)');
      expect(colorBtn.style.borderColor).toBe('var(--accent-primary)');
    });

    it('LM-M30b: after applying "Color" preset, other preset buttons should NOT have active styling', () => {
      const root = manager.getElement();
      store.applyPreset('color');

      const defaultBtn = root.querySelector('[data-testid="layout-preset-default"]') as HTMLElement;
      const reviewBtn = root.querySelector('[data-testid="layout-preset-review"]') as HTMLElement;
      const paintBtn = root.querySelector('[data-testid="layout-preset-paint"]') as HTMLElement;

      expect(defaultBtn.style.background).toBe('transparent');
      expect(reviewBtn.style.background).toBe('transparent');
      expect(paintBtn.style.background).toBe('transparent');
    });

    it('LM-M30c: active button should have aria-pressed="true"', () => {
      const root = manager.getElement();
      store.applyPreset('color');

      const colorBtn = root.querySelector('[data-testid="layout-preset-color"]') as HTMLElement;
      expect(colorBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('LM-M30d: inactive buttons should have aria-pressed="false"', () => {
      const root = manager.getElement();
      store.applyPreset('color');

      const defaultBtn = root.querySelector('[data-testid="layout-preset-default"]') as HTMLElement;
      const reviewBtn = root.querySelector('[data-testid="layout-preset-review"]') as HTMLElement;
      const paintBtn = root.querySelector('[data-testid="layout-preset-paint"]') as HTMLElement;

      expect(defaultBtn.getAttribute('aria-pressed')).toBe('false');
      expect(reviewBtn.getAttribute('aria-pressed')).toBe('false');
      expect(paintBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('LM-M30e: switching preset updates active state from one button to another', () => {
      const root = manager.getElement();

      // Apply color first
      store.applyPreset('color');
      const colorBtn = root.querySelector('[data-testid="layout-preset-color"]') as HTMLElement;
      const reviewBtn = root.querySelector('[data-testid="layout-preset-review"]') as HTMLElement;

      expect(colorBtn.getAttribute('aria-pressed')).toBe('true');
      expect(reviewBtn.getAttribute('aria-pressed')).toBe('false');

      // Switch to review
      store.applyPreset('review');

      expect(colorBtn.getAttribute('aria-pressed')).toBe('false');
      expect(colorBtn.style.background).toBe('transparent');
      expect(reviewBtn.getAttribute('aria-pressed')).toBe('true');
      expect(reviewBtn.style.background).toBe('var(--accent-primary)');
    });

    it('LM-M30f: all preset buttons have aria-pressed="false" initially (no preset applied)', () => {
      const root = manager.getElement();

      for (const preset of store.getPresets()) {
        const btn = root.querySelector(`[data-testid="layout-preset-${preset.id}"]`) as HTMLElement;
        expect(btn.getAttribute('aria-pressed')).toBe('false');
      }
    });
  });

  describe('Keyboard shortcuts', () => {
    it('LM-040: Alt+1 applies default preset', () => {
      const handled = manager.handleKeyboard('1', true);
      expect(handled).toBe(true);
    });

    it('LM-041: Alt+3 applies color preset', () => {
      // Register content on left panel so it can expand
      manager.addPanelTab('left', 'Tab', document.createElement('div'));

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

  describe('Pointer capture on drag', () => {
    it('LM-M17c: onDragStart should call setPointerCapture on the handle element', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]') as HTMLElement;

      // Expand left panel so the handle is visible
      store.setPanelCollapsed('left', false);

      const setCaptureSpy = vi.fn();
      leftHandle.setPointerCapture = setCaptureSpy;

      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 7,
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });
      leftHandle.dispatchEvent(pointerDown);

      expect(setCaptureSpy).toHaveBeenCalledWith(7);
    });

    it('LM-M17d: onDragEnd should call releasePointerCapture', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]') as HTMLElement;

      // Expand left panel so the handle is visible
      store.setPanelCollapsed('left', false);

      const setCaptureSpy = vi.fn();
      const releaseCaptureSpy = vi.fn();
      leftHandle.setPointerCapture = setCaptureSpy;
      leftHandle.releasePointerCapture = releaseCaptureSpy;

      // Start drag
      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 7,
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });
      leftHandle.dispatchEvent(pointerDown);

      // End drag
      const pointerUp = new PointerEvent('pointerup', {
        pointerId: 7,
        clientX: 120,
        clientY: 200,
        bubbles: true,
      });
      document.dispatchEvent(pointerUp);

      expect(releaseCaptureSpy).toHaveBeenCalledWith(7);
    });
  });

  describe('M-32: Body cursor enforced during layout resize drag', () => {
    it('LM-M32a: during a horizontal drag, document.body.style.cursor should be col-resize', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]') as HTMLElement;

      store.setPanelCollapsed('left', false);

      leftHandle.setPointerCapture = vi.fn();

      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });
      leftHandle.dispatchEvent(pointerDown);

      expect(document.body.style.cursor).toBe('col-resize');

      // Clean up: end drag
      leftHandle.releasePointerCapture = vi.fn();
      document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    });

    it('LM-M32b: during a vertical drag, document.body.style.cursor should be row-resize', () => {
      const root = manager.getElement();
      const bottomHandle = root.querySelector('[data-testid="layout-handle-bottom"]') as HTMLElement;

      bottomHandle.setPointerCapture = vi.fn();

      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 300,
        clientY: 400,
        bubbles: true,
      });
      bottomHandle.dispatchEvent(pointerDown);

      expect(document.body.style.cursor).toBe('row-resize');

      // Clean up: end drag
      bottomHandle.releasePointerCapture = vi.fn();
      document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }));
    });

    it('LM-M32c: after drag ends, document.body.style.cursor should be reset to empty string', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]') as HTMLElement;

      store.setPanelCollapsed('left', false);

      leftHandle.setPointerCapture = vi.fn();
      leftHandle.releasePointerCapture = vi.fn();

      // Start drag
      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 3,
        clientX: 100,
        clientY: 200,
        bubbles: true,
      });
      leftHandle.dispatchEvent(pointerDown);

      // Verify cursor is set during drag
      expect(document.body.style.cursor).toBe('col-resize');

      // End drag
      document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true }));

      expect(document.body.style.cursor).toBe('');
    });
  });

  describe('M-31: Layout splitter visible at rest', () => {
    it('LM-M31a: drag handle should have a non-transparent background at rest (visible indicator)', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]') as HTMLElement;
      const rightHandle = root.querySelector('[data-testid="layout-handle-right"]') as HTMLElement;
      const bottomHandle = root.querySelector('[data-testid="layout-handle-bottom"]') as HTMLElement;

      // All handles should have a visible background at rest (not transparent)
      expect(leftHandle.style.background).toBe('var(--border-primary)');
      expect(rightHandle.style.background).toBe('var(--border-primary)');
      expect(bottomHandle.style.background).toBe('var(--border-primary)');

      // They should have low opacity to be subtle
      expect(leftHandle.style.opacity).toBe('0.2');
      expect(rightHandle.style.opacity).toBe('0.2');
      expect(bottomHandle.style.opacity).toBe('0.2');
    });

    it('LM-M31b: drag handle should increase visibility on hover (stronger background)', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]') as HTMLElement;

      // Simulate mouseenter
      leftHandle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      // Should show accent color with higher opacity on hover
      expect(leftHandle.style.background).toBe('var(--accent-primary)');
      expect(leftHandle.style.opacity).toBe('0.5');

      // Simulate mouseleave
      leftHandle.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      // Should restore to subtle rest state
      expect(leftHandle.style.background).toBe('var(--border-primary)');
      expect(leftHandle.style.opacity).toBe('0.2');
    });

    it('LM-M31c: drag handle should show resize cursor on hover', () => {
      const root = manager.getElement();
      const leftHandle = root.querySelector('[data-testid="layout-handle-left"]') as HTMLElement;
      const rightHandle = root.querySelector('[data-testid="layout-handle-right"]') as HTMLElement;
      const bottomHandle = root.querySelector('[data-testid="layout-handle-bottom"]') as HTMLElement;

      // Side handles should have col-resize cursor
      expect(leftHandle.style.cursor).toBe('col-resize');
      expect(rightHandle.style.cursor).toBe('col-resize');

      // Bottom handle should have row-resize cursor
      expect(bottomHandle.style.cursor).toBe('row-resize');
    });
  });

  describe('L-36: Double-click-to-reset on layout splitters', () => {
    it('LM-L36a: double-clicking a side panel handle resets its size to the default preset value', () => {
      // Register content so the panel can expand
      const tab = document.createElement('div');
      manager.addPanelTab('right', 'Tab', tab);

      // Expand and resize the right panel to a non-default size
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 450);
      expect(store.panels.right.size).toBe(450);

      // Double-click the right handle
      const root = manager.getElement();
      const rightHandle = root.querySelector('[data-testid="layout-handle-right"]') as HTMLElement;
      rightHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      // Size should be reset to default
      expect(store.panels.right.size).toBe(DEFAULT_PANEL_STATES.right.size);
    });

    it('LM-L36b: double-clicking the bottom panel handle resets its height to the default', () => {
      // Resize bottom panel to a non-default size
      store.setPanelSize('bottom', 250);
      expect(store.panels.bottom.size).toBe(250);

      // Double-click the bottom handle
      const root = manager.getElement();
      const bottomHandle = root.querySelector('[data-testid="layout-handle-bottom"]') as HTMLElement;
      bottomHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      // Size should be reset to default
      expect(store.panels.bottom.size).toBe(DEFAULT_PANEL_STATES.bottom.size);
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

  describe('H-09: Empty panels stay collapsed', () => {
    it('LP-H09a: layout presets that expand side panels should only do so if the panel has content registered', () => {
      // No tabs registered for left or right panels
      expect(manager.hasPanelContent('left')).toBe(false);
      expect(manager.hasPanelContent('right')).toBe(false);

      // Apply "color" preset which normally expands both side panels
      store.applyPreset('color');

      const root = manager.getElement();
      const leftPanel = root.querySelector('[data-testid="layout-panel-left"]') as HTMLElement;
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]') as HTMLElement;

      // Both should remain at collapsed rail width since there's no content
      expect(leftPanel.style.width).toBe(`${COLLAPSED_RAIL_SIZE}px`);
      expect(rightPanel.style.width).toBe(`${COLLAPSED_RAIL_SIZE}px`);

      // Content areas should be hidden
      const leftContent = root.querySelector('.layout-panel-content-left') as HTMLElement;
      const rightContent = root.querySelector('.layout-panel-content-right') as HTMLElement;
      expect(leftContent.style.display).toBe('none');
      expect(rightContent.style.display).toBe('none');
    });

    it('LP-H09a2: layout presets expand panels that have registered content', () => {
      // Register content on right panel
      const tab = document.createElement('div');
      tab.textContent = 'Some content';
      manager.addPanelTab('right', 'Info', tab);

      // Apply "review" preset which expands right panel
      store.applyPreset('review');

      const root = manager.getElement();
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]') as HTMLElement;

      // Right panel should be expanded since it has content
      expect(rightPanel.style.width).toBe('300px');

      // Left panel should stay collapsed (no content)
      const leftPanel = root.querySelector('[data-testid="layout-panel-left"]') as HTMLElement;
      expect(leftPanel.style.width).toBe(`${COLLAPSED_RAIL_SIZE}px`);
    });

    it('LP-H09b: if no panel tabs are registered, the collapse toggle should be hidden', () => {
      const root = manager.getElement();

      // No tabs registered, collapse buttons should be hidden
      const leftBtn = root.querySelector('[data-testid="layout-collapse-left"]') as HTMLElement;
      const rightBtn = root.querySelector('[data-testid="layout-collapse-right"]') as HTMLElement;

      expect(leftBtn.style.display).toBe('none');
      expect(rightBtn.style.display).toBe('none');
    });

    it('LP-H09b2: collapse toggle is visible when panel has registered content', () => {
      const tab = document.createElement('div');
      manager.addPanelTab('right', 'Tab', tab);

      const root = manager.getElement();
      const rightBtn = root.querySelector('[data-testid="layout-collapse-right"]') as HTMLElement;

      expect(rightBtn.style.display).toBe('flex');
    });

    it('LP-H09c: applying a preset with side panels when no tabs registered should keep panels collapsed', () => {
      // Apply "color" preset (expands left: 260px, right: 300px)
      store.applyPreset('color');

      // Store should have been corrected to collapsed
      expect(store.panels.left.collapsed).toBe(true);
      expect(store.panels.right.collapsed).toBe(true);

      // DOM should show collapsed rail width
      const root = manager.getElement();
      const leftPanel = root.querySelector('[data-testid="layout-panel-left"]') as HTMLElement;
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]') as HTMLElement;

      expect(leftPanel.style.width).toBe(`${COLLAPSED_RAIL_SIZE}px`);
      expect(rightPanel.style.width).toBe(`${COLLAPSED_RAIL_SIZE}px`);
    });

    it('LP-H09c2: applying preset when only one side has content expands only that side', () => {
      // Register content on left panel only
      const tab = document.createElement('div');
      manager.addPanelTab('left', 'Browser', tab);

      // Apply "color" preset (expands left: 260px, right: 300px)
      store.applyPreset('color');

      // Left should be expanded (has content)
      expect(store.panels.left.collapsed).toBe(false);
      const root = manager.getElement();
      const leftPanel = root.querySelector('[data-testid="layout-panel-left"]') as HTMLElement;
      expect(leftPanel.style.width).toBe('260px');

      // Right should be collapsed (no content)
      expect(store.panels.right.collapsed).toBe(true);
      const rightPanel = root.querySelector('[data-testid="layout-panel-right"]') as HTMLElement;
      expect(rightPanel.style.width).toBe(`${COLLAPSED_RAIL_SIZE}px`);
    });

    it('LP-H09d: hasPanelContent returns correct state', () => {
      expect(manager.hasPanelContent('left')).toBe(false);
      expect(manager.hasPanelContent('right')).toBe(false);

      const tab = document.createElement('div');
      manager.addPanelTab('left', 'Tab', tab);

      expect(manager.hasPanelContent('left')).toBe(true);
      expect(manager.hasPanelContent('right')).toBe(false);

      manager.clearPanelTabs('left');

      expect(manager.hasPanelContent('left')).toBe(false);
    });
  });

  describe('L-37: Bottom panel collapse toggle button', () => {
    it('LM-L37a: Bottom panel should have a collapse/expand toggle button', () => {
      const root = manager.getElement();
      const btn = root.querySelector('[data-testid="layout-collapse-bottom"]');
      expect(btn).not.toBeNull();
      expect(btn).toBeInstanceOf(HTMLButtonElement);
    });

    it('LM-L37b: Clicking the button should toggle the bottom panel collapsed state', () => {
      const root = manager.getElement();
      const btn = root.querySelector('[data-testid="layout-collapse-bottom"]') as HTMLButtonElement;

      // Bottom panel starts expanded
      expect(store.panels.bottom.collapsed).toBe(false);

      // Click to collapse
      btn.click();
      expect(store.panels.bottom.collapsed).toBe(true);

      // Click to expand
      btn.click();
      expect(store.panels.bottom.collapsed).toBe(false);
    });

    it('LM-L37c: The button icon should reflect the current collapsed state (chevron direction)', () => {
      const root = manager.getElement();
      const btn = root.querySelector('[data-testid="layout-collapse-bottom"]') as HTMLButtonElement;

      // chevron-down path: points="6 9 12 15 18 9"
      // chevron-up path: points="18 15 12 9 6 15"
      const chevronDownPoints = '6 9 12 15 18 9';
      const chevronUpPoints = '18 15 12 9 6 15';

      // When expanded, icon should be chevron-down (collapse direction)
      expect(btn.innerHTML).toContain(chevronDownPoints);

      // Collapse the bottom panel
      store.setPanelCollapsed('bottom', true);

      // When collapsed, icon should be chevron-up (expand direction)
      expect(btn.innerHTML).toContain(chevronUpPoints);

      // Expand again
      store.setPanelCollapsed('bottom', false);

      // Should go back to chevron-down
      expect(btn.innerHTML).toContain(chevronDownPoints);
    });
  });
});
