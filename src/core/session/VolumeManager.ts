/**
 * Callback interface for VolumeManager to notify Session of changes
 * without importing Session (avoids circular deps).
 */
export interface VolumeManagerCallbacks {
  onVolumeChanged(volume: number): void;
  onMutedChanged(muted: boolean): void;
  onPreservesPitchChanged(preservesPitch: boolean): void;
}

/**
 * VolumeManager owns audio-related state and operations:
 * - Volume level (0..1) with clamping
 * - Mute/unmute with previous-volume restore
 * - Pitch preservation preference
 * - Audio sync enabled state (for reverse playback muting)
 * - Applying volume/pitch settings to HTMLVideoElement
 *
 * State is owned by this manager. Session delegates to it.
 */
export class VolumeManager {
  private _volume = 0.7;
  private _muted = false;
  private _previousVolume = 0.7; // For unmute restore
  private _preservesPitch = true; // Pitch correction at non-1x speeds (default: on)
  private _audioSyncEnabled = true; // Controls whether to sync video element for audio
  private _callbacks: VolumeManagerCallbacks | null = null;

  /**
   * Set the callbacks object. Called once by Session after construction.
   */
  setCallbacks(callbacks: VolumeManagerCallbacks): void {
    this._callbacks = callbacks;
  }

  // ---- Volume ----

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    if (clamped !== this._volume) {
      // Store previous volume for unmute restore (only if setting a non-zero value)
      if (clamped > 0) {
        this._previousVolume = clamped;
      }
      this._volume = clamped;
      // Auto-unmute when volume is set to non-zero
      if (clamped > 0 && this._muted) {
        this._muted = false;
        this._callbacks?.onMutedChanged(this._muted);
      }
      this._callbacks?.onVolumeChanged(this._volume);
    }
  }

  // ---- Mute ----

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    if (value !== this._muted) {
      this._muted = value;
      this._callbacks?.onMutedChanged(this._muted);
    }
  }

  toggleMute(): void {
    if (this._muted) {
      // Unmuting - restore previous volume
      this._muted = false;
      if (this._volume === 0) {
        this._volume = this._previousVolume || 0.7;
        this._callbacks?.onVolumeChanged(this._volume);
      }
    } else {
      // Muting - save current volume for later restore
      if (this._volume > 0) {
        this._previousVolume = this._volume;
      }
      this._muted = true;
    }
    this._callbacks?.onMutedChanged(this._muted);
  }

  // ---- Preserves pitch ----

  /**
   * Whether to preserve audio pitch when playing at non-1x speeds.
   * When true, audio pitch stays the same regardless of playback speed.
   * When false, audio pitch changes proportionally with speed.
   * Default: true.
   */
  get preservesPitch(): boolean {
    return this._preservesPitch;
  }

  set preservesPitch(value: boolean) {
    if (value !== this._preservesPitch) {
      this._preservesPitch = value;
      this._callbacks?.onPreservesPitchChanged(this._preservesPitch);
    }
  }

  // ---- Audio sync ----

  get audioSyncEnabled(): boolean {
    return this._audioSyncEnabled;
  }

  set audioSyncEnabled(value: boolean) {
    this._audioSyncEnabled = value;
  }

  // ---- Video element helpers ----

  /**
   * Apply current volume/mute state to an HTMLVideoElement.
   * Also mutes during reverse playback (sounds bad).
   */
  applyVolumeToVideo(video: HTMLVideoElement, playDirection: number): void {
    const effectiveVolume = this._muted ? 0 : this._volume;
    video.volume = effectiveVolume;
    video.muted = this._muted;

    // Also mute during reverse playback (sounds bad)
    if (playDirection < 0) {
      video.muted = true;
    }
  }

  /**
   * Apply preservesPitch setting to an HTMLVideoElement.
   * Handles vendor-prefixed properties for cross-browser support.
   */
  applyPreservesPitchToVideo(video: HTMLVideoElement): void {
    video.preservesPitch = this._preservesPitch;
    // Vendor-prefixed fallbacks for older browsers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoAny = video as any;
    if ('mozPreservesPitch' in video) {
      videoAny.mozPreservesPitch = this._preservesPitch;
    }
    if ('webkitPreservesPitch' in video) {
      videoAny.webkitPreservesPitch = this._preservesPitch;
    }
  }

  /**
   * Initialize preservesPitch on a newly created video element.
   */
  initVideoPreservesPitch(video: HTMLVideoElement): void {
    this.applyPreservesPitchToVideo(video);
  }

  /**
   * Get the effective volume for initializing video elements.
   * Returns 0 if muted, otherwise the current volume.
   */
  getEffectiveVolume(): number {
    return this._muted ? 0 : this._volume;
  }

  dispose(): void {
    this._callbacks = null;
  }
}
