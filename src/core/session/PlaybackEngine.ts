import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { clamp } from '../../utils/math';
import type { LoopMode } from '../types/session';
import type { MediaSource } from './Session';
import type { SubFramePosition } from '../../utils/media/FrameInterpolator';
import { PlaybackTimingController, MAX_CONSECUTIVE_STARVATION_SKIPS } from './PlaybackTimingController';
import type { TimingState } from './PlaybackTimingController';
import { PLAYBACK_SPEED_PRESETS, type PlaybackSpeedPreset } from '../../config/PlaybackConfig';
import { Logger } from '../../utils/Logger';
import { PerfTrace } from '../../utils/PerfTrace';

const log = new Logger('PlaybackEngine');

/**
 * Interface that the PlaybackEngine uses to communicate with Session
 * (or any host) to access media sources and volume state.
 */
export interface PlaybackEngineHost {
  /** Get the current media source */
  getCurrentSource(): MediaSource | null;
  /** Get source B (for A/B compare / split screen) */
  getSourceB(): MediaSource | null;
  /** Apply volume to the current video element */
  applyVolumeToVideo(): void;
  /** Safely play a video element with proper promise handling */
  safeVideoPlay(video: HTMLVideoElement): Promise<void>;
  /** Apply preserves pitch to a video element */
  initVideoPreservesPitch(video: HTMLVideoElement): void;
  /** Whether audio sync is enabled (forward playback with volume) */
  getAudioSyncEnabled(): boolean;
  /** Set audio sync enabled state */
  setAudioSyncEnabled(enabled: boolean): void;
}

/**
 * Events emitted by PlaybackEngine
 */
export interface PlaybackEngineEvents extends EventMap {
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
}

/**
 * PlaybackEngine handles all playback-related logic:
 * - Play/pause/seek/loop state
 * - Timing logic (requestAnimationFrame frame advancement)
 * - FPS tracking
 * - Sub-frame interpolation
 * - Frame-gated playback for mediabunny
 *
 * It communicates with its host (Session) via the PlaybackEngineHost interface
 * to access media sources and volume controls.
 */
export class PlaybackEngine extends EventEmitter<PlaybackEngineEvents> {
  // Playback state
  private _currentFrame = 1;
  private _inPoint = 1;
  private _outPoint = 1;
  private _fps = 24;
  private _isPlaying = false;
  private _playDirection = 1;
  private _playbackSpeed = 1;
  private _loopMode: LoopMode = 'loop';
  private _interpolationEnabled = false;
  private _frameIncrement = 1;

  // Playback guard to prevent concurrent play() calls
  private _pendingPlayPromise: Promise<void> | null = null;

  // Track which frame is currently being fetched to avoid redundant getFrameAsync calls
  private _pendingFetchFrame: number | null = null;

  // HDR initial buffering: delay frame advancement until enough frames are pre-decoded
  private _hdrBuffering = false;

  // Timing controller (pure logic)
  private _timingController = new PlaybackTimingController();

  // Static constant for starvation threshold - kept for backward compatibility
  static readonly MAX_CONSECUTIVE_STARVATION_SKIPS = MAX_CONSECUTIVE_STARVATION_SKIPS;

  // Timing state object
  private _ts: TimingState = {
    lastFrameTime: 0,
    frameAccumulator: 0,
    bufferingCount: 0,
    isBuffering: false,
    starvationStartTime: 0,
    consecutiveStarvationSkips: 0,
    fpsFrameCount: 0,
    fpsLastTime: 0,
    effectiveFps: 0,
    subFramePosition: null,
  };

  // --- Backward-compatible accessors for timing state fields ---
  // Tests access these via `(session as any).lastFrameTime` etc.

  get lastFrameTime(): number { return this._ts.lastFrameTime; }
  set lastFrameTime(v: number) { this._ts.lastFrameTime = v; }

  get frameAccumulator(): number { return this._ts.frameAccumulator; }
  set frameAccumulator(v: number) { this._ts.frameAccumulator = v; }

  get _bufferingCount(): number { return this._ts.bufferingCount; }
  set _bufferingCount(v: number) { this._ts.bufferingCount = v; }

