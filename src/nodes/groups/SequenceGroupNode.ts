/**
 * SequenceGroupNode - Plays inputs in sequence
 *
 * Each input contributes frames sequentially. The group tracks
 * frame offsets to determine which input is active.
 *
 * Supports EDL (Edit Decision List) data for precise frame mapping:
 * - edlFrames: Global frame numbers where each cut starts
 * - edlSources: Source index for each cut
 * - edlIn: Source in-point for each cut
 * - edlOut: Source out-point for each cut
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

/**
 * EDL (Edit Decision List) entry representing a single cut
 */
export interface EDLEntry {
  /** Global frame number where this cut starts */
  frame: number;
  /** Source index (input index) for this cut */
  source: number;
  /** In-point within the source (first frame to use) */
  inPoint: number;
  /** Out-point within the source (last frame to use) */
  outPoint: number;
}

@RegisterNode('RVSequenceGroup')
export class SequenceGroupNode extends BaseGroupNode {
  // Frame offsets for each input (cumulative start frames)
  private frameOffsets: number[] = [];

  constructor(name?: string) {
    super('RVSequenceGroup', name ?? 'Sequence');

    this.properties.add({ name: 'autoSize', defaultValue: true });
    // Per-input durations (defaults to 1 frame each if not specified)
    this.properties.add({ name: 'durations', defaultValue: [] });

    // EDL properties for explicit frame mapping
    this.properties.add({ name: 'edlFrames', defaultValue: [] });   // int[] - global frame starts
    this.properties.add({ name: 'edlSources', defaultValue: [] });  // int[] - source indices
    this.properties.add({ name: 'edlIn', defaultValue: [] });       // int[] - source in points
    this.properties.add({ name: 'edlOut', defaultValue: [] });      // int[] - source out points

    // Auto EDL mode (generate EDL from durations)
    this.properties.add({ name: 'autoEDL', defaultValue: true });
    this.properties.add({ name: 'useCutInfo', defaultValue: true });
  }

  /**
   * Check if this sequence has explicit EDL data
   */
  hasEDL(): boolean {
    const edlFrames = this.properties.getValue('edlFrames') as number[];
    return edlFrames.length > 0;
  }

  /**
   * Get EDL entries as structured data
   */
  getEDL(): EDLEntry[] {
    const frames = this.properties.getValue('edlFrames') as number[];
    const sources = this.properties.getValue('edlSources') as number[];
    const inPoints = this.properties.getValue('edlIn') as number[];
    const outPoints = this.properties.getValue('edlOut') as number[];

    const entries: EDLEntry[] = [];
    const count = Math.min(frames.length, sources.length, inPoints.length, outPoints.length);

    for (let i = 0; i < count; i++) {
      entries.push({
        frame: frames[i]!,
        source: sources[i]!,
        inPoint: inPoints[i]!,
        outPoint: outPoints[i]!,
      });
    }

    return entries;
  }

  /**
   * Set EDL data from structured entries
   */
  setEDL(entries: EDLEntry[]): void {
    const frames: number[] = [];
    const sources: number[] = [];
    const inPoints: number[] = [];
    const outPoints: number[] = [];

    for (const entry of entries) {
      frames.push(entry.frame);
      sources.push(entry.source);
      inPoints.push(entry.inPoint);
      outPoints.push(entry.outPoint);
    }

    this.properties.setValue('edlFrames', frames);
    this.properties.setValue('edlSources', sources);
    this.properties.setValue('edlIn', inPoints);
    this.properties.setValue('edlOut', outPoints);
    this.markDirty();
  }

  /**
   * Set EDL data from raw arrays (as stored in GTO)
   */
  setEDLArrays(frames: number[], sources: number[], inPoints: number[], outPoints: number[]): void {
    this.properties.setValue('edlFrames', frames);
    this.properties.setValue('edlSources', sources);
    this.properties.setValue('edlIn', inPoints);
    this.properties.setValue('edlOut', outPoints);
    this.markDirty();
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

    // Check for explicit EDL data first
    if (this.hasEDL()) {
      return this.getActiveInputFromEDL(context.frame);
    }

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
   * Get active input index using EDL data
   */
  private getActiveInputFromEDL(globalFrame: number): number {
    const edl = this.getEDL();
    if (edl.length === 0) return 0;

    // Find the EDL entry that contains the current frame
    for (let i = edl.length - 1; i >= 0; i--) {
      const entry = edl[i]!;
      if (globalFrame >= entry.frame) {
        return entry.source;
      }
    }

    return edl[0]?.source ?? 0;
  }

  /**
   * Get the local frame number within the active input
   */
  getLocalFrame(context: EvalContext): number {
    // Check for explicit EDL data first
    if (this.hasEDL()) {
      return this.getLocalFrameFromEDL(context.frame);
    }

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

  /**
   * Get local frame number using EDL data
   */
  private getLocalFrameFromEDL(globalFrame: number): number {
    const edl = this.getEDL();
    if (edl.length === 0) return 1;

    // Find the EDL entry that contains the current frame
    for (let i = edl.length - 1; i >= 0; i--) {
      const entry = edl[i]!;
      if (globalFrame >= entry.frame) {
        // Calculate offset within this cut
        const offsetInCut = globalFrame - entry.frame;
        // Return source frame (in-point + offset)
        return entry.inPoint + offsetInCut;
      }
    }

    return edl[0]?.inPoint ?? 1;
  }

  /**
   * Get total duration from EDL data
   */
  getTotalDurationFromEDL(): number {
    const edl = this.getEDL();
    if (edl.length === 0) return 0;

    let totalFrames = 0;
    for (const entry of edl) {
      totalFrames += entry.outPoint - entry.inPoint + 1;
    }
    return totalFrames;
  }
}
