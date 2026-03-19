/**
 * Timecode Overlay Settings Context Menu
 *
 * A context menu for configuring TimecodeOverlay position, font size,
 * frame-counter visibility, and background opacity.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import type { OverlayPosition, TimecodeOverlay, TimecodeOverlayState, TimecodeDisplayFormat } from './TimecodeOverlay';

const VIEWPORT_MARGIN = 8;

const POSITION_LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Top Left',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-right': 'Bottom Right',
};

const FONT_SIZE_LABELS: Record<TimecodeOverlayState['fontSize'], string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

const DISPLAY_FORMAT_LABELS: Record<TimecodeDisplayFormat, string> = {
  smpte: 'SMPTE Timecode',
  frame: 'Frame Number',
  both: 'Both',
};

export class TimecodeOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private dismissHandlers: (() => void)[] = [];
  private _isVisible = false;
  private overlay: TimecodeOverlay;

  constructor(overlay: TimecodeOverlay) {
    this.overlay = overlay;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'timecode-overlay-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Timecode Overlay settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 200px;
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const currentState = this.overlay.getState();

    menu.appendChild(this.createSectionHeader('Position'));
    for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as OverlayPosition[]) {
      const item = this.createCheckableItem(
        POSITION_LABELS[pos],
        currentState.position === pos,
        'menuitemradio',
        () => {
          this.overlay.setPosition(pos);
          this.updateRadioGroup(menu, 'data-position', pos);
        },
      );
      item.dataset.position = pos;
      menu.appendChild(item);
    }

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Font Size'));
    for (const fontSize of ['small', 'medium', 'large'] as TimecodeOverlayState['fontSize'][]) {
      const item = this.createCheckableItem(
        FONT_SIZE_LABELS[fontSize],
        currentState.fontSize === fontSize,
        'menuitemradio',
        () => {
          this.overlay.setFontSize(fontSize);
          this.updateRadioGroup(menu, 'data-font-size', fontSize);
        },
      );
      item.dataset.fontSize = fontSize;
      menu.appendChild(item);
    }

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Display Format'));

    for (const format of ['smpte', 'frame', 'both'] as TimecodeDisplayFormat[]) {
      const item = this.createCheckableItem(
        DISPLAY_FORMAT_LABELS[format],
        currentState.displayFormat === format,
        'menuitemradio',
        () => {
          this.overlay.setDisplayFormat(format);
          this.updateRadioGroup(menu, 'data-display-format', format);
        },
      );
      item.dataset.displayFormat = format;
      menu.appendChild(item);
    }

    menu.appendChild(this.createSeparator());
    const sourceTimecodeItem = this.createCheckableItem(
      'Show Source Timecode',
      currentState.showSourceTimecode,
      'menuitemcheckbox',
      () => {
        const next = !this.overlay.getState().showSourceTimecode;
        this.overlay.setShowSourceTimecode(next);
        sourceTimecodeItem.setAttribute('aria-checked', String(next));
        const check = sourceTimecodeItem.querySelector<HTMLElement>('.menu-check');
        if (check) check.textContent = next ? '\u2713' : '';
      },
    );
    sourceTimecodeItem.dataset.testid = 'show-source-timecode';
    menu.appendChild(sourceTimecodeItem);

    menu.appendChild(this.createOpacityControl(currentState.backgroundOpacity));

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

  private createOpacityControl(initialOpacity: number): HTMLDivElement {
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
    value.dataset.testid = 'timecode-opacity-value';
    value.textContent = `${Math.round(initialOpacity * 100)}%`;
    value.style.color = 'var(--text-muted)';
    labelRow.appendChild(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '5';
    slider.value = String(Math.round(initialOpacity * 100));
    slider.dataset.testid = 'timecode-opacity-slider';
    slider.setAttribute('aria-label', 'Timecode overlay background opacity');
    slider.style.width = '100%';
    slider.addEventListener('click', (e) => e.stopPropagation());
    slider.addEventListener('input', (e) => {
      e.stopPropagation();
      const nextOpacity = Number(slider.value) / 100;
      this.overlay.setBackgroundOpacity(nextOpacity);
      value.textContent = `${slider.value}%`;
    });

    wrapper.appendChild(labelRow);
    wrapper.appendChild(slider);

    return wrapper;
  }

  private createSeparator(): HTMLDivElement {
    const sep = document.createElement('div');
    sep.setAttribute('role', 'separator');
    sep.style.cssText = `
      height: 1px;
      margin: 4px 0;
      background: var(--border-secondary);
      opacity: 0.5;
    `;
    return sep;
  }

  private updateRadioGroup(
    menu: HTMLDivElement,
    datasetKey: 'data-position' | 'data-font-size' | 'data-display-format',
    selectedValue: string,
  ): void {
    const attrMap: Record<string, string> = {
      'data-position': 'position',
      'data-font-size': 'fontSize',
      'data-display-format': 'displayFormat',
    };
    const attr = attrMap[datasetKey]!;
    const selector = `[${datasetKey}]`;
    const items = menu.querySelectorAll<HTMLDivElement>(selector);
    for (const item of items) {
      const checked = item.dataset[attr] === selectedValue;
      item.setAttribute('aria-checked', String(checked));
      const check = item.querySelector<HTMLElement>('.menu-check');
      if (check) check.textContent = checked ? '\u2713' : '';
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
    for (const cleanup of this.dismissHandlers) cleanup();
    this.dismissHandlers = [];
  }
}
