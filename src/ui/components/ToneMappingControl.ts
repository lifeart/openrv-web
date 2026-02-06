/**
 * ToneMappingControl - Dropdown control for tone mapping operators
 *
 * Features:
 * - Toggle button with dropdown
 * - Tone mapping operator selector (Off, Reinhard, Filmic, ACES)
 * - Real-time preview of HDR content
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import type { DisplayCapabilities } from '../../color/DisplayCapabilities';

/**
 * Tone mapping operator types
 */
export type ToneMappingOperator = 'off' | 'reinhard' | 'filmic' | 'aces';

/**
 * Tone mapping state
 */
export interface ToneMappingState {
  enabled: boolean;
  operator: ToneMappingOperator;
  // Per-operator parameters
  reinhardWhitePoint?: number;    // 0.5 - 10.0, default 4.0
  filmicExposureBias?: number;    // 0.5 - 8.0, default 2.0
  filmicWhitePoint?: number;      // 2.0 - 20.0, default 11.2
}

/**
 * Default tone mapping state
 */
export const DEFAULT_TONE_MAPPING_STATE: ToneMappingState = {
  enabled: false,
  operator: 'off',
  reinhardWhitePoint: 4.0,
  filmicExposureBias: 2.0,
  filmicWhitePoint: 11.2,
};

/**
 * Tone mapping operator info
 */
export interface ToneMappingOperatorInfo {
  key: ToneMappingOperator;
  label: string;
  description: string;
}

/**
 * Available tone mapping operators
 */
export const TONE_MAPPING_OPERATORS: ToneMappingOperatorInfo[] = [
  { key: 'off', label: 'Off', description: 'No tone mapping (linear)' },
  { key: 'reinhard', label: 'Reinhard', description: 'Simple global operator' },
  { key: 'filmic', label: 'Filmic', description: 'Film-like S-curve response' },
  { key: 'aces', label: 'ACES', description: 'Academy Color Encoding System' },
];

/**
 * HDR output mode type
 */
export type HDROutputMode = 'sdr' | 'hlg' | 'pq';

/**
 * Events emitted by ToneMappingControl
 */
export interface ToneMappingControlEvents extends EventMap {
  stateChanged: ToneMappingState;
  hdrModeChanged: HDROutputMode;
}

/**
 * ToneMappingControl component
 */
