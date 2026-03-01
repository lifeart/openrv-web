/**
 * CompositingRenderer - GPU-accelerated compositing orchestrator.
 *
 * Composites multiple layer FBO textures using either:
 * - WebGL blend state (for Over, Replace, Add) — zero shader overhead
 * - A dedicated compositing fragment shader (for Difference) — ping-pong FBO
 *
 * All compositing is performed in linear (scene-referred) color space,
 * matching desktop OpenRV's pipeline.
 *
 * Dirty-flag FBO caching: per-layer dirty state is tracked so that only
 * layers whose source or render state has changed are re-rendered.
 */

import { ShaderProgram } from './ShaderProgram';
import { LayerFBOPool } from './LayerFBOPool';
import { FBOPingPong } from './FBOPingPong';
import { Logger } from '../utils/Logger';
import type { StencilBox } from '../core/types/wipe';
import { isStencilBoxActive } from '../core/types/wipe';
import type { BlendMode } from '../composite/BlendModes';
import type { StackCompositeType } from '../nodes/groups/StackGroupNode';
import PASSTHROUGH_VERT_SOURCE from './shaders/passthrough.vert.glsl?raw';
import COMPOSITING_FRAG_SOURCE from './shaders/compositing.frag.glsl?raw';

const log = new Logger('CompositingRenderer');

/** Composite mode codes matching the shader constants. */
export const COMPOSITE_MODE_OVER = 0;
export const COMPOSITE_MODE_REPLACE = 1;
export const COMPOSITE_MODE_ADD = 2;
export const COMPOSITE_MODE_DIFFERENCE = 3;

/**
 * Map a BlendMode or StackCompositeType to a shader mode code.
 */
export function getCompositeModeCode(mode: BlendMode | StackCompositeType): number {
  switch (mode) {
    case 'over':
    case 'normal':
      return COMPOSITE_MODE_OVER;
    case 'replace':
      return COMPOSITE_MODE_REPLACE;
    case 'add':
      return COMPOSITE_MODE_ADD;
    case 'difference':
      return COMPOSITE_MODE_DIFFERENCE;
    default:
      return COMPOSITE_MODE_OVER;
  }
}

/**
 * Check whether a blend mode can use the fast GL blend state path.
 * Returns true for Over, Replace, Add. Returns false for Difference and others.
 */
export function isGLBlendStateMode(mode: BlendMode | StackCompositeType): boolean {
  switch (mode) {
    case 'over':
    case 'normal':
    case 'replace':
    case 'add':
      return true;
    default:
      return false;
  }
}

/** Descriptor for a single layer to be composited. */
export interface CompositeLayerDescriptor {
  /** The layer's FBO texture (linear-space, premultiplied alpha). */
  texture: WebGLTexture;
  /** Blend mode for this layer. */
  blendMode: BlendMode | StackCompositeType;
  /** Opacity for this layer (0-1). */
  opacity: number;
  /** Whether this layer is visible. */
  visible: boolean;
  /** Optional stencil box clipping region [xMin, xMax, yMin, yMax]. */
  stencilBox?: StencilBox;
}

/** Per-layer dirty state for FBO caching. */
interface LayerCacheEntry {
  /** Identity key for the source image (e.g., image ID or data hash). */
  sourceKey: string;
  /** Hash of the render state applied to this layer. */
  stateHash: string;
}

