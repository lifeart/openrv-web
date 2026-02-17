/**
 * RetimeGroupNode - Time remapping for sources
 *
 * Allows speed changes, reverse playback, and frame remapping.
 * Supports explicit frame mapping via explicitActive/explicitFirstOutputFrame/explicitInputFrames.
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

    // Explicit frame mapping properties (populated from GTO explicit component)
    this.properties.add({ name: 'explicitActive', defaultValue: false });
    this.properties.add({ name: 'explicitFirstOutputFrame', defaultValue: 1 });
    this.properties.add({ name: 'explicitInputFrames', defaultValue: [] });
  }

  getActiveInputIndex(_context: EvalContext): number {
    return 0; // Always use first input
  }

  /**
   * Calculate the retimed frame number.
   *
   * When explicit mapping is active, the requested output frame is looked up
   * in the explicitInputFrames table:
   *   inputFrame = explicitInputFrames[outputFrame - firstOutputFrame]
   *
   * Out-of-range output frames are clamped to the first or last entry.
   * An empty inputFrames array falls back to the standard retime logic.
   *
   * @param frame - Original (output) frame number
   * @param duration - Optional total duration for reverse calculation
   * @returns Retimed (input) frame number
   */
  getRetimedFrame(frame: number, duration?: number): number {
    const explicitActive = this.properties.getValue('explicitActive') as boolean;
    const inputFrames = this.properties.getValue('explicitInputFrames') as number[];

    if (explicitActive && inputFrames.length > 0) {
      return this.getExplicitFrame(frame);
    }

    return this.getStandardRetimedFrame(frame, duration);
  }

  /**
   * Look up the input frame from the explicit mapping table.
   * Clamps out-of-range output frames to the first/last entry.
   */
  private getExplicitFrame(outputFrame: number): number {
    const firstOutputFrame = this.properties.getValue('explicitFirstOutputFrame') as number;
    const inputFrames = this.properties.getValue('explicitInputFrames') as number[];

    const index = outputFrame - firstOutputFrame;
    const clampedIndex = Math.max(0, Math.min(inputFrames.length - 1, index));
    return inputFrames[clampedIndex] as number;
  }

  /**
   * Standard retime: scale + offset, optional reverse.
   */
  private getStandardRetimedFrame(frame: number, duration?: number): number {
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
