/**
 * SequenceRepresentationLoader
 *
 * Loads an image sequence representation using SequenceLoader utilities.
 * Returns a lightweight source node wrapper around the sequence frames.
 */

import type { RepresentationLoader, RepresentationLoadResult } from './RepresentationLoader';
import type { MediaRepresentation } from '../../types/representation';
import {
  createSequenceInfo,
} from '../../../utils/media/SequenceLoader';
import { BaseSourceNode } from '../../../nodes/sources/BaseSourceNode';
import type { SequenceInfo, SequenceFrame } from '../../../utils/media/SequenceLoader';
import type { IPImage } from '../../image/Image';
import type { EvalContext } from '../../graph/Graph';

/**
 * Lightweight source node wrapper for sequence data.
 * Holds the sequence info and frames so they can be accessed
 * through the BaseSourceNode interface.
 */
export class SequenceSourceNodeWrapper extends BaseSourceNode {
  private _sequenceInfo: SequenceInfo;
  private _frames: SequenceFrame[];

  constructor(sequenceInfo: SequenceInfo, frames: SequenceFrame[]) {
    super('SequenceSource', sequenceInfo.name);
    this._sequenceInfo = sequenceInfo;
    this._frames = frames;
    this.metadata = {
      name: sequenceInfo.name,
      width: sequenceInfo.width,
      height: sequenceInfo.height,
      duration: frames.length,
      fps: sequenceInfo.fps,
    };
  }

  get sequenceInfo(): SequenceInfo {
    return this._sequenceInfo;
  }

  get frames(): SequenceFrame[] {
    return this._frames;
  }

  isReady(): boolean {
    return this._frames.length > 0;
  }

  getElement(frame: number): HTMLImageElement | HTMLVideoElement | ImageBitmap | null {
    const idx = frame - 1; // 1-based to 0-based
    return this._frames[idx]?.image ?? null;
  }

  toJSON(): object {
    return {
      type: 'SequenceSource',
      name: this._sequenceInfo.name,
      pattern: this._sequenceInfo.pattern,
      frameCount: this._frames.length,
    };
  }

  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

export class SequenceRepresentationLoader implements RepresentationLoader {
  private _wrapper: SequenceSourceNodeWrapper | null = null;

  async load(representation: MediaRepresentation): Promise<RepresentationLoadResult> {
    const config = representation.loaderConfig;
    const files = config.files;
    const fps = config.fps ?? 24;

    if (!files || files.length === 0) {
      throw new Error('SequenceRepresentationLoader: no files provided');
    }

    const sequenceInfo = await createSequenceInfo(files, fps);
    if (!sequenceInfo) {
      throw new Error('No valid image sequence found in the provided files');
    }

    const wrapper = new SequenceSourceNodeWrapper(sequenceInfo, sequenceInfo.frames);
    this._wrapper = wrapper;

    return {
      sourceNode: wrapper,
      audioTrackPresent: false, // Image sequences never have audio
      resolution: {
        width: sequenceInfo.width,
        height: sequenceInfo.height,
      },
      par: representation.par ?? 1.0,
      startFrame: representation.startFrame ?? 0,
    };
  }

  dispose(): void {
    if (this._wrapper) {
      this._wrapper.dispose();
      this._wrapper = null;
    }
  }
}
