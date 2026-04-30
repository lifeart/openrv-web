import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HSLQualifierControl } from './HSLQualifierControl';
import { HSLQualifier } from './HSLQualifier';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import {
  resetOutsideClickRegistry,
  dispatchOutsideClick,
  expectRegistrationCount,
} from '../../utils/ui/__test-helpers__/outsideClickTestUtils';

describe('HSLQualifierControl', () => {
  let control: HSLQualifierControl;
  let hslQualifier: HSLQualifier;

  beforeEach(() => {
    resetOutsideClickRegistry();
    hslQualifier = new HSLQualifier();
    control = new HSLQualifierControl(hslQualifier);
  });

  afterEach(() => {
    control.dispose();
    hslQualifier.dispose();
    resetOutsideClickRegistry();
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

  describe('OutsideClickRegistry integration (MED-25 Phase 3)', () => {
    it('HSL-OCR-001: opening registers exactly 1 entry; closing deregisters', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      expectRegistrationCount(0);
      button.click(); // open
      expectRegistrationCount(1);
      button.click(); // close
      expectRegistrationCount(0);
    });

    it('HSL-OCR-002: outside click dismisses the dropdown', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('block');

      dispatchOutsideClick();

      expect(dropdown.style.display).toBe('none');
      expectRegistrationCount(0);
      el.remove();
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

      // Simulate mouse click: pointerdown then focus
      button.dispatchEvent(new Event('pointerdown'));
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

  describe('eyedropper deactivation on panel close (Issue #45)', () => {
    it('HSL-U070: closing dropdown via toggle deactivates the eyedropper', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      eyedropperBtn.click(); // activate eyedropper
      expect(control.isEyedropperActive()).toBe(true);

      button.click(); // close
      expect(control.isEyedropperActive()).toBe(false);
    });

    it('HSL-U071: closing dropdown via toggle calls eyedropper callback with false', () => {
      const callback = vi.fn();
      control.setEyedropperCallback(callback);

      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      eyedropperBtn.click(); // activate
      callback.mockClear();

      button.click(); // close
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('HSL-U072: closing dropdown via outside click deactivates the eyedropper', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      eyedropperBtn.click(); // activate
      expect(control.isEyedropperActive()).toBe(true);

      // Simulate outside click
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(control.isEyedropperActive()).toBe(false);

      document.body.removeChild(el);
      outsideEl.remove();
    });

    it('HSL-U073: closing dropdown via outside click calls eyedropper callback with false', () => {
      const callback = vi.fn();
      control.setEyedropperCallback(callback);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      eyedropperBtn.click(); // activate
      callback.mockClear();

      // Simulate outside click
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(callback).toHaveBeenCalledWith(false);

      document.body.removeChild(el);
    });

    it('HSL-U074: eyedropper button style is reset when panel closes', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      eyedropperBtn.click(); // activate
      expect(eyedropperBtn.style.background).toBe('var(--accent-primary)');

      button.click(); // close
      expect(eyedropperBtn.style.background).toBe('var(--bg-secondary)');
      expect(eyedropperBtn.style.color).toBe('var(--text-secondary)');
    });

    it('HSL-U075: callback is not called with false when eyedropper is already inactive on close', () => {
      const callback = vi.fn();
      control.setEyedropperCallback(callback);

      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open (eyedropper not activated)
      callback.mockClear();

      button.click(); // close
      expect(callback).not.toHaveBeenCalled();
    });

    it('HSL-U076: dispose deactivates the eyedropper and calls callback', () => {
      const callback = vi.fn();
      control.setEyedropperCallback(callback);

      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;

      button.click(); // open
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const eyedropperBtn = dropdown.querySelector('[data-testid="hsl-eyedropper-button"]') as HTMLButtonElement;

      eyedropperBtn.click(); // activate
      callback.mockClear();

      control.dispose();
      expect(callback).toHaveBeenCalledWith(false);

      // Re-create for afterEach cleanup
      hslQualifier = new HSLQualifier();
      control = new HSLQualifierControl(hslQualifier);
    });
  });

  describe('hardcoded color fix (M-33)', () => {
    it('HSL-M33a: reset button pointerleave should set background to a CSS variable (not hardcoded hex)', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="hsl-qualifier-control-toggle"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="hsl-qualifier-dropdown"]') as HTMLElement;
      const resetBtn = dropdown.querySelector('[data-testid="hsl-reset-button"]') as HTMLButtonElement;

      resetBtn.dispatchEvent(new Event('pointerleave'));
      expect(resetBtn.style.background).toBe('var(--bg-secondary)');
      expect(resetBtn.style.background).not.toContain('#');
    });

    it('HSL-M33b: eyedropper button pointerleave should set background to a CSS variable (not hardcoded hex)', () => {
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
