
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HSLQualifierControl } from './HSLQualifierControl';
import { HSLQualifier } from './HSLQualifier';
import { getThemeManager } from '../../utils/ui/ThemeManager';

describe('HSLQualifierControl', () => {
  let control: HSLQualifierControl;
  let hslQualifier: HSLQualifier;

  beforeEach(() => {
    hslQualifier = new HSLQualifier();
    control = new HSLQualifierControl(hslQualifier);
  });

  afterEach(() => {
    control.dispose();
    hslQualifier.dispose();
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

  describe('theme changes', () => {
    it('HSL-U060: dropdown uses var(--bg-secondary) instead of hardcoded rgba', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      expect(dropdown).not.toBeNull();
      expect(dropdown.style.background).toBe('var(--bg-secondary)');
      expect(dropdown.style.background).not.toContain('rgba(30, 30, 30');
    });

    it('HSL-U061: themeChanged triggers button state update', () => {
      const el = control.render();
      const toggle = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLElement;

      // Tamper with button style to detect if updateButtonState re-applies it
      toggle.style.color = 'red';

      getThemeManager().emit('themeChanged', 'light');

      // updateButtonState() re-applies var(--text-muted) for disabled state
      expect(toggle.style.color).not.toBe('red');
    });

    it('HSL-U062: theme change after dispose does not update button', () => {
      const el = control.render();
      const toggle = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLElement;
      control.dispose();

      // Tamper with button style
      toggle.style.color = 'red';

      getThemeManager().emit('themeChanged', 'light');

      // Listener was removed — style stays tampered
      expect(toggle.style.color).toBe('red');
    });
  });
});
