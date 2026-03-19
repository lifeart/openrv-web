/**
 * ClippingOverlay - Visual overlay showing clipped highlights and shadows
 *
 * Features:
 * - Red overlay on pixels clipped in highlights (any channel >= 254)
 * - Blue overlay on pixels clipped in shadows (all channels <= 1)
 * - Yellow overlay on pixels clipped in both highlights and shadows simultaneously
 * - Configurable colors and opacity
 * - Real-time updates during grading
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { luminanceRec709 } from '../../color/ColorProcessingFacade';

export interface ClippingOverlayState {
  enabled: boolean;
  showHighlights: boolean;
  showShadows: boolean;
  highlightColor: { r: number; g: number; b: number };
  shadowColor: { r: number; g: number; b: number };
  bothColor: { r: number; g: number; b: number };
  opacity: number;
  /** Shadow threshold in normalized 0.0-1.0 range (default 0.0, maps to <= 1 in 0-255 space) */
  shadowThreshold: number;
  /** Highlight threshold in normalized 0.0-1.0 range (default 1.0, maps to >= 254 in 0-255 space) */
  highlightThreshold: number;
}

export const DEFAULT_CLIPPING_OVERLAY_STATE: ClippingOverlayState = {
  enabled: false,
  showHighlights: true,
  showShadows: true,
  highlightColor: { r: 255, g: 0, b: 0 }, // Red for highlights
  shadowColor: { r: 0, g: 100, b: 255 }, // Blue for shadows
  bothColor: { r: 250, g: 204, b: 21 }, // Yellow for both clipped
  opacity: 0.7,
  shadowThreshold: 0.0,
  highlightThreshold: 1.0,
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
    const {
      showHighlights,
      showShadows,
      highlightColor,
      shadowColor,
      bothColor,
      opacity,
      shadowThreshold,
      highlightThreshold,
    } = this.state;
    const len = data.length;

    // Pre-calculate blended colors
    const blendFactor = opacity;
    const invBlend = 1 - blendFactor;

    // Convert normalized thresholds (0.0-1.0) to 0-255 space
    // Shadow default 0.0 maps to 1 (floor(0.0 * 253 + 1) = 1), highlight default 1.0 maps to 254 (ceil(1.0 * 253 + 1) = 254)
    const shadowLimit = Math.floor(shadowThreshold * 253 + 1);
    const highlightLimit = Math.ceil(highlightThreshold * 253 + 1);

    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      // Calculate luminance to detect clipping
      const luma = luminanceRec709(r, g, b);

      // Check for highlight clipping (any channel at or above highlight limit)
      const isHighlightClipped =
        showHighlights && (r >= highlightLimit || g >= highlightLimit || b >= highlightLimit || luma >= highlightLimit);

      // Check for shadow clipping (all channels at or below shadow limit)
      const isShadowClipped = showShadows && r <= shadowLimit && g <= shadowLimit && b <= shadowLimit;

      if (isHighlightClipped && isShadowClipped) {
        // Blend with both color (yellow) - both clipped takes highest priority
        data[i] = Math.round(r * invBlend + bothColor.r * blendFactor);
        data[i + 1] = Math.round(g * invBlend + bothColor.g * blendFactor);
        data[i + 2] = Math.round(b * invBlend + bothColor.b * blendFactor);
      } else if (isHighlightClipped) {
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
   * Set both-clipped color (used when a pixel is clipped in both highlights and shadows)
   */
  setBothColor(color: { r: number; g: number; b: number }): void {
    if (
      this.state.bothColor.r === color.r &&
      this.state.bothColor.g === color.g &&
      this.state.bothColor.b === color.b
    ) {
      return;
    }
    this.state.bothColor = { ...color };
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
   * Set shadow threshold (0.0-1.0 normalized)
   * 0.0 = only flag pixels with channels <= 1 (default)
   * Higher values flag more pixels as shadow-clipped
   */
  setShadowThreshold(threshold: number): void {
    const clamped = Math.max(0, Math.min(1, threshold));
    if (this.state.shadowThreshold === clamped) return;
    this.state.shadowThreshold = clamped;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Set highlight threshold (0.0-1.0 normalized)
   * 1.0 = only flag pixels with channels >= 254 (default)
   * Lower values flag more pixels as highlight-clipped
   */
  setHighlightThreshold(threshold: number): void {
    const clamped = Math.max(0, Math.min(1, threshold));
    if (this.state.highlightThreshold === clamped) return;
    this.state.highlightThreshold = clamped;
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
