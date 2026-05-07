/**
 * Shared form element helpers for control panels.
 *
 * Provides consistent styling for separators, section headers,
 * checkbox rows, and slider rows used across multiple control components.
 */

/**
 * Options shared by helpers that have both a "panel" (default) and a
 * "menu" (settings popover) styling variant.
 */
export interface MenuVariantOptions {
  menu?: boolean;
}

/**
 * Create a horizontal divider line.
 */
export function createSeparator(margin = '4px 0', options: MenuVariantOptions = {}): HTMLElement {
  const div = document.createElement('div');
  if (options.menu) {
    div.setAttribute('role', 'separator');
    div.style.cssText = `
      height: 1px;
      margin: ${margin};
      background: var(--border-secondary);
      opacity: 0.5;
    `;
  } else {
    div.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: ${margin};
    `;
  }
  return div;
}

/**
 * Create a section header label.
 */
export function createSectionHeader(text: string, options: MenuVariantOptions = {}): HTMLElement {
  const header = document.createElement('div');
  header.textContent = text;
  if (options.menu) {
    header.setAttribute('role', 'none');
    header.style.cssText = `
      padding: 6px 12px 2px;
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      pointer-events: none;
    `;
  } else {
    header.style.cssText = `
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 4px;
    `;
  }
  return header;
}

/**
 * Create a checkbox with label row.
 */
export function createCheckboxRow(
  label: string,
  initialValue: boolean,
  onChange: (checked: boolean) => void,
  id?: string,
): { container: HTMLElement; checkbox: HTMLInputElement } {
  const row = document.createElement('div');
  row.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = initialValue;
  checkbox.style.cssText = 'cursor: pointer;';
  checkbox.addEventListener('change', () => onChange(checkbox.checked));

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px; cursor: pointer;';

  if (id) {
    checkbox.id = id;
    labelEl.htmlFor = id;
  } else {
    labelEl.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      onChange(checkbox.checked);
    });
  }

  row.appendChild(checkbox);
  row.appendChild(labelEl);

  return { container: row, checkbox };
}

/**
 * Create a range slider with label and value display.
 */
export function createSliderRow(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (val: number) => void,
  formatValue?: (val: number) => string,
): { container: HTMLElement; slider: HTMLInputElement; valueLabel: HTMLSpanElement } {
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 2px 4px;';

  const defaultFormat = (val: number) => `${label}: ${val}`;
  const fmt = formatValue ?? defaultFormat;

  const lbl = document.createElement('span');
  lbl.textContent = fmt(value);
  lbl.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 80px;';
  row.appendChild(lbl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  slider.style.cssText = 'flex: 1; cursor: pointer;';
  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    lbl.textContent = fmt(val);
    onChange(val);
  });
  row.appendChild(slider);

  return { container: row, slider, valueLabel: lbl };
}

/**
 * Options for createColorSliderRow.
 *
 * Visual styling defaults match the ColorControls panel (the more polished
 * reference layout). LeftPanelContent overrides the size-related fields to
 * produce a compact variant of the same row.
 */
export interface ColorSliderRowOptions {
  /** Visible label text. */
  label: string;
  /** Initial slider value. */
  value: number;
  min: number;
  max: number;
  step: number;
  /** Formats the numeric value for display. Required so callers control rounding/units. */
  format: (value: number) => string;
  /** Called for every slider input event with the parsed numeric value. */
  onInput: (value: number) => void;
  /** When provided, double-clicking the label resets to this value and invokes onReset. */
  defaultValue?: number;
  /** Called when the user double-clicks the label to reset. Receives the default value. */
  onReset?: (value: number) => void;
  /** data-testid for the slider element. */
  sliderTestId?: string;
  /** Width of the label column. Default `'80px'` (ColorControls). */
  labelWidth?: string;
  /** Font size of the label. Default `'12px'` (ColorControls). */
  labelFontSize?: string;
  /** CSS variable name for label color (without `var()`). Default `'--text-primary'`. */
  labelColorVar?: string;
  /** Font size of the value display. Default `'11px'` (ColorControls). */
  valueFontSize?: string;
  /** Width of the value display column. Default `'50px'` (ColorControls). */
  valueWidth?: string;
  /** CSS variable name for value color (without `var()`). Default `'--text-secondary'`. */
  valueColorVar?: string;
  /** Height of the slider track. Default `'4px'` (ColorControls). */
  sliderHeight?: string;
  /** Bottom margin of the row. Default `'8px'` (ColorControls). */
  marginBottom?: string;
  /** Horizontal gap between row children. Default `'8px'` (ColorControls). */
  gap?: string;
}

/**
 * Create a color-style slider row with label, range input, and value display.
 *
 * Shared between {@link ColorControls} and {@link LeftPanelContent}. Defaults
 * match the ColorControls (full panel) styling; the compact LeftPanelContent
 * variant overrides label/value sizes via options. Double-clicking the label
 * resets to `defaultValue` (used by both panels).
 */
export function createColorSliderRow(options: ColorSliderRowOptions): {
  container: HTMLElement;
  slider: HTMLInputElement;
  valueLabel: HTMLSpanElement;
  label: HTMLLabelElement;
} {
  const {
    label,
    value,
    min,
    max,
    step,
    format,
    onInput,
    defaultValue,
    onReset,
    sliderTestId,
    labelWidth = '80px',
    labelFontSize = '12px',
    labelColorVar = '--text-primary',
    valueFontSize = '11px',
    valueWidth = '50px',
    valueColorVar = '--text-secondary',
    sliderHeight = '4px',
    marginBottom = '8px',
    gap = '8px',
  } = options;

  const row = document.createElement('div');
  row.style.cssText = `
    display: flex;
    align-items: center;
    margin-bottom: ${marginBottom};
    gap: ${gap};
  `;

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  const labelHasReset = defaultValue !== undefined && onReset !== undefined;
  labelEl.style.cssText = `
    color: var(${labelColorVar});
    font-size: ${labelFontSize};
    width: ${labelWidth};
    flex-shrink: 0;
    ${labelHasReset ? 'cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' : ''}
  `;
  if (labelHasReset) {
    labelEl.title = 'Double-click to reset';
  }

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  if (sliderTestId) {
    slider.dataset.testid = sliderTestId;
  }
  slider.style.cssText = `
    flex: 1;
    height: ${sliderHeight};
    cursor: pointer;
    accent-color: var(--accent-primary);
    min-width: 0;
  `;

  const valueLabel = document.createElement('span');
  valueLabel.textContent = format(value);
  valueLabel.style.cssText = `
    color: var(${valueColorVar});
    font-size: ${valueFontSize};
    width: ${valueWidth};
    text-align: right;
    font-family: monospace;
    flex-shrink: 0;
  `;

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    valueLabel.textContent = format(val);
    onInput(val);
  });

  if (labelHasReset) {
    const resetHandler = () => {
      slider.value = String(defaultValue);
      valueLabel.textContent = format(defaultValue);
      onReset(defaultValue);
    };
    // Reset on dblclick of either the label (panel UI affordance) or the
    // slider track (ColorControls historical behavior).
    labelEl.addEventListener('dblclick', resetHandler);
    slider.addEventListener('dblclick', resetHandler);
  }

  row.appendChild(labelEl);
  row.appendChild(slider);
  row.appendChild(valueLabel);

  return { container: row, slider, valueLabel, label: labelEl };
}

/**
 * Options for createSliderControl.
 */
export interface SliderControlOptions {
  label: string;
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onInput: (value: number) => number;
  formatValue?: (value: number) => string;
  suffix?: string;
  valueColor?: string;
  ariaLabel?: string;
  stopPropagation?: boolean;
}

/**
 * Create a settings-menu slider control.
 */
export function createSliderControl(options: SliderControlOptions): {
  container: HTMLElement;
  slider: HTMLInputElement;
  valueLabel: HTMLSpanElement;
} {
  const { label, id, value, min, max, onInput, formatValue, suffix = '', valueColor, ariaLabel, stopPropagation } =
    options;
  const step = options.step ?? 1;
  const fmt = formatValue ?? ((val: number) => `${Math.round(val)}${suffix}`);

  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'none');
  wrapper.style.cssText = `
      padding: 8px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

  const labelRow = document.createElement('div');
  labelRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: var(--text-primary);
    `;

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelRow.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.dataset.testid = `${id}-value`;
  valueEl.textContent = fmt(value);
  if (valueColor) {
    valueEl.style.color = valueColor;
  }
  labelRow.appendChild(valueEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(Math.round(value));
  slider.dataset.testid = `${id}-slider`;
  if (ariaLabel) {
    slider.setAttribute('aria-label', ariaLabel);
  }
  slider.style.cssText = 'width: 100%;';

  if (stopPropagation) {
    slider.addEventListener('click', (e) => e.stopPropagation());
  }
  slider.addEventListener('input', (e) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    const applied = onInput(Number.parseInt(slider.value, 10));
    slider.value = String(Math.round(applied));
    valueEl.textContent = fmt(applied);
  });

  wrapper.appendChild(labelRow);
  wrapper.appendChild(slider);

  return { container: wrapper, slider, valueLabel: valueEl };
}

/**
 * Options for createCheckableMenuItem.
 */
export interface CheckableMenuItemOptions {
  label: string;
  checked: boolean;
  role: 'menuitemradio' | 'menuitemcheckbox';
  onClick: () => void;
}

/**
 * Create a checkable menu item used by *SettingsMenu popovers.
 */
export function createCheckableMenuItem(
  options: CheckableMenuItemOptions,
  applyHoverEffect: (el: HTMLElement) => void,
): HTMLDivElement {
  const { label, checked, role, onClick } = options;

  const item = document.createElement('div');
  item.setAttribute('role', role);
  item.setAttribute('aria-checked', String(checked));
  item.tabIndex = -1;
  item.style.cssText = `
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      outline: none;
      white-space: nowrap;
    `;

  const checkSpan = document.createElement('span');
  checkSpan.className = 'menu-check';
  checkSpan.textContent = checked ? '\u2713' : '';
  checkSpan.style.cssText = `
      width: 14px;
      font-size: 12px;
      text-align: center;
      flex-shrink: 0;
    `;
  item.appendChild(checkSpan);

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  item.appendChild(labelSpan);

  applyHoverEffect(item);
  item.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });

  return item;
}

/**
 * Update the checked state of a createCheckableMenuItem.
 */
export function setMenuItemChecked(item: HTMLElement, checked: boolean): void {
  item.setAttribute('aria-checked', String(checked));
  const check = item.querySelector<HTMLElement>('.menu-check');
  if (check) {
    check.textContent = checked ? '\u2713' : '';
  }
}
