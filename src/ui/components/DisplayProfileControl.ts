/**
 * DisplayProfileControl - Display color management UI component
 *
 * Provides a dropdown panel for selecting display profiles and adjusting
 * display gamma and brightness. This is the final-stage display transform
 * applied after all content-level color corrections.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  DisplayColorState,
  DisplayTransferFunction,
  DEFAULT_DISPLAY_COLOR_STATE,
  PROFILE_LABELS,
  PROFILE_CYCLE_ORDER,
  isDisplayStateActive,
  saveDisplayProfile,
  loadDisplayProfile,
} from '../../color/DisplayTransfer';
import {
  detectBrowserColorSpace,
  gamutLabel,
  colorSpaceLabel,
  BrowserColorSpaceInfo,
} from '../../color/BrowserColorSpace';
import { getIconSvg } from './shared/Icons';

/**
 * DisplayProfileControl events
 */
export interface DisplayProfileControlEvents extends EventMap {
  displayStateChanged: DisplayColorState;
  visibilityChanged: boolean;
}

/**
 * Profile definition for the radio list
 */
interface ProfileOption {
  id: DisplayTransferFunction;
  label: string;
  testId: string;
}

const PROFILE_OPTIONS: ProfileOption[] = [
  { id: 'linear', label: 'Linear (Bypass)', testId: 'display-profile-linear' },
  { id: 'srgb', label: 'sRGB (IEC 61966-2-1)', testId: 'display-profile-srgb' },
  { id: 'rec709', label: 'Rec. 709 OETF', testId: 'display-profile-rec709' },
  { id: 'gamma2.2', label: 'Gamma 2.2', testId: 'display-profile-gamma22' },
  { id: 'gamma2.4', label: 'Gamma 2.4', testId: 'display-profile-gamma24' },
  { id: 'custom', label: 'Custom Gamma', testId: 'display-profile-custom' },
];

/**
 * Display Profile Control UI Component
 */
export class DisplayProfileControl extends EventEmitter<DisplayProfileControlEvents> {
  private container: HTMLElement;
  private panel: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private isExpanded = false;
  private disposed = false;

  private state: DisplayColorState;
  private browserInfo: BrowserColorSpaceInfo;

  // DOM references for updating
  private profileRadios: Map<DisplayTransferFunction, HTMLElement> = new Map();
  private gammaSlider: HTMLInputElement | null = null;
  private gammaValueLabel: HTMLSpanElement | null = null;
  private brightnessSlider: HTMLInputElement | null = null;
  private brightnessValueLabel: HTMLSpanElement | null = null;
  private detectedColorSpaceLabel: HTMLSpanElement | null = null;
  private detectedGamutLabel: HTMLSpanElement | null = null;

  // Bound handlers for cleanup
  private boundHandleOutsideClick: (e: MouseEvent) => void;

  constructor() {
    super();

    // Load persisted state or use defaults
    const persisted = loadDisplayProfile();
    this.state = persisted ? { ...DEFAULT_DISPLAY_COLOR_STATE, ...persisted } : { ...DEFAULT_DISPLAY_COLOR_STATE };

    // Detect browser capabilities
    this.browserInfo = detectBrowserColorSpace();

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'display-profile-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.dataset.testid = 'display-profile-button';
    this.toggleButton.title = 'Display profile (Shift+D)';
    this.toggleButton.setAttribute('aria-label', 'Display profile');
    this.toggleButton.style.cssText = `
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
      outline: none;
    `;

    this.updateButtonContent();
    this.toggleButton.addEventListener('click', () => this.toggle());
    this.toggleButton.addEventListener('mouseenter', () => {
      if (!this.isExpanded) {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.isExpanded) {
        this.updateButtonStyle();
      }
    });
    this.container.appendChild(this.toggleButton);

    // Create dropdown panel
    this.panel = document.createElement('div');
    this.panel.className = 'display-profile-panel';
    this.panel.dataset.testid = 'display-profile-dropdown';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Display Profile Settings');
    this.panel.setAttribute('aria-modal', 'false');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      width: 280px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.buildPanel();
    this.updateButtonStyle();
    this.updateUIFromState();

    // Outside click handler
    this.boundHandleOutsideClick = (e: MouseEvent) => {
      if (
        this.isExpanded &&
        !this.container.contains(e.target as Node) &&
        !this.panel.contains(e.target as Node)
      ) {
        this.hide();
      }
    };
    document.addEventListener('click', this.boundHandleOutsideClick);
  }

