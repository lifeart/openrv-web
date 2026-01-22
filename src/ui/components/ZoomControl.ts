/**
 * ZoomControl - Compact zoom dropdown for View tab
 *
 * Replaces 5 separate zoom buttons with a single dropdown showing current zoom level.
 * Click to open dropdown, select zoom level or type custom value.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { DropdownMenu } from './shared/DropdownMenu';

export type ZoomLevel = 'fit' | 0.25 | 0.5 | 1 | 2 | 4;

export interface ZoomControlEvents extends EventMap {
  zoomChanged: ZoomLevel;
}

const ZOOM_LEVELS: { value: ZoomLevel; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 1, label: '100%' },
  { value: 2, label: '200%' },
  { value: 4, label: '400%' },
];

// Map string values back to ZoomLevel for type-safe parsing
const ZOOM_VALUE_MAP: Record<string, ZoomLevel> = Object.fromEntries(
  ZOOM_LEVELS.map(({ value }) => [String(value), value])
) as Record<string, ZoomLevel>;

export class ZoomControl extends EventEmitter<ZoomControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: DropdownMenu;
  private currentZoom: ZoomLevel = 'fit';

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'zoom-control';
    this.container.dataset.testid = 'zoom-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'zoom-control-button';
    this.button.title = 'Zoom level (F to fit, 0-4 for presets)';
    this.button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #999;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 70px;
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dropdown.toggle(this.button);
      this.updateButtonStyle();
    });
    this.button.addEventListener('mouseenter', () => {
      if (!this.dropdown.isVisible()) {
        this.button.style.background = '#3a3a3a';
        this.button.style.borderColor = '#4a4a4a';
        this.button.style.color = '#ccc';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.dropdown.isVisible()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = '#999';
      }
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.button);

    // Create dropdown menu
    this.dropdown = new DropdownMenu({
      minWidth: '100px',
      onSelect: (value) => {
        const zoom = ZOOM_VALUE_MAP[value];
        if (zoom !== undefined) {
          this.setZoom(zoom);
        }
      },
      onClose: () => {
        this.updateButtonStyle();
      },
    });

    // Set dropdown items
    this.dropdown.setItems(
      ZOOM_LEVELS.map(({ value, label }) => ({
        value: String(value),
        label,
      }))
    );

    this.dropdown.getElement().dataset.testid = 'zoom-dropdown';
    this.container.appendChild(this.button);
  }

  private updateButtonLabel(): void {
    let label: string;
    if (this.currentZoom === 'fit') {
      label = 'Fit';
    } else {
      label = `${Math.round(this.currentZoom * 100)}%`;
    }
    this.button.innerHTML = `${getIconSvg('zoom-in', 'sm')}<span>${label}</span><span style="font-size: 8px;">&#9660;</span>`;
  }

  private updateButtonStyle(): void {
    if (this.dropdown.isVisible()) {
      this.button.style.background = '#3a3a3a';
      this.button.style.borderColor = '#4a4a4a';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = '#999';
    }
  }

  setZoom(zoom: ZoomLevel): void {
    this.currentZoom = zoom;
    this.updateButtonLabel();
    this.dropdown.setSelectedValue(String(zoom));
    this.emit('zoomChanged', zoom);
  }

  getZoom(): ZoomLevel {
    return this.currentZoom;
  }

  /**
   * Handle keyboard shortcuts
   * Returns true if the key was handled
   */
  handleKeyboard(key: string): boolean {
    switch (key) {
      case 'f':
      case 'F':
        this.setZoom('fit');
        return true;
      case '0':
        this.setZoom(0.5);
        return true;
      case '1':
        // Note: 1-5 are used for tabs, so only use when View tab is active
        return false;
      case '2':
        return false;
      case '3':
        return false;
      case '4':
        return false;
    }
    return false;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.dropdown.dispose();
  }
}
