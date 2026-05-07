import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { createButton, setButtonActive } from './shared/Button';
import { createPanel, type Panel } from './shared/Panel';
import { PANEL_WIDTHS } from './shared/theme';
import { createCheckboxRow } from './shared/FormElements';
import type { DeinterlaceParams, DeinterlaceMethod, FieldOrder } from '../../filters/Deinterlace';
import { DEFAULT_DEINTERLACE_PARAMS } from '../../filters/Deinterlace';

export { DEFAULT_DEINTERLACE_PARAMS };
export type { DeinterlaceParams };

export interface DeinterlaceControlEvents extends EventMap {
  deinterlaceChanged: DeinterlaceParams;
}

const METHOD_LABELS: Record<DeinterlaceMethod, string> = {
  bob: 'Bob',
  weave: 'Weave',
  blend: 'Blend',
};

const FIELD_ORDER_LABELS: Record<FieldOrder, string> = {
  tff: 'Top Field First',
  bff: 'Bottom Field First',
};

export class DeinterlaceControl extends EventEmitter<DeinterlaceControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private panel: Panel;
  private params: DeinterlaceParams = { ...DEFAULT_DEINTERLACE_PARAMS };

  private enabledCheckbox: HTMLInputElement | null = null;
  private methodSelect: HTMLSelectElement | null = null;
  private fieldOrderSelect: HTMLSelectElement | null = null;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'deinterlace-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    this.button = createButton('Deinterlace', () => this.toggle(), {
      variant: 'icon',
      icon: getIconSvg('filter', 'sm'),
      title: 'Deinterlace preview',
    });
    this.button.dataset.testid = 'deinterlace-control-button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');

    this.panel = createPanel({ width: PANEL_WIDTHS.narrow, align: 'right' });
    this.panel.element.classList.add('deinterlace-panel');
    this.panel.element.dataset.testid = 'deinterlace-panel';
    this.panel.element.setAttribute('role', 'dialog');
    this.panel.element.setAttribute('aria-label', 'Deinterlace Settings');

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
    title.textContent = 'Deinterlace';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.dataset.testid = 'deinterlace-reset-button';
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

    const enabledRow = createCheckboxRow(
      'Enabled',
      this.params.enabled,
      (checked) => {
        this.params.enabled = checked;
        this.emitChange();
      },
      'deinterlace-enabled-checkbox',
    );
    enabledRow.checkbox.dataset.testid = 'deinterlace-enabled-checkbox';
    this.enabledCheckbox = enabledRow.checkbox;
    panelEl.appendChild(enabledRow.container);

    const methodRow = this.createSelectRow('Method', Object.entries(METHOD_LABELS), this.params.method, (value) => {
      this.params.method = value as DeinterlaceMethod;
      this.emitChange();
    });
    this.methodSelect = methodRow.select;
    panelEl.appendChild(methodRow.container);

    const fieldOrderRow = this.createSelectRow(
      'Field Order',
      Object.entries(FIELD_ORDER_LABELS),
      this.params.fieldOrder,
      (value) => {
        this.params.fieldOrder = value as FieldOrder;
        this.emitChange();
      },
    );
    this.fieldOrderSelect = fieldOrderRow.select;
    panelEl.appendChild(fieldOrderRow.container);
  }

  private createSelectRow(
    label: string,
    options: [string, string][],
    initialValue: string,
    onChange: (value: string) => void,
  ): { container: HTMLElement; select: HTMLSelectElement } {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 12px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px; margin-bottom: 4px;';

    const select = document.createElement('select');
    select.dataset.testid = `deinterlace-${label.toLowerCase().replace(/\s+/g, '-')}-select`;
    select.style.cssText = `
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;

    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if (value === initialValue) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener('change', () => onChange(select.value));

    row.appendChild(labelEl);
    row.appendChild(select);

    return { container: row, select };
  }

  private emitChange(): void {
    this.emit('deinterlaceChanged', { ...this.params });
    this.updateButtonState();
  }

  private updateButtonState(): void {
    setButtonActive(this.button, this.params.enabled || this.panel.isVisible(), 'icon');
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
    this.params = { ...DEFAULT_DEINTERLACE_PARAMS };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = false;
    if (this.methodSelect) this.methodSelect.value = 'bob';
    if (this.fieldOrderSelect) this.fieldOrderSelect.value = 'tff';
    this.emitChange();
  }

  getParams(): DeinterlaceParams {
    return { ...this.params };
  }

  setParams(params: DeinterlaceParams): void {
    this.params = { ...params };
    if (this.enabledCheckbox) this.enabledCheckbox.checked = params.enabled;
    if (this.methodSelect) this.methodSelect.value = params.method;
    if (this.fieldOrderSelect) this.fieldOrderSelect.value = params.fieldOrder;
    this.emitChange();
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
