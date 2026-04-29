/**
 * LUTStageControl - Reusable UI widget for a single LUT stage row
 *
 * Provides:
 * - Stage label/title
 * - Enable/disable toggle
 * - LUT file load button + hidden file input
 * - LUT name display
 * - Clear button
 * - Intensity slider
 * - Source selector (manual/ocio)
 */

import { parseLUT, isLUT3D, type LUT } from '../../color/ColorProcessingFacade';
import type { ColorPrimaries, TransferFunction } from '../../core/image/Image';
import { showAlert } from './shared/Modal';

export interface LUTStageControlConfig {
  /** Stage identifier used for data-testid attributes */
  stageId: 'precache' | 'file' | 'look' | 'display';
  /** Display title */
  title: string;
  /** Subtitle/description */
  subtitle: string;
  /** Whether to show the source selector (manual/ocio) */
  showSourceSelector?: boolean;
  /**
   * Whether to render the per-stage output-color-space dropdowns
   * (output primaries + output transfer function). Defaults to true so
   * every stage row exposes the cascade declarations introduced in
   * MED-51 PR-1; pass `false` when embedding the row in a context that
   * doesn't allow declaring output color space.
   */
  showOutputColorSpaceSelectors?: boolean;
  /** Whether this is session-wide (display LUT) */
  sessionWide?: boolean;
}

export interface LUTStageControlCallbacks {
  onLUTLoaded: (lut: LUT, fileName: string) => void;
  onLUTCleared: () => void;
  onEnabledChanged: (enabled: boolean) => void;
  onIntensityChanged: (intensity: number) => void;
  onSourceChanged?: (source: 'manual' | 'ocio') => void;
  /**
   * Fired when the user picks an output-primaries value. The empty-string
   * "Auto (passthrough)" option is mapped to `null` at this boundary, so
   * upstream pipeline code only has to handle `ColorPrimaries | null`.
   */
  onOutputColorPrimariesChanged?: (primaries: ColorPrimaries | null) => void;
  /**
   * Fired when the user picks an output-transfer-function value. The
   * empty-string "Auto (passthrough)" option is mapped to `null` at this
   * boundary, so upstream pipeline code only has to handle
   * `TransferFunction | null`.
   */
  onOutputTransferFunctionChanged?: (transfer: TransferFunction | null) => void;
}

export class LUTStageControl {
  private element: HTMLElement;
  private toggleCheckbox: HTMLInputElement;
  private lutNameSpan: HTMLSpanElement;
  private intensitySlider: HTMLInputElement;
  private intensityValue: HTMLSpanElement;
  private clearButton: HTMLButtonElement;
  private fileInput: HTMLInputElement;
  private loadButton: HTMLButtonElement | null = null;
  private sourceSelect: HTMLSelectElement | null = null;
  private outputPrimariesSelect: HTMLSelectElement | null = null;
  private outputTransferSelect: HTMLSelectElement | null = null;

  private config: LUTStageControlConfig;
  private callbacks: LUTStageControlCallbacks;

  // Stored event handlers for cleanup
  private handleToggleChange: () => void;
  private handleFileInputChange: (e: Event) => void;
  private handleLoadClick: () => void;
  private handleClearClick: () => void;
  private handleIntensityInput: () => void;
  private handleSourceChange: (() => void) | null = null;
  private handleOutputPrimariesChange: (() => void) | null = null;
  private handleOutputTransferChange: (() => void) | null = null;

