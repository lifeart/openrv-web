import { type GTODTO, type GTOData } from 'gto-js';
import { EventEmitter } from '../../utils/EventEmitter';
import type { RVEDLEntry } from '../../formats/RVEDLParser';
import type { PatternName, GradientDirection } from '../../nodes/sources/ProceduralSourceNode';
import type { HDRResizeTier } from '../../utils/media/HDRFrameResizer';
import type { PenStroke, TextAnnotation, PaintEffects } from '../../paint/types';
import type { UncropState } from '../../core/types/transform';
import type { MediaRepresentation } from '../types/representation';
import {
  type AnnotationStore,
  getNumberValue as _getNumberValue,
  getBooleanValue as _getBooleanValue,
  getNumberArray as _getNumberArray,
  getStringValue as _getStringValue,
} from './AnnotationStore';
import type { LoopMode, PlaybackMode } from '../types/session';
import type { Graph } from '../graph/Graph';
import type { HashResolveResult, AtResolveResult, GTOHashResolveResult, GTOAtResolveResult } from './PropertyResolver';
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
  parseLinearize as _parseLinearize,
  parseNoiseReduction as _parseNoiseReduction,
} from './GTOSettingsParser';
import type { GTOParseResult } from './GTOGraphLoader';
import type { SubFramePosition } from '../../utils/media/FrameInterpolator';
import { MAX_CONSECUTIVE_STARVATION_SKIPS } from './PlaybackTimingController';
import type { FPSMeasurement } from './PlaybackEngine';
import { MARKER_COLORS, type Marker, type MarkerColor } from './MarkerManager';
import type { NoteManager } from './NoteManager';
import type { VersionManager } from './VersionManager';
import type { StatusManager } from './StatusManager';
import { SessionAnnotations } from './SessionAnnotations';
import { SessionGraph } from './SessionGraph';
import { SessionMedia } from './SessionMedia';
import { SessionPlayback } from './SessionPlayback';
import type { AudioPlaybackManager } from '../../audio/AudioPlaybackManager';
// Logger removed — playback logging now lives in SessionPlayback.

// Re-export types from SessionTypes for backward compatibility
export type {
  GTOComponentDTO,
  ParsedAnnotations,
  UnsupportedCodecInfo,
  GTOViewSettings,
  MatteSettings,
  SessionMetadata,
  AudioPlaybackError,
  SessionEvents,
  MediaSource,
} from './SessionTypes';
import type {
  GTOComponentDTO,
  GTOViewSettings,
  MatteSettings,
  SessionMetadata,
  SessionEvents,
  MediaSource,
} from './SessionTypes';

export type { SubFramePosition };
export type { FPSMeasurement };
export { MARKER_COLORS };
export type { Marker, MarkerColor };

// Re-export from centralized types for backward compatibility
export type { LoopMode, MediaType, PlaybackMode } from '../types/session';
export type { RVEDLEntry } from '../../formats/RVEDLParser';

// Re-export for backward compatibility
export { PLAYBACK_SPEED_PRESETS } from '../../config/PlaybackConfig';
export type { PlaybackSpeedPreset } from '../../config/PlaybackConfig';

export class Session extends EventEmitter<SessionEvents> {
  // Playback service - owns PlaybackEngine, VolumeManager, ABCompareManager, AudioCoordinator
  private _playback = new SessionPlayback();

  // Annotation services (markers, notes, versions, statuses, annotation store)
  private _annotations = new SessionAnnotations();

  // Graph/GTO/metadata/EDL/property-resolution service
  private _sessionGraph = new SessionGraph();

  // Media source management service
  private _media = new SessionMedia();

  // Static constant for starvation threshold - kept for backward compatibility
  static readonly MAX_CONSECUTIVE_STARVATION_SKIPS = MAX_CONSECUTIVE_STARVATION_SKIPS;

  // --- Backward-compatible accessors for playback state ---
  // Tests access these via (session as any)._currentFrame etc.
  // Now route through _playback._playbackEngine.

  protected get _playbackEngine() {
    return this._playback._playbackEngine;
  }

  protected get _currentFrame(): number {
    return this._playback._playbackEngine.currentFrame;
  }
  protected set _currentFrame(v: number) {
    this._playback._playbackEngine.setCurrentFrameInternal(v);
  }

  protected get _inPoint(): number {
    return this._playback._playbackEngine.inPoint;
  }
  protected set _inPoint(v: number) {
    this._playback._playbackEngine.setInPointInternal(v);
  }

  protected get _outPoint(): number {
    return this._playback._playbackEngine.outPoint;
  }
  protected set _outPoint(v: number) {
    this._playback._playbackEngine.setOutPointInternal(v);
  }

  protected get _fps(): number {
    return this._playback._playbackEngine.fps;
  }
  protected set _fps(v: number) {
    this._playback._playbackEngine.setFpsInternal(v);
  }

  protected get _isPlaying(): boolean {
    return this._playback._playbackEngine.isPlaying;
  }
  protected set _isPlaying(v: boolean) {
    this._playback._playbackEngine.setIsPlayingInternal(v);
  }

