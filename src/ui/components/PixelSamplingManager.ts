/**
 * PixelSamplingManager - Manages pixel sampling/probe state and mouse event handlers.
 *
 * Extracted from Viewer.ts to separate the pixel sampling concern from the
 * monolithic Viewer class.
 *
 * The manager owns:
 * - cursorColorCallback (for InfoPanel integration)
 * - Mouse move/leave/click event handlers for pixel probe + cursor color
 * - Throttle timestamp for merged mousemove handler
 * - Cached source image canvas for pixel probe "source" mode
 * - getImageData / getSourceImageData helper methods
 */

import { PixelProbe } from './PixelProbe';
import { Renderer } from '../../render/Renderer';
import { RenderWorkerProxy } from '../../render/RenderWorkerProxy';
import { Session } from '../../core/session/Session';
import { safeCanvasContext2D } from '../../color/ColorProcessingFacade';
import {
  getPixelCoordinates,
  getPixelColor,
} from './ViewerInteraction';
import type { IPImage } from '../../core/image/Image';
import { Logger } from '../../utils/Logger';
import { floatRGBAToImageData } from '../../utils/math';

const log = new Logger('PixelSamplingManager');

// Target resolution for scope analysis during playback (keeps scopes responsive)
const SCOPE_PLAYBACK_WIDTH = 320;
const SCOPE_PLAYBACK_HEIGHT = 180;
// Target resolution for paused mode (higher quality)
const SCOPE_PAUSED_WIDTH = 640;
const SCOPE_PAUSED_HEIGHT = 360;

/**
 * Result of getScopeImageData() for scope consumption.
 * When WebGL rendering is active, floatData contains full-range HDR values.
 * imageData is always provided for SDR fallback paths.
 */
export interface ScopeImageData {
  imageData: ImageData;
  floatData: Float32Array | null;
  width: number;
  height: number;
}

/**
 * Context interface for what PixelSamplingManager needs from the Viewer.
 * The Viewer implements this interface and passes itself as the context.
 */
export interface PixelSamplingContext {
  pixelProbe: PixelProbe;
  getGLRenderer(): Renderer | null;
  getRenderWorkerProxy(): RenderWorkerProxy | null;
  isAsyncRenderer(): boolean;
  isHDRRenderActive(): boolean;
  isSDRWebGLRenderActive(): boolean;
  getLastHDRBlitFrame?(): { data: Float32Array; width: number; height: number } | null;
  getImageCanvas(): HTMLCanvasElement;
  getImageCtx(): CanvasRenderingContext2D;
  getSession(): Session;
  getDisplayDimensions(): { width: number; height: number };
  getCanvasColorSpace(): 'display-p3' | undefined;
  getImageCanvasRect(): DOMRect;
  isViewerContentElement(element: HTMLElement): boolean;
  drawWithTransform(ctx: CanvasRenderingContext2D, element: CanvasImageSource, displayWidth: number, displayHeight: number): void;
  getLastRenderedImage(): IPImage | null;
  isPlaying(): boolean;
}

export class PixelSamplingManager {
  // Cursor color callback for InfoPanel
  private cursorColorCallback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null = null;

  // Shared throttle timestamp for merged mousemove handler (probe + cursor color)
  private lastMouseMoveUpdate = 0;

  // Cached source image canvas for pixel probe "source" mode
  // Reused to avoid creating new canvases on every mouse move
  private sourceImageCanvas: HTMLCanvasElement | null = null;
  private sourceImageCtx: CanvasRenderingContext2D | null = null;

  private context: PixelSamplingContext;

  constructor(context: PixelSamplingContext) {
    this.context = context;
  }

