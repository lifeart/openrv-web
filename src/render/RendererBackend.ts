/**
 * RendererBackend - Abstract interface for rendering backends
 *
 * Phase 4: Extracted from the Renderer class to allow multiple backend
 * implementations (WebGL2, WebGPU). All public rendering methods are
 * defined here so that consumers can work with any backend transparently.
 *
 * The interface is organized into logical sub-interfaces:
 * - RendererLifecycle: initialization, disposal, resize, clear
 * - RendererColorPipeline: color adjustments, CDL, curves, wheels, channels, HSL
 * - RendererEffects: tone mapping, zebra, false color, highlights/shadows, vibrance, clarity, sharpen
 * - RendererHDR: HDR output, display color management, background pattern, 3D LUT
 *
 * RendererBackend extends all four sub-interfaces and adds core rendering,
 * texture management, batch state, and async/offscreen methods.
 */

import type { IPImage } from '../core/image/Image';
import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState } from '../core/types/color';
import type { ToneMappingState, ZebraState, HighlightsShadowsState, VibranceState, ClarityState, SharpenState, FalseColorState } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState, DisplayColorConfig } from './RenderState';

/**
 * Opaque texture handle.
 *
 * WebGL2Backend returns a WebGLTexture; WebGPUBackend returns null (it uses
 * GPUTexture internally). The opaque type keeps the interface backend-agnostic
 * while remaining assignable from both concrete backends.
 */
export type TextureHandle = WebGLTexture | null;

// ---------------------------------------------------------------------------
// Sub-interfaces
// ---------------------------------------------------------------------------

/**
 * Lifecycle methods: initialization, disposal, viewport management.
 */
export interface RendererLifecycle {
  /** Initialize the backend with a canvas element and optional capabilities. */
  initialize(canvas: HTMLCanvasElement | OffscreenCanvas, capabilities?: DisplayCapabilities): void;

  /**
   * Perform any async initialization required by the backend.
   *
   * WebGL2Backend is fully synchronous so this resolves immediately.
   * WebGPUBackend must request a GPU adapter and device asynchronously.
   *
   * Callers should always await this after initialize() for portability.
   */
  initAsync(): Promise<void>;

  /** Release all GPU resources. After dispose(), no other methods should be called. */
  dispose(): void;

  /** Resize the rendering viewport. */
  resize(width: number, height: number): void;

  /** Clear the canvas to the given color. */
  clear(r?: number, g?: number, b?: number, a?: number): void;
}

/**
 * Color pipeline methods: adjustments, CDL, curves, color wheels, channel
 * isolation, color inversion, and HSL qualifier.
 */
export interface RendererColorPipeline {
  /** Set the current color adjustments (exposure, gamma, saturation, etc.). */
  setColorAdjustments(adjustments: ColorAdjustments): void;

  /** Get the current color adjustments. */
  getColorAdjustments(): ColorAdjustments;

  /** Reset color adjustments to defaults. */
  resetColorAdjustments(): void;

  /** Enable or disable color inversion. */
  setColorInversion(enabled: boolean): void;

  /** Get the current color inversion state. */
  getColorInversion(): boolean;

  /** Set CDL (Color Decision List) values. */
  setCDL(cdl: CDLValues): void;

  /** Set curves LUT data (256-entry per channel). Null disables curves. */
  setCurvesLUT(luts: CurveLUTs | null): void;

  /** Set color wheels (Lift/Gamma/Gain) state. */
  setColorWheels(state: ColorWheelsState): void;

  /** Set channel isolation mode. */
  setChannelMode(mode: ChannelMode): void;

  /** Set HSL qualifier (secondary color correction) state. */
  setHSLQualifier(state: HSLQualifierState): void;
}

/**
 * Visual effects methods: tone mapping, zebra stripes, false color,
 * highlights/shadows, vibrance, clarity, and sharpen.
 */
export interface RendererEffects {
  /** Set the tone mapping state. */
  setToneMappingState(state: ToneMappingState): void;

  /** Get the current tone mapping state. */
  getToneMappingState(): ToneMappingState;

  /** Reset tone mapping to defaults. */
  resetToneMappingState(): void;

  /** Set false color enabled state and LUT data (256*3 RGB Uint8Array). */
  setFalseColor(state: FalseColorState): void;

  /** Set zebra stripes state. */
  setZebraStripes(state: ZebraState): void;

