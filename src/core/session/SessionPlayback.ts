/**
 * SessionPlayback - Owns all playback-related concerns extracted from Session.
 *
 * Managers owned:
 *  - PlaybackEngine  (play/pause/seek/timing)
 *  - VolumeManager   (volume, mute, preservesPitch)
 *  - ABCompareManager (A/B source compare state)
 *  - AudioCoordinator (Web Audio routing)
 *
 * Communicates with its host (Session) via the SessionPlaybackHost interface
 * to access media sources, emit cross-domain events, etc.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { LoopMode } from '../types/session';
import type { MediaSource, AudioPlaybackError } from './Session';
import type { SubFramePosition } from '../../utils/media/FrameInterpolator';
import { PlaybackEngine } from './PlaybackEngine';
import { VolumeManager } from './VolumeManager';
import { ABCompareManager } from './ABCompareManager';
import { AudioCoordinator } from '../../audio/AudioCoordinator';
import type { AudioPlaybackManager } from '../../audio/AudioPlaybackManager';
import { Logger } from '../../utils/Logger';

const log = new Logger('SessionPlayback');

// ---------------------------------------------------------------------------
// Host interface — SessionPlayback calls back into Session for cross-domain data
// ---------------------------------------------------------------------------

export interface SessionPlaybackHost {
  /** Get the current active media source */
  getCurrentSource(): MediaSource | null;
  /** Get source B (for A/B compare / split screen) */
  getSourceB(): MediaSource | null;
  /** Get total number of loaded sources */
  getSourceCount(): number;
  /** Get all loaded sources (for A/B index lookup) */
  getSources(): MediaSource[];
  /** Get the current source index from media service */
  getMediaCurrentSourceIndex(): number;
  /** Set the current source index on media service */
  setMediaCurrentSourceIndex(index: number): void;
  /** Emit durationChanged on the host */
  emitDurationChanged(duration: number): void;
}

// ---------------------------------------------------------------------------
// Events emitted by SessionPlayback
// ---------------------------------------------------------------------------

export interface SessionPlaybackEvents extends EventMap {
  frameChanged: number;
  playbackChanged: boolean;
  playDirectionChanged: number;
  playbackSpeedChanged: number;
  loopModeChanged: LoopMode;
  fpsChanged: number;
  frameIncrementChanged: number;
  inOutChanged: { inPoint: number; outPoint: number };
  interpolationEnabledChanged: boolean;
  subFramePositionChanged: SubFramePosition | null;
  buffering: boolean;
  volumeChanged: number;
  mutedChanged: boolean;
  preservesPitchChanged: boolean;
  audioError: AudioPlaybackError;
  abSourceChanged: { current: 'A' | 'B'; sourceIndex: number };
}

// ---------------------------------------------------------------------------
// SessionPlayback
// ---------------------------------------------------------------------------

export class SessionPlayback extends EventEmitter<SessionPlaybackEvents> {
  // Owned managers
  readonly _playbackEngine = new PlaybackEngine();
  readonly _volumeManager = new VolumeManager();
  readonly _abCompareManager = new ABCompareManager();
  readonly _audioCoordinator = new AudioCoordinator();

  private _host: SessionPlaybackHost | null = null;

  // ---- Host wiring ----

  setHost(host: SessionPlaybackHost): void {
    this._host = host;
    this.wirePlaybackEngine();
    this.wireVolumeManager();
    this.wireABCompareManager();
    this.wireAudioCoordinator();
    this.forwardPlaybackEngineEvents();
  }

  // ---- Manager accessors ----

  /** Underlying AudioPlaybackManager (via coordinator) for scrub audio */
  get audioPlaybackManager(): AudioPlaybackManager {
    return this._audioCoordinator.manager;
  }

  // ---- PlaybackEngine public accessors (delegation) ----

  get currentFrame(): number { return this._playbackEngine.currentFrame; }
  set currentFrame(frame: number) { this._playbackEngine.currentFrame = frame; }

  get inPoint(): number { return this._playbackEngine.inPoint; }
  get outPoint(): number { return this._playbackEngine.outPoint; }

  get fps(): number { return this._playbackEngine.fps; }
  set fps(value: number) { this._playbackEngine.fps = value; }

  get frameIncrement(): number { return this._playbackEngine.frameIncrement; }
  set frameIncrement(value: number) { this._playbackEngine.frameIncrement = value; }

