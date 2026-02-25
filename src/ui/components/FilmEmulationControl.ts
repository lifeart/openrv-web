import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { PANEL_WIDTHS, SHADOWS } from './shared/theme';
import type { FilmEmulationParams, FilmStockId } from '../../filters/FilmEmulation';
import { DEFAULT_FILM_EMULATION_PARAMS, FILM_STOCKS } from '../../filters/FilmEmulation';

export { DEFAULT_FILM_EMULATION_PARAMS };
export type { FilmEmulationParams };

export interface FilmEmulationControlEvents extends EventMap {
  filmEmulationChanged: FilmEmulationParams;
}

export class FilmEmulationControl extends EventEmitter<FilmEmulationControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private params: FilmEmulationParams = { ...DEFAULT_FILM_EMULATION_PARAMS };

  private enabledCheckbox: HTMLInputElement | null = null;
  private stockSelect: HTMLSelectElement | null = null;
  private intensitySlider: HTMLInputElement | null = null;
  private grainSlider: HTMLInputElement | null = null;
  private intensityValueLabel: HTMLSpanElement | null = null;
  private grainValueLabel: HTMLSpanElement | null = null;

  private boundHandleDocumentClick: (e: MouseEvent) => void;
  private readonly boundHandleKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'film-emulation-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create button
    this.button = document.createElement('button');
    this.button.innerHTML = `${getIconSvg('film', 'sm')}<span style="margin-left: 6px;">Film</span>`;
    this.button.dataset.testid = 'film-emulation-control-button';
    this.button.title = 'Film stock emulation';
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
    this.button.addEventListener('pointerenter', () => {
      if (!this.isPanelOpen) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('pointerleave', () => {
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
    this.panel.className = 'film-emulation-panel';
    this.panel.dataset.testid = 'film-emulation-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Film Emulation Settings');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: ${PANEL_WIDTHS.standard};
      z-index: 9999;
      display: none;
      box-shadow: ${SHADOWS.panel};
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
    title.textContent = 'Film Emulation';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.dataset.testid = 'film-emulation-reset-button';
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
    resetBtn.addEventListener('pointerenter', () => { resetBtn.style.background = 'var(--text-muted)'; });
    resetBtn.addEventListener('pointerleave', () => { resetBtn.style.background = 'var(--border-secondary)'; });

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

    // Stock dropdown
    const stockOptions: [string, string][] = FILM_STOCKS.map(s => [s.id, s.name]);
    const stockRow = this.createSelectRow('Film Stock', stockOptions, this.params.stock, (value) => {
      this.params.stock = value as FilmStockId;
      this.updateDescriptionText();
      this.emitChange();
    });
    this.stockSelect = stockRow.select;
    this.panel.appendChild(stockRow.container);

    // Stock description
    const descEl = document.createElement('div');
    descEl.dataset.testid = 'film-emulation-stock-description';
    descEl.style.cssText = 'color: var(--text-muted); font-size: 11px; margin-bottom: 12px; font-style: italic;';
    const stock = FILM_STOCKS.find(s => s.id === this.params.stock);
    descEl.textContent = stock?.description ?? '';
    this.panel.appendChild(descEl);

    // Intensity slider
    const intensityResult = this.createSlider('Intensity', 0, 100, 1, this.params.intensity, (value) => {
      this.params.intensity = value;
      this.emitChange();
    });
    this.intensitySlider = intensityResult.slider;
    this.intensityValueLabel = intensityResult.valueLabel;

    // Grain slider
    const grainResult = this.createSlider('Grain', 0, 100, 1, this.params.grainIntensity, (value) => {
      this.params.grainIntensity = value;
      this.emitChange();
    });
    this.grainSlider = grainResult.slider;
    this.grainValueLabel = grainResult.valueLabel;
  }

  private updateDescriptionText(): void {
    const descEl = this.panel.querySelector('[data-testid="film-emulation-stock-description"]');
    if (descEl) {
      const stock = FILM_STOCKS.find(s => s.id === this.params.stock);
      descEl.textContent = stock?.description ?? '';
    }
  }

  private createCheckboxRow(label: string, initialValue: boolean, onChange: (checked: boolean) => void): { container: HTMLElement; checkbox: HTMLInputElement } {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = initialValue;
    checkbox.id = 'film-emulation-enabled-checkbox';
    checkbox.dataset.testid = 'film-emulation-enabled-checkbox';
    checkbox.style.cssText = 'cursor: pointer;';
    checkbox.addEventListener('change', () => onChange(checkbox.checked));

    const labelEl = document.createElement('label');
    labelEl.htmlFor = 'film-emulation-enabled-checkbox';
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px; cursor: pointer;';

    row.appendChild(checkbox);
    row.appendChild(labelEl);

    return { container: row, checkbox };
  }

  private createSelectRow(label: string, options: [string, string][], initialValue: string, onChange: (value: string) => void): { container: HTMLElement; select: HTMLSelectElement } {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 8px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px; margin-bottom: 4px;';

    const select = document.createElement('select');
    select.dataset.testid = `film-emulation-${label.toLowerCase().replace(/\s+/g, '-')}-select`;
    select.style.cssText = `
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;

    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if (value === initialValue) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener('change', () => onChange(select.value));

    row.appendChild(labelEl);
    row.appendChild(select);

    return { container: row, select };
  }

  private createSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    initialValue: number,
    onChange: (value: number) => void
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
    slider.dataset.testid = `film-emulation-${label.toLowerCase()}-slider`;
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
    const styleId = 'film-emulation-slider-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .film-emulation-panel input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: var(--accent-primary);
          border-radius: 50%;
          cursor: pointer;
        }
        .film-emulation-panel input[type="range"]::-moz-range-thumb {
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
      const defaultVal = label === 'Intensity' ? 100 : 30;
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
    this.emit('filmEmulationChanged', { ...this.params });
    this.updateButtonState();
  }

  private updateButtonState(): void {
    if (this.params.enabled) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else if (this.isPanelOpen) {
      this.button.style.background = 'var(--bg-hover)';
      this.button.style.borderColor = 'var(--border-primary)';
      this.button.style.color = 'var(--text-primary)';
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
    this.params = { ...DEFAULT_FILM_EMULATION_PARAMS };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = false;
    if (this.stockSelect) this.stockSelect.value = 'kodak-portra-400';
    if (this.intensitySlider) {
      this.intensitySlider.value = '100';
      if (this.intensityValueLabel) this.intensityValueLabel.textContent = '100';
    }
    if (this.grainSlider) {
      this.grainSlider.value = '30';
      if (this.grainValueLabel) this.grainValueLabel.textContent = '30';
    }
    this.updateDescriptionText();
    this.emitChange();
  }

  getParams(): FilmEmulationParams {
    return { ...this.params };
  }

  setParams(params: FilmEmulationParams): void {
    this.params = { ...params };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = params.enabled;
    if (this.stockSelect) this.stockSelect.value = params.stock;
    if (this.intensitySlider) {
      this.intensitySlider.value = String(params.intensity);
      if (this.intensityValueLabel) this.intensityValueLabel.textContent = String(params.intensity);
    }
    if (this.grainSlider) {
      this.grainSlider.value = String(params.grainIntensity);
      if (this.grainValueLabel) this.grainValueLabel.textContent = String(params.grainIntensity);
    }
    this.updateDescriptionText();
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
    const styleEl = document.getElementById('film-emulation-slider-style');
    if (styleEl) styleEl.remove();
  }
}
