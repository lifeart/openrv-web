import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import {
  createSequenceInfo,
  createSequenceInfoFromPattern,
  loadFrameImage,
  loadFrameImageFromURL,
  preloadFrames,
  releaseDistantFrames,
  disposeSequence,
  buildFrameNumberMap,
  getSequenceFrameRange,
} from '../../utils/media/SequenceLoader';
import { VideoSourceNode } from '../../nodes/sources/VideoSourceNode';
import { FileSourceNode } from '../../nodes/sources/FileSourceNode';
import { ProceduralSourceNode, parseMovieProc } from '../../nodes/sources/ProceduralSourceNode';
import type { PatternName, GradientDirection } from '../../nodes/sources/ProceduralSourceNode';
import type { HDRResizeTier } from '../../utils/media/HDRFrameResizer';
import type { MediaSource, UnsupportedCodecInfo } from './SessionTypes';
import type { IPImage } from '../../core/image/Image';
import type { GTOParseResult } from './GTOGraphLoader';
import { Logger } from '../../utils/Logger';
import { detectMediaTypeFromFile } from '../../utils/media/SupportedMediaFormats';
import { MediaRepresentationManager } from './MediaRepresentationManager';
import type { MediaCacheManager, CacheEntryMeta } from '../../cache/MediaCacheManager';
import { computeCacheKey } from '../../cache/MediaCacheKey';
import type {
  AddRepresentationConfig,
  MediaRepresentation,
  SwitchRepresentationOptions,
} from '../types/representation';

const log = new Logger('SessionMedia');

export interface SessionMediaEvents extends EventMap {
  sourceLoadingStarted: { name: string };
  sourceLoaded: MediaSource;
  sourceLoadFailed: { name: string };
  durationChanged: number;
  currentSourceChanged: number;
  unsupportedCodec: UnsupportedCodecInfo;
  hdrDowngraded: { filename: string };
  representationChanged: {
    sourceIndex: number;
    previousRepId: string | null;
    newRepId: string;
    representation: MediaRepresentation;
    mappedFrame?: number;
  };
  representationError: {
    sourceIndex: number;
    repId: string;
    error: string;
    userInitiated: boolean;
  };
  fallbackActivated: {
    sourceIndex: number;
    failedRepId: string;
    fallbackRepId: string;
    fallbackRepresentation: MediaRepresentation;
  };
}

export interface SessionMediaHost {
  /** Get current fps from playback */
  getFps(): number;
  /** Get current frame from playback */
  getCurrentFrame(): number;
  /** Set fps on playback */
  setFps(fps: number): void;
  /** Set in-point on playback */
  setInPoint(value: number): void;
  /** Set out-point on playback */
  setOutPoint(value: number): void;
  /** Set current frame on playback */
  setCurrentFrame(value: number): void;
  /** Pause playback (when adding source) */
  pause(): void;
  /** Resume playback */
  play(): void;
  /** Check if playing */
  getIsPlaying(): boolean;
  /** Get muted state for video element init */
  getMuted(): boolean;
  /** Get effective volume for video element init */
  getEffectiveVolume(): number;
  /** Apply preservesPitch to a new video element */
  initVideoPreservesPitch(video: HTMLVideoElement): void;
  /** A/B auto-assign callback */
  onSourceAdded(count: number): { currentSourceIndex: number; emitEvent: boolean };
  /** Emit A/B changed event */
  emitABChanged(idx: number): void;
  /** Load audio from video element */
  loadAudioFromVideo(video: HTMLVideoElement, volume: number, muted: boolean): void;
  /** Clear stale graph data when new media is loaded */
  clearGraphData(): void;
  /** Emit fpsChanged event */
  emitFpsChanged(fps: number): void;
  /** Emit inOutChanged event */
  emitInOutChanged(inPoint: number, outPoint: number): void;
}

export class SessionMedia extends EventEmitter<SessionMediaEvents> {
  private _host: SessionMediaHost | null = null;
  private _sources: MediaSource[] = [];
  private _currentSourceIndex = 0;
  private _hdrResizeTier: HDRResizeTier = 'none';
  private _proceduralCounter = 0;
  private _cacheManager: MediaCacheManager | null = null;

  // Guard to suppress duplicate sourceLoadingStarted in fallback paths
  private _suppressNextLoadingStarted = false;

  /** Representation manager for per-source media representation switching */
  private _representationManager = new MediaRepresentationManager();

  /** Original source identity fields saved before representation overwrite, keyed by source index */
  private _originalSourceIdentity = new Map<number, { name: string; url: string }>();

  /** Public accessor for the representation manager */
  get representationManager(): MediaRepresentationManager {
    return this._representationManager;
  }

