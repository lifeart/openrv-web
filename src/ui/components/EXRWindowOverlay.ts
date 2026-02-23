/**
 * EXRWindowOverlay - Displays data window and display window boundaries for EXR images
 *
 * When viewing EXR files, the data window (actual pixel data region) and display window
 * (intended viewing region) may differ. This overlay draws dashed rectangles showing
 * both boundaries:
 * - Data window: shown in green dashed outline
 * - Display window: shown in cyan dashed outline
 *
 * This helps artists see the relationship between the cropped pixel data
 * and the intended display area (uncrop visualization).
 */

import type { EventMap } from '../../utils/EventEmitter';
import type { EXRBox2i } from '../../formats/EXRDecoder';
import { CanvasOverlay } from './CanvasOverlay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EXRWindowOverlayState {
  enabled: boolean;
  /** Show the data window boundary */
  showDataWindow: boolean;
  /** Show the display window boundary */
  showDisplayWindow: boolean;
  /** Color for data window outline */
  dataWindowColor: string;
  /** Color for display window outline */
  displayWindowColor: string;
  /** Line width for outlines */
  lineWidth: number;
  /** Dash pattern for outlines [dash, gap] */
  dashPattern: [number, number];
  /** Show labels */
  showLabels: boolean;
}

export interface EXRWindowOverlayEvents extends EventMap {
  stateChanged: EXRWindowOverlayState;
}

export const DEFAULT_EXR_WINDOW_OVERLAY_STATE: EXRWindowOverlayState = {
  enabled: false,
  showDataWindow: true,
  showDisplayWindow: true,
  dataWindowColor: '#00ff00',
  displayWindowColor: '#00ccff',
  lineWidth: 2,
  dashPattern: [6, 4],
  showLabels: true,
};

// ---------------------------------------------------------------------------
// EXRWindowOverlay
// ---------------------------------------------------------------------------

export class EXRWindowOverlay extends CanvasOverlay<EXRWindowOverlayEvents> {
  private state: EXRWindowOverlayState = { ...DEFAULT_EXR_WINDOW_OVERLAY_STATE };
  private dataWindow: EXRBox2i | null = null;
  private displayWindow: EXRBox2i | null = null;

  constructor() {
    super('exr-window-overlay', 'exr-window-overlay', 42);
  }

  // -------------------------------------------------------------------------
  // Window data
  // -------------------------------------------------------------------------

  /**
   * Set the EXR windows to display.
   * Both windows should be provided in pixel coordinates from the EXR header.
   */
  setWindows(dataWindow: EXRBox2i, displayWindow: EXRBox2i): void {
    this.dataWindow = { ...dataWindow };
    this.displayWindow = { ...displayWindow };
    this.render();
  }

  /**
   * Clear the windows (e.g. when a non-EXR file is loaded)
   */
  clearWindows(): void {
    this.dataWindow = null;
    this.displayWindow = null;
    this.render();
  }

  /**
   * Check if windows are set
   */
  hasWindows(): boolean {
    return this.dataWindow !== null && this.displayWindow !== null;
  }

  /**
   * Get the current data window
   */
  getDataWindow(): EXRBox2i | null {
    return this.dataWindow ? { ...this.dataWindow } : null;
  }

  /**
   * Get the current display window
   */
  getDisplayWindow(): EXRBox2i | null {
    return this.displayWindow ? { ...this.displayWindow } : null;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  getState(): EXRWindowOverlayState {
    return { ...this.state };
  }

  setState(partial: Partial<EXRWindowOverlayState>): void {
    this.state = { ...this.state, ...partial };
    this.render();
    this.emit('stateChanged', { ...this.state });
  }

  // -------------------------------------------------------------------------
  // Toggle / Enable / Disable
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

  // -------------------------------------------------------------------------
  // Individual window visibility
  // -------------------------------------------------------------------------

  setShowDataWindow(show: boolean): void {
    this.setState({ showDataWindow: show });
  }

  setShowDisplayWindow(show: boolean): void {
    this.setState({ showDisplayWindow: show });
  }

  // -------------------------------------------------------------------------
  // Colors
  // -------------------------------------------------------------------------

  setDataWindowColor(color: string): void {
    this.setState({ dataWindowColor: color });
  }

  setDisplayWindowColor(color: string): void {
    this.setState({ displayWindowColor: color });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(): void {
    const { ctx, canvasWidth, canvasHeight } = this;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!this.state.enabled || !this.dataWindow || !this.displayWindow) {
      return;
    }

    if (this.displayWidth === 0 || this.displayHeight === 0) {
      return;
    }

    const dw = this.dataWindow;
    const dispW = this.displayWindow;

    // The display window defines the full image region that is rendered on screen.
    // We need to map EXR pixel coordinates to canvas pixel coordinates.
    const dispWidth = dispW.xMax - dispW.xMin + 1;
    const dispHeight = dispW.yMax - dispW.yMin + 1;

    if (dispWidth <= 0 || dispHeight <= 0) return;

    // Scale from EXR pixels to display pixels
    const scaleX = this.displayWidth / dispWidth;
    const scaleY = this.displayHeight / dispHeight;

    // Map an EXR box to canvas coordinates
    const mapBox = (box: EXRBox2i): { x: number; y: number; w: number; h: number } => {
      const x = this.offsetX + (box.xMin - dispW.xMin) * scaleX;
      const y = this.offsetY + (box.yMin - dispW.yMin) * scaleY;
      const w = (box.xMax - box.xMin + 1) * scaleX;
      const h = (box.yMax - box.yMin + 1) * scaleY;
      return { x, y, w, h };
    };

    ctx.save();
    ctx.lineWidth = this.state.lineWidth;
    ctx.setLineDash(this.state.dashPattern);

    // Draw display window
    if (this.state.showDisplayWindow) {
      const rect = mapBox(dispW);
      ctx.strokeStyle = this.state.displayWindowColor;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      if (this.state.showLabels) {
        this.drawLabel(
          ctx,
          'Display Window',
          rect.x + 4,
          rect.y + 14,
          this.state.displayWindowColor,
        );
      }
    }

    // Draw data window
    if (this.state.showDataWindow) {
      const rect = mapBox(dw);
      ctx.strokeStyle = this.state.dataWindowColor;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      if (this.state.showLabels) {
        this.drawLabel(
          ctx,
          'Data Window',
          rect.x + 4,
          rect.y + rect.h - 6,
          this.state.dataWindowColor,
        );
      }
    }

    ctx.restore();
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = '11px monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Draw background for readability
    const metrics = ctx.measureText(text);
    const padding = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(
      x - padding,
      y - 11 - padding,
      metrics.width + padding * 2,
      14 + padding * 2,
    );

    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Visibility / Disposal
  // -------------------------------------------------------------------------

  isVisible(): boolean {
    return this.state.enabled;
  }
}
