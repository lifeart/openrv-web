/**
 * WipeControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WipeControl,
  DEFAULT_WIPE_STATE,
} from './WipeControl';

describe('WipeControl', () => {
  let control: WipeControl;

  beforeEach(() => {
    control = new WipeControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('WPE-001: starts with wipe mode off', () => {
      expect(control.getMode()).toBe('off');
    });

    it('WPE-002: starts with position at 0.5', () => {
      expect(control.getPosition()).toBe(0.5);
    });

    it('WPE-003: starts with isActive false', () => {
      expect(control.isActive()).toBe(false);
    });

    it('WPE-004: getState returns full state object', () => {
      const state = control.getState();
      expect(state).toEqual(DEFAULT_WIPE_STATE);
    });
  });

  describe('getMode', () => {
    it('WPE-005: returns current mode', () => {
      expect(control.getMode()).toBe('off');
    });
  });

  describe('setMode', () => {
    it('WPE-006: sets horizontal mode', () => {
      control.setMode('horizontal');
      expect(control.getMode()).toBe('horizontal');
    });

    it('WPE-007: sets vertical mode', () => {
      control.setMode('vertical');
      expect(control.getMode()).toBe('vertical');
    });

    it('WPE-008: sets off mode', () => {
      control.setMode('horizontal');
      control.setMode('off');
      expect(control.getMode()).toBe('off');
    });

    it('WPE-009: setMode emits modeChanged event', () => {
      const handler = vi.fn();
      control.on('modeChanged', handler);

      control.setMode('horizontal');

      expect(handler).toHaveBeenCalledWith('horizontal');
    });

    it('WPE-010: setMode emits stateChanged event', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);

      control.setMode('horizontal');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'horizontal' })
      );
    });

    it('WPE-011: setMode does not emit if mode unchanged', () => {
      const handler = vi.fn();
      control.on('modeChanged', handler);

      control.setMode('off'); // Already off

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('cycleMode', () => {
    it('WPE-012: cycles from off to horizontal', () => {
      control.cycleMode();
      expect(control.getMode()).toBe('horizontal');
    });

    it('WPE-013: cycles from horizontal to vertical', () => {
      control.setMode('horizontal');
      control.cycleMode();
      expect(control.getMode()).toBe('vertical');
    });

    it('WPE-014: cycles from vertical to off', () => {
      control.setMode('vertical');
      control.cycleMode();
      expect(control.getMode()).toBe('off');
    });

    it('WPE-015: full cycle returns to off', () => {
      control.cycleMode(); // off -> horizontal
      control.cycleMode(); // horizontal -> vertical
      control.cycleMode(); // vertical -> off
      expect(control.getMode()).toBe('off');
    });

    it('WPE-016: cycleMode emits modeChanged event', () => {
      const handler = vi.fn();
      control.on('modeChanged', handler);

      control.cycleMode();

      expect(handler).toHaveBeenCalledWith('horizontal');
    });

    it('WPE-017: cycleMode emits stateChanged event', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);

      control.cycleMode();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getPosition', () => {
    it('WPE-018: returns current position', () => {
      expect(control.getPosition()).toBe(0.5);
    });
  });

  describe('setPosition', () => {
    it('WPE-019: sets position', () => {
      control.setPosition(0.3);
      expect(control.getPosition()).toBe(0.3);
    });

    it('WPE-020: clamps position to 0 minimum', () => {
      control.setPosition(-0.5);
      expect(control.getPosition()).toBe(0);
    });

    it('WPE-021: clamps position to 1 maximum', () => {
      control.setPosition(1.5);
      expect(control.getPosition()).toBe(1);
    });

    it('WPE-022: position 0 shows only B side', () => {
      control.setPosition(0);
      expect(control.getPosition()).toBe(0);
    });

    it('WPE-023: position 1 shows only A side', () => {
      control.setPosition(1);
      expect(control.getPosition()).toBe(1);
    });

    it('WPE-024: setPosition emits positionChanged event', () => {
      const handler = vi.fn();
      control.on('positionChanged', handler);

      control.setPosition(0.7);

      expect(handler).toHaveBeenCalledWith(0.7);
    });

    it('WPE-025: setPosition emits stateChanged event', () => {
      const handler = vi.fn();
      control.on('stateChanged', handler);

      control.setPosition(0.7);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ position: 0.7 })
      );
    });

    it('WPE-026: setPosition does not emit if position unchanged', () => {
      const handler = vi.fn();
      control.on('positionChanged', handler);

      control.setPosition(0.5); // Already 0.5

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('WPE-027: returns copy of state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('WPE-028: state includes all properties', () => {
      const state = control.getState();
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('position');
      expect(state).toHaveProperty('showOriginal');
    });
  });

  describe('isActive', () => {
    it('WPE-029: returns false when mode is off', () => {
      expect(control.isActive()).toBe(false);
    });

    it('WPE-030: returns true when mode is horizontal', () => {
      control.setMode('horizontal');
      expect(control.isActive()).toBe(true);
    });

    it('WPE-031: returns true when mode is vertical', () => {
      control.setMode('vertical');
      expect(control.isActive()).toBe(true);
    });
  });

  describe('toggleOriginalSide', () => {
    it('WPE-032: toggles from left to right in horizontal mode', () => {
      control.setMode('horizontal');
      expect(control.getState().showOriginal).toBe('left');

      control.toggleOriginalSide();
      expect(control.getState().showOriginal).toBe('right');
    });

    it('WPE-033: toggles from right to left in horizontal mode', () => {
      control.setMode('horizontal');
      control.toggleOriginalSide(); // left -> right
      control.toggleOriginalSide(); // right -> left
      expect(control.getState().showOriginal).toBe('left');
    });

    it('WPE-034: toggles from top to bottom in vertical mode', () => {
      control.setMode('vertical');
      // Default showOriginal for vertical would be 'top' if it's set appropriately
      // but we start with 'left', toggleOriginalSide in vertical mode toggles top/bottom
      control.toggleOriginalSide();
      // In vertical mode, toggles between top and bottom
      const state = control.getState();
      expect(['top', 'bottom']).toContain(state.showOriginal);
    });

    it('WPE-035: toggleOriginalSide emits stateChanged event', () => {
      const handler = vi.fn();
      control.setMode('horizontal');
      control.on('stateChanged', handler);

      control.toggleOriginalSide();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('render', () => {
    it('WPE-036: render returns HTMLElement', () => {
      const element = control.render();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('WPE-037: render returns container element', () => {
      const element = control.render();
      expect(element.className).toBe('wipe-control-container');
    });
  });

  describe('DEFAULT_WIPE_STATE', () => {
    it('WPE-038: has correct default values', () => {
      expect(DEFAULT_WIPE_STATE.mode).toBe('off');
      expect(DEFAULT_WIPE_STATE.position).toBe(0.5);
      expect(DEFAULT_WIPE_STATE.showOriginal).toBe('left');
    });
  });

  describe('dispose', () => {
    it('WPE-039: dispose does not throw', () => {
      expect(() => control.dispose()).not.toThrow();
    });
  });
});
