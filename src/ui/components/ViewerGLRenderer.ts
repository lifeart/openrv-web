/**
 * ViewerGLRenderer - Manages all WebGL/HDR rendering for the Viewer.
 *
 * Extracted from Viewer.ts to separate the WebGL rendering concern (GL canvas,
 * Renderer lifecycle, HDR/SDR WebGL render paths, RenderState construction,
 * GPU/CPU effect detection) from the monolithic Viewer class.
 *
 * The manager owns the GL canvas, Renderer instance, and worker proxy.
 * It does NOT own the 2D canvas, session, or color pipeline — those are
 * accessed via the GLRendererContext interface.
 */

import { Renderer } from '../../render/Renderer';
import { RenderWorkerProxy } from '../../render/RenderWorkerProxy';
import { WebGPUHDRBlit } from '../../render/WebGPUHDRBlit';
import type { RenderState } from '../../render/RenderState';
import type { IPImage } from '../../core/image/Image';
import {
  type DisplayCapabilities,
  isDefaultCDL,
  isDefaultCurves,
  buildAllCurveLUTs,
  isDisplayStateActive,
  DISPLAY_TRANSFER_CODES,
  isIdentityHueRotation,
} from '../../color/ColorProcessingFacade';
import type { Session } from '../../core/session/Session';
import type { ColorPipelineManager } from './ColorPipelineManager';
import type { TransformManager } from './TransformManager';
import type { FilterSettings } from './FilterControl';
import type { ChannelMode } from './ChannelSelect';
import type { BackgroundPatternState } from './BackgroundPatternControl';
import type { ColorWheels } from './ColorWheels';
import type { FalseColor } from './FalseColor';
import type { ZebraStripes } from './ZebraStripes';
import type { HSLQualifier } from './HSLQualifier';
import type { ColorAdjustments } from './ColorControls';
import type { ToneMappingState } from './ToneMappingControl';

/**
 * Context interface for the ViewerGLRenderer to access Viewer state
 * without tight coupling. The Viewer implements this interface.
 */
export interface GLRendererContext {
  getCanvasContainer(): HTMLElement;
  getImageCanvas(): HTMLCanvasElement;
  getColorPipeline(): ColorPipelineManager;
  getTransformManager(): TransformManager;
  getFilterSettings(): FilterSettings;
  getChannelMode(): ChannelMode;
  getBackgroundPatternState(): BackgroundPatternState;
  getColorWheels(): ColorWheels;
  getFalseColor(): FalseColor;
  getZebraStripes(): ZebraStripes;
  getHSLQualifier(): HSLQualifier;
  getSession(): Session;
  applyColorFilters(): void;
  scheduleRender(): void;
  isToneMappingEnabled(): boolean;
}

export class ViewerGLRenderer {
  // WebGL canvas and renderer
  private _glCanvas: HTMLCanvasElement | null = null;
  private _glRenderer: Renderer | null = null;
  private _hdrRenderActive = false;
  private _sdrWebGLRenderActive = false;

  // Phase 4: OffscreenCanvas worker proxy
  private _renderWorkerProxy: RenderWorkerProxy | null = null;
  private _isAsyncRenderer = false;

  // Display capabilities for wide color gamut / HDR support
  private _capabilities: DisplayCapabilities | undefined;

  // WebGPU HDR blit (hybrid path: WebGL2 FBO → readPixels → WebGPU HDR canvas)
  private _webgpuBlit: WebGPUHDRBlit | null = null;
  private _webgpuBlitInitializing = false;
  private _webgpuBlitFailed = false;

  // Last known logical (CSS) dimensions — set by resizeIfActive() to avoid
  // rounding drift when computing CSS size from physical / DPR.
  private _logicalWidth = 0;
  private _logicalHeight = 0;

  private ctx: GLRendererContext;

  get glCanvas(): HTMLCanvasElement | null { return this._glCanvas; }
  get glRenderer(): Renderer | null { return this._glRenderer; }
  get hdrRenderActive(): boolean { return this._hdrRenderActive; }
  get sdrWebGLRenderActive(): boolean { return this._sdrWebGLRenderActive; }
  get renderWorkerProxy(): RenderWorkerProxy | null { return this._renderWorkerProxy; }
  get isAsyncRenderer(): boolean { return this._isAsyncRenderer; }
  get capabilities(): DisplayCapabilities | undefined { return this._capabilities; }
  /** True when the WebGPU HDR blit module is initialized and ready to display. */
  get isWebGPUBlitReady(): boolean { return this._webgpuBlit?.initialized === true; }

