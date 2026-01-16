/**
 * StackGroupNode - Stacks/composites multiple inputs
 *
 * Supports various blend modes and wipe effects between layers.
 */

import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

export type CompositeMode = 'over' | 'add' | 'difference' | 'replace';

@RegisterNode('RVStackGroup')
export class StackGroupNode extends IPNode {
  constructor(name?: string) {
    super('RVStackGroup', name ?? 'Stack');

    this.properties.add({ name: 'composite', defaultValue: 'replace' });
    this.properties.add({ name: 'mode', defaultValue: 'wipe' });
    this.properties.add({ name: 'wipeX', defaultValue: 0.5 });
    this.properties.add({ name: 'wipeY', defaultValue: 0.5 });
    this.properties.add({ name: 'wipeAngle', defaultValue: 0 });
  }

  protected process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0) {
      return null;
    }

    // For now, return the first valid input
    // Full implementation would composite based on mode/wipe settings
    const mode = this.properties.getValue('mode') as string;
    const wipeX = this.properties.getValue('wipeX') as number;

    if (mode === 'wipe' && inputs.length >= 2) {
      // Simple horizontal wipe: return based on wipe position
      // Full implementation would blend at the boundary
      const index = wipeX < 0.5 ? 0 : 1;
      return inputs[index] ?? inputs[0] ?? null;
    }

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
