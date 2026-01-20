/**
 * VideoSourceNode - Source node for video files
 *
 * Loads video files and provides frame-by-frame access.
 * Uses mediabunny for frame-accurate extraction when available,
 * falling back to HTMLVideoElement for unsupported codecs.
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';
import {
  MediabunnyFrameExtractor,
  type FrameResult,
} from '../../utils/MediabunnyFrameExtractor';
import { FramePreloadManager, type PreloadConfig } from '../../utils/FramePreloadManager';

/** Frame extraction mode */
export type FrameExtractionMode = 'mediabunny' | 'html-video' | 'auto';

@RegisterNode('RVVideoSource')
export class VideoSourceNode extends BaseSourceNode {
  private video: HTMLVideoElement | null = null;
  private url: string = '';
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private file: File | null = null;

  // Mediabunny frame extractor for accurate frame extraction
  private frameExtractor: MediabunnyFrameExtractor | null = null;
  private useMediabunny: boolean = false;
  private extractionMode: FrameExtractionMode = 'auto';

  // Frame preload manager for intelligent caching and preloading
  private preloadManager: FramePreloadManager<FrameResult> | null = null;
  private pendingFrameRequest: Promise<FrameResult | null> | null = null;

  // Playback state
  private playbackDirection: number = 1;
  private isPlaybackActive: boolean = false;

