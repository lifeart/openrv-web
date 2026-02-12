/**
 * FalseColorControl - Dropdown control for false color display
 *
 * Features:
 * - Toggle button with dropdown
 * - Preset selector (Standard, ARRI, RED)
 * - Color legend display
 */

import { FalseColor, FalseColorPreset } from './FalseColor';
import { getIconSvg } from './shared/Icons';
import { getThemeManager } from '../../utils/ui/ThemeManager';

export class FalseColorControl {
  private container: HTMLElement;
  private dropdown: HTMLElement;
  private falseColor: FalseColor;
  private isDropdownOpen = false;
  private toggleButton: HTMLButtonElement;
  private presetButtons: Map<FalseColorPreset, HTMLButtonElement> = new Map();
  private boundHandleReposition: () => void;
  private boundOnThemeChange: (() => void) | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor(falseColor: FalseColor) {
    this.falseColor = falseColor;
    this.boundHandleReposition = () => this.positionDropdown();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'false-color-control';
    this.container.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'false-color-toggle';
    this.toggleButton.dataset.testid = 'false-color-control-button';
    this.toggleButton.innerHTML = `${getIconSvg('contrast', 'sm')} <span>False</span> ${getIconSvg('chevron-down', 'sm')}`;
    this.toggleButton.title = 'False color exposure display (Shift+Alt+F)';
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
      if (!this.falseColor.isEnabled()) {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });

    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.falseColor.isEnabled()) {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);

    // Create dropdown panel
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'false-color-dropdown';
    this.dropdown.dataset.testid = 'false-color-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 8px;
      min-width: 200px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.createDropdownContent();
    this.container.appendChild(this.dropdown);

    // Close dropdown on outside click
    document.addEventListener('click', this.handleOutsideClick);

    // Listen for state changes
    this.unsubscribers.push(this.falseColor.on('stateChanged', () => {
      this.updateButtonState();
      this.updatePresetButtons();
      this.updateLegend();
    }));

    // Listen for theme changes
    this.boundOnThemeChange = () => {
      this.updateLegend();
    };
    getThemeManager().on('themeChanged', this.boundOnThemeChange);
  }

  private createDropdownContent(): void {
    // Enable/disable toggle
    const enableRow = document.createElement('div');
    enableRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      margin-bottom: 8px;
      background: var(--bg-hover);
      border-radius: 4px;
    `;

    const enableLabel = document.createElement('span');
    enableLabel.textContent = 'Enable False Color';
    enableLabel.style.cssText = 'color: var(--text-primary); font-size: 11px;';

    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = this.falseColor.isEnabled();
    enableCheckbox.style.cssText = 'cursor: pointer;';
    enableCheckbox.addEventListener('change', () => {
      this.falseColor.toggle();
    });

    // Update checkbox when state changes
    this.unsubscribers.push(this.falseColor.on('stateChanged', (state) => {
      enableCheckbox.checked = state.enabled;
    }));

    enableRow.appendChild(enableLabel);
    enableRow.appendChild(enableCheckbox);
    this.dropdown.appendChild(enableRow);

    // Preset selector section
    const presetSection = document.createElement('div');
    presetSection.style.cssText = `
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const presetLabel = document.createElement('div');
    presetLabel.textContent = 'Preset';
    presetLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 6px;
    `;
    presetSection.appendChild(presetLabel);

    const presetRow = document.createElement('div');
    presetRow.style.cssText = `
      display: flex;
      gap: 4px;
    `;

    const presets = this.falseColor.getPresets();
    for (const preset of presets) {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.dataset.preset = preset.key;
      btn.style.cssText = `
        flex: 1;
        padding: 5px 8px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 10px;
        cursor: pointer;
        transition: all 0.1s ease;
      `;

      btn.addEventListener('click', () => {
        this.falseColor.setPreset(preset.key);
      });

      btn.addEventListener('mouseenter', () => {
        if (this.falseColor.getState().preset !== preset.key) {
          btn.style.background = 'var(--border-primary)';
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (this.falseColor.getState().preset !== preset.key) {
          btn.style.background = 'var(--bg-secondary)';
        }
      });

      this.presetButtons.set(preset.key, btn);
      presetRow.appendChild(btn);
    }

    presetSection.appendChild(presetRow);
    this.dropdown.appendChild(presetSection);

    // Legend section
    const legendSection = document.createElement('div');
    legendSection.className = 'false-color-legend';

    const legendLabel = document.createElement('div');
    legendLabel.textContent = 'Legend';
    legendLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 6px;
    `;
    legendSection.appendChild(legendLabel);

    const legendContainer = document.createElement('div');
    legendContainer.className = 'legend-items';
    legendContainer.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3px;
      font-size: 9px;
    `;
    legendSection.appendChild(legendContainer);
    this.dropdown.appendChild(legendSection);

    // Initial update
    this.updatePresetButtons();
    this.updateLegend();
  }

  private updateButtonState(): void {
    const enabled = this.falseColor.isEnabled();
    if (enabled) {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  private updatePresetButtons(): void {
    const currentPreset = this.falseColor.getState().preset;
    for (const [key, btn] of this.presetButtons) {
      if (key === currentPreset) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-secondary)';
        btn.style.color = 'var(--text-secondary)';
      }
    }
  }

  private updateLegend(): void {
    const legendContainer = this.dropdown.querySelector('.legend-items') as HTMLElement;
    if (!legendContainer) return;

    legendContainer.innerHTML = '';
    const legend = this.falseColor.getLegend();

    for (const item of legend) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 0;
      `;

      const swatch = document.createElement('div');
      swatch.style.cssText = `
        width: 12px;
        height: 12px;
        border-radius: 2px;
        background: ${item.color};
        border: 1px solid var(--border-primary);
        flex-shrink: 0;
      `;

      const label = document.createElement('span');
      label.textContent = item.label;
      label.style.cssText = `
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;

      row.appendChild(swatch);
      row.appendChild(label);
      legendContainer.appendChild(row);
    }
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
   * Get the false color instance
   */
  getFalseColor(): FalseColor {
    return this.falseColor;
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
    this.presetButtons.clear();
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
      this.boundOnThemeChange = null;
    }
  }
}