  constructor(ctx: GLRendererContext, capabilities?: DisplayCapabilities) {
    this._capabilities = capabilities;
    this.ctx = ctx;
  }

  /**
   * Create the initial GL canvas element and append it to the canvas container.
   * Called once during Viewer construction.
   */
  createGLCanvas(): HTMLCanvasElement {
    this._glCanvas = document.createElement('canvas');
    this._glCanvas.style.cssText = 'position:absolute;top:0;left:0;display:none;';
    return this._glCanvas;
  }

  /**
   * Ensure a GL renderer exists (sync or async worker).
   * Returns the renderer or null if creation fails.
   *
   * When WebGPU HDR blit is ready, skips the worker proxy path and creates a
   * sync main-thread renderer directly. This is needed because
   * renderImageToFloat() (FBO readback) only works on the sync Renderer.
   */
  ensureGLRenderer(): Renderer | null {
    if (this._glRenderer) return this._glRenderer;
    if (!this._glCanvas) return null;

    // Phase 4: Try OffscreenCanvas worker first for main-thread isolation.
    // Only attempt once — if worker proxy already failed, skip directly to sync renderer.
    // Skip worker path when WebGPU HDR blit is ready (blit needs FBO readback via sync Renderer).
    const skipWorker = this._webgpuBlit?.initialized === true;
    if (!skipWorker && !this._renderWorkerProxy && !this._isAsyncRenderer) {
      try {
        if (typeof OffscreenCanvas !== 'undefined' &&
            'transferControlToOffscreen' in this._glCanvas &&
            typeof Worker !== 'undefined') {
          const proxy = new RenderWorkerProxy();
          proxy.initialize(this._glCanvas, this._capabilities);
          // initAsync runs in background — the proxy buffers messages until ready
          proxy.initAsync().then(() => {
            console.log(`[Viewer] Render worker initialized, HDR output: ${proxy.getHDROutputMode()}`);
          }).catch((err) => {
            console.warn('[Viewer] Render worker init failed, falling back to sync:', err);
            this.fallbackToSyncRenderer();
          });

          // Set up context loss/restore callbacks
          proxy.setOnContextLost(() => {
            console.warn('[Viewer] Worker WebGL context lost');
            if (this._hdrRenderActive) {
              this.deactivateHDRMode();
            }
            if (this._sdrWebGLRenderActive) {
              this.deactivateSDRWebGLMode();
            }
          });
          proxy.setOnContextRestored(() => {
            console.log('[Viewer] Worker WebGL context restored');
          });

          this._renderWorkerProxy = proxy;
          this._isAsyncRenderer = true;
          // glCanvas has been transferred — we cannot create a sync renderer on it anymore.
          // The proxy acts as the renderer for state setters.
          // For RendererBackend compatibility, create a facade Renderer that delegates.
          // For now, we use the proxy as a "renderer" by wrapping it.
          this._glRenderer = proxy as unknown as Renderer;
          return this._glRenderer;
        }
      } catch (e) {
        console.warn('[Viewer] OffscreenCanvas worker setup failed, using sync renderer:', e);
        // Fall through to sync renderer. Need a fresh canvas since transferControlToOffscreen
        // may have been called (irreversible). Recreate glCanvas.
        this.recreateGLCanvas();
      }
    }

    // Sync renderer fallback (tier 2)
    try {
      const renderer = new Renderer();
      // initialize() sets drawingBufferColorSpace to rec2100-hlg/pq immediately
      // after context creation (before shaders/buffers) when displayHDR is true.
      renderer.initialize(this._glCanvas, this._capabilities);
      const hdrMode = renderer.getHDROutputMode();
      console.log(`[Viewer] WebGL renderer initialized (sync), HDR output: ${hdrMode}`);
      this._glRenderer = renderer;
      return renderer;
    } catch (e) {
      console.warn('[Viewer] WebGL renderer init failed:', e);
      return null;
    }
  }

