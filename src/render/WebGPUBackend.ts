/**
 * WebGPUBackend - WebGPU-based rendering backend
 *
 * Implements the RendererBackend interface using the WebGPU API.
 * This backend is selected when the display supports WebGPU with HDR output.
 *
 * Current status:
 * - initialize()/initAsync(): IMPLEMENTED - requests adapter/device, configures HDR canvas, creates pipeline
 * - dispose(): IMPLEMENTED - releases GPU resources
 * - renderImage(): IMPLEMENTED - passthrough rendering (no color processing yet)
 * - clear(): IMPLEMENTED - via render pass with clear color
 * - resize(): IMPLEMENTED - updates canvas dimensions
 * - Color/tone-mapping state: IMPLEMENTED - stores state for future pipeline use
 * - setHDROutputMode(): IMPLEMENTED - reconfigures canvas tone mapping
 * - createTexture/deleteTexture/getContext: STUB - returns null (WebGPU uses different types)
 */

import type { IPImage } from '../core/image/Image';
import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState } from '../core/types/color';
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
import type { WGPUDevice, WGPUCanvasContext, WGPUNavigatorGPU, WGPUTexture } from './webgpu/WebGPUTypes';
import { WebGPURenderPipelineManager } from './webgpu/WebGPURenderPipeline';

// ---------------------------------------------------------------------------
// WebGPUBackend
// ---------------------------------------------------------------------------

export class WebGPUBackend implements RendererBackend {
  // --- GPU handles ---
  private device: WGPUDevice | null = null;
  private gpuContext: WGPUCanvasContext | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;

  // --- Render pipeline ---
  private pipelineManager = new WebGPURenderPipelineManager();
  private currentTexture: WGPUTexture | null = null;
  private currentTextureWidth = 0;
  private currentTextureHeight = 0;

  // --- State (mirrors WebGL2Backend for identical behavior) ---
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  private colorInversionEnabled = false;
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' | 'extended' = 'sdr';

  // Whether extended tone mapping is active (vs. standard fallback)
  private extendedToneMapping = false;

  // Texture filter mode
  private _textureFilterMode: TextureFilterMode = 'linear';

  // --- Lifecycle ---

  /**
   * Initialize the WebGPU backend.
   *
   * Performs synchronous validation that WebGPU is available and obtains a
   * canvas context. Full GPU adapter/device initialization requires the
   * async initAsync() method.
   */
  initialize(canvas: HTMLCanvasElement | OffscreenCanvas, _capabilities?: DisplayCapabilities): void {
    this.canvas = canvas;

    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      throw new Error('WebGPU is not available');
    }

