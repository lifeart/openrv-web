/**
 * SequenceSourceNode - Source node for image sequences
 *
 * Loads image sequences with frame-by-frame access and intelligent caching.
 */

import { Logger } from '../../utils/Logger';
import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';
import {
  SequenceInfo,
  SequenceFrame,
  createSequenceInfo,
  loadFrameImage,
  disposeSequence,
} from '../../utils/media/SequenceLoader';
import { FramePreloadManager } from '../../utils/media/FramePreloadManager';

const log = new Logger('SequenceSourceNode');

@RegisterNode('RVSequenceSource')
export class SequenceSourceNode extends BaseSourceNode {
  private sequenceInfo: SequenceInfo | null = null;
  private frames: SequenceFrame[] = [];
  private preloadManager: FramePreloadManager<ImageBitmap> | null = null;
  private playbackDirection: number = 1;
  private isPlaybackActive: boolean = false;

  constructor(name?: string) {
    super('RVSequenceSource', name ?? 'Sequence Source');

    // Properties
    this.properties.add({ name: 'pattern', defaultValue: '' });
    this.properties.add({ name: 'startFrame', defaultValue: 1 });
    this.properties.add({ name: 'endFrame', defaultValue: 1 });
    this.properties.add({ name: 'fps', defaultValue: 24 });
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

    this.properties.setValue('pattern', info.pattern);
    this.properties.setValue('startFrame', info.startFrame);
    this.properties.setValue('endFrame', info.endFrame);
    this.properties.setValue('fps', info.fps);

    this.initPreloadManager();

    this.markDirty();
  }

  private initPreloadManager(): void {
    this.preloadManager?.dispose();

    const totalFrames = this.frames.length;

    const loader = async (frame: number, signal?: AbortSignal): Promise<ImageBitmap | null> => {
      const idx = frame - 1;
      const frameData = this.frames[idx];
      if (!frameData) return null;
      return loadFrameImage(frameData, signal);
    };

    const disposer = (frame: number, data: ImageBitmap): void => {
      const idx = frame - 1;
      const frameData = this.frames[idx];
      if (frameData) {
        if (frameData.image) {
          frameData.image.close();
          frameData.image = undefined;
        }
        if (frameData.url) {
          URL.revokeObjectURL(frameData.url);
          frameData.url = undefined;
        }
      }
      if (data && typeof data.close === 'function') {
        try { data.close(); } catch (e) { log.debug('Resource close failed:', e); }
      }
    };

    this.preloadManager = new FramePreloadManager<ImageBitmap>(
      totalFrames,
      loader,
      disposer,
    );
  }

  isReady(): boolean {
    return this.sequenceInfo !== null && this.frames.length > 0;
  }

  getElement(frame: number): ImageBitmap | null {
    if (this.preloadManager) {
      return this.preloadManager.getCachedFrame(frame);
    }
    const idx = frame - 1;
    const frameData = this.frames[idx];
    return frameData?.image ?? null;
  }

  /**
   * Get frame image, loading if necessary
   */
  async getFrameImage(frame: number): Promise<ImageBitmap | null> {
    if (this.preloadManager) {
      const image = await this.preloadManager.getFrame(frame);
      this.preloadManager.preloadAround(frame);
      return image;
    }

    // Fallback when no preload manager (before loadFiles)
    const idx = frame - 1;
    const frameData = this.frames[idx];
    if (!frameData) return null;
    return loadFrameImage(frameData);
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    const idx = context.frame - 1;
    const frameData = this.frames[idx];

    // Cache-first: check preload manager, then fall back to frame data
    const image = this.preloadManager?.getCachedFrame(context.frame) ?? frameData?.image;

    if (!image) {
      // Trigger async load (will be available next frame)
      this.getFrameImage(context.frame);
      return null;
    }

    const ipImage = new IPImage({
      width: image.width,
      height: image.height,
      channels: 4,
      dataType: 'uint8',
      imageBitmap: image,
      metadata: {
        sourcePath: frameData?.file?.name,
        frameNumber: context.frame,
      },
    });

    return ipImage;
  }

  /**
   * Set playback direction for optimized preloading
   */
  setPlaybackDirection(direction: number): void {
    this.playbackDirection = direction >= 0 ? 1 : -1;
    if (this.isPlaybackActive && this.preloadManager) {
      this.preloadManager.setPlaybackState(true, this.playbackDirection);
    }
  }

  /**
   * Set playback active state.
   * When active, preloading prioritizes frames ahead in playback direction.
   * When inactive (scrubbing), preloading uses symmetric window.
   */
  setPlaybackActive(isActive: boolean): void {
    this.isPlaybackActive = isActive;
    this.preloadManager?.setPlaybackState(isActive, this.playbackDirection);
  }

  /**
   * Update playback buffer around current frame
   */
  updatePlaybackBuffer(currentFrame: number): void {
    this.preloadManager?.preloadAround(currentFrame);
  }

  override dispose(): void {
    if (this.preloadManager) {
      this.preloadManager.dispose();
      this.preloadManager = null;
    }
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
