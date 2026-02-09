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
} from '../../utils/media/SequenceLoader';
import { VideoSourceNode } from '../../nodes/sources/VideoSourceNode';
import { FileSourceNode } from '../../nodes/sources/FileSourceNode';
import type { UnsupportedCodecError, CodecFamily } from '../../utils/media/CodecUtils';
import type {
  Annotation,
  PenStroke,
  TextAnnotation,
  PaintEffects,
} from '../../paint/types';
import {
  AnnotationStore,
  getNumberValue as _getNumberValue,
  getBooleanValue as _getBooleanValue,
  getNumberArray as _getNumberArray,
  getStringValue as _getStringValue,
} from './AnnotationStore';
import type { ColorAdjustments, ChannelMode } from '../../core/types/color';
import type { FilterSettings } from '../../core/types/filter';
import type { Transform2D, CropState } from '../../core/types/transform';
import type { ScopesState } from '../../core/types/scopes';
import type { CDLValues } from '../../color/CDL';
import type { LensDistortionParams } from '../../transform/LensDistortion';
import type { StereoState } from '../types/stereo';
import type { StereoEyeTransformState, StereoAlignMode } from '../../stereo/StereoEyeTransform';
import type { LoopMode, MediaType } from '../types/session';
import { Graph } from '../graph/Graph';
import { loadGTOGraph } from './GTOGraphLoader';
import {
  parseInitialSettings as _parseInitialSettings,
  parseColorAdjustments as _parseColorAdjustments,
  parseCDL as _parseCDL,
  parseTransform as _parseTransform,
  parseLens as _parseLens,
  parseCrop as _parseCrop,
  parseChannelMode as _parseChannelMode,
  parseStereo as _parseStereo,
  parseScopes as _parseScopes,
} from './GTOSettingsParser';
import type { GTOParseResult } from './GTOGraphLoader';
import type { SubFramePosition } from '../../utils/media/FrameInterpolator';
import { MAX_CONSECUTIVE_STARVATION_SKIPS } from './PlaybackTimingController';
import { PlaybackEngine } from './PlaybackEngine';
import { MarkerManager, MARKER_COLORS, type Marker, type MarkerColor } from './MarkerManager';
import { VolumeManager } from './VolumeManager';
import { ABCompareManager } from './ABCompareManager';
import { Logger } from '../../utils/Logger';

const log = new Logger('Session');

export type { SubFramePosition };
export { MARKER_COLORS };
export type { Marker, MarkerColor };

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

// Re-export from centralized types for backward compatibility
export type { LoopMode, MediaType } from '../types/session';

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

// Re-export for backward compatibility
export { PLAYBACK_SPEED_PRESETS } from '../../config/PlaybackConfig';
export type { PlaybackSpeedPreset } from '../../config/PlaybackConfig';


export class Session extends EventEmitter<SessionEvents> {
  // Playback engine - owns all playback state (frame, in/out points, fps, timing, etc.)
  protected _playbackEngine = new PlaybackEngine();

  // Extracted managers
  private _markerManager = new MarkerManager();
  private _volumeManager = new VolumeManager();
  private _abCompareManager = new ABCompareManager();
  private _annotationStore = new AnnotationStore();

  // Session integration properties
  private _metadata: SessionMetadata = {
    displayName: '',
    comment: '',
    version: 2,
    origin: 'openrv-web',
    creationContext: 0,
    clipboard: 0,
    membershipContains: [],
  };

  // Static constant for starvation threshold - kept for backward compatibility
  static readonly MAX_CONSECUTIVE_STARVATION_SKIPS = MAX_CONSECUTIVE_STARVATION_SKIPS;

  // --- Backward-compatible accessors for playback state ---
  // Tests access these via (session as any)._currentFrame etc.

  protected get _currentFrame(): number { return this._playbackEngine.currentFrame; }
  protected set _currentFrame(v: number) { this._playbackEngine.setCurrentFrameInternal(v); }

  protected get _inPoint(): number { return this._playbackEngine.inPoint; }
  protected set _inPoint(v: number) { this._playbackEngine.setInPointInternal(v); }

  protected get _outPoint(): number { return this._playbackEngine.outPoint; }
  protected set _outPoint(v: number) { this._playbackEngine.setOutPointInternal(v); }

