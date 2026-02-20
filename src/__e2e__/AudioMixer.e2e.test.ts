/**
 * AudioMixer E2E Integration Tests
 *
 * Verifies the full wiring of the AudioMixer feature end-to-end:
 *   App constructor -> AudioMixer instantiation
 *   mount() -> lazy AudioContext init on first user interaction
 *   session.playbackChanged -> play(frameTime) / stop()
 *   dispose -> audioMixer.dispose()
 *
 * Also validates:
 * - Lazy init pattern correctness (browser AudioContext policy compliance)
 * - { once: true } + removeEventListener redundancy
 * - Missing audio track loading wiring (sourceLoaded gap)
 * - Missing volume control <-> AudioMixer wiring
 * - Missing waveform data -> Timeline wiring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioMixer } from '../audio/AudioMixer';
import { EventEmitter } from '../utils/EventEmitter';

// ---------------------------------------------------------------------------
// Minimal stubs that reproduce App.ts wiring
// ---------------------------------------------------------------------------

interface StubSessionEvents {
  playbackChanged: boolean;
  frameChanged: void;
  sourceLoaded: void;
  [key: string]: unknown;
}

class StubSession extends EventEmitter<StubSessionEvents> {
  currentFrame = 1;
  fps = 24;
  isPlaying = false;
  frameCount = 100;
}

/**
 * Reproduce the wiring logic from App.ts constructor (lines 290-298)
 * and mount() (lines 367-375) as closely as possible.
 *
 * We mock `initialize()` because jsdom lacks a real AudioContext.
 */
