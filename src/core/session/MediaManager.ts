import type { ManagerBase } from '../ManagerBase';
import type { MediaSource, UnsupportedCodecInfo } from './Session';
import type { MediaType } from '../types/session';
import {
  createSequenceInfo,
  loadFrameImage,
  preloadFrames,
  releaseDistantFrames,
  disposeSequence,
} from '../../utils/media/SequenceLoader';
import { VideoSourceNode } from '../../nodes/sources/VideoSourceNode';
import { FileSourceNode } from '../../nodes/sources/FileSourceNode';
import type { GTOParseResult } from './GTOGraphLoader';
import { Logger } from '../../utils/Logger';

const log = new Logger('MediaManager');

/**
 * Interface that MediaManager uses to communicate with its host (Session).
 * Follows the same pattern as PlaybackEngineHost.
 */
export interface MediaManagerHost {
  /** Get the current FPS */
  getFps(): number;
  /** Set FPS (internal, bypasses events) */
  setFpsInternal(value: number): void;
  /** Emit fpsChanged event */
  emitFpsChanged(fps: number): void;
  /** Get the current frame */
  getCurrentFrame(): number;
  /** Set current frame (internal, bypasses events) */
  setCurrentFrameInternal(frame: number): void;
  /** Get in point */
  getInPoint(): number;
  /** Set in point (internal, bypasses events) */
  setInPointInternal(value: number): void;
  /** Get out point */
  getOutPoint(): number;
  /** Set out point (internal, bypasses events) */
  setOutPointInternal(value: number): void;
  /** Get whether currently playing */
  getIsPlaying(): boolean;
  /** Pause playback */
  pause(): void;
  /** Get muted state */
  getMuted(): boolean;
  /** Get effective volume */
  getEffectiveVolume(): number;
  /** Initialize preservesPitch on a video element */
  initVideoPreservesPitch(video: HTMLVideoElement): void;
  /** Notify that a source was added (for A/B compare auto-assignment) */
  onSourceAdded(sourceCount: number): { currentSourceIndex: number; emitEvent: boolean };
  /** Emit A/B source changed */
  emitABChanged(currentSourceIndex: number): void;
  /** Emit sourceLoaded event */
  emitSourceLoaded(source: MediaSource): void;
  /** Emit durationChanged event */
  emitDurationChanged(duration: number): void;
  /** Emit inOutChanged event */
  emitInOutChanged(inPoint: number, outPoint: number): void;
  /** Emit unsupportedCodec event */
  emitUnsupportedCodec(info: UnsupportedCodecInfo): void;
}

/**
 * MediaManager owns all media source state and operations:
 * - Source array and current source index
 * - Source CRUD (add, remove, set current, switch)
 * - File/image/video/sequence loading
 * - Frame fetching and cache management
 * - Video FPS/duration detection
 * - Source disposal
 *
 * State is owned by this manager. Session delegates to it.
 * The manager communicates with Session via the MediaManagerHost interface.
 */
export class MediaManager implements ManagerBase {
  // Media sources
  private _sources: MediaSource[] = [];
  private _currentSourceIndex = 0;

  // Host reference
  private _host: MediaManagerHost | null = null;

  /**
   * Set the host that provides playback state access and event emission.
   */
  setHost(host: MediaManagerHost): void {
    this._host = host;
  }

  // ---------------------------------------------------------------
  // Source accessors
  // ---------------------------------------------------------------

  get sources(): MediaSource[] {
    return this._sources;
  }

  set sources(value: MediaSource[]) {
    this._sources = value;
  }

