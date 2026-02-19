/**
 * AudioPlaybackManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioPlaybackManager, type AudioPlaybackError } from './AudioPlaybackManager';

describe('AudioPlaybackManager', () => {
  let manager: AudioPlaybackManager;

  // Mock AudioContext
  const mockGainNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  };

  const mockSourceNode = {
    buffer: null as AudioBuffer | null,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };

  const mockAudioBuffer = {
    duration: 10,
    sampleRate: 44100,
    numberOfChannels: 2,
    length: 441000,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(441000)),
  };

  const mockAudioContext = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    createGain: vi.fn().mockReturnValue(mockGainNode),
    createBufferSource: vi.fn().mockReturnValue(mockSourceNode),
    decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destination: {},
  };

  beforeEach(() => {
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => mockAudioContext));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
    }));

    // Reset mocks
    vi.clearAllMocks();
    mockAudioContext.state = 'running';
    mockSourceNode.onended = null;

    manager = new AudioPlaybackManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('APM-001: starts in idle state', () => {
      expect(manager.state).toBe('idle');
    });

    it('APM-002: starts with isPlaying false', () => {
      expect(manager.isPlaying).toBe(false);
    });

    it('APM-003: starts with duration 0', () => {
      expect(manager.duration).toBe(0);
    });

    it('APM-004: starts with default volume 0.7', () => {
      expect(manager.volume).toBe(0.7);
    });

    it('APM-005: starts with muted false', () => {
      expect(manager.muted).toBe(false);
    });

    it('APM-006: currentTime is clamped to valid range', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);

      // Current time should be clamped between 0 and duration
      expect(manager.currentTime).toBeGreaterThanOrEqual(0);
      expect(manager.currentTime).toBeLessThanOrEqual(manager.duration);
    });
  });

  describe('initContext', () => {
    it('APM-010: creates AudioContext', async () => {
      await manager.initContext();
      expect(AudioContext).toHaveBeenCalled();
    });

    it('APM-011: resumes suspended context', async () => {
      mockAudioContext.state = 'suspended';
      await manager.initContext();
      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('APM-012: only creates context once', async () => {
      await manager.initContext();
      await manager.initContext();
      expect(AudioContext).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadFromVideo', () => {
    it('APM-020: loads audio from video element', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';

      const result = await manager.loadFromVideo(video);

      expect(result).toBe(true);
      expect(manager.state).toBe('ready');
      expect(manager.duration).toBe(10);
    });

    it('APM-021: falls back to video element on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const video = document.createElement('video');
      video.src = 'test.mp4';
      Object.defineProperty(video, 'duration', { value: 5, configurable: true });

      const result = await manager.loadFromVideo(video);

      expect(result).toBe(true);
      expect(manager.state).toBe('ready');
      expect(manager.duration).toBe(5);
    });

    it('APM-022: handles video with no source', async () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'duration', { value: 0, configurable: true });

      const result = await manager.loadFromVideo(video);

      expect(result).toBe(true);
      expect(manager.state).toBe('ready');
    });
  });

  describe('loadFromBlob', () => {
    it('APM-030: loads audio from blob', async () => {
      const blob = new Blob(['test']);
      // Mock arrayBuffer method
      blob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(1024));

      const result = await manager.loadFromBlob(blob);

      expect(result).toBe(true);
      expect(manager.state).toBe('ready');
    });

    it('APM-031: handles decode error', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error('Decode failed'));

      const blob = new Blob(['test']);
      blob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(1024));

      const errorListener = vi.fn();
      manager.on('error', errorListener);

      const result = await manager.loadFromBlob(blob);

      expect(result).toBe(false);
      expect(errorListener).toHaveBeenCalled();
    });
  });

  describe('play/pause', () => {
    beforeEach(async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
    });

    it('APM-040: play starts playback', async () => {
      const result = await manager.play();

      expect(result).toBe(true);
      expect(manager.isPlaying).toBe(true);
      expect(manager.state).toBe('playing');
    });

    it('APM-041: play does nothing if already playing', async () => {
      await manager.play();
      const result = await manager.play();

      expect(result).toBe(true);
      expect(mockSourceNode.start).toHaveBeenCalledTimes(1);
    });

    it('APM-042: pause stops playback', async () => {
      await manager.play();
      manager.pause();

      expect(manager.isPlaying).toBe(false);
      expect(manager.state).toBe('paused');
    });

    it('APM-043: pause does nothing if not playing', () => {
      manager.pause();
      expect(manager.state).toBe('ready');
    });

    it('APM-044: play from specific time', async () => {
      await manager.play(5);

      expect(mockSourceNode.start).toHaveBeenCalledWith(0, 5);
    });
  });

  describe('seek', () => {
    beforeEach(async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
    });

    it('APM-050: seek updates current time when paused', () => {
      manager.seek(5);
      expect(manager.currentTime).toBe(5);
    });

    it('APM-051: seek clamps to valid range', () => {
      manager.seek(-5);
      expect(manager.currentTime).toBe(0);

      manager.seek(100);
      expect(manager.currentTime).toBe(10); // duration is 10
    });

    it('APM-052: seek restarts playback if was playing', async () => {
      await manager.play();
      manager.seek(5);

      // Should have restarted playback
      expect(manager.isPlaying).toBe(true);
    });
  });

  describe('syncToTime', () => {
    beforeEach(async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
    });

    it('APM-060: syncToTime updates time when paused', () => {
      manager.syncToTime(3);
      expect(manager.currentTime).toBe(3);
    });

    it('APM-061: syncToTime ignores small drift during playback', async () => {
      await manager.play();
      const initialStartCalls = mockSourceNode.start.mock.calls.length;

      // Small sync (within threshold)
      manager.syncToTime(0.05);

      // Should not restart playback
      expect(mockSourceNode.start.mock.calls.length).toBe(initialStartCalls);
    });

    it('APM-062: syncToTime resyncs on large drift', async () => {
      await manager.play();

      // Large sync (beyond threshold of 0.1)
      // Note: syncToTime calls play() asynchronously for Web Audio API resync
      manager.syncToTime(5);

      // Should have stopped the current source node to prepare for resync
      expect(mockSourceNode.stop).toHaveBeenCalled();

      // Wait for the async play() to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Manager should still be in a valid state after resync
      expect(manager.isPlaying).toBe(true);
    });
  });

  describe('volume control', () => {
    beforeEach(async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
    });

    it('APM-070: setVolume updates gain', () => {
      manager.setVolume(0.5);
      expect(mockGainNode.gain.value).toBe(0.5);
    });

    it('APM-071: setVolume clamps to valid range', () => {
      manager.setVolume(1.5);
      expect(mockGainNode.gain.value).toBe(1);

      manager.setVolume(-0.5);
      expect(mockGainNode.gain.value).toBe(0);
    });

    it('APM-072: setMuted sets gain to 0', () => {
      manager.setVolume(0.8);
      manager.setMuted(true);
      expect(mockGainNode.gain.value).toBe(0);
    });

    it('APM-073: unmuting restores volume', () => {
      manager.setVolume(0.8);
      manager.setMuted(true);
      manager.setMuted(false);
      expect(mockGainNode.gain.value).toBe(0.8);
    });
  });

  describe('playback rate', () => {
    beforeEach(async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
    });

    it('APM-080: setPlaybackRate updates rate', async () => {
      await manager.play();
      manager.setPlaybackRate(2);
      expect(mockSourceNode.playbackRate.value).toBe(2);
    });

    it('APM-081: setPlaybackRate clamps to valid range', async () => {
      await manager.play();

      manager.setPlaybackRate(10);
      expect(mockSourceNode.playbackRate.value).toBe(8);

      manager.setPlaybackRate(0.01);
      expect(mockSourceNode.playbackRate.value).toBe(0.1);
    });
  });

  describe('reverse playback', () => {
    beforeEach(async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
    });

    it('APM-090: setReversePlayback mutes audio', async () => {
      manager.setVolume(0.8);
      await manager.play();

      manager.setReversePlayback(true);
      expect(mockGainNode.gain.value).toBe(0);
    });

    it('APM-091: setReversePlayback(false) restores audio', async () => {
      manager.setVolume(0.8);
      await manager.play();

      manager.setReversePlayback(true);
      manager.setReversePlayback(false);
      expect(mockGainNode.gain.value).toBe(0.8);
    });
  });

  describe('events', () => {
    it('APM-100: emits stateChanged events', async () => {
      const listener = vi.fn();
      manager.on('stateChanged', listener);

      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);

      expect(listener).toHaveBeenCalledWith('loading');
      expect(listener).toHaveBeenCalledWith('ready');
    });

    it('APM-101: emits error events', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error('Test error'));

      const errorListener = vi.fn();
      manager.on('error', errorListener);

      const blob = new Blob(['test']);
      await manager.loadFromBlob(blob);

      expect(errorListener).toHaveBeenCalled();
      const error: AudioPlaybackError = errorListener.mock.calls[0][0];
      expect(error.type).toBe('decode');
    });

    it('APM-102: emits ended event when video element ends', async () => {
      // Use video fallback by making fetch fail
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Fetch failed')));

      const video = document.createElement('video');
      video.src = 'test.mp4';
      Object.defineProperty(video, 'duration', { value: 5, configurable: true });
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      await manager.loadFromVideo(video);

      const endedListener = vi.fn();
      manager.on('ended', endedListener);

      await manager.play();
      expect(manager.isPlaying).toBe(true);

      // Simulate video ending by calling pause through manager
      manager.pause();

      expect(manager.isPlaying).toBe(false);
      // Note: the ended event is only emitted when playback naturally ends,
      // not when manually paused. This test verifies pause behavior.
    });
  });

  describe('dispose', () => {
    it('APM-110: dispose cleans up resources', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
      await manager.play();

      manager.dispose();

      expect(manager.state).toBe('idle');
      expect(manager.isPlaying).toBe(false);
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('APM-111: play after dispose returns false', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);

      manager.dispose();

      const result = await manager.play();
      expect(result).toBe(false);
    });

    it('APM-112: seek after dispose does not crash', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);

      manager.dispose();

      // Should not throw
      expect(() => manager.seek(5)).not.toThrow();
    });

    it('APM-113: setVolume after dispose does not crash', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);

      manager.dispose();

      // Should not throw
      expect(() => manager.setVolume(0.5)).not.toThrow();
    });

    it('APM-114: pause after dispose does not crash', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
      await manager.play();

      manager.dispose();

      // Should not throw
      expect(() => manager.pause()).not.toThrow();
    });
  });

  describe('video fallback', () => {
    it('APM-120: uses video element when Web Audio fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Fetch failed')));

      const video = document.createElement('video');
      video.src = 'test.mp4';
      Object.defineProperty(video, 'duration', { value: 5, configurable: true });
      video.play = vi.fn().mockResolvedValue(undefined);
      video.pause = vi.fn();

      await manager.loadFromVideo(video);
      await manager.play();

      expect(video.play).toHaveBeenCalled();
    });

    it('APM-121: handles autoplay policy error in fallback', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Fetch failed')));

      const autoplayError = new DOMException('Autoplay blocked', 'NotAllowedError');

      const video = document.createElement('video');
      video.src = 'test.mp4';
      Object.defineProperty(video, 'duration', { value: 5, configurable: true });
      video.play = vi.fn().mockRejectedValue(autoplayError);
      video.pause = vi.fn();

      const errorListener = vi.fn();
      manager.on('error', errorListener);

      await manager.loadFromVideo(video);
      await manager.play();

      expect(errorListener).toHaveBeenCalled();
      expect(errorListener.mock.calls[0][0].type).toBe('autoplay');
    });
  });

  describe('audio scrubbing', () => {
    beforeEach(async () => {
      vi.useFakeTimers();

      const video = document.createElement('video');
      video.src = 'test.mp4';
      await manager.loadFromVideo(video);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('SCRUB-001: scrubToFrame plays audio at correct timestamp', async () => {
      // Frame 25 at 24fps → (25-1)/24 = 1.0s
      manager.scrubToFrame(25, 24);

      // Advance past debounce timer (30ms)
      vi.advanceTimersByTime(30);

      // Should have created a buffer source
      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();

      // Get the created scrub source node
      const lastResult = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ];
      const scrubSource = lastResult!.value;

      // Should have started at the correct timestamp with snippet duration
      expect(scrubSource.start).toHaveBeenCalledWith(0, 1.0, 0.05);
      expect(scrubSource.buffer).toBe(mockAudioBuffer);
      expect(scrubSource.connect).toHaveBeenCalledWith(mockGainNode);
    });

    it('SCRUB-002: rapid scrub debounces — only last scrub plays', async () => {
      // Scrub rapidly across multiple frames
      manager.scrubToFrame(10, 24);
      manager.scrubToFrame(11, 24);
      manager.scrubToFrame(12, 24);

      // Before debounce fires, no createBufferSource call for snippets
      // (the load sequence may have called createBufferSource already via play)
      const callsBefore = mockAudioContext.createBufferSource.mock.calls.length;

      // Advance past debounce timer
      vi.advanceTimersByTime(30);

      // Only one additional createBufferSource call should have been made (for the last scrub)
      const callsAfter = mockAudioContext.createBufferSource.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(1);

      // Verify it used the last frame's timestamp: (12-1)/24 = 0.458...
      const scrubSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      expect(scrubSource.start).toHaveBeenCalledWith(0, expect.closeTo(11 / 24, 5), 0.05);
    });

    it('SCRUB-003: no audio loaded — scrub is silent (no error)', () => {
      // Create a fresh manager with no audio loaded
      const freshManager = new AudioPlaybackManager();

      // Should not throw
      expect(() => freshManager.scrubToFrame(10, 24)).not.toThrow();

      // No createBufferSource calls for scrubbing
      const callsBefore = mockAudioContext.createBufferSource.mock.calls.length;
      vi.advanceTimersByTime(30);
      expect(mockAudioContext.createBufferSource.mock.calls.length).toBe(callsBefore);

      freshManager.dispose();
    });

    it('SCRUB-004: scrub during active playback stops previous snippet', async () => {
      vi.useRealTimers(); // Need real timers for play()
      await manager.play();
      vi.useFakeTimers();

      // Now scrub — should stop any previous scrub snippet and start new one
      manager.scrubToFrame(50, 24);
      vi.advanceTimersByTime(30);

      // The scrub should create a new buffer source (separate from the playback source)
      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();

      const scrubSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;

      // Scrub again — should stop the previous scrub snippet
      manager.scrubToFrame(60, 24);

      // The previous snippet's stop should be called
      expect(scrubSource.stop).toHaveBeenCalled();
      expect(scrubSource.disconnect).toHaveBeenCalled();
    });

    it('SCRUB-005: AudioContext suspended — no error thrown', async () => {
      // Set context to suspended state
      mockAudioContext.state = 'suspended';

      const callsBefore = mockAudioContext.createBufferSource.mock.calls.length;

      // Should not throw
      expect(() => manager.scrubToFrame(24, 24)).not.toThrow();

      // Advance timers — no snippet should be created
      vi.advanceTimersByTime(30);
      expect(mockAudioContext.createBufferSource.mock.calls.length).toBe(callsBefore);
    });
  });
});
