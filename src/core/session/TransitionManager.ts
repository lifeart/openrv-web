/**
 * TransitionManager - Manages transitions between playlist clips.
 *
 * Handles gap-indexed transitions where transitions[i] represents the
 * transition between clips[i] and clips[i+1]. Supports overlap-adjusted
 * global frame calculation and frame-level transition detection.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { TransitionConfig, TransitionFrameInfo } from '../types/transition';
import type { PlaylistClip } from './PlaylistManager';
import type { ManagerBase } from '../ManagerBase';

/** Events emitted by TransitionManager */
export interface TransitionManagerEvents extends EventMap {
  /** Emitted when a transition at a specific gap is changed */
  transitionChanged: { gapIndex: number; config: TransitionConfig | null };
  /** Emitted when all transitions are reset */
  transitionsReset: void;
}

/**
 * TransitionManager handles transitions between playlist clips.
 *
 * transitions[i] = transition between clips[i] and clips[i+1].
 * A null or { type: 'cut' } entry means a hard cut (no blending).
 */
export class TransitionManager extends EventEmitter<TransitionManagerEvents> implements ManagerBase {
  /** Gap-indexed transition configs. transitions[i] is between clips[i] and clips[i+1]. */
  private transitions: (TransitionConfig | null)[] = [];

  constructor() {
    super();
  }

  /**
   * Set transition for a gap between clips[gapIndex] and clips[gapIndex+1].
   */
  setTransition(gapIndex: number, config: TransitionConfig | null): void {
    if (!Number.isInteger(gapIndex) || gapIndex < 0) return;
    // Ensure array is large enough
    while (this.transitions.length <= gapIndex) {
      this.transitions.push(null);
    }
    this.transitions[gapIndex] = config;
    this.emit('transitionChanged', { gapIndex, config });
  }

  /**
   * Get transition at a specific gap.
   */
  getTransition(gapIndex: number): TransitionConfig | null {
    return this.transitions[gapIndex] ?? null;
  }

  /**
   * Get all transitions.
   */
  getTransitions(): (TransitionConfig | null)[] {
    return [...this.transitions];
  }

  /**
   * Validate transition duration against clip durations.
   * Returns the validated (possibly clamped) config, or null if invalid.
   *
   * A transition at gapIndex is between clips[gapIndex] and clips[gapIndex+1].
   * The duration must not exceed the minimum of those two clip durations.
   * Additionally, the combined durations of adjacent transitions on a single clip
   * must not exceed that clip's duration.
   */
  validateTransition(
    gapIndex: number,
    config: TransitionConfig,
    clips: PlaylistClip[]
  ): TransitionConfig | null {
    if (gapIndex < 0 || gapIndex >= clips.length - 1) {
      return null;
    }

    const outgoing = clips[gapIndex];
    const incoming = clips[gapIndex + 1];
    if (!outgoing || !incoming) {
      return null;
    }

    // Max duration is the minimum of the two clip durations
    const maxDuration = Math.min(outgoing.duration, incoming.duration);

    if (config.durationFrames <= 0) {
      return null;
    }

    // Clamp duration to max allowed
    let clampedDuration = Math.min(config.durationFrames, maxDuration);

    // Check overlap with adjacent transitions on the outgoing clip (left side)
    const leftTransition = gapIndex > 0 ? this.transitions[gapIndex - 1] : null;
    if (leftTransition && leftTransition.type !== 'cut') {
      const availableOnOutgoing = outgoing.duration - leftTransition.durationFrames;
      if (availableOnOutgoing <= 0) {
        return null;
      }
      clampedDuration = Math.min(clampedDuration, availableOnOutgoing);
    }

    // Check overlap with adjacent transitions on the incoming clip (right side)
    const rightTransition = gapIndex + 1 < this.transitions.length ? this.transitions[gapIndex + 1] : null;
    if (rightTransition && rightTransition.type !== 'cut') {
      const availableOnIncoming = incoming.duration - rightTransition.durationFrames;
      if (availableOnIncoming <= 0) {
        return null;
      }
      clampedDuration = Math.min(clampedDuration, availableOnIncoming);
    }

    if (clampedDuration <= 0) {
      return null;
    }

    return {
      type: config.type,
      durationFrames: clampedDuration,
    };
  }

