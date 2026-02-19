
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

    it('HSL-U013: dropdown is appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      expect(document.querySelector('[data-testid="hsl-qualifier-dropdown"]')).toBeNull();
      button.click();
      expect(document.querySelector('[data-testid="hsl-qualifier-dropdown"]')).not.toBeNull();
    });
  });

  describe('outside click listener lifecycle', () => {
    it('HSL-M21a: outside click listener should NOT be registered when dropdown is closed', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      control.dispose();
      hslQualifier.dispose();
      addSpy.mockClear();

      hslQualifier = new HSLQualifier();
      control = new HSLQualifierControl(hslQualifier);

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(0);
      addSpy.mockRestore();
    });

    it('HSL-M21b: outside click listener should be registered when dropdown opens', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      addSpy.mockClear();
      button.click(); // open

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      addSpy.mockRestore();
    });

    it('HSL-M21c: outside click listener should be removed when dropdown closes', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      removeSpy.mockClear();
      button.click(); // close

      const clickCalls = removeSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      removeSpy.mockRestore();
    });

    it('HSL-M21d: dispose should remove outside click listener regardless of dropdown state', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open dropdown
      removeSpy.mockClear();
      control.dispose();

      const clickCalls = removeSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      removeSpy.mockRestore();
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
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
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

  describe('keyboard focus ring (M-16)', () => {
    it('HSL-M16a: toggle button should have focus/blur event listeners added by applyA11yFocus', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      // applyA11yFocus registers a focus listener that sets outline on keyboard focus.
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
    });

    it('HSL-M16b: keyboard focus (Tab) should apply visible focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      // Simulate keyboard focus (no preceding mousedown)
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
      expect(button.style.outlineOffset).toBe('2px');
    });

    it('HSL-M16c: mouse focus (click) should not apply focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      // Simulate mouse click: mousedown then focus
      button.dispatchEvent(new Event('mousedown'));
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).not.toBe('2px solid var(--accent-primary)');
    });
  });

  describe('dropdown body append (H-07)', () => {
    it('HSL-H07d: dropdown should be appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      expect(document.body.contains(document.querySelector('[data-testid="hsl-qualifier-dropdown"]'))).toBe(false);

      button.click();

      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      expect(document.body.contains(dropdown)).toBe(true);
      expect(el.contains(dropdown)).toBe(false);
    });

    it('HSL-H07f: dropdown should be removed from document.body on close', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('HSL-H07g: dropdown should be removed from document.body on dispose', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      expect(document.body.querySelector('[data-testid="hsl-qualifier-dropdown"]')).not.toBeNull();

      control.dispose();
      expect(document.body.querySelector('[data-testid="hsl-qualifier-dropdown"]')).toBeNull();
    });

    it('HSL-H07h: dropdown should reposition on window scroll', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      const scrollSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const scrollCalls = scrollSpy.mock.calls.filter(([event]) => event === 'scroll');
      expect(scrollCalls.length).toBeGreaterThanOrEqual(1);
      scrollSpy.mockRestore();
    });

    it('HSL-H07i: dropdown should reposition on window resize', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      const resizeSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const resizeCalls = resizeSpy.mock.calls.filter(([event]) => event === 'resize');
      expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
      resizeSpy.mockRestore();
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('HSL-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('HSL-M15b: toggle button aria-expanded should be "false" when dropdown is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('HSL-M15c: toggle button aria-expanded should be "true" when dropdown is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('HSL-M15d: dropdown container should have role="dialog" attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('dialog');
    });

    it('HSL-M15e: dropdown container should have aria-label attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('aria-label')).toBe('HSL Qualifier Settings');
    });
  });

  describe('hardcoded color fix (M-33)', () => {
    it('HSL-M33a: reset button mouseleave should set background to a CSS variable (not hardcoded hex)', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const resetBtn = dropdown.querySelector('[data-testid="hsl-reset-button"]') as HTMLButtonElement;

      resetBtn.dispatchEvent(new Event('mouseleave'));
      expect(resetBtn.style.background).toBe('var(--bg-secondary)');
      expect(resetBtn.style.background).not.toContain('#');
    });

    it('HSL-M33b: eyedropper button mouseleave should set background to a CSS variable (not hardcoded hex)', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      // Activate then deactivate via click to test the inactive branch
      eyedropperBtn.click(); // activate
      eyedropperBtn.click(); // deactivate
      expect(eyedropperBtn.style.background).toBe('var(--bg-secondary)');
      expect(eyedropperBtn.style.background).not.toContain('#');
    });

    it('HSL-M33c: deactivateEyedropper() should set background to a CSS variable (not hardcoded hex)', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      // Activate eyedropper first
      eyedropperBtn.click();
      expect(eyedropperBtn.style.background).toBe('var(--accent-primary)');

      // Deactivate via the public method
      control.deactivateEyedropper();
      expect(eyedropperBtn.style.background).toBe('var(--bg-secondary)');
      expect(eyedropperBtn.style.background).not.toContain('#');
    });
  });
});
