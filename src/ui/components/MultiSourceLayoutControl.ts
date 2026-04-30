/**
 * MultiSourceLayoutControl - Toolbar dropdown UI for multi-source layout modes.
 *
 * Provides mode selector, source list with add/remove, spacing slider,
 * and other layout options. Similar pattern to CompareControl.
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { createSeparator, createSectionHeader, createCheckboxRow, createSliderRow } from './shared/FormElements';
import {
  type MultiSourceLayoutMode,
  type MultiSourceLayoutState,
  MAX_TILE_COUNT,
} from '../multisource/MultiSourceLayoutTypes';
import { MultiSourceLayoutManager } from '../multisource/MultiSourceLayoutManager';
import { MultiSourceLayoutStore } from '../multisource/MultiSourceLayoutStore';
import { outsideClickRegistry, type OutsideClickDeregister } from '../../utils/ui/OutsideClickRegistry';

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
  private boundHandleReposition: () => void;
  private boundHandleKeydown: (e: KeyboardEvent) => void;
  private deregisterDismiss: OutsideClickDeregister | null = null;
  private managerUnsubs: (() => void)[] = [];
  private _currentSourceIndex = 0;
  private _sourceCount = 1;

  /** Set the current/active source index used by "Add current source". */
  setCurrentSourceIndex(index: number): void {
    this._currentSourceIndex = index;
  }

  /** Get the current source index. */
  getCurrentSourceIndex(): number {
    return this._currentSourceIndex;
  }

  /** Set the total number of available sources (for the source selector dropdown). */
  setSourceCount(count: number): void {
    this._sourceCount = Math.max(1, count);
    if (this.isOpen) {
      this.refreshDropdown();
    }
  }

  /** Get the total number of available sources. */
  getSourceCount(): number {
    return this._sourceCount;
  }

  constructor(manager?: MultiSourceLayoutManager) {
    super();

    this.manager = manager ?? new MultiSourceLayoutManager(new MultiSourceLayoutStore());

    this.boundHandleReposition = () => this.positionDropdown();
    this.boundHandleKeydown = (e: KeyboardEvent) => this.handleDropdownKeydown(e);

    this.container = document.createElement('div');
    this.container.className = 'layout-control';
    this.container.dataset.testid = 'layout-control';
    this.container.style.cssText = 'display: flex; align-items: center; position: relative;';

    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'layout-control-button';
    this.button.title = 'Layout modes';
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
    this.dropdown.appendChild(createSectionHeader('Layout Mode'));

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
    this.dropdown.appendChild(createSeparator());

    // Section: Sources
    this.dropdown.appendChild(createSectionHeader(`Sources (${this.manager.getTileCount()}/${MAX_TILE_COUNT})`));

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
      this.manager.addSource(this._currentSourceIndex);
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

      // Source selector dropdown
      const sourceSelect = document.createElement('select');
      sourceSelect.dataset.testid = `layout-tile-source-select-${tile.id}`;
      sourceSelect.setAttribute('aria-label', `Source for ${tile.label}`);
      sourceSelect.style.cssText = `
        background: var(--bg-primary);
        border: 1px solid var(--border-secondary);
        color: var(--text-primary);
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 11px;
        flex: 1;
        cursor: pointer;
        outline: none;
      `;
      for (let i = 0; i < this._sourceCount; i++) {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = `Source ${i + 1}`;
        if (i === tile.sourceIndex) {
          option.selected = true;
        }
        sourceSelect.appendChild(option);
      }
      sourceSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        const newIndex = parseInt((e.target as HTMLSelectElement).value, 10);
        this.manager.setTileSourceIndex(tile.id, newIndex);
        this.refreshDropdown();
      });
      tileRow.appendChild(sourceSelect);

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
    this.dropdown.appendChild(createSeparator());

    // Section: Options
    this.dropdown.appendChild(createSectionHeader('Options'));

    // Spacing slider
    const state = this.manager.getState();
    const spacingResult = createSliderRow(
      'Spacing',
      state.spacing,
      0,
      20,
      1,
      (val) => {
        this.manager.setSpacing(val);
      },
      (val) => `Spacing: ${val}px`,
    );
    spacingResult.container.dataset.testid = 'layout-spacing-slider';
    this.dropdown.appendChild(spacingResult.container);

    // Labels checkbox
    const labelsResult = createCheckboxRow('Show Labels', state.showLabels, (checked) => {
      this.manager.getStore().setShowLabels(checked);
    });
    labelsResult.container.dataset.testid = 'layout-show-labels';
    this.dropdown.appendChild(labelsResult.container);

    // Borders checkbox
    const bordersResult = createCheckboxRow('Show Borders', state.showBorders, (checked) => {
      this.manager.getStore().setShowBorders(checked);
    });
    bordersResult.container.dataset.testid = 'layout-show-borders';
    this.dropdown.appendChild(bordersResult.container);
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
    // Outside-click + Escape dismiss owned by OutsideClickRegistry. Navigation
    // keys (Arrow/Home/End) remain in the local keydown handler.
    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [this.button, this.dropdown],
      onDismiss: () => this.closeDropdown(),
      dismissOn: 'click',
      dismissOnEscape: true,
    });
    document.addEventListener('keydown', this.boundHandleKeydown);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonLabel();
    this.deregisterDismiss?.();
    this.deregisterDismiss = null;
    document.removeEventListener('keydown', this.boundHandleKeydown);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  private positionDropdown(): void {
    if (!this.isOpen) return;
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleDropdownKeydown(e: KeyboardEvent): void {
    // Escape is owned by OutsideClickRegistry — only navigation keys here.
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const focusable = Array.from(
        this.dropdown.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]'),
      ).filter((el) => !el.hidden && (el as HTMLButtonElement).disabled !== true);
      if (focusable.length === 0) return;

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      let nextIndex: number;

      if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = focusable.length - 1;
      } else if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % focusable.length;
      } else {
        nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
      }

      focusable[nextIndex]?.focus();
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
}
