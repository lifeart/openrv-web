/**
 * ReferenceManager - Persistent reference image that survives shot changes.
 *
 * Captures and stores a reference frame, allowing the user to compare it
 * against the current live shot. Unlike A/B compare (which compares two
 * sources), reference mode compares against a stored snapshot.
 *
 * This is a pure state manager with no DOM or rendering dependencies.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export type ReferenceViewMode = 'split-h' | 'split-v' | 'overlay' | 'side-by-side' | 'toggle';

export interface ReferenceImage {
  width: number;
  height: number;
  data: Float32Array | Uint8ClampedArray;
  channels: number;
  timestamp?: number;
  label?: string;
  capturedAt: number;
}

export interface ReferenceState {
  enabled: boolean;
  referenceImage: ReferenceImage | null;
  viewMode: ReferenceViewMode;
  opacity: number;
  wipePosition: number;
}

export interface ReferenceManagerEvents extends EventMap {
  stateChanged: ReferenceState;
  referenceCaptured: ReferenceImage;
  referenceCleared: void;
  viewModeChanged: ReferenceViewMode;
}

const VALID_VIEW_MODES: ReadonlySet<string> = new Set<ReferenceViewMode>([
  'split-h',
  'split-v',
  'overlay',
  'side-by-side',
  'toggle',
]);

export class ReferenceManager extends EventEmitter<ReferenceManagerEvents> {
  private state: ReferenceState = {
    enabled: false,
    referenceImage: null,
    viewMode: 'split-h',
    opacity: 0.5,
    wipePosition: 0.5,
  };

  private disposed = false;

  // ---- Reference capture / clear ----

  /**
   * Capture a reference image by copying the provided image data.
   * The data is deeply copied so the caller can safely mutate the original.
   */
  captureReference(
    image: { width: number; height: number; data: Float32Array | Uint8ClampedArray; channels: number },
    label?: string,
  ): void {
    if (this.disposed) return;

    const dataCopy = image.data instanceof Float32Array
      ? new Float32Array(image.data)
      : new Uint8ClampedArray(image.data);

    const ref: ReferenceImage = {
      width: image.width,
      height: image.height,
      data: dataCopy,
      channels: image.channels,
      capturedAt: Date.now(),
    };

    if (label !== undefined) {
      ref.label = label;
    }

    this.state.referenceImage = ref;
    this.emit('referenceCaptured', ref);
    this.emit('stateChanged', this.getState());
  }

  /**
   * Clear the stored reference image.
   * No-op if there is no reference stored.
   */
  clearReference(): void {
    if (this.disposed) return;
    if (this.state.referenceImage === null) return;

    this.state.referenceImage = null;
    this.emit('referenceCleared', undefined as unknown as void);
    this.emit('stateChanged', this.getState());
  }

  /**
   * Check if a reference image is currently stored.
   */
  hasReference(): boolean {
    if (this.disposed) return false;
    return this.state.referenceImage !== null;
  }

  /**
   * Get the stored reference image, or null if none.
   */
  getReference(): ReferenceImage | null {
    if (this.disposed) return null;
    return this.state.referenceImage;
  }

  // ---- Enable / disable ----

  enable(): void {
    if (this.disposed) return;
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.emit('stateChanged', this.getState());
  }

  disable(): void {
    if (this.disposed) return;
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.emit('stateChanged', this.getState());
  }

  toggle(): void {
    if (this.disposed) return;
    if (this.state.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  isEnabled(): boolean {
    if (this.disposed) return false;
    return this.state.enabled;
  }

  // ---- View mode ----

  setViewMode(mode: ReferenceViewMode): void {
    if (this.disposed) return;
    if (!VALID_VIEW_MODES.has(mode)) return;
    if (this.state.viewMode === mode) return;

    this.state.viewMode = mode;
    this.emit('viewModeChanged', mode);
    this.emit('stateChanged', this.getState());
  }

  getViewMode(): ReferenceViewMode {
    if (this.disposed) return 'split-h';
    return this.state.viewMode;
  }

  // ---- Opacity (overlay mode) ----

  setOpacity(opacity: number): void {
    if (this.disposed) return;
    if (typeof opacity !== 'number' || isNaN(opacity)) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    if (this.state.opacity === clamped) return;
    this.state.opacity = clamped;
    this.emit('stateChanged', this.getState());
  }

  getOpacity(): number {
    if (this.disposed) return 0.5;
    return this.state.opacity;
  }

  // ---- Wipe position (split modes) ----

  setWipePosition(position: number): void {
    if (this.disposed) return;
    if (typeof position !== 'number' || isNaN(position)) return;
    const clamped = Math.max(0, Math.min(1, position));
    if (this.state.wipePosition === clamped) return;
    this.state.wipePosition = clamped;
    this.emit('stateChanged', this.getState());
  }

  getWipePosition(): number {
    if (this.disposed) return 0.5;
    return this.state.wipePosition;
  }

  // ---- State snapshot ----

  getState(): ReferenceState {
    if (this.disposed) {
      return {
        enabled: false,
        referenceImage: null,
        viewMode: 'split-h',
        opacity: 0.5,
        wipePosition: 0.5,
      };
    }
    return { ...this.state };
  }

  // ---- Lifecycle ----

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.state.referenceImage = null;
    this.removeAllListeners();
  }
}
