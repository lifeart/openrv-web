/**
 * Canvas2DHDRBlit - Canvas 2D API HDR display output via putImageData
 *
 * Last-resort HDR fallback when both WebGL2 native HDR and WebGPU are
 * unavailable. Uses the Canvas 2D API with HDR color spaces and float16
 * pixel storage to display values > 1.0 (brighter than SDR white).
 *
 * Architecture:
 *   WebGL2 Renderer (full effects pipeline) renders to RGBA16F FBO
 *   → gl.readPixels(FLOAT) → Float32Array (bottom-to-top row order)
 *   → Canvas 2D putImageData with float32 ImageData
 *   → HDR display (values > 1.0 = brighter than SDR white)
 *
 * Initialization tries contexts in order:
 *   1. srgb-linear + float16 (colorType, Chrome 137+)
 *   2. srgb-linear + float16 (pixelFormat, Chrome <137 legacy)
 *   3. rec2100-hlg + float16 (colorType)
 *   4. rec2100-hlg + float16 (pixelFormat)
 *
 * The W3C spec allows ImageData with storageFormat: 'float32' on float16
 * canvases. The browser handles float32→float16 conversion automatically
 * on putImageData. No manual float16 conversion is needed.
 */

import { Logger } from '../utils/Logger';

const log = new Logger('Canvas2DHDRBlit');

export class Canvas2DHDRBlit {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private _initialized = false;
  private _colorSpace: string = 'srgb-linear';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.testid = 'viewer-canvas2d-blit-canvas';
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;display:none;';
  }

  /** The HTMLCanvasElement used for Canvas2D HDR output. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Whether initialize() has completed successfully. */
  get initialized(): boolean {
    return this._initialized;
  }

  /** The color space of the initialized canvas context. */
  get colorSpace(): string {
    return this._colorSpace;
  }

  /**
   * Synchronous initialization: tries canvas 2D contexts with HDR settings.
   * Throws if no HDR-capable Canvas 2D context can be created.
   *
   * Each attempt uses a fresh canvas because once getContext('2d') succeeds
   * on a canvas, subsequent calls return the SAME context with the original
   * settings — making the fallback chain ineffective on a single canvas.
   */
  initialize(): void {
    if (this._initialized) return;

    // Try each combination in priority order
    const attempts: Array<{ colorSpace: string; settings: Record<string, unknown> }> = [
      // 1. srgb-linear + colorType (Chrome 137+)
      { colorSpace: 'srgb-linear', settings: { colorSpace: 'srgb-linear', colorType: 'float16' } },
      // 2. srgb-linear + pixelFormat (Chrome <137 legacy)
      { colorSpace: 'srgb-linear', settings: { colorSpace: 'srgb-linear', pixelFormat: 'float16' } },
      // 3. rec2100-hlg + colorType
      { colorSpace: 'rec2100-hlg', settings: { colorSpace: 'rec2100-hlg', colorType: 'float16' } },
      // 4. rec2100-hlg + pixelFormat (legacy)
      { colorSpace: 'rec2100-hlg', settings: { colorSpace: 'rec2100-hlg', pixelFormat: 'float16' } },
    ];

    for (const attempt of attempts) {
      try {
        // Use a fresh canvas for each attempt because getContext('2d') on the
        // same canvas always returns the same context with its original settings.
        const testCanvas = document.createElement('canvas');
        const ctx = testCanvas.getContext(
          '2d',
          attempt.settings as unknown as CanvasRenderingContext2DSettings
        );
        if (!ctx) continue;

        // Configure HDR extended range if available
        if (typeof testCanvas.configureHighDynamicRange === 'function') {
          testCanvas.configureHighDynamicRange({ mode: 'extended' });
        }

        // Validate: try creating a 1x1 float32 ImageData
        try {
          new ImageData(1, 1, {
            colorSpace: attempt.colorSpace as PredefinedColorSpace,
            storageFormat: 'float32',
          } as ImageDataSettings);
        } catch {
          // float32 ImageData not supported with this color space
          continue;
        }

        // Success: adopt the working canvas, replacing the placeholder
        const oldCanvas = this.canvas;
        testCanvas.dataset.testid = oldCanvas.dataset.testid;
        testCanvas.style.cssText = oldCanvas.style.cssText;
        if (oldCanvas.parentNode) {
          oldCanvas.parentNode.replaceChild(testCanvas, oldCanvas);
        }
        this.canvas = testCanvas;
        this.ctx = ctx;
        this._colorSpace = attempt.colorSpace;
        this._initialized = true;
        log.info(`Canvas2D HDR blit initialized (colorSpace: ${attempt.colorSpace})`);
        return;
      } catch {
        // This combination not supported, try next
        continue;
      }
    }

    throw new Error('Canvas2D HDR not available: no float16 context could be created');
  }

  /**
   * Upload float pixel data and display it on the HDR canvas.
   *
   * @param pixels - RGBA Float32Array from gl.readPixels (bottom-to-top row order)
   * @param width  - Image width in pixels
   * @param height - Image height in pixels
   */
  uploadAndDisplay(pixels: Float32Array, width: number, height: number): void {
    if (!this._initialized || !this.ctx) {
      return;
    }

    // Guard against zero or negative dimensions (ImageData requires positive values)
    if (width <= 0 || height <= 0) {
      return;
    }

    // Validate pixel array length
    const expectedLength = width * height * 4;
    if (pixels.length < expectedLength) {
      log.warn(`Pixel array too small: got ${pixels.length}, expected ${expectedLength}`);
      return;
    }

    // Resize canvas if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Create float32 ImageData with the canvas color space
    const imageData = new ImageData(width, height, {
      colorSpace: this._colorSpace as PredefinedColorSpace,
      storageFormat: 'float32',
    } as ImageDataSettings);

    // Copy pixels with row flip (WebGL bottom-to-top → Canvas2D top-to-bottom)
    const dst = imageData.data as unknown as Float32Array;
    const rowStride = width * 4;

    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * rowStride;
      dst.set(pixels.subarray(srcRow, srcRow + rowStride), y * rowStride);
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Release resources and remove the canvas from the DOM.
   */
  dispose(): void {
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.ctx = null;
    this._initialized = false;
    this._colorSpace = 'srgb-linear';
  }
}
