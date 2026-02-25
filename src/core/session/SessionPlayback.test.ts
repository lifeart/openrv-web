import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionPlayback, type SessionPlaybackHost } from './SessionPlayback';
import type { MediaSource } from './Session';

/**
 * Helper: create a minimal MediaSource stub for testing.
 */
function makeSource(overrides: Partial<MediaSource> = {}): MediaSource {
  return {
    type: 'image',
    name: 'test.exr',
    url: '/test.exr',
    width: 1920,
    height: 1080,
    duration: 100,
    fps: 24,
    ...overrides,
  };
}

/**
 * Helper: build a mock SessionPlaybackHost wired to the given sources array.
 */
function makeHost(sources: MediaSource[] = []): {
  host: SessionPlaybackHost;
  currentIndex: number;
  emitDurationChanged: ReturnType<typeof vi.fn>;
} {
  let currentIndex = 0;
  const emitDurationChanged = vi.fn();
  const host: SessionPlaybackHost = {
    getCurrentSource: () => sources[currentIndex] ?? null,
    getSourceB: () => null,
    getSourceCount: () => sources.length,
    getSources: () => sources,
    getMediaCurrentSourceIndex: () => currentIndex,
    setMediaCurrentSourceIndex: (i: number) => { currentIndex = i; },
    emitDurationChanged,
  };
  return { host, currentIndex, emitDurationChanged };
}

