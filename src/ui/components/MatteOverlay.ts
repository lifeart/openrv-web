/**
 * MatteOverlay - Overlay for letterbox/pillarbox matte display
 *
 * Features:
 * - Letterbox (horizontal bars) for wide aspect ratios
 * - Pillarbox (vertical bars) for narrow aspect ratios
 * - Configurable aspect ratio, opacity, and center point
 * - Session-driven from GTO matte settings
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { setupHiDPICanvas } from '../../utils/HiDPICanvas';
import type { MatteSettings } from '../../core/session/Session';

export interface MatteOverlayEvents extends EventMap {
  settingsChanged: MatteSettings;
}

export const DEFAULT_MATTE_SETTINGS: MatteSettings = {
  show: false,
  aspect: 1.78,       // 16:9
  opacity: 0.66,
  heightVisible: -1,  // auto
  centerPoint: [0, 0],
};

export class MatteOverlay extends EventEmitter<MatteOverlayEvents> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: MatteSettings = { ...DEFAULT_MATTE_SETTINGS };
  private displayWidth = 0;
  private displayHeight = 0;
  private offsetX = 0;
  private offsetY = 0;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private sourceAspect = 1; // Aspect ratio of the source content

  constructor() {
    super();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'matte-overlay';
    this.canvas.dataset.testid = 'matte-overlay';
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 40;
    `;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for matte overlay');
    this.ctx = ctx;
  }

  /**
   * Update canvas size and position to match viewer
   * canvasWidth/canvasHeight are logical (CSS) dimensions
   */
  setViewerDimensions(
    canvasWidth: number,
    canvasHeight: number,
    offsetX: number,
    offsetY: number,
    displayWidth: number,
    displayHeight: number
  ): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    // Calculate source aspect from display dimensions
    if (displayWidth > 0 && displayHeight > 0) {
      this.sourceAspect = displayWidth / displayHeight;
    }

    // Setup hi-DPI canvas with logical dimensions
    setupHiDPICanvas({
      canvas: this.canvas,
      ctx: this.ctx,
      width: canvasWidth,
      height: canvasHeight,
      setStyle: false,
    });

    if (this.settings.show) {
      this.render();
    }
  }

  /**
   * Set the matte settings from session
   */
  setSettings(settings: Partial<MatteSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.render();
    this.emit('settingsChanged', { ...this.settings });
  }

  /**
   * Get current settings
   */
  getSettings(): MatteSettings {
    return { ...this.settings };
  }

  /**
   * Toggle matte overlay on/off
   */
  toggle(): void {
    this.setSettings({ show: !this.settings.show });
  }

  /**
   * Enable matte overlay
   */
  enable(): void {
    this.setSettings({ show: true });
  }

  /**
   * Disable matte overlay
   */
  disable(): void {
    this.setSettings({ show: false });
  }

  /**
   * Set matte aspect ratio
   */
  setAspect(aspect: number): void {
    this.setSettings({ aspect: Math.max(0.1, Math.min(10, aspect)) });
  }

  /**
   * Set matte opacity (0-1)
   */
  setOpacity(opacity: number): void {
    this.setSettings({ opacity: Math.max(0, Math.min(1, opacity)) });
  }

  /**
   * Set center point offset
   */
  setCenterPoint(x: number, y: number): void {
    this.setSettings({ centerPoint: [x, y] });
  }

  /**
   * Render the matte overlay
   */
  render(): void {
    const { ctx, canvasWidth, canvasHeight } = this;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!this.settings.show || this.displayWidth === 0 || this.displayHeight === 0) {
      return;
    }

    const targetAspect = this.settings.aspect;
    const currentAspect = this.sourceAspect;
    const opacity = this.settings.opacity;
    const [centerOffsetX, centerOffsetY] = this.settings.centerPoint;

    // Set matte color (black with opacity)
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;

    if (targetAspect > currentAspect) {
      // Letterbox: target is wider than source, add horizontal bars
      this.drawLetterbox(targetAspect, centerOffsetY);
    } else if (targetAspect < currentAspect) {
      // Pillarbox: target is narrower than source, add vertical bars
      this.drawPillarbox(targetAspect, centerOffsetX);
    }
    // If aspects match, no matte needed
  }

  /**
   * Draw letterbox (horizontal bars top and bottom)
   */
  private drawLetterbox(targetAspect: number, centerOffsetY: number): void {
    const { ctx, offsetX, offsetY, displayWidth, displayHeight, settings } = this;

    let visibleHeight: number;

    if (settings.heightVisible > 0 && settings.heightVisible <= 1) {
      // Use explicit height visible fraction
      visibleHeight = displayHeight * settings.heightVisible;
    } else {
      // Calculate from aspect ratio
      visibleHeight = displayWidth / targetAspect;
    }

    const barHeight = (displayHeight - visibleHeight) / 2;

    // Apply center offset (normalized -1 to 1 range)
    const offsetAdjust = centerOffsetY * barHeight;

    // Top bar
    const topBarHeight = Math.max(0, barHeight - offsetAdjust);
    if (topBarHeight > 0) {
      ctx.fillRect(offsetX, offsetY, displayWidth, topBarHeight);
    }

    // Bottom bar
    const bottomBarHeight = Math.max(0, barHeight + offsetAdjust);
    if (bottomBarHeight > 0) {
      ctx.fillRect(
        offsetX,
        offsetY + displayHeight - bottomBarHeight,
        displayWidth,
        bottomBarHeight
      );
    }
  }

  /**
   * Draw pillarbox (vertical bars left and right)
   */
  private drawPillarbox(targetAspect: number, centerOffsetX: number): void {
    const { ctx, offsetX, offsetY, displayWidth, displayHeight } = this;

    const visibleWidth = displayHeight * targetAspect;
    const barWidth = (displayWidth - visibleWidth) / 2;

    // Apply center offset (normalized -1 to 1 range)
    const offsetAdjust = centerOffsetX * barWidth;

    // Left bar
    const leftBarWidth = Math.max(0, barWidth - offsetAdjust);
    if (leftBarWidth > 0) {
      ctx.fillRect(offsetX, offsetY, leftBarWidth, displayHeight);
    }

    // Right bar
    const rightBarWidth = Math.max(0, barWidth + offsetAdjust);
    if (rightBarWidth > 0) {
      ctx.fillRect(
        offsetX + displayWidth - rightBarWidth,
        offsetY,
        rightBarWidth,
        displayHeight
      );
    }
  }

  /**
   * Check if matte overlay is visible
   */
  isVisible(): boolean {
    return this.settings.show;
  }

  /**
   * Get the canvas element
   */
  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Dispose
   */
  dispose(): void {
    // No cleanup needed
  }
}
