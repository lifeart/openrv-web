/**
 * Timecode Overlay Settings Context Menu
 *
 * A context menu for configuring TimecodeOverlay position, font size,
 * frame-counter visibility, and background opacity.
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
import type { OverlayPosition, TimecodeOverlay, TimecodeOverlayState, TimecodeDisplayFormat } from './TimecodeOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

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
  private deregisterDismiss: (() => void) | null = null;
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
      min-width: ${PANEL_WIDTHS.menu};
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const currentState = this.overlay.getState();

    menu.appendChild(createSectionHeader('Position', { menu: true }));
    for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as OverlayPosition[]) {
      const item = createCheckableMenuItem(
        {
          label: POSITION_LABELS[pos],
          checked: currentState.position === pos,
          role: 'menuitemradio',
          onClick: () => {
            this.overlay.setPosition(pos);
            this.updateRadioGroup(menu, 'data-position', pos);
          },
        },
        applyHoverEffect,
      );
      item.dataset.position = pos;
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Font Size', { menu: true }));
    for (const fontSize of ['small', 'medium', 'large'] as TimecodeOverlayState['fontSize'][]) {
      const item = createCheckableMenuItem(
        {
          label: FONT_SIZE_LABELS[fontSize],
          checked: currentState.fontSize === fontSize,
          role: 'menuitemradio',
          onClick: () => {
            this.overlay.setFontSize(fontSize);
            this.updateRadioGroup(menu, 'data-font-size', fontSize);
          },
        },
        applyHoverEffect,
      );
      item.dataset.fontSize = fontSize;
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Display Format', { menu: true }));

    for (const format of ['smpte', 'frame', 'both'] as TimecodeDisplayFormat[]) {
      const item = createCheckableMenuItem(
        {
          label: DISPLAY_FORMAT_LABELS[format],
          checked: currentState.displayFormat === format,
          role: 'menuitemradio',
          onClick: () => {
            this.overlay.setDisplayFormat(format);
            this.updateRadioGroup(menu, 'data-display-format', format);
          },
        },
        applyHoverEffect,
      );
      item.dataset.displayFormat = format;
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    const sourceTimecodeItem = createCheckableMenuItem(
      {
        label: 'Show Source Timecode',
        checked: currentState.showSourceTimecode,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.overlay.getState().showSourceTimecode;
          this.overlay.setShowSourceTimecode(next);
          setMenuItemChecked(sourceTimecodeItem, next);
        },
      },
      applyHoverEffect,
    );
    sourceTimecodeItem.dataset.testid = 'show-source-timecode';
    menu.appendChild(sourceTimecodeItem);

    menu.appendChild(
      createSliderControl({
        label: 'Background',
        id: 'timecode-opacity',
        value: currentState.backgroundOpacity * 100,
        min: 0,
        max: 100,
        step: 5,
        suffix: '%',
        valueColor: 'var(--text-muted)',
        ariaLabel: 'Timecode overlay background opacity',
        stopPropagation: true,
        onInput: (value) => {
          this.overlay.setBackgroundOpacity(value / 100);
          return value;
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
      setMenuItemChecked(item, item.dataset[attr] === selectedValue);
    }
  }
}