  get _isBuffering(): boolean { return this._ts.isBuffering; }
  set _isBuffering(v: boolean) { this._ts.isBuffering = v; }

  get _starvationStartTime(): number { return this._ts.starvationStartTime; }
  set _starvationStartTime(v: number) { this._ts.starvationStartTime = v; }

  get _consecutiveStarvationSkips(): number { return this._ts.consecutiveStarvationSkips; }
  set _consecutiveStarvationSkips(v: number) { this._ts.consecutiveStarvationSkips = v; }

  get fpsFrameCount(): number { return this._ts.fpsFrameCount; }
  set fpsFrameCount(v: number) { this._ts.fpsFrameCount = v; }

  get fpsLastTime(): number { return this._ts.fpsLastTime; }
  set fpsLastTime(v: number) { this._ts.fpsLastTime = v; }

  get _effectiveFps(): number { return this._ts.effectiveFps; }
  set _effectiveFps(v: number) { this._ts.effectiveFps = v; }

  get _subFramePosition(): SubFramePosition | null { return this._ts.subFramePosition; }
  set _subFramePosition(v: SubFramePosition | null) { this._ts.subFramePosition = v; }

  // Host reference
  private _host: PlaybackEngineHost | null = null;

  // Minimum number of frames to buffer before starting playback
  private readonly MIN_PLAYBACK_BUFFER = 10;

  /**
   * Set the host that provides media source access and volume controls.
   */
  setHost(host: PlaybackEngineHost): void {
    this._host = host;
  }

  // ---------------------------------------------------------------
  // Frame & range accessors
  // ---------------------------------------------------------------

  get currentFrame(): number {
    return this._currentFrame;
  }

  set currentFrame(frame: number) {
    const duration = this._host?.getCurrentSource()?.duration ?? 1;
    const clamped = clamp(Math.round(frame), 1, duration);
    if (clamped !== this._currentFrame) {
      this._currentFrame = clamped;
      this.syncVideoToFrame();
      this.emit('frameChanged', this._currentFrame);
    }
  }

  /** Direct access for internal mutations that bypass clamping/events (e.g. GTO restore) */
  setCurrentFrameInternal(frame: number): void {
    this._currentFrame = frame;
  }

  get inPoint(): number {
    return this._inPoint;
  }

  /** Direct access for internal mutations that bypass events */
  setInPointInternal(value: number): void {
    this._inPoint = value;
  }

  get outPoint(): number {
    return this._outPoint;
  }

  /** Direct access for internal mutations that bypass events */
  setOutPointInternal(value: number): void {
    this._outPoint = value;
  }

  get fps(): number {
    return this._fps;
  }

  set fps(value: number) {
    const clamped = clamp(value, 1, 120);
    if (clamped !== this._fps) {
      this._fps = clamped;
      this.emit('fpsChanged', this._fps);
    }
  }

  /** Direct access for internal FPS mutations that bypass events */
  setFpsInternal(value: number): void {
    this._fps = value;
  }

  get frameIncrement(): number {
    return this._frameIncrement;
  }

  set frameIncrement(value: number) {
    const clamped = clamp(value, 1, 100);
    if (clamped !== this._frameIncrement) {
      this._frameIncrement = clamped;
      this.emit('frameIncrementChanged', this._frameIncrement);
    }
  }

  /** Direct access for internal frame increment mutations that bypass events */
  setFrameIncrementInternal(value: number): void {
    this._frameIncrement = value;
  }

  get frameCount(): number {
    return this._outPoint - this._inPoint + 1;
  }

  // ---------------------------------------------------------------
  // Playback speed
  // ---------------------------------------------------------------

  get playbackSpeed(): number {
    return this._playbackSpeed;
  }

  set playbackSpeed(value: number) {
    const clamped = clamp(value, 0.1, 8);
    if (clamped !== this._playbackSpeed) {
      this._playbackSpeed = clamped;

      // Reset frame accumulator on speed change to prevent timing discontinuity
      if (this._isPlaying) {
        this._timingController.resetTiming(this._ts);
      }

      this.emit('playbackSpeedChanged', this._playbackSpeed);
      // Update video playback rate if playing a video natively
      const source = this._host?.getCurrentSource();
      if (source?.element && source.type === 'video') {
        (source.element as HTMLVideoElement).playbackRate = this._playbackSpeed;
      }
    }
  }