  protected get _fps(): number { return this._playbackEngine.fps; }
  protected set _fps(v: number) { this._playbackEngine.setFpsInternal(v); }

  protected get _isPlaying(): boolean { return this._playbackEngine.isPlaying; }
  protected set _isPlaying(v: boolean) { (this._playbackEngine as any)._isPlaying = v; }

  protected get _playDirection(): number { return this._playbackEngine.playDirection; }
  protected set _playDirection(v: number) {
    (this._playbackEngine as any)._playDirection = v;
  }

  protected get _playbackSpeed(): number { return this._playbackEngine.playbackSpeed; }

  protected get _loopMode(): LoopMode { return this._playbackEngine.loopMode; }
  protected set _loopMode(v: LoopMode) { this._playbackEngine.loopMode = v; }

  protected get _interpolationEnabled(): boolean { return this._playbackEngine.interpolationEnabled; }

  protected get _pendingPlayPromise(): Promise<void> | null { return this._playbackEngine.pendingPlayPromise; }
  protected set _pendingPlayPromise(v: Promise<void> | null) { this._playbackEngine.setPendingPlayPromise(v); }

  protected get _pendingFetchFrame(): number | null { return (this._playbackEngine as any)._pendingFetchFrame; }

  protected get _frameIncrement(): number { return this._playbackEngine.frameIncrement; }
  protected set _frameIncrement(v: number) { this._playbackEngine.setFrameIncrementInternal(v); }

  // --- Backward-compatible accessors for timing state ---
  // Tests access these via (session as any).lastFrameTime etc.

  get lastFrameTime(): number { return this._playbackEngine.lastFrameTime; }
  set lastFrameTime(v: number) { this._playbackEngine.lastFrameTime = v; }

  get frameAccumulator(): number { return this._playbackEngine.frameAccumulator; }
  set frameAccumulator(v: number) { this._playbackEngine.frameAccumulator = v; }

  get _bufferingCount(): number { return this._playbackEngine._bufferingCount; }
  set _bufferingCount(v: number) { this._playbackEngine._bufferingCount = v; }

  get _isBuffering(): boolean { return this._playbackEngine._isBuffering; }
  set _isBuffering(v: boolean) { this._playbackEngine._isBuffering = v; }

  get _starvationStartTime(): number { return this._playbackEngine._starvationStartTime; }
  set _starvationStartTime(v: number) { this._playbackEngine._starvationStartTime = v; }

  get _consecutiveStarvationSkips(): number { return this._playbackEngine._consecutiveStarvationSkips; }
  set _consecutiveStarvationSkips(v: number) { this._playbackEngine._consecutiveStarvationSkips = v; }

  get fpsFrameCount(): number { return this._playbackEngine.fpsFrameCount; }
  set fpsFrameCount(v: number) { this._playbackEngine.fpsFrameCount = v; }

  get fpsLastTime(): number { return this._playbackEngine.fpsLastTime; }
  set fpsLastTime(v: number) { this._playbackEngine.fpsLastTime = v; }

  get _effectiveFps(): number { return this._playbackEngine._effectiveFps; }
  set _effectiveFps(v: number) { this._playbackEngine._effectiveFps = v; }

  get _subFramePosition(): SubFramePosition | null { return this._playbackEngine._subFramePosition; }
  set _subFramePosition(v: SubFramePosition | null) { this._playbackEngine._subFramePosition = v; }

  // Media sources
  protected sources: MediaSource[] = [];
  private _currentSourceIndex = 0;

  // Node graph from GTO file
  protected _graph: Graph | null = null;
  private _graphParseResult: GTOParseResult | null = null;
  private _gtoData: GTOData | null = null;