  get currentSource(): MediaSource | null {
    return this._sources[this._currentSourceIndex] ?? null;
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

  set currentSourceIndex(value: number) {
    this._currentSourceIndex = value;
  }

  // ---------------------------------------------------------------
  // Source CRUD
  // ---------------------------------------------------------------

  /**
   * Add a source to the session and auto-configure A/B compare.
   * When the second source is added, it automatically becomes source B.
   *
   * Note: If playback is active when this method is called, it will be paused
   * automatically. This prevents timing state corruption where accumulated
   * frame timing from the previous source would be incorrectly applied to the
   * new source. A 'playbackChanged' event will be emitted in this case.
   */
  addSource(source: MediaSource): void {
    // Pause playback before adding new source to prevent timing state corruption
    if (this._host?.getIsPlaying()) {
      this._host.pause();
    }

    this._sources.push(source);
    this._currentSourceIndex = this._sources.length - 1;

    // Delegate auto-assignment of A/B to host (ABCompareManager)
    const abResult = this._host?.onSourceAdded(this._sources.length);
    if (abResult?.emitEvent) {
      this._currentSourceIndex = abResult.currentSourceIndex;
      this._host?.emitABChanged(this._currentSourceIndex);
    }
  }

  /**
   * Switch between sources
   */
  setCurrentSource(index: number): void {
    if (index >= 0 && index < this._sources.length) {
      // Cleanup current source
      const currentSource = this.currentSource;
      if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
        currentSource.element.pause();
      }
      // Note: We don't dispose sequences here since user might switch back

      this._currentSourceIndex = index;
      const newSource = this.currentSource;
      if (newSource) {
        this._host?.setOutPointInternal(newSource.duration);
        this._host?.setInPointInternal(1);
        this._host?.setCurrentFrameInternal(1);
        this._host?.emitDurationChanged(newSource.duration);
      }
    }
  }

  /**
   * Internal helper to switch to a source without resetting frame
   */
  switchToSource(index: number): void {
    if (index < 0 || index >= this._sources.length) return;

    // Pause current video if playing
    const currentSource = this.currentSource;
    if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
      currentSource.element.pause();
    }

    this._currentSourceIndex = index;

