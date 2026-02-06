import { SimpleReader, GTODTO } from 'gto-js';
import type { GTOData } from 'gto-js';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  SequenceFrame,
  SequenceInfo,
  createSequenceInfo,
  loadFrameImage,
  preloadFrames,
  releaseDistantFrames,
  disposeSequence,
} from '../../utils/SequenceLoader';
import { VideoSourceNode } from '../../nodes/sources/VideoSourceNode';
import { FileSourceNode } from '../../nodes/sources/FileSourceNode';
import type { UnsupportedCodecError, CodecFamily } from '../../utils/CodecUtils';
import {
  Annotation,
  PenStroke,
  TextAnnotation,
  BrushType,
  LineJoin,
  LineCap,
  StrokeMode,
  TextOrigin,
  PaintEffects,
  RV_PEN_WIDTH_SCALE,
  RV_TEXT_SIZE_SCALE,
} from '../../paint/types';
import type { ColorAdjustments } from '../../ui/components/ColorControls';
import type { FilterSettings } from '../../ui/components/FilterControl';
import type { Transform2D } from '../../ui/components/TransformControl';
import type { CropState } from '../../ui/components/CropControl';
import type { ChannelMode } from '../../ui/components/ChannelSelect';
import type { ScopesState } from '../../ui/components/ScopesControl';
import type { CDLValues } from '../../color/CDL';
import type { LensDistortionParams } from '../../transform/LensDistortion';
import type { StereoState } from '../../stereo/StereoRenderer';
import type { StereoEyeTransformState, StereoAlignMode } from '../../stereo/StereoEyeTransform';
import { Graph } from '../graph/Graph';
import { loadGTOGraph } from './GTOGraphLoader';
import type { GTOParseResult } from './GTOGraphLoader';
import type { SubFramePosition } from '../../utils/FrameInterpolator';

export type { SubFramePosition };

export interface GTOComponentDTO {
  property(name: string): {
    value(): unknown;
  };
}

export interface ParsedAnnotations {
  annotations: Annotation[];
  effects?: Partial<PaintEffects>;
}

/**
 * Information about an unsupported video codec
 */
export interface UnsupportedCodecInfo {
  filename: string;
  codec: string | null;
  codecFamily: CodecFamily;
  error: UnsupportedCodecError;
}

export interface GTOViewSettings {
  colorAdjustments?: Partial<ColorAdjustments>;
  filterSettings?: FilterSettings;
  cdl?: CDLValues;
  transform?: Transform2D;
  lens?: LensDistortionParams;
  crop?: CropState;
  channelMode?: ChannelMode;
  stereo?: StereoState;
  stereoEyeTransform?: StereoEyeTransformState;
  stereoAlignMode?: StereoAlignMode;
  scopes?: ScopesState;
}

/**
 * Marker data structure with optional note and color
 */
export interface Marker {
  frame: number;
  note: string;
  color: string; // Hex color like '#ff0000'
  endFrame?: number; // Optional end frame for duration/range markers
}

/**
 * Matte overlay settings for letterbox/pillarbox display
 */
export interface MatteSettings {
  show: boolean;
  aspect: number;        // Target aspect ratio (e.g., 2.35 for cinemascope)
  opacity: number;       // Matte opacity (0-1)
  heightVisible: number; // Visible height fraction (-1 = auto)
  centerPoint: [number, number]; // Center offset
}

/**
 * Session metadata from GTO file
 */
export interface SessionMetadata {
  displayName: string;
  comment: string;
  version: number;
  origin: string;
  creationContext: number;
  clipboard: number;
  membershipContains: string[];
}

/**
 * Default marker colors palette
 */
export const MARKER_COLORS = [
  '#ff4444', // Red
  '#44ff44', // Green
  '#4444ff', // Blue
  '#ffff44', // Yellow
  '#ff44ff', // Magenta
  '#44ffff', // Cyan
  '#ff8844', // Orange
  '#8844ff', // Purple
] as const;

export type MarkerColor = typeof MARKER_COLORS[number];

/**
 * Audio playback error types
 */
export interface AudioPlaybackError {
  type: 'autoplay' | 'decode' | 'network' | 'aborted' | 'unknown';
  message: string;
  originalError?: Error;
}

export interface SessionEvents extends EventMap {
  frameChanged: number;
  playbackChanged: boolean;
  sourceLoaded: MediaSource;
  sessionLoaded: void;
  durationChanged: number;
  inOutChanged: { inPoint: number; outPoint: number };
  loopModeChanged: LoopMode;
  playDirectionChanged: number;
  playbackSpeedChanged: number;
  preservesPitchChanged: boolean;
  marksChanged: ReadonlyMap<number, Marker>;
  annotationsLoaded: ParsedAnnotations;
  settingsLoaded: GTOViewSettings;
  volumeChanged: number;
  mutedChanged: boolean;
  graphLoaded: GTOParseResult;
  fpsChanged: number;
  abSourceChanged: { current: 'A' | 'B'; sourceIndex: number };
  // New events for GTO session integration
  paintEffectsLoaded: Partial<PaintEffects>;
  matteChanged: MatteSettings;
  metadataChanged: SessionMetadata;
  frameIncrementChanged: number;
  // Audio playback events
  audioError: AudioPlaybackError;
  // Codec events
  unsupportedCodec: UnsupportedCodecInfo;
  // Sub-frame interpolation events
  interpolationEnabledChanged: boolean;
  subFramePositionChanged: SubFramePosition | null;
}

export type LoopMode = 'once' | 'loop' | 'pingpong';
export type MediaType = 'image' | 'video' | 'sequence';

export interface MediaSource {
  type: MediaType;
  name: string;
  url: string;
  width: number;
  height: number;
  duration: number; // in frames
  fps: number;
  element?: HTMLImageElement | HTMLVideoElement;
  // Sequence-specific data
  sequenceInfo?: SequenceInfo;
  sequenceFrames?: SequenceFrame[];
  // Video source node for mediabunny frame extraction
  videoSourceNode?: VideoSourceNode;
  // File source node for EXR files (supports layer selection)
  fileSourceNode?: FileSourceNode;
}

// Common playback speed presets
export const PLAYBACK_SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 4, 8] as const;
export type PlaybackSpeedPreset = typeof PLAYBACK_SPEED_PRESETS[number];

// Maximum reverse playback speed - higher speeds may outpace frame extraction
const MAX_REVERSE_SPEED = 4;

// Starvation timeout - if frame extraction hangs for this long, skip the frame
const STARVATION_TIMEOUT_MS = 5000;

export class Session extends EventEmitter<SessionEvents> {
  private _currentFrame = 1;
  private _inPoint = 1;
  private _outPoint = 1;
  private _fps = 24;
  private _isPlaying = false;
  private _playDirection = 1;
  private _playbackSpeed = 1;
  private _loopMode: LoopMode = 'loop';
  private _marks = new Map<number, Marker>();
  private _volume = 0.7;
  private _muted = false;
  private _previousVolume = 0.7; // For unmute restore
  private _preservesPitch = true; // Pitch correction at non-1x speeds (default: on)
  private _interpolationEnabled = false; // Sub-frame interpolation for slow-motion (default: off)
  private _subFramePosition: SubFramePosition | null = null; // Current sub-frame position (non-null during slow-mo with interpolation)

  // Playback guard to prevent concurrent play() calls
  private _pendingPlayPromise: Promise<void> | null = null;
  private _audioSyncEnabled = true; // Controls whether to sync video element for audio

  // Session integration properties
  private _frameIncrement = 1;
  private _matteSettings: MatteSettings | null = null;
  private _sessionPaintEffects: Partial<PaintEffects> | null = null;
  private _metadata: SessionMetadata = {
    displayName: '',
    comment: '',
    version: 2,
    origin: 'openrv-web',
    creationContext: 0,
    clipboard: 0,
    membershipContains: [],
  };

  private lastFrameTime = 0;
  private frameAccumulator = 0;

  // Buffering state - counter to handle multiple concurrent frame requests
  // Only emit 'buffering: false' when counter reaches 0
  private _bufferingCount = 0;
  private _isBuffering = false;

  // Starvation tracking - timestamp when starvation started
  private _starvationStartTime = 0;

  // Effective FPS tracking
  private fpsFrameCount = 0;
  private fpsLastTime = 0;
  private _effectiveFps = 0;

  // Media sources
  protected sources: MediaSource[] = [];
  private _currentSourceIndex = 0;

  // A/B source comparison
  private _sourceAIndex = 0;
  private _sourceBIndex = -1; // -1 means no B source assigned
  private _currentAB: 'A' | 'B' = 'A';
  private _syncPlayhead = true;

  // Node graph from GTO file
  protected _graph: Graph | null = null;
  private _graphParseResult: GTOParseResult | null = null;
  private _gtoData: GTOData | null = null;


  constructor() {
    super();
  }

  /**
   * Add a source to the session and auto-configure A/B compare.
   * When the second source is added, it automatically becomes source B.
   *
   * Note: If playback is active when this method is called, it will be paused
   * automatically. This prevents timing state corruption where accumulated
   * frame timing from the previous source would be incorrectly applied to the
   * new source. A 'playbackChanged' event will be emitted in this case.
   */
  protected addSource(source: MediaSource): void {
    // Pause playback before adding new source to prevent timing state corruption
    // The timing variables (lastFrameTime, frameAccumulator) from the old source
    // would cause issues if applied to the new source
    if (this._isPlaying) {
      this.pause();
    }

    this.sources.push(source);
    this._currentSourceIndex = this.sources.length - 1;

    // Auto-assign source B when second source is loaded
    if (this.sources.length === 2 && this._sourceBIndex === -1) {
      this._sourceBIndex = 1; // Second source becomes B
      this._sourceAIndex = 0; // First source is A

      // Keep showing source A (stay on first source) for consistent A/B compare UX
      // Note: The newly loaded source's sourceLoaded event will still fire,
      // but we set the index to A so toggling to B shows the new source
      this._currentSourceIndex = this._sourceAIndex;

      // Emit event so UI updates
      this.emit('abSourceChanged', {
        current: this._currentAB,
        sourceIndex: this._sourceAIndex,
      });
    }
  }

  /**
   * Get the node graph (if loaded from GTO)
   */
  get graph(): Graph | null {
    return this._graph;
  }

  /**
   * Get the full parse result including session info
   */
  get graphParseResult(): GTOParseResult | null {
    return this._graphParseResult;
  }

  get gtoData(): GTOData | null {
    return this._gtoData;
  }

  get currentFrame(): number {
    return this._currentFrame;
  }

  set currentFrame(frame: number) {
    // Allow seeking within full source duration, not just in/out range
    const duration = this.currentSource?.duration ?? 1;
    const clamped = Math.max(1, Math.min(duration, Math.round(frame)));
    if (clamped !== this._currentFrame) {
      this._currentFrame = clamped;
      this.syncVideoToFrame();
      this.emit('frameChanged', this._currentFrame);
    }
  }

  get inPoint(): number {
    return this._inPoint;
  }

  get outPoint(): number {
    return this._outPoint;
  }

  get fps(): number {
    return this._fps;
  }

  set fps(value: number) {
    const clamped = Math.max(1, Math.min(120, value));
    if (clamped !== this._fps) {
      this._fps = clamped;
      this.emit('fpsChanged', this._fps);
    }
  }

  /** Frame increment for step forward/backward */
  get frameIncrement(): number {
    return this._frameIncrement;
  }

  set frameIncrement(value: number) {
    const clamped = Math.max(1, Math.min(100, value));
    if (clamped !== this._frameIncrement) {
      this._frameIncrement = clamped;
      this.emit('frameIncrementChanged', this._frameIncrement);
    }
  }

  /** Matte overlay settings */
  get matteSettings(): MatteSettings | null {
    return this._matteSettings;
  }

  /** Paint effects from session (ghost, hold, etc.) */
  get sessionPaintEffects(): Partial<PaintEffects> | null {
    return this._sessionPaintEffects;
  }

  /** Session metadata (name, comment, version, origin) */
  get metadata(): SessionMetadata {
    return this._metadata;
  }

  get playbackSpeed(): number {
    return this._playbackSpeed;
  }

  set playbackSpeed(value: number) {
    const clamped = Math.max(0.1, Math.min(8, value));
    if (clamped !== this._playbackSpeed) {
      this._playbackSpeed = clamped;

      // Reset frame accumulator on speed change to prevent timing discontinuity
      // This avoids frame skips when changing speed during playback
      if (this._isPlaying) {
        this.frameAccumulator = 0;
        this.lastFrameTime = performance.now();
      }

      this.emit('playbackSpeedChanged', this._playbackSpeed);
      // Update video playback rate if playing a video natively
      const source = this.currentSource;
      if (source?.element && source.type === 'video') {
        (source.element as HTMLVideoElement).playbackRate = this._playbackSpeed;
      }
    }
  }

