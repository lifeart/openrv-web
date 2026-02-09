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

import type { IPImage } from '../core/image/Image';
import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState } from '../core/types/color';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../core/types/color';
import type { ToneMappingState, ZebraState, HighlightsShadowsState, VibranceState, ClarityState, SharpenState, FalseColorState } from '../core/types/effects';
import { DEFAULT_TONE_MAPPING_STATE } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend, TextureHandle } from './RendererBackend';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState } from './RenderState';
import type {
  RenderWorkerMessage,
  RenderWorkerResult,
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

export class RenderWorkerProxy implements RendererBackend {
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
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' = 'sdr';

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
      this.hdrOutputMode = hdrMode as 'sdr' | 'hlg' | 'pq';
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
      this.hdrOutputMode = hdrMode as 'sdr' | 'hlg' | 'pq';
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
      bitmapToClose.then(bmp => { if (bmp) bmp.close(); }).catch((err) => { log.warn('Failed to close pending bitmap during dispose:', err); });
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

  clear(r = 0, g = 0, b = 0, a = 1): void {
    this.postMessage({ type: 'clear', r, g, b, a });
  }

  /**
   * Render an IPImage (HDR path). Synchronous interface for RendererBackend
   * compatibility - sends message to worker.
   */
  renderImage(
    image: IPImage,
    _offsetX = 0,
    _offsetY = 0,
    _scaleX = 1,
    _scaleY = 1,
  ): void {
    // Fire-and-forget for the synchronous interface
    this.renderHDRAsync(image).catch((err) => { log.debug('renderImage fire-and-forget rejected', err); });
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

    return new Promise<void>((resolve, reject) => {
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
  }

  /**
   * Render an SDR frame via the synchronous RendererBackend interface.
   * Returns the canvas element (the OffscreenCanvas auto-composites).
   */
  renderSDRFrame(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
  ): HTMLCanvasElement | null {
    // Fire-and-forget for the synchronous interface
    this.renderSDRFrameAsync(source).catch((err) => { log.debug('renderSDRFrame fire-and-forget rejected', err); });
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
      this.pendingBitmap.then(bmp => { if (bmp) bmp.close(); }).catch((err) => { log.warn('Failed to close previous pending bitmap:', err); });
    }
    this.pendingBitmapSource = source;
    this.pendingBitmap = createImageBitmap(source).catch((err) => { log.debug('prepareFrame createImageBitmap failed', err); return null; }) as Promise<ImageBitmap>;
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

  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq', capabilities: DisplayCapabilities): boolean {
    this.hdrOutputMode = mode;
    this.dirtyState.hdrOutputMode = { mode, capabilities };
    this.hasDirtyState = true;
    return true;
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' {
    return this.hdrOutputMode;
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
    this.hasDirtyState = true;
  }

  setDisplayColorState(state: { transferFunction: number; displayGamma: number; displayBrightness: number; customGamma: number }): void {
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

  applyRenderState(state: RenderState): void {
    this.setColorAdjustments(state.colorAdjustments);
    this.setColorInversion(state.colorInversion);
    this.setToneMappingState(state.toneMappingState);
    this.setBackgroundPattern(state.backgroundPattern);
    this.setCDL(state.cdl);
    this.setCurvesLUT(state.curvesLUT);
    this.setColorWheels(state.colorWheels);
    this.setFalseColor(state.falseColor);
    this.setZebraStripes(state.zebraStripes);
    this.setChannelMode(state.channelMode);
    this.setLUT(state.lut.data, state.lut.size, state.lut.intensity);
    this.setDisplayColorState(state.displayColor);
    this.setHighlightsShadows(state.highlightsShadows);
    this.setVibrance({ vibrance: state.vibrance.amount, skinProtection: state.vibrance.skinProtection });
    this.setClarity({ clarity: state.clarity });
    this.setSharpen({ amount: state.sharpen });
    this.setHSLQualifier(state.hslQualifier);
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

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Flush all dirty state to the worker as a single syncState message.
   */
  private flushDirtyState(): void {
    if (!this.hasDirtyState || !this.worker) return;

    // Collect transferables from dirty state
    const transferables: Transferable[] = [];
    if (this.dirtyState.lut?.lutData) {
      // Copy lut data for transfer since the original may be reused
      const lutCopy = new Float32Array(this.dirtyState.lut.lutData);
      this.dirtyState.lut = { ...this.dirtyState.lut, lutData: lutCopy };
      transferables.push(lutCopy.buffer);
    }

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
            this.hdrOutputMode = msg.hdrMode as 'sdr' | 'hlg' | 'pq';
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

    this.renderInFlight = false;
  };
}
