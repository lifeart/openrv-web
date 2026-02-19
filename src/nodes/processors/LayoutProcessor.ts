/**
 * LayoutProcessor - NodeProcessor implementation for layout/tiling
 *
 * Encapsulates the processing logic of LayoutGroupNode: selecting
 * an input based on layout mode. In tiled mode, returns the first
 * non-null input (the actual tiled rendering is handled by the GPU
 * via Renderer.renderTiledImages). In pass-through mode, returns
 * only the first input.
 *
 * Also provides computeTileViewports() for calculating tile viewport
 * regions independently of the node graph.
 */

import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import type { NodeProcessor } from '../base/NodeProcessor';
import { computeTileViewports, type TileViewport } from '../groups/LayoutGroupNode';

export { type TileViewport } from '../groups/LayoutGroupNode';

/**
 * Layout mode determining how inputs are arranged.
 */
export type LayoutMode = 'row' | 'column' | 'grid';

/**
 * Configuration for the layout processor.
 */
export interface LayoutProcessorConfig {
  mode: LayoutMode;
  columns: number;
  rows: number;
  spacing: number;
}

const DEFAULT_CONFIG: LayoutProcessorConfig = {
  mode: 'row',
  columns: 2,
  rows: 2,
  spacing: 0,
};

export class LayoutProcessor implements NodeProcessor {
  private config: LayoutProcessorConfig;

  constructor(config?: Partial<LayoutProcessorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update the layout configuration.
   */
  setConfig(config: Partial<LayoutProcessorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the current layout configuration.
   */
  getConfig(): Readonly<LayoutProcessorConfig> {
    return this.config;
  }

  /**
   * Get grid dimensions for the current layout mode and input count.
   */
  getGridDimensions(inputCount: number): { columns: number; rows: number } {
    const count = Math.max(1, inputCount);

    if (this.config.mode === 'row') {
      return { columns: count, rows: 1 };
    } else if (this.config.mode === 'column') {
      return { columns: 1, rows: count };
    } else {
      // Grid mode
      const columns = this.config.columns > 0
        ? this.config.columns
        : Math.ceil(Math.sqrt(count));
      const rows = this.config.rows > 0
        ? this.config.rows
        : Math.ceil(count / columns);
      return { columns, rows };
    }
  }

  /**
   * Compute tile viewport regions for the given canvas dimensions.
   *
   * Delegates to the shared computeTileViewports() function so that
   * viewport calculation is consistent between LayoutProcessor and
   * LayoutGroupNode.
   *
   * @param canvasWidth - Total canvas width in pixels
   * @param canvasHeight - Total canvas height in pixels
   * @param inputCount - Number of inputs (used to compute grid dimensions)
   * @returns Array of TileViewport regions in row-major order (top-left first)
   */
  computeTileViewports(canvasWidth: number, canvasHeight: number, inputCount: number): TileViewport[] {
    const { columns, rows } = this.getGridDimensions(inputCount);
    return computeTileViewports(canvasWidth, canvasHeight, columns, rows, this.config.spacing);
  }

  process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0) {
      return null;
    }

    // Pass-through: return first non-null input.
    // Actual tiled rendering is handled by the GPU via Renderer.renderTiledImages().
    return inputs[0] ?? null;
  }

  invalidate(): void {
    // No cached state to invalidate for the current pass-through implementation
  }

  dispose(): void {
    // No resources to clean up
  }
}
