/**
 * Spotlight Overlay Settings Context Menu
 *
 * A context menu for configuring SpotlightOverlay shape, position, size,
 * dim amount, and feather.
 */

import { applyHoverEffect } from './shared/Button';
import { PANEL_WIDTHS, SHADOWS, Z_INDEX } from './shared/theme';
import {
  createCheckableMenuItem,
  createSectionHeader,
  createSeparator,
  createSliderControl,
  setMenuItemChecked,
} from './shared/FormElements';
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
      min-width: ${PANEL_WIDTHS.medium};
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.overlay.getState();

    menu.appendChild(createSectionHeader('Shape', { menu: true }));
    for (const shape of SHAPES) {
      const item = createCheckableMenuItem(
        {
          label: SHAPE_LABELS[shape],
          checked: state.shape === shape,
          role: 'menuitemradio',
          onClick: () => {
            this.overlay.setShape(shape);
            this.updateRadioGroup(menu, shape);
          },
        },
        applyHoverEffect,
      );
      item.dataset.shape = shape;
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Position', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Center X',
        id: 'spotlight-center-x',
        value: state.x * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          const current = this.overlay.getState();
          this.overlay.setPosition(value / 100, current.y);
          return this.overlay.getState().x * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Center Y',
        id: 'spotlight-center-y',
        value: state.y * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          const current = this.overlay.getState();
          this.overlay.setPosition(current.x, value / 100);
          return this.overlay.getState().y * 100;
        },
      }).container,
    );

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Size', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Width',
        id: 'spotlight-width',
        value: state.width * 100,
        min: 1,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          const current = this.overlay.getState();
          if (current.shape === 'circle') {
            this.overlay.setSize(value / 100, value / 100);
          } else {
            this.overlay.setSize(value / 100, current.height);
          }
          return this.overlay.getState().width * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Height',
        id: 'spotlight-height',
        value: state.height * 100,
        min: 1,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          const current = this.overlay.getState();
          if (current.shape === 'circle') {
            this.overlay.setSize(value / 100, value / 100);
          } else {
            this.overlay.setSize(current.width, value / 100);
          }
          return this.overlay.getState().height * 100;
        },
      }).container,
    );

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Appearance', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Dim Amount',
        id: 'spotlight-dim',
        value: state.dimAmount * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          this.overlay.setDimAmount(value / 100);
          return this.overlay.getState().dimAmount * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Feather',
        id: 'spotlight-feather',
        value: state.feather * 100,
        min: 0,
        max: 50,
        suffix: '%',
        onInput: (value) => {
          this.overlay.setFeather(value / 100);
          return this.overlay.getState().feather * 100;
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

  private updateRadioGroup(menu: HTMLDivElement, selectedShape: SpotlightShape): void {
    menu.querySelectorAll<HTMLDivElement>('[data-shape]').forEach((item) => {
      setMenuItemChecked(item, item.dataset.shape === selectedShape);
    });
  }
}
