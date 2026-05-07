/**
 * EXR Window Overlay Settings Context Menu
 *
 * A context menu for configuring EXRWindowOverlay visibility, colors, and outline style.
 */

import { PANEL_WIDTHS, SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import {
  createCheckableMenuItem,
  createSectionHeader,
  createSeparator,
  createSliderControl,
  setMenuItemChecked,
} from './shared/FormElements';
import type { EXRWindowOverlay } from './EXRWindowOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

export class EXRWindowOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
  private _isVisible = false;
  private overlay: EXRWindowOverlay;

  constructor(overlay: EXRWindowOverlay) {
    this.overlay = overlay;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'exr-window-overlay-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'EXR Window Overlay settings');
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

    const state = this.overlay.getState();

    menu.appendChild(createSectionHeader('Visibility', { menu: true }));

    const dataWindowItem = createCheckableMenuItem(
      {
        label: 'Show Data Window',
        checked: state.showDataWindow,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.overlay.getState().showDataWindow;
          this.overlay.setShowDataWindow(next);
          setMenuItemChecked(dataWindowItem, next);
        },
      },
      applyHoverEffect,
    );
    dataWindowItem.dataset.setting = 'show-data-window';
    menu.appendChild(dataWindowItem);

    const displayWindowItem = createCheckableMenuItem(
      {
        label: 'Show Display Window',
        checked: state.showDisplayWindow,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.overlay.getState().showDisplayWindow;
          this.overlay.setShowDisplayWindow(next);
          setMenuItemChecked(displayWindowItem, next);
        },
      },
      applyHoverEffect,
    );
    displayWindowItem.dataset.setting = 'show-display-window';
    menu.appendChild(displayWindowItem);

    const labelsItem = createCheckableMenuItem(
      {
        label: 'Show Labels',
        checked: state.showLabels,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.overlay.getState().showLabels;
          this.overlay.setShowLabels(next);
          setMenuItemChecked(labelsItem, next);
        },
      },
      applyHoverEffect,
    );
    labelsItem.dataset.setting = 'show-labels';
    menu.appendChild(labelsItem);

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Colors', { menu: true }));
    menu.appendChild(
      this.createColorControl('Data Window', 'exr-data-window-color', state.dataWindowColor, (value) => {
        this.overlay.setDataWindowColor(value);
      }),
    );
    menu.appendChild(
      this.createColorControl('Display Window', 'exr-display-window-color', state.displayWindowColor, (value) => {
        this.overlay.setDisplayWindowColor(value);
      }),
    );

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Style', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Line Width',
        id: 'exr-line-width',
        value: state.lineWidth,
        min: 1,
        max: 12,
        onInput: (value) => {
          this.overlay.setLineWidth(value);
          return this.overlay.getState().lineWidth;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Dash Length',
        id: 'exr-dash-length',
        value: state.dashPattern[0],
        min: 1,
        max: 32,
        onInput: (value) => {
          const [, gap] = this.overlay.getState().dashPattern;
          this.overlay.setDashPattern([value, gap]);
          return this.overlay.getState().dashPattern[0];
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Gap Length',
        id: 'exr-gap-length',
        value: state.dashPattern[1],
        min: 0,
        max: 32,
        onInput: (value) => {
          const [dash] = this.overlay.getState().dashPattern;
          this.overlay.setDashPattern([dash, value]);
          return this.overlay.getState().dashPattern[1];
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

  private createColorControl(
    labelText: string,
    testId: string,
    value: string,
    onInputValue: (value: string) => void,
  ): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'none');
    wrapper.style.cssText = `
      padding: 8px 12px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 12px; color: var(--text-primary);';

    const input = document.createElement('input');
    input.type = 'color';
    input.value = value;
    input.dataset.testid = testId;
    input.style.cssText = `
      width: 40px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--border-secondary);
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
    `;
    input.addEventListener('input', () => onInputValue(input.value));

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }
}
