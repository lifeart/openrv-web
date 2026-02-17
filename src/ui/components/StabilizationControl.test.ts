/**
 * StabilizationControl Unit Tests
 *
 * Tests the UI control component for stabilization settings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StabilizationControl } from './StabilizationControl';
import { DEFAULT_STABILIZATION_PARAMS } from '../../filters/StabilizeMotion';

describe('StabilizationControl', () => {
  let control: StabilizationControl;

  beforeEach(() => {
    control = new StabilizationControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('SC-001: constructor creates DOM without throwing', () => {
      let extra: StabilizationControl | undefined;
      expect(() => { extra = new StabilizationControl(); }).not.toThrow();
      extra!.dispose();
    });

    it('SC-002: render() returns HTMLElement with correct className', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('stabilization-control-container');
    });

    it('SC-003: button has correct data-testid', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="stabilization-control-button"]');
      expect(button).not.toBeNull();
    });

    it('SC-004: button has correct title text', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="stabilization-control-button"]') as HTMLButtonElement;
      expect(button.title).toBe('Stabilization preview');
    });

    it('SC-005: getParams() returns defaults initially', () => {
      expect(control.getParams()).toEqual(DEFAULT_STABILIZATION_PARAMS);
    });
  });

  describe('getParams / setParams / immutability', () => {
    it('SC-006: getParams() returns a copy (not same reference)', () => {
      const p1 = control.getParams();
      const p2 = control.getParams();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });

    it('SC-007: modifying returned params does not affect internal state', () => {
      const p = control.getParams();
      p.enabled = true;
      p.smoothingStrength = 99;
      p.cropAmount = 64;
      expect(control.getParams().enabled).toBe(false);
      expect(control.getParams().smoothingStrength).toBe(50);
      expect(control.getParams().cropAmount).toBe(8);
    });

    it('SC-008: setParams() updates internal state', () => {
      control.setParams({
        enabled: true,
        smoothingStrength: 75,
        cropAmount: 16,
      });
      const params = control.getParams();
      expect(params.enabled).toBe(true);
      expect(params.smoothingStrength).toBe(75);
      expect(params.cropAmount).toBe(16);
    });

    it('SC-009: setParams() emits stabilizationChanged event', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);

      control.setParams({ ...DEFAULT_STABILIZATION_PARAMS, enabled: true });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('SC-010: setParams() updates DOM elements when panel is open', () => {
      control.show();
      control.setParams({
        enabled: true,
        smoothingStrength: 75,
        cropAmount: 16,
      });

      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]') as HTMLInputElement;
      const smoothingSlider = document.querySelector('[data-testid="stabilization-smoothing-slider"]') as HTMLInputElement;
      const cropSlider = document.querySelector('[data-testid="stabilization-crop-slider"]') as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
      expect(smoothingSlider.value).toBe('75');
      expect(cropSlider.value).toBe('16');
    });

    it('SC-011: emitted event value is a copy of internal state', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);

      control.setParams({ ...DEFAULT_STABILIZATION_PARAMS, enabled: true, smoothingStrength: 80 });

      const emitted = handler.mock.calls[0][0];
      emitted.smoothingStrength = 0;
      expect(control.getParams().smoothingStrength).toBe(80);
    });
  });

  describe('reset', () => {
    it('SC-012: reset() restores defaults', () => {
      control.setParams({
        enabled: true,
        smoothingStrength: 75,
        cropAmount: 32,
      });
      control.reset();
      expect(control.getParams()).toEqual(DEFAULT_STABILIZATION_PARAMS);
    });

    it('SC-013: reset() emits event', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalledWith(DEFAULT_STABILIZATION_PARAMS);
    });

    it('SC-014: reset() updates DOM elements when panel is open', () => {
      control.show();
      control.setParams({
        enabled: true,
        smoothingStrength: 75,
        cropAmount: 32,
      });
      control.reset();

      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]') as HTMLInputElement;
      const smoothingSlider = document.querySelector('[data-testid="stabilization-smoothing-slider"]') as HTMLInputElement;
      const cropSlider = document.querySelector('[data-testid="stabilization-crop-slider"]') as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
      expect(smoothingSlider.value).toBe('50');
      expect(cropSlider.value).toBe('8');
    });
  });

  describe('events', () => {
    it('SC-015: off() removes listener', () => {
      const handler = vi.fn();
      const off = control.on('stabilizationChanged', handler);
      off();

      control.setParams({ ...DEFAULT_STABILIZATION_PARAMS, enabled: true });
      expect(handler).not.toHaveBeenCalled();
    });

    it('SC-016: multiple listeners all receive events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      control.on('stabilizationChanged', handler1);
      control.on('stabilizationChanged', handler2);

      control.setParams({ ...DEFAULT_STABILIZATION_PARAMS, enabled: true });
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('SC-017: event carries correct param values', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);

      const params = { enabled: true, smoothingStrength: 80, cropAmount: 20 };
      control.setParams(params);

      expect(handler).toHaveBeenCalledWith(params);
    });
  });

  describe('toggle/show/hide', () => {
    it('SC-018: isOpen false initially', () => {
      expect(control.isOpen).toBe(false);
    });

    it('SC-019: toggle() opens panel', () => {
      control.toggle();
      expect(control.isOpen).toBe(true);
    });

    it('SC-020: toggle() again closes panel', () => {
      control.toggle();
      control.toggle();
      expect(control.isOpen).toBe(false);
    });

    it('SC-021: show() twice is idempotent', () => {
      control.show();
      control.show();
      expect(control.isOpen).toBe(true);
    });

    it('SC-022: hide() twice is idempotent', () => {
      control.hide();
      control.hide();
      expect(control.isOpen).toBe(false);
    });
  });

  describe('slider interactions', () => {
    it('SC-023: smoothing slider has min=0, max=100, step=1', () => {
      control.show();
      const slider = document.querySelector('[data-testid="stabilization-smoothing-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('100');
      expect(slider.step).toBe('1');
    });

    it('SC-024: crop slider has min=0, max=64, step=1', () => {
      control.show();
      const slider = document.querySelector('[data-testid="stabilization-crop-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('64');
      expect(slider.step).toBe('1');
    });

    it('SC-025: moving smoothing slider updates params and emits event', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);
      control.show();

      const slider = document.querySelector('[data-testid="stabilization-smoothing-slider"]') as HTMLInputElement;
      slider.value = '80';
      slider.dispatchEvent(new Event('input'));

      expect(control.getParams().smoothingStrength).toBe(80);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ smoothingStrength: 80 }));
    });

    it('SC-026: moving crop slider updates params and emits event', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);
      control.show();

      const slider = document.querySelector('[data-testid="stabilization-crop-slider"]') as HTMLInputElement;
      slider.value = '32';
      slider.dispatchEvent(new Event('input'));

      expect(control.getParams().cropAmount).toBe(32);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cropAmount: 32 }));
    });

    it('SC-027: double-click smoothing slider resets to 50', () => {
      control.show();
      const slider = document.querySelector('[data-testid="stabilization-smoothing-slider"]') as HTMLInputElement;

      // First change to non-default
      slider.value = '80';
      slider.dispatchEvent(new Event('input'));
      expect(control.getParams().smoothingStrength).toBe(80);

      // Double-click to reset
      slider.dispatchEvent(new MouseEvent('dblclick'));
      expect(slider.value).toBe('50');
      expect(control.getParams().smoothingStrength).toBe(50);
    });

    it('SC-028: double-click crop slider resets to 8', () => {
      control.show();
      const slider = document.querySelector('[data-testid="stabilization-crop-slider"]') as HTMLInputElement;

      // First change to non-default
      slider.value = '32';
      slider.dispatchEvent(new Event('input'));
      expect(control.getParams().cropAmount).toBe(32);

      // Double-click to reset
      slider.dispatchEvent(new MouseEvent('dblclick'));
      expect(slider.value).toBe('8');
      expect(control.getParams().cropAmount).toBe(8);
    });
  });

  describe('UI interactions', () => {
    it('SC-029: checking enabled checkbox updates params and emits event', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);
      control.show();

      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(control.getParams().enabled).toBe(true);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('SC-030: clicking reset button restores defaults', () => {
      const handler = vi.fn();
      control.on('stabilizationChanged', handler);
      control.show();

      // Set non-default values first
      control.setParams({
        enabled: true,
        smoothingStrength: 75,
        cropAmount: 32,
      });
      handler.mockClear();

      const resetBtn = document.querySelector('[data-testid="stabilization-reset-button"]') as HTMLButtonElement;
      resetBtn.click();

      expect(control.getParams()).toEqual(DEFAULT_STABILIZATION_PARAMS);
      expect(handler).toHaveBeenCalledWith(DEFAULT_STABILIZATION_PARAMS);
    });

    it('SC-031: clicking toolbar button toggles panel', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="stabilization-control-button"]') as HTMLButtonElement;

      button.click();
      expect(control.isOpen).toBe(true);

      button.click();
      expect(control.isOpen).toBe(false);
    });

    it('SC-032: clicking outside panel closes it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      // Simulate click outside
      const outsideClick = new MouseEvent('click', { bubbles: true });
      document.body.dispatchEvent(outsideClick);

      expect(control.isOpen).toBe(false);
    });
  });

  describe('panel elements', () => {
    it('SC-033: panel has testid', () => {
      control.show();
      const panel = document.querySelector('[data-testid="stabilization-panel"]');
      expect(panel).not.toBeNull();
    });

    it('SC-034: panel has enabled checkbox', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]');
      expect(checkbox).not.toBeNull();
    });

    it('SC-035: panel has reset button', () => {
      control.show();
      const resetBtn = document.querySelector('[data-testid="stabilization-reset-button"]');
      expect(resetBtn).not.toBeNull();
    });
  });

  describe('label/checkbox accessibility (M-19)', () => {
    it('SC-M19a: checkbox has a unique id attribute', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]') as HTMLInputElement;
      expect(checkbox.id).toBe('stabilization-enabled-checkbox');
    });

    it('SC-M19b: label has htmlFor matching the checkbox id', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]') as HTMLInputElement;
      const label = checkbox.parentElement!.querySelector('label') as HTMLLabelElement;
      expect(label.htmlFor).toBe(checkbox.id);
    });

    it('SC-M19c: clicking the label toggles the checkbox state', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]') as HTMLInputElement;
      const label = checkbox.parentElement!.querySelector('label') as HTMLLabelElement;

      expect(checkbox.checked).toBe(false);
      label.click();
      expect(checkbox.checked).toBe(true);
      label.click();
      expect(checkbox.checked).toBe(false);
    });
  });

  describe('Escape key handling (M-14)', () => {
    it('SC-M14a: pressing Escape while the panel is open should close it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('SC-M14b: pressing Escape while the panel is closed should have no effect', () => {
      expect(control.isOpen).toBe(false);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('SC-M14c: the keydown listener should be removed when the panel closes', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.hide();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });

    it('SC-M14d: the keydown listener should be removed on dispose', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.dispose();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('SC-036: dispose() removes panel from body', () => {
      control.show();
      expect(document.querySelector('[data-testid="stabilization-panel"]')).not.toBeNull();

      control.dispose();
      expect(document.querySelector('[data-testid="stabilization-panel"]')).toBeNull();
    });

    it('SC-037: double dispose does not throw', () => {
      control.show();
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('SC-038: dispose cleans up injected style element', () => {
      control.show();
      // Trigger slider creation which injects a <style> element
      expect(document.getElementById('stabilization-slider-style')).not.toBeNull();

      control.dispose();
      expect(document.getElementById('stabilization-slider-style')).toBeNull();
    });
  });

  describe('focus management (M-18)', () => {
    it('SC-M18a: when the panel opens, focus should move to the first interactive element inside it', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="stabilization-enabled-checkbox"]') as HTMLInputElement;
      expect(document.activeElement).toBe(checkbox);
    });

    it('SC-M18b: when the panel closes, focus should return to the toggle button', () => {
      const el = control.render();
      document.body.appendChild(el);
      control.show();
      control.hide();
      const button = el.querySelector('[data-testid="stabilization-control-button"]') as HTMLButtonElement;
      expect(document.activeElement).toBe(button);
      document.body.removeChild(el);
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('SC-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="stabilization-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('SC-M15b: toggle button aria-expanded should be "false" when panel is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="stabilization-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('SC-M15c: toggle button aria-expanded should be "true" when panel is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="stabilization-control-button"]') as HTMLButtonElement;
      control.show();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('SC-M15d: panel container should have role="dialog" attribute', () => {
      control.show();
      const panel = document.querySelector('[data-testid="stabilization-panel"]') as HTMLElement;
      expect(panel.getAttribute('role')).toBe('dialog');
    });

    it('SC-M15e: panel container should have aria-label attribute', () => {
      control.show();
      const panel = document.querySelector('[data-testid="stabilization-panel"]') as HTMLElement;
      expect(panel.getAttribute('aria-label')).toBe('Stabilization Settings');
    });
  });
});