function createAudioMixerWiring() {
  const session = new StubSession();
  const audioMixer = new AudioMixer();
  let audioInitialized = false;

  // Mock initialize since there is no real AudioContext in jsdom
  vi.spyOn(audioMixer, 'initialize').mockResolvedValue(undefined);

  // --- Constructor wiring (App.ts lines 291-298) ---
  session.on('playbackChanged', (playing: boolean) => {
    if (!audioInitialized) return;
    if (playing) {
      const frameTime = session.currentFrame / (session.fps || 24);
      audioMixer.play(frameTime);
    } else {
      audioMixer.stop();
    }
  });

  // --- mount() wiring (App.ts lines 367-375) ---
  const initAudio = () => {
    if (audioInitialized) return;
    audioInitialized = true;
    audioMixer.initialize().catch(() => { /* AudioContext may be unavailable */ });
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });

  return {
    session,
    audioMixer,
    initAudio,
    getAudioInitialized: () => audioInitialized,
    dispose: () => {
      // Remove listeners first in case they have not fired
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
      // AudioMixer.dispose() is safe since we mocked initialize
      // (audioContext is still null, so close() is never called)
      audioMixer.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioMixer E2E Integration', () => {
  let ctx: ReturnType<typeof createAudioMixerWiring>;

  beforeEach(() => {
    ctx = createAudioMixerWiring();
  });

  afterEach(() => {
    ctx.dispose();
  });

  // =========================================================================
  // 1. Lazy AudioContext initialization
  // =========================================================================
  describe('lazy AudioContext initialization (browser policy)', () => {
    it('AUDIO-E2E-001: AudioMixer is created but not initialized before user interaction', () => {
      expect(ctx.audioMixer).toBeInstanceOf(AudioMixer);
      expect(ctx.getAudioInitialized()).toBe(false);
    });

    it('AUDIO-E2E-002: click event triggers initialization', () => {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(ctx.getAudioInitialized()).toBe(true);
    });

    it('AUDIO-E2E-003: keydown event triggers initialization', () => {
      // Create fresh context since previous click may have initialized
      ctx.dispose();
      ctx = createAudioMixerWiring();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(ctx.getAudioInitialized()).toBe(true);
    });

    it('AUDIO-E2E-004: initialization happens only once even with multiple interactions', () => {
      // First trigger
      ctx.initAudio();
      expect(ctx.audioMixer.initialize).toHaveBeenCalledTimes(1);
      // Second trigger should be no-op
      ctx.initAudio();
      expect(ctx.audioMixer.initialize).toHaveBeenCalledTimes(1);
    });

    it('AUDIO-E2E-005: { once: true } + removeEventListener is redundant but harmless', () => {
      // The { once: true } option on addEventListener means the browser automatically
      // removes the listener after the first invocation. The explicit
      // removeEventListener calls inside initAudio are therefore redundant for the
      // triggered event type but serve as a safety net for the OTHER listener.
      //
      // Example: if click fires first, { once: true } removes the click listener,
      // but the keydown listener is still registered. The explicit
      // removeEventListener('keydown', initAudio) inside initAudio correctly cleans
      // it up. Without the explicit remove, the keydown listener would fire once
      // more (calling initAudio, which early-returns due to the guard).
      //
      // This is correct behavior - the redundancy on the SAME event is harmless,
      // and the cross-removal of the OTHER event is necessary.

      const removeSpy = vi.spyOn(document, 'removeEventListener');

      ctx.initAudio();

      // Both listeners are explicitly removed
      expect(removeSpy).toHaveBeenCalledWith('click', ctx.initAudio);
      expect(removeSpy).toHaveBeenCalledWith('keydown', ctx.initAudio);
      removeSpy.mockRestore();
    });

    it('AUDIO-E2E-006: initialize failure is swallowed silently', async () => {
      // Simulates AudioContext being unavailable
      vi.spyOn(ctx.audioMixer, 'initialize').mockRejectedValue(new Error('not supported'));
      // Should not throw
      ctx.initAudio();
      // Give the promise time to reject
      await new Promise((r) => setTimeout(r, 10));
      expect(ctx.getAudioInitialized()).toBe(true);
    });
  });

  // =========================================================================
  // 2. Playback wiring: session.playbackChanged -> play/stop
  // =========================================================================
  describe('playback wiring', () => {
    beforeEach(() => {
      // Force initialization
      ctx.initAudio();
    });

    it('AUDIO-E2E-010: playbackChanged(true) calls play() with correct frameTime', () => {
      const playSpy = vi.spyOn(ctx.audioMixer, 'play');
      ctx.session.currentFrame = 48;
      ctx.session.fps = 24;

      ctx.session.emit('playbackChanged', true);

      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(playSpy).toHaveBeenCalledWith(2); // 48 / 24 = 2.0 seconds
    });

    it('AUDIO-E2E-011: playbackChanged(false) calls stop()', () => {
      const stopSpy = vi.spyOn(ctx.audioMixer, 'stop');

      ctx.session.emit('playbackChanged', false);

      expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    it('AUDIO-E2E-012: playbackChanged is ignored before audio initialization', () => {
      ctx.dispose();
      ctx = createAudioMixerWiring();

      const playSpy = vi.spyOn(ctx.audioMixer, 'play');

      // Audio not initialized yet
      ctx.session.emit('playbackChanged', true);

      expect(playSpy).not.toHaveBeenCalled();
    });

    it('AUDIO-E2E-013: frameTime calculation handles fps=0 edge case', () => {
      const playSpy = vi.spyOn(ctx.audioMixer, 'play');
      ctx.session.currentFrame = 48;
      ctx.session.fps = 0; // edge case: fps might be 0 before media loads

      ctx.session.emit('playbackChanged', true);

      // fps || 24 fallback should produce 48/24 = 2
      expect(playSpy).toHaveBeenCalledWith(2);
    });

    it('AUDIO-E2E-014: frameTime uses actual fps when available', () => {
      const playSpy = vi.spyOn(ctx.audioMixer, 'play');
      ctx.session.currentFrame = 30;
      ctx.session.fps = 30;

      ctx.session.emit('playbackChanged', true);

      expect(playSpy).toHaveBeenCalledWith(1); // 30 / 30 = 1.0 seconds
    });

    it('AUDIO-E2E-015: rapid play/stop cycles work correctly', () => {
      const playSpy = vi.spyOn(ctx.audioMixer, 'play');
      const stopSpy = vi.spyOn(ctx.audioMixer, 'stop');

      ctx.session.emit('playbackChanged', true);
      ctx.session.emit('playbackChanged', false);
      ctx.session.emit('playbackChanged', true);
      ctx.session.emit('playbackChanged', false);

      expect(playSpy).toHaveBeenCalledTimes(2);
      // stop() is called twice directly from the playbackChanged(false) handler.
      // Note: play() also calls this.stop() internally, but since audioContext
      // is null (mocked initialize), play() returns early at the `if (!this.audioContext)`
      // guard before calling stop(). So stop count = 2, not 4.
      expect(stopSpy).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 3. Dispose wiring
  // =========================================================================
  describe('dispose', () => {
    it('AUDIO-E2E-020: dispose calls audioMixer.dispose()', () => {
      const disposeSpy = vi.spyOn(ctx.audioMixer, 'dispose');

      ctx.dispose();

      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('AUDIO-E2E-021: dispose can be called multiple times without error', () => {
      expect(() => {
        ctx.dispose();
        // Second call: audioMixer.dispose() is called again, which is safe
        // (all internal refs are already null)
        ctx.audioMixer.dispose();
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 4. MISSING WIRING: audio track loading from sources
  // =========================================================================
  describe('[GAP] audio track loading from sources', () => {
    it('AUDIO-E2E-030: [DOCUMENTS GAP] no wiring exists for sourceLoaded -> audio track discovery', () => {
      // The plan says: "on sourceLoaded, check for audio tracks, create mixer
      // tracks, load buffers." This wiring does NOT exist in App.ts.
      //
      // Currently, no code calls:
      //   audioMixer.addTrack(...)
      //   audioMixer.loadTrackBuffer(...)
      //
      // The AudioMixer is instantiated and wired for play/stop, but no audio
      // data is ever loaded into it. This means audio playback is completely
      // non-functional even though the infrastructure exists.
      //
      // Expected wiring in App.ts (not implemented):
      //   session.on('sourceLoaded', () => {
      //     const source = session.currentSource;
      //     if (source?.audioTracks) {
      //       for (const track of source.audioTracks) {
      //         audioMixer.addTrack({ id: track.id, label: track.label });
      //         audioMixer.loadTrackBuffer(track.id, track.buffer);
      //       }
      //     }
      //   });

      // Verify the gap: session.sourceLoaded does not interact with audioMixer
      const addTrackSpy = vi.spyOn(ctx.audioMixer, 'addTrack');
      const loadBufferSpy = vi.spyOn(ctx.audioMixer, 'loadTrackBuffer');

      ctx.session.emit('sourceLoaded', undefined);

      expect(addTrackSpy).not.toHaveBeenCalled();
      expect(loadBufferSpy).not.toHaveBeenCalled();
    });

    it('AUDIO-E2E-031: [DOCUMENTS GAP] AudioMixer has 0 tracks after source load', () => {
      ctx.initAudio();
      ctx.session.emit('sourceLoaded', undefined);
      expect(ctx.audioMixer.getAllTracks()).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. MISSING WIRING: VolumeControl <-> AudioMixer
  // =========================================================================
  describe('[GAP] VolumeControl <-> AudioMixer', () => {
    it('AUDIO-E2E-040: [DOCUMENTS GAP] VolumeControl is wired to Session, not AudioMixer', () => {
      // The AppPlaybackWiring module wires:
      //   volumeControl.on('volumeChanged', (vol) => session.volume = vol)
      //   volumeControl.on('mutedChanged', (muted) => session.muted = muted)
      //
      // But there is NO wiring from:
      //   volumeControl.on('volumeChanged', (vol) => audioMixer.setMasterVolume(vol))
      //   volumeControl.on('mutedChanged', (muted) => audioMixer.setMasterMuted(muted))
      //
      // This means the AudioMixer master volume stays at 1.0 regardless of
      // the user's volume slider position. When audio track loading is eventually
      // implemented, the volume control will not affect AudioMixer output.

      expect(ctx.audioMixer.masterVolume).toBe(1);
      expect(ctx.audioMixer.masterMuted).toBe(false);
      // No mechanism exists in the current wiring to change these
    });
  });

  // =========================================================================
  // 6. MISSING WIRING: Waveform -> Timeline
  // =========================================================================
  describe('[GAP] waveform generation -> Timeline', () => {
    it('AUDIO-E2E-050: [DOCUMENTS GAP] waveformReady event is defined but never emitted or consumed', () => {
      // AudioMixer defines a 'waveformReady' event in AudioMixerEvents,
      // but there is no code that:
      // 1. Calls generateTrackWaveform() and emits 'waveformReady'
      // 2. Listens for 'waveformReady' on the AudioMixer instance
      // 3. Passes waveform data to the Timeline component
      //
      // The Timeline component has no integration point for audio waveform data.

      const waveformListener = vi.fn();
      ctx.audioMixer.on('waveformReady', waveformListener);

      // Even after simulating a full lifecycle, no waveform event fires
      ctx.initAudio();
      ctx.session.emit('sourceLoaded', undefined);
      ctx.session.emit('playbackChanged', true);
      ctx.session.emit('playbackChanged', false);

      expect(waveformListener).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. AudioMixer standalone functionality (sanity checks)
  // =========================================================================
  describe('AudioMixer standalone operations', () => {
    it('AUDIO-E2E-060: play() before initialize() is safe (no-op due to null audioContext)', () => {
      // audioMixer.audioContext is null (initialize was mocked, no real AudioContext)
      // play() checks `if (!this.audioContext) return;` as its first line
      expect(() => ctx.audioMixer.play(0)).not.toThrow();
    });

    it('AUDIO-E2E-061: stop() before initialize() is safe (no-op)', () => {
      expect(() => ctx.audioMixer.stop()).not.toThrow();
    });

    it('AUDIO-E2E-062: dispose() before initialize() is safe', () => {
      const freshMixer = new AudioMixer();
      expect(() => freshMixer.dispose()).not.toThrow();
    });

    it('AUDIO-E2E-063: play() early-returns when audioContext is null (no stop call)', () => {
      // When audioContext is null, play() returns at the first guard check
      // before calling this.stop(). This is correct behavior.
      const stopSpy = vi.spyOn(ctx.audioMixer, 'stop');

      ctx.audioMixer.play(0);

      // stop() is NOT called because play() returns early
      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('AUDIO-E2E-064: currentTime returns startOffset when not playing', () => {
      expect(ctx.audioMixer.currentTime).toBe(0);
    });

    it('AUDIO-E2E-065: generateTrackWaveform returns null for nonexistent track', () => {
      expect(ctx.audioMixer.generateTrackWaveform('nonexistent')).toBeNull();
    });

    it('AUDIO-E2E-066: getFrequencyData returns null before initialization', () => {
      expect(ctx.audioMixer.getFrequencyData()).toBeNull();
    });

    it('AUDIO-E2E-067: getTimeDomainData returns null before initialization', () => {
      expect(ctx.audioMixer.getTimeDomainData()).toBeNull();
    });
  });
});