  protected get _playDirection(): number {
    return this._playback._playbackEngine.playDirection;
  }
  protected set _playDirection(v: number) {
    this._playback._playbackEngine.setPlayDirectionInternal(v);
  }

  protected get _playbackSpeed(): number {
    return this._playback._playbackEngine.playbackSpeed;
  }

  protected get _loopMode(): LoopMode {
    return this._playback._playbackEngine.loopMode;
  }
  protected set _loopMode(v: LoopMode) {
    this._playback._playbackEngine.loopMode = v;
  }

  protected get _interpolationEnabled(): boolean {
    return this._playback._playbackEngine.interpolationEnabled;
  }

  protected get _pendingPlayPromise(): Promise<void> | null {
    return this._playback._playbackEngine.pendingPlayPromise;
  }
  protected set _pendingPlayPromise(v: Promise<void> | null) {
    this._playback._playbackEngine.setPendingPlayPromise(v);
  }

  protected get _pendingFetchFrame(): number | null {
    return this._playback._playbackEngine.pendingFetchFrame;
  }

  protected get _frameIncrement(): number {
    return this._playback._playbackEngine.frameIncrement;
  }
  protected set _frameIncrement(v: number) {
    this._playback._playbackEngine.setFrameIncrementInternal(v);
  }

  // --- Backward-compatible accessors for timing state ---
  // Tests access these via (session as any).lastFrameTime etc.

  get lastFrameTime(): number {
    return this._playback._playbackEngine.lastFrameTime;
  }
  set lastFrameTime(v: number) {
    this._playback._playbackEngine.lastFrameTime = v;
  }

  get frameAccumulator(): number {
    return this._playback._playbackEngine.frameAccumulator;
  }
  set frameAccumulator(v: number) {
    this._playback._playbackEngine.frameAccumulator = v;
  }

  get _bufferingCount(): number {
    return this._playback._playbackEngine._bufferingCount;
  }
  set _bufferingCount(v: number) {
    this._playback._playbackEngine._bufferingCount = v;
  }

  get _isBuffering(): boolean {
    return this._playback._playbackEngine._isBuffering;
  }
  set _isBuffering(v: boolean) {
    this._playback._playbackEngine._isBuffering = v;
  }

  get _starvationStartTime(): number {
    return this._playback._playbackEngine._starvationStartTime;
  }
  set _starvationStartTime(v: number) {
    this._playback._playbackEngine._starvationStartTime = v;
  }

  get _consecutiveStarvationSkips(): number {
    return this._playback._playbackEngine._consecutiveStarvationSkips;
  }
  set _consecutiveStarvationSkips(v: number) {
    this._playback._playbackEngine._consecutiveStarvationSkips = v;
  }

  get fpsFrameCount(): number {
    return this._playback._playbackEngine.fpsFrameCount;
  }
  set fpsFrameCount(v: number) {
    this._playback._playbackEngine.fpsFrameCount = v;
  }

  get fpsLastTime(): number {
    return this._playback._playbackEngine.fpsLastTime;
  }
  set fpsLastTime(v: number) {
    this._playback._playbackEngine.fpsLastTime = v;
  }

  get _effectiveFps(): number {
    return this._playback._playbackEngine._effectiveFps;
  }
  set _effectiveFps(v: number) {
    this._playback._playbackEngine._effectiveFps = v;
  }

  get _subFramePosition(): SubFramePosition | null {
    return this._playback._playbackEngine._subFramePosition;
  }
  set _subFramePosition(v: SubFramePosition | null) {
    this._playback._playbackEngine._subFramePosition = v;
  }

  // Backward-compatible proxy to media sources
  protected get sources(): MediaSource[] {
    return this._media.allSources;
  }
  protected set sources(_v: MediaSource[]) {
    /* no-op, only used by dispose to clear */
  }

  protected get _currentSourceIndex(): number {
    return this._media.currentSourceIndex;
  }
  protected set _currentSourceIndex(v: number) {
    this._media.setCurrentSourceIndexInternal(v);
  }

  protected get _hdrResizeTier(): HDRResizeTier {
    return this._media.hdrResizeTier;
  }

