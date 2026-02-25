/**
 * TransitionManager Tests
 *
 * Comprehensive tests for gap-indexed transitions, overlap-adjusted
 * frame calculation, transition detection, validation, and serialization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransitionManager } from './TransitionManager';
import type { PlaylistClip } from './PlaylistManager';
import type { TransitionConfig } from '../types/transition';

/** Helper to create a PlaylistClip for testing */
function makeClip(
  id: string,
  sourceIndex: number,
  inPoint: number,
  outPoint: number,
  globalStartFrame: number
): PlaylistClip {
  return {
    id,
    sourceIndex,
    sourceName: `Source ${sourceIndex}`,
    inPoint,
    outPoint,
    globalStartFrame,
    duration: outPoint - inPoint + 1,
  };
}

describe('TransitionManager', () => {
  let manager: TransitionManager;

  beforeEach(() => {
    manager = new TransitionManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('setTransition / getTransition', () => {
    it('should set and get a transition at a gap index', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      manager.setTransition(0, config);

      const result = manager.getTransition(0);
      expect(result).toEqual(config);
    });

    it('should return null for unset gap indices', () => {
      expect(manager.getTransition(0)).toBeNull();
      expect(manager.getTransition(5)).toBeNull();
    });

    it('should overwrite an existing transition', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(0, { type: 'dissolve', durationFrames: 8 });

      const result = manager.getTransition(0);
      expect(result).toEqual({ type: 'dissolve', durationFrames: 8 });
    });

    it('should set transition to null (hard cut)', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(0, null);

      expect(manager.getTransition(0)).toBeNull();
    });

    it('should expand array for non-contiguous gap indices', () => {
      manager.setTransition(3, { type: 'wipe-left', durationFrames: 10 });

      expect(manager.getTransition(0)).toBeNull();
      expect(manager.getTransition(1)).toBeNull();
      expect(manager.getTransition(2)).toBeNull();
      expect(manager.getTransition(3)).toEqual({ type: 'wipe-left', durationFrames: 10 });
    });

    it('should emit transitionChanged event', () => {
      const callback = vi.fn();
      manager.on('transitionChanged', callback);

      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      manager.setTransition(0, config);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ gapIndex: 0, config });
    });

    it('should emit transitionChanged event when setting to null', () => {
      const callback = vi.fn();
      manager.on('transitionChanged', callback);

      manager.setTransition(0, null);

      expect(callback).toHaveBeenCalledWith({ gapIndex: 0, config: null });
    });

    it('should ignore negative gap indices', () => {
      const callback = vi.fn();
      manager.on('transitionChanged', callback);

      manager.setTransition(-1, { type: 'crossfade', durationFrames: 12 });

      expect(callback).not.toHaveBeenCalled();
      expect(manager.getTransitions()).toEqual([]);
    });

    it('should ignore non-integer gap indices', () => {
      const callback = vi.fn();
      manager.on('transitionChanged', callback);

      manager.setTransition(1.5, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(NaN, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(Infinity, { type: 'crossfade', durationFrames: 12 });

      expect(callback).not.toHaveBeenCalled();
      expect(manager.getTransitions()).toEqual([]);
    });
  });

  describe('getTransitions', () => {
    it('should return empty array when no transitions set', () => {
      expect(manager.getTransitions()).toEqual([]);
    });

    it('should return a copy of all transitions', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      const transitions = manager.getTransitions();
      expect(transitions).toEqual([
        { type: 'crossfade', durationFrames: 12 },
        { type: 'dissolve', durationFrames: 8 },
      ]);

      // Should be a copy, not the internal array
      transitions[0] = null;
      expect(manager.getTransition(0)).toEqual({ type: 'crossfade', durationFrames: 12 });
    });
  });

  describe('validateTransition', () => {
    const clips: PlaylistClip[] = [
      makeClip('clip-1', 0, 1, 50, 1),   // 50 frames
      makeClip('clip-2', 1, 1, 40, 51),  // 40 frames
      makeClip('clip-3', 2, 1, 30, 91),  // 30 frames
    ];

    it('should return config unchanged when within limits', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      const result = manager.validateTransition(0, config, clips);

      expect(result).toEqual({ type: 'crossfade', durationFrames: 12 });
    });

    it('should clamp duration to min(outgoing.duration, incoming.duration)', () => {
      // Between clip-2 (40f) and clip-3 (30f) -> max is 30
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 35 };
      const result = manager.validateTransition(1, config, clips);

      expect(result).not.toBeNull();
      expect(result!.durationFrames).toBe(30);
    });

    it('should return null for invalid gap index (negative)', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      expect(manager.validateTransition(-1, config, clips)).toBeNull();
    });

    it('should return null for invalid gap index (out of range)', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      expect(manager.validateTransition(2, config, clips)).toBeNull(); // Only 2 gaps for 3 clips
    });

    it('should return null for zero duration', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 0 };
      expect(manager.validateTransition(0, config, clips)).toBeNull();
    });

    it('should return null for negative duration', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: -5 };
      expect(manager.validateTransition(0, config, clips)).toBeNull();
    });

    it('should consider adjacent transitions when validating (overlap protection)', () => {
      // Set a transition at gap 0 that uses 30 frames of clip-2 (40 frames total)
      manager.setTransition(0, { type: 'crossfade', durationFrames: 30 });

      // Now try to set transition at gap 1. Clip-2 only has 40 - 30 = 10 frames available
      const config: TransitionConfig = { type: 'dissolve', durationFrames: 20 };
      const result = manager.validateTransition(1, config, clips);

      expect(result).not.toBeNull();
      expect(result!.durationFrames).toBe(10); // Clamped to available
    });

    it('should return null when adjacent transitions completely consume a clip', () => {
      // Set a transition at gap 0 that uses all 40 frames of clip-2
      manager.setTransition(0, { type: 'crossfade', durationFrames: 40 });

      // Now try to set transition at gap 1. Clip-2 has 0 frames available
      const config: TransitionConfig = { type: 'dissolve', durationFrames: 5 };
      const result = manager.validateTransition(1, config, clips);

      expect(result).toBeNull();
    });

    it('should return null for single clip (no gaps possible)', () => {
      const singleClip: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),
      ];
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      expect(manager.validateTransition(0, config, singleClip)).toBeNull();
    });

    it('should return null for empty clips array', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      expect(manager.validateTransition(0, config, [])).toBeNull();
    });

    it('should clamp duration when it exceeds both clip durations', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 999 };
      const result = manager.validateTransition(0, config, clips);
      // Minimum of clip durations: min(50, 40) = 40
      expect(result).not.toBeNull();
      expect(result!.durationFrames).toBe(40);
    });
  });

  describe('getTransitionAtFrame', () => {
    // Two clips: A (50 frames) and B (40 frames) with a 12-frame crossfade
    const clips: PlaylistClip[] = [
      makeClip('clip-1', 0, 1, 50, 1),   // 50 frames, starts at global 1
      makeClip('clip-2', 1, 1, 40, 51),  // 40 frames, starts at global 51 (before overlap)
    ];

    it('should return null outside transition regions', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      // Frame 1 is well before the transition
      expect(manager.getTransitionAtFrame(1, clips)).toBeNull();

      // Frame 20 is well before the transition
      expect(manager.getTransitionAtFrame(20, clips)).toBeNull();
    });

    it('should return correct info during transition', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      // After overlap adjustment: clip-1 starts at 1, clip-2 starts at 39 (1 + 50 - 12)
      // Transition region: frames 39..50

      const info = manager.getTransitionAtFrame(39, clips);
      expect(info).not.toBeNull();
      expect(info!.isInTransition).toBe(true);
      expect(info!.transitionType).toBe('crossfade');
      expect(info!.outgoingClipIndex).toBe(0);
      expect(info!.incomingClipIndex).toBe(1);
    });

    it('should return correct progress values (0.0 at start, 1.0 at end)', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      // After overlap: clip-2 starts at 39, transition is frames 39..50

      // First frame of transition -> progress = 0.0
      const startInfo = manager.getTransitionAtFrame(39, clips);
      expect(startInfo).not.toBeNull();
      expect(startInfo!.progress).toBeCloseTo(0.0, 5);

      // Last frame of transition -> progress = 1.0
      const endInfo = manager.getTransitionAtFrame(50, clips);
      expect(endInfo).not.toBeNull();
      expect(endInfo!.progress).toBeCloseTo(1.0, 5);

      // Middle frame -> progress should be between 0 and 1
      const midFrame = 39 + 5; // 44
      const midInfo = manager.getTransitionAtFrame(midFrame, clips);
      expect(midInfo).not.toBeNull();
      expect(midInfo!.progress).toBeCloseTo(5 / 11, 5); // (44 - 39) / (12 - 1)
    });

    it('should return null when no transitions are set', () => {
      expect(manager.getTransitionAtFrame(25, clips)).toBeNull();
      expect(manager.getTransitionAtFrame(51, clips)).toBeNull();
    });

    it('should return null for cut transitions', () => {
      manager.setTransition(0, { type: 'cut', durationFrames: 0 });

      expect(manager.getTransitionAtFrame(50, clips)).toBeNull();
      expect(manager.getTransitionAtFrame(51, clips)).toBeNull();
    });

    it('should return correct local frames', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      // After overlap: clip-2 starts at global 39
      // At global frame 39:
      //   outgoing (clip-1): local offset = 39 - 1 = 38, local frame = 1 + 38 = 39
      //   incoming (clip-2): local offset = 39 - 39 = 0, local frame = 1 + 0 = 1
      const info = manager.getTransitionAtFrame(39, clips);
      expect(info).not.toBeNull();
      expect(info!.outgoingLocalFrame).toBe(39);
      expect(info!.incomingLocalFrame).toBe(1);

      // At global frame 50 (last frame of transition):
      //   outgoing (clip-1): local offset = 50 - 1 = 49, local frame = 1 + 49 = 50
      //   incoming (clip-2): local offset = 50 - 39 = 11, local frame = 1 + 11 = 12
      const endInfo = manager.getTransitionAtFrame(50, clips);
      expect(endInfo).not.toBeNull();
      expect(endInfo!.outgoingLocalFrame).toBe(50);
      expect(endInfo!.incomingLocalFrame).toBe(12);
    });

    it('should handle 1-frame transition (progress = 1.0)', () => {
      manager.setTransition(0, { type: 'dissolve', durationFrames: 1 });

      // After overlap: clip-2 starts at 1 + 50 - 1 = 50
      // Transition is just frame 50
      const info = manager.getTransitionAtFrame(50, clips);
      expect(info).not.toBeNull();
      expect(info!.progress).toBe(1.0);
    });

    it('should return null for empty clips array', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      expect(manager.getTransitionAtFrame(1, [])).toBeNull();
    });

    it('should handle multiple transitions between three clips', () => {
      const threeClips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),    // 50 frames
        makeClip('clip-2', 1, 1, 40, 51),   // 40 frames
        makeClip('clip-3', 2, 1, 30, 91),   // 30 frames
      ];

      manager.setTransition(0, { type: 'crossfade', durationFrames: 10 });
      manager.setTransition(1, { type: 'wipe-left', durationFrames: 8 });

      // After overlap:
      // clip-1: starts at 1
      // clip-2: starts at 1 + 50 - 10 = 41
      // clip-3: starts at 41 + 40 - 8 = 73

      // First transition (frames 41..50)
      const info1 = manager.getTransitionAtFrame(41, threeClips);
      expect(info1).not.toBeNull();
      expect(info1!.transitionType).toBe('crossfade');
      expect(info1!.outgoingClipIndex).toBe(0);
      expect(info1!.incomingClipIndex).toBe(1);

      // Second transition (frames 73..80)
      const info2 = manager.getTransitionAtFrame(73, threeClips);
      expect(info2).not.toBeNull();
      expect(info2!.transitionType).toBe('wipe-left');
      expect(info2!.outgoingClipIndex).toBe(1);
      expect(info2!.incomingClipIndex).toBe(2);

      // Between transitions (frame 55) -> not in transition
      expect(manager.getTransitionAtFrame(55, threeClips)).toBeNull();
    });

    it('should return null for a single clip (no gaps)', () => {
      const singleClip: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),
      ];
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      expect(manager.getTransitionAtFrame(1, singleClip)).toBeNull();
      expect(manager.getTransitionAtFrame(50, singleClip)).toBeNull();
    });

    it('should return null for negative frame numbers', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      expect(manager.getTransitionAtFrame(-1, clips)).toBeNull();
      expect(manager.getTransitionAtFrame(-100, clips)).toBeNull();
    });

    it('should return null for frames beyond all clips', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      expect(manager.getTransitionAtFrame(9999, clips)).toBeNull();
    });
  });

  describe('getTotalOverlap', () => {
    it('should return 0 when no transitions set', () => {
      expect(manager.getTotalOverlap()).toBe(0);
    });

    it('should sum all non-null transition durations', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      expect(manager.getTotalOverlap()).toBe(20);
    });

    it('should ignore null transitions', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(1, null);
      manager.setTransition(2, { type: 'wipe-left', durationFrames: 6 });

      expect(manager.getTotalOverlap()).toBe(18);
    });

    it('should ignore cut transitions', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(1, { type: 'cut', durationFrames: 0 });
      manager.setTransition(2, { type: 'wipe-up', durationFrames: 10 });

      expect(manager.getTotalOverlap()).toBe(22);
    });
  });

  describe('calculateOverlapAdjustedFrames', () => {
    it('should return empty array for empty clips', () => {
      expect(manager.calculateOverlapAdjustedFrames([])).toEqual([]);
    });

    it('should set first clip globalStartFrame to 1', () => {
      const clips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 100), // globalStartFrame is wrong on purpose
      ];

      const adjusted = manager.calculateOverlapAdjustedFrames(clips);
      expect(adjusted[0]!.globalStartFrame).toBe(1);
    });

    it('should calculate correct frames without transitions', () => {
      const clips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),   // 50 frames
        makeClip('clip-2', 1, 1, 40, 51),  // 40 frames
      ];

      const adjusted = manager.calculateOverlapAdjustedFrames(clips);
      expect(adjusted[0]!.globalStartFrame).toBe(1);
      expect(adjusted[1]!.globalStartFrame).toBe(51); // 1 + 50 = 51
    });

    it('should calculate correct frames with transitions', () => {
      const clips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),   // 50 frames
        makeClip('clip-2', 1, 1, 40, 51),  // 40 frames
      ];

      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      const adjusted = manager.calculateOverlapAdjustedFrames(clips);
      expect(adjusted[0]!.globalStartFrame).toBe(1);
      expect(adjusted[1]!.globalStartFrame).toBe(39); // 1 + 50 - 12 = 39
    });

    it('should handle multiple clips with transitions', () => {
      const clips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),    // 50 frames
        makeClip('clip-2', 1, 1, 40, 51),   // 40 frames
        makeClip('clip-3', 2, 1, 30, 91),   // 30 frames
      ];

      manager.setTransition(0, { type: 'crossfade', durationFrames: 10 });
      manager.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      const adjusted = manager.calculateOverlapAdjustedFrames(clips);
      expect(adjusted[0]!.globalStartFrame).toBe(1);
      expect(adjusted[1]!.globalStartFrame).toBe(41); // 1 + 50 - 10 = 41
      expect(adjusted[2]!.globalStartFrame).toBe(73); // 41 + 40 - 8 = 73
    });

    it('should not mutate original clips', () => {
      const clips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),
        makeClip('clip-2', 1, 1, 40, 51),
      ];

      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      const originalStart = clips[1]!.globalStartFrame;
      manager.calculateOverlapAdjustedFrames(clips);
      expect(clips[1]!.globalStartFrame).toBe(originalStart);
    });

    it('should treat cut transitions as zero overlap', () => {
      const clips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),
        makeClip('clip-2', 1, 1, 40, 51),
      ];

      manager.setTransition(0, { type: 'cut', durationFrames: 0 });

      const adjusted = manager.calculateOverlapAdjustedFrames(clips);
      expect(adjusted[1]!.globalStartFrame).toBe(51); // No overlap for cuts
    });

    it('should handle mixed transitions and nulls', () => {
      const clips: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 1),
        makeClip('clip-2', 1, 1, 40, 51),
        makeClip('clip-3', 2, 1, 30, 91),
      ];

      manager.setTransition(0, { type: 'crossfade', durationFrames: 10 });
      // Gap 1 has no transition (null)

      const adjusted = manager.calculateOverlapAdjustedFrames(clips);
      expect(adjusted[0]!.globalStartFrame).toBe(1);
      expect(adjusted[1]!.globalStartFrame).toBe(41); // 1 + 50 - 10 = 41
      expect(adjusted[2]!.globalStartFrame).toBe(81); // 41 + 40 - 0 = 81 (no overlap)
    });

    it('should handle single clip correctly', () => {
      const singleClip: PlaylistClip[] = [
        makeClip('clip-1', 0, 1, 50, 999), // globalStartFrame is wrong
      ];
      const adjusted = manager.calculateOverlapAdjustedFrames(singleClip);
      expect(adjusted.length).toBe(1);
      expect(adjusted[0]!.globalStartFrame).toBe(1);
    });
  });

  describe('resizeToClips', () => {
    it('should preserve existing transitions when adding clips', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      manager.resizeToClips(4); // 3 gaps

      expect(manager.getTransition(0)).toEqual({ type: 'crossfade', durationFrames: 12 });
      expect(manager.getTransition(1)).toBeNull();
      expect(manager.getTransition(2)).toBeNull();
    });

    it('should truncate extras when removing clips', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(1, { type: 'dissolve', durationFrames: 8 });
      manager.setTransition(2, { type: 'wipe-left', durationFrames: 6 });

      manager.resizeToClips(2); // 1 gap

      expect(manager.getTransitions()).toEqual([
        { type: 'crossfade', durationFrames: 12 },
      ]);
    });

    it('should result in empty array for 0 or 1 clips', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      manager.resizeToClips(1);
      expect(manager.getTransitions()).toEqual([]);

      manager.resizeToClips(0);
      expect(manager.getTransitions()).toEqual([]);
    });

    it('should handle resize to same size (no-op)', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      manager.resizeToClips(2); // Already 1 gap
      expect(manager.getTransitions()).toEqual([
        { type: 'crossfade', durationFrames: 12 },
      ]);
    });
  });

  describe('clear', () => {
    it('should remove all transitions', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      manager.clear();

      expect(manager.getTransitions()).toEqual([]);
      expect(manager.getTransition(0)).toBeNull();
      expect(manager.getTransition(1)).toBeNull();
    });

    it('should emit transitionsReset event', () => {
      const callback = vi.fn();
      manager.on('transitionsReset', callback);

      manager.clear();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should reset total overlap to 0', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.clear();

      expect(manager.getTotalOverlap()).toBe(0);
    });
  });

  describe('getState / setState', () => {
    it('should roundtrip state correctly', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setTransition(1, null);
      manager.setTransition(2, { type: 'wipe-left', durationFrames: 8 });

      const state = manager.getState();

      const manager2 = new TransitionManager();
      manager2.setState(state);

      expect(manager2.getTransitions()).toEqual([
        { type: 'crossfade', durationFrames: 12 },
        null,
        { type: 'wipe-left', durationFrames: 8 },
      ]);

      manager2.dispose();
    });

    it('should return deep copies in getState', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      const state = manager.getState();
      state[0] = { type: 'dissolve', durationFrames: 99 };

      // Original should be unchanged
      expect(manager.getTransition(0)).toEqual({ type: 'crossfade', durationFrames: 12 });
    });

    it('should accept deep copies in setState', () => {
      const state: (TransitionConfig | null)[] = [
        { type: 'crossfade', durationFrames: 12 },
      ];

      manager.setState(state);

      // Mutate original array
      state[0] = { type: 'dissolve', durationFrames: 99 };

      // Manager should be unaffected
      expect(manager.getTransition(0)).toEqual({ type: 'crossfade', durationFrames: 12 });
    });

    it('should handle empty state', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      manager.setState([]);

      expect(manager.getTransitions()).toEqual([]);
    });
  });

  describe('dispose', () => {
    it('should clear transitions', () => {
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });

      manager.dispose();

      expect(manager.getTransitions()).toEqual([]);
    });

    it('should remove all event listeners', () => {
      const callback = vi.fn();
      manager.on('transitionChanged', callback);

      manager.dispose();

      // Setting a transition after dispose should not trigger the callback
      manager.setTransition(0, { type: 'crossfade', durationFrames: 12 });
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
