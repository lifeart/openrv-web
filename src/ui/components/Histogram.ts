/**
 * Histogram - Real-time histogram display for analyzing image luminance and color distribution
 *
 * Features:
 * - Per-channel (R/G/B) histograms displayed superimposed or separately
 * - Luminance histogram using Rec.709 coefficients
 * - Logarithmic scale option for HDR content
 * - Real-time updates on frame changes
 * - Draggable overlay display
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { LUMINANCE_COEFFICIENTS } from './ChannelSelect';
import { getSharedScopesProcessor } from '../../scopes/WebGLScopes';
import {
  createDraggableContainer,
  createControlButton,
  DraggableContainer,
} from './shared/DraggableContainer';

export type HistogramMode = 'rgb' | 'luminance' | 'separate';

export interface HistogramData {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  luminance: Uint32Array;
  maxValue: number;
  pixelCount: number;
  // Clipping statistics
  clipping: {
    shadows: number;      // Pixels at 0 (black)
    highlights: number;   // Pixels at 255 (white)
    shadowsPercent: number;
    highlightsPercent: number;
  };
}

export interface HistogramEvents extends EventMap {
  visibilityChanged: boolean;
  modeChanged: HistogramMode;
  logScaleChanged: boolean;
  clippingOverlayToggled: boolean;
}

const HISTOGRAM_BINS = 256;
const HISTOGRAM_WIDTH = 256;
const HISTOGRAM_HEIGHT = 100;

export class Histogram extends EventEmitter<HistogramEvents> {
  private draggableContainer: DraggableContainer;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private mode: HistogramMode = 'rgb';
  private logScale = false;
  private data: HistogramData | null = null;
  private modeButton: HTMLButtonElement | null = null;
  private logButton: HTMLButtonElement | null = null;
  private clippingOverlayEnabled = false;
  private clippingIndicators: HTMLElement | null = null;
  private shadowIndicator: HTMLElement | null = null;
  private highlightIndicator: HTMLElement | null = null;

  constructor() {
    super();

    // Create draggable container
    this.draggableContainer = createDraggableContainer({
      id: 'histogram',
      title: 'Histogram',
      initialPosition: { top: '10px', right: '10px' },
      onClose: () => this.hide(),
    });

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = HISTOGRAM_WIDTH;
    this.canvas.height = HISTOGRAM_HEIGHT;
    this.canvas.style.cssText = `
      display: block;
      background: #111;
      border-radius: 2px;
    `;

    this.ctx = this.canvas.getContext('2d')!;

    // Add controls and canvas
    this.createControls();
    this.draggableContainer.content.appendChild(this.canvas);

    // Add footer
    this.createFooter();
  }

  private createControls(): void {
    const controls = this.draggableContainer.controls;

    // Mode toggle button
    this.modeButton = createControlButton('RGB', 'Toggle histogram mode (RGB/Luma/Separate)');
    this.modeButton.dataset.testid = 'histogram-mode-button';
    this.modeButton.addEventListener('click', () => this.cycleMode());

    // Log scale toggle button
    this.logButton = createControlButton('Lin', 'Toggle logarithmic scale');
    this.logButton.dataset.testid = 'histogram-log-button';
    this.logButton.addEventListener('click', () => this.toggleLogScale());

    // Insert buttons before close button
    const closeButton = controls.querySelector('[data-testid="histogram-close-button"]');
    controls.insertBefore(this.modeButton, closeButton);
    controls.insertBefore(this.logButton, closeButton);
  }

  private createFooter(): void {
    const footer = document.createElement('div');
    footer.className = 'histogram-footer';
    footer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 4px;
    `;

    // Scale labels row
    const scaleRow = document.createElement('div');
    scaleRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #666;
    `;
    scaleRow.innerHTML = `
      <span>0</span>
      <span>128</span>
      <span>255</span>
    `;
    footer.appendChild(scaleRow);

    // Clipping indicators row
    this.clippingIndicators = document.createElement('div');
    this.clippingIndicators.className = 'histogram-clipping-indicators';
    this.clippingIndicators.dataset.testid = 'histogram-clipping-indicators';
    this.clippingIndicators.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      cursor: pointer;
    `;
    this.clippingIndicators.title = 'Click to toggle clipping overlay on viewer';
    this.clippingIndicators.addEventListener('click', () => this.toggleClippingOverlay());

    // Shadow clipping indicator (left)
    this.shadowIndicator = document.createElement('div');
    this.shadowIndicator.className = 'shadow-clip-indicator';
    this.shadowIndicator.dataset.testid = 'histogram-shadow-indicator';
    this.shadowIndicator.style.cssText = `
      display: flex;
      align-items: center;
      gap: 2px;
      color: #6699ff;
    `;
    this.shadowIndicator.innerHTML = `
      <span style="font-size: 8px;">▼</span>
      <span class="shadow-percent">0.0%</span>
    `;

    // Highlight clipping indicator (right)
    this.highlightIndicator = document.createElement('div');
    this.highlightIndicator.className = 'highlight-clip-indicator';
    this.highlightIndicator.dataset.testid = 'histogram-highlight-indicator';
    this.highlightIndicator.style.cssText = `
      display: flex;
      align-items: center;
      gap: 2px;
      color: #ff6666;
    `;
    this.highlightIndicator.innerHTML = `
      <span class="highlight-percent">0.0%</span>
      <span style="font-size: 8px;">▲</span>
    `;

    this.clippingIndicators.appendChild(this.shadowIndicator);
    this.clippingIndicators.appendChild(this.highlightIndicator);
    footer.appendChild(this.clippingIndicators);

    this.draggableContainer.setFooter(footer);
  }

  /**
   * Toggle clipping overlay on viewer
   */
  toggleClippingOverlay(): void {
    this.clippingOverlayEnabled = !this.clippingOverlayEnabled;
    this.updateClippingIndicatorStyle();
    this.emit('clippingOverlayToggled', this.clippingOverlayEnabled);
  }

  /**
   * Set clipping overlay state
   */
  setClippingOverlay(enabled: boolean): void {
    if (this.clippingOverlayEnabled === enabled) return;
    this.clippingOverlayEnabled = enabled;
    this.updateClippingIndicatorStyle();
    this.emit('clippingOverlayToggled', this.clippingOverlayEnabled);
  }

  /**
   * Check if clipping overlay is enabled
   */
  isClippingOverlayEnabled(): boolean {
    return this.clippingOverlayEnabled;
  }

  /**
   * Update clipping indicator visual style
   */
  private updateClippingIndicatorStyle(): void {
    if (this.clippingIndicators) {
      this.clippingIndicators.style.background = this.clippingOverlayEnabled
        ? 'rgba(74, 158, 255, 0.2)'
        : 'transparent';
      this.clippingIndicators.style.borderRadius = '2px';
      this.clippingIndicators.style.padding = '2px 4px';
      this.clippingIndicators.style.margin = '0 -4px';
    }
  }

  /**
   * Update clipping statistics display
   */
  private updateClippingDisplay(): void {
    if (!this.data || !this.shadowIndicator || !this.highlightIndicator) return;

    const { clipping } = this.data;

    // Update shadow indicator
    const shadowPercent = this.shadowIndicator.querySelector('.shadow-percent');
    if (shadowPercent) {
      shadowPercent.textContent = `${clipping.shadowsPercent.toFixed(1)}%`;
    }
    // Highlight if significant clipping (>1%)
    this.shadowIndicator.style.color = clipping.shadowsPercent > 1 ? '#ff6666' : '#6699ff';

    // Update highlight indicator
    const highlightPercent = this.highlightIndicator.querySelector('.highlight-percent');
    if (highlightPercent) {
      highlightPercent.textContent = `${clipping.highlightsPercent.toFixed(1)}%`;
    }
    // Highlight if significant clipping (>1%)
    this.highlightIndicator.style.color = clipping.highlightsPercent > 1 ? '#ff6666' : '#ff9966';
  }

  /**
   * Calculate histogram from ImageData
   */
  calculate(imageData: ImageData): HistogramData {
    const data = imageData.data;
    const red = new Uint32Array(HISTOGRAM_BINS);
    const green = new Uint32Array(HISTOGRAM_BINS);
    const blue = new Uint32Array(HISTOGRAM_BINS);
    const luminance = new Uint32Array(HISTOGRAM_BINS);

    const len = data.length;
    const pixelCount = len / 4;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      red[r]!++;
      green[g]!++;
      blue[b]!++;

      // Calculate luminance using Rec.709 coefficients
      const luma = Math.round(
        LUMINANCE_COEFFICIENTS.r * r +
        LUMINANCE_COEFFICIENTS.g * g +
        LUMINANCE_COEFFICIENTS.b * b
      );
      luminance[Math.min(255, luma)]!++;
    }

    // Find max value for normalization
    let maxValue = 0;
    for (let i = 0; i < HISTOGRAM_BINS; i++) {
      maxValue = Math.max(maxValue, red[i]!, green[i]!, blue[i]!, luminance[i]!);
    }

    // Calculate clipping statistics
    const shadows = luminance[0] ?? 0;
    const highlights = luminance[255] ?? 0;
    const clipping = {
      shadows,
      highlights,
      shadowsPercent: pixelCount > 0 ? (shadows / pixelCount) * 100 : 0,
      highlightsPercent: pixelCount > 0 ? (highlights / pixelCount) * 100 : 0,
    };

    this.data = { red, green, blue, luminance, maxValue, pixelCount, clipping };
    return this.data;
  }

  /**
   * Update histogram from ImageData and redraw
   * Uses GPU acceleration when available for bar rendering
   */
  update(imageData: ImageData): void {
    // Always calculate histogram data on CPU (fast, required for stats)
    this.calculate(imageData);

    // Update clipping display
    this.updateClippingDisplay();

    // Try GPU rendering for bar display (uses CPU-computed histogram data)
    const gpuProcessor = getSharedScopesProcessor();
    if (gpuProcessor && gpuProcessor.isReady() && this.mode !== 'separate' && this.data) {
      // Clear canvas with dark background before GPU overlay
      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      gpuProcessor.renderHistogram(this.canvas, this.data, this.mode, this.logScale);
      return;
    }

    // Fall back to CPU rendering
    this.draw();
  }

  /**
   * Set playback mode for performance optimization.
   * Histogram calculation is always done on CPU, but we track playback state
   * for consistency with other scopes and potential future optimizations.
   */
  setPlaybackMode(isPlaying: boolean): void {
    // Track playback state for consistency with Waveform/Vectorscope
    // GPU processor uses this for downscaling quality decisions
    const gpuProcessor = getSharedScopesProcessor();
    if (gpuProcessor) {
      gpuProcessor.setPlaybackMode(isPlaying);
    }
  }

  /**
   * Draw histogram to canvas
   */
  draw(): void {
    if (!this.data) return;

    const { ctx, canvas } = this;
    const { red, green, blue, luminance, maxValue } = this.data;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (maxValue === 0) return;

    const height = canvas.height;
    const normalize = this.logScale
      ? (v: number) => (v > 0 ? Math.log(v + 1) / Math.log(maxValue + 1) : 0)
      : (v: number) => v / maxValue;

    if (this.mode === 'luminance') {
      // Draw luminance histogram only
      ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const h = normalize(luminance[i]!) * height;
        ctx.fillRect(i, height - h, 1, h);
      }
    } else if (this.mode === 'rgb') {
      // Draw RGB histograms superimposed with additive blending
      ctx.globalCompositeOperation = 'lighter';

      // Red
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const h = normalize(red[i]!) * height;
        ctx.fillRect(i, height - h, 1, h);
      }

      // Green
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const h = normalize(green[i]!) * height;
        ctx.fillRect(i, height - h, 1, h);
      }

      // Blue
      ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const h = normalize(blue[i]!) * height;
        ctx.fillRect(i, height - h, 1, h);
      }

      ctx.globalCompositeOperation = 'source-over';
    } else if (this.mode === 'separate') {
      // Draw separate histograms stacked
      const sectionHeight = height / 3;

      // Red in top third
      ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const h = normalize(red[i]!) * sectionHeight;
        ctx.fillRect(i, sectionHeight - h, 1, h);
      }

      // Green in middle third
      ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const h = normalize(green[i]!) * sectionHeight;
        ctx.fillRect(i, sectionHeight * 2 - h, 1, h);
      }

      // Blue in bottom third
      ctx.fillStyle = 'rgba(100, 100, 255, 0.8)';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const h = normalize(blue[i]!) * sectionHeight;
        ctx.fillRect(i, height - h, 1, h);
      }

      // Draw separator lines
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
      ctx.beginPath();
      ctx.moveTo(0, sectionHeight);
      ctx.lineTo(canvas.width, sectionHeight);
      ctx.moveTo(0, sectionHeight * 2);
      ctx.lineTo(canvas.width, sectionHeight * 2);
      ctx.stroke();
    }
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show histogram
   */
  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.draggableContainer.show();
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide histogram
   */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.draggableContainer.hide();
    this.emit('visibilityChanged', false);
  }

  /**
   * Check if histogram is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Cycle through display modes
   */
  cycleMode(): void {
    const modes: HistogramMode[] = ['rgb', 'luminance', 'separate'];
    const currentIndex = modes.indexOf(this.mode);
    this.mode = modes[(currentIndex + 1) % modes.length]!;

    if (this.modeButton) {
      const labels: Record<HistogramMode, string> = {
        rgb: 'RGB',
        luminance: 'Luma',
        separate: 'Sep',
      };
      this.modeButton.textContent = labels[this.mode];
    }

    this.draw();
    this.emit('modeChanged', this.mode);
  }

  /**
   * Set display mode
   */
  setMode(mode: HistogramMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    if (this.modeButton) {
      const labels: Record<HistogramMode, string> = {
        rgb: 'RGB',
        luminance: 'Luma',
        separate: 'Sep',
      };
      this.modeButton.textContent = labels[this.mode];
    }

    this.draw();
    this.emit('modeChanged', this.mode);
  }

  /**
   * Get current mode
   */
  getMode(): HistogramMode {
    return this.mode;
  }

  /**
   * Toggle logarithmic scale
   */
  toggleLogScale(): void {
    this.logScale = !this.logScale;

    if (this.logButton) {
      this.logButton.textContent = this.logScale ? 'Log' : 'Lin';
    }

    this.draw();
    this.emit('logScaleChanged', this.logScale);
  }

  /**
   * Set logarithmic scale
   */
  setLogScale(enabled: boolean): void {
    if (this.logScale === enabled) return;
    this.logScale = enabled;

    if (this.logButton) {
      this.logButton.textContent = this.logScale ? 'Log' : 'Lin';
    }

    this.draw();
    this.emit('logScaleChanged', this.logScale);
  }

  /**
   * Check if logarithmic scale is enabled
   */
  isLogScale(): boolean {
    return this.logScale;
  }

  /**
   * Get current histogram data
   */
  getData(): HistogramData | null {
    return this.data;
  }

  /**
   * Get statistics from histogram
   */
  getStats(): { min: number; max: number; mean: number; median: number } | null {
    if (!this.data) return null;

    const { luminance, pixelCount } = this.data;

    // Find min and max non-zero values
    let min = 255;
    let max = 0;
    for (let i = 0; i < HISTOGRAM_BINS; i++) {
      if (luminance[i]! > 0) {
        if (i < min) min = i;
        if (i > max) max = i;
      }
    }

    // Calculate mean
    let sum = 0;
    for (let i = 0; i < HISTOGRAM_BINS; i++) {
      sum += i * luminance[i]!;
    }
    const mean = sum / pixelCount;

    // Calculate median
    let cumulative = 0;
    let median = 0;
    const halfCount = pixelCount / 2;
    for (let i = 0; i < HISTOGRAM_BINS; i++) {
      cumulative += luminance[i]!;
      if (cumulative >= halfCount) {
        median = i;
        break;
      }
    }

    return { min, max, mean, median };
  }

  /**
   * Get current position
   */
  getPosition(): { x: number; y: number } {
    return this.draggableContainer.getPosition();
  }

  /**
   * Set position
   */
  setPosition(x: number, y: number): void {
    this.draggableContainer.setPosition(x, y);
  }

  /**
   * Reset position to initial
   */
  resetPosition(): void {
    this.draggableContainer.resetPosition();
  }

  render(): HTMLElement {
    return this.draggableContainer.element;
  }

  /**
   * Get clipping statistics
   */
  getClipping(): { shadows: number; highlights: number; shadowsPercent: number; highlightsPercent: number } | null {
    if (!this.data) return null;
    return this.data.clipping;
  }

  dispose(): void {
    this.data = null;
    this.modeButton = null;
    this.logButton = null;
    this.clippingIndicators = null;
    this.shadowIndicator = null;
    this.highlightIndicator = null;
    this.draggableContainer.dispose();
  }
}

