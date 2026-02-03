/**
 * GPULUTChain - WebGL multi-LUT renderer for File/Look/Display stages
 *
 * Uses a single-pass fragment shader that samples from up to three 3D LUT textures
 * sequentially. Each stage can be independently enabled/disabled with its own intensity.
 */

import type { LUT3D } from '../LUTLoader';
import { createLUTTexture } from '../LUTLoader';

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

// Fragment shader - applies up to 3 LUT stages with independent enable/intensity
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_image;

uniform sampler3D u_fileLUT;
uniform sampler3D u_lookLUT;
uniform sampler3D u_displayLUT;

uniform float u_fileLUTIntensity;
uniform float u_lookLUTIntensity;
uniform float u_displayLUTIntensity;

uniform int u_fileLUTEnabled;
uniform int u_lookLUTEnabled;
uniform int u_displayLUTEnabled;

uniform vec3 u_fileLUTDomainMin;
uniform vec3 u_fileLUTDomainMax;
uniform float u_fileLUTSize;

uniform vec3 u_lookLUTDomainMin;
uniform vec3 u_lookLUTDomainMax;
uniform float u_lookLUTSize;

uniform vec3 u_displayLUTDomainMin;
uniform vec3 u_displayLUTDomainMax;
uniform float u_displayLUTSize;

in vec2 v_texCoord;
out vec4 fragColor;

vec3 applyLUT(sampler3D lut, vec3 color, vec3 domainMin, vec3 domainMax, float lutSize, float intensity) {
  vec3 normalized = (color - domainMin) / (domainMax - domainMin);
  normalized = clamp(normalized, 0.0, 1.0);
  float offset = 0.5 / lutSize;
  float scale = (lutSize - 1.0) / lutSize;
  vec3 lutCoord = normalized * scale + offset;
  vec3 lutColor = texture(lut, lutCoord).rgb;
  return mix(color, lutColor, intensity);
}

