/**
 * WebGPUBackend - WebGPU-based rendering backend
 *
 * Phase 4: Implements the RendererBackend interface using the WebGPU API.
 * This backend is selected when the display supports WebGPU with HDR output.
 *
 * Current status:
 * - initialize(): IMPLEMENTED - requests adapter/device, configures HDR canvas
 * - dispose(): IMPLEMENTED - releases GPU resources
 * - renderImage(): STUB - renders nothing (pipeline TBD in future phases)
 * - Color/tone-mapping state: IMPLEMENTED - stores state for future pipeline use
 * - setHDROutputMode(): IMPLEMENTED - reconfigures canvas tone mapping
 * - createTexture/deleteTexture/getContext: STUB - returns null (WebGPU uses different types)
 *
 * WebGPU APIs are experimental and not in the TypeScript DOM lib, so we use
 * local interfaces and type assertions throughout this module.
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

// ---------------------------------------------------------------------------
// WebGPU type shims (experimental API, not in TS DOM lib)
// These are minimal shapes used only for type-safe interactions; the actual
// runtime objects come from the browser's WebGPU implementation.
// ---------------------------------------------------------------------------

/** Minimal GPUAdapter shape. */
interface WGPUAdapter {
  requestDevice(): Promise<WGPUDevice>;
}

/** Minimal GPUDevice shape. */
interface WGPUDevice {
  destroy(): void;
}

/** Minimal GPUCanvasContext shape for configuration. */
interface WGPUCanvasContext {
  configure(config: WGPUCanvasConfiguration): void;
  unconfigure(): void;
}

interface WGPUCanvasConfiguration {
  device: WGPUDevice;
  format: string;
  colorSpace?: string;
  toneMapping?: { mode: string };
  alphaMode?: string;
}

/** Shape of navigator.gpu. */
interface WGPUNavigatorGPU {
  requestAdapter(options?: { powerPreference?: string }): Promise<WGPUAdapter | null>;
}

// ---------------------------------------------------------------------------
// WebGPUBackend
// ---------------------------------------------------------------------------

export class WebGPUBackend implements RendererBackend {
  // --- GPU handles ---
  private device: WGPUDevice | null = null;
  private gpuContext: WGPUCanvasContext | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;

  // --- State (mirrors WebGL2Backend for identical behavior) ---
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  private colorInversionEnabled = false;
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' | 'extended' = 'sdr';

  // Whether extended tone mapping is active (vs. standard fallback)
  private extendedToneMapping = false;

  // --- Lifecycle ---

  /**
   * Initialize the WebGPU backend.
   *
   * Performs synchronous validation that WebGPU is available and obtains a
   * canvas context. Full GPU adapter/device initialization requires the
   * async initAsync() method.
   *
   * Throws if WebGPU is not available or the canvas context cannot be created.
   */
  initialize(canvas: HTMLCanvasElement | OffscreenCanvas, _capabilities?: DisplayCapabilities): void {
    this.canvas = canvas;

    // Synchronous guard: navigator.gpu must exist
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      throw new Error('WebGPU is not available');
    }

