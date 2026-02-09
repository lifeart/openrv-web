/**
 * MediabunnyFrameExtractor - Frame-accurate video frame extraction using mediabunny
 *
 * Provides precise frame extraction from video files using the WebCodecs API
 * via the mediabunny library. This enables accurate seeking to any frame
 * regardless of keyframe positions.
 */

import {
  Input,
  BlobSource,
  CanvasSink,
  VideoSampleSink,
  ALL_FORMATS,
  type InputVideoTrack,
  type VideoSample,
} from 'mediabunny';
import {
  detectCodecFamily,
  isProfessionalCodec,
  createUnsupportedCodecError,
  type CodecFamily,
  type UnsupportedCodecError,
} from './CodecUtils';
import { Logger } from '../Logger';
import { LRUCache } from '../LRUCache';

const log = new Logger('MediabunnyFrameExtractor');

export interface VideoMetadata {
  width: number;
  height: number;
  duration: number; // in seconds
  frameCount: number;
  fps: number;
  codec: string | null;
  codecFamily: CodecFamily;
  canDecode: boolean;
  /** True if this is a professional codec (ProRes, DNxHD) that requires transcoding */
  isProfessionalCodec: boolean;
  /** True if the video track has HDR (Dolby Vision, HLG, PQ) */
  isHDR: boolean;
  /** VideoColorSpaceInit from the video track (primaries, transfer, matrix, fullRange) */
  colorSpace: VideoColorSpaceInit | null;
}

/**
 * Error thrown when a codec is not supported by WebCodecs
 */
export class UnsupportedCodecException extends Error {
  public readonly codecError: UnsupportedCodecError;
  public readonly codec: string | null;
  public readonly codecFamily: CodecFamily;

  constructor(codec: string | null, filename?: string) {
    const error = createUnsupportedCodecError(codec, filename);
    super(error.message);
    this.name = 'UnsupportedCodecException';
    this.codecError = error;
    this.codec = codec;
    this.codecFamily = error.codecInfo.family;
  }
}

export interface FrameResult {
  canvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
  timestamp: number;
  duration: number;
  frameNumber: number;
}

/**
 * Snapshot canvas content using createImageBitmap (async, GPU-accelerated).
 * This is necessary because mediabunny reuses the same canvas for subsequent frames.
 * Using createImageBitmap instead of synchronous canvas copy avoids blocking the
 * main thread with pixel copies (~8MB per 1080p frame).
 */
async function snapshotCanvas(source: HTMLCanvasElement | OffscreenCanvas): Promise<ImageBitmap> {
  return createImageBitmap(source);
}

/**
 * MediabunnyFrameExtractor provides frame-accurate video frame extraction
 * using the WebCodecs API via mediabunny.
 */
export class MediabunnyFrameExtractor {
  private input: Input | null = null;
  private videoTrack: InputVideoTrack | null = null;
  private canvasSink: CanvasSink | null = null;
  private videoSampleSink: VideoSampleSink | null = null;
  private metadata: VideoMetadata | null = null;
  private fps: number = 24;

  // Frame index: maps frame number (1-based) to actual timestamp
  private frameIndex: Map<number, number> = new Map();
  private frameIndexBuilt: boolean = false;
  private buildingFrameIndex: Promise<void> | null = null;

  // Detected FPS from actual video frames
  private detectedFps: number | null = null;

  // Serialization queue for frame extraction to prevent concurrent seeks
  // Uses a proper mutex pattern where only one operation runs at a time
  private extractionQueue: Promise<void> = Promise.resolve();

  // AbortController for cancelling pending frame extraction operations
  private abortController: AbortController = new AbortController();

  // Snapshot cache: caches last N ImageBitmaps by timestamp to avoid redundant GPU round-trips.
  // Uses LRUCache with onEvict to close() evicted bitmaps.
  private snapshotCache = new LRUCache<number, ImageBitmap>(3, (_key, bitmap) => {
    bitmap.close();
  });

