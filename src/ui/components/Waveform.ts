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
import { setupHiDPICanvas } from '../../utils/HiDPICanvas';

export type WaveformMode = 'luma' | 'rgb' | 'parade';

export interface RGBChannelState {
  r: boolean;
  g: boolean;
  b: boolean;
}

export interface WaveformEvents extends EventMap {
  visibilityChanged: boolean;
  modeChanged: WaveformMode;
  channelToggled: RGBChannelState;
  intensityChanged: number;
}

const WAVEFORM_WIDTH = 256;
const WAVEFORM_HEIGHT = 128;
const PARADE_SECTION_WIDTH = Math.floor(WAVEFORM_WIDTH / 3);

// Intensity range constants (0.05 to 0.3)
const MIN_INTENSITY = 0.05;
const MAX_INTENSITY = 0.3;

export class Waveform extends EventEmitter<WaveformEvents> {
  private draggableContainer: DraggableContainer;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private mode: WaveformMode = 'luma';
  private modeButton: HTMLButtonElement | null = null;
  private lastImageData: ImageData | null = null;
  private isPlaybackMode = false;

  // RGB overlay controls
  private enabledChannels: RGBChannelState = { r: true, g: true, b: true };
  private intensity = 0.1; // Trace opacity (MIN_INTENSITY to MAX_INTENSITY)
  private rgbControlsContainer: HTMLElement | null = null;
  private channelButtons: { r: HTMLButtonElement; g: HTMLButtonElement; b: HTMLButtonElement } | null = null;
  private intensitySlider: HTMLInputElement | null = null;
  private boundOnIntensityChange: ((e: Event) => void) | null = null;

