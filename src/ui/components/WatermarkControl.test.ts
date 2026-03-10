/**
 * WatermarkControl Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WatermarkControl } from './WatermarkControl';
import { WatermarkOverlay, DEFAULT_WATERMARK_STATE } from './WatermarkOverlay';

describe('WatermarkControl', () => {
  let control: WatermarkControl;
  let container: HTMLDivElement;

  beforeEach(() => {
    control = new WatermarkControl();
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
    it('WMC-U001: should render container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('watermark-control');
    });

    it('WMC-U002: should have load button', () => {
      const button = container.querySelector('[data-testid="watermark-load-button"]');
      expect(button).not.toBeNull();
    });

    it('WMC-U003: should have remove button', () => {
      const button = container.querySelector('[data-testid="watermark-remove-button"]');
      expect(button).not.toBeNull();
    });

    it('WMC-U004: should have hidden file input', () => {
      const input = container.querySelector('[data-testid="watermark-file-input"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.type).toBe('file');
    });

    it('WMC-U005: file input accepts image types', () => {
      const input = container.querySelector('[data-testid="watermark-file-input"]') as HTMLInputElement;
      expect(input.accept).toContain('image/png');
      expect(input.accept).toContain('image/jpeg');
    });

    it('WMC-U006: should accept custom overlay in constructor', () => {
      const overlay = new WatermarkOverlay({ position: 'top-left' });
      const customControl = new WatermarkControl(overlay);

      expect(customControl.getState().position).toBe('top-left');
      customControl.dispose();
    });
  });

  describe('position grid', () => {
    it('WMC-U010: should have preset buttons plus custom mode button', () => {
      const buttons = container.querySelectorAll('[data-position]');
      expect(buttons.length).toBe(10);
    });

    it('WMC-U011: each position mode has a button', () => {
      const positions = [
        'top-left',
        'top-center',
        'top-right',
        'center-left',
        'center',
        'center-right',
        'bottom-left',
        'bottom-center',
        'bottom-right',
        'custom',
      ];

      for (const pos of positions) {
        const button = container.querySelector(`[data-testid="watermark-position-${pos}"]`);
        expect(button).not.toBeNull();
      }
    });

    it('WMC-U012: clicking position button changes position', () => {
      const button = container.querySelector('[data-testid="watermark-position-top-left"]') as HTMLElement;
      button.click();

      expect(control.getState().position).toBe('top-left');
    });

    it('WMC-U013: clicking custom mode button changes position to custom', () => {
      const button = container.querySelector('[data-testid="watermark-position-custom"]') as HTMLElement;
      button.click();

      expect(control.getState().position).toBe('custom');
    });
  });

  describe('custom position inputs', () => {
    it('WMC-U014: should have custom position coordinate inputs', () => {
      const xInput = container.querySelector('[data-testid="watermark-custom-x-input"]');
      const yInput = container.querySelector('[data-testid="watermark-custom-y-input"]');

      expect(xInput).not.toBeNull();
      expect(yInput).not.toBeNull();
    });

    it('WMC-U015: custom coordinate inputs are shown when custom mode is active', () => {
      control.setState({ position: 'custom' });

      const customContainer = container.querySelector(
        '[data-testid="watermark-custom-position-container"]',
      ) as HTMLElement;

      expect(customContainer.style.display).toBe('grid');
    });

    it('WMC-U016: custom X input updates custom position', () => {
      const xInput = container.querySelector('[data-testid="watermark-custom-x-input"]') as HTMLInputElement;
      xInput.value = '25';
      xInput.dispatchEvent(new Event('input'));

      const state = control.getState();
      expect(state.position).toBe('custom');
      expect(state.customX).toBe(0.25);
      expect(state.customY).toBe(DEFAULT_WATERMARK_STATE.customY);
    });

    it('WMC-U017: custom Y input updates custom position', () => {
      const yInput = container.querySelector('[data-testid="watermark-custom-y-input"]') as HTMLInputElement;
      yInput.value = '60';
      yInput.dispatchEvent(new Event('input'));

      const state = control.getState();
      expect(state.position).toBe('custom');
      expect(state.customX).toBe(DEFAULT_WATERMARK_STATE.customX);
      expect(state.customY).toBe(0.6);
    });

    it('WMC-U018: custom coordinate inputs reflect overlay state', () => {
      control.setState({
        position: 'custom',
        customX: 0.33,
        customY: 0.66,
      });

      const xInput = container.querySelector('[data-testid="watermark-custom-x-input"]') as HTMLInputElement;
      const yInput = container.querySelector('[data-testid="watermark-custom-y-input"]') as HTMLInputElement;

      expect(xInput.value).toBe('33');
      expect(yInput.value).toBe('66');
    });

    it('WMC-U019: custom coordinate inputs clamp out-of-range values', () => {
      const xInput = container.querySelector('[data-testid="watermark-custom-x-input"]') as HTMLInputElement;
      xInput.value = '150';
      xInput.dispatchEvent(new Event('input'));

      expect(xInput.value).toBe('100');
      expect(control.getState().customX).toBe(1);
    });
  });

  describe('scale slider', () => {
    it('WMC-U020: should have scale slider', () => {
      const slider = container.querySelector('[data-testid="watermark-scale-slider"]');
      expect(slider).not.toBeNull();
    });

    it('WMC-U021: scale slider has correct range', () => {
      const slider = container.querySelector('[data-testid="watermark-scale-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('10');
      expect(slider.max).toBe('200');
    });

    it('WMC-U022: scale slider updates state', () => {
      const slider = container.querySelector('[data-testid="watermark-scale-slider"]') as HTMLInputElement;
      slider.value = '150';
      slider.dispatchEvent(new Event('input'));

      expect(control.getState().scale).toBe(1.5);
    });
  });

  describe('opacity slider', () => {
    it('WMC-U030: should have opacity slider', () => {
      const slider = container.querySelector('[data-testid="watermark-opacity-slider"]');
      expect(slider).not.toBeNull();
    });

    it('WMC-U031: opacity slider has correct range', () => {
      const slider = container.querySelector('[data-testid="watermark-opacity-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('100');
    });

    it('WMC-U032: opacity slider updates state', () => {
      const slider = container.querySelector('[data-testid="watermark-opacity-slider"]') as HTMLInputElement;
      slider.value = '50';
      slider.dispatchEvent(new Event('input'));

      expect(control.getState().opacity).toBe(0.5);
    });
  });

  describe('margin slider', () => {
    it('WMC-U040: should have margin slider', () => {
      const slider = container.querySelector('[data-testid="watermark-margin-slider"]');
      expect(slider).not.toBeNull();
    });

    it('WMC-U041: margin slider has correct range', () => {
      const slider = container.querySelector('[data-testid="watermark-margin-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('100');
    });

    it('WMC-U042: margin slider updates state', () => {
      const slider = container.querySelector('[data-testid="watermark-margin-slider"]') as HTMLInputElement;
      slider.value = '40';
      slider.dispatchEvent(new Event('input'));

      expect(control.getState().margin).toBe(40);
    });
  });

  describe('state management', () => {
    it('WMC-U050: getState returns overlay state', () => {
      const state = control.getState();
      expect(state).toEqual(DEFAULT_WATERMARK_STATE);
    });

    it('WMC-U051: setState updates overlay state', () => {
      control.setState({ position: 'center', opacity: 0.5 });

      const state = control.getState();
      expect(state.position).toBe('center');
      expect(state.opacity).toBe(0.5);
    });

    it('WMC-U052: getOverlay returns the overlay instance', () => {
      const overlay = control.getOverlay();
      expect(overlay).toBeInstanceOf(WatermarkOverlay);
    });
  });

  describe('events', () => {
    it('WMC-U060: emits stateChanged when position changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      const button = container.querySelector('[data-testid="watermark-position-center"]') as HTMLElement;
      button.click();

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ position: 'center' }));
    });

    it('WMC-U061: emits stateChanged when scale changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      const slider = container.querySelector('[data-testid="watermark-scale-slider"]') as HTMLInputElement;
      slider.value = '120';
      slider.dispatchEvent(new Event('input'));

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ scale: 1.2 }));
    });

    it('WMC-U062: emits stateChanged when opacity changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      const slider = container.querySelector('[data-testid="watermark-opacity-slider"]') as HTMLInputElement;
      slider.value = '80';
      slider.dispatchEvent(new Event('input'));

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.8 }));
    });

    it('WMC-U063: emits stateChanged when custom coordinates change', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      const xInput = container.querySelector('[data-testid="watermark-custom-x-input"]') as HTMLInputElement;
      xInput.value = '40';
      xInput.dispatchEvent(new Event('input'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 'custom',
          customX: 0.4,
          customY: DEFAULT_WATERMARK_STATE.customY,
        }),
      );
    });
  });

  describe('preview', () => {
    it('WMC-U070: preview container exists', () => {
      const preview = container.querySelector('[data-testid="watermark-preview"]');
      expect(preview).not.toBeNull();
    });

    it('WMC-U071: preview is hidden when no image', () => {
      const preview = container.querySelector('[data-testid="watermark-preview"]') as HTMLElement;
      expect(preview.style.display).toBe('none');
    });
  });

  describe('dispose', () => {
    it('WMC-U080: dispose does not throw', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('WMC-U081: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
