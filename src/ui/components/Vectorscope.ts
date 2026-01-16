/**
 * Vectorscope - Color analysis display showing chrominance distribution
 *
 * Features:
 * - Circular display of color hue and saturation
 * - Standard graticule with color targets (R, Mg, B, Cy, G, Yl)
 * - Skin tone line reference
 * - Zoom control for detailed analysis
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface VectorscopeEvents extends EventMap {
  visibilityChanged: boolean;
  zoomChanged: number;
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

export class Vectorscope extends EventEmitter<VectorscopeEvents> {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private zoom = 1;
  private zoomButton: HTMLButtonElement | null = null;
  private lastImageData: ImageData | null = null;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'vectorscope-container';
    this.container.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #333;
      border-radius: 4px;
      padding: 8px;
      display: none;
      z-index: 100;
      user-select: none;
    `;
    // Prevent viewer from capturing pointer events
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('pointermove', (e) => e.stopPropagation());
    this.container.addEventListener('pointerup', (e) => e.stopPropagation());

    this.canvas = document.createElement('canvas');
    this.canvas.width = VECTORSCOPE_SIZE;
    this.canvas.height = VECTORSCOPE_SIZE;
    this.canvas.style.cssText = `
      display: block;
      background: #111;
      border-radius: 50%;
    `;

    this.ctx = this.canvas.getContext('2d')!;

    this.createUI();
    this.drawGraticule();
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
    title.textContent = 'Vectorscope';
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

    // Zoom toggle button
    this.zoomButton = this.createControlButton('1x', 'Toggle zoom (1x/2x/4x)');
    this.zoomButton.dataset.testid = 'vectorscope-zoom-button';
    this.zoomButton.addEventListener('click', () => this.cycleZoom());
    controls.appendChild(this.zoomButton);

    // Close button
    const closeButton = this.createControlButton('\u00d7', 'Close vectorscope');
    closeButton.dataset.testid = 'vectorscope-close-button';
    closeButton.style.fontSize = '14px';
    closeButton.addEventListener('click', () => this.hide());
    controls.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(controls);
    this.container.appendChild(header);
    this.container.appendChild(this.canvas);
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
   * Draw the graticule (grid and color targets)
   */
  private drawGraticule(): void {
    const { ctx, canvas } = this;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = GRATICULE_RADIUS;

    // Clear canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
   * Update vectorscope from ImageData
   */
  update(imageData: ImageData): void {
    this.lastImageData = imageData;
    const { ctx, canvas } = this;
    const { data, width, height } = imageData;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = GRATICULE_RADIUS * this.zoom;

    // Redraw graticule
    this.drawGraticule();

    // Sample pixels and plot on vectorscope
    const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height / 10000)));

    // Use a data image for efficient point plotting
    const plotData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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

        // Convert to canvas coordinates (Cb horizontal, Cr vertical)
        const plotX = Math.floor(centerX + cb * radius * 2);
        const plotY = Math.floor(centerY - cr * radius * 2);

        // Check bounds
        if (plotX >= 0 && plotX < canvas.width && plotY >= 0 && plotY < canvas.height) {
          const pIdx = (plotY * canvas.width + plotX) * 4;
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
    this.container.style.display = 'block';
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide vectorscope
   */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.container.style.display = 'none';
    this.emit('visibilityChanged', false);
  }

  /**
   * Check if vectorscope is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Cycle through zoom levels
   */
  cycleZoom(): void {
    const zoomLevels = [1, 2, 4];
    const currentIndex = zoomLevels.indexOf(this.zoom);
    this.zoom = zoomLevels[(currentIndex + 1) % zoomLevels.length]!;

    if (this.zoomButton) {
      this.zoomButton.textContent = `${this.zoom}x`;
    }

    // Redraw with new zoom if we have image data
    if (this.lastImageData) {
      this.update(this.lastImageData);
    }

    this.emit('zoomChanged', this.zoom);
  }

  /**
   * Set zoom level
   */
  setZoom(level: 1 | 2 | 4): void {
    if (this.zoom === level) return;
    this.zoom = level;

    if (this.zoomButton) {
      this.zoomButton.textContent = `${this.zoom}x`;
    }

    // Redraw with new zoom if we have image data
    if (this.lastImageData) {
      this.update(this.lastImageData);
    }

    this.emit('zoomChanged', this.zoom);
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.zoom;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.zoomButton = null;
  }
}
