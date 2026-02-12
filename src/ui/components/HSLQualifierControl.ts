/**
 * HSLQualifierControl - UI control for HSL Qualifier / Secondary Color Correction
 *
 * Features:
 * - Toggle button with dropdown panel
 * - HSL range sliders with visual hue gradient
 * - Correction sliders
 * - Matte preview toggle
 * - Invert selection toggle
 * - Eyedropper for color picking
 */

import { HSLQualifier, HSLQualifierState } from './HSLQualifier';
import { getIconSvg } from './shared/Icons';

export class HSLQualifierControl {
  private container: HTMLElement;
  private dropdown: HTMLElement;
  private hslQualifier: HSLQualifier;
  private isDropdownOpen = false;
  private toggleButton: HTMLButtonElement;
  private boundHandleReposition: () => void;
  private eyedropperActive = false;
  private onEyedropperCallback: ((active: boolean) => void) | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor(hslQualifier: HSLQualifier) {
    this.hslQualifier = hslQualifier;
    this.boundHandleReposition = () => this.positionDropdown();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'hsl-qualifier-control';
    this.container.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'hsl-qualifier-toggle';
    this.toggleButton.dataset.testid = 'hsl-qualifier-control-toggle';
    this.toggleButton.innerHTML = `${getIconSvg('eyedropper', 'sm')} <span>HSL</span> ${getIconSvg('chevron-down', 'sm')}`;
    this.toggleButton.title = 'HSL Qualifier - Secondary color correction (Shift+H)';
    this.toggleButton.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--text-muted);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    `;

    this.toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.toggleButton.addEventListener('mouseenter', () => {
      if (!this.hslQualifier.isEnabled()) {
        this.toggleButton.style.background = 'rgba(255, 255, 255, 0.05)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });

    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.hslQualifier.isEnabled()) {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);

    // Create dropdown panel
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'hsl-qualifier-dropdown';
    this.dropdown.dataset.testid = 'hsl-qualifier-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: rgba(30, 30, 30, 0.98);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 10px;
      min-width: 300px;
      max-height: 500px;
      overflow-y: auto;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.createDropdownContent();
    this.container.appendChild(this.dropdown);

    // Close dropdown on outside click
    document.addEventListener('click', this.handleOutsideClick);

    // Listen for state changes
    this.unsubscribers.push(this.hslQualifier.on('stateChanged', () => {
      this.updateButtonState();
      this.updateSliders();
    }));
  }

  private createDropdownContent(): void {
    // Header with enable toggle
    const header = this.createHeader();
    this.dropdown.appendChild(header);

    // Selection section (HSL ranges)
    const selectionSection = this.createSelectionSection();
    this.dropdown.appendChild(selectionSection);

    // Correction section
    const correctionSection = this.createCorrectionSection();
    this.dropdown.appendChild(correctionSection);

    // Options section
    const optionsSection = this.createOptionsSection();
    this.dropdown.appendChild(optionsSection);

    // Initial update
    this.updateButtonState();
    this.updateSliders();
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--border-primary);
    `;

    // Title and enable toggle
    const leftSide = document.createElement('div');
    leftSide.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = this.hslQualifier.isEnabled();
    enableCheckbox.dataset.testid = 'hsl-enable-checkbox';
    enableCheckbox.style.cssText = 'cursor: pointer;';
    enableCheckbox.addEventListener('change', () => {
      this.hslQualifier.toggle();
    });

    this.unsubscribers.push(this.hslQualifier.on('stateChanged', (state) => {
      enableCheckbox.checked = state.enabled;
    }));

    const title = document.createElement('span');
    title.textContent = 'HSL Qualifier';
    title.style.cssText = 'color: var(--text-primary); font-size: 12px; font-weight: 500;';