  constructor() {
    super();

    // Wire SessionPlayback host — gives playback access to media sources + event forwarding
    this._playback.setHost({
      getCurrentSource: () => this.currentSource,
      getSourceB: () => this._playback.sourceB,
      getSourceCount: () => this._media.sourceCount,
      getSources: () => this._media.allSources,
      getMediaCurrentSourceIndex: () => this._media.currentSourceIndex,
      setMediaCurrentSourceIndex: (index) => {
        this._media.setCurrentSourceIndexInternal(index);
      },
      emitDurationChanged: (duration) => this.emit('durationChanged', duration),
    });

    // Forward SessionPlayback events to Session events
    const playbackEvents = [
      'frameChanged',
      'playbackChanged',
      'playDirectionChanged',
      'playbackSpeedChanged',
      'loopModeChanged',
      'playbackModeChanged',
      'fpsChanged',
      'frameIncrementChanged',
      'inOutChanged',
      'interpolationEnabledChanged',
      'subFramePositionChanged',
      'buffering',
      'volumeChanged',
      'mutedChanged',
      'preservesPitchChanged',
      'audioScrubEnabledChanged',
      'audioScrubAvailabilityChanged',
      'audioError',
      'abSourceChanged',
      'fpsUpdated',
      'frameDecodeTimeout',
    ] as const;
    for (const event of playbackEvents) {
      this._playback.on(event as any, (data: any) => this.emit(event as any, data));
    }

    // Forward SessionAnnotation events to Session events
    const annotationEvents = [
      'marksChanged',
      'annotationsLoaded',
      'paintEffectsLoaded',
      'matteChanged',
      'notesChanged',
      'versionsChanged',
      'statusChanged',
      'statusesChanged',
    ] as const;
    for (const event of annotationEvents) {
      this._annotations.on(event as any, (data: any) => this.emit(event as any, data));
    }

    // Wire SessionGraph host
    this._sessionGraph.setHost({
      setFps: (fps) => {
        this.fps = fps;
      },
      setCurrentFrame: (frame) => {
        this._currentFrame = frame;
      },
      setInPoint: (v) => {
        this._inPoint = v;
      },
      setOutPoint: (v) => {
        this._outPoint = v;
      },
      setFrameIncrement: (v) => {
        this._frameIncrement = v;
      },
      setPlaybackMode: (mode) => {
        this.playbackMode = mode;
      },
      setAudioScrubEnabled: (enabled) => {
        this.audioScrubEnabled = enabled;
      },
      emitInOutChanged: (inP, outP) => this.emit('inOutChanged', { inPoint: inP, outPoint: outP }),
      emitFrameIncrementChanged: (inc) => this.emit('frameIncrementChanged', inc),
      getAnnotations: () => this._annotations,
      loadVideoSourcesFromGraph: (result) => this._media.loadVideoSourcesFromGraph(result),
    });

    // Forward SessionGraph events
    const graphEvents = ['graphLoaded', 'settingsLoaded', 'sessionLoaded', 'edlLoaded', 'metadataChanged', 'skippedNodes', 'degradedModes'] as const;
    for (const event of graphEvents) {
      this._sessionGraph.on(event as any, (data: any) => this.emit(event as any, data));
    }

    // Wire SessionMedia host
    this._media.setHost({
      getFps: () => this._fps,
      getCurrentFrame: () => this._currentFrame,
      setFps: (fps) => {
        this._fps = fps;
      },
      setInPoint: (v) => {
        this._inPoint = v;
      },
      setOutPoint: (v) => {
        this._outPoint = v;
      },
      setCurrentFrame: (v) => {
        this._currentFrame = v;
      },
      pause: () => this.pause(),
      getIsPlaying: () => this._isPlaying,
      getMuted: () => this._playback._volumeManager.muted,
      getEffectiveVolume: () => this._playback._volumeManager.getEffectiveVolume(),
      initVideoPreservesPitch: (v) => this._playback._volumeManager.initVideoPreservesPitch(v),
      onSourceAdded: (c) => this._playback._abCompareManager.onSourceAdded(c),
      emitABChanged: (i) => this._playback._abCompareManager.emitChanged(i),
      loadAudioFromVideo: (video, vol, muted) => this._playback._audioCoordinator.loadFromVideo(video, vol, muted),
      clearGraphData: () => this._sessionGraph.clearData(),
      emitFpsChanged: (fps) => this.emit('fpsChanged', fps),
      emitInOutChanged: (inP, outP) => this.emit('inOutChanged', { inPoint: inP, outPoint: outP }),
    });

    // Forward SessionMedia events
    const mediaEvents = [
      'sourceLoaded',
      'durationChanged',
      'currentSourceChanged',
      'unsupportedCodec',
      'representationChanged',
      'representationError',
      'fallbackActivated',
    ] as const;
    for (const event of mediaEvents) {
      this._media.on(event as any, (data: any) => this.emit(event as any, data));
    }
  }

  /** Media source management service */
  get media(): SessionMedia {
    return this._media;
  }

  protected addSource(source: MediaSource): void {
    this._media.addSource(source);
  }

  /**
   * Get the node graph (if loaded from GTO)
   */
  get graph(): Graph | null {
    return this._sessionGraph.graph;
  }

  /**
   * Get the full parse result including session info
   */
  get graphParseResult(): GTOParseResult | null {
    return this._sessionGraph.graphParseResult;
  }

  get gtoData(): GTOData | null {
    return this._sessionGraph.gtoData;
  }

  /**
   * Resolve an OpenRV property address against the session.
   *
   * Supports two addressing modes:
   * - Hash: `#RVColor.color.exposure` — finds nodes by protocol, resolves component.property
   * - At: `@RVDisplayColor` — finds all nodes with the given protocol
   *
   * Attempts resolution against the live Graph first; falls back to raw GTOData
   * for full component.property fidelity when no graph is loaded.
   *
   * @param address - Property address string (e.g. `#RVColor.color.exposure` or `@RVDisplayColor`)
   * @returns Matching results, or null if the address format is invalid
   */
  resolveProperty(
    address: string,
  ): HashResolveResult[] | AtResolveResult[] | GTOHashResolveResult[] | GTOAtResolveResult[] | null {
    return this._sessionGraph.resolveProperty(address);
  }

