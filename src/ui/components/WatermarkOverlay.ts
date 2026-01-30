/**
 * WatermarkOverlay - Static image overlay for logos and watermarks
 *
 * Supports 9 preset positions (3x3 grid), custom positioning, scale, opacity, and margin controls.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom';

export interface WatermarkState {
  enabled: boolean;
  imageUrl: string | null;
  position: WatermarkPosition;
  customX: number; // 0-1 (percentage of canvas width)
  customY: number; // 0-1 (percentage of canvas height)
  scale: number; // 0.1 - 2.0 (multiplier of original size)
  opacity: number; // 0-1
  margin: number; // Pixels from edge
}

export const DEFAULT_WATERMARK_STATE: WatermarkState = {
  enabled: false,
  imageUrl: null,
  position: 'bottom-right',
  customX: 0.9,
  customY: 0.9,
  scale: 1.0,
  opacity: 0.7,
  margin: 20,
};

export interface WatermarkOverlayEvents extends EventMap {
  stateChanged: WatermarkState;
  imageLoaded: { width: number; height: number };
  imageRemoved: void;
  error: Error;
}

export class WatermarkOverlay extends EventEmitter<WatermarkOverlayEvents> {
  private state: WatermarkState = { ...DEFAULT_WATERMARK_STATE };
  private watermarkImage: HTMLImageElement | null = null;
  private originalWidth = 0;
  private originalHeight = 0;
  private pendingLoadAbort: (() => void) | null = null;

  constructor(initialState?: Partial<WatermarkState>) {
    super();
    if (initialState) {
      this.state = { ...this.state, ...initialState };
    }
  }

  /**
   * Load a watermark image from a File
   * Aborts any pending load operation before starting a new one.
   */
  async loadImage(file: File): Promise<void> {
    // Abort any pending load
    if (this.pendingLoadAbort) {
      this.pendingLoadAbort();
      this.pendingLoadAbort = null;
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      let aborted = false;

      // Set up abort handler
      this.pendingLoadAbort = () => {
        aborted = true;
        URL.revokeObjectURL(url);
        img.src = ''; // Cancel load
      };

      img.onload = () => {
        if (aborted) return;
        this.pendingLoadAbort = null;

        // Revoke old URL if exists
        if (this.state.imageUrl && this.state.imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(this.state.imageUrl);
        }

        this.watermarkImage = img;
        this.originalWidth = img.naturalWidth;
        this.originalHeight = img.naturalHeight;
        this.state.imageUrl = url;
        this.state.enabled = true;

        this.emit('imageLoaded', { width: this.originalWidth, height: this.originalHeight });
        this.emit('stateChanged', { ...this.state });
        resolve();
      };

      img.onerror = () => {
        if (aborted) return;
        this.pendingLoadAbort = null;
        URL.revokeObjectURL(url);
        const error = new Error('Failed to load watermark image');
        this.emit('error', error);
        reject(error);
      };

      img.src = url;
    });
  }

  /**
   * Load a watermark image from a URL
   * Aborts any pending load operation before starting a new one.
   */
  async loadFromUrl(url: string): Promise<void> {
    // Abort any pending load
    if (this.pendingLoadAbort) {
      this.pendingLoadAbort();
      this.pendingLoadAbort = null;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      let aborted = false;

      // Set up abort handler
      this.pendingLoadAbort = () => {
        aborted = true;
        img.src = ''; // Cancel load
      };

      img.onload = () => {
        if (aborted) return;
        this.pendingLoadAbort = null;

        // Revoke old URL if it was a blob
        if (this.state.imageUrl && this.state.imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(this.state.imageUrl);
        }

        this.watermarkImage = img;
        this.originalWidth = img.naturalWidth;
        this.originalHeight = img.naturalHeight;
        this.state.imageUrl = url;
        this.state.enabled = true;

        this.emit('imageLoaded', { width: this.originalWidth, height: this.originalHeight });
        this.emit('stateChanged', { ...this.state });
        resolve();
      };

      img.onerror = () => {
        if (aborted) return;
        this.pendingLoadAbort = null;
        const error = new Error('Failed to load watermark image from URL');
        this.emit('error', error);
        reject(error);
      };

      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  /**
   * Remove the watermark image
   */
  removeImage(): void {
    if (this.state.imageUrl && this.state.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.imageUrl);
    }

    this.watermarkImage = null;
    this.originalWidth = 0;
    this.originalHeight = 0;
    this.state.imageUrl = null;
    this.state.enabled = false;

    this.emit('imageRemoved', undefined);
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Render the watermark onto a canvas context
   */
  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.state.enabled || !this.watermarkImage) return;

    const img = this.watermarkImage;
    const scaledWidth = this.originalWidth * this.state.scale;
    const scaledHeight = this.originalHeight * this.state.scale;

    const { x, y } = this.calculatePosition(canvasWidth, canvasHeight, scaledWidth, scaledHeight);

    // Save context state
    ctx.save();
    ctx.globalAlpha = this.state.opacity;
    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
    ctx.restore();
  }

  /**
   * Calculate the position for the watermark
   */
  private calculatePosition(
    canvasWidth: number,
    canvasHeight: number,
    watermarkWidth: number,
    watermarkHeight: number
  ): { x: number; y: number } {
    const margin = this.state.margin;

    switch (this.state.position) {
      case 'top-left':
        return { x: margin, y: margin };

      case 'top-center':
        return { x: (canvasWidth - watermarkWidth) / 2, y: margin };

      case 'top-right':
        return { x: canvasWidth - watermarkWidth - margin, y: margin };

      case 'center-left':
        return { x: margin, y: (canvasHeight - watermarkHeight) / 2 };

      case 'center':
        return {
          x: (canvasWidth - watermarkWidth) / 2,
          y: (canvasHeight - watermarkHeight) / 2,
        };

      case 'center-right':
        return {
          x: canvasWidth - watermarkWidth - margin,
          y: (canvasHeight - watermarkHeight) / 2,
        };

      case 'bottom-left':
        return { x: margin, y: canvasHeight - watermarkHeight - margin };

      case 'bottom-center':
        return {
          x: (canvasWidth - watermarkWidth) / 2,
          y: canvasHeight - watermarkHeight - margin,
        };

      case 'bottom-right':
        return {
          x: canvasWidth - watermarkWidth - margin,
          y: canvasHeight - watermarkHeight - margin,
        };

      case 'custom':
        return {
          x: this.state.customX * canvasWidth - watermarkWidth / 2,
          y: this.state.customY * canvasHeight - watermarkHeight / 2,
        };

      default:
        return { x: margin, y: margin };
    }
  }

  /**
   * Get the bounding box of the watermark (for hit testing)
   */
  getBounds(canvasWidth: number, canvasHeight: number): { x: number; y: number; width: number; height: number } | null {
    if (!this.state.enabled || !this.watermarkImage) return null;

    const scaledWidth = this.originalWidth * this.state.scale;
    const scaledHeight = this.originalHeight * this.state.scale;
    const { x, y } = this.calculatePosition(canvasWidth, canvasHeight, scaledWidth, scaledHeight);

    return { x, y, width: scaledWidth, height: scaledHeight };
  }

  // State getters/setters
  getState(): WatermarkState {
    return { ...this.state };
  }

  setState(state: Partial<WatermarkState>): void {
    const changed = Object.keys(state).some(
      (key) => this.state[key as keyof WatermarkState] !== state[key as keyof WatermarkState]
    );

    if (changed) {
      this.state = { ...this.state, ...state };
      this.emit('stateChanged', { ...this.state });
    }
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.state.enabled !== enabled) {
      this.state.enabled = enabled;
      this.emit('stateChanged', { ...this.state });
    }
  }

  getPosition(): WatermarkPosition {
    return this.state.position;
  }

  setPosition(position: WatermarkPosition): void {
    if (this.state.position !== position) {
      this.state.position = position;
      this.emit('stateChanged', { ...this.state });
    }
  }

  setCustomPosition(x: number, y: number): void {
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    if (this.state.customX !== clampedX || this.state.customY !== clampedY) {
      this.state.customX = clampedX;
      this.state.customY = clampedY;
      this.state.position = 'custom';
      this.emit('stateChanged', { ...this.state });
    }
  }

  getScale(): number {
    return this.state.scale;
  }

  setScale(scale: number): void {
    const clamped = Math.max(0.1, Math.min(2.0, scale));
    if (this.state.scale !== clamped) {
      this.state.scale = clamped;
      this.emit('stateChanged', { ...this.state });
    }
  }

  getOpacity(): number {
    return this.state.opacity;
  }

  setOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    if (this.state.opacity !== clamped) {
      this.state.opacity = clamped;
      this.emit('stateChanged', { ...this.state });
    }
  }

  getMargin(): number {
    return this.state.margin;
  }

  setMargin(margin: number): void {
    const clamped = Math.max(0, Math.min(200, margin));
    if (this.state.margin !== clamped) {
      this.state.margin = clamped;
      this.emit('stateChanged', { ...this.state });
    }
  }

  hasImage(): boolean {
    return this.watermarkImage !== null;
  }

  getImageDimensions(): { width: number; height: number } | null {
    if (!this.watermarkImage) return null;
    return { width: this.originalWidth, height: this.originalHeight };
  }

  /**
   * Serialize state for saving to project file
   */
  toJSON(): WatermarkState & { originalWidth: number; originalHeight: number } {
    return {
      ...this.state,
      originalWidth: this.originalWidth,
      originalHeight: this.originalHeight,
    };
  }

  dispose(): void {
    // Abort any pending load
    if (this.pendingLoadAbort) {
      this.pendingLoadAbort();
      this.pendingLoadAbort = null;
    }

    if (this.state.imageUrl && this.state.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.imageUrl);
    }
    this.watermarkImage = null;
    this.state.imageUrl = null;
  }
}
