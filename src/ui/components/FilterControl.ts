import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

export type { FilterSettings } from '../../core/types/filter';
export { DEFAULT_FILTER_SETTINGS } from '../../core/types/filter';

import type { FilterSettings } from '../../core/types/filter';
import { DEFAULT_FILTER_SETTINGS } from '../../core/types/filter';

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
  private readonly boundHandleKeyDown: (e: KeyboardEvent) => void;

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
    this.filterButton.innerHTML = `${getIconSvg('sliders', 'sm')}<span style="margin-left: 6px;">Filters</span>`;
    this.filterButton.dataset.testid = 'filter-control-button';
    this.filterButton.title = 'Filter effects (Shift+Alt+E)';
    this.filterButton.setAttribute('aria-haspopup', 'dialog');
    this.filterButton.setAttribute('aria-expanded', 'false');
    this.filterButton.style.cssText = `
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

    this.filterButton.addEventListener('click', () => this.toggle());
    this.filterButton.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen) {
        this.filterButton.style.background = 'var(--bg-hover)';
        this.filterButton.style.borderColor = 'var(--border-primary)';
        this.filterButton.style.color = 'var(--text-primary)';
      }
    });
    this.filterButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen) {
        const hasFilters = this.settings.blur > 0 || this.settings.sharpen > 0;
        if (!hasFilters) {
          this.filterButton.style.background = 'transparent';
          this.filterButton.style.borderColor = 'transparent';
          this.filterButton.style.color = 'var(--text-muted)';
        }
      }
    });

    // Create panel (rendered at body level)
    this.panel = document.createElement('div');
    this.panel.className = 'filter-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Filter Settings');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 220px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createPanelContent();

    this.container.appendChild(this.filterButton);
    // Panel will be appended to body when shown

    // Close on outside click
    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.boundHandleDocumentClick);

    // Close on Escape key
    this.boundHandleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isPanelOpen) {
        this.hide();
      }
    };
  }

  private boundHandleDocumentClick: (e: MouseEvent) => void;

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
    title.textContent = 'Filter Effects';
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
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.background = 'var(--text-muted)';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.background = 'var(--border-secondary)';
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
    const styleId = 'filter-slider-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .filter-panel input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: var(--accent-primary);
          border-radius: 50%;
          cursor: pointer;
        }
        .filter-panel input[type="range"]::-moz-range-thumb {
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
    if (hasFilters || this.isPanelOpen) {
      this.filterButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.filterButton.style.borderColor = 'var(--accent-primary)';
      this.filterButton.style.color = 'var(--accent-primary)';
    } else {
      this.filterButton.style.background = 'transparent';
      this.filterButton.style.borderColor = 'transparent';
      this.filterButton.style.color = 'var(--text-muted)';
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
    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Position relative to button
    const rect = this.filterButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 240)}px`;

    this.isPanelOpen = true;
    this.panel.style.display = 'block';
    this.filterButton.setAttribute('aria-expanded', 'true');
    this.updateButtonState();
    document.addEventListener('keydown', this.boundHandleKeyDown);

    // Move focus to the first interactive element in the panel
    this.blurSlider?.focus();
  }

  hide(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.filterButton.setAttribute('aria-expanded', 'false');
    this.updateButtonState();
    document.removeEventListener('keydown', this.boundHandleKeyDown);

    // Return focus to the toggle button
    this.filterButton.focus();
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

  get isOpen(): boolean {
    return this.isPanelOpen;
  }

  setSettings(settings: FilterSettings): void {
    this.settings = { ...settings };

    if (this.blurSlider) {
      this.blurSlider.value = String(this.settings.blur);
      const valueEl = this.blurSlider.parentElement?.querySelector('span:last-child');
      if (valueEl) valueEl.textContent = `${this.settings.blur}px`;
    }

    if (this.sharpenSlider) {
      this.sharpenSlider.value = String(this.settings.sharpen);
      const valueEl = this.sharpenSlider.parentElement?.querySelector('span:last-child');
      if (valueEl) valueEl.textContent = String(this.settings.sharpen);
    }

    this.emitChange();
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('click', this.boundHandleDocumentClick);
    // Remove body-mounted panel if present
    if (this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
