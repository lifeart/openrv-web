/**
 * RepresentationLoader Interface
 *
 * Strategy interface for loading a media representation.
 * Each representation kind has a corresponding loader implementation.
 */

import type { BaseSourceNode } from '../../../nodes/sources/BaseSourceNode';
import type { MediaRepresentation } from '../../types/representation';

/**
 * Result of loading a representation.
 */
export interface RepresentationLoadResult {
  /** The loaded source node */
  sourceNode: BaseSourceNode;
  /** Detected audio track presence */
  audioTrackPresent: boolean;
  /** Detected resolution */
  resolution: { width: number; height: number };
  /** Detected pixel aspect ratio */
  par: number;
  /** Start frame offset */
  startFrame: number;
  /** Color space metadata */
  colorSpace?: {
    transferFunction?: string;
    colorPrimaries?: string;
  };
}

/**
 * Interface for representation loaders.
 * Each implementation wraps the loading logic for a specific source node type.
 */
export interface RepresentationLoader {
  /**
   * Load the representation and return a source node.
   * Updates the representation's metadata fields on success.
   */
  load(representation: MediaRepresentation): Promise<RepresentationLoadResult>;

  /**
   * Dispose any resources held by the loader.
   */
  dispose(): void;
}
