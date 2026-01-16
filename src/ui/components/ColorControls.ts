import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { LUT3D, parseCubeLUT } from '../../color/LUTLoader';
import { showAlert } from './shared/Modal';
import { getIconSvg } from './shared/Icons';

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
  lutLoaded: LUT3D | null;
  lutIntensityChanged: number;
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

  // LUT state
  private currentLUT: LUT3D | null = null;
  private lutIntensity = 1.0;
  private lutNameLabel: HTMLSpanElement | null = null;
  private lutIntensitySlider: HTMLInputElement | null = null;

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
    this.toggleButton.innerHTML = `${getIconSvg('palette', 'sm')}<span style="margin-left: 6px;">Color</span>`;
    this.toggleButton.title = 'Toggle color adjustments panel';
    this.toggleButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #999;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    `;
    this.toggleButton.addEventListener('click', () => this.toggle());
    this.toggleButton.addEventListener('mouseenter', () => {
      if (!this.isExpanded) {
        this.toggleButton.style.background = '#3a3a3a';
        this.toggleButton.style.borderColor = '#4a4a4a';
        this.toggleButton.style.color = '#ccc';
      }
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.isExpanded) {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.borderColor = 'transparent';
        this.toggleButton.style.color = '#999';
      }
    });
    this.container.appendChild(this.toggleButton);

    // Create expandable panel (rendered at body level)
    this.panel = document.createElement('div');
    this.panel.className = 'color-controls-panel';
    this.panel.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      min-width: 280px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createSliders();
    // Panel will be appended to body when shown

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isExpanded && !this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
        this.hide();
      }
    });
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

    // Add LUT section
    this.createLUTSection();
  }

  private createLUTSection(): void {
    // Separator
    const separator = document.createElement('div');
    separator.style.cssText = `
      height: 1px;
      background: #444;
      margin: 12px 0;
    `;
    this.panel.appendChild(separator);

    // LUT header
    const lutHeader = document.createElement('div');
    lutHeader.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    const lutTitle = document.createElement('span');
    lutTitle.textContent = 'LUT';
    lutTitle.style.cssText = 'font-weight: 600; color: #eee; font-size: 12px;';

    // LUT load button
    const lutLoadBtn = document.createElement('button');
    lutLoadBtn.textContent = 'Load .cube';
    lutLoadBtn.title = 'Load a .cube LUT file';
    lutLoadBtn.style.cssText = `
      background: #555;
      border: 1px solid #666;
      color: #ccc;
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.cube';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => this.handleLUTFile(e));

    lutLoadBtn.addEventListener('click', () => fileInput.click());
    lutLoadBtn.addEventListener('mouseenter', () => { lutLoadBtn.style.background = '#666'; });
    lutLoadBtn.addEventListener('mouseleave', () => { lutLoadBtn.style.background = '#555'; });

    lutHeader.appendChild(lutTitle);
    lutHeader.appendChild(lutLoadBtn);
    lutHeader.appendChild(fileInput);
    this.panel.appendChild(lutHeader);

    // LUT name display
    const lutNameRow = document.createElement('div');
    lutNameRow.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    `;

    const lutLabel = document.createElement('label');
    lutLabel.textContent = 'Active:';
    lutLabel.style.cssText = `
      color: #888;
      font-size: 11px;
      width: 50px;
    `;

    this.lutNameLabel = document.createElement('span');
    this.lutNameLabel.textContent = 'None';
    this.lutNameLabel.style.cssText = `
      color: #aaa;
      font-size: 11px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    // Clear LUT button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '✕';
    clearBtn.title = 'Remove LUT';
    clearBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #888;
      padding: 2px 6px;
      cursor: pointer;
      font-size: 12px;
      visibility: hidden;
    `;
    clearBtn.addEventListener('click', () => this.clearLUT());

    lutNameRow.appendChild(lutLabel);
    lutNameRow.appendChild(this.lutNameLabel);
    lutNameRow.appendChild(clearBtn);
    this.panel.appendChild(lutNameRow);

    // Store reference to clear button for visibility toggle
    (this.lutNameLabel as HTMLElement & { clearBtn?: HTMLButtonElement }).clearBtn = clearBtn;

    // LUT intensity slider
    const intensityRow = document.createElement('div');
    intensityRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const intensityLabel = document.createElement('label');
    intensityLabel.textContent = 'Intensity';
    intensityLabel.style.cssText = `
      color: #bbb;
      font-size: 12px;
      width: 80px;
      flex-shrink: 0;
    `;

    this.lutIntensitySlider = document.createElement('input');
    this.lutIntensitySlider.type = 'range';
    this.lutIntensitySlider.min = '0';
    this.lutIntensitySlider.max = '1';
    this.lutIntensitySlider.step = '0.01';
    this.lutIntensitySlider.value = '1';
    this.lutIntensitySlider.style.cssText = `
      flex: 1;
      height: 4px;
      cursor: pointer;
      accent-color: #4a9eff;
    `;

    const intensityValue = document.createElement('span');
    intensityValue.textContent = '100%';
    intensityValue.style.cssText = `
      color: #888;
      font-size: 11px;
      width: 50px;
      text-align: right;
      font-family: monospace;
    `;

    this.lutIntensitySlider.addEventListener('input', () => {
      this.lutIntensity = parseFloat(this.lutIntensitySlider!.value);
      intensityValue.textContent = `${Math.round(this.lutIntensity * 100)}%`;
      this.emit('lutIntensityChanged', this.lutIntensity);
    });

    intensityRow.appendChild(intensityLabel);
    intensityRow.appendChild(this.lutIntensitySlider);
    intensityRow.appendChild(intensityValue);
    this.panel.appendChild(intensityRow);
  }

  private async handleLUTFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const lut = parseCubeLUT(content);
      this.setLUT(lut);
    } catch (err) {
      console.error('Failed to load LUT:', err);
      showAlert(`Failed to load LUT: ${err instanceof Error ? err.message : err}`, { type: 'error', title: 'LUT Error' });
    }

    // Reset input
    input.value = '';
  }

  setLUT(lut: LUT3D | null): void {
    this.currentLUT = lut;

    if (this.lutNameLabel) {
      this.lutNameLabel.textContent = lut ? lut.title : 'None';
      const clearBtn = (this.lutNameLabel as HTMLElement & { clearBtn?: HTMLButtonElement }).clearBtn;
      if (clearBtn) {
        clearBtn.style.visibility = lut ? 'visible' : 'hidden';
      }
    }

    this.emit('lutLoaded', lut);
  }

  clearLUT(): void {
    this.setLUT(null);
  }

  getLUT(): LUT3D | null {
    return this.currentLUT;
  }

  getLUTIntensity(): number {
    return this.lutIntensity;
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
    if (this.isExpanded) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (this.isExpanded) return;

    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Position relative to button
    const rect = this.toggleButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;

    this.isExpanded = true;
    this.panel.style.display = 'block';
    this.toggleButton.style.background = 'rgba(74, 158, 255, 0.15)';
    this.toggleButton.style.borderColor = '#4a9eff';
    this.toggleButton.style.color = '#4a9eff';
    this.emit('visibilityChanged', true);
  }

  hide(): void {
    if (!this.isExpanded) return;

    this.isExpanded = false;
    this.panel.style.display = 'none';
    this.toggleButton.style.background = 'transparent';
    this.toggleButton.style.borderColor = 'transparent';
    this.toggleButton.style.color = '#999';
    this.emit('visibilityChanged', false);
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
