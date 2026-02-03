/**
 * FrameInterpolator - Sub-frame interpolation for slow-motion playback.
 *
 * When playing at speeds less than 1x, the playback position falls between
 * integer frames. This utility blends two adjacent frames using simple
 * alpha (linear) blending to produce smoother slow-motion output.
 *
 * The blending is pixel-by-pixel: each channel value is linearly
 * interpolated between frameA and frameB based on the given ratio.
 *
 * This is intentionally simple -- no optical flow or motion estimation.
 */

/**
 * Result of a sub-frame blend operation.
 */
export interface BlendResult {
  /** The blended pixel data */
  imageData: ImageData;
  /** The ratio used for blending (0 = frame A, 1 = frame B) */
  ratio: number;
}

/**
 * Sub-frame position information emitted by Session during slow-motion.
 */
export interface SubFramePosition {
  /** The base (floor) frame number */
  baseFrame: number;
  /** The next frame number */
  nextFrame: number;
  /** Fractional position between base and next (0.0 - 1.0) */
  ratio: number;
}

/**
 * Blend two ImageData arrays at a given ratio using linear interpolation.
 *
 * @param frameA - The first frame's pixel data (shown when ratio = 0)
 * @param frameB - The second frame's pixel data (shown when ratio = 1)
 * @param ratio - Blend ratio in range [0, 1]. 0 = 100% frameA, 1 = 100% frameB.
 * @returns A new ImageData containing the blended result, or null if inputs are invalid.
 */
export function blendFrames(
  frameA: ImageData,
  frameB: ImageData,
  ratio: number
): ImageData | null {
  // Validate inputs
  if (!frameA || !frameB) {
    return null;
  }

  if (frameA.width !== frameB.width || frameA.height !== frameB.height) {
    return null;
  }

  // Clamp ratio to [0, 1]
  const t = Math.max(0, Math.min(1, ratio));

  // Fast path: no blending needed
  if (t === 0) {
    return new ImageData(
      new Uint8ClampedArray(frameA.data),
      frameA.width,
      frameA.height
    );
  }
  if (t === 1) {
    return new ImageData(
      new Uint8ClampedArray(frameB.data),
      frameB.width,
      frameB.height
    );
  }

  const length = frameA.data.length;
  const result = new Uint8ClampedArray(length);
  const dataA = frameA.data;
  const dataB = frameB.data;

  // Precompute inverse ratio
  const invT = 1 - t;

  // Linear interpolation per channel (RGBA)
  // Process 4 channels at a time for better cache locality
  for (let i = 0; i < length; i += 4) {
    result[i] = (dataA[i]! * invT + dataB[i]! * t + 0.5) | 0;       // R
    result[i + 1] = (dataA[i + 1]! * invT + dataB[i + 1]! * t + 0.5) | 0; // G
    result[i + 2] = (dataA[i + 2]! * invT + dataB[i + 2]! * t + 0.5) | 0; // B
    result[i + 3] = (dataA[i + 3]! * invT + dataB[i + 3]! * t + 0.5) | 0; // A
  }

  return new ImageData(result, frameA.width, frameA.height);
}

/**
 * Blend two canvas sources into a destination ImageData.
 *
 * This is a convenience method that extracts ImageData from canvas elements
 * and blends them. Useful when working directly with cached frame canvases
 * from the mediabunny frame extractor.
 *
 * @param canvasA - First frame canvas (shown when ratio = 0)
 * @param canvasB - Second frame canvas (shown when ratio = 1)
 * @param ratio - Blend ratio [0, 1]
 * @returns Blended ImageData, or null if extraction or blending fails.
 */
export function blendCanvasFrames(
  canvasA: HTMLCanvasElement | OffscreenCanvas,
  canvasB: HTMLCanvasElement | OffscreenCanvas,
  ratio: number
): ImageData | null {
  try {
    const ctxA = getCanvasContext(canvasA);
    const ctxB = getCanvasContext(canvasB);
    if (!ctxA || !ctxB) return null;

    const w = canvasA.width;
    const h = canvasA.height;

    if (w !== canvasB.width || h !== canvasB.height) return null;
    if (w === 0 || h === 0) return null;

    const dataA = ctxA.getImageData(0, 0, w, h);
    const dataB = ctxB.getImageData(0, 0, w, h);

    return blendFrames(dataA, dataB, ratio);
  } catch {
    return null;
  }
}

/**
 * Get a 2D rendering context from either an HTMLCanvasElement or OffscreenCanvas.
 */
function getCanvasContext(
  canvas: HTMLCanvasElement | OffscreenCanvas
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (canvas instanceof HTMLCanvasElement) {
    return canvas.getContext('2d');
  }
  // OffscreenCanvas
  return canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
}

/**
 * FrameInterpolator manages sub-frame blending state and caching
 * for integration with the Viewer rendering pipeline.
 */
export class FrameInterpolator {
  private _enabled = false;
  private _lastBlendCanvas: HTMLCanvasElement | null = null;
  private _lastPosition: SubFramePosition | null = null;

  /**
   * Whether sub-frame interpolation is enabled.
   * Default: false (users who want exact frames keep this off).
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    if (!value) {
      this.clearCache();
    }
  }

  /**
   * Get the last computed sub-frame position.
   */
  get lastPosition(): SubFramePosition | null {
    return this._lastPosition;
  }

  /**
   * Compute a blended frame from two canvas sources and cache the result.
   *
   * Returns an HTMLCanvasElement that can be drawn directly by the Viewer,
   * or null if blending is not possible (disabled, invalid inputs, etc).
   *
   * @param canvasA - Base frame canvas
   * @param canvasB - Next frame canvas
   * @param position - Sub-frame position information
   */
  getBlendedFrame(
    canvasA: HTMLCanvasElement | OffscreenCanvas,
    canvasB: HTMLCanvasElement | OffscreenCanvas,
    position: SubFramePosition
  ): HTMLCanvasElement | null {
    if (!this._enabled) return null;

    // Skip blending when ratio is at frame boundary
    if (position.ratio <= 0 || position.ratio >= 1) return null;

    // Check if we can reuse the cached result
    if (
      this._lastPosition &&
      this._lastPosition.baseFrame === position.baseFrame &&
      this._lastPosition.nextFrame === position.nextFrame &&
      Math.abs(this._lastPosition.ratio - position.ratio) < 0.001 &&
      this._lastBlendCanvas
    ) {
      return this._lastBlendCanvas;
    }

    const blended = blendCanvasFrames(canvasA, canvasB, position.ratio);
    if (!blended) return null;

    // Create or reuse the output canvas
    if (
      !this._lastBlendCanvas ||
      this._lastBlendCanvas.width !== blended.width ||
      this._lastBlendCanvas.height !== blended.height
    ) {
      this._lastBlendCanvas = document.createElement('canvas');
      this._lastBlendCanvas.width = blended.width;
      this._lastBlendCanvas.height = blended.height;
    }

    const ctx = this._lastBlendCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.putImageData(blended, 0, 0);
    this._lastPosition = { ...position };

    return this._lastBlendCanvas;
  }

  /**
   * Clear cached blend data.
   */
  clearCache(): void {
    this._lastBlendCanvas = null;
    this._lastPosition = null;
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.clearCache();
  }
}