  /**
   * Merged mousemove handler for both pixel probe and cursor color consumers.
   * Calls getBoundingClientRect() and getImageData() at most once per event,
   * then dispatches results to both consumers as needed.
   * Throttled to ~60fps (16ms) for performance.
   */
  onMouseMoveForPixelSampling = (e: MouseEvent): void => {
    const probeEnabled = this.context.pixelProbe.isEnabled();
    const cursorColorEnabled = !!this.cursorColorCallback;

    // Early exit if neither consumer is active
    if (!probeEnabled && !cursorColorEnabled) return;

    // Single throttle for both consumers
    const now = Date.now();
    if (now - this.lastMouseMoveUpdate < 16) {
      return;
    }
    this.lastMouseMoveUpdate = now;

    const { width: displayWidth, height: displayHeight } = this.context.getDisplayDimensions();

    // Single layout read shared by both consumers (cached per frame)
    const canvasRect = this.context.getImageCanvasRect();

    // Compute canvas-relative pixel coordinates once
    const position = getPixelCoordinates(
      e.clientX,
      e.clientY,
      canvasRect,
      displayWidth,
      displayHeight
    );

    // Handle out-of-bounds
    if (!position) {
      if (cursorColorEnabled) {
        this.cursorColorCallback!(null, null);
      }
      return;
    }

    // HDR/SDR WebGL path: use WebGL readPixelFloat for accurate values
    const glRenderer = this.context.getGLRenderer();
    if ((this.context.isHDRRenderActive() || this.context.isSDRWebGLRenderActive()) && glRenderer) {
      const sampleSize = this.context.pixelProbe.getSampleSize();

      // HDR blit paths render into offscreen float buffers and may keep the GL
      // display canvas hidden. Sample from the latest blit float frame so picker
      // values match what is actually displayed.
      if (this.context.isHDRRenderActive()) {
        const blitFrame = this.context.getLastHDRBlitFrame?.() ?? null;
        if (blitFrame) {
          const sampled = this.sampleFromHDRBlitFrame(
            blitFrame,
            position,
            displayWidth,
            displayHeight,
            sampleSize,
          );
          this.handlePixelProbeData(
            sampled.pixels,
            position,
            sampled.width,
            sampled.height,
            probeEnabled,
            cursorColorEnabled,
            e,
          );
          return;
        }
      }

      // Scale coordinates by DPR since the GL canvas is at physical resolution
      const dpr = window.devicePixelRatio || 1;
      const physicalX = Math.round(position.x * dpr);
      const physicalY = Math.round(position.y * dpr);
      const physicalDisplayW = Math.round(displayWidth * dpr);
      const physicalDisplayH = Math.round(displayHeight * dpr);

      const halfSize = Math.floor(sampleSize / 2);
      const rx = Math.max(0, physicalX - halfSize);
      const ry = Math.max(0, physicalY - halfSize);
      const rw = Math.min(sampleSize, physicalDisplayW - rx);
      const rh = Math.min(sampleSize, physicalDisplayH - ry);

      // Phase 4: Use async readback when worker renderer is active
      const renderWorkerProxy = this.context.getRenderWorkerProxy();
      if (this.context.isAsyncRenderer() && renderWorkerProxy) {
        renderWorkerProxy.readPixelFloatAsync(rx, ry, rw, rh).then((pixels) => {
          this.handlePixelProbeData(pixels, position, rw, rh, probeEnabled, cursorColorEnabled, e);
        }).catch((err) => {
          log.debug('Async pixel readback failed', err);
        });
        if (probeEnabled) {
          this.context.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
        }
        return;
      }

      const pixels = glRenderer.readPixelFloat(rx, ry, rw, rh);
      this.handlePixelProbeData(pixels, position, rw, rh, probeEnabled, cursorColorEnabled, e);
      return;
    }

    // SDR path: read from 2D canvas
    const imageData = this.getImageData();

    // Dispatch to probe consumer
    if (probeEnabled && imageData) {
      // Get source image data (before color pipeline) for source mode
      // Only fetch if source mode is selected to save performance
      if (this.context.pixelProbe.getSourceMode() === 'source') {
        const sourceImageData = this.getSourceImageData();
        this.context.pixelProbe.setSourceImageData(sourceImageData);
      } else {
        this.context.pixelProbe.setSourceImageData(null);
      }

      this.context.pixelProbe.updateFromCanvas(
        position.x, position.y, imageData,
        displayWidth, displayHeight
      );
      this.context.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
    }

    // Dispatch to cursor color consumer
    if (cursorColorEnabled) {
      if (!imageData) {
        this.cursorColorCallback!(null, null);
        return;
      }
      const color = getPixelColor(imageData, position.x, position.y);
      if (!color) {
        this.cursorColorCallback!(null, null);
      } else {
        this.cursorColorCallback!(color, position);
      }
    }
  };

