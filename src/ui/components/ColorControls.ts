import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface ColorAdjustments {
  exposure: number;      // -5 to +5 stops
  gamma: number;         // 0.1 to 4.0
  saturation: number;    // 0 to 2 (1 = normal)
  contrast: number;      // 0 to 2 (1 = normal)
  temperature: number;   // -100 to +100 (kelvin shift)
  tint: number;          // -100 to +100 (green/magenta)
  brightness: number;    // -1 to +1
}

export const DEFAULT_COLOR_ADJUSTMENTS: ColorAdjustments = {
  exposure: 0,
  gamma: 1,
  saturation: 1,
  contrast: 1,
  temperature: 0,
  tint: 0,
  brightness: 0,
};

export interface ColorControlsEvents extends EventMap {
  adjustmentsChanged: ColorAdjustments;
  visibilityChanged: boolean;
}

export class ColorControls extends EventEmitter<ColorControlsEvents> {
  private container: HTMLElement;
  private panel: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private isExpanded = false;

  private adjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

  // Slider elements for updating values
  private sliders: Map<keyof ColorAdjustments, HTMLInputElement> = new Map();
  private valueLabels: Map<keyof ColorAdjustments, HTMLSpanElement> = new Map();

  constructor() {
    super();

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'color-controls-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.textContent = '🎨 Color';
    this.toggleButton.title = 'Toggle color adjustments panel';
    this.toggleButton.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    this.toggleButton.addEventListener('click', () => this.toggle());
    this.toggleButton.addEventListener('mouseenter', () => {
      this.toggleButton.style.background = '#555';
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.isExpanded) {
        this.toggleButton.style.background = '#444';
      }
    });
    this.container.appendChild(this.toggleButton);

    // Create expandable panel
    this.panel = document.createElement('div');
    this.panel.className = 'color-controls-panel';
    this.panel.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      min-width: 280px;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      margin-top: 4px;
    `;

    this.createSliders();
    this.container.appendChild(this.panel);
  }

  private createSliders(): void {
    const sliderConfigs: Array<{
      key: keyof ColorAdjustments;
      label: string;
      min: number;
      max: number;
      step: number;
      format: (v: number) => string;
    }> = [
      { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
      { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.01, format: (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%` },
      { key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
      { key: 'gamma', label: 'Gamma', min: 0.1, max: 4, step: 0.01, format: (v) => v.toFixed(2) },
      { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
      { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
    ];

    // Header with reset button
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #444;
    `;

    const title = document.createElement('span');
    title.textContent = 'Color Adjustments';
    title.style.cssText = 'font-weight: 600; color: #eee; font-size: 13px;';

    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    resetButton.title = 'Reset all adjustments';
    resetButton.style.cssText = `
      background: #555;
      border: 1px solid #666;
      color: #ccc;
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    resetButton.addEventListener('click', () => this.reset());
    resetButton.addEventListener('mouseenter', () => { resetButton.style.background = '#666'; });
    resetButton.addEventListener('mouseleave', () => { resetButton.style.background = '#555'; });

    header.appendChild(title);
    header.appendChild(resetButton);
    this.panel.appendChild(header);

    // Create sliders
    for (const config of sliderConfigs) {
      const row = this.createSliderRow(config);
      this.panel.appendChild(row);
    }
  }

  private createSliderRow(config: {
    key: keyof ColorAdjustments;
    label: string;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
  }): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    `;

    // Label
    const label = document.createElement('label');
    label.textContent = config.label;
    label.style.cssText = `
      color: #bbb;
      font-size: 12px;
      width: 80px;
      flex-shrink: 0;
    `;

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(config.min);
    slider.max = String(config.max);
    slider.step = String(config.step);
    slider.value = String(this.adjustments[config.key]);
    slider.style.cssText = `
      flex: 1;
      height: 4px;
      cursor: pointer;
      accent-color: #4a9eff;
    `;

    // Value display
    const valueLabel = document.createElement('span');
    valueLabel.textContent = config.format(this.adjustments[config.key]);
    valueLabel.style.cssText = `
      color: #888;
      font-size: 11px;
      width: 50px;
      text-align: right;
      font-family: monospace;
    `;

    // Store references
    this.sliders.set(config.key, slider);
    this.valueLabels.set(config.key, valueLabel);

    // Event handling
    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      this.adjustments[config.key] = value;
      valueLabel.textContent = config.format(value);
      this.emit('adjustmentsChanged', { ...this.adjustments });
    });

    // Double-click to reset individual slider
    slider.addEventListener('dblclick', () => {
      const defaultValue = DEFAULT_COLOR_ADJUSTMENTS[config.key];
      slider.value = String(defaultValue);
      this.adjustments[config.key] = defaultValue;
      valueLabel.textContent = config.format(defaultValue);
      this.emit('adjustmentsChanged', { ...this.adjustments });
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valueLabel);

    return row;
  }

  toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.panel.style.display = this.isExpanded ? 'block' : 'none';
    this.toggleButton.style.background = this.isExpanded ? '#555' : '#444';
    this.toggleButton.style.borderColor = this.isExpanded ? '#4a9eff' : '#555';
    this.emit('visibilityChanged', this.isExpanded);
  }

  show(): void {
    if (!this.isExpanded) {
      this.toggle();
    }
  }

  hide(): void {
    if (this.isExpanded) {
      this.toggle();
    }
  }

  reset(): void {
    this.adjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

    // Update all sliders and labels
    for (const [key, slider] of this.sliders) {
      slider.value = String(this.adjustments[key]);
    }

    const formats: Record<keyof ColorAdjustments, (v: number) => string> = {
      exposure: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
      brightness: (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
      contrast: (v) => `${(v * 100).toFixed(0)}%`,
      gamma: (v) => v.toFixed(2),
      saturation: (v) => `${(v * 100).toFixed(0)}%`,
      temperature: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      tint: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
    };

    for (const [key, label] of this.valueLabels) {
      label.textContent = formats[key](this.adjustments[key]);
    }

    this.emit('adjustmentsChanged', { ...this.adjustments });
  }

  getAdjustments(): ColorAdjustments {
    return { ...this.adjustments };
  }

  setAdjustments(adjustments: Partial<ColorAdjustments>): void {
    this.adjustments = { ...this.adjustments, ...adjustments };

    // Update sliders
    for (const [key, value] of Object.entries(adjustments)) {
      const slider = this.sliders.get(key as keyof ColorAdjustments);
      if (slider) {
        slider.value = String(value);
      }
    }

    this.emit('adjustmentsChanged', { ...this.adjustments });
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.sliders.clear();
    this.valueLabels.clear();
  }
}
