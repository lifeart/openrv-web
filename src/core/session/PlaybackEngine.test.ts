import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaybackEngine, type PlaybackEngineHost } from './PlaybackEngine';
import { PLAYBACK_SPEED_PRESETS } from '../../config/PlaybackConfig';
import { createMockPlaybackEngineHost } from '../../../test/mocks';

describe('PlaybackEngine', () => {
  let engine: PlaybackEngine;
  let host: PlaybackEngineHost;

  beforeEach(() => {
    engine = new PlaybackEngine();
    host = createMockPlaybackEngineHost(100);
    engine.setHost(host);
    engine.setOutPointInternal(100);
  });

  // ---------------------------------------------------------------
  // Frame & range accessors
  // ---------------------------------------------------------------
  describe('Frame & range accessors', () => {
    it('PE-001: currentFrame defaults to 1', () => {
      expect(engine.currentFrame).toBe(1);
    });

    it('PE-002: currentFrame setter clamps to minimum 1', () => {
      engine.currentFrame = -5;
      expect(engine.currentFrame).toBe(1);
    });

    it('PE-003: currentFrame setter clamps to maximum duration', () => {
      engine.currentFrame = 200;
      expect(engine.currentFrame).toBe(100);
    });

    it('PE-004: currentFrame setter rounds to integer', () => {
      engine.currentFrame = 5.7;
      expect(engine.currentFrame).toBe(6);
    });

    it('PE-005: currentFrame setter rounds 0.5 up', () => {
      engine.currentFrame = 5.5;
      expect(engine.currentFrame).toBe(6);
    });

    it('PE-006: currentFrame setter emits frameChanged', () => {
      const listener = vi.fn();
      engine.on('frameChanged', listener);
      engine.currentFrame = 50;
      expect(listener).toHaveBeenCalledWith(50);
    });

    it('PE-007: currentFrame setter does not emit if value unchanged', () => {
      engine.currentFrame = 1;
      const listener = vi.fn();
      engine.on('frameChanged', listener);
      engine.currentFrame = 1;
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-008: currentFrame defaults to 1 when no host is set', () => {
      const noHostEngine = new PlaybackEngine();
      noHostEngine.currentFrame = 50;
      // duration defaults to 1, so clamped to 1
      expect(noHostEngine.currentFrame).toBe(1);
    });

    it('PE-009: fps defaults to 24', () => {
      expect(engine.fps).toBe(24);
    });

    it('PE-010: fps setter clamps minimum to 1', () => {
      engine.fps = 0;
      expect(engine.fps).toBe(1);
    });

    it('PE-011: fps setter clamps maximum to 120', () => {
      engine.fps = 200;
      expect(engine.fps).toBe(120);
    });

    it('PE-012: fps setter emits fpsChanged', () => {
      const listener = vi.fn();
      engine.on('fpsChanged', listener);
      engine.fps = 30;
      expect(listener).toHaveBeenCalledWith(30);
    });

    it('PE-013: fps setter does not emit if value unchanged', () => {
      const listener = vi.fn();
      engine.on('fpsChanged', listener);
      engine.fps = 24; // same as default
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-014: frameIncrement defaults to 1', () => {
      expect(engine.frameIncrement).toBe(1);
    });

    it('PE-015: frameIncrement setter clamps to [1, 100]', () => {
      engine.frameIncrement = 0;
      expect(engine.frameIncrement).toBe(1);
      engine.frameIncrement = 150;
      expect(engine.frameIncrement).toBe(100);
    });

    it('PE-016: frameIncrement setter emits frameIncrementChanged', () => {
      const listener = vi.fn();
      engine.on('frameIncrementChanged', listener);
      engine.frameIncrement = 5;
      expect(listener).toHaveBeenCalledWith(5);
    });

    it('PE-017: frameCount returns outPoint - inPoint + 1', () => {
      engine.setInOutRange(10, 50);
      expect(engine.frameCount).toBe(41);
    });

    it('PE-018: frameCount returns 1 for single-frame range', () => {
      engine.setInOutRange(25, 25);
      expect(engine.frameCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // Playback speed
  // ---------------------------------------------------------------
  describe('Playback speed', () => {
    it('PE-020: playbackSpeed defaults to 1', () => {
      expect(engine.playbackSpeed).toBe(1);
    });

    it('PE-021: playbackSpeed clamps minimum to 0.1', () => {
      engine.playbackSpeed = 0.01;
      expect(engine.playbackSpeed).toBe(0.1);
    });

    it('PE-022: playbackSpeed clamps maximum to 8', () => {
      engine.playbackSpeed = 16;
      expect(engine.playbackSpeed).toBe(8);
    });

    it('PE-023: playbackSpeed emits playbackSpeedChanged', () => {
      const listener = vi.fn();
      engine.on('playbackSpeedChanged', listener);
      engine.playbackSpeed = 2;
      expect(listener).toHaveBeenCalledWith(2);
    });

    it('PE-024: playbackSpeed does not emit if value unchanged', () => {
      const listener = vi.fn();
      engine.on('playbackSpeedChanged', listener);
      engine.playbackSpeed = 1;
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-025: increaseSpeed cycles to next preset', () => {
      // default speed is 1, next preset is 2
      engine.increaseSpeed();
      expect(engine.playbackSpeed).toBe(2);
    });

    it('PE-026: increaseSpeed does nothing at max preset', () => {
      engine.playbackSpeed = 8;
      engine.increaseSpeed();
      expect(engine.playbackSpeed).toBe(8);
    });

    it('PE-027: decreaseSpeed cycles to previous preset', () => {
      engine.playbackSpeed = 2;
      engine.decreaseSpeed();
      expect(engine.playbackSpeed).toBe(1);
    });

    it('PE-028: decreaseSpeed does nothing at min preset', () => {
      engine.playbackSpeed = 0.1;
      engine.decreaseSpeed();
      expect(engine.playbackSpeed).toBe(0.1);
    });

    it('PE-029: increaseSpeed from non-preset value jumps to next preset', () => {
      engine.playbackSpeed = 0.75;
      engine.increaseSpeed();
      expect(engine.playbackSpeed).toBe(1);
    });

    it('PE-030: decreaseSpeed from non-preset value jumps to previous preset', () => {
      engine.playbackSpeed = 3;
      engine.decreaseSpeed();
      expect(engine.playbackSpeed).toBe(2);
    });

    it('PE-031: resetSpeed sets speed back to 1', () => {
      engine.playbackSpeed = 4;
      engine.resetSpeed();
      expect(engine.playbackSpeed).toBe(1);
    });

    it('PE-032: resetSpeed emits playbackSpeedChanged', () => {
      engine.playbackSpeed = 4;
      const listener = vi.fn();
      engine.on('playbackSpeedChanged', listener);
      engine.resetSpeed();
      expect(listener).toHaveBeenCalledWith(1);
    });

    it('PE-033: full speed preset cycle up and back', () => {
      const speeds: number[] = [engine.playbackSpeed];
      for (let i = 0; i < PLAYBACK_SPEED_PRESETS.length; i++) {
        engine.increaseSpeed();
        speeds.push(engine.playbackSpeed);
      }
      // Should have hit all presets from 1 upward
      expect(speeds).toContain(1);
      expect(speeds).toContain(8);
    });
  });

  // ---------------------------------------------------------------
  // Play/pause lifecycle
  // ---------------------------------------------------------------
  describe('Play/pause lifecycle', () => {
    it('PE-040: play() sets isPlaying to true', () => {
      engine.play();
      expect(engine.isPlaying).toBe(true);
    });

    it('PE-041: play() emits playbackChanged with true', () => {
      const listener = vi.fn();
      engine.on('playbackChanged', listener);
      engine.play();
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('PE-042: play() is idempotent when already playing', () => {
      const listener = vi.fn();
      engine.play();
      engine.on('playbackChanged', listener);
      engine.play();
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-043: pause() sets isPlaying to false', () => {
      engine.play();
      engine.pause();
      expect(engine.isPlaying).toBe(false);
    });

    it('PE-044: pause() emits playbackChanged with false', () => {
      engine.play();
      const listener = vi.fn();
      engine.on('playbackChanged', listener);
      engine.pause();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('PE-045: pause() is idempotent when already paused', () => {
      const listener = vi.fn();
      engine.on('playbackChanged', listener);
      engine.pause();
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-046: togglePlayback() starts playing from paused', () => {
      engine.togglePlayback();
      expect(engine.isPlaying).toBe(true);
    });

    it('PE-047: togglePlayback() pauses from playing', () => {
      engine.play();
      engine.togglePlayback();
      expect(engine.isPlaying).toBe(false);
    });

    it('PE-048: togglePlayback() emits playbackChanged', () => {
      const listener = vi.fn();
      engine.on('playbackChanged', listener);
      engine.togglePlayback();
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('PE-049: play() enables audio sync for forward direction in realtime mode', () => {
      engine.play();
      expect(host.setAudioSyncEnabled).toHaveBeenCalledWith(true);
    });

    it('PE-050: play() disables audio sync in playAllFrames mode', () => {
      engine.playbackMode = 'playAllFrames';
      engine.play();
      expect(host.setAudioSyncEnabled).toHaveBeenCalledWith(false);
    });

    it('PE-051: pause() clears pending play promise', () => {
      engine.play();
      engine.setPendingPlayPromise(Promise.resolve());
      engine.pause();
      expect(engine.pendingPlayPromise).toBeNull();
    });

    it('PE-052: play() guards against concurrent calls with pending promise', () => {
      engine.setPendingPlayPromise(Promise.resolve());
      const listener = vi.fn();
      engine.on('playbackChanged', listener);
      engine.play();
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-053: pause() resets buffering state', () => {
      engine.play();
      const listener = vi.fn();
      engine.on('buffering', listener);
      engine.pause();
      // buffering false may or may not be emitted depending on internal state
      expect(engine.isBuffering).toBe(false);
    });

    it('PE-054: play() clears pending fetch frame on pause', () => {
      engine.play();
      engine.pause();
      expect(engine.pendingFetchFrame).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Play direction
  // ---------------------------------------------------------------
  describe('Play direction', () => {
    it('PE-060: playDirection defaults to 1 (forward)', () => {
      expect(engine.playDirection).toBe(1);
    });

    it('PE-061: togglePlayDirection reverses to -1', () => {
      engine.togglePlayDirection();
      expect(engine.playDirection).toBe(-1);
    });

    it('PE-062: togglePlayDirection toggles back to 1', () => {
      engine.togglePlayDirection();
      engine.togglePlayDirection();
      expect(engine.playDirection).toBe(1);
    });

    it('PE-063: togglePlayDirection emits playDirectionChanged', () => {
      const listener = vi.fn();
      engine.on('playDirectionChanged', listener);
      engine.togglePlayDirection();
      expect(listener).toHaveBeenCalledWith(-1);
    });

    it('PE-064: togglePlayDirection sets audio sync based on direction', () => {
      engine.togglePlayDirection(); // now reverse
      expect(host.setAudioSyncEnabled).toHaveBeenCalledWith(false);
    });

    it('PE-065: togglePlayDirection enables audio sync for forward', () => {
      engine.togglePlayDirection(); // reverse
      (host.setAudioSyncEnabled as ReturnType<typeof vi.fn>).mockClear();
      engine.togglePlayDirection(); // forward again
      expect(host.setAudioSyncEnabled).toHaveBeenCalledWith(true);
    });

    it('PE-066: play() disables audio sync when direction is reverse', () => {
      engine.setPlayDirectionInternal(-1);
      engine.play();
      expect(host.setAudioSyncEnabled).toHaveBeenCalledWith(false);
    });

    it('PE-067: setPlayDirectionInternal sets direction without event', () => {
      const listener = vi.fn();
      engine.on('playDirectionChanged', listener);
      engine.setPlayDirectionInternal(-1);
      expect(engine.playDirection).toBe(-1);
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-068: effectiveFps returns 0 when not playing', () => {
      expect(engine.effectiveFps).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Frame navigation
  // ---------------------------------------------------------------
  describe('Frame navigation', () => {
    it('PE-070: stepForward pauses and advances by frameIncrement', () => {
      engine.play();
      engine.currentFrame = 10;
      engine.stepForward();
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentFrame).toBe(11);
    });

    it('PE-071: stepBackward pauses and goes back by frameIncrement', () => {
      engine.play();
      engine.currentFrame = 10;
      engine.stepBackward();
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentFrame).toBe(9);
    });

    it('PE-072: stepForward respects frameIncrement > 1', () => {
      engine.frameIncrement = 5;
      engine.currentFrame = 10;
      engine.stepForward();
      expect(engine.currentFrame).toBe(15);
    });

    it('PE-073: stepBackward respects frameIncrement > 1', () => {
      engine.frameIncrement = 5;
      engine.currentFrame = 10;
      engine.stepBackward();
      expect(engine.currentFrame).toBe(5);
    });

    it('PE-074: goToFrame sets the frame', () => {
      engine.goToFrame(50);
      expect(engine.currentFrame).toBe(50);
    });

    it('PE-075: goToFrame clamps to valid range', () => {
      engine.goToFrame(200);
      expect(engine.currentFrame).toBe(100);
    });

    it('PE-076: goToStart sets frame to inPoint', () => {
      engine.setInPointInternal(10);
      engine.goToStart();
      expect(engine.currentFrame).toBe(10);
    });

    it('PE-077: goToEnd sets frame to outPoint', () => {
      engine.goToEnd();
      expect(engine.currentFrame).toBe(100);
    });

    it('PE-078: stepForward clamps at outPoint in once mode', () => {
      engine.loopMode = 'once';
      engine.currentFrame = 100;
      engine.stepForward();
      expect(engine.currentFrame).toBe(100);
    });
  });

  // ---------------------------------------------------------------
  // In/out points (non-overlapping with setInOutRange tests)
  // ---------------------------------------------------------------
  describe('In/out points', () => {
    it('PE-080: setInPoint uses current frame when no arg', () => {
      engine.currentFrame = 25;
      engine.setInPoint();
      expect(engine.inPoint).toBe(25);
    });

    it('PE-081: setInPoint clamps to outPoint max', () => {
      engine.setInPoint(150);
      expect(engine.inPoint).toBe(100); // clamped to outPoint
    });

    it('PE-082: setInPoint emits inOutChanged', () => {
      const listener = vi.fn();
      engine.on('inOutChanged', listener);
      engine.setInPoint(10);
      expect(listener).toHaveBeenCalledWith({ inPoint: 10, outPoint: 100 });
    });

    it('PE-083: setInPoint adjusts currentFrame if below new inPoint', () => {
      engine.currentFrame = 5;
      engine.setInPoint(10);
      expect(engine.currentFrame).toBe(10);
    });

    it('PE-084: setOutPoint uses current frame when no arg', () => {
      engine.currentFrame = 75;
      engine.setOutPoint();
      expect(engine.outPoint).toBe(75);
    });

    it('PE-085: setOutPoint clamps to inPoint min', () => {
      engine.setInPointInternal(20);
      engine.setOutPoint(10);
      expect(engine.outPoint).toBe(20);
    });

    it('PE-086: setOutPoint emits inOutChanged', () => {
      const listener = vi.fn();
      engine.on('inOutChanged', listener);
      engine.setOutPoint(50);
      expect(listener).toHaveBeenCalledWith({ inPoint: 1, outPoint: 50 });
    });

    it('PE-087: setOutPoint adjusts currentFrame if above new outPoint', () => {
      engine.currentFrame = 80;
      engine.setOutPoint(50);
      expect(engine.currentFrame).toBe(50);
    });
  });

  // ---------------------------------------------------------------
  // Loop modes
  // ---------------------------------------------------------------
  describe('Loop modes', () => {
    it('PE-090: loopMode defaults to loop', () => {
      expect(engine.loopMode).toBe('loop');
    });

    it('PE-091: loopMode setter emits loopModeChanged', () => {
      const listener = vi.fn();
      engine.on('loopModeChanged', listener);
      engine.loopMode = 'once';
      expect(listener).toHaveBeenCalledWith('once');
    });

    it('PE-092: loopMode setter does not emit if unchanged', () => {
      const listener = vi.fn();
      engine.on('loopModeChanged', listener);
      engine.loopMode = 'loop';
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-093: loop mode wraps forward past outPoint', () => {
      engine.setInOutRange(1, 10);
      engine.currentFrame = 10;
      engine.loopMode = 'loop';
      engine.advanceFrame(1);
      expect(engine.currentFrame).toBe(1);
    });

    it('PE-094: loop mode wraps backward past inPoint', () => {
      engine.setInOutRange(1, 10);
      engine.currentFrame = 1;
      engine.loopMode = 'loop';
      engine.advanceFrame(-1);
      expect(engine.currentFrame).toBe(10);
    });

    it('PE-095: once mode pauses at outPoint', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'once';
      engine.play();
      engine.currentFrame = 10;
      engine.advanceFrame(1);
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentFrame).toBe(10);
    });

    it('PE-096: once mode pauses at inPoint (reverse)', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'once';
      engine.play();
      engine.currentFrame = 1;
      engine.advanceFrame(-1);
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentFrame).toBe(1);
    });

    it('PE-097: pingpong reverses direction at outPoint', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'pingpong';
      engine.currentFrame = 10;
      engine.advanceFrame(1);
      expect(engine.playDirection).toBe(-1);
      expect(engine.currentFrame).toBe(9);
    });

    it('PE-098: pingpong reverses direction at inPoint', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'pingpong';
      engine.setPlayDirectionInternal(-1);
      engine.currentFrame = 1;
      engine.advanceFrame(-1);
      expect(engine.playDirection).toBe(1);
      expect(engine.currentFrame).toBe(2);
    });

    it('PE-099: pingpong emits playDirectionChanged', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'pingpong';
      engine.currentFrame = 10;
      const listener = vi.fn();
      engine.on('playDirectionChanged', listener);
      engine.advanceFrame(1);
      expect(listener).toHaveBeenCalledWith(-1);
    });

    it('PE-100: resetInOutPoints resets to full range', () => {
      engine.setInOutRange(20, 50);
      engine.resetInOutPoints();
      expect(engine.inPoint).toBe(1);
      expect(engine.outPoint).toBe(100);
      expect(engine.currentFrame).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // Playback mode
  // ---------------------------------------------------------------
  describe('Playback mode', () => {
    it('PE-111: playbackMode defaults to realtime', () => {
      expect(engine.playbackMode).toBe('realtime');
    });

    it('PE-112: playbackMode setter emits playbackModeChanged', () => {
      const listener = vi.fn();
      engine.on('playbackModeChanged', listener);
      engine.playbackMode = 'playAllFrames';
      expect(listener).toHaveBeenCalledWith('playAllFrames');
    });

    it('PE-113: playbackMode setter does not emit if unchanged', () => {
      const listener = vi.fn();
      engine.on('playbackModeChanged', listener);
      engine.playbackMode = 'realtime';
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-114: togglePlaybackMode switches realtime to playAllFrames', () => {
      engine.togglePlaybackMode();
      expect(engine.playbackMode).toBe('playAllFrames');
    });

    it('PE-115: togglePlaybackMode switches playAllFrames to realtime', () => {
      engine.playbackMode = 'playAllFrames';
      engine.togglePlaybackMode();
      expect(engine.playbackMode).toBe('realtime');
    });

    it('PE-116: switching to playAllFrames while playing disables audio sync', () => {
      engine.play();
      (host.setAudioSyncEnabled as ReturnType<typeof vi.fn>).mockClear();
      engine.playbackMode = 'playAllFrames';
      expect(host.setAudioSyncEnabled).toHaveBeenCalledWith(false);
    });

    it('PE-117: switching to realtime while playing re-enables audio sync for forward', () => {
      engine.play();
      engine.playbackMode = 'playAllFrames';
      (host.setAudioSyncEnabled as ReturnType<typeof vi.fn>).mockClear();
      engine.playbackMode = 'realtime';
      expect(host.setAudioSyncEnabled).toHaveBeenCalledWith(true);
    });

    it('PE-118: setPlaybackModeInternal bypasses events', () => {
      const listener = vi.fn();
      engine.on('playbackModeChanged', listener);
      engine.setPlaybackModeInternal('playAllFrames');
      expect(engine.playbackMode).toBe('playAllFrames');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------
  describe('Interpolation', () => {
    it('PE-120: interpolationEnabled defaults to false', () => {
      expect(engine.interpolationEnabled).toBe(false);
    });

    it('PE-121: interpolationEnabled setter emits interpolationEnabledChanged', () => {
      const listener = vi.fn();
      engine.on('interpolationEnabledChanged', listener);
      engine.interpolationEnabled = true;
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('PE-122: interpolationEnabled setter does not emit if unchanged', () => {
      const listener = vi.fn();
      engine.on('interpolationEnabledChanged', listener);
      engine.interpolationEnabled = false;
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-123: disabling interpolation emits subFramePositionChanged null', () => {
      engine.interpolationEnabled = true;
      const listener = vi.fn();
      engine.on('subFramePositionChanged', listener);
      engine.interpolationEnabled = false;
      expect(listener).toHaveBeenCalledWith(null);
    });
  });

  // ---------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------
  describe('Dispose', () => {
    it('PE-130: dispose pauses playback', () => {
      engine.play();
      engine.dispose();
      expect(engine.isPlaying).toBe(false);
    });

    it('PE-131: dispose removes all listeners', () => {
      const listener = vi.fn();
      engine.on('frameChanged', listener);
      engine.dispose();
      // Direct internal mutation to trigger emit, but listeners are gone
      engine.currentFrame = 50;
      expect(listener).not.toHaveBeenCalled();
    });

    it('PE-132: dispose clears host reference', () => {
      engine.dispose();
      // After dispose, currentFrame setter uses duration fallback of 1
      engine.currentFrame = 50;
      expect(engine.currentFrame).toBe(1);
    });

    it('PE-133: dispose can be called multiple times safely', () => {
      engine.dispose();
      expect(() => engine.dispose()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // advanceFrame
  // ---------------------------------------------------------------
  describe('advanceFrame', () => {
    it('PE-140: forward direction advances frame by 1', () => {
      engine.currentFrame = 10;
      engine.advanceFrame(1);
      expect(engine.currentFrame).toBe(11);
    });

    it('PE-141: reverse direction decreases frame by 1', () => {
      engine.currentFrame = 10;
      engine.advanceFrame(-1);
      expect(engine.currentFrame).toBe(9);
    });

    it('PE-142: respects frameIncrement via stepForward', () => {
      engine.frameIncrement = 2;
      engine.currentFrame = 10;
      engine.stepForward();
      expect(engine.currentFrame).toBe(12);
    });

    it('PE-143: wraps at outPoint in loop mode', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'loop';
      engine.currentFrame = 10;
      engine.advanceFrame(1);
      expect(engine.currentFrame).toBe(1);
    });

    it('PE-144: stops at outPoint in once mode', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'once';
      engine.play();
      engine.currentFrame = 10;
      engine.advanceFrame(1);
      expect(engine.currentFrame).toBe(10);
      expect(engine.isPlaying).toBe(false);
    });

    it('PE-145: reverses at outPoint in pingpong mode', () => {
      engine.setInOutRange(1, 10);
      engine.loopMode = 'pingpong';
      engine.currentFrame = 10;
      engine.advanceFrame(1);
      expect(engine.playDirection).toBe(-1);
      expect(engine.currentFrame).toBe(9);
    });

    it('PE-146: wraps at inPoint when going reverse in loop mode', () => {
      engine.setInOutRange(5, 20);
      engine.loopMode = 'loop';
      engine.currentFrame = 5;
      engine.advanceFrame(-1);
      expect(engine.currentFrame).toBe(20);
    });

    it('PE-147: stops at inPoint when going reverse in once mode', () => {
      engine.setInOutRange(5, 20);
      engine.loopMode = 'once';
      engine.play();
      engine.currentFrame = 5;
      engine.advanceFrame(-1);
      expect(engine.currentFrame).toBe(5);
      expect(engine.isPlaying).toBe(false);
    });

    it('PE-148: reverses at inPoint when going reverse in pingpong mode', () => {
      engine.setInOutRange(5, 20);
      engine.loopMode = 'pingpong';
      engine.setPlayDirectionInternal(-1);
      engine.currentFrame = 5;
      engine.advanceFrame(-1);
      expect(engine.playDirection).toBe(1);
      expect(engine.currentFrame).toBe(6);
    });

    it('PE-149: FPS tracking updates effectiveFps after 500ms window', () => {
      const perfNowSpy = vi.spyOn(performance, 'now');
      // Start playing to enable FPS measurement
      perfNowSpy.mockReturnValue(0);
      engine.play();

      engine.setInOutRange(1, 100);
      engine.currentFrame = 1;

      // Advance several frames within the first 500ms - effectiveFps stays 0
      for (let i = 0; i < 10; i++) {
        perfNowSpy.mockReturnValue(i * 20); // each advance at 20ms intervals
        engine.advanceFrame(1);
      }
      // Still within 500ms window, effectiveFps should not have updated yet
      // (fpsLastTime was set at play() time)

      // Now jump past the 500ms boundary
      perfNowSpy.mockReturnValue(600);
      engine.advanceFrame(1);

      // effectiveFps should now be non-zero
      expect(engine.effectiveFps).toBeGreaterThan(0);

      perfNowSpy.mockRestore();
    });

    it('PE-150: boundary frame numbers are 1-based (frame 1 is minimum)', () => {
      engine.setInOutRange(1, 100);
      engine.currentFrame = 1;
      engine.loopMode = 'once';
      engine.play();
      engine.advanceFrame(-1);
      // Should stay at inPoint (1), not go to 0
      expect(engine.currentFrame).toBe(1);
    });

    it('PE-151: advanceFrame emits frameChanged', () => {
      engine.currentFrame = 10;
      const listener = vi.fn();
      engine.on('frameChanged', listener);
      engine.advanceFrame(1);
      expect(listener).toHaveBeenCalledWith(11);
    });
  });

  // ---------------------------------------------------------------
  // effectiveFps / droppedFrameCount
  // ---------------------------------------------------------------
  describe('effectiveFps / droppedFrameCount', () => {
    it('PE-160: effectiveFps returns 0 when not playing', () => {
      expect(engine.effectiveFps).toBe(0);
    });

    it('PE-161: effectiveFps reflects actual playback rate during play', () => {
      const perfNowSpy = vi.spyOn(performance, 'now');
      perfNowSpy.mockReturnValue(0);
      engine.play();
      engine.setInOutRange(1, 200);
      engine.currentFrame = 1;

      // Simulate 24 frames advanced over ~1000ms
      // Advance 12 frames, then cross the 500ms boundary
      for (let i = 1; i <= 12; i++) {
        perfNowSpy.mockReturnValue(i * (500 / 12));
        engine.advanceFrame(1);
      }

      // Cross the 500ms measurement window
      perfNowSpy.mockReturnValue(510);
      engine.advanceFrame(1);

      // effectiveFps should now reflect the measured rate
      expect(engine.effectiveFps).toBeGreaterThan(0);

      perfNowSpy.mockRestore();
    });

    it('PE-162: droppedFrameCount starts at 0', () => {
      expect(engine.droppedFrameCount).toBe(0);
    });

    it('PE-163: droppedFrameCount resets on play', () => {
      // Manually set droppedFrameCount via the internal timing state
      (engine as unknown as { _ts: { droppedFrameCount: number } })._ts.droppedFrameCount = 5;
      expect(engine.droppedFrameCount).toBe(5);

      engine.play();
      // play() calls resetFpsTracking which resets droppedFrameCount
      expect(engine.droppedFrameCount).toBe(0);
    });

    it('PE-164: frame drop detection when frames are skipped', () => {
      // The timing controller's trackDroppedFrame increments droppedFrameCount
      // Access the internal timing controller to simulate a dropped frame
      const ts = (engine as unknown as { _ts: { droppedFrameCount: number } })._ts;
      expect(ts.droppedFrameCount).toBe(0);

      // Simulate dropped frames by calling the timing controller directly
      const tc = (
        engine as unknown as {
          _timingController: { trackDroppedFrame: (state: { droppedFrameCount: number }, count?: number) => void };
        }
      )._timingController;
      tc.trackDroppedFrame(ts, 3);
      expect(engine.droppedFrameCount).toBe(3);

      tc.trackDroppedFrame(ts);
      expect(engine.droppedFrameCount).toBe(4);
    });

    it('PE-165: skipped frames do not inflate FPS measurement', () => {
      const perfNowSpy = vi.spyOn(performance, 'now');
      perfNowSpy.mockReturnValue(0);
      engine.play();
      engine.setInOutRange(1, 200);
      engine.currentFrame = 1;

      // Advance 6 rendered frames + 6 skipped frames over ~500ms
      for (let i = 1; i <= 12; i++) {
        const isSkipped = i % 2 === 0;
        perfNowSpy.mockReturnValue(i * (500 / 12));
        engine.advanceFrame(1, isSkipped);
      }

      // Cross the 500ms measurement window with a rendered frame
      perfNowSpy.mockReturnValue(510);
      engine.advanceFrame(1, false);

      // FPS should reflect only the 7 rendered frames (6 in window + 1 crossing),
      // not all 13 calls. With 7 frames over 510ms, FPS ~ 13.7.
      // If skipped frames were counted, it would be ~25.5 (13 frames / 510ms).
      expect(engine.effectiveFps).toBeLessThan(20);
      expect(engine.effectiveFps).toBeGreaterThan(0);

      perfNowSpy.mockRestore();
    });

    it('PE-166: dropped frame counter still works when frames are skipped', () => {
      const perfNowSpy = vi.spyOn(performance, 'now');
      perfNowSpy.mockReturnValue(0);
      engine.play();
      engine.setInOutRange(1, 200);
      engine.currentFrame = 1;

      const tc = (
        engine as unknown as {
          _timingController: { trackDroppedFrame: (state: { droppedFrameCount: number }, count?: number) => void };
        }
      )._timingController;
      const ts = (engine as unknown as { _ts: { droppedFrameCount: number } })._ts;

      // Track 3 dropped frames, then advance with skipped=true
      tc.trackDroppedFrame(ts, 3);
      perfNowSpy.mockReturnValue(10);
      engine.advanceFrame(1, true);
      perfNowSpy.mockReturnValue(20);
      engine.advanceFrame(1, true);
      perfNowSpy.mockReturnValue(30);
      engine.advanceFrame(1, true);

      // Dropped count should still be 3
      expect(engine.droppedFrameCount).toBe(3);

      // Add more dropped frames
      tc.trackDroppedFrame(ts, 2);
      expect(engine.droppedFrameCount).toBe(5);

      perfNowSpy.mockRestore();
    });

    it('PE-167: normal playback FPS measurement unchanged (no skips)', () => {
      const perfNowSpy = vi.spyOn(performance, 'now');
      perfNowSpy.mockReturnValue(0);
      engine.play();
      engine.setInOutRange(1, 200);
      engine.currentFrame = 1;

      // Simulate 12 frames over 500ms (all rendered, no skips)
      for (let i = 1; i <= 12; i++) {
        perfNowSpy.mockReturnValue(i * (500 / 12));
        engine.advanceFrame(1);
      }

      // Cross the 500ms measurement window
      perfNowSpy.mockReturnValue(510);
      engine.advanceFrame(1);

      // With 13 frames over 510ms, FPS ~ 25.5
      // This is the same behavior as before the fix (no skipped frames)
      expect(engine.effectiveFps).toBeGreaterThan(20);
      expect(engine.effectiveFps).toBeLessThan(30);

      perfNowSpy.mockRestore();
    });
  });
});
