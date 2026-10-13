/**
 * RenderWorkerProxy - Main-thread proxy for the render worker
 *
 * Implements the RendererBackend interface by delegating all operations to
 * a dedicated Web Worker that hosts the actual WebGL2 Renderer instance.
 *
 * Key design:
 * - All state setters are fire-and-forget (postMessage, no response)
 * - Render calls return Promises resolved when the worker completes
 * - readPixelFloat is async with id-based request/response correlation
 * - The OffscreenCanvas auto-composites to the visible canvas element
 * - Falls back gracefully on worker death
 *
 * Batch state optimization: dirty state is collected via markDirty() and
 * flushed as a single syncState message before each render call.
 */

import type { IPImage, ColorPrimaries } from '../core/image/Image';
import type {
  ColorAdjustments,
  ColorWheelsState,
  ChannelMode,
  ChannelSwizzle,
  HSLQualifierState,
  LinearizeState,
} from '../core/types/color';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../core/types/color';
import type {
  ToneMappingState,
  ZebraState,
  HighlightsShadowsState,
  VibranceState,
  ClarityState,
  SharpenState,
  FalseColorState,
  GamutMappingState,
} from '../core/types/effects';
import { DEFAULT_TONE_MAPPING_STATE } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { TextureFilterMode } from '../core/types/filter';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend, TextureHandle } from './RendererBackend';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState } from './RenderState';
import type { Renderer } from './Renderer';
import { RenderStateEncoder } from './renderStateTransport';
import type {
  RenderWorkerMessage,
  RenderWorkerResult,
  RendererLUTSyncState,
  RendererSyncState,
} from './renderWorker.messages';
import {
  DATA_TYPE_CODES,
  TRANSFER_FUNCTION_CODES,
  COLOR_PRIMARIES_CODES,
  RENDER_WORKER_PROTOCOL_VERSION,
} from './renderWorker.messages';
import RenderWorkerConstructor from '../workers/renderWorker.worker?worker';
import { Logger } from '../utils/Logger';
import { RenderError } from '../core/errors';

const log = new Logger('RenderWorkerProxy');

/** Pending render request tracker. */
interface PendingRequest<T = void> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Options for creating a RenderWorkerProxy.
 */
export interface RenderWorkerProxyOptions {
  /** Factory function to create the worker. Default: new Worker for renderWorker.ts */
  workerFactory?: () => Worker;
}

/**
 * Renderer methods that ViewerGLRenderer and PixelSamplingManager call on
 * whichever renderer is active, without a typeof guard. ViewerGLRenderer
 * hands the proxy out as a `Renderer`, so a method missing here is a
 * TypeError in production builds only (dev and E2E skip the worker).
 * Implementing this Pick makes the compiler catch the gap instead.
 */
export type WorkerProxyRendererSurface = Pick<
  Renderer,
  | 'isOCIOWasmActive'
  | 'setColorPrimaries'
  | 'renderForScopes'
  | 'setLinearize'
  | 'setOutOfRange'
  | 'setChannelSwizzle'
  | 'setSphericalProjection'
  | 'setUserTransform'
  | 'setTextureFilterMode'
  | 'getTextureFilterMode'
  | 'getHDRHeadroom'
  | 'applyRenderState'
  | 'hasPendingStateChanges'
  | 'renderTiledImages'
  | 'readPixelFloat'
  | 'getContext'
>;

/**
 * Sync-state fields that applyRenderState() always overwrites on the Renderer
 * (ShaderBatchApplicator resets them even when the RenderState field is
 * optional and absent). gamutMapping and textureFilterMode are only applied
 * when present, so they are handled separately.
 */
const RENDER_STATE_COVERED_SYNC_KEYS: readonly (keyof RendererSyncState)[] = [
  'colorAdjustments',
  'toneMappingState',
  'colorInversion',
  'cdl',
  'curvesLUT',
  'colorWheels',
  'highlightsShadows',
  'vibrance',
  'clarity',
  'sharpen',
  'hslQualifier',
  'channelMode',
  'falseColor',
  'zebraStripes',
  'lut',
  'lookLUT',
  'fileLUT',
  'displayLUT',
  'displayColorState',
  'backgroundPattern',
  'premultMode',
  'ditherMode',
  'quantizeBits',
  'linearize',
  'outOfRange',
  'channelSwizzle',
];

/**
 * Whether the display capabilities allow the worker's Renderer to switch to
 * `mode`. Mirrors the conditions Renderer.setHDROutputMode depends on.
 */
function canApplyHDROutputMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended', caps: DisplayCapabilities): boolean {
  switch (mode) {
    case 'hlg':
      return caps.webglHLG === true;
    case 'pq':
      return caps.webglPQ === true;
    case 'extended':
      return caps.webglDrawingBufferStorage === true;
    default:
      return true;
  }
}

