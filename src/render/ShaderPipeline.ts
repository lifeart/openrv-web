/**
 * ShaderPipeline - Multi-pass shader pipeline orchestrator.
 *
 * On each frame:
 *   1. Determine which stages are active (not identity).
 *   2. If 0 active stages → render source directly to screen (passthrough).
 *   3. If 1 active stage → single-pass, render source through stage to screen.
 *   4. If N active stages → FBO ping-pong for stages 1..N-1, stage N to screen.
 *
 * This design guarantees ZERO overhead when only one stage is active
 * (the most common case), matching the current single-pass performance.
 *
 * The first active stage uses viewer.vert.glsl (pan/zoom/rotation on source
 * image). All subsequent stages use passthrough.vert.glsl (identity transform
 * for FBO quads).
 */

import type { ShaderStageDescriptor, StageId } from './ShaderStage';
import type { InternalShaderState, TextureCallbacks } from './ShaderStateManager';
import { ShaderProgram } from './ShaderProgram';
import { FBOPingPong } from './FBOPingPong';
import { Logger } from '../utils/Logger';
import VIEWER_VERT_SOURCE from './shaders/viewer.vert.glsl?raw';
import PASSTHROUGH_VERT_SOURCE from './shaders/passthrough.vert.glsl?raw';

const log = new Logger('ShaderPipeline');

/**
 * Callback for rendering using the monolithic (single-pass) shader when
 * FBO allocation fails. Provided by the Renderer during integration.
 */
export type MonolithicFallbackFn = (
  gl: WebGL2RenderingContext,
  sourceTexture: WebGLTexture,
  state: Readonly<InternalShaderState>,
  texCb: TextureCallbacks,
  targetFBO: WebGLFramebuffer | null,
) => void;

export class ShaderPipeline {
  private stages: ShaderStageDescriptor[] = [];
  private pingPong: FBOPingPong = new FBOPingPong();

  /** Quad VAO for drawing fullscreen quads (set by Renderer). */
  private quadVAO: WebGLVertexArrayObject | null = null;

  /**
   * Programs compiled for the first stage (viewer.vert.glsl) vs intermediate
   * stages (passthrough.vert.glsl) are different, so we track per-stage.
   * Key: `${stageId}:${isFirst}`, value: ShaderProgram.
   */
  private programCache = new Map<string, ShaderProgram>();

  /** Fallback renderer for when FBOs are unavailable. */
  private monolithicFallback: MonolithicFallbackFn | null = null;

  /** Passthrough shader program for 0-active-stages case. */
  private passthroughProgram: ShaderProgram | null = null;

  /** Ordered stage IDs — defines the default pipeline order (11 stages). */
  private stageOrder: StageId[] = [
    'inputDecode',
    'linearize',
    'primaryGrade',
    'secondaryGrade',
    'spatialEffects',       // clarity (pre-tone-mapping, phase 5e)
    'colorPipeline',
    'sceneAnalysis',
    'spatialEffectsPost',   // sharpen (post-tone-mapping, phase 7b)
    'displayOutput',
    'diagnostics',
    'compositing',
  ];

  // ─── Global Uniforms UBO ────────────────────────────────────────────
  // Shared uniforms consumed by multiple stages. Bound once per frame via
  // a WebGL2 Uniform Buffer Object at binding point 0.
  //
  // std140 layout (8 floats = 32 bytes) — ALL fields are float in GLSL.
  // Integer-valued fields (channelMode, premult, outputMode) are stored
  // as float and cast to int in the shader via int(value).
  //   [0] u_hdrHeadroom  (float)
  //   [1] u_channelMode  (float, use int() in GLSL)
  //   [2] u_premult      (float, use int() in GLSL)
  //   [3] u_outputMode   (float, use int() in GLSL)
  //   [4] u_texelSize.x  (float)
  //   [5] u_texelSize.y  (float)
  //   [6] _padding        (unused)
  //   [7] _padding        (unused)
  private globalUBO: WebGLBuffer | null = null;
  private globalUBOData = new Float32Array(8);

  /** Renderer-set values for UBO fields not in InternalShaderState. */
  private _hdrHeadroom = 1.0;
  private _outputMode = 0;

  /**
   * Register a stage descriptor. Stages are executed in the order
   * defined by stageOrder, regardless of registration order.
   */
  registerStage(descriptor: ShaderStageDescriptor): void {
    const existingIdx = this.stages.findIndex(s => s.id === descriptor.id);
    if (existingIdx !== -1) {
      this.stages[existingIdx] = descriptor;
    } else {
      this.stages.push(descriptor);
    }
    this.sortStages();
  }

  /**
   * Set the quad VAO to use for drawing fullscreen quads.
   * Called by the Renderer during initialization.
   */
  setQuadVAO(vao: WebGLVertexArrayObject): void {
    this.quadVAO = vao;
  }

