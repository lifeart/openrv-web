/**
 * WebGL-based 3D LUT Application
 *
 * Uses GPU acceleration for fast LUT processing with trilinear interpolation.
 */

import { LUT3D, createLUTTexture } from './LUTLoader';

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
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_intensity;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;
uniform float u_lutSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  // Sample the source image
  vec4 color = texture(u_image, v_texCoord);

  // Normalize to LUT domain
  vec3 normalizedColor = (color.rgb - u_domainMin) / (u_domainMax - u_domainMin);

  // Clamp to valid range
  normalizedColor = clamp(normalizedColor, 0.0, 1.0);

  // Offset for proper texel center sampling in 3D texture
  // This ensures we sample at the center of each LUT cell
  float offset = 0.5 / u_lutSize;
  float scale = (u_lutSize - 1.0) / u_lutSize;
  vec3 lutCoord = normalizedColor * scale + offset;

  // Sample the 3D LUT with hardware trilinear interpolation
  vec3 lutColor = texture(u_lut, lutCoord).rgb;

  // Blend between original and LUT-transformed based on intensity
  vec3 finalColor = mix(color.rgb, lutColor, u_intensity);

  fragColor = vec4(finalColor, color.a);
}
`;

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

  // Uniform locations
  private uImage: WebGLUniformLocation | null = null;
  private uLut: WebGLUniformLocation | null = null;
  private uIntensity: WebGLUniformLocation | null = null;
  private uDomainMin: WebGLUniformLocation | null = null;
  private uDomainMax: WebGLUniformLocation | null = null;
  private uLutSize: WebGLUniformLocation | null = null;

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
    this.init();
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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