  /**
   * Increase playback speed to the next preset level
   */
  increaseSpeed(): void {
    const currentIndex = PLAYBACK_SPEED_PRESETS.indexOf(this._playbackSpeed as PlaybackSpeedPreset);
    if (currentIndex >= 0 && currentIndex < PLAYBACK_SPEED_PRESETS.length - 1) {
      const nextSpeed = PLAYBACK_SPEED_PRESETS[currentIndex + 1];
      if (nextSpeed !== undefined) {
        this.playbackSpeed = nextSpeed;
      }
    } else if (currentIndex === -1) {
      // Find next higher preset
      const nextPreset = PLAYBACK_SPEED_PRESETS.find(p => p > this._playbackSpeed);
      if (nextPreset !== undefined) {
        this.playbackSpeed = nextPreset;
      }
    }
  }

  /**
   * Decrease playback speed to the previous preset level
   */
  decreaseSpeed(): void {
    const currentIndex = PLAYBACK_SPEED_PRESETS.indexOf(this._playbackSpeed as PlaybackSpeedPreset);
    if (currentIndex > 0) {
      const prevSpeed = PLAYBACK_SPEED_PRESETS[currentIndex - 1];
      if (prevSpeed !== undefined) {
        this.playbackSpeed = prevSpeed;
      }
    } else if (currentIndex === -1) {
      // Find previous lower preset
      const prevPreset = [...PLAYBACK_SPEED_PRESETS].reverse().find(p => p < this._playbackSpeed);
      if (prevPreset !== undefined) {
        this.playbackSpeed = prevPreset;
      }
    }
  }

  /**
   * Reset playback speed to 1x
   */
  resetSpeed(): void {
    this.playbackSpeed = 1;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isBuffering(): boolean {
    return this._isBuffering;
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

  get frameCount(): number {
    return this._outPoint - this._inPoint + 1;
  }

  get marks(): ReadonlyMap<number, Marker> {
    return this._marks;
  }

  /**
   * Get all marked frame numbers (for backward compatibility)
   */
  get markedFrames(): number[] {
    return Array.from(this._marks.keys());
  }

  /**
   * Get marker at a specific frame
   */
  getMarker(frame: number): Marker | undefined {
    return this._marks.get(frame);
  }

  /**
   * Check if a frame has a marker
   */
  hasMarker(frame: number): boolean {
    return this._marks.has(frame);
  }

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
        this.emit('mutedChanged', this._muted);
      }
      this.applyVolumeToVideo();
      this.emit('volumeChanged', this._volume);
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    if (value !== this._muted) {
      this._muted = value;
      this.applyVolumeToVideo();
      this.emit('mutedChanged', this._muted);
    }
  }

  toggleMute(): void {
    if (this._muted) {
      // Unmuting - restore previous volume
      this._muted = false;
      if (this._volume === 0) {
        this._volume = this._previousVolume || 0.7;
        this.emit('volumeChanged', this._volume);
      }
    } else {
      // Muting - save current volume for later restore
      if (this._volume > 0) {
        this._previousVolume = this._volume;
      }
      this._muted = true;
    }
    this.applyVolumeToVideo();
    this.emit('mutedChanged', this._muted);
  }

  /**
   * Whether to preserve audio pitch when playing at non-1x speeds.
   * When true, audio pitch stays the same regardless of playback speed.
   * When false, audio pitch changes proportionally with speed (chipmunk/slow-mo effect).
   * Default: true (most users expect pitch-corrected audio).
   */
  get preservesPitch(): boolean {
    return this._preservesPitch;
  }

  set preservesPitch(value: boolean) {
    if (value !== this._preservesPitch) {
      this._preservesPitch = value;
      this.applyPreservesPitchToVideo();
      this.emit('preservesPitchChanged', this._preservesPitch);
    }
  }

  /**
   * Whether sub-frame interpolation is enabled for slow-motion playback.
   * When true and playing at speeds < 1x, adjacent frames are blended
   * to produce smoother slow-motion output.
   * Default: false (some users want to see exact discrete frames).
   */
  get interpolationEnabled(): boolean {
    return this._interpolationEnabled;
  }

  set interpolationEnabled(value: boolean) {
    if (value !== this._interpolationEnabled) {
      this._interpolationEnabled = value;
      if (!value) {
        this._subFramePosition = null;
        this.emit('subFramePositionChanged', null);
      }
      this.emit('interpolationEnabledChanged', this._interpolationEnabled);
    }
  }

  /**
   * Current sub-frame position during slow-motion playback.
   * Non-null only when interpolation is enabled and playing at < 1x speed.
   * Used by the Viewer to blend adjacent frames for smooth slow-motion.
   */
  get subFramePosition(): SubFramePosition | null {
    return this._subFramePosition;
  }

  /**
   * Apply preservesPitch setting to the current video element.
   * Handles vendor-prefixed properties for cross-browser support.
   */
  private applyPreservesPitchToVideo(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      const video = source.element as HTMLVideoElement;
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
  }

  /**
   * Apply preservesPitch to a newly created video element.
   */
  private initVideoPreservesPitch(video: HTMLVideoElement): void {
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

  private applyVolumeToVideo(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      const video = source.element;
      // Apply effective volume (0 if muted, otherwise the actual volume)
      const effectiveVolume = this._muted ? 0 : this._volume;
      video.volume = effectiveVolume;
      video.muted = this._muted;

      // Also mute during reverse playback (sounds bad)
      if (this._playDirection < 0) {
        video.muted = true;
      }
    }
  }

  get currentSource(): MediaSource | null {
    return this.sources[this._currentSourceIndex] ?? null;
  }

  get allSources(): MediaSource[] {
    return this.sources;
  }

  get sourceCount(): number {
    return this.sources.length;
  }

  getSourceByIndex(index: number): MediaSource | null {
    return this.sources[index] ?? null;
  }

  get currentSourceIndex(): number {
    return this._currentSourceIndex;
  }

  // Minimum number of frames to buffer before starting playback
  private readonly MIN_PLAYBACK_BUFFER = 3;

  // Playback control
  play(): void {
    if (this._isPlaying) return;

    // Guard against concurrent play() calls
    if (this._pendingPlayPromise) {
      return;
    }

    this._isPlaying = true;
    this.lastFrameTime = performance.now();
    this.frameAccumulator = 0;

    // Reset FPS tracking
    this.fpsFrameCount = 0;
    this.fpsLastTime = performance.now();
    this._effectiveFps = 0;

    const source = this.currentSource;

    // Check if we should use mediabunny for smooth playback
    if (source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny()) {
      // Use frame-based playback with mediabunny for both forward and reverse
      source.videoSourceNode.setPlaybackDirection(this._playDirection);
      source.videoSourceNode.startPlaybackPreload(this._currentFrame, this._playDirection);

      // Trigger initial buffer loading to avoid starvation at playback start
      this.triggerInitialBufferLoad(source.videoSourceNode, this._currentFrame, this._playDirection);

      // Also start preloading for source B (for split screen support)
      this.startSourceBPlaybackPreload();

      // For mediabunny mode, start audio sync at current position
      if (source.element instanceof HTMLVideoElement) {
        const video = source.element;
        const targetTime = (this._currentFrame - 1) / this._fps;
        video.currentTime = targetTime;

        // Only play audio for forward playback
        if (this._playDirection === 1) {
          this.safeVideoPlay(video);
        } else {
          // Mute during reverse
          video.muted = true;
          video.pause();
        }
      }
    } else if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      // Fallback to native video playback (only for forward)
      if (this._playDirection === 1) {
        this.safeVideoPlay(source.element);
      } else {
        // For reverse playback, keep video paused - we'll seek frame by frame
        source.element.pause();
      }
    }

    // Enable audio sync for playback
    this._audioSyncEnabled = this._playDirection === 1;

