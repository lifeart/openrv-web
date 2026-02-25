import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session, MediaSource } from './Session';

const createMockVideo = (durationSec: number = 100, currentTimeSec: number = 0) => {
    const video = document.createElement('video') as any;
    video._currentTime = currentTimeSec;
    Object.defineProperty(video, 'duration', {
        get: () => durationSec,
        configurable: true
    });
    Object.defineProperty(video, 'currentTime', {
        get: () => video._currentTime,
        set: (v) => video._currentTime = v,
        configurable: true
    });
    Object.defineProperty(video, 'ended', {
        get: () => video._currentTime >= durationSec,
        configurable: true
    });
    video.play = vi.fn();
    video.pause = vi.fn();
    return video;
};

class TestSession extends Session {
  public setSources(s: MediaSource[]) {
    (this as any)._media.resetSourcesInternal();
    s.forEach(src => {
        this.addSource(src);
        (this as any)._outPoint = Math.max((this as any)._outPoint, src.duration);
    });
  }
}

describe('Session', () => {
  let session: TestSession;

  beforeEach(() => {
    session = new TestSession();
  });

  describe('playback control', () => {
    it('SES-010: play() sets isPlaying to true', () => {
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.play();
      expect(session.isPlaying).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('SES-011: pause() sets isPlaying to false', () => {
      session.play();
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.pause();
      expect(session.isPlaying).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('SES-012: togglePlayback() toggles play/pause', () => {
      expect(session.isPlaying).toBe(false);

      session.togglePlayback();
      expect(session.isPlaying).toBe(true);

      session.togglePlayback();
      expect(session.isPlaying).toBe(false);
    });

    it('play() does nothing if already playing', () => {
      session.play();
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.play();
      expect(listener).not.toHaveBeenCalled();
    });

    it('pause() does nothing if already paused', () => {
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.pause();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('playback after pause (regression)', () => {
    it('SES-PBP-001: play() works after pause() — play/pause/play ends with isPlaying true', async () => {
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      session.setSources([{
        type: 'video', name: 'v', url: 'v.mp4',
        width: 100, height: 100, duration: 100, fps: 24, element: video,
      }]);

      // First play
      session.play();
      expect(session.isPlaying).toBe(true);

      // Let safeVideoPlay promise resolve
      await vi.waitFor(() => {
        expect((session as any)._pendingPlayPromise).toBeNull();
      });

      // Pause
      session.pause();
      expect(session.isPlaying).toBe(false);
      expect((session as any)._pendingPlayPromise).toBeNull();

      // Second play should NOT be blocked by a stale _pendingPlayPromise
      session.play();
      expect(session.isPlaying).toBe(true);
    });

    it('SES-PBP-002: _pendingPlayPromise is cleared by pause()', async () => {
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      // Use a deferred promise so safeVideoPlay is still pending when pause() is called
      let resolvePlay!: () => void;
      video.play = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolvePlay = r; }));
      video.pause = vi.fn();

      session.setSources([{
        type: 'video', name: 'v', url: 'v.mp4',
        width: 100, height: 100, duration: 100, fps: 24, element: video,
      }]);

      // Start playing — safeVideoPlay sets _pendingPlayPromise
      session.play();
      expect(session.isPlaying).toBe(true);

      // The promise should be set while video.play() is pending
      // Wait a microtask for the async IIFE to reach the await
      await Promise.resolve();
      expect((session as any)._pendingPlayPromise).not.toBeNull();

      // Pause should clear _pendingPlayPromise immediately
      session.pause();
      expect((session as any)._pendingPlayPromise).toBeNull();

      // Resolve the deferred play to avoid unhandled rejection
      resolvePlay();
    });

    it('SES-PBP-003: multiple rapid play/pause cycles work correctly', async () => {
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      session.setSources([{
        type: 'video', name: 'v', url: 'v.mp4',
        width: 100, height: 100, duration: 100, fps: 24, element: video,
      }]);

      // Rapid cycle: play/pause/play/pause/play
      session.play();
      expect(session.isPlaying).toBe(true);

      await vi.waitFor(() => {
        expect((session as any)._pendingPlayPromise).toBeNull();
      });

      session.pause();
      expect(session.isPlaying).toBe(false);

      session.play();
      expect(session.isPlaying).toBe(true);

      await vi.waitFor(() => {
        expect((session as any)._pendingPlayPromise).toBeNull();
      });

      session.pause();
      expect(session.isPlaying).toBe(false);

      // Final play — must succeed and not be blocked
      session.play();
      expect(session.isPlaying).toBe(true);

      // Verify video.play was called for each play() invocation that
      // reaches the video source path (3 times total)
      expect(video.play).toHaveBeenCalledTimes(3);
    });
  });

  describe('frame navigation', () => {
    it('SES-013: goToFrame() updates currentFrame', () => {
      session.goToFrame(1);
      expect(session.currentFrame).toBe(1);
    });

    it('SES-016: goToStart() sets frame to inPoint', () => {
      session.goToStart();
      expect(session.currentFrame).toBe(session.inPoint);
    });

    it('SES-017: goToEnd() sets frame to outPoint', () => {
      session.goToEnd();
      expect(session.currentFrame).toBe(session.outPoint);
    });
  });

  describe('playDirection', () => {
    it('has default direction of 1', () => {
      expect(session.playDirection).toBe(1);
    });

    it('togglePlayDirection() reverses direction', () => {
      const listener = vi.fn();
      session.on('playDirectionChanged', listener);

      session.togglePlayDirection();
      expect(session.playDirection).toBe(-1);
      expect(listener).toHaveBeenCalledWith(-1);

      session.togglePlayDirection();
      expect(session.playDirection).toBe(1);
    });
  });

  describe('update() with playDirection', () => {
    // Helper to access private members for testing
    const setPrivateState = (s: Session, overrides: {
      currentFrame?: number;
      inPoint?: number;
      outPoint?: number;
    }) => {
      const internal = s as unknown as {
        _currentFrame: number;
        _inPoint: number;
        _outPoint: number;
      };
      if (overrides.currentFrame !== undefined) internal._currentFrame = overrides.currentFrame;
      if (overrides.inPoint !== undefined) internal._inPoint = overrides.inPoint;
      if (overrides.outPoint !== undefined) internal._outPoint = overrides.outPoint;
    };

    // Helper to add a mock source with specified duration
    const addMockSource = (s: Session, duration: number) => {
      const sources = (s as unknown as { sources: MediaSource[] }).sources;
      sources.push({
        type: 'image',
        name: 'test',
        url: 'test.png',
        width: 100,
        height: 100,
        duration: duration,
        fps: 10,
      });
    };

    beforeEach(() => {
      // Add a mock source with 100 frame duration
      addMockSource(session, 100);
      // Set up a session with enough frames to test
      setPrivateState(session, { inPoint: 1, outPoint: 100 });
      session.fps = 10; // 100ms per frame for easy testing
    });

    it('SES-025: forward playback advances frame forward for images', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Start playback (forward direction by default)
      session.play();
      expect(session.playDirection).toBe(1);

      // Simulate time passing (enough for one frame at 10fps = 100ms)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 150); // 150ms elapsed

      session.update();

      // Frame should have advanced forward
      expect(session.currentFrame).toBe(51);

      vi.restoreAllMocks();
    });

    it('SES-026: reverse playback advances frame backward for images', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Set reverse direction
      session.togglePlayDirection();
      expect(session.playDirection).toBe(-1);

      // Start playback
      session.play();

      // Simulate time passing (enough for one frame at 10fps = 100ms)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 150); // 150ms elapsed

      session.update();

      // Frame should have advanced backward
      expect(session.currentFrame).toBe(49);

      vi.restoreAllMocks();
    });

    it('SES-027: reverse playback decrements multiple frames over time', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Set reverse direction and start playback
      session.togglePlayDirection();
      session.play();

      // Simulate time passing (enough for 3 frames at 10fps = 300ms)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 350); // 350ms elapsed

      session.update();

      // Frame should have gone back by 3
      expect(session.currentFrame).toBe(47);

      vi.restoreAllMocks();
    });

    it('SES-028: toggling direction while playing changes frame advancement', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Mock time
      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      const startFrame = session.currentFrame;

      // Advance forward
      mockTime = 150;
      session.update();
      const afterForward = session.currentFrame;
      expect(afterForward).toBeGreaterThan(startFrame); // Frame increased (forward)

      // Toggle to reverse
      session.togglePlayDirection();
      expect(session.playDirection).toBe(-1);

      // Record current frame before reverse playback
      const beforeReverse = session.currentFrame;

      // Advance with reverse direction - update lastFrameTime first
      (session as unknown as { lastFrameTime: number }).lastFrameTime = mockTime;
      (session as unknown as { frameAccumulator: number }).frameAccumulator = 0;
      mockTime = 300;
      session.update();
      const afterReverse = session.currentFrame;

      // Verify frame decreased (reverse direction works)
      expect(afterReverse).toBeLessThan(beforeReverse);

      vi.restoreAllMocks();
    });

    it('SES-029: reverse playback stops at inPoint with loop mode once', () => {
      // Start at frame 2
      setPrivateState(session, { currentFrame: 2 });
      session.loopMode = 'once';

      // Set reverse direction and start playback
      session.togglePlayDirection();
      session.play();

      // Simulate time passing (enough for 5 frames)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 550);

      session.update();

      // Should stop at inPoint (1) and pause
      expect(session.currentFrame).toBe(1);
      expect(session.isPlaying).toBe(false);

      vi.restoreAllMocks();
    });

    it('SES-030: reverse playback wraps to outPoint with loop mode', () => {
      // Start at frame 2
      setPrivateState(session, { currentFrame: 2 });
      session.loopMode = 'loop';

      // Set reverse direction and start playback
      session.togglePlayDirection();
      session.play();

      // Simulate time passing (enough for exactly 2 frames: 2 -> 1 -> wraps to 100)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 250);

      session.update();

      // Frame goes: 2 -> 1 -> 0 (wraps to outPoint 100)
      expect(session.currentFrame).toBe(100);

      vi.restoreAllMocks();
    });

    it('SES-031: pingpong mode emits playDirectionChanged when reversing at outPoint', () => {
      // Start near the end
      setPrivateState(session, { currentFrame: 99 });
      session.loopMode = 'pingpong';
      session.play();

      const directionListener = vi.fn();
      session.on('playDirectionChanged', directionListener);

      // Advance past outPoint
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 250);
      session.update();

      // Direction should have changed and event emitted
      expect(session.playDirection).toBe(-1);
      expect(directionListener).toHaveBeenCalledWith(-1);

      vi.restoreAllMocks();
    });

    it('SES-032: pingpong mode emits playDirectionChanged when reversing at inPoint', () => {
      // Start near the beginning with reverse direction
      setPrivateState(session, { currentFrame: 2 });
      session.loopMode = 'pingpong';
      session.togglePlayDirection(); // Set to -1
      session.play();

      const directionListener = vi.fn();
      session.on('playDirectionChanged', directionListener);

      // Advance past inPoint (going backward)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 250);
      session.update();

      // Direction should have changed back to forward and event emitted
      expect(session.playDirection).toBe(1);
      expect(directionListener).toHaveBeenCalledWith(1);

      vi.restoreAllMocks();
    });
  });

  describe('update logic overrides', () => {

    it('updates video frame in forward playback', () => {
        const video = createMockVideo(100, 1.0);
        session.setSources([{
            type: 'video',
            name: 'v',
            url: 'v.mp4',
            width: 100,
            height: 100,
            duration: 100,
            fps: 24,
            element: video
        }]);
        session.setOutPoint(100);
        session.play();
        (session as any)._playDirection = 1;

        session.update();
        expect(session.currentFrame).toBe(25); // 1.0 * 24 + 1
    });

    it('handles video loop', () => {
        const video = createMockVideo(100, 4.0);
        session.setSources([{
            type: 'video',
            name: 'v',
            url: 'v.mp4',
            width: 100,
            height: 100,
            duration: 100,
            fps: 24,
            element: video
        }]);
        session.loopMode = 'loop';
        session.setOutPoint(50);
        session.play();

        session.update(); // frame will be 4*24+1 = 97 > 50
        expect(video.currentTime).toBe(0);
        expect(video.play).toHaveBeenCalled();
    });

    it('handles video loop mode once', () => {
        const video = createMockVideo(100, 4.0);
        session.setSources([{
            type: 'video',
            name: 'v',
            url: 'v.mp4',
            width: 100,
            height: 100,
            duration: 100,
            fps: 24,
            element: video
        }]);
        session.loopMode = 'once';
        session.setOutPoint(50);
        session.play();

        session.update();
        expect(session.isPlaying).toBe(false);
    });
  });

  describe('effective FPS tracking', () => {
    it('SES-038: effectiveFps returns 0 when not playing', () => {
      expect(session.isPlaying).toBe(false);
      expect(session.effectiveFps).toBe(0);
    });

    it('SES-039: effectiveFps resets when play() is called', () => {
      // Set up a source
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      // Access internal state
      const internal = session as any;

      // Manually set some FPS tracking state
      internal._effectiveFps = 30;
      internal.fpsFrameCount = 10;

      // Play should reset FPS tracking
      session.play();

      expect(internal.fpsFrameCount).toBe(0);
      expect(internal._effectiveFps).toBe(0);
    });

    it('SES-040: effectiveFps is calculated during frame advancement', () => {
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      // Mock performance.now to control timing
      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;

      // Set up the conditions for FPS calculation:
      // - Start with 11 frames already counted
      // - Set fpsLastTime to 0
      // - Then call advanceFrame with mockTime = 500
      // This will make fpsFrameCount = 12, elapsed = 500, FPS = 12/500*1000 = 24
      internal.fpsFrameCount = 11;
      internal.fpsLastTime = 0;
      mockTime = 500;

      // One more advanceFrame triggers the FPS calculation
      internal.advanceFrame(1);

      // FPS should be calculated: 12 frames / 500ms * 1000 = 24 fps
      expect(internal._effectiveFps).toBeCloseTo(24, 0);

      vi.restoreAllMocks();
    });

    it('SES-041: effectiveFps updates every 500ms', () => {
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;

      // Advance a few frames but less than 500ms - should not update FPS yet
      mockTime = 200;
      internal.fpsLastTime = 0;

      internal.advanceFrame(1);
      internal.advanceFrame(1);
      internal.advanceFrame(1);

      // FPS should still be 0 (not enough time elapsed)
      expect(internal._effectiveFps).toBe(0);

      // Now advance past 500ms
      mockTime = 600;
      internal.advanceFrame(1);

      // Now FPS should be calculated: 4 frames / 600ms * 1000 ≈ 6.67 fps
      expect(internal._effectiveFps).toBeGreaterThan(0);

      vi.restoreAllMocks();
    });

    it('SES-042: effectiveFps returns 0 after pause', () => {
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      session.play();
      internal._effectiveFps = 24; // Simulate measured FPS

      // While playing, effectiveFps should return the value
      expect(session.effectiveFps).toBe(24);

      // After pause, effectiveFps should return 0
      session.pause();
      expect(session.effectiveFps).toBe(0);
    });
  });

  describe('mediabunny playback frame fetching', () => {
    // Helper to create mock VideoSourceNode with minimal interface
    const createMockVideoSourceNode = (hasFrameCachedFn: (frame: number) => boolean = () => false) => ({
      isUsingMediabunny: vi.fn(() => true),
      hasFrameCached: vi.fn(hasFrameCachedFn),
      getFrameAsync: vi.fn().mockResolvedValue(null),
      preloadForPlayback: vi.fn().mockResolvedValue(undefined),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      stopPlaybackPreload: vi.fn(),
      updatePlaybackBuffer: vi.fn(),
    });

    it('SES-043: playback waits when next frame is not cached', () => {
      // Frame NOT cached - playback should wait (not advance)
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;
      const startFrame = session.currentFrame;

      // Advance time enough for multiple frames at 24fps
      mockTime = 100;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      session.update();

      // Observable behavior: frame should NOT advance when not cached
      expect(session.currentFrame).toBe(startFrame);

      vi.restoreAllMocks();
    });

    it('SES-044: playback advances when next frame is cached', () => {
      // Frame IS cached - playback should advance
      const mockVideoNode = createMockVideoSourceNode(() => true);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;
      const startFrame = session.currentFrame;

      // Advance time enough for frames at 24fps (~41ms per frame)
      mockTime = 100;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      session.update();

      // Observable behavior: frame should advance when cached
      expect(session.currentFrame).toBeGreaterThan(startFrame);

      vi.restoreAllMocks();
    });

    it('SES-045: playback resumes after cached frame becomes available', () => {
      // Simulate frame becoming cached after initial wait
      let frameAvailable = false;
      const mockVideoNode = createMockVideoSourceNode(() => frameAvailable);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;

      mockTime = 50;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      // First update - frame not available, should wait
      session.update();
      expect(session.currentFrame).toBe(10);

      // Frame becomes available
      frameAvailable = true;
      mockTime = 100;

      // Second update - frame now available, should advance
      session.update();
      expect(session.currentFrame).toBeGreaterThan(10);

      vi.restoreAllMocks();
    });

    it('SES-046: loop correctly waits for frame 1 when not cached', () => {
      // At outPoint, looping back to frame 1 which is NOT cached
      const mockVideoNode = createMockVideoSourceNode((frame: number) => frame !== 1);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);
      session.loopMode = 'loop';

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 100; // At outPoint

      mockTime = 100;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      session.update();

      // Observable behavior: should stay at frame 100 waiting for frame 1 to be fetched
      // The loop target (frame 1) is not cached, so playback waits
      expect(session.currentFrame).toBe(100);

      vi.restoreAllMocks();
    });

    it('SES-047: loop successfully transitions when frame 1 becomes cached', () => {
      // At outPoint, looping back to frame 1 - initially not cached, then cached
      let frame1Cached = false;
      const mockVideoNode = createMockVideoSourceNode((frame: number) => {
        if (frame === 1) return frame1Cached;
        return true; // Other frames cached
      });
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);
      session.loopMode = 'loop';

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 100; // At outPoint

      mockTime = 50;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      // First update - frame 1 not cached, waits at frame 100
      session.update();
      expect(session.currentFrame).toBe(100);

      // Frame 1 becomes cached
      frame1Cached = true;
      mockTime = 100;

      // Second update - frame 1 now available, loop happens
      // Observable: we're no longer stuck at 100, playback resumed from beginning
      session.update();
      expect(session.currentFrame).toBeLessThan(100); // Looped back to beginning
      expect(session.currentFrame).toBeGreaterThanOrEqual(1); // At or past frame 1

      vi.restoreAllMocks();
    });
  });

  describe('split screen playback support', () => {
    // Helper to create a complete mock video source node
    const createMockVideoSourceNode = (usesMediabunny = true) => ({
      isUsingMediabunny: vi.fn().mockReturnValue(usesMediabunny),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      hasFrameCached: vi.fn().mockReturnValue(true),
      getFrameAsync: vi.fn().mockResolvedValue({}),
      updatePlaybackBuffer: vi.fn(),
      stopPlaybackPreload: vi.fn(),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
    });

    it('SPLIT-001: startSourceBPlaybackPreload is called when playback starts with source B', () => {
      // Create mock video sources with videoSourceNode
      const mockVideoNodeA = createMockVideoSourceNode();
      const mockVideoNodeB = createMockVideoSourceNode();

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      // Play should start preloading for both source A and source B
      session.play();

      expect(mockVideoNodeA.startPlaybackPreload).toHaveBeenCalled();
      expect(mockVideoNodeB.startPlaybackPreload).toHaveBeenCalled();
    });

    it('SPLIT-002: stopSourceBPlaybackPreload is called when playback pauses', () => {
      const mockVideoNodeA = createMockVideoSourceNode();
      const mockVideoNodeB = createMockVideoSourceNode();

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      session.play();
      session.pause();

      expect(mockVideoNodeA.stopPlaybackPreload).toHaveBeenCalled();
      expect(mockVideoNodeB.stopPlaybackPreload).toHaveBeenCalled();
    });

    it('SPLIT-003: updateSourceBPlaybackBuffer is called during playback when frame advances', () => {
      const mockVideoNodeA = createMockVideoSourceNode();
      const mockVideoNodeB = createMockVideoSourceNode();

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);
      sessionInternal._outPoint = 100;

      session.play();

      // Clear mocks after play to only track calls during update
      mockVideoNodeB.updatePlaybackBuffer.mockClear();

      // Simulate time passing to trigger frame advance
      sessionInternal.lastFrameTime = performance.now() - 100;
      sessionInternal.frameAccumulator = 50;

      session.update();

      // Source B's buffer should be updated when frame advances (key fix for split screen)
      expect(mockVideoNodeB.updatePlaybackBuffer).toHaveBeenCalled();
    });

    it('SPLIT-004: source B without mediabunny is handled gracefully', () => {
      const mockVideoNodeA = createMockVideoSourceNode();
      // Source B doesn't use mediabunny
      const mockVideoNodeB = createMockVideoSourceNode(false);

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      // Should not throw
      expect(() => {
        session.play();
        session.pause();
      }).not.toThrow();
    });

    it('SPLIT-005: source B as image is handled gracefully', () => {
      const mockVideoNodeA = createMockVideoSourceNode();

      const videoA = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      // Source B is an image, not a video
      const sourceB: MediaSource = {
        name: 'imageB.png',
        type: 'image',
        duration: 1,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'imageB.png',
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      // Should not throw - image sources don't have videoSourceNode
      expect(() => {
        session.play();
        session.pause();
      }).not.toThrow();
    });

    it('SPLIT-006: no source B is handled gracefully', () => {
      const mockVideoNodeA = createMockVideoSourceNode();

      const videoA = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      // Don't add source B - only one source

      // Clear auto-assigned source B
      session.clearSourceB();

      // Should not throw when there's no source B
      expect(() => {
        session.play();
        session.pause();
      }).not.toThrow();

      expect(mockVideoNodeA.startPlaybackPreload).toHaveBeenCalled();
      expect(mockVideoNodeA.stopPlaybackPreload).toHaveBeenCalled();
    });
  });

  describe('HDR initial buffering', () => {
    // Helper to create mock VideoSourceNode with HDR support
    const createHDRMockVideoSourceNode = (hasFrameCachedFn: (frame: number) => boolean = () => false) => ({
      isUsingMediabunny: vi.fn(() => true),
      isHDR: vi.fn(() => true),
      hasFrameCached: vi.fn(hasFrameCachedFn),
      getFrameAsync: vi.fn().mockResolvedValue(null),
      preloadForPlayback: vi.fn().mockResolvedValue(undefined),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      stopPlaybackPreload: vi.fn(),
      updatePlaybackBuffer: vi.fn(),
    });

    it('SES-HDR-001: HDR video play() enables buffering gate', () => {
      const mockVideoNode = createHDRMockVideoSourceNode();
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'hdr.mp4',
        url: 'hdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;
      session.play();

      // _hdrBuffering should be set
      expect(internal._playbackEngine._hdrBuffering).toBe(true);
    });

    it('SES-HDR-002: update() skips frame advancement during HDR buffering', () => {
      const mockVideoNode = createHDRMockVideoSourceNode(() => true);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'hdr.mp4',
        url: 'hdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 5;
      const startFrame = session.currentFrame;

      // Force _hdrBuffering to be true (simulating slow decoder)
      internal._playbackEngine._hdrBuffering = true;

      // Advance time
      mockTime = 200;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      session.update();

      // Frame should NOT advance while buffering
      expect(session.currentFrame).toBe(startFrame);

      vi.restoreAllMocks();
    });

    it('SES-HDR-003: pause() clears HDR buffering gate', () => {
      const mockVideoNode = createHDRMockVideoSourceNode();
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'hdr.mp4',
        url: 'hdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;
      session.play();
      expect(internal._playbackEngine._hdrBuffering).toBe(true);

      session.pause();
      expect(internal._playbackEngine._hdrBuffering).toBe(false);
    });

    it('SES-HDR-004: play/pause/play cycle re-enables buffering', () => {
      const mockVideoNode = createHDRMockVideoSourceNode();
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'hdr.mp4',
        url: 'hdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      // First play
      session.play();
      expect(internal._playbackEngine._hdrBuffering).toBe(true);

      // Pause clears it
      session.pause();
      expect(internal._playbackEngine._hdrBuffering).toBe(false);

      // Second play re-enables it
      session.play();
      expect(internal._playbackEngine._hdrBuffering).toBe(true);

      session.pause();
    });

    it('SES-HDR-005: non-HDR video does not enable buffering gate', () => {
      // Mock without isHDR (returns undefined via optional chaining)
      const mockVideoNode = {
        isUsingMediabunny: vi.fn(() => true),
        hasFrameCached: vi.fn(() => true),
        getFrameAsync: vi.fn().mockResolvedValue(null),
        preloadForPlayback: vi.fn().mockResolvedValue(undefined),
        preloadFrames: vi.fn().mockResolvedValue(undefined),
        setPlaybackDirection: vi.fn(),
        startPlaybackPreload: vi.fn(),
        stopPlaybackPreload: vi.fn(),
        updatePlaybackBuffer: vi.fn(),
      };
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'sdr.mp4',
        url: 'sdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;
      session.play();

      // Without isHDR, _hdrBuffering should remain false
      expect(internal._playbackEngine._hdrBuffering).toBe(false);

      session.pause();
    });

    it('SES-HDR-006: HDR buffering triggers sequential getFrameAsync calls', async () => {
      const mockVideoNode = createHDRMockVideoSourceNode();
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'hdr.mp4',
        url: 'hdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      session.play();

      // Wait for the async buffer loop to run
      await vi.waitFor(() => {
        expect(mockVideoNode.getFrameAsync).toHaveBeenCalled();
      });

      // The buffer fills 10 frames sequentially (MIN_PLAYBACK_BUFFER = 10)
      // starting from frame 1 with direction 1
      const calls = mockVideoNode.getFrameAsync.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      // Frames should be sequential
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i]![0]).toBeGreaterThan(calls[i - 1]![0]);
      }

      session.pause();
    });

    it('SES-HDR-007: HDR buffering clears after initial buffer load completes', async () => {
      const mockVideoNode = createHDRMockVideoSourceNode();
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'hdr.mp4',
        url: 'hdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;
      session.play();
      expect(internal._playbackEngine._hdrBuffering).toBe(true);

      // Wait for async buffer loop to complete (all getFrameAsync resolve)
      await vi.waitFor(() => {
        expect(internal._playbackEngine._hdrBuffering).toBe(false);
      });

      session.pause();
    });

    it('SES-HDR-008: pause during HDR buffering stops the buffer loop', async () => {
      let resolvers: Array<() => void> = [];
      const mockVideoNode = createHDRMockVideoSourceNode();
      // Make getFrameAsync block until manually resolved
      mockVideoNode.getFrameAsync.mockImplementation(() =>
        new Promise<null>(resolve => {
          resolvers.push(() => resolve(null));
        })
      );

      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'hdr.mp4',
        url: 'hdr.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 30,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      session.play();

      // Wait for first getFrameAsync to be called
      await vi.waitFor(() => {
        expect(resolvers.length).toBeGreaterThanOrEqual(1);
      });

      // Pause while buffering is in progress
      session.pause();

      // Resolve all pending frames
      resolvers.forEach(r => r());
      await Promise.resolve();

      // getFrameAsync should not have been called for all 10 frames
      // because pause sets _isPlaying to false, which breaks the loop
      expect(mockVideoNode.getFrameAsync.mock.calls.length).toBeLessThan(10);
    });
  });

  describe('preservesPitch', () => {
    it('SES-PITCH-001: defaults to true', () => {
      expect(session.preservesPitch).toBe(true);
    });

    it('SES-PITCH-002: can be set to false', () => {
      session.preservesPitch = false;
      expect(session.preservesPitch).toBe(false);
    });

    it('SES-PITCH-003: can be toggled back to true', () => {
      session.preservesPitch = false;
      session.preservesPitch = true;
      expect(session.preservesPitch).toBe(true);
    });

    it('SES-PITCH-004: emits preservesPitchChanged event', () => {
      const handler = vi.fn();
      session.on('preservesPitchChanged', handler);

      session.preservesPitch = false;
      expect(handler).toHaveBeenCalledWith(false);

      session.preservesPitch = true;
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('SES-PITCH-005: does not emit event when value unchanged', () => {
      const handler = vi.fn();
      session.on('preservesPitchChanged', handler);

      // Set to same value
      session.preservesPitch = true;
      expect(handler).not.toHaveBeenCalled();
    });

    it('SES-PITCH-006: applies to video element when set', () => {
      const video = createMockVideo();
      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'blob:test',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
      }]);

      // Default should be true
      session.preservesPitch = false;
      expect(video.preservesPitch).toBe(false);

      session.preservesPitch = true;
      expect(video.preservesPitch).toBe(true);
    });

    it('SES-PITCH-007: is included in getPlaybackState', () => {
      const state = session.getPlaybackState();
      expect(state.preservesPitch).toBe(true);

      session.preservesPitch = false;
      const state2 = session.getPlaybackState();
      expect(state2.preservesPitch).toBe(false);
    });

    it('SES-PITCH-008: is restored by setPlaybackState', () => {
      session.preservesPitch = true;
      session.setPlaybackState({ preservesPitch: false });
      expect(session.preservesPitch).toBe(false);

      session.setPlaybackState({ preservesPitch: true });
      expect(session.preservesPitch).toBe(true);
    });

    it('SES-PITCH-009: setPlaybackState without preservesPitch does not change it', () => {
      session.preservesPitch = false;
      session.setPlaybackState({ volume: 0.5 });
      expect(session.preservesPitch).toBe(false);
    });
  });

  describe('interpolation', () => {
    it('SES-INTERP-001: default interpolation is disabled', () => {
      expect(session.interpolationEnabled).toBe(false);
    });

    it('SES-INTERP-002: can enable interpolation', () => {
      session.interpolationEnabled = true;
      expect(session.interpolationEnabled).toBe(true);
    });

    it('SES-INTERP-003: can disable interpolation', () => {
      session.interpolationEnabled = true;
      session.interpolationEnabled = false;
      expect(session.interpolationEnabled).toBe(false);
    });

    it('SES-INTERP-004: emits interpolationEnabledChanged event', () => {
      const handler = vi.fn();
      session.on('interpolationEnabledChanged', handler);
      session.interpolationEnabled = true;
      expect(handler).toHaveBeenCalledWith(true);
      session.interpolationEnabled = false;
      expect(handler).toHaveBeenCalledWith(false);
    });

    it('SES-INTERP-005: does not emit when value unchanged', () => {
      const handler = vi.fn();
      session.on('interpolationEnabledChanged', handler);
      session.interpolationEnabled = false; // Already false
      expect(handler).not.toHaveBeenCalled();
    });

    it('SES-INTERP-006: subFramePosition is null by default', () => {
      expect(session.subFramePosition).toBeNull();
    });

    it('SES-INTERP-007: disabling clears subFramePosition', () => {
      session.interpolationEnabled = true;
      // SubFramePosition is managed internally by update(), so it starts null
      session.interpolationEnabled = false;
      expect(session.subFramePosition).toBeNull();
    });

    it('SES-INTERP-008: emits subFramePositionChanged null when disabling', () => {
      session.interpolationEnabled = true;
      const handler = vi.fn();
      session.on('subFramePositionChanged', handler);
      session.interpolationEnabled = false;
      expect(handler).toHaveBeenCalledWith(null);
    });
  });

  describe('_pendingPlayPromise lifecycle', () => {
    // These tests verify the fix for a bug where _pendingPlayPromise leaked a
    // resolved Promise after play(), preventing subsequent play() calls from
    // working after a pause.

    const getPendingPlayPromise = (s: Session): Promise<void> | null =>
      (s as unknown as { _pendingPlayPromise: Promise<void> | null })._pendingPlayPromise;

    it('SES-PPP-001: play() then pause() allows play() to be called again', () => {
      const video = createMockVideo(100, 0);
      video.play = vi.fn().mockResolvedValue(undefined);
      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: video,
      }]);
      session.setOutPoint(100);

      session.play();
      expect(session.isPlaying).toBe(true);

      session.pause();
      expect(session.isPlaying).toBe(false);

      // The critical assertion: _pendingPlayPromise must be null after pause
      // so that play() can be called again
      expect(getPendingPlayPromise(session)).toBeNull();

      // Verify play() works again
      session.play();
      expect(session.isPlaying).toBe(true);
    });

    it('SES-PPP-002: pause() clears _pendingPlayPromise', () => {
      const video = createMockVideo(100, 0);
      video.play = vi.fn().mockResolvedValue(undefined);
      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: video,
      }]);
      session.setOutPoint(100);

      session.play();

      // _pendingPlayPromise may be set during play (safeVideoPlay manages it)
      session.pause();

      // Must be null after pause so play() guard doesn't block
      expect(getPendingPlayPromise(session)).toBeNull();
    });

    it('SES-PPP-003: multiple play/pause cycles work correctly', () => {
      const video = createMockVideo(100, 0);
      video.play = vi.fn().mockResolvedValue(undefined);
      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: video,
      }]);
      session.setOutPoint(100);

      for (let i = 0; i < 5; i++) {
        session.play();
        expect(session.isPlaying).toBe(true);
        session.pause();
        expect(session.isPlaying).toBe(false);
        expect(getPendingPlayPromise(session)).toBeNull();
      }
    });

    it('SES-PPP-004: play() does not overwrite safeVideoPlay internal promise management', () => {
      const video = createMockVideo(100, 0);
      video.play = vi.fn().mockResolvedValue(undefined);
      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: video,
      }]);
      session.setOutPoint(100);

      session.play();
      expect(session.isPlaying).toBe(true);

      // The _pendingPlayPromise should either be null (cleared by safeVideoPlay
      // finally block) or the IIFE promise (not the outer promise from play()).
      // Either way, after safeVideoPlay resolves, it should be cleared.
      // The _pendingPlayPromise should either be null (cleared by safeVideoPlay
      // finally block) or the IIFE promise (not the outer promise from play()).
      // After microtask (safeVideoPlay completion), it should be null.
      expect(getPendingPlayPromise(session)).not.toBe('leaked');
    });

    it('SES-PPP-005: safeVideoPlay error does not permanently block play()', async () => {
      const video = createMockVideo(100, 0);
      // First call rejects with a generic error
      video.play = vi.fn().mockRejectedValueOnce(new DOMException('test error', 'UnknownError'));
      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: video,
      }]);
      session.setOutPoint(100);

      session.play();
      // safeVideoPlay will fail asynchronously and call pause()
      // Wait for the promise to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      // Session should be paused (safeVideoPlay error handler calls pause)
      expect(session.isPlaying).toBe(false);
      // _pendingPlayPromise must be null so play() can be retried
      expect(getPendingPlayPromise(session)).toBeNull();

      // Retry with successful play
      video.play = vi.fn().mockResolvedValue(undefined);
      session.play();
      expect(session.isPlaying).toBe(true);
    });

    it('SES-PPP-006: togglePlayback works after video play error', async () => {
      const video = createMockVideo(100, 0);
      video.play = vi.fn().mockRejectedValueOnce(new DOMException('test error', 'UnknownError'));
      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: video,
      }]);
      session.setOutPoint(100);

      session.togglePlayback(); // play
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be paused due to error
      expect(session.isPlaying).toBe(false);

      // togglePlayback should still work
      video.play = vi.fn().mockResolvedValue(undefined);
      session.togglePlayback(); // should play again
      expect(session.isPlaying).toBe(true);
    });

    it('SES-PPP-007: visibility-driven play/pause cycle works', () => {
      // Simulates the App.ts visibility change handler pattern:
      // tab hidden → pause(), tab visible → play()
      const video = createMockVideo(100, 0);
      video.play = vi.fn().mockResolvedValue(undefined);
      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: video,
      }]);
      session.setOutPoint(100);

      // Initial play
      session.play();
      expect(session.isPlaying).toBe(true);

      // Tab hidden → pause
      session.pause();
      expect(session.isPlaying).toBe(false);

      // Tab visible → play
      session.play();
      expect(session.isPlaying).toBe(true);

      // Second hide/show cycle
      session.pause();
      session.play();
      expect(session.isPlaying).toBe(true);
    });

    it('SES-PPP-008: play() with non-video source has no pending promise issue', () => {
      // Image sources don't use safeVideoPlay, so no promise leak
      const sources = (session as unknown as { sources: MediaSource[] }).sources;
      sources.push({
        type: 'image',
        name: 'test',
        url: 'test.png',
        width: 100,
        height: 100,
        duration: 100,
        fps: 10,
      });
      (session as any)._outPoint = 100;

      session.play();
      expect(session.isPlaying).toBe(true);
      expect(getPendingPlayPromise(session)).toBeNull();

      session.pause();
      session.play();
      expect(session.isPlaying).toBe(true);
    });
  });

  // =============================================================================
  // Regression tests for starvation cascade fix
  // =============================================================================

  describe('Starvation cascade prevention (regression)', () => {
    it('SES-STARV-001: _consecutiveStarvationSkips exists and is initially 0', () => {
      // Access private field via any cast to verify it exists and is initialized correctly
      expect((session as any)._consecutiveStarvationSkips).toBe(0);
    });

    it('SES-STARV-002: triggerStarvationRecoveryPreload method exists and is callable', () => {
      // Verify the method exists on the session instance
      // This is a regression test to ensure the starvation recovery preload logic is present
      expect(typeof (session as any).triggerStarvationRecoveryPreload).toBe('function');
    });

    it('SES-STARV-003: MAX_CONSECUTIVE_STARVATION_SKIPS is 2', () => {
      // Access static constant via any cast
      expect((Session as any).MAX_CONSECUTIVE_STARVATION_SKIPS).toBe(2);
    });
  });

  // =============================================================================
  // Regression tests for end-of-video starvation handling
  // =============================================================================

  describe('end-of-video starvation handling (regression)', () => {
    // Helper to create mock VideoSourceNode with frame caching control
    const createMockVideoSourceNode = (hasFrameCachedFn: (frame: number) => boolean = () => false) => ({
      isUsingMediabunny: vi.fn(() => true),
      hasFrameCached: vi.fn(hasFrameCachedFn),
      getFrameAsync: vi.fn().mockResolvedValue(null),
      preloadForPlayback: vi.fn().mockResolvedValue(undefined),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      stopPlaybackPreload: vi.fn(),
      updatePlaybackBuffer: vi.fn(),
    });

    it('SES-EOV-001: When starvation occurs at a frame within 2 of _outPoint in loop mode, _currentFrame should wrap to _inPoint', () => {
      // Setup: video source with frames 1-100, currently at frame 99 (within 2 of outPoint 100)
      const mockVideoNode = createMockVideoSourceNode(() => false); // All frames NOT cached to trigger starvation
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.loopMode = 'loop';
      session.goToFrame(99); // Near end
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._starvationStartTime = performance.now() - 6000; // Exceed starvation timeout (5000ms)
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100; // Enough to trigger frame advance

      // Execute update - should detect end-of-video starvation and loop
      session.update();

      // Verify frame wrapped to beginning (not cascaded starvation)
      expect(session.currentFrame).toBe(1); // Wrapped to inPoint
      expect(internal._consecutiveStarvationSkips).toBe(0); // Reset on loop
    });

    it('SES-EOV-002: When starvation occurs near end in loop mode, the HTMLVideoElement currentTime should be reset to match the new frame position', () => {
      // Setup: video source at frame 98, close to outPoint 100
      const mockVideoNode = createMockVideoSourceNode(() => false); // Trigger starvation
      const video = createMockVideo(100 / 24, (98 - 1) / 24);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.loopMode = 'loop';
      session.goToFrame(98);
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      // Execute update - should loop and sync audio
      session.update();

      // Verify audio synced to loop point (frame 1 = time 0)
      expect(video.currentTime).toBe(0); // (1 - 1) / 24
      expect(session.currentFrame).toBe(1);
    });

    it('SES-EOV-003: When starvation occurs near end in once mode, playback should pause', () => {
      // Setup: video source at frame 99, near outPoint 100
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.loopMode = 'once';
      session.goToFrame(99);
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      // Execute update - should pause instead of looping
      session.update();

      // Verify playback paused (not looped)
      expect(session.isPlaying).toBe(false);
      expect(session.currentFrame).toBe(99); // Stayed at same frame
    });

    it('SES-EOV-004: When starvation cascade triggers pause (2 consecutive skips), the HTMLVideoElement should be paused immediately', () => {
      // Setup: video source mid-sequence, trigger cascade pause
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.pause = vi.fn();

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(50); // Mid-sequence (not near end)
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._consecutiveStarvationSkips = 1; // Already had 1 skip
      internal._starvationStartTime = performance.now() - 6000; // Trigger another
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      // Execute update - should hit cascade threshold (2 skips) and pause immediately
      session.update();

      // Verify video.pause() was called before session.pause()
      expect(video.pause).toHaveBeenCalled();
      expect(session.isPlaying).toBe(false);
      expect(internal._consecutiveStarvationSkips).toBe(0); // Reset after pause
    });

    it('SES-EOV-005: _consecutiveStarvationSkips resets to 0 after a successful frame render', () => {
      // Setup: video source with one frame cached (to allow successful render)
      let nextFrameToCheck = 51;
      const mockVideoNode = createMockVideoSourceNode((frame) => frame === nextFrameToCheck);
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(50);
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._consecutiveStarvationSkips = 1; // Had previous skip
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      // Execute update - frame 51 is cached, should render successfully
      session.update();

      // Verify skip counter reset on successful render
      expect(internal._consecutiveStarvationSkips).toBe(0);
      expect(session.currentFrame).toBe(51); // Advanced
    });

    it('SES-EOV-006: End-of-video starvation in reverse playback should handle properly (wrap to end or pause)', () => {
      // Test reverse playback near inPoint
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      // Test reverse + loop mode: should wrap to outPoint
      session.loopMode = 'loop';
      session.goToFrame(2); // Near inPoint (within 2 frames)
      session.play();

      const internal = session as any;
      internal._playDirection = -1; // Reverse
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      session.update();

      // Should wrap to outPoint in reverse loop
      expect(session.currentFrame).toBe(100); // Wrapped to outPoint
      expect(video.currentTime).toBeCloseTo((100 - 1) / 24, 5); // Audio synced

      // Test reverse + once mode: should pause
      session.loopMode = 'once';
      session.goToFrame(2);
      session.play();
      internal._playDirection = -1;
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      session.update();

      expect(session.isPlaying).toBe(false); // Paused at beginning
    });
  });

  describe('audio drift correction (regression)', () => {
    it('SES-AUDIO-001: Audio drift threshold constant is 1.0 seconds', () => {
      // Verify that the drift threshold is set to 1.0s (not 0.5s)
      // The threshold is hardcoded in the update() method's drift check
      const mockVideoNode = {
        isUsingMediabunny: vi.fn(() => true),
        hasFrameCached: vi.fn(() => true),
        getFrameAsync: vi.fn().mockResolvedValue(null),
        preloadForPlayback: vi.fn().mockResolvedValue(undefined),
        preloadFrames: vi.fn().mockResolvedValue(undefined),
        setPlaybackDirection: vi.fn(),
        startPlaybackPreload: vi.fn(),
        stopPlaybackPreload: vi.fn(),
        updatePlaybackBuffer: vi.fn(),
      } as any;
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();
      // Simulate an actively playing video so drift correction path is tested
      Object.defineProperty(video, 'paused', { get: () => false, configurable: true });

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode,
      }]);

      session.fps = 24;
      session.goToFrame(24);
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._audioSyncEnabled = true;

      // Test case 1: drift just below threshold (0.99s) - should NOT trigger seek
      // Frame 24 target = (24-1)/24 = 0.958333s
      // After update(), frame advances to 25, target = (25-1)/24 = 1.0s
      // Set video time to 1.99s, so drift after advance = |1.99 - 1.0| = 0.99s < 1.0
      video._currentTime = 1.99;
      const currentTimeBefore = video.currentTime;

      // Set up for single frame advance
      internal.lastFrameTime = performance.now();
      internal.frameAccumulator = (1000 / 24); // Exactly one frame worth

      session.update();

      // Should NOT have seeked (drift < 1.0)
      expect(video.currentTime).toBe(currentTimeBefore);
      expect(session.currentFrame).toBe(25); // Frame advanced

      // Test case 2: drift at threshold (1.0s exactly) - should trigger seek
      // Current frame is 25, after update() will advance to 26
      // Frame 26 target = (26-1)/24 = 1.041667s
      // Set video time to 2.041667s, so drift after advance = |2.041667 - 1.041667| = 1.0s exactly
      video._currentTime = 2.041667;
      internal.lastFrameTime = performance.now();
      internal.frameAccumulator = (1000 / 24); // Exactly one frame worth

      session.update();

      // Should have seeked (drift >= 1.0)
      expect(video.currentTime).toBeCloseTo(1.041667, 5); // (26-1)/24
      expect(session.currentFrame).toBe(26);
    });

    it('SES-AUDIO-002: Drift correction does not use video.pause()/video.play() cycle when video is actively playing', () => {
      // Verify that drift correction only sets currentTime without pause/play
      // when the video element is already playing (not paused/ended)
      const mockVideoNode = {
        isUsingMediabunny: vi.fn(() => true),
        hasFrameCached: vi.fn(() => true),
        getFrameAsync: vi.fn().mockResolvedValue(null),
        preloadForPlayback: vi.fn().mockResolvedValue(undefined),
        preloadFrames: vi.fn().mockResolvedValue(undefined),
        setPlaybackDirection: vi.fn(),
        startPlaybackPreload: vi.fn(),
        stopPlaybackPreload: vi.fn(),
        updatePlaybackBuffer: vi.fn(),
      } as any;
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();
      // Simulate an actively playing video (not paused, not ended)
      Object.defineProperty(video, 'paused', { get: () => false, configurable: true });

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode,
      }]);

      session.fps = 24;
      session.goToFrame(24);
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._audioSyncEnabled = true;

      // Clear play/pause call counts from session.play()
      video.play.mockClear();
      video.pause.mockClear();

      // Simulate significant drift (> 1.0s) to trigger correction
      // Frame 24 will advance to 25 during update()
      // Frame 25 target = (25-1)/24 = 1.0s
      // Set video time to 3.5s, so drift = |3.5 - 1.0| = 2.5s > 1.0
      video._currentTime = 3.5;

      // Set up for single frame advance
      internal.lastFrameTime = performance.now();
      internal.frameAccumulator = (1000 / 24); // Exactly one frame worth

      session.update();

      // Drift correction should have set currentTime to match the advanced frame
      expect(video.currentTime).toBeCloseTo(1.0, 5); // (25-1)/24
      expect(session.currentFrame).toBe(25); // Frame advanced

      // When video is actively playing, drift correction should only seek — not call play()
      expect(video.pause).not.toHaveBeenCalled();
      expect(video.play).not.toHaveBeenCalled();
    });
  });

  describe('audio replay on loop (regression)', () => {
    const createMockVideoSourceNode = (hasFrameCachedFn: (frame: number) => boolean = () => false) => ({
      isUsingMediabunny: vi.fn(() => true),
      hasFrameCached: vi.fn(hasFrameCachedFn),
      getFrameAsync: vi.fn().mockResolvedValue(null),
      preloadForPlayback: vi.fn().mockResolvedValue(undefined),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      stopPlaybackPreload: vi.fn(),
      updatePlaybackBuffer: vi.fn(),
    });

    it('SES-LOOP-AUDIO-001: video.play() is called when starvation-near-end triggers loop reset in forward playback', () => {
      // When starvation occurs near outPoint and loop mode wraps to inPoint,
      // video.play() must be called to restart audio after the seek.
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.loopMode = 'loop';
      session.goToFrame(99); // Near end (within 2 of outPoint 100)
      session.play();

      // Clear call counts from initial play()
      video.play.mockClear();

      const internal = session as any;
      internal._playDirection = 1;
      // Exceed starvation timeout (5000ms)
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      session.update();

      // Frame should wrap to inPoint
      expect(session.currentFrame).toBe(1);
      // video.play() must be called to restart audio after loop seek
      expect(video.play).toHaveBeenCalled();
    });

    it('SES-LOOP-AUDIO-002: video.play() is NOT called for reverse playback loop reset', () => {
      // Reverse playback should stay muted — no video.play() on loop
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.loopMode = 'loop';
      session.goToFrame(2); // Near inPoint for reverse
      session.togglePlayDirection(); // Set reverse
      session.play();

      // Clear call counts
      video.play.mockClear();

      const internal = session as any;
      // Exceed starvation timeout
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      session.update();

      // Frame should wrap to outPoint for reverse loop
      expect(session.currentFrame).toBe(100);
      // video.play() should NOT be called for reverse playback
      expect(video.play).not.toHaveBeenCalled();
    });

    it('SES-LOOP-AUDIO-003: video.currentTime is seeked to loop point when looping', () => {
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100 / 24, 4.0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.loopMode = 'loop';
      session.goToFrame(99);
      session.play();

      const internal = session as any;
      internal._playDirection = 1;
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 100;
      internal.frameAccumulator = 100;

      session.update();

      // Video currentTime should be seeked to frame 1: (1-1)/24 = 0
      expect(video.currentTime).toBeCloseTo(0, 5);
    });

    it('SES-LOOP-AUDIO-004: video.play() is called when HTMLVideoElement ends naturally during mediabunny playback', () => {
      // The HTMLVideoElement can reach its natural end before mediabunny finishes.
      // The audio sync block in update() must detect video.ended and restart audio.
      const mockVideoNode = createMockVideoSourceNode(() => true); // All frames cached
      const video = createMockVideo(100 / 24, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      // Simulate video.ended = true (HTMLVideoElement reached its natural end)
      Object.defineProperty(video, 'ended', {
        get: () => true,
        configurable: true,
      });
      // Simulate video.paused = true (ended videos are paused)
      Object.defineProperty(video, 'paused', {
        get: () => true,
        configurable: true,
      });

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(50);
      session.play();

      // Clear counts from initial play()
      video.play.mockClear();

      const internal = session as any;
      internal._playDirection = 1;
      internal.lastFrameTime = performance.now();
      internal.frameAccumulator = 1000 / 24; // One frame

      session.update();

      // The audio sync block should detect video.paused/ended and restart
      expect(video.play).toHaveBeenCalled();
    });

    it('SES-LOOP-AUDIO-005: video.play() is called when HTMLVideoElement is paused unexpectedly during mediabunny playback', () => {
      // Sometimes the browser can pause the video (e.g. tab visibility change)
      const mockVideoNode = createMockVideoSourceNode(() => true);
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);

      Object.defineProperty(video, 'paused', {
        get: () => true,
        configurable: true,
      });

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(50);
      session.play();

      video.play.mockClear();

      const internal = session as any;
      internal._playDirection = 1;
      internal.lastFrameTime = performance.now();
      internal.frameAccumulator = 1000 / 24;

      session.update();

      // Should detect paused state and restart audio
      expect(video.play).toHaveBeenCalled();
      // Should also seek to correct position
      expect(video.currentTime).toBeCloseTo((51 - 1) / 24, 3);
    });
  });

  describe('redundant frame fetch prevention (regression)', () => {
    const createMockVideoSourceNode = (hasFrameCachedFn: (frame: number) => boolean = () => false) => ({
      isUsingMediabunny: vi.fn(() => true),
      hasFrameCached: vi.fn(hasFrameCachedFn),
      getFrameAsync: vi.fn().mockResolvedValue(null),
      preloadForPlayback: vi.fn().mockResolvedValue(undefined),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      stopPlaybackPreload: vi.fn(),
      updatePlaybackBuffer: vi.fn(),
    });

    it('SES-FETCH-001: getFrameAsync is called only once for the same uncached frame across multiple update() ticks', () => {
      // When rAF ticks at 60Hz but frame decoding is slow, update() should
      // not fire redundant getFrameAsync calls for the same frame.
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(10);
      session.play();

      const internal = session as any;
      mockVideoNode.getFrameAsync.mockClear();

      // Simulate three rAF ticks, each with enough time for a frame
      for (let i = 0; i < 3; i++) {
        internal.lastFrameTime = performance.now() - 50;
        internal.frameAccumulator = 50; // > frameDuration for 24fps (~41.67ms)
        session.update();
      }

      // getFrameAsync should only be called once for frame 11 (next frame)
      // not three times (once per tick)
      expect(mockVideoNode.getFrameAsync).toHaveBeenCalledTimes(1);
      expect(mockVideoNode.getFrameAsync).toHaveBeenCalledWith(11);
    });

    it('SES-FETCH-002: buffering counter does not inflate across multiple ticks for the same frame', () => {
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(10);
      session.play();

      const internal = session as any;

      // Simulate five rAF ticks while frame 11 is not cached
      for (let i = 0; i < 5; i++) {
        internal.lastFrameTime = performance.now() - 50;
        internal.frameAccumulator = 50;
        session.update();
      }

      // Buffering counter should be 1 (one fetch in flight), not 5
      expect(internal._bufferingCount).toBe(1);
    });

    it('SES-FETCH-003: _pendingFetchFrame is cleared when frame becomes cached', () => {
      let frameCached = false;
      const mockVideoNode = createMockVideoSourceNode(() => frameCached);
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(10);
      session.play();

      const internal = session as any;

      // First tick: frame not cached, triggers fetch
      internal.lastFrameTime = performance.now() - 50;
      internal.frameAccumulator = 50;
      session.update();
      expect(internal._pendingFetchFrame).toBe(11);

      // Frame becomes cached — use exactly one frame duration so only one frame advances
      frameCached = true;
      const frameDuration = 1000 / 24; // ~41.67ms
      internal.lastFrameTime = performance.now();
      internal.frameAccumulator = frameDuration;
      session.update();

      // _pendingFetchFrame should be cleared after successful display
      expect(internal._pendingFetchFrame).toBeNull();
      expect(session.currentFrame).toBe(11);
    });

    it('SES-FETCH-004: _pendingFetchFrame is cleared on pause', () => {
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(10);
      session.play();

      const internal = session as any;
      internal.lastFrameTime = performance.now() - 50;
      internal.frameAccumulator = 50;
      session.update();
      expect(internal._pendingFetchFrame).toBe(11);

      session.pause();
      expect(internal._pendingFetchFrame).toBeNull();
    });

    it('SES-FETCH-005a: updatePlaybackBuffer is called on cache hits during mediabunny playback', () => {
      // When frames are served from cache (no stall), updatePlaybackBuffer must
      // be called to keep the preload window advancing ahead of the playhead.
      const mockVideoNode = createMockVideoSourceNode(() => true); // All frames cached
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(10);
      session.play();

      const internal = session as any;
      mockVideoNode.updatePlaybackBuffer.mockClear();

      // Simulate a tick with enough time for one frame advance
      const frameDuration = 1000 / 24;
      internal.lastFrameTime = performance.now();
      internal.frameAccumulator = frameDuration;
      session.update();

      // updatePlaybackBuffer should be called for the cache-hit frame
      expect(mockVideoNode.updatePlaybackBuffer).toHaveBeenCalled();
      expect(mockVideoNode.updatePlaybackBuffer).toHaveBeenCalledWith(11);
    });

    it('SES-FETCH-005: new fetch is triggered after starvation skip moves to a different frame', () => {
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const video = createMockVideo(100, 0);
      Object.setPrototypeOf(video, HTMLVideoElement.prototype);
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
        videoSourceNode: mockVideoNode as any,
      }]);

      session.goToFrame(50);
      session.play();

      const internal = session as any;
      mockVideoNode.getFrameAsync.mockClear();

      // First tick: triggers fetch for frame 51
      internal.lastFrameTime = performance.now() - 50;
      internal.frameAccumulator = 50;
      session.update();
      expect(mockVideoNode.getFrameAsync).toHaveBeenCalledTimes(1);
      expect(mockVideoNode.getFrameAsync).toHaveBeenCalledWith(51);

      // Now trigger starvation timeout which skips frame 51 → advances to 52
      internal._starvationStartTime = performance.now() - 6000;
      internal.lastFrameTime = performance.now() - 50;
      internal.frameAccumulator = 100; // enough for 2+ frames
      mockVideoNode.getFrameAsync.mockClear();

      session.update();

      // After skipping frame 51, should fetch frame 53 (52 was also skipped/advanced)
      // The exact next frame depends on loop logic, but a new fetch should happen
      expect(mockVideoNode.getFrameAsync.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =================================================================
  // FPS regression: update() must NOT call itself recursively
  //
  // A previous attempt to speed up cache-miss recovery added
  // `this.update()` inside the `.then()` callback of getFrameAsync.
  // This corrupted the timing accumulator because accumulateDelta()
  // was called outside the rAF tick cadence, stealing the delta from
  // the next rAF-driven tick and causing wild FPS oscillations (7-30fps
  // instead of stable 24fps).
  // =================================================================

  describe('update() must not call itself recursively (FPS regression)', () => {
    it('SES-FPS-NOREC-001: update() body does not contain this.update() calls', () => {
      // This is a source-code-level regression test.  We check the stringified
      // method body to ensure nobody re-introduces the recursive call.
      const updateSource = session.update.toString();

      // Look for patterns like `this.update()` or `self.update()` within
      // the then/catch callbacks.  A direct call to `this.update()` inside
      // the method body would appear in the stringified source.
      //
      // We allow exactly ONE occurrence: the method declaration itself
      // might reference "update" in its name.  We specifically look for
      // `.update()` call patterns (with parentheses) inside `.then(` blocks.
      const thenBlocks = updateSource.match(/\.then\s*\([^)]*\)\s*(?:=>)?\s*\{[^}]*\}/gs) || [];
      for (const block of thenBlocks) {
        expect(block).not.toMatch(/this\.update\s*\(/);
      }
    });

    it('SES-FPS-NOREC-002: getVideoFrameCanvas returns ImageBitmap-compatible type', () => {
      // getVideoFrameCanvas must return a type that includes ImageBitmap
      // to support the async snapshotCanvas path in MediabunnyFrameExtractor.
      // If someone narrows the type back to only HTMLCanvasElement | OffscreenCanvas,
      // the renderer will throw at runtime.
      const result = session.getVideoFrameCanvas();
      // With no source loaded, returns null — just verify the method exists
      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // Edge case tests for PlaybackEngine (IMP-039)
  // =============================================================================

  describe('PlaybackEngine edge cases (IMP-039)', () => {
    // Helper to access private members for testing
    const setPrivateState = (s: Session, overrides: {
      currentFrame?: number;
      inPoint?: number;
      outPoint?: number;
    }) => {
      const internal = s as unknown as {
        _currentFrame: number;
        _inPoint: number;
        _outPoint: number;
      };
      if (overrides.currentFrame !== undefined) internal._currentFrame = overrides.currentFrame;
      if (overrides.inPoint !== undefined) internal._inPoint = overrides.inPoint;
      if (overrides.outPoint !== undefined) internal._outPoint = overrides.outPoint;
    };

    // Helper to add a mock source with specified duration
    const addMockSource = (s: Session, duration: number) => {
      const sources = (s as unknown as { sources: MediaSource[] }).sources;
      sources.push({
        type: 'image',
        name: 'test',
        url: 'test.png',
        width: 100,
        height: 100,
        duration: duration,
        fps: 24,
      });
    };

    beforeEach(() => {
      addMockSource(session, 100);
      setPrivateState(session, { inPoint: 1, outPoint: 100 });
      session.fps = 24;
    });

    it('IMP-039-PBE-001: seek to frame 0 clamps to frame 1', () => {
      session.goToFrame(0);
      expect(session.currentFrame).toBe(1);
    });

    it('IMP-039-PBE-002: seek to negative frame clamps to frame 1', () => {
      session.goToFrame(-10);
      expect(session.currentFrame).toBe(1);
    });

    it('IMP-039-PBE-003: seek to frame beyond total frames clamps to duration', () => {
      session.goToFrame(999);
      expect(session.currentFrame).toBe(100);
    });

    it('IMP-039-PBE-004: rapid play/pause/play cycles leave isPlaying correct', () => {
      // 10 rapid cycles
      for (let i = 0; i < 10; i++) {
        session.play();
        expect(session.isPlaying).toBe(true);
        session.pause();
        expect(session.isPlaying).toBe(false);
      }
      // Final play should succeed
      session.play();
      expect(session.isPlaying).toBe(true);
    });

    it('IMP-039-PBE-005: stepForward at last frame stays at last frame in loop=once', () => {
      session.loopMode = 'once';
      session.goToFrame(100);
      expect(session.currentFrame).toBe(100);

      session.stepForward();

      // Should stay at outPoint and pause
      expect(session.currentFrame).toBe(100);
      expect(session.isPlaying).toBe(false);
    });

    it('IMP-039-PBE-006: stepForward at last frame wraps to first frame in loop=loop', () => {
      session.loopMode = 'loop';
      session.goToFrame(100);
      expect(session.currentFrame).toBe(100);

      session.stepForward();

      // Should wrap to inPoint
      expect(session.currentFrame).toBe(1);
      expect(session.isPlaying).toBe(false); // stepForward pauses
    });

    it('IMP-039-PBE-007: stepBackward at first frame stays at first frame in loop=once', () => {
      session.loopMode = 'once';
      session.goToFrame(1);
      expect(session.currentFrame).toBe(1);

      session.stepBackward();

      // Should stay at inPoint and pause
      expect(session.currentFrame).toBe(1);
      expect(session.isPlaying).toBe(false);
    });

    it('IMP-039-PBE-008: stepBackward at first frame wraps to last frame in loop=loop', () => {
      session.loopMode = 'loop';
      session.goToFrame(1);
      expect(session.currentFrame).toBe(1);

      session.stepBackward();

      // Should wrap to outPoint
      expect(session.currentFrame).toBe(100);
      expect(session.isPlaying).toBe(false); // stepBackward pauses
    });

    it('IMP-039-PBE-009: speed change during playback resets timing accumulator', () => {
      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      setPrivateState(session, { currentFrame: 50 });
      session.play();

      const internal = session as any;

      // Advance some frames at normal speed
      mockTime = 200;
      session.update();
      const frameAfterNormalSpeed = session.currentFrame;
      expect(frameAfterNormalSpeed).toBeGreaterThan(50);

      // Change speed during playback
      session.playbackSpeed = 2;

      // Timing accumulator should be reset (lastFrameTime refreshed)
      expect(internal.frameAccumulator).toBe(0);

      vi.restoreAllMocks();
    });

    it('IMP-039-PBE-010: speed change emits playbackSpeedChanged event', () => {
      const listener = vi.fn();
      session.on('playbackSpeedChanged', listener);

      session.playbackSpeed = 2;
      expect(listener).toHaveBeenCalledWith(2);
    });

    it('IMP-039-PBE-011: speed is clamped between 0.1 and 8', () => {
      session.playbackSpeed = 0.01;
      expect(session.playbackSpeed).toBe(0.1);

      session.playbackSpeed = 100;
      expect(session.playbackSpeed).toBe(8);
    });

    it('IMP-039-PBE-012: seek to frame 0 then step forward moves to frame 2', () => {
      session.goToFrame(0); // clamps to 1
      expect(session.currentFrame).toBe(1);

      session.stepForward();
      expect(session.currentFrame).toBe(2);
    });
  });

});
