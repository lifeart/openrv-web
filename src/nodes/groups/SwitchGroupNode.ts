/**
 * SwitchGroupNode - Switches between inputs (A/B compare)
 *
 * Displays one of the inputs based on the output index.
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

@RegisterNode('RVSwitchGroup')
export class SwitchGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVSwitchGroup', name ?? 'Switch');

    this.properties.add({ name: 'outputIndex', defaultValue: 0 });
  }

  getActiveInputIndex(_context: EvalContext): number {
    return this.properties.getValue('outputIndex') as number;
  }

  /**
   * Set the active input index
   */
  setActiveInput(index: number): void {
    const clamped = Math.max(0, Math.min(this.inputs.length - 1, index));
    this.properties.setValue('outputIndex', clamped);
    this.markDirty();
  }

  /**
   * Toggle between inputs
   */
  toggle(): void {
    const current = this.properties.getValue('outputIndex') as number;
    const next = (current + 1) % Math.max(1, this.inputs.length);
    this.setActiveInput(next);
  }
}
