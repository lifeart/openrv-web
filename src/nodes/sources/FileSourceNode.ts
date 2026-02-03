/**
 * FileSourceNode - Source node for single image files
 *
 * Loads and provides a single image as source data.
 * Supports standard web formats (PNG, JPEG, WebP) and HDR formats (EXR, DPX, Cineon, Float TIFF).
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage, ImageMetadata } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';
import {
  decodeEXR,
  exrToIPImage,
  isEXRFile,
  EXRLayerInfo,
  EXRDecodeOptions,
  EXRChannelRemapping,
} from '../../formats/EXRDecoder';
import { isDPXFile, decodeDPX } from '../../formats/DPXDecoder';
import { isCineonFile, decodeCineon } from '../../formats/CineonDecoder';
import { isTIFFFile, isFloatTIFF, decodeTIFFFloat } from '../../formats/TIFFFloatDecoder';

/**
 * Check if a filename has an EXR extension
 */
function isEXRExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'exr' || ext === 'sxr';
}

/**
 * Check if a filename has a DPX extension
 */
function isDPXExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'dpx';
}

/**
 * Check if a filename has a Cineon extension
 */
function isCineonExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'cin' || ext === 'cineon';
}

/**
 * Check if a filename has a TIFF extension
 */
function isTIFFExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'tiff' || ext === 'tif';
}

@RegisterNode('RVFileSource')
export class FileSourceNode extends BaseSourceNode {
  private image: HTMLImageElement | null = null;
  private url: string = '';
  private cachedIPImage: IPImage | null = null;
  private isEXR: boolean = false;
  private _isHDRFormat: boolean = false;
  private _formatName: string | null = null;

  // EXR layer support
  private exrBuffer: ArrayBuffer | null = null;
  private exrLayers: EXRLayerInfo[] = [];
  private currentExrLayer: string | null = null;
  private currentExrRemapping: EXRChannelRemapping | null = null;

  // Canvas cache for HDR rendering (avoids creating new canvas on every getCanvas() call)
  private cachedCanvas: HTMLCanvasElement | null = null;
  private canvasDirty: boolean = true;

  constructor(name?: string) {
    super('RVFileSource', name ?? 'File Source');

    // Define properties
    this.properties.add({ name: 'url', defaultValue: '' });
    this.properties.add({ name: 'width', defaultValue: 0 });
    this.properties.add({ name: 'height', defaultValue: 0 });
    this.properties.add({ name: 'originalUrl', defaultValue: '' });
    this.properties.add({ name: 'isHDR', defaultValue: false });
    this.properties.add({ name: 'exrLayer', defaultValue: null });
  }

  /**
   * Get the detected format name for this source
   */
  get formatName(): string | null {
    return this._formatName;
  }

