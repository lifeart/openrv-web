/**
 * DisplayProfileControl Unit Tests
 *
 * Tests for the display color management transfer function selector.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DisplayProfileControl } from './DisplayProfileControl';
import {
  DEFAULT_DISPLAY_COLOR_STATE,
  PROFILE_CYCLE_ORDER,
  isDisplayStateActive,
} from '../../color/DisplayTransfer';
import type { DisplayColorState } from '../../color/DisplayTransfer';

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('DisplayProfileControl', () => {
  let control: DisplayProfileControl;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (control) {
      control.dispose();
    }
  });

  // ========================================================================
  // 1. Default state is sRGB
  // ========================================================================
  describe('default state', () => {
    it('DPC-001: default transfer function is sRGB', () => {
      control = new DisplayProfileControl();
      expect(control.getState().transferFunction).toBe('srgb');
    });

    it('DPC-002: default display gamma is 1.0', () => {
      control = new DisplayProfileControl();
      expect(control.getState().displayGamma).toBe(1.0);
    });

    it('DPC-003: default display brightness is 1.0', () => {
      control = new DisplayProfileControl();
      expect(control.getState().displayBrightness).toBe(1.0);
    });

    it('DPC-004: default custom gamma is 2.2', () => {
      control = new DisplayProfileControl();
      expect(control.getState().customGamma).toBe(2.2);
    });

    it('DPC-005: default state matches DEFAULT_DISPLAY_COLOR_STATE', () => {
      control = new DisplayProfileControl();
      const state = control.getState();
      expect(state.transferFunction).toBe(DEFAULT_DISPLAY_COLOR_STATE.transferFunction);
      expect(state.displayGamma).toBe(DEFAULT_DISPLAY_COLOR_STATE.displayGamma);
      expect(state.displayBrightness).toBe(DEFAULT_DISPLAY_COLOR_STATE.displayBrightness);
      expect(state.customGamma).toBe(DEFAULT_DISPLAY_COLOR_STATE.customGamma);
    });

    it('DPC-006: render returns an HTMLElement', () => {
      control = new DisplayProfileControl();
      expect(control.render()).toBeInstanceOf(HTMLElement);
    });

    it('DPC-007: container has display-profile-control class', () => {
      control = new DisplayProfileControl();
      expect(control.render().className).toBe('display-profile-control');
    });

    it('DPC-008: toggle button exists in rendered element', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const btn = el.querySelector('[data-testid="display-profile-button"]');
      expect(btn).not.toBeNull();
    });

    it('DPC-009: dropdown is hidden by default', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="display-profile-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });
  });

  // ========================================================================
  // 2. Transfer function selection updates state
  // ========================================================================
  describe('transfer function selection', () => {
    it('DPC-010: setTransferFunction changes transfer function', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('rec709');
      expect(control.getState().transferFunction).toBe('rec709');
    });

    it('DPC-011: setTransferFunction emits stateChanged', () => {
      control = new DisplayProfileControl();
      const handler = vi.fn();
      control.on('stateChanged', handler);
      control.setTransferFunction('linear');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].transferFunction).toBe('linear');
    });

    it('DPC-012: setTransferFunction with same value does not emit', () => {
      control = new DisplayProfileControl();
      const handler = vi.fn();
      control.on('stateChanged', handler);
      control.setTransferFunction('srgb'); // already sRGB
      expect(handler).not.toHaveBeenCalled();
    });

    it('DPC-013: clicking profile button in dropdown updates state', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const rec709Btn = el.querySelector('[data-testid="display-profile-rec709"]') as HTMLButtonElement;
      rec709Btn.click();
      expect(control.getState().transferFunction).toBe('rec709');
    });

    it('DPC-014: selected profile button has aria-checked true', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const srgbBtn = el.querySelector('[data-testid="display-profile-srgb"]') as HTMLElement;
      expect(srgbBtn.getAttribute('aria-checked')).toBe('true');
    });

    it('DPC-015: non-selected profile button has aria-checked false', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const linearBtn = el.querySelector('[data-testid="display-profile-linear"]') as HTMLElement;
      expect(linearBtn.getAttribute('aria-checked')).toBe('false');
    });

    it('DPC-016: aria-checked updates after changing transfer function', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      control.setTransferFunction('gamma2.2');
      const gammaBtn = el.querySelector('[data-testid="display-profile-gamma2.2"]') as HTMLElement;
      const srgbBtn = el.querySelector('[data-testid="display-profile-srgb"]') as HTMLElement;
      expect(gammaBtn.getAttribute('aria-checked')).toBe('true');
      expect(srgbBtn.getAttribute('aria-checked')).toBe('false');
    });

    it('DPC-017: setState updates transfer function', () => {
      control = new DisplayProfileControl();
      control.setState({ transferFunction: 'gamma2.4' });
      expect(control.getState().transferFunction).toBe('gamma2.4');
    });

    it('DPC-018: setState updates display gamma', () => {
      control = new DisplayProfileControl();
      control.setState({ displayGamma: 2.0 });
      expect(control.getState().displayGamma).toBe(2.0);
    });

    it('DPC-019: setState updates display brightness', () => {
      control = new DisplayProfileControl();
      control.setState({ displayBrightness: 0.5 });
      expect(control.getState().displayBrightness).toBe(0.5);
    });

    it('DPC-020: setState with no changes does not emit', () => {
      control = new DisplayProfileControl();
      const handler = vi.fn();
      control.on('stateChanged', handler);
      control.setState({
        transferFunction: 'srgb',
        displayGamma: 1.0,
        displayBrightness: 1.0,
        customGamma: 2.2,
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('DPC-021: getState returns a copy, not the internal object', () => {
      control = new DisplayProfileControl();
      const a = control.getState();
      const b = control.getState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('DPC-022: all six profile buttons are present', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const buttons = el.querySelectorAll('button[data-profile]');
      expect(buttons.length).toBe(6);
    });
  });

  // ========================================================================
  // 3. Keyboard cycling (Shift+D)
  // ========================================================================
  describe('keyboard cycling (Shift+D)', () => {
    it('DPC-030: handleKeyboard with Shift+D returns true', () => {
      control = new DisplayProfileControl();
      const handled = control.handleKeyboard('D', true);
      expect(handled).toBe(true);
    });

    it('DPC-031: handleKeyboard with Shift+d (lowercase) returns true', () => {
      control = new DisplayProfileControl();
      const handled = control.handleKeyboard('d', true);
      expect(handled).toBe(true);
    });

    it('DPC-032: handleKeyboard without shift returns false', () => {
      control = new DisplayProfileControl();
      const handled = control.handleKeyboard('D', false);
      expect(handled).toBe(false);
    });

    it('DPC-033: handleKeyboard with wrong key returns false', () => {
      control = new DisplayProfileControl();
      const handled = control.handleKeyboard('x', true);
      expect(handled).toBe(false);
    });

    it('DPC-034: Shift+D cycles from sRGB to next profile', () => {
      control = new DisplayProfileControl();
      // sRGB is at index 1 in PROFILE_CYCLE_ORDER, next is rec709
      control.handleKeyboard('D', true);
      expect(control.getState().transferFunction).toBe('rec709');
    });

    it('DPC-035: Shift+D cycles through two profiles', () => {
      control = new DisplayProfileControl();
      control.handleKeyboard('D', true); // srgb -> rec709
      control.handleKeyboard('D', true); // rec709 -> gamma2.2
      expect(control.getState().transferFunction).toBe('gamma2.2');
    });
  });

  // ========================================================================
  // 4. Profile cycle order
  // ========================================================================
  describe('profile cycle order', () => {
    it('DPC-040: cycleProfile advances through PROFILE_CYCLE_ORDER', () => {
      control = new DisplayProfileControl();
      const startIdx = PROFILE_CYCLE_ORDER.indexOf('srgb');
      const expectedNext = PROFILE_CYCLE_ORDER[(startIdx + 1) % PROFILE_CYCLE_ORDER.length];
      control.cycleProfile();
      expect(control.getState().transferFunction).toBe(expectedNext);
    });

    it('DPC-041: cycling wraps from last to first', () => {
      control = new DisplayProfileControl();
      const lastProfile = PROFILE_CYCLE_ORDER[PROFILE_CYCLE_ORDER.length - 1]!;
      control.setTransferFunction(lastProfile);
      control.cycleProfile();
      expect(control.getState().transferFunction).toBe(PROFILE_CYCLE_ORDER[0]);
    });

    it('DPC-042: full cycle returns all profiles in order', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction(PROFILE_CYCLE_ORDER[0]!);
      const visited: string[] = [control.getState().transferFunction];
      for (let i = 0; i < PROFILE_CYCLE_ORDER.length; i++) {
        control.cycleProfile();
        visited.push(control.getState().transferFunction);
      }
      // After a full cycle, should be back to the start
      expect(visited[0]).toBe(visited[visited.length - 1]);
      // Intermediate values should match PROFILE_CYCLE_ORDER
      for (let i = 0; i < PROFILE_CYCLE_ORDER.length; i++) {
        expect(visited[i]).toBe(PROFILE_CYCLE_ORDER[i]);
      }
    });

    it('DPC-043: custom is not in PROFILE_CYCLE_ORDER', () => {
      expect(PROFILE_CYCLE_ORDER.includes('custom')).toBe(false);
    });

    it('DPC-044: cycleProfile from custom goes to linear (index 0 fallback)', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('custom');
      // 'custom' is not in PROFILE_CYCLE_ORDER, indexOf returns -1
      // (-1 + 1) % length = 0, so next is PROFILE_CYCLE_ORDER[0] = 'linear'
      control.cycleProfile();
      expect(control.getState().transferFunction).toBe(PROFILE_CYCLE_ORDER[0]);
    });
  });

  // ========================================================================
  // 5. Reset to defaults
  // ========================================================================
  describe('reset to defaults', () => {
    it('DPC-050: resetToDefaults restores transfer function', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('rec709');
      control.resetToDefaults();
      expect(control.getState().transferFunction).toBe('srgb');
    });

    it('DPC-051: resetToDefaults restores display gamma', () => {
      control = new DisplayProfileControl();
      control.setState({ displayGamma: 2.5 });
      control.resetToDefaults();
      expect(control.getState().displayGamma).toBe(1.0);
    });

    it('DPC-052: resetToDefaults restores display brightness', () => {
      control = new DisplayProfileControl();
      control.setState({ displayBrightness: 0.3 });
      control.resetToDefaults();
      expect(control.getState().displayBrightness).toBe(1.0);
    });

    it('DPC-053: resetToDefaults restores custom gamma', () => {
      control = new DisplayProfileControl();
      control.setState({ customGamma: 5.0 });
      control.resetToDefaults();
      expect(control.getState().customGamma).toBe(2.2);
    });

    it('DPC-054: resetToDefaults emits stateChanged', () => {
      control = new DisplayProfileControl();
      control.setState({ transferFunction: 'linear' });
      const handler = vi.fn();
      control.on('stateChanged', handler);
      control.resetToDefaults();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('DPC-055: resetToDefaults emits default state values', () => {
      control = new DisplayProfileControl();
      control.setState({ transferFunction: 'rec709', displayGamma: 3.0 });
      const handler = vi.fn();
      control.on('stateChanged', handler);
      control.resetToDefaults();
      const emitted = handler.mock.calls[0][0] as DisplayColorState;
      expect(emitted.transferFunction).toBe(DEFAULT_DISPLAY_COLOR_STATE.transferFunction);
      expect(emitted.displayGamma).toBe(DEFAULT_DISPLAY_COLOR_STATE.displayGamma);
      expect(emitted.displayBrightness).toBe(DEFAULT_DISPLAY_COLOR_STATE.displayBrightness);
      expect(emitted.customGamma).toBe(DEFAULT_DISPLAY_COLOR_STATE.customGamma);
    });

    it('DPC-056: clicking Reset to Defaults button triggers reset', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('gamma2.4');
      const el = control.render();
      const resetBtn = el.querySelector('[data-testid="display-profile-reset"]') as HTMLButtonElement;
      resetBtn.click();
      expect(control.getState().transferFunction).toBe('srgb');
    });
  });

  // ========================================================================
  // 6. State persistence (mock localStorage)
  // ========================================================================
  describe('state persistence', () => {
    it('DPC-060: setState persists to localStorage', () => {
      control = new DisplayProfileControl();
      control.setState({ transferFunction: 'rec709' });
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const calls = localStorageMock.setItem.mock.calls;
      const profileCall = calls.find(
        (call: [string, string]) => call[0] === 'openrv-display-profile',
      );
      expect(profileCall).toBeDefined();
      const stored = JSON.parse(profileCall![1]);
      expect(stored.transferFunction).toBe('rec709');
    });

    it('DPC-061: setTransferFunction persists to localStorage', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('linear');
      const calls = localStorageMock.setItem.mock.calls;
      const profileCall = calls.find(
        (call: [string, string]) => call[0] === 'openrv-display-profile',
      );
      expect(profileCall).toBeDefined();
      const stored = JSON.parse(profileCall![1]);
      expect(stored.transferFunction).toBe('linear');
    });

    it('DPC-062: constructor loads persisted state from localStorage', () => {
      const state: DisplayColorState = {
        transferFunction: 'gamma2.2',
        displayGamma: 1.5,
        displayBrightness: 0.8,
        customGamma: 3.0,
      };
      localStorageMock.setItem('openrv-display-profile', JSON.stringify(state));
      // Clear mock call tracking so we only see new calls
      vi.clearAllMocks();

      control = new DisplayProfileControl();
      expect(control.getState().transferFunction).toBe('gamma2.2');
      expect(control.getState().displayGamma).toBe(1.5);
      expect(control.getState().displayBrightness).toBe(0.8);
      expect(control.getState().customGamma).toBe(3.0);
    });

    it('DPC-063: missing localStorage defaults to sRGB', () => {
      // Store is already cleared in beforeEach
      control = new DisplayProfileControl();
      expect(control.getState().transferFunction).toBe('srgb');
    });

    it('DPC-064: invalid localStorage data defaults to sRGB', () => {
      localStorageMock.setItem('openrv-display-profile', 'not valid json!!!');
      control = new DisplayProfileControl();
      expect(control.getState().transferFunction).toBe('srgb');
    });

    it('DPC-065: resetToDefaults persists defaults to localStorage', () => {
      control = new DisplayProfileControl();
      control.setState({ transferFunction: 'linear' });
      vi.clearAllMocks();
      control.resetToDefaults();
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const calls = localStorageMock.setItem.mock.calls;
      const profileCall = calls.find(
        (call: [string, string]) => call[0] === 'openrv-display-profile',
      );
      expect(profileCall).toBeDefined();
      const stored = JSON.parse(profileCall![1]);
      expect(stored.transferFunction).toBe('srgb');
    });
  });

  // ========================================================================
  // 7. isDisplayStateActive detection
  // ========================================================================
  describe('isDisplayStateActive detection', () => {
    it('DPC-070: default sRGB state is not active', () => {
      expect(isDisplayStateActive(DEFAULT_DISPLAY_COLOR_STATE)).toBe(false);
    });

    it('DPC-071: non-sRGB transfer function is active', () => {
      expect(isDisplayStateActive({
        ...DEFAULT_DISPLAY_COLOR_STATE,
        transferFunction: 'linear',
      })).toBe(true);
    });

    it('DPC-072: non-default gamma is active', () => {
      expect(isDisplayStateActive({
        ...DEFAULT_DISPLAY_COLOR_STATE,
        displayGamma: 2.0,
      })).toBe(true);
    });

    it('DPC-073: non-default brightness is active', () => {
      expect(isDisplayStateActive({
        ...DEFAULT_DISPLAY_COLOR_STATE,
        displayBrightness: 0.5,
      })).toBe(true);
    });

    it('DPC-074: button has transparent background when state is default', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
      expect(button.style.background).toBe('transparent');
    });

    it('DPC-075: button has accent styling when state is active (non-sRGB)', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('linear');
      const el = control.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('DPC-076: button has accent styling when gamma is non-default', () => {
      control = new DisplayProfileControl();
      control.setState({ displayGamma: 2.0 });
      const el = control.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
      expect(button.style.cssText).toContain('var(--accent-primary)');
    });

    it('DPC-077: button reverts to transparent after reset', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('rec709');
      control.resetToDefaults();
      const el = control.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
      expect(button.style.background).toBe('transparent');
    });
  });

  // ========================================================================
  // 8. Custom gamma section visibility toggle
  // ========================================================================
  describe('custom gamma section visibility', () => {
    it('DPC-080: custom gamma section is hidden by default (sRGB)', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('none');
    });

    it('DPC-081: custom gamma section is visible when custom is selected', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('custom');
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('block');
    });

    it('DPC-082: custom gamma section hides when switching from custom to sRGB', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('custom');
      control.setTransferFunction('srgb');
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('none');
    });

    it('DPC-083: custom gamma section hides when switching to linear', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('custom');
      control.setTransferFunction('linear');
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('none');
    });

    it('DPC-084: custom gamma section hides after resetToDefaults', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('custom');
      control.resetToDefaults();
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('none');
    });

    it('DPC-085: setState with transferFunction custom shows custom gamma section', () => {
      control = new DisplayProfileControl();
      control.setState({ transferFunction: 'custom' });
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('block');
    });

    it('DPC-086: custom gamma section hidden for gamma2.2', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('gamma2.2');
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('none');
    });

    it('DPC-087: custom gamma section hidden for rec709', () => {
      control = new DisplayProfileControl();
      control.setTransferFunction('rec709');
      const el = control.render();
      const section = el.querySelector('[data-testid="display-custom-gamma-section"]') as HTMLElement;
      expect(section.style.display).toBe('none');
    });
  });

  // ========================================================================
  // Additional: Dropdown behavior
  // ========================================================================
  describe('dropdown behavior', () => {
    it('DPC-090: clicking toggle button opens dropdown', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLButtonElement;
      const dropdown = el.querySelector('[data-testid="display-profile-dropdown"]') as HTMLElement;
      button.click();
      expect(dropdown.style.display).toBe('block');
    });

    it('DPC-091: clicking toggle button twice closes dropdown', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLButtonElement;
      const dropdown = el.querySelector('[data-testid="display-profile-dropdown"]') as HTMLElement;
      button.click();
      button.click();
      expect(dropdown.style.display).toBe('none');
    });

    it('DPC-092: aria-expanded updates when dropdown opens', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('DPC-093: dropdown has role menu', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const dropdown = el.querySelector('[data-testid="display-profile-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('menu');
    });

    it('DPC-094: profile buttons have role menuitemradio', () => {
      control = new DisplayProfileControl();
      const el = control.render();
      const profileBtns = el.querySelectorAll('button[data-profile]');
      profileBtns.forEach((btn) => {
        expect(btn.getAttribute('role')).toBe('menuitemradio');
      });
    });
  });

  // ========================================================================
  // Additional: Dispose
  // ========================================================================
  describe('dispose', () => {
    it('DPC-100: dispose can be called without error', () => {
      control = new DisplayProfileControl();
      expect(() => control.dispose()).not.toThrow();
    });

    it('DPC-101: dispose can be called multiple times', () => {
      control = new DisplayProfileControl();
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