  // ==========================================================================
  // Panel Build
  // ==========================================================================

  private buildPanel(): void {
    // Profile section
    const profileSection = this.createSection('Display Profile', 'display-profile-section');
    const radioGroup = document.createElement('div');
    radioGroup.setAttribute('role', 'radiogroup');
    radioGroup.setAttribute('aria-label', 'Display transfer function');
    radioGroup.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    for (const opt of PROFILE_OPTIONS) {
      const row = this.createProfileRow(opt);
      radioGroup.appendChild(row);
    }
    profileSection.appendChild(radioGroup);
    this.panel.appendChild(profileSection);

    // Gamma section
    const gammaSection = this.createSection('Display Gamma Override', 'display-gamma-section');
    const { slider: gSlider, valueLabel: gValue } = this.createSlider(
      'display-gamma-slider',
      'display-gamma-value',
      0.1,
      4.0,
      0.01,
      this.state.displayGamma,
      (v) => {
        this.state.displayGamma = v;
        this.emitChange();
      },
      'Display gamma override',
    );
    this.gammaSlider = gSlider;
    this.gammaValueLabel = gValue;
    gammaSection.appendChild(this.createSliderRow(gSlider, gValue));
    this.panel.appendChild(gammaSection);

    // Brightness section
    const brightnessSection = this.createSection('Display Brightness', 'display-brightness-section');
    const { slider: bSlider, valueLabel: bValue } = this.createSlider(
      'display-brightness-slider',
      'display-brightness-value',
      0.0,
      2.0,
      0.01,
      this.state.displayBrightness,
      (v) => {
        this.state.displayBrightness = v;
        this.emitChange();
      },
      'Display brightness',
    );
    this.brightnessSlider = bSlider;
    this.brightnessValueLabel = bValue;
    brightnessSection.appendChild(this.createSliderRow(bSlider, bValue));
    this.panel.appendChild(brightnessSection);

    // Browser color space info
    const infoSection = this.createSection('Detected Display', 'display-colorspace-info');

    const csRow = document.createElement('div');
    csRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); padding: 2px 0;';
    const csLabel = document.createElement('span');
    csLabel.textContent = 'Color Space:';
    this.detectedColorSpaceLabel = document.createElement('span');
    this.detectedColorSpaceLabel.dataset.testid = 'display-detected-colorspace';
    this.detectedColorSpaceLabel.textContent = colorSpaceLabel(this.browserInfo.colorSpace);
    csRow.appendChild(csLabel);
    csRow.appendChild(this.detectedColorSpaceLabel);
    infoSection.appendChild(csRow);

