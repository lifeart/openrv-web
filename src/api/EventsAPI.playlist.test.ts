/**
 * EventsAPI playlist-aware frameChange tests (Issue #554)
 *
 * Verifies that the 'frameChange' event emits the global playlist frame
 * when a playlist is active, and the clip-local frame otherwise.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../utils/EventEmitter';
import { EventsAPI } from './EventsAPI';
import { PlaylistManager } from '../core/session/PlaylistManager';

function createMockSession() {
  const session = new EventEmitter() as any;
  session._currentFrame = 1;
  session._isPlaying = false;
  session._currentSource = {
    name: 'clip-A.mp4',
    type: 'video',
    width: 1920,
    height: 1080,
    duration: 50,
    fps: 24,
  };

  Object.defineProperty(session, 'currentFrame', {
    get: () => session._currentFrame,
    set: (v: number) => { session._currentFrame = v; },
  });
  Object.defineProperty(session, 'currentSource', {
    get: () => session._currentSource,
  });
  Object.defineProperty(session, 'abCompareAvailable', { get: () => false });

  return session;
}

function createMockViewer() {
  return {
    getViewportSize: () => ({ width: 1920, height: 1080 }),
    getSourceDimensions: () => ({ width: 1920, height: 1080, pixelAspect: 1 }),
  } as any;
}

describe('EventsAPI — playlist-aware frameChange (Issue #554)', () => {
  let session: ReturnType<typeof createMockSession>;
  let viewer: ReturnType<typeof createMockViewer>;
  let events: EventsAPI;
  let pm: PlaylistManager;

  beforeEach(() => {
    session = createMockSession();
    viewer = createMockViewer();
    events = new EventsAPI(session, viewer);
    pm = new PlaylistManager();
    pm.addClip(0, 'clip-A.mp4', 1, 50);
    pm.addClip(1, 'clip-B.mp4', 1, 30);
    events.setPlaylistManager(pm);
  });

  it('emits clip-local frame when playlist is NOT active', () => {
    const handler = vi.fn();
    events.on('frameChange', handler);

    session.emit('frameChanged', 25);

    expect(handler).toHaveBeenCalledWith({ frame: 25 });
  });

  it('emits global playlist frame when playlist IS active', () => {
    pm.setEnabled(true);
    pm.setCurrentFrame(60); // global frame 60 (in clip-B)

    const handler = vi.fn();
    events.on('frameChange', handler);

    // The session fires with clip-local frame 10, but the event
    // should report the global playlist frame instead
    session.emit('frameChanged', 10);

    expect(handler).toHaveBeenCalledWith({ frame: 60 });
  });

  it('reverts to clip-local frame when playlist is disabled after being enabled', () => {
    pm.setEnabled(true);
    pm.setCurrentFrame(60);

    const handler = vi.fn();
    events.on('frameChange', handler);

    // First frame change while playlist is active
    session.emit('frameChanged', 10);
    expect(handler).toHaveBeenCalledWith({ frame: 60 });

    handler.mockClear();

    // Disable playlist
    pm.setEnabled(false);

    // Next frame change should be clip-local
    session.emit('frameChanged', 42);
    expect(handler).toHaveBeenCalledWith({ frame: 42 });
  });

  it('emits global frame for multiple listeners', () => {
    pm.setEnabled(true);
    pm.setCurrentFrame(75);

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    events.on('frameChange', handler1);
    events.on('frameChange', handler2);

    session.emit('frameChanged', 5);

    expect(handler1).toHaveBeenCalledWith({ frame: 75 });
    expect(handler2).toHaveBeenCalledWith({ frame: 75 });
  });

  it('emits clip-local frame when no playlist manager is set', () => {
    // Create a fresh EventsAPI without playlist manager
    const freshEvents = new EventsAPI(session, viewer);
    const handler = vi.fn();
    freshEvents.on('frameChange', handler);

    session.emit('frameChanged', 33);

    expect(handler).toHaveBeenCalledWith({ frame: 33 });
    freshEvents.dispose();
  });
});
