/**
 * StereoEyeTransformControl Component Tests
 *
 * Tests for the per-eye geometric transform panel including state management,
 * link/unlink, reset, and panel visibility.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StereoEyeTransformControl } from './StereoEyeTransformControl';
import {
  DEFAULT_EYE_TRANSFORM,
} from '../../stereo/StereoEyeTransform';

describe('StereoEyeTransformControl', () => {
  let control: StereoEyeTransformControl;

  beforeEach(() => {
    control = new StereoEyeTransformControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('SETC-U001: Initializes with default state', () => {
      const state = control.getState();
      expect(state.left).toEqual(DEFAULT_EYE_TRANSFORM);
      expect(state.right).toEqual(DEFAULT_EYE_TRANSFORM);
      expect(state.linked).toBe(false);
    });

    it('SETC-U002: Default left eye has all transforms at default', () => {
      const state = control.getState();
      expect(state.left.flipH).toBe(false);
      expect(state.left.flipV).toBe(false);
      expect(state.left.rotation).toBe(0);
      expect(state.left.scale).toBe(1.0);
      expect(state.left.translateX).toBe(0);
      expect(state.left.translateY).toBe(0);
    });

    it('SETC-U003: Default right eye has all transforms at default', () => {
      const state = control.getState();
      expect(state.right.flipH).toBe(false);
      expect(state.right.flipV).toBe(false);
      expect(state.right.rotation).toBe(0);
      expect(state.right.scale).toBe(1.0);
      expect(state.right.translateX).toBe(0);
      expect(state.right.translateY).toBe(0);
    });

    it('SETC-U004: Default linked is false', () => {
      expect(control.getState().linked).toBe(false);
    });

    it('SETC-U005: isActive returns false when all defaults', () => {
      expect(control.isActive()).toBe(false);
    });
  });

  describe('render', () => {
    it('SETC-U010: Render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('SETC-U011: Container has eye transform toggle button', () => {
      const el = control.render();
      const btn = el.querySelector('[data-testid="stereo-eye-transform-button"]');
      expect(btn).not.toBeNull();
    });

    it('SETC-U012: Panel has left eye section', () => {
      control.showPanel();
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      const leftSection = panel?.querySelector('[data-testid="stereo-left-eye-section"]');
      expect(leftSection).not.toBeNull();
    });

    it('SETC-U013: Panel has right eye section', () => {
      control.showPanel();
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      const rightSection = panel?.querySelector('[data-testid="stereo-right-eye-section"]');
      expect(rightSection).not.toBeNull();
    });

    it('SETC-U014: Panel has link toggle', () => {
      control.showPanel();
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      const linkBtn = panel?.querySelector('[data-testid="stereo-eye-link-toggle"]');
      expect(linkBtn).not.toBeNull();
    });

    it('SETC-U015: Panel has reset all button', () => {
      control.showPanel();
      const panel = document.querySelector('[data-testid="stereo-eye-transform-panel"]');
      const resetBtn = panel?.querySelector('[data-testid="stereo-eye-transform-reset"]');
      expect(resetBtn).not.toBeNull();
    });

    it('SETC-U016: Left section has FlipH button', () => {
      control.showPanel();
      const btn = document.querySelector('[data-testid="stereo-left-flip-h"]');
      expect(btn).not.toBeNull();
    });

    it('SETC-U017: Left section has FlipV button', () => {
      control.showPanel();
      const btn = document.querySelector('[data-testid="stereo-left-flip-v"]');
      expect(btn).not.toBeNull();
    });

    it('SETC-U018: Left section has rotation slider', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-rotation"]');
      expect(slider).not.toBeNull();
    });

    it('SETC-U019: Left section has scale slider', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-scale"]');
      expect(slider).not.toBeNull();
    });

    it('SETC-U020: Left section has translateX slider', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-translate-x"]');
      expect(slider).not.toBeNull();
    });

    it('SETC-U021: Left section has translateY slider', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-translate-y"]');
      expect(slider).not.toBeNull();
    });

    it('SETC-U022: Right section has all controls matching left', () => {
      control.showPanel();
      expect(document.querySelector('[data-testid="stereo-right-flip-h"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="stereo-right-flip-v"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="stereo-right-rotation"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="stereo-right-scale"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="stereo-right-translate-x"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="stereo-right-translate-y"]')).not.toBeNull();
    });

    it('SETC-U023: Rotation slider has correct range (-180 to 180)', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-rotation"]') as HTMLInputElement;
      expect(slider.min).toBe('-180');
      expect(slider.max).toBe('180');
    });

    it('SETC-U024: Scale slider has correct range (0.5 to 2.0)', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-scale"]') as HTMLInputElement;
      expect(slider.min).toBe('0.5');
      expect(slider.max).toBe('2');
    });

    it('SETC-U025: TranslateX slider has correct range (-100 to 100)', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-translate-x"]') as HTMLInputElement;
      expect(slider.min).toBe('-100');
      expect(slider.max).toBe('100');
    });

    it('SETC-U026: TranslateY slider has correct range (-100 to 100)', () => {
      control.showPanel();
      const slider = document.querySelector('[data-testid="stereo-left-translate-y"]') as HTMLInputElement;
      expect(slider.min).toBe('-100');
      expect(slider.max).toBe('100');
    });
  });

  describe('left eye controls', () => {
    it('SETC-U030: setLeftFlipH changes state', () => {
      control.setLeftFlipH(true);
      expect(control.getState().left.flipH).toBe(true);
    });

    it('SETC-U031: setLeftFlipH emits transformChanged', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.setLeftFlipH(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0].left.flipH).toBe(true);
    });

    it('SETC-U032: setLeftFlipV changes state', () => {
      control.setLeftFlipV(true);
      expect(control.getState().left.flipV).toBe(true);
    });

    it('SETC-U033: setLeftRotation changes state', () => {
      control.setLeftRotation(45);
      expect(control.getState().left.rotation).toBe(45);
    });

    it('SETC-U034: setLeftRotation clamps to range', () => {
      control.setLeftRotation(200);
      expect(control.getState().left.rotation).toBe(180);
      control.setLeftRotation(-200);
      expect(control.getState().left.rotation).toBe(-180);
    });

    it('SETC-U035: setLeftScale changes state', () => {
      control.setLeftScale(1.5);
      expect(control.getState().left.scale).toBe(1.5);
    });

    it('SETC-U036: setLeftScale clamps to range', () => {
      control.setLeftScale(0.1);
      expect(control.getState().left.scale).toBe(0.5);
      control.setLeftScale(5.0);
      expect(control.getState().left.scale).toBe(2.0);
    });

    it('SETC-U037: setLeftTranslateX changes state', () => {
      control.setLeftTranslateX(50);
      expect(control.getState().left.translateX).toBe(50);
    });

    it('SETC-U038: setLeftTranslateX clamps to range', () => {
      control.setLeftTranslateX(200);
      expect(control.getState().left.translateX).toBe(100);
      control.setLeftTranslateX(-200);
      expect(control.getState().left.translateX).toBe(-100);
    });

    it('SETC-U039: setLeftTranslateY changes state', () => {
      control.setLeftTranslateY(-30);
      expect(control.getState().left.translateY).toBe(-30);
    });

    it('SETC-U040: setLeftTranslateY clamps to range', () => {
      control.setLeftTranslateY(200);
      expect(control.getState().left.translateY).toBe(100);
    });
  });

  describe('right eye controls', () => {
    it('SETC-U050: setRightFlipH changes state', () => {
      control.setRightFlipH(true);
      expect(control.getState().right.flipH).toBe(true);
    });

    it('SETC-U051: setRightFlipH emits transformChanged', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.setRightFlipH(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('SETC-U052: setRightFlipV changes state', () => {
      control.setRightFlipV(true);
      expect(control.getState().right.flipV).toBe(true);
    });

    it('SETC-U053: setRightRotation changes state', () => {
      control.setRightRotation(-30);
      expect(control.getState().right.rotation).toBe(-30);
    });

    it('SETC-U054: setRightRotation clamps to range', () => {
      control.setRightRotation(200);
      expect(control.getState().right.rotation).toBe(180);
    });

    it('SETC-U055: setRightScale changes state', () => {
      control.setRightScale(0.8);
      expect(control.getState().right.scale).toBe(0.8);
    });

    it('SETC-U056: setRightScale clamps to range', () => {
      control.setRightScale(0.1);
      expect(control.getState().right.scale).toBe(0.5);
    });

    it('SETC-U057: setRightTranslateX changes state', () => {
      control.setRightTranslateX(75);
      expect(control.getState().right.translateX).toBe(75);
    });

    it('SETC-U058: setRightTranslateX clamps to range', () => {
      control.setRightTranslateX(-200);
      expect(control.getState().right.translateX).toBe(-100);
    });

    it('SETC-U059: setRightTranslateY changes state', () => {
      control.setRightTranslateY(25);
      expect(control.getState().right.translateY).toBe(25);
    });

    it('SETC-U060: setRightTranslateY clamps to range', () => {
      control.setRightTranslateY(300);
      expect(control.getState().right.translateY).toBe(100);
    });
  });

  describe('link mode', () => {
    it('SETC-U070: setLinked changes linked state', () => {
      control.setLinked(true);
      expect(control.getState().linked).toBe(true);
    });

    it('SETC-U071: When linked, setLeftRotation also sets right rotation', () => {
      control.setLinked(true);
      control.setLeftRotation(45);
      expect(control.getState().left.rotation).toBe(45);
      expect(control.getState().right.rotation).toBe(45);
    });

    it('SETC-U072: When linked, setRightScale also sets left scale', () => {
      control.setLinked(true);
      control.setRightScale(1.5);
      expect(control.getState().right.scale).toBe(1.5);
      expect(control.getState().left.scale).toBe(1.5);
    });

    it('SETC-U073: When linked, toggleLeftFlipH also toggles right FlipH', () => {
      control.setLinked(true);
      control.setLeftFlipH(true);
      expect(control.getState().left.flipH).toBe(true);
      expect(control.getState().right.flipH).toBe(true);
    });

    it('SETC-U074: When linked, setLeftTranslateX also sets right translateX', () => {
      control.setLinked(true);
      control.setLeftTranslateX(30);
      expect(control.getState().left.translateX).toBe(30);
      expect(control.getState().right.translateX).toBe(30);
    });

    it('SETC-U075: Unlinking does not change current values', () => {
      control.setLinked(true);
      control.setLeftRotation(45);
      control.setLeftScale(1.5);
      // Both eyes should be 45 and 1.5 now
      control.setLinked(false);
      expect(control.getState().left.rotation).toBe(45);
      expect(control.getState().right.rotation).toBe(45);
      expect(control.getState().left.scale).toBe(1.5);
      expect(control.getState().right.scale).toBe(1.5);
    });

    it('SETC-U076: When linked, only one transformChanged event emitted per change', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.setLinked(true);
      handler.mockClear();

      control.setLeftRotation(30);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('state management', () => {
    it('SETC-U080: getState returns copy of state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
      expect(state1.left).not.toBe(state2.left);
    });

    it('SETC-U081: setState sets all values', () => {
      control.setState({
        left: { flipH: true, flipV: false, rotation: 10, scale: 1.2, translateX: 5, translateY: -5 },
        right: { flipH: false, flipV: true, rotation: -20, scale: 0.8, translateX: -10, translateY: 10 },
        linked: true,
      });
      const state = control.getState();
      expect(state.left.flipH).toBe(true);
      expect(state.left.rotation).toBe(10);
      expect(state.right.flipV).toBe(true);
      expect(state.right.rotation).toBe(-20);
      expect(state.linked).toBe(true);
    });

    it('SETC-U082: setState emits transformChanged', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.setState({
        left: { ...DEFAULT_EYE_TRANSFORM, rotation: 10 },
        right: { ...DEFAULT_EYE_TRANSFORM },
        linked: false,
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('SETC-U083: setState does not emit if unchanged', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.setState({
        left: { ...DEFAULT_EYE_TRANSFORM },
        right: { ...DEFAULT_EYE_TRANSFORM },
        linked: false,
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('SETC-U084: reset restores all defaults', () => {
      control.setLeftRotation(45);
      control.setRightScale(1.5);
      control.setLinked(true);
      control.reset();
      const state = control.getState();
      expect(state.left).toEqual(DEFAULT_EYE_TRANSFORM);
      expect(state.right).toEqual(DEFAULT_EYE_TRANSFORM);
      expect(state.linked).toBe(false);
    });

    it('SETC-U085: reset emits transformChanged', () => {
      control.setLeftRotation(45); // Make non-default first
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.reset();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('panel visibility', () => {
    it('SETC-U090: Panel hidden by default', () => {
      expect(control.isPanelVisible()).toBe(false);
    });

    it('SETC-U091: togglePanel opens panel', () => {
      control.togglePanel();
      expect(control.isPanelVisible()).toBe(true);
    });

    it('SETC-U092: togglePanel closes open panel', () => {
      control.showPanel();
      control.togglePanel();
      expect(control.isPanelVisible()).toBe(false);
    });

    it('SETC-U093: show emits visibilityChanged true', () => {
      const handler = vi.fn();
      control.on('visibilityChanged', handler);
      control.showPanel();
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('SETC-U094: hide emits visibilityChanged false', () => {
      control.showPanel();
      const handler = vi.fn();
      control.on('visibilityChanged', handler);
      control.hidePanel();
      expect(handler).toHaveBeenCalledWith(false);
    });
  });

  describe('keyboard', () => {
    it('SETC-U100: Shift+E toggles panel visibility', () => {
      const handled = control.handleKeyboard('E', true);
      expect(handled).toBe(true);
      expect(control.isPanelVisible()).toBe(true);

      control.handleKeyboard('E', true);
      expect(control.isPanelVisible()).toBe(false);
    });

    it('SETC-U101: Returns false for non-handled keys', () => {
      expect(control.handleKeyboard('X', true)).toBe(false);
      expect(control.handleKeyboard('E', false)).toBe(false);
    });

    it('SETC-U102: Without shift does not toggle', () => {
      expect(control.handleKeyboard('E', false)).toBe(false);
      expect(control.isPanelVisible()).toBe(false);
    });
  });

  describe('no-op and edge cases', () => {
    it('SETC-U110: Does not emit if flipH set to same value', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.setLeftFlipH(false); // Already false
      expect(handler).not.toHaveBeenCalled();
    });

    it('SETC-U111: Does not emit if rotation set to same value', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);
      control.setLeftRotation(0); // Already 0
      expect(handler).not.toHaveBeenCalled();
    });

    it('SETC-U112: isActive returns true when any left transform is non-default', () => {
      control.setLeftRotation(5);
      expect(control.isActive()).toBe(true);
    });

    it('SETC-U113: isActive returns true when any right transform is non-default', () => {
      control.setRightFlipH(true);
      expect(control.isActive()).toBe(true);
    });
  });

  describe('dispose', () => {
    it('SETC-U120: Cleans up without error', () => {
      control.showPanel();
      expect(() => control.dispose()).not.toThrow();
    });

    it('SETC-U121: Can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
