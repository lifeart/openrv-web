/**
 * DisposableSubscriptionManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisposableSubscriptionManager } from './DisposableSubscriptionManager';
import { Signal } from '../core/graph/Signal';
import { EventEmitter, EventMap } from './EventEmitter';

describe('DisposableSubscriptionManager', () => {
  let manager: DisposableSubscriptionManager;

  beforeEach(() => {
    manager = new DisposableSubscriptionManager();
  });

  describe('add and dispose', () => {
    it('DSM-001: add() tracks disposers and dispose() calls all of them', () => {
      const disposer1 = vi.fn();
      const disposer2 = vi.fn();
      const disposer3 = vi.fn();

      manager.add(disposer1);
      manager.add(disposer2);
      manager.add(disposer3);

      expect(disposer1).not.toHaveBeenCalled();
      expect(disposer2).not.toHaveBeenCalled();
      expect(disposer3).not.toHaveBeenCalled();

      manager.dispose();

      expect(disposer1).toHaveBeenCalledTimes(1);
      expect(disposer2).toHaveBeenCalledTimes(1);
      expect(disposer3).toHaveBeenCalledTimes(1);
    });

    it('DSM-002: dispose() is idempotent (second call is no-op)', () => {
      const disposer = vi.fn();
      manager.add(disposer);

      manager.dispose();
      expect(disposer).toHaveBeenCalledTimes(1);

      manager.dispose();
      expect(disposer).toHaveBeenCalledTimes(1);
    });

    it('DSM-003: add() after dispose() immediately calls the disposer', () => {
      manager.dispose();

      const disposer = vi.fn();
      manager.add(disposer);

      expect(disposer).toHaveBeenCalledTimes(1);
    });
  });

  describe('addDOMListener', () => {
    it('DSM-004: addDOMListener() cleans up via AbortController on dispose', () => {
      const target = new EventTarget();
      const handler = vi.fn();

      manager.addDOMListener(target, 'click', handler);

      // Listener should fire before dispose
      target.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);

      manager.dispose();

      // Listener should not fire after dispose
      target.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('DSM-005: addDOMListener() throws if options.signal is provided', () => {
      const target = new EventTarget();
      const handler = vi.fn();
      const controller = new AbortController();

      expect(() => {
        manager.addDOMListener(target, 'click', handler, { signal: controller.signal });
      }).toThrow('do not pass options.signal');
    });

    it('DSM-013: addDOMListener() on disposed manager is no-op', () => {
      manager.dispose();

      const target = new EventTarget();
      const handler = vi.fn();

      // Should not throw
      manager.addDOMListener(target, 'click', handler);

      // Listener should never have been attached
      target.dispatchEvent(new Event('click'));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('createChild', () => {
    it('DSM-006: createChild() disposes children when parent disposes', () => {
      const childDisposer = vi.fn();
      const child = manager.createChild();
      child.add(childDisposer);

      expect(child.isDisposed).toBe(false);

      manager.dispose();

      expect(child.isDisposed).toBe(true);
      expect(childDisposer).toHaveBeenCalledTimes(1);
    });

    it('DSM-007: child self-removes from parent on independent dispose', () => {
      const parentDisposer = vi.fn();
      manager.add(parentDisposer);

      const childDisposer = vi.fn();
      const child = manager.createChild();
      child.add(childDisposer);

      // Dispose child independently
      child.dispose();
      expect(child.isDisposed).toBe(true);
      expect(childDisposer).toHaveBeenCalledTimes(1);

      // Parent dispose should not try to dispose child again
      manager.dispose();
      expect(childDisposer).toHaveBeenCalledTimes(1);
      expect(parentDisposer).toHaveBeenCalledTimes(1);
    });

    it('DSM-012: createChild() on disposed parent returns disposed child', () => {
      manager.dispose();

      const child = manager.createChild();
      expect(child.isDisposed).toBe(true);

      // Adding a disposer to a disposed child should immediately call it
      const disposer = vi.fn();
      child.add(disposer);
      expect(disposer).toHaveBeenCalledTimes(1);
    });
  });

  describe('count', () => {
    it('DSM-008: count property reflects tracked subscriptions', () => {
      expect(manager.count).toBe(0);

      manager.add(() => {});
      expect(manager.count).toBe(1);

      manager.add(() => {});
      manager.add(() => {});
      expect(manager.count).toBe(3);

      manager.dispose();
      expect(manager.count).toBe(0);
    });
  });

  describe('error handling', () => {
    it('DSM-009: error in one disposer does not prevent other disposers from running', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const disposer1 = vi.fn();
      const errorDisposer = vi.fn(() => {
        throw new Error('Disposer error');
      });
      const disposer2 = vi.fn();

      manager.add(disposer1);
      manager.add(errorDisposer);
      manager.add(disposer2);

      manager.dispose();

      expect(disposer1).toHaveBeenCalledTimes(1);
      expect(errorDisposer).toHaveBeenCalledTimes(1);
      expect(disposer2).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('integration with Signal', () => {
    it('DSM-010: add(signal.connect(cb)) -> dispose() -> signal.hasConnections === false', () => {
      const signal = new Signal<number>();
      const callback = vi.fn();

      manager.add(signal.connect(callback));

      expect(signal.hasConnections).toBe(true);

      signal.emit(42, 0);
      expect(callback).toHaveBeenCalledWith(42, 0);

      manager.dispose();

      expect(signal.hasConnections).toBe(false);

      signal.emit(99, 42);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration with EventEmitter', () => {
    it('DSM-011: add(emitter.on(event, cb)) -> dispose() -> callback no longer fires', () => {
      interface TestEvents extends EventMap {
        data: number;
      }
      const emitter = new EventEmitter<TestEvents>();
      const callback = vi.fn();

      manager.add(emitter.on('data', callback));

      emitter.emit('data', 10);
      expect(callback).toHaveBeenCalledWith(10);

      manager.dispose();

      emitter.emit('data', 20);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
