/**
 * Regression tests for issue #114:
 * Tone Mapping can be "enabled" in the dropdown while still being functionally off.
 *
 * When the enable checkbox is checked and operator is 'off', a default operator
 * should be auto-selected so tone mapping is actually active.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToneMappingControl } from './ToneMappingControl';

describe('ToneMappingControl - issue #114', () => {
  let control: ToneMappingControl;

  beforeEach(() => {
    control = new ToneMappingControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('setEnabled(true) auto-selects a non-off operator when operator is off', () => {
    // Start with operator 'off' and disabled
    control.setState({ enabled: false, operator: 'off' });
    expect(control.getState().operator).toBe('off');
    expect(control.getState().enabled).toBe(false);

    // Enable tone mapping via the enable checkbox path
    control.setEnabled(true);

    const state = control.getState();
    expect(state.enabled).toBe(true);
    // Operator should no longer be 'off'
    expect(state.operator).not.toBe('off');
    // isEnabled() should return true (enabled && operator !== 'off')
    expect(control.isEnabled()).toBe(true);
  });

  it('setEnabled(true) preserves non-off operator', () => {
    control.setState({ enabled: false, operator: 'aces' });

    control.setEnabled(true);

    const state = control.getState();
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('aces');
  });

  it('setEnabled(false) does not change operator', () => {
    control.setState({ enabled: true, operator: 'reinhard' });

    control.setEnabled(false);

    const state = control.getState();
    expect(state.enabled).toBe(false);
    expect(state.operator).toBe('reinhard');
  });

  it('checkbox enable emits stateChanged with working state', () => {
    control.setState({ enabled: false, operator: 'off' });

    const states: any[] = [];
    control.on('stateChanged', (s) => states.push(s));

    control.setEnabled(true);

    expect(states.length).toBe(1);
    expect(states[0].enabled).toBe(true);
    expect(states[0].operator).not.toBe('off');
  });

  it('toggle() also auto-selects operator when enabling from off', () => {
    control.setState({ enabled: false, operator: 'off' });

    control.toggle();

    expect(control.isEnabled()).toBe(true);
    expect(control.getState().operator).not.toBe('off');
  });
});
