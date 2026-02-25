/**
 * PARControl - Pixel Aspect Ratio correction control.
 *
 * Provides a dropdown in the View tab for selecting PAR presets
 * (square, NTSC DV, anamorphic 2:1, etc.) and toggling PAR correction.
 * When enabled, the viewer applies horizontal scaling to display
 * non-square pixel content at correct proportions.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { SHADOWS } from './shared/theme';
import {
  PARState,
  DEFAULT_PAR_STATE,
  PAR_PRESETS,
  isPARActive,
} from '../../utils/media/PixelAspectRatio';

export interface PARControlEvents extends EventMap {
  stateChanged: PARState;
}

export class PARControl extends EventEmitter<PARControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private state: PARState = { ...DEFAULT_PAR_STATE };
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    this.container = document.createElement('div');
    this.container.className = 'par-control';
    this.container.dataset.testid = 'par-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create toggle button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'par-control-button';
    this.button.title = 'Pixel Aspect Ratio (Shift+P)';
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
      min-width: 64px;
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.button.addEventListener('pointerenter', () => {
      if (!this.isOpen && !isPARActive(this.state)) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });

    this.button.addEventListener('pointerleave', () => {
      if (!this.isOpen && !isPARActive(this.state)) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    applyA11yFocus(this.button);

    this.container.appendChild(this.button);

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.dataset.testid = 'par-control-dropdown';
    this.dropdown.style.cssText = `
      display: none;
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      z-index: 9999;
      min-width: 220px;
      padding: 6px 0;
      flex-direction: column;
    `;
    this.buildDropdown();
  }

  private buildDropdown(): void {
    this.dropdown.innerHTML = '';

    // Enable/disable toggle
    const enableRow = this.createDropdownRow('Enable PAR Correction');
    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = this.state.enabled;
    enableCheckbox.dataset.testid = 'par-enable-checkbox';
    enableCheckbox.style.cssText = 'margin-left: auto; cursor: pointer; accent-color: var(--accent-primary);';
    enableCheckbox.addEventListener('change', () => {
      this.state.enabled = enableCheckbox.checked;
      this.updateButtonStyle();
      this.updateButtonLabel();
      this.emit('stateChanged', { ...this.state });
    });
    enableRow.appendChild(enableCheckbox);
    this.dropdown.appendChild(enableRow);

    // Separator
    this.dropdown.appendChild(this.createSeparator());

    // Section header
    const sectionHeader = document.createElement('div');
    sectionHeader.style.cssText = `
      padding: 4px 12px;
      font-size: 10px;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    `;
    sectionHeader.textContent = 'Presets';
    this.dropdown.appendChild(sectionHeader);

    // Preset items
    for (const preset of PAR_PRESETS) {
      const item = this.createPresetItem(preset.label, preset.value, preset.par);
      this.dropdown.appendChild(item);
    }

    // Separator
    this.dropdown.appendChild(this.createSeparator());

    // Custom PAR input row
    const customRow = document.createElement('div');
    customRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
    `;
    const customLabel = document.createElement('span');
    customLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
    customLabel.textContent = 'Custom PAR:';
    customRow.appendChild(customLabel);

    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.dataset.testid = 'par-custom-input';
    customInput.value = this.state.par.toFixed(4);
    customInput.step = '0.01';
    customInput.min = '0.1';
    customInput.max = '4.0';
    customInput.style.cssText = `
      width: 70px;
      padding: 3px 6px;
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-size: 11px;
      font-family: var(--font-mono);
      outline: none;
      margin-left: auto;
    `;
    customInput.addEventListener('change', () => {
      const val = parseFloat(customInput.value);
      if (Number.isFinite(val) && val >= 0.1 && val <= 4.0) {
        this.state.par = val;
        this.state.preset = 'custom';
        this.updateButtonLabel();
        this.updateButtonStyle();
        this.updatePresetHighlight();
        this.emit('stateChanged', { ...this.state });
      } else {
        // Reset input to current valid PAR value on invalid input
        customInput.value = this.state.par.toFixed(4);
      }
    });
    customRow.appendChild(customInput);
    this.dropdown.appendChild(customRow);

    // Info row
    const infoRow = document.createElement('div');
    infoRow.dataset.testid = 'par-info';
    infoRow.style.cssText = `
      padding: 4px 12px 6px;
      font-size: 10px;
      color: var(--text-muted);
    `;
    infoRow.textContent = 'PAR > 1.0: horizontally stretch | PAR < 1.0: horizontally compress';
    this.dropdown.appendChild(infoRow);
  }

  private createDropdownRow(label: string): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-primary);
      cursor: pointer;
    `;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    row.appendChild(labelSpan);
    return row;
  }

  private createPresetItem(label: string, value: string, par: number): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.dataset.testid = `par-preset-${value}`;
    item.dataset.parPreset = value;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(this.state.preset === value));
    item.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.12s ease;
      width: 100%;
      border: none;
      background: transparent;
      font-family: inherit;
      outline: none;
    `;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    item.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.style.cssText = 'font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);';
    valueSpan.textContent = par.toFixed(4);
    item.appendChild(valueSpan);

    // Highlight if this is the current preset
    if (this.state.preset === value) {
      item.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      item.style.color = 'var(--accent-primary)';
    }

    item.addEventListener('pointerenter', () => {
      if (this.state.preset !== value) {
        item.style.background = 'var(--bg-hover)';
      }
    });

    item.addEventListener('pointerleave', () => {
      if (this.state.preset !== value) {
        item.style.background = 'transparent';
        item.style.color = 'var(--text-secondary)';
      }
    });

    item.addEventListener('click', () => {
      this.state.preset = value;
      this.state.par = par;
      this.state.enabled = true;
      this.updateButtonLabel();
      this.updateButtonStyle();
      this.updatePresetHighlight();
      this.updateEnableCheckbox();
      // Update custom input
      const customInput = this.dropdown.querySelector('[data-testid="par-custom-input"]') as HTMLInputElement | null;
      if (customInput) customInput.value = par.toFixed(4);
      this.emit('stateChanged', { ...this.state });
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });

    return item;
  }

  private createSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.style.cssText = `
      height: 1px;
      background: var(--border-secondary);
      margin: 4px 8px;
    `;
    return sep;
  }

  private updatePresetHighlight(): void {
    const items = this.dropdown.querySelectorAll('[data-par-preset]');
    items.forEach((el) => {
      const item = el as HTMLElement;
      const presetValue = item.dataset.parPreset;
      const isSelected = presetValue === this.state.preset;
      item.setAttribute('aria-selected', String(isSelected));
      if (isSelected) {
        item.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        item.style.color = 'var(--accent-primary)';
      } else {
        item.style.background = 'transparent';
        item.style.color = 'var(--text-secondary)';
      }
    });
  }

  private updateEnableCheckbox(): void {
    const checkbox = this.dropdown.querySelector('[data-testid="par-enable-checkbox"]') as HTMLInputElement | null;
    if (checkbox) checkbox.checked = this.state.enabled;
  }

  private updateButtonLabel(): void {
    const active = isPARActive(this.state);
    const parLabel = active ? ` ${this.state.par.toFixed(2)}` : '';
    this.button.innerHTML = `${getIconSvg('aspect-ratio', 'sm')}<span style="margin-left: 2px;">PAR${parLabel}</span><span style="font-size: 8px; margin-left: 2px;">&#9660;</span>`;
  }

  private updateButtonStyle(): void {
    const active = isPARActive(this.state);
    if (active) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  private toggleDropdown(): void {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }
    this.positionDropdown();
    this.dropdown.style.display = 'flex';
    this.isOpen = true;

    // Rebuild to reflect current state
    this.buildDropdown();

    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.dropdown.style.display = 'none';
    this.isOpen = false;
    this.updateButtonStyle();

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  private positionDropdown(): void {
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleOutsideClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!this.dropdown.contains(target) && !this.button.contains(target)) {
      this.closeDropdown();
    }
  }

  // --- Public API ---

  getState(): PARState {
    return { ...this.state };
  }

  setState(state: PARState): void {
    this.state = { ...state };
    this.updateButtonLabel();
    this.updateButtonStyle();
  }

  toggle(): void {
    this.state.enabled = !this.state.enabled;
    this.updateButtonLabel();
    this.updateButtonStyle();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Handle keyboard shortcuts.
   * @returns true if the key was handled
   */
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (shiftKey && key === 'P') {
      this.toggle();
      return true;
    }
    return false;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.closeDropdown();
    if (document.body.contains(this.dropdown)) {
      document.body.removeChild(this.dropdown);
    }
    this.container.remove();
    this.removeAllListeners();
  }
}