    leftSide.appendChild(enableCheckbox);
    leftSide.appendChild(title);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.dataset.testid = 'hsl-reset-button';
    resetBtn.style.cssText = `
      padding: 3px 8px;
      border: 1px solid var(--border-secondary);
      border-radius: 3px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 10px;
      cursor: pointer;
    `;
    resetBtn.addEventListener('click', () => this.hslQualifier.reset());
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'var(--border-primary)'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = '#333'; });

    header.appendChild(leftSide);
    header.appendChild(resetBtn);

    return header;
  }

  private createSelectionSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const sectionTitle = document.createElement('div');
    sectionTitle.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const titleText = document.createElement('span');
    titleText.textContent = 'Selection (Qualifier)';
    sectionTitle.appendChild(titleText);

    // Eyedropper button
    const eyedropperBtn = document.createElement('button');
    eyedropperBtn.innerHTML = getIconSvg('eyedropper', 'sm');
    eyedropperBtn.title = 'Pick color from image';
    eyedropperBtn.dataset.testid = 'hsl-eyedropper-button';
    eyedropperBtn.style.cssText = `
      padding: 3px 6px;
      border: 1px solid var(--border-secondary);
      border-radius: 3px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
    `;
    eyedropperBtn.addEventListener('click', () => {
      this.eyedropperActive = !this.eyedropperActive;
      eyedropperBtn.style.background = this.eyedropperActive ? 'var(--accent-primary)' : '#333';
      eyedropperBtn.style.color = this.eyedropperActive ? 'var(--text-on-accent)' : 'var(--text-secondary)';
      if (this.onEyedropperCallback) {
        this.onEyedropperCallback(this.eyedropperActive);
      }
    });

    sectionTitle.appendChild(eyedropperBtn);
    section.appendChild(sectionTitle);

    // Hue controls with color gradient
    const hueControl = this.createRangeControl('Hue', 'hue', 0, 360, 1, true);
    section.appendChild(hueControl);

    // Saturation controls
    const satControl = this.createRangeControl('Saturation', 'saturation', 0, 100, 1, false);
    section.appendChild(satControl);

    // Luminance controls
    const lumControl = this.createRangeControl('Luminance', 'luminance', 0, 100, 1, false);
    section.appendChild(lumControl);

    return section;
  }

  private createRangeControl(label: string, key: 'hue' | 'saturation' | 'luminance', min: number, max: number, step: number, isHue: boolean): HTMLElement {
    const control = document.createElement('div');
    control.style.cssText = 'margin-bottom: 8px;';

    // Label row
    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 11px;';

    const state = this.hslQualifier.getState();
    const range = state[key];

    const valueEl = document.createElement('span');
    valueEl.className = `${key}-value`;
    valueEl.textContent = `${range.center}${isHue ? '°' : '%'}`;
    valueEl.style.cssText = 'color: var(--text-secondary); font-size: 10px; font-family: monospace;';

    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);
    control.appendChild(labelRow);

    // Create slider container with optional gradient
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      position: relative;
      height: 20px;
      margin-bottom: 4px;
    `;

    if (isHue) {
      // Add hue gradient background
      const gradient = document.createElement('div');
      gradient.style.cssText = `
        position: absolute;
        top: 7px;
        left: 0;
        right: 0;
        height: 6px;
        border-radius: 3px;
        background: linear-gradient(to right,
          hsl(0, 100%, 50%),
          hsl(60, 100%, 50%),
          hsl(120, 100%, 50%),
          hsl(180, 100%, 50%),
          hsl(240, 100%, 50%),
          hsl(300, 100%, 50%),
          hsl(360, 100%, 50%)
        );
      `;
      sliderContainer.appendChild(gradient);
    }

    // Center slider
    const centerSlider = document.createElement('input');
    centerSlider.type = 'range';
    centerSlider.min = String(min);
    centerSlider.max = String(max);
    centerSlider.step = String(step);
    centerSlider.value = String(range.center);
    centerSlider.dataset.testid = `hsl-${key}-center`;
    centerSlider.style.cssText = `
      position: absolute;
      width: 100%;
      top: 0;
      height: 20px;
      cursor: pointer;
      ${isHue ? 'background: transparent; -webkit-appearance: none;' : ''}
    `;

    centerSlider.addEventListener('input', () => {
      const value = parseFloat(centerSlider.value);
      valueEl.textContent = `${value}${isHue ? '°' : '%'}`;
      if (key === 'hue') {
        this.hslQualifier.setHueRange({ center: value });
      } else if (key === 'saturation') {
        this.hslQualifier.setSaturationRange({ center: value });
      } else {
        this.hslQualifier.setLuminanceRange({ center: value });
      }
    });

    sliderContainer.appendChild(centerSlider);
    control.appendChild(sliderContainer);

    // Width and softness row
    const rangeRow = document.createElement('div');
    rangeRow.style.cssText = `
      display: flex;
      gap: 8px;
      font-size: 10px;
    `;

    // Width control
    const widthGroup = document.createElement('div');
    widthGroup.style.cssText = 'flex: 1;';

    const widthLabel = document.createElement('div');
    widthLabel.style.cssText = 'color: var(--text-muted); margin-bottom: 2px;';
    widthLabel.textContent = 'Width';

    const widthSlider = document.createElement('input');
    widthSlider.type = 'range';
    widthSlider.min = '0';
    widthSlider.max = isHue ? '180' : '100';
    widthSlider.step = '1';
    widthSlider.value = String(range.width);
    widthSlider.dataset.testid = `hsl-${key}-width`;
    widthSlider.style.cssText = 'width: 100%; height: 12px; cursor: pointer;';

    widthSlider.addEventListener('input', () => {
      const value = parseFloat(widthSlider.value);
      if (key === 'hue') {
        this.hslQualifier.setHueRange({ width: value });
      } else if (key === 'saturation') {
        this.hslQualifier.setSaturationRange({ width: value });
      } else {
        this.hslQualifier.setLuminanceRange({ width: value });
      }
    });

    widthGroup.appendChild(widthLabel);
    widthGroup.appendChild(widthSlider);

    // Softness control
    const softGroup = document.createElement('div');
    softGroup.style.cssText = 'flex: 1;';

    const softLabel = document.createElement('div');
    softLabel.style.cssText = 'color: var(--text-muted); margin-bottom: 2px;';
    softLabel.textContent = 'Softness';

    const softSlider = document.createElement('input');
    softSlider.type = 'range';
    softSlider.min = '0';
    softSlider.max = '100';
    softSlider.step = '1';
    softSlider.value = String(range.softness);
    softSlider.dataset.testid = `hsl-${key}-softness`;
    softSlider.style.cssText = 'width: 100%; height: 12px; cursor: pointer;';

    softSlider.addEventListener('input', () => {
      const value = parseFloat(softSlider.value);
      if (key === 'hue') {
        this.hslQualifier.setHueRange({ softness: value });
      } else if (key === 'saturation') {
        this.hslQualifier.setSaturationRange({ softness: value });
      } else {
        this.hslQualifier.setLuminanceRange({ softness: value });
      }
    });

    softGroup.appendChild(softLabel);
    softGroup.appendChild(softSlider);

    rangeRow.appendChild(widthGroup);
    rangeRow.appendChild(softGroup);
    control.appendChild(rangeRow);

    return control;
  }

  private createCorrectionSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const sectionTitle = document.createElement('div');
    sectionTitle.textContent = 'Correction';
    sectionTitle.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 10px;
    `;
    section.appendChild(sectionTitle);

    // Hue shift
    const hueShift = this.createCorrectionSlider('Hue Shift', 'hueShift', -180, 180, 1, (v) => `${v > 0 ? '+' : ''}${v}°`);
    section.appendChild(hueShift);

    // Saturation scale
    const satScale = this.createCorrectionSlider('Saturation', 'saturationScale', 0, 2, 0.01, (v) => `${Math.round(v * 100)}%`);
    section.appendChild(satScale);

    // Luminance scale
    const lumScale = this.createCorrectionSlider('Luminance', 'luminanceScale', 0, 2, 0.01, (v) => `${Math.round(v * 100)}%`);
    section.appendChild(lumScale);

    return section;
  }

  private createCorrectionSlider(
    label: string,
    key: keyof HSLQualifierState['correction'],
    min: number,
    max: number,
    step: number,
    format: (v: number) => string
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 11px; width: 70px; flex-shrink: 0;';

    const state = this.hslQualifier.getState();
    const value = state.correction[key];

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.className = `correction-${key}`;
    slider.dataset.testid = `hsl-correction-${key}`;
    slider.style.cssText = 'flex: 1; height: 16px; cursor: pointer;';

    const valueEl = document.createElement('span');
    valueEl.className = `correction-${key}-value`;
    valueEl.textContent = format(value);
    valueEl.style.cssText = 'color: var(--text-secondary); font-size: 10px; font-family: monospace; width: 45px; text-align: right;';

    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      valueEl.textContent = format(val);
      this.hslQualifier.setCorrection({ [key]: val });
    });

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(valueEl);

    return row;
  }

  private createOptionsSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      display: flex;
      gap: 16px;
    `;

    // Invert toggle
    const invertGroup = document.createElement('label');
    invertGroup.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    `;

    const invertCheckbox = document.createElement('input');
    invertCheckbox.type = 'checkbox';
    invertCheckbox.checked = this.hslQualifier.getState().invert;
    invertCheckbox.dataset.testid = 'hsl-invert-checkbox';
    invertCheckbox.style.cssText = 'cursor: pointer;';

    invertCheckbox.addEventListener('change', () => {
      this.hslQualifier.setInvert(invertCheckbox.checked);
    });

    this.unsubscribers.push(this.hslQualifier.on('stateChanged', (state) => {
      invertCheckbox.checked = state.invert;
    }));

    const invertLabel = document.createElement('span');
    invertLabel.textContent = 'Invert';
    invertLabel.style.cssText = 'color: var(--text-secondary); font-size: 11px;';

    invertGroup.appendChild(invertCheckbox);
    invertGroup.appendChild(invertLabel);

    // Matte preview toggle
    const matteGroup = document.createElement('label');
    matteGroup.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    `;

    const matteCheckbox = document.createElement('input');
    matteCheckbox.type = 'checkbox';
    matteCheckbox.checked = this.hslQualifier.getState().mattePreview;
    matteCheckbox.dataset.testid = 'hsl-matte-checkbox';
    matteCheckbox.style.cssText = 'cursor: pointer;';

    matteCheckbox.addEventListener('change', () => {
      this.hslQualifier.setMattePreview(matteCheckbox.checked);
    });

    this.unsubscribers.push(this.hslQualifier.on('stateChanged', (state) => {
      matteCheckbox.checked = state.mattePreview;
    }));

    const matteLabel = document.createElement('span');
    matteLabel.textContent = 'Matte Preview';
    matteLabel.style.cssText = 'color: var(--text-secondary); font-size: 11px;';

    matteGroup.appendChild(matteCheckbox);
    matteGroup.appendChild(matteLabel);

    section.appendChild(invertGroup);
    section.appendChild(matteGroup);

    return section;
  }

  private updateButtonState(): void {
    const enabled = this.hslQualifier.isEnabled();
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

  private updateSliders(): void {
    const state = this.hslQualifier.getState();

    // Update hue value display
    const hueValue = this.dropdown.querySelector('.hue-value');
    if (hueValue) hueValue.textContent = `${state.hue.center}°`;

    // Update saturation value display
    const satValue = this.dropdown.querySelector('.saturation-value');
    if (satValue) satValue.textContent = `${state.saturation.center}%`;

    // Update luminance value display
    const lumValue = this.dropdown.querySelector('.luminance-value');
    if (lumValue) lumValue.textContent = `${state.luminance.center}%`;

    // Update slider values
    const hueCenter = this.dropdown.querySelector('[data-testid="hsl-hue-center"]') as HTMLInputElement;
    if (hueCenter) hueCenter.value = String(state.hue.center);

    const hueWidth = this.dropdown.querySelector('[data-testid="hsl-hue-width"]') as HTMLInputElement;
    if (hueWidth) hueWidth.value = String(state.hue.width);

    const hueSoftness = this.dropdown.querySelector('[data-testid="hsl-hue-softness"]') as HTMLInputElement;
    if (hueSoftness) hueSoftness.value = String(state.hue.softness);

    const satCenter = this.dropdown.querySelector('[data-testid="hsl-saturation-center"]') as HTMLInputElement;
    if (satCenter) satCenter.value = String(state.saturation.center);

    const satWidth = this.dropdown.querySelector('[data-testid="hsl-saturation-width"]') as HTMLInputElement;
    if (satWidth) satWidth.value = String(state.saturation.width);

    const satSoftness = this.dropdown.querySelector('[data-testid="hsl-saturation-softness"]') as HTMLInputElement;
    if (satSoftness) satSoftness.value = String(state.saturation.softness);

    const lumCenter = this.dropdown.querySelector('[data-testid="hsl-luminance-center"]') as HTMLInputElement;
    if (lumCenter) lumCenter.value = String(state.luminance.center);

    const lumWidth = this.dropdown.querySelector('[data-testid="hsl-luminance-width"]') as HTMLInputElement;
    if (lumWidth) lumWidth.value = String(state.luminance.width);

    const lumSoftness = this.dropdown.querySelector('[data-testid="hsl-luminance-softness"]') as HTMLInputElement;
    if (lumSoftness) lumSoftness.value = String(state.luminance.softness);

    // Update correction sliders
    const hueShiftSlider = this.dropdown.querySelector('[data-testid="hsl-correction-hueShift"]') as HTMLInputElement;
    if (hueShiftSlider) hueShiftSlider.value = String(state.correction.hueShift);

    const hueShiftValue = this.dropdown.querySelector('.correction-hueShift-value');
    if (hueShiftValue) hueShiftValue.textContent = `${state.correction.hueShift > 0 ? '+' : ''}${state.correction.hueShift}°`;

    const satScaleSlider = this.dropdown.querySelector('[data-testid="hsl-correction-saturationScale"]') as HTMLInputElement;
    if (satScaleSlider) satScaleSlider.value = String(state.correction.saturationScale);

    const satScaleValue = this.dropdown.querySelector('.correction-saturationScale-value');
    if (satScaleValue) satScaleValue.textContent = `${Math.round(state.correction.saturationScale * 100)}%`;

    const lumScaleSlider = this.dropdown.querySelector('[data-testid="hsl-correction-luminanceScale"]') as HTMLInputElement;
    if (lumScaleSlider) lumScaleSlider.value = String(state.correction.luminanceScale);

    const lumScaleValue = this.dropdown.querySelector('.correction-luminanceScale-value');
    if (lumScaleValue) lumScaleValue.textContent = `${Math.round(state.correction.luminanceScale * 100)}%`;
  }

  private toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
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
    const dropdownHeight = this.dropdown.offsetHeight || 400;
    const viewportHeight = window.innerHeight;

    // Position below button if there's room, otherwise above
    let top = rect.bottom + 4;
    if (top + dropdownHeight > viewportHeight - 10) {
      top = rect.top - dropdownHeight - 4;
    }

    this.dropdown.style.top = `${Math.max(10, top)}px`;
    this.dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.container.contains(e.target as Node)) {
      if (this.isDropdownOpen) {
        this.isDropdownOpen = false;
        this.dropdown.style.display = 'none';
        window.removeEventListener('resize', this.boundHandleReposition);
        window.removeEventListener('scroll', this.boundHandleReposition, true);
      }
    }
  };

  /**
   * Set callback for eyedropper activation
   */
  setEyedropperCallback(callback: (active: boolean) => void): void {
    this.onEyedropperCallback = callback;
  }

  /**
   * Deactivate eyedropper (called after color is picked)
   */
  deactivateEyedropper(): void {
    this.eyedropperActive = false;
    const eyedropperBtn = this.dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;
    if (eyedropperBtn) {
      eyedropperBtn.style.background = '#333';
      eyedropperBtn.style.color = 'var(--text-secondary)';
    }
  }

  /**
   * Check if eyedropper is active
   */
  isEyedropperActive(): boolean {
    return this.eyedropperActive;
  }

  /**
   * Get the HSL Qualifier instance
   */
  getHSLQualifier(): HSLQualifier {
    return this.hslQualifier;
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
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}
