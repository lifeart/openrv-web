/**
 * AudioMixer E2E Integration Tests
 *
 * Verifies the wiring of the AudioMixer feature using a minimal stub
 * that reproduces the playback-related wiring from App.ts:
 *   App constructor -> AudioMixer instantiation
 *   mount() -> lazy AudioContext init on first user interaction
 *   session.playbackChanged -> play(frameTime) / stop()
 *   dispose -> audioMixer.dispose()
 *
 * Also validates:
 * - Lazy init pattern correctness (browser AudioContext policy compliance)
 * - { once: true } + removeEventListener redundancy
 * - AudioMixer standalone API safety
 *
 * Note on wiring coverage:
 * - sourceLoaded -> addTrack/loadTrackBuffer wiring EXISTS in App.ts (lines 371-408)
 *   but is not reproduced in this stub (requires fetch/decode mocking)
 * - VolumeControl <-> AudioMixer wiring EXISTS in AppPlaybackWiring.ts (lines 72-88)
 *   but is not reproduced in this stub
 * - Waveform -> Timeline wiring does NOT exist yet
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
  // 4. Audio track loading from sources
  // =========================================================================
  describe('audio track loading from sources', () => {
    it('AUDIO-E2E-030: sourceLoaded wiring exists in App.ts but is not reproduced in this stub', () => {
      // NOTE: App.ts (lines 371-408) DOES wire sourceLoaded -> addTrack/loadTrackBuffer.
      // The wiring fetches audio from the video source URL, decodes it via
      // AudioContext.decodeAudioData, and calls:
      //   audioMixer.addTrack({ id: trackId, label: source.name })
      //   audioMixer.loadTrackBuffer(trackId, audioBuffer)
      //
      // This test's stub does NOT reproduce that wiring because it would require
      // mocking fetch, AudioContext.decodeAudioData, and the source object shape.
      // The stub only covers the playbackChanged -> play/stop path.
      //
      // Integration coverage for the sourceLoaded path belongs in a full App
      // integration test, not this minimal wiring verification.

      const addTrackSpy = vi.spyOn(ctx.audioMixer, 'addTrack');
      const loadBufferSpy = vi.spyOn(ctx.audioMixer, 'loadTrackBuffer');

      // The stub has no sourceLoaded wiring, so these are not called
      ctx.session.emit('sourceLoaded', undefined);

      expect(addTrackSpy).not.toHaveBeenCalled();
      expect(loadBufferSpy).not.toHaveBeenCalled();
    });

    it('AUDIO-E2E-031: stub has 0 tracks (real App.ts loads tracks via sourceLoaded)', () => {
      ctx.initAudio();
      ctx.session.emit('sourceLoaded', undefined);
      // The stub does not replicate the sourceLoaded -> fetch -> decode -> addTrack chain.
      // In the real App.ts, tracks are loaded asynchronously when video sources are loaded.
      expect(ctx.audioMixer.getAllTracks()).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. VolumeControl <-> AudioMixer wiring
  // =========================================================================
  describe('VolumeControl <-> AudioMixer', () => {
    it('AUDIO-E2E-040: AppPlaybackWiring wires volume control to both Session and AudioMixer', () => {
      // AppPlaybackWiring.ts (lines 72-88) wires:
      //   volumeControl.on('volumeChanged', (vol) => {
      //     session.volume = vol;
      //     deps.getAudioMixer?.()?.setMasterVolume(vol);
      //   });
      //   volumeControl.on('mutedChanged', (muted) => {
      //     session.muted = muted;
      //     deps.getAudioMixer?.()?.setMasterMuted(muted);
      //   });
      //   session.on('volumeChanged', (vol) => {
      //     deps.getAudioMixer?.()?.setMasterVolume(vol);
      //   });
      //   session.on('mutedChanged', (muted) => {
      //     deps.getAudioMixer?.()?.setMasterMuted(muted);
      //   });
      //
      // This wiring was added to fix the gap originally documented here.
      // The stub does not replicate wirePlaybackControls, so we verify
      // the AudioMixer API is functional for when the real wiring calls it.

      expect(ctx.audioMixer.masterVolume).toBe(1);
      ctx.audioMixer.setMasterVolume(0.5);
      expect(ctx.audioMixer.masterVolume).toBe(0.5);

      expect(ctx.audioMixer.masterMuted).toBe(false);
      ctx.audioMixer.setMasterMuted(true);
      expect(ctx.audioMixer.masterMuted).toBe(true);
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
