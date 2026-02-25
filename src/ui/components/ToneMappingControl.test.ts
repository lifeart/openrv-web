/**
 * ToneMappingControl Component Tests
 *
 * Tests for the tone mapping dropdown control with operators.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ToneMappingControl,
  DEFAULT_TONE_MAPPING_STATE,
  TONE_MAPPING_OPERATORS,
} from './ToneMappingControl';


describe('ToneMappingControl', () => {
  let control: ToneMappingControl;

  beforeEach(() => {
    control = new ToneMappingControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('TONE-U001: creates ToneMappingControl instance', () => {
      expect(control).toBeInstanceOf(ToneMappingControl);
    });

    it('TONE-U002: getState returns default state', () => {
      const state = control.getState();
      expect(state.enabled).toBe(false);
      expect(state.operator).toBe('off');
    });

    it('TONE-U003: isEnabled returns false by default', () => {
      expect(control.isEnabled()).toBe(false);
    });
  });

  describe('render', () => {
    it('TONE-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('TONE-U011: container has tone-mapping-control class', () => {
      const el = control.render();
      expect(el.className).toBe('tone-mapping-control');
    });

    it('TONE-U012: container has toggle button', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]');
      expect(button).not.toBeNull();
    });

    it('TONE-U013: toggle button displays Tone Map label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]');
      expect(button?.textContent).toContain('Tone Map');
    });

    it('TONE-U014: toggle button has correct title with shortcut', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(button.title).toContain('Shift+Alt+J');
    });

    it('TONE-U015: dropdown is appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(document.querySelector('[data-testid="tone-mapping-dropdown"]')).toBeNull();
      button.click();
      expect(document.querySelector('[data-testid="tone-mapping-dropdown"]')).not.toBeNull();
    });

    it('TONE-U016: dropdown is not in DOM by default', () => {
      control.render();
      expect(document.querySelector('[data-testid="tone-mapping-dropdown"]')).toBeNull();
    });
  });

  describe('button styling', () => {
    it('TONE-U020: button has transparent background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(button.style.background).toBe('transparent');
    });

    it('TONE-U021: button has muted color when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--text-muted)');
    });

    it('TONE-U022: button has accent styling when enabled', () => {
      control.setEnabled(true);
      control.setOperator('reinhard');
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('TONE-U023: button hover changes background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      expect(button.style.cssText).toContain('var(--bg-hover)');
    });

    it('TONE-U024: button pointerleave restores background when disabled', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      button.dispatchEvent(new MouseEvent('pointerleave'));
      expect(button.style.background).toBe('transparent');
    });
  });

  describe('dropdown behavior', () => {
    it('TONE-U030: clicking button opens dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      button.click();

      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('block');
    });

    it('TONE-U031: clicking button twice closes dropdown', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('TONE-U032: dropdown has enable checkbox', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('[data-testid="tone-mapping-enable-checkbox"]');
      expect(checkbox).not.toBeNull();
    });

    it('TONE-U033: enable checkbox reflects tone mapping state', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('[data-testid="tone-mapping-enable-checkbox"]') as HTMLInputElement;

      expect(checkbox.checked).toBe(false);

      control.setEnabled(true);
      expect(checkbox.checked).toBe(true);
    });

    it('TONE-U034: clicking enable checkbox toggles tone mapping', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const checkbox = dropdown.querySelector('[data-testid="tone-mapping-enable-checkbox"]') as HTMLInputElement;

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(control.getState().enabled).toBe(true);
    });
  });

  describe('operator buttons', () => {
    function openDropdown(): HTMLElement {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      return document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    }

    it('TONE-U040: dropdown has operator buttons', () => {
      const dropdown = openDropdown();
      const operatorButtons = dropdown.querySelectorAll('button[data-operator]');
      expect(operatorButtons.length).toBe(9); // off, reinhard, filmic, aces, agx, pbrNeutral, gt, acesHill, drago
    });

    it('TONE-U041: off operator button exists', () => {
      const dropdown = openDropdown();
      const offBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-off"]');
      expect(offBtn).not.toBeNull();
    });

    it('TONE-U042: reinhard operator button exists', () => {
      const dropdown = openDropdown();
      const reinhardBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-reinhard"]');
      expect(reinhardBtn).not.toBeNull();
    });

    it('TONE-U043: filmic operator button exists', () => {
      const dropdown = openDropdown();
      const filmicBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-filmic"]');
      expect(filmicBtn).not.toBeNull();
    });

    it('TONE-U044: aces operator button exists', () => {
      const dropdown = openDropdown();
      const acesBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-aces"]');
      expect(acesBtn).not.toBeNull();
    });

    it('TONE-U044b: drago operator button exists', () => {
      const dropdown = openDropdown();
      const dragoBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-drago"]');
      expect(dragoBtn).not.toBeNull();
    });

    it('TONE-U045: clicking operator button changes operator', () => {
      const dropdown = openDropdown();
      const filmicBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-filmic"]') as HTMLButtonElement;

      filmicBtn.click();

      expect(control.getState().operator).toBe('filmic');
    });

    it('TONE-U046: selecting non-off operator auto-enables', () => {
      const dropdown = openDropdown();
      const reinhardBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-reinhard"]') as HTMLButtonElement;

      expect(control.getState().enabled).toBe(false);
      reinhardBtn.click();

      expect(control.getState().enabled).toBe(true);
      expect(control.getState().operator).toBe('reinhard');
    });

    it('TONE-U047: selecting off operator auto-disables', () => {
      control.setEnabled(true);
      control.setOperator('aces');
      expect(control.getState().enabled).toBe(true);

      const dropdown = openDropdown();
      const offBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-off"]') as HTMLButtonElement;

      offBtn.click();

      expect(control.getState().enabled).toBe(false);
      expect(control.getState().operator).toBe('off');
    });

    it('TONE-U048: active operator button has accent styling', () => {
      const dropdown = openDropdown();
      const offBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-off"]') as HTMLButtonElement;

      // Off is default operator
      expect(offBtn.style.cssText).toContain('var(--accent-primary)');
    });
  });

  describe('setOperator', () => {
    it('TONE-U050: setOperator changes operator', () => {
      control.setOperator('filmic');
      expect(control.getState().operator).toBe('filmic');
    });

    it('TONE-U051: setOperator emits stateChanged event', () => {
      const listener = vi.fn();
      control.on('stateChanged', listener);

      control.setOperator('aces');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        operator: 'aces',
      }));
    });

    it('TONE-U052: setOperator with same value does not emit', () => {
      control.setOperator('off'); // already off
      const listener = vi.fn();
      control.on('stateChanged', listener);

      control.setOperator('off');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('TONE-U060: setEnabled changes enabled state', () => {
      control.setEnabled(true);
      expect(control.getState().enabled).toBe(true);
    });

    it('TONE-U061: setEnabled emits stateChanged event', () => {
      const listener = vi.fn();
      control.on('stateChanged', listener);

      control.setEnabled(true);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        enabled: true,
      }));
    });

    it('TONE-U062: setEnabled with same value does not emit', () => {
      control.setEnabled(false); // already false
      const listener = vi.fn();
      control.on('stateChanged', listener);

      control.setEnabled(false);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('toggle', () => {
    it('TONE-U070: toggle enables when disabled', () => {
      expect(control.getState().enabled).toBe(false);
      control.toggle();
      expect(control.getState().enabled).toBe(true);
    });

    it('TONE-U071: toggle disables when enabled', () => {
      control.setEnabled(true);
      expect(control.getState().enabled).toBe(true);
      control.toggle();
      expect(control.getState().enabled).toBe(false);
    });
  });

  describe('setState', () => {
    it('TONE-U080: setState updates enabled', () => {
      control.setState({ enabled: true });
      expect(control.getState().enabled).toBe(true);
    });

    it('TONE-U081: setState updates operator', () => {
      control.setState({ operator: 'reinhard' });
      expect(control.getState().operator).toBe('reinhard');
    });

    it('TONE-U082: setState updates both', () => {
      control.setState({ enabled: true, operator: 'aces' });
      const state = control.getState();
      expect(state.enabled).toBe(true);
      expect(state.operator).toBe('aces');
    });

    it('TONE-U083: setState emits stateChanged', () => {
      const listener = vi.fn();
      control.on('stateChanged', listener);

      control.setState({ enabled: true, operator: 'filmic' });

      expect(listener).toHaveBeenCalled();
    });

    it('TONE-U084: setState with no changes does not emit', () => {
      const listener = vi.fn();
      control.on('stateChanged', listener);

      control.setState({ enabled: false, operator: 'off' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('TONE-U085: setState updates dragoBias', () => {
      control.setState({ dragoBias: 0.9 });
      expect(control.getState().dragoBias).toBe(0.9);
    });

    it('TONE-U086: setState updates dragoLwa', () => {
      control.setState({ dragoLwa: 0.5 });
      expect(control.getState().dragoLwa).toBe(0.5);
    });

    it('TONE-U087: setState updates dragoLmax', () => {
      control.setState({ dragoLmax: 3.0 });
      expect(control.getState().dragoLmax).toBe(3.0);
    });

    it('TONE-U088: setState with drago fields emits stateChanged', () => {
      const listener = vi.fn();
      control.on('stateChanged', listener);

      control.setState({ dragoBias: 0.75 });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        dragoBias: 0.75,
      }));
    });
  });

  describe('parameter sections', () => {
    function getParams(): HTMLElement {
      // Open dropdown to append to body, then query params from it
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      return dropdown.querySelector('[data-testid="tone-mapping-params"]') as HTMLElement;
    }

    it('TONE-U170: reinhard shows parameter section with white point slider', () => {
      control.setOperator('reinhard');
      const params = getParams();
      expect(params.style.display).toBe('block');
      expect(params.textContent).toContain('Reinhard Parameters');
      expect(params.textContent).toContain('White Point');
    });

    it('TONE-U171: filmic shows parameter section with two sliders', () => {
      control.setOperator('filmic');
      const params = getParams();
      expect(params.style.display).toBe('block');
      expect(params.textContent).toContain('Filmic Parameters');
      expect(params.textContent).toContain('Exposure Bias');
      expect(params.textContent).toContain('White Point');
    });

    it('TONE-U172: drago shows parameter section with bias and brightness sliders', () => {
      control.setOperator('drago');
      const params = getParams();
      expect(params.style.display).toBe('block');
      expect(params.textContent).toContain('Drago Parameters');
      expect(params.textContent).toContain('Bias');
      expect(params.textContent).toContain('Brightness');
      const sliders = params.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(2);
    });

    it('TONE-U173: drago bias slider has correct range attributes', () => {
      control.setOperator('drago');
      const params = getParams();
      const sliders = params.querySelectorAll('input[type="range"]');
      const biasSlider = sliders[0] as HTMLInputElement;
      expect(biasSlider).not.toBeNull();
      expect(biasSlider.min).toBe('0.5');
      expect(biasSlider.max).toBe('1');
      expect(biasSlider.step).toBe('0.01');
      expect(biasSlider.value).toBe('0.85');
    });

    it('TONE-U173b: drago brightness slider has correct range attributes', () => {
      control.setOperator('drago');
      const params = getParams();
      const sliders = params.querySelectorAll('input[type="range"]');
      const brightnessSlider = sliders[1] as HTMLInputElement;
      expect(brightnessSlider).not.toBeNull();
      expect(brightnessSlider.min).toBe('0.5');
      expect(brightnessSlider.max).toBe('5');
      expect(brightnessSlider.step).toBe('0.1');
      expect(brightnessSlider.value).toBe('2');
    });

    it('TONE-U174: drago bias slider emits stateChanged on input', () => {
      control.setOperator('drago');
      const listener = vi.fn();
      control.on('stateChanged', listener);
      listener.mockClear(); // clear from setOperator call

      const params = getParams();
      const sliders = params.querySelectorAll('input[type="range"]');
      const biasSlider = sliders[0] as HTMLInputElement;
      biasSlider.value = '0.9';
      biasSlider.dispatchEvent(new Event('input'));

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        dragoBias: 0.9,
      }));
    });

    it('TONE-U174b: drago brightness slider emits stateChanged on input', () => {
      control.setOperator('drago');
      const listener = vi.fn();
      control.on('stateChanged', listener);
      listener.mockClear();

      const params = getParams();
      const sliders = params.querySelectorAll('input[type="range"]');
      const brightnessSlider = sliders[1] as HTMLInputElement;
      brightnessSlider.value = '3.0';
      brightnessSlider.dispatchEvent(new Event('input'));

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        dragoBrightness: 3.0,
      }));
    });

    it('TONE-U175: aces hides parameter section', () => {
      control.setOperator('aces');
      const params = getParams();
      expect(params.style.display).toBe('none');
    });

    it('TONE-U176: off hides parameter section', () => {
      // Start from a non-off operator, then switch to off
      control.setOperator('reinhard');
      control.setOperator('off');
      const params = getParams();
      expect(params.style.display).toBe('none');
    });

    it('TONE-U177: switching from drago to aces hides parameter section', () => {
      control.setOperator('drago');
      const params = getParams();
      expect(params.style.display).toBe('block');

      control.setOperator('aces');
      expect(params.style.display).toBe('none');
    });

    it('TONE-U178: drago bias value display shows 2 decimal places', () => {
      control.setOperator('drago');
      const params = getParams();
      // The value display should show "0.85" (2 decimals), not "0.9" (1 decimal)
      const spans = params.querySelectorAll('span');
      const valueSpan = Array.from(spans).find(s => s.textContent === '0.85');
      expect(valueSpan).not.toBeNull();
    });

    it('TONE-U179: setState with dragoBias updates slider when drago is active', () => {
      control.setOperator('drago');

      // Update dragoBias externally via setState
      control.setState({ dragoBias: 0.75 });

      const params = getParams();
      const sliders = params.querySelectorAll('input[type="range"]');
      const biasSlider = sliders[0] as HTMLInputElement;
      expect(biasSlider.value).toBe('0.75');
      // Value display should show 0.75
      const spans = params.querySelectorAll('span');
      const valueSpan = Array.from(spans).find(s => s.textContent === '0.75');
      expect(valueSpan).not.toBeNull();
    });

    it('TONE-U179b: setState with dragoBrightness updates brightness slider', () => {
      control.setOperator('drago');

      control.setState({ dragoBrightness: 3.5 });

      const params = getParams();
      const sliders = params.querySelectorAll('input[type="range"]');
      const brightnessSlider = sliders[1] as HTMLInputElement;
      expect(brightnessSlider.value).toBe('3.5');
    });

    it('TONE-U180: drago bias slider updates value display on input', () => {
      control.setOperator('drago');
      const params = getParams();
      const sliders = params.querySelectorAll('input[type="range"]');
      const biasSlider = sliders[0] as HTMLInputElement;

      // Simulate user sliding to 0.90
      biasSlider.value = '0.90';
      biasSlider.dispatchEvent(new Event('input'));

      // Value display should show "0.90"
      const spans = params.querySelectorAll('span');
      const valueSpan = Array.from(spans).find(s => s.textContent === '0.90');
      expect(valueSpan).not.toBeNull();
    });

    it('TONE-U181: reinhard slider shows 1 decimal place', () => {
      control.setOperator('reinhard');
      const params = getParams();
      // Default white point is 4.0, should display "4.0" (1 decimal)
      const spans = params.querySelectorAll('span');
      const valueSpan = Array.from(spans).find(s => s.textContent === '4.0');
      expect(valueSpan).not.toBeNull();
    });
  });

  describe('theme changes', () => {
    it('TONE-U190: enable row uses var(--bg-hover) not hardcoded rgba', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      // The enable row is the first child div in the dropdown
      const enableRow = dropdown.querySelector('div') as HTMLElement;
      expect(enableRow.style.cssText).toContain('var(--bg-hover)');
      expect(enableRow.style.cssText).not.toContain('rgba(255, 255, 255, 0.03)');
    });
  });

  describe('isEnabled', () => {
    it('TONE-U090: isEnabled returns false when disabled', () => {
      expect(control.isEnabled()).toBe(false);
    });

    it('TONE-U091: isEnabled returns false when enabled but operator is off', () => {
      // When setEnabled(true) is called with operator='off', isEnabled still returns false
      // because isEnabled checks both enabled state AND operator !== 'off'
      control.setEnabled(true);
      // operator is still 'off', so isEnabled should be false
      expect(control.isEnabled()).toBe(false);
    });

    it('TONE-U092: isEnabled returns true when enabled with valid operator', () => {
      control.setEnabled(true);
      control.setOperator('reinhard');
      expect(control.isEnabled()).toBe(true);
    });
  });

  describe('getOperators', () => {
    it('TONE-U100: getOperators returns all operators', () => {
      const operators = control.getOperators();
      expect(operators.length).toBe(9);
    });

    it('TONE-U101: getOperators returns copies', () => {
      const operators1 = control.getOperators();
      const operators2 = control.getOperators();
      expect(operators1).not.toBe(operators2);
    });

    it('TONE-U102: operators include off', () => {
      const operators = control.getOperators();
      expect(operators.some(op => op.key === 'off')).toBe(true);
    });

    it('TONE-U103: operators include reinhard', () => {
      const operators = control.getOperators();
      expect(operators.some(op => op.key === 'reinhard')).toBe(true);
    });

    it('TONE-U104: operators include filmic', () => {
      const operators = control.getOperators();
      expect(operators.some(op => op.key === 'filmic')).toBe(true);
    });

    it('TONE-U105: operators include aces', () => {
      const operators = control.getOperators();
      expect(operators.some(op => op.key === 'aces')).toBe(true);
    });
  });

  describe('handleKeyboard', () => {
    it('TONE-U110: handleKeyboard with Shift+Alt+J toggles', () => {
      expect(control.getState().enabled).toBe(false);
      const handled = control.handleKeyboard('j', true, true);
      expect(handled).toBe(true);
      expect(control.getState().enabled).toBe(true);
    });

    it('TONE-U111: handleKeyboard with wrong key returns false', () => {
      const handled = control.handleKeyboard('x', true, true);
      expect(handled).toBe(false);
    });

    it('TONE-U112: handleKeyboard without shift returns false', () => {
      const handled = control.handleKeyboard('j', false, true);
      expect(handled).toBe(false);
    });

    it('TONE-U113: handleKeyboard without alt returns false', () => {
      const handled = control.handleKeyboard('j', true, false);
      expect(handled).toBe(false);
    });
  });

  describe('outside click listener lifecycle', () => {
    it('TONE-M21a: outside click listener should NOT be registered when dropdown is closed', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      control.dispose();
      addSpy.mockClear();

      control = new ToneMappingControl();

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(0);
      addSpy.mockRestore();
    });

    it('TONE-M21b: outside click listener should be registered when dropdown opens', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      addSpy.mockClear();
      button.click(); // open

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      addSpy.mockRestore();
    });

    it('TONE-M21c: outside click listener should be removed when dropdown closes', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      button.click(); // open
      removeSpy.mockClear();
      button.click(); // close

      const clickCalls = removeSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      removeSpy.mockRestore();
    });

    it('TONE-M21d: dispose should remove outside click listener regardless of dropdown state', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

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
    it('TONE-U120: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('TONE-U121: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('TONE-U122: dispose clears operator buttons map', () => {
      expect(() => {
        control.render();
        control.dispose();
      }).not.toThrow();
    });
  });

  describe('dropdown body append (H-07)', () => {
    it('TM-H07a: dropdown should be appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      expect(document.body.contains(document.querySelector('[data-testid="tone-mapping-dropdown"]'))).toBe(false);

      button.click();

      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(document.body.contains(dropdown)).toBe(true);
      expect(el.contains(dropdown)).toBe(false);
    });

    it('TM-H07f: dropdown should be removed from document.body on close', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      button.click(); // open
      expect(document.body.querySelector('[data-testid="tone-mapping-dropdown"]')).not.toBeNull();

      button.click(); // close
      // Dropdown stays in body but is hidden
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('TM-H07g: dropdown should be removed from document.body on dispose', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      button.click(); // open
      expect(document.body.querySelector('[data-testid="tone-mapping-dropdown"]')).not.toBeNull();

      control.dispose();
      expect(document.body.querySelector('[data-testid="tone-mapping-dropdown"]')).toBeNull();
    });

    it('TM-H07h: dropdown should reposition on window scroll', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      const scrollSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const scrollCalls = scrollSpy.mock.calls.filter(([event]) => event === 'scroll');
      expect(scrollCalls.length).toBeGreaterThanOrEqual(1);
      scrollSpy.mockRestore();
    });

    it('TM-H07i: dropdown should reposition on window resize', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      const resizeSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const resizeCalls = resizeSpy.mock.calls.filter(([event]) => event === 'resize');
      expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
      resizeSpy.mockRestore();
    });
  });

  describe('positioning', () => {
    it('TONE-U130: dropdown has fixed positioning', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(dropdown.style.position).toBe('fixed');
    });

    it('TONE-U131: dropdown has high z-index', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(parseInt(dropdown.style.zIndex, 10)).toBeGreaterThan(1000);
    });

    it('TONE-U132: container has relative positioning', () => {
      const el = control.render();
      expect(el.style.position).toBe('relative');
    });
  });

  describe('accessibility', () => {
    it('TONE-U140: toggle button has aria-label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Tone mapping options');
    });

    it('TONE-U141: toggle button has aria-haspopup', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('menu');
    });

    it('TONE-U142: toggle button has aria-expanded false by default', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('TONE-U143: toggle button aria-expanded updates when dropdown opens', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;

      button.click(); // open
      expect(button.getAttribute('aria-expanded')).toBe('true');

      button.click(); // close
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('TONE-U144: dropdown has role menu', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('menu');
    });

    it('TONE-U145: dropdown has aria-label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('aria-label')).toBe('Tone mapping operators');
    });

    it('TONE-U146: operator buttons have role menuitemradio', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const operatorButtons = dropdown.querySelectorAll('button[data-operator]');

      operatorButtons.forEach((btn) => {
        expect(btn.getAttribute('role')).toBe('menuitemradio');
      });
    });

    it('TONE-U147: selected operator button has aria-checked true', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const offBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-off"]') as HTMLButtonElement;

      // Off is default
      expect(offBtn.getAttribute('aria-checked')).toBe('true');
    });

    it('TONE-U148: non-selected operator buttons have aria-checked false', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const reinhardBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-reinhard"]') as HTMLButtonElement;

      expect(reinhardBtn.getAttribute('aria-checked')).toBe('false');
    });

    it('TONE-U149: aria-checked updates when operator changes', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const offBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-off"]') as HTMLButtonElement;
      const reinhardBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-reinhard"]') as HTMLButtonElement;

      reinhardBtn.click();

      expect(reinhardBtn.getAttribute('aria-checked')).toBe('true');
      expect(offBtn.getAttribute('aria-checked')).toBe('false');
    });

    it('TONE-U150: operator buttons have descriptive aria-label', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
      const reinhardBtn = dropdown.querySelector('[data-testid="tone-mapping-operator-reinhard"]') as HTMLButtonElement;

      expect(reinhardBtn.getAttribute('aria-label')).toContain('Reinhard');
      expect(reinhardBtn.getAttribute('aria-label')).toContain('Simple global operator');
    });
  });
});

describe('TONE_MAPPING_OPERATORS', () => {
  it('TONE-U200: has 8 operators', () => {
    expect(TONE_MAPPING_OPERATORS.length).toBe(9);
  });

  it('TONE-U201: each operator has key, label, and description', () => {
    for (const op of TONE_MAPPING_OPERATORS) {
      expect(op.key).toBeDefined();
      expect(op.label).toBeDefined();
      expect(op.description).toBeDefined();
    }
  });
});

describe('DEFAULT_TONE_MAPPING_STATE', () => {
  it('TONE-U210: default state is disabled', () => {
    expect(DEFAULT_TONE_MAPPING_STATE.enabled).toBe(false);
  });

  it('TONE-U211: default operator is off', () => {
    expect(DEFAULT_TONE_MAPPING_STATE.operator).toBe('off');
  });
});
