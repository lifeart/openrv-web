/**
 * PixelProbe - Displays pixel values at cursor position
 *
 * Features:
 * - Show RGB values (0-255 and 0.0-1.0)
 * - Show HSL values
 * - Show pixel coordinates
 * - Click to lock/unlock position
 * - Copy values to clipboard
 * - Color swatch preview
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

export interface PixelProbeEvents extends EventMap {
  stateChanged: PixelProbeState;
  valueCopied: string;
}

export interface PixelProbeState {
  enabled: boolean;
  locked: boolean;
  x: number;
  y: number;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  ire: number; // Luminance in IRE units (0-100)
  format: 'rgb' | 'rgb01' | 'hsl' | 'hex' | 'ire';
}

export const DEFAULT_PIXEL_PROBE_STATE: PixelProbeState = {
  enabled: false,
  locked: false,
  x: 0,
  y: 0,
  rgb: { r: 0, g: 0, b: 0 },
  hsl: { h: 0, s: 0, l: 0 },
  ire: 0,
  format: 'rgb',
};

export class PixelProbe extends EventEmitter<PixelProbeEvents> {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private state: PixelProbeState = { ...DEFAULT_PIXEL_PROBE_STATE };

  // UI elements (initialized in createOverlayContent)
  private swatch!: HTMLElement;
  private coordsLabel!: HTMLElement;
  private rgbLabel!: HTMLElement;
  private rgb01Label!: HTMLElement;
  private hslLabel!: HTMLElement;
  private hexLabel!: HTMLElement;
  private ireLabel!: HTMLElement;
  private lockIndicator!: HTMLElement;
  private formatButtons: Map<string, HTMLButtonElement> = new Map();

  constructor() {
    super();

    // Create main container (toggle button)
    this.container = document.createElement('div');
    this.container.className = 'pixel-probe-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create floating overlay panel
    this.overlay = document.createElement('div');
    this.overlay.className = 'pixel-probe-overlay';
    this.overlay.dataset.testid = 'pixel-probe-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      background: rgba(30, 30, 30, 0.95);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 10px;
      z-index: 9998;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      color: #ccc;
      min-width: 180px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      pointer-events: auto;
    `;

    this.createOverlayContent();
  }

  private createOverlayContent(): void {
    // Header with lock indicator
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #444;
    `;

    const title = document.createElement('span');
    title.textContent = 'Pixel Probe';
    title.style.cssText = 'font-weight: 600; color: #eee;';

    this.lockIndicator = document.createElement('span');
    this.lockIndicator.innerHTML = getIconSvg('lock', 'sm');
    this.lockIndicator.style.cssText = `
      color: #4a9eff;
      display: none;
    `;
    this.lockIndicator.title = 'Position locked (click image to unlock)';

    header.appendChild(title);
    header.appendChild(this.lockIndicator);
    this.overlay.appendChild(header);

    // Color swatch and coordinates row
    const swatchRow = document.createElement('div');
    swatchRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    `;

    this.swatch = document.createElement('div');
    this.swatch.className = 'pixel-swatch';
    this.swatch.style.cssText = `
      width: 32px;
      height: 32px;
      border: 1px solid #555;
      border-radius: 4px;
      background: #000;
    `;

    this.coordsLabel = document.createElement('div');
    this.coordsLabel.style.cssText = `
      font-family: monospace;
      color: #888;
    `;
    this.coordsLabel.textContent = 'X: 0, Y: 0';

    swatchRow.appendChild(this.swatch);
    swatchRow.appendChild(this.coordsLabel);
    this.overlay.appendChild(swatchRow);

    // Value rows
    const valuesContainer = document.createElement('div');
    valuesContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    `;

    // RGB row (0-255)
    this.rgbLabel = this.createValueRow(valuesContainer, 'RGB', 'rgb(0, 0, 0)', 'rgb');

    // RGB row (0.0-1.0)
    this.rgb01Label = this.createValueRow(valuesContainer, 'RGB01', '(0.00, 0.00, 0.00)', 'rgb01');

    // HSL row
    this.hslLabel = this.createValueRow(valuesContainer, 'HSL', 'hsl(0°, 0%, 0%)', 'hsl');

    // Hex row
    this.hexLabel = this.createValueRow(valuesContainer, 'HEX', '#000000', 'hex');

    // IRE row (luminance in IRE units)
    this.ireLabel = this.createValueRow(valuesContainer, 'IRE', '0 IRE', 'ire');

    this.overlay.appendChild(valuesContainer);

    // Format buttons
    const formatRow = document.createElement('div');
    formatRow.style.cssText = `
      display: flex;
      gap: 4px;
    `;

    const formats: Array<{ key: PixelProbeState['format']; label: string }> = [
      { key: 'rgb', label: 'RGB' },
      { key: 'rgb01', label: '0-1' },
      { key: 'hsl', label: 'HSL' },
      { key: 'hex', label: 'HEX' },
      { key: 'ire', label: 'IRE' },
    ];

    for (const fmt of formats) {
      const btn = document.createElement('button');
      btn.textContent = fmt.label;
      btn.dataset.format = fmt.key;
      btn.style.cssText = `
        flex: 1;
        padding: 4px 6px;
        border: 1px solid #555;
        border-radius: 3px;
        background: #333;
        color: #aaa;
        font-size: 10px;
        cursor: pointer;
      `;
      btn.addEventListener('click', () => this.setFormat(fmt.key));
      btn.addEventListener('mouseenter', () => {
        if (this.state.format !== fmt.key) {
          btn.style.background = '#444';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (this.state.format !== fmt.key) {
          btn.style.background = '#333';
        }
      });
      this.formatButtons.set(fmt.key, btn);
      formatRow.appendChild(btn);
    }

    this.overlay.appendChild(formatRow);
    this.updateFormatButtons();

    // Copy hint
    const hint = document.createElement('div');
    hint.style.cssText = `
      margin-top: 8px;
      font-size: 10px;
      color: #666;
      text-align: center;
    `;
    hint.textContent = 'Click row to copy • Click image to lock';
    this.overlay.appendChild(hint);
  }

  private createValueRow(
    container: HTMLElement,
    label: string,
    initialValue: string,
    copyKey: string
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 6px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.1s ease;
    `;
    row.addEventListener('mouseenter', () => {
      row.style.background = '#3a3a3a';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });
    row.addEventListener('click', () => this.copyValue(copyKey));

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      width: 40px;
      color: #888;
      font-size: 10px;
    `;

    const valueEl = document.createElement('span');
    valueEl.textContent = initialValue;
    valueEl.style.cssText = `
      font-family: monospace;
      color: #ccc;
    `;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    container.appendChild(row);

    return valueEl;
  }

  /**
   * Update pixel values from canvas position
   */
  updateFromCanvas(
    x: number,
    y: number,
    imageData: ImageData | null,
    displayWidth: number,
    displayHeight: number
  ): void {
    if (!this.state.enabled || this.state.locked) return;

    // Clamp coordinates
    const px = Math.max(0, Math.min(displayWidth - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(displayHeight - 1, Math.floor(y)));

    // Get pixel value
    let r = 0, g = 0, b = 0;
    if (imageData) {
      const idx = (py * displayWidth + px) * 4;
      r = imageData.data[idx] ?? 0;
      g = imageData.data[idx + 1] ?? 0;
      b = imageData.data[idx + 2] ?? 0;
    }

    // Calculate luminance in IRE units (0-100)
    // Using Rec. 709 coefficients: Y = 0.2126R + 0.7152G + 0.0722B
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const ire = Math.round((luminance / 255) * 100);

    // Update state
    this.state.x = px;
    this.state.y = py;
    this.state.rgb = { r, g, b };
    this.state.hsl = this.rgbToHsl(r, g, b);
    this.state.ire = ire;

    this.updateDisplay();
  }

  /**
   * Update display with current values
   */
  private updateDisplay(): void {
    const { x, y, rgb, hsl, ire } = this.state;

    // Update coordinates
    this.coordsLabel.textContent = `X: ${x}, Y: ${y}`;

    // Update swatch
    this.swatch.style.background = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

    // Update RGB (0-255)
    this.rgbLabel.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

    // Update RGB (0-1)
    const r01 = (rgb.r / 255).toFixed(3);
    const g01 = (rgb.g / 255).toFixed(3);
    const b01 = (rgb.b / 255).toFixed(3);
    this.rgb01Label.textContent = `(${r01}, ${g01}, ${b01})`;

    // Update HSL
    this.hslLabel.textContent = `hsl(${hsl.h}°, ${hsl.s}%, ${hsl.l}%)`;

    // Update Hex
    this.hexLabel.textContent = '#' + this.rgbToHex(rgb.r, rgb.g, rgb.b);

    // Update IRE (luminance in broadcast units)
    this.ireLabel.textContent = `${ire} IRE`;
  }

  /**
   * Convert RGB to HSL
   */
  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  /**
   * Convert RGB to hex string
   */
  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    return toHex(r) + toHex(g) + toHex(b);
  }

  /**
   * Copy value to clipboard
   */
  private async copyValue(format: string): Promise<void> {
    const { rgb, hsl, ire } = this.state;
    let value = '';

    switch (format) {
      case 'rgb':
        value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        break;
      case 'rgb01':
        value = `${(rgb.r / 255).toFixed(3)}, ${(rgb.g / 255).toFixed(3)}, ${(rgb.b / 255).toFixed(3)}`;
        break;
      case 'hsl':
        value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
        break;
      case 'hex':
        value = '#' + this.rgbToHex(rgb.r, rgb.g, rgb.b);
        break;
      case 'ire':
        value = `${ire} IRE`;
        break;
    }

    try {
      await navigator.clipboard.writeText(value);
      this.emit('valueCopied', value);

      // Visual feedback - flash the row
      const labels: Record<string, HTMLElement> = {
        rgb: this.rgbLabel,
        rgb01: this.rgb01Label,
        hsl: this.hslLabel,
        hex: this.hexLabel,
        ire: this.ireLabel,
      };
      const label = labels[format];
      if (label) {
        const original = label.style.color;
        label.style.color = '#4a9eff';
        setTimeout(() => {
          label.style.color = original;
        }, 200);
      }
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  }

  /**
   * Set display format
   */
  setFormat(format: PixelProbeState['format']): void {
    this.state.format = format;
    this.updateFormatButtons();
    this.emit('stateChanged', { ...this.state });
  }

  private updateFormatButtons(): void {
    for (const [key, btn] of this.formatButtons) {
      if (key === this.state.format) {
        btn.style.background = '#4a9eff';
        btn.style.borderColor = '#4a9eff';
        btn.style.color = '#fff';
      } else {
        btn.style.background = '#333';
        btn.style.borderColor = '#555';
        btn.style.color = '#aaa';
      }
    }
  }

  /**
   * Toggle lock state
   */
  toggleLock(): void {
    this.state.locked = !this.state.locked;
    this.lockIndicator.style.display = this.state.locked ? 'block' : 'none';
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Enable pixel probe
   */
  enable(): void {
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.show();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Disable pixel probe
   */
  disable(): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.state.locked = false;
    this.hide();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Toggle enabled state
   */
  toggle(): void {
    if (this.state.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Show the overlay at position
   */
  show(): void {
    if (!document.body.contains(this.overlay)) {
      document.body.appendChild(this.overlay);
    }
    this.overlay.style.display = 'block';
  }

  /**
   * Hide the overlay
   */
  hide(): void {
    this.overlay.style.display = 'none';
  }

  /**
   * Position the overlay near cursor
   */
  setOverlayPosition(clientX: number, clientY: number): void {
    if (!this.state.enabled) return;

    const padding = 20;
    const overlayRect = this.overlay.getBoundingClientRect();

    let x = clientX + padding;
    let y = clientY + padding;

    // Keep within viewport
    if (x + overlayRect.width > window.innerWidth) {
      x = clientX - overlayRect.width - padding;
    }
    if (y + overlayRect.height > window.innerHeight) {
      y = clientY - overlayRect.height - padding;
    }

    this.overlay.style.left = `${Math.max(0, x)}px`;
    this.overlay.style.top = `${Math.max(0, y)}px`;
  }

  /**
   * Get current state (deep copy to prevent external mutation)
   */
  getState(): PixelProbeState {
    return {
      ...this.state,
      rgb: { ...this.state.rgb },
      hsl: { ...this.state.hsl },
    };
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Check if locked
   */
  isLocked(): boolean {
    return this.state.locked;
  }

  /**
   * Get the container element
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Dispose
   */
  dispose(): void {
    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.formatButtons.clear();
  }
}
