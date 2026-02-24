import { IPImage, DataType, type ColorPrimaries } from '../core/image/Image';
import { ShaderProgram } from './ShaderProgram';
import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState } from '../core/types/color';
import type { ToneMappingState, ZebraState, HighlightsShadowsState, VibranceState, ClarityState, SharpenState, FalseColorState, GamutMappingState } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend, TextureHandle } from './RendererBackend';
import type { TileViewport } from '../nodes/groups/LayoutGroupNode';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState, DisplayColorConfig } from './RenderState';
import type { OCIOPipelineResult } from '../color/wasm/OCIOWasmPipeline';
import { Logger } from '../utils/Logger';
import { RenderError } from '../core/errors';
import { ShaderStateManager } from './ShaderStateManager';
import { PerfTrace } from '../utils/PerfTrace';
import vertexShaderSource from './shaders/viewer.vert.glsl?raw';
import fragmentShaderSource from './shaders/viewer.frag.glsl?raw';
import type { TextureCallbacks } from './ShaderStateManager';
import type { StateAccessor } from './StateAccessor';
import {
  INPUT_TRANSFER_SRGB,
  INPUT_TRANSFER_HLG,
  INPUT_TRANSFER_PQ,
  INPUT_TRANSFER_SMPTE240M,
  OUTPUT_MODE_SDR,
  OUTPUT_MODE_HDR,
  DISPLAY_TRANSFER_LINEAR,
  LUT_1D_SIZE,
  RGBA_CHANNELS,
  RGB_CHANNELS,
} from '../config/RenderConfig';

const log = new Logger('Renderer');

