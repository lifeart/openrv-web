/**
 * BaseGroupNode - Base class for group/container nodes
 *
 * Group nodes combine or select from multiple input sources.
 */

import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

export abstract class BaseGroupNode extends IPNode {
  constructor(type: string, name?: string) {
    super(type, name ?? 'Group');
  }

  /**
   * Get the active input index for this group
   */
  abstract getActiveInputIndex(context: EvalContext): number;

  protected process(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0) {
      return null;
    }

    const activeIndex = this.getActiveInputIndex(context);
    const clampedIndex = Math.max(0, Math.min(inputs.length - 1, activeIndex));
    return inputs[clampedIndex] ?? null;
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