  /**
   * Check if WebCodecs API is available
   */
  static isSupported(): boolean {
    return (
      typeof VideoDecoder !== 'undefined' &&
      typeof VideoEncoder !== 'undefined'
    );
  }

  /**
   * Abort all pending frame extraction operations
   * Creates a new AbortController for future operations
   *
   * Note: In-progress extractions cannot be cancelled mid-decode due to
   * WebCodecs limitations. This only cancels operations waiting in queue
   * and prevents new operations from starting until current one completes.
   */
  abortPendingOperations(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
    // Note: We intentionally do NOT reset extractionQueue here.
    // Resetting the queue while an operation holds the lock would allow
    // concurrent decoder access, corrupting state. Operations waiting
    // in queue will check the abort signal and exit early.
  }

  /**
   * Get the current abort signal for external use
   */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Load a video file for frame extraction
   */
  async load(file: File | Blob, fps: number = 24): Promise<VideoMetadata> {
    // Clean up any existing resources
    this.dispose();

    this.fps = fps;

    try {
      // Create mediabunny input from blob
      const source = new BlobSource(file);
      this.input = new Input({
        source,
        formats: ALL_FORMATS,
      });

      // Get primary video track
      this.videoTrack = await this.input.getPrimaryVideoTrack();
      if (!this.videoTrack) {
        throw new Error('No video track found in file');
      }

      // Check codec support
      const codec = this.videoTrack.codec;
      const codecFamily = detectCodecFamily(codec);
      const canDecode = await this.videoTrack.canDecode();

      if (!canDecode) {
        // Check if this is a professional codec that typically isn't supported
        if (isProfessionalCodec(codecFamily)) {
          throw new UnsupportedCodecException(codec, file instanceof File ? file.name : undefined);
        }
        throw new Error(
          `Cannot decode video codec: ${codec ?? 'unknown'}. WebCodecs may not support this format.`
        );
      }

      // Get video duration
      const duration = await this.input.computeDuration();

      // Calculate frame count based on duration and fps
      const frameCount = Math.round(duration * fps);

      // Detect HDR capabilities
      let isHDR = false;
      let videoColorSpace: VideoColorSpaceInit | null = null;
      try {
        if (typeof this.videoTrack.hasHighDynamicRange === 'function') {
          const hdrResult = this.videoTrack.hasHighDynamicRange();
          isHDR = hdrResult instanceof Promise ? await hdrResult : hdrResult;
        }
        if (typeof this.videoTrack.getColorSpace === 'function') {
          const csResult = this.videoTrack.getColorSpace();
          videoColorSpace = csResult instanceof Promise ? await csResult : csResult;
        }
      } catch (e) {
        log.warn('HDR detection not available in this version of mediabunny:', e);
      }

      // Create canvas sink for frame extraction (always needed for SDR fallback & thumbnails)
      this.canvasSink = new CanvasSink(this.videoTrack, {
        width: this.videoTrack.displayWidth,
        height: this.videoTrack.displayHeight,
        fit: 'contain', // Required when both width and height are provided
      });

      // Create VideoSampleSink for HDR frame extraction when HDR is detected
      if (isHDR) {
        try {
          this.videoSampleSink = new VideoSampleSink(this.videoTrack);
        } catch (e) {
          log.warn('VideoSampleSink creation failed, HDR frames will use SDR fallback:', e);
          isHDR = false;
        }
      }

      this.metadata = {
        width: this.videoTrack.displayWidth,
        height: this.videoTrack.displayHeight,
        duration,
        frameCount,
        fps,
        codec,
        codecFamily,
        canDecode,
        isProfessionalCodec: isProfessionalCodec(codecFamily),
        isHDR,
        colorSpace: videoColorSpace,
      };

      return this.metadata;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /**
   * Load from URL
   */
  async loadUrl(url: string, fps: number = 24): Promise<VideoMetadata> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }
    const blob = await response.blob();
    return this.load(blob, fps);
  }

