/**
 * FilterControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FilterControl,
  DEFAULT_FILTER_SETTINGS,
} from './FilterControl';

describe('FilterControl', () => {
  let control: FilterControl;

  beforeEach(() => {
    control = new FilterControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('FLT-001: starts with default settings', () => {
      const settings = control.getSettings();
      expect(settings).toEqual(DEFAULT_FILTER_SETTINGS);
    });

    it('FLT-002: default blur is 0', () => {
      expect(control.getSettings().blur).toBe(0);
    });

    it('FLT-003: default sharpen is 0', () => {
      expect(control.getSettings().sharpen).toBe(0);
    });
  });

  describe('getSettings / setSettings', () => {
    it('FLT-004: returns copy of settings', () => {
      const settings1 = control.getSettings();
      const settings2 = control.getSettings();
      expect(settings1).not.toBe(settings2);
      expect(settings1).toEqual(settings2);
    });

    it('FLT-018: setSettings updates internal state and emits event', () => {
      const handler = vi.fn();
      control.on('filtersChanged', handler);

      const newSettings = { blur: 10, sharpen: 50 };
      control.setSettings(newSettings);

      expect(control.getSettings()).toEqual(newSettings);
      expect(handler).toHaveBeenCalledWith(newSettings);
    });
  });

  describe('reset', () => {
    it('FLT-005: reset returns all values to defaults', () => {
      // We can't easily set values without the UI, but reset should work
      control.reset();
      expect(control.getSettings()).toEqual(DEFAULT_FILTER_SETTINGS);
    });

    it('FLT-006: reset emits filtersChanged event', () => {
      const handler = vi.fn();
      control.on('filtersChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(DEFAULT_FILTER_SETTINGS);
    });
  });

  describe('toggle/show/hide', () => {
    it('FLT-007: toggle shows panel when hidden', () => {
      expect(control.isOpen).toBe(false);
      control.toggle(); // Show
      expect(control.isOpen).toBe(true);
    });

    it('FLT-008: toggle hides panel when visible', () => {
      control.show();
      expect(control.isOpen).toBe(true);
      control.toggle(); // Hide
      expect(control.isOpen).toBe(false);
    });

    it('FLT-009: show opens panel', () => {
      control.show();
      expect(control.isOpen).toBe(true);
    });

    it('FLT-010: hide closes panel', () => {
      control.show();
      control.hide();
      expect(control.isOpen).toBe(false);
    });

    it('FLT-011: show is idempotent', () => {
      control.show();
      control.show();
      expect(control.isOpen).toBe(true);
    });

    it('FLT-012: hide is idempotent', () => {
      control.hide();
      control.hide();
      expect(control.isOpen).toBe(false);
    });
  });

  describe('render', () => {
    it('FLT-013: render returns HTMLElement', () => {
      const element = control.render();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('FLT-014: render returns container element', () => {
      const element = control.render();
      expect(element.className).toBe('filter-control-container');
    });
  });

  describe('DEFAULT_FILTER_SETTINGS', () => {
    it('FLT-015: has correct default values', () => {
      expect(DEFAULT_FILTER_SETTINGS.blur).toBe(0);
      expect(DEFAULT_FILTER_SETTINGS.sharpen).toBe(0);
    });
  });

  describe('dispose', () => {
    it('FLT-016: dispose does not throw', () => {
      expect(() => control.dispose()).not.toThrow();
    });
  });

  describe('event handling', () => {
    it('FLT-017: filtersChanged event contains settings', () => {
      const handler = vi.fn();
      control.on('filtersChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          blur: expect.any(Number),
          sharpen: expect.any(Number),
        })
      );
    });
  });

  describe('Escape key handling (M-14)', () => {
    it('FLT-M14a: pressing Escape while the panel is open should close it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('FLT-M14b: pressing Escape while the panel is closed should have no effect', () => {
      expect(control.isOpen).toBe(false);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('FLT-M14c: the keydown listener should be removed when the panel closes', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.hide();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });

    it('FLT-M14d: the keydown listener should be removed on dispose', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.dispose();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });
  });

  describe('focus management (M-18)', () => {
    it('FLT-M18a: when the panel opens, focus should move to the first interactive element inside it', () => {
      control.show();
      const panel = document.querySelector('.filter-panel') as HTMLElement;
      const firstInput = panel.querySelector('input[type="range"]') as HTMLInputElement;
      expect(document.activeElement).toBe(firstInput);
    });

    it('FLT-M18b: when the panel closes, focus should return to the toggle button', () => {
      const el = control.render();
      document.body.appendChild(el);
      control.show();
      control.hide();
      const button = el.querySelector('[data-testid="filter-control-button"]') as HTMLButtonElement;
      expect(document.activeElement).toBe(button);
      document.body.removeChild(el);
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('FLT-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="filter-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('FLT-M15b: toggle button aria-expanded should be "false" when panel is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="filter-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('FLT-M15c: toggle button aria-expanded should be "true" when panel is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="filter-control-button"]') as HTMLButtonElement;
      control.show();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('FLT-M15d: panel container should have role="dialog" attribute', () => {
      control.show();
      const panel = document.querySelector('.filter-panel') as HTMLElement;
      expect(panel.getAttribute('role')).toBe('dialog');
    });

    it('FLT-M15e: panel container should have aria-label attribute', () => {
      control.show();
      const panel = document.querySelector('.filter-panel') as HTMLElement;
      expect(panel.getAttribute('aria-label')).toBe('Filter Settings');
    });
  });
});