  /**
   * Fall back from async worker renderer to synchronous main-thread renderer.
   * Used when the worker fails to initialize or crashes.
   */
  fallbackToSyncRenderer(): void {
    console.log('[Viewer] fallbackToSyncRenderer called');
    if (this._renderWorkerProxy) {
      this._renderWorkerProxy.dispose();
      this._renderWorkerProxy = null;
    }
    this._isAsyncRenderer = false;
    this._glRenderer = null;

    // Recreate glCanvas since the original was transferred
    this.recreateGLCanvas();
  }

  /**
   * Recreate the GL canvas element (needed after transferControlToOffscreen fails
   * or worker dies, since the transfer is irreversible).
   */
  recreateGLCanvas(): void {
    if (this._glCanvas && this._glCanvas.parentNode) {
      const parent = this._glCanvas.parentNode;
      const nextSibling = this._glCanvas.nextSibling;
      parent.removeChild(this._glCanvas);
      this._glCanvas = document.createElement('canvas');
      this._glCanvas.style.cssText = 'position:absolute;top:0;left:0;display:none;';
      if (nextSibling) {
        parent.insertBefore(this._glCanvas, nextSibling);
      } else {
        parent.appendChild(this._glCanvas);
      }
    }
  }

  /**
   * Build a RenderState object aggregating all current state for the
   * Renderer. The returned object can be modified (e.g. HDR overrides) before
   * being passed to renderer.applyRenderState().
   */
  buildRenderState(): RenderState {
    const colorPipeline = this.ctx.getColorPipeline();
    const adj = colorPipeline.colorAdjustments;
    const lut = colorPipeline.currentLUT;
    return {
      colorAdjustments: adj,
      colorInversion: colorPipeline.colorInversionEnabled,
      toneMappingState: colorPipeline.toneMappingState,
      backgroundPattern: this.ctx.getBackgroundPatternState(),
      cdl: colorPipeline.cdlValues,
      curvesLUT: isDefaultCurves(colorPipeline.curvesData) ? null : buildAllCurveLUTs(colorPipeline.curvesData),
      colorWheels: this.ctx.getColorWheels().getState(),
      falseColor: { enabled: this.ctx.getFalseColor().isEnabled(), lut: this.ctx.getFalseColor().getColorLUT() },
      zebraStripes: this.ctx.getZebraStripes().getState(),
      channelMode: this.ctx.getChannelMode(),
      lut: lut && colorPipeline.lutIntensity > 0
        ? { data: lut.data, size: lut.size, intensity: colorPipeline.lutIntensity }
        : { data: null, size: 0, intensity: 0 },
      displayColor: {
        transferFunction: DISPLAY_TRANSFER_CODES[colorPipeline.displayColorState.transferFunction],
        displayGamma: colorPipeline.displayColorState.displayGamma,
        displayBrightness: colorPipeline.displayColorState.displayBrightness,
        customGamma: colorPipeline.displayColorState.customGamma,
      },
      highlightsShadows: { highlights: adj.highlights, shadows: adj.shadows, whites: adj.whites, blacks: adj.blacks },
      vibrance: { amount: adj.vibrance, skinProtection: adj.vibranceSkinProtection },
      clarity: adj.clarity,
      sharpen: this.ctx.getFilterSettings().sharpen,
      hslQualifier: this.ctx.getHSLQualifier().getState(),
    };
  }


