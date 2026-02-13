import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
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
  private panel: HTMLElement;
  private isPanelOpen = false;
  private params: DeinterlaceParams = { ...DEFAULT_DEINTERLACE_PARAMS };

  private enabledCheckbox: HTMLInputElement | null = null;
  private methodSelect: HTMLSelectElement | null = null;
  private fieldOrderSelect: HTMLSelectElement | null = null;

  private boundHandleDocumentClick: (e: MouseEvent) => void;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'deinterlace-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create button
    this.button = document.createElement('button');
    this.button.innerHTML = `${getIconSvg('filter', 'sm')}<span style="margin-left: 6px;">Deinterlace</span>`;
    this.button.dataset.testid = 'deinterlace-control-button';
    this.button.title = 'Deinterlace preview';
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
    `;

    this.button.addEventListener('click', () => this.toggle());
    this.button.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen) {
        if (!this.params.enabled) {
          this.button.style.background = 'transparent';
          this.button.style.borderColor = 'transparent';
          this.button.style.color = 'var(--text-muted)';
        }
      }
    });

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'deinterlace-panel';
    this.panel.dataset.testid = 'deinterlace-panel';
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 220px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createPanelContent();
    this.container.appendChild(this.button);

    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.boundHandleDocumentClick);
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (this.isPanelOpen && !this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
      this.hide();
    }
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
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'var(--text-muted)'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'var(--border-secondary)'; });

    header.appendChild(title);
    header.appendChild(resetBtn);
    this.panel.appendChild(header);

    // Enabled checkbox
    const enabledRow = this.createCheckboxRow('Enabled', this.params.enabled, (checked) => {
      this.params.enabled = checked;
      this.emitChange();
    });
    this.enabledCheckbox = enabledRow.checkbox;
    this.panel.appendChild(enabledRow.container);

    // Method dropdown
    const methodRow = this.createSelectRow('Method', Object.entries(METHOD_LABELS), this.params.method, (value) => {
      this.params.method = value as DeinterlaceMethod;
      this.emitChange();
    });
    this.methodSelect = methodRow.select;
    this.panel.appendChild(methodRow.container);

    // Field order dropdown
    const fieldOrderRow = this.createSelectRow('Field Order', Object.entries(FIELD_ORDER_LABELS), this.params.fieldOrder, (value) => {
      this.params.fieldOrder = value as FieldOrder;
      this.emitChange();
    });
    this.fieldOrderSelect = fieldOrderRow.select;
    this.panel.appendChild(fieldOrderRow.container);
  }

  private createCheckboxRow(label: string, initialValue: boolean, onChange: (checked: boolean) => void): { container: HTMLElement; checkbox: HTMLInputElement } {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = initialValue;
    checkbox.dataset.testid = 'deinterlace-enabled-checkbox';
    checkbox.style.cssText = 'cursor: pointer;';
    checkbox.addEventListener('change', () => onChange(checkbox.checked));

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px; cursor: pointer;';
    labelEl.addEventListener('click', () => { checkbox.click(); });

    row.appendChild(checkbox);
    row.appendChild(labelEl);

    return { container: row, checkbox };
  }

  private createSelectRow(label: string, options: [string, string][], initialValue: string, onChange: (value: string) => void): { container: HTMLElement; select: HTMLSelectElement } {
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
    if (this.params.enabled || this.isPanelOpen) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  toggle(): void {
    if (this.isPanelOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }
    const rect = this.button.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 240)}px`;
    this.isPanelOpen = true;
    this.panel.style.display = 'block';
    this.updateButtonState();
  }

  hide(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.updateButtonState();
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
    return this.isPanelOpen;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('click', this.boundHandleDocumentClick);
    if (this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
