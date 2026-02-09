import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PresentationMode } from './PresentationMode';

describe('PresentationMode', () => {
  let mode: PresentationMode;

  beforeEach(() => {
    mode = new PresentationMode();
    // Reset body cursor
    document.body.style.cursor = '';
  });

  afterEach(() => {
    // Dispose first while timer APIs are still available (fake or real)
    mode.dispose();
    // Then restore real timers
    try { vi.useRealTimers(); } catch { /* already real */ }
    document.body.style.cursor = '';
  });

  describe('initialization', () => {
    it('PM-U001: should initialize with enabled = false', () => {
      expect(mode.getState().enabled).toBe(false);
    });

    it('PM-U002: should initialize with default cursor hide delay of 3000ms', () => {
      expect(mode.getState().cursorHideDelay).toBe(3000);
    });

    it('PM-U003: should initialize with cursorAutoHide = true', () => {
      expect(mode.getState().cursorAutoHide).toBe(true);
    });
  });

  describe('toggle()', () => {
    it('PM-U004: should toggle enabled state from false to true', () => {
      mode.toggle();
      expect(mode.getState().enabled).toBe(true);
    });

    it('PM-U005: should toggle enabled state from true to false', () => {
      mode.setState({ enabled: true });
      mode.toggle();
      expect(mode.getState().enabled).toBe(false);
    });
  });

  describe('setElementsToHide()', () => {
    it('PM-U006: should store elements to hide', () => {
      const elements = [document.createElement('div'), document.createElement('div')];
      mode.setElementsToHide(elements);
      expect((mode as any).elementsToHide).toEqual(elements);
    });
  });

  describe('element visibility', () => {
    it('PM-U007: should hide elements when enabled', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      mode.setElementsToHide([element]);
      mode.setState({ enabled: true });
      expect(element.style.opacity).toBe('0');
      expect(element.style.pointerEvents).toBe('none');
      element.remove();
    });

    it('PM-U008: should show elements when disabled', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      mode.setElementsToHide([element]);
      mode.setState({ enabled: true });
      mode.setState({ enabled: false });
      expect(element.style.opacity).toBe('1');
      expect(element.style.pointerEvents).toBe('');
      element.remove();
    });
  });

  describe('cursor auto-hide', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('PM-U009: should hide cursor after delay when enabled', () => {
      mode.setState({ enabled: true, cursorAutoHide: true });

      vi.advanceTimersByTime(3000);

      expect(document.body.style.cursor).toBe('none');
    });

    it('PM-U010: should not hide cursor if cursorAutoHide is false', () => {
      mode.setState({ enabled: true, cursorAutoHide: false });

      vi.advanceTimersByTime(5000);

      expect(document.body.style.cursor).not.toBe('none');
    });

    it('PM-U011: should show cursor on mouse movement', () => {
      mode.setState({ enabled: true, cursorAutoHide: true });
      document.body.style.cursor = 'none';

      mode.handleMouseMove();

      expect(document.body.style.cursor).toBe('');
    });

    it('PM-U012: should reset timer on mouse movement', () => {
      mode.setState({ enabled: true, cursorAutoHide: true });

      vi.advanceTimersByTime(2000);
      mode.handleMouseMove();
      vi.advanceTimersByTime(2000);

      // Cursor should still be visible (timer was reset)
      expect(document.body.style.cursor).not.toBe('none');

      // After remaining delay, cursor should hide
      vi.advanceTimersByTime(1500);
      expect(document.body.style.cursor).toBe('none');
    });

    it('PM-U013: should not start cursor timer when not enabled', () => {
      mode.handleMouseMove();
      vi.advanceTimersByTime(5000);
      expect(document.body.style.cursor).not.toBe('none');
    });
  });

  describe('event emission', () => {
    it('PM-U014: should emit stateChanged when state changes', () => {
      const handler = vi.fn();
      mode.on('stateChanged', handler);

      mode.setState({ enabled: true });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('PM-U015: should emit stateChanged on toggle', () => {
      const handler = vi.fn();
      mode.on('stateChanged', handler);

      mode.toggle();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });
  });

  describe('dispose()', () => {
    it('PM-U016: should clear cursor timer on dispose', () => {
      vi.useFakeTimers();
      mode.setState({ enabled: true, cursorAutoHide: true });

      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      mode.dispose();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('PM-U017: should restore cursor on dispose', () => {
      vi.useFakeTimers();
      mode.setState({ enabled: true, cursorAutoHide: true });
      document.body.style.cursor = 'none';

      mode.dispose();

      expect(document.body.style.cursor).toBe('');
      vi.useRealTimers();
    });

    it('PM-U018: should remove mousemove listener on dispose', () => {
      vi.useFakeTimers();
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      mode.setState({ enabled: true });
      mode.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mousemove',
        expect.any(Function)
      );
      vi.useRealTimers();
    });
  });

  describe('state persistence', () => {
    it('PM-U019: should save cursor auto-hide preference', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      mode.savePreference();
      expect(setItemSpy).toHaveBeenCalledWith('openrv-cursor-autohide', 'true');
    });

    it('PM-U020: should load cursor auto-hide preference', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('false');
      mode.loadPreference();
      expect(mode.getState().cursorAutoHide).toBe(false);
    });

    it('PM-U021: should handle localStorage not available gracefully', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      // Should not throw
      expect(() => mode.loadPreference()).not.toThrow();
    });

    it('PM-U022: should handle localStorage setItem failure gracefully', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      // Should not throw
      expect(() => mode.savePreference()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('PM-U023: rapid toggle should not leave stale display:none on elements', () => {
      vi.useFakeTimers();
      const element = document.createElement('div');
      document.body.appendChild(element);
      mode.setElementsToHide([element]);

      // Enter presentation mode
      mode.setState({ enabled: true });
      expect(element.style.opacity).toBe('0');

      // Immediately exit before the 300ms transition timer fires
      mode.setState({ enabled: false });
      expect(element.style.display).toBe('');

      // Advance past the transition timeout - display should still be ''
      vi.advanceTimersByTime(500);
      expect(element.style.display).toBe('');

      element.remove();
    });

    it('PM-U024: setState with same enabled value should not re-trigger enter/exit', () => {
      vi.useFakeTimers();
      const element = document.createElement('div');
      document.body.appendChild(element);
      mode.setElementsToHide([element]);
      const addListenerSpy = vi.spyOn(document, 'addEventListener');

      // Enable once
      mode.setState({ enabled: true });
      const callCount = addListenerSpy.mock.calls.filter(
        ([event]) => event === 'mousemove'
      ).length;

      // Set enabled: true again - should not re-enter
      mode.setState({ enabled: true });
      const newCallCount = addListenerSpy.mock.calls.filter(
        ([event]) => event === 'mousemove'
      ).length;

      expect(newCallCount).toBe(callCount);

      element.remove();
    });

    it('PM-U025: dispose while in presentation mode should restore elements and cursor', () => {
      vi.useFakeTimers();
      const element = document.createElement('div');
      document.body.appendChild(element);
      mode.setElementsToHide([element]);
      mode.setState({ enabled: true });

      // Advance timers so the element gets display:none
      vi.advanceTimersByTime(300);
      expect(element.style.display).toBe('none');

      // Cursor is hidden
      document.body.style.cursor = 'none';

      mode.dispose();

      // Cursor should be restored
      expect(document.body.style.cursor).toBe('');

      // Hidden elements should be fully restored
      expect(element.style.display).toBe('');
      expect(element.style.opacity).toBe('');
      expect(element.style.pointerEvents).toBe('');
      expect(element.style.transition).toBe('');
      expect(element.getAttribute('aria-hidden')).toBeNull();

      element.remove();
    });

    it('PM-U026: should set aria-hidden on elements when entering presentation mode', () => {
      vi.useFakeTimers();
      const element = document.createElement('div');
      document.body.appendChild(element);
      mode.setElementsToHide([element]);

      mode.setState({ enabled: true });
      expect(element.getAttribute('aria-hidden')).toBe('true');

      mode.setState({ enabled: false });
      expect(element.getAttribute('aria-hidden')).toBeNull();

      element.remove();
    });

    it('PM-U027: changing cursorHideDelay while enabled should use new delay', () => {
      vi.useFakeTimers();
      mode.setState({ enabled: true, cursorAutoHide: true, cursorHideDelay: 3000 });

      // Change delay to 1000ms
      mode.setState({ cursorHideDelay: 1000 });

      // After 1000ms cursor should hide (using new delay from resetCursorTimer)
      vi.advanceTimersByTime(1000);
      expect(document.body.style.cursor).toBe('none');
    });

    it('PM-U028: getState should return a copy, not a reference', () => {
      const state1 = mode.getState();
      state1.enabled = true;
      const state2 = mode.getState();
      expect(state2.enabled).toBe(false);
    });
  });

  describe('DOM cleanup', () => {
    it('PM-U029: dispose should remove the screen reader announcer element', () => {
      vi.useFakeTimers();
      // Enter presentation mode to trigger announcer creation
      mode.setElementsToHide([]);
      mode.setState({ enabled: true });

      // Verify announcer was created
      const announcer = document.getElementById('openrv-sr-announcer');
      expect(announcer).not.toBeNull();

      mode.dispose();

      // Announcer should be removed from DOM
      expect(document.getElementById('openrv-sr-announcer')).toBeNull();
      vi.useRealTimers();
    });

    it('PM-U030: dispose should handle missing announcer element gracefully', () => {
      // Dispose without ever entering presentation mode (no announcer created)
      expect(() => mode.dispose()).not.toThrow();
      expect(document.getElementById('openrv-sr-announcer')).toBeNull();
    });

    it('PM-U031: dispose should remove announcer even if created by earlier enter/exit cycle', () => {
      vi.useFakeTimers();
      mode.setElementsToHide([]);
      // Enter and exit to create announcer
      mode.setState({ enabled: true });
      mode.setState({ enabled: false });

      // Announcer should still exist after exiting (it was created but not cleaned up until dispose)
      expect(document.getElementById('openrv-sr-announcer')).not.toBeNull();

      mode.dispose();
      expect(document.getElementById('openrv-sr-announcer')).toBeNull();
      vi.useRealTimers();
    });
  });
});
