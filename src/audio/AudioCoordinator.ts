/**
 * AudioCoordinator - Manages the dual audio pipeline.
 *
 * Two audio paths exist:
 * - **Web Audio API** (via AudioPlaybackManager): frame-accurate sync,
 *   scrub snippets, independent gain control. Used at 1× speed or when
 *   the user disables pitch preservation.
 * - **HTMLVideoElement native audio**: browser-level `preservesPitch`
 *   support. Used at non-1× speeds when pitch preservation is on, or
 *   as a fallback when Web Audio extraction fails.
 *
 * The coordinator ensures only ONE path produces audio at any time.
 * Session delegates all audio concerns here; the scattered
 * `shouldUseWebAudio / startAudioPlayback / applyVolumeToVideo` logic
 * that used to live on Session is now centralised.
 */

import { AudioPlaybackManager } from './AudioPlaybackManager';
import type { ManagerBase } from '../core/ManagerBase';
import { Logger } from '../utils/Logger';

const log = new Logger('AudioCoordinator');

/**
 * Callback interface — avoids the coordinator importing Session.
 */
export interface AudioCoordinatorCallbacks {
  /** The active audio path changed; host should re-apply volume to the video element. */
  onAudioPathChanged(): void;
}

export class AudioCoordinator implements ManagerBase {
  private _manager = new AudioPlaybackManager();
  private _callbacks: AudioCoordinatorCallbacks | null = null;

  // Mirrored settings (kept in sync by Session through the on* methods)
  private _preservesPitch = true;
  private _speed = 1;
  private _direction = 1;
  private _fps = 24;
  private _isPlaying = false;

  // ---- Public read-only accessors ----

  /** Underlying manager — exposed for direct scrub-audio access. */
  get manager(): AudioPlaybackManager {
    return this._manager;
  }

  /**
   * True when Web Audio API is the **active** audio source.
   * When true the host MUST mute the HTMLVideoElement to prevent echo.
   *
   * Uses the coordinator's own `_isPlaying` flag and `shouldUseWebAudio()`
   * rather than `_manager.isPlaying` because `_manager.play()` is async —
   * if the AudioContext needs to be resumed, `_manager.isPlaying` stays
   * false until the resume completes, leaving the video element un-muted
   * and producing double audio.
   */
  get isWebAudioActive(): boolean {
    return this._isPlaying && this.shouldUseWebAudio();
  }

  // ---- Wiring ----

  setCallbacks(callbacks: AudioCoordinatorCallbacks): void {
    this._callbacks = callbacks;
  }

  // ---- Loading ----

  /**
   * Pre-load audio from a video element via Web Audio API.
   * Falls back gracefully — if extraction fails the old
   * HTMLVideoElement audio path remains available.
   */
  loadFromVideo(video: HTMLVideoElement, volume: number, muted: boolean): void {
    this._manager.loadFromVideo(video).then(() => {
      this._manager.setVolume(volume);
      this._manager.setMuted(muted);
      // If playback started while audio was still loading, activate now
      if (this._isPlaying) {
        this.activateAppropriateAudioPath();
      }
    }).catch(err => {
      log.warn('Audio extraction failed, using video element audio:', err);
    });
  }

  // ---- Playback lifecycle (called by Session in response to PlaybackEngine events) ----

  onPlaybackStarted(frame: number, fps: number, speed: number, direction: number): void {
    this._fps = fps;
    this._speed = speed;
    this._direction = direction;
    this._isPlaying = true;
    this.activateAppropriateAudioPath(frame);
  }

  onPlaybackStopped(): void {
    this._isPlaying = false;
    this._manager.pause();
    this._callbacks?.onAudioPathChanged();
  }

  onFrameChanged(frame: number, fps: number, isPlaying: boolean): void {
    this._fps = fps;

    if (!isPlaying) {
      this._manager.scrubToFrame(frame, fps);
      return;
    }

    // During playback only sync when Web Audio should be active
    if (!this.shouldUseWebAudio()) return;

    const time = (frame - 1) / fps;
    if (this._manager.isPlaying) {
      this._manager.syncToTime(time);
    } else {
      // AudioBufferSourceNode ended (e.g. loop wrap) — restart
      this._manager.play(time).catch(err => {
        log.warn('Failed to restart audio after loop wrap:', err);
      });
      this._callbacks?.onAudioPathChanged();
    }
  }

  // ---- Setting changes ----

  onSpeedChanged(speed: number): void {
    this._speed = speed;
    this._manager.setPlaybackRate(speed);
    if (this._isPlaying) this.activateAppropriateAudioPath();
  }

  onDirectionChanged(direction: number): void {
    this._direction = direction;
    this._manager.setReversePlayback(direction < 0);
    if (this._isPlaying) this._callbacks?.onAudioPathChanged();
  }

  onVolumeChanged(volume: number): void {
    this._manager.setVolume(volume);
  }

  onMutedChanged(muted: boolean): void {
    this._manager.setMuted(muted);
  }

  onPreservesPitchChanged(preservesPitch: boolean): void {
    this._preservesPitch = preservesPitch;
    if (this._isPlaying) this.activateAppropriateAudioPath();
  }

  // ---- Video element integration ----

  /**
   * Apply volume to a video element, accounting for the active audio path.
   * When Web Audio is handling audio the video is force-muted.
   */
  applyToVideoElement(
    video: HTMLVideoElement,
    effectiveVolume: number,
    muted: boolean,
    direction: number,
  ): void {
    if (this.isWebAudioActive) {
      video.volume = 0;
      video.muted = true;
    } else {
      video.volume = effectiveVolume;
      video.muted = muted || direction < 0;
    }
  }

  // ---- Internal ----

  /**
   * Whether Web Audio should be the active audio path.
   *
   * Web Audio API's AudioBufferSourceNode has no `preservesPitch` —
   * changing playbackRate shifts pitch proportionally.  At non-1×
   * speeds with pitch preservation we fall back to the
   * HTMLVideoElement which has native `preservesPitch` support.
   */
  private shouldUseWebAudio(): boolean {
    if (!this._manager.isUsingWebAudio) return false;
    if (this._speed !== 1 && this._preservesPitch) return false;
    return true;
  }

  /**
   * Evaluate which audio path should be active and switch if needed.
   */
  private activateAppropriateAudioPath(frame?: number): void {
    const state = this._manager.state;
    const canPlay = state === 'ready' || state === 'paused' || state === 'playing';
    if (!canPlay) return;

    if (this.shouldUseWebAudio()) {
      if (!this._manager.isPlaying) {
        const time = ((frame ?? 1) - 1) / this._fps;
        this._manager.setPlaybackRate(this._speed);
        this._manager.setReversePlayback(this._direction < 0);
        this._manager.play(time).catch(err => {
          log.warn('Failed to activate Web Audio path:', err);
        });
      }
    } else {
      this._manager.pause();
    }

    this._callbacks?.onAudioPathChanged();
  }

  // ---- Cleanup ----

  dispose(): void {
    this._manager.dispose();
    this._callbacks = null;
  }
}
