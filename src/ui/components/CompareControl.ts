/**
 * CompareControl - Dropdown for comparison tools
 *
 * Combines Wipe mode, A/B source, Difference Matte, Blend Modes, and Quad View into a single dropdown.
 * Shows active indicator when any comparison feature is enabled.
 *
 * Delegates all comparison state and logic to ComparisonManager.
 * This class is responsible only for DOM rendering and user interaction.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg, type IconName } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { DifferenceMatteState } from './DifferenceMatteControl';
import {
  ComparisonManager,
  type WipeMode,
  type ABSource,
  type ComparisonBlendMode,
  type BlendModeState,
  type CompareState,
  type QuadViewState,
} from './ComparisonManager';

// Re-export types so external consumers don't need to change imports
export type { WipeMode, ABSource, ComparisonBlendMode, BlendModeState, CompareState, QuadViewState };
export { DEFAULT_BLEND_MODE_STATE, DEFAULT_QUAD_VIEW_STATE } from './ComparisonManager';

export interface CompareControlEvents extends EventMap {
  wipeModeChanged: WipeMode;
  wipePositionChanged: number;
  abSourceChanged: ABSource;
  abToggled: void;
  differenceMatteChanged: DifferenceMatteState;
  blendModeChanged: BlendModeState;
  quadViewChanged: QuadViewState;
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
  private manager: ComparisonManager;
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.manager = new ComparisonManager();
    this.bindManagerEvents();

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
    this.button.title = 'Comparison tools: Wipe (Shift+W) and A/B (`)';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
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
      if (!this.isOpen && !this.manager.isActive()) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen && !this.manager.isActive()) {
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
    this.dropdown.setAttribute('role', 'dialog');
    this.dropdown.setAttribute('aria-label', 'Compare Settings');
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
      max-height: min(75vh, 560px);
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      gap: 8px;
    `;

    this.populateDropdown();
    this.container.appendChild(this.button);
  }

  /**
   * Forward all manager events to this control's EventEmitter,
   * plus update UI when state changes.
   */
  private bindManagerEvents(): void {
    this.manager.on('wipeModeChanged', (mode) => {
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('wipeModeChanged', mode);
    });
    this.manager.on('wipePositionChanged', (pos) => {
      this.emit('wipePositionChanged', pos);
    });
    this.manager.on('abSourceChanged', (source) => {
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('abSourceChanged', source);
    });
    this.manager.on('abToggled', () => {
      this.emit('abToggled', undefined);
    });
    this.manager.on('differenceMatteChanged', (state) => {
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('differenceMatteChanged', state);
    });
    this.manager.on('blendModeChanged', (state) => {
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('blendModeChanged', state);
    });
    this.manager.on('quadViewChanged', (state) => {
      this.updateButtonLabel();
      this.updateDropdownStates();
      this.emit('quadViewChanged', state);
    });
    this.manager.on('stateChanged', (state) => {
      this.emit('stateChanged', state);
    });
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
    toggleButton.textContent = '\u21C4';
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

    const managerState = this.manager.getState();
    const gainSlider = document.createElement('input');
    gainSlider.type = 'range';
    gainSlider.min = '1';
    gainSlider.max = '10';
    gainSlider.step = '0.5';
    gainSlider.value = String(managerState.differenceMatte.gain);
    gainSlider.dataset.testid = 'diff-matte-gain';
    gainSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    gainSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.setDifferenceMatteGain(value);
      gainValue.textContent = `${value.toFixed(1)}x`;
    });

    const gainValue = document.createElement('span');
    gainValue.className = 'diff-gain-value';
    gainValue.textContent = `${managerState.differenceMatte.gain.toFixed(1)}x`;
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
    onionOpacitySlider.value = String(managerState.blendMode.onionOpacity * 100);
    onionOpacitySlider.dataset.testid = 'onion-opacity-slider';
    onionOpacitySlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    onionOpacitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value) / 100;
      this.setOnionOpacity(value);
    });

    const onionOpacityValue = document.createElement('span');
    onionOpacityValue.className = 'onion-opacity-value';
    onionOpacityValue.textContent = `${Math.round(managerState.blendMode.onionOpacity * 100)}%`;
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
    flickerRateSlider.value = String(managerState.blendMode.flickerRate);
    flickerRateSlider.dataset.testid = 'flicker-rate-slider';
    flickerRateSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    flickerRateSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.setFlickerRate(value);
    });

    const flickerRateValue = document.createElement('span');
    flickerRateValue.className = 'flicker-rate-value';
    flickerRateValue.textContent = `${managerState.blendMode.flickerRate} Hz`;
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
    blendRatioSlider.value = String(managerState.blendMode.blendRatio * 100);
    blendRatioSlider.dataset.testid = 'blend-ratio-slider';
    blendRatioSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    blendRatioSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value) / 100;
      this.setBlendRatio(value);
    });

    const blendRatioValue = document.createElement('span');
    blendRatioValue.className = 'blend-ratio-value';
    blendRatioValue.textContent = `${Math.round(managerState.blendMode.blendRatio * 100)}%`;
    blendRatioValue.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 35px; text-align: right;';

    blendRatioRow.appendChild(blendRatioLabel);
    blendRatioRow.appendChild(blendRatioSlider);
    blendRatioRow.appendChild(blendRatioValue);
    blendSection.appendChild(blendRatioRow);

    this.dropdown.appendChild(blendSection);

    // Divider
    const divider4 = document.createElement('div');
    divider4.style.cssText = 'height: 1px; background: var(--border-primary); margin: 4px 0;';
    this.dropdown.appendChild(divider4);

    // Quad View section
    const quadSection = document.createElement('div');
    quadSection.className = 'quad-view-section';
    quadSection.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const quadHeader = document.createElement('div');
    quadHeader.textContent = 'Quad View';
    quadHeader.style.cssText = 'color: var(--text-secondary); font-size: 10px; text-transform: uppercase; padding: 4px 6px;';
    quadSection.appendChild(quadHeader);

    // Quad view toggle button
    const quadToggle = document.createElement('button');
    quadToggle.dataset.testid = 'quad-view-toggle';
    quadToggle.style.cssText = `
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
    quadToggle.innerHTML = `${getIconSvg('columns', 'sm')}<span>Enable Quad View</span>`;
    quadToggle.addEventListener('mouseenter', () => {
      quadToggle.style.background = 'var(--bg-hover)';
    });
    quadToggle.addEventListener('mouseleave', () => {
      this.updateQuadToggleStyle(quadToggle);
    });
    quadToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setQuadViewEnabled(!this.isQuadViewEnabled());
    });
    quadSection.appendChild(quadToggle);

    // Source assignment rows (shown when quad view is enabled)
    const quadSourcesContainer = document.createElement('div');
    quadSourcesContainer.className = 'quad-sources-container';
    quadSourcesContainer.style.cssText = 'display: none; flex-direction: column; gap: 2px; padding: 4px 10px;';

    const quadLabels = ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'];
    const sources: ABSource[] = ['A', 'B', 'C', 'D'];

    for (let i = 0; i < 4; i++) {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 6px;';

      const label = document.createElement('span');
      label.textContent = `${quadLabels[i]}:`;
      label.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 75px;';

      const select = document.createElement('select');
      select.dataset.testid = `quad-source-${i}`;
      select.dataset.quadrant = String(i);
      select.style.cssText = `
        flex: 1;
        background: var(--bg-primary);
        border: 1px solid var(--border-secondary);
        color: var(--text-primary);
        padding: 3px 6px;
        border-radius: 3px;
        font-size: 11px;
        cursor: pointer;
      `;

      for (const src of sources) {
        const option = document.createElement('option');
        option.value = src;
        option.textContent = src;
        if (managerState.quadView.sources[i] === src) {
          option.selected = true;
        }
        select.appendChild(option);
      }

      select.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const quadrant = parseInt(target.dataset.quadrant!, 10) as 0 | 1 | 2 | 3;
        this.setQuadViewSource(quadrant, target.value as ABSource);
      });

      row.appendChild(label);
      row.appendChild(select);
      quadSourcesContainer.appendChild(row);
    }

    quadSection.appendChild(quadSourcesContainer);
    this.dropdown.appendChild(quadSection);

    this.updateDropdownStates();
  }

  private createBlendModeButton(mode: ComparisonBlendMode, label: string, icon: IconName): HTMLButtonElement {
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
    const state = this.manager.getState();
    const parts: string[] = [];

    if (state.quadView.enabled) {
      parts.push('Quad');
    } else if (state.differenceMatte.enabled) {
      parts.push('Diff');
    } else if (state.blendMode.mode !== 'off') {
      const blendLabels: Record<ComparisonBlendMode, string> = {
        off: '',
        onionskin: 'Onion',
        flicker: 'Flicker',
        blend: 'Blend',
      };
      parts.push(blendLabels[state.blendMode.mode]);
    } else if (state.wipeMode !== 'off') {
      const wipeLabels: Record<WipeMode, string> = {
        'off': '',
        'horizontal': 'H-Wipe',
        'vertical': 'V-Wipe',
        'splitscreen-h': 'Split-H',
        'splitscreen-v': 'Split-V',
      };
      parts.push(wipeLabels[state.wipeMode]);
    }
    if (state.currentAB === 'B' && state.abAvailable) {
      parts.push('B');
    }

    const label = parts.length > 0 ? parts.join(' + ') : 'Compare';
    this.button.innerHTML = `${getIconSvg('columns', 'sm')}<span>${label}</span><span style="font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.manager.isActive()) {
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
    const isActive = this.manager.getWipeMode() === mode;
    option.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    option.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
    option.setAttribute('aria-pressed', String(isActive));
  }

  private updateDropdownStates(): void {
    const state = this.manager.getState();

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
        const isActive = state.currentAB === 'A';
        aButton.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
        aButton.style.borderColor = isActive ? 'var(--accent-primary)' : 'var(--border-secondary)';
        aButton.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
        aButton.setAttribute('aria-pressed', String(isActive));
      }

      if (bButton) {
        const isActive = state.currentAB === 'B';
        bButton.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
        bButton.style.borderColor = isActive ? 'var(--accent-primary)' : 'var(--border-secondary)';
        bButton.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
        bButton.disabled = !state.abAvailable;
        bButton.style.opacity = state.abAvailable ? '1' : '0.5';
        bButton.title = state.abAvailable ? 'Switch to B source' : 'Load a second source to enable A/B compare';
        bButton.setAttribute('aria-pressed', String(isActive));
        bButton.setAttribute('aria-disabled', String(!state.abAvailable));
      }

      if (toggleButton) {
        toggleButton.disabled = !state.abAvailable;
        toggleButton.style.opacity = state.abAvailable ? '1' : '0.5';
        toggleButton.title = state.abAvailable ? 'Toggle between A and B' : 'Load a second source to enable A/B toggle';
        toggleButton.setAttribute('aria-disabled', String(!state.abAvailable));
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
        diffToggle.disabled = !state.abAvailable;
        diffToggle.style.opacity = state.abAvailable ? '1' : '0.5';
        diffToggle.title = state.abAvailable ? 'Toggle difference matte' : 'Load a second source to enable difference matte';
      }

      if (heatmapToggle) {
        this.updateHeatmapToggleStyle(heatmapToggle);
        // Disable if difference matte not enabled
        heatmapToggle.disabled = !state.differenceMatte.enabled;
        heatmapToggle.style.opacity = state.differenceMatte.enabled ? '1' : '0.5';
      }

      if (gainSlider) {
        gainSlider.value = String(state.differenceMatte.gain);
        gainSlider.disabled = !state.differenceMatte.enabled;
        gainSlider.style.opacity = state.differenceMatte.enabled ? '1' : '0.5';
      }

      if (gainValue) {
        gainValue.textContent = `${state.differenceMatte.gain.toFixed(1)}x`;
        gainValue.style.opacity = state.differenceMatte.enabled ? '1' : '0.5';
      }
    }

    // Update blend mode controls
    const blendSection = this.dropdown.querySelector('.blend-modes-section');
    if (blendSection) {
      const blendModes: ComparisonBlendMode[] = ['onionskin', 'flicker', 'blend'];
      for (const mode of blendModes) {
        const button = blendSection.querySelector(`[data-blend-mode="${mode}"]`) as HTMLButtonElement;
        if (button) {
          this.updateBlendModeButtonStyle(button, mode);
          button.disabled = !state.abAvailable;
          button.style.opacity = state.abAvailable ? '1' : '0.5';
          if (!state.abAvailable) button.title = 'Load a second source to enable blend modes';
        }
      }

      // Onion skin slider
      const onionOpacityRow = blendSection.querySelector('.onion-opacity-row') as HTMLElement;
      if (onionOpacityRow) {
        onionOpacityRow.style.display = state.blendMode.mode === 'onionskin' ? 'flex' : 'none';
        const slider = onionOpacityRow.querySelector('[data-testid="onion-opacity-slider"]') as HTMLInputElement;
        const valueSpan = onionOpacityRow.querySelector('.onion-opacity-value') as HTMLSpanElement;
        if (slider) slider.value = String(state.blendMode.onionOpacity * 100);
        if (valueSpan) valueSpan.textContent = `${Math.round(state.blendMode.onionOpacity * 100)}%`;
      }

      // Flicker rate slider
      const flickerRateRow = blendSection.querySelector('.flicker-rate-row') as HTMLElement;
      if (flickerRateRow) {
        flickerRateRow.style.display = state.blendMode.mode === 'flicker' ? 'flex' : 'none';
        const slider = flickerRateRow.querySelector('[data-testid="flicker-rate-slider"]') as HTMLInputElement;
        const valueSpan = flickerRateRow.querySelector('.flicker-rate-value') as HTMLSpanElement;
        if (slider) slider.value = String(state.blendMode.flickerRate);
        if (valueSpan) valueSpan.textContent = `${state.blendMode.flickerRate} Hz`;
      }

      // Blend ratio slider
      const blendRatioRow = blendSection.querySelector('.blend-ratio-row') as HTMLElement;
      if (blendRatioRow) {
        blendRatioRow.style.display = state.blendMode.mode === 'blend' ? 'flex' : 'none';
        const slider = blendRatioRow.querySelector('[data-testid="blend-ratio-slider"]') as HTMLInputElement;
        const valueSpan = blendRatioRow.querySelector('.blend-ratio-value') as HTMLSpanElement;
        if (slider) slider.value = String(state.blendMode.blendRatio * 100);
        if (valueSpan) valueSpan.textContent = `${Math.round(state.blendMode.blendRatio * 100)}%`;
      }
    }

    // Update quad view controls
    const quadSection = this.dropdown.querySelector('.quad-view-section');
    if (quadSection) {
      const quadToggle = quadSection.querySelector('[data-testid="quad-view-toggle"]') as HTMLButtonElement;
      if (quadToggle) {
        this.updateQuadToggleStyle(quadToggle);
      }

      const quadSourcesContainer = quadSection.querySelector('.quad-sources-container') as HTMLElement;
      if (quadSourcesContainer) {
        quadSourcesContainer.style.display = state.quadView.enabled ? 'flex' : 'none';

        // Update select values
        const quadSources = state.quadView.sources;
        for (let i = 0; i < 4; i++) {
          const select = quadSourcesContainer.querySelector(`[data-testid="quad-source-${i}"]`) as HTMLSelectElement;
          if (select) {
            select.value = quadSources[i as 0 | 1 | 2 | 3];
          }
        }
      }
    }
  }

  private updateBlendModeButtonStyle(button: HTMLButtonElement, mode: ComparisonBlendMode): void {
    const isActive = this.manager.getBlendMode() === mode;
    button.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    button.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
    button.setAttribute('aria-pressed', String(isActive));
  }

  private updateDiffToggleStyle(toggle: HTMLButtonElement): void {
    const isActive = this.manager.isDifferenceMatteEnabled();
    toggle.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    toggle.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
    toggle.setAttribute('aria-pressed', String(isActive));
  }

  private updateHeatmapToggleStyle(toggle: HTMLButtonElement): void {
    const isActive = this.manager.getDifferenceMatteState().heatmap;
    toggle.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    toggle.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
    toggle.setAttribute('aria-pressed', String(isActive));
  }

  private updateQuadToggleStyle(toggle: HTMLButtonElement): void {
    const isActive = this.manager.isQuadViewEnabled();
    toggle.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    toggle.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-primary)';
    toggle.setAttribute('aria-pressed', String(isActive));
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
    const dropdownRect = this.dropdown.getBoundingClientRect();
    const viewportPadding = 8;

    let top = rect.bottom + 4;
    let left = rect.left;

    // Prefer rendering below, then flip above if needed.
    if (top + dropdownRect.height > window.innerHeight - viewportPadding) {
      top = rect.top - dropdownRect.height - 4;
    }

    // Clamp to viewport edges.
    if (top < viewportPadding) {
      top = viewportPadding;
    }
    if (left + dropdownRect.width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - dropdownRect.width - viewportPadding;
    }
    if (left < viewportPadding) {
      left = viewportPadding;
    }

    this.dropdown.style.top = `${top}px`;
    this.dropdown.style.left = `${left}px`;
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
    this.dropdown.style.display = 'flex';
    this.positionDropdown();
    this.button.setAttribute('aria-expanded', 'true');
    this.button.style.background = 'var(--bg-hover)';
    this.button.style.borderColor = 'var(--border-primary)';

    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonLabel();

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  /** Close the dropdown if currently open (public API for panel.close). */
  close(): void {
    if (this.isOpen) {
      this.closeDropdown();
    }
  }

  /** Returns true when the dropdown is visible. */
  isDropdownVisible(): boolean {
    return this.isOpen;
  }

  // === Public API: delegates to ComparisonManager ===

  // Wipe methods
  setWipeMode(mode: WipeMode): void {
    this.manager.setWipeMode(mode);
  }

  cycleWipeMode(): void {
    this.manager.cycleWipeMode();
  }

  getWipeMode(): WipeMode {
    return this.manager.getWipeMode();
  }

  setWipePosition(position: number): void {
    this.manager.setWipePosition(position);
  }

  getWipePosition(): number {
    return this.manager.getWipePosition();
  }

  // A/B methods
  setABSource(source: ABSource): void {
    this.manager.setABSource(source);
  }

  toggleAB(): void {
    this.manager.toggleAB();
  }

  getABSource(): ABSource {
    return this.manager.getABSource();
  }

  setABAvailable(available: boolean): void {
    this.manager.setABAvailable(available);
    this.updateDropdownStates();
    this.updateButtonLabel();
  }

  isABAvailable(): boolean {
    return this.manager.isABAvailable();
  }

  // Difference Matte methods
  toggleDifferenceMatte(): void {
    this.manager.toggleDifferenceMatte();
  }

  setDifferenceMatteEnabled(enabled: boolean): void {
    this.manager.setDifferenceMatteEnabled(enabled);
  }

  setDifferenceMatteGain(gain: number): void {
    this.manager.setDifferenceMatteGain(gain);
  }

  toggleDifferenceMatteHeatmap(): void {
    this.manager.toggleDifferenceMatteHeatmap();
  }

  setDifferenceMatteHeatmap(enabled: boolean): void {
    this.manager.setDifferenceMatteHeatmap(enabled);
  }

  getDifferenceMatteState(): DifferenceMatteState {
    return this.manager.getDifferenceMatteState();
  }

  isDifferenceMatteEnabled(): boolean {
    return this.manager.isDifferenceMatteEnabled();
  }

  // Blend Mode methods

  /**
   * Toggle a blend mode on/off.
   * If the specified mode is already active, turns it off.
   * Otherwise, activates the specified mode.
   * @param mode - The blend mode to toggle ('onionskin' | 'flicker' | 'blend')
   */
  toggleBlendMode(mode: ComparisonBlendMode): void {
    this.manager.toggleBlendMode(mode);
  }

  /**
   * Set the active blend mode.
   * Automatically disables wipe mode and difference matte when enabling a blend mode.
   * @param mode - The blend mode to set ('off' | 'onionskin' | 'flicker' | 'blend')
   */
  setBlendMode(mode: ComparisonBlendMode): void {
    this.manager.setBlendMode(mode);
  }

  /**
   * Get the current blend mode.
   * @returns The active blend mode ('off' | 'onionskin' | 'flicker' | 'blend')
   */
  getBlendMode(): ComparisonBlendMode {
    return this.manager.getBlendMode();
  }

  /**
   * Get the complete blend mode state including all parameters.
   * @returns A copy of the blend mode state object
   */
  getBlendModeState(): BlendModeState {
    return this.manager.getBlendModeState();
  }

  /**
   * Set the opacity for onion skin blend mode.
   * @param opacity - Opacity value between 0 (transparent) and 1 (opaque)
   */
  setOnionOpacity(opacity: number): void {
    this.manager.setOnionOpacity(opacity);
  }

  /**
   * Get the current onion skin opacity.
   * @returns Opacity value between 0 and 1
   */
  getOnionOpacity(): number {
    return this.manager.getOnionOpacity();
  }

  /**
   * Set the flicker rate for flicker blend mode.
   * @param rate - Flicker frequency in Hz (1-30)
   */
  setFlickerRate(rate: number): void {
    this.manager.setFlickerRate(rate);
  }

  /**
   * Get the current flicker rate.
   * @returns Flicker frequency in Hz (1-30)
   */
  getFlickerRate(): number {
    return this.manager.getFlickerRate();
  }

  /**
   * Get the current flicker frame (for rendering).
   * Alternates between 0 (show A) and 1 (show B) at the flicker rate.
   * @returns Current frame index (0 or 1)
   */
  getFlickerFrame(): 0 | 1 {
    return this.manager.getFlickerFrame();
  }

  /**
   * Set the blend ratio for blend mode.
   * @param ratio - Blend ratio between 0 (100% A) and 1 (100% B), 0.5 = 50/50
   */
  setBlendRatio(ratio: number): void {
    this.manager.setBlendRatio(ratio);
  }

  /**
   * Get the current blend ratio.
   * @returns Blend ratio between 0 and 1
   */
  getBlendRatio(): number {
    return this.manager.getBlendRatio();
  }

  // Quad View methods

  /**
   * Enable or disable quad view mode.
   */
  setQuadViewEnabled(enabled: boolean): void {
    this.manager.setQuadViewEnabled(enabled);
  }

  /**
   * Toggle quad view on/off.
   */
  toggleQuadView(): void {
    this.manager.toggleQuadView();
  }

  /**
   * Check if quad view is enabled.
   */
  isQuadViewEnabled(): boolean {
    return this.manager.isQuadViewEnabled();
  }

  /**
   * Set the source for a specific quadrant.
   */
  setQuadViewSource(quadrant: 0 | 1 | 2 | 3, source: ABSource): void {
    this.manager.setQuadSource(quadrant, source);
  }

  /**
   * Get quad view sources.
   */
  getQuadSources(): [ABSource, ABSource, ABSource, ABSource] {
    return this.manager.getQuadSources();
  }

  /**
   * Get the complete quad view state.
   */
  getQuadViewState(): QuadViewState {
    return this.manager.getQuadViewState();
  }

  getState(): CompareState {
    return this.manager.getState();
  }

  /**
   * Get wipe state for WipeControl compatibility
   */
  getWipeState(): { mode: WipeMode; position: number; showOriginal: 'left' | 'right' | 'top' | 'bottom' } {
    return this.manager.getWipeState();
  }

  /**
   * Check if split screen mode is active
   */
  isSplitScreenMode(): boolean {
    return this.manager.isSplitScreenMode();
  }

  /**
   * Toggle split screen mode (cycles between off, horizontal split, vertical split)
   */
  toggleSplitScreen(): void {
    this.manager.toggleSplitScreen();
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.manager.dispose();
    this.closeDropdown();
    if (document.body.contains(this.dropdown)) {
      document.body.removeChild(this.dropdown);
    }
  }
}
