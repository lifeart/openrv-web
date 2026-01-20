/**
 * ThemeControl - UI component for theme selection
 *
 * Features:
 * - Dropdown with Dark/Light/Auto options
 * - Shows current theme mode
 * - Cycles through modes on click
 */

import { getIconSvg } from './shared/Icons';
import { getThemeManager, ThemeMode } from '../../utils/ThemeManager';

export class ThemeControl {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;

  constructor() {
    const themeManager = getThemeManager();
    this.boundHandleOutsideClick = (e) => this.handleOutsideClick(e);

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'theme-control';
    this.container.style.cssText = 'position: relative;';

    // Create toggle button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'theme-control-button';
    this.button.title = 'Theme settings';
    this.button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary, #999);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: var(--theme-transition, all 0.12s ease);
    `;
    this.updateButtonLabel();

    this.button.addEventListener('mouseenter', () => {
      this.button.style.background = 'var(--bg-hover, #333)';
      this.button.style.borderColor = 'var(--border-primary, #555)';
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
      }
    });
    this.button.addEventListener('click', () => this.toggleDropdown());

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.dataset.testid = 'theme-dropdown';
    this.dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: var(--bg-secondary, #252525);
      border: 1px solid var(--border-primary, #444);
      border-radius: 6px;
      padding: 4px;
      min-width: 120px;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    this.populateDropdown();

    this.container.appendChild(this.button);
    this.container.appendChild(this.dropdown);

    // Subscribe to theme changes
    themeManager.on('modeChanged', () => this.updateButtonLabel());
    themeManager.on('themeChanged', () => this.updateDropdownStates());
  }

  /**
   * Render the component
   */
  render(): HTMLElement {
    return this.container;
  }

  /**
   * Get the current theme icon based on mode
   */
  private getThemeIcon(mode: ThemeMode): string {
    switch (mode) {
      case 'dark':
        return getIconSvg('moon', 'sm');
      case 'light':
        return getIconSvg('sun', 'sm');
      case 'auto':
        return getIconSvg('settings', 'sm');
    }
  }

  /**
   * Get label for theme mode
   */
  private getModeLabel(mode: ThemeMode): string {
    switch (mode) {
      case 'dark':
        return 'Dark';
      case 'light':
        return 'Light';
      case 'auto':
        return 'Auto';
    }
  }

  /**
   * Update button label to show current mode
   */
  private updateButtonLabel(): void {
    const mode = getThemeManager().getMode();
    this.button.innerHTML = `${this.getThemeIcon(mode)}<span>${this.getModeLabel(mode)}</span>`;
  }

  /**
   * Populate dropdown with theme options
   */
  private populateDropdown(): void {
    this.dropdown.innerHTML = '';

    const modes: ThemeMode[] = ['auto', 'dark', 'light'];
    const currentMode = getThemeManager().getMode();

    modes.forEach(mode => {
      const option = document.createElement('button');
      option.dataset.testid = `theme-option-${mode}`;
      option.dataset.themeMode = mode;
      option.style.cssText = `
        width: 100%;
        background: transparent;
        border: none;
        color: var(--text-primary, #ccc);
        padding: 8px 12px;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: var(--theme-transition, background 0.12s ease);
      `;

      const isActive = mode === currentMode;
      option.style.background = isActive ? 'var(--accent-primary, #4a9eff)22' : 'transparent';
      option.style.color = isActive ? 'var(--accent-primary, #4a9eff)' : 'var(--text-primary, #ccc)';

      option.innerHTML = `${this.getThemeIcon(mode)}<span>${this.getModeLabel(mode)}</span>`;

      option.addEventListener('mouseenter', () => {
        if (mode !== currentMode) {
          option.style.background = 'var(--bg-hover, #333)';
        }
      });
      option.addEventListener('mouseleave', () => {
        const isNowActive = mode === getThemeManager().getMode();
        option.style.background = isNowActive ? 'var(--accent-primary, #4a9eff)22' : 'transparent';
      });
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        getThemeManager().setMode(mode);
        this.closeDropdown();
      });

      this.dropdown.appendChild(option);
    });

    // Add divider
    const divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: var(--border-secondary, #333); margin: 4px 0;';
    this.dropdown.appendChild(divider);

    // Add current resolved theme info
    const info = document.createElement('div');
    info.className = 'theme-info';
    info.style.cssText = `
      padding: 6px 12px;
      font-size: 10px;
      color: var(--text-muted, #666);
    `;
    this.updateThemeInfo(info);
    this.dropdown.appendChild(info);
  }

  /**
   * Update theme info display
   */
  private updateThemeInfo(info: HTMLElement): void {
    const resolved = getThemeManager().getResolvedTheme();
    info.textContent = `Current: ${resolved === 'dark' ? 'Dark' : 'Light'} theme`;
  }

  /**
   * Update dropdown states after theme change
   */
  private updateDropdownStates(): void {
    const currentMode = getThemeManager().getMode();
    const options = this.dropdown.querySelectorAll('[data-theme-mode]');

    options.forEach(option => {
      const mode = (option as HTMLElement).dataset.themeMode as ThemeMode;
      const isActive = mode === currentMode;
      (option as HTMLElement).style.background = isActive ? 'var(--accent-primary, #4a9eff)22' : 'transparent';
      (option as HTMLElement).style.color = isActive ? 'var(--accent-primary, #4a9eff)' : 'var(--text-primary, #ccc)';
    });

    const info = this.dropdown.querySelector('.theme-info') as HTMLElement;
    if (info) {
      this.updateThemeInfo(info);
    }
  }

  /**
   * Toggle dropdown visibility
   */
  private toggleDropdown(): void {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  /**
   * Open dropdown
   */
  private openDropdown(): void {
    this.isOpen = true;
    this.dropdown.style.display = 'block';
    this.button.style.background = 'var(--bg-hover, #333)';
    this.button.style.borderColor = 'var(--border-primary, #555)';
    this.updateDropdownStates();
    document.addEventListener('mousedown', this.boundHandleOutsideClick);
  }

  /**
   * Close dropdown
   */
  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.button.style.background = 'transparent';
    this.button.style.borderColor = 'transparent';
    document.removeEventListener('mousedown', this.boundHandleOutsideClick);
  }

  /**
   * Handle outside click
   */
  private handleOutsideClick(e: MouseEvent): void {
    if (!this.container.contains(e.target as Node)) {
      this.closeDropdown();
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    document.removeEventListener('mousedown', this.boundHandleOutsideClick);
    this.container.remove();
  }
}