  /**
   * Set the monolithic fallback callback.
   * Called when FBO allocation fails, falling back to single-pass rendering.
   */
  setMonolithicFallback(fn: MonolithicFallbackFn): void {
    this.monolithicFallback = fn;
  }

  /**
   * Reorder stages at runtime. Validates that the new order contains
   * all currently registered stage IDs (extra IDs for future stages
   * are allowed and preserved).
   */
  setStageOrder(newOrder: StageId[]): boolean {
    const registeredIds = new Set(this.stages.map(s => s.id));
    const newIds = new Set(newOrder);

    // Validate: no duplicates in the new order
    if (newIds.size !== newOrder.length) {
      log.warn('setStageOrder: duplicate entries in new order');
      return false;
    }

    // Validate: all registered stages must be present in the new order
    for (const id of registeredIds) {
      if (!newIds.has(id)) {
        log.warn(`setStageOrder: missing stage '${id}' in new order`);
        return false;
      }
    }

    this.stageOrder = [...newOrder];
    this.sortStages();
    return true;
  }

  /** Get the current stage order. */
  getStageOrder(): readonly StageId[] {
    return this.stageOrder;
  }

  /** Get registered stages (read-only). */
  getStages(): readonly ShaderStageDescriptor[] {
    return this.stages;
  }

  /**
   * Execute the pipeline.
   *
   * @param gl - WebGL2 context
   * @param sourceTexture - The input image texture
   * @param renderWidth - Width of the render target (image dims for display, reduced for scopes)
   * @param renderHeight - Height of the render target
   * @param state - Current shader state (read-only)
   * @param texCb - Texture binding callbacks
   * @param targetFBO - null for screen, or a specific FBO for scope rendering
   * @param isHDR - Whether the content is HDR (determines RGBA16F vs RGBA8 FBO format)
   */
  execute(
    gl: WebGL2RenderingContext,
    sourceTexture: WebGLTexture,
    renderWidth: number,
    renderHeight: number,
    state: Readonly<InternalShaderState>,
    texCb: TextureCallbacks,
    targetFBO: WebGLFramebuffer | null = null,
    isHDR: boolean = false,
  ): void {
    // 1. Determine active stages
    const activeStages = this.stages.filter(s => !s.isIdentity(state));

    if (activeStages.length === 0) {
      // Passthrough: just blit source to target
      this.renderPassthrough(gl, sourceTexture, targetFBO, renderWidth, renderHeight);
      return;
    }

    // Update Global Uniforms UBO (shared across all active stages)
    this.updateGlobalUBO(gl, state);

    if (activeStages.length === 1) {
      // Single-pass: no FBO overhead
      const stage = activeStages[0]!;
      const program = this.ensureProgram(gl, stage, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
      gl.viewport(0, 0, renderWidth, renderHeight);
      program.use();
      stage.applyUniforms(program, state, texCb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      program.setUniformInt('u_inputTexture', 0);
      this.drawQuad(gl);
      return;
    }

    // Multi-pass: ping-pong FBO chain

    // FBO format: RGBA8 for SDR (default), RGBA16F for HDR content
    const fboFormat = isHDR ? 'rgba16f' : 'rgba8';

    // FBO dimensions match the render target, NOT the canvas.
    if (!this.pingPong.ensure(gl, renderWidth, renderHeight, fboFormat)) {
      if (fboFormat === 'rgba16f') {
        // Fallback 1: RGBA16F unsupported (no EXT_color_buffer_float), try RGBA8
        log.warn('RGBA16F FBOs unavailable, falling back to RGBA8');
        if (!this.pingPong.ensure(gl, renderWidth, renderHeight, 'rgba8')) {
          log.warn('FBO allocation failed, falling back to monolithic shader');
          this.renderMonolithic(gl, sourceTexture, state, texCb, targetFBO);
          return;
        }
      } else {
        // RGBA8 failed — no point trying RGBA16F, go straight to monolithic
        log.warn('FBO allocation failed, falling back to monolithic shader');
        this.renderMonolithic(gl, sourceTexture, state, texCb, targetFBO);
        return;
      }
    }

    this.pingPong.resetChain();

    let currentReadTexture: WebGLTexture | null = sourceTexture;

    for (let i = 0; i < activeStages.length; i++) {
      const stage = activeStages[i]!;
      const isFirst = i === 0;
      const isLast = i === activeStages.length - 1;

      // First stage uses viewer.vert.glsl (pan/zoom/rotation on source image).
      // All subsequent stages use passthrough.vert.glsl (identity transform on FBO quads).
      const program = this.ensureProgram(gl, stage, isFirst);

      if (isLast) {
        // Last stage renders to screen (or targetFBO)
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
        gl.viewport(0, 0, renderWidth, renderHeight);
      } else {
        // Intermediate stage renders to FBO
        this.pingPong.beginPass(gl);
      }

      // Set texture filtering based on stage needs:
      // NEAREST for per-pixel stages, LINEAR for spatial sampling stages
      if (!isFirst) {
        this.pingPong.setFilteringMode(gl, stage.needsBilinearInput ?? false);
        currentReadTexture = this.pingPong.readTexture;
      }

      program.use();
      stage.applyUniforms(program, state, texCb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentReadTexture);
      program.setUniformInt('u_inputTexture', 0);
      this.drawQuad(gl);

      if (!isLast) {
        this.pingPong.endPass();
      }
    }
  }

  /**
   * Ensure a shader program exists for the given stage.
   * First stage uses viewer.vert.glsl, intermediate stages use passthrough.vert.glsl.
   */
  private ensureProgram(
    gl: WebGL2RenderingContext,
    stage: ShaderStageDescriptor,
    isFirstStage: boolean,
  ): ShaderProgram {
    const cacheKey = `${stage.id}:${isFirstStage ? 'first' : 'intermediate'}`;
    let program = this.programCache.get(cacheKey);
    if (program) return program;

    const vertexSource = isFirstStage ? VIEWER_VERT_SOURCE : PASSTHROUGH_VERT_SOURCE;
    program = new ShaderProgram(gl, vertexSource, stage.fragmentSource);

    // Bind Global Uniforms UBO (binding point 0)
    const blockIndex = gl.getUniformBlockIndex(program.handle, 'GlobalUniforms');
    if (blockIndex !== gl.INVALID_INDEX) {
      gl.uniformBlockBinding(program.handle, blockIndex, 0);
    }

    this.programCache.set(cacheKey, program);
    return program;
  }

  private updateGlobalUBO(gl: WebGL2RenderingContext, state: Readonly<InternalShaderState>): void {
    if (!this.globalUBO) {
      this.globalUBO = gl.createBuffer();
      if (!this.globalUBO) {
        log.warn('Failed to create Global Uniforms UBO buffer');
        return;
      }
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.globalUBO);
      gl.bufferData(gl.UNIFORM_BUFFER, this.globalUBOData.byteLength, gl.DYNAMIC_DRAW);
    }
    this.globalUBOData[0] = this._hdrHeadroom;
    this.globalUBOData[1] = state.channelModeCode;
    this.globalUBOData[2] = state.premultMode;
    this.globalUBOData[3] = this._outputMode;
    this.globalUBOData[4] = state.texelSize[0];
    this.globalUBOData[5] = state.texelSize[1];
    this.globalUBOData[6] = 0; // padding
    this.globalUBOData[7] = 0; // padding

    gl.bindBuffer(gl.UNIFORM_BUFFER, this.globalUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.globalUBOData);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.globalUBO);
  }