  /**
   * Get video metadata
   */
  getMetadata(): VideoMetadata | null {
    return this.metadata;
  }

  /**
   * Check if extractor is ready
   */
  isReady(): boolean {
    return this.canvasSink !== null && this.metadata !== null;
  }

  /**
   * Build frame index by iterating through all frames once
   * This maps frame numbers (1-based) to actual video timestamps
   */
  private async buildFrameIndex(): Promise<void> {
    if (this.frameIndexBuilt || !this.canvasSink) {
      return;
    }

    // Prevent concurrent builds
    if (this.buildingFrameIndex) {
      await this.buildingFrameIndex;
      return;
    }

    this.buildingFrameIndex = (async () => {
      this.frameIndex.clear();

      // Collect all frames with their timestamps
      // IMPORTANT: Videos with B-frames may return frames in DECODE order,
      // but timestamps are in PRESENTATION order. We need to sort by timestamp
      // to build a correct frame index.
      const frameTimestamps: number[] = [];

      for await (const wrapped of this.canvasSink!.canvases()) {
        frameTimestamps.push(wrapped.timestamp);
      }

      // Sort timestamps to get presentation order
      // This is critical for videos with B-frames where decode order != presentation order
      frameTimestamps.sort((a, b) => a - b);

      // Log raw vs sorted timestamps for debugging
      log.debug(`Frame index: collected ${frameTimestamps.length} frames`);
      if (frameTimestamps.length <= 10) {
        log.debug('Sorted timestamps:', frameTimestamps.map(t => t.toFixed(4)));
      } else {
        log.debug('First 10 sorted timestamps:', frameTimestamps.slice(0, 10).map(t => t.toFixed(4)));
      }

      // Build frame index from sorted timestamps
      for (let i = 0; i < frameTimestamps.length; i++) {
        // Frame numbers are 1-based
        this.frameIndex.set(i + 1, frameTimestamps[i]!);
      }

      const actualFrameCount = frameTimestamps.length;
      const lastTimestamp = frameTimestamps[frameTimestamps.length - 1] ?? 0;

      // Calculate detected FPS from actual frame count and duration
      if (actualFrameCount > 0 && lastTimestamp > 0) {
        // FPS = (frameCount - 1) / lastTimestamp (since first frame is at t=0)
        // For safety, use frameCount / (lastTimestamp + avgFrameDuration)
        this.detectedFps = actualFrameCount / (lastTimestamp + (lastTimestamp / Math.max(1, actualFrameCount - 1)));

        // Round to common FPS values if close
        const commonFps = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
        for (const common of commonFps) {
          if (Math.abs(this.detectedFps - common) < 0.5) {
            this.detectedFps = common;
            break;
          }
        }
      }

      // Update metadata with actual frame count and detected FPS
      if (this.metadata) {
        this.metadata.frameCount = actualFrameCount;
        if (this.detectedFps) {
          this.metadata.fps = this.detectedFps;
          this.fps = this.detectedFps;
        }
      }

      // IMPORTANT: Recreate the CanvasSink after building the frame index
      // The full iteration leaves the decoder at the end of the video, and some
      // decoders don't reset properly for subsequent seeks. Creating a fresh
      // CanvasSink ensures clean state for random access.
      if (this.videoTrack) {
        this.canvasSink = new CanvasSink(this.videoTrack, {
          width: this.videoTrack.displayWidth,
          height: this.videoTrack.displayHeight,
          fit: 'contain', // Required when both width and height are provided
        });

        // Recreate VideoSampleSink for HDR
        if (this.metadata?.isHDR) {
          try {
            this.videoSampleSink = new VideoSampleSink(this.videoTrack);
          } catch (e) {
            log.warn('VideoSampleSink recreation failed after frame index build, falling back to SDR:', e);
            this.videoSampleSink = null;
            this.metadata.isHDR = false;
          }
        }
      }

      this.frameIndexBuilt = true;
      this.buildingFrameIndex = null;
    })();

    await this.buildingFrameIndex;
  }

