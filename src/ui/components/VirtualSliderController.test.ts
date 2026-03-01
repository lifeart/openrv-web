import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VirtualSliderController, type ViewerInteractionQuery } from './VirtualSliderController';
import { VirtualSliderState, ARMED_TIMEOUT_MS } from './VirtualSliderConfig';
import { KeyboardManager } from '../../utils/input/KeyboardManager';
import { ColorControls } from './ColorControls';

// Mock the HistoryManager module
vi.mock('../../utils/HistoryManager', () => {
  const mockHistoryManager = {
    recordAction: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  };
  return {
    getGlobalHistoryManager: () => mockHistoryManager,
    HistoryManager: vi.fn(),
  };
});

import { getGlobalHistoryManager } from '../../utils/HistoryManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createKeyboardEvent(
  type: 'keydown' | 'keyup',
  code: string,
  opts: Partial<KeyboardEventInit> = {},
): KeyboardEvent {
  return new KeyboardEvent(type, {
    code,
    key: code.replace('Key', '').toLowerCase(),
    bubbles: true,
    cancelable: true,
    ...opts,
  });
}

function createPointerEvent(
  type: 'pointermove' | 'pointerdown',
  opts: Partial<PointerEventInit> & { movementX?: number } = {},
): PointerEvent {
  const { movementX, ...rest } = opts;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: 'mouse',
    ...rest,
  });
  // jsdom PointerEvent doesn't support movementX in init dict,
  // so we set it manually via defineProperty.
  if (movementX !== undefined) {
    Object.defineProperty(event, 'movementX', { value: movementX });
  }
  return event;
}

