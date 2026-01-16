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
  // Frame offsets for each input (cumulative start frames)
  private frameOffsets: number[] = [];

  constructor(name?: string) {
    super('RVSequenceGroup', name ?? 'Sequence');

    this.properties.add({ name: 'autoSize', defaultValue: true });
    // Per-input durations (defaults to 1 frame each if not specified)
    this.properties.add({ name: 'durations', defaultValue: [] });
  }

  /**
   * Set the duration for each input source
   */
  setInputDurations(durations: number[]): void {
    this.properties.setValue('durations', durations);
    this.recalculateOffsets();
    this.markDirty();
  }

  /**
   * Recalculate frame offsets based on input durations
   */
  private recalculateOffsets(): void {
    const durations = this.properties.getValue('durations') as number[];
    this.frameOffsets = [];
    let offset = 0;

    for (let i = 0; i < this.inputs.length; i++) {
      this.frameOffsets.push(offset);
      // Use provided duration or default to 1 frame
      const duration = durations[i] ?? 1;
      offset += duration;
    }
  }

  /**
   * Get total duration of the sequence
   */
  getTotalDuration(): number {
    const durations = this.properties.getValue('durations') as number[];
    if (durations.length === 0) {
      return this.inputs.length; // 1 frame per input if no durations set
    }
    // Sum all durations, defaulting missing entries to 1 frame
    let total = 0;
    for (let i = 0; i < this.inputs.length; i++) {
      total += durations[i] ?? 1;
    }
    return total;
  }

  getActiveInputIndex(context: EvalContext): number {
    if (this.inputs.length === 0) return 0;

    const durations = this.properties.getValue('durations') as number[];

    // If no durations specified, fall back to simple 1-frame-per-input
    if (durations.length === 0) {
      const totalDuration = this.inputs.length;
      if (totalDuration === 0) return 0;
      const frame = ((context.frame - 1) % totalDuration) + 1;
      return Math.min(frame - 1, this.inputs.length - 1);
    }

    // Recalculate offsets if needed
    if (this.frameOffsets.length !== this.inputs.length) {
      this.recalculateOffsets();
    }

    // Find which input contains the current frame
    const totalDuration = this.getTotalDuration();
    if (totalDuration === 0) return 0;
    const frame = ((context.frame - 1) % totalDuration) + 1;

    for (let i = this.inputs.length - 1; i >= 0; i--) {
      const offset = this.frameOffsets[i];
      if (offset !== undefined && frame > offset) {
        return i;
      }
    }

    return 0;
  }

  /**
   * Get the local frame number within the active input
   */
  getLocalFrame(context: EvalContext): number {
    const activeIndex = this.getActiveInputIndex(context);
    const durations = this.properties.getValue('durations') as number[];
    const totalDuration = this.getTotalDuration();

    if (totalDuration === 0 || this.frameOffsets.length === 0 || durations.length === 0) {
      return 1;
    }

    const frame = ((context.frame - 1) % totalDuration) + 1;
    const offset = this.frameOffsets[activeIndex] ?? 0;
    return frame - offset;
  }
}
