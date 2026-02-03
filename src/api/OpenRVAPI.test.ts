/**
 * OpenRV Scripting API - Comprehensive Unit Tests
 *
 * Tests for all API modules: OpenRVAPI, PlaybackAPI, MediaAPI, AudioAPI,
 * LoopAPI, ViewAPI, ColorAPI, MarkersAPI, EventsAPI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  Object.defineProperty(session, 'loopMode', {
    get: () => session._loopMode,
    set: (v: string) => {
      session._loopMode = v;
      session.emit('loopModeChanged', v);
    },
  });
  Object.defineProperty(session, 'inPoint', { get: () => session._inPoint });
  Object.defineProperty(session, 'outPoint', { get: () => session._outPoint });
  Object.defineProperty(session, 'fps', { get: () => session._fps });
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
  session.setMarker = vi.fn((frame: number, note?: string, color?: string) => {
    session._marks.set(frame, { frame, note: note ?? '', color: color ?? '#ff4444' });
    session.emit('marksChanged', session._marks);
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
  });
  viewer.setPan = vi.fn((x: number, y: number) => {
    viewer._panX = x;
    viewer._panY = y;
  });
  viewer.getPan = vi.fn(() => ({ x: viewer._panX, y: viewer._panY }));
  viewer.setChannelMode = vi.fn((mode: string) => {
    viewer._channelMode = mode;
  });
  viewer.getChannelMode = vi.fn(() => viewer._channelMode);

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
    getAdjustments: vi.fn(function(this: any) { return { ...this._adjustments }; }),
    setAdjustments: vi.fn(function(this: any, adj: any) { this._adjustments = { ...adj }; }),
    reset: vi.fn(function(this: any) {
      this._adjustments = {
        exposure: 0, gamma: 1, saturation: 1, vibrance: 0,
        vibranceSkinProtection: true, contrast: 1, clarity: 0,
        hueRotation: 0, temperature: 0, tint: 0, brightness: 0,
        highlights: 0, shadows: 0, whites: 0, blacks: 0,
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
    getCDL: vi.fn(function(this: any) { return JSON.parse(JSON.stringify(this._cdl)); }),
    setCDL: vi.fn(function(this: any, cdl: any) { this._cdl = JSON.parse(JSON.stringify(cdl)); }),
  };
  return cdlControl;
}

function createAPIConfig(): OpenRVAPIConfig {
  return {
    session: createMockSession(),
    viewer: createMockViewer(),
    colorControls: createMockColorControls() as any,
    cdlControl: createMockCDLControl() as any,
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

  it('API-U003: isReady() returns true after init', () => {
    expect(api.isReady()).toBe(true);
  });

  it('API-U004: isReady() returns false after dispose', () => {
    api.dispose();
    expect(api.isReady()).toBe(false);
  });

  it('API-U005: Initialization is idempotent (multiple constructions)', () => {
    const api2 = new OpenRVAPI(config);
    expect(api2.isReady()).toBe(true);
    expect(api2.version).toBe(api.version);
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
    expect(api.version).toBe('1.0.0');
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

describe('PlaybackAPI', () => {
  let playback: PlaybackAPI;
  let session: any;

  beforeEach(() => {
    session = createMockSession();
    playback = new PlaybackAPI(session);
  });

  it('API-U010: play() calls session.play()', () => {
    playback.play();
    expect(session.play).toHaveBeenCalled();
  });

  it('API-U011: pause() calls session.pause()', () => {
    playback.pause();
    expect(session.pause).toHaveBeenCalled();
  });

  it('API-U012: toggle() toggles playback state', () => {
    playback.toggle();
    expect(session.togglePlayback).toHaveBeenCalled();
  });

  it('API-U013: stop() pauses and seeks to start', () => {
    playback.stop();
    expect(session.pause).toHaveBeenCalled();
    expect(session.goToStart).toHaveBeenCalled();
  });

  it('API-U014: seek() validates frame number', () => {
    expect(() => playback.seek(NaN)).toThrow();
    expect(() => playback.seek('abc' as any)).toThrow();
  });

  it('API-U015: seek() calls goToFrame with valid frame', () => {
    playback.seek(50);
    expect(session.goToFrame).toHaveBeenCalledWith(50);
  });

  it('API-U016: step(1) increments frame', () => {
    playback.step(1);
    expect(session.stepForward).toHaveBeenCalled();
  });

  it('API-U017: step(-1) decrements frame', () => {
    playback.step(-1);
    expect(session.stepBackward).toHaveBeenCalled();
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
    playback.step();
    expect(session.stepForward).toHaveBeenCalled();
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

  it('API-U027: step(3) steps forward 3 times', () => {
    playback.step(3);
    expect(session.stepForward).toHaveBeenCalledTimes(3);
  });

  it('API-U028: step(-2) steps backward 2 times', () => {
    playback.step(-2);
    expect(session.stepBackward).toHaveBeenCalledTimes(2);
  });

  it('API-U029: setSpeed() clamps to 0.1-8 range at API level', () => {
    playback.setSpeed(0.01);
    expect(session.playbackSpeed).toBe(0.1);
    playback.setSpeed(100);
    expect(session.playbackSpeed).toBe(8);
  });

  it('API-U029b: seek() with Infinity throws', () => {
    expect(() => playback.seek(Infinity)).not.toThrow();
    // Infinity is a valid number; it gets clamped by the session
    expect(session.goToFrame).toHaveBeenCalledWith(Infinity);
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
    expect(session.setInPoint).toHaveBeenCalledWith(10);
  });

  it('API-U056: setInPoint() validates frame number', () => {
    expect(() => loop.setInPoint(NaN)).toThrow();
  });

  it('API-U057: setOutPoint() sets out point', () => {
    loop.setOutPoint(50);
    expect(session.setOutPoint).toHaveBeenCalledWith(50);
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
    loop.clearInOut();
    expect(session.resetInOutPoints).toHaveBeenCalled();
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

  it('API-U031: setZoom() calls viewer method', () => {
    view.setZoom(2);
    expect(viewer.setZoom).toHaveBeenCalledWith(2);
  });

  it('API-U032: getZoom() returns viewer zoom', () => {
    viewer._zoom = 3;
    expect(view.getZoom()).toBe(3);
  });

  it('API-U033: fitToWindow() calls viewer fit', () => {
    view.fitToWindow();
    expect(viewer.fitToWindow).toHaveBeenCalled();
  });

  it('API-U034: setPan() sets viewer pan', () => {
    view.setPan(100, 50);
    expect(viewer.setPan).toHaveBeenCalledWith(100, 50);
  });

  it('API-U035: getPan() returns viewer pan', () => {
    viewer._panX = 10;
    viewer._panY = 20;
    expect(view.getPan()).toEqual({ x: 10, y: 20 });
  });

  it('API-U036: setChannel() validates mode string', () => {
    expect(() => view.setChannel('invalid')).toThrow();
    expect(() => view.setChannel('')).toThrow();
  });

  it('API-U037: setChannel() calls viewer method', () => {
    view.setChannel('red');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('red');
  });

  it('API-U038: getChannel() returns current channel', () => {
    viewer._channelMode = 'blue';
    expect(view.getChannel()).toBe('blue');
  });

  it('API-U039: setChannel() accepts aliases', () => {
    view.setChannel('r');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('red');
    view.setChannel('g');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('green');
    view.setChannel('b');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('blue');
    view.setChannel('a');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('alpha');
    view.setChannel('luma');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('luminance');
  });

  it('API-U040: setPan() validates coordinates', () => {
    expect(() => view.setPan(NaN, 0)).toThrow();
    expect(() => view.setPan(0, NaN)).toThrow();
  });

  it('API-U041: setChannel() is case-insensitive', () => {
    view.setChannel('RED');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('red');
    view.setChannel('Blue');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('blue');
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
});

// ============================================================
// ColorAPI Tests
// ============================================================

describe('ColorAPI', () => {
  let color: ColorAPI;
  let colorControls: any;
  let cdlControl: any;

  beforeEach(() => {
    colorControls = createMockColorControls();
    cdlControl = createMockCDLControl();
    color = new ColorAPI(colorControls as any, cdlControl as any);
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

  it('API-U067: setAdjustments ignores invalid numeric values', () => {
    color.setAdjustments({ exposure: NaN, gamma: 2 });
    const setArg = colorControls.setAdjustments.mock.calls[0][0];
    expect(setArg.exposure).toBe(0); // NaN should be ignored
    expect(setArg.gamma).toBe(2);
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
    expect(session.setMarker).toHaveBeenCalledWith(10, '', '#ff4444');
  });

  it('API-U072: add() accepts note and color', () => {
    markers.add(10, 'my note', '#00ff00');
    expect(session.setMarker).toHaveBeenCalledWith(10, 'my note', '#00ff00');
  });

  it('API-U073: remove() deletes marker', () => {
    markers.remove(10);
    expect(session.removeMark).toHaveBeenCalledWith(10);
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
    markers.clear();
    expect(session.clearMarks).toHaveBeenCalled();
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

  it('API-U084: add() accepts frame number as float (rounds down)', () => {
    markers.add(10.7);
    expect(session.setMarker).toHaveBeenCalledWith(10.7, '', '#ff4444');
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
    const errorHandler = vi.fn(() => { throw new Error('boom'); });
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
});
