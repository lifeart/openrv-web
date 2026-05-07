/**
 * Info Strip Settings Context Menu
 *
 * A context menu for configuring InfoStripOverlay display mode and background opacity.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import {
  createCheckableMenuItem,
  createSectionHeader,
  createSeparator,
  createSliderControl,
  setMenuItemChecked,
} from './shared/FormElements';
import type { InfoStripOverlay } from './InfoStripOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

export class InfoStripSettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
  private _isVisible = false;
  private overlay: InfoStripOverlay;

  constructor(overlay: InfoStripOverlay) {
    this.overlay = overlay;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'info-strip-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Info Strip settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 220px;
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.overlay.getState();

    menu.appendChild(createSectionHeader('Display', { menu: true }));

    const basenameItem = createCheckableMenuItem(
      {
        label: 'Basename',
        checked: !state.showFullPath,
        role: 'menuitemradio',
        onClick: () => {
          this.overlay.setShowFullPath(false);
          this.updateRadioGroup(menu, false);
        },
      },
      applyHoverEffect,
    );
    basenameItem.dataset.mode = 'basename';
    menu.appendChild(basenameItem);

    const fullPathItem = createCheckableMenuItem(
      {
        label: 'Full Path',
        checked: state.showFullPath,
        role: 'menuitemradio',
        onClick: () => {
          this.overlay.setShowFullPath(true);
          this.updateRadioGroup(menu, true);
        },
      },
      applyHoverEffect,
    );
    fullPathItem.dataset.mode = 'full-path';
    menu.appendChild(fullPathItem);

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Background',
        id: 'info-strip-bg',
        value: state.backgroundOpacity * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          this.overlay.setBackgroundOpacity(value / 100);
          return this.overlay.getState().backgroundOpacity * 100;
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

  private updateRadioGroup(menu: HTMLDivElement, showFullPath: boolean): void {
    const items = menu.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
    items.forEach((item) => {
      const isFullPath = item.dataset.mode === 'full-path';
      setMenuItemChecked(item, isFullPath === showFullPath);
    });
  }
}
