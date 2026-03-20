/**
 * PlaybackAPI.step() Optimization Tests
 *
 * Verifies that step() computes the target frame directly (O(1))
 * instead of iterating one frame at a time (O(n)).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../utils/EventEmitter';
import { PlaybackAPI } from './PlaybackAPI';
import { ValidationError } from '../core/errors';

function createMockSession() {
  const session = new EventEmitter() as any;
  session._currentFrame = 50;
  session._isPlaying = false;

  Object.defineProperty(session, 'currentFrame', {
    get: () => session._currentFrame,
    set: (v: number) => {
      const duration = session.currentSource?.duration ?? 100;
      session._currentFrame = Math.max(1, Math.min(duration, Math.round(v)));
    },
  });
  Object.defineProperty(session, 'isPlaying', { get: () => session._isPlaying });

  session.currentSource = { name: 'test.mp4', duration: 100, fps: 24 };
  session.loopMode = 'once';
  session._inPoint = 1;
  session._outPoint = 100;

  Object.defineProperty(session, 'inPoint', {
    get: () => session._inPoint,
    set: (v: number) => {
      session._inPoint = v;
    },
  });
  Object.defineProperty(session, 'outPoint', {
    get: () => session._outPoint,
    set: (v: number) => {
      session._outPoint = v;
    },
  });

  session.play = vi.fn(() => {
    session._isPlaying = true;
  });
  session.pause = vi.fn(() => {
    session._isPlaying = false;
  });
  session.togglePlayback = vi.fn();
  session.goToFrame = vi.fn((frame: number) => {
    session.currentFrame = frame;
  });
  session.goToStart = vi.fn();
  session.stepForward = vi.fn(() => {
    session.currentFrame = session._currentFrame + 1;
  });
  session.stepBackward = vi.fn(() => {
    session.currentFrame = Math.max(1, session._currentFrame - 1);
  });

  session._playbackMode = 'realtime';
  Object.defineProperty(session, 'playbackMode', {
    get: () => session._playbackMode,
    set: (v: string) => {
      session._playbackMode = v;
    },
  });

  return session;
}

describe('PlaybackAPI.step() optimization', () => {
  let session: ReturnType<typeof createMockSession>;
  let api: PlaybackAPI;

  beforeEach(() => {
    session = createMockSession();
    api = new PlaybackAPI(session);
  });

  describe('single frame steps (delegates to session)', () => {
    it('STEP-001: step(1) calls session.stepForward()', () => {
      api.step(1);
      expect(session.stepForward).toHaveBeenCalledTimes(1);
      expect(session.stepBackward).not.toHaveBeenCalled();
      expect(session.goToFrame).not.toHaveBeenCalled();
    });

    it('STEP-002: step(-1) calls session.stepBackward()', () => {
      api.step(-1);
      expect(session.stepBackward).toHaveBeenCalledTimes(1);
      expect(session.stepForward).not.toHaveBeenCalled();
      expect(session.goToFrame).not.toHaveBeenCalled();
    });

    it('STEP-003: step() defaults to step(1)', () => {
      api.step();
      expect(session.stepForward).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-frame steps (O(1) direct computation)', () => {
    it('STEP-010: step(10) computes target frame directly with goToFrame', () => {
      session._currentFrame = 50;
      api.step(10);
      // Should call goToFrame(60), NOT stepForward() 10 times
      expect(session.goToFrame).toHaveBeenCalledWith(60);
      expect(session.stepForward).not.toHaveBeenCalled();
    });

    it('STEP-011: step(-10) computes target frame directly with goToFrame', () => {
      session._currentFrame = 50;
      api.step(-10);
      expect(session.goToFrame).toHaveBeenCalledWith(40);
      expect(session.stepBackward).not.toHaveBeenCalled();
    });

    it('STEP-012: step(5) from frame 50 goes to frame 55', () => {
      session._currentFrame = 50;
      api.step(5);
      expect(session.goToFrame).toHaveBeenCalledWith(55);
    });

    it('STEP-013: step(-5) from frame 50 goes to frame 45', () => {
      session._currentFrame = 50;
      api.step(-5);
      expect(session.goToFrame).toHaveBeenCalledWith(45);
    });

    it('STEP-014: large forward step is O(1) - only one goToFrame call', () => {
      session._currentFrame = 1;
      api.step(1000);
      // Clamped to 100 (duration)
      expect(session.goToFrame).toHaveBeenCalledTimes(1);
      expect(session.goToFrame).toHaveBeenCalledWith(100);
    });

    it('STEP-015: large backward step is O(1) - only one goToFrame call', () => {
      session._currentFrame = 100;
      api.step(-1000);
      // Clamped to 1
      expect(session.goToFrame).toHaveBeenCalledTimes(1);
      expect(session.goToFrame).toHaveBeenCalledWith(1);
    });
  });

  describe('boundary clamping', () => {
    it('STEP-020: step forward past end clamps to last frame', () => {
      session._currentFrame = 95;
      api.step(10);
      expect(session.goToFrame).toHaveBeenCalledWith(100);
    });

    it('STEP-021: step backward past start clamps to frame 1', () => {
      session._currentFrame = 5;
      api.step(-10);
      expect(session.goToFrame).toHaveBeenCalledWith(1);
    });

    it('STEP-022: step from frame 1 to exact end', () => {
      session._currentFrame = 1;
      api.step(99);
      expect(session.goToFrame).toHaveBeenCalledWith(100);
    });

    it('STEP-023: step from last frame to exact start', () => {
      session._currentFrame = 100;
      api.step(-99);
      expect(session.goToFrame).toHaveBeenCalledWith(1);
    });
  });

  describe('edge cases', () => {
    it('STEP-030: step(0) is a no-op', () => {
      api.step(0);
      expect(session.stepForward).not.toHaveBeenCalled();
      expect(session.stepBackward).not.toHaveBeenCalled();
      expect(session.goToFrame).not.toHaveBeenCalled();
    });

    it('STEP-031: step with fractional value rounds to nearest integer', () => {
      session._currentFrame = 50;
      api.step(2.7);
      // rounds to 3
      expect(session.goToFrame).toHaveBeenCalledWith(53);
    });

    it('STEP-032: step(-0.4) rounds to 0 which is a no-op', () => {
      api.step(-0.4);
      expect(session.stepForward).not.toHaveBeenCalled();
      expect(session.stepBackward).not.toHaveBeenCalled();
      expect(session.goToFrame).not.toHaveBeenCalled();
    });

    it('STEP-033: step with NaN throws ValidationError', () => {
      expect(() => api.step(NaN)).toThrow(ValidationError);
    });

    it('STEP-034: step with non-number throws ValidationError', () => {
      expect(() => api.step('abc' as any)).toThrow(ValidationError);
    });

    it('STEP-035: step with no source loaded (duration 0) is a no-op for multi-frame', () => {
      session.currentSource = { name: 'empty', duration: 0, fps: 24 };
      session._currentFrame = 1;
      api.step(5);
      expect(session.goToFrame).not.toHaveBeenCalled();
    });

    it('STEP-036: step(0.6) rounds to 1 and calls stepForward', () => {
      api.step(0.6);
      expect(session.stepForward).toHaveBeenCalledTimes(1);
    });

    it('STEP-037: step(-0.6) rounds to -1 and calls stepBackward', () => {
      api.step(-0.6);
      expect(session.stepBackward).toHaveBeenCalledTimes(1);
    });
  });

  describe('loop mode wrapping', () => {
    it('STEP-050: step forward past end wraps to start when loopMode=loop', () => {
      session.loopMode = 'loop';
      session._currentFrame = 95;
      api.step(10);
      // 95 + 10 = 105, wraps: ((105-1) % 100 + 100) % 100 + 1 = 5
      expect(session.goToFrame).toHaveBeenCalledWith(5);
    });

    it('STEP-051: step backward past start wraps to end when loopMode=loop', () => {
      session.loopMode = 'loop';
      session._currentFrame = 5;
      api.step(-10);
      // 5 + (-10) = -5, wraps: ((-5-1) % 100 + 100) % 100 + 1 = 95
      expect(session.goToFrame).toHaveBeenCalledWith(95);
    });

    it('STEP-052: step forward within range does not wrap in loop mode', () => {
      session.loopMode = 'loop';
      session._currentFrame = 50;
      api.step(10);
      expect(session.goToFrame).toHaveBeenCalledWith(60);
    });

    it('STEP-053: step clamps (not wraps) when loopMode=once', () => {
      session.loopMode = 'once';
      session._currentFrame = 95;
      api.step(10);
      expect(session.goToFrame).toHaveBeenCalledWith(100);
    });

    it('STEP-054: step reflects when loopMode=pingpong', () => {
      session.loopMode = 'pingpong';
      session._currentFrame = 95;
      api.step(10);
      // 95 + 10 = 105, exceeds outPoint 100 by 5, reflects back to 95
      expect(session.goToFrame).toHaveBeenCalledWith(95);
    });
  });

  describe('performance correctness', () => {
    it('STEP-040: step(100) does NOT call stepForward 100 times', () => {
      session._currentFrame = 1;
      api.step(100);
      // Must use goToFrame instead of calling stepForward in a loop
      expect(session.stepForward).not.toHaveBeenCalled();
      expect(session.goToFrame).toHaveBeenCalledTimes(1);
    });

    it('STEP-041: step(-100) does NOT call stepBackward 100 times', () => {
      session._currentFrame = 100;
      api.step(-100);
      expect(session.stepBackward).not.toHaveBeenCalled();
      expect(session.goToFrame).toHaveBeenCalledTimes(1);
    });
  });

  // =================================================================
  // Issue #205: multi-frame step respects in/out range and pingpong
  // =================================================================

  describe('in/out point range enforcement (Issue #205)', () => {
    it('STEP-060: multi-frame step forward clamps to outPoint (once mode)', () => {
      session._inPoint = 20;
      session._outPoint = 80;
      session._currentFrame = 75;
      session.loopMode = 'once';
      api.step(10);
      expect(session.goToFrame).toHaveBeenCalledWith(80);
    });

    it('STEP-061: multi-frame step backward clamps to inPoint (once mode)', () => {
      session._inPoint = 20;
      session._outPoint = 80;
      session._currentFrame = 25;
      session.loopMode = 'once';
      api.step(-10);
      expect(session.goToFrame).toHaveBeenCalledWith(20);
    });

    it('STEP-062: multi-frame step within in/out range works normally', () => {
      session._inPoint = 20;
      session._outPoint = 80;
      session._currentFrame = 50;
      session.loopMode = 'once';
      api.step(5);
      expect(session.goToFrame).toHaveBeenCalledWith(55);
    });

    it('STEP-063: multi-frame step wraps within in/out range (loop mode)', () => {
      session._inPoint = 20;
      session._outPoint = 80;
      session._currentFrame = 75;
      session.loopMode = 'loop';
      api.step(10);
      // range is [20..80], length 61. 75+10=85. (85-20)%61=4 => 20+4=24
      expect(session.goToFrame).toHaveBeenCalledWith(24);
    });

    it('STEP-064: multi-frame step backward wraps within in/out range (loop mode)', () => {
      session._inPoint = 20;
      session._outPoint = 80;
      session._currentFrame = 25;
      session.loopMode = 'loop';
      api.step(-10);
      // 25-10=15. (15-20)%61 = -5 => (-5+61)%61=56 => 20+56=76
      expect(session.goToFrame).toHaveBeenCalledWith(76);
    });

    it('STEP-065: pingpong reflects off outPoint within in/out range', () => {
      session._inPoint = 20;
      session._outPoint = 80;
      session._currentFrame = 75;
      session.loopMode = 'pingpong';
      api.step(10);
      // range [20..80], cycle=60. 75+10=85. offset=85-20=65. 65>60 => 80-(65-60)=75
      expect(session.goToFrame).toHaveBeenCalledWith(75);
    });

    it('STEP-066: pingpong reflects off inPoint within in/out range', () => {
      session._inPoint = 20;
      session._outPoint = 80;
      session._currentFrame = 25;
      session.loopMode = 'pingpong';
      api.step(-10);
      // 25-10=15. offset=15-20=-5. cycle=60. (-5 % 120 + 120)%120 = 115. 115>60 => 80-(115-60)=25
      expect(session.goToFrame).toHaveBeenCalledWith(25);
    });

    it('STEP-067: large forward step wraps correctly with in/out range (loop)', () => {
      session._inPoint = 10;
      session._outPoint = 30;
      session._currentFrame = 15;
      session.loopMode = 'loop';
      api.step(50);
      // range [10..30], length 21. 15+50=65. (65-10)%21=13 => 10+13=23
      expect(session.goToFrame).toHaveBeenCalledWith(23);
    });

    it('STEP-068: pingpong with exact boundary hit lands on boundary', () => {
      session._inPoint = 1;
      session._outPoint = 100;
      session._currentFrame = 95;
      session.loopMode = 'pingpong';
      api.step(5);
      // 95+5=100. offset=99. cycle=99. 99<=99 => 1+99=100
      expect(session.goToFrame).toHaveBeenCalledWith(100);
    });
  });

  // =================================================================
  // PlaybackMode API
  // =================================================================

  describe('playbackMode API', () => {
    it('PAPI-PAF-001: getPlaybackMode() returns default realtime', () => {
      expect(api.getPlaybackMode()).toBe('realtime');
    });

    it('PAPI-PAF-002: setPlaybackMode() sets the mode', () => {
      api.setPlaybackMode('playAllFrames');
      expect(session.playbackMode).toBe('playAllFrames');
    });

    it('PAPI-PAF-003: setPlaybackMode() with invalid value throws ValidationError', () => {
      expect(() => api.setPlaybackMode('invalid' as any)).toThrow(ValidationError);
    });

    it('PAPI-PAF-004: getPlaybackMode() returns updated value after set', () => {
      api.setPlaybackMode('playAllFrames');
      expect(api.getPlaybackMode()).toBe('playAllFrames');
    });

    it('PAPI-PAF-005: setPlaybackMode(realtime) sets back to realtime', () => {
      api.setPlaybackMode('playAllFrames');
      api.setPlaybackMode('realtime');
      expect(api.getPlaybackMode()).toBe('realtime');
    });
  });
});