  /** Audio playback manager (via coordinator) for scrub audio and independent audio playback */
  get audioPlaybackManager(): AudioPlaybackManager {
    return this._playback.audioPlaybackManager;
  }

  get currentFrame(): number {
    return this._playback.currentFrame;
  }

  set currentFrame(frame: number) {
    this._playback.currentFrame = frame;
  }

  get inPoint(): number {
    return this._playback.inPoint;
  }

  get outPoint(): number {
    return this._playback.outPoint;
  }

  get fps(): number {
    return this._playback.fps;
  }

  set fps(value: number) {
    this._playback.fps = value;
  }

  /** Frame increment for step forward/backward */
  get frameIncrement(): number {
    return this._playback.frameIncrement;
  }

  set frameIncrement(value: number) {
    this._playback.frameIncrement = value;
  }

  /**
   * Set the HDR canvas resize tier detected at startup by DisplayCapabilities.
   * VideoSourceNode uses this instead of re-probing OffscreenCanvas capabilities.
   */
  setHDRResizeTier(tier: HDRResizeTier): void {
    this._media.setHDRResizeTier(tier);
  }

  /** Uncrop state from GTO RVFormat (for export round-trip) */
  get uncropState(): UncropState | null {
    return this._sessionGraph.uncropState;
  }

  set uncropState(state: UncropState | null) {
    this._sessionGraph.uncropState = state;
  }

  /**
   * EDL entries parsed from the last loaded RVEDL file.
   * Each entry describes a source path with in/out frame range.
   * Returns an empty array if no EDL has been loaded.
   * Source paths are local filesystem references and may need to be
   * resolved by matching against loaded files.
   */
  get edlEntries(): readonly RVEDLEntry[] {
    return this._sessionGraph.edlEntries;
  }

  /** Aggregated annotation services (markers, notes, versions, statuses, annotation store) */
  get annotations(): SessionAnnotations {
    return this._annotations;
  }

  /** Matte overlay settings */
  get matteSettings(): MatteSettings | null {
    return this._annotations.matteSettings;
  }

  /** Paint effects from session (ghost, hold, etc.) */
  get sessionPaintEffects(): Partial<PaintEffects> | null {
    return this._annotations.sessionPaintEffects;
  }

  /** Annotation store (owns paint/annotation/matte state and parsing) */
  get annotationStore(): AnnotationStore {
    return this._annotations.annotationStore;
  }

  /** Note/comment manager */
  get noteManager(): NoteManager {
    return this._annotations.noteManager;
  }

  /** Version management (shot versioning) */
  get versionManager(): VersionManager {
    return this._annotations.versionManager;
  }

  /** Shot status tracking (review workflow) */
  get statusManager(): StatusManager {
    return this._annotations.statusManager;
  }

  /** Session metadata (name, comment, version, origin) */
  get metadata(): SessionMetadata {
    return this._sessionGraph.metadata;
  }

  /**
   * Update one or more metadata fields and emit `metadataChanged`
   * when the resulting metadata differs from the current value.
   */
  updateMetadata(patch: Partial<SessionMetadata>): void {
    this._sessionGraph.updateMetadata(patch);
  }

  /**
   * Convenience helper to update the session display name.
   */
  setDisplayName(displayName: string): void {
    this._sessionGraph.setDisplayName(displayName);
  }

  get playbackMode(): PlaybackMode {
    return this._playback.playbackMode;
  }

  set playbackMode(mode: PlaybackMode) {
    this._playback.playbackMode = mode;
  }

  togglePlaybackMode(): void {
    this._playback.togglePlaybackMode();
  }

  get playbackSpeed(): number {
    return this._playback.playbackSpeed;
  }

  set playbackSpeed(value: number) {
    this._playback.playbackSpeed = value;
  }

  increaseSpeed(): void {
    this._playback.increaseSpeed();
  }

  decreaseSpeed(): void {
    this._playback.decreaseSpeed();
  }

  /**
   * Reset playback speed to 1x
   */
  resetSpeed(): void {
    this._playback.resetSpeed();
  }

  get isPlaying(): boolean {
    return this._playback.isPlaying;
  }

  get isBuffering(): boolean {
    return this._playback.isBuffering;
  }

  get loopMode(): LoopMode {
    return this._playback.loopMode;
  }

  set loopMode(mode: LoopMode) {
    this._playback.loopMode = mode;
  }

  get frameCount(): number {
    return this._playback.frameCount;
  }

  get marks(): ReadonlyMap<number, Marker> {
    return this._annotations.marks;
  }

  /**
   * Get all marked frame numbers (for backward compatibility)
   */
  get markedFrames(): number[] {
    return this._annotations.markedFrames;
  }