  /**
   * Sample a pixel block from the latest HDR blit float frame.
   * Input frame data is in WebGL row order (bottom-to-top); this converts to
   * top-to-bottom block order so picker center/averaging match screen space.
   */
  private sampleFromHDRBlitFrame(
    frame: { data: Float32Array; width: number; height: number },
    position: { x: number; y: number },
    displayWidth: number,
    displayHeight: number,
    sampleSize: number,
  ): { pixels: Float32Array | null; width: number; height: number } {
    const { data, width, height } = frame;
    if (width <= 0 || height <= 0 || data.length < width * height * 4) {
      return { pixels: null, width: 0, height: 0 };
    }
    if (displayWidth <= 0 || displayHeight <= 0) {
      return { pixels: null, width: 0, height: 0 };
    }

    const fx = Math.max(0, Math.min(width - 1, Math.round((position.x / displayWidth) * width)));
    const fyTop = Math.max(0, Math.min(height - 1, Math.round((position.y / displayHeight) * height)));

    const halfSize = Math.floor(sampleSize / 2);
    const rx = Math.max(0, fx - halfSize);
    const ryTop = Math.max(0, fyTop - halfSize);
    const rw = Math.min(sampleSize, width - rx);
    const rh = Math.min(sampleSize, height - ryTop);

    const out = new Float32Array(rw * rh * 4);
    const rowStride = rw * 4;

    for (let row = 0; row < rh; row++) {
      const yTop = ryTop + row;
      const srcY = height - 1 - yTop; // convert top-space to WebGL row order
      const srcStart = (srcY * width + rx) * 4;
      out.set(data.subarray(srcStart, srcStart + rowStride), row * rowStride);
    }

    return { pixels: out, width: rw, height: rh };
  }

  /**
   * Handle mouse leave - clear cursor color
   */
  onMouseLeaveForCursorColor = (): void => {
    if (this.cursorColorCallback) {
      this.cursorColorCallback(null, null);
    }
  };

  /**
   * Process pixel probe data from either sync or async readback.
   * Used by both the sync and async (worker) paths.
   */
  handlePixelProbeData(
    pixels: Float32Array | null,
    position: { x: number; y: number },
    rw: number,
    rh: number,
    probeEnabled: boolean,
    cursorColorEnabled: boolean,
    e: MouseEvent,
  ): void {
    const { width: displayWidth, height: displayHeight } = this.context.getDisplayDimensions();

    if (probeEnabled) {
      if (pixels && pixels.length >= 4) {
        const count = rw * rh;
        let tr = 0, tg = 0, tb = 0, ta = 0;
        for (let i = 0; i < count; i++) {
          tr += pixels[i * 4]!;
          tg += pixels[i * 4 + 1]!;
          tb += pixels[i * 4 + 2]!;
          ta += pixels[i * 4 + 3]!;
        }
        this.context.pixelProbe.updateFromHDRValues(
          position.x, position.y,
          tr / count, tg / count, tb / count, ta / count,
          displayWidth, displayHeight
        );
      }
      this.context.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
    }

    if (cursorColorEnabled) {
      if (pixels && pixels.length >= 4) {
        const centerIdx = (Math.floor(rh / 2) * rw + Math.floor(rw / 2)) * 4;
        const color = {
          r: Math.round(Math.max(0, Math.min(255, pixels[centerIdx]! * 255))),
          g: Math.round(Math.max(0, Math.min(255, pixels[centerIdx + 1]! * 255))),
          b: Math.round(Math.max(0, Math.min(255, pixels[centerIdx + 2]! * 255))),
        };
        this.cursorColorCallback!(color, position);
      } else {
        this.cursorColorCallback!(null, null);
      }
    }
  }

  onClickForProbe = (e: MouseEvent): void => {
    if (!this.context.pixelProbe.isEnabled()) return;

    // Only toggle lock if clicking on the canvas area (not on UI elements)
    const target = e.target as HTMLElement;
    if (this.context.isViewerContentElement(target)) {
      this.context.pixelProbe.toggleLock();
    }
  };

  /**
   * Get ImageData from the current canvas for histogram analysis
   */
  getImageData(): ImageData | null {
    const source = this.context.getSession().currentSource;
    if (!source?.element) return null;

    // Get the displayed dimensions
    const canvas = this.context.getImageCanvas();
    const displayWidth = canvas.width;
    const displayHeight = canvas.height;

    if (displayWidth === 0 || displayHeight === 0) return null;

    return this.context.getImageCtx().getImageData(0, 0, displayWidth, displayHeight);
  }

