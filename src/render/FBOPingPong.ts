/**
 * FBOPingPong - Manages a pair of framebuffers for multi-pass rendering.
 *
 * Lifecycle:
 *   1. ensure(gl, width, height, format) — allocate/resize FBOs
 *   2. resetChain() — reset read/write indices before a new frame
 *   3. beginPass(gl) — bind write target, return read texture
 *   4. endPass() — swap ping/pong
 *   5. dispose(gl) — release GPU resources
 *
 * Default texture filtering is NEAREST to prevent sub-texel blending artifacts
 * across non-spatial FBO passes. Stages that need bilinear sampling (clarity,
 * sharpen, perspective bicubic) call setFilteringMode(gl, true) before their
 * texture fetch.
 *
 * Default FBO format is RGBA8. Promoted to RGBA16F only when HDR content is
 * detected, halving VRAM cost for the common SDR case.
 */

import { Logger } from '../utils/Logger';

const log = new Logger('FBOPingPong');

export class FBOPingPong {
  private fbos: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private textures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private _width = 0;
  private _height = 0;
  private _format: 'rgba16f' | 'rgba8' = 'rgba8';

  /** Index of the FBO that will be WRITTEN TO in the next pass (0 or 1). */
  private writeIndex = 0;

  /** The texture that holds the result of the previous pass (read source). */
  get readTexture(): WebGLTexture | null {
    return this.textures[1 - this.writeIndex] ?? null;
  }

  /** The FBO that will be written to in the current pass. */
  get writeFBO(): WebGLFramebuffer | null {
    return this.fbos[this.writeIndex] ?? null;
  }

  /**
   * Ensure FBOs exist and match dimensions/format.
   * Returns false if allocation failed (e.g., no EXT_color_buffer_float).
   */
  ensure(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    format: 'rgba16f' | 'rgba8' = 'rgba8',
  ): boolean {
    if (
      this.fbos[0] && this.fbos[1] &&
      this._width === width && this._height === height &&
      this._format === format
    ) {
      return true;
    }

    this.dispose(gl);

    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture();
      if (!texture) { this.dispose(gl); return false; }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      const internalFormat = format === 'rgba16f' ? gl.RGBA16F : gl.RGBA8;
      const type = format === 'rgba16f' ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
      // NEAREST filtering by default to prevent sub-texel blending artifacts.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer();
      if (!fbo) { gl.deleteTexture(texture); this.dispose(gl); return false; }

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        log.warn(`FBO ${i} incomplete (format=${format}, ${width}x${height})`);
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(texture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.dispose(gl);
        return false;
      }

      this.fbos[i] = fbo;
      this.textures[i] = texture;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._width = width;
    this._height = height;
    this._format = format;
    this.writeIndex = 0;

    log.info(`FBO ping-pong allocated: ${width}x${height} ${format}`);
    return true;
  }

  /**
   * Reset the chain before starting a new frame.
   * After reset, the first beginPass() will write to FBO[0].
   */
  resetChain(): void {
    this.writeIndex = 0;
  }

  /**
   * Set texture filtering mode on the read texture.
   * Called per-stage based on the stage's `needsBilinearInput` flag.
   */
  setFilteringMode(gl: WebGL2RenderingContext, bilinear: boolean): void {
    const readTex = this.readTexture;
    if (!readTex) return;
    const filter = bilinear ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Begin a pass: bind the write FBO, invalidate previous contents.
   * Returns the read texture (previous pass output or source image).
   *
   * gl.invalidateFramebuffer() is called to hint the driver that previous
   * FBO contents are stale, saving bandwidth on tile-based mobile GPUs.
   */
  beginPass(gl: WebGL2RenderingContext): WebGLTexture | null {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO);
    // Hint the driver that previous FBO contents are stale
    if (gl.invalidateFramebuffer) {
      gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0]);
    }
    gl.viewport(0, 0, this._width, this._height);
    return this.readTexture;
  }

  /** End a pass: swap read/write indices. */
  endPass(): void {
    this.writeIndex = 1 - this.writeIndex;
  }

  /** Release GPU resources. */
  dispose(gl: WebGL2RenderingContext): void {
    for (let i = 0; i < 2; i++) {
      const tex = this.textures[i];
      const fbo = this.fbos[i];
      if (tex) { gl.deleteTexture(tex); this.textures[i] = null; }
      if (fbo) { gl.deleteFramebuffer(fbo); this.fbos[i] = null; }
    }
    this._width = 0;
    this._height = 0;
    this._format = 'rgba8';
  }

  getWidth(): number { return this._width; }
  getHeight(): number { return this._height; }
  getFormat(): 'rgba16f' | 'rgba8' { return this._format; }
}
