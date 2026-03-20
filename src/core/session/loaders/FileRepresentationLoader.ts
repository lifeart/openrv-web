/**
 * FileRepresentationLoader
 *
 * Loads a single-image representation using FileSourceNode.
 * Supports EXR, DPX, TIFF, JPEG gainmap, and standard image formats.
 */

import type { RepresentationLoader, RepresentationLoadResult } from './RepresentationLoader';
import type { MediaRepresentation } from '../../types/representation';
import { FileSourceNode } from '../../../nodes/sources/FileSourceNode';

export class FileRepresentationLoader implements RepresentationLoader {
  private _sourceNode: FileSourceNode | null = null;

  async load(representation: MediaRepresentation): Promise<RepresentationLoadResult> {
    const config = representation.loaderConfig;
    const file = config.file;
    const url = config.url ?? config.path;
    const path = config.path ?? file?.name ?? url ?? 'unknown';

    if (!file && !url) {
      throw new Error(`FileRepresentationLoader: no file or url provided for "${path}"`);
    }

    const fileSourceNode = new FileSourceNode(path);

    if (file) {
      await fileSourceNode.loadFile(file);
      // Populate url on the config so future serialization can restore
      // without the non-serializable File object.
      if (!config.url) {
        config.url = URL.createObjectURL(file);
      }
    } else {
      await fileSourceNode.load(url!, path);
    }

    this._sourceNode = fileSourceNode;

    return {
      sourceNode: fileSourceNode,
      audioTrackPresent: false, // Image files never have audio
      resolution: {
        width: fileSourceNode.width,
        height: fileSourceNode.height,
      },
      par: representation.par ?? 1.0,
      startFrame: representation.startFrame ?? 0,
      colorSpace: fileSourceNode.isHDR() ? { transferFunction: 'linear', colorPrimaries: 'bt709' } : undefined,
    };
  }

  dispose(): void {
    if (this._sourceNode) {
      this._sourceNode.dispose();
      this._sourceNode = null;
    }
  }
}
