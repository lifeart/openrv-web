/**
 * RendererBackend - Abstract interface for rendering backends
 *
 * Phase 4: Extracted from the Renderer class to allow multiple backend
 * implementations (WebGL2, WebGPU). All public rendering methods are
 * defined here so that consumers can work with any backend transparently.
 */

import type { IPImage } from '../core/image/Image';
import type { ColorAdjustments } from '../ui/components/ColorControls';
import type { ToneMappingState } from '../ui/components/ToneMappingControl';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';

/**
 * Opaque texture handle.
 *
 * WebGL2Backend returns a WebGLTexture; WebGPUBackend returns null (it uses
 * GPUTexture internally). The opaque type keeps the interface backend-agnostic
 * while remaining assignable from both concrete backends.
 */
export type TextureHandle = WebGLTexture | null;

/**
 * Complete rendering backend interface.
 *
 * Implementations must support initialization, image rendering,
 * color adjustments, tone mapping, HDR output, and resource cleanup.
 */
export interface RendererBackend {
  // --- Lifecycle ---

  /** Initialize the backend with a canvas element and optional capabilities. */
  initialize(canvas: HTMLCanvasElement, capabilities?: DisplayCapabilities): void;

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

  // --- Rendering ---

  /** Resize the rendering viewport. */
  resize(width: number, height: number): void;

  /** Clear the canvas to the given color. */
  clear(r?: number, g?: number, b?: number, a?: number): void;

  /** Render an image with the given transform. */
  renderImage(
    image: IPImage,
    offsetX?: number,
    offsetY?: number,
    scaleX?: number,
    scaleY?: number,
  ): void;

  // --- Color adjustments ---

  /** Set the current color adjustments (exposure, gamma, saturation, etc.). */
  setColorAdjustments(adjustments: ColorAdjustments): void;

  /** Get the current color adjustments. */
  getColorAdjustments(): ColorAdjustments;

  /** Reset color adjustments to defaults. */
  resetColorAdjustments(): void;

  // --- Color inversion ---

  /** Enable or disable color inversion. */
  setColorInversion(enabled: boolean): void;

  /** Get the current color inversion state. */
  getColorInversion(): boolean;

  // --- Tone mapping ---

  /** Set the tone mapping state. */
  setToneMappingState(state: ToneMappingState): void;

  /** Get the current tone mapping state. */
  getToneMappingState(): ToneMappingState;

  /** Reset tone mapping to defaults. */
  resetToneMappingState(): void;

  // --- HDR output ---

  /** Set the HDR output mode. Returns true if mode was applied successfully. */
  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq', capabilities: DisplayCapabilities): boolean;

  /** Get the current HDR output mode. */
  getHDROutputMode(): 'sdr' | 'hlg' | 'pq';

  // --- Texture management ---

  /** Create a new texture handle. Returns null if the backend is not initialized or uses a different texture system. */
  createTexture(): TextureHandle;

  /** Delete a texture by handle. No-op if the handle is null or the backend uses a different texture system. */
  deleteTexture(texture: TextureHandle): void;

  // --- Context access ---

  /** Get the underlying WebGL2 context, or null for non-WebGL backends. */
  getContext(): WebGL2RenderingContext | null;
}
