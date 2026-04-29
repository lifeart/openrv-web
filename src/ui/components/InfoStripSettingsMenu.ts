/**
 * Info Strip Settings Context Menu
 *
 * A context menu for configuring InfoStripOverlay display mode and background opacity.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
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

    menu.appendChild(this.createSectionHeader('Display'));

    const basenameItem = this.createCheckableItem('Basename', !state.showFullPath, () => {
      this.overlay.setShowFullPath(false);
      this.updateRadioGroup(menu, false);
    });
    basenameItem.dataset.mode = 'basename';
    menu.appendChild(basenameItem);

    const fullPathItem = this.createCheckableItem('Full Path', state.showFullPath, () => {
      this.overlay.setShowFullPath(true);
      this.updateRadioGroup(menu, true);
    });
    fullPathItem.dataset.mode = 'full-path';
    menu.appendChild(fullPathItem);

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSliderControl(state.backgroundOpacity));

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

    this.menuEl = menu;
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

  private createSectionHeader(text: string): HTMLDivElement {
    const header = document.createElement('div');
    header.setAttribute('role', 'none');
    header.textContent = text;
    header.style.cssText = `
      padding: 6px 12px 2px;
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      pointer-events: none;
    `;
    return header;
  }

  private createCheckableItem(label: string, checked: boolean, onClick: () => void): HTMLDivElement {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(checked));
    item.tabIndex = -1;
    item.style.cssText = `
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      outline: none;
      white-space: nowrap;
    `;

    const checkSpan = document.createElement('span');
    checkSpan.className = 'menu-check';
    checkSpan.textContent = checked ? '\u2713' : '';
    checkSpan.style.cssText = `
      width: 14px;
      font-size: 12px;
      text-align: center;
      flex-shrink: 0;
    `;
    item.appendChild(checkSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    item.appendChild(labelSpan);

    applyHoverEffect(item);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });

    return item;
  }

  private createSliderControl(initialValue: number): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'none');
    wrapper.style.cssText = `
      padding: 8px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: var(--text-primary);
    `;

    const label = document.createElement('span');
    label.textContent = 'Background';
    labelRow.appendChild(label);

    const value = document.createElement('span');
    value.dataset.testid = 'info-strip-bg-value';
    value.textContent = `${Math.round(initialValue * 100)}%`;
    labelRow.appendChild(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(initialValue * 100));
    slider.dataset.testid = 'info-strip-bg-slider';
    slider.style.cssText = 'width: 100%;';
    slider.addEventListener('input', () => {
      const opacity = Number.parseInt(slider.value, 10) / 100;
      this.overlay.setBackgroundOpacity(opacity);
      const appliedOpacity = this.overlay.getState().backgroundOpacity;
      slider.value = String(Math.round(appliedOpacity * 100));
      value.textContent = `${Math.round(appliedOpacity * 100)}%`;
    });

    wrapper.appendChild(labelRow);
    wrapper.appendChild(slider);
    return wrapper;
  }

  private createSeparator(): HTMLDivElement {
    const separator = document.createElement('div');
    separator.setAttribute('role', 'separator');
    separator.style.cssText = `
      height: 1px;
      margin: 4px 0;
      background: var(--border-secondary);
      opacity: 0.5;
    `;
    return separator;
  }

  private updateRadioGroup(menu: HTMLDivElement, showFullPath: boolean): void {
    const items = menu.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
    items.forEach((item) => {
      const isFullPath = item.dataset.mode === 'full-path';
      const checked = isFullPath === showFullPath;
      item.setAttribute('aria-checked', String(checked));
      const check = item.querySelector<HTMLElement>('.menu-check');
      if (check) {
        check.textContent = checked ? '\u2713' : '';
      }
    });
  }

}
