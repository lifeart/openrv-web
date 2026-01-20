/**
 * StereoControl Component Tests
 *
 * Tests for the stereo 3D viewing mode selector with support for
 * side-by-side, over-under, anaglyph, and other stereoscopic modes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StereoControl } from './StereoControl';
import { DEFAULT_STEREO_STATE, StereoMode } from '../../stereo/StereoRenderer';

describe('StereoControl', () => {
  let control: StereoControl;

  beforeEach(() => {
    control = new StereoControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('STEREO-U001: should initialize with default state', () => {
      expect(control.getState()).toEqual(DEFAULT_STEREO_STATE);
    });

    it('STEREO-U002: default mode should be off', () => {
      expect(control.getMode()).toBe('off');
    });

    it('STEREO-U003: default eyeSwap should be false', () => {
      expect(control.getEyeSwap()).toBe(false);
    });

    it('STEREO-U004: default offset should be 0', () => {
      expect(control.getOffset()).toBe(0);
    });

    it('STEREO-U005: isActive should return false when mode is off', () => {
      expect(control.isActive()).toBe(false);
    });
  });

  describe('render', () => {
    it('STEREO-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('stereo-control');
    });

    it('STEREO-U011: container has mode button', () => {
      const el = control.render();
      const modeBtn = el.querySelector('[data-testid="stereo-mode-button"]');
      expect(modeBtn).not.toBeNull();
    });

    it('STEREO-U012: container has eye swap button', () => {
      const el = control.render();
      const swapBtn = el.querySelector('[data-testid="stereo-eye-swap"]');
      expect(swapBtn).not.toBeNull();
    });

    it('STEREO-U013: container has offset container', () => {
      const el = control.render();
      const offsetContainer = el.querySelector('[data-testid="stereo-offset-container"]');
      expect(offsetContainer).not.toBeNull();
    });

    it('STEREO-U014: offset slider has correct range', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="stereo-offset-slider"]') as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(slider.min).toBe('-20');
      expect(slider.max).toBe('20');
      expect(slider.step).toBe('0.5');
    });
  });

  describe('mode selection', () => {
    it('STEREO-U020: setMode changes current mode', () => {
      control.setMode('side-by-side');
      expect(control.getMode()).toBe('side-by-side');

      control.setMode('anaglyph');
      expect(control.getMode()).toBe('anaglyph');
    });

    it('STEREO-U021: setMode emits modeChanged event', () => {
      const callback = vi.fn();
      control.on('modeChanged', callback);

      control.setMode('over-under');
      expect(callback).toHaveBeenCalledWith('over-under');
    });

    it('STEREO-U022: setMode emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setMode('mirror');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ mode: 'mirror' }));
    });

    it('STEREO-U023: setMode does not emit if mode unchanged', () => {
      control.setMode('anaglyph');
      const callback = vi.fn();
      control.on('modeChanged', callback);

      control.setMode('anaglyph'); // Same mode
      expect(callback).not.toHaveBeenCalled();
    });

    it('STEREO-U024: setMode to active mode makes isActive true', () => {
      control.setMode('side-by-side');
      expect(control.isActive()).toBe(true);
    });

    it('STEREO-U025: setMode to off makes isActive false', () => {
      control.setMode('anaglyph');
      control.setMode('off');
      expect(control.isActive()).toBe(false);
    });
  });

  describe('cycleMode', () => {
    it('STEREO-U030: cycleMode cycles through all modes', () => {
      const expectedOrder: StereoMode[] = [
        'off',
        'side-by-side',
        'over-under',
        'mirror',
        'anaglyph',
        'anaglyph-luminance',
        'checkerboard',
        'scanline',
      ];

      for (let i = 0; i < expectedOrder.length; i++) {
        expect(control.getMode()).toBe(expectedOrder[i]);
        control.cycleMode();
      }
      // Should wrap back to 'off'
      expect(control.getMode()).toBe('off');
    });

    it('STEREO-U031: cycleMode emits modeChanged event', () => {
      const callback = vi.fn();
      control.on('modeChanged', callback);

      control.cycleMode();
      expect(callback).toHaveBeenCalledWith('side-by-side');
    });
  });

  describe('eye swap', () => {
    it('STEREO-U040: setEyeSwap changes eye swap state', () => {
      control.setEyeSwap(true);
      expect(control.getEyeSwap()).toBe(true);

      control.setEyeSwap(false);
      expect(control.getEyeSwap()).toBe(false);
    });

    it('STEREO-U041: setEyeSwap emits eyeSwapChanged event', () => {
      const callback = vi.fn();
      control.on('eyeSwapChanged', callback);

      control.setEyeSwap(true);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('STEREO-U042: setEyeSwap emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setEyeSwap(true);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ eyeSwap: true }));
    });

    it('STEREO-U043: setEyeSwap does not emit if unchanged', () => {
      const callback = vi.fn();
      control.on('eyeSwapChanged', callback);

      control.setEyeSwap(false); // Already false
      expect(callback).not.toHaveBeenCalled();
    });

    it('STEREO-U044: toggleEyeSwap switches eye swap state', () => {
      expect(control.getEyeSwap()).toBe(false);
      control.toggleEyeSwap();
      expect(control.getEyeSwap()).toBe(true);
      control.toggleEyeSwap();
      expect(control.getEyeSwap()).toBe(false);
    });
  });

  describe('offset', () => {
    it('STEREO-U050: setOffset changes offset value', () => {
      control.setOffset(5);
      expect(control.getOffset()).toBe(5);

      control.setOffset(-10);
      expect(control.getOffset()).toBe(-10);
    });

    it('STEREO-U051: setOffset clamps to -20 to 20 range', () => {
      control.setOffset(50);
      expect(control.getOffset()).toBe(20);

      control.setOffset(-50);
      expect(control.getOffset()).toBe(-20);
    });

    it('STEREO-U052: setOffset accepts boundary values', () => {
      control.setOffset(-20);
      expect(control.getOffset()).toBe(-20);

      control.setOffset(20);
      expect(control.getOffset()).toBe(20);
    });

    it('STEREO-U053: setOffset emits offsetChanged event', () => {
      const callback = vi.fn();
      control.on('offsetChanged', callback);

      control.setOffset(10);
      expect(callback).toHaveBeenCalledWith(10);
    });

    it('STEREO-U054: setOffset emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setOffset(5);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ offset: 5 }));
    });

    it('STEREO-U055: setOffset does not emit if unchanged', () => {
      control.setOffset(5);
      const callback = vi.fn();
      control.on('offsetChanged', callback);

      control.setOffset(5); // Same value
      expect(callback).not.toHaveBeenCalled();
    });

    it('STEREO-U056: setOffset with clamped value emits clamped value', () => {
      const callback = vi.fn();
      control.on('offsetChanged', callback);

      control.setOffset(100); // Should clamp to 20
      expect(callback).toHaveBeenCalledWith(20);
    });
  });

  describe('state management', () => {
    it('STEREO-U060: getState returns copy of state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('STEREO-U061: setState sets all state values', () => {
      control.setState({
        mode: 'anaglyph',
        eyeSwap: true,
        offset: 15,
      });

      const state = control.getState();
      expect(state.mode).toBe('anaglyph');
      expect(state.eyeSwap).toBe(true);
      expect(state.offset).toBe(15);
    });

    it('STEREO-U062: setState emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setState({ mode: 'checkerboard', eyeSwap: false, offset: 0 });
      expect(callback).toHaveBeenCalled();
    });

    it('STEREO-U063: setState does not emit if state unchanged', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setState(DEFAULT_STEREO_STATE); // Same as current
      expect(callback).not.toHaveBeenCalled();
    });

    it('STEREO-U064: reset restores default state', () => {
      control.setMode('scanline');
      control.setEyeSwap(true);
      control.setOffset(10);

      control.reset();

      expect(control.getState()).toEqual(DEFAULT_STEREO_STATE);
    });
  });

  describe('keyboard handling', () => {
    it('STEREO-U070: handleKeyboard Shift+3 cycles mode', () => {
      const result = control.handleKeyboard('3', true);
      expect(result).toBe(true);
      expect(control.getMode()).toBe('side-by-side');
    });

    it('STEREO-U071: handleKeyboard returns false for non-handled keys', () => {
      const result = control.handleKeyboard('a', false);
      expect(result).toBe(false);
    });

    it('STEREO-U072: handleKeyboard without shift does not cycle', () => {
      const result = control.handleKeyboard('3', false);
      expect(result).toBe(false);
      expect(control.getMode()).toBe('off');
    });
  });

  describe('all stereo modes', () => {
    const modes: StereoMode[] = [
      'off',
      'side-by-side',
      'over-under',
      'mirror',
      'anaglyph',
      'anaglyph-luminance',
      'checkerboard',
      'scanline',
    ];

    modes.forEach((mode) => {
      it(`STEREO-U080-${mode}: setMode accepts ${mode}`, () => {
        control.setMode(mode);
        expect(control.getMode()).toBe(mode);
      });
    });
  });

  describe('dispose', () => {
    it('STEREO-U090: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('STEREO-U091: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
