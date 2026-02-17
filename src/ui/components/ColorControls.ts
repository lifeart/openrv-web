import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { type LUT3D, isLUT3D, parseLUT } from '../../color/ColorProcessingFacade';
import { showAlert } from './shared/Modal';
import { getIconSvg } from './shared/Icons';

export type { ColorAdjustments, NumericAdjustmentKey } from '../../core/types/color';
export { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';

import type { ColorAdjustments, NumericAdjustmentKey } from '../../core/types/color';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';

export interface ColorControlsEvents extends EventMap {
  adjustmentsChanged: ColorAdjustments;
  visibilityChanged: boolean;
  lutLoaded: LUT3D | null;
  lutIntensityChanged: number;
}

export class ColorControls extends EventEmitter<ColorControlsEvents> {
  private container: HTMLElement;
  private panel: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private isExpanded = false;

  private adjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

  // Slider elements for updating values (numeric adjustments only)
  private sliders: Map<NumericAdjustmentKey, HTMLInputElement> = new Map();
  private valueLabels: Map<NumericAdjustmentKey, HTMLSpanElement> = new Map();

  // LUT state
  private currentLUT: LUT3D | null = null;
  private lutIntensity = 1.0;
  private lutNameLabel: HTMLSpanElement | null = null;
  private lutIntensitySlider: HTMLInputElement | null = null;

  // Throttle state for slider input events
  private _inputThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingAdjustments: ColorAdjustments | null = null;
  private readonly boundHandleKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    super();

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'color-controls-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.innerHTML = `${getIconSvg('palette', 'sm')}<span style="margin-left: 6px;">Color</span>`;
    this.toggleButton.dataset.testid = 'color-control-button';
    this.toggleButton.title = 'Toggle color adjustments panel';
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
    `;
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
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.borderColor = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });
    this.container.appendChild(this.toggleButton);

    // Create expandable panel (rendered at body level)
    this.panel = document.createElement('div');
    this.panel.className = 'color-controls-panel';
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 280px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createSliders();
    // Panel will be appended to body when shown

    // Close on outside click
    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.boundHandleDocumentClick);

    // Close on Escape key
    this.boundHandleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.hide();
      }
    };
  }

  private boundHandleDocumentClick: (e: MouseEvent) => void;

  private handleDocumentClick(e: MouseEvent): void {
    if (this.isExpanded && !this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
      this.hide();
    }
  }


  private createSliders(): void {
    const sliderConfigs: Array<{
      key: NumericAdjustmentKey;
      label: string;
      min: number;
      max: number;
      step: number;
      format: (v: number) => string;
    }> = [
      { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
      { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.01, format: (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%` },
      { key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
      { key: 'clarity', label: 'Clarity', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'hueRotation', label: 'Hue Rotation', min: 0, max: 360, step: 1, format: (v) => `${v.toFixed(0)}\u00B0` },
      { key: 'gamma', label: 'Gamma', min: 0.1, max: 4, step: 0.01, format: (v) => v.toFixed(2) },
      { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
      { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
    ];

    // Header with reset button
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const title = document.createElement('span');
    title.textContent = 'Color Adjustments';
    title.style.cssText = 'font-weight: 600; color: var(--text-primary); font-size: 13px;';

    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    resetButton.title = 'Reset all adjustments';
    resetButton.style.cssText = `
      background: var(--border-secondary);
      border: 1px solid var(--text-muted);
      color: var(--text-primary);
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    resetButton.addEventListener('click', () => this.reset());
    resetButton.addEventListener('mouseenter', () => { resetButton.style.background = 'var(--text-muted)'; });
    resetButton.addEventListener('mouseleave', () => { resetButton.style.background = 'var(--border-secondary)'; });

    header.appendChild(title);
    header.appendChild(resetButton);
    this.panel.appendChild(header);

    // Create sliders
    for (const config of sliderConfigs) {
      const row = this.createSliderRow(config);
      this.panel.appendChild(row);

      // Add skin protection toggle after vibrance slider
      if (config.key === 'vibrance') {
        const skinProtectionRow = this.createSkinProtectionRow();
        this.panel.appendChild(skinProtectionRow);
      }
    }

    // Add LUT section
    this.createLUTSection();
  }

  private createLUTSection(): void {
    // Separator
    const separator = document.createElement('div');
    separator.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: 12px 0;
    `;
    this.panel.appendChild(separator);

    // LUT header
    const lutHeader = document.createElement('div');
    lutHeader.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    const lutTitle = document.createElement('span');
    lutTitle.textContent = 'LUT';
    lutTitle.style.cssText = 'font-weight: 600; color: var(--text-primary); font-size: 12px;';

    // LUT load button
    const lutLoadBtn = document.createElement('button');
    lutLoadBtn.textContent = 'Load LUT';
    lutLoadBtn.dataset.testid = 'lut-load-button';
    lutLoadBtn.title = 'Load a LUT file (.cube, .3dl, .csp, .itx, .look, .lut, .nk, .mga)';
    lutLoadBtn.style.cssText = `
      background: var(--border-secondary);
      border: 1px solid var(--text-muted);
      color: var(--text-primary);
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.cube,.3dl,.csp,.itx,.look,.lut,.nk,.mga';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => this.handleLUTFile(e));

    lutLoadBtn.addEventListener('click', () => fileInput.click());
    lutLoadBtn.addEventListener('mouseenter', () => { lutLoadBtn.style.background = 'var(--text-muted)'; });
    lutLoadBtn.addEventListener('mouseleave', () => { lutLoadBtn.style.background = 'var(--border-secondary)'; });

    lutHeader.appendChild(lutTitle);
    lutHeader.appendChild(lutLoadBtn);
    lutHeader.appendChild(fileInput);
    this.panel.appendChild(lutHeader);

    // LUT name display
    const lutNameRow = document.createElement('div');
    lutNameRow.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    `;

    const lutLabel = document.createElement('label');
    lutLabel.textContent = 'Active:';
    lutLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      width: 50px;
    `;

    this.lutNameLabel = document.createElement('span');
    this.lutNameLabel.textContent = 'None';
    this.lutNameLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    // Clear LUT button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '✕';
    clearBtn.title = 'Remove LUT';
    clearBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 2px 6px;
      cursor: pointer;
      font-size: 12px;
      visibility: hidden;
    `;
    clearBtn.addEventListener('click', () => this.clearLUT());

    lutNameRow.appendChild(lutLabel);
    lutNameRow.appendChild(this.lutNameLabel);
    lutNameRow.appendChild(clearBtn);
    this.panel.appendChild(lutNameRow);

    // Store reference to clear button for visibility toggle
    (this.lutNameLabel as HTMLElement & { clearBtn?: HTMLButtonElement }).clearBtn = clearBtn;

    // LUT intensity slider
    const intensityRow = document.createElement('div');
    intensityRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const intensityLabel = document.createElement('label');
    intensityLabel.textContent = 'Intensity';
    intensityLabel.style.cssText = `
      color: var(--text-primary);
      font-size: 12px;
      width: 80px;
      flex-shrink: 0;
    `;

    this.lutIntensitySlider = document.createElement('input');
    this.lutIntensitySlider.type = 'range';
    this.lutIntensitySlider.min = '0';
    this.lutIntensitySlider.max = '1';
    this.lutIntensitySlider.step = '0.01';
    this.lutIntensitySlider.value = '1';
    this.lutIntensitySlider.style.cssText = `
      flex: 1;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;

    const intensityValue = document.createElement('span');
    intensityValue.textContent = '100%';
    intensityValue.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      width: 50px;
      text-align: right;
      font-family: monospace;
    `;

    this.lutIntensitySlider.addEventListener('input', () => {
      this.lutIntensity = parseFloat(this.lutIntensitySlider!.value);
      intensityValue.textContent = `${Math.round(this.lutIntensity * 100)}%`;
      // LUT intensity uses its own event, throttle not needed here
      // as it doesn't go through the same heavy pipeline
      this.emit('lutIntensityChanged', this.lutIntensity);
    });

    intensityRow.appendChild(intensityLabel);
    intensityRow.appendChild(this.lutIntensitySlider);
    intensityRow.appendChild(intensityValue);
    this.panel.appendChild(intensityRow);
  }

  private async handleLUTFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const lut = parseLUT(file.name, content);
      if (!isLUT3D(lut)) {
        throw new Error('1D LUTs are not supported. Please load a 3D LUT file.');
      }
      this.setLUT(lut);
    } catch (err) {
      console.error('Failed to load LUT:', err);
      showAlert(`Failed to load LUT: ${err instanceof Error ? err.message : err}`, { type: 'error', title: 'LUT Error' });
    }

    // Reset input
    input.value = '';
  }

  setLUT(lut: LUT3D | null): void {
    this.currentLUT = lut;

    if (this.lutNameLabel) {
      this.lutNameLabel.textContent = lut ? lut.title : 'None';
      const clearBtn = (this.lutNameLabel as HTMLElement & { clearBtn?: HTMLButtonElement }).clearBtn;
      if (clearBtn) {
        clearBtn.style.visibility = lut ? 'visible' : 'hidden';
      }
    }

    this.emit('lutLoaded', lut);
  }

  clearLUT(): void {
    this.setLUT(null);
  }

  getLUT(): LUT3D | null {
    return this.currentLUT;
  }

  getLUTIntensity(): number {
    return this.lutIntensity;
  }

  private createSliderRow(config: {
    key: NumericAdjustmentKey;
    label: string;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
  }): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    `;

    // Label
    const label = document.createElement('label');
    label.textContent = config.label;
    label.style.cssText = `
      color: var(--text-primary);
      font-size: 12px;
      width: 80px;
      flex-shrink: 0;
    `;

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(config.min);
    slider.max = String(config.max);
    slider.step = String(config.step);
    slider.value = String(this.adjustments[config.key]);
    slider.dataset.testid = `slider-${config.key}`;
    slider.style.cssText = `
      flex: 1;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;

    // Value display
    const valueLabel = document.createElement('span');
    valueLabel.textContent = config.format(this.adjustments[config.key]);
    valueLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      width: 50px;
      text-align: right;
      font-family: monospace;
    `;

    // Store references
    this.sliders.set(config.key, slider);
    this.valueLabels.set(config.key, valueLabel);

    // Event handling - throttled to avoid excessive render calls during drags
    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      this.adjustments[config.key] = value as never;
      valueLabel.textContent = config.format(value);
      // Update skin protection indicator when vibrance changes
      if (config.key === 'vibrance') {
        this.updateSkinProtectionIndicator();
      }
      this.throttledEmitAdjustments();
    });

    // Double-click to reset individual slider
    slider.addEventListener('dblclick', () => {
      const defaultValue = DEFAULT_COLOR_ADJUSTMENTS[config.key];
      slider.value = String(defaultValue);
      this.adjustments[config.key] = defaultValue;
      valueLabel.textContent = config.format(defaultValue);
      this.emit('adjustmentsChanged', { ...this.adjustments });
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valueLabel);

    return row;
  }

  private skinProtectionCheckbox: HTMLInputElement | null = null;
  private skinProtectionIndicator: HTMLSpanElement | null = null;

  private createSkinProtectionRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      margin-left: 88px;
      gap: 6px;
    `;

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.adjustments.vibranceSkinProtection;
    checkbox.id = 'vibrance-skin-protection';
    checkbox.style.cssText = `
      accent-color: var(--accent-primary);
      cursor: pointer;
      width: 14px;
      height: 14px;
    `;
    this.skinProtectionCheckbox = checkbox;

    // Label
    const label = document.createElement('label');
    label.htmlFor = 'vibrance-skin-protection';
    label.textContent = 'Protect Skin Tones';
    label.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      cursor: pointer;
    `;

    // Active indicator
    const indicator = document.createElement('span');
    indicator.textContent = '';
    indicator.style.cssText = `
      color: var(--success);
      font-size: 10px;
      margin-left: 4px;
    `;
    this.skinProtectionIndicator = indicator;
    this.updateSkinProtectionIndicator();

    // Event handling
    checkbox.addEventListener('change', () => {
      this.adjustments.vibranceSkinProtection = checkbox.checked;
      this.updateSkinProtectionIndicator();
      this.emit('adjustmentsChanged', { ...this.adjustments });
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(indicator);

    return row;
  }

  private updateSkinProtectionIndicator(): void {
    if (this.skinProtectionIndicator && this.skinProtectionCheckbox) {
      // Show indicator when protection is active AND vibrance is non-zero
      if (this.skinProtectionCheckbox.checked && this.adjustments.vibrance !== 0) {
        this.skinProtectionIndicator.textContent = '(active)';
      } else {
        this.skinProtectionIndicator.textContent = '';
      }
    }
  }

  /**
   * Throttle adjustment emissions to ~30fps during slider drags.
   * Emits immediately on first call, then coalesces subsequent calls.
   */
  private throttledEmitAdjustments(): void {
    this._pendingAdjustments = { ...this.adjustments };
    if (this._inputThrottleTimer !== null) return;
    // Emit immediately on first call
    this.emit('adjustmentsChanged', { ...this.adjustments });
    this._inputThrottleTimer = setTimeout(() => {
      this._inputThrottleTimer = null;
      if (this._pendingAdjustments) {
        this.emit('adjustmentsChanged', this._pendingAdjustments);
        this._pendingAdjustments = null;
      }
    }, 32); // ~30fps max update rate
  }

  toggle(): void {
    if (this.isExpanded) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (this.isExpanded) return;

    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Position relative to button
    const rect = this.toggleButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;

    this.isExpanded = true;
    this.panel.style.display = 'block';
    this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    this.toggleButton.style.borderColor = 'var(--accent-primary)';
    this.toggleButton.style.color = 'var(--accent-primary)';
    document.addEventListener('keydown', this.boundHandleKeyDown);
    this.emit('visibilityChanged', true);
  }

  hide(): void {
    if (!this.isExpanded) return;

    this.isExpanded = false;
    this.panel.style.display = 'none';
    this.toggleButton.style.background = 'transparent';
    this.toggleButton.style.borderColor = 'transparent';
    this.toggleButton.style.color = 'var(--text-muted)';
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    this.emit('visibilityChanged', false);
  }

  reset(): void {
    this.adjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

    // Update all sliders and labels
    for (const [key, slider] of this.sliders) {
      slider.value = String(this.adjustments[key]);
    }

    const formats: Record<NumericAdjustmentKey, (v: number) => string> = {
      exposure: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
      brightness: (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
      contrast: (v) => `${(v * 100).toFixed(0)}%`,
      clarity: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      hueRotation: (v) => `${v.toFixed(0)}\u00B0`,
      gamma: (v) => v.toFixed(2),
      saturation: (v) => `${(v * 100).toFixed(0)}%`,
      vibrance: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      temperature: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      tint: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      highlights: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      shadows: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      whites: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
      blacks: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`,
    };

    for (const [key, label] of this.valueLabels) {
      label.textContent = formats[key](this.adjustments[key]);
    }

    this.emit('adjustmentsChanged', { ...this.adjustments });
  }

  getAdjustments(): ColorAdjustments {
    return { ...this.adjustments };
  }

  setAdjustments(adjustments: Partial<ColorAdjustments>): void {
    // Sanitize numeric values: reject NaN/Infinity
    const sanitized = { ...adjustments };
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        (sanitized as Record<string, unknown>)[key] = DEFAULT_COLOR_ADJUSTMENTS[key as keyof ColorAdjustments];
      }
    }

    this.adjustments = { ...this.adjustments, ...sanitized };

    // Update sliders (only for numeric adjustments)
    for (const [key, value] of Object.entries(sanitized)) {
      const slider = this.sliders.get(key as NumericAdjustmentKey);
      if (slider && typeof value === 'number') {
        slider.value = String(value);
      }
    }

    this.emit('adjustmentsChanged', { ...this.adjustments });
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('click', this.boundHandleDocumentClick);
    if (this._inputThrottleTimer !== null) {
      clearTimeout(this._inputThrottleTimer);
      this._inputThrottleTimer = null;
    }
    this._pendingAdjustments = null;
    this.sliders.clear();
    this.valueLabels.clear();
    // Remove body-mounted panel if present
    if (this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
