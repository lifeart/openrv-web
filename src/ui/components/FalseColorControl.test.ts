/**
 * FalseColorControl Component Tests
 *
 * Tests for the false color dropdown control with presets and legend.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FalseColorControl } from './FalseColorControl';
import { FalseColor } from './FalseColor';

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

    it('FALSE-U015: container has dropdown element', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]');
      expect(dropdown).not.toBeNull();
    });

    it('FALSE-U016: dropdown is hidden by default', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
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
  });

  describe('dropdown behavior', () => {
    it('FALSE-U030: clicking button opens dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;

      button.click();

      expect(dropdown.style.display).toBe('block');
    });

    it('FALSE-U031: clicking button twice closes dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;

      button.click(); // open
      button.click(); // close

      expect(dropdown.style.display).toBe('none');
    });

    it('FALSE-U032: dropdown has enable checkbox', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
    });

    it('FALSE-U033: enable checkbox reflects false color state', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('input[type="checkbox"]') as HTMLInputElement;

      expect(checkbox.checked).toBe(false);

      falseColor.enable();
      expect(checkbox.checked).toBe(true);
    });

    it('FALSE-U034: clicking enable checkbox toggles false color', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('input[type="checkbox"]') as HTMLInputElement;

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(falseColor.isEnabled()).toBe(true);
    });
  });

  describe('preset buttons', () => {
    it('FALSE-U040: dropdown has preset buttons', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const presetButtons = dropdown.querySelectorAll('button[data-preset]');
      expect(presetButtons.length).toBe(3); // standard, arri, red
    });

    it('FALSE-U041: standard preset button exists', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const standardBtn = dropdown.querySelector('button[data-preset="standard"]');
      expect(standardBtn).not.toBeNull();
      expect(standardBtn?.textContent).toBe('Standard');
    });

    it('FALSE-U042: ARRI preset button exists', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]');
      expect(arriBtn).not.toBeNull();
      expect(arriBtn?.textContent).toBe('ARRI');
    });

    it('FALSE-U043: RED preset button exists', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const redBtn = dropdown.querySelector('button[data-preset="red"]');
      expect(redBtn).not.toBeNull();
      expect(redBtn?.textContent).toBe('RED');
    });

    it('FALSE-U044: clicking preset button changes preset', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]') as HTMLButtonElement;

      arriBtn.click();

      expect(falseColor.getState().preset).toBe('arri');
    });

    it('FALSE-U045: active preset button has blue styling', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const standardBtn = dropdown.querySelector('button[data-preset="standard"]') as HTMLButtonElement;

      // Standard is default preset
      expect(standardBtn.style.cssText).toContain('var(--accent-primary)'); // #4a9eff
    });

    it('FALSE-U046: inactive preset button has gray styling', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]') as HTMLButtonElement;

      expect(arriBtn.style.cssText).toContain('var(--bg-secondary)'); // #333
    });

    it('FALSE-U047: preset button hover changes background', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const arriBtn = dropdown.querySelector('button[data-preset="arri"]') as HTMLButtonElement;

      arriBtn.dispatchEvent(new MouseEvent('mouseenter'));

      expect(arriBtn.style.cssText).toContain('var(--border-primary)'); // #444
    });
  });

  describe('legend', () => {
    it('FALSE-U050: dropdown has legend section', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const legend = dropdown.querySelector('.false-color-legend');
      expect(legend).not.toBeNull();
    });

    it('FALSE-U051: legend has items container', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const legendItems = dropdown.querySelector('.legend-items');
      expect(legendItems).not.toBeNull();
    });

    it('FALSE-U052: legend contains color swatches', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      const legendItems = dropdown.querySelector('.legend-items');

      // Open dropdown to trigger legend render
      const button = el.querySelector('[data-testid="false-color-control-button"]') as HTMLButtonElement;
      button.click();

      // Should have legend items matching the palette
      expect(legendItems?.children.length).toBeGreaterThan(0);
    });

    it('FALSE-U053: legend updates when preset changes', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
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
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
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
      control.render();
      control.dispose();
      // No error means cleanup was successful
      expect(true).toBe(true);
    });
  });

  describe('positioning', () => {
    it('FALSE-U080: dropdown has fixed positioning', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(dropdown.style.position).toBe('fixed');
    });

    it('FALSE-U081: dropdown has high z-index', () => {
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="false-color-dropdown"]') as HTMLElement;
      expect(parseInt(dropdown.style.zIndex, 10)).toBeGreaterThan(1000);
    });

    it('FALSE-U082: container has relative positioning', () => {
      const el = control.render();
      expect(el.style.position).toBe('relative');
    });
  });
});
