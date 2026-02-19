/**
 * WebGL-based 3D LUT Application
 *
 * Uses GPU acceleration for fast LUT processing with trilinear interpolation.
 * Supports float texture precision when available (float32 > float16 > uint8 fallback).
 */

import { LUT3D, createLUTTexture } from './LUTLoader';
import { IDENTITY_MATRIX_4X4, sanitizeLUTMatrix } from './LUTUtils';

/**
 * Convert Float32Array to Uint16Array of IEEE 754 half-float values
 * for uploading as HALF_FLOAT texture data.
 */
function convertToFloat16Array(data: Float32Array): Uint16Array {
  const output = new Uint16Array(data.length);
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  for (let i = 0; i < data.length; i++) {
    const val = data[i]!;
    if (val === 0) { output[i] = 0; continue; }
    if (!isFinite(val)) {
      output[i] = val !== val ? 0x7E00 : (val > 0 ? 0x7C00 : 0xFC00);
      continue;
    }

    view.setFloat32(0, val, true);
    const bits = view.getUint32(0, true);
    const sign = (bits >> 31) & 1;
    const exp = (bits >> 23) & 0xFF;
    const mantissa = bits & 0x7FFFFF;

    if (exp === 0) { output[i] = sign << 15; continue; }

    const newExp = exp - 127 + 15;
    if (newExp >= 0x1F) { output[i] = (sign << 15) | 0x7C00; continue; }
    if (newExp <= 0) {
      if (newExp < -10) { output[i] = sign << 15; continue; }
      output[i] = (sign << 15) | ((mantissa | 0x800000) >> (14 - newExp));
      continue;
    }
    output[i] = (sign << 15) | (newExp << 10) | (mantissa >> 13);
  }

  return output;
}

// Vertex shader - simple fullscreen quad
const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Fragment shader - applies 3D LUT with trilinear interpolation
// Supports optional inMatrix/outMatrix for pre/post LUT color transformation
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_intensity;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;
uniform float u_lutSize;

// Optional pre/post LUT matrices
uniform mat4 u_inMatrix;
uniform mat4 u_outMatrix;
uniform int u_hasInMatrix;
uniform int u_hasOutMatrix;

in vec2 v_texCoord;
out vec4 fragColor;

vec3 applyMatrix(vec3 color, mat4 m) {
  vec4 result = m * vec4(color, 1.0);
  return result.rgb;
}

