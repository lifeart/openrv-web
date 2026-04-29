/**
 * SafeAreasControl - Dropdown control for safe areas and guide overlays
 *
 * Features:
 * - Toggle safe areas overlay
 * - Select guide types (title safe, action safe, rule of thirds, etc.)
 * - Aspect ratio guide selection
 * - Guide color and opacity controls
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { type SafeAreasOverlay, type SafeAreasState, type AspectRatioGuide, ASPECT_RATIOS } from './SafeAreasOverlay';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { SHADOWS } from './shared/theme';
import { outsideClickRegistry, type OutsideClickDeregister } from '../../utils/ui/OutsideClickRegistry';

export interface SafeAreasControlEvents extends EventMap {
  stateChanged: SafeAreasState;
}

export class SafeAreasControl extends EventEmitter<SafeAreasControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private overlay: SafeAreasOverlay;
  private isOpen = false;
  private unsubscribers: (() => void)[] = [];

  // Bound handlers for cleanup
  private boundHandleReposition: () => void;
  private deregisterDismiss: OutsideClickDeregister | null = null;

  constructor(overlay: SafeAreasOverlay) {
    super();
    this.overlay = overlay;

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
    this.button.dataset.testid = 'safe-areas-control-button';
    this.button.title = 'Safe Areas & Guides';
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
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('pointerenter', () => {
      if (!this.overlay.isVisible()) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });

    this.button.addEventListener('pointerleave', () => {
      if (!this.overlay.isVisible()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.button);

    this.container.appendChild(this.button);

    // Create dropdown
    this.dropdown = this.createDropdown();

    // Listen to overlay state changes
    this.unsubscribers.push(
      this.overlay.on('stateChanged', (state) => {
        this.updateButtonLabel();
        this.updateDropdownState();
        this.emit('stateChanged', state);
      }),
    );
  }

  private createDropdown(): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'safe-areas-dropdown';
    dropdown.dataset.testid = 'safe-areas-dropdown';
    dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 8px 0;
      min-width: 220px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      box-shadow: ${SHADOWS.dropdown};
    `;

    // Enable/Disable toggle
    dropdown.appendChild(this.createCheckboxItem('enabled', 'Enable Guides', () => this.overlay.toggle()));

    dropdown.appendChild(this.createSeparator());

    // Safe areas section
    dropdown.appendChild(this.createSectionLabel('Safe Areas'));
    dropdown.appendChild(
      this.createCheckboxItem('actionSafe', 'Action Safe (93%)', () => this.overlay.toggleActionSafe()),
    );
    dropdown.appendChild(
      this.createCheckboxItem('titleSafe', 'Title Safe (90%)', () => this.overlay.toggleTitleSafe()),
    );
    dropdown.appendChild(
      this.createCheckboxItem('customSafeArea', 'Custom Safe Area', () => this.overlay.toggleCustomSafeArea()),
    );
    dropdown.appendChild(this.createCustomSafeAreaPercentageInput());

    dropdown.appendChild(this.createSeparator());

    // Composition guides section
    dropdown.appendChild(this.createSectionLabel('Composition'));
    dropdown.appendChild(
      this.createCheckboxItem('centerCrosshair', 'Center Crosshair', () => this.overlay.toggleCenterCrosshair()),
    );
    dropdown.appendChild(
      this.createCheckboxItem('ruleOfThirds', 'Rule of Thirds', () => this.overlay.toggleRuleOfThirds()),
    );

    dropdown.appendChild(this.createSeparator());

    // Aspect ratio section
    dropdown.appendChild(this.createSectionLabel('Aspect Ratio'));
    dropdown.appendChild(this.createAspectRatioSelect());
    dropdown.appendChild(this.createCustomAspectRatioInput());

    dropdown.appendChild(this.createSeparator());

    // Appearance section
    dropdown.appendChild(this.createSectionLabel('Appearance'));
    dropdown.appendChild(this.createGuideColorInput());
    dropdown.appendChild(this.createGuideOpacitySlider());

    return dropdown;
  }

  private createSectionLabel(text: string): HTMLElement {
    const label = document.createElement('div');
    label.style.cssText = `
      padding: 4px 12px;
      font-size: 10px;
      color: var(--text-muted);
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
      background: var(--bg-hover);
      margin: 6px 0;
    `;
    return sep;
  }

  private createCheckboxItem(key: keyof SafeAreasState, label: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = `safe-areas-item-${key}`;
    item.dataset.testid = `safe-areas-item-${key}`;
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'checkbox');
    item.setAttribute('aria-checked', 'false');
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
      border: 1px solid var(--border-secondary);
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s;
    `;

    const text = document.createElement('span');
    text.textContent = label;
    text.style.cssText = `
      color: var(--text-primary);
      font-size: 12px;
    `;

    item.appendChild(checkbox);
    item.appendChild(text);

    item.addEventListener('pointerenter', () => {
      item.style.background = 'var(--bg-hover)';
    });

    item.addEventListener('pointerleave', () => {
      item.style.background = 'transparent';
    });

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }
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
      background: var(--bg-hover);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      color: var(--text-primary);
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

  private createCustomAspectRatioInput(): HTMLElement {
    const container = document.createElement('div');
    container.dataset.testid = 'safe-areas-custom-aspect-container';
    container.style.cssText = `
      padding: 4px 12px;
      display: none;
      flex-direction: column;
      gap: 4px;
    `;

    const label = document.createElement('label');
    label.textContent = 'Custom Ratio';
    label.style.cssText = `
      color: var(--text-muted);
      font-size: 11px;
    `;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.max = '10';
    input.step = '0.01';
    input.value = this.overlay.getCustomAspectRatio().toFixed(2);
    input.dataset.testid = 'safe-areas-custom-aspect';
    input.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: var(--bg-hover);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
    `;
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      const next = Number.parseFloat(input.value);
      if (!Number.isFinite(next) || next <= 0) return;
      this.overlay.setCustomAspectRatio(next);
    });

    container.appendChild(label);
    container.appendChild(input);
    return container;
  }

  private createCustomSafeAreaPercentageInput(): HTMLElement {
    const container = document.createElement('div');
    container.dataset.testid = 'safe-areas-custom-percentage-container';
    container.style.cssText = `
      padding: 4px 12px;
      display: none;
      flex-direction: column;
      gap: 4px;
    `;

    const label = document.createElement('label');
    label.textContent = 'Safe Area %';
    label.style.cssText = `
      color: var(--text-muted);
      font-size: 11px;
    `;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '99';
    input.step = '1';
    input.value = String(this.overlay.getState().customSafeAreaPercentage);
    input.dataset.testid = 'safe-areas-custom-percentage';
    input.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: var(--bg-hover);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
    `;
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      const next = Number.parseInt(input.value, 10);
      if (!Number.isFinite(next) || next < 1 || next > 99) return;
      this.overlay.setCustomSafeAreaPercentage(next);
    });

    container.appendChild(label);
    container.appendChild(input);
    return container;
  }

  private createGuideColorInput(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 4px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `;

    const label = document.createElement('label');
    label.textContent = 'Guide Color';
    label.style.cssText = `
      color: var(--text-primary);
      font-size: 12px;
    `;

    const input = document.createElement('input');
    input.type = 'color';
    input.value = this.overlay.getState().guideColor;
    input.dataset.testid = 'safe-areas-guide-color';
    input.style.cssText = `
      width: 36px;
      height: 24px;
      background: transparent;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
    `;
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      this.overlay.setGuideColor(input.value);
    });

    container.appendChild(label);
    container.appendChild(input);
    return container;
  }

  private createGuideOpacitySlider(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 4px 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `;

    const label = document.createElement('span');
    label.textContent = 'Guide Opacity';
    label.style.cssText = `
      color: var(--text-primary);
      font-size: 12px;
    `;

    const value = document.createElement('span');
    value.dataset.testid = 'safe-areas-guide-opacity-value';
    value.style.cssText = `
      color: var(--text-muted);
      font-size: 11px;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '5';
    slider.dataset.testid = 'safe-areas-guide-opacity';
    slider.style.cssText = `
      width: 100%;
      cursor: pointer;
    `;
    slider.addEventListener('click', (e) => e.stopPropagation());
    slider.addEventListener('input', () => {
      const next = Number(slider.value) / 100;
      this.overlay.setGuideOpacity(next);
      value.textContent = `${slider.value}%`;
    });

    labelRow.appendChild(label);
    labelRow.appendChild(value);
    container.appendChild(labelRow);
    container.appendChild(slider);
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
        state.customSafeArea,
        state.centerCrosshair,
        state.ruleOfThirds,
        state.aspectRatio !== null,
      ].filter(Boolean).length;
      if (activeCount > 0) {
        label = `Guides (${activeCount})`;
      }
    }

    this.button.innerHTML = `${getIconSvg('grid', 'sm')}<span>${label}</span><span style="margin-left: 2px;">${getIconSvg('chevron-down', 'sm')}</span>`;

    // Update active styling
    if (isActive) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  private updateDropdownState(): void {
    const state = this.overlay.getState();

    // Update checkboxes
    const updateCheckbox = (key: keyof SafeAreasState, checked: boolean) => {
      const item = this.dropdown.querySelector(`.safe-areas-item-${key}`) as HTMLElement;
      if (item) {
        item.setAttribute('aria-checked', String(checked));
        const checkbox = item.querySelector('.checkbox-indicator') as HTMLElement;
        if (checkbox) {
          if (checked) {
            checkbox.style.background = 'var(--accent-primary)';
            checkbox.style.borderColor = 'var(--accent-primary)';
            checkbox.innerHTML = getIconSvg('check', 'sm');
            (checkbox.querySelector('svg') as SVGElement).style.color = 'var(--text-on-accent)';
          } else {
            checkbox.style.background = 'transparent';
            checkbox.style.borderColor = 'var(--border-secondary)';
            checkbox.innerHTML = '';
          }
        }
      }
    };

    updateCheckbox('enabled', state.enabled);
    updateCheckbox('titleSafe', state.titleSafe);
    updateCheckbox('actionSafe', state.actionSafe);
    updateCheckbox('customSafeArea', state.customSafeArea);
    updateCheckbox('centerCrosshair', state.centerCrosshair);
    updateCheckbox('ruleOfThirds', state.ruleOfThirds);

    // Update custom safe area percentage input visibility
    const customPercentageContainer = this.dropdown.querySelector(
      '[data-testid="safe-areas-custom-percentage-container"]',
    ) as HTMLElement;
    const customPercentageInput = this.dropdown.querySelector(
      '[data-testid="safe-areas-custom-percentage"]',
    ) as HTMLInputElement;
    if (customPercentageContainer && customPercentageInput) {
      customPercentageContainer.style.display = state.customSafeArea ? 'flex' : 'none';
      customPercentageInput.value = String(state.customSafeAreaPercentage);
    }

    // Update aspect ratio select
    const select = this.dropdown.querySelector('[data-testid="safe-areas-aspect-ratio"]') as HTMLSelectElement;
    if (select) {
      select.value = state.aspectRatio || '';
    }

    const customContainer = this.dropdown.querySelector(
      '[data-testid="safe-areas-custom-aspect-container"]',
    ) as HTMLElement;
    const customInput = this.dropdown.querySelector('[data-testid="safe-areas-custom-aspect"]') as HTMLInputElement;
    if (customContainer && customInput) {
      customContainer.style.display = state.aspectRatio === 'custom' ? 'flex' : 'none';
      customInput.value = this.overlay.getCustomAspectRatio().toFixed(2);
    }

    const colorInput = this.dropdown.querySelector('[data-testid="safe-areas-guide-color"]') as HTMLInputElement;
    if (colorInput) {
      colorInput.value = state.guideColor;
    }

    const opacitySlider = this.dropdown.querySelector('[data-testid="safe-areas-guide-opacity"]') as HTMLInputElement;
    const opacityValue = this.dropdown.querySelector('[data-testid="safe-areas-guide-opacity-value"]') as HTMLElement;
    if (opacitySlider && opacityValue) {
      opacitySlider.value = String(Math.round(state.guideOpacity * 100));
      opacityValue.textContent = `${opacitySlider.value}%`;
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

    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [this.container, this.dropdown],
      onDismiss: () => this.closeDropdown(),
      dismissOn: 'click',
    });
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.dropdown.style.display = 'none';
    this.isOpen = false;

    this.deregisterDismiss?.();
    this.deregisterDismiss = null;
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  private positionDropdown(): void {
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
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
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}
