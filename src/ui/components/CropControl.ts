import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

export type { CropRegion, CropState } from '../../core/types/transform';
export { DEFAULT_CROP_REGION, DEFAULT_CROP_STATE } from '../../core/types/transform';

import type { CropRegion, CropState } from '../../core/types/transform';
import { DEFAULT_CROP_REGION, DEFAULT_CROP_STATE } from '../../core/types/transform';

/** Padding mode for uncrop: uniform applies same padding on all sides, per-side allows individual control */
export type UncropPaddingMode = 'uniform' | 'per-side';

/** Canvas extension (uncrop) state - allows the image to be inset into a larger virtual canvas */
export interface UncropState {
  enabled: boolean;
  paddingMode: UncropPaddingMode;
  /** Uniform padding in pixels (used when paddingMode is 'uniform') */
  padding: number;
  /** Per-side padding in pixels (used when paddingMode is 'per-side') */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export const DEFAULT_UNCROP_STATE: UncropState = {
  enabled: false,
  paddingMode: 'uniform',
  padding: 0,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
};

export interface CropControlEvents extends EventMap {
  cropStateChanged: CropState;
  cropModeToggled: boolean;
  panelToggled: boolean;
  uncropStateChanged: UncropState;
}

export const ASPECT_RATIOS: { label: string; value: string | null; ratio: number | null }[] = [
  { label: 'Free', value: null, ratio: null },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '2.35:1', value: '2.35:1', ratio: 2.35 },
];

// Re-export for backward compatibility
export { MIN_CROP_FRACTION, MAX_UNCROP_PADDING } from '../../config/UIConfig';

// Local import so the class implementation can use them
import { MIN_CROP_FRACTION, MAX_UNCROP_PADDING } from '../../config/UIConfig';

/** Clamp a padding value to the valid range [0, MAX_UNCROP_PADDING] */
function clampPadding(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_UNCROP_PADDING, Math.round(value)));
}

export class CropControl extends EventEmitter<CropControlEvents> {
  private container: HTMLElement;
  private cropButton: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private state: CropState = { ...DEFAULT_CROP_STATE };
  private uncropState: UncropState = { ...DEFAULT_UNCROP_STATE };

  // Source dimensions for correct aspect ratio computation in normalized coords
  private sourceWidth = 1;
  private sourceHeight = 1;

  private aspectSelect: HTMLSelectElement | null = null;
  private toggleSwitch: HTMLButtonElement | null = null;
  private dimensionsLabel: HTMLElement | null = null;
  private readonly boundHandleKeyDown: (e: KeyboardEvent) => void;

  // Uncrop UI elements
  private uncropToggleSwitch: HTMLButtonElement | null = null;
  private uncropPaddingModeSelect: HTMLSelectElement | null = null;
  private uncropUniformInput: HTMLInputElement | null = null;
  private uncropTopInput: HTMLInputElement | null = null;
  private uncropRightInput: HTMLInputElement | null = null;
  private uncropBottomInput: HTMLInputElement | null = null;
  private uncropLeftInput: HTMLInputElement | null = null;
  private uncropPerSideContainer: HTMLElement | null = null;
  private uncropUniformContainer: HTMLElement | null = null;
  private uncropCanvasLabel: HTMLElement | null = null;

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'crop-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      margin-left: 8px;
    `;

    // Create crop button
    this.cropButton = document.createElement('button');
    this.cropButton.innerHTML = `${getIconSvg('crop', 'sm')}<span style="margin-left: 6px;">Crop</span>`;
    this.cropButton.dataset.testid = 'crop-control-button';
    this.cropButton.title = 'Crop image (Shift+K)';
    this.cropButton.style.cssText = `
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

