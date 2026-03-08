/**
 * MediaRepresentationManager
 *
 * Core manager for per-source media representations.
 * Handles adding, removing, switching, and fallback of representations.
 *
 * This manager is stateless -- it operates on MediaSource.representations
 * passed by reference. It emits events for UI coordination.
 */

import { EventEmitter } from '../../utils/EventEmitter';
import type {
  MediaRepresentation,
  AddRepresentationConfig,
  SwitchRepresentationOptions,
  RepresentationManagerEvents,
} from '../types/representation';
import { createRepresentation } from '../types/representation';
import { createRepresentationLoader } from './loaders/RepresentationLoaderFactory';
import type { RepresentationLoader } from './loaders/RepresentationLoader';
import type { HDRResizeTier } from '../../utils/media/HDRFrameResizer';

/**
 * Interface for accessing and mutating the source's representation state.
 */
export interface RepresentationSourceAccessor {
  /** Get the representations array for a source */
  getRepresentations(sourceIndex: number): MediaRepresentation[] | null;
  /** Get the active representation index for a source */
  getActiveRepresentationIndex(sourceIndex: number): number;
  /** Set the active representation index for a source */
  setActiveRepresentationIndex(sourceIndex: number, repIndex: number): void;
  /** Apply the active representation's source node to the MediaSource shim fields */
  applyRepresentationShim(sourceIndex: number, representation: MediaRepresentation): void;
  /** Get the HDR resize tier */
  getHDRResizeTier(): HDRResizeTier;
  /** Get the current frame for frame mapping */
  getCurrentFrame(): number;
}

export class MediaRepresentationManager extends EventEmitter<RepresentationManagerEvents> {
  private _accessor: RepresentationSourceAccessor | null = null;
  private _activeLoaders = new Map<string, RepresentationLoader>();

  /**
   * Set the source accessor that provides access to the MediaSource state.
   */
  setAccessor(accessor: RepresentationSourceAccessor): void {
    this._accessor = accessor;
  }

  /**
   * Add a new representation to a source.
   *
   * @param sourceIndex - Index of the source to add the representation to
   * @param config - Configuration for the new representation
   * @returns The created MediaRepresentation, or null if the source is invalid
   */
  addRepresentation(sourceIndex: number, config: AddRepresentationConfig): MediaRepresentation | null {
    if (!this._accessor) return null;
    const representations = this._accessor.getRepresentations(sourceIndex);
    if (!representations) return null;

    const representation = createRepresentation(config);
    representations.push(representation);

    // Sort by priority (lower = preferred)
    representations.sort((a, b) => a.priority - b.priority);

    // If no representation is currently active and this one is ready, activate it
    const activeIndex = this._accessor.getActiveRepresentationIndex(sourceIndex);
    if (activeIndex === -1 && representation.status === 'ready') {
      const newIndex = representations.indexOf(representation);
      this._accessor.setActiveRepresentationIndex(sourceIndex, newIndex);
      this._accessor.applyRepresentationShim(sourceIndex, representation);
    }

    return representation;
  }

  /**
   * Remove a representation from a source.
   *
   * @param sourceIndex - Index of the source
   * @param repId - ID of the representation to remove
   * @returns true if removed, false if not found
   */
  removeRepresentation(sourceIndex: number, repId: string): boolean {
    if (!this._accessor) return false;
    const representations = this._accessor.getRepresentations(sourceIndex);
    if (!representations) return false;

    const index = representations.findIndex((r) => r.id === repId);
    if (index === -1) return false;

    // Dispose the loader if one exists
    const loader = this._activeLoaders.get(repId);
    if (loader) {
      loader.dispose();
      this._activeLoaders.delete(repId);
    }

    // If removing the active representation, fall back to the next best
    const activeIndex = this._accessor.getActiveRepresentationIndex(sourceIndex);
    representations.splice(index, 1);

    if (activeIndex === index) {
      // Find next ready representation
      const nextReady = representations.findIndex((r) => r.status === 'ready');
      const nextRep = nextReady !== -1 ? representations[nextReady] : undefined;
      if (nextReady !== -1 && nextRep) {
        this._accessor.setActiveRepresentationIndex(sourceIndex, nextReady);
        this._accessor.applyRepresentationShim(sourceIndex, nextRep);
      } else {
        this._accessor.setActiveRepresentationIndex(sourceIndex, -1);
      }
    } else if (activeIndex > index) {
      // Adjust active index since we removed an element before it
      this._accessor.setActiveRepresentationIndex(sourceIndex, activeIndex - 1);
    }

    return true;
  }

