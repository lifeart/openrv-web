/**
 * LuminanceAnalyzer - GPU luminance computation via mipmap chain.
 *
 * WebGL2 has no compute shaders. This uses the mipmap trick:
 * 1. Render log-luminance to a 256x256 RGBA16F FBO
 * 2. Generate mipmaps (GPU averages log-luminance down to 1x1)
 * 3. Attach the 1x1 mip level to a readback FBO
 * 4. Read the 1x1 pixel (async via PBO for no GPU stall)
 *
 * Returns exp(avgLogLuminance) for scene geometric-mean and linear-average luminance.
 * One-frame latency from PBO is imperceptible with auto-exposure smoothing.
 */

import { ShaderProgram } from './ShaderProgram';
import luminanceFragSource from './shaders/luminance.frag.glsl?raw';

const LUMINANCE_FBO_SIZE = 256;

/** Simple vertex shader for full-screen quad. */
const LUMINANCE_VERT = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }`;

export interface LuminanceStats {
  /** Geometric mean of scene luminance (exp of average log-luminance). */
  avg: number;
  /** Linear average of raw luminance (mipmap-averaged, NOT scene maximum). */
  linearAvg: number;
}

export class LuminanceAnalyzer {
  private gl: WebGL2RenderingContext;
  private shader: ShaderProgram | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private fboTexture: WebGLTexture | null = null;
  private readbackFBO: WebGLFramebuffer | null = null;
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  // Double-buffered PBO for async readback
  private pbos: [WebGLBuffer | null, WebGLBuffer | null] = [null, null];
  private pboIndex = 0;
  private pboFences: [WebGLSync | null, WebGLSync | null] = [null, null];
  private cachedResult: LuminanceStats = { avg: 0.18, linearAvg: 1.0 };
  private initialized = false;
  private firstFrame = true;
  private nanWarned = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Compute geometric-mean and linear-average luminance for a source texture.
   *
   * Uses mipmap chain for GPU reduction and double-buffered PBO
   * for async readback. Returns PREVIOUS frame's result (1-frame latency).
   *
   * @param sourceTexture - The texture to analyze (must be bound to TEXTURE0)
   * @param inputTransfer - Input transfer function code (0=sRGB, 1=HLG, 2=PQ)
   * @returns Luminance statistics (geometric mean and linear average)
   */
  computeLuminanceStats(sourceTexture: WebGLTexture, inputTransfer: number): LuminanceStats {
    const gl = this.gl;

    if (!this.initialized) {
      this.init();
    }

    if (!this.shader || !this.fbo || !this.fboTexture || !this.readbackFBO) {
      return this.cachedResult;
    }

    // Save current state
    const prevFBO = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM);

    // 1. Render log-luminance to FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, LUMINANCE_FBO_SIZE, LUMINANCE_FBO_SIZE);

    this.shader.use();
    this.shader.setUniformInt('u_texture', 0);
    this.shader.setUniformInt('u_inputTransfer', inputTransfer);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // 2. Generate mipmaps on the luminance texture
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture);
    gl.generateMipmap(gl.TEXTURE_2D);

    // 3. Read the 1x1 mip level
    const mipLevels = Math.log2(LUMINANCE_FBO_SIZE); // = 8
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readbackFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
      this.fboTexture, mipLevels,
    );

    // 4. Async PBO readback (double-buffered)
    const currentPBO = this.pbos[this.pboIndex];
    const prevPBOIndex = 1 - this.pboIndex;
    const prevPBO = this.pbos[prevPBOIndex];

    if (currentPBO) {
      // Start async read of current frame's 1x1 pixel into current PBO
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, currentPBO);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

      // Insert fence for this PBO's readback (one fence per PBO)
      if (this.pboFences[this.pboIndex]) {
        gl.deleteSync(this.pboFences[this.pboIndex]!);
      }
      this.pboFences[this.pboIndex] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    }

    // Read previous frame's result from previous PBO using its own fence
    if (!this.firstFrame && prevPBO && this.pboFences[prevPBOIndex]) {
      // Check if previous PBO's fence is signaled
      const status = gl.clientWaitSync(this.pboFences[prevPBOIndex]!, gl.SYNC_FLUSH_COMMANDS_BIT, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPBO);
        const pixels = new Float32Array(4);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

        const logLum = pixels[0]!;
        const linAvg = pixels[1]!;

        if (Number.isFinite(logLum) && Number.isFinite(linAvg)) {
          this.cachedResult = {
            avg: Math.min(Math.max(Math.exp(logLum), 1e-6), 1e6),
            linearAvg: Math.min(Math.max(linAvg, 1e-6), 1e6),
          };
        } else if (!this.nanWarned) {
          console.warn('LuminanceAnalyzer: NaN/Infinity in readback, using cached result');
          this.nanWarned = true;
        }
      }
      // If not ready yet, keep using cached result (no stall)
    }

    this.firstFrame = false;
    this.pboIndex = prevPBOIndex; // Swap for next frame

    // Restore state
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFBO);
    gl.viewport(prevViewport[0]!, prevViewport[1]!, prevViewport[2]!, prevViewport[3]!);
    if (prevProgram) {
      gl.useProgram(prevProgram);
    }

    return this.cachedResult;
  }

  private init(): void {
    const gl = this.gl;

    // Check for color buffer float support (needed for RGBA16F FBO)
    if (!gl.getExtension('EXT_color_buffer_float')) {
      console.warn('LuminanceAnalyzer: EXT_color_buffer_float not available');
      this.initialized = true;
      return;
    }

    // Create shader
    this.shader = new ShaderProgram(gl, LUMINANCE_VERT, luminanceFragSource);

    // Create 256x256 RGBA16F texture for luminance
    this.fboTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA16F,
      LUMINANCE_FBO_SIZE, LUMINANCE_FBO_SIZE,
      0, gl.RGBA, gl.FLOAT, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create main FBO (renders to mip level 0)
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
      this.fboTexture, 0,
    );

    // Create readback FBO (will attach desired mip level)
    this.readbackFBO = gl.createFramebuffer();

    // Create double-buffered PBOs
    this.pbos[0] = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[0]);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 4 * 4, gl.STREAM_READ); // 1 pixel * 4 floats * 4 bytes
    this.pbos[1] = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[1]);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 4 * 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // Create quad VAO
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    // Full-screen quad: position (x,y) + texcoord (u,v)
    const quadData = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
    const posLoc = this.shader.getAttributeLocation('a_position');
    const texLoc = this.shader.getAttributeLocation('a_texCoord');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    // Restore FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.initialized = true;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.shader) { this.shader.dispose(); this.shader = null; }
    if (this.fbo) { gl.deleteFramebuffer(this.fbo); this.fbo = null; }
    if (this.readbackFBO) { gl.deleteFramebuffer(this.readbackFBO); this.readbackFBO = null; }
    if (this.fboTexture) { gl.deleteTexture(this.fboTexture); this.fboTexture = null; }
    if (this.quadVAO) { gl.deleteVertexArray(this.quadVAO); this.quadVAO = null; }
    if (this.quadVBO) { gl.deleteBuffer(this.quadVBO); this.quadVBO = null; }
    if (this.pbos[0]) { gl.deleteBuffer(this.pbos[0]); this.pbos[0] = null; }
    if (this.pbos[1]) { gl.deleteBuffer(this.pbos[1]); this.pbos[1] = null; }
    if (this.pboFences[0]) { gl.deleteSync(this.pboFences[0]); this.pboFences[0] = null; }
    if (this.pboFences[1]) { gl.deleteSync(this.pboFences[1]); this.pboFences[1] = null; }
    this.initialized = false;
    this.firstFrame = true;
  }
}
