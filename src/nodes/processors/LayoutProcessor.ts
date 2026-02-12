/**
 * LayoutProcessor - NodeProcessor implementation for layout/tiling
 *
 * Encapsulates the processing logic of LayoutGroupNode: selecting
 * an input based on layout mode. Currently a pass-through returning
 * the first input, matching the existing LayoutGroupNode behavior.
 *
 * This is a proof-of-concept processor demonstrating the NodeProcessor
 * strategy pattern. A future implementation could composite all inputs
 * into a tiled layout based on mode settings.
 */

import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import type { NodeProcessor } from '../base/NodeProcessor';

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

  process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0) {
      return null;
    }

    // Current behavior: pass-through first input.
    // A full implementation would composite all inputs into a tiled layout.
    return inputs[0] ?? null;
  }

  invalidate(): void {
    // No cached state to invalidate for the current pass-through implementation
  }

  dispose(): void {
    // No resources to clean up
  }
}