    // Update duration but preserve frame if syncing
    const newSource = this.currentSource;
    if (newSource) {
      this._host?.setOutPointInternal(newSource.duration);
      this._host?.setInPointInternal(1);
      this._host?.emitDurationChanged(newSource.duration);
    }
  }

  // ---------------------------------------------------------------
  // File type detection
  // ---------------------------------------------------------------

  getMediaType(file: File): MediaType {
    const videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (videoTypes.includes(file.type) || /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(file.name)) {
      return 'video';
    }
    return 'image';
  }

  // ---------------------------------------------------------------
  // File loading
  // ---------------------------------------------------------------

  async loadFile(file: File): Promise<void> {
    const type = this.getMediaType(file);

    try {
      if (type === 'video') {
        await this.loadVideoFile(file);
      } else if (type === 'image') {
        await this.loadImageFile(file);
      }
    } catch (err) {
      throw err;
    }
  }

  async loadImage(name: string, url: string): Promise<void> {
    const fps = this._host?.getFps() ?? 24;
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
          fps,
          element: img,
        };

        this.addSource(source);
        this._host?.setInPointInternal(1);
        this._host?.setOutPointInternal(1);
        this._host?.setCurrentFrameInternal(1);

        this._host?.emitSourceLoaded(source);
        this._host?.emitDurationChanged(1);
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
   */
  async loadImageFile(file: File): Promise<void> {
    const fps = this._host?.getFps() ?? 24;

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
        fps,
        fileSourceNode,
      };

      this.addSource(source);
      this._host?.setInPointInternal(1);
      this._host?.setOutPointInternal(1);
      this._host?.setCurrentFrameInternal(1);

      this._host?.emitSourceLoaded(source);
      this._host?.emitDurationChanged(1);
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
    const fps = this._host?.getFps() ?? 24;

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
        fps,
        fileSourceNode,
      };

      this.addSource(source);
      this._host?.setInPointInternal(1);
      this._host?.setOutPointInternal(1);
      this._host?.setCurrentFrameInternal(1);

      this._host?.emitSourceLoaded(source);
      this._host?.emitDurationChanged(1);
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  async loadVideo(name: string, url: string): Promise<void> {
    const fps = this._host?.getFps() ?? 24;
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = this._host?.getMuted() ?? false;
      video.volume = this._host?.getEffectiveVolume() ?? 1;
      video.loop = false;
      video.playsInline = true;
      this._host?.initVideoPreservesPitch(video);

      video.oncanplay = () => {
        video.oncanplay = null;

        const duration = Math.ceil(video.duration * fps);

        const source: MediaSource = {
          type: 'video',
          name,
          url,
          width: video.videoWidth,
          height: video.videoHeight,
          duration,
          fps,
          element: video,
        };

        this.addSource(source);
        this._host?.setInPointInternal(1);
        this._host?.setOutPointInternal(duration);
        this._host?.setCurrentFrameInternal(1);

        this._host?.emitSourceLoaded(source);
        this._host?.emitDurationChanged(duration);
        resolve();
      };

      video.onerror = (e) => {
        log.error('Video load error:', e);
        reject(new Error(`Failed to load video: ${url}`));
      };

      video.src = url;
      video.load();
    });
  }

  /**
   * Load a video file with mediabunny support for smooth frame-accurate playback.
   */
  async loadVideoFile(file: File): Promise<void> {
    const fps = this._host?.getFps() ?? 24;

    // Create VideoSourceNode for frame-accurate extraction
    const videoSourceNode = new VideoSourceNode(file.name);
    const loadResult = await videoSourceNode.loadFile(file, fps);

    // Check for unsupported codec and emit event if detected
    if (loadResult.unsupportedCodecError) {
      this._host?.emitUnsupportedCodec({
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
    video.muted = this._host?.getMuted() ?? false;
    video.volume = this._host?.getEffectiveVolume() ?? 1;
    video.loop = false;
    video.playsInline = true;
    this._host?.initVideoPreservesPitch(video);

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
      fps,
      element: video,
      videoSourceNode,
    };

    // Pre-fetch initial frames for immediate display
    if (videoSourceNode.isUsingMediabunny()) {
      videoSourceNode.preloadFrames(1).catch(err => {
        log.warn('Initial frame preload error:', err);
      });
    }

    this.addSource(source);
    this._host?.setInPointInternal(1);
    this._host?.setOutPointInternal(duration);
    this._host?.setCurrentFrameInternal(1);

    // Pre-load initial frames for immediate playback
    if (videoSourceNode.isUsingMediabunny()) {
      videoSourceNode.preloadFrames(1).catch(err => {
        log.warn('Initial frame preload error:', err);
      });

      // Detect actual FPS and frame count from video (async, updates when ready)
      this.detectVideoFpsAndDuration(source, videoSourceNode);
    }

    this._host?.emitSourceLoaded(source);
    this._host?.emitDurationChanged(duration);
  }

  /**
   * Load video sources from the graph nodes that have file data
   */
  async loadVideoSourcesFromGraph(result: GTOParseResult): Promise<void> {
    const fps = this._host?.getFps() ?? 24;

    for (const [, node] of result.nodes) {
      if (node instanceof VideoSourceNode) {
        const file = node.properties.getValue('file') as File | undefined;
        const url = node.properties.getValue('url') as string | undefined;

        if (file) {
          log.debug(`Loading video source "${node.name}" from file: ${file.name}`);

          await node.loadFile(file, fps);

          const metadata = node.getMetadata();
          const duration = metadata.duration;

          // Also create HTMLVideoElement for audio playback
          const blobUrl = URL.createObjectURL(file);
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = this._host?.getMuted() ?? false;
          video.volume = this._host?.getEffectiveVolume() ?? 1;
          video.loop = false;
          video.playsInline = true;
          this._host?.initVideoPreservesPitch(video);

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
            fps,
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
          const outPoint = this._host?.getOutPoint() ?? 0;
          if (outPoint === 0 || outPoint < duration) {
            this._host?.setInPointInternal(1);
            this._host?.setOutPointInternal(duration);
          }

          // Detect actual FPS and frame count from video
          if (node.isUsingMediabunny()) {
            this.detectVideoFpsAndDuration(source, node);
          }

          this._host?.emitSourceLoaded(source);
          this._host?.emitDurationChanged(duration);
        } else if (url) {
          log.debug(`Loading video source "${node.name}" from URL (no mediabunny): ${url}`);

          await node.load(url, node.name, fps);

          const metadata = node.getMetadata();
          const duration = metadata.duration;

          // Create HTMLVideoElement
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = this._host?.getMuted() ?? false;
          video.volume = this._host?.getEffectiveVolume() ?? 1;
          video.loop = false;
          video.playsInline = true;
          this._host?.initVideoPreservesPitch(video);

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
            fps,
            element: video,
            videoSourceNode: node,
          };

          this.addSource(source);

          // Update session duration
          const outPoint = this._host?.getOutPoint() ?? 0;
          if (outPoint === 0 || outPoint < duration) {
            this._host?.setInPointInternal(1);
            this._host?.setOutPointInternal(duration);
          }

          this._host?.emitSourceLoaded(source);
          this._host?.emitDurationChanged(duration);
        }
      }
    }
  }

  /**
   * Detect actual FPS and frame count from video using mediabunny
   */
  private async detectVideoFpsAndDuration(source: MediaSource, videoSourceNode: VideoSourceNode): Promise<void> {
    try {
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
        const currentFps = this._host?.getFps() ?? 24;
        if (detectedFps !== null && detectedFps !== currentFps) {
          this._host?.setFpsInternal(detectedFps);
          this._host?.emitFpsChanged(detectedFps);
        }

        const outPoint = this._host?.getOutPoint() ?? 0;
        if (actualFrameCount > 0 && actualFrameCount !== outPoint) {
          this._host?.setOutPointInternal(actualFrameCount);
          this._host?.emitDurationChanged(actualFrameCount);
          this._host?.emitInOutChanged(this._host?.getInPoint() ?? 1, actualFrameCount);
        }
      }
    } catch (err) {
      log.warn('Failed to detect video FPS/duration:', err);
    }
  }

  // ---------------------------------------------------------------
  // Sequence loading
  // ---------------------------------------------------------------

  /**
   * Load an image sequence from multiple files
   */
  async loadSequence(files: File[], fps?: number): Promise<void> {
    const currentFps = this._host?.getFps() ?? 24;
    const sequenceInfo = await createSequenceInfo(files, fps ?? currentFps);
    if (!sequenceInfo) {
      throw new Error('No valid image sequence found in the selected files');
    }

    const source: MediaSource = {
      type: 'sequence',
      name: sequenceInfo.name,
      url: '',
      width: sequenceInfo.width,
      height: sequenceInfo.height,
      duration: sequenceInfo.frames.length,
      fps: sequenceInfo.fps,
      sequenceInfo,
      sequenceFrames: sequenceInfo.frames,
      element: sequenceInfo.frames[0]?.image,
    };

    this.addSource(source);
    // Use the public fps setter path through the host isn't available here,
    // but we need to update fps. We'll use setFpsInternal + emit.
    this._host?.setFpsInternal(sequenceInfo.fps);
    this._host?.emitFpsChanged(sequenceInfo.fps);
    this._host?.setInPointInternal(1);
    this._host?.setOutPointInternal(sequenceInfo.frames.length);
    this._host?.setCurrentFrameInternal(1);

    this._host?.emitSourceLoaded(source);
    this._host?.emitDurationChanged(sequenceInfo.frames.length);

    // Preload adjacent frames
    preloadFrames(sequenceInfo.frames, 0, 10);
  }

  // ---------------------------------------------------------------
  // Frame fetching and cache
  // ---------------------------------------------------------------

  /**
   * Get the current frame image for a sequence
   */
  async getSequenceFrameImage(frameIndex?: number): Promise<HTMLImageElement | null> {
    const source = this.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames) {
      return null;
    }

    const currentFrame = this._host?.getCurrentFrame() ?? 1;
    const idx = (frameIndex ?? currentFrame) - 1;
    const frame = source.sequenceFrames[idx];
    if (!frame) return null;

    const image = await loadFrameImage(frame);

    preloadFrames(source.sequenceFrames, idx, 5);
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

    const currentFrame = this._host?.getCurrentFrame() ?? 1;
    const idx = (frameIndex ?? currentFrame) - 1;
    const frame = source.sequenceFrames[idx];
    return frame?.image ?? null;
  }

  /**
   * Get video frame canvas from mediabunny (for direct rendering)
   */
  getVideoFrameCanvas(frameIndex?: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }

    const currentFrame = this._host?.getCurrentFrame() ?? 1;
    const frame = frameIndex ?? currentFrame;
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

    const currentFrame = this._host?.getCurrentFrame() ?? 1;
    const frame = frameIndex ?? currentFrame;
    return source.videoSourceNode.hasFrameCached(frame);
  }

  /**
   * Check if current source is using mediabunny for frame extraction
   */
  isUsingMediabunny(): boolean {
    return this.isSourceUsingMediabunny(this.currentSource);
  }

  /**
   * Check if a specific source is using mediabunny for frame extraction
   */
  isSourceUsingMediabunny(source: MediaSource | null): boolean {
    return source?.type === 'video' && source.videoSourceNode?.isUsingMediabunny() === true;
  }

  /**
   * Get video frame canvas for a specific source
   */
  getFrameCanvasForSource(
    source: MediaSource | null,
    frameIndex?: number
  ): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return null;
    }

    const currentFrame = this._host?.getCurrentFrame() ?? 1;
    const frame = frameIndex ?? currentFrame;
    return source.videoSourceNode.getCachedFrameCanvas(frame);
  }

  /**
   * Fetch a specific frame for a source (async)
   */
  async fetchFrameForSource(source: MediaSource | null, frameIndex: number): Promise<void> {
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    await source.videoSourceNode.getFrameAsync(frameIndex);
  }

  /**
   * Preload video frames around the current position
   */
  preloadVideoFrames(centerFrame?: number): void {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    const currentFrame = this._host?.getCurrentFrame() ?? 1;
    const frame = centerFrame ?? currentFrame;
    source.videoSourceNode.preloadFrames(frame).catch(err => {
      log.warn('Video frame preload error:', err);
    });
  }

  /**
   * Fetch the current video frame using mediabunny
   */
  async fetchCurrentVideoFrame(frameIndex?: number): Promise<void> {
    const source = this.currentSource;
    if (source?.type !== 'video' || !source.videoSourceNode?.isUsingMediabunny()) {
      return;
    }

    const currentFrame = this._host?.getCurrentFrame() ?? 1;
    const frame = frameIndex ?? currentFrame;

    if (source.videoSourceNode.hasFrameCached(frame)) {
      return;
    }

    await source.videoSourceNode.getFrameAsync(frame);
  }

  /**
   * Get the set of cached frame numbers
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

  // ---------------------------------------------------------------
  // Disposal
  // ---------------------------------------------------------------

  /**
   * Cleanup sequence resources
   */
  disposeSequenceSource(source: MediaSource): void {
    if (source.type === 'sequence' && source.sequenceFrames) {
      disposeSequence(source.sequenceFrames);
    }
  }

  /**
   * Cleanup video source resources
   */
  disposeVideoSource(source: MediaSource): void {
    if (source.type === 'video' && source.videoSourceNode) {
      source.videoSourceNode.dispose();
    }
  }

  /**
   * Dispose all media resources
   */
  dispose(): void {
    for (const source of this._sources) {
      this.disposeSequenceSource(source);
      this.disposeVideoSource(source);
    }
    this._sources = [];
  }
}
