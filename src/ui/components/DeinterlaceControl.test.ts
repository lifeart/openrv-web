/**
 * DeinterlaceControl Unit Tests
 *
 * Tests the UI control component for deinterlace settings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeinterlaceControl } from './DeinterlaceControl';
import { DEFAULT_DEINTERLACE_PARAMS } from '../../filters/Deinterlace';

describe('DeinterlaceControl', () => {
  let control: DeinterlaceControl;

  beforeEach(() => {
    control = new DeinterlaceControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('DC-001: creates control with default params', () => {
      expect(control.getParams()).toEqual(DEFAULT_DEINTERLACE_PARAMS);
    });

    it('DC-002: renders a container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('deinterlace-control-container');
    });

    it('DC-003: container has a button with testid', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="deinterlace-control-button"]');
      expect(button).not.toBeNull();
    });
  });

  describe('getParams / setParams', () => {
    it('DC-004: setParams updates internal state', () => {
      control.setParams({ method: 'blend', fieldOrder: 'bff', enabled: true });
      const params = control.getParams();
      expect(params.method).toBe('blend');
      expect(params.fieldOrder).toBe('bff');
      expect(params.enabled).toBe(true);
    });

    it('DC-020: getParams returns a copy, not the same reference', () => {
      const p1 = control.getParams();
      const p2 = control.getParams();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });

    it('DC-021: modifying returned params does not affect internal state', () => {
      const p = control.getParams();
      p.method = 'blend';
      p.enabled = true;
      expect(control.getParams().method).toBe('bob');
      expect(control.getParams().enabled).toBe(false);
    });

    it('DC-022: setParams updates DOM elements when panel is open', () => {
      control.show();
      control.setParams({ method: 'blend', fieldOrder: 'bff', enabled: true });

      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]') as HTMLInputElement;
      const methodSelect = document.querySelector('[data-testid="deinterlace-method-select"]') as HTMLSelectElement;
      const fieldOrderSelect = document.querySelector('[data-testid="deinterlace-field-order-select"]') as HTMLSelectElement;

      expect(checkbox.checked).toBe(true);
      expect(methodSelect.value).toBe('blend');
      expect(fieldOrderSelect.value).toBe('bff');
    });
  });

  describe('reset', () => {
    it('DC-005: reset restores defaults', () => {
      control.setParams({ method: 'blend', fieldOrder: 'bff', enabled: true });
      control.reset();
      expect(control.getParams()).toEqual(DEFAULT_DEINTERLACE_PARAMS);
    });

    it('DC-023: reset updates DOM elements when panel is open', () => {
      control.show();
      control.setParams({ method: 'blend', fieldOrder: 'bff', enabled: true });
      control.reset();

      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]') as HTMLInputElement;
      const methodSelect = document.querySelector('[data-testid="deinterlace-method-select"]') as HTMLSelectElement;
      const fieldOrderSelect = document.querySelector('[data-testid="deinterlace-field-order-select"]') as HTMLSelectElement;

      expect(checkbox.checked).toBe(false);
      expect(methodSelect.value).toBe('bob');
      expect(fieldOrderSelect.value).toBe('tff');
    });
  });

  describe('events', () => {
    it('DC-006: emits deinterlaceChanged on setParams', () => {
      const handler = vi.fn();
      control.on('deinterlaceChanged', handler);

      control.setParams({ ...DEFAULT_DEINTERLACE_PARAMS, enabled: true });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('DC-007: emits deinterlaceChanged on reset', () => {
      const handler = vi.fn();
      control.on('deinterlaceChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalledWith(DEFAULT_DEINTERLACE_PARAMS);
    });

    it('DC-024: emitted value is a copy of internal state', () => {
      const handler = vi.fn();
      control.on('deinterlaceChanged', handler);

      control.setParams({ method: 'blend', fieldOrder: 'bff', enabled: true });

      const emitted = handler.mock.calls[0][0];
      emitted.method = 'weave';
      expect(control.getParams().method).toBe('blend');
    });

    it('DC-025: off removes an event listener', () => {
      const handler = vi.fn();
      const off = control.on('deinterlaceChanged', handler);
      off();

      control.setParams({ ...DEFAULT_DEINTERLACE_PARAMS, enabled: true });
      expect(handler).not.toHaveBeenCalled();
    });

    it('DC-026: multiple listeners all receive events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      control.on('deinterlaceChanged', handler1);
      control.on('deinterlaceChanged', handler2);

      control.setParams({ ...DEFAULT_DEINTERLACE_PARAMS, enabled: true });
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('toggle/show/hide', () => {
    it('DC-008: isOpen is false by default', () => {
      expect(control.isOpen).toBe(false);
    });

    it('DC-009: show/hide toggle panel state', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      control.hide();
      expect(control.isOpen).toBe(false);
    });

    it('DC-010: toggle toggles panel open/close', () => {
      control.toggle();
      expect(control.isOpen).toBe(true);

      control.toggle();
      expect(control.isOpen).toBe(false);
    });

    it('DC-027: show is idempotent', () => {
      control.show();
      control.show();
      expect(control.isOpen).toBe(true);
    });

    it('DC-028: hide is idempotent', () => {
      control.hide();
      control.hide();
      expect(control.isOpen).toBe(false);
    });
  });

  describe('panel elements', () => {
    it('DC-011: panel has testid', () => {
      control.show();
      const panel = document.querySelector('[data-testid="deinterlace-panel"]');
      expect(panel).not.toBeNull();
    });

    it('DC-012: panel has method and field order selects', () => {
      control.show();
      const methodSelect = document.querySelector('[data-testid="deinterlace-method-select"]');
      const fieldOrderSelect = document.querySelector('[data-testid="deinterlace-field-order-select"]');
      expect(methodSelect).not.toBeNull();
      expect(fieldOrderSelect).not.toBeNull();
    });

    it('DC-013: panel has enabled checkbox', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]');
      expect(checkbox).not.toBeNull();
    });

    it('DC-014: panel has reset button', () => {
      control.show();
      const resetBtn = document.querySelector('[data-testid="deinterlace-reset-button"]');
      expect(resetBtn).not.toBeNull();
    });

    it('DC-029: method select has 3 options (bob, weave, blend)', () => {
      control.show();
      const select = document.querySelector('[data-testid="deinterlace-method-select"]') as HTMLSelectElement;
      expect(select.options.length).toBe(3);
      const values = Array.from(select.options).map(o => o.value);
      expect(values).toContain('bob');
      expect(values).toContain('weave');
      expect(values).toContain('blend');
    });

    it('DC-030: field order select has 2 options (tff, bff)', () => {
      control.show();
      const select = document.querySelector('[data-testid="deinterlace-field-order-select"]') as HTMLSelectElement;
      expect(select.options.length).toBe(2);
      const values = Array.from(select.options).map(o => o.value);
      expect(values).toContain('tff');
      expect(values).toContain('bff');
    });
  });

  describe('UI interactions', () => {
    it('DC-031: checking enabled checkbox updates params and emits event', () => {
      const handler = vi.fn();
      control.on('deinterlaceChanged', handler);
      control.show();

      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(control.getParams().enabled).toBe(true);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('DC-032: changing method select updates params and emits event', () => {
      const handler = vi.fn();
      control.on('deinterlaceChanged', handler);
      control.show();

      const select = document.querySelector('[data-testid="deinterlace-method-select"]') as HTMLSelectElement;
      select.value = 'blend';
      select.dispatchEvent(new Event('change'));

      expect(control.getParams().method).toBe('blend');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ method: 'blend' }));
    });

    it('DC-033: changing field order select updates params and emits event', () => {
      const handler = vi.fn();
      control.on('deinterlaceChanged', handler);
      control.show();

      const select = document.querySelector('[data-testid="deinterlace-field-order-select"]') as HTMLSelectElement;
      select.value = 'bff';
      select.dispatchEvent(new Event('change'));

      expect(control.getParams().fieldOrder).toBe('bff');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ fieldOrder: 'bff' }));
    });

    it('DC-034: clicking reset button restores defaults', () => {
      const handler = vi.fn();
      control.on('deinterlaceChanged', handler);
      control.show();

      // Set non-default values first
      control.setParams({ method: 'blend', fieldOrder: 'bff', enabled: true });
      handler.mockClear();

      const resetBtn = document.querySelector('[data-testid="deinterlace-reset-button"]') as HTMLButtonElement;
      resetBtn.click();

      expect(control.getParams()).toEqual(DEFAULT_DEINTERLACE_PARAMS);
      expect(handler).toHaveBeenCalledWith(DEFAULT_DEINTERLACE_PARAMS);
    });

    it('DC-035: clicking toolbar button toggles the panel', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="deinterlace-control-button"]') as HTMLButtonElement;

      button.click();
      expect(control.isOpen).toBe(true);

      button.click();
      expect(control.isOpen).toBe(false);
    });

    it('DC-036: clicking outside the panel closes it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      // Simulate click outside
      const outsideClick = new MouseEvent('click', { bubbles: true });
      document.body.dispatchEvent(outsideClick);

      expect(control.isOpen).toBe(false);
    });
  });

  describe('label/checkbox accessibility (M-19)', () => {
    it('DC-M19a: checkbox has a unique id attribute', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]') as HTMLInputElement;
      expect(checkbox.id).toBe('deinterlace-enabled-checkbox');
    });

    it('DC-M19b: label has htmlFor matching the checkbox id', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]') as HTMLInputElement;
      const label = checkbox.parentElement!.querySelector('label') as HTMLLabelElement;
      expect(label.htmlFor).toBe(checkbox.id);
    });

    it('DC-M19c: clicking the label toggles the checkbox state', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]') as HTMLInputElement;
      const label = checkbox.parentElement!.querySelector('label') as HTMLLabelElement;

      expect(checkbox.checked).toBe(false);
      label.click();
      expect(checkbox.checked).toBe(true);
      label.click();
      expect(checkbox.checked).toBe(false);
    });
  });

  describe('Escape key handling (M-14)', () => {
    it('DC-M14a: pressing Escape while the panel is open should close it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('DC-M14b: pressing Escape while the panel is closed should have no effect', () => {
      expect(control.isOpen).toBe(false);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('DC-M14c: the keydown listener should be removed when the panel closes', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.hide();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });

    it('DC-M14d: the keydown listener should be removed on dispose', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.dispose();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('DC-015: dispose removes panel from body', () => {
      control.show();
      expect(document.querySelector('[data-testid="deinterlace-panel"]')).not.toBeNull();

      control.dispose();
      expect(document.querySelector('[data-testid="deinterlace-panel"]')).toBeNull();
    });

    it('DC-037: double dispose does not throw', () => {
      control.show();
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('DC-038: document click after dispose does not throw', () => {
      control.show();
      control.dispose();

      expect(() => {
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }).not.toThrow();
    });
  });

  describe('focus management (M-18)', () => {
    it('DC-M18a: when the panel opens, focus should move to the first interactive element inside it', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="deinterlace-enabled-checkbox"]') as HTMLInputElement;
      expect(document.activeElement).toBe(checkbox);
    });

    it('DC-M18b: when the panel closes, focus should return to the toggle button', () => {
      const el = control.render();
      document.body.appendChild(el);
      control.show();
      control.hide();
      const button = el.querySelector('[data-testid="deinterlace-control-button"]') as HTMLButtonElement;
      expect(document.activeElement).toBe(button);
      document.body.removeChild(el);
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('DC-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="deinterlace-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('DC-M15b: toggle button aria-expanded should be "false" when panel is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="deinterlace-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('DC-M15c: toggle button aria-expanded should be "true" when panel is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="deinterlace-control-button"]') as HTMLButtonElement;
      control.show();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('DC-M15d: panel container should have role="dialog" attribute', () => {
      control.show();
      const panel = document.querySelector('[data-testid="deinterlace-panel"]') as HTMLElement;
      expect(panel.getAttribute('role')).toBe('dialog');
    });

    it('DC-M15e: panel container should have aria-label attribute', () => {
      control.show();
      const panel = document.querySelector('[data-testid="deinterlace-panel"]') as HTMLElement;
      expect(panel.getAttribute('aria-label')).toBe('Deinterlace Settings');
    });
  });
});
