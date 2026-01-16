/**
 * BaseSourceNode - Abstract base class for all source nodes
 *
 * Source nodes produce images from external sources (files, videos, sequences).
 * They have no inputs and serve as the root of processing chains.
 */

import { IPNode } from '../base/IPNode';

export interface SourceMetadata {
  name: string;
  width: number;
  height: number;
  duration: number;  // in frames
  fps: number;
}

/**
 * Base class for all source nodes.
 * Source nodes produce images from external sources and have no inputs.
 */
export abstract class BaseSourceNode extends IPNode {
  protected metadata: SourceMetadata = {
    name: '',
    width: 0,
    height: 0,
    duration: 1,
    fps: 24,
  };

  constructor(type: string, name?: string) {
    super(type, name);
  }

  /**
   * Source nodes cannot have inputs - override to prevent connections
   */
  override connectInput(_node: IPNode): void {
    console.warn('Source nodes cannot have inputs');
  }

  /**
   * Get source metadata
   */
  getMetadata(): SourceMetadata {
    return { ...this.metadata };
  }

  /**
   * Check if source is loaded and ready for rendering
   */
  abstract isReady(): boolean;

  /**
   * Get the underlying element for a given frame (for direct rendering)
   */
  abstract getElement(frame: number): HTMLImageElement | HTMLVideoElement | null;

  /**
   * Serialize to JSON for project save
   */
  abstract toJSON(): object;
}
