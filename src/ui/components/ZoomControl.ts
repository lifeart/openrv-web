/**
 * ZoomControl - Compact zoom dropdown for View tab
 *
 * Replaces 5 separate zoom buttons with a single dropdown showing current zoom level.
 * Click to open dropdown, select zoom level or type custom value.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

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

export class ZoomControl extends EventEmitter<ZoomControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private currentZoom: ZoomLevel = 'fit';
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

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
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
    this.button.addEventListener('mouseenter', () => {
      if (!this.isOpen) {
        this.button.style.background = '#3a3a3a';
        this.button.style.borderColor = '#4a4a4a';
        this.button.style.color = '#ccc';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = '#999';
      }
    });

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'zoom-dropdown';
    this.dropdown.dataset.testid = 'zoom-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #4a4a4a;
      border-radius: 4px;
      padding: 4px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 100px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.populateDropdown();
    this.container.appendChild(this.button);
  }

  private populateDropdown(): void {
    this.dropdown.innerHTML = '';

    for (const { value, label } of ZOOM_LEVELS) {
      const option = document.createElement('button');
      option.dataset.zoomValue = String(value);
      option.textContent = label;
      option.style.cssText = `
        background: transparent;
        border: none;
        color: #ccc;
        padding: 6px 10px;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
        transition: background 0.12s ease;
      `;
      option.addEventListener('mouseenter', () => {
        option.style.background = '#3a3a3a';
      });
      option.addEventListener('mouseleave', () => {
        if (this.currentZoom !== value) {
          option.style.background = 'transparent';
        }
      });
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setZoom(value);
        this.closeDropdown();
      });
      this.dropdown.appendChild(option);
    }

    this.updateDropdownSelection();
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

  private updateDropdownSelection(): void {
    const options = this.dropdown.querySelectorAll('button');
    options.forEach((option) => {
      const value = (option as HTMLElement).dataset.zoomValue;
      const isSelected = String(this.currentZoom) === value;
      option.style.background = isSelected ? 'rgba(74, 158, 255, 0.2)' : 'transparent';
      option.style.color = isSelected ? '#4a9eff' : '#ccc';
    });
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (
      this.isOpen &&
      !this.button.contains(e.target as Node) &&
      !this.dropdown.contains(e.target as Node)
    ) {
      this.closeDropdown();
    }
  }

  private positionDropdown(): void {
    if (!this.isOpen) return;
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private toggleDropdown(): void {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }

    this.isOpen = true;
    this.positionDropdown();
    this.dropdown.style.display = 'flex';
    this.button.style.background = '#3a3a3a';
    this.button.style.borderColor = '#4a4a4a';

    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.button.style.background = 'transparent';
    this.button.style.borderColor = 'transparent';
    this.button.style.color = '#999';

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  setZoom(zoom: ZoomLevel): void {
    this.currentZoom = zoom;
    this.updateButtonLabel();
    this.updateDropdownSelection();
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
    this.closeDropdown();
    if (document.body.contains(this.dropdown)) {
      document.body.removeChild(this.dropdown);
    }
  }
}
