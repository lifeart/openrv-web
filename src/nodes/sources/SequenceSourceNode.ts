/**
 * SequenceSourceNode - Source node for image sequences
 *
 * Loads image sequences with frame-by-frame access and intelligent caching.
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';
import {
  SequenceInfo,
  SequenceFrame,
  createSequenceInfo,
  loadFrameImage,
  preloadFrames,
  releaseDistantFrames,
  disposeSequence,
} from '../../utils/SequenceLoader';

@RegisterNode('RVSequenceSource')
export class SequenceSourceNode extends BaseSourceNode {
  private sequenceInfo: SequenceInfo | null = null;
  private frames: SequenceFrame[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(name?: string) {
    super('RVSequenceSource', name ?? 'Sequence Source');

    // Properties
    this.properties.add({ name: 'pattern', defaultValue: '' });
    this.properties.add({ name: 'startFrame', defaultValue: 1 });
    this.properties.add({ name: 'endFrame', defaultValue: 1 });
    this.properties.add({ name: 'fps', defaultValue: 24 });

    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for sequence source canvas');
    }
    this.ctx = ctx;
  }

  /**
   * Load sequence from files
   */
  async loadFiles(files: File[], fps: number = 24): Promise<void> {
    const info = await createSequenceInfo(files, fps);
    if (!info) {
      throw new Error('No valid image sequence found');
    }

    this.sequenceInfo = info;
    this.frames = info.frames;

    this.metadata = {
      name: info.name,
      width: info.width,
      height: info.height,
      duration: info.frames.length,
      fps: info.fps,
    };

    this.canvas.width = info.width;
    this.canvas.height = info.height;

    this.properties.setValue('pattern', info.pattern);
    this.properties.setValue('startFrame', info.startFrame);
    this.properties.setValue('endFrame', info.endFrame);
    this.properties.setValue('fps', info.fps);

    this.markDirty();
  }

  isReady(): boolean {
    return this.sequenceInfo !== null && this.frames.length > 0;
  }

  getElement(frame: number): HTMLImageElement | null {
    const idx = frame - 1; // Convert 1-based to 0-based
    const frameData = this.frames[idx];
    return frameData?.image ?? null;
  }

  /**
   * Get frame image, loading if necessary
   */
  async getFrameImage(frame: number): Promise<HTMLImageElement | null> {
    const idx = frame - 1;
    const frameData = this.frames[idx];
    if (!frameData) return null;

    const image = await loadFrameImage(frameData);

    // Preload adjacent frames
    preloadFrames(this.frames, idx, 5);

    // Release distant frames
    releaseDistantFrames(this.frames, idx, 20);

    return image;
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    const idx = context.frame - 1;
    const frame = this.frames[idx];

    if (!frame?.image) {
      // Trigger async load (will be available next frame)
      this.getFrameImage(context.frame);
      return null;
    }

    this.ctx.drawImage(frame.image, 0, 0);
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    const ipImage = new IPImage({
      width: imageData.width,
      height: imageData.height,
      channels: 4,
      dataType: 'uint8',
      data: imageData.data.buffer.slice(0),
      metadata: {
        sourcePath: frame.file?.name,
        frameNumber: context.frame,
      },
    });

    return ipImage;
  }

  override dispose(): void {
    if (this.frames.length > 0) {
      disposeSequence(this.frames);
    }
    this.sequenceInfo = null;
    this.frames = [];
    super.dispose();
  }

  toJSON(): object {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      pattern: this.sequenceInfo?.pattern,
      metadata: this.metadata,
      properties: this.properties.toJSON(),
    };
  }
}
