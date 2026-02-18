/**
 * VideoSourceNode - Source node for video files
 *
 * Loads video files and provides frame-by-frame access.
 * Uses mediabunny for frame-accurate extraction when available,
 * falling back to HTMLVideoElement for unsupported codecs.
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage, type TransferFunction, type ColorPrimaries } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';
import {
  MediabunnyFrameExtractor,
  UnsupportedCodecException,
  type FrameResult,
} from '../../utils/media/MediabunnyFrameExtractor';
import { FramePreloadManager, type PreloadConfig } from '../../utils/media/FramePreloadManager';
import type { CodecFamily, UnsupportedCodecError } from '../../utils/media/CodecUtils';
import { HDRFrameResizer, type HDRResizeTier } from '../../utils/media/HDRFrameResizer';
import { LRUCache } from '../../utils/LRUCache';
import { PerfTrace } from '../../utils/PerfTrace';

/** Frame extraction mode */
export type FrameExtractionMode = 'mediabunny' | 'html-video' | 'auto';

/**
 * Result of loading a video file
 */
export interface VideoLoadResult {
  success: boolean;
  useMediabunny: boolean;
  codec?: string | null;
  codecFamily?: CodecFamily;
  unsupportedCodecError?: UnsupportedCodecError;
}

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

  // 500 MB memory budget for HDR frame cache (RGBA16F = 8 bytes/pixel)
  private static readonly HDR_MEMORY_BUDGET_BYTES = 500 * 1024 * 1024;

  // Minimum HDR cache capacity: must hold the full preload window (ahead + behind + current frame).
  // updatePlaybackBuffer() uses ahead=8, behind=2, so minimum = 8 + 2 + 1 = 11.
  private static readonly HDR_MIN_CACHE_FRAMES = 11;

  // LRU cache of resized HDR IPImages for synchronous access by Viewer's render loop.
  // Size is updated dynamically via updateHDRCacheSize() based on frame dimensions.
  private hdrFrameCache = new LRUCache<number, IPImage>(
    8, // safe initial default; updated dynamically once dimensions are known
    (_key, image) => image.close(), // close VideoFrame on eviction
  );

  // HDR frame resizer (OffscreenCanvas with float16 backing store)
  private hdrResizer: HDRFrameResizer | null = null;

  // Track in-flight HDR frame fetches to prevent duplicate requests
  private pendingHDRFetches = new Map<number, Promise<IPImage | null>>();

  // Stable display-resolution target for HDR resize (not interaction-quality-reduced).
  // Set by Viewer using actual display dimensions so cached HDR frames are always
  // at full display quality, unlike SDR frames which use reduced quality during interaction.
  private hdrTargetSize: { w: number; h: number } | undefined;

  // HDR state
  private isHDRVideo: boolean = false;
  private videoColorSpace: VideoColorSpaceInit | null = null;
  // Pre-detected HDR canvas resize tier (from DisplayCapabilities.canvasHDRResizeTier).
  // Stored so setFps() can re-pass it when reinitializing mediabunny.
  private _hdrResizeTier: HDRResizeTier = 'none';

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
   * @param hdrResizeTier - Pre-detected HDR canvas resize tier from DisplayCapabilities
   */
  async load(url: string, name?: string, fps: number = 24, hdrResizeTier: HDRResizeTier = 'none'): Promise<void> {
    this._hdrResizeTier = hdrResizeTier;

    // Always load HTMLVideoElement as fallback and for playback
    await this.loadHtmlVideo(url, name, fps);

    // Try to initialize mediabunny if mode allows
    if (this.extractionMode !== 'html-video' && this.file) {
      await this.tryInitMediabunny(this.file, fps, hdrResizeTier);
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
   * Returns VideoLoadResult with codec information
   * @param hdrResizeTier - Pre-detected HDR canvas resize tier from DisplayCapabilities
   */
  private async tryInitMediabunny(file: File | Blob, fps: number, hdrResizeTier: HDRResizeTier = 'none'): Promise<VideoLoadResult> {
    // Check if WebCodecs is supported
    if (!MediabunnyFrameExtractor.isSupported()) {
      this.useMediabunny = false;
      this.properties.setValue('useMediabunny', false);
      return {
        success: true, // HTML video fallback is available
        useMediabunny: false,
        codec: null,
      };
    }

    try {
      this.frameExtractor = new MediabunnyFrameExtractor();
      const metadata = await this.frameExtractor.load(file, fps);

      this.useMediabunny = true;
      this.properties.setValue('useMediabunny', true);
      this.properties.setValue('codec', metadata.codec ?? 'unknown');

      // Propagate HDR metadata
      this.isHDRVideo = metadata.isHDR;
      this.videoColorSpace = metadata.colorSpace;
      // Update duration from mediabunny (more accurate)
      this.metadata.duration = metadata.frameCount;
      this.properties.setValue('duration', metadata.frameCount);

      // Initialize HDR frame resizer if HDR content detected and canvas resize available
      if (metadata.isHDR) {
        this.initHDRResizer(hdrResizeTier);
      }

      // Initialize SDR preload manager only for non-HDR video.
      // HDR video uses its own LRU cache + preloadHDRFrames() for preloading.
      if (!metadata.isHDR) {
        this.initPreloadManager(metadata.frameCount);
      }

      return {
        success: true,
        useMediabunny: true,
        codec: metadata.codec,
        codecFamily: metadata.codecFamily,
      };
    } catch (error) {
      // Check if this is an unsupported codec error
      if (error instanceof UnsupportedCodecException) {
        console.warn(
          `Unsupported professional codec detected: ${error.codecError.codecInfo.displayName}`,
          error.codecError.message
        );
        this.lastUnsupportedCodecError = error.codecError;
        this.frameExtractor?.dispose();
        this.frameExtractor = null;
        this.useMediabunny = false;
        this.properties.setValue('useMediabunny', false);
        this.properties.setValue('codec', error.codec ?? 'unknown');

        return {
          success: false,
          useMediabunny: false,
          codec: error.codec,
          codecFamily: error.codecFamily,
          unsupportedCodecError: error.codecError,
        };
      }

      // Generic error - try fallback
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

      return {
        success: true, // HTML video fallback may work
        useMediabunny: false,
        codec: null,
      };
    }
  }

  /**
   * Initialize HDR frame resizer using the pre-detected canvas HDR resize tier.
   * The tier comes from DisplayCapabilities.canvasHDRResizeTier, which is probed
   * once at startup. This avoids duplicating the OffscreenCanvas float16 detection.
   */
  private initHDRResizer(tier: HDRResizeTier): void {
    if (tier !== 'none') {
      this.hdrResizer = new HDRFrameResizer(tier);
    }

    // Update HDR cache size now that metadata is available
    this.updateHDRCacheSize();
  }

  /**
   * Update HDR frame cache capacity based on frame dimensions and a fixed memory budget.
   * Called when HDR target size or metadata changes.
   */
  private updateHDRCacheSize(): void {
    const w = this.hdrTargetSize?.w ?? this.metadata.width;
    const h = this.hdrTargetSize?.h ?? this.metadata.height;
    const bytesPerFrame = w * h * 8; // RGBA16F = 8 bytes/pixel
    if (bytesPerFrame <= 0) return;
    const maxFrames = Math.max(VideoSourceNode.HDR_MIN_CACHE_FRAMES, Math.min(
      this.metadata.duration, // never more than total frames
      Math.floor(VideoSourceNode.HDR_MEMORY_BUDGET_BYTES / bytesPerFrame)
    ));
    this.hdrFrameCache.setCapacity(maxFrames);
  }

  /**
   * Initialize the frame preload manager
   */
  private initPreloadManager(totalFrames: number, config?: Partial<PreloadConfig>): void {
    // Dispose existing manager if any
    this.preloadManager?.dispose();

    // Create loader function that uses frameExtractor
    // Accepts optional AbortSignal for cancellation support
    // Returns null on failure instead of throwing to avoid breaking the app
    // Reads currentTargetSize from preloadManager at call time for resolution-aware extraction
    const loader = async (frame: number, signal?: AbortSignal): Promise<FrameResult | null> => {
      if (!this.frameExtractor) {
        return null;
      }

      // Check if aborted before attempting extraction
      if (signal?.aborted) {
        return null;
      }

      try {
        const targetSize = this.preloadManager?.getTargetSize();
        const result = await this.frameExtractor.getFrame(frame, signal, targetSize);
        return result;
      } catch (error) {
        // Log error for debugging but don't break the app
        if (!signal?.aborted) {
          console.warn(`Frame ${frame} extraction failed:`, error);
        }
        return null;
      }
    };

    // Disposer: close ImageBitmap when evicted from cache to release GPU memory.
    // The ImageBitmap is the primary pixel data container returned by snapshotCanvas().
    const disposer = (_frame: number, result: FrameResult): void => {
      if (result.canvas && 'close' in result.canvas && typeof result.canvas.close === 'function') {
        result.canvas.close();
      }
    };

    this.preloadManager = new FramePreloadManager<FrameResult>(
      totalFrames,
      loader,
      disposer,
      config // FramePreloadManager applies DEFAULT_PRELOAD_CONFIG internally
    );
  }

  // Store last unsupported codec error for retrieval
  private lastUnsupportedCodecError: UnsupportedCodecError | null = null;

  /**
   * Load from File object
   * Returns VideoLoadResult with information about codec support
   * @param hdrResizeTier - Pre-detected HDR canvas resize tier from DisplayCapabilities
   */
  async loadFile(file: File, fps: number = 24, hdrResizeTier: HDRResizeTier = 'none'): Promise<VideoLoadResult> {
    this._hdrResizeTier = hdrResizeTier;
    this.file = file;
    this.lastUnsupportedCodecError = null;
    const url = URL.createObjectURL(file);

    // Load HTML video first
    await this.loadHtmlVideo(url, file.name, fps);

    // Try mediabunny initialization
    if (this.extractionMode !== 'html-video') {
      const result = await this.tryInitMediabunny(file, fps, hdrResizeTier);
      return result;
    }

    return {
      success: true,
      useMediabunny: false,
      codec: null,
    };
  }

  /**
   * Get last unsupported codec error (if any)
   */
  getUnsupportedCodecError(): UnsupportedCodecError | null {
    return this.lastUnsupportedCodecError;
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
      this.tryInitMediabunny(this.file, fps, this._hdrResizeTier);
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

    // Update preload manager so it doesn't try to load ghost frames
    if (this.preloadManager) {
      this.preloadManager.setTotalFrames(count);
    }

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
   * @param frame - Frame number (1-based)
   * @param targetSize - Optional target resolution for resized extraction
   */
  async getFrameAsync(frame: number, targetSize?: { w: number; h: number }): Promise<FrameResult | null> {
    if (!this.frameExtractor || !this.useMediabunny) {
      return null;
    }

    // HDR video: delegate to HDR fetch (used by PlaybackEngine for starvation recovery)
    if (this.isHDRVideo) {
      await this.fetchHDRFrame(frame);
      return null; // Caller doesn't use the result for HDR; frame is in hdrFrameCache
    }

    if (!this.preloadManager) return null;
    return this.preloadManager.getFrame(frame, targetSize);
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
    if (this.isHDRVideo) {
      return this.hdrFrameCache.has(frame);
    }
    return this.preloadManager?.hasFrame(frame) ?? false;
  }

  /**
   * Get cached frame canvas directly for rendering (no IPImage conversion)
   * Returns null if frame is not cached
   */
  getCachedFrameCanvas(frame: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
    const cached = this.preloadManager?.getCachedFrame(frame);
    return cached?.canvas ?? null;
  }

  /**
   * Get the set of cached frame numbers
   */
  getCachedFrames(): Set<number> {
    if (this.isHDRVideo) {
      return this.hdrFrameCache.keys();
    }
    return this.preloadManager?.getCachedFrames() ?? new Set();
  }

  /**
   * Get the set of pending (loading) frame numbers
   */
  getPendingFrames(): Set<number> {
    if (this.isHDRVideo) {
      return new Set(this.pendingHDRFetches.keys());
    }
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
    memorySizeMB?: number;
  } | null {
    if (this.isHDRVideo) {
      // HDR frames are RGBA16F (8 bytes/pixel) at resized display dimensions
      const hdrW = this.hdrTargetSize?.w ?? this.metadata.width;
      const hdrH = this.hdrTargetSize?.h ?? this.metadata.height;
      const bytesPerFrame = hdrW * hdrH * 8; // RGBA16F = 8 bytes/pixel
      return {
        cachedCount: this.hdrFrameCache.size,
        pendingCount: this.pendingHDRFetches.size,
        totalFrames: this.metadata.duration,
        maxCacheSize: this.hdrFrameCache.capacity,
        memorySizeMB: (bytesPerFrame * this.hdrFrameCache.size) / (1024 * 1024),
      };
    }
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
   * Set the target resolution for frame extraction.
   * Frames already cached at a lower resolution will be returned immediately
   * (stale) but upgraded asynchronously on next access.
   * Pass undefined to extract at full source resolution.
   */
  setTargetSize(targetSize?: { w: number; h: number }): void {
    this.preloadManager?.setTargetSize(targetSize);
  }

  /**
   * Set the HDR resize target to stable display dimensions.
   * Unlike setTargetSize (which may use interaction-quality-reduced sizes for SDR),
   * this uses the actual display resolution so HDR frames in the LRU cache
   * are always at full display quality.
   */
  setHDRTargetSize(targetSize?: { w: number; h: number }): void {
    // Skip recalculation when dimensions haven't changed (called every render frame)
    if (this.hdrTargetSize?.w === targetSize?.w && this.hdrTargetSize?.h === targetSize?.h) return;
    this.hdrTargetSize = targetSize;
    if (this.isHDRVideo) {
      this.updateHDRCacheSize();
    }
  }

  /**
   * Get the current target resolution for frame extraction.
   */
  getTargetSize(): { w: number; h: number } | undefined {
    return this.preloadManager?.getTargetSize();
  }

  /**
   * Clear the frame cache
   */
  clearCache(): void {
    this.preloadManager?.clear();
    this.hdrFrameCache.clear();
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
   *
   * Note: setPlaybackState(false) will abort pending operations in
   * FramePreloadManager, which propagates to frameExtractor via the
   * loader's abort signal. We don't call frameExtractor.abortPendingOperations()
   * directly to avoid double-abort issues and queue state inconsistencies.
   */
  stopPlaybackPreload(): void {
    this.isPlaybackActive = false;
    // setPlaybackState will abort pending operations in FramePreloadManager
    // The abort signal is passed to the loader which calls frameExtractor.getFrame()
    this.preloadManager?.setPlaybackState(false, this.playbackDirection);
  }

  /**
   * Update preload buffer during playback
   * Call this periodically during playback to maintain buffer
   * FramePreloadManager handles buffer management internally
   */
  updatePlaybackBuffer(currentFrame: number): void {
    if (!this.useMediabunny) return;

    if (this.isHDRVideo) {
      // HDR: preload via HDR LRU cache with direction-aware window.
      // Clamp to cache capacity so preloading never evicts the current frame.
      const maxWindow = Math.max(0, this.hdrFrameCache.capacity - 1);
      const rawAhead = this.playbackDirection >= 0 ? 8 : 2;
      const rawBehind = this.playbackDirection >= 0 ? 2 : 8;
      const ahead = Math.min(rawAhead, maxWindow);
      const behind = Math.min(rawBehind, maxWindow - ahead);
      this.preloadHDRFrames(currentFrame, ahead, behind).catch(() => {});
      return;
    }

    if (!this.preloadManager) return;
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
    this.hdrFrameCache.clear();
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    if (!this.useMediabunny || !this.frameExtractor) {
      return this.processHtmlVideo(context);
    }

    // HDR path: check cache (sync), kick off fetchHDRFrame if missing.
    // fetchHDRFrame is the single pipeline: decode → resize → cache.
    if (this.isHDRVideo) {
      const cached = this.hdrFrameCache.get(context.frame);
      if (cached) return cached;

      // Kick off async fetch (decode → resize → cache) if not already in flight
      if (!this.pendingHDRFetches.has(context.frame)) {
        this.fetchHDRFrame(context.frame).then(() => this.markDirty());
      }
      return null;
    }

    // SDR path: use preloadManager cache
    if (this.preloadManager) {
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
   * Map VideoColorSpaceInit.transfer to our TransferFunction type
   */
  private mapTransferFunction(transfer?: string): TransferFunction {
    switch (transfer) {
      case 'hlg':
      case 'arib-std-b67':
        return 'hlg';
      case 'pq':
      case 'smpte2084':
        return 'pq';
      default:
        return 'srgb';
    }
  }

  /**
   * Map VideoColorSpaceInit.primaries to our ColorPrimaries type
   */
  private mapColorPrimaries(primaries?: string): ColorPrimaries {
    switch (primaries) {
      case 'bt2020':
        return 'bt2020';
      default:
        return 'bt709';
    }
  }

  /**
   * Convert a VideoSample to an HDR IPImage with VideoFrame attached
   */
  private hdrSampleToIPImage(
    sample: { toVideoFrame(): VideoFrame },
    frame: number,
    targetSize?: { w: number; h: number },
  ): IPImage {
    let videoFrame = sample.toVideoFrame();

    const frameColorSpace = videoFrame.colorSpace ? {
      transfer: videoFrame.colorSpace.transfer ?? undefined,
      primaries: videoFrame.colorSpace.primaries ?? undefined,
      matrix: videoFrame.colorSpace.matrix ?? undefined,
      fullRange: videoFrame.colorSpace.fullRange ?? undefined,
    } : null;

    let effectiveColorSpace = this.videoColorSpace;
    const hasTrackColorInfo = !!(effectiveColorSpace?.transfer || effectiveColorSpace?.primaries);
    const hasFrameColorInfo = !!(frameColorSpace?.transfer || frameColorSpace?.primaries);
    if (!hasTrackColorInfo && hasFrameColorInfo) {
      // Some HDR streams expose transfer/primaries only after decode.
      // Persist the decoded frame metadata so subsequent frames use it.
      this.videoColorSpace = frameColorSpace;
      effectiveColorSpace = frameColorSpace;
    }

    let transferFunction = this.mapTransferFunction(effectiveColorSpace?.transfer ?? undefined);
    let colorPrimaries = this.mapColorPrimaries(effectiveColorSpace?.primaries ?? undefined);

    // Use the track's display dimensions (which account for rotation) instead of
    // the VideoFrame's raw dimensions (which are pre-rotation coded dimensions).
    let width = this.metadata.width;
    let height = this.metadata.height;
    const rotation = this.frameExtractor?.getMetadata()?.rotation ?? 0;

    // Resize via HDR OffscreenCanvas if target is smaller than source
    if (targetSize && this.hdrResizer) {
      const result = this.hdrResizer.resize(
        videoFrame,
        targetSize,
        effectiveColorSpace ?? undefined,
      );
      videoFrame = result.videoFrame;
      if (result.resized) {
        width = result.width;
        height = result.height;
      }
      if (result.metadataOverrides) {
        transferFunction = result.metadataOverrides.transferFunction;
        colorPrimaries = result.metadataOverrides.colorPrimaries;
      }
    }

    // Create IPImage with VideoFrame attached (minimal data buffer)
    // The VideoFrame is the actual pixel source; data is a placeholder
    return new IPImage({
      width,
      height,
      channels: 4,
      dataType: 'float32',
      data: new ArrayBuffer(4), // minimal placeholder; VideoFrame is the pixel source
      videoFrame,
      metadata: {
        sourcePath: this.url,
        frameNumber: frame,
        transferFunction,
        colorPrimaries,
        colorSpace: colorPrimaries === 'bt2020' ? 'rec2020' : 'rec709',
        attributes: {
          hdr: true,
          videoColorSpace: effectiveColorSpace,
          // VideoFrame pixels are unrotated; store rotation so Renderer can apply it via shader
          videoRotation: rotation,
        },
      },
    });
  }

  /**
   * Convert FrameResult to IPImage
   */
  private frameResultToIPImage(result: FrameResult, frame: number): IPImage {
    const canvas = result.canvas;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    let imageData: ImageData;

    if (canvas instanceof ImageBitmap) {
      // ImageBitmap from createImageBitmap - draw to temp canvas to extract pixels
      const tempCanvas = new OffscreenCanvas(canvas.width, canvas.height);
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(canvas, 0, 0);
      imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      if (canvas instanceof HTMLCanvasElement) {
        ctx = canvas.getContext('2d');
      } else {
        ctx = canvas.getContext('2d');
      }

      if (!ctx) {
        throw new Error('Failed to get 2D context from frame canvas');
      }

      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

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
   * Check if this video source has HDR content
   */
  isHDR(): boolean {
    return this.isHDRVideo;
  }

  /**
   * Get the video's HDR color space info
   */
  getVideoColorSpace(): VideoColorSpaceInit | null {
    return this.videoColorSpace;
  }

  /**
   * Get cached HDR IPImage for a frame (synchronous, for Viewer render loop).
   * Returns null if the frame hasn't been fetched yet.
   */
  getCachedHDRIPImage(frame: number): IPImage | null {
    // Use peek() (no LRU refresh) to avoid Map delete+re-insert on every
    // render frame. The render loop reads every frame sequentially; the
    // preload window already keeps nearby frames alive.
    return this.hdrFrameCache.peek(frame) ?? null;
  }

  /**
   * Fetch an HDR frame and cache the resulting IPImage for synchronous access.
   * Uses LRU cache — eviction automatically closes VideoFrames.
   * When HDR resize is available, frames are resized to target display resolution.
   */
  async fetchHDRFrame(frame: number): Promise<IPImage | null> {
    if (!this.isHDRVideo || !this.useMediabunny || !this.frameExtractor) {
      return null;
    }

    // Check LRU cache first
    const cached = this.hdrFrameCache.get(frame);
    if (cached) return cached;

    // If a fetch for this frame is already in flight, await it instead of starting a duplicate
    const pending = this.pendingHDRFetches.get(frame);
    if (pending) return pending;

    // Create the fetch promise and track it
    const fetchPromise = (async (): Promise<IPImage | null> => {
      try {
        // Guard: if dispose() was called before the async IIFE runs, bail out
        if (!this.frameExtractor) return null;

        PerfTrace.begin('getFrameHDR');
        const sample = await this.frameExtractor.getFrameHDR(frame);
        PerfTrace.end('getFrameHDR');

        // Guard: dispose() may have been called while awaiting getFrameHDR
        if (!sample || !this.frameExtractor) return null;

        // Use stable HDR target size (actual display dims, not interaction-reduced)
        const targetSize = this.hdrTargetSize;
        PerfTrace.begin('hdrSampleToIPImage');
        const ipImage = this.hdrSampleToIPImage(sample, frame, targetSize);
        PerfTrace.end('hdrSampleToIPImage');
        sample.close();

        // Guard: dispose() may have been called during hdrSampleToIPImage/resize
        if (!this.frameExtractor) {
          ipImage.close(); // clean up since we won't cache it
          return null;
        }

        // Store in LRU cache (eviction calls image.close() automatically)
        this.hdrFrameCache.set(frame, ipImage);
        return ipImage;
      } catch {
        return null;
      }
    })();

    this.pendingHDRFetches.set(frame, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.pendingHDRFetches.delete(frame);
    }
  }

  /**
   * Preload HDR frames around the current position.
   * Extracts and caches nearby frames sequentially (decoder is serialized).
   * Skips frames already in the LRU cache.
   */
  async preloadHDRFrames(
    centerFrame: number,
    ahead: number = 8,
    behind: number = 2,
  ): Promise<void> {
    if (!this.isHDRVideo || !this.useMediabunny || !this.frameExtractor) return;

    // Clamp preload window to cache capacity to prevent evicting the current frame
    const maxWindow = Math.max(0, this.hdrFrameCache.capacity - 1);
    ahead = Math.min(ahead, maxWindow);
    behind = Math.min(behind, maxWindow - ahead);

    const maxFrame = this.metadata.duration;
    const frames: number[] = [];

    // Build list of frames to preload (skip already cached)
    for (let i = -behind; i <= ahead; i++) {
      if (i === 0) continue; // current frame already fetched
      const f = centerFrame + i;
      if (f >= 1 && f <= maxFrame && !this.hdrFrameCache.has(f)) {
        frames.push(f);
      }
    }

    // Extract sequentially — decoder serialization makes parallel extraction pointless
    for (const frame of frames) {
      // Bail if frame was cached by another request while we waited
      if (this.hdrFrameCache.has(frame)) continue;
      await this.fetchHDRFrame(frame);
    }
  }

  /**
   * Get frame as IPImage (async, uses mediabunny when available)
   * For HDR video, attempts to get VideoFrame-backed IPImage first
   */
  async getFrameIPImage(frame: number): Promise<IPImage | null> {
    if (this.useMediabunny && this.frameExtractor) {
      // HDR path: delegate to fetchHDRFrame (decode → resize → cache)
      if (this.isHDRVideo) {
        const hdrImage = await this.fetchHDRFrame(frame);
        if (hdrImage) return hdrImage;
        // Fall through to SDR path on failure
      }

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
    this.isHDRVideo = false;
    this.videoColorSpace = null;
    // Clear pending HDR fetches (they will resolve but results won't be used)
    this.pendingHDRFetches.clear();
    // Clear HDR frame cache (onEvict closes VideoFrames)
    this.hdrFrameCache.clear();
    // Dispose HDR resizer
    if (this.hdrResizer) {
      this.hdrResizer.dispose();
      this.hdrResizer = null;
    }
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
