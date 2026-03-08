/**
 * WebGPUReadback - GPU pixel readback for WebGPU.
 *
 * Reads pixel data from GPU render textures back to the CPU using
 * `copyTextureToBuffer()` + `buffer.mapAsync()`. Uses double-buffered
 * readback buffers to allow overlapping map operations.
 *
 * Usage:
 *   1. readPixelFloat(device, x, y, renderTexture) -> Promise<[r,g,b,a]>
 *   2. readRegion(device, x, y, w, h, renderTexture) -> Promise<Float32Array>
 *   3. dispose() — release GPU buffers
 */

import type { WGPUDevice, WGPUBuffer, WGPUTexture } from './WebGPUTypes';
import { GPUBufferUsage, GPUMapMode } from './WebGPUTypes';

// ---------------------------------------------------------------------------
// Alignment constant
// ---------------------------------------------------------------------------

/**
 * WebGPU requires `bytesPerRow` in buffer copies to be a multiple of 256.
 */
const BYTES_PER_ROW_ALIGNMENT = 256;

/**
 * Bytes per pixel for rgba32float textures (4 channels * 4 bytes).
 */
const BYTES_PER_PIXEL_F32 = 16;

// ---------------------------------------------------------------------------
// WebGPUReadback
// ---------------------------------------------------------------------------

export class WebGPUReadback {
  /** Double-buffered readback buffers. */
  private buffers: [WGPUBuffer | null, WGPUBuffer | null] = [null, null];
  /** Sizes of the allocated buffers (in bytes). */
  private bufferSizes: [number, number] = [0, 0];
  /** Index of the buffer to use for the next readback (alternates 0/1). */
  private activeIndex = 0;
  /** Whether a buffer is currently being mapped (prevents concurrent use). */
  private mapping: [boolean, boolean] = [false, false];
  /** Whether this readback instance has been disposed. */
  private _disposed = false;

  /**
   * Read a single pixel from a render texture.
   *
   * @param device - GPU device
   * @param x - Pixel X coordinate
   * @param y - Pixel Y coordinate
   * @param renderTexture - Source texture (must have COPY_SRC usage)
   * @returns RGBA float tuple [r, g, b, a]
   */
  async readPixelFloat(
    device: WGPUDevice,
    x: number,
    y: number,
    renderTexture: WGPUTexture,
    bytesPerPixel: number = BYTES_PER_PIXEL_F32,
  ): Promise<[number, number, number, number]> {
    if (this._disposed) {
      throw new Error('WebGPUReadback: instance has been disposed');
    }
    if (x < 0 || y < 0) {
      throw new Error('WebGPUReadback: x and y must be non-negative');
    }
    const result = await this.readRegion(device, x, y, 1, 1, renderTexture, bytesPerPixel);
    return [result[0]!, result[1]!, result[2]!, result[3]!];
  }

