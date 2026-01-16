/**
 * RetimeGroupNode - Time remapping for sources
 *
 * Allows speed changes, reverse playback, and frame remapping.
 *
 * Note: Currently a pass-through node. Full implementation would
 * modify the EvalContext frame before passing to child nodes.
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

@RegisterNode('RVRetimeGroup')
export class RetimeGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVRetimeGroup', name ?? 'Retime');

    this.properties.add({ name: 'scale', defaultValue: 1.0 });
    this.properties.add({ name: 'offset', defaultValue: 0 });
    this.properties.add({ name: 'reverse', defaultValue: false });
    this.properties.add({ name: 'duration', defaultValue: 0 });
  }

  getActiveInputIndex(_context: EvalContext): number {
    return 0; // Always use first input
  }

  /**
   * Calculate the retimed frame number
   *
   * @param frame - Original frame number
   * @param duration - Optional total duration for reverse calculation
   * @returns Retimed frame number
   */
  getRetimedFrame(frame: number, duration?: number): number {
    const scale = this.properties.getValue('scale') as number;
    const offset = this.properties.getValue('offset') as number;
    const reverse = this.properties.getValue('reverse') as boolean;
    const storedDuration = this.properties.getValue('duration') as number;
    const effectiveDuration = duration ?? storedDuration;

    let retimedFrame = Math.round(frame * scale + offset);

    if (reverse && effectiveDuration > 0) {
      retimedFrame = effectiveDuration - retimedFrame + 1;
    }

    return Math.max(1, retimedFrame);
  }
}
