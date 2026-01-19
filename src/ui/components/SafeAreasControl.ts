/**
 * SafeAreasControl - Dropdown control for safe areas and guide overlays
 *
 * Features:
 * - Toggle safe areas overlay
 * - Select guide types (title safe, action safe, rule of thirds, etc.)
 * - Aspect ratio guide selection
 * - Guide color and opacity controls
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  SafeAreasOverlay,
  SafeAreasState,
  AspectRatioGuide,
  ASPECT_RATIOS,
} from './SafeAreasOverlay';
import { getIconSvg } from './shared/Icons';

export interface SafeAreasControlEvents extends EventMap {
  stateChanged: SafeAreasState;
}

export class SafeAreasControl extends EventEmitter<SafeAreasControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private overlay: SafeAreasOverlay;
  private isOpen = false;

  // Bound handlers for cleanup
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor(overlay: SafeAreasOverlay) {
    super();
    this.overlay = overlay;

    // Bind handlers
    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'safe-areas-control';
    this.container.dataset.testid = 'safe-areas-control';
    this.container.style.cssText = `
      position: relative;
      display: inline-flex;
    `;

    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'safe-areas-button';
    this.button.title = 'Safe Areas & Guides';
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
      gap: 4px;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('mouseenter', () => {
      if (!this.overlay.isVisible()) {
        this.button.style.background = '#3a3a3a';
        this.button.style.borderColor = '#4a4a4a';
        this.button.style.color = '#ccc';
      }
    });

    this.button.addEventListener('mouseleave', () => {
      if (!this.overlay.isVisible()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = '#999';
      }
    });

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.container.appendChild(this.button);

    // Create dropdown
    this.dropdown = this.createDropdown();

    // Listen to overlay state changes
    this.overlay.on('stateChanged', (state) => {
      this.updateButtonLabel();
      this.updateDropdownState();
      this.emit('stateChanged', state);
    });
  }

  private createDropdown(): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'safe-areas-dropdown';
    dropdown.dataset.testid = 'safe-areas-dropdown';
    dropdown.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 8px 0;
      min-width: 220px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Enable/Disable toggle
    dropdown.appendChild(
      this.createCheckboxItem('enabled', 'Enable Guides', () => this.overlay.toggle())
    );

    dropdown.appendChild(this.createSeparator());

    // Safe areas section
    dropdown.appendChild(this.createSectionLabel('Safe Areas'));
    dropdown.appendChild(
      this.createCheckboxItem('actionSafe', 'Action Safe (90%)', () =>
        this.overlay.toggleActionSafe()
      )
    );
    dropdown.appendChild(
      this.createCheckboxItem('titleSafe', 'Title Safe (80%)', () =>
        this.overlay.toggleTitleSafe()
      )
    );

    dropdown.appendChild(this.createSeparator());

    // Composition guides section
    dropdown.appendChild(this.createSectionLabel('Composition'));
    dropdown.appendChild(
      this.createCheckboxItem('centerCrosshair', 'Center Crosshair', () =>
        this.overlay.toggleCenterCrosshair()
      )
    );
    dropdown.appendChild(
      this.createCheckboxItem('ruleOfThirds', 'Rule of Thirds', () =>
        this.overlay.toggleRuleOfThirds()
      )
    );

    dropdown.appendChild(this.createSeparator());

    // Aspect ratio section
    dropdown.appendChild(this.createSectionLabel('Aspect Ratio'));
    dropdown.appendChild(this.createAspectRatioSelect());

    return dropdown;
  }

  private createSectionLabel(text: string): HTMLElement {
    const label = document.createElement('div');
    label.style.cssText = `
      padding: 4px 12px;
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    label.textContent = text;
    return label;
  }

  private createSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.style.cssText = `
      height: 1px;
      background: #3a3a3a;
      margin: 6px 0;
    `;
    return sep;
  }

  private createCheckboxItem(
    key: keyof SafeAreasState,
    label: string,
    onClick: () => void
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = `safe-areas-item-${key}`;
    item.dataset.testid = `safe-areas-item-${key}`;
    item.style.cssText = `
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: background 0.1s;
    `;

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox-indicator';
    checkbox.style.cssText = `
      width: 14px;
      height: 14px;
      border: 1px solid #555;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s;
    `;

    const text = document.createElement('span');
    text.textContent = label;
    text.style.cssText = `
      color: #ccc;
      font-size: 12px;
    `;

    item.appendChild(checkbox);
    item.appendChild(text);

    item.addEventListener('mouseenter', () => {
      item.style.background = '#3a3a3a';
    });

    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });

    return item;
  }

  private createAspectRatioSelect(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 4px 12px;
    `;

    const select = document.createElement('select');
    select.dataset.testid = 'safe-areas-aspect-ratio';
    select.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: #333;
      border: 1px solid #444;
      border-radius: 4px;
      color: #ccc;
      font-size: 12px;
      cursor: pointer;
    `;

    // Add "None" option
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None';
    select.appendChild(noneOption);

    // Add aspect ratio options
    for (const [key, def] of Object.entries(ASPECT_RATIOS)) {
      if (key === 'custom') continue; // Skip custom for now
      const option = document.createElement('option');
      option.value = key;
      option.textContent = def.label;
      select.appendChild(option);
    }

    select.addEventListener('change', () => {
      const value = select.value as AspectRatioGuide | '';
      this.overlay.setAspectRatio(value || null);
    });

    container.appendChild(select);
    return container;
  }

  private updateButtonLabel(): void {
    const state = this.overlay.getState();
    const isActive = state.enabled;

    let label = 'Guides';
    if (isActive) {
      const activeCount = [
        state.titleSafe,
        state.actionSafe,
        state.centerCrosshair,
        state.ruleOfThirds,
        state.aspectRatio !== null,
      ].filter(Boolean).length;
      if (activeCount > 0) {
        label = `Guides (${activeCount})`;
      }
    }

    this.button.innerHTML = `${getIconSvg('grid', 'sm')}<span>${label}</span><span style="font-size: 8px; margin-left: 2px;">&#9660;</span>`;

    // Update active styling
    if (isActive) {
      this.button.style.background = 'rgba(74, 158, 255, 0.15)';
      this.button.style.borderColor = '#4a9eff';
      this.button.style.color = '#4a9eff';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = '#999';
    }
  }

  private updateDropdownState(): void {
    const state = this.overlay.getState();

    // Update checkboxes
    const updateCheckbox = (key: keyof SafeAreasState, checked: boolean) => {
      const item = this.dropdown.querySelector(`.safe-areas-item-${key}`);
      if (item) {
        const checkbox = item.querySelector('.checkbox-indicator') as HTMLElement;
        if (checkbox) {
          if (checked) {
            checkbox.style.background = '#4a9eff';
            checkbox.style.borderColor = '#4a9eff';
            checkbox.innerHTML = getIconSvg('check', 'sm');
            (checkbox.querySelector('svg') as SVGElement).style.color = '#fff';
          } else {
            checkbox.style.background = 'transparent';
            checkbox.style.borderColor = '#555';
            checkbox.innerHTML = '';
          }
        }
      }
    };

    updateCheckbox('enabled', state.enabled);
    updateCheckbox('titleSafe', state.titleSafe);
    updateCheckbox('actionSafe', state.actionSafe);
    updateCheckbox('centerCrosshair', state.centerCrosshair);
    updateCheckbox('ruleOfThirds', state.ruleOfThirds);

    // Update aspect ratio select
    const select = this.dropdown.querySelector(
      '[data-testid="safe-areas-aspect-ratio"]'
    ) as HTMLSelectElement;
    if (select) {
      select.value = state.aspectRatio || '';
    }
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

    this.positionDropdown();
    this.dropdown.style.display = 'flex';
    this.updateDropdownState();
    this.isOpen = true;

    // Add listeners
    setTimeout(() => {
      document.addEventListener('click', this.boundHandleOutsideClick);
      window.addEventListener('scroll', this.boundHandleReposition, true);
      window.addEventListener('resize', this.boundHandleReposition);
    }, 0);
  }

  private closeDropdown(): void {
    this.dropdown.style.display = 'none';
    this.isOpen = false;

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  private positionDropdown(): void {
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (
      !this.dropdown.contains(e.target as Node) &&
      !this.button.contains(e.target as Node)
    ) {
      this.closeDropdown();
    }
  }

  /**
   * Handle keyboard shortcut
   */
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (key === 'g' && !shiftKey) {
      this.overlay.toggle();
      return true;
    }
    return false;
  }

  /**
   * Get the overlay instance
   */
  getOverlay(): SafeAreasOverlay {
    return this.overlay;
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