  constructor(name?: string) {
    super('RVVideoSource', name ?? 'Video Source');

    // Properties
    this.properties.add({ name: 'url', defaultValue: '' });
    this.properties.add({ name: 'duration', defaultValue: 0 });
    this.properties.add({ name: 'fps', defaultValue: 24 });
    this.properties.add({ name: 'useMediabunny', defaultValue: false });
    this.properties.add({ name: 'codec', defaultValue: '' });
    this.properties.add({ name: 'file', defaultValue: null }); // File object for mediabunny loading

    // Create offscreen canvas for frame extraction
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Set frame extraction mode
   */
  setExtractionMode(mode: FrameExtractionMode): void {
    this.extractionMode = mode;
  }

  /**
   * Get current extraction mode
   */
  getExtractionMode(): FrameExtractionMode {
    return this.extractionMode;
  }

  /**
   * Check if using mediabunny for extraction
   */
  isUsingMediabunny(): boolean {
    return this.useMediabunny;
  }

  /**
   * Load video from URL
   */
  async load(url: string, name?: string, fps: number = 24): Promise<void> {
    // Always load HTMLVideoElement as fallback and for playback
    await this.loadHtmlVideo(url, name, fps);

    // Try to initialize mediabunny if mode allows
    if (this.extractionMode !== 'html-video' && this.file) {
      await this.tryInitMediabunny(this.file, fps);
    }
  }

  /**
   * Load HTMLVideoElement (always needed for playback)
   */
  private async loadHtmlVideo(
    url: string,
    name?: string,
    fps: number = 24
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;

      video.oncanplay = () => {
        video.oncanplay = null;

        this.video = video;
        this.url = url;

        const duration = Math.ceil(video.duration * fps);

        this.metadata = {
          name: name ?? url.split('/').pop() ?? 'video',
          width: video.videoWidth,
          height: video.videoHeight,
          duration,
          fps,
        };

        this.canvas.width = video.videoWidth;
        this.canvas.height = video.videoHeight;

        this.properties.setValue('url', url);
        this.properties.setValue('duration', duration);
        this.properties.setValue('fps', fps);

        this.markDirty();
        resolve();
      };

      video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
      video.src = url;
      video.load();
    });
  }

  /**
   * Try to initialize mediabunny frame extractor
   */
  private async tryInitMediabunny(file: File | Blob, fps: number): Promise<boolean> {
    // Check if WebCodecs is supported
    if (!MediabunnyFrameExtractor.isSupported()) {
      this.useMediabunny = false;
      this.properties.setValue('useMediabunny', false);
      return false;
    }

    try {
      this.frameExtractor = new MediabunnyFrameExtractor();
      const metadata = await this.frameExtractor.load(file, fps);

      this.useMediabunny = true;
      this.properties.setValue('useMediabunny', true);
      this.properties.setValue('codec', metadata.codec ?? 'unknown');

      // Update duration from mediabunny (more accurate)
      this.metadata.duration = metadata.frameCount;
      this.properties.setValue('duration', metadata.frameCount);

      // Initialize preload manager with optimized config for video playback
      this.initPreloadManager(metadata.frameCount);

      return true;
    } catch (error) {
      console.warn(
        'Mediabunny initialization failed, using HTML video fallback:',
        error
      );
      this.frameExtractor?.dispose();
      this.frameExtractor = null;
      this.preloadManager?.dispose();
      this.preloadManager = null;
      this.useMediabunny = false;
      this.properties.setValue('useMediabunny', false);
      return false;
    }
  }

  /**
   * Initialize the frame preload manager
   */
  private initPreloadManager(totalFrames: number, config?: Partial<PreloadConfig>): void {
    // Dispose existing manager if any
    this.preloadManager?.dispose();

    // Create loader function that uses frameExtractor
    const loader = async (frame: number): Promise<FrameResult> => {
      if (!this.frameExtractor) {
        throw new Error('Frame extractor not available');
      }
      const result = await this.frameExtractor.getFrame(frame);
      if (!result) {
        throw new Error(`Failed to extract frame ${frame}`);
      }
      return result;
    };

    // Default config optimized for video playback
    const defaultConfig: Partial<PreloadConfig> = {
      maxCacheSize: 60,
      preloadAhead: 15,
      preloadBehind: 5,
      scrubWindow: 10,
      maxConcurrent: 4,
      ...config,
    };

    this.preloadManager = new FramePreloadManager<FrameResult>(
      totalFrames,
      loader,
      undefined, // No special disposer needed for FrameResult
      defaultConfig
    );
  }

  /**
   * Load from File object
   */
  async loadFile(file: File, fps: number = 24): Promise<void> {
    this.file = file;
    const url = URL.createObjectURL(file);

    // Load HTML video first
    await this.loadHtmlVideo(url, file.name, fps);

    // Try mediabunny initialization
    if (this.extractionMode !== 'html-video') {
      await this.tryInitMediabunny(file, fps);
    }
  }

  /**
   * Set fps (recalculates duration)
   */
  setFps(fps: number): void {
    this.properties.setValue('fps', fps);
    if (this.video) {
      this.metadata.fps = fps;
      this.metadata.duration = Math.ceil(this.video.duration * fps);
      this.properties.setValue('duration', this.metadata.duration);
    }

    // Update mediabunny extractor if active
    if (this.frameExtractor && this.file) {
      // Reinitialize with new fps
      this.tryInitMediabunny(this.file, fps);
    }
  }

  isReady(): boolean {
    if (this.useMediabunny && this.frameExtractor) {
      return this.frameExtractor.isReady();
    }
    return this.video !== null && this.video.readyState >= 2;
  }

  /**
   * Get detected FPS from mediabunny (builds frame index if needed)
   * Returns null if not using mediabunny or FPS couldn't be detected
   */
  async getDetectedFps(): Promise<number | null> {
    if (!this.frameExtractor || !this.useMediabunny) {
      return null;
    }
    const fps = await this.frameExtractor.getDetectedFps();

    // Update metadata if FPS was detected
    if (fps !== null) {
      this.metadata.fps = fps;
      this.properties.setValue('fps', fps);
    }

    return fps;
  }

  /**
   * Get actual frame count from mediabunny (builds frame index if needed)
   * Returns metadata duration if not using mediabunny
   */
  async getActualFrameCount(): Promise<number> {
    if (!this.frameExtractor || !this.useMediabunny) {
      return this.metadata.duration;
    }
    const count = await this.frameExtractor.getActualFrameCount();

    // Update metadata with actual count
    this.metadata.duration = count;
    this.properties.setValue('duration', count);

    return count;
  }

  getElement(_frame: number): HTMLVideoElement | null {
    return this.video;
  }

  /**
   * Seek video to frame (for playback)
   */
  async seekToFrame(frame: number): Promise<void> {
    if (!this.video) return;

    const time = (frame - 1) / this.metadata.fps;
    if (Math.abs(this.video.currentTime - time) > 0.01) {
      this.video.currentTime = time;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          this.video!.removeEventListener('seeked', onSeeked);
          resolve();
        };
        this.video!.addEventListener('seeked', onSeeked);
      });
    }
  }

  /**
   * Get frame using mediabunny (async, accurate)
   * Uses FramePreloadManager for intelligent caching and request coalescing
   */
  async getFrameAsync(frame: number): Promise<FrameResult | null> {
    if (!this.frameExtractor || !this.useMediabunny || !this.preloadManager) {
      return null;
    }

    return this.preloadManager.getFrame(frame);
  }

  /**
   * Set playback direction for optimized preloading
   * @param direction 1 for forward, -1 for reverse
   */
  setPlaybackDirection(direction: number): void {
    this.playbackDirection = direction >= 0 ? 1 : -1;
    // Update manager direction if playback is active
    if (this.isPlaybackActive && this.preloadManager) {
      this.preloadManager.setPlaybackState(true, this.playbackDirection);
    }
  }

  /**
   * Get current playback direction
   */
  getPlaybackDirection(): number {
    return this.playbackDirection;
  }

  /**
   * Set playback active state
   * When active, preloading prioritizes frames ahead in playback direction
   * When inactive (scrubbing), preloading uses symmetric window
   */
  setPlaybackActive(isActive: boolean): void {
    this.isPlaybackActive = isActive;
    this.preloadManager?.setPlaybackState(isActive, this.playbackDirection);
  }

  /**
   * Check if playback mode is active
   */
  isPlaybackModeActive(): boolean {
    return this.isPlaybackActive;
  }

  /**
   * Check if a frame is cached and ready for immediate playback
   */
  hasFrameCached(frame: number): boolean {
    return this.preloadManager?.hasFrame(frame) ?? false;
  }

  /**
   * Get cached frame canvas directly for rendering (no IPImage conversion)
   * Returns null if frame is not cached
   */
  getCachedFrameCanvas(frame: number): HTMLCanvasElement | OffscreenCanvas | null {
    const cached = this.preloadManager?.getCachedFrame(frame);
    return cached?.canvas ?? null;
  }

  /**
   * Get the set of cached frame numbers
   */
  getCachedFrames(): Set<number> {
    return this.preloadManager?.getCachedFrames() ?? new Set();
  }

  /**
   * Get the set of pending (loading) frame numbers
   */
  getPendingFrames(): Set<number> {
    return this.preloadManager?.getPendingFrames() ?? new Set();
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
    if (!this.preloadManager) return null;
    const stats = this.preloadManager.getStats();
    return {
      cachedCount: stats.cacheSize,
      pendingCount: stats.pendingRequests,
      totalFrames: this.preloadManager.getTotalFrames(),
      maxCacheSize: this.preloadManager.getMaxCacheSize(),
    };
  }

  /**
   * Clear the frame cache
   */
  clearCache(): void {
    this.preloadManager?.clear();
  }

  /**
   * Preload frames around the current frame
   * Uses FramePreloadManager for intelligent priority-based preloading
   * Respects current playback state (playback vs scrub mode)
   */
  async preloadFrames(centerFrame: number): Promise<void> {
    if (!this.frameExtractor || !this.useMediabunny || !this.preloadManager) {
      return;
    }

    // Preload using current playback state (manager already knows the state)
    this.preloadManager.preloadAround(centerFrame);
  }

  /**
   * Direction-aware preloading for smooth playback
   * Uses FramePreloadManager with playback mode for optimized ahead/behind preloading
   */
  async preloadForPlayback(currentFrame: number, direction: number = 1): Promise<void> {
    if (!this.frameExtractor || !this.useMediabunny || !this.preloadManager) {
      return;
    }

    this.playbackDirection = direction >= 0 ? 1 : -1;
    this.isPlaybackActive = true;

    // Set playback mode for direction-aware preloading (more frames ahead)
    this.preloadManager.setPlaybackState(true, this.playbackDirection);
    this.preloadManager.preloadAround(currentFrame);
  }

  /**
   * Start background preloading for playback
   * Call this when playback starts
   */
  startPlaybackPreload(startFrame: number, direction: number = 1): void {
    if (!this.useMediabunny || !this.preloadManager) return;

    this.playbackDirection = direction >= 0 ? 1 : -1;
    this.isPlaybackActive = true;

    // Set playback mode and trigger preloading
    this.preloadManager.setPlaybackState(true, this.playbackDirection);
    this.preloadManager.preloadAround(startFrame);
  }

  /**
   * Stop playback preloading mode
   * Call this when playback stops to switch back to scrub mode
   */
  stopPlaybackPreload(): void {
    this.isPlaybackActive = false;
    this.preloadManager?.setPlaybackState(false, this.playbackDirection);
  }

  /**
   * Update preload buffer during playback
   * Call this periodically during playback to maintain buffer
   * FramePreloadManager handles buffer management internally
   */
  updatePlaybackBuffer(currentFrame: number): void {
    if (!this.useMediabunny || !this.preloadManager) return;

    // FramePreloadManager handles:
    // - Checking if more frames are needed
    // - Priority-based preloading
    // - Evicting distant frames
    // - Request coalescing
    this.preloadManager.preloadAround(currentFrame);
  }

  /**
   * Clear frame cache
   */
  clearFrameCache(): void {
    this.preloadManager?.clear();
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    // If using mediabunny, try to get from cache first
    if (this.useMediabunny && this.frameExtractor && this.preloadManager) {
      const cached = this.preloadManager.getCachedFrame(context.frame);
      if (cached) {
        return this.frameResultToIPImage(cached, context.frame);
      }

      // Start async frame request for next time
      if (!this.pendingFrameRequest) {
        this.pendingFrameRequest = this.getFrameAsync(context.frame).then((result) => {
          this.pendingFrameRequest = null;
          return result;
        });
      }
    }

    // Fallback to HTML video extraction
    return this.processHtmlVideo(context);
  }

  /**
   * Process frame using HTML video element
   */
  private processHtmlVideo(context: EvalContext): IPImage | null {
    if (!this.video || !this.video.readyState || this.video.readyState < 2) {
      return null;
    }

    // Seek to frame if needed
    const time = (context.frame - 1) / this.metadata.fps;
    if (Math.abs(this.video.currentTime - time) > 0.01) {
      this.video.currentTime = time;
    }

    // Draw current video frame to canvas
    this.ctx.drawImage(this.video, 0, 0);
    const imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );

    const ipImage = new IPImage({
      width: imageData.width,
      height: imageData.height,
      channels: 4,
      dataType: 'uint8',
      data: imageData.data.buffer.slice(0),
      metadata: {
        sourcePath: this.url,
        frameNumber: context.frame,
      },
    });

    return ipImage;
  }

  /**
   * Convert FrameResult to IPImage
   */
  private frameResultToIPImage(result: FrameResult, frame: number): IPImage {
    const canvas = result.canvas;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

    if (canvas instanceof HTMLCanvasElement) {
      ctx = canvas.getContext('2d');
    } else {
      ctx = canvas.getContext('2d');
    }

    if (!ctx) {
      throw new Error('Failed to get 2D context from frame canvas');
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return new IPImage({
      width: imageData.width,
      height: imageData.height,
      channels: 4,
      dataType: 'uint8',
      data: imageData.data.buffer.slice(0),
      metadata: {
        sourcePath: this.url,
        frameNumber: frame,
        attributes: {
          timestamp: result.timestamp,
        },
      },
    });
  }

  /**
   * Get frame as IPImage (async, uses mediabunny when available)
   */
  async getFrameIPImage(frame: number): Promise<IPImage | null> {
    if (this.useMediabunny && this.frameExtractor) {
      const result = await this.getFrameAsync(frame);
      if (result) {
        return this.frameResultToIPImage(result, frame);
      }
    }

    // Fallback to HTML video
    await this.seekToFrame(frame);
    return this.processHtmlVideo({
      frame,
      width: this.metadata.width,
      height: this.metadata.height,
      quality: 'full',
    });
  }

  /**
   * Generate thumbnails using mediabunny
   */
  async *generateThumbnails(
    count: number = 10,
    maxSize: number = 128
  ): AsyncGenerator<HTMLCanvasElement, void, unknown> {
    if (this.frameExtractor && this.useMediabunny) {
      yield* this.frameExtractor.generateThumbnails(count, maxSize);
    } else {
      // Fallback: generate thumbnails using HTML video
      const frameInterval = Math.floor(this.metadata.duration / count);
      for (let i = 0; i < count; i++) {
        const frame = Math.max(1, i * frameInterval + 1);
        await this.seekToFrame(frame);

        // Create thumbnail
        const thumbCanvas = document.createElement('canvas');
        const { width, height } = this.video!;
        let thumbWidth: number;
        let thumbHeight: number;
        if (width > height) {
          thumbWidth = maxSize;
          thumbHeight = Math.round((height / width) * maxSize);
        } else {
          thumbHeight = maxSize;
          thumbWidth = Math.round((width / height) * maxSize);
        }
        thumbCanvas.width = thumbWidth;
        thumbCanvas.height = thumbHeight;
        const ctx = thumbCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(this.video!, 0, 0, thumbWidth, thumbHeight);
          yield thumbCanvas;
        }
      }
    }
  }

  override dispose(): void {
    // Dispose preload manager
    if (this.preloadManager) {
      this.preloadManager.dispose();
      this.preloadManager = null;
    }

    // Dispose mediabunny extractor
    if (this.frameExtractor) {
      this.frameExtractor.dispose();
      this.frameExtractor = null;
    }

    // Clean up video element
    if (this.video) {
      this.video.pause();
      this.video.src = '';
    }
    if (this.url.startsWith('blob:')) {
      URL.revokeObjectURL(this.url);
    }
    this.video = null;
    this.file = null;
    super.dispose();
  }

  toJSON(): object {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      url: this.url,
      metadata: this.metadata,
      properties: this.properties.toJSON(),
      useMediabunny: this.useMediabunny,
    };
  }
}
