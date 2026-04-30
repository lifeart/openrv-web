/**
 * Spotlight Overlay Settings Context Menu
 *
 * A context menu for configuring SpotlightOverlay shape, position, size,
 * dim amount, and feather.
 */

import { applyHoverEffect } from './shared/Button';
import { SHADOWS, Z_INDEX } from './shared/theme';
import type { SpotlightOverlay, SpotlightShape } from './SpotlightOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

const SHAPE_LABELS: Record<SpotlightShape, string> = {
  circle: 'Circle',
  rectangle: 'Rectangle',
};

const SHAPES: SpotlightShape[] = ['circle', 'rectangle'];

export class SpotlightOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
  private _isVisible = false;
  private overlay: SpotlightOverlay;

  constructor(overlay: SpotlightOverlay) {
    this.overlay = overlay;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'spotlight-overlay-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Spotlight settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 240px;
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.overlay.getState();

    menu.appendChild(this.createSectionHeader('Shape'));
    for (const shape of SHAPES) {
      const item = this.createRadioItem(SHAPE_LABELS[shape], state.shape === shape, () => {
        this.overlay.setShape(shape);
        this.updateRadioGroup(menu, shape);
      });
      item.dataset.shape = shape;
      menu.appendChild(item);
    }

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Position'));
    menu.appendChild(
      this.createSliderControl('Center X', 'spotlight-center-x', state.x * 100, 0, 100, '%', (value) => {
        const current = this.overlay.getState();
        this.overlay.setPosition(value / 100, current.y);
        return this.overlay.getState().x * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Center Y', 'spotlight-center-y', state.y * 100, 0, 100, '%', (value) => {
        const current = this.overlay.getState();
        this.overlay.setPosition(current.x, value / 100);
        return this.overlay.getState().y * 100;
      }),
    );

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Size'));
    menu.appendChild(
      this.createSliderControl('Width', 'spotlight-width', state.width * 100, 1, 100, '%', (value) => {
        const current = this.overlay.getState();
        if (current.shape === 'circle') {
          this.overlay.setSize(value / 100, value / 100);
        } else {
          this.overlay.setSize(value / 100, current.height);
        }
        return this.overlay.getState().width * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Height', 'spotlight-height', state.height * 100, 1, 100, '%', (value) => {
        const current = this.overlay.getState();
        if (current.shape === 'circle') {
          this.overlay.setSize(value / 100, value / 100);
        } else {
          this.overlay.setSize(current.width, value / 100);
        }
        return this.overlay.getState().height * 100;
      }),
    );

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Appearance'));
    menu.appendChild(
      this.createSliderControl('Dim Amount', 'spotlight-dim', state.dimAmount * 100, 0, 100, '%', (value) => {
        this.overlay.setDimAmount(value / 100);
        return this.overlay.getState().dimAmount * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Feather', 'spotlight-feather', state.feather * 100, 0, 50, '%', (value) => {
        this.overlay.setFeather(value / 100);
        return this.overlay.getState().feather * 100;
      }),
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

  private createRadioItem(label: string, checked: boolean, onClick: () => void): HTMLDivElement {
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
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });

    return item;
  }

  private createSliderControl(
    labelText: string,
    id: string,
    initialValue: number,
    min: number,
    max: number,
    suffix: string,
    onInputValue: (value: number) => number,
  ): HTMLDivElement {
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
    label.textContent = labelText;
    labelRow.appendChild(label);

    const value = document.createElement('span');
    value.dataset.testid = `${id}-value`;
    value.textContent = `${Math.round(initialValue)}${suffix}`;
    labelRow.appendChild(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = '1';
    slider.value = String(Math.round(initialValue));
    slider.dataset.testid = `${id}-slider`;
    slider.style.cssText = 'width: 100%;';
    slider.addEventListener('input', () => {
      const appliedValue = onInputValue(Number.parseInt(slider.value, 10));
      slider.value = String(Math.round(appliedValue));
      value.textContent = `${Math.round(appliedValue)}${suffix}`;
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

  private updateRadioGroup(menu: HTMLDivElement, selectedShape: SpotlightShape): void {
    menu.querySelectorAll<HTMLDivElement>('[data-shape]').forEach((item) => {
      const checked = item.dataset.shape === selectedShape;
      item.setAttribute('aria-checked', String(checked));
      const check = item.querySelector<HTMLElement>('.menu-check');
      if (check) {
        check.textContent = checked ? '\u2713' : '';
      }
    });
  }
}