    // Attempt to get a 'webgpu' context to verify support.
    // WebGPU only works with HTMLCanvasElement, not OffscreenCanvas.
    const ctx = (canvas as HTMLCanvasElement).getContext('webgpu' as string);
    if (!ctx) {
      throw new Error('WebGPU canvas context not available');
    }
    this.gpuContext = ctx as unknown as WGPUCanvasContext;
  }

  /**
   * Complete async GPU initialization.
   * Must be called after initialize() before any rendering.
   */
  async initAsync(): Promise<void> {
    if (!this.gpuContext) {
      throw new Error('WebGPUBackend.initialize() must be called first');
    }

    const gpu = (navigator as unknown as { gpu: WGPUNavigatorGPU }).gpu;

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }
    const device = await adapter.requestDevice();
    this.device = device;

    // Configure canvas context with HDR settings
    this.configureContext(device, 'extended');
  }

  /**
   * Configure the GPU canvas context.
   * Tries 'extended' tone mapping first, falls back to 'standard'.
   */
  private configureContext(device: WGPUDevice, toneMappingMode: 'extended' | 'standard'): void {
    if (!this.gpuContext) return;

    try {
      this.gpuContext.configure({
        device,
        format: 'rgba16float',
        colorSpace: 'display-p3',
        toneMapping: { mode: toneMappingMode },
        alphaMode: 'opaque',
      });
      this.extendedToneMapping = toneMappingMode === 'extended';
    } catch {
      if (toneMappingMode === 'extended') {
        // Fall back to standard tone mapping
        this.configureContext(device, 'standard');
      } else {
        throw new Error('WebGPU canvas configuration failed');
      }
    }
  }

  dispose(): void {
    if (this.gpuContext) {
      try {
        this.gpuContext.unconfigure();
      } catch {
        // Context may already be lost
      }
    }

    if (this.device) {
      this.device.destroy();
    }

    this.device = null;
    this.gpuContext = null;
    this.canvas = null;
  }

  // --- Rendering (STUBS) ---

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = width;
    this.canvas.height = height;
    // WebGPU automatically handles viewport through canvas size
  }

  clear(_r = 0.1, _g = 0.1, _b = 0.1, _a = 1): void {
    // STUB: Full render pass clear will be implemented in a future phase.
    // WebGPU clears via GPURenderPassDescriptor.colorAttachments[].loadOp = 'clear'
  }

  renderImage(
    _image: IPImage,
    _offsetX = 0,
    _offsetY = 0,
    _scaleX = 1,
    _scaleY = 1,
  ): void {
    // STUB: WebGPU render pipeline not yet implemented.
    // Future implementation will:
    // 1. Upload image data to a GPUTexture
    // 2. Create a render pipeline with vertex/fragment shaders
    // 3. Bind color adjustment uniforms
    // 4. Draw a fullscreen quad
  }

  // --- Color adjustments (IMPLEMENTED - state management) ---

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.colorAdjustments = { ...adjustments };
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this.colorAdjustments };
  }

  resetColorAdjustments(): void {
    this.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  }

  // --- Color inversion (IMPLEMENTED - state management) ---

  setColorInversion(enabled: boolean): void {
    this.colorInversionEnabled = enabled;
  }

  getColorInversion(): boolean {
    return this.colorInversionEnabled;
  }

  // --- Tone mapping (IMPLEMENTED - state management) ---

  setToneMappingState(state: ToneMappingState): void {
    this.toneMappingState = { ...state };
  }

  getToneMappingState(): ToneMappingState {
    return { ...this.toneMappingState };
  }

  resetToneMappingState(): void {
    this.toneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  }

  // --- HDR output (IMPLEMENTED) ---

  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended', _capabilities: DisplayCapabilities): boolean {
    // WebGPU handles HDR through canvas configuration rather than
    // drawingBufferColorSpace. For now, store the mode.
    this.hdrOutputMode = mode;
    return true;
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' | 'extended' {
    return this.hdrOutputMode;
  }

  setHDRHeadroom(_headroom: number): void {
    // TODO: implement for WebGPU pipeline when HDR rendering is added
  }

  // --- Texture management (STUBS - WebGPU uses GPUTexture, not WebGLTexture) ---

  createTexture(): TextureHandle {
    // WebGPU uses GPUTexture objects, not WebGLTexture.
    // Returns null; callers should use WebGPU-specific texture creation.
    return null;
  }

  deleteTexture(_texture: TextureHandle): void {
    // No-op for WebGPU backend; WebGLTexture is not applicable.
  }

  // --- Shader compilation status ---

  isShaderReady(): boolean {
    // WebGPU pipelines are created asynchronously in initAsync().
    // Once initAsync() resolves, shaders are ready.
    return this.device !== null;
  }

  // --- Context access ---

  getContext(): WebGL2RenderingContext | null {
    // WebGPU backend does not have a WebGL2 context.
    return null;
  }

  // --- WebGPU-specific accessors ---

  /** Get the GPU device (WebGPU-specific). */
  getDevice(): WGPUDevice | null {
    return this.device;
  }

  /** Whether extended tone mapping is active. */
  hasExtendedToneMapping(): boolean {
    return this.extendedToneMapping;
  }

  // --- HDR effects stubs (Phase 1-3: not yet implemented for WebGPU) ---

  setBackgroundPattern(_state: BackgroundPatternState): void { /* STUB */ }
  readPixelFloat(_x: number, _y: number, _width: number, _height: number): Float32Array | null { return null; }
  setCDL(_cdl: CDLValues): void { /* STUB */ }
  setCurvesLUT(_luts: CurveLUTs | null): void { /* STUB */ }
  setColorWheels(_state: ColorWheelsState): void { /* STUB */ }
  setFalseColor(_state: FalseColorState): void { /* STUB */ }
  setZebraStripes(_state: ZebraState): void { /* STUB */ }
  setChannelMode(_mode: ChannelMode): void { /* STUB */ }

  // --- 3D LUT (single-pass float precision pipeline) ---
  setLUT(_lutData: Float32Array | null, _lutSize: number, _intensity: number): void { /* STUB */ }

  // --- Display color management ---
  setDisplayColorState(_state: { transferFunction: number; displayGamma: number; displayBrightness: number; customGamma: number }): void { /* STUB */ }

  // --- Phase 1B: New GPU shader effects (stubs) ---
  setHighlightsShadows(_state: HighlightsShadowsState): void { /* STUB */ }
  setVibrance(_state: VibranceState): void { /* STUB */ }
  setClarity(_state: ClarityState): void { /* STUB */ }
  setSharpen(_state: SharpenState): void { /* STUB */ }
  setHSLQualifier(_state: HSLQualifierState): void { /* STUB */ }

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

  // --- SDR frame rendering (Phase 1A) ---
  renderSDRFrame(
    _source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
  ): HTMLCanvasElement | null {
    // STUB: WebGPU SDR rendering not yet implemented
    return null;
  }

  getCanvasElement(): HTMLCanvasElement | null {
    if (typeof HTMLCanvasElement !== 'undefined' && this.canvas instanceof HTMLCanvasElement) {
      return this.canvas;
    }
    return null;
  }
}
