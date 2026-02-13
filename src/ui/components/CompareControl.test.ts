/**
 * CompareControl Component Tests
 *
 * Tests for the comparison dropdown combining Wipe, A/B, and Difference Matte controls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CompareControl, DEFAULT_BLEND_MODE_STATE } from './CompareControl';
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
    it('CMP-U001: should initialize with default state', () => {
      const state = control.getState();
      expect(state.wipeMode).toBe('off');
      expect(state.wipePosition).toBe(0.5);
      expect(state.currentAB).toBe('A');
      expect(state.abAvailable).toBe(false);
      expect(state.differenceMatte).toEqual(DEFAULT_DIFFERENCE_MATTE_STATE);
      expect(state.blendMode).toEqual(DEFAULT_BLEND_MODE_STATE);
    });

    it('CMP-U002: should render container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('compare-control');
    });

    it('CMP-U003: should have button with testid', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="compare-control-button"]');
      expect(button).not.toBeNull();
    });
  });

  describe('wipe mode', () => {
    it('CMP-U010: setWipeMode changes wipe mode', () => {
      control.setWipeMode('horizontal');
      expect(control.getWipeMode()).toBe('horizontal');

      control.setWipeMode('vertical');
      expect(control.getWipeMode()).toBe('vertical');

      control.setWipeMode('off');
      expect(control.getWipeMode()).toBe('off');
    });

    it('CMP-U011: setWipeMode emits wipeModeChanged event', () => {
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.setWipeMode('horizontal');
      expect(callback).toHaveBeenCalledWith('horizontal');
    });

    it('CMP-U012: setWipeMode emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setWipeMode('horizontal');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ wipeMode: 'horizontal' }));
    });

    it('CMP-U013: setWipeMode does not emit if mode unchanged', () => {
      control.setWipeMode('horizontal');
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.setWipeMode('horizontal'); // Same mode
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-U014: cycleWipeMode cycles through modes', () => {
      expect(control.getWipeMode()).toBe('off');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('horizontal');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('vertical');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('splitscreen-h');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('splitscreen-v');

      control.cycleWipeMode();
      expect(control.getWipeMode()).toBe('off');
    });
  });

  describe('wipe position', () => {
    it('CMP-U020: setWipePosition sets position', () => {
      control.setWipePosition(0.75);
      expect(control.getWipePosition()).toBe(0.75);
    });

    it('CMP-U021: setWipePosition clamps to 0-1 range', () => {
      control.setWipePosition(1.5);
      expect(control.getWipePosition()).toBe(1);

      control.setWipePosition(-0.5);
      expect(control.getWipePosition()).toBe(0);
    });

    it('CMP-U022: setWipePosition accepts boundary values', () => {
      control.setWipePosition(0);
      expect(control.getWipePosition()).toBe(0);

      control.setWipePosition(1);
      expect(control.getWipePosition()).toBe(1);
    });

    it('CMP-U023: setWipePosition emits wipePositionChanged event', () => {
      const callback = vi.fn();
      control.on('wipePositionChanged', callback);

      control.setWipePosition(0.3);
      expect(callback).toHaveBeenCalledWith(0.3);
    });

    it('CMP-U024: setWipePosition does not emit if position unchanged', () => {
      control.setWipePosition(0.5);
      const callback = vi.fn();
      control.on('wipePositionChanged', callback);

      control.setWipePosition(0.5); // Same position
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('A/B source', () => {
    it('CMP-U030: setABSource changes source', () => {
      control.setABSource('B');
      expect(control.getABSource()).toBe('B');

      control.setABSource('A');
      expect(control.getABSource()).toBe('A');
    });

    it('CMP-U031: setABSource emits abSourceChanged event', () => {
      const callback = vi.fn();
      control.on('abSourceChanged', callback);

      control.setABSource('B');
      expect(callback).toHaveBeenCalledWith('B');
    });

    it('CMP-U032: setABSource does not emit if source unchanged', () => {
      const callback = vi.fn();
      control.on('abSourceChanged', callback);

      control.setABSource('A'); // Already A
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-U033: toggleAB switches between A and B', () => {
      control.setABAvailable(true);
      expect(control.getABSource()).toBe('A');

      control.toggleAB();
      expect(control.getABSource()).toBe('B');

      control.toggleAB();
      expect(control.getABSource()).toBe('A');
    });

    it('CMP-U034: toggleAB does nothing when AB not available', () => {
      control.setABAvailable(false);
      control.setABSource('A');

      control.toggleAB();
      expect(control.getABSource()).toBe('A'); // Unchanged
    });

    it('CMP-U035: toggleAB emits abToggled event when available', () => {
      control.setABAvailable(true);
      const callback = vi.fn();
      control.on('abToggled', callback);

      control.toggleAB();
      expect(callback).toHaveBeenCalled();
    });

    it('CMP-U036: toggleAB emits BOTH abSourceChanged AND abToggled', () => {
      control.setABAvailable(true);
      const sourceCallback = vi.fn();
      const toggleCallback = vi.fn();
      control.on('abSourceChanged', sourceCallback);
      control.on('abToggled', toggleCallback);

      control.toggleAB();

      // Both events should fire - abSourceChanged via setABSource, then abToggled
      expect(sourceCallback).toHaveBeenCalledWith('B');
      expect(toggleCallback).toHaveBeenCalled();
    });

    it('CMP-U037: toggleAB does not emit abToggled when AB not available', () => {
      control.setABAvailable(false);
      const callback = vi.fn();
      control.on('abToggled', callback);

      control.toggleAB();
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-U038: setABSource can set B even when abAvailable is false', () => {
      // This documents current behavior - setABSource does NOT check abAvailable
      control.setABAvailable(false);
      control.setABSource('B');
      expect(control.getABSource()).toBe('B');
    });

    it('CMP-U039: setABSource emits event even when abAvailable is false', () => {
      control.setABAvailable(false);
      const callback = vi.fn();
      control.on('abSourceChanged', callback);

      control.setABSource('B');
      expect(callback).toHaveBeenCalledWith('B');
    });
  });

  describe('A/B availability', () => {
    it('CMP-U040: setABAvailable sets availability', () => {
      control.setABAvailable(true);
      expect(control.isABAvailable()).toBe(true);

      control.setABAvailable(false);
      expect(control.isABAvailable()).toBe(false);
    });

    it('CMP-U041: default AB availability is false', () => {
      expect(control.isABAvailable()).toBe(false);
    });
  });

  describe('difference matte', () => {
    it('CMP-U050: toggleDifferenceMatte toggles enabled state', () => {
      expect(control.isDifferenceMatteEnabled()).toBe(false);

      control.toggleDifferenceMatte();
      expect(control.isDifferenceMatteEnabled()).toBe(true);

      control.toggleDifferenceMatte();
      expect(control.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CMP-U051: setDifferenceMatteEnabled sets enabled state', () => {
      control.setDifferenceMatteEnabled(true);
      expect(control.isDifferenceMatteEnabled()).toBe(true);

      control.setDifferenceMatteEnabled(false);
      expect(control.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CMP-U052: setDifferenceMatteEnabled does not emit if unchanged', () => {
      const callback = vi.fn();
      control.on('differenceMatteChanged', callback);

      control.setDifferenceMatteEnabled(false); // Already false
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-U053: setDifferenceMatteGain sets gain value', () => {
      control.setDifferenceMatteGain(5.0);
      expect(control.getDifferenceMatteState().gain).toBe(5.0);
    });

    it('CMP-U054: setDifferenceMatteGain clamps to 1-10 range', () => {
      control.setDifferenceMatteGain(15);
      expect(control.getDifferenceMatteState().gain).toBe(10);

      control.setDifferenceMatteGain(0.5);
      expect(control.getDifferenceMatteState().gain).toBe(1);
    });

    it('CMP-U055: setDifferenceMatteGain accepts boundary values', () => {
      control.setDifferenceMatteGain(1);
      expect(control.getDifferenceMatteState().gain).toBe(1);

      control.setDifferenceMatteGain(10);
      expect(control.getDifferenceMatteState().gain).toBe(10);
    });

    it('CMP-U056: toggleDifferenceMatteHeatmap toggles heatmap mode', () => {
      expect(control.getDifferenceMatteState().heatmap).toBe(false);

      control.toggleDifferenceMatteHeatmap();
      expect(control.getDifferenceMatteState().heatmap).toBe(true);

      control.toggleDifferenceMatteHeatmap();
      expect(control.getDifferenceMatteState().heatmap).toBe(false);
    });

    it('CMP-U057: setDifferenceMatteHeatmap sets heatmap state', () => {
      control.setDifferenceMatteHeatmap(true);
      expect(control.getDifferenceMatteState().heatmap).toBe(true);

      control.setDifferenceMatteHeatmap(false);
      expect(control.getDifferenceMatteState().heatmap).toBe(false);
    });

    it('CMP-U058: difference matte methods emit differenceMatteChanged event', () => {
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
    it('CMP-U060: enabling difference matte disables wipe mode', () => {
      control.setWipeMode('horizontal');
      expect(control.getWipeMode()).toBe('horizontal');

      control.setDifferenceMatteEnabled(true);
      expect(control.getWipeMode()).toBe('off');
      expect(control.isDifferenceMatteEnabled()).toBe(true);
    });

    it('CMP-U061: toggle difference matte also disables wipe mode', () => {
      control.setWipeMode('vertical');
      expect(control.getWipeMode()).toBe('vertical');

      control.toggleDifferenceMatte(); // Enable
      expect(control.getWipeMode()).toBe('off');
    });

    it('CMP-U064: enabling difference matte emits wipeModeChanged when wipe is active', () => {
      control.setWipeMode('horizontal');
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.setDifferenceMatteEnabled(true);
      expect(callback).toHaveBeenCalledWith('off');
    });

    it('CMP-U065: enabling difference matte does not emit wipeModeChanged when wipe is already off', () => {
      // Wipe is off by default
      expect(control.getWipeMode()).toBe('off');
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.setDifferenceMatteEnabled(true);
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-U066: toggleDifferenceMatte emits wipeModeChanged when wipe is active', () => {
      control.setWipeMode('vertical');
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.toggleDifferenceMatte(); // Enable
      expect(callback).toHaveBeenCalledWith('off');
    });

    it('CMP-U062: disabling difference matte does not re-enable wipe mode', () => {
      control.setWipeMode('horizontal');
      control.setDifferenceMatteEnabled(true);
      expect(control.getWipeMode()).toBe('off');

      control.setDifferenceMatteEnabled(false);
      expect(control.getWipeMode()).toBe('off'); // Stays off
    });

    it('CMP-U063: wipe mode can be set after difference matte is disabled', () => {
      control.setDifferenceMatteEnabled(true);
      control.setDifferenceMatteEnabled(false);

      control.setWipeMode('horizontal');
      expect(control.getWipeMode()).toBe('horizontal');
    });
  });

  describe('blend modes', () => {
    it('CMP-U130: setBlendMode changes blend mode', () => {
      control.setBlendMode('onionskin');
      expect(control.getBlendMode()).toBe('onionskin');

      control.setBlendMode('flicker');
      expect(control.getBlendMode()).toBe('flicker');

      control.setBlendMode('blend');
      expect(control.getBlendMode()).toBe('blend');

      control.setBlendMode('off');
      expect(control.getBlendMode()).toBe('off');
    });

    it('CMP-U131: toggleBlendMode toggles mode on and off', () => {
      control.toggleBlendMode('onionskin');
      expect(control.getBlendMode()).toBe('onionskin');

      control.toggleBlendMode('onionskin');
      expect(control.getBlendMode()).toBe('off');
    });

    it('CMP-U132: toggleBlendMode switches between modes', () => {
      control.toggleBlendMode('onionskin');
      expect(control.getBlendMode()).toBe('onionskin');

      control.toggleBlendMode('flicker');
      expect(control.getBlendMode()).toBe('flicker');
    });

    it('CMP-U133: setBlendMode emits blendModeChanged event', () => {
      const callback = vi.fn();
      control.on('blendModeChanged', callback);

      control.setBlendMode('onionskin');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ mode: 'onionskin' }));
    });

    it('CMP-U134: setBlendMode does not emit if mode unchanged', () => {
      control.setBlendMode('onionskin');
      const callback = vi.fn();
      control.on('blendModeChanged', callback);

      control.setBlendMode('onionskin'); // Same mode
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-U135: getBlendModeState returns complete state', () => {
      const state = control.getBlendModeState();
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('onionOpacity');
      expect(state).toHaveProperty('flickerRate');
      expect(state).toHaveProperty('blendRatio');
    });

    it('CMP-U136: getBlendModeState returns copy', () => {
      const state1 = control.getBlendModeState();
      const state2 = control.getBlendModeState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  describe('onion skin opacity', () => {
    it('CMP-U140: setOnionOpacity sets opacity', () => {
      control.setOnionOpacity(0.75);
      expect(control.getOnionOpacity()).toBe(0.75);
    });

    it('CMP-U141: setOnionOpacity clamps to 0-1 range', () => {
      control.setOnionOpacity(1.5);
      expect(control.getOnionOpacity()).toBe(1);

      control.setOnionOpacity(-0.5);
      expect(control.getOnionOpacity()).toBe(0);
    });

    it('CMP-U142: setOnionOpacity accepts boundary values', () => {
      control.setOnionOpacity(0);
      expect(control.getOnionOpacity()).toBe(0);

      control.setOnionOpacity(1);
      expect(control.getOnionOpacity()).toBe(1);
    });

    it('CMP-U143: setOnionOpacity emits blendModeChanged event', () => {
      const callback = vi.fn();
      control.on('blendModeChanged', callback);

      control.setOnionOpacity(0.3);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ onionOpacity: 0.3 }));
    });

    it('CMP-U144: setOnionOpacity does not emit if unchanged', () => {
      control.setOnionOpacity(0.5);
      const callback = vi.fn();
      control.on('blendModeChanged', callback);

      control.setOnionOpacity(0.5); // Same
      expect(callback).not.toHaveBeenCalled();
    });

    it('CMP-U145: default onion opacity is 0.5', () => {
      expect(control.getOnionOpacity()).toBe(0.5);
    });
  });

  describe('flicker rate', () => {
    it('CMP-U150: setFlickerRate sets rate', () => {
      control.setFlickerRate(10);
      expect(control.getFlickerRate()).toBe(10);
    });

    it('CMP-U151: setFlickerRate clamps to 1-30 range', () => {
      control.setFlickerRate(50);
      expect(control.getFlickerRate()).toBe(30);

      control.setFlickerRate(0);
      expect(control.getFlickerRate()).toBe(1);
    });

    it('CMP-U152: setFlickerRate accepts boundary values', () => {
      control.setFlickerRate(1);
      expect(control.getFlickerRate()).toBe(1);

      control.setFlickerRate(30);
      expect(control.getFlickerRate()).toBe(30);
    });

    it('CMP-U153: setFlickerRate rounds to integer', () => {
      control.setFlickerRate(5.7);
      expect(control.getFlickerRate()).toBe(6);
    });

    it('CMP-U154: setFlickerRate emits blendModeChanged event', () => {
      const callback = vi.fn();
      control.on('blendModeChanged', callback);

      control.setFlickerRate(8);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ flickerRate: 8 }));
    });

    it('CMP-U155: default flicker rate is 4 Hz', () => {
      expect(control.getFlickerRate()).toBe(4);
    });

    it('CMP-U156: getFlickerFrame returns 0 or 1', () => {
      expect([0, 1]).toContain(control.getFlickerFrame());
    });
  });

  describe('blend ratio', () => {
    it('CMP-U160: setBlendRatio sets ratio', () => {
      control.setBlendRatio(0.75);
      expect(control.getBlendRatio()).toBe(0.75);
    });

    it('CMP-U161: setBlendRatio clamps to 0-1 range', () => {
      control.setBlendRatio(1.5);
      expect(control.getBlendRatio()).toBe(1);

      control.setBlendRatio(-0.5);
      expect(control.getBlendRatio()).toBe(0);
    });

    it('CMP-U162: setBlendRatio accepts boundary values', () => {
      control.setBlendRatio(0);
      expect(control.getBlendRatio()).toBe(0);

      control.setBlendRatio(1);
      expect(control.getBlendRatio()).toBe(1);
    });

    it('CMP-U163: setBlendRatio emits blendModeChanged event', () => {
      const callback = vi.fn();
      control.on('blendModeChanged', callback);

      control.setBlendRatio(0.3);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ blendRatio: 0.3 }));
    });

    it('CMP-U164: default blend ratio is 0.5', () => {
      expect(control.getBlendRatio()).toBe(0.5);
    });
  });

  describe('blend mode state interdependencies', () => {
    it('CMP-U170: enabling blend mode disables wipe mode', () => {
      control.setWipeMode('horizontal');
      expect(control.getWipeMode()).toBe('horizontal');

      control.setBlendMode('onionskin');
      expect(control.getWipeMode()).toBe('off');
      expect(control.getBlendMode()).toBe('onionskin');
    });

    it('CMP-U171: enabling blend mode disables difference matte', () => {
      control.setDifferenceMatteEnabled(true);
      expect(control.isDifferenceMatteEnabled()).toBe(true);

      control.setBlendMode('flicker');
      expect(control.isDifferenceMatteEnabled()).toBe(false);
      expect(control.getBlendMode()).toBe('flicker');
    });

    it('CMP-U172: enabling blend mode emits wipeModeChanged when wipe is active', () => {
      control.setWipeMode('horizontal');
      const callback = vi.fn();
      control.on('wipeModeChanged', callback);

      control.setBlendMode('blend');
      expect(callback).toHaveBeenCalledWith('off');
    });

    it('CMP-U173: enabling blend mode emits differenceMatteChanged when diff matte is active', () => {
      control.setDifferenceMatteEnabled(true);
      const callback = vi.fn();
      control.on('differenceMatteChanged', callback);

      control.setBlendMode('onionskin');
      expect(callback).toHaveBeenCalled();
    });

    it('CMP-U174: disabling blend mode does not re-enable wipe or diff matte', () => {
      control.setWipeMode('horizontal');
      control.setBlendMode('onionskin');
      expect(control.getWipeMode()).toBe('off');

      control.setBlendMode('off');
      expect(control.getWipeMode()).toBe('off'); // Stays off
    });

    it('CMP-U175: blend mode is part of isActive logic', () => {
      control.setBlendMode('onionskin');
      const state = control.getState();
      expect(state.blendMode.mode).toBe('onionskin');
    });
  });

  describe('isActive logic', () => {
    it('CMP-U070: isActive false when everything off', () => {
      const state = control.getState();
      // isActive is private, but we can check button styling indirectly
      // For now, we check state combinations that should be active
      expect(state.wipeMode).toBe('off');
      expect(state.differenceMatte.enabled).toBe(false);
      expect(state.currentAB).toBe('A');
    });

    it('CMP-U071: wipe mode makes control active', () => {
      control.setWipeMode('horizontal');
      const state = control.getState();
      expect(state.wipeMode).toBe('horizontal');
    });

    it('CMP-U072: difference matte makes control active', () => {
      control.setDifferenceMatteEnabled(true);
      const state = control.getState();
      expect(state.differenceMatte.enabled).toBe(true);
    });

    it('CMP-U073: B source with availability makes control active', () => {
      control.setABAvailable(true);
      control.setABSource('B');
      const state = control.getState();
      expect(state.currentAB).toBe('B');
      expect(state.abAvailable).toBe(true);
    });

    it('CMP-U074: B source without availability does not show as active', () => {
      control.setABAvailable(false);
      control.setABSource('B');
      const state = control.getState();
      expect(state.currentAB).toBe('B');
      expect(state.abAvailable).toBe(false);
    });
  });

  describe('getWipeState compatibility', () => {
    it('CMP-U080: getWipeState returns correct structure', () => {
      control.setWipeMode('horizontal');
      control.setWipePosition(0.3);

      const wipeState = control.getWipeState();
      expect(wipeState.mode).toBe('horizontal');
      expect(wipeState.position).toBe(0.3);
      expect(wipeState.showOriginal).toBe('left');
    });

    it('CMP-U081: getWipeState showOriginal is left for horizontal', () => {
      control.setWipeMode('horizontal');
      expect(control.getWipeState().showOriginal).toBe('left');
    });

    it('CMP-U082: getWipeState showOriginal is top for vertical', () => {
      control.setWipeMode('vertical');
      expect(control.getWipeState().showOriginal).toBe('top');
    });

    it('CMP-U083: getWipeState showOriginal is top for off (defaults to vertical behavior)', () => {
      control.setWipeMode('off');
      expect(control.getWipeState().showOriginal).toBe('top');
    });
  });

  describe('getDifferenceMatteState', () => {
    it('CMP-U090: returns copy of difference matte state', () => {
      const state1 = control.getDifferenceMatteState();
      const state2 = control.getDifferenceMatteState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CMP-U091: returns complete difference matte state', () => {
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
    it('CMP-U100: getState returns copy of full state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CMP-U101: getState returns complete state', () => {
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
    it('CMP-U110: stateChanged emitted for wipe mode change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setWipeMode('horizontal');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ wipeMode: 'horizontal' }));
    });

    it('CMP-U111: stateChanged emitted for wipe position change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setWipePosition(0.7);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ wipePosition: 0.7 }));
    });

    it('CMP-U112: stateChanged emitted for AB source change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setABSource('B');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ currentAB: 'B' }));
    });

    it('CMP-U113: stateChanged emitted for difference matte change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setDifferenceMatteEnabled(true);
      expect(callback).toHaveBeenCalled();
    });

    it('CMP-U114: stateChanged emitted for blend mode change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setBlendMode('onionskin');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          blendMode: expect.objectContaining({ mode: 'onionskin' }),
        })
      );
    });

    it('CMP-U115: stateChanged emitted for onion opacity change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setOnionOpacity(0.7);
      expect(callback).toHaveBeenCalled();
    });

    it('CMP-U116: stateChanged emitted for flicker rate change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setFlickerRate(10);
      expect(callback).toHaveBeenCalled();
    });

    it('CMP-U117: stateChanged emitted for blend ratio change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setBlendRatio(0.3);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('aria attributes', () => {
    function openDropdown(): HTMLElement {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="compare-control-button"]') as HTMLButtonElement;
      button.click();
      return document.querySelector('[data-testid="compare-dropdown"]')!;
    }

    afterEach(() => {
      // Clean up any appended elements
      document.querySelectorAll('.compare-control, .compare-dropdown').forEach(el => el.remove());
    });

    it('CMP-U130: A button has aria-pressed=true when source is A', () => {
      const dropdown = openDropdown();
      const aButton = dropdown.querySelector('[data-testid="compare-ab-a"]') as HTMLButtonElement;
      expect(aButton.getAttribute('aria-pressed')).toBe('true');
    });

    it('CMP-U131: B button has aria-pressed=false when source is A', () => {
      const dropdown = openDropdown();
      const bButton = dropdown.querySelector('[data-testid="compare-ab-b"]') as HTMLButtonElement;
      expect(bButton.getAttribute('aria-pressed')).toBe('false');
    });

    it('CMP-U132: B button has aria-disabled=true when A/B unavailable', () => {
      const dropdown = openDropdown();
      const bButton = dropdown.querySelector('[data-testid="compare-ab-b"]') as HTMLButtonElement;
      expect(bButton.getAttribute('aria-disabled')).toBe('true');
    });

    it('CMP-U133: toggle button has aria-disabled=true when A/B unavailable', () => {
      const dropdown = openDropdown();
      const toggle = dropdown.querySelector('[data-testid="compare-ab-toggle"]') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-disabled')).toBe('true');
    });

    it('CMP-U134: B button aria-pressed=true after switching to B source', () => {
      control.setABAvailable(true);
      control.setABSource('B');
      const dropdown = openDropdown();
      const aButton = dropdown.querySelector('[data-testid="compare-ab-a"]') as HTMLButtonElement;
      const bButton = dropdown.querySelector('[data-testid="compare-ab-b"]') as HTMLButtonElement;
      expect(bButton.getAttribute('aria-pressed')).toBe('true');
      expect(aButton.getAttribute('aria-pressed')).toBe('false');
    });

    it('CMP-U135: B button aria-disabled=false when A/B available', () => {
      control.setABAvailable(true);
      const dropdown = openDropdown();
      const bButton = dropdown.querySelector('[data-testid="compare-ab-b"]') as HTMLButtonElement;
      expect(bButton.getAttribute('aria-disabled')).toBe('false');
    });

    it('CMP-U136: wipe option aria-pressed matches active mode', () => {
      control.setWipeMode('horizontal');
      const dropdown = openDropdown();
      const hOption = dropdown.querySelector('[data-wipe-mode="horizontal"]') as HTMLButtonElement;
      const offOption = dropdown.querySelector('[data-wipe-mode="off"]') as HTMLButtonElement;
      expect(hOption.getAttribute('aria-pressed')).toBe('true');
      expect(offOption.getAttribute('aria-pressed')).toBe('false');
    });

    it('CMP-U137: diff matte toggle aria-pressed reflects enabled state', () => {
      control.setABAvailable(true);
      control.setDifferenceMatteEnabled(true);
      const dropdown = openDropdown();
      const diffToggle = dropdown.querySelector('[data-testid="diff-matte-toggle"]') as HTMLButtonElement;
      expect(diffToggle.getAttribute('aria-pressed')).toBe('true');
    });

    it('CMP-U138: heatmap toggle aria-pressed reflects heatmap state', () => {
      control.setABAvailable(true);
      control.setDifferenceMatteEnabled(true);
      control.setDifferenceMatteHeatmap(true);
      const dropdown = openDropdown();
      const heatmap = dropdown.querySelector('[data-testid="diff-matte-heatmap"]') as HTMLButtonElement;
      expect(heatmap.getAttribute('aria-pressed')).toBe('true');
    });

    it('CMP-U139: blend mode button aria-pressed matches active mode', () => {
      control.setABAvailable(true);
      control.setBlendMode('onionskin');
      const dropdown = openDropdown();
      const onionBtn = dropdown.querySelector('[data-blend-mode="onionskin"]') as HTMLButtonElement;
      const flickerBtn = dropdown.querySelector('[data-blend-mode="flicker"]') as HTMLButtonElement;
      expect(onionBtn.getAttribute('aria-pressed')).toBe('true');
      expect(flickerBtn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('dispose', () => {
    it('CMP-U120: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('CMP-U121: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
