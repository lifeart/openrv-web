/**
 * MultiSourceLayoutManager - Orchestration logic for multi-source layout views.
 *
 * Manages mode switching, viewport computation, hit testing, and tile CRUD.
 * Coordinates with MultiSourceLayoutStore for state and ComparisonManager
 * for mutual exclusion between layout and compare modes.
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { MultiSourceLayoutStore } from './MultiSourceLayoutStore';
import {
  type MultiSourceLayoutMode,
  type MultiSourceLayoutState,
  type TileState,
  MAX_TILE_COUNT,
} from './MultiSourceLayoutTypes';
import { computeTileViewports, type TileViewport } from '../../nodes/groups/LayoutGroupNode';

export interface MultiSourceLayoutManagerEvents extends EventMap {
  layoutChanged: MultiSourceLayoutState;
  modeChanged: MultiSourceLayoutMode;
  enabledChanged: boolean;
  activeTileChanged: string | null;
  tileAdded: TileState;
  tileRemoved: string;
}

/**
 * Callback type for deactivating compare mode when layout is activated.
 * This avoids a direct dependency on ComparisonManager.
 */
export type DeactivateCompareCallback = () => void;

export class MultiSourceLayoutManager extends EventEmitter<MultiSourceLayoutManagerEvents> {
  private store: MultiSourceLayoutStore;
  private deactivateCompare: DeactivateCompareCallback | null = null;
  private storeUnsubscribers: (() => void)[] = [];

  constructor(store?: MultiSourceLayoutStore) {
    super();
    this.store = store ?? new MultiSourceLayoutStore();
    this.wireStoreEvents();
  }

  /** Set the callback that deactivates compare mode. */
  setDeactivateCompareCallback(cb: DeactivateCompareCallback): void {
    this.deactivateCompare = cb;
  }

  /** Get the underlying store. */
  getStore(): MultiSourceLayoutStore {
    return this.store;
  }

  /** Get a snapshot of the full layout state. */
  getState(): MultiSourceLayoutState {
    return this.store.getState();
  }

  /** Whether multi-source layout is enabled. */
  get enabled(): boolean {
    return this.store.isEnabled();
  }

  /** Get the current mode. */
  getMode(): MultiSourceLayoutMode {
    return this.store.getMode();
  }

  /**
   * Enable multi-source layout with the given mode.
   * Deactivates any active Compare mode via the registered callback.
   */
  enable(mode?: MultiSourceLayoutMode): void {
    if (mode) {
      this.store.setMode(mode);
    }

    // Deactivate compare mode (mutual exclusion)
    if (this.deactivateCompare) {
      this.deactivateCompare();
    }

    this.store.setEnabled(true);
  }

  /** Disable multi-source layout. */
  disable(): void {
    this.store.setEnabled(false);
  }

