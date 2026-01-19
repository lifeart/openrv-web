/**
 * Waveform Monitor - Real-time waveform display for video signal analysis
 *
 * Features:
 * - Luminance waveform showing intensity distribution
 * - RGB parade mode displaying separate R/G/B waveforms
 * - RGB overlay mode with superimposed channels
 * - Horizontal position mapped to image columns
 * - Vertical axis shows signal level (0-255)
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { LUMINANCE_COEFFICIENTS } from './ChannelSelect';
import { getSharedScopesProcessor, WaveformMode as GPUWaveformMode } from '../../scopes/WebGLScopes';

export type WaveformMode = 'luma' | 'rgb' | 'parade';

export interface WaveformEvents extends EventMap {
  visibilityChanged: boolean;
  modeChanged: WaveformMode;
}

const WAVEFORM_WIDTH = 256;
const WAVEFORM_HEIGHT = 128;
const PARADE_SECTION_WIDTH = Math.floor(WAVEFORM_WIDTH / 3);

export class Waveform extends EventEmitter<WaveformEvents> {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private mode: WaveformMode = 'luma';
  private modeButton: HTMLButtonElement | null = null;
  private lastImageData: ImageData | null = null;
  private isPlaybackMode = false;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'waveform-container';
    this.container.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #333;
      border-radius: 4px;
      padding: 8px;
      display: none;
      z-index: 100;
      user-select: none;
    `;
    // Prevent viewer from capturing pointer events when interacting with waveform
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('pointermove', (e) => e.stopPropagation());
    this.container.addEventListener('pointerup', (e) => e.stopPropagation());

    this.canvas = document.createElement('canvas');
    this.canvas.width = WAVEFORM_WIDTH;
    this.canvas.height = WAVEFORM_HEIGHT;
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
    title.textContent = 'Waveform';
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
    this.modeButton = this.createControlButton('Luma', 'Toggle waveform mode (Luma/RGB/Parade)');
    this.modeButton.dataset.testid = 'waveform-mode-button';
    this.modeButton.addEventListener('click', () => this.cycleMode());
    controls.appendChild(this.modeButton);

    // Close button
    const closeButton = this.createControlButton('\u00d7', 'Close waveform');
    closeButton.dataset.testid = 'waveform-close-button';
    closeButton.style.fontSize = '14px';
    closeButton.addEventListener('click', () => this.hide());
    controls.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(controls);
    this.container.appendChild(header);
    this.container.appendChild(this.canvas);

    // Scale footer
    const footer = document.createElement('div');
    footer.className = 'waveform-footer';
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
   * Update waveform from ImageData and redraw
   * Uses GPU acceleration when available for better playback performance
   */
  update(imageData: ImageData): void {
    this.lastImageData = imageData;

    // Try GPU rendering first for better performance during playback
    const gpuProcessor = getSharedScopesProcessor();
    if (gpuProcessor && gpuProcessor.isReady()) {
      gpuProcessor.setPlaybackMode(this.isPlaybackMode);
      gpuProcessor.setImage(imageData);
      // Draw background and grid first (CPU)
      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawGrid();
      // Then GPU waveform overlay
      gpuProcessor.renderWaveform(this.canvas, this.mode as GPUWaveformMode);
      return;
    }

    // Fall back to CPU rendering
    this.draw(imageData);
  }

  /**
   * Set playback mode for performance optimization.
   * During playback, uses aggressive subsampling.
   * When paused, uses full quality rendering.
   */
  setPlaybackMode(isPlaying: boolean): void {
    this.isPlaybackMode = isPlaying;
  }

  /**
   * Draw waveform to canvas
   */
  private draw(imageData: ImageData): void {
    const { ctx, canvas } = this;
    const { data, width, height } = imageData;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    this.drawGrid();

    if (this.mode === 'luma') {
      this.drawLumaWaveform(data, width, height);
    } else if (this.mode === 'rgb') {
      this.drawRGBOverlayWaveform(data, width, height);
    } else if (this.mode === 'parade') {
      this.drawParadeWaveform(data, width, height);
    }
  }

  private drawGrid(): void {
    const { ctx, canvas } = this;

    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.lineWidth = 1;

    // Horizontal lines at 25%, 50%, 75%
    const levels = [0.25, 0.5, 0.75];
    for (const level of levels) {
      const y = Math.floor(canvas.height * (1 - level));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  private drawLumaWaveform(data: Uint8ClampedArray, srcWidth: number, srcHeight: number): void {
    const { ctx, canvas } = this;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Sample every Nth column to fit canvas width
    const sampleStep = Math.max(1, Math.floor(srcWidth / canvasWidth));
    const pixelsPerColumn = Math.ceil(srcWidth / canvasWidth);

    ctx.fillStyle = 'rgba(200, 200, 200, 0.15)';

    for (let x = 0; x < canvasWidth; x++) {
      const srcX = Math.floor(x * srcWidth / canvasWidth);
      const endX = Math.min(srcX + pixelsPerColumn, srcWidth);

      for (let srcXi = srcX; srcXi < endX; srcXi += sampleStep) {
        for (let srcY = 0; srcY < srcHeight; srcY++) {
          const i = (srcY * srcWidth + srcXi) * 4;
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;

          // Calculate luminance using Rec.709 coefficients
          const luma = Math.round(
            LUMINANCE_COEFFICIENTS.r * r +
            LUMINANCE_COEFFICIENTS.g * g +
            LUMINANCE_COEFFICIENTS.b * b
          );

          const y = canvasHeight - 1 - Math.floor(luma * (canvasHeight - 1) / 255);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  private drawRGBOverlayWaveform(data: Uint8ClampedArray, srcWidth: number, srcHeight: number): void {
    const { ctx, canvas } = this;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const sampleStep = Math.max(1, Math.floor(srcWidth / canvasWidth));
    const pixelsPerColumn = Math.ceil(srcWidth / canvasWidth);

    ctx.globalCompositeOperation = 'lighter';

    for (let x = 0; x < canvasWidth; x++) {
      const srcX = Math.floor(x * srcWidth / canvasWidth);
      const endX = Math.min(srcX + pixelsPerColumn, srcWidth);

      for (let srcXi = srcX; srcXi < endX; srcXi += sampleStep) {
        for (let srcY = 0; srcY < srcHeight; srcY++) {
          const i = (srcY * srcWidth + srcXi) * 4;
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;

          // Draw red
          const yR = canvasHeight - 1 - Math.floor(r * (canvasHeight - 1) / 255);
          ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
          ctx.fillRect(x, yR, 1, 1);

          // Draw green
          const yG = canvasHeight - 1 - Math.floor(g * (canvasHeight - 1) / 255);
          ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
          ctx.fillRect(x, yG, 1, 1);

          // Draw blue
          const yB = canvasHeight - 1 - Math.floor(b * (canvasHeight - 1) / 255);
          ctx.fillStyle = 'rgba(0, 0, 255, 0.1)';
          ctx.fillRect(x, yB, 1, 1);
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  private drawParadeWaveform(data: Uint8ClampedArray, srcWidth: number, srcHeight: number): void {
    const { ctx, canvas } = this;
    const canvasHeight = canvas.height;

    const sectionWidth = PARADE_SECTION_WIDTH;
    const sampleStep = Math.max(1, Math.floor(srcWidth / sectionWidth));
    const pixelsPerColumn = Math.ceil(srcWidth / sectionWidth);

    // Draw R, G, B in three columns
    const channels = [
      { offset: 0, color: 'rgba(255, 100, 100, 0.15)', channelIndex: 0 },
      { offset: sectionWidth, color: 'rgba(100, 255, 100, 0.15)', channelIndex: 1 },
      { offset: sectionWidth * 2, color: 'rgba(100, 100, 255, 0.15)', channelIndex: 2 },
    ];

    for (const { offset, color, channelIndex } of channels) {
      ctx.fillStyle = color;

      for (let x = 0; x < sectionWidth; x++) {
        const srcX = Math.floor(x * srcWidth / sectionWidth);
        const endX = Math.min(srcX + pixelsPerColumn, srcWidth);

        for (let srcXi = srcX; srcXi < endX; srcXi += sampleStep) {
          for (let srcY = 0; srcY < srcHeight; srcY++) {
            const i = (srcY * srcWidth + srcXi) * 4;
            const value = data[i + channelIndex]!;

            const y = canvasHeight - 1 - Math.floor(value * (canvasHeight - 1) / 255);
            ctx.fillRect(offset + x, y, 1, 1);
          }
        }
      }
    }

    // Draw vertical separator lines
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.beginPath();
    ctx.moveTo(sectionWidth, 0);
    ctx.lineTo(sectionWidth, canvasHeight);
    ctx.moveTo(sectionWidth * 2, 0);
    ctx.lineTo(sectionWidth * 2, canvasHeight);
    ctx.stroke();
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
   * Show waveform
   */
  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.container.style.display = 'block';
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide waveform
   */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.container.style.display = 'none';
    this.emit('visibilityChanged', false);
  }

  /**
   * Check if waveform is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Cycle through display modes
   */
  cycleMode(): void {
    const modes: WaveformMode[] = ['luma', 'rgb', 'parade'];
    const currentIndex = modes.indexOf(this.mode);
    this.mode = modes[(currentIndex + 1) % modes.length]!;

    if (this.modeButton) {
      const labels: Record<WaveformMode, string> = {
        luma: 'Luma',
        rgb: 'RGB',
        parade: 'Parade',
      };
      this.modeButton.textContent = labels[this.mode];
    }

    // Redraw with new mode if we have image data
    if (this.lastImageData) {
      this.draw(this.lastImageData);
    }

    this.emit('modeChanged', this.mode);
  }

  /**
   * Set display mode
   */
  setMode(mode: WaveformMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    if (this.modeButton) {
      const labels: Record<WaveformMode, string> = {
        luma: 'Luma',
        rgb: 'RGB',
        parade: 'Parade',
      };
      this.modeButton.textContent = labels[this.mode];
    }

    // Redraw with new mode if we have image data
    if (this.lastImageData) {
      this.draw(this.lastImageData);
    }

    this.emit('modeChanged', this.mode);
  }

  /**
   * Get current mode
   */
  getMode(): WaveformMode {
    return this.mode;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.modeButton = null;
  }
}