void main() {
  vec4 color = texture(u_image, v_texCoord);
  vec3 rgb = color.rgb;

  // Stage 1: File LUT (input transform)
  if (u_fileLUTEnabled == 1) {
    rgb = applyLUT(u_fileLUT, rgb, u_fileLUTDomainMin, u_fileLUTDomainMax, u_fileLUTSize, u_fileLUTIntensity);
  }

  // Stage 2: Look LUT (creative grade)
  if (u_lookLUTEnabled == 1) {
    rgb = applyLUT(u_lookLUT, rgb, u_lookLUTDomainMin, u_lookLUTDomainMax, u_lookLUTSize, u_lookLUTIntensity);
  }

  // Stage 3: Display LUT (display calibration)
  if (u_displayLUTEnabled == 1) {
    rgb = applyLUT(u_displayLUT, rgb, u_displayLUTDomainMin, u_displayLUTDomainMax, u_displayLUTSize, u_displayLUTIntensity);
  }

  fragColor = vec4(rgb, color.a);
}
`;

interface StageState {
  lut: LUT3D | null;
  texture: WebGLTexture | null;
  enabled: boolean;
  intensity: number;
}

export class GPULUTChain {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private imageTexture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;

  private fileStage: StageState = { lut: null, texture: null, enabled: true, intensity: 1.0 };
  private lookStage: StageState = { lut: null, texture: null, enabled: true, intensity: 1.0 };
  private displayStage: StageState = { lut: null, texture: null, enabled: true, intensity: 1.0 };

  // Uniform locations
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  private isInitialized = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  private init(): void {
    const gl = this.gl;

    // Create shader program
    const vertexShader = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      console.error('GPULUTChain: Failed to create shaders');
      return;
    }

    this.program = gl.createProgram();
    if (!this.program) return;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('GPULUTChain: Shader link error:', gl.getProgramInfoLog(this.program));
      return;
    }

    // Get attribute locations
    const aPosition = gl.getAttribLocation(this.program, 'a_position');
    const aTexCoord = gl.getAttribLocation(this.program, 'a_texCoord');

    // Get uniform locations
    const uniformNames = [
      'u_image',
      'u_fileLUT', 'u_lookLUT', 'u_displayLUT',
      'u_fileLUTIntensity', 'u_lookLUTIntensity', 'u_displayLUTIntensity',
      'u_fileLUTEnabled', 'u_lookLUTEnabled', 'u_displayLUTEnabled',
      'u_fileLUTDomainMin', 'u_fileLUTDomainMax', 'u_fileLUTSize',
      'u_lookLUTDomainMin', 'u_lookLUTDomainMax', 'u_lookLUTSize',
      'u_displayLUTDomainMin', 'u_displayLUTDomainMax', 'u_displayLUTSize',
    ];
    for (const name of uniformNames) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }

    // Create position buffer (fullscreen quad)
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1,
    ]), gl.STATIC_DRAW);

    // Create texture coordinate buffer
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 1, 0, 0, 1, 1, 1,
    ]), gl.STATIC_DRAW);

    // Set up vertex attributes
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
      console.error('GPULUTChain: Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private setStageTexture(stage: StageState, lut: LUT3D | null): void {
    const gl = this.gl;

    // Delete old texture
    if (stage.texture) {
      gl.deleteTexture(stage.texture);
      stage.texture = null;
    }

    stage.lut = lut;

    if (lut) {
      stage.texture = createLUTTexture(gl, lut);
    }
  }

  // --- File LUT ---
  hasFileLUT(): boolean { return this.fileStage.lut !== null; }
  setFileLUT(lut: LUT3D | null): void { this.setStageTexture(this.fileStage, lut); }
  clearFileLUT(): void { this.setStageTexture(this.fileStage, null); }
  setFileLUTIntensity(intensity: number): void { this.fileStage.intensity = Math.max(0, Math.min(1, intensity)); }
  setFileLUTEnabled(enabled: boolean): void { this.fileStage.enabled = enabled; }

  // --- Look LUT ---
  hasLookLUT(): boolean { return this.lookStage.lut !== null; }
  setLookLUT(lut: LUT3D | null): void { this.setStageTexture(this.lookStage, lut); }
  clearLookLUT(): void { this.setStageTexture(this.lookStage, null); }
  setLookLUTIntensity(intensity: number): void { this.lookStage.intensity = Math.max(0, Math.min(1, intensity)); }
  setLookLUTEnabled(enabled: boolean): void { this.lookStage.enabled = enabled; }

  // --- Display LUT ---
  hasDisplayLUT(): boolean { return this.displayStage.lut !== null; }
  setDisplayLUT(lut: LUT3D | null): void { this.setStageTexture(this.displayStage, lut); }
  clearDisplayLUT(): void { this.setStageTexture(this.displayStage, null); }
  setDisplayLUTIntensity(intensity: number): void { this.displayStage.intensity = Math.max(0, Math.min(1, intensity)); }
  setDisplayLUTEnabled(enabled: boolean): void { this.displayStage.enabled = enabled; }

  /** Get the number of active (has LUT + enabled) stages */
  getActiveStageCount(): number {
    let count = 0;
    if (this.fileStage.lut && this.fileStage.enabled) count++;
    if (this.lookStage.lut && this.lookStage.enabled) count++;
    if (this.displayStage.lut && this.displayStage.enabled) count++;
    return count;
  }

  /** Check if any stage has a LUT loaded */
  hasAnyLUT(): boolean {
    return this.fileStage.lut !== null || this.lookStage.lut !== null || this.displayStage.lut !== null;
  }

  /**
   * Render the multi-LUT chain. Called during the rendering pipeline.
   */
  render(width: number, height: number): void {
    if (!this.isInitialized || !this.program) return;

    const gl = this.gl;

    gl.useProgram(this.program);

    // Set up image texture on unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(this.uniforms['u_image']!, 0);

    // File LUT on unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.fileStage.texture ?? null);
    gl.uniform1i(this.uniforms['u_fileLUT']!, 1);
    gl.uniform1i(this.uniforms['u_fileLUTEnabled']!, (this.fileStage.lut && this.fileStage.enabled) ? 1 : 0);
    gl.uniform1f(this.uniforms['u_fileLUTIntensity']!, this.fileStage.intensity);
    if (this.fileStage.lut) {
      gl.uniform3fv(this.uniforms['u_fileLUTDomainMin']!, this.fileStage.lut.domainMin);
      gl.uniform3fv(this.uniforms['u_fileLUTDomainMax']!, this.fileStage.lut.domainMax);
      gl.uniform1f(this.uniforms['u_fileLUTSize']!, this.fileStage.lut.size);
    }

    // Look LUT on unit 2
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.lookStage.texture ?? null);
    gl.uniform1i(this.uniforms['u_lookLUT']!, 2);
    gl.uniform1i(this.uniforms['u_lookLUTEnabled']!, (this.lookStage.lut && this.lookStage.enabled) ? 1 : 0);
    gl.uniform1f(this.uniforms['u_lookLUTIntensity']!, this.lookStage.intensity);
    if (this.lookStage.lut) {
      gl.uniform3fv(this.uniforms['u_lookLUTDomainMin']!, this.lookStage.lut.domainMin);
      gl.uniform3fv(this.uniforms['u_lookLUTDomainMax']!, this.lookStage.lut.domainMax);
      gl.uniform1f(this.uniforms['u_lookLUTSize']!, this.lookStage.lut.size);
    }

    // Display LUT on unit 3
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, this.displayStage.texture ?? null);
    gl.uniform1i(this.uniforms['u_displayLUT']!, 3);
    gl.uniform1i(this.uniforms['u_displayLUTEnabled']!, (this.displayStage.lut && this.displayStage.enabled) ? 1 : 0);
    gl.uniform1f(this.uniforms['u_displayLUTIntensity']!, this.displayStage.intensity);
    if (this.displayStage.lut) {
      gl.uniform3fv(this.uniforms['u_displayLUTDomainMin']!, this.displayStage.lut.domainMin);
      gl.uniform3fv(this.uniforms['u_displayLUTDomainMax']!, this.displayStage.lut.domainMax);
      gl.uniform1f(this.uniforms['u_displayLUTSize']!, this.displayStage.lut.size);
    }

    // Render
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Apply the multi-LUT chain to a canvas context.
   * Reads pixels, processes through GPU, writes back.
   */
  applyToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.isInitialized || !this.hasAnyLUT()) return;

    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;

    // Resize offscreen canvas if needed
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;

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
    const imageData = ctx.getImageData(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Render to default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.render(width, height);

    // Read back result
    const output = new ImageData(width, height);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, output.data);
    ctx.putImageData(output, 0, 0);
  }

  /** Clean up all GPU resources */
  dispose(): void {
    const gl = this.gl;

    if (this.fileStage.texture) gl.deleteTexture(this.fileStage.texture);
    if (this.lookStage.texture) gl.deleteTexture(this.lookStage.texture);
    if (this.displayStage.texture) gl.deleteTexture(this.displayStage.texture);
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.outputTexture) gl.deleteTexture(this.outputTexture);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.program) gl.deleteProgram(this.program);

    this.fileStage = { lut: null, texture: null, enabled: true, intensity: 1.0 };
    this.lookStage = { lut: null, texture: null, enabled: true, intensity: 1.0 };
    this.displayStage = { lut: null, texture: null, enabled: true, intensity: 1.0 };

    this.isInitialized = false;
  }
}
