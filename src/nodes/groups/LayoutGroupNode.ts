/**
 * LayoutGroupNode - Tiles/layouts multiple inputs
 *
 * Arranges inputs in a grid or custom layout.
 *
 * Note: Currently a pass-through returning first input. Full implementation
 * would composite all inputs into a tiled layout based on mode settings.
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

@RegisterNode('RVLayoutGroup')
export class LayoutGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVLayoutGroup', name ?? 'Layout');

    this.properties.add({ name: 'mode', defaultValue: 'row' });
    this.properties.add({ name: 'columns', defaultValue: 2 });
    this.properties.add({ name: 'rows', defaultValue: 2 });
    this.properties.add({ name: 'spacing', defaultValue: 0 });
  }

  getActiveInputIndex(_context: EvalContext): number {
    return 0; // Returns first input for now
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
}