  /**
   * Get marker at a specific frame
   */
  getMarker(frame: number): Marker | undefined {
    return this._annotations.getMarker(frame);
  }

  /**
   * Check if a frame has a marker
   */
  hasMarker(frame: number): boolean {
    return this._annotations.hasMarker(frame);
  }

  get volume(): number {
    return this._playback.volume;
  }

  set volume(value: number) {
    this._playback.volume = value;
  }

  get muted(): boolean {
    return this._playback.muted;
  }

  set muted(value: boolean) {
    this._playback.muted = value;
  }

  toggleMute(): void {
    this._playback.toggleMute();
  }

  /**
   * Whether to preserve audio pitch when playing at non-1x speeds.
   * When true, audio pitch stays the same regardless of playback speed.
   * When false, audio pitch changes proportionally with speed (chipmunk/slow-mo effect).
   * Default: true (most users expect pitch-corrected audio).
   */
  get preservesPitch(): boolean {
    return this._playback.preservesPitch;
  }

  set preservesPitch(value: boolean) {
    this._playback.preservesPitch = value;
  }

  /**
   * Whether audio scrub snippets play during frame stepping and timeline drag.
   * When true, scrubbing produces short audio snippets at the target frame.
   * When false, scrubbing is silent (independent of mute state).
   * Default: true.
   */
  get audioScrubEnabled(): boolean {
    return this._playback.audioScrubEnabled;
  }

  set audioScrubEnabled(value: boolean) {
    this._playback.audioScrubEnabled = value;
  }

  /** Signal that a continuous scrub (timeline drag) has started. */
  onScrubStart(): void {
    this._playback.onScrubStart();
  }

  /** Signal that a continuous scrub (timeline drag) has ended. */
  onScrubEnd(): void {
    this._playback.onScrubEnd();
  }

  /**
   * Whether sub-frame interpolation is enabled for slow-motion playback.
   * When true and playing at speeds < 1x, adjacent frames are blended
   * to produce smoother slow-motion output.
   * Default: false (some users want to see exact discrete frames).
   */
  get interpolationEnabled(): boolean {
    return this._playback.interpolationEnabled;
  }

  set interpolationEnabled(value: boolean) {
    this._playback.interpolationEnabled = value;
  }

  /**
   * Current sub-frame position during slow-motion playback.
   * Non-null only when interpolation is enabled and playing at < 1x speed.
   * Used by the Viewer to blend adjacent frames for smooth slow-motion.
   */
  get subFramePosition(): SubFramePosition | null {
    return this._playback.subFramePosition;
  }

  get currentSource(): MediaSource | null {
    return this._media.currentSource;
  }

  get isSingleImage(): boolean {
    return this._media.isSingleImage;
  }

  get allSources(): MediaSource[] {
    return this._media.allSources;
  }

  get sourceCount(): number {
    return this._media.sourceCount;
  }

  getSourceByIndex(index: number): MediaSource | null {
    return this._media.getSourceByIndex(index);
  }

  get currentSourceIndex(): number {
    return this._media.currentSourceIndex;
  }

  play(): void {
    this._playback.play();
  }

  protected triggerStarvationRecoveryPreload(
    _videoSourceNode: import('../../nodes/sources/VideoSourceNode').VideoSourceNode,
    _fromFrame: number,
    _direction: number,
  ): void {
    // Handled by PlaybackEngine internally
  }

  pause(): void {
    this._playback.pause();
  }

  togglePlayback(): void {
    this._playback.togglePlayback();
  }

  togglePlayDirection(): void {
    this._playback.togglePlayDirection();
  }

  get playDirection(): number {
    return this._playback.playDirection;
  }

  /**
   * Get effective FPS (actual frames rendered per second during playback)
   * Returns 0 when not playing
   */
  get effectiveFps(): number {
    return this._playback.effectiveFps;
  }

  /**
   * Get cumulative dropped frame count since last play() started.
   * Resets to 0 when playback begins.
   */
  get droppedFrameCount(): number {
    return this._playback.droppedFrameCount;
  }

  stepForward(): void {
    this._playback.stepForward();
  }

  stepBackward(): void {
    this._playback.stepBackward();
  }

  goToFrame(frame: number): void {
    this._playback.goToFrame(frame);
  }

  goToStart(): void {
    this._playback.goToStart();
  }

  goToEnd(): void {
    this._playback.goToEnd();
  }

  setInPoint(frame?: number): void {
    this._playback.setInPoint(frame);
  }

  setOutPoint(frame?: number): void {
    this._playback.setOutPoint(frame);
  }

  resetInOutPoints(): void {
    this._playback.resetInOutPoints();
  }

  /**
   * Atomically set both in and out points, avoiding cross-clamping bugs.
   * Emits 'inOutChanged' exactly once.
   */
  setInOutRange(inPoint: number, outPoint: number): void {
    this._playback.setInOutRange(inPoint, outPoint);
  }

  /**
   * Emit a rangeShifted event (called after range shift navigation).
   */
  emitRangeShifted(inPoint: number, outPoint: number): void {
    this.emit('rangeShifted', { inPoint, outPoint });
  }

