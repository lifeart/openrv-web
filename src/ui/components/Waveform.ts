/**
 * Waveform Monitor - Real-time waveform display for video signal analysis
 *
 * Features:
 * - Luminance waveform showing intensity distribution
 * - RGB parade mode displaying separate R/G/B waveforms
 * - RGB overlay mode with superimposed channels
 * - Horizontal position mapped to image columns
 * - Vertical axis shows signal level (0-255)
 * - Draggable overlay display
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { LUMINANCE_COEFFICIENTS } from './ChannelSelect';
import { getSharedScopesProcessor, WaveformMode as GPUWaveformMode } from '../../scopes/WebGLScopes';
import {
  createDraggableContainer,
  createControlButton,
  DraggableContainer,
} from './shared/DraggableContainer';

export type WaveformMode = 'luma' | 'rgb' | 'parade';

export interface WaveformEvents extends EventMap {
  visibilityChanged: boolean;
  modeChanged: WaveformMode;
}

const WAVEFORM_WIDTH = 256;
const WAVEFORM_HEIGHT = 128;
const PARADE_SECTION_WIDTH = Math.floor(WAVEFORM_WIDTH / 3);

export class Waveform extends EventEmitter<WaveformEvents> {
  private draggableContainer: DraggableContainer;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private mode: WaveformMode = 'luma';
  private modeButton: HTMLButtonElement | null = null;
  private lastImageData: ImageData | null = null;
  private isPlaybackMode = false;

  constructor() {
    super();

    // Create draggable container
    this.draggableContainer = createDraggableContainer({
      id: 'waveform',
      title: 'Waveform',
      initialPosition: { top: '10px', left: '10px' },
      onClose: () => this.hide(),
    });

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = WAVEFORM_WIDTH;
    this.canvas.height = WAVEFORM_HEIGHT;
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
    this.modeButton = createControlButton('Luma', 'Toggle waveform mode (Luma/RGB/Parade)');
    this.modeButton.dataset.testid = 'waveform-mode-button';
    this.modeButton.addEventListener('click', () => this.cycleMode());

    // Insert button before close button
    const closeButton = controls.querySelector('[data-testid="waveform-close-button"]');
    controls.insertBefore(this.modeButton, closeButton);
  }

  private createFooter(): void {
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
    this.draggableContainer.setFooter(footer);
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
    this.draggableContainer.show();
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide waveform
   */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.draggableContainer.hide();
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

  dispose(): void {
    this.modeButton = null;
    this.draggableContainer.dispose();
  }
}
