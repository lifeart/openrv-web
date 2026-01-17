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
import { Graph } from '../graph/Graph';
import { loadGTOGraph } from './GTOGraphLoader';
import type { GTOParseResult } from './GTOGraphLoader';

export interface ParsedAnnotations {
  annotations: Annotation[];
  effects?: Partial<PaintEffects>;
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
  scopes?: ScopesState;
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
  marksChanged: ReadonlySet<number>;
  annotationsLoaded: ParsedAnnotations;
  settingsLoaded: GTOViewSettings;
  volumeChanged: number;
  mutedChanged: boolean;
  graphLoaded: GTOParseResult;
  fpsChanged: number;
  abSourceChanged: { current: 'A' | 'B'; sourceIndex: number };
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
}

export class Session extends EventEmitter<SessionEvents> {
  private _currentFrame = 1;
  private _inPoint = 1;
  private _outPoint = 1;
  private _fps = 24;
  private _isPlaying = false;
  private _playDirection = 1;
  private _loopMode: LoopMode = 'loop';
  private _marks = new Set<number>();
  private _volume = 0.7;
  private _muted = false;

  private lastFrameTime = 0;
  private frameAccumulator = 0;

  // Media sources
  private sources: MediaSource[] = [];
  private _currentSourceIndex = 0;

  // A/B source comparison
  private _sourceAIndex = 0;
  private _sourceBIndex = -1; // -1 means no B source assigned
  private _currentAB: 'A' | 'B' = 'A';
  private _syncPlayhead = true;

  // Node graph from GTO file
  private _graph: Graph | null = null;
  private _graphParseResult: GTOParseResult | null = null;
  private _gtoData: GTOData | null = null;


  constructor() {
    super();
  }

