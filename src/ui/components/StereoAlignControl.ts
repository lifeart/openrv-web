/**
 * StereoAlignControl - Alignment overlay dropdown
 *
 * Provides a dropdown to select alignment overlay mode:
 * - Off (no overlay)
 * - Grid (64px grid lines)
 * - Crosshair (center cross)
 * - Difference (L/R absolute difference)
 * - Edge Overlay (Sobel edges colored by eye)
 *
 * Only visible when stereo mode is active.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import {
  StereoAlignMode,
  DEFAULT_STEREO_ALIGN_MODE,
  STEREO_ALIGN_MODES,
} from '../../stereo/StereoEyeTransform';

export interface StereoAlignControlEvents extends EventMap {
  alignModeChanged: StereoAlignMode;
}

const ALIGN_MODE_LABELS: Record<StereoAlignMode, string> = {
  'off': 'Off',
  'grid': 'Grid',
  'crosshair': 'Crosshair',
  'difference': 'Difference',
  'edges': 'Edge Overlay',
};

export class StereoAlignControl extends EventEmitter<StereoAlignControlEvents> {
  private container: HTMLElement;
  private alignButton: HTMLButtonElement;
  private dropdown: HTMLElement;
  private mode: StereoAlignMode = DEFAULT_STEREO_ALIGN_MODE;
  private isDropdownOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;
  private _cleanupA11y: (() => void) | null = null;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    // Container
    this.container = document.createElement('div');
    this.container.className = 'stereo-align-container';
    this.container.style.cssText = 'display: inline-flex; align-items: center; position: relative;';

    // Align button
    this.alignButton = document.createElement('button');
    this.alignButton.dataset.testid = 'stereo-align-button';
    this.alignButton.title = 'Stereo alignment tools (Shift+4)';
    this.alignButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      outline: none;
    `;
    this.alignButton.innerHTML = `${getIconSvg('eye', 'sm')}<span>Align</span><span style="font-size: 8px;">&#9660;</span>`;
    this.alignButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
    this.alignButton.addEventListener('pointerenter', () => {
      if (!this.isActive() && !this.isDropdownOpen) {
        this.alignButton.style.background = 'var(--bg-hover)';
        this.alignButton.style.borderColor = 'var(--border-primary)';
        this.alignButton.style.color = 'var(--text-primary)';
      }
    });
    this.alignButton.addEventListener('pointerleave', () => {
      if (!this.isActive() && !this.isDropdownOpen) {
        this.alignButton.style.background = 'transparent';
        this.alignButton.style.borderColor = 'transparent';
        this.alignButton.style.color = 'var(--text-muted)';
      }
    });
    this.alignButton.setAttribute('aria-label', 'Stereo alignment tools');
    this.alignButton.setAttribute('aria-expanded', 'false');
    this.alignButton.setAttribute('aria-haspopup', 'true');
    this._cleanupA11y = applyA11yFocus(this.alignButton);

    // Dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.dataset.testid = 'stereo-align-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 4px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Populate dropdown options
    STEREO_ALIGN_MODES.forEach((mode) => {
      const option = document.createElement('button');
      option.dataset.stereoAlign = mode;
      option.textContent = ALIGN_MODE_LABELS[mode];
      option.style.cssText = `
        background: transparent;
        border: none;
        color: var(--text-primary);
        padding: 6px 10px;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
        transition: background 0.12s ease;
      `;
      option.addEventListener('pointerenter', () => {
        option.style.background = 'var(--bg-hover)';
      });
      option.addEventListener('pointerleave', () => {
        if (this.mode !== mode) {
          option.style.background = 'transparent';
        }
      });
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setMode(mode);
        this.closeDropdown();
      });
      this.dropdown.appendChild(option);
    });

    this.container.appendChild(this.alignButton);
    this.updateButtonStyle();
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (
      this.isDropdownOpen &&
      !this.alignButton.contains(e.target as Node) &&
      !this.dropdown.contains(e.target as Node)
    ) {
      this.closeDropdown();
    }
  }

  private positionDropdown(): void {
    if (!this.isDropdownOpen) return;
    const rect = this.alignButton.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private updateButtonStyle(): void {
    if (this.isActive()) {
      this.alignButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.alignButton.style.borderColor = 'var(--accent-primary)';
      this.alignButton.style.color = 'var(--accent-primary)';
    } else {
      this.alignButton.style.background = 'transparent';
      this.alignButton.style.borderColor = 'transparent';
      this.alignButton.style.color = 'var(--text-muted)';
    }

    // Update dropdown option highlighting
    const options = this.dropdown.querySelectorAll('button');
    options.forEach((option) => {
      const optMode = (option as HTMLElement).dataset.stereoAlign;
      if (optMode === this.mode) {
        option.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
        option.style.color = 'var(--accent-primary)';
      } else {
        option.style.background = 'transparent';
        option.style.color = 'var(--text-primary)';
      }
    });
  }

  private toggleDropdown(): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }

    this.isDropdownOpen = true;
    this.positionDropdown();
    this.dropdown.style.display = 'flex';
    this.alignButton.setAttribute('aria-expanded', 'true');
    this.alignButton.style.background = 'var(--bg-hover)';
    this.alignButton.style.borderColor = 'var(--border-primary)';

    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isDropdownOpen = false;
    this.dropdown.style.display = 'none';
    this.alignButton.setAttribute('aria-expanded', 'false');
    this.updateButtonStyle();

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  setMode(mode: StereoAlignMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.updateButtonStyle();
    this.emit('alignModeChanged', mode);
  }

  getMode(): StereoAlignMode {
    return this.mode;
  }

  cycleMode(): void {
    const currentIndex = STEREO_ALIGN_MODES.indexOf(this.mode);
    const nextIndex = (currentIndex + 1) % STEREO_ALIGN_MODES.length;
    this.setMode(STEREO_ALIGN_MODES[nextIndex]!);
  }

  isActive(): boolean {
    return this.mode !== 'off';
  }

  reset(): void {
    if (this.mode !== 'off') {
      this.mode = 'off';
      this.updateButtonStyle();
      this.emit('alignModeChanged', 'off');
    }
  }

  /**
   * Handle keyboard shortcuts
   * Returns true if the key was handled
   */
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (shiftKey && key === '4') {
      this.cycleMode();
      return true;
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
    if (this._cleanupA11y) {
      this._cleanupA11y();
      this._cleanupA11y = null;
    }
    this.removeAllListeners();
  }
}