  setHost(host: SessionMediaHost): void {
    this._host = host;

    // Wire representation manager accessor
    this._representationManager.setAccessor({
      getRepresentations: (sourceIndex: number) => {
        const source = this._sources[sourceIndex];
        if (!source) return null;
        if (!source.representations) {
          source.representations = [];
        }
        return source.representations;
      },
      getActiveRepresentationIndex: (sourceIndex: number) => {
        const source = this._sources[sourceIndex];
        return source?.activeRepresentationIndex ?? -1;
      },
      setActiveRepresentationIndex: (sourceIndex: number, repIndex: number) => {
        const source = this._sources[sourceIndex];
        if (source) {
          source.activeRepresentationIndex = repIndex;
        }
      },
      applyRepresentationShim: (sourceIndex: number, representation: MediaRepresentation | null) => {
        this.applyRepresentationShim(sourceIndex, representation);
      },
      getHDRResizeTier: () => this._hdrResizeTier,
      getCurrentFrame: () => this._host?.getCurrentFrame() ?? 1,
      isSequenceSource: (sourceIndex: number) => {
        const source = this._sources[sourceIndex];
        return source?.type === 'sequence';
      },
    });

    // Forward representation manager events
    this._representationManager.on('representationChanged', (data) => {
      if (data.mappedFrame !== undefined && this._host) {
        this._host.setCurrentFrame(data.mappedFrame);
      }
      this.emit('representationChanged', data);
      // Emit currentSourceChanged so listeners can clear stale per-source state
      // (e.g. floating-window QC results). Only emit when the representation
      // switch is on the currently active source.
      if (data.sourceIndex === this._currentSourceIndex) {
        this.emit('currentSourceChanged', this._currentSourceIndex);
      }
    });
    this._representationManager.on('representationError', (data) => {
      this.emit('representationError', data);
    });
    this._representationManager.on('fallbackActivated', (data) => {
      this.emit('fallbackActivated', data);
      // Also emit currentSourceChanged on fallback activation for the active source,
      // since the rendered content has changed and per-source state may be stale.
      if (data.sourceIndex === this._currentSourceIndex) {
        this.emit('currentSourceChanged', this._currentSourceIndex);
      }
    });
  }

  /**
   * Set the OPFS media cache manager for background caching of loaded files.
   * When set, file-loading methods will cache raw bytes in OPFS for fast reload.
   */
  setCacheManager(cacheManager: MediaCacheManager): void {
    this._cacheManager = cacheManager;
  }

  /**
   * Emit sourceLoadingStarted unless suppressed by a fallback guard.
   * Used at the start of each loading method to signal that a load has begun.
   */
  private emitSourceLoadingStarted(name: string): void {
    if (this._suppressNextLoadingStarted) {
      this._suppressNextLoadingStarted = false;
      return;
    }
    this.emit('sourceLoadingStarted', { name });
  }

  // --- Source accessors ---

  get currentSource(): MediaSource | null {
    return this._sources[this._currentSourceIndex] ?? null;
  }

  get isSingleImage(): boolean {
    const source = this.currentSource;
    return source !== null && source.type === 'image';
  }

  get allSources(): MediaSource[] {
    return this._sources;
  }

  get sourceCount(): number {
    return this._sources.length;
  }

  getSourceByIndex(index: number): MediaSource | null {
    return this._sources[index] ?? null;
  }

  get currentSourceIndex(): number {
    return this._currentSourceIndex;
  }

  /** @internal Direct index mutation for cross-service coordination (ABCompareManager) */
  setCurrentSourceIndexInternal(index: number): void {
    this._currentSourceIndex = index;
  }

  /** @internal Reset sources without dispose — for test setup only */
  resetSourcesInternal(sources?: MediaSource[]): void {
    this._sources = sources ?? [];
    this._currentSourceIndex = 0;
  }

  /**
   * Clear all loaded media sources, releasing associated resources.
   * Used before loading a new project to avoid importing on top of the current session (fix #121).
   */
  clearSources(): void {
    for (const source of this._sources) {
      if (source.url?.startsWith('blob:')) {
        URL.revokeObjectURL(source.url);
      }
      if (source.fileSourceNode) {
        source.fileSourceNode.dispose();
      }
      if (source.proceduralSourceNode) {
        source.proceduralSourceNode.dispose();
      }
      if (source.element instanceof HTMLVideoElement) {
        source.element.pause();
        source.element.removeAttribute('src');
        source.element.load();
      }
      this.disposeSequenceSource(source);
      this.disposeVideoSource(source);
    }
    this._sources = [];
    this._currentSourceIndex = 0;
  }

  get hdrResizeTier(): HDRResizeTier {
    return this._hdrResizeTier;
  }

  setHDRResizeTier(tier: HDRResizeTier): void {
    this._hdrResizeTier = tier;
  }

  // --- Source management ---

  /**
   * Add a source to the session and auto-configure A/B compare.
   * When the second source is added, it automatically becomes source B.
   */
  addSource(source: MediaSource): void {
    // Pause playback before adding new source to prevent timing state corruption
    if (this._host!.getIsPlaying()) {
      this._host!.pause();
    }

    this._sources.push(source);
    this._currentSourceIndex = this._sources.length - 1;

    // Delegate auto-assignment of A/B to ABCompareManager
    const abResult = this._host!.onSourceAdded(this._sources.length);
    if (abResult.emitEvent) {
      this._currentSourceIndex = abResult.currentSourceIndex;
      this._host!.emitABChanged(this._currentSourceIndex);
    }
  }

