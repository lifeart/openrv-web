/**
 * CompareControl - Dropdown for comparison tools (Wipe + A/B + Difference Matte)
 *
 * Combines Wipe mode controls, A/B source comparison, and difference matte into a single dropdown.
 * Shows active indicator when wipe is enabled, B source is selected, or difference matte is on.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg, type IconName } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE } from './DifferenceMatteControl';

export type WipeMode = 'off' | 'horizontal' | 'vertical' | 'splitscreen-h' | 'splitscreen-v';
export type ABSource = 'A' | 'B';
export type BlendMode = 'off' | 'onionskin' | 'flicker' | 'blend';

export interface BlendModeState {
  mode: BlendMode;
  onionOpacity: number;    // 0-1 for onion skin mode
  flickerRate: number;     // Hz for flicker mode (1-30)
  blendRatio: number;      // 0-1 for blend mode (0.5 = 50/50)
}

export const DEFAULT_BLEND_MODE_STATE: BlendModeState = {
  mode: 'off',
  onionOpacity: 0.5,
  flickerRate: 4,
  blendRatio: 0.5,
};

export interface CompareState {
  wipeMode: WipeMode;
  wipePosition: number;
  currentAB: ABSource;
  abAvailable: boolean;
  differenceMatte: DifferenceMatteState;
  blendMode: BlendModeState;
}

export interface CompareControlEvents extends EventMap {
  wipeModeChanged: WipeMode;
  wipePositionChanged: number;
  abSourceChanged: ABSource;
  abToggled: void;
  differenceMatteChanged: DifferenceMatteState;
  blendModeChanged: BlendModeState;
  stateChanged: CompareState;
}

const WIPE_MODES: { mode: WipeMode; label: string; icon: IconName }[] = [
  { mode: 'off', label: 'Wipe Off', icon: 'columns' },
  { mode: 'horizontal', label: 'H-Wipe', icon: 'split-vertical' },
  { mode: 'vertical', label: 'V-Wipe', icon: 'split-horizontal' },
  { mode: 'splitscreen-h', label: 'Split H', icon: 'columns' },
  { mode: 'splitscreen-v', label: 'Split V', icon: 'rows' },
];

export class CompareControl extends EventEmitter<CompareControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private state: CompareState = {
    wipeMode: 'off',
    wipePosition: 0.5,
    currentAB: 'A',
    abAvailable: false,
    differenceMatte: { ...DEFAULT_DIFFERENCE_MATTE_STATE },
    blendMode: { ...DEFAULT_BLEND_MODE_STATE },
  };
  private flickerInterval: number | null = null;
  private flickerFrame: 0 | 1 = 0;
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    this.container = document.createElement('div');
    this.container.className = 'compare-control';
    this.container.dataset.testid = 'compare-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'compare-control-button';
    this.button.title = 'Comparison tools: Wipe (W) and A/B (`)';
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
      justify-content: center;
      min-width: 80px;
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
    this.button.addEventListener('mouseenter', () => {
      if (!this.isOpen && !this.isActive()) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen && !this.isActive()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.button);

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'compare-dropdown';
    this.dropdown.dataset.testid = 'compare-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 8px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      gap: 8px;
    `;

    this.populateDropdown();
    this.container.appendChild(this.button);
  }

  private populateDropdown(): void {
    this.dropdown.innerHTML = '';

    // Wipe section
    const wipeSection = document.createElement('div');
    wipeSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const wipeHeader = document.createElement('div');
    wipeHeader.textContent = 'Wipe Mode';
    wipeHeader.style.cssText = 'color: var(--text-secondary); font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
    wipeSection.appendChild(wipeHeader);

    for (const { mode, label, icon } of WIPE_MODES) {
      const option = document.createElement('button');
      option.dataset.wipeMode = mode;
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
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      option.innerHTML = `${getIconSvg(icon, 'sm')}<span>${label}</span>`;

      option.addEventListener('mouseenter', () => {
        option.style.background = 'var(--bg-hover)';
      });
      option.addEventListener('mouseleave', () => {
        this.updateWipeOptionStyle(option, mode);
      });
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setWipeMode(mode);
      });
      wipeSection.appendChild(option);
    }

    this.dropdown.appendChild(wipeSection);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: var(--border-primary); margin: 4px 0;';
    this.dropdown.appendChild(divider);

    // A/B section
    const abSection = document.createElement('div');
    abSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const abHeader = document.createElement('div');
    abHeader.textContent = 'A/B Compare';
    abHeader.style.cssText = 'color: var(--text-secondary); font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
    abSection.appendChild(abHeader);

    // A/B button row
    const abRow = document.createElement('div');
    abRow.className = 'ab-button-row';
    abRow.style.cssText = 'display: flex; gap: 4px; padding: 4px 6px;';

    const aButton = document.createElement('button');
    aButton.dataset.abSource = 'A';
    aButton.dataset.testid = 'compare-ab-a';
    aButton.textContent = 'A';
    aButton.title = 'Show source A';
    aButton.style.cssText = `
      flex: 1;
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      padding: 6px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.12s ease;
    `;
    aButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setABSource('A');
    });

    const bButton = document.createElement('button');
    bButton.dataset.abSource = 'B';
    bButton.dataset.testid = 'compare-ab-b';
    bButton.textContent = 'B';
    bButton.title = 'Show source B';
    bButton.style.cssText = `
      flex: 1;
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      padding: 6px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.12s ease;
    `;
    bButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setABSource('B');
    });

    const toggleButton = document.createElement('button');
    toggleButton.dataset.testid = 'compare-ab-toggle';
    toggleButton.textContent = '⇄';
    toggleButton.title = 'Toggle A/B (`)';
    toggleButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      padding: 6px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.12s ease;
    `;
    toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAB();
    });

    abRow.appendChild(aButton);
    abRow.appendChild(bButton);
    abRow.appendChild(toggleButton);
    abSection.appendChild(abRow);

    this.dropdown.appendChild(abSection);

    // Divider
    const divider2 = document.createElement('div');
    divider2.style.cssText = 'height: 1px; background: var(--border-primary); margin: 4px 0;';
    this.dropdown.appendChild(divider2);

    // Difference Matte section
    const diffSection = document.createElement('div');
    diffSection.className = 'diff-matte-section';
    diffSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const diffHeader = document.createElement('div');
    diffHeader.textContent = 'Difference Matte';
    diffHeader.style.cssText = 'color: var(--text-secondary); font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
    diffSection.appendChild(diffHeader);

    // Enable toggle
    const diffToggle = document.createElement('button');
    diffToggle.dataset.testid = 'diff-matte-toggle';
    diffToggle.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-primary);
      padding: 6px 10px;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      border-radius: 3px;
      transition: background 0.12s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    diffToggle.innerHTML = `${getIconSvg('eye', 'sm')}<span>Show Difference</span>`;
    diffToggle.addEventListener('mouseenter', () => {
      diffToggle.style.background = 'var(--bg-hover)';
    });
    diffToggle.addEventListener('mouseleave', () => {
      this.updateDiffToggleStyle(diffToggle);
    });
    diffToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDifferenceMatte();
    });
    diffSection.appendChild(diffToggle);

    // Gain slider row
    const gainRow = document.createElement('div');
    gainRow.className = 'diff-gain-row';
    gainRow.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 4px 10px;';

    const gainLabel = document.createElement('span');
    gainLabel.textContent = 'Gain:';
    gainLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 35px;';

    const gainSlider = document.createElement('input');
    gainSlider.type = 'range';
    gainSlider.min = '1';
    gainSlider.max = '10';
    gainSlider.step = '0.5';
    gainSlider.value = String(this.state.differenceMatte.gain);
    gainSlider.dataset.testid = 'diff-matte-gain';
    gainSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    gainSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.setDifferenceMatteGain(value);
      gainValue.textContent = `${value.toFixed(1)}x`;
    });

    const gainValue = document.createElement('span');
    gainValue.className = 'diff-gain-value';
    gainValue.textContent = `${this.state.differenceMatte.gain.toFixed(1)}x`;
    gainValue.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 30px; text-align: right;';

    gainRow.appendChild(gainLabel);
    gainRow.appendChild(gainSlider);
    gainRow.appendChild(gainValue);
    diffSection.appendChild(gainRow);

    // Heatmap toggle
    const heatmapToggle = document.createElement('button');
    heatmapToggle.dataset.testid = 'diff-matte-heatmap';
    heatmapToggle.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-primary);
      padding: 6px 10px;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      border-radius: 3px;
      transition: background 0.12s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    heatmapToggle.innerHTML = `${getIconSvg('palette', 'sm')}<span>Heatmap Mode</span>`;
    heatmapToggle.addEventListener('mouseenter', () => {
      heatmapToggle.style.background = 'var(--bg-hover)';
    });
    heatmapToggle.addEventListener('mouseleave', () => {
      this.updateHeatmapToggleStyle(heatmapToggle);
    });
    heatmapToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDifferenceMatteHeatmap();
    });
    diffSection.appendChild(heatmapToggle);

    this.dropdown.appendChild(diffSection);

    // Divider
    const divider3 = document.createElement('div');
    divider3.style.cssText = 'height: 1px; background: var(--border-primary); margin: 4px 0;';
    this.dropdown.appendChild(divider3);

    // Blend Modes section
    const blendSection = document.createElement('div');
    blendSection.className = 'blend-modes-section';
    blendSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const blendHeader = document.createElement('div');
    blendHeader.textContent = 'Blend Modes';
    blendHeader.style.cssText = 'color: var(--text-secondary); font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
    blendSection.appendChild(blendHeader);

    // Onion Skin button
    const onionButton = this.createBlendModeButton('onionskin', 'Onion Skin', 'layers');
    blendSection.appendChild(onionButton);

    // Onion Skin opacity slider
    const onionOpacityRow = document.createElement('div');
    onionOpacityRow.className = 'onion-opacity-row';
    onionOpacityRow.style.cssText = 'display: none; align-items: center; gap: 6px; padding: 4px 10px;';

    const onionOpacityLabel = document.createElement('span');
    onionOpacityLabel.textContent = 'Opacity:';
    onionOpacityLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 50px;';

    const onionOpacitySlider = document.createElement('input');
    onionOpacitySlider.type = 'range';
    onionOpacitySlider.min = '0';
    onionOpacitySlider.max = '100';
    onionOpacitySlider.value = String(this.state.blendMode.onionOpacity * 100);
    onionOpacitySlider.dataset.testid = 'onion-opacity-slider';
    onionOpacitySlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    onionOpacitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value) / 100;
      this.setOnionOpacity(value);
    });

    const onionOpacityValue = document.createElement('span');
    onionOpacityValue.className = 'onion-opacity-value';
    onionOpacityValue.textContent = `${Math.round(this.state.blendMode.onionOpacity * 100)}%`;
    onionOpacityValue.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 35px; text-align: right;';

    onionOpacityRow.appendChild(onionOpacityLabel);
    onionOpacityRow.appendChild(onionOpacitySlider);
    onionOpacityRow.appendChild(onionOpacityValue);
    blendSection.appendChild(onionOpacityRow);

    // Flicker button
    const flickerButton = this.createBlendModeButton('flicker', 'Flicker', 'activity');
    blendSection.appendChild(flickerButton);

    // Flicker rate slider
    const flickerRateRow = document.createElement('div');
    flickerRateRow.className = 'flicker-rate-row';
    flickerRateRow.style.cssText = 'display: none; align-items: center; gap: 6px; padding: 4px 10px;';

    const flickerRateLabel = document.createElement('span');
    flickerRateLabel.textContent = 'Rate:';
    flickerRateLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 50px;';

    const flickerRateSlider = document.createElement('input');
    flickerRateSlider.type = 'range';
    flickerRateSlider.min = '1';
    flickerRateSlider.max = '30';
    flickerRateSlider.value = String(this.state.blendMode.flickerRate);
    flickerRateSlider.dataset.testid = 'flicker-rate-slider';
    flickerRateSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    flickerRateSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.setFlickerRate(value);
    });

    const flickerRateValue = document.createElement('span');
    flickerRateValue.className = 'flicker-rate-value';
    flickerRateValue.textContent = `${this.state.blendMode.flickerRate} Hz`;
    flickerRateValue.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 40px; text-align: right;';

    flickerRateRow.appendChild(flickerRateLabel);
    flickerRateRow.appendChild(flickerRateSlider);
    flickerRateRow.appendChild(flickerRateValue);
    blendSection.appendChild(flickerRateRow);

    // Blend button
    const blendButton = this.createBlendModeButton('blend', 'Blend', 'sliders');
    blendSection.appendChild(blendButton);

    // Blend ratio slider
    const blendRatioRow = document.createElement('div');
    blendRatioRow.className = 'blend-ratio-row';
    blendRatioRow.style.cssText = 'display: none; align-items: center; gap: 6px; padding: 4px 10px;';

    const blendRatioLabel = document.createElement('span');
    blendRatioLabel.textContent = 'A/B:';
    blendRatioLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 50px;';

    const blendRatioSlider = document.createElement('input');
    blendRatioSlider.type = 'range';
    blendRatioSlider.min = '0';
    blendRatioSlider.max = '100';
    blendRatioSlider.value = String(this.state.blendMode.blendRatio * 100);
    blendRatioSlider.dataset.testid = 'blend-ratio-slider';
    blendRatioSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    blendRatioSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value) / 100;
      this.setBlendRatio(value);
    });

    const blendRatioValue = document.createElement('span');
    blendRatioValue.className = 'blend-ratio-value';
    blendRatioValue.textContent = `${Math.round(this.state.blendMode.blendRatio * 100)}%`;
    blendRatioValue.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 35px; text-align: right;';

    blendRatioRow.appendChild(blendRatioLabel);
    blendRatioRow.appendChild(blendRatioSlider);
    blendRatioRow.appendChild(blendRatioValue);
    blendSection.appendChild(blendRatioRow);

    this.dropdown.appendChild(blendSection);

    this.updateDropdownStates();
  }

  private createBlendModeButton(mode: BlendMode, label: string, icon: IconName): HTMLButtonElement {
    const button = document.createElement('button');
    button.dataset.blendMode = mode;
    button.dataset.testid = `blend-mode-${mode}`;
    button.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-primary);
      padding: 6px 10px;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      border-radius: 3px;
      transition: background 0.12s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    button.innerHTML = `${getIconSvg(icon, 'sm')}<span>${label}</span>`;
    button.addEventListener('mouseenter', () => {
      button.style.background = 'var(--bg-hover)';
    });
    button.addEventListener('mouseleave', () => {
      this.updateBlendModeButtonStyle(button, mode);
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleBlendMode(mode);
    });
    return button;
  }

  private updateButtonLabel(): void {
    const parts: string[] = [];

    if (this.state.differenceMatte.enabled) {
      parts.push('Diff');
    } else if (this.state.blendMode.mode !== 'off') {
      const blendLabels: Record<BlendMode, string> = {
        off: '',
        onionskin: 'Onion',
        flicker: 'Flicker',
        blend: 'Blend',
      };
      parts.push(blendLabels[this.state.blendMode.mode]);
    } else if (this.state.wipeMode !== 'off') {
      const wipeLabels: Record<WipeMode, string> = {
        'off': '',
        'horizontal': 'H-Wipe',
        'vertical': 'V-Wipe',
        'splitscreen-h': 'Split-H',
        'splitscreen-v': 'Split-V',
      };
      parts.push(wipeLabels[this.state.wipeMode]);
    }
    if (this.state.currentAB === 'B' && this.state.abAvailable) {
      parts.push('B');
    }

    const label = parts.length > 0 ? parts.join(' + ') : 'Compare';
    this.button.innerHTML = `${getIconSvg('columns', 'sm')}<span>${label}</span><span style="font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.isActive()) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else if (!this.isOpen) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  private updateWipeOptionStyle(option: HTMLButtonElement, mode: WipeMode): void {
    const isActive = this.state.wipeMode === mode;
    option.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    option.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
  }

  private updateDropdownStates(): void {
    // Update wipe options
    const wipeOptions = this.dropdown.querySelectorAll('[data-wipe-mode]');
    wipeOptions.forEach((option) => {
      const mode = (option as HTMLElement).dataset.wipeMode as WipeMode;
      this.updateWipeOptionStyle(option as HTMLButtonElement, mode);
    });

    // Update A/B buttons
    const abRow = this.dropdown.querySelector('.ab-button-row');
    if (abRow) {
      const aButton = abRow.querySelector('[data-ab-source="A"]') as HTMLButtonElement;
      const bButton = abRow.querySelector('[data-ab-source="B"]') as HTMLButtonElement;
      const toggleButton = abRow.querySelector('[data-testid="compare-ab-toggle"]') as HTMLButtonElement;

      if (aButton) {
        const isActive = this.state.currentAB === 'A';
        aButton.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
        aButton.style.borderColor = isActive ? 'var(--accent-primary)' : 'var(--border-secondary)';
        aButton.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
      }

      if (bButton) {
        const isActive = this.state.currentAB === 'B';
        bButton.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
        bButton.style.borderColor = isActive ? 'var(--accent-primary)' : 'var(--border-secondary)';
        bButton.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
        bButton.disabled = !this.state.abAvailable;
        bButton.style.opacity = this.state.abAvailable ? '1' : '0.5';
      }

      if (toggleButton) {
        toggleButton.disabled = !this.state.abAvailable;
        toggleButton.style.opacity = this.state.abAvailable ? '1' : '0.5';
      }
    }

    // Update difference matte controls
    const diffSection = this.dropdown.querySelector('.diff-matte-section');
    if (diffSection) {
      const diffToggle = diffSection.querySelector('[data-testid="diff-matte-toggle"]') as HTMLButtonElement;
      const heatmapToggle = diffSection.querySelector('[data-testid="diff-matte-heatmap"]') as HTMLButtonElement;
      const gainSlider = diffSection.querySelector('[data-testid="diff-matte-gain"]') as HTMLInputElement;
      const gainValue = diffSection.querySelector('.diff-gain-value') as HTMLSpanElement;

      if (diffToggle) {
        this.updateDiffToggleStyle(diffToggle);
        // Disable if A/B not available
        diffToggle.disabled = !this.state.abAvailable;
        diffToggle.style.opacity = this.state.abAvailable ? '1' : '0.5';
      }

      if (heatmapToggle) {
        this.updateHeatmapToggleStyle(heatmapToggle);
        // Disable if difference matte not enabled
        heatmapToggle.disabled = !this.state.differenceMatte.enabled;
        heatmapToggle.style.opacity = this.state.differenceMatte.enabled ? '1' : '0.5';
      }

      if (gainSlider) {
        gainSlider.value = String(this.state.differenceMatte.gain);
        gainSlider.disabled = !this.state.differenceMatte.enabled;
        gainSlider.style.opacity = this.state.differenceMatte.enabled ? '1' : '0.5';
      }

      if (gainValue) {
        gainValue.textContent = `${this.state.differenceMatte.gain.toFixed(1)}x`;
        gainValue.style.opacity = this.state.differenceMatte.enabled ? '1' : '0.5';
      }
    }

    // Update blend mode controls
    const blendSection = this.dropdown.querySelector('.blend-modes-section');
    if (blendSection) {
      const blendModes: BlendMode[] = ['onionskin', 'flicker', 'blend'];
      for (const mode of blendModes) {
        const button = blendSection.querySelector(`[data-blend-mode="${mode}"]`) as HTMLButtonElement;
        if (button) {
          this.updateBlendModeButtonStyle(button, mode);
          button.disabled = !this.state.abAvailable;
          button.style.opacity = this.state.abAvailable ? '1' : '0.5';
        }
      }

      // Onion skin slider
      const onionOpacityRow = blendSection.querySelector('.onion-opacity-row') as HTMLElement;
      if (onionOpacityRow) {
        onionOpacityRow.style.display = this.state.blendMode.mode === 'onionskin' ? 'flex' : 'none';
        const slider = onionOpacityRow.querySelector('[data-testid="onion-opacity-slider"]') as HTMLInputElement;
        const valueSpan = onionOpacityRow.querySelector('.onion-opacity-value') as HTMLSpanElement;
        if (slider) slider.value = String(this.state.blendMode.onionOpacity * 100);
        if (valueSpan) valueSpan.textContent = `${Math.round(this.state.blendMode.onionOpacity * 100)}%`;
      }

      // Flicker rate slider
      const flickerRateRow = blendSection.querySelector('.flicker-rate-row') as HTMLElement;
      if (flickerRateRow) {
        flickerRateRow.style.display = this.state.blendMode.mode === 'flicker' ? 'flex' : 'none';
        const slider = flickerRateRow.querySelector('[data-testid="flicker-rate-slider"]') as HTMLInputElement;
        const valueSpan = flickerRateRow.querySelector('.flicker-rate-value') as HTMLSpanElement;
        if (slider) slider.value = String(this.state.blendMode.flickerRate);
        if (valueSpan) valueSpan.textContent = `${this.state.blendMode.flickerRate} Hz`;
      }

      // Blend ratio slider
      const blendRatioRow = blendSection.querySelector('.blend-ratio-row') as HTMLElement;
      if (blendRatioRow) {
        blendRatioRow.style.display = this.state.blendMode.mode === 'blend' ? 'flex' : 'none';
        const slider = blendRatioRow.querySelector('[data-testid="blend-ratio-slider"]') as HTMLInputElement;
        const valueSpan = blendRatioRow.querySelector('.blend-ratio-value') as HTMLSpanElement;
        if (slider) slider.value = String(this.state.blendMode.blendRatio * 100);
        if (valueSpan) valueSpan.textContent = `${Math.round(this.state.blendMode.blendRatio * 100)}%`;
      }
    }
  }

  private isActive(): boolean {
    return this.state.wipeMode !== 'off' ||
           (this.state.currentAB === 'B' && this.state.abAvailable) ||
           this.state.differenceMatte.enabled ||
           this.state.blendMode.mode !== 'off';
  }

  private updateBlendModeButtonStyle(button: HTMLButtonElement, mode: BlendMode): void {
    const isActive = this.state.blendMode.mode === mode;
    button.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    button.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
  }

  private updateDiffToggleStyle(toggle: HTMLButtonElement): void {
    const isActive = this.state.differenceMatte.enabled;
    toggle.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    toggle.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
  }

  private updateHeatmapToggleStyle(toggle: HTMLButtonElement): void {
    const isActive = this.state.differenceMatte.heatmap;
    toggle.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    toggle.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
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
    this.button.style.background = 'var(--bg-hover)';
    this.button.style.borderColor = 'var(--border-primary)';

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

  // Wipe methods
  setWipeMode(mode: WipeMode): void {
    if (this.state.wipeMode !== mode) {
      this.state.wipeMode = mode;
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('wipeModeChanged', mode);
      this.emit('stateChanged', { ...this.state });
    }
  }

  cycleWipeMode(): void {
    const modes: WipeMode[] = ['off', 'horizontal', 'vertical', 'splitscreen-h', 'splitscreen-v'];
    const currentIndex = modes.indexOf(this.state.wipeMode);
    const nextMode = modes[(currentIndex + 1) % modes.length]!;
    this.setWipeMode(nextMode);
  }

  getWipeMode(): WipeMode {
    return this.state.wipeMode;
  }

  setWipePosition(position: number): void {
    const clamped = Math.max(0, Math.min(1, position));
    if (clamped !== this.state.wipePosition) {
      this.state.wipePosition = clamped;
      this.emit('wipePositionChanged', clamped);
      this.emit('stateChanged', { ...this.state });
    }
  }

  getWipePosition(): number {
    return this.state.wipePosition;
  }

  // A/B methods
  setABSource(source: ABSource): void {
    if (this.state.currentAB !== source) {
      this.state.currentAB = source;
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('abSourceChanged', source);
      this.emit('stateChanged', { ...this.state });
    }
  }

  toggleAB(): void {
    if (this.state.abAvailable) {
      const newSource = this.state.currentAB === 'A' ? 'B' : 'A';
      this.setABSource(newSource);
      this.emit('abToggled', undefined);
    }
  }

  getABSource(): ABSource {
    return this.state.currentAB;
  }

  setABAvailable(available: boolean): void {
    if (this.state.abAvailable !== available) {
      this.state.abAvailable = available;
      this.updateDropdownStates();
      this.updateButtonLabel();
    }
  }

  isABAvailable(): boolean {
    return this.state.abAvailable;
  }

  // Difference Matte methods
  toggleDifferenceMatte(): void {
    this.state.differenceMatte.enabled = !this.state.differenceMatte.enabled;
    // When enabling difference matte, disable wipe mode to avoid conflicts
    if (this.state.differenceMatte.enabled && this.state.wipeMode !== 'off') {
      this.state.wipeMode = 'off';
      this.emit('wipeModeChanged', 'off');
    }
    this.updateButtonLabel();
    this.updateDropdownStates();
    this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
    this.emit('stateChanged', { ...this.state });
  }

  setDifferenceMatteEnabled(enabled: boolean): void {
    if (this.state.differenceMatte.enabled !== enabled) {
      this.state.differenceMatte.enabled = enabled;
      // When enabling difference matte, disable wipe mode to avoid conflicts
      if (enabled && this.state.wipeMode !== 'off') {
        this.state.wipeMode = 'off';
        this.emit('wipeModeChanged', 'off');
      }
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
      this.emit('stateChanged', { ...this.state });
    }
  }

  setDifferenceMatteGain(gain: number): void {
    const clamped = Math.max(1.0, Math.min(10.0, gain));
    if (clamped !== this.state.differenceMatte.gain) {
      this.state.differenceMatte.gain = clamped;
      this.updateDropdownStates();
      this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
      this.emit('stateChanged', { ...this.state });
    }
  }

  toggleDifferenceMatteHeatmap(): void {
    this.state.differenceMatte.heatmap = !this.state.differenceMatte.heatmap;
    this.updateDropdownStates();
    this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
    this.emit('stateChanged', { ...this.state });
  }

  setDifferenceMatteHeatmap(enabled: boolean): void {
    if (this.state.differenceMatte.heatmap !== enabled) {
      this.state.differenceMatte.heatmap = enabled;
      this.updateDropdownStates();
      this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getDifferenceMatteState(): DifferenceMatteState {
    return { ...this.state.differenceMatte };
  }

  isDifferenceMatteEnabled(): boolean {
    return this.state.differenceMatte.enabled;
  }

  // Blend Mode methods

  /**
   * Toggle a blend mode on/off.
   * If the specified mode is already active, turns it off.
   * Otherwise, activates the specified mode.
   * @param mode - The blend mode to toggle ('onionskin' | 'flicker' | 'blend')
   */
  toggleBlendMode(mode: BlendMode): void {
    if (this.state.blendMode.mode === mode) {
      // Toggle off
      this.setBlendMode('off');
    } else {
      this.setBlendMode(mode);
    }
  }

  /**
   * Set the active blend mode.
   * Automatically disables wipe mode and difference matte when enabling a blend mode.
   * @param mode - The blend mode to set ('off' | 'onionskin' | 'flicker' | 'blend')
   */
  setBlendMode(mode: BlendMode): void {
    if (this.state.blendMode.mode !== mode) {
      const previousMode = this.state.blendMode.mode;
      this.state.blendMode.mode = mode;

      // Stop flicker if switching away from it
      if (previousMode === 'flicker') {
        this.stopFlicker();
      }

      // Start flicker if switching to it
      if (mode === 'flicker') {
        this.startFlicker();
      }

      // When enabling a blend mode, disable wipe and difference matte to avoid conflicts
      if (mode !== 'off') {
        if (this.state.wipeMode !== 'off') {
          this.state.wipeMode = 'off';
          this.emit('wipeModeChanged', 'off');
        }
        if (this.state.differenceMatte.enabled) {
          this.state.differenceMatte.enabled = false;
          this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
        }
      }

      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  /**
   * Get the current blend mode.
   * @returns The active blend mode ('off' | 'onionskin' | 'flicker' | 'blend')
   */
  getBlendMode(): BlendMode {
    return this.state.blendMode.mode;
  }

  /**
   * Get the complete blend mode state including all parameters.
   * @returns A copy of the blend mode state object
   */
  getBlendModeState(): BlendModeState {
    return { ...this.state.blendMode };
  }

  /**
   * Set the opacity for onion skin blend mode.
   * @param opacity - Opacity value between 0 (transparent) and 1 (opaque)
   */
  setOnionOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    if (clamped !== this.state.blendMode.onionOpacity) {
      this.state.blendMode.onionOpacity = clamped;
      this.updateDropdownStates();
      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  /**
   * Get the current onion skin opacity.
   * @returns Opacity value between 0 and 1
   */
  getOnionOpacity(): number {
    return this.state.blendMode.onionOpacity;
  }

  /**
   * Set the flicker rate for flicker blend mode.
   * @param rate - Flicker frequency in Hz (1-30)
   */
  setFlickerRate(rate: number): void {
    const clamped = Math.max(1, Math.min(30, Math.round(rate)));
    if (clamped !== this.state.blendMode.flickerRate) {
      this.state.blendMode.flickerRate = clamped;
      // Restart flicker with new rate if active
      if (this.state.blendMode.mode === 'flicker') {
        this.stopFlicker();
        this.startFlicker();
      }
      this.updateDropdownStates();
      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  /**
   * Get the current flicker rate.
   * @returns Flicker frequency in Hz (1-30)
   */
  getFlickerRate(): number {
    return this.state.blendMode.flickerRate;
  }

  private startFlicker(): void {
    if (this.flickerInterval !== null) return;
    const intervalMs = 1000 / this.state.blendMode.flickerRate;
    this.flickerInterval = window.setInterval(() => {
      this.flickerFrame = this.flickerFrame === 0 ? 1 : 0;
      // Emit state change to trigger re-render
      this.emit('blendModeChanged', { ...this.state.blendMode });
    }, intervalMs);
  }

  private stopFlicker(): void {
    if (this.flickerInterval !== null) {
      window.clearInterval(this.flickerInterval);
      this.flickerInterval = null;
      this.flickerFrame = 0;
    }
  }

  /**
   * Get the current flicker frame (for rendering).
   * Alternates between 0 (show A) and 1 (show B) at the flicker rate.
   * @returns Current frame index (0 or 1)
   */
  getFlickerFrame(): 0 | 1 {
    return this.flickerFrame;
  }

  /**
   * Set the blend ratio for blend mode.
   * @param ratio - Blend ratio between 0 (100% A) and 1 (100% B), 0.5 = 50/50
   */
  setBlendRatio(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped !== this.state.blendMode.blendRatio) {
      this.state.blendMode.blendRatio = clamped;
      this.updateDropdownStates();
      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  /**
   * Get the current blend ratio.
   * @returns Blend ratio between 0 and 1
   */
  getBlendRatio(): number {
    return this.state.blendMode.blendRatio;
  }

  getState(): CompareState {
    return { ...this.state };
  }

  /**
   * Get wipe state for WipeControl compatibility
   */
  getWipeState(): { mode: WipeMode; position: number; showOriginal: 'left' | 'right' | 'top' | 'bottom' } {
    // For split screen modes, use 'left' or 'top' as placeholders (not actually used for split screen)
    let showOriginal: 'left' | 'right' | 'top' | 'bottom' = 'left';
    if (this.state.wipeMode === 'horizontal' || this.state.wipeMode === 'splitscreen-h') {
      showOriginal = 'left';
    } else {
      showOriginal = 'top';
    }
    return {
      mode: this.state.wipeMode,
      position: this.state.wipePosition,
      showOriginal,
    };
  }

  /**
   * Check if split screen mode is active
   */
  isSplitScreenMode(): boolean {
    return this.state.wipeMode === 'splitscreen-h' || this.state.wipeMode === 'splitscreen-v';
  }

  /**
   * Toggle split screen mode (cycles between off, horizontal split, vertical split)
   */
  toggleSplitScreen(): void {
    if (this.state.wipeMode === 'off' || this.state.wipeMode === 'horizontal' || this.state.wipeMode === 'vertical') {
      this.setWipeMode('splitscreen-h');
    } else if (this.state.wipeMode === 'splitscreen-h') {
      this.setWipeMode('splitscreen-v');
    } else {
      this.setWipeMode('off');
    }
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.stopFlicker();
    this.closeDropdown();
    if (document.body.contains(this.dropdown)) {
      document.body.removeChild(this.dropdown);
    }
  }
}
