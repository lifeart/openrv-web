import { describe, it, expect, afterEach, vi } from 'vitest';
import { outsideClickRegistry } from '../OutsideClickRegistry';
import {
  resetOutsideClickRegistry,
  dispatchOutsideMouseDown,
  dispatchOutsideClick,
  dispatchOutsideMouseSequence,
  dispatchOutsideEscape,
  expectRegistrationCount,
} from './outsideClickTestUtils';

describe('outsideClickTestUtils', () => {
  afterEach(() => {
    // Belt and suspenders: also relies on the global afterEach reset hook,
    // but each test cleans up explicitly to keep failures local.
    outsideClickRegistry.reset();
  });

  describe('resetOutsideClickRegistry', () => {
    it('clears all registrations from the singleton registry', () => {
      outsideClickRegistry.register({ elements: [], onDismiss: () => {} });
      outsideClickRegistry.register({ elements: [], onDismiss: () => {} });
      expect(outsideClickRegistry.getRegistrationCount()).toBe(2);

      resetOutsideClickRegistry();

      expect(outsideClickRegistry.getRegistrationCount()).toBe(0);
    });
  });

  describe('dispatchOutsideMouseDown', () => {
    it('dispatches a bubbling mousedown that triggers the registry dismiss', () => {
      const onDismiss = vi.fn();
      outsideClickRegistry.register({ elements: [], onDismiss });

      dispatchOutsideMouseDown();

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispatchOutsideClick', () => {
    it('dispatches a bubbling click that triggers a click-mode dismiss', () => {
      const onDismiss = vi.fn();
      outsideClickRegistry.register({ elements: [], onDismiss, dismissOn: 'click' });

      dispatchOutsideClick();

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispatchOutsideMouseSequence', () => {
    it('dispatches both mousedown and click in order', () => {
      const events: string[] = [];
      const handler = (e: Event): void => {
        events.push(e.type);
      };
      document.body.addEventListener('mousedown', handler);
      document.body.addEventListener('click', handler);

      try {
        dispatchOutsideMouseSequence();
      } finally {
        document.body.removeEventListener('mousedown', handler);
        document.body.removeEventListener('click', handler);
      }

      expect(events).toEqual(['mousedown', 'click']);
    });
  });

  describe('dispatchOutsideEscape', () => {
    it('dispatches an Escape keydown that dismisses the innermost registration', () => {
      const onDismiss = vi.fn();
      outsideClickRegistry.register({ elements: [], onDismiss });

      dispatchOutsideEscape();

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('expectRegistrationCount', () => {
    it('throws with a clear message when count differs and is silent when it matches', () => {
      expect(() => expectRegistrationCount(0)).not.toThrow();

      outsideClickRegistry.register({ elements: [], onDismiss: () => {} });
      expect(() => expectRegistrationCount(1)).not.toThrow();
      expect(() => expectRegistrationCount(2)).toThrow(/Expected 2 OutsideClickRegistry registrations, got 1/);
    });
  });
});