/** Neutral display color config for scope rendering — no display OETF, gamma, or brightness. */
const SCOPE_DISPLAY_CONFIG: DisplayColorConfig = {
  transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2,
};

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
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' | 'extended' = 'sdr';

  // Whether a half-float (RGBA16F) drawing buffer is active via drawingBufferStorage
  private usingHalfFloatBackbuffer = false;

  // HDR headroom: ratio of display peak luminance to SDR white (1.0 = SDR)
  private hdrHeadroom = 1.0;

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
  private filmLUTTexture: WebGLTexture | null = null;
  private inlineLUTTexture: WebGLTexture | null = null;

  // --- Pre-allocated temp buffers for LUT conversions ---
  private falseColorRGBABuffer: Uint8Array | null = null;
  private lut3DRGBABuffer: Float32Array | null = null;
  private lut3DRGBABufferSize = 0; // tracks the LUT size the buffer was allocated for
  private inlineLUTDeinterleavedBuffer: Float32Array | null = null;
  private inlineLUTDeinterleavedBufferSize = 0; // tracks (lutSize * channels) for cache invalidation

  // --- OCIO WASM shader integration ---
  // When OCIO WASM is active, the baked 3D LUT from the WASM processor is
  // uploaded through the existing u_lut3D uniform path. The OCIO shader code
  // and uniform metadata are stored here for future shader injection support.
  private ocioWasmActive = false;
  private ocioShaderCode: string | null = null;
  private ocioFunctionName: string | null = null;
  private ocioUniforms: Array<{ name: string; type: string; isSampler: boolean }> | null = null;

  // --- RGBA16F FBO for renderImageToFloat (WebGPU HDR blit path) ---
  private hdrFBO: WebGLFramebuffer | null = null;
  private hdrFBOTexture: WebGLTexture | null = null;
  private hdrFBOWidth = 0;
  private hdrFBOHeight = 0;
  private hasColorBufferFloat: boolean | null = null; // cached extension check
  private hdrReadbackBuffer: Float32Array | null = null; // reused across frames

  // --- PBO async readback (double-buffered) ---
  // Two PBOs alternate each frame: one receives async readPixels while
  // the other's data (from the previous frame) is returned immediately.
  // This eliminates the synchronous GPU stall from readPixels.
  private hdrPBOs: [WebGLBuffer | null, WebGLBuffer | null] = [null, null];
  private hdrPBOFences: [WebGLSync | null, WebGLSync | null] = [null, null];
  private hdrPBOWidth = 0;
  private hdrPBOHeight = 0;
  private hdrPBOCachedPixels: Float32Array | null = null;  // data from previous frame
  private hdrPBOReady = false;       // true after first frame has been captured

  // --- Dedicated FBO/PBO for scope readback (separate from display blit path) ---
  // Scope analysis renders at reduced resolution (320×180 / 640×360), so using
  // the display path's FBO/PBO would cause dimension ping-ponging and data corruption.
  private scopeFBO: WebGLFramebuffer | null = null;
  private scopeFBOTexture: WebGLTexture | null = null;
  private scopeFBOWidth = 0;
  private scopeFBOHeight = 0;
  private scopePBOs: [WebGLBuffer | null, WebGLBuffer | null] = [null, null];
  private scopePBOFences: [WebGLSync | null, WebGLSync | null] = [null, null];
  private scopePBOWidth = 0;
  private scopePBOHeight = 0;
  private scopePBOCachedPixels: Float32Array | null = null;
  private scopePBOReady = false;
  private scopeTempRow: Float32Array | null = null; // cached Y-flip temp buffer

  // Mipmap support for float textures (requires OES_texture_float_linear + EXT_color_buffer_float)
  private _mipmapSupported = false;

  // Whether the current SDR texture has mipmaps generated (only for HTMLImageElement sources)
  private _sdrTextureMipmapped = false;

  // Shared texture for VideoFrame uploads (HDR video path).
  // Reused across frames to avoid allocating one GPU texture per cached IPImage
  // (which would consume width×height×8 bytes × cacheSize, often exceeding VRAM).
  private _videoFrameTexture: WebGLTexture | null = null;

  // Track gl.unpackColorSpace to avoid toggling it every frame.
  // During HDR playback, every frame is a VideoFrame needing 'display-p3',
  // so resetting to 'srgb' after each upload just to set it back next frame
  // wastes ~0.5ms per frame in try/catch overhead.
  private _currentUnpackColorSpace: string = 'srgb';

  // User-applied transform (rotation/flip from TransformControl)
  private _userRotation: 0 | 90 | 180 | 270 = 0;
  private _userFlipH = false;
  private _userFlipV = false;

  initialize(canvas: HTMLCanvasElement | OffscreenCanvas, capabilities?: DisplayCapabilities): void {
    this.canvas = canvas;

    // For HDR displays, request preserveDrawingBuffer so readPixels works after compositing.
    // Also enable for E2E tests to allow canvas state sampling (getCanvasBrightness).
    const isTest = typeof window !== 'undefined' && (window as any).__OPENRV_TEST__;
    const wantHDR = capabilities?.displayHDR === true || !!isTest;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: wantHDR,
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
          } else if (capabilities?.displayHDR && capabilities?.webglDrawingBufferStorage && capabilities?.canvasExtendedHDR) {
            // Extended HDR: use display-p3 (or srgb) + half-float backbuffer + extended mode
            gl2.drawingBufferColorSpace = capabilities?.webglP3 ? 'display-p3' : 'srgb';
            this.hdrOutputMode = 'extended';
            log.info(`HDR output: extended (drawingBufferColorSpace='${gl2.drawingBufferColorSpace}')`);
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
        // Try extended HDR mode, then fall back to P3.
        if (capabilities?.displayHDR && capabilities?.webglDrawingBufferStorage && capabilities?.canvasExtendedHDR) {
          try {
            const gl2 = gl as WebGL2RenderingContext;
            gl2.drawingBufferColorSpace = capabilities?.webglP3 ? 'display-p3' : 'srgb';
            this.hdrOutputMode = 'extended';
            log.info(`HDR output: extended (drawingBufferColorSpace='${gl2.drawingBufferColorSpace}')`);
          } catch (extErr) {
            log.warn('Failed to configure extended HDR mode:', extErr);
          }
        }
        if (this.hdrOutputMode === 'sdr') {
          try {
            if (capabilities?.webglP3) {
              (gl as WebGL2RenderingContext).drawingBufferColorSpace = 'display-p3';
            }
          } catch (p3Err) {
            log.warn('Failed to set display-p3 drawingBufferColorSpace:', p3Err);
          }
          log.info(`HDR color spaces not available, using ${capabilities?.webglP3 ? 'display-p3' : 'srgb'}`);
        }
      }
    } else if (capabilities?.webglP3) {
      try {
        (gl as WebGL2RenderingContext).drawingBufferColorSpace = 'display-p3';
      } catch (e) {
        log.warn('Browser does not support setting drawingBufferColorSpace:', e);
      }
    }

    // Request half-float drawing buffer for HDR modes (essential for extended range)
    if (this.hdrOutputMode !== 'sdr') {
      const gl2 = gl as WebGL2RenderingContext;
      if (typeof gl2.drawingBufferStorage === 'function') {
        try {
          gl2.drawingBufferStorage(gl2.RGBA16F, canvas.width, canvas.height);
          this.usingHalfFloatBackbuffer = true;
          log.info('HDR: half-float drawing buffer enabled (RGBA16F)');
        } catch (e) {
          log.warn('drawingBufferStorage(RGBA16F) not supported:', e);
        }
      }
      this.tryConfigureHDRMetadata();
    }

    // Check for required extensions
    const requiredExtensions = ['EXT_color_buffer_float', 'OES_texture_float_linear'];
    for (const ext of requiredExtensions) {
      if (!(gl as WebGL2RenderingContext).getExtension(ext)) {
        log.warn(`Extension ${ext} not available`);
      }
    }

    // Cache mipmap support for float textures: both extensions must be present
    // and generateMipmap must be available on the context
    const floatLinear = (gl as WebGL2RenderingContext).getExtension('OES_texture_float_linear');
    const colorBufferFloat = (gl as WebGL2RenderingContext).getExtension('EXT_color_buffer_float');
    this._mipmapSupported = !!(floatLinear && colorBufferFloat && typeof (gl as WebGL2RenderingContext).generateMipmap === 'function');

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

    // Re-allocate half-float drawing buffer at new dimensions
    if (this.usingHalfFloatBackbuffer && typeof this.gl.drawingBufferStorage === 'function') {
      try {
        this.gl.drawingBufferStorage(this.gl.RGBA16F, width, height);
      } catch (e) {
        log.warn('drawingBufferStorage resize failed:', e);
      }
    }
  }

  /**
   * Set the GL viewport subrect without resizing the canvas buffer.
   * Used for interaction quality tiering: the canvas stays at full physical
   * resolution while the viewport is reduced during active interactions.
   */
  setViewport(width: number, height: number): void {
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
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
      PerfTrace.begin('updateTexture');
      this.updateTexture(image);
      PerfTrace.end('updateTexture');
    }

    // Use display shader
    this.displayShader.use();
    this.displayShader.setUniform('u_offset', [offsetX, offsetY]);
    this.displayShader.setUniform('u_scale', [scaleX, scaleY]);

    // Set HDR output mode uniform
    this.displayShader.setUniformInt('u_outputMode', this.hdrOutputMode === 'sdr' ? OUTPUT_MODE_SDR : OUTPUT_MODE_HDR);

    // Set HDR headroom for tone mapping (1.0 for SDR, >1.0 for HDR displays)
    this.displayShader.setUniform('u_hdrHeadroom', this.hdrOutputMode === 'sdr' ? 1.0 : this.hdrHeadroom);

    // Set input transfer function uniform based on image metadata
    let inputTransferCode = INPUT_TRANSFER_SRGB;
    if (image.metadata.transferFunction === 'hlg') {
      inputTransferCode = INPUT_TRANSFER_HLG;
    } else if (image.metadata.transferFunction === 'pq') {
      inputTransferCode = INPUT_TRANSFER_PQ;
    } else if (image.metadata.transferFunction === 'smpte240m') {
      inputTransferCode = INPUT_TRANSFER_SMPTE240M;
    }
    this.displayShader.setUniformInt('u_inputTransfer', inputTransferCode);

    // Debug: log shader uniforms for HDR pipeline diagnosis (once per texture update)
    if (image.textureNeedsUpdate === false) {
      // Only log on first render after texture upload to avoid spam
    } else {
      const dc = this.stateManager.getDisplayColorState();
      log.info(
        `renderImage: outputMode=${this.hdrOutputMode}` +
        ` inputTransfer=${inputTransferCode} (metadata.tf=${image.metadata.transferFunction ?? 'unset'})` +
        ` displayTransfer=${dc.transferFunction} displayGamma=${dc.displayGamma} displayBrightness=${dc.displayBrightness}` +
        ` size=${image.width}x${image.height} dtype=${image.dataType} channels=${image.channels}`
      );
    }

    // Combine video rotation metadata with user-applied rotation.
    // Both are in degrees (0, 90, 180, 270). The shader uniform is 0-3.
    const videoRotation = (image.metadata.attributes?.videoRotation as number) ?? 0;
    const totalRotation = (Math.round(videoRotation / 90) + Math.round(this._userRotation / 90)) % 4;
    this.displayShader.setUniformInt('u_texRotation', totalRotation);
    this.displayShader.setUniformInt('u_texFlipH', this._userFlipH ? 1 : 0);
    this.displayShader.setUniformInt('u_texFlipV', this._userFlipV ? 1 : 0);

    // Set texel size for clarity/sharpen (based on source image dimensions)
    if (image.width > 0 && image.height > 0) {
      this.stateManager.setTexelSize(1.0 / image.width, 1.0 / image.height);
    }

    // Apply all shared effect uniforms and bind textures via state manager
    PerfTrace.begin('applyUniforms');
    this.stateManager.applyUniforms(this.displayShader, this.createTextureCallbacks());
    PerfTrace.end('applyUniforms');

    // Bind image texture to unit 0
    this.displayShader.setUniformInt('u_texture', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.texture);

    // For 360 spherical projection, use REPEAT wrap so the equirectangular
    // seam (longitude ±180°) blends smoothly instead of clamping to edge pixels.
    const sphericalActive = this.stateManager.isSphericalEnabled();
    if (sphericalActive) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // Draw quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // Restore CLAMP_TO_EDGE after 360 rendering to avoid affecting other passes
    if (sphericalActive) {
      gl.bindTexture(gl.TEXTURE_2D, image.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    }
  }

  /**
   * Render multiple images in a tiled layout using viewport/scissor clipping.
   *
   * Each image is rendered into its own viewport region on the canvas. The
   * canvas is NOT cleared first -- the caller should clear before calling.
   * Each tile uses gl.viewport() and gl.scissor() to clip rendering to
   * its designated region.
   *
   * @param tiles - Array of { image, viewport } entries to render
   */
  renderTiledImages(tiles: { image: IPImage; viewport: TileViewport }[]): void {
    if (!this.gl || !this.displayShader || tiles.length === 0) return;
    if (!this.displayShader.isReady()) return;

    const gl = this.gl;

    // Save current viewport
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // Enable scissor test to clip each tile to its viewport region
    gl.enable(gl.SCISSOR_TEST);

    try {
      for (const tile of tiles) {
        const { image, viewport } = tile;

        // Set viewport and scissor to the tile region
        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
        gl.scissor(viewport.x, viewport.y, viewport.width, viewport.height);

        // Render the image using the standard renderImage path
        // (fills the current viewport with the image)
        this.renderImage(image, 0, 0, 1, 1);
      }
    } finally {
      // Restore previous state
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(prevViewport[0]!, prevViewport[1]!, prevViewport[2]!, prevViewport[3]!);
    }
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
      bindFilmLUTTexture: () => {
        this.ensureFilmLUTTexture();
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this.filmLUTTexture);
      },
      bindInlineLUTTexture: () => {
        this.ensureInlineLUTTexture();
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, this.inlineLUTTexture);
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

  private ensureFilmLUTTexture(): void {
    const gl = this.gl;
    if (!gl) return;

    const sm = this.stateManager as ShaderStateManager;
    const s = sm.getInternalState();

    if (!this.filmLUTTexture) {
      this.filmLUTTexture = gl.createTexture();
    }

    if (s.filmLUTDirty && s.filmLUTData) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.filmLUTTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // Film LUT is 256x1 RGB packed as RGBA (alpha=255)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_1D_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, s.filmLUTData);
      sm.clearTextureDirtyFlag('filmLUTDirty');
    }
  }

  private ensureInlineLUTTexture(): void {
    const gl = this.gl;
    if (!gl) return;

    const sm = this.stateManager as ShaderStateManager;
    const s = sm.getInternalState();

    if (!this.inlineLUTTexture) {
      this.inlineLUTTexture = gl.createTexture();
    }

    if (s.inlineLUTDirty && s.inlineLUTData) {
      const lutSize = s.inlineLUTSize;
      const channels = s.inlineLUTChannels;

      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.inlineLUTTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      if (channels === 3) {
        // 3-channel: de-interleave [R0,G0,B0, R1,G1,B1, ...] into 3 rows:
        //   row 0: [R0, R1, ..., R(n-1)]
        //   row 1: [G0, G1, ..., G(n-1)]
        //   row 2: [B0, B1, ..., B(n-1)]
        // Upload as (lutSize x 3) R32F texture
        const totalElements = lutSize * 3;
        if (!this.inlineLUTDeinterleavedBuffer || this.inlineLUTDeinterleavedBufferSize !== totalElements) {
          this.inlineLUTDeinterleavedBuffer = new Float32Array(totalElements);
          this.inlineLUTDeinterleavedBufferSize = totalElements;
        }
        const dst = this.inlineLUTDeinterleavedBuffer;
        const src = s.inlineLUTData;
        for (let i = 0; i < lutSize; i++) {
          dst[i] = src[i * 3]!;                 // R row
          dst[lutSize + i] = src[i * 3 + 1]!;   // G row
          dst[lutSize * 2 + i] = src[i * 3 + 2]!; // B row
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, lutSize, 3, 0, gl.RED, gl.FLOAT, dst);
      } else {
        // 1-channel luminance: upload as (lutSize x 1) R32F texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, lutSize, 1, 0, gl.RED, gl.FLOAT, s.inlineLUTData);
      }

      sm.clearTextureDirtyFlag('inlineLUTDirty');
    }
  }

  private updateTexture(image: IPImage): void {
    if (!this.gl) return;

    const gl = this.gl;

    // VideoFrame direct GPU upload path (HDR video).
    // Uses a single shared texture (_videoFrameTexture) instead of creating
    // one GL texture per cached IPImage. Without this, a 300-frame cache at
    // 1920×1080 RGBA16F would allocate ~4.8 GB of GPU textures, exceeding
    // VRAM and causing driver-level frame drops / texture swapping.
    if (image.videoFrame) {
      if (!this._videoFrameTexture) {
        this._videoFrameTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._videoFrameTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }

      // Point the IPImage at the shared texture so renderImage() binds the
      // correct object. The data is re-uploaded every frame (cheap: VideoFrame
      // is already a GPU resource, so texImage2D is a GPU-to-GPU copy).
      image.texture = this._videoFrameTexture;
      gl.bindTexture(gl.TEXTURE_2D, this._videoFrameTexture);

      try {
        // Set unpackColorSpace for best color fidelity — only when not already set.
        // During HDR playback every frame is a VideoFrame, so this avoids
        // redundant try/catch toggles (~0.5ms saved per frame).
        if (this._currentUnpackColorSpace !== 'display-p3') {
          try {
            gl.unpackColorSpace = 'display-p3';
            this._currentUnpackColorSpace = 'display-p3';
          } catch (e) {
            log.warn('Browser does not support unpackColorSpace:', e);
          }
        }

        PerfTrace.begin('texImage2D(VideoFrame)');
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,    // 16-bit float internal format for HDR
          gl.RGBA,
          gl.HALF_FLOAT,
          image.videoFrame // VideoFrame is a valid TexImageSource
        );
        PerfTrace.end('texImage2D(VideoFrame)');

        // Do NOT close the VideoFrame here — the IPImage may be held in an
        // LRU cache (e.g. VideoSourceNode.hdrFrameCache) and could be re-uploaded
        // after a WebGL context loss.  The cache's eviction callback owns the
        // VideoFrame lifecycle.

        // Do NOT reset unpackColorSpace here — during HDR playback the next
        // frame will also be a VideoFrame needing 'display-p3'. The SDR path
        // (renderSDRFrame) resets to 'srgb' when needed.

        // Do NOT set textureNeedsUpdate = false — since the texture is shared,
        // the next frame's IPImage must re-upload its own VideoFrame data.
        return;
      } catch (e) {
        // VideoFrame texImage2D not supported - fall through to SDR path
        log.warn('VideoFrame texImage2D failed, falling back to typed array upload:', e);
        image.close();
      }
    }

    // --- Non-VideoFrame path (typed array / HDR files) ---

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

    // Fast path: ImageBitmap straight to GPU
    if (image.imageBitmap) {
      try {
        if (this._currentUnpackColorSpace !== 'srgb') {
          try {
            gl.unpackColorSpace = 'srgb';
            this._currentUnpackColorSpace = 'srgb';
          } catch (e) {}
        }

        PerfTrace.begin('texImage2D(ImageBitmap)');
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image.imageBitmap
        );
        PerfTrace.end('texImage2D(ImageBitmap)');

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        image.textureNeedsUpdate = false;
        return;
      } catch (e) {
        log.warn('ImageBitmap texImage2D failed, falling back:', e);
      }
    }

    // Standard TypedArray upload path
    // For 3-channel float images (e.g. RGB EXR), pad to RGBA so mipmaps can be generated.
    // RGB32F is not color-renderable in WebGL2, so generateMipmap would fail on it.
    const canPadToRGBA = image.channels === 3 && image.dataType === 'float32' && this._mipmapSupported;
    const uploadChannels = canPadToRGBA ? 4 : image.channels;
    const { internalFormat, format, type } = this.getTextureFormat(image.dataType, uploadChannels);

    let uploadData: Uint8Array | Uint16Array | Float32Array = image.getTypedArray();
    if (canPadToRGBA) {
      const src = image.getTypedArray() as Float32Array;
      const pixelCount = image.width * image.height;
      const rgba = new Float32Array(pixelCount * 4);
      for (let i = 0; i < pixelCount; i++) {
        const si = i * 3;
        const di = i * 4;
        rgba[di] = src[si]!;
        rgba[di + 1] = src[si + 1]!;
        rgba[di + 2] = src[si + 2]!;
        rgba[di + 3] = 1.0;
      }
      uploadData = rgba;
    }

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      image.width,
      image.height,
      0,
      format,
      type,
      uploadData
    );

    // Generate mipmaps for RGBA float textures (including padded 3-channel HDR).
    // Skip for VideoFrame sources (cost blows 16ms frame budget on mobile).
    if (uploadChannels === 4 && !image.videoFrame && this._mipmapSupported) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }

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

  /**
   * Set user-applied rotation and flip (from TransformControl).
   * Combined with video rotation metadata in the vertex shader.
   */
  setUserTransform(rotation: 0 | 90 | 180 | 270, flipH: boolean, flipV: boolean): void {
    this._userRotation = rotation;
    this._userFlipH = flipH;
    this._userFlipV = flipV;
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

  setPremultMode(mode: number): void {
    this.stateManager.setPremultMode(mode);
  }

  getPremultMode(): number {
    return this.stateManager.getPremultMode();
  }

  setDitherMode(mode: number): void {
    this.stateManager.setDitherMode(mode);
  }

  getDitherMode(): number {
    return this.stateManager.getDitherMode();
  }

  setQuantizeBits(bits: number): void {
    this.stateManager.setQuantizeBits(bits);
  }

  getQuantizeBits(): number {
    return this.stateManager.getQuantizeBits();
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

  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended', capabilities: DisplayCapabilities): boolean {
    if (!this.gl) return false;

    const previousMode = this.hdrOutputMode;
    const previousHalfFloat = this.usingHalfFloatBackbuffer;
    const previousColorSpace = this.gl.drawingBufferColorSpace;
    try {
      let targetColorSpace: ExtendedColorSpace;
      switch (mode) {
        case 'hlg':
          targetColorSpace = 'rec2100-hlg';
          break;
        case 'pq':
          targetColorSpace = 'rec2100-pq';
          break;
        case 'extended':
          targetColorSpace = capabilities.webglP3 ? 'display-p3' : 'srgb';
          break;
        default:
          targetColorSpace = capabilities.webglP3 ? 'display-p3' : 'srgb';
      }

      this.gl.drawingBufferColorSpace = targetColorSpace;

      // Verify the assignment stuck (browser silently ignores unsupported values)
      if ((mode === 'hlg' || mode === 'pq') && this.gl.drawingBufferColorSpace !== targetColorSpace) {
        log.warn(`drawingBufferColorSpace='${targetColorSpace}' not supported (got '${this.gl.drawingBufferColorSpace}')`);
        this.hdrOutputMode = previousMode;
        return false;
      }

      this.hdrOutputMode = mode;

      // Request half-float drawing buffer for HDR modes
      if (mode !== 'sdr' && typeof this.gl.drawingBufferStorage === 'function' && this.canvas) {
        try {
          this.gl.drawingBufferStorage(this.gl.RGBA16F, this.canvas.width, this.canvas.height);
          this.usingHalfFloatBackbuffer = true;
        } catch (e) {
          log.warn('drawingBufferStorage(RGBA16F) failed:', e);
          this.usingHalfFloatBackbuffer = false;
          // Extended mode requires half-float backbuffer — fall back
          if (mode === 'extended') {
            log.warn('Extended HDR mode requires half-float backbuffer; falling back');
            this.hdrOutputMode = previousMode;
            this.gl.drawingBufferColorSpace = previousColorSpace;
            return false;
          }
        }
      } else if (mode === 'sdr') {
        // Revert to RGBA8 backbuffer when switching back to SDR
        if (this.usingHalfFloatBackbuffer && typeof this.gl.drawingBufferStorage === 'function' && this.canvas) {
          try {
            this.gl.drawingBufferStorage(this.gl.RGBA8, this.canvas.width, this.canvas.height);
          } catch (e) {
            log.warn('drawingBufferStorage(RGBA8) revert failed:', e);
          }
        }
        this.usingHalfFloatBackbuffer = false;
      }

      // Attempt to configure HDR metadata when entering HDR mode
      if (mode !== 'sdr') {
        this.tryConfigureHDRMetadata();
      }

      return true;
    } catch (e) {
      // Ensure all state is rolled back to its previous value
      log.warn('Failed to set HDR output mode:', e);
      this.hdrOutputMode = previousMode;
      this.usingHalfFloatBackbuffer = previousHalfFloat;
      try { this.gl.drawingBufferColorSpace = previousColorSpace; } catch { /* best effort */ }
      return false;
    }
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' | 'extended' {
    return this.hdrOutputMode;
  }

  /**
   * Set the HDR headroom (peak luminance / SDR white luminance).
   * Values > 1.0 indicate the display can show brighter-than-SDR-white.
   * Used by tone mapping to preserve highlights up to display peak brightness.
   */
  setHDRHeadroom(headroom: number): void {
    // Clamp to [1.0, 100.0] — values beyond 100x SDR white are unreasonable
    // and could cause NaN/Inf in shader tone mapping math.
    this.hdrHeadroom = Math.min(100.0, Math.max(1.0, headroom));
  }

  /**
   * Get the current HDR headroom value.
   * Returns 1.0 for SDR, >1.0 for HDR displays.
   */
  getHDRHeadroom(): number {
    return this.hdrHeadroom;
  }

  /**
   * Render the current image through the full shader pipeline at reduced
   * resolution for scope analysis (histogram, waveform, vectorscope).
   *
   * Uses the existing RGBA16F FBO + PBO async readback infrastructure to
   * avoid GPU stalls. Returns float pixel data with rows in top-to-bottom
   * order (Y-flipped from GL convention) so scopes can consume directly.
   *
   * When the framebuffer is not HDR (SDR path), UNSIGNED_BYTE data is still
   * returned as float (divided by 255) via the existing readPixelFloat path.
   *
   * @param image The IPImage to render
   * @param targetWidth Desired scope analysis width (e.g. 320 for playback, 640 for paused)
   * @param targetHeight Desired scope analysis height (e.g. 180 for playback, 360 for paused)
   * @returns Float32Array in RGBA top-to-bottom row order, or null on failure
   */
  renderForScopes(
    image: IPImage,
    targetWidth: number,
    targetHeight: number,
  ): { data: Float32Array; width: number; height: number } | null {
    const gl = this.gl;
    if (!gl || !this.displayShader) return null;

    // Use dedicated scope FBO/PBO pool (separate from display blit path)
    const pixels = this.renderImageToFloatAsyncForScopes(image, targetWidth, targetHeight);
    if (!pixels) return null;

    // Copy the PBO cached data so the Y-flip doesn't mutate the shared cache.
    // At scope resolution this is small (~900KB for 320×180×4×4).
    const result = new Float32Array(pixels);

    // Y-flip: gl.readPixels returns bottom-to-top rows; scopes expect top-to-bottom.
    const rowSize = targetWidth * RGBA_CHANNELS;
    const halfHeight = targetHeight >> 1;
    // Reuse cached temp row to avoid per-call allocation
    if (!this.scopeTempRow || this.scopeTempRow.length !== rowSize) {
      this.scopeTempRow = new Float32Array(rowSize);
    }
    for (let y = 0; y < halfHeight; y++) {
      const topOffset = y * rowSize;
      const bottomOffset = (targetHeight - 1 - y) * rowSize;
      this.scopeTempRow.set(result.subarray(topOffset, topOffset + rowSize));
      result.copyWithin(topOffset, bottomOffset, bottomOffset + rowSize);
      result.set(this.scopeTempRow, bottomOffset);
    }

    return { data: result, width: targetWidth, height: targetHeight };
  }

  /**
   * Async PBO readback using the dedicated scope FBO/PBO pool.
   * Identical logic to renderImageToFloatAsync but uses scope-specific resources
   * to avoid contention with the display blit path.
   */
  private renderImageToFloatAsyncForScopes(image: IPImage, width: number, height: number): Float32Array | null {
    const gl = this.gl;
    if (!gl || !this.displayShader) return null;

    // Check EXT_color_buffer_float once (shared with display path)
    if (this.hasColorBufferFloat === null) {
      this.hasColorBufferFloat = gl.getExtension('EXT_color_buffer_float') !== null;
    }
    if (!this.hasColorBufferFloat) return null;

    // Ensure scope FBO exists and matches dimensions
    this.ensureScopeFBO(width, height);
    if (!this.scopeFBO) return null;

    // If dimensions changed, invalidate scope PBO state
    if (this.scopePBOWidth !== width || this.scopePBOHeight !== height) {
      this.disposeScopePBOs();
    }

    // Ensure scope PBOs exist
    this.ensureScopePBOs(width, height);

    // If PBO allocation failed, fall back to sync path using scope FBO
    if (!this.scopePBOs[0] || !this.scopePBOs[1]) {
      return this.renderImageToFloatSync(image, width, height, this.scopeFBO);
    }

    const pixelCount = width * height * RGBA_CHANNELS;
    if (!this.scopePBOCachedPixels || this.scopePBOCachedPixels.length !== pixelCount) {
      this.scopePBOCachedPixels = new Float32Array(pixelCount);
    }

    // Neutralize display/tone-mapping output so scopes show scene-referred data
    const prevDisplayState = this.stateManager.getDisplayColorState();
    this.stateManager.setDisplayColorState(SCOPE_DISPLAY_CONFIG);
    const prevToneMappingState = this.stateManager.getToneMappingState();

    // Step 1: Render current frame to scope FBO
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevHdrMode = this.hdrOutputMode;
    const disableToneMappingForScopes = prevHdrMode !== 'sdr' && prevToneMappingState.enabled;
    if (disableToneMappingForScopes) {
      this.stateManager.setToneMappingState({ enabled: false, operator: 'off' });
    }
    this.hdrOutputMode = 'hlg';

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.scopeFBO);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.renderImage(image, 0, 0, 1, 1);

      // Step 2: Consume any PBO whose GPU fence has signaled
      for (let i = 0; i < 2; i++) {
        const fence = this.scopePBOFences[i];
        if (fence && gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED) {
          gl.deleteSync(fence);
          this.scopePBOFences[i] = null;
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.scopePBOs[i]!);
          gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.scopePBOCachedPixels!);
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          this.scopePBOReady = true;
        }
      }

      // Step 3: Start async readPixels into an idle PBO
      for (let i = 0; i < 2; i++) {
        if (!this.scopePBOFences[i]) {
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.scopePBOs[i]!);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, 0);
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          this.scopePBOFences[i] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          break;
        }
      }

      // Step 4: First-frame fallback — sync readPixels (one-time stall)
      if (!this.scopePBOReady) {
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, this.scopePBOCachedPixels!);
        this.scopePBOReady = true;
      }
    } finally {
      this.hdrOutputMode = prevHdrMode;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(prevViewport[0]!, prevViewport[1]!, prevViewport[2]!, prevViewport[3]!);
      this.stateManager.setDisplayColorState(prevDisplayState);
      if (disableToneMappingForScopes) {
        this.stateManager.setToneMappingState(prevToneMappingState);
      }
    }

    return this.scopePBOCachedPixels;
  }

  /**
   * Synchronous float readback using a specific FBO (fallback when PBOs fail).
   */
  private renderImageToFloatSync(image: IPImage, width: number, height: number, fbo: WebGLFramebuffer): Float32Array | null {
    const gl = this.gl;
    if (!gl || !this.displayShader) return null;

    // Neutralize display/tone-mapping output so scopes show scene-referred data
    const prevDisplayState = this.stateManager.getDisplayColorState();
    this.stateManager.setDisplayColorState(SCOPE_DISPLAY_CONFIG);
    const prevToneMappingState = this.stateManager.getToneMappingState();

    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevHdrMode = this.hdrOutputMode;
    const disableToneMappingForScopes = prevHdrMode !== 'sdr' && prevToneMappingState.enabled;
    if (disableToneMappingForScopes) {
      this.stateManager.setToneMappingState({ enabled: false, operator: 'off' });
    }
    this.hdrOutputMode = 'hlg';

    const pixels = new Float32Array(width * height * RGBA_CHANNELS);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.renderImage(image, 0, 0, 1, 1);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
    } finally {
      this.hdrOutputMode = prevHdrMode;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(prevViewport[0]!, prevViewport[1]!, prevViewport[2]!, prevViewport[3]!);
      this.stateManager.setDisplayColorState(prevDisplayState);
      if (disableToneMappingForScopes) {
        this.stateManager.setToneMappingState(prevToneMappingState);
      }
    }

    return gl.getError() === gl.NO_ERROR ? pixels : null;
  }

  /**
   * Ensure scope-dedicated FBO exists and matches dimensions.
   */
  private ensureScopeFBO(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.scopeFBO && this.scopeFBOWidth === width && this.scopeFBOHeight === height) {
      return;
    }

    if (this.scopeFBOTexture) { gl.deleteTexture(this.scopeFBOTexture); this.scopeFBOTexture = null; }
    if (this.scopeFBO) { gl.deleteFramebuffer(this.scopeFBO); this.scopeFBO = null; }

    const texture = gl.createTexture();
    if (!texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    if (!fbo) { gl.deleteTexture(texture); return; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
      return;
    }

    this.scopeFBO = fbo;
    this.scopeFBOTexture = texture;
    this.scopeFBOWidth = width;
    this.scopeFBOHeight = height;
  }

  /**
   * Ensure scope-dedicated PBOs exist.
   */
  private ensureScopePBOs(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.scopePBOs[0] && this.scopePBOs[1]) return;

    const byteSize = width * height * RGBA_CHANNELS * Float32Array.BYTES_PER_ELEMENT;
    const pbo0 = gl.createBuffer();
    const pbo1 = gl.createBuffer();
    if (!pbo0 || !pbo1) {
      if (pbo0) gl.deleteBuffer(pbo0);
      if (pbo1) gl.deleteBuffer(pbo1);
      return;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo0);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, byteSize, gl.DYNAMIC_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo1);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, byteSize, gl.DYNAMIC_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.scopePBOs[0] = pbo0;
    this.scopePBOs[1] = pbo1;
    this.scopePBOWidth = width;
    this.scopePBOHeight = height;
    this.scopePBOReady = false;
    this.scopePBOCachedPixels = null;
  }

  /**
   * Clean up scope-dedicated PBO resources.
   */
  private disposeScopePBOs(): void {
    const gl = this.gl;
    if (gl) {
      if (this.scopePBOs[0]) { gl.deleteBuffer(this.scopePBOs[0]); this.scopePBOs[0] = null; }
      if (this.scopePBOs[1]) { gl.deleteBuffer(this.scopePBOs[1]); this.scopePBOs[1] = null; }
      if (this.scopePBOFences[0]) { gl.deleteSync(this.scopePBOFences[0]); this.scopePBOFences[0] = null; }
      if (this.scopePBOFences[1]) { gl.deleteSync(this.scopePBOFences[1]); this.scopePBOFences[1] = null; }
    }
    this.scopePBOWidth = 0;
    this.scopePBOHeight = 0;
    this.scopePBOReady = false;
    this.scopePBOCachedPixels = null;
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

  // --- Offscreen RGBA16F FBO rendering (WebGPU HDR blit path) ---

  /**
   * Render an image through the full shader pipeline into an offscreen RGBA16F
   * FBO, then read back the float pixel data via readPixels(FLOAT).
   *
   * This preserves HDR values > 1.0 that would be clamped by the default RGBA8
   * backbuffer. The returned Float32Array can be uploaded to a WebGPU HDR canvas.
   *
   * Row order: bottom-to-top (WebGL convention). The caller (WGSL shader) flips
   * via UV coordinates, so no CPU row-flip is performed here.
   *
   * Returns null if EXT_color_buffer_float is unavailable or rendering fails.
   */
  renderImageToFloat(image: IPImage, width: number, height: number): Float32Array | null {
    const gl = this.gl;
    if (!gl || !this.displayShader) return null;

    // Check EXT_color_buffer_float once (required for RGBA16F render target)
    if (this.hasColorBufferFloat === null) {
      this.hasColorBufferFloat = gl.getExtension('EXT_color_buffer_float') !== null;
    }
    if (!this.hasColorBufferFloat) {
      log.warn('EXT_color_buffer_float not available; renderImageToFloat disabled');
      return null;
    }

    // Ensure FBO exists and matches dimensions
    this.ensureHDRFBO(width, height);
    if (!this.hdrFBO) return null;

    // Save current viewport and HDR output state
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevHdrMode = this.hdrOutputMode;

    // IMPORTANT: Temporarily set any non-SDR mode so renderImage() emits
    // u_outputMode=HDR (which skips [0,1] clamping in the shader). The
    // specific mode ('hlg') is irrelevant — only the SDR vs non-SDR
    // distinction matters. Without this, values > 1.0 are clamped,
    // defeating the purpose of the RGBA16F FBO.
    this.hdrOutputMode = 'hlg';

    // Bind FBO and render
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrFBO);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Render image using the existing pipeline (renderImage draws to the currently bound FBO)
    this.renderImage(image, 0, 0, 1, 1);

    // Restore HDR output mode immediately after rendering
    this.hdrOutputMode = prevHdrMode;

    // Read float pixels (reuse buffer across frames when dimensions match)
    const pixelCount = width * height * RGBA_CHANNELS;
    if (!this.hdrReadbackBuffer || this.hdrReadbackBuffer.length !== pixelCount) {
      this.hdrReadbackBuffer = new Float32Array(pixelCount);
    }
    const pixels = this.hdrReadbackBuffer;
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);

    const err = gl.getError();

    // Unbind FBO and restore viewport
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(prevViewport[0]!, prevViewport[1]!, prevViewport[2]!, prevViewport[3]!);

    if (err !== gl.NO_ERROR) {
      log.warn('readPixels(FLOAT) failed with GL error:', err);
      return null;
    }

    return pixels;
  }

  /**
   * Async PBO readback: renders to RGBA16F FBO, starts a non-blocking
   * readPixels into a PBO, and returns the PREVIOUS frame's data immediately.
   *
   * Double-buffered: two PBOs alternate each frame.
   * - Frame N: render → async readPixels into idle PBO, poll other PBO's fence
   * - If fence signaled: getBufferSubData (fast, ~0.6ms), cache result
   * - If fence not signaled: return previously cached data (no stall)
   *
   * On the very first call, performs a synchronous readPixels directly from
   * the FBO to provide immediate data (one-time GPU stall).
   *
   * Uses getSyncParameter to poll fences (non-blocking). Only reads a PBO
   * when its fence is confirmed SIGNALED, avoiding ANGLE performance warnings.
   * Only writes to PBOs with no pending fence, preventing "written again"
   * warnings.
   *
   * Falls back to synchronous renderImageToFloat if PBO allocation fails.
   *
   * Trade-off: 1 frame of latency (imperceptible at 30-60fps) in exchange
   * for eliminating the 8-25ms GPU sync stall per frame.
   */
  renderImageToFloatAsync(image: IPImage, width: number, height: number): Float32Array | null {
    const gl = this.gl;
    if (!gl || !this.displayShader) return null;

    // Check EXT_color_buffer_float once
    if (this.hasColorBufferFloat === null) {
      this.hasColorBufferFloat = gl.getExtension('EXT_color_buffer_float') !== null;
    }
    if (!this.hasColorBufferFloat) return null;

    // Ensure FBO exists and matches dimensions
    this.ensureHDRFBO(width, height);
    if (!this.hdrFBO) return null;

    // If dimensions changed, invalidate PBO state
    if (this.hdrPBOWidth !== width || this.hdrPBOHeight !== height) {
      this.disposeHDRPBOs();
    }

    // Ensure PBOs exist
    this.ensureHDRPBOs(width, height);

    // If PBO allocation failed, fall back to sync path
    if (!this.hdrPBOs[0] || !this.hdrPBOs[1]) {
      return this.renderImageToFloat(image, width, height);
    }

    const pixelCount = width * height * RGBA_CHANNELS;
    if (!this.hdrPBOCachedPixels || this.hdrPBOCachedPixels.length !== pixelCount) {
      this.hdrPBOCachedPixels = new Float32Array(pixelCount);
    }

    // Step 1: Render current frame to FBO
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevHdrMode = this.hdrOutputMode;
    this.hdrOutputMode = 'hlg';

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrFBO);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.renderImage(image, 0, 0, 1, 1);
    this.hdrOutputMode = prevHdrMode;

    // Step 2: Consume any PBO whose GPU fence has signaled.
    // Only reads when getSyncParameter confirms SIGNALED — avoids the
    // "read without fence" ANGLE warning that clientWaitSync(timeout=0)
    // would cause (WebGL2 MAX_CLIENT_WAIT_TIMEOUT_WEBGL is 0).
    for (let i = 0; i < 2; i++) {
      const fence = this.hdrPBOFences[i];
      if (fence && gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED) {
        gl.deleteSync(fence);
        this.hdrPBOFences[i] = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.hdrPBOs[i]!);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.hdrPBOCachedPixels!);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        this.hdrPBOReady = true;
      }
    }

    // Step 3: Start async readPixels into an idle PBO (no pending fence).
    // Only writes to PBOs whose data has been consumed (fence cleared),
    // preventing the "written again before read" ANGLE warning.
    for (let i = 0; i < 2; i++) {
      if (!this.hdrPBOFences[i]) {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.hdrPBOs[i]!);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        this.hdrPBOFences[i] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        break;
      }
    }

    // Step 4: First-frame fallback — no PBO data yet, sync readPixels from
    // the FBO (still bound). One-time stall (~8-25ms).
    if (!this.hdrPBOReady) {
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, this.hdrPBOCachedPixels!);
      this.hdrPBOReady = true;
    }

    // Unbind FBO and restore viewport
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(prevViewport[0]!, prevViewport[1]!, prevViewport[2]!, prevViewport[3]!);

    return this.hdrPBOCachedPixels;
  }

  /**
   * Ensure double-buffered PBOs exist for async readback.
   */
  private ensureHDRPBOs(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.hdrPBOs[0] && this.hdrPBOs[1]) return; // already allocated

    const byteSize = width * height * RGBA_CHANNELS * Float32Array.BYTES_PER_ELEMENT;

    const pbo0 = gl.createBuffer();
    const pbo1 = gl.createBuffer();
    if (!pbo0 || !pbo1) {
      if (pbo0) gl.deleteBuffer(pbo0);
      if (pbo1) gl.deleteBuffer(pbo1);
      return;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo0);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, byteSize, gl.DYNAMIC_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo1);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, byteSize, gl.DYNAMIC_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.hdrPBOs[0] = pbo0;
    this.hdrPBOs[1] = pbo1;

    this.hdrPBOWidth = width;
    this.hdrPBOHeight = height;
    this.hdrPBOReady = false;
    this.hdrPBOCachedPixels = null;
  }

  /**
   * Clean up PBO resources.
   */
  private disposeHDRPBOs(): void {
    const gl = this.gl;
    if (gl) {
      if (this.hdrPBOs[0]) { gl.deleteBuffer(this.hdrPBOs[0]); this.hdrPBOs[0] = null; }
      if (this.hdrPBOs[1]) { gl.deleteBuffer(this.hdrPBOs[1]); this.hdrPBOs[1] = null; }
      if (this.hdrPBOFences[0]) { gl.deleteSync(this.hdrPBOFences[0]); this.hdrPBOFences[0] = null; }
      if (this.hdrPBOFences[1]) { gl.deleteSync(this.hdrPBOFences[1]); this.hdrPBOFences[1] = null; }
    }
    this.hdrPBOWidth = 0;
    this.hdrPBOHeight = 0;
    this.hdrPBOReady = false;
    this.hdrPBOCachedPixels = null;
  }

  /**
   * Ensure the offscreen RGBA16F FBO exists and matches the requested dimensions.
   */
  private ensureHDRFBO(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.hdrFBO && this.hdrFBOWidth === width && this.hdrFBOHeight === height) {
      return; // Already correct size
    }

    // Delete old resources
    if (this.hdrFBOTexture) {
      gl.deleteTexture(this.hdrFBOTexture);
      this.hdrFBOTexture = null;
    }
    if (this.hdrFBO) {
      gl.deleteFramebuffer(this.hdrFBO);
      this.hdrFBO = null;
    }

    // Create texture
    const texture = gl.createTexture();
    if (!texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create FBO and attach texture
    const fbo = gl.createFramebuffer();
    if (!fbo) {
      gl.deleteTexture(texture);
      return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Verify completeness
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      log.warn('RGBA16F FBO not complete, status:', status);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
      return;
    }

    this.hdrFBO = fbo;
    this.hdrFBOTexture = texture;
    this.hdrFBOWidth = width;
    this.hdrFBOHeight = height;
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

  // -----------------------------------------------------------------------
  // OCIO WASM Integration
  // -----------------------------------------------------------------------

  /**
   * Set the OCIO WASM shader and 3D LUT for GPU-accelerated OCIO processing.
   *
   * When OCIO WASM is active, the baked 3D LUT from the WASM processor is
   * uploaded to a dedicated GPU texture and applied through the existing
   * u_lut3D pipeline path at full intensity (1.0). The translated GLSL
   * shader code and uniform metadata are stored for future dynamic shader
   * injection support.
   *
   * This method uses the existing 3D LUT infrastructure in the shader
   * (the `applyLUT3D()` function in viewer.frag.glsl), which performs
   * hardware-accelerated trilinear interpolation on the 3D texture.
   *
   * @param result - Pipeline result from OCIOWasmPipeline.buildDisplayPipeline()
   */
  setOCIOShader(result: OCIOPipelineResult | null): void {
    if (!result) {
      this.clearOCIOShader();
      return;
    }

    this.ocioWasmActive = true;
    this.ocioShaderCode = result.shader.code;
    this.ocioFunctionName = result.functionName;
    this.ocioUniforms = result.uniforms;

    // Upload the baked 3D LUT through the existing setLUT() path.
    // The OCIO baked LUT replaces any user-applied LUT when active.
    const lut = result.lut3D;
    this.stateManager.setLUT(lut.data, lut.size, 1.0);

    log.info(
      `OCIO WASM shader set: function=${result.functionName}` +
      ` uniforms=${result.uniforms.length}` +
      ` lut3dSize=${lut.size}` +
      ` fromWasm=${result.fromWasm}`,
    );
  }

  /**
   * Clear the OCIO WASM shader and restore the standard pipeline.
   */
  clearOCIOShader(): void {
    if (!this.ocioWasmActive) return;

    this.ocioWasmActive = false;
    this.ocioShaderCode = null;
    this.ocioFunctionName = null;
    this.ocioUniforms = null;

    // Disable the LUT (the caller should re-apply any user LUT if needed)
    this.stateManager.setLUT(null, 0, 0);

    log.info('OCIO WASM shader cleared');
  }

  /**
   * Whether the OCIO WASM shader is currently active.
   */
  isOCIOWasmActive(): boolean {
    return this.ocioWasmActive;
  }

  /**
   * Get the current OCIO WASM shader metadata (for debugging/inspection).
   */
  getOCIOShaderInfo(): {
    active: boolean;
    functionName: string | null;
    uniformCount: number;
    shaderCodeLength: number;
  } {
    return {
      active: this.ocioWasmActive,
      functionName: this.ocioFunctionName,
      uniformCount: this.ocioUniforms?.length ?? 0,
      shaderCodeLength: this.ocioShaderCode?.length ?? 0,
    };
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

  getDisplayColorState(): DisplayColorConfig {
    return this.stateManager.getDisplayColorState();
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

  setGamutMapping(state: GamutMappingState): void {
    this.stateManager.setGamutMapping(state);
  }

  setColorPrimaries(inputPrimaries: ColorPrimaries | undefined, outputColorSpace: 'srgb' | 'display-p3' | 'rec2020'): void {
    this.stateManager.setColorPrimaries(inputPrimaries, outputColorSpace);
  }

  setPerspective(state: { enabled: boolean; invH: Float32Array; quality: number }): void {
    this.stateManager.setPerspective(state);
  }

  setSphericalProjection(state: { enabled: boolean; fov: number; aspect: number; yaw: number; pitch: number }): void {
    this.stateManager.setSphericalProjection(state);
  }

  applyRenderState(state: RenderState): void {
    this.stateManager.applyRenderState(state);
  }

  hasPendingStateChanges(): boolean {
    return this.stateManager.hasPendingStateChanges();
  }

  private tryConfigureHDRMetadata(): void {
    if (!this.canvas) return;
    if (this.canvas.configureHighDynamicRange) {
      try {
        this.canvas.configureHighDynamicRange({ mode: 'extended' });
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

    // Guard against detached ImageBitmaps (closed before render)
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap && (source.width === 0 || source.height === 0)) {
      return null;
    }

    const gl = this.gl;

    // Ensure the SDR texture exists and set texture params once at creation
    if (!this.sdrTexture) {
      this.sdrTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.sdrTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this._sdrTextureMipmapped = false;
    }

    // Upload the SDR source to the texture
    gl.bindTexture(gl.TEXTURE_2D, this.sdrTexture);

    // Ensure unpackColorSpace is 'srgb' for SDR sources.
    // The HDR VideoFrame path sets it to 'display-p3' and leaves it there
    // for performance; reset here when switching back to SDR.
    if (this._currentUnpackColorSpace !== 'srgb') {
      try {
        gl.unpackColorSpace = 'srgb';
        this._currentUnpackColorSpace = 'srgb';
      } catch (e) {
        // Shouldn't fail for 'srgb', but guard defensively
      }
    }

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

    // Generate mipmaps for HTMLImageElement sources only (static, uploaded once).
    // Skip for HTMLVideoElement (texture changes every frame), HTMLCanvasElement
    // (from frame cache), and ImageBitmap.
    const isStaticImage = typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement;
    if (isStaticImage && !this._sdrTextureMipmapped && typeof gl.generateMipmap === 'function') {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      this._sdrTextureMipmapped = true;
    } else if (!isStaticImage) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      this._sdrTextureMipmapped = false;
    }

    // Use display shader
    this.displayShader.use();
    this.displayShader.setUniform('u_offset', [0, 0]);
    this.displayShader.setUniform('u_scale', [1, 1]);

    // SDR output: always clamp to [0,1], sRGB input (no special EOTF)
    this.displayShader.setUniformInt('u_outputMode', OUTPUT_MODE_SDR);
    this.displayShader.setUniformInt('u_inputTransfer', INPUT_TRANSFER_SRGB);
    // Apply user rotation/flip (SDR has no video rotation metadata)
    this.displayShader.setUniformInt('u_texRotation', Math.round(this._userRotation / 90) % 4);
    this.displayShader.setUniformInt('u_texFlipH', this._userFlipH ? 1 : 0);
    this.displayShader.setUniformInt('u_texFlipV', this._userFlipV ? 1 : 0);

    // SDR frames always use headroom=1.0 (no HDR expansion)
    this.displayShader.setUniform('u_hdrHeadroom', 1.0);

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
      this._sdrTextureMipmapped = false;
    }
    if (this._videoFrameTexture) {
      gl.deleteTexture(this._videoFrameTexture);
      this._videoFrameTexture = null;
    }
    this._currentUnpackColorSpace = 'srgb';
    if (this.curvesLUTTexture) gl.deleteTexture(this.curvesLUTTexture);
    if (this.falseColorLUTTexture) gl.deleteTexture(this.falseColorLUTTexture);
    if (this.lut3DTexture) gl.deleteTexture(this.lut3DTexture);
    if (this.filmLUTTexture) gl.deleteTexture(this.filmLUTTexture);
    if (this.inlineLUTTexture) gl.deleteTexture(this.inlineLUTTexture);

    // Release cached LUT conversion buffers
    this.falseColorRGBABuffer = null;
    this.lut3DRGBABuffer = null;
    this.lut3DRGBABufferSize = 0;
    this.inlineLUTDeinterleavedBuffer = null;
    this.inlineLUTDeinterleavedBufferSize = 0;

    // Release HDR FBO resources
    if (this.hdrFBOTexture) gl.deleteTexture(this.hdrFBOTexture);
    if (this.hdrFBO) gl.deleteFramebuffer(this.hdrFBO);
    this.hdrFBOTexture = null;
    this.hdrFBO = null;
    this.hdrFBOWidth = 0;
    this.hdrFBOHeight = 0;
    this.hasColorBufferFloat = null;
    this.hdrReadbackBuffer = null;

    // Release PBO resources
    this.disposeHDRPBOs();

    // Release scope-dedicated FBO/PBO resources
    this.disposeScopePBOs();
    if (this.scopeFBOTexture) gl.deleteTexture(this.scopeFBOTexture);
    if (this.scopeFBO) gl.deleteFramebuffer(this.scopeFBO);
    this.scopeFBOTexture = null;
    this.scopeFBO = null;
    this.scopeFBOWidth = 0;
    this.scopeFBOHeight = 0;
    this.scopeTempRow = null;

    // Release OCIO WASM resources
    this.ocioWasmActive = false;
    this.ocioShaderCode = null;
    this.ocioFunctionName = null;
    this.ocioUniforms = null;

    this.parallelCompileExt = null;
    this.usingHalfFloatBackbuffer = false;
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
