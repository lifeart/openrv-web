/**
 * Zebra Stripes Component
 *
 * Animated diagonal stripes overlay for exposure warning.
 * - High zebras: areas above threshold (default 95 IRE) - red/pink right-leaning stripes
 * - Low zebras: areas below threshold (default 5 IRE) - blue left-leaning stripes
 *
 * Stripes animate diagonally for easy identification of clipping areas.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface ZebraState {
  enabled: boolean;
  highEnabled: boolean;        // Enable highlight clipping zebras
  lowEnabled: boolean;         // Enable shadow clipping zebras
  highThreshold: number;       // 0-100 IRE (default 95)
  lowThreshold: number;        // 0-100 IRE (default 5)
}

export const DEFAULT_ZEBRA_STATE: ZebraState = {
  enabled: false,
  highEnabled: true,
  lowEnabled: false,
  highThreshold: 95,
  lowThreshold: 5,
};

export interface ZebraStripesEvents extends EventMap {
  stateChanged: ZebraState;
}

export class ZebraStripes extends EventEmitter<ZebraStripesEvents> {
  private state: ZebraState = { ...DEFAULT_ZEBRA_STATE };
  private animationTime = 0;
  private animationFrame: number | null = null;

  constructor() {
    super();
  }

  /**
   * Get current state
   */
  getState(): ZebraState {
    return { ...this.state };
  }

  /**
   * Set state
   */
  setState(state: Partial<ZebraState>): void {
    this.state = { ...this.state, ...state };
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Check if zebras are enabled
   */
  isEnabled(): boolean {
    return this.state.enabled && (this.state.highEnabled || this.state.lowEnabled);
  }

  /**
   * Toggle zebras on/off
   */
  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  /**
   * Enable zebras
   */
  enable(): void {
    this.setState({ enabled: true });
  }

  /**
   * Disable zebras
   */
  disable(): void {
    this.setState({ enabled: false });
  }

  /**
   * Set high threshold (0-100 IRE)
   */
  setHighThreshold(value: number): void {
    this.setState({ highThreshold: Math.max(0, Math.min(100, value)) });
  }

  /**
   * Set low threshold (0-100 IRE)
   */
  setLowThreshold(value: number): void {
    this.setState({ lowThreshold: Math.max(0, Math.min(100, value)) });
  }

  /**
   * Toggle high zebras
   */
  toggleHigh(): void {
    this.setState({ highEnabled: !this.state.highEnabled });
  }

  /**
   * Toggle low zebras
   */
  toggleLow(): void {
    this.setState({ lowEnabled: !this.state.lowEnabled });
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.state = { ...DEFAULT_ZEBRA_STATE };
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Start animation loop for stripe movement
   */
  startAnimation(callback: () => void): void {
    if (this.animationFrame !== null) return;

    const animate = () => {
      this.animationTime = (Date.now() / 50) % 1000; // Smooth animation
      callback();
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Stop animation loop
   */
  stopAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Apply zebra stripes to ImageData.
   * This should be called as the LAST effect before rendering (after false color check).
   *
   * @param imageData - The image data to apply zebras to (in-place modification)
   */
  apply(imageData: ImageData): void {
    if (!this.isEnabled()) return;

    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const time = this.animationTime;

    // Convert thresholds from IRE (0-100) to 8-bit (0-255)
    const highThresh = (this.state.highThreshold / 100) * 255;
    const lowThresh = (this.state.lowThreshold / 100) * 255;

    // Stripe parameters
    const stripeWidth = 6;   // Width of each stripe in pixels
    const stripeGap = 6;     // Gap between stripes
    const period = stripeWidth + stripeGap;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;

        // Calculate luminance (Rec. 709)
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        let showZebra = false;
        let zebraColor: [number, number, number] = [255, 0, 0];
        let stripeDirection = 1; // 1 for right-leaning (high), -1 for left-leaning (low)

        // Check high zebras (overexposure)
        if (this.state.highEnabled && luma >= highThresh) {
          showZebra = true;
          zebraColor = [255, 100, 100]; // Pink/red for highlights
          stripeDirection = 1; // Right-leaning stripes (\\\)
        }
        // Check low zebras (underexposure)
        else if (this.state.lowEnabled && luma <= lowThresh) {
          showZebra = true;
          zebraColor = [100, 100, 255]; // Blue for shadows
          stripeDirection = -1; // Left-leaning stripes (///)
        }

        if (showZebra) {
          // Calculate stripe pattern with animation
          // Diagonal stripes: use (x + y) for right-leaning, (x - y) for left-leaning
          const diag = stripeDirection > 0 ? (x + y) : (x - y);
          const animatedPos = (diag + time) % period;

          // Check if we're in the stripe (not the gap)
          if (animatedPos < stripeWidth) {
            // Apply zebra color with semi-transparency
            // Blend with original color (50% opacity)
            data[i] = Math.round((r + zebraColor[0]) / 2);
            data[i + 1] = Math.round((g + zebraColor[1]) / 2);
            data[i + 2] = Math.round((b + zebraColor[2]) / 2);
          }
        }
      }
    }
  }

  /**
   * Create dropdown menu element for zebra controls
   */
  createDropdownContent(onUpdate: () => void): HTMLElement {
    const container = document.createElement('div');
    container.className = 'zebra-dropdown-content';
    container.style.cssText = `
      padding: 8px 0;
      min-width: 200px;
    `;

    // High zebras section
    const highSection = this.createSection('Highlights', this.state.highEnabled, (enabled) => {
      this.setState({ highEnabled: enabled });
      onUpdate();
    });
    container.appendChild(highSection);

    // High threshold slider
    const highThresholdRow = this.createSliderRow('Threshold', this.state.highThreshold, 50, 100, '%', (value) => {
      this.setHighThreshold(value);
      onUpdate();
    });
    container.appendChild(highThresholdRow);

    // Separator
    const separator = document.createElement('div');
    separator.style.cssText = 'height: 1px; background: var(--border-primary); margin: 8px 12px;';
    container.appendChild(separator);

    // Low zebras section
    const lowSection = this.createSection('Shadows', this.state.lowEnabled, (enabled) => {
      this.setState({ lowEnabled: enabled });
      onUpdate();
    });
    container.appendChild(lowSection);

    // Low threshold slider
    const lowThresholdRow = this.createSliderRow('Threshold', this.state.lowThreshold, 0, 50, '%', (value) => {
      this.setLowThreshold(value);
      onUpdate();
    });
    container.appendChild(lowThresholdRow);

    return container;
  }

  private createSection(label: string, enabled: boolean, onChange: (enabled: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-primary); font-size: 12px; font-weight: 500;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabled;
    checkbox.style.cssText = 'cursor: pointer; accent-color: var(--accent-primary);';
    checkbox.addEventListener('change', () => onChange(checkbox.checked));

    row.appendChild(labelEl);
    row.appendChild(checkbox);
    return row;
  }

  private createSliderRow(
    label: string,
    value: number,
    min: number,
    max: number,
    unit: string,
    onChange: (value: number) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      padding: 4px 12px;
      gap: 8px;
    `;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 11px; width: 60px; flex-shrink: 0;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(value);
    slider.style.cssText = 'flex: 1; height: 4px; cursor: pointer; accent-color: var(--accent-primary);';

    const valueEl = document.createElement('span');
    valueEl.textContent = `${value}${unit}`;
    valueEl.style.cssText = 'color: var(--text-secondary); font-size: 11px; width: 40px; text-align: right; font-family: monospace;';

    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      valueEl.textContent = `${v}${unit}`;
      onChange(v);
    });

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(valueEl);
    return row;
  }

  dispose(): void {
    this.stopAnimation();
  }
}
