import { IPImage, DataType } from '../core/image/Image';
import { ShaderProgram } from './ShaderProgram';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { ToneMappingState, ToneMappingOperator, DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';

/**
 * Tone mapping operator integer codes for shader uniform
 */
export const TONE_MAPPING_OPERATOR_CODES: Record<ToneMappingOperator, number> = {
  'off': 0,
  'reinhard': 1,
  'filmic': 2,
  'aces': 3,
};

export class Renderer {
  // Color adjustments state
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;

  // Tone mapping state
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };

  // Shaders
  private displayShader: ShaderProgram | null = null;

  // Quad geometry
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  // Current texture
  private currentTexture: WebGLTexture | null = null;

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    const gl = canvas.getContext('webgl2', {
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

      // Tone mapping
      uniform int u_toneMappingOperator;  // 0=off, 1=reinhard, 2=filmic, 3=aces

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

      void main() {
        vec4 color = texture(u_texture, v_texCoord);

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

        // 6. Tone mapping (applied before gamma for proper HDR handling)
        color.rgb = applyToneMapping(max(color.rgb, 0.0), u_toneMappingOperator);

        // 7. Gamma correction (display transform)
        color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_gamma));

        // Clamp final output
        color.rgb = clamp(color.rgb, 0.0, 1.0);

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

    // Set tone mapping uniform
    const toneMappingCode = this.toneMappingState.enabled
      ? TONE_MAPPING_OPERATOR_CODES[this.toneMappingState.operator]
      : 0;
    this.displayShader.setUniformInt('u_toneMappingOperator', toneMappingCode);

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

    // Determine format based on image properties
    const { internalFormat, format, type } = this.getTextureFormat(image.dataType, image.channels);

    // Upload data
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

  createTexture(): WebGLTexture | null {
    return this.gl?.createTexture() ?? null;
  }

  deleteTexture(texture: WebGLTexture): void {
    this.gl?.deleteTexture(texture);
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

  setToneMappingState(state: ToneMappingState): void {
    this.toneMappingState = { ...state };
  }

  getToneMappingState(): ToneMappingState {
    return { ...this.toneMappingState };
  }

  resetToneMappingState(): void {
    this.toneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
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
