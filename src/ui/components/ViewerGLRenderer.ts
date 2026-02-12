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
import { Canvas2DHDRBlit } from '../../render/Canvas2DHDRBlit';
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
import type { AutoExposureState, GamutMappingState, GamutIdentifier } from '../../core/types/effects';
import { DEFAULT_AUTO_EXPOSURE_STATE, DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';
import { AutoExposureController } from '../../color/AutoExposureController';
import { LuminanceAnalyzer } from '../../render/LuminanceAnalyzer';
import { PerfTrace } from '../../utils/PerfTrace';

/**
 * Context interface for the ViewerGLRenderer to access Viewer state
 * without tight coupling. The Viewer implements this interface.
 */
export interface GLRendererContext {
  getCanvasContainer(): HTMLElement;
  getImageCanvas(): HTMLCanvasElement;
  getPaintCanvas(): HTMLCanvasElement;
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

  // Canvas2D HDR blit (last-resort fallback: WebGL2 FBO → readPixels → Canvas2D HDR canvas)
  private _canvas2dBlit: Canvas2DHDRBlit | null = null;
  private _canvas2dBlitInitializing = false;
  private _canvas2dBlitFailed = false;

  // Render-skip cache: tracks last successfully rendered HDR frame so
  // redundant renders of the same image can be skipped when nothing changed.
  private _lastRenderedImage: WeakRef<IPImage> | null = null;
  private _lastRenderedWidth = 0;
  private _lastRenderedHeight = 0;

  // Last known logical (CSS) dimensions — set by resizeIfActive() to avoid
  // rounding drift when computing CSS size from physical / DPR.
  private _logicalWidth = 0;
  private _logicalHeight = 0;

  private ctx: GLRendererContext;

  // Auto-exposure and scene analysis
  private _autoExposureController = new AutoExposureController();
  private _autoExposureState: AutoExposureState = { ...DEFAULT_AUTO_EXPOSURE_STATE };
  private _luminanceAnalyzer: LuminanceAnalyzer | null = null;
  private _gamutMappingState: GamutMappingState = { ...DEFAULT_GAMUT_MAPPING_STATE };

  get glCanvas(): HTMLCanvasElement | null { return this._glCanvas; }
  get glRenderer(): Renderer | null { return this._glRenderer; }
  get hdrRenderActive(): boolean { return this._hdrRenderActive; }
  get sdrWebGLRenderActive(): boolean { return this._sdrWebGLRenderActive; }
  get renderWorkerProxy(): RenderWorkerProxy | null { return this._renderWorkerProxy; }
  get isAsyncRenderer(): boolean { return this._isAsyncRenderer; }
  get capabilities(): DisplayCapabilities | undefined { return this._capabilities; }
  /** True when the WebGPU HDR blit module is initialized and ready to display. */
  get isWebGPUBlitReady(): boolean { return this._webgpuBlit?.initialized === true; }
  /** True when the Canvas2D HDR blit module is initialized and ready to display. */
  get isCanvas2DBlitReady(): boolean { return this._canvas2dBlit?.initialized === true; }
  /** True when the WebGPU HDR blit initialization failed. */
  get webgpuBlitFailed(): boolean { return this._webgpuBlitFailed; }
  /** Get the last rendered IPImage (for scope readback). Returns null if GC'd or not yet rendered. */
  get lastRenderedImage(): IPImage | null { return this._lastRenderedImage?.deref() ?? null; }

  constructor(ctx: GLRendererContext, capabilities?: DisplayCapabilities) {
    this._capabilities = capabilities;
    this.ctx = ctx;
  }

  /** Set auto-exposure configuration. */
  setAutoExposure(state: AutoExposureState): void {
    this._autoExposureState = { ...state };
    if (!state.enabled) {
      this._autoExposureController.reset();
    }
  }

  /** Get current auto-exposure configuration. */
  getAutoExposure(): AutoExposureState {
    return { ...this._autoExposureState };
  }

  /** Set gamut mapping configuration. */
  setGamutMapping(state: GamutMappingState): void {
    this._gamutMappingState = { ...state };
  }

  /** Get current gamut mapping configuration. */
  getGamutMapping(): GamutMappingState {
    return { ...this._gamutMappingState };
  }

  /**
   * Auto-detect source gamut from image metadata and determine
   * target gamut from display capabilities.
   */
  private detectGamutMapping(image: IPImage): GamutMappingState {
    if (this._gamutMappingState.mode === 'off') {
      return this._gamutMappingState;
    }

    const sourceGamut: GamutIdentifier =
      image.metadata?.colorPrimaries === 'bt2020' ? 'rec2020' : 'srgb';
    const targetGamut: GamutIdentifier =
      this._capabilities?.displayGamut === 'p3' || this._capabilities?.displayGamut === 'rec2020'
        ? 'display-p3' : 'srgb';

    // No mapping needed if source matches target or source is sRGB
    if (sourceGamut === 'srgb' || (sourceGamut as string) === (targetGamut as string)) {
      return { ...this._gamutMappingState, mode: 'off' };
    }

    return {
      mode: this._gamutMappingState.mode,
      sourceGamut,
      targetGamut,
    };
  }

  /**
   * Create the initial GL canvas element and append it to the canvas container.
   * Called once during Viewer construction.
   */
  createGLCanvas(): HTMLCanvasElement {
    this._glCanvas = document.createElement('canvas');
    this._glCanvas.dataset.testid = 'viewer-gl-canvas';
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
    const skipWorker = this._webgpuBlit?.initialized === true || this._canvas2dBlit?.initialized === true;
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
      this._glCanvas.dataset.testid = 'viewer-gl-canvas';
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

    // Debug: log HDR rendering path decision (once per image change)
    if (this._lastRenderedImage?.deref() !== image) {
      const fmt = image.metadata?.attributes?.formatName ?? image.metadata?.transferFunction ?? 'unknown';
      const cp = image.metadata?.colorPrimaries ?? 'unset';
      const tf = image.metadata?.transferFunction ?? 'unset';
      const cs = image.metadata?.colorSpace ?? 'unset';
      const peak = image.dataType === 'float32' ? (() => {
        const arr = image.getTypedArray() as Float32Array;
        let max = 0;
        for (let i = 0; i < Math.min(arr.length, 200000); i++) max = Math.max(max, arr[i]!);
        return max.toFixed(3);
      })() : 'N/A';
      console.log(
        `[HDR Render] format=${fmt} tf=${tf} cp=${cp} cs=${cs} peak=${peak} ` +
        `hdrOutput=${renderer.getHDROutputMode()} blitReady=${this._webgpuBlit?.initialized === true} ` +
        `hasFloatReadback=${hasFloatReadback} size=${image.width}x${image.height} dtype=${image.dataType}`
      );
    }

    // Try WebGPU HDR blit path when WebGL2 has no native HDR output
    if (!isHDROutput && this._webgpuBlit?.initialized && hasFloatReadback) {
      return this.renderHDRWithWebGPUBlit(renderer, image, displayWidth, displayHeight);
    }

    // Try Canvas2D HDR blit path as last resort when WebGPU blit is not available
    if (!isHDROutput && this._canvas2dBlit?.initialized && hasFloatReadback) {
      return this.renderHDRWithCanvas2DBlit(renderer, image, displayWidth, displayHeight);
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
    PerfTrace.begin('buildRenderState');
    const state = this.buildRenderState();
    if (isHDROutput) {
      state.colorAdjustments = { ...state.colorAdjustments, gamma: 1 };
      state.displayColor = { ...state.displayColor, transferFunction: 0, displayGamma: 1, displayBrightness: 1 };
      // Only disable tone mapping for HLG/PQ content — the transfer function
      // already encodes dynamic range for the display. For linear float content
      // (gainmap, EXR), preserve user's tone mapping to compress the range.
      const tf = image.metadata?.transferFunction;
      if (tf === 'hlg' || tf === 'pq') {
        state.toneMappingState = { enabled: false, operator: 'off' };
      }
    }

    // Scene luminance analysis: needed for Drago (always) and auto-exposure (when enabled)
    const needsLuminance = !isHDROutput && (
      this._autoExposureState.enabled ||
      state.toneMappingState.operator === 'drago'
    );
    if (needsLuminance) {
      const gl = renderer.getContext();
      if (gl) {
        if (!this._luminanceAnalyzer) {
          this._luminanceAnalyzer = new LuminanceAnalyzer(gl);
        }
        const currentTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
        if (currentTexture) {
          const inputTransfer = image.metadata?.transferFunction === 'hlg' ? 1
            : image.metadata?.transferFunction === 'pq' ? 2 : 0;
          const stats = this._luminanceAnalyzer.computeLuminanceStats(currentTexture, inputTransfer);

          // Auto-exposure: smooth and apply
          if (this._autoExposureState.enabled) {
            this._autoExposureController.update(stats.avg, this._autoExposureState);
            const finalExposure = this._autoExposureController.currentExposure + state.colorAdjustments.exposure;
            state.colorAdjustments = { ...state.colorAdjustments, exposure: finalExposure };
          }

          // Drago: feed scene luminance stats.
          // Note: linearAvg is the mipmap-averaged luminance (arithmetic mean),
          // NOT the scene maximum. Estimate Lmax using a content-aware multiplier
          // since WebGL2 mipmaps can only average, not compute max.
          if (state.toneMappingState.operator === 'drago') {
            const drMultiplier = inputTransfer === 2 ? 10 : inputTransfer === 1 ? 6 : 4;
            state.toneMappingState = {
              ...state.toneMappingState,
              dragoLwa: stats.avg,
              dragoLmax: stats.linearAvg * drMultiplier,
            };
          }
        }
      }
    }

    // Gamut mapping: auto-detect based on image metadata and display capabilities
    state.gamutMapping = this.detectGamutMapping(image);

    PerfTrace.end('buildRenderState');

    // Debug: log render state applied to HDR path (once per image change)
    if (this._lastRenderedImage?.deref() !== image) {
      console.log(
        `[HDR Render] state: isHDROutput=${isHDROutput}` +
        ` toneMapping=${state.toneMappingState.enabled ? state.toneMappingState.operator : 'OFF'}` +
        ` displayTransfer=${state.displayColor.transferFunction}` +
        ` displayGamma=${state.displayColor.displayGamma}` +
        ` displayBrightness=${state.displayColor.displayBrightness}` +
        ` exposure=${state.colorAdjustments.exposure}` +
        ` gamma=${state.colorAdjustments.gamma}` +
        ` gamutMapping=${state.gamutMapping?.mode ?? 'none'}`
      );
    }

    PerfTrace.begin('applyRenderState');
    renderer.applyRenderState(state);
    PerfTrace.end('applyRenderState');

    // Skip re-render if same image, same dimensions, and no state changes.
    // The canvas already shows the correct content from the last render.
    const sameImage = this._lastRenderedImage?.deref() === image;
    const sameDims = displayWidth === this._lastRenderedWidth && displayHeight === this._lastRenderedHeight;
    if (sameImage && sameDims && !renderer.hasPendingStateChanges()) {
      PerfTrace.count('hdr.renderSkipped');
      return true;
    }

    // Render
    PerfTrace.begin('renderer.clear+render');
    renderer.clear(0, 0, 0, 1);
    renderer.renderImage(image, 0, 0, 1, 1);
    PerfTrace.end('renderer.clear+render');

    // CSS transform for rotation/flip
    this.applyTransformToCanvas(this._glCanvas);

    this._lastRenderedImage = new WeakRef(image);
    this._lastRenderedWidth = displayWidth;
    this._lastRenderedHeight = displayHeight;
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
    PerfTrace.begin('blit.buildRenderState');
    const state = this.buildRenderState();
    state.colorAdjustments = { ...state.colorAdjustments, gamma: 1 };
    state.displayColor = { ...state.displayColor, transferFunction: 0, displayGamma: 1, displayBrightness: 1 };

    // Disable tone mapping for HLG/PQ content — the transfer function already
    // encodes dynamic range for the display.
    const tf = image.metadata?.transferFunction;
    if (tf === 'hlg' || tf === 'pq') {
      state.toneMappingState = { enabled: false, operator: 'off' };
    }

    // Gamut mapping: auto-detect based on image metadata and display capabilities
    state.gamutMapping = this.detectGamutMapping(image);

    // Debug: log blit render state (once per image change)
    if (this._lastRenderedImage?.deref() !== image) {
      console.log(
        `[HDR Blit] state:` +
        ` toneMapping=${state.toneMappingState.enabled ? state.toneMappingState.operator : 'OFF'}` +
        ` displayTransfer=${state.displayColor.transferFunction}` +
        ` exposure=${state.colorAdjustments.exposure}` +
        ` gamma=${state.colorAdjustments.gamma}` +
        ` gamutMapping=${state.gamutMapping?.mode ?? 'none'}`
      );
    }

    renderer.applyRenderState(state);
    PerfTrace.end('blit.buildRenderState');

    // Skip re-render if same image, same dimensions, and no state changes.
    const sameImage = this._lastRenderedImage?.deref() === image;
    const sameDims = displayWidth === this._lastRenderedWidth && displayHeight === this._lastRenderedHeight;
    const hasPending = renderer.hasPendingStateChanges();
    if (sameImage && sameDims && !hasPending) {
      PerfTrace.count('blit.renderSkipped');
      return true;
    }
    // Render to RGBA16F FBO and read float pixels.
    // Use sync readback when shader state changed (hasPending=true) so the user
    // sees immediate visual feedback after operator/setting changes. Use async
    // PBO readback (1-frame lag) only for continuous playback where the 16ms
    // latency is imperceptible but avoiding the 8-25ms GPU sync stall matters.
    PerfTrace.begin('blit.FBO+readPixels');
    const hasAsyncReadback = typeof renderer.renderImageToFloatAsync === 'function';
    const useAsync = hasAsyncReadback && !hasPending;
    const pixels = useAsync
      ? renderer.renderImageToFloatAsync!(image, displayWidth, displayHeight)
      : renderer.renderImageToFloat!(image, displayWidth, displayHeight);
    PerfTrace.end('blit.FBO+readPixels');
    if (!pixels) return false;

    // Upload to WebGPU HDR canvas
    PerfTrace.begin('blit.webgpuUpload');
    this._webgpuBlit!.uploadAndDisplay(pixels, displayWidth, displayHeight);
    PerfTrace.end('blit.webgpuUpload');

    this._lastRenderedImage = new WeakRef(image);
    this._lastRenderedWidth = displayWidth;
    this._lastRenderedHeight = displayHeight;

    // Show WebGPU canvas, hide GL canvas and Canvas2D blit canvas
    const blitCanvas = this._webgpuBlit!.getCanvas();
    if (!this._hdrRenderActive) {
      this._glCanvas!.style.display = 'none';
      blitCanvas.style.display = 'block';
      this.hideCanvas2DBlitCanvas();
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
   * Hybrid WebGL2 → Canvas2D HDR blit render path.
   * Renders via WebGL2 FBO, reads float pixels, uploads to Canvas2D HDR canvas.
   * Last-resort fallback when WebGPU blit is not available.
   */
  private renderHDRWithCanvas2DBlit(
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
    PerfTrace.begin('canvas2dBlit.buildRenderState');
    const state = this.buildRenderState();
    state.colorAdjustments = { ...state.colorAdjustments, gamma: 1 };
    state.displayColor = { ...state.displayColor, transferFunction: 0, displayGamma: 1, displayBrightness: 1 };

    // Disable tone mapping for HLG/PQ content — the transfer function already
    // encodes dynamic range for the display.
    const tf = image.metadata?.transferFunction;
    if (tf === 'hlg' || tf === 'pq') {
      state.toneMappingState = { enabled: false, operator: 'off' };
    }

    // Gamut mapping: auto-detect based on image metadata and display capabilities
    state.gamutMapping = this.detectGamutMapping(image);

    // Debug: log canvas2d blit render state (once per image change)
    if (this._lastRenderedImage?.deref() !== image) {
      console.log(
        `[Canvas2D Blit] state:` +
        ` toneMapping=${state.toneMappingState.enabled ? state.toneMappingState.operator : 'OFF'}` +
        ` displayTransfer=${state.displayColor.transferFunction}` +
        ` exposure=${state.colorAdjustments.exposure}` +
        ` gamma=${state.colorAdjustments.gamma}` +
        ` gamutMapping=${state.gamutMapping?.mode ?? 'none'}`
      );
    }

    renderer.applyRenderState(state);
    PerfTrace.end('canvas2dBlit.buildRenderState');

    // Skip re-render if same image, same dimensions, and no state changes.
    const sameImage = this._lastRenderedImage?.deref() === image;
    const sameDims = displayWidth === this._lastRenderedWidth && displayHeight === this._lastRenderedHeight;
    const hasPending = renderer.hasPendingStateChanges();
    if (sameImage && sameDims && !hasPending) {
      PerfTrace.count('canvas2dBlit.renderSkipped');
      return true;
    }

    // Render to RGBA16F FBO and read float pixels.
    // Use sync readback when shader state changed (hasPending=true) so the user
    // sees immediate visual feedback after operator/setting changes. Use async
    // PBO readback (1-frame lag) only for continuous playback.
    PerfTrace.begin('canvas2dBlit.FBO+readPixels');
    const hasAsyncReadback = typeof renderer.renderImageToFloatAsync === 'function';
    const useAsync = hasAsyncReadback && !hasPending;
    const pixels = useAsync
      ? renderer.renderImageToFloatAsync!(image, displayWidth, displayHeight)
      : renderer.renderImageToFloat!(image, displayWidth, displayHeight);
    PerfTrace.end('canvas2dBlit.FBO+readPixels');
    if (!pixels) return false;

    // Upload to Canvas2D HDR canvas
    PerfTrace.begin('canvas2dBlit.putImageData');
    this._canvas2dBlit!.uploadAndDisplay(pixels, displayWidth, displayHeight);
    PerfTrace.end('canvas2dBlit.putImageData');

    this._lastRenderedImage = new WeakRef(image);
    this._lastRenderedWidth = displayWidth;
    this._lastRenderedHeight = displayHeight;

    // Show Canvas2D canvas, hide GL canvas
    const blitCanvas = this._canvas2dBlit!.getCanvas();
    if (!this._hdrRenderActive) {
      this._glCanvas!.style.display = 'none';
      blitCanvas.style.display = 'block';
      this.hideWebGPUBlitCanvas();
      this.ctx.getImageCanvas().style.visibility = 'hidden';
      this._hdrRenderActive = true;
    }

    // Apply CSS sizing to match logical (CSS) dimensions
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

      // Insert WebGPU canvas before the paint canvas so annotations overlay it
      const container = this.ctx.getCanvasContainer();
      const paintCanvas = this.ctx.getPaintCanvas();
      container.insertBefore(blit.getCanvas(), paintCanvas);

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

  /**
   * Initialize the Canvas2D HDR blit module lazily.
   * Called as a last-resort fallback when both WebGL2 native HDR and WebGPU
   * HDR blit are unavailable but the display supports HDR.
   */
  async initCanvas2DHDRBlit(): Promise<void> {
    if (this._canvas2dBlit || this._canvas2dBlitInitializing || this._canvas2dBlitFailed) return;
    this._canvas2dBlitInitializing = true;

    try {
      const blit = new Canvas2DHDRBlit();
      blit.initialize();
      this._canvas2dBlit = blit;

      // Insert Canvas2D canvas before the paint canvas so annotations overlay it
      const container = this.ctx.getCanvasContainer();
      const paintCanvas = this.ctx.getPaintCanvas();
      container.insertBefore(blit.getCanvas(), paintCanvas);

      console.log('[Viewer] Canvas2D HDR blit initialized');

      // If there's already a worker proxy renderer, switch to sync now
      // so the next render uses the blit path with renderImageToFloat.
      if (this._isAsyncRenderer) {
        console.log('[Viewer] Canvas2D blit ready, switching from worker to sync renderer');
        this.fallbackToSyncRenderer();
      }

      // Trigger a re-render so the current HDR content (if any) is re-rendered
      // through the blit path.
      this.ctx.scheduleRender();
    } catch (e) {
      console.warn('[Viewer] Canvas2D HDR blit init failed:', e);
      this._canvas2dBlitFailed = true;
    } finally {
      this._canvas2dBlitInitializing = false;
    }
  }

  /** Hide the WebGPU blit canvas if it exists. */
  private hideWebGPUBlitCanvas(): void {
    if (this._webgpuBlit) {
      this._webgpuBlit.getCanvas().style.display = 'none';
    }
  }

  /** Hide the Canvas2D blit canvas if it exists. */
  private hideCanvas2DBlitCanvas(): void {
    if (this._canvas2dBlit) {
      this._canvas2dBlit.getCanvas().style.display = 'none';
    }
  }

  /**
   * Deactivate HDR WebGL rendering mode, restoring the 2D canvas.
   */
  deactivateHDRMode(): void {
    if (!this._glCanvas) return;
    this._glCanvas.style.display = 'none';
    this.hideWebGPUBlitCanvas();
    this.hideCanvas2DBlitCanvas();
    this.ctx.getImageCanvas().style.visibility = 'visible';
    this._hdrRenderActive = false;
    this._lastRenderedImage = null; // Invalidate render cache
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
      // Also resize blit canvases if active (HDR blit path)
      if (this._webgpuBlit?.initialized && this._hdrRenderActive) {
        const blitCanvas = this._webgpuBlit.getCanvas();
        blitCanvas.style.width = `${cssW}px`;
        blitCanvas.style.height = `${cssH}px`;
      }
      if (this._canvas2dBlit?.initialized && this._hdrRenderActive) {
        const blitCanvas = this._canvas2dBlit.getCanvas();
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

    // Cleanup Canvas2D HDR blit
    if (this._canvas2dBlit) {
      this._canvas2dBlit.dispose();
      this._canvas2dBlit = null;
    }

    // Cleanup luminance analyzer
    if (this._luminanceAnalyzer) {
      this._luminanceAnalyzer.dispose();
      this._luminanceAnalyzer = null;
    }

    this._autoExposureController.reset();
    this._glCanvas = null;
    this._lastRenderedImage = null;
  }
}
