/**
 * AudioCoordinator Unit Tests
 *
 * Tests the dual audio pipeline routing: Web Audio API vs HTMLVideoElement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioCoordinator, type AudioCoordinatorCallbacks } from './AudioCoordinator';

describe('AudioCoordinator', () => {
  let coordinator: AudioCoordinator;
  let callbacks: AudioCoordinatorCallbacks;

  // Mock AudioContext & friends (needed by AudioPlaybackManager)
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

    vi.clearAllMocks();
    mockAudioContext.state = 'running';
    mockAudioContext.currentTime = 0;
    mockSourceNode.onended = null;
    mockSourceNode.buffer = null;
    mockSourceNode.playbackRate.value = 1;
    mockGainNode.gain.value = 1;

    coordinator = new AudioCoordinator();
    callbacks = { onAudioPathChanged: vi.fn() };
    coordinator.setCallbacks(callbacks);
  });

  afterEach(() => {
    coordinator.dispose();
    vi.unstubAllGlobals();
  });

  // ---- Helper: load audio so manager reaches 'ready' with Web Audio ----
  async function loadWebAudio(): Promise<void> {
    const video = document.createElement('video');
    video.src = 'test.mp4';
    coordinator.loadFromVideo(video, 0.7, false);
    // Wait for the async loadFromVideo chain to settle
    await vi.waitFor(() => {
      expect(coordinator.manager.state).toBe('ready');
    });
  }

  // ---- Helper: load audio in video-fallback mode ----
  async function loadVideoFallback(): Promise<HTMLVideoElement> {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')));

    const video = document.createElement('video');
    video.src = 'test.mp4';
    Object.defineProperty(video, 'duration', { value: 5, configurable: true });
    video.play = vi.fn().mockResolvedValue(undefined);
    video.pause = vi.fn();

    coordinator.loadFromVideo(video, 0.7, false);
    await vi.waitFor(() => {
      expect(coordinator.manager.state).toBe('ready');
    });
    return video;
  }

  // ======================================================================
  // Initialization
  // ======================================================================

  describe('initialization', () => {
    it('AC-001: isWebAudioActive is false before any audio is loaded', () => {
      expect(coordinator.isWebAudioActive).toBe(false);
    });

    it('AC-002: manager is accessible', () => {
      expect(coordinator.manager).toBeDefined();
      expect(coordinator.manager.state).toBe('idle');
    });
  });

  // ======================================================================
  // Loading
  // ======================================================================

  describe('loading', () => {
    it('AC-010: loadFromVideo sets volume and muted on the manager', async () => {
      await loadWebAudio();

      expect(coordinator.manager.volume).toBe(0.7);
      expect(coordinator.manager.muted).toBe(false);
    });

    it('AC-011: loadFromVideo with muted=true mutes the manager', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      coordinator.loadFromVideo(video, 0.5, true);
      await vi.waitFor(() => {
        expect(coordinator.manager.state).toBe('ready');
      });

      expect(coordinator.manager.muted).toBe(true);
    });

    it('AC-012: loadFromVideo handles extraction failure gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network')));

      const video = document.createElement('video');
      video.src = 'test.mp4';
      Object.defineProperty(video, 'duration', { value: 5, configurable: true });

      // Should not throw
      coordinator.loadFromVideo(video, 0.7, false);
      await vi.waitFor(() => {
        expect(coordinator.manager.state).toBe('ready');
      });
    });
  });

  // ======================================================================
  // Audio path decision — shouldUseWebAudio logic
  // ======================================================================

  describe('audio path decision', () => {
    it('AC-020: Web Audio is active at 1x speed with preservesPitch', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);

      expect(coordinator.isWebAudioActive).toBe(true);
    });

    it('AC-021: Web Audio is NOT active at 2x speed with preservesPitch', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 2, 1);

      // Web Audio should be paused because speed!=1 && preservesPitch
      expect(coordinator.isWebAudioActive).toBe(false);
    });

    it('AC-022: Web Audio IS active at 2x speed WITHOUT preservesPitch', async () => {
      await loadWebAudio();

      coordinator.onPreservesPitchChanged(false);
      coordinator.onPlaybackStarted(1, 24, 2, 1);

      expect(coordinator.isWebAudioActive).toBe(true);
    });

    it('AC-023: Web Audio is NOT active when in video-fallback mode', async () => {
      await loadVideoFallback();

      coordinator.onPlaybackStarted(1, 24, 1, 1);

      // Video fallback — isUsingWebAudio is false on the manager
      expect(coordinator.isWebAudioActive).toBe(false);
    });

    it('AC-024: switching speed from 1x to 2x pauses Web Audio', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);
      expect(coordinator.isWebAudioActive).toBe(true);

      coordinator.onSpeedChanged(2);

      expect(coordinator.isWebAudioActive).toBe(false);
      expect(callbacks.onAudioPathChanged).toHaveBeenCalled();
    });

    it('AC-025: switching speed from 2x back to 1x re-activates Web Audio', async () => {
      await loadWebAudio();

      // Start at 2x — no Web Audio
      coordinator.onPlaybackStarted(1, 24, 2, 1);
      expect(coordinator.isWebAudioActive).toBe(false);

      // Switch back to 1x
      coordinator.onSpeedChanged(1);

      expect(coordinator.isWebAudioActive).toBe(true);
    });

    it('AC-026: toggling preservesPitch during 2x playback switches audio path', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 2, 1);
      expect(coordinator.isWebAudioActive).toBe(false);

      // Disable preservesPitch — Web Audio should take over
      coordinator.onPreservesPitchChanged(false);
      expect(coordinator.isWebAudioActive).toBe(true);

      // Re-enable preservesPitch — back to video element
      coordinator.onPreservesPitchChanged(true);
      expect(coordinator.isWebAudioActive).toBe(false);
    });
  });

  // ======================================================================
  // Playback lifecycle
  // ======================================================================

  describe('playback lifecycle', () => {
    it('AC-030: onPlaybackStarted starts Web Audio at correct time', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(25, 24, 1, 1);

      // Time = (25-1)/24 = 1.0s
      expect(mockSourceNode.start).toHaveBeenCalledWith(0, 1);
      expect(coordinator.isWebAudioActive).toBe(true);
      expect(callbacks.onAudioPathChanged).toHaveBeenCalled();
    });

    it('AC-031: onPlaybackStopped pauses manager and notifies', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);
      coordinator.onPlaybackStopped();

      expect(coordinator.manager.isPlaying).toBe(false);
      expect(callbacks.onAudioPathChanged).toHaveBeenCalled();
    });

    it('AC-032: onPlaybackStopped is safe when not playing', () => {
      expect(() => coordinator.onPlaybackStopped()).not.toThrow();
    });
  });

  // ======================================================================
  // Frame changes
  // ======================================================================

  describe('frame changes', () => {
    it('AC-040: onFrameChanged during playback syncs Web Audio', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);
      vi.clearAllMocks();

      // During playback, sync to frame 49 → time = (49-1)/24 = 2.0
      coordinator.onFrameChanged(49, 24, true);

      // syncToTime should have been called (small drift — no restart)
      // isPlaying should still be true
      expect(coordinator.isWebAudioActive).toBe(true);
    });

    it('AC-041: onFrameChanged when not playing triggers scrub', async () => {
      vi.useFakeTimers();
      try {
        await loadWebAudio();

        coordinator.onFrameChanged(25, 24, false);

        // Advance past debounce
        vi.advanceTimersByTime(50);

        // Scrub should have created a buffer source for the snippet
        expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('AC-042: onFrameChanged during playback at 2x with preservesPitch does NOT sync Web Audio', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 2, 1);
      vi.clearAllMocks();

      // At 2x with preservesPitch, shouldUseWebAudio() is false
      coordinator.onFrameChanged(49, 24, true);

      // Should NOT have called play/syncToTime on the manager
      expect(mockSourceNode.start).not.toHaveBeenCalled();
    });

    it('AC-043: onFrameChanged restarts Web Audio after loop wrap (ended source)', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);

      // Simulate AudioBufferSourceNode.onended (loop wrap)
      if (mockSourceNode.onended) {
        mockSourceNode.onended();
      }

      vi.clearAllMocks();

      // Frame changed during playback — manager.isPlaying is false, so should restart
      coordinator.onFrameChanged(1, 24, true);

      expect(mockSourceNode.start).toHaveBeenCalled();
      expect(callbacks.onAudioPathChanged).toHaveBeenCalled();
    });
  });

  // ======================================================================
  // Setting changes
  // ======================================================================

  describe('setting changes', () => {
    it('AC-050: onVolumeChanged forwards to manager', async () => {
      await loadWebAudio();

      coordinator.onVolumeChanged(0.5);
      expect(coordinator.manager.volume).toBe(0.5);
    });

    it('AC-051: onMutedChanged forwards to manager', async () => {
      await loadWebAudio();

      coordinator.onMutedChanged(true);
      expect(coordinator.manager.muted).toBe(true);
    });

    it('AC-052: onDirectionChanged sets reverse playback and notifies', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);
      vi.clearAllMocks();

      coordinator.onDirectionChanged(-1);

      expect(callbacks.onAudioPathChanged).toHaveBeenCalled();
    });

    it('AC-053: onDirectionChanged does not notify when not playing', async () => {
      await loadWebAudio();

      coordinator.onDirectionChanged(-1);

      expect(callbacks.onAudioPathChanged).not.toHaveBeenCalled();
    });

    it('AC-054: onSpeedChanged forwards rate to manager', async () => {
      await loadWebAudio();

      coordinator.onSpeedChanged(1.5);

      // The manager should have received the rate change
      // (isPlaying is false so no activation)
      expect(callbacks.onAudioPathChanged).not.toHaveBeenCalled();
    });
  });

  // ======================================================================
  // Video element integration
  // ======================================================================

  describe('applyToVideoElement', () => {
    it('AC-060: mutes video when Web Audio is active', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);
      expect(coordinator.isWebAudioActive).toBe(true);

      const video = document.createElement('video');
      coordinator.applyToVideoElement(video, 0.8, false, 1);

      expect(video.volume).toBe(0);
      expect(video.muted).toBe(true);
    });

    it('AC-061: applies normal volume when Web Audio is NOT active', () => {
      // No audio loaded — Web Audio not active
      const video = document.createElement('video');
      coordinator.applyToVideoElement(video, 0.8, false, 1);

      expect(video.volume).toBe(0.8);
      expect(video.muted).toBe(false);
    });

    it('AC-062: mutes video during reverse playback (video element path)', () => {
      const video = document.createElement('video');
      coordinator.applyToVideoElement(video, 0.8, false, -1);

      expect(video.volume).toBe(0.8);
      expect(video.muted).toBe(true);
    });

    it('AC-063: respects muted flag on video element path', () => {
      const video = document.createElement('video');
      coordinator.applyToVideoElement(video, 0.8, true, 1);

      expect(video.volume).toBe(0.8);
      expect(video.muted).toBe(true);
    });

    it('AC-064: video is always muted when direction is reverse, regardless of audio path', async () => {
      await loadWebAudio();

      // Start playback in reverse — Web Audio is active at 1x
      coordinator.onPlaybackStarted(1, 24, 1, -1);

      const video = document.createElement('video');
      coordinator.applyToVideoElement(video, 0.8, false, -1);

      // Whether Web Audio is active or not, video must be muted in reverse
      expect(video.muted).toBe(true);
    });
  });

  // ======================================================================
  // Dispose
  // ======================================================================

  describe('dispose', () => {
    it('AC-070: dispose cleans up manager', async () => {
      await loadWebAudio();
      coordinator.onPlaybackStarted(1, 24, 1, 1);

      coordinator.dispose();

      expect(coordinator.manager.state).toBe('idle');
    });

    it('AC-071: methods are safe to call after dispose', () => {
      coordinator.dispose();

      expect(() => coordinator.onPlaybackStarted(1, 24, 1, 1)).not.toThrow();
      expect(() => coordinator.onPlaybackStopped()).not.toThrow();
      expect(() => coordinator.onFrameChanged(1, 24, false)).not.toThrow();
      expect(() => coordinator.onSpeedChanged(2)).not.toThrow();
      expect(() => coordinator.onDirectionChanged(-1)).not.toThrow();
      expect(() => coordinator.onVolumeChanged(0.5)).not.toThrow();
      expect(() => coordinator.onMutedChanged(true)).not.toThrow();
      expect(() => coordinator.onPreservesPitchChanged(false)).not.toThrow();
    });

    it('AC-072: callbacks are nulled after dispose', async () => {
      await loadWebAudio();

      coordinator.dispose();
      vi.clearAllMocks();

      // These should not call onAudioPathChanged since callbacks are nulled
      coordinator.onPlaybackStopped();
      expect(callbacks.onAudioPathChanged).not.toHaveBeenCalled();
    });
  });

  // ======================================================================
  // Edge cases
  // ======================================================================

  describe('edge cases', () => {
    it('AC-080: activateAppropriateAudioPath skips when manager is idle', () => {
      // Manager is 'idle' — no audio loaded
      coordinator.onPlaybackStarted(1, 24, 1, 1);

      // Should not crash, and Web Audio should not be active
      expect(coordinator.isWebAudioActive).toBe(false);
    });

    it('AC-081: no callbacks set — no crash', async () => {
      const coord = new AudioCoordinator();
      // Don't set callbacks

      // Should not throw
      expect(() => coord.onPlaybackStopped()).not.toThrow();
      expect(() => coord.onDirectionChanged(-1)).not.toThrow();

      coord.dispose();
    });

    it('AC-082: multiple rapid speed changes settle to correct state', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);
      expect(coordinator.isWebAudioActive).toBe(true);

      // Rapid speed changes
      coordinator.onSpeedChanged(2);   // should deactivate
      coordinator.onSpeedChanged(0.5); // should deactivate (!=1 && preservesPitch)
      coordinator.onSpeedChanged(1);   // should re-activate

      expect(coordinator.isWebAudioActive).toBe(true);
    });

    it('AC-083: frame 1 at 24fps maps to time 0', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);

      // (1-1)/24 = 0
      expect(mockSourceNode.start).toHaveBeenCalledWith(0, 0);
    });
  });

  // ======================================================================
  // Double audio prevention (suspended AudioContext race condition)
  // ======================================================================

  describe('double audio prevention', () => {
    it('AC-090: isWebAudioActive is true synchronously after onPlaybackStarted even when AudioContext is suspended', async () => {
      await loadWebAudio();

      // After loading, simulate AudioContext becoming suspended (browser policy)
      // and make resume() hang so manager.play() stays in-flight
      let resolveResume!: () => void;
      mockAudioContext.state = 'suspended';
      mockAudioContext.resume.mockReturnValue(new Promise<void>(r => { resolveResume = r; }));

      coordinator.onPlaybackStarted(1, 24, 1, 1);

      // manager.play() is awaiting audioContext.resume(), so manager.isPlaying is still false
      expect(coordinator.manager.isPlaying).toBe(false);
      // But isWebAudioActive must be true to prevent double audio
      expect(coordinator.isWebAudioActive).toBe(true);

      // Clean up — resolve the pending resume
      mockAudioContext.state = 'running';
      resolveResume();
      await vi.waitFor(() => {
        expect(coordinator.manager.isPlaying).toBe(true);
      });
    });

    it('AC-091: onAudioPathChanged callback fires with isWebAudioActive already true during suspended context', async () => {
      // This simulates the real Session flow:
      //   PlaybackEngine.play() → safeVideoPlay(video) → emit('playbackChanged')
      //   → Session handler → audioCoordinator.onPlaybackStarted()
      //     → activateAppropriateAudioPath() → onAudioPathChanged callback
      //     → Session.applyVolumeToVideo() reads isWebAudioActive
      //
      // The callback MUST see isWebAudioActive=true so the video gets muted.
      await loadWebAudio();

      let resolveResume!: () => void;
      mockAudioContext.state = 'suspended';
      mockAudioContext.resume.mockReturnValue(new Promise<void>(r => { resolveResume = r; }));

      // Record what isWebAudioActive returns inside the callback
      let activeInCallback: boolean | undefined;
      coordinator.setCallbacks({
        onAudioPathChanged: () => {
          activeInCallback = coordinator.isWebAudioActive;
        },
      });

      coordinator.onPlaybackStarted(1, 24, 1, 1);

      // The callback should have already fired synchronously, and seen isWebAudioActive=true
      expect(activeInCallback).toBe(true);

      // Clean up
      mockAudioContext.state = 'running';
      resolveResume();
      await vi.waitFor(() => {
        expect(coordinator.manager.isPlaying).toBe(true);
      });
    });

    it('AC-092: isWebAudioActive stays true during loop wrap (onended → restart)', async () => {
      await loadWebAudio();

      coordinator.onPlaybackStarted(1, 24, 1, 1);
      expect(coordinator.isWebAudioActive).toBe(true);

      // Simulate AudioBufferSourceNode.onended (loop wrap) — the real
      // AudioPlaybackManager wires this callback on line 249, so calling
      // it triggers real manager code that sets _isPlaying = false
      if (mockSourceNode.onended) {
        mockSourceNode.onended();
      }

      // manager.isPlaying is now false (source ended), but coordinator
      // is still in "playing" state — isWebAudioActive must stay true
      // so the video stays muted during the gap before restart
      expect(coordinator.manager.isPlaying).toBe(false);
      expect(coordinator.isWebAudioActive).toBe(true);
    });

    it('AC-093: isWebAudioActive is false when not playing even with Web Audio loaded', async () => {
      // Negative complement to AC-090: the fix must not make isWebAudioActive
      // always return true. When coordinator is not playing (before play or
      // after stop), isWebAudioActive must be false so the video element
      // produces audio normally.
      await loadWebAudio();

      // Audio is loaded, shouldUseWebAudio() would return true, but no
      // playback has been started → isWebAudioActive must be false
      expect(coordinator.manager.isUsingWebAudio).toBe(true);
      expect(coordinator.isWebAudioActive).toBe(false);

      // Start then stop — verify it transitions back to false
      coordinator.onPlaybackStarted(1, 24, 1, 1);
      expect(coordinator.isWebAudioActive).toBe(true);

      coordinator.onPlaybackStopped();
      expect(coordinator.isWebAudioActive).toBe(false);
    });

    it('AC-094: play/pause/play cycle with suspended context mutes video each time', async () => {
      // Verifies no state leaks across multiple play/pause cycles
      await loadWebAudio();

      // First play (context running) — straightforward
      coordinator.onPlaybackStarted(1, 24, 1, 1);
      expect(coordinator.isWebAudioActive).toBe(true);

      coordinator.onPlaybackStopped();
      expect(coordinator.isWebAudioActive).toBe(false);

      // Second play — context has become suspended (common on mobile
      // after the tab loses focus)
      let resolveResume!: () => void;
      mockAudioContext.state = 'suspended';
      mockAudioContext.resume.mockReturnValue(new Promise<void>(r => { resolveResume = r; }));

      coordinator.onPlaybackStarted(10, 24, 1, 1);

      // manager hasn't finished resuming, but coordinator must report active
      expect(coordinator.manager.isPlaying).toBe(false);
      expect(coordinator.isWebAudioActive).toBe(true);

      // After resume completes, still active
      mockAudioContext.state = 'running';
      resolveResume();
      await vi.waitFor(() => {
        expect(coordinator.manager.isPlaying).toBe(true);
      });
      expect(coordinator.isWebAudioActive).toBe(true);
    });

    it('AC-095: late audio load during playback immediately reports isWebAudioActive', async () => {
      // Simulates: user presses play before audio has finished loading.
      // loadFromVideo checks _isPlaying after load completes and calls
      // activateAppropriateAudioPath(). isWebAudioActive must be true
      // at that point so Session mutes the video.
      const video = document.createElement('video');
      video.src = 'test.mp4';

      // Start playback before audio is loaded
      coordinator.onPlaybackStarted(1, 24, 1, 1);

      // isWebAudioActive is false because no audio is loaded yet
      expect(coordinator.isWebAudioActive).toBe(false);

      // Record callback — this fires when loadFromVideo completes and
      // detects _isPlaying=true
      let activeInCallback: boolean | undefined;
      coordinator.setCallbacks({
        onAudioPathChanged: () => {
          activeInCallback = coordinator.isWebAudioActive;
        },
      });

      // Now audio finishes loading — since _isPlaying is true,
      // loadFromVideo triggers activateAppropriateAudioPath which
      // calls manager.play(), transitioning straight to 'playing'
      coordinator.loadFromVideo(video, 0.7, false);
      await vi.waitFor(() => {
        expect(coordinator.manager.isUsingWebAudio).toBe(true);
      });

      // The late-load path should have activated Web Audio and the
      // callback should see it as active
      expect(activeInCallback).toBe(true);
      expect(coordinator.isWebAudioActive).toBe(true);
    });
  });
});
