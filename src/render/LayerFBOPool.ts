/**
 * LayerFBOPool - Manages a pool of FBOs for layer rendering.
 *
 * Lazily allocates FBOs as layers are added, reuses them when layer count
 * decreases, and handles resize. Only allocates FBOs for visible layers
 * with nonzero opacity.
 *
 * Maximum supported layers: MAX_STACK_LAYERS (8).
 */

import { Logger } from '../utils/Logger';

const log = new Logger('LayerFBOPool');

/** Maximum number of stack layers allowed. */
export const MAX_STACK_LAYERS = 8;

export interface FBOEntry {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
}

export class LayerFBOPool {
  private entries: FBOEntry[] = [];
  private _width = 0;
  private _height = 0;
  private _format: 'rgba16f' | 'rgba8' = 'rgba8';

  /** Get the current pool size (number of allocated FBOs). */
  get size(): number {
    return this.entries.length;
  }

  /** Get the current FBO dimensions. */
  get width(): number { return this._width; }
  get height(): number { return this._height; }
  get format(): 'rgba16f' | 'rgba8' { return this._format; }

  /**
   * Ensure at least `count` FBOs are available at the given dimensions.
   * If dimensions or format changed, all FBOs are recreated.
   *
   * @returns true if all FBOs are available, false if allocation failed.
   */
  ensure(
    gl: WebGL2RenderingContext,
    count: number,
    width: number,
    height: number,
    format: 'rgba16f' | 'rgba8' = 'rgba8',
  ): boolean {
    const clampedCount = Math.min(count, MAX_STACK_LAYERS);

    // Check if dimensions or format changed — rebuild if so
    if (this._width !== width || this._height !== height || this._format !== format) {
      this.dispose(gl);
    }

    // If we already have enough FBOs, return
    if (this.entries.length >= clampedCount) {
      return true;
    }

    // Allocate additional FBOs
    for (let i = this.entries.length; i < clampedCount; i++) {
      const entry = this.allocateFBO(gl, width, height, format);
      if (!entry) {
        log.warn(`Failed to allocate FBO ${i} (${width}x${height} ${format})`);
        return false;
      }
      this.entries.push(entry);
    }

    this._width = width;
    this._height = height;
    this._format = format;
    return true;
  }

  /**
   * Get the FBO entry at the given index.
   * Returns null if the index is out of range.
   */
  get(index: number): FBOEntry | null {
    return this.entries[index] ?? null;
  }

  /**
   * Shrink the pool to at most `count` FBOs, freeing excess.
   */
  shrink(gl: WebGL2RenderingContext, count: number): void {
    while (this.entries.length > count) {
      const entry = this.entries.pop()!;
      gl.deleteFramebuffer(entry.fbo);
      gl.deleteTexture(entry.texture);
    }
  }

  private allocateFBO(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    format: 'rgba16f' | 'rgba8',
  ): FBOEntry | null {
    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    const internalFormat = format === 'rgba16f' ? gl.RGBA16F : gl.RGBA8;
    const type = format === 'rgba16f' ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    if (!fbo) {
      gl.deleteTexture(texture);
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      log.warn(`FBO incomplete (${width}x${height} ${format})`);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { fbo, texture };
  }

  /** Release all GPU resources. */
  dispose(gl: WebGL2RenderingContext): void {
    for (const entry of this.entries) {
      gl.deleteFramebuffer(entry.fbo);
      gl.deleteTexture(entry.texture);
    }
    this.entries = [];
    this._width = 0;
    this._height = 0;
    this._format = 'rgba8';
  }
}
