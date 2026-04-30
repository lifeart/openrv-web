/**
 * OCIOControl Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OCIOControl } from './OCIOControl';
import { OCIOProcessor } from '../../color/ColorProcessingFacade';
import {
  resetOutsideClickRegistry,
  dispatchOutsideClick,
  dispatchOutsideEscape,
  expectRegistrationCount,
} from '../../utils/ui/__test-helpers__/outsideClickTestUtils';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('OCIOControl', () => {
  let control: OCIOControl;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    resetOutsideClickRegistry();
  });

  afterEach(() => {
    if (control) {
      control.dispose();
    }
    resetOutsideClickRegistry();
  });

  describe('OutsideClickRegistry integration (MED-25 Phase 3)', () => {
    it('OCIO-OCR-001: opening panel registers exactly 1 entry; closing deregisters', () => {
      control = new OCIOControl();
      document.body.appendChild(control.render());

      expectRegistrationCount(0);
      control.show();
      expectRegistrationCount(1);
      control.hide();
      expectRegistrationCount(0);
    });

    it('OCIO-OCR-002: outside click dismisses the panel', () => {
      control = new OCIOControl();
      document.body.appendChild(control.render());

      control.show();
      const panel = document.querySelector('[data-testid="ocio-panel"]') as HTMLElement;
      expect(panel.style.display).toBe('block');

      dispatchOutsideClick();

      expect(panel.style.display).toBe('none');
      expectRegistrationCount(0);
    });

    it('OCIO-OCR-NESTED-001: Escape dismisses inner DropdownMenu first, then the OCIO panel', () => {
      // Validates "innermost-wins" Escape semantics across nested popovers:
      // OCIOControl panel registers a top-level dismiss; opening one of its
      // child DropdownMenu popovers registers a SECOND dismiss. The first
      // Escape closes only the inner dropdown; a second Escape closes the
      // panel.
      control = new OCIOControl();
      document.body.appendChild(control.render());

      // Open the OCIO panel (registers dismiss #1).
      control.show();
      const panel = document.querySelector('[data-testid="ocio-panel"]') as HTMLElement;
      expect(panel.style.display).toBe('block');
      expectRegistrationCount(1);

      // Open one of the panel's child DropdownMenu popovers (the Config
      // selector). This registers dismiss #2 — the innermost.
      const configButton = panel.querySelector('[data-testid="ocio-config-select"]') as HTMLButtonElement;
      expect(configButton).not.toBeNull();
      configButton.click();
      expectRegistrationCount(2);

      // The DropdownMenu element is rendered inside the panel by default.
      // Locate the visible (display !== 'none') menu role=listbox.
      const dropdowns = Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"]'));
      const openDropdown = dropdowns.find((el) => el.style.display !== 'none');
      expect(openDropdown).toBeDefined();

      // First Escape: only the inner dropdown closes; panel stays open.
      dispatchOutsideEscape();
      expect(openDropdown!.style.display).toBe('none');
      expect(panel.style.display).toBe('block');
      expectRegistrationCount(1);

      // Second Escape: panel closes.
      dispatchOutsideEscape();
      expect(panel.style.display).toBe('none');
      expectRegistrationCount(0);
    });
  });

  describe('constructor', () => {
    it('OCIO-C001: creates control with default processor', () => {
      control = new OCIOControl();
      expect(control).toBeDefined();
      expect(control.getProcessor()).toBeInstanceOf(OCIOProcessor);
    });

    it('OCIO-C002: creates control with provided processor', () => {
      const processor = new OCIOProcessor();
      control = new OCIOControl(processor);
      expect(control.getProcessor()).toBe(processor);
    });

    it('OCIO-C003: renders container element', () => {
      control = new OCIOControl();
      const element = control.render();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('ocio-control-container');
    });

    it('OCIO-C003a: toggle button tooltip references the O shortcut', () => {
      control = new OCIOControl();
      const element = control.render();
      const button = element.querySelector('[data-testid="ocio-panel-button"]');
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect((button as HTMLButtonElement).title).toBe('Toggle OCIO color management panel (O)');
    });
  });

  describe('localStorage persistence', () => {
    it('OCIO-C004: saves state to localStorage on state change', () => {
      control = new OCIOControl();
      control.setState({ enabled: true });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedValue = localStorageMock.setItem.mock.calls.find((call) => call[0] === 'openrv-ocio-state');
      expect(savedValue).toBeDefined();
      const savedState = JSON.parse(savedValue![1]);
      expect(savedState.enabled).toBe(true);
    });

    it('OCIO-C005: loads state from localStorage on initialization', () => {
      // Pre-populate localStorage with saved state
      const savedState = {
        enabled: true,
        configName: 'srgb',
        inputColorSpace: 'sRGB',
        workingColorSpace: 'Linear sRGB',
        display: 'sRGB',
        view: 'Standard',
        look: 'None',
        lookDirection: 'forward',
      };
      localStorageMock.setItem('openrv-ocio-state', JSON.stringify(savedState));
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedState));

      control = new OCIOControl();
      const state = control.getState();

      expect(state.enabled).toBe(true);
      expect(state.configName).toBe('srgb');
    });

    it('OCIO-C006: handles corrupted localStorage data gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      // Should not throw
      expect(() => {
        control = new OCIOControl();
      }).not.toThrow();

      // Should use default state
      expect(control.isEnabled()).toBe(false);
    });

    it('OCIO-C007: handles localStorage not available', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      // Should not throw
      expect(() => {
        control = new OCIOControl();
      }).not.toThrow();
    });

    it('OCIO-C008: persists enabled state correctly', () => {
      control = new OCIOControl();

      // Enable OCIO
      control.setState({ enabled: true });

      // Check localStorage was updated
      const calls = localStorageMock.setItem.mock.calls.filter((call) => call[0] === 'openrv-ocio-state');
      expect(calls.length).toBeGreaterThan(0);

      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      const savedState = JSON.parse(lastCall![1]);
      expect(savedState.enabled).toBe(true);
    });

    it('OCIO-C009: persists display/view configuration', () => {
      control = new OCIOControl();

      control.setState({ display: 'Rec.709', view: 'Raw' });

      const calls = localStorageMock.setItem.mock.calls.filter((call) => call[0] === 'openrv-ocio-state');
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      const savedState = JSON.parse(lastCall![1]);
      expect(savedState.display).toBe('Rec.709');
      expect(savedState.view).toBe('Raw');
    });
  });

  describe('state management', () => {
    it('OCIO-C010: getState returns current state', () => {
      control = new OCIOControl();
      const state = control.getState();
      expect(state).toBeDefined();
      expect(typeof state.enabled).toBe('boolean');
    });

    it('OCIO-C011: setState updates state', () => {
      control = new OCIOControl();
      control.setState({ enabled: true, inputColorSpace: 'ACEScg' });
      const state = control.getState();
      expect(state.enabled).toBe(true);
      expect(state.inputColorSpace).toBe('ACEScg');
    });

    it('OCIO-C012: isEnabled returns correct value', () => {
      control = new OCIOControl();
      expect(control.isEnabled()).toBe(false);
      control.setState({ enabled: true });
      expect(control.isEnabled()).toBe(true);
    });

    it('OCIO-C013: reset restores default state', () => {
      control = new OCIOControl();
      control.setState({ enabled: true, inputColorSpace: 'ACEScg' });
      control.reset();
      const state = control.getState();
      expect(state.enabled).toBe(false);
      expect(state.inputColorSpace).toBe('Auto');
    });
  });

  describe('events', () => {
    it('OCIO-C014: emits stateChanged on state update', () => {
      control = new OCIOControl();
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setState({ enabled: true });

      expect(callback).toHaveBeenCalled();
    });

    it('OCIO-C015: emits visibilityChanged on show/hide', () => {
      control = new OCIOControl();
      const callback = vi.fn();
      control.on('visibilityChanged', callback);

      control.show();
      expect(callback).toHaveBeenCalledWith(true);

      control.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('dispose', () => {
    it('OCIO-C016: disposes without error', () => {
      control = new OCIOControl();
      expect(() => control.dispose()).not.toThrow();
    });

    it('OCIO-C017: dispose clears pending feedback timer', () => {
      control = new OCIOControl();
      // Simulate a pending feedback timer by setting internal state
      (control as any).feedbackTimer = setTimeout(() => {}, 5000);
      const spy = vi.spyOn(globalThis, 'clearTimeout');
      control.dispose();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('OCIO-C018: dispose deregisters from OutsideClickRegistry when open', () => {
      control = new OCIOControl();
      control.show();
      expectRegistrationCount(1);
      control.dispose();
      expectRegistrationCount(0);
    });

    it('OCIO-C019: dispose removes panel element from body', () => {
      control = new OCIOControl();
      control.show(); // this appends panel to document.body
      control.dispose();
      // Panel should no longer be in body
      const panels = document.querySelectorAll('.ocio-panel');
      expect(panels.length).toBe(0);
    });
  });
});
