/**
 * Tests for MuUtilsBridge — openUrl popup-blocked detection (Issue #200)
 * and progressive loading event wiring (Issue #243).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MuUtilsBridge } from '../MuUtilsBridge';
import type { LoadingEventSource } from '../MuUtilsBridge';
import { FileKind } from '../types';

/**
 * Minimal mock event source that simulates sourceLoadingStarted / sourceLoaded.
 */
function createMockEventSource() {
  const listeners: Record<string, Array<(data: any) => void>> = {};

  const source: LoadingEventSource = {
    on(event: string, cb: (data: any) => void): () => void {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return () => {
        const arr = listeners[event];
        if (arr) {
          const idx = arr.indexOf(cb);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    },
  };

  return {
    source,
    emit(event: string, data: any = {}) {
      for (const cb of listeners[event] ?? []) {
        cb(data);
      }
    },
  };
}

describe('MuUtilsBridge', () => {
  let bridge: MuUtilsBridge;

  beforeEach(() => {
    bridge = new MuUtilsBridge();
  });

  describe('openUrl', () => {
    let openSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      openSpy = vi.spyOn(window, 'open');
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      openSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('returns true when popup is opened successfully', () => {
      // window.open returns a WindowProxy when successful
      openSpy.mockReturnValue({} as Window);

      const result = bridge.openUrl('https://example.com');

      expect(result).toBe(true);
      expect(openSpy).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'noopener,noreferrer',
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns false when popup is blocked (window.open returns null)', () => {
      openSpy.mockReturnValue(null);

      const result = bridge.openUrl('https://example.com');

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        '[MuUtilsBridge] Popup blocked for URL: %s',
        'https://example.com',
      );
    });

    it('passes correct arguments to window.open', () => {
      openSpy.mockReturnValue({} as Window);

      bridge.openUrl('https://test.example.org/path?q=1');

      expect(openSpy).toHaveBeenCalledWith(
        'https://test.example.org/path?q=1',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  // ── Progressive Loading — Event Wiring (Issue #243) ──

  describe('progressive loading — event wiring', () => {
    it('increments loadTotal on sourceLoadingStarted', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      expect(bridge.loadTotal()).toBe(0);

      emit('sourceLoadingStarted', { name: 'img1.exr' });
      expect(bridge.loadTotal()).toBe(1);

      emit('sourceLoadingStarted', { name: 'img2.exr' });
      expect(bridge.loadTotal()).toBe(2);
    });

    it('increments loadCount on sourceLoaded', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'video.mp4' });
      expect(bridge.loadCount()).toBe(0);

      emit('sourceLoaded', { name: 'video.mp4' });
      expect(bridge.loadCount()).toBe(1);
    });

    it('sets progressiveSourceLoading true when loading starts', () => {
      const { source, emit } = createMockEventSource();
      // Initially true per Mu convention
      expect(bridge.progressiveSourceLoading()).toBe(true);

      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'a.png' });
      expect(bridge.progressiveSourceLoading()).toBe(true);
    });

    it('sets progressiveSourceLoading false when all sources loaded', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'a.png' });
      emit('sourceLoadingStarted', { name: 'b.png' });
      expect(bridge.progressiveSourceLoading()).toBe(true);

      emit('sourceLoaded', { name: 'a.png' });
      expect(bridge.progressiveSourceLoading()).toBe(true);

      emit('sourceLoaded', { name: 'b.png' });
      expect(bridge.progressiveSourceLoading()).toBe(false);
    });

    it('waitForProgressiveLoading resolves when all sources finish', async () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'clip.mov' });

      let resolved = false;
      const promise = bridge.waitForProgressiveLoading().then(() => {
        resolved = true;
      });

      // Not resolved yet — one source still loading
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      emit('sourceLoaded', { name: 'clip.mov' });

      await promise;
      expect(resolved).toBe(true);
    });

    it('waitForProgressiveLoading resolves immediately when nothing is loading', async () => {
      const { source } = createMockEventSource();
      bridge.connectToEvents(source);

      // loadCount (0) >= loadTotal (0), so should resolve immediately
      await bridge.waitForProgressiveLoading();
    });

    it('handles multiple sequential loads correctly', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      // First load cycle
      emit('sourceLoadingStarted', { name: 'a.exr' });
      emit('sourceLoaded', { name: 'a.exr' });
      expect(bridge.loadTotal()).toBe(1);
      expect(bridge.loadCount()).toBe(1);
      expect(bridge.progressiveSourceLoading()).toBe(false);

      // Second load cycle
      emit('sourceLoadingStarted', { name: 'b.exr' });
      expect(bridge.progressiveSourceLoading()).toBe(true);
      expect(bridge.loadTotal()).toBe(2);
      expect(bridge.loadCount()).toBe(1);

      emit('sourceLoaded', { name: 'b.exr' });
      expect(bridge.loadTotal()).toBe(2);
      expect(bridge.loadCount()).toBe(2);
      expect(bridge.progressiveSourceLoading()).toBe(false);
    });

    it('dispose() disconnects from events', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'x.png' });
      expect(bridge.loadTotal()).toBe(1);

      bridge.dispose();

      // After dispose, events should not update counters
      emit('sourceLoadingStarted', { name: 'y.png' });
      expect(bridge.loadTotal()).toBe(1);

      emit('sourceLoaded', { name: 'x.png' });
      expect(bridge.loadCount()).toBe(0);

      emit('sourceLoadFailed', { name: 'x.png' });
      expect(bridge.loadCount()).toBe(0);
    });

    it('connectToEvents cleans up previous subscriptions', () => {
      const mock1 = createMockEventSource();
      const mock2 = createMockEventSource();

      bridge.connectToEvents(mock1.source);
      mock1.emit('sourceLoadingStarted', { name: 'a' });
      expect(bridge.loadTotal()).toBe(1);

      // Connect to a new event source
      bridge.connectToEvents(mock2.source);

      // Old source events should no longer affect bridge
      mock1.emit('sourceLoadingStarted', { name: 'b' });
      expect(bridge.loadTotal()).toBe(1);

      // New source events should work
      mock2.emit('sourceLoadingStarted', { name: 'c' });
      expect(bridge.loadTotal()).toBe(2);
    });

    it('dispose() cancels pending waitForProgressiveLoading polling', async () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'slow.mov' });

      let resolved = false;
      const promise = bridge.waitForProgressiveLoading().then(() => {
        resolved = true;
      });

      // Not resolved yet — source still loading
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      // Dispose should cause the polling to resolve promptly
      bridge.dispose();

      await promise;
      expect(resolved).toBe(true);
    });
  });

  // ── Backward Compatibility ──

  describe('fullscreen — webkit fallback', () => {
    it('isFullScreen() detects webkitFullscreenElement', () => {
      Object.defineProperty(document, 'webkitFullscreenElement', {
        value: document.documentElement,
        configurable: true,
      });
      expect(bridge.isFullScreen()).toBe(true);
      Object.defineProperty(document, 'webkitFullscreenElement', {
        value: undefined,
        configurable: true,
      });
    });

    it('fullScreenMode(true) falls back to webkitRequestFullscreen', () => {
      const origRFS = document.documentElement.requestFullscreen;
      const webkitMock = vi.fn();
      (document.documentElement as any).requestFullscreen = undefined;
      (document.documentElement as any).webkitRequestFullscreen = webkitMock;

      bridge.fullScreenMode(true);
      expect(webkitMock).toHaveBeenCalledOnce();

      document.documentElement.requestFullscreen = origRFS;
      delete (document.documentElement as any).webkitRequestFullscreen;
    });

    it('fullScreenMode(false) falls back to webkitExitFullscreen', () => {
      const origEFS = document.exitFullscreen;
      const webkitMock = vi.fn();
      (document as any).exitFullscreen = undefined;
      (document as any).webkitExitFullscreen = webkitMock;

      bridge.fullScreenMode(false);
      expect(webkitMock).toHaveBeenCalledOnce();

      document.exitFullscreen = origEFS;
      delete (document as any).webkitExitFullscreen;
    });

    it('fullScreenMode(true) prefers standard over webkit', () => {
      const standardMock = vi.fn().mockResolvedValue(undefined);
      const webkitMock = vi.fn();
      const origRFS = document.documentElement.requestFullscreen;
      document.documentElement.requestFullscreen = standardMock;
      (document.documentElement as any).webkitRequestFullscreen = webkitMock;

      bridge.fullScreenMode(true);
      expect(standardMock).toHaveBeenCalledOnce();
      expect(webkitMock).not.toHaveBeenCalled();

      document.documentElement.requestFullscreen = origRFS;
      delete (document.documentElement as any).webkitRequestFullscreen;
    });

    it('fullScreenMode(true) handles promise rejection', async () => {
      const origRFS = document.documentElement.requestFullscreen;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));

      bridge.fullScreenMode(true);
      await new Promise((r) => setTimeout(r, 0));

      document.documentElement.requestFullscreen = origRFS;
      warnSpy.mockRestore();
    });
  });

  describe('backward compat — setLoadCounters', () => {
    it('setLoadCounters still overrides counters directly', () => {
      bridge.setLoadCounters(10, 5);
      expect(bridge.loadTotal()).toBe(10);
      expect(bridge.loadCount()).toBe(5);
    });

    it('setLoadCounters works alongside event wiring', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'a.png' });
      expect(bridge.loadTotal()).toBe(1);

      // Manual override replaces event-driven counters
      bridge.setLoadCounters(5, 3);
      expect(bridge.loadTotal()).toBe(5);
      expect(bridge.loadCount()).toBe(3);

      // Events continue to accumulate from overridden values
      emit('sourceLoadingStarted', { name: 'b.png' });
      expect(bridge.loadTotal()).toBe(6);

      emit('sourceLoaded', { name: 'b.png' });
      expect(bridge.loadCount()).toBe(4);
    });
  });

  describe('backward compat — startPreloadingMedia', () => {
    it('still increments _loadTotal when called', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

      bridge.startPreloadingMedia('https://example.com/media.mp4');
      expect(bridge.loadTotal()).toBe(1);

      fetchSpy.mockRestore();
    });
  });

  // ── Bug Fix: sourceLoadFailed increments _loadCount ──

  describe('sourceLoadFailed — counter recovery', () => {
    it('increments _loadCount on sourceLoadFailed so counters stay balanced', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'broken.exr' });
      expect(bridge.loadTotal()).toBe(1);
      expect(bridge.loadCount()).toBe(0);
      expect(bridge.progressiveSourceLoading()).toBe(true);

      emit('sourceLoadFailed', { name: 'broken.exr' });
      expect(bridge.loadCount()).toBe(1);
      expect(bridge.progressiveSourceLoading()).toBe(false);
    });

    it('waitForProgressiveLoading resolves after sourceLoadFailed', async () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'fail.mp4' });

      let resolved = false;
      const promise = bridge.waitForProgressiveLoading().then(() => {
        resolved = true;
      });

      // Not resolved yet
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      // Fail the load
      emit('sourceLoadFailed', { name: 'fail.mp4' });

      await promise;
      expect(resolved).toBe(true);
    });

    it('handles mixed success and failure loads', () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'ok.png' });
      emit('sourceLoadingStarted', { name: 'bad.exr' });
      emit('sourceLoadingStarted', { name: 'ok2.jpg' });
      expect(bridge.loadTotal()).toBe(3);

      emit('sourceLoaded', { name: 'ok.png' });
      expect(bridge.progressiveSourceLoading()).toBe(true);

      emit('sourceLoadFailed', { name: 'bad.exr' });
      expect(bridge.progressiveSourceLoading()).toBe(true);

      emit('sourceLoaded', { name: 'ok2.jpg' });
      expect(bridge.loadCount()).toBe(3);
      expect(bridge.progressiveSourceLoading()).toBe(false);
    });
  });

  // ── Bug Fix: fileKind strips query strings and fragments (Issue #254) ──

  describe('fileKind — URL query strings and fragments', () => {
    it('detects image file with ?query=string', () => {
      expect(bridge.fileKind('https://example.com/shot.exr?token=abc')).toBe(FileKind.ImageFile);
    });

    it('detects image file with #fragment', () => {
      expect(bridge.fileKind('https://example.com/shot.exr#section')).toBe(FileKind.ImageFile);
    });

    it('detects image file with both ?query and #fragment', () => {
      expect(bridge.fileKind('https://example.com/shot.exr?q=1#frag')).toBe(FileKind.ImageFile);
    });

    it('detects image file with signed URL (multiple query params)', () => {
      expect(bridge.fileKind('https://cdn.example.com/shot.exr?token=abc&sig=xyz&exp=123')).toBe(
        FileKind.ImageFile,
      );
    });

    it('detects movie file with query string', () => {
      expect(bridge.fileKind('https://example.com/clip.mp4?v=2')).toBe(FileKind.MovieFile);
    });

    it('detects audio file with fragment', () => {
      expect(bridge.fileKind('https://example.com/track.wav#t=10')).toBe(FileKind.AudioFile);
    });

    it('still works for normal filenames without query strings', () => {
      expect(bridge.fileKind('/path/to/image.exr')).toBe(FileKind.ImageFile);
      expect(bridge.fileKind('video.mp4')).toBe(FileKind.MovieFile);
      expect(bridge.fileKind('audio.wav')).toBe(FileKind.AudioFile);
      expect(bridge.fileKind('grades.cdl')).toBe(FileKind.CDLFile);
      expect(bridge.fileKind('transform.cube')).toBe(FileKind.LUTFile);
      expect(bridge.fileKind('session.rv')).toBe(FileKind.RVFile);
    });

    it('returns UnknownFile for paths with no extension', () => {
      expect(bridge.fileKind('https://example.com/noext?token=abc')).toBe(FileKind.UnknownFile);
    });
  });

  // ── Bug Fix: waitForProgressiveLoading safety timeout ──

  describe('waitForProgressiveLoading — safety timeout', () => {
    it('resolves after timeout when loadCount never catches up', async () => {
      const { source, emit } = createMockEventSource();
      bridge.connectToEvents(source);

      emit('sourceLoadingStarted', { name: 'stuck.mov' });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Patch Date.now to simulate time passing
      const realDateNow = Date.now;
      let fakeNow = realDateNow.call(Date);
      vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);

      const promise = bridge.waitForProgressiveLoading();

      // Advance time past the 30s timeout
      fakeNow += 31_000;

      await promise;

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('waitForProgressiveLoading timed out'),
      );

      warnSpy.mockRestore();
      vi.spyOn(Date, 'now').mockImplementation(realDateNow);
    });
  });
});
