/**
 * FPS Indicator Settings Context Menu
 *
 * A context menu for configuring FPSIndicator position, display fields,
 * background opacity, and warning/critical thresholds.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import type { FPSIndicator } from './FPSIndicator';
import type { OverlayPosition } from './TimecodeOverlay';

const VIEWPORT_MARGIN = 8;

const POSITION_LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Top Left',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-right': 'Bottom Right',
};

export class FPSIndicatorSettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private dismissHandlers: (() => void)[] = [];
  private _isVisible = false;
  private indicator: FPSIndicator;

  constructor(indicator: FPSIndicator) {
    this.indicator = indicator;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'fps-indicator-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'FPS Indicator settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 220px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.indicator.getState();

    menu.appendChild(this.createSectionHeader('Position'));
    for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as OverlayPosition[]) {
      const item = this.createCheckableItem(POSITION_LABELS[pos], state.position === pos, 'menuitemradio', () => {
        this.indicator.setPosition(pos);
        this.updateRadioGroup(menu, pos);
      });
      item.dataset.position = pos;
      menu.appendChild(item);
    }

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Display'));

    const droppedItem = this.createCheckableItem(
      'Show Dropped Frames',
      state.showDroppedFrames,
      'menuitemcheckbox',
      () => {
        const next = !this.indicator.getState().showDroppedFrames;
        this.indicator.setState({ showDroppedFrames: next });
        this.updateCheckbox(droppedItem, next);
      },
    );
    droppedItem.dataset.setting = 'show-dropped';
    menu.appendChild(droppedItem);

    const targetItem = this.createCheckableItem(
      'Show Target FPS',
      state.showTargetFps,
      'menuitemcheckbox',
      () => {
        const next = !this.indicator.getState().showTargetFps;
        this.indicator.setState({ showTargetFps: next });
        this.updateCheckbox(targetItem, next);
      },
    );
    targetItem.dataset.setting = 'show-target';
    menu.appendChild(targetItem);

    menu.appendChild(this.createSliderControl('Background', 'fps-bg', state.backgroundOpacity, (value) => {
      this.indicator.setBackgroundOpacity(value);
      return this.indicator.getState().backgroundOpacity;
    }));

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Thresholds'));

    const warningControl = this.createSliderControl('Warning', 'fps-warning', state.warningThreshold, (value) => {
      this.indicator.setState({ warningThreshold: value });
      return this.indicator.getState().warningThreshold;
    });
    menu.appendChild(warningControl);

    const criticalControl = this.createSliderControl('Critical', 'fps-critical', state.criticalThreshold, (value) => {
      this.indicator.setState({ criticalThreshold: value });
      return this.indicator.getState().criticalThreshold;
    });
    menu.appendChild(criticalControl);

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

  private createCheckableItem(
    label: string,
    checked: boolean,
    role: 'menuitemradio' | 'menuitemcheckbox',
    onClick: () => void,
  ): HTMLDivElement {
    const item = document.createElement('div');
    item.setAttribute('role', role);
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

  private createSliderControl(
    labelText: string,
    id: string,
    initialValue: number,
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
    value.textContent = `${Math.round(initialValue * 100)}%`;
    value.style.color = 'var(--text-muted)';
    labelRow.appendChild(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(initialValue * 100));
    slider.dataset.testid = `${id}-slider`;
    slider.setAttribute('aria-label', `${labelText} slider`);
    slider.style.width = '100%';
    slider.addEventListener('click', (e) => e.stopPropagation());
    slider.addEventListener('input', (e) => {
      e.stopPropagation();
      const appliedValue = onInputValue(Number(slider.value) / 100);
      slider.value = String(Math.round(appliedValue * 100));
      value.textContent = `${slider.value}%`;
    });

    wrapper.appendChild(labelRow);
    wrapper.appendChild(slider);
    return wrapper;
  }

  private createSeparator(): HTMLDivElement {
    const sep = document.createElement('div');
    sep.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: 4px 0;
    `;
    return sep;
  }

  private updateRadioGroup(menu: HTMLDivElement, selectedValue: string): void {
    const items = menu.querySelectorAll<HTMLDivElement>('[data-position]');
    for (const item of items) {
      const checked = item.dataset.position === selectedValue;
      item.setAttribute('aria-checked', String(checked));
      const check = item.querySelector<HTMLElement>('.menu-check');
      if (check) check.textContent = checked ? '\u2713' : '';
    }
  }

  private updateCheckbox(item: HTMLDivElement, checked: boolean): void {
    item.setAttribute('aria-checked', String(checked));
    const check = item.querySelector<HTMLElement>('.menu-check');
    if (check) check.textContent = checked ? '\u2713' : '';
  }

  private setupDismissHandlers(menu: HTMLDivElement): void {
    const onClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) this.hide();
    };
    document.addEventListener('mousedown', onClickOutside);
    this.dismissHandlers.push(() => document.removeEventListener('mousedown', onClickOutside));

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide();
    };
    document.addEventListener('keydown', onEscape);
    this.dismissHandlers.push(() => document.removeEventListener('keydown', onEscape));

    const onWindowBlur = () => this.hide();
    window.addEventListener('blur', onWindowBlur);
    this.dismissHandlers.push(() => window.removeEventListener('blur', onWindowBlur));
  }

  private cleanupDismissHandlers(): void {
    for (const cleanup of this.dismissHandlers) cleanup();
    this.dismissHandlers = [];
  }
}
