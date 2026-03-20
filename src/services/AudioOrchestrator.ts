/**
 * AudioOrchestrator - Manages audio mixer lifecycle and session wiring.
 *
 * Extracted from App.ts to isolate audio concerns:
 * - Creates and owns the AudioMixer instance
 * - Binds session playback/source events to drive audio playback and track loading
 * - Handles lazy AudioContext initialization on first user interaction (browser policy)
 * - Provides the mixer reference to other modules (e.g. AppPlaybackWiring)
 *
 * @deprecated This is the **legacy** audio pipeline. The primary audio path is now
 * `SessionPlayback`'s `AudioCoordinator` (see `src/audio/AudioCoordinator.ts`).
 * When `sessionAudioActive` is true, this orchestrator skips its own audio
 * decode/fetch to prevent double-decoding and state divergence.
 *
 * TODO(audio-cleanup): Remove AudioOrchestrator entirely once AudioCoordinator
 * covers all use-cases (multi-track mixing, waveform textures, surround downmix).
 */

import { AudioMixer } from '../audio/AudioMixer';
import { Logger } from '../utils/Logger';

const log = new Logger('AudioOrchestrator');

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing - no need to import heavy classes)
// ---------------------------------------------------------------------------

/** Subset of Session that the audio orchestrator actually touches. */
export interface AudioOrchestratorSession {
  readonly currentFrame: number;
  readonly fps: number;
  on(event: string, handler: (data: unknown) => void): unknown;
  off(event: string, handler: (data: unknown) => void): void;
}

/** Subset of MediaSource relevant for audio extraction. */
export interface AudioOrchestratorSource {
  type: string;
  name: string;
  url: string;
  element?: { src?: string; currentSrc?: string };
}

export interface AudioOrchestratorDeps {
  session: AudioOrchestratorSession;
  audioMixer?: AudioMixer;
  /**
   * When true, indicates that the session's AudioCoordinator is managing audio.
   * The orchestrator will skip its own decode/fetch to avoid double-decoding.
   * Can be a boolean or a function that returns the current state.
   */
  sessionAudioActive?: boolean | (() => boolean);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `AudioCoordinator` via `SessionPlayback` instead.
 * This class is retained for backward compatibility and will be removed
 * once the new audio pipeline covers all legacy capabilities.
 */
export class AudioOrchestrator {
  private readonly session: AudioOrchestratorSession;
  private readonly audioMixer: AudioMixer;
  private audioInitialized = false;
  private readonly unsubscribers: Array<() => void> = [];
  private _sessionAudioActive: boolean | (() => boolean);
  private _dualPipelineWarned = false;

  constructor(deps: AudioOrchestratorDeps) {
    this.session = deps.session;
    this.audioMixer = deps.audioMixer ?? new AudioMixer();
    this._sessionAudioActive = deps.sessionAudioActive ?? false;
  }

  /** Get the underlying AudioMixer instance. */
  getAudioMixer(): AudioMixer {
    return this.audioMixer;
  }

  /** Whether the AudioContext has been initialized. */
  get isInitialized(): boolean {
    return this.audioInitialized;
  }

  /**
   * Returns true if the session's AudioCoordinator is managing audio,
   * meaning this orchestrator should defer to it.
   */
  get isSessionAudioActive(): boolean {
    const value = this._sessionAudioActive;
    return typeof value === 'function' ? value() : value;
  }

  /**
   * Update the session-audio-active flag at runtime.
   * When set to true, future sourceLoaded events will skip audio decode.
   */
  setSessionAudioActive(active: boolean | (() => boolean)): void {
    this._sessionAudioActive = active;
  }

  /**
   * Bind session events for audio playback sync and track loading.
   *
   * - playbackChanged: start/stop audio mixer in sync with session playback
   * - sourceLoaded: extract audio from video sources and add as mixer tracks
   */
  bindEvents(): void {
    const onPlaybackChanged = (playing: boolean): void => {
      if (!this.audioInitialized) return;
      if (playing) {
        const frameTime = this.session.currentFrame / (this.session.fps || 24);
        this.audioMixer.play(frameTime);
      } else {
        this.audioMixer.stop();
      }
    };

    const onSourceLoaded = (source: AudioOrchestratorSource): void => {
      if (!this.audioInitialized) return;
      if (source.type !== 'video') return;

      // If the session's AudioCoordinator is active, skip the legacy
      // decode path to prevent double audio decoding and state divergence.
      if (this.isSessionAudioActive) {
        if (!this._dualPipelineWarned) {
          this._dualPipelineWarned = true;
          console.warn(
            '[AudioOrchestrator] Dual audio pipeline detected: ' +
              "SessionPlayback's AudioCoordinator is active. " +
              'Skipping legacy audio decode to prevent double-decoding. ' +
              'AudioOrchestrator is deprecated — see TODO(audio-cleanup).',
          );
        }
        log.debug('Skipping audio decode for "%s" — session audio path is active', source.name);
        return;
      }

      const videoEl = source.element as { src?: string; currentSrc?: string } | undefined;
      const videoSrc = videoEl?.src || videoEl?.currentSrc || source.url;
      if (!videoSrc) return;

      const trackId = `source-${source.name}`;

      // Remove previous track for this source if it exists
      if (this.audioMixer.getTrack(trackId)) {
        this.audioMixer.removeTrack(trackId);
      }

      // Fetch and decode audio from the video source URL
      fetch(videoSrc, { mode: 'cors', credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) return;
          return response.arrayBuffer();
        })
        .then((arrayBuffer) => {
          if (!arrayBuffer) return;
          const audioCtx = new AudioContext();
          return audioCtx
            .decodeAudioData(arrayBuffer)
            .then((audioBuffer) => {
              audioCtx.close().catch((err) => {
                log.debug('AudioContext close after decode:', err);
              });
              return audioBuffer;
            })
            .catch((err) => {
              log.debug('Audio decode failed (video may not contain audio):', err);
              audioCtx.close().catch((closeErr) => {
                log.debug('AudioContext close after failed decode:', closeErr);
              });
              return undefined;
            });
        })
        .then((audioBuffer) => {
          if (!audioBuffer) return;
          this.audioMixer.addTrack({ id: trackId, label: source.name });
          this.audioMixer.loadTrackBuffer(trackId, audioBuffer);
        })
        .catch((err) => {
          log.debug('Audio extraction skipped (video may lack audio track):', err);
        });
    };

    const playbackHandler = onPlaybackChanged as (data: unknown) => void;
    const sourceHandler = onSourceLoaded as (data: unknown) => void;

    this.session.on('playbackChanged', playbackHandler);
    this.session.on('sourceLoaded', sourceHandler);

    this.unsubscribers.push(
      () => this.session.off('playbackChanged', playbackHandler),
      () => this.session.off('sourceLoaded', sourceHandler),
    );
  }

  /**
   * Set up lazy AudioContext initialization on first user interaction.
   *
   * Browsers require a user gesture before creating or resuming an AudioContext.
   * This registers click/keydown listeners that initialize on the first interaction.
   */
  setupLazyInit(): void {
    const initAudio = (): void => {
      if (this.audioInitialized) return;
      this.audioInitialized = true;
      this.audioMixer.initialize().catch((err) => {
        log.warn('AudioMixer initialization failed:', err);
      });
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });

    this.unsubscribers.push(
      () => document.removeEventListener('click', initAudio),
      () => document.removeEventListener('keydown', initAudio),
    );
  }

  /**
   * Clean up all subscriptions and dispose the mixer.
   */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
    this.audioMixer.dispose();
  }
}
