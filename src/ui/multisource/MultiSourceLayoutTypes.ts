/**
 * MultiSourceLayoutTypes - Type definitions for multi-source layout views.
 *
 * Defines the core data model for arranging multiple sources in tiled layouts:
 * packed (auto-grid), row, column, manual (free-position), and static modes.
 */

/** Layout mode determining how tiles are arranged on canvas. */
export type MultiSourceLayoutMode = 'packed' | 'row' | 'column' | 'manual' | 'static';

/** Per-tile content fitting mode. */
export type TileFitMode = 'fit' | 'fill' | 'center';

/** Per-tile state within a multi-source layout. */
export interface TileState {
  /** Unique tile identifier */
  id: string;
  /** Index into Session's sources array */
  sourceIndex: number;
  /** Label for display (e.g., "A", "B", "Source 1") */
  label: string;
  /** Per-tile pan offset (pixels, relative to tile center) */
  panX: number;
  panY: number;
  /** Per-tile zoom level (1.0 = fit-to-tile) */
  zoom: number;
  /** Manual mode: position in normalized coordinates [0..1] relative to canvas */
  manualX: number;
  manualY: number;
  /** Manual mode: size in normalized coordinates [0..1] */
  manualWidth: number;
  manualHeight: number;
  /** Whether this tile is the "active" tile receiving keyboard focus */
  active: boolean;
}

/** Complete state for the multi-source layout system. */
export interface MultiSourceLayoutState {
  /** Current layout mode */
  mode: MultiSourceLayoutMode;
  /** Whether multi-source layout is enabled */
  enabled: boolean;
  /** Ordered list of tiles */
  tiles: TileState[];
  /** Grid spacing in pixels (minimum: 0) */
  spacing: number;
  /** For packed mode: number of columns (0 = auto-calculate) */
  columns: number;
  /** Playback sync mode */
  playbackSync: 'synchronized' | 'independent';
  /** Show tile labels */
  showLabels: boolean;
  /** Show tile borders */
  showBorders: boolean;
}

/** Maximum number of tiles allowed */
export const MAX_TILE_COUNT = 16;

/** Create a default tile state for a given source index. */
export function createDefaultTileState(sourceIndex: number, label?: string): TileState {
  return {
    id: `tile-${sourceIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceIndex,
    label: label ?? `Source ${sourceIndex + 1}`,
    panX: 0,
    panY: 0,
    zoom: 1.0,
    manualX: 0,
    manualY: 0,
    manualWidth: 0.5,
    manualHeight: 0.5,
    active: false,
  };
}

/** Create a default layout state. */
export function createDefaultLayoutState(): MultiSourceLayoutState {
  return {
    mode: 'packed',
    enabled: false,
    tiles: [],
    spacing: 4,
    columns: 0,
    playbackSync: 'synchronized',
    showLabels: true,
    showBorders: true,
  };
}
