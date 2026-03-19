/**
 * SafeAreasOverlay - Overlay for broadcast safe areas, aspect ratio guides, and composition helpers
 *
 * Features:
 * - Title safe area (90% of frame, per SMPTE RP 2046-2:2018)
 * - Action safe area (93% of frame, per SMPTE RP 2046-2:2018)
 * - Custom aspect ratio overlays (16:9, 2.39:1, 4:3, 1:1, etc.)
 * - Center crosshair
 * - Rule of thirds grid
 * - Customizable colors and opacity
 */

import type { EventMap } from '../../utils/EventEmitter';
import type { CropRegion } from './CropControl';
import { CanvasOverlay } from './CanvasOverlay';

export interface SafeAreasEvents extends EventMap {
  stateChanged: SafeAreasState;
}

export interface SafeAreasState {
  enabled: boolean;
  titleSafe: boolean;
  actionSafe: boolean;
  customSafeArea: boolean;
  customSafeAreaPercentage: number;
  centerCrosshair: boolean;
  ruleOfThirds: boolean;
  aspectRatio: AspectRatioGuide | null;
  guideColor: string;
  guideOpacity: number;
}

/**
 * Default distinct colors for each safe zone type.
 * Used when multiple safe zones are active simultaneously for visual clarity.
 */
export const SAFE_ZONE_COLORS: Record<'title' | 'action' | 'custom', string> = {
  title: '#00ff00', // green
  action: '#ffffff', // white
  custom: '#ff9900', // orange
};

export type AspectRatioGuide = '16:9' | '4:3' | '1:1' | '2.39:1' | '2.35:1' | '1.85:1' | '9:16' | 'custom';

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
  customSafeArea: false,
  customSafeAreaPercentage: 85,
  centerCrosshair: false,
  ruleOfThirds: false,
  aspectRatio: null,
  guideColor: '#ffffff',
  guideOpacity: 0.5,
};

export class SafeAreasOverlay extends CanvasOverlay<SafeAreasEvents> {
  private state: SafeAreasState = { ...DEFAULT_SAFE_AREAS_STATE };
  private customAspectRatio = 1;
  private cropRegion: CropRegion | null = null;

  constructor() {
    super('safe-areas-overlay', 'safe-areas-overlay', 45);
  }