  /**
   * Get image data optimized for scope consumption (histogram, waveform, vectorscope).
   *
   * When WebGL rendering is active (HDR or SDR), renders the current image at
   * reduced scope resolution via the Renderer's RGBA16F FBO, producing float data
   * that preserves HDR values > 1.0. Also converts to ImageData for SDR fallback.
   *
   * When 2D canvas rendering is active, returns getImageData() with floatData: null.
   */
  getScopeImageData(): ScopeImageData | null {
    const glRenderer = this.context.getGLRenderer();
    const isWebGLActive = this.context.isHDRRenderActive() || this.context.isSDRWebGLRenderActive();

    if (isWebGLActive && glRenderer) {
      const image = this.context.getLastRenderedImage();
      if (!image) return null;

      // Choose scope resolution based on playback state
      const isPlaying = this.context.isPlaying();
      const targetWidth = isPlaying ? SCOPE_PLAYBACK_WIDTH : SCOPE_PAUSED_WIDTH;
      const targetHeight = isPlaying ? SCOPE_PLAYBACK_HEIGHT : SCOPE_PAUSED_HEIGHT;

      const result = glRenderer.renderForScopes(image, targetWidth, targetHeight);
      if (!result) {
        // WebGL scope readback failed (e.g. EXT_color_buffer_float unavailable).
        // Fall through to 2D canvas path below.
        const imageData = this.getImageData();
        if (!imageData) return null;
        return { imageData, floatData: null, width: imageData.width, height: imageData.height };
      }

      // Convert float data to ImageData for SDR scope fallback paths
      const { data: floatData, width, height } = result;
      const imageData = floatRGBAToImageData(floatData, width, height);

      return { imageData, floatData, width, height };
    }

    // 2D canvas path: read from the existing canvas context
    const imageData = this.getImageData();
    if (!imageData) return null;

    return {
      imageData,
      floatData: null,
      width: imageData.width,
      height: imageData.height,
    };
  }

  /**
   * Get source ImageData before color pipeline (for pixel probe "source" mode)
   * Returns ImageData of the original source scaled to display dimensions
   * Uses a cached canvas to avoid creating new canvases on every mouse move
   */
  getSourceImageData(): ImageData | null {
    const session = this.context.getSession();
    const source = session.currentSource;
    if (!source) return null;

    // Get the displayed dimensions
    const canvas = this.context.getImageCanvas();
    const displayWidth = canvas.width;
    const displayHeight = canvas.height;

    if (displayWidth === 0 || displayHeight === 0) return null;

    // Get the source element
    let element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | undefined;
    if (source.type === 'sequence') {
      element = session.getSequenceFrameSync() ?? source.element;
    } else if (source.type === 'video' && session.isUsingMediabunny()) {
      const frameCanvas = session.getVideoFrameCanvas(session.currentFrame);
      element = frameCanvas ?? source.element;
    } else if (source.fileSourceNode) {
      element = source.fileSourceNode.getCanvas() ?? undefined;
    } else {
      element = source.element;
    }

    if (!element) return null;

    // Reuse cached canvas or create new one if dimensions changed
    if (!this.sourceImageCanvas || !this.sourceImageCtx ||
        this.sourceImageCanvas.width !== displayWidth ||
        this.sourceImageCanvas.height !== displayHeight) {
      this.sourceImageCanvas = document.createElement('canvas');
      this.sourceImageCanvas.width = displayWidth;
      this.sourceImageCanvas.height = displayHeight;
      this.sourceImageCtx = safeCanvasContext2D(this.sourceImageCanvas, { willReadFrequently: true }, this.context.getCanvasColorSpace());
    }

    if (!this.sourceImageCtx) return null;

    // Clear and draw source with transform but without color pipeline
    this.sourceImageCtx.clearRect(0, 0, displayWidth, displayHeight);
    this.sourceImageCtx.imageSmoothingEnabled = true;
    this.sourceImageCtx.imageSmoothingQuality = 'high';

    try {
      // Apply geometric transform only
      this.context.drawWithTransform(this.sourceImageCtx, element as CanvasImageSource, displayWidth, displayHeight);
      return this.sourceImageCtx.getImageData(0, 0, displayWidth, displayHeight);
    } catch {
      // Handle potential CORS issues
      return null;
    }
  }

  /**
   * Register a callback for cursor color updates (for InfoPanel integration)
   * The callback is called with the RGB color and position when the mouse moves over the canvas.
   * When the mouse leaves the canvas or is outside bounds, null values are passed.
   * @param callback The callback function, or null to unregister
   */
  onCursorColorChange(callback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null): void {
    this.cursorColorCallback = callback;
  }

  /**
   * Cleanup cached resources. Called from Viewer.dispose().
   */
  dispose(): void {
    this.cursorColorCallback = null;
    this.sourceImageCanvas = null;
    this.sourceImageCtx = null;
  }
}
