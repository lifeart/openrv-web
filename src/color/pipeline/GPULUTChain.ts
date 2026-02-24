/**
 * GPULUTChain - WebGL multi-LUT renderer for File/Look/Display stages
 *
 * Uses a single-pass fragment shader that samples from up to three 3D LUT textures
 * sequentially. Each stage can be independently enabled/disabled with its own intensity.
 * Supports optional inMatrix/outMatrix per stage for pre/post LUT color transformation.
 */

import type { LUT3D } from '../LUTLoader';
import { createLUTTexture } from '../LUTLoader';
import { IDENTITY_MATRIX_4X4, sanitizeLUTMatrix } from '../LUTUtils';
import { ShaderProgram } from '../../render/ShaderProgram';

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
// and optional inMatrix/outMatrix per stage
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

// Per-stage inMatrix/outMatrix (column-major, uploaded with transpose=true)
uniform mat4 u_fileLUTInMatrix;
uniform mat4 u_fileLUTOutMatrix;
uniform int u_fileLUTHasInMatrix;
uniform int u_fileLUTHasOutMatrix;

uniform mat4 u_lookLUTInMatrix;
uniform mat4 u_lookLUTOutMatrix;
uniform int u_lookLUTHasInMatrix;
uniform int u_lookLUTHasOutMatrix;

uniform mat4 u_displayLUTInMatrix;
uniform mat4 u_displayLUTOutMatrix;
uniform int u_displayLUTHasInMatrix;
uniform int u_displayLUTHasOutMatrix;

in vec2 v_texCoord;
out vec4 fragColor;

vec3 applyMatrix(vec3 color, mat4 m) {
  // Row vector * matrix: [r, g, b, 1] * M
  // In GLSL with column-major mat4 (transposed row-major), this is: m * vec4(color, 1.0)
  // But since we upload row-major with transpose=true, GLSL stores it as column-major.
  // So: result = m * vec4(color, 1.0)  gives us the row-vector * row-major-matrix product.
  vec4 result = m * vec4(color, 1.0);
  return result.rgb;
}

vec3 applyLUT(sampler3D lut, vec3 color, vec3 domainMin, vec3 domainMax, float lutSize, float intensity,
              mat4 inMat, int hasInMat, mat4 outMat, int hasOutMat) {
  // Apply inMatrix before LUT sampling
  vec3 lutInput = color;
  if (hasInMat == 1) {
    lutInput = applyMatrix(color, inMat);
  }

  vec3 normalized = (lutInput - domainMin) / (domainMax - domainMin);
  normalized = clamp(normalized, 0.0, 1.0);
  float offset = 0.5 / lutSize;
  float scale = (lutSize - 1.0) / lutSize;
  vec3 lutCoord = normalized * scale + offset;
  vec3 lutColor = texture(lut, lutCoord).rgb;

  // Apply outMatrix after LUT sampling
  if (hasOutMat == 1) {
    lutColor = applyMatrix(lutColor, outMat);
  }

  return mix(color, lutColor, intensity);
}