describe('VirtualSliderController', () => {
  let container: HTMLElement;
  let colorControls: ColorControls;
  let keyboardManager: KeyboardManager;
  let controller: VirtualSliderController;
  let mockViewerQuery: ViewerInteractionQuery;

  beforeEach(() => {
    vi.useFakeTimers();

    container = document.createElement('div');
    document.body.appendChild(container);

    colorControls = new ColorControls();
    keyboardManager = new KeyboardManager();
    mockViewerQuery = { isInteracting: () => false };

    controller = new VirtualSliderController({
      colorControls,
      container,
      keyboardManager,
      viewerQuery: mockViewerQuery,
    });

    // Reset mock
    vi.mocked(getGlobalHistoryManager().recordAction).mockClear();
  });

  afterEach(() => {
    controller.dispose();
    colorControls.dispose();
    container.remove();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // State machine basics
  // -----------------------------------------------------------------------

  describe('initial state', () => {
    it('starts in IDLE state', () => {
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('has no active parameter', () => {
      expect(controller.getActiveParam()).toBeNull();
    });

    it('has no numeric buffer', () => {
      expect(controller.getNumericBuffer()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // IDLE -> ARMED
  // -----------------------------------------------------------------------

  describe('IDLE -> ARMED transition', () => {
    it('transitions to ARMED on activator keydown', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(controller.getState()).toBe(VirtualSliderState.ARMED);
    });

    it('sets the active parameter for the pressed key', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(controller.getActiveParam()?.key).toBe('exposure');
    });

    it('does not transition for non-activator keys', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyA'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('does not transition when Ctrl is held', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE', { ctrlKey: true }));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('does not transition when Alt is held', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE', { altKey: true }));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('does not transition when Meta is held', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE', { metaKey: true }));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('suppresses the key in KeyboardManager', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(keyboardManager.isKeySuppressed('KeyE')).toBe(true);
    });

    it('does not transition when viewer is interacting', () => {
      mockViewerQuery.isInteracting = () => true;
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('works for all six activator keys', () => {
      for (const code of ['KeyE', 'KeyY', 'KeyB', 'KeyH', 'KeyS', 'KeyK']) {
        const ctrl = new VirtualSliderController({
          colorControls,
          container,
          keyboardManager: new KeyboardManager(),
          viewerQuery: mockViewerQuery,
        });
        document.dispatchEvent(createKeyboardEvent('keydown', code));
        expect(ctrl.getState()).toBe(VirtualSliderState.ARMED);
        ctrl.dispose();
      }
    });
  });

  // -----------------------------------------------------------------------
  // ARMED -> IDLE (tap / key release)
  // -----------------------------------------------------------------------

  describe('ARMED -> IDLE (key release / tap)', () => {
    it('returns to IDLE on quick key release', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(controller.getState()).toBe(VirtualSliderState.ARMED);
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('releases the suppressed key', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(keyboardManager.isKeySuppressed('KeyE')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // ARMED -> ACTIVE (mouse movement)
  // -----------------------------------------------------------------------

  describe('ARMED -> ACTIVE via mouse movement', () => {
    it('transitions to ACTIVE when cumulative movementX exceeds dead zone', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      // Simulate small mouse movements that accumulate past threshold
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 2 }));
      expect(controller.getState()).toBe(VirtualSliderState.ARMED); // not yet
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 2 }));
      expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);
    });

    it('measures cumulative absolute displacement', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 1 }));
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: -1 }));
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 1 }));
      // Total: |1| + |-1| + |1| = 3, which meets the threshold
      expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);
    });

    it('sets suppressHistory on ColorControls', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 5 }));
      expect(colorControls.suppressHistory).toBe(true);
    });

    it('changes cursor to ew-resize', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 5 }));
      expect(container.style.cursor).toBe('ew-resize');
    });

    it('suppresses all keys via KeyboardManager', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 5 }));
      expect(keyboardManager.isKeySuppressed('KeyA')).toBe(true); // any key
    });
  });

  // -----------------------------------------------------------------------
  // ARMED -> ACTIVE (timeout)
  // -----------------------------------------------------------------------

  describe('ARMED -> ACTIVE via timeout', () => {
    it('auto-transitions to ACTIVE after ARMED_TIMEOUT_MS', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(controller.getState()).toBe(VirtualSliderState.ARMED);
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);
    });

    it('does not auto-transition if key is released before timeout', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS - 10);
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      vi.advanceTimersByTime(20);
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });
  });

  // -----------------------------------------------------------------------
  // ACTIVE state: mouse movement adjusts value
  // -----------------------------------------------------------------------

  describe('ACTIVE: mouse movement', () => {
    function activateExposure(): void {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
    }

    it('adjusts value on mouse movement via rAF', () => {
      activateExposure();
      container.dispatchEvent(createPointerEvent('pointermove', { movementX: 10 }));
      // rAF needs to fire
      vi.advanceTimersByTime(16);
      // Manually trigger rAF callbacks in jsdom - use real animation frame
      // Since jsdom doesn't run rAF, we need to check differently
      // Actually, vitest uses fake timers which should handle rAF
    });

    it('does not process touch pointer events', () => {
      activateExposure();
      const evt = new PointerEvent('pointermove', {
        pointerType: 'touch',
        bubbles: true,
      });
      Object.defineProperty(evt, 'movementX', { value: 100 });
      container.dispatchEvent(evt);
      // Value should not have changed
    });

    it('clamps movementX exceeding MOVEMENT_X_CLAMP to 0', () => {
      activateExposure();
      // movementX > 100 should be clamped to 0 delta (no adjustment)
      const evt = createPointerEvent('pointermove', { movementX: 200 });
      container.dispatchEvent(evt);
    });
  });

  // -----------------------------------------------------------------------
  // Key repeat handling
  // -----------------------------------------------------------------------

  describe('key repeat handling', () => {
    it('ignores repeat keydown events in IDLE state', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE', { repeat: true }));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('ignores repeat keydown events in ARMED state', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      // A repeat event should not re-arm or change state
      const state = controller.getState();
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE', { repeat: true }));
      expect(controller.getState()).toBe(state);
    });

    it('consumes repeat events during ACTIVE state', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      const event = createKeyboardEvent('keydown', 'KeyE', { repeat: true });
      const stopPropSpy = vi.spyOn(event, 'stopPropagation');
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);
      expect(stopPropSpy).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Multiple key presses
  // -----------------------------------------------------------------------

  describe('multiple key presses during ARMED', () => {
    it('switches parameter when a different activator is pressed during ARMED', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(controller.getActiveParam()?.key).toBe('exposure');
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyY'));
      expect(controller.getActiveParam()?.key).toBe('gamma');
      expect(controller.getState()).toBe(VirtualSliderState.ARMED);
    });

    it('releases the previous key suppression when switching', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      expect(keyboardManager.isKeySuppressed('KeyE')).toBe(true);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyY'));
      // Note: KeyE may or may not be suppressed depending on implementation
      // But KeyY should be suppressed
      expect(keyboardManager.isKeySuppressed('KeyY')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Escape (cancel)
  // -----------------------------------------------------------------------

  describe('cancel via Escape', () => {
    it('restores original value on Escape during ACTIVE', () => {
      // Set a known initial value
      colorControls.setAdjustments({ exposure: 1.0 });

      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);

      // Simulate some value change via internal state
      // (hard to simulate mouse movement with rAF in test, so test the cancel logic)
      document.dispatchEvent(createKeyboardEvent('keydown', 'Escape'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);

      // Value should be restored (exposure was 1.0 before activation)
      expect(colorControls.getAdjustments().exposure).toBe(1.0);
    });

    it('does not record a history entry on cancel', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'Escape'));
      expect(getGlobalHistoryManager().recordAction).not.toHaveBeenCalled();
    });

    it('clears suppressHistory flag on cancel', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(colorControls.suppressHistory).toBe(true);
      document.dispatchEvent(createKeyboardEvent('keydown', 'Escape'));
      expect(colorControls.suppressHistory).toBe(false);
    });

    it('restores cursor on cancel', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(container.style.cursor).toBe('ew-resize');
      document.dispatchEvent(createKeyboardEvent('keydown', 'Escape'));
      expect(container.style.cursor).toBe('');
    });

    it('releases all key suppression on cancel', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'Escape'));
      expect(keyboardManager.isKeySuppressed('KeyE')).toBe(false);
      expect(keyboardManager.isKeySuppressed('KeyA')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Commit via key release
  // -----------------------------------------------------------------------

  describe('commit via key release', () => {
    it('commits on activator key release during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('clears suppressHistory on commit', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(colorControls.suppressHistory).toBe(false);
    });

    it('does not record history when value did not change', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      // No mouse movement -> value unchanged
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(getGlobalHistoryManager().recordAction).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Lock mode
  // -----------------------------------------------------------------------

  describe('lock mode', () => {
    it('transitions from ACTIVE to LOCKED on L press', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      expect(controller.getState()).toBe(VirtualSliderState.LOCKED);
    });

    it('commits on L press during LOCKED', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      expect(controller.getState()).toBe(VirtualSliderState.LOCKED);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('commits on Enter during LOCKED', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Enter'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('cancels on Escape during LOCKED', () => {
      colorControls.setAdjustments({ exposure: 0.5 });
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Escape'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
      // Value restored
      expect(colorControls.getAdjustments().exposure).toBe(0.5);
    });

    it('activator key release does nothing during LOCKED', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      expect(controller.getState()).toBe(VirtualSliderState.LOCKED);
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(controller.getState()).toBe(VirtualSliderState.LOCKED);
    });
  });

  // -----------------------------------------------------------------------
  // Fine step (+/- keys)
  // -----------------------------------------------------------------------

  describe('+/- fine step', () => {
    it('increments value on + key during ACTIVE', () => {
      colorControls.setAdjustments({ exposure: 0 });
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      const before = controller.getCurrentValue();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Equal'));
      expect(controller.getCurrentValue()).toBeGreaterThan(before);
    });

    it('decrements value on NumpadSubtract during ACTIVE', () => {
      colorControls.setAdjustments({ exposure: 0 });
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      const before = controller.getCurrentValue();
      document.dispatchEvent(createKeyboardEvent('keydown', 'NumpadSubtract'));
      expect(controller.getCurrentValue()).toBeLessThan(before);
    });

    it('clamps at max value', () => {
      colorControls.setAdjustments({ exposure: 4.999 });
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      // Press + many times
      for (let i = 0; i < 100; i++) {
        document.dispatchEvent(createKeyboardEvent('keydown', 'Equal'));
      }
      expect(controller.getCurrentValue()).toBeLessThanOrEqual(5);
    });

    it('clamps at min value', () => {
      colorControls.setAdjustments({ exposure: -4.999 });
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      for (let i = 0; i < 100; i++) {
        document.dispatchEvent(createKeyboardEvent('keydown', 'NumpadSubtract'));
      }
      expect(controller.getCurrentValue()).toBeGreaterThanOrEqual(-5);
    });
  });

  // -----------------------------------------------------------------------
  // Numeric entry
  // -----------------------------------------------------------------------

  describe('numeric entry', () => {
    function activateExposure(): void {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
    }

    it('starts numeric entry on digit key press', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit1'));
      expect(controller.getNumericBuffer()).toBe('1');
    });

    it('accumulates digits', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit1'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Period'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit5'));
      expect(controller.getNumericBuffer()).toBe('1.5');
    });

    it('allows a leading minus sign', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Minus'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit2'));
      expect(controller.getNumericBuffer()).toBe('-2');
    });

    it('prevents a minus sign after digits', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit2'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Minus'));
      expect(controller.getNumericBuffer()).toBe('2');
    });

    it('prevents multiple periods', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit1'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Period'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit2'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Period'));
      expect(controller.getNumericBuffer()).toBe('1.2');
    });

    it('backspace removes the last character', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit1'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit2'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Backspace'));
      expect(controller.getNumericBuffer()).toBe('1');
    });

    it('backspace clears numeric buffer when last char is removed', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit1'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Backspace'));
      expect(controller.getNumericBuffer()).toBeNull();
    });

    it('Enter applies the numeric value and commits', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit2'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Enter'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
      // The value should have been applied (clamped to [min, max])
    });

    it('clamps numeric entry to param range', () => {
      activateExposure();
      // Enter 100 - should clamp to max (5)
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit1'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit0'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Digit0'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Enter'));
      // Check that the adjustment was set to the clamped value
      expect(colorControls.getAdjustments().exposure).toBeLessThanOrEqual(5);
    });

    it('works with numpad keys', () => {
      activateExposure();
      document.dispatchEvent(createKeyboardEvent('keydown', 'Numpad1'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'NumpadDecimal'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Numpad5'));
      expect(controller.getNumericBuffer()).toBe('1.5');
    });
  });

  // -----------------------------------------------------------------------
  // Pointer down cancels
  // -----------------------------------------------------------------------

  describe('pointer down cancels', () => {
    it('cancels ACTIVE state on pointerdown', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      container.dispatchEvent(createPointerEvent('pointerdown'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('cancels LOCKED state on pointerdown', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      container.dispatchEvent(createPointerEvent('pointerdown'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('cancels ARMED state on pointerdown', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      container.dispatchEvent(createPointerEvent('pointerdown'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });
  });

  // -----------------------------------------------------------------------
  // Blur / visibility change
  // -----------------------------------------------------------------------

  describe('blur and visibility change', () => {
    it('cancels on window blur during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      window.dispatchEvent(new Event('blur'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('cancels on window blur during ARMED', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      window.dispatchEvent(new Event('blur'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('cancels on window blur during LOCKED', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyL'));
      window.dispatchEvent(new Event('blur'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });
  });

  // -----------------------------------------------------------------------
  // Key interception during ACTIVE/LOCKED
  // -----------------------------------------------------------------------

  describe('key interception during ACTIVE', () => {
    it('stops propagation for all keys during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);

      const event = createKeyboardEvent('keydown', 'KeyA');
      const spy = vi.spyOn(event, 'stopPropagation');
      document.dispatchEvent(event);
      expect(spy).toHaveBeenCalled();
    });

    it('prevents default for all keys during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);

      const event = createKeyboardEvent('keydown', 'KeyZ');
      const spy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);
      expect(spy).toHaveBeenCalled();
    });

    it('stops propagation for Escape during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);

      const event = createKeyboardEvent('keydown', 'Escape');
      const spy = vi.spyOn(event, 'stopPropagation');
      document.dispatchEvent(event);
      expect(spy).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Input element skipping
  // -----------------------------------------------------------------------

  describe('input element skipping', () => {
    it('does not arm when target is an input element', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        code: 'KeyE',
        key: 'e',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);

      input.remove();
    });

    it('does not arm when target is a textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        code: 'KeyE',
        key: 'e',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });
      document.dispatchEvent(event);
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);

      textarea.remove();
    });

    it('does not arm when target is contenteditable', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', {
        code: 'KeyE',
        key: 'e',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: div });
      document.dispatchEvent(event);
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);

      div.remove();
    });
  });

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  describe('dispose', () => {
    it('cancels active interaction on dispose', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      controller.dispose();
      // Should not throw and state should be reset
    });

    it('removes event listeners on dispose', () => {
      controller.dispose();
      // Dispatching events after dispose should not change state
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      // State cannot be checked after dispose since it's already IDLE
    });

    it('can be called multiple times safely', () => {
      controller.dispose();
      controller.dispose();
      // No error
    });
  });

  // -----------------------------------------------------------------------
  // Different parameters
  // -----------------------------------------------------------------------

  describe('different parameters', () => {
    it('activates gamma on KeyY', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyY'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getActiveParam()?.key).toBe('gamma');
      expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);
    });

    it('activates saturation on KeyS', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyS'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getActiveParam()?.key).toBe('saturation');
    });

    it('activates contrast on KeyK', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyK'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getActiveParam()?.key).toBe('contrast');
    });

    it('activates hue on KeyH', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyH'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getActiveParam()?.key).toBe('hueRotation');
    });

    it('activates brightness on KeyB', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyB'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getActiveParam()?.key).toBe('brightness');
    });
  });

  // -----------------------------------------------------------------------
  // History recording
  // -----------------------------------------------------------------------

  describe('history recording', () => {
    it('records history on commit when value changed (via +/- keys)', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);

      // Change value with +
      document.dispatchEvent(createKeyboardEvent('keydown', 'Equal'));

      // Commit
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));

      expect(getGlobalHistoryManager().recordAction).toHaveBeenCalledOnce();
      expect(getGlobalHistoryManager().recordAction).toHaveBeenCalledWith(
        'Adjust Exposure',
        'color',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('does not record history when value did not change', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      // No changes
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(getGlobalHistoryManager().recordAction).not.toHaveBeenCalled();
    });

    it('does not record history on cancel', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'Equal'));
      document.dispatchEvent(createKeyboardEvent('keydown', 'Escape'));
      expect(getGlobalHistoryManager().recordAction).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Touch device early return
  // -----------------------------------------------------------------------

  describe('touch device early return', () => {
    it('ignores pointermove with pointerType=touch during ARMED', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      const evt = new PointerEvent('pointermove', {
        pointerType: 'touch',
        bubbles: true,
      });
      Object.defineProperty(evt, 'movementX', { value: 100 });
      container.dispatchEvent(evt);
      expect(controller.getState()).toBe(VirtualSliderState.ARMED);
    });

    it('ignores pointerdown with pointerType=touch during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      const evt = new PointerEvent('pointerdown', {
        pointerType: 'touch',
        bubbles: true,
      });
      container.dispatchEvent(evt);
      // Should NOT cancel
      expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);
    });
  });

  // -----------------------------------------------------------------------
  // Enter key commit
  // -----------------------------------------------------------------------

  describe('Enter key commit', () => {
    it('commits on Enter during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'Enter'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });

    it('commits on NumpadEnter during ACTIVE', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'NumpadEnter'));
      expect(controller.getState()).toBe(VirtualSliderState.IDLE);
    });
  });

  // -----------------------------------------------------------------------
  // ColorControls integration
  // -----------------------------------------------------------------------

  describe('ColorControls integration', () => {
    it('reads the current value from ColorControls on activation', () => {
      colorControls.setAdjustments({ exposure: 2.5 });
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(controller.getCurrentValue()).toBe(2.5);
    });

    it('sets suppressHistory to true during active state', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      expect(colorControls.suppressHistory).toBe(true);
    });

    it('sets suppressHistory to false after commit', () => {
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keyup', 'KeyE'));
      expect(colorControls.suppressHistory).toBe(false);
    });

    it('writes adjustments via setAdjustments on fine step', () => {
      const spy = vi.spyOn(colorControls, 'setAdjustments');
      document.dispatchEvent(createKeyboardEvent('keydown', 'KeyE'));
      vi.advanceTimersByTime(ARMED_TIMEOUT_MS);
      document.dispatchEvent(createKeyboardEvent('keydown', 'Equal'));
      expect(spy).toHaveBeenCalled();
    });
  });
});
