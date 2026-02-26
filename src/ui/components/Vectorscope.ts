/**
 * Vectorscope - Color analysis display showing chrominance distribution
 *
 * Features:
 * - Circular display of color hue and saturation
 * - Standard graticule with color targets (R, Mg, B, Cy, G, Yl)
 * - Skin tone line reference
 * - Zoom control for detailed analysis (1x/2x/4x/Auto)
 * - Auto-fit zoom that adapts to content
 * - Draggable overlay display
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getSharedScopesProcessor } from '../../scopes/WebGLScopes';
import { floatRGBAToImageData } from '../../utils/math';
import {
  createDraggableContainer,
  createControlButton,
  DraggableContainer,
} from './shared/DraggableContainer';
import { setupHiDPICanvas } from '../../utils/ui/HiDPICanvas';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import { getCSSColor } from '../../utils/ui/getCSSColor';
import { DisposableSubscriptionManager } from '../../utils/DisposableSubscriptionManager';

export interface VectorscopeEvents extends EventMap {
  visibilityChanged: boolean;
  zoomChanged: number | 'auto';
}

const VECTORSCOPE_SIZE = 200;
const GRATICULE_RADIUS = 85;

// Standard color targets in Cb/Cr space (ITU-R BT.601)
const COLOR_TARGETS = {
  red: { cb: -0.169, cr: 0.5, label: 'R' },
  magenta: { cb: 0.331, cr: 0.419, label: 'Mg' },
  blue: { cb: 0.5, cr: -0.081, label: 'B' },
  cyan: { cb: 0.169, cr: -0.5, label: 'Cy' },
  green: { cb: -0.331, cr: -0.419, label: 'G' },
  yellow: { cb: -0.5, cr: 0.081, label: 'Yl' },
};

// Skin tone line angle (approximately 123 degrees in standard vectorscope)
const SKIN_TONE_ANGLE = (123 * Math.PI) / 180;

export type VectorscopeZoom = 1 | 2 | 4 | 'auto';

export class Vectorscope extends EventEmitter<VectorscopeEvents> {
  private draggableContainer: DraggableContainer;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private zoomMode: VectorscopeZoom = 'auto';
  private effectiveZoom = 1; // Actual zoom used for rendering (calculated in auto mode)
  private zoomButton: HTMLButtonElement | null = null;
  private lastImageData: ImageData | null = null;
  private lastFloatFrame: { data: Float32Array; width: number; height: number } | null = null;
  private isPlaybackMode = false;
  private dpr = 1;
  private subs = new DisposableSubscriptionManager();

  constructor() {
    super();

    // Create draggable container
    this.draggableContainer = createDraggableContainer({
      id: 'vectorscope',
      title: 'Vectorscope',
      initialPosition: { bottom: '10px', left: '10px' },
      onClose: () => this.hide(),
    });

    // Create canvas with hi-DPI support
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      display: block;
      background: var(--bg-primary);
      border-radius: 50%;
    `;

    this.ctx = this.canvas.getContext('2d')!;

    // Setup hi-DPI canvas scaling
    const result = setupHiDPICanvas({
      canvas: this.canvas,
      ctx: this.ctx,
      width: VECTORSCOPE_SIZE,
      height: VECTORSCOPE_SIZE,
    });
    this.dpr = result.dpr;

    // Add controls and canvas
    this.createControls();
    this.draggableContainer.content.appendChild(this.canvas);

    // Draw initial graticule
    this.drawGraticule();

    // Listen for theme changes to redraw with new colors
    this.subs.add(getThemeManager().on('themeChanged', () => {
      if (this.lastFloatFrame || this.lastImageData) {
        this.redrawLastFrame();
      } else {
        this.drawGraticule();
      }
    }));
  }

  private createControls(): void {
    const controls = this.draggableContainer.controls;

    // Zoom toggle button
    this.zoomButton = createControlButton('Auto', 'Toggle zoom (1x/2x/4x/Auto)');
    this.zoomButton.dataset.testid = 'vectorscope-zoom-button';
    this.zoomButton.addEventListener('click', () => this.cycleZoom());

    // Insert button before close button
    const closeButton = controls.querySelector('[data-testid="vectorscope-close-button"]');
    controls.insertBefore(this.zoomButton, closeButton);
  }

  /**
   * Draw the graticule (grid and color targets)
   */
  private drawGraticule(): void {
    const { ctx } = this;
    // Use logical dimensions for drawing (hi-DPI context is scaled)
    const size = VECTORSCOPE_SIZE;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = GRATICULE_RADIUS;

    // Clear canvas
    ctx.fillStyle = getCSSColor('--bg-primary', '#111');
    ctx.fillRect(0, 0, size, size);

    // Draw circular grid
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.lineWidth = 1;

    // Concentric circles at 25%, 50%, 75%, 100%
    for (const scale of [0.25, 0.5, 0.75, 1.0]) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cross lines
    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.stroke();

    // Draw skin tone line
    ctx.strokeStyle = 'rgba(255, 200, 150, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(SKIN_TONE_ANGLE) * radius,
      centerY - Math.sin(SKIN_TONE_ANGLE) * radius
    );
    ctx.stroke();

    // Draw color targets
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const [key, target] of Object.entries(COLOR_TARGETS)) {
      // Convert Cb/Cr to canvas coordinates
      // Cb is horizontal (positive = right), Cr is vertical (positive = up)
      const x = centerX + target.cb * radius * 2;
      const y = centerY - target.cr * radius * 2;

      // Draw target box
      ctx.strokeStyle = this.getTargetColor(key);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 5, y - 5, 10, 10);

      // Draw label
      ctx.fillStyle = this.getTargetColor(key);
      ctx.fillText(target.label, x, y + 15);
    }
  }

  private getTargetColor(colorName: string): string {
    const colors: Record<string, string> = {
      red: 'rgba(255, 100, 100, 0.8)',
      magenta: 'rgba(255, 100, 255, 0.8)',
      blue: 'rgba(100, 100, 255, 0.8)',
      cyan: 'rgba(100, 255, 255, 0.8)',
      green: 'rgba(100, 255, 100, 0.8)',
      yellow: 'rgba(255, 255, 100, 0.8)',
    };
    return colors[colorName] || 'rgba(200, 200, 200, 0.8)';
  }

  /**
   * Calculate the optimal zoom level based on the color distribution in the image.
   * Analyzes the maximum chrominance extent and returns the best zoom level.
   */
  private calculateAutoZoom(imageData: ImageData): number {
    const { data, width, height } = imageData;

    // Sample pixels to find maximum chrominance distance
    const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height / 5000)));
    let maxDistance = 0;

    for (let srcY = 0; srcY < height; srcY += sampleStep) {
      for (let srcX = 0; srcX < width; srcX += sampleStep) {
        const i = (srcY * width + srcX) * 4;
        const r = data[i]! / 255;
        const g = data[i + 1]! / 255;
        const b = data[i + 2]! / 255;

        // Convert RGB to YCbCr (ITU-R BT.601)
        const cb = -0.169 * r - 0.331 * g + 0.5 * b;
        const cr = 0.5 * r - 0.419 * g - 0.081 * b;

        // Calculate distance from center (chrominance magnitude)
        const distance = Math.sqrt(cb * cb + cr * cr);
        if (distance > maxDistance) {
          maxDistance = distance;
        }
      }
    }

    // Maximum possible chrominance distance is ~0.5 (at color targets)
    // Choose zoom level that fits 95% of points with some margin
    // At zoom 1x: full range displayed (radius covers 0.5 distance)
    // At zoom 2x: half range displayed (radius covers 0.25 distance)
    // At zoom 4x: quarter range displayed (radius covers 0.125 distance)

    if (maxDistance < 0.10) {
      // Very low saturation content - zoom in to 4x
      return 4;
    } else if (maxDistance < 0.20) {
      // Low saturation content - zoom to 2x
      return 2;
    } else {
      // Normal/high saturation content - keep at 1x
      return 1;
    }
  }

  /**
   * Update vectorscope from ImageData
   * Uses GPU acceleration when available for better playback performance
   */
  update(imageData: ImageData): void {
    this.lastImageData = imageData;
    this.lastFloatFrame = null;

    // Calculate effective zoom for auto mode
    if (this.zoomMode === 'auto') {
      this.effectiveZoom = this.calculateAutoZoom(imageData);
      this.updateZoomButtonText();
    } else {
      this.effectiveZoom = this.zoomMode;
    }

    // Try GPU rendering first for better performance during playback
    const gpuProcessor = getSharedScopesProcessor();
    if (gpuProcessor && gpuProcessor.isReady()) {
      gpuProcessor.setPlaybackMode(this.isPlaybackMode);
      // Draw graticule first (CPU)
      this.drawGraticule();
      // Then GPU vectorscope overlay
      gpuProcessor.setImage(imageData);
      gpuProcessor.renderVectorscope(this.canvas, this.effectiveZoom);
      return;
    }

    // Fall back to CPU rendering
    this.drawCPU(imageData);
  }

  /**
   * Update vectorscope from HDR float data.
   * Uploads the float data as an RGBA16F texture to the GPU scopes processor,
   * preserving values > 1.0 that would be clipped by the UNSIGNED_BYTE path.
   *
   * @param floatData RGBA Float32Array (top-to-bottom row order)
   * @param width Image width
   * @param height Image height
   */
  updateFloat(floatData: Float32Array, width: number, height: number): void {
    this.lastFloatFrame = { data: floatData, width, height };
    this.lastImageData = null;

    // Calculate effective zoom for auto mode (sample float data)
    if (this.zoomMode === 'auto') {
      // Quick auto-zoom from float data: sample to estimate max chrominance
      const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height / 5000)));
      let maxDistance = 0;
      for (let srcY = 0; srcY < height; srcY += sampleStep) {
        for (let srcX = 0; srcX < width; srcX += sampleStep) {
          const i = (srcY * width + srcX) * 4;
          const r = floatData[i]!;
          const g = floatData[i + 1]!;
          const b = floatData[i + 2]!;
          const cb = -0.169 * r - 0.331 * g + 0.5 * b;
          const cr = 0.5 * r - 0.419 * g - 0.081 * b;
          const distance = Math.sqrt(cb * cb + cr * cr);
          if (distance > maxDistance) maxDistance = distance;
        }
      }
      this.effectiveZoom = maxDistance < 0.10 ? 4 : maxDistance < 0.20 ? 2 : 1;
      this.updateZoomButtonText();
    } else {
      this.effectiveZoom = this.zoomMode;
    }

    const gpuProcessor = getSharedScopesProcessor();
    if (gpuProcessor && gpuProcessor.isReady()) {
      gpuProcessor.setPlaybackMode(this.isPlaybackMode);
      // Draw graticule first (CPU)
      this.drawGraticule();
      // Upload float data and render
      gpuProcessor.setFloatImage(floatData, width, height);
      gpuProcessor.renderVectorscope(this.canvas, this.effectiveZoom);
      return;
    }

    // Fallback: convert float to ImageData for CPU rendering
    this.drawCPU(floatRGBAToImageData(floatData, width, height));
  }

  /**
   * Redraw the most recent frame, preserving HDR float data when available.
   */
  private redrawLastFrame(): void {
    if (this.lastFloatFrame) {
      this.updateFloat(this.lastFloatFrame.data, this.lastFloatFrame.width, this.lastFloatFrame.height);
      return;
    }
    if (this.lastImageData) {
      this.update(this.lastImageData);
    }
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
   * CPU-based vectorscope rendering (fallback)
   */
  private drawCPU(imageData: ImageData): void {
    const { ctx, canvas, dpr } = this;
    const { data, width, height } = imageData;

    // Redraw graticule (uses logical coordinates via scaled context)
    this.drawGraticule();

    // For getImageData/putImageData, we work in physical pixel coordinates
    // because these operations bypass the context transform
    const physicalWidth = canvas.width;
    const physicalHeight = canvas.height;
    const centerX = physicalWidth / 2;
    const centerY = physicalHeight / 2;
    const radius = GRATICULE_RADIUS * this.effectiveZoom * dpr;

    // Sample pixels and plot on vectorscope
    const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height / 10000)));

    // Use a data image for efficient point plotting (physical pixels)
    const plotData = ctx.getImageData(0, 0, physicalWidth, physicalHeight);
    const pixels = plotData.data;

    for (let srcY = 0; srcY < height; srcY += sampleStep) {
      for (let srcX = 0; srcX < width; srcX += sampleStep) {
        const i = (srcY * width + srcX) * 4;
        const r = data[i]! / 255;
        const g = data[i + 1]! / 255;
        const b = data[i + 2]! / 255;

        // Convert RGB to YCbCr (ITU-R BT.601)
        // Y = 0.299*R + 0.587*G + 0.114*B
        // Cb = -0.169*R - 0.331*G + 0.5*B (range -0.5 to 0.5)
        // Cr = 0.5*R - 0.419*G - 0.081*B (range -0.5 to 0.5)
        const cb = -0.169 * r - 0.331 * g + 0.5 * b;
        const cr = 0.5 * r - 0.419 * g - 0.081 * b;

        // Convert to canvas coordinates (Cb horizontal, Cr vertical) in physical pixels
        const plotX = Math.floor(centerX + cb * radius * 2);
        const plotY = Math.floor(centerY - cr * radius * 2);

        // Check bounds
        if (plotX >= 0 && plotX < physicalWidth && plotY >= 0 && plotY < physicalHeight) {
          const pIdx = (plotY * physicalWidth + plotX) * 4;
          // Add to existing color with some transparency
          pixels[pIdx] = Math.min(255, (pixels[pIdx] || 0) + 50);
          pixels[pIdx + 1] = Math.min(255, (pixels[pIdx + 1] || 0) + 50);
          pixels[pIdx + 2] = Math.min(255, (pixels[pIdx + 2] || 0) + 50);
          pixels[pIdx + 3] = 255;
        }
      }
    }

    ctx.putImageData(plotData, 0, 0);
  }

  /**
   * Update the zoom button text
   */
  private updateZoomButtonText(): void {
    if (this.zoomButton) {
      if (this.zoomMode === 'auto') {
        this.zoomButton.textContent = `A:${this.effectiveZoom}x`;
      } else {
        this.zoomButton.textContent = `${this.zoomMode}x`;
      }
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
   * Show vectorscope
   */
  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.draggableContainer.show();
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide vectorscope
   */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.draggableContainer.hide();
    this.emit('visibilityChanged', false);
  }

  /**
   * Check if vectorscope is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Cycle through zoom levels (1x → 2x → 4x → Auto → 1x)
   */
  cycleZoom(): void {
    const zoomLevels: VectorscopeZoom[] = [1, 2, 4, 'auto'];
    const currentIndex = zoomLevels.indexOf(this.zoomMode);
    this.zoomMode = zoomLevels[(currentIndex + 1) % zoomLevels.length]!;

    if (this.zoomMode !== 'auto') {
      this.effectiveZoom = this.zoomMode;
    }

    this.updateZoomButtonText();

    // Redraw with new zoom if we have image data
    this.redrawLastFrame();

    this.emit('zoomChanged', this.zoomMode);
  }

  /**
   * Set zoom level
   */
  setZoom(level: VectorscopeZoom): void {
    if (this.zoomMode === level) return;
    this.zoomMode = level;

    if (this.zoomMode !== 'auto') {
      this.effectiveZoom = this.zoomMode;
    }

    this.updateZoomButtonText();

    // Redraw with new zoom if we have image data
    this.redrawLastFrame();

    this.emit('zoomChanged', this.zoomMode);
  }

  /**
   * Get current zoom mode
   */
  getZoom(): VectorscopeZoom {
    return this.zoomMode;
  }

  /**
   * Get effective zoom (actual zoom value used for rendering)
   */
  getEffectiveZoom(): number {
    return this.effectiveZoom;
  }

  /**
   * Check if auto-fit zoom is enabled
   */
  isAutoZoom(): boolean {
    return this.zoomMode === 'auto';
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
    this.subs.dispose();
    this.zoomButton = null;
    this.draggableContainer.dispose();
  }
}