export class ToneMappingControl extends EventEmitter<ToneMappingControlEvents> {
  private container: HTMLElement;
  private dropdown: HTMLElement;
  private isDropdownOpen = false;
  private toggleButton: HTMLButtonElement;
  private operatorButtons: Map<ToneMappingOperator, HTMLButtonElement> = new Map();
  private boundHandleReposition: () => void;
  private state: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };

  // Per-operator parameter section
  private parameterSection: HTMLElement | null = null;

  // HDR output mode
  private capabilities: DisplayCapabilities | undefined;
  private hdrOutputMode: HDROutputMode = 'sdr';
  private hdrSection: HTMLElement | null = null;
  private hdrModeButtons: Map<HDROutputMode, HTMLButtonElement> = new Map();

  constructor(capabilities?: DisplayCapabilities) {
    super();
    this.capabilities = capabilities;
    this.boundHandleReposition = () => this.positionDropdown();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'tone-mapping-control';
    this.container.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'tone-mapping-toggle';
    this.toggleButton.dataset.testid = 'tone-mapping-control-button';
    this.toggleButton.innerHTML = `${getIconSvg('sun', 'sm')} <span>Tone Map</span> ${getIconSvg('chevron-down', 'sm')}`;
    this.toggleButton.title = 'Tone mapping for HDR content (Shift+Alt+J)';
    this.toggleButton.setAttribute('aria-label', 'Tone mapping options');
    this.toggleButton.setAttribute('aria-haspopup', 'menu');
    this.toggleButton.setAttribute('aria-expanded', 'false');
    this.toggleButton.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.12s ease;
    `;

    this.toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.toggleButton.addEventListener('mouseenter', () => {
      if (!this.state.enabled) {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });

    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.state.enabled) {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.borderColor = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);

    // Create dropdown panel
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'tone-mapping-dropdown';
    this.dropdown.dataset.testid = 'tone-mapping-dropdown';
    this.dropdown.setAttribute('role', 'menu');
    this.dropdown.setAttribute('aria-label', 'Tone mapping operators');
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 8px;
      min-width: 200px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.createDropdownContent();
    this.container.appendChild(this.dropdown);

    // Close dropdown on outside click
    document.addEventListener('click', this.handleOutsideClick);
  }

  private createDropdownContent(): void {
    // Enable/disable toggle
    const enableRow = document.createElement('div');
    enableRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 4px;
    `;

    const enableLabel = document.createElement('span');
    enableLabel.textContent = 'Enable Tone Mapping';
    enableLabel.style.cssText = 'color: var(--text-primary); font-size: 11px;';

    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = this.state.enabled;
    enableCheckbox.dataset.testid = 'tone-mapping-enable-checkbox';
    enableCheckbox.style.cssText = 'cursor: pointer;';
    enableCheckbox.addEventListener('change', () => {
      this.setEnabled(enableCheckbox.checked);
    });

    enableRow.appendChild(enableLabel);
    enableRow.appendChild(enableCheckbox);
    this.dropdown.appendChild(enableRow);

    // Operator selector section
    const operatorSection = document.createElement('div');
    operatorSection.style.cssText = `
      margin-bottom: 10px;
    `;

    const operatorLabel = document.createElement('div');
    operatorLabel.textContent = 'Operator';
    operatorLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 6px;
    `;
    operatorSection.appendChild(operatorLabel);

    const operatorList = document.createElement('div');
    operatorList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    for (const operator of TONE_MAPPING_OPERATORS) {
      const btn = document.createElement('button');
      btn.dataset.operator = operator.key;
      btn.dataset.testid = `tone-mapping-operator-${operator.key}`;
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', this.state.operator === operator.key ? 'true' : 'false');
      btn.setAttribute('aria-label', `${operator.label}: ${operator.description}`);
      btn.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 6px 8px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.1s ease;
        text-align: left;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = operator.label;
      labelSpan.style.cssText = 'font-weight: 500; color: var(--text-primary);';

      const descSpan = document.createElement('span');
      descSpan.textContent = operator.description;
      descSpan.style.cssText = 'font-size: 9px; color: var(--text-secondary); margin-top: 2px;';

      btn.appendChild(labelSpan);
      btn.appendChild(descSpan);

      btn.addEventListener('click', () => {
        this.setOperator(operator.key);
      });

      btn.addEventListener('mouseenter', () => {
        if (this.state.operator !== operator.key) {
          btn.style.background = 'var(--border-primary)';
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (this.state.operator !== operator.key) {
          btn.style.background = 'var(--bg-secondary)';
        }
      });

      this.operatorButtons.set(operator.key, btn);
      operatorList.appendChild(btn);
    }

    operatorSection.appendChild(operatorList);
    this.dropdown.appendChild(operatorSection);

    // Per-operator parameter sliders
    this.parameterSection = this.createParameterSection();
    this.dropdown.appendChild(this.parameterSection);
    this.updateParameterVisibility();

    // HDR Output section (only shown when HDR is available)
    this.createHDRSection();

    // Initial update
    this.updateOperatorButtons();
    this.updateButtonState();
  }

  private createHDRSection(): void {
    const caps = this.capabilities;
    // Only show when displayHDR is true AND at least one of webglHLG/webglPQ is true
    if (!caps || !caps.displayHDR || (!caps.webglHLG && !caps.webglPQ)) return;

    this.hdrSection = document.createElement('div');
    this.hdrSection.dataset.testid = 'hdr-output-section';
    this.hdrSection.style.cssText = `
      margin-bottom: 10px;
      border-top: 1px solid var(--border-secondary);
      padding-top: 8px;
    `;

    const hdrLabel = document.createElement('div');
    hdrLabel.textContent = 'HDR Output';
    hdrLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 6px;
    `;
    this.hdrSection.appendChild(hdrLabel);

    const hdrList = document.createElement('div');
    hdrList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    const hdrModes: { key: HDROutputMode; label: string; description: string; available: boolean }[] = [
      { key: 'sdr', label: 'SDR', description: 'Standard dynamic range', available: true },
      { key: 'hlg', label: 'HLG', description: 'Hybrid Log-Gamma (rec2100-hlg)', available: caps.webglHLG },
      { key: 'pq', label: 'PQ', description: 'Perceptual Quantizer (rec2100-pq)', available: caps.webglPQ },
    ];

    for (const mode of hdrModes) {
      if (!mode.available) continue;

      const btn = document.createElement('button');
      btn.dataset.hdrMode = mode.key;
      btn.dataset.testid = `hdr-mode-${mode.key}`;
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', this.hdrOutputMode === mode.key ? 'true' : 'false');
      btn.setAttribute('aria-label', `${mode.label}: ${mode.description}`);
      btn.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 6px 8px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.1s ease;
        text-align: left;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = mode.label;
      labelSpan.style.cssText = 'font-weight: 500; color: var(--text-primary);';

      const descSpan = document.createElement('span');
      descSpan.textContent = mode.description;
      descSpan.style.cssText = 'font-size: 9px; color: var(--text-secondary); margin-top: 2px;';

      btn.appendChild(labelSpan);
      btn.appendChild(descSpan);

      btn.addEventListener('click', () => {
        this.setHDROutputMode(mode.key);
      });

      btn.addEventListener('mouseenter', () => {
        if (this.hdrOutputMode !== mode.key) {
          btn.style.background = 'var(--border-primary)';
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (this.hdrOutputMode !== mode.key) {
          btn.style.background = 'var(--bg-secondary)';
        }
      });

      this.hdrModeButtons.set(mode.key, btn);
      hdrList.appendChild(btn);
    }

    this.hdrSection.appendChild(hdrList);
    this.dropdown.appendChild(this.hdrSection);
    this.updateHDRModeButtons();
  }

  private createParameterSection(): HTMLElement {
    const container = document.createElement('div');
    container.dataset.testid = 'tone-mapping-params';
    container.style.cssText = `
      margin-bottom: 10px;
      border-top: 1px solid var(--border-secondary);
      padding-top: 8px;
    `;

    return container;
  }

  private createSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (value: number) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 6px;
    `;

    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    labelSpan.style.cssText = 'color: var(--text-primary); font-size: 10px;';

    const valueSpan = document.createElement('span');
    valueSpan.textContent = value.toFixed(1);
    valueSpan.style.cssText = 'color: var(--text-secondary); font-size: 10px;';

    labelRow.appendChild(labelSpan);
    labelRow.appendChild(valueSpan);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = `
      width: 100%;
      cursor: pointer;
      height: 4px;
    `;

    slider.addEventListener('input', () => {
      const newValue = parseFloat(slider.value);
      valueSpan.textContent = newValue.toFixed(1);
      onChange(newValue);
    });

    row.appendChild(labelRow);
    row.appendChild(slider);

    return row;
  }

  private updateParameterVisibility(): void {
    if (!this.parameterSection) return;

    // Clear existing content
    this.parameterSection.innerHTML = '';

    const op = this.state.operator;

    if (op === 'reinhard') {
      this.parameterSection.style.display = 'block';

      const paramLabel = document.createElement('div');
      paramLabel.textContent = 'Reinhard Parameters';
      paramLabel.style.cssText = `
        color: var(--text-secondary);
        font-size: 10px;
        text-transform: uppercase;
        margin-bottom: 6px;
      `;
      this.parameterSection.appendChild(paramLabel);

      const whitePointSlider = this.createSlider(
        'White Point',
        0.5, 10.0, 0.1,
        this.state.reinhardWhitePoint ?? 4.0,
        (value) => {
          this.state.reinhardWhitePoint = value;
          this.emit('stateChanged', { ...this.state });
        }
      );
      this.parameterSection.appendChild(whitePointSlider);

    } else if (op === 'filmic') {
      this.parameterSection.style.display = 'block';

      const paramLabel = document.createElement('div');
      paramLabel.textContent = 'Filmic Parameters';
      paramLabel.style.cssText = `
        color: var(--text-secondary);
        font-size: 10px;
        text-transform: uppercase;
        margin-bottom: 6px;
      `;
      this.parameterSection.appendChild(paramLabel);

      const exposureBiasSlider = this.createSlider(
        'Exposure Bias',
        0.5, 8.0, 0.1,
        this.state.filmicExposureBias ?? 2.0,
        (value) => {
          this.state.filmicExposureBias = value;
          this.emit('stateChanged', { ...this.state });
        }
      );
      this.parameterSection.appendChild(exposureBiasSlider);

      const whitePointSlider = this.createSlider(
        'White Point',
        2.0, 20.0, 0.1,
        this.state.filmicWhitePoint ?? 11.2,
        (value) => {
          this.state.filmicWhitePoint = value;
          this.emit('stateChanged', { ...this.state });
        }
      );
      this.parameterSection.appendChild(whitePointSlider);

    } else {
      // 'aces' or 'off': hide the section
      this.parameterSection.style.display = 'none';
    }
  }

  private updateHDRModeButtons(): void {
    for (const [key, btn] of this.hdrModeButtons) {
      const isSelected = key === this.hdrOutputMode;
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');

      if (isSelected) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        const labelSpan = btn.querySelector('span:first-child') as HTMLSpanElement;
        const descSpan = btn.querySelector('span:last-child') as HTMLSpanElement;
        if (labelSpan) labelSpan.style.color = '#fff';
        if (descSpan) descSpan.style.color = 'rgba(255, 255, 255, 0.8)';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-secondary)';
        const labelSpan = btn.querySelector('span:first-child') as HTMLSpanElement;
        const descSpan = btn.querySelector('span:last-child') as HTMLSpanElement;
        if (labelSpan) labelSpan.style.color = 'var(--text-primary)';
        if (descSpan) descSpan.style.color = 'var(--text-secondary)';
      }
    }
  }

  /**
   * Set HDR output mode
   */
  setHDROutputMode(mode: HDROutputMode): void {
    if (this.hdrOutputMode === mode) return;
    this.hdrOutputMode = mode;
    this.updateHDRModeButtons();
    this.emit('hdrModeChanged', mode);
  }

  /**
   * Get current HDR output mode
   */
  getHDROutputMode(): HDROutputMode {
    return this.hdrOutputMode;
  }

  private updateButtonState(): void {
    const enabled = this.state.enabled && this.state.operator !== 'off';
    if (enabled) {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  private updateOperatorButtons(): void {
    for (const [key, btn] of this.operatorButtons) {
      const isSelected = key === this.state.operator;
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');

      if (isSelected) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        const labelSpan = btn.querySelector('span:first-child') as HTMLSpanElement;
        const descSpan = btn.querySelector('span:last-child') as HTMLSpanElement;
        if (labelSpan) labelSpan.style.color = '#fff';
        if (descSpan) descSpan.style.color = 'rgba(255, 255, 255, 0.8)';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-secondary)';
        const labelSpan = btn.querySelector('span:first-child') as HTMLSpanElement;
        const descSpan = btn.querySelector('span:last-child') as HTMLSpanElement;
        if (labelSpan) labelSpan.style.color = 'var(--text-primary)';
        if (descSpan) descSpan.style.color = 'var(--text-secondary)';
      }
    }
  }

  private updateEnableCheckbox(): void {
    const checkbox = this.dropdown.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = this.state.enabled;
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

  /**
   * Set tone mapping enabled state
   */
  setEnabled(enabled: boolean): void {
    if (this.state.enabled === enabled) return;
    this.state.enabled = enabled;
    this.updateButtonState();
    this.updateEnableCheckbox();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Set tone mapping operator
   */
  setOperator(operator: ToneMappingOperator): void {
    if (this.state.operator === operator) return;
    this.state.operator = operator;
    // Auto-enable when selecting a non-off operator
    if (operator !== 'off' && !this.state.enabled) {
      this.state.enabled = true;
      this.updateEnableCheckbox();
    }
    // Auto-disable when selecting 'off'
    if (operator === 'off' && this.state.enabled) {
      this.state.enabled = false;
      this.updateEnableCheckbox();
    }
    this.updateOperatorButtons();
    this.updateButtonState();
    this.updateParameterVisibility();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Toggle tone mapping on/off
   */
  toggle(): void {
    this.setEnabled(!this.state.enabled);
  }

  /**
   * Get current state
   */
  getState(): ToneMappingState {
    return { ...this.state };
  }

  /**
   * Set state
   */
  setState(state: Partial<ToneMappingState>): void {
    let changed = false;
    if (state.enabled !== undefined && state.enabled !== this.state.enabled) {
      this.state.enabled = state.enabled;
      changed = true;
    }
    if (state.operator !== undefined && state.operator !== this.state.operator) {
      this.state.operator = state.operator;
      changed = true;
    }
    if (state.reinhardWhitePoint !== undefined && state.reinhardWhitePoint !== this.state.reinhardWhitePoint) {
      this.state.reinhardWhitePoint = state.reinhardWhitePoint;
      changed = true;
    }
    if (state.filmicExposureBias !== undefined && state.filmicExposureBias !== this.state.filmicExposureBias) {
      this.state.filmicExposureBias = state.filmicExposureBias;
      changed = true;
    }
    if (state.filmicWhitePoint !== undefined && state.filmicWhitePoint !== this.state.filmicWhitePoint) {
      this.state.filmicWhitePoint = state.filmicWhitePoint;
      changed = true;
    }
    if (changed) {
      this.updateButtonState();
      this.updateOperatorButtons();
      this.updateEnableCheckbox();
      this.updateParameterVisibility();
      this.emit('stateChanged', { ...this.state });
    }
  }

  /**
   * Check if tone mapping is enabled
   */
  isEnabled(): boolean {
    return this.state.enabled && this.state.operator !== 'off';
  }

  /**
   * Get list of available operators
   */
  getOperators(): ToneMappingOperatorInfo[] {
    return [...TONE_MAPPING_OPERATORS];
  }

  /**
   * Handle keyboard input
   */
  handleKeyboard(key: string, shiftKey: boolean, altKey: boolean = false): boolean {
    if (shiftKey && altKey && key.toLowerCase() === 'j') {
      this.toggle();
      return true;
    }
    return false;
  }

  /**
   * Render the control
   */
  render(): HTMLElement {
    return this.container;
  }

  /**
   * Dispose
   */
  dispose(): void {
    document.removeEventListener('click', this.handleOutsideClick);
    window.removeEventListener('resize', this.boundHandleReposition);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    this.operatorButtons.clear();
    this.hdrModeButtons.clear();
  }
}