  /**
   * Load image from URL
   */
  async load(url: string, name?: string, originalUrl?: string): Promise<void> {
    const filename = name ?? url.split('/').pop() ?? 'image';

    // Check if this is an EXR file
    if (isEXRExtension(filename)) {
      await this.loadEXRFromUrl(url, filename, originalUrl);
      return;
    }

    // Check if this is a DPX or Cineon file (always HDR)
    if (isDPXExtension(filename) || isCineonExtension(filename)) {
      await this.loadHDRFromUrl(url, filename, originalUrl);
      return;
    }

    // Check if this is a TIFF file - need to fetch and check if it's float
    if (isTIFFExtension(filename)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          if (isTIFFFile(buffer) && isFloatTIFF(buffer)) {
            await this.loadHDRFromBuffer(buffer, filename, url, originalUrl);
            return;
          }
        }
        // Non-float TIFF or fetch failed - fall through to standard image loading
      } catch {
        // Fall through to standard image loading
      }
    }

    // Standard image loading via HTMLImageElement
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.image = img;
        this.url = url;
        this.isEXR = false;
        this._isHDRFormat = false;
        this._formatName = null;
        this.metadata = {
          name: filename,
          width: img.naturalWidth,
          height: img.naturalHeight,
          duration: 1,
          fps: 24,
        };

        this.properties.setValue('url', url);
        // store original url if provided (for file system path preservation)
        if (originalUrl) {
          this.properties.setValue('originalUrl', originalUrl);
        }
        this.properties.setValue('width', img.naturalWidth);
        this.properties.setValue('height', img.naturalHeight);
        this.properties.setValue('isHDR', false);

        this.markDirty();
        this.cachedIPImage = null;
        resolve();
      };

      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  /**
   * Load EXR file from URL
   */
  private async loadEXRFromUrl(url: string, name: string, originalUrl?: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch EXR file: ${url}`);
    }

    const buffer = await response.arrayBuffer();
    await this.loadEXRFromBuffer(buffer, name, url, originalUrl);
  }

  /**
   * Load HDR format file (DPX, Cineon, Float TIFF) from URL
   */
  private async loadHDRFromUrl(url: string, name: string, originalUrl?: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch HDR file: ${url}`);
    }

    const buffer = await response.arrayBuffer();
    await this.loadHDRFromBuffer(buffer, name, url, originalUrl);
  }

  /**
   * Get the width of the loaded image
   */
  get width(): number {
    return this.metadata.width;
  }

  /**
   * Get the height of the loaded image
   */
  get height(): number {
    return this.metadata.height;
  }

  /**
   * Load EXR file from ArrayBuffer (public wrapper)
   */
  async loadFromEXR(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string,
    options?: EXRDecodeOptions
  ): Promise<void> {
    return this.loadEXRFromBuffer(buffer, name, url, originalUrl, options);
  }

  /**
   * Load EXR file from ArrayBuffer
   */
  private async loadEXRFromBuffer(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string,
    options?: EXRDecodeOptions
  ): Promise<void> {
    // Verify it's actually an EXR file
    if (!isEXRFile(buffer)) {
      throw new Error('Invalid EXR file: wrong magic number');
    }

    // Store the buffer for potential re-decoding with different layers
    this.exrBuffer = buffer;

    // Decode EXR with optional layer selection
    const result = await decodeEXR(buffer, options);

    // Store layer information
    this.exrLayers = result.layers ?? [];
    this.currentExrLayer = options?.layer ?? null;
    this.currentExrRemapping = options?.channelRemapping ?? null;

    // Convert to IPImage
    this.cachedIPImage = exrToIPImage(result, originalUrl ?? url);
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = true;
    this._isHDRFormat = true;
    this._formatName = 'exr';
    this.image = null; // No HTMLImageElement for EXR

    this.metadata = {
      name,
      width: result.width,
      height: result.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', result.width);
    this.properties.setValue('height', result.height);
    this.properties.setValue('isHDR', true);
    this.properties.setValue('exrLayer', options?.layer ?? null);

    // Mark canvas as dirty so it gets re-rendered on next getCanvas() call
    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Load HDR format file (DPX, Cineon, Float TIFF) from ArrayBuffer
   */
  private async loadHDRFromBuffer(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    let decodeResult: {
      width: number;
      height: number;
      data: Float32Array;
      channels: number;
      colorSpace: string;
      metadata: Record<string, unknown>;
    };
    let formatName: string;

    // Detect format by magic number
    if (isDPXFile(buffer)) {
      const result = await decodeDPX(buffer, { applyLogToLinear: true });
      decodeResult = result;
      formatName = 'dpx';
    } else if (isCineonFile(buffer)) {
      const result = await decodeCineon(buffer, { applyLogToLinear: true });
      decodeResult = result;
      formatName = 'cineon';
    } else if (isTIFFFile(buffer) && isFloatTIFF(buffer)) {
      const result = await decodeTIFFFloat(buffer);
      decodeResult = result;
      formatName = 'tiff';
    } else {
      throw new Error('Unsupported HDR format or invalid file');
    }

    // Convert decode result to IPImage
    const metadata: ImageMetadata = {
      colorSpace: decodeResult.colorSpace,
      sourcePath: originalUrl ?? url,
      attributes: {
        ...(decodeResult.metadata as Record<string, unknown>),
        formatName,
      },
    };

    this.cachedIPImage = new IPImage({
      width: decodeResult.width,
      height: decodeResult.height,
      channels: decodeResult.channels,
      dataType: 'float32',
      data: decodeResult.data.buffer as ArrayBuffer,
      metadata,
    });
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = false;
    this._isHDRFormat = true;
    this._formatName = formatName;
    this.image = null;

    this.metadata = {
      name,
      width: decodeResult.width,
      height: decodeResult.height,
      duration: 1,
      fps: 24,
    };

    this.properties.setValue('url', url);
    if (originalUrl) {
      this.properties.setValue('originalUrl', originalUrl);
    }
    this.properties.setValue('width', decodeResult.width);
    this.properties.setValue('height', decodeResult.height);
    this.properties.setValue('isHDR', true);

    // Mark canvas as dirty so it gets re-rendered on next getCanvas() call
    this.canvasDirty = true;
    this.markDirty();
  }

  /**
   * Get available EXR layers (only valid for EXR files)
   */
  getEXRLayers(): EXRLayerInfo[] {
    return this.exrLayers;
  }

  /**
   * Get the currently selected EXR layer
   */
  getCurrentEXRLayer(): string | null {
    return this.currentExrLayer;
  }

  /**
   * Set the EXR layer to display (reloads the EXR with the new layer)
   * Returns true if the layer was changed, false if already selected or not an EXR
   */
  async setEXRLayer(layerName: string | null, remapping?: EXRChannelRemapping): Promise<boolean> {
    if (!this.isEXR || !this.exrBuffer) {
      return false;
    }

    // Check if we're actually changing anything
    const sameLayer = this.currentExrLayer === layerName;
    const sameRemapping = JSON.stringify(this.currentExrRemapping) === JSON.stringify(remapping ?? null);
    if (sameLayer && sameRemapping) {
      return false;
    }

    // Re-decode with the new layer/remapping
    const options: EXRDecodeOptions = {};
    if (layerName && layerName !== 'RGBA') {
      options.layer = layerName;
    }
    if (remapping) {
      options.channelRemapping = remapping;
    }

    await this.loadEXRFromBuffer(
      this.exrBuffer,
      this.metadata.name,
      this.url,
      this.properties.getValue<string>('originalUrl') || undefined,
      Object.keys(options).length > 0 ? options : undefined
    );

    return true;
  }

  /**
   * Load from File object
   */
  async loadFile(file: File): Promise<void> {
    // Check if this is an EXR file
    if (isEXRExtension(file.name)) {
      const buffer = await file.arrayBuffer();
      const url = URL.createObjectURL(file);
      await this.loadEXRFromBuffer(buffer, file.name, url);
      return;
    }

    // Check if this is a DPX or Cineon file (always HDR)
    if (isDPXExtension(file.name) || isCineonExtension(file.name)) {
      const buffer = await file.arrayBuffer();
      const url = URL.createObjectURL(file);
      await this.loadHDRFromBuffer(buffer, file.name, url);
      return;
    }

    // Check if this is a TIFF file - only use HDR path for float TIFFs
    if (isTIFFExtension(file.name)) {
      const buffer = await file.arrayBuffer();
      if (isTIFFFile(buffer) && isFloatTIFF(buffer)) {
        const url = URL.createObjectURL(file);
        await this.loadHDRFromBuffer(buffer, file.name, url);
        return;
      }
      // Non-float TIFF - fall through to standard image loading (no URL leak)
    }

    // Standard image loading
    const url = URL.createObjectURL(file);
    await this.load(url, file.name);
  }

  isReady(): boolean {
    // For HDR files (EXR, DPX, Cineon, Float TIFF), check if we have cached IPImage
    if (this._isHDRFormat || this.isEXR) {
      return this.cachedIPImage !== null;
    }
    return this.image !== null && this.image.complete;
  }

  /**
   * Check if this source contains HDR (float) data
   */
  isHDR(): boolean {
    return this._isHDRFormat || this.isEXR;
  }

  getElement(_frame: number): HTMLImageElement | null {
    return this.image;
  }

  /**
   * Get a canvas containing the rendered image data
   * This is used for HDR files where there's no HTMLImageElement.
   * The canvas is cached and only re-rendered when the image data changes.
   */
  getCanvas(): HTMLCanvasElement | null {
    if (!this.cachedIPImage) {
      return null;
    }

    // Return cached canvas if still valid
    if (this.cachedCanvas && !this.canvasDirty) {
      return this.cachedCanvas;
    }

    // Create or reuse canvas
    if (!this.cachedCanvas) {
      this.cachedCanvas = document.createElement('canvas');
    }

    const canvas = this.cachedCanvas;

    // Resize canvas if dimensions changed
    if (canvas.width !== this.cachedIPImage.width || canvas.height !== this.cachedIPImage.height) {
      canvas.width = this.cachedIPImage.width;
      canvas.height = this.cachedIPImage.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const sourceData = this.cachedIPImage.getTypedArray();
    const destData = imageData.data;

    // Convert IPImage data to ImageData
    if (this.cachedIPImage.dataType === 'uint8') {
      // Direct copy for uint8 data
      destData.set(sourceData);
    } else if (this.cachedIPImage.dataType === 'float32') {
      // Tone map float32 to uint8 (simple clamp for now)
      const floatData = sourceData as Float32Array;
      for (let i = 0; i < floatData.length; i++) {
        // Apply simple exposure and gamma for display
        const value = floatData[i] ?? 0;
        const linear = Math.max(0, Math.min(1, value));
        const gamma = Math.pow(linear, 1 / 2.2);
        destData[i] = Math.round(gamma * 255);
      }
    } else {
      // uint16 - normalize to 0-255
      const uint16Data = sourceData as Uint16Array;
      for (let i = 0; i < uint16Data.length; i++) {
        const value = uint16Data[i] ?? 0;
        destData[i] = Math.round((value / 65535) * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.canvasDirty = false;
    return canvas;
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    if (!this.isReady()) {
      return null;
    }

    // Return cached if valid and not dirty
    if (this.cachedIPImage && !this.dirty) {
      // Update frame number in metadata
      if (this.cachedIPImage.metadata.frameNumber !== context.frame) {
        this.cachedIPImage.metadata.frameNumber = context.frame;
      }
      return this.cachedIPImage;
    }

    // For HDR files, the IPImage is already created during load
    if (this._isHDRFormat || this.isEXR) {
      return this.cachedIPImage;
    }

    // Create IPImage from canvas for standard images
    if (!this.image) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.image.naturalWidth;
    canvas.height = this.image.naturalHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    ctx.drawImage(this.image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    this.cachedIPImage = new IPImage({
      width: imageData.width,
      height: imageData.height,
      channels: 4,
      dataType: 'uint8',
      data: imageData.data.buffer.slice(0),
      metadata: {
        sourcePath: this.url,
        frameNumber: context.frame,
      },
    });

    return this.cachedIPImage;
  }

  override dispose(): void {
    if (this.url.startsWith('blob:')) {
      URL.revokeObjectURL(this.url);
    }
    this.image = null;
    this.cachedIPImage = null;
    this.exrBuffer = null;
    this.exrLayers = [];
    this.isEXR = false;
    this._isHDRFormat = false;
    this._formatName = null;
    // Clean up cached canvas
    this.cachedCanvas = null;
    this.canvasDirty = true;
    super.dispose();
  }

  toJSON(): object {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      // Prefer originalUrl for export if available (preserves file system path)
      url: this.properties.getValue<string>('originalUrl') || this.url,
      metadata: this.metadata,
      properties: this.properties.toJSON(),
      isHDR: this._isHDRFormat || this.isEXR,
    };
  }
}
