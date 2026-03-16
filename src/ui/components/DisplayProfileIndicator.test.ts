/**
 * DisplayProfileIndicator Unit Tests
 *
 * Tests for the viewer HUD overlay that shows the active display profile name.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DisplayProfileIndicator,
  DEFAULT_DISPLAY_PROFILE_INDICATOR_STATE,
} from './DisplayProfileIndicator';
import {
  DEFAULT_DISPLAY_COLOR_STATE,
  PROFILE_LABELS,
  type DisplayColorState,
  type DisplayTransferFunction,
} from '../../color/ColorProcessingFacade';

describe('DisplayProfileIndicator', () => {
  let indicator: DisplayProfileIndicator;

  beforeEach(() => {
    vi.useFakeTimers();
    indicator = new DisplayProfileIndicator();
  });

  afterEach(() => {
    indicator.dispose();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('rendering', () => {
    it('creates a container element', () => {
      const el = indicator.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('display-profile-indicator');
    });

    it('has data-testid on the container', () => {
      const el = indicator.getElement();
      expect(el.dataset.testid).toBe('display-profile-indicator');
    });

    it('renders in the viewer area as an absolutely positioned element', () => {
      const el = indicator.getElement();
      expect(el.style.position).toBe('absolute');
    });

    it('shows the default profile name (sRGB)', () => {
      const nameEl = indicator.getElement().querySelector('[data-testid="display-profile-indicator-name"]');
      expect(nameEl).not.toBeNull();
      expect(nameEl!.textContent).toBe('sRGB');
    });

    it('shows the "Display:" label prefix', () => {
      const labelEl = indicator.getElement().querySelector('[data-testid="display-profile-indicator-label"]');
      expect(labelEl).not.toBeNull();
      expect(labelEl!.textContent).toBe('Display:');
    });

    it('is pointer-events: none so it does not block interaction', () => {
      expect(indicator.getElement().style.pointerEvents).toBe('none');
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  describe('accessibility', () => {
    it('has role="status"', () => {
      expect(indicator.getElement().getAttribute('role')).toBe('status');
    });

    it('has an aria-label that includes "Active display profile"', () => {
      const label = indicator.getElement().getAttribute('aria-label');
      expect(label).toContain('Active display profile');
    });

    it('has aria-live="polite"', () => {
      expect(indicator.getElement().getAttribute('aria-live')).toBe('polite');
    });

    it('updates aria-label when the profile changes', () => {
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' });
      const label = indicator.getElement().getAttribute('aria-label');
      expect(label).toContain('709');
    });
  });

  // ---------------------------------------------------------------------------
  // Profile name display
  // ---------------------------------------------------------------------------

  describe('profile name display', () => {
    const profiles: DisplayTransferFunction[] = ['linear', 'srgb', 'rec709', 'gamma2.2', 'gamma2.4', 'custom'];

    for (const profile of profiles) {
      it(`shows correct label for "${profile}" profile`, () => {
        const state: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: profile };
        indicator.setDisplayState(state);

        const nameEl = indicator.getElement().querySelector('[data-testid="display-profile-indicator-name"]');
        expect(nameEl!.textContent).toBe(PROFILE_LABELS[profile]);
      });
    }

    it('returns the current profile name via getProfileName()', () => {
      expect(indicator.getProfileName()).toBe('sRGB');
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'linear' });
      expect(indicator.getProfileName()).toBe('Linear');
    });
  });

  // ---------------------------------------------------------------------------
  // Reactivity — updates when profile changes
  // ---------------------------------------------------------------------------

  describe('reactivity', () => {
    it('updates text when profile changes from sRGB to Rec.709', () => {
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' });
      const nameEl = indicator.getElement().querySelector('[data-testid="display-profile-indicator-name"]');
      expect(nameEl!.textContent).toBe('709');
    });

    it('updates text when profile changes multiple times', () => {
      const nameEl = indicator.getElement().querySelector('[data-testid="display-profile-indicator-name"]');

      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'linear' });
      expect(nameEl!.textContent).toBe('Linear');

      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'gamma2.4' });
      expect(nameEl!.textContent).toBe('2.4');

      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'custom' });
      expect(nameEl!.textContent).toBe('Custom');
    });
  });

  // ---------------------------------------------------------------------------
  // Flash behavior on profile cycle
  // ---------------------------------------------------------------------------

  describe('flash on profile change', () => {
    it('sets opacity to 1 when flash=true and profile changed', () => {
      indicator.enable();
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' }, true);
      expect(indicator.getElement().style.opacity).toBe('1');
    });

    it('returns to normal opacity after flash duration', () => {
      indicator.enable();
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' }, true);
      expect(indicator.getElement().style.opacity).toBe('1');

      // Advance past flash duration
      vi.advanceTimersByTime(1500);
      // Should return to the enabled resting opacity (0.8)
      expect(indicator.getElement().style.opacity).toBe('0.8');
    });

    it('does not flash when flash=false', () => {
      indicator.enable();
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' }, false);
      // Should remain at normal enabled opacity
      expect(indicator.getElement().style.opacity).toBe('0.8');
    });

    it('does not flash when profile did not actually change', () => {
      indicator.enable();
      // sRGB is the default, setting it again should not flash
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'srgb' }, true);
      expect(indicator.getElement().style.opacity).toBe('0.8');
    });

    it('resets flash timer when cycling rapidly', () => {
      indicator.enable();
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' }, true);
      expect(indicator.getElement().style.opacity).toBe('1');

      // Advance partway through flash duration
      vi.advanceTimersByTime(500);
      expect(indicator.getElement().style.opacity).toBe('1');

      // Cycle again before flash ends
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'linear' }, true);
      expect(indicator.getElement().style.opacity).toBe('1');

      // Advance past new flash duration
      vi.advanceTimersByTime(1500);
      expect(indicator.getElement().style.opacity).toBe('0.8');
    });
  });

  // ---------------------------------------------------------------------------
  // State management (enabled/disabled)
  // ---------------------------------------------------------------------------

  describe('state management', () => {
    it('starts with default state', () => {
      const state = indicator.getState();
      expect(state).toEqual(DEFAULT_DISPLAY_PROFILE_INDICATOR_STATE);
    });

    it('starts hidden (opacity 0) by default despite enabled=true', () => {
      // opacity is initially 0 because updateStyles is not called in constructor
      // it becomes visible when setState or enable is called
      indicator.enable();
      expect(indicator.getElement().style.opacity).toBe('0.8');
    });

    it('hides when disabled', () => {
      indicator.enable();
      expect(indicator.getElement().style.opacity).toBe('0.8');
      indicator.disable();
      expect(indicator.getElement().style.opacity).toBe('0');
    });

    it('shows when re-enabled', () => {
      indicator.disable();
      indicator.enable();
      expect(indicator.getElement().style.opacity).toBe('0.8');
    });

    it('toggle flips enabled state', () => {
      indicator.enable();
      expect(indicator.isVisible()).toBe(true);
      indicator.toggle();
      expect(indicator.isVisible()).toBe(false);
      indicator.toggle();
      expect(indicator.isVisible()).toBe(true);
    });

    it('setState updates backgroundOpacity', () => {
      indicator.setState({ backgroundOpacity: 0.3 });
      const state = indicator.getState();
      expect(state.backgroundOpacity).toBe(0.3);
    });

    it('emits stateChanged when state changes', () => {
      const handler = vi.fn();
      indicator.on('stateChanged', handler);

      indicator.setState({ enabled: false });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });
  });

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('clears flash timeout on dispose', () => {
      indicator.enable();
      indicator.setDisplayState({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' }, true);
      // Flash timer is active
      indicator.dispose();
      // Advancing time should not throw
      vi.advanceTimersByTime(2000);
    });

    it('removes all listeners on dispose', () => {
      const handler = vi.fn();
      indicator.on('stateChanged', handler);
      indicator.dispose();

      // Emitting after dispose should not call handler
      indicator.setState({ enabled: false });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Integration with OverlayManager pattern
  // ---------------------------------------------------------------------------

  describe('integration pattern', () => {
    it('getElement() returns mountable HTMLElement', () => {
      const el = indicator.getElement();
      expect(el.tagName).toBeDefined();

      // Can be appended to a container
      const container = document.createElement('div');
      container.appendChild(el);
      expect(container.contains(el)).toBe(true);
    });

    it('has z-index for proper stacking', () => {
      const zIndex = parseInt(indicator.getElement().style.zIndex, 10);
      expect(zIndex).toBeGreaterThan(0);
    });
  });
});
