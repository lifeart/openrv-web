/**
 * SequenceGroupNode - Plays inputs in sequence
 *
 * Each input contributes frames sequentially. The group tracks
 * frame offsets to determine which input is active.
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

@RegisterNode('RVSequenceGroup')
export class SequenceGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVSequenceGroup', name ?? 'Sequence');

    this.properties.add({ name: 'autoSize', defaultValue: true });
  }

  getActiveInputIndex(context: EvalContext): number {
    // For now, just use frame to cycle through inputs
    // Full implementation would track each source's duration
    if (this.inputs.length === 0) return 0;
    return context.frame % this.inputs.length;
  }
}
