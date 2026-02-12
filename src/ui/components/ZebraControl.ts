/**
 * ZebraControl - Dropdown control for zebra stripes exposure warnings
 *
 * Features:
 * - Toggle button with dropdown
 * - Enable/disable checkboxes for high and low zebras
 * - Threshold sliders for fine-tuning
 */

import { ZebraStripes } from './ZebraStripes';
import { getIconSvg } from './shared/Icons';

export class ZebraControl {
  private container: HTMLElement;
  private dropdown: HTMLElement;
  private zebraStripes: ZebraStripes;
  private isDropdownOpen = false;
  private toggleButton: HTMLButtonElement;
  private boundHandleReposition: () => void;
  private highCheckbox!: HTMLInputElement;
  private lowCheckbox!: HTMLInputElement;
  private highSlider!: HTMLInputElement;
  private lowSlider!: HTMLInputElement;
  private highValueLabel!: HTMLSpanElement;
  private lowValueLabel!: HTMLSpanElement;
  private unsubscribers: (() => void)[] = [];

  constructor(zebraStripes: ZebraStripes) {
    this.zebraStripes = zebraStripes;
    this.boundHandleReposition = () => this.positionDropdown();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'zebra-control';
    this.container.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'zebra-toggle';
    this.toggleButton.dataset.testid = 'zebra-control-button';
    this.toggleButton.innerHTML = `${getIconSvg('stripes', 'sm')} <span>Zebra</span> ${getIconSvg('chevron-down', 'sm')}`;
    this.toggleButton.title = 'Zebra stripes exposure warnings (Shift+Alt+Z)';
    this.toggleButton.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.12s ease;
    `;

    this.toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.toggleButton.addEventListener('mouseenter', () => {
      if (!this.zebraStripes.isEnabled()) {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });

    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.zebraStripes.isEnabled()) {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);

    // Create dropdown panel
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'zebra-dropdown';
    this.dropdown.dataset.testid = 'zebra-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 8px;
      min-width: 220px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.createDropdownContent();
    this.container.appendChild(this.dropdown);

    // Close dropdown on outside click
    document.addEventListener('click', this.handleOutsideClick);

    // Listen for state changes
    this.unsubscribers.push(this.zebraStripes.on('stateChanged', () => {
      this.updateButtonState();
      this.updateControlsState();
    }));
  }

  private createDropdownContent(): void {
    // High Zebras section
    const highSection = this.createZebraSection(
      'High Zebras',
      'Highlight overexposed areas (>95% luminance)',
      true,
      95,
      70,
      100,
      (enabled) => this.zebraStripes.setState({ highEnabled: enabled, enabled: true }),
      (threshold) => this.zebraStripes.setHighThreshold(threshold)
    );
    this.dropdown.appendChild(highSection.container);
    this.highCheckbox = highSection.checkbox;
    this.highSlider = highSection.slider;
    this.highValueLabel = highSection.valueLabel;

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: 10px 0;
    `;
    this.dropdown.appendChild(divider);

    // Low Zebras section
    const lowSection = this.createZebraSection(
      'Low Zebras',
      'Highlight underexposed areas (<5% luminance)',
      false,
      5,
      0,
      30,
      (enabled) => this.zebraStripes.setState({ lowEnabled: enabled, enabled: true }),
      (threshold) => this.zebraStripes.setLowThreshold(threshold)
    );
    this.dropdown.appendChild(lowSection.container);
    this.lowCheckbox = lowSection.checkbox;
    this.lowSlider = lowSection.slider;
    this.lowValueLabel = lowSection.valueLabel;

    // Initial state
    this.updateControlsState();
  }

