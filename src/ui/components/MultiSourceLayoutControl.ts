/**
 * MultiSourceLayoutControl - Toolbar dropdown UI for multi-source layout modes.
 *
 * Provides mode selector, source list with add/remove, spacing slider,
 * and other layout options. Similar pattern to CompareControl.
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import {
  type MultiSourceLayoutMode,
  type MultiSourceLayoutState,
  MAX_TILE_COUNT,
} from '../multisource/MultiSourceLayoutTypes';
import { MultiSourceLayoutManager } from '../multisource/MultiSourceLayoutManager';
import { MultiSourceLayoutStore } from '../multisource/MultiSourceLayoutStore';

export interface MultiSourceLayoutControlEvents extends EventMap {
  layoutChanged: MultiSourceLayoutState;
  modeChanged: MultiSourceLayoutMode;
  enabledChanged: boolean;
}

const MODE_LABELS: Record<MultiSourceLayoutMode, string> = {
  packed: 'Packed (Auto Grid)',
  row: 'Row',
  column: 'Column',
  manual: 'Manual',
  static: 'Static',
};

export class MultiSourceLayoutControl extends EventEmitter<MultiSourceLayoutControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private manager: MultiSourceLayoutManager;
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;
  private managerUnsubs: (() => void)[] = [];

  constructor(manager?: MultiSourceLayoutManager) {
    super();

    this.manager = manager ?? new MultiSourceLayoutManager(new MultiSourceLayoutStore());

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    this.container = document.createElement('div');
    this.container.className = 'layout-control';
    this.container.dataset.testid = 'layout-control';
    this.container.style.cssText = 'display: flex; align-items: center; position: relative;';

    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'layout-control-button';
    this.button.title = 'Layout modes (L)';
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
      min-width: 80px;
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isOpen) this.closeDropdown();
      else this.openDropdown();
    });

    this.button.addEventListener('pointerenter', () => {
      if (!this.isOpen) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('pointerleave', () => {
      if (!this.isOpen && !this.manager.enabled) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });
    applyA11yFocus(this.button);

    this.container.appendChild(this.button);

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.dataset.testid = 'layout-control-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 8px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      gap: 6px;
      min-width: 200px;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.buildDropdownContent();
    this.wireManagerEvents();
  }

  /** Get the underlying layout manager. */
  getManager(): MultiSourceLayoutManager {
    return this.manager;
  }

  /** Render the control. */
  render(): HTMLElement {
    return this.container;
  }

  /** Dispose the control. */
  dispose(): void {
    this.closeDropdown();
    for (const unsub of this.managerUnsubs) {
      unsub();
    }
    this.managerUnsubs = [];
    this.removeAllListeners();
    if (this.dropdown.parentElement) {
      this.dropdown.parentElement.removeChild(this.dropdown);
    }
  }

  private buildDropdownContent(): void {
    this.dropdown.innerHTML = '';

    // Section: Layout Mode
    const modeHeader = this.createSectionHeader('Layout Mode');
    this.dropdown.appendChild(modeHeader);

    // Off option
    const offOption = this.createModeOption('Off', !this.manager.enabled, () => {
      this.manager.disable();
      this.refreshDropdown();
    });
    offOption.dataset.testid = 'layout-mode-off';
    this.dropdown.appendChild(offOption);

    // Mode options
    const modes: MultiSourceLayoutMode[] = ['packed', 'row', 'column', 'manual', 'static'];
    for (const mode of modes) {
      const isActive = this.manager.enabled && this.manager.getMode() === mode;
      const option = this.createModeOption(MODE_LABELS[mode], isActive, () => {
        this.manager.enable(mode);
        this.refreshDropdown();
      });
      option.dataset.testid = `layout-mode-${mode}`;
      this.dropdown.appendChild(option);
    }

    // Divider
    this.dropdown.appendChild(this.createDivider());

    // Section: Sources
    const sourcesHeader = this.createSectionHeader(`Sources (${this.manager.getTileCount()}/${MAX_TILE_COUNT})`);
    this.dropdown.appendChild(sourcesHeader);

    // Add source button
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.dataset.testid = 'layout-add-source';
    addBtn.textContent = '+ Add current source';
    addBtn.style.cssText = `
      background: transparent;
      border: 1px dashed var(--border-secondary);
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      width: 100%;
      text-align: left;
    `;
    addBtn.disabled = this.manager.getTileCount() >= MAX_TILE_COUNT;
    addBtn.addEventListener('click', () => {
      // Add a new tile referencing source 0 (default active source).
      // The user can then change the source assignment in the tile row.
      this.manager.addSource(0);
      this.refreshDropdown();
    });
    this.dropdown.appendChild(addBtn);

    // Tile list
    const tiles = this.manager.getTiles();
    for (const tile of tiles) {
      const tileRow = document.createElement('div');
      tileRow.dataset.testid = `layout-tile-${tile.id}`;
      tileRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 11px;
        color: var(--text-primary);
        ${tile.active ? 'background: rgba(var(--accent-primary-rgb), 0.15);' : ''}
      `;

      const label = document.createElement('span');
      label.textContent = tile.label;
      label.style.flex = '1';
      tileRow.appendChild(label);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.innerHTML = getIconSvg('x', 'sm');
      removeBtn.title = `Remove ${tile.label}`;
      removeBtn.style.cssText = `
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
      `;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.removeSource(tile.id);
        this.refreshDropdown();
      });
      tileRow.appendChild(removeBtn);

      this.dropdown.appendChild(tileRow);
    }

    // Divider
    this.dropdown.appendChild(this.createDivider());

    // Section: Options
    const optionsHeader = this.createSectionHeader('Options');
    this.dropdown.appendChild(optionsHeader);

    // Spacing slider
    const state = this.manager.getState();
    const spacingRow = this.createSliderRow('Spacing', state.spacing, 0, 20, 1, (val) => {
      this.manager.setSpacing(val);
    });
    spacingRow.dataset.testid = 'layout-spacing-slider';
    this.dropdown.appendChild(spacingRow);

    // Labels checkbox
    const labelsRow = this.createCheckboxRow('Show Labels', state.showLabels, (checked) => {
      this.manager.getStore().setShowLabels(checked);
    });
    labelsRow.dataset.testid = 'layout-show-labels';
    this.dropdown.appendChild(labelsRow);

    // Borders checkbox
    const bordersRow = this.createCheckboxRow('Show Borders', state.showBorders, (checked) => {
      this.manager.getStore().setShowBorders(checked);
    });
    bordersRow.dataset.testid = 'layout-show-borders';
    this.dropdown.appendChild(bordersRow);
  }

  private refreshDropdown(): void {
    this.buildDropdownContent();
    this.updateButtonLabel();
  }

  private updateButtonLabel(): void {
    const enabled = this.manager.enabled;
    const mode = this.manager.getMode();
    const label = enabled ? `Layout: ${MODE_LABELS[mode]}` : 'Layout';
    this.button.innerHTML = `${getIconSvg('grid', 'sm')}<span style="margin-left: 4px;">${label}</span><span style="margin-left: 4px; font-size: 8px;">&#9660;</span>`;

    if (enabled) {
      this.button.style.color = 'var(--accent-primary)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.1)';
    } else if (!this.isOpen) {
      this.button.style.color = 'var(--text-muted)';
      this.button.style.borderColor = 'transparent';
      this.button.style.background = 'transparent';
    }
  }

  private openDropdown(): void {
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }
    this.isOpen = true;
    this.refreshDropdown();
    this.positionDropdown();
    this.dropdown.style.display = 'flex';
    this.button.setAttribute('aria-expanded', 'true');
    this.button.style.background = 'var(--bg-hover)';
    this.button.style.borderColor = 'var(--border-primary)';
    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonLabel();
    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  private positionDropdown(): void {
    if (!this.isOpen) return;
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (!this.button.contains(e.target as Node) && !this.dropdown.contains(e.target as Node)) {
      this.closeDropdown();
    }
  }

  private wireManagerEvents(): void {
    this.managerUnsubs.push(
      this.manager.on('layoutChanged', (state) => {
        this.emit('layoutChanged', state);
        this.updateButtonLabel();
      }),
      this.manager.on('enabledChanged', (enabled) => {
        this.emit('enabledChanged', enabled);
        this.updateButtonLabel();
      }),
      this.manager.on('modeChanged', (mode) => {
        this.emit('modeChanged', mode);
        this.updateButtonLabel();
      }),
    );
  }

  private createSectionHeader(text: string): HTMLElement {
    const header = document.createElement('div');
    header.textContent = text;
    header.style.cssText = `
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 4px;
    `;
    return header;
  }

  private createModeOption(label: string, isActive: boolean, onClick: () => void): HTMLElement {
    const option = document.createElement('button');
    option.type = 'button';
    option.style.cssText = `
      background: ${isActive ? 'rgba(var(--accent-primary-rgb), 0.2)' : 'transparent'};
      border: none;
      color: ${isActive ? 'var(--accent-primary)' : 'var(--text-primary)'};
      padding: 4px 8px;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      border-radius: 3px;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    const radio = document.createElement('span');
    radio.textContent = isActive ? '\u25C9' : '\u25CB';
    radio.style.fontSize = '10px';
    option.appendChild(radio);

    const text = document.createElement('span');
    text.textContent = label;
    option.appendChild(text);

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    option.addEventListener('pointerenter', () => {
      if (!isActive) option.style.background = 'var(--bg-hover)';
    });
    option.addEventListener('pointerleave', () => {
      if (!isActive) option.style.background = 'transparent';
    });

    return option;
  }

  private createDivider(): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: 4px 0;
    `;
    return div;
  }

  private createSliderRow(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (val: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 2px 4px;';

    const lbl = document.createElement('span');
    lbl.textContent = `${label}: ${value}px`;
    lbl.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 80px;';
    row.appendChild(lbl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = 'flex: 1; cursor: pointer;';
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      lbl.textContent = `${label}: ${val}px`;
      onChange(val);
    });
    row.appendChild(slider);

    return row;
  }

  private createCheckboxRow(
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ): HTMLElement {
    const row = document.createElement('label');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; font-size: 11px; color: var(--text-secondary);';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.addEventListener('change', () => onChange(checkbox.checked));
    row.appendChild(checkbox);

    const text = document.createElement('span');
    text.textContent = label;
    row.appendChild(text);

    return row;
  }
}
