/**
 * NoiseReductionControl - UI panel for noise reduction settings
 *
 * Provides controls for strength, luminance/chroma separation, and radius.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  NoiseReductionParams,
  DEFAULT_NOISE_REDUCTION_PARAMS,
} from '../../filters/NoiseReduction';
import { getIconSvg } from './shared/Icons';

export interface NoiseReductionControlEvents extends EventMap {
  paramsChanged: NoiseReductionParams;
  reset: void;
}

export class NoiseReductionControl extends EventEmitter<NoiseReductionControlEvents> {
  private container: HTMLElement;
  private params: NoiseReductionParams = { ...DEFAULT_NOISE_REDUCTION_PARAMS };
  private strengthSlider!: HTMLInputElement;
  private strengthValue!: HTMLSpanElement;
  private radiusSlider!: HTMLInputElement;
  private radiusValue!: HTMLSpanElement;
  private advancedSection!: HTMLElement;
  private lumaSlider!: HTMLInputElement;
  private lumaValue!: HTMLSpanElement;
  private chromaSlider!: HTMLInputElement;
  private chromaValue!: HTMLSpanElement;
  private advancedExpanded = false;

  constructor() {
    super();
    this.container = document.createElement('div');
    this.container.className = 'noise-reduction-control';
    this.container.dataset.testid = 'noise-reduction-control';
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 0;
    `;

    this.createControls();
  }

  private createControls(): void {
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
    `;

    const title = document.createElement('span');
    title.textContent = 'Noise Reduction';
    title.style.cssText = 'font-size: 11px; font-weight: 500; color: var(--text-secondary);';

    const resetButton = document.createElement('button');
    resetButton.innerHTML = getIconSvg('reset', 'sm');
    resetButton.title = 'Reset noise reduction';
    resetButton.dataset.testid = 'noise-reduction-reset';
    resetButton.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 2px;
      display: flex;
      align-items: center;
      transition: color 0.12s ease;
    `;
    resetButton.addEventListener('pointerenter', () => {
      resetButton.style.color = 'var(--text-primary)';
    });
    resetButton.addEventListener('pointerleave', () => {
      resetButton.style.color = 'var(--text-muted)';
    });
    resetButton.addEventListener('click', () => this.reset());

    header.appendChild(title);
    header.appendChild(resetButton);
    this.container.appendChild(header);

    // Main strength slider
    const strengthRow = this.createSliderRow(
      'Strength',
      'noise-reduction-slider',
      0,
      100,
      this.params.strength,
      (value) => {
        this.params.strength = value;
        this.strengthValue.textContent = `${value}%`;
        // Auto-update luma/chroma when strength changes (linked mode)
        if (!this.advancedExpanded) {
          this.params.luminanceStrength = value;
          this.params.chromaStrength = Math.min(100, value * 1.5);
          this.lumaSlider.value = String(this.params.luminanceStrength);
          this.lumaValue.textContent = `${Math.round(this.params.luminanceStrength)}%`;
          this.chromaSlider.value = String(this.params.chromaStrength);
          this.chromaValue.textContent = `${Math.round(this.params.chromaStrength)}%`;
        }
        this.emitChange();
      },
      '%'
    );
    this.strengthSlider = strengthRow.slider;
    this.strengthValue = strengthRow.value;
    this.container.appendChild(strengthRow.row);

    // Radius slider
    const radiusRow = this.createSliderRow(
      'Radius',
      'noise-reduction-radius',
      1,
      5,
      this.params.radius,
      (value) => {
        this.params.radius = value;
        this.radiusValue.textContent = String(value);
        this.emitChange();
      },
      '',
      1
    );
    this.radiusSlider = radiusRow.slider;
    this.radiusValue = radiusRow.value;
    this.container.appendChild(radiusRow.row);

    // Advanced section toggle
    const advancedToggle = document.createElement('button');
    advancedToggle.dataset.testid = 'noise-reduction-advanced-toggle';
    advancedToggle.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      font-size: 10px;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 4px;
    `;
    advancedToggle.innerHTML = `${getIconSvg('chevron-right', 'sm')}<span>Advanced</span>`;
    advancedToggle.addEventListener('click', () => this.toggleAdvanced());
    this.container.appendChild(advancedToggle);

    // Advanced section (hidden by default)
    this.advancedSection = document.createElement('div');
    this.advancedSection.className = 'noise-reduction-advanced';
    this.advancedSection.dataset.testid = 'noise-reduction-advanced';
    this.advancedSection.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 8px;
      padding-left: 12px;
      border-left: 1px solid var(--border-primary);
      margin-left: 4px;
    `;

    // Luminance strength
    const lumaRow = this.createSliderRow(
      'Luma',
      'noise-reduction-luma',
      0,
      100,
      this.params.luminanceStrength,
      (value) => {
        this.params.luminanceStrength = value;
        this.lumaValue.textContent = `${value}%`;
        this.emitChange();
      },
      '%'
    );
    this.lumaSlider = lumaRow.slider;
    this.lumaValue = lumaRow.value;
    this.advancedSection.appendChild(lumaRow.row);

    // Chroma strength
    const chromaRow = this.createSliderRow(
      'Chroma',
      'noise-reduction-chroma',
      0,
      100,
      this.params.chromaStrength,
      (value) => {
        this.params.chromaStrength = value;
        this.chromaValue.textContent = `${value}%`;
        this.emitChange();
      },
      '%'
    );
    this.chromaSlider = chromaRow.slider;
    this.chromaValue = chromaRow.value;
    this.advancedSection.appendChild(chromaRow.row);

    this.container.appendChild(this.advancedSection);
  }

  private createSliderRow(
    label: string,
    testId: string,
    min: number,
    max: number,
    initial: number,
    onChange: (value: number) => void,
    suffix = '',
    step = 1
  ): { row: HTMLElement; slider: HTMLInputElement; value: HTMLSpanElement } {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 4px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 50px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initial);
    slider.dataset.testid = testId;
    slider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    slider.addEventListener('input', () => {
      onChange(parseFloat(slider.value));
    });

    const value = document.createElement('span');
    value.textContent = suffix ? `${initial}${suffix}` : String(initial);
    value.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 35px; text-align: right;';

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(value);

    return { row, slider, value };
  }

  private toggleAdvanced(): void {
    this.advancedExpanded = !this.advancedExpanded;
    this.advancedSection.style.display = this.advancedExpanded ? 'flex' : 'none';

    // Update toggle icon
    const toggle = this.container.querySelector('[data-testid="noise-reduction-advanced-toggle"]');
    if (toggle) {
      const iconName = this.advancedExpanded ? 'chevron-down' : 'chevron-right';
      toggle.innerHTML = `${getIconSvg(iconName, 'sm')}<span>Advanced</span>`;
    }
  }

  private emitChange(): void {
    this.emit('paramsChanged', { ...this.params });
  }

  reset(): void {
    this.params = { ...DEFAULT_NOISE_REDUCTION_PARAMS };
    this.strengthSlider.value = String(this.params.strength);
    this.strengthValue.textContent = `${this.params.strength}%`;
    this.radiusSlider.value = String(this.params.radius);
    this.radiusValue.textContent = String(this.params.radius);
    this.lumaSlider.value = String(this.params.luminanceStrength);
    this.lumaValue.textContent = `${this.params.luminanceStrength}%`;
    this.chromaSlider.value = String(this.params.chromaStrength);
    this.chromaValue.textContent = `${this.params.chromaStrength}%`;
    this.emit('reset', undefined);
    this.emitChange();
  }

  getParams(): NoiseReductionParams {
    return { ...this.params };
  }

  setParams(params: Partial<NoiseReductionParams>): void {
    if (params.strength !== undefined) {
      this.params.strength = params.strength;
      this.strengthSlider.value = String(params.strength);
      this.strengthValue.textContent = `${params.strength}%`;
    }
    if (params.radius !== undefined) {
      this.params.radius = params.radius;
      this.radiusSlider.value = String(params.radius);
      this.radiusValue.textContent = String(params.radius);
    }
    if (params.luminanceStrength !== undefined) {
      this.params.luminanceStrength = params.luminanceStrength;
      this.lumaSlider.value = String(params.luminanceStrength);
      this.lumaValue.textContent = `${params.luminanceStrength}%`;
    }
    if (params.chromaStrength !== undefined) {
      this.params.chromaStrength = params.chromaStrength;
      this.chromaSlider.value = String(params.chromaStrength);
      this.chromaValue.textContent = `${params.chromaStrength}%`;
    }
  }

  getStrength(): number {
    return this.params.strength;
  }

  setStrength(value: number): void {
    this.setParams({ strength: Math.max(0, Math.min(100, value)) });
    this.emitChange();
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Inline panel -- no document-level listeners to clean up.
    // All event listeners are on child elements within this.container
    // and will be garbage-collected when the container is removed from the DOM.
  }
}