    this.cropButton.addEventListener('click', () => this.togglePanel());
    this.cropButton.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen && !this.state.enabled) {
        this.cropButton.style.background = 'var(--bg-hover)';
        this.cropButton.style.borderColor = 'var(--border-primary)';
        this.cropButton.style.color = 'var(--text-primary)';
      }
    });
    this.cropButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen && !this.state.enabled) {
        this.cropButton.style.background = 'transparent';
        this.cropButton.style.borderColor = 'transparent';
        this.cropButton.style.color = 'var(--text-muted)';
      }
    });

    // Create panel (rendered at body level to avoid z-index issues)
    this.panel = document.createElement('div');
    this.panel.className = 'crop-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Crop Settings');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 200px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;

    this.createPanelContent();

    this.container.appendChild(this.cropButton);
    // Panel will be appended to body when shown

    // Close panel on Escape key
    this.boundHandleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isPanelOpen) {
        this.hidePanel();
      }
    };
    document.addEventListener('keydown', this.boundHandleKeyDown);
  }

  private createPanelContent(): void {
    // Header
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
    title.textContent = 'Crop Settings';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.setAttribute('aria-label', 'Close crop panel');
    closeButton.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    `;
    closeButton.addEventListener('click', () => this.hidePanel());
    closeButton.addEventListener('mouseenter', () => { closeButton.style.color = 'var(--text-primary)'; });
    closeButton.addEventListener('mouseleave', () => { closeButton.style.color = 'var(--text-secondary)'; });

    header.appendChild(title);
    header.appendChild(closeButton);
    this.panel.appendChild(header);

    // Enable/Disable toggle
    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    `;

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Enable Crop';
    toggleLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px;';

    const toggleSwitch = document.createElement('button');
    this.toggleSwitch = toggleSwitch;
    toggleSwitch.setAttribute('role', 'switch');
    toggleSwitch.setAttribute('aria-checked', String(this.state.enabled));
    toggleSwitch.setAttribute('aria-label', 'Enable Crop');
    toggleSwitch.textContent = this.state.enabled ? 'ON' : 'OFF';
    toggleSwitch.style.cssText = `
      background: ${this.state.enabled ? 'var(--accent-primary)' : 'var(--border-secondary)'};
      border: none;
      color: #fff;
      padding: 4px 12px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 11px;
      min-width: 40px;
      transition: background 0.15s ease;
    `;

    toggleSwitch.addEventListener('click', () => {
      this.state.enabled = !this.state.enabled;
      this.syncToggleSwitch();
      this.updateButtonState();
      this.emitChange();
      this.emit('cropModeToggled', this.state.enabled);
    });

    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleSwitch);
    this.panel.appendChild(toggleRow);

    // Aspect ratio selector
    const aspectRow = document.createElement('div');
    aspectRow.style.cssText = 'margin-bottom: 12px;';

    const aspectLabel = document.createElement('div');
    aspectLabel.textContent = 'Aspect Ratio';
    aspectLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px; margin-bottom: 4px;';

    this.aspectSelect = document.createElement('select');
    this.aspectSelect.dataset.testid = 'crop-aspect-select';
    this.aspectSelect.setAttribute('aria-label', 'Aspect Ratio');
    this.aspectSelect.style.cssText = `
      width: 100%;
      background: var(--border-primary);
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;

    ASPECT_RATIOS.forEach(ar => {
      const option = document.createElement('option');
      option.value = ar.value || '';
      option.textContent = ar.label;
      this.aspectSelect!.appendChild(option);
    });

    this.aspectSelect.addEventListener('change', () => {
      const value = this.aspectSelect!.value || null;
      this.state.aspectRatio = value;
      this.applyAspectRatio();
      this.emitChange();
    });

    aspectRow.appendChild(aspectLabel);
    aspectRow.appendChild(this.aspectSelect);
    this.panel.appendChild(aspectRow);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset Crop';
    resetBtn.style.cssText = `
      width: 100%;
      background: var(--border-secondary);
      border: none;
      color: var(--text-primary);
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 8px;
    `;
    resetBtn.addEventListener('click', () => this.reset());
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.background = 'var(--text-muted)';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.background = 'var(--border-secondary)';
    });

    this.panel.appendChild(resetBtn);

    // Crop dimensions display
    this.dimensionsLabel = document.createElement('div');
    this.dimensionsLabel.dataset.testid = 'crop-dimensions';
    this.dimensionsLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      margin-top: 10px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    `;
    this.updateDimensionsLabel();
    this.panel.appendChild(this.dimensionsLabel);

    // Instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      color: var(--text-muted);
      font-size: 10px;
      margin-top: 8px;
      line-height: 1.4;
    `;
    instructions.textContent = 'Drag on the image to set crop region. Hold Shift to constrain aspect ratio.';
    this.panel.appendChild(instructions);

    // --- Uncrop / Canvas Extension Section ---
    this.createUncropSection();
  }

  private createUncropSection(): void {
    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: 12px 0;
    `;
    this.panel.appendChild(divider);

    // Section title
    const sectionTitle = document.createElement('div');
    sectionTitle.textContent = 'Canvas Extension (Uncrop)';
    sectionTitle.style.cssText = 'color: var(--text-primary); font-size: 12px; font-weight: 500; margin-bottom: 8px;';
    this.panel.appendChild(sectionTitle);

    // Enable toggle
    const uncropToggleRow = document.createElement('div');
    uncropToggleRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    `;

    const uncropLabel = document.createElement('span');
    uncropLabel.textContent = 'Enable Uncrop';
    uncropLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px;';

    this.uncropToggleSwitch = document.createElement('button');
    this.uncropToggleSwitch.dataset.testid = 'uncrop-toggle';
    this.uncropToggleSwitch.setAttribute('role', 'switch');
    this.uncropToggleSwitch.setAttribute('aria-checked', String(this.uncropState.enabled));
    this.uncropToggleSwitch.setAttribute('aria-label', 'Enable Canvas Extension');
    this.uncropToggleSwitch.textContent = this.uncropState.enabled ? 'ON' : 'OFF';
    this.uncropToggleSwitch.style.cssText = `
      background: ${this.uncropState.enabled ? 'var(--accent-primary)' : 'var(--border-secondary)'};
      border: none;
      color: #fff;
      padding: 4px 12px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 11px;
      min-width: 40px;
      transition: background 0.15s ease;
    `;
    this.uncropToggleSwitch.addEventListener('click', () => {
      this.uncropState.enabled = !this.uncropState.enabled;
      this.syncUncropToggle();
      this.emitUncropChange();
    });

    uncropToggleRow.appendChild(uncropLabel);
    uncropToggleRow.appendChild(this.uncropToggleSwitch);
    this.panel.appendChild(uncropToggleRow);

    // Padding mode selector
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'margin-bottom: 8px;';

    const modeLabel = document.createElement('div');
    modeLabel.textContent = 'Padding Mode';
    modeLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px; margin-bottom: 4px;';

    this.uncropPaddingModeSelect = document.createElement('select');
    this.uncropPaddingModeSelect.dataset.testid = 'uncrop-padding-mode';
    this.uncropPaddingModeSelect.setAttribute('aria-label', 'Padding Mode');
    this.uncropPaddingModeSelect.style.cssText = `
      width: 100%;
      background: var(--border-primary);
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;

    const uniformOpt = document.createElement('option');
    uniformOpt.value = 'uniform';
    uniformOpt.textContent = 'Uniform';
    this.uncropPaddingModeSelect.appendChild(uniformOpt);

    const perSideOpt = document.createElement('option');
    perSideOpt.value = 'per-side';
    perSideOpt.textContent = 'Per Side';
    this.uncropPaddingModeSelect.appendChild(perSideOpt);

    this.uncropPaddingModeSelect.value = this.uncropState.paddingMode;
    this.uncropPaddingModeSelect.addEventListener('change', () => {
      this.uncropState.paddingMode = this.uncropPaddingModeSelect!.value as UncropPaddingMode;
      this.syncUncropPaddingVisibility();
      this.emitUncropChange();
    });

    modeRow.appendChild(modeLabel);
    modeRow.appendChild(this.uncropPaddingModeSelect);
    this.panel.appendChild(modeRow);

    // Uniform padding input
    this.uncropUniformContainer = document.createElement('div');
    this.uncropUniformContainer.dataset.testid = 'uncrop-uniform-container';
    this.uncropUniformContainer.style.cssText = 'margin-bottom: 8px;';

    const uniformLabel = document.createElement('div');
    uniformLabel.textContent = 'Padding (px)';
    uniformLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px; margin-bottom: 4px;';

    this.uncropUniformInput = document.createElement('input');
    this.uncropUniformInput.type = 'number';
    this.uncropUniformInput.min = '0';
    this.uncropUniformInput.max = String(MAX_UNCROP_PADDING);
    this.uncropUniformInput.step = '10';
    this.uncropUniformInput.value = String(this.uncropState.padding);
    this.uncropUniformInput.dataset.testid = 'uncrop-uniform-padding';
    this.uncropUniformInput.setAttribute('aria-label', 'Uniform padding in pixels');
    this.uncropUniformInput.style.cssText = `
      width: 100%;
      background: var(--border-primary);
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      box-sizing: border-box;
    `;
    this.uncropUniformInput.addEventListener('input', () => {
      const val = clampPadding(parseInt(this.uncropUniformInput!.value, 10) || 0);
      this.uncropState.padding = val;
      // Sync the displayed value if it was clamped (e.g. negative or above max)
      if (this.uncropUniformInput!.value !== String(val)) {
        this.uncropUniformInput!.value = String(val);
      }
      this.updateUncropCanvasLabel();
      this.emitUncropChange();
    });

    this.uncropUniformContainer.appendChild(uniformLabel);
    this.uncropUniformContainer.appendChild(this.uncropUniformInput);
    this.panel.appendChild(this.uncropUniformContainer);

    // Per-side padding inputs
    this.uncropPerSideContainer = document.createElement('div');
    this.uncropPerSideContainer.dataset.testid = 'uncrop-perside-container';
    this.uncropPerSideContainer.style.cssText = 'margin-bottom: 8px; display: none;';

    const createSideInput = (label: string, testId: string, initialValue: number): HTMLInputElement => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;';

      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'color: var(--text-secondary); font-size: 11px; min-width: 50px;';

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(MAX_UNCROP_PADDING);
      input.step = '10';
      input.value = String(initialValue);
      input.dataset.testid = testId;
      input.setAttribute('aria-label', `${label} padding in pixels`);
      input.style.cssText = `
        width: 80px;
        background: var(--border-primary);
        border: 1px solid var(--border-secondary);
        color: var(--text-primary);
        padding: 4px 6px;
        border-radius: 4px;
        font-size: 11px;
        box-sizing: border-box;
      `;

      row.appendChild(lbl);
      row.appendChild(input);
      this.uncropPerSideContainer!.appendChild(row);
      return input;
    };

    this.uncropTopInput = createSideInput('Top', 'uncrop-padding-top', this.uncropState.paddingTop);
    this.uncropRightInput = createSideInput('Right', 'uncrop-padding-right', this.uncropState.paddingRight);
    this.uncropBottomInput = createSideInput('Bottom', 'uncrop-padding-bottom', this.uncropState.paddingBottom);
    this.uncropLeftInput = createSideInput('Left', 'uncrop-padding-left', this.uncropState.paddingLeft);

    const perSideInputHandler = () => {
      this.uncropState.paddingTop = clampPadding(parseInt(this.uncropTopInput!.value, 10) || 0);
      this.uncropState.paddingRight = clampPadding(parseInt(this.uncropRightInput!.value, 10) || 0);
      this.uncropState.paddingBottom = clampPadding(parseInt(this.uncropBottomInput!.value, 10) || 0);
      this.uncropState.paddingLeft = clampPadding(parseInt(this.uncropLeftInput!.value, 10) || 0);
      // Sync displayed values if they were clamped
      if (this.uncropTopInput!.value !== String(this.uncropState.paddingTop)) {
        this.uncropTopInput!.value = String(this.uncropState.paddingTop);
      }
      if (this.uncropRightInput!.value !== String(this.uncropState.paddingRight)) {
        this.uncropRightInput!.value = String(this.uncropState.paddingRight);
      }
      if (this.uncropBottomInput!.value !== String(this.uncropState.paddingBottom)) {
        this.uncropBottomInput!.value = String(this.uncropState.paddingBottom);
      }
      if (this.uncropLeftInput!.value !== String(this.uncropState.paddingLeft)) {
        this.uncropLeftInput!.value = String(this.uncropState.paddingLeft);
      }
      this.updateUncropCanvasLabel();
      this.emitUncropChange();
    };
    this.uncropTopInput.addEventListener('input', perSideInputHandler);
    this.uncropRightInput.addEventListener('input', perSideInputHandler);
    this.uncropBottomInput.addEventListener('input', perSideInputHandler);
    this.uncropLeftInput.addEventListener('input', perSideInputHandler);

    this.panel.appendChild(this.uncropPerSideContainer);

    // Canvas dimensions label
    this.uncropCanvasLabel = document.createElement('div');
    this.uncropCanvasLabel.dataset.testid = 'uncrop-canvas-dimensions';
    this.uncropCanvasLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 11px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      margin-bottom: 4px;
    `;
    this.updateUncropCanvasLabel();
    this.panel.appendChild(this.uncropCanvasLabel);

    // Reset uncrop button
    const resetUncropBtn = document.createElement('button');
    resetUncropBtn.textContent = 'Reset Uncrop';
    resetUncropBtn.dataset.testid = 'uncrop-reset';
    resetUncropBtn.style.cssText = `
      width: 100%;
      background: var(--border-secondary);
      border: none;
      color: var(--text-primary);
      padding: 6px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    `;
    resetUncropBtn.addEventListener('click', () => this.resetUncrop());
    resetUncropBtn.addEventListener('mouseenter', () => { resetUncropBtn.style.background = 'var(--text-muted)'; });
    resetUncropBtn.addEventListener('mouseleave', () => { resetUncropBtn.style.background = 'var(--border-secondary)'; });
    this.panel.appendChild(resetUncropBtn);

    // Initial visibility sync
    this.syncUncropPaddingVisibility();
  }

  private syncUncropToggle(): void {
    if (this.uncropToggleSwitch) {
      this.uncropToggleSwitch.textContent = this.uncropState.enabled ? 'ON' : 'OFF';
      this.uncropToggleSwitch.style.background = this.uncropState.enabled ? 'var(--accent-primary)' : 'var(--border-secondary)';
      this.uncropToggleSwitch.setAttribute('aria-checked', String(this.uncropState.enabled));
    }
  }

  private syncUncropPaddingVisibility(): void {
    if (this.uncropUniformContainer && this.uncropPerSideContainer) {
      if (this.uncropState.paddingMode === 'uniform') {
        this.uncropUniformContainer.style.display = 'block';
        this.uncropPerSideContainer.style.display = 'none';
      } else {
        this.uncropUniformContainer.style.display = 'none';
        this.uncropPerSideContainer.style.display = 'block';
      }
    }
  }

  private syncUncropInputs(): void {
    if (this.uncropUniformInput) {
      this.uncropUniformInput.value = String(this.uncropState.padding);
    }
    if (this.uncropTopInput) this.uncropTopInput.value = String(this.uncropState.paddingTop);
    if (this.uncropRightInput) this.uncropRightInput.value = String(this.uncropState.paddingRight);
    if (this.uncropBottomInput) this.uncropBottomInput.value = String(this.uncropState.paddingBottom);
    if (this.uncropLeftInput) this.uncropLeftInput.value = String(this.uncropState.paddingLeft);
    if (this.uncropPaddingModeSelect) {
      this.uncropPaddingModeSelect.value = this.uncropState.paddingMode;
    }
    this.syncUncropPaddingVisibility();
    this.syncUncropToggle();
    this.updateUncropCanvasLabel();
  }

  private updateUncropCanvasLabel(): void {
    if (!this.uncropCanvasLabel) return;
    const dims = this.getUncropCanvasDimensions();
    this.uncropCanvasLabel.textContent = `Canvas: ${dims.width} x ${dims.height} px`;
  }

  private emitUncropChange(): void {
    this.updateUncropCanvasLabel();
    this.emit('uncropStateChanged', { ...this.uncropState });
  }

  /**
   * Calculate the effective padding values in pixels based on the current mode.
   */
  getEffectivePadding(): { top: number; right: number; bottom: number; left: number } {
    if (this.uncropState.paddingMode === 'uniform') {
      const p = this.uncropState.padding;
      return { top: p, right: p, bottom: p, left: p };
    }
    return {
      top: this.uncropState.paddingTop,
      right: this.uncropState.paddingRight,
      bottom: this.uncropState.paddingBottom,
      left: this.uncropState.paddingLeft,
    };
  }

  /**
   * Calculate the total canvas dimensions when uncrop is applied.
   * Returns source dimensions plus padding on all sides.
   */
  getUncropCanvasDimensions(): { width: number; height: number } {
    if (!this.uncropState.enabled) {
      return { width: Math.round(this.sourceWidth), height: Math.round(this.sourceHeight) };
    }
    const pad = this.getEffectivePadding();
    return {
      width: Math.round(this.sourceWidth + pad.left + pad.right),
      height: Math.round(this.sourceHeight + pad.top + pad.bottom),
    };
  }

  setSourceDimensions(width: number, height: number): void {
    this.sourceWidth = (Number.isFinite(width) && width > 0) ? width : 1;
    this.sourceHeight = (Number.isFinite(height) && height > 0) ? height : 1;
    this.updateDimensionsLabel();
    this.updateUncropCanvasLabel();
  }

  private applyAspectRatio(): void {
    if (!this.state.aspectRatio) return;

    const ar = ASPECT_RATIOS.find(a => a.value === this.state.aspectRatio);
    if (!ar || !ar.ratio) return;

    // Convert pixel aspect ratio to normalized coordinate ratio.
    // In normalized coords, width=1 represents sourceWidth pixels and height=1 represents sourceHeight pixels.
    // So normalizedRatio = pixelRatio / sourceAspect.
    const sourceAspect = this.sourceWidth / this.sourceHeight;
    const normalizedRatio = ar.ratio / sourceAspect;
    if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) return;

    // Work on a copy to avoid exposing intermediate states to external references
    const region = { ...this.state.region };

    // Adjust crop region to match aspect ratio, centered and as large as possible
    const currentAspect = region.width / region.height;

    if (currentAspect > normalizedRatio) {
      // Too wide, reduce width
      const newWidth = region.height * normalizedRatio;
      const widthDiff = region.width - newWidth;
      region.x += widthDiff / 2;
      region.width = newWidth;
    } else {
      // Too tall, reduce height
      const newHeight = region.width / normalizedRatio;
      const heightDiff = region.height - newHeight;
      region.y += heightDiff / 2;
      region.height = newHeight;
    }

    // Clamp position to [0, 1] range
    region.x = Math.max(0, region.x);
    region.y = Math.max(0, region.y);

    // Clamp size to fit within bounds while preserving aspect ratio.
    // Compute the maximum dimensions allowed at the current position,
    // then take the tightest constraint.
    const maxW = 1 - region.x;
    const maxH = 1 - region.y;
    const wFromH = maxH * normalizedRatio;
    const hFromW = maxW / normalizedRatio;

    if (region.width > maxW || region.height > maxH) {
      // Apply whichever bound is tighter
      if (wFromH <= maxW) {
        region.width = wFromH;
        region.height = maxH;
      } else {
        region.width = maxW;
        region.height = hFromW;
      }
    }

    // Enforce minimum size to prevent zero-area regions from extreme aspect ratios
    region.width = Math.max(MIN_CROP_FRACTION, region.width);
    region.height = Math.max(MIN_CROP_FRACTION, region.height);

    // Assign the final computed region atomically
    this.state.region = region;
  }

  private syncToggleSwitch(): void {
    if (this.toggleSwitch) {
      this.toggleSwitch.textContent = this.state.enabled ? 'ON' : 'OFF';
      this.toggleSwitch.style.background = this.state.enabled ? 'var(--accent-primary)' : 'var(--border-secondary)';
      this.toggleSwitch.setAttribute('aria-checked', String(this.state.enabled));
    }
  }

  private updateDimensionsLabel(): void {
    if (!this.dimensionsLabel) return;
    const r = this.state.region;
    const pw = Math.round(r.width * this.sourceWidth);
    const ph = Math.round(r.height * this.sourceHeight);
    this.dimensionsLabel.textContent = `${pw} × ${ph} px`;
  }

  private emitChange(): void {
    this.updateDimensionsLabel();
    this.emit('cropStateChanged', { ...this.state, region: { ...this.state.region } });
  }

  private updateButtonState(): void {
    const isActive = this.state.enabled || this.isPanelOpen;
    if (isActive) {
      this.cropButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.cropButton.style.borderColor = 'var(--accent-primary)';
      this.cropButton.style.color = 'var(--accent-primary)';
    } else {
      this.cropButton.style.background = 'transparent';
      this.cropButton.style.borderColor = 'transparent';
      this.cropButton.style.color = 'var(--text-muted)';
    }
  }

  togglePanel(): void {
    if (this.isPanelOpen) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  showPanel(): void {
    this.isPanelOpen = true;

    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Show panel to allow measuring its actual height
    this.panel.style.display = 'block';
    this.panel.style.visibility = 'hidden';

    // Position relative to button, clamped to viewport
    const rect = this.cropButton.getBoundingClientRect();
    const panelWidth = this.panel.offsetWidth || 200;
    const panelHeight = this.panel.offsetHeight || 260;
    let top = rect.bottom + 4;
    let left = Math.max(8, rect.right - panelWidth);

    // Clamp to right edge of viewport
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }
    // If panel would overflow below viewport, show above the button
    if (top + panelHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - panelHeight - 4);
    }

    this.panel.style.top = `${top}px`;
    this.panel.style.left = `${left}px`;
    this.panel.style.visibility = '';
    this.updateDimensionsLabel();
    this.updateButtonState();

    // Move focus to the first interactive element in the panel
    this.toggleSwitch?.focus();

    this.emit('panelToggled', true);
  }

  hidePanel(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.updateButtonState();

    // Return focus to the crop button
    this.cropButton.focus();

    this.emit('panelToggled', false);
  }

  toggle(): void {
    this.state.enabled = !this.state.enabled;
    if (!this.state.enabled && this.isPanelOpen) {
      this.hidePanel();
    }
    this.syncToggleSwitch();
    this.updateButtonState();
    this.emitChange();
    this.emit('cropModeToggled', this.state.enabled);
  }

  reset(): void {
    this.state = {
      enabled: false,
      region: { ...DEFAULT_CROP_REGION },
      aspectRatio: null,
    };

    if (this.aspectSelect) {
      this.aspectSelect.value = '';
    }

    this.syncToggleSwitch();
    this.updateButtonState();
    this.emitChange();

    // Also reset uncrop
    this.resetUncrop();
  }

  /**
   * Update only the crop region (position and size).
   * Used by the Viewer when the user drags crop handles interactively.
   * Emits cropStateChanged but not cropModeToggled.
   */
  setCropRegion(region: CropRegion): void {
    this.state.region = { ...region };
    this.emitChange();
  }

  /**
   * Replace the full crop state (enabled, region, aspectRatio).
   * Used for session restore / GTO store hydration.
   * Emits cropModeToggled only when the enabled flag actually changes.
   */
  setState(state: CropState): void {
    const previousEnabled = this.state.enabled;
    this.state = { ...state, region: { ...state.region } };

    this.syncToggleSwitch();

    if (this.aspectSelect) {
      this.aspectSelect.value = this.state.aspectRatio ?? '';
    }

    this.updateButtonState();
    this.emitChange();

    if (previousEnabled !== this.state.enabled) {
      this.emit('cropModeToggled', this.state.enabled);
    }
  }

  getCropState(): CropState {
    return { ...this.state, region: { ...this.state.region } };
  }

  // --- Uncrop public API ---

  getUncropState(): UncropState {
    return { ...this.uncropState };
  }

  setUncropState(state: UncropState): void {
    this.uncropState = {
      enabled: state.enabled,
      paddingMode: state.paddingMode,
      padding: clampPadding(state.padding),
      paddingTop: clampPadding(state.paddingTop),
      paddingRight: clampPadding(state.paddingRight),
      paddingBottom: clampPadding(state.paddingBottom),
      paddingLeft: clampPadding(state.paddingLeft),
    };
    this.syncUncropInputs();
    this.emitUncropChange();
  }

  toggleUncrop(): void {
    this.uncropState.enabled = !this.uncropState.enabled;
    this.syncUncropToggle();
    this.emitUncropChange();
  }

  resetUncrop(): void {
    this.uncropState = { ...DEFAULT_UNCROP_STATE };
    this.syncUncropInputs();
    this.emitUncropChange();
  }

  getAspectRatio(): number | null {
    if (!this.state.aspectRatio) return null;
    const ar = ASPECT_RATIOS.find(a => a.value === this.state.aspectRatio);
    return ar?.ratio || null;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    // Remove panel from body if present
    if (document.body.contains(this.panel)) {
      document.body.removeChild(this.panel);
    }
  }
}
