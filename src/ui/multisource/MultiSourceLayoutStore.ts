/**
 * MultiSourceLayoutStore - State management for multi-source layout views.
 *
 * Manages tile list, mode, spacing, columns. Emits events on state changes
 * so UI components can react accordingly. Enforces MAX_TILE_COUNT (16) limit.
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import {
  type MultiSourceLayoutState,
  type MultiSourceLayoutMode,
  type TileState,
  MAX_TILE_COUNT,
  createDefaultTileState,
  createDefaultLayoutState,
} from './MultiSourceLayoutTypes';

export interface MultiSourceLayoutStoreEvents extends EventMap {
  layoutChanged: MultiSourceLayoutState;
  tileAdded: TileState;
  tileRemoved: string;
  modeChanged: MultiSourceLayoutMode;
  activeTileChanged: string | null;
  enabledChanged: boolean;
}

const STORAGE_KEY = 'openrv-multi-source-layout';

export class MultiSourceLayoutStore extends EventEmitter<MultiSourceLayoutStoreEvents> {
  private state: MultiSourceLayoutState;

  constructor() {
    super();
    this.state = createDefaultLayoutState();
  }

  /** Get a snapshot of the current state. */
  getState(): MultiSourceLayoutState {
    return {
      ...this.state,
      tiles: this.state.tiles.map((t) => ({ ...t })),
    };
  }

  /** Whether the layout is enabled. */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /** Get the current layout mode. */
  getMode(): MultiSourceLayoutMode {
    return this.state.mode;
  }

  /** Get the current tile list (shallow copy). */
  getTiles(): TileState[] {
    return this.state.tiles.map((t) => ({ ...t }));
  }

  /** Get a tile by ID. */
  getTile(tileId: string): TileState | undefined {
    const tile = this.state.tiles.find((t) => t.id === tileId);
    return tile ? { ...tile } : undefined;
  }

  /** Get the active tile, or undefined if none. */
  getActiveTile(): TileState | undefined {
    const tile = this.state.tiles.find((t) => t.active);
    return tile ? { ...tile } : undefined;
  }

  /** Get tile count. */
  getTileCount(): number {
    return this.state.tiles.length;
  }

  /** Get spacing. */
  getSpacing(): number {
    return this.state.spacing;
  }

  /** Get columns setting. */
  getColumns(): number {
    return this.state.columns;
  }

  /** Enable the multi-source layout with the given mode. */
  setEnabled(enabled: boolean): void {
    if (this.state.enabled !== enabled) {
      this.state.enabled = enabled;
      this.emit('enabledChanged', enabled);
      this.emitLayoutChanged();
    }
  }

  /** Set the layout mode. */
  setMode(mode: MultiSourceLayoutMode): void {
    if (this.state.mode !== mode) {
      this.state.mode = mode;
      this.emit('modeChanged', mode);
      this.emitLayoutChanged();
    }
  }

  /** Set grid spacing in pixels. */
  setSpacing(spacing: number): void {
    const clamped = Math.max(0, Math.round(spacing));
    if (this.state.spacing !== clamped) {
      this.state.spacing = clamped;
      this.emitLayoutChanged();
    }
  }

  /** Set the number of columns (0 = auto). */
  setColumns(columns: number): void {
    const clamped = Math.max(0, Math.round(columns));
    if (this.state.columns !== clamped) {
      this.state.columns = clamped;
      this.emitLayoutChanged();
    }
  }

  /** Set playback sync mode. */
  setPlaybackSync(mode: 'synchronized' | 'independent'): void {
    if (this.state.playbackSync !== mode) {
      this.state.playbackSync = mode;
      this.emitLayoutChanged();
    }
  }

  /** Set label visibility. */
  setShowLabels(show: boolean): void {
    if (this.state.showLabels !== show) {
      this.state.showLabels = show;
      this.emitLayoutChanged();
    }
  }

  /** Set border visibility. */
  setShowBorders(show: boolean): void {
    if (this.state.showBorders !== show) {
      this.state.showBorders = show;
      this.emitLayoutChanged();
    }
  }

  /**
   * Add a source as a new tile. Returns the tile ID, or null if at max capacity.
   */
  addSource(sourceIndex: number, label?: string): string | null {
    if (this.state.tiles.length >= MAX_TILE_COUNT) {
      console.warn(`MultiSourceLayoutStore: cannot add source, already at maximum tile count (${MAX_TILE_COUNT})`);
      return null;
    }

    const tile = createDefaultTileState(sourceIndex, label);

    // First tile is active by default
    if (this.state.tiles.length === 0) {
      tile.active = true;
    }

    this.state.tiles.push(tile);
    this.emit('tileAdded', { ...tile });
    this.emitLayoutChanged();
    return tile.id;
  }

  /**
   * Remove a tile by ID. Returns true if removed.
   */
  removeTile(tileId: string): boolean {
    const index = this.state.tiles.findIndex((t) => t.id === tileId);
    if (index === -1) return false;

    const wasActive = this.state.tiles[index]!.active;
    this.state.tiles.splice(index, 1);

    // If the removed tile was active, activate the first tile if available
    if (wasActive && this.state.tiles.length > 0) {
      this.state.tiles[0]!.active = true;
      this.emit('activeTileChanged', this.state.tiles[0]!.id);
    } else if (this.state.tiles.length === 0) {
      this.emit('activeTileChanged', null);
    }

    this.emit('tileRemoved', tileId);
    this.emitLayoutChanged();
    return true;
  }

  /** Remove all tiles. */
  clearTiles(): void {
    if (this.state.tiles.length === 0) return;
    const ids = this.state.tiles.map((t) => t.id);
    this.state.tiles = [];
    for (const id of ids) {
      this.emit('tileRemoved', id);
    }
    this.emit('activeTileChanged', null);
    this.emitLayoutChanged();
  }

  /** Set the active tile by ID. */
  setActiveTile(tileId: string | null): void {
    const currentActive = this.state.tiles.find((t) => t.active);
    if (currentActive?.id === tileId) return;

    for (const tile of this.state.tiles) {
      tile.active = tile.id === tileId;
    }

    this.emit('activeTileChanged', tileId);
    this.emitLayoutChanged();
  }

  /** Cycle to the next active tile. Returns the new active tile ID. */
  cycleActiveTile(reverse = false): string | null {
    if (this.state.tiles.length === 0) return null;

    const currentIndex = this.state.tiles.findIndex((t) => t.active);
    let nextIndex: number;

    if (currentIndex === -1) {
      nextIndex = 0;
    } else if (reverse) {
      nextIndex = (currentIndex - 1 + this.state.tiles.length) % this.state.tiles.length;
    } else {
      nextIndex = (currentIndex + 1) % this.state.tiles.length;
    }

    for (const tile of this.state.tiles) {
      tile.active = false;
    }
    this.state.tiles[nextIndex]!.active = true;

    const newId = this.state.tiles[nextIndex]!.id;
    this.emit('activeTileChanged', newId);
    this.emitLayoutChanged();
    return newId;
  }

  /** Update a tile's pan/zoom state. */
  updateTileTransform(tileId: string, update: Partial<Pick<TileState, 'panX' | 'panY' | 'zoom'>>): void {
    const tile = this.state.tiles.find((t) => t.id === tileId);
    if (!tile) return;

    let changed = false;
    if (update.panX !== undefined && tile.panX !== update.panX) {
      tile.panX = update.panX;
      changed = true;
    }
    if (update.panY !== undefined && tile.panY !== update.panY) {
      tile.panY = update.panY;
      changed = true;
    }
    if (update.zoom !== undefined && tile.zoom !== update.zoom) {
      tile.zoom = update.zoom;
      changed = true;
    }

    if (changed) {
      this.emitLayoutChanged();
    }
  }

  /** Update a tile's manual position/size. */
  updateTileManualPosition(
    tileId: string,
    update: Partial<Pick<TileState, 'manualX' | 'manualY' | 'manualWidth' | 'manualHeight'>>,
  ): void {
    const tile = this.state.tiles.find((t) => t.id === tileId);
    if (!tile) return;

    let changed = false;
    if (update.manualX !== undefined && tile.manualX !== update.manualX) {
      tile.manualX = update.manualX;
      changed = true;
    }
    if (update.manualY !== undefined && tile.manualY !== update.manualY) {
      tile.manualY = update.manualY;
      changed = true;
    }
    if (update.manualWidth !== undefined && tile.manualWidth !== update.manualWidth) {
      tile.manualWidth = update.manualWidth;
      changed = true;
    }
    if (update.manualHeight !== undefined && tile.manualHeight !== update.manualHeight) {
      tile.manualHeight = update.manualHeight;
      changed = true;
    }

    if (changed) {
      this.emitLayoutChanged();
    }
  }

  /** Save state to localStorage. */
  saveToStorage(): void {
    try {
      const serializable = {
        mode: this.state.mode,
        spacing: this.state.spacing,
        columns: this.state.columns,
        playbackSync: this.state.playbackSync,
        showLabels: this.state.showLabels,
        showBorders: this.state.showBorders,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // localStorage may be unavailable
    }
  }

  /** Load state from localStorage (only settings, not tiles). */
  loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;

      if (typeof data.mode === 'string') {
        const validModes: MultiSourceLayoutMode[] = ['packed', 'row', 'column', 'manual', 'static'];
        if (validModes.includes(data.mode as MultiSourceLayoutMode)) {
          this.state.mode = data.mode as MultiSourceLayoutMode;
        }
      }
      if (typeof data.spacing === 'number') {
        this.state.spacing = Math.max(0, Math.round(data.spacing));
      }
      if (typeof data.columns === 'number') {
        this.state.columns = Math.max(0, Math.round(data.columns));
      }
      if (typeof data.playbackSync === 'string') {
        if (data.playbackSync === 'synchronized' || data.playbackSync === 'independent') {
          this.state.playbackSync = data.playbackSync;
        }
      }
      if (typeof data.showLabels === 'boolean') {
        this.state.showLabels = data.showLabels;
      }
      if (typeof data.showBorders === 'boolean') {
        this.state.showBorders = data.showBorders;
      }
    } catch {
      // Invalid stored data, ignore
    }
  }

  private emitLayoutChanged(): void {
    this.emit('layoutChanged', this.getState());
  }
}