  private createZebraSection(
    label: string,
    description: string,
    defaultEnabled: boolean,
    defaultThreshold: number,
    min: number,
    max: number,
    onEnableChange: (enabled: boolean) => void,
    onThresholdChange: (threshold: number) => void
  ): {
    container: HTMLElement;
    checkbox: HTMLInputElement;
    slider: HTMLInputElement;
    valueLabel: HTMLSpanElement;
  } {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 4px;';

    // Header row with checkbox and label
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    `;

    const labelContainer = document.createElement('div');
    labelContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = defaultEnabled;
    checkbox.style.cssText = 'cursor: pointer; accent-color: var(--accent-primary);';
    checkbox.addEventListener('change', () => {
      onEnableChange(checkbox.checked);
    });

    const labelText = document.createElement('span');
    labelText.textContent = label;
    labelText.style.cssText = 'color: var(--text-primary); font-size: 11px; font-weight: 500;';

    labelContainer.appendChild(checkbox);
    labelContainer.appendChild(labelText);

    // Color indicator
    const colorIndicator = document.createElement('div');
    const isHigh = label.includes('High');
    colorIndicator.style.cssText = `
      width: 16px;
      height: 12px;
      border-radius: 2px;
      background: repeating-linear-gradient(
        ${isHigh ? '45deg' : '-45deg'},
        ${isHigh ? 'rgba(255, 100, 100, 0.8)' : 'rgba(100, 100, 255, 0.8)'} 0px,
        ${isHigh ? 'rgba(255, 100, 100, 0.8)' : 'rgba(100, 100, 255, 0.8)'} 2px,
        transparent 2px,
        transparent 4px
      );
      border: 1px solid ${isHigh ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 100, 255, 0.5)'};
    `;

    headerRow.appendChild(labelContainer);
    headerRow.appendChild(colorIndicator);
    container.appendChild(headerRow);

    // Description
    const descText = document.createElement('div');
    descText.textContent = description;
    descText.style.cssText = `
      color: var(--text-muted);
      font-size: 9px;
      margin-bottom: 8px;
      margin-left: 20px;
    `;
    container.appendChild(descText);

    // Threshold slider row
    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 20px;
    `;

    const sliderLabel = document.createElement('span');
    sliderLabel.textContent = 'Threshold:';
    sliderLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px; min-width: 55px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(defaultThreshold);
    slider.style.cssText = `
      flex: 1;
      height: 4px;
      accent-color: var(--accent-primary);
      cursor: pointer;
    `;
    slider.addEventListener('input', () => {
      const value = parseInt(slider.value, 10);
      onThresholdChange(value);
      valueLabel.textContent = `${value}%`;
    });

    const valueLabel = document.createElement('span');
    valueLabel.textContent = `${defaultThreshold}%`;
    valueLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px; min-width: 30px; text-align: right;';

    sliderRow.appendChild(sliderLabel);
    sliderRow.appendChild(slider);
    sliderRow.appendChild(valueLabel);
    container.appendChild(sliderRow);

    return { container, checkbox, slider, valueLabel };
  }

  private updateButtonState(): void {
    const state = this.zebraStripes.getState();
    const active = state.enabled && (state.highEnabled || state.lowEnabled);
    if (active) {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  private updateControlsState(): void {
    const state = this.zebraStripes.getState();
    this.highCheckbox.checked = state.highEnabled;
    this.lowCheckbox.checked = state.lowEnabled;
    this.highSlider.value = String(state.highThreshold);
    this.lowSlider.value = String(state.lowThreshold);
    this.highValueLabel.textContent = `${state.highThreshold}%`;
    this.lowValueLabel.textContent = `${state.lowThreshold}%`;
  }

  private toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) {
      this.dropdown.style.display = 'block';
      this.positionDropdown();
      window.addEventListener('resize', this.boundHandleReposition);
      window.addEventListener('scroll', this.boundHandleReposition, true);
    } else {
      this.dropdown.style.display = 'none';
      window.removeEventListener('resize', this.boundHandleReposition);
      window.removeEventListener('scroll', this.boundHandleReposition, true);
    }
  }

  private positionDropdown(): void {
    const rect = this.toggleButton.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.container.contains(e.target as Node)) {
      if (this.isDropdownOpen) {
        this.isDropdownOpen = false;
        this.dropdown.style.display = 'none';
        window.removeEventListener('resize', this.boundHandleReposition);
        window.removeEventListener('scroll', this.boundHandleReposition, true);
      }
    }
  };

  /**
   * Get the zebra stripes instance
   */
  getZebraStripes(): ZebraStripes {
    return this.zebraStripes;
  }

  /**
   * Render the control
   */
  render(): HTMLElement {
    return this.container;
  }

  /**
   * Dispose
   */
  dispose(): void {
    document.removeEventListener('click', this.handleOutsideClick);
    window.removeEventListener('resize', this.boundHandleReposition);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}
