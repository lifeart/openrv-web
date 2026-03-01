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
    const path = config.path ?? file?.name ?? 'unknown';

    if (!file) {
      throw new Error(`FileRepresentationLoader: no file provided for "${path}"`);
    }

    const fileSourceNode = new FileSourceNode(path);
    await fileSourceNode.loadFile(file);

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
      colorSpace: fileSourceNode.isHDR()
        ? { transferFunction: 'linear', colorPrimaries: 'bt709' }
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
