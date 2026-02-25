/**
 * PixelProbe - Displays pixel values at cursor position
 *
 * Features:
 * - Show RGB/RGBA values (0-255 and 0.0-1.0)
 * - Show HSL values
 * - Show pixel coordinates
 * - Click to lock/unlock position
 * - Copy values to clipboard
 * - Color swatch preview
 * - Area averaging (1x1, 3x3, 5x5, 9x9)
 * - Source vs Rendered toggle
 * - Alpha channel display
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { clamp } from '../../utils/math';
import { luminanceRec709 } from '../../color/ColorProcessingFacade';


export interface PixelProbeEvents extends EventMap {
  stateChanged: PixelProbeState;
  valueCopied: string;
}

/** Available sample sizes for area averaging */
export type SampleSize = 1 | 3 | 5 | 9;

/** Source mode for pixel values */
export type SourceMode = 'rendered' | 'source';

export interface PixelProbeState {
  enabled: boolean;
  locked: boolean;
  x: number;
  y: number;
  rgb: { r: number; g: number; b: number };
  alpha: number; // Alpha channel value 0-255
  hsl: { h: number; s: number; l: number };
  ire: number; // Luminance in IRE units (0-100)
  format: 'rgb' | 'rgb01' | 'hsl' | 'hex' | 'ire';
  sampleSize: SampleSize;
  sourceMode: SourceMode;
  floatPrecision: 3 | 6;
}

export const DEFAULT_PIXEL_PROBE_STATE: PixelProbeState = {
  enabled: false,
  locked: false,
  x: 0,
  y: 0,
  rgb: { r: 0, g: 0, b: 0 },
  alpha: 255,
  hsl: { h: 0, s: 0, l: 0 },
  ire: 0,
  format: 'rgb',
  sampleSize: 1,
  sourceMode: 'rendered',
  floatPrecision: 3,
};

const OVERLAY_CURSOR_PADDING = 20;
const OVERLAY_INTERACTION_MARGIN = 24;

/**
 * Calculate the average RGBA values over an NxN area centered at (x, y).
 * Exported for unit testing.
 */
export function calculateAreaAverage(
  imageData: ImageData,
  centerX: number,
  centerY: number,
  sampleSize: SampleSize
): { r: number; g: number; b: number; a: number } {
  const { width, height, data } = imageData;
  const halfSize = Math.floor(sampleSize / 2);

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalA = 0;
  let count = 0;

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const px = centerX + dx;
      const py = centerY + dy;

      // Skip out-of-bounds pixels
      if (px < 0 || px >= width || py < 0 || py >= height) {
        continue;
      }

      const idx = (py * width + px) * 4;
      totalR += data[idx] ?? 0;
      totalG += data[idx + 1] ?? 0;
      totalB += data[idx + 2] ?? 0;
      totalA += data[idx + 3] ?? 0;
      count++;
    }
  }

  if (count === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
    a: Math.round(totalA / count),
  };
}

export class PixelProbe extends EventEmitter<PixelProbeEvents> {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private state: PixelProbeState = { ...DEFAULT_PIXEL_PROBE_STATE };

  // Source image data for "source" mode (before color pipeline)
  private sourceImageData: ImageData | null = null;

  // HDR float values (may exceed 0-1 range), set by updateFromHDRValues
  private hdrFloats: { r: number; g: number; b: number; a: number } | null = null;

  // HDR-specific properties
  private colorSpaceInfo: string = 'sRGB';
  private floatPrecision: 3 | 6 = 3;

