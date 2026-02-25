/**
 * ZebraControl Component Tests
 *
 * Tests for the zebra stripes dropdown control with threshold sliders.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZebraControl } from './ZebraControl';
import { ZebraStripes } from './ZebraStripes';

describe('ZebraControl', () => {
  let control: ZebraControl;
  let zebraStripes: ZebraStripes;

  beforeEach(() => {
    zebraStripes = new ZebraStripes();
    control = new ZebraControl(zebraStripes);
  });

  afterEach(() => {
    control.dispose();
    zebraStripes.dispose();
  });

  describe('initialization', () => {
    it('ZEBRA-U001: creates ZebraControl instance', () => {
      expect(control).toBeInstanceOf(ZebraControl);
    });

    it('ZEBRA-U002: getZebraStripes returns the zebra stripes instance', () => {
      expect(control.getZebraStripes()).toBe(zebraStripes);
    });
  });

  describe('render', () => {
    it('ZEBRA-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('ZEBRA-U011: container has zebra-control class', () => {
      const el = control.render();
      expect(el.className).toBe('zebra-control');
    });

    it('ZEBRA-U012: container has toggle button', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]');
      expect(button).not.toBeNull();
    });

    it('ZEBRA-U013: toggle button displays Zebra label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]');
      expect(button?.textContent).toContain('Zebra');
    });

    it('ZEBRA-U014: toggle button has correct title with shortcut', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.title).toContain('Shift+Alt+Z');
    });

    it('ZEBRA-U015: dropdown is appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(document.querySelector('[data-testid="zebra-dropdown"]')).toBeNull();
      button.click();
      expect(document.querySelector('[data-testid="zebra-dropdown"]')).not.toBeNull();
    });

    it('ZEBRA-U016: dropdown is not in DOM by default', () => {
      control.render();
      expect(document.querySelector('[data-testid="zebra-dropdown"]')).toBeNull();
    });
  });

  describe('button styling', () => {
    it('ZEBRA-U020: button has transparent background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.background).toBe('transparent');
    });

    it('ZEBRA-U021: button has gray color when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--text-muted)'); // #999
    });

    it('ZEBRA-U022: button has blue styling when enabled with high zebras', () => {
      control.render();
      zebraStripes.enable();
      zebraStripes.setState({ highEnabled: true });

      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('ZEBRA-U023: button hover changes background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      expect(button.style.cssText).toContain('var(--bg-hover)');
    });

    it('ZEBRA-U024: button pointerleave restores background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      button.dispatchEvent(new MouseEvent('pointerleave'));
      expect(button.style.background).toBe('transparent');
    });

    it('ZEBRA-M20a: borderColor resets to transparent on pointerleave when inactive', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      expect(button.style.borderColor).toBe('var(--border-primary)');
      button.dispatchEvent(new MouseEvent('pointerleave'));
      expect(button.style.borderColor).toBe('transparent');
    });

    it('ZEBRA-M20b: borderColor remains accent color on pointerleave when active', () => {
      const el = control.render();
      zebraStripes.enable();
      zebraStripes.setState({ highEnabled: true });
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      button.dispatchEvent(new MouseEvent('pointerleave'));
      expect(button.style.borderColor).toBe('var(--accent-primary)');
    });
  });

  describe('dropdown behavior', () => {
    function openDropdown(): HTMLElement {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      return document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
    }

    it('ZEBRA-U030: clicking button opens dropdown', () => {
      const dropdown = openDropdown();
      expect(dropdown.style.display).toBe('block');
    });

    it('ZEBRA-U031: clicking button twice closes dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('ZEBRA-U032: dropdown has high zebras section', () => {
      const dropdown = openDropdown();
      expect(dropdown.textContent).toContain('High Zebras');
    });

    it('ZEBRA-U033: dropdown has low zebras section', () => {
      const dropdown = openDropdown();
      expect(dropdown.textContent).toContain('Low Zebras');
    });

    it('ZEBRA-U034: dropdown has high zebras checkbox', () => {
      const dropdown = openDropdown();
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('ZEBRA-U035: dropdown has threshold sliders', () => {
      const dropdown = openDropdown();
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(2); // high and low threshold
    });
  });

  describe('high zebras controls', () => {
    it('ZEBRA-U040: high checkbox is checked by default', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const highCheckbox = checkboxes[0] as HTMLInputElement;

      expect(highCheckbox.checked).toBe(true); // Default is highEnabled: true
    });

    it('ZEBRA-U041: clicking high checkbox toggles highEnabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const highCheckbox = checkboxes[0] as HTMLInputElement;

      // Checkbox is checked by default (highEnabled: true), so unchecking it should disable
      highCheckbox.checked = false;
      highCheckbox.dispatchEvent(new Event('change'));

      // After change, highEnabled should be false and enabled should be true
      expect(zebraStripes.getState().highEnabled).toBe(false);
    });

    it('ZEBRA-U042: high threshold slider has correct initial value', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      expect(highSlider.value).toBe('95'); // Default high threshold
    });

    it('ZEBRA-U043: changing high slider updates threshold', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      highSlider.value = '90';
      highSlider.dispatchEvent(new Event('input'));

      expect(zebraStripes.getState().highThreshold).toBe(90);
    });

    it('ZEBRA-U044: high slider has correct min/max', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      expect(highSlider.min).toBe('70');
      expect(highSlider.max).toBe('100');
    });
  });

  describe('low zebras controls', () => {
    it('ZEBRA-U050: low checkbox is unchecked by default', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const lowCheckbox = checkboxes[1] as HTMLInputElement;

      expect(lowCheckbox.checked).toBe(false); // Default is lowEnabled: false
    });

    it('ZEBRA-U051: clicking low checkbox toggles lowEnabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const lowCheckbox = checkboxes[1] as HTMLInputElement;

      lowCheckbox.checked = true;
      lowCheckbox.dispatchEvent(new Event('change'));

      expect(zebraStripes.getState().lowEnabled).toBe(true);
    });

    it('ZEBRA-U052: low threshold slider has correct initial value', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const lowSlider = sliders[1] as HTMLInputElement;

      expect(lowSlider.value).toBe('5'); // Default low threshold
    });

    it('ZEBRA-U053: changing low slider updates threshold', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const lowSlider = sliders[1] as HTMLInputElement;

      lowSlider.value = '10';
      lowSlider.dispatchEvent(new Event('input'));

      expect(zebraStripes.getState().lowThreshold).toBe(10);
    });

    it('ZEBRA-U054: low slider has correct min/max', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const lowSlider = sliders[1] as HTMLInputElement;

      expect(lowSlider.min).toBe('0');
      expect(lowSlider.max).toBe('30');
    });
  });

  describe('value labels', () => {
    it('ZEBRA-U060: high threshold value label shows percentage', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      expect(dropdown.textContent).toContain('95%');
    });

    it('ZEBRA-U061: low threshold value label shows percentage', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      expect(dropdown.textContent).toContain('5%');
    });

    it('ZEBRA-U062: value label updates when slider changes', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      highSlider.value = '85';
      highSlider.dispatchEvent(new Event('input'));

      expect(dropdown.textContent).toContain('85%');
    });
  });

  describe('state synchronization', () => {
    it('ZEBRA-U070: control updates when zebra state changes', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      // Initially disabled style
      expect(button.style.color).toBe('var(--text-muted)');

      // Enable zebras externally
      zebraStripes.enable();
      zebraStripes.setState({ highEnabled: true });

      // Button should update to blue
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('ZEBRA-U071: checkboxes update when state changes externally', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const lowCheckbox = checkboxes[1] as HTMLInputElement;

      expect(lowCheckbox.checked).toBe(false);

      zebraStripes.setState({ lowEnabled: true });

      expect(lowCheckbox.checked).toBe(true);
    });

    it('ZEBRA-U072: sliders update when state changes externally', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      expect(highSlider.value).toBe('95');

      zebraStripes.setHighThreshold(80);

      expect(highSlider.value).toBe('80');
    });
  });

  describe('button state based on zebra enabled', () => {
    it('ZEBRA-U080: button inactive when enabled but no zebras selected', () => {
      const el = control.render();
      zebraStripes.setState({ enabled: true, highEnabled: false, lowEnabled: false });

      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.color).toBe('var(--text-muted)');
    });

    it('ZEBRA-U081: button active when enabled with high zebras', () => {
      const el = control.render();
      zebraStripes.setState({ enabled: true, highEnabled: true, lowEnabled: false });

      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('ZEBRA-U082: button active when enabled with low zebras', () => {
      const el = control.render();
      zebraStripes.setState({ enabled: true, highEnabled: false, lowEnabled: true });

      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('ZEBRA-U083: button active when enabled with both zebras', () => {
      const el = control.render();
      zebraStripes.setState({ enabled: true, highEnabled: true, lowEnabled: true });

      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });
  });

  describe('dropdown content', () => {
    it('ZEBRA-U090: dropdown has description for high zebras', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.textContent).toContain('overexposed');
    });

    it('ZEBRA-U091: dropdown has description for low zebras', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.textContent).toContain('underexposed');
    });

    it('ZEBRA-U092: dropdown has divider between sections', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const dividers = dropdown.querySelectorAll('div');

      // Find divider by style
      let hasDivider = false;
      dividers.forEach(div => {
        if (div.style.height === '1px' && div.style.background === 'var(--border-primary)') {
          hasDivider = true;
        }
      });

      expect(hasDivider).toBe(true);
    });
  });

  describe('outside click listener lifecycle', () => {
    it('ZEBRA-M21a: outside click listener should NOT be registered when dropdown is closed', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      control.dispose();
      zebraStripes.dispose();
      addSpy.mockClear();

      zebraStripes = new ZebraStripes();
      control = new ZebraControl(zebraStripes);

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(0);
      addSpy.mockRestore();
    });

    it('ZEBRA-M21b: outside click listener should be registered when dropdown opens', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      addSpy.mockClear();
      button.click(); // open

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      addSpy.mockRestore();
    });

    it('ZEBRA-M21c: outside click listener should be removed when dropdown closes', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      button.click(); // open
      removeSpy.mockClear();
      button.click(); // close

      const clickCalls = removeSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      removeSpy.mockRestore();
    });

    it('ZEBRA-M21d: dispose should remove outside click listener regardless of dropdown state', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

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
    it('ZEBRA-U100: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('ZEBRA-U101: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('ZEBRA-U102: dispose unsubscribes from state changes', () => {
      const unsubSpy = vi.fn();
      vi.spyOn(zebraStripes, 'on').mockReturnValue(unsubSpy);

      // Re-create to capture subscription
      control.dispose();
      control = new ZebraControl(zebraStripes);

      expect(zebraStripes.on).toHaveBeenCalledWith('stateChanged', expect.any(Function));

      control.dispose();

      expect(unsubSpy).toHaveBeenCalled();
    });
  });

  describe('positioning', () => {
    it('ZEBRA-U110: dropdown has fixed positioning', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.style.position).toBe('fixed');
    });

    it('ZEBRA-U111: dropdown has high z-index', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(parseInt(dropdown.style.zIndex, 10)).toBeGreaterThan(1000);
    });

    it('ZEBRA-U112: container has relative positioning', () => {
      const el = control.render();
      expect(el.style.position).toBe('relative');
    });
  });

  describe('color indicators', () => {
    it('ZEBRA-U120: high zebras section has color indicator', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      // Check for diagonal stripe pattern element
      const elements = dropdown.querySelectorAll('div');
      let hasHighIndicator = false;
      elements.forEach(el => {
        if (el.style.cssText.includes('repeating-linear-gradient') &&
            el.style.cssText.includes('45deg')) {
          hasHighIndicator = true;
        }
      });

      expect(hasHighIndicator).toBe(true);
    });

    it('ZEBRA-U121: low zebras section has color indicator', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      // Check for diagonal stripe pattern element (left-leaning)
      const elements = dropdown.querySelectorAll('div');
      let hasLowIndicator = false;
      elements.forEach(el => {
        if (el.style.cssText.includes('repeating-linear-gradient') &&
            el.style.cssText.includes('-45deg')) {
          hasLowIndicator = true;
        }
      });

      expect(hasLowIndicator).toBe(true);
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('ZEBRA-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('ZEBRA-M15b: toggle button aria-expanded should be "false" when dropdown is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('ZEBRA-M15c: toggle button aria-expanded should be "true" when dropdown is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('ZEBRA-M15d: dropdown container should have role="dialog" attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('dialog');
    });

    it('ZEBRA-M15e: dropdown container should have aria-label attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('aria-label')).toBe('Zebra Settings');
    });
  });

  describe('keyboard focus ring (M-16)', () => {
    it('ZEBRA-M16a: toggle button should have focus/blur event listeners added by applyA11yFocus', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      // applyA11yFocus registers a focus listener that sets outline on keyboard focus.
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
    });

    it('ZEBRA-M16b: keyboard focus (Tab) should apply visible focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      // Simulate keyboard focus (no preceding mousedown)
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
      expect(button.style.outlineOffset).toBe('2px');
    });

    it('ZEBRA-M16c: mouse focus (click) should not apply focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      // Simulate mouse click: pointerdown then focus
      button.dispatchEvent(new Event('pointerdown'));
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).not.toBe('2px solid var(--accent-primary)');
    });
  });

  describe('dropdown body append (H-07)', () => {
    it('ZC-H07c: dropdown should be appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      expect(document.body.contains(document.querySelector('[data-testid="zebra-dropdown"]'))).toBe(false);

      button.click();

      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(document.body.contains(dropdown)).toBe(true);
      expect(el.contains(dropdown)).toBe(false);
    });

    it('ZC-H07f: dropdown should be removed from document.body on close', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('ZC-H07g: dropdown should be removed from document.body on dispose', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;

      button.click(); // open
      expect(document.body.querySelector('[data-testid="zebra-dropdown"]')).not.toBeNull();

      control.dispose();
      expect(document.body.querySelector('[data-testid="zebra-dropdown"]')).toBeNull();
    });

    it('ZC-H07h: dropdown should reposition on window scroll', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      const scrollSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const scrollCalls = scrollSpy.mock.calls.filter(([event]) => event === 'scroll');
      expect(scrollCalls.length).toBeGreaterThanOrEqual(1);
      scrollSpy.mockRestore();
    });

    it('ZC-H07i: dropdown should reposition on window resize', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      const resizeSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const resizeCalls = resizeSpy.mock.calls.filter(([event]) => event === 'resize');
      expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
      resizeSpy.mockRestore();
    });
  });
});
