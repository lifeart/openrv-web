/**
 * SafeAreasControl Component Tests
 *
 * Tests for the safe areas dropdown control with guide options.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SafeAreasControl } from './SafeAreasControl';
import { SafeAreasOverlay } from './SafeAreasOverlay';

describe('SafeAreasControl', () => {
  let control: SafeAreasControl;
  let overlay: SafeAreasOverlay;

  beforeEach(() => {
    overlay = new SafeAreasOverlay();
    control = new SafeAreasControl(overlay);
  });

  afterEach(() => {
    control.dispose();
    overlay.dispose();
  });

  describe('initialization', () => {
    it('SAFE-U001: creates SafeAreasControl instance', () => {
      expect(control).toBeInstanceOf(SafeAreasControl);
    });

    it('SAFE-U002: getOverlay returns the overlay instance', () => {
      expect(control.getOverlay()).toBe(overlay);
    });
  });

  describe('render', () => {
    it('SAFE-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('SAFE-U011: container has data-testid', () => {
      const el = control.render();
      expect(el.dataset.testid).toBe('safe-areas-control');
    });

    it('SAFE-U012: container has safe-areas-control class', () => {
      const el = control.render();
      expect(el.className).toBe('safe-areas-control');
    });

    it('SAFE-U013: container has button element', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]');
      expect(button).not.toBeNull();
    });

    it('SAFE-U014: button displays Guides label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]');
      expect(button?.textContent).toContain('Guides');
    });

    it('SAFE-U015: button has correct title', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      expect(button.title).toContain('Safe Areas');
    });
  });

  describe('button styling', () => {
    it('SAFE-U020: button has transparent background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      expect(button.style.background).toBe('transparent');
    });

    it('SAFE-U021: button has gray color when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('rgb(153, 153, 153)'); // #999
    });

    it('SAFE-U022: button has blue styling when enabled', () => {
      control.render();
      overlay.enable();
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('rgb(74, 158, 255)'); // #4a9eff
    });

    it('SAFE-U023: button hover changes background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      expect(button.style.cssText).toContain('rgb(58, 58, 58)'); // #3a3a3a
    });

    it('SAFE-U024: button mouseleave restores background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      button.dispatchEvent(new MouseEvent('mouseleave'));
      expect(button.style.background).toBe('transparent');
    });
  });

  describe('button label updates', () => {
    it('SAFE-U030: button shows count when guides are active', () => {
      const el = control.render();
      overlay.enable();

      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      // With default state (titleSafe and actionSafe enabled), count should be 2
      expect(button.textContent).toMatch(/Guides\s*\(2\)/);
    });

    it('SAFE-U031: button count increases with more guides', () => {
      const el = control.render();
      overlay.enable();
      overlay.toggleCenterCrosshair();

      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      expect(button.textContent).toMatch(/Guides\s*\(3\)/);
    });

    it('SAFE-U032: button shows just Guides when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('Guides');
      expect(button.textContent).not.toContain('(');
    });
  });

  describe('dropdown behavior', () => {
    it('SAFE-U040: clicking button opens dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;

      button.click();

      const dropdown = document.querySelector('[data-testid="safe-areas-dropdown"]') as HTMLElement;
      expect(dropdown).not.toBeNull();
      expect(dropdown.style.display).toBe('flex');
    });

    it('SAFE-U041: clicking button twice closes dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.querySelector('[data-testid="safe-areas-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('SAFE-U042: dropdown has enable guides checkbox', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const enableItem = document.querySelector('[data-testid="safe-areas-item-enabled"]');
      expect(enableItem).not.toBeNull();
    });

    it('SAFE-U043: dropdown has action safe checkbox', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const actionItem = document.querySelector('[data-testid="safe-areas-item-actionSafe"]');
      expect(actionItem).not.toBeNull();
    });

    it('SAFE-U044: dropdown has title safe checkbox', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const titleItem = document.querySelector('[data-testid="safe-areas-item-titleSafe"]');
      expect(titleItem).not.toBeNull();
    });

    it('SAFE-U045: dropdown has center crosshair checkbox', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const crosshairItem = document.querySelector('[data-testid="safe-areas-item-centerCrosshair"]');
      expect(crosshairItem).not.toBeNull();
    });

    it('SAFE-U046: dropdown has rule of thirds checkbox', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const thirdsItem = document.querySelector('[data-testid="safe-areas-item-ruleOfThirds"]');
      expect(thirdsItem).not.toBeNull();
    });

    it('SAFE-U047: dropdown has aspect ratio select', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const aspectSelect = document.querySelector('[data-testid="safe-areas-aspect-ratio"]');
      expect(aspectSelect).not.toBeNull();
    });
  });

  describe('checkbox interactions', () => {
    it('SAFE-U050: clicking enable item toggles overlay visibility', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const enableItem = document.querySelector('[data-testid="safe-areas-item-enabled"]') as HTMLElement;

      expect(overlay.isVisible()).toBe(false);
      enableItem.click();
      expect(overlay.isVisible()).toBe(true);
    });

    it('SAFE-U051: clicking action safe item toggles action safe', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const actionItem = document.querySelector('[data-testid="safe-areas-item-actionSafe"]') as HTMLElement;
      const initialState = overlay.getState().actionSafe;

      actionItem.click();

      expect(overlay.getState().actionSafe).toBe(!initialState);
    });

    it('SAFE-U052: clicking title safe item toggles title safe', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const titleItem = document.querySelector('[data-testid="safe-areas-item-titleSafe"]') as HTMLElement;
      const initialState = overlay.getState().titleSafe;

      titleItem.click();

      expect(overlay.getState().titleSafe).toBe(!initialState);
    });

    it('SAFE-U053: clicking center crosshair item toggles crosshair', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const crosshairItem = document.querySelector('[data-testid="safe-areas-item-centerCrosshair"]') as HTMLElement;

      expect(overlay.getState().centerCrosshair).toBe(false);
      crosshairItem.click();
      expect(overlay.getState().centerCrosshair).toBe(true);
    });

    it('SAFE-U054: clicking rule of thirds item toggles grid', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const thirdsItem = document.querySelector('[data-testid="safe-areas-item-ruleOfThirds"]') as HTMLElement;

      expect(overlay.getState().ruleOfThirds).toBe(false);
      thirdsItem.click();
      expect(overlay.getState().ruleOfThirds).toBe(true);
    });
  });

  describe('aspect ratio select', () => {
    it('SAFE-U060: aspect ratio select has None option', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const select = document.querySelector('[data-testid="safe-areas-aspect-ratio"]') as HTMLSelectElement;
      const noneOption = select.querySelector('option[value=""]');

      expect(noneOption).not.toBeNull();
      expect(noneOption?.textContent).toBe('None');
    });

    it('SAFE-U061: aspect ratio select has 16:9 option', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const select = document.querySelector('[data-testid="safe-areas-aspect-ratio"]') as HTMLSelectElement;
      const option = select.querySelector('option[value="16:9"]');

      expect(option).not.toBeNull();
    });

    it('SAFE-U062: aspect ratio select has 2.39:1 option', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const select = document.querySelector('[data-testid="safe-areas-aspect-ratio"]') as HTMLSelectElement;
      const option = select.querySelector('option[value="2.39:1"]');

      expect(option).not.toBeNull();
    });

    it('SAFE-U063: changing select updates overlay aspect ratio', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const select = document.querySelector('[data-testid="safe-areas-aspect-ratio"]') as HTMLSelectElement;

      select.value = '16:9';
      select.dispatchEvent(new Event('change'));

      expect(overlay.getState().aspectRatio).toBe('16:9');
    });

    it('SAFE-U064: selecting None clears aspect ratio', () => {
      const el = control.render();
      overlay.setAspectRatio('16:9');

      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const select = document.querySelector('[data-testid="safe-areas-aspect-ratio"]') as HTMLSelectElement;

      select.value = '';
      select.dispatchEvent(new Event('change'));

      expect(overlay.getState().aspectRatio).toBeNull();
    });
  });

  describe('keyboard handling', () => {
    it('SAFE-U070: handleKeyboard with g toggles overlay', () => {
      expect(overlay.isVisible()).toBe(false);

      const handled = control.handleKeyboard('g', false);

      expect(handled).toBe(true);
      expect(overlay.isVisible()).toBe(true);
    });

    it('SAFE-U071: handleKeyboard with Shift+g does not toggle', () => {
      const handled = control.handleKeyboard('g', true);

      expect(handled).toBe(false);
      expect(overlay.isVisible()).toBe(false);
    });

    it('SAFE-U072: handleKeyboard with other keys returns false', () => {
      const handled = control.handleKeyboard('x', false);

      expect(handled).toBe(false);
    });
  });

  describe('event emission', () => {
    it('SAFE-U080: control emits stateChanged when overlay state changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      overlay.enable();

      expect(callback).toHaveBeenCalled();
    });

    it('SAFE-U081: stateChanged event contains full state', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      overlay.enable();

      const [state] = callback.mock.calls[0];
      expect(state).toHaveProperty('enabled', true);
      expect(state).toHaveProperty('titleSafe');
      expect(state).toHaveProperty('actionSafe');
    });
  });

  describe('dropdown item hover', () => {
    it('SAFE-U090: item mouseenter changes background', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const item = document.querySelector('[data-testid="safe-areas-item-enabled"]') as HTMLElement;
      item.dispatchEvent(new MouseEvent('mouseenter'));

      expect(item.style.cssText).toContain('rgb(58, 58, 58)'); // #3a3a3a
    });

    it('SAFE-U091: item mouseleave restores background', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const item = document.querySelector('[data-testid="safe-areas-item-enabled"]') as HTMLElement;
      item.dispatchEvent(new MouseEvent('mouseenter'));
      item.dispatchEvent(new MouseEvent('mouseleave'));

      expect(item.style.background).toBe('transparent');
    });
  });

  describe('dispose', () => {
    it('SAFE-U100: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('SAFE-U101: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('SAFE-U102: dispose removes dropdown from body if present', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click(); // Opens dropdown, adds to body

      control.dispose();

      const dropdown = document.querySelector('[data-testid="safe-areas-dropdown"]');
      expect(dropdown).toBeNull();
    });
  });

  describe('positioning', () => {
    it('SAFE-U110: dropdown has fixed positioning', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const dropdown = document.querySelector('[data-testid="safe-areas-dropdown"]') as HTMLElement;
      expect(dropdown.style.position).toBe('fixed');
    });

    it('SAFE-U111: dropdown has high z-index', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="safe-areas-button"]') as HTMLButtonElement;
      button.click();

      const dropdown = document.querySelector('[data-testid="safe-areas-dropdown"]') as HTMLElement;
      expect(parseInt(dropdown.style.zIndex, 10)).toBeGreaterThan(1000);
    });

    it('SAFE-U112: container has relative positioning', () => {
      const el = control.render();
      expect(el.style.position).toBe('relative');
    });
  });
});