  constructor() {
    super();

    // Wire PlaybackEngine host
    this._playbackEngine.setHost({
      getCurrentSource: () => this.currentSource,
      getSourceB: () => this.sourceB,
      applyVolumeToVideo: () => this.applyVolumeToVideo(),
      safeVideoPlay: (video) => this.safeVideoPlay(video),
      initVideoPreservesPitch: (video) => this.initVideoPreservesPitch(video),
      getAudioSyncEnabled: () => this._volumeManager.audioSyncEnabled,
      setAudioSyncEnabled: (enabled) => { this._volumeManager.audioSyncEnabled = enabled; },
    });

    // Forward PlaybackEngine events to Session events
    this._playbackEngine.on('frameChanged', (frame) => this.emit('frameChanged', frame));
    this._playbackEngine.on('playbackChanged', (playing) => this.emit('playbackChanged', playing));
    this._playbackEngine.on('playDirectionChanged', (dir) => this.emit('playDirectionChanged', dir));
    this._playbackEngine.on('playbackSpeedChanged', (speed) => this.emit('playbackSpeedChanged', speed));
    this._playbackEngine.on('loopModeChanged', (mode) => this.emit('loopModeChanged', mode));
    this._playbackEngine.on('fpsChanged', (fps) => this.emit('fpsChanged', fps));
    this._playbackEngine.on('frameIncrementChanged', (inc) => this.emit('frameIncrementChanged', inc));
    this._playbackEngine.on('inOutChanged', (range) => this.emit('inOutChanged', range));
    this._playbackEngine.on('interpolationEnabledChanged', (enabled) => this.emit('interpolationEnabledChanged', enabled));
    this._playbackEngine.on('subFramePositionChanged', (pos) => this.emit('subFramePositionChanged', pos));
    this._playbackEngine.on('buffering', (buffering) => this.emit('buffering', buffering));

    // Wire manager callbacks
    this._markerManager.setCallbacks({
      onMarksChanged: (marks) => this.emit('marksChanged', marks),
    });
    this._volumeManager.setCallbacks({
      onVolumeChanged: (v) => {
        this.applyVolumeToVideo();
        this.emit('volumeChanged', v);
      },
      onMutedChanged: (m) => {
        this.applyVolumeToVideo();
        this.emit('mutedChanged', m);
      },
      onPreservesPitchChanged: (p) => {
        this.applyPreservesPitchToVideo();
        this.emit('preservesPitchChanged', p);
      },
    });
    this._abCompareManager.setCallbacks({
      onABSourceChanged: (info) => this.emit('abSourceChanged', info),
    });
    this._annotationStore.setCallbacks({
      onAnnotationsLoaded: (data) => this.emit('annotationsLoaded', data),
      onPaintEffectsLoaded: (effects) => this.emit('paintEffectsLoaded', effects),
      onMatteChanged: (settings) => this.emit('matteChanged', settings),
    });
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

    // Delegate auto-assignment of A/B to ABCompareManager
    const abResult = this._abCompareManager.onSourceAdded(this.sources.length);
    if (abResult.emitEvent) {
      this._currentSourceIndex = abResult.currentSourceIndex;
      this._abCompareManager.emitChanged(this._currentSourceIndex);
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
    return this._playbackEngine.currentFrame;
  }

  set currentFrame(frame: number) {
    this._playbackEngine.currentFrame = frame;
  }

  get inPoint(): number {
    return this._playbackEngine.inPoint;
  }

  get outPoint(): number {
    return this._playbackEngine.outPoint;
  }

  get fps(): number {
    return this._playbackEngine.fps;
  }

  set fps(value: number) {
    this._playbackEngine.fps = value;
  }

  /** Frame increment for step forward/backward */
  get frameIncrement(): number {
    return this._frameIncrement;
  }

  set frameIncrement(value: number) {
    this._playbackEngine.frameIncrement = value;
  }

  /** Matte overlay settings */
  get matteSettings(): MatteSettings | null {
    return this._annotationStore.matteSettings;
  }

  /** Paint effects from session (ghost, hold, etc.) */
  get sessionPaintEffects(): Partial<PaintEffects> | null {
    return this._annotationStore.sessionPaintEffects;
  }

  /** Annotation store (owns paint/annotation/matte state and parsing) */
  get annotationStore(): AnnotationStore {
    return this._annotationStore;
  }

  /** Session metadata (name, comment, version, origin) */
  get metadata(): SessionMetadata {
    return this._metadata;
  }

  get playbackSpeed(): number {
    return this._playbackEngine.playbackSpeed;
  }

  set playbackSpeed(value: number) {
    this._playbackEngine.playbackSpeed = value;
  }

    increaseSpeed(): void {
    this._playbackEngine.increaseSpeed();
  }

    decreaseSpeed(): void {
    this._playbackEngine.decreaseSpeed();
  }

  /**
   * Reset playback speed to 1x
   */
  resetSpeed(): void {
    this._playbackEngine.resetSpeed();
  }

  get isPlaying(): boolean {
    return this._playbackEngine.isPlaying;
  }

  get isBuffering(): boolean {
    return this._playbackEngine.isBuffering;
  }

  get loopMode(): LoopMode {
    return this._loopMode;
  }

  set loopMode(mode: LoopMode) {
    this._playbackEngine.loopMode = mode;
  }

  get frameCount(): number {
    return this._playbackEngine.frameCount;
  }

  get marks(): ReadonlyMap<number, Marker> {
    return this._markerManager.marks;
  }

  /**
   * Get all marked frame numbers (for backward compatibility)
   */
  get markedFrames(): number[] {
    return this._markerManager.markedFrames;
  }

  /**
   * Get marker at a specific frame
   */
  getMarker(frame: number): Marker | undefined {
    return this._markerManager.getMarker(frame);
  }

  /**
   * Check if a frame has a marker
   */
  hasMarker(frame: number): boolean {
    return this._markerManager.hasMarker(frame);
  }

  get volume(): number {
    return this._volumeManager.volume;
  }

  set volume(value: number) {
    this._volumeManager.volume = value;
  }

  get muted(): boolean {
    return this._volumeManager.muted;
  }

  set muted(value: boolean) {
    this._volumeManager.muted = value;
  }

  toggleMute(): void {
    this._volumeManager.toggleMute();
  }

  /**
   * Whether to preserve audio pitch when playing at non-1x speeds.
   * When true, audio pitch stays the same regardless of playback speed.
   * When false, audio pitch changes proportionally with speed (chipmunk/slow-mo effect).
   * Default: true (most users expect pitch-corrected audio).
   */
  get preservesPitch(): boolean {
    return this._volumeManager.preservesPitch;
  }

  set preservesPitch(value: boolean) {
    this._volumeManager.preservesPitch = value;
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
    this._playbackEngine.interpolationEnabled = value;
  }

  /**
   * Current sub-frame position during slow-motion playback.
   * Non-null only when interpolation is enabled and playing at < 1x speed.
   * Used by the Viewer to blend adjacent frames for smooth slow-motion.
   */
  get subFramePosition(): SubFramePosition | null {
    return this._playbackEngine.subFramePosition;
  }

  /**
   * Apply preservesPitch setting to the current video element.
   * Handles vendor-prefixed properties for cross-browser support.
   */
  private applyPreservesPitchToVideo(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      this._volumeManager.applyPreservesPitchToVideo(source.element);
    }
  }

