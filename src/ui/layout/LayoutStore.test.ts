/**
 * LayoutStore Tests
 *
 * Tests for panel layout state management, persistence, presets, and resize handling.
 * Covers LAYOUT-001 through LAYOUT-005 acceptance criteria.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LayoutStore,
  LAYOUT_STORAGE_KEY,
  LAYOUT_SCHEMA_VERSION,
  MIN_SIDE_PANEL_WIDTH,
  MIN_BOTTOM_PANEL_HEIGHT,
  MAX_SIDE_PANEL_RATIO,
  MAX_BOTTOM_PANEL_RATIO,
  COLLAPSED_RAIL_SIZE,
  DEFAULT_PANEL_STATES,
} from './LayoutStore';

describe('LayoutStore', () => {
  let store: LayoutStore;

  beforeEach(() => {
    localStorage.clear();
    store = new LayoutStore();
  });

  afterEach(() => {
    store.dispose();
    localStorage.clear();
  });

  describe('LAYOUT-001: Panel state management', () => {
    it('LAYOUT-001a: initializes with default panel states', () => {
      expect(store.panels.left.collapsed).toBe(true);
      expect(store.panels.right.collapsed).toBe(true);
      expect(store.panels.bottom.collapsed).toBe(false);
      expect(store.panels.bottom.size).toBe(120);
    });

    it('LAYOUT-001b: setPanelCollapsed toggles collapse state', () => {
      store.setPanelCollapsed('right', false);
      expect(store.panels.right.collapsed).toBe(false);

      store.setPanelCollapsed('right', true);
      expect(store.panels.right.collapsed).toBe(true);
    });

    it('LAYOUT-001c: togglePanelCollapsed flips state', () => {
      expect(store.panels.left.collapsed).toBe(true);
      store.togglePanelCollapsed('left');
      expect(store.panels.left.collapsed).toBe(false);
      store.togglePanelCollapsed('left');
      expect(store.panels.left.collapsed).toBe(true);
    });

    it('LAYOUT-001d: setPanelSize updates and clamps side panel', () => {
      store.setPanelSize('right', 300);
      expect(store.panels.right.size).toBe(300);

      // Minimum clamping
      store.setPanelSize('right', 50);
      expect(store.panels.right.size).toBe(MIN_SIDE_PANEL_WIDTH);
    });

    it('LAYOUT-001e: setPanelSize clamps bottom panel', () => {
      store.setPanelSize('bottom', 200);
      expect(store.panels.bottom.size).toBe(200);

      // Minimum clamping
      store.setPanelSize('bottom', 30);
      expect(store.panels.bottom.size).toBe(MIN_BOTTOM_PANEL_HEIGHT);
    });

    it('LAYOUT-001f: getEffectiveSize returns rail size when collapsed', () => {
      store.setPanelCollapsed('right', true);
      expect(store.getEffectiveSize('right')).toBe(COLLAPSED_RAIL_SIZE);

      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 300);
      expect(store.getEffectiveSize('right')).toBe(300);
    });

    it('LAYOUT-001g: getViewerWidth subtracts panel sizes', () => {
      store.setPanelCollapsed('left', true);
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 300);

      const viewerWidth = store.getViewerWidth(1920);
      expect(viewerWidth).toBe(1920 - COLLAPSED_RAIL_SIZE - 300);
    });

    it('LAYOUT-001h: getViewerHeight subtracts bottom and fixed top', () => {
      store.setPanelSize('bottom', 140);
      const viewerHeight = store.getViewerHeight(1080, 120); // 120px fixed top
      expect(viewerHeight).toBe(1080 - 120 - 140);
    });

    it('LAYOUT-001i: no-op when setting same value', () => {
      const spy = vi.fn();
      store.on('layoutChanged', spy);

      store.setPanelSize('bottom', 120); // same as default
      expect(spy).not.toHaveBeenCalled();

      store.setPanelCollapsed('left', true); // already collapsed
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('LAYOUT-002: Tab groups', () => {
    it('LAYOUT-002a: setActiveTab changes active tab index', () => {
      expect(store.panels.right.activeTab).toBe(0);
      store.setActiveTab('right', 2);
      expect(store.panels.right.activeTab).toBe(2);
    });

    it('LAYOUT-002b: tab state preserved through collapse/expand', () => {
      store.setActiveTab('right', 1);
      store.setPanelCollapsed('right', true);
      store.setPanelCollapsed('right', false);
      expect(store.panels.right.activeTab).toBe(1);
    });

    it('LAYOUT-002c: no-op when setting same tab', () => {
      const spy = vi.fn();
      store.on('layoutChanged', spy);
      store.setActiveTab('left', 0); // already 0
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('LAYOUT-003: Layouts save/load', () => {
    it('LAYOUT-003a: debounces layout save to localStorage', () => {
      vi.useFakeTimers();

      store.setPanelSize('bottom', 200);
      store.setPanelSize('bottom', 210);
      store.setPanelSize('bottom', 220);

      // Should not have saved yet
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();

      vi.advanceTimersByTime(500);

      const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)!);
      expect(saved.panels.bottom.size).toBe(220);

      vi.useRealTimers();
    });

    it('LAYOUT-003b: restores layout from localStorage on init', () => {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
        version: 1,
        panels: {
          left: { size: 280, collapsed: false, activeTab: 0 },
          right: { size: 350, collapsed: true, activeTab: 2 },
          bottom: { size: 160, collapsed: false, activeTab: 0 },
        },
      }));

      const store2 = new LayoutStore();
      expect(store2.panels.left.size).toBe(280);
      expect(store2.panels.left.collapsed).toBe(false);
      expect(store2.panels.right.collapsed).toBe(true);
      expect(store2.panels.right.activeTab).toBe(2);
      expect(store2.panels.bottom.size).toBe(160);
      store2.dispose();
    });

    it('LAYOUT-003c: falls back to defaults on corrupted localStorage', () => {
      localStorage.setItem(LAYOUT_STORAGE_KEY, '{invalid json!!!');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const store2 = new LayoutStore();

      expect(store2.panels.left.collapsed).toBe(DEFAULT_PANEL_STATES.left.collapsed);
      expect(store2.panels.bottom.size).toBe(DEFAULT_PANEL_STATES.bottom.size);
      expect(warnSpy).toHaveBeenCalledWith('Invalid layout data, using defaults');

      store2.dispose();
      warnSpy.mockRestore();
    });

    it('LAYOUT-003d: falls back on missing panels in stored data', () => {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
        version: 1,
        panels: {}, // Missing all panels
      }));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const store2 = new LayoutStore();

      // Should use defaults since validation fails
      expect(store2.panels.bottom.size).toBe(DEFAULT_PANEL_STATES.bottom.size);

      store2.dispose();
      warnSpy.mockRestore();
    });

    it('LAYOUT-003e: flushSave writes immediately', () => {
      store.setPanelSize('bottom', 250);
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();

      store.flushSave();
      const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)!);
      expect(saved.panels.bottom.size).toBe(250);
    });

    it('LAYOUT-003f: schema version is stored', () => {
      store.setPanelSize('bottom', 200);
      store.flushSave();

      const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)!);
      expect(saved.version).toBe(LAYOUT_SCHEMA_VERSION);
    });
  });

  describe('LAYOUT-003 Custom layouts', () => {
    it('LAYOUT-003g: save custom layout', () => {
      store.setPanelSize('bottom', 300);
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 400);
      store.saveCustomLayout('My Layout');

      const names = store.getCustomLayoutNames();
      expect(names).toContain('My Layout');
    });

    it('LAYOUT-003h: load custom layout', () => {
      store.setPanelSize('bottom', 300);
      store.saveCustomLayout('Test Layout');

      // Reset to defaults
      store.reset();
      expect(store.panels.bottom.size).toBe(DEFAULT_PANEL_STATES.bottom.size);

      // Restore custom
      const loaded = store.loadCustomLayout('Test Layout');
      expect(loaded).toBe(true);
      expect(store.panels.bottom.size).toBe(300);
    });

    it('LAYOUT-003i: load nonexistent custom layout returns false', () => {
      expect(store.loadCustomLayout('Nonexistent')).toBe(false);
    });

    it('LAYOUT-003j: delete custom layout', () => {
      store.saveCustomLayout('ToDelete');
      expect(store.getCustomLayoutNames()).toContain('ToDelete');

      store.deleteCustomLayout('ToDelete');
      expect(store.getCustomLayoutNames()).not.toContain('ToDelete');
    });
  });

  describe('LAYOUT-004: Presets switch layout', () => {
    it('LAYOUT-004a: preset definitions exist', () => {
      const presets = store.getPresets();
      expect(presets.length).toBeGreaterThanOrEqual(3);

      const ids = presets.map(p => p.id);
      expect(ids).toContain('review');
      expect(ids).toContain('color');
      expect(ids).toContain('paint');
      expect(ids).toContain('default');
    });

    it('LAYOUT-004b: applyPreset changes panel states', () => {
      store.applyPreset('color');

      expect(store.panels.left.collapsed).toBe(false);
      expect(store.panels.left.size).toBe(260);
      expect(store.panels.right.collapsed).toBe(false);
      expect(store.panels.right.size).toBe(300);
    });

    it('LAYOUT-004c: applyPreset emits presetApplied event', () => {
      const spy = vi.fn();
      store.on('presetApplied', spy);

      store.applyPreset('review');
      expect(spy).toHaveBeenCalledWith('review');
    });

    it('LAYOUT-004d: preset does not overwrite custom saved layout', () => {
      store.setPanelSize('bottom', 300);
      store.saveCustomLayout('My Layout');

      store.applyPreset('review');

      // Custom layout should still be loadable
      const loaded = store.loadCustomLayout('My Layout');
      expect(loaded).toBe(true);
      expect(store.panels.bottom.size).toBe(300);
    });

    it('LAYOUT-004e: unknown preset is no-op', () => {
      const spy = vi.fn();
      store.on('presetApplied', spy);

      store.applyPreset('nonexistent' as any);
      expect(spy).not.toHaveBeenCalled();
    });

    it('LAYOUT-004f: paint preset opens left panel for tool options, collapses right', () => {
      store.applyPreset('paint');
      expect(store.panels.left.collapsed).toBe(false);
      expect(store.panels.left.size).toBe(240);
      expect(store.panels.right.collapsed).toBe(true);
    });

    it('LAYOUT-004g: review preset opens right panel', () => {
      store.applyPreset('review');
      expect(store.panels.right.collapsed).toBe(false);
      expect(store.panels.right.size).toBe(300);
      expect(store.panels.left.collapsed).toBe(true);
    });

    it('LAYOUT-004h: default preset collapses all side panels', () => {
      // Start with color preset (both panels open)
      store.applyPreset('color');
      expect(store.panels.left.collapsed).toBe(false);
      expect(store.panels.right.collapsed).toBe(false);

      // Switch to default
      store.applyPreset('default');
      expect(store.panels.left.collapsed).toBe(true);
      expect(store.panels.right.collapsed).toBe(true);
      expect(store.panels.right.size).toBe(0);
    });

    it('LAYOUT-004i: all four presets have unique panel configurations', () => {
      const presets = store.getPresets();
      const configs = presets.map(p => JSON.stringify(p.data.panels));
      const unique = new Set(configs);
      expect(unique.size).toBe(presets.length);
    });
  });

  describe('LAYOUT-005: Window resize adjusts panels', () => {
    it('LAYOUT-005a: clamps side panels to max ratio on resize', () => {
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 800);

      // Resize to small viewport
      store.handleViewportResize(1000, 800);

      // Max is 50% of 1000 = 500
      expect(store.panels.right.size).toBeLessThanOrEqual(1000 * MAX_SIDE_PANEL_RATIO);
    });

    it('LAYOUT-005b: auto-collapses panels when viewport too small', () => {
      store.setPanelCollapsed('left', false);
      store.setPanelSize('left', 200);
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 200);

      // Very small viewport - not enough room
      store.handleViewportResize(300, 600);

      // Right should collapse first
      expect(store.panels.right.collapsed).toBe(true);
    });

    it('LAYOUT-005c: clamps bottom panel to max ratio', () => {
      store.setPanelSize('bottom', 500);

      store.handleViewportResize(1920, 800);

      expect(store.panels.bottom.size).toBeLessThanOrEqual(800 * MAX_BOTTOM_PANEL_RATIO);
    });

    it('LAYOUT-005d: collapsed panels are not affected by resize', () => {
      store.setPanelCollapsed('right', true);
      const sizeBefore = store.panels.right.size;

      store.handleViewportResize(800, 600);

      expect(store.panels.right.size).toBe(sizeBefore);
      expect(store.panels.right.collapsed).toBe(true);
    });

    it('LAYOUT-005e: viewer dimensions always positive', () => {
      store.setPanelCollapsed('left', false);
      store.setPanelSize('left', 200);
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 200);

      store.handleViewportResize(500, 400);

      expect(store.getViewerWidth(500)).toBeGreaterThan(0);
      expect(store.getViewerHeight(400, 120)).toBeGreaterThan(0);
    });

    it('LAYOUT-005f: no event when resize has no effect', () => {
      // All collapsed, no clamping needed
      const spy = vi.fn();
      store.on('layoutChanged', spy);

      store.handleViewportResize(1920, 1080);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('LAYOUT-006: clampSize enforces max constraints', () => {
    it('LAYOUT-006a: setPanelSize enforces max width for side panels (50% of viewport)', () => {
      // Set viewport dimensions via handleViewportResize
      store.handleViewportResize(1000, 800);

      // Try to set right panel wider than 50% of viewport (500px)
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 800);

      expect(store.panels.right.size).toBeLessThanOrEqual(1000 * MAX_SIDE_PANEL_RATIO);
      expect(store.panels.right.size).toBe(Math.floor(1000 * MAX_SIDE_PANEL_RATIO));
    });

    it('LAYOUT-006b: setPanelSize enforces max height for bottom panel (40% of viewport)', () => {
      store.handleViewportResize(1920, 1000);

      // Try to set bottom panel taller than 40% of viewport (400px)
      store.setPanelSize('bottom', 600);

      expect(store.panels.bottom.size).toBeLessThanOrEqual(1000 * MAX_BOTTOM_PANEL_RATIO);
      expect(store.panels.bottom.size).toBe(Math.floor(1000 * MAX_BOTTOM_PANEL_RATIO));
    });

    it('LAYOUT-006c: setPanelSize still allows sizes within max constraint', () => {
      store.handleViewportResize(1000, 800);

      store.setPanelCollapsed('left', false);
      store.setPanelSize('left', 250); // 25% of viewport, well within 50%

      expect(store.panels.left.size).toBe(250);
    });

    it('LAYOUT-006d: clampSize works without viewport set (no max enforcement)', () => {
      // Without calling handleViewportResize, viewport is 0, so maxWidth/maxHeight = 0
      // The fallback `|| size` should prevent clamping to 0
      store.setPanelSize('right', 500);
      expect(store.panels.right.size).toBe(500);

      store.setPanelSize('bottom', 300);
      expect(store.panels.bottom.size).toBe(300);
    });

    it('LAYOUT-006e: clampSize still enforces minimum after handleViewportResize', () => {
      store.handleViewportResize(1920, 1080);

      store.setPanelSize('right', 10);
      expect(store.panels.right.size).toBe(MIN_SIDE_PANEL_WIDTH);

      store.setPanelSize('bottom', 10);
      expect(store.panels.bottom.size).toBe(MIN_BOTTOM_PANEL_HEIGHT);
    });

    it('LAYOUT-006f: clampSize uses updated viewport after multiple resizes', () => {
      store.handleViewportResize(2000, 1000);
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 1200); // exceeds 50% of 2000 = 1000
      expect(store.panels.right.size).toBe(Math.floor(2000 * MAX_SIDE_PANEL_RATIO));

      // Shrink viewport
      store.handleViewportResize(800, 600);
      store.setPanelSize('right', 500); // exceeds 50% of 800 = 400
      expect(store.panels.right.size).toBeLessThanOrEqual(800 * MAX_SIDE_PANEL_RATIO);
      expect(store.panels.right.size).toBe(Math.floor(800 * MAX_SIDE_PANEL_RATIO));
    });
  });

  describe('LS-H08: Uncollapsing panel clamps size to minimum', () => {
    it('LS-H08a: toggling a collapsed panel with size 0 sets size to at least MIN_SIDE_PANEL_WIDTH', () => {
      // Left panel defaults to size: 0, collapsed: true
      expect(store.panels.left.size).toBe(0);
      expect(store.panels.left.collapsed).toBe(true);

      store.togglePanelCollapsed('left');

      expect(store.panels.left.collapsed).toBe(false);
      expect(store.panels.left.size).toBe(MIN_SIDE_PANEL_WIDTH);
    });

    it('LS-H08b: toggling a collapsed panel with size below minimum clamps to MIN_SIDE_PANEL_WIDTH', () => {
      // Manually set up a panel with size below minimum but collapsed
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 300);
      // Now collapse it and manually set size below minimum to simulate stored state
      store.setPanelCollapsed('right', true);
      // Directly manipulate the internal state to set size below minimum
      (store.panels.right as any).size = 100;

      expect(store.panels.right.size).toBe(100);
      expect(store.panels.right.collapsed).toBe(true);

      store.togglePanelCollapsed('right');

      expect(store.panels.right.collapsed).toBe(false);
      expect(store.panels.right.size).toBe(MIN_SIDE_PANEL_WIDTH);
    });

    it('LS-H08c: toggling a collapsed panel with size above minimum preserves the stored size', () => {
      // Set right panel to a valid size and collapse it
      store.setPanelCollapsed('right', false);
      store.setPanelSize('right', 300);
      store.setPanelCollapsed('right', true);

      expect(store.panels.right.size).toBe(300);
      expect(store.panels.right.collapsed).toBe(true);

      store.togglePanelCollapsed('right');

      expect(store.panels.right.collapsed).toBe(false);
      expect(store.panels.right.size).toBe(300);
    });

    it('LS-H08d2: toggling a collapsed bottom panel with size below MIN_BOTTOM_PANEL_HEIGHT clamps to MIN_BOTTOM_PANEL_HEIGHT', () => {
      // Force bottom panel to collapsed with tiny size
      store.setPanelCollapsed('bottom', true);
      (store.panels.bottom as any).size = 20;

      expect(store.panels.bottom.collapsed).toBe(true);
      expect(store.panels.bottom.size).toBe(20);

      store.togglePanelCollapsed('bottom');

      expect(store.panels.bottom.collapsed).toBe(false);
      expect(store.panels.bottom.size).toBe(MIN_BOTTOM_PANEL_HEIGHT);
    });

    it('LS-H08d: after uncollapsing, getEffectiveSize returns the clamped size', () => {
      // Left panel defaults to size: 0, collapsed: true
      expect(store.getEffectiveSize('left')).toBe(COLLAPSED_RAIL_SIZE);

      store.setPanelCollapsed('left', false);

      // Size should have been clamped to MIN_SIDE_PANEL_WIDTH
      expect(store.getEffectiveSize('left')).toBe(MIN_SIDE_PANEL_WIDTH);
      expect(store.panels.left.size).toBe(MIN_SIDE_PANEL_WIDTH);
    });
  });

  describe('General', () => {
    it('emits layoutChanged on state changes', () => {
      const spy = vi.fn();
      store.on('layoutChanged', spy);

      store.setPanelSize('bottom', 200);
      expect(spy).toHaveBeenCalledTimes(1);

      store.setPanelCollapsed('right', false);
      expect(spy).toHaveBeenCalledTimes(2);

      store.setActiveTab('right', 1);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('reset restores default layout', () => {
      store.setPanelSize('bottom', 500);
      store.setPanelCollapsed('left', false);
      store.setPanelSize('left', 400);

      store.reset();

      expect(store.panels.bottom.size).toBe(DEFAULT_PANEL_STATES.bottom.size);
      expect(store.panels.left.collapsed).toBe(DEFAULT_PANEL_STATES.left.collapsed);
    });

    it('dispose flushes pending save', () => {
      store.setPanelSize('bottom', 333);
      expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();

      store.dispose();

      const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)!);
      expect(saved.panels.bottom.size).toBe(333);
    });
  });
});
