import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import type { StabilizationParams } from '../../filters/StabilizeMotion';
import { DEFAULT_STABILIZATION_PARAMS } from '../../filters/StabilizeMotion';

export { DEFAULT_STABILIZATION_PARAMS };
export type { StabilizationParams };

export interface StabilizationControlEvents extends EventMap {
  stabilizationChanged: StabilizationParams;
}

export class StabilizationControl extends EventEmitter<StabilizationControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private params: StabilizationParams = { ...DEFAULT_STABILIZATION_PARAMS };

  private enabledCheckbox: HTMLInputElement | null = null;
  private smoothingSlider: HTMLInputElement | null = null;
  private cropSlider: HTMLInputElement | null = null;
  private smoothingValueLabel: HTMLSpanElement | null = null;
  private cropValueLabel: HTMLSpanElement | null = null;

  private boundHandleDocumentClick: (e: MouseEvent) => void;
  private readonly boundHandleKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'stabilization-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create button
    this.button = document.createElement('button');
    this.button.innerHTML = `${getIconSvg('crosshair', 'sm')}<span style="margin-left: 6px;">Stabilize</span>`;
    this.button.dataset.testid = 'stabilization-control-button';
    this.button.title = 'Stabilization preview';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.style.cssText = `
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

    this.button.addEventListener('click', () => this.toggle());
    this.button.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen) {
        if (!this.params.enabled) {
          this.button.style.background = 'transparent';
          this.button.style.borderColor = 'transparent';
          this.button.style.color = 'var(--text-muted)';
        }
      }
    });

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'stabilization-panel';
    this.panel.dataset.testid = 'stabilization-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Stabilization Settings');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 260px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createPanelContent();
    this.container.appendChild(this.button);

    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.boundHandleDocumentClick);

    // Close on Escape key
    this.boundHandleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isPanelOpen) {
        this.hide();
      }
    };
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (this.isPanelOpen && !this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
      this.hide();
    }
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
    title.textContent = 'Stabilization';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.dataset.testid = 'stabilization-reset-button';
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

    // Enabled checkbox
    const enabledRow = this.createCheckboxRow('Enabled', this.params.enabled, (checked) => {
      this.params.enabled = checked;
      this.emitChange();
    });
    this.enabledCheckbox = enabledRow.checkbox;
    this.panel.appendChild(enabledRow.container);

    // Smoothing Strength slider
    const smoothingResult = this.createSlider('Smoothing Strength', 0, 100, 1, this.params.smoothingStrength, (value) => {
      this.params.smoothingStrength = value;
      this.emitChange();
    }, 'stabilization-smoothing-slider');
    this.smoothingSlider = smoothingResult.slider;
    this.smoothingValueLabel = smoothingResult.valueLabel;

    // Crop Amount slider
    const cropResult = this.createSlider('Crop Amount', 0, 64, 1, this.params.cropAmount, (value) => {
      this.params.cropAmount = value;
      this.emitChange();
    }, 'stabilization-crop-slider');
    this.cropSlider = cropResult.slider;
    this.cropValueLabel = cropResult.valueLabel;
  }

  private createCheckboxRow(label: string, initialValue: boolean, onChange: (checked: boolean) => void): { container: HTMLElement; checkbox: HTMLInputElement } {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = initialValue;
    checkbox.id = 'stabilization-enabled-checkbox';
    checkbox.dataset.testid = 'stabilization-enabled-checkbox';
    checkbox.style.cssText = 'cursor: pointer;';
    checkbox.addEventListener('change', () => onChange(checkbox.checked));

    const labelEl = document.createElement('label');
    labelEl.htmlFor = 'stabilization-enabled-checkbox';
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px; cursor: pointer;';

    row.appendChild(checkbox);
    row.appendChild(labelEl);

    return { container: row, checkbox };
  }

  private createSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    initialValue: number,
    onChange: (value: number) => void,
    testId: string,
  ): { slider: HTMLInputElement; valueLabel: HTMLSpanElement } {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 12px;';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 4px;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px;';

    const valueEl = document.createElement('span');
    valueEl.textContent = String(initialValue);
    valueEl.style.cssText = 'color: var(--text-secondary); font-size: 11px;';

    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initialValue);
    slider.dataset.testid = testId;
    slider.style.cssText = `
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      background: var(--border-primary);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;

    // Style the slider thumb
    const styleId = 'stabilization-slider-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .stabilization-panel input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: var(--accent-primary);
          border-radius: 50%;
          cursor: pointer;
        }
        .stabilization-panel input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: var(--accent-primary);
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `;
      document.head.appendChild(style);
    }

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueEl.textContent = String(value);
      onChange(value);
    });

    slider.addEventListener('dblclick', () => {
      const defaultVal = label === 'Smoothing Strength'
        ? DEFAULT_STABILIZATION_PARAMS.smoothingStrength
        : DEFAULT_STABILIZATION_PARAMS.cropAmount;
      slider.value = String(defaultVal);
      valueEl.textContent = String(defaultVal);
      onChange(defaultVal);
    });

    row.appendChild(labelRow);
    row.appendChild(slider);
    this.panel.appendChild(row);

    return { slider, valueLabel: valueEl };
  }

  private emitChange(): void {
    this.emit('stabilizationChanged', { ...this.params });
    this.updateButtonState();
  }

  private updateButtonState(): void {
    if (this.params.enabled || this.isPanelOpen) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  toggle(): void {
    if (this.isPanelOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }
    const rect = this.button.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 280)}px`;
    this.isPanelOpen = true;
    this.panel.style.display = 'block';
    this.button.setAttribute('aria-expanded', 'true');
    this.updateButtonState();
    document.addEventListener('keydown', this.boundHandleKeyDown);

    // Move focus to the first interactive element in the panel
    this.enabledCheckbox?.focus();
  }

  hide(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonState();
    document.removeEventListener('keydown', this.boundHandleKeyDown);

    // Return focus to the toggle button
    this.button.focus();
  }

  reset(): void {
    this.params = { ...DEFAULT_STABILIZATION_PARAMS };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = DEFAULT_STABILIZATION_PARAMS.enabled;
    if (this.smoothingSlider) {
      this.smoothingSlider.value = String(DEFAULT_STABILIZATION_PARAMS.smoothingStrength);
      if (this.smoothingValueLabel) this.smoothingValueLabel.textContent = String(DEFAULT_STABILIZATION_PARAMS.smoothingStrength);
    }
    if (this.cropSlider) {
      this.cropSlider.value = String(DEFAULT_STABILIZATION_PARAMS.cropAmount);
      if (this.cropValueLabel) this.cropValueLabel.textContent = String(DEFAULT_STABILIZATION_PARAMS.cropAmount);
    }
    this.emitChange();
  }

  getParams(): StabilizationParams {
    return { ...this.params };
  }

  setParams(params: StabilizationParams): void {
    this.params = { ...params };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = params.enabled;
    if (this.smoothingSlider) {
      this.smoothingSlider.value = String(params.smoothingStrength);
      if (this.smoothingValueLabel) this.smoothingValueLabel.textContent = String(params.smoothingStrength);
    }
    if (this.cropSlider) {
      this.cropSlider.value = String(params.cropAmount);
      if (this.cropValueLabel) this.cropValueLabel.textContent = String(params.cropAmount);
    }
    this.emitChange();
  }

  get isOpen(): boolean {
    return this.isPanelOpen;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('click', this.boundHandleDocumentClick);
    if (this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    const styleEl = document.getElementById('stabilization-slider-style');
    if (styleEl) styleEl.remove();
  }
}
