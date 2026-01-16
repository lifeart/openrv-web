/**
 * Histogram - Real-time histogram display for analyzing image luminance and color distribution
 *
 * Features:
 * - Per-channel (R/G/B) histograms displayed superimposed or separately
 * - Luminance histogram using Rec.709 coefficients
 * - Logarithmic scale option for HDR content
 * - Real-time updates on frame changes
 * - Collapsible overlay display
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { LUMINANCE_COEFFICIENTS } from './ChannelSelect';

export type HistogramMode = 'rgb' | 'luminance' | 'separate';

export interface HistogramData {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  luminance: Uint32Array;
  maxValue: number;
  pixelCount: number;
}

export interface HistogramEvents extends EventMap {
  visibilityChanged: boolean;
  modeChanged: HistogramMode;
  logScaleChanged: boolean;
}

const HISTOGRAM_BINS = 256;
const HISTOGRAM_WIDTH = 256;
const HISTOGRAM_HEIGHT = 100;

export class Histogram extends EventEmitter<HistogramEvents> {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private mode: HistogramMode = 'rgb';
  private logScale = false;
  private data: HistogramData | null = null;
  private modeButton: HTMLButtonElement | null = null;
  private logButton: HTMLButtonElement | null = null;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'histogram-container';
    this.container.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #333;
      border-radius: 4px;
      padding: 8px;
      display: none;
      z-index: 100;
      user-select: none;
    `;
    // Prevent viewer from capturing pointer events when interacting with histogram
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('pointermove', (e) => e.stopPropagation());
    this.container.addEventListener('pointerup', (e) => e.stopPropagation());

    this.canvas = document.createElement('canvas');
    this.canvas.width = HISTOGRAM_WIDTH;
    this.canvas.height = HISTOGRAM_HEIGHT;
    this.canvas.style.cssText = `
      display: block;
      background: #111;
      border-radius: 2px;
    `;

    this.ctx = this.canvas.getContext('2d')!;

    this.createUI();
  }

  private createUI(): void {
    // Header with title and controls
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    `;

    const title = document.createElement('span');
    title.textContent = 'Histogram';
    title.style.cssText = `
      color: #888;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;

    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      gap: 4px;
    `;

    // Mode toggle button
    this.modeButton = this.createControlButton('RGB', 'Toggle histogram mode (RGB/Luma/Separate)');
    this.modeButton.dataset.testid = 'histogram-mode-button';
    this.modeButton.addEventListener('click', () => this.cycleMode());
    controls.appendChild(this.modeButton);

    // Log scale toggle button
    this.logButton = this.createControlButton('Lin', 'Toggle logarithmic scale');
    this.logButton.dataset.testid = 'histogram-log-button';
    this.logButton.addEventListener('click', () => this.toggleLogScale());
    controls.appendChild(this.logButton);

    // Close button
    const closeButton = this.createControlButton('\u00d7', 'Close histogram');
    closeButton.dataset.testid = 'histogram-close-button';
    closeButton.style.fontSize = '14px';
    closeButton.addEventListener('click', () => this.hide());
    controls.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(controls);
    this.container.appendChild(header);
    this.container.appendChild(this.canvas);

    // Stats footer
    const footer = document.createElement('div');
    footer.className = 'histogram-footer';
    footer.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 9px;
      color: #666;
    `;
    footer.innerHTML = `
      <span>0</span>
      <span>128</span>
      <span>255</span>
    `;
    this.container.appendChild(footer);
  }

  private createControlButton(text: string, title: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title;
    button.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 2px;
      color: #aaa;
      padding: 2px 6px;
      font-size: 9px;
      cursor: pointer;
      transition: background 0.1s;
    `;
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    return button;
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

    this.data = { red, green, blue, luminance, maxValue, pixelCount };
    return this.data;
  }

  /**
   * Update histogram from ImageData and redraw
   */
  update(imageData: ImageData): void {
    this.calculate(imageData);
    this.draw();
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
    this.container.style.display = 'block';
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide histogram
   */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.container.style.display = 'none';
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

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.data = null;
    this.modeButton = null;
    this.logButton = null;
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

  return { red, green, blue, luminance, maxValue, pixelCount };
}
