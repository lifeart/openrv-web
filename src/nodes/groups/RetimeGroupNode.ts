/**
 * RetimeGroupNode - Time remapping for sources
 *
 * Allows speed changes, reverse playback, and frame remapping.
 */

import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

@RegisterNode('RVRetimeGroup')
export class RetimeGroupNode extends IPNode {
  constructor(name?: string) {
    super('RVRetimeGroup', name ?? 'Retime');

    this.properties.add({ name: 'scale', defaultValue: 1.0 });
    this.properties.add({ name: 'offset', defaultValue: 0 });
    this.properties.add({ name: 'reverse', defaultValue: false });
  }

  protected process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0 || !inputs[0]) {
      return null;
    }

    // Retime context would modify the frame before passing to input
    // For now, just pass through
    return inputs[0];
  }

  /**
   * Calculate the retimed frame number
   */
  getRetimedFrame(frame: number): number {
    const scale = this.properties.getValue('scale') as number;
    const offset = this.properties.getValue('offset') as number;
    const reverse = this.properties.getValue('reverse') as boolean;

    let retimedFrame = Math.round(frame * scale + offset);

    if (reverse) {
      // Would need duration to properly reverse
      retimedFrame = -retimedFrame;
    }

    return retimedFrame;
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
