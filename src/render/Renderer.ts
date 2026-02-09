import { IPImage, DataType } from '../core/image/Image';
import { ShaderProgram } from './ShaderProgram';
import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState } from '../core/types/color';
import type { ToneMappingState, ZebraState, HighlightsShadowsState, VibranceState, ClarityState, SharpenState, FalseColorState } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend, TextureHandle } from './RendererBackend';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState, DisplayColorConfig } from './RenderState';
import { Logger } from '../utils/Logger';
import { RenderError } from '../core/errors';
import { ShaderStateManager } from './ShaderStateManager';
import vertexShaderSource from './shaders/viewer.vert.glsl?raw';
import fragmentShaderSource from './shaders/viewer.frag.glsl?raw';
import type { TextureCallbacks } from './ShaderStateManager';
import type { StateAccessor } from './StateAccessor';
import {
  INPUT_TRANSFER_SRGB,
  INPUT_TRANSFER_HLG,
  INPUT_TRANSFER_PQ,
  OUTPUT_MODE_SDR,
  OUTPUT_MODE_HDR,
  DISPLAY_TRANSFER_LINEAR,
  LUT_1D_SIZE,
  RGBA_CHANNELS,
  RGB_CHANNELS,
} from '../config/RenderConfig';

const log = new Logger('Renderer');

// Re-export TONE_MAPPING_OPERATOR_CODES for backward compatibility
export { TONE_MAPPING_OPERATOR_CODES } from './ShaderStateManager';

// Re-export the interface and types so existing consumers can import from here
export type { RendererBackend, RendererLifecycle, RendererColorPipeline, RendererEffects, RendererHDR, TextureHandle } from './RendererBackend';

/**
 * WebGL2-based renderer backend.
 *
 * This is the original Renderer class, now implementing the RendererBackend
 * interface. State management is delegated to ShaderStateManager, while GPU
 * resource management (textures, VAO, shaders) remains here.
 * Also exported as WebGL2Backend for clarity in backend selection.
 */
export class Renderer implements RendererBackend {
  // --- Centralized state management ---
  private stateManager: StateAccessor = new ShaderStateManager();

  // --- GPU resources ---
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;

  // HDR output mode (not part of shader state — controls drawingBufferColorSpace)
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' = 'sdr';

  // Shaders
  private displayShader: ShaderProgram | null = null;

  // KHR_parallel_shader_compile extension object (null when not available)
  private parallelCompileExt: object | null = null;

  // Quad geometry
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  // Current texture
  private currentTexture: WebGLTexture | null = null;

  // --- GPU texture objects (lifecycle managed here, data comes from stateManager) ---
  private curvesLUTTexture: WebGLTexture | null = null;
  private falseColorLUTTexture: WebGLTexture | null = null;
  private lut3DTexture: WebGLTexture | null = null;

  // --- Pre-allocated temp buffers for LUT conversions ---
  private falseColorRGBABuffer: Uint8Array | null = null;
  private lut3DRGBABuffer: Float32Array | null = null;
  private lut3DRGBABufferSize = 0; // tracks the LUT size the buffer was allocated for

