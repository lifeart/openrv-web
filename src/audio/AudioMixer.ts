/**
 * AudioMixer - Multi-track audio mixing pipeline with surround downmix
 * and waveform texture generation.
 *
 * Supports:
 * - Multiple audio tracks with independent volume and pan
 * - Channel mapping for surround sound (5.1/7.1 stereo downmix)
 * - Waveform data generation for timeline visualization
 * - Integration with Web Audio API for native resampling
 */

import { EventEmitter, EventMap } from '../utils/EventEmitter';
import { clamp } from '../utils/math';
import type { ManagerBase } from '../core/ManagerBase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioMixerEvents extends EventMap {
  trackAdded: AudioTrack;
  trackRemoved: string;
  trackChanged: AudioTrack;
  mixChanged: void;
  waveformReady: WaveformTextureData;
}

export interface AudioTrackConfig {
  /** Unique track identifier */
  id: string;
  /** Human-readable label */
  label?: string;
  /** Volume 0-1 */
  volume?: number;
  /** Pan -1 (left) to 1 (right) */
  pan?: number;
  /** Muted state */
  muted?: boolean;
  /** Solo state (only soloed tracks are heard) */
  solo?: boolean;
}

export interface AudioTrack extends Required<AudioTrackConfig> {
  /** The decoded audio buffer */
  buffer: AudioBuffer | null;
  /** Web Audio nodes for this track */
  gainNode: GainNode | null;
  panNode: StereoPannerNode | null;
  sourceNode: AudioBufferSourceNode | null;
}

/** Surround channel layout */
export type ChannelLayout = 'mono' | 'stereo' | '5.1' | '7.1';

/**
 * Standard ITU-R BS.775 downmix coefficients for 5.1 to stereo:
 *   L_out = L + 0.707*C + 0.707*Ls
 *   R_out = R + 0.707*C + 0.707*Rs
 *
 * For 7.1, rear channels are also mixed with 0.707 coefficient.
 */
export interface DownmixCoefficients {
  /** Center channel attenuation (default: 1/sqrt(2) ~ 0.707) */
  center: number;
  /** Surround channel attenuation (default: 1/sqrt(2) ~ 0.707) */
  surround: number;
  /** LFE channel attenuation (default: 0 - typically omitted) */
  lfe: number;
  /** Back surround attenuation for 7.1 (default: 1/sqrt(2) ~ 0.707) */
  back: number;
}

