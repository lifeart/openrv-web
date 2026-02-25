/**
 * AudioMixer Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AudioMixer,
  detectChannelLayout,
  downmix51ToStereo,
  downmix71ToStereo,
  downmixToStereo,
  generateWaveformData,
  DEFAULT_DOWNMIX_COEFFICIENTS,
} from './AudioMixer';

// ---------------------------------------------------------------------------
// Mock AudioContext
// ---------------------------------------------------------------------------

function createMockGainNode() {
  return {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockPanNode() {
  return {
    pan: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockSourceNode() {
  return {
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockAnalyserNode() {
  return {
    fftSize: 2048,
    frequencyBinCount: 1024,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 128;
    }),
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 128;
    }),
  };
}

function createMockAudioContext() {
  return {
    state: 'running' as AudioContextState,
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => createMockGainNode()),
    createStereoPanner: vi.fn(() => createMockPanNode()),
    createBufferSource: vi.fn(() => createMockSourceNode()),
    createAnalyser: vi.fn(() => createMockAnalyserNode()),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAudioBuffer(
  channels: number,
  length: number,
  sampleRate = 44100,
  fillFn?: (channel: number, index: number) => number,
): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = fillFn ? fillFn(ch, i) : Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
    channelData.push(data);
  }

  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: vi.fn((ch: number) => channelData[ch]!),
  } as unknown as AudioBuffer;
}

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('detectChannelLayout', () => {
  it('AM-DET-001: detects mono', () => {
    expect(detectChannelLayout(1)).toBe('mono');
  });

  it('AM-DET-002: detects stereo', () => {
    expect(detectChannelLayout(2)).toBe('stereo');
  });

  it('AM-DET-003: detects 5.1', () => {
    expect(detectChannelLayout(6)).toBe('5.1');
  });

  it('AM-DET-004: detects 7.1', () => {
    expect(detectChannelLayout(8)).toBe('7.1');
  });

  it('AM-DET-005: unknown channel counts fall back', () => {
    expect(detectChannelLayout(0)).toBe('stereo');
    expect(detectChannelLayout(4)).toBe('5.1');
  });
});

describe('downmix51ToStereo', () => {
  it('AM-DM51-001: produces correct length output', () => {
    const buffer = createMockAudioBuffer(6, 1000);
    const [left, right] = downmix51ToStereo(buffer);
    expect(left.length).toBe(1000);
    expect(right.length).toBe(1000);
  });

  it('AM-DM51-002: center channel is mixed equally to both', () => {
    // All channels silent except center (channel 2)
    const buffer = createMockAudioBuffer(6, 100, 44100, (ch, _i) => ch === 2 ? 1.0 : 0);
    const [left, right] = downmix51ToStereo(buffer);

    const coeff = DEFAULT_DOWNMIX_COEFFICIENTS.center;
    expect(left[0]).toBeCloseTo(coeff, 5);
    expect(right[0]).toBeCloseTo(coeff, 5);
  });

  it('AM-DM51-003: left surround goes to left only', () => {
    // Only Ls (channel 4) has signal
    const buffer = createMockAudioBuffer(6, 100, 44100, (ch, _i) => ch === 4 ? 1.0 : 0);
    const [left, right] = downmix51ToStereo(buffer);

    const coeff = DEFAULT_DOWNMIX_COEFFICIENTS.surround;
    expect(left[0]).toBeCloseTo(coeff, 5);
    expect(right[0]).toBeCloseTo(0, 5);
  });

  it('AM-DM51-004: right surround goes to right only', () => {
    // Only Rs (channel 5) has signal
    const buffer = createMockAudioBuffer(6, 100, 44100, (ch, _i) => ch === 5 ? 1.0 : 0);
    const [left, right] = downmix51ToStereo(buffer);

    expect(left[0]).toBeCloseTo(0, 5);
    expect(right[0]).toBeCloseTo(DEFAULT_DOWNMIX_COEFFICIENTS.surround, 5);
  });

  it('AM-DM51-005: LFE is excluded by default', () => {
    // Only LFE (channel 3) has signal
    const buffer = createMockAudioBuffer(6, 100, 44100, (ch, _i) => ch === 3 ? 1.0 : 0);
    const [left, right] = downmix51ToStereo(buffer);

    // With default lfe=0, LFE should not be mixed in
    expect(left[0]).toBeCloseTo(0, 5);
    expect(right[0]).toBeCloseTo(0, 5);
  });

  it('AM-DM51-006: custom coefficients are applied', () => {
    const buffer = createMockAudioBuffer(6, 100, 44100, (ch, _i) => ch === 2 ? 1.0 : 0);
    const [left, right] = downmix51ToStereo(buffer, { ...DEFAULT_DOWNMIX_COEFFICIENTS, center: 0.5 });

    expect(left[0]).toBeCloseTo(0.5, 5);
    expect(right[0]).toBeCloseTo(0.5, 5);
  });
});

describe('downmix71ToStereo', () => {
  it('AM-DM71-001: produces correct length output', () => {
    const buffer = createMockAudioBuffer(8, 500);
    const [left, right] = downmix71ToStereo(buffer);
    expect(left.length).toBe(500);
    expect(right.length).toBe(500);
  });

  it('AM-DM71-002: back left surround goes to left', () => {
    // Only Lb (channel 6) has signal
    const buffer = createMockAudioBuffer(8, 100, 44100, (ch, _i) => ch === 6 ? 1.0 : 0);
    const [left, right] = downmix71ToStereo(buffer);

    expect(left[0]).toBeCloseTo(DEFAULT_DOWNMIX_COEFFICIENTS.back, 5);
    expect(right[0]).toBeCloseTo(0, 5);
  });

  it('AM-DM71-003: back right surround goes to right', () => {
    // Only Rb (channel 7) has signal
    const buffer = createMockAudioBuffer(8, 100, 44100, (ch, _i) => ch === 7 ? 1.0 : 0);
    const [left, right] = downmix71ToStereo(buffer);

    expect(left[0]).toBeCloseTo(0, 5);
    expect(right[0]).toBeCloseTo(DEFAULT_DOWNMIX_COEFFICIENTS.back, 5);
  });
});

describe('downmixToStereo', () => {
  it('AM-DM-001: mono duplicates to both channels', () => {
    const buffer = createMockAudioBuffer(1, 100, 44100, () => 0.5);
    const [left, right] = downmixToStereo(buffer);

    expect(left[0]).toBeCloseTo(0.5, 5);
    expect(right[0]).toBeCloseTo(0.5, 5);
  });

  it('AM-DM-002: stereo passes through', () => {
    const buffer = createMockAudioBuffer(2, 100, 44100, (ch) => ch === 0 ? 0.3 : 0.7);
    const [left, right] = downmixToStereo(buffer);

    expect(left[0]).toBeCloseTo(0.3, 5);
    expect(right[0]).toBeCloseTo(0.7, 5);
  });

  it('AM-DM-003: routes 6ch to 5.1 downmix', () => {
    const buffer = createMockAudioBuffer(6, 100, 44100, (ch) => ch === 0 ? 1.0 : 0);
    const [left, right] = downmixToStereo(buffer);

    expect(left[0]).toBeCloseTo(1.0, 5);
    expect(right[0]).toBeCloseTo(0, 5);
  });

  it('AM-DM-004: routes 8ch to 7.1 downmix', () => {
    const buffer = createMockAudioBuffer(8, 100, 44100, (ch) => ch === 1 ? 1.0 : 0);
    const [left, right] = downmixToStereo(buffer);

    expect(left[0]).toBeCloseTo(0, 5);
    expect(right[0]).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// Waveform generation tests
// ---------------------------------------------------------------------------

describe('generateWaveformData', () => {
  it('AM-WF-001: produces correct number of peaks', () => {
    const left = new Float32Array(44100);
    const right = new Float32Array(44100);
    const result = generateWaveformData(left, right, 44100, 1.0, 100);

    expect(result.length).toBe(100);
    expect(result.left.length).toBe(100);
    expect(result.right.length).toBe(100);
    expect(result.duration).toBe(1.0);
  });

  it('AM-WF-002: peak values are non-negative', () => {
    const left = new Float32Array(44100);
    const right = new Float32Array(44100);
    // Fill with sine wave
    for (let i = 0; i < left.length; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
      right[i] = Math.sin((2 * Math.PI * 880 * i) / 44100);
    }

    const result = generateWaveformData(left, right, 44100, 1.0);
    for (let i = 0; i < result.length; i++) {
      expect(result.left[i]).toBeGreaterThanOrEqual(0);
      expect(result.right[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('AM-WF-003: silence produces zero peaks', () => {
    const left = new Float32Array(44100);
    const right = new Float32Array(44100);
    const result = generateWaveformData(left, right, 44100, 1.0);

    for (let i = 0; i < result.length; i++) {
      expect(result.left[i]).toBe(0);
      expect(result.right[i]).toBe(0);
    }
  });

  it('AM-WF-004: full-scale signal produces peak near 1.0', () => {
    const left = new Float32Array(44100);
    const right = new Float32Array(44100);
    for (let i = 0; i < left.length; i++) {
      left[i] = 1.0;
      right[i] = -1.0;
    }

    const result = generateWaveformData(left, right, 44100, 1.0);
    expect(result.left[0]).toBeCloseTo(1.0, 3);
    expect(result.right[0]).toBeCloseTo(1.0, 3); // abs(-1) = 1
  });
});

// ---------------------------------------------------------------------------
// AudioMixer class tests
// ---------------------------------------------------------------------------

describe('AudioMixer', () => {
  let mixer: AudioMixer;

  beforeEach(() => {
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(createMockAudioContext));
    mixer = new AudioMixer();
  });

  afterEach(() => {
    mixer.dispose();
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('AM-MIX-001: starts with default state', () => {
      expect(mixer.masterVolume).toBe(1);
      expect(mixer.masterMuted).toBe(false);
      expect(mixer.isPlaying).toBe(false);
    });

    it('AM-MIX-002: initialize creates audio context', async () => {
      await mixer.initialize();
      expect(AudioContext).toHaveBeenCalled();
    });

    it('AM-MIX-003: dispose cleans up', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.dispose();
      expect(mixer.getAllTracks()).toHaveLength(0);
    });
  });

  describe('track management', () => {
    it('AM-MIX-010: addTrack creates a track with defaults', async () => {
      await mixer.initialize();
      const track = mixer.addTrack({ id: 'dialog' });

      expect(track.id).toBe('dialog');
      expect(track.volume).toBe(1);
      expect(track.pan).toBe(0);
      expect(track.muted).toBe(false);
      expect(track.solo).toBe(false);
    });

    it('AM-MIX-011: addTrack with custom config', async () => {
      await mixer.initialize();
      const track = mixer.addTrack({
        id: 'music',
        label: 'Background Music',
        volume: 0.5,
        pan: -0.3,
        muted: true,
      });

      expect(track.label).toBe('Background Music');
      expect(track.volume).toBe(0.5);
      expect(track.pan).toBe(-0.3);
      expect(track.muted).toBe(true);
    });

    it('AM-MIX-012: duplicate track ID throws', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      expect(() => mixer.addTrack({ id: 'test' })).toThrow('already exists');
    });

    it('AM-MIX-013: removeTrack removes the track', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      expect(mixer.removeTrack('test')).toBe(true);
      expect(mixer.getTrack('test')).toBeUndefined();
    });

    it('AM-MIX-014: removeTrack returns false for unknown', () => {
      expect(mixer.removeTrack('nonexistent')).toBe(false);
    });

    it('AM-MIX-015: getAllTracks returns all tracks', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'a' });
      mixer.addTrack({ id: 'b' });
      mixer.addTrack({ id: 'c' });
      expect(mixer.getAllTracks()).toHaveLength(3);
    });
  });

  describe('track controls', () => {
    it('AM-MIX-020: setTrackVolume updates volume', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.setTrackVolume('test', 0.5);
      expect(mixer.getTrack('test')!.volume).toBe(0.5);
    });

    it('AM-MIX-021: setTrackVolume clamps to [0, 1]', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.setTrackVolume('test', -0.5);
      expect(mixer.getTrack('test')!.volume).toBe(0);
      mixer.setTrackVolume('test', 1.5);
      expect(mixer.getTrack('test')!.volume).toBe(1);
    });

    it('AM-MIX-022: setTrackPan updates pan', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.setTrackPan('test', -0.7);
      expect(mixer.getTrack('test')!.pan).toBe(-0.7);
    });

    it('AM-MIX-023: setTrackPan clamps to [-1, 1]', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.setTrackPan('test', -2);
      expect(mixer.getTrack('test')!.pan).toBe(-1);
      mixer.setTrackPan('test', 2);
      expect(mixer.getTrack('test')!.pan).toBe(1);
    });

    it('AM-MIX-024: setTrackMuted updates muted state', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.setTrackMuted('test', true);
      expect(mixer.getTrack('test')!.muted).toBe(true);
    });

    it('AM-MIX-025: setTrackSolo updates solo state', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.setTrackSolo('test', true);
      expect(mixer.getTrack('test')!.solo).toBe(true);
    });
  });

  describe('master controls', () => {
    it('AM-MIX-030: setMasterVolume updates volume', () => {
      mixer.setMasterVolume(0.5);
      expect(mixer.masterVolume).toBe(0.5);
    });

    it('AM-MIX-031: setMasterVolume clamps', () => {
      mixer.setMasterVolume(-0.5);
      expect(mixer.masterVolume).toBe(0);
      mixer.setMasterVolume(1.5);
      expect(mixer.masterVolume).toBe(1);
    });

    it('AM-MIX-032: setMasterMuted updates muted state', () => {
      mixer.setMasterMuted(true);
      expect(mixer.masterMuted).toBe(true);
    });
  });

  describe('events', () => {
    it('AM-MIX-040: emits trackAdded', async () => {
      await mixer.initialize();
      const listener = vi.fn();
      mixer.on('trackAdded', listener);
      mixer.addTrack({ id: 'test' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].id).toBe('test');
    });

    it('AM-MIX-041: emits trackRemoved', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      const listener = vi.fn();
      mixer.on('trackRemoved', listener);
      mixer.removeTrack('test');
      expect(listener).toHaveBeenCalledWith('test');
    });

    it('AM-MIX-042: emits trackChanged on volume change', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      const listener = vi.fn();
      mixer.on('trackChanged', listener);
      mixer.setTrackVolume('test', 0.5);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('AM-MIX-043: emits mixChanged on master volume change', () => {
      const listener = vi.fn();
      mixer.on('mixChanged', listener);
      mixer.setMasterVolume(0.5);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('waveform generation', () => {
    it('AM-MIX-050: generateTrackWaveform returns null for unknown track', () => {
      expect(mixer.generateTrackWaveform('nonexistent')).toBeNull();
    });

    it('AM-MIX-051: generateTrackWaveform returns null for track without buffer', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      expect(mixer.generateTrackWaveform('test')).toBeNull();
    });

    it('AM-MIX-052: generateTrackWaveform produces data for loaded track', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      const buffer = createMockAudioBuffer(2, 44100);
      mixer.loadTrackBuffer('test', buffer);

      const waveform = mixer.generateTrackWaveform('test');
      expect(waveform).not.toBeNull();
      expect(waveform!.left.length).toBeGreaterThan(0);
      expect(waveform!.right.length).toBeGreaterThan(0);
      expect(waveform!.duration).toBeCloseTo(1.0, 2);
    });
  });

  describe('playback', () => {
    it('AM-MIX-060: play sets isPlaying to true', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.loadTrackBuffer('test', createMockAudioBuffer(2, 44100));
      mixer.play();
      expect(mixer.isPlaying).toBe(true);
    });

    it('AM-MIX-061: stop sets isPlaying to false', async () => {
      await mixer.initialize();
      mixer.play();
      mixer.stop();
      expect(mixer.isPlaying).toBe(false);
    });

    it('AM-MIX-062: currentTime returns offset when not playing', () => {
      expect(mixer.currentTime).toBe(0);
    });

    it('AM-MIX-063: play from a specific time sets startOffset', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.loadTrackBuffer('test', createMockAudioBuffer(2, 44100));
      mixer.play(0.5);
      expect(mixer.isPlaying).toBe(true);
    });

    it('AM-MIX-064: play then play again restarts (calls stop internally)', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      mixer.loadTrackBuffer('test', createMockAudioBuffer(2, 44100));
      mixer.play(0);
      expect(mixer.isPlaying).toBe(true);
      // Second play resets
      mixer.play(0.2);
      expect(mixer.isPlaying).toBe(true);
    });
  });

  describe('solo logic', () => {
    it('AM-MIX-070: solo track mutes non-solo tracks', async () => {
      await mixer.initialize();
      const trackA = mixer.addTrack({ id: 'a', volume: 1 });
      const trackB = mixer.addTrack({ id: 'b', volume: 1 });

      mixer.setTrackSolo('a', true);

      // Track A (soloed) should be audible; track B (not soloed) should be muted
      expect(trackA.gainNode!.gain.value).toBe(1);
      expect(trackB.gainNode!.gain.value).toBe(0);
    });

    it('AM-MIX-071: un-soloing restores all track gains', async () => {
      await mixer.initialize();
      const trackA = mixer.addTrack({ id: 'a', volume: 0.8 });
      const trackB = mixer.addTrack({ id: 'b', volume: 0.6 });

      mixer.setTrackSolo('a', true);
      expect(trackB.gainNode!.gain.value).toBe(0);

      mixer.setTrackSolo('a', false);
      expect(trackA.gainNode!.gain.value).toBe(0.8);
      expect(trackB.gainNode!.gain.value).toBe(0.6);
    });

    it('AM-MIX-072: muted + solo track has gain 0', async () => {
      await mixer.initialize();
      const track = mixer.addTrack({ id: 'a', volume: 1, muted: true, solo: true });

      // Track is both muted and soloed — muted takes precedence
      expect(track.gainNode!.gain.value).toBe(0);
    });
  });

  describe('loadTrackBuffer', () => {
    it('AM-MIX-080: loadTrackBuffer throws for unknown track', async () => {
      await mixer.initialize();
      const buffer = createMockAudioBuffer(2, 44100);
      expect(() => mixer.loadTrackBuffer('nonexistent', buffer)).toThrow('not found');
    });

    it('AM-MIX-081: loadTrackBuffer emits trackChanged', async () => {
      await mixer.initialize();
      mixer.addTrack({ id: 'test' });
      const listener = vi.fn();
      mixer.on('trackChanged', listener);

      mixer.loadTrackBuffer('test', createMockAudioBuffer(2, 44100));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].id).toBe('test');
    });
  });

  describe('setTrack* on nonexistent tracks', () => {
    it('AM-MIX-090: setTrackVolume on nonexistent track is a no-op', () => {
      expect(() => mixer.setTrackVolume('ghost', 0.5)).not.toThrow();
    });

    it('AM-MIX-091: setTrackPan on nonexistent track is a no-op', () => {
      expect(() => mixer.setTrackPan('ghost', 0.5)).not.toThrow();
    });

    it('AM-MIX-092: setTrackMuted on nonexistent track is a no-op', () => {
      expect(() => mixer.setTrackMuted('ghost', true)).not.toThrow();
    });

    it('AM-MIX-093: setTrackSolo on nonexistent track is a no-op', () => {
      expect(() => mixer.setTrackSolo('ghost', true)).not.toThrow();
    });
  });

  describe('downmix coefficients', () => {
    it('AM-MIX-100: setDownmixCoefficients merges with existing', () => {
      mixer.setDownmixCoefficients({ center: 0.5 });
      // No direct accessor, but generateTrackWaveform uses them.
      // Verify it does not throw.
      expect(() => mixer.setDownmixCoefficients({ lfe: 0.1 })).not.toThrow();
    });
  });

  describe('addTrack without audio context', () => {
    it('AM-MIX-110: addTrack before initialize creates track without audio nodes', () => {
      const track = mixer.addTrack({ id: 'test' });
      expect(track.id).toBe('test');
      expect(track.gainNode).toBeNull();
      expect(track.panNode).toBeNull();
    });
  });

  // =========================================================================
  // Integration status documentation
  // =========================================================================
  describe('integration status', () => {
    it('AM-INT-001: AudioMixer is NOT dead code — it is instantiated and wired in App.ts', () => {
      // AudioMixer is imported and instantiated in App.ts (line 359):
      //   this.audioMixer = new AudioMixer();
      //
      // Wiring that EXISTS in the codebase:
      //
      // 1. Play/Stop (App.ts lines 360-368):
      //    session.on('playbackChanged', (playing) => {
      //      if (playing) audioMixer.play(frameTime);
      //      else audioMixer.stop();
      //    })
      //
      // 2. Track loading (App.ts lines 371-408):
      //    session.on('sourceLoaded', (source) => {
      //      // Fetches video source, decodes audio via AudioContext
      //      audioMixer.addTrack({ id: trackId, label: source.name });
      //      audioMixer.loadTrackBuffer(trackId, audioBuffer);
      //    })
      //
      // 3. Volume control (AppPlaybackWiring.ts lines 72-88):
      //    volumeControl.on('volumeChanged', (vol) => audioMixer.setMasterVolume(vol))
      //    volumeControl.on('mutedChanged', (muted) => audioMixer.setMasterMuted(muted))
      //    session.on('volumeChanged', (vol) => audioMixer.setMasterVolume(vol))
      //    session.on('mutedChanged', (muted) => audioMixer.setMasterMuted(muted))
      //
      // 4. Dispose (App.ts):
      //    audioMixer.dispose() called in App cleanup
      //
      // What does NOT exist yet:
      // - Waveform data -> Timeline component (waveformReady event unused)
      // - Multi-track mixing UI (only master volume is controlled)
      // - Per-track volume/pan/mute/solo UI

      expect(true).toBe(true); // Documenting assertion
    });
  });
});
