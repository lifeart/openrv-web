/**
 * ScopesControl Component Tests
 *
 * Tests for the dropdown scope toggle control (Histogram, Waveform, Vectorscope).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScopesControl, ScopeType } from './ScopesControl';

describe('ScopesControl', () => {
  let control: ScopesControl;

  beforeEach(() => {
    control = new ScopesControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('SCOPE-U001: all scopes are hidden by default', () => {
      const state = control.getState();
      expect(state.histogram).toBe(false);
      expect(state.waveform).toBe(false);
      expect(state.vectorscope).toBe(false);
      expect(state.gamutDiagram).toBe(false);
    });

    it('SCOPE-U002: isScopeVisible returns false for all scopes initially', () => {
      expect(control.isScopeVisible('histogram')).toBe(false);
      expect(control.isScopeVisible('waveform')).toBe(false);
      expect(control.isScopeVisible('vectorscope')).toBe(false);
      expect(control.isScopeVisible('gamutDiagram')).toBe(false);
    });
  });

  describe('render', () => {
    it('SCOPE-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('SCOPE-U011: container has data-testid', () => {
      const el = control.render();
      expect(el.dataset.testid).toBe('scopes-control');
    });

    it('SCOPE-U012: container has scopes-control class', () => {
      const el = control.render();
      expect(el.className).toBe('scopes-control');
    });

    it('SCOPE-U013: container has button', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]');
      expect(button).not.toBeNull();
    });

    it('SCOPE-U014: button has correct title', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.title).toContain('histogram');
      expect(button.title).toContain('waveform');
      expect(button.title).toContain('vectorscope');
    });

    it('SCOPE-U015: button displays Scopes label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('Scopes');
    });
  });

  describe('toggleScope', () => {
    it('SCOPE-U020: toggleScope enables histogram', () => {
      control.toggleScope('histogram');
      expect(control.isScopeVisible('histogram')).toBe(true);
    });

    it('SCOPE-U021: toggleScope enables waveform', () => {
      control.toggleScope('waveform');
      expect(control.isScopeVisible('waveform')).toBe(true);
    });

    it('SCOPE-U022: toggleScope enables vectorscope', () => {
      control.toggleScope('vectorscope');
      expect(control.isScopeVisible('vectorscope')).toBe(true);
    });

    it('SCOPE-U023: toggleScope twice disables scope', () => {
      control.toggleScope('histogram');
      control.toggleScope('histogram');
      expect(control.isScopeVisible('histogram')).toBe(false);
    });

    it('SCOPE-U024: toggleScope emits scopeToggled event', () => {
      const callback = vi.fn();
      control.on('scopeToggled', callback);

      control.toggleScope('waveform');

      expect(callback).toHaveBeenCalledWith({ scope: 'waveform', visible: true });
    });

    it('SCOPE-U025: toggleScope emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.toggleScope('histogram');

      expect(callback).toHaveBeenCalledWith({
        histogram: true,
        waveform: false,
        vectorscope: false,
        gamutDiagram: false,
      });
    });
  });

  describe('setScopeVisible', () => {
    it('SCOPE-U030: setScopeVisible sets scope to visible', () => {
      control.setScopeVisible('histogram', true);
      expect(control.isScopeVisible('histogram')).toBe(true);
    });

    it('SCOPE-U031: setScopeVisible sets scope to hidden', () => {
      control.toggleScope('waveform');
      control.setScopeVisible('waveform', false);
      expect(control.isScopeVisible('waveform')).toBe(false);
    });

    it('SCOPE-U032: setScopeVisible with same false value does not emit scopeToggled', () => {
      const callback = vi.fn();
      control.on('scopeToggled', callback);

      control.setScopeVisible('histogram', false); // Already false

      expect(callback).not.toHaveBeenCalled();
    });

    it('SCOPE-U033: setScopeVisible with same true value does not emit scopeToggled', () => {
      control.toggleScope('histogram');
      const callback = vi.fn();
      control.on('scopeToggled', callback);

      control.setScopeVisible('histogram', true); // Already true

      expect(callback).not.toHaveBeenCalled();
    });

    it('SCOPE-U034: setScopeVisible does not emit stateChanged when value unchanged', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setScopeVisible('histogram', false); // Already false

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('SCOPE-U040: getState returns copy of state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('SCOPE-U041: getState reflects changes after toggle', () => {
      control.toggleScope('histogram');
      control.toggleScope('vectorscope');

      const state = control.getState();
      expect(state).toEqual({
        histogram: true,
        waveform: false,
        vectorscope: true,
        gamutDiagram: false,
      });
    });
  });

  describe('button label updates', () => {
    it('SCOPE-U050: button shows Scopes (1) when one scope active', () => {
      const el = control.render();
      control.toggleScope('histogram');

      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toMatch(/Scopes\s*\(1\)/);
    });

    it('SCOPE-U051: button shows Scopes (2) with two active', () => {
      const el = control.render();
      control.toggleScope('histogram');
      control.toggleScope('waveform');

      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toMatch(/Scopes\s*\(2\)/);
    });

    it('SCOPE-U052: button shows Scopes (3) with three active', () => {
      const el = control.render();
      control.toggleScope('histogram');
      control.toggleScope('waveform');
      control.toggleScope('vectorscope');

      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toMatch(/Scopes\s*\(3\)/);
    });

    it('SCOPE-U056: button shows Scopes (4) with all four active', () => {
      const el = control.render();
      control.toggleScope('histogram');
      control.toggleScope('waveform');
      control.toggleScope('vectorscope');
      control.toggleScope('gamutDiagram');

      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toMatch(/Scopes\s*\(4\)/);
    });

    it('SCOPE-U053: button shows just Scopes when none active', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('Scopes');
      expect(button.textContent).not.toContain('(');
    });

    it('SCOPE-U054: button has active style when scopes enabled', () => {
      const el = control.render();
      control.toggleScope('histogram');

      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      // Active state has blue highlight color
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('SCOPE-U055: button has default style when no scopes enabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      // Default state has transparent background
      expect(button.style.background).toBe('transparent');
    });
  });

  describe('dispose', () => {
    it('SCOPE-U060: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('SCOPE-U061: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });

  describe('scope types', () => {
    const scopeTypes: ScopeType[] = ['histogram', 'waveform', 'vectorscope', 'gamutDiagram'];

    scopeTypes.forEach((scope) => {
      it(`SCOPE-U070-${scope}: ${scope} can be toggled`, () => {
        control.toggleScope(scope);
        expect(control.isScopeVisible(scope)).toBe(true);
        control.toggleScope(scope);
        expect(control.isScopeVisible(scope)).toBe(false);
      });

      it(`SCOPE-U071-${scope}: ${scope} emits correct event`, () => {
        const callback = vi.fn();
        control.on('scopeToggled', callback);

        control.toggleScope(scope);

        expect(callback).toHaveBeenCalledWith({ scope, visible: true });
      });
    });
  });

  describe('multiple scope operations', () => {
    it('SCOPE-U080: can enable all scopes', () => {
      control.toggleScope('histogram');
      control.toggleScope('waveform');
      control.toggleScope('vectorscope');
      control.toggleScope('gamutDiagram');

      expect(control.isScopeVisible('histogram')).toBe(true);
      expect(control.isScopeVisible('waveform')).toBe(true);
      expect(control.isScopeVisible('vectorscope')).toBe(true);
      expect(control.isScopeVisible('gamutDiagram')).toBe(true);
    });

    it('SCOPE-U081: can disable all scopes', () => {
      control.toggleScope('histogram');
      control.toggleScope('waveform');
      control.toggleScope('vectorscope');
      control.toggleScope('gamutDiagram');

      control.toggleScope('histogram');
      control.toggleScope('waveform');
      control.toggleScope('vectorscope');
      control.toggleScope('gamutDiagram');

      expect(control.isScopeVisible('histogram')).toBe(false);
      expect(control.isScopeVisible('waveform')).toBe(false);
      expect(control.isScopeVisible('vectorscope')).toBe(false);
      expect(control.isScopeVisible('gamutDiagram')).toBe(false);
    });

    it('SCOPE-U082: scopes are independent', () => {
      control.toggleScope('histogram');

      expect(control.isScopeVisible('histogram')).toBe(true);
      expect(control.isScopeVisible('waveform')).toBe(false);
      expect(control.isScopeVisible('vectorscope')).toBe(false);
      expect(control.isScopeVisible('gamutDiagram')).toBe(false);
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('SCOPE-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('menu');
    });

    it('SCOPE-M15b: toggle button aria-expanded should be "false" when dropdown is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('SCOPE-M15c: toggle button aria-expanded should be "true" when dropdown is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('SCOPE-M15d: dropdown container should have role="menu" attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="scopes-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('menu');
    });

    it('SCOPE-M15e: dropdown container should have aria-label attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="scopes-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('aria-label')).toBe('Scopes Settings');
    });
  });
});
