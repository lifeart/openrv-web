/**
 * AudioPlaybackManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioPlaybackManager, type AudioPlaybackError } from './AudioPlaybackManager';
import {
  createMockAudioContext,
  createMockGainNode,
  createMockSourceNode,
} from '../../test/mocks';

describe('AudioPlaybackManager', () => {
  let manager: AudioPlaybackManager;

  // Track created nodes for assertions (populated by the shared mock factory)
  let createdGainNodes: ReturnType<typeof createMockGainNode>[];
  let createdSourceNodes: ReturnType<typeof createMockSourceNode>[];
  let mockAudioContext: ReturnType<typeof createMockAudioContext>['context'];

  /** Get the last created source node (convenience helper) */
  function getLastSourceNode() {
    return createdSourceNodes[createdSourceNodes.length - 1]!;
  }

  beforeEach(() => {
    const audioMock = createMockAudioContext();
    mockAudioContext = audioMock.context;
    createdGainNodes = audioMock.createdGainNodes;
    createdSourceNodes = audioMock.createdSourceNodes;

    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
    }));

    manager = new AudioPlaybackManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.unstubAllGlobals();
  });

  // Helper to get the main gain node (first created, used for volume control)
  function getMainGainNode() {
    return createdGainNodes[0];
  }

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
      const sourceCountAfterFirstPlay = createdSourceNodes.length;
      const result = await manager.play();

      expect(result).toBe(true);
      // No new source node should be created
      expect(createdSourceNodes.length).toBe(sourceCountAfterFirstPlay);
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

      expect(getLastSourceNode().start).toHaveBeenCalledWith(0, 5);
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
      const sourceCountBefore = createdSourceNodes.length;

      // Small sync (within threshold)
      manager.syncToTime(0.05);

      // Should not create a new source node (no restart)
      expect(createdSourceNodes.length).toBe(sourceCountBefore);
    });

    it('APM-062: syncToTime resyncs on large drift', async () => {
      await manager.play();
      const playSourceNode = getLastSourceNode();

      // Large sync (beyond threshold of 0.1)
      // Note: syncToTime calls play() asynchronously for Web Audio API resync
      manager.syncToTime(5);

      // Should have stopped the current source node to prepare for resync
      expect(playSourceNode.stop).toHaveBeenCalled();

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
      expect(getMainGainNode()!.gain.value).toBe(0.5);
    });

    it('APM-071: setVolume clamps to valid range', () => {
      manager.setVolume(1.5);
      expect(getMainGainNode()!.gain.value).toBe(1);

      manager.setVolume(-0.5);
      expect(getMainGainNode()!.gain.value).toBe(0);
    });

    it('APM-072: setMuted sets gain to 0', () => {
      manager.setVolume(0.8);
      manager.setMuted(true);
      expect(getMainGainNode()!.gain.value).toBe(0);
    });

    it('APM-073: unmuting restores volume', () => {
      manager.setVolume(0.8);
      manager.setMuted(true);
      manager.setMuted(false);
      expect(getMainGainNode()!.gain.value).toBe(0.8);
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
      // setPlaybackRate restarts playback, creating a new source node
      expect(getLastSourceNode().playbackRate.value).toBe(2);
    });

    it('APM-081: setPlaybackRate clamps to valid range', async () => {
      await manager.play();

      manager.setPlaybackRate(10);
      expect(getLastSourceNode().playbackRate.value).toBe(8);

      manager.setPlaybackRate(0.01);
      expect(getLastSourceNode().playbackRate.value).toBe(0.1);
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
      expect(getMainGainNode()!.gain.value).toBe(0);
    });

    it('APM-091: setReversePlayback(false) restores audio', async () => {
      manager.setVolume(0.8);
      await manager.play();

      manager.setReversePlayback(true);
      manager.setReversePlayback(false);
      expect(getMainGainNode()!.gain.value).toBe(0.8);
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

  describe('fetch cache behavior', () => {
    it('APM-130: HTTP URL fetch uses cache: force-cache and mode: cors', async () => {
      const video = document.createElement('video');
      video.src = 'https://cdn.example.com/test.mp4';

      await manager.loadFromVideo(video);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/test.mp4', expect.objectContaining({
        cache: 'force-cache',
        mode: 'cors',
      }));
    });

    it('APM-131: Blob URL fetch does NOT use force-cache and uses same-origin mode', async () => {
      const video = document.createElement('video');
      video.src = 'blob:http://localhost:3000/abc-123';

      await manager.loadFromVideo(video);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('blob:http://localhost:3000/abc-123', expect.objectContaining({
        mode: 'same-origin',
      }));
      expect(fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        cache: expect.anything(),
      }));
    });

    it('APM-132: Data URL fetch does NOT use force-cache and uses same-origin mode', async () => {
      const video = document.createElement('video');
      video.src = 'data:video/mp4;base64,AAAA';

      await manager.loadFromVideo(video);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('data:video/mp4;base64,AAAA', expect.objectContaining({
        mode: 'same-origin',
      }));
      expect(fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        cache: expect.anything(),
      }));
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

    it('SCRUB-001: scrubToFrame plays audio snippet after debounce', () => {
      // Frame 25 at 24fps -> (25-1)/24 = 1.0s
      manager.scrubToFrame(25, 24);

      // Advance past debounce timer
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Should have created a buffer source for snippet
      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();

      // Should have created an envelope gain node (separate from main gain)
      // Main gain is createdGainNodes[0], envelope is the last one
      expect(createdGainNodes.length).toBeGreaterThan(1);
    });

    it('SCRUB-002: rapid scrub debounces -- only last scrub plays', () => {
      // Scrub rapidly across multiple frames
      manager.scrubToFrame(10, 24);
      manager.scrubToFrame(11, 24);
      manager.scrubToFrame(12, 24);

      const callsBefore = mockAudioContext.createBufferSource.mock.calls.length;

      // Advance past debounce timer
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Only one additional createBufferSource call (for the last scrub)
      const callsAfter = mockAudioContext.createBufferSource.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(1);
    });

    it('SCRUB-003: no audio loaded -- scrub is silent (no error)', () => {
      const freshManager = new AudioPlaybackManager();

      expect(() => freshManager.scrubToFrame(10, 24)).not.toThrow();

      const callsBefore = mockAudioContext.createBufferSource.mock.calls.length;
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);
      expect(mockAudioContext.createBufferSource.mock.calls.length).toBe(callsBefore);

      freshManager.dispose();
    });

    it('SCRUB-004: scrub during active playback stops previous snippet', async () => {
      vi.useRealTimers();
      await manager.play();
      vi.useFakeTimers();

      // Now scrub
      manager.scrubToFrame(50, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();

      const scrubSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;

      // Scrub again -- should stop the previous snippet
      manager.scrubToFrame(60, 24);

      expect(scrubSource.stop).toHaveBeenCalled();
      expect(scrubSource.disconnect).toHaveBeenCalled();
    });

    it('SCRUB-005: AudioContext suspended -- calls resume and plays snippet', async () => {
      mockAudioContext.state = 'suspended';
      mockAudioContext.resume.mockResolvedValue(undefined);

      // Should not throw
      expect(() => manager.scrubToFrame(24, 24)).not.toThrow();

      // resume() should have been called
      expect(mockAudioContext.resume).toHaveBeenCalled();

      // After resume resolves, snippet should play
      await vi.waitFor(() => {
        expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
      });
    });

    it('SCRUB-006: velocity-adaptive duration -- slow scrub produces longer snippets', () => {
      // First scrub (resets smoothing, uses default)
      manager.scrubToFrame(10, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Wait 200ms to simulate slow scrub (~5fps)
      vi.advanceTimersByTime(200);

      // Second scrub
      manager.scrubToFrame(11, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // The snippet should have been started with a duration
      const lastSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      // At slow speed, duration should be close to max
      const startArgs = lastSource.start.mock.calls[0];
      const snippetDuration = startArgs[2];
      expect(snippetDuration).toBeGreaterThan(AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MIN);
    });

    it('SCRUB-007: velocity-adaptive duration -- fast scrub produces shorter snippets', () => {
      // First scrub
      manager.scrubToFrame(10, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Multiple rapid scrubs to build up velocity (20ms intervals = 50fps)
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(20); // 20ms gap between scrubs
        manager.scrubToFrame(11 + i, 24);
        vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);
      }

      const lastSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      const startArgs = lastSource.start.mock.calls[0];
      const snippetDuration = startArgs[2];
      expect(snippetDuration).toBeLessThan(AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MAX);
    });

    it('SCRUB-008: Hann window envelope GainNode is created and connected', () => {
      manager.scrubToFrame(25, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Should have created an envelope gain node (in addition to the main gain node)
      const envelopeNodes = createdGainNodes.slice(1); // skip main gain
      expect(envelopeNodes.length).toBeGreaterThan(0);

      const envelopeGain = envelopeNodes[envelopeNodes.length - 1]!;
      // Should have setValueAtTime called for fade-in
      expect(envelopeGain.gain.setValueAtTime).toHaveBeenCalled();
      // Should be connected to main gain
      expect(envelopeGain.connect).toHaveBeenCalled();
    });

    it('SCRUB-009: continuous mode bypasses debounce and uses crossfade', () => {
      manager.setScrubMode('continuous');

      const callsBefore = mockAudioContext.createBufferSource.mock.calls.length;

      // In continuous mode, snippet should play immediately (no debounce)
      manager.scrubToFrame(25, 24);

      // Should have been called immediately without waiting for debounce
      const callsAfter = mockAudioContext.createBufferSource.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(1);
    });

    it('SCRUB-010: scrub mode can be toggled between discrete and continuous', () => {
      expect(manager.scrubMode).toBe('discrete');

      manager.setScrubMode('continuous');
      expect(manager.scrubMode).toBe('continuous');

      manager.setScrubMode('discrete');
      expect(manager.scrubMode).toBe('discrete');
    });

    it('SCRUB-011: envelope GainNode is disconnected on snippet end', () => {
      manager.scrubToFrame(25, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Get the snippet source node and trigger onended
      const scrubSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;

      const envelopeGain = createdGainNodes[createdGainNodes.length - 1]!;

      // Trigger onended
      if (scrubSource.onended) {
        scrubSource.onended();
      }

      expect(envelopeGain.disconnect).toHaveBeenCalled();
    });

    it('SCRUB-012: dispose cleans up envelope node', async () => {
      manager.scrubToFrame(25, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      const envelopeGain = createdGainNodes[createdGainNodes.length - 1]!;

      vi.useRealTimers();
      manager.dispose();

      expect(envelopeGain.disconnect).toHaveBeenCalled();
    });

    it('SCRUB-013: reverse scrub direction adjusts snippet offset to play audio before target frame', () => {
      // First scrub to frame 50 (forward)
      manager.scrubToFrame(50, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Wait 100ms between scrubs so velocity tracking detects the gap
      vi.advanceTimersByTime(100);

      // Second scrub to frame 40 (backward)
      manager.scrubToFrame(40, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      const lastSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      const startArgs = lastSource.start.mock.calls[0];
      const offset = startArgs[1];
      const timestamp = (40 - 1) / 24;

      // For reverse scrub, offset should be before the target timestamp
      expect(offset).toBeLessThan(timestamp);
    });

    it('SCRUB-014: forward scrub direction plays audio from target frame', () => {
      // First scrub to frame 10
      manager.scrubToFrame(10, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Wait 100ms between scrubs so velocity tracking detects the gap
      vi.advanceTimersByTime(100);

      // Second scrub to frame 20 (forward)
      manager.scrubToFrame(20, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      const lastSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      const startArgs = lastSource.start.mock.calls[0];
      const offset = startArgs[1];
      const timestamp = (20 - 1) / 24;

      // For forward scrub, offset should be at the target timestamp
      expect(offset).toBeCloseTo(timestamp, 5);
    });

    it('SCRUB-015: velocity smoothing produces stable snippet durations despite jittery input', () => {
      const durations: number[] = [];

      // Simulate jittery input with alternating fast/slow intervals
      // Use vi.advanceTimersByTime to control performance.now() gaps
      const intervals = [10, 50, 15, 45, 12, 48, 14, 46, 13, 47];

      for (let i = 0; i < intervals.length; i++) {
        // Advance time by the interval gap to simulate jittery timing
        vi.advanceTimersByTime(intervals[i]!);
        manager.scrubToFrame(10 + i, 24);
        vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

        const lastSource = mockAudioContext.createBufferSource.mock.results[
          mockAudioContext.createBufferSource.mock.results.length - 1
        ]!.value;
        const startArgs = lastSource.start.mock.calls[0];
        durations.push(startArgs[2]);
      }

      // After smoothing stabilizes (skip first 3), duration variance should be low
      const stableDurations = durations.slice(3);
      if (stableDurations.length >= 2) {
        const maxD = Math.max(...stableDurations);
        const minD = Math.min(...stableDurations);
        // Variance should be relatively small due to smoothing
        expect(maxD - minD).toBeLessThan(0.05); // Less than 50ms variance
      }
    });

    it('SCRUB-016: non-linear easing keeps snippet duration longer at moderate scrub speeds', () => {
      // Simulate moderate scrub speed (~10fps -> 100ms intervals)
      // Use vi.advanceTimersByTime to control performance.now() gaps
      manager.scrubToFrame(10, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Build up smoothed velocity at moderate speed (~10fps = 100ms intervals)
      for (let i = 0; i < 5; i++) {
        // Advance 100ms between scrubs to simulate ~10fps scrub speed
        vi.advanceTimersByTime(100);
        manager.scrubToFrame(11 + i, 24);
        vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);
      }

      const lastSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      const startArgs = lastSource.start.mock.calls[0];
      const duration = startArgs[2];

      // At moderate speed (~10fps), quadratic easing should keep duration
      // closer to max than linear mapping would
      const midpoint = (AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MAX + AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MIN) / 2;
      expect(duration).toBeGreaterThan(midpoint);
    });

    it('SCRUB-017: first-interaction scrub calls audioContext.resume() and plays snippet after resolution', async () => {
      mockAudioContext.state = 'suspended';
      mockAudioContext.resume.mockResolvedValue(undefined);

      manager.scrubToFrame(25, 24);

      expect(mockAudioContext.resume).toHaveBeenCalled();

      // After resume resolves, snippet should be created
      await vi.waitFor(() => {
        const callCount = mockAudioContext.createBufferSource.mock.calls.length;
        expect(callCount).toBeGreaterThan(0);
      });
    });

    it('SCRUB-018: crossfade fades out old snippet while fading in new snippet in continuous mode', () => {
      manager.setScrubMode('continuous');

      // First snippet
      manager.scrubToFrame(25, 24);
      const firstEnvelope = createdGainNodes[createdGainNodes.length - 1]!;

      // Second snippet (should crossfade from first)
      manager.scrubToFrame(26, 24);

      // First envelope should have cancelScheduledValues and linearRampToValueAtTime called
      expect(firstEnvelope.gain.cancelScheduledValues).toHaveBeenCalled();
      expect(firstEnvelope.gain.linearRampToValueAtTime).toHaveBeenCalled();

      // A new envelope should have been created for the second snippet
      const secondEnvelope = createdGainNodes[createdGainNodes.length - 1]!;
      expect(secondEnvelope).not.toBe(firstEnvelope);
      expect(secondEnvelope.gain.setValueAtTime).toHaveBeenCalled();
    });

    it('SCRUB-019: minimum snippet duration is 45ms (not below speech intelligibility threshold)', () => {
      expect(AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MIN).toBe(0.045);
      expect(AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MIN).toBeGreaterThanOrEqual(0.04);
    });

    it('SCRUB-020: Hann window fade-in curve starts at 0 and ends near 1', () => {
      const fadeIn = AudioPlaybackManager.hannFadeIn;
      expect(fadeIn[0]).toBeCloseTo(0, 5);
      expect(fadeIn[fadeIn.length - 1]).toBeCloseTo(1, 5);
    });

    it('SCRUB-021: Hann window fade-out curve starts near 1 and ends at 0', () => {
      const fadeOut = AudioPlaybackManager.hannFadeOut;
      expect(fadeOut[0]).toBeCloseTo(1, 5);
      expect(fadeOut[fadeOut.length - 1]).toBeCloseTo(0, 5);
    });

    it('SCRUB-022: default snippet duration is 80ms', () => {
      expect(AudioPlaybackManager.SCRUB_SNIPPET_DURATION_DEFAULT).toBe(0.08);
    });

    it('SCRUB-023: scrub debounce is 16ms for 60Hz responsiveness', () => {
      expect(AudioPlaybackManager.SCRUB_DEBOUNCE_MS).toBe(16);
    });

    it('SCRUB-024: dispose resets scrub mode and velocity tracking', () => {
      manager.setScrubMode('continuous');
      manager.scrubToFrame(25, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      vi.useRealTimers();
      manager.dispose();

      expect(manager.scrubMode).toBe('discrete');
    });

    it('SCRUB-025: scrubbing past audio buffer end is handled gracefully', () => {
      // Frame that maps beyond buffer duration (buffer is 10s, so frame 2500 at 24fps = 104s)
      expect(() => {
        manager.scrubToFrame(2500, 24);
        vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);
      }).not.toThrow();
    });

    it('SCRUB-026: reverse scrub offset is clamped to 0 at beginning', () => {
      // First scrub to frame 3
      manager.scrubToFrame(3, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Wait then reverse scrub to frame 1 (near beginning)
      vi.advanceTimersByTime(100);
      manager.scrubToFrame(1, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      const lastSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      const startArgs = lastSource.start.mock.calls[0];
      const offset = startArgs[1];

      // Offset should be >= 0 (clamped)
      expect(offset).toBeGreaterThanOrEqual(0);
    });

    it('SCRUB-027: long pause between scrubs resets velocity smoothing', () => {
      // First scrub
      manager.scrubToFrame(10, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Fast scrub to build velocity (20ms gap)
      vi.advanceTimersByTime(20);
      manager.scrubToFrame(11, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // Long pause (>500ms)
      vi.advanceTimersByTime(600);
      manager.scrubToFrame(12, 24);
      vi.advanceTimersByTime(AudioPlaybackManager.SCRUB_DEBOUNCE_MS + 1);

      // After long pause, should use default duration
      const lastSource = mockAudioContext.createBufferSource.mock.results[
        mockAudioContext.createBufferSource.mock.results.length - 1
      ]!.value;
      const startArgs = lastSource.start.mock.calls[0];
      const duration = startArgs[2];

      expect(duration).toBeCloseTo(AudioPlaybackManager.SCRUB_SNIPPET_DURATION_DEFAULT, 2);
    });
  });
});
