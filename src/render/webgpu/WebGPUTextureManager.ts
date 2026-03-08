/**
 * WebGPUTextureManager - Centralized texture lifecycle management for WebGPU.
 *
 * Manages:
 * - Input image texture (create/resize/upload for SDR uint8 and HDR float32)
 * - VideoFrame and ImageBitmap upload via copyExternalImageToTexture
 * - 7 LUT texture slots: curves, falseColor, film, inline, file3D, look3D, display3D
 *
 * Format selection:
 * - SDR (uint8): rgba8unorm
 * - HDR (float32): rgba32float
 *
 * Tracks dirty state per texture and provides dispose() for cleanup.
 */

import type { WGPUDevice, WGPUTexture } from './WebGPUTypes';
import { GPUTextureUsage } from './WebGPUTypes';

// ---------------------------------------------------------------------------
// LUT slot identifiers
// ---------------------------------------------------------------------------

/** Named slots for the 7 LUT textures. */
export type LUTSlot = 'curves' | 'falseColor' | 'film' | 'inline' | 'file3D' | 'look3D' | 'display3D';

/** LUT slots that use 1D textures. */
const LUT_1D_SLOTS: ReadonlySet<LUTSlot> = new Set(['curves', 'falseColor', 'film', 'inline']);

/** LUT slots that use 3D textures (stored as 2D atlas). */
const LUT_3D_SLOTS: ReadonlySet<LUTSlot> = new Set(['file3D', 'look3D', 'display3D']);

// ---------------------------------------------------------------------------
// Dirty tracking
// ---------------------------------------------------------------------------

interface DirtyFlags {
  image: boolean;
  luts: Map<LUTSlot, boolean>;
}

// ---------------------------------------------------------------------------
// WebGPUTextureManager
// ---------------------------------------------------------------------------

export class WebGPUTextureManager {
  // --- Image texture ---
  private imageTexture: WGPUTexture | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private imageFormat: 'rgba8unorm' | 'rgba32float' = 'rgba8unorm';

  // --- LUT textures ---
  private lutTextures = new Map<LUTSlot, WGPUTexture>();

  // --- Dirty tracking ---
  private dirty: DirtyFlags = {
    image: false,
    luts: new Map(),
  };

  // ─── Image texture ─────────────────────────────────────────────────

  /**
   * Get the current image texture (may be null if nothing uploaded yet).
   */
  getImageTexture(): WGPUTexture | null {
    return this.imageTexture;
  }

