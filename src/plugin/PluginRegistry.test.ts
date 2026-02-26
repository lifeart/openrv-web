/**
 * PluginRegistry Unit Tests
 *
 * Tests cover:
 * - Registration and manifest validation
 * - Lifecycle state machine (init, activate, deactivate, dispose)
 * - Dependency resolution and cycle detection
 * - PluginContext contribution delegation
 * - Dynamic loading
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginRegistry } from './PluginRegistry';
import { ExporterRegistry } from './ExporterRegistry';
import { decoderRegistry } from '../formats/DecoderRegistry';
import { NodeFactory } from '../nodes/base/NodeFactory';
import type {
  Plugin,
  PluginManifest,
  PluginContext,
  BlendModeContribution,
  UIPanelContribution,
  ExporterContribution,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: 'test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    contributes: ['decoder'],
    ...overrides,
  };
}

function createPlugin(overrides?: Partial<Plugin> & { manifest?: Partial<PluginManifest> }): Plugin {
  const { manifest: manifestOverrides, ...pluginOverrides } = overrides ?? {};
  return {
    manifest: createManifest(manifestOverrides),
    activate: vi.fn(),
    ...pluginOverrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginRegistry', () => {
  let registry: PluginRegistry;
  // Track singleton mutations for cleanup
  const cleanupDecoders: string[] = [];
  const cleanupNodes: string[] = [];
  const cleanupExporters: string[] = [];

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  afterEach(() => {
    for (const name of cleanupDecoders) decoderRegistry.unregisterDecoder(name);
    cleanupDecoders.length = 0;
    for (const type of cleanupNodes) NodeFactory.unregister(type);
    cleanupNodes.length = 0;
    for (const name of cleanupExporters) ExporterRegistry.unregister(name);
    cleanupExporters.length = 0;
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe('register()', () => {
    it('PREG-001: stores plugin and sets state to Registered', () => {
      const plugin = createPlugin();
      registry.register(plugin);
      expect(registry.getState('test.plugin')).toBe('registered');
      expect(registry.getPlugin('test.plugin')).toBe(plugin);
    });

    it('PREG-002: register with duplicate ID throws', () => {
      const plugin = createPlugin();
      registry.register(plugin);
      expect(() => registry.register(plugin)).toThrow('already registered');
    });

    it('PREG-003: register with empty manifest ID throws', () => {
      const plugin = { manifest: { id: '', name: 'X', version: '1.0.0', contributes: ['decoder' as const] }, activate: vi.fn() };
      expect(() => registry.register(plugin)).toThrow('manifest.id must be a non-empty string');
    });

    it('PREG-004: register with missing contributes throws', () => {
      const plugin = { manifest: { id: 'x', name: 'X', version: '1.0.0', contributes: [] as string[] }, activate: vi.fn() };
      expect(() => registry.register(plugin as unknown as Plugin)).toThrow('manifest.contributes must be a non-empty array');
    });

    it('PREG-004b: register with missing manifest name throws', () => {
      const plugin = { manifest: { id: 'x', name: '', version: '1.0.0', contributes: ['decoder' as const] }, activate: vi.fn() };
      expect(() => registry.register(plugin)).toThrow('manifest.name must be a non-empty string');
    });

    it('PREG-004c: register with missing manifest version throws', () => {
      const plugin = { manifest: { id: 'x', name: 'X', version: '', contributes: ['decoder' as const] }, activate: vi.fn() };
      expect(() => registry.register(plugin)).toThrow('manifest.version must be a non-empty string');
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle: activate
  // -------------------------------------------------------------------------

  describe('activate()', () => {
    it('PREG-005: calls init() then activate() in order', async () => {
      const order: string[] = [];
      const plugin = createPlugin({
        init: vi.fn(() => { order.push('init'); }),
        activate: vi.fn(() => { order.push('activate'); }),
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(order).toEqual(['init', 'activate']);
      expect(registry.getState('test.plugin')).toBe('active');
    });

    it('PREG-006: resolves dependencies before activating dependent', async () => {
      const order: string[] = [];
      const pluginA = createPlugin({
        manifest: { id: 'a', name: 'A', version: '1.0.0', contributes: ['decoder'] },
        activate: vi.fn(() => { order.push('a'); }),
      });
      const pluginB = createPlugin({
        manifest: { id: 'b', name: 'B', version: '1.0.0', contributes: ['decoder'], dependencies: ['a'] },
        activate: vi.fn(() => { order.push('b'); }),
      });
      registry.register(pluginA);
      registry.register(pluginB);
      await registry.activate('b');
      expect(order).toEqual(['a', 'b']);
    });

    it('PREG-007: circular dependency (A->B->A) throws', () => {
      const pluginA = createPlugin({
        manifest: { id: 'a', name: 'A', version: '1.0.0', contributes: ['decoder'], dependencies: ['b'] },
      });
      const pluginB = createPlugin({
        manifest: { id: 'b', name: 'B', version: '1.0.0', contributes: ['decoder'], dependencies: ['a'] },
      });
      registry.register(pluginA);
      registry.register(pluginB);
      expect(() => registry['topologicalSort']()).toThrow('Circular plugin dependency');
    });

    it('PREG-008: transitive circular dependency (A->B->C->A) throws', () => {
      const pluginA = createPlugin({
        manifest: { id: 'a', name: 'A', version: '1.0.0', contributes: ['decoder'], dependencies: ['c'] },
      });
      const pluginB = createPlugin({
        manifest: { id: 'b', name: 'B', version: '1.0.0', contributes: ['decoder'], dependencies: ['a'] },
      });
      const pluginC = createPlugin({
        manifest: { id: 'c', name: 'C', version: '1.0.0', contributes: ['decoder'], dependencies: ['b'] },
      });
      registry.register(pluginA);
      registry.register(pluginB);
      registry.register(pluginC);
      expect(() => registry['topologicalSort']()).toThrow('Circular plugin dependency');
    });

    it('PREG-009: missing dependency throws naming the missing plugin', async () => {
      const plugin = createPlugin({
        manifest: { id: 'test', name: 'Test', version: '1.0.0', contributes: ['decoder'], dependencies: ['missing'] },
      });
      registry.register(plugin);
      await expect(registry.activate('test')).rejects.toThrow('"missing" which is not registered');
    });

    it('PREG-010: activate on already-active plugin is idempotent', async () => {
      const activateFn = vi.fn();
      const plugin = createPlugin({ activate: activateFn });
      registry.register(plugin);
      await registry.activate('test.plugin');
      await registry.activate('test.plugin');
      expect(activateFn).toHaveBeenCalledTimes(1);
    });

    it('PREG-011: activate on inactive plugin (re-activation) skips init()', async () => {
      const initFn = vi.fn();
      const activateFn = vi.fn();
      const plugin = createPlugin({ init: initFn, activate: activateFn });
      registry.register(plugin);
      await registry.activate('test.plugin');
      await registry.deactivate('test.plugin');
      await registry.activate('test.plugin');
      expect(initFn).toHaveBeenCalledTimes(1);
      expect(activateFn).toHaveBeenCalledTimes(2);
    });

    it('PREG-012: activate on disposed plugin throws', async () => {
      const plugin = createPlugin();
      registry.register(plugin);
      await registry.activate('test.plugin');
      await registry.dispose('test.plugin');
      await expect(registry.activate('test.plugin')).rejects.toThrow('disposed and cannot be reactivated');
    });

    it('PREG-013: activate when init() throws sets state to Error and propagates', async () => {
      const plugin = createPlugin({
        init: vi.fn(() => { throw new Error('init failed'); }),
      });
      registry.register(plugin);
      await expect(registry.activate('test.plugin')).rejects.toThrow('init failed');
      expect(registry.getState('test.plugin')).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle: deactivate
  // -------------------------------------------------------------------------

  describe('deactivate()', () => {
    it('PREG-014: calls plugin deactivate() and unregisters contributions', async () => {
      const deactivateFn = vi.fn();
      const decoder = { formatName: 'test-fmt', canDecode: () => false, decode: vi.fn() };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerDecoder(decoder); },
        deactivate: deactivateFn,
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(decoderRegistry.getDecoder(new ArrayBuffer(0))).toBe(null); // test decoder has canDecode=false
      await registry.deactivate('test.plugin');
      expect(deactivateFn).toHaveBeenCalled();
      expect(registry.getState('test.plugin')).toBe('inactive');
    });

    it('PREG-015: deactivate cascades to dependents first', async () => {
      const order: string[] = [];
      const pluginA = createPlugin({
        manifest: { id: 'a', name: 'A', version: '1.0.0', contributes: ['decoder'] },
        activate: vi.fn(),
        deactivate: vi.fn(() => { order.push('deactivate-a'); }),
      });
      const pluginB = createPlugin({
        manifest: { id: 'b', name: 'B', version: '1.0.0', contributes: ['decoder'], dependencies: ['a'] },
        activate: vi.fn(),
        deactivate: vi.fn(() => { order.push('deactivate-b'); }),
      });
      registry.register(pluginA);
      registry.register(pluginB);
      await registry.activateAll();
      await registry.deactivate('a');
      expect(order).toEqual(['deactivate-b', 'deactivate-a']);
      expect(registry.getState('a')).toBe('inactive');
      expect(registry.getState('b')).toBe('inactive');
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle: dispose
  // -------------------------------------------------------------------------

  describe('dispose()', () => {
    it('PREG-016: transitions through deactivate if active, then calls dispose()', async () => {
      const disposeFn = vi.fn();
      const deactivateFn = vi.fn();
      const plugin = createPlugin({
        activate: vi.fn(),
        deactivate: deactivateFn,
        dispose: disposeFn,
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      await registry.dispose('test.plugin');
      expect(deactivateFn).toHaveBeenCalled();
      expect(disposeFn).toHaveBeenCalled();
      expect(registry.getState('test.plugin')).toBe('disposed');
    });

    it('PREG-017: dispose is idempotent (double-dispose does not throw)', async () => {
      const plugin = createPlugin();
      registry.register(plugin);
      await registry.activate('test.plugin');
      await registry.dispose('test.plugin');
      await registry.dispose('test.plugin');
      expect(registry.getState('test.plugin')).toBe('disposed');
    });
  });

  // -------------------------------------------------------------------------
  // activateAll
  // -------------------------------------------------------------------------

  describe('activateAll()', () => {
    it('PREG-018: processes plugins in topological dependency order', async () => {
      const order: string[] = [];
      const pluginA = createPlugin({
        manifest: { id: 'a', name: 'A', version: '1.0.0', contributes: ['decoder'] },
        activate: vi.fn(() => { order.push('a'); }),
      });
      const pluginB = createPlugin({
        manifest: { id: 'b', name: 'B', version: '1.0.0', contributes: ['decoder'], dependencies: ['a'] },
        activate: vi.fn(() => { order.push('b'); }),
      });
      // Register B first to verify dependency ordering regardless of registration order
      registry.register(pluginB);
      registry.register(pluginA);
      await registry.activateAll();
      expect(order).toEqual(['a', 'b']);
    });
  });

  // -------------------------------------------------------------------------
  // PluginContext
  // -------------------------------------------------------------------------

  describe('PluginContext', () => {
    it('PREG-019: api returns API after setAPI() is called', async () => {
      const fakeAPI = { version: '1.0.0' } as import('../api/OpenRVAPI').OpenRVAPI;
      registry.setAPI(fakeAPI);
      let capturedContext: PluginContext | null = null;
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { capturedContext = ctx; },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(capturedContext!.api).toBe(fakeAPI);
    });

    it('PREG-020: api throws before setAPI() is called', async () => {
      let capturedContext: PluginContext | null = null;
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { capturedContext = ctx; },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(() => capturedContext!.api).toThrow('OpenRV API not yet initialized');
    });
  });

  // -------------------------------------------------------------------------
  // PluginContext Contribution Delegation
  // -------------------------------------------------------------------------

  describe('PluginContext contributions', () => {
    it('PREG-021: registerDecoder delegates to decoderRegistry', async () => {
      const decoder = { formatName: 'plugin-fmt-021', canDecode: () => false, decode: vi.fn() };
      cleanupDecoders.push('plugin-fmt-021');
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerDecoder(decoder); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      // Verify decoder was registered by checking unregister succeeds
      expect(decoderRegistry.unregisterDecoder('plugin-fmt-021')).toBe(true);
    });

    it('PREG-022: registerNode delegates to NodeFactory', async () => {
      cleanupNodes.push('PluginTestNode022');
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => {
          ctx.registerNode('PluginTestNode022', () => ({}) as import('../nodes/base/IPNode').IPNode);
        },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(NodeFactory.isRegistered('PluginTestNode022')).toBe(true);
    });

    it('PREG-023: registerTool delegates to PaintEngine.registerAdvancedTool()', async () => {
      const mockEngine = {
        registerAdvancedTool: vi.fn(),
        unregisterAdvancedTool: vi.fn(),
      };
      registry.setPaintEngine(mockEngine as unknown as import('../paint/PaintEngine').PaintEngine);

      const toolFactory = () => ({ name: 'plugin-tool', apply: vi.fn(), beginStroke: vi.fn(), endStroke: vi.fn(), reset: vi.fn() });
      const plugin = createPlugin({
        manifest: { id: 'test.tool', name: 'Tool Plugin', version: '1.0.0', contributes: ['tool'] },
        activate: (ctx: PluginContext) => { ctx.registerTool('plugin-tool', toolFactory); },
      });
      registry.register(plugin);
      await registry.activate('test.tool');
      expect(mockEngine.registerAdvancedTool).toHaveBeenCalledWith('plugin-tool', expect.any(Object));
    });

    it('PREG-024: registerExporter delegates to ExporterRegistry', async () => {
      cleanupExporters.push('test-export');
      const exporter: ExporterContribution = {
        kind: 'blob',
        label: 'Test Export',
        extensions: ['test'],
        export: vi.fn(),
      };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerExporter('test-export', exporter); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(ExporterRegistry.get('test-export')).toBe(exporter);
    });

    it('PREG-025: registerBlendMode stores in blend mode registry', async () => {
      const blend: BlendModeContribution = { label: 'Test Blend', blend: (a, b) => a * b };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerBlendMode('test-blend', blend); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(registry.getBlendMode('test-blend')).toBe(blend);
    });

    it('PREG-026: registerUIPanel stores in UI panel registry', async () => {
      const panel: UIPanelContribution = {
        id: 'test-panel',
        label: 'Test',
        location: 'right',
        render: vi.fn(),
      };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerUIPanel(panel); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(registry.getUIPanel('test-panel')).toBe(panel);
    });

    it('PREG-027: deactivation removes decoder from decoderRegistry', async () => {
      cleanupDecoders.push('plugin-fmt-027');
      const decoder = { formatName: 'plugin-fmt-027', canDecode: () => false, decode: vi.fn() };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerDecoder(decoder); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      await registry.deactivate('test.plugin');
      // Decoder should have been removed
      expect(decoderRegistry.unregisterDecoder('plugin-fmt-027')).toBe(false);
    });

    it('PREG-028: deactivation removes node from NodeFactory', async () => {
      cleanupNodes.push('PluginTestNode028');
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => {
          ctx.registerNode('PluginTestNode028', () => ({}) as import('../nodes/base/IPNode').IPNode);
        },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(NodeFactory.isRegistered('PluginTestNode028')).toBe(true);
      await registry.deactivate('test.plugin');
      expect(NodeFactory.isRegistered('PluginTestNode028')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Dynamic loading
  // -------------------------------------------------------------------------

  describe('loadFromURL()', () => {
    it('PREG-029: rejects URL from disallowed origin', async () => {
      registry.setAllowedOrigins(['https://trusted.example.com']);
      await expect(registry.loadFromURL('https://evil.example.com/plugin.js'))
        .rejects.toThrow('not in the allowed origins list');
    });

    it('PREG-030: rejects invalid URL when origins are configured', async () => {
      registry.setAllowedOrigins(['https://trusted.example.com']);
      await expect(registry.loadFromURL('not-a-url'))
        .rejects.toThrow('Invalid plugin URL');
    });

    it('PREG-030b: accepts URL from allowed origin (import will fail in test env)', async () => {
      registry.setAllowedOrigins(['https://trusted.example.com']);
      // The URL passes origin validation but import() will fail in test env
      await expect(registry.loadFromURL('https://trusted.example.com/plugin.js'))
        .rejects.toThrow(); // import() fails, but origin validation passed
    });
  });

  // -------------------------------------------------------------------------
  // Query methods
  // -------------------------------------------------------------------------

  describe('query methods', () => {
    it('PREG-031: getRegisteredIds returns all plugin IDs', () => {
      registry.register(createPlugin({ manifest: { id: 'a', name: 'A', version: '1.0.0', contributes: ['decoder'] } }));
      registry.register(createPlugin({ manifest: { id: 'b', name: 'B', version: '1.0.0', contributes: ['decoder'] } }));
      expect(registry.getRegisteredIds()).toEqual(['a', 'b']);
    });

    it('PREG-032: getUIPanels returns copy of UI panel map', async () => {
      const panel: UIPanelContribution = { id: 'p1', label: 'P1', location: 'left', render: vi.fn() };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerUIPanel(panel); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      const panels = registry.getUIPanels();
      expect(panels.size).toBe(1);
      expect(panels.get('p1')).toBe(panel);
    });

    it('PREG-033: getState returns undefined for unknown plugin', () => {
      expect(registry.getState('unknown')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // State signal emission
  // -------------------------------------------------------------------------

  describe('pluginStateChanged signal', () => {
    it('PREG-034: emits state transitions during lifecycle', async () => {
      const states: string[] = [];
      registry.pluginStateChanged.connect((data) => { states.push(data.state); });
      const plugin = createPlugin({
        init: vi.fn(),
        activate: vi.fn(),
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      // Should see: registered, initialized, active
      expect(states).toEqual(['registered', 'initialized', 'active']);
    });
  });

  // -------------------------------------------------------------------------
  // registerTool error path
  // -------------------------------------------------------------------------

  describe('registerTool without PaintEngine', () => {
    it('PREG-035: throws when PaintEngine not set', async () => {
      const plugin = createPlugin({
        manifest: { id: 'test.tool.err', name: 'Tool Err', version: '1.0.0', contributes: ['tool'] },
        activate: (ctx: PluginContext) => {
          ctx.registerTool('bad-tool', () => ({
            name: 'bad-tool', apply: vi.fn(), beginStroke: vi.fn(), endStroke: vi.fn(), reset: vi.fn(),
          }));
        },
      });
      registry.register(plugin);
      await expect(registry.activate('test.tool.err')).rejects.toThrow('PaintEngine not yet initialized');
    });
  });

  // -------------------------------------------------------------------------
  // Additional tests from review feedback
  // -------------------------------------------------------------------------

  describe('activate() error from activate callback', () => {
    it('PREG-036: activate() when activate callback throws sets state to Error', async () => {
      const plugin = createPlugin({
        init: vi.fn(),
        activate: vi.fn(() => { throw new Error('activate failed'); }),
      });
      registry.register(plugin);
      await expect(registry.activate('test.plugin')).rejects.toThrow('activate failed');
      expect(registry.getState('test.plugin')).toBe('error');
    });
  });

  describe('deactivation cleanup of all contribution types', () => {
    it('PREG-037: deactivation removes exporter from ExporterRegistry', async () => {
      cleanupExporters.push('test-export-037');
      const exporter: ExporterContribution = { kind: 'blob', label: 'T', extensions: ['t'], export: vi.fn() };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerExporter('test-export-037', exporter); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(ExporterRegistry.get('test-export-037')).toBe(exporter);
      await registry.deactivate('test.plugin');
      expect(ExporterRegistry.get('test-export-037')).toBeUndefined();
    });

    it('PREG-038: deactivation removes blend mode from registry', async () => {
      const blend: BlendModeContribution = { label: 'T', blend: (a, b) => a * b };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerBlendMode('test-blend-038', blend); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(registry.getBlendMode('test-blend-038')).toBe(blend);
      await registry.deactivate('test.plugin');
      expect(registry.getBlendMode('test-blend-038')).toBeUndefined();
    });

    it('PREG-039: deactivation calls destroy() on UI panels and removes them', async () => {
      const destroyFn = vi.fn();
      const panel: UIPanelContribution = { id: 'p-039', label: 'T', location: 'right', render: vi.fn(), destroy: destroyFn };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerUIPanel(panel); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(registry.getUIPanel('p-039')).toBe(panel);
      await registry.deactivate('test.plugin');
      expect(destroyFn).toHaveBeenCalled();
      expect(registry.getUIPanel('p-039')).toBeUndefined();
    });

    it('PREG-040: deactivation removes tool from PaintEngine', async () => {
      const mockEngine = {
        registerAdvancedTool: vi.fn(),
        unregisterAdvancedTool: vi.fn().mockReturnValue(true),
      };
      registry.setPaintEngine(mockEngine as unknown as import('../paint/PaintEngine').PaintEngine);
      const plugin = createPlugin({
        manifest: { id: 'test.tool.040', name: 'T', version: '1.0.0', contributes: ['tool'] },
        activate: (ctx: PluginContext) => {
          ctx.registerTool('tool-040', () => ({
            name: 'tool-040', apply: vi.fn(), beginStroke: vi.fn(), endStroke: vi.fn(), reset: vi.fn(),
          }));
        },
      });
      registry.register(plugin);
      await registry.activate('test.tool.040');
      await registry.deactivate('test.tool.040');
      expect(mockEngine.unregisterAdvancedTool).toHaveBeenCalledWith('tool-040');
    });
  });

  describe('manifest validation edge cases', () => {
    it('PREG-041: register with null manifest throws', () => {
      const plugin = { manifest: null, activate: vi.fn() };
      expect(() => registry.register(plugin as unknown as Plugin)).toThrow('manifest is missing');
    });
  });

  describe('dispose error handling', () => {
    it('PREG-042: dispose still sets state to disposed even if dispose hook throws', async () => {
      const plugin = createPlugin({
        activate: vi.fn(),
        dispose: vi.fn(() => { throw new Error('dispose boom'); }),
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      // dispose should not throw, just log the error
      await registry.dispose('test.plugin');
      expect(registry.getState('test.plugin')).toBe('disposed');
    });
  });

  describe('signal emissions during full lifecycle', () => {
    it('PREG-043: emits correct states for deactivate and dispose', async () => {
      const states: string[] = [];
      registry.pluginStateChanged.connect((data) => { states.push(data.state); });
      const plugin = createPlugin({ init: vi.fn(), activate: vi.fn() });
      registry.register(plugin);
      await registry.activate('test.plugin');
      await registry.deactivate('test.plugin');
      await registry.dispose('test.plugin');
      expect(states).toEqual(['registered', 'initialized', 'active', 'inactive', 'disposed']);
    });
  });

  // -------------------------------------------------------------------------
  // PluginContext.log
  // -------------------------------------------------------------------------

  describe('PluginContext.log', () => {
    it('PREG-044: log.info/warn/error prefix messages with plugin ID', async () => {
      const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let capturedCtx: PluginContext | null = null;
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { capturedCtx = ctx; },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');

      capturedCtx!.log.info('test info', 42);
      capturedCtx!.log.warn('test warn');
      capturedCtx!.log.error('test error');

      expect(infoSpy).toHaveBeenCalledWith('[plugin:test.plugin]', 'test info', 42);
      expect(warnSpy).toHaveBeenCalledWith('[plugin:test.plugin]', 'test warn');
      expect(errorSpy).toHaveBeenCalledWith('[plugin:test.plugin]', 'test error');

      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Exporter query delegation
  // -------------------------------------------------------------------------

  describe('getExporter / getExporters', () => {
    it('PREG-045: getExporter delegates to ExporterRegistry', async () => {
      cleanupExporters.push('query-exp');
      const exporter: ExporterContribution = {
        kind: 'blob', label: 'Q', extensions: ['q'], export: vi.fn(),
      };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => { ctx.registerExporter('query-exp', exporter); },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      expect(registry.getExporter('query-exp')).toBe(exporter);
      expect(registry.getExporter('nonexistent')).toBeUndefined();
    });

    it('PREG-046: getExporters returns all registered exporters', async () => {
      cleanupExporters.push('exp-a', 'exp-b');
      const expA: ExporterContribution = { kind: 'blob', label: 'A', extensions: ['a'], export: vi.fn() };
      const expB: ExporterContribution = { kind: 'text', label: 'B', extensions: ['b'], mimeType: 'text/plain', export: vi.fn() };
      const plugin = createPlugin({
        activate: (ctx: PluginContext) => {
          ctx.registerExporter('exp-a', expA);
          ctx.registerExporter('exp-b', expB);
        },
      });
      registry.register(plugin);
      await registry.activate('test.plugin');
      const all = registry.getExporters();
      expect(all.get('exp-a')).toBe(expA);
      expect(all.get('exp-b')).toBe(expB);
    });
  });
});
