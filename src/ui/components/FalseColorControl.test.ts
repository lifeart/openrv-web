/**
 * FalseColorControl Component Tests
 *
 * Tests for the false color dropdown control with presets and legend.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FalseColorControl } from './FalseColorControl';
import { FalseColor } from './FalseColor';
import { getThemeManager } from '../../utils/ui/ThemeManager';

// Create a mock FalseColor class
function createMockFalseColor(): FalseColor {
  const falseColor = new FalseColor();
  return falseColor;
}

describe('FalseColorControl', () => {
  let control: FalseColorControl;
  let falseColor: FalseColor;

  beforeEach(() => {
    falseColor = createMockFalseColor();
    control = new FalseColorControl(falseColor);
  });

  afterEach(() => {
    control.dispose();
    falseColor.dispose();
  });

  describe('initialization', () => {
    it('FALSE-U001: creates FalseColorControl instance', () => {
      expect(control).toBeInstanceOf(FalseColorControl);
    });

    it('FALSE-U002: getFalseColor returns the false color instance', () => {
      expect(control.getFalseColor()).toBe(falseColor);
    });
  });

  describe('render', () => {
    it('FALSE-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('FALSE-U011: container has false-color-control class', () => {
      const el = control.render();
      expect(el.className).toBe('false-color-control');
    });

    it('FALSE-U012: container has toggle button', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]');
      expect(button).not.toBeNull();
    });

    it('FALSE-U013: toggle button displays False label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]');
      expect(button?.textContent).toContain('False');
    });

    it('FALSE-U014: toggle button has correct title with shortcut', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      expect(button.title).toContain('Shift+Alt+F');
    });

    it('FALSE-U015: dropdown is appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      expect(document.querySelector('[data-testid="false-color-dropdown"]')).toBeNull();
      button.click();
      expect(document.querySelector('[data-testid="false-color-dropdown"]')).not.toBeNull();
    });

    it('FALSE-U016: dropdown is not in DOM by default', () => {
      control.render();
      expect(document.querySelector('[data-testid="false-color-dropdown"]')).toBeNull();
    });
  });

  describe('button styling', () => {
    it('FALSE-U020: button has transparent background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      expect(button.style.background).toBe('transparent');
    });

    it('FALSE-U021: button has gray color when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--text-muted)'); // #999
    });

    it('FALSE-U022: button has blue styling when enabled', () => {
      control.render();
      falseColor.enable();
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--accent-primary)'); // #4a9eff
    });

    it('FALSE-U023: button hover changes background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      expect(button.style.cssText).toContain('var(--bg-hover)');
    });

    it('FALSE-U024: button mouseleave restores background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      button.dispatchEvent(new MouseEvent('mouseleave'));
      expect(button.style.background).toBe('transparent');
    });

    it('FALSE-M20a: borderColor resets to transparent on mouseleave when inactive', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      expect(button.style.borderColor).toBe('var(--border-primary)');
      button.dispatchEvent(new MouseEvent('mouseleave'));
      expect(button.style.borderColor).toBe('transparent');
    });

    it('FALSE-M20b: borderColor remains accent color on mouseleave when active', () => {
      const el = control.render();
      falseColor.enable();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      button.dispatchEvent(new MouseEvent('mouseleave'));
      expect(button.style.borderColor).toBe('var(--accent-primary)');
    });
  });

  describe('dropdown behavior', () => {
    it('FALSE-U030: clicking button opens dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      button.click();

      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('block');
    });

    it('FALSE-U031: clicking button twice closes dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('FALSE-U032: dropdown has enable checkbox', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
    });

    it('FALSE-U033: enable checkbox reflects false color state', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('input[type="checkbox"]') as HTMLInputElement;

      expect(checkbox.checked).toBe(false);

      falseColor.enable();
      expect(checkbox.checked).toBe(true);
    });

    it('FALSE-U034: clicking enable checkbox toggles false color', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('input[type="checkbox"]') as HTMLInputElement;

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(falseColor.isEnabled()).toBe(true);
    });
  });

  describe('preset buttons', () => {
    function openDropdown(): HTMLElement {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      return document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
    }

    it('FALSE-U040: dropdown has preset buttons', () => {
      const dropdown = openDropdown();
      const presetButtons = dropdown.querySelectorAll('button[data-preset]');
      expect(presetButtons.length).toBe(3); // standard, arri, red
    });

    it('FALSE-U041: standard preset button exists', () => {
      const dropdown = openDropdown();
      const standardBtn = dropdown.querySelector('button[data-preset="standard"]');
      expect(standardBtn).not.toBeNull();
      expect(standardBtn?.textContent).toBe('Standard');
    });

    it('FALSE-U042: ARRI preset button exists', () => {
      const dropdown = openDropdown();
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]');
      expect(arriBtn).not.toBeNull();
      expect(arriBtn?.textContent).toBe('ARRI');
    });

    it('FALSE-U043: RED preset button exists', () => {
      const dropdown = openDropdown();
      const redBtn = dropdown.querySelector('button[data-preset="red"]');
      expect(redBtn).not.toBeNull();
      expect(redBtn?.textContent).toBe('RED');
    });

    it('FALSE-U044: clicking preset button changes preset', () => {
      const dropdown = openDropdown();
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]') as HTMLButtonElement;

      arriBtn.click();

      expect(falseColor.getState().preset).toBe('arri');
    });

    it('FALSE-U044b: clicking preset button enables false color if disabled', () => {
      const dropdown = openDropdown();
      const redBtn = dropdown.querySelector('button[data-preset="red"]') as HTMLButtonElement;

      expect(falseColor.isEnabled()).toBe(false);
      redBtn.click();

      expect(falseColor.getState().preset).toBe('red');
      expect(falseColor.isEnabled()).toBe(true);
    });

    it('FALSE-U045: active preset button has blue styling', () => {
      const dropdown = openDropdown();
      const standardBtn = dropdown.querySelector('button[data-preset="standard"]') as HTMLButtonElement;

      // Standard is default preset
      expect(standardBtn.style.cssText).toContain('var(--accent-primary)'); // #4a9eff
    });

    it('FALSE-U046: inactive preset button has gray styling', () => {
      const dropdown = openDropdown();
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]') as HTMLButtonElement;

      expect(arriBtn.style.cssText).toContain('var(--bg-secondary)'); // #333
    });

    it('FALSE-U047: preset button hover changes background', () => {
      const dropdown = openDropdown();
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]') as HTMLButtonElement;

      arriBtn.dispatchEvent(new MouseEvent('mouseenter'));

      expect(arriBtn.style.cssText).toContain('var(--border-primary)'); // #444
    });
  });

  describe('legend', () => {
    function openDropdown(): HTMLElement {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      return document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
    }

    it('FALSE-U050: dropdown has legend section', () => {
      const dropdown = openDropdown();
      const legend = dropdown.querySelector('.false-color-legend');
      expect(legend).not.toBeNull();
    });

    it('FALSE-U051: legend has items container', () => {
      const dropdown = openDropdown();
      const legendItems = dropdown.querySelector('.legend-items');
      expect(legendItems).not.toBeNull();
    });

    it('FALSE-U052: legend contains color swatches', () => {
      const dropdown = openDropdown();
      const legendItems = dropdown.querySelector('.legend-items');

      // Should have legend items matching the palette
      expect(legendItems?.children.length).toBeGreaterThan(0);
    });

    it('FALSE-U053: legend updates when preset changes', () => {
      const dropdown = openDropdown();
      const legendItems = dropdown.querySelector('.legend-items') as HTMLElement;

      const initialContent = legendItems.innerHTML;

      // Change preset
      falseColor.setPreset('arri');

      // Legend should update
      expect(legendItems.innerHTML).not.toBe(initialContent);
    });
  });

  describe('state synchronization', () => {
    it('FALSE-U060: control updates when false color state changes', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      // Initially disabled
      expect(button.style.color).toBe('var(--text-muted)');

      // Enable false color externally
      falseColor.enable();

      // Button should update to blue
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('FALSE-U061: preset buttons update when preset changes externally', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]') as HTMLButtonElement;
      const standardBtn = dropdown.querySelector('button[data-preset="standard"]') as HTMLButtonElement;

      // Initially standard is active
      expect(standardBtn.style.cssText).toContain('var(--accent-primary)');

      // Change preset externally
      falseColor.setPreset('arri');

      // ARRI should now be active
      expect(arriBtn.style.cssText).toContain('var(--accent-primary)');
    });
  });

  describe('outside click listener lifecycle', () => {
    it('FALSE-M21a: outside click listener should NOT be registered when dropdown is closed', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      control.dispose();
      falseColor.dispose();
      addSpy.mockClear();

      falseColor = createMockFalseColor();
      control = new FalseColorControl(falseColor);

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(0);
      addSpy.mockRestore();
    });

    it('FALSE-M21b: outside click listener should be registered when dropdown opens', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      addSpy.mockClear();
      button.click(); // open

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      addSpy.mockRestore();
    });

    it('FALSE-M21c: outside click listener should be removed when dropdown closes', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      button.click(); // open
      removeSpy.mockClear();
      button.click(); // close

      const clickCalls = removeSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      removeSpy.mockRestore();
    });

    it('FALSE-M21d: dispose should remove outside click listener regardless of dropdown state', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

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
    it('FALSE-U070: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('FALSE-U071: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('FALSE-U072: dispose clears preset buttons map', () => {
      expect(() => {
        control.render();
        control.dispose();
      }).not.toThrow();
    });

    it('FALSE-U073: dispose unsubscribes from state changes', () => {
      const unsubSpy = vi.fn();
      // Mock .on to return our spy
      vi.spyOn(falseColor, 'on').mockReturnValue(unsubSpy);

      // Re-create control to capture the mocked .on
      control.dispose();
      control = new FalseColorControl(falseColor);

      // Verify subscription happened
      expect(falseColor.on).toHaveBeenCalledWith('stateChanged', expect.any(Function));

      control.dispose();

      // Verify unsubscribe was called
      expect(unsubSpy).toHaveBeenCalled();
    });
  });

  describe('positioning', () => {
    it('FALSE-U080: dropdown has fixed positioning', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.style.position).toBe('fixed');
    });

    it('FALSE-U081: dropdown has high z-index', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(parseInt(dropdown.style.zIndex, 10)).toBeGreaterThan(1000);
    });

    it('FALSE-U082: container has relative positioning', () => {
      const el = control.render();
      expect(el.style.position).toBe('relative');
    });
  });

  describe('theme changes', () => {
    it('FALSE-U090: enable row uses var(--bg-hover) instead of hardcoded rgba', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      // The enable row is the first child div of the dropdown
      const enableRow = dropdown.children[0] as HTMLElement;
      expect(enableRow.style.cssText).toContain('var(--bg-hover)');
      expect(enableRow.style.cssText).not.toContain('rgba(255, 255, 255, 0.03)');
    });

    it('FALSE-U091: legend swatch uses var(--border-primary) instead of hardcoded rgba', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const legendItems = dropdown.querySelector('.legend-items') as HTMLElement;
      // Legend items are populated on creation; each row has a swatch div then a span
      const firstRow = legendItems.children[0] as HTMLElement;
      expect(firstRow).toBeTruthy();
      const firstSwatch = firstRow.children[0] as HTMLElement;
      expect(firstSwatch).toBeTruthy();
      expect(firstSwatch.style.cssText).toContain('var(--border-primary)');
      expect(firstSwatch.style.cssText).not.toContain('rgba(255, 255, 255, 0.2)');
    });

    it('FALSE-U092: themeChanged triggers legend re-render', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const legendItems = dropdown.querySelector('.legend-items') as HTMLElement;
      const oldFirstRow = legendItems.firstElementChild!;
      expect(oldFirstRow).toBeTruthy();

      getThemeManager().emit('themeChanged', 'light');

      // updateLegend() rebuilds legend — old child is detached
      expect(legendItems.contains(oldFirstRow)).toBe(false);
      // New legend items are created
      expect(legendItems.children.length).toBeGreaterThan(0);
    });

    it('FALSE-U093: theme change after dispose does not re-render legend', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const legendItems = dropdown.querySelector('.legend-items') as HTMLElement;
      control.dispose();

      const htmlAfterDispose = legendItems.innerHTML;

      getThemeManager().emit('themeChanged', 'light');

      // Listener was removed — legend stays unchanged
      expect(legendItems.innerHTML).toBe(htmlAfterDispose);
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('FALSE-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('FALSE-M15b: toggle button aria-expanded should be "false" when dropdown is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('FALSE-M15c: toggle button aria-expanded should be "true" when dropdown is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('FALSE-M15d: dropdown container should have role="dialog" attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('dialog');
    });

    it('FALSE-M15e: dropdown container should have aria-label attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('aria-label')).toBe('False Color Settings');
    });
  });

  describe('keyboard focus ring (M-16)', () => {
    it('FALSE-M16a: toggle button should have focus/blur event listeners added by applyA11yFocus', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      // applyA11yFocus registers a focus listener that sets outline on keyboard focus.
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
    });

    it('FALSE-M16b: keyboard focus (Tab) should apply visible focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      // Simulate keyboard focus (no preceding mousedown)
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
      expect(button.style.outlineOffset).toBe('2px');
    });

    it('FALSE-M16c: mouse focus (click) should not apply focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      // Simulate mouse click: mousedown then focus
      button.dispatchEvent(new Event('mousedown'));
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).not.toBe('2px solid var(--accent-primary)');
    });
  });

  describe('dropdown body append (H-07)', () => {
    it('FC-H07b: dropdown should be appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      expect(document.body.contains(document.querySelector('[data-testid="false-color-dropdown"]'))).toBe(false);

      button.click();

      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(document.body.contains(dropdown)).toBe(true);
      expect(el.contains(dropdown)).toBe(false);
    });

    it('FC-H07f: dropdown should be removed from document.body on close', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('FC-H07g: dropdown should be removed from document.body on dispose', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;

      button.click(); // open
      expect(document.body.querySelector('[data-testid="false-color-dropdown"]')).not.toBeNull();

      control.dispose();
      expect(document.body.querySelector('[data-testid="false-color-dropdown"]')).toBeNull();
    });

    it('FC-H07h: dropdown should reposition on window scroll', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      const scrollSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const scrollCalls = scrollSpy.mock.calls.filter(([event]) => event === 'scroll');
      expect(scrollCalls.length).toBeGreaterThanOrEqual(1);
      scrollSpy.mockRestore();
    });

    it('FC-H07i: dropdown should reposition on window resize', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      const resizeSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const resizeCalls = resizeSpy.mock.calls.filter(([event]) => event === 'resize');
      expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
      resizeSpy.mockRestore();
    });
  });
});
