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
import { PlayLoop, PlayOnce, PlayPingPong, FilterNearest, FilterLinear } from '../constants';

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
      setPlayDirection: vi.fn(),
      getPlayDirection: vi.fn(() => 1),
      stop: vi.fn(),
      isBuffering: vi.fn((): boolean => false),
      getDroppedFrameCount: vi.fn((): number => 0),
    },
    media: {
      getFPS: vi.fn((): number => 24),
      getPlaybackFPS: vi.fn((): number => 24),
      setPlaybackFPS: vi.fn(),
      getResolution: vi.fn((): { width: number; height: number } => ({ width: 1920, height: 1080 })),
      hasMedia: vi.fn((): boolean => true),
      getStartFrame: vi.fn((): number => 1),
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
      getViewportSize: vi.fn((): { width: number; height: number } => ({ width: 1280, height: 720 })),
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

    it('isSupported never returns stub for any command (#555)', () => {
      // Regression: isSupported used to return 'stub' for some commands,
      // which violates the CommandSupportStatus type contract (true | false | 'partial').
      const allCommands = [
        'play',
        'stop',
        'isPlaying',
        'setFrame',
        'frame',
        'frameEnd',
        'fps',
        'setRealtime',
        'isRealtime',
        'setPlayMode',
        'playMode',
        'inPoint',
        'outPoint',
        'setInPoint',
        'setOutPoint',
        'frameStart',
        'setFPS',
        'realFPS',
        'setInc',
        'inc',
        'skipped',
        'isCurrentFrameIncomplete',
        'isCurrentFrameError',
        'isBuffering',
        'mbps',
        'resetMbps',
        'scrubAudio',
        'redraw',
        'viewSize',
        'setViewSize',
        'resizeFit',
        'fullScreenMode',
        'isFullScreen',
        'setWindowTitle',
        'setFiltering',
        'getFiltering',
        'setBGMethod',
        'bgMethod',
        'setMargins',
        'margins',
        'contentAspect',
        'devicePixelRatio',
        'markFrame',
        'isMarked',
        'markedFrames',
      ];
      for (const name of allCommands) {
        const status = cmd.isSupported(name);
        expect(status).not.toBe('stub');
        expect([true, false, 'partial']).toContain(status);
      }
    });

    it('isSupported marks stub-like commands as partial, not stub (#555)', () => {
      // These commands exist but only provide local-only behavior,
      // so they are 'partial' rather than the previously-used 'stub'.
      expect(cmd.isSupported('setViewSize')).toBe('partial');
      expect(cmd.isSupported('setMargins')).toBe('partial');
      expect(cmd.isSupported('margins')).toBe('partial');
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

    it('frameStart() delegates to openrv.media.getStartFrame()', () => {
      mockOpenRV.media.getStartFrame.mockReturnValue(1);
      expect(cmd.frameStart()).toBe(1);
      expect(mockOpenRV.media.getStartFrame).toHaveBeenCalled();
    });

    it('frameStart() returns real source start frame, not a hardcoded default', () => {
      mockOpenRV.media.getStartFrame.mockReturnValue(1001);
      expect(cmd.frameStart()).toBe(1001);
    });

    it('frameStart() reads from real API on every call (no local cache)', () => {
      mockOpenRV.media.getStartFrame.mockReturnValue(1);
      expect(cmd.frameStart()).toBe(1);

      mockOpenRV.media.getStartFrame.mockReturnValue(86400);
      expect(cmd.frameStart()).toBe(86400);
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

    it('setInc() delegates to openrv.playback.setPlayDirection()', () => {
      cmd.setInc(-1);
      expect(mockOpenRV.playback.setPlayDirection).toHaveBeenCalledWith(-1);
      cmd.setInc(1);
      expect(mockOpenRV.playback.setPlayDirection).toHaveBeenCalledWith(1);
    });

    it('inc() reads from the real API via getPlayDirection()', () => {
      mockOpenRV.playback.getPlayDirection.mockReturnValue(1);
      expect(cmd.inc()).toBe(1);
      expect(mockOpenRV.playback.getPlayDirection).toHaveBeenCalled();

      mockOpenRV.playback.getPlayDirection.mockReturnValue(-1);
      expect(cmd.inc()).toBe(-1);
    });

    it('setInc() forwards raw value to the real API (normalization is done by PlaybackEngine)', () => {
      cmd.setInc(5);
      expect(mockOpenRV.playback.setPlayDirection).toHaveBeenCalledWith(5);
      cmd.setInc(-3);
      expect(mockOpenRV.playback.setPlayDirection).toHaveBeenCalledWith(-3);
    });

    it('setInc() throws on invalid input', () => {
      expect(() => cmd.setInc(NaN)).toThrow(TypeError);
    });

    it('setInc() does not use local state — inc() always reads from real API', () => {
      // Simulate the real API returning -1 even though setInc was called with 1
      cmd.setInc(1);
      mockOpenRV.playback.getPlayDirection.mockReturnValue(-1);
      expect(cmd.inc()).toBe(-1);
      expect(mockOpenRV.playback.getPlayDirection).toHaveBeenCalled();
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

    it('skipped() delegates to playback.getDroppedFrameCount()', () => {
      mockOpenRV.playback.getDroppedFrameCount.mockReturnValue(0);
      expect(cmd.skipped()).toBe(0);

      mockOpenRV.playback.getDroppedFrameCount.mockReturnValue(5);
      expect(cmd.skipped()).toBe(5);
    });

    it('skipped() reads from session dropped frame count', () => {
      mockOpenRV.playback.getDroppedFrameCount.mockReturnValue(5);
      expect(cmd.skipped()).toBe(5);
    });

    it('skipped() tracks real skips as count increases', () => {
      mockOpenRV.playback.getDroppedFrameCount.mockReturnValue(1);
      expect(cmd.skipped()).toBe(1);
      mockOpenRV.playback.getDroppedFrameCount.mockReturnValue(3);
      expect(cmd.skipped()).toBe(3);
    });

    it('isCurrentFrameIncomplete() returns false (unsupported)', () => {
      expect(cmd.isCurrentFrameIncomplete()).toBe(false);
    });

    it('isCurrentFrameError() returns false (unsupported)', () => {
      expect(cmd.isCurrentFrameError()).toBe(false);
    });

    it('isBuffering() returns false by default', () => {
      expect(cmd.isBuffering()).toBe(false);
    });

    it('isBuffering() reflects session buffering state', () => {
      mockOpenRV.playback.isBuffering.mockReturnValue(true);
      expect(cmd.isBuffering()).toBe(true);
    });

    it('isBuffering() delegates to playback.isBuffering()', () => {
      mockOpenRV.playback.isBuffering.mockReturnValue(false);
      expect(cmd.isBuffering()).toBe(false);

      mockOpenRV.playback.isBuffering.mockReturnValue(true);
      expect(cmd.isBuffering()).toBe(true);
    });

    it('mbps() always returns 0 (unsupported)', () => {
      expect(cmd.mbps()).toBe(0);
    });

    it('resetMbps() is a no-op (unsupported)', () => {
      expect(() => cmd.resetMbps()).not.toThrow();
      expect(cmd.mbps()).toBe(0);
    });

    it('health commands return safe defaults when no session', () => {
      delete (globalThis as Record<string, unknown>).openrv;
      expect(cmd.isBuffering()).toBe(false);
      expect(cmd.skipped()).toBe(0);
      expect(cmd.isCurrentFrameIncomplete()).toBe(false);
      expect(cmd.isCurrentFrameError()).toBe(false);
      expect(cmd.mbps()).toBe(0);
    });

    it('isCurrentFrameIncomplete is marked unsupported', () => {
      expect(cmd.isSupported('isCurrentFrameIncomplete')).toBe(false);
    });

    it('isCurrentFrameError is marked unsupported', () => {
      expect(cmd.isSupported('isCurrentFrameError')).toBe(false);
    });

    it('mbps is marked unsupported', () => {
      expect(cmd.isSupported('mbps')).toBe(false);
    });

    it('resetMbps is marked unsupported', () => {
      expect(cmd.isSupported('resetMbps')).toBe(false);
    });

    it('skipped is marked supported', () => {
      expect(cmd.isSupported('skipped')).toBe(true);
    });

    it('isBuffering is marked supported', () => {
      expect(cmd.isSupported('isBuffering')).toBe(true);
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

    it('viewSize() reads from openrv.view.getViewportSize(), not DOM canvas', () => {
      mockOpenRV.view.getViewportSize.mockReturnValue({ width: 1920, height: 1080 });
      const size = cmd.viewSize();
      expect(size).toEqual([1920, 1080]);
      expect(mockOpenRV.view.getViewportSize).toHaveBeenCalled();
    });

    it('viewSize() returns [width, height] from the real viewer API', () => {
      mockOpenRV.view.getViewportSize.mockReturnValue({ width: 800, height: 600 });
      const size = cmd.viewSize();
      expect(Array.isArray(size)).toBe(true);
      expect(size).toHaveLength(2);
      expect(size[0]).toBe(800);
      expect(size[1]).toBe(600);
    });

    it('viewSize() does not query document.querySelector("canvas")', () => {
      const spy = vi.spyOn(document, 'querySelector');
      cmd.viewSize();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('setViewSize() is marked as partial', () => {
      expect(cmd.isSupported('setViewSize')).toBe('partial');
    });

    it('setViewSize() validates arguments but does not modify DOM', () => {
      expect(() => cmd.setViewSize(NaN, 100)).toThrow(TypeError);
      expect(() => cmd.setViewSize(100, NaN)).toThrow(TypeError);
      // Valid call does not throw
      expect(() => cmd.setViewSize(800, 600)).not.toThrow();
    });

    it('setViewSize() does not query document.querySelector("canvas")', () => {
      const spy = vi.spyOn(document, 'querySelector');
      cmd.setViewSize(800, 600);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('resizeFit() delegates to view.fitToWindow()', () => {
      cmd.resizeFit();
      expect(mockOpenRV.view.fitToWindow).toHaveBeenCalledOnce();
    });

    it('isFullScreen() returns a boolean', () => {
      expect(typeof cmd.isFullScreen()).toBe('boolean');
    });

    it('isFullScreen() detects webkitFullscreenElement', () => {
      Object.defineProperty(document, 'webkitFullscreenElement', {
        value: document.documentElement,
        configurable: true,
      });
      expect(cmd.isFullScreen()).toBe(true);
      Object.defineProperty(document, 'webkitFullscreenElement', {
        value: undefined,
        configurable: true,
      });
    });

    it('fullScreenMode(true) falls back to webkitRequestFullscreen', async () => {
      const origRFS = document.documentElement.requestFullscreen;
      const webkitMock = vi.fn();
      (document.documentElement as any).requestFullscreen = undefined;
      (document.documentElement as any).webkitRequestFullscreen = webkitMock;

      await cmd.fullScreenMode(true);
      expect(webkitMock).toHaveBeenCalledOnce();

      document.documentElement.requestFullscreen = origRFS;
      delete (document.documentElement as any).webkitRequestFullscreen;
    });

    it('fullScreenMode(false) falls back to webkitExitFullscreen', async () => {
      const origEFS = document.exitFullscreen;
      const webkitMock = vi.fn();
      (document as any).exitFullscreen = undefined;
      (document as any).webkitExitFullscreen = webkitMock;

      await cmd.fullScreenMode(false);
      expect(webkitMock).toHaveBeenCalledOnce();

      document.exitFullscreen = origEFS;
      delete (document as any).webkitExitFullscreen;
    });

    it('fullScreenMode(true) prefers standard requestFullscreen over webkit', async () => {
      const standardMock = vi.fn().mockResolvedValue(undefined);
      const webkitMock = vi.fn();
      const origRFS = document.documentElement.requestFullscreen;
      document.documentElement.requestFullscreen = standardMock;
      (document.documentElement as any).webkitRequestFullscreen = webkitMock;

      await cmd.fullScreenMode(true);
      expect(standardMock).toHaveBeenCalledOnce();
      expect(webkitMock).not.toHaveBeenCalled();

      document.documentElement.requestFullscreen = origRFS;
      delete (document.documentElement as any).webkitRequestFullscreen;
    });

    it('fullScreenMode(true) handles promise rejection', async () => {
      const origRFS = document.documentElement.requestFullscreen;
      document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));

      // Should not throw — rejection is caught internally
      await cmd.fullScreenMode(true);

      document.documentElement.requestFullscreen = origRFS;
    });

    it('fullScreenMode(false) handles exit fullscreen promise rejection', async () => {
      const origEFS = document.exitFullscreen;
      document.exitFullscreen = vi.fn().mockRejectedValue(new Error('not in fullscreen'));

      // Should not throw — rejection is caught internally
      await cmd.fullScreenMode(false);

      document.exitFullscreen = origEFS;
    });

    it('fullScreenMode(true) handles webkit promise rejection', async () => {
      const origRFS = document.documentElement.requestFullscreen;
      (document.documentElement as any).requestFullscreen = undefined;
      (document.documentElement as any).webkitRequestFullscreen = vi.fn().mockRejectedValue(new Error('webkit denied'));

      // Should not throw — rejection is caught internally
      await cmd.fullScreenMode(true);

      document.documentElement.requestFullscreen = origRFS;
      delete (document.documentElement as any).webkitRequestFullscreen;
    });

    it('fullScreenMode(false) handles webkit exit promise rejection', async () => {
      const origEFS = document.exitFullscreen;
      (document as any).exitFullscreen = undefined;
      (document as any).webkitExitFullscreen = vi.fn().mockRejectedValue(new Error('webkit exit denied'));

      // Should not throw — rejection is caught internally
      await cmd.fullScreenMode(false);

      document.exitFullscreen = origEFS;
      delete (document as any).webkitExitFullscreen;
    });

    it('fullScreenMode returns a Promise', () => {
      const result = cmd.fullScreenMode(true);
      expect(result).toBeInstanceOf(Promise);
    });

    it('fullScreenMode resolves without error', async () => {
      await expect(cmd.fullScreenMode(true)).resolves.toBeUndefined();
    });

    it('fullScreenMode(false) returns a Promise that resolves', async () => {
      const result = cmd.fullScreenMode(false);
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('isAsync matches actual return type for all ASYNC_COMMANDS', () => {
      const asyncCommands = ['fullScreenMode'];
      for (const name of asyncCommands) {
        expect(cmd.isAsync(name)).toBe(true);
        const method = (cmd as any)[name];
        expect(typeof method).toBe('function');
        const result = method.call(cmd, true);
        expect(result).toBeInstanceOf(Promise);
      }
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
      mockOpenRV.view.getBackgroundPattern.mockReturnValue({
        pattern: 'checker',
        checkerSize: 'medium',
        customColor: '#1a1a1a',
      });
      expect(cmd.bgMethod()).toBe('checker');
      expect(mockOpenRV.view.getBackgroundPattern).toHaveBeenCalled();
    });

    it('setBGMethod() throws on non-string', () => {
      expect(() => cmd.setBGMethod(123 as unknown as string)).toThrow(TypeError);
    });

    it('setMargins/margins are marked as partial, not fully supported', () => {
      expect(cmd.isSupported('setMargins')).toBe('partial');
      expect(cmd.isSupported('margins')).toBe('partial');
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

    describe('feedback queue drain', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('displays all 3 queued messages in order', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedbackQueue('msg1', 1.0);
        extra.displayFeedbackQueue('msg2', 1.0);
        extra.displayFeedbackQueue('msg3', 1.0);

        // msg1 shown immediately
        expect(spy).toHaveBeenCalledWith('[RV Feedback] msg1');
        expect(spy).toHaveBeenCalledTimes(1);

        // After 1s, msg1 expires → msg2 shown
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] msg2');
        expect(spy).toHaveBeenCalledTimes(2);

        // After another 1s, msg2 expires → msg3 shown
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] msg3');
        expect(spy).toHaveBeenCalledTimes(3);

        spy.mockRestore();
      });

      it('each message is displayed only after the previous timeout expires', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedbackQueue('a', 2.0);
        extra.displayFeedbackQueue('b', 1.0);

        expect(spy).toHaveBeenCalledTimes(1);

        // Half-way through first message — second should not appear yet
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledTimes(1);

        // First message expires
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenLastCalledWith('[RV Feedback] b');

        spy.mockRestore();
      });

      it('messages added during drain are also eventually displayed', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedbackQueue('first', 1.0);

        // While first is showing, add another
        extra.displayFeedbackQueue('second', 1.0);

        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] second');

        // Add one more during second
        extra.displayFeedbackQueue('third', 1.0);

        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] third');
        expect(spy).toHaveBeenCalledTimes(3);

        spy.mockRestore();
      });

      it('queue is fully empty after all messages are shown', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedbackQueue('x', 0.5);
        extra.displayFeedbackQueue('y', 0.5);

        vi.advanceTimersByTime(500);
        vi.advanceTimersByTime(500);

        // Access private feedbackQueue via cast
        const queue = (extra as unknown as { feedbackQueue: unknown[] }).feedbackQueue;
        expect(queue).toHaveLength(0);

        spy.mockRestore();
      });

      it('zero-duration middle message does not stall the drain loop', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedbackQueue('first', 1.0);
        extra.displayFeedbackQueue('mid-zero', 0);
        extra.displayFeedbackQueue('last', 1.0);

        // first shown immediately
        expect(spy).toHaveBeenCalledWith('[RV Feedback] first');
        expect(spy).toHaveBeenCalledTimes(1);

        // After 1s first expires → mid-zero shown
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] mid-zero');
        expect(spy).toHaveBeenCalledTimes(2);

        // Flush the setTimeout(cb, 0) for mid-zero → last shown
        vi.advanceTimersByTime(1);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] last');
        expect(spy).toHaveBeenCalledTimes(3);

        // After last expires, _currentFeedback is cleared
        vi.advanceTimersByTime(1000);
        const current = (extra as unknown as { _currentFeedback: string | null })._currentFeedback;
        expect(current).toBeNull();

        spy.mockRestore();
      });

      it('zero-duration first message still drains to normal second message', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedbackQueue('zero-first', 0);
        extra.displayFeedbackQueue('normal-second', 1.0);

        // zero-first shown immediately
        expect(spy).toHaveBeenCalledWith('[RV Feedback] zero-first');
        expect(spy).toHaveBeenCalledTimes(1);

        // Flush the setTimeout(cb, 0) → zero-first cleared → normal-second shown
        vi.advanceTimersByTime(1);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] normal-second');
        expect(spy).toHaveBeenCalledTimes(2);

        // After 1s, normal-second cleared
        vi.advanceTimersByTime(1000);
        const current = (extra as unknown as { _currentFeedback: string | null })._currentFeedback;
        expect(current).toBeNull();

        spy.mockRestore();
      });

      it('_currentFeedback is null after last zero-duration message drains', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedbackQueue('only-zero', 0);

        expect(spy).toHaveBeenCalledWith('[RV Feedback] only-zero');

        // Flush the setTimeout(cb, 0) → cleared
        vi.advanceTimersByTime(1);
        const current = (extra as unknown as { _currentFeedback: string | null })._currentFeedback;
        expect(current).toBeNull();

        const queue = (extra as unknown as { feedbackQueue: unknown[] }).feedbackQueue;
        expect(queue).toHaveLength(0);

        spy.mockRestore();
      });

      it('single displayFeedback() call still works without queue', () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        extra.displayFeedback('standalone', 1.0);
        expect(spy).toHaveBeenCalledWith('[RV Feedback] standalone');

        vi.advanceTimersByTime(1000);
        // No errors, _currentFeedback cleared
        const current = (extra as unknown as { _currentFeedback: string | null })._currentFeedback;
        expect(current).toBeNull();
        expect(spy).toHaveBeenCalledTimes(1);

        spy.mockRestore();
      });
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
      mockOpenRV.media.getStartFrame.mockReturnValue(1);
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

    it('isNarrowed() uses real frameStart (not hardcoded 1) for comparison', () => {
      // Sequence starts at frame 1001, in/out match the full range
      mockOpenRV.media.getStartFrame.mockReturnValue(1001);
      mockOpenRV.loop.getInPoint.mockReturnValue(1001);
      mockOpenRV.loop.getOutPoint.mockReturnValue(100);
      mockOpenRV.playback.getTotalFrames.mockReturnValue(100);
      expect(extra.isNarrowed()).toBe(false);
    });

    it('isNarrowed() detects narrowing with non-default frameStart', () => {
      mockOpenRV.media.getStartFrame.mockReturnValue(1001);
      mockOpenRV.loop.getInPoint.mockReturnValue(1010);
      mockOpenRV.loop.getOutPoint.mockReturnValue(100);
      mockOpenRV.playback.getTotalFrames.mockReturnValue(100);
      expect(extra.isNarrowed()).toBe(true);
    });

    it('isPlayable() returns true when range > 1 frame', () => {
      mockOpenRV.playback.getTotalFrames.mockReturnValue(100);
      expect(extra.isPlayable()).toBe(true);
    });

    it('isPlayable() returns false for single-frame source', () => {
      mockOpenRV.media.getStartFrame.mockReturnValue(1);
      mockOpenRV.playback.getTotalFrames.mockReturnValue(1);
      expect(extra.isPlayable()).toBe(false);
    });

    it('isPlayable() uses real frameStart for comparison', () => {
      // frameStart=1001, frameEnd=1001 -> not playable (single frame)
      mockOpenRV.media.getStartFrame.mockReturnValue(1001);
      mockOpenRV.playback.getTotalFrames.mockReturnValue(1001);
      expect(extra.isPlayable()).toBe(false);

      // frameStart=1001, frameEnd=1100 -> playable
      mockOpenRV.playback.getTotalFrames.mockReturnValue(1100);
      expect(extra.isPlayable()).toBe(true);
    });

    it('isPlayingForwards() returns true when playing forward', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      mockOpenRV.playback.getPlayDirection.mockReturnValue(1);
      expect(extra.isPlayingForwards()).toBe(true);
    });

    it('isPlayingForwards() returns false when not playing', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(false);
      mockOpenRV.playback.getPlayDirection.mockReturnValue(1);
      expect(extra.isPlayingForwards()).toBe(false);
    });

    it('isPlayingBackwards() returns true when playing backward', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      mockOpenRV.playback.getPlayDirection.mockReturnValue(-1);
      expect(extra.isPlayingBackwards()).toBe(true);
    });

    it('isPlayingBackwards() returns false when playing forward', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      mockOpenRV.playback.getPlayDirection.mockReturnValue(1);
      expect(extra.isPlayingBackwards()).toBe(false);
    });

    it('isPlayingBackwards() reflects real playback state, not local bookkeeping', () => {
      mockOpenRV.playback.isPlaying.mockReturnValue(true);
      // Real API says reverse
      mockOpenRV.playback.getPlayDirection.mockReturnValue(-1);
      expect(extra.isPlayingBackwards()).toBe(true);
      // Real API changes to forward
      mockOpenRV.playback.getPlayDirection.mockReturnValue(1);
      expect(extra.isPlayingBackwards()).toBe(false);
    });
  });

  // --- Playback Toggles ---

  describe('playback toggles', () => {
    it('togglePlay() delegates to playback.toggle()', () => {
      extra.togglePlay();
      expect(mockOpenRV.playback.toggle).toHaveBeenCalledOnce();
    });

    it('toggleForwardsBackwards() flips direction via real API', () => {
      mockOpenRV.playback.getPlayDirection.mockReturnValue(1);
      extra.toggleForwardsBackwards();
      expect(mockOpenRV.playback.setPlayDirection).toHaveBeenCalledWith(-1);

      mockOpenRV.playback.getPlayDirection.mockReturnValue(-1);
      extra.toggleForwardsBackwards();
      expect(mockOpenRV.playback.setPlayDirection).toHaveBeenCalledWith(1);
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