/** Waveform data suitable for rendering as a texture */
export interface WaveformTextureData {
  /** Left channel peaks (0-1 normalized) */
  left: Float32Array;
  /** Right channel peaks (0-1 normalized) */
  right: Float32Array;
  /** Number of peak samples */
  length: number;
  /** Duration in seconds */
  duration: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INV_SQRT2 = 1 / Math.sqrt(2); // ~0.7071

export const DEFAULT_DOWNMIX_COEFFICIENTS: DownmixCoefficients = {
  center: INV_SQRT2,
  surround: INV_SQRT2,
  lfe: 0,
  back: INV_SQRT2,
};

/** Default number of peaks per second for waveform generation */
const WAVEFORM_PEAKS_PER_SECOND = 100;

// ---------------------------------------------------------------------------
// Downmix functions (pure, stateless)
// ---------------------------------------------------------------------------

/**
 * Detect channel layout from channel count.
 */
export function detectChannelLayout(channelCount: number): ChannelLayout {
  switch (channelCount) {
    case 1: return 'mono';
    case 2: return 'stereo';
    case 6: return '5.1';
    case 8: return '7.1';
    default: return channelCount <= 2 ? 'stereo' : '5.1';
  }
}

/**
 * Downmix a 5.1 surround AudioBuffer to stereo Float32Arrays.
 *
 * Channel order (SMPTE): L, R, C, LFE, Ls, Rs
 *
 * @returns Tuple of [leftChannel, rightChannel] as Float32Arrays
 */
export function downmix51ToStereo(
  buffer: AudioBuffer,
  coefficients: DownmixCoefficients = DEFAULT_DOWNMIX_COEFFICIENTS,
): [Float32Array, Float32Array] {
  const length = buffer.length;
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const C = buffer.numberOfChannels > 2 ? buffer.getChannelData(2) : null;
  const LFE = buffer.numberOfChannels > 3 ? buffer.getChannelData(3) : null;
  const Ls = buffer.numberOfChannels > 4 ? buffer.getChannelData(4) : null;
  const Rs = buffer.numberOfChannels > 5 ? buffer.getChannelData(5) : null;

  for (let i = 0; i < length; i++) {
    let l = L[i]!;
    let r = R[i]!;

    if (C) {
      l += coefficients.center * C[i]!;
      r += coefficients.center * C[i]!;
    }
    if (LFE) {
      l += coefficients.lfe * LFE[i]!;
      r += coefficients.lfe * LFE[i]!;
    }
    if (Ls) {
      l += coefficients.surround * Ls[i]!;
    }
    if (Rs) {
      r += coefficients.surround * Rs[i]!;
    }

    left[i] = l;
    right[i] = r;
  }

  return [left, right];
}

/**
 * Downmix a 7.1 surround AudioBuffer to stereo Float32Arrays.
 *
 * Channel order (SMPTE): L, R, C, LFE, Ls, Rs, Lb, Rb
 */
export function downmix71ToStereo(
  buffer: AudioBuffer,
  coefficients: DownmixCoefficients = DEFAULT_DOWNMIX_COEFFICIENTS,
): [Float32Array, Float32Array] {
  const length = buffer.length;
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const C = buffer.numberOfChannels > 2 ? buffer.getChannelData(2) : null;
  const LFE = buffer.numberOfChannels > 3 ? buffer.getChannelData(3) : null;
  const Ls = buffer.numberOfChannels > 4 ? buffer.getChannelData(4) : null;
  const Rs = buffer.numberOfChannels > 5 ? buffer.getChannelData(5) : null;
  const Lb = buffer.numberOfChannels > 6 ? buffer.getChannelData(6) : null;
  const Rb = buffer.numberOfChannels > 7 ? buffer.getChannelData(7) : null;

  for (let i = 0; i < length; i++) {
    let l = L[i]!;
    let r = R[i]!;

    if (C) {
      l += coefficients.center * C[i]!;
      r += coefficients.center * C[i]!;
    }
    if (LFE) {
      l += coefficients.lfe * LFE[i]!;
      r += coefficients.lfe * LFE[i]!;
    }
    if (Ls) {
      l += coefficients.surround * Ls[i]!;
    }
    if (Rs) {
      r += coefficients.surround * Rs[i]!;
    }
    if (Lb) {
      l += coefficients.back * Lb[i]!;
    }
    if (Rb) {
      r += coefficients.back * Rb[i]!;
    }

    left[i] = l;
    right[i] = r;
  }

  return [left, right];
}

/**
 * Downmix any multi-channel audio to stereo.
 */
export function downmixToStereo(
  buffer: AudioBuffer,
  coefficients: DownmixCoefficients = DEFAULT_DOWNMIX_COEFFICIENTS,
): [Float32Array, Float32Array] {
  const layout = detectChannelLayout(buffer.numberOfChannels);

  switch (layout) {
    case 'mono': {
      const mono = buffer.getChannelData(0);
      return [new Float32Array(mono), new Float32Array(mono)];
    }
    case 'stereo':
      return [
        new Float32Array(buffer.getChannelData(0)),
        new Float32Array(buffer.getChannelData(1)),
      ];
    case '5.1':
      return downmix51ToStereo(buffer, coefficients);
    case '7.1':
      return downmix71ToStereo(buffer, coefficients);
  }
}

// ---------------------------------------------------------------------------
// Waveform generation (pure, stateless)
// ---------------------------------------------------------------------------

/**
 * Generate waveform peak data from stereo channel data.
 *
 * @param left - Left channel samples
 * @param right - Right channel samples
 * @param sampleRate - Audio sample rate
 * @param peaksPerSecond - Target peak density
 * @returns Waveform texture data
 */
export function generateWaveformData(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  duration: number,
  peaksPerSecond: number = WAVEFORM_PEAKS_PER_SECOND,
): WaveformTextureData {
  const totalPeaks = Math.max(1, Math.ceil(duration * peaksPerSecond));
  const samplesPerPeak = Math.max(1, Math.floor(left.length / totalPeaks));

  const leftPeaks = new Float32Array(totalPeaks);
  const rightPeaks = new Float32Array(totalPeaks);

  for (let i = 0; i < totalPeaks; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, left.length);

    let maxL = 0;
    let maxR = 0;

    for (let j = start; j < end; j++) {
      const al = Math.abs(left[j]!);
      const ar = Math.abs(right[j]!);
      if (al > maxL) maxL = al;
      if (ar > maxR) maxR = ar;
    }

    leftPeaks[i] = maxL;
    rightPeaks[i] = maxR;
  }