void main() {
  vec4 color = texture(u_image, v_texCoord);
  vec3 rgb = color.rgb;

  // Stage 1: File LUT (input transform)
  if (u_fileLUTEnabled == 1) {
    rgb = applyLUT(u_fileLUT, rgb, u_fileLUTDomainMin, u_fileLUTDomainMax, u_fileLUTSize, u_fileLUTIntensity,
                   u_fileLUTInMatrix, u_fileLUTHasInMatrix, u_fileLUTOutMatrix, u_fileLUTHasOutMatrix);
  }

  // Stage 2: Look LUT (creative grade)
  if (u_lookLUTEnabled == 1) {
    rgb = applyLUT(u_lookLUT, rgb, u_lookLUTDomainMin, u_lookLUTDomainMax, u_lookLUTSize, u_lookLUTIntensity,
                   u_lookLUTInMatrix, u_lookLUTHasInMatrix, u_lookLUTOutMatrix, u_lookLUTHasOutMatrix);
  }

  // Stage 3: Display LUT (display calibration)
  if (u_displayLUTEnabled == 1) {
    rgb = applyLUT(u_displayLUT, rgb, u_displayLUTDomainMin, u_displayLUTDomainMax, u_displayLUTSize, u_displayLUTIntensity,
                   u_displayLUTInMatrix, u_displayLUTHasInMatrix, u_displayLUTOutMatrix, u_displayLUTHasOutMatrix);
  }

  fragColor = vec4(rgb, color.a);
}
`;

interface StageState {
  lut: LUT3D | null;
  texture: WebGLTexture | null;
  enabled: boolean;
  intensity: number;
  /** Row-major flat[16] input matrix, or null for identity */
  inMatrix: Float32Array | null;
  /** Row-major flat[16] output matrix, or null for identity */
  outMatrix: Float32Array | null;
}

function createDefaultStageState(): StageState {
  return { lut: null, texture: null, enabled: true, intensity: 1.0, inMatrix: null, outMatrix: null };
}

export class GPULUTChain {
  private gl: WebGL2RenderingContext;
  private shaderProgram: ShaderProgram | null = null;
  private parallelCompileExt: object | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private imageTexture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;

  private fileStage: StageState = createDefaultStageState();
  private lookStage: StageState = createDefaultStageState();
  private displayStage: StageState = createDefaultStageState();

  // Uniform locations (lazily resolved after shader is ready)
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private uniformsResolved = false;

  private isInitialized = false;
  private attributesSetUp = false;

  constructor(gl: WebGL2RenderingContext, parallelCompileExt?: object | null) {
    this.gl = gl;
    this.parallelCompileExt = parallelCompileExt ?? null;
    this.init();
  }

  private init(): void {
    const gl = this.gl;

    // Create shader program using ShaderProgram
    try {
      this.shaderProgram = new ShaderProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, this.parallelCompileExt);
    } catch (e) {
      console.error('GPULUTChain: Failed to create shader program:', e);
      return;
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

    // Create image texture
    this.imageTexture = gl.createTexture();

    // Create framebuffer for output
    this.framebuffer = gl.createFramebuffer();

    this.isInitialized = true;
  }

  /** Deferred attribute setup - must only be called after isReady() returns true. */
  private setUpAttributesIfNeeded(): void {
    if (this.attributesSetUp || !this.shaderProgram) return;
    const gl = this.gl;

    const aPosition = this.shaderProgram.getAttributeLocation('a_position');
    const aTexCoord = this.shaderProgram.getAttributeLocation('a_texCoord');

    this.shaderProgram.use();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

    this.attributesSetUp = true;
  }

  /** Whether the shader program is fully compiled, linked, and ready for use. */
  isReady(): boolean {
    return this.shaderProgram?.isReady() ?? false;
  }

  /**
   * Lazily resolve all uniform locations once the shader program is ready.
   * Must be called before accessing this.uniforms in render paths.
   */
  private resolveUniformsIfNeeded(): void {
    if (this.uniformsResolved || !this.shaderProgram) return;

    const uniformNames = [
      'u_image',
      'u_fileLUT', 'u_lookLUT', 'u_displayLUT',
      'u_fileLUTIntensity', 'u_lookLUTIntensity', 'u_displayLUTIntensity',
      'u_fileLUTEnabled', 'u_lookLUTEnabled', 'u_displayLUTEnabled',
      'u_fileLUTDomainMin', 'u_fileLUTDomainMax', 'u_fileLUTSize',
      'u_lookLUTDomainMin', 'u_lookLUTDomainMax', 'u_lookLUTSize',
      'u_displayLUTDomainMin', 'u_displayLUTDomainMax', 'u_displayLUTSize',
      // Matrix uniforms
      'u_fileLUTInMatrix', 'u_fileLUTOutMatrix',
      'u_fileLUTHasInMatrix', 'u_fileLUTHasOutMatrix',
      'u_lookLUTInMatrix', 'u_lookLUTOutMatrix',
      'u_lookLUTHasInMatrix', 'u_lookLUTHasOutMatrix',
      'u_displayLUTInMatrix', 'u_displayLUTOutMatrix',
      'u_displayLUTHasInMatrix', 'u_displayLUTHasOutMatrix',
    ];
    for (const name of uniformNames) {
      this.uniforms[name] = this.shaderProgram.getUniformLocation(name);
    }

    this.uniformsResolved = true;
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
  setFileLUTInMatrix(matrix: Float32Array | number[] | null): void { this.fileStage.inMatrix = sanitizeLUTMatrix(matrix); }
  setFileLUTOutMatrix(matrix: Float32Array | number[] | null): void { this.fileStage.outMatrix = sanitizeLUTMatrix(matrix); }

  // --- Look LUT ---
  hasLookLUT(): boolean { return this.lookStage.lut !== null; }
  setLookLUT(lut: LUT3D | null): void { this.setStageTexture(this.lookStage, lut); }
  clearLookLUT(): void { this.setStageTexture(this.lookStage, null); }
  setLookLUTIntensity(intensity: number): void { this.lookStage.intensity = Math.max(0, Math.min(1, intensity)); }
  setLookLUTEnabled(enabled: boolean): void { this.lookStage.enabled = enabled; }
  setLookLUTInMatrix(matrix: Float32Array | number[] | null): void { this.lookStage.inMatrix = sanitizeLUTMatrix(matrix); }
  setLookLUTOutMatrix(matrix: Float32Array | number[] | null): void { this.lookStage.outMatrix = sanitizeLUTMatrix(matrix); }

  // --- Display LUT ---
  hasDisplayLUT(): boolean { return this.displayStage.lut !== null; }
  setDisplayLUT(lut: LUT3D | null): void { this.setStageTexture(this.displayStage, lut); }
  clearDisplayLUT(): void { this.setStageTexture(this.displayStage, null); }
  setDisplayLUTIntensity(intensity: number): void { this.displayStage.intensity = Math.max(0, Math.min(1, intensity)); }
  setDisplayLUTEnabled(enabled: boolean): void { this.displayStage.enabled = enabled; }
  setDisplayLUTInMatrix(matrix: Float32Array | number[] | null): void { this.displayStage.inMatrix = sanitizeLUTMatrix(matrix); }
  setDisplayLUTOutMatrix(matrix: Float32Array | number[] | null): void { this.displayStage.outMatrix = sanitizeLUTMatrix(matrix); }

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
   * Upload a stage's matrix uniforms.
   * Row-major matrices are uploaded with transpose=true so GLSL sees them correctly.
   */
  private uploadStageMatrixUniforms(
    stage: StageState,
    inMatrixUniform: string,
    outMatrixUniform: string,
    hasInMatrixUniform: string,
    hasOutMatrixUniform: string,
  ): void {
    const gl = this.gl;

    const hasIn = stage.inMatrix !== null;
    const hasOut = stage.outMatrix !== null;

    gl.uniform1i(this.uniforms[hasInMatrixUniform] ?? null, hasIn ? 1 : 0);
    gl.uniform1i(this.uniforms[hasOutMatrixUniform] ?? null, hasOut ? 1 : 0);

    // Upload inMatrix (transpose=true to convert row-major to column-major for GLSL)
    // Using gl.uniformMatrix4fv directly because ShaderProgram.setUniformMatrix4 hardcodes transpose=false
    gl.uniformMatrix4fv(
      this.uniforms[inMatrixUniform] ?? null,
      true, // transpose: row-major -> column-major
      hasIn ? stage.inMatrix! : IDENTITY_MATRIX_4X4,
    );

    // Upload outMatrix
    gl.uniformMatrix4fv(
      this.uniforms[outMatrixUniform] ?? null,
      true,
      hasOut ? stage.outMatrix! : IDENTITY_MATRIX_4X4,
    );
  }

  /**
   * Render the multi-LUT chain. Called during the rendering pipeline.
   */
  render(width: number, height: number): void {
    if (!this.isInitialized || !this.isReady()) return;

    const gl = this.gl;

    this.setUpAttributesIfNeeded();
    this.resolveUniformsIfNeeded();
    this.shaderProgram!.use();

    // Set up image texture on unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(this.uniforms['u_image'] ?? null, 0);

    // File LUT on unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.fileStage.texture ?? null);
    gl.uniform1i(this.uniforms['u_fileLUT'] ?? null, 1);
    gl.uniform1i(this.uniforms['u_fileLUTEnabled'] ?? null, (this.fileStage.lut && this.fileStage.enabled) ? 1 : 0);
    gl.uniform1f(this.uniforms['u_fileLUTIntensity'] ?? null, this.fileStage.intensity);
    if (this.fileStage.lut) {
      gl.uniform3fv(this.uniforms['u_fileLUTDomainMin'] ?? null, this.fileStage.lut.domainMin);
      gl.uniform3fv(this.uniforms['u_fileLUTDomainMax'] ?? null, this.fileStage.lut.domainMax);
      gl.uniform1f(this.uniforms['u_fileLUTSize'] ?? null, this.fileStage.lut.size);
    }
    this.uploadStageMatrixUniforms(
      this.fileStage,
      'u_fileLUTInMatrix', 'u_fileLUTOutMatrix',
      'u_fileLUTHasInMatrix', 'u_fileLUTHasOutMatrix',
    );

    // Look LUT on unit 2
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.lookStage.texture ?? null);
    gl.uniform1i(this.uniforms['u_lookLUT'] ?? null, 2);
    gl.uniform1i(this.uniforms['u_lookLUTEnabled'] ?? null, (this.lookStage.lut && this.lookStage.enabled) ? 1 : 0);
    gl.uniform1f(this.uniforms['u_lookLUTIntensity'] ?? null, this.lookStage.intensity);
    if (this.lookStage.lut) {
      gl.uniform3fv(this.uniforms['u_lookLUTDomainMin'] ?? null, this.lookStage.lut.domainMin);
      gl.uniform3fv(this.uniforms['u_lookLUTDomainMax'] ?? null, this.lookStage.lut.domainMax);
      gl.uniform1f(this.uniforms['u_lookLUTSize'] ?? null, this.lookStage.lut.size);
    }
    this.uploadStageMatrixUniforms(
      this.lookStage,
      'u_lookLUTInMatrix', 'u_lookLUTOutMatrix',
      'u_lookLUTHasInMatrix', 'u_lookLUTHasOutMatrix',
    );

    // Display LUT on unit 3
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, this.displayStage.texture ?? null);
    gl.uniform1i(this.uniforms['u_displayLUT'] ?? null, 3);
    gl.uniform1i(this.uniforms['u_displayLUTEnabled'] ?? null, (this.displayStage.lut && this.displayStage.enabled) ? 1 : 0);
    gl.uniform1f(this.uniforms['u_displayLUTIntensity'] ?? null, this.displayStage.intensity);
    if (this.displayStage.lut) {
      gl.uniform3fv(this.uniforms['u_displayLUTDomainMin'] ?? null, this.displayStage.lut.domainMin);
      gl.uniform3fv(this.uniforms['u_displayLUTDomainMax'] ?? null, this.displayStage.lut.domainMax);
      gl.uniform1f(this.uniforms['u_displayLUTSize'] ?? null, this.displayStage.lut.size);
    }
    this.uploadStageMatrixUniforms(
      this.displayStage,
      'u_displayLUTInMatrix', 'u_displayLUTOutMatrix',
      'u_displayLUTHasInMatrix', 'u_displayLUTHasOutMatrix',
    );

    // Render
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Apply the multi-LUT chain to a canvas context.
   * Reads pixels, processes through GPU, writes back.
   */
  applyToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.isInitialized || !this.isReady() || !this.hasAnyLUT()) return;

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
    if (this.shaderProgram) {
      this.shaderProgram.dispose();
      this.shaderProgram = null;
    }

    this.fileStage = createDefaultStageState();
    this.lookStage = createDefaultStageState();
    this.displayStage = createDefaultStageState();

    this.uniforms = {};
    this.uniformsResolved = false;
    this.attributesSetUp = false;
    this.isInitialized = false;
  }
}