export class CompositingRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private compositingShader: ShaderProgram | null = null;
  private passthroughShader: ShaderProgram | null = null;

  /** FBO pool for per-layer linear-space rendering. */
  private layerPool = new LayerFBOPool();

  /** Ping-pong FBOs for shader-based compositing (Difference mode etc.). */
  private pingPong = new FBOPingPong();

  /** Quad geometry (shared via setter). */
  private quadVAO: WebGLVertexArrayObject | null = null;

  /** Per-layer cache entries for dirty-flag optimization. */
  private layerCache: LayerCacheEntry[] = [];

  /** Whether to use premultiplied alpha in compositing. */
  private premultiplied = true;

  initialize(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    // Compile compositing shader lazily on first use (Phase 4: shader compile latency mitigation)
  }

  /** Set the quad VAO for drawing fullscreen quads. */
  setQuadVAO(vao: WebGLVertexArrayObject): void {
    this.quadVAO = vao;
  }

  /** Set whether to use premultiplied alpha. */
  setPremultiplied(premultiplied: boolean): void {
    this.premultiplied = premultiplied;
  }

  /** Get the layer FBO pool. */
  getLayerPool(): LayerFBOPool {
    return this.layerPool;
  }

  /**
   * Ensure the layer FBO pool has enough FBOs for the given layer count.
   * @returns true if all FBOs are available.
   */
  ensureLayerFBOs(
    count: number,
    width: number,
    height: number,
    format: 'rgba16f' | 'rgba8' = 'rgba8',
  ): boolean {
    if (!this.gl) return false;
    return this.layerPool.ensure(this.gl, count, width, height, format);
  }

  /**
   * Check if a layer needs re-rendering based on its dirty state.
   * @param layerIndex - Index of the layer.
   * @param sourceKey - Identity key for the source (e.g., image object hash).
   * @param stateHash - Hash of the render state for this layer.
   * @returns true if the layer is dirty and needs re-rendering.
   */
  isLayerDirty(layerIndex: number, sourceKey: string, stateHash: string): boolean {
    const cached = this.layerCache[layerIndex];
    if (!cached) return true;
    return cached.sourceKey !== sourceKey || cached.stateHash !== stateHash;
  }

  /**
   * Mark a layer as clean (rendered with the given source and state).
   */
  markLayerClean(layerIndex: number, sourceKey: string, stateHash: string): void {
    this.layerCache[layerIndex] = { sourceKey, stateHash };
  }

  /**
   * Invalidate all layer caches (e.g., on resize or mode change).
   */
  invalidateAllCaches(): void {
    this.layerCache = [];
  }

  /**
   * Composite multiple layer textures into the target framebuffer.
   *
   * Layers are composited bottom-to-top (index 0 is the bottom layer).
   * Uses GL blend state for fast modes (Over, Replace, Add) and the
   * compositing shader for complex modes (Difference).
   *
   * @param layers - Array of layer descriptors (bottom to top).
   * @param width - Output width.
   * @param height - Output height.
   * @param targetFBO - Target framebuffer (null = screen).
   * @returns The texture containing the composited result (from ping-pong), or null if rendered directly to targetFBO.
   */
  compositeFrame(
    layers: CompositeLayerDescriptor[],
    width: number,
    height: number,
    targetFBO: WebGLFramebuffer | null = null,
  ): WebGLTexture | null {
    const gl = this.gl;
    if (!gl || layers.length === 0) return null;

    // Filter to visible layers with nonzero opacity
    const visibleLayers = layers.filter(l => l.visible && l.opacity > 0);
    if (visibleLayers.length === 0) return null;

    // Single layer: just blit it to the target
    if (visibleLayers.length === 1) {
      const layer = visibleLayers[0]!;
      this.blitTexture(gl, layer.texture, width, height, targetFBO);
      return null;
    }

    // Check if all layers can use the GL blend state path
    const allGLBlendable = visibleLayers.every(l => isGLBlendStateMode(l.blendMode));

    if (allGLBlendable) {
      return this.compositeWithGLBlend(gl, visibleLayers, width, height, targetFBO);
    } else {
      return this.compositeWithShader(gl, visibleLayers, width, height, targetFBO);
    }
  }

  /**
   * Composite layers using GL blend state (fast path).
   * Used for Over, Replace, Add modes.
   */
  private compositeWithGLBlend(
    gl: WebGL2RenderingContext,
    layers: CompositeLayerDescriptor[],
    width: number,
    height: number,
    targetFBO: WebGLFramebuffer | null,
  ): null {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const shader = this.ensurePassthroughShader(gl);
    shader.use();
    shader.setUniformInt('u_inputTexture', 0);

    for (const layer of layers) {
      const modeCode = getCompositeModeCode(layer.blendMode);

      // Apply stencil box via scissor test
      if (layer.stencilBox && isStencilBoxActive(layer.stencilBox)) {
        const [xMin, xMax, yMin, yMax] = layer.stencilBox;
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(
          Math.floor(xMin * width),
          Math.floor(yMin * height),
          Math.ceil((xMax - xMin) * width),
          Math.ceil((yMax - yMin) * height),
        );
      }

      // Set blend state based on mode
      if (modeCode === COMPOSITE_MODE_REPLACE) {
        gl.disable(gl.BLEND);
      } else if (modeCode === COMPOSITE_MODE_ADD) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        // Over (premultiplied)
        gl.enable(gl.BLEND);
        if (this.premultiplied) {
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          gl.blendFuncSeparate(
            gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
          );
        }
      }

      // Set opacity via alpha (modulate)
      shader.setUniform('u_opacity', layer.opacity);

      // Bind layer texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);

      // Draw quad
      this.drawQuad(gl);

      // Reset scissor
      if (layer.stencilBox && isStencilBoxActive(layer.stencilBox)) {
        gl.disable(gl.SCISSOR_TEST);
      }
    }

    // Restore GL state
    gl.disable(gl.BLEND);
    return null;
  }

  /**
   * Composite layers using the compositing shader (for Difference and complex modes).
   * Uses ping-pong FBO approach.
   *
   * @returns The texture containing the composited result.
   */
  private compositeWithShader(
    gl: WebGL2RenderingContext,
    layers: CompositeLayerDescriptor[],
    width: number,
    height: number,
    targetFBO: WebGLFramebuffer | null,
  ): WebGLTexture | null {
    const shader = this.ensureCompositingShader(gl);
    if (!shader) return null;

    // Ensure ping-pong FBOs
    if (!this.pingPong.ensure(gl, width, height, 'rgba8')) {
      log.warn('Compositing ping-pong FBO allocation failed');
      return null;
    }

    shader.use();

    // Start by rendering the first layer into the ping-pong write FBO
    this.pingPong.resetChain();
    this.pingPong.beginPass(gl);

    // Clear and blit first layer
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);

    const passthrough = this.ensurePassthroughShader(gl);
    passthrough.use();
    passthrough.setUniformInt('u_inputTexture', 0);
    passthrough.setUniform('u_opacity', layers[0]!.opacity);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, layers[0]!.texture);
    this.drawQuad(gl);

    this.pingPong.endPass();

    // Now composite each subsequent layer on top using the shader
    for (let i = 1; i < layers.length; i++) {
      const layer = layers[i]!;
      const isLast = i === layers.length - 1;

      if (isLast && targetFBO !== undefined) {
        // Last layer: render to the target FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
        gl.viewport(0, 0, width, height);
      } else {
        this.pingPong.beginPass(gl);
      }

      shader.use();

      // Bind base texture (previous result) at unit 0
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pingPong.readTexture);
      shader.setUniformInt('u_baseTexture', 0);

      // Bind layer texture at unit 1
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);
      shader.setUniformInt('u_layerTexture', 1);

      // Set uniforms
      shader.setUniformInt('u_compositeMode', getCompositeModeCode(layer.blendMode));
      shader.setUniform('u_opacity', layer.opacity);
      shader.setUniformInt('u_premultiplied', this.premultiplied ? 1 : 0);

      // Stencil box
      if (layer.stencilBox && isStencilBoxActive(layer.stencilBox)) {
        shader.setUniformInt('u_stencilEnabled', 1);
        shader.setUniform('u_stencilBox', new Float32Array(layer.stencilBox));
      } else {
        shader.setUniformInt('u_stencilEnabled', 0);
      }

      gl.disable(gl.BLEND);
      this.drawQuad(gl);

      if (!isLast || targetFBO === undefined) {
        this.pingPong.endPass();
      }
    }

    // Return the texture containing the composited result
    return this.pingPong.readTexture;
  }

  /**
   * Blit a single texture to the target framebuffer using passthrough shader.
   */
  private blitTexture(
    gl: WebGL2RenderingContext,
    texture: WebGLTexture,
    width: number,
    height: number,
    targetFBO: WebGLFramebuffer | null,
  ): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);

    const shader = this.ensurePassthroughShader(gl);
    shader.use();
    shader.setUniform('u_opacity', 1.0);
    shader.setUniformInt('u_inputTexture', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.drawQuad(gl);
  }

  private ensureCompositingShader(gl: WebGL2RenderingContext): ShaderProgram | null {
    if (this.compositingShader) return this.compositingShader;

    try {
      this.compositingShader = new ShaderProgram(gl, PASSTHROUGH_VERT_SOURCE, COMPOSITING_FRAG_SOURCE);
      log.info('Compositing shader compiled successfully');
      return this.compositingShader;
    } catch (e) {
      log.warn('Failed to compile compositing shader:', e);
      return null;
    }
  }

  private ensurePassthroughShader(gl: WebGL2RenderingContext): ShaderProgram {
    if (this.passthroughShader) return this.passthroughShader;

    const fragSource = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_inputTexture;
uniform float u_opacity;
void main() {
  vec4 color = texture(u_inputTexture, v_texCoord);
  fragColor = vec4(color.rgb, color.a * u_opacity);
}`;
    this.passthroughShader = new ShaderProgram(gl, PASSTHROUGH_VERT_SOURCE, fragSource);
    return this.passthroughShader;
  }

  private drawQuad(gl: WebGL2RenderingContext): void {
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /** Check if the renderer is initialized. */
  isInitialized(): boolean {
    return this.gl !== null;
  }

  /** Release all GPU resources. */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    this.layerPool.dispose(gl);
    this.pingPong.dispose(gl);

    if (this.compositingShader) {
      this.compositingShader.dispose();
      this.compositingShader = null;
    }
    if (this.passthroughShader) {
      this.passthroughShader.dispose();
      this.passthroughShader = null;
    }

    this.layerCache = [];
    this.gl = null;
    log.info('CompositingRenderer disposed');
  }
}