void main() {
  // Sample the source image
  vec4 color = texture(u_image, v_texCoord);

  // Apply inMatrix before LUT sampling
  vec3 lutInput = color.rgb;
  if (u_hasInMatrix == 1) {
    lutInput = applyMatrix(color.rgb, u_inMatrix);
  }

  // Normalize to LUT domain
  vec3 normalizedColor = (lutInput - u_domainMin) / (u_domainMax - u_domainMin);

  // Clamp to valid range
  normalizedColor = clamp(normalizedColor, 0.0, 1.0);

  // Offset for proper texel center sampling in 3D texture
  // This ensures we sample at the center of each LUT cell
  float offset = 0.5 / u_lutSize;
  float scale = (u_lutSize - 1.0) / u_lutSize;
  vec3 lutCoord = normalizedColor * scale + offset;

  // Sample the 3D LUT with hardware trilinear interpolation
  vec3 lutColor = texture(u_lut, lutCoord).rgb;

  // Apply outMatrix after LUT sampling
  if (u_hasOutMatrix == 1) {
    lutColor = applyMatrix(lutColor, u_outMatrix);
  }

  // Blend between original and LUT-transformed based on intensity
  vec3 finalColor = mix(color.rgb, lutColor, u_intensity);

  fragColor = vec4(finalColor, color.a);
}
`;

/**
 * Float precision capability detection result
 */
export interface FloatPrecisionCapabilities {
  /** Can render to RGBA32F framebuffer */
  float32Renderable: boolean;
  /** Can filter RGBA32F textures with LINEAR */
  float32Filterable: boolean;
  /** Can render to RGBA16F framebuffer */
  float16Renderable: boolean;
  /** Can filter RGBA16F textures with LINEAR (WebGL2 always supports this) */
  float16Filterable: boolean;
  /** Best available precision for LUT processing */
  bestPrecision: 'float32' | 'float16' | 'uint8';
  /** Best available internal format enum value */
  bestInternalFormat: number;
  /** Best available type enum value */
  bestType: number;
}

/**
 * Precision mode for the LUT processor
 */
export type PrecisionMode = 'auto' | 'float32' | 'float16' | 'uint8';

/**
 * Detect float precision capabilities of a WebGL2 context.
 */
export function detectFloatPrecision(gl: WebGL2RenderingContext): FloatPrecisionCapabilities {
  const extCBF = gl.getExtension('EXT_color_buffer_float');
  const extFloatLinear = gl.getExtension('OES_texture_float_linear');

  const float16Filterable = true; // WebGL2 always supports HALF_FLOAT filtering
  const float32Filterable = !!extFloatLinear;

  // Test RGBA32F framebuffer completeness
  let float32Renderable = false;
  if (extCBF) {
    float32Renderable = testFramebufferCompleteness(gl, gl.RGBA32F, gl.FLOAT);
  }

  let float16Renderable = false;
  if (extCBF) {
    float16Renderable = testFramebufferCompleteness(gl, gl.RGBA16F, gl.HALF_FLOAT);
  }

  let bestPrecision: 'float32' | 'float16' | 'uint8';
  let bestInternalFormat: number;
  let bestType: number;

  if (float32Renderable && float32Filterable) {
    bestPrecision = 'float32';
    bestInternalFormat = gl.RGBA32F;
    bestType = gl.FLOAT;
  } else if (float16Renderable && float16Filterable) {
    bestPrecision = 'float16';
    bestInternalFormat = gl.RGBA16F;
    bestType = gl.HALF_FLOAT;
  } else {
    bestPrecision = 'uint8';
    bestInternalFormat = gl.RGBA8;
    bestType = gl.UNSIGNED_BYTE;
  }

  return {
    float32Renderable,
    float32Filterable,
    float16Renderable,
    float16Filterable,
    bestPrecision,
    bestInternalFormat,
    bestType,
  };
}

/**
 * Test if a specific internal format can be used as a framebuffer color attachment.
 */
function testFramebufferCompleteness(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  type: number
): boolean {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 1, 1, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteTexture(tex);
  gl.deleteFramebuffer(fbo);

  return status === gl.FRAMEBUFFER_COMPLETE;
}

export class WebGLLUTProcessor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private imageTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;

  private currentLUT: LUT3D | null = null;
  private isInitialized = false;

  // Float precision state
  private _precisionMode: PrecisionMode = 'auto';
  private _capabilities: FloatPrecisionCapabilities | null = null;
  private _activePrecision: 'float32' | 'float16' | 'uint8' = 'uint8';
  private _activeInternalFormat: number = 0;
  private _activeType: number = 0;

  // Float FBO resources
  private floatFBO: WebGLFramebuffer | null = null;
  private floatOutputTexture: WebGLTexture | null = null;

  // Texture dimension tracking to avoid redundant texParameteri calls
  private imageTextureWidth: number = 0;
  private imageTextureHeight: number = 0;
  private imageTextureFilter: number = 0; // tracks current MIN_FILTER to detect apply vs applyFloat switches

  // Matrix state
  private _inMatrix: Float32Array | null = null;
  private _outMatrix: Float32Array | null = null;

  // Uniform locations
  private uImage: WebGLUniformLocation | null = null;
  private uLut: WebGLUniformLocation | null = null;
  private uIntensity: WebGLUniformLocation | null = null;
  private uDomainMin: WebGLUniformLocation | null = null;
  private uDomainMax: WebGLUniformLocation | null = null;
  private uLutSize: WebGLUniformLocation | null = null;
  private uInMatrix: WebGLUniformLocation | null = null;
  private uOutMatrix: WebGLUniformLocation | null = null;
  private uHasInMatrix: WebGLUniformLocation | null = null;
  private uHasOutMatrix: WebGLUniformLocation | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: false, // Performance: allows optimized backbuffer swaps
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;
    this.detectPrecision();
    this.init();
  }

  /**
   * Detect and resolve float precision capabilities
   */
  private detectPrecision(): void {
    const gl = this.gl;
    this._capabilities = detectFloatPrecision(gl);
    this.resolvePrecision();
  }

  /**
   * Resolve the active precision based on mode and capabilities
   */
  private resolvePrecision(): void {
    const gl = this.gl;
    const caps = this._capabilities;
    if (!caps) {
      this._activePrecision = 'uint8';
      this._activeInternalFormat = gl.RGBA8;
      this._activeType = gl.UNSIGNED_BYTE;
      return;
    }

    if (this._precisionMode === 'auto') {
      this._activePrecision = caps.bestPrecision;
      this._activeInternalFormat = caps.bestInternalFormat;
      this._activeType = caps.bestType;
    } else if (this._precisionMode === 'float32') {
      if (caps.float32Renderable && caps.float32Filterable) {
        this._activePrecision = 'float32';
        this._activeInternalFormat = gl.RGBA32F;
        this._activeType = gl.FLOAT;
      } else {
        this._activePrecision = caps.bestPrecision;
        this._activeInternalFormat = caps.bestInternalFormat;
        this._activeType = caps.bestType;
      }
    } else if (this._precisionMode === 'float16') {
      if (caps.float16Renderable && caps.float16Filterable) {
        this._activePrecision = 'float16';
        this._activeInternalFormat = gl.RGBA16F;
        this._activeType = gl.HALF_FLOAT;
      } else {
        this._activePrecision = 'uint8';
        this._activeInternalFormat = gl.RGBA8;
        this._activeType = gl.UNSIGNED_BYTE;
      }
    } else {
      this._activePrecision = 'uint8';
      this._activeInternalFormat = gl.RGBA8;
      this._activeType = gl.UNSIGNED_BYTE;
    }
  }

  /**
   * Get the current float precision capabilities
   */
  getCapabilities(): FloatPrecisionCapabilities | null {
    return this._capabilities;
  }

  /**
   * Get the active (resolved) precision
   */
  getActivePrecision(): 'float32' | 'float16' | 'uint8' {
    return this._activePrecision;
  }

  /**
   * Set the precision mode
   */
  setPrecisionMode(mode: PrecisionMode): void {
    this._precisionMode = mode;
    this.resolvePrecision();
  }

  /**
   * Get the current precision mode
   */
  getPrecisionMode(): PrecisionMode {
    return this._precisionMode;
  }

  private init(): void {
    const gl = this.gl;

    // Create shader program
    const vertexShader = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      console.error('Failed to create shaders');
      return;
    }

    this.program = gl.createProgram();
    if (!this.program) return;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Shader program link error:', gl.getProgramInfoLog(this.program));
      return;
    }

    // Get attribute locations
    const aPosition = gl.getAttribLocation(this.program, 'a_position');
    const aTexCoord = gl.getAttribLocation(this.program, 'a_texCoord');

    // Get uniform locations
    this.uImage = gl.getUniformLocation(this.program, 'u_image');
    this.uLut = gl.getUniformLocation(this.program, 'u_lut');
    this.uIntensity = gl.getUniformLocation(this.program, 'u_intensity');
    this.uDomainMin = gl.getUniformLocation(this.program, 'u_domainMin');
    this.uDomainMax = gl.getUniformLocation(this.program, 'u_domainMax');
    this.uLutSize = gl.getUniformLocation(this.program, 'u_lutSize');
    this.uInMatrix = gl.getUniformLocation(this.program, 'u_inMatrix');
    this.uOutMatrix = gl.getUniformLocation(this.program, 'u_outMatrix');
    this.uHasInMatrix = gl.getUniformLocation(this.program, 'u_hasInMatrix');
    this.uHasOutMatrix = gl.getUniformLocation(this.program, 'u_hasOutMatrix');

    // Create position buffer (fullscreen quad)
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW);

    // Create texture coordinate buffer
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ]), gl.STATIC_DRAW);

    // Set up VAO-like state (WebGL2)
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

    // Create image texture
    this.imageTexture = gl.createTexture();

    // Create framebuffer for output
    this.framebuffer = gl.createFramebuffer();

    this.isInitialized = true;
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Set the current LUT
   */
  setLUT(lut: LUT3D | null): void {
    const gl = this.gl;

    // Cleanup old LUT texture
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture);
      this.lutTexture = null;
    }

    this.currentLUT = lut;

    if (lut) {
      this.lutTexture = createLUTTexture(gl, lut);
    }
  }

  /**
   * Set the input transformation matrix (applied before LUT sampling).
   * Accepts a row-major flat[16] array. NaN/Infinity entries sanitized to identity.
   * Pass null to clear.
   */
  setInMatrix(matrix: Float32Array | number[] | null): void {
    this._inMatrix = sanitizeLUTMatrix(matrix);
  }

  /**
   * Set the output transformation matrix (applied after LUT sampling).
   * Accepts a row-major flat[16] array. NaN/Infinity entries sanitized to identity.
   * Pass null to clear.
   */
  setOutMatrix(matrix: Float32Array | number[] | null): void {
    this._outMatrix = sanitizeLUTMatrix(matrix);
  }

  /** Get the current input matrix */
  getInMatrix(): Float32Array | null {
    return this._inMatrix;
  }

  /** Get the current output matrix */
  getOutMatrix(): Float32Array | null {
    return this._outMatrix;
  }

  /** Upload matrix uniforms to the GPU */
  private uploadMatrixUniforms(): void {
    const gl = this.gl;
    const hasIn = this._inMatrix !== null;
    const hasOut = this._outMatrix !== null;

    gl.uniform1i(this.uHasInMatrix, hasIn ? 1 : 0);
    gl.uniform1i(this.uHasOutMatrix, hasOut ? 1 : 0);

    // Upload with transpose=true: row-major -> column-major for GLSL
    gl.uniformMatrix4fv(
      this.uInMatrix,
      true,
      hasIn ? this._inMatrix! : IDENTITY_MATRIX_4X4,
    );
    gl.uniformMatrix4fv(
      this.uOutMatrix,
      true,
      hasOut ? this._outMatrix! : IDENTITY_MATRIX_4X4,
    );
  }

  /**
   * Apply the LUT to an ImageData
   */
  apply(imageData: ImageData, intensity: number = 1.0): ImageData {
    if (!this.isInitialized || !this.currentLUT || !this.lutTexture) {
      return imageData;
    }

    const gl = this.gl;
    const { width, height } = imageData;

    // Resize canvas if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);

      // Recreate output texture
      if (this.outputTexture) {
        gl.deleteTexture(this.outputTexture);
      }
      this.outputTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // Upload source image
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    // Only set texture params when dimensions or filter mode change (params are sticky on the texture object)
    if (this.imageTextureWidth !== width || this.imageTextureHeight !== height || this.imageTextureFilter !== gl.LINEAR) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.imageTextureWidth = width;
      this.imageTextureHeight = height;
      this.imageTextureFilter = gl.LINEAR;
    }

    // Bind LUT texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);

    // Use program and set uniforms
    gl.useProgram(this.program);
    gl.uniform1i(this.uImage, 0);
    gl.uniform1i(this.uLut, 1);
    gl.uniform1f(this.uIntensity, intensity);
    gl.uniform3fv(this.uDomainMin, this.currentLUT.domainMin);
    gl.uniform3fv(this.uDomainMax, this.currentLUT.domainMax);
    gl.uniform1f(this.uLutSize, this.currentLUT.size);
    this.uploadMatrixUniforms();

    // Render to canvas (default framebuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back result
    const output = new ImageData(width, height);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, output.data);

    return output;
  }

  /**
   * Apply the LUT to a Float32Array image buffer using float precision.
   * Returns a new Float32Array with the LUT applied. Preserves HDR values.
   *
   * @param data - RGBA interleaved Float32Array
   * @param width - Image width
   * @param height - Image height
   * @param intensity - LUT intensity (0-1)
   * @returns New Float32Array with LUT applied, or original if no LUT loaded
   */
  applyFloat(
    data: Float32Array,
    width: number,
    height: number,
    intensity: number = 1.0
  ): Float32Array {
    if (!this.isInitialized || !this.currentLUT || !this.lutTexture) {
      return data;
    }

    const gl = this.gl;

    // Use float precision if available, otherwise fall back
    const useFloat = this._activePrecision !== 'uint8';

    if (!useFloat) {
      // Fall back to uint8 path via ImageData conversion
      const pixelCount = width * height;
      const imageDataArr = new Uint8ClampedArray(pixelCount * 4);
      for (let i = 0; i < pixelCount * 4; i++) {
        imageDataArr[i] = Math.max(0, Math.min(255, Math.round(data[i]! * 255)));
      }
      const imageData = new ImageData(imageDataArr, width, height);
      const result = this.apply(imageData, intensity);
      const output = new Float32Array(pixelCount * 4);
      for (let i = 0; i < pixelCount * 4; i++) {
        output[i] = result.data[i]! / 255;
      }
      return output;
    }

    // Ensure float FBO is set up
    this.ensureFloatFBO(width, height);

    // Upload source image as float texture using active precision format
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, this._activeInternalFormat,
      width, height, 0,
      gl.RGBA, this._activeType,
      this._activeType === gl.HALF_FLOAT ? convertToFloat16Array(data) : data
    );
    // Only set texture params when dimensions or filter mode change (params are sticky on the texture object)
    if (this.imageTextureWidth !== width || this.imageTextureHeight !== height || this.imageTextureFilter !== gl.NEAREST) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.imageTextureWidth = width;
      this.imageTextureHeight = height;
      this.imageTextureFilter = gl.NEAREST;
    }

    // Bind LUT texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);

    // Use program and set uniforms
    gl.useProgram(this.program);
    gl.uniform1i(this.uImage, 0);
    gl.uniform1i(this.uLut, 1);
    gl.uniform1f(this.uIntensity, intensity);
    gl.uniform3fv(this.uDomainMin, this.currentLUT.domainMin);
    gl.uniform3fv(this.uDomainMax, this.currentLUT.domainMax);
    gl.uniform1f(this.uLutSize, this.currentLUT.size);
    this.uploadMatrixUniforms();

    // Render to float FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.floatFBO);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back float result - always read as FLOAT since we need Float32Array output
    // WebGL2 guarantees gl.FLOAT readback from float FBOs when EXT_color_buffer_float is present
    const output = new Float32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, output);

    // Check for GL errors from readPixels
    const readErr = gl.getError();
    if (readErr !== gl.NO_ERROR) {
      // If float readback failed, try half-float and convert
      console.warn('Float readPixels failed, falling back to uint8 path');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return data;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return output;
  }

  /**
   * Ensure float FBO exists at the correct dimensions.
   */
  private ensureFloatFBO(width: number, height: number): void {
    const gl = this.gl;

    if (this.canvas.width !== width || this.canvas.height !== height || !this.floatFBO) {
      this.canvas.width = width;
      this.canvas.height = height;

      // Recreate float output texture
      if (this.floatOutputTexture) gl.deleteTexture(this.floatOutputTexture);
      this.floatOutputTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.floatOutputTexture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, this._activeInternalFormat,
        width, height, 0,
        gl.RGBA, this._activeType, null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Attach to FBO
      if (!this.floatFBO) {
        this.floatFBO = gl.createFramebuffer();
        if (!this.floatFBO) {
          console.error('Failed to create float framebuffer');
          return;
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.floatFBO);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, this.floatOutputTexture, 0
      );

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Float FBO incomplete, status:', status);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  /**
   * Apply LUT directly to a canvas context
   */
  applyToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number = 1.0): void {
    if (!this.isInitialized || !this.currentLUT || !this.lutTexture) {
      return;
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const result = this.apply(imageData, intensity);
    ctx.putImageData(result, 0, 0);
  }

  /**
   * Check if processor has a LUT loaded
   */
  hasLUT(): boolean {
    return this.currentLUT !== null && this.lutTexture !== null;
  }

  /**
   * Get current LUT
   */
  getLUT(): LUT3D | null {
    return this.currentLUT;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    const gl = this.gl;

    if (this.program) gl.deleteProgram(this.program);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.lutTexture) gl.deleteTexture(this.lutTexture);
    if (this.outputTexture) gl.deleteTexture(this.outputTexture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.floatOutputTexture) gl.deleteTexture(this.floatOutputTexture);
    if (this.floatFBO) gl.deleteFramebuffer(this.floatFBO);

    this.isInitialized = false;
  }
}

/**
 * Singleton instance for shared use
 */
let sharedProcessor: WebGLLUTProcessor | null = null;

export function getSharedLUTProcessor(): WebGLLUTProcessor {
  if (!sharedProcessor) {
    sharedProcessor = new WebGLLUTProcessor();
  }
  return sharedProcessor;
}

export function disposeSharedLUTProcessor(): void {
  if (sharedProcessor) {
    sharedProcessor.dispose();
    sharedProcessor = null;
  }
}
