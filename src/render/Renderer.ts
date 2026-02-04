import { IPImage, DataType } from '../core/image/Image';
import { ShaderProgram } from './ShaderProgram';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { ToneMappingState, ToneMappingOperator, DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';
import { getHueRotationMatrix, isIdentityHueRotation } from '../color/HueRotation';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend, TextureHandle } from './RendererBackend';

// Re-export the interface and types so existing consumers can import from here
export type { RendererBackend, TextureHandle } from './RendererBackend';

/**
 * Tone mapping operator integer codes for shader uniform
 */
export const TONE_MAPPING_OPERATOR_CODES: Record<ToneMappingOperator, number> = {
  'off': 0,
  'reinhard': 1,
  'filmic': 2,
  'aces': 3,
};

/**
 * WebGL2-based renderer backend.
 *
 * This is the original Renderer class, now implementing the RendererBackend
 * interface. All behavior is identical to the pre-Phase 4 implementation.
 * Also exported as WebGL2Backend for clarity in backend selection.
 */
export class Renderer implements RendererBackend {
  // Color adjustments state
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;

  // Color inversion state
  private colorInversionEnabled = false;

  // Tone mapping state
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };

  // HDR output mode
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' = 'sdr';

  // Shaders
  private displayShader: ShaderProgram | null = null;

  // Quad geometry
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  // Current texture
  private currentTexture: WebGLTexture | null = null;

  initialize(canvas: HTMLCanvasElement, capabilities?: DisplayCapabilities): void {
    this.canvas = canvas;

    // For HDR displays, use default context attributes — the reference
    // ccameron-chromium HDR examples use plain getContext('webgl2') with
    // no custom attributes. alpha:false can prevent HDR compositing.
    const wantHDR = capabilities?.displayHDR === true;
    const gl = wantHDR
      ? canvas.getContext('webgl2')
      : canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;

    // Set drawingBufferColorSpace IMMEDIATELY after getContext, before any
    // shader compilation or buffer creation. Chrome may lock the color space
    // once GL state is created. The reference example sets it right away.
    if (wantHDR && 'drawingBufferColorSpace' in gl) {
      const glExt = gl as unknown as { drawingBufferColorSpace: string };
      // Try HLG first, then PQ
      try {
        glExt.drawingBufferColorSpace = 'rec2100-hlg';
        if (glExt.drawingBufferColorSpace === 'rec2100-hlg') {
          this.hdrOutputMode = 'hlg';
          console.log('[Renderer] HDR output: rec2100-hlg');
        } else {
          glExt.drawingBufferColorSpace = 'rec2100-pq';
          if (glExt.drawingBufferColorSpace === 'rec2100-pq') {
            this.hdrOutputMode = 'pq';
            console.log('[Renderer] HDR output: rec2100-pq');
          } else {
            // Fall back to P3
            if (capabilities?.webglP3) {
              glExt.drawingBufferColorSpace = 'display-p3';
            }
            console.log(`[Renderer] HDR color spaces not accepted, drawingBufferColorSpace='${glExt.drawingBufferColorSpace}'`);
          }
        }
      } catch {
        // rec2100-hlg/pq not in PredefinedColorSpace enum — expected on most browsers.
        // Fall back to P3 if possible.
        try {
          if (capabilities?.webglP3) {
            (gl as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace = 'display-p3';
          }
        } catch { /* ignore */ }
        console.log(`[Renderer] HDR color spaces not available, using ${capabilities?.webglP3 ? 'display-p3' : 'srgb'}`);
      }
    } else if (capabilities?.webglP3) {
      try {
        (gl as WebGL2RenderingContext & { drawingBufferColorSpace: string }).drawingBufferColorSpace = 'display-p3';
      } catch {
        // Browser doesn't support setting drawingBufferColorSpace
      }
    }

    // Check for required extensions
    const requiredExtensions = ['EXT_color_buffer_float', 'OES_texture_float_linear'];
    for (const ext of requiredExtensions) {
      if (!gl.getExtension(ext)) {
        console.warn(`Extension ${ext} not available`);
      }
    }

    this.initShaders();
    this.initQuad();
  }

  /**
   * Async initialization (no-op for WebGL2).
   *
   * WebGL2 is fully initialized synchronously in initialize(). This method
   * exists to satisfy the RendererBackend interface so that callers can use
   * a uniform `await backend.initAsync()` pattern across all backends.
   */
  async initAsync(): Promise<void> {
    // No-op: WebGL2 initialization is fully synchronous.
  }

  private initShaders(): void {
    if (!this.gl) return;

    // Simple display shader
    const vertSource = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      uniform vec2 u_offset;
      uniform vec2 u_scale;

      void main() {
        vec2 pos = a_position * u_scale + u_offset;
        gl_Position = vec4(pos, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragSource = `#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 fragColor;
      uniform sampler2D u_texture;

      // Color adjustments
      uniform float u_exposure;      // -5 to +5 stops
      uniform float u_gamma;         // 0.1 to 4.0
      uniform float u_saturation;    // 0 to 2
      uniform float u_contrast;      // 0 to 2
      uniform float u_brightness;    // -1 to +1
      uniform float u_temperature;   // -100 to +100
      uniform float u_tint;          // -100 to +100

      // Hue rotation: luminance-preserving 3x3 matrix
      uniform mat3 u_hueRotationMatrix;
      uniform bool u_hueRotationEnabled;

      // Tone mapping
      uniform int u_toneMappingOperator;  // 0=off, 1=reinhard, 2=filmic, 3=aces

      // Color inversion
      uniform bool u_invert;

      // HDR output mode: 0=SDR (clamp), 1=HDR passthrough
      uniform int u_outputMode;

      // Input transfer function: 0=sRGB/linear, 1=HLG, 2=PQ
      uniform int u_inputTransfer;

      // Luminance coefficients (Rec. 709)
      const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

      // Temperature/tint adjustment (simplified Kelvin shift)
      vec3 applyTemperature(vec3 color, float temp, float tint) {
        // Temperature shifts blue-orange
        // Tint shifts green-magenta
        float t = temp / 100.0;
        float g = tint / 100.0;

        color.r += t * 0.1;
        color.b -= t * 0.1;
        color.g += g * 0.1;
        color.r -= g * 0.05;
        color.b -= g * 0.05;

        return color;
      }

      // Reinhard tone mapping operator
      // Simple global operator that preserves detail in highlights
      // Reference: Reinhard et al., "Photographic Tone Reproduction for Digital Images"
      vec3 tonemapReinhard(vec3 color) {
        return color / (color + vec3(1.0));
      }

      // Filmic tone mapping (Uncharted 2 style)
      // S-curve response similar to film stock
      // Reference: John Hable, "Uncharted 2: HDR Lighting"
      vec3 filmic(vec3 x) {
        float A = 0.15;  // Shoulder strength
        float B = 0.50;  // Linear strength
        float C = 0.10;  // Linear angle
        float D = 0.20;  // Toe strength
        float E = 0.02;  // Toe numerator
        float F = 0.30;  // Toe denominator
        return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
      }

      vec3 tonemapFilmic(vec3 color) {
        float exposureBias = 2.0;
        vec3 curr = filmic(exposureBias * color);
        vec3 whiteScale = vec3(1.0) / filmic(vec3(11.2));  // Linear white point
        // Clamp to non-negative to match CPU implementation (filmic curve can produce slightly negative values)
        return max(curr * whiteScale, vec3(0.0));
      }

      // ACES (Academy Color Encoding System) tone mapping
      // Industry standard for cinema
      // Reference: Academy ACES Output Transform
      vec3 tonemapACES(vec3 color) {
        // ACES fitted curve by Krzysztof Narkowicz
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
      }

      // Apply selected tone mapping operator
      vec3 applyToneMapping(vec3 color, int operator) {
        if (operator == 1) {
          return tonemapReinhard(color);
        } else if (operator == 2) {
          return tonemapFilmic(color);
        } else if (operator == 3) {
          return tonemapACES(color);
        }
        return color;  // operator == 0 (off)
      }

      // --- Input EOTF functions (signal to linear) ---

      // HLG OETF^-1 (Rec. 2100 HLG, signal -> relative scene light)
      // Reference: ITU-R BT.2100-2, Table 5
      float hlgOETFInverse(float e) {
        const float a = 0.17883277;
        const float b = 0.28466892; // 1.0 - 4.0 * a
        const float c = 0.55991073; // 0.5 - a * ln(4.0 * a)
        if (e <= 0.5) {
          return (e * e) / 3.0;
        } else {
          return (exp((e - c) / a) + b) / 12.0;
        }
      }

      vec3 hlgToLinear(vec3 signal) {
        // Apply inverse OETF per channel, then OOTF (gamma 1.2 for 1000 cd/m²)
        vec3 scene = vec3(
          hlgOETFInverse(signal.r),
          hlgOETFInverse(signal.g),
          hlgOETFInverse(signal.b)
        );
        // HLG OOTF: Lw = Ys^(gamma-1) * scene, where gamma ≈ 1.2
        float ys = dot(scene, LUMA);
        float ootfGain = pow(max(ys, 1e-6), 0.2); // gamma - 1 = 0.2
        return scene * ootfGain;
      }

      // PQ EOTF (SMPTE ST 2084, signal -> linear cd/m² normalized to 1.0 = 10000 cd/m²)
      // Reference: SMPTE ST 2084:2014
      float pqEOTF(float n) {
        const float m1 = 0.1593017578125;  // 2610/16384
        const float m2 = 78.84375;          // 2523/32 * 128
        const float c1 = 0.8359375;         // 3424/4096
        const float c2 = 18.8515625;        // 2413/128
        const float c3 = 18.6875;           // 2392/128

        float nm1 = pow(max(n, 0.0), 1.0 / m2);
        float num = max(nm1 - c1, 0.0);
        float den = c2 - c3 * nm1;
        return pow(num / max(den, 1e-6), 1.0 / m1);
      }

      vec3 pqToLinear(vec3 signal) {
        // PQ encodes absolute luminance; 1.0 = 10000 cd/m²
        // Normalize so SDR white (203 cd/m²) → 1.0
        const float pqNormFactor = 10000.0 / 203.0;
        return vec3(
          pqEOTF(signal.r),
          pqEOTF(signal.g),
          pqEOTF(signal.b)
        ) * pqNormFactor;
      }

      void main() {
        vec4 color = texture(u_texture, v_texCoord);

        // 0. Input EOTF: convert from transfer function to linear light
        if (u_inputTransfer == 1) {
          color.rgb = hlgToLinear(color.rgb);
        } else if (u_inputTransfer == 2) {
          color.rgb = pqToLinear(color.rgb);
        }

        // 1. Exposure (in stops, applied in linear space)
        color.rgb *= pow(2.0, u_exposure);

        // 2. Temperature and tint
        color.rgb = applyTemperature(color.rgb, u_temperature, u_tint);

        // 3. Brightness (simple offset)
        color.rgb += u_brightness;

        // 4. Contrast (pivot at 0.5)
        color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

        // 5. Saturation
        float luma = dot(color.rgb, LUMA);
        color.rgb = mix(vec3(luma), color.rgb, u_saturation);

        // 5b. Hue rotation (luminance-preserving matrix)
        if (u_hueRotationEnabled) {
          color.rgb = u_hueRotationMatrix * color.rgb;
        }

        // 6. Tone mapping (applied before gamma for proper HDR handling)
        color.rgb = applyToneMapping(max(color.rgb, 0.0), u_toneMappingOperator);

        // 7. Gamma correction (display transform)
        color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_gamma));

        // 8. Color inversion (after all corrections, before channel isolation)
        if (u_invert) {
          color.rgb = 1.0 - color.rgb;
        }

        // Final output
        if (u_outputMode == 0) {
          // SDR: clamp to [0,1] — identical to current behavior
          color.rgb = clamp(color.rgb, 0.0, 1.0);
        }
        // else: HDR — let values >1.0 pass through to the HDR drawing buffer

        fragColor = color;
      }
    `;

    this.displayShader = new ShaderProgram(this.gl, vertSource, fragSource);
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

    const gl = this.gl;

    // Update texture if needed
    if (image.textureNeedsUpdate || !image.texture) {
      this.updateTexture(image);
    }

    // Use display shader
    this.displayShader.use();
    this.displayShader.setUniform('u_offset', [offsetX, offsetY]);
    this.displayShader.setUniform('u_scale', [scaleX, scaleY]);

    // Set color adjustment uniforms
    this.displayShader.setUniform('u_exposure', this.colorAdjustments.exposure);
    this.displayShader.setUniform('u_gamma', this.colorAdjustments.gamma);
    this.displayShader.setUniform('u_saturation', this.colorAdjustments.saturation);
    this.displayShader.setUniform('u_contrast', this.colorAdjustments.contrast);
    this.displayShader.setUniform('u_brightness', this.colorAdjustments.brightness);
    this.displayShader.setUniform('u_temperature', this.colorAdjustments.temperature);
    this.displayShader.setUniform('u_tint', this.colorAdjustments.tint);

    // Set hue rotation uniforms
    const hueRotationDegrees = this.colorAdjustments.hueRotation;
    if (isIdentityHueRotation(hueRotationDegrees)) {
      this.displayShader.setUniformInt('u_hueRotationEnabled', 0);
    } else {
      this.displayShader.setUniformInt('u_hueRotationEnabled', 1);
      const hueMatrix = getHueRotationMatrix(hueRotationDegrees);
      this.displayShader.setUniformMatrix3('u_hueRotationMatrix', hueMatrix);
    }

    // Set tone mapping uniform
    const toneMappingCode = this.toneMappingState.enabled
      ? TONE_MAPPING_OPERATOR_CODES[this.toneMappingState.operator]
      : 0;
    this.displayShader.setUniformInt('u_toneMappingOperator', toneMappingCode);

    // Set color inversion uniform
    this.displayShader.setUniformInt('u_invert', this.colorInversionEnabled ? 1 : 0);

    // Set HDR output mode uniform
    this.displayShader.setUniformInt('u_outputMode', this.hdrOutputMode === 'sdr' ? 0 : 1);

    // Set input transfer function uniform based on image metadata
    let inputTransferCode = 0; // 0 = sRGB/linear (default)
    if (image.metadata.transferFunction === 'hlg') {
      inputTransferCode = 1;
    } else if (image.metadata.transferFunction === 'pq') {
      inputTransferCode = 2;
    }
    this.displayShader.setUniformInt('u_inputTransfer', inputTransferCode);

    this.displayShader.setUniform('u_texture', 0);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.texture);

    // Draw quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
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
          (gl as unknown as Record<string, string>).unpackColorSpace = 'display-p3';
        } catch {
          // Browser doesn't support unpackColorSpace
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
          (gl as unknown as Record<string, string>).unpackColorSpace = 'srgb';
        } catch { /* ignore */ }

        image.textureNeedsUpdate = false;
        return;
      } catch {
        // VideoFrame texImage2D not supported - fall through to SDR path
        console.warn('VideoFrame texImage2D failed, falling back to typed array upload');
        image.close();

        // Reset unpackColorSpace back to sRGB
        try {
          (gl as unknown as Record<string, string>).unpackColorSpace = 'srgb';
        } catch { /* ignore */ }
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

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.colorAdjustments = { ...adjustments };
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this.colorAdjustments };
  }

  resetColorAdjustments(): void {
    this.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  }

  setColorInversion(enabled: boolean): void {
    this.colorInversionEnabled = enabled;
  }

  getColorInversion(): boolean {
    return this.colorInversionEnabled;
  }

  setToneMappingState(state: ToneMappingState): void {
    this.toneMappingState = { ...state };
  }

  getToneMappingState(): ToneMappingState {
    return { ...this.toneMappingState };
  }

  resetToneMappingState(): void {
    this.toneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  }

  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq', capabilities: DisplayCapabilities): boolean {
    if (!this.gl) return false;

    const previousMode = this.hdrOutputMode;
    try {
      const glExt = this.gl as unknown as Omit<WebGL2RenderingContext, 'drawingBufferColorSpace'> & { drawingBufferColorSpace: string };
      let targetColorSpace: string;
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

      glExt.drawingBufferColorSpace = targetColorSpace;

      // Verify the assignment stuck (browser silently ignores unsupported values)
      if (mode !== 'sdr' && glExt.drawingBufferColorSpace !== targetColorSpace) {
        console.warn(`[Renderer] drawingBufferColorSpace='${targetColorSpace}' not supported (got '${glExt.drawingBufferColorSpace}')`);
        this.hdrOutputMode = previousMode;
        return false;
      }

      this.hdrOutputMode = mode;

      // Attempt to configure HDR metadata when entering HDR mode
      if (mode !== 'sdr') {
        this.tryConfigureHDRMetadata();
      }

      return true;
    } catch {
      // Ensure hdrOutputMode is rolled back to its previous value
      this.hdrOutputMode = previousMode;
      return false;
    }
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' {
    return this.hdrOutputMode;
  }

  private tryConfigureHDRMetadata(): void {
    if (!this.canvas) return;
    if ('configureHighDynamicRange' in this.canvas) {
      try {
        (this.canvas as HTMLCanvasElement & { configureHighDynamicRange: (opts: { mode: string }) => void }).configureHighDynamicRange({ mode: 'default' });
      } catch {
        // Not supported — continue without metadata
      }
    }
  }

  dispose(): void {
    if (!this.gl) return;

    const gl = this.gl;

    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
    if (this.displayShader) this.displayShader.dispose();
    if (this.currentTexture) gl.deleteTexture(this.currentTexture);

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