  /**
   * Add a source to the session and auto-configure A/B compare
   * When the second source is added, it automatically becomes source B
   */
  private addSource(source: MediaSource): void {
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

  get isPlaying(): boolean {
    return this._isPlaying;
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

  get marks(): ReadonlySet<number> {
    return this._marks;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    if (clamped !== this._volume) {
      this._volume = clamped;
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
    this.muted = !this._muted;
  }

  private applyVolumeToVideo(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      source.element.volume = this._muted ? 0 : this._volume;
      source.element.muted = this._muted;
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

  // Playback control
  play(): void {
    if (!this._isPlaying) {
      this._isPlaying = true;
      this.lastFrameTime = performance.now();
      this.frameAccumulator = 0;

      // Start video playback if current source is video (only for forward playback)
      const source = this.currentSource;
      if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
        if (this._playDirection === 1) {
          source.element.play();
        } else {
          // For reverse playback, keep video paused - we'll seek frame by frame
          source.element.pause();
        }
      }

      this.emit('playbackChanged', true);
    }
  }

  pause(): void {
    if (this._isPlaying) {
      this._isPlaying = false;

      // Pause video if current source is video
      const source = this.currentSource;
      if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
        source.element.pause();
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

    // Handle video playback mode switching while playing
    const source = this.currentSource;
    if (this._isPlaying && source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      if (this._playDirection === 1) {
        // Switching to forward: start native video playback
        source.element.play();
      } else {
        // Switching to reverse: pause video, will use frame-based seeking
        source.element.pause();
        this.lastFrameTime = performance.now();
        this.frameAccumulator = 0;
      }
    }

    this.emit('playDirectionChanged', this._playDirection);
  }

  get playDirection(): number {
    return this._playDirection;
  }

  stepForward(): void {
    this.pause();
    this.advanceFrame(1);
  }

  stepBackward(): void {
    this.pause();
    this.advanceFrame(-1);
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
  toggleMark(frame?: number): void {
    const f = frame ?? this._currentFrame;
    if (this._marks.has(f)) {
      this._marks.delete(f);
    } else {
      this._marks.add(f);
    }
    this.emit('marksChanged', this._marks);
  }

  clearMarks(): void {
    this._marks.clear();
    this.emit('marksChanged', this._marks);
  }

  // Update called each frame
  update(): void {
    if (!this._isPlaying) return;

    const source = this.currentSource;

    // For video with forward playback, sync frame from video time
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement && this._playDirection === 1) {
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
          video.play();
        } else if (this._loopMode === 'once') {
          this.pause();
        }
      }
    } else {
      // For images or video with reverse playback, use frame-based timing
      const now = performance.now();
      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;

      const frameDuration = 1000 / this._fps;
      this.frameAccumulator += delta;

      while (this.frameAccumulator >= frameDuration) {
        this.frameAccumulator -= frameDuration;
        this.advanceFrame(this._playDirection);
      }

      // For video reverse playback, seek to the current frame
      if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
        const targetTime = (this._currentFrame - 1) / this._fps;
        source.element.currentTime = targetTime;
      }
    }
  }

  private advanceFrame(direction: number): void {
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
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      const targetTime = (this._currentFrame - 1) / this._fps;
      if (Math.abs(source.element.currentTime - targetTime) > 0.1) {
        source.element.currentTime = targetTime;
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
        this._marks = new Set(result.sessionInfo.marks);
        this.emit('marksChanged', this._marks);
      }

      if (result.nodes.size > 0) {
        console.debug('GTO Graph loaded:', {
          nodeCount: result.nodes.size,
          rootNode: result.rootNode?.name,
          sessionInfo: result.sessionInfo,
        });
      }

      this.emit('graphLoaded', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Failed to load node graph from GTO:', message);
      // Non-fatal - continue with session
    }

    this.emit('sessionLoaded', undefined);
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
            this._marks = new Set(marks);
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

    return {
      rotation,
      flipH: flopValue === 1,
      flipV: flipValue === 1,
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

    const params: LensDistortionParams = {
      k1: k1 ?? 0,
      k2: k2 ?? 0,
      centerX: 0,
      centerY: 0,
      scale: 1,
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
      const strokeData = new Map<string, unknown>();

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parsePenStroke(strokeId: string, frame: number, comp: any, aspectRatio: number): PenStroke | null {
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

    // Parse points - stored as float[2] pairs
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -1 to +1
    const points: Array<{ x: number; y: number; pressure?: number }> = [];
    if (pointsValue && Array.isArray(pointsValue)) {
      for (const point of pointsValue) {
        if (Array.isArray(point) && point.length >= 2) {
          const rawX = point[0] as number;
          const rawY = point[1] as number;
          // Convert from OpenRV coords to normalized 0-1 coords
          // OpenRV Coords are height-normalized (Y: -0.5 to 0.5)
          points.push({
            x: rawX / aspectRatio + 0.5,
            y: rawY + 0.5,
          });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseTextAnnotation(textId: string, frame: number, comp: any, aspectRatio: number): TextAnnotation | null {
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
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -1 to +1
    let x = 0.5, y = 0.5;
    if (positionValue && Array.isArray(positionValue) && positionValue.length >= 2) {
      const posData = positionValue[0];
      if (Array.isArray(posData) && posData.length >= 2) {
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
    const url = URL.createObjectURL(file);
    const type = this.getMediaType(file);

    try {
      if (type === 'video') {
        await this.loadVideo(file.name, url);
      } else if (type === 'image') {
        await this.loadImage(file.name, url);
      }
    } catch (err) {
      URL.revokeObjectURL(url);
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
   * Cleanup sequence resources when switching sources or disposing
   */
  private disposeSequenceSource(source: MediaSource): void {
    if (source.type === 'sequence' && source.sequenceFrames) {
      disposeSequence(source.sequenceFrames);
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
    marks: number[];
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
      marks: Array.from(this._marks),
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
    marks: number[];
    currentSourceIndex: number;
  }>): void {
    if (state.fps !== undefined) this.fps = state.fps;
    if (state.loopMode !== undefined) {
      this._loopMode = state.loopMode;
      this.emit('loopModeChanged', this._loopMode);
    }
    if (state.volume !== undefined) this.volume = state.volume;
    if (state.muted !== undefined) this.muted = state.muted;
    if (state.inPoint !== undefined) this.setInPoint(state.inPoint);
    if (state.outPoint !== undefined) this.setOutPoint(state.outPoint);
    if (state.currentFrame !== undefined) this.currentFrame = state.currentFrame;
    if (state.marks) {
      this._marks.clear();
      state.marks.forEach(m => this._marks.add(m));
      this.emit('marksChanged', this._marks);
    }
  }

  /**
   * Dispose all session resources
   */
  dispose(): void {
    // Cleanup all sequence sources
    for (const source of this.sources) {
      this.disposeSequenceSource(source);
    }
    this.sources = [];
  }
}
