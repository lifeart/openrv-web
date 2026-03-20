/**
 * PlaybackAPI playlist-aware frame/duration tests (Issue #554)
 *
 * Verifies that getCurrentFrame() and getTotalFrames() return playlist-global
 * values when a playlist is active, and clip-local values otherwise.
 * Also verifies the explicit getClipFrame(), getClipDuration(), and
 * isPlaylistActive() accessors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../utils/EventEmitter';
import { PlaybackAPI } from './PlaybackAPI';
import { PlaylistManager } from '../core/session/PlaylistManager';

function createMockSession() {
  const session = new EventEmitter() as any;
  session._currentFrame = 10;
  session._isPlaying = false;

  Object.defineProperty(session, 'currentFrame', {
    get: () => session._currentFrame,
    set: (v: number) => {
      session._currentFrame = Math.max(1, Math.min(session.currentSource?.duration ?? 100, Math.round(v)));
    },
  });
  Object.defineProperty(session, 'isPlaying', { get: () => session._isPlaying });

  session.currentSource = { name: 'clip-A.mp4', duration: 50, fps: 24, type: 'video', width: 1920, height: 1080 };
  session.loopMode = 'once';
  session._inPoint = 1;
  session._outPoint = 50;

  Object.defineProperty(session, 'inPoint', { get: () => session._inPoint });
  Object.defineProperty(session, 'outPoint', { get: () => session._outPoint });

  session.play = vi.fn();
  session.pause = vi.fn();
  session.togglePlayback = vi.fn();
  session.stop = vi.fn();
  session.goToFrame = vi.fn((frame: number) => {
    session.currentFrame = frame;
  });
  session.stepForward = vi.fn(() => {
    session.currentFrame = session._currentFrame + 1;
  });
  session.stepBackward = vi.fn(() => {
    session.currentFrame = Math.max(1, session._currentFrame - 1);
  });
  session.playbackSpeed = 1;
  session.playDirection = 1;
  session.playbackMode = 'realtime';
  session.effectiveFps = 0;
  session.isBuffering = false;
  session.droppedFrameCount = 0;

  return session;
}

describe('PlaybackAPI — playlist-aware frame/duration (Issue #554)', () => {
  let session: ReturnType<typeof createMockSession>;
  let api: PlaybackAPI;
  let pm: PlaylistManager;

  beforeEach(() => {
    session = createMockSession();
    api = new PlaybackAPI(session);
    pm = new PlaylistManager();

    // Build a playlist with two clips: clip-A (50 frames) + clip-B (30 frames)
    pm.addClip(0, 'clip-A.mp4', 1, 50);
    pm.addClip(1, 'clip-B.mp4', 1, 30);
    // Total duration = 80 frames

    api.setPlaylistManager(pm);
  });

  // ----------------------------------------------------------------
  // Without playlist enabled — classic clip-local behavior
  // ----------------------------------------------------------------

  describe('when playlist is NOT active', () => {
    it('getCurrentFrame() returns the session (clip-local) frame', () => {
      expect(pm.isEnabled()).toBe(false);
      session._currentFrame = 25;
      expect(api.getCurrentFrame()).toBe(25);
    });

    it('getTotalFrames() returns the current source duration', () => {
      expect(api.getTotalFrames()).toBe(50);
    });

    it('isPlaylistActive() returns false', () => {
      expect(api.isPlaylistActive()).toBe(false);
    });

    it('getTotalFrames() returns 0 when no source is loaded', () => {
      session.currentSource = null;
      expect(api.getTotalFrames()).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // With playlist enabled — global timeline behavior
  // ----------------------------------------------------------------

  describe('when playlist IS active', () => {
    beforeEach(() => {
      pm.setEnabled(true);
    });

    it('getCurrentFrame() returns the global playlist frame', () => {
      pm.setCurrentFrame(60); // somewhere in clip-B
      session._currentFrame = 10; // clip-local frame
      expect(api.getCurrentFrame()).toBe(60);
    });

    it('getTotalFrames() returns the global playlist duration', () => {
      expect(api.getTotalFrames()).toBe(80);
    });

    it('isPlaylistActive() returns true', () => {
      expect(api.isPlaylistActive()).toBe(true);
    });

    it('getCurrentFrame() returns playlist frame even when session has different value', () => {
      pm.setCurrentFrame(1);
      session._currentFrame = 50;
      expect(api.getCurrentFrame()).toBe(1);
    });
  });

  // ----------------------------------------------------------------
  // Explicit clip-local accessors — always clip-local
  // ----------------------------------------------------------------

  describe('getClipFrame() and getClipDuration()', () => {
    it('getClipFrame() always returns the session frame regardless of playlist mode', () => {
      session._currentFrame = 33;
      pm.setEnabled(true);
      pm.setCurrentFrame(70);

      // getClipFrame should return clip-local
      expect(api.getClipFrame()).toBe(33);
      // getCurrentFrame should return global
      expect(api.getCurrentFrame()).toBe(70);
    });

    it('getClipDuration() always returns the source duration regardless of playlist mode', () => {
      pm.setEnabled(true);
      expect(api.getClipDuration()).toBe(50);
      expect(api.getTotalFrames()).toBe(80);
    });

    it('getClipFrame() works when playlist is disabled', () => {
      session._currentFrame = 15;
      expect(api.getClipFrame()).toBe(15);
    });

    it('getClipDuration() returns 0 when no source is loaded', () => {
      session.currentSource = null;
      expect(api.getClipDuration()).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // Toggling playlist mode mid-session
  // ----------------------------------------------------------------

  describe('toggling playlist mode', () => {
    it('switches from clip-local to global when playlist is enabled', () => {
      session._currentFrame = 10;
      pm.setCurrentFrame(55);

      expect(api.getCurrentFrame()).toBe(10); // playlist not enabled
      expect(api.getTotalFrames()).toBe(50);

      pm.setEnabled(true);

      expect(api.getCurrentFrame()).toBe(55); // now global
      expect(api.getTotalFrames()).toBe(80);
    });

    it('switches from global to clip-local when playlist is disabled', () => {
      pm.setEnabled(true);
      pm.setCurrentFrame(55);
      session._currentFrame = 10;

      expect(api.getCurrentFrame()).toBe(55);

      pm.setEnabled(false);

      expect(api.getCurrentFrame()).toBe(10);
      expect(api.getTotalFrames()).toBe(50);
    });
  });

  // ----------------------------------------------------------------
  // No playlist manager set at all
  // ----------------------------------------------------------------

  describe('without a playlist manager', () => {
    let plainApi: PlaybackAPI;

    beforeEach(() => {
      plainApi = new PlaybackAPI(session);
    });

    it('getCurrentFrame() returns session frame', () => {
      session._currentFrame = 42;
      expect(plainApi.getCurrentFrame()).toBe(42);
    });

    it('getTotalFrames() returns source duration', () => {
      expect(plainApi.getTotalFrames()).toBe(50);
    });

    it('isPlaylistActive() returns false', () => {
      expect(plainApi.isPlaylistActive()).toBe(false);
    });
  });
});
