
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HSLQualifierControl } from './HSLQualifierControl';
import { HSLQualifier } from './HSLQualifier';
import { FalseColor } from './FalseColor';

describe('HSLQualifierControl', () => {
  let control: HSLQualifierControl;
  let hslQualifier: HSLQualifier;
  let falseColor: FalseColor;

  beforeEach(() => {
    falseColor = new FalseColor();
    hslQualifier = new HSLQualifier(falseColor);
    control = new HSLQualifierControl(hslQualifier);
  });

  afterEach(() => {
    control.dispose();
    hslQualifier.dispose();
    falseColor.dispose();
  });

  describe('initialization', () => {
    it('HSL-U001: creates HSLQualifierControl instance', () => {
      expect(control).toBeInstanceOf(HSLQualifierControl);
    });

    it('HSL-U002: getHSLQualifier returns the hsl qualifier instance', () => {
      expect(control.getHSLQualifier()).toBe(hslQualifier);
    });
  });

  describe('render', () => {
    it('HSL-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('HSL-U011: container has hsl-qualifier-control class', () => {
      const el = control.render();
      expect(el.className).toBe('hsl-qualifier-control');
    });

    it('HSL-U012: container has toggle button', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]');
      expect(button).not.toBeNull();
    });

    it('HSL-U013: container has dropdown element', () => {
        const el = control.render();
        const dropdown = el.querySelector('[data-testid="hsl-qualifier-dropdown"]');
        expect(dropdown).not.toBeNull();
    });
  });

  describe('dispose', () => {
    it('HSL-U050: dispose unsubscribes from state changes', () => {
      const unsubSpy = vi.fn();
      vi.spyOn(hslQualifier, 'on').mockReturnValue(unsubSpy);

      // Re-create to capture subscription
      control.dispose();
      control = new HSLQualifierControl(hslQualifier);

      expect(hslQualifier.on).toHaveBeenCalledWith('stateChanged', expect.any(Function));

      control.dispose();

      expect(unsubSpy).toHaveBeenCalled();
    });
  });
});