  /**
   * Render an HDR IPImage through the WebGL shader pipeline.
   * Returns true if rendering succeeded, false if fallback is needed.
   *
   * When the WebGL2 backend has no native HDR output (no HLG/PQ/extended) but
   * WebGPU HDR is available, uses the hybrid blit path:
   *   WebGL2 FBO (RGBA16F) → readPixels(FLOAT) → WebGPU HDR canvas
   */
  renderHDRWithWebGL(
    image: IPImage,
    displayWidth: number,
    displayHeight: number,
  ): boolean {
    const blitReady = this._webgpuBlit?.initialized === true;

    // If the blit is ready but the current renderer is a worker proxy,
    // we must switch to sync. Do this BEFORE ensureGLRenderer().
    if (blitReady && this._isAsyncRenderer && this._glRenderer) {
      this.fallbackToSyncRenderer();
    }

    const renderer = this.ensureGLRenderer();
    if (!renderer || !this._glCanvas) return false;

    const isHDROutput = renderer.getHDROutputMode() !== 'sdr';
    const hasFloatReadback = typeof renderer.renderImageToFloat === 'function';

    // Try WebGPU HDR blit path when WebGL2 has no native HDR output
    if (!isHDROutput && this._webgpuBlit?.initialized && hasFloatReadback) {
      return this.renderHDRWithWebGPUBlit(renderer, image, displayWidth, displayHeight);
    }

    // Standard WebGL2 HDR path (HLG/PQ/extended) or SDR fallback
    // Activate WebGL canvas
    if (!this._hdrRenderActive) {
      this._glCanvas.style.display = 'block';
      this.hideWebGPUBlitCanvas();
      this.ctx.getImageCanvas().style.visibility = 'hidden';
      this._hdrRenderActive = true;
    }

    // Resize canvas buffer if needed. displayWidth/Height may be quality-reduced
    // during interaction (50% of physical) — the browser upscales via CSS sizing.
    if (this._glCanvas.width !== displayWidth || this._glCanvas.height !== displayHeight) {
      renderer.resize(displayWidth, displayHeight);
      // CSS always uses full logical dims (set by resizeIfActive), not reduced render dims
      if (this._glCanvas instanceof HTMLCanvasElement) {
        const dpr = window.devicePixelRatio || 1;
        const cssW = this._logicalWidth || Math.round(displayWidth / dpr);
        const cssH = this._logicalHeight || Math.round(displayHeight / dpr);
        this._glCanvas.style.width = `${cssW}px`;
        this._glCanvas.style.height = `${cssH}px`;
      }
    }

    // Build render state and apply HDR-specific overrides
    const state = this.buildRenderState();
    if (isHDROutput) {
      state.colorAdjustments = { ...state.colorAdjustments, gamma: 1 };
      state.toneMappingState = { enabled: false, operator: 'off' };
    }
    renderer.applyRenderState(state);

    // Render
    renderer.clear(0, 0, 0, 1);
    renderer.renderImage(image, 0, 0, 1, 1);

    // CSS transform for rotation/flip
    this.applyTransformToCanvas(this._glCanvas);

    return true;
  }

  /**
   * Hybrid WebGL2 → WebGPU HDR blit render path.
   * Renders via WebGL2 FBO, reads float pixels, uploads to WebGPU HDR canvas.
   */
  private renderHDRWithWebGPUBlit(
    renderer: Renderer,
    image: IPImage,
    displayWidth: number,
    displayHeight: number,
  ): boolean {
    // Ensure GL canvas is sized for FBO rendering (it stays hidden)
    if (this._glCanvas!.width !== displayWidth || this._glCanvas!.height !== displayHeight) {
      renderer.resize(displayWidth, displayHeight);
    }

    // Build render state with minimal HDR overrides for linear-light output.
    // The WebGPU HDR canvas expects linear values where >1.0 = brighter than SDR white.
    // - Gamma = 1: no gamma compression (the HDR canvas expects linear light)
    // - Display transfer = 0 (linear): CRITICAL — without this, the shader applies
    //   sRGB OETF (pow(c, 1/2.4)) which compresses HDR values and ignores u_gamma
    // - Display gamma = 1: no additional gamma encoding on top of transfer function
    // - Tone mapping: NOT overridden — user controls whether ACES/Reinhard/etc. is applied.
    // - Display brightness: NOT overridden — user can adjust display brightness freely.
    const state = this.buildRenderState();
    state.colorAdjustments = { ...state.colorAdjustments, gamma: 1 };
    state.displayColor = { ...state.displayColor, transferFunction: 0, displayGamma: 1 };
    renderer.applyRenderState(state);

    // Render to RGBA16F FBO and read float pixels.
    // Prefer async PBO readback which returns previous frame's data immediately,
    // eliminating the 8-25ms GPU sync stall. Falls back to sync if unavailable.
    const pixels = renderer.renderImageToFloatAsync
      ? renderer.renderImageToFloatAsync(image, displayWidth, displayHeight)
      : renderer.renderImageToFloat!(image, displayWidth, displayHeight);
    if (!pixels) return false;

    // Upload to WebGPU HDR canvas
    this._webgpuBlit!.uploadAndDisplay(pixels, displayWidth, displayHeight);

    // Show WebGPU canvas, hide GL canvas
    const blitCanvas = this._webgpuBlit!.getCanvas();
    if (!this._hdrRenderActive) {
      this._glCanvas!.style.display = 'none';
      blitCanvas.style.display = 'block';
      this.ctx.getImageCanvas().style.visibility = 'hidden';
      this._hdrRenderActive = true;
    }

    // Apply CSS sizing to match logical (CSS) dimensions — without this,
    // the canvas at physical pixel size appears too large on retina displays.
    const dpr = window.devicePixelRatio || 1;
    const cssW = this._logicalWidth || Math.round(displayWidth / dpr);
    const cssH = this._logicalHeight || Math.round(displayHeight / dpr);
    blitCanvas.style.width = `${cssW}px`;
    blitCanvas.style.height = `${cssH}px`;

    // CSS transform for rotation/flip
    this.applyTransformToCanvas(blitCanvas);

    return true;
  }

