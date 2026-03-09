/**
 * WebGPUBackend - WebGPU-based rendering backend
 *
 * Implements the RendererBackend interface using the WebGPU API.
 * This backend is selected when the display supports WebGPU with HDR output.
 *
 * Current status:
 * - initialize()/initAsync(): IMPLEMENTED - requests adapter/device, configures HDR canvas, creates pipeline
 * - dispose(): IMPLEMENTED - releases GPU resources
 * - renderImage(): IMPLEMENTED - passthrough rendering with shader pipeline integration
 * - clear(): IMPLEMENTED - via render pass with clear color
 * - resize(): IMPLEMENTED - updates canvas dimensions
 * - Color/tone-mapping state: IMPLEMENTED - feeds InternalShaderState via ShaderStateManager
 * - setHDROutputMode(): IMPLEMENTED - reconfigures canvas tone mapping
 * - Shader pipeline: Phase 2 - multi-pass pipeline infrastructure integrated
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
import { WebGPUShaderPipeline } from './webgpu/WebGPUShaderPipeline';
import { WebGPUTextureManager } from './webgpu/WebGPUTextureManager';
import { ShaderStateManager } from './ShaderStateManager';
import { WebGPU3DLUT } from './webgpu/WebGPU3DLUT';
import type { LUTSlot } from './webgpu/WebGPU3DLUT';
import { WebGPUReadback } from './webgpu/WebGPUReadback';

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

  // --- Texture manager (Phase 3: centralized texture lifecycle) ---
  private textureManager = new WebGPUTextureManager();

  // --- Shader pipeline (Phase 2) ---
  private shaderPipeline = new WebGPUShaderPipeline();
  private stateManager = new ShaderStateManager();

  // --- State (mirrors WebGL2Backend for identical behavior) ---
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  private colorInversionEnabled = false;
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' | 'extended' = 'sdr';

  // Whether extended tone mapping is active (vs. standard fallback)
  private extendedToneMapping = false;

  // Whether HDR output is enabled (canvas uses rgba16float)
  private hdrOutputEnabled = false;

  // HDR headroom value (peak brightness / SDR white)
  private hdrHeadroomValue = 1.0;

  // Input transfer function code (0=sRGB, 1=HLG, 2=PQ)
  private inputTransferCode = 0;

  // Texture filter mode
  private _textureFilterMode: TextureFilterMode = 'linear';

  // --- Phase 4: Advanced features ---
  private lut3d = new WebGPU3DLUT();
  private readbackHelper = new WebGPUReadback();

  /** Set when the GPU device is lost. Rejects all future operations. */
  private _deviceLost = false;

  /** Whether the GPU device has been lost. */
  get deviceLost(): boolean {
    return this._deviceLost;
  }

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

    // Register device lost handler (Phase 4)
    if ((device as unknown as { lost?: Promise<{ message: string }> }).lost) {
      (device as unknown as { lost: Promise<{ message: string }> }).lost.then((info) => {
        console.warn(`[WebGPUBackend] GPU device lost: ${info.message}`);
        this._deviceLost = true;
        this.device = null;
      });
    }

    // Configure canvas context with HDR settings
    this.configureContext(device, 'extended');

    // Initialize render pipeline
    const filterMode = hasFloat32Filterable ? 'linear' : 'nearest';
    this.pipelineManager.initialize(device, filterMode);

    // Initialize shader pipeline (Phase 2)
    this.shaderPipeline.initializeSharedResources(device);
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
        console.warn('Extended tone mapping not supported, falling back to standard');
        this.configureContext(device, 'standard');
      } else {
        throw new Error('WebGPU canvas configuration failed');
      }
    }
  }

  dispose(): void {
    // Clean up texture manager (Phase 3)
    this.textureManager.dispose();

    // Clean up legacy image texture tracking
    this.currentTexture = null;
    this.currentTextureWidth = 0;
    this.currentTextureHeight = 0;

    // Clean up pipeline resources
    this.pipelineManager.dispose();

    // Clean up shader pipeline (Phase 2)
    this.shaderPipeline.dispose();
    this.stateManager.dispose();

    // Clean up Phase 4 resources
    this.lut3d.dispose();
    this.readbackHelper.dispose();

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
    const isHDRContent = isFloat || !!image.videoFrame;

    // Upload image data via TextureManager
    let texture: WGPUTexture;
    if (image.videoFrame) {
      texture = this.textureManager.uploadVideoFrame(this.device, image.videoFrame, image.width, image.height);
    } else if (image.imageBitmap) {
      texture = this.textureManager.uploadImageBitmap(this.device, image.imageBitmap, image.width, image.height);
    } else {
      const data = isFloat ? new Float32Array(image.data) : new Uint8Array(image.data);
      texture = this.textureManager.uploadImageData(this.device, data, image.width, image.height, image.channels);
    }

    // Destroy previous texture if dimensions changed (legacy tracking for passthrough path)
    if (
      this.currentTexture &&
      this.currentTexture !== texture &&
      (this.currentTextureWidth !== image.width || this.currentTextureHeight !== image.height)
    ) {
      this.currentTexture.destroy();
    }
    this.currentTexture = texture;
    this.currentTextureWidth = image.width;
    this.currentTextureHeight = image.height;

    // Get canvas output
    const canvasTexture = this.gpuContext.getCurrentTexture();
    const canvasView = canvasTexture.createView();
    const textureView = texture.createView();

    // Try shader pipeline path if ready
    if (this.isShaderPipelineReady()) {
      const internalState = this.stateManager.getInternalState();
      this.stateManager.setTexelSize(1.0 / image.width, 1.0 / image.height);

      // Ensure ping-pong textures match HDR format when HDR is enabled
      const useHDR = isHDRContent || this.hdrOutputEnabled;

      this.shaderPipeline.execute(
        this.device,
        textureView,
        canvasView,
        internalState,
        image.width,
        image.height,
        useHDR,
        offsetX,
        offsetY,
        scaleX,
        scaleY,
      );
      return;
    }

    // Fallback: passthrough rendering (existing Phase 1 path)
    this.pipelineManager.updateUniforms(this.device, offsetX, offsetY, scaleX, scaleY);

    const textureBindGroup = this.pipelineManager.getTextureBindGroup(this.device, textureView);
    const uniformBindGroup = this.pipelineManager.uniforms;

    if (!textureBindGroup || !uniformBindGroup || !this.pipelineManager.renderPipeline) return;

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasView,
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

  renderTiledImages(
    _tiles: { image: IPImage; viewport: import('../nodes/groups/LayoutGroupNode').TileViewport }[],
  ): void {
    // STUB: WebGPU tiled rendering not yet implemented.
  }

  // --- Color adjustments (IMPLEMENTED - state management) ---

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.colorAdjustments = { ...adjustments };
    this.stateManager.setColorAdjustments(adjustments);
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this.colorAdjustments };
  }

  resetColorAdjustments(): void {
    this.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
    this.stateManager.resetColorAdjustments();
  }

  // --- Color inversion (IMPLEMENTED - state management) ---

  setColorInversion(enabled: boolean): void {
    this.colorInversionEnabled = enabled;
    this.stateManager.setColorInversion(enabled);
  }

  getColorInversion(): boolean {
    return this.colorInversionEnabled;
  }

  // --- Tone mapping (IMPLEMENTED - state management) ---

  setToneMappingState(state: ToneMappingState): void {
    this.toneMappingState = { ...state };
    this.stateManager.setToneMappingState(state);
  }

  getToneMappingState(): ToneMappingState {
    return { ...this.toneMappingState };
  }

  resetToneMappingState(): void {
    this.toneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
    this.stateManager.resetToneMappingState();
  }

  // --- HDR output (IMPLEMENTED) ---

  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended', _capabilities: DisplayCapabilities): boolean {
    if (!this.device || !this.gpuContext) {
      return false;
    }

    const wantHDR = mode !== 'sdr';
    const modeChanged = mode !== this.hdrOutputMode;

    if (!modeChanged) {
      return false;
    }

    this.hdrOutputMode = mode;

    if (wantHDR !== this.hdrOutputEnabled) {
      this.hdrOutputEnabled = wantHDR;
      // Reconfigure canvas: HDR uses rgba16float, SDR uses rgba8unorm
      if (wantHDR) {
        this.configureContext(this.device, 'extended');
      } else {
        try {
          this.gpuContext.configure({
            device: this.device,
            format: 'rgba8unorm',
            colorSpace: 'srgb',
            alphaMode: 'opaque',
          });
          this.extendedToneMapping = false;
        } catch {
          // Fall back to HDR config if SDR config fails
          this.configureContext(this.device, 'standard');
        }
      }
    }

    return true;
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' | 'extended' {
    return this.hdrOutputMode;
  }

  /** Whether HDR output is currently enabled. */
  isHDROutputEnabled(): boolean {
    return this.hdrOutputEnabled;
  }

  setHDRHeadroom(headroom: number): void {
    this.hdrHeadroomValue = headroom;
    this.shaderPipeline.setGlobalHDRHeadroom(headroom);
  }

  /** Get the current HDR headroom value. */
  getHDRHeadroom(): number {
    return this.hdrHeadroomValue;
  }

  /**
   * Set the input transfer function code for the linearize stage.
   * 0 = sRGB/linear, 1 = HLG, 2 = PQ
   */
  setInputTransferFunction(code: number): void {
    this.inputTransferCode = code;
    this.stateManager.setInputTransferFunction(code);
  }

  /** Get the current input transfer function code. */
  getInputTransferFunction(): number {
    return this.inputTransferCode;
  }

  // --- Texture filter mode (IMPLEMENTED - state management) ---

  setTextureFilterMode(mode: TextureFilterMode): void {
    if (this._textureFilterMode === mode) return;
    this._textureFilterMode = mode;

    // Propagate to passthrough pipeline sampler
    if (this.device) {
      this.pipelineManager.setSamplerFilterMode(this.device, mode);
    }

    // Propagate to shader pipeline default filter mode
    this.shaderPipeline.setDefaultFilterMode(mode);
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

  /**
   * Whether the shader pipeline is ready for multi-pass rendering.
   * When false, renderImage() falls back to passthrough.
   */
  isShaderPipelineReady(): boolean {
    return this.device !== null && this.shaderPipeline.isReady();
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
    // Synchronous readback is not possible with WebGPU; use readPixelFloatAsync instead.
    return null;
  }

  /**
   * Async pixel readback from the current render texture (Phase 4).
   * Returns RGBA float data for the given region, or null if unavailable.
   */
  async readPixelFloatAsync(x: number, y: number, width: number, height: number): Promise<Float32Array | null> {
    if (this._deviceLost || !this.device || !this.gpuContext) return null;
    // SDR canvas uses rgba8unorm which WebGPUReadback cannot interpret as float data.
    // Readback is only supported in HDR mode (rgba16float canvas texture).
    if (!this.hdrOutputEnabled) return null;
    try {
      const canvasTexture = this.gpuContext.getCurrentTexture();
      // rgba16float = 8 bytes/pixel
      const bytesPerPixel = 8;
      if (width === 1 && height === 1) {
        const pixel = await this.readbackHelper.readPixelFloat(this.device, x, y, canvasTexture, bytesPerPixel);
        return new Float32Array(pixel);
      }
      return await this.readbackHelper.readRegion(this.device, x, y, width, height, canvasTexture, bytesPerPixel);
    } catch (e) {
      console.warn('WebGPU readback failed:', e);
      return null;
    }
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

  // --- 3D LUT (Phase 4: backed by WebGPU3DLUT) ---

  setLUT(lutData: Float32Array | null, lutSize: number, intensity: number): void {
    this.set3DLUT('look', lutData, lutSize, intensity);
  }

  setFileLUT(
    data: Float32Array | null,
    size: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.set3DLUT('file', data, size, intensity, domainMin, domainMax);
  }

  setLookLUT(
    data: Float32Array | null,
    size: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.set3DLUT('look', data, size, intensity, domainMin, domainMax);
  }

  setDisplayLUT(
    data: Float32Array | null,
    size: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.set3DLUT('display', data, size, intensity, domainMin, domainMax);
  }

  /**
   * Upload 3D LUT data to a GPU texture slot (Phase 4).
   */
  set3DLUT(
    slot: LUTSlot,
    data: Float32Array | null,
    size: number,
    intensity: number = 1.0,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    if (this._deviceLost || !this.device) return;

    if (!data) {
      this.lut3d.clear(slot);
      return;
    }

    // WebGPU3DLUT.upload() expects RGBA data (size^3*4 floats).
    // Input may be RGB (size^3*3 floats) — expand to RGBA with alpha=1.0.
    let rgbaData = data;
    const expectedRGBA = size * size * size * 4;
    const expectedRGB = size * size * size * 3;
    if (data.length === expectedRGB) {
      rgbaData = new Float32Array(expectedRGBA);
      const texelCount = size * size * size;
      for (let i = 0; i < texelCount; i++) {
        rgbaData[i * 4] = data[i * 3]!;
        rgbaData[i * 4 + 1] = data[i * 3 + 1]!;
        rgbaData[i * 4 + 2] = data[i * 3 + 2]!;
        rgbaData[i * 4 + 3] = 1.0;
      }
    }

    this.lut3d.upload(this.device, slot, rgbaData, size);
    this.lut3d.setEnabled(slot, true, intensity);
    if (domainMin && domainMax) {
      this.lut3d.setDomain(slot, domainMin, domainMax);
    }
  }

  /**
   * Enable or disable a LUT slot and set its blend intensity (Phase 4).
   */
  setLUTEnabled(slot: LUTSlot, enabled: boolean, intensity: number = 1.0): void {
    this.lut3d.setEnabled(slot, enabled, intensity);
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
    return this.stateManager.hasPendingStateChanges();
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