  /**
   * Convert frame number (1-based) to timestamp in seconds (estimated)
   */
  frameToTimestamp(frame: number): number {
    return (frame - 1) / this.fps;
  }

  /**
   * Convert timestamp in seconds to frame number (1-based)
   */
  timestampToFrame(timestamp: number): number {
    return Math.floor(timestamp * this.fps) + 1;
  }

  /**
   * Get the expected timestamp for a frame number (1-based).
   * If the full frame index has been built, uses the indexed timestamp (accurate for VFR).
   * Otherwise, computes the timestamp mathematically assuming CFR: (frame - 1) / fps.
   * This avoids blocking on the full frame scan for the common CFR case.
   */
  private getExpectedTimestamp(frame: number): number | undefined {
    // Prefer indexed timestamp when available (handles VFR content accurately)
    if (this.frameIndexBuilt) {
      return this.frameIndex.get(frame);
    }
    // CFR estimation: compute timestamp mathematically
    // This is accurate for constant frame rate content and avoids the full scan
    if (this.metadata) {
      const maxFrame = this.metadata.frameCount;
      if (frame < 1 || frame > maxFrame) {
        return undefined;
      }
      return this.frameToTimestamp(frame);
    }
    return undefined;
  }

  /**
   * Extract a single frame by frame number (1-based)
   * Uses frame index for accurate frame-to-content mapping when available,
   * otherwise uses CFR-based timestamp estimation to avoid blocking on full scan.
   * Serialized via queue to prevent concurrent decoder state corruption
   * @param frame - The frame number to extract (1-based)
   * @param signal - Optional AbortSignal to cancel the operation
   */
  async getFrame(frame: number, signal?: AbortSignal): Promise<FrameResult | null> {
    // Use provided signal or the internal one
    const abortSignal = signal ?? this.abortController.signal;

    // Check if already aborted before starting
    if (abortSignal.aborted) {
      return null;
    }

    if (!this.canvasSink || !this.metadata) {
      throw new Error('Extractor not initialized. Call load() first.');
    }

    // Clamp frame to valid range
    const maxFrame = this.metadata.frameCount;
    const clampedFrame = Math.max(1, Math.min(frame, maxFrame));

    // Get the expected timestamp for this frame.
    // Uses indexed timestamp if frame index is built (accurate for VFR),
    // otherwise uses CFR math: (frame - 1) / fps (avoids full video scan).
    const expectedTimestamp = this.getExpectedTimestamp(clampedFrame);
    if (expectedTimestamp === undefined) {
      return null;
    }

    // Check snapshot cache - return cached bitmap if available (avoids GPU round-trip)
    // LRUCache.get() automatically refreshes access order
    const cachedBitmap = this.snapshotCache.get(expectedTimestamp);
    if (cachedBitmap) {
      return {
        canvas: cachedBitmap,
        timestamp: expectedTimestamp,
        duration: 0,
        frameNumber: clampedFrame,
      };
    }

    // Queue this extraction - each extraction waits for previous ones to complete
    // This prevents concurrent seeks which can corrupt decoder state
    let resolveOurs: () => void;
    const ourTurn = new Promise<void>((resolve) => {
      resolveOurs = resolve;
    });

    // Wait for previous operations to complete, then mark our operation as the current one
    const previousQueue = this.extractionQueue;
    this.extractionQueue = ourTurn;

    try {
      // Wait for any pending operation to complete
      await previousQueue;

      // Check abort after waiting in queue
      if (abortSignal.aborted) {
        return null;
      }

      // Now we have exclusive access to the decoder
      // Get the frame at this exact timestamp
      // Use a wider window to ensure we capture the frame even with slight timing differences
      const startTimestamp = Math.max(0, expectedTimestamp - 0.001);
      const videoDuration = this.metadata?.duration ?? Infinity;
      const endTimestamp = Math.min(expectedTimestamp + 0.05, videoDuration); // Clamp to video duration to prevent hanging past end

      let result: FrameResult | null = null;
      let bestMatch: { canvas: ImageBitmap; timestamp: number; duration: number } | null = null;
      let bestTimestampDiff = Infinity;

      // Request frames in the timestamp range and find the best match
      const iterator = this.canvasSink!.canvases(startTimestamp, endTimestamp);

      for await (const wrapped of { [Symbol.asyncIterator]: () => iterator }) {
        // Check abort during iteration
        if (abortSignal.aborted) {
          return null;
        }

        const timestampDiff = Math.abs(wrapped.timestamp - expectedTimestamp);

        // Keep track of the frame closest to our expected timestamp
        if (timestampDiff < bestTimestampDiff) {
          bestTimestampDiff = timestampDiff;
          // IMPORTANT: Snapshot the canvas because mediabunny reuses the same canvas object
          // Uses async createImageBitmap for GPU-accelerated, non-blocking copy
          bestMatch = {
            canvas: await snapshotCanvas(wrapped.canvas),
            timestamp: wrapped.timestamp,
            duration: wrapped.duration,
          };
        }

        // If we found an exact match (within 1ms), we can stop
        if (timestampDiff < 0.001) {
          break;
        }
      }

      // Final abort check before returning result
      if (abortSignal.aborted) {
        return null;
      }

      if (bestMatch) {
        // Warn if the timestamp is significantly different from expected
        // This helps debug seeking issues
        if (bestTimestampDiff > 0.01) {
          log.warn(
            `Frame ${clampedFrame}: expected timestamp ${expectedTimestamp.toFixed(4)}, ` +
            `got ${bestMatch.timestamp.toFixed(4)} (diff: ${bestTimestampDiff.toFixed(4)})`
          );
        }

        // Store in snapshot cache for future reuse
        this.cacheSnapshot(expectedTimestamp, bestMatch.canvas);

        result = {
          canvas: bestMatch.canvas,
          timestamp: bestMatch.timestamp,
          duration: bestMatch.duration,
          frameNumber: clampedFrame,
        };
      } else {
        log.warn(
          `Frame ${clampedFrame}: no frame found in range ` +
          `[${startTimestamp.toFixed(4)}, ${endTimestamp.toFixed(4)}]`
        );
      }

      return result;
    } finally {
      // Signal that we're done, allowing the next queued operation to proceed
      resolveOurs!();
    }
  }