  get playbackSpeed(): number { return this._playbackEngine.playbackSpeed; }
  set playbackSpeed(value: number) { this._playbackEngine.playbackSpeed = value; }

  get isPlaying(): boolean { return this._playbackEngine.isPlaying; }
  get isBuffering(): boolean { return this._playbackEngine.isBuffering; }

  get loopMode(): LoopMode { return this._playbackEngine.loopMode; }
  set loopMode(mode: LoopMode) { this._playbackEngine.loopMode = mode; }

  get playDirection(): number { return this._playbackEngine.playDirection; }
  get effectiveFps(): number { return this._playbackEngine.effectiveFps; }
  get frameCount(): number { return this._playbackEngine.frameCount; }

  get interpolationEnabled(): boolean { return this._playbackEngine.interpolationEnabled; }
  set interpolationEnabled(value: boolean) { this._playbackEngine.interpolationEnabled = value; }

  get subFramePosition(): SubFramePosition | null { return this._playbackEngine.subFramePosition; }

  // ---- Volume/mute public accessors (delegation) ----

  get volume(): number { return this._volumeManager.volume; }
  set volume(value: number) { this._volumeManager.volume = value; }

  get muted(): boolean { return this._volumeManager.muted; }
  set muted(value: boolean) { this._volumeManager.muted = value; }

  toggleMute(): void { this._volumeManager.toggleMute(); }

  get preservesPitch(): boolean { return this._volumeManager.preservesPitch; }
  set preservesPitch(value: boolean) { this._volumeManager.preservesPitch = value; }

  // ---- A/B Compare public accessors (delegation) ----

  get currentAB(): 'A' | 'B' { return this._abCompareManager.currentAB; }
  get sourceAIndex(): number { return this._abCompareManager.sourceAIndex; }
  get sourceBIndex(): number { return this._abCompareManager.sourceBIndex; }

  get sourceA(): MediaSource | null {
    const sources = this._host?.getSources() ?? [];
    return sources[this._abCompareManager.sourceAIndex] ?? null;
  }

  get sourceB(): MediaSource | null {
    const idx = this._abCompareManager.sourceBIndex;
    if (idx < 0) return null;
    const sources = this._host?.getSources() ?? [];
    return sources[idx] ?? null;
  }

  get abCompareAvailable(): boolean {
    return this._abCompareManager.isAvailable(this._host?.getSourceCount() ?? 0);
  }

  get syncPlayhead(): boolean { return this._abCompareManager.syncPlayhead; }
  set syncPlayhead(value: boolean) { this._abCompareManager.syncPlayhead = value; }

  // ---- Playback control methods ----

  play(): void { this._playbackEngine.play(); }
  pause(): void { this._playbackEngine.pause(); }
  togglePlayback(): void { this._playbackEngine.togglePlayback(); }
  togglePlayDirection(): void { this._playbackEngine.togglePlayDirection(); }

  stepForward(): void { this._playbackEngine.stepForward(); }
  stepBackward(): void { this._playbackEngine.stepBackward(); }

  goToFrame(frame: number): void { this._playbackEngine.goToFrame(frame); }
  goToStart(): void { this._playbackEngine.goToStart(); }
  goToEnd(): void { this._playbackEngine.goToEnd(); }

  setInPoint(frame?: number): void { this._playbackEngine.setInPoint(frame); }
  setOutPoint(frame?: number): void { this._playbackEngine.setOutPoint(frame); }
  resetInOutPoints(): void { this._playbackEngine.resetInOutPoints(); }

  update(): void { this._playbackEngine.update(); }
  advanceFrame(direction: number): void { this._playbackEngine.advanceFrame(direction); }

  increaseSpeed(): void { this._playbackEngine.increaseSpeed(); }
  decreaseSpeed(): void { this._playbackEngine.decreaseSpeed(); }
  resetSpeed(): void { this._playbackEngine.resetSpeed(); }

  // ---- A/B Compare methods ----

  setSourceA(index: number): void {
    const count = this._host?.getSourceCount() ?? 0;
    this._abCompareManager.setSourceA(index, count);
    if (this._abCompareManager.currentAB === 'A') {
      this.switchToSource(index);
    }
  }

  setSourceB(index: number): void {
    const count = this._host?.getSourceCount() ?? 0;
    this._abCompareManager.setSourceB(index, count);
    if (this._abCompareManager.currentAB === 'B') {
      this.switchToSource(index);
    }
  }

