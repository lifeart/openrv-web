/**
 * RepresentationLoaderFactory
 *
 * Factory that creates the appropriate RepresentationLoader
 * based on the representation kind.
 */

import type { RepresentationLoader } from './RepresentationLoader';
import type { RepresentationKind } from '../../types/representation';
import type { HDRResizeTier } from '../../../utils/media/HDRFrameResizer';
import { FileRepresentationLoader } from './FileRepresentationLoader';
import { VideoRepresentationLoader } from './VideoRepresentationLoader';
import { SequenceRepresentationLoader } from './SequenceRepresentationLoader';

/**
 * Create a RepresentationLoader for the given representation kind.
 *
 * @param kind - The representation kind
 * @param hdrResizeTier - HDR resize tier for video representations
 * @param isSequence - Whether this is a multi-file sequence (only relevant for 'frames' kind)
 * @returns The appropriate loader instance
 * @throws Error if the kind is not supported
 */
export function createRepresentationLoader(
  kind: RepresentationKind,
  hdrResizeTier: HDRResizeTier = 'none',
  isSequence = false
): RepresentationLoader {
  switch (kind) {
    case 'frames':
      if (isSequence) {
        return new SequenceRepresentationLoader();
      }
      return new FileRepresentationLoader();
    case 'movie':
    case 'proxy':
      return new VideoRepresentationLoader(hdrResizeTier);
    case 'streaming':
      throw new Error('Streaming representations are not yet supported');
  }
}