/**
 * Calculate histogram from ImageData without creating a Histogram instance
 */
export function calculateHistogram(imageData: ImageData): HistogramData {
  const data = imageData.data;
  const red = new Uint32Array(HISTOGRAM_BINS);
  const green = new Uint32Array(HISTOGRAM_BINS);
  const blue = new Uint32Array(HISTOGRAM_BINS);
  const luminance = new Uint32Array(HISTOGRAM_BINS);

  const len = data.length;
  const pixelCount = len / 4;

  for (let i = 0; i < len; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;

    red[r]!++;
    green[g]!++;
    blue[b]!++;

    const luma = Math.round(
      LUMINANCE_COEFFICIENTS.r * r +
      LUMINANCE_COEFFICIENTS.g * g +
      LUMINANCE_COEFFICIENTS.b * b
    );
    luminance[Math.min(255, luma)]!++;
  }

  let maxValue = 0;
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    maxValue = Math.max(maxValue, red[i]!, green[i]!, blue[i]!, luminance[i]!);
  }

  // Calculate clipping statistics
  const shadows = luminance[0] ?? 0;
  const highlights = luminance[255] ?? 0;
  const clipping = {
    shadows,
    highlights,
    shadowsPercent: pixelCount > 0 ? (shadows / pixelCount) * 100 : 0,
    highlightsPercent: pixelCount > 0 ? (highlights / pixelCount) * 100 : 0,
  };

  return { red, green, blue, luminance, maxValue, pixelCount, clipping };
}
