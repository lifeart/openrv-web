/**
 * LayoutGroupNode - Tiles/layouts multiple inputs
 *
 * Arranges inputs in a grid or custom layout. When tiled mode is active
 * (via setTiledMode(true)), evaluateAllInputs() returns all input images
 * with their computed viewport regions for GPU tiled rendering.
 *
 * For single-input pass-through, the node returns the first input as before.
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

/**
 * A viewport region within the canvas for tiled rendering.
 * Coordinates are in pixels, origin at bottom-left (WebGL convention).
 */
export interface TileViewport {
  /** X offset from left edge in pixels */
  x: number;
  /** Y offset from bottom edge in pixels */
  y: number;
  /** Width of the tile viewport in pixels */
  width: number;
  /** Height of the tile viewport in pixels */
  height: number;
}

/**
 * A tile entry: an image paired with its viewport region.
 */
export interface TileEntry {
  image: IPImage;
  viewport: TileViewport;
}

/**
 * Result of evaluating all inputs for tiled rendering.
 */
export interface TiledLayoutResult {
  /** All tiles with their viewport regions */
  tiles: TileEntry[];
  /** Grid dimensions used for layout */
  grid: { columns: number; rows: number };
  /** Spacing between tiles in pixels */
  spacing: number;
}

@RegisterNode('RVLayoutGroup')
export class LayoutGroupNode extends BaseGroupNode {
  private _tiledMode = false;

  constructor(name?: string) {
    super('RVLayoutGroup', name ?? 'Layout');

    this.properties.add({ name: 'mode', defaultValue: 'row' });
    this.properties.add({ name: 'columns', defaultValue: 2 });
    this.properties.add({ name: 'rows', defaultValue: 2 });
    this.properties.add({ name: 'spacing', defaultValue: 0 });
  }

  /**
   * Enable or disable tiled rendering mode.
   * When enabled, evaluateAllInputs() will return all inputs with viewports.
   * When disabled, the node returns only the first input (pass-through).
   */
  setTiledMode(enabled: boolean): void {
    if (this._tiledMode !== enabled) {
      this._tiledMode = enabled;
      this.markDirty();
    }
  }

  /**
   * Whether tiled rendering mode is active.
   */
  isTiledMode(): boolean {
    return this._tiledMode;
  }

  getActiveInputIndex(_context: EvalContext): number {
    return 0; // Returns first input for pass-through mode
  }

  /**
   * Get grid dimensions for layout
   */
  getGridDimensions(): { columns: number; rows: number } {
    const mode = this.properties.getValue('mode') as string;
    const inputCount = Math.max(1, this.inputs.length);

    if (mode === 'row') {
      return { columns: inputCount, rows: 1 };
    } else if (mode === 'column') {
      return { columns: 1, rows: inputCount };
    } else {
      // Grid mode - use configured or auto-calculate
      const configColumns = this.properties.getValue('columns') as number;
      const configRows = this.properties.getValue('rows') as number;
      const columns = configColumns > 0 ? configColumns : Math.ceil(Math.sqrt(inputCount));
      const rows = configRows > 0 ? configRows : Math.ceil(inputCount / columns);
      return { columns, rows };
    }
  }

  /**
   * Compute tile viewport regions for the given canvas dimensions.
   *
   * Divides the canvas into a grid of tiles based on the layout mode,
   * accounting for spacing between tiles. Each tile is positioned in
   * WebGL viewport coordinates (origin at bottom-left).
   *
   * @param canvasWidth - Total canvas width in pixels
   * @param canvasHeight - Total canvas height in pixels
   * @returns Array of TileViewport regions, one per grid cell (row-major order,
   *          index 0 = top-left, filling left-to-right then top-to-bottom)
   */
  computeTileViewports(canvasWidth: number, canvasHeight: number): TileViewport[] {
    const { columns, rows } = this.getGridDimensions();
    const spacing = this.properties.getValue('spacing') as number;

    return computeTileViewports(canvasWidth, canvasHeight, columns, rows, spacing);
  }

  /**
   * Evaluate all inputs and return images with their computed viewport regions.
   *
   * This is the primary method for tiled rendering. It evaluates every input
   * node and pairs each result with a viewport region based on the grid layout.
   *
   * Inputs that evaluate to null are skipped (the tile slot is left empty).
   *
   * @param context - Evaluation context
   * @param canvasWidth - Total canvas width in pixels
   * @param canvasHeight - Total canvas height in pixels
   * @returns TiledLayoutResult with all tiles, or null if no inputs
   */
  evaluateAllInputs(context: EvalContext, canvasWidth: number, canvasHeight: number): TiledLayoutResult | null {
    if (this.inputs.length === 0) {
      return null;
    }

    const viewports = this.computeTileViewports(canvasWidth, canvasHeight);
    const tiles: TileEntry[] = [];

    for (let i = 0; i < this.inputs.length && i < viewports.length; i++) {
      const input = this.inputs[i]!;
      const image = input.evaluate(context);
      if (image) {
        tiles.push({ image, viewport: viewports[i]! });
      }
    }

    if (tiles.length === 0) {
      return null;
    }

    return {
      tiles,
      grid: this.getGridDimensions(),
      spacing: this.properties.getValue('spacing') as number,
    };
  }
}

/**
 * Compute tile viewport regions for a grid layout.
 *
 * This is a pure function for use in both LayoutGroupNode and LayoutProcessor.
 *
 * @param canvasWidth - Total canvas width in pixels
 * @param canvasHeight - Total canvas height in pixels
 * @param columns - Number of columns in the grid
 * @param rows - Number of rows in the grid
 * @param spacing - Spacing between tiles in pixels
 * @returns Array of TileViewport regions in row-major order (top-left first)
 */
export function computeTileViewports(
  canvasWidth: number,
  canvasHeight: number,
  columns: number,
  rows: number,
  spacing: number,
): TileViewport[] {
  // Total spacing consumed by gaps between tiles
  const totalHSpacing = Math.max(0, columns - 1) * spacing;
  const totalVSpacing = Math.max(0, rows - 1) * spacing;

  // Available space for tiles after subtracting spacing
  const availableWidth = canvasWidth - totalHSpacing;
  const availableHeight = canvasHeight - totalVSpacing;

  // Guard against zero or negative dimensions
  if (columns <= 0 || rows <= 0) return [];

  // Per-tile dimensions (floored to avoid sub-pixel issues, clamped to zero min)
  const tileWidth = Math.max(0, Math.floor(availableWidth / columns));
  const tileHeight = Math.max(0, Math.floor(availableHeight / rows));

  const viewports: TileViewport[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      // X position: tiles arranged left-to-right
      const x = col * (tileWidth + spacing);

      // Y position: WebGL origin is bottom-left, but we want row 0 at the top.
      // Row 0 (top) has the highest Y in WebGL coordinates.
      const y = (rows - 1 - row) * (tileHeight + spacing);

      viewports.push({ x, y, width: tileWidth, height: tileHeight });
    }
  }

  return viewports;
}