  /**
   * Read a rectangular region of pixels from a render texture.
   *
   * @param device - GPU device
   * @param x - Region X origin
   * @param y - Region Y origin
   * @param width - Region width in pixels
   * @param height - Region height in pixels
   * @param renderTexture - Source texture (must have COPY_SRC usage)
   * @returns Float32Array of RGBA pixel data (width * height * 4 floats)
   */
  async readRegion(
    device: WGPUDevice,
    x: number,
    y: number,
    width: number,
    height: number,
    renderTexture: WGPUTexture,
    bytesPerPixel: number = BYTES_PER_PIXEL_F32,
  ): Promise<Float32Array> {
    if (this._disposed) {
      throw new Error('WebGPUReadback: instance has been disposed');
    }
    if (x < 0 || y < 0) {
      throw new Error('WebGPUReadback: x and y must be non-negative');
    }
    if (width <= 0 || height <= 0) {
      throw new Error('WebGPUReadback: width and height must be positive');
    }

    // Calculate aligned bytes per row
    const unalignedBytesPerRow = width * bytesPerPixel;
    const bytesPerRow = alignTo(unalignedBytesPerRow, BYTES_PER_ROW_ALIGNMENT);

    // Total buffer size needed
    const bufferSize = bytesPerRow * height;

    // Pick buffer index (double-buffer: alternate between 0 and 1)
    const bufIdx = this.activeIndex;
    this.activeIndex = 1 - this.activeIndex;

    // Ensure buffer is allocated and large enough
    const buffer = this.ensureBuffer(device, bufIdx, bufferSize);

    // Wait if this buffer is still being mapped from a previous read
    if (this.mapping[bufIdx]) {
      // In practice, callers should await previous reads before starting new ones.
      // This is a safety guard.
      throw new Error('WebGPUReadback: buffer is still mapped from a previous operation');
    }

    // Copy texture region to buffer
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: renderTexture, origin: { x, y } },
      { buffer, bytesPerRow },
      { width, height },
    );
    device.queue.submit([encoder.finish()]);

    // Map the buffer for reading
    this.mapping[bufIdx] = true;
    let mapSucceeded = false;
    try {
      await buffer.mapAsync(GPUMapMode.READ);
      mapSucceeded = true;

      const mappedRange = buffer.getMappedRange(0, bufferSize);

      // Copy data out, handling row alignment padding
      const pixelData = new Float32Array(width * height * 4);
      const dstFloatsPerRow = width * 4; // floats per unpadded row

      if (bytesPerPixel === BYTES_PER_PIXEL_F32) {
        // rgba32float: 4 bytes per float, 4 channels = 16 bytes/pixel
        const rawData = new Float32Array(mappedRange);
        const srcFloatsPerRow = bytesPerRow / 4;
        for (let row = 0; row < height; row++) {
          const srcOffset = row * srcFloatsPerRow;
          const dstOffset = row * dstFloatsPerRow;
          for (let i = 0; i < dstFloatsPerRow; i++) {
            pixelData[dstOffset + i] = rawData[srcOffset + i]!;
          }
        }
      } else {
        // rgba16float: 2 bytes per half-float, 4 channels = 8 bytes/pixel
        const rawData = new Uint16Array(mappedRange);
        const srcHalfsPerRow = bytesPerRow / 2;
        for (let row = 0; row < height; row++) {
          const srcOffset = row * srcHalfsPerRow;
          const dstOffset = row * dstFloatsPerRow;
          for (let i = 0; i < dstFloatsPerRow; i++) {
            pixelData[dstOffset + i] = float16ToFloat32(rawData[srcOffset + i]!);
          }
        }
      }

      return pixelData;
    } finally {
      if (mapSucceeded) {
        buffer.unmap();
      }
      if (!this._disposed) {
        this.mapping[bufIdx] = false;
      }
    }
  }

  /**
   * Release all GPU readback buffers.
   */
  dispose(): void {
    this._disposed = true;
    for (let i = 0; i < 2; i++) {
      const buf = this.buffers[i];
      if (buf) {
        buf.destroy();
        this.buffers[i] = null;
        this.bufferSizes[i] = 0;
      }
    }
    this.mapping = [false, false];
    this.activeIndex = 0;
  }

  // ─── Private ─────────────────────────────────────────────────────────

  /**
   * Ensure the readback buffer at the given index is allocated and large enough.
   * Destroys and reallocates if the existing buffer is too small.
   */
  private ensureBuffer(device: WGPUDevice, index: number, requiredSize: number): WGPUBuffer {
    const idx = index as 0 | 1;
    const existing = this.buffers[idx];

    if (existing && this.bufferSizes[idx] >= requiredSize) {
      return existing;
    }

    // Destroy old buffer if it exists
    if (existing) {
      existing.destroy();
    }

    // Allocate new buffer
    const buffer = device.createBuffer({
      size: requiredSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.buffers[idx] = buffer;
    this.bufferSizes[idx] = requiredSize;
    return buffer;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Align a value up to the given alignment boundary.
 */
export function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * Convert an IEEE 754 half-precision (float16) value to a float32 number.
 */
function float16ToFloat32(h: number): number {
  const sign = (h >>> 15) & 0x1;
  const exponent = (h >>> 10) & 0x1f;
  const mantissa = h & 0x3ff;

  if (exponent === 0) {
    // Subnormal or zero
    if (mantissa === 0) return sign ? -0 : 0;
    // Subnormal: value = (-1)^sign * 2^(-14) * (mantissa / 1024)
    return (sign ? -1 : 1) * Math.pow(2, -14) * (mantissa / 1024);
  }

  if (exponent === 0x1f) {
    // Inf or NaN
    return mantissa === 0 ? (sign ? -Infinity : Infinity) : NaN;
  }

  // Normalized: value = (-1)^sign * 2^(exponent-15) * (1 + mantissa/1024)
  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}
