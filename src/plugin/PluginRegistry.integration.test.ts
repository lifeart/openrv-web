/**
 * PluginRegistry Integration Tests
 *
 * End-to-end tests verifying full plugin lifecycle with actual domain registries.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginRegistry } from './PluginRegistry';
import { decoderRegistry } from '../formats/DecoderRegistry';
import { NodeFactory } from '../nodes/base/NodeFactory';
import type { Plugin, PluginContext, PluginManifest } from './types';

function createManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: 'integ.test',
    name: 'Integration Test Plugin',
    version: '1.0.0',
    contributes: ['decoder'],
    ...overrides,
  };
}

describe('PluginRegistry Integration', () => {
  let registry: PluginRegistry;
  const cleanupDecoders: string[] = [];
  const cleanupNodes: string[] = [];

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  afterEach(() => {
    // Clean up singleton state
    for (const name of cleanupDecoders) {
      decoderRegistry.unregisterDecoder(name);
    }
    cleanupDecoders.length = 0;
    for (const type of cleanupNodes) {
      NodeFactory.unregister(type);
    }
    cleanupNodes.length = 0;
  });

  it('PINT-037: full lifecycle: register -> activate -> use decoder -> deactivate -> decoder gone', async () => {
    const testFormatName = 'integ-test-fmt-037';
    cleanupDecoders.push(testFormatName);

    const decoder = {
      formatName: testFormatName,
      canDecode: (buffer: ArrayBuffer) => {
        const view = new DataView(buffer);
        return buffer.byteLength >= 4 && view.getUint32(0) === 0xdeadbeef;
      },
      decode: vi.fn().mockResolvedValue({
        width: 10,
        height: 10,
        data: new Float32Array(400),
        channels: 4,
        colorSpace: 'srgb',
        metadata: { formatName: testFormatName },
      }),
    };

    const plugin: Plugin = {
      manifest: createManifest({ id: 'integ.decoder', contributes: ['decoder'] }),
      activate(ctx: PluginContext) {
        ctx.registerDecoder(decoder);
      },
    };

    registry.register(plugin);
    await registry.activate('integ.decoder');

    // Verify decoder is live
    const testBuffer = new ArrayBuffer(4);
    new DataView(testBuffer).setUint32(0, 0xdeadbeef);
    const foundDecoder = decoderRegistry.getDecoder(testBuffer);
    expect(foundDecoder).not.toBeNull();
    expect(foundDecoder!.formatName).toBe(testFormatName);

    // Deactivate
    await registry.deactivate('integ.decoder');

    // Verify decoder is removed
    const afterDecoder = decoderRegistry.getDecoder(testBuffer);
    // If still found, it won't be our test decoder (could be another matching built-in)
    if (afterDecoder) {
      expect(afterDecoder.formatName).not.toBe(testFormatName);
    }
  });

  it('PINT-038: full lifecycle: register -> activate -> create node -> deactivate -> node type gone', async () => {
    const testNodeType = 'IntegTestNode038';
    cleanupNodes.push(testNodeType);

    const plugin: Plugin = {
      manifest: createManifest({ id: 'integ.node', contributes: ['node'] }),
      activate(ctx: PluginContext) {
        ctx.registerNode(
          testNodeType,
          () => ({ type: testNodeType }) as unknown as import('../nodes/base/IPNode').IPNode,
        );
      },
    };

    registry.register(plugin);
    await registry.activate('integ.node');
    expect(NodeFactory.isRegistered(testNodeType)).toBe(true);

    const node = NodeFactory.create(testNodeType);
    expect(node).not.toBeNull();

    await registry.deactivate('integ.node');
    expect(NodeFactory.isRegistered(testNodeType)).toBe(false);
    expect(NodeFactory.create(testNodeType)).toBeNull();
  });

  it('PINT-039: two plugins with dependency: B depends on A, both activate in correct order', async () => {
    const order: string[] = [];

    const pluginA: Plugin = {
      manifest: createManifest({ id: 'integ.a', name: 'A', contributes: ['decoder'] }),
      activate() {
        order.push('activate-a');
      },
    };

    const pluginB: Plugin = {
      manifest: createManifest({ id: 'integ.b', name: 'B', contributes: ['decoder'], dependencies: ['integ.a'] }),
      activate() {
        order.push('activate-b');
      },
    };

    registry.register(pluginA);
    registry.register(pluginB);
    await registry.activateAll();

    expect(order).toEqual(['activate-a', 'activate-b']);
    expect(registry.getState('integ.a')).toBe('active');
    expect(registry.getState('integ.b')).toBe('active');
  });

  it('PINT-041: setEventsAPI wires events so plugins can subscribe to app events without warnings', async () => {
    // Create a mock EventsAPI
    const listeners = new Map<string, Set<Function>>();
    const mockEventsAPI = {
      on: vi.fn((event: string, cb: Function) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(cb);
        return () => listeners.get(event)?.delete(cb);
      }),
      once: vi.fn(),
      off: vi.fn(),
    };

    // Wire the EventsAPI
    registry.setEventsAPI(mockEventsAPI as any);

    const receivedFrames: number[] = [];
    const plugin: Plugin = {
      manifest: createManifest({ id: 'integ.events', contributes: ['decoder'] }),
      activate(ctx: PluginContext) {
        ctx.events.onApp('app:frameChange', (data) => {
          receivedFrames.push(data.frame);
        });
      },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registry.register(plugin);
    await registry.activate('integ.events');

    // No "EventsAPI not available" warning should have been logged
    const eventsApiWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('EventsAPI not available'),
    );
    expect(eventsApiWarnings).toHaveLength(0);

    // The subscription should have been bridged to the EventsAPI
    expect(mockEventsAPI.on).toHaveBeenCalledWith('frameChange', expect.any(Function));

    // Simulate an app event and verify the plugin receives it
    listeners.get('frameChange')?.forEach((cb) => cb({ frame: 99 }));
    expect(receivedFrames).toEqual([99]);

    warnSpy.mockRestore();
  });

  it('PINT-042: without setEventsAPI, plugin app-event subscriptions warn and no-op', async () => {
    // Do NOT call registry.setEventsAPI(...)
    const plugin: Plugin = {
      manifest: createManifest({ id: 'integ.noevents', contributes: ['decoder'] }),
      activate(ctx: PluginContext) {
        ctx.events.onApp('app:frameChange', vi.fn());
      },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registry.register(plugin);
    await registry.activate('integ.noevents');

    // Should have warned about EventsAPI not available
    const eventsApiWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('EventsAPI not available'),
    );
    expect(eventsApiWarnings.length).toBeGreaterThan(0);

    warnSpy.mockRestore();
  });

  it('PINT-040: plugin re-activation after deactivate: contributions re-registered, init() not re-called', async () => {
    const testNodeType = 'IntegReactivateNode040';
    cleanupNodes.push(testNodeType);

    const initFn = vi.fn();
    const plugin: Plugin = {
      manifest: createManifest({ id: 'integ.reactivate', contributes: ['node'] }),
      init: initFn,
      activate(ctx: PluginContext) {
        ctx.registerNode(
          testNodeType,
          () => ({ type: testNodeType }) as unknown as import('../nodes/base/IPNode').IPNode,
        );
      },
    };

    registry.register(plugin);
    await registry.activate('integ.reactivate');
    expect(initFn).toHaveBeenCalledTimes(1);
    expect(NodeFactory.isRegistered(testNodeType)).toBe(true);

    await registry.deactivate('integ.reactivate');
    expect(NodeFactory.isRegistered(testNodeType)).toBe(false);

    await registry.activate('integ.reactivate');
    expect(initFn).toHaveBeenCalledTimes(1); // init NOT called again
    expect(NodeFactory.isRegistered(testNodeType)).toBe(true);
  });
});