  increaseSpeed(): void {
    const currentIndex = PLAYBACK_SPEED_PRESETS.indexOf(this._playbackSpeed as PlaybackSpeedPreset);
    if (currentIndex >= 0 && currentIndex < PLAYBACK_SPEED_PRESETS.length - 1) {
      const nextSpeed = PLAYBACK_SPEED_PRESETS[currentIndex + 1];
      if (nextSpeed !== undefined) {
        this.playbackSpeed = nextSpeed;
      }
    } else if (currentIndex === -1) {
      const nextPreset = PLAYBACK_SPEED_PRESETS.find(p => p > this._playbackSpeed);
      if (nextPreset !== undefined) {
        this.playbackSpeed = nextPreset;
      }
    }
  }

  decreaseSpeed(): void {
    const currentIndex = PLAYBACK_SPEED_PRESETS.indexOf(this._playbackSpeed as PlaybackSpeedPreset);
    if (currentIndex > 0) {
      const prevSpeed = PLAYBACK_SPEED_PRESETS[currentIndex - 1];
      if (prevSpeed !== undefined) {
        this.playbackSpeed = prevSpeed;
      }
    } else if (currentIndex === -1) {
      const prevPreset = [...PLAYBACK_SPEED_PRESETS].reverse().find(p => p < this._playbackSpeed);
      if (prevPreset !== undefined) {
        this.playbackSpeed = prevPreset;
      }
    }
  }

  resetSpeed(): void {
    this.playbackSpeed = 1;
  }

  // ---------------------------------------------------------------
  // Playback state
  // ---------------------------------------------------------------

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isBuffering(): boolean {
    return this._ts.isBuffering;
  }

  get loopMode(): LoopMode {
    return this._loopMode;
  }

  set loopMode(mode: LoopMode) {
    if (mode !== this._loopMode) {
      this._loopMode = mode;
      this.emit('loopModeChanged', mode);
    }
  }

  get playDirection(): number {
    return this._playDirection;
  }

  get effectiveFps(): number {
    return this._isPlaying ? this._ts.effectiveFps : 0;
  }

  get interpolationEnabled(): boolean {
    return this._interpolationEnabled;
  }

  set interpolationEnabled(value: boolean) {
    if (value !== this._interpolationEnabled) {
      this._interpolationEnabled = value;
      if (!value) {
        this._timingController.clearSubFramePosition(this._ts);
        this.emit('subFramePositionChanged', null);
      }
      this.emit('interpolationEnabledChanged', this._interpolationEnabled);
    }
  }

  get subFramePosition(): SubFramePosition | null {
    return this._ts.subFramePosition;
  }

  // Expose pending play promise for test access
  get pendingPlayPromise(): Promise<void> | null {
    return this._pendingPlayPromise;
  }

  // ---------------------------------------------------------------
  // Play / Pause
  // ---------------------------------------------------------------

  play(): void {
    if (this._isPlaying) return;

    // Guard against concurrent play() calls
    if (this._pendingPlayPromise) {
      return;
    }

    this._isPlaying = true;
    this._timingController.resetTiming(this._ts);
    this._timingController.resetFpsTracking(this._ts);

    const source = this._host?.getCurrentSource();

    // Check if we should use mediabunny for smooth playback
    if (source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny()) {
      source.videoSourceNode.setPlaybackDirection(this._playDirection);
      source.videoSourceNode.startPlaybackPreload(this._currentFrame, this._playDirection);

      // For HDR video, buffer frames before allowing frame advancement.
      // The serial decoder needs time to fill the cache ahead of playback.
      if (source.videoSourceNode.isHDR?.()) {
        this._hdrBuffering = true;
        if (this._timingController.incrementBuffering(this._ts)) {
          this.emit('buffering', true);
        }
      }

      // Trigger initial buffer loading
      this.triggerInitialBufferLoad(source.videoSourceNode, this._currentFrame, this._playDirection);

      // Also start preloading for source B (for split screen support)
      this.startSourceBPlaybackPreload();

      // For mediabunny mode, start audio sync at current position
      if (source.element instanceof HTMLVideoElement) {
        const video = source.element;
        const targetTime = (this._currentFrame - 1) / this._fps;
        video.currentTime = targetTime;

        if (this._playDirection === 1) {
          this._host?.safeVideoPlay(video);
        } else {
          video.muted = true;
          video.pause();
        }
      }
    } else if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      // Fallback to native video playback (only for forward)
      if (this._playDirection === 1) {
        this._host?.safeVideoPlay(source.element);
      } else {
        source.element.pause();
      }
    }

