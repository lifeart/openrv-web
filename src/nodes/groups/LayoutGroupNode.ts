/**
 * LayoutGroupNode - Tiles/layouts multiple inputs
 *
 * Arranges inputs in a grid or custom layout.
 */

import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

export type LayoutMode = 'row' | 'column' | 'grid' | 'manual';

@RegisterNode('RVLayoutGroup')
export class LayoutGroupNode extends IPNode {
  constructor(name?: string) {
    super('RVLayoutGroup', name ?? 'Layout');

    this.properties.add({ name: 'mode', defaultValue: 'row' });
    this.properties.add({ name: 'columns', defaultValue: 2 });
    this.properties.add({ name: 'rows', defaultValue: 2 });
    this.properties.add({ name: 'spacing', defaultValue: 0 });
  }

  protected process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0) {
      return null;
    }

    // For now, return the first input
    // Full implementation would composite all inputs into a tiled layout
    return inputs[0] ?? null;
  }

  toJSON(): object {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      inputs: this.inputs.map((n) => n.id),
      properties: this.properties.toJSON(),
    };
  }
}