  /** Toggle layout on/off. */
  toggle(): void {
    if (this.store.isEnabled()) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /** Set the layout mode. */
  setMode(mode: MultiSourceLayoutMode): void {
    this.store.setMode(mode);
  }

  /** Cycle through layout modes. */
  cycleMode(): void {
    const modes: MultiSourceLayoutMode[] = ['packed', 'row', 'column', 'manual', 'static'];
    const currentIndex = modes.indexOf(this.store.getMode());
    const nextMode = modes[(currentIndex + 1) % modes.length]!;
    this.store.setMode(nextMode);
  }

  /**
   * Add a source as a new tile. Returns the tile ID, or null if at capacity.
   */
  addSource(sourceIndex: number, label?: string): string | null {
    return this.store.addSource(sourceIndex, label);
  }

  /** Remove a tile by ID. */
  removeSource(tileId: string): boolean {
    return this.store.removeTile(tileId);
  }

  /**
   * Bulk-add sources, enabling layout mode if not already active.
   */
  tileSelectedSources(sourceIndices: number[], labels?: string[]): void {
    // Clear existing tiles
    this.store.clearTiles();

    // Add each source (up to MAX_TILE_COUNT)
    const count = Math.min(sourceIndices.length, MAX_TILE_COUNT);
    for (let i = 0; i < count; i++) {
      this.store.addSource(sourceIndices[i]!, labels?.[i]);
    }

    // Enable layout if not already
    if (!this.store.isEnabled()) {
      this.enable();
    }
  }

  /** Set the active tile. */
  setActiveTile(tileId: string | null): void {
    this.store.setActiveTile(tileId);
  }

  /** Cycle to the next active tile. */
  cycleActiveTile(reverse = false): string | null {
    return this.store.cycleActiveTile(reverse);
  }

  /** Set spacing. */
  setSpacing(spacing: number): void {
    this.store.setSpacing(spacing);
  }

  /** Set columns. */
  setColumns(columns: number): void {
    this.store.setColumns(columns);
  }

  /** Get the tile list. */
  getTiles(): TileState[] {
    return this.store.getTiles();
  }

  /** Get tile count. */
  getTileCount(): number {
    return this.store.getTileCount();
  }

  /**
   * Compute tile viewports for the current layout mode.
   *
   * @param canvasWidth - Canvas width in physical pixels
   * @param canvasHeight - Canvas height in physical pixels
   * @returns Array of TileViewport regions, one per tile
   */
  computeViewports(canvasWidth: number, canvasHeight: number): TileViewport[] {
    const state = this.store.getState();
    const tileCount = state.tiles.length;

    if (tileCount === 0) return [];

    switch (state.mode) {
      case 'packed': {
        const { columns, rows } = packedGrid(tileCount, state.columns);
        return computeTileViewports(canvasWidth, canvasHeight, columns, rows, state.spacing);
      }
      case 'row':
        return computeTileViewports(canvasWidth, canvasHeight, tileCount, 1, state.spacing);
      case 'column':
        return computeTileViewports(canvasWidth, canvasHeight, 1, tileCount, state.spacing);
      case 'manual':
      case 'static':
        return manualViewports(state.tiles, canvasWidth, canvasHeight);
    }
  }

  /**
   * Hit test: determine which tile contains the given point.
   *
   * @param canvasX - X coordinate in physical pixels
   * @param canvasY - Y coordinate in physical pixels (top-down CSS convention)
   * @param canvasHeight - Total canvas height in physical pixels (for Y-flip)
   * @returns The tile ID under the point, or null if none
   */
  hitTest(canvasX: number, canvasY: number, canvasHeight: number): string | null {
    const state = this.store.getState();
    if (!state.enabled || state.tiles.length === 0) return null;

    const viewports = this.computeViewports(
      // We need actual canvas dimensions, but for hit testing we can use
      // the viewports computed with those dimensions
      canvasHeight, // placeholder - caller should provide actual width
      canvasHeight,
    );

    // For proper hit testing, we need the actual viewport data.
    // The caller should use computeViewports() with real dimensions,
    // then call hitTestViewports().
    return this.hitTestViewports(canvasX, canvasY, canvasHeight, viewports, state.tiles);
  }

  /**
   * Hit test against precomputed viewports (preferred method).
   *
   * @param canvasX - X coordinate in physical pixels
   * @param canvasY - Y coordinate in physical pixels (CSS top-down convention)
   * @param canvasHeight - Canvas height for Y-flip to WebGL coordinates
   * @param viewports - Precomputed viewport regions (WebGL coordinates)
   * @param tiles - Current tile list
   * @returns The tile ID under the point, or null
   */
  hitTestViewports(
    canvasX: number,
    canvasY: number,
    canvasHeight: number,
    viewports: TileViewport[],
    tiles: TileState[],
  ): string | null {
    // Convert from CSS top-down Y to WebGL bottom-up Y
    const glY = canvasHeight - canvasY;

    // Test tiles in reverse order (last tile = top of z-order in manual mode)
    for (let i = Math.min(viewports.length, tiles.length) - 1; i >= 0; i--) {
      const vp = viewports[i]!;
      if (
        canvasX >= vp.x &&
        canvasX <= vp.x + vp.width &&
        glY >= vp.y &&
        glY <= vp.y + vp.height
      ) {
        return tiles[i]!.id;
      }
    }
    return null;
  }

  /** Dispose the manager and clean up. */
  dispose(): void {
    for (const unsub of this.storeUnsubscribers) {
      unsub();
    }
    this.storeUnsubscribers = [];
    this.deactivateCompare = null;
    this.removeAllListeners();
  }

  private wireStoreEvents(): void {
    this.storeUnsubscribers.push(
      this.store.on('layoutChanged', (state) => this.emit('layoutChanged', state)),
      this.store.on('modeChanged', (mode) => this.emit('modeChanged', mode)),
      this.store.on('enabledChanged', (enabled) => this.emit('enabledChanged', enabled)),
      this.store.on('activeTileChanged', (id) => this.emit('activeTileChanged', id)),
      this.store.on('tileAdded', (tile) => this.emit('tileAdded', tile)),
      this.store.on('tileRemoved', (id) => this.emit('tileRemoved', id)),
    );
  }
}

/**
 * Compute grid dimensions for packed (auto-grid) mode.
 *
 * @param n - Number of tiles
 * @param forcedColumns - If > 0, use this many columns instead of auto
 * @returns Grid dimensions
 */
export function packedGrid(n: number, forcedColumns = 0): { columns: number; rows: number } {
  if (n <= 0) return { columns: 1, rows: 1 };
  const cols = forcedColumns > 0 ? forcedColumns : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { columns: cols, rows };
}

/**
 * Compute viewports for manual/static mode.
 *
 * Tiles have free-form position and size in normalized canvas coordinates [0..1].
 * Converts to WebGL viewport coordinates (origin at bottom-left).
 *
 * @param tiles - Tile states with manual position/size
 * @param canvasW - Canvas width in pixels
 * @param canvasH - Canvas height in pixels
 * @returns Array of TileViewport regions
 */
export function manualViewports(
  tiles: TileState[],
  canvasW: number,
  canvasH: number,
): TileViewport[] {
  return tiles.map(tile => ({
    x: Math.round(tile.manualX * canvasW),
    y: Math.round((1 - tile.manualY - tile.manualHeight) * canvasH), // WebGL Y-flip
    width: Math.round(tile.manualWidth * canvasW),
    height: Math.round(tile.manualHeight * canvasH),
  }));
}