    this.emit('playbackChanged', true);
  }

  /**
   * Trigger initial playback buffer loading (fire-and-forget)
   *
   * This kicks off parallel frame loading to prime the cache before
   * the update() loop needs them. The requests go through preloadManager
   * which handles:
   * - Request coalescing (no duplicates with startPlaybackPreload)
   * - Cancellation via abort signal when pause() is called
   *
   * We don't await this because:
   * - Blocking play() would cause UI lag
   * - The frame-gated logic in update() handles waiting for frames
   */
  private triggerInitialBufferLoad(
    videoSourceNode: import('../../nodes/sources/VideoSourceNode').VideoSourceNode,
    startFrame: number,
    direction: number
  ): void {
    const duration = this._outPoint - this._inPoint + 1;
    const bufferSize = Math.min(this.MIN_PLAYBACK_BUFFER, duration);

    // Calculate frames to pre-buffer based on playback direction
    const framesToBuffer: number[] = [];
    for (let i = 0; i < bufferSize; i++) {
      const frame = startFrame + (i * direction);
      if (frame >= this._inPoint && frame <= this._outPoint) {
        framesToBuffer.push(frame);
      }
    }

    // Request frames in parallel - preloadManager coalesces with startPlaybackPreload
    // These requests will be cancelled if pause() is called (via abort signal)
    // Use Promise.allSettled to handle individual failures without losing other results
    Promise.allSettled(
      framesToBuffer.map(frame => videoSourceNode.getFrameAsync(frame))
    ).then(results => {
      for (const result of results) {
        if (result.status === 'rejected' && result.reason?.name !== 'AbortError') {
          console.debug('Initial buffer preload error:', result.reason);
        }
      }
    });
  }

  /**
   * Safely play a video element with proper promise handling
   */
  private async safeVideoPlay(video: HTMLVideoElement): Promise<void> {
    // Create promise before any async operations to prevent race conditions
    const playPromise = (async () => {
      try {
        // Ensure volume is applied before playing
        this.applyVolumeToVideo();

        await video.play();
      } catch (error) {
        const err = error as Error;

        // Handle specific error types
        if (err.name === 'NotAllowedError') {
          // Autoplay policy blocked playback
          this.emit('audioError', {
            type: 'autoplay',
            message: 'Playback blocked by browser autoplay policy. Click the player to enable audio.',
            originalError: err,
          });
          // Continue playing muted - update internal state to match
          video.muted = true;
          this._muted = true;
          this.emit('mutedChanged', this._muted);
          try {
            await video.play();
          } catch {
            // If still failing, pause playback
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
          // Playback was interrupted (e.g., by seeking) - this is normal, don't emit error
          console.debug('Video play() was aborted');
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

    this._pendingPlayPromise = playPromise;

    try {
      await playPromise;
    } finally {
      // Only clear if this is still our promise (prevents clearing newer promises)
      if (this._pendingPlayPromise === playPromise) {
        this._pendingPlayPromise = null;
      }
    }
  }

  pause(): void {
    if (this._isPlaying) {
      this._isPlaying = false;

      // Clear pending play promise so play() can be called again
      this._pendingPlayPromise = null;

      // Reset buffering state
      this.resetBufferingState();

      // Pause video if current source is video
      const source = this.currentSource;
      if (source?.type === 'video') {
        // Stop playback preloading to reset preload state and cancel pending requests
        if (source.videoSourceNode?.isUsingMediabunny()) {
          source.videoSourceNode.stopPlaybackPreload();
        }
        if (source.element instanceof HTMLVideoElement) {
          source.element.pause();
        }
      }

      // Also stop source B's playback preload (for split screen support)
      this.stopSourceBPlaybackPreload();

      // Clear sub-frame position when paused
      if (this._subFramePosition !== null) {
        this._subFramePosition = null;
        this.emit('subFramePositionChanged', null);
      }

      this.emit('playbackChanged', false);
    }
  }

  /**
   * Decrement buffering counter and emit 'buffering: false' when all pending loads complete
   */
  private decrementBufferingCount(): void {
    this._bufferingCount = Math.max(0, this._bufferingCount - 1);
    if (this._bufferingCount === 0 && this._isBuffering) {
      this._isBuffering = false;
      // Only emit if still playing - no need to signal buffering end if paused
      if (this._isPlaying) {
        this.emit('buffering', false);
      }
    }
  }

  /**
   * Reset buffering state (called on pause or stop)
   */
  private resetBufferingState(): void {
    this._bufferingCount = 0;
    this._starvationStartTime = 0;
    if (this._isBuffering) {
      this._isBuffering = false;
      this.emit('buffering', false);
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

    const source = this.currentSource;

    // Update audio mute state based on direction (reverse should be muted)
    this._audioSyncEnabled = this._playDirection === 1;

    // Handle video playback mode switching while playing
    if (this._isPlaying && source?.type === 'video') {
      // If using mediabunny, update direction and restart preloading
      if (source.videoSourceNode?.isUsingMediabunny()) {
        source.videoSourceNode.setPlaybackDirection(this._playDirection);
        source.videoSourceNode.startPlaybackPreload(this._currentFrame, this._playDirection);
        this.lastFrameTime = performance.now();
        this.frameAccumulator = 0;

        // Handle audio for direction change
        if (source.element instanceof HTMLVideoElement) {
          if (this._playDirection === 1) {
            // Switching to forward: resume audio
            this.applyVolumeToVideo();
            this.safeVideoPlay(source.element);
          } else {
            // Switching to reverse: mute and pause audio
            source.element.muted = true;
            source.element.pause();
          }
        }
      } else if (source.element instanceof HTMLVideoElement) {
        // Fallback behavior
        if (this._playDirection === 1) {
          // Switching to forward: start native video playback
          this.applyVolumeToVideo();
          this.safeVideoPlay(source.element);
        } else {
          // Switching to reverse: pause video, will use frame-based seeking
          source.element.pause();
          this.lastFrameTime = performance.now();
          this.frameAccumulator = 0;
        }
      }
    }

    this.emit('playDirectionChanged', this._playDirection);
  }

  get playDirection(): number {
    return this._playDirection;
  }

  /**
   * Get effective FPS (actual frames rendered per second during playback)
   * Returns 0 when not playing
   */
  get effectiveFps(): number {
    return this._isPlaying ? this._effectiveFps : 0;
  }

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

  // In/out points
  setInPoint(frame?: number): void {
    // Clamp to valid range: 1 to outPoint
    const newInPoint = Math.max(1, Math.min(this._outPoint, frame ?? this._currentFrame));
    if (newInPoint !== this._inPoint) {
      this._inPoint = newInPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame < this._inPoint) {
      this.currentFrame = this._inPoint;
    }
  }

  setOutPoint(frame?: number): void {
    const duration = this.currentSource?.duration ?? 1;
    // Clamp to valid range: inPoint to duration
    const newOutPoint = Math.max(this._inPoint, Math.min(duration, frame ?? this._currentFrame));
    if (newOutPoint !== this._outPoint) {
      this._outPoint = newOutPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame > this._outPoint) {
      this.currentFrame = this._outPoint;
    }
  }

  resetInOutPoints(): void {
    const duration = this.currentSource?.duration ?? 1;
    this._inPoint = 1;
    this._outPoint = duration;
    this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    // Also reset playhead to start
    this.currentFrame = 1;
  }

  // Marks
  /**
   * Toggle a mark at the specified frame
   * If the frame has a marker, it removes it; otherwise, it creates a new marker with default color
   */
  toggleMark(frame?: number): void {
    const f = frame ?? this._currentFrame;
    if (this._marks.has(f)) {
      this._marks.delete(f);
    } else {
      // Create a new marker with default values
      this._marks.set(f, {
        frame: f,
        note: '',
        color: MARKER_COLORS[0], // Default red
      });
    }
    this.emit('marksChanged', this._marks);
  }

  /**
   * Add or update a marker at the specified frame
   * If endFrame is provided, the marker spans a range from frame to endFrame
   */
  setMarker(frame: number, note: string = '', color: string = MARKER_COLORS[0], endFrame?: number): void {
    const marker: Marker = {
      frame,
      note,
      color,
    };
    if (endFrame !== undefined && endFrame > frame) {
      marker.endFrame = endFrame;
    }
    this._marks.set(frame, marker);
    this.emit('marksChanged', this._marks);
  }

  /**
   * Update the end frame for an existing marker (to convert to/from duration marker)
   * Pass undefined to remove the end frame (convert back to point marker)
   */
  setMarkerEndFrame(frame: number, endFrame: number | undefined): void {
    const marker = this._marks.get(frame);
    if (marker) {
      if (endFrame !== undefined && endFrame > frame) {
        marker.endFrame = endFrame;
      } else {
        delete marker.endFrame;
      }
      this.emit('marksChanged', this._marks);
    }
  }

  /**
   * Check if a given frame falls within any duration marker's range
   * Returns the marker if found, undefined otherwise
   */
  getMarkerAtFrame(frame: number): Marker | undefined {
    // First check for exact match (point marker or start of range)
    const exact = this._marks.get(frame);
    if (exact) return exact;

    // Then check if frame falls within any duration marker range
    for (const marker of this._marks.values()) {
      if (marker.endFrame !== undefined && frame >= marker.frame && frame <= marker.endFrame) {
        return marker;
      }
    }
    return undefined;
  }

  /**
   * Update the note for an existing marker
   */
  setMarkerNote(frame: number, note: string): void {
    const marker = this._marks.get(frame);
    if (marker) {
      marker.note = note;
      this.emit('marksChanged', this._marks);
    }
  }

  /**
   * Update the color for an existing marker
   */
  setMarkerColor(frame: number, color: string): void {
    const marker = this._marks.get(frame);
    if (marker) {
      marker.color = color;
      this.emit('marksChanged', this._marks);
    }
  }

  /**
   * Remove a marker at the specified frame
   */
  removeMark(frame: number): void {
    if (this._marks.delete(frame)) {
      this.emit('marksChanged', this._marks);
    }
  }

  /**
   * Clear all markers
   */
  clearMarks(): void {
    this._marks.clear();
    this.emit('marksChanged', this._marks);
  }

  /**
   * Navigate to the next marker from current frame
   * Returns the frame number of the next marker, or null if none
   */
  goToNextMarker(): number | null {
    const frames = this.markedFrames.sort((a, b) => a - b);
    for (const frame of frames) {
      if (frame > this._currentFrame) {
        this.currentFrame = frame;
        return frame;
      }
    }
    // Wrap around to first marker if none found after current frame
    const firstFrame = frames[0];
    if (firstFrame !== undefined && firstFrame !== this._currentFrame) {
      this.currentFrame = firstFrame;
      return firstFrame;
    }
    return null;
  }

  /**
   * Navigate to the previous marker from current frame
   * Returns the frame number of the previous marker, or null if none
   */
  goToPreviousMarker(): number | null {
    const frames = this.markedFrames.sort((a, b) => b - a); // Descending
    for (const frame of frames) {
      if (frame < this._currentFrame) {
        this.currentFrame = frame;
        return frame;
      }
    }
    // Wrap around to last marker if none found before current frame
    const lastFrame = frames[0];
    if (lastFrame !== undefined && lastFrame !== this._currentFrame) {
      this.currentFrame = lastFrame;
      return lastFrame;
    }
    return null;
  }

  // Update called each frame
  update(): void {
    if (!this._isPlaying) return;

    const source = this.currentSource;

    // Check if using mediabunny for smooth frame-accurate playback
    if (source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny()) {
      // Use frame-based timing for both forward and reverse
      const now = performance.now();
      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;

      // Limit speed for reverse playback to prevent frame extraction from being outpaced
      const effectiveSpeed = this._playDirection < 0
        ? Math.min(this._playbackSpeed, MAX_REVERSE_SPEED)
        : this._playbackSpeed;
      const frameDuration = (1000 / this._fps) / effectiveSpeed;
      this.frameAccumulator += delta;

      // Only advance if next frame is cached (frame-gated playback)
      // This ensures we always display the correct frame from mediabunny
      while (this.frameAccumulator >= frameDuration) {
        // Compute actual next frame accounting for loop boundaries
        const nextFrame = this.computeNextFrame(this._playDirection);

        // Check if next frame is cached and ready
        if (source.videoSourceNode.hasFrameCached(nextFrame)) {
          // Reset starvation tracking on successful frame
          this._starvationStartTime = 0;
          this.frameAccumulator -= frameDuration;
          this.advanceFrame(this._playDirection);
          // Update source B's playback buffer for split screen support
          this.updateSourceBPlaybackBuffer(nextFrame);
        } else {
          // Frame not ready - trigger fetch and wait
          // Cap accumulator to prevent huge jumps when frame becomes available
          this.frameAccumulator = Math.min(this.frameAccumulator, frameDuration * 2);

          // Track starvation start time
          if (this._starvationStartTime === 0) {
            this._starvationStartTime = performance.now();
          }

          // Check for starvation timeout - if waiting too long, skip the frame
          const starvationDuration = performance.now() - this._starvationStartTime;
          if (starvationDuration > STARVATION_TIMEOUT_MS) {
            console.warn(`Frame ${nextFrame} starvation timeout (${Math.round(starvationDuration)}ms) - skipping frame`);
            this._starvationStartTime = 0;
            this.frameAccumulator -= frameDuration;
            this.advanceFrame(this._playDirection);
            // Emit a starvation event for UI notification (uses existing buffering event)
            continue; // Try the next frame
          }

          // Track buffering state with counter to prevent event flickering
          this._bufferingCount++;
          if (!this._isBuffering) {
            this._isBuffering = true;
            this.emit('buffering', true);
          }

          // Request the frame and trigger surrounding preload via preloadManager
          // getFrameAsync internally uses preloadManager which handles:
          // - Request coalescing (no duplicate requests)
          // - Priority-based loading (requested frame gets priority 0)
          // - Surrounding frame preloading via preloadAround
          source.videoSourceNode.getFrameAsync(nextFrame).then(() => {
            // After frame loads, trigger preloading around it for smooth playback
            // Use optional chaining because source may be disposed/changed during async load
            // (this is intentional - if disposed, we simply skip the buffer update)
            source.videoSourceNode?.updatePlaybackBuffer(nextFrame);
            // Also update source B for split screen mode support
            this.updateSourceBPlaybackBuffer(nextFrame);
            this.decrementBufferingCount();
          }).catch(err => {
            // Don't log abort errors
            if (err?.name !== 'AbortError') {
              console.warn('Frame fetch error:', err);
            }
            this.decrementBufferingCount();
          });
          break;
        }
      }

      // Compute sub-frame position for interpolation during slow-motion
      this.updateSubFramePosition(frameDuration);

      // Sync HTMLVideoElement for audio (but not for frame display)
      // Only sync during forward playback with audio enabled
      if (this._audioSyncEnabled && source.element instanceof HTMLVideoElement) {
        const video = source.element;
        const targetTime = (this._currentFrame - 1) / this._fps;

        // Only sync if significantly out of sync (for audio purposes)
        // Use a larger threshold (0.5s) to avoid stuttering from frequent seeks
        const drift = Math.abs(video.currentTime - targetTime);
        if (drift > 0.5) {
          // Pause, seek, then resume to avoid audio glitches
          const wasPlaying = !video.paused;
          if (wasPlaying) {
            video.pause();
          }
          video.currentTime = targetTime;
          if (wasPlaying) {
            // Use safe play to handle any errors
            this.safeVideoPlay(video);
          }
        }
      }
    } else if (source?.type === 'video' && source.element instanceof HTMLVideoElement && this._playDirection === 1) {
      // Fallback: For video with forward playback, sync frame from video time
      const video = source.element;
      const currentTime = video.currentTime;
      const frame = Math.floor(currentTime * this._fps) + 1;

      if (frame !== this._currentFrame) {
        this._currentFrame = Math.max(this._inPoint, Math.min(this._outPoint, frame));
        this.emit('frameChanged', this._currentFrame);
      }

      // Handle loop
      if (video.ended || frame >= this._outPoint) {
        if (this._loopMode === 'loop') {
          video.currentTime = (this._inPoint - 1) / this._fps;
          this.safeVideoPlay(video);
        } else if (this._loopMode === 'once') {
          this.pause();
        }
      }
    } else {
      // For images or video with reverse playback (no mediabunny), use frame-based timing
      const now = performance.now();
      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;

      // Limit speed for reverse playback
      const effectiveSpeed = this._playDirection < 0
        ? Math.min(this._playbackSpeed, MAX_REVERSE_SPEED)
        : this._playbackSpeed;
      const frameDuration = (1000 / this._fps) / effectiveSpeed;
      this.frameAccumulator += delta;

      while (this.frameAccumulator >= frameDuration) {
        this.frameAccumulator -= frameDuration;
        this.advanceFrame(this._playDirection);
      }

      // Compute sub-frame position for interpolation during slow-motion
      this.updateSubFramePosition(frameDuration);

      // For video reverse playback without mediabunny, seek to the current frame
      if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
        const targetTime = (this._currentFrame - 1) / this._fps;
        source.element.currentTime = targetTime;
      }
    }
  }

  /**
   * Compute the next frame without side effects (for cache checking)
   * Returns the frame number that would be displayed after advancing
   */
  private computeNextFrame(direction: number): number {
    let nextFrame = this._currentFrame + direction;

    if (nextFrame > this._outPoint) {
      switch (this._loopMode) {
        case 'once':
          return this._outPoint;
        case 'loop':
          return this._inPoint;
        case 'pingpong':
          return this._outPoint - 1;
      }
    } else if (nextFrame < this._inPoint) {
      switch (this._loopMode) {
        case 'once':
          return this._inPoint;
        case 'loop':
          return this._outPoint;
        case 'pingpong':
          return this._inPoint + 1;
      }
    }

    return nextFrame;
  }

  /**
   * Update the sub-frame position for interpolation during slow-motion playback.
   *
   * When interpolation is enabled and playing at speeds < 1x, this computes
   * the fractional position between the current frame and the next frame
   * from the frame accumulator. The Viewer uses this to blend adjacent frames.
   *
   * At normal or fast speeds (>= 1x), sub-frame position is cleared since
   * frames change fast enough that blending provides no visual benefit.
   */
  private updateSubFramePosition(frameDuration: number): void {
    if (!this._interpolationEnabled || this._playbackSpeed >= 1) {
      // Clear sub-frame position when not in slow-motion or disabled
      if (this._subFramePosition !== null) {
        this._subFramePosition = null;
        this.emit('subFramePositionChanged', null);
      }
      return;
    }

    // Compute the fractional position between current frame and next
    const ratio = Math.max(0, Math.min(1, this.frameAccumulator / frameDuration));
    const nextFrame = this.computeNextFrame(this._playDirection);

    const newPosition: SubFramePosition = {
      baseFrame: this._currentFrame,
      nextFrame,
      ratio,
    };

    // Only emit if position changed meaningfully (avoid excessive events)
    if (
      !this._subFramePosition ||
      this._subFramePosition.baseFrame !== newPosition.baseFrame ||
      this._subFramePosition.nextFrame !== newPosition.nextFrame ||
      Math.abs(this._subFramePosition.ratio - newPosition.ratio) > 0.005
    ) {
      this._subFramePosition = newPosition;
      this.emit('subFramePositionChanged', this._subFramePosition);
    }
  }

  private advanceFrame(direction: number): void {
    // Track effective FPS
    this.fpsFrameCount++;
    const now = performance.now();
    const elapsed = now - this.fpsLastTime;

    // Update FPS calculation every 500ms for smooth display
    if (elapsed >= 500) {
      this._effectiveFps = Math.round((this.fpsFrameCount / elapsed) * 1000 * 10) / 10;
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }

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
    const source = this.currentSource;
    if (source?.type === 'video') {
      // If using mediabunny, preload frames around current position for scrubbing
      if (source.videoSourceNode?.isUsingMediabunny()) {
        // preloadFrames fetches current frame and surrounding frames
        source.videoSourceNode.preloadFrames(this._currentFrame).catch(err => {
          console.warn('Frame preload error:', err);
        });
      }

      // Sync HTMLVideoElement for audio purposes
      if (source.element instanceof HTMLVideoElement) {
        const targetTime = (this._currentFrame - 1) / this._fps;
        if (Math.abs(source.element.currentTime - targetTime) > 0.1) {
          source.element.currentTime = targetTime;
        }
      }
    }
  }

  // Session loading
  async loadFromGTO(data: ArrayBuffer | string, availableFiles?: Map<string, File>): Promise<void> {
    const reader = new SimpleReader();

    try {
      if (typeof data === 'string') {
        reader.open(data);
      } else {
        // Check if it's text format GTO (starts with "GTOa")
        const bytes = new Uint8Array(data);
        const isTextFormat =
          bytes[0] === 0x47 && // 'G'
          bytes[1] === 0x54 && // 'T'
          bytes[2] === 0x4f && // 'O'
          bytes[3] === 0x61;   // 'a'

        if (isTextFormat) {
          // Convert to string for text format parsing
          const textContent = new TextDecoder('utf-8').decode(bytes);
          reader.open(textContent);
        } else {
          // Binary format
          reader.open(bytes);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('GTO parsing error:', message);
      throw new Error(`Failed to parse GTO file: ${message}`);
    }

    this._gtoData = reader.result as GTOData;
    const dto = new GTODTO(reader.result);
    this.parseSession(dto);

    // Parse the node graph from the already-parsed GTO (avoids double parsing)
    try {
      const result = loadGTOGraph(dto, availableFiles);
      this._graph = result.graph;
      this._graphParseResult = result;

      // Apply session info from GTO
      if (result.sessionInfo.fps) {
        this.fps = result.sessionInfo.fps;
      }
      if (result.sessionInfo.frame) {
        this._currentFrame = result.sessionInfo.frame;
      }
      if (result.sessionInfo.inPoint !== undefined && result.sessionInfo.outPoint !== undefined) {
        this._inPoint = result.sessionInfo.inPoint;
        this._outPoint = result.sessionInfo.outPoint;
        this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
      }
      if (result.sessionInfo.marks && result.sessionInfo.marks.length > 0) {
        this._marks = new Map();
        for (const frame of result.sessionInfo.marks) {
          this._marks.set(frame, {
            frame,
            note: '',
            color: MARKER_COLORS[0],
          });
        }
        this.emit('marksChanged', this._marks);
      }

      // Apply frame increment
      if (result.sessionInfo.inc !== undefined) {
        this._frameIncrement = result.sessionInfo.inc;
        this.emit('frameIncrementChanged', this._frameIncrement);
      }

      // Apply paint effects from session
      if (result.sessionInfo.paintEffects) {
        this._sessionPaintEffects = result.sessionInfo.paintEffects;
        this.emit('paintEffectsLoaded', this._sessionPaintEffects);
      }

      // Apply matte settings
      if (result.sessionInfo.matte) {
        const m = result.sessionInfo.matte;
        this._matteSettings = {
          show: m.show ?? false,
          aspect: m.aspect ?? 1.78,
          opacity: m.opacity ?? 0.66,
          heightVisible: m.heightVisible ?? -1,
          centerPoint: m.centerPoint ?? [0, 0],
        };
        this.emit('matteChanged', this._matteSettings);
      }

      // Apply session metadata
      if (result.sessionInfo.displayName || result.sessionInfo.comment ||
          result.sessionInfo.version || result.sessionInfo.origin ||
          result.sessionInfo.creationContext !== undefined ||
          result.sessionInfo.clipboard !== undefined ||
          result.sessionInfo.membershipContains) {
        this._metadata = {
          displayName: result.sessionInfo.displayName ?? '',
          comment: result.sessionInfo.comment ?? '',
          version: result.sessionInfo.version ?? 2,
          origin: result.sessionInfo.origin ?? 'openrv-web',
          creationContext: result.sessionInfo.creationContext ?? 0,
          clipboard: result.sessionInfo.clipboard ?? 0,
          membershipContains: result.sessionInfo.membershipContains ?? [],
        };
        this.emit('metadataChanged', this._metadata);
      }

      if (result.nodes.size > 0) {
        console.debug('GTO Graph loaded:', {
          nodeCount: result.nodes.size,
          rootNode: result.rootNode?.name,
          sessionInfo: result.sessionInfo,
        });
      }

      this.emit('graphLoaded', result);

      // Load video sources from graph nodes that have file data
      await this.loadVideoSourcesFromGraph(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Failed to load node graph from GTO:', message);
      // Non-fatal - continue with session
    }

    this.emit('sessionLoaded', undefined);
  }

  /**
   * Load video sources from the graph nodes that have file data
   * This enables mediabunny frame-accurate extraction for videos loaded from GTO
   */
  private async loadVideoSourcesFromGraph(result: GTOParseResult): Promise<void> {
    for (const [, node] of result.nodes) {
      if (node instanceof VideoSourceNode) {
        // Check if this node has a file property (set by GTOGraphLoader when matching files)
        const file = node.properties.getValue('file') as File | undefined;
        const url = node.properties.getValue('url') as string | undefined;

        if (file) {
          console.log(`Loading video source "${node.name}" from file: ${file.name}`);

          // Load the video using the file - this initializes mediabunny
          await node.loadFile(file, this._fps);

          const metadata = node.getMetadata();
          const duration = metadata.duration;

          // Also create HTMLVideoElement for audio playback
          const blobUrl = URL.createObjectURL(file);
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = this._muted;
          video.volume = this._muted ? 0 : this._volume;
          video.loop = false;
          video.playsInline = true;
          this.initVideoPreservesPitch(video);

          await new Promise<void>((resolve, reject) => {
            video.oncanplay = () => {
              video.oncanplay = null;
              resolve();
            };
            video.onerror = () => reject(new Error('Failed to load video element'));
            video.src = blobUrl;
            video.load();
          });

          const source: MediaSource = {
            type: 'video',
            name: node.name,
            url: blobUrl,
            width: metadata.width,
            height: metadata.height,
            duration,
            fps: this._fps,
            element: video,
            videoSourceNode: node,
          };

          // Pre-fetch initial frames for immediate display
          if (node.isUsingMediabunny()) {
            node.preloadFrames(1).catch(err => {
              console.warn('Initial frame preload error:', err);
            });
          }

          this.addSource(source);

          // Update session duration to match the first video source
          if (this._outPoint === 0 || this._outPoint < duration) {
            this._inPoint = 1;
            this._outPoint = duration;
          }

          // Detect actual FPS and frame count from video
          if (node.isUsingMediabunny()) {
            this.detectVideoFpsAndDuration(source, node);
          }

          this.emit('sourceLoaded', source);
          this.emit('durationChanged', duration);
        } else if (url) {
          // Fallback: load from URL only (no mediabunny - File object not available)
          console.log(`Loading video source "${node.name}" from URL (no mediabunny): ${url}`);

          await node.load(url, node.name, this._fps);

          const metadata = node.getMetadata();
          const duration = metadata.duration;

          // Create HTMLVideoElement
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = this._muted;
          video.volume = this._muted ? 0 : this._volume;
          video.loop = false;
          video.playsInline = true;
          this.initVideoPreservesPitch(video);

          await new Promise<void>((resolve, reject) => {
            video.oncanplay = () => {
              video.oncanplay = null;
              resolve();
            };
            video.onerror = () => reject(new Error('Failed to load video element'));
            video.src = url;
            video.load();
          });

          const source: MediaSource = {
            type: 'video',
            name: node.name,
            url,
            width: metadata.width,
            height: metadata.height,
            duration,
            fps: this._fps,
            element: video,
            videoSourceNode: node,
          };

          this.addSource(source);

          // Update session duration
          if (this._outPoint === 0 || this._outPoint < duration) {
            this._inPoint = 1;
            this._outPoint = duration;
          }

          this.emit('sourceLoaded', source);
          this.emit('durationChanged', duration);
        }
      }
    }
  }

  private parseSession(dto: GTODTO): void {
    // Debug: Log all available protocols
    console.log('GTO Result:', dto);

    const sessions = dto.byProtocol('RVSession');
    console.log('RVSession objects:', sessions.length);
    if (sessions.length === 0) {
      console.warn('No RVSession found in file');
    } else {
      const session = sessions.first();
      const sessionComp = session.component('session');
      if (sessionComp?.exists()) {
        const resolveRange = (value: unknown): [number, number] | undefined => {
          const normalized = Array.isArray(value)
            ? value
            : ArrayBuffer.isView(value)
              ? Array.from(value as unknown as ArrayLike<number>)
              : null;

          if (!normalized || normalized.length === 0) {
            return undefined;
          }

          if (normalized.length >= 2) {
            const start = normalized[0];
            const end = normalized[1];
            if (typeof start === 'number' && typeof end === 'number') {
              return [start, end];
            }
            if (Array.isArray(start) && start.length >= 2) {
              const startValue = start[0];
              const endValue = start[1];
              if (typeof startValue === 'number' && typeof endValue === 'number') {
                return [startValue, endValue];
              }
            }
          }

          if (normalized.length === 1 && Array.isArray(normalized[0]) && normalized[0].length >= 2) {
            const startValue = normalized[0][0];
            const endValue = normalized[0][1];
            if (typeof startValue === 'number' && typeof endValue === 'number') {
              return [startValue, endValue];
            }
          }

          return undefined;
        };

        const frameValue = this.getNumberValue(sessionComp.property('frame').value());
        const currentFrameValue = this.getNumberValue(sessionComp.property('currentFrame').value());
        if (frameValue !== undefined || currentFrameValue !== undefined) {
          this._currentFrame = frameValue ?? currentFrameValue ?? this._currentFrame;
        }

        const regionValue = sessionComp.property('region').value();
        const rangeValue = sessionComp.property('range').value();
        const resolvedRange = resolveRange(regionValue) ?? resolveRange(rangeValue);
        if (resolvedRange) {
          this._inPoint = resolvedRange[0];
          this._outPoint = resolvedRange[1];
          this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
        }

        const marksValue = sessionComp.property('marks').value();
        if (Array.isArray(marksValue)) {
          const marks = marksValue.filter((value): value is number => typeof value === 'number');
          if (marks.length > 0) {
            this._marks = new Map();
            for (const frame of marks) {
              this._marks.set(frame, {
                frame,
                note: '',
                color: MARKER_COLORS[0],
              });
            }
            this.emit('marksChanged', this._marks);
          }
        }
      }
    }

    // Parse file sources and get aspect ratio
    let aspectRatio = 1;
    let sourceWidth = 0;
    let sourceHeight = 0;
    const sources = dto.byProtocol('RVFileSource');
    console.log('RVFileSource objects:', sources.length);
    for (const source of sources) {
      // Get size from proxy component
      const proxyComp = source.component('proxy');
      if (proxyComp?.exists()) {
        const sizeValue = proxyComp.property('size').value();
        const size = this.getNumberArray(sizeValue);
        if (size && size.length >= 2) {
          const width = size[0]!;
          const height = size[1]!;
          if (width > 0 && height > 0) {
            if (sourceWidth === 0 && sourceHeight === 0) {
              sourceWidth = width;
              sourceHeight = height;
            }
            aspectRatio = width / height;
            console.log('Source size:', width, 'x', height, 'aspect:', aspectRatio);
          }
        }
      }

      const mediaObj = source.component('media');
      if (mediaObj) {
        const movieProp = mediaObj.property('movie').value();
        if (movieProp) {
          console.log('Found source:', movieProp);
        }
      }
    }

    // Parse paint annotations with aspect ratio
    this.parsePaintAnnotations(dto, aspectRatio);

    const settings = this.parseInitialSettings(dto, { width: sourceWidth, height: sourceHeight });
    if (settings) {
      this.emit('settingsLoaded', settings);
    }
  }

  private getNumberValue(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === 'number') {
        return first;
      }
      if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'number') {
        return first[0];
      }
    }
    return undefined;
  }

  private getBooleanValue(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === 'boolean') {
        return first;
      }
      if (typeof first === 'number') {
        return first !== 0;
      }
      if (typeof first === 'string') {
        const normalized = first.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') {
          return true;
        }
        if (normalized === 'false' || normalized === '0') {
          return false;
        }
      }
    }
    return undefined;
  }

  private getNumberArray(value: unknown): number[] | undefined {
    if (!Array.isArray(value) || value.length === 0) {
      return undefined;
    }
    const first = value[0];
    if (typeof first === 'number') {
      return value.filter((entry): entry is number => typeof entry === 'number');
    }
    if (Array.isArray(first)) {
      const numbers = first.filter((entry): entry is number => typeof entry === 'number');
      return numbers.length > 0 ? numbers : undefined;
    }
    return undefined;
  }

  private getStringValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0];
    }
    return undefined;
  }

  private parseInitialSettings(dto: GTODTO, sourceInfo: { width: number; height: number }): GTOViewSettings | null {
    const settings: GTOViewSettings = {};

    const colorAdjustments = this.parseColorAdjustments(dto);
    if (colorAdjustments && Object.keys(colorAdjustments).length > 0) {
      settings.colorAdjustments = colorAdjustments;
    }

    const cdl = this.parseCDL(dto);
    if (cdl) {
      settings.cdl = cdl;
    }

    const transform = this.parseTransform(dto);
    if (transform) {
      settings.transform = transform;
    }

    const lens = this.parseLens(dto);
    if (lens) {
      settings.lens = lens;
    }

    const crop = this.parseCrop(dto, sourceInfo);
    if (crop) {
      settings.crop = crop;
    }

    const channelMode = this.parseChannelMode(dto);
    if (channelMode) {
      settings.channelMode = channelMode;
    }

    const stereo = this.parseStereo(dto);
    if (stereo) {
      settings.stereo = stereo;
    }

    const scopes = this.parseScopes(dto);
    if (scopes) {
      settings.scopes = scopes;
    }

    return Object.keys(settings).length > 0 ? settings : null;
  }

  private parseColorAdjustments(dto: GTODTO): Partial<ColorAdjustments> | null {
    const adjustments: Partial<ColorAdjustments> = {};
    const colorNodes = dto.byProtocol('RVColor');

    if (colorNodes.length > 0) {
      const colorComp = colorNodes.first().component('color');
      if (colorComp?.exists()) {
        const exposure = this.getNumberValue(colorComp.property('exposure').value());
        const gamma = this.getNumberValue(colorComp.property('gamma').value());
        const contrast = this.getNumberValue(colorComp.property('contrast').value());
        const saturation = this.getNumberValue(colorComp.property('saturation').value());
        const offset = this.getNumberValue(colorComp.property('offset').value());

        if (typeof exposure === 'number') adjustments.exposure = exposure;
        if (typeof gamma === 'number') adjustments.gamma = gamma;
        if (typeof contrast === 'number') adjustments.contrast = contrast === 0 ? 1 : contrast;
        if (typeof saturation === 'number') adjustments.saturation = saturation;
        if (typeof offset === 'number' && adjustments.brightness === undefined) {
          adjustments.brightness = offset;
        }
      }
    }

    const displayColorNodes = dto.byProtocol('RVDisplayColor');
    if (displayColorNodes.length > 0) {
      const displayComp = displayColorNodes.first().component('color');
      if (displayComp?.exists()) {
        const brightness = this.getNumberValue(displayComp.property('brightness').value());
        const gamma = this.getNumberValue(displayComp.property('gamma').value());
        if (typeof brightness === 'number') adjustments.brightness = brightness;
        if (typeof gamma === 'number' && adjustments.gamma === undefined) adjustments.gamma = gamma;
      }
    }

    return Object.keys(adjustments).length > 0 ? adjustments : null;
  }

  private parseCDL(dto: GTODTO): CDLValues | null {
    const buildCDL = (values: { slope?: number[]; offset?: number[]; power?: number[]; saturation?: number }): CDLValues | null => {
      const slope = values.slope ?? [];
      const offset = values.offset ?? [];
      const power = values.power ?? [];
      const saturation = values.saturation;

      if (slope.length < 3 || offset.length < 3 || power.length < 3 || typeof saturation !== 'number') {
        return null;
      }

      return {
        slope: { r: slope[0]!, g: slope[1]!, b: slope[2]! },
        offset: { r: offset[0]!, g: offset[1]!, b: offset[2]! },
        power: { r: power[0]!, g: power[1]!, b: power[2]! },
        saturation,
      };
    };

    const readCDLFromNodes = (nodes: ReturnType<GTODTO['byProtocol']>): CDLValues | null => {
      for (const node of nodes) {
        const cdlComp = node.component('CDL');
        if (!cdlComp?.exists()) continue;

        const active = this.getNumberValue(cdlComp.property('active').value());
        if (active !== undefined && active === 0) {
          continue;
        }

        const slope = this.getNumberArray(cdlComp.property('slope').value());
        const offset = this.getNumberArray(cdlComp.property('offset').value());
        const power = this.getNumberArray(cdlComp.property('power').value());
        const saturation = this.getNumberValue(cdlComp.property('saturation').value());
        const cdl = buildCDL({ slope, offset, power, saturation });
        if (cdl) return cdl;
      }
      return null;
    };

    return readCDLFromNodes(dto.byProtocol('RVColor')) ?? readCDLFromNodes(dto.byProtocol('RVLinearize'));
  }

  private parseTransform(dto: GTODTO): Transform2D | null {
    const nodes = dto.byProtocol('RVTransform2D');
    if (nodes.length === 0) return null;

    const transformComp = nodes.first().component('transform');
    if (!transformComp?.exists()) return null;

    const active = this.getNumberValue(transformComp.property('active').value());
    if (active !== undefined && active === 0) return null;

    const rotationValue = this.getNumberValue(transformComp.property('rotate').value());
    const flipValue = this.getNumberValue(transformComp.property('flip').value());
    const flopValue = this.getNumberValue(transformComp.property('flop').value());

    const rotationOptions: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    let rotation: 0 | 90 | 180 | 270 = 0;

    if (typeof rotationValue === 'number') {
      const snapped = Math.round(rotationValue / 90) * 90;
      if (rotationOptions.includes(snapped as 0 | 90 | 180 | 270)) {
        rotation = snapped as 0 | 90 | 180 | 270;
      }
    }

    // Parse scale and translate if available
    const scaleValue = transformComp.property('scale').value();
    const translateValue = transformComp.property('translate').value();

    let scale = { x: 1, y: 1 };
    let translate = { x: 0, y: 0 };

    if (Array.isArray(scaleValue) && scaleValue.length >= 2) {
      const sx = typeof scaleValue[0] === 'number' ? scaleValue[0] : 1;
      const sy = typeof scaleValue[1] === 'number' ? scaleValue[1] : 1;
      scale = { x: sx, y: sy };
    }

    if (Array.isArray(translateValue) && translateValue.length >= 2) {
      const tx = typeof translateValue[0] === 'number' ? translateValue[0] : 0;
      const ty = typeof translateValue[1] === 'number' ? translateValue[1] : 0;
      translate = { x: tx, y: ty };
    }

    return {
      rotation,
      flipH: flopValue === 1,
      flipV: flipValue === 1,
      scale,
      translate,
    };
  }

  private parseLens(dto: GTODTO): LensDistortionParams | null {
    const nodes = dto.byProtocol('RVLensWarp');
    if (nodes.length === 0) return null;

    const node = nodes.first();
    const nodeComp = node.component('node');
    if (nodeComp?.exists()) {
      const active = this.getNumberValue(nodeComp.property('active').value());
      if (active !== undefined && active === 0) return null;
    }

    const warpComp = node.component('warp');
    if (!warpComp?.exists()) return null;

    const k1 = this.getNumberValue(warpComp.property('k1').value());
    const k2 = this.getNumberValue(warpComp.property('k2').value());
    const center = this.getNumberArray(warpComp.property('center').value());

    if (k1 === undefined && k2 === undefined && !center) return null;

    // Read additional properties if available
    const k3 = this.getNumberValue(warpComp.property('k3').value());
    const p1 = this.getNumberValue(warpComp.property('p1').value());
    const p2 = this.getNumberValue(warpComp.property('p2').value());
    const scaleValue = this.getNumberValue(warpComp.property('scale').value());
    const model = warpComp.property('model').value() as string | undefined;
    const pixelAspectRatio = this.getNumberValue(warpComp.property('pixelAspectRatio').value());
    const fx = this.getNumberValue(warpComp.property('fx').value());
    const fy = this.getNumberValue(warpComp.property('fy').value());
    const cropRatioX = this.getNumberValue(warpComp.property('cropRatioX').value());
    const cropRatioY = this.getNumberValue(warpComp.property('cropRatioY').value());

    const validModels = ['brown', 'opencv', 'pfbarrel', '3de4_radial_standard', '3de4_anamorphic'] as const;
    const parsedModel = validModels.includes(model as typeof validModels[number])
      ? (model as typeof validModels[number])
      : 'brown';

    const params: LensDistortionParams = {
      k1: k1 ?? 0,
      k2: k2 ?? 0,
      k3: k3 ?? 0,
      p1: p1 ?? 0,
      p2: p2 ?? 0,
      centerX: 0,
      centerY: 0,
      scale: scaleValue ?? 1,
      model: parsedModel,
      pixelAspectRatio: pixelAspectRatio ?? 1,
      fx: fx ?? 1,
      fy: fy ?? 1,
      cropRatioX: cropRatioX ?? 1,
      cropRatioY: cropRatioY ?? 1,
    };

    if (center && center.length >= 2) {
      params.centerX = center[0]! - 0.5;
      params.centerY = center[1]! - 0.5;
    }

    return params;
  }

  private parseCrop(dto: GTODTO, sourceInfo: { width: number; height: number }): CropState | null {
    const nodes = dto.byProtocol('RVFormat');
    if (nodes.length === 0) return null;

    const cropComp = nodes.first().component('crop');
    if (!cropComp?.exists()) return null;

    const active = this.getNumberValue(cropComp.property('active').value());
    const xmin = this.getNumberValue(cropComp.property('xmin').value());
    const ymin = this.getNumberValue(cropComp.property('ymin').value());
    const xmax = this.getNumberValue(cropComp.property('xmax').value());
    const ymax = this.getNumberValue(cropComp.property('ymax').value());

    const enabled = active === 1;
    if (!enabled && xmin === undefined && ymin === undefined && xmax === undefined && ymax === undefined) {
      return null;
    }

    const { width, height } = sourceInfo;
    let region = { x: 0, y: 0, width: 1, height: 1 };

    if (width > 0 && height > 0 && xmin !== undefined && ymin !== undefined && xmax !== undefined && ymax !== undefined) {
      const cropWidth = Math.max(0, xmax - xmin);
      const cropHeight = Math.max(0, ymax - ymin);
      region = {
        x: Math.max(0, Math.min(1, xmin / width)),
        y: Math.max(0, Math.min(1, ymin / height)),
        width: Math.max(0, Math.min(1, cropWidth / width)),
        height: Math.max(0, Math.min(1, cropHeight / height)),
      };
    }

    return {
      enabled,
      region,
      aspectRatio: null,
    };
  }

  private parseChannelMode(dto: GTODTO): ChannelMode | null {
    const nodes = dto.byProtocol('ChannelSelect');
    if (nodes.length === 0) return null;

    const channelMap: Record<number, ChannelMode> = {
      0: 'red',
      1: 'green',
      2: 'blue',
      3: 'alpha',
      4: 'rgb',
      5: 'luminance',
    };

    for (const node of nodes) {
      const nodeComp = node.component('node');
      const active = nodeComp?.exists() ? this.getNumberValue(nodeComp.property('active').value()) : undefined;
      if (active !== undefined && active === 0) {
        continue;
      }

      const parametersComp = node.component('parameters');
      const channelValue = parametersComp?.exists()
        ? this.getNumberValue(parametersComp.property('channel').value())
        : undefined;
      if (channelValue !== undefined) {
        return channelMap[channelValue] ?? 'rgb';
      }
    }

    return null;
  }

  private parseStereo(dto: GTODTO): StereoState | null {
    const nodes = dto.byProtocol('RVDisplayStereo');
    if (nodes.length === 0) return null;

    const stereoComp = nodes.first().component('stereo');
    if (!stereoComp?.exists()) return null;

    const typeValue = this.getStringValue(stereoComp.property('type').value()) ?? 'off';
    const swapValue = this.getNumberValue(stereoComp.property('swap').value());
    const offsetValue = this.getNumberValue(stereoComp.property('relativeOffset').value());

    const typeMap: Record<string, StereoState['mode']> = {
      off: 'off',
      mono: 'off',
      pair: 'side-by-side',
      mirror: 'mirror',
      hsqueezed: 'side-by-side',
      vsqueezed: 'over-under',
      anaglyph: 'anaglyph',
      lumanaglyph: 'anaglyph-luminance',
      checker: 'checkerboard',
      scanline: 'scanline',
    };

    const mode = typeMap[typeValue] ?? 'off';
    const offset = typeof offsetValue === 'number' ? offsetValue * 100 : 0;
    const clampedOffset = Math.max(-20, Math.min(20, offset));

    return {
      mode,
      eyeSwap: swapValue === 1,
      offset: clampedOffset,
    };
  }

  private parseScopes(dto: GTODTO): ScopesState | null {
    const scopes: ScopesState = {
      histogram: false,
      waveform: false,
      vectorscope: false,
    };

    const applyScope = (protocol: string, key: keyof ScopesState): void => {
      const nodes = dto.byProtocol(protocol);
      if (nodes.length === 0) return;
      const node = nodes.first();
      const nodeComp = node.component('node');
      const active = nodeComp?.exists() ? this.getNumberValue(nodeComp.property('active').value()) : undefined;
      if (active !== undefined) {
        scopes[key] = active !== 0;
      }
    };

    applyScope('Histogram', 'histogram');
    applyScope('RVHistogram', 'histogram');
    applyScope('Waveform', 'waveform');
    applyScope('RVWaveform', 'waveform');
    applyScope('Vectorscope', 'vectorscope');
    applyScope('RVVectorscope', 'vectorscope');

    if (scopes.histogram || scopes.waveform || scopes.vectorscope) {
      return scopes;
    }

    return null;
  }

  private parsePaintAnnotations(dto: GTODTO, aspectRatio: number): void {
    const paintObjects = dto.byProtocol('RVPaint');
    console.log('RVPaint objects:', paintObjects.length);

    if (paintObjects.length === 0) {
      return;
    }

    const annotations: Annotation[] = [];
    let effects: Partial<PaintEffects> | undefined;

    for (const paintObj of paintObjects) {
      console.log('Paint object:', paintObj.name);

      // Get all components from this paint object using the components() method
      const allComponents = paintObj.components();
      if (!allComponents || allComponents.length === 0) continue;

      // Find frame components and stroke/text components
      const frameOrders = new Map<number, string[]>();
      const strokeData = new Map<string, GTOComponentDTO>();

      for (const comp of allComponents) {
        const compName = comp.name;

        if (compName.startsWith('frame:')) {
          // Parse frame order component like "frame:15"
          const frameNum = parseInt(compName.split(':')[1] ?? '1', 10);
          const orderProp = comp.property('order');
          if (orderProp?.exists()) {
            // Order can be a string or string array
            const orderValue = orderProp.value();
            const order = Array.isArray(orderValue) ? orderValue : [orderValue];
            frameOrders.set(frameNum, order as string[]);
          }
        } else if (compName.startsWith('pen:') || compName.startsWith('text:')) {
          // Store stroke/text data for later lookup
          strokeData.set(compName, comp);
        }
      }

      console.log('Frame orders:', Object.fromEntries(frameOrders));
      console.log('Stroke data keys:', Array.from(strokeData.keys()));

      // Parse strokes and text for each frame
      for (const [frame, order] of frameOrders) {
        for (const strokeId of order) {
          const comp = strokeData.get(strokeId);
          if (!comp) continue;

          if (strokeId.startsWith('pen:')) {
            const stroke = this.parsePenStroke(strokeId, frame, comp, aspectRatio);
            if (stroke) {
              annotations.push(stroke);
            }
          } else if (strokeId.startsWith('text:')) {
            const text = this.parseTextAnnotation(strokeId, frame, comp, aspectRatio);
            if (text) {
              annotations.push(text);
            }
          }
        }
      }

      // Parse effects/settings from paint component
      const paintComp = paintObj.component('paint');
      if (paintComp?.exists()) {
        const ghost = this.getBooleanValue(paintComp.property('ghost').value());
        const hold = this.getBooleanValue(paintComp.property('hold').value());
        const ghostBefore = this.getNumberValue(paintComp.property('ghostBefore').value());
        const ghostAfter = this.getNumberValue(paintComp.property('ghostAfter').value());

        const nextEffects: Partial<PaintEffects> = {
          ...(ghost !== undefined ? { ghost } : {}),
          ...(hold !== undefined ? { hold } : {}),
          ...(ghostBefore !== undefined ? { ghostBefore: Math.round(ghostBefore) } : {}),
          ...(ghostAfter !== undefined ? { ghostAfter: Math.round(ghostAfter) } : {}),
        };

        if (Object.keys(nextEffects).length > 0) {
          effects = { ...effects, ...nextEffects };
        }
      }

      const tagComp = paintObj.component('tag');
      if (tagComp?.exists()) {
        const annotateValue = this.getStringValue(tagComp.property('annotate').value());
        if (annotateValue) {
          const tagEffects = this.parsePaintTagEffects(annotateValue);
          if (tagEffects) {
            effects = { ...effects, ...tagEffects };
          }
        }
      }

      const annotationComp = paintObj.component('annotation');
      if (annotationComp?.exists()) {
        const ghost = this.getBooleanValue(annotationComp.property('ghost').value());
        const hold = this.getBooleanValue(annotationComp.property('hold').value());
        const ghostBefore = this.getNumberValue(annotationComp.property('ghostBefore').value());
        const ghostAfter = this.getNumberValue(annotationComp.property('ghostAfter').value());

        const nextEffects: Partial<PaintEffects> = {
          ...(ghost !== undefined ? { ghost } : {}),
          ...(hold !== undefined ? { hold } : {}),
          ...(ghostBefore !== undefined ? { ghostBefore: Math.round(ghostBefore) } : {}),
          ...(ghostAfter !== undefined ? { ghostAfter: Math.round(ghostAfter) } : {}),
        };

        if (Object.keys(nextEffects).length > 0) {
          effects = { ...effects, ...nextEffects };
        }
      }

    }

    console.log('Total annotations parsed:', annotations.length);
    if (annotations.length > 0 || effects) {
      this.emit('annotationsLoaded', { annotations, effects });
    }
  }

  private parsePaintTagEffects(tagValue: string): Partial<PaintEffects> | null {
    const trimmed = tagValue.trim();
    if (!trimmed) return null;

    const result: Partial<PaintEffects> = {};
    const applyValue = (key: string, rawValue: unknown): void => {
      if (rawValue === undefined || rawValue === null) return;
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      const booleanValue = this.getBooleanValue(value);
      const numberValue = this.getNumberValue(value) ??
        (typeof value === 'string' && value.length > 0 && !isNaN(Number(value))
          ? Number(value)
          : undefined);

      switch (key) {
        case 'ghost':
          if (booleanValue !== undefined) {
            result.ghost = booleanValue;
          }
          break;
        case 'hold':
          if (booleanValue !== undefined) {
            result.hold = booleanValue;
          }
          break;
        case 'ghostbefore':
          if (numberValue !== undefined) {
            result.ghostBefore = Math.round(numberValue);
          }
          break;
        case 'ghostafter':
          if (numberValue !== undefined) {
            result.ghostAfter = Math.round(numberValue);
          }
          break;
        default:
          break;
      }
    };

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown> | Array<Record<string, unknown>>;
        const target = Array.isArray(parsed) ? parsed[0] : parsed;
        if (target && typeof target === 'object') {
          Object.entries(target).forEach(([key, value]) => {
            const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
            applyValue(normalized, value);
          });
        }
      } catch {
        // fall through to string parsing
      }
    }

    if (Object.keys(result).length === 0) {
      const normalizedText = trimmed.replace(/;/g, ' ').replace(/,/g, ' ');
      const pairRegex = /([a-zA-Z][a-zA-Z0-9_-]*)\s*[:=]\s*([^\s]+)/g;
      let match: RegExpExecArray | null = null;
      while ((match = pairRegex.exec(normalizedText)) !== null) {
        const key = match[1] ?? '';
        const value = match[2] ?? '';
        const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
        applyValue(normalized, value);
      }

      if (/\bghost\b/i.test(normalizedText) && result.ghost === undefined) {
        result.ghost = true;
      }
      if (/\bhold\b/i.test(normalizedText) && result.hold === undefined) {
        result.hold = true;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  // Parse a single pen stroke from RV GTO format
  // strokeId format: "pen:ID:FRAME:USER" e.g., "pen:1:15:User"
  protected parsePenStroke(strokeId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number): PenStroke | null {
    // Parse user from strokeId (e.g., "pen:1:15:User" -> "User")
    const parts = strokeId.split(':');
    const user = parts[3] ?? 'unknown';
    const id = parts[1] ?? '0';

    // Get properties from component using the ComponentDTO API
    const colorValue = comp.property('color').value();
    const widthValue = comp.property('width').value();
    const brushValue = comp.property('brush').value();
    const pointsValue = comp.property('points').value();
    const joinValue = comp.property('join').value();
    const capValue = comp.property('cap').value();
    const splatValue = comp.property('splat').value();

    // Parse color - stored as float[4] in GTO
    let color: [number, number, number, number] = [1, 0, 0, 1];
    if (colorValue && Array.isArray(colorValue) && colorValue.length >= 4) {
      color = [colorValue[0], colorValue[1], colorValue[2], colorValue[3]];
    }

    // Parse width - can be a single value or array (per-point width)
    let width = 3;
      if (widthValue) {
      if (Array.isArray(widthValue) && widthValue.length > 0) {
        // Use the first width value, convert from normalized to pixel
        width = (widthValue[0] as number) * RV_PEN_WIDTH_SCALE;
      } else if (typeof widthValue === 'number') {
        width = widthValue * RV_PEN_WIDTH_SCALE;
      }
    }


    // Parse brush type
    const brushType = brushValue === 'gaussian' ? BrushType.Gaussian : BrushType.Circle;

    // Parse points - stored as float[2] array (flat: [x1, y1, x2, y2, ...])
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -0.5 to +0.5
    const points: Array<{ x: number; y: number; pressure?: number }> = [];
    if (pointsValue && Array.isArray(pointsValue)) {
      // Check if it's a nested array [[x,y], [x,y]] or flat [x, y, x, y]
      const isNested = pointsValue.length > 0 && Array.isArray(pointsValue[0]);
      
      if (isNested) {
        // Nested format: [[x,y], [x,y]]
        for (const point of pointsValue) {
          if (Array.isArray(point) && point.length >= 2) {
            const rawX = point[0] as number;
            const rawY = point[1] as number;
            points.push({
              x: rawX / aspectRatio + 0.5,
              y: rawY + 0.5,
            });
          }
        }
      } else {
        // Flat format: [x, y, x, y] - chunk into pairs
        for (let i = 0; i < pointsValue.length; i += 2) {
          if (i + 1 < pointsValue.length) {
            const rawX = pointsValue[i] as number;
            const rawY = pointsValue[i + 1] as number;
            points.push({
              x: rawX / aspectRatio + 0.5,
              y: rawY + 0.5,
            });
          }
        }
      }
    }

    if (points.length === 0) {
      console.warn('Stroke has no points:', strokeId);
      return null;
    }

    // Parse line join (0=miter, 1=round, 2=bevel - GTO uses different values)
    let join = LineJoin.Round;
    if (joinValue !== null && joinValue !== undefined) {
      const joinVal = joinValue as number;
      if (joinVal === 0) join = LineJoin.Miter;
      else if (joinVal === 2) join = LineJoin.Bevel;
      // 1 and 3 are round variants
    }

    // Parse line cap
    let cap = LineCap.Round;
    if (capValue !== null && capValue !== undefined) {
      const capVal = capValue as number;
      if (capVal === 0) cap = LineCap.NoCap;
      else if (capVal === 2) cap = LineCap.Square;
    }

    const stroke: PenStroke = {
      type: 'pen',
      id,
      frame,
      user,
      color,
      width,
      brush: brushType,
      points,
      join,
      cap,
      splat: splatValue === 1,
      mode: StrokeMode.Draw,
      startFrame: frame,
      duration: 0, // Only visible on this specific frame
    };

    return stroke;
  }

  // Parse a single text annotation from RV GTO format
  // textId format: "text:ID:FRAME:USER" e.g., "text:6:1:User"
  protected parseTextAnnotation(textId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number): TextAnnotation | null {
    const parts = textId.split(':');
    const user = parts[3] ?? 'unknown';
    const id = parts[1] ?? '0';

    const positionValue = comp.property('position').value();
    const colorValue = comp.property('color').value();
    const textValue = comp.property('text').value();
    const sizeValue = comp.property('size').value();
    const scaleValue = comp.property('scale').value();
    const rotationValue = comp.property('rotation').value();
    const spacingValue = comp.property('spacing').value();
    const fontValue = comp.property('font').value();

    // Parse position
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -0.5 to +0.5
    let x = 0.5, y = 0.5;
    if (positionValue && Array.isArray(positionValue)) {
      // Check if it's a double-wrapped array [[[x,y]]] or [[x,y]] or flat [x,y]
      let posData = positionValue;
      
      // Unwrap if nested
      while (posData.length > 0 && Array.isArray(posData[0]) && posData[0].length === 2) {
        posData = posData[0];
      }
      
      // Now posData should be [x, y]
      if (posData.length >= 2 && typeof posData[0] === 'number') {
        const rawX = posData[0] as number;
        const rawY = posData[1] as number;
        // OpenRV Coords are height-normalized (Y: -0.5 to 0.5)
        x = rawX / aspectRatio + 0.5;
        y = rawY + 0.5;
      }
    }

    // Parse color
    let color: [number, number, number, number] = [1, 1, 1, 1];
    if (colorValue && Array.isArray(colorValue) && colorValue.length >= 4) {
      color = [colorValue[0], colorValue[1], colorValue[2], colorValue[3]];
    }

    const text: TextAnnotation = {
      type: 'text',
      id,
      frame,
      user,
      position: { x, y },
      color,
      text: (textValue as string) ?? '',
      size: ((sizeValue as number) ?? 0.01) * RV_TEXT_SIZE_SCALE, // Scale up from normalized
      scale: (scaleValue as number) ?? 1,
      rotation: (rotationValue as number) ?? 0,
      spacing: (spacingValue as number) ?? 1,
      font: (fontValue as string) || 'sans-serif',
      origin: TextOrigin.BottomLeft,
      startFrame: frame,
      duration: 0, // Only visible on this specific frame
    };

    return text;
  }

  // File loading
  async loadFile(file: File): Promise<void> {
    this._gtoData = null;
    const type = this.getMediaType(file);

    try {
      if (type === 'video') {
        // Use loadVideoFile for mediabunny support (frame-accurate extraction)
        await this.loadVideoFile(file);
      } else if (type === 'image') {
        // Route through FileSourceNode for HDR format detection
        // (EXR layers, DPX/Cineon, float TIFF, JPEG gainmap/Ultra HDR)
        await this.loadImageFile(file);
      }
    } catch (err) {
      throw err;
    }
  }

  private getMediaType(file: File): MediaType {
    const videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (videoTypes.includes(file.type) || /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(file.name)) {
      return 'video';
    }
    return 'image';
  }

  async loadImage(name: string, url: string): Promise<void> {
    this._gtoData = null;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const source: MediaSource = {
          type: 'image',
          name,
          url,
          width: img.width,
          height: img.height,
          duration: 1,
          fps: this._fps,
          element: img,
        };

        this.addSource(source);
        this._inPoint = 1;
        this._outPoint = 1;
        this._currentFrame = 1;

        this.emit('sourceLoaded', source);
        this.emit('durationChanged', 1);
        resolve();
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }

  /**
   * Load an image file using FileSourceNode for HDR format detection.
   * Handles EXR, DPX, Cineon, float TIFF, JPEG gainmap/Ultra HDR,
   * and falls back to standard loading for regular images.
   */
  async loadImageFile(file: File): Promise<void> {
    this._gtoData = null;

    try {
      const fileSourceNode = new FileSourceNode(file.name);
      await fileSourceNode.loadFile(file);

      console.log(`[Session] Image loaded via FileSourceNode: ${file.name}, isHDR=${fileSourceNode.isHDR()}, format=${fileSourceNode.formatName ?? 'standard'}`);

      const source: MediaSource = {
        type: 'image',
        name: file.name,
        url: fileSourceNode.properties.getValue<string>('url') || '',
        width: fileSourceNode.width,
        height: fileSourceNode.height,
        duration: 1,
        fps: this._fps,
        fileSourceNode,
      };

      this.addSource(source);
      this._inPoint = 1;
      this._outPoint = 1;
      this._currentFrame = 1;

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', 1);
    } catch (err) {
      // Fallback to simple HTMLImageElement loading
      console.warn(`[Session] FileSourceNode loading failed for ${file.name}, falling back to HTMLImageElement:`, err);
      const url = URL.createObjectURL(file);
      try {
        await this.loadImage(file.name, url);
      } catch (fallbackErr) {
        URL.revokeObjectURL(url);
        throw fallbackErr;
      }
    }
  }

  /**
   * Load an EXR file using FileSourceNode for full EXR support (layers, HDR)
   */
  async loadEXRFile(file: File): Promise<void> {
    this._gtoData = null;

    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();
    const url = URL.createObjectURL(file);

    try {
      // Create FileSourceNode for EXR handling
      const fileSourceNode = new FileSourceNode(file.name);
      await fileSourceNode.loadFromEXR(buffer, file.name, url, url);

      const source: MediaSource = {
        type: 'image',
        name: file.name,
        url,
        width: fileSourceNode.width,
        height: fileSourceNode.height,
        duration: 1,
        fps: this._fps,
        fileSourceNode,
      };

      this.addSource(source);
      this._inPoint = 1;
      this._outPoint = 1;
      this._currentFrame = 1;

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', 1);
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  async loadVideo(name: string, url: string): Promise<void> {
    this._gtoData = null;
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = this._muted;
      video.volume = this._muted ? 0 : this._volume;
      video.loop = false;
      video.playsInline = true; // Required for iOS and some browsers
      this.initVideoPreservesPitch(video);

      // Use canplay event to ensure video data is ready
      video.oncanplay = () => {
        // Prevent multiple triggers
        video.oncanplay = null;

        const duration = Math.ceil(video.duration * this._fps);

        const source: MediaSource = {
          type: 'video',
          name,
          url,
          width: video.videoWidth,
          height: video.videoHeight,
          duration,
          fps: this._fps,
          element: video,
        };

        this.addSource(source);
        this._inPoint = 1;
        this._outPoint = duration;
        this._currentFrame = 1;

        this.emit('sourceLoaded', source);
        this.emit('durationChanged', duration);
        resolve();
      };

      video.onerror = (e) => {
        console.error('Video load error:', e);
        reject(new Error(`Failed to load video: ${url}`));
      };

      video.src = url;
      video.load(); // Explicitly start loading
    });
  }

  /**
   * Load a video file with mediabunny support for smooth frame-accurate playback.
   * This method provides better performance for scrubbing and reverse playback.
   */
  async loadVideoFile(file: File): Promise<void> {
    this._gtoData = null;

    // Create VideoSourceNode for frame-accurate extraction
    const videoSourceNode = new VideoSourceNode(file.name);
    const loadResult = await videoSourceNode.loadFile(file, this._fps);

    // Check for unsupported codec and emit event if detected
    if (loadResult.unsupportedCodecError) {
      this.emit('unsupportedCodec', {
        filename: file.name,
        codec: loadResult.codec ?? null,
        codecFamily: loadResult.codecFamily ?? 'unknown',
        error: loadResult.unsupportedCodecError,
      });
      // Continue loading - HTML video fallback may still work
    }

    const metadata = videoSourceNode.getMetadata();
    const duration = metadata.duration;

    // Also create HTMLVideoElement for audio playback
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = this._muted;
    video.volume = this._muted ? 0 : this._volume;
    video.loop = false;
    video.playsInline = true;
    this.initVideoPreservesPitch(video);

    await new Promise<void>((resolve, reject) => {
      video.oncanplay = () => {
        video.oncanplay = null;
        resolve();
      };
      video.onerror = () => reject(new Error('Failed to load video element'));
      video.src = url;
      video.load();
    });

    const source: MediaSource = {
      type: 'video',
      name: file.name,
      url,
      width: metadata.width,
      height: metadata.height,
      duration,
      fps: this._fps,
      element: video,
      videoSourceNode, // Include VideoSourceNode for mediabunny extraction
    };

    // Pre-fetch initial frames for immediate display
    if (videoSourceNode.isUsingMediabunny()) {
      videoSourceNode.preloadFrames(1).catch(err => {
        console.warn('Initial frame preload error:', err);
      });
    }

    this.addSource(source);
    this._inPoint = 1;
    this._outPoint = duration;
    this._currentFrame = 1;

    // Pre-load initial frames for immediate playback
    if (videoSourceNode.isUsingMediabunny()) {
      videoSourceNode.preloadFrames(1).catch(err => {
        console.warn('Initial frame preload error:', err);
      });

      // Detect actual FPS and frame count from video (async, updates when ready)
      // The current session fps (from .rv file or default) is used until detection completes
      this.detectVideoFpsAndDuration(source, videoSourceNode);
    }

    this.emit('sourceLoaded', source);
    this.emit('durationChanged', duration);
  }

  /**
   * Detect actual FPS and frame count from video using mediabunny
   * This runs asynchronously after video load to update session with accurate values
   */
  private async detectVideoFpsAndDuration(source: MediaSource, videoSourceNode: VideoSourceNode): Promise<void> {
    try {
      // Get detected FPS from actual video frames (this builds the frame index)
      const [detectedFps, actualFrameCount] = await Promise.all([
        videoSourceNode.getDetectedFps(),
        videoSourceNode.getActualFrameCount(),
      ]);

      // Update source metadata with actual values
      if (detectedFps !== null) {
        source.fps = detectedFps;
        console.log(`Video FPS detected: ${detectedFps}`);
      }

      if (actualFrameCount > 0) {
        source.duration = actualFrameCount;
        console.log(`Video frame count: ${actualFrameCount}`);
      }

      // Only update session if this source is still the current one
      const isCurrentSource = this.currentSource === source;

      if (isCurrentSource) {
        // Update session FPS if detected
        if (detectedFps !== null && detectedFps !== this._fps) {
          this._fps = detectedFps;
          this.emit('fpsChanged', this._fps);
        }

        // Update duration and out point if frame count changed
        if (actualFrameCount > 0 && actualFrameCount !== this._outPoint) {
          this._outPoint = actualFrameCount;
          this.emit('durationChanged', actualFrameCount);
          this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
        }
      }
    } catch (err) {
      console.warn('Failed to detect video FPS/duration:', err);
    }
  }

  /**
   * Load an image sequence from multiple files
   */
  async loadSequence(files: File[], fps?: number): Promise<void> {
    this._gtoData = null;
    const sequenceInfo = await createSequenceInfo(files, fps ?? this._fps);
    if (!sequenceInfo) {
      throw new Error('No valid image sequence found in the selected files');
    }

    const source: MediaSource = {
      type: 'sequence',
      name: sequenceInfo.name,
      url: '', // Sequences don't have a single URL
      width: sequenceInfo.width,
      height: sequenceInfo.height,
      duration: sequenceInfo.frames.length,
      fps: sequenceInfo.fps,
      sequenceInfo,
      sequenceFrames: sequenceInfo.frames,
      // Set element to first frame's image for initial display
      element: sequenceInfo.frames[0]?.image,
    };

    this.addSource(source);
    this.fps = sequenceInfo.fps;
    this._inPoint = 1;
    this._outPoint = sequenceInfo.frames.length;
    this._currentFrame = 1;

    this.emit('sourceLoaded', source);
    this.emit('durationChanged', sequenceInfo.frames.length);

    // Preload adjacent frames
    preloadFrames(sequenceInfo.frames, 0, 10);
  }

  /**
   * Get the current frame image for a sequence
   * Returns null if current source is not a sequence
   */
  async getSequenceFrameImage(frameIndex?: number): Promise<HTMLImageElement | null> {
    const source = this.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames) {
      return null;
    }

    const idx = (frameIndex ?? this._currentFrame) - 1; // Convert 1-based to 0-based
    const frame = source.sequenceFrames[idx];
    if (!frame) return null;

    // Load this frame if needed
    const image = await loadFrameImage(frame);

    // Preload adjacent frames
    preloadFrames(source.sequenceFrames, idx, 5);

    // Release distant frames to manage memory
    releaseDistantFrames(source.sequenceFrames, idx, 20);

    return image;
  }

  /**
   * Get sequence frame synchronously (returns cached image or null)
   */
  getSequenceFrameSync(frameIndex?: number): HTMLImageElement | null {
    const source = this.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames) {
      return null;
    }

    const idx = (frameIndex ?? this._currentFrame) - 1;
    const frame = source.sequenceFrames[idx];
    return frame?.image ?? null;
  }

  /**
   * Get video frame canvas from mediabunny (for direct rendering)
   * Returns null if mediabunny is not available or frame is not cached
   */
  getVideoFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | null {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }

    const frame = frameIndex ?? this._currentFrame;
    return source.videoSourceNode.getCachedFrameCanvas(frame);
  }

  /**
   * Check if video frame is cached and ready for immediate display
   */
  hasVideoFrameCached(frameIndex?: number): boolean {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return false;
    }

    const frame = frameIndex ?? this._currentFrame;
    return source.videoSourceNode.hasFrameCached(frame);
  }

  /**
   * Check if current source is using mediabunny for frame extraction
   */
  isUsingMediabunny(): boolean {
    return this.isSourceUsingMediabunny(this.currentSource);
  }

  /**
   * Check if source B is using mediabunny for frame extraction
   */
  isSourceBUsingMediabunny(): boolean {
    return this.isSourceUsingMediabunny(this.sourceB);
  }

  /**
   * Internal helper: Check if a specific source is using mediabunny
   */
  private isSourceUsingMediabunny(source: MediaSource | null): boolean {
    return source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny() === true;
  }

  /**
   * Get video frame canvas for source B from mediabunny (for split screen rendering)
   * Returns null if mediabunny is not available or frame is not cached
   */
  getSourceBFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | null {
    return this.getFrameCanvasForSource(this.sourceB, frameIndex);
  }

  /**
   * Internal helper: Get frame canvas for a specific source
   */
  private getFrameCanvasForSource(
    source: MediaSource | null,
    frameIndex?: number
  ): HTMLCanvasElement | OffscreenCanvas | null {
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }

    const frame = frameIndex ?? this._currentFrame;
    return source.videoSourceNode.getCachedFrameCanvas(frame);
  }

  /**
   * Fetch a specific frame for source B (async)
   * Used for split screen rendering when frame is not cached
   */
  async fetchSourceBVideoFrame(frameIndex: number): Promise<void> {
    await this.fetchFrameForSource(this.sourceB, frameIndex);
  }

  /**
   * Internal helper: Fetch a specific frame for a source
   */
  private async fetchFrameForSource(source: MediaSource | null, frameIndex: number): Promise<void> {
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    await source.videoSourceNode.getFrameAsync(frameIndex);
  }

  /**
   * Preload video frames around the current position
   * Call this when scrubbing or seeking to prepare frames
   */
  preloadVideoFrames(centerFrame?: number): void {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    const frame = centerFrame ?? this._currentFrame;
    source.videoSourceNode.preloadFrames(frame).catch(err => {
      console.warn('Video frame preload error:', err);
    });
  }

  /**
   * Fetch the current video frame using mediabunny
   * Returns a promise that resolves when the frame is cached and ready
   */
  async fetchCurrentVideoFrame(frameIndex?: number): Promise<void> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    const frame = frameIndex ?? this._currentFrame;

    // Check if already cached
    if (source.videoSourceNode.hasFrameCached(frame)) {
      return;
    }

    // Fetch the frame
    await source.videoSourceNode.getFrameAsync(frame);
  }

  /**
   * Get the set of cached frame numbers
   * Returns empty set if mediabunny is not active
   */
  getCachedFrames(): Set<number> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return new Set();
    }
    return source.videoSourceNode.getCachedFrames();
  }

  /**
   * Get the set of pending (loading) frame numbers
   * Returns empty set if mediabunny is not active
   */
  getPendingFrames(): Set<number> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return new Set();
    }
    return source.videoSourceNode.getPendingFrames();
  }

  /**
   * Get cache statistics
   * Returns null if mediabunny is not active
   */
  getCacheStats(): {
    cachedCount: number;
    pendingCount: number;
    totalFrames: number;
    maxCacheSize: number;
  } | null {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }
    return source.videoSourceNode.getCacheStats();
  }

  /**
   * Clear the video frame cache
   */
  clearVideoCache(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny()) {
      source.videoSourceNode.clearCache();
    }
  }

  /**
   * Cleanup sequence resources when switching sources or disposing
   */
  private disposeSequenceSource(source: MediaSource): void {
    if (source.type === 'sequence' && source.sequenceFrames) {
      disposeSequence(source.sequenceFrames);
    }
  }

  /**
   * Cleanup video source resources
   */
  private disposeVideoSource(source: MediaSource): void {
    if (source.type === 'video' && source.videoSourceNode) {
      source.videoSourceNode.dispose();
    }
  }

  // Switch between sources
  setCurrentSource(index: number): void {
    if (index >= 0 && index < this.sources.length) {
      // Cleanup current source
      const currentSource = this.currentSource;
      if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
        currentSource.element.pause();
      }
      // Note: We don't dispose sequences here since user might switch back

      this._currentSourceIndex = index;
      const newSource = this.currentSource;
      if (newSource) {
        this._outPoint = newSource.duration;
        this._inPoint = 1;
        this._currentFrame = 1;
        this.emit('durationChanged', newSource.duration);
      }
    }
  }

  // A/B Source Compare methods

  /**
   * Get the current A/B state
   */
  get currentAB(): 'A' | 'B' {
    return this._currentAB;
  }

  /**
   * Get source A index
   */
  get sourceAIndex(): number {
    return this._sourceAIndex;
  }

  /**
   * Get source B index (-1 if not assigned)
   */
  get sourceBIndex(): number {
    return this._sourceBIndex;
  }

  /**
   * Get source A
   */
  get sourceA(): MediaSource | null {
    return this.sources[this._sourceAIndex] ?? null;
  }

  /**
   * Get source B
   */
  get sourceB(): MediaSource | null {
    if (this._sourceBIndex < 0) return null;
    return this.sources[this._sourceBIndex] ?? null;
  }

  /**
   * Check if A/B compare is available (both sources assigned)
   */
  get abCompareAvailable(): boolean {
    return this._sourceBIndex >= 0 && this._sourceBIndex < this.sources.length;
  }

  /**
   * Get or set sync playhead mode
   */
  get syncPlayhead(): boolean {
    return this._syncPlayhead;
  }

  set syncPlayhead(value: boolean) {
    this._syncPlayhead = value;
  }

  /**
   * Set source A by index
   */
  setSourceA(index: number): void {
    if (index >= 0 && index < this.sources.length && index !== this._sourceAIndex) {
      this._sourceAIndex = index;
      if (this._currentAB === 'A') {
        this.switchToSource(index);
      }
    }
  }

  /**
   * Set source B by index
   */
  setSourceB(index: number): void {
    if (index >= 0 && index < this.sources.length && index !== this._sourceBIndex) {
      this._sourceBIndex = index;
      if (this._currentAB === 'B') {
        this.switchToSource(index);
      }
    }
  }

  /**
   * Clear source B assignment
   */
  clearSourceB(): void {
    this._sourceBIndex = -1;
    if (this._currentAB === 'B') {
      this._currentAB = 'A';
      this.switchToSource(this._sourceAIndex);
    }
  }

  /**
   * Update source B's playback buffer for split screen support.
   * Called during playback to keep source B's frames in sync with current playback position.
   */
  private updateSourceBPlaybackBuffer(frame: number): void {
    const sourceB = this.sourceB;
    if (!sourceB || sourceB.type !== 'video') return;

    // Update source B's playback buffer if it uses mediabunny
    if (sourceB.videoSourceNode?.isUsingMediabunny()) {
      sourceB.videoSourceNode.updatePlaybackBuffer(frame);
    }
  }

  /**
   * Start playback preloading for source B (for split screen support).
   * Called when playback starts to ensure source B's frames are preloaded.
   */
  private startSourceBPlaybackPreload(): void {
    const sourceB = this.sourceB;
    if (!sourceB || sourceB.type !== 'video') return;

    // Start source B's playback preload if it uses mediabunny
    if (sourceB.videoSourceNode?.isUsingMediabunny()) {
      sourceB.videoSourceNode.setPlaybackDirection(this._playDirection);
      sourceB.videoSourceNode.startPlaybackPreload(this._currentFrame, this._playDirection);
    }
  }

  /**
   * Stop playback preloading for source B.
   * Called when playback stops.
   */
  private stopSourceBPlaybackPreload(): void {
    const sourceB = this.sourceB;
    if (!sourceB || sourceB.type !== 'video') return;

    // Stop source B's playback preload if it uses mediabunny
    if (sourceB.videoSourceNode?.isUsingMediabunny()) {
      sourceB.videoSourceNode.stopPlaybackPreload();
    }
  }

  /**
   * Toggle between A and B sources
   */
  toggleAB(): void {
    if (!this.abCompareAvailable) return;

    const savedFrame = this._syncPlayhead ? this._currentFrame : null;

    if (this._currentAB === 'A') {
      this._currentAB = 'B';
      this.switchToSource(this._sourceBIndex);
    } else {
      this._currentAB = 'A';
      this.switchToSource(this._sourceAIndex);
    }

    // Restore frame position if sync is enabled
    if (savedFrame !== null) {
      const maxFrame = this.currentSource?.duration ?? 1;
      this._currentFrame = Math.min(savedFrame, maxFrame);
      this.syncVideoToFrame();
      this.emit('frameChanged', this._currentFrame);
    }

    this.emit('abSourceChanged', {
      current: this._currentAB,
      sourceIndex: this._currentSourceIndex,
    });
  }

  /**
   * Set current A/B state directly
   */
  setCurrentAB(ab: 'A' | 'B'): void {
    if (ab === this._currentAB) return;
    if (ab === 'B' && !this.abCompareAvailable) return;

    this.toggleAB();
  }

  /**
   * Internal helper to switch to a source without resetting frame
   */
  private switchToSource(index: number): void {
    if (index < 0 || index >= this.sources.length) return;

    // Pause current video if playing
    const currentSource = this.currentSource;
    if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
      currentSource.element.pause();
    }

    this._currentSourceIndex = index;

    // Update duration but preserve frame if syncing
    const newSource = this.currentSource;
    if (newSource) {
      this._outPoint = newSource.duration;
      this._inPoint = 1;
      this.emit('durationChanged', newSource.duration);
    }
  }

  /**
   * Export playback state for serialization
   */
  getPlaybackState(): {
    currentFrame: number;
    inPoint: number;
    outPoint: number;
    fps: number;
    loopMode: LoopMode;
    volume: number;
    muted: boolean;
    preservesPitch: boolean;
    marks: Marker[];
    currentSourceIndex: number;
  } {
    return {
      currentFrame: this._currentFrame,
      inPoint: this._inPoint,
      outPoint: this._outPoint,
      fps: this._fps,
      loopMode: this._loopMode,
      volume: this._volume,
      muted: this._muted,
      preservesPitch: this._preservesPitch,
      marks: Array.from(this._marks.values()),
      currentSourceIndex: this._currentSourceIndex,
    };
  }

  /**
   * Restore playback state from serialization
   */
  setPlaybackState(state: Partial<{
    currentFrame: number;
    inPoint: number;
    outPoint: number;
    fps: number;
    loopMode: LoopMode;
    volume: number;
    muted: boolean;
    preservesPitch: boolean;
    marks: Marker[] | number[]; // Support both old and new format
    currentSourceIndex: number;
  }>): void {
    if (state.fps !== undefined) this.fps = state.fps;
    if (state.loopMode !== undefined) {
      this._loopMode = state.loopMode;
      this.emit('loopModeChanged', this._loopMode);
    }
    if (state.volume !== undefined) this.volume = state.volume;
    if (state.muted !== undefined) this.muted = state.muted;
    if (state.preservesPitch !== undefined) this.preservesPitch = state.preservesPitch;
    if (state.inPoint !== undefined) this.setInPoint(state.inPoint);
    if (state.outPoint !== undefined) this.setOutPoint(state.outPoint);
    if (state.currentFrame !== undefined) this.currentFrame = state.currentFrame;
    if (state.marks) {
      this._marks.clear();
      for (const m of state.marks) {
        // Support both old format (number[]) and new format (Marker[])
        if (typeof m === 'number') {
          this._marks.set(m, { frame: m, note: '', color: MARKER_COLORS[0] });
        } else {
          this._marks.set(m.frame, m);
        }
      }
      this.emit('marksChanged', this._marks);
    }
  }

  /**
   * Dispose all session resources
   */
  dispose(): void {
    // Cleanup all sources
    for (const source of this.sources) {
      this.disposeSequenceSource(source);
      this.disposeVideoSource(source);
    }
    this.sources = [];
  }
}
