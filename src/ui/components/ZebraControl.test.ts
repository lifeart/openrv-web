/**
 * ZebraControl Component Tests
 *
 * Tests for the zebra stripes dropdown control with threshold sliders.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

    it('ZEBRA-U015: container has dropdown element', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]');
      expect(dropdown).not.toBeNull();
    });

    it('ZEBRA-U016: dropdown is hidden by default', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
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
      expect(button.style.cssText).toContain('rgb(153, 153, 153)'); // #999
    });

    it('ZEBRA-U022: button has blue styling when enabled with high zebras', () => {
      control.render();
      zebraStripes.enable();
      zebraStripes.setState({ highEnabled: true });

      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('rgb(74, 158, 255)'); // #4a9eff
    });

    it('ZEBRA-U023: button hover changes background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      expect(button.style.cssText).toContain('rgb(58, 58, 58)');
    });

    it('ZEBRA-U024: button mouseleave restores background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      button.dispatchEvent(new MouseEvent('mouseleave'));
      expect(button.style.background).toBe('transparent');
    });
  });

  describe('dropdown behavior', () => {
    it('ZEBRA-U030: clicking button opens dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      button.click();

      expect(dropdown.style.display).toBe('block');
    });

    it('ZEBRA-U031: clicking button twice closes dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      button.click(); // open
      button.click(); // close

      expect(dropdown.style.display).toBe('none');
    });

    it('ZEBRA-U032: dropdown has high zebras section', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.textContent).toContain('High Zebras');
    });

    it('ZEBRA-U033: dropdown has low zebras section', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.textContent).toContain('Low Zebras');
    });

    it('ZEBRA-U034: dropdown has high zebras checkbox', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('ZEBRA-U035: dropdown has threshold sliders', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(2); // high and low threshold
    });
  });

  describe('high zebras controls', () => {
    it('ZEBRA-U040: high checkbox is checked by default', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const highCheckbox = checkboxes[0] as HTMLInputElement;

      expect(highCheckbox.checked).toBe(true); // Default is highEnabled: true
    });

    it('ZEBRA-U041: clicking high checkbox toggles highEnabled', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
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
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      expect(highSlider.value).toBe('95'); // Default high threshold
    });

    it('ZEBRA-U043: changing high slider updates threshold', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      highSlider.value = '90';
      highSlider.dispatchEvent(new Event('input'));

      expect(zebraStripes.getState().highThreshold).toBe(90);
    });

    it('ZEBRA-U044: high slider has correct min/max', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const highSlider = sliders[0] as HTMLInputElement;

      expect(highSlider.min).toBe('70');
      expect(highSlider.max).toBe('100');
    });
  });

  describe('low zebras controls', () => {
    it('ZEBRA-U050: low checkbox is unchecked by default', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const lowCheckbox = checkboxes[1] as HTMLInputElement;

      expect(lowCheckbox.checked).toBe(false); // Default is lowEnabled: false
    });

    it('ZEBRA-U051: clicking low checkbox toggles lowEnabled', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const lowCheckbox = checkboxes[1] as HTMLInputElement;

      lowCheckbox.checked = true;
      lowCheckbox.dispatchEvent(new Event('change'));

      expect(zebraStripes.getState().lowEnabled).toBe(true);
    });

    it('ZEBRA-U052: low threshold slider has correct initial value', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const lowSlider = sliders[1] as HTMLInputElement;

      expect(lowSlider.value).toBe('5'); // Default low threshold
    });

    it('ZEBRA-U053: changing low slider updates threshold', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const lowSlider = sliders[1] as HTMLInputElement;

      lowSlider.value = '10';
      lowSlider.dispatchEvent(new Event('input'));

      expect(zebraStripes.getState().lowThreshold).toBe(10);
    });

    it('ZEBRA-U054: low slider has correct min/max', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const sliders = dropdown.querySelectorAll('input[type="range"]');
      const lowSlider = sliders[1] as HTMLInputElement;

      expect(lowSlider.min).toBe('0');
      expect(lowSlider.max).toBe('30');
    });
  });

  describe('value labels', () => {
    it('ZEBRA-U060: high threshold value label shows percentage', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      expect(dropdown.textContent).toContain('95%');
    });

    it('ZEBRA-U061: low threshold value label shows percentage', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

      expect(dropdown.textContent).toContain('5%');
    });

    it('ZEBRA-U062: value label updates when slider changes', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
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
      expect(button.style.color).toBe('rgb(153, 153, 153)');

      // Enable zebras externally
      zebraStripes.enable();
      zebraStripes.setState({ highEnabled: true });

      // Button should update to blue
      expect(button.style.cssText).toContain('rgb(74, 158, 255)');
    });

    it('ZEBRA-U071: checkboxes update when state changes externally', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const lowCheckbox = checkboxes[1] as HTMLInputElement;

      expect(lowCheckbox.checked).toBe(false);

      zebraStripes.setState({ lowEnabled: true });

      expect(lowCheckbox.checked).toBe(true);
    });

    it('ZEBRA-U072: sliders update when state changes externally', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
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
      expect(button.style.color).toBe('rgb(153, 153, 153)');
    });

    it('ZEBRA-U081: button active when enabled with high zebras', () => {
      const el = control.render();
      zebraStripes.setState({ enabled: true, highEnabled: true, lowEnabled: false });

      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('rgb(74, 158, 255)');
    });

    it('ZEBRA-U082: button active when enabled with low zebras', () => {
      const el = control.render();
      zebraStripes.setState({ enabled: true, highEnabled: false, lowEnabled: true });

      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('rgb(74, 158, 255)');
    });

    it('ZEBRA-U083: button active when enabled with both zebras', () => {
      const el = control.render();
      zebraStripes.setState({ enabled: true, highEnabled: true, lowEnabled: true });

      const button = el.querySelector('[data-testid="zebra-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('rgb(74, 158, 255)');
    });
  });

  describe('dropdown content', () => {
    it('ZEBRA-U090: dropdown has description for high zebras', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.textContent).toContain('overexposed');
    });

    it('ZEBRA-U091: dropdown has description for low zebras', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.textContent).toContain('underexposed');
    });

    it('ZEBRA-U092: dropdown has divider between sections', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      const dividers = dropdown.querySelectorAll('div');

      // Find divider by style
      let hasDivider = false;
      dividers.forEach(div => {
        if (div.style.height === '1px' && div.style.background === 'rgb(68, 68, 68)') {
          hasDivider = true;
        }
      });

      expect(hasDivider).toBe(true);
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
  });

  describe('positioning', () => {
    it('ZEBRA-U110: dropdown has fixed positioning', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
      expect(dropdown.style.position).toBe('fixed');
    });

    it('ZEBRA-U111: dropdown has high z-index', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;
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
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

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
      const dropdown = el.querySelector('[data-testid="zebra-dropdown"]') as HTMLElement;

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
});
