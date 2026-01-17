/**
 * EventEmitter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, EventMap } from './EventEmitter';

interface TestEvents extends EventMap {
  message: string;
  count: number;
  data: { id: string; value: number };
  empty: void;
}

describe('EventEmitter', () => {
  let emitter: EventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new EventEmitter<TestEvents>();
  });

  describe('on', () => {
    it('EVT-001: subscribes to event', () => {
      const listener = vi.fn();
      emitter.on('message', listener);

      emitter.emit('message', 'hello');
      expect(listener).toHaveBeenCalledWith('hello');
    });

    it('EVT-002: multiple listeners for same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('count', listener1);
      emitter.on('count', listener2);

      emitter.emit('count', 42);
      expect(listener1).toHaveBeenCalledWith(42);
      expect(listener2).toHaveBeenCalledWith(42);
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = emitter.on('message', listener);

      emitter.emit('message', 'first');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      emitter.emit('message', 'second');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('handles complex data types', () => {
      const listener = vi.fn();
      emitter.on('data', listener);

      const testData = { id: 'abc', value: 123 };
      emitter.emit('data', testData);

      expect(listener).toHaveBeenCalledWith(testData);
    });
  });

  describe('off', () => {
    it('EVT-003: unsubscribes from event', () => {
      const listener = vi.fn();
      emitter.on('message', listener);

      emitter.emit('message', 'first');
      expect(listener).toHaveBeenCalledTimes(1);

      emitter.off('message', listener);
      emitter.emit('message', 'second');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('only removes specific listener', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('count', listener1);
      emitter.on('count', listener2);

      emitter.off('count', listener1);
      emitter.emit('count', 10);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith(10);
    });

    it('handles removing non-existent listener', () => {
      const listener = vi.fn();
      expect(() => emitter.off('message', listener)).not.toThrow();
    });

    it('handles removing from non-existent event', () => {
      const listener = vi.fn();
      expect(() => emitter.off('count', listener)).not.toThrow();
    });
  });

  describe('emit', () => {
    it('EVT-004: emits to all listeners', () => {
      const listeners = [vi.fn(), vi.fn(), vi.fn()];
      listeners.forEach((l) => emitter.on('message', l));

      emitter.emit('message', 'broadcast');

      listeners.forEach((l) => {
        expect(l).toHaveBeenCalledWith('broadcast');
      });
    });

    it('does not throw for event with no listeners', () => {
      expect(() => emitter.emit('message', 'no one listening')).not.toThrow();
    });

    it('EVT-005: handles listener errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      emitter.on('message', errorListener);
      emitter.on('message', normalListener);

      // Should not throw and should continue to other listeners
      emitter.emit('message', 'test');

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('once', () => {
    it('EVT-006: fires only once', () => {
      const listener = vi.fn();
      emitter.once('message', listener);

      emitter.emit('message', 'first');
      emitter.emit('message', 'second');
      emitter.emit('message', 'third');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('first');
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = emitter.once('message', listener);

      unsubscribe();
      emitter.emit('message', 'never received');

      expect(listener).not.toHaveBeenCalled();
    });

    it('works with multiple once listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.once('count', listener1);
      emitter.once('count', listener2);

      emitter.emit('count', 1);
      emitter.emit('count', 2);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith(1);
      expect(listener2).toHaveBeenCalledWith(1);
    });
  });

  describe('removeAllListeners', () => {
    it('EVT-007: removes all listeners for specific event', () => {
      const messageListener = vi.fn();
      const countListener = vi.fn();

      emitter.on('message', messageListener);
      emitter.on('count', countListener);

      emitter.removeAllListeners('message');

      emitter.emit('message', 'test');
      emitter.emit('count', 5);

      expect(messageListener).not.toHaveBeenCalled();
      expect(countListener).toHaveBeenCalledWith(5);
    });

    it('EVT-008: removes all listeners when no event specified', () => {
      const messageListener = vi.fn();
      const countListener = vi.fn();
      const dataListener = vi.fn();

      emitter.on('message', messageListener);
      emitter.on('count', countListener);
      emitter.on('data', dataListener);

      emitter.removeAllListeners();

      emitter.emit('message', 'test');
      emitter.emit('count', 5);
      emitter.emit('data', { id: '1', value: 1 });

      expect(messageListener).not.toHaveBeenCalled();
      expect(countListener).not.toHaveBeenCalled();
      expect(dataListener).not.toHaveBeenCalled();
    });
  });

  describe('type safety', () => {
    it('enforces event types at compile time', () => {
      // This test is mainly for TypeScript - if it compiles, types work
      const listener = (msg: string) => {
        expect(typeof msg).toBe('string');
      };
      emitter.on('message', listener);
      emitter.emit('message', 'typed string');
    });
  });

  describe('edge cases', () => {
    it('handles same listener added multiple times', () => {
      const listener = vi.fn();
      emitter.on('message', listener);
      emitter.on('message', listener);

      emitter.emit('message', 'test');

      // Set-based storage means duplicate listeners only fire once
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('handles listener that removes itself', () => {
      let unsubscribe: () => void;
      const listener = vi.fn(() => {
        unsubscribe();
      });
      unsubscribe = emitter.on('message', listener);

      emitter.emit('message', 'test');
      emitter.emit('message', 'second');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('handles rapid emit calls', () => {
      const listener = vi.fn();
      emitter.on('count', listener);

      for (let i = 0; i < 100; i++) {
        emitter.emit('count', i);
      }

      expect(listener).toHaveBeenCalledTimes(100);
    });

    it('handles void event type', () => {
      const listener = vi.fn();
      emitter.on('empty', listener);

      emitter.emit('empty', undefined as unknown as void);
      expect(listener).toHaveBeenCalled();
    });
  });
});
