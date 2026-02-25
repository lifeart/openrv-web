/**
 * ThemeControl - UI component for theme selection
 *
 * Features:
 * - Dropdown with Dark/Light/Auto options
 * - Shows current theme mode
 * - Keyboard navigation via shared DropdownMenu (ArrowUp/Down, Enter, Escape)
 * - aria-haspopup/aria-expanded for accessibility
 */

import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { DropdownMenu } from './shared/DropdownMenu';
import { getThemeManager, ThemeMode } from '../../utils/ui/ThemeManager';

export class ThemeControl {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdownMenu: DropdownMenu;
  private boundOnModeChanged: () => void;
  private boundOnThemeChanged: () => void;

  constructor() {
    const themeManager = getThemeManager();
    this.boundOnModeChanged = () => this.updateButtonLabel();
    this.boundOnThemeChanged = () => this.updateSelectedValue();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'theme-control';
    this.container.style.cssText = 'position: relative;';

    // Create toggle button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'theme-control-button';
    this.button.title = 'Theme settings';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
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
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('pointerenter', () => {
      this.button.style.background = 'var(--bg-hover, #333)';
      this.button.style.borderColor = 'var(--border-primary, #555)';
    });
    this.button.addEventListener('pointerleave', () => {
      if (!this.dropdownMenu.isVisible()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
      }
    });
    this.button.addEventListener('click', () => this.toggleDropdown());

    // Apply A11Y focus handling
    applyA11yFocus(this.button);

    // Create shared DropdownMenu
    this.dropdownMenu = new DropdownMenu({
      minWidth: '120px',
      align: 'right',
      closeOthers: true,
      onSelect: (value) => {
        getThemeManager().setMode(value as ThemeMode);
      },
      onClose: () => {
        this.button.setAttribute('aria-expanded', 'false');
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
      },
    });

    this.populateDropdown();

    this.container.appendChild(this.button);

    // Subscribe to theme changes
    themeManager.on('modeChanged', this.boundOnModeChanged);
    themeManager.on('themeChanged', this.boundOnThemeChanged);
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
    this.button.innerHTML = this.getThemeIcon(mode);
    this.button.setAttribute('aria-label', `Theme: ${this.getModeLabel(mode)}`);
  }

  /**
   * Populate dropdown with theme options
   */
  private populateDropdown(): void {
    const modes: ThemeMode[] = ['auto', 'dark', 'light'];

    this.dropdownMenu.setItems(
      modes.map(mode => ({
        value: mode,
        label: this.getModeLabel(mode),
      }))
    );

    this.updateSelectedValue();
  }

  /**
   * Update selected value after theme change
   */
  private updateSelectedValue(): void {
    const currentMode = getThemeManager().getMode();
    this.dropdownMenu.setSelectedValue(currentMode);
  }

  /**
   * Toggle dropdown visibility
   */
  private toggleDropdown(): void {
    if (this.dropdownMenu.isVisible()) {
      this.dropdownMenu.close();
    } else {
      this.updateSelectedValue();
      this.dropdownMenu.open(this.button);
      this.button.setAttribute('aria-expanded', 'true');
      this.button.style.background = 'var(--bg-hover, #333)';
      this.button.style.borderColor = 'var(--border-primary, #555)';
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.dropdownMenu.dispose();

    // Clean up theme change listeners
    const themeManager = getThemeManager();
    themeManager.off('modeChanged', this.boundOnModeChanged);
    themeManager.off('themeChanged', this.boundOnThemeChanged);

    this.container.remove();
  }
}
