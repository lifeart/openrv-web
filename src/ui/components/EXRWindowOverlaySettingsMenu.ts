/**
 * EXR Window Overlay Settings Context Menu
 *
 * A context menu for configuring EXRWindowOverlay visibility, colors, and outline style.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import type { EXRWindowOverlay } from './EXRWindowOverlay';

const VIEWPORT_MARGIN = 8;

export class EXRWindowOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private dismissHandlers: (() => void)[] = [];
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
      min-width: 240px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.overlay.getState();

    menu.appendChild(this.createSectionHeader('Visibility'));

    const dataWindowItem = this.createCheckableItem('Show Data Window', state.showDataWindow, () => {
      const next = !this.overlay.getState().showDataWindow;
      this.overlay.setShowDataWindow(next);
      this.updateCheckbox(dataWindowItem, next);
    });
    dataWindowItem.dataset.setting = 'show-data-window';
    menu.appendChild(dataWindowItem);

    const displayWindowItem = this.createCheckableItem('Show Display Window', state.showDisplayWindow, () => {
      const next = !this.overlay.getState().showDisplayWindow;
      this.overlay.setShowDisplayWindow(next);
      this.updateCheckbox(displayWindowItem, next);
    });
    displayWindowItem.dataset.setting = 'show-display-window';
    menu.appendChild(displayWindowItem);

    const labelsItem = this.createCheckableItem('Show Labels', state.showLabels, () => {
      const next = !this.overlay.getState().showLabels;
      this.overlay.setShowLabels(next);
      this.updateCheckbox(labelsItem, next);
    });
    labelsItem.dataset.setting = 'show-labels';
    menu.appendChild(labelsItem);

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Colors'));
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

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Style'));
    menu.appendChild(
      this.createSliderControl('Line Width', 'exr-line-width', state.lineWidth, 1, 12, (value) => {
        this.overlay.setLineWidth(value);
        return this.overlay.getState().lineWidth;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Dash Length', 'exr-dash-length', state.dashPattern[0], 1, 32, (value) => {
        const [, gap] = this.overlay.getState().dashPattern;
        this.overlay.setDashPattern([value, gap]);
        return this.overlay.getState().dashPattern[0];
      }),
    );
    menu.appendChild(
      this.createSliderControl('Gap Length', 'exr-gap-length', state.dashPattern[1], 0, 32, (value) => {
        const [dash] = this.overlay.getState().dashPattern;
        this.overlay.setDashPattern([dash, value]);
        return this.overlay.getState().dashPattern[1];
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
    this.setupDismissHandlers(menu);
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this._isVisible = false;
    this.cleanupDismissHandlers();
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
    item.setAttribute('role', 'menuitemcheckbox');
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

  private createSliderControl(
    labelText: string,
    id: string,
    initialValue: number,
    min: number,
    max: number,
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
    value.textContent = String(Math.round(initialValue));
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
      value.textContent = String(Math.round(appliedValue));
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

  private updateCheckbox(item: HTMLDivElement, checked: boolean): void {
    item.setAttribute('aria-checked', String(checked));
    const check = item.querySelector<HTMLElement>('.menu-check');
    if (check) {
      check.textContent = checked ? '\u2713' : '';
    }
  }

  private setupDismissHandlers(menu: HTMLDivElement): void {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !menu.contains(target)) {
        this.hide();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.hide();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    this.dismissHandlers.push(() => document.removeEventListener('mousedown', onPointerDown));
    this.dismissHandlers.push(() => document.removeEventListener('keydown', onKeyDown));
  }

  private cleanupDismissHandlers(): void {
    for (const dispose of this.dismissHandlers) {
      dispose();
    }
    this.dismissHandlers = [];
  }
}