/** Most recent scope readback received from the worker. */
interface ScopeCacheEntry {
  image: WeakRef<IPImage>;
  generation: number;
  data: Float32Array;
  width: number;
  height: number;
}

export class RenderWorkerProxy implements RendererBackend, WorkerProxyRendererSurface {
  /** Whether this backend renders asynchronously. */
  readonly isAsync = true;

  private worker: Worker | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private disposed = false;
  private workerReady = false;
  private contextLost = false;

  // Request ID counter for correlation
  private nextId = 1;

  // Pending render and pixel requests
  private pendingRenders = new Map<number, PendingRequest<void>>();
  private pendingPixelReads = new Map<number, PendingRequest<Float32Array | null>>();

  // Init promise
  private initPromise: Promise<string | undefined> | null = null;
  private initResolve: ((hdrMode: string | undefined) => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;

  // Callback for context loss/restore events
  private onContextLost: (() => void) | null = null;
  private onContextRestored: (() => void) | null = null;

  // Worker factory
  private workerFactory: (() => Worker) | undefined;

  // --- State cache for getters ---
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  private colorInversionEnabled = false;
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' | 'extended' = 'sdr';
  /** Id of the latest HDR output mode request; older worker replies are ignored. */
  private hdrOutputModeRequestId = 0;
  private premultMode = 0;
  private ditherMode = 0;
  private quantizeBits = 0;
  private _textureFilterMode: TextureFilterMode = 'linear';
  private hdrHeadroom = 1.0;

  // Full RenderState from the latest applyRenderState(), encoded at flush time
  // so array dedup is relative to what was actually sent.
  private pendingRenderState: RenderState | null = null;
  private renderStateEncoder = new RenderStateEncoder();

  // --- Scope readback (renderForScopes) ---
  /** Incremented each time an HDR image is sent to the worker. */
  private renderGeneration = 0;
  private lastSentImage: WeakRef<IPImage> | null = null;
  private scopeCache: ScopeCacheEntry | null = null;
  private scopeRequest: {
    id: number;
    generation: number;
    image: WeakRef<IPImage> | null;
    width: number;
    height: number;
  } | null = null;
  /** Scope dims last asked for; set while a consumer is reading scopes. */
  private scopeDimsWanted: { width: number; height: number } | null = null;
  private onScopeDataReady: (() => void) | null = null;

  // --- Batch state optimization ---
  private dirtyState: Partial<RendererSyncState> = {};
  private hasDirtyState = false;

  // Double-buffer: pre-created ImageBitmap promise
  private pendingBitmap: Promise<ImageBitmap> | null = null;
  private pendingBitmapSource: unknown = null;

  // Track in-flight render to avoid overlapping
  private renderInFlight = false;

  constructor(options?: RenderWorkerProxyOptions) {
    this.workerFactory = options?.workerFactory;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the proxy with a canvas element.
   * Calls transferControlToOffscreen() and creates the worker.
   */
  initialize(canvas: HTMLCanvasElement, capabilities?: DisplayCapabilities): void {
    if (this.disposed) throw new Error('RenderWorkerProxy has been disposed');
    this.canvas = canvas;

    // Transfer control to offscreen (must happen before any getContext call)
    this.offscreenCanvas = canvas.transferControlToOffscreen();

    // Create worker using Vite's worker import
    if (this.workerFactory) {
      this.worker = this.workerFactory();
    } else {
      this.worker = new RenderWorkerConstructor();
    }

    // Set up message handling
    this.worker.addEventListener('message', this.handleWorkerMessage);
    this.worker.addEventListener('error', this.handleWorkerError);

    // Create init promise
    this.initPromise = new Promise<string | undefined>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;
    });

    // Send init message with transferred OffscreenCanvas
    this.postMessage(
      {
        type: 'init',
        canvas: this.offscreenCanvas,
        capabilities,
      },
      [this.offscreenCanvas],
    );
  }

  /**
   * Wait for async initialization to complete.
   * Returns when the worker has initialized the Renderer.
   */
  async initAsync(): Promise<void> {
    if (!this.initPromise) {
      throw new Error('RenderWorkerProxy.initialize() must be called first');
    }
    const hdrMode = await this.initPromise;
    if (hdrMode) {
      this.hdrOutputMode = hdrMode as 'sdr' | 'hlg' | 'pq' | 'extended';
    }
  }

