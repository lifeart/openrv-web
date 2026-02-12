/**
 * HDRFrameResizer - Resize HDR VideoFrames using an OffscreenCanvas with
 * float16 backing store, preserving HDR color data.
 *
 * Supports two tiers:
 * - Tier 1 (rec2100): Uses rec2100-hlg/pq color space on the canvas.
 *   Preserves exact HDR signal — no EOTF or primaries conversion.
 *   Requires experimental Chrome flag.
 * - Tier 2 (display-p3-float16): Uses display-p3 + float16. The browser
 *   converts HLG/PQ → display-p3 linear during drawImage. Extended-range
 *   values (>1.0) are preserved in the float16 backing store. Minor gamut
 *   compression from BT.2020 → P3. Stable from Chrome 137+.
 *
 * When resize is not possible (tier='none', target >= source, or error),
 * the original VideoFrame is returned unchanged.
 */

import type { TransferFunction, ColorPrimaries } from '../../core/image/Image';
import { Logger } from '../Logger';

const log = new Logger('HDRFrameResizer');

/** Result of an HDR resize operation. */
export interface HDRResizeResult {
  /** Resized VideoFrame (or original if resize was skipped/failed). */
  videoFrame: VideoFrame;
  /** True if resize was actually performed. */
  resized: boolean;
  /** Width of the returned VideoFrame. */
  width: number;
  /** Height of the returned VideoFrame. */
  height: number;
  /**
   * When tier 2 is used, the browser applies EOTF + primaries conversion
   * during drawImage. The shader must be told the data is now in a
   * different color space. Undefined when tier 1 is used (no conversion).
   */
  metadataOverrides?: {
    transferFunction: TransferFunction;
    colorPrimaries: ColorPrimaries;
  };
}

export type HDRResizeTier = 'rec2100' | 'display-p3-float16' | 'none';

/**
 * Float16 context options to try, in order.
 * Chrome <133 uses pixelFormat, Chrome 133+ uses colorType.
 */
const FLOAT16_OPTIONS: ReadonlyArray<Record<string, string>> = [
  { colorType: 'float16' },
  { pixelFormat: 'float16' },
];

export class HDRFrameResizer {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private canvasW = 0;
  private canvasH = 0;
  private canvasColorSpace: string | null = null;
  private validated = false;
  /** Which float16 option name worked during context creation */
  private float16Opt: Record<string, string> | null = null;

  constructor(private readonly tier: HDRResizeTier) {}

  /**
   * The active resize tier.
   */
  getTier(): HDRResizeTier {
    return this.tier;
  }

  /**
   * Resize a VideoFrame to the target dimensions.
   *
   * On success, the ORIGINAL VideoFrame is closed by this method.
   * The caller receives ownership of the returned (resized) VideoFrame.
   *
   * If resize is skipped or fails, the original VideoFrame is returned
   * unchanged (not closed).
   */
  resize(
    videoFrame: VideoFrame,
    targetSize: { w: number; h: number },
    sourceColorSpace?: { transfer?: string | null; primaries?: string | null },
  ): HDRResizeResult {
    const srcW = videoFrame.displayWidth;
    const srcH = videoFrame.displayHeight;

    // Skip if tier is none or target is not smaller than source
    if (
      this.tier === 'none' ||
      (targetSize.w >= srcW && targetSize.h >= srcH)
    ) {
      return { videoFrame, resized: false, width: srcW, height: srcH };
    }

    try {
      this.ensureCanvas(targetSize.w, targetSize.h, sourceColorSpace);
      if (!this.ctx) {
        return { videoFrame, resized: false, width: srcW, height: srcH };
      }

      // GPU-accelerated resize via drawImage
      this.ctx.drawImage(videoFrame, 0, 0, targetSize.w, targetSize.h);

      // Create resized VideoFrame from canvas content
      const resized = new VideoFrame(this.canvas!, {
        timestamp: videoFrame.timestamp,
      });

      // Release original — caller owns the resized frame
      videoFrame.close();

      const metadataOverrides = this.tier === 'display-p3-float16'
        ? { transferFunction: 'srgb' as TransferFunction, colorPrimaries: 'bt709' as ColorPrimaries }
        : undefined;

      return {
        videoFrame: resized,
        resized: true,
        width: targetSize.w,
        height: targetSize.h,
        metadataOverrides,
      };
    } catch (e) {
      log.warn('HDR resize failed, returning original frame:', e);
      return { videoFrame, resized: false, width: srcW, height: srcH };
    }
  }

  /**
   * Ensure the internal OffscreenCanvas exists and matches the target dims.
   * Re-creates the context when dimensions or color space change.
   */
  private ensureCanvas(
    w: number,
    h: number,
    sourceColorSpace?: { transfer?: string | null; primaries?: string | null },
  ): void {
    const colorSpace = this.resolveCanvasColorSpace(sourceColorSpace);

    if (
      this.canvas &&
      this.canvasW === w &&
      this.canvasH === h &&
      this.canvasColorSpace === colorSpace &&
      this.ctx
    ) {
      return; // reuse existing
    }

    // Create or resize canvas
    if (!this.canvas) {
      this.canvas = new OffscreenCanvas(w, h);
    } else {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvasW = w;
    this.canvasH = h;
    this.canvasColorSpace = colorSpace;

    // Acquire context with HDR settings.
    // Setting canvas dimensions invalidates the context, so we must re-acquire.
    // Try both colorType (Chrome 133+) and pixelFormat (older Chrome) property names.
    this.ctx = null;
    const optsToTry = this.float16Opt ? [this.float16Opt] : FLOAT16_OPTIONS;
    for (const opt of optsToTry) {
      try {
        this.ctx = this.canvas.getContext('2d', {
          colorSpace,
          ...opt,
        } as unknown as CanvasRenderingContext2DSettings) as OffscreenCanvasRenderingContext2D | null;
        if (this.ctx) {
          this.float16Opt = opt; // remember which worked
          break;
        }
      } catch { /* try next */ }
    }

    if (!this.ctx && !this.validated) {
      log.warn(`Failed to create ${colorSpace} + float16 OffscreenCanvas context`);
      this.validated = true;
    }
  }

  /**
   * Determine the canvas color space based on tier and source color space.
   */
  private resolveCanvasColorSpace(
    sourceColorSpace?: { transfer?: string | null; primaries?: string | null },
  ): string {
    if (this.tier === 'rec2100') {
      // Match the source transfer function for zero-conversion resize
      const transfer = sourceColorSpace?.transfer;
      if (transfer === 'smpte2084') return 'rec2100-pq';
      return 'rec2100-hlg'; // default for HLG and unknown
    }
    // Tier 2: always display-p3
    return 'display-p3';
  }

  /**
   * Release internal canvas resources.
   */
  dispose(): void {
    this.ctx = null;
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.canvas = null;
    }
    this.canvasW = 0;
    this.canvasH = 0;
    this.canvasColorSpace = null;
  }
}
