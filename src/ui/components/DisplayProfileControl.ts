/**
 * DisplayProfileControl - Display color management transfer function selector
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  type DisplayTransferFunction,
  type DisplayColorState,
  DEFAULT_DISPLAY_COLOR_STATE,
  PROFILE_FULL_LABELS,
  PROFILE_CYCLE_ORDER,
  saveDisplayProfile,
  loadDisplayProfile,
  isDisplayStateActive,
} from '../../color/ColorProcessingFacade';
import { getIconSvg } from './shared/Icons';

export interface DisplayProfileControlEvents extends EventMap {
  stateChanged: DisplayColorState;
}

export class DisplayProfileControl extends EventEmitter<DisplayProfileControlEvents> {
  private container: HTMLElement;
  private dropdown: HTMLElement;
  private isDropdownOpen = false;
  private toggleButton: HTMLButtonElement;
  private profileButtons: Map<DisplayTransferFunction, HTMLButtonElement> = new Map();
  private boundHandleReposition: () => void;
  private state: DisplayColorState;

  // Slider elements
  private gammaSlider: HTMLInputElement | null = null;
  private gammaLabel: HTMLElement | null = null;
  private brightnessSlider: HTMLInputElement | null = null;
  private brightnessLabel: HTMLElement | null = null;
  private customGammaSlider: HTMLInputElement | null = null;
  private customGammaLabel: HTMLElement | null = null;
  private customGammaSection: HTMLElement | null = null;

  constructor() {
    super();
    this.boundHandleReposition = () => this.positionDropdown();

    // Load persisted state or use defaults
    this.state = loadDisplayProfile() ?? { ...DEFAULT_DISPLAY_COLOR_STATE };

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'display-profile-control';
    this.container.style.cssText = `position: relative; display: flex; align-items: center;`;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'display-profile-toggle';
    this.toggleButton.dataset.testid = 'display-profile-button';
    this.toggleButton.innerHTML = `${getIconSvg('monitor', 'sm')} <span>Display</span> ${getIconSvg('chevron-down', 'sm')}`;
    this.toggleButton.title = 'Display color profile (Shift+D)';
    this.toggleButton.setAttribute('aria-label', 'Display color profile options');
    this.toggleButton.setAttribute('aria-haspopup', 'menu');
    this.toggleButton.setAttribute('aria-expanded', 'false');
    this.toggleButton.style.cssText = `
      display: flex; align-items: center; gap: 4px;
      padding: 6px 10px; border: 1px solid transparent; border-radius: 4px;
      background: transparent; color: var(--text-muted);
      font-size: 12px; cursor: pointer; transition: all 0.12s ease;
    `;

    this.toggleButton.addEventListener('click', (e) => { e.stopPropagation(); this.toggleDropdown(); });
    this.toggleButton.addEventListener('mouseenter', () => {
      if (!isDisplayStateActive(this.state)) {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      if (!isDisplayStateActive(this.state)) {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.borderColor = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);

    // Create dropdown panel
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'display-profile-dropdown';
    this.dropdown.dataset.testid = 'display-profile-dropdown';
    this.dropdown.setAttribute('role', 'menu');
    this.dropdown.style.cssText = `
      position: fixed; background: var(--bg-secondary);
      border: 1px solid var(--border-primary); border-radius: 4px;
      padding: 8px; min-width: 220px; z-index: 9999;
      display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;

    this.createDropdownContent();
    this.container.appendChild(this.dropdown);

    // Close on outside click
    document.addEventListener('click', this.handleOutsideClick);

    // Initial button state
    this.updateButtonState();
  }

  private createDropdownContent(): void {
    // Transfer function section
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 10px;';

    const label = document.createElement('div');
    label.textContent = 'Transfer Function';
    label.style.cssText = 'color: var(--text-secondary); font-size: 10px; text-transform: uppercase; margin-bottom: 6px;';
    section.appendChild(label);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const profiles: DisplayTransferFunction[] = ['linear', 'srgb', 'rec709', 'gamma2.2', 'gamma2.4', 'custom'];

    for (const profile of profiles) {
      const btn = document.createElement('button');
      btn.dataset.profile = profile;
      btn.dataset.testid = `display-profile-${profile}`;
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', this.state.transferFunction === profile ? 'true' : 'false');
      btn.style.cssText = `
        display: flex; flex-direction: column; align-items: flex-start;
        padding: 6px 8px; border: 1px solid var(--border-secondary); border-radius: 3px;
        background: var(--bg-secondary); color: var(--text-secondary);
        font-size: 11px; cursor: pointer; transition: all 0.1s ease; text-align: left;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = PROFILE_FULL_LABELS[profile];
      labelSpan.style.cssText = 'font-weight: 500; color: var(--text-primary);';
      btn.appendChild(labelSpan);

      btn.addEventListener('click', () => this.setTransferFunction(profile));
      btn.addEventListener('mouseenter', () => {
        if (this.state.transferFunction !== profile) btn.style.background = 'var(--border-primary)';
      });
      btn.addEventListener('mouseleave', () => {
        if (this.state.transferFunction !== profile) btn.style.background = 'var(--bg-secondary)';
      });

      this.profileButtons.set(profile, btn);
      list.appendChild(btn);
    }

    section.appendChild(list);
    this.dropdown.appendChild(section);

    // Custom gamma section (shown only when 'custom' is selected)
    this.customGammaSection = document.createElement('div');
    this.customGammaSection.dataset.testid = 'display-custom-gamma-section';
    this.customGammaSection.style.cssText = 'margin-bottom: 10px; display: none;';
    this.customGammaLabel = document.createElement('div');
    this.customGammaLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;';
    this.customGammaLabel.textContent = `Custom Gamma: ${this.state.customGamma.toFixed(1)}`;
    this.customGammaSlider = document.createElement('input');
    this.customGammaSlider.type = 'range';
    this.customGammaSlider.min = '0.1';
    this.customGammaSlider.max = '10.0';
    this.customGammaSlider.step = '0.1';
    this.customGammaSlider.value = String(this.state.customGamma);
    this.customGammaSlider.style.cssText = 'width: 100%;';
    this.customGammaSlider.addEventListener('input', () => {
      const val = parseFloat(this.customGammaSlider!.value);
      this.state.customGamma = val;
      this.customGammaLabel!.textContent = `Custom Gamma: ${val.toFixed(1)}`;
      this.persistAndEmit();
    });
    this.customGammaSection.appendChild(this.customGammaLabel);
    this.customGammaSection.appendChild(this.customGammaSlider);
    this.dropdown.appendChild(this.customGammaSection);

    // Display gamma slider
    const gammaSection = document.createElement('div');
    gammaSection.style.cssText = 'margin-bottom: 10px; border-top: 1px solid var(--border-secondary); padding-top: 8px;';
    this.gammaLabel = document.createElement('div');
    this.gammaLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;';
    this.gammaLabel.textContent = `Display Gamma: ${this.state.displayGamma.toFixed(1)}`;
    this.gammaSlider = document.createElement('input');
    this.gammaSlider.type = 'range';
    this.gammaSlider.min = '0.1';
    this.gammaSlider.max = '4.0';
    this.gammaSlider.step = '0.1';
    this.gammaSlider.value = String(this.state.displayGamma);
    this.gammaSlider.dataset.testid = 'display-gamma-slider';
    this.gammaSlider.style.cssText = 'width: 100%;';
    this.gammaSlider.addEventListener('input', () => {
      const val = parseFloat(this.gammaSlider!.value);
      this.state.displayGamma = val;
      this.gammaLabel!.textContent = `Display Gamma: ${val.toFixed(1)}`;
      this.persistAndEmit();
    });
    gammaSection.appendChild(this.gammaLabel);
    gammaSection.appendChild(this.gammaSlider);
    this.dropdown.appendChild(gammaSection);

    // Display brightness slider
    const brightnessSection = document.createElement('div');
    brightnessSection.style.cssText = 'margin-bottom: 10px;';
    this.brightnessLabel = document.createElement('div');
    this.brightnessLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;';
    this.brightnessLabel.textContent = `Display Brightness: ${this.state.displayBrightness.toFixed(1)}`;
    this.brightnessSlider = document.createElement('input');
    this.brightnessSlider.type = 'range';
    this.brightnessSlider.min = '0.0';
    this.brightnessSlider.max = '2.0';
    this.brightnessSlider.step = '0.1';
    this.brightnessSlider.value = String(this.state.displayBrightness);
    this.brightnessSlider.dataset.testid = 'display-brightness-slider';
    this.brightnessSlider.style.cssText = 'width: 100%;';
    this.brightnessSlider.addEventListener('input', () => {
      const val = parseFloat(this.brightnessSlider!.value);
      this.state.displayBrightness = val;
      this.brightnessLabel!.textContent = `Display Brightness: ${val.toFixed(1)}`;
      this.persistAndEmit();
    });
    brightnessSection.appendChild(this.brightnessLabel);
    brightnessSection.appendChild(this.brightnessSlider);
    this.dropdown.appendChild(brightnessSection);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.dataset.testid = 'display-profile-reset';
    resetBtn.style.cssText = `
      width: 100%; padding: 4px; border: 1px solid var(--border-secondary);
      border-radius: 3px; background: var(--bg-secondary); color: var(--text-secondary);
      font-size: 10px; cursor: pointer;
    `;
    resetBtn.addEventListener('click', () => this.resetToDefaults());
    this.dropdown.appendChild(resetBtn);

    this.updateProfileButtons();
    this.updateCustomGammaVisibility();
  }

  // --- Methods ---

  setTransferFunction(tf: DisplayTransferFunction): void {
    if (this.state.transferFunction === tf) return;
    this.state.transferFunction = tf;
    this.updateProfileButtons();
    this.updateCustomGammaVisibility();
    this.updateButtonState();
    this.persistAndEmit();
  }

  getState(): DisplayColorState { return { ...this.state }; }

  setState(state: Partial<DisplayColorState>): void {
    let changed = false;
    if (state.transferFunction !== undefined && state.transferFunction !== this.state.transferFunction) {
      this.state.transferFunction = state.transferFunction; changed = true;
    }
    if (state.displayGamma !== undefined && state.displayGamma !== this.state.displayGamma) {
      this.state.displayGamma = state.displayGamma; changed = true;
    }
    if (state.displayBrightness !== undefined && state.displayBrightness !== this.state.displayBrightness) {
      this.state.displayBrightness = state.displayBrightness; changed = true;
    }
    if (state.customGamma !== undefined && state.customGamma !== this.state.customGamma) {
      this.state.customGamma = state.customGamma; changed = true;
    }
    if (changed) {
      this.updateProfileButtons();
      this.updateCustomGammaVisibility();
      this.updateButtonState();
      this.updateSliders();
      this.persistAndEmit();
    }
  }

  resetToDefaults(): void {
    this.state = { ...DEFAULT_DISPLAY_COLOR_STATE };
    this.updateProfileButtons();
    this.updateCustomGammaVisibility();
    this.updateButtonState();
    this.updateSliders();
    this.persistAndEmit();
  }

  cycleProfile(): void {
    const idx = PROFILE_CYCLE_ORDER.indexOf(this.state.transferFunction);
    const next = PROFILE_CYCLE_ORDER[(idx + 1) % PROFILE_CYCLE_ORDER.length]!;
    this.setTransferFunction(next);
  }

  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (shiftKey && key.toLowerCase() === 'd') {
      this.cycleProfile();
      return true;
    }
    return false;
  }

  render(): HTMLElement { return this.container; }

  dispose(): void {
    document.removeEventListener('click', this.handleOutsideClick);
    window.removeEventListener('resize', this.boundHandleReposition);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    this.profileButtons.clear();
  }

  // --- Private helpers ---

  private persistAndEmit(): void {
    saveDisplayProfile(this.state);
    this.emit('stateChanged', { ...this.state });
  }

  private updateSliders(): void {
    if (this.gammaSlider) this.gammaSlider.value = String(this.state.displayGamma);
    if (this.gammaLabel) this.gammaLabel.textContent = `Display Gamma: ${this.state.displayGamma.toFixed(1)}`;
    if (this.brightnessSlider) this.brightnessSlider.value = String(this.state.displayBrightness);
    if (this.brightnessLabel) this.brightnessLabel.textContent = `Display Brightness: ${this.state.displayBrightness.toFixed(1)}`;
    if (this.customGammaSlider) this.customGammaSlider.value = String(this.state.customGamma);
    if (this.customGammaLabel) this.customGammaLabel.textContent = `Custom Gamma: ${this.state.customGamma.toFixed(1)}`;
  }

  private updateCustomGammaVisibility(): void {
    if (this.customGammaSection) {
      this.customGammaSection.style.display = this.state.transferFunction === 'custom' ? 'block' : 'none';
    }
  }

  private updateButtonState(): void {
    if (isDisplayStateActive(this.state)) {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  private updateProfileButtons(): void {
    for (const [key, btn] of this.profileButtons) {
      const isSelected = key === this.state.transferFunction;
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      if (isSelected) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        const labelSpan = btn.querySelector('span') as HTMLSpanElement;
        if (labelSpan) labelSpan.style.color = '#fff';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-secondary)';
        const labelSpan = btn.querySelector('span') as HTMLSpanElement;
        if (labelSpan) labelSpan.style.color = 'var(--text-primary)';
      }
    }
  }

  private toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.toggleButton.setAttribute('aria-expanded', this.isDropdownOpen ? 'true' : 'false');
    if (this.isDropdownOpen) {
      this.dropdown.style.display = 'block';
      this.positionDropdown();
      window.addEventListener('resize', this.boundHandleReposition);
      window.addEventListener('scroll', this.boundHandleReposition, true);
    } else {
      this.dropdown.style.display = 'none';
      window.removeEventListener('resize', this.boundHandleReposition);
      window.removeEventListener('scroll', this.boundHandleReposition, true);
    }
  }

  private positionDropdown(): void {
    const rect = this.toggleButton.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.container.contains(e.target as Node)) {
      if (this.isDropdownOpen) {
        this.isDropdownOpen = false;
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.dropdown.style.display = 'none';
        window.removeEventListener('resize', this.boundHandleReposition);
        window.removeEventListener('scroll', this.boundHandleReposition, true);
      }
    }
  };
}