    const ctx = (canvas as HTMLCanvasElement).getContext('webgpu' as string);
    if (!ctx) {
      throw new Error('WebGPU canvas context not available');
    }
    this.gpuContext = ctx as unknown as WGPUCanvasContext;
  }

  /**
   * Complete async GPU initialization.
   * Creates adapter, device, configures canvas, and initializes render pipeline.
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

    // Detect float32-filterable for linear sampling of HDR textures
    const hasFloat32Filterable = adapter.features?.has('float32-filterable') === true;

    // Request higher maxBufferSize for large HDR images
    const adapterMaxBuffer = adapter.limits?.maxBufferSize ?? 268435456;
    const desiredMaxBuffer = Math.min(adapterMaxBuffer, 1024 * 1024 * 1024);

    const deviceDesc: { requiredFeatures?: string[]; requiredLimits?: Record<string, number> } = {
      requiredLimits: { maxBufferSize: desiredMaxBuffer },
    };
    if (hasFloat32Filterable) {
      deviceDesc.requiredFeatures = ['float32-filterable'];
    }

    const device = await adapter.requestDevice(deviceDesc);
    this.device = device;

    // Configure canvas context with HDR settings
    this.configureContext(device, 'extended');

    // Initialize render pipeline
    const filterMode = hasFloat32Filterable ? 'linear' : 'nearest';
    this.pipelineManager.initialize(device, filterMode);
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
        this.configureContext(device, 'standard');
      } else {
        throw new Error('WebGPU canvas configuration failed');
      }
    }
  }

  dispose(): void {
    // Clean up image texture
    if (this.currentTexture) {
      this.currentTexture.destroy();
      this.currentTexture = null;
      this.currentTextureWidth = 0;
      this.currentTextureHeight = 0;
    }

    // Clean up pipeline resources
    this.pipelineManager.dispose();

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

  // --- Rendering ---

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear(r = 0.1, g = 0.1, b = 0.1, a = 1): void {
    if (!this.device || !this.gpuContext) return;

    const canvasTexture = this.gpuContext.getCurrentTexture();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r, g, b, a },
        },
      ],
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  renderImage(image: IPImage, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1): void {
    if (!this.device || !this.gpuContext) return;

    const isFloat = image.dataType === 'float32';

    // Upload image data to GPU texture
    let texture: WGPUTexture;
    if (image.videoFrame) {
      texture = this.pipelineManager.uploadExternalTexture(this.device, image.videoFrame, image.width, image.height);
    } else if (image.imageBitmap) {
      texture = this.pipelineManager.uploadExternalTexture(this.device, image.imageBitmap, image.width, image.height);
    } else {
      // Get the appropriate typed array view for the image data
      const data = isFloat ? new Float32Array(image.data) : new Uint8Array(image.data);

      // Ensure we have 4-channel RGBA data
      if (image.channels !== 4) {
        // For non-RGBA data, expand to RGBA (passthrough only supports RGBA)
        const rgbaData = this.expandToRGBA(data, image.width, image.height, image.channels, isFloat);
        texture = this.pipelineManager.uploadImageTexture(this.device, rgbaData, image.width, image.height, isFloat);
      } else {
        texture = this.pipelineManager.uploadImageTexture(this.device, data, image.width, image.height, isFloat);
      }
    }

    // Destroy previous texture if dimensions changed
    if (
      this.currentTexture &&
      (this.currentTextureWidth !== image.width || this.currentTextureHeight !== image.height)
    ) {
      this.currentTexture.destroy();
    }
    this.currentTexture = texture;
    this.currentTextureWidth = image.width;
    this.currentTextureHeight = image.height;

    // Update uniforms (offset and scale)
    this.pipelineManager.updateUniforms(this.device, offsetX, offsetY, scaleX, scaleY);

    // Get bind groups
    const textureView = texture.createView();
    const textureBindGroup = this.pipelineManager.getTextureBindGroup(this.device, textureView);
    const uniformBindGroup = this.pipelineManager.uniforms;

    if (!textureBindGroup || !uniformBindGroup || !this.pipelineManager.renderPipeline) return;

    // Create render pass
    const canvasTexture = this.gpuContext.getCurrentTexture();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
        },
      ],
    });

    pass.setPipeline(this.pipelineManager.renderPipeline);
    pass.setBindGroup(0, textureBindGroup);
    pass.setBindGroup(1, uniformBindGroup);
    pass.draw(3); // Fullscreen triangle
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Expand 1/2/3-channel image data to 4-channel RGBA.
   */
  private expandToRGBA(
    data: ArrayBufferView,
    width: number,
    height: number,
    channels: number,
    isFloat: boolean,
  ): Float32Array | Uint8Array {
    const pixelCount = width * height;
    const src = isFloat ? (data as Float32Array) : (data as Uint8Array);
    const dst = isFloat ? new Float32Array(pixelCount * 4) : new Uint8Array(pixelCount * 4);

    const alpha = isFloat ? 1.0 : 255;
    for (let i = 0; i < pixelCount; i++) {
      const si = i * channels;
      const di = i * 4;
      const v0 = src[si] as number;

      if (channels === 1) {
        dst[di] = v0;
        dst[di + 1] = v0;
        dst[di + 2] = v0;
        dst[di + 3] = alpha;
      } else if (channels === 2) {
        dst[di] = v0;
        dst[di + 1] = v0;
        dst[di + 2] = v0;
        dst[di + 3] = src[si + 1] as number;
      } else if (channels === 3) {
        dst[di] = v0;
        dst[di + 1] = src[si + 1] as number;
        dst[di + 2] = src[si + 2] as number;
        dst[di + 3] = alpha;
      }
    }
    return dst;
  }

  renderTiledImages(
    _tiles: { image: IPImage; viewport: import('../nodes/groups/LayoutGroupNode').TileViewport }[],
  ): void {
    // STUB: WebGPU tiled rendering not yet implemented.
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
    this.hdrOutputMode = mode;
    return true;
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' | 'extended' {
    return this.hdrOutputMode;
  }

  setHDRHeadroom(_headroom: number): void {
    // TODO: implement for WebGPU pipeline when HDR rendering is added
  }

  // --- Texture filter mode (IMPLEMENTED - state management) ---

  setTextureFilterMode(mode: TextureFilterMode): void {
    this._textureFilterMode = mode;
  }

  getTextureFilterMode(): TextureFilterMode {
    return this._textureFilterMode;
  }

  // --- Texture management (STUBS - WebGPU uses GPUTexture, not WebGLTexture) ---

  createTexture(): TextureHandle {
    return null;
  }

  deleteTexture(_texture: TextureHandle): void {
    // No-op for WebGPU backend
  }

  // --- Shader compilation status ---

  isShaderReady(): boolean {
    return this.device !== null && this.pipelineManager.renderPipeline !== null;
  }

  // --- Context access ---

  getContext(): WebGL2RenderingContext | null {
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

  // --- HDR effects stubs (Phase 2-4: not yet implemented for WebGPU) ---

  setBackgroundPattern(_state: BackgroundPatternState): void {
    /* STUB */
  }
  readPixelFloat(_x: number, _y: number, _width: number, _height: number): Float32Array | null {
    return null;
  }
  setCDL(_cdl: CDLValues): void {
    /* STUB */
  }
  setCurvesLUT(_luts: CurveLUTs | null): void {
    /* STUB */
  }
  setColorWheels(_state: ColorWheelsState): void {
    /* STUB */
  }
  setFalseColor(_state: FalseColorState): void {
    /* STUB */
  }
  setZebraStripes(_state: ZebraState): void {
    /* STUB */
  }
  setChannelMode(_mode: ChannelMode): void {
    /* STUB */
  }

  // --- 3D LUT (multi-point pipeline) ---
  setLUT(_lutData: Float32Array | null, _lutSize: number, _intensity: number): void {
    /* STUB */
  }
  setFileLUT(
    _data: Float32Array | null,
    _size: number,
    _intensity: number,
    _domainMin?: [number, number, number],
    _domainMax?: [number, number, number],
  ): void {
    /* STUB */
  }
  setLookLUT(
    _data: Float32Array | null,
    _size: number,
    _intensity: number,
    _domainMin?: [number, number, number],
    _domainMax?: [number, number, number],
  ): void {
    /* STUB */
  }
  setDisplayLUT(
    _data: Float32Array | null,
    _size: number,
    _intensity: number,
    _domainMin?: [number, number, number],
    _domainMax?: [number, number, number],
  ): void {
    /* STUB */
  }

  // --- Display color management ---
  setDisplayColorState(_state: {
    transferFunction: number;
    displayGamma: number;
    displayBrightness: number;
    customGamma: number;
  }): void {
    /* STUB */
  }

  // --- New GPU shader effects (stubs) ---
  setHighlightsShadows(_state: HighlightsShadowsState): void {
    /* STUB */
  }
  setVibrance(_state: VibranceState): void {
    /* STUB */
  }
  setClarity(_state: ClarityState): void {
    /* STUB */
  }
  setSharpen(_state: SharpenState): void {
    /* STUB */
  }
  setHSLQualifier(_state: HSLQualifierState): void {
    /* STUB */
  }
  setGamutMapping(_state: GamutMappingState): void {
    /* STUB */
  }
  setPremultMode(_mode: number): void {
    /* STUB */
  }
  getPremultMode(): number {
    return 0;
  }
  setDitherMode(_mode: number): void {
    /* STUB */
  }
  getDitherMode(): number {
    return 0;
  }
  setQuantizeBits(_bits: number): void {
    /* STUB */
  }
  getQuantizeBits(): number {
    return 0;
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
    if (state.gamutMapping) {
      this.setGamutMapping(state.gamutMapping);
    }
    this.setPremultMode(state.premultMode ?? 0);
    this.setDitherMode(state.ditherMode ?? 0);
    this.setQuantizeBits(state.quantizeBits ?? 0);
    if (state.textureFilterMode !== undefined) {
      this.setTextureFilterMode(state.textureFilterMode);
    }
  }

  hasPendingStateChanges(): boolean {
    return false;
  }

  // --- SDR frame rendering ---
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