  setCurrentSource(index: number): void {
    if (index >= 0 && index < this._sources.length) {
      // Cleanup current source
      const currentSource = this.currentSource;
      if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
        currentSource.element.pause();
      }

      const previousIndex = this._currentSourceIndex;
      this._currentSourceIndex = index;
      const newSource = this.currentSource;
      if (newSource) {
        this._host!.setOutPoint(newSource.duration);
        this._host!.setInPoint(1);
        this._host!.setCurrentFrame(1);
        this.emit('durationChanged', newSource.duration);
      }
      if (index !== previousIndex) {
        this.emit('currentSourceChanged', index);
      }
    }
  }

  // --- Procedural source loading ---

  private generateUniqueSourceName(pattern: string, width: number, height: number): string {
    this._proceduralCounter++;
    if (this._proceduralCounter === 1) {
      return `${pattern} (${width}x${height})`;
    }
    return `${pattern} #${this._proceduralCounter} (${width}x${height})`;
  }

  /**
   * Load a procedural test pattern as a source.
   */
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
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(pattern);

    try {
      const width = options?.width ?? 1920;
      const height = options?.height ?? 1080;
      const fps = options?.fps ?? this._host!.getFps();
      const duration = options?.duration ?? 1;

      const node = new ProceduralSourceNode();
      node.loadPattern(pattern, width, height, {
        color: options?.color,
        direction: options?.direction,
        cellSize: options?.cellSize,
        steps: options?.steps,
        fps,
        duration,
      });

      const metadata = node.getMetadata();
      const sourceName = this.generateUniqueSourceName(pattern, metadata.width, metadata.height);

      const source: MediaSource = {
        type: 'image',
        name: sourceName,
        url: `movieproc://${pattern}`,
        width: metadata.width,
        height: metadata.height,
        duration,
        fps,
        proceduralSourceNode: node,
      };

      this.addSource(source);
      this._host!.setInPoint(1);
      this._host!.setOutPoint(duration);
      this._host!.setCurrentFrame(1);

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', duration);
    } catch (err) {
      this.emit('sourceLoadFailed', { name: pattern });
      throw err;
    }
  }

  /**
   * Load a procedural source from a .movieproc URL string.
   */
  loadMovieProc(url: string): void {
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(url);

    try {
      const params = parseMovieProc(url);
      const node = new ProceduralSourceNode();
      node.loadFromMovieProc(url);

      const metadata = node.getMetadata();
      const sourceName = this.generateUniqueSourceName(params.pattern, metadata.width, metadata.height);

      const source: MediaSource = {
        type: 'image',
        name: sourceName,
        url,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        fps: metadata.fps,
        proceduralSourceNode: node,
      };

      this.addSource(source);
      this._host!.setInPoint(1);
      this._host!.setOutPoint(metadata.duration);
      this._host!.setCurrentFrame(1);

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', metadata.duration);
    } catch (err) {
      this.emit('sourceLoadFailed', { name: url });
      throw err;
    }
  }

  // --- Loading methods ---

  async loadFile(file: File): Promise<void> {
    this._host!.clearGraphData();
    const type = this.getMediaType(file);

    if (type === 'unknown') {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : '(none)';
      log.warn(`Unsupported file type: ${file.name} (extension: .${ext})`);
      throw new Error(`Unsupported file type: ${file.name}`);
    }

    if (type === 'video') {
      await this.loadVideoFile(file);
    } else if (type === 'image') {
      await this.loadImageFile(file);
    }
  }

  private getMediaType(file: File): 'image' | 'video' | 'unknown' {
    return detectMediaTypeFromFile(file);
  }

  async loadImage(name: string, url: string): Promise<void> {
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(name);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (!this._host) return;
        const source: MediaSource = {
          type: 'image',
          name,
          url,
          width: img.width,
          height: img.height,
          duration: 1,
          fps: this._host!.getFps(),
          element: img,
        };

        this.addSource(source);
        this._host!.setInPoint(1);
        this._host!.setOutPoint(1);
        this._host!.setCurrentFrame(1);

        this.emit('sourceLoaded', source);
        this.emit('durationChanged', 1);
        resolve();
      };

      img.onerror = () => {
        this.emit('sourceLoadFailed', { name });
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }

  async loadImageFile(file: File): Promise<void> {
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(file.name);

    try {
      const fileSourceNode = new FileSourceNode(file.name);
      await fileSourceNode.loadFile(file);

      log.info(
        `Image loaded via FileSourceNode: ${file.name}, isHDR=${fileSourceNode.isHDR()}, format=${fileSourceNode.formatName ?? 'standard'}`,
      );

      const source: MediaSource = {
        type: 'image',
        name: file.name,
        url: fileSourceNode.properties.getValue<string>('url') || '',
        width: fileSourceNode.width,
        height: fileSourceNode.height,
        duration: 1,
        fps: this._host!.getFps(),
        fileSourceNode,
      };

      this.addSource(source);
      this._host!.setInPoint(1);
      this._host!.setOutPoint(1);
      this._host!.setCurrentFrame(1);

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', 1);

      // Cache file in OPFS for fast reload across sessions
      this.cacheFileInBackground(file, source);
    } catch (err) {
      log.warn(`FileSourceNode loading failed for ${file.name}, falling back to HTMLImageElement:`, err);
      // Suppress the next loadingStarted from loadImage to avoid double-counting
      this._suppressNextLoadingStarted = true;
      let url: string | undefined;
      try {
        url = URL.createObjectURL(file);
        await this.loadImage(file.name, url);
      } catch (fallbackErr) {
        if (url) {
          URL.revokeObjectURL(url);
        } else {
          // createObjectURL failed — loadImage was never called
          this.emit('sourceLoadFailed', { name: file.name });
        }
        // If url exists, loadImage already emitted sourceLoadFailed
        throw fallbackErr;
      } finally {
        this._suppressNextLoadingStarted = false;
      }
    }
  }

  async loadEXRFile(file: File): Promise<void> {
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(file.name);

    const buffer = await file.arrayBuffer();
    const url = URL.createObjectURL(file);

    try {
      const fileSourceNode = new FileSourceNode(file.name);
      await fileSourceNode.loadFromEXR(buffer, file.name, url, url);

      const source: MediaSource = {
        type: 'image',
        name: file.name,
        url,
        width: fileSourceNode.width,
        height: fileSourceNode.height,
        duration: 1,
        fps: this._host!.getFps(),
        fileSourceNode,
      };

      this.addSource(source);
      this._host!.setInPoint(1);
      this._host!.setOutPoint(1);
      this._host!.setCurrentFrame(1);

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', 1);

      // Cache file in OPFS for fast reload across sessions
      this.cacheFileInBackground(file, source);
    } catch (err) {
      URL.revokeObjectURL(url);
      this.emit('sourceLoadFailed', { name: file.name });
      throw err;
    }
  }

  async loadVideo(name: string, url: string): Promise<void> {
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(name);
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = this._host!.getMuted();
      video.volume = this._host!.getEffectiveVolume();
      video.loop = false;
      video.playsInline = true;
      this._host!.initVideoPreservesPitch(video);

      video.oncanplay = () => {
        video.oncanplay = null;
        if (!this._host) return;

        const duration = Math.ceil(video.duration * this._host!.getFps());

        const source: MediaSource = {
          type: 'video',
          name,
          url,
          width: video.videoWidth,
          height: video.videoHeight,
          duration,
          fps: this._host!.getFps(),
          element: video,
        };

        this._host!.loadAudioFromVideo(video, this._host!.getEffectiveVolume(), this._host!.getMuted());

        this.addSource(source);
        this._host!.setInPoint(1);
        this._host!.setOutPoint(duration);
        this._host!.setCurrentFrame(1);

        this.emit('sourceLoaded', source);
        this.emit('durationChanged', duration);
        resolve();
      };

      video.onerror = (e) => {
        log.error('Video load error:', e);
        this.emit('sourceLoadFailed', { name });
        reject(new Error(`Failed to load video: ${url}`));
      };

      video.src = url;
      video.load();
    });
  }

  async loadVideoFile(file: File): Promise<void> {
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(file.name);

    try {
      const videoSourceNode = new VideoSourceNode(file.name);
      const loadResult = await videoSourceNode.loadFile(file, this._host!.getFps(), this._hdrResizeTier);

      if (loadResult.unsupportedCodecError) {
        this.emit('unsupportedCodec', {
          filename: file.name,
          codec: loadResult.codec ?? null,
          codecFamily: loadResult.codecFamily ?? 'unknown',
          error: loadResult.unsupportedCodecError,
        });
      }

      if (loadResult.hdrDowngraded) {
        this.emit('hdrDowngraded', { filename: file.name });
      }

      const metadata = videoSourceNode.getMetadata();
      const duration = metadata.duration;

      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = this._host!.getMuted();
      video.volume = this._host!.getEffectiveVolume();
      video.loop = false;
      video.playsInline = true;
      this._host!.initVideoPreservesPitch(video);

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
        fps: this._host!.getFps(),
        element: video,
        videoSourceNode,
      };

      this._host!.loadAudioFromVideo(video, this._host!.getEffectiveVolume(), this._host!.getMuted());

      this.addSource(source);
      this._host!.setInPoint(1);
      this._host!.setOutPoint(duration);
      this._host!.setCurrentFrame(1);

      if (videoSourceNode.isUsingMediabunny()) {
        videoSourceNode.preloadFrames(1).catch((err) => {
          log.warn('Initial frame preload error:', err);
        });

        this.detectVideoFpsAndDuration(source, videoSourceNode);
      }

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', duration);

      // Cache file in OPFS for fast reload across sessions
      this.cacheFileInBackground(file, source);
    } catch (err) {
      this.emit('sourceLoadFailed', { name: file.name });
      throw err;
    }
  }

  private async detectVideoFpsAndDuration(source: MediaSource, videoSourceNode: VideoSourceNode): Promise<void> {
    try {
      const [detectedFps, actualFrameCount] = await Promise.all([
        videoSourceNode.getDetectedFps(),
        videoSourceNode.getActualFrameCount(),
      ]);

      // Guard: bail out if disposed while awaiting detection
      if (!this._host) return;

      if (detectedFps !== null) {
        source.fps = detectedFps;
        log.debug(`Video FPS detected: ${detectedFps}`);
      }

      if (actualFrameCount > 0) {
        source.duration = actualFrameCount;
        log.debug(`Video frame count: ${actualFrameCount}`);
      }

      const isCurrentSource = this.currentSource === source;

      if (isCurrentSource) {
        if (detectedFps !== null && detectedFps !== this._host!.getFps()) {
          this._host!.setFps(detectedFps);
          this._host!.emitFpsChanged(detectedFps);
        }

        if (actualFrameCount > 0) {
          this._host!.setOutPoint(actualFrameCount);
          this.emit('durationChanged', actualFrameCount);
          this._host!.emitInOutChanged(1, actualFrameCount);
        }
      }
    } catch (err) {
      log.warn('Failed to detect video FPS/duration:', err);
    }
  }

  async loadSequence(files: File[], fps?: number): Promise<void> {
    this._host!.clearGraphData();
    const sequenceName = files[0]?.name ?? 'sequence';
    this.emitSourceLoadingStarted(sequenceName);

    try {
      const sequenceInfo = await createSequenceInfo(files, fps ?? this._host!.getFps());
      if (!sequenceInfo) {
        throw new Error('No valid image sequence found in the selected files');
      }

      const frameRange = getSequenceFrameRange(sequenceInfo);
      const source: MediaSource = {
        type: 'sequence',
        name: sequenceInfo.name,
        url: '',
        width: sequenceInfo.width,
        height: sequenceInfo.height,
        duration: frameRange,
        fps: sequenceInfo.fps,
        sequenceInfo,
        sequenceFrames: sequenceInfo.frames,
        sequenceFrameMap: buildFrameNumberMap(sequenceInfo.frames),
        element: sequenceInfo.frames[0]?.image,
      };

      this.addSource(source);
      this._host!.setFps(sequenceInfo.fps);
      this._host!.emitFpsChanged(sequenceInfo.fps);
      this._host!.setInPoint(1);
      this._host!.setOutPoint(frameRange);
      this._host!.setCurrentFrame(1);

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', frameRange);

      preloadFrames(sequenceInfo.frames, 0, 10);
    } catch (err) {
      this.emit('sourceLoadFailed', { name: sequenceName });
      throw err;
    }
  }

  /**
   * Load a frame sequence from a URL pattern (e.g. `/path/shot.####.exr`).
   *
   * Parses the pattern to extract the frame placeholder, expands it across the
   * given frame range, and creates a sequence source.  The first frame is
   * fetched to determine dimensions; subsequent frames are loaded on demand.
   *
   * @param name - Display name for the source
   * @param pattern - URL/path with frame placeholder (`####`, `%04d`, or `@@@@`)
   * @param startFrame - First frame number (inclusive)
   * @param endFrame - Last frame number (inclusive)
   * @param fps - Frame rate (default: session fps)
   */
  async loadImageSequenceFromPattern(
    name: string,
    pattern: string,
    startFrame: number,
    endFrame: number,
    fps?: number,
  ): Promise<void> {
    this._host!.clearGraphData();
    this.emitSourceLoadingStarted(name);

    const effectiveFps = fps ?? this._host!.getFps();

    try {
      const sequenceInfo = await createSequenceInfoFromPattern(pattern, startFrame, endFrame, effectiveFps);
      sequenceInfo.name = name;

      const frameRange = getSequenceFrameRange(sequenceInfo);
      const source: MediaSource = {
        type: 'sequence',
        name,
        url: pattern,
        width: sequenceInfo.width,
        height: sequenceInfo.height,
        duration: frameRange,
        fps: sequenceInfo.fps,
        sequenceInfo,
        sequenceFrames: sequenceInfo.frames,
        sequenceFrameMap: buildFrameNumberMap(sequenceInfo.frames),
        element: sequenceInfo.frames[0]?.image,
      };

      this.addSource(source);
      this._host!.setFps(sequenceInfo.fps);
      this._host!.emitFpsChanged(sequenceInfo.fps);
      this._host!.setInPoint(1);
      this._host!.setOutPoint(frameRange);
      this._host!.setCurrentFrame(1);

      this.emit('sourceLoaded', source);
      this.emit('durationChanged', frameRange);

      log.info(
        `Sequence loaded from pattern: ${pattern} [${startFrame}-${endFrame}], ${frameRange} frames @ ${effectiveFps}fps`,
      );
    } catch (err) {
      this.emit('sourceLoadFailed', { name });
      throw err;
    }
  }

  /**
   * Load video sources from the graph nodes that have file data.
   * This enables mediabunny frame-accurate extraction for videos loaded from GTO.
   */
  async loadVideoSourcesFromGraph(result: GTOParseResult): Promise<void> {
    for (const [, node] of result.nodes) {
      if (node instanceof VideoSourceNode) {
        const file = node.properties.getValue('file') as File | undefined;
        const url = node.properties.getValue('url') as string | undefined;

        if (file) {
          log.debug(`Loading video source "${node.name}" from file: ${file.name}`);
          this.emitSourceLoadingStarted(node.name);

          try {
            await node.loadFile(file, this._host!.getFps());

            const metadata = node.getMetadata();
            const duration = metadata.duration;

            const blobUrl = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.preload = 'auto';
            video.muted = this._host!.getMuted();
            video.volume = this._host!.getEffectiveVolume();
            video.loop = false;
            video.playsInline = true;
            this._host!.initVideoPreservesPitch(video);

            try {
              await new Promise<void>((resolve, reject) => {
                video.oncanplay = () => {
                  video.oncanplay = null;
                  resolve();
                };
                video.onerror = () => reject(new Error('Failed to load video element'));
                video.src = blobUrl;
                video.load();
              });
            } catch (err) {
              URL.revokeObjectURL(blobUrl);
              throw err;
            }

            const source: MediaSource = {
              type: 'video',
              name: node.name,
              url: blobUrl,
              width: metadata.width,
              height: metadata.height,
              duration,
              fps: this._host!.getFps(),
              element: video,
              videoSourceNode: node,
            };

            if (node.isUsingMediabunny()) {
              node.preloadFrames(1).catch((err) => {
                log.warn('Initial frame preload error:', err);
              });
            }

            this._host!.loadAudioFromVideo(video, this._host!.getEffectiveVolume(), this._host!.getMuted());

            this.addSource(source);

            // Set in/out points for the first source or when we have valid duration.
            // Skip if this is an additional source being added (currentFrame > 1 means
            // we already have content loaded and shouldn't reset playback range).
            const isFirstSource = this._host!.getCurrentFrame() <= 1;
            if (isFirstSource || duration > 0) {
              this._host!.setInPoint(1);
              this._host!.setOutPoint(duration);
            }

            if (node.isUsingMediabunny()) {
              this.detectVideoFpsAndDuration(source, node);
            }

            this.emit('sourceLoaded', source);
            this.emit('durationChanged', duration);
          } catch (err) {
            this.emit('sourceLoadFailed', { name: node.name });
            throw err;
          }
        } else if (url) {
          log.debug(`Loading video source "${node.name}" from URL (no mediabunny): ${url}`);
          this.emitSourceLoadingStarted(node.name);

          try {
            await node.load(url, node.name, this._host!.getFps());

            const metadata = node.getMetadata();
            const duration = metadata.duration;

            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.preload = 'auto';
            video.muted = this._host!.getMuted();
            video.volume = this._host!.getEffectiveVolume();
            video.loop = false;
            video.playsInline = true;
            this._host!.initVideoPreservesPitch(video);

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
              fps: this._host!.getFps(),
              element: video,
              videoSourceNode: node,
            };

            this._host!.loadAudioFromVideo(video, this._host!.getEffectiveVolume(), this._host!.getMuted());

            this.addSource(source);

            if (duration > 0) {
              this._host!.setInPoint(1);
              this._host!.setOutPoint(duration);
            }

            this.emit('sourceLoaded', source);
            this.emit('durationChanged', duration);
          } catch (err) {
            this.emit('sourceLoadFailed', { name: node.name });
            throw err;
          }
        }
      }
    }
  }

  // --- Frame cache access methods ---

  async getSequenceFrameImage(frameIndex?: number): Promise<ImageBitmap | null> {
    const source = this.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames) {
      return null;
    }

    const timelineFrame = frameIndex ?? this._host!.getCurrentFrame();
    const startFrame = source.sequenceInfo?.startFrame ?? 1;
    const frameNumber = startFrame + timelineFrame - 1;
    const frame = source.sequenceFrameMap?.get(frameNumber);
    if (!frame) return null;

    // URL-based frames (from pattern loading) use URL fetching; file-based
    // frames (from local file drops) go through the decoder pipeline.
    const isURLFrame = frame.url && frame.file.size === 0;
    const image = isURLFrame
      ? await loadFrameImageFromURL(frame)
      : await loadFrameImage(frame);
    preloadFrames(source.sequenceFrames, frame.index, 5);
    releaseDistantFrames(source.sequenceFrames, frame.index, 20);

    return image;
  }

  getSequenceFrameSync(frameIndex?: number): ImageBitmap | null {
    const source = this.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames) {
      return null;
    }

    const timelineFrame = frameIndex ?? this._host!.getCurrentFrame();
    const startFrame = source.sequenceInfo?.startFrame ?? 1;
    const frameNumber = startFrame + timelineFrame - 1;
    const frame = source.sequenceFrameMap?.get(frameNumber);
    return frame?.image ?? null;
  }

  getVideoFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }

    const frame = frameIndex ?? this._host!.getCurrentFrame();
    return source.videoSourceNode.getCachedFrameCanvas(frame);
  }

  isVideoHDR(): boolean {
    const source = this.currentSource;
    return source?.type === 'video' && source.videoSourceNode?.isHDR() === true;
  }

  getVideoHDRIPImage(frameIndex?: number): IPImage | null {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isHDR()) {
      return null;
    }
    const frame = frameIndex ?? this._host!.getCurrentFrame();
    return source.videoSourceNode.getCachedHDRIPImage(frame);
  }

  async fetchVideoHDRFrame(frameIndex?: number): Promise<void> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isHDR()) {
      return;
    }
    const frame = frameIndex ?? this._host!.getCurrentFrame();
    await source.videoSourceNode.fetchHDRFrame(frame);
  }

  async preloadVideoHDRFrames(centerFrame?: number, ahead?: number, behind?: number): Promise<void> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isHDR()) {
      return;
    }
    const frame = centerFrame ?? this._host!.getCurrentFrame();
    await source.videoSourceNode.preloadHDRFrames(frame, ahead, behind);
  }

  hasVideoFrameCached(frameIndex?: number): boolean {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return false;
    }

    const frame = frameIndex ?? this._host!.getCurrentFrame();
    return source.videoSourceNode.hasFrameCached(frame);
  }

  isUsingMediabunny(): boolean {
    return this.isSourceUsingMediabunny(this.currentSource);
  }

  isSourceBUsingMediabunny(sourceB: MediaSource | null): boolean {
    return this.isSourceUsingMediabunny(sourceB);
  }

  private isSourceUsingMediabunny(source: MediaSource | null): boolean {
    return source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny() === true;
  }

  getSourceBFrameCanvas(
    sourceB: MediaSource | null,
    frameIndex?: number,
  ): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    return this.getFrameCanvasForSource(sourceB, frameIndex);
  }

  private getFrameCanvasForSource(
    source: MediaSource | null,
    frameIndex?: number,
  ): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }

    const frame = frameIndex ?? this._host!.getCurrentFrame();
    return source.videoSourceNode.getCachedFrameCanvas(frame);
  }

  async fetchSourceBVideoFrame(sourceB: MediaSource | null, frameIndex: number): Promise<void> {
    await this.fetchFrameForSource(sourceB, frameIndex);
  }

  private async fetchFrameForSource(source: MediaSource | null, frameIndex: number): Promise<void> {
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    await source.videoSourceNode.getFrameAsync(frameIndex);
  }

  preloadVideoFrames(centerFrame?: number): void {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    const frame = centerFrame ?? this._host!.getCurrentFrame();
    source.videoSourceNode.preloadFrames(frame).catch((err) => {
      log.warn('Video frame preload error:', err);
    });
  }

  async fetchCurrentVideoFrame(frameIndex?: number): Promise<void> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    const frame = frameIndex ?? this._host!.getCurrentFrame();

    if (source.videoSourceNode.hasFrameCached(frame)) {
      return;
    }

    await source.videoSourceNode.getFrameAsync(frame);
  }

  getCachedFrames(): Set<number> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return new Set();
    }
    return source.videoSourceNode.getCachedFrames();
  }

  getPendingFrames(): Set<number> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return new Set();
    }
    return source.videoSourceNode.getPendingFrames();
  }

  getCacheStats(): {
    cachedCount: number;
    pendingCount: number;
    totalFrames: number;
    maxCacheSize: number;
    memorySizeMB?: number;
  } | null {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }
    return source.videoSourceNode.getCacheStats();
  }

  clearVideoCache(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny()) {
      source.videoSourceNode.clearCache();
    }
  }

  // --- Representation management ---

  /**
   * Add a representation to a source.
   *
   * @param sourceIndex - Index of the source to add the representation to
   * @param config - Configuration for the new representation
   * @returns The created MediaRepresentation, or null if the source is invalid
   */
  addRepresentationToSource(sourceIndex: number, config: AddRepresentationConfig): MediaRepresentation | null {
    const source = this._sources[sourceIndex];
    if (!source) return null;

    // Ensure the representations array exists
    if (!source.representations) {
      source.representations = [];
    }

    return this._representationManager.addRepresentation(sourceIndex, config);
  }

  /**
   * Remove a representation from a source.
   *
   * @param sourceIndex - Index of the source
   * @param repId - ID of the representation to remove
   * @returns true if removed, false if not found
   */
  removeRepresentationFromSource(sourceIndex: number, repId: string): boolean {
    return this._representationManager.removeRepresentation(sourceIndex, repId);
  }

  /**
   * Switch the active representation for a source.
   *
   * @param sourceIndex - Index of the source
   * @param repId - ID of the representation to switch to
   * @param options - Switch options
   */
  async switchRepresentation(
    sourceIndex: number,
    repId: string,
    options?: SwitchRepresentationOptions,
  ): Promise<boolean> {
    // Save playing state before pausing so we can resume after switch
    const wasPlaying = this._host?.getIsPlaying() ?? false;

    // Pause playback before switching to avoid stale state
    if (wasPlaying) {
      this._host!.pause();
    }

    const success = await this._representationManager.switchRepresentation(sourceIndex, repId, options);

    // Resume playback if it was playing before the switch and the switch succeeded
    if (wasPlaying && success) {
      this._host!.play();
    }

    return success;
  }

  /**
   * Get the active representation for a source.
   */
  getActiveRepresentation(sourceIndex: number): MediaRepresentation | null {
    return this._representationManager.getActiveRepresentation(sourceIndex);
  }

  /**
   * Apply the active representation's source node to the MediaSource shim fields.
   * This ensures all existing rendering code works without changes.
   *
   * @param sourceIndex - Index of the source
   * @param representation - The representation to apply
   */
  private applyRepresentationShim(sourceIndex: number, representation: MediaRepresentation | null): void {
    const source = this._sources[sourceIndex];
    if (!source) return;

    // Clear old source nodes
    source.videoSourceNode = undefined;
    source.fileSourceNode = undefined;
    source.sequenceInfo = undefined;
    source.sequenceFrames = undefined;
    source.element = undefined;

    // If null, we are clearing the source (no active representation)
    if (!representation) {
      // Restore original name/url if they were saved
      const saved = this._originalSourceIdentity.get(sourceIndex);
      if (saved) {
        source.name = saved.name;
        source.url = saved.url;
        this._originalSourceIdentity.delete(sourceIndex);
      }
      log.info(`Cleared representation shim for source ${sourceIndex}`);
      return;
    }

    // Save original name/url before overwriting (only on first representation apply)
    if (!this._originalSourceIdentity.has(sourceIndex)) {
      this._originalSourceIdentity.set(sourceIndex, { name: source.name, url: source.url });
    }

    // Update name from representation label (if available)
    if (representation.label) {
      source.name = representation.label;
    }

    // Update url from representation loaderConfig (prefer url, fall back to path)
    if (representation.loaderConfig.url) {
      source.url = representation.loaderConfig.url;
    } else if (representation.loaderConfig.path) {
      source.url = representation.loaderConfig.path;
    }

    // Update the top-level fields from the representation
    source.width = representation.resolution.width;
    source.height = representation.resolution.height;

    // Update duration and fps from the representation when available
    const isCurrentSource = this.currentSource === source;

    if (representation.duration !== undefined && representation.duration > 0) {
      source.duration = representation.duration;
      if (isCurrentSource && this._host) {
        this._host.setOutPoint(representation.duration);
        this.emit('durationChanged', representation.duration);
        this._host.emitInOutChanged(1, representation.duration);
      }
    }

    if (representation.fps !== undefined && representation.fps > 0) {
      source.fps = representation.fps;
      if (isCurrentSource && this._host) {
        if (representation.fps !== this._host.getFps()) {
          this._host.setFps(representation.fps);
          this._host.emitFpsChanged(representation.fps);
        }
      }
    }

    // Set the appropriate source node based on the representation's source node type
    const sourceNode = representation.sourceNode;
    if (!sourceNode) return;

    // Check the source node type and update the appropriate field
    if (sourceNode instanceof VideoSourceNode) {
      source.videoSourceNode = sourceNode;
      source.type = 'video';

      // Create an HTMLVideoElement so that playback sync & audio wiring
      // work the same way as a normal video load path.
      const videoUrl =
        representation.loaderConfig.url ??
        (representation.loaderConfig.file
          ? URL.createObjectURL(representation.loaderConfig.file)
          : source.url);

      if (videoUrl) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.muted = this._host!.getMuted();
        video.volume = this._host!.getEffectiveVolume();
        video.loop = false;
        video.playsInline = true;
        this._host!.initVideoPreservesPitch(video);
        video.src = videoUrl;
        video.load();

        source.element = video;
        this._host!.loadAudioFromVideo(
          video,
          this._host!.getEffectiveVolume(),
          this._host!.getMuted(),
        );
      }
    } else if (sourceNode instanceof FileSourceNode) {
      source.fileSourceNode = sourceNode;
      source.type = 'image';
    } else {
      // Could be a SequenceSourceNodeWrapper or other type
      // Try to get element from the source node
      const element = sourceNode.getElement(1);
      if (element) {
        source.element = element;
      }
      source.type = 'sequence';
    }

    log.info(`Applied representation shim: ${representation.label} (${representation.kind}) to source ${sourceIndex}`);
  }

  // --- Background OPFS caching ---

  /**
   * Cache a loaded file's raw bytes in OPFS for fast reload across sessions.
   * Runs in the background and never throws.
   */
  private cacheFileInBackground(file: File, source: MediaSource): void {
    if (!this._cacheManager) return;

    const cache = this._cacheManager;

    computeCacheKey(file)
      .then(async (cacheKey) => {
        source.opfsCacheKey = cacheKey;

        const buffer = await file.arrayBuffer();
        const meta: CacheEntryMeta = {
          fileName: file.name,
          fileSize: file.size,
          lastModified: file.lastModified,
          mimeType: file.type || undefined,
          width: source.width,
          height: source.height,
        };
        await cache.put(cacheKey, buffer, meta);
        log.debug(`Cached file in OPFS: ${file.name} (key=${cacheKey.slice(0, 8)}...)`);
      })
      .catch((err) => {
        log.warn(`Background cache failed for ${file.name}:`, err);
      });
  }

  // --- Disposal ---

  disposeSequenceSource(source: MediaSource): void {
    if (source.type === 'sequence' && source.sequenceFrames) {
      disposeSequence(source.sequenceFrames);
    }
  }

  disposeVideoSource(source: MediaSource): void {
    if (source.type === 'video' && source.videoSourceNode) {
      source.videoSourceNode.dispose();
    }
  }

  dispose(): void {
    for (const source of this._sources) {
      // Revoke blob URLs created by loadVideoFile / loadEXRFile / loadVideoSourcesFromGraph
      if (source.url?.startsWith('blob:')) {
        URL.revokeObjectURL(source.url);
      }
      // Dispose FileSourceNode for image sources (loadImageFile / loadEXRFile)
      if (source.fileSourceNode) {
        source.fileSourceNode.dispose();
      }
      // Dispose ProceduralSourceNode for procedural sources
      if (source.proceduralSourceNode) {
        source.proceduralSourceNode.dispose();
      }
      // Pause and detach video elements to release media resources
      if (source.element instanceof HTMLVideoElement) {
        source.element.pause();
        source.element.removeAttribute('src');
        source.element.load();
      }
      this.disposeSequenceSource(source);
      this.disposeVideoSource(source);
    }
    this._sources = [];
    this._currentSourceIndex = 0;
    this._representationManager.dispose();
    this._cacheManager = null;
    this._host = null;
    this.removeAllListeners();
  }
}