  return {
    left: leftPeaks,
    right: rightPeaks,
    length: totalPeaks,
    duration,
  };
}

// ---------------------------------------------------------------------------
// AudioMixer class
// ---------------------------------------------------------------------------

/**
 * AudioMixer manages multiple audio tracks with independent volume, pan,
 * and mute controls. Provides surround downmix and waveform generation.
 *
 * Usage:
 * ```ts
 * const mixer = new AudioMixer();
 * await mixer.initialize();
 * mixer.addTrack({ id: 'dialog', label: 'Dialog', volume: 0.8 });
 * await mixer.loadTrackBuffer('dialog', audioBuffer);
 * mixer.play();
 * ```
 */
export class AudioMixer extends EventEmitter<AudioMixerEvents> implements ManagerBase {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private tracks = new Map<string, AudioTrack>();
  private _masterVolume = 1;
  private _masterMuted = false;
  private _isPlaying = false;
  private _startTime = 0; // audioContext.currentTime when playback started
  private _startOffset = 0; // offset into the audio when playback started
  private downmixCoefficients: DownmixCoefficients = { ...DEFAULT_DOWNMIX_COEFFICIENTS };

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  get masterVolume(): number { return this._masterVolume; }
  get masterMuted(): boolean { return this._masterMuted; }
  get isPlaying(): boolean { return this._isPlaying; }

  /**
   * Initialize the audio context and master bus.
   */
  async initialize(): Promise<void> {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;

    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);

    this.updateMasterGain();

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.stop();

