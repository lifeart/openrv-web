/**
 * Tests for the Mu API Compatibility Layer — Phase 1
 *
 * Covers MuCommands (playback, audio, view, marks) and
 * MuExtraCommands (display feedback, toggles, stepping, view transforms).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MuCommands } from '../MuCommands';
import { MuExtraCommands } from '../MuExtraCommands';
import { registerMuCompat } from '../index';
import {
  PlayLoop,
  PlayOnce,
  PlayPingPong,
  FilterNearest,
  FilterLinear,
} from '../constants';

// =====================================================================
// Mock openrv API
// =====================================================================

function createMockOpenRV() {
  return {
    playback: {
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      isPlaying: vi.fn((): boolean => false),
      seek: vi.fn(),
      getCurrentFrame: vi.fn((): number => 1),
      getTotalFrames: vi.fn((): number => 100),
      setPlaybackMode: vi.fn(),
      getPlaybackMode: vi.fn((): string => 'realtime'),
      step: vi.fn(),
      getMeasuredFPS: vi.fn((): number => 0),
      setSpeed: vi.fn(),
      getSpeed: vi.fn(() => 1),
      stop: vi.fn(),
    },
    media: {
      getFPS: vi.fn((): number => 24),
      getPlaybackFPS: vi.fn((): number => 24),
      setPlaybackFPS: vi.fn(),
      getResolution: vi.fn((): { width: number; height: number } => ({ width: 1920, height: 1080 })),
      hasMedia: vi.fn((): boolean => true),
      getCurrentSource: vi.fn(() => null),
      getDuration: vi.fn(() => 100),
      getSourceCount: vi.fn(() => 1),
    },
    audio: {
      setAudioScrubEnabled: vi.fn(),
      isAudioScrubEnabled: vi.fn((): boolean => false),
      setVolume: vi.fn(),
      getVolume: vi.fn(() => 1),
      mute: vi.fn(),
      unmute: vi.fn(),
      isMuted: vi.fn(() => false),
      toggleMute: vi.fn(),
    },
    loop: {
      setMode: vi.fn(),
      getMode: vi.fn((): string => 'loop'),
      getInPoint: vi.fn((): number => 1),
      getOutPoint: vi.fn((): number => 100),
      setInPoint: vi.fn(),
      setOutPoint: vi.fn(),
      clearInOut: vi.fn(),
    },
    view: {
      fitToWindow: vi.fn(),
      setZoom: vi.fn(),
      getZoom: vi.fn((): number => 1.0),
      setPan: vi.fn(),
      getPan: vi.fn((): { x: number; y: number } => ({ x: 0, y: 0 })),
      setChannel: vi.fn(),
      getChannel: vi.fn(() => 'rgb'),
      setTextureFilterMode: vi.fn(),
      getTextureFilterMode: vi.fn((): string => 'linear'),
      setBackgroundPattern: vi.fn(),
      getBackgroundPattern: vi.fn(() => ({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' })),
    },
    markers: {
      add: vi.fn(),
      remove: vi.fn(),
      get: vi.fn((): { frame: number; note: string; color: string } | null => null),
      getAll: vi.fn((): Array<{ frame: number; note: string; color: string }> => []),
      clear: vi.fn(),
    },
    color: {},
    events: {
      on: vi.fn(() => vi.fn()),
      off: vi.fn(),
    },
    isReady: vi.fn(() => true),
  };
}

let mockOpenRV: ReturnType<typeof createMockOpenRV>;

beforeEach(() => {
  mockOpenRV = createMockOpenRV();
  (globalThis as Record<string, unknown>).openrv = mockOpenRV;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).openrv;
  delete (globalThis as Record<string, unknown>).rv;
});

// =====================================================================
// MuCommands Tests
// =====================================================================

describe('MuCommands', () => {
  let cmd: MuCommands;

  beforeEach(() => {
    cmd = new MuCommands();
  });

  // --- Introspection ---

  describe('introspection', () => {
    it('isSupported returns true for supported commands', () => {
      expect(cmd.isSupported('play')).toBe(true);
      expect(cmd.isSupported('stop')).toBe(true);
      expect(cmd.isSupported('frame')).toBe(true);
    });

    it('isSupported returns partial for partial commands', () => {
      expect(cmd.isSupported('scrubAudio')).toBe('partial');
      expect(cmd.isSupported('contentAspect')).toBe('partial');
    });

    it('isSupported returns false for unknown commands', () => {
      expect(cmd.isSupported('nonExistentCommand')).toBe(false);
    });

    it('isAsync returns true for async commands', () => {
      expect(cmd.isAsync('fullScreenMode')).toBe(true);
    });

    it('isAsync returns false for sync commands', () => {
      expect(cmd.isAsync('play')).toBe(false);
      expect(cmd.isAsync('frame')).toBe(false);
    });
  });

  // --- Playback & Transport ---

  describe('playback & transport', () => {
    it('play() delegates to openrv.playback.play()', () => {
      cmd.play();
      expect(mockOpenRV.playback.play).toHaveBeenCalledOnce();
    });

    it('stop() delegates to openrv.playback.pause()', () => {
      cmd.stop();
      expect(mockOpenRV.playback.pause).toHaveBeenCalledOnce();
    });

    it('isPlaying() returns playback state', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      expect(cmd.isPlaying()).toBe(true);

      mockOpenRV.playback.isPlaying.mockReturnValue(false);
      expect(cmd.isPlaying()).toBe(false);
    });

    it('setFrame() delegates to openrv.playback.seek()', () => {
      cmd.setFrame(50);
      expect(mockOpenRV.playback.seek).toHaveBeenCalledWith(50);
    });

    it('setFrame() rounds to integer', () => {
      cmd.setFrame(50.7);
      expect(mockOpenRV.playback.seek).toHaveBeenCalledWith(51);
    });

    it('setFrame() throws on invalid input', () => {
      expect(() => cmd.setFrame(NaN)).toThrow(TypeError);
      expect(() => cmd.setFrame('abc' as unknown as number)).toThrow(TypeError);
    });

    it('frame() returns current frame', () => {
      mockOpenRV.playback.getCurrentFrame.mockReturnValue(42);
      expect(cmd.frame()).toBe(42);
    });

    it('frameStart() returns 1 by default', () => {
      expect(cmd.frameStart()).toBe(1);
    });

    it('frameEnd() returns total frames', () => {
      mockOpenRV.playback.getTotalFrames.mockReturnValue(200);
      expect(cmd.frameEnd()).toBe(200);
    });

    it('setFPS() calls the real API to change session playback FPS', () => {
      cmd.setFPS(30);
      expect(mockOpenRV.media.setPlaybackFPS).toHaveBeenCalledWith(30);
    });

    it('fps() returns real session playback FPS after setFPS()', () => {
      // Simulate the real API updating the playback FPS
      mockOpenRV.media.getPlaybackFPS.mockReturnValue(30);
      expect(cmd.fps()).toBe(30);
    });

    it('setFPS() affects playback state via the real API, not just local readback', () => {
      cmd.setFPS(60);
      expect(mockOpenRV.media.setPlaybackFPS).toHaveBeenCalledWith(60);
      // fps() reads from the real API, not a local cache
      mockOpenRV.media.getPlaybackFPS.mockReturnValue(60);
      expect(cmd.fps()).toBe(60);
      expect(mockOpenRV.media.getPlaybackFPS).toHaveBeenCalled();
    });

    it('fps() returns playback FPS (not source FPS) when no override', () => {
      mockOpenRV.media.getPlaybackFPS.mockReturnValue(48);
      mockOpenRV.media.getFPS.mockReturnValue(24);
      expect(cmd.fps()).toBe(48);
    });

    it('setFPS() throws on invalid input', () => {
      expect(() => cmd.setFPS(0)).toThrow(TypeError);
      expect(() => cmd.setFPS(-1)).toThrow(TypeError);
      expect(() => cmd.setFPS(NaN)).toThrow(TypeError);
    });

    it('realFPS() returns measured FPS from playback engine', () => {
      mockOpenRV.playback.getMeasuredFPS.mockReturnValue(23.5);
      expect(cmd.realFPS()).toBe(23.5);
      expect(mockOpenRV.playback.getMeasuredFPS).toHaveBeenCalled();
    });

    it('realFPS() differs from nominal fps() when playback is slower', () => {
      // Nominal FPS is 24
      expect(cmd.fps()).toBe(24);
      // Measured FPS is lower due to slow playback
      mockOpenRV.playback.getMeasuredFPS.mockReturnValue(18.2);
      expect(cmd.realFPS()).toBe(18.2);
      expect(cmd.realFPS()).not.toBe(cmd.fps());
    });

    it('realFPS() returns 0 when not playing', () => {
      mockOpenRV.playback.getMeasuredFPS.mockReturnValue(0);
      expect(cmd.realFPS()).toBe(0);
    });

    it('realFPS() is independent of setFPS()', () => {
      cmd.setFPS(60);
      mockOpenRV.media.getPlaybackFPS.mockReturnValue(60);
      expect(cmd.fps()).toBe(60); // nominal from real API
      mockOpenRV.playback.getMeasuredFPS.mockReturnValue(58.7);
      expect(cmd.realFPS()).toBe(58.7); // measured, not the nominal
    });

    it('setRealtime(true) sets realtime mode', () => {
      cmd.setRealtime(true);
      expect(mockOpenRV.playback.setPlaybackMode).toHaveBeenCalledWith('realtime');
    });

    it('setRealtime(false) sets playAllFrames mode', () => {
      cmd.setRealtime(false);
      expect(mockOpenRV.playback.setPlaybackMode).toHaveBeenCalledWith('playAllFrames');
    });

    it('isRealtime() checks playback mode', () => {
      mockOpenRV.playback.getPlaybackMode.mockReturnValue('realtime');
      expect(cmd.isRealtime()).toBe(true);

      mockOpenRV.playback.getPlaybackMode.mockReturnValue('playAllFrames');
      expect(cmd.isRealtime()).toBe(false);
    });

    it('setInc() / inc() manage playback direction', () => {
      expect(cmd.inc()).toBe(1); // default forward
      cmd.setInc(-1);
      expect(cmd.inc()).toBe(-1);
      cmd.setInc(1);
      expect(cmd.inc()).toBe(1);
    });

    it('setInc() normalizes to +1/-1', () => {
      cmd.setInc(5);
      expect(cmd.inc()).toBe(1);
      cmd.setInc(-3);
      expect(cmd.inc()).toBe(-1);
    });

    it('setInc() throws on invalid input', () => {
      expect(() => cmd.setInc(NaN)).toThrow(TypeError);
    });

    it('setPlayMode() maps Mu constants to loop modes', () => {
      cmd.setPlayMode(PlayLoop);
      expect(mockOpenRV.loop.setMode).toHaveBeenCalledWith('loop');

      cmd.setPlayMode(PlayOnce);
      expect(mockOpenRV.loop.setMode).toHaveBeenCalledWith('once');

      cmd.setPlayMode(PlayPingPong);
      expect(mockOpenRV.loop.setMode).toHaveBeenCalledWith('pingpong');
    });

    it('setPlayMode() throws on invalid mode', () => {
      expect(() => cmd.setPlayMode(99)).toThrow(TypeError);
    });

    it('playMode() maps loop modes to Mu constants', () => {
      mockOpenRV.loop.getMode.mockReturnValue('loop');
      expect(cmd.playMode()).toBe(PlayLoop);

      mockOpenRV.loop.getMode.mockReturnValue('once');
      expect(cmd.playMode()).toBe(PlayOnce);

      mockOpenRV.loop.getMode.mockReturnValue('pingpong');
      expect(cmd.playMode()).toBe(PlayPingPong);
    });

    it('inPoint() / outPoint() delegate to loop API', () => {
      mockOpenRV.loop.getInPoint.mockReturnValue(10);
      mockOpenRV.loop.getOutPoint.mockReturnValue(90);
      expect(cmd.inPoint()).toBe(10);
      expect(cmd.outPoint()).toBe(90);
    });

    it('setInPoint() / setOutPoint() delegate to loop API', () => {
      cmd.setInPoint(10);
      expect(mockOpenRV.loop.setInPoint).toHaveBeenCalledWith(10);

      cmd.setOutPoint(90);
      expect(mockOpenRV.loop.setOutPoint).toHaveBeenCalledWith(90);
    });

    it('setInPoint() / setOutPoint() throw on invalid input', () => {
      expect(() => cmd.setInPoint(NaN)).toThrow(TypeError);
      expect(() => cmd.setOutPoint('abc' as unknown as number)).toThrow(TypeError);
    });

    it('skipped() returns 0 by default', () => {
      expect(cmd.skipped()).toBe(0);
    });

    it('isCurrentFrameIncomplete() returns false', () => {
      expect(cmd.isCurrentFrameIncomplete()).toBe(false);
    });

    it('isCurrentFrameError() returns false', () => {
      expect(cmd.isCurrentFrameError()).toBe(false);
    });

    it('isBuffering() returns false', () => {
      expect(cmd.isBuffering()).toBe(false);
    });

    it('mbps() / resetMbps() manage throughput counter', () => {
      expect(cmd.mbps()).toBe(0);
      cmd.resetMbps();
      expect(cmd.mbps()).toBe(0);
    });
  });

  // --- Audio ---

  describe('audio', () => {
    it('scrubAudio() delegates to audio.setAudioScrubEnabled()', () => {
      cmd.scrubAudio(true);
      expect(mockOpenRV.audio.setAudioScrubEnabled).toHaveBeenCalledWith(true);

      cmd.scrubAudio(false);
      expect(mockOpenRV.audio.setAudioScrubEnabled).toHaveBeenCalledWith(false);
    });

    it('scrubAudio() accepts extra params without error', () => {
      expect(() => cmd.scrubAudio(true, 0.1, 3)).not.toThrow();
      expect(mockOpenRV.audio.setAudioScrubEnabled).toHaveBeenCalledWith(true);
    });
  });

  // --- View & Display ---

  describe('view & display', () => {
    it('redraw() does not throw', () => {
      expect(() => cmd.redraw()).not.toThrow();
    });

    it('viewSize() returns [width, height]', () => {
      const size = cmd.viewSize();
      expect(Array.isArray(size)).toBe(true);
      expect(size).toHaveLength(2);
      expect(typeof size[0]).toBe('number');
      expect(typeof size[1]).toBe('number');
    });

    it('resizeFit() delegates to view.fitToWindow()', () => {
      cmd.resizeFit();
      expect(mockOpenRV.view.fitToWindow).toHaveBeenCalledOnce();
    });

    it('isFullScreen() returns a boolean', () => {
      expect(typeof cmd.isFullScreen()).toBe('boolean');
    });

    it('setWindowTitle() sets document.title', () => {
      const original = document.title;
      cmd.setWindowTitle('Test Title');
      expect(document.title).toBe('Test Title');
      document.title = original;
    });

    it('setWindowTitle() throws on non-string', () => {
      expect(() => cmd.setWindowTitle(123 as unknown as string)).toThrow(TypeError);
    });

    it('setFiltering() calls the real API to set texture filter mode', () => {
      cmd.setFiltering(FilterNearest);
      expect(mockOpenRV.view.setTextureFilterMode).toHaveBeenCalledWith('nearest');

      cmd.setFiltering(FilterLinear);
      expect(mockOpenRV.view.setTextureFilterMode).toHaveBeenCalledWith('linear');
    });

    it('getFiltering() reads from the real API, not local cache', () => {
      mockOpenRV.view.getTextureFilterMode.mockReturnValue('linear');
      expect(cmd.getFiltering()).toBe(FilterLinear);

      mockOpenRV.view.getTextureFilterMode.mockReturnValue('nearest');
      expect(cmd.getFiltering()).toBe(FilterNearest);
      expect(mockOpenRV.view.getTextureFilterMode).toHaveBeenCalled();
    });

    it('setFiltering() affects viewer state via real API, not just local readback', () => {
      cmd.setFiltering(FilterNearest);
      expect(mockOpenRV.view.setTextureFilterMode).toHaveBeenCalledWith('nearest');
      // Verify getFiltering reads from API, not local state
      mockOpenRV.view.getTextureFilterMode.mockReturnValue('nearest');
      expect(cmd.getFiltering()).toBe(FilterNearest);
    });

    it('setFiltering() throws on invalid mode', () => {
      expect(() => cmd.setFiltering(99)).toThrow(TypeError);
    });

    it('setBGMethod() calls the real API to set background pattern', () => {
      cmd.setBGMethod('checker');
      expect(mockOpenRV.view.setBackgroundPattern).toHaveBeenCalledWith(
        expect.objectContaining({ pattern: 'checker' }),
      );
    });

    it('bgMethod() reads from the real API, not local cache', () => {
      mockOpenRV.view.getBackgroundPattern.mockReturnValue({ pattern: 'checker', checkerSize: 'medium', customColor: '#1a1a1a' });
      expect(cmd.bgMethod()).toBe('checker');
      expect(mockOpenRV.view.getBackgroundPattern).toHaveBeenCalled();
    });

    it('setBGMethod() throws on non-string', () => {
      expect(() => cmd.setBGMethod(123 as unknown as string)).toThrow(TypeError);
    });

    it('setMargins/margins are marked as stub, not supported', () => {
      expect(cmd.isSupported('setMargins')).toBe('stub');
      expect(cmd.isSupported('margins')).toBe('stub');
    });

    it('setMargins() / margins() manage viewport margins (local-only stub)', () => {
      expect(cmd.margins()).toEqual([0, 0, 0, 0]); // default

      cmd.setMargins([10, 20, 10, 20], false);
      expect(cmd.margins()).toEqual([10, 20, 10, 20]);
    });

    it('setMargins() throws on non-array', () => {
      expect(() => cmd.setMargins('bad' as unknown as number[], false)).toThrow(TypeError);
    });

    it('margins() returns a copy', () => {
      cmd.setMargins([1, 2, 3, 4], false);
      const m1 = cmd.margins();
      const m2 = cmd.margins();
      expect(m1).toEqual(m2);
      expect(m1).not.toBe(m2); // different references
    });

    it('contentAspect() computes width/height', () => {
      mockOpenRV.media.getResolution.mockReturnValue({ width: 1920, height: 1080 });
      expect(cmd.contentAspect()).toBeCloseTo(1920 / 1080, 5);
    });

    it('contentAspect() returns 1 when height is 0', () => {
      mockOpenRV.media.getResolution.mockReturnValue({ width: 0, height: 0 });
      expect(cmd.contentAspect()).toBe(1);
    });

    it('devicePixelRatio() returns a number', () => {
      expect(typeof cmd.devicePixelRatio()).toBe('number');
      expect(cmd.devicePixelRatio()).toBeGreaterThan(0);
    });
  });

  // --- Frame Marks ---

  describe('frame marks', () => {
    it('markFrame(frame, true) calls markers.add()', () => {
      cmd.markFrame(10, true);
      expect(mockOpenRV.markers.add).toHaveBeenCalledWith(10);
    });

    it('markFrame(frame, false) calls markers.remove()', () => {
      cmd.markFrame(10, false);
      expect(mockOpenRV.markers.remove).toHaveBeenCalledWith(10);
    });

    it('markFrame() throws on invalid frame', () => {
      expect(() => cmd.markFrame(NaN, true)).toThrow(TypeError);
    });

    it('isMarked() returns false when no marker exists', () => {
      mockOpenRV.markers.get.mockReturnValue(null);
      expect(cmd.isMarked(10)).toBe(false);
    });

    it('isMarked() returns true when marker exists', () => {
      mockOpenRV.markers.get.mockReturnValue({ frame: 10, note: '', color: '#ff0000' });
      expect(cmd.isMarked(10)).toBe(true);
    });

    it('markedFrames() returns array of frame numbers', () => {
      mockOpenRV.markers.getAll.mockReturnValue([
        { frame: 5, note: '', color: '#ff0000' },
        { frame: 15, note: '', color: '#ff0000' },
        { frame: 25, note: '', color: '#ff0000' },
      ]);
      expect(cmd.markedFrames()).toEqual([5, 15, 25]);
    });

    it('markedFrames() returns empty array when no marks', () => {
      mockOpenRV.markers.getAll.mockReturnValue([]);
      expect(cmd.markedFrames()).toEqual([]);
    });
  });

  // --- Error when openrv not available ---

  describe('missing openrv', () => {
    it('throws when openrv is not on globalThis', () => {
      delete (globalThis as Record<string, unknown>).openrv;
      expect(() => cmd.play()).toThrow('window.openrv is not available');
    });
  });
});

// =====================================================================
// MuExtraCommands Tests
// =====================================================================

describe('MuExtraCommands', () => {
  let cmd: MuCommands;
  let extra: MuExtraCommands;

  beforeEach(() => {
    cmd = new MuCommands();
    extra = new MuExtraCommands(cmd);
  });

  // --- Display Feedback ---

  describe('display feedback', () => {
    it('displayFeedback() logs to console', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      extra.displayFeedback('hello', 2.0);
      expect(spy).toHaveBeenCalledWith('[RV Feedback] hello');
      spy.mockRestore();
    });

    it('displayFeedback2() works as alias', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      extra.displayFeedback2('test msg');
      expect(spy).toHaveBeenCalledWith('[RV Feedback] test msg');
      spy.mockRestore();
    });

    it('displayFeedbackWithSizes() works', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      extra.displayFeedbackWithSizes('sized msg', 1.0, [12, 14]);
      expect(spy).toHaveBeenCalledWith('[RV Feedback] sized msg');
      spy.mockRestore();
    });

    it('displayFeedbackQueue() does not throw', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      expect(() => extra.displayFeedbackQueue('queued')).not.toThrow();
      spy.mockRestore();
    });
  });

  // --- Session State Queries ---

  describe('session state queries', () => {
    it('isSessionEmpty() returns true when no media', () => {
      mockOpenRV.media.hasMedia.mockReturnValue(false);
      expect(extra.isSessionEmpty()).toBe(true);
    });

    it('isSessionEmpty() returns false when media loaded', () => {
      mockOpenRV.media.hasMedia.mockReturnValue(true);
      expect(extra.isSessionEmpty()).toBe(false);
    });

    it('isNarrowed() returns false when in/out match range', () => {
      // frameStart=1, frameEnd=100, inPoint=1, outPoint=100
      mockOpenRV.loop.getInPoint.mockReturnValue(1);
      mockOpenRV.loop.getOutPoint.mockReturnValue(100);
      mockOpenRV.playback.getTotalFrames.mockReturnValue(100);
      expect(extra.isNarrowed()).toBe(false);
    });

    it('isNarrowed() returns true when in/out differ from range', () => {
      mockOpenRV.loop.getInPoint.mockReturnValue(10);
      mockOpenRV.loop.getOutPoint.mockReturnValue(90);
      expect(extra.isNarrowed()).toBe(true);
    });

    it('isPlayable() returns true when range > 1 frame', () => {
      mockOpenRV.playback.getTotalFrames.mockReturnValue(100);
      expect(extra.isPlayable()).toBe(true);
    });

    it('isPlayable() returns false for single-frame source', () => {
      mockOpenRV.playback.getTotalFrames.mockReturnValue(1);
      expect(extra.isPlayable()).toBe(false);
    });

    it('isPlayingForwards() returns true when playing forward', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      cmd.setInc(1);
      expect(extra.isPlayingForwards()).toBe(true);
    });

    it('isPlayingForwards() returns false when not playing', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(false);
      expect(extra.isPlayingForwards()).toBe(false);
    });

    it('isPlayingBackwards() returns true when playing backward', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      cmd.setInc(-1);
      expect(extra.isPlayingBackwards()).toBe(true);
    });

    it('isPlayingBackwards() returns false when playing forward', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      cmd.setInc(1);
      expect(extra.isPlayingBackwards()).toBe(false);
    });
  });

  // --- Playback Toggles ---

  describe('playback toggles', () => {
    it('togglePlay() delegates to playback.toggle()', () => {
      extra.togglePlay();
      expect(mockOpenRV.playback.toggle).toHaveBeenCalledOnce();
    });

    it('toggleForwardsBackwards() flips direction', () => {
      expect(cmd.inc()).toBe(1);
      extra.toggleForwardsBackwards();
      expect(cmd.inc()).toBe(-1);
      extra.toggleForwardsBackwards();
      expect(cmd.inc()).toBe(1);
    });

    it('toggleRealtime() flips realtime mode', () => {
      mockOpenRV.playback.getPlaybackMode.mockReturnValue('realtime');
      extra.toggleRealtime();
      expect(mockOpenRV.playback.setPlaybackMode).toHaveBeenCalledWith('playAllFrames');
    });
  });

  // --- View Transform ---

  describe('view transform', () => {
    it('setScale() delegates to view.setZoom()', () => {
      extra.setScale(2.0);
      expect(mockOpenRV.view.setZoom).toHaveBeenCalledWith(2.0);
    });

    it('scale() returns current zoom', () => {
      mockOpenRV.view.getZoom.mockReturnValue(1.5);
      expect(extra.scale()).toBe(1.5);
    });

    it('setTranslation() delegates to view.setPan()', () => {
      extra.setTranslation([100, -50]);
      expect(mockOpenRV.view.setPan).toHaveBeenCalledWith(100, -50);
    });

    it('setTranslation() throws on invalid input', () => {
      expect(() => extra.setTranslation('bad' as unknown as [number, number])).toThrow(TypeError);
      expect(() => extra.setTranslation([1] as unknown as [number, number])).toThrow(TypeError);
    });

    it('translation() returns [x, y] from view.getPan()', () => {
      mockOpenRV.view.getPan.mockReturnValue({ x: 10, y: 20 });
      expect(extra.translation()).toEqual([10, 20]);
    });

    it('frameImage() delegates to view.fitToWindow()', () => {
      extra.frameImage();
      expect(mockOpenRV.view.fitToWindow).toHaveBeenCalledOnce();
    });
  });

  // --- Frame Stepping ---

  describe('frame stepping', () => {
    it('stepForward() calls playback.step(n)', () => {
      extra.stepForward(5);
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(5);
    });

    it('stepForward() defaults to 1', () => {
      extra.stepForward();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(1);
    });

    it('stepBackward() calls playback.step(-n)', () => {
      extra.stepBackward(5);
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(-5);
    });

    it('stepBackward() defaults to 1', () => {
      extra.stepBackward();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(-1);
    });

    it('stepForward1() calls playback.step(1)', () => {
      extra.stepForward1();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(1);
    });

    it('stepBackward1() calls playback.step(-1)', () => {
      extra.stepBackward1();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(-1);
    });

    it('stepForward10() calls playback.step(10)', () => {
      extra.stepForward10();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(10);
    });

    it('stepBackward10() calls playback.step(-10)', () => {
      extra.stepBackward10();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(-10);
    });

    it('stepForward100() calls playback.step(100)', () => {
      extra.stepForward100();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(100);
    });

    it('stepBackward100() calls playback.step(-100)', () => {
      extra.stepBackward100();
      expect(mockOpenRV.playback.step).toHaveBeenCalledWith(-100);
    });
  });

  // --- Misc ---

  describe('misc', () => {
    it('numFrames() returns total frames', () => {
      mockOpenRV.playback.getTotalFrames.mockReturnValue(250);
      expect(extra.numFrames()).toBe(250);
    });

    it('centerResizeFit() delegates to view.fitToWindow()', () => {
      extra.centerResizeFit();
      expect(mockOpenRV.view.fitToWindow).toHaveBeenCalledOnce();
    });

    it('currentImageAspect() computes aspect from resolution', () => {
      mockOpenRV.media.getResolution.mockReturnValue({ width: 1920, height: 1080 });
      expect(extra.currentImageAspect()).toBeCloseTo(1920 / 1080, 5);
    });
  });
});

// =====================================================================
// Registration Tests
// =====================================================================

describe('registerMuCompat', () => {
  it('registers window.rv.commands and window.rv.extra_commands', () => {
    const result = registerMuCompat();
    const g = globalThis as unknown as { rv?: { commands: unknown; extra_commands: unknown } };

    expect(g.rv).toBeDefined();
    expect(g.rv!.commands).toBeDefined();
    expect(g.rv!.extra_commands).toBeDefined();
    expect(result.commands).toBeInstanceOf(MuCommands);
    expect(result.extra_commands).toBeInstanceOf(MuExtraCommands);
  });

  it('does not overwrite existing window.rv', () => {
    const g = globalThis as unknown as { rv?: { commands: unknown; extra_commands: unknown } };
    const sentinel = { commands: 'existing', extra_commands: 'existing' };
    g.rv = sentinel as unknown as typeof g.rv;

    registerMuCompat();
    expect(g.rv).toBe(sentinel); // should not be overwritten
  });
});

// =====================================================================
// Constants Tests
// =====================================================================

describe('constants', () => {
  it('PlayLoop/PlayOnce/PlayPingPong have distinct values', () => {
    expect(PlayLoop).toBe(0);
    expect(PlayOnce).toBe(1);
    expect(PlayPingPong).toBe(2);
    expect(new Set([PlayLoop, PlayOnce, PlayPingPong]).size).toBe(3);
  });

  it('FilterNearest/FilterLinear have distinct values', () => {
    expect(FilterNearest).toBe(0);
    expect(FilterLinear).toBe(1);
    expect(FilterNearest).not.toBe(FilterLinear);
  });
});