  /**
   * Store an ImageBitmap in the snapshot cache.
   * LRUCache handles eviction and calls bitmap.close() via onEvict.
   */
  private cacheSnapshot(timestamp: number, bitmap: ImageBitmap): void {
    this.snapshotCache.set(timestamp, bitmap);
  }

  /**
   * Clear the snapshot cache, closing all cached ImageBitmaps via onEvict.
   */
  private clearSnapshotCache(): void {
    this.snapshotCache.clear();
  }

  /**
   * Extract a single HDR frame by frame number (1-based) using VideoSampleSink.
   * Returns a VideoSample that can produce a VideoFrame for direct GPU upload.
   * Falls back to null if VideoSampleSink is not available.
   * Uses CFR-based timestamp estimation when frame index is not yet built.
   */
  async getFrameHDR(frame: number, signal?: AbortSignal): Promise<VideoSample | null> {
    if (!this.videoSampleSink || !this.metadata?.isHDR) {
      return null;
    }

    const abortSignal = signal ?? this.abortController.signal;
    if (abortSignal.aborted) {
      return null;
    }

    // Clamp frame to valid range
    const maxFrame = this.metadata.frameCount;
    const clampedFrame = Math.max(1, Math.min(frame, maxFrame));

    // Get the expected timestamp for this frame (indexed if available, else CFR math)
    const expectedTimestamp = this.getExpectedTimestamp(clampedFrame);
    if (expectedTimestamp === undefined) {
      return null;
    }

    // Queue this extraction for serialization
    let resolveOurs: () => void;
    const ourTurn = new Promise<void>((resolve) => {
      resolveOurs = resolve;
    });

    const previousQueue = this.extractionQueue;
    this.extractionQueue = ourTurn;

    try {
      await previousQueue;

      if (abortSignal.aborted) {
        return null;
      }

      const sample = await this.videoSampleSink.getSample(expectedTimestamp);
      return sample ?? null;
    } catch (error) {
      log.warn(`HDR frame ${clampedFrame} extraction failed:`, error);
      return null;
    } finally {
      resolveOurs!();
    }
  }