  constructor() {
    super();

    // Create draggable container
    this.draggableContainer = createDraggableContainer({
      id: 'waveform',
      title: 'Waveform',
      initialPosition: { top: '10px', left: '10px' },
      onClose: () => this.hide(),
    });

    // Create canvas with hi-DPI support
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      display: block;
      background: #111;
      border-radius: 2px;
    `;

    this.ctx = this.canvas.getContext('2d')!;

    // Setup hi-DPI canvas scaling
    setupHiDPICanvas({
      canvas: this.canvas,
      ctx: this.ctx,
      width: WAVEFORM_WIDTH,
      height: WAVEFORM_HEIGHT,
    });

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

    // Create RGB controls container (initially hidden)
    this.rgbControlsContainer = document.createElement('div');
    this.rgbControlsContainer.className = 'waveform-rgb-controls';
    this.rgbControlsContainer.dataset.testid = 'waveform-rgb-controls';
    this.rgbControlsContainer.style.cssText = `
      display: none;
      flex-direction: row;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 3px;
    `;

    // Channel toggle buttons
    this.channelButtons = {
      r: this.createChannelButton('R', '#ff4444', 'r'),
      g: this.createChannelButton('G', '#44ff44', 'g'),
      b: this.createChannelButton('B', '#4444ff', 'b'),
    };

    this.rgbControlsContainer.appendChild(this.channelButtons.r);
    this.rgbControlsContainer.appendChild(this.channelButtons.g);
    this.rgbControlsContainer.appendChild(this.channelButtons.b);

    // Intensity label
    const intensityLabel = document.createElement('span');
    intensityLabel.textContent = 'Int:';
    intensityLabel.style.cssText = 'color: #888; font-size: 10px; margin-left: 8px;';
    this.rgbControlsContainer.appendChild(intensityLabel);

    // Intensity slider
    this.intensitySlider = document.createElement('input');
    this.intensitySlider.type = 'range';
    this.intensitySlider.min = String(Math.round(MIN_INTENSITY * 100));
    this.intensitySlider.max = String(Math.round(MAX_INTENSITY * 100));
    this.intensitySlider.value = String(Math.round(this.intensity * 100));
    this.intensitySlider.dataset.testid = 'waveform-intensity-slider';
    this.intensitySlider.setAttribute('aria-label', 'Trace intensity');
    this.intensitySlider.style.cssText = `
      width: 50px;
      height: 12px;
      cursor: pointer;
      accent-color: #666;
    `;
    this.boundOnIntensityChange = (e: Event) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      this.setIntensity(value / 100);
    };
    this.intensitySlider.addEventListener('input', this.boundOnIntensityChange);
    this.rgbControlsContainer.appendChild(this.intensitySlider);

    // Add RGB controls after content (above canvas)
    this.draggableContainer.content.insertBefore(
      this.rgbControlsContainer,
      this.draggableContainer.content.firstChild
    );
  }

  private createChannelButton(label: string, color: string, channel: 'r' | 'g' | 'b'): HTMLButtonElement {
    const channelNames: Record<'r' | 'g' | 'b', string> = {
      r: 'Red',
      g: 'Green',
      b: 'Blue',
    };
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.testid = `waveform-channel-${channel}`;
    btn.title = `Toggle ${channelNames[channel]} channel`;
    btn.setAttribute('aria-label', `Toggle ${channelNames[channel]} channel`);
    btn.setAttribute('aria-pressed', 'true');
    btn.style.cssText = `
      width: 20px;
      height: 18px;
      padding: 0;
      font-size: 10px;
      font-weight: bold;
      color: ${color};
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid ${color};
      border-radius: 2px;
      cursor: pointer;
      opacity: 1;
    `;
    btn.addEventListener('click', () => this.toggleChannel(channel));
    return btn;
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
      // Draw background and grid first (CPU) - use logical dimensions
      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(0, 0, WAVEFORM_WIDTH, WAVEFORM_HEIGHT);
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
    const { ctx } = this;
    const { data, width, height } = imageData;

    // Use logical dimensions for drawing (hi-DPI context is scaled)
    ctx.clearRect(0, 0, WAVEFORM_WIDTH, WAVEFORM_HEIGHT);

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
    const { ctx } = this;

    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.lineWidth = 1;

    // Horizontal lines at 25%, 50%, 75% - use logical dimensions
    const levels = [0.25, 0.5, 0.75];
    for (const level of levels) {
      const y = Math.floor(WAVEFORM_HEIGHT * (1 - level));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WAVEFORM_WIDTH, y);
      ctx.stroke();
    }
  }

  private drawLumaWaveform(data: Uint8ClampedArray, srcWidth: number, srcHeight: number): void {
    const { ctx } = this;
    // Use logical dimensions for drawing
    const canvasWidth = WAVEFORM_WIDTH;
    const canvasHeight = WAVEFORM_HEIGHT;

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
    const { ctx, enabledChannels, intensity } = this;
    // Use logical dimensions for drawing
    const canvasWidth = WAVEFORM_WIDTH;
    const canvasHeight = WAVEFORM_HEIGHT;

    const sampleStep = Math.max(1, Math.floor(srcWidth / canvasWidth));
    const pixelsPerColumn = Math.ceil(srcWidth / canvasWidth);

    // Pre-compute fill styles outside loops for performance
    const rStyle = `rgba(255, 0, 0, ${intensity})`;
    const gStyle = `rgba(0, 255, 0, ${intensity})`;
    const bStyle = `rgba(0, 0, 255, ${intensity})`;

    // Additive blending for RGB overlay - creates white where all channels align
    // Use try/finally to ensure composite operation is restored even on error
    const previousCompositeOp = ctx.globalCompositeOperation;
    try {
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

            // Draw red (if enabled)
            if (enabledChannels.r) {
              const yR = canvasHeight - 1 - Math.floor(r * (canvasHeight - 1) / 255);
              ctx.fillStyle = rStyle;
              ctx.fillRect(x, yR, 1, 1);
            }

            // Draw green (if enabled)
            if (enabledChannels.g) {
              const yG = canvasHeight - 1 - Math.floor(g * (canvasHeight - 1) / 255);
              ctx.fillStyle = gStyle;
              ctx.fillRect(x, yG, 1, 1);
            }

            // Draw blue (if enabled)
            if (enabledChannels.b) {
              const yB = canvasHeight - 1 - Math.floor(b * (canvasHeight - 1) / 255);
              ctx.fillStyle = bStyle;
              ctx.fillRect(x, yB, 1, 1);
            }
          }
        }
      }
    } finally {
      ctx.globalCompositeOperation = previousCompositeOp;
    }
  }

  private drawParadeWaveform(data: Uint8ClampedArray, srcWidth: number, srcHeight: number): void {
    const { ctx } = this;
    // Use logical dimensions for drawing
    const canvasHeight = WAVEFORM_HEIGHT;

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
   * Update channel button appearance to reflect enabled state
   */
  private updateChannelButtonAppearance(channel: 'r' | 'g' | 'b'): void {
    if (this.channelButtons) {
      const btn = this.channelButtons[channel];
      const enabled = this.enabledChannels[channel];
      btn.style.opacity = enabled ? '1' : '0.3';
      btn.setAttribute('aria-pressed', String(enabled));
    }
  }

  /**
   * Toggle an RGB channel on/off
   */
  toggleChannel(channel: 'r' | 'g' | 'b'): void {
    this.enabledChannels[channel] = !this.enabledChannels[channel];
    this.updateChannelButtonAppearance(channel);

    // Redraw
    if (this.lastImageData) {
      this.draw(this.lastImageData);
    }

    this.emit('channelToggled', { ...this.enabledChannels });
  }

  /**
   * Set channel state
   */
  setChannel(channel: 'r' | 'g' | 'b', enabled: boolean): void {
    if (this.enabledChannels[channel] === enabled) return;
    this.enabledChannels[channel] = enabled;
    this.updateChannelButtonAppearance(channel);

    // Redraw
    if (this.lastImageData) {
      this.draw(this.lastImageData);
    }

    this.emit('channelToggled', { ...this.enabledChannels });
  }

  /**
   * Get enabled channels
   */
  getEnabledChannels(): RGBChannelState {
    return { ...this.enabledChannels };
  }

  /**
   * Set trace intensity for RGB overlay
   */
  setIntensity(intensity: number): void {
    this.intensity = Math.max(MIN_INTENSITY, Math.min(MAX_INTENSITY, intensity));

    // Sync the slider if it exists
    if (this.intensitySlider) {
      this.intensitySlider.value = String(Math.round(this.intensity * 100));
    }

    // Redraw
    if (this.lastImageData && this.mode === 'rgb') {
      this.draw(this.lastImageData);
    }

    this.emit('intensityChanged', this.intensity);
  }

  /**
   * Get current intensity
   */
  getIntensity(): number {
    return this.intensity;
  }

  /**
   * Update RGB controls visibility based on mode
   */
  private updateRGBControlsVisibility(): void {
    if (this.rgbControlsContainer) {
      this.rgbControlsContainer.style.display = this.mode === 'rgb' ? 'flex' : 'none';
    }
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

    // Update RGB controls visibility
    this.updateRGBControlsVisibility();

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

    // Update RGB controls visibility
    this.updateRGBControlsVisibility();

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
    // Clean up intensity slider event listener
    if (this.intensitySlider && this.boundOnIntensityChange) {
      this.intensitySlider.removeEventListener('input', this.boundOnIntensityChange);
    }
    this.boundOnIntensityChange = null;
    this.intensitySlider = null;
    this.modeButton = null;
    this.channelButtons = null;
    this.rgbControlsContainer = null;
    this.draggableContainer.dispose();
  }
}