  /**
   * Upload raw image data (Uint8Array for SDR, Float32Array for HDR).
   * Handles channel expansion to RGBA when channels < 4.
   */
  uploadImageData(
    device: WGPUDevice,
    data: Uint8Array | Float32Array,
    width: number,
    height: number,
    channels: number,
  ): WGPUTexture {
    if (channels < 1 || channels > 4) {
      throw new Error(`Invalid channel count: ${channels}. Expected 1-4.`);
    }
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid dimensions: ${width}x${height}. Width and height must be greater than 0.`);
    }
    if (data.length < width * height * channels) {
      throw new Error(
        `Data too short: got ${data.length} elements, expected at least ${width * height * channels} (${width}x${height}x${channels}).`,
      );
    }
    const isFloat = data instanceof Float32Array;
    const format = isFloat ? 'rgba32float' : 'rgba8unorm';

    // Expand to RGBA if needed
    let rgbaData: Uint8Array | Float32Array;
    if (channels === 4) {
      rgbaData = data;
    } else {
      rgbaData = this.expandToRGBA(data, width, height, channels, isFloat);
    }

    // Recreate texture if size or format changed
    if (!this.imageTexture || this.imageWidth !== width || this.imageHeight !== height || this.imageFormat !== format) {
      if (this.imageTexture) {
        this.imageTexture.destroy();
      }
      this.imageTexture = device.createTexture({
        size: { width, height },
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.imageWidth = width;
      this.imageHeight = height;
      this.imageFormat = format;
    }

    const bytesPerPixel = isFloat ? 16 : 4;
    device.queue.writeTexture(
      { texture: this.imageTexture },
      rgbaData,
      { bytesPerRow: width * bytesPerPixel, rowsPerImage: height },
      { width, height },
    );

    this.dirty.image = true;
    return this.imageTexture;
  }

  /**
   * Upload a VideoFrame to a GPU texture via copyExternalImageToTexture.
   * Uses display-p3 color space for HDR content.
   */
  uploadVideoFrame(device: WGPUDevice, frame: VideoFrame, width: number, height: number): WGPUTexture {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid dimensions: ${width}x${height}. Width and height must be greater than 0.`);
    }
    // Always recreate for VideoFrame since format may differ
    if (
      !this.imageTexture ||
      this.imageWidth !== width ||
      this.imageHeight !== height ||
      this.imageFormat !== 'rgba8unorm'
    ) {
      if (this.imageTexture) {
        this.imageTexture.destroy();
      }
      this.imageTexture = device.createTexture({
        size: { width, height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.imageWidth = width;
      this.imageHeight = height;
      this.imageFormat = 'rgba8unorm';
    }

    device.queue.copyExternalImageToTexture(
      { source: frame },
      { texture: this.imageTexture, colorSpace: 'display-p3' },
      { width, height },
    );

    this.dirty.image = true;
    return this.imageTexture;
  }

  /**
   * Upload an ImageBitmap to a GPU texture via copyExternalImageToTexture.
   */
  uploadImageBitmap(device: WGPUDevice, bitmap: ImageBitmap, width: number, height: number): WGPUTexture {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid dimensions: ${width}x${height}. Width and height must be greater than 0.`);
    }
    if (
      !this.imageTexture ||
      this.imageWidth !== width ||
      this.imageHeight !== height ||
      this.imageFormat !== 'rgba8unorm'
    ) {
      if (this.imageTexture) {
        this.imageTexture.destroy();
      }
      this.imageTexture = device.createTexture({
        size: { width, height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.imageWidth = width;
      this.imageHeight = height;
      this.imageFormat = 'rgba8unorm';
    }

    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: this.imageTexture }, { width, height });

    this.dirty.image = true;
    return this.imageTexture;
  }

  // ─── LUT textures ──────────────────────────────────────────────────

  /**
   * Upload a 1D LUT (curves, false color, film, or inline).
   * Data is expanded to RGBA if channels < 4.
   */
  upload1DLUT(
    device: WGPUDevice,
    slot: LUTSlot,
    data: Uint8Array | Float32Array,
    width: number,
    channels = 4,
  ): WGPUTexture {
    if (!LUT_1D_SLOTS.has(slot)) {
      throw new Error(`Invalid 1D LUT slot: ${slot}. Expected one of: ${[...LUT_1D_SLOTS].join(', ')}`);
    }
    if (width <= 0) {
      throw new Error(`Invalid 1D LUT width: ${width}. Width must be greater than 0.`);
    }

    // Destroy old texture
    const existing = this.lutTextures.get(slot);
    if (existing) {
      existing.destroy();
    }

    const isFloat = data instanceof Float32Array;
    const format = isFloat ? 'rgba32float' : 'rgba8unorm';
    const bytesPerPixel = isFloat ? 16 : 4;

    const texture = device.createTexture({
      size: { width, height: 1 },
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Expand to RGBA if needed
    let uploadData: Uint8Array | Float32Array = data;
    if (channels < 4) {
      uploadData = this.expandLUTToRGBA(data, width, channels, isFloat);
    }

    device.queue.writeTexture(
      { texture },
      uploadData,
      { bytesPerRow: width * bytesPerPixel, rowsPerImage: 1 },
      { width, height: 1 },
    );

    this.lutTextures.set(slot, texture);
    this.dirty.luts.set(slot, true);
    return texture;
  }

  /**
   * Upload a 3D LUT (file3D, look3D, or display3D).
   * 3D LUTs are stored as a 2D texture atlas (size*size x size).
   * Input data is assumed to be RGB (3 floats per entry), expanded to RGBA.
   */
  upload3DLUT(device: WGPUDevice, slot: LUTSlot, data: Float32Array, size: number): WGPUTexture {
    if (!LUT_3D_SLOTS.has(slot)) {
      throw new Error(`Invalid 3D LUT slot: ${slot}. Expected one of: ${[...LUT_3D_SLOTS].join(', ')}`);
    }
    if (size < 2) {
      throw new Error(`Invalid 3D LUT size: ${size}. Size must be at least 2.`);
    }
    const totalTexels = size * size * size;
    const isRGB = data.length === totalTexels * 3;
    const isRGBA = data.length === totalTexels * 4;
    if (!isRGB && !isRGBA) {
      throw new Error(
        `Invalid 3D LUT data length: got ${data.length} elements, expected ${totalTexels * 3} (RGB) or ${totalTexels * 4} (RGBA) for size=${size}.`,
      );
    }

    // Destroy old texture
    const existing = this.lutTextures.get(slot);
    if (existing) {
      existing.destroy();
    }

    const texture = device.createTexture({
      size: { width: size * size, height: size },
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    let rgba: Float32Array;
    if (isRGBA) {
      // RGBA data: copy directly
      rgba = new Float32Array(data);
    } else {
      // RGB data: expand to RGBA with alpha=1.0
      rgba = new Float32Array(totalTexels * 4);
      for (let i = 0; i < totalTexels; i++) {
        rgba[i * 4] = data[i * 3]!;
        rgba[i * 4 + 1] = data[i * 3 + 1]!;
        rgba[i * 4 + 2] = data[i * 3 + 2]!;
        rgba[i * 4 + 3] = 1.0;
      }
    }

    device.queue.writeTexture(
      { texture },
      rgba,
      { bytesPerRow: size * size * 16, rowsPerImage: size },
      { width: size * size, height: size },
    );

    this.lutTextures.set(slot, texture);
    this.dirty.luts.set(slot, true);
    return texture;
  }

  /**
   * Get a LUT texture by slot name.
   */
  getLUTTexture(slot: LUTSlot): WGPUTexture | null {
    return this.lutTextures.get(slot) ?? null;
  }

  // ─── Dirty state ───────────────────────────────────────────────────

  /** Whether the image texture has been updated since last query. */
  isImageDirty(): boolean {
    return this.dirty.image;
  }

  /** Whether a specific LUT slot has been updated since last query. */
  isLUTDirty(slot: LUTSlot): boolean {
    return this.dirty.luts.get(slot) ?? false;
  }

  /** Clear the image dirty flag. */
  clearImageDirty(): void {
    this.dirty.image = false;
  }

  /** Clear a specific LUT dirty flag. */
  clearLUTDirty(slot: LUTSlot): void {
    this.dirty.luts.set(slot, false);
  }

  /** Clear all dirty flags. */
  clearAllDirty(): void {
    this.dirty.image = false;
    for (const key of this.dirty.luts.keys()) {
      this.dirty.luts.set(key, false);
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────

  /**
   * Release all GPU texture resources.
   */
  dispose(): void {
    if (this.imageTexture) {
      this.imageTexture.destroy();
      this.imageTexture = null;
      this.imageWidth = 0;
      this.imageHeight = 0;
      this.imageFormat = 'rgba8unorm';
    }

    for (const tex of this.lutTextures.values()) {
      tex.destroy();
    }
    this.lutTextures.clear();

    this.dirty.image = false;
    this.dirty.luts.clear();
  }

  // ─── Private helpers ───────────────────────────────────────────────

  /**
   * Expand 1/2/3-channel image data to 4-channel RGBA.
   */
  private expandToRGBA(
    data: Uint8Array | Float32Array,
    width: number,
    height: number,
    channels: number,
    isFloat: boolean,
  ): Uint8Array | Float32Array {
    const pixelCount = width * height;
    const dst = isFloat ? new Float32Array(pixelCount * 4) : new Uint8Array(pixelCount * 4);
    const alpha = isFloat ? 1.0 : 255;

    for (let i = 0; i < pixelCount; i++) {
      const si = i * channels;
      const di = i * 4;
      const v0 = data[si] as number;

      if (channels === 1) {
        dst[di] = v0;
        dst[di + 1] = v0;
        dst[di + 2] = v0;
        dst[di + 3] = alpha;
      } else if (channels === 2) {
        dst[di] = v0;
        dst[di + 1] = v0;
        dst[di + 2] = v0;
        dst[di + 3] = data[si + 1] as number;
      } else if (channels === 3) {
        dst[di] = v0;
        dst[di + 1] = data[si + 1] as number;
        dst[di + 2] = data[si + 2] as number;
        dst[di + 3] = alpha;
      }
    }
    return dst;
  }

  /**
   * Expand 1D LUT data to RGBA.
   */
  private expandLUTToRGBA(
    data: Uint8Array | Float32Array,
    width: number,
    channels: number,
    isFloat: boolean,
  ): Uint8Array | Float32Array {
    const dst = isFloat ? new Float32Array(width * 4) : new Uint8Array(width * 4);
    const alpha = isFloat ? 1.0 : 255;

    for (let i = 0; i < width; i++) {
      const si = i * channels;
      const di = i * 4;

      for (let c = 0; c < channels; c++) {
        dst[di + c] = data[si + c] as number;
      }
      // Fill remaining channels
      for (let c = channels; c < 3; c++) {
        dst[di + c] = data[si] as number; // replicate first channel for missing G, B
      }
      dst[di + 3] = alpha;
    }
    return dst;
  }
}