  /**
   * Check if HDR frame extraction is available
   */
  isHDR(): boolean {
    return this.metadata?.isHDR ?? false;
  }

  /**
   * Get the video color space information
   */
  getColorSpace(): VideoColorSpaceInit | null {
    return this.metadata?.colorSpace ?? null;
  }

  /**
   * Extract multiple frames at specific frame numbers (1-based)
   * Fetches each frame individually to ensure correct frame-to-content mapping
   */
  async *getFrames(
    frames: number[]
  ): AsyncGenerator<FrameResult | null, void, unknown> {
    if (!this.canvasSink || !this.metadata) {
      throw new Error('Extractor not initialized. Call load() first.');
    }

    if (frames.length === 0) return;

    // Fetch each frame individually to ensure correct mapping
    // This is necessary because video frame rate may differ from our assumed fps
    for (const frame of frames) {
      const result = await this.getFrame(frame);
      yield result;
    }
  }

  /**
   * Extract frames in a range (inclusive, 1-based frame numbers)
   */
  async *getFrameRange(
    startFrame: number,
    endFrame: number
  ): AsyncGenerator<FrameResult, void, unknown> {
    if (!this.canvasSink || !this.metadata) {
      throw new Error('Extractor not initialized. Call load() first.');
    }

    const start = Math.max(1, startFrame);
    const end = Math.min(endFrame, this.metadata.frameCount);

    // Fetch each frame individually to ensure correct mapping
    for (let frame = start; frame <= end; frame++) {
      const result = await this.getFrame(frame);
      if (result) {
        yield result;
      }
    }
  }

