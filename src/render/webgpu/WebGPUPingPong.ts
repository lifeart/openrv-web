/**
 * WebGPUPingPong - Manages a pair of GPU textures for multi-pass rendering.
 *
 * WebGPU equivalent of FBOPingPong. Uses two GPUTextures as intermediate
 * render targets for the multi-pass shader pipeline, alternating between
 * them (ping-pong) so the output of one stage becomes the input of the next.
 *
 * Lifecycle:
 *   1. resize(device, width, height, format) — allocate/resize textures
 *   2. resetChain() — reset read/write indices before a new frame
 *   3. getSource() — get the texture view to read from (previous pass output)
 *   4. getTarget() — get the texture view to write to
 *   5. swap() — alternate read/write after each pass
 *   6. dispose() — release GPU resources
 */

import type { WGPUDevice, WGPUTexture, WGPUTextureView } from './WebGPUTypes';
import { GPUTextureUsage } from './WebGPUTypes';

export type PingPongFormat = 'rgba8unorm' | 'rgba16float';

export class WebGPUPingPong {
  private textures: [WGPUTexture | null, WGPUTexture | null] = [null, null];
  private views: [WGPUTextureView | null, WGPUTextureView | null] = [null, null];
  private _width = 0;
  private _height = 0;
  private _format: PingPongFormat = 'rgba8unorm';

  /** Index of the texture that will be WRITTEN TO in the next pass (0 or 1). */
  private writeIndex = 0;

  /** Get the current width. */
  get width(): number {
    return this._width;
  }

  /** Get the current height. */
  get height(): number {
    return this._height;
  }

  /** Get the current format. */
  get format(): PingPongFormat {
    return this._format;
  }

  /** Whether textures have been allocated. */
  get isAllocated(): boolean {
    return this.textures[0] !== null && this.textures[1] !== null;
  }

  /**
   * Get the texture view to read from (previous pass output).
   * Returns the read-side texture view.
   */
  getSource(): WGPUTextureView | null {
    const readIndex = 1 - this.writeIndex;
    return this.views[readIndex] ?? null;
  }

  /**
   * Get the texture view to write to (current pass target).
   * Returns the write-side texture view.
   */
  getTarget(): WGPUTextureView | null {
    return this.views[this.writeIndex] ?? null;
  }

  /**
   * Swap read/write indices after a pass completes.
   * The texture that was just written to becomes the read source for the next pass.
   */
  swap(): void {
    this.writeIndex = 1 - this.writeIndex;
  }

  /**
   * Reset the chain before starting a new frame.
   * After reset, the first pass will write to texture[0].
   */
  resetChain(): void {
    this.writeIndex = 0;
  }

  /**
   * Allocate or resize the ping-pong textures.
   * If the dimensions and format match existing textures, this is a no-op.
   *
   * @param device - The GPU device
   * @param width - Texture width in pixels
   * @param height - Texture height in pixels
   * @param format - Texture format: 'rgba8unorm' (SDR) or 'rgba16float' (HDR)
   */
  resize(device: WGPUDevice, width: number, height: number, format: PingPongFormat = 'rgba8unorm'): void {
    // Skip if already matching
    if (
      this.textures[0] !== null &&
      this.textures[1] !== null &&
      this._width === width &&
      this._height === height &&
      this._format === format
    ) {
      return;
    }

    // Destroy existing textures
    this.destroyTextures();

    // Create two new textures
    for (let i = 0; i < 2; i++) {
      const texture = device.createTexture({
        size: { width, height },
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.textures[i] = texture;
      this.views[i] = texture.createView();
    }

    this._width = width;
    this._height = height;
    this._format = format;
    this.writeIndex = 0;
  }

  /**
   * Release all GPU texture resources.
   */
  dispose(): void {
    this.destroyTextures();
    this._width = 0;
    this._height = 0;
    this._format = 'rgba8unorm';
  }

  private destroyTextures(): void {
    for (let i = 0; i < 2; i++) {
      const tex = this.textures[i];
      if (tex) {
        tex.destroy();
        this.textures[i] = null;
        this.views[i] = null;
      }
    }
  }
}