  /**
   * Apply preservesPitch to a newly created video element.
   * Delegates to VolumeManager.
   */
  private initVideoPreservesPitch(video: HTMLVideoElement): void {
    this._volumeManager.initVideoPreservesPitch(video);
  }

  private applyVolumeToVideo(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      this._volumeManager.applyVolumeToVideo(source.element, this._playDirection);
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

  play(): void {
    this._playbackEngine.play();
  }



  protected triggerStarvationRecoveryPreload(
    _videoSourceNode: import('../../nodes/sources/VideoSourceNode').VideoSourceNode,
    _fromFrame: number,
    _direction: number
  ): void {
    // Handled by PlaybackEngine internally
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
          this._volumeManager.muted = true;
          try {
            await video.play();
          } catch (retryErr) {
            // If still failing, pause playback
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
          // Playback was interrupted (e.g., by seeking) - this is normal, don't emit error
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
    this._playbackEngine.pause();
  }

  

  togglePlayback(): void {
    this._playbackEngine.togglePlayback();
  }

  togglePlayDirection(): void {
    this._playbackEngine.togglePlayDirection();
  }

  get playDirection(): number {
    return this._playbackEngine.playDirection;
  }

  /**
   * Get effective FPS (actual frames rendered per second during playback)
   * Returns 0 when not playing
   */
  get effectiveFps(): number {
    return this._playbackEngine.effectiveFps;
  }

  stepForward(): void {
    this._playbackEngine.stepForward();
  }

  stepBackward(): void {
    this._playbackEngine.stepBackward();
  }

  goToFrame(frame: number): void {
    this._playbackEngine.goToFrame(frame);
  }

  goToStart(): void {
    this._playbackEngine.goToStart();
  }

  goToEnd(): void {
    this._playbackEngine.goToEnd();
  }

  setInPoint(frame?: number): void {
    this._playbackEngine.setInPoint(frame);
  }

  setOutPoint(frame?: number): void {
    this._playbackEngine.setOutPoint(frame);
  }

  resetInOutPoints(): void {
    this._playbackEngine.resetInOutPoints();
  }

  // Marks — delegated to MarkerManager
  toggleMark(frame?: number): void {
    this._markerManager.toggleMark(frame ?? this._currentFrame);
  }

  setMarker(frame: number, note: string = '', color: string = MARKER_COLORS[0], endFrame?: number): void {
    this._markerManager.setMarker(frame, note, color, endFrame);
  }

  setMarkerEndFrame(frame: number, endFrame: number | undefined): void {
    this._markerManager.setMarkerEndFrame(frame, endFrame);
  }

  getMarkerAtFrame(frame: number): Marker | undefined {
    return this._markerManager.getMarkerAtFrame(frame);
  }

  setMarkerNote(frame: number, note: string): void {
    this._markerManager.setMarkerNote(frame, note);
  }

  setMarkerColor(frame: number, color: string): void {
    this._markerManager.setMarkerColor(frame, color);
  }

  removeMark(frame: number): void {
    this._markerManager.removeMark(frame);
  }

  clearMarks(): void {
    this._markerManager.clearMarks();
  }

  goToNextMarker(): number | null {
    const frame = this._markerManager.findNextMarkerFrame(this._currentFrame);
    if (frame !== null) {
      this.currentFrame = frame;
      return frame;
    }
    return null;
  }

  goToPreviousMarker(): number | null {
    const frame = this._markerManager.findPreviousMarkerFrame(this._currentFrame);
    if (frame !== null) {
      this.currentFrame = frame;
      return frame;
    }
    return null;
  }

  update(): void {
    this._playbackEngine.update();
  }

  

  protected advanceFrame(direction: number): void {
    this._playbackEngine.advanceFrame(direction);
  }

  /**
   * Sync video element to the current frame position.
   * Used after seeking or when frames change.
   */
  private syncVideoToFrame(): void {
    // Setting currentFrame through the engine triggers its internal syncVideoToFrame
    // For direct sync without frame change, trigger preload on the current frame
    const source = this.currentSource;
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
      log.error('GTO parsing error:', message);
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
        this._markerManager.setFromFrameNumbers(result.sessionInfo.marks);
      }

      // Apply frame increment
      if (result.sessionInfo.inc !== undefined) {
        this._frameIncrement = result.sessionInfo.inc;
        this.emit('frameIncrementChanged', this._frameIncrement);
      }

      // Apply paint effects from session
      if (result.sessionInfo.paintEffects) {
        this._annotationStore.setPaintEffects(result.sessionInfo.paintEffects);
      }

      // Apply matte settings
      if (result.sessionInfo.matte) {
        this._annotationStore.setMatteSettings(result.sessionInfo.matte);
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
        log.debug('GTO Graph loaded:', {
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
      log.warn('Failed to load node graph from GTO:', message);
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
          log.debug(`Loading video source "${node.name}" from file: ${file.name}`);

          // Load the video using the file - this initializes mediabunny
          await node.loadFile(file, this._fps);

          const metadata = node.getMetadata();
          const duration = metadata.duration;

          // Also create HTMLVideoElement for audio playback
          const blobUrl = URL.createObjectURL(file);
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = this._volumeManager.muted;
          video.volume = this._volumeManager.getEffectiveVolume();
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
              log.warn('Initial frame preload error:', err);
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
          log.debug(`Loading video source "${node.name}" from URL (no mediabunny): ${url}`);

          await node.load(url, node.name, this._fps);

          const metadata = node.getMetadata();
          const duration = metadata.duration;

          // Create HTMLVideoElement
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = this._volumeManager.muted;
          video.volume = this._volumeManager.getEffectiveVolume();
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
    log.debug('GTO Result:', dto);

    const sessions = dto.byProtocol('RVSession');
    log.debug('RVSession objects:', sessions.length);
    if (sessions.length === 0) {
      log.warn('No RVSession found in file');
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
            this._markerManager.setFromFrameNumbers(marks);
          }
        }
      }
    }

    // Parse file sources and get aspect ratio
    let aspectRatio = 1;
    let sourceWidth = 0;
    let sourceHeight = 0;
    const sources = dto.byProtocol('RVFileSource');
    log.debug('RVFileSource objects:', sources.length);
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
            log.debug('Source size:', width, 'x', height, 'aspect:', aspectRatio);
          }
        }
      }

      const mediaObj = source.component('media');
      if (mediaObj) {
        const movieProp = mediaObj.property('movie').value();
        if (movieProp) {
          log.debug('Found source:', movieProp);
        }
      }
    }

    // Parse paint annotations with aspect ratio
    this._annotationStore.parsePaintAnnotations(dto, aspectRatio);

    const settings = this.parseInitialSettings(dto, { width: sourceWidth, height: sourceHeight });
    if (settings) {
      this.emit('settingsLoaded', settings);
    }
  }

  // GTO value extraction helpers - delegate to standalone functions from AnnotationStore.
  // Kept as private methods for backward compatibility (tests access via `(session as any)`).
  private getNumberValue(value: unknown): number | undefined { return _getNumberValue(value); }

  // @ts-ignore TS6133 - accessed by tests via (session as any).getBooleanValue()
  private getBooleanValue(value: unknown): boolean | undefined { return _getBooleanValue(value); }

  private getNumberArray(value: unknown): number[] | undefined { return _getNumberArray(value); }

  // @ts-ignore TS6133 - accessed by tests via (session as any).getStringValue()
  private getStringValue(value: unknown): string | undefined { return _getStringValue(value); }

  // GTO settings parsing - delegates to pure functions in GTOSettingsParser.ts.
  // Kept as private methods for backward compatibility (tests access via `(session as any)`).

  private parseInitialSettings(dto: GTODTO, sourceInfo: { width: number; height: number }): GTOViewSettings | null {
    return _parseInitialSettings(dto, sourceInfo);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseColorAdjustments()
  private parseColorAdjustments(dto: GTODTO): Partial<ColorAdjustments> | null {
    return _parseColorAdjustments(dto);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseCDL()
  private parseCDL(dto: GTODTO): CDLValues | null {
    return _parseCDL(dto);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseTransform()
  private parseTransform(dto: GTODTO): Transform2D | null {
    return _parseTransform(dto);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseLens()
  private parseLens(dto: GTODTO): LensDistortionParams | null {
    return _parseLens(dto);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseCrop()
  private parseCrop(dto: GTODTO, sourceInfo: { width: number; height: number }): CropState | null {
    return _parseCrop(dto, sourceInfo);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseChannelMode()
  private parseChannelMode(dto: GTODTO): ChannelMode | null {
    return _parseChannelMode(dto);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseStereo()
  private parseStereo(dto: GTODTO): StereoState | null {
    return _parseStereo(dto);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseScopes()
  private parseScopes(dto: GTODTO): ScopesState | null {
    return _parseScopes(dto);
  }

  // Annotation parsing methods - delegate to AnnotationStore.
  // Kept as methods on Session for backward compatibility (tests access via `(session as any)`).

  // @ts-ignore TS6133 - accessed by tests via (session as any).parsePaintAnnotations()
  private parsePaintAnnotations(dto: GTODTO, aspectRatio: number): void {
    this._annotationStore.parsePaintAnnotations(dto, aspectRatio);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parsePaintTagEffects()
  private parsePaintTagEffects(tagValue: string): Partial<PaintEffects> | null {
    return this._annotationStore.parsePaintTagEffects(tagValue);
  }

  // Protected so that subclasses (e.g., CoordinateParsing.test.ts TestSession) can access them.
  protected parsePenStroke(strokeId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number): PenStroke | null {
    return this._annotationStore.parsePenStroke(strokeId, frame, comp, aspectRatio);
  }

  protected parseTextAnnotation(textId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number): TextAnnotation | null {
    return this._annotationStore.parseTextAnnotation(textId, frame, comp, aspectRatio);
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

      log.info(`Image loaded via FileSourceNode: ${file.name}, isHDR=${fileSourceNode.isHDR()}, format=${fileSourceNode.formatName ?? 'standard'}`);

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
      log.warn(`FileSourceNode loading failed for ${file.name}, falling back to HTMLImageElement:`, err);
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
      video.muted = this._volumeManager.muted;
      video.volume = this._volumeManager.getEffectiveVolume();
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
        log.error('Video load error:', e);
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
    video.muted = this._volumeManager.muted;
    video.volume = this._volumeManager.getEffectiveVolume();
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
        log.warn('Initial frame preload error:', err);
      });
    }

    this.addSource(source);
    this._inPoint = 1;
    this._outPoint = duration;
    this._currentFrame = 1;

    // Pre-load initial frames for immediate playback
    if (videoSourceNode.isUsingMediabunny()) {
      videoSourceNode.preloadFrames(1).catch(err => {
        log.warn('Initial frame preload error:', err);
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
        log.debug(`Video FPS detected: ${detectedFps}`);
      }

      if (actualFrameCount > 0) {
        source.duration = actualFrameCount;
        log.debug(`Video frame count: ${actualFrameCount}`);
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
      log.warn('Failed to detect video FPS/duration:', err);
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
  getVideoFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
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
  getSourceBFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    return this.getFrameCanvasForSource(this.sourceB, frameIndex);
  }

  /**
   * Internal helper: Get frame canvas for a specific source
   */
  private getFrameCanvasForSource(
    source: MediaSource | null,
    frameIndex?: number
  ): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
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
      log.warn('Video frame preload error:', err);
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

  // A/B Source Compare methods — delegated to ABCompareManager

  get currentAB(): 'A' | 'B' {
    return this._abCompareManager.currentAB;
  }

  get sourceAIndex(): number {
    return this._abCompareManager.sourceAIndex;
  }

  get sourceBIndex(): number {
    return this._abCompareManager.sourceBIndex;
  }

  get sourceA(): MediaSource | null {
    return this.sources[this._abCompareManager.sourceAIndex] ?? null;
  }

  get sourceB(): MediaSource | null {
    const idx = this._abCompareManager.sourceBIndex;
    if (idx < 0) return null;
    return this.sources[idx] ?? null;
  }

  get abCompareAvailable(): boolean {
    return this._abCompareManager.isAvailable(this.sources.length);
  }

  get syncPlayhead(): boolean {
    return this._abCompareManager.syncPlayhead;
  }

  set syncPlayhead(value: boolean) {
    this._abCompareManager.syncPlayhead = value;
  }

  setSourceA(index: number): void {
    this._abCompareManager.setSourceA(index, this.sources.length);
    if (this._abCompareManager.currentAB === 'A') {
      this.switchToSource(index);
    }
  }

  setSourceB(index: number): void {
    this._abCompareManager.setSourceB(index, this.sources.length);
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

  

  

  

  /**
   * Toggle between A and B sources
   */
  toggleAB(): void {
    const result = this._abCompareManager.toggle(this.sources.length);
    if (!result) return;

    const savedFrame = result.shouldRestoreFrame ? this._currentFrame : null;

    this.switchToSource(result.newSourceIndex);

    // Restore frame position if sync is enabled
    if (savedFrame !== null) {
      const maxFrame = this.currentSource?.duration ?? 1;
      this._currentFrame = Math.min(savedFrame, maxFrame);
      this.syncVideoToFrame();
      this.emit('frameChanged', this._currentFrame);
    }

    this._abCompareManager.emitChanged(this._currentSourceIndex);
  }

  setCurrentAB(ab: 'A' | 'B'): void {
    if (!this._abCompareManager.shouldToggle(ab, this.sources.length)) return;
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
      volume: this._volumeManager.volume,
      muted: this._volumeManager.muted,
      preservesPitch: this._volumeManager.preservesPitch,
      marks: this._markerManager.toArray(),
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
      this._markerManager.setFromArray(state.marks);
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
