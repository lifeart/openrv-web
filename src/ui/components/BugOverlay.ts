/**
 * BugOverlay - Small corner logo/image overlay
 *
 * Similar to OpenRV's bug.mu, this overlay renders a small logo or image
 * in a corner of the viewer. Used for persistent branding, channel identification,
 * or review watermarks.
 *
 * Features:
 * - Image URL or raw image data
 * - Configurable corner position (top-left, top-right, bottom-left, bottom-right)
 * - Adjustable size (as fraction of viewer width)
 * - Adjustable opacity
 * - Renders on top of the viewer content
 */

import type { EventMap } from '../../utils/EventEmitter';
import { CanvasOverlay } from './CanvasOverlay';
import { clamp } from '../../utils/math';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BugPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface BugOverlayState {
  enabled: boolean;
  imageUrl: string | null;
  position: BugPosition;
  /** Size as fraction of viewer width (0.02 - 0.3). Default: 0.08 */
  size: number;
  /** Opacity (0 - 1). Default: 0.8 */
  opacity: number;
  /** Margin from edge in pixels. Default: 12 */
  margin: number;
}

export interface BugOverlayEvents extends EventMap {
  stateChanged: BugOverlayState;
  imageLoaded: { width: number; height: number };
  imageError: Error;
}

export const DEFAULT_BUG_OVERLAY_STATE: BugOverlayState = {
  enabled: false,
  imageUrl: null,
  position: 'bottom-right',
  size: 0.08,
  opacity: 0.8,
  margin: 12,
};

// ---------------------------------------------------------------------------
// BugOverlay
// ---------------------------------------------------------------------------

export class BugOverlay extends CanvasOverlay<BugOverlayEvents> {
  private state: BugOverlayState = { ...DEFAULT_BUG_OVERLAY_STATE };
  private bugImage: HTMLImageElement | null = null;
  private imageWidth = 0;
  private imageHeight = 0;

  constructor(initialState?: Partial<BugOverlayState>) {
    super('bug-overlay', 'bug-overlay', 55);
    if (initialState) {
      this.state = { ...this.state, ...initialState };
    }
  }

  // -------------------------------------------------------------------------
  // Image loading
  // -------------------------------------------------------------------------