  clearSourceB(): void {
    const needsSwitch = this._abCompareManager.clearSourceB();
    if (needsSwitch) {
      this.switchToSource(this._abCompareManager.sourceAIndex);
    }
  }

  toggleAB(): void {
    const count = this._host?.getSourceCount() ?? 0;
    const result = this._abCompareManager.toggle(count);
    if (!result) return;

    const savedFrame = result.shouldRestoreFrame ? this._playbackEngine.currentFrame : null;

    this.switchToSource(result.newSourceIndex);

    // Restore frame position if sync is enabled
    if (savedFrame !== null) {
      const maxFrame = this._host?.getCurrentSource()?.duration ?? 1;
      this._playbackEngine.setCurrentFrameInternal(Math.min(savedFrame, maxFrame));
      this.syncVideoToFrame();
      this.emit('frameChanged', this._playbackEngine.currentFrame);
    }

    this._abCompareManager.emitChanged(this._host?.getMediaCurrentSourceIndex() ?? 0);
  }

  setCurrentAB(ab: 'A' | 'B'): void {
    const count = this._host?.getSourceCount() ?? 0;
    if (!this._abCompareManager.shouldToggle(ab, count)) return;
    this.toggleAB();
  }

  // ---- Audio methods ----

  /**
   * Safely play a video element with proper promise handling.
   */
  async safeVideoPlay(video: HTMLVideoElement): Promise<void> {
    const playPromise = (async () => {
      try {
        // Ensure volume is applied before playing
        this.applyVolumeToVideo();

        await video.play();
      } catch (error) {
        const err = error as Error;

        if (err.name === 'NotAllowedError') {
          this.emit('audioError', {
            type: 'autoplay',
            message: 'Playback blocked by browser autoplay policy. Click the player to enable audio.',
            originalError: err,
          });
          video.muted = true;
          this._volumeManager.muted = true;
          try {
            await video.play();
          } catch (retryErr) {
            log.warn('Muted playback retry also failed, pausing:', retryErr);
            this.pause();
          }
        } else if (err.name === 'NotSupportedError') {
          this.emit('audioError', {
            type: 'decode',
            message: 'Media format not supported',
            originalError: err,
          });
          this.pause();
        } else if (err.name === 'AbortError') {
          log.debug('Video play() was aborted');
        } else {
          this.emit('audioError', {
            type: 'unknown',
            message: `Playback failed: ${err.message}`,
            originalError: err,
          });
          this.pause();
        }
      }
    })();

    this._playbackEngine.setPendingPlayPromise(playPromise);

    try {
      await playPromise;
    } finally {
      if (this._playbackEngine.pendingPlayPromise === playPromise) {
        this._playbackEngine.setPendingPlayPromise(null);
      }
    }
  }