  // UI elements (initialized in createOverlayContent)
  private swatch!: HTMLElement;
  private coordsLabel!: HTMLElement;
  private rgbLabel!: HTMLElement;
  private rgb01Label!: HTMLElement;
  private alphaLabel!: HTMLElement;
  private hslLabel!: HTMLElement;
  private hexLabel!: HTMLElement;
  private ireLabel!: HTMLElement;
  private colorSpaceLabel!: HTMLElement;
  private nitsLabel!: HTMLElement;
  private nitsRow!: HTMLElement;
  private lockIndicator!: HTMLElement;
  private sampleSizeLabel!: HTMLElement;
  private sourceModeLabel!: HTMLElement;
  private precisionButton!: HTMLButtonElement;
  private formatButtons: Map<string, HTMLButtonElement> = new Map();
  private sampleSizeButtons: Map<SampleSize, HTMLButtonElement> = new Map();
  private sourceModeButtons: Map<SourceMode, HTMLButtonElement> = new Map();
  private valueRows: Map<string, HTMLElement> = new Map();
  private overlayInteractionActive = false;


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
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 10px;
      z-index: 9998;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      color: var(--text-primary);
      min-width: 200px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      pointer-events: auto;
    `;

    this.createOverlayContent();
    this.bindOverlayInteractionEvents();

  }

  private bindOverlayInteractionEvents(): void {
    this.overlay.addEventListener('pointerenter', () => {
      this.overlayInteractionActive = true;
    });
    this.overlay.addEventListener('pointerleave', () => {
      this.overlayInteractionActive = false;
    });
    this.overlay.addEventListener('focusin', () => {
      this.overlayInteractionActive = true;
    });
    this.overlay.addEventListener('focusout', (event: FocusEvent) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (!nextTarget || !this.overlay.contains(nextTarget)) {
        this.overlayInteractionActive = false;
      }
    });
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
      border-bottom: 1px solid var(--border-primary);
    `;

    const title = document.createElement('span');
    title.textContent = 'Pixel Probe';
    title.style.cssText = 'font-weight: 500; color: var(--text-primary);';

    this.lockIndicator = document.createElement('span');
    this.lockIndicator.innerHTML = getIconSvg('lock', 'sm');
    this.lockIndicator.style.cssText = `
      color: var(--accent-primary);
      display: none;
    `;
    this.lockIndicator.title = 'Position locked (click image to unlock)';

    header.appendChild(title);
    header.appendChild(this.lockIndicator);
    this.overlay.appendChild(header);

    // Sample size row
    this.createSampleSizeRow();

    // Source/Rendered toggle row
    this.createSourceModeRow();

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
    this.swatch.dataset.testid = 'pixel-probe-swatch';
    this.swatch.style.cssText = `
      width: 32px;
      height: 32px;
      border: 1px solid var(--border-secondary);
      border-radius: 4px;
      background: #000;
    `;

