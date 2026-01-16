import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface FilterSettings {
  blur: number;      // 0-20 pixels
  sharpen: number;   // 0-100 amount
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  blur: 0,
  sharpen: 0,
};

export interface FilterControlEvents extends EventMap {
  filtersChanged: FilterSettings;
}

export class FilterControl extends EventEmitter<FilterControlEvents> {
  private container: HTMLElement;
  private filterButton: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private settings: FilterSettings = { ...DEFAULT_FILTER_SETTINGS };

  private blurSlider: HTMLInputElement | null = null;
  private sharpenSlider: HTMLInputElement | null = null;

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'filter-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      margin-left: 8px;
    `;

    // Create filter button
    this.filterButton = document.createElement('button');
    this.filterButton.textContent = '✨ Filters';
    this.filterButton.title = 'Filter effects (G)';
    this.filterButton.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    `;

    this.filterButton.addEventListener('click', () => this.toggle());
    this.filterButton.addEventListener('mouseenter', () => {
      this.filterButton.style.background = '#555';
    });
    this.filterButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen) {
        this.filterButton.style.background = '#444';
      }
    });

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'filter-panel';
    this.panel.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      min-width: 220px;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      margin-top: 4px;
    `;

    this.createPanelContent();

    this.container.appendChild(this.filterButton);
    this.container.appendChild(this.panel);

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.hide();
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
      border-bottom: 1px solid #444;
    `;

    const title = document.createElement('span');
    title.textContent = 'Filter Effects';
    title.style.cssText = 'color: #ddd; font-size: 13px; font-weight: 500;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      background: #555;
      border: none;
      color: #aaa;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    resetBtn.addEventListener('click', () => this.reset());
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.background = '#666';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.background = '#555';
    });

    header.appendChild(title);
    header.appendChild(resetBtn);
    this.panel.appendChild(header);

    // Blur slider
    this.blurSlider = this.createSlider('Blur', 0, 20, 0.5, this.settings.blur, (value) => {
      this.settings.blur = value;
      this.emitChange();
    });

    // Sharpen slider
    this.sharpenSlider = this.createSlider('Sharpen', 0, 100, 1, this.settings.sharpen, (value) => {
      this.settings.sharpen = value;
      this.emitChange();
    });
  }

  private createSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    initialValue: number,
    onChange: (value: number) => void
  ): HTMLInputElement {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 12px;';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: #aaa; font-size: 12px;';

    const valueEl = document.createElement('span');
    valueEl.textContent = String(initialValue);
    valueEl.style.cssText = 'color: #888; font-size: 11px;';

    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initialValue);
    slider.style.cssText = `
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      background: #444;
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;

    // Style the slider thumb
    const styleId = 'filter-slider-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .filter-panel input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: #4a9eff;
          border-radius: 50%;
          cursor: pointer;
        }
        .filter-panel input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: #4a9eff;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `;
      document.head.appendChild(style);
    }

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueEl.textContent = label === 'Blur' ? `${value}px` : String(value);
      onChange(value);
    });

    // Double-click to reset
    slider.addEventListener('dblclick', () => {
      slider.value = '0';
      valueEl.textContent = label === 'Blur' ? '0px' : '0';
      onChange(0);
    });

    row.appendChild(labelRow);
    row.appendChild(slider);
    this.panel.appendChild(row);

    return slider;
  }

  private emitChange(): void {
    this.emit('filtersChanged', { ...this.settings });
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const hasFilters = this.settings.blur > 0 || this.settings.sharpen > 0;
    this.filterButton.style.borderColor = hasFilters ? '#4a9eff' : '#555';
    this.filterButton.style.color = hasFilters ? '#4a9eff' : '#ddd';
  }

  toggle(): void {
    if (this.isPanelOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    this.isPanelOpen = true;
    this.panel.style.display = 'block';
    this.filterButton.style.background = '#555';
  }

  hide(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.filterButton.style.background = '#444';
  }

  reset(): void {
    this.settings = { ...DEFAULT_FILTER_SETTINGS };

    if (this.blurSlider) {
      this.blurSlider.value = '0';
      const valueEl = this.blurSlider.parentElement?.querySelector('span:last-child');
      if (valueEl) valueEl.textContent = '0px';
    }

    if (this.sharpenSlider) {
      this.sharpenSlider.value = '0';
      const valueEl = this.sharpenSlider.parentElement?.querySelector('span:last-child');
      if (valueEl) valueEl.textContent = '0';
    }

    this.emitChange();
  }

  getSettings(): FilterSettings {
    return { ...this.settings };
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
