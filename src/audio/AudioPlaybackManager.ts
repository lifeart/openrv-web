/**
 * AudioPlaybackManager - Manages audio playback using Web Audio API
 *
 * This provides independent audio playback from video frames, enabling:
 * - Better sync with frame-accurate video playback (mediabunny)
 * - Muting during reverse playback
 * - Better error handling and recovery
 * - Audio scrubbing with velocity-adaptive duration, Hann window envelopes,
 *   reverse direction support, and crossfade in continuous mode
 */

import { EventEmitter, EventMap } from '../utils/EventEmitter';
import { clamp } from '../utils/math';
import type { ManagerBase } from '../core/ManagerBase';

export interface AudioPlaybackEvents extends EventMap {
  error: AudioPlaybackError;
  stateChanged: AudioPlaybackState;
  ended: void;
}

export interface AudioPlaybackError {
  type: 'autoplay' | 'decode' | 'network' | 'unknown';
  message: string;
  originalError?: Error;
}

export type AudioPlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

/** Scrub mode: 'discrete' for keyboard stepping, 'continuous' for timeline drag */
export type ScrubMode = 'discrete' | 'continuous';

export class AudioPlaybackManager extends EventEmitter<AudioPlaybackEvents> implements ManagerBase {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private _state: AudioPlaybackState = 'idle';
  private _volume = 0.7;
  private _muted = false;
  private _playbackRate = 1;
  private _currentTime = 0;
  private _duration = 0;
  private _isPlaying = false;
  private _startOffset = 0;
  private _startTime = 0;

  // For HTMLVideoElement fallback
  private videoElement: HTMLVideoElement | null = null;
  private useVideoFallback = false;

  // For audio scrubbing
  private scrubSourceNode: AudioBufferSourceNode | null = null;
  private scrubEnvelopeNode: GainNode | null = null;
  private scrubDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _scrubMode: ScrubMode = 'discrete';

  // Velocity tracking for adaptive snippet duration
  private lastScrubTime = 0;
  private lastScrubFrame = 0;
  private _smoothedScrubFps = 0;

  // Scrub constants
  static readonly SCRUB_SNIPPET_DURATION_MIN = 0.045;  // 45ms - fast scrub
  static readonly SCRUB_SNIPPET_DURATION_DEFAULT = 0.08; // 80ms - single step
  static readonly SCRUB_SNIPPET_DURATION_MAX = 0.12;  // 120ms - slow scrub
  static readonly SCRUB_DEBOUNCE_MS = 16; // ~1 frame at 60Hz
  static readonly SCRUB_FADE_DURATION = 0.005; // 5ms fade in/out
  static readonly SCRUB_CROSSFADE_DURATION = 0.004; // 4ms crossfade overlap

  // Pre-computed Hann window curves (shared across all snippets)
  static readonly HANN_WINDOW_SIZE = 64;
  static readonly hannFadeIn: Float32Array = (() => {
    const curve = new Float32Array(AudioPlaybackManager.HANN_WINDOW_SIZE);
    for (let i = 0; i < curve.length; i++) {
      curve[i] = 0.5 * (1 - Math.cos(Math.PI * i / (curve.length - 1)));
    }
    return curve;
  })();
  static readonly hannFadeOut: Float32Array = (() => {
    const curve = new Float32Array(AudioPlaybackManager.HANN_WINDOW_SIZE);
    for (let i = 0; i < curve.length; i++) {
      curve[i] = 0.5 * (1 + Math.cos(Math.PI * i / (curve.length - 1)));
    }
    return curve;
  })();

  get state(): AudioPlaybackState {
    return this._state;
  }

  get duration(): number {
    return this._duration;
  }

