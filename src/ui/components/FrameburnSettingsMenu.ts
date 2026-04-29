import { type ExportDefaults, type PreferencesManager } from '../../core/PreferencesManager';
import {
  DEFAULT_FRAMEBURN_CONFIG,
  sanitizeFrameburnConfig,
  type FrameburnConfig,
  type FrameburnField,
  type FrameburnPosition,
} from './FrameburnCompositor';
import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

const FIELD_TYPES: FrameburnField['type'][] = [
  'timecode',
  'frame',
  'shotName',
  'date',
  'custom',
  'resolution',
  'fps',
  'colorspace',
  'codec',
];

const POSITIONS: FrameburnPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export class FrameburnSettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
  private _isVisible = false;
  private preferencesManager: PreferencesManager;

  constructor(preferencesManager: PreferencesManager) {
    this.preferencesManager = preferencesManager;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'frameburn-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Frameburn settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 320px;
      max-width: min(440px, calc(100vw - 16px));
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    this.menuEl = menu;
    this.renderMenuContents();
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;

    if (left + rect.width > vw - VIEWPORT_MARGIN) left = x - rect.width;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (top + rect.height > vh - VIEWPORT_MARGIN) top = y - rect.height;
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';

    this._isVisible = true;
    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [menu],
      onDismiss: () => this.hide(),
    });
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this._isVisible = false;
    if (this.deregisterDismiss) {
      this.deregisterDismiss();
      this.deregisterDismiss = null;
    }
  }

  isVisible(): boolean {
    return this._isVisible;
  }

  dispose(): void {
    this.hide();
  }

  private renderMenuContents(): void {
    const menu = this.menuEl;
    if (!menu) return;
    menu.innerHTML = '';

    const defaults = this.preferencesManager.getExportDefaults();
    const config = sanitizeFrameburnConfig(defaults.frameburnConfig) ?? { ...DEFAULT_FRAMEBURN_CONFIG };
    config.enabled = defaults.frameburnEnabled;

    menu.appendChild(this.createSectionHeader('Advanced Frameburn'));
    menu.appendChild(
      this.createCheckboxRow('Enable advanced frameburn', 'frameburn-enabled', defaults.frameburnEnabled, (checked) => {
        this.persistConfig({ ...config, enabled: checked });
      }),
    );
    menu.appendChild(
      this.createSelectRow('Position', 'frameburn-position', POSITIONS, config.position ?? 'bottom-left', (value) => {
        this.persistConfig({ ...this.readConfig(), position: value as FrameburnPosition });
      }),
    );
    menu.appendChild(
      this.createNumberRow('Font Size', 'frameburn-font-size', config.fontSize ?? 16, 8, 72, (value) => {
        this.persistConfig({ ...this.readConfig(), fontSize: value });
      }),
    );

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Fields'));

    const fieldsContainer = document.createElement('div');
    fieldsContainer.dataset.testid = 'frameburn-fields';
    fieldsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px; padding: 0 12px 8px;';
    menu.appendChild(fieldsContainer);

    const renderFields = () => {
      fieldsContainer.innerHTML = '';
      const current = this.readConfig();

      if (current.fields.length === 0) {
        const empty = document.createElement('div');
        empty.dataset.testid = 'frameburn-fields-empty';
        empty.textContent = 'No fields configured.';
        empty.style.cssText = 'font-size: 11px; color: var(--text-muted);';
        fieldsContainer.appendChild(empty);
      }

      current.fields.forEach((field, index) => {
        const row = document.createElement('div');
        row.dataset.testid = 'frameburn-field-row';
        row.style.cssText = `
          display: grid;
          grid-template-columns: minmax(0, 110px) minmax(0, 1fr) minmax(0, 1fr) 32px;
          gap: 4px;
          align-items: center;
        `;

        const typeSelect = document.createElement('select');
        typeSelect.dataset.testid = `frameburn-field-type-${index}`;
        typeSelect.style.cssText = this.inputStyle();
        for (const type of FIELD_TYPES) {
          const option = document.createElement('option');
          option.value = type;
          option.textContent = type;
          option.selected = field.type === type;
          typeSelect.appendChild(option);
        }
        typeSelect.addEventListener('change', () => {
          this.updateField(index, { type: typeSelect.value as FrameburnField['type'] });
          renderFields();
        });

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.placeholder = 'Label';
        labelInput.value = field.label ?? '';
        labelInput.dataset.testid = `frameburn-field-label-${index}`;
        labelInput.style.cssText = this.inputStyle();
        labelInput.addEventListener('input', () => {
          this.updateField(index, { label: labelInput.value });
        });

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = field.type === 'custom' ? 'Custom value' : 'Optional override';
        valueInput.value = field.value ?? '';
        valueInput.dataset.testid = `frameburn-field-value-${index}`;
        valueInput.style.cssText = this.inputStyle();
        valueInput.addEventListener('input', () => {
          this.updateField(index, { value: valueInput.value });
        });

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.dataset.testid = `frameburn-field-remove-${index}`;
        removeButton.textContent = '×';
        removeButton.style.cssText = `
          background: transparent;
          border: 1px solid var(--border-secondary);
          color: var(--text-muted);
          border-radius: 3px;
          cursor: pointer;
          height: 28px;
        `;
        applyHoverEffect(removeButton);
        removeButton.addEventListener('click', () => {
          const next = this.readConfig();
          next.fields.splice(index, 1);
          this.persistConfig(next);
          renderFields();
        });

        row.appendChild(typeSelect);
        row.appendChild(labelInput);
        row.appendChild(valueInput);
        row.appendChild(removeButton);
        fieldsContainer.appendChild(row);
      });
    };

    const addFieldButton = document.createElement('button');
    addFieldButton.type = 'button';
    addFieldButton.dataset.testid = 'frameburn-field-add';
    addFieldButton.textContent = 'Add Field';
    addFieldButton.style.cssText = `
      margin: 0 12px 10px;
      padding: 6px 10px;
      background: transparent;
      border: 1px dashed var(--border-secondary);
      border-radius: 3px;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 12px;
      width: calc(100% - 24px);
    `;
    applyHoverEffect(addFieldButton);
    addFieldButton.addEventListener('click', () => {
      const next = this.readConfig();
      next.fields.push({ type: 'timecode' });
      this.persistConfig(next);
      renderFields();
    });

    menu.appendChild(addFieldButton);
    renderFields();
  }

  private readConfig(): FrameburnConfig {
    const defaults = this.preferencesManager.getExportDefaults();
    const config = sanitizeFrameburnConfig(defaults.frameburnConfig) ?? { ...DEFAULT_FRAMEBURN_CONFIG };
    config.enabled = defaults.frameburnEnabled;
    return config;
  }

  private updateField(index: number, field: Partial<FrameburnField>): void {
    const next = this.readConfig();
    next.fields = next.fields.map((existing, currentIndex) =>
      currentIndex === index ? { ...existing, ...field } : existing,
    );
    this.persistConfig(next);
  }

  private persistConfig(config: FrameburnConfig): void {
    const defaults = this.preferencesManager.getExportDefaults();
    const normalized = sanitizeFrameburnConfig(config) ?? { ...DEFAULT_FRAMEBURN_CONFIG };
    normalized.enabled = config.enabled;
    this.preferencesManager.setExportDefaults({
      ...defaults,
      frameburnEnabled: normalized.enabled,
      frameburnConfig: normalized as unknown as Record<string, unknown>,
    } satisfies Partial<ExportDefaults>);
    this.renderMenuContents();
  }

  private createSectionHeader(text: string): HTMLDivElement {
    const header = document.createElement('div');
    header.setAttribute('role', 'none');
    header.textContent = text;
    header.style.cssText = `
      padding: 6px 12px 2px;
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      pointer-events: none;
    `;
    return header;
  }

  private createCheckboxRow(
    labelText: string,
    testId: string,
    checked: boolean,
    onInput: (checked: boolean) => void,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 12px;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.dataset.testid = testId;
    checkbox.addEventListener('input', () => onInput(checkbox.checked));

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 12px; color: var(--text-primary);';

    row.appendChild(checkbox);
    row.appendChild(label);
    return row;
  }

  private createSelectRow(
    labelText: string,
    testId: string,
    values: string[],
    currentValue: string,
    onChange: (value: string) => void,
  ): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding: 0 12px 10px; display: flex; flex-direction: column; gap: 4px;';

    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 11px; color: var(--text-muted);';

    const select = document.createElement('select');
    select.dataset.testid = testId;
    select.style.cssText = this.inputStyle();
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.selected = value === currentValue;
      select.appendChild(option);
    }
    select.addEventListener('change', () => onChange(select.value));

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    return wrapper;
  }

  private createNumberRow(
    labelText: string,
    testId: string,
    currentValue: number,
    min: number,
    max: number,
    onInput: (value: number) => void,
  ): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding: 0 12px 10px; display: flex; flex-direction: column; gap: 4px;';

    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 11px; color: var(--text-muted);';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = String(currentValue);
    input.dataset.testid = testId;
    input.style.cssText = this.inputStyle();
    input.addEventListener('input', () => {
      const value = Number.parseInt(input.value, 10);
      if (!Number.isFinite(value)) return;
      onInput(value);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  private createSeparator(): HTMLDivElement {
    const separator = document.createElement('div');
    separator.setAttribute('role', 'separator');
    separator.style.cssText = `
      height: 1px;
      margin: 4px 0;
      background: var(--border-secondary);
      opacity: 0.5;
    `;
    return separator;
  }

  private inputStyle(): string {
    return `
      width: 100%;
      min-width: 0;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      box-sizing: border-box;
    `;
  }
}
