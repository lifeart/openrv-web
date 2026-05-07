/**
 * InfoPanel Settings Context Menu
 *
 * A context menu for configuring InfoPanel position and visible fields.
 * Triggered by right-clicking the Info Panel toggle button.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import {
  createCheckableMenuItem,
  createSectionHeader,
  createSeparator,
  setMenuItemChecked,
} from './shared/FormElements';
import type { InfoPanel, InfoPanelPosition, InfoPanelFields } from './InfoPanel';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

/** Margin from viewport edges for clamping */
const VIEWPORT_MARGIN = 8;

const POSITION_LABELS: Record<InfoPanelPosition, string> = {
  'top-left': 'Top Left',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-right': 'Bottom Right',
};

const FIELD_LABELS: Record<keyof InfoPanelFields, string> = {
  filename: 'Filename',
  resolution: 'Resolution',
  frameInfo: 'Frame Info',
  timecode: 'Timecode',
  duration: 'Duration',
  fps: 'FPS',
  colorAtCursor: 'Color at Cursor',
  sequencePattern: 'Sequence Pattern',
};

export class InfoPanelSettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
  private _isVisible = false;
  private infoPanel: InfoPanel;

  constructor(infoPanel: InfoPanel) {
    this.infoPanel = infoPanel;
  }

  /**
   * Show the settings menu at the specified position.
   */
  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'info-panel-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Info Panel settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 180px;
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    menu.appendChild(createSectionHeader('Position', { menu: true }));

    const currentPosition = this.infoPanel.getPosition();
    const positions: InfoPanelPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const pos of positions) {
      const item = createCheckableMenuItem(
        {
          label: POSITION_LABELS[pos],
          checked: pos === currentPosition,
          role: 'menuitemradio',
          onClick: () => {
            this.infoPanel.setPosition(pos);
            this.hide();
          },
        },
        applyHoverEffect,
      );
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Fields', { menu: true }));

    const currentFields = this.infoPanel.getFields();
    const fieldKeys = Object.keys(FIELD_LABELS) as (keyof InfoPanelFields)[];
    for (const field of fieldKeys) {
      const item = createCheckableMenuItem(
        {
          label: FIELD_LABELS[field],
          checked: currentFields[field],
          role: 'menuitemcheckbox',
          onClick: () => {
            this.infoPanel.toggleField(field);
            this.updateFieldCheckmarks(menu);
          },
        },
        applyHoverEffect,
      );
      item.dataset.field = field;
      menu.appendChild(item);
    }

    this.menuEl = menu;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x;
    let top = y;

    if (left + rect.width > vw - VIEWPORT_MARGIN) {
      left = x - rect.width;
    }
    if (left < VIEWPORT_MARGIN) {
      left = VIEWPORT_MARGIN;
    }
    if (top + rect.height > vh - VIEWPORT_MARGIN) {
      top = y - rect.height;
    }
    if (top < VIEWPORT_MARGIN) {
      top = VIEWPORT_MARGIN;
    }

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

  private updateFieldCheckmarks(menu: HTMLDivElement): void {
    const currentFields = this.infoPanel.getFields();
    const items = menu.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
    for (const item of items) {
      const field = item.dataset.field as keyof InfoPanelFields | undefined;
      if (field && field in currentFields) {
        setMenuItemChecked(item, currentFields[field]);
      }
    }
  }
}