    for (const track of this.tracks.values()) {
      this.disconnectTrack(track);
    }
    this.tracks.clear();

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => { /* ignore */ });
      this.audioContext = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Track management
  // ---------------------------------------------------------------------------

  /**
   * Add a new track to the mixer.
   */
  addTrack(config: AudioTrackConfig): AudioTrack {
    if (this.tracks.has(config.id)) {
      throw new Error(`Track "${config.id}" already exists`);
    }

    const track: AudioTrack = {
      id: config.id,
      label: config.label ?? config.id,
      volume: config.volume ?? 1,
      pan: config.pan ?? 0,
      muted: config.muted ?? false,
      solo: config.solo ?? false,
      buffer: null,
      gainNode: null,
      panNode: null,
      sourceNode: null,
    };

    // Create audio nodes if context is available
    if (this.audioContext && this.masterGain) {
      track.gainNode = this.audioContext.createGain();
      track.panNode = this.audioContext.createStereoPanner();

      track.gainNode.connect(track.panNode);
      track.panNode.connect(this.masterGain);

      this.updateTrackGain(track);
      this.updateTrackPan(track);
    }

    this.tracks.set(config.id, track);
    this.emit('trackAdded', track);
    return track;
  }

  /**
   * Remove a track from the mixer.
   */
  removeTrack(id: string): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;

    this.disconnectTrack(track);
    this.tracks.delete(id);
    this.emit('trackRemoved', id);
    return true;
  }

  /**
   * Get a track by ID.
   */
  getTrack(id: string): AudioTrack | undefined {
    return this.tracks.get(id);
  }

  /**
   * Get all tracks.
   */
  getAllTracks(): AudioTrack[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Load an AudioBuffer into a track, performing surround downmix if needed.
   */
  loadTrackBuffer(id: string, buffer: AudioBuffer): void {
    const track = this.tracks.get(id);
    if (!track) throw new Error(`Track "${id}" not found`);

    // Store the buffer (may be multi-channel; downmix happens on playback)
    track.buffer = buffer;
    this.emit('trackChanged', track);
  }

  // ---------------------------------------------------------------------------
  // Track control
  // ---------------------------------------------------------------------------

  /**
   * Set volume for a specific track.
   */
  setTrackVolume(id: string, volume: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.volume = clamp(volume, 0, 1);
    this.updateTrackGain(track);
    this.emit('trackChanged', track);
  }

  /**
   * Set pan for a specific track.
   */
  setTrackPan(id: string, pan: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.pan = clamp(pan, -1, 1);
    this.updateTrackPan(track);
    this.emit('trackChanged', track);
  }

  /**
   * Set mute for a specific track.
   */
  setTrackMuted(id: string, muted: boolean): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.muted = muted;
    this.updateTrackGain(track);
    this.emit('trackChanged', track);
  }

  /**
   * Set solo for a specific track.
   */
  setTrackSolo(id: string, solo: boolean): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.solo = solo;
    // When solo changes, all tracks' gains need updating
    for (const t of this.tracks.values()) {
      this.updateTrackGain(t);
    }
    this.emit('trackChanged', track);
  }

  // ---------------------------------------------------------------------------
  // Master control
  // ---------------------------------------------------------------------------

  /**
   * Set master volume.
   */
  setMasterVolume(volume: number): void {
    this._masterVolume = clamp(volume, 0, 1);
    this.updateMasterGain();
    this.emit('mixChanged', undefined);
  }

  /**
   * Set master mute.
   */
  setMasterMuted(muted: boolean): void {
    this._masterMuted = muted;
    this.updateMasterGain();
    this.emit('mixChanged', undefined);
  }

  /**
   * Set custom downmix coefficients.
   */
  setDownmixCoefficients(coefficients: Partial<DownmixCoefficients>): void {
    this.downmixCoefficients = { ...this.downmixCoefficients, ...coefficients };
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  /**
   * Start playback of all tracks.
   */
  play(fromTime = 0): void {
    if (!this.audioContext) return;

    this.stop();

    this._startOffset = fromTime;
    this._startTime = this.audioContext.currentTime;
    this._isPlaying = true;

    for (const track of this.tracks.values()) {
      this.startTrackPlayback(track, fromTime);
    }
  }

  /**
   * Stop all playback.
   */
  stop(): void {
    this._isPlaying = false;

    for (const track of this.tracks.values()) {
      this.stopTrackPlayback(track);
    }
  }

  /**
   * Get the current playback time.
   */
  get currentTime(): number {
    if (!this._isPlaying || !this.audioContext) return this._startOffset;
    return this._startOffset + (this.audioContext.currentTime - this._startTime);
  }

  // ---------------------------------------------------------------------------
  // Waveform generation
  // ---------------------------------------------------------------------------

  /**
   * Generate waveform data for a specific track.
   */
  generateTrackWaveform(id: string, peaksPerSecond?: number): WaveformTextureData | null {
    const track = this.tracks.get(id);
    if (!track || !track.buffer) return null;

    const [left, right] = downmixToStereo(track.buffer, this.downmixCoefficients);
    return generateWaveformData(
      left,
      right,
      track.buffer.sampleRate,
      track.buffer.duration,
      peaksPerSecond,
    );
  }

  /**
   * Get frequency data from the analyser node (for visualization).
   * Returns a Uint8Array of frequency bin magnitudes (0-255).
   */
  getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }

  /**
   * Get time-domain waveform data from the analyser node.
   * Returns a Uint8Array of samples (128 = zero crossing).
   */
  getTimeDomainData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(data);
    return data;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private updateMasterGain(): void {
    if (!this.masterGain) return;
    this.masterGain.gain.value = this._masterMuted ? 0 : this._masterVolume;
  }

  private updateTrackGain(track: AudioTrack): void {
    if (!track.gainNode) return;

    // Check solo logic: if any track is soloed, only soloed tracks are heard
    const hasSolo = this.hasSoloedTrack();
    const audible = !track.muted && (!hasSolo || track.solo);

    track.gainNode.gain.value = audible ? track.volume : 0;
  }

  private updateTrackPan(track: AudioTrack): void {
    if (!track.panNode) return;
    track.panNode.pan.value = track.pan;
  }

  private hasSoloedTrack(): boolean {
    for (const track of this.tracks.values()) {
      if (track.solo) return true;
    }
    return false;
  }

  private startTrackPlayback(track: AudioTrack, fromTime: number): void {
    if (!this.audioContext || !track.buffer || !track.gainNode) return;

    // Stop existing source
    this.stopTrackPlayback(track);

    const source = this.audioContext.createBufferSource();
    source.buffer = track.buffer;
    source.connect(track.gainNode);
    source.start(0, clamp(fromTime, 0, track.buffer.duration));

    track.sourceNode = source;
  }

  private stopTrackPlayback(track: AudioTrack): void {
    if (track.sourceNode) {
      try {
        track.sourceNode.stop();
        track.sourceNode.disconnect();
      } catch { /* ignore already stopped */ }
      track.sourceNode = null;
    }
  }

  private disconnectTrack(track: AudioTrack): void {
    this.stopTrackPlayback(track);

    if (track.panNode) {
      track.panNode.disconnect();
      track.panNode = null;
    }
    if (track.gainNode) {
      track.gainNode.disconnect();
      track.gainNode = null;
    }
  }
}
