/**
 * OCIOControl Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OCIOControl } from './OCIOControl';
import { OCIOProcessor } from '../../color/OCIOProcessor';

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
  });

  afterEach(() => {
    if (control) {
      control.dispose();
    }
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
  });

  describe('localStorage persistence', () => {
    it('OCIO-C004: saves state to localStorage on state change', () => {
      control = new OCIOControl();
      control.setState({ enabled: true });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedValue = localStorageMock.setItem.mock.calls.find(
        (call) => call[0] === 'openrv-ocio-state'
      );
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
      const calls = localStorageMock.setItem.mock.calls.filter(
        (call) => call[0] === 'openrv-ocio-state'
      );
      expect(calls.length).toBeGreaterThan(0);

      const lastCall = calls[calls.length - 1];
      const savedState = JSON.parse(lastCall[1]);
      expect(savedState.enabled).toBe(true);
    });

    it('OCIO-C009: persists display/view configuration', () => {
      control = new OCIOControl();

      control.setState({ display: 'Rec.709', view: 'Raw' });

      const calls = localStorageMock.setItem.mock.calls.filter(
        (call) => call[0] === 'openrv-ocio-state'
      );
      const lastCall = calls[calls.length - 1];
      const savedState = JSON.parse(lastCall[1]);
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
  });
});
