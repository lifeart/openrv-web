/**
 * SafeAreasOverlay - Overlay for broadcast safe areas, aspect ratio guides, and composition helpers
 *
 * Features:
 * - Title safe area (80% of frame)
 * - Action safe area (90% of frame)
 * - Custom aspect ratio overlays (16:9, 2.39:1, 4:3, 1:1, etc.)
 * - Center crosshair
 * - Rule of thirds grid
 * - Customizable colors and opacity
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { setupHiDPICanvas } from '../../utils/HiDPICanvas';

export interface SafeAreasEvents extends EventMap {
  stateChanged: SafeAreasState;
}

export interface SafeAreasState {
  enabled: boolean;
  titleSafe: boolean;
  actionSafe: boolean;
  centerCrosshair: boolean;
  ruleOfThirds: boolean;
  aspectRatio: AspectRatioGuide | null;
  guideColor: string;
  guideOpacity: number;
}

export type AspectRatioGuide =
  | '16:9'
  | '4:3'
  | '1:1'
  | '2.39:1'
  | '2.35:1'
  | '1.85:1'
  | '9:16'
  | 'custom';

export interface AspectRatioDefinition {
  label: string;
  ratio: number; // width / height
}

export const ASPECT_RATIOS: Record<AspectRatioGuide, AspectRatioDefinition> = {
  '16:9': { label: '16:9 (HD)', ratio: 16 / 9 },
  '4:3': { label: '4:3 (SD)', ratio: 4 / 3 },
  '1:1': { label: '1:1 (Square)', ratio: 1 },
  '2.39:1': { label: '2.39:1 (Scope)', ratio: 2.39 },
  '2.35:1': { label: '2.35:1 (Cinemascope)', ratio: 2.35 },
  '1.85:1': { label: '1.85:1 (Flat)', ratio: 1.85 },
  '9:16': { label: '9:16 (Vertical)', ratio: 9 / 16 },
  custom: { label: 'Custom', ratio: 1 },
};

export const DEFAULT_SAFE_AREAS_STATE: SafeAreasState = {
  enabled: false,
  titleSafe: true,
  actionSafe: true,
  centerCrosshair: false,
  ruleOfThirds: false,
  aspectRatio: null,
  guideColor: '#ffffff',
  guideOpacity: 0.5,
};

export class SafeAreasOverlay extends EventEmitter<SafeAreasEvents> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: SafeAreasState = { ...DEFAULT_SAFE_AREAS_STATE };
  private displayWidth = 0;
  private displayHeight = 0;
  private offsetX = 0;
  private offsetY = 0;
  private customAspectRatio = 1;
  private canvasWidth = 0;
  private canvasHeight = 0;

  constructor() {
    super();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'safe-areas-overlay';
    this.canvas.dataset.testid = 'safe-areas-overlay';
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 45;
    `;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for safe areas overlay');
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
    // Store logical dimensions
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    // Setup hi-DPI canvas with logical dimensions
    setupHiDPICanvas({
      canvas: this.canvas,
      ctx: this.ctx,
      width: canvasWidth,
      height: canvasHeight,
      setStyle: false, // CSS positioning is handled by parent
    });

    if (this.state.enabled) {
      this.render();
    }
  }

  /**
   * Set the complete state
   */
  setState(state: Partial<SafeAreasState>): void {
    this.state = { ...this.state, ...state };
    this.render();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current state
   */
  getState(): SafeAreasState {
    return { ...this.state };
  }

  /**
   * Toggle safe areas overlay on/off
   */
  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  /**
   * Enable overlay
   */
  enable(): void {
    this.setState({ enabled: true });
  }

  /**
   * Disable overlay
   */
  disable(): void {
    this.setState({ enabled: false });
  }

  /**
   * Toggle title safe area
   */
  toggleTitleSafe(): void {
    this.setState({ titleSafe: !this.state.titleSafe });
  }

  /**
   * Toggle action safe area
   */
  toggleActionSafe(): void {
    this.setState({ actionSafe: !this.state.actionSafe });
  }

  /**
   * Toggle center crosshair
   */
  toggleCenterCrosshair(): void {
    this.setState({ centerCrosshair: !this.state.centerCrosshair });
  }

  /**
   * Toggle rule of thirds grid
   */
  toggleRuleOfThirds(): void {
    this.setState({ ruleOfThirds: !this.state.ruleOfThirds });
  }

  /**
   * Set aspect ratio guide
   */
  setAspectRatio(ratio: AspectRatioGuide | null): void {
    this.setState({ aspectRatio: ratio });
  }

  /**
   * Set custom aspect ratio value
   */
  setCustomAspectRatio(ratio: number): void {
    this.customAspectRatio = ratio;
    if (this.state.aspectRatio === 'custom') {
      this.render();
    }
  }

  /**
   * Set guide color
   */
  setGuideColor(color: string): void {
    this.setState({ guideColor: color });
  }

  /**
   * Set guide opacity (0-1)
   */
  setGuideOpacity(opacity: number): void {
    this.setState({ guideOpacity: Math.max(0, Math.min(1, opacity)) });
  }

  /**
   * Render all enabled guides
   */
  render(): void {
    const { ctx, canvasWidth, canvasHeight } = this;

    // Clear canvas using logical dimensions (hi-DPI context is scaled)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!this.state.enabled || this.displayWidth === 0 || this.displayHeight === 0) {
      return;
    }

    // Set up drawing style
    const color = this.state.guideColor;
    const alpha = this.state.guideOpacity;

    // Draw in order: aspect ratio (fills), safe areas (lines), grid, crosshair
    if (this.state.aspectRatio) {
      this.drawAspectRatioGuide(color, alpha);
    }

    if (this.state.actionSafe) {
      this.drawSafeArea(0.9, color, alpha, 'action');
    }

    if (this.state.titleSafe) {
      this.drawSafeArea(0.8, color, alpha, 'title');
    }

    if (this.state.ruleOfThirds) {
      this.drawRuleOfThirds(color, alpha);
    }

    if (this.state.centerCrosshair) {
      this.drawCenterCrosshair(color, alpha);
    }
  }

  /**
   * Draw a safe area rectangle
   */
  private drawSafeArea(
    percentage: number,
    color: string,
    alpha: number,
    type: 'title' | 'action'
  ): void {
    const { ctx } = this;
    const { offsetX, offsetY, displayWidth, displayHeight } = this;

    const margin = (1 - percentage) / 2;
    const x = offsetX + displayWidth * margin;
    const y = offsetY + displayHeight * margin;
    const w = displayWidth * percentage;
    const h = displayHeight * percentage;

    ctx.strokeStyle = this.hexToRgba(color, alpha);
    ctx.lineWidth = type === 'title' ? 1 : 1.5;

    if (type === 'title') {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Draw label
    ctx.fillStyle = this.hexToRgba(color, alpha * 0.8);
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const label = type === 'title' ? 'Title Safe' : 'Action Safe';
    ctx.fillText(label, x + 4, y + 4);
  }

  /**
   * Draw aspect ratio letterbox/pillarbox guides
   */
  private drawAspectRatioGuide(color: string, alpha: number): void {
    const { ctx, offsetX, offsetY, displayWidth, displayHeight } = this;

    const targetRatio =
      this.state.aspectRatio === 'custom'
        ? this.customAspectRatio
        : ASPECT_RATIOS[this.state.aspectRatio!].ratio;

    const currentRatio = displayWidth / displayHeight;

    ctx.fillStyle = this.hexToRgba('#000000', 0.6);

    if (targetRatio > currentRatio) {
      // Letterbox (bars top and bottom)
      const newHeight = displayWidth / targetRatio;
      const barHeight = (displayHeight - newHeight) / 2;

      // Top bar
      ctx.fillRect(offsetX, offsetY, displayWidth, barHeight);
      // Bottom bar
      ctx.fillRect(offsetX, offsetY + displayHeight - barHeight, displayWidth, barHeight);

      // Draw border lines
      ctx.strokeStyle = this.hexToRgba(color, alpha);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + barHeight);
      ctx.lineTo(offsetX + displayWidth, offsetY + barHeight);
      ctx.moveTo(offsetX, offsetY + displayHeight - barHeight);
      ctx.lineTo(offsetX + displayWidth, offsetY + displayHeight - barHeight);
      ctx.stroke();
    } else if (targetRatio < currentRatio) {
      // Pillarbox (bars left and right)
      const newWidth = displayHeight * targetRatio;
      const barWidth = (displayWidth - newWidth) / 2;

      // Left bar
      ctx.fillRect(offsetX, offsetY, barWidth, displayHeight);
      // Right bar
      ctx.fillRect(offsetX + displayWidth - barWidth, offsetY, barWidth, displayHeight);

      // Draw border lines
      ctx.strokeStyle = this.hexToRgba(color, alpha);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(offsetX + barWidth, offsetY);
      ctx.lineTo(offsetX + barWidth, offsetY + displayHeight);
      ctx.moveTo(offsetX + displayWidth - barWidth, offsetY);
      ctx.lineTo(offsetX + displayWidth - barWidth, offsetY + displayHeight);
      ctx.stroke();
    }

    // Draw aspect ratio label
    const label =
      this.state.aspectRatio === 'custom'
        ? `${this.customAspectRatio.toFixed(2)}:1`
        : ASPECT_RATIOS[this.state.aspectRatio!].label;

    ctx.fillStyle = this.hexToRgba(color, alpha * 0.8);
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, offsetX + displayWidth - 8, offsetY + displayHeight - 8);
  }

  /**
   * Draw rule of thirds grid
   */
  private drawRuleOfThirds(color: string, alpha: number): void {
    const { ctx, offsetX, offsetY, displayWidth, displayHeight } = this;

    ctx.strokeStyle = this.hexToRgba(color, alpha * 0.6);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    // Vertical lines
    for (let i = 1; i <= 2; i++) {
      const x = offsetX + (displayWidth * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + displayHeight);
      ctx.stroke();
    }

    // Horizontal lines
    for (let i = 1; i <= 2; i++) {
      const y = offsetY + (displayHeight * i) / 3;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + displayWidth, y);
      ctx.stroke();
    }

    // Draw intersection points (power points)
    ctx.fillStyle = this.hexToRgba(color, alpha);
    const pointRadius = 3;
    for (let i = 1; i <= 2; i++) {
      for (let j = 1; j <= 2; j++) {
        const x = offsetX + (displayWidth * i) / 3;
        const y = offsetY + (displayHeight * j) / 3;
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Draw center crosshair
   */
  private drawCenterCrosshair(color: string, alpha: number): void {
    const { ctx, offsetX, offsetY, displayWidth, displayHeight } = this;

    const centerX = offsetX + displayWidth / 2;
    const centerY = offsetY + displayHeight / 2;
    const size = Math.min(displayWidth, displayHeight) * 0.05;
    const gap = size * 0.3;

    ctx.strokeStyle = this.hexToRgba(color, alpha);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    // Horizontal lines (with gap in center)
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY);
    ctx.lineTo(centerX - gap, centerY);
    ctx.moveTo(centerX + gap, centerY);
    ctx.lineTo(centerX + size, centerY);
    ctx.stroke();

    // Vertical lines (with gap in center)
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size);
    ctx.lineTo(centerX, centerY - gap);
    ctx.moveTo(centerX, centerY + gap);
    ctx.lineTo(centerX, centerY + size);
    ctx.stroke();

    // Center point
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Convert hex color to rgba string
   */
  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1]!, 16);
      const g = parseInt(result[2]!, 16);
      const b = parseInt(result[3]!, 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(255, 255, 255, ${alpha})`;
  }

  /**
   * Check if overlay is visible
   */
  isVisible(): boolean {
    return this.state.enabled;
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