  constructor(config: LUTStageControlConfig, callbacks: LUTStageControlCallbacks) {
    this.config = config;
    this.callbacks = callbacks;

    // Bind event handlers for cleanup
    this.handleToggleChange = () => {
      this.callbacks.onEnabledChanged(this.toggleCheckbox.checked);
    };
    this.handleFileInputChange = (e: Event) => this.handleFileLoad(e);
    this.handleLoadClick = () => this.fileInput.click();
    this.handleClearClick = () => {
      this.setLUTName(null);
      this.callbacks.onLUTCleared();
    };
    this.handleIntensityInput = () => {
      const val = parseFloat(this.intensitySlider.value);
      this.intensityValue.textContent = `${Math.round(val * 100)}%`;
      this.callbacks.onIntensityChanged(val);
    };

    this.element = document.createElement('div');
    this.element.dataset.testid = `lut-${config.stageId}-section`;
    this.element.style.cssText = `
      margin-bottom: 12px;
      padding: 8px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: var(--bg-tertiary, rgba(0,0,0,0.1));
    `;

    // --- Header row ---
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    `;

    const titleLabel = document.createElement('span');
    titleLabel.textContent = config.title;
    titleLabel.style.cssText = `
      font-weight: 600;
      font-size: 11px;
      color: var(--text-primary);
    `;

    this.toggleCheckbox = document.createElement('input');
    this.toggleCheckbox.type = 'checkbox';
    this.toggleCheckbox.checked = true;
    this.toggleCheckbox.dataset.testid = `lut-${config.stageId}-toggle`;
    this.toggleCheckbox.title = `Enable/disable ${config.title}`;
    this.toggleCheckbox.style.cssText = `
      accent-color: var(--accent-primary);
      cursor: pointer;
    `;
    this.toggleCheckbox.addEventListener('change', this.handleToggleChange);

    headerRow.appendChild(titleLabel);
    headerRow.appendChild(this.toggleCheckbox);
    this.element.appendChild(headerRow);

    // Subtitle
    const subtitleEl = document.createElement('div');
    subtitleEl.textContent = config.subtitle;
    subtitleEl.style.cssText = `
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 6px;
    `;
    this.element.appendChild(subtitleEl);

    // --- LUT file row ---
    const fileRow = document.createElement('div');
    fileRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    `;

    const lutLabel = document.createElement('span');
    lutLabel.textContent = 'LUT:';
    lutLabel.style.cssText = `
      font-size: 11px;
      color: var(--text-secondary);
      width: 30px;
      flex-shrink: 0;
    `;

    this.lutNameSpan = document.createElement('span');
    this.lutNameSpan.textContent = 'None';
    this.lutNameSpan.dataset.testid = `lut-${config.stageId}-name`;
    this.lutNameSpan.style.cssText = `
      font-size: 11px;
      color: var(--text-secondary);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    const loadButton = document.createElement('button');
    loadButton.textContent = 'Load...';
    loadButton.dataset.testid = `lut-${config.stageId}-load-button`;
    loadButton.style.cssText = `
      background: var(--border-secondary);
      border: 1px solid var(--text-muted);
      color: var(--text-primary);
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
    `;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.cube,.3dl,.csp,.itx,.look,.lut,.nk,.mga';
    this.fileInput.style.display = 'none';
    this.fileInput.dataset.testid = `lut-${config.stageId}-file-input`;
    this.fileInput.addEventListener('change', this.handleFileInputChange);
    loadButton.addEventListener('click', this.handleLoadClick);
    this.loadButton = loadButton;

    this.clearButton = document.createElement('button');
    this.clearButton.textContent = 'Clear';
    this.clearButton.dataset.testid = `lut-${config.stageId}-clear-button`;
    this.clearButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--text-muted);
      color: var(--text-secondary);
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      visibility: hidden;
    `;
    this.clearButton.addEventListener('click', this.handleClearClick);

    fileRow.appendChild(lutLabel);
    fileRow.appendChild(this.lutNameSpan);
    fileRow.appendChild(loadButton);
    fileRow.appendChild(this.clearButton);
    fileRow.appendChild(this.fileInput);
    this.element.appendChild(fileRow);

    // --- Intensity row ---
    const intensityRow = document.createElement('div');
    intensityRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    const intensityLabel = document.createElement('span');
    intensityLabel.textContent = 'Intensity:';
    intensityLabel.style.cssText = `
      font-size: 11px;
      color: var(--text-secondary);
      width: 55px;
      flex-shrink: 0;
    `;

    this.intensitySlider = document.createElement('input');
    this.intensitySlider.type = 'range';
    this.intensitySlider.min = '0';
    this.intensitySlider.max = '1';
    this.intensitySlider.step = '0.01';
    this.intensitySlider.value = '1';
    this.intensitySlider.dataset.testid = `lut-${config.stageId}-intensity`;
    this.intensitySlider.style.cssText = `
      flex: 1;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;

    this.intensityValue = document.createElement('span');
    this.intensityValue.textContent = '100%';
    this.intensityValue.style.cssText = `
      font-size: 10px;
      color: var(--text-secondary);
      width: 35px;
      text-align: right;
      font-family: monospace;
    `;

    this.intensitySlider.addEventListener('input', this.handleIntensityInput);

    intensityRow.appendChild(intensityLabel);
    intensityRow.appendChild(this.intensitySlider);
    intensityRow.appendChild(this.intensityValue);
    this.element.appendChild(intensityRow);

    // --- Source selector (optional) ---
    if (config.showSourceSelector) {
      const sourceRow = document.createElement('div');
      sourceRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
      `;

      const sourceLabel = document.createElement('span');
      sourceLabel.textContent = 'Source:';
      sourceLabel.style.cssText = `
        font-size: 11px;
        color: var(--text-secondary);
        width: 55px;
        flex-shrink: 0;
      `;

      this.sourceSelect = document.createElement('select');
      this.sourceSelect.dataset.testid = `lut-${config.stageId}-source-select`;
      this.sourceSelect.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        color: var(--text-primary);
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 10px;
        cursor: pointer;
      `;
      const optManual = document.createElement('option');
      optManual.value = 'manual';
      optManual.textContent = 'Manual';
      const optOcio = document.createElement('option');
      optOcio.value = 'ocio';
      optOcio.textContent = 'OCIO';
      this.sourceSelect.appendChild(optManual);
      this.sourceSelect.appendChild(optOcio);
      this.handleSourceChange = () => {
        this.callbacks.onSourceChanged?.(this.sourceSelect!.value as 'manual' | 'ocio');
      };
      this.sourceSelect.addEventListener('change', this.handleSourceChange);

      sourceRow.appendChild(sourceLabel);
      sourceRow.appendChild(this.sourceSelect);
      this.element.appendChild(sourceRow);
    }

    // --- Output color-space declaration dropdowns (default: visible) ---
    // The empty-string "Auto (passthrough)" value is mapped to `null` at the
    // change-event boundary. Upstream pipeline code (validated by
    // sanitizers) only ever sees `ColorPrimaries | null` /
    // `TransferFunction | null` — never `'auto'` or invalid strings.
    if (config.showOutputColorSpaceSelectors !== false) {
      // Output primaries row
      const primariesRow = document.createElement('div');
      primariesRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
      `;

      const primariesLabel = document.createElement('span');
      primariesLabel.textContent = 'Out Pri:';
      primariesLabel.title = 'Output Color Primaries declared by this LUT stage';
      primariesLabel.style.cssText = `
        font-size: 11px;
        color: var(--text-secondary);
        width: 55px;
        flex-shrink: 0;
      `;

      this.outputPrimariesSelect = document.createElement('select');
      this.outputPrimariesSelect.dataset.testid = `lut-${config.stageId}-output-primaries-select`;
      this.outputPrimariesSelect.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        color: var(--text-primary);
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 10px;
        cursor: pointer;
        flex: 1;
      `;
      const primariesOptions: Array<{ value: string; label: string }> = [
        { value: '', label: 'Auto (passthrough)' },
        { value: 'bt709', label: 'Rec. 709' },
        { value: 'bt2020', label: 'Rec. 2020' },
        { value: 'p3', label: 'DCI-P3' },
      ];
      for (const { value, label } of primariesOptions) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        this.outputPrimariesSelect.appendChild(opt);
      }
      this.handleOutputPrimariesChange = () => {
        const raw = this.outputPrimariesSelect!.value;
        const primaries = raw === '' ? null : (raw as ColorPrimaries);
        this.callbacks.onOutputColorPrimariesChanged?.(primaries);
      };
      this.outputPrimariesSelect.addEventListener('change', this.handleOutputPrimariesChange);

      primariesRow.appendChild(primariesLabel);
      primariesRow.appendChild(this.outputPrimariesSelect);
      this.element.appendChild(primariesRow);

      // Output transfer row
      const transferRow = document.createElement('div');
      transferRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
      `;

      const transferLabel = document.createElement('span');
      transferLabel.textContent = 'Out Trf:';
      transferLabel.title = 'Output Transfer Function declared by this LUT stage';
      transferLabel.style.cssText = `
        font-size: 11px;
        color: var(--text-secondary);
        width: 55px;
        flex-shrink: 0;
      `;

      this.outputTransferSelect = document.createElement('select');
      this.outputTransferSelect.dataset.testid = `lut-${config.stageId}-output-transfer-select`;
      this.outputTransferSelect.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        color: var(--text-primary);
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 10px;
        cursor: pointer;
        flex: 1;
      `;
      const transferOptions: Array<{ value: string; label: string }> = [
        { value: '', label: 'Auto (passthrough)' },
        { value: 'srgb', label: 'sRGB' },
        { value: 'hlg', label: 'HLG' },
        { value: 'pq', label: 'PQ' },
        { value: 'smpte240m', label: 'SMPTE 240M' },
        { value: 'linear', label: 'Linear' },
      ];
      for (const { value, label } of transferOptions) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        this.outputTransferSelect.appendChild(opt);
      }
      this.handleOutputTransferChange = () => {
        const raw = this.outputTransferSelect!.value;
        const transfer = raw === '' ? null : (raw as TransferFunction);
        this.callbacks.onOutputTransferFunctionChanged?.(transfer);
      };
      this.outputTransferSelect.addEventListener('change', this.handleOutputTransferChange);

      transferRow.appendChild(transferLabel);
      transferRow.appendChild(this.outputTransferSelect);
      this.element.appendChild(transferRow);
    }

    // --- Session-wide label ---
    if (config.sessionWide) {
      const scopeLabel = document.createElement('div');
      scopeLabel.textContent = 'Scope: Session-wide (applies to all sources)';
      scopeLabel.style.cssText = `
        font-size: 10px;
        color: var(--text-muted);
        font-style: italic;
        margin-top: 4px;
      `;
      this.element.appendChild(scopeLabel);
    }
  }

  /** Get the DOM element */
  render(): HTMLElement {
    return this.element;
  }

  /** Update the displayed LUT name */
  setLUTName(name: string | null): void {
    this.lutNameSpan.textContent = name || 'None';
    this.clearButton.style.visibility = name ? 'visible' : 'hidden';
  }

  /** Update the enabled state */
  setEnabled(enabled: boolean): void {
    this.toggleCheckbox.checked = enabled;
  }

  /** Update the intensity display */
  setIntensity(intensity: number): void {
    this.intensitySlider.value = String(intensity);
    this.intensityValue.textContent = `${Math.round(intensity * 100)}%`;
  }

  /** Update source selector */
  setSource(source: 'manual' | 'ocio'): void {
    if (this.sourceSelect) {
      this.sourceSelect.value = source;
    }
  }

  /**
   * Update the output-primaries selector. Pass `null` to select
   * "Auto (passthrough)". No-op when the selector is hidden.
   */
  setOutputColorPrimaries(primaries: ColorPrimaries | null): void {
    if (this.outputPrimariesSelect) {
      this.outputPrimariesSelect.value = primaries ?? '';
    }
  }

  /**
   * Update the output-transfer-function selector. Pass `null` to select
   * "Auto (passthrough)". No-op when the selector is hidden.
   */
  setOutputTransferFunction(transfer: TransferFunction | null): void {
    if (this.outputTransferSelect) {
      this.outputTransferSelect.value = transfer ?? '';
    }
  }

  /** Clean up all event listeners */
  dispose(): void {
    this.toggleCheckbox.removeEventListener('change', this.handleToggleChange);
    this.fileInput.removeEventListener('change', this.handleFileInputChange);
    this.loadButton?.removeEventListener('click', this.handleLoadClick);
    this.clearButton.removeEventListener('click', this.handleClearClick);
    this.intensitySlider.removeEventListener('input', this.handleIntensityInput);
    if (this.sourceSelect && this.handleSourceChange) {
      this.sourceSelect.removeEventListener('change', this.handleSourceChange);
    }
    if (this.outputPrimariesSelect && this.handleOutputPrimariesChange) {
      this.outputPrimariesSelect.removeEventListener('change', this.handleOutputPrimariesChange);
    }
    if (this.outputTransferSelect && this.handleOutputTransferChange) {
      this.outputTransferSelect.removeEventListener('change', this.handleOutputTransferChange);
    }
  }

  private async handleFileLoad(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const lut = parseLUT(file.name, content);
      // GPU stages (file/look/display) only support 3D LUTs
      const gpuStages: string[] = ['file', 'look', 'display'];
      if (gpuStages.includes(this.config.stageId) && !isLUT3D(lut)) {
        showAlert('GPU LUT stages only support 3D LUTs. Please load a 3D LUT file.', {
          type: 'error',
          title: 'Unsupported LUT Type',
        });
        return;
      }
      this.setLUTName(file.name);
      this.callbacks.onLUTLoaded(lut, file.name);
    } catch (err) {
      console.error(`Failed to load LUT for ${this.config.stageId}:`, err);
      showAlert(`Failed to load LUT: ${err instanceof Error ? err.message : err}`, {
        type: 'error',
        title: 'LUT Error',
      });
    }

    input.value = '';
  }
}