  /**
   * Load a bug image from a URL
   */
  async loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.bugImage = img;
        this.imageWidth = img.naturalWidth;
        this.imageHeight = img.naturalHeight;
        this.state.imageUrl = url;
        this.state.enabled = true;
        this.render();
        this.emit('imageLoaded', { width: this.imageWidth, height: this.imageHeight });
        this.emit('stateChanged', { ...this.state });
        resolve();
      };
      img.onerror = () => {
        const error = new Error('Failed to load bug image');
        this.emit('imageError', error);
        reject(error);
      };
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  /**
   * Set a bug image directly from an HTMLImageElement
   */
  setImage(img: HTMLImageElement): void {
    this.bugImage = img;
    this.imageWidth = img.naturalWidth || img.width;
    this.imageHeight = img.naturalHeight || img.height;
    this.state.enabled = true;
    this.render();
    this.emit('imageLoaded', { width: this.imageWidth, height: this.imageHeight });
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Remove the current image
   */
  removeImage(): void {
    this.bugImage = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.state.imageUrl = null;
    this.state.enabled = false;
    this.render();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Check if an image is loaded
   */
  hasImage(): boolean {
    return this.bugImage !== null;
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  getState(): BugOverlayState {
    return { ...this.state };
  }

  setState(partial: Partial<BugOverlayState>): void {
    // Validate numeric fields through the same clamping as the individual setters
    const validated = { ...partial };
    if (validated.size !== undefined) validated.size = clamp(validated.size, 0.02, 0.3);
    if (validated.opacity !== undefined) validated.opacity = clamp(validated.opacity, 0, 1);
    if (validated.margin !== undefined) validated.margin = clamp(validated.margin, 0, 100);
    this.state = { ...this.state, ...validated };
    this.render();
    this.emit('stateChanged', { ...this.state });
  }

  // -------------------------------------------------------------------------
  // Position
  // -------------------------------------------------------------------------

  getPosition(): BugPosition {
    return this.state.position;
  }

  setPosition(position: BugPosition): void {
    if (this.state.position !== position) {
      this.state.position = position;
      this.render();
      this.emit('stateChanged', { ...this.state });
    }
  }

  // -------------------------------------------------------------------------
  // Size
  // -------------------------------------------------------------------------

  getSize(): number {
    return this.state.size;
  }

  setSize(size: number): void {
    const clamped = clamp(size, 0.02, 0.3);
    if (this.state.size !== clamped) {
      this.state.size = clamped;
      this.render();
      this.emit('stateChanged', { ...this.state });
    }
  }

  // -------------------------------------------------------------------------
  // Opacity
  // -------------------------------------------------------------------------

  getOpacity(): number {
    return this.state.opacity;
  }

  setOpacity(opacity: number): void {
    const clamped = clamp(opacity, 0, 1);
    if (this.state.opacity !== clamped) {
      this.state.opacity = clamped;
      this.render();
      this.emit('stateChanged', { ...this.state });
    }
  }

  // -------------------------------------------------------------------------
  // Margin
  // -------------------------------------------------------------------------

  getMargin(): number {
    return this.state.margin;
  }

  setMargin(margin: number): void {
    const clamped = clamp(margin, 0, 100);
    if (this.state.margin !== clamped) {
      this.state.margin = clamped;
      this.render();
      this.emit('stateChanged', { ...this.state });
    }
  }

  // -------------------------------------------------------------------------
  // Enable / Disable / Toggle
  // -------------------------------------------------------------------------

  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  enable(): void {
    this.setState({ enabled: true });
  }

  disable(): void {
    this.setState({ enabled: false });
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(): void {
    const { ctx, canvasWidth, canvasHeight } = this;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!this.state.enabled || !this.bugImage || this.displayWidth === 0 || this.displayHeight === 0) {
      return;
    }

    const { position, size, opacity, margin } = this.state;

    // Calculate rendered size maintaining aspect ratio
    // Guard against division by zero if image dimensions are 0
    const safeImageWidth = Math.max(1, this.imageWidth);
    const safeImageHeight = Math.max(1, this.imageHeight);
    const maxWidth = this.displayWidth * size;
    const aspect = safeImageWidth / safeImageHeight;
    const renderWidth = maxWidth;
    const renderHeight = renderWidth / aspect;

    // Clamp margin so it doesn't exceed half the display dimension,
    // preventing the overlay from being pushed entirely off-screen
    const maxMarginX = this.displayWidth / 2;
    const maxMarginY = this.displayHeight / 2;
    const clampedMargin = Math.min(margin, maxMarginX, maxMarginY);

    // Calculate position
    const { x, y } = this.calculatePosition(
      position,
      renderWidth,
      renderHeight,
      clampedMargin,
    );

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(this.bugImage, x, y, renderWidth, renderHeight);
    ctx.restore();
  }

  private calculatePosition(
    position: BugPosition,
    width: number,
    height: number,
    margin: number,
  ): { x: number; y: number } {
    const { offsetX, offsetY, displayWidth, displayHeight } = this;

    switch (position) {
      case 'top-left':
        return { x: offsetX + margin, y: offsetY + margin };
      case 'top-right':
        return { x: offsetX + displayWidth - width - margin, y: offsetY + margin };
      case 'bottom-left':
        return { x: offsetX + margin, y: offsetY + displayHeight - height - margin };
      case 'bottom-right':
      default:
        return {
          x: offsetX + displayWidth - width - margin,
          y: offsetY + displayHeight - height - margin,
        };
    }
  }

  // -------------------------------------------------------------------------
  // Visibility / Disposal
  // -------------------------------------------------------------------------

  isVisible(): boolean {
    return this.state.enabled && this.bugImage !== null;
  }

  override dispose(): void {
    this.bugImage = null;
    super.dispose();
  }
}
