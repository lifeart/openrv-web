/**
 * Regression tests for issue #115:
 * Typing a custom PAR value does not actually enable PAR correction.
 *
 * Custom PAR input should auto-enable PAR correction, matching preset behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PARControl } from './PARControl';

describe('PARControl - issue #115', () => {
  let control: PARControl;

  beforeEach(() => {
    control = new PARControl();
  });

  it('custom PAR input enables PAR correction', () => {
    // Ensure PAR starts disabled
    expect(control.getState().enabled).toBe(false);

    // Render so DOM is available
    const el = control.render();
    document.body.appendChild(el);

    // Open dropdown to create the DOM
    const button = el.querySelector('[data-testid="par-control-button"]') as HTMLButtonElement;
    button.click();

    // Find the custom input and simulate typing a value
    const customInput = document.querySelector('[data-testid="par-custom-input"]') as HTMLInputElement;
    expect(customInput).not.toBeNull();

    customInput.value = '1.4667';
    customInput.dispatchEvent(new Event('change'));

    const state = control.getState();
    expect(state.par).toBeCloseTo(1.4667, 3);
    expect(state.preset).toBe('custom');
    // This is the fix: custom PAR should auto-enable
    expect(state.enabled).toBe(true);

    // Cleanup
    document.body.removeChild(el);
    control.dispose();
  });

  it('preset selection enables PAR correction (baseline)', () => {
    const el = control.render();
    document.body.appendChild(el);

    const button = el.querySelector('[data-testid="par-control-button"]') as HTMLButtonElement;
    button.click();

    // Click a preset
    const preset = document.querySelector('[data-testid="par-preset-ntsc-dv"]') as HTMLButtonElement;
    if (preset) {
      preset.click();
      expect(control.getState().enabled).toBe(true);
    }

    document.body.removeChild(el);
    control.dispose();
  });
});