  /**
   * Set the hdrHeadroom value in the global UBO data.
   * Called by Renderer before execute() based on HDR output mode.
   */
  setGlobalHDRHeadroom(headroom: number): void {
    this._hdrHeadroom = headroom;
  }

  /**
   * Set the outputMode value in the global UBO data.
   * Called by Renderer before execute() based on SDR/HDR mode.
   */
  setGlobalOutputMode(mode: number): void {
    this._outputMode = mode;
  }

  private drawQuad(gl: WebGL2RenderingContext): void {
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private renderPassthrough(
    gl: WebGL2RenderingContext,
    source: WebGLTexture,
    targetFBO: WebGLFramebuffer | null,
    renderWidth: number,
    renderHeight: number,
  ): void {
    if (!this.passthroughProgram) {
      // Minimal blit fragment shader
      const fragSource = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_inputTexture;
void main() {
  fragColor = texture(u_inputTexture, v_texCoord);
}`;
      this.passthroughProgram = new ShaderProgram(gl, PASSTHROUGH_VERT_SOURCE, fragSource);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.viewport(0, 0, renderWidth, renderHeight);
    this.passthroughProgram.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    this.passthroughProgram.setUniformInt('u_inputTexture', 0);
    this.drawQuad(gl);
  }

  private renderMonolithic(
    gl: WebGL2RenderingContext,
    sourceTexture: WebGLTexture,
    state: Readonly<InternalShaderState>,
    texCb: TextureCallbacks,
    targetFBO: WebGLFramebuffer | null,
  ): void {
    if (this.monolithicFallback) {
      this.monolithicFallback(gl, sourceTexture, state, texCb, targetFBO);
    } else {
      log.warn('No monolithic fallback set — rendering skipped');
    }
  }

  private sortStages(): void {
    const orderMap = new Map(this.stageOrder.map((id, i) => [id, i]));
    this.stages.sort((a, b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }

  dispose(gl: WebGL2RenderingContext): void {
    this.pingPong.dispose(gl);
    // Release Global Uniforms UBO
    if (this.globalUBO) {
      gl.deleteBuffer(this.globalUBO);
      this.globalUBO = null;
    }
    // Release passthrough program
    if (this.passthroughProgram) {
      this.passthroughProgram.dispose();
      this.passthroughProgram = null;
    }
    // Release all cached programs
    for (const program of this.programCache.values()) {
      program.dispose();
    }
    this.programCache.clear();
  }
}
