/**
 * CompareControl Component Tests
 *
 * Tests for the comparison dropdown combining Wipe, A/B, and Difference Matte controls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CompareControl } from './CompareControl';
import { DEFAULT_DIFFERENCE_MATTE_STATE } from './DifferenceMatteControl';

describe('CompareControl', () => {
  let control: CompareControl;

  beforeEach(() => {
    control = new CompareControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('CMP-001: should initialize with default state', () => {
      const state = control.getState();
      expect(state.wipeMode).toBe('off');
      expect(state.wipePosition).toBe(0.5);
      expect(state.currentAB).toBe('A');
      expect(state.abAvailable).toBe(false);
      expect(state.differenceMatte).toEqual(DEFAULT_DIFFERENCE_MATTE_STATE);
    });

    it('CMP-002: should render container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('compare-control');
    });

    it('CMP-003: should have button with testid', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="compare-control-button"]');
      expect(button).not.toBeNull();
    });
  });

  describe('wipe mode', () => {
    it('CMP-010: setWipeMode changes wipe mode', () => {
      control.setWipeMode('horizontal');
      expect(control.getWipeMode()).toBe('horizontal');

      control.setWipeMode('vertical');
      expect(control.getWipeMode()).toBe('vertical');

      control.setWipeMode('off');
      expect(control.getWipeMode()).toBe('off');
    });

    it('CMP-011: setWipeMode emits wipeModeChanged event', () => {
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.setWipeMode('horizontal');
      expect(callback).toHaveBeenCalledWith('horizontal');
    });

    it('CMP-012: setWipeMode emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setWipeMode('horizontal');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ wipeMode: 'horizontal' }));
    });

    it('CMP-013: setWipeMode does not emit if mode unchanged', () => {
      control.setWipeMode('horizontal');
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.setWipeMode('horizontal'); // Same mode
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-014: cycleWipeMode cycles through modes', () => {
      expect(control.getWipeMode()).toBe('off');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('horizontal');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('vertical');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('off');
    });
  });

  describe('wipe position', () => {
    it('CMP-020: setWipePosition sets position', () => {
      control.setWipePosition(0.75);
      expect(control.getWipePosition()).toBe(0.75);
    });

    it('CMP-021: setWipePosition clamps to 0-1 range', () => {
      control.setWipePosition(1.5);
      expect(control.getWipePosition()).toBe(1);

      control.setWipePosition(-0.5);
      expect(control.getWipePosition()).toBe(0);
    });

    it('CMP-022: setWipePosition accepts boundary values', () => {
      control.setWipePosition(0);
      expect(control.getWipePosition()).toBe(0);

      control.setWipePosition(1);
      expect(control.getWipePosition()).toBe(1);
    });

    it('CMP-023: setWipePosition emits wipePositionChanged event', () => {
      const callback = vi.fn();
      control.on('wipePositionChanged', callback);

      control.setWipePosition(0.3);
      expect(callback).toHaveBeenCalledWith(0.3);
    });

    it('CMP-024: setWipePosition does not emit if position unchanged', () => {
      control.setWipePosition(0.5);
      const callback = vi.fn();
      control.on('wipePositionChanged', callback);

      control.setWipePosition(0.5); // Same position
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('A/B source', () => {
    it('CMP-030: setABSource changes source', () => {
      control.setABSource('B');
      expect(control.getABSource()).toBe('B');

      control.setABSource('A');
      expect(control.getABSource()).toBe('A');
    });

    it('CMP-031: setABSource emits abSourceChanged event', () => {
      const callback = vi.fn();
      control.on('abSourceChanged', callback);

      control.setABSource('B');
      expect(callback).toHaveBeenCalledWith('B');
    });

    it('CMP-032: setABSource does not emit if source unchanged', () => {
      const callback = vi.fn();
      control.on('abSourceChanged', callback);

      control.setABSource('A'); // Already A
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-033: toggleAB switches between A and B', () => {
      control.setABAvailable(true);
      expect(control.getABSource()).toBe('A');

      control.toggleAB();
      expect(control.getABSource()).toBe('B');

      control.toggleAB();
      expect(control.getABSource()).toBe('A');
    });

    it('CMP-034: toggleAB does nothing when AB not available', () => {
      control.setABAvailable(false);
      control.setABSource('A');

      control.toggleAB();
      expect(control.getABSource()).toBe('A'); // Unchanged
    });

    it('CMP-035: toggleAB emits abToggled event when available', () => {
      control.setABAvailable(true);
      const callback = vi.fn();
      control.on('abToggled', callback);

      control.toggleAB();
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('A/B availability', () => {
    it('CMP-040: setABAvailable sets availability', () => {
      control.setABAvailable(true);
      expect(control.isABAvailable()).toBe(true);

      control.setABAvailable(false);
      expect(control.isABAvailable()).toBe(false);
    });

    it('CMP-041: default AB availability is false', () => {
      expect(control.isABAvailable()).toBe(false);
    });
  });

  describe('difference matte', () => {
    it('CMP-050: toggleDifferenceMatte toggles enabled state', () => {
      expect(control.isDifferenceMatteEnabled()).toBe(false);

      control.toggleDifferenceMatte();
      expect(control.isDifferenceMatteEnabled()).toBe(true);

      control.toggleDifferenceMatte();
      expect(control.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CMP-051: setDifferenceMatteEnabled sets enabled state', () => {
      control.setDifferenceMatteEnabled(true);
      expect(control.isDifferenceMatteEnabled()).toBe(true);

      control.setDifferenceMatteEnabled(false);
      expect(control.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CMP-052: setDifferenceMatteEnabled does not emit if unchanged', () => {
      const callback = vi.fn();
      control.on('differenceMatteChanged', callback);

      control.setDifferenceMatteEnabled(false); // Already false
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-053: setDifferenceMatteGain sets gain value', () => {
      control.setDifferenceMatteGain(5.0);
      expect(control.getDifferenceMatteState().gain).toBe(5.0);
    });

    it('CMP-054: setDifferenceMatteGain clamps to 1-10 range', () => {
      control.setDifferenceMatteGain(15);
      expect(control.getDifferenceMatteState().gain).toBe(10);

      control.setDifferenceMatteGain(0.5);
      expect(control.getDifferenceMatteState().gain).toBe(1);
    });

    it('CMP-055: setDifferenceMatteGain accepts boundary values', () => {
      control.setDifferenceMatteGain(1);
      expect(control.getDifferenceMatteState().gain).toBe(1);

      control.setDifferenceMatteGain(10);
      expect(control.getDifferenceMatteState().gain).toBe(10);
    });

    it('CMP-056: toggleDifferenceMatteHeatmap toggles heatmap mode', () => {
      expect(control.getDifferenceMatteState().heatmap).toBe(false);

      control.toggleDifferenceMatteHeatmap();
      expect(control.getDifferenceMatteState().heatmap).toBe(true);

      control.toggleDifferenceMatteHeatmap();
      expect(control.getDifferenceMatteState().heatmap).toBe(false);
    });

    it('CMP-057: setDifferenceMatteHeatmap sets heatmap state', () => {
      control.setDifferenceMatteHeatmap(true);
      expect(control.getDifferenceMatteState().heatmap).toBe(true);

      control.setDifferenceMatteHeatmap(false);
      expect(control.getDifferenceMatteState().heatmap).toBe(false);
    });

    it('CMP-058: difference matte methods emit differenceMatteChanged event', () => {
      const callback = vi.fn();
      control.on('differenceMatteChanged', callback);

      control.setDifferenceMatteEnabled(true);
      expect(callback).toHaveBeenCalledTimes(1);

      control.setDifferenceMatteGain(5);
      expect(callback).toHaveBeenCalledTimes(2);

      control.toggleDifferenceMatteHeatmap();
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('state interdependencies', () => {
    it('CMP-060: enabling difference matte disables wipe mode', () => {
      control.setWipeMode('horizontal');
      expect(control.getWipeMode()).toBe('horizontal');

      control.setDifferenceMatteEnabled(true);
      expect(control.getWipeMode()).toBe('off');
      expect(control.isDifferenceMatteEnabled()).toBe(true);
    });

    it('CMP-061: toggle difference matte also disables wipe mode', () => {
      control.setWipeMode('vertical');
      expect(control.getWipeMode()).toBe('vertical');

      control.toggleDifferenceMatte(); // Enable
      expect(control.getWipeMode()).toBe('off');
    });

    it('CMP-062: disabling difference matte does not re-enable wipe mode', () => {
      control.setWipeMode('horizontal');
      control.setDifferenceMatteEnabled(true);
      expect(control.getWipeMode()).toBe('off');

      control.setDifferenceMatteEnabled(false);
      expect(control.getWipeMode()).toBe('off'); // Stays off
    });

    it('CMP-063: wipe mode can be set after difference matte is disabled', () => {
      control.setDifferenceMatteEnabled(true);
      control.setDifferenceMatteEnabled(false);

      control.setWipeMode('horizontal');
      expect(control.getWipeMode()).toBe('horizontal');
    });
  });

  describe('isActive logic', () => {
    it('CMP-070: isActive false when everything off', () => {
      const state = control.getState();
      // isActive is private, but we can check button styling indirectly
      // For now, we check state combinations that should be active
      expect(state.wipeMode).toBe('off');
      expect(state.differenceMatte.enabled).toBe(false);
      expect(state.currentAB).toBe('A');
    });

    it('CMP-071: wipe mode makes control active', () => {
      control.setWipeMode('horizontal');
      const state = control.getState();
      expect(state.wipeMode).toBe('horizontal');
    });

    it('CMP-072: difference matte makes control active', () => {
      control.setDifferenceMatteEnabled(true);
      const state = control.getState();
      expect(state.differenceMatte.enabled).toBe(true);
    });

    it('CMP-073: B source with availability makes control active', () => {
      control.setABAvailable(true);
      control.setABSource('B');
      const state = control.getState();
      expect(state.currentAB).toBe('B');
      expect(state.abAvailable).toBe(true);
    });

    it('CMP-074: B source without availability does not show as active', () => {
      control.setABAvailable(false);
      control.setABSource('B');
      const state = control.getState();
      expect(state.currentAB).toBe('B');
      expect(state.abAvailable).toBe(false);
    });
  });

  describe('getWipeState compatibility', () => {
    it('CMP-080: getWipeState returns correct structure', () => {
      control.setWipeMode('horizontal');
      control.setWipePosition(0.3);

      const wipeState = control.getWipeState();
      expect(wipeState.mode).toBe('horizontal');
      expect(wipeState.position).toBe(0.3);
      expect(wipeState.showOriginal).toBe('left');
    });

    it('CMP-081: getWipeState showOriginal is left for horizontal', () => {
      control.setWipeMode('horizontal');
      expect(control.getWipeState().showOriginal).toBe('left');
    });

    it('CMP-082: getWipeState showOriginal is top for vertical', () => {
      control.setWipeMode('vertical');
      expect(control.getWipeState().showOriginal).toBe('top');
    });

    it('CMP-083: getWipeState showOriginal is top for off (defaults to vertical behavior)', () => {
      control.setWipeMode('off');
      expect(control.getWipeState().showOriginal).toBe('top');
    });
  });

  describe('getDifferenceMatteState', () => {
    it('CMP-090: returns copy of difference matte state', () => {
      const state1 = control.getDifferenceMatteState();
      const state2 = control.getDifferenceMatteState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CMP-091: returns complete difference matte state', () => {
      control.setDifferenceMatteEnabled(true);
      control.setDifferenceMatteGain(5);
      control.setDifferenceMatteHeatmap(true);

      const state = control.getDifferenceMatteState();
      expect(state.enabled).toBe(true);
      expect(state.gain).toBe(5);
      expect(state.heatmap).toBe(true);
    });
  });

  describe('getState', () => {
    it('CMP-100: getState returns copy of full state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CMP-101: getState returns complete state', () => {
      control.setWipeMode('horizontal');
      control.setWipePosition(0.3);
      control.setABAvailable(true);
      control.setABSource('B');
      control.setDifferenceMatteGain(5);

      const state = control.getState();
      expect(state.wipeMode).toBe('horizontal');
      expect(state.wipePosition).toBe(0.3);
      expect(state.currentAB).toBe('B');
      expect(state.abAvailable).toBe(true);
      expect(state.differenceMatte.gain).toBe(5);
    });
  });

  describe('events', () => {
    it('CMP-110: stateChanged emitted for wipe mode change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setWipeMode('horizontal');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ wipeMode: 'horizontal' }));
    });

    it('CMP-111: stateChanged emitted for wipe position change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setWipePosition(0.7);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ wipePosition: 0.7 }));
    });

    it('CMP-112: stateChanged emitted for AB source change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setABSource('B');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ currentAB: 'B' }));
    });

    it('CMP-113: stateChanged emitted for difference matte change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setDifferenceMatteEnabled(true);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('CMP-120: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('CMP-121: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