  /**
   * Apply CSS rotation/flip transform to a canvas element.
   */
  private applyTransformToCanvas(canvas: HTMLCanvasElement): void {
    const { rotation, flipH, flipV } = this.ctx.getTransformManager().transform;
    const transforms: string[] = [];
    if (rotation) transforms.push(`rotate(${rotation}deg)`);
    if (flipH) transforms.push('scaleX(-1)');
    if (flipV) transforms.push('scaleY(-1)');
    canvas.style.transform = transforms.length ? transforms.join(' ') : '';
  }

  /**
   * Initialize the WebGPU HDR blit module lazily.
   * Called when HDR content is detected and WebGPU HDR is available but WebGL2
   * has no native HDR output.
   */
  async initWebGPUHDRBlit(): Promise<void> {
    if (this._webgpuBlit || this._webgpuBlitInitializing || this._webgpuBlitFailed) return;
    this._webgpuBlitInitializing = true;

    try {
      const blit = new WebGPUHDRBlit();
      await blit.initialize();
      this._webgpuBlit = blit;

      // Append WebGPU canvas to the container (after GL canvas)
      const container = this.ctx.getCanvasContainer();
      container.appendChild(blit.getCanvas());

      console.log('[Viewer] WebGPU HDR blit initialized');

      // If there's already a worker proxy renderer, switch to sync now
      // so the next render uses the blit path with renderImageToFloat.
      if (this._isAsyncRenderer) {
        console.log('[Viewer] Blit ready, switching from worker to sync renderer');
        this.fallbackToSyncRenderer();
      }

      // Trigger a re-render so the current HDR content (if any) is re-rendered
      // through the blit path.
      this.ctx.scheduleRender();
    } catch (e) {
      console.warn('[Viewer] WebGPU HDR blit init failed:', e);
      this._webgpuBlitFailed = true;
    } finally {
      this._webgpuBlitInitializing = false;
    }
  }

  /** Hide the WebGPU blit canvas if it exists. */
  private hideWebGPUBlitCanvas(): void {
    if (this._webgpuBlit) {
      this._webgpuBlit.getCanvas().style.display = 'none';
    }
  }

  /**
   * Deactivate HDR WebGL rendering mode, restoring the 2D canvas.
   */
  deactivateHDRMode(): void {
    if (!this._glCanvas) return;
    this._glCanvas.style.display = 'none';
    this.hideWebGPUBlitCanvas();
    this.ctx.getImageCanvas().style.visibility = 'visible';
    this._hdrRenderActive = false;
  }

  /**
   * Deactivate SDR WebGL rendering mode, restoring the 2D canvas and CSS filters.
   */
  deactivateSDRWebGLMode(): void {
    if (!this._glCanvas) return;
    this._glCanvas.style.display = 'none';
    this.ctx.getImageCanvas().style.visibility = 'visible';
    this._sdrWebGLRenderActive = false;
    // Restore CSS filters for the 2D canvas path
    this.ctx.applyColorFilters();
  }