  get currentTime(): number {
    if (this._isPlaying && this.audioContext) {
      const elapsed = (this.audioContext.currentTime - this._startTime) * this._playbackRate;
      const time = this._startOffset + elapsed;
      // Clamp to valid range to prevent negative values
      return clamp(time, 0, this._duration);
    }
    return this._currentTime;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get volume(): number {
    return this._volume;
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Current scrub mode: 'discrete' for keyboard stepping, 'continuous' for timeline drag */
  get scrubMode(): ScrubMode {
    return this._scrubMode;
  }

  /**
   * Returns true when audio playback is handled via Web Audio API
   * (AudioBufferSourceNode), meaning the HTMLVideoElement should be muted
   * to prevent echo. Returns false when using video element fallback
   * or when no audio has been loaded yet.
   */
  get isUsingWebAudio(): boolean {
    return !this.useVideoFallback && this.audioBuffer !== null;
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initContext(): Promise<void> {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.updateGain();

      // Resume if suspended (autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    } catch (error) {
      this.handleError('unknown', 'Failed to initialize audio context', error as Error);
    }
  }

  /**
   * Load audio from a video file
   */
  async loadFromVideo(videoElement: HTMLVideoElement): Promise<boolean> {
    this.videoElement = videoElement;

    // Try to extract audio using Web Audio API
    const videoSrc = videoElement.src || videoElement.currentSrc;
    if (!videoSrc) {
      // Fall back to using the video element directly
      this.useVideoFallback = true;
      this._duration = videoElement.duration;
      this.setState('ready');
      return true;
    }

    // Detect blob/data URLs for fetch configuration
    const isBlobUrl = videoSrc.startsWith('blob:');
    const isDataUrl = videoSrc.startsWith('data:');

    // Set up timeout before any async operations
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      this.setState('loading');
      await this.initContext();

      if (!this.audioContext) {
        clearTimeout(timeoutId);
        this.useVideoFallback = true;
        this._duration = videoElement.duration;
        this.setState('ready');
        return true;
      }

      // Try to fetch and decode audio
      try {
        const response = await fetch(videoSrc, {
          signal: controller.signal,
          mode: isBlobUrl || isDataUrl ? 'same-origin' : 'cors',
          credentials: 'same-origin',
          // Use force-cache for remote URLs to avoid re-downloading the same file
          cache: isBlobUrl || isDataUrl ? undefined : 'force-cache',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this._duration = this.audioBuffer.duration;
        this.useVideoFallback = false;
        this.setState('ready');
        return true;

      } catch (fetchError) {
        clearTimeout(timeoutId);

        // CORS error or network issue - fall back to video element
        console.warn('AudioPlaybackManager: Failed to extract audio, using video element fallback:', fetchError);
        this.useVideoFallback = true;
        this._duration = videoElement.duration;
        this.setState('ready');
        return true;
      }

    } catch (error) {
      clearTimeout(timeoutId);
      // Decode error - fall back to video element
      console.warn('AudioPlaybackManager: Audio decode failed, using video element fallback:', error);
      this.useVideoFallback = true;
      this._duration = videoElement.duration;
      this.setState('ready');
      return true;
    }
  }

  /**
   * Load audio from a Blob (for local files)
   */
  async loadFromBlob(blob: Blob): Promise<boolean> {
    try {
      this.setState('loading');
      await this.initContext();

      if (!this.audioContext) {
        this.handleError('unknown', 'Audio context not available');
        return false;
      }

      const arrayBuffer = await blob.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this._duration = this.audioBuffer.duration;
      this.useVideoFallback = false;
      this.setState('ready');
      return true;

    } catch (error) {
      this.handleError('decode', 'Failed to decode audio', error as Error);
      return false;
    }
  }

  /**
   * Start or resume playback
   */
  async play(fromTime?: number): Promise<boolean> {
    if (this._isPlaying) return true;

    const startTime = fromTime ?? this._currentTime;

    if (this.useVideoFallback && this.videoElement) {
      return this.playWithVideoFallback(startTime);
    }

    if (!this.audioContext || !this.audioBuffer || !this.gainNode) {
      return false;
    }

    try {
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Stop any existing playback
      this.stopSourceNode();

      // Create new source node
      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.audioBuffer;
      this.sourceNode.playbackRate.value = this._playbackRate;
      this.sourceNode.connect(this.gainNode);

      this.sourceNode.onended = () => {
        if (this._isPlaying) {
          this._isPlaying = false;
          this._currentTime = this._duration;
          this.setState('paused');
          this.emit('ended', undefined);
        }
      };

      // Start playback
      this._startOffset = clamp(startTime, 0, this._duration);
      this._startTime = this.audioContext.currentTime;
      this.sourceNode.start(0, this._startOffset);

      this._isPlaying = true;
      this.setState('playing');
      return true;

    } catch (error) {
      this.handleError('unknown', 'Failed to start playback', error as Error);
      return false;
    }
  }

  private async playWithVideoFallback(startTime: number): Promise<boolean> {
    if (!this.videoElement) return false;

    try {
      // Sync video element time
      if (Math.abs(this.videoElement.currentTime - startTime) > 0.1) {
        this.videoElement.currentTime = startTime;
      }

      // Apply volume
      this.videoElement.volume = this._muted ? 0 : this._volume;
      this.videoElement.muted = this._muted;
      this.videoElement.playbackRate = this._playbackRate;

      await this.videoElement.play();
      this._isPlaying = true;
      this.setState('playing');
      return true;

    } catch (error) {
      const err = error as Error;

      // Handle autoplay policy
      if (err.name === 'NotAllowedError') {
        this.handleError('autoplay', 'Playback blocked by browser autoplay policy. Click to enable audio.', err);
      } else if (err.name === 'NotSupportedError') {
        this.handleError('decode', 'Audio format not supported', err);
      } else {
        this.handleError('unknown', 'Playback failed', err);
      }

      return false;
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this._isPlaying) return;

    // Save current time before stopping
    this._currentTime = this.currentTime;

    if (this.useVideoFallback && this.videoElement) {
      this.videoElement.pause();
    } else {
      this.stopSourceNode();
    }

    this._isPlaying = false;
    this.setState('paused');
  }

  /**
   * Seek to a specific time
   */
  seek(time: number): void {
    const wasPlaying = this._isPlaying;

    if (wasPlaying) {
      this.pause();
    }

    this._currentTime = clamp(time, 0, this._duration);

    if (this.useVideoFallback && this.videoElement) {
      this.videoElement.currentTime = this._currentTime;
    }

    if (wasPlaying) {
      this.play(this._currentTime);
    }
  }

  /**
   * Sync audio position to a frame time without disrupting playback
   * Called during frame-accurate video playback
   */
  syncToTime(targetTime: number, threshold = 0.1): void {
    if (!this._isPlaying) {
      this._currentTime = targetTime;
      return;
    }

    const currentAudioTime = this.currentTime;
    const drift = Math.abs(currentAudioTime - targetTime);

    // Only re-sync if drift exceeds threshold (default 100ms)
    if (drift > threshold) {
      if (this.useVideoFallback && this.videoElement) {
        this.videoElement.currentTime = targetTime;
      } else {
        // For Web Audio API, we need to restart from the target position
        this.stopSourceNode();
        this.play(targetTime);
      }
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this._volume = clamp(volume, 0, 1);
    this.updateGain();
  }

  /**
   * Set muted state
   */
  setMuted(muted: boolean): void {
    this._muted = muted;
    this.updateGain();
  }

  /**
   * Set playback rate (0.1-8)
   */
  setPlaybackRate(rate: number): void {
    const newRate = clamp(rate, 0.1, 8);
    if (newRate === this._playbackRate) return;

    // Save current position BEFORE updating rate (timing calculation depends on old rate)
    const wasPlayingWebAudio = this._isPlaying && !this.useVideoFallback;
    const currentPos = wasPlayingWebAudio ? this.currentTime : this._currentTime;

    this._playbackRate = newRate;

    if (this.useVideoFallback && this.videoElement) {
      this.videoElement.playbackRate = this._playbackRate;
    } else if (wasPlayingWebAudio) {
      // Restart from saved position so timing tracking resets cleanly
      // (avoids artifacts from old rate being applied to full elapsed time)
      this.seek(currentPos);
    }
  }

  /**
   * Mute audio during reverse playback
   * (Playing audio in reverse sounds bad, so we mute it)
   */
  setReversePlayback(isReverse: boolean): void {
    if (isReverse) {
      // Mute during reverse
      this.updateGain(true);
    } else {
      // Restore normal volume
      this.updateGain();
    }
  }

  /**
   * Set the scrub mode. 'continuous' bypasses debounce and enables crossfade
   * (used during timeline drag). 'discrete' uses debounced snippets
   * (used during keyboard frame stepping).
   */
  setScrubMode(mode: ScrubMode): void {
    this._scrubMode = mode;
  }

  /**
   * Play a short audio snippet at the corresponding timestamp for scrub feedback.
   * In discrete mode, debounces rapid calls so only the last scrub position produces sound.
   * In continuous mode, crossfades immediately for smooth timeline drag audio.
   *
   * @param frame - The 1-based frame number to scrub to
   * @param fps - The frames-per-second of the current source
   */
  scrubToFrame(frame: number, fps: number): void {
    // No audio loaded -- silently return
    if (!this.audioBuffer || !this.audioContext || !this.gainNode) {
      return;
    }

    // Handle suspended AudioContext on first interaction
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        this.playScrubSnippet(frame, fps);
      });
      return;
    }

    if (this._scrubMode === 'continuous') {
      // No debounce in continuous mode -- crossfade immediately
      this.playScrubSnippetWithCrossfade(frame, fps);
    } else {
      // Discrete mode -- debounce with timer
      // Cancel any pending debounce timer
      if (this.scrubDebounceTimer !== null) {
        clearTimeout(this.scrubDebounceTimer);
        this.scrubDebounceTimer = null;
      }

      // Stop any currently-playing scrub snippet
      this.stopScrubSnippet();

      // Debounce: schedule the actual snippet playback
      this.scrubDebounceTimer = setTimeout(() => {
        this.scrubDebounceTimer = null;
        this.playScrubSnippet(frame, fps);
      }, AudioPlaybackManager.SCRUB_DEBOUNCE_MS);
    }
  }

  /**
   * Compute velocity-adaptive snippet duration using exponential smoothing
   * and non-linear (quadratic ease-in) mapping.
   */
  private computeSnippetDuration(frame: number, fps: number): number {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = now - this.lastScrubTime; // ms since last scrub call

    this.lastScrubTime = now;
    // lastScrubFrame is updated after computeSnippetOffset uses it
    void fps; // fps parameter reserved for future use

    if (dt <= 0 || dt > 500) {
      // First scrub or long pause between scrubs -> reset smoothing, standard duration
      this._smoothedScrubFps = 0;
      void frame;
      return AudioPlaybackManager.SCRUB_SNIPPET_DURATION_DEFAULT;
    }

    // Exponential smoothing of scrub velocity (alpha=0.3)
    const instantFps = 1000 / dt;
    this._smoothedScrubFps = this._smoothedScrubFps * 0.7 + instantFps * 0.3;

    // Non-linear (quadratic ease-in) mapping: moderate scrub speeds (5-15 fps)
    // stay at longer durations, only dropping sharply above ~20 fps.
    const t = clamp((this._smoothedScrubFps - 5) / 25, 0, 1);
    const eased = t * t; // quadratic ease-in
    // lerp(max, min, eased)
    return AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MAX +
      (AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MIN - AudioPlaybackManager.SCRUB_SNIPPET_DURATION_MAX) * eased;
  }

  /**
   * Compute the snippet start offset, adjusting for reverse scrub direction.
   * When scrubbing backward, plays audio leading up to the target frame.
   */
  private computeSnippetOffset(frame: number, fps: number, snippetDuration: number): number {
    const timestamp = (frame - 1) / fps;
    const isReverse = frame < this.lastScrubFrame;

    if (isReverse) {
      // Backward scrub: play audio region leading up to the target frame
      return Math.max(0, timestamp - snippetDuration);
    } else {
      // Forward scrub: play audio starting from the target frame
      return clamp(timestamp, 0, this.audioBuffer!.duration);
    }
  }

  private playScrubSnippet(frame: number, fps: number): void {
    if (!this.audioBuffer || !this.audioContext || !this.gainNode) {
      return;
    }

    const snippetDuration = this.computeSnippetDuration(frame, fps);
    const offset = this.computeSnippetOffset(frame, fps, snippetDuration);

    // Update lastScrubFrame after offset computation (which depends on the previous value)
    this.lastScrubFrame = frame;

    const effectiveDuration = Math.min(snippetDuration, this.audioBuffer.duration - offset);
    if (effectiveDuration <= 0) return;

    const snippetNode = this.audioContext.createBufferSource();
    snippetNode.buffer = this.audioBuffer;

    // Create per-snippet gain node for Hann window envelope
    const envelopeGain = this.audioContext.createGain();
    const now = this.audioContext.currentTime;
    const fadeDuration = AudioPlaybackManager.SCRUB_FADE_DURATION;

    // Hann window fade-in
    envelopeGain.gain.setValueAtTime(0, now);
    try {
      envelopeGain.gain.setValueCurveAtTime(
        AudioPlaybackManager.hannFadeIn, now, fadeDuration
      );
    } catch {
      // Fallback for browsers that don't support setValueCurveAtTime well
      envelopeGain.gain.linearRampToValueAtTime(1, now + fadeDuration);
    }

    // Hann window fade-out
    const fadeOutStart = now + effectiveDuration - fadeDuration;
    if (fadeOutStart > now + fadeDuration) {
      try {
        envelopeGain.gain.setValueCurveAtTime(
          AudioPlaybackManager.hannFadeOut, fadeOutStart, fadeDuration
        );
      } catch {
        // Fallback
        envelopeGain.gain.setValueAtTime(1, fadeOutStart);
        envelopeGain.gain.linearRampToValueAtTime(0, now + effectiveDuration);
      }
    }

    snippetNode.connect(envelopeGain);
    envelopeGain.connect(this.gainNode);

    snippetNode.start(0, offset, effectiveDuration);

    // Store as current scrub snippet (for crossfade or cleanup)
    this.scrubSourceNode = snippetNode;
    this.scrubEnvelopeNode = envelopeGain;

    snippetNode.onended = () => {
      if (this.scrubSourceNode === snippetNode) {
        this.scrubSourceNode = null;
        try { envelopeGain.disconnect(); } catch { /* already disconnected */ }
        this.scrubEnvelopeNode = null;
      }
    };
  }

  /**
   * Crossfade from the outgoing scrub snippet to a new one (continuous mode).
   * The outgoing snippet fades out over SCRUB_CROSSFADE_DURATION while the
   * new snippet fades in via its Hann window envelope.
   */
  private playScrubSnippetWithCrossfade(frame: number, fps: number): void {
    // If there is an outgoing snippet, fade it out instead of stopping abruptly
    if (this.scrubSourceNode && this.scrubEnvelopeNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      const fadeOut = AudioPlaybackManager.SCRUB_CROSSFADE_DURATION;
      try {
        this.scrubEnvelopeNode.gain.cancelScheduledValues(now);
        this.scrubEnvelopeNode.gain.setValueAtTime(
          this.scrubEnvelopeNode.gain.value, now
        );
        this.scrubEnvelopeNode.gain.linearRampToValueAtTime(0, now + fadeOut);
        // Schedule stop after fade completes
        this.scrubSourceNode.stop(now + fadeOut);
      } catch {
        // If scheduling fails, just stop immediately
        try { this.scrubSourceNode.stop(); } catch { /* ignore */ }
      }

      // Move outgoing references to allow GC after stop
      const outgoing = this.scrubSourceNode;
      const outgoingEnvelope = this.scrubEnvelopeNode;
      outgoing.onended = () => {
        try { outgoingEnvelope.disconnect(); } catch { /* ignore */ }
      };
    }

    // Start new snippet (fades in via Hann window)
    this.playScrubSnippet(frame, fps);
  }

  private stopScrubSnippet(): void {
    if (this.scrubSourceNode) {
      try {
        this.scrubSourceNode.stop();
        this.scrubSourceNode.disconnect();
      } catch {
        // Ignore errors from already stopped nodes
      }
      this.scrubSourceNode = null;
    }
    if (this.scrubEnvelopeNode) {
      try {
        this.scrubEnvelopeNode.disconnect();
      } catch {
        // Ignore errors from already disconnected nodes
      }
      this.scrubEnvelopeNode = null;
    }
  }

  private updateGain(forceZero = false): void {
    const targetVolume = forceZero || this._muted ? 0 : this._volume;

    if (this.gainNode) {
      this.gainNode.gain.value = targetVolume;
    }

    if (this.videoElement) {
      this.videoElement.volume = targetVolume;
      this.videoElement.muted = forceZero || this._muted;
    }
  }

  private stopSourceNode(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Ignore errors from already stopped nodes
      }
      this.sourceNode = null;
    }
  }

  private setState(state: AudioPlaybackState): void {
    if (state !== this._state) {
      this._state = state;
      this.emit('stateChanged', state);
    }
  }

  private handleError(type: AudioPlaybackError['type'], message: string, originalError?: Error): void {
    console.error(`AudioPlaybackManager: ${message}`, originalError);
    this.setState('error');
    this.emit('error', { type, message, originalError });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.pause();
    this.stopSourceNode();
    this.stopScrubSnippet();

    // Cancel any pending scrub debounce timer
    if (this.scrubDebounceTimer !== null) {
      clearTimeout(this.scrubDebounceTimer);
      this.scrubDebounceTimer = null;
    }

    // Reset velocity tracking
    this.lastScrubTime = 0;
    this.lastScrubFrame = 0;
    this._smoothedScrubFps = 0;
    this._scrubMode = 'discrete';

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch((err) => { console.warn('AudioPlaybackManager: Audio context close failed:', err); });
      this.audioContext = null;
    }

    this.audioBuffer = null;
    this.videoElement = null;
    this._state = 'idle';
  }
}
