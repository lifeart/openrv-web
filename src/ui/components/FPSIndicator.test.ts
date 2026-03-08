import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FPSIndicator, DEFAULT_FPS_INDICATOR_STATE, getFPSColor } from './FPSIndicator';
import type { FPSMeasurement } from '../../core/session/PlaybackEngine';
import { Session } from '../../core/session/Session';
import { PreferencesManager, CORE_PREFERENCE_STORAGE_KEYS } from '../../core/PreferencesManager';

function createMeasurement(overrides: Partial<FPSMeasurement> = {}): FPSMeasurement {
  return {
    targetFps: 24,
    effectiveTargetFps: 24,
    actualFps: 24,
    droppedFrames: 0,
    ratio: 1,
    playbackSpeed: 1,
    ...overrides,
  };
}

describe('FPSIndicator', () => {
  let session: Session;
  let indicator: FPSIndicator;
  let preferences: PreferencesManager;

  beforeEach(() => {
    // Clear persisted FPS indicator prefs so each test starts fresh
    try {
      localStorage.removeItem(CORE_PREFERENCE_STORAGE_KEYS.fpsIndicator);
    } catch {
      /* noop */
    }
    session = new Session();
    preferences = new PreferencesManager();
    indicator = new FPSIndicator(session, preferences);
  });

  afterEach(() => {
    indicator.dispose();
    try {
      localStorage.removeItem(CORE_PREFERENCE_STORAGE_KEYS.fpsIndicator);
    } catch {
      /* noop */
    }
  });

  // =================================================================
  // Default state
  // =================================================================

  describe('Default state', () => {
    it('FPS-001: default state matches DEFAULT_FPS_INDICATOR_STATE', () => {
      const state = indicator.getState();
      expect(state.enabled).toBe(DEFAULT_FPS_INDICATOR_STATE.enabled);
      expect(state.position).toBe('top-right');
      expect(state.showDroppedFrames).toBe(true);
      expect(state.showTargetFps).toBe(true);
      expect(state.backgroundOpacity).toBe(0.6);
      expect(state.warningThreshold).toBe(0.97);
      expect(state.criticalThreshold).toBe(0.85);
    });

    it('FPS-002: enabled by default for professional workflows', () => {
      expect(indicator.getState().enabled).toBe(true);
    });

    it('FPS-003: defaults to top-right position', () => {
      expect(indicator.getState().position).toBe('top-right');
    });

    it('FPS-004: container element has correct data-testid', () => {
      const el = indicator.getElement();
      expect(el.dataset.testid).toBe('fps-indicator');
    });

    it('FPS-005: container is initially hidden (display: none)', () => {
      const el = indicator.getElement();
      expect(el.style.display).toBe('none');
    });
  });

  // =================================================================
  // Enable/disable toggle
  // =================================================================

  describe('Enable/disable toggle', () => {
    it('FPS-010: toggle flips enabled state', () => {
      expect(indicator.getState().enabled).toBe(true);
      indicator.toggle();
      expect(indicator.getState().enabled).toBe(false);
      indicator.toggle();
      expect(indicator.getState().enabled).toBe(true);
    });

    it('FPS-011: enable() sets enabled to true', () => {
      indicator.disable();
      expect(indicator.getState().enabled).toBe(false);
      indicator.enable();
      expect(indicator.getState().enabled).toBe(true);
    });

    it('FPS-012: disable() sets enabled to false', () => {
      indicator.disable();
      expect(indicator.getState().enabled).toBe(false);
    });

    it('FPS-013: container display is none when disabled', () => {
      indicator.disable();
      expect(indicator.getElement().style.display).toBe('none');
    });

    it('FPS-014: emits stateChanged on toggle', () => {
      const handler = vi.fn();
      indicator.on('stateChanged', handler);
      indicator.toggle();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });
  });

  // =================================================================
  // Color coding
  // =================================================================

  describe('Color coding (getFPSColor)', () => {
    it('FPS-020: returns green when ratio >= warningThreshold', () => {
      expect(getFPSColor(1.0, 0.97, 0.85)).toBe('#4ade80');
      expect(getFPSColor(0.97, 0.97, 0.85)).toBe('#4ade80');
    });

    it('FPS-021: returns yellow when ratio between critical and warning', () => {
      expect(getFPSColor(0.96, 0.97, 0.85)).toBe('#facc15');
      expect(getFPSColor(0.9, 0.97, 0.85)).toBe('#facc15');
      expect(getFPSColor(0.85, 0.97, 0.85)).toBe('#facc15');
    });

    it('FPS-022: returns red when ratio < criticalThreshold', () => {
      expect(getFPSColor(0.84, 0.97, 0.85)).toBe('#ef4444');
      expect(getFPSColor(0.5, 0.97, 0.85)).toBe('#ef4444');
      expect(getFPSColor(0, 0.97, 0.85)).toBe('#ef4444');
    });

    it('FPS-023: uses raw effectiveFps for color, not smoothed (sudden drop shows red immediately)', () => {
      // Simulate several updates at 24fps (good)
      const goodMeasurement = createMeasurement({ actualFps: 24, ratio: 1.0 });
      session.emit('fpsUpdated', goodMeasurement);
      session.emit('fpsUpdated', goodMeasurement);
      session.emit('fpsUpdated', goodMeasurement);

      // Now sudden drop to 12fps
      const badMeasurement = createMeasurement({ actualFps: 12, ratio: 0.5 });
      session.emit('fpsUpdated', badMeasurement);

      // The raw ratio is 0.5, which is below critical threshold
      // Color should be red even though EMA display value is still converging
      const lastMeasurement = indicator.getLastMeasurement();
      expect(lastMeasurement).not.toBeNull();
      expect(lastMeasurement!.ratio).toBe(0.5);

      const color = getFPSColor(
        lastMeasurement!.ratio,
        indicator.getState().warningThreshold,
        indicator.getState().criticalThreshold,
      );
      expect(color).toBe('#ef4444'); // red

      // But the displayed FPS should still be converging (not exactly 12)
      const displayedFps = indicator.getDisplayedFps();
      expect(displayedFps).toBeGreaterThan(12);
    });
  });

  // =================================================================
  // Dropped frame counter
  // =================================================================

  describe('Dropped frame counter', () => {
    it('FPS-030: shows dropped frames when showDroppedFrames is true', () => {
      const measurement = createMeasurement({ droppedFrames: 5 });
      session.emit('fpsUpdated', measurement);

      const droppedEl = indicator.getElement().querySelector('[data-testid="fps-indicator-dropped"]') as HTMLElement;
      expect(droppedEl).not.toBeNull();
      // After rAF the text would be updated; check state
      expect(indicator.getLastMeasurement()!.droppedFrames).toBe(5);
    });

    it('FPS-031: hides dropped frame element when showDroppedFrames is false', () => {
      indicator.setState({ showDroppedFrames: false });
      const state = indicator.getState();
      expect(state.showDroppedFrames).toBe(false);
    });
  });

  // =================================================================
  // Position changes
  // =================================================================

  describe('Position changes', () => {
    it('FPS-040: setPosition updates position in state', () => {
      indicator.setPosition('bottom-left');
      expect(indicator.getState().position).toBe('bottom-left');
    });

    it('FPS-041: top-left position sets correct CSS properties', () => {
      indicator.setPosition('top-left');
      const el = indicator.getElement();
      expect(el.style.top).toBe('16px');
      expect(el.style.left).toBe('16px');
      expect(el.style.right).toBe('');
      expect(el.style.bottom).toBe('');
    });

    it('FPS-042: top-right position sets correct CSS properties', () => {
      indicator.setPosition('top-right');
      const el = indicator.getElement();
      expect(el.style.top).toBe('16px');
      expect(el.style.right).toBe('16px');
    });

    it('FPS-043: bottom-left position sets correct CSS properties', () => {
      indicator.setPosition('bottom-left');
      const el = indicator.getElement();
      expect(el.style.bottom).toBe('16px');
      expect(el.style.left).toBe('16px');
    });

    it('FPS-044: bottom-right position sets correct CSS properties', () => {
      indicator.setPosition('bottom-right');
      const el = indicator.getElement();
      expect(el.style.bottom).toBe('16px');
      expect(el.style.right).toBe('16px');
    });
  });

  // =================================================================
  // Auto-hide after pause
  // =================================================================

  describe('Auto-hide after pause', () => {
    it('FPS-050: shows indicator when playback starts', () => {
      indicator.enable();
      session.emit('playbackChanged', true);
      expect(indicator.getElement().style.display).toBe('block');
    });

    it('FPS-051: hides indicator 2 seconds after pause', () => {
      vi.useFakeTimers();
      indicator.enable();
      session.emit('playbackChanged', true);
      expect(indicator.getElement().style.display).toBe('block');

      session.emit('playbackChanged', false);
      // Still visible immediately after pause
      expect(indicator.getElement().style.display).toBe('block');

      // After 2 seconds, should be hidden
      vi.advanceTimersByTime(2000);
      expect(indicator.getElement().style.display).toBe('none');
      vi.useRealTimers();
    });

    it('FPS-052: cancels hide timeout if playback resumes', () => {
      vi.useFakeTimers();
      indicator.enable();
      session.emit('playbackChanged', true);
      session.emit('playbackChanged', false);

      // Resume before timeout
      vi.advanceTimersByTime(1000);
      session.emit('playbackChanged', true);

      // After the original timeout would have fired
      vi.advanceTimersByTime(1500);
      expect(indicator.getElement().style.display).toBe('block');
      vi.useRealTimers();
    });
  });

  // =================================================================
  // EMA smoothing
  // =================================================================

  describe('EMA smoothing', () => {
    it('FPS-060: first measurement sets displayedFps directly', () => {
      const measurement = createMeasurement({ actualFps: 24 });
      session.emit('fpsUpdated', measurement);
      expect(indicator.getDisplayedFps()).toBe(24);
    });

    it('FPS-061: subsequent measurements are EMA-smoothed', () => {
      session.emit('fpsUpdated', createMeasurement({ actualFps: 24 }));
      expect(indicator.getDisplayedFps()).toBe(24);

      session.emit('fpsUpdated', createMeasurement({ actualFps: 20 }));
      // EMA: 24 * 0.5 + 20 * 0.5 = 22
      expect(indicator.getDisplayedFps()).toBe(22);

      session.emit('fpsUpdated', createMeasurement({ actualFps: 20 }));
      // EMA: 22 * 0.5 + 20 * 0.5 = 21
      expect(indicator.getDisplayedFps()).toBe(21);
    });

    it('FPS-062: displayedFps converges toward actual value', () => {
      session.emit('fpsUpdated', createMeasurement({ actualFps: 24 }));

      // Keep sending 12 fps
      for (let i = 0; i < 10; i++) {
        session.emit('fpsUpdated', createMeasurement({ actualFps: 12 }));
      }

      // After 10 updates, should be very close to 12
      expect(indicator.getDisplayedFps()).toBeCloseTo(12, 0);
    });

    it('FPS-063: playback restart resets displayedFps', () => {
      session.emit('fpsUpdated', createMeasurement({ actualFps: 24 }));
      expect(indicator.getDisplayedFps()).toBe(24);

      // Simulate play -> pause -> play
      session.emit('playbackChanged', false);
      session.emit('playbackChanged', true);

      // After play restart, displayedFps should be reset
      expect(indicator.getDisplayedFps()).toBe(0);
    });
  });

  // =================================================================
  // Effective target display at non-1x speeds
  // =================================================================

  describe('Effective target at non-1x speeds', () => {
    it('FPS-070: measurement with speed 2 has effectiveTargetFps doubled', () => {
      const measurement = createMeasurement({
        targetFps: 24,
        effectiveTargetFps: 48,
        playbackSpeed: 2,
        actualFps: 48,
        ratio: 1,
      });
      session.emit('fpsUpdated', measurement);
      const last = indicator.getLastMeasurement();
      expect(last).not.toBeNull();
      expect(last!.effectiveTargetFps).toBe(48);
      expect(last!.playbackSpeed).toBe(2);
    });

    it('FPS-071: measurement with speed 0.5 has effectiveTargetFps halved', () => {
      const measurement = createMeasurement({
        targetFps: 24,
        effectiveTargetFps: 12,
        playbackSpeed: 0.5,
        actualFps: 12,
        ratio: 1,
      });
      session.emit('fpsUpdated', measurement);
      const last = indicator.getLastMeasurement();
      expect(last!.effectiveTargetFps).toBe(12);
      expect(last!.playbackSpeed).toBe(0.5);
    });
  });

  // =================================================================
  // abSourceChanged event
  // =================================================================

  describe('abSourceChanged event', () => {
    it('FPS-080: abSourceChanged triggers update schedule', () => {
      const scheduleSpy = vi.spyOn(indicator as any, 'scheduleUpdate');
      session.emit('abSourceChanged', { current: 'B', sourceIndex: 1 });
      expect(scheduleSpy).toHaveBeenCalled();
    });
  });

  // =================================================================
  // DisposableSubscriptionManager cleanup
  // =================================================================

  describe('Disposal', () => {
    it('FPS-090: dispose cleans up subscriptions', () => {
      const subs = (indicator as any).subs;
      expect(subs.isDisposed).toBe(false);
      indicator.dispose();
      expect(subs.isDisposed).toBe(true);
    });

    it('FPS-091: dispose removes event listeners', () => {
      indicator.dispose();
      expect(indicator.listenerCount()).toBe(0);
    });

    it('FPS-092: dispose clears hide timeout', () => {
      vi.useFakeTimers();
      indicator.enable();
      session.emit('playbackChanged', true);
      session.emit('playbackChanged', false);

      // Dispose before timeout fires
      indicator.dispose();

      // Advance past timeout - should not throw
      vi.advanceTimersByTime(3000);
      vi.useRealTimers();
    });

    it('FPS-093: no error when events fire after dispose', () => {
      indicator.dispose();
      // Should not throw
      expect(() => {
        session.emit('fpsUpdated', createMeasurement());
        session.emit('playbackChanged', true);
      }).not.toThrow();
    });
  });

  // =================================================================
  // setState
  // =================================================================

  describe('setState', () => {
    it('FPS-100: setState merges partial state', () => {
      indicator.setState({ warningThreshold: 0.9 });
      const state = indicator.getState();
      expect(state.warningThreshold).toBe(0.9);
      expect(state.criticalThreshold).toBe(0.85); // unchanged
    });

    it('FPS-101: setState emits stateChanged', () => {
      const handler = vi.fn();
      indicator.on('stateChanged', handler);
      indicator.setState({ position: 'bottom-left' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ position: 'bottom-left' }));
    });

    it('FPS-102: setBackgroundOpacity clamps to 0-1', () => {
      indicator.setBackgroundOpacity(1.5);
      expect(indicator.getState().backgroundOpacity).toBe(1);
      indicator.setBackgroundOpacity(-0.5);
      expect(indicator.getState().backgroundOpacity).toBe(0);
    });
  });

  // =================================================================
  // isVisible
  // =================================================================

  describe('isVisible', () => {
    it('FPS-110: isVisible returns true when enabled', () => {
      expect(indicator.isVisible()).toBe(true);
    });

    it('FPS-111: isVisible returns false when disabled', () => {
      indicator.disable();
      expect(indicator.isVisible()).toBe(false);
    });
  });
});