  // Marks — delegated to SessionAnnotations
  toggleMark(frame?: number): void {
    this._annotations.toggleMark(frame ?? this._currentFrame);
  }

  setMarker(frame: number, note: string = '', color: string = MARKER_COLORS[0], endFrame?: number): void {
    this._annotations.setMarker(frame, note, color, endFrame);
  }

  setMarkerEndFrame(frame: number, endFrame: number | undefined): void {
    this._annotations.setMarkerEndFrame(frame, endFrame);
  }

  getMarkerAtFrame(frame: number): Marker | undefined {
    return this._annotations.getMarkerAtFrame(frame);
  }

  setMarkerNote(frame: number, note: string): void {
    this._annotations.setMarkerNote(frame, note);
  }

  setMarkerColor(frame: number, color: string): void {
    this._annotations.setMarkerColor(frame, color);
  }

  removeMark(frame: number): void {
    this._annotations.removeMark(frame);
  }

  clearMarks(): void {
    this._annotations.clearMarks();
  }

  goToNextMarker(): number | null {
    const frame = this._annotations.markerManager.findNextMarkerFrame(this._currentFrame);
    if (frame !== null) {
      this.currentFrame = frame;
      return frame;
    }
    return null;
  }

  goToPreviousMarker(): number | null {
    const frame = this._annotations.markerManager.findPreviousMarkerFrame(this._currentFrame);
    if (frame !== null) {
      this.currentFrame = frame;
      return frame;
    }
    return null;
  }

  update(): void {
    this._playback.update();
  }

  protected advanceFrame(direction: number): void {
    this._playback.advanceFrame(direction);
  }

  // Session loading — delegated to SessionGraph
  async loadFromGTO(data: ArrayBuffer | string, availableFiles?: Map<string, File>): Promise<void> {
    return this._sessionGraph.loadFromGTO(data, availableFiles);
  }

  /**
   * Parse an RVEDL (Edit Decision List) text, store the entries on the
   * session, and emit an `edlLoaded` event.
   *
   * Each entry describes a source path with in/out frame range.
   * In a web context the source paths reference local filesystem locations
   * that cannot be loaded directly; the caller should present the entries
   * to the user so they can resolve them by loading matching files.
   *
   * The parsed entries are accessible afterwards via {@link edlEntries}.
   */
  loadEDL(text: string): RVEDLEntry[] {
    return this._sessionGraph.loadEDL(text);
  }

  // GTO value extraction helpers - delegate to standalone functions from AnnotationStore.
  // Kept as private methods for backward compatibility (tests access via `(session as any)`).
  // @ts-ignore TS6133 - accessed by tests via (session as any).getNumberValue()
  private getNumberValue(value: unknown): number | undefined {
    return _getNumberValue(value);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).getBooleanValue()
  private getBooleanValue(value: unknown): boolean | undefined {
    return _getBooleanValue(value);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).getNumberArray()
  private getNumberArray(value: unknown): number[] | undefined {
    return _getNumberArray(value);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).getStringValue()
  private getStringValue(value: unknown): string | undefined {
    return _getStringValue(value);
  }

