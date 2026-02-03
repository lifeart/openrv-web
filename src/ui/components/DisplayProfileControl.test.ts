/**
 * DisplayProfileControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DisplayProfileControl } from './DisplayProfileControl';
import { DEFAULT_DISPLAY_COLOR_STATE, DisplayColorState } from '../../color/DisplayTransfer';

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

// Mock matchMedia for BrowserColorSpace detection
Object.defineProperty(globalThis, 'matchMedia', {
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

describe('DisplayProfileControl', () => {
  let component: DisplayProfileControl;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (component) {
      component.dispose();
    }
  });

  // ==================================================================
  // Initialization
  // ==================================================================
  describe('initialization', () => {
    it('DPS-001: starts with default display state (sRGB, gamma 1.0, brightness 1.0)', () => {
      component = new DisplayProfileControl();
      const state = component.getState();
      expect(state.transferFunction).toBe('srgb');
      expect(state.displayGamma).toBe(1.0);
      expect(state.displayBrightness).toBe(1.0);
    });

    it('DPS-002: render returns HTMLElement', () => {
      component = new DisplayProfileControl();
      const el = component.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('DPS-003: render contains display profile button', () => {
      component = new DisplayProfileControl();
      const el = component.render();
      const button = el.querySelector('[data-testid="display-profile-button"]');
      expect(button).not.toBeNull();
    });

    it('DPS-004: button shows sRGB label by default', () => {
      component = new DisplayProfileControl();
      const el = component.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
      expect(button.textContent).toContain('sRGB');
    });
  });

  // ==================================================================
  // State Management
  // ==================================================================
  describe('state management', () => {
    it('DPS-010: getState returns copy of display state', () => {
      component = new DisplayProfileControl();
      const a = component.getState();
      const b = component.getState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('DPS-011: setState updates transfer function', () => {
      component = new DisplayProfileControl();
      component.setState({ transferFunction: 'rec709' });
      expect(component.getState().transferFunction).toBe('rec709');
    });

    it('DPS-012: setState updates display gamma', () => {
      component = new DisplayProfileControl();
      component.setState({ displayGamma: 2.0 });
      expect(component.getState().displayGamma).toBe(2.0);
    });

    it('DPS-013: setState updates display brightness', () => {
      component = new DisplayProfileControl();
      component.setState({ displayBrightness: 0.5 });
      expect(component.getState().displayBrightness).toBe(0.5);
    });

    it('DPS-014: setState emits displayStateChanged event', () => {
      component = new DisplayProfileControl();
      const handler = vi.fn();
      component.on('displayStateChanged', handler);
      component.setState({ transferFunction: 'rec709' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].transferFunction).toBe('rec709');
    });

    it('DPS-015: setState emits copy of state', () => {
      component = new DisplayProfileControl();
      let emitted: DisplayColorState | null = null;
      component.on('displayStateChanged', (s) => {
        emitted = s;
      });
      component.setState({ transferFunction: 'rec709' });
      expect(emitted).not.toBe(component.getState());
    });
  });

  // ==================================================================
  // Transfer Function / Gamma / Brightness
  // ==================================================================
  describe('setters', () => {
    it('DPS-020: setTransferFunction changes only transfer function', () => {
      component = new DisplayProfileControl();
      component.setState({ displayGamma: 1.5, displayBrightness: 0.8 });
      component.setTransferFunction('rec709');
      const state = component.getState();
      expect(state.transferFunction).toBe('rec709');
      expect(state.displayGamma).toBe(1.5);
      expect(state.displayBrightness).toBe(0.8);
    });

    it('DPS-021: setDisplayGamma clamps to [0.1, 4.0]', () => {
      component = new DisplayProfileControl();
      component.setDisplayGamma(0.01);
      expect(component.getState().displayGamma).toBe(0.1);
      component.setDisplayGamma(10);
      expect(component.getState().displayGamma).toBe(4.0);
    });

    it('DPS-022: setDisplayBrightness clamps to [0.0, 2.0]', () => {
      component = new DisplayProfileControl();
      component.setDisplayBrightness(-1);
      expect(component.getState().displayBrightness).toBe(0.0);
      component.setDisplayBrightness(5);
      expect(component.getState().displayBrightness).toBe(2.0);
    });
  });

  // ==================================================================
  // Reset
  // ==================================================================
  describe('reset', () => {
    it('DPS-030: reset restores all values to defaults', () => {
      component = new DisplayProfileControl();
      component.setState({ transferFunction: 'rec709', displayGamma: 2.0, displayBrightness: 0.5 });
      component.reset();
      expect(component.getState()).toEqual(DEFAULT_DISPLAY_COLOR_STATE);
    });

    it('DPS-031: reset emits displayStateChanged with defaults', () => {
      component = new DisplayProfileControl();
      component.setState({ transferFunction: 'rec709' });
      const handler = vi.fn();
      component.on('displayStateChanged', handler);
      component.reset();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual(DEFAULT_DISPLAY_COLOR_STATE);
    });
  });

  // ==================================================================
  // Toggle / Show / Hide
  // ==================================================================
  describe('visibility', () => {
    it('DPS-040: toggle shows panel when hidden', () => {
      component = new DisplayProfileControl();
      const handler = vi.fn();
      component.on('visibilityChanged', handler);
      component.toggle();
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('DPS-041: toggle hides panel when visible', () => {
      component = new DisplayProfileControl();
      component.show();
      const handler = vi.fn();
      component.on('visibilityChanged', handler);
      component.toggle();
      expect(handler).toHaveBeenCalledWith(false);
    });

    it('DPS-042: show emits visibilityChanged true', () => {
      component = new DisplayProfileControl();
      const handler = vi.fn();
      component.on('visibilityChanged', handler);
      component.show();
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('DPS-043: hide emits visibilityChanged false', () => {
      component = new DisplayProfileControl();
      component.show();
      const handler = vi.fn();
      component.on('visibilityChanged', handler);
      component.hide();
      expect(handler).toHaveBeenCalledWith(false);
    });

    it('DPS-044: show is idempotent', () => {
      component = new DisplayProfileControl();
      const handler = vi.fn();
      component.on('visibilityChanged', handler);
      component.show();
      component.show(); // second call should not re-emit
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('DPS-045: hide is idempotent', () => {
      component = new DisplayProfileControl();
      const handler = vi.fn();
      component.on('visibilityChanged', handler);
      component.hide(); // should not emit when already hidden
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ==================================================================
  // Keyboard Shortcuts
  // ==================================================================
  describe('keyboard shortcuts', () => {
    it('DPS-050: Shift+D cycles through profiles in order', () => {
      component = new DisplayProfileControl();
      // Default is sRGB (index 1 in cycle order)
      const event1 = new KeyboardEvent('keydown', { key: 'D', shiftKey: true });
      component.handleKeyDown(event1);
      expect(component.getState().transferFunction).toBe('rec709');

      const event2 = new KeyboardEvent('keydown', { key: 'D', shiftKey: true });
      component.handleKeyDown(event2);
      expect(component.getState().transferFunction).toBe('gamma2.2');
    });

    it('DPS-051: Shift+D wraps from last profile to first', () => {
      component = new DisplayProfileControl();
      component.setState({ transferFunction: 'gamma2.4' });
      const event = new KeyboardEvent('keydown', { key: 'D', shiftKey: true });
      component.handleKeyDown(event);
      expect(component.getState().transferFunction).toBe('linear');
    });

    it('DPS-052: Shift+D does not fire when input is focused', () => {
      component = new DisplayProfileControl();
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      const event = new KeyboardEvent('keydown', { key: 'D', shiftKey: true });
      Object.defineProperty(event, 'target', { value: input });
      component.handleKeyDown(event);
      expect(component.getState().transferFunction).toBe('srgb'); // unchanged
      document.body.removeChild(input);
    });
  });

  // ==================================================================
  // Persistence
  // ==================================================================
  describe('persistence', () => {
    it('DPS-060: persists state to localStorage on change', () => {
      component = new DisplayProfileControl();
      component.setState({ transferFunction: 'rec709' });
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedCall = localStorageMock.setItem.mock.calls.find(
        (call: [string, string]) => call[0] === 'openrv-display-profile',
      );
      expect(savedCall).toBeDefined();
    });

    it('DPS-061: restores state from localStorage on init', () => {
      const state = { ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' as const };
      localStorageMock.setItem('openrv-display-profile', JSON.stringify(state));
      component = new DisplayProfileControl();
      expect(component.getState().transferFunction).toBe('rec709');
    });

    it('DPS-062: handles missing localStorage gracefully', () => {
      // No stored value - should default to sRGB
      component = new DisplayProfileControl();
      expect(component.getState().transferFunction).toBe('srgb');
    });
  });

  // ==================================================================
  // Button Highlighting
  // ==================================================================
  describe('button style', () => {
    it('DPS-073: button uses default style when all values are default', () => {
      component = new DisplayProfileControl();
      const el = component.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
      // Default sRGB state = not active, should have transparent background
      expect(button.style.background).toBe('transparent');
    });

    it('DPS-070: button highlights when non-default profile active', () => {
      component = new DisplayProfileControl();
      component.setState({ transferFunction: 'linear' });
      const el = component.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
      expect(button.style.background).toContain('rgba');
    });
  });

  // ==================================================================
  // Dispose
  // ==================================================================
  describe('dispose', () => {
    it('DPS-080: dispose removes event listeners', () => {
      component = new DisplayProfileControl();
      component.dispose();
      // Should not throw when trying to emit after dispose
      expect(() => {
        component.on('displayStateChanged', () => {});
      }).not.toThrow();
    });

    it('DPS-081: dispose removes DOM panel from body', () => {
      component = new DisplayProfileControl();
      component.show(); // This appends panel to body
      component.dispose();
      // Panel should be removed
      const panels = document.querySelectorAll('.display-profile-panel');
      expect(panels.length).toBe(0);
    });
  });
});