    this.coordsLabel = document.createElement('div');
    this.coordsLabel.dataset.testid = 'pixel-probe-coords';
    this.coordsLabel.style.cssText = `
      font-family: monospace;
      color: var(--text-secondary);
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

    // Alpha row
    this.alphaLabel = this.createValueRow(valuesContainer, 'Alpha', '255 (1.000)', 'alpha');

    // HSL row
    this.hslLabel = this.createValueRow(valuesContainer, 'HSL', 'hsl(0°, 0%, 0%)', 'hsl');

    // Hex row
    this.hexLabel = this.createValueRow(valuesContainer, 'HEX', '#000000', 'hex');

    // IRE row (luminance in IRE units)
    this.ireLabel = this.createValueRow(valuesContainer, 'IRE', '0 IRE', 'ire');

    // Nits row (HDR luminance in cd/m²)
    const nitsRow = document.createElement('div');
    nitsRow.style.cssText = `
      display: none;
      align-items: center;
      gap: 6px;
      padding: 3px 6px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.12s ease;
    `;
    nitsRow.addEventListener('pointerenter', () => {
      nitsRow.style.background = 'var(--bg-hover)';
    });
    nitsRow.addEventListener('pointerleave', () => {
      nitsRow.style.background = 'transparent';
    });
    nitsRow.addEventListener('click', () => this.copyValue('nits'));

    const nitsLabelEl = document.createElement('span');
    nitsLabelEl.textContent = 'Nits';
    nitsLabelEl.style.cssText = `
      width: 40px;
      color: var(--text-secondary);
      font-size: 10px;
    `;

    this.nitsLabel = document.createElement('span');
    this.nitsLabel.textContent = '0 cd/m\u00B2';
    this.nitsLabel.dataset.testid = 'pixel-probe-nits';
    this.nitsLabel.style.cssText = `
      font-family: monospace;
      color: var(--text-primary);
    `;

    nitsRow.appendChild(nitsLabelEl);
    nitsRow.appendChild(this.nitsLabel);
    valuesContainer.appendChild(nitsRow);
    this.nitsRow = nitsRow;

    // Color space row
    this.colorSpaceLabel = this.createValueRow(valuesContainer, 'Space', 'sRGB', 'colorspace');

    this.overlay.appendChild(valuesContainer);

    // Format buttons
    const formatRow = document.createElement('div');
    formatRow.setAttribute('role', 'group');
    formatRow.setAttribute('aria-label', 'Color format selection');
    formatRow.style.cssText = `
      display: flex;
      gap: 4px;
    `;

    const formats: Array<{ key: PixelProbeState['format']; label: string; ariaLabel: string }> = [
      { key: 'rgb', label: 'RGB', ariaLabel: 'RGB format (0-255)' },
      { key: 'rgb01', label: '0-1', ariaLabel: 'RGB format (0.0-1.0)' },
      { key: 'hsl', label: 'HSL', ariaLabel: 'HSL format (Hue, Saturation, Lightness)' },
      { key: 'hex', label: 'HEX', ariaLabel: 'Hexadecimal color format' },
      { key: 'ire', label: 'IRE', ariaLabel: 'IRE luminance units' },
    ];

    for (const fmt of formats) {
      const btn = document.createElement('button');
      btn.textContent = fmt.label;
      btn.dataset.format = fmt.key;
      btn.setAttribute('aria-label', fmt.ariaLabel);
      btn.setAttribute('aria-pressed', fmt.key === this.state.format ? 'true' : 'false');
      btn.style.cssText = `
        flex: 1;
        padding: 4px 6px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 10px;
        cursor: pointer;
      `;
      btn.addEventListener('click', () => this.setFormat(fmt.key));
      btn.addEventListener('pointerenter', () => {
        if (this.state.format !== fmt.key) {
          btn.style.background = 'var(--border-primary)';
        }
      });
      btn.addEventListener('pointerleave', () => {
        if (this.state.format !== fmt.key) {
          btn.style.background = 'var(--bg-secondary)';
        }
      });
      this.formatButtons.set(fmt.key, btn);
      formatRow.appendChild(btn);
    }

    // Float precision toggle button
    const precisionBtn = document.createElement('button');
    precisionBtn.textContent = 'P3';
    precisionBtn.dataset.testid = 'pixel-probe-precision-toggle';
    precisionBtn.setAttribute('aria-label', 'Toggle float precision between 3 and 6 decimal places');
    precisionBtn.style.cssText = `
      flex: 1;
      padding: 4px 6px;
      border: 1px solid var(--border-secondary);
      border-radius: 3px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 10px;
      cursor: pointer;
    `;
    precisionBtn.addEventListener('click', () => {
      this.setFloatPrecision(this.floatPrecision === 3 ? 6 : 3);
    });
    precisionBtn.addEventListener('pointerenter', () => {
      precisionBtn.style.background = 'var(--border-primary)';
    });
    precisionBtn.addEventListener('pointerleave', () => {
      this.updatePrecisionButton();
    });
    this.precisionButton = precisionBtn;
    formatRow.appendChild(precisionBtn);

    this.overlay.appendChild(formatRow);
    this.updateFormatButtons();
    this.updatePrecisionButton();

    // Copy hint
    const hint = document.createElement('div');
    hint.style.cssText = `
      margin-top: 8px;
      font-size: 10px;
      color: var(--text-muted);
      text-align: center;
    `;
    hint.textContent = 'Click row to copy • Click image to lock';
    this.overlay.appendChild(hint);
  }

  private createSampleSizeRow(): void {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    `;

