import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginEventBus } from './PluginEventBus';

function createMockEventsAPI() {
  const listeners = new Map<string, Set<Function>>();
  return {
    on: vi.fn((event: string, cb: Function) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    }),
    once: vi.fn((event: string, cb: Function) => {
      const wrapper = (...args: unknown[]) => {
        listeners.get(event)?.delete(wrapper);
        cb(...args);
      };
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(wrapper);
      return () => listeners.get(event)?.delete(wrapper);
    }),
    off: vi.fn(),
    _emit: (event: string, data: unknown) => {
      listeners.get(event)?.forEach((cb) => cb(data));
    },
  };
}

describe('PluginEventBus', () => {
  let bus: PluginEventBus;
  let mockAPI: ReturnType<typeof createMockEventsAPI>;

  beforeEach(() => {
    bus = new PluginEventBus();
    mockAPI = createMockEventsAPI();
    bus.setEventsAPI(mockAPI as any);
  });

  describe('app event subscriptions', () => {
    it('PEVT-001: subscribes to app events via EventsAPI', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onApp('app:frameChange', cb);

      expect(mockAPI.on).toHaveBeenCalledWith('frameChange', expect.any(Function));
    });

    it('PEVT-002: receives app event data', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onApp('app:frameChange', cb);

      mockAPI._emit('frameChange', { frame: 42 });
      expect(cb).toHaveBeenCalledWith({ frame: 42 });
    });

    it('PEVT-003: onceApp only fires once', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onceApp('app:frameChange', cb);

      expect(mockAPI.once).toHaveBeenCalledWith('frameChange', expect.any(Function));
    });

    it('PEVT-004: unsubscribe stops events', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      const unsub = sub.onApp('app:frameChange', cb);
      unsub();

      mockAPI._emit('frameChange', { frame: 1 });
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('plugin lifecycle events', () => {
    it('PEVT-010: receives plugin:activated events', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onApp('plugin:activated', cb);

      bus.emitPluginLifecycle('plugin:activated', { id: 'other.plugin' });
      expect(cb).toHaveBeenCalledWith({ id: 'other.plugin' });
    });

    it('PEVT-011: receives plugin:deactivated events', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onApp('plugin:deactivated', cb);

      bus.emitPluginLifecycle('plugin:deactivated', { id: 'some.plugin' });
      expect(cb).toHaveBeenCalledWith({ id: 'some.plugin' });
    });

    it('PEVT-012: receives plugin:error events', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onApp('plugin:error', cb);

      bus.emitPluginLifecycle('plugin:error', { id: 'bad.plugin', error: 'boom' });
      expect(cb).toHaveBeenCalledWith({ id: 'bad.plugin', error: 'boom' });
    });
  });

  describe('custom plugin events', () => {
    it('PEVT-020: emitPlugin namespaces event with plugin ID', () => {
      const sub1 = bus.createSubscription('com.example.sender');
      const sub2 = bus.createSubscription('com.example.receiver');

      const cb = vi.fn();
      sub2.onPlugin('com.example.sender:myEvent', cb);
      sub1.emitPlugin('myEvent', { value: 123 });

      expect(cb).toHaveBeenCalledWith({ value: 123 });
    });

    it('PEVT-021: custom events are isolated by namespace', () => {
      const sub1 = bus.createSubscription('plugin.a');
      const sub2 = bus.createSubscription('plugin.b');

      const cb = vi.fn();
      sub2.onPlugin('plugin.a:event', cb);
      sub1.emitPlugin('event', 'data');

      expect(cb).toHaveBeenCalledWith('data');

      // Listening for wrong namespace should not fire
      const cb2 = vi.fn();
      sub2.onPlugin('plugin.c:event', cb2);
      sub1.emitPlugin('event', 'data2');
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  describe('auto-cleanup', () => {
    it('PEVT-030: disposePlugin removes all subscriptions', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      sub.onApp('plugin:activated', cb1);
      sub.onPlugin('some:event', cb2);

      bus.disposePlugin('test.plugin');

      bus.emitPluginLifecycle('plugin:activated', { id: 'x' });
      expect(cb1).not.toHaveBeenCalled();
    });

    it('PEVT-035: manual unsubscribe removes from tracking, dispose does not error', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      const unsub = sub.onApp('plugin:activated', cb);

      // Manually unsubscribe before dispose
      unsub();

      // Dispose should not error even though the subscription was already removed
      expect(() => bus.disposePlugin('test.plugin')).not.toThrow();

      // The callback should not fire after manual unsubscribe
      bus.emitPluginLifecycle('plugin:activated', { id: 'x' });
      expect(cb).not.toHaveBeenCalled();
    });

    it('PEVT-031: disposePlugin is idempotent', () => {
      bus.disposePlugin('nonexistent');
      expect(() => bus.disposePlugin('nonexistent')).not.toThrow();
    });
  });

  describe('auto-cleanup (extended)', () => {
    it('PEVT-032: disposePlugin removes custom event subscriptions', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onPlugin('test.plugin:myEvent', cb);

      bus.disposePlugin('test.plugin');

      // Emit custom event after dispose — should not fire
      const sub2 = bus.createSubscription('test.plugin');
      sub2.emitPlugin('myEvent', 'data');
      expect(cb).not.toHaveBeenCalled();
    });

    it('PEVT-033: disposePlugin unsubscribes from EventsAPI-bridged events', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onApp('app:frameChange', cb);

      bus.disposePlugin('test.plugin');

      mockAPI._emit('frameChange', { frame: 1 });
      expect(cb).not.toHaveBeenCalled();
    });

    it('PEVT-034: disposing one plugin does not affect another', () => {
      const sub1 = bus.createSubscription('plugin.a');
      const sub2 = bus.createSubscription('plugin.b');
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      sub1.onApp('plugin:activated', cb1);
      sub2.onApp('plugin:activated', cb2);

      bus.disposePlugin('plugin.a');

      bus.emitPluginLifecycle('plugin:activated', { id: 'x' });
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledWith({ id: 'x' });
    });
  });

  describe('edge cases', () => {
    it('PEVT-005: double unsubscribe is safe', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      const unsub = sub.onApp('plugin:activated', cb);

      unsub();
      expect(() => unsub()).not.toThrow();
    });

    it('PEVT-006: onceApp callback fires exactly once on repeated emissions', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onceApp('app:frameChange', cb);

      mockAPI._emit('frameChange', { frame: 1 });
      mockAPI._emit('frameChange', { frame: 2 });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ frame: 1 });
    });

    it('PEVT-007: onceApp for lifecycle events fires once', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onceApp('plugin:activated', cb);

      bus.emitPluginLifecycle('plugin:activated', { id: 'a' });
      bus.emitPluginLifecycle('plugin:activated', { id: 'b' });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('PEVT-050: subscribing without EventsAPI logs warning', () => {
      const noApiBus = new PluginEventBus();
      const sub = noApiBus.createSubscription('test.plugin');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const unsub = sub.onApp('app:frameChange', vi.fn());
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('EventsAPI not available'));
      expect(() => unsub()).not.toThrow();
      warnSpy.mockRestore();
    });

    it('PEVT-051: warns at max listeners threshold', () => {
      const sub = bus.createSubscription('test.plugin');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < 51; i++) {
        sub.onApp('plugin:activated', vi.fn());
      }

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Maximum listeners'));
      warnSpy.mockRestore();
    });

    it('PEVT-022: emitPlugin with no listeners does not throw', () => {
      const sub = bus.createSubscription('test.plugin');
      expect(() => sub.emitPlugin('noListeners', { data: 1 })).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('PEVT-040: catches errors in lifecycle event callbacks', () => {
      const sub = bus.createSubscription('test.plugin');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      sub.onApp('plugin:activated', () => {
        throw new Error('callback error');
      });
      bus.emitPluginLifecycle('plugin:activated', { id: 'x' });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in event listener'), expect.any(Error));
      errorSpy.mockRestore();
    });

    it('PEVT-041: catches errors in custom event callbacks', () => {
      const sub = bus.createSubscription('test.plugin');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      sub.onPlugin('test.plugin:evt', () => {
        throw new Error('custom error');
      });
      sub.emitPlugin('evt', 'data');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in custom event listener'),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });

    it('PEVT-042: catches errors in EventsAPI-bridged callbacks', () => {
      const sub = bus.createSubscription('test.plugin');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      sub.onApp('app:frameChange', () => {
        throw new Error('bridged error');
      });
      mockAPI._emit('frameChange', { frame: 1 });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in event listener'), expect.any(Error));
      errorSpy.mockRestore();
    });
  });

  describe('planned events (not yet active)', () => {
    it('PEVT-070: app:stop can be subscribed to (forward-compatibility)', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      const unsub = sub.onApp('app:stop', cb);

      // The event is mapped and subscribable, even though it is not yet emitted in production
      expect(mockAPI.on).toHaveBeenCalledWith('stop', expect.any(Function));
      expect(typeof unsub).toBe('function');

      // Verify it would work if emitted
      mockAPI._emit('stop', undefined);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('PEVT-071: app:error can be subscribed to (forward-compatibility)', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      const unsub = sub.onApp('app:error', cb);

      expect(mockAPI.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(typeof unsub).toBe('function');

      // Verify it would work if emitted
      mockAPI._emit('error', { message: 'test error', code: 'TEST' });
      expect(cb).toHaveBeenCalledWith({ message: 'test error', code: 'TEST' });
    });
  });

  describe('bus dispose', () => {
    it('PEVT-060: dispose clears all subscriptions and emitters', () => {
      const sub = bus.createSubscription('test.plugin');
      const cb = vi.fn();
      sub.onApp('plugin:activated', cb);

      bus.dispose();

      bus.emitPluginLifecycle('plugin:activated', { id: 'x' });
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
