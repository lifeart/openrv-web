/**
 * OpenRV Scripting API - Comprehensive Unit Tests
 *
 * Tests for all API modules: OpenRVAPI, PlaybackAPI, MediaAPI, AudioAPI,
 * LoopAPI, ViewAPI, ColorAPI, MarkersAPI, EventsAPI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from '../utils/EventEmitter';
import { OpenRVAPI } from './OpenRVAPI';
import { PlaybackAPI } from './PlaybackAPI';
import { MediaAPI } from './MediaAPI';
import { AudioAPI } from './AudioAPI';
import { LoopAPI } from './LoopAPI';
import { ViewAPI } from './ViewAPI';
import { ColorAPI } from './ColorAPI';
import { MarkersAPI } from './MarkersAPI';
import { EventsAPI } from './EventsAPI';
import type { OpenRVAPIConfig } from './OpenRVAPI';
import { pluginRegistry } from '../plugin/PluginRegistry';
import type { Plugin, PluginContext } from '../plugin/types';
import { version as packageVersion } from '../../package.json';

// ============================================================
// Mock Factories
// ============================================================

function createMockSession() {
  const session = new EventEmitter() as any;
  session._currentFrame = 1;
  session._isPlaying = false;
  session._playbackSpeed = 1;
  session._volume = 0.7;
  session._muted = false;
  session._preservesPitch = true;
  session._loopMode = 'loop';
  session._inPoint = 1;
  session._outPoint = 100;
  session._fps = 24;
  session._marks = new Map();
  session._playDirection = 1;

  // Getters/setters
  Object.defineProperty(session, 'currentFrame', {
    get: () => session._currentFrame,
    set: (v: number) => {
      const clamped = Math.max(1, Math.min(session.currentSource?.duration ?? 100, Math.round(v)));
      if (clamped !== session._currentFrame) {
        session._currentFrame = clamped;
        session.emit('frameChanged', session._currentFrame);
      }
    },
  });
  Object.defineProperty(session, 'isPlaying', { get: () => session._isPlaying });
  Object.defineProperty(session, 'playbackSpeed', {
    get: () => session._playbackSpeed,
    set: (v: number) => {
      const clamped = Math.max(0.1, Math.min(8, v));
      session._playbackSpeed = clamped;
      session.emit('playbackSpeedChanged', session._playbackSpeed);
    },
  });
  Object.defineProperty(session, 'volume', {
    get: () => session._volume,
    set: (v: number) => {
      session._volume = Math.max(0, Math.min(1, v));
      session.emit('volumeChanged', session._volume);
    },
  });
  Object.defineProperty(session, 'muted', {
    get: () => session._muted,
    set: (v: boolean) => {
      session._muted = v;
      session.emit('mutedChanged', session._muted);
    },
  });
  Object.defineProperty(session, 'preservesPitch', {
    get: () => session._preservesPitch,
    set: (v: boolean) => {
      session._preservesPitch = v;
      session.emit('preservesPitchChanged', session._preservesPitch);
    },
  });
  Object.defineProperty(session, 'loopMode', {
    get: () => session._loopMode,
    set: (v: string) => {
      session._loopMode = v;
      session.emit('loopModeChanged', v);
    },
  });
  Object.defineProperty(session, 'inPoint', { get: () => session._inPoint });
  Object.defineProperty(session, 'outPoint', { get: () => session._outPoint });
  Object.defineProperty(session, 'fps', {
    get: () => session._fps,
    set: (v: number) => {
      session._fps = v;
    },
  });
  Object.defineProperty(session, 'playDirection', { get: () => session._playDirection });
  Object.defineProperty(session, 'marks', { get: () => session._marks });
  Object.defineProperty(session, 'sourceCount', { get: () => session.sources?.length ?? 0 });
  session._currentSource = {
    name: 'test.mp4',
    type: 'video',
    width: 1920,
    height: 1080,
    duration: 100,
    fps: 24,
  };
  Object.defineProperty(session, 'currentSource', {
    get: () => session._currentSource,
    configurable: true,
  });
  Object.defineProperty(session, 'markedFrames', {
    get: () => Array.from(session._marks.keys()),
  });

  // Methods
  session.play = vi.fn(() => {
    session._isPlaying = true;
    session.emit('playbackChanged', true);
  });
  session.pause = vi.fn(() => {
    session._isPlaying = false;
    session.emit('playbackChanged', false);
  });
  session.togglePlayback = vi.fn(() => {
    if (session._isPlaying) {
      session.pause();
    } else {
      session.play();
    }
  });
  session.goToFrame = vi.fn((frame: number) => {
    session.currentFrame = frame;
  });
  session.goToStart = vi.fn(() => {
    session.currentFrame = session._inPoint;
  });
  session.stop = vi.fn(() => {
    session.pause();
    session.goToStart();
    session.emit('playbackStopped', undefined);
  });
  session.goToEnd = vi.fn(() => {
    session.currentFrame = session._outPoint;
  });
  session.stepForward = vi.fn(() => {
    session.currentFrame = session._currentFrame + 1;
  });
  session.stepBackward = vi.fn(() => {
    session.currentFrame = Math.max(1, session._currentFrame - 1);
  });
  session.setInPoint = vi.fn((frame?: number) => {
    session._inPoint = frame ?? session._currentFrame;
    session.emit('inOutChanged', { inPoint: session._inPoint, outPoint: session._outPoint });
  });
  session.setOutPoint = vi.fn((frame?: number) => {
    session._outPoint = frame ?? session._currentFrame;
    session.emit('inOutChanged', { inPoint: session._inPoint, outPoint: session._outPoint });
  });
  session.resetInOutPoints = vi.fn(() => {
    session._inPoint = 1;
    session._outPoint = 100;
    session.emit('inOutChanged', { inPoint: session._inPoint, outPoint: session._outPoint });
  });
  session.toggleMute = vi.fn(() => {
    session.muted = !session._muted;
  });
  session.setMarker = vi.fn((frame: number, note?: string, color?: string, endFrame?: number) => {
    const marker: any = { frame, note: note ?? '', color: color ?? '#ff4444' };
    if (endFrame !== undefined && endFrame > frame) {
      marker.endFrame = endFrame;
    }
    session._marks.set(frame, marker);
    session.emit('marksChanged', session._marks);
  });
  session.setMarkerEndFrame = vi.fn((frame: number, endFrame: number | undefined) => {
    const marker = session._marks.get(frame);
    if (marker) {
      if (endFrame !== undefined && endFrame > frame) {
        marker.endFrame = endFrame;
      } else {
        delete marker.endFrame;
      }
      session.emit('marksChanged', session._marks);
    }
  });
  session.getMarkerAtFrame = vi.fn((frame: number) => {
    // Check exact match first
    const exact = session._marks.get(frame);
    if (exact) return exact;
    // Check duration marker ranges
    for (const marker of session._marks.values()) {
      if (marker.endFrame !== undefined && frame >= marker.frame && frame <= marker.endFrame) {
        return marker;
      }
    }
    return undefined;
  });
  session.removeMark = vi.fn((frame: number) => {
    session._marks.delete(frame);
    session.emit('marksChanged', session._marks);
  });
  session.getMarker = vi.fn((frame: number) => session._marks.get(frame));
  session.hasMarker = vi.fn((frame: number) => session._marks.has(frame));
  session.clearMarks = vi.fn(() => {
    session._marks.clear();
    session.emit('marksChanged', session._marks);
  });
  session.goToNextMarker = vi.fn(() => {
    const frames = (Array.from(session._marks.keys()) as number[]).sort((a, b) => a - b);
    for (const frame of frames) {
      if (frame > session._currentFrame) {
        session.currentFrame = frame;
        return frame;
      }
    }
    return null;
  });
  session.goToPreviousMarker = vi.fn(() => {
    const frames = (Array.from(session._marks.keys()) as number[]).sort((a, b) => b - a);
    for (const frame of frames) {
      if (frame < session._currentFrame) {
        session.currentFrame = frame;
        return frame;
      }
    }
    return null;
  });

  session.sources = [{ name: 'test.mp4', type: 'video', width: 1920, height: 1080, duration: 100, fps: 24 }];
  session.loadSourceFromUrl = vi.fn().mockResolvedValue(undefined);
  session.clearSources = vi.fn();

  // A/B compare state (defaults to inactive)
  session._abCompareAvailable = false;
  session._sourceB = null;
  Object.defineProperty(session, 'abCompareAvailable', {
    get: () => session._abCompareAvailable,
    configurable: true,
  });
  Object.defineProperty(session, 'sourceB', {
    get: () => session._sourceB,
    configurable: true,
  });

  return session;
}

function createMockViewer() {
  const viewer = new EventEmitter() as any;
  viewer._zoom = 1;
  viewer._panX = 0;
  viewer._panY = 0;
  viewer._channelMode = 'rgb';

  viewer.setZoom = vi.fn((level: number) => {
    viewer._zoom = level;
  });
  viewer.getZoom = vi.fn(() => viewer._zoom);
  viewer.fitToWindow = vi.fn(() => {
    viewer._zoom = 1;
    viewer._fitMode = 'all';
  });
  viewer.fitToWidth = vi.fn(() => {
    viewer._fitMode = 'width';
  });
  viewer.fitToHeight = vi.fn(() => {
    viewer._fitMode = 'height';
  });
  viewer._fitMode = null;
  viewer.getFitMode = vi.fn(() => viewer._fitMode);
  viewer.setPan = vi.fn((x: number, y: number) => {
    viewer._panX = x;
    viewer._panY = y;
  });
  viewer.getPan = vi.fn(() => ({ x: viewer._panX, y: viewer._panY }));
  viewer.setChannelMode = vi.fn((mode: string) => {
    viewer._channelMode = mode;
  });
  viewer.getChannelMode = vi.fn(() => viewer._channelMode);
  viewer._filterMode = 'linear';
  viewer.setFilterMode = vi.fn((mode: string) => {
    viewer._filterMode = mode;
  });
  viewer.getFilterMode = vi.fn(() => viewer._filterMode);
  viewer._backgroundPatternState = { pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' };
  viewer.setBackgroundPatternState = vi.fn((state: any) => {
    viewer._backgroundPatternState = state;
  });
  viewer.getBackgroundPatternState = vi.fn(() => viewer._backgroundPatternState);
  viewer.getViewportSize = vi.fn(() => ({ width: 1280, height: 720 }));

  viewer._matteSettings = {
    show: false,
    aspect: 1.78,
    opacity: 0.66,
    heightVisible: -1,
    centerPoint: [0, 0],
  };
  viewer.getMatteSettings = vi.fn(() => ({ ...viewer._matteSettings }));
  viewer.setMatteSettings = vi.fn((settings: any) => {
    viewer._matteSettings = { ...viewer._matteSettings, ...settings };
  });

  return viewer;
}

function createMockColorControls() {
  const colorControls = {
    _adjustments: {
      exposure: 0,
      gamma: 1,
      saturation: 1,
      vibrance: 0,
      vibranceSkinProtection: true,
      contrast: 1,
      clarity: 0,
      hueRotation: 0,
      temperature: 0,
      tint: 0,
      brightness: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    },
    getAdjustments: vi.fn(function (this: any) {
      return { ...this._adjustments };
    }),
    setAdjustments: vi.fn(function (this: any, adj: any) {
      this._adjustments = { ...adj };
    }),
    reset: vi.fn(function (this: any) {
      this._adjustments = {
        exposure: 0,
        gamma: 1,
        saturation: 1,
        vibrance: 0,
        vibranceSkinProtection: true,
        contrast: 1,
        clarity: 0,
        hueRotation: 0,
        temperature: 0,
        tint: 0,
        brightness: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
      };
    }),
  };
  return colorControls;
}

function createMockCDLControl() {
  const cdlControl = {
    _cdl: {
      slope: { r: 1.0, g: 1.0, b: 1.0 },
      offset: { r: 0.0, g: 0.0, b: 0.0 },
      power: { r: 1.0, g: 1.0, b: 1.0 },
      saturation: 1.0,
    },
    getCDL: vi.fn(function (this: any) {
      return JSON.parse(JSON.stringify(this._cdl));
    }),
    setCDL: vi.fn(function (this: any, cdl: any) {
      this._cdl = JSON.parse(JSON.stringify(cdl));
    }),
  };
  return cdlControl;
}

function createMockCurvesControl() {
  const cloneCurves = (curves: any) => ({
    master: { enabled: curves.master.enabled, points: curves.master.points.map((p: any) => ({ x: p.x, y: p.y })) },
    red: { enabled: curves.red.enabled, points: curves.red.points.map((p: any) => ({ x: p.x, y: p.y })) },
    green: { enabled: curves.green.enabled, points: curves.green.points.map((p: any) => ({ x: p.x, y: p.y })) },
    blue: { enabled: curves.blue.enabled, points: curves.blue.points.map((p: any) => ({ x: p.x, y: p.y })) },
  });

  const defaultCurves = {
    master: {
      enabled: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    red: {
      enabled: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    green: {
      enabled: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    blue: {
      enabled: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
  };

  const curvesControl = {
    _curves: cloneCurves(defaultCurves),
    getCurves: vi.fn(function (this: any) {
      return cloneCurves(this._curves);
    }),
    setCurves: vi.fn(function (this: any, curves: any) {
      this._curves = cloneCurves(curves);
    }),
  };
  return curvesControl;
}

function createAPIConfig(): OpenRVAPIConfig {
  return {
    session: createMockSession(),
    viewer: createMockViewer(),
    colorControls: createMockColorControls() as any,
    cdlControl: createMockCDLControl() as any,
    curvesControl: createMockCurvesControl() as any,
  };
}

// ============================================================
// OpenRVAPI Core Tests
// ============================================================

describe('OpenRVAPI', () => {
  let api: OpenRVAPI;
  let config: OpenRVAPIConfig;

  beforeEach(() => {
    config = createAPIConfig();
    api = new OpenRVAPI(config);
    api.markReady();
  });

  it('API-U001: Constructor initializes all sub-modules', () => {
    expect(api.playback).toBeDefined();
    expect(api.media).toBeDefined();
    expect(api.audio).toBeDefined();
    expect(api.loop).toBeDefined();
    expect(api.view).toBeDefined();
    expect(api.color).toBeDefined();
    expect(api.markers).toBeDefined();
    expect(api.events).toBeDefined();
  });

  it('API-U002: Version string is valid semver', () => {
    expect(api.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('API-U003: isReady() returns false before markReady(), true after', () => {
    const freshApi = new OpenRVAPI(config);
    expect(freshApi.isReady()).toBe(false);
    freshApi.markReady();
    expect(freshApi.isReady()).toBe(true);
    freshApi.dispose();
  });

  it('API-U004: isReady() returns false after dispose', () => {
    api.dispose();
    expect(api.isReady()).toBe(false);
  });

  it('API-U005: Initialization is idempotent (multiple constructions)', () => {
    const api2 = new OpenRVAPI(config);
    api2.markReady();
    expect(api2.isReady()).toBe(true);
    expect(api2.version).toBe(api.version);
    api2.dispose();
  });

  it('API-U006: dispose() is idempotent (double dispose)', () => {
    api.dispose();
    expect(() => api.dispose()).not.toThrow();
    expect(api.isReady()).toBe(false);
  });

  it('API-U007: sub-module properties are instances of their respective classes', () => {
    // Sub-modules should be properly typed instances
    expect(api.playback).toBeInstanceOf(PlaybackAPI);
    expect(api.media).toBeInstanceOf(MediaAPI);
    expect(api.audio).toBeInstanceOf(AudioAPI);
    expect(api.loop).toBeInstanceOf(LoopAPI);
    expect(api.view).toBeInstanceOf(ViewAPI);
    expect(api.color).toBeInstanceOf(ColorAPI);
    expect(api.markers).toBeInstanceOf(MarkersAPI);
    expect(api.events).toBeInstanceOf(EventsAPI);
  });

  it('API-U008: version is a valid string', () => {
    expect(typeof api.version).toBe('string');
    expect(api.version).toBe(packageVersion);
  });

  it('API-U009: hot-reload scenario - disposing old instance prevents duplicate event forwarding', () => {
    const handler = vi.fn();
    api.events.on('frameChange', handler);

    // Simulate hot-reload: dispose old, create new
    api.dispose();
    const api2 = new OpenRVAPI(config);
    const handler2 = vi.fn();
    api2.events.on('frameChange', handler2);

    // Emit on the shared session
    (config.session as any).emit('frameChanged', 42);

    // Old handler should NOT fire (was disposed)
    expect(handler).not.toHaveBeenCalled();
    // New handler should fire
    expect(handler2).toHaveBeenCalledWith({ frame: 42 });

    api2.dispose();
  });
});

// ============================================================
// PlaybackAPI Tests
// ============================================================

// Tests verify observable behavior (state changes, output values)
// rather than internal method calls
describe('PlaybackAPI', () => {
  let playback: PlaybackAPI;
  let session: any;

  beforeEach(() => {
    session = createMockSession();
    playback = new PlaybackAPI(session);
  });

  it('API-U010: play() starts playback', () => {
    playback.play();
    expect(playback.isPlaying()).toBe(true);
  });

  it('API-U011: pause() stops playback', () => {
    playback.play();
    playback.pause();
    expect(playback.isPlaying()).toBe(false);
  });

  it('API-U012: toggle() toggles playback state', () => {
    expect(playback.isPlaying()).toBe(false);
    playback.toggle();
    expect(playback.isPlaying()).toBe(true);
    playback.toggle();
    expect(playback.isPlaying()).toBe(false);
  });

  it('API-U013: stop() pauses and seeks to start', () => {
    session._currentFrame = 50;
    playback.stop();
    expect(playback.isPlaying()).toBe(false);
    expect(playback.getCurrentFrame()).toBe(session._inPoint);
  });

  it('API-U014: seek() validates frame number', () => {
    expect(() => playback.seek(NaN)).toThrow();
    expect(() => playback.seek('abc' as any)).toThrow();
  });

  it('API-U015: seek() updates current frame', () => {
    playback.seek(50);
    expect(playback.getCurrentFrame()).toBe(50);
  });

  it('API-U016: step(1) increments frame', () => {
    const before = playback.getCurrentFrame();
    playback.step(1);
    expect(playback.getCurrentFrame()).toBe(before + 1);
  });

  it('API-U017: step(-1) decrements frame', () => {
    session._currentFrame = 10;
    playback.step(-1);
    expect(playback.getCurrentFrame()).toBe(9);
  });

  it('API-U018: setSpeed() validates speed value', () => {
    expect(() => playback.setSpeed(NaN)).toThrow();
    expect(() => playback.setSpeed('fast' as any)).toThrow();
  });

  it('API-U019: setSpeed() sets session speed (clamped by session)', () => {
    playback.setSpeed(2);
    expect(session.playbackSpeed).toBe(2);
  });

  it('API-U020: getSpeed() returns session speed', () => {
    session._playbackSpeed = 4;
    expect(playback.getSpeed()).toBe(4);
  });

  it('API-U021: isPlaying() returns session state', () => {
    expect(playback.isPlaying()).toBe(false);
    session._isPlaying = true;
    expect(playback.isPlaying()).toBe(true);
  });

  it('API-U022: getCurrentFrame() returns session frame', () => {
    session._currentFrame = 42;
    expect(playback.getCurrentFrame()).toBe(42);
  });

  it('API-U023: getTotalFrames() returns source duration', () => {
    expect(playback.getTotalFrames()).toBe(100);
  });

  it('API-U024: step() defaults to forward', () => {
    const before = playback.getCurrentFrame();
    playback.step();
    expect(playback.getCurrentFrame()).toBe(before + 1);
  });

  it('API-U025: step(0) is a no-op', () => {
    playback.step(0);
    expect(session.stepForward).not.toHaveBeenCalled();
    expect(session.stepBackward).not.toHaveBeenCalled();
  });

  it('API-U026: step() validates direction', () => {
    expect(() => playback.step(NaN)).toThrow();
    expect(() => playback.step('abc' as any)).toThrow();
  });

  it('API-U026b: step() rejects Infinity and -Infinity', () => {
    expect(() => playback.step(Infinity)).toThrow('step() requires a valid number');
    expect(() => playback.step(-Infinity)).toThrow('step() requires a valid number');
  });

  it('API-U027: step(3) steps forward 3 frames', () => {
    const before = playback.getCurrentFrame();
    playback.step(3);
    expect(playback.getCurrentFrame()).toBe(before + 3);
  });

  it('API-U028: step(-2) steps backward 2 frames', () => {
    session._currentFrame = 10;
    playback.step(-2);
    expect(playback.getCurrentFrame()).toBe(8);
  });

  it('API-U029: setSpeed() clamps to 0.1-8 range at API level', () => {
    playback.setSpeed(0.01);
    expect(session.playbackSpeed).toBe(0.1);
    playback.setSpeed(100);
    expect(session.playbackSpeed).toBe(8);
  });

  it('API-U029b: seek() with Infinity throws', () => {
    expect(() => playback.seek(Infinity)).toThrow('seek() requires a valid frame number');
    expect(() => playback.seek(-Infinity)).toThrow('seek() requires a valid frame number');
  });

  it('API-U029c: getTotalFrames() returns 0 when no source', () => {
    session._currentSource = null;
    expect(playback.getTotalFrames()).toBe(0);
  });
});

// ============================================================
// MediaAPI Tests
// ============================================================

describe('MediaAPI', () => {
  let media: MediaAPI;
  let session: any;

  beforeEach(() => {
    session = createMockSession();
    media = new MediaAPI(session);
  });

  it('API-U030: getCurrentSource() returns source info', () => {
    const source = media.getCurrentSource();
    expect(source).not.toBeNull();
    expect(source!.name).toBe('test.mp4');
    expect(source!.type).toBe('video');
    expect(source!.width).toBe(1920);
    expect(source!.height).toBe(1080);
    expect(source!.duration).toBe(100);
    expect(source!.fps).toBe(24);
  });

  it('API-U031: getDuration() returns frame count', () => {
    expect(media.getDuration()).toBe(100);
  });

  it('API-U032: getFPS() returns framerate', () => {
    expect(media.getFPS()).toBe(24);
  });

  it('API-U209: getFPS() returns source FPS, not session playback FPS', () => {
    // Source has fps=24, but session playback fps is overridden to 48
    session._currentSource = {
      name: 'test.mp4',
      type: 'video',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
    };
    session._fps = 48;
    expect(media.getFPS()).toBe(24);
    expect(media.getPlaybackFPS()).toBe(48);
  });

  it('API-U210: getFPS() falls back to session FPS when no source is loaded', () => {
    session._currentSource = null;
    session._fps = 30;
    expect(media.getFPS()).toBe(30);
  });

  it('API-U211: getPlaybackFPS() returns session playback FPS', () => {
    session._fps = 60;
    expect(media.getPlaybackFPS()).toBe(60);
  });

  it('API-U212: setPlaybackFPS() sets session playback FPS', () => {
    media.setPlaybackFPS(48);
    expect(session._fps).toBe(48);
    expect(media.getPlaybackFPS()).toBe(48);
  });

  it('API-U213: setPlaybackFPS() throws on invalid input', () => {
    expect(() => media.setPlaybackFPS(0)).toThrow(TypeError);
    expect(() => media.setPlaybackFPS(-1)).toThrow(TypeError);
    expect(() => media.setPlaybackFPS(NaN)).toThrow(TypeError);
    expect(() => media.setPlaybackFPS('abc' as unknown as number)).toThrow(TypeError);
  });

  it('API-U214: setPlaybackFPS() updates getPlaybackFPS() readback', () => {
    expect(media.getPlaybackFPS()).toBe(24);
    media.setPlaybackFPS(60);
    expect(media.getPlaybackFPS()).toBe(60);
  });

  it('API-U033: getResolution() returns width and height', () => {
    const res = media.getResolution();
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
  });

  it('API-U034: hasMedia() returns true when source exists', () => {
    expect(media.hasMedia()).toBe(true);
  });

  it('API-U035: getSourceCount() returns number of sources', () => {
    expect(media.getSourceCount()).toBe(1);
  });

  it('API-U036: getCurrentSource() returns null when no media', () => {
    session._currentSource = null;
    expect(media.getCurrentSource()).toBeNull();
  });

  it('API-U037: getResolution() returns zeros when no media', () => {
    session._currentSource = null;
    const res = media.getResolution();
    expect(res.width).toBe(0);
    expect(res.height).toBe(0);
  });

  it('API-U038: hasMedia() returns false when no source', () => {
    session._currentSource = null;
    expect(media.hasMedia()).toBe(false);
  });

  it('API-U039: getDuration() returns 0 when no source', () => {
    session._currentSource = null;
    expect(media.getDuration()).toBe(0);
  });

  it('API-U039b: getCurrentSource() returns a copy, not a reference', () => {
    const source1 = media.getCurrentSource();
    const source2 = media.getCurrentSource();
    expect(source1).toEqual(source2);
    expect(source1).not.toBe(source2); // different object references
  });

  it('API-U040: getStartFrame() returns 0 by default (no sequence info)', () => {
    expect(media.getStartFrame()).toBe(0);
  });

  it('API-U040b: getStartFrame() returns 0 when source start frame is explicitly 0', () => {
    session._currentSource = {
      name: 'shot.0000.exr',
      type: 'sequence',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
      sequenceInfo: { startFrame: 0, endFrame: 99, padding: 4, pattern: 'shot.%04d.exr' },
    };
    expect(media.getStartFrame()).toBe(0);
  });

  it('API-U041: getStartFrame() returns sequence start frame from sequenceInfo', () => {
    session._currentSource = {
      name: 'shot.0001.exr',
      type: 'sequence',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
      sequenceInfo: { startFrame: 1001, endFrame: 1100, padding: 4, pattern: 'shot.%04d.exr' },
    };
    expect(media.getStartFrame()).toBe(1001);
  });

  it('API-U042: getStartFrame() prefers active representation startFrame', () => {
    session._currentSource = {
      name: 'shot.0001.exr',
      type: 'sequence',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
      sequenceInfo: { startFrame: 1001, endFrame: 1100, padding: 4, pattern: 'shot.%04d.exr' },
      representations: [
        { id: 'rep0', startFrame: 500, status: 'ready' },
        { id: 'rep1', startFrame: 86400, status: 'ready' },
      ],
      activeRepresentationIndex: 1,
    };
    expect(media.getStartFrame()).toBe(86400);
  });

  it('API-U043: getStartFrame() returns 1 when no source is loaded', () => {
    session._currentSource = null;
    expect(media.getStartFrame()).toBe(1);
  });

  it('API-U215: addSourceFromURL() delegates to session.loadSourceFromUrl', async () => {
    await media.addSourceFromURL('https://example.com/clip.mp4');
    expect(session.loadSourceFromUrl).toHaveBeenCalledWith('https://example.com/clip.mp4');
  });

  it('API-U216: clearSources() delegates to session.clearSources', () => {
    media.clearSources();
    expect(session.clearSources).toHaveBeenCalled();
  });
});

// ============================================================
// AudioAPI Tests
// ============================================================

describe('AudioAPI', () => {
  let audio: AudioAPI;
  let session: any;

  beforeEach(() => {
    session = createMockSession();
    audio = new AudioAPI(session);
  });

  it('API-U040: setVolume() sets session volume', () => {
    audio.setVolume(0.5);
    expect(session.volume).toBe(0.5);
  });

  it('API-U041: setVolume() validates value', () => {
    expect(() => audio.setVolume(NaN)).toThrow();
    expect(() => audio.setVolume('loud' as any)).toThrow();
  });

  it('API-U042: setVolume() clamps to 0-1 range', () => {
    audio.setVolume(1.5);
    expect(session.volume).toBe(1);
    audio.setVolume(-0.5);
    expect(session.volume).toBe(0);
  });

  it('API-U043: getVolume() returns current volume', () => {
    session._volume = 0.8;
    expect(audio.getVolume()).toBe(0.8);
  });

  it('API-U044: mute() sets muted to true', () => {
    audio.mute();
    expect(session.muted).toBe(true);
  });

  it('API-U045: unmute() sets muted to false', () => {
    session._muted = true;
    audio.unmute();
    expect(session.muted).toBe(false);
  });

  it('API-U046: isMuted() returns correct state', () => {
    expect(audio.isMuted()).toBe(false);
    session._muted = true;
    expect(audio.isMuted()).toBe(true);
  });

  it('API-U047: toggleMute() toggles mute state', () => {
    audio.toggleMute();
    expect(session.toggleMute).toHaveBeenCalled();
  });

  it('API-U048: setPreservesPitch() sets pitch correction', () => {
    audio.setPreservesPitch(false);
    expect(session.preservesPitch).toBe(false);
    audio.setPreservesPitch(true);
    expect(session.preservesPitch).toBe(true);
  });

  it('API-U049: setPreservesPitch() validates boolean value', () => {
    expect(() => audio.setPreservesPitch('yes' as any)).toThrow();
    expect(() => audio.setPreservesPitch(1 as any)).toThrow();
    expect(() => audio.setPreservesPitch(undefined as any)).toThrow();
  });

  it('API-U04A: getPreservesPitch() returns current state', () => {
    expect(audio.getPreservesPitch()).toBe(true);
    session._preservesPitch = false;
    expect(audio.getPreservesPitch()).toBe(false);
  });
});

// ============================================================
// LoopAPI Tests
// ============================================================

describe('LoopAPI', () => {
  let loop: LoopAPI;
  let session: any;

  beforeEach(() => {
    session = createMockSession();
    loop = new LoopAPI(session);
  });

  it('API-U050: setMode() sets loop mode', () => {
    loop.setMode('once');
    expect(session.loopMode).toBe('once');
  });

  it('API-U051: setMode() validates mode string', () => {
    expect(() => loop.setMode('invalid')).toThrow();
    expect(() => loop.setMode('')).toThrow();
  });

  it('API-U052: setMode(loop) enables looping', () => {
    loop.setMode('loop');
    expect(session.loopMode).toBe('loop');
  });

  it('API-U053: setMode(pingpong) enables pingpong', () => {
    loop.setMode('pingpong');
    expect(session.loopMode).toBe('pingpong');
  });

  it('API-U054: getMode() returns current mode', () => {
    session._loopMode = 'pingpong';
    expect(loop.getMode()).toBe('pingpong');
  });

  it('API-U055: setInPoint() sets in point', () => {
    loop.setInPoint(10);
    expect(loop.getInPoint()).toBe(10);
  });

  it('API-U056: setInPoint() validates frame number', () => {
    expect(() => loop.setInPoint(NaN)).toThrow();
  });

  it('API-U057: setOutPoint() sets out point', () => {
    loop.setOutPoint(50);
    expect(loop.getOutPoint()).toBe(50);
  });

  it('API-U058: getInPoint() returns in point', () => {
    session._inPoint = 10;
    expect(loop.getInPoint()).toBe(10);
  });

  it('API-U059: getOutPoint() returns out point', () => {
    session._outPoint = 50;
    expect(loop.getOutPoint()).toBe(50);
  });

  it('API-U060: clearInOut() resets in/out points', () => {
    loop.setInPoint(10);
    loop.setOutPoint(50);
    loop.clearInOut();
    expect(loop.getInPoint()).toBe(1);
    expect(loop.getOutPoint()).toBe(100);
  });

  it('API-U061: setMode() rejects non-string values', () => {
    expect(() => loop.setMode(123 as any)).toThrow();
    expect(() => loop.setMode(null as any)).toThrow();
    expect(() => loop.setMode(undefined as any)).toThrow();
  });

  it('API-U062: setInPoint() rejects non-number values', () => {
    expect(() => loop.setInPoint('10' as any)).toThrow();
    expect(() => loop.setInPoint(null as any)).toThrow();
  });

  it('API-U063: setOutPoint() validates frame number', () => {
    expect(() => loop.setOutPoint(NaN)).toThrow();
    expect(() => loop.setOutPoint('50' as any)).toThrow();
  });

  it('API-U064: setInPoint() rounds fractional frames to integer', () => {
    loop.setInPoint(10.7);
    expect(loop.getInPoint()).toBe(11);
  });

  it('API-U065: setOutPoint() rounds fractional frames to integer', () => {
    loop.setOutPoint(49.3);
    expect(loop.getOutPoint()).toBe(49);
  });

  it('API-U066: setInPoint() rejects Infinity', () => {
    expect(() => loop.setInPoint(Infinity)).toThrow();
  });

  it('API-U067: setOutPoint() rejects -Infinity', () => {
    expect(() => loop.setOutPoint(-Infinity)).toThrow();
  });
});

// ============================================================
// ViewAPI Tests
// ============================================================

describe('ViewAPI', () => {
  let view: ViewAPI;
  let viewer: any;

  beforeEach(() => {
    viewer = createMockViewer();
    view = new ViewAPI(viewer);
  });

  it('API-U030: setZoom() validates zoom level', () => {
    expect(() => view.setZoom(0)).toThrow();
    expect(() => view.setZoom(-1)).toThrow();
    expect(() => view.setZoom(NaN)).toThrow();
  });

  it('API-U031: setZoom() updates zoom level', () => {
    view.setZoom(2);
    expect(view.getZoom()).toBe(2);
  });

  it('API-U032: getZoom() returns current zoom', () => {
    view.setZoom(3);
    expect(view.getZoom()).toBe(3);
  });

  it('API-U033: fitToWindow() resets zoom to 1', () => {
    view.setZoom(5);
    view.fitToWindow();
    expect(view.getZoom()).toBe(1);
  });

  it('API-U034: setPan() updates pan position', () => {
    view.setPan(100, 50);
    expect(view.getPan()).toEqual({ x: 100, y: 50 });
  });

  it('API-U035: getPan() returns current pan coordinates', () => {
    view.setPan(10, 20);
    expect(view.getPan()).toEqual({ x: 10, y: 20 });
  });

  it('API-U036: setChannel() validates mode string', () => {
    expect(() => view.setChannel('invalid')).toThrow();
    expect(() => view.setChannel('')).toThrow();
  });

  it('API-U037: setChannel() updates channel mode', () => {
    view.setChannel('red');
    expect(view.getChannel()).toBe('red');
  });

  it('API-U038: getChannel() returns current channel', () => {
    view.setChannel('blue');
    expect(view.getChannel()).toBe('blue');
  });

  it('API-U039: setChannel() resolves aliases to canonical names', () => {
    view.setChannel('r');
    expect(view.getChannel()).toBe('red');
    view.setChannel('g');
    expect(view.getChannel()).toBe('green');
    view.setChannel('b');
    expect(view.getChannel()).toBe('blue');
    view.setChannel('a');
    expect(view.getChannel()).toBe('alpha');
    view.setChannel('luma');
    expect(view.getChannel()).toBe('luminance');
  });

  it('API-U040: setPan() validates coordinates', () => {
    expect(() => view.setPan(NaN, 0)).toThrow();
    expect(() => view.setPan(0, NaN)).toThrow();
  });

  it('API-U041: setChannel() is case-insensitive', () => {
    view.setChannel('RED');
    expect(view.getChannel()).toBe('red');
    view.setChannel('Blue');
    expect(view.getChannel()).toBe('blue');
  });

  it('API-U042: setChannel() rejects non-string values', () => {
    expect(() => view.setChannel(123 as any)).toThrow(/requires a string/);
    expect(() => view.setChannel(null as any)).toThrow(/requires a string/);
    expect(() => view.setChannel(undefined as any)).toThrow(/requires a string/);
  });

  it('API-U043: setZoom() rejects non-number values', () => {
    expect(() => view.setZoom('big' as any)).toThrow();
    expect(() => view.setZoom(null as any)).toThrow();
  });

  it('API-U044: setPan() rejects non-number values', () => {
    expect(() => view.setPan('x' as any, 0)).toThrow();
    expect(() => view.setPan(0, 'y' as any)).toThrow();
  });

  it('API-U044b: setZoom() rejects Infinity', () => {
    expect(() => view.setZoom(Infinity)).toThrow('finite positive number');
    expect(() => view.setZoom(-Infinity)).toThrow('finite positive number');
  });

  it('API-U044c: setPan() rejects non-finite coordinates', () => {
    expect(() => view.setPan(Infinity, 0)).toThrow('finite');
    expect(() => view.setPan(0, -Infinity)).toThrow('finite');
    expect(() => view.setPan(Infinity, Infinity)).toThrow('finite');
    expect(() => view.setPan(-Infinity, -Infinity)).toThrow('finite');
  });

  it('API-U045: fitToWidth() calls viewer.fitToWidth()', () => {
    view.fitToWidth();
    expect(viewer.fitToWidth).toHaveBeenCalledOnce();
  });

  it('API-U046: fitToHeight() calls viewer.fitToHeight()', () => {
    view.fitToHeight();
    expect(viewer.fitToHeight).toHaveBeenCalledOnce();
  });

  it('API-U047: getFitMode() returns current fit mode', () => {
    expect(view.getFitMode()).toBeNull();
    view.fitToWidth();
    expect(view.getFitMode()).toBe('width');
    view.fitToHeight();
    expect(view.getFitMode()).toBe('height');
    view.fitToWindow();
    expect(view.getFitMode()).toBe('all');
  });

  it('API-U048: setTextureFilterMode() delegates to viewer', () => {
    view.setTextureFilterMode('nearest');
    expect(viewer.setFilterMode).toHaveBeenCalledWith('nearest');
    expect(view.getTextureFilterMode()).toBe('nearest');
  });

  it('API-U049: setTextureFilterMode() validates input', () => {
    expect(() => view.setTextureFilterMode('bicubic' as any)).toThrow(/nearest.*linear/);
    expect(() => view.setTextureFilterMode('' as any)).toThrow();
    expect(() => view.setTextureFilterMode(123 as any)).toThrow();
  });

  it('API-U050: getTextureFilterMode() returns current filter mode', () => {
    expect(view.getTextureFilterMode()).toBe('linear');
    view.setTextureFilterMode('nearest');
    expect(view.getTextureFilterMode()).toBe('nearest');
  });

  it('API-U051: setBackgroundPattern() delegates to viewer', () => {
    const state = { pattern: 'checker' as const, checkerSize: 'large' as const, customColor: '#ff0000' };
    view.setBackgroundPattern(state);
    expect(viewer.setBackgroundPatternState).toHaveBeenCalledWith(state);
  });

  it('API-U052: getBackgroundPattern() returns current state', () => {
    const defaultState = view.getBackgroundPattern();
    expect(defaultState).toEqual({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' });
  });

  it('API-U053: setTextureFilterMode() throws after dispose', () => {
    view.dispose();
    expect(() => view.setTextureFilterMode('nearest')).toThrow();
  });

  it('API-U054: getTextureFilterMode() throws after dispose', () => {
    view.dispose();
    expect(() => view.getTextureFilterMode()).toThrow();
  });

  it('API-U055: setBackgroundPattern() throws after dispose', () => {
    view.dispose();
    expect(() =>
      view.setBackgroundPattern({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' }),
    ).toThrow();
  });

  it('API-U056: getBackgroundPattern() throws after dispose', () => {
    view.dispose();
    expect(() => view.getBackgroundPattern()).toThrow();
  });

  // Matte overlay API tests
  it('API-U060M: setMatte() enables matte and delegates to viewer', () => {
    view.setMatte({ aspect: 2.39, opacity: 0.8 });
    expect(viewer.setMatteSettings).toHaveBeenCalledWith({
      show: true,
      aspect: 2.39,
      opacity: 0.8,
    });
  });

  it('API-U061M: setMatte() with no options enables matte with defaults', () => {
    view.setMatte();
    expect(viewer.setMatteSettings).toHaveBeenCalledWith({ show: true });
  });

  it('API-U062M: setMatte() validates aspect is a positive number', () => {
    expect(() => view.setMatte({ aspect: 0 })).toThrow(/positive number/);
    expect(() => view.setMatte({ aspect: -1 })).toThrow(/positive number/);
    expect(() => view.setMatte({ aspect: NaN })).toThrow(/positive number/);
    expect(() => view.setMatte({ aspect: 'wide' as any })).toThrow(/positive number/);
  });

  it('API-U063M: setMatte() clamps aspect to valid range', () => {
    view.setMatte({ aspect: 0.01 });
    const call1 = viewer.setMatteSettings.mock.calls[0][0];
    expect(call1.aspect).toBe(0.1);

    view.setMatte({ aspect: 20 });
    const call2 = viewer.setMatteSettings.mock.calls[1][0];
    expect(call2.aspect).toBe(10);
  });

  it('API-U064M: setMatte() validates opacity range', () => {
    expect(() => view.setMatte({ opacity: NaN })).toThrow(/number between 0 and 1/);
    expect(() => view.setMatte({ opacity: 'half' as any })).toThrow(/number between 0 and 1/);
  });

  it('API-U065M: setMatte() clamps opacity to 0–1', () => {
    view.setMatte({ opacity: -0.5 });
    const call1 = viewer.setMatteSettings.mock.calls[0][0];
    expect(call1.opacity).toBe(0);

    view.setMatte({ opacity: 2.0 });
    const call2 = viewer.setMatteSettings.mock.calls[1][0];
    expect(call2.opacity).toBe(1);
  });

  it('API-U066M: setMatte() validates centerPoint', () => {
    expect(() => view.setMatte({ centerPoint: [1] as any })).toThrow(/\[number, number\]/);
    expect(() => view.setMatte({ centerPoint: 'center' as any })).toThrow(/\[number, number\]/);
    expect(() => view.setMatte({ centerPoint: [1, 'a'] as any })).toThrow(/\[number, number\]/);
  });

  it('API-U067M: setMatte() accepts valid centerPoint', () => {
    view.setMatte({ centerPoint: [0.5, -0.3] });
    expect(viewer.setMatteSettings).toHaveBeenCalledWith({
      show: true,
      centerPoint: [0.5, -0.3],
    });
  });

  it('API-U068M: clearMatte() disables matte overlay', () => {
    view.clearMatte();
    expect(viewer.setMatteSettings).toHaveBeenCalledWith({ show: false });
  });

  it('API-U069M: getMatte() returns current matte settings', () => {
    const matte = view.getMatte();
    expect(matte).toEqual({
      show: false,
      aspect: 1.78,
      opacity: 0.66,
      heightVisible: -1,
      centerPoint: [0, 0],
    });
  });

  it('API-U070M: getMatte() reflects changes from setMatte()', () => {
    view.setMatte({ aspect: 2.39, opacity: 0.8 });
    const matte = view.getMatte();
    expect(matte.show).toBe(true);
    expect(matte.aspect).toBe(2.39);
    expect(matte.opacity).toBe(0.8);
  });

  it('API-U071M: setMatte() throws after dispose', () => {
    view.dispose();
    expect(() => view.setMatte()).toThrow();
  });

  it('API-U072M: clearMatte() throws after dispose', () => {
    view.dispose();
    expect(() => view.clearMatte()).toThrow();
  });

  it('API-U073M: getMatte() throws after dispose', () => {
    view.dispose();
    expect(() => view.getMatte()).toThrow();
  });

  // ────────────────────────────────────────────────────────────
  // Pixel Probe API tests (no provider)
  // ────────────────────────────────────────────────────────────

  it('API-U080P: enableProbe() throws when no probe provider is available', () => {
    expect(() => view.enableProbe()).toThrow(/not available/);
  });

  it('API-U081P: disableProbe() throws when no probe provider is available', () => {
    expect(() => view.disableProbe()).toThrow(/not available/);
  });

  it('API-U082P: isProbeEnabled() throws when no probe provider is available', () => {
    expect(() => view.isProbeEnabled()).toThrow(/not available/);
  });

  it('API-U083P: getProbeState() throws when no probe provider is available', () => {
    expect(() => view.getProbeState()).toThrow(/not available/);
  });
});

// ============================================================
// ViewAPI Pixel Probe Tests (with provider)
// ============================================================

function createMockPixelProbeProvider() {
  const probe = {
    _enabled: false,
    _locked: false,
    _format: 'rgb' as const,
    _sampleSize: 1 as 1 | 3 | 5 | 9,
    _sourceMode: 'rendered' as 'rendered' | 'source',
    _state: {
      enabled: false,
      locked: false,
      x: 42,
      y: 84,
      rgb: { r: 128, g: 64, b: 32 },
      alpha: 255,
      hsl: { h: 20, s: 60, l: 31 },
      ire: 28,
      format: 'rgb' as const,
      sampleSize: 1 as 1 | 3 | 5 | 9,
      sourceMode: 'rendered' as 'rendered' | 'source',
      floatPrecision: 3 as 3 | 6,
    },
    enable: vi.fn(function (this: typeof probe) {
      this._enabled = true;
      this._state.enabled = true;
    }),
    disable: vi.fn(function (this: typeof probe) {
      this._enabled = false;
      this._locked = false;
      this._state.enabled = false;
      this._state.locked = false;
    }),
    isEnabled: vi.fn(function (this: typeof probe) {
      return this._enabled;
    }),
    toggleLock: vi.fn(function (this: typeof probe) {
      this._locked = !this._locked;
      this._state.locked = this._locked;
    }),
    isLocked: vi.fn(function (this: typeof probe) {
      return this._locked;
    }),
    getState: vi.fn(function (this: typeof probe) {
      return { ...this._state, rgb: { ...this._state.rgb }, hsl: { ...this._state.hsl } };
    }),
    setFormat: vi.fn(function (this: typeof probe, format: string) {
      this._format = format as any;
      this._state.format = format as any;
    }),
    setSampleSize: vi.fn(function (this: typeof probe, size: number) {
      this._sampleSize = size as any;
      this._state.sampleSize = size as any;
    }),
    getSampleSize: vi.fn(function (this: typeof probe) {
      return this._sampleSize;
    }),
    setSourceMode: vi.fn(function (this: typeof probe, mode: string) {
      this._sourceMode = mode as any;
      this._state.sourceMode = mode as any;
    }),
    getSourceMode: vi.fn(function (this: typeof probe) {
      return this._sourceMode;
    }),
  };
  return probe;
}

describe('ViewAPI (Pixel Probe)', () => {
  let view: ViewAPI;
  let viewer: any;
  let probeProvider: ReturnType<typeof createMockPixelProbeProvider>;

  beforeEach(() => {
    viewer = createMockViewer();
    probeProvider = createMockPixelProbeProvider();
    view = new ViewAPI(viewer, probeProvider);
  });

  it('API-U084P: enableProbe() enables the probe', () => {
    view.enableProbe();
    expect(probeProvider.enable).toHaveBeenCalledOnce();
  });

  it('API-U085P: disableProbe() disables the probe', () => {
    view.enableProbe();
    view.disableProbe();
    expect(probeProvider.disable).toHaveBeenCalledOnce();
  });

  it('API-U086P: isProbeEnabled() returns correct state', () => {
    expect(view.isProbeEnabled()).toBe(false);
    view.enableProbe();
    expect(view.isProbeEnabled()).toBe(true);
    view.disableProbe();
    expect(view.isProbeEnabled()).toBe(false);
  });

  it('API-U087P: toggleProbeLock() toggles lock state', () => {
    expect(view.isProbeLocked()).toBe(false);
    view.toggleProbeLock();
    expect(view.isProbeLocked()).toBe(true);
    view.toggleProbeLock();
    expect(view.isProbeLocked()).toBe(false);
  });

  it('API-U088P: isProbeLocked() returns current lock state', () => {
    expect(view.isProbeLocked()).toBe(false);
    view.toggleProbeLock();
    expect(view.isProbeLocked()).toBe(true);
  });

  it('API-U089P: getProbeState() returns probe state', () => {
    const state = view.getProbeState();
    expect(state).toHaveProperty('enabled');
    expect(state).toHaveProperty('locked');
    expect(state).toHaveProperty('x');
    expect(state).toHaveProperty('y');
    expect(state).toHaveProperty('rgb');
    expect(state).toHaveProperty('alpha');
    expect(state).toHaveProperty('hsl');
    expect(state).toHaveProperty('ire');
    expect(state).toHaveProperty('format');
    expect(state).toHaveProperty('sampleSize');
    expect(state).toHaveProperty('sourceMode');
    expect(state.x).toBe(42);
    expect(state.y).toBe(84);
    expect(state.rgb).toEqual({ r: 128, g: 64, b: 32 });
  });

  it('API-U090P: getProbeState() returns a deep copy', () => {
    const state1 = view.getProbeState();
    const state2 = view.getProbeState();
    expect(state1).not.toBe(state2);
    expect(state1.rgb).not.toBe(state2.rgb);
  });

  it('API-U091P: setProbeFormat() updates the format', () => {
    view.setProbeFormat('hsl');
    expect(probeProvider.setFormat).toHaveBeenCalledWith('hsl');
  });

  it('API-U092P: setProbeFormat() validates format string', () => {
    expect(() => view.setProbeFormat('invalid')).toThrow(/Invalid probe format/);
    expect(() => view.setProbeFormat('')).toThrow(/Invalid probe format/);
    expect(() => view.setProbeFormat(123 as any)).toThrow(/Invalid probe format/);
  });

  it('API-U093P: setProbeFormat() accepts all valid formats', () => {
    for (const format of ['rgb', 'rgb01', 'hsl', 'hex', 'ire']) {
      view.setProbeFormat(format);
    }
    expect(probeProvider.setFormat).toHaveBeenCalledTimes(5);
  });

  it('API-U094P: setProbeSampleSize() updates sample size', () => {
    view.setProbeSampleSize(3);
    expect(probeProvider.setSampleSize).toHaveBeenCalledWith(3);
  });

  it('API-U095P: setProbeSampleSize() validates size', () => {
    expect(() => view.setProbeSampleSize(2)).toThrow(/Invalid sample size/);
    expect(() => view.setProbeSampleSize(0)).toThrow(/Invalid sample size/);
    expect(() => view.setProbeSampleSize(7)).toThrow(/Invalid sample size/);
    expect(() => view.setProbeSampleSize('3' as any)).toThrow(/Invalid sample size/);
  });

  it('API-U096P: setProbeSampleSize() accepts all valid sizes', () => {
    for (const size of [1, 3, 5, 9]) {
      view.setProbeSampleSize(size);
    }
    expect(probeProvider.setSampleSize).toHaveBeenCalledTimes(4);
  });

  it('API-U097P: getProbeSampleSize() returns current sample size', () => {
    expect(view.getProbeSampleSize()).toBe(1);
    view.setProbeSampleSize(5);
    expect(view.getProbeSampleSize()).toBe(5);
  });

  it('API-U098P: setProbeSourceMode() updates source mode', () => {
    view.setProbeSourceMode('source');
    expect(probeProvider.setSourceMode).toHaveBeenCalledWith('source');
  });

  it('API-U099P: setProbeSourceMode() validates mode', () => {
    expect(() => view.setProbeSourceMode('invalid')).toThrow(/Invalid source mode/);
    expect(() => view.setProbeSourceMode('')).toThrow(/Invalid source mode/);
    expect(() => view.setProbeSourceMode(123 as any)).toThrow(/Invalid source mode/);
  });

  it('API-U100P: setProbeSourceMode() accepts all valid modes', () => {
    view.setProbeSourceMode('rendered');
    view.setProbeSourceMode('source');
    expect(probeProvider.setSourceMode).toHaveBeenCalledTimes(2);
  });

  it('API-U101P: getProbeSourceMode() returns current source mode', () => {
    expect(view.getProbeSourceMode()).toBe('rendered');
    view.setProbeSourceMode('source');
    expect(view.getProbeSourceMode()).toBe('source');
  });

  // Dispose tests
  it('API-U102P: enableProbe() throws after dispose', () => {
    view.dispose();
    expect(() => view.enableProbe()).toThrow(/dispose/);
  });

  it('API-U103P: disableProbe() throws after dispose', () => {
    view.dispose();
    expect(() => view.disableProbe()).toThrow(/dispose/);
  });

  it('API-U104P: isProbeEnabled() throws after dispose', () => {
    view.dispose();
    expect(() => view.isProbeEnabled()).toThrow(/dispose/);
  });

  it('API-U105P: toggleProbeLock() throws after dispose', () => {
    view.dispose();
    expect(() => view.toggleProbeLock()).toThrow(/dispose/);
  });

  it('API-U106P: isProbeLocked() throws after dispose', () => {
    view.dispose();
    expect(() => view.isProbeLocked()).toThrow(/dispose/);
  });

  it('API-U107P: getProbeState() throws after dispose', () => {
    view.dispose();
    expect(() => view.getProbeState()).toThrow(/dispose/);
  });

  it('API-U108P: setProbeFormat() throws after dispose', () => {
    view.dispose();
    expect(() => view.setProbeFormat('hsl')).toThrow(/dispose/);
  });

  it('API-U109P: setProbeSampleSize() throws after dispose', () => {
    view.dispose();
    expect(() => view.setProbeSampleSize(3)).toThrow(/dispose/);
  });

  it('API-U110P: getProbeSampleSize() throws after dispose', () => {
    view.dispose();
    expect(() => view.getProbeSampleSize()).toThrow(/dispose/);
  });

  it('API-U111P: setProbeSourceMode() throws after dispose', () => {
    view.dispose();
    expect(() => view.setProbeSourceMode('source')).toThrow(/dispose/);
  });

  it('API-U112P: getProbeSourceMode() throws after dispose', () => {
    view.dispose();
    expect(() => view.getProbeSourceMode()).toThrow(/dispose/);
  });

  // Existing ViewAPI methods still work with probe provider
  it('API-U113P: existing view methods still work alongside probe', () => {
    view.setZoom(2);
    expect(view.getZoom()).toBe(2);
    view.setPan(10, 20);
    expect(view.getPan()).toEqual({ x: 10, y: 20 });
    view.setChannel('red');
    expect(view.getChannel()).toBe('red');
  });
});

// ============================================================
// ColorAPI Tests
// ============================================================

function createMockLUTProvider() {
  return {
    _lut: null as any,
    _intensity: 1.0,
    setLUT: vi.fn(function (this: any, lut: any) {
      this._lut = lut;
    }),
    getLUT: vi.fn(function (this: any) {
      return this._lut;
    }),
    setLUTIntensity: vi.fn(function (this: any, intensity: number) {
      this._intensity = intensity;
    }),
    getLUTIntensity: vi.fn(function (this: any) {
      return this._intensity;
    }),
  };
}

function createMockToneMappingProvider() {
  return {
    _state: {
      enabled: false,
      operator: 'off' as const,
      reinhardWhitePoint: 4.0,
      filmicExposureBias: 2.0,
      filmicWhitePoint: 11.2,
      dragoBias: 0.85,
      dragoLwa: 0.2,
      dragoLmax: 1.5,
      dragoBrightness: 2.0,
    },
    getToneMappingState: vi.fn(function (this: any) {
      return { ...this._state };
    }),
    setToneMappingState: vi.fn(function (this: any, state: any) {
      this._state = { ...state };
    }),
    resetToneMappingState: vi.fn(function (this: any) {
      this._state = { enabled: false, operator: 'off' };
    }),
  };
}

function createMockDisplayProvider() {
  return {
    _state: { transferFunction: 'srgb' as const, displayGamma: 1.0, displayBrightness: 1.0, customGamma: 2.2 },
    getDisplayColorState: vi.fn(function (this: any) {
      return { ...this._state };
    }),
    setDisplayColorState: vi.fn(function (this: any, state: any) {
      this._state = { ...state };
    }),
    resetDisplayColorState: vi.fn(function (this: any) {
      this._state = { transferFunction: 'srgb', displayGamma: 1.0, displayBrightness: 1.0, customGamma: 2.2 };
    }),
  };
}

function createMockDisplayCapabilitiesProvider() {
  return {
    getDisplayCapabilities: vi.fn(() => ({
      canvasP3: false,
      webglP3: false,
      displayGamut: 'srgb' as const,
      displayHDR: false,
      webglHLG: false,
      webglPQ: false,
      canvasHLG: false,
      canvasFloat16: false,
      webgpuAvailable: false,
      webgpuHDR: false,
      webglDrawingBufferStorage: false,
      canvasExtendedHDR: false,
      heicDecode: false,
      videoFrameTexImage: false,
      canvasHDRResize: false,
      canvasHDRResizeTier: 'none' as const,
      activeColorSpace: 'srgb' as const,
      activeHDRMode: 'sdr' as const,
    })),
  };
}

function createMockOCIOProvider() {
  return {
    _state: {
      enabled: false,
      configName: 'aces_1.2',
      customConfigPath: null,
      inputColorSpace: 'Auto',
      detectedColorSpace: null,
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
      lookDirection: 'forward' as const,
    },
    getOCIOState: vi.fn(function (this: any) {
      return { ...this._state };
    }),
    setOCIOState: vi.fn(function (this: any, state: any) {
      Object.assign(this._state, state);
    }),
  };
}

describe('ColorAPI', () => {
  let color: ColorAPI;
  let colorControls: any;
  let cdlControl: any;
  let curvesControl: any;
  let lutProvider: any;
  let toneMappingProvider: any;
  let displayProvider: any;
  let displayCapabilitiesProvider: any;
  let ocioProvider: any;

  beforeEach(() => {
    colorControls = createMockColorControls();
    cdlControl = createMockCDLControl();
    curvesControl = createMockCurvesControl();
    lutProvider = createMockLUTProvider();
    toneMappingProvider = createMockToneMappingProvider();
    displayProvider = createMockDisplayProvider();
    displayCapabilitiesProvider = createMockDisplayCapabilitiesProvider();
    ocioProvider = createMockOCIOProvider();
    color = new ColorAPI(
      colorControls as any,
      cdlControl as any,
      curvesControl as any,
      lutProvider,
      toneMappingProvider,
      displayProvider,
      displayCapabilitiesProvider,
      ocioProvider,
    );
  });

  it('API-U060: setAdjustments() validates values', () => {
    expect(() => color.setAdjustments(null as any)).toThrow();
    expect(() => color.setAdjustments('bad' as any)).toThrow();
  });

  it('API-U061: setAdjustments() merges partial updates', () => {
    color.setAdjustments({ exposure: 0.5 });
    expect(colorControls.setAdjustments).toHaveBeenCalled();
    const setArg = colorControls.setAdjustments.mock.calls[0][0];
    expect(setArg.exposure).toBe(0.5);
    // Other values should remain at defaults
    expect(setArg.gamma).toBe(1);
    expect(setArg.saturation).toBe(1);
  });

  it('API-U062: getAdjustments() returns copy of state', () => {
    const adj = color.getAdjustments();
    expect(adj.exposure).toBe(0);
    expect(adj.gamma).toBe(1);
    expect(adj.saturation).toBe(1);
    expect(adj.contrast).toBe(1);
    expect(adj.temperature).toBe(0);
    expect(adj.tint).toBe(0);
    expect(adj.brightness).toBe(0);
  });

  it('API-U063: reset() restores default values', () => {
    color.reset();
    expect(colorControls.reset).toHaveBeenCalled();
  });

  it('API-U064: setCDL() validates CDL values', () => {
    expect(() => color.setCDL(null as any)).toThrow();
    expect(() => color.setCDL('bad' as any)).toThrow();
  });

  it('API-U065: getCDL() returns current CDL', () => {
    const cdl = color.getCDL();
    expect(cdl.slope).toEqual({ r: 1.0, g: 1.0, b: 1.0 });
    expect(cdl.offset).toEqual({ r: 0.0, g: 0.0, b: 0.0 });
    expect(cdl.power).toEqual({ r: 1.0, g: 1.0, b: 1.0 });
    expect(cdl.saturation).toBe(1.0);
  });

  it('API-U066: setCDL() merges partial updates', () => {
    color.setCDL({ slope: { r: 1.2, g: 1.0, b: 0.8 } });
    expect(cdlControl.setCDL).toHaveBeenCalled();
    const setArg = cdlControl.setCDL.mock.calls[0][0];
    expect(setArg.slope).toEqual({ r: 1.2, g: 1.0, b: 0.8 });
    // Other values should remain at defaults
    expect(setArg.offset).toEqual({ r: 0.0, g: 0.0, b: 0.0 });
  });

  it('API-U067: setAdjustments rejects non-finite numeric values', () => {
    expect(() => color.setAdjustments({ exposure: NaN })).toThrow(/exposure.*finite number/);
    expect(() => color.setAdjustments({ exposure: Infinity })).toThrow(/exposure.*finite number/);
    expect(() => color.setAdjustments({ gamma: -Infinity })).toThrow(/gamma.*finite number/);
  });

  it('API-U067b: setAdjustments rejects NaN for any field', () => {
    expect(() => color.setAdjustments({ saturation: NaN })).toThrow(/saturation.*finite number/);
    expect(() => color.setAdjustments({ contrast: NaN })).toThrow(/contrast.*finite number/);
    expect(() => color.setAdjustments({ temperature: NaN })).toThrow(/temperature.*finite number/);
  });

  it('API-U067c: setAdjustments rejects Infinity for any field', () => {
    expect(() => color.setAdjustments({ brightness: Infinity })).toThrow(/brightness.*finite number/);
    expect(() => color.setAdjustments({ hueRotation: -Infinity })).toThrow(/hueRotation.*finite number/);
    expect(() => color.setAdjustments({ tint: Infinity })).toThrow(/tint.*finite number/);
  });

  it('API-U067d: setAdjustments accepts valid finite values', () => {
    color.setAdjustments({ exposure: 1.5, gamma: 0.8 });
    const setArg = colorControls.setAdjustments.mock.calls[0][0];
    expect(setArg.exposure).toBe(1.5);
    expect(setArg.gamma).toBe(0.8);
  });

  it('API-U068: setAdjustments ignores unknown keys', () => {
    color.setAdjustments({ unknown: 99 } as any);
    // Should still call setAdjustments with unchanged values
    expect(colorControls.setAdjustments).toHaveBeenCalled();
    const setArg = colorControls.setAdjustments.mock.calls[0][0];
    expect((setArg as any).unknown).toBeUndefined();
  });

  it('API-U069: setAdjustments rejects arrays', () => {
    expect(() => color.setAdjustments([] as any)).toThrow();
  });

  it('API-U069b: setCDL rejects arrays', () => {
    expect(() => color.setCDL([] as any)).toThrow();
  });

  it('API-U069c: setCDL rejects invalid slope shape', () => {
    expect(() => color.setCDL({ slope: { r: 'bad' } } as any)).toThrow(/slope/);
  });

  it('API-U069d: setCDL rejects invalid saturation', () => {
    expect(() => color.setCDL({ saturation: NaN })).toThrow(/saturation/);
  });

  it('API-U069e-inf: setCDL rejects Infinity in slope', () => {
    expect(() => color.setCDL({ slope: { r: Infinity, g: 1, b: 1 } })).toThrow(/slope/);
    expect(() => color.setCDL({ slope: { r: 1, g: -Infinity, b: 1 } })).toThrow(/slope/);
    expect(() => color.setCDL({ slope: { r: 1, g: 1, b: Infinity } })).toThrow(/slope/);
  });

  it('API-U069f-inf: setCDL rejects Infinity in offset', () => {
    expect(() => color.setCDL({ offset: { r: Infinity, g: 0, b: 0 } })).toThrow(/offset/);
    expect(() => color.setCDL({ offset: { r: 0, g: -Infinity, b: 0 } })).toThrow(/offset/);
  });

  it('API-U069g-inf: setCDL rejects Infinity in power', () => {
    expect(() => color.setCDL({ power: { r: Infinity, g: 1, b: 1 } })).toThrow(/power/);
    expect(() => color.setCDL({ power: { r: 1, g: 1, b: -Infinity } })).toThrow(/power/);
  });

  it('API-U069h-inf: setCDL rejects Infinity in saturation', () => {
    expect(() => color.setCDL({ saturation: Infinity })).toThrow(/saturation/);
    expect(() => color.setCDL({ saturation: -Infinity })).toThrow(/saturation/);
  });

  it('API-U069e: setAdjustments does not allow prototype pollution via __proto__', () => {
    // Create object with __proto__ to test pollution resistance
    const malicious = Object.create(null);
    malicious.__proto__ = { exposure: 999 };
    malicious.gamma = 2;
    color.setAdjustments(malicious);
    const setArg = colorControls.setAdjustments.mock.calls[0][0];
    expect(setArg.gamma).toBe(2);
    // __proto__ should not inject values
    expect(setArg.exposure).toBe(0);
  });

  it('API-U069f: getAdjustments returns a defensive copy', () => {
    const adj1 = color.getAdjustments();
    adj1.exposure = 999;
    const adj2 = color.getAdjustments();
    expect(adj2.exposure).toBe(0);
  });

  it('API-U069g: getCDL returns a defensive copy (slope mutation does not affect internal state)', () => {
    const cdl1 = color.getCDL();
    cdl1.slope.r = 999;
    const cdl2 = color.getCDL();
    expect(cdl2.slope.r).toBe(1.0);
  });

  it('API-U069h: getCDL returns a defensive copy (offset mutation does not affect internal state)', () => {
    const cdl1 = color.getCDL();
    cdl1.offset.g = 999;
    const cdl2 = color.getCDL();
    expect(cdl2.offset.g).toBe(0.0);
  });

  it('API-U069i: setCurves() applies per-channel partial updates', () => {
    color.setCurves({
      red: {
        points: [
          { x: 0, y: 0.1 },
          { x: 1, y: 0.9 },
        ],
      },
      blue: { enabled: false },
    });

    expect(curvesControl.setCurves).toHaveBeenCalled();
    const setArg = curvesControl.setCurves.mock.calls[0][0];
    expect(setArg.red.points).toEqual([
      { x: 0, y: 0.1 },
      { x: 1, y: 0.9 },
    ]);
    expect(setArg.blue.enabled).toBe(false);
    expect(setArg.green.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('API-U069j: setCurves() validates channel point ranges', () => {
    expect(() =>
      color.setCurves({
        red: {
          points: [
            { x: -0.1, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      } as any),
    ).toThrow(/x\/y must be in \[0, 1\]/);
  });

  it('API-U069k: getCurves() returns a defensive copy', () => {
    const curves1 = color.getCurves();
    curves1.red.points[0]!.y = 0.6;

    const curves2 = color.getCurves();
    expect(curves2.red.points[0]!.y).toBe(0);
  });

  // Regression test for issues #280 and #282:
  // Verify the exact public API surface of ColorAPI to catch doc/implementation drift.
  it('API-U069m: ColorAPI exposes exactly the documented public methods', () => {
    const expectedMethods = [
      'setAdjustments',
      'getAdjustments',
      'reset',
      'setCDL',
      'getCDL',
      'resetCDL',
      'setCurves',
      'getCurves',
      'resetCurves',
      'exportCurvesJSON',
      'importCurvesJSON',
      'loadLUT',
      'setLUTIntensity',
      'clearLUT',
      'applyLUTPreset',
      'setToneMapping',
      'getToneMapping',
      'setDisplayProfile',
      'getDisplayProfile',
      'getDisplayCapabilities',
      'setOCIOState',
      'getOCIOState',
      'getAvailableConfigs',
      'dispose',
    ];

    // All expected methods exist
    for (const method of expectedMethods) {
      expect(typeof (color as any)[method]).toBe('function');
    }
  });

  it('API-U069l: resetCurves() restores identity curves', () => {
    color.setCurves({
      master: {
        points: [
          { x: 0, y: 0.05 },
          { x: 1, y: 0.95 },
        ],
      },
    });

    curvesControl.setCurves.mockClear();
    color.resetCurves();

    expect(curvesControl.setCurves).toHaveBeenCalledTimes(1);
    const resetArg = curvesControl.setCurves.mock.calls[0][0];
    expect(resetArg.master.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(resetArg.red.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(resetArg.green.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(resetArg.blue.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  // ============================================================
  // Regression tests for #280 and #282: new methods
  // ============================================================

  // --- resetCDL ---
  it('API-U280a: resetCDL() resets CDL to default values', () => {
    color.setCDL({ slope: { r: 2.0, g: 2.0, b: 2.0 }, saturation: 0.5 });
    cdlControl.setCDL.mockClear();
    color.resetCDL();
    expect(cdlControl.setCDL).toHaveBeenCalledTimes(1);
    const arg = cdlControl.setCDL.mock.calls[0][0];
    expect(arg.slope).toEqual({ r: 1.0, g: 1.0, b: 1.0 });
    expect(arg.offset).toEqual({ r: 0.0, g: 0.0, b: 0.0 });
    expect(arg.power).toEqual({ r: 1.0, g: 1.0, b: 1.0 });
    expect(arg.saturation).toBe(1.0);
  });

  it('API-U280b: resetCDL() throws after dispose', () => {
    color.dispose();
    expect(() => color.resetCDL()).toThrow();
  });

  // --- exportCurvesJSON / importCurvesJSON ---
  it('API-U280c: exportCurvesJSON() returns valid JSON string', () => {
    const json = color.exportCurvesJSON();
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.master).toBeDefined();
    expect(parsed.red).toBeDefined();
    expect(parsed.green).toBeDefined();
    expect(parsed.blue).toBeDefined();
  });

  it('API-U280d: importCurvesJSON() applies imported curves', () => {
    const curvesData = {
      master: {
        enabled: true,
        points: [
          { x: 0, y: 0.1 },
          { x: 1, y: 0.9 },
        ],
      },
      red: {
        enabled: true,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      green: {
        enabled: true,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      blue: {
        enabled: true,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    };
    const json = JSON.stringify(curvesData);
    curvesControl.setCurves.mockClear();
    color.importCurvesJSON(json);
    expect(curvesControl.setCurves).toHaveBeenCalledTimes(1);
    const arg = curvesControl.setCurves.mock.calls[0][0];
    expect(arg.master.points).toEqual([
      { x: 0, y: 0.1 },
      { x: 1, y: 0.9 },
    ]);
  });

  it('API-U280e: importCurvesJSON() rejects invalid JSON', () => {
    expect(() => color.importCurvesJSON('not json')).toThrow(/invalid/i);
  });

  it('API-U280f: importCurvesJSON() rejects non-string argument', () => {
    expect(() => color.importCurvesJSON(123 as any)).toThrow(/string/);
  });

  it('API-U280g: exportCurvesJSON() roundtrips with importCurvesJSON()', () => {
    color.setCurves({
      red: {
        points: [
          { x: 0, y: 0.2 },
          { x: 0.5, y: 0.6 },
          { x: 1, y: 0.8 },
        ],
      },
    });
    const json = color.exportCurvesJSON();
    curvesControl.setCurves.mockClear();
    color.importCurvesJSON(json);
    expect(curvesControl.setCurves).toHaveBeenCalledTimes(1);
  });

  // --- LUT methods ---
  it('API-U280h: loadLUT() delegates to LUT provider', () => {
    const fakeLut = {
      type: '3d',
      title: 'test',
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array(24),
    } as any;
    color.loadLUT(fakeLut);
    expect(lutProvider.setLUT).toHaveBeenCalledWith(fakeLut);
  });

  it('API-U280i: clearLUT() sets LUT to null', () => {
    color.clearLUT();
    expect(lutProvider.setLUT).toHaveBeenCalledWith(null);
  });

  it('API-U280j: setLUTIntensity() clamps and delegates', () => {
    color.setLUTIntensity(0.75);
    expect(lutProvider.setLUTIntensity).toHaveBeenCalledWith(0.75);
  });

  it('API-U280k: setLUTIntensity() clamps out-of-range values', () => {
    color.setLUTIntensity(2.0);
    expect(lutProvider.setLUTIntensity).toHaveBeenCalledWith(1.0);
    color.setLUTIntensity(-1.0);
    expect(lutProvider.setLUTIntensity).toHaveBeenCalledWith(0);
  });

  it('API-U280l: setLUTIntensity() rejects non-finite values', () => {
    expect(() => color.setLUTIntensity(NaN)).toThrow();
    expect(() => color.setLUTIntensity(Infinity)).toThrow();
  });

  it('API-U280m: applyLUTPreset() applies a known preset', () => {
    color.applyLUTPreset('identity');
    expect(lutProvider.setLUT).toHaveBeenCalledTimes(1);
    const lut = lutProvider.setLUT.mock.calls[0][0];
    expect(lut).not.toBeNull();
    expect(lut.size).toBe(17);
    expect(lut.data).toBeInstanceOf(Float32Array);
  });

  it('API-U280n: applyLUTPreset() rejects unknown preset', () => {
    expect(() => color.applyLUTPreset('nonexistent-preset')).toThrow(/unknown preset/i);
  });

  it('API-U280o: LUT methods throw when no provider', () => {
    const colorNoLut = new ColorAPI(colorControls, cdlControl, curvesControl);
    expect(() => colorNoLut.loadLUT(null)).toThrow(/not available/i);
    expect(() => colorNoLut.clearLUT()).toThrow(/not available/i);
    expect(() => colorNoLut.setLUTIntensity(0.5)).toThrow(/not available/i);
    expect(() => colorNoLut.applyLUTPreset('identity')).toThrow(/not available/i);
  });

  // --- Tone mapping ---
  it('API-U282a: setToneMapping() merges partial state', () => {
    color.setToneMapping({ enabled: true, operator: 'aces' });
    expect(toneMappingProvider.setToneMappingState).toHaveBeenCalledTimes(1);
    const arg = toneMappingProvider.setToneMappingState.mock.calls[0][0];
    expect(arg.enabled).toBe(true);
    expect(arg.operator).toBe('aces');
  });

  it('API-U282b: setToneMapping() rejects invalid operator', () => {
    expect(() => color.setToneMapping({ operator: 'invalid' as any })).toThrow(/operator/);
  });

  it('API-U282c: setToneMapping() rejects non-object', () => {
    expect(() => color.setToneMapping(null as any)).toThrow();
    expect(() => color.setToneMapping('bad' as any)).toThrow();
  });

  it('API-U282d: getToneMapping() returns snapshot', () => {
    const state = color.getToneMapping();
    expect(state.operator).toBe('off');
    expect(state.enabled).toBe(false);
  });

  it('API-U282e: tone mapping methods throw when no provider', () => {
    const colorNoTM = new ColorAPI(colorControls, cdlControl, curvesControl);
    expect(() => colorNoTM.setToneMapping({ enabled: true })).toThrow(/not available/i);
    expect(() => colorNoTM.getToneMapping()).toThrow(/not available/i);
  });

  // --- Display profile ---
  it('API-U282f: setDisplayProfile() merges partial state', () => {
    color.setDisplayProfile({ transferFunction: 'rec709' as any });
    expect(displayProvider.setDisplayColorState).toHaveBeenCalledTimes(1);
    const arg = displayProvider.setDisplayColorState.mock.calls[0][0];
    expect(arg.transferFunction).toBe('rec709');
    expect(arg.displayGamma).toBe(1.0); // preserved from current
  });

  it('API-U282g: getDisplayProfile() returns snapshot', () => {
    const profile = color.getDisplayProfile();
    expect(profile.transferFunction).toBe('srgb');
  });

  it('API-U282h: display profile methods throw when no provider', () => {
    const colorNoDisplay = new ColorAPI(colorControls, cdlControl, curvesControl);
    expect(() => colorNoDisplay.setDisplayProfile({ transferFunction: 'srgb' as any })).toThrow(/not available/i);
    expect(() => colorNoDisplay.getDisplayProfile()).toThrow(/not available/i);
  });

  // --- Display capabilities ---
  it('API-U282i: getDisplayCapabilities() returns capabilities snapshot', () => {
    const caps = color.getDisplayCapabilities();
    expect(caps.displayGamut).toBe('srgb');
    expect(caps.activeColorSpace).toBe('srgb');
  });

  it('API-U282j: getDisplayCapabilities() throws when no provider', () => {
    const colorNoCaps = new ColorAPI(colorControls, cdlControl, curvesControl);
    expect(() => colorNoCaps.getDisplayCapabilities()).toThrow(/not available/i);
  });

  // --- OCIO ---
  it('API-U282k: setOCIOState() delegates to provider', () => {
    color.setOCIOState({ enabled: true, configName: 'aces_1.2' });
    expect(ocioProvider.setOCIOState).toHaveBeenCalledWith({ enabled: true, configName: 'aces_1.2' });
  });

  it('API-U282l: getOCIOState() returns snapshot', () => {
    const state = color.getOCIOState();
    expect(state.configName).toBe('aces_1.2');
    expect(state.enabled).toBe(false);
  });

  it('API-U282m: setOCIOState() rejects non-object', () => {
    expect(() => color.setOCIOState(null as any)).toThrow();
    expect(() => color.setOCIOState([] as any)).toThrow();
  });

  it('API-U282n: getAvailableConfigs() returns configs array', () => {
    const configs = color.getAvailableConfigs();
    expect(Array.isArray(configs)).toBe(true);
    expect(configs.length).toBeGreaterThan(0);
    expect(configs[0]).toHaveProperty('name');
    expect(configs[0]).toHaveProperty('description');
  });

  it('API-U282o: OCIO methods throw when no provider', () => {
    const colorNoOCIO = new ColorAPI(colorControls, cdlControl, curvesControl);
    expect(() => colorNoOCIO.setOCIOState({ enabled: true })).toThrow(/not available/i);
    expect(() => colorNoOCIO.getOCIOState()).toThrow(/not available/i);
    // getAvailableConfigs is static and does not need a provider
    expect(() => colorNoOCIO.getAvailableConfigs()).not.toThrow();
  });

  // --- Disposal tests for new methods ---
  it('API-U282p: new methods throw after dispose', () => {
    color.dispose();
    expect(() => color.resetCDL()).toThrow();
    expect(() => color.exportCurvesJSON()).toThrow();
    expect(() => color.importCurvesJSON('{}')).toThrow();
    expect(() => color.loadLUT(null)).toThrow();
    expect(() => color.clearLUT()).toThrow();
    expect(() => color.setLUTIntensity(0.5)).toThrow();
    expect(() => color.applyLUTPreset('identity')).toThrow();
    expect(() => color.setToneMapping({ enabled: true })).toThrow();
    expect(() => color.getToneMapping()).toThrow();
    expect(() => color.setDisplayProfile({} as any)).toThrow();
    expect(() => color.getDisplayProfile()).toThrow();
    expect(() => color.getDisplayCapabilities()).toThrow();
    expect(() => color.setOCIOState({ enabled: true })).toThrow();
    expect(() => color.getOCIOState()).toThrow();
    expect(() => color.getAvailableConfigs()).toThrow();
  });
});

// ============================================================
// MarkersAPI Tests
// ============================================================

describe('MarkersAPI', () => {
  let markers: MarkersAPI;
  let session: any;

  beforeEach(() => {
    session = createMockSession();
    markers = new MarkersAPI(session);
  });

  it('API-U070: add() validates frame number', () => {
    expect(() => markers.add(NaN)).toThrow();
    expect(() => markers.add(0)).toThrow();
    expect(() => markers.add(-1)).toThrow();
  });

  it('API-U071: add() creates marker with defaults', () => {
    markers.add(10);
    const marker = markers.get(10);
    expect(marker).not.toBeNull();
    expect(marker!.frame).toBe(10);
    expect(marker!.note).toBe('');
    expect(marker!.color).toBe('#ff4444');
  });

  it('API-U072: add() accepts note and color', () => {
    markers.add(10, 'my note', '#00ff00');
    const marker = markers.get(10);
    expect(marker).not.toBeNull();
    expect(marker!.note).toBe('my note');
    expect(marker!.color).toBe('#00ff00');
  });

  it('API-U073: remove() deletes marker', () => {
    markers.add(10);
    expect(markers.get(10)).not.toBeNull();
    markers.remove(10);
    expect(markers.get(10)).toBeNull();
  });

  it('API-U074: remove() validates frame number', () => {
    expect(() => markers.remove(NaN)).toThrow();
  });

  it('API-U075: getAll() returns array sorted by frame', () => {
    session._marks.set(30, { frame: 30, note: '', color: '#ff0000' });
    session._marks.set(10, { frame: 10, note: 'first', color: '#00ff00' });
    session._marks.set(20, { frame: 20, note: 'mid', color: '#0000ff' });

    const all = markers.getAll();
    expect(all.length).toBe(3);
    expect(all[0]!.frame).toBe(10);
    expect(all[1]!.frame).toBe(20);
    expect(all[2]!.frame).toBe(30);
  });

  it('API-U076: clear() removes all markers', () => {
    markers.add(10);
    markers.add(20);
    expect(markers.count()).toBe(2);
    markers.clear();
    expect(markers.count()).toBe(0);
    expect(markers.getAll()).toEqual([]);
  });

  it('API-U077: goToNext() seeks to next marker', () => {
    session._marks.set(10, { frame: 10, note: '', color: '#ff0000' });
    session._marks.set(20, { frame: 20, note: '', color: '#ff0000' });
    session._currentFrame = 5;

    const result = markers.goToNext();
    expect(session.goToNextMarker).toHaveBeenCalled();
    expect(result).toBe(10);
  });

  it('API-U078: goToPrevious() seeks to previous marker', () => {
    session._marks.set(10, { frame: 10, note: '', color: '#ff0000' });
    session._marks.set(20, { frame: 20, note: '', color: '#ff0000' });
    session._currentFrame = 25;

    const result = markers.goToPrevious();
    expect(session.goToPreviousMarker).toHaveBeenCalled();
    expect(result).toBe(20);
  });

  it('API-U079: get() returns marker at frame', () => {
    session._marks.set(10, { frame: 10, note: 'test', color: '#ff0000' });
    const marker = markers.get(10);
    expect(marker).not.toBeNull();
    expect(marker!.frame).toBe(10);
    expect(marker!.note).toBe('test');
  });

  it('API-U080: get() returns null for non-existent frame', () => {
    expect(markers.get(999)).toBeNull();
  });

  it('API-U081: count() returns number of markers', () => {
    session._marks.set(10, { frame: 10, note: '', color: '#ff0000' });
    session._marks.set(20, { frame: 20, note: '', color: '#ff0000' });
    expect(markers.count()).toBe(2);
  });

  it('API-U082: add() rejects non-string note', () => {
    expect(() => markers.add(10, 123 as any)).toThrow(/note must be a string/);
  });

  it('API-U083: add() rejects non-string color', () => {
    expect(() => markers.add(10, 'note', 123 as any)).toThrow(/color must be a string/);
  });

  it('API-U084: add() rounds float frame to nearest integer', () => {
    markers.add(10.7);
    expect(session.setMarker).toHaveBeenCalledWith(11, '', '#ff4444', undefined);
  });

  it('API-U085: getAll() returns empty array when no markers', () => {
    const all = markers.getAll();
    expect(all).toEqual([]);
  });

  it('API-U086: goToNext() returns null when no markers', () => {
    const result = markers.goToNext();
    expect(result).toBeNull();
  });

  it('API-U087: goToPrevious() returns null when no markers', () => {
    const result = markers.goToPrevious();
    expect(result).toBeNull();
  });

  it('API-U088: remove() on non-existent frame does not throw', () => {
    expect(() => markers.remove(999)).not.toThrow();
  });

  // Duration marker tests
  it('API-U089: add() creates duration marker with endFrame', () => {
    markers.add(10, 'range note', '#ff0000', 25);
    const marker = markers.get(10);
    expect(marker).not.toBeNull();
    expect(marker!.frame).toBe(10);
    expect(marker!.note).toBe('range note');
    expect(marker!.color).toBe('#ff0000');
    expect(marker!.endFrame).toBe(25);
  });

  it('API-U090: add() rejects endFrame <= frame', () => {
    expect(() => markers.add(10, '', '#ff0000', 10)).toThrow(/endFrame must be greater than frame/);
    expect(() => markers.add(10, '', '#ff0000', 5)).toThrow(/endFrame must be greater than frame/);
  });

  it('API-U091: add() rejects NaN endFrame', () => {
    expect(() => markers.add(10, '', '#ff0000', NaN)).toThrow(/endFrame must be a valid number/);
  });

  it('API-U092: getAll() returns endFrame for duration markers', () => {
    session._marks.set(10, { frame: 10, note: '', color: '#ff0000', endFrame: 25 });
    session._marks.set(30, { frame: 30, note: '', color: '#00ff00' });

    const all = markers.getAll();
    expect(all.length).toBe(2);
    expect(all[0]!.endFrame).toBe(25);
    expect(all[1]!.endFrame).toBeUndefined();
  });

  it('API-U093: get() returns endFrame for duration marker', () => {
    session._marks.set(10, { frame: 10, note: 'range', color: '#ff0000', endFrame: 20 });
    const marker = markers.get(10);
    expect(marker).not.toBeNull();
    expect(marker!.endFrame).toBe(20);
  });

  it('API-U094: get() does not return endFrame for point marker', () => {
    session._marks.set(10, { frame: 10, note: '', color: '#ff0000' });
    const marker = markers.get(10);
    expect(marker).not.toBeNull();
    expect(marker!.endFrame).toBeUndefined();
  });

  it('API-U095: add() creates duration marker and stores endFrame', () => {
    markers.add(5, 'test', '#ff0000', 15);
    const stored = session._marks.get(5);
    expect(stored.endFrame).toBe(15);
  });

  // Regression tests for #564 (float frames) and #569 (non-finite values)
  it('API-U096: add() rounds float frame to integer', () => {
    markers.add(10.3);
    expect(session.setMarker).toHaveBeenCalledWith(10, '', '#ff4444', undefined);
  });

  it('API-U097: add() rejects Infinity frame', () => {
    expect(() => markers.add(Infinity)).toThrow(/valid positive frame number/);
  });

  it('API-U098: add() rejects -Infinity frame', () => {
    expect(() => markers.add(-Infinity)).toThrow(/valid positive frame number/);
  });

  it('API-U099: add() rounds float endFrame to integer', () => {
    markers.add(5, '', '#ff0000', 15.8);
    expect(session.setMarker).toHaveBeenCalledWith(5, '', '#ff0000', 16);
  });

  it('API-U100: add() rejects Infinity endFrame', () => {
    expect(() => markers.add(10, '', '#ff0000', Infinity)).toThrow(/endFrame must be a valid number/);
  });

  it('API-U101: add() rejects -Infinity endFrame', () => {
    expect(() => markers.add(10, '', '#ff0000', -Infinity)).toThrow(/endFrame must be a valid number/);
  });

  it('API-U102: remove() rounds float frame to integer', () => {
    markers.remove(10.7);
    expect(session.removeMark).toHaveBeenCalledWith(11);
  });

  it('API-U103: remove() rejects Infinity frame', () => {
    expect(() => markers.remove(Infinity)).toThrow(/valid frame number/);
  });

  it('API-U104: get() rounds float frame to integer', () => {
    session._marks.set(11, { frame: 11, note: '', color: '#ff0000' });
    const marker = markers.get(10.7);
    expect(marker).not.toBeNull();
    expect(marker!.frame).toBe(11);
  });
});

// ============================================================
// EventsAPI Tests
// ============================================================

describe('EventsAPI', () => {
  let events: EventsAPI;
  let session: any;
  let viewer: any;

  beforeEach(() => {
    session = createMockSession();
    viewer = createMockViewer();
    events = new EventsAPI(session, viewer);
  });

  it('API-U050: on() registers callback', () => {
    const handler = vi.fn();
    events.on('frameChange', handler);

    session.emit('frameChanged', 42);
    expect(handler).toHaveBeenCalledWith({ frame: 42 });
  });

  it('API-U051: on() returns unsubscribe function', () => {
    const handler = vi.fn();
    const unsub = events.on('frameChange', handler);

    session.emit('frameChanged', 1);
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    session.emit('frameChanged', 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('API-U052: off() removes callback', () => {
    const handler = vi.fn();
    events.on('frameChange', handler);

    session.emit('frameChanged', 1);
    expect(handler).toHaveBeenCalledTimes(1);

    events.off('frameChange', handler);
    session.emit('frameChanged', 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('API-U053: once() fires callback once only', () => {
    const handler = vi.fn();
    events.once('frameChange', handler);

    session.emit('frameChanged', 1);
    session.emit('frameChanged', 2);
    session.emit('frameChanged', 3);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ frame: 1 });
  });

  it('API-U054: Multiple callbacks for same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    events.on('frameChange', handler1);
    events.on('frameChange', handler2);

    session.emit('frameChanged', 42);

    expect(handler1).toHaveBeenCalledWith({ frame: 42 });
    expect(handler2).toHaveBeenCalledWith({ frame: 42 });
  });

  it('API-U055: Invalid event name throws error', () => {
    expect(() => events.on('invalidEvent' as any, vi.fn())).toThrow(/Invalid event name/);
  });

  it('API-U056: Callback receives correct event data for play/pause', () => {
    const playHandler = vi.fn();
    const pauseHandler = vi.fn();

    events.on('play', playHandler);
    events.on('pause', pauseHandler);

    session.emit('playbackChanged', true);
    expect(playHandler).toHaveBeenCalled();

    session.emit('playbackChanged', false);
    expect(pauseHandler).toHaveBeenCalled();
  });

  it('API-U057: dispose() cleans up all listeners', () => {
    const handler = vi.fn();
    events.on('frameChange', handler);

    events.dispose();

    // After dispose, internal events should not forward
    session.emit('frameChanged', 42);
    expect(handler).not.toHaveBeenCalled();
  });

  it('API-U058: speedChange event fires correctly', () => {
    const handler = vi.fn();
    events.on('speedChange', handler);

    session.emit('playbackSpeedChanged', 2);
    expect(handler).toHaveBeenCalledWith({ speed: 2 });
  });

  it('API-U059: volumeChange event fires correctly', () => {
    const handler = vi.fn();
    events.on('volumeChange', handler);

    session.emit('volumeChanged', 0.5);
    expect(handler).toHaveBeenCalledWith({ volume: 0.5 });
  });

  it('API-U060: muteChange event fires correctly', () => {
    const handler = vi.fn();
    events.on('muteChange', handler);

    session.emit('mutedChanged', true);
    expect(handler).toHaveBeenCalledWith({ muted: true });
  });

  it('API-U061: loopModeChange event fires correctly', () => {
    const handler = vi.fn();
    events.on('loopModeChange', handler);

    session.emit('loopModeChanged', 'once');
    expect(handler).toHaveBeenCalledWith({ mode: 'once' });
  });

  it('API-U062: inOutChange event fires correctly', () => {
    const handler = vi.fn();
    events.on('inOutChange', handler);

    session.emit('inOutChanged', { inPoint: 10, outPoint: 50 });
    expect(handler).toHaveBeenCalledWith({ inPoint: 10, outPoint: 50 });
  });

  it('API-U063: markerChange event fires correctly', () => {
    const handler = vi.fn();
    events.on('markerChange', handler);

    const marksMap = new Map();
    marksMap.set(10, { frame: 10, note: 'test', color: '#ff0000' });
    session.emit('marksChanged', marksMap);

    expect(handler).toHaveBeenCalledWith({
      markers: [{ frame: 10, note: 'test', color: '#ff0000' }],
    });
  });

  it('API-U064: sourceLoaded event fires correctly', () => {
    const handler = vi.fn();
    events.on('sourceLoaded', handler);

    session.emit('sourceLoaded', {
      name: 'video.mp4',
      type: 'video',
      width: 1920,
      height: 1080,
      duration: 200,
      fps: 30,
    });

    expect(handler).toHaveBeenCalledWith({
      name: 'video.mp4',
      type: 'video',
      width: 1920,
      height: 1080,
      duration: 200,
      fps: 30,
    });
  });

  it('API-U064b: renderedImagesChanged fires with new source data on currentSourceChanged', () => {
    const handler = vi.fn();
    events.on('renderedImagesChanged', handler);

    // Load first source
    session.emit('sourceLoaded', {
      name: 'first.mp4',
      type: 'video',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
    });
    handler.mockClear();

    // Load second source
    session.emit('sourceLoaded', {
      name: 'second.mp4',
      type: 'video',
      width: 3840,
      height: 2160,
      duration: 200,
      fps: 30,
    });
    handler.mockClear();

    // Switch back to first source
    session._currentSource = {
      name: 'first.mp4',
      type: 'video',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
    };
    session.emit('currentSourceChanged', 0);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      images: [
        {
          name: 'first.mp4',
          index: 0,
          imageMin: [0, 0],
          imageMax: [1920, 1080],
          width: 1920,
          height: 1080,
          nodeName: 'first.mp4',
        },
      ],
    });
  });

  it('API-U064b2: renderedImagesChanged emits one image in single-source mode', () => {
    session._abCompareAvailable = false;
    session._sourceB = null;

    const handler = vi.fn();
    events.on('renderedImagesChanged', handler);

    session.emit('sourceLoaded', {
      name: 'clip.mp4',
      type: 'video',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]![0];
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0]).toEqual({
      name: 'clip.mp4',
      index: 0,
      imageMin: [0, 0],
      imageMax: [1920, 1080],
      width: 1920,
      height: 1080,
      nodeName: 'clip.mp4',
    });
  });

  it('API-U064b3: renderedImagesChanged emits two images in A/B compare mode', () => {
    // Set up A/B compare as active with a B source
    session._abCompareAvailable = true;
    session._sourceB = { name: 'clipB.mp4', type: 'video', width: 3840, height: 2160, duration: 200, fps: 30 };

    const handler = vi.fn();
    events.on('renderedImagesChanged', handler);

    // Load source A (triggers emitCurrentRenderedImages)
    session.emit('sourceLoaded', {
      name: 'clipA.mp4',
      type: 'video',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]![0];
    expect(payload.images).toHaveLength(2);
    expect(payload.images[0]).toEqual({
      name: 'clipA.mp4',
      index: 0,
      imageMin: [0, 0],
      imageMax: [1920, 1080],
      width: 1920,
      height: 1080,
      nodeName: 'clipA.mp4',
    });
    expect(payload.images[1]).toEqual({
      name: 'clipB.mp4',
      index: 1,
      imageMin: [0, 0],
      imageMax: [3840, 2160],
      width: 3840,
      height: 2160,
      nodeName: 'clipB.mp4',
    });
  });

  it('API-U064c: viewTransformChanged fires on viewport resize via addViewChangeListener', () => {
    // Create a new EventsAPI with a viewer that supports addViewChangeListener
    let registeredListener: ((panX: number, panY: number, zoom: number) => void) | null = null;
    const resizableViewer: any = {
      ...viewer,
      addViewChangeListener: vi.fn((cb: any) => {
        registeredListener = cb;
        return () => {
          registeredListener = null;
        };
      }),
      getViewportSize: vi.fn(() => ({ width: 800, height: 600 })),
      getSourceDimensions: vi.fn(() => ({ width: 1920, height: 1080 })),
    };

    const localEvents = new EventsAPI(session, resizableViewer);
    const handler = vi.fn();
    localEvents.on('viewTransformChanged', handler);

    // Simulate a resize by invoking the registered listener with current pan/zoom
    expect(registeredListener).not.toBeNull();
    registeredListener!(0, 0, 1);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      viewWidth: 800,
      viewHeight: 600,
      scale: 1,
      translation: [0, 0],
      imageWidth: 1920,
      imageHeight: 1080,
      pixelAspect: 1,
    });

    localEvents.dispose();
  });

  it('API-U064d: viewTransformChanged emits pixelAspect from source (square pixels)', () => {
    // When getSourceDimensions returns pixelAspect: 1.0 (square pixels), the event should carry 1
    let registeredListener: ((panX: number, panY: number, zoom: number) => void) | null = null;
    const squarePixelViewer: any = {
      ...viewer,
      addViewChangeListener: vi.fn((cb: any) => {
        registeredListener = cb;
        return () => {
          registeredListener = null;
        };
      }),
      getViewportSize: vi.fn(() => ({ width: 800, height: 600 })),
      getSourceDimensions: vi.fn(() => ({ width: 1920, height: 1080, pixelAspect: 1.0 })),
    };

    const localEvents = new EventsAPI(session, squarePixelViewer);
    const handler = vi.fn();
    localEvents.on('viewTransformChanged', handler);

    registeredListener!(10, 20, 2);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelAspect: 1.0,
      }),
    );

    localEvents.dispose();
  });

  it('API-U064e: viewTransformChanged emits non-1.0 pixelAspect for anamorphic sources', () => {
    // When getSourceDimensions returns a non-square pixelAspect (e.g., 2.0 for anamorphic),
    // the event should carry that value instead of hardcoded 1
    let registeredListener: ((panX: number, panY: number, zoom: number) => void) | null = null;
    const anamorphicViewer: any = {
      ...viewer,
      addViewChangeListener: vi.fn((cb: any) => {
        registeredListener = cb;
        return () => {
          registeredListener = null;
        };
      }),
      getViewportSize: vi.fn(() => ({ width: 800, height: 600 })),
      getSourceDimensions: vi.fn(() => ({ width: 1920, height: 1080, pixelAspect: 2.0 })),
    };

    const localEvents = new EventsAPI(session, anamorphicViewer);
    const handler = vi.fn();
    localEvents.on('viewTransformChanged', handler);

    registeredListener!(0, 0, 1);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelAspect: 2.0,
        imageWidth: 1920,
        imageHeight: 1080,
      }),
    );

    localEvents.dispose();
  });

  it('API-U064f: viewTransformChanged defaults pixelAspect to 1 when source omits it', () => {
    // When getSourceDimensions does not include pixelAspect, the event should default to 1
    let registeredListener: ((panX: number, panY: number, zoom: number) => void) | null = null;
    const legacyViewer: any = {
      ...viewer,
      addViewChangeListener: vi.fn((cb: any) => {
        registeredListener = cb;
        return () => {
          registeredListener = null;
        };
      }),
      getViewportSize: vi.fn(() => ({ width: 800, height: 600 })),
      getSourceDimensions: vi.fn(() => ({ width: 1920, height: 1080 })),
    };

    const localEvents = new EventsAPI(session, legacyViewer);
    const handler = vi.fn();
    localEvents.on('viewTransformChanged', handler);

    registeredListener!(0, 0, 1);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelAspect: 1,
      }),
    );

    localEvents.dispose();
  });

  it('API-U065: error event can be emitted', () => {
    const handler = vi.fn();
    events.on('error', handler);

    events.emitError('Something went wrong', 'ERR_UNKNOWN');
    expect(handler).toHaveBeenCalledWith({ message: 'Something went wrong', code: 'ERR_UNKNOWN' });
  });

  it('API-U066: getEventNames() returns all valid event names', () => {
    const names = events.getEventNames();
    expect(names).toContain('frameChange');
    expect(names).toContain('play');
    expect(names).toContain('pause');
    expect(names).toContain('sourceLoaded');
    expect(names).toContain('error');
    expect(names.length).toBeGreaterThan(5);
  });

  it('API-U067: listener errors are caught and do not propagate', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorHandler = vi.fn(() => {
      throw new Error('boom');
    });
    const normalHandler = vi.fn();

    events.on('frameChange', errorHandler);
    events.on('frameChange', normalHandler);

    session.emit('frameChanged', 1);

    expect(errorHandler).toHaveBeenCalled();
    expect(normalHandler).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('API-U068: on() rejects non-function callbacks', () => {
    expect(() => events.on('frameChange', 'notAFunction' as any)).toThrow(/callback must be a function/);
    expect(() => events.on('frameChange', null as any)).toThrow(/callback must be a function/);
    expect(() => events.on('frameChange', 123 as any)).toThrow(/callback must be a function/);
  });

  it('API-U069: on() rejects non-string event names', () => {
    expect(() => events.on(123 as any, vi.fn())).toThrow(/Invalid event name/);
    expect(() => events.on(null as any, vi.fn())).toThrow(/Invalid event name/);
  });

  it('API-U070: once() unsubscribe before firing prevents callback', () => {
    const handler = vi.fn();
    const unsub = events.once('frameChange', handler);

    unsub();
    session.emit('frameChanged', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('API-U071: unsubscribe function is idempotent', () => {
    const handler = vi.fn();
    const unsub = events.on('frameChange', handler);

    unsub();
    unsub(); // second call should not throw
    unsub(); // third call should not throw

    session.emit('frameChanged', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('API-U072: dispose() is idempotent (double dispose does not throw)', () => {
    events.dispose();
    expect(() => events.dispose()).not.toThrow();
  });

  it('API-U073: once() rejects non-function callbacks', () => {
    expect(() => events.once('frameChange', 'bad' as any)).toThrow(/callback must be a function/);
  });

  it('API-U074: off() on unknown handler does not throw', () => {
    const handler = vi.fn();
    // off() for a handler that was never registered should not throw
    expect(() => events.off('frameChange', handler)).not.toThrow();
  });

  it('API-U075: emitError without code', () => {
    const handler = vi.fn();
    events.on('error', handler);

    events.emitError('test error');
    expect(handler).toHaveBeenCalledWith({ message: 'test error', code: undefined });
  });

  it('API-U076: audioError session event emits public error event', () => {
    const handler = vi.fn();
    events.on('error', handler);

    session.emit('audioError', {
      type: 'decode',
      message: 'Cannot decode audio stream',
    });

    expect(handler).toHaveBeenCalledWith({
      message: 'Audio error: Cannot decode audio stream',
      code: 'AUDIO_DECODE',
    });
  });

  it('API-U077: unsupportedCodec session event emits public error event', () => {
    const handler = vi.fn();
    events.on('error', handler);

    session.emit('unsupportedCodec', {
      filename: 'clip.mov',
      codec: 'prores',
      codecFamily: 'prores',
      error: new Error('ProRes not supported'),
    });

    expect(handler).toHaveBeenCalledWith({
      message: 'Unsupported codec "prores" in clip.mov',
      code: 'UNSUPPORTED_CODEC',
    });
  });

  it('API-U078: unsupportedCodec with null codec emits "unknown"', () => {
    const handler = vi.fn();
    events.on('error', handler);

    session.emit('unsupportedCodec', {
      filename: 'mystery.mkv',
      codec: null,
      codecFamily: 'unknown',
      error: new Error('Unknown codec'),
    });

    expect(handler).toHaveBeenCalledWith({
      message: 'Unsupported codec "unknown" in mystery.mkv',
      code: 'UNSUPPORTED_CODEC',
    });
  });

  it('API-U079: representationError session event emits public error event', () => {
    const handler = vi.fn();
    events.on('error', handler);

    session.emit('representationError', {
      sourceIndex: 2,
      repId: 'rep-hd',
      error: 'Network timeout loading representation',
      userInitiated: true,
    });

    expect(handler).toHaveBeenCalledWith({
      message: 'Representation error for source 2: Network timeout loading representation',
      code: 'REPRESENTATION_ERROR',
    });
  });

  it('API-U080: frameDecodeTimeout session event emits public error event', () => {
    const handler = vi.fn();
    events.on('error', handler);

    session.emit('frameDecodeTimeout', 42);

    expect(handler).toHaveBeenCalledWith({
      message: 'Frame 42 decode timed out',
      code: 'FRAME_DECODE_TIMEOUT',
    });
  });

  it('API-U081: multiple error events from different sources accumulate', () => {
    const handler = vi.fn();
    events.on('error', handler);

    session.emit('audioError', { type: 'autoplay', message: 'Blocked by browser policy' });
    session.emit('frameDecodeTimeout', 10);
    session.emit('unsupportedCodec', {
      filename: 'test.mp4',
      codec: 'av1',
      codecFamily: 'av1',
      error: new Error('AV1 not supported'),
    });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, {
      message: 'Audio error: Blocked by browser policy',
      code: 'AUDIO_AUTOPLAY',
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      message: 'Frame 10 decode timed out',
      code: 'FRAME_DECODE_TIMEOUT',
    });
    expect(handler).toHaveBeenNthCalledWith(3, {
      message: 'Unsupported codec "av1" in test.mp4',
      code: 'UNSUPPORTED_CODEC',
    });
  });

  it('API-U082: error events stop after dispose()', () => {
    const handler = vi.fn();
    events.on('error', handler);

    session.emit('audioError', { type: 'network', message: 'Network error' });
    expect(handler).toHaveBeenCalledTimes(1);

    events.dispose();

    session.emit('audioError', { type: 'network', message: 'Second error' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('API-U083: stop event fires when session emits playbackStopped', () => {
    const stopHandler = vi.fn();
    events.on('stop', stopHandler);

    session.emit('playbackStopped', undefined);
    expect(stopHandler).toHaveBeenCalledTimes(1);
  });

  it('API-U084: stop event is distinct from pause event', () => {
    const stopHandler = vi.fn();
    const pauseHandler = vi.fn();
    events.on('stop', stopHandler);
    events.on('pause', pauseHandler);

    // A normal pause should not trigger stop
    session.emit('playbackChanged', false);
    expect(pauseHandler).toHaveBeenCalledTimes(1);
    expect(stopHandler).toHaveBeenCalledTimes(0);

    // A stop should trigger stop (and also pause via playbackChanged)
    session.emit('playbackStopped', undefined);
    expect(stopHandler).toHaveBeenCalledTimes(1);
  });

  it('API-U085: stop event unsubscribe works', () => {
    const handler = vi.fn();
    const unsub = events.on('stop', handler);

    session.emit('playbackStopped', undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    session.emit('playbackStopped', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('API-U086: stop event not forwarded after dispose()', () => {
    const handler = vi.fn();
    events.on('stop', handler);

    events.dispose();

    session.emit('playbackStopped', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('API-U087: once() works for stop event', () => {
    const handler = vi.fn();
    events.once('stop', handler);

    session.emit('playbackStopped', undefined);
    session.emit('playbackStopped', undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // -- Issue #208: markerChange must include endFrame for duration markers --

  it('API-U208a: markerChange includes endFrame for duration markers', () => {
    const handler = vi.fn();
    events.on('markerChange', handler);

    const marksMap = new Map();
    marksMap.set(10, { frame: 10, note: 'range', color: '#00ff00', endFrame: 25 });
    session.emit('marksChanged', marksMap);

    expect(handler).toHaveBeenCalledWith({
      markers: [{ frame: 10, note: 'range', color: '#00ff00', endFrame: 25 }],
    });
  });

  it('API-U208b: markerChange omits endFrame for point markers', () => {
    const handler = vi.fn();
    events.on('markerChange', handler);

    const marksMap = new Map();
    marksMap.set(5, { frame: 5, note: 'point', color: '#ff0000' });
    session.emit('marksChanged', marksMap);

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]![0];
    expect(payload.markers).toHaveLength(1);
    expect(payload.markers[0]).toEqual({ frame: 5, note: 'point', color: '#ff0000' });
    expect(payload.markers[0]).not.toHaveProperty('endFrame');
  });

  it('API-U208c: markerChange handles mix of point and duration markers', () => {
    const handler = vi.fn();
    events.on('markerChange', handler);

    const marksMap = new Map();
    marksMap.set(1, { frame: 1, note: 'point', color: '#ff0000' });
    marksMap.set(10, { frame: 10, note: 'range', color: '#00ff00', endFrame: 20 });
    marksMap.set(30, { frame: 30, note: '', color: '#0000ff' });
    session.emit('marksChanged', marksMap);

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]![0];
    expect(payload.markers).toHaveLength(3);

    const point1 = payload.markers.find((m: any) => m.frame === 1);
    const range = payload.markers.find((m: any) => m.frame === 10);
    const point2 = payload.markers.find((m: any) => m.frame === 30);

    expect(point1).not.toHaveProperty('endFrame');
    expect(range!.endFrame).toBe(20);
    expect(point2).not.toHaveProperty('endFrame');
  });

  // -- Issue #292: playlistEnded event --

  it('API-U292a: playlistEnded is a valid event name', () => {
    const names = events.getEventNames();
    expect(names).toContain('playlistEnded');
  });

  it('API-U292b: subscribing to playlistEnded works', () => {
    const handler = vi.fn();
    const unsub = events.on('playlistEnded', handler);
    expect(typeof unsub).toBe('function');
  });

  it('API-U292c: playlistEnded fires when session emits playlistEnded', () => {
    const handler = vi.fn();
    events.on('playlistEnded', handler);

    session.emit('playlistEnded', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('API-U292d: playlistEnded unsubscribe works', () => {
    const handler = vi.fn();
    const unsub = events.on('playlistEnded', handler);

    session.emit('playlistEnded', undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    session.emit('playlistEnded', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('API-U292e: playlistEnded not forwarded after dispose()', () => {
    const handler = vi.fn();
    events.on('playlistEnded', handler);

    events.dispose();

    session.emit('playlistEnded', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('API-U292f: once() works for playlistEnded event', () => {
    const handler = vi.fn();
    events.once('playlistEnded', handler);

    session.emit('playlistEnded', undefined);
    session.emit('playlistEnded', undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // -- Issue #545: representationChanged / fallbackActivated events --

  it('API-U545a: representationChanged is a valid event name', () => {
    const names = events.getEventNames();
    expect(names).toContain('representationChanged');
  });

  it('API-U545b: fallbackActivated is a valid event name', () => {
    const names = events.getEventNames();
    expect(names).toContain('fallbackActivated');
  });

  it('API-U545c: representationChanged updates _lastLoadedSource and emits renderedImagesChanged', () => {
    const repHandler = vi.fn();
    const renderedHandler = vi.fn();
    events.on('representationChanged', repHandler);
    events.on('renderedImagesChanged', renderedHandler);

    session.emit('representationChanged', {
      sourceIndex: 0,
      previousRepId: 'rep-old',
      newRepId: 'rep-new',
      representation: {
        id: 'rep-new',
        label: 'Proxy 1280x720',
        kind: 'proxy',
        priority: 2,
        status: 'ready',
        resolution: { width: 1280, height: 720 },
        par: 1,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
      },
    });

    // representationChanged should be emitted with the public payload
    expect(repHandler).toHaveBeenCalledTimes(1);
    expect(repHandler).toHaveBeenCalledWith({
      sourceIndex: 0,
      previousRepId: 'rep-old',
      newRepId: 'rep-new',
      label: 'Proxy 1280x720',
      width: 1280,
      height: 720,
    });

    // renderedImagesChanged should reflect the new representation dimensions
    expect(renderedHandler).toHaveBeenCalledTimes(1);
    const renderedPayload = renderedHandler.mock.calls[0]![0];
    expect(renderedPayload.images[0].width).toBe(1280);
    expect(renderedPayload.images[0].height).toBe(720);
    expect(renderedPayload.images[0].name).toBe('Proxy 1280x720');
  });

  it('API-U545d: fallbackActivated updates _lastLoadedSource and emits renderedImagesChanged', () => {
    const fbHandler = vi.fn();
    const renderedHandler = vi.fn();
    events.on('fallbackActivated', fbHandler);
    events.on('renderedImagesChanged', renderedHandler);

    session.emit('fallbackActivated', {
      sourceIndex: 0,
      failedRepId: 'rep-hires',
      fallbackRepId: 'rep-proxy',
      fallbackRepresentation: {
        id: 'rep-proxy',
        label: 'Fallback 960x540',
        kind: 'proxy',
        priority: 3,
        status: 'ready',
        resolution: { width: 960, height: 540 },
        par: 1,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
      },
    });

    // fallbackActivated should be emitted with the public payload
    expect(fbHandler).toHaveBeenCalledTimes(1);
    expect(fbHandler).toHaveBeenCalledWith({
      sourceIndex: 0,
      failedRepId: 'rep-hires',
      fallbackRepId: 'rep-proxy',
      label: 'Fallback 960x540',
      width: 960,
      height: 540,
    });

    // renderedImagesChanged should reflect fallback dimensions
    expect(renderedHandler).toHaveBeenCalledTimes(1);
    const renderedPayload = renderedHandler.mock.calls[0]![0];
    expect(renderedPayload.images[0].width).toBe(960);
    expect(renderedPayload.images[0].height).toBe(540);
    expect(renderedPayload.images[0].name).toBe('Fallback 960x540');
  });

  it('API-U545e: representationChanged overwrites stale _lastLoadedSource from sourceLoaded', () => {
    const renderedHandler = vi.fn();
    events.on('renderedImagesChanged', renderedHandler);

    // First: sourceLoaded sets initial dimensions
    session.emit('sourceLoaded', {
      name: 'original.exr',
      type: 'image',
      width: 4096,
      height: 2160,
      duration: 1,
      fps: 24,
    });
    expect(renderedHandler).toHaveBeenCalledTimes(1);
    expect(renderedHandler.mock.calls[0]![0].images[0].width).toBe(4096);

    // Then: representationChanged switches to a proxy
    session.emit('representationChanged', {
      sourceIndex: 0,
      previousRepId: 'rep-full',
      newRepId: 'rep-proxy',
      representation: {
        id: 'rep-proxy',
        label: 'Proxy 1280x720',
        kind: 'proxy',
        priority: 2,
        status: 'ready',
        resolution: { width: 1280, height: 720 },
        par: 1,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
      },
    });

    // renderedImagesChanged should now have proxy dimensions, not original
    expect(renderedHandler).toHaveBeenCalledTimes(2);
    const latest = renderedHandler.mock.calls[1]![0];
    expect(latest.images[0].width).toBe(1280);
    expect(latest.images[0].height).toBe(720);
    expect(latest.images[0].name).toBe('Proxy 1280x720');
  });

  it('API-U545f: representationChanged unsubscribe works', () => {
    const handler = vi.fn();
    const unsub = events.on('representationChanged', handler);

    session.emit('representationChanged', {
      sourceIndex: 0,
      previousRepId: null,
      newRepId: 'rep-1',
      representation: {
        id: 'rep-1',
        label: 'Test',
        kind: 'movie',
        priority: 1,
        status: 'ready',
        resolution: { width: 1920, height: 1080 },
        par: 1,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
      },
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    session.emit('representationChanged', {
      sourceIndex: 0,
      previousRepId: 'rep-1',
      newRepId: 'rep-2',
      representation: {
        id: 'rep-2',
        label: 'Test2',
        kind: 'movie',
        priority: 1,
        status: 'ready',
        resolution: { width: 1920, height: 1080 },
        par: 1,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
      },
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// Disposed Guard Tests (Issue #206)
// ============================================================

describe('Sub-API disposed guards', () => {
  let api: OpenRVAPI;

  beforeEach(() => {
    const config = createAPIConfig();
    api = new OpenRVAPI(config);
    api.dispose();
  });

  const DISPOSED_MSG = 'Cannot use API after dispose() has been called';

  // -- PlaybackAPI --
  it('API-U088: playback.play() throws after dispose', () => {
    expect(() => api.playback.play()).toThrow(DISPOSED_MSG);
  });

  it('API-U089: playback.pause() throws after dispose', () => {
    expect(() => api.playback.pause()).toThrow(DISPOSED_MSG);
  });

  it('API-U090: playback.toggle() throws after dispose', () => {
    expect(() => api.playback.toggle()).toThrow(DISPOSED_MSG);
  });

  it('API-U091: playback.stop() throws after dispose', () => {
    expect(() => api.playback.stop()).toThrow(DISPOSED_MSG);
  });

  it('API-U092: playback.seek() throws after dispose', () => {
    expect(() => api.playback.seek(10)).toThrow(DISPOSED_MSG);
  });

  it('API-U093: playback.step() throws after dispose', () => {
    expect(() => api.playback.step()).toThrow(DISPOSED_MSG);
  });

  it('API-U094: playback.setSpeed() throws after dispose', () => {
    expect(() => api.playback.setSpeed(2)).toThrow(DISPOSED_MSG);
  });

  it('API-U095: playback.getSpeed() throws after dispose', () => {
    expect(() => api.playback.getSpeed()).toThrow(DISPOSED_MSG);
  });

  it('API-U096: playback.isPlaying() throws after dispose', () => {
    expect(() => api.playback.isPlaying()).toThrow(DISPOSED_MSG);
  });

  it('API-U097: playback.getCurrentFrame() throws after dispose', () => {
    expect(() => api.playback.getCurrentFrame()).toThrow(DISPOSED_MSG);
  });

  it('API-U098: playback.getTotalFrames() throws after dispose', () => {
    expect(() => api.playback.getTotalFrames()).toThrow(DISPOSED_MSG);
  });

  it('API-U099: playback.setPlaybackMode() throws after dispose', () => {
    expect(() => api.playback.setPlaybackMode('realtime')).toThrow(DISPOSED_MSG);
  });

  it('API-U100: playback.getPlaybackMode() throws after dispose', () => {
    expect(() => api.playback.getPlaybackMode()).toThrow(DISPOSED_MSG);
  });

  it('API-U101: playback.getMeasuredFPS() throws after dispose', () => {
    expect(() => api.playback.getMeasuredFPS()).toThrow(DISPOSED_MSG);
  });

  it('API-U232: playback.isBuffering() throws after dispose', () => {
    expect(() => api.playback.isBuffering()).toThrow(DISPOSED_MSG);
  });

  it('API-U233: playback.getDroppedFrameCount() throws after dispose', () => {
    expect(() => api.playback.getDroppedFrameCount()).toThrow(DISPOSED_MSG);
  });

  it('API-U283a: playback.setPlayDirection() throws after dispose', () => {
    expect(() => api.playback.setPlayDirection(-1)).toThrow(DISPOSED_MSG);
  });

  it('API-U283b: playback.getPlayDirection() throws after dispose', () => {
    expect(() => api.playback.getPlayDirection()).toThrow(DISPOSED_MSG);
  });

  // -- MediaAPI --
  it('API-U102: media.getCurrentSource() throws after dispose', () => {
    expect(() => api.media.getCurrentSource()).toThrow(DISPOSED_MSG);
  });

  it('API-U103: media.getDuration() throws after dispose', () => {
    expect(() => api.media.getDuration()).toThrow(DISPOSED_MSG);
  });

  it('API-U104: media.getFPS() throws after dispose', () => {
    expect(() => api.media.getFPS()).toThrow(DISPOSED_MSG);
  });

  it('API-U212: media.getPlaybackFPS() throws after dispose', () => {
    expect(() => api.media.getPlaybackFPS()).toThrow(DISPOSED_MSG);
  });

  it('API-U105: media.getResolution() throws after dispose', () => {
    expect(() => api.media.getResolution()).toThrow(DISPOSED_MSG);
  });

  it('API-U106: media.hasMedia() throws after dispose', () => {
    expect(() => api.media.hasMedia()).toThrow(DISPOSED_MSG);
  });

  it('API-U107: media.getSourceCount() throws after dispose', () => {
    expect(() => api.media.getSourceCount()).toThrow(DISPOSED_MSG);
  });

  it('API-U108: media.loadProceduralSource() throws after dispose', () => {
    expect(() => api.media.loadProceduralSource('smpte_bars' as any)).toThrow(DISPOSED_MSG);
  });

  it('API-U109: media.loadMovieProc() throws after dispose', () => {
    expect(() => api.media.loadMovieProc('test.movieproc')).toThrow(DISPOSED_MSG);
  });

  it('API-U217: media.addSourceFromURL() throws after dispose', async () => {
    await expect(api.media.addSourceFromURL('https://example.com/clip.mp4')).rejects.toThrow(DISPOSED_MSG);
  });

  it('API-U218: media.clearSources() throws after dispose', () => {
    expect(() => api.media.clearSources()).toThrow(DISPOSED_MSG);
  });

  it('API-U283c: media.getStartFrame() throws after dispose', () => {
    expect(() => api.media.getStartFrame()).toThrow(DISPOSED_MSG);
  });

  it('API-U283d: media.setPlaybackFPS() throws after dispose', () => {
    expect(() => api.media.setPlaybackFPS(48)).toThrow(DISPOSED_MSG);
  });

  // -- AudioAPI --
  it('API-U110: audio.setVolume() throws after dispose', () => {
    expect(() => api.audio.setVolume(0.5)).toThrow(DISPOSED_MSG);
  });

  it('API-U111: audio.getVolume() throws after dispose', () => {
    expect(() => api.audio.getVolume()).toThrow(DISPOSED_MSG);
  });

  it('API-U112: audio.mute() throws after dispose', () => {
    expect(() => api.audio.mute()).toThrow(DISPOSED_MSG);
  });

  it('API-U113: audio.unmute() throws after dispose', () => {
    expect(() => api.audio.unmute()).toThrow(DISPOSED_MSG);
  });

  it('API-U114: audio.isMuted() throws after dispose', () => {
    expect(() => api.audio.isMuted()).toThrow(DISPOSED_MSG);
  });

  it('API-U115: audio.toggleMute() throws after dispose', () => {
    expect(() => api.audio.toggleMute()).toThrow(DISPOSED_MSG);
  });

  it('API-U116: audio.setPreservesPitch() throws after dispose', () => {
    expect(() => api.audio.setPreservesPitch(true)).toThrow(DISPOSED_MSG);
  });

  it('API-U117: audio.getPreservesPitch() throws after dispose', () => {
    expect(() => api.audio.getPreservesPitch()).toThrow(DISPOSED_MSG);
  });

  it('API-U118: audio.enableAudioScrub() throws after dispose', () => {
    expect(() => api.audio.enableAudioScrub()).toThrow(DISPOSED_MSG);
  });

  it('API-U119: audio.disableAudioScrub() throws after dispose', () => {
    expect(() => api.audio.disableAudioScrub()).toThrow(DISPOSED_MSG);
  });

  it('API-U120: audio.isAudioScrubEnabled() throws after dispose', () => {
    expect(() => api.audio.isAudioScrubEnabled()).toThrow(DISPOSED_MSG);
  });

  it('API-U121: audio.setAudioScrubEnabled() throws after dispose', () => {
    expect(() => api.audio.setAudioScrubEnabled(true)).toThrow(DISPOSED_MSG);
  });

  // -- LoopAPI --
  it('API-U122: loop.setMode() throws after dispose', () => {
    expect(() => api.loop.setMode('loop')).toThrow(DISPOSED_MSG);
  });

  it('API-U123: loop.getMode() throws after dispose', () => {
    expect(() => api.loop.getMode()).toThrow(DISPOSED_MSG);
  });

  it('API-U124: loop.setInPoint() throws after dispose', () => {
    expect(() => api.loop.setInPoint(10)).toThrow(DISPOSED_MSG);
  });

  it('API-U125: loop.setOutPoint() throws after dispose', () => {
    expect(() => api.loop.setOutPoint(90)).toThrow(DISPOSED_MSG);
  });

  it('API-U126: loop.getInPoint() throws after dispose', () => {
    expect(() => api.loop.getInPoint()).toThrow(DISPOSED_MSG);
  });

  it('API-U127: loop.getOutPoint() throws after dispose', () => {
    expect(() => api.loop.getOutPoint()).toThrow(DISPOSED_MSG);
  });

  it('API-U128: loop.clearInOut() throws after dispose', () => {
    expect(() => api.loop.clearInOut()).toThrow(DISPOSED_MSG);
  });

  // -- ViewAPI --
  it('API-U129: view.setZoom() throws after dispose', () => {
    expect(() => api.view.setZoom(2)).toThrow(DISPOSED_MSG);
  });

  it('API-U130: view.getZoom() throws after dispose', () => {
    expect(() => api.view.getZoom()).toThrow(DISPOSED_MSG);
  });

  it('API-U131: view.fitToWindow() throws after dispose', () => {
    expect(() => api.view.fitToWindow()).toThrow(DISPOSED_MSG);
  });

  it('API-U132: view.fitToWidth() throws after dispose', () => {
    expect(() => api.view.fitToWidth()).toThrow(DISPOSED_MSG);
  });

  it('API-U133: view.fitToHeight() throws after dispose', () => {
    expect(() => api.view.fitToHeight()).toThrow(DISPOSED_MSG);
  });

  it('API-U134: view.getFitMode() throws after dispose', () => {
    expect(() => api.view.getFitMode()).toThrow(DISPOSED_MSG);
  });

  it('API-U135: view.setPan() throws after dispose', () => {
    expect(() => api.view.setPan(10, 20)).toThrow(DISPOSED_MSG);
  });

  it('API-U136: view.getPan() throws after dispose', () => {
    expect(() => api.view.getPan()).toThrow(DISPOSED_MSG);
  });

  it('API-U137: view.setChannel() throws after dispose', () => {
    expect(() => api.view.setChannel('red')).toThrow(DISPOSED_MSG);
  });

  it('API-U138: view.getChannel() throws after dispose', () => {
    expect(() => api.view.getChannel()).toThrow(DISPOSED_MSG);
  });

  it('API-U138a: view.setTextureFilterMode() throws after dispose', () => {
    expect(() => api.view.setTextureFilterMode('nearest')).toThrow(DISPOSED_MSG);
  });

  it('API-U138b: view.getTextureFilterMode() throws after dispose', () => {
    expect(() => api.view.getTextureFilterMode()).toThrow(DISPOSED_MSG);
  });

  it('API-U138c: view.setBackgroundPattern() throws after dispose', () => {
    expect(() =>
      api.view.setBackgroundPattern({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' }),
    ).toThrow(DISPOSED_MSG);
  });

  it('API-U138d: view.getBackgroundPattern() throws after dispose', () => {
    expect(() => api.view.getBackgroundPattern()).toThrow(DISPOSED_MSG);
  });

  it('API-U283e: view.getViewportSize() throws after dispose', () => {
    expect(() => api.view.getViewportSize()).toThrow(DISPOSED_MSG);
  });

  // -- ColorAPI --
  it('API-U139: color.setAdjustments() throws after dispose', () => {
    expect(() => api.color.setAdjustments({ exposure: 1 })).toThrow(DISPOSED_MSG);
  });

  it('API-U140: color.getAdjustments() throws after dispose', () => {
    expect(() => api.color.getAdjustments()).toThrow(DISPOSED_MSG);
  });

  it('API-U141: color.reset() throws after dispose', () => {
    expect(() => api.color.reset()).toThrow(DISPOSED_MSG);
  });

  it('API-U142: color.setCDL() throws after dispose', () => {
    expect(() => api.color.setCDL({ saturation: 1.2 })).toThrow(DISPOSED_MSG);
  });

  it('API-U143: color.getCDL() throws after dispose', () => {
    expect(() => api.color.getCDL()).toThrow(DISPOSED_MSG);
  });

  it('API-U144: color.setCurves() throws after dispose', () => {
    expect(() => api.color.setCurves({ master: { enabled: false } })).toThrow(DISPOSED_MSG);
  });

  it('API-U145: color.getCurves() throws after dispose', () => {
    expect(() => api.color.getCurves()).toThrow(DISPOSED_MSG);
  });

  it('API-U146: color.resetCurves() throws after dispose', () => {
    expect(() => api.color.resetCurves()).toThrow(DISPOSED_MSG);
  });

  // -- MarkersAPI --
  it('API-U147: markers.add() throws after dispose', () => {
    expect(() => api.markers.add(10)).toThrow(DISPOSED_MSG);
  });

  it('API-U148: markers.remove() throws after dispose', () => {
    expect(() => api.markers.remove(10)).toThrow(DISPOSED_MSG);
  });

  it('API-U149: markers.getAll() throws after dispose', () => {
    expect(() => api.markers.getAll()).toThrow(DISPOSED_MSG);
  });

  it('API-U150: markers.get() throws after dispose', () => {
    expect(() => api.markers.get(10)).toThrow(DISPOSED_MSG);
  });

  it('API-U151: markers.clear() throws after dispose', () => {
    expect(() => api.markers.clear()).toThrow(DISPOSED_MSG);
  });

  it('API-U152: markers.goToNext() throws after dispose', () => {
    expect(() => api.markers.goToNext()).toThrow(DISPOSED_MSG);
  });

  it('API-U153: markers.goToPrevious() throws after dispose', () => {
    expect(() => api.markers.goToPrevious()).toThrow(DISPOSED_MSG);
  });

  it('API-U154: markers.count() throws after dispose', () => {
    expect(() => api.markers.count()).toThrow(DISPOSED_MSG);
  });

  // -- EventsAPI --
  it('API-U155: events.on() throws after dispose', () => {
    expect(() => api.events.on('frameChange', () => {})).toThrow(DISPOSED_MSG);
  });

  it('API-U156: events.off() throws after dispose', () => {
    expect(() => api.events.off('frameChange', () => {})).toThrow(DISPOSED_MSG);
  });

  it('API-U157: events.once() throws after dispose', () => {
    expect(() => api.events.once('frameChange', () => {})).toThrow(DISPOSED_MSG);
  });

  it('API-U158: events.getEventNames() throws after dispose', () => {
    expect(() => api.events.getEventNames()).toThrow(DISPOSED_MSG);
  });

  // -- Plugins --
  it('API-U159: plugins.register() throws after dispose', () => {
    expect(() =>
      api.plugins.register({
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        activate: vi.fn(),
        deactivate: vi.fn(),
      } as any),
    ).toThrow(DISPOSED_MSG);
  });

  it('API-U160: plugins.activate() throws after dispose', () => {
    expect(() => api.plugins.activate('test')).toThrow(DISPOSED_MSG);
  });

  it('API-U161: plugins.deactivate() throws after dispose', () => {
    expect(() => api.plugins.deactivate('test')).toThrow(DISPOSED_MSG);
  });

  it('API-U162: plugins.getState() throws after dispose', () => {
    expect(() => api.plugins.getState('test')).toThrow(DISPOSED_MSG);
  });

  it('API-U163: plugins.list() throws after dispose', () => {
    expect(() => api.plugins.list()).toThrow(DISPOSED_MSG);
  });

  it('API-U165: plugins.dispose() throws after dispose', () => {
    expect(() => api.plugins.dispose('test')).toThrow(DISPOSED_MSG);
  });

  it('API-U166: plugins.unregister() throws after dispose', () => {
    expect(() => api.plugins.unregister('test')).toThrow(DISPOSED_MSG);
  });

  it('API-U283f: plugins.loadFromURL() throws after dispose', () => {
    expect(() => api.plugins.loadFromURL('https://example.com/plugin.js')).toThrow(DISPOSED_MSG);
  });

  // -- OpenRVAPI.isReady() returns false after dispose --
  it('API-U164: isReady() returns false after dispose', () => {
    expect(api.isReady()).toBe(false);
  });
});

// ============================================================
// Regression: OpenRVAPI.dispose() disposes ALL sub-APIs (#283)
// ============================================================

describe('OpenRVAPI.dispose() disposes all sub-API modules (Issue #283)', () => {
  it('API-U283g: dispose() marks all sub-APIs as disposed', () => {
    const config = createAPIConfig();
    const api = new OpenRVAPI(config);

    // Sanity: none are disposed before calling dispose()
    expect(api.playback._disposed).toBe(false);
    expect(api.media._disposed).toBe(false);
    expect(api.audio._disposed).toBe(false);
    expect(api.loop._disposed).toBe(false);
    expect(api.view._disposed).toBe(false);
    expect(api.color._disposed).toBe(false);
    expect(api.markers._disposed).toBe(false);
    expect(api.events._disposed).toBe(false);

    api.dispose();

    // All sub-APIs must be disposed
    expect(api.playback._disposed).toBe(true);
    expect(api.media._disposed).toBe(true);
    expect(api.audio._disposed).toBe(true);
    expect(api.loop._disposed).toBe(true);
    expect(api.view._disposed).toBe(true);
    expect(api.color._disposed).toBe(true);
    expect(api.markers._disposed).toBe(true);
    expect(api.events._disposed).toBe(true);

    // Top-level isReady must also be false
    expect(api.isReady()).toBe(false);
  });

  it('API-U283h: dispose() is idempotent — calling twice does not throw', () => {
    const config = createAPIConfig();
    const api = new OpenRVAPI(config);
    api.dispose();
    expect(() => api.dispose()).not.toThrow();
    expect(api.isReady()).toBe(false);
  });

  it('API-U283i: after dispose, no sub-API method can mutate state', () => {
    const config = createAPIConfig();
    const api = new OpenRVAPI(config);
    api.dispose();

    // Sample one method from each sub-API to confirm the guard works end-to-end
    const MSG = 'Cannot use API after dispose() has been called';
    expect(() => api.playback.play()).toThrow(MSG);
    expect(() => api.media.getCurrentSource()).toThrow(MSG);
    expect(() => api.audio.setVolume(0.5)).toThrow(MSG);
    expect(() => api.loop.setMode('loop')).toThrow(MSG);
    expect(() => api.view.setZoom(2)).toThrow(MSG);
    expect(() => api.color.getAdjustments()).toThrow(MSG);
    expect(() => api.markers.getAll()).toThrow(MSG);
    expect(() => api.events.on('frameChange', () => {})).toThrow(MSG);
    expect(() => api.plugins.list()).toThrow(MSG);
  });
});

// ============================================================
// Plugin dispose / unregister via public API (Issue #209)
// ============================================================

describe('plugins.dispose() and plugins.unregister() via public API', () => {
  let api: OpenRVAPI;
  const PLUGIN_ID = 'test-dispose-209';

  function makePlugin(id: string = PLUGIN_ID): Plugin {
    return {
      manifest: {
        id,
        name: 'Test Plugin',
        version: '1.0.0',
        contributes: ['decoder'],
      },
      activate: vi.fn(),
      deactivate: vi.fn(),
      dispose: vi.fn(),
    } as unknown as Plugin;
  }

  beforeEach(() => {
    api = new OpenRVAPI(createAPIConfig());
    api.markReady();
  });

  afterEach(async () => {
    // Clean up: ensure the plugin is fully removed from the singleton registry
    const state = pluginRegistry.getState(PLUGIN_ID);
    if (state && state !== 'disposed') {
      await pluginRegistry.dispose(PLUGIN_ID);
    }
    if (pluginRegistry.getState(PLUGIN_ID) === 'disposed') {
      pluginRegistry.unregister(PLUGIN_ID);
    }
    api.dispose();
  });

  it('API-U167: plugins.dispose() transitions a registered plugin to disposed state', async () => {
    const plugin = makePlugin();
    api.plugins.register(plugin);
    expect(api.plugins.getState(PLUGIN_ID)).toBe('registered');

    await api.plugins.dispose(PLUGIN_ID);
    expect(api.plugins.getState(PLUGIN_ID)).toBe('disposed');
  });

  it('API-U168: plugins.dispose() transitions an active plugin to disposed state', async () => {
    const plugin = makePlugin();
    api.plugins.register(plugin);
    await api.plugins.activate(PLUGIN_ID);
    expect(api.plugins.getState(PLUGIN_ID)).toBe('active');

    await api.plugins.dispose(PLUGIN_ID);
    expect(api.plugins.getState(PLUGIN_ID)).toBe('disposed');
  });

  it('API-U169: plugins.unregister() removes a disposed plugin from the registry', async () => {
    const plugin = makePlugin();
    api.plugins.register(plugin);
    await api.plugins.dispose(PLUGIN_ID);

    api.plugins.unregister(PLUGIN_ID);
    expect(api.plugins.getState(PLUGIN_ID)).toBeUndefined();
    expect(api.plugins.list()).not.toContain(PLUGIN_ID);
  });

  it('API-U170: plugins.unregister() throws if plugin is not disposed', () => {
    const plugin = makePlugin();
    api.plugins.register(plugin);

    expect(() => api.plugins.unregister(PLUGIN_ID)).toThrow('must be disposed before unregistering');
  });

  it('API-U171: re-registration succeeds after dispose + unregister', async () => {
    const plugin1 = makePlugin();
    api.plugins.register(plugin1);
    await api.plugins.activate(PLUGIN_ID);
    await api.plugins.dispose(PLUGIN_ID);
    api.plugins.unregister(PLUGIN_ID);

    // Re-register with the same ID
    const plugin2 = makePlugin();
    api.plugins.register(plugin2);
    expect(api.plugins.getState(PLUGIN_ID)).toBe('registered');
    expect(api.plugins.list()).toContain(PLUGIN_ID);

    // Can activate the re-registered plugin
    await api.plugins.activate(PLUGIN_ID);
    expect(api.plugins.getState(PLUGIN_ID)).toBe('active');
  });

  it('API-U172: plugins.dispose() is idempotent (double dispose does not throw)', async () => {
    const plugin = makePlugin();
    api.plugins.register(plugin);
    await api.plugins.dispose(PLUGIN_ID);
    await expect(api.plugins.dispose(PLUGIN_ID)).resolves.toBeUndefined();
    expect(api.plugins.getState(PLUGIN_ID)).toBe('disposed');
  });
});

// ============================================================
// Regression: isReady() must not return true before mount completes (#287)
// ============================================================

describe('OpenRVAPI readiness lifecycle (Issue #287)', () => {
  let config: OpenRVAPIConfig;

  beforeEach(() => {
    config = createAPIConfig();
  });

  it('API-U287a: isReady() returns false immediately after construction', () => {
    const api = new OpenRVAPI(config);
    expect(api.isReady()).toBe(false);
    api.dispose();
  });

  it('API-U287b: isReady() returns true after markReady()', () => {
    const api = new OpenRVAPI(config);
    expect(api.isReady()).toBe(false);
    api.markReady();
    expect(api.isReady()).toBe(true);
    api.dispose();
  });

  it('API-U287c: isReady() returns false after dispose even if markReady was called', () => {
    const api = new OpenRVAPI(config);
    api.markReady();
    expect(api.isReady()).toBe(true);
    api.dispose();
    expect(api.isReady()).toBe(false);
  });

  it('API-U287d: onReady() fires synchronously if already ready', () => {
    const api = new OpenRVAPI(config);
    api.markReady();
    const cb = vi.fn();
    api.onReady(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    api.dispose();
  });

  it('API-U287e: onReady() fires when markReady() is called later', () => {
    const api = new OpenRVAPI(config);
    const cb = vi.fn();
    api.onReady(cb);
    expect(cb).not.toHaveBeenCalled();
    api.markReady();
    expect(cb).toHaveBeenCalledTimes(1);
    api.dispose();
  });

  it('API-U287f: onReady() listeners are cleared after markReady()', () => {
    const api = new OpenRVAPI(config);
    const cb = vi.fn();
    api.onReady(cb);
    api.markReady();
    expect(cb).toHaveBeenCalledTimes(1);
    // Calling markReady again should not re-fire
    api.markReady();
    expect(cb).toHaveBeenCalledTimes(1);
    api.dispose();
  });

  it('API-U287g: onReady() listeners are discarded on dispose before markReady()', () => {
    const api = new OpenRVAPI(config);
    const cb = vi.fn();
    api.onReady(cb);
    api.dispose();
    // markReady after dispose should be a no-op
    api.markReady();
    expect(cb).not.toHaveBeenCalled();
  });

  it('API-U287h: markReady() is a no-op after dispose()', () => {
    const api = new OpenRVAPI(config);
    api.dispose();
    api.markReady();
    expect(api.isReady()).toBe(false);
  });

  it('API-U287i: sub-APIs are usable before markReady() (only isReady is gated)', () => {
    const api = new OpenRVAPI(config);
    // Sub-APIs should work before markReady — they are constructed and not disposed
    expect(() => api.playback.isPlaying()).not.toThrow();
    expect(() => api.media.hasMedia()).not.toThrow();
    expect(() => api.audio.getVolume()).not.toThrow();
    api.dispose();
  });
});

// ============================================================
// Plugin registry detach on API dispose (Issue #560)
// ============================================================

describe('OpenRVAPI.dispose() detaches plugin registry (Issue #560)', () => {
  const PLUGIN_ID = 'test-detach-560';

  function makePlugin(id: string = PLUGIN_ID): Plugin {
    return {
      manifest: {
        id,
        name: 'Detach Test Plugin',
        version: '1.0.0',
        contributes: ['decoder'],
      },
      activate: vi.fn(),
      deactivate: vi.fn(),
      dispose: vi.fn(),
    } as unknown as Plugin;
  }

  afterEach(async () => {
    // Clean up: ensure the plugin is fully removed from the singleton registry
    const state = pluginRegistry.getState(PLUGIN_ID);
    if (state && state !== 'disposed') {
      await pluginRegistry.dispose(PLUGIN_ID);
    }
    if (pluginRegistry.getState(PLUGIN_ID) === 'disposed') {
      pluginRegistry.unregister(PLUGIN_ID);
    }
  });

  it('API-U560a: after dispose(), plugin context.api throws (not a stale reference)', async () => {
    const config = createAPIConfig();
    const api = new OpenRVAPI(config);
    api.markReady();

    // Wire up the plugin registry to the API (mimics bootstrap)
    pluginRegistry.setAPI(api);
    pluginRegistry.setEventsAPI(api.events);

    // Register and activate a plugin, capturing the context
    let capturedContext: PluginContext | undefined;
    const plugin = makePlugin();
    (plugin as any).activate = vi.fn((ctx: PluginContext) => {
      capturedContext = ctx;
    });
    pluginRegistry.register(plugin);
    await pluginRegistry.activate(PLUGIN_ID);

    // Before dispose: context.api should work
    expect(() => capturedContext!.api).not.toThrow();

    // Dispose the API
    api.dispose();

    // After dispose: context.api should throw (apiRef is null)
    expect(() => capturedContext!.api).toThrow('OpenRV API not yet initialized');
  });

  it('API-U560b: after dispose(), plugin event bus subscriptions are cleaned up', () => {
    const config = createAPIConfig();
    const api = new OpenRVAPI(config);
    api.markReady();

    pluginRegistry.setAPI(api);
    pluginRegistry.setEventsAPI(api.events);

    const sub = pluginRegistry.eventBus.createSubscription('test-sub-560');
    const cb = vi.fn();
    sub.onApp('plugin:activated', cb);

    api.dispose();

    // After dispose, event bus should be cleared — lifecycle events should not fire
    pluginRegistry.eventBus.emitPluginLifecycle('plugin:activated', { id: 'x' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('API-U560c: after dispose(), re-initialization with a new API works', async () => {
    const config1 = createAPIConfig();
    const api1 = new OpenRVAPI(config1);
    api1.markReady();
    pluginRegistry.setAPI(api1);
    pluginRegistry.setEventsAPI(api1.events);

    api1.dispose();

    // Re-initialize with a new API instance
    const config2 = createAPIConfig();
    const api2 = new OpenRVAPI(config2);
    api2.markReady();
    pluginRegistry.setAPI(api2);
    pluginRegistry.setEventsAPI(api2.events);

    // Register and activate a plugin — should work with the new API
    let capturedContext: PluginContext | undefined;
    const plugin = makePlugin();
    (plugin as any).activate = vi.fn((ctx: PluginContext) => {
      capturedContext = ctx;
    });
    pluginRegistry.register(plugin);
    await pluginRegistry.activate(PLUGIN_ID);

    // context.api should return the new API, not the old disposed one
    expect(capturedContext!.api).toBe(api2);

    // Clean up
    api2.dispose();
  });

  it('API-U560d: dispose() is idempotent w.r.t. plugin registry detach', () => {
    const config = createAPIConfig();
    const api = new OpenRVAPI(config);
    pluginRegistry.setAPI(api);

    api.dispose();
    // Second dispose should not throw
    expect(() => api.dispose()).not.toThrow();
  });
});