  // GTO settings parsing - delegates to pure functions in GTOSettingsParser.ts.
  // Kept as private methods for backward compatibility (tests access via `(session as any)`).

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseInitialSettings()
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

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseLinearize()
  private parseLinearize(dto: GTODTO): LinearizeState | null {
    return _parseLinearize(dto);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parseNoiseReduction()
  private parseNoiseReduction(dto: GTODTO): NoiseReductionParams | null {
    return _parseNoiseReduction(dto);
  }

  // Annotation parsing methods - delegate to AnnotationStore.
  // Kept as methods on Session for backward compatibility (tests access via `(session as any)`).

  // @ts-ignore TS6133 - accessed by tests via (session as any).parsePaintAnnotations()
  private parsePaintAnnotations(dto: GTODTO, aspectRatio: number): void {
    this._annotations.annotationStore.parsePaintAnnotations(dto, aspectRatio);
  }

  // @ts-ignore TS6133 - accessed by tests via (session as any).parsePaintTagEffects()
  private parsePaintTagEffects(tagValue: string): Partial<PaintEffects> | null {
    return this._annotations.annotationStore.parsePaintTagEffects(tagValue);
  }

  // Protected so that subclasses (e.g., CoordinateParsing.test.ts TestSession) can access them.
  protected parsePenStroke(
    strokeId: string,
    frame: number,
    comp: GTOComponentDTO,
    aspectRatio: number,
  ): PenStroke | null {
    return this._annotations.annotationStore.parsePenStroke(strokeId, frame, comp, aspectRatio);
  }

  protected parseTextAnnotation(
    textId: string,
    frame: number,
    comp: GTOComponentDTO,
    aspectRatio: number,
  ): TextAnnotation | null {
    return this._annotations.annotationStore.parseTextAnnotation(textId, frame, comp, aspectRatio);
  }

  // Procedural source loading — delegated to SessionMedia
  loadProceduralSource(
    pattern: PatternName,
    options?: {
      width?: number;
      height?: number;
      color?: [number, number, number, number];
      direction?: GradientDirection;
      cellSize?: number;
      steps?: number;
      fps?: number;
      duration?: number;
    },
  ): void {
    this._media.loadProceduralSource(pattern, options);
  }

  loadMovieProc(url: string): void {
    this._media.loadMovieProc(url);
  }

  // File loading — delegated to SessionMedia
  async loadFile(file: File): Promise<void> {
    return this._media.loadFile(file);
  }

  async loadImage(name: string, url: string): Promise<void> {
    return this._media.loadImage(name, url);
  }

  async loadImageFile(file: File): Promise<void> {
    return this._media.loadImageFile(file);
  }

  async loadEXRFile(file: File): Promise<void> {
    return this._media.loadEXRFile(file);
  }

  async loadVideo(name: string, url: string): Promise<void> {
    return this._media.loadVideo(name, url);
  }

  async loadVideoFile(file: File): Promise<void> {
    return this._media.loadVideoFile(file);
  }

  async loadSequence(files: File[], fps?: number): Promise<void> {
    return this._media.loadSequence(files, fps);
  }

  /**
   * Load media from a URL, auto-detecting whether it is a video or image
   * based on the file extension. Used to reconstruct shared media from a
   * share-link sourceUrl on a clean session.
   */
  async loadSourceFromUrl(url: string): Promise<void> {
    const allowedSchemes = ['http:', 'https:'];
    try {
      const parsed = new URL(url);
      if (!allowedSchemes.includes(parsed.protocol)) {
        throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Unsupported')) throw e;
      throw new Error('Invalid source URL');
    }

    const pathname = new URL(url).pathname;
    const name = pathname.split('/').pop() || pathname;
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    const videoExts = new Set(['mp4', 'm4v', '3gp', '3g2', 'mov', 'qt', 'mkv', 'mk3d', 'webm', 'ogg', 'ogv', 'ogm', 'ogx', 'avi']);
    if (videoExts.has(ext)) {
      return this.loadVideo(name, url);
    }
    return this.loadImage(name, url);
  }

  // Frame access — delegated to SessionMedia
  async getSequenceFrameImage(frameIndex?: number): Promise<ImageBitmap | null> {
    return this._media.getSequenceFrameImage(frameIndex);
  }

  getSequenceFrameSync(frameIndex?: number): ImageBitmap | null {
    return this._media.getSequenceFrameSync(frameIndex);
  }

  getVideoFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    return this._media.getVideoFrameCanvas(frameIndex);
  }

  isVideoHDR(): boolean {
    return this._media.isVideoHDR();
  }

  getVideoHDRIPImage(frameIndex?: number): import('../../core/image/Image').IPImage | null {
    return this._media.getVideoHDRIPImage(frameIndex);
  }

  async fetchVideoHDRFrame(frameIndex?: number): Promise<void> {
    return this._media.fetchVideoHDRFrame(frameIndex);
  }

  async preloadVideoHDRFrames(centerFrame?: number, ahead?: number, behind?: number): Promise<void> {
    return this._media.preloadVideoHDRFrames(centerFrame, ahead, behind);
  }

  hasVideoFrameCached(frameIndex?: number): boolean {
    return this._media.hasVideoFrameCached(frameIndex);
  }

  isUsingMediabunny(): boolean {
    return this._media.isUsingMediabunny();
  }

  isSourceBUsingMediabunny(): boolean {
    return this._media.isSourceBUsingMediabunny(this.sourceB);
  }

  getSourceBFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    return this._media.getSourceBFrameCanvas(this.sourceB, frameIndex);
  }

  async fetchSourceBVideoFrame(frameIndex: number): Promise<void> {
    return this._media.fetchSourceBVideoFrame(this.sourceB, frameIndex);
  }

  preloadVideoFrames(centerFrame?: number): void {
    this._media.preloadVideoFrames(centerFrame);
  }

  async fetchCurrentVideoFrame(frameIndex?: number): Promise<void> {
    return this._media.fetchCurrentVideoFrame(frameIndex);
  }

  getCachedFrames(): Set<number> {
    return this._media.getCachedFrames();
  }

  getPendingFrames(): Set<number> {
    return this._media.getPendingFrames();
  }

  getCacheStats(): {
    cachedCount: number;
    pendingCount: number;
    totalFrames: number;
    maxCacheSize: number;
    memorySizeMB?: number;
  } | null {
    return this._media.getCacheStats();
  }

  clearVideoCache(): void {
    this._media.clearVideoCache();
  }

  /**
   * Clear all loaded media sources, releasing associated resources.
   * Used before loading a new project to replace the session (fix #121).
   */
  clearSources(): void {
    this._media.clearSources();
  }

  setCurrentSource(index: number): void {
    this._media.setCurrentSource(index);
  }

  // --- Representation management — delegated to SessionMedia ---

