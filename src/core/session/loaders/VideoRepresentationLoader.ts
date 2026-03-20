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
    const url = config.url ?? config.path;
    const path = config.path ?? file?.name ?? url ?? 'unknown';
    const fps = config.fps ?? 24;

    if (!file && !url) {
      throw new Error(`VideoRepresentationLoader: no file or url provided for "${path}"`);
    }

    const videoSourceNode = new VideoSourceNode(path);

    if (file) {
      await videoSourceNode.loadFile(file, fps, this._hdrResizeTier);
      // Populate url on the config so future serialization can restore
      // without the non-serializable File object.
      if (!config.url) {
        config.url = URL.createObjectURL(file);
      }
    } else {
      await videoSourceNode.load(url!, path, fps, this._hdrResizeTier);
    }

    this._sourceNode = videoSourceNode;

    const metadata = videoSourceNode.getMetadata();

    // Detect FPS and frame count from the video
    const [detectedFps, actualFrameCount] = await Promise.all([
      videoSourceNode.getDetectedFps(),
      videoSourceNode.getActualFrameCount(),
    ]);

    return {
      sourceNode: videoSourceNode,
      audioTrackPresent: true, // Videos typically have audio
      resolution: {
        width: metadata.width,
        height: metadata.height,
      },
      par: representation.par ?? 1.0,
      startFrame: representation.startFrame ?? 0,
      colorSpace: videoSourceNode.isHDR() ? { transferFunction: 'PQ', colorPrimaries: 'bt2020' } : undefined,
      duration: actualFrameCount > 0 ? actualFrameCount : undefined,
      fps: detectedFps ?? undefined,
    };
  }

  dispose(): void {
    if (this._sourceNode) {
      this._sourceNode.dispose();
      this._sourceNode = null;
    }
  }
}
