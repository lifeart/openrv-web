/**
 * FileSourceNode - Source node for single image files
 *
 * Loads and provides a single image as source data.
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';

@RegisterNode('RVFileSource')
export class FileSourceNode extends BaseSourceNode {
  private image: HTMLImageElement | null = null;
  private url: string = '';
  private cachedIPImage: IPImage | null = null;

  constructor(name?: string) {
    super('RVFileSource', name ?? 'File Source');

    // Define properties
    this.properties.add({ name: 'url', defaultValue: '' });
    this.properties.add({ name: 'width', defaultValue: 0 });
    this.properties.add({ name: 'height', defaultValue: 0 });
    this.properties.add({ name: 'originalUrl', defaultValue: '' });
  }

  /**
   * Load image from URL
   */
  async load(url: string, name?: string, originalUrl?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.image = img;
        this.url = url;
        this.metadata = {
          name: name ?? url.split('/').pop() ?? 'image',
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

        this.markDirty();
        this.cachedIPImage = null;
        resolve();
      };

      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  /**
   * Load from File object
   */
  async loadFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    // Use file.name as fallback, but ideally we don't have full path here
    await this.load(url, file.name);
  }

  isReady(): boolean {
    return this.image !== null && this.image.complete;
  }

  getElement(_frame: number): HTMLImageElement | null {
    return this.image;
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    if (!this.image || !this.isReady()) {
      return null;
    }

    // Return cached if valid and not dirty
    if (this.cachedIPImage && !this.dirty) {
      return this.cachedIPImage;
    }

    // Create IPImage from canvas
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
    };
  }
}
