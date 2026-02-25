import { ShaderProgram } from './ShaderProgram';
import { TRANSITION_TYPE_CODES } from '../core/types/transition';
import type { TransitionConfig } from '../core/types/transition';
import { Logger } from '../utils/Logger';
import vertexShaderSource from './shaders/transition.vert.glsl?raw';
import fragmentShaderSource from './shaders/transition.frag.glsl?raw';

const log = new Logger('TransitionRenderer');

/**
 * Dual-FBO orchestration for GPU-accelerated playlist transitions.
 *
 * Both outgoing and incoming frames are rendered through the existing viewer
 * pipeline into separate FBOs. This class then blends the two FBO textures
 * using a dedicated transition fragment shader (crossfade, dissolve, wipes).
 */
export class TransitionRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private transitionShader: ShaderProgram | null = null;

  // FBO A: outgoing frame
  private fboA: WebGLFramebuffer | null = null;
  private texA: WebGLTexture | null = null;

  // FBO B: incoming frame
  private fboB: WebGLFramebuffer | null = null;
  private texB: WebGLTexture | null = null;

  private fboWidth = 0;
  private fboHeight = 0;

  // Quad geometry (shared)
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  initialize(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.transitionShader = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
    this.setupQuad(gl);
    log.info('TransitionRenderer initialized');
  }

  private setupQuad(gl: WebGL2RenderingContext): void {
    // Create fullscreen quad VAO/VBO
    // Vertices: position (x,y) + texcoord (u,v)
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);

    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Position attribute (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    // TexCoord attribute (location 1)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
  }

  private ensureFBOs(width: number, height: number): void {
    if (this.fboWidth === width && this.fboHeight === height && this.fboA && this.fboB) return;

    const gl = this.gl!;
    // Cleanup old FBOs
    this.disposeFBOs();

    // Create FBO A
    this.fboA = gl.createFramebuffer();
    this.texA = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texA, 0);

    // Create FBO B
    this.fboB = gl.createFramebuffer();
    this.texB = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texB, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fboWidth = width;
    this.fboHeight = height;
    log.debug(`FBOs allocated: ${width}x${height}`);
  }

  /**
   * Render a transition frame by blending two already-rendered textures.
   *
   * @param textureA - WebGL texture containing the outgoing frame
   * @param textureB - WebGL texture containing the incoming frame
   * @param config - Transition configuration
   * @param progress - 0.0 = fully outgoing, 1.0 = fully incoming
   * @param canvasWidth - Output canvas width
   * @param canvasHeight - Output canvas height
   */
  renderTransitionFrame(
    textureA: WebGLTexture,
    textureB: WebGLTexture,
    config: TransitionConfig,
    progress: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const gl = this.gl;
    if (!gl || !this.transitionShader || !this.quadVAO) return;

    // Clamp progress to [0, 1] to avoid shader artifacts
    progress = Math.max(0, Math.min(1, progress));

    // Render to default framebuffer (screen)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasWidth, canvasHeight);

    this.transitionShader.use();

    // Set uniforms
    const typeCode = TRANSITION_TYPE_CODES[config.type] ?? 0;
    this.transitionShader.setUniformInt('u_transitionType', typeCode);
    this.transitionShader.setUniform('u_progress', progress);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureA);
    this.transitionShader.setUniformInt('u_textureA', 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureB);
    this.transitionShader.setUniformInt('u_textureB', 1);

    // Draw fullscreen quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /**
   * Get FBO A for rendering the outgoing frame into.
   */
  getFBOA(width: number, height: number): { fbo: WebGLFramebuffer; texture: WebGLTexture } | null {
    if (!this.gl) return null;
    this.ensureFBOs(width, height);
    if (!this.fboA || !this.texA) return null;
    return { fbo: this.fboA, texture: this.texA };
  }

  /**
   * Get FBO B for rendering the incoming frame into.
   */
  getFBOB(width: number, height: number): { fbo: WebGLFramebuffer; texture: WebGLTexture } | null {
    if (!this.gl) return null;
    this.ensureFBOs(width, height);
    if (!this.fboB || !this.texB) return null;
    return { fbo: this.fboB, texture: this.texB };
  }

  isInitialized(): boolean {
    return this.gl !== null && this.transitionShader !== null;
  }

  private disposeFBOs(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.fboA) { gl.deleteFramebuffer(this.fboA); this.fboA = null; }
    if (this.texA) { gl.deleteTexture(this.texA); this.texA = null; }
    if (this.fboB) { gl.deleteFramebuffer(this.fboB); this.fboB = null; }
    if (this.texB) { gl.deleteTexture(this.texB); this.texB = null; }
    this.fboWidth = 0;
    this.fboHeight = 0;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeFBOs();

    if (this.transitionShader) {
      this.transitionShader.dispose();
      this.transitionShader = null;
    }
    if (this.quadVAO) {
      gl.deleteVertexArray(this.quadVAO);
      this.quadVAO = null;
    }
    if (this.quadVBO) {
      gl.deleteBuffer(this.quadVBO);
      this.quadVBO = null;
    }

    this.gl = null;
    log.info('TransitionRenderer disposed');
  }
}
