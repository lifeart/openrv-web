/**
 * Signal Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Signal, ComputedSignal } from './Signal';

describe('Signal', () => {
  let signal: Signal<number>;

  beforeEach(() => {
    signal = new Signal<number>();
  });

  describe('connect', () => {
    it('subscribes callback to signal', () => {
      const callback = vi.fn();
      signal.connect(callback);

      signal.emit(42, 0);

      expect(callback).toHaveBeenCalledWith(42, 0);
    });

    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = signal.connect(callback);

      signal.emit(1, 0);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      signal.emit(2, 1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('allows multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      signal.connect(callback1);
      signal.connect(callback2);
      signal.connect(callback3);

      signal.emit(100, 0);

      expect(callback1).toHaveBeenCalledWith(100, 0);
      expect(callback2).toHaveBeenCalledWith(100, 0);
      expect(callback3).toHaveBeenCalledWith(100, 0);
    });
  });

  describe('disconnect', () => {
    it('removes callback from signal', () => {
      const callback = vi.fn();
      signal.connect(callback);

      signal.emit(1, 0);
      expect(callback).toHaveBeenCalledTimes(1);

      signal.disconnect(callback);
      signal.emit(2, 1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('only removes specific callback', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      signal.connect(callback1);
      signal.connect(callback2);

      signal.disconnect(callback1);
      signal.emit(1, 0);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(1, 0);
    });
  });

  describe('emit', () => {
    it('calls all callbacks with value and oldValue', () => {
      const callback = vi.fn();
      signal.connect(callback);

      signal.emit(10, 5);

      expect(callback).toHaveBeenCalledWith(10, 5);
    });

    it('handles callback errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();

      signal.connect(errorCallback);
      signal.connect(normalCallback);

      signal.emit(1, 0);

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('does nothing with no subscribers', () => {
      expect(() => signal.emit(1, 0)).not.toThrow();
    });
  });

  describe('disconnectAll', () => {
    it('removes all callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      signal.connect(callback1);
      signal.connect(callback2);

      signal.disconnectAll();
      signal.emit(1, 0);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('hasConnections', () => {
    it('returns false when empty', () => {
      expect(signal.hasConnections).toBe(false);
    });

    it('returns true when has connections', () => {
      signal.connect(() => {});
      expect(signal.hasConnections).toBe(true);
    });

    it('returns false after disconnectAll', () => {
      signal.connect(() => {});
      signal.disconnectAll();
      expect(signal.hasConnections).toBe(false);
    });
  });

  describe('with different types', () => {
    it('works with strings', () => {
      const stringSignal = new Signal<string>();
      const callback = vi.fn();
      stringSignal.connect(callback);

      stringSignal.emit('new', 'old');

      expect(callback).toHaveBeenCalledWith('new', 'old');
    });

    it('works with objects', () => {
      const objectSignal = new Signal<{ id: number; name: string }>();
      const callback = vi.fn();
      objectSignal.connect(callback);

      const newVal = { id: 1, name: 'test' };
      const oldVal = { id: 0, name: '' };
      objectSignal.emit(newVal, oldVal);

      expect(callback).toHaveBeenCalledWith(newVal, oldVal);
    });
  });
});

describe('ComputedSignal', () => {
  describe('initialization', () => {
    it('computes initial value', () => {
      const computed = new ComputedSignal(() => 10 + 5);
      expect(computed.value).toBe(15);
    });
  });

  describe('value', () => {
    it('returns computed value', () => {
      let multiplier = 2;
      const computed = new ComputedSignal(() => 10 * multiplier);

      expect(computed.value).toBe(20);
    });

    it('caches computed value', () => {
      const computeFn = vi.fn(() => Math.random());
      const computed = new ComputedSignal(computeFn);

      // Constructor calls compute once, then first access may call again
      const callCountAfterConstruct = computeFn.mock.calls.length;

      const first = computed.value;
      const second = computed.value;

      // Should only compute once more after initial access (cached)
      expect(first).toBe(second);
      // After first access, subsequent accesses should not compute again
      expect(computeFn.mock.calls.length).toBeLessThanOrEqual(callCountAfterConstruct + 1);
    });
  });

  describe('dependencies', () => {
    it('recomputes when dependency changes', () => {
      const source = new Signal<number>();
      let sourceValue = 10;

      const computed = new ComputedSignal(() => sourceValue * 2, [source]);

      expect(computed.value).toBe(20);

      sourceValue = 20;
      source.emit(20, 10);

      expect(computed.value).toBe(40);
    });

    it('emits changed signal when recomputed', () => {
      const source = new Signal<number>();
      let sourceValue = 5;

      const computed = new ComputedSignal(() => sourceValue, [source]);
      const callback = vi.fn();
      computed.changed.connect(callback);

      sourceValue = 10;
      source.emit(10, 5);

      expect(callback).toHaveBeenCalled();
    });

    it('handles multiple dependencies', () => {
      const source1 = new Signal<number>();
      const source2 = new Signal<number>();
      let val1 = 10;
      let val2 = 20;

      const computed = new ComputedSignal(() => val1 + val2, [source1, source2]);

      expect(computed.value).toBe(30);

      val1 = 15;
      source1.emit(15, 10);
      expect(computed.value).toBe(35);

      val2 = 25;
      source2.emit(25, 20);
      expect(computed.value).toBe(40);
    });
  });

  describe('dispose', () => {
    it('CS-DISP-001: dependency emission after dispose() does NOT recompute and does NOT emit changed', () => {
      const source = new Signal<number>();
      let sourceValue = 10;
      const computeFn = vi.fn(() => sourceValue * 2);

      const computed = new ComputedSignal(computeFn, [source]);
      expect(computed.value).toBe(20);

      const changedCallback = vi.fn();
      computed.changed.connect(changedCallback);

      computed.dispose();
      computeFn.mockClear();
      changedCallback.mockClear();

      // Emitting on the dependency after dispose
      sourceValue = 50;
      source.emit(50, 10);

      expect(computeFn).not.toHaveBeenCalled();
      expect(changedCallback).not.toHaveBeenCalled();
      // Verify the dependency signal itself has no connections (actual leak fix)
      expect(source.hasConnections).toBe(false);
    });

    it('CS-DISP-002: changed.hasConnections returns false after dispose()', () => {
      const source = new Signal<number>();
      const computed = new ComputedSignal(() => 42, [source]);

      computed.changed.connect(() => {});
      expect(computed.changed.hasConnections).toBe(true);

      computed.dispose();
      expect(computed.changed.hasConnections).toBe(false);
    });

    it('CS-DISP-003: dispose() is idempotent (calling twice does not throw)', () => {
      const source = new Signal<number>();
      const computed = new ComputedSignal(() => 1, [source]);

      expect(() => {
        computed.dispose();
        computed.dispose();
      }).not.toThrow();
    });

    it('CS-DISP-004: .value after dispose() returns frozen cached value (no recompute)', () => {
      const source = new Signal<number>();
      let sourceValue = 10;
      const computeFn = vi.fn(() => sourceValue);

      const computed = new ComputedSignal(computeFn, [source]);
      expect(computed.value).toBe(10);

      computed.dispose();
      computeFn.mockClear();

      // Change the source value, but since disposed, should return cached
      sourceValue = 999;
      expect(computed.value).toBe(10);
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('CS-DISP-005: dispose() on zero-dependency ComputedSignal is safe', () => {
      const computed = new ComputedSignal(() => 'constant');

      expect(computed.value).toBe('constant');

      expect(() => computed.dispose()).not.toThrow();
      expect(computed.value).toBe('constant');
    });
  });
});