  /**
   * Apply volume/mute state to the current video element.
   * Uses AudioCoordinator to decide whether Web Audio or native video audio is active.
   */
  applyVolumeToVideo(): void {
    const source = this._host?.getCurrentSource() ?? null;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      const video = source.element;
      this._audioCoordinator.applyToVideoElement(
        video,
        this._volumeManager.getEffectiveVolume(),
        this._volumeManager.muted,
        this._playbackEngine.playDirection,
      );
      video.playbackRate = this._playbackEngine.playbackSpeed;
    }
  }

  /**
   * Apply preservesPitch setting to the current video element.
   */
  applyPreservesPitchToVideo(): void {
    const source = this._host?.getCurrentSource() ?? null;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      this._volumeManager.applyPreservesPitchToVideo(source.element);
    }
  }

  /**
   * Apply preservesPitch to a newly created video element.
   */
  initVideoPreservesPitch(video: HTMLVideoElement): void {
    this._volumeManager.initVideoPreservesPitch(video);
  }

  /**
   * Sync video element to the current frame position.
   */
  syncVideoToFrame(): void {
    const source = this._host?.getCurrentSource() ?? null;
    if (source?.type === 'video') {
      if (source.videoSourceNode?.isUsingMediabunny()) {
        source.videoSourceNode.preloadFrames(this._playbackEngine.currentFrame).catch(err => {
          log.warn('Frame preload error:', err);
        });
      }
      if (source.element instanceof HTMLVideoElement && !this._playbackEngine.isPlaying) {
        const targetTime = (this._playbackEngine.currentFrame - 1) / this._playbackEngine.fps;
        if (Math.abs(source.element.currentTime - targetTime) > 0.1) {
          source.element.currentTime = targetTime;
        }
      }
    }
  }

  // ---- Internal: switch to source without resetting frame (for A/B) ----

  private switchToSource(index: number): void {
    const sources = this._host?.getSources() ?? [];
    if (index < 0 || index >= sources.length) return;

    // Pause current video if playing
    const currentSource = this._host?.getCurrentSource() ?? null;
    if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
      currentSource.element.pause();
    }

    this._host?.setMediaCurrentSourceIndex(index);

    // Update duration but preserve frame if syncing
    const newSource = this._host?.getCurrentSource() ?? null;
    if (newSource) {
      this._playbackEngine.setOutPointInternal(newSource.duration);
      this._playbackEngine.setInPointInternal(1);
      this._host?.emitDurationChanged(newSource.duration);
    }
  }

  // ---- Internal wiring (called once from setHost) ----

  private wirePlaybackEngine(): void {
    this._playbackEngine.setHost({
      getCurrentSource: () => this._host?.getCurrentSource() ?? null,
      getSourceB: () => this.sourceB,
      applyVolumeToVideo: () => this.applyVolumeToVideo(),
      safeVideoPlay: (video) => this.safeVideoPlay(video),
      initVideoPreservesPitch: (video) => this.initVideoPreservesPitch(video),
      getAudioSyncEnabled: () => this._volumeManager.audioSyncEnabled,
      setAudioSyncEnabled: (enabled) => { this._volumeManager.audioSyncEnabled = enabled; },
    });
  }

  private wireVolumeManager(): void {
    this._volumeManager.setCallbacks({
      onVolumeChanged: (v) => {
        this._audioCoordinator.onVolumeChanged(v);
        this.applyVolumeToVideo();
        this.emit('volumeChanged', v);
      },
      onMutedChanged: (m) => {
        this._audioCoordinator.onMutedChanged(m);
        this.applyVolumeToVideo();
        this.emit('mutedChanged', m);
      },
      onPreservesPitchChanged: (p) => {
        this.applyPreservesPitchToVideo();
        this._audioCoordinator.onPreservesPitchChanged(p);
        this.emit('preservesPitchChanged', p);
      },
    });
  }

  private wireABCompareManager(): void {
    this._abCompareManager.setCallbacks({
      onABSourceChanged: (info) => this.emit('abSourceChanged', info),
    });
  }

  private wireAudioCoordinator(): void {
    this._audioCoordinator.setCallbacks({
      onAudioPathChanged: () => this.applyVolumeToVideo(),
    });
  }

  private forwardPlaybackEngineEvents(): void {
    const pe = this._playbackEngine;

    pe.on('frameChanged', (frame) => {
      this.emit('frameChanged', frame);
      this._audioCoordinator.onFrameChanged(frame, pe.fps, pe.isPlaying);
    });

    pe.on('playbackChanged', (playing) => {
      if (playing) {
        this._audioCoordinator.onPlaybackStarted(pe.currentFrame, pe.fps, pe.playbackSpeed, pe.playDirection);
      } else {
        this._audioCoordinator.onPlaybackStopped();
      }
      this.emit('playbackChanged', playing);
    });

    pe.on('playDirectionChanged', (dir) => {
      this._audioCoordinator.onDirectionChanged(dir);
      this.emit('playDirectionChanged', dir);
    });

    pe.on('playbackSpeedChanged', (speed) => {
      this._audioCoordinator.onSpeedChanged(speed);
      this.emit('playbackSpeedChanged', speed);
    });

    pe.on('loopModeChanged', (mode) => this.emit('loopModeChanged', mode));
    pe.on('fpsChanged', (fps) => this.emit('fpsChanged', fps));
    pe.on('frameIncrementChanged', (inc) => this.emit('frameIncrementChanged', inc));
    pe.on('inOutChanged', (range) => this.emit('inOutChanged', range));
    pe.on('interpolationEnabledChanged', (enabled) => this.emit('interpolationEnabledChanged', enabled));
    pe.on('subFramePositionChanged', (pos) => this.emit('subFramePositionChanged', pos));
    pe.on('buffering', (buffering) => this.emit('buffering', buffering));
  }

  // ---- Dispose ----

  dispose(): void {
    // Stop playback before teardown to prevent stale update() calls
    this.pause();
    this._playbackEngine.dispose();
    this._audioCoordinator.dispose();
    this._volumeManager.dispose();
    this._abCompareManager.dispose();
    this._host = null;
    // Remove SessionPlayback-level event listeners
    this.removeAllListeners();
  }
}
