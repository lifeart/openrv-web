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

    it('PEVT-031: disposePlugin is idempotent', () => {
      bus.disposePlugin('nonexistent');
      expect(() => bus.disposePlugin('nonexistent')).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('PEVT-040: catches errors in event callbacks', () => {
      const sub = bus.createSubscription('test.plugin');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      sub.onApp('plugin:activated', () => {
        throw new Error('callback error');
      });
      bus.emitPluginLifecycle('plugin:activated', { id: 'x' });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in event listener'), expect.any(Error));
      errorSpy.mockRestore();
    });
  });
});