  /** Set highlights/shadows/whites/blacks adjustment values (range: -100 to +100 each). */
  setHighlightsShadows(state: HighlightsShadowsState): void;

  /** Set vibrance amount (-100 to +100) and skin protection toggle. */
  setVibrance(state: VibranceState): void;

  /** Set clarity (local contrast) amount (-100 to +100). */
  setClarity(state: ClarityState): void;

  /** Set sharpen (unsharp mask) amount (0 to 100). */
  setSharpen(state: SharpenState): void;
}

/**
 * HDR and display color management methods: HDR output mode, display color
 * configuration, background pattern, and 3D LUT.
 */
export interface RendererHDR {
  /** Set the HDR output mode. Returns true if mode was applied successfully. */
  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq', capabilities: DisplayCapabilities): boolean;

  /** Get the current HDR output mode. */
  getHDROutputMode(): 'sdr' | 'hlg' | 'pq';

  /** Set the display color management state (transfer function, gamma, brightness). */
  setDisplayColorState(state: DisplayColorConfig): void;

  /** Set background pattern for alpha compositing in HDR mode. */
  setBackgroundPattern(state: BackgroundPatternState): void;

  /** Set 3D LUT for single-pass application in the main shader. Pass null to disable. */
  setLUT(lutData: Float32Array | null, lutSize: number, intensity: number): void;
}

// ---------------------------------------------------------------------------
// Composite interface
// ---------------------------------------------------------------------------

/**
 * Complete rendering backend interface.
 *
 * Implementations must support initialization, image rendering,
 * color adjustments, tone mapping, HDR output, and resource cleanup.
 */
export interface RendererBackend extends RendererLifecycle, RendererColorPipeline, RendererEffects, RendererHDR {
  // --- Rendering ---

  /** Render an image with the given transform. */
  renderImage(
    image: IPImage,
    offsetX?: number,
    offsetY?: number,
    scaleX?: number,
    scaleY?: number,
  ): void;

  // --- Texture management ---

  /** Create a new texture handle. Returns null if the backend is not initialized or uses a different texture system. */
  createTexture(): TextureHandle;

  /** Delete a texture by handle. No-op if the handle is null or the backend uses a different texture system. */
  deleteTexture(texture: TextureHandle): void;

  // --- Context access ---

  /** Get the underlying WebGL2 context, or null for non-WebGL backends. */
  getContext(): WebGL2RenderingContext | null;

  /** Read float pixel values from the WebGL framebuffer. Returns null if not supported. */
  readPixelFloat(x: number, y: number, width: number, height: number): Float32Array | null;

  // --- Shader compilation status ---

  /**
   * Whether the shader program is fully compiled and ready for rendering.
   *
   * When KHR_parallel_shader_compile is used, this returns false while the
   * GPU driver is still compiling shaders asynchronously. Callers can use
   * this to show a loading indicator or skip rendering until the shader is
   * ready.
   *
   * Backends that compile synchronously (or have no shader compilation step)
   * should always return true after initialization.
   */
  isShaderReady(): boolean;

  // --- Batch state application ---

  /** Apply all render state in a single call, replacing individual setter calls. */
  applyRenderState(state: RenderState): void;

  // --- SDR frame rendering (Phase 1A) ---

  /**
   * Render an SDR source through the full GPU shader pipeline.
   * Accepts HTMLVideoElement, HTMLCanvasElement, OffscreenCanvas, or HTMLImageElement.
   * Returns the WebGL canvas element for compositing, or null if WebGL is unavailable.
   */
  renderSDRFrame(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
  ): HTMLCanvasElement | null;

  /** Get the underlying canvas element used for rendering. */
  getCanvasElement(): HTMLCanvasElement | null;

  // --- Phase 4: Async/OffscreenCanvas methods (optional) ---

  /** Whether this backend renders asynchronously (worker-based). */
  readonly isAsync?: boolean;

  /** Initialize with an OffscreenCanvas (for worker-based backends). */
  initializeOffscreen?(canvas: OffscreenCanvas, capabilities?: DisplayCapabilities): Promise<void>;

  /**
   * Render an SDR frame asynchronously.
   * Returns a promise that resolves when rendering is complete.
   * The result is automatically composited to the visible canvas.
   */
  renderSDRFrameAsync?(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap,
  ): Promise<void>;

  /** Read pixel data asynchronously (for worker-based backends). */
  readPixelFloatAsync?(x: number, y: number, w: number, h: number): Promise<Float32Array | null>;
}
