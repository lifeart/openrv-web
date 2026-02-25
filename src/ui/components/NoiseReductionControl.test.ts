/**
 * NoiseReductionControl Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoiseReductionControl } from './NoiseReductionControl';
import { DEFAULT_NOISE_REDUCTION_PARAMS } from '../../filters/NoiseReduction';

describe('NoiseReductionControl', () => {
  let control: NoiseReductionControl;
  let container: HTMLDivElement;

  beforeEach(() => {
    control = new NoiseReductionControl();
    container = document.createElement('div');
    container.appendChild(control.render());
    document.body.appendChild(container);
  });

  afterEach(() => {
    control.dispose();
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  });

  describe('initialization', () => {
    it('NRC-U001: should render container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('noise-reduction-control');
    });

    it('NRC-U002: should have strength slider with testid', () => {
      const slider = container.querySelector('[data-testid="noise-reduction-slider"]');
      expect(slider).not.toBeNull();
    });

    it('NRC-U003: should have radius slider with testid', () => {
      const slider = container.querySelector('[data-testid="noise-reduction-radius"]');
      expect(slider).not.toBeNull();
    });

    it('NRC-U004: should have reset button with testid', () => {
      const button = container.querySelector('[data-testid="noise-reduction-reset"]');
      expect(button).not.toBeNull();
    });

    it('NRC-U005: should initialize with default params', () => {
      const params = control.getParams();
      expect(params.strength).toBe(DEFAULT_NOISE_REDUCTION_PARAMS.strength);
      expect(params.radius).toBe(DEFAULT_NOISE_REDUCTION_PARAMS.radius);
    });

    it('NRC-U006: should have advanced toggle', () => {
      const toggle = container.querySelector('[data-testid="noise-reduction-advanced-toggle"]');
      expect(toggle).not.toBeNull();
    });

    it('NRC-U007: advanced section should be hidden by default', () => {
      const advanced = container.querySelector('[data-testid="noise-reduction-advanced"]') as HTMLElement;
      expect(advanced.style.display).toBe('none');
    });
  });

  describe('strength control', () => {
    it('NRC-U010: getStrength returns current strength', () => {
      expect(control.getStrength()).toBe(0);
    });

    it('NRC-U011: setStrength updates strength', () => {
      control.setStrength(50);
      expect(control.getStrength()).toBe(50);
    });

    it('NRC-U012: setStrength clamps to 0-100', () => {
      control.setStrength(-10);
      expect(control.getStrength()).toBe(0);

      control.setStrength(150);
      expect(control.getStrength()).toBe(100);
    });

    it('NRC-U013: setStrength emits paramsChanged event', () => {
      const callback = vi.fn();
      control.on('paramsChanged', callback);

      control.setStrength(50);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ strength: 50 }));
    });

    it('NRC-U014: strength slider input emits paramsChanged', () => {
      const callback = vi.fn();
      control.on('paramsChanged', callback);

      const slider = container.querySelector('[data-testid="noise-reduction-slider"]') as HTMLInputElement;
      slider.value = '75';
      slider.dispatchEvent(new Event('input'));

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ strength: 75 }));
    });
  });

  describe('radius control', () => {
    it('NRC-U020: radius slider has correct range', () => {
      const slider = container.querySelector('[data-testid="noise-reduction-radius"]') as HTMLInputElement;
      expect(slider.min).toBe('1');
      expect(slider.max).toBe('5');
    });

    it('NRC-U021: radius slider input updates params', () => {
      const slider = container.querySelector('[data-testid="noise-reduction-radius"]') as HTMLInputElement;
      slider.value = '4';
      slider.dispatchEvent(new Event('input'));

      expect(control.getParams().radius).toBe(4);
    });

    it('NRC-U022: radius slider input emits paramsChanged', () => {
      const callback = vi.fn();
      control.on('paramsChanged', callback);

      const slider = container.querySelector('[data-testid="noise-reduction-radius"]') as HTMLInputElement;
      slider.value = '3';
      slider.dispatchEvent(new Event('input'));

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ radius: 3 }));
    });
  });

  describe('advanced controls', () => {
    it('NRC-U030: clicking toggle shows advanced section', () => {
      const toggle = container.querySelector('[data-testid="noise-reduction-advanced-toggle"]') as HTMLElement;
      const advanced = container.querySelector('[data-testid="noise-reduction-advanced"]') as HTMLElement;

      toggle.click();
      expect(advanced.style.display).toBe('flex');
    });

    it('NRC-U031: clicking toggle again hides advanced section', () => {
      const toggle = container.querySelector('[data-testid="noise-reduction-advanced-toggle"]') as HTMLElement;
      const advanced = container.querySelector('[data-testid="noise-reduction-advanced"]') as HTMLElement;

      toggle.click();
      toggle.click();
      expect(advanced.style.display).toBe('none');
    });

    it('NRC-U032: luma slider exists in advanced section', () => {
      const toggle = container.querySelector('[data-testid="noise-reduction-advanced-toggle"]') as HTMLElement;
      toggle.click();

      const lumaSlider = container.querySelector('[data-testid="noise-reduction-luma"]');
      expect(lumaSlider).not.toBeNull();
    });

    it('NRC-U033: chroma slider exists in advanced section', () => {
      const toggle = container.querySelector('[data-testid="noise-reduction-advanced-toggle"]') as HTMLElement;
      toggle.click();

      const chromaSlider = container.querySelector('[data-testid="noise-reduction-chroma"]');
      expect(chromaSlider).not.toBeNull();
    });

    it('NRC-U034: luma slider input updates params', () => {
      const toggle = container.querySelector('[data-testid="noise-reduction-advanced-toggle"]') as HTMLElement;
      toggle.click();

      const lumaSlider = container.querySelector('[data-testid="noise-reduction-luma"]') as HTMLInputElement;
      lumaSlider.value = '60';
      lumaSlider.dispatchEvent(new Event('input'));

      expect(control.getParams().luminanceStrength).toBe(60);
    });

    it('NRC-U035: chroma slider input updates params', () => {
      const toggle = container.querySelector('[data-testid="noise-reduction-advanced-toggle"]') as HTMLElement;
      toggle.click();

      const chromaSlider = container.querySelector('[data-testid="noise-reduction-chroma"]') as HTMLInputElement;
      chromaSlider.value = '80';
      chromaSlider.dispatchEvent(new Event('input'));

      expect(control.getParams().chromaStrength).toBe(80);
    });
  });

  describe('setParams', () => {
    it('NRC-U040: setParams updates strength', () => {
      control.setParams({ strength: 40 });
      expect(control.getParams().strength).toBe(40);
    });

    it('NRC-U041: setParams updates radius', () => {
      control.setParams({ radius: 4 });
      expect(control.getParams().radius).toBe(4);
    });

    it('NRC-U042: setParams updates luminanceStrength', () => {
      control.setParams({ luminanceStrength: 60 });
      expect(control.getParams().luminanceStrength).toBe(60);
    });

    it('NRC-U043: setParams updates chromaStrength', () => {
      control.setParams({ chromaStrength: 80 });
      expect(control.getParams().chromaStrength).toBe(80);
    });

    it('NRC-U044: setParams updates multiple values', () => {
      control.setParams({
        strength: 50,
        radius: 3,
        luminanceStrength: 55,
        chromaStrength: 70,
      });

      const params = control.getParams();
      expect(params.strength).toBe(50);
      expect(params.radius).toBe(3);
      expect(params.luminanceStrength).toBe(55);
      expect(params.chromaStrength).toBe(70);
    });

    it('NRC-U045: setParams updates slider UI', () => {
      control.setParams({ strength: 75 });

      const slider = container.querySelector('[data-testid="noise-reduction-slider"]') as HTMLInputElement;
      expect(slider.value).toBe('75');
    });
  });

  describe('reset', () => {
    it('NRC-U050: reset restores default params', () => {
      control.setParams({
        strength: 80,
        radius: 5,
        luminanceStrength: 90,
        chromaStrength: 100,
      });

      control.reset();

      const params = control.getParams();
      expect(params.strength).toBe(DEFAULT_NOISE_REDUCTION_PARAMS.strength);
      expect(params.radius).toBe(DEFAULT_NOISE_REDUCTION_PARAMS.radius);
      expect(params.luminanceStrength).toBe(DEFAULT_NOISE_REDUCTION_PARAMS.luminanceStrength);
      expect(params.chromaStrength).toBe(DEFAULT_NOISE_REDUCTION_PARAMS.chromaStrength);
    });

    it('NRC-U051: reset emits reset event', () => {
      const callback = vi.fn();
      control.on('reset', callback);

      control.reset();
      expect(callback).toHaveBeenCalled();
    });

    it('NRC-U052: reset emits paramsChanged event', () => {
      control.setParams({ strength: 50 });
      const callback = vi.fn();
      control.on('paramsChanged', callback);

      control.reset();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        strength: DEFAULT_NOISE_REDUCTION_PARAMS.strength,
      }));
    });

    it('NRC-U053: reset button click triggers reset', () => {
      control.setParams({ strength: 80 });

      const resetButton = container.querySelector('[data-testid="noise-reduction-reset"]') as HTMLElement;
      resetButton.click();

      expect(control.getParams().strength).toBe(DEFAULT_NOISE_REDUCTION_PARAMS.strength);
    });
  });

  describe('getParams', () => {
    it('NRC-U060: getParams returns copy', () => {
      const params1 = control.getParams();
      const params2 = control.getParams();
      expect(params1).toEqual(params2);
      expect(params1).not.toBe(params2);
    });

    it('NRC-U061: modifying returned params does not affect control', () => {
      const params = control.getParams();
      params.strength = 99;

      expect(control.getParams().strength).not.toBe(99);
    });
  });

  describe('linked mode behavior', () => {
    it('NRC-U070: strength change auto-updates luma when advanced is closed', () => {
      // Advanced is closed by default
      const slider = container.querySelector('[data-testid="noise-reduction-slider"]') as HTMLInputElement;
      slider.value = '60';
      slider.dispatchEvent(new Event('input'));

      expect(control.getParams().luminanceStrength).toBe(60);
    });

    it('NRC-U071: strength change auto-updates chroma to 1.5x when advanced is closed', () => {
      const slider = container.querySelector('[data-testid="noise-reduction-slider"]') as HTMLInputElement;
      slider.value = '40';
      slider.dispatchEvent(new Event('input'));

      expect(control.getParams().chromaStrength).toBe(60); // 40 * 1.5
    });

    it('NRC-U072: chroma strength capped at 100 when linked', () => {
      const slider = container.querySelector('[data-testid="noise-reduction-slider"]') as HTMLInputElement;
      slider.value = '80';
      slider.dispatchEvent(new Event('input'));

      // 80 * 1.5 = 120, should be capped at 100
      expect(control.getParams().chromaStrength).toBeLessThanOrEqual(100);
    });
  });

  describe('dispose', () => {
    it('NRC-U080: dispose does not throw', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('NRC-U081: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('NRC-U082: dispose removes container from DOM', () => {
      const el = control.render();
      expect(document.body.contains(el)).toBe(true);

      control.dispose();

      expect(document.body.contains(el)).toBe(false);
    });

    it('NRC-U083: dispose removes EventEmitter listeners', () => {
      const callback = vi.fn();
      control.on('paramsChanged', callback);

      control.dispose();

      // Internally calling emitChange should not reach the callback
      control.setStrength(50);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
