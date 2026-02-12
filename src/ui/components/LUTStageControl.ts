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
  /** Whether to show bit-depth selector (pre-cache only) */
  showBitDepth?: boolean;
  /** Whether this is session-wide (display LUT) */
  sessionWide?: boolean;
}

export interface LUTStageControlCallbacks {
  onLUTLoaded: (lut: LUT, fileName: string) => void;
  onLUTCleared: () => void;
  onEnabledChanged: (enabled: boolean) => void;
  onIntensityChanged: (intensity: number) => void;
  onSourceChanged?: (source: 'manual' | 'ocio') => void;
  onBitDepthChanged?: (bitDepth: 'auto' | '8bit' | '16bit' | 'float') => void;
}

export class LUTStageControl {
  private element: HTMLElement;
  private toggleCheckbox: HTMLInputElement;
  private lutNameSpan: HTMLSpanElement;
  private intensitySlider: HTMLInputElement;
  private intensityValue: HTMLSpanElement;
  private clearButton: HTMLButtonElement;
  private fileInput: HTMLInputElement;
  private sourceSelect: HTMLSelectElement | null = null;

  private config: LUTStageControlConfig;
  private callbacks: LUTStageControlCallbacks;

  constructor(config: LUTStageControlConfig, callbacks: LUTStageControlCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
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
    this.toggleCheckbox.addEventListener('change', () => {
      this.callbacks.onEnabledChanged(this.toggleCheckbox.checked);
    });

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
    this.fileInput.addEventListener('change', (e) => this.handleFileLoad(e));
    loadButton.addEventListener('click', () => this.fileInput.click());

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
    this.clearButton.addEventListener('click', () => {
      this.setLUTName(null);
      this.callbacks.onLUTCleared();
    });

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

    this.intensitySlider.addEventListener('input', () => {
      const val = parseFloat(this.intensitySlider.value);
      this.intensityValue.textContent = `${Math.round(val * 100)}%`;
      this.callbacks.onIntensityChanged(val);
    });

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
      this.sourceSelect.addEventListener('change', () => {
        this.callbacks.onSourceChanged?.(this.sourceSelect!.value as 'manual' | 'ocio');
      });

      sourceRow.appendChild(sourceLabel);
      sourceRow.appendChild(this.sourceSelect);
      this.element.appendChild(sourceRow);
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
      showAlert(
        `Failed to load LUT: ${err instanceof Error ? err.message : err}`,
        { type: 'error', title: 'LUT Error' }
      );
    }

    input.value = '';
  }
}
