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

export type WipeMode = 'off' | 'horizontal' | 'vertical';
export type ABSource = 'A' | 'B';

export interface CompareState {
  wipeMode: WipeMode;
  wipePosition: number;
  currentAB: ABSource;
  abAvailable: boolean;
  differenceMatte: DifferenceMatteState;
}

export interface CompareControlEvents extends EventMap {
  wipeModeChanged: WipeMode;
  wipePositionChanged: number;
  abSourceChanged: ABSource;
  abToggled: void;
  differenceMatteChanged: DifferenceMatteState;
  stateChanged: CompareState;
}

const WIPE_MODES: { mode: WipeMode; label: string; icon: IconName }[] = [
  { mode: 'off', label: 'Wipe Off', icon: 'columns' },
  { mode: 'horizontal', label: 'H-Wipe', icon: 'split-vertical' },
  { mode: 'vertical', label: 'V-Wipe', icon: 'split-horizontal' },
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
  };
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
      color: #999;
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
        this.button.style.background = '#3a3a3a';
        this.button.style.borderColor = '#4a4a4a';
        this.button.style.color = '#ccc';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen && !this.isActive()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = '#999';
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
      background: #2a2a2a;
      border: 1px solid #4a4a4a;
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
    wipeHeader.style.cssText = 'color: #888; font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
    wipeSection.appendChild(wipeHeader);

    for (const { mode, label, icon } of WIPE_MODES) {
      const option = document.createElement('button');
      option.dataset.wipeMode = mode;
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
        gap: 6px;
      `;
      option.innerHTML = `${getIconSvg(icon, 'sm')}<span>${label}</span>`;

      option.addEventListener('mouseenter', () => {
        option.style.background = '#3a3a3a';
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
    divider.style.cssText = 'height: 1px; background: #444; margin: 4px 0;';
    this.dropdown.appendChild(divider);

    // A/B section
    const abSection = document.createElement('div');
    abSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const abHeader = document.createElement('div');
    abHeader.textContent = 'A/B Compare';
    abHeader.style.cssText = 'color: #888; font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
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
      border: 1px solid #555;
      color: #ccc;
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
      border: 1px solid #555;
      color: #ccc;
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
      border: 1px solid #555;
      color: #ccc;
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
    divider2.style.cssText = 'height: 1px; background: #444; margin: 4px 0;';
    this.dropdown.appendChild(divider2);

    // Difference Matte section
    const diffSection = document.createElement('div');
    diffSection.className = 'diff-matte-section';
    diffSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const diffHeader = document.createElement('div');
    diffHeader.textContent = 'Difference Matte';
    diffHeader.style.cssText = 'color: #888; font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
    diffSection.appendChild(diffHeader);

    // Enable toggle
    const diffToggle = document.createElement('button');
    diffToggle.dataset.testid = 'diff-matte-toggle';
    diffToggle.style.cssText = `
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
      gap: 6px;
    `;
    diffToggle.innerHTML = `${getIconSvg('eye', 'sm')}<span>Show Difference</span>`;
    diffToggle.addEventListener('mouseenter', () => {
      diffToggle.style.background = '#3a3a3a';
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
    gainLabel.style.cssText = 'font-size: 11px; color: #888; min-width: 35px;';

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
    gainValue.style.cssText = 'font-size: 11px; color: #aaa; min-width: 30px; text-align: right;';

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
      color: #ccc;
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
      heatmapToggle.style.background = '#3a3a3a';
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

    this.updateDropdownStates();
  }

  private updateButtonLabel(): void {
    const parts: string[] = [];

    if (this.state.differenceMatte.enabled) {
      parts.push('Diff');
    } else if (this.state.wipeMode !== 'off') {
      parts.push(this.state.wipeMode === 'horizontal' ? 'H-Wipe' : 'V-Wipe');
    }
    if (this.state.currentAB === 'B' && this.state.abAvailable) {
      parts.push('B');
    }

    const label = parts.length > 0 ? parts.join(' + ') : 'Compare';
    this.button.innerHTML = `${getIconSvg('columns', 'sm')}<span>${label}</span><span style="font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.isActive()) {
      this.button.style.background = 'rgba(74, 158, 255, 0.15)';
      this.button.style.borderColor = '#4a9eff';
      this.button.style.color = '#4a9eff';
    } else if (!this.isOpen) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = '#999';
    }
  }

  private updateWipeOptionStyle(option: HTMLButtonElement, mode: WipeMode): void {
    const isActive = this.state.wipeMode === mode;
    option.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
    option.style.color = isActive ? '#4a9eff' : '#ccc';
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
        aButton.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
        aButton.style.borderColor = isActive ? '#4a9eff' : '#555';
        aButton.style.color = isActive ? '#4a9eff' : '#ccc';
      }

      if (bButton) {
        const isActive = this.state.currentAB === 'B';
        bButton.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
        bButton.style.borderColor = isActive ? '#4a9eff' : '#555';
        bButton.style.color = isActive ? '#4a9eff' : '#ccc';
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
  }

  private isActive(): boolean {
    return this.state.wipeMode !== 'off' ||
           (this.state.currentAB === 'B' && this.state.abAvailable) ||
           this.state.differenceMatte.enabled;
  }

  private updateDiffToggleStyle(toggle: HTMLButtonElement): void {
    const isActive = this.state.differenceMatte.enabled;
    toggle.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
    toggle.style.color = isActive ? '#4a9eff' : '#ccc';
  }

  private updateHeatmapToggleStyle(toggle: HTMLButtonElement): void {
    const isActive = this.state.differenceMatte.heatmap;
    toggle.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
    toggle.style.color = isActive ? '#4a9eff' : '#ccc';
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
    const modes: WipeMode[] = ['off', 'horizontal', 'vertical'];
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

  getState(): CompareState {
    return { ...this.state };
  }

  /**
   * Get wipe state for WipeControl compatibility
   */
  getWipeState(): { mode: WipeMode; position: number; showOriginal: 'left' | 'right' | 'top' | 'bottom' } {
    return {
      mode: this.state.wipeMode,
      position: this.state.wipePosition,
      showOriginal: this.state.wipeMode === 'horizontal' ? 'left' : 'top',
    };
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
