/**
 * Reference Comparison Settings Context Menu
 *
 * A context menu for configuring ReferenceManager comparison mode, overlay opacity,
 * and split wipe position.
 */

import { applyHoverEffect } from './shared/Button';
import { SHADOWS, Z_INDEX } from './shared/theme';
import type { ReferenceManager, ReferenceViewMode } from './ReferenceManager';

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
  private dismissHandlers: (() => void)[] = [];
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
      min-width: 240px;
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.referenceManager.getState();

    menu.appendChild(this.createSectionHeader('Mode'));
    for (const mode of VIEW_MODES) {
      const item = this.createRadioItem(MODE_LABELS[mode], state.viewMode === mode, () => {
        this.referenceManager.setViewMode(mode);
        this.updateRadioGroup(menu, mode);
      });
      item.dataset.mode = mode;
      menu.appendChild(item);
    }

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Blend'));
    menu.appendChild(
      this.createSliderControl('Opacity', 'reference-opacity', state.opacity * 100, 0, 100, '%', (value) => {
        this.referenceManager.setOpacity(value / 100);
        return this.referenceManager.getOpacity() * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Wipe Position', 'reference-wipe', state.wipePosition * 100, 0, 100, '%', (value) => {
        this.referenceManager.setWipePosition(value / 100);
        return this.referenceManager.getWipePosition() * 100;
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

  private updateRadioGroup(menu: HTMLDivElement, selectedMode: ReferenceViewMode): void {
    menu.querySelectorAll<HTMLDivElement>('[data-mode]').forEach((item) => {
      const checked = item.dataset.mode === selectedMode;
      item.setAttribute('aria-checked', String(checked));
      const check = item.querySelector<HTMLElement>('.menu-check');
      if (check) {
        check.textContent = checked ? '\u2713' : '';
      }
    });
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
