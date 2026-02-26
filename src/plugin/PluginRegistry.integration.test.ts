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
        return buffer.byteLength >= 4 && view.getUint32(0) === 0xDEADBEEF;
      },
      decode: vi.fn().mockResolvedValue({
        width: 10, height: 10,
        data: new Float32Array(400),
        channels: 4, colorSpace: 'srgb',
        metadata: { formatName: testFormatName },
      }),
    };

    const plugin: Plugin = {
      manifest: createManifest({ id: 'integ.decoder', contributes: ['decoder'] }),
      activate(ctx: PluginContext) { ctx.registerDecoder(decoder); },
    };

    registry.register(plugin);
    await registry.activate('integ.decoder');

    // Verify decoder is live
    const testBuffer = new ArrayBuffer(4);
    new DataView(testBuffer).setUint32(0, 0xDEADBEEF);
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
        ctx.registerNode(testNodeType, () => ({ type: testNodeType }) as unknown as import('../nodes/base/IPNode').IPNode);
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
      activate() { order.push('activate-a'); },
    };

    const pluginB: Plugin = {
      manifest: createManifest({ id: 'integ.b', name: 'B', contributes: ['decoder'], dependencies: ['integ.a'] }),
      activate() { order.push('activate-b'); },
    };

    registry.register(pluginA);
    registry.register(pluginB);
    await registry.activateAll();

    expect(order).toEqual(['activate-a', 'activate-b']);
    expect(registry.getState('integ.a')).toBe('active');
    expect(registry.getState('integ.b')).toBe('active');
  });

  it('PINT-040: plugin re-activation after deactivate: contributions re-registered, init() not re-called', async () => {
    const testNodeType = 'IntegReactivateNode040';
    cleanupNodes.push(testNodeType);

    const initFn = vi.fn();
    const plugin: Plugin = {
      manifest: createManifest({ id: 'integ.reactivate', contributes: ['node'] }),
      init: initFn,
      activate(ctx: PluginContext) {
        ctx.registerNode(testNodeType, () => ({ type: testNodeType }) as unknown as import('../nodes/base/IPNode').IPNode);
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