  /**
   * Check if any GPU-supported shader effects are active that justify routing
   * SDR content through the WebGL pipeline instead of the 2D canvas path.
   *
   * Effects supported in the GPU shader:
   * - exposure, gamma, saturation, contrast, brightness, temperature, tint
   * - hue rotation, tone mapping, color inversion, channel isolation
   * - CDL, curves, color wheels, false color, zebra stripes, 3D LUT
   * - display color management, background pattern
   * - highlights/shadows/whites/blacks, vibrance, clarity, sharpen
   * - HSL qualifier (secondary color correction)
   */
  hasGPUShaderEffectsActive(): boolean {
    const colorPipeline = this.ctx.getColorPipeline();
    const adj = colorPipeline.colorAdjustments;
    // Basic color adjustments
    if (adj.exposure !== 0) return true;
    if (adj.gamma !== 1) return true;
    if (adj.saturation !== 1) return true;
    if (adj.contrast !== 1) return true;
    if (adj.brightness !== 0) return true;
    if (adj.temperature !== 0) return true;
    if (adj.tint !== 0) return true;
    if (!isIdentityHueRotation(adj.hueRotation)) return true;

    // Tone mapping
    if (this.ctx.isToneMappingEnabled()) return true;

    // Color inversion
    if (colorPipeline.colorInversionEnabled) return true;

    // Channel isolation
    if (this.ctx.getChannelMode() !== 'rgb') return true;

    // CDL
    if (!isDefaultCDL(colorPipeline.cdlValues)) return true;

    // Curves
    if (!isDefaultCurves(colorPipeline.curvesData)) return true;

    // Color wheels
    if (this.ctx.getColorWheels().hasAdjustments()) return true;

    // False color
    if (this.ctx.getFalseColor().isEnabled()) return true;

    // Zebra stripes
    if (this.ctx.getZebraStripes().isEnabled()) return true;

    // 3D LUT
    if (colorPipeline.currentLUT && colorPipeline.lutIntensity > 0) return true;

    // Display color management
    if (isDisplayStateActive(colorPipeline.displayColorState)) return true;

    // Phase 1B: New GPU shader effects
    // Highlights/shadows/whites/blacks
    if (adj.highlights !== 0 || adj.shadows !== 0 || adj.whites !== 0 || adj.blacks !== 0) return true;
    // Vibrance
    if (adj.vibrance !== 0) return true;
    // Clarity
    if (adj.clarity !== 0) return true;
    // Sharpen
    if (this.ctx.getFilterSettings().sharpen > 0) return true;
    // HSL qualifier
    if (this.ctx.getHSLQualifier().isEnabled()) return true;

    return false;
  }

  /**
   * Check if any CPU-only effects are active that are not in the GPU shader.
   * When these are active, the SDR path must fall back to the 2D canvas + pixel
   * processing pipeline to get correct results.
   *
   * After Phase 1B, the only remaining CPU-only effect is blur (applied via CSS
   * filter which doesn't work with the GL canvas).
   */
  hasCPUOnlyEffectsActive(): boolean {
    // Blur (applied via CSS filter which doesn't work with the GL canvas)
    if (this.ctx.getFilterSettings().blur > 0) return true;
    return false;
  }

  /**
   * Render an SDR source through the WebGL shader pipeline for GPU-accelerated
   * effects processing. This avoids the slow CPU pixel processing path for
   * effects that are supported in the fragment shader.
   *
   * Returns true if the SDR content was rendered via WebGL, false if the caller
   * should fall back to the 2D canvas path.
   */
  renderSDRWithWebGL(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap,
    displayWidth: number,
    displayHeight: number,
  ): boolean {
    const renderer = this.ensureGLRenderer();
    if (!renderer || !this._glCanvas) return false;

    // Activate WebGL canvas (show GL canvas, hide 2D canvas)
    if (!this._sdrWebGLRenderActive) {
      this._glCanvas.style.display = 'block';
      this.ctx.getImageCanvas().style.visibility = 'hidden';
      this._sdrWebGLRenderActive = true;
      this.ctx.applyColorFilters();
    }

    // Resize canvas buffer if needed. displayWidth/Height may be quality-reduced
    // during interaction (50% of physical) — the browser upscales via CSS sizing.
    if (this._glCanvas.width !== displayWidth || this._glCanvas.height !== displayHeight) {
      renderer.resize(displayWidth, displayHeight);
      // CSS always uses full logical dims (set by resizeIfActive), not reduced render dims
      if (this._glCanvas instanceof HTMLCanvasElement) {
        const dpr = window.devicePixelRatio || 1;
        const cssW = this._logicalWidth || Math.round(displayWidth / dpr);
        const cssH = this._logicalHeight || Math.round(displayHeight / dpr);
        this._glCanvas.style.width = `${cssW}px`;
        this._glCanvas.style.height = `${cssH}px`;
      }
    }

    // Sync all render state (SDR: use as configured, no overrides)
    renderer.applyRenderState(this.buildRenderState());

    // Render
    renderer.clear(0, 0, 0, 1);
    const result = renderer.renderSDRFrame(source);

    if (!result) {
      // WebGL rendering failed - deactivate and let caller fall back to 2D canvas
      this.deactivateSDRWebGLMode();
      return false;
    }

    // CSS transform for rotation/flip
    const { rotation, flipH, flipV } = this.ctx.getTransformManager().transform;
    const transforms: string[] = [];
    if (rotation) transforms.push(`rotate(${rotation}deg)`);
    if (flipH) transforms.push('scaleX(-1)');
    if (flipV) transforms.push('scaleY(-1)');
    this._glCanvas.style.transform = transforms.length ? transforms.join(' ') : '';

    return true;
  }

