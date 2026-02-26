import { ManagedVideoFrame } from './ManagedVideoFrame';

export type DataType = 'uint8' | 'uint16' | 'float32';

export type TransferFunction = 'srgb' | 'hlg' | 'pq' | 'smpte240m';
export type ColorPrimaries = 'bt709' | 'bt2020' | 'p3';

export interface ImageMetadata {
  colorSpace?: string;
  frameNumber?: number;
  sourcePath?: string;
  pixelAspectRatio?: number;
  transferFunction?: TransferFunction;
  colorPrimaries?: ColorPrimaries;
  attributes?: Record<string, unknown>;
}

export interface IPImageOptions {
  width: number;
  height: number;
  channels: number;
  dataType: DataType;
  data?: ArrayBuffer;
  metadata?: ImageMetadata;
  videoFrame?: VideoFrame;
  managedVideoFrame?: ManagedVideoFrame;
  imageBitmap?: ImageBitmap | null;
}

export class IPImage {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly dataType: DataType;
  readonly data: ArrayBuffer;
  readonly metadata: ImageMetadata;

  /**
   * Managed VideoFrame for reference-counted VRAM cleanup.
   * @internal Prefer using the `videoFrame` getter/setter. Direct access is
   * allowed for performance-critical paths (e.g., Renderer texture upload)
   * but callers must maintain ref-counting invariants.
   */
  managedVideoFrame: ManagedVideoFrame | null;

  /** Raw VideoFrame accessor (reads from managed wrapper, setter auto-wraps) */
  get videoFrame(): VideoFrame | null {
    return this.managedVideoFrame?.frame ?? null;
  }

  set videoFrame(frame: VideoFrame | null) {
    if (this.managedVideoFrame) {
      this.managedVideoFrame.release();
      this.managedVideoFrame = null;
    }
    this.managedVideoFrame = frame ? ManagedVideoFrame.wrap(frame) : null;
  }

  /** Decoded ImageBitmap for zero-copy GPU upload (image sequences) */
  imageBitmap: ImageBitmap | null;

  // WebGL texture handle (set by renderer)
  texture: WebGLTexture | null = null;
  textureNeedsUpdate = true;

  // Cached TypedArray view over this.data to avoid re-creating on every getTypedArray() call
  private cachedTypedArray: Uint8Array | Uint16Array | Float32Array | null = null;

  constructor(options: IPImageOptions) {
    this.width = options.width;
    this.height = options.height;
    this.channels = options.channels;
    this.dataType = options.dataType;
    this.metadata = options.metadata ?? {};
    this.imageBitmap = options.imageBitmap ?? null;

    if (options.managedVideoFrame) {
      this.managedVideoFrame = options.managedVideoFrame;
    } else if (options.videoFrame) {
      // Legacy path: wrap raw VideoFrame automatically
      this.managedVideoFrame = ManagedVideoFrame.wrap(options.videoFrame);
    } else {
      this.managedVideoFrame = null;
    }

    if (options.data) {
      this.data = options.data;
    } else {
      const bytesPerPixel = this.getBytesPerComponent() * this.channels;
      this.data = new ArrayBuffer(this.width * this.height * bytesPerPixel);
    }
  }

  getBytesPerComponent(): number {
    switch (this.dataType) {
      case 'uint8':
        return 1;
      case 'uint16':
        return 2;
      case 'float32':
        return 4;
    }
  }

  getTypedArray(): Uint8Array | Uint16Array | Float32Array {
    if (this.cachedTypedArray !== null) {
      return this.cachedTypedArray;
    }

    switch (this.dataType) {
      case 'uint8':
        this.cachedTypedArray = new Uint8Array(this.data);
        break;
      case 'uint16':
        this.cachedTypedArray = new Uint16Array(this.data);
        break;
      case 'float32':
        this.cachedTypedArray = new Float32Array(this.data);
        break;
    }

    return this.cachedTypedArray;
  }

