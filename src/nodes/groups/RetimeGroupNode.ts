/**
 * RetimeGroupNode - Time remapping for sources
 *
 * Allows speed changes, reverse playback, and frame remapping.
 * Supports explicit frame mapping via explicitActive/explicitFirstOutputFrame/explicitInputFrames.
 * Supports warp keyframe speed ramps via warpActive/warpKeyFrames/warpKeyRates.
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

    // Warp keyframe properties (populated from GTO warp component)
    this.properties.add({ name: 'warpActive', defaultValue: false });
    this.properties.add({ name: 'warpKeyFrames', defaultValue: [] });
    this.properties.add({ name: 'warpKeyRates', defaultValue: [] });
  }

  getActiveInputIndex(_context: EvalContext): number {
    return 0; // Always use first input
  }

  /**
   * Calculate the retimed frame number.
   *
   * Priority order:
   *   1. Explicit mapping (explicitActive + non-empty inputFrames)
   *   2. Warp keyframe interpolation (warpActive + valid keyframes/keyrates)
   *   3. Standard retime (scale + offset, optional reverse)
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

    const warpActive = this.properties.getValue('warpActive') as boolean;
    const warpKeyFrames = this.properties.getValue('warpKeyFrames') as number[];
    const warpKeyRates = this.properties.getValue('warpKeyRates') as number[];

    if (warpActive && warpKeyFrames.length > 0 && warpKeyFrames.length === warpKeyRates.length) {
      return this.getWarpFrame(frame);
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
   * Compute the input frame using warp keyframe interpolation.
   *
   * warpKeyFrames defines output frame positions where rate changes occur.
   * warpKeyRates defines the playback rate at each keyframe.
   * Between keyframes, the rate is linearly interpolated.
   *
   * The input frame is computed by integrating the rate curve from the first
   * keyframe to the requested output frame:
   *   inputFrame = integral from keyFrames[0] to outputFrame of rate(s) ds
   *
   * For a piecewise-linear rate function, each segment integral is computed
   * using the trapezoidal rule:
   *   segment_integral = (rate_a + rate_b) / 2 * (b - a)
   */
  private getWarpFrame(outputFrame: number): number {
    const keyFrames = this.properties.getValue('warpKeyFrames') as number[];
    const keyRates = this.properties.getValue('warpKeyRates') as number[];

    // Single keyframe means constant rate from frame 0
    if (keyFrames.length === 1) {
      const rate = keyRates[0] as number;
      return Math.max(1, Math.round(outputFrame * rate));
    }

    // Integrate the piecewise-linear rate curve from keyFrames[0] to outputFrame
    let integral = 0;
    const firstKF = keyFrames[0] as number;
    const lastKF = keyFrames[keyFrames.length - 1] as number;

    // If outputFrame is before the first keyframe, extrapolate at the first rate
    if (outputFrame <= firstKF) {
      const rate = keyRates[0] as number;
      integral = rate * (outputFrame - firstKF);
      return Math.max(1, Math.round(integral));
    }

    // Accumulate integral across segments
    for (let i = 0; i < keyFrames.length - 1; i++) {
      const segStart = keyFrames[i] as number;
      const segEnd = keyFrames[i + 1] as number;
      const rateStart = keyRates[i] as number;
      const rateEnd = keyRates[i + 1] as number;

      if (outputFrame <= segStart) {
        break;
      }

      // Determine the effective end of this segment for integration
      const effectiveEnd = Math.min(outputFrame, segEnd);
      const segSpan = segEnd - segStart;

      // Interpolate rate at effectiveEnd
      const t = segSpan > 0 ? (effectiveEnd - segStart) / segSpan : 0;
      const rateAtEnd = rateStart + (rateEnd - rateStart) * t;

      // Trapezoidal rule for this portion of the segment
      integral += (rateStart + rateAtEnd) / 2 * (effectiveEnd - segStart);

      if (outputFrame <= segEnd) {
        break;
      }
    }

    // If outputFrame is beyond the last keyframe, extrapolate at the last rate
    if (outputFrame > lastKF) {
      const lastRate = keyRates[keyRates.length - 1] as number;
      integral += lastRate * (outputFrame - lastKF);
    }

    return Math.max(1, Math.round(integral));
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
