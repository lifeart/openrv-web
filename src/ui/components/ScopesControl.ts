/**
 * ScopesControl - Dropdown for scope toggles (Histogram, Waveform, Vectorscope)
 *
 * Combines three toggle buttons into a single dropdown menu.
 * Shows active indicator when any scope is visible.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg, IconName } from './shared/Icons';

export type ScopeType = 'histogram' | 'waveform' | 'vectorscope';

export interface ScopesState {
  histogram: boolean;
  waveform: boolean;
  vectorscope: boolean;
}

export interface ScopesControlEvents extends EventMap {
  scopeToggled: { scope: ScopeType; visible: boolean };
  stateChanged: ScopesState;
}

const SCOPE_CONFIG: { type: ScopeType; label: string; icon: IconName; shortcut: string }[] = [
  { type: 'histogram', label: 'Histogram', icon: 'histogram', shortcut: 'H' },
  { type: 'waveform', label: 'Waveform', icon: 'waveform', shortcut: 'w' },
  { type: 'vectorscope', label: 'Vectorscope', icon: 'vectorscope', shortcut: 'y' },
];

export class ScopesControl extends EventEmitter<ScopesControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private state: ScopesState = {
    histogram: false,
    waveform: false,
    vectorscope: false,
  };
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    this.container = document.createElement('div');
    this.container.className = 'scopes-control';
    this.container.dataset.testid = 'scopes-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'scopes-control-button';
    this.button.title = 'Video scopes (H: histogram, w: waveform, y: vectorscope)';
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
      if (!this.isOpen && !this.hasActiveScopes()) {
        this.button.style.background = '#3a3a3a';
        this.button.style.borderColor = '#4a4a4a';
        this.button.style.color = '#ccc';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen && !this.hasActiveScopes()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = '#999';
      }
    });

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'scopes-dropdown';
    this.dropdown.dataset.testid = 'scopes-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #4a4a4a;
      border-radius: 4px;
      padding: 4px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.populateDropdown();
    this.container.appendChild(this.button);
  }

  private populateDropdown(): void {
    this.dropdown.innerHTML = '';

    for (const { type, label, icon, shortcut } of SCOPE_CONFIG) {
      const option = document.createElement('button');
      option.dataset.scopeType = type;
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      `;

      const leftPart = document.createElement('span');
      leftPart.style.cssText = 'display: flex; align-items: center; gap: 6px;';
      leftPart.innerHTML = `${getIconSvg(icon, 'sm')}<span>${label}</span>`;

      const shortcutHint = document.createElement('span');
      shortcutHint.textContent = shortcut;
      shortcutHint.style.cssText = 'color: #666; font-size: 10px;';

      option.appendChild(leftPart);
      option.appendChild(shortcutHint);

      option.addEventListener('mouseenter', () => {
        option.style.background = '#3a3a3a';
      });
      option.addEventListener('mouseleave', () => {
        this.updateOptionStyle(option, type);
      });
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleScope(type);
      });
      this.dropdown.appendChild(option);
    }

    this.updateDropdownStates();
  }

  private updateButtonLabel(): void {
    const activeCount = this.getActiveCount();
    let label = 'Scopes';
    if (activeCount > 0) {
      label = `Scopes (${activeCount})`;
    }
    this.button.innerHTML = `${getIconSvg('sliders', 'sm')}<span>${label}</span><span style="font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.hasActiveScopes()) {
      this.button.style.background = 'rgba(74, 158, 255, 0.15)';
      this.button.style.borderColor = '#4a9eff';
      this.button.style.color = '#4a9eff';
    } else if (!this.isOpen) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = '#999';
    }
  }

  private updateOptionStyle(option: HTMLButtonElement, type: ScopeType): void {
    const isActive = this.state[type];
    option.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
    option.style.color = isActive ? '#4a9eff' : '#ccc';
  }

  private updateDropdownStates(): void {
    const options = this.dropdown.querySelectorAll('button');
    options.forEach((option) => {
      const type = (option as HTMLElement).dataset.scopeType as ScopeType;
      this.updateOptionStyle(option as HTMLButtonElement, type);
    });
  }

  private hasActiveScopes(): boolean {
    return this.state.histogram || this.state.waveform || this.state.vectorscope;
  }

  private getActiveCount(): number {
    return (this.state.histogram ? 1 : 0) +
           (this.state.waveform ? 1 : 0) +
           (this.state.vectorscope ? 1 : 0);
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
    this.updateButtonLabel();

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  toggleScope(scope: ScopeType): void {
    this.state[scope] = !this.state[scope];
    this.updateButtonLabel();
    this.updateDropdownStates();
    this.emit('scopeToggled', { scope, visible: this.state[scope] });
    this.emit('stateChanged', { ...this.state });
  }

  setScopeVisible(scope: ScopeType, visible: boolean): void {
    if (this.state[scope] !== visible) {
      this.state[scope] = visible;
      this.updateButtonLabel();
      this.updateDropdownStates();
    }
  }

  isScopeVisible(scope: ScopeType): boolean {
    return this.state[scope];
  }

  getState(): ScopesState {
    return { ...this.state };
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
