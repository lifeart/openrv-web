/**
 * StackGroupNode - Stacks/composites multiple inputs
 *
 * Supports various blend modes and wipe effects between layers.
 *
 * Note: Currently implements basic wipe selection. Full implementation
 * would composite/blend inputs based on mode settings.
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

@RegisterNode('RVStackGroup')
export class StackGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVStackGroup', name ?? 'Stack');

    this.properties.add({ name: 'composite', defaultValue: 'replace' });
    this.properties.add({ name: 'mode', defaultValue: 'wipe' });
    this.properties.add({ name: 'wipeX', defaultValue: 0.5 });
    this.properties.add({ name: 'wipeY', defaultValue: 0.5 });
    this.properties.add({ name: 'wipeAngle', defaultValue: 0 });
  }

  getActiveInputIndex(_context: EvalContext): number {
    const mode = this.properties.getValue('mode') as string;
    const wipeX = this.properties.getValue('wipeX') as number;

    if (mode === 'wipe' && this.inputs.length >= 2) {
      // Simple horizontal wipe: select based on wipe position
      return wipeX < 0.5 ? 0 : 1;
    }

    return 0;
  }

  /**
   * Get wipe position (0-1)
   */
  getWipePosition(): { x: number; y: number; angle: number } {
    return {
      x: this.properties.getValue('wipeX') as number,
      y: this.properties.getValue('wipeY') as number,
      angle: this.properties.getValue('wipeAngle') as number,
    };
  }

  /**
   * Set wipe position
   */
  setWipePosition(x: number, y?: number): void {
    this.properties.setValue('wipeX', Math.max(0, Math.min(1, x)));
    if (y !== undefined) {
      this.properties.setValue('wipeY', Math.max(0, Math.min(1, y)));
    }
    this.markDirty();
  }
}
