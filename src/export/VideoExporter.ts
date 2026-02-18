/**
 * Video Exporter — WebCodecs-based frame-sequence-to-video encoder
 *
 * Encodes a range of frames to H.264, VP9, or AV1 video using the WebCodecs
 * VideoEncoder API. Supports frameburn overlays, progress reporting,
 * and cancellation.
 *
 * Output is produced as an array of EncodedVideoChunk data. A separate
 * muxer step wraps the encoded chunks into an MP4 container.
 *
 * Reference: OpenRV export pipeline
 */

import { EventEmitter, EventMap } from '../utils/EventEmitter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported codec strings (WebCodecs codec registry) */
export type VideoCodec =
  | 'avc1.42001f'       // H.264 Baseline
  | 'avc1.4d0028'       // H.264 Main
  | 'avc1.640028'       // H.264 High
  | 'vp09.00.10.08'     // VP9
  | 'av01.0.04M.08';    // AV1

/** Configuration for a video export job */
export interface VideoExportConfig {
  /** WebCodecs codec string */
  codec: VideoCodec;
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Frames per second */
  fps: number;
  /** Target bitrate in bits per second */
  bitrate: number;
  /** Frame range to encode (1-based, inclusive) */
  frameRange: { start: number; end: number };
  /** GOP (Group of Pictures) size — keyframe interval in frames. Default: fps (1 per second) */
  gopSize?: number;
  /** Latency mode hint for WebCodecs. Default: 'quality' */
  latencyMode?: 'quality' | 'realtime';
  /** Hardware acceleration preference. Default: 'no-preference' */
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
}

/** Progress information emitted during encoding */
export interface ExportProgress {
  /** Current frame being encoded (1-based) */
  currentFrame: number;
  /** Total frames to encode */
  totalFrames: number;
  /** Completion percentage (0-100) */
  percentage: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated remaining time in milliseconds */
  estimatedRemainingMs: number;
  /** Current export phase */
  status: 'encoding' | 'flushing' | 'complete' | 'cancelled' | 'error';
}

/** A single encoded video chunk with metadata */
export interface EncodedChunk {
  /** Raw encoded data */
  data: Uint8Array;
  /** Chunk type: key (I-frame) or delta (P/B-frame) */
  type: 'key' | 'delta';
  /** Presentation timestamp in microseconds */
  timestamp: number;
  /** Duration in microseconds (if available) */
  duration?: number;
}

/** Result of a completed export */
export interface ExportResult {
  /** Encoded video chunks in presentation order */
  chunks: EncodedChunk[];
  /** Codec used */
  codec: VideoCodec;
  /** Output dimensions */
  width: number;
  height: number;
  /** Frame rate */
  fps: number;
  /** Total frames encoded */
  totalFrames: number;
  /** Total encoding time in milliseconds */
  encodingTimeMs: number;
}

/** Frame provider: given a 1-based frame number, returns an ImageBitmap or canvas to encode */
export type FrameProvider = (frame: number) => Promise<HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null>;

/** Events emitted by VideoExporter */
export interface VideoExporterEvents extends EventMap {
  progress: ExportProgress;
  chunkEncoded: EncodedChunk;
  complete: ExportResult;
  error: { message: string; frame?: number };
  cancelled: { framesEncoded: number };
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/**
 * Check if WebCodecs VideoEncoder is available in the current environment.
 */
export function isVideoEncoderSupported(): boolean {
  return typeof globalThis.VideoEncoder === 'function';
}

/**
 * Check if a specific codec is supported for encoding.
 * Returns a promise with the codec support status.
 */
export async function isCodecSupported(codec: VideoCodec): Promise<boolean> {
  if (!isVideoEncoderSupported()) return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// VideoExporter
// ---------------------------------------------------------------------------

/**
 * Encodes a frame sequence to video using WebCodecs VideoEncoder.
 *
 * Usage:
 * ```ts
 * const exporter = new VideoExporter();
 * exporter.on('progress', (p) => console.log(`${p.percentage}%`));
 * const result = await exporter.encode(config, async (frame) => {
 *   // render frame to canvas and return it
 *   return canvas;
 * });
 * // result.chunks contains encoded data ready for muxing
 * ```
 */
export class VideoExporter extends EventEmitter<VideoExporterEvents> {
  private cancelFlag = false;
  private encoding = false;

  /**
   * Whether an encoding job is currently active.
   */
  get isEncoding(): boolean {
    return this.encoding;
  }

  /**
   * Request cancellation of the current encoding job.
   * The encode() promise will resolve with partial results or reject.
   */
  cancel(): void {
    this.cancelFlag = true;
  }

  /**
   * Encode a frame sequence to video.
   *
   * @param config - Export configuration (codec, dimensions, bitrate, frame range)
   * @param frameProvider - Async function that returns a renderable surface for each frame number
   * @returns Encoded chunks ready for muxing into a container format
   * @throws If WebCodecs is not available, codec is unsupported, or encoding fails
   */
  async encode(
    config: VideoExportConfig,
    frameProvider: FrameProvider,
  ): Promise<ExportResult> {
    if (this.encoding) {
      throw new Error('VideoExporter: already encoding');
    }
    if (!isVideoEncoderSupported()) {
      throw new Error('VideoExporter: WebCodecs VideoEncoder not available');
    }

    this.encoding = true;
    this.cancelFlag = false;

    const {
      codec,
      width,
      height,
      fps,
      bitrate,
      frameRange,
      gopSize = fps,
      latencyMode = 'quality',
      hardwareAcceleration = 'no-preference',
    } = config;

    const totalFrames = frameRange.end - frameRange.start + 1;
    if (totalFrames <= 0) {
      this.encoding = false;
      throw new Error('VideoExporter: invalid frame range');
    }

    const chunks: EncodedChunk[] = [];
    const frameDurationUs = Math.round(1_000_000 / fps);
    const startTime = performance.now();

    // Create encoder
    let encoderError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk: EncodedVideoChunk) => {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        const encoded: EncodedChunk = {
          data: buf,
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration ?? undefined,
        };
        chunks.push(encoded);
        this.emit('chunkEncoded', encoded);
      },
      error: (e: DOMException) => {
        encoderError = new Error(`VideoEncoder error: ${e.message}`);
      },
    });