    this.sampleSizeLabel = document.createElement('span');
    this.sampleSizeLabel.textContent = 'Sample:';
    this.sampleSizeLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
    `;

    const buttonsContainer = document.createElement('div');
    buttonsContainer.setAttribute('role', 'group');
    buttonsContainer.setAttribute('aria-label', 'Sample size selection');
    buttonsContainer.style.cssText = `
      display: flex;
      gap: 3px;
    `;
    buttonsContainer.dataset.testid = 'pixel-probe-sample-size';

    const sampleSizes: Array<{ size: SampleSize; label: string }> = [
      { size: 1, label: '1x1' },
      { size: 3, label: '3x3' },
      { size: 5, label: '5x5' },
      { size: 9, label: '9x9' },
    ];

    for (const { size, label } of sampleSizes) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset.sampleSize = size.toString();
      btn.setAttribute('aria-label', `Sample ${label} pixels`);
      btn.setAttribute('aria-pressed', size === this.state.sampleSize ? 'true' : 'false');
      btn.style.cssText = `
        padding: 3px 6px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 10px;
        cursor: pointer;
      `;
      btn.addEventListener('click', () => this.setSampleSize(size));
      btn.addEventListener('pointerenter', () => {
        if (this.state.sampleSize !== size) {
          btn.style.background = 'var(--border-primary)';
        }
      });
      btn.addEventListener('pointerleave', () => {
        if (this.state.sampleSize !== size) {
          btn.style.background = 'var(--bg-secondary)';
        }
      });
      this.sampleSizeButtons.set(size, btn);
      buttonsContainer.appendChild(btn);
    }

    row.appendChild(this.sampleSizeLabel);
    row.appendChild(buttonsContainer);
    this.overlay.appendChild(row);

    this.updateSampleSizeButtons();
  }

  private createSourceModeRow(): void {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    `;

