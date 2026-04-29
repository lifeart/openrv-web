/**
 * InfoPanel Settings Context Menu
 *
 * A context menu for configuring InfoPanel position and visible fields.
 * Triggered by right-clicking the Info Panel toggle button.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
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

    // Section header: Position
    menu.appendChild(this.createSectionHeader('Position'));

    // Position radio items
    const currentPosition = this.infoPanel.getPosition();
    const positions: InfoPanelPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const pos of positions) {
      const isChecked = pos === currentPosition;
      const item = this.createCheckableItem(POSITION_LABELS[pos], isChecked, 'menuitemradio', () => {
        this.infoPanel.setPosition(pos);
        this.hide();
      });
      menu.appendChild(item);
    }

    // Separator
    menu.appendChild(this.createSeparator());

    // Section header: Fields
    menu.appendChild(this.createSectionHeader('Fields'));

    // Field toggle items
    const currentFields = this.infoPanel.getFields();
    const fieldKeys = Object.keys(FIELD_LABELS) as (keyof InfoPanelFields)[];
    for (const field of fieldKeys) {
      const isChecked = currentFields[field];
      const item = this.createCheckableItem(FIELD_LABELS[field], isChecked, 'menuitemcheckbox', () => {
        this.infoPanel.toggleField(field);
        // Update the checkmark in-place without closing the menu
        this.updateFieldCheckmarks(menu);
      });
      item.dataset.field = field;
      menu.appendChild(item);
    }

    this.menuEl = menu;
    document.body.appendChild(menu);

    // Position: render hidden, measure, clamp, then show
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

  /**
   * Hide and remove the context menu.
   */
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

  /**
   * Whether the context menu is currently visible.
   */
  isVisible(): boolean {
    return this._isVisible;
  }

  /**
   * Dispose the context menu and clean up all resources.
   */
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

  private updateFieldCheckmarks(menu: HTMLDivElement): void {
    const currentFields = this.infoPanel.getFields();
    const items = menu.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
    for (const item of items) {
      const field = item.dataset.field as keyof InfoPanelFields | undefined;
      if (field && field in currentFields) {
        const checked = currentFields[field];
        item.setAttribute('aria-checked', String(checked));
        const checkSpan = item.querySelector('.menu-check');
        if (checkSpan) {
          checkSpan.textContent = checked ? '\u2713' : '';
        }
      }
    }
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

}
