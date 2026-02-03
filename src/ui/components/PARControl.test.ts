import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PARControl } from './PARControl';
import { PARState } from '../../utils/PixelAspectRatio';

describe('PARControl', () => {
  let control: PARControl;

  beforeEach(() => {
    control = new PARControl();
  });

  describe('Initial state', () => {
    it('PARC-U001: has correct default state (disabled, square pixels)', () => {
      const state = control.getState();
      expect(state.enabled).toBe(false);
      expect(state.par).toBe(1.0);
      expect(state.preset).toBe('square');
    });

    it('PARC-U002: renders a container element', () => {
      const el = control.render();
      expect(el).toBeDefined();
      expect(el.dataset.testid).toBe('par-control');
    });

    it('PARC-U003: renders a button with PAR label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="par-control-button"]');
      expect(button).not.toBeNull();
      expect(button?.textContent).toContain('PAR');
    });
  });

  describe('setState', () => {
    it('PARC-U010: setState updates internal state', () => {
      const newState: PARState = { enabled: true, par: 2.0, preset: 'anamorphic-2x' };
      control.setState(newState);
      const state = control.getState();
      expect(state.enabled).toBe(true);
      expect(state.par).toBe(2.0);
      expect(state.preset).toBe('anamorphic-2x');
    });

    it('PARC-U011: setState returns a copy (not reference)', () => {
      const newState: PARState = { enabled: true, par: 2.0, preset: 'anamorphic-2x' };
      control.setState(newState);
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  describe('toggle', () => {
    it('PARC-U020: toggle enables from disabled state', () => {
      control.toggle();
      expect(control.getState().enabled).toBe(true);
    });

    it('PARC-U021: toggle disables from enabled state', () => {
      control.setState({ enabled: true, par: 2.0, preset: 'anamorphic-2x' });
      control.toggle();
      expect(control.getState().enabled).toBe(false);
    });

    it('PARC-U022: toggle emits stateChanged event', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);
      control.toggle();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });
  });

  describe('handleKeyboard', () => {
    it('PARC-U030: handles Shift+P', () => {
      const handled = control.handleKeyboard('P', true);
      expect(handled).toBe(true);
      expect(control.getState().enabled).toBe(true);
    });

    it('PARC-U031: does not handle P without Shift', () => {
      const handled = control.handleKeyboard('P', false);
      expect(handled).toBe(false);
    });

    it('PARC-U032: does not handle other keys with Shift', () => {
      const handled = control.handleKeyboard('X', true);
      expect(handled).toBe(false);
    });
  });

  describe('Events', () => {
    it('PARC-U040: emits stateChanged with correct state on toggle', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);

      // First toggle: enabled
      control.toggle();
      expect(handler).toHaveBeenCalledTimes(1);
      const firstCall = handler.mock.calls[0]![0] as PARState;
      expect(firstCall.enabled).toBe(true);
      expect(firstCall.par).toBe(1.0);

      // Second toggle: disabled
      control.toggle();
      expect(handler).toHaveBeenCalledTimes(2);
      const secondCall = handler.mock.calls[1]![0] as PARState;
      expect(secondCall.enabled).toBe(false);
    });
  });

  describe('dispose', () => {
    it('PARC-U050: dispose removes elements', () => {
      const el = control.render();
      document.body.appendChild(el);
      expect(document.body.contains(el)).toBe(true);
      control.dispose();
      expect(document.body.contains(el)).toBe(false);
    });

    it('PARC-U051: dispose removes event listeners', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);
      control.dispose();
      // After dispose, toggle should still work internally but not fire events
      control.toggle();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setState edge cases', () => {
    it('PARC-U060: setState does not mutate the input object', () => {
      const input: PARState = { enabled: true, par: 2.0, preset: 'anamorphic-2x' };
      control.setState(input);
      // Modify the input object after passing it in
      input.par = 99;
      // Internal state should not be affected
      expect(control.getState().par).toBe(2.0);
    });

    it('PARC-U061: getState returns independent copies', () => {
      control.setState({ enabled: true, par: 2.0, preset: 'anamorphic-2x' });
      const state = control.getState();
      state.par = 99;
      // Internal state should not be affected
      expect(control.getState().par).toBe(2.0);
    });
  });

  describe('toggle preserves PAR value', () => {
    it('PARC-U070: toggle preserves PAR value and preset', () => {
      control.setState({ enabled: true, par: 2.0, preset: 'anamorphic-2x' });
      control.toggle(); // disable
      const state = control.getState();
      expect(state.enabled).toBe(false);
      expect(state.par).toBe(2.0);
      expect(state.preset).toBe('anamorphic-2x');
    });
  });

  describe('handleKeyboard edge cases', () => {
    it('PARC-U080: does not handle lowercase p with Shift', () => {
      const handled = control.handleKeyboard('p', true);
      expect(handled).toBe(false);
    });

    it('PARC-U081: does not handle empty key', () => {
      const handled = control.handleKeyboard('', true);
      expect(handled).toBe(false);
    });
  });
});