  /**
   * Add a representation to a source.
   */
  addRepresentationToSource(
    sourceIndex: number,
    config: import('../types/representation').AddRepresentationConfig,
  ): MediaRepresentation | null {
    return this._media.addRepresentationToSource(sourceIndex, config);
  }

  /**
   * Remove a representation from a source.
   */
  removeRepresentationFromSource(sourceIndex: number, repId: string): boolean {
    return this._media.removeRepresentationFromSource(sourceIndex, repId);
  }

  /**
   * Switch the active representation for a source.
   */
  async switchRepresentation(
    sourceIndex: number,
    repId: string,
    options?: import('../types/representation').SwitchRepresentationOptions,
  ): Promise<boolean> {
    return this._media.switchRepresentation(sourceIndex, repId, options);
  }

  /**
   * Get the active representation for a source.
   */
  getActiveRepresentation(sourceIndex: number): MediaRepresentation | null {
    return this._media.getActiveRepresentation(sourceIndex);
  }

  // A/B Source Compare methods — delegated to SessionPlayback

  get currentAB(): 'A' | 'B' {
    return this._playback.currentAB;
  }

  get sourceAIndex(): number {
    return this._playback.sourceAIndex;
  }

  get sourceBIndex(): number {
    return this._playback.sourceBIndex;
  }

  get sourceA(): MediaSource | null {
    return this._playback.sourceA;
  }

  get sourceB(): MediaSource | null {
    return this._playback.sourceB;
  }

  get abCompareAvailable(): boolean {
    return this._playback.abCompareAvailable;
  }

  get syncPlayhead(): boolean {
    return this._playback.syncPlayhead;
  }

  set syncPlayhead(value: boolean) {
    this._playback.syncPlayhead = value;
  }

  setSourceA(index: number): void {
    this._playback.setSourceA(index);
  }

  setSourceB(index: number): void {
    this._playback.setSourceB(index);
  }

  clearSourceB(): void {
    this._playback.clearSourceB();
  }

  /**
   * Toggle between A and B sources
   */
  toggleAB(): void {
    this._playback.toggleAB();
  }

  setCurrentAB(ab: 'A' | 'B'): void {
    this._playback.setCurrentAB(ab);
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
    playbackMode: PlaybackMode;
    volume: number;
    muted: boolean;
    preservesPitch: boolean;
    audioScrubEnabled: boolean;
    marks: Marker[];
    currentSourceIndex: number;
  } {
    return {
      currentFrame: this._currentFrame,
      inPoint: this._inPoint,
      outPoint: this._outPoint,
      fps: this._fps,
      loopMode: this._loopMode,
      playbackMode: this._playback.playbackMode,
      volume: this._playback.volume,
      muted: this._playback.muted,
      preservesPitch: this._playback.preservesPitch,
      audioScrubEnabled: this._playback.audioScrubEnabled,
      marks: this._annotations.markerManager.toArray(),
      currentSourceIndex: this._currentSourceIndex,
    };
  }

  /**
   * Restore playback state from serialization
   */
  setPlaybackState(
    state: Partial<{
      currentFrame: number;
      inPoint: number;
      outPoint: number;
      fps: number;
      loopMode: LoopMode;
      playbackMode: PlaybackMode;
      volume: number;
      muted: boolean;
      preservesPitch: boolean;
      audioScrubEnabled: boolean;
      marks: Marker[] | number[]; // Support both old and new format
      currentSourceIndex: number;
    }>,
  ): void {
    if (state.fps !== undefined) this.fps = state.fps;
    if (state.loopMode !== undefined) {
      this._loopMode = state.loopMode;
      // Emits via PlaybackEngine.loopMode setter → SessionPlayback → Session event forwarding.
    }
    if (state.playbackMode !== undefined) this.playbackMode = state.playbackMode;
    if (state.volume !== undefined) this.volume = state.volume;
    if (state.muted !== undefined) this.muted = state.muted;
    if (state.preservesPitch !== undefined) this.preservesPitch = state.preservesPitch;
    if (state.audioScrubEnabled !== undefined) this.audioScrubEnabled = state.audioScrubEnabled;
    if (state.inPoint !== undefined) this.setInPoint(state.inPoint);
    if (state.outPoint !== undefined) this.setOutPoint(state.outPoint);
    if (state.currentFrame !== undefined) this.currentFrame = state.currentFrame;
    if (state.marks) {
      this._annotations.markerManager.setFromArray(state.marks);
    }
    // Restore current source selection (fix #122).
    // Must be done after media is loaded, so this is applied last.
    if (state.currentSourceIndex !== undefined && state.currentSourceIndex >= 0) {
      this.setCurrentSource(state.currentSourceIndex);
    }
  }

  /**
   * Dispose all session resources
   */
  dispose(): void {
    // First: remove Session-level forwarding listeners to prevent dispose-time events
    // from reaching external listeners
    this.removeAllListeners();
    // Second: stop playback before media cleanup (pause video elements first)
    this._playback.dispose();
    this._media.dispose();
    this._annotations.dispose();
    this._sessionGraph.dispose();
  }
}
