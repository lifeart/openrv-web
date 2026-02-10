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
import type { VideoSample } from 'mediabunny';
import { FramePreloadManager, type PreloadConfig } from '../../utils/media/FramePreloadManager';
import type { CodecFamily, UnsupportedCodecError } from '../../utils/media/CodecUtils';

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

  // HDR async request and cached sample (separate from SDR pendingFrameRequest)
  private pendingHDRRequest: Promise<VideoSample | null> | null = null;
  private pendingHDRSample: VideoSample | null = null;
  private pendingHDRFrame: number = -1;

  // Cached HDR IPImage for synchronous access by Viewer's render loop
  private cachedHDRIPImage: IPImage | null = null;
  private cachedHDRIPImageFrame: number = -1;

  // HDR state
  private isHDRVideo: boolean = false;
  private videoColorSpace: VideoColorSpaceInit | null = null;

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
   * Returns VideoLoadResult with codec information
   */
  private async tryInitMediabunny(file: File | Blob, fps: number): Promise<VideoLoadResult> {
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

      // Initialize preload manager with optimized config for video playback
      this.initPreloadManager(metadata.frameCount);

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
   * Initialize the frame preload manager
   */
  private initPreloadManager(totalFrames: number, config?: Partial<PreloadConfig>): void {
    // Dispose existing manager if any
    this.preloadManager?.dispose();

    // Create loader function that uses frameExtractor
    // Accepts optional AbortSignal for cancellation support
    // Returns null on failure instead of throwing to avoid breaking the app
    const loader = async (frame: number, signal?: AbortSignal): Promise<FrameResult | null> => {
      if (!this.frameExtractor) {
        return null;
      }

      // Check if aborted before attempting extraction
      if (signal?.aborted) {
        return null;
      }

      try {
        const result = await this.frameExtractor.getFrame(frame, signal);
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
   */
  async loadFile(file: File, fps: number = 24): Promise<VideoLoadResult> {
    this.file = file;
    this.lastUnsupportedCodecError = null;
    const url = URL.createObjectURL(file);

    // Load HTML video first
    await this.loadHtmlVideo(url, file.name, fps);

    // Try mediabunny initialization
    if (this.extractionMode !== 'html-video') {
      const result = await this.tryInitMediabunny(file, fps);
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
  getCachedFrameCanvas(frame: number): HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null {
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
      // HDR path: try to get HDR sample asynchronously
      if (this.isHDRVideo) {
        // Return cached HDR sample if we already have one for this frame
        if (this.pendingHDRSample && this.pendingHDRFrame === context.frame) {
          const image = this.hdrSampleToIPImage(this.pendingHDRSample, context.frame);
          this.pendingHDRSample.close();
          this.pendingHDRSample = null;
          return image;
        }

        // Start async HDR frame request (uses its own pendingHDRRequest, not shared pendingFrameRequest)
        if (!this.pendingHDRRequest) {
          this.pendingHDRRequest = this.frameExtractor.getFrameHDR(context.frame).then((sample) => {
            this.pendingHDRRequest = null;
            if (sample) {
              // Close stale sample from a previous frame if it was never consumed
              if (this.pendingHDRSample) {
                this.pendingHDRSample.close();
              }
              this.pendingHDRSample = sample;
              this.pendingHDRFrame = context.frame;
              this.markDirty();
            }
            return sample;
          });
        }
        // Fall through to SDR cached frame or HTML video fallback while waiting
      }

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
  private hdrSampleToIPImage(sample: { toVideoFrame(): VideoFrame }, frame: number): IPImage {
    const videoFrame = sample.toVideoFrame();

    const transferFunction = this.mapTransferFunction(this.videoColorSpace?.transfer ?? undefined);
    const colorPrimaries = this.mapColorPrimaries(this.videoColorSpace?.primaries ?? undefined);

    // Use the track's display dimensions (which account for rotation) instead of
    // the VideoFrame's raw dimensions (which are pre-rotation coded dimensions).
    const trackWidth = this.metadata.width;
    const trackHeight = this.metadata.height;
    const rotation = this.frameExtractor?.getMetadata()?.rotation ?? 0;

    // Create IPImage with VideoFrame attached (minimal data buffer)
    // The VideoFrame is the actual pixel source; data is a placeholder
    return new IPImage({
      width: trackWidth,
      height: trackHeight,
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
          videoColorSpace: this.videoColorSpace,
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
    if (this.cachedHDRIPImageFrame === frame && this.cachedHDRIPImage) {
      return this.cachedHDRIPImage;
    }
    return null;
  }

  /**
   * Fetch an HDR frame and cache the resulting IPImage for synchronous access.
   * Closes the previous cached VideoFrame to prevent leaks.
   */
  async fetchHDRFrame(frame: number): Promise<IPImage | null> {
    if (!this.isHDRVideo || !this.useMediabunny || !this.frameExtractor) {
      return null;
    }

    try {
      const sample = await this.frameExtractor.getFrameHDR(frame);
      if (!sample) return null;

      const ipImage = this.hdrSampleToIPImage(sample, frame);
      sample.close();

      // Close previous cached VideoFrame to prevent GPU memory leaks
      if (this.cachedHDRIPImage && this.cachedHDRIPImage !== ipImage) {
        this.cachedHDRIPImage.close();
      }

      this.cachedHDRIPImage = ipImage;
      this.cachedHDRIPImageFrame = frame;
      return ipImage;
    } catch {
      return null;
    }
  }

  /**
   * Get frame as IPImage (async, uses mediabunny when available)
   * For HDR video, attempts to get VideoFrame-backed IPImage first
   */
  async getFrameIPImage(frame: number): Promise<IPImage | null> {
    if (this.useMediabunny && this.frameExtractor) {
      // HDR path: try to get HDR sample with VideoFrame
      if (this.isHDRVideo) {
        try {
          const sample = await this.frameExtractor.getFrameHDR(frame);
          if (sample) {
            const result = this.hdrSampleToIPImage(sample, frame);
            sample.close();
            return result;
          }
        } catch {
          // Fall through to SDR path
        }
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
    this.pendingHDRRequest = null;
    if (this.pendingHDRSample) {
      this.pendingHDRSample.close();
      this.pendingHDRSample = null;
    }
    this.pendingHDRFrame = -1;
    if (this.cachedHDRIPImage) {
      this.cachedHDRIPImage.close();
      this.cachedHDRIPImage = null;
    }
    this.cachedHDRIPImageFrame = -1;
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
