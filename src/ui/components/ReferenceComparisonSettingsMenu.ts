/**
 * Reference Comparison Settings Context Menu
 *
 * A context menu for configuring ReferenceManager comparison mode, overlay opacity,
 * and split wipe position.
 */

import { applyHoverEffect } from './shared/Button';
import { PANEL_WIDTHS, SHADOWS, Z_INDEX } from './shared/theme';
import {
  createCheckableMenuItem,
  createSectionHeader,
  createSeparator,
  createSliderControl,
  setMenuItemChecked,
} from './shared/FormElements';
import type { ReferenceManager, ReferenceViewMode } from './ReferenceManager';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

const MODE_LABELS: Record<ReferenceViewMode, string> = {
  'split-h': 'Split Horizontal',
  'split-v': 'Split Vertical',
  overlay: 'Overlay',
  'side-by-side': 'Side by Side',
  toggle: 'Toggle',
};

const VIEW_MODES: ReferenceViewMode[] = ['split-h', 'split-v', 'overlay', 'side-by-side', 'toggle'];

export class ReferenceComparisonSettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
  private _isVisible = false;
  private referenceManager: ReferenceManager;

  constructor(referenceManager: ReferenceManager) {
    this.referenceManager = referenceManager;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'reference-comparison-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Reference Comparison settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: ${PANEL_WIDTHS.medium};
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.referenceManager.getState();

    menu.appendChild(createSectionHeader('Mode', { menu: true }));
    for (const mode of VIEW_MODES) {
      const item = createCheckableMenuItem(
        {
          label: MODE_LABELS[mode],
          checked: state.viewMode === mode,
          role: 'menuitemradio',
          onClick: () => {
            this.referenceManager.setViewMode(mode);
            this.updateRadioGroup(menu, mode);
          },
        },
        applyHoverEffect,
      );
      item.dataset.mode = mode;
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Blend', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Opacity',
        id: 'reference-opacity',
        value: state.opacity * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          this.referenceManager.setOpacity(value / 100);
          return this.referenceManager.getOpacity() * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Wipe Position',
        id: 'reference-wipe',
        value: state.wipePosition * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          this.referenceManager.setWipePosition(value / 100);
          return this.referenceManager.getWipePosition() * 100;
        },
      }).container,
    );

    this.menuEl = menu;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;

    if (left + rect.width > vw - VIEWPORT_MARGIN) left = x - rect.width;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (top + rect.height > vh - VIEWPORT_MARGIN) top = y - rect.height;
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';

    this._isVisible = true;
    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [menu],
      onDismiss: () => this.hide(),
    });
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this._isVisible = false;
    if (this.deregisterDismiss) {
      this.deregisterDismiss();
      this.deregisterDismiss = null;
    }
  }

  isVisible(): boolean {
    return this._isVisible;
  }

  dispose(): void {
    this.hide();
  }

  private updateRadioGroup(menu: HTMLDivElement, selectedMode: ReferenceViewMode): void {
    menu.querySelectorAll<HTMLDivElement>('[data-mode]').forEach((item) => {
      setMenuItemChecked(item, item.dataset.mode === selectedMode);
    });
  }
}