    try {
      encoder.configure({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode,
        hardwareAcceleration,
      });

      // Encode each frame
      for (let i = 0; i < totalFrames; i++) {
        if (this.cancelFlag) {
          break;
        }
        if (encoderError) {
          throw encoderError;
        }

        const frameNum = frameRange.start + i;
        const surface = await frameProvider(frameNum);
        if (!surface) {
          // Skip null frames (gaps in sequence) but still emit progress
          const elapsed = performance.now() - startTime;
          const framesComplete = i + 1;
          this.emit('progress', {
            currentFrame: frameNum,
            totalFrames,
            percentage: Math.round((framesComplete / totalFrames) * 100),
            elapsedMs: Math.round(elapsed),
            estimatedRemainingMs: 0,
            status: 'encoding',
          });
          continue;
        }

        // Backpressure: wait if encoder queue is too deep
        while ((encoder as unknown as { encodeQueueSize?: number }).encodeQueueSize! > 5) {
          await yieldToMainThread();
        }

        const timestamp = i * frameDurationUs;
        const isKeyFrame = i % gopSize === 0;

        const videoFrame = new VideoFrame(surface, {
          timestamp,
          duration: frameDurationUs,
        });

        try {
          encoder.encode(videoFrame, { keyFrame: isKeyFrame });
        } finally {
          videoFrame.close();
        }

        // Emit progress
        const elapsed = performance.now() - startTime;
        const framesComplete = i + 1;
        const avgTimePerFrame = elapsed / framesComplete;
        const remaining = avgTimePerFrame * (totalFrames - framesComplete);

        const progress: ExportProgress = {
          currentFrame: frameNum,
          totalFrames,
          percentage: Math.round((framesComplete / totalFrames) * 100),
          elapsedMs: Math.round(elapsed),
          estimatedRemainingMs: Math.round(remaining),
          status: 'encoding',
        };
        this.emit('progress', progress);

        // Yield to main thread periodically to avoid blocking UI
        if (i % 5 === 4) {
          await yieldToMainThread();
        }
      }

      if (this.cancelFlag) {
        encoder.close();
        this.emit('progress', {
          currentFrame: frameRange.start + Math.max(0, chunks.length - 1),
          totalFrames,
          percentage: Math.round((chunks.length / totalFrames) * 100),
          elapsedMs: Math.round(performance.now() - startTime),
          estimatedRemainingMs: 0,
          status: 'cancelled',
        });
        this.emit('cancelled', { framesEncoded: chunks.length });
        throw new ExportCancelledError(chunks.length);
      }

      if (encoderError) {
        encoder.close();
        throw encoderError;
      }

      // Flush remaining frames
      this.emit('progress', {
        currentFrame: frameRange.end,
        totalFrames,
        percentage: 99,
        elapsedMs: Math.round(performance.now() - startTime),
        estimatedRemainingMs: 0,
        status: 'flushing',
      });

      await encoder.flush();
      encoder.close();

      if (encoderError) {
        throw encoderError;
      }

      const encodingTimeMs = Math.round(performance.now() - startTime);

      const result: ExportResult = {
        chunks,
        codec,
        width,
        height,
        fps,
        totalFrames: chunks.length,
        encodingTimeMs,
      };

      this.emit('progress', {
        currentFrame: frameRange.end,
        totalFrames,
        percentage: 100,
        elapsedMs: encodingTimeMs,
        estimatedRemainingMs: 0,
        status: 'complete',
      });
      this.emit('complete', result);

      return result;
    } catch (e) {
      if (e instanceof ExportCancelledError) {
        throw e;
      }
      if (encoder.state !== 'closed') {
        encoder.close();
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('error', { message: msg });
      this.emit('progress', {
        currentFrame: frameRange.start,
        totalFrames,
        percentage: 0,
        elapsedMs: Math.round(performance.now() - startTime),
        estimatedRemainingMs: 0,
        status: 'error',
      });
      throw e;
    } finally {
      this.encoding = false;
    }
  }
}

/**
 * Error thrown when export is cancelled via cancel().
 */
export class ExportCancelledError extends Error {
  readonly framesEncoded: number;

  constructor(framesEncoded: number) {
    super(`Export cancelled after ${framesEncoded} frames`);
    this.name = 'ExportCancelledError';
    this.framesEncoded = framesEncoded;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yieldToMainThread(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