  /**
   * Switch the active representation for a source.
   *
   * @param sourceIndex - Index of the source
   * @param repId - ID of the representation to activate
   * @param options - Switch options (userInitiated, etc.)
   * @returns Promise that resolves when the switch is complete
   */
  async switchRepresentation(
    sourceIndex: number,
    repId: string,
    options?: SwitchRepresentationOptions,
  ): Promise<boolean> {
    if (!this._accessor) return false;
    const representations = this._accessor.getRepresentations(sourceIndex);
    if (!representations) return false;

    const repIndex = representations.findIndex((r) => r.id === repId);
    if (repIndex === -1) return false;

    const representation = representations[repIndex];
    if (!representation) return false;

    const userInitiated = options?.userInitiated ?? false;

    // Get the previous active representation
    const prevActiveIndex = this._accessor.getActiveRepresentationIndex(sourceIndex);
    const prevRepId =
      prevActiveIndex >= 0 && prevActiveIndex < representations.length
        ? (representations[prevActiveIndex]?.id ?? null)
        : null;

    // If already active and ready, nothing to do
    if (prevActiveIndex === repIndex && representation.status === 'ready') {
      return true;
    }

    // If the representation is already ready, just switch
    if (representation.status === 'ready') {
      this._accessor.setActiveRepresentationIndex(sourceIndex, repIndex);
      this._accessor.applyRepresentationShim(sourceIndex, representation);

      this.emit('representationChanged', {
        sourceIndex,
        previousRepId: prevRepId,
        newRepId: repId,
        representation,
      });

      return true;
    }

    // Need to load the representation
    representation.status = 'loading';

    try {
      const hdrResizeTier = this._accessor.getHDRResizeTier();
      const loader = createRepresentationLoader(representation.kind, hdrResizeTier);
      this._activeLoaders.set(repId, loader);

      const result = await loader.load(representation);

      // Update representation with loaded data
      representation.sourceNode = result.sourceNode;
      representation.status = 'ready';
      representation.resolution = result.resolution;
      representation.par = result.par;
      representation.audioTrackPresent = result.audioTrackPresent;
      representation.startFrame = result.startFrame;
      if (result.colorSpace) {
        representation.colorSpace = result.colorSpace;
      }

      // Activate this representation
      this._accessor.setActiveRepresentationIndex(sourceIndex, repIndex);
      this._accessor.applyRepresentationShim(sourceIndex, representation);

      this.emit('representationChanged', {
        sourceIndex,
        previousRepId: prevRepId,
        newRepId: repId,
        representation,
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      representation.status = 'error';
      representation.errorInfo = errorMessage;

      this.emit('representationError', {
        sourceIndex,
        repId,
        error: errorMessage,
        userInitiated,
      });

      // If user-initiated, do NOT auto-fallback
      if (userInitiated) {
        return false;
      }

      // System-initiated: try auto-fallback
      return this.handleRepresentationError(sourceIndex, repId);
    }
  }

  /**
   * Handle a representation error and trigger fallback.
   * Walks the representations array in ascending priority order
   * and activates the next one that is not in error state.
   *
   * @param sourceIndex - Index of the source
   * @param failedRepId - ID of the representation that failed
   * @returns true if fallback succeeded, false if all representations failed
   */
  handleRepresentationError(sourceIndex: number, failedRepId: string): boolean {
    if (!this._accessor) return false;
    const representations = this._accessor.getRepresentations(sourceIndex);
    if (!representations) return false;

    // Find a non-error representation to fall back to (sorted by priority)
    const fallbackCandidates = [...representations]
      .sort((a, b) => a.priority - b.priority)
      .filter((r) => r.id !== failedRepId && r.status !== 'error');

    // Prefer a ready representation, otherwise try idle ones
    const readyFallback = fallbackCandidates.find((r) => r.status === 'ready');
    if (readyFallback) {
      const fallbackIndex = representations.indexOf(readyFallback);
      this._accessor.setActiveRepresentationIndex(sourceIndex, fallbackIndex);
      this._accessor.applyRepresentationShim(sourceIndex, readyFallback);

      this.emit('fallbackActivated', {
        sourceIndex,
        failedRepId,
        fallbackRepId: readyFallback.id,
        fallbackRepresentation: readyFallback,
      });

      return true;
    }

    // Try loading an idle fallback
    const idleFallback = fallbackCandidates.find((r) => r.status === 'idle');
    if (idleFallback) {
      // Attempt to load the fallback asynchronously
      void this.switchRepresentation(sourceIndex, idleFallback.id, { userInitiated: false });
      return true; // Optimistically return true; the async load will handle errors
    }

    // All representations are in error state
    return false;
  }

  /**
   * Get the active representation for a source.
   *
   * @param sourceIndex - Index of the source
   * @returns The active MediaRepresentation, or null if none
   */
  getActiveRepresentation(sourceIndex: number): MediaRepresentation | null {
    if (!this._accessor) return null;
    const representations = this._accessor.getRepresentations(sourceIndex);
    if (!representations) return null;

    const activeIndex = this._accessor.getActiveRepresentationIndex(sourceIndex);
    if (activeIndex < 0 || activeIndex >= representations.length) return null;

    return representations[activeIndex] ?? null;
  }

  /**
   * Map a frame number from one representation to another using startFrame offsets.
   *
   * @param currentFrame - The current frame in the active representation
   * @param fromRep - The source representation
   * @param toRep - The target representation
   * @param maxFrame - Maximum valid frame in the target representation (for clamping)
   * @returns The mapped frame number
   */
  mapFrame(currentFrame: number, fromRep: MediaRepresentation, toRep: MediaRepresentation, maxFrame?: number): number {
    // Convert to absolute frame
    const absoluteFrame = currentFrame + fromRep.startFrame;
    // Convert to target frame
    let targetFrame = absoluteFrame - toRep.startFrame;
    // Clamp to valid range
    if (targetFrame < 1) targetFrame = 1;
    if (maxFrame !== undefined && targetFrame > maxFrame) targetFrame = maxFrame;
    return targetFrame;
  }

  /**
   * Dispose all active loaders.
   */
  dispose(): void {
    for (const loader of this._activeLoaders.values()) {
      loader.dispose();
    }
    this._activeLoaders.clear();
    this._accessor = null;
    this.removeAllListeners();
  }
}
