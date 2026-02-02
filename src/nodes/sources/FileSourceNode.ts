/**
 * FileSourceNode - Source node for single image files
 *
 * Loads and provides a single image as source data.
 * Supports standard web formats (PNG, JPEG, WebP) and HDR formats (EXR).
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';
import { decodeEXR, exrToIPImage, isEXRFile } from '../../formats/EXRDecoder';

/**
 * Check if a filename has an EXR extension
 */
function isEXRExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'exr' || ext === 'sxr';
}

@RegisterNode('RVFileSource')
export class FileSourceNode extends BaseSourceNode {
  private image: HTMLImageElement | null = null;
  private url: string = '';
  private cachedIPImage: IPImage | null = null;
  private isEXR: boolean = false;

  constructor(name?: string) {
    super('RVFileSource', name ?? 'File Source');

    // Define properties
    this.properties.add({ name: 'url', defaultValue: '' });
    this.properties.add({ name: 'width', defaultValue: 0 });
    this.properties.add({ name: 'height', defaultValue: 0 });
    this.properties.add({ name: 'originalUrl', defaultValue: '' });
    this.properties.add({ name: 'isHDR', defaultValue: false });
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

    // Standard image loading via HTMLImageElement
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.image = img;
        this.url = url;
        this.isEXR = false;
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
   * Load EXR file from ArrayBuffer
   */
  private async loadEXRFromBuffer(
    buffer: ArrayBuffer,
    name: string,
    url: string,
    originalUrl?: string
  ): Promise<void> {
    // Verify it's actually an EXR file
    if (!isEXRFile(buffer)) {
      throw new Error('Invalid EXR file: wrong magic number');
    }

    // Decode EXR
    const result = await decodeEXR(buffer);

    // Convert to IPImage
    this.cachedIPImage = exrToIPImage(result, originalUrl ?? url);
    this.cachedIPImage.metadata.frameNumber = 1;

    this.url = url;
    this.isEXR = true;
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

    this.markDirty();
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

    // Standard image loading
    const url = URL.createObjectURL(file);
    await this.load(url, file.name);
  }

  isReady(): boolean {
    // For EXR files, check if we have cached IPImage
    if (this.isEXR) {
      return this.cachedIPImage !== null;
    }
    return this.image !== null && this.image.complete;
  }

  /**
   * Check if this source contains HDR (float) data
   */
  isHDR(): boolean {
    return this.isEXR;
  }

  getElement(_frame: number): HTMLImageElement | null {
    return this.image;
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

    // For EXR files, the IPImage is already created during load
    if (this.isEXR) {
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
    this.isEXR = false;
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
      isHDR: this.isEXR,
    };
  }
}