  /**
   * Set the complete state
   */
  setState(state: Partial<SafeAreasState>): void {
    this.state = { ...this.state, ...state };
    this.updateCanvasDisplay();
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
   * Toggle custom safe area
   */
  toggleCustomSafeArea(): void {
    this.setState({ customSafeArea: !this.state.customSafeArea });
  }

  /**
   * Set custom safe area percentage (1-99)
   */
  setCustomSafeAreaPercentage(percentage: number): void {
    const clamped = Math.max(1, Math.min(99, Math.round(percentage)));
    this.setState({ customSafeAreaPercentage: clamped });
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

  getCustomAspectRatio(): number {
    return this.customAspectRatio;
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
   * Set the active crop region. When non-null, safe areas and all other
   * guides are calculated relative to the cropped sub-region instead of
   * the full display area. Pass `null` to revert to full-display mode.
   *
   * The crop region uses normalized coordinates (0-1) relative to the
   * display area, matching the CropRegion type used by CropManager.
   */
  setCropRegion(region: CropRegion | null): void {
    this.cropRegion = region;
    if (this.isVisible()) {
      this.render();
    }
  }

  /**
   * Get the current crop region, or null if not set.
   */
  getCropRegion(): CropRegion | null {
    return this.cropRegion ? { ...this.cropRegion } : null;
  }

  /**
   * Compute the effective drawing bounds, accounting for the crop region
   * when active. Returns the offset and dimensions that all drawing
   * methods should use instead of raw offsetX/offsetY/displayWidth/displayHeight.
   */
  private getEffectiveBounds(): { eOffsetX: number; eOffsetY: number; eWidth: number; eHeight: number } {
    if (this.cropRegion) {
      const eOffsetX = this.offsetX + this.displayWidth * this.cropRegion.x;
      const eOffsetY = this.offsetY + this.displayHeight * this.cropRegion.y;
      const eWidth = this.displayWidth * this.cropRegion.width;
      const eHeight = this.displayHeight * this.cropRegion.height;
      return { eOffsetX, eOffsetY, eWidth, eHeight };
    }
    return {
      eOffsetX: this.offsetX,
      eOffsetY: this.offsetY,
      eWidth: this.displayWidth,
      eHeight: this.displayHeight,
    };
  }

  /**
   * Determine the effective color for a safe zone type.
   * When multiple safe zones are active simultaneously, each uses its
   * distinct color from SAFE_ZONE_COLORS for visual clarity.
   * When only one safe zone is active, the user-configured guideColor is used.
   */
  private getSafeZoneColor(type: 'title' | 'action' | 'custom'): string {
    const activeCount = [this.state.titleSafe, this.state.actionSafe, this.state.customSafeArea].filter(Boolean).length;
    if (activeCount > 1) {
      return SAFE_ZONE_COLORS[type];
    }
    return this.state.guideColor;
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
      this.drawSafeArea(0.93, this.getSafeZoneColor('action'), alpha, 'action', 4);
    }

    if (this.state.titleSafe) {
      this.drawSafeArea(0.9, this.getSafeZoneColor('title'), alpha, 'title', 18);
    }

    if (this.state.customSafeArea) {
      this.drawSafeArea(
        this.state.customSafeAreaPercentage / 100,
        this.getSafeZoneColor('custom'),
        alpha,
        'custom',
        32,
      );
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
    type: 'title' | 'action' | 'custom',
    labelOffset: number = 4,
  ): void {
    const { ctx } = this;
    const { eOffsetX, eOffsetY, eWidth, eHeight } = this.getEffectiveBounds();

    const margin = (1 - percentage) / 2;
    const x = eOffsetX + eWidth * margin;
    const y = eOffsetY + eHeight * margin;
    const w = eWidth * percentage;
    const h = eHeight * percentage;

    ctx.strokeStyle = this.hexToRgba(color, alpha);
    ctx.lineWidth = type === 'title' ? 1 : type === 'custom' ? 1 : 1.5;

    if (type === 'title') {
      ctx.setLineDash([4, 4]);
    } else if (type === 'custom') {
      ctx.setLineDash([6, 3]);
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
    let label: string;
    if (type === 'title') {
      label = 'Title Safe';
    } else if (type === 'action') {
      label = 'Action Safe';
    } else {
      label = `Custom (${Math.round(percentage * 100)}%)`;
    }
    ctx.fillText(label, x + 4, y + labelOffset);
  }

  /**
   * Draw aspect ratio letterbox/pillarbox guides
   */
  private drawAspectRatioGuide(color: string, alpha: number): void {
    const { ctx } = this;
    const { eOffsetX, eOffsetY, eWidth, eHeight } = this.getEffectiveBounds();

    const targetRatio =
      this.state.aspectRatio === 'custom' ? this.customAspectRatio : ASPECT_RATIOS[this.state.aspectRatio!].ratio;

    const currentRatio = eWidth / eHeight;

    ctx.fillStyle = this.hexToRgba('#000000', 0.6);

    if (targetRatio > currentRatio) {
      // Letterbox (bars top and bottom)
      const newHeight = eWidth / targetRatio;
      const barHeight = (eHeight - newHeight) / 2;

      // Top bar
      ctx.fillRect(eOffsetX, eOffsetY, eWidth, barHeight);
      // Bottom bar
      ctx.fillRect(eOffsetX, eOffsetY + eHeight - barHeight, eWidth, barHeight);

      // Draw border lines
      ctx.strokeStyle = this.hexToRgba(color, alpha);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(eOffsetX, eOffsetY + barHeight);
      ctx.lineTo(eOffsetX + eWidth, eOffsetY + barHeight);
      ctx.moveTo(eOffsetX, eOffsetY + eHeight - barHeight);
      ctx.lineTo(eOffsetX + eWidth, eOffsetY + eHeight - barHeight);
      ctx.stroke();
    } else if (targetRatio < currentRatio) {
      // Pillarbox (bars left and right)
      const newWidth = eHeight * targetRatio;
      const barWidth = (eWidth - newWidth) / 2;

      // Left bar
      ctx.fillRect(eOffsetX, eOffsetY, barWidth, eHeight);
      // Right bar
      ctx.fillRect(eOffsetX + eWidth - barWidth, eOffsetY, barWidth, eHeight);

      // Draw border lines
      ctx.strokeStyle = this.hexToRgba(color, alpha);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(eOffsetX + barWidth, eOffsetY);
      ctx.lineTo(eOffsetX + barWidth, eOffsetY + eHeight);
      ctx.moveTo(eOffsetX + eWidth - barWidth, eOffsetY);
      ctx.lineTo(eOffsetX + eWidth - barWidth, eOffsetY + eHeight);
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
    ctx.fillText(label, eOffsetX + eWidth - 8, eOffsetY + eHeight - 8);
  }

  /**
   * Draw rule of thirds grid
   */
  private drawRuleOfThirds(color: string, alpha: number): void {
    const { ctx } = this;
    const { eOffsetX, eOffsetY, eWidth, eHeight } = this.getEffectiveBounds();

    ctx.strokeStyle = this.hexToRgba(color, alpha * 0.6);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    // Vertical lines
    for (let i = 1; i <= 2; i++) {
      const x = eOffsetX + (eWidth * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, eOffsetY);
      ctx.lineTo(x, eOffsetY + eHeight);
      ctx.stroke();
    }

    // Horizontal lines
    for (let i = 1; i <= 2; i++) {
      const y = eOffsetY + (eHeight * i) / 3;
      ctx.beginPath();
      ctx.moveTo(eOffsetX, y);
      ctx.lineTo(eOffsetX + eWidth, y);
      ctx.stroke();
    }

    // Draw intersection points (power points)
    ctx.fillStyle = this.hexToRgba(color, alpha);
    const pointRadius = 3;
    for (let i = 1; i <= 2; i++) {
      for (let j = 1; j <= 2; j++) {
        const x = eOffsetX + (eWidth * i) / 3;
        const y = eOffsetY + (eHeight * j) / 3;
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
    const { ctx } = this;
    const { eOffsetX, eOffsetY, eWidth, eHeight } = this.getEffectiveBounds();

    const centerX = eOffsetX + eWidth / 2;
    const centerY = eOffsetY + eHeight / 2;
    const size = Math.min(eWidth, eHeight) * 0.05;
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
}
