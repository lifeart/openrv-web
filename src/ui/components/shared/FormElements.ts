/**
 * Shared form element helpers for control panels.
 *
 * Provides consistent styling for separators, section headers,
 * checkbox rows, and slider rows used across multiple control components.
 */

/**
 * Create a horizontal divider line.
 */
export function createSeparator(margin = '4px 0'): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = `
    height: 1px;
    background: var(--border-primary);
    margin: ${margin};
  `;
  return div;
}

/**
 * Create a section header label.
 */
export function createSectionHeader(text: string): HTMLElement {
  const header = document.createElement('div');
  header.textContent = text;
  header.style.cssText = `
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 4px;
  `;
  return header;
}

/**
 * Create a checkbox with label row.
 *
 * When `id` is provided the label uses `htmlFor` for native accessibility.
 * Otherwise a click handler on the label toggles the checkbox.
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
    // Wire label to checkbox via click (no id needed)
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