  initialize(canvas: HTMLCanvasElement | OffscreenCanvas, capabilities?: DisplayCapabilities): void {
    this.canvas = canvas;

    // For HDR displays, request preserveDrawingBuffer so readPixels works after compositing.
    const wantHDR = capabilities?.displayHDR === true;
    const gl = wantHDR
      ? canvas.getContext('webgl2', { preserveDrawingBuffer: true })
      : canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        });

    if (!gl) {
      throw new RenderError('WebGL2 not supported');
    }

    this.gl = gl as WebGL2RenderingContext;

    // Set drawingBufferColorSpace IMMEDIATELY after getContext, before any
    // shader compilation or buffer creation. Chrome may lock the color space
    // once GL state is created. The reference example sets it right away.
    if (wantHDR && 'drawingBufferColorSpace' in gl) {
      const gl2 = gl as WebGL2RenderingContext;
      // Try HLG first, then PQ
      try {
        gl2.drawingBufferColorSpace = 'rec2100-hlg';
        if (gl2.drawingBufferColorSpace === 'rec2100-hlg') {
          this.hdrOutputMode = 'hlg';
          log.info('HDR output: rec2100-hlg');
        } else {
          gl2.drawingBufferColorSpace = 'rec2100-pq';
          if (gl2.drawingBufferColorSpace === 'rec2100-pq') {
            this.hdrOutputMode = 'pq';
            log.info('HDR output: rec2100-pq');
          } else {
            // Fall back to P3
            if (capabilities?.webglP3) {
              gl2.drawingBufferColorSpace = 'display-p3';
            }
            log.info(`HDR color spaces not accepted, drawingBufferColorSpace='${gl2.drawingBufferColorSpace}'`);
          }
        }
      } catch (e) {
        // rec2100-hlg/pq not in PredefinedColorSpace enum — expected on most browsers.
        // Fall back to P3 if possible.
        try {
          if (capabilities?.webglP3) {
            (gl as WebGL2RenderingContext).drawingBufferColorSpace = 'display-p3';
          }
        } catch (p3Err) {
          log.warn('Failed to set display-p3 drawingBufferColorSpace:', p3Err);
        }
        log.info(`HDR color spaces not available, using ${capabilities?.webglP3 ? 'display-p3' : 'srgb'}`);
      }
    } else if (capabilities?.webglP3) {
      try {
        (gl as WebGL2RenderingContext).drawingBufferColorSpace = 'display-p3';
      } catch (e) {
        log.warn('Browser does not support setting drawingBufferColorSpace:', e);
      }
    }

    // Check for required extensions
    const requiredExtensions = ['EXT_color_buffer_float', 'OES_texture_float_linear'];
    for (const ext of requiredExtensions) {
      if (!(gl as WebGL2RenderingContext).getExtension(ext)) {
        log.warn(`Extension ${ext} not available`);
      }
    }

    // Probe for KHR_parallel_shader_compile before shader init.
    // When available, shader compilation will be non-blocking.
    this.parallelCompileExt = (gl as WebGL2RenderingContext).getExtension('KHR_parallel_shader_compile');
    if (this.parallelCompileExt) {
      log.info('KHR_parallel_shader_compile extension available — using non-blocking shader compilation');
    }

    this.initShaders();
    this.initQuad();
  }

  /**
   * Async initialization for the WebGL2 backend.
   *
   * When KHR_parallel_shader_compile is available, this waits for the shader
   * compilation to finish without blocking the main thread. When the extension
   * is not available, initialization was already fully synchronous in
   * initialize() and this resolves immediately.
   *
   * Callers should always await this after initialize() for portability.
   */
  async initAsync(): Promise<void> {
    if (this.displayShader) {
      await this.displayShader.waitForCompilation();
    }
  }

  /**
   * Whether the shader program is fully compiled and ready for rendering.
   *
   * When KHR_parallel_shader_compile is used, this returns false while the
   * GPU driver is still compiling. Callers can use this to show a loading
   * indicator or skip rendering until the shader is ready.
   *
   * When the extension is not available (synchronous fallback), always returns
   * true after initialize().
   */
  isShaderReady(): boolean {
    if (!this.displayShader) return false;
    return this.displayShader.isReady();
  }

  private initShaders(): void {
    if (!this.gl) return;

    this.displayShader = new ShaderProgram(this.gl, vertexShaderSource, fragmentShaderSource, this.parallelCompileExt);
  }

  private initQuad(): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Create VAO
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    // Create VBO with quad vertices and texcoords
    const vertices = new Float32Array([
      // Position    TexCoord
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, 1, 1, 0,
    ]);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Position attribute
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    // TexCoord attribute
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.gl) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  clear(r = 0.1, g = 0.1, b = 0.1, a = 1): void {
    if (!this.gl) return;

    this.gl.clearColor(r, g, b, a);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  renderImage(
    image: IPImage,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1
  ): void {
    if (!this.gl || !this.displayShader) return;

    // Skip rendering if the shader is still compiling (parallel compile path).
    // The caller should poll isShaderReady() or await initAsync() first.
    if (!this.displayShader.isReady()) return;

    const gl = this.gl;

    // Update texture if needed
    if (image.textureNeedsUpdate || !image.texture) {
      this.updateTexture(image);
    }

    // Use display shader
    this.displayShader.use();
    this.displayShader.setUniform('u_offset', [offsetX, offsetY]);
    this.displayShader.setUniform('u_scale', [scaleX, scaleY]);

    // Set HDR output mode uniform
    this.displayShader.setUniformInt('u_outputMode', this.hdrOutputMode === 'sdr' ? OUTPUT_MODE_SDR : OUTPUT_MODE_HDR);

    // Set input transfer function uniform based on image metadata
    let inputTransferCode = INPUT_TRANSFER_SRGB;
    if (image.metadata.transferFunction === 'hlg') {
      inputTransferCode = INPUT_TRANSFER_HLG;
    } else if (image.metadata.transferFunction === 'pq') {
      inputTransferCode = INPUT_TRANSFER_PQ;
    }
    this.displayShader.setUniformInt('u_inputTransfer', inputTransferCode);

    // Set texel size for clarity/sharpen (based on source image dimensions)
    if (image.width > 0 && image.height > 0) {
      this.stateManager.setTexelSize(1.0 / image.width, 1.0 / image.height);
    }

    // Apply all shared effect uniforms and bind textures via state manager
    this.stateManager.applyUniforms(this.displayShader, this.createTextureCallbacks());

    // Bind image texture to unit 0
    this.displayShader.setUniformInt('u_texture', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.texture);

    // Draw quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /**
   * Create texture management callbacks for ShaderStateManager.applyUniforms().
   *
   * Each callback ensures its texture exists, uploads dirty data, activates
   * the correct texture unit, and binds the texture.
   */
  private createTextureCallbacks(): TextureCallbacks {
    const gl = this.gl!;
    return {
      bindCurvesLUTTexture: () => {
        this.ensureCurvesLUTTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.curvesLUTTexture);
      },
      bindFalseColorLUTTexture: () => {
        this.ensureFalseColorLUTTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.falseColorLUTTexture);
      },
      bindLUT3DTexture: () => {
        this.ensureLUT3DTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_3D, this.lut3DTexture);
      },
      getCanvasSize: () => ({
        width: this.canvas?.width ?? 0,
        height: this.canvas?.height ?? 0,
      }),
    };
  }

  // --- LUT texture management ---

  private ensureCurvesLUTTexture(): void {
    const gl = this.gl;
    if (!gl) return;

    const snapshot = this.stateManager.getCurvesLUTSnapshot();

    if (!this.curvesLUTTexture) {
      this.curvesLUTTexture = gl.createTexture();
    }

    if (snapshot.dirty && snapshot.data) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curvesLUTTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_1D_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, snapshot.data);
      this.stateManager.clearTextureDirtyFlag('curvesLUTDirty');
    }
  }

  private ensureFalseColorLUTTexture(): void {
    const gl = this.gl;
    if (!gl) return;

    const snapshot = this.stateManager.getFalseColorLUTSnapshot();

    if (!this.falseColorLUTTexture) {
      this.falseColorLUTTexture = gl.createTexture();
    }

    if (snapshot.dirty && snapshot.data) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.falseColorLUTTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      // Convert RGB (LUT_1D_SIZE*RGB_CHANNELS) to RGBA (LUT_1D_SIZE*RGBA_CHANNELS) for WebGL
      if (!this.falseColorRGBABuffer) {
        this.falseColorRGBABuffer = new Uint8Array(LUT_1D_SIZE * RGBA_CHANNELS);
        // Pre-fill alpha channel to 255 once; only RGB values change per update
        const rgba = this.falseColorRGBABuffer;
        for (let i = 0; i < LUT_1D_SIZE; i++) {
          rgba[i * RGBA_CHANNELS + 3] = 255;
        }
      }
      const rgba = this.falseColorRGBABuffer;
      const src = snapshot.data;
      for (let i = 0; i < LUT_1D_SIZE; i++) {
        const dstOff = i * RGBA_CHANNELS;
        const srcOff = i * RGB_CHANNELS;
        rgba[dstOff] = src[srcOff]!;
        rgba[dstOff + 1] = src[srcOff + 1]!;
        rgba[dstOff + 2] = src[srcOff + 2]!;
        // alpha already 255 from initialization
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_1D_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      this.stateManager.clearTextureDirtyFlag('falseColorLUTDirty');
    }
  }

  private updateTexture(image: IPImage): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Create texture if needed
    if (!image.texture) {
      image.texture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D, image.texture);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // VideoFrame direct GPU upload path (HDR video)
    if (image.videoFrame) {
      try {
        // Set unpackColorSpace for best color fidelity
        try {
          gl.unpackColorSpace = 'display-p3';
        } catch (e) {
          log.warn('Browser does not support unpackColorSpace:', e);
        }

        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,    // 16-bit float internal format for HDR
          gl.RGBA,
          gl.HALF_FLOAT,
          image.videoFrame // VideoFrame is a valid TexImageSource
        );

        // Release VRAM - VideoFrame is consumed
        image.close();

        // Reset unpackColorSpace back to sRGB
        try {
          gl.unpackColorSpace = 'srgb';
        } catch (e) {
          log.warn('Failed to reset unpackColorSpace to srgb:', e);
        }

        image.textureNeedsUpdate = false;
        return;
      } catch (e) {
        // VideoFrame texImage2D not supported - fall through to SDR path
        log.warn('VideoFrame texImage2D failed, falling back to typed array upload:', e);
        image.close();

        // Reset unpackColorSpace back to sRGB
        try {
          gl.unpackColorSpace = 'srgb';
        } catch (resetErr) {
          log.warn('Failed to reset unpackColorSpace to srgb:', resetErr);
        }
      }
    }

    // Standard TypedArray upload path
    const { internalFormat, format, type } = this.getTextureFormat(image.dataType, image.channels);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      image.width,
      image.height,
      0,
      format,
      type,
      image.getTypedArray()
    );

    image.textureNeedsUpdate = false;
  }

  private getTextureFormat(dataType: DataType, channels: number): {
    internalFormat: number;
    format: number;
    type: number;
  } {
    const gl = this.gl!;

    let internalFormat: number;
    let format: number;
    let type: number;

    switch (dataType) {
      case 'float32':
        type = gl.FLOAT;
        switch (channels) {
          case 1:
            internalFormat = gl.R32F;
            format = gl.RED;
            break;
          case 2:
            internalFormat = gl.RG32F;
            format = gl.RG;
            break;
          case 3:
            internalFormat = gl.RGB32F;
            format = gl.RGB;
            break;
          default:
            internalFormat = gl.RGBA32F;
            format = gl.RGBA;
        }
        break;

      case 'uint16':
        type = gl.UNSIGNED_SHORT;
        switch (channels) {
          case 1:
            internalFormat = gl.R16UI;
            format = gl.RED_INTEGER;
            break;
          case 2:
            internalFormat = gl.RG16UI;
            format = gl.RG_INTEGER;
            break;
          case 3:
            internalFormat = gl.RGB16UI;
            format = gl.RGB_INTEGER;
            break;
          default:
            internalFormat = gl.RGBA16UI;
            format = gl.RGBA_INTEGER;
        }
        break;

      default: // uint8
        type = gl.UNSIGNED_BYTE;
        switch (channels) {
          case 1:
            internalFormat = gl.R8;
            format = gl.RED;
            break;
          case 2:
            internalFormat = gl.RG8;
            format = gl.RG;
            break;
          case 3:
            internalFormat = gl.RGB8;
            format = gl.RGB;
            break;
          default:
            internalFormat = gl.RGBA8;
            format = gl.RGBA;
        }
    }

    return { internalFormat, format, type };
  }

  createTexture(): TextureHandle {
    return this.gl?.createTexture() ?? null;
  }

  deleteTexture(texture: TextureHandle): void {
    if (texture) {
      this.gl?.deleteTexture(texture);
    }
  }

  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  // --- Thin wrapper setters delegating to ShaderStateManager ---

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.stateManager.setColorAdjustments(adjustments);
  }

  getColorAdjustments(): ColorAdjustments {
    return this.stateManager.getColorAdjustments();
  }

  resetColorAdjustments(): void {
    this.stateManager.resetColorAdjustments();
  }

  setColorInversion(enabled: boolean): void {
    this.stateManager.setColorInversion(enabled);
  }

  getColorInversion(): boolean {
    return this.stateManager.getColorInversion();
  }

  setToneMappingState(state: ToneMappingState): void {
    this.stateManager.setToneMappingState(state);
  }

  getToneMappingState(): ToneMappingState {
    return this.stateManager.getToneMappingState();
  }

  resetToneMappingState(): void {
    this.stateManager.resetToneMappingState();
  }

  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq', capabilities: DisplayCapabilities): boolean {
    if (!this.gl) return false;

    const previousMode = this.hdrOutputMode;
    try {
      let targetColorSpace: ExtendedColorSpace;
      switch (mode) {
        case 'hlg':
          targetColorSpace = 'rec2100-hlg';
          break;
        case 'pq':
          targetColorSpace = 'rec2100-pq';
          break;
        default:
          targetColorSpace = capabilities.webglP3 ? 'display-p3' : 'srgb';
      }

      this.gl.drawingBufferColorSpace = targetColorSpace;

      // Verify the assignment stuck (browser silently ignores unsupported values)
      if (mode !== 'sdr' && this.gl.drawingBufferColorSpace !== targetColorSpace) {
        log.warn(`drawingBufferColorSpace='${targetColorSpace}' not supported (got '${this.gl.drawingBufferColorSpace}')`);
        this.hdrOutputMode = previousMode;
        return false;
      }

      this.hdrOutputMode = mode;

      // Attempt to configure HDR metadata when entering HDR mode
      if (mode !== 'sdr') {
        this.tryConfigureHDRMetadata();
      }

      return true;
    } catch (e) {
      // Ensure hdrOutputMode is rolled back to its previous value
      log.warn('Failed to set HDR output mode:', e);
      this.hdrOutputMode = previousMode;
      return false;
    }
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' {
    return this.hdrOutputMode;
  }

  setBackgroundPattern(state: BackgroundPatternState): void {
    this.stateManager.setBackgroundPattern(state);
  }

  // --- Phase 2: Pixel readback ---

  readPixelFloat(x: number, y: number, width: number, height: number): Float32Array | null {
    const gl = this.gl;
    if (!gl || !this.canvas) return null;
    const glY = this.canvas.height - y - height; // WebGL Y is flipped
    const count = width * height * 4;

    // Query the implementation-supported readPixels type for the current framebuffer.
    const readType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;

    if (readType === gl.FLOAT) {
      // HDR float framebuffer -- read directly into Float32Array
      const pixels = new Float32Array(count);
      gl.readPixels(x, glY, width, height, gl.RGBA, gl.FLOAT, pixels);
      return gl.getError() === gl.NO_ERROR ? pixels : null;
    }

    // Default (8-bit) framebuffer -- read as UNSIGNED_BYTE then convert to float
    const bytes = new Uint8Array(count);
    gl.readPixels(x, glY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    if (gl.getError() !== gl.NO_ERROR) return null;
    const pixels = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pixels[i] = bytes[i]! / 255;
    }
    return pixels;
  }

  // --- Effect setters (delegating to ShaderStateManager) ---

  setCDL(cdl: CDLValues): void {
    this.stateManager.setCDL(cdl);
  }

  setCurvesLUT(luts: CurveLUTs | null): void {
    this.stateManager.setCurvesLUT(luts);
  }

  setColorWheels(state: ColorWheelsState): void {
    this.stateManager.setColorWheels(state);
  }

  setFalseColor(state: FalseColorState): void {
    this.stateManager.setFalseColor(state);
  }

  setZebraStripes(state: ZebraState): void {
    this.stateManager.setZebraStripes(state);
  }

  setChannelMode(mode: ChannelMode): void {
    this.stateManager.setChannelMode(mode);
  }

  setLUT(lutData: Float32Array | null, lutSize: number, intensity: number): void {
    this.stateManager.setLUT(lutData, lutSize, intensity);
  }

  private ensureLUT3DTexture(): void {
    const gl = this.gl;
    if (!gl) return;

    const snapshot = this.stateManager.getLUT3DSnapshot();

    if (!this.lut3DTexture) {
      this.lut3DTexture = gl.createTexture();
    }

    if (snapshot.dirty && snapshot.data && snapshot.size > 0) {
      const size = snapshot.size;
      const totalEntries = size * size * size;
      // Convert RGB Float32 data to RGBA Float32 for WebGL (3D textures need RGBA)
      // Reuse cached buffer if the LUT size hasn't changed
      if (!this.lut3DRGBABuffer || this.lut3DRGBABufferSize !== size) {
        this.lut3DRGBABuffer = new Float32Array(totalEntries * RGBA_CHANNELS);
        this.lut3DRGBABufferSize = size;
        // Pre-fill alpha channel to 1.0 once; only RGB values change per update
        const rgbaData = this.lut3DRGBABuffer;
        for (let i = 0; i < totalEntries; i++) {
          rgbaData[i * RGBA_CHANNELS + 3] = 1.0;
        }
      }
      const rgbaData = this.lut3DRGBABuffer;
      const src = snapshot.data;
      for (let i = 0; i < totalEntries; i++) {
        const dstOff = i * RGBA_CHANNELS;
        const srcOff = i * RGB_CHANNELS;
        rgbaData[dstOff] = src[srcOff]!;
        rgbaData[dstOff + 1] = src[srcOff + 1]!;
        rgbaData[dstOff + 2] = src[srcOff + 2]!;
        // alpha already 1.0 from initialization
      }

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_3D, this.lut3DTexture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, size, size, size, 0, gl.RGBA, gl.FLOAT, rgbaData);
      this.stateManager.clearTextureDirtyFlag('lut3DDirty');
    }
  }

  setDisplayColorState(state: DisplayColorConfig): void {
    this.stateManager.setDisplayColorState(state);
  }

  setHighlightsShadows(state: HighlightsShadowsState): void {
    this.stateManager.setHighlightsShadows(state);
  }

  setVibrance(state: VibranceState): void {
    this.stateManager.setVibrance(state);
  }

  setClarity(state: ClarityState): void {
    this.stateManager.setClarity(state);
  }

  setSharpen(state: SharpenState): void {
    this.stateManager.setSharpen(state);
  }

  setHSLQualifier(state: HSLQualifierState): void {
    this.stateManager.setHSLQualifier(state);
  }

  applyRenderState(state: RenderState): void {
    this.stateManager.applyRenderState(state);
  }

  private tryConfigureHDRMetadata(): void {
    if (!this.canvas) return;
    if (this.canvas.configureHighDynamicRange) {
      try {
        this.canvas.configureHighDynamicRange({ mode: 'default' });
      } catch (e) {
        log.warn('configureHighDynamicRange not supported:', e);
      }
    }
  }

  // --- SDR frame rendering (Phase 1A) ---

  /** Texture used for SDR frame uploads (reused across frames). */
  private sdrTexture: WebGLTexture | null = null;

  /**
   * Render an SDR source (HTMLVideoElement, HTMLCanvasElement, OffscreenCanvas,
   * or HTMLImageElement) through the full GPU shader pipeline.
   *
   * The source is uploaded as an UNSIGNED_BYTE RGBA texture, u_inputTransfer is
   * set to 0 (sRGB), and all currently configured effects are applied via the
   * existing fragment shader.
   *
   * Returns the WebGL canvas element so the Viewer can position / composite it.
   * Returns null if the WebGL context is unavailable.
   */
  renderSDRFrame(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap,
  ): HTMLCanvasElement | null {
    if (!this.gl || !this.displayShader || !this.canvas) return null;

    // Skip rendering if the shader is still compiling (parallel compile path).
    if (!this.displayShader.isReady()) return null;

    const gl = this.gl;

    // Ensure the SDR texture exists and set texture params once at creation
    if (!this.sdrTexture) {
      this.sdrTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.sdrTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    // Upload the SDR source to the texture
    gl.bindTexture(gl.TEXTURE_2D, this.sdrTexture);

    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source as TexImageSource,
      );
    } catch (e) {
      // texImage2D can throw for tainted or invalid sources
      log.warn('texImage2D failed for SDR frame (tainted or invalid source):', e);
      return null;
    }

    // Use display shader
    this.displayShader.use();
    this.displayShader.setUniform('u_offset', [0, 0]);
    this.displayShader.setUniform('u_scale', [1, 1]);

    // SDR output: always clamp to [0,1], sRGB input (no special EOTF)
    this.displayShader.setUniformInt('u_outputMode', OUTPUT_MODE_SDR);
    this.displayShader.setUniformInt('u_inputTransfer', INPUT_TRANSFER_SRGB);

    // Set texel size for clarity/sharpen (based on source dimensions)
    const srcWidth = ('videoWidth' in source ? (source as HTMLVideoElement).videoWidth : (source as HTMLCanvasElement | HTMLImageElement).width) || this.canvas.width;
    const srcHeight = ('videoHeight' in source ? (source as HTMLVideoElement).videoHeight : (source as HTMLCanvasElement | HTMLImageElement).height) || this.canvas.height;
    if (srcWidth > 0 && srcHeight > 0) {
      this.stateManager.setTexelSize(1.0 / srcWidth, 1.0 / srcHeight);
    }

    // Apply all shared effect uniforms and bind textures via state manager
    this.stateManager.applyUniforms(this.displayShader, this.createTextureCallbacks());

    // SDR input is already gamma-encoded; skip display transfer to avoid double encoding.
    // The display transfer (sRGB OETF) is only needed for HDR content that was linearized
    // by the input EOTF. For SDR, the gamma adjustment slider still works via the
    // u_displayTransfer==0 fallback path: pow(color, 1/u_gamma).
    // Note: u_displayGamma and u_displayBrightness are NOT overridden here -- those are
    // user-adjustable display calibration parameters that should take effect for all content.
    this.displayShader.setUniformInt('u_displayTransfer', DISPLAY_TRANSFER_LINEAR);

    // Bind SDR texture to unit 0
    this.displayShader.setUniformInt('u_texture', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sdrTexture);

    // Draw quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    return this.getCanvasElement();
  }

  /**
   * Get the underlying canvas element used for rendering.
   */
  getCanvasElement(): HTMLCanvasElement | null {
    // Return as HTMLCanvasElement for interface compatibility.
    // When used with OffscreenCanvas in a worker, HTMLCanvasElement may not exist.
    if (typeof HTMLCanvasElement !== 'undefined' && this.canvas instanceof HTMLCanvasElement) {
      return this.canvas;
    }
    return null;
  }

  dispose(): void {
    if (!this.gl) return;

    const gl = this.gl;

    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
    if (this.displayShader) this.displayShader.dispose();
    if (this.currentTexture) gl.deleteTexture(this.currentTexture);
    if (this.sdrTexture) {
      gl.deleteTexture(this.sdrTexture);
      this.sdrTexture = null;
    }
    if (this.curvesLUTTexture) gl.deleteTexture(this.curvesLUTTexture);
    if (this.falseColorLUTTexture) gl.deleteTexture(this.falseColorLUTTexture);
    if (this.lut3DTexture) gl.deleteTexture(this.lut3DTexture);

    // Release cached LUT conversion buffers
    this.falseColorRGBABuffer = null;
    this.lut3DRGBABuffer = null;
    this.lut3DRGBABufferSize = 0;

    this.parallelCompileExt = null;
    this.gl = null;
    this.canvas = null;
  }
}

/**
 * Alias for the Renderer class, for use in backend selection logic.
 * Semantically identical to Renderer; this name clarifies intent when
 * used alongside WebGPUBackend.
 */
export const WebGL2Backend = Renderer;
