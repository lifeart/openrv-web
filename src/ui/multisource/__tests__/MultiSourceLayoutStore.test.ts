/**
 * Tests for MultiSourceLayoutStore - state management for multi-source layout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiSourceLayoutStore } from '../MultiSourceLayoutStore';
import { MAX_TILE_COUNT } from '../MultiSourceLayoutTypes';

describe('MultiSourceLayoutStore', () => {
  let store: MultiSourceLayoutStore;

  beforeEach(() => {
    store = new MultiSourceLayoutStore();
  });

  describe('initial state', () => {
    it('starts disabled', () => {
      expect(store.isEnabled()).toBe(false);
    });

    it('starts with packed mode', () => {
      expect(store.getMode()).toBe('packed');
    });

    it('starts with no tiles', () => {
      expect(store.getTiles()).toEqual([]);
      expect(store.getTileCount()).toBe(0);
    });

    it('starts with default spacing of 4', () => {
      expect(store.getSpacing()).toBe(4);
    });

    it('starts with auto columns (0)', () => {
      expect(store.getColumns()).toBe(0);
    });

    it('returns complete state snapshot', () => {
      const state = store.getState();
      expect(state.mode).toBe('packed');
      expect(state.enabled).toBe(false);
      expect(state.tiles).toEqual([]);
      expect(state.spacing).toBe(4);
      expect(state.columns).toBe(0);
      expect(state.playbackSync).toBe('synchronized');
      expect(state.showLabels).toBe(true);
      expect(state.showBorders).toBe(true);
    });
  });

  describe('enable/disable', () => {
    it('can enable layout', () => {
      const listener = vi.fn();
      store.on('enabledChanged', listener);

      store.setEnabled(true);
      expect(store.isEnabled()).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('can disable layout', () => {
      store.setEnabled(true);
      const listener = vi.fn();
      store.on('enabledChanged', listener);

      store.setEnabled(false);
      expect(store.isEnabled()).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('does not emit when setting same value', () => {
      const listener = vi.fn();
      store.on('enabledChanged', listener);

      store.setEnabled(false); // already false
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('mode', () => {
    it('can change mode', () => {
      const listener = vi.fn();
      store.on('modeChanged', listener);

      store.setMode('row');
      expect(store.getMode()).toBe('row');
      expect(listener).toHaveBeenCalledWith('row');
    });

    it('supports all layout modes', () => {
      const modes = ['packed', 'row', 'column', 'manual', 'static'] as const;
      for (const mode of modes) {
        store.setMode(mode);
        expect(store.getMode()).toBe(mode);
      }
    });

    it('does not emit when setting same mode', () => {
      store.setMode('packed'); // already packed
      const listener = vi.fn();
      store.on('modeChanged', listener);

      store.setMode('packed');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('tiles', () => {
    it('can add a source tile', () => {
      const tileListener = vi.fn();
      const layoutListener = vi.fn();
      store.on('tileAdded', tileListener);
      store.on('layoutChanged', layoutListener);

      const id = store.addSource(0, 'Source A');
      expect(id).toBeTruthy();
      expect(store.getTileCount()).toBe(1);

      const tile = tileListener.mock.calls[0]![0];
      expect(tile.sourceIndex).toBe(0);
      expect(tile.label).toBe('Source A');
      expect(tile.active).toBe(true); // First tile is active
      expect(layoutListener).toHaveBeenCalled();
    });

    it('first tile is active by default', () => {
      store.addSource(0);
      const tiles = store.getTiles();
      expect(tiles[0]!.active).toBe(true);
    });

    it('second tile is not active by default', () => {
      store.addSource(0);
      store.addSource(1);
      const tiles = store.getTiles();
      expect(tiles[0]!.active).toBe(true);
      expect(tiles[1]!.active).toBe(false);
    });

    it('generates default label if none provided', () => {
      store.addSource(2);
      const tiles = store.getTiles();
      expect(tiles[0]!.label).toBe('Source 3');
    });

    it('can remove a tile', () => {
      const id = store.addSource(0)!;
      const listener = vi.fn();
      store.on('tileRemoved', listener);

      const removed = store.removeTile(id);
      expect(removed).toBe(true);
      expect(store.getTileCount()).toBe(0);
      expect(listener).toHaveBeenCalledWith(id);
    });

    it('returns false when removing non-existent tile', () => {
      const removed = store.removeTile('non-existent');
      expect(removed).toBe(false);
    });

    it('activates first tile when active tile is removed', () => {
      store.addSource(0);
      const id2 = store.addSource(1)!;
      store.setActiveTile(id2);

      const listener = vi.fn();
      store.on('activeTileChanged', listener);

      store.removeTile(id2);
      const tiles = store.getTiles();
      expect(tiles[0]!.active).toBe(true);
      expect(listener).toHaveBeenCalledWith(tiles[0]!.id);
    });

    it('emits null activeTile when last tile is removed', () => {
      const id = store.addSource(0)!;
      const listener = vi.fn();
      store.on('activeTileChanged', listener);

      store.removeTile(id);
      expect(listener).toHaveBeenCalledWith(null);
    });

    it('enforces MAX_TILE_COUNT limit', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < MAX_TILE_COUNT; i++) {
        const id = store.addSource(i);
        expect(id).toBeTruthy();
      }
      expect(store.getTileCount()).toBe(MAX_TILE_COUNT);

      const extraId = store.addSource(MAX_TILE_COUNT);
      expect(extraId).toBeNull();
      expect(store.getTileCount()).toBe(MAX_TILE_COUNT);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('can clear all tiles', () => {
      store.addSource(0);
      store.addSource(1);
      store.addSource(2);

      const removedListener = vi.fn();
      const activeListener = vi.fn();
      store.on('tileRemoved', removedListener);
      store.on('activeTileChanged', activeListener);

      store.clearTiles();
      expect(store.getTileCount()).toBe(0);
      expect(removedListener).toHaveBeenCalledTimes(3);
      expect(activeListener).toHaveBeenCalledWith(null);
    });

    it('clearTiles is a no-op when empty', () => {
      const listener = vi.fn();
      store.on('layoutChanged', listener);

      store.clearTiles();
      expect(listener).not.toHaveBeenCalled();
    });

    it('can get tile by ID', () => {
      const id = store.addSource(5, 'Test Tile')!;
      const tile = store.getTile(id);
      expect(tile).toBeDefined();
      expect(tile!.sourceIndex).toBe(5);
      expect(tile!.label).toBe('Test Tile');
    });

    it('returns undefined for non-existent tile', () => {
      expect(store.getTile('nope')).toBeUndefined();
    });
  });

  describe('active tile', () => {
    it('can set active tile', () => {
      store.addSource(0);
      const id2 = store.addSource(1)!;

      const listener = vi.fn();
      store.on('activeTileChanged', listener);

      store.setActiveTile(id2);
      const tiles = store.getTiles();
      expect(tiles[0]!.active).toBe(false);
      expect(tiles[1]!.active).toBe(true);
      expect(listener).toHaveBeenCalledWith(id2);
    });

    it('does not emit when setting same active tile', () => {
      const id = store.addSource(0)!;
      // id is already active since it's the first tile

      const listener = vi.fn();
      store.on('activeTileChanged', listener);

      store.setActiveTile(id);
      expect(listener).not.toHaveBeenCalled();
    });

    it('can get active tile', () => {
      store.addSource(0);
      const activeTile = store.getActiveTile();
      expect(activeTile).toBeDefined();
      expect(activeTile!.active).toBe(true);
    });

    it('returns undefined when no active tile', () => {
      expect(store.getActiveTile()).toBeUndefined();
    });

    it('can cycle active tile forward', () => {
      store.addSource(0);
      const id2 = store.addSource(1)!;
      store.addSource(2);

      const nextId = store.cycleActiveTile();
      expect(nextId).toBe(id2);
      expect(store.getActiveTile()!.id).toBe(id2);
    });

    it('can cycle active tile backward', () => {
      store.addSource(0);
      store.addSource(1);
      const id3 = store.addSource(2)!;

      const nextId = store.cycleActiveTile(true);
      expect(nextId).toBe(id3);
    });

    it('wraps around when cycling forward', () => {
      const id1 = store.addSource(0)!;
      store.addSource(1);
      const id3 = store.addSource(2)!;

      store.setActiveTile(id3);
      const nextId = store.cycleActiveTile();
      expect(nextId).toBe(id1);
    });

    it('wraps around when cycling backward', () => {
      store.addSource(0);
      store.addSource(1);
      const id3 = store.addSource(2)!;

      // first tile is active (first tile added)
      const nextId = store.cycleActiveTile(true);
      expect(nextId).toBe(id3);
    });

    it('returns null when cycling with no tiles', () => {
      expect(store.cycleActiveTile()).toBeNull();
    });
  });

  describe('tile transforms', () => {
    it('can update tile pan and zoom', () => {
      const id = store.addSource(0)!;
      const listener = vi.fn();
      store.on('layoutChanged', listener);

      store.updateTileTransform(id, { panX: 10, panY: 20, zoom: 2.0 });

      const tile = store.getTile(id)!;
      expect(tile.panX).toBe(10);
      expect(tile.panY).toBe(20);
      expect(tile.zoom).toBe(2.0);
      expect(listener).toHaveBeenCalled();
    });

    it('partial update only changes specified fields', () => {
      const id = store.addSource(0)!;
      store.updateTileTransform(id, { panX: 10 });

      const tile = store.getTile(id)!;
      expect(tile.panX).toBe(10);
      expect(tile.panY).toBe(0);
      expect(tile.zoom).toBe(1.0);
    });

    it('does not emit when values are unchanged', () => {
      const id = store.addSource(0)!;
      const listener = vi.fn();
      store.on('layoutChanged', listener);
      listener.mockClear();

      store.updateTileTransform(id, { panX: 0, panY: 0, zoom: 1.0 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores updates for non-existent tiles', () => {
      const listener = vi.fn();
      store.on('layoutChanged', listener);

      store.updateTileTransform('nope', { panX: 10 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('tile manual position', () => {
    it('can update manual position', () => {
      const id = store.addSource(0)!;

      store.updateTileManualPosition(id, {
        manualX: 0.1,
        manualY: 0.2,
        manualWidth: 0.3,
        manualHeight: 0.4,
      });

      const tile = store.getTile(id)!;
      expect(tile.manualX).toBe(0.1);
      expect(tile.manualY).toBe(0.2);
      expect(tile.manualWidth).toBe(0.3);
      expect(tile.manualHeight).toBe(0.4);
    });

    it('does not emit when values are unchanged', () => {
      const id = store.addSource(0)!;
      const listener = vi.fn();
      store.on('layoutChanged', listener);
      listener.mockClear();

      // Default manual position values
      store.updateTileManualPosition(id, { manualX: 0, manualY: 0 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('settings', () => {
    it('can set spacing', () => {
      const listener = vi.fn();
      store.on('layoutChanged', listener);

      store.setSpacing(8);
      expect(store.getSpacing()).toBe(8);
      expect(listener).toHaveBeenCalled();
    });

    it('clamps spacing to non-negative', () => {
      store.setSpacing(-5);
      expect(store.getSpacing()).toBe(0);
    });

    it('rounds spacing to integer', () => {
      store.setSpacing(3.7);
      expect(store.getSpacing()).toBe(4);
    });

    it('does not emit when spacing is unchanged', () => {
      store.setSpacing(4); // default is 4
      const listener = vi.fn();
      store.on('layoutChanged', listener);

      store.setSpacing(4);
      expect(listener).not.toHaveBeenCalled();
    });

    it('can set columns', () => {
      store.setColumns(3);
      expect(store.getColumns()).toBe(3);
    });

    it('clamps columns to non-negative', () => {
      store.setColumns(-1);
      expect(store.getColumns()).toBe(0);
    });

    it('can set playback sync mode', () => {
      const listener = vi.fn();
      store.on('layoutChanged', listener);

      store.setPlaybackSync('independent');
      expect(store.getState().playbackSync).toBe('independent');
      expect(listener).toHaveBeenCalled();
    });

    it('can toggle labels', () => {
      store.setShowLabels(false);
      expect(store.getState().showLabels).toBe(false);

      store.setShowLabels(true);
      expect(store.getState().showLabels).toBe(true);
    });

    it('can toggle borders', () => {
      store.setShowBorders(false);
      expect(store.getState().showBorders).toBe(false);
    });
  });

  describe('persistence', () => {
    it('saves settings to localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

      store.setMode('row');
      store.setSpacing(10);
      store.saveToStorage();

      expect(setItemSpy).toHaveBeenCalledWith('openrv-multi-source-layout', expect.stringContaining('"mode":"row"'));
      expect(setItemSpy).toHaveBeenCalledWith('openrv-multi-source-layout', expect.stringContaining('"spacing":10'));

      setItemSpy.mockRestore();
    });

    it('loads settings from localStorage', () => {
      const data = JSON.stringify({
        mode: 'column',
        spacing: 12,
        columns: 3,
        showLabels: false,
        showBorders: false,
        playbackSync: 'independent',
      });
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(data);

      store.loadFromStorage();
      expect(store.getMode()).toBe('column');
      expect(store.getSpacing()).toBe(12);
      expect(store.getColumns()).toBe(3);
      expect(store.getState().showLabels).toBe(false);
      expect(store.getState().showBorders).toBe(false);
      expect(store.getState().playbackSync).toBe('independent');

      vi.restoreAllMocks();
    });

    it('handles missing localStorage gracefully', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

      expect(() => store.loadFromStorage()).not.toThrow();
      // Defaults unchanged
      expect(store.getMode()).toBe('packed');

      vi.restoreAllMocks();
    });

    it('handles invalid localStorage data gracefully', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('not valid json');

      expect(() => store.loadFromStorage()).not.toThrow();
      expect(store.getMode()).toBe('packed');

      vi.restoreAllMocks();
    });

    it('ignores invalid mode in stored data', () => {
      const data = JSON.stringify({ mode: 'invalid_mode' });
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(data);

      store.loadFromStorage();
      expect(store.getMode()).toBe('packed');

      vi.restoreAllMocks();
    });

    it('restores persisted state on construction', () => {
      const data = JSON.stringify({
        mode: 'row',
        spacing: 8,
        columns: 2,
        showLabels: false,
        showBorders: false,
        playbackSync: 'independent',
      });
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(data);

      const freshStore = new MultiSourceLayoutStore();
      expect(freshStore.getMode()).toBe('row');
      expect(freshStore.getSpacing()).toBe(8);
      expect(freshStore.getColumns()).toBe(2);
      expect(freshStore.getState().showLabels).toBe(false);
      expect(freshStore.getState().showBorders).toBe(false);
      expect(freshStore.getState().playbackSync).toBe('independent');

      vi.restoreAllMocks();
    });

    it('auto-saves when layout state changes (debounced)', () => {
      vi.useFakeTimers();
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

      store.setMode('column');
      // Should not have saved yet (debounced)
      expect(setItemSpy).not.toHaveBeenCalled();

      // Advance past debounce timer
      vi.advanceTimersByTime(350);
      expect(setItemSpy).toHaveBeenCalledWith(
        'openrv-multi-source-layout',
        expect.stringContaining('"mode":"column"'),
      );

      setItemSpy.mockRestore();
      vi.useRealTimers();
    });

    it('debounces multiple rapid changes into a single save', () => {
      vi.useFakeTimers();
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

      store.setMode('row');
      store.setSpacing(10);
      store.setColumns(3);
      store.setShowLabels(false);

      // Still debouncing, no save yet
      expect(setItemSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(350);
      // Only one save call
      expect(setItemSpy).toHaveBeenCalledTimes(1);
      const saved = JSON.parse(setItemSpy.mock.calls[0]![1] as string);
      expect(saved.mode).toBe('row');
      expect(saved.spacing).toBe(10);
      expect(saved.columns).toBe(3);
      expect(saved.showLabels).toBe(false);

      setItemSpy.mockRestore();
      vi.useRealTimers();
    });

    it('does not save when nothing changed', () => {
      vi.useFakeTimers();
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

      // Set same values as defaults
      store.setMode('packed');
      store.setSpacing(4);
      store.setEnabled(false);

      vi.advanceTimersByTime(350);
      // No state actually changed, so emitLayoutChanged was never called
      expect(setItemSpy).not.toHaveBeenCalled();

      setItemSpy.mockRestore();
      vi.useRealTimers();
    });

    it('flushSave writes immediately', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

      store.setMode('manual');
      store.flushSave();

      expect(setItemSpy).toHaveBeenCalledWith(
        'openrv-multi-source-layout',
        expect.stringContaining('"mode":"manual"'),
      );

      setItemSpy.mockRestore();
    });

    it('flushSave is a no-op when no save is pending', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

      store.flushSave();
      expect(setItemSpy).not.toHaveBeenCalled();

      setItemSpy.mockRestore();
    });
  });

  describe('state snapshot immutability', () => {
    it('getState returns a copy', () => {
      store.addSource(0);
      const state1 = store.getState();
      const state2 = store.getState();
      expect(state1).not.toBe(state2);
      expect(state1.tiles).not.toBe(state2.tiles);
    });

    it('getTiles returns a copy', () => {
      store.addSource(0);
      const tiles1 = store.getTiles();
      const tiles2 = store.getTiles();
      expect(tiles1).not.toBe(tiles2);
    });

    it('getTile returns a copy', () => {
      const id = store.addSource(0)!;
      const tile1 = store.getTile(id);
      const tile2 = store.getTile(id);
      expect(tile1).not.toBe(tile2);
    });
  });
});