    const gamutRow = document.createElement('div');
    gamutRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); padding: 2px 0;';
    const gamutLabelEl = document.createElement('span');
    gamutLabelEl.textContent = 'Gamut:';
    this.detectedGamutLabel = document.createElement('span');
    this.detectedGamutLabel.dataset.testid = 'display-detected-gamut';
    this.detectedGamutLabel.textContent = gamutLabel(this.browserInfo.gamut);
    gamutRow.appendChild(gamutLabelEl);
    gamutRow.appendChild(this.detectedGamutLabel);
    infoSection.appendChild(gamutRow);

    this.panel.appendChild(infoSection);

    // Reset button
    const resetButton = document.createElement('button');
    resetButton.dataset.testid = 'display-profile-reset';
    resetButton.textContent = 'Reset';
    resetButton.style.cssText = `
      width: 100%;
      padding: 6px 0;
      margin-top: 8px;
      background: transparent;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
    `;
    resetButton.addEventListener('mouseenter', () => {
      resetButton.style.background = 'var(--bg-hover)';
      resetButton.style.color = 'var(--text-primary)';
    });
    resetButton.addEventListener('mouseleave', () => {
      resetButton.style.background = 'transparent';
      resetButton.style.color = 'var(--text-muted)';
    });
    resetButton.addEventListener('click', () => this.reset());
    this.panel.appendChild(resetButton);
  }

  private createSection(title: string, testId?: string): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 10px;';
    if (testId) {
      section.dataset.testid = testId;
    }
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;';
    section.appendChild(heading);
    return section;
  }

  private createProfileRow(opt: ProfileOption): HTMLElement {
    const row = document.createElement('div');
    row.dataset.testid = opt.testId;
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', String(this.state.transferFunction === opt.id));
    row.setAttribute('tabindex', '0');
    row.style.cssText = `
      display: flex;
      align-items: center;
      padding: 5px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-primary);
      transition: background 0.1s;
    `;

    if (this.state.transferFunction === opt.id) {
      row.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    }

    const indicator = document.createElement('span');
    indicator.style.cssText = `
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid var(--text-muted);
      margin-right: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    `;
    if (this.state.transferFunction === opt.id) {
      indicator.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent-primary);display:block;"></span>';
      indicator.style.borderColor = 'var(--accent-primary)';
    }

    const label = document.createElement('span');
    label.textContent = opt.label;

    row.appendChild(indicator);
    row.appendChild(label);

    row.addEventListener('click', () => {
      this.setTransferFunction(opt.id);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.setTransferFunction(opt.id);
      }
    });
    row.addEventListener('mouseenter', () => {
      if (this.state.transferFunction !== opt.id) {
        row.style.background = 'var(--bg-hover)';
      }
    });
    row.addEventListener('mouseleave', () => {
      if (this.state.transferFunction !== opt.id) {
        row.style.background = 'transparent';
      } else {
        row.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      }
    });

    this.profileRadios.set(opt.id, row);
    return row;
  }

  private createSlider(
    sliderId: string,
    valueId: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    onChange: (value: number) => void,
    ariaLabel?: string,
  ): { slider: HTMLInputElement; valueLabel: HTMLSpanElement } {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initial);
    slider.dataset.testid = sliderId;
    slider.setAttribute('role', 'slider');
    slider.setAttribute('aria-valuemin', String(min));
    slider.setAttribute('aria-valuemax', String(max));
    slider.setAttribute('aria-valuenow', String(initial));
    if (ariaLabel) slider.setAttribute('aria-label', ariaLabel);
    slider.style.cssText = 'flex: 1; cursor: pointer;';

    const valueLabel = document.createElement('span');
    valueLabel.dataset.testid = valueId;
    valueLabel.textContent = initial.toFixed(2);
    valueLabel.style.cssText = 'min-width: 36px; text-align: right; font-size: 11px; font-family: monospace; color: var(--text-primary);';

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valueLabel.textContent = v.toFixed(2);
      slider.setAttribute('aria-valuenow', String(v));
      onChange(v);
    });

    // Double-click to reset
    slider.addEventListener('dblclick', () => {
      const defaultVal = 1.0;
      slider.value = String(defaultVal);
      valueLabel.textContent = defaultVal.toFixed(2);
      slider.setAttribute('aria-valuenow', String(defaultVal));
      onChange(defaultVal);
    });

    return { slider, valueLabel };
  }

  private createSliderRow(slider: HTMLInputElement, valueLabel: HTMLSpanElement): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    row.appendChild(slider);
    row.appendChild(valueLabel);
    return row;
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  getState(): DisplayColorState {
    return { ...this.state };
  }

  setState(partial: Partial<DisplayColorState>): void {
    this.state = { ...this.state, ...partial };
    this.updateUIFromState();
    this.updateButtonStyle();
    this.updateButtonContent();
    saveDisplayProfile(this.state);
    this.emit('displayStateChanged', this.getState());
  }

  setTransferFunction(tf: DisplayTransferFunction): void {
    if (this.state.transferFunction === tf) return;
    this.setState({ transferFunction: tf });
  }

  setDisplayGamma(value: number): void {
    const clamped = Math.min(4.0, Math.max(0.1, value));
    this.setState({ displayGamma: clamped });
  }

  setDisplayBrightness(value: number): void {
    const clamped = Math.min(2.0, Math.max(0.0, value));
    this.setState({ displayBrightness: clamped });
  }

  reset(): void {
    this.state = { ...DEFAULT_DISPLAY_COLOR_STATE };
    this.updateUIFromState();
    this.updateButtonStyle();
    this.updateButtonContent();
    saveDisplayProfile(this.state);
    this.emit('displayStateChanged', this.getState());
  }

  // ==========================================================================
  // UI Updates
  // ==========================================================================

  private updateUIFromState(): void {
    // Update profile radio buttons
    for (const [id, row] of this.profileRadios) {
      const isActive = this.state.transferFunction === id;
      row.setAttribute('aria-checked', String(isActive));
      row.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
      const indicator = row.querySelector('span') as HTMLSpanElement;
      if (indicator) {
        if (isActive) {
          indicator.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent-primary);display:block;"></span>';
          indicator.style.borderColor = 'var(--accent-primary)';
        } else {
          indicator.innerHTML = '';
          indicator.style.borderColor = 'var(--text-muted)';
        }
      }
    }

    // Update sliders
    if (this.gammaSlider) {
      this.gammaSlider.value = String(this.state.displayGamma);
      this.gammaSlider.setAttribute('aria-valuenow', String(this.state.displayGamma));
    }
    if (this.gammaValueLabel) {
      this.gammaValueLabel.textContent = this.state.displayGamma.toFixed(2);
    }
    if (this.brightnessSlider) {
      this.brightnessSlider.value = String(this.state.displayBrightness);
      this.brightnessSlider.setAttribute('aria-valuenow', String(this.state.displayBrightness));
    }
    if (this.brightnessValueLabel) {
      this.brightnessValueLabel.textContent = this.state.displayBrightness.toFixed(2);
    }
  }

  private updateButtonContent(): void {
    const label = PROFILE_LABELS[this.state.transferFunction] ?? 'sRGB';
    this.toggleButton.innerHTML = `${getIconSvg('monitor', 'sm')}<span style="margin-left: 6px;">${label}</span>`;
  }

  private updateButtonStyle(): void {
    const active = isDisplayStateActive(this.state);
    if (active) {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  private emitChange(): void {
    this.updateButtonStyle();
    this.updateButtonContent();
    saveDisplayProfile(this.state);
    this.emit('displayStateChanged', this.getState());
  }

  // ==========================================================================
  // Toggle / Show / Hide
  // ==========================================================================

  toggle(): void {
    if (this.isExpanded) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (this.isExpanded) return;
    this.isExpanded = true;

    // Append panel to body if not already there
    if (!this.panel.parentElement) {
      document.body.appendChild(this.panel);
    }

    // Position below button
    const rect = this.toggleButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(4, rect.left)}px`;
    this.panel.style.display = 'block';

    this.updateButtonStyle();
    this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    this.toggleButton.style.borderColor = 'var(--accent-primary)';
    this.toggleButton.style.color = 'var(--accent-primary)';

    this.emit('visibilityChanged', true);
  }

  hide(): void {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    this.panel.style.display = 'none';
    this.updateButtonStyle();
    this.emit('visibilityChanged', false);
  }

  // ==========================================================================
  // Keyboard Handling
  // ==========================================================================

  handleKeyDown(event: KeyboardEvent): void {
    // Shift+D cycles display profiles
    if (event.key === 'D' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      // Don't cycle if user is focused on a text input
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      this.cycleProfile();
      return;
    }

    // Escape closes dropdown
    if (event.key === 'Escape' && this.isExpanded) {
      event.preventDefault();
      this.hide();
    }
  }

  cycleProfile(): void {
    const currentIndex = PROFILE_CYCLE_ORDER.indexOf(this.state.transferFunction);
    const nextIndex = (currentIndex + 1) % PROFILE_CYCLE_ORDER.length;
    this.setTransferFunction(PROFILE_CYCLE_ORDER[nextIndex]!);
  }

  // ==========================================================================
  // Render / Dispose
  // ==========================================================================

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('click', this.boundHandleOutsideClick);
    if (this.panel.parentElement) {
      this.panel.parentElement.removeChild(this.panel);
    }
    this.removeAllListeners();
  }
}
