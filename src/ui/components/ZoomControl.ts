/**
 * ZoomControl - Compact zoom dropdown for View tab
 *
 * Dropdown options now represent pixel ratios (industry-standard semantics
 * where 100% = 1:1 pixel ratio), not internal zoom multiplier values.
 * The "Fit" option remains as a special zoom mode.
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { DropdownMenu } from './shared/DropdownMenu';
import { findPresetForRatio } from './ScalePresets';

export type ZoomLevel = 'fit' | 'fit-width' | 'fit-height' | 0.25 | 0.5 | 1 | 2 | 4;

export interface ZoomControlEvents extends EventMap {
  zoomChanged: ZoomLevel;
}

const ZOOM_LEVELS: { value: ZoomLevel; label: string }[] = [
  { value: 'fit', label: 'Fit All' },
  { value: 'fit-width', label: 'Fit Width' },
  { value: 'fit-height', label: 'Fit Height' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 1, label: '100%' },
  { value: 2, label: '200%' },
  { value: 4, label: '400%' },
];

// Map string values back to ZoomLevel for type-safe parsing
const ZOOM_VALUE_MAP: Record<string, ZoomLevel> = Object.fromEntries(
  ZOOM_LEVELS.map(({ value }) => [String(value), value]),
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
    this.button.title = 'Zoom level (F to fit, Ctrl+1 for 1:1)';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
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
      this.button.setAttribute('aria-expanded', String(this.dropdown.isVisible()));
      this.updateButtonStyle();
    });
    this.button.addEventListener('pointerenter', () => {
      if (!this.dropdown.isVisible()) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('pointerleave', () => {
      if (!this.dropdown.isVisible()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.button);

    // Create dropdown menu
    this.dropdown = new DropdownMenu({
      minWidth: '120px',
      onSelect: (value) => {
        const zoom = ZOOM_VALUE_MAP[value];
        if (zoom !== undefined) {
          this.setZoom(zoom);
        }
      },
      onClose: () => {
        this.button.setAttribute('aria-expanded', 'false');
        this.updateButtonStyle();
      },
    });

    // Set dropdown items
    this.dropdown.setItems(
      ZOOM_LEVELS.map(({ value, label }) => ({
        value: String(value),
        label,
      })),
    );

    this.dropdown.getElement().dataset.testid = 'zoom-dropdown';
    this.container.appendChild(this.button);
  }

  private updateButtonLabel(): void {
    let label: string;
    if (this.currentZoom === 'fit') {
      label = 'Fit All';
    } else if (this.currentZoom === 'fit-width') {
      label = 'Fit Width';
    } else if (this.currentZoom === 'fit-height') {
      label = 'Fit Height';
    } else {
      // For dropdown-selected presets, show percentage notation matching the dropdown
      const preset = findPresetForRatio(this.currentZoom);
      if (preset) {
        label = preset.percentage;
      } else {
        label = `${Math.round(this.currentZoom * 100)}%`;
      }
    }
    this.button.innerHTML = `${getIconSvg('zoom-in', 'sm')}<span>${label}</span><span style="font-size: 8px;">&#9660;</span>`;
  }

  private updateButtonStyle(): void {
    if (this.dropdown.isVisible()) {
      this.button.style.background = 'var(--bg-hover)';
      this.button.style.borderColor = 'var(--border-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
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
   * Update the button label from the viewer's actual zoom state.
   * Called when the viewer zoom changes (e.g. from keyboard shortcuts or wheel zoom).
   * @param zoom - The internal zoom multiplier
   * @param fitScale - The current fitScale
   */
  updateFromViewer(zoom: number, fitScale: number): void {
    const isFit = Math.abs(zoom - 1) < 0.001;
    if (isFit) {
      this.currentZoom = 'fit';
    } else {
      const ratio = zoom * fitScale;
      // Check if this ratio matches a dropdown preset
      for (const level of ZOOM_LEVELS) {
        if (typeof level.value === 'number' && Math.abs(level.value - ratio) < 0.01) {
          this.currentZoom = level.value;
          this.dropdown.setSelectedValue(String(level.value));
          this.updateButtonLabel();
          return;
        }
      }
      // Not a dropdown preset - update label to show current ratio
      this.currentZoom = 'fit'; // fallback internal state
      const preset = findPresetForRatio(ratio);
      let label: string;
      if (preset) {
        label = preset.percentage;
      } else {
        label = `${Math.round(ratio * 100)}%`;
      }
      this.button.innerHTML = `${getIconSvg('zoom-in', 'sm')}<span>${label}</span><span style="font-size: 8px;">&#9660;</span>`;
      this.dropdown.setSelectedValue(''); // Deselect all
      return;
    }
    this.dropdown.setSelectedValue(String(this.currentZoom));
    this.updateButtonLabel();
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
