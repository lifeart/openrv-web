export type DataType = 'uint8' | 'uint16' | 'float32';

export interface ImageMetadata {
  colorSpace?: string;
  frameNumber?: number;
  sourcePath?: string;
  pixelAspectRatio?: number;
  attributes?: Record<string, unknown>;
}

export interface IPImageOptions {
  width: number;
  height: number;
  channels: number;
  dataType: DataType;
  data?: ArrayBuffer;
  metadata?: ImageMetadata;
}

export class IPImage {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly dataType: DataType;
  readonly data: ArrayBuffer;
  readonly metadata: ImageMetadata;

  // WebGL texture handle (set by renderer)
  texture: WebGLTexture | null = null;
  textureNeedsUpdate = true;

  constructor(options: IPImageOptions) {
    this.width = options.width;
    this.height = options.height;
    this.channels = options.channels;
    this.dataType = options.dataType;
    this.metadata = options.metadata ?? {};

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
    switch (this.dataType) {
      case 'uint8':
        return new Uint8Array(this.data);
      case 'uint16':
        return new Uint16Array(this.data);
      case 'float32':
        return new Float32Array(this.data);
    }
  }

  getPixel(x: number, y: number): number[] {
    const arr = this.getTypedArray();
    const idx = (y * this.width + x) * this.channels;
    const pixel: number[] = [];

    for (let c = 0; c < this.channels; c++) {
      pixel.push(arr[idx + c] ?? 0);
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

  clone(): IPImage {
    return new IPImage({
      width: this.width,
      height: this.height,
      channels: this.channels,
      dataType: this.dataType,
      data: this.data.slice(0),
      metadata: { ...this.metadata },
    });
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
