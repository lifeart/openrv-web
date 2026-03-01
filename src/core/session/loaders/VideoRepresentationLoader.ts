/**
 * VideoRepresentationLoader
 *
 * Loads a video representation using VideoSourceNode.
 * Supports mediabunny (WebCodecs) and HTML video fallback.
 */

import type { RepresentationLoader, RepresentationLoadResult } from './RepresentationLoader';
import type { MediaRepresentation } from '../../types/representation';
import { VideoSourceNode } from '../../../nodes/sources/VideoSourceNode';
import type { HDRResizeTier } from '../../../utils/media/HDRFrameResizer';

export class VideoRepresentationLoader implements RepresentationLoader {
  private _sourceNode: VideoSourceNode | null = null;
  private _hdrResizeTier: HDRResizeTier;

  constructor(hdrResizeTier: HDRResizeTier = 'none') {
    this._hdrResizeTier = hdrResizeTier;
  }

  async load(representation: MediaRepresentation): Promise<RepresentationLoadResult> {
    const config = representation.loaderConfig;
    const file = config.file;
    const path = config.path ?? file?.name ?? 'unknown';
    const fps = config.fps ?? 24;

    if (!file) {
      throw new Error(`VideoRepresentationLoader: no file provided for "${path}"`);
    }

    const videoSourceNode = new VideoSourceNode(path);
    await videoSourceNode.loadFile(file, fps, this._hdrResizeTier);

    this._sourceNode = videoSourceNode;

    const metadata = videoSourceNode.getMetadata();

    return {
      sourceNode: videoSourceNode,
      audioTrackPresent: true, // Videos typically have audio
      resolution: {
        width: metadata.width,
        height: metadata.height,
      },
      par: representation.par ?? 1.0,
      startFrame: representation.startFrame ?? 0,
      colorSpace: videoSourceNode.isHDR()
        ? { transferFunction: 'PQ', colorPrimaries: 'bt2020' }
        : undefined,
    };
  }

  dispose(): void {
    if (this._sourceNode) {
      this._sourceNode.dispose();
      this._sourceNode = null;
    }
  }
}