  /**
   * Resize the GL canvas/renderer if HDR or SDR WebGL mode is active.
   * Called from Viewer.setCanvasSize() with physical (DPR-scaled) dimensions.
   * logicalWidth/logicalHeight are the exact CSS display dimensions (avoids
   * rounding drift from physical / DPR back-computation).
   */
  resizeIfActive(width: number, height: number, logicalWidth?: number, logicalHeight?: number): void {
    // Store logical dims for use in render methods
    if (logicalWidth !== undefined && logicalHeight !== undefined) {
      this._logicalWidth = logicalWidth;
      this._logicalHeight = logicalHeight;
    }
    if (this._glCanvas && (this._hdrRenderActive || this._sdrWebGLRenderActive) && this._glRenderer) {
      this._glRenderer.resize(width, height);
      // Use exact logical dims when provided, fall back to physical / DPR
      const dpr = window.devicePixelRatio || 1;
      const cssW = logicalWidth ?? Math.round(width / dpr);
      const cssH = logicalHeight ?? Math.round(height / dpr);
      if (this._glCanvas instanceof HTMLCanvasElement) {
        this._glCanvas.style.width = `${cssW}px`;
        this._glCanvas.style.height = `${cssH}px`;
      }
      // Also resize WebGPU blit canvas if active (HDR blit path)
      if (this._webgpuBlit?.initialized && this._hdrRenderActive) {
        const blitCanvas = this._webgpuBlit.getCanvas();
        blitCanvas.style.width = `${cssW}px`;
        blitCanvas.style.height = `${cssH}px`;
      }
    }
  }


  /**
   * Return the GPU's MAX_TEXTURE_SIZE, or a safe default if no GL context exists.
   */
  getMaxTextureSize(): number {
    if (this._glRenderer) {
      const gl = (this._glRenderer as any).gl;
      if (gl) return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 16384;
    }
    return 16384;
  }

  // =========================================================================
  // Delegation methods — forward to the underlying Renderer when available.
  // These let Viewer.ts avoid reaching through two layers of indirection.
  // =========================================================================

  setColorAdjustments(adj: ColorAdjustments): void {
    this._glRenderer?.setColorAdjustments(adj);
  }

  setColorInversion(inv: boolean): void {
    this._glRenderer?.setColorInversion(inv);
  }

  setToneMappingState(state: ToneMappingState): void {
    this._glRenderer?.setToneMappingState(state);
  }

  setDisplayColorState(state: { transferFunction: number; displayGamma: number; displayBrightness: number; customGamma: number }): void {
    this._glRenderer?.setDisplayColorState(state);
  }

  /**
   * Dispose all GL resources (renderer, worker proxy, WebGPU blit, canvas reference).
   */
  dispose(): void {
    // Cleanup render worker proxy (Phase 4)
    if (this._renderWorkerProxy) {
      this._renderWorkerProxy.dispose();
      this._renderWorkerProxy = null;
      this._isAsyncRenderer = false;
      this._glRenderer = null; // Same object as proxy; already disposed above
    }

    // Cleanup WebGL HDR renderer
    if (this._glRenderer) {
      this._glRenderer.dispose();
      this._glRenderer = null;
    }

    // Cleanup WebGPU HDR blit
    if (this._webgpuBlit) {
      this._webgpuBlit.dispose();
      this._webgpuBlit = null;
    }

    this._glCanvas = null;
  }
}