  /**
   * Initialize from a pre-created OffscreenCanvas (for testing or custom setup).
   */
  async initializeOffscreen(canvas: OffscreenCanvas, capabilities?: DisplayCapabilities): Promise<void> {
    if (this.disposed) throw new Error('RenderWorkerProxy has been disposed');
    this.offscreenCanvas = canvas;

    // Create worker using Vite's worker import
    if (this.workerFactory) {
      this.worker = this.workerFactory();
    } else {
      this.worker = new RenderWorkerConstructor();
    }

    this.worker.addEventListener('message', this.handleWorkerMessage);
    this.worker.addEventListener('error', this.handleWorkerError);

    this.initPromise = new Promise<string | undefined>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;
    });

    this.postMessage(
      {
        type: 'init',
        canvas,
        capabilities,
      },
      [canvas],
    );

    const hdrMode = await this.initPromise;
    if (hdrMode) {
      this.hdrOutputMode = hdrMode as 'sdr' | 'hlg' | 'pq' | 'extended';
    }
  }

  dispose(): void {
    if (this.disposed) return;

    // Send dispose to worker BEFORE setting disposed flag
    // (postMessage guards against disposed === true)
    if (this.worker && this.workerReady) {
      try {
        this.postMessage({ type: 'dispose' });
      } catch (e) {
        log.warn('Failed to send dispose message to worker:', e);
      }
    }

    this.disposed = true;

    // Clean up any pending bitmap to avoid GPU memory leak
    if (this.pendingBitmap) {
      const bitmapToClose = this.pendingBitmap;
      this.pendingBitmap = null;
      this.pendingBitmapSource = null;
      bitmapToClose
        .then((bmp) => {
          if (bmp) bmp.close();
        })
        .catch((err) => {
          log.warn('Failed to close pending bitmap during dispose:', err);
        });
    }

    // Terminate worker
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleWorkerMessage);
      this.worker.removeEventListener('error', this.handleWorkerError);
      this.worker.terminate();
      this.worker = null;
    }

    // Reject all pending requests
    const error = new Error('RenderWorkerProxy disposed');
    for (const pending of this.pendingRenders.values()) {
      pending.reject(error);
    }
    this.pendingRenders.clear();

    for (const pending of this.pendingPixelReads.values()) {
      pending.reject(error);
    }
    this.pendingPixelReads.clear();

    if (this.initReject) {
      this.initReject(error);
      this.initResolve = null;
      this.initReject = null;
    }

    this.canvas = null;
    this.offscreenCanvas = null;
    this.scopeCache = null;
    this.scopeRequest = null;
    this.lastSentImage = null;
    this.onScopeDataReady = null;
  }

  // ==========================================================================
  // Event hooks
  // ==========================================================================

  /** Set callback for context loss events. */
  setOnContextLost(callback: (() => void) | null): void {
    this.onContextLost = callback;
  }

  /** Set callback for context restore events. */
  setOnContextRestored(callback: (() => void) | null): void {
    this.onContextRestored = callback;
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  resize(width: number, height: number): void {
    this.postMessage({ type: 'resize', width, height });
  }

  setViewport(width: number, height: number): void {
    this.postMessage({ type: 'setViewport', width, height });
  }

  clear(r = 0, g = 0, b = 0, a = 1): void {
    this.postMessage({ type: 'clear', r, g, b, a });
  }

  /**
   * Render an IPImage (HDR path). Synchronous interface for RendererBackend
   * compatibility - sends message to worker.
   */
  renderImage(image: IPImage, _offsetX = 0, _offsetY = 0, _scaleX = 1, _scaleY = 1): void {
    // Fire-and-forget for the synchronous interface
    this.renderHDRAsync(image).catch((err) => {
      log.debug('renderImage fire-and-forget rejected', err);
    });
  }

  /**
   * Render tiled images. Currently delegates to renderImage for each tile
   * sequentially. A future implementation could batch-send to the worker.
   */
  renderTiledImages(
    tiles: { image: IPImage; viewport: import('../nodes/groups/LayoutGroupNode').TileViewport }[],
  ): void {
    // Worker proxy does not support viewport/scissor control yet.
    // Fall back to rendering first tile only as a basic implementation.
    if (tiles.length > 0) {
      this.renderImage(tiles[0]!.image);
    }
  }

  /**
   * Render an HDR image asynchronously via the worker.
   * Serializes IPImage data and transfers the ArrayBuffer.
   */
  async renderHDRAsync(image: IPImage): Promise<void> {
    if (this.disposed || !this.worker || this.contextLost) {
      throw new RenderError('Renderer not available');
    }

    // Flush any dirty state before render
    this.flushDirtyState();

    const id = this.nextId++;
    const dataTypeCode = DATA_TYPE_CODES[image.dataType] ?? 2;
    const transferFunctionCode = image.metadata.transferFunction
      ? TRANSFER_FUNCTION_CODES[image.metadata.transferFunction]
      : undefined;
    const colorPrimariesCode = image.metadata.colorPrimaries
      ? COLOR_PRIMARIES_CODES[image.metadata.colorPrimaries]
      : undefined;

    // Copy the data so we can transfer it
    const dataCopy = image.data.slice(0);

    const promise = new Promise<void>((resolve, reject) => {
      this.pendingRenders.set(id, { resolve, reject });
      this.postMessage(
        {
          type: 'renderHDR',
          id,
          imageData: dataCopy,
          width: image.width,
          height: image.height,
          dataType: dataTypeCode,
          channels: image.channels,
          transferFunction: transferFunctionCode,
          colorPrimaries: colorPrimariesCode,
        },
        [dataCopy],
      );
    });

    this.renderGeneration++;
    this.lastSentImage = new WeakRef(image);
    // Keep scopes live while someone reads them: refresh right after each
    // render. scopeDimsWanted is re-armed by the next renderForScopes() call,
    // so this stops once scopes stop asking.
    const wanted = this.scopeDimsWanted;
    if (wanted) {
      this.scopeDimsWanted = null;
      this.requestScopeData(wanted.width, wanted.height);
    }

    return promise;
  }

  /**
   * Render an SDR frame via the synchronous RendererBackend interface.
   * Returns the canvas element (the OffscreenCanvas auto-composites).
   */
  renderSDRFrame(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
  ): HTMLCanvasElement | null {
    // Fire-and-forget for the synchronous interface
    this.renderSDRFrameAsync(source).catch((err) => {
      log.debug('renderSDRFrame fire-and-forget rejected', err);
    });
    return this.canvas;
  }

  /**
   * Render an SDR frame asynchronously.
   * Converts source to ImageBitmap and transfers to worker.
   */
  async renderSDRFrameAsync(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap,
  ): Promise<void> {
    if (this.disposed || !this.worker || this.contextLost) {
      throw new RenderError('Renderer not available');
    }

    // Flush any dirty state before render
    this.flushDirtyState();

    let bitmap: ImageBitmap;
    if (source instanceof ImageBitmap) {
      bitmap = source;
    } else {
      bitmap = await createImageBitmap(source);
    }

    const id = this.nextId++;
    const width = bitmap.width;
    const height = bitmap.height;
    // The worker drops its HDR image on an SDR frame; it can't serve scopes for it.
    this.lastSentImage = null;

    return new Promise<void>((resolve, reject) => {
      this.pendingRenders.set(id, { resolve, reject });
      this.postMessage(
        {
          type: 'renderSDR',
          id,
          bitmap,
          width,
          height,
        },
        [bitmap],
      );
    });
  }

  // ==========================================================================
  // Double-buffer support (Stage D optimization)
  // ==========================================================================

  /**
   * Pre-create an ImageBitmap for the given source.
   * Call this from frameChanged handler to avoid blocking RAF.
   */
  prepareFrame(source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement): void {
    if (this.disposed || this.pendingBitmapSource === source) return;
    // Close previously pending bitmap to avoid GPU memory leak
    if (this.pendingBitmap) {
      this.pendingBitmap
        .then((bmp) => {
          if (bmp) bmp.close();
        })
        .catch((err) => {
          log.warn('Failed to close previous pending bitmap:', err);
        });
    }
    this.pendingBitmapSource = source;
    this.pendingBitmap = createImageBitmap(source).catch((err) => {
      log.debug('prepareFrame createImageBitmap failed', err);
      return null;
    }) as Promise<ImageBitmap>;
  }

  /**
   * Get the pre-created ImageBitmap if ready, or null.
   * Returns null if the bitmap is not ready yet.
   */
  async getPreparedBitmap(): Promise<ImageBitmap | null> {
    if (!this.pendingBitmap) return null;
    try {
      const bitmap = await this.pendingBitmap;
      this.pendingBitmap = null;
      this.pendingBitmapSource = null;
      return bitmap;
    } catch (e) {
      log.warn('Failed to get prepared bitmap:', e);
      this.pendingBitmap = null;
      this.pendingBitmapSource = null;
      return null;
    }
  }

  /** Whether a render is currently in flight. */
  isRenderInFlight(): boolean {
    return this.renderInFlight;
  }

  // ==========================================================================
  // Pixel readback
  // ==========================================================================

  /**
   * Synchronous readPixelFloat for RendererBackend compatibility.
   * Returns null immediately since the worker is async.
   * Use readPixelFloatAsync for actual pixel data.
   */
  readPixelFloat(_x: number, _y: number, _width: number, _height: number): Float32Array | null {
    return null;
  }

  /**
   * Async pixel readback from the worker.
   */
  async readPixelFloatAsync(x: number, y: number, width: number, height: number): Promise<Float32Array | null> {
    if (this.disposed || !this.worker || this.contextLost) {
      return null;
    }

    const id = this.nextId++;
    return new Promise<Float32Array | null>((resolve, reject) => {
      this.pendingPixelReads.set(id, { resolve, reject });
      this.postMessage({
        type: 'readPixel',
        id,
        x,
        y,
        width,
        height,
      });
    });
  }

  // ==========================================================================
  // Color adjustments (fire-and-forget + local cache)
  // ==========================================================================

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.colorAdjustments = { ...adjustments };
    this.dirtyState.colorAdjustments = this.colorAdjustments;
    this.hasDirtyState = true;
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this.colorAdjustments };
  }

  resetColorAdjustments(): void {
    this.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS });
  }

  // ==========================================================================
  // Color inversion
  // ==========================================================================

  setColorInversion(enabled: boolean): void {
    this.colorInversionEnabled = enabled;
    this.dirtyState.colorInversion = enabled;
    this.hasDirtyState = true;
  }

  getColorInversion(): boolean {
    return this.colorInversionEnabled;
  }

  // ==========================================================================
  // Tone mapping
  // ==========================================================================

  setToneMappingState(state: ToneMappingState): void {
    this.toneMappingState = { ...state };
    this.dirtyState.toneMappingState = this.toneMappingState;
    this.hasDirtyState = true;
  }

  getToneMappingState(): ToneMappingState {
    return { ...this.toneMappingState };
  }

  resetToneMappingState(): void {
    this.setToneMappingState({ ...DEFAULT_TONE_MAPPING_STATE });
  }

  // ==========================================================================
  // HDR output
  // ==========================================================================

  /**
   * Request an HDR output mode on the worker's renderer.
   *
   * The worker applies the mode asynchronously, so the answer here is a
   * capability pre-check (the same conditions under which Renderer can switch
   * the drawing buffer): rec2100 modes need `webglHLG` / `webglPQ`, extended
   * needs `webglDrawingBufferStorage` for its half-float buffer. A mode that
   * fails the pre-check is rejected without touching the worker. An accepted
   * request is cached optimistically and then corrected by the worker's
   * `hdrOutputModeResult`, so getHDROutputMode() reports the mode actually in
   * effect after a switch the worker could not complete.
   */
  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended', capabilities: DisplayCapabilities): boolean {
    if (!canApplyHDROutputMode(mode, capabilities)) {
      log.warn(`HDR output mode '${mode}' not supported by this display/browser; keeping '${this.hdrOutputMode}'`);
      return false;
    }
    const requestId = ++this.hdrOutputModeRequestId;
    this.hdrOutputMode = mode;
    this.dirtyState.hdrOutputMode = { mode, capabilities, requestId };
    this.hasDirtyState = true;
    return true;
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' | 'extended' {
    return this.hdrOutputMode;
  }

  setHDRHeadroom(headroom: number): void {
    this.hdrHeadroom = headroom;
    this.dirtyState.hdrHeadroom = headroom;
    this.hasDirtyState = true;
  }

  getHDRHeadroom(): number {
    return this.hdrHeadroom;
  }

  // ==========================================================================
  // Texture management (stubs - textures live in worker)
  // ==========================================================================

  createTexture(): TextureHandle {
    return null;
  }

  deleteTexture(_texture: TextureHandle): void {
    // No-op: textures are managed in worker
  }

  // ==========================================================================
  // Shader compilation status
  // ==========================================================================

  isShaderReady(): boolean {
    // Worker-based rendering: shaders are compiled in the worker.
    // Once initAsync() resolves, shaders are ready.
    return this.workerReady;
  }

  // ==========================================================================
  // Context access
  // ==========================================================================

  getContext(): WebGL2RenderingContext | null {
    return null; // Context is in the worker
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  // ==========================================================================
  // Effect state setters (fire-and-forget, batched)
  // ==========================================================================

  setBackgroundPattern(state: BackgroundPatternState): void {
    this.dirtyState.backgroundPattern = state;
    this.hasDirtyState = true;
  }

  setCDL(cdl: CDLValues): void {
    this.dirtyState.cdl = cdl;
    this.hasDirtyState = true;
  }

  setCurvesLUT(luts: CurveLUTs | null): void {
    this.dirtyState.curvesLUT = luts;
    this.hasDirtyState = true;
  }

  setColorWheels(state: ColorWheelsState): void {
    this.dirtyState.colorWheels = state;
    this.hasDirtyState = true;
  }

  setFalseColor(state: FalseColorState): void {
    this.dirtyState.falseColor = state;
    this.hasDirtyState = true;
  }

  setZebraStripes(state: ZebraState): void {
    this.dirtyState.zebraStripes = state;
    this.hasDirtyState = true;
  }

  setChannelMode(mode: ChannelMode): void {
    this.dirtyState.channelMode = mode;
    this.hasDirtyState = true;
  }

  setLUT(lutData: Float32Array | null, lutSize: number, intensity: number): void {
    this.dirtyState.lut = { lutData, lutSize, intensity };
    delete this.dirtyState.lookLUT;
    this.hasDirtyState = true;
  }

  /**
   * Check whether the async worker renderer supports the multi-point LUT pipeline
   * (file LUT, look LUT, display LUT).
   */
  supportsMultiPointLUT(): boolean {
    return true;
  }

  setFileLUT(
    data: Float32Array | null,
    size: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.dirtyState.fileLUT = this.createLUTSyncState(data, size, intensity, domainMin, domainMax);
    this.hasDirtyState = true;
  }

  setLookLUT(
    data: Float32Array | null,
    size: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.dirtyState.lookLUT = this.createLUTSyncState(data, size, intensity, domainMin, domainMax);
    delete this.dirtyState.lut;
    this.hasDirtyState = true;
  }

  setDisplayLUT(
    data: Float32Array | null,
    size: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.dirtyState.displayLUT = this.createLUTSyncState(data, size, intensity, domainMin, domainMax);
    this.hasDirtyState = true;
  }

  setDisplayColorState(state: {
    transferFunction: number;
    displayGamma: number;
    displayBrightness: number;
    customGamma: number;
  }): void {
    this.dirtyState.displayColorState = state;
    this.hasDirtyState = true;
  }

  setHighlightsShadows(state: HighlightsShadowsState): void {
    this.dirtyState.highlightsShadows = state;
    this.hasDirtyState = true;
  }

  setVibrance(state: VibranceState): void {
    this.dirtyState.vibrance = state;
    this.hasDirtyState = true;
  }

  setClarity(state: ClarityState): void {
    this.dirtyState.clarity = state.clarity;
    this.hasDirtyState = true;
  }

  setSharpen(state: SharpenState): void {
    this.dirtyState.sharpen = state.amount;
    this.hasDirtyState = true;
  }

  setHSLQualifier(state: HSLQualifierState): void {
    this.dirtyState.hslQualifier = state;
    this.hasDirtyState = true;
  }

  setGamutMapping(state: GamutMappingState): void {
    this.dirtyState.gamutMapping = state;
    this.hasDirtyState = true;
  }

  setPremultMode(mode: number): void {
    this.premultMode = mode;
    this.dirtyState.premultMode = mode;
    this.hasDirtyState = true;
  }

  getPremultMode(): number {
    return this.premultMode;
  }

  setDitherMode(mode: number): void {
    this.ditherMode = mode;
    this.dirtyState.ditherMode = mode;
    this.hasDirtyState = true;
  }

  getDitherMode(): number {
    return this.ditherMode;
  }

  setQuantizeBits(bits: number): void {
    this.quantizeBits = bits;
    this.dirtyState.quantizeBits = bits;
    this.hasDirtyState = true;
  }

  getQuantizeBits(): number {
    return this.quantizeBits;
  }

  setTextureFilterMode(mode: TextureFilterMode): void {
    this._textureFilterMode = mode;
    this.dirtyState.textureFilterMode = mode;
    this.hasDirtyState = true;
  }

  getTextureFilterMode(): TextureFilterMode {
    return this._textureFilterMode;
  }

  /**
   * Forward the full RenderState; the worker's Renderer applies it with the
   * same diffing as the sync path, so every field (file/look/display LUTs,
   * linearize, deinterlace, film emulation, perspective, ...) reaches it.
   */
  applyRenderState(state: RenderState): void {
    // Local caches for the getters.
    this.colorAdjustments = { ...state.colorAdjustments };
    this.colorInversionEnabled = state.colorInversion;
    this.toneMappingState = { ...state.toneMappingState };
    this.premultMode = state.premultMode ?? 0;
    this.ditherMode = state.ditherMode ?? 0;
    this.quantizeBits = state.quantizeBits ?? 0;
    if (state.textureFilterMode !== undefined) {
      this._textureFilterMode = state.textureFilterMode;
    }

    // The worker applies renderState before individual fields. Drop fields that
    // this state supersedes so last-call-wins matches the sync Renderer.
    for (const key of RENDER_STATE_COVERED_SYNC_KEYS) {
      delete this.dirtyState[key];
    }
    if (state.gamutMapping) delete this.dirtyState.gamutMapping;
    if (state.textureFilterMode !== undefined) delete this.dirtyState.textureFilterMode;
    this.pendingRenderState = { ...state };
    this.hasDirtyState = true;
  }

  // ==========================================================================
  // Renderer-only setters (forwarded through syncState)
  // ==========================================================================

  /**
   * OCIO WASM shaders are only installed on the sync Renderer (setOCIOShader),
   * never on the worker, so it is never active here.
   */
  isOCIOWasmActive(): boolean {
    return false;
  }

  setColorPrimaries(
    inputPrimaries: ColorPrimaries | undefined,
    outputColorSpace: 'srgb' | 'display-p3' | 'rec2020',
  ): void {
    this.dirtyState.colorPrimaries = { input: inputPrimaries, output: outputColorSpace };
    this.hasDirtyState = true;
  }

  setLinearize(state: LinearizeState): void {
    this.dirtyState.linearize = { ...state };
    this.hasDirtyState = true;
  }

  setOutOfRange(mode: number): void {
    this.dirtyState.outOfRange = mode;
    this.hasDirtyState = true;
  }

  setChannelSwizzle(swizzle: ChannelSwizzle): void {
    this.dirtyState.channelSwizzle = [...swizzle] as ChannelSwizzle;
    this.hasDirtyState = true;
  }

  setSphericalProjection(state: { enabled: boolean; fov: number; aspect: number; yaw: number; pitch: number }): void {
    this.dirtyState.sphericalProjection = { ...state };
    this.hasDirtyState = true;
  }

  setUserTransform(rotation: number, flipH: boolean, flipV: boolean): void {
    this.dirtyState.userTransform = { rotation, flipH, flipV };
    this.hasDirtyState = true;
  }

  // ==========================================================================
  // Scopes
  // ==========================================================================

  /** Called when fresh scope pixels arrive from the worker. */
  setOnScopeDataReady(callback: (() => void) | null): void {
    this.onScopeDataReady = callback;
  }

  /**
   * Scope pixels for `image`, with the same contract as Renderer.renderForScopes.
   *
   * The worker can't answer synchronously, so this returns the latest readback
   * it has (which may be one render behind) and asks the worker for a fresh
   * one; `onScopeDataReady` fires when it lands. Returns null until the first
   * readback at these dimensions arrives.
   */
  renderForScopes(
    image: IPImage,
    targetWidth: number,
    targetHeight: number,
  ): { data: Float32Array; width: number; height: number } | null {
    this.scopeDimsWanted = { width: targetWidth, height: targetHeight };

    const cache = this.scopeCache;
    const sameDims = cache !== null && cache.width === targetWidth && cache.height === targetHeight;
    const fresh = sameDims && cache.generation === this.renderGeneration && cache.image.deref() === image;

    // The worker can only re-render the image it was last sent. For any other
    // image, the request goes out after that image's render (renderHDRAsync).
    if (!fresh && this.lastSentImage?.deref() === image) {
      this.requestScopeData(targetWidth, targetHeight);
    }

    return sameDims ? { data: cache.data, width: cache.width, height: cache.height } : null;
  }

  private requestScopeData(width: number, height: number): void {
    if (this.disposed || !this.worker || this.contextLost) return;
    const inFlight = this.scopeRequest;
    if (
      inFlight &&
      inFlight.generation === this.renderGeneration &&
      inFlight.width === width &&
      inFlight.height === height
    ) {
      return;
    }
    // State changes since the last render are not drawn yet; send them so the
    // scope matches what the next frame will show.
    this.flushDirtyState();
    const id = this.nextId++;
    this.scopeRequest = { id, generation: this.renderGeneration, image: this.lastSentImage, width, height };
    this.postMessage({ type: 'renderForScopes', id, width, height });
  }

  // ==========================================================================
  // Status queries
  // ==========================================================================

  /** Whether the worker is ready to receive messages. */
  isReady(): boolean {
    return this.workerReady && !this.disposed;
  }

  /** Whether the WebGL context is lost in the worker. */
  isContextLost(): boolean {
    return this.contextLost;
  }

  hasPendingStateChanges(): boolean {
    return this.hasDirtyState;
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Flush all dirty state to the worker as a single syncState message.
   */
  private flushDirtyState(): void {
    if (!this.hasDirtyState || !this.worker) return;

    if (this.pendingRenderState) {
      this.dirtyState.renderState = this.renderStateEncoder.encode(this.pendingRenderState);
      this.pendingRenderState = null;
    }

    // Collect transferables from dirty state
    const transferables: Transferable[] = [];
    this.copyLUTStateForTransfer('lut', transferables);
    this.copyLUTStateForTransfer('lookLUT', transferables);
    this.copyLUTStateForTransfer('fileLUT', transferables);
    this.copyLUTStateForTransfer('displayLUT', transferables);

    this.postMessage(
      { type: 'syncState', state: this.dirtyState },
      transferables.length > 0 ? transferables : undefined,
    );

    this.dirtyState = {};
    this.hasDirtyState = false;
  }

  /**
   * Post a message to the worker with optional transferables.
   * Automatically stamps each message with the current protocol version.
   */
  private postMessage(msg: RenderWorkerMessage, transfer?: Transferable[]): void {
    if (!this.worker || this.disposed) return;
    // Stamp protocol version on every outgoing message
    msg.protocolVersion = RENDER_WORKER_PROTOCOL_VERSION;
    try {
      if (transfer && transfer.length > 0) {
        this.worker.postMessage(msg, transfer);
      } else {
        this.worker.postMessage(msg);
      }
    } catch (error) {
      log.warn('postMessage failed:', error);
    }
  }

  private createLUTSyncState(
    lutData: Float32Array | null,
    lutSize: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): RendererLUTSyncState {
    return {
      lutData,
      lutSize,
      intensity,
      ...(domainMin ? { domainMin } : {}),
      ...(domainMax ? { domainMax } : {}),
    };
  }

  private copyLUTStateForTransfer(
    key: 'lut' | 'lookLUT' | 'fileLUT' | 'displayLUT',
    transferables: Transferable[],
  ): void {
    const stage = this.dirtyState[key];
    if (!stage?.lutData) return;

    const lutCopy = new Float32Array(stage.lutData);
    this.dirtyState[key] = { ...stage, lutData: lutCopy };
    transferables.push(lutCopy.buffer);
  }

  /**
   * Handle messages from the worker.
   */
  private handleWorkerMessage = (event: MessageEvent<RenderWorkerResult>): void => {
    const msg = event.data;

    switch (msg.type) {
      case 'ready':
        this.workerReady = true;
        break;

      case 'initResult':
        if (msg.success) {
          if (msg.hdrMode) {
            this.hdrOutputMode = msg.hdrMode as 'sdr' | 'hlg' | 'pq' | 'extended';
          }
          this.initResolve?.(msg.hdrMode);
        } else {
          this.initReject?.(new Error(msg.error || 'Worker init failed'));
        }
        this.initResolve = null;
        this.initReject = null;
        break;

      case 'renderDone': {
        const pending = this.pendingRenders.get(msg.id);
        if (pending) {
          this.pendingRenders.delete(msg.id);
          this.renderInFlight = this.pendingRenders.size > 0;
          pending.resolve();
        }
        break;
      }

      case 'renderError': {
        const pending = this.pendingRenders.get(msg.id);
        if (pending) {
          this.pendingRenders.delete(msg.id);
          this.renderInFlight = this.pendingRenders.size > 0;
          pending.reject(new Error(msg.error));
        }
        break;
      }

      case 'pixelData': {
        const pending = this.pendingPixelReads.get(msg.id);
        if (pending) {
          this.pendingPixelReads.delete(msg.id);
          pending.resolve(msg.data);
        }
        break;
      }

      case 'scopeData': {
        const request = this.scopeRequest;
        if (!request || request.id !== msg.id) break;
        this.scopeRequest = null;
        const image = request.image?.deref();
        if (msg.data && image) {
          this.scopeCache = {
            image: new WeakRef(image),
            generation: request.generation,
            data: msg.data,
            width: msg.width,
            height: msg.height,
          };
          this.onScopeDataReady?.();
        }
        break;
      }

      case 'hdrOutputModeResult':
        // Only the reply to the latest request describes the current state.
        if (msg.requestId !== undefined && msg.requestId !== this.hdrOutputModeRequestId) break;
        if (!msg.accepted) {
          log.warn(`Worker could not switch HDR output to '${msg.requested}'; staying in '${msg.mode}'`);
        }
        this.hdrOutputMode = msg.mode;
        break;

      case 'contextLost':
        this.contextLost = true;
        this.onContextLost?.();
        break;

      case 'contextRestored':
        this.contextLost = false;
        this.onContextRestored?.();
        break;
    }
  };

  /**
   * Handle worker errors (unrecoverable).
   */
  private handleWorkerError = (event: ErrorEvent): void => {
    log.error('Worker error:', event.message);

    // Reject all pending requests
    const error = new Error(`Worker error: ${event.message}`);
    for (const pending of this.pendingRenders.values()) {
      pending.reject(error);
    }
    this.pendingRenders.clear();

    for (const pending of this.pendingPixelReads.values()) {
      pending.reject(error);
    }
    this.pendingPixelReads.clear();

    this.scopeRequest = null;
    this.renderInFlight = false;
  };
}