  /**
   * Check if a global frame is within a transition region.
   * Requires clips array (with overlap-adjusted global start frames).
   * Returns TransitionFrameInfo if in a transition, null otherwise.
   *
   * The transition between clips[i] and clips[i+1] overlaps the last N frames
   * of clips[i] with the first N frames of clips[i+1].
   *
   * After overlap adjustment:
   * - transitionStart = clips[i+1].globalStartFrame
   * - transitionEnd = clips[i+1].globalStartFrame + durationFrames - 1
   * - progress = (globalFrame - transitionStart) / (durationFrames - 1)
   */
  getTransitionAtFrame(
    globalFrame: number,
    clips: PlaylistClip[]
  ): TransitionFrameInfo | null {
    // Calculate overlap-adjusted clips
    const adjustedClips = this.calculateOverlapAdjustedFrames(clips);

    for (let i = 0; i < this.transitions.length; i++) {
      const transition = this.transitions[i];
      if (!transition || transition.type === 'cut') continue;

      const outgoingClip = adjustedClips[i];
      const incomingClip = adjustedClips[i + 1];
      if (!outgoingClip || !incomingClip) continue;

      const durationFrames = transition.durationFrames;
      if (durationFrames <= 0) continue;

      const transitionStart = incomingClip.globalStartFrame;
      const transitionEnd = transitionStart + durationFrames - 1;

      if (globalFrame >= transitionStart && globalFrame <= transitionEnd) {
        // Calculate progress
        const progress = durationFrames === 1
          ? 1.0
          : (globalFrame - transitionStart) / (durationFrames - 1);

        // Calculate local frames
        // Outgoing clip: the transition covers the LAST durationFrames of the outgoing clip
        // outgoing local offset from outgoing clip's global start
        const outgoingLocalOffset = globalFrame - outgoingClip.globalStartFrame;
        const outgoingLocalFrame = outgoingClip.inPoint + outgoingLocalOffset;

        // Incoming clip: the transition covers the FIRST durationFrames of the incoming clip
        const incomingLocalOffset = globalFrame - incomingClip.globalStartFrame;
        const incomingLocalFrame = incomingClip.inPoint + incomingLocalOffset;

        return {
          isInTransition: true,
          transitionType: transition.type,
          progress,
          outgoingClipIndex: i,
          incomingClipIndex: i + 1,
          outgoingLocalFrame,
          incomingLocalFrame,
        };
      }
    }

    return null;
  }

  /**
   * Get the total overlap (sum of all non-null, non-cut transition durations).
   * Used by PlaylistManager to calculate adjusted total duration.
   */
  getTotalOverlap(): number {
    let total = 0;
    for (const transition of this.transitions) {
      if (transition && transition.type !== 'cut') {
        total += transition.durationFrames;
      }
    }
    return total;
  }

  /**
   * Recalculate global start frames accounting for transition overlaps.
   * Returns adjusted clips array (does not mutate originals).
   *
   * Without transitions:  [ClipA: 50f][ClipB: 40f]  = 90 frames total
   * With 12f crossfade:   [ClipA: 50f]              = 78 frames total
   *                              [ClipB: 40f]
   *                          ^ 12 frame overlap ^
   *
   * - globalStartFrame of clip[0] = 1
   * - globalStartFrame of clip[i+1] = clip[i].globalStartFrame + clip[i].duration - transitionDuration
   */
  calculateOverlapAdjustedFrames(clips: PlaylistClip[]): PlaylistClip[] {
    if (clips.length === 0) return [];

    const adjusted: PlaylistClip[] = clips.map(clip => ({ ...clip }));

    adjusted[0]!.globalStartFrame = 1;

    for (let i = 0; i < adjusted.length - 1; i++) {
      const current = adjusted[i]!;
      const next = adjusted[i + 1]!;

      const transition = this.transitions[i];
      const overlap = (transition && transition.type !== 'cut') ? transition.durationFrames : 0;

      next.globalStartFrame = current.globalStartFrame + current.duration - overlap;
    }

    return adjusted;
  }

  /**
   * Clear all transitions (e.g., when clips change).
   */
  clear(): void {
    this.transitions = [];
    this.emit('transitionsReset', undefined);
  }

  /**
   * Resize transitions array to match number of gaps (clips.length - 1).
   * Preserves existing transitions when possible.
   */
  resizeToClips(clipCount: number): void {
    const gapCount = Math.max(0, clipCount - 1);

    if (this.transitions.length > gapCount) {
      // Truncate extras
      this.transitions.length = gapCount;
    } else {
      // Pad with null
      while (this.transitions.length < gapCount) {
        this.transitions.push(null);
      }
    }
  }

  /**
   * Get state for serialization.
   */
  getState(): (TransitionConfig | null)[] {
    return this.transitions.map(t => (t ? { ...t } : null));
  }

  /**
   * Restore state from serialization.
   */
  setState(transitions: (TransitionConfig | null)[]): void {
    this.transitions = transitions.map(t => (t ? { ...t } : null));
  }

  /**
   * Release all resources held by this manager.
   */
  dispose(): void {
    this.transitions = [];
    this.removeAllListeners();
  }
}