    this.sourceModeLabel = document.createElement('span');
    this.sourceModeLabel.textContent = 'Values:';
    this.sourceModeLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
    `;

    const buttonsContainer = document.createElement('div');
    buttonsContainer.setAttribute('role', 'group');
    buttonsContainer.setAttribute('aria-label', 'Value source selection');
    buttonsContainer.style.cssText = `
      display: flex;
      gap: 3px;
    `;
    buttonsContainer.dataset.testid = 'pixel-probe-source-mode';

    const modes: Array<{ mode: SourceMode; label: string; title: string }> = [
      { mode: 'rendered', label: 'Rendered', title: 'Show values after color pipeline (graded)' },
      { mode: 'source', label: 'Source', title: 'Show original source values (before grading)' },
    ];

    for (const { mode, label, title } of modes) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.title = title;
      btn.dataset.sourceMode = mode;
      btn.setAttribute('aria-label', title);
      btn.setAttribute('aria-pressed', mode === this.state.sourceMode ? 'true' : 'false');
      btn.style.cssText = `
        padding: 3px 8px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 10px;
        cursor: pointer;
      `;
      btn.addEventListener('click', () => this.setSourceMode(mode));
      btn.addEventListener('pointerenter', () => {
        if (this.state.sourceMode !== mode) {
          btn.style.background = 'var(--border-primary)';
        }
      });
      btn.addEventListener('pointerleave', () => {
        if (this.state.sourceMode !== mode) {
          btn.style.background = 'var(--bg-secondary)';
        }
      });
      this.sourceModeButtons.set(mode, btn);
      buttonsContainer.appendChild(btn);
    }

    row.appendChild(this.sourceModeLabel);
    row.appendChild(buttonsContainer);
    this.overlay.appendChild(row);

    this.updateSourceModeButtons();
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
      border: 1px solid transparent;
      cursor: pointer;
      transition: background 0.12s ease;
    `;
    row.addEventListener('pointerenter', () => {
      this.applyValueRowStyle(copyKey, row, true);
    });
    row.addEventListener('pointerleave', () => {
      this.applyValueRowStyle(copyKey, row, false);
    });
    row.addEventListener('click', () => this.copyValue(copyKey));

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      width: 40px;
      color: var(--text-secondary);
      font-size: 10px;
    `;

    const valueEl = document.createElement('span');
    valueEl.textContent = initialValue;
    valueEl.dataset.testid = `pixel-probe-${copyKey}`;
    valueEl.style.cssText = `
      font-family: monospace;
      color: var(--text-primary);
    `;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    container.appendChild(row);
    this.valueRows.set(copyKey, row);
    this.applyValueRowStyle(copyKey, row, false);

    return valueEl;
  }

  private applyValueRowStyle(copyKey: string, row: HTMLElement, hovered: boolean): void {
    if (hovered) {
      row.style.background = 'var(--bg-hover)';
      return;
    }

    const isActive = copyKey === this.state.format;
    row.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'transparent';
    row.style.borderColor = isActive ? 'rgba(var(--accent-primary-rgb), 0.45)' : 'transparent';
  }

  /**
   * Set source image data for "source" mode (before color pipeline)
   */
  setSourceImageData(imageData: ImageData | null): void {
    this.sourceImageData = imageData;
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
    const px = clamp(Math.floor(x), 0, displayWidth - 1);
    const py = clamp(Math.floor(y), 0, displayHeight - 1);

    // Choose image data based on source mode
    const activeImageData =
      this.state.sourceMode === 'source' && this.sourceImageData
        ? this.sourceImageData
        : imageData;

    // Get pixel value (with area averaging if sampleSize > 1)
    let r = 0, g = 0, b = 0, a = 255;
    if (activeImageData) {
      if (this.state.sampleSize > 1) {
        const avg = calculateAreaAverage(activeImageData, px, py, this.state.sampleSize);
        r = avg.r;
        g = avg.g;
        b = avg.b;
        a = avg.a;
      } else {
        // Use activeImageData.width for correct index calculation
        // This ensures correct behavior when imageData dimensions differ from display dimensions
        const idx = (py * activeImageData.width + px) * 4;
        r = activeImageData.data[idx] ?? 0;
        g = activeImageData.data[idx + 1] ?? 0;
        b = activeImageData.data[idx + 2] ?? 0;
        a = activeImageData.data[idx + 3] ?? 255;
      }
    }

    // Calculate luminance in IRE units (0-100)
    // Using Rec. 709 coefficients: Y = 0.2126R + 0.7152G + 0.0722B
    const luminance = luminanceRec709(r, g, b);
    const ire = Math.round((luminance / 255) * 100);

    // Update state
    this.state.x = px;
    this.state.y = py;
    this.state.rgb = { r, g, b };
    this.state.alpha = a;
    this.state.hsl = this.rgbToHsl(r, g, b);
    this.state.ire = ire;

    // Clear HDR floats since we're using 8-bit path
    this.hdrFloats = null;

    this.updateDisplay();
  }

  /**
   * Update pixel values from HDR float data (values may exceed 0-1 range).
   * Called when the HDR WebGL path is active.
   */
  updateFromHDRValues(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number,
    displayWidth: number,
    displayHeight: number
  ): void {
    if (!this.state.enabled || this.state.locked) return;

    const px = clamp(Math.floor(x), 0, displayWidth - 1);
    const py = clamp(Math.floor(y), 0, displayHeight - 1);

    // Convert float values (0.0-1.0+ range) to 0-255 for legacy display formats
    // but preserve the raw floats for RGB01 display
    const r255 = Math.round(clamp(r * 255, 0, 255));
    const g255 = Math.round(clamp(g * 255, 0, 255));
    const b255 = Math.round(clamp(b * 255, 0, 255));
    const a255 = Math.round(clamp(a * 255, 0, 255));

    // Calculate luminance in IRE units using float values
    const luminanceFloat = luminanceRec709(r, g, b);
    const ire = Math.round(clamp(luminanceFloat * 100, 0, 100));

    this.state.x = px;
    this.state.y = py;
    this.state.rgb = { r: r255, g: g255, b: b255 };
    this.state.alpha = a255;
    this.state.hsl = this.rgbToHsl(r255, g255, b255);
    this.state.ire = ire;

    // Store raw float values for HDR-aware display
    this.hdrFloats = { r, g, b, a };

    this.updateDisplay();
  }

  /**
   * Update display with current values
   */
  private updateDisplay(): void {
    const { x, y, rgb, alpha, hsl, ire, sampleSize } = this.state;

    // Update coordinates with sample size indicator
    const sampleLabel = sampleSize > 1 ? ` (${sampleSize}x${sampleSize} avg)` : '';
    this.coordsLabel.textContent = `X: ${x}, Y: ${y}${sampleLabel}`;

    // Update swatch (with alpha)
    if (alpha < 255) {
      // Show checkerboard for transparency
      // The semi-transparent color must be on TOP (first in list) so checkerboard shows through
      this.swatch.style.background = `
        linear-gradient(rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha / 255}), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha / 255})),
        linear-gradient(45deg, #666 25%, transparent 25%),
        linear-gradient(-45deg, #666 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #666 75%),
        linear-gradient(-45deg, transparent 75%, #666 75%),
        #333
      `;
      this.swatch.style.backgroundSize = '100% 100%, 8px 8px, 8px 8px, 8px 8px, 8px 8px, 100% 100%';
      this.swatch.style.backgroundPosition = '0 0, 0 0, 0 4px, 4px -4px, -4px 0px, 0 0';
    } else {
      this.swatch.style.background = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      this.swatch.style.backgroundSize = '';
      this.swatch.style.backgroundPosition = '';
    }

    // Update RGB (0-255)
    this.rgbLabel.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

    // Update RGB (0-1) — use raw HDR floats when available for values > 1.0
    if (this.hdrFloats) {
      const precision = this.floatPrecision;
      const r01 = this.hdrFloats.r.toFixed(precision);
      const g01 = this.hdrFloats.g.toFixed(precision);
      const b01 = this.hdrFloats.b.toFixed(precision);
      const isHDR = this.hdrFloats.r > 1.0 || this.hdrFloats.g > 1.0 || this.hdrFloats.b > 1.0;

      // Color-code out-of-range values
      const rColor = this.hdrFloats.r > 1.0 ? 'color: red;' : this.hdrFloats.r < 0.0 ? 'color: #6699FF;' : '';
      const gColor = this.hdrFloats.g > 1.0 ? 'color: red;' : this.hdrFloats.g < 0.0 ? 'color: #6699FF;' : '';
      const bColor = this.hdrFloats.b > 1.0 ? 'color: red;' : this.hdrFloats.b < 0.0 ? 'color: #6699FF;' : '';

      if (rColor || gColor || bColor) {
        const rSpan = rColor ? `<span style="${rColor}">${r01}</span>` : r01;
        const gSpan = gColor ? `<span style="${gColor}">${g01}</span>` : g01;
        const bSpan = bColor ? `<span style="${bColor}">${b01}</span>` : b01;
        this.rgb01Label.innerHTML = `(${rSpan}, ${gSpan}, ${bSpan})${isHDR ? ' HDR' : ''}`;
      } else {
        this.rgb01Label.textContent = `(${r01}, ${g01}, ${b01})${isHDR ? ' HDR' : ''}`;
      }
    } else {
      const precision = this.floatPrecision;
      const r01 = (rgb.r / 255).toFixed(precision);
      const g01 = (rgb.g / 255).toFixed(precision);
      const b01 = (rgb.b / 255).toFixed(precision);
      this.rgb01Label.textContent = `(${r01}, ${g01}, ${b01})`;
    }

    // Update Alpha
    const a01 = (alpha / 255).toFixed(3);
    this.alphaLabel.textContent = `${alpha} (${a01})`;

    // Update HSL
    this.hslLabel.textContent = `hsl(${hsl.h}°, ${hsl.s}%, ${hsl.l}%)`;

    // Update Hex
    this.hexLabel.textContent = '#' + this.rgbToHex(rgb.r, rgb.g, rgb.b);

    // Update IRE (luminance in broadcast units)
    this.ireLabel.textContent = `${ire} IRE`;

    // Update Nits (HDR luminance in cd/m²)
    if (this.hdrFloats) {
      this.nitsRow.style.display = 'flex';
      const luminance = luminanceRec709(this.hdrFloats.r, this.hdrFloats.g, this.hdrFloats.b);
      const nits = luminance * 203;
      if (nits >= 1000) {
        this.nitsLabel.textContent = `${(nits / 1000).toFixed(2)} K cd/m\u00B2`;
      } else {
        this.nitsLabel.textContent = `${Math.round(nits)} cd/m\u00B2`;
      }
    } else {
      this.nitsRow.style.display = 'none';
    }

    // Update color space
    this.colorSpaceLabel.textContent = this.colorSpaceInfo;
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
    const { rgb, alpha, hsl, ire } = this.state;
    let value = '';

    const precision = this.floatPrecision;

    switch (format) {
      case 'rgb':
        value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        break;
      case 'rgb01':
        if (this.hdrFloats) {
          value = `${this.hdrFloats.r.toFixed(precision)}, ${this.hdrFloats.g.toFixed(precision)}, ${this.hdrFloats.b.toFixed(precision)}`;
        } else {
          value = `${(rgb.r / 255).toFixed(precision)}, ${(rgb.g / 255).toFixed(precision)}, ${(rgb.b / 255).toFixed(precision)}`;
        }
        break;
      case 'alpha':
        value = `${alpha} (${(alpha / 255).toFixed(3)})`;
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
      case 'nits':
        if (this.hdrFloats) {
          const luminance = luminanceRec709(this.hdrFloats.r, this.hdrFloats.g, this.hdrFloats.b);
          const nits = luminance * 203;
          value = nits >= 1000 ? `${(nits / 1000).toFixed(2)} K cd/m\u00B2` : `${Math.round(nits)} cd/m\u00B2`;
        }
        break;
      case 'colorspace':
        value = this.colorSpaceInfo;
        break;
    }

    try {
      await navigator.clipboard.writeText(value);
      this.emit('valueCopied', value);

      // Visual feedback - flash the row
      const labels: Record<string, HTMLElement> = {
        rgb: this.rgbLabel,
        rgb01: this.rgb01Label,
        alpha: this.alphaLabel,
        hsl: this.hslLabel,
        hex: this.hexLabel,
        ire: this.ireLabel,
        nits: this.nitsLabel,
        colorspace: this.colorSpaceLabel,
      };
      const label = labels[format];
      if (label) {
        const original = label.style.color;
        label.style.color = 'var(--accent-primary)';
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
      const isSelected = key === this.state.format;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      if (isSelected) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        btn.style.color = 'var(--text-on-accent)';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-secondary)';
        btn.style.color = 'var(--text-secondary)';
      }
    }

    for (const [copyKey, row] of this.valueRows) {
      this.applyValueRowStyle(copyKey, row, false);
    }
  }

  /**
   * Set sample size for area averaging
   */
  setSampleSize(size: SampleSize): void {
    if (this.state.sampleSize === size) return;
    this.state.sampleSize = size;
    this.updateSampleSizeButtons();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current sample size
   */
  getSampleSize(): SampleSize {
    return this.state.sampleSize;
  }

  private updateSampleSizeButtons(): void {
    for (const [size, btn] of this.sampleSizeButtons) {
      const isSelected = size === this.state.sampleSize;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      if (isSelected) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        btn.style.color = 'var(--text-on-accent)';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-secondary)';
        btn.style.color = 'var(--text-secondary)';
      }
    }
  }

  /**
   * Set source mode (rendered vs source)
   */
  setSourceMode(mode: SourceMode): void {
    if (this.state.sourceMode === mode) return;
    this.state.sourceMode = mode;
    this.updateSourceModeButtons();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current source mode
   */
  getSourceMode(): SourceMode {
    return this.state.sourceMode;
  }

  private updateSourceModeButtons(): void {
    for (const [mode, btn] of this.sourceModeButtons) {
      const isSelected = mode === this.state.sourceMode;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      if (isSelected) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        btn.style.color = 'var(--text-on-accent)';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-secondary)';
        btn.style.color = 'var(--text-secondary)';
      }
    }
  }

  /**
   * Set the color space info string displayed in the Space row
   */
  setColorSpace(info: string): void {
    this.colorSpaceInfo = info;
    this.colorSpaceLabel.textContent = info;
  }

  /**
   * Get current float precision
   */
  getFloatPrecision(): 3 | 6 {
    return this.floatPrecision;
  }

  /**
   * Set float precision for display (3 or 6 decimal places)
   */
  setFloatPrecision(precision: 3 | 6): void {
    this.floatPrecision = precision;
    this.state.floatPrecision = precision;
    this.updatePrecisionButton();
    this.updateDisplay();
    this.emit('stateChanged', { ...this.state });
  }

  private updatePrecisionButton(): void {
    if (!this.precisionButton) return;

    const isHighPrecision = this.floatPrecision === 6;
    this.precisionButton.textContent = isHighPrecision ? 'P6' : 'P3';
    this.precisionButton.setAttribute('aria-pressed', isHighPrecision ? 'true' : 'false');
    this.precisionButton.title = isHighPrecision
      ? 'High precision (6 decimals). Click to switch to 3 decimals.'
      : 'Standard precision (3 decimals). Click to switch to 6 decimals.';

    if (isHighPrecision) {
      this.precisionButton.style.background = 'var(--accent-primary)';
      this.precisionButton.style.borderColor = 'var(--accent-primary)';
      this.precisionButton.style.color = 'var(--text-on-accent)';
    } else {
      this.precisionButton.style.background = 'var(--bg-secondary)';
      this.precisionButton.style.borderColor = 'var(--border-secondary)';
      this.precisionButton.style.color = 'var(--text-secondary)';
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
    this.overlayInteractionActive = false;
  }

  /**
   * Position the overlay near cursor
   */
  setOverlayPosition(clientX: number, clientY: number): void {
    if (!this.state.enabled) return;

    if (this.overlayInteractionActive) return;

    const overlayRect = this.overlay.getBoundingClientRect();

    if (overlayRect.width > 0 && overlayRect.height > 0) {
      const withinInteractionZone =
        clientX >= overlayRect.left - OVERLAY_INTERACTION_MARGIN &&
        clientX <= overlayRect.right + OVERLAY_INTERACTION_MARGIN &&
        clientY >= overlayRect.top - OVERLAY_INTERACTION_MARGIN &&
        clientY <= overlayRect.bottom + OVERLAY_INTERACTION_MARGIN;
      if (withinInteractionZone) {
        return;
      }
    }

    let x = clientX + OVERLAY_CURSOR_PADDING;
    let y = clientY + OVERLAY_CURSOR_PADDING;

    // Keep within viewport
    if (x + overlayRect.width > window.innerWidth) {
      x = clientX - overlayRect.width - OVERLAY_CURSOR_PADDING;
    }
    if (y + overlayRect.height > window.innerHeight) {
      y = clientY - overlayRect.height - OVERLAY_CURSOR_PADDING;
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
    this.sampleSizeButtons.clear();
    this.sourceModeButtons.clear();
    this.valueRows.clear();
  }
}
