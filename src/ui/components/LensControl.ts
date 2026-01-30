import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { LensDistortionParams, DEFAULT_LENS_PARAMS, isDefaultLensParams } from '../../transform/LensDistortion';
import { getIconSvg } from './shared/Icons';

export interface LensControlEvents extends EventMap {
  lensChanged: LensDistortionParams;
}

export class LensControl extends EventEmitter<LensControlEvents> {
  private container: HTMLElement;
  private lensButton: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private params: LensDistortionParams = { ...DEFAULT_LENS_PARAMS };

  private sliders: Map<string, HTMLInputElement> = new Map();
  private valueLabels: Map<string, HTMLSpanElement> = new Map();

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'lens-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      margin-left: 8px;
    `;

    // Create lens button
    this.lensButton = document.createElement('button');
    this.lensButton.innerHTML = `${getIconSvg('aperture', 'sm')}<span style="margin-left: 6px;">Lens</span>`;
    this.lensButton.title = 'Lens distortion correction';
    this.lensButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    `;

    this.lensButton.addEventListener('click', () => this.togglePanel());
    this.lensButton.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen) {
        this.lensButton.style.background = 'var(--bg-hover)';
        this.lensButton.style.borderColor = 'var(--border-primary)';
        this.lensButton.style.color = 'var(--text-primary)';
      }
    });
    this.lensButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen && isDefaultLensParams(this.params)) {
        this.lensButton.style.background = 'transparent';
        this.lensButton.style.borderColor = 'transparent';
        this.lensButton.style.color = 'var(--text-muted)';
      }
    });

    // Create panel (rendered at body level)
    this.panel = document.createElement('div');
    this.panel.className = 'lens-panel';
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 250px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createPanelContent();

    this.container.appendChild(this.lensButton);
    // Panel will be appended to body when shown

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (this.isPanelOpen && !this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
        this.hidePanel();
      }
    });
  }

  private createPanelContent(): void {
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const title = document.createElement('span');
    title.textContent = 'Lens Correction';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      background: var(--border-secondary);
      border: none;
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    resetBtn.addEventListener('click', () => this.reset());
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'var(--text-muted)'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'var(--border-secondary)'; });

    header.appendChild(title);
    header.appendChild(resetBtn);
    this.panel.appendChild(header);

    // Distortion section
    const distortionLabel = document.createElement('div');
    distortionLabel.textContent = 'Radial Distortion';
    distortionLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    `;
    this.panel.appendChild(distortionLabel);

    // K1 slider (primary distortion)
    this.createSlider('k1', 'Barrel/Pincushion', -0.5, 0.5, 0.01, 0, (v) => {
      this.params.k1 = v;
      this.emitChange();
    });

    // K2 slider (secondary distortion)
    this.createSlider('k2', 'Fine Adjust', -0.5, 0.5, 0.01, 0, (v) => {
      this.params.k2 = v;
      this.emitChange();
    });

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'height: 1px; background: var(--border-primary); margin: 12px 0;';
    this.panel.appendChild(sep);

    // Center section
    const centerLabel = document.createElement('div');
    centerLabel.textContent = 'Center Offset';
    centerLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    `;
    this.panel.appendChild(centerLabel);

    // Center X
    this.createSlider('centerX', 'Horizontal', -0.25, 0.25, 0.01, 0, (v) => {
      this.params.centerX = v;
      this.emitChange();
    });

    // Center Y
    this.createSlider('centerY', 'Vertical', -0.25, 0.25, 0.01, 0, (v) => {
      this.params.centerY = v;
      this.emitChange();
    });

    // Scale slider
    const sep2 = document.createElement('div');
    sep2.style.cssText = 'height: 1px; background: var(--border-primary); margin: 12px 0;';
    this.panel.appendChild(sep2);

    this.createSlider('scale', 'Scale', 0.5, 1.5, 0.01, 1, (v) => {
      this.params.scale = v;
      this.emitChange();
    });

    // Presets section
    const sep3 = document.createElement('div');
    sep3.style.cssText = 'height: 1px; background: var(--border-primary); margin: 12px 0;';
    this.panel.appendChild(sep3);

    const presetsRow = document.createElement('div');
    presetsRow.style.cssText = 'display: flex; gap: 4px;';

    const presets: Array<{ label: string; k1: number; k2: number }> = [
      { label: 'Barrel -', k1: -0.2, k2: 0 },
      { label: 'None', k1: 0, k2: 0 },
      { label: 'Pincush +', k1: 0.2, k2: 0 },
    ];

    for (const preset of presets) {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.style.cssText = `
        flex: 1;
        background: var(--border-primary);
        border: 1px solid var(--border-secondary);
        color: var(--text-secondary);
        padding: 4px 6px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
      `;
      btn.addEventListener('click', () => {
        this.params.k1 = preset.k1;
        this.params.k2 = preset.k2;
        this.updateSliderValue('k1', preset.k1);
        this.updateSliderValue('k2', preset.k2);
        this.emitChange();
      });
      btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--border-secondary)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--border-primary)'; });
      presetsRow.appendChild(btn);
    }

    this.panel.appendChild(presetsRow);
  }

  private createSlider(
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    defaultValue: number,
    onChange: (value: number) => void
  ): void {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 10px;';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 11px;';

    const valueEl = document.createElement('span');
    valueEl.textContent = defaultValue.toFixed(2);
    valueEl.style.cssText = 'color: var(--text-secondary); font-size: 10px;';

    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(defaultValue);
    slider.style.cssText = `
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      background: var(--border-primary);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;

    this.sliders.set(key, slider);
    this.valueLabels.set(key, valueEl);

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueEl.textContent = value.toFixed(2);
      onChange(value);
    });

    // Double-click to reset
    slider.addEventListener('dblclick', () => {
      slider.value = String(defaultValue);
      valueEl.textContent = defaultValue.toFixed(2);
      onChange(defaultValue);
    });

    row.appendChild(labelRow);
    row.appendChild(slider);
    this.panel.appendChild(row);
  }

  private updateSliderValue(key: string, value: number): void {
    const slider = this.sliders.get(key);
    const valueEl = this.valueLabels.get(key);
    if (slider) slider.value = String(value);
    if (valueEl) valueEl.textContent = value.toFixed(2);
  }

  private emitChange(): void {
    this.emit('lensChanged', { ...this.params });
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const isActive = !isDefaultLensParams(this.params);
    if (isActive || this.isPanelOpen) {
      this.lensButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.lensButton.style.borderColor = 'var(--accent-primary)';
      this.lensButton.style.color = 'var(--accent-primary)';
    } else {
      this.lensButton.style.background = 'transparent';
      this.lensButton.style.borderColor = 'transparent';
      this.lensButton.style.color = 'var(--text-muted)';
    }
  }

  togglePanel(): void {
    if (this.isPanelOpen) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  showPanel(): void {
    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Position relative to button
    const rect = this.lensButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 270)}px`;

    this.isPanelOpen = true;
    this.panel.style.display = 'block';
    this.updateButtonState();
  }

  hidePanel(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.updateButtonState();
  }

  reset(): void {
    this.params = { ...DEFAULT_LENS_PARAMS };

    for (const [key, defaultVal] of Object.entries(DEFAULT_LENS_PARAMS)) {
      this.updateSliderValue(key, defaultVal as number);
    }

    this.emitChange();
  }

  getParams(): LensDistortionParams {
    return { ...this.params };
  }

  setParams(params: LensDistortionParams): void {
    this.params = { ...params };
    for (const [key, value] of Object.entries(params)) {
      this.updateSliderValue(key, value as number);
    }
    this.emitChange();
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
