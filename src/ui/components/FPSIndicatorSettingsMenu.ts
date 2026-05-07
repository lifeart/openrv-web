/**
 * FPS Indicator Settings Context Menu
 *
 * A context menu for configuring FPSIndicator position, display fields,
 * background opacity, and warning/critical thresholds.
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
import type { FPSIndicator } from './FPSIndicator';
import type { OverlayPosition } from './TimecodeOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

const POSITION_LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Top Left',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-right': 'Bottom Right',
};

export class FPSIndicatorSettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
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
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.indicator.getState();

    menu.appendChild(createSectionHeader('Position', { menu: true }));
    for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as OverlayPosition[]) {
      const item = createCheckableMenuItem(
        {
          label: POSITION_LABELS[pos],
          checked: state.position === pos,
          role: 'menuitemradio',
          onClick: () => {
            this.indicator.setPosition(pos);
            this.updateRadioGroup(menu, pos);
          },
        },
        applyHoverEffect,
      );
      item.dataset.position = pos;
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Display', { menu: true }));

    const droppedItem = createCheckableMenuItem(
      {
        label: 'Show Dropped Frames',
        checked: state.showDroppedFrames,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.indicator.getState().showDroppedFrames;
          this.indicator.setState({ showDroppedFrames: next });
          setMenuItemChecked(droppedItem, next);
        },
      },
      applyHoverEffect,
    );
    droppedItem.dataset.setting = 'show-dropped';
    menu.appendChild(droppedItem);

    const targetItem = createCheckableMenuItem(
      {
        label: 'Show Target FPS',
        checked: state.showTargetFps,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.indicator.getState().showTargetFps;
          this.indicator.setState({ showTargetFps: next });
          setMenuItemChecked(targetItem, next);
        },
      },
      applyHoverEffect,
    );
    targetItem.dataset.setting = 'show-target';
    menu.appendChild(targetItem);

    menu.appendChild(this.createRatioSlider('Background', 'fps-bg', state.backgroundOpacity, (value) => {
      this.indicator.setBackgroundOpacity(value);
      return this.indicator.getState().backgroundOpacity;
    }));

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Thresholds', { menu: true }));

    menu.appendChild(this.createRatioSlider('Warning', 'fps-warning', state.warningThreshold, (value) => {
      this.indicator.setState({ warningThreshold: value });
      return this.indicator.getState().warningThreshold;
    }));

    menu.appendChild(this.createRatioSlider('Critical', 'fps-critical', state.criticalThreshold, (value) => {
      this.indicator.setState({ criticalThreshold: value });
      return this.indicator.getState().criticalThreshold;
    }));

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

  /**
   * Wrap createSliderControl for the FPS menu's normalized 0-1 sliders.
   *
   * The FPS indicator stores opacity / thresholds as 0-1 ratios, while
   * the slider UI uses 0-100 integers.
   */
  private createRatioSlider(
    labelText: string,
    id: string,
    initialRatio: number,
    onRatioChange: (ratio: number) => number,
  ): HTMLElement {
    return createSliderControl({
      label: labelText,
      id,
      value: initialRatio * 100,
      min: 0,
      max: 100,
      suffix: '%',
      valueColor: 'var(--text-muted)',
      ariaLabel: `${labelText} slider`,
      stopPropagation: true,
      onInput: (value) => onRatioChange(value / 100) * 100,
    }).container;
  }

  private updateRadioGroup(menu: HTMLDivElement, selectedValue: string): void {
    const items = menu.querySelectorAll<HTMLDivElement>('[data-position]');
    for (const item of items) {
      setMenuItemChecked(item, item.dataset.position === selectedValue);
    }
  }
}
