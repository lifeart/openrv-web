/**
 * Clipping Overlay Settings Context Menu
 *
 * A context menu for configuring ClippingOverlay highlight/shadow visibility and opacity.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import {
  createCheckableMenuItem,
  createSectionHeader,
  createSliderControl,
  setMenuItemChecked,
} from './shared/FormElements';
import type { ClippingOverlay } from './ClippingOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

export class ClippingOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
  private _isVisible = false;
  private overlay: ClippingOverlay;

  constructor(overlay: ClippingOverlay) {
    this.overlay = overlay;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'clipping-overlay-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Clipping Overlay settings');
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

    menu.appendChild(createSectionHeader('Display', { menu: true }));

    const highlightItem = createCheckableMenuItem(
      {
        label: 'Show Highlights',
        checked: state.showHighlights,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.overlay.getState().showHighlights;
          this.overlay.setShowHighlights(next);
          setMenuItemChecked(highlightItem, next);
        },
      },
      applyHoverEffect,
    );
    highlightItem.dataset.setting = 'show-highlights';
    menu.appendChild(highlightItem);

    const shadowItem = createCheckableMenuItem(
      {
        label: 'Show Shadows',
        checked: state.showShadows,
        role: 'menuitemcheckbox',
        onClick: () => {
          const next = !this.overlay.getState().showShadows;
          this.overlay.setShowShadows(next);
          setMenuItemChecked(shadowItem, next);
        },
      },
      applyHoverEffect,
    );
    shadowItem.dataset.setting = 'show-shadows';
    menu.appendChild(shadowItem);

    menu.appendChild(
      createSliderControl({
        label: 'Opacity',
        id: 'clipping-opacity',
        value: state.opacity * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          this.overlay.setOpacity(value / 100);
          return this.overlay.getState().opacity * 100;
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
}
