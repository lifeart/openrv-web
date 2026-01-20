/**
 * ClippingOverlay - Visual overlay showing clipped highlights and shadows
 *
 * Features:
 * - Red overlay on pixels clipped in highlights (any channel >= 254)
 * - Blue overlay on pixels clipped in shadows (all channels <= 1)
 * - Configurable colors and opacity
 * - Real-time updates during grading
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface ClippingOverlayState {
  enabled: boolean;
  showHighlights: boolean;
  showShadows: boolean;
  highlightColor: { r: number; g: number; b: number };
  shadowColor: { r: number; g: number; b: number };
  opacity: number;
}

export const DEFAULT_CLIPPING_OVERLAY_STATE: ClippingOverlayState = {
  enabled: false,
  showHighlights: true,
  showShadows: true,
  highlightColor: { r: 255, g: 0, b: 0 },    // Red for highlights
  shadowColor: { r: 0, g: 100, b: 255 },     // Blue for shadows
  opacity: 0.7,
};

export interface ClippingOverlayEvents extends EventMap {
  stateChanged: ClippingOverlayState;
}

export class ClippingOverlay extends EventEmitter<ClippingOverlayEvents> {
  private state: ClippingOverlayState = { ...DEFAULT_CLIPPING_OVERLAY_STATE };

  constructor() {
    super();
  }

  /**
   * Apply clipping overlay to ImageData
   * Highlights pixels with clipped values:
   * - Shadows: all RGB channels <= 1 (near black)
   * - Highlights: any RGB channel >= 254 OR luminance >= 254 (near white/clipped)
   */
  apply(imageData: ImageData): void {
    if (!this.state.enabled) return;

    const data = imageData.data;
    const { showHighlights, showShadows, highlightColor, shadowColor, opacity } = this.state;
    const len = data.length;

    // Pre-calculate blended colors
    const blendFactor = opacity;
    const invBlend = 1 - blendFactor;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      // Calculate luminance to detect clipping
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Check for highlight clipping (any channel at max)
      const isHighlightClipped = showHighlights && (r >= 254 || g >= 254 || b >= 254 || luma >= 254);

      // Check for shadow clipping (all channels at min)
      const isShadowClipped = showShadows && (r <= 1 && g <= 1 && b <= 1);

      if (isHighlightClipped) {
        // Blend with highlight color (red)
        data[i] = Math.round(r * invBlend + highlightColor.r * blendFactor);
        data[i + 1] = Math.round(g * invBlend + highlightColor.g * blendFactor);
        data[i + 2] = Math.round(b * invBlend + highlightColor.b * blendFactor);
      } else if (isShadowClipped) {
        // Blend with shadow color (blue)
        data[i] = Math.round(r * invBlend + shadowColor.r * blendFactor);
        data[i + 1] = Math.round(g * invBlend + shadowColor.g * blendFactor);
        data[i + 2] = Math.round(b * invBlend + shadowColor.b * blendFactor);
      }
    }
  }

  /**
   * Enable clipping overlay
   */
  enable(): void {
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Disable clipping overlay
   */
  disable(): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Toggle clipping overlay
   */
  toggle(): void {
    this.state.enabled = !this.state.enabled;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Set full state
   */
  setState(state: Partial<ClippingOverlayState>): void {
    this.state = { ...this.state, ...state };
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current state
   */
  getState(): ClippingOverlayState {
    return { ...this.state };
  }

  /**
   * Set show highlights
   */
  setShowHighlights(show: boolean): void {
    if (this.state.showHighlights === show) return;
    this.state.showHighlights = show;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Set show shadows
   */
  setShowShadows(show: boolean): void {
    if (this.state.showShadows === show) return;
    this.state.showShadows = show;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Set opacity (0-1)
   */
  setOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    if (this.state.opacity === clamped) return;
    this.state.opacity = clamped;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Reset to default state
   */
  reset(): void {
    this.state = { ...DEFAULT_CLIPPING_OVERLAY_STATE };
    this.emit('stateChanged', { ...this.state });
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