  getPixel(x: number, y: number, out?: number[]): number[] {
    const arr = this.getTypedArray();
    const idx = (y * this.width + x) * this.channels;
    const channels = this.channels;

    if (out) {
      // Reuse caller-provided buffer to avoid allocation
      for (let c = 0; c < channels; c++) {
        out[c] = arr[idx + c] ?? 0;
      }
      out.length = channels;
      return out;
    }

    const pixel = new Array<number>(channels);
    for (let c = 0; c < channels; c++) {
      pixel[c] = arr[idx + c] ?? 0;
    }
    return pixel;
  }

  setPixel(x: number, y: number, values: number[]): void {
    const arr = this.getTypedArray();
    const idx = (y * this.width + x) * this.channels;

    for (let c = 0; c < this.channels && c < values.length; c++) {
      arr[idx + c] = values[c] ?? 0;
    }

    this.textureNeedsUpdate = true;
  }

  /**
   * Release the VideoFrame if present. Must be called when the image
   * is no longer needed to avoid VRAM leaks.
   *
   * **WARNING:** VideoFrame objects hold GPU memory (VRAM) that is **not**
   * released by JavaScript garbage collection. If you forget to call
   * `close()`, the GPU memory remains allocated until the page is unloaded,
   * which can quickly exhaust VRAM when processing many frames.
   *
   * This method is safe to call multiple times; subsequent calls are no-ops.
   *
   * @example
   * ```ts
   * const image = new IPImage({
   *   width: 1920,
   *   height: 1080,
   *   channels: 4,
   *   dataType: 'uint8',
   *   videoFrame: someVideoFrame,
   *   // or imageBitmap: someBitmap
   * });
   *
   * try {
   *   // ... use image for rendering ...
   * } finally {
   *   image.close(); // Always release GPU memory
   * }
   * ```
   */
  close(): void {
    if (this.managedVideoFrame) {
      this.managedVideoFrame.release();
      this.managedVideoFrame = null;
    }
    if (this.imageBitmap) {
      try {
        this.imageBitmap.close();
      } catch {
        // Already closed
      }
      this.imageBitmap = null;
    }
  }

  /**
   * Create a lightweight clone that shares the same underlying ArrayBuffer
   * (no data copy) but has independent metadata.
   *
   * This is the default because most callers only need different metadata
   * with the same pixel data, and copying pixel buffers for large images
   * (e.g. 4K HDR float32 at ~141 MB) is expensive.
   *
   * **Important constraints:**
   * - The pixel data is **shared**: writing to one image's typed array
   *   will be visible in the other. Only use this when the data will be
   *   treated as read-only.
   * - `videoFrame` is **not** copied because VideoFrame is a GPU resource
   *   that cannot be safely shared between IPImage instances.
   * - `texture` and `textureNeedsUpdate` are **not** copied because they
   *   are renderer-specific state.
   *
   * If you need an independent copy of the pixel data, use {@link deepClone}.
   */
  clone(): IPImage {
    return new IPImage({
      width: this.width,
      height: this.height,
      channels: this.channels,
      dataType: this.dataType,
      data: this.data,
      metadata: { ...this.metadata },
      imageBitmap: this.imageBitmap,
    });
  }

  /**
   * Create a full deep clone with an independent copy of the pixel data.
   *
   * Use this when you need to mutate the pixel data of the clone without
   * affecting the original image.
   *
   * `videoFrame` is **not** copied because VideoFrame is a GPU resource
   * that cannot be safely shared between IPImage instances.
   */
  deepClone(): IPImage {
    return new IPImage({
      width: this.width,
      height: this.height,
      channels: this.channels,
      dataType: this.dataType,
      data: this.data.slice(0),
      metadata: { ...this.metadata },
    });
  }

  /**
   * @deprecated Use {@link clone} instead, which now defaults to shallow (metadata-only) cloning.
   */
  cloneMetadataOnly(): IPImage {
    return this.clone();
  }

  static fromImageData(imageData: ImageData): IPImage {
    return new IPImage({
      width: imageData.width,
      height: imageData.height,
      channels: 4,
      dataType: 'uint8',
      data: imageData.data.buffer.slice(0),
    });
  }

  static createEmpty(width: number, height: number, channels = 4, dataType: DataType = 'uint8'): IPImage {
    return new IPImage({
      width,
      height,
      channels,
      dataType,
    });
  }
}
