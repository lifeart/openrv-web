import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { createButton, setButtonActive } from './shared/Button';
import { createPanel, type Panel } from './shared/Panel';
import type { PerspectiveCorrectionParams } from '../../transform/PerspectiveCorrection';
import { DEFAULT_PERSPECTIVE_PARAMS, isPerspectiveActive } from '../../transform/PerspectiveCorrection';

export interface PerspectiveCorrectionControlEvents extends EventMap {
  perspectiveChanged: PerspectiveCorrectionParams;
}

const CORNER_LABELS: { key: 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'; label: string }[] = [
  { key: 'topLeft', label: 'Top Left' },
  { key: 'topRight', label: 'Top Right' },
  { key: 'bottomRight', label: 'Bottom Right' },
  { key: 'bottomLeft', label: 'Bottom Left' },
];

export class PerspectiveCorrectionControl extends EventEmitter<PerspectiveCorrectionControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private panel: Panel;
  private params: PerspectiveCorrectionParams;

  private enabledCheckbox: HTMLInputElement | null = null;
  private qualitySelect: HTMLSelectElement | null = null;
  private cornerInputs: Map<string, HTMLInputElement> = new Map();

  constructor() {
    super();

    this.params = {
      ...DEFAULT_PERSPECTIVE_PARAMS,
      topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
      topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
      bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
      bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
    };

    this.container = document.createElement('div');
    this.container.className = 'perspective-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    this.button = createButton('Perspective', () => this.toggle(), {
      variant: 'icon',
      icon: getIconSvg('grid', 'sm'),
      title: 'Perspective correction',
    });
    this.button.dataset.testid = 'perspective-control-button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');

    this.panel = createPanel({ width: '260px', align: 'right' });
    this.panel.element.classList.add('perspective-panel');
    this.panel.element.dataset.testid = 'perspective-panel';
    this.panel.element.setAttribute('role', 'dialog');
    this.panel.element.setAttribute('aria-label', 'Perspective Correction Settings');

    this.createPanelContent();
    this.container.appendChild(this.button);
  }

  private createPanelContent(): void {
    const panelEl = this.panel.element;

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
    title.textContent = 'Perspective';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.dataset.testid = 'perspective-reset-button';
    resetBtn.style.cssText = `
      background: var(--border-secondary);
      border: none;
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    resetBtn.addEventListener('click', () => this.reset());

    header.appendChild(title);
    header.appendChild(resetBtn);
    panelEl.appendChild(header);

    const enabledRow = document.createElement('div');
    enabledRow.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';

    this.enabledCheckbox = document.createElement('input');
    this.enabledCheckbox.type = 'checkbox';
    this.enabledCheckbox.checked = this.params.enabled;
    this.enabledCheckbox.id = 'perspective-enabled-checkbox';
    this.enabledCheckbox.dataset.testid = 'perspective-enabled-checkbox';
    this.enabledCheckbox.style.cssText = 'cursor: pointer;';
    this.enabledCheckbox.addEventListener('change', () => {
      this.params.enabled = this.enabledCheckbox!.checked;
      this.emitChange();
    });

    const enabledLabel = document.createElement('label');
    enabledLabel.htmlFor = 'perspective-enabled-checkbox';
    enabledLabel.textContent = 'Enabled';
    enabledLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px; cursor: pointer;';

    enabledRow.appendChild(this.enabledCheckbox);
    enabledRow.appendChild(enabledLabel);
    panelEl.appendChild(enabledRow);

    for (const { key, label } of CORNER_LABELS) {
      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom: 8px;';

      const sectionLabel = document.createElement('div');
      sectionLabel.textContent = label;
      sectionLabel.style.cssText =
        'color: var(--text-secondary); font-size: 11px; margin-bottom: 4px; font-weight: 500;';

      const inputRow = document.createElement('div');
      inputRow.style.cssText = 'display: flex; gap: 8px;';

      const xInput = this.createNumberInput(`${key}-x`, 'X', this.params[key].x, (val) => {
        this.params[key] = { ...this.params[key], x: val };
        this.emitChange();
      });
      const yInput = this.createNumberInput(`${key}-y`, 'Y', this.params[key].y, (val) => {
        this.params[key] = { ...this.params[key], y: val };
        this.emitChange();
      });

      this.cornerInputs.set(`${key}-x`, xInput.input);
      this.cornerInputs.set(`${key}-y`, yInput.input);

      inputRow.appendChild(xInput.container);
      inputRow.appendChild(yInput.container);
      section.appendChild(sectionLabel);
      section.appendChild(inputRow);
      panelEl.appendChild(section);
    }

    const qualityRow = document.createElement('div');
    qualityRow.style.cssText = 'margin-top: 12px; border-top: 1px solid var(--border-primary); padding-top: 8px;';

    const qualityLabel = document.createElement('div');
    qualityLabel.textContent = 'Quality';
    qualityLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px; margin-bottom: 4px;';

    this.qualitySelect = document.createElement('select');
    this.qualitySelect.dataset.testid = 'perspective-quality-select';
    this.qualitySelect.style.cssText = `
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;

    for (const [value, text] of [
      ['bilinear', 'Bilinear (Fast)'],
      ['bicubic', 'Bicubic (Quality)'],
    ]) {
      const option = document.createElement('option');
      option.value = value!;
      option.textContent = text!;
      if (value === this.params.quality) option.selected = true;
      this.qualitySelect.appendChild(option);
    }

    this.qualitySelect.addEventListener('change', () => {
      this.params.quality = this.qualitySelect!.value as 'bilinear' | 'bicubic';
      this.emitChange();
    });

    qualityRow.appendChild(qualityLabel);
    qualityRow.appendChild(this.qualitySelect);
    panelEl.appendChild(qualityRow);
  }

  private createNumberInput(
    testId: string,
    label: string,
    initialValue: number,
    onChange: (val: number) => void,
  ): { container: HTMLElement; input: HTMLInputElement } {
    const container = document.createElement('div');
    container.style.cssText = 'flex: 1;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-muted); font-size: 10px; margin-right: 4px;';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '-0.5';
    input.max = '1.5';
    input.value = initialValue.toFixed(2);
    input.dataset.testid = `perspective-${testId}`;
    input.style.cssText = `
      width: 60px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 11px;
    `;

    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        onChange(Math.max(-0.5, Math.min(1.5, val)));
      }
    });

    container.appendChild(labelEl);
    container.appendChild(input);
    return { container, input };
  }

  private emitChange(): void {
    this.emit('perspectiveChanged', this.getParams());
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const active = isPerspectiveActive(this.params) || this.panel.isVisible();
    setButtonActive(this.button, active, 'icon');
  }

  toggle(): void {
    if (this.panel.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    this.panel.show(this.button);
    this.button.setAttribute('aria-expanded', 'true');
    this.updateButtonState();
    this.enabledCheckbox?.focus();
  }

  hide(): void {
    this.panel.hide();
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonState();
    this.button.focus();
  }

  reset(): void {
    this.params = {
      ...DEFAULT_PERSPECTIVE_PARAMS,
      topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
      topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
      bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
      bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
    };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = false;
    if (this.qualitySelect) this.qualitySelect.value = 'bilinear';
    for (const { key } of CORNER_LABELS) {
      const xInput = this.cornerInputs.get(`${key}-x`);
      const yInput = this.cornerInputs.get(`${key}-y`);
      if (xInput) xInput.value = this.params[key].x.toFixed(2);
      if (yInput) yInput.value = this.params[key].y.toFixed(2);
    }
    this.emitChange();
  }

  getParams(): PerspectiveCorrectionParams {
    return {
      ...this.params,
      topLeft: { ...this.params.topLeft },
      topRight: { ...this.params.topRight },
      bottomRight: { ...this.params.bottomRight },
      bottomLeft: { ...this.params.bottomLeft },
    };
  }

  setParams(params: PerspectiveCorrectionParams): void {
    this.params = {
      ...params,
      topLeft: { ...params.topLeft },
      topRight: { ...params.topRight },
      bottomRight: { ...params.bottomRight },
      bottomLeft: { ...params.bottomLeft },
    };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = params.enabled;
    if (this.qualitySelect) this.qualitySelect.value = params.quality;
    for (const { key } of CORNER_LABELS) {
      const xInput = this.cornerInputs.get(`${key}-x`);
      const yInput = this.cornerInputs.get(`${key}-y`);
      if (xInput) xInput.value = params[key].x.toFixed(2);
      if (yInput) yInput.value = params[key].y.toFixed(2);
    }
    this.updateButtonState();
  }

  get isOpen(): boolean {
    return this.panel.isVisible();
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.panel.dispose();
  }
}
