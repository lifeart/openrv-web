import { describe, it, expect, beforeEach } from 'vitest';
import {
  PlaybackTimingController,
  TimingState,
  MAX_CONSECUTIVE_STARVATION_SKIPS,
  STARVATION_TIMEOUT_MS,
  MAX_REVERSE_SPEED,
} from './PlaybackTimingController';
import type { SubFramePosition } from '../../utils/FrameInterpolator';

/**
 * Helper to create a fresh TimingState with sensible defaults.
 */
function createTimingState(overrides: Partial<TimingState> = {}): TimingState {
  return {
    lastFrameTime: 0,
    frameAccumulator: 0,
    bufferingCount: 0,
    isBuffering: false,
    starvationStartTime: 0,
    consecutiveStarvationSkips: 0,
    fpsFrameCount: 0,
    fpsLastTime: 0,
    effectiveFps: 0,
    subFramePosition: null,
    ...overrides,
  };
}

describe('PlaybackTimingController', () => {
  let controller: PlaybackTimingController;
  let state: TimingState;

  beforeEach(() => {
    controller = new PlaybackTimingController();
    state = createTimingState();
  });

  // =================================================================
  // resetTiming / resetFpsTracking
  // =================================================================

  describe('resetTiming', () => {
    it('PTC-U001: resets frameAccumulator to 0', () => {
      state.frameAccumulator = 123.45;
      controller.resetTiming(state, 1000);
      expect(state.frameAccumulator).toBe(0);
    });

    it('PTC-U002: sets lastFrameTime to the provided timestamp', () => {
      state.lastFrameTime = 500;
      controller.resetTiming(state, 2000);
      expect(state.lastFrameTime).toBe(2000);
    });

    it('PTC-U003: uses performance.now() when no timestamp provided', () => {
      const before = performance.now();
      controller.resetTiming(state);
      const after = performance.now();
      expect(state.lastFrameTime).toBeGreaterThanOrEqual(before);
      expect(state.lastFrameTime).toBeLessThanOrEqual(after);
      expect(state.frameAccumulator).toBe(0);
    });
  });

  describe('resetFpsTracking', () => {
    it('PTC-U004: resets fpsFrameCount to 0', () => {
      state.fpsFrameCount = 42;
      controller.resetFpsTracking(state, 1000);
      expect(state.fpsFrameCount).toBe(0);
    });

    it('PTC-U005: sets fpsLastTime to the provided timestamp', () => {
      state.fpsLastTime = 100;
      controller.resetFpsTracking(state, 5000);
      expect(state.fpsLastTime).toBe(5000);
    });

    it('PTC-U006: resets effectiveFps to 0', () => {
      state.effectiveFps = 24.5;
      controller.resetFpsTracking(state, 1000);
      expect(state.effectiveFps).toBe(0);
    });

    it('PTC-U007: uses performance.now() when no timestamp provided', () => {
      const before = performance.now();
      controller.resetFpsTracking(state);
      const after = performance.now();
      expect(state.fpsLastTime).toBeGreaterThanOrEqual(before);
      expect(state.fpsLastTime).toBeLessThanOrEqual(after);
    });
  });

  // =================================================================
  // getEffectiveSpeed / getFrameDuration
  // =================================================================

  describe('getEffectiveSpeed', () => {
    it('PTC-U008: returns playbackSpeed for forward playback', () => {
      expect(controller.getEffectiveSpeed(8, 1)).toBe(8);
    });

    it('PTC-U009: caps reverse playback speed to MAX_REVERSE_SPEED', () => {
      expect(controller.getEffectiveSpeed(8, -1)).toBe(MAX_REVERSE_SPEED);
    });

    it('PTC-U010: allows reverse speed at or below MAX_REVERSE_SPEED', () => {
      expect(controller.getEffectiveSpeed(2, -1)).toBe(2);
      expect(controller.getEffectiveSpeed(MAX_REVERSE_SPEED, -1)).toBe(MAX_REVERSE_SPEED);
    });
  });

  describe('getFrameDuration', () => {
    it('PTC-U011: returns correct duration at 24fps, speed 1', () => {
      const duration = controller.getFrameDuration(24, 1);
      expect(duration).toBeCloseTo(1000 / 24, 5);
    });

    it('PTC-U012: returns halved duration at speed 2', () => {
      const duration = controller.getFrameDuration(24, 2);
      expect(duration).toBeCloseTo(1000 / 24 / 2, 5);
    });

    it('PTC-U013: returns doubled duration at speed 0.5', () => {
      const duration = controller.getFrameDuration(24, 0.5);
      expect(duration).toBeCloseTo(1000 / 24 / 0.5, 5);
    });
  });

  // =================================================================
  // accumulateFrames
  // =================================================================

  describe('accumulateFrames', () => {
    it('PTC-U014: returns 1 frame when exactly one frame duration elapsed', () => {
      const fps = 24;
      const frameDuration = 1000 / fps;
      state.lastFrameTime = 1000;

      const result = controller.accumulateFrames(state, fps, 1, 1, 1000 + frameDuration);
      expect(result.framesToAdvance).toBe(1);
      expect(result.frameDuration).toBeCloseTo(frameDuration, 5);
    });

    it('PTC-U015: returns 0 frames when sub-frame delta (delta < frameDuration)', () => {
      const fps = 24;
      const frameDuration = 1000 / fps;
      state.lastFrameTime = 1000;

      const result = controller.accumulateFrames(state, fps, 1, 1, 1000 + frameDuration * 0.5);
      expect(result.framesToAdvance).toBe(0);
      // Accumulator should hold the partial time
      expect(state.frameAccumulator).toBeCloseTo(frameDuration * 0.5, 5);
    });

    it('PTC-U016: accumulates sub-frame leftovers across calls', () => {
      const fps = 24;
      const frameDuration = 1000 / fps;
      state.lastFrameTime = 1000;

      // First call: 0.6 of a frame
      const r1 = controller.accumulateFrames(state, fps, 1, 1, 1000 + frameDuration * 0.6);
      expect(r1.framesToAdvance).toBe(0);

      // Second call: another 0.6 of a frame => total 1.2 => 1 frame advance
      const r2 = controller.accumulateFrames(state, fps, 1, 1, 1000 + frameDuration * 1.2);
      expect(r2.framesToAdvance).toBe(1);
    });

    it('PTC-U017: returns multiple frames for large deltas', () => {
      const fps = 24;
      const frameDuration = 1000 / fps;
      state.lastFrameTime = 1000;

      const result = controller.accumulateFrames(state, fps, 1, 1, 1000 + frameDuration * 3.5);
      expect(result.framesToAdvance).toBe(3);
      expect(state.frameAccumulator).toBeCloseTo(frameDuration * 0.5, 5);
    });

    it('PTC-U018: respects playback speed (2x makes frames advance twice as fast)', () => {
      const fps = 24;
      const frameDurationAt2x = (1000 / fps) / 2;
      state.lastFrameTime = 1000;

      // One normal frame duration at 2x speed should produce 2 frames
      const delta = 1000 / fps; // ~41.67ms
      const result = controller.accumulateFrames(state, fps, 2, 1, 1000 + delta);
      expect(result.framesToAdvance).toBe(2);
      expect(result.frameDuration).toBeCloseTo(frameDurationAt2x, 5);
    });

    it('PTC-U019: caps reverse playback speed to MAX_REVERSE_SPEED', () => {
      const fps = 24;
      state.lastFrameTime = 1000;

      // Request speed 8 in reverse direction; should be capped to MAX_REVERSE_SPEED
      const result = controller.accumulateFrames(state, fps, 8, -1, 1000 + 1000);
      const expectedFrameDuration = (1000 / fps) / MAX_REVERSE_SPEED;
      expect(result.frameDuration).toBeCloseTo(expectedFrameDuration, 5);
    });

    it('PTC-U020: updates lastFrameTime to now', () => {
      state.lastFrameTime = 1000;
      controller.accumulateFrames(state, 24, 1, 1, 2000);
      expect(state.lastFrameTime).toBe(2000);
    });
  });

  // =================================================================
  // accumulateDelta
  // =================================================================

  describe('accumulateDelta', () => {
    it('PTC-U021: accumulates delta into frameAccumulator', () => {
      state.lastFrameTime = 1000;
      controller.accumulateDelta(state, 24, 1, 1, 1100);
      expect(state.frameAccumulator).toBeCloseTo(100, 5);
    });

    it('PTC-U022: returns correct delta and frameDuration', () => {
      state.lastFrameTime = 1000;
      const result = controller.accumulateDelta(state, 24, 1, 1, 1100);
      expect(result.delta).toBeCloseTo(100, 5);
      expect(result.frameDuration).toBeCloseTo(1000 / 24, 5);
    });

    it('PTC-U023: updates lastFrameTime to now', () => {
      state.lastFrameTime = 1000;
      controller.accumulateDelta(state, 24, 1, 1, 2000);
      expect(state.lastFrameTime).toBe(2000);
    });

    it('PTC-U024: respects playback speed and direction', () => {
      state.lastFrameTime = 1000;
      const result = controller.accumulateDelta(state, 30, 2, -1, 1500);
      // Speed 2 in reverse -> effective speed = min(2, MAX_REVERSE_SPEED) = 2
      expect(result.frameDuration).toBeCloseTo((1000 / 30) / 2, 5);
      expect(result.delta).toBeCloseTo(500, 5);
    });
  });

  // =================================================================
  // hasAccumulatedFrame / consumeFrame / capAccumulator
  // =================================================================

  describe('hasAccumulatedFrame', () => {
    it('PTC-U025: returns true when accumulator >= frameDuration', () => {
      state.frameAccumulator = 50;
      expect(controller.hasAccumulatedFrame(state, 50)).toBe(true);
    });

    it('PTC-U026: returns false when accumulator < frameDuration', () => {
      state.frameAccumulator = 49.9;
      expect(controller.hasAccumulatedFrame(state, 50)).toBe(false);
    });

    it('PTC-U027: returns true when accumulator is exactly at boundary', () => {
      state.frameAccumulator = 41.666;
      expect(controller.hasAccumulatedFrame(state, 41.666)).toBe(true);
    });
  });

  describe('consumeFrame', () => {
    it('PTC-U028: decrements accumulator by frameDuration', () => {
      state.frameAccumulator = 100;
      controller.consumeFrame(state, 41.67);
      expect(state.frameAccumulator).toBeCloseTo(58.33, 2);
    });

    it('PTC-U029: can result in negative accumulator if misused', () => {
      state.frameAccumulator = 10;
      controller.consumeFrame(state, 50);
      expect(state.frameAccumulator).toBe(-40);
    });
  });

  describe('capAccumulator', () => {
    it('PTC-U030: caps accumulator to 2x frameDuration', () => {
      state.frameAccumulator = 500;
      controller.capAccumulator(state, 41.67);
      expect(state.frameAccumulator).toBeCloseTo(41.67 * 2, 2);
    });

    it('PTC-U031: does not change accumulator if already below cap', () => {
      state.frameAccumulator = 30;
      controller.capAccumulator(state, 41.67);
      expect(state.frameAccumulator).toBe(30);
    });

    it('PTC-U032: caps to exactly 2x frameDuration when at boundary', () => {
      const fd = 41.67;
      state.frameAccumulator = fd * 2;
      controller.capAccumulator(state, fd);
      expect(state.frameAccumulator).toBeCloseTo(fd * 2, 5);
    });
  });

  // =================================================================
  // Starvation detection
  // =================================================================

  describe('onFrameDisplayed', () => {
    it('PTC-U033: resets starvationStartTime to 0', () => {
      state.starvationStartTime = 5000;
      controller.onFrameDisplayed(state);
      expect(state.starvationStartTime).toBe(0);
    });

    it('PTC-U034: resets consecutiveStarvationSkips to 0', () => {
      state.consecutiveStarvationSkips = 5;
      controller.onFrameDisplayed(state);
      expect(state.consecutiveStarvationSkips).toBe(0);
    });
  });

  describe('beginStarvation', () => {
    it('PTC-U035: sets starvationStartTime when not already tracking', () => {
      expect(state.starvationStartTime).toBe(0);
      controller.beginStarvation(state, 3000);
      expect(state.starvationStartTime).toBe(3000);
    });

    it('PTC-U036: does not overwrite starvationStartTime if already tracking', () => {
      state.starvationStartTime = 2000;
      controller.beginStarvation(state, 5000);
      expect(state.starvationStartTime).toBe(2000);
    });

    it('PTC-U037: guard uses !== 0 so negative starvationStartTime is treated as already tracking', () => {
      // In test environments, performance.now() can be very small.
      // If starvationStartTime is negative (unlikely but possible), it should
      // still be considered "already tracking" because the check is !== 0.
      state.starvationStartTime = -1;
      controller.beginStarvation(state, 5000);
      expect(state.starvationStartTime).toBe(-1); // unchanged
    });
  });

  describe('checkStarvation', () => {
    it('PTC-U038: returns timedOut=false when under STARVATION_TIMEOUT_MS', () => {
      state.starvationStartTime = 1000;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS - 1);
      expect(result.timedOut).toBe(false);
      expect(result.shouldPause).toBe(false);
      expect(result.nearEnd).toBe(false);
    });

    it('PTC-U039: returns timedOut=false when starvationStartTime is 0 (not tracking)', () => {
      state.starvationStartTime = 0;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 10000);
      expect(result.timedOut).toBe(false);
      expect(result.starvationDurationMs).toBe(0);
    });

    it('PTC-U040: returns timedOut=true when starvation exceeds STARVATION_TIMEOUT_MS', () => {
      state.starvationStartTime = 1000;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(result.timedOut).toBe(true);
      expect(result.starvationDurationMs).toBe(STARVATION_TIMEOUT_MS + 1);
    });

    it('PTC-U041: increments consecutiveStarvationSkips on timeout', () => {
      state.starvationStartTime = 1000;
      state.consecutiveStarvationSkips = 0;
      controller.checkStarvation(state, 50, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(state.consecutiveStarvationSkips).toBe(1);
    });

    it('PTC-U042: shouldPause=true when skips >= MAX_CONSECUTIVE_STARVATION_SKIPS', () => {
      state.starvationStartTime = 1000;
      state.consecutiveStarvationSkips = MAX_CONSECUTIVE_STARVATION_SKIPS - 1;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(result.shouldPause).toBe(true);
      expect(state.consecutiveStarvationSkips).toBe(MAX_CONSECUTIVE_STARVATION_SKIPS);
    });

    it('PTC-U043: shouldPause=false when skips < MAX_CONSECUTIVE_STARVATION_SKIPS', () => {
      state.starvationStartTime = 1000;
      state.consecutiveStarvationSkips = 0;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(result.shouldPause).toBe(false);
    });

    it('PTC-U044: nearEnd detection for forward playback', () => {
      state.starvationStartTime = 1000;
      // nextFrame >= outPoint - 2 => nearEnd
      const result = controller.checkStarvation(state, 98, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(result.nearEnd).toBe(true);
    });

    it('PTC-U045: nearEnd=false for forward playback when not near end', () => {
      state.starvationStartTime = 1000;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(result.nearEnd).toBe(false);
    });

    it('PTC-U046: nearEnd detection for reverse playback', () => {
      state.starvationStartTime = 1000;
      // nextFrame <= inPoint + 2 => nearEnd (reverse)
      const result = controller.checkStarvation(state, 3, 1, 100, -1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(result.nearEnd).toBe(true);
    });

    it('PTC-U047: nearEnd=false for reverse playback when not near start', () => {
      state.starvationStartTime = 1000;
      const result = controller.checkStarvation(state, 50, 1, 100, -1, 1000 + STARVATION_TIMEOUT_MS + 1);
      expect(result.nearEnd).toBe(false);
    });

    it('PTC-U048: handles negative starvationStartTime correctly (test env with small performance.now)', () => {
      // The guard is starvationStartTime !== 0, so -5 counts as "tracking"
      state.starvationStartTime = -5;
      // now=6000 => duration = 6000 - (-5) = 6005, which exceeds STARVATION_TIMEOUT_MS (5000)
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 6000);
      expect(result.timedOut).toBe(true);
      expect(result.starvationDurationMs).toBe(6005);
    });

    it('PTC-U049: returns starvationDurationMs=0 when not tracking', () => {
      state.starvationStartTime = 0;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 5000);
      expect(result.starvationDurationMs).toBe(0);
    });

    it('PTC-U050: exactly at STARVATION_TIMEOUT_MS boundary does not timeout (uses <=)', () => {
      state.starvationStartTime = 1000;
      const result = controller.checkStarvation(state, 50, 1, 100, 1, 1000 + STARVATION_TIMEOUT_MS);
      expect(result.timedOut).toBe(false);
    });
  });

  describe('resetStarvation', () => {
    it('PTC-U051: clears starvationStartTime', () => {
      state.starvationStartTime = 5000;
      controller.resetStarvation(state);
      expect(state.starvationStartTime).toBe(0);
    });

    it('PTC-U052: clears consecutiveStarvationSkips', () => {
      state.consecutiveStarvationSkips = 10;
      controller.resetStarvation(state);
      expect(state.consecutiveStarvationSkips).toBe(0);
    });
  });

  // =================================================================
  // Buffering
  // =================================================================

  describe('incrementBuffering', () => {
    it('PTC-U053: returns true on first transition into buffering', () => {
      expect(state.isBuffering).toBe(false);
      const result = controller.incrementBuffering(state);
      expect(result).toBe(true);
      expect(state.isBuffering).toBe(true);
      expect(state.bufferingCount).toBe(1);
    });

    it('PTC-U054: returns false when already buffering', () => {
      state.isBuffering = true;
      state.bufferingCount = 1;
      const result = controller.incrementBuffering(state);
      expect(result).toBe(false);
      expect(state.bufferingCount).toBe(2);
    });

    it('PTC-U055: increments bufferingCount on each call', () => {
      controller.incrementBuffering(state);
      controller.incrementBuffering(state);
      controller.incrementBuffering(state);
      expect(state.bufferingCount).toBe(3);
    });
  });

  describe('decrementBuffering', () => {
    it('PTC-U056: returns true when counter reaches 0 from buffering state', () => {
      state.isBuffering = true;
      state.bufferingCount = 1;
      const result = controller.decrementBuffering(state);
      expect(result).toBe(true);
      expect(state.isBuffering).toBe(false);
      expect(state.bufferingCount).toBe(0);
    });

    it('PTC-U057: returns false when counter > 0 after decrement', () => {
      state.isBuffering = true;
      state.bufferingCount = 2;
      const result = controller.decrementBuffering(state);
      expect(result).toBe(false);
      expect(state.bufferingCount).toBe(1);
      expect(state.isBuffering).toBe(true);
    });

    it('PTC-U058: does not go below 0', () => {
      state.bufferingCount = 0;
      controller.decrementBuffering(state);
      expect(state.bufferingCount).toBe(0);
    });

    it('PTC-U059: returns false when not buffering and counter is 0', () => {
      state.isBuffering = false;
      state.bufferingCount = 0;
      const result = controller.decrementBuffering(state);
      expect(result).toBe(false);
    });
  });

  describe('resetBuffering', () => {
    it('PTC-U060: clears bufferingCount', () => {
      state.bufferingCount = 5;
      controller.resetBuffering(state);
      expect(state.bufferingCount).toBe(0);
    });

    it('PTC-U061: clears starvationStartTime', () => {
      state.starvationStartTime = 1234;
      controller.resetBuffering(state);
      expect(state.starvationStartTime).toBe(0);
    });

    it('PTC-U062: clears consecutiveStarvationSkips', () => {
      state.consecutiveStarvationSkips = 3;
      controller.resetBuffering(state);
      expect(state.consecutiveStarvationSkips).toBe(0);
    });

    it('PTC-U063: returns true if was buffering', () => {
      state.isBuffering = true;
      state.bufferingCount = 2;
      const result = controller.resetBuffering(state);
      expect(result).toBe(true);
      expect(state.isBuffering).toBe(false);
    });

    it('PTC-U064: returns false if was not buffering', () => {
      state.isBuffering = false;
      const result = controller.resetBuffering(state);
      expect(result).toBe(false);
    });
  });

  // =================================================================
  // trackFrameAdvance
  // =================================================================

  describe('trackFrameAdvance', () => {
    it('PTC-U065: increments fpsFrameCount', () => {
      state.fpsLastTime = 1000;
      controller.trackFrameAdvance(state, 1010);
      expect(state.fpsFrameCount).toBe(1);
      controller.trackFrameAdvance(state, 1020);
      expect(state.fpsFrameCount).toBe(2);
    });

    it('PTC-U066: does not update effectiveFps before 500ms elapsed', () => {
      state.fpsLastTime = 1000;
      state.effectiveFps = 0;
      controller.trackFrameAdvance(state, 1100);
      expect(state.effectiveFps).toBe(0);
    });

    it('PTC-U067: updates effectiveFps after 500ms elapsed', () => {
      state.fpsLastTime = 1000;
      // Simulate 12 frames over 500ms = 24fps
      for (let i = 1; i <= 11; i++) {
        controller.trackFrameAdvance(state, 1000 + i * 40);
      }
      // 11 frames in 440ms - not yet 500ms, fps should still be 0
      expect(state.effectiveFps).toBe(0);

      // 12th frame at exactly 500ms
      const result = controller.trackFrameAdvance(state, 1500);
      expect(state.effectiveFps).toBeGreaterThan(0);
      // 12 frames / 500ms * 1000 = 24fps, rounded to 1 decimal
      expect(result).toBe(state.effectiveFps);
    });

    it('PTC-U068: resets fpsFrameCount and fpsLastTime after updating fps', () => {
      state.fpsLastTime = 1000;
      for (let i = 0; i < 12; i++) {
        controller.trackFrameAdvance(state, 1000 + (i + 1) * 42);
      }
      // After 504ms worth of frames, fps update should have fired
      // fpsFrameCount should be reset to 0 and fpsLastTime updated
      expect(state.fpsFrameCount).toBe(0);
      expect(state.fpsLastTime).toBeGreaterThan(1000);
    });

    it('PTC-U069: computes correct effectiveFps value', () => {
      state.fpsLastTime = 0;
      // 24 frames in exactly 1000ms
      for (let i = 1; i <= 24; i++) {
        controller.trackFrameAdvance(state, i * (1000 / 24));
      }
      // At some point during these calls, fps should have been updated
      // The first update happens at >= 500ms
      expect(state.effectiveFps).toBeGreaterThan(0);
    });
  });

  // =================================================================
  // computeNextFrame
  // =================================================================

  describe('computeNextFrame', () => {
    const inPoint = 1;
    const outPoint = 100;

    it('PTC-U070: normal forward advance (no boundary)', () => {
      expect(controller.computeNextFrame(50, 1, inPoint, outPoint, 'loop')).toBe(51);
    });

    it('PTC-U071: normal backward advance (no boundary)', () => {
      expect(controller.computeNextFrame(50, -1, inPoint, outPoint, 'loop')).toBe(49);
    });

    // Forward past outPoint
    it('PTC-U072: forward past outPoint with loop mode', () => {
      expect(controller.computeNextFrame(outPoint, 1, inPoint, outPoint, 'loop')).toBe(inPoint);
    });

    it('PTC-U073: forward past outPoint with once mode', () => {
      expect(controller.computeNextFrame(outPoint, 1, inPoint, outPoint, 'once')).toBe(outPoint);
    });

    it('PTC-U074: forward past outPoint with pingpong mode', () => {
      expect(controller.computeNextFrame(outPoint, 1, inPoint, outPoint, 'pingpong')).toBe(outPoint - 1);
    });

    // Backward past inPoint
    it('PTC-U075: backward past inPoint with loop mode', () => {
      expect(controller.computeNextFrame(inPoint, -1, inPoint, outPoint, 'loop')).toBe(outPoint);
    });

    it('PTC-U076: backward past inPoint with once mode', () => {
      expect(controller.computeNextFrame(inPoint, -1, inPoint, outPoint, 'once')).toBe(inPoint);
    });

    it('PTC-U077: backward past inPoint with pingpong mode', () => {
      expect(controller.computeNextFrame(inPoint, -1, inPoint, outPoint, 'pingpong')).toBe(inPoint + 1);
    });

    // Exact boundary cases
    it('PTC-U078: nextFrame exactly equals outPoint is not past boundary', () => {
      // currentFrame = outPoint - 1, direction = 1 => nextFrame = outPoint => within range
      expect(controller.computeNextFrame(outPoint - 1, 1, inPoint, outPoint, 'loop')).toBe(outPoint);
    });

    it('PTC-U079: nextFrame exactly equals inPoint is not past boundary', () => {
      // currentFrame = inPoint + 1, direction = -1 => nextFrame = inPoint => within range
      expect(controller.computeNextFrame(inPoint + 1, -1, inPoint, outPoint, 'loop')).toBe(inPoint);
    });

    it('PTC-U080: single-frame range (inPoint === outPoint)', () => {
      // loop mode: nextFrame > outPoint => inPoint
      expect(controller.computeNextFrame(5, 1, 5, 5, 'loop')).toBe(5);
      // reverse: nextFrame < inPoint => outPoint
      expect(controller.computeNextFrame(5, -1, 5, 5, 'loop')).toBe(5);
    });

    it('PTC-U081: two-frame range boundary behavior', () => {
      // inPoint=1, outPoint=2
      expect(controller.computeNextFrame(2, 1, 1, 2, 'loop')).toBe(1);
      expect(controller.computeNextFrame(1, -1, 1, 2, 'loop')).toBe(2);
      expect(controller.computeNextFrame(2, 1, 1, 2, 'pingpong')).toBe(1);
    });
  });

  // =================================================================
  // updateSubFramePosition
  // =================================================================

  describe('updateSubFramePosition', () => {
    const inPoint = 1;
    const outPoint = 100;
    const fps = 24;
    const frameDuration = 1000 / fps;

    it('PTC-U082: returns null when clearing (interpolation disabled, was non-null)', () => {
      state.subFramePosition = { baseFrame: 10, nextFrame: 11, ratio: 0.5 };
      const result = controller.updateSubFramePosition(
        state, false, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).toBeNull();
      expect(state.subFramePosition).toBeNull();
    });

    it('PTC-U083: returns undefined when interpolation disabled and already null', () => {
      state.subFramePosition = null;
      const result = controller.updateSubFramePosition(
        state, false, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).toBeUndefined();
    });

    it('PTC-U084: returns null when clearing (speed >= 1, was non-null)', () => {
      state.subFramePosition = { baseFrame: 10, nextFrame: 11, ratio: 0.5 };
      const result = controller.updateSubFramePosition(
        state, true, 1, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).toBeNull();
      expect(state.subFramePosition).toBeNull();
    });

    it('PTC-U085: returns undefined when speed >= 1 and already null', () => {
      state.subFramePosition = null;
      const result = controller.updateSubFramePosition(
        state, true, 2, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).toBeUndefined();
    });

    it('PTC-U086: returns SubFramePosition when position changed (slow-motion)', () => {
      state.frameAccumulator = frameDuration * 0.5;
      state.subFramePosition = null;
      const result = controller.updateSubFramePosition(
        state, true, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
      const pos = result as SubFramePosition;
      expect(pos.baseFrame).toBe(10);
      expect(pos.nextFrame).toBe(11);
      expect(pos.ratio).toBeCloseTo(0.5, 2);
    });

    it('PTC-U087: correctly computes ratio from accumulator', () => {
      state.frameAccumulator = frameDuration * 0.25;
      state.subFramePosition = null;
      const result = controller.updateSubFramePosition(
        state, true, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      ) as SubFramePosition;
      expect(result.ratio).toBeCloseTo(0.25, 2);
    });

    it('PTC-U088: clamps ratio to [0, 1]', () => {
      // Accumulator larger than frameDuration should clamp ratio to 1
      state.frameAccumulator = frameDuration * 2;
      state.subFramePosition = null;
      const result = controller.updateSubFramePosition(
        state, true, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      ) as SubFramePosition;
      expect(result.ratio).toBe(1);

      // Negative accumulator should clamp ratio to 0
      state.frameAccumulator = -10;
      state.subFramePosition = null;
      const result2 = controller.updateSubFramePosition(
        state, true, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      ) as SubFramePosition;
      expect(result2.ratio).toBe(0);
    });

    it('PTC-U089: returns undefined when no meaningful change (ratio diff <= 0.005)', () => {
      state.frameAccumulator = frameDuration * 0.5;
      state.subFramePosition = { baseFrame: 10, nextFrame: 11, ratio: 0.5 };
      const result = controller.updateSubFramePosition(
        state, true, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).toBeUndefined();
    });

    it('PTC-U090: returns new position when ratio changes meaningfully (> 0.005)', () => {
      state.subFramePosition = { baseFrame: 10, nextFrame: 11, ratio: 0.5 };
      // Set accumulator to produce ratio significantly different from 0.5
      state.frameAccumulator = frameDuration * 0.7;
      const result = controller.updateSubFramePosition(
        state, true, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).not.toBeUndefined();
      expect(result).not.toBeNull();
      expect((result as SubFramePosition).ratio).toBeCloseTo(0.7, 2);
    });

    it('PTC-U091: returns new position when baseFrame changes', () => {
      state.frameAccumulator = frameDuration * 0.5;
      state.subFramePosition = { baseFrame: 9, nextFrame: 10, ratio: 0.5 };
      const result = controller.updateSubFramePosition(
        state, true, 0.5, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).not.toBeUndefined();
      expect(result).not.toBeNull();
      expect((result as SubFramePosition).baseFrame).toBe(10);
    });

    it('PTC-U092: computes nextFrame using computeNextFrame (respects loop mode)', () => {
      state.frameAccumulator = frameDuration * 0.5;
      state.subFramePosition = null;
      const result = controller.updateSubFramePosition(
        state, true, 0.5, outPoint, 1, inPoint, outPoint, 'loop', frameDuration,
      ) as SubFramePosition;
      // At outPoint going forward with loop => nextFrame should be inPoint
      expect(result.baseFrame).toBe(outPoint);
      expect(result.nextFrame).toBe(inPoint);
    });

    it('PTC-U093: only active during slow-motion (speed < 1)', () => {
      state.frameAccumulator = frameDuration * 0.5;
      state.subFramePosition = null;
      // Speed exactly 1 should not produce sub-frame position
      const result = controller.updateSubFramePosition(
        state, true, 1, 10, 1, inPoint, outPoint, 'loop', frameDuration,
      );
      expect(result).toBeUndefined();
      expect(state.subFramePosition).toBeNull();
    });
  });

  // =================================================================
  // clearSubFramePosition
  // =================================================================

  describe('clearSubFramePosition', () => {
    it('PTC-U094: returns true if was non-null', () => {
      state.subFramePosition = { baseFrame: 10, nextFrame: 11, ratio: 0.5 };
      const result = controller.clearSubFramePosition(state);
      expect(result).toBe(true);
      expect(state.subFramePosition).toBeNull();
    });

    it('PTC-U095: returns false if already null', () => {
      state.subFramePosition = null;
      const result = controller.clearSubFramePosition(state);
      expect(result).toBe(false);
      expect(state.subFramePosition).toBeNull();
    });
  });

  // =================================================================
  // Exported constants
  // =================================================================

  describe('exported constants', () => {
    it('PTC-U096: MAX_CONSECUTIVE_STARVATION_SKIPS is 2', () => {
      expect(MAX_CONSECUTIVE_STARVATION_SKIPS).toBe(2);
    });

    it('PTC-U097: STARVATION_TIMEOUT_MS is 5000', () => {
      expect(STARVATION_TIMEOUT_MS).toBe(5000);
    });

    it('PTC-U098: MAX_REVERSE_SPEED is 4', () => {
      expect(MAX_REVERSE_SPEED).toBe(4);
    });
  });
});
