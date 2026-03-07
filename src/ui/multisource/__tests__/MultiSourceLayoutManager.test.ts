/**
 * Tests for MultiSourceLayoutManager - orchestration logic for multi-source layout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MultiSourceLayoutManager, packedGrid, manualViewports } from '../MultiSourceLayoutManager';
import { MultiSourceLayoutStore } from '../MultiSourceLayoutStore';
import { MAX_TILE_COUNT, type TileState } from '../MultiSourceLayoutTypes';

describe('MultiSourceLayoutManager', () => {
  let store: MultiSourceLayoutStore;
  let manager: MultiSourceLayoutManager;

  beforeEach(() => {
    store = new MultiSourceLayoutStore();
    manager = new MultiSourceLayoutManager(store);
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('enable/disable', () => {
    it('can enable layout', () => {
      const listener = vi.fn();
      manager.on('enabledChanged', listener);

      manager.enable();
      expect(manager.enabled).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('can enable with specific mode', () => {
      const modeListener = vi.fn();
      manager.on('modeChanged', modeListener);

      manager.enable('row');
      expect(manager.enabled).toBe(true);
      expect(manager.getMode()).toBe('row');
      expect(modeListener).toHaveBeenCalledWith('row');
    });

    it('can disable layout', () => {
      manager.enable();
      const listener = vi.fn();
      manager.on('enabledChanged', listener);

      manager.disable();
      expect(manager.enabled).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('can toggle layout', () => {
      expect(manager.enabled).toBe(false);
      manager.toggle();
      expect(manager.enabled).toBe(true);
      manager.toggle();
      expect(manager.enabled).toBe(false);
    });

    it('deactivates compare mode on enable', () => {
      const deactivateFn = vi.fn();
      manager.setDeactivateCompareCallback(deactivateFn);

      manager.enable();
      expect(deactivateFn).toHaveBeenCalled();
    });

    it('does not crash without compare callback', () => {
      expect(() => manager.enable()).not.toThrow();
    });
  });

  describe('mode', () => {
    it('can set mode', () => {
      manager.setMode('column');
      expect(manager.getMode()).toBe('column');
    });

    it('can cycle mode', () => {
      expect(manager.getMode()).toBe('packed');
      manager.cycleMode();
      expect(manager.getMode()).toBe('row');
      manager.cycleMode();
      expect(manager.getMode()).toBe('column');
      manager.cycleMode();
      expect(manager.getMode()).toBe('manual');
      manager.cycleMode();
      expect(manager.getMode()).toBe('static');
      manager.cycleMode();
      expect(manager.getMode()).toBe('packed'); // wraps
    });
  });

  describe('tile management', () => {
    it('can add a source', () => {
      const listener = vi.fn();
      manager.on('tileAdded', listener);

      const id = manager.addSource(0, 'Source A');
      expect(id).toBeTruthy();
      expect(manager.getTileCount()).toBe(1);
      expect(listener).toHaveBeenCalled();
    });

    it('can remove a source', () => {
      const id = manager.addSource(0)!;
      const listener = vi.fn();
      manager.on('tileRemoved', listener);

      const removed = manager.removeSource(id);
      expect(removed).toBe(true);
      expect(manager.getTileCount()).toBe(0);
      expect(listener).toHaveBeenCalledWith(id);
    });

    it('can get tiles', () => {
      manager.addSource(0, 'A');
      manager.addSource(1, 'B');

      const tiles = manager.getTiles();
      expect(tiles).toHaveLength(2);
      expect(tiles[0]!.label).toBe('A');
      expect(tiles[1]!.label).toBe('B');
    });

    it('enforces max tile count on addSource', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < MAX_TILE_COUNT; i++) {
        manager.addSource(i);
      }

      const id = manager.addSource(999);
      expect(id).toBeNull();
      expect(manager.getTileCount()).toBe(MAX_TILE_COUNT);

      vi.restoreAllMocks();
    });
  });

  describe('tileSelectedSources', () => {
    it('clears existing tiles and adds new ones', () => {
      manager.addSource(0);
      manager.addSource(1);

      manager.tileSelectedSources([5, 6, 7], ['Shot 1', 'Shot 2', 'Shot 3']);
      expect(manager.getTileCount()).toBe(3);
      const tiles = manager.getTiles();
      expect(tiles[0]!.sourceIndex).toBe(5);
      expect(tiles[0]!.label).toBe('Shot 1');
      expect(tiles[2]!.label).toBe('Shot 3');
    });

    it('enables layout if not already active', () => {
      expect(manager.enabled).toBe(false);
      manager.tileSelectedSources([0, 1]);
      expect(manager.enabled).toBe(true);
    });

    it('respects MAX_TILE_COUNT', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const indices = Array.from({ length: 20 }, (_, i) => i);
      manager.tileSelectedSources(indices);
      expect(manager.getTileCount()).toBe(MAX_TILE_COUNT);
      vi.restoreAllMocks();
    });
  });

  describe('active tile', () => {
    it('can set active tile', () => {
      manager.addSource(0);
      const id2 = manager.addSource(1)!;

      const listener = vi.fn();
      manager.on('activeTileChanged', listener);

      manager.setActiveTile(id2);
      expect(listener).toHaveBeenCalledWith(id2);
    });

    it('can cycle active tile', () => {
      manager.addSource(0);
      const id2 = manager.addSource(1)!;

      const nextId = manager.cycleActiveTile();
      expect(nextId).toBe(id2);
    });

    it('can cycle active tile in reverse', () => {
      manager.addSource(0);
      manager.addSource(1);
      const id3 = manager.addSource(2)!;

      const nextId = manager.cycleActiveTile(true);
      expect(nextId).toBe(id3);
    });
  });

  describe('settings', () => {
    it('can set spacing', () => {
      manager.setSpacing(10);
      expect(store.getSpacing()).toBe(10);
    });

    it('can set columns', () => {
      manager.setColumns(3);
      expect(store.getColumns()).toBe(3);
    });
  });

  describe('computeViewports', () => {
    it('returns empty array when no tiles', () => {
      const viewports = manager.computeViewports(1920, 1080);
      expect(viewports).toEqual([]);
    });

    it('computes packed viewports for 4 tiles', () => {
      for (let i = 0; i < 4; i++) manager.addSource(i);
      store.setSpacing(0);

      const viewports = manager.computeViewports(1920, 1080);
      expect(viewports).toHaveLength(4);

      // 4 tiles = 2x2 grid
      // Each tile: 960 x 540
      expect(viewports[0]!.width).toBe(960);
      expect(viewports[0]!.height).toBe(540);
    });

    it('computes row viewports', () => {
      store.setMode('row');
      for (let i = 0; i < 3; i++) manager.addSource(i);
      store.setSpacing(0);

      const viewports = manager.computeViewports(1200, 400);
      expect(viewports).toHaveLength(3);

      // 3 tiles in 1 row: each 400 wide, 400 tall
      expect(viewports[0]!.width).toBe(400);
      expect(viewports[0]!.height).toBe(400);
    });

    it('computes column viewports', () => {
      store.setMode('column');
      for (let i = 0; i < 3; i++) manager.addSource(i);
      store.setSpacing(0);

      const viewports = manager.computeViewports(400, 1200);
      expect(viewports).toHaveLength(3);

      // 3 tiles in 1 column: each 400 wide, 400 tall
      expect(viewports[0]!.width).toBe(400);
      expect(viewports[0]!.height).toBe(400);
    });

    it('computes manual viewports', () => {
      store.setMode('manual');
      const id = manager.addSource(0)!;
      store.updateTileManualPosition(id, {
        manualX: 0.1,
        manualY: 0.2,
        manualWidth: 0.5,
        manualHeight: 0.3,
      });

      const viewports = manager.computeViewports(1000, 1000);
      expect(viewports).toHaveLength(1);

      // x: 0.1 * 1000 = 100
      // y: (1 - 0.2 - 0.3) * 1000 = 500 (WebGL Y-flip)
      // w: 0.5 * 1000 = 500
      // h: 0.3 * 1000 = 300
      expect(viewports[0]!.x).toBe(100);
      expect(viewports[0]!.y).toBe(500);
      expect(viewports[0]!.width).toBe(500);
      expect(viewports[0]!.height).toBe(300);
    });

    it('static mode uses same viewports as manual', () => {
      store.setMode('static');
      const id = manager.addSource(0)!;
      store.updateTileManualPosition(id, {
        manualX: 0,
        manualY: 0,
        manualWidth: 1,
        manualHeight: 1,
      });

      const viewports = manager.computeViewports(800, 600);
      expect(viewports).toHaveLength(1);
      expect(viewports[0]!.x).toBe(0);
      expect(viewports[0]!.width).toBe(800);
      expect(viewports[0]!.height).toBe(600);
    });

    it('packed mode with forced columns', () => {
      store.setColumns(3);
      for (let i = 0; i < 6; i++) manager.addSource(i);
      store.setSpacing(0);

      const viewports = manager.computeViewports(900, 600);
      expect(viewports).toHaveLength(6);

      // 3 columns, 2 rows: each 300 x 300
      expect(viewports[0]!.width).toBe(300);
      expect(viewports[0]!.height).toBe(300);
    });

    it('accounts for spacing', () => {
      for (let i = 0; i < 4; i++) manager.addSource(i);
      store.setSpacing(10);

      const viewports = manager.computeViewports(1920, 1080);
      // 2x2 grid with 10px spacing
      // Available width: 1920 - 10 = 1910, each tile: 955
      expect(viewports[0]!.width).toBe(955);
    });
  });

  describe('hitTestViewports', () => {
    it('returns tile ID when point is inside a tile', () => {
      const id = manager.addSource(0)!;
      const tiles = manager.getTiles();
      const viewports = [{ x: 0, y: 0, width: 100, height: 100 }];

      // Point at (50, 50) CSS -> WebGL Y = 200 - 50 = 150... out of range
      // Let's set canvas height to 100: glY = 100 - 50 = 50
      const result = manager.hitTestViewports(50, 50, 100, viewports, tiles);
      expect(result).toBe(id);
    });

    it('returns null when point is outside all tiles', () => {
      manager.addSource(0);
      const tiles = manager.getTiles();
      const viewports = [{ x: 0, y: 0, width: 100, height: 100 }];

      // Point at (200, 50) is outside the viewport
      const result = manager.hitTestViewports(200, 50, 100, viewports, tiles);
      expect(result).toBeNull();
    });

    it('returns topmost tile when tiles overlap (reverse order)', () => {
      manager.addSource(0);
      const id2 = manager.addSource(1)!;
      const tiles = manager.getTiles();

      // Overlapping viewports
      const viewports = [
        { x: 0, y: 0, width: 200, height: 200 },
        { x: 50, y: 50, width: 200, height: 200 },
      ];

      // Point at (100, 100) CSS -> glY = 300 - 100 = 200
      // Tile 2: x:[50-250], y:[50-250] -> (100, 200) is inside
      const result = manager.hitTestViewports(100, 100, 300, viewports, tiles);
      expect(result).toBe(id2);
    });
  });

  describe('state forwarding', () => {
    it('forwards layoutChanged events from store', () => {
      const listener = vi.fn();
      manager.on('layoutChanged', listener);

      manager.addSource(0);
      expect(listener).toHaveBeenCalled();
    });

    it('forwards modeChanged events from store', () => {
      const listener = vi.fn();
      manager.on('modeChanged', listener);

      manager.setMode('column');
      expect(listener).toHaveBeenCalledWith('column');
    });

    it('getState returns complete state', () => {
      manager.addSource(0);
      manager.enable('row');

      const state = manager.getState();
      expect(state.enabled).toBe(true);
      expect(state.mode).toBe('row');
      expect(state.tiles).toHaveLength(1);
    });
  });

  describe('dispose', () => {
    it('cleans up event listeners', () => {
      const listener = vi.fn();
      manager.on('layoutChanged', listener);

      manager.dispose();

      // After dispose, store events should no longer be forwarded
      store.addSource(0);
      expect(listener).not.toHaveBeenCalled();
    });

    it('clears compare callback', () => {
      const cb = vi.fn();
      manager.setDeactivateCompareCallback(cb);

      manager.dispose();

      // The reference should be cleared
      // (we can't directly test this, but no errors on subsequent operations)
      expect(() => manager.enable()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });
  });
});

describe('packedGrid', () => {
  it('returns 1x1 for 1 tile', () => {
    expect(packedGrid(1)).toEqual({ columns: 1, rows: 1 });
  });

  it('returns 2x1 for 2 tiles', () => {
    expect(packedGrid(2)).toEqual({ columns: 2, rows: 1 });
  });

  it('returns 2x1 for 3 tiles', () => {
    // ceil(sqrt(3)) = 2 cols, ceil(3/2) = 2 rows
    expect(packedGrid(3)).toEqual({ columns: 2, rows: 2 });
  });

  it('returns 2x2 for 4 tiles', () => {
    expect(packedGrid(4)).toEqual({ columns: 2, rows: 2 });
  });

  it('returns 3x2 for 5 tiles', () => {
    expect(packedGrid(5)).toEqual({ columns: 3, rows: 2 });
  });

  it('returns 3x2 for 6 tiles', () => {
    expect(packedGrid(6)).toEqual({ columns: 3, rows: 2 });
  });

  it('returns 3x3 for 9 tiles', () => {
    expect(packedGrid(9)).toEqual({ columns: 3, rows: 3 });
  });

  it('returns 4x4 for 16 tiles', () => {
    expect(packedGrid(16)).toEqual({ columns: 4, rows: 4 });
  });

  it('uses forced columns when specified', () => {
    expect(packedGrid(6, 2)).toEqual({ columns: 2, rows: 3 });
    expect(packedGrid(6, 3)).toEqual({ columns: 3, rows: 2 });
    expect(packedGrid(6, 6)).toEqual({ columns: 6, rows: 1 });
  });

  it('handles 0 tiles', () => {
    expect(packedGrid(0)).toEqual({ columns: 1, rows: 1 });
  });
});

describe('manualViewports', () => {
  it('converts normalized coordinates to pixel viewports', () => {
    const tiles: TileState[] = [
      {
        id: 't1',
        sourceIndex: 0,
        label: 'A',
        panX: 0, panY: 0, zoom: 1,
        manualX: 0, manualY: 0,
        manualWidth: 0.5, manualHeight: 0.5,
        active: false,
      },
    ];

    const viewports = manualViewports(tiles, 1000, 800);
    expect(viewports).toHaveLength(1);

    // x = 0 * 1000 = 0
    // y = (1 - 0 - 0.5) * 800 = 400 (WebGL Y-flip)
    // w = 0.5 * 1000 = 500
    // h = 0.5 * 800 = 400
    expect(viewports[0]).toEqual({ x: 0, y: 400, width: 500, height: 400 });
  });

  it('handles full-canvas tile', () => {
    const tiles: TileState[] = [
      {
        id: 't1',
        sourceIndex: 0,
        label: 'A',
        panX: 0, panY: 0, zoom: 1,
        manualX: 0, manualY: 0,
        manualWidth: 1, manualHeight: 1,
        active: false,
      },
    ];

    const viewports = manualViewports(tiles, 800, 600);
    expect(viewports[0]).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('handles multiple tiles', () => {
    const tiles: TileState[] = [
      {
        id: 't1', sourceIndex: 0, label: 'A',
        panX: 0, panY: 0, zoom: 1,
        manualX: 0, manualY: 0, manualWidth: 0.5, manualHeight: 1,
        active: false,
      },
      {
        id: 't2', sourceIndex: 1, label: 'B',
        panX: 0, panY: 0, zoom: 1,
        manualX: 0.5, manualY: 0, manualWidth: 0.5, manualHeight: 1,
        active: false,
      },
    ];

    const viewports = manualViewports(tiles, 1000, 500);
    expect(viewports).toHaveLength(2);
    expect(viewports[0]).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    expect(viewports[1]).toEqual({ x: 500, y: 0, width: 500, height: 500 });
  });
});