  /**
   * Extract frame as ImageData
   */
  async getFrameImageData(frame: number): Promise<ImageData | null> {
    const result = await this.getFrame(frame);
    if (!result) return null;

    const canvas = result.canvas;

    // Get 2D context based on canvas type
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (canvas instanceof ImageBitmap) {
      const temp = new OffscreenCanvas(canvas.width, canvas.height);
      const tempCtx = temp.getContext('2d')!;
      tempCtx.drawImage(canvas, 0, 0);
      return tempCtx.getImageData(0, 0, canvas.width, canvas.height);
    } else if (canvas instanceof HTMLCanvasElement) {
      ctx = canvas.getContext('2d');
    } else {
      ctx = canvas.getContext('2d');
    }

    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * Extract frame as Blob (PNG/JPEG)
   */
  async getFrameBlob(
    frame: number,
    type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
    quality?: number
  ): Promise<Blob | null> {
    const result = await this.getFrame(frame);
    if (!result) return null;

    const canvas = result.canvas;

    if (canvas instanceof ImageBitmap) {
      const temp = new OffscreenCanvas(canvas.width, canvas.height);
      const ctx = temp.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      return temp.convertToBlob({ type, quality });
    } else if (canvas instanceof HTMLCanvasElement) {
      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
      });
    } else {
      // OffscreenCanvas
      return canvas.convertToBlob({ type, quality });
    }
  }

  /**
   * Generate thumbnail at specific frame
   */
  async getThumbnail(
    frame: number,
    maxSize: number = 256
  ): Promise<HTMLCanvasElement | null> {
    const result = await this.getFrame(frame);
    if (!result) return null;

    const sourceCanvas = result.canvas;
    const { width, height } = sourceCanvas;

    // Calculate thumbnail dimensions maintaining aspect ratio
    let thumbWidth: number;
    let thumbHeight: number;
    if (width > height) {
      thumbWidth = maxSize;
      thumbHeight = Math.round((height / width) * maxSize);
    } else {
      thumbHeight = maxSize;
      thumbWidth = Math.round((width / height) * maxSize);
    }

    // Create thumbnail canvas
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for thumbnail');
    }

    // Draw scaled frame
    ctx.drawImage(sourceCanvas, 0, 0, thumbWidth, thumbHeight);

    return thumbCanvas;
  }

  /**
   * Generate multiple thumbnails evenly distributed across the video
   */
  async *generateThumbnails(
    count: number,
    maxSize: number = 128
  ): AsyncGenerator<HTMLCanvasElement, void, unknown> {
    if (!this.metadata) {
      throw new Error('Extractor not initialized. Call load() first.');
    }

    const { frameCount } = this.metadata;

    // Calculate evenly distributed frame numbers
    const frames: number[] = [];
    for (let i = 0; i < count; i++) {
      const frame = Math.max(1, Math.round((i * (frameCount - 1)) / (count - 1 || 1)) + 1);
      frames.push(frame);
    }

    for await (const result of this.getFrames(frames)) {
      if (result) {
        const thumb = await this.createThumbnailFromCanvas(
          result.canvas,
          maxSize
        );
        yield thumb;
      }
    }
  }

  private async createThumbnailFromCanvas(
    sourceCanvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
    maxSize: number
  ): Promise<HTMLCanvasElement> {
    const { width, height } = sourceCanvas;

    // Calculate thumbnail dimensions
    let thumbWidth: number;
    let thumbHeight: number;
    if (width > height) {
      thumbWidth = maxSize;
      thumbHeight = Math.round((height / width) * maxSize);
    } else {
      thumbHeight = maxSize;
      thumbWidth = Math.round((width / height) * maxSize);
    }

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for thumbnail');
    }

    ctx.drawImage(sourceCanvas, 0, 0, thumbWidth, thumbHeight);
    return thumbCanvas;
  }

  /**
   * Get the actual frame count (builds index if needed)
   */
  async getActualFrameCount(): Promise<number> {
    await this.buildFrameIndex();
    return this.frameIndex.size;
  }

  /**
   * Get the detected FPS from actual video frames (builds index if needed)
   * Returns null if FPS couldn't be detected
   */
  async getDetectedFps(): Promise<number | null> {
    await this.buildFrameIndex();
    return this.detectedFps;
  }

  /**
   * Check if frame index is built
   */
  isFrameIndexReady(): boolean {
    return this.frameIndexBuilt;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Abort any pending operations first
    this.abortPendingOperations();

    this.frameIndex.clear();
    this.frameIndexBuilt = false;
    this.buildingFrameIndex = null;
    this.detectedFps = null;

    // Clear snapshot cache, closing all cached bitmaps
    this.clearSnapshotCache();

    // Reset extraction queue
    this.extractionQueue = Promise.resolve();

    if (this.input) {
      this.input.dispose();
      this.input = null;
    }
    this.videoTrack = null;
    this.canvasSink = null;
    this.videoSampleSink = null;
    this.metadata = null;
  }
}

/**
 * Create a MediabunnyFrameExtractor and load a file
 * Convenience function for one-shot usage
 */
export async function createFrameExtractor(
  file: File | Blob,
  fps: number = 24
): Promise<MediabunnyFrameExtractor> {
  const extractor = new MediabunnyFrameExtractor();
  await extractor.load(file, fps);
  return extractor;
}