    // Enable audio sync for playback
    this._host?.setAudioSyncEnabled(this._playDirection === 1);

    this.emit('playbackChanged', true);
  }

  pause(): void {
    if (this._isPlaying) {
      this._pendingPlayPromise = null;
      this._isPlaying = false;
      this._hdrBuffering = false;

      // Clear pending play promise so play() can be called again
      this._pendingPlayPromise = null;
      this._pendingFetchFrame = null;

      // Reset buffering state
      if (this._timingController.resetBuffering(this._ts)) {
        this.emit('buffering', false);
      }

      // Pause video if current source is video
      const source = this._host?.getCurrentSource();
      if (source?.type === 'video') {
        if (source.videoSourceNode?.isUsingMediabunny()) {
          source.videoSourceNode.stopPlaybackPreload();
        }
        if (source.element instanceof HTMLVideoElement) {
          source.element.pause();
        }
      }

      // Also stop source B's playback preload
      this.stopSourceBPlaybackPreload();

      // Clear sub-frame position when paused
      if (this._timingController.clearSubFramePosition(this._ts)) {
        this.emit('subFramePositionChanged', null);
      }

      this.emit('playbackChanged', false);
    }
  }

  togglePlayback(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  togglePlayDirection(): void {
    this._playDirection *= -1;

    const source = this._host?.getCurrentSource();

    // Update audio mute state based on direction
    this._host?.setAudioSyncEnabled(this._playDirection === 1);

    // Handle video playback mode switching while playing
    if (this._isPlaying && source?.type === 'video') {
      if (source.videoSourceNode?.isUsingMediabunny()) {
        source.videoSourceNode.setPlaybackDirection(this._playDirection);
        source.videoSourceNode.startPlaybackPreload(this._currentFrame, this._playDirection);
        this._timingController.resetTiming(this._ts);

        if (source.element instanceof HTMLVideoElement) {
          if (this._playDirection === 1) {
            this._host?.applyVolumeToVideo();
            this._host?.safeVideoPlay(source.element);
          } else {
            source.element.muted = true;
            source.element.pause();
          }
        }
      } else if (source.element instanceof HTMLVideoElement) {
        if (this._playDirection === 1) {
          this._host?.applyVolumeToVideo();
          this._host?.safeVideoPlay(source.element);
        } else {
          source.element.pause();
          this._timingController.resetTiming(this._ts);
        }
      }
    }

    this.emit('playDirectionChanged', this._playDirection);
  }

  // ---------------------------------------------------------------
  // Frame navigation
  // ---------------------------------------------------------------

  stepForward(): void {
    this.pause();
    this.advanceFrame(this._frameIncrement);
  }

  stepBackward(): void {
    this.pause();
    this.advanceFrame(-this._frameIncrement);
  }

  goToFrame(frame: number): void {
    this.currentFrame = frame;
  }

  goToStart(): void {
    this.currentFrame = this._inPoint;
  }

  goToEnd(): void {
    this.currentFrame = this._outPoint;
  }

  // ---------------------------------------------------------------
  // In/out points
  // ---------------------------------------------------------------

  setInPoint(frame?: number): void {
    const newInPoint = clamp(frame ?? this._currentFrame, 1, this._outPoint);
    if (newInPoint !== this._inPoint) {
      this._inPoint = newInPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame < this._inPoint) {
      this.currentFrame = this._inPoint;
    }
  }

  setOutPoint(frame?: number): void {
    const duration = this._host?.getCurrentSource()?.duration ?? 1;
    const newOutPoint = clamp(frame ?? this._currentFrame, this._inPoint, duration);
    if (newOutPoint !== this._outPoint) {
      this._outPoint = newOutPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame > this._outPoint) {
      this.currentFrame = this._outPoint;
    }
  }

  resetInOutPoints(): void {
    const duration = this._host?.getCurrentSource()?.duration ?? 1;
    this._inPoint = 1;
    this._outPoint = duration;
    this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    this.currentFrame = 1;
  }

  // ---------------------------------------------------------------
  // Update loop (called each animation frame)
  // ---------------------------------------------------------------

  update(): void {
    if (!this._isPlaying) return;

    // During HDR initial buffering, skip frame advancement.
    // The decoder is filling the cache; once ready, _hdrBuffering is cleared
    // and timing is reset so playback starts cleanly from the buffered position.
    if (this._hdrBuffering) return;

    const source = this._host?.getCurrentSource();
    const tc = this._timingController;

    // Check if using mediabunny for smooth frame-accurate playback
    if (source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny()) {
      const { frameDuration } = tc.accumulateDelta(
        this._ts, this._fps, this._playbackSpeed, this._playDirection,
      );

      while (tc.hasAccumulatedFrame(this._ts, frameDuration)) {
        const nextFrame = tc.computeNextFrame(
          this._currentFrame, this._playDirection,
          this._inPoint, this._outPoint, this._loopMode,
        );

        if (source.videoSourceNode.hasFrameCached(nextFrame)) {
          PerfTrace.count('frame.cacheHit');
          tc.onFrameDisplayed(this._ts);
          this._pendingFetchFrame = null;
          tc.consumeFrame(this._ts, frameDuration);
          this.advanceFrame(this._playDirection);
          // Update source B's playback buffer for split screen support
          this.updateSourceBPlaybackBuffer(nextFrame);
          source.videoSourceNode.updatePlaybackBuffer(nextFrame);
        } else {
          PerfTrace.count('frame.cacheMiss');
          tc.capAccumulator(this._ts, frameDuration);
          tc.beginStarvation(this._ts);

          const starvation = tc.checkStarvation(
            this._ts, nextFrame, this._inPoint, this._outPoint, this._playDirection,
          );

          if (starvation.timedOut) {
            if (starvation.shouldPause) {
              log.warn(
                `Playback paused: frame buffer underrun (frame ${nextFrame}, ` +
                `${this._ts.consecutiveStarvationSkips} consecutive starvation timeouts)`
              );
              if (source.element instanceof HTMLVideoElement) {
                source.element.pause();
              }
              this.triggerStarvationRecoveryPreload(source.videoSourceNode, nextFrame, this._playDirection);
              tc.resetStarvation(this._ts);
              this._pendingFetchFrame = null;
              this.pause();
              return;
            }

            if (starvation.nearEnd) {
              if (this._loopMode === 'loop') {
                this._currentFrame = this._playDirection > 0 ? this._inPoint : this._outPoint;
                tc.resetStarvation(this._ts);
                this._pendingFetchFrame = null;
                if (source.element instanceof HTMLVideoElement) {
                  const video = source.element;
                  video.currentTime = (this._currentFrame - 1) / this._fps;
                  if (this._playDirection === 1) {
                    this._host?.safeVideoPlay(video);
                  }
                }
                this.emit('frameChanged', this._currentFrame);
                tc.consumeFrame(this._ts, frameDuration);
                continue;
              } else {
                this.pause();
                return;
              }
            }

            log.warn(`Frame ${nextFrame} starvation timeout (${Math.round(starvation.starvationDurationMs)}ms) - skipping frame`);
            tc.resetStarvation(this._ts);
            this._pendingFetchFrame = null;
            tc.consumeFrame(this._ts, frameDuration);
            this.advanceFrame(this._playDirection);
            continue;
          }

          if (this._pendingFetchFrame !== nextFrame) {
            this._pendingFetchFrame = nextFrame;

            if (tc.incrementBuffering(this._ts)) {
              this.emit('buffering', true);
            }

            source.videoSourceNode.getFrameAsync(nextFrame).then(() => {
              source.videoSourceNode?.updatePlaybackBuffer(nextFrame);
              this.updateSourceBPlaybackBuffer(nextFrame);
              this.decrementBufferingCount();
            }).catch(err => {
              if (err?.name !== 'AbortError') {
                log.warn('Frame fetch error:', err);
              }
              this.decrementBufferingCount();
            });
          }
          break;
        }
      }

      // Compute sub-frame position for interpolation during slow-motion
      this.emitSubFrameUpdate(frameDuration);

      // Sync HTMLVideoElement for audio
      if (this._host?.getAudioSyncEnabled() && source.element instanceof HTMLVideoElement) {
        const video = source.element;
        const targetTime = (this._currentFrame - 1) / this._fps;

        if (video.paused || video.ended) {
          video.currentTime = targetTime;
          this._host?.safeVideoPlay(video);
        } else {
          const drift = Math.abs(video.currentTime - targetTime);
          if (drift > 1.0) {
            video.currentTime = targetTime;
          }
        }
      }
    } else if (source?.type === 'video' && source.element instanceof HTMLVideoElement && this._playDirection === 1) {
      // Fallback: For video with forward playback, sync frame from video time
      const video = source.element;
      const currentTime = video.currentTime;
      const frame = Math.floor(currentTime * this._fps) + 1;

      if (frame !== this._currentFrame) {
        this._currentFrame = clamp(frame, this._inPoint, this._outPoint);
        this.emit('frameChanged', this._currentFrame);
      }

      if (video.ended || frame >= this._outPoint) {
        if (this._loopMode === 'loop') {
          video.currentTime = (this._inPoint - 1) / this._fps;
          this._host?.safeVideoPlay(video);
        } else if (this._loopMode === 'once') {
          this.pause();
        }
      }
    } else {
      // For images or video with reverse playback (no mediabunny)
      const { framesToAdvance, frameDuration } = tc.accumulateFrames(
        this._ts, this._fps, this._playbackSpeed, this._playDirection,
      );

      for (let i = 0; i < framesToAdvance; i++) {
        this.advanceFrame(this._playDirection);
      }

      this.emitSubFrameUpdate(frameDuration);

      if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
        const targetTime = (this._currentFrame - 1) / this._fps;
        source.element.currentTime = targetTime;
      }
    }
  }

  // ---------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------

  /**
   * Called by Session.safeVideoPlay to track the pending play promise.
   */
  setPendingPlayPromise(promise: Promise<void> | null): void {
    this._pendingPlayPromise = promise;
  }

  /** Delegate sub-frame position update to the timing controller */
  private emitSubFrameUpdate(frameDuration: number): void {
    const result = this._timingController.updateSubFramePosition(
      this._ts,
      this._interpolationEnabled,
      this._playbackSpeed,
      this._currentFrame,
      this._playDirection,
      this._inPoint,
      this._outPoint,
      this._loopMode,
      frameDuration,
    );

    if (result === null) {
      this.emit('subFramePositionChanged', null);
    } else if (result !== undefined) {
      this.emit('subFramePositionChanged', result);
    }
  }

  advanceFrame(direction: number): void {
    // Track effective FPS via timing controller
    this._timingController.trackFrameAdvance(this._ts);

    let nextFrame = this._currentFrame + direction;

    if (nextFrame > this._outPoint) {
      switch (this._loopMode) {
        case 'once':
          this.pause();
          nextFrame = this._outPoint;
          break;
        case 'loop':
          nextFrame = this._inPoint;
          break;
        case 'pingpong':
          this._playDirection = -1;
          this.emit('playDirectionChanged', this._playDirection);
          nextFrame = this._outPoint - 1;
          break;
      }
    } else if (nextFrame < this._inPoint) {
      switch (this._loopMode) {
        case 'once':
          this.pause();
          nextFrame = this._inPoint;
          break;
        case 'loop':
          nextFrame = this._outPoint;
          break;
        case 'pingpong':
          this._playDirection = 1;
          this.emit('playDirectionChanged', this._playDirection);
          nextFrame = this._inPoint + 1;
          break;
      }
    }

    this.currentFrame = nextFrame;
  }

  private syncVideoToFrame(): void {
    const source = this._host?.getCurrentSource();
    if (source?.type === 'video') {
      if (source.videoSourceNode?.isUsingMediabunny()) {
        source.videoSourceNode.preloadFrames(this._currentFrame).catch(err => {
          log.warn('Frame preload error:', err);
        });
      }

      if (source.element instanceof HTMLVideoElement && !this._isPlaying) {
        const targetTime = (this._currentFrame - 1) / this._fps;
        if (Math.abs(source.element.currentTime - targetTime) > 0.1) {
          source.element.currentTime = targetTime;
        }
      }
    }
  }

  private triggerInitialBufferLoad(
    videoSourceNode: import('../../nodes/sources/VideoSourceNode').VideoSourceNode,
    startFrame: number,
    direction: number
  ): void {
    const duration = this._outPoint - this._inPoint + 1;
    const bufferSize = Math.min(this.MIN_PLAYBACK_BUFFER, duration);

    const framesToBuffer: number[] = [];
    for (let i = 0; i < bufferSize; i++) {
      const frame = startFrame + (i * direction);
      if (frame >= this._inPoint && frame <= this._outPoint) {
        framesToBuffer.push(frame);
      }
    }

    if (this._hdrBuffering) {
      // HDR: decode sequentially (serial decoder) and release the buffering
      // gate once all frames are pre-decoded. This gives playback a runway
      // so it doesn't stall waiting for each frame individually.
      (async () => {
        for (const frame of framesToBuffer) {
          if (!this._isPlaying) break; // bail if stopped during buffer
          await videoSourceNode.getFrameAsync(frame);
        }
        if (this._isPlaying && this._hdrBuffering) {
          this._hdrBuffering = false;
          this._timingController.resetTiming(this._ts);
          this.decrementBufferingCount();
        }
      })();
      return;
    }

    Promise.allSettled(
      framesToBuffer.map(frame => videoSourceNode.getFrameAsync(frame))
    ).then(results => {
      for (const result of results) {
        if (result.status === 'rejected' && result.reason?.name !== 'AbortError') {
          log.debug('Initial buffer preload error:', result.reason);
        }
      }
    });
  }

  private triggerStarvationRecoveryPreload(
    videoSourceNode: import('../../nodes/sources/VideoSourceNode').VideoSourceNode,
    fromFrame: number,
    direction: number
  ): void {
    const RECOVERY_BUFFER_SIZE = 10;
    const duration = this._outPoint - this._inPoint + 1;
    const bufferSize = Math.min(RECOVERY_BUFFER_SIZE, duration);

    const framesToBuffer: number[] = [];
    for (let i = 0; i < bufferSize; i++) {
      const frame = fromFrame + (i * direction);
      if (frame >= this._inPoint && frame <= this._outPoint) {
        framesToBuffer.push(frame);
      }
    }

    if (framesToBuffer.length === 0) return;

    Promise.allSettled(
      framesToBuffer.map(frame => videoSourceNode.getFrameAsync(frame))
    ).then(results => {
      for (const result of results) {
        if (result.status === 'rejected' && result.reason?.name !== 'AbortError') {
          log.debug('Starvation recovery preload error:', result.reason);
        }
      }
    });
  }

  private decrementBufferingCount(): void {
    if (this._timingController.decrementBuffering(this._ts)) {
      if (this._isPlaying) {
        this.emit('buffering', false);
      }
    }
  }

  // ---------------------------------------------------------------
  // Source B helpers (for split screen support)
  // ---------------------------------------------------------------

  private updateSourceBPlaybackBuffer(frame: number): void {
    const sourceB = this._host?.getSourceB();
    if (!sourceB || sourceB.type !== 'video') return;

    if (sourceB.videoSourceNode?.isUsingMediabunny()) {
      sourceB.videoSourceNode.updatePlaybackBuffer(frame);
    }
  }

  private startSourceBPlaybackPreload(): void {
    const sourceB = this._host?.getSourceB();
    if (!sourceB || sourceB.type !== 'video') return;

    if (sourceB.videoSourceNode?.isUsingMediabunny()) {
      sourceB.videoSourceNode.setPlaybackDirection(this._playDirection);
      sourceB.videoSourceNode.startPlaybackPreload(this._currentFrame, this._playDirection);
    }
  }

  private stopSourceBPlaybackPreload(): void {
    const sourceB = this._host?.getSourceB();
    if (!sourceB || sourceB.type !== 'video') return;

    if (sourceB.videoSourceNode?.isUsingMediabunny()) {
      sourceB.videoSourceNode.stopPlaybackPreload();
    }
  }
}