describe('SessionPlayback', () => {
  let sp: SessionPlayback;
  let sources: MediaSource[];
  let hostCtx: ReturnType<typeof makeHost>;

  beforeEach(() => {
    sp = new SessionPlayback();
    sources = [makeSource({ name: 'A.exr', duration: 100 })];
    hostCtx = makeHost(sources);
    sp.setHost(hostCtx.host);
    // Set outPoint to match source duration so frameCount is meaningful
    sp._playbackEngine.setOutPointInternal(100);
  });

  // -------------------------------------------------------------------
  // 1. Construction: initial state of owned managers
  // -------------------------------------------------------------------

  describe('construction', () => {
    it('SP-001: creates all four owned managers', () => {
      const fresh = new SessionPlayback();
      expect(fresh._playbackEngine).toBeDefined();
      expect(fresh._volumeManager).toBeDefined();
      expect(fresh._abCompareManager).toBeDefined();
      expect(fresh._audioCoordinator).toBeDefined();
    });

    it('SP-002: initial playback state is stopped at frame 1', () => {
      const fresh = new SessionPlayback();
      expect(fresh.currentFrame).toBe(1);
      expect(fresh.isPlaying).toBe(false);
      expect(fresh.playDirection).toBe(1);
      expect(fresh.playbackSpeed).toBe(1);
    });

    it('SP-003: initial volume state matches VolumeManager defaults', () => {
      const fresh = new SessionPlayback();
      expect(fresh.volume).toBeCloseTo(0.7, 2);
      expect(fresh.muted).toBe(false);
      expect(fresh.preservesPitch).toBe(true);
    });

    it('SP-004: initial A/B compare state defaults to A with no B assigned', () => {
      const fresh = new SessionPlayback();
      expect(fresh.currentAB).toBe('A');
      expect(fresh.sourceAIndex).toBe(0);
      expect(fresh.sourceBIndex).toBe(-1);
      expect(fresh.syncPlayhead).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // 2. setHost wiring: events are forwarded after setHost
  // -------------------------------------------------------------------

  describe('setHost wiring', () => {
    it('SP-005: after setHost, volume changes emit volumeChanged on SessionPlayback', () => {
      const listener = vi.fn();
      sp.on('volumeChanged', listener);
      sp.volume = 0.3;
      expect(listener).toHaveBeenCalledWith(0.3);
    });

    it('SP-006: after setHost, muted changes emit mutedChanged on SessionPlayback', () => {
      const listener = vi.fn();
      sp.on('mutedChanged', listener);
      sp.muted = true;
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('SP-007: after setHost, preservesPitch changes emit preservesPitchChanged', () => {
      const listener = vi.fn();
      sp.on('preservesPitchChanged', listener);
      sp.preservesPitch = false;
      expect(listener).toHaveBeenCalledWith(false);
    });
  });

  // -------------------------------------------------------------------
  // 3. PlaybackEngine delegation
  // -------------------------------------------------------------------

  describe('PlaybackEngine delegation', () => {
    it('SP-008: currentFrame delegates to PlaybackEngine', () => {
      sp._playbackEngine.setCurrentFrameInternal(42);
      expect(sp.currentFrame).toBe(42);
    });

    it('SP-009: fps get/set delegates to PlaybackEngine', () => {
      sp.fps = 30;
      expect(sp.fps).toBe(30);
      expect(sp._playbackEngine.fps).toBe(30);
    });

    it('SP-010: inPoint and outPoint delegate to PlaybackEngine', () => {
      sp._playbackEngine.setInPointInternal(5);
      sp._playbackEngine.setOutPointInternal(50);
      expect(sp.inPoint).toBe(5);
      expect(sp.outPoint).toBe(50);
    });

    it('SP-011: loopMode get/set delegates to PlaybackEngine', () => {
      sp.loopMode = 'pingpong';
      expect(sp.loopMode).toBe('pingpong');
      expect(sp._playbackEngine.loopMode).toBe('pingpong');
    });

    it('SP-012: playbackSpeed get/set delegates to PlaybackEngine', () => {
      sp.playbackSpeed = 2;
      expect(sp.playbackSpeed).toBe(2);
      expect(sp._playbackEngine.playbackSpeed).toBe(2);
    });

    it('SP-013: interpolationEnabled get/set delegates to PlaybackEngine', () => {
      sp.interpolationEnabled = true;
      expect(sp.interpolationEnabled).toBe(true);
      expect(sp._playbackEngine.interpolationEnabled).toBe(true);
    });

    it('SP-014: isPlaying reflects PlaybackEngine state', () => {
      expect(sp.isPlaying).toBe(false);
      sp.play();
      expect(sp.isPlaying).toBe(true);
    });

    it('SP-015: isBuffering reflects PlaybackEngine state', () => {
      // Default state is not buffering
      expect(sp.isBuffering).toBe(false);
    });

    it('SP-016: frameCount equals outPoint - inPoint + 1', () => {
      sp._playbackEngine.setInPointInternal(10);
      sp._playbackEngine.setOutPointInternal(50);
      expect(sp.frameCount).toBe(41);
    });

    it('SP-017: effectiveFps is 0 when not playing', () => {
      expect(sp.effectiveFps).toBe(0);
    });

    it('SP-018: playDirection defaults to 1 (forward)', () => {
      expect(sp.playDirection).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // 4. Play/pause/toggle control
  // -------------------------------------------------------------------

  describe('play/pause/toggle', () => {
    it('SP-019: play() sets isPlaying to true and emits playbackChanged', () => {
      const listener = vi.fn();
      sp.on('playbackChanged', listener);
      sp.play();
      expect(sp.isPlaying).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('SP-020: pause() sets isPlaying to false and emits playbackChanged', () => {
      sp.play();
      const listener = vi.fn();
      sp.on('playbackChanged', listener);
      sp.pause();
      expect(sp.isPlaying).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('SP-021: togglePlayback() starts if stopped, stops if playing', () => {
      expect(sp.isPlaying).toBe(false);
      sp.togglePlayback();
      expect(sp.isPlaying).toBe(true);
      sp.togglePlayback();
      expect(sp.isPlaying).toBe(false);
    });

    it('SP-022: togglePlayDirection() reverses playDirection and emits event', () => {
      const listener = vi.fn();
      sp.on('playDirectionChanged', listener);
      sp.togglePlayDirection();
      expect(sp.playDirection).toBe(-1);
      expect(listener).toHaveBeenCalledWith(-1);
    });
  });

  // -------------------------------------------------------------------
  // 5. Step forward/backward, goToFrame, goToStart, goToEnd
  // -------------------------------------------------------------------

  describe('frame navigation', () => {
    it('SP-023: stepForward advances frame by 1 and pauses', () => {
      sp._playbackEngine.setCurrentFrameInternal(10);
      sp.play();
      sp.stepForward();
      expect(sp.currentFrame).toBe(11);
      expect(sp.isPlaying).toBe(false);
    });

    it('SP-024: stepBackward moves frame back by 1 and pauses', () => {
      sp._playbackEngine.setCurrentFrameInternal(10);
      sp.play();
      sp.stepBackward();
      expect(sp.currentFrame).toBe(9);
      expect(sp.isPlaying).toBe(false);
    });

    it('SP-025: goToFrame navigates to the specified frame', () => {
      sp.goToFrame(50);
      expect(sp.currentFrame).toBe(50);
    });

    it('SP-026: goToStart goes to inPoint', () => {
      sp._playbackEngine.setInPointInternal(5);
      sp.goToFrame(50);
      sp.goToStart();
      expect(sp.currentFrame).toBe(5);
    });

    it('SP-027: goToEnd goes to outPoint', () => {
      sp.goToEnd();
      expect(sp.currentFrame).toBe(100);
    });
  });

  // -------------------------------------------------------------------
  // 6. In/out point management
  // -------------------------------------------------------------------

  describe('in/out point management', () => {
    it('SP-028: setInPoint sets inPoint to current frame and emits inOutChanged', () => {
      sp.goToFrame(10);
      const listener = vi.fn();
      sp.on('inOutChanged', listener);
      sp.setInPoint();
      expect(sp.inPoint).toBe(10);
      expect(listener).toHaveBeenCalledWith({ inPoint: 10, outPoint: 100 });
    });

    it('SP-029: setOutPoint sets outPoint to current frame and emits inOutChanged', () => {
      sp.goToFrame(80);
      const listener = vi.fn();
      sp.on('inOutChanged', listener);
      sp.setOutPoint();
      expect(sp.outPoint).toBe(80);
      expect(listener).toHaveBeenCalledWith({ inPoint: 1, outPoint: 80 });
    });

    it('SP-030: setInPoint with explicit frame value', () => {
      sp.setInPoint(15);
      expect(sp.inPoint).toBe(15);
    });

    it('SP-031: setOutPoint with explicit frame value', () => {
      sp.setOutPoint(75);
      expect(sp.outPoint).toBe(75);
    });

    it('SP-032: resetInOutPoints restores full range and emits inOutChanged', () => {
      sp.setInPoint(10);
      sp.setOutPoint(80);
      const listener = vi.fn();
      sp.on('inOutChanged', listener);
      sp.resetInOutPoints();
      expect(sp.inPoint).toBe(1);
      expect(sp.outPoint).toBe(100);
      expect(listener).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // 7. Speed control
  // -------------------------------------------------------------------

  describe('speed control', () => {
    it('SP-033: increaseSpeed steps to next preset', () => {
      // Default speed is 1 (index 3 in presets [0.1, 0.25, 0.5, 1, 2, 4, 8])
      const listener = vi.fn();
      sp.on('playbackSpeedChanged', listener);
      sp.increaseSpeed();
      expect(sp.playbackSpeed).toBe(2);
      expect(listener).toHaveBeenCalledWith(2);
    });

    it('SP-034: decreaseSpeed steps to previous preset', () => {
      sp.decreaseSpeed();
      expect(sp.playbackSpeed).toBe(0.5);
    });

    it('SP-035: resetSpeed returns to 1x', () => {
      sp.playbackSpeed = 4;
      sp.resetSpeed();
      expect(sp.playbackSpeed).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // 8. Volume/mute delegation via VolumeManager
  // -------------------------------------------------------------------

  describe('volume/mute delegation', () => {
    it('SP-036: volume get/set delegates to VolumeManager', () => {
      sp.volume = 0.5;
      expect(sp.volume).toBeCloseTo(0.5, 2);
      expect(sp._volumeManager.volume).toBeCloseTo(0.5, 2);
    });

    it('SP-037: muted get/set delegates to VolumeManager', () => {
      sp.muted = true;
      expect(sp.muted).toBe(true);
      expect(sp._volumeManager.muted).toBe(true);
    });

    it('SP-038: toggleMute delegates to VolumeManager', () => {
      expect(sp.muted).toBe(false);
      sp.toggleMute();
      expect(sp.muted).toBe(true);
      sp.toggleMute();
      expect(sp.muted).toBe(false);
    });

    it('SP-039: preservesPitch get/set delegates to VolumeManager', () => {
      sp.preservesPitch = false;
      expect(sp.preservesPitch).toBe(false);
      expect(sp._volumeManager.preservesPitch).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // 9. A/B compare
  // -------------------------------------------------------------------

  describe('A/B compare', () => {
    let sourceA: MediaSource;
    let sourceB: MediaSource;

    beforeEach(() => {
      sourceA = makeSource({ name: 'A.exr', duration: 100 });
      sourceB = makeSource({ name: 'B.exr', duration: 80 });
      sources.length = 0;
      sources.push(sourceA, sourceB);
      sp._playbackEngine.setOutPointInternal(100);
    });

    it('SP-040: sourceA returns the source at sourceAIndex', () => {
      expect(sp.sourceA).toBe(sourceA);
    });

    it('SP-041: sourceB returns null when sourceBIndex is -1', () => {
      // By default sourceBIndex is -1
      expect(sp.sourceB).toBeNull();
    });

    it('SP-042: sourceB returns the source after setSourceB', () => {
      sp.setSourceB(1);
      expect(sp.sourceB).toBe(sourceB);
    });

    it('SP-043: currentAB defaults to A', () => {
      expect(sp.currentAB).toBe('A');
    });

    it('SP-044: abCompareAvailable is false when no B assigned', () => {
      expect(sp.abCompareAvailable).toBe(false);
    });

    it('SP-045: abCompareAvailable is true after setSourceB', () => {
      sp.setSourceB(1);
      expect(sp.abCompareAvailable).toBe(true);
    });

    it('SP-046: setSourceA changes the A index', () => {
      sp.setSourceA(1);
      expect(sp.sourceAIndex).toBe(1);
    });

    it('SP-047: clearSourceB resets sourceBIndex and reverts to A if on B', () => {
      sp.setSourceB(1);
      sp.toggleAB(); // switch to B
      expect(sp.currentAB).toBe('B');
      sp.clearSourceB();
      expect(sp.sourceBIndex).toBe(-1);
      expect(sp.currentAB).toBe('A');
    });

    it('SP-048: toggleAB switches between A and B and emits abSourceChanged', () => {
      sp.setSourceB(1);
      const listener = vi.fn();
      sp.on('abSourceChanged', listener);
      sp.toggleAB();
      expect(sp.currentAB).toBe('B');
      expect(listener).toHaveBeenCalled();
    });

    it('SP-049: toggleAB does nothing when B is not available', () => {
      // sourceBIndex is -1
      sp.toggleAB();
      expect(sp.currentAB).toBe('A');
    });

    it('SP-050: setCurrentAB to B performs toggle when available', () => {
      sp.setSourceB(1);
      sp.setCurrentAB('B');
      expect(sp.currentAB).toBe('B');
    });

    it('SP-051: setCurrentAB to same value does nothing', () => {
      const listener = vi.fn();
      sp.on('abSourceChanged', listener);
      sp.setCurrentAB('A');
      expect(listener).not.toHaveBeenCalled();
    });

    it('SP-052: syncPlayhead get/set delegates to ABCompareManager', () => {
      sp.syncPlayhead = false;
      expect(sp.syncPlayhead).toBe(false);
      expect(sp._abCompareManager.syncPlayhead).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // 10. Event forwarding from PlaybackEngine to SessionPlayback
  // -------------------------------------------------------------------

  describe('event forwarding', () => {
    it('SP-053: frameChanged is forwarded from PlaybackEngine', () => {
      const listener = vi.fn();
      sp.on('frameChanged', listener);
      sp.goToFrame(50);
      expect(listener).toHaveBeenCalledWith(50);
    });

    it('SP-054: playbackChanged is forwarded from PlaybackEngine', () => {
      const listener = vi.fn();
      sp.on('playbackChanged', listener);
      sp.play();
      expect(listener).toHaveBeenCalledWith(true);
      sp.pause();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('SP-055: loopModeChanged is forwarded from PlaybackEngine', () => {
      const listener = vi.fn();
      sp.on('loopModeChanged', listener);
      sp.loopMode = 'once';
      expect(listener).toHaveBeenCalledWith('once');
    });

    it('SP-056: fpsChanged is forwarded from PlaybackEngine', () => {
      const listener = vi.fn();
      sp.on('fpsChanged', listener);
      sp.fps = 30;
      expect(listener).toHaveBeenCalledWith(30);
    });

    it('SP-057: playbackSpeedChanged is forwarded from PlaybackEngine', () => {
      const listener = vi.fn();
      sp.on('playbackSpeedChanged', listener);
      sp.playbackSpeed = 2;
      expect(listener).toHaveBeenCalledWith(2);
    });

    it('SP-058: interpolationEnabledChanged is forwarded from PlaybackEngine', () => {
      const listener = vi.fn();
      sp.on('interpolationEnabledChanged', listener);
      sp.interpolationEnabled = true;
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('SP-059: inOutChanged is forwarded from PlaybackEngine', () => {
      const listener = vi.fn();
      sp.on('inOutChanged', listener);
      sp.setInPoint(10);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ inPoint: 10 }));
    });
  });

  // -------------------------------------------------------------------
  // 11. dispose() cleans up
  // -------------------------------------------------------------------

  describe('dispose', () => {
    it('SP-060: dispose removes all listeners, pauses playback, and nullifies host', () => {
      const listener = vi.fn();
      sp.on('frameChanged', listener);

      // Trigger before dispose to confirm listener works
      sp.goToFrame(10);
      expect(listener).toHaveBeenCalledTimes(1);

      // Start playback before dispose to verify it gets paused
      sp.play();
      expect(sp.isPlaying).toBe(true);

      sp.dispose();

      // Verify playback was paused by dispose
      expect(sp.isPlaying).toBe(false);

      // After dispose, PlaybackEngine events are no longer forwarded
      // because removeAllListeners was called on both the engine and SP.
      // Emitting directly on the PlaybackEngine should not reach our listener.
      sp._playbackEngine.emit('frameChanged', 20);
      expect(listener).toHaveBeenCalledTimes(1); // still 1, not forwarded
    });

    it('SP-061: dispose cleans up VolumeManager callbacks', () => {
      sp.dispose();
      // After dispose, setting volume should not throw but should not
      // emit events either since callbacks are cleared.
      const listener = vi.fn();
      sp.on('volumeChanged', listener);
      sp._volumeManager.volume = 0.1;
      // The VolumeManager's callbacks are null after dispose, so no emission
      expect(listener).not.toHaveBeenCalled();
    });

    it('SP-062: dispose cleans up ABCompareManager callbacks', () => {
      sp.dispose();
      const listener = vi.fn();
      sp.on('abSourceChanged', listener);
      sp._abCompareManager.emitChanged(0);
      expect(listener).not.toHaveBeenCalled();
    });

    it('SP-064: dispose can be called safely multiple times', () => {
      expect(() => {
        sp.dispose();
        sp.dispose();
      }).not.toThrow();
    });

    it('SP-065: dispose calls PlaybackEngine.dispose()', () => {
      const engineDispose = vi.spyOn(sp._playbackEngine, 'dispose');
      sp.dispose();
      expect(engineDispose).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // 12. audioPlaybackManager accessor
  // -------------------------------------------------------------------

  describe('audioPlaybackManager', () => {
    it('SP-063: audioPlaybackManager returns AudioCoordinator manager', () => {
      const manager = sp.audioPlaybackManager;
      expect(manager).toBe(sp._audioCoordinator.manager);
    });
  });
});
