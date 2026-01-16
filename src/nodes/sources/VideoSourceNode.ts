/**
 * VideoSourceNode - Source node for video files
 *
 * Loads video files and provides frame-by-frame access.
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';

@RegisterNode('RVVideoSource')
export class VideoSourceNode extends BaseSourceNode {
  private video: HTMLVideoElement | null = null;
  private url: string = '';
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(name?: string) {
    super('RVVideoSource', name ?? 'Video Source');

    // Properties
    this.properties.add({ name: 'url', defaultValue: '' });
    this.properties.add({ name: 'duration', defaultValue: 0 });
    this.properties.add({ name: 'fps', defaultValue: 24 });

    // Create offscreen canvas for frame extraction
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Load video from URL
   */
  async load(url: string, name?: string, fps: number = 24): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;

      video.oncanplay = () => {
        video.oncanplay = null;

        this.video = video;
        this.url = url;

        const duration = Math.ceil(video.duration * fps);

        this.metadata = {
          name: name ?? url.split('/').pop() ?? 'video',
          width: video.videoWidth,
          height: video.videoHeight,
          duration,
          fps,
        };

        this.canvas.width = video.videoWidth;
        this.canvas.height = video.videoHeight;

        this.properties.setValue('url', url);
        this.properties.setValue('duration', duration);
        this.properties.setValue('fps', fps);

        this.markDirty();
        resolve();
      };

      video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
      video.src = url;
      video.load();
    });
  }

  /**
   * Load from File object
   */
  async loadFile(file: File, fps: number = 24): Promise<void> {
    const url = URL.createObjectURL(file);
    await this.load(url, file.name, fps);
  }

  /**
   * Set fps (recalculates duration)
   */
  setFps(fps: number): void {
    this.properties.setValue('fps', fps);
    if (this.video) {
      this.metadata.fps = fps;
      this.metadata.duration = Math.ceil(this.video.duration * fps);
      this.properties.setValue('duration', this.metadata.duration);
    }
  }

  isReady(): boolean {
    return this.video !== null && this.video.readyState >= 2;
  }

  getElement(_frame: number): HTMLVideoElement | null {
    return this.video;
  }

  /**
   * Seek video to frame
   */
  async seekToFrame(frame: number): Promise<void> {
    if (!this.video) return;

    const time = (frame - 1) / this.metadata.fps;
    if (Math.abs(this.video.currentTime - time) > 0.01) {
      this.video.currentTime = time;
      await new Promise<void>(resolve => {
        const onSeeked = () => {
          this.video!.removeEventListener('seeked', onSeeked);
          resolve();
        };
        this.video!.addEventListener('seeked', onSeeked);
      });
    }
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    if (!this.video || !this.isReady()) {
      return null;
    }

    // Seek to frame if needed
    const time = (context.frame - 1) / this.metadata.fps;
    if (Math.abs(this.video.currentTime - time) > 0.01) {
      this.video.currentTime = time;
    }

    // Draw current video frame to canvas
    this.ctx.drawImage(this.video, 0, 0);
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    const ipImage = new IPImage({
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

    return ipImage;
  }

  override dispose(): void {
    if (this.video) {
      this.video.pause();
      this.video.src = '';
    }
    if (this.url.startsWith('blob:')) {
      URL.revokeObjectURL(this.url);
    }
    this.video = null;
    super.dispose();
  }

  toJSON(): object {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      url: this.url,
      metadata: this.metadata,
      properties: this.properties.toJSON(),
    };
  }
}
