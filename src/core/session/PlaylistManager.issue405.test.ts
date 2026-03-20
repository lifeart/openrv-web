/**
 * Regression tests for issue #405:
 * Changing playlist transitions does not recalculate clip globalStartFrame values.
 *
 * Verifies that PlaylistManager subscribes to TransitionManager events
 * (transitionChanged, transitionsReset) and recalculates globalStartFrame
 * values when transitions are modified.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';
import { TransitionManager } from './TransitionManager';

describe('PlaylistManager – issue #405: transition changes recalculate globalStartFrame', () => {
  let pm: PlaylistManager;
  let tm: TransitionManager;

  beforeEach(() => {
    pm = new PlaylistManager();
    tm = new TransitionManager();
    pm.setTransitionManager(tm);

    // Add three clips: 50f, 40f, 30f
    pm.addClip(0, 'A', 1, 50); // clip-1: frames 1–50
    pm.addClip(1, 'B', 1, 40); // clip-2: frames 51–90
    pm.addClip(2, 'C', 1, 30); // clip-3: frames 91–120
  });

  afterEach(() => {
    pm.dispose();
    tm.dispose();
  });

  it('should recalculate globalStartFrame when a transition is set', () => {
    const clips = pm.getClips();
    // Before: no transitions, sequential layout
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(51);
    expect(clips[2]!.globalStartFrame).toBe(91);

    // Set a 10-frame crossfade between clip A and clip B
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    // After: clip B should start 10 frames earlier, clip C shifts accordingly
    const updatedClips = pm.getClips();
    expect(updatedClips[0]!.globalStartFrame).toBe(1);
    expect(updatedClips[1]!.globalStartFrame).toBe(41); // 1 + 50 - 10
    expect(updatedClips[2]!.globalStartFrame).toBe(81); // 41 + 40 = 81 (no transition on gap 1)
  });

  it('should recalculate when a second transition is added', () => {
    // Set transitions on both gaps
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });
    tm.setTransition(1, { type: 'crossfade', durationFrames: 5 });

    const clips = pm.getClips();
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(41); // 1 + 50 - 10
    expect(clips[2]!.globalStartFrame).toBe(76); // 41 + 40 - 5
  });

  it('should recalculate when a transition is removed (set to null)', () => {
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    let clips = pm.getClips();
    expect(clips[1]!.globalStartFrame).toBe(41);

    // Remove the transition
    tm.setTransition(0, null);

    clips = pm.getClips();
    // Should revert to sequential layout
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(51);
    expect(clips[2]!.globalStartFrame).toBe(91);
  });

  it('should recalculate when transitions are reset (cleared)', () => {
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    let clips = pm.getClips();
    expect(clips[1]!.globalStartFrame).toBe(41);

    // Clear all transitions
    tm.clear();

    clips = pm.getClips();
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(51);
    expect(clips[2]!.globalStartFrame).toBe(91);
  });

  it('should emit clipsChanged when transitions change', () => {
    const callback = vi.fn();
    pm.on('clipsChanged', callback);

    // Clear any prior calls from addClip
    callback.mockClear();

    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ clips: expect.any(Array) });
  });

  it('should emit clipsChanged when transitions are reset', () => {
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    const callback = vi.fn();
    pm.on('clipsChanged', callback);

    tm.clear();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should update total duration when transitions change', () => {
    expect(pm.getTotalDuration()).toBe(120); // 50 + 40 + 30

    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    expect(pm.getTotalDuration()).toBe(110); // 120 - 10
  });

  it('should clean up old subscriptions when setTransitionManager is called again', () => {
    const tm2 = new TransitionManager();
    pm.setTransitionManager(tm2);

    // Changing tm should no longer affect pm
    const callback = vi.fn();
    pm.on('clipsChanged', callback);

    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    // Old TM should not trigger recalculation
    expect(callback).not.toHaveBeenCalled();

    // New TM should trigger recalculation
    tm2.setTransition(0, { type: 'crossfade', durationFrames: 5 });
    expect(callback).toHaveBeenCalledTimes(1);

    const clips = pm.getClips();
    expect(clips[1]!.globalStartFrame).toBe(46); // 1 + 50 - 5

    tm2.dispose();
  });

  it('should correctly map frames after transition change', () => {
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    // Clip B starts at frame 41, but frames 41-50 overlap with clip A.
    // getClipAtFrame scans sequentially, so frame 41 maps to clip A (index 0).
    // Frame 51 is the first non-overlapping frame of clip B.
    const mappingOverlap = pm.getClipAtFrame(41);
    expect(mappingOverlap).not.toBeNull();
    expect(mappingOverlap!.clipIndex).toBe(0); // still in clip A's range

    const mappingB = pm.getClipAtFrame(51);
    expect(mappingB).not.toBeNull();
    expect(mappingB!.clipIndex).toBe(1);
    expect(mappingB!.localFrame).toBe(11); // offset 10 into clip B (inPoint 1 + 10)
  });
});
