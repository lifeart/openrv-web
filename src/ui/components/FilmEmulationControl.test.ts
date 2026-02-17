/**
 * FilmEmulationControl Unit Tests
 *
 * Tests the UI control component for film emulation settings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FilmEmulationControl } from './FilmEmulationControl';
import { DEFAULT_FILM_EMULATION_PARAMS, FILM_STOCKS } from '../../filters/FilmEmulation';

describe('FilmEmulationControl', () => {
  let control: FilmEmulationControl;

  beforeEach(() => {
    control = new FilmEmulationControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('FEC-001: creates control with default params', () => {
      expect(control.getParams()).toEqual(DEFAULT_FILM_EMULATION_PARAMS);
    });

    it('FEC-002: renders a container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('film-emulation-control-container');
    });

    it('FEC-003: container has a button with testid', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="film-emulation-control-button"]');
      expect(button).not.toBeNull();
    });
  });

  describe('getParams / setParams', () => {
    it('FEC-004: setParams updates internal state', () => {
      control.setParams({
        enabled: true,
        stock: 'fuji-velvia-50',
        intensity: 75,
        grainIntensity: 50,
        grainSeed: 42,
      });
      const params = control.getParams();
      expect(params.enabled).toBe(true);
      expect(params.stock).toBe('fuji-velvia-50');
      expect(params.intensity).toBe(75);
      expect(params.grainIntensity).toBe(50);
      expect(params.grainSeed).toBe(42);
    });

    it('FEC-019: getParams returns a copy, not the same reference', () => {
      const p1 = control.getParams();
      const p2 = control.getParams();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });

    it('FEC-020: modifying returned params does not affect internal state', () => {
      const p = control.getParams();
      p.stock = 'fuji-velvia-50';
      p.enabled = true;
      p.intensity = 0;
      expect(control.getParams().stock).toBe('kodak-portra-400');
      expect(control.getParams().enabled).toBe(false);
      expect(control.getParams().intensity).toBe(100);
    });

    it('FEC-021: setParams updates DOM elements when panel is open', () => {
      control.show();
      control.setParams({
        enabled: true,
        stock: 'fuji-velvia-50',
        intensity: 60,
        grainIntensity: 40,
        grainSeed: 0,
      });

      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]') as HTMLInputElement;
      const stockSelect = document.querySelector('[data-testid="film-emulation-film-stock-select"]') as HTMLSelectElement;
      const intensitySlider = document.querySelector('[data-testid="film-emulation-intensity-slider"]') as HTMLInputElement;
      const grainSlider = document.querySelector('[data-testid="film-emulation-grain-slider"]') as HTMLInputElement;

      expect(checkbox.checked).toBe(true);
      expect(stockSelect.value).toBe('fuji-velvia-50');
      expect(intensitySlider.value).toBe('60');
      expect(grainSlider.value).toBe('40');
    });

    it('FEC-022: setParams updates stock description', () => {
      control.show();
      control.setParams({
        ...DEFAULT_FILM_EMULATION_PARAMS,
        stock: 'fuji-velvia-50',
      });

      const desc = document.querySelector('[data-testid="film-emulation-stock-description"]');
      const expectedStock = FILM_STOCKS.find(s => s.id === 'fuji-velvia-50');
      expect(desc!.textContent).toBe(expectedStock?.description);
    });

    it('FEC-023: setParams updates slider value labels', () => {
      control.show();
      control.setParams({
        ...DEFAULT_FILM_EMULATION_PARAMS,
        intensity: 42,
        grainIntensity: 77,
      });

      const intensitySlider = document.querySelector('[data-testid="film-emulation-intensity-slider"]') as HTMLInputElement;
      const grainSlider = document.querySelector('[data-testid="film-emulation-grain-slider"]') as HTMLInputElement;

      // Value labels are siblings in the same labelRow
      const intensityLabel = intensitySlider.parentElement?.querySelector('div > span:last-child');
      const grainLabel = grainSlider.parentElement?.querySelector('div > span:last-child');

      expect(intensityLabel?.textContent).toBe('42');
      expect(grainLabel?.textContent).toBe('77');
    });
  });

  describe('reset', () => {
    it('FEC-005: reset restores defaults', () => {
      control.setParams({
        enabled: true,
        stock: 'fuji-velvia-50',
        intensity: 75,
        grainIntensity: 50,
        grainSeed: 42,
      });
      control.reset();
      expect(control.getParams()).toEqual(DEFAULT_FILM_EMULATION_PARAMS);
    });

    it('FEC-024: reset updates DOM elements when panel is open', () => {
      control.show();
      control.setParams({
        enabled: true,
        stock: 'fuji-velvia-50',
        intensity: 60,
        grainIntensity: 40,
        grainSeed: 0,
      });
      control.reset();

      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]') as HTMLInputElement;
      const stockSelect = document.querySelector('[data-testid="film-emulation-film-stock-select"]') as HTMLSelectElement;
      const intensitySlider = document.querySelector('[data-testid="film-emulation-intensity-slider"]') as HTMLInputElement;
      const grainSlider = document.querySelector('[data-testid="film-emulation-grain-slider"]') as HTMLInputElement;

      expect(checkbox.checked).toBe(false);
      expect(stockSelect.value).toBe('kodak-portra-400');
      expect(intensitySlider.value).toBe('100');
      expect(grainSlider.value).toBe('30');
    });

    it('FEC-025: reset updates stock description to default', () => {
      control.show();
      control.setParams({ ...DEFAULT_FILM_EMULATION_PARAMS, stock: 'fuji-velvia-50' });
      control.reset();

      const desc = document.querySelector('[data-testid="film-emulation-stock-description"]');
      const expectedStock = FILM_STOCKS.find(s => s.id === DEFAULT_FILM_EMULATION_PARAMS.stock);
      expect(desc!.textContent).toBe(expectedStock?.description);
    });
  });

  describe('events', () => {
    it('FEC-006: emits filmEmulationChanged on setParams', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);

      control.setParams({ ...DEFAULT_FILM_EMULATION_PARAMS, enabled: true });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('FEC-007: emits filmEmulationChanged on reset', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalledWith(DEFAULT_FILM_EMULATION_PARAMS);
    });

    it('FEC-026: emitted value is a copy of internal state', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);

      control.setParams({ ...DEFAULT_FILM_EMULATION_PARAMS, enabled: true, stock: 'fuji-velvia-50' });

      const emitted = handler.mock.calls[0][0];
      emitted.stock = 'kodak-tri-x-400';
      expect(control.getParams().stock).toBe('fuji-velvia-50');
    });

    it('FEC-027: off removes an event listener', () => {
      const handler = vi.fn();
      const off = control.on('filmEmulationChanged', handler);
      off();

      control.setParams({ ...DEFAULT_FILM_EMULATION_PARAMS, enabled: true });
      expect(handler).not.toHaveBeenCalled();
    });

    it('FEC-028: multiple listeners all receive events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      control.on('filmEmulationChanged', handler1);
      control.on('filmEmulationChanged', handler2);

      control.setParams({ ...DEFAULT_FILM_EMULATION_PARAMS, enabled: true });
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('toggle/show/hide', () => {
    it('FEC-008: isOpen is false by default', () => {
      expect(control.isOpen).toBe(false);
    });

    it('FEC-009: show/hide toggle panel state', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      control.hide();
      expect(control.isOpen).toBe(false);
    });

    it('FEC-010: toggle toggles panel open/close', () => {
      control.toggle();
      expect(control.isOpen).toBe(true);

      control.toggle();
      expect(control.isOpen).toBe(false);
    });

    it('FEC-029: show is idempotent', () => {
      control.show();
      control.show();
      expect(control.isOpen).toBe(true);
    });

    it('FEC-030: hide is idempotent', () => {
      control.hide();
      control.hide();
      expect(control.isOpen).toBe(false);
    });
  });

  describe('panel elements', () => {
    it('FEC-011: panel has testid', () => {
      control.show();
      const panel = document.querySelector('[data-testid="film-emulation-panel"]');
      expect(panel).not.toBeNull();
    });

    it('FEC-012: panel has film stock select', () => {
      control.show();
      const select = document.querySelector('[data-testid="film-emulation-film-stock-select"]');
      expect(select).not.toBeNull();
    });

    it('FEC-013: stock select has all film stocks', () => {
      control.show();
      const select = document.querySelector('[data-testid="film-emulation-film-stock-select"]') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.options.length).toBe(FILM_STOCKS.length);
    });

    it('FEC-014: panel has intensity and grain sliders', () => {
      control.show();
      const intensitySlider = document.querySelector('[data-testid="film-emulation-intensity-slider"]');
      const grainSlider = document.querySelector('[data-testid="film-emulation-grain-slider"]');
      expect(intensitySlider).not.toBeNull();
      expect(grainSlider).not.toBeNull();
    });

    it('FEC-015: panel has enabled checkbox', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]');
      expect(checkbox).not.toBeNull();
    });

    it('FEC-016: panel has stock description matching default stock', () => {
      control.show();
      const desc = document.querySelector('[data-testid="film-emulation-stock-description"]');
      expect(desc).not.toBeNull();
      const expectedStock = FILM_STOCKS.find(s => s.id === DEFAULT_FILM_EMULATION_PARAMS.stock);
      expect(desc!.textContent).toBe(expectedStock?.description);
    });

    it('FEC-017: panel has reset button', () => {
      control.show();
      const resetBtn = document.querySelector('[data-testid="film-emulation-reset-button"]');
      expect(resetBtn).not.toBeNull();
    });

    it('FEC-031: intensity slider has correct min/max/step', () => {
      control.show();
      const slider = document.querySelector('[data-testid="film-emulation-intensity-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('100');
      expect(slider.step).toBe('1');
    });

    it('FEC-032: grain slider has correct min/max/step', () => {
      control.show();
      const slider = document.querySelector('[data-testid="film-emulation-grain-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('100');
      expect(slider.step).toBe('1');
    });

    it('FEC-033: stock select options have correct values', () => {
      control.show();
      const select = document.querySelector('[data-testid="film-emulation-film-stock-select"]') as HTMLSelectElement;
      const values = Array.from(select.options).map(o => o.value);
      for (const stock of FILM_STOCKS) {
        expect(values).toContain(stock.id);
      }
    });
  });

  describe('UI interactions', () => {
    it('FEC-034: checking enabled checkbox updates params and emits event', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);
      control.show();

      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(control.getParams().enabled).toBe(true);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('FEC-035: changing stock select updates params and emits event', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);
      control.show();

      const select = document.querySelector('[data-testid="film-emulation-film-stock-select"]') as HTMLSelectElement;
      select.value = 'fuji-velvia-50';
      select.dispatchEvent(new Event('change'));

      expect(control.getParams().stock).toBe('fuji-velvia-50');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ stock: 'fuji-velvia-50' }));
    });

    it('FEC-036: changing stock select updates description text', () => {
      control.show();

      const select = document.querySelector('[data-testid="film-emulation-film-stock-select"]') as HTMLSelectElement;
      select.value = 'kodak-tri-x-400';
      select.dispatchEvent(new Event('change'));

      const desc = document.querySelector('[data-testid="film-emulation-stock-description"]');
      const expectedStock = FILM_STOCKS.find(s => s.id === 'kodak-tri-x-400');
      expect(desc!.textContent).toBe(expectedStock?.description);
    });

    it('FEC-037: moving intensity slider updates params and emits event', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);
      control.show();

      const slider = document.querySelector('[data-testid="film-emulation-intensity-slider"]') as HTMLInputElement;
      slider.value = '50';
      slider.dispatchEvent(new Event('input'));

      expect(control.getParams().intensity).toBe(50);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ intensity: 50 }));
    });

    it('FEC-038: moving grain slider updates params and emits event', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);
      control.show();

      const slider = document.querySelector('[data-testid="film-emulation-grain-slider"]') as HTMLInputElement;
      slider.value = '80';
      slider.dispatchEvent(new Event('input'));

      expect(control.getParams().grainIntensity).toBe(80);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ grainIntensity: 80 }));
    });

    it('FEC-039: double-clicking intensity slider resets to 100', () => {
      control.show();
      const slider = document.querySelector('[data-testid="film-emulation-intensity-slider"]') as HTMLInputElement;

      // First change to non-default
      slider.value = '50';
      slider.dispatchEvent(new Event('input'));
      expect(control.getParams().intensity).toBe(50);

      // Double-click to reset
      slider.dispatchEvent(new MouseEvent('dblclick'));
      expect(slider.value).toBe('100');
      expect(control.getParams().intensity).toBe(100);
    });

    it('FEC-040: double-clicking grain slider resets to 30', () => {
      control.show();
      const slider = document.querySelector('[data-testid="film-emulation-grain-slider"]') as HTMLInputElement;

      // First change to non-default
      slider.value = '80';
      slider.dispatchEvent(new Event('input'));
      expect(control.getParams().grainIntensity).toBe(80);

      // Double-click to reset
      slider.dispatchEvent(new MouseEvent('dblclick'));
      expect(slider.value).toBe('30');
      expect(control.getParams().grainIntensity).toBe(30);
    });

    it('FEC-041: clicking reset button restores defaults', () => {
      const handler = vi.fn();
      control.on('filmEmulationChanged', handler);
      control.show();

      // Set non-default values first
      control.setParams({
        enabled: true,
        stock: 'fuji-velvia-50',
        intensity: 60,
        grainIntensity: 40,
        grainSeed: 42,
      });
      handler.mockClear();

      const resetBtn = document.querySelector('[data-testid="film-emulation-reset-button"]') as HTMLButtonElement;
      resetBtn.click();

      expect(control.getParams()).toEqual(DEFAULT_FILM_EMULATION_PARAMS);
      expect(handler).toHaveBeenCalledWith(DEFAULT_FILM_EMULATION_PARAMS);
    });

    it('FEC-042: clicking toolbar button toggles the panel', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="film-emulation-control-button"]') as HTMLButtonElement;

      button.click();
      expect(control.isOpen).toBe(true);

      button.click();
      expect(control.isOpen).toBe(false);
    });

    it('FEC-043: clicking outside the panel closes it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      // Simulate click outside
      const outsideClick = new MouseEvent('click', { bubbles: true });
      document.body.dispatchEvent(outsideClick);

      expect(control.isOpen).toBe(false);
    });
  });

  describe('label/checkbox accessibility (M-19)', () => {
    it('FEC-M19a: checkbox has a unique id attribute', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]') as HTMLInputElement;
      expect(checkbox.id).toBe('film-emulation-enabled-checkbox');
    });

    it('FEC-M19b: label has htmlFor matching the checkbox id', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]') as HTMLInputElement;
      const label = checkbox.parentElement!.querySelector('label') as HTMLLabelElement;
      expect(label.htmlFor).toBe(checkbox.id);
    });

    it('FEC-M19c: clicking the label toggles the checkbox state', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]') as HTMLInputElement;
      const label = checkbox.parentElement!.querySelector('label') as HTMLLabelElement;

      expect(checkbox.checked).toBe(false);
      label.click();
      expect(checkbox.checked).toBe(true);
      label.click();
      expect(checkbox.checked).toBe(false);
    });
  });

  describe('Escape key handling (M-14)', () => {
    it('FEC-M14a: pressing Escape while the panel is open should close it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('FEC-M14b: pressing Escape while the panel is closed should have no effect', () => {
      expect(control.isOpen).toBe(false);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(control.isOpen).toBe(false);
    });

    it('FEC-M14c: the keydown listener should be removed when the panel closes', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.hide();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });

    it('FEC-M14d: the keydown listener should be removed on dispose', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.show();
      control.dispose();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('FEC-018: dispose removes panel from body', () => {
      control.show();
      expect(document.querySelector('[data-testid="film-emulation-panel"]')).not.toBeNull();

      control.dispose();
      expect(document.querySelector('[data-testid="film-emulation-panel"]')).toBeNull();
    });

    it('FEC-044: double dispose does not throw', () => {
      control.show();
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('FEC-045: document click after dispose does not throw', () => {
      control.show();
      control.dispose();

      expect(() => {
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }).not.toThrow();
    });

    it('FEC-046: dispose cleans up injected style element', () => {
      control.show();
      // Trigger slider creation which injects a <style> element
      expect(document.getElementById('film-emulation-slider-style')).not.toBeNull();

      control.dispose();
      expect(document.getElementById('film-emulation-slider-style')).toBeNull();
    });
  });

  describe('focus management (M-18)', () => {
    it('FEC-M18a: when the panel opens, focus should move to the first interactive element inside it', () => {
      control.show();
      const checkbox = document.querySelector('[data-testid="film-emulation-enabled-checkbox"]') as HTMLInputElement;
      expect(document.activeElement).toBe(checkbox);
    });

    it('FEC-M18b: when the panel closes, focus should return to the toggle button', () => {
      const el = control.render();
      document.body.appendChild(el);
      control.show();
      control.hide();
      const button = el.querySelector('[data-testid="film-emulation-control-button"]') as HTMLButtonElement;
      expect(document.activeElement).toBe(button);
      document.body.removeChild(el);
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('FEC-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="film-emulation-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('FEC-M15b: toggle button aria-expanded should be "false" when panel is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="film-emulation-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('FEC-M15c: toggle button aria-expanded should be "true" when panel is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="film-emulation-control-button"]') as HTMLButtonElement;
      control.show();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('FEC-M15d: panel container should have role="dialog" attribute', () => {
      control.show();
      const panel = document.querySelector('[data-testid="film-emulation-panel"]') as HTMLElement;
      expect(panel.getAttribute('role')).toBe('dialog');
    });

    it('FEC-M15e: panel container should have aria-label attribute', () => {
      control.show();
      const panel = document.querySelector('[data-testid="film-emulation-panel"]') as HTMLElement;
      expect(panel.getAttribute('aria-label')).toBe('Film Emulation Settings');
    });
  });
});
