/**
 * SamplePlugin tests — scoped to plugin-local behavior.
 *
 * Note: deep-clone edge cases (Maps/Sets, ArrayBuffers, function fallback,
 * structuredClone DataCloneError, etc.) are already covered by
 * PHOT-022..028 in `HotReloadManager.test.ts`. These tests intentionally do
 * NOT replicate that surface; they verify only that:
 *   1. Manifest matches the published id/contributions.
 *   2. activate() registers the demo blend mode through the supplied context.
 *   3. getState() returns a structurally-cloneable snapshot.
 *   4. A round-trip getState -> structuredClone -> restoreState preserves
 *      counter, Map, and ArrayBuffer contents.
 *   5. activate/deactivate are balanced from the perspective of an external
 *      registry tracker (no leaked registrations between cycles).
 */

import { describe, it, expect, vi } from 'vitest';
import SamplePlugin from './SamplePlugin';
import type { PluginContext, BlendModeContribution } from '../types';

interface MockRegistryTracker {
  blendModes: Map<string, BlendModeContribution>;
}

function createMockContext(tracker: MockRegistryTracker): PluginContext {
  const ctx: Partial<PluginContext> = {
    manifest: SamplePlugin.manifest,
    registerDecoder: vi.fn(),
    registerNode: vi.fn(),
    registerTool: vi.fn(),
    registerExporter: vi.fn(),
    registerBlendMode: vi.fn((name: string, contribution: BlendModeContribution) => {
      tracker.blendModes.set(name, contribution);
    }),
    registerUIPanel: vi.fn(),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
  return ctx as PluginContext;
}

describe('SamplePlugin', () => {
  it('SAMP-001: manifest has the published id and lists blendMode contribution', () => {
    expect(SamplePlugin.manifest.id).toBe('openrv.sample.hot-reload-demo');
    expect(SamplePlugin.manifest.name).toBe('Sample Hot-Reload Demo Plugin');
    expect(SamplePlugin.manifest.version).toBe('1.0.0');
    expect(SamplePlugin.manifest.contributes).toContain('blendMode');
    // Per Impl rev D12: 'processor' is NOT a supported contribution type.
    expect(SamplePlugin.manifest.contributes).not.toContain('processor' as never);
  });

  it('SAMP-002: activate(ctx) registers a blend mode via ctx.registerBlendMode', () => {
    const tracker: MockRegistryTracker = { blendModes: new Map() };
    const ctx = createMockContext(tracker);

    SamplePlugin.init?.(ctx);
    SamplePlugin.activate(ctx);

    expect(ctx.registerBlendMode).toHaveBeenCalledTimes(1);
    expect(ctx.registerBlendMode).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        label: expect.any(String),
        blend: expect.any(Function),
      }),
    );
    expect(tracker.blendModes.size).toBe(1);

    // Sanity-check the blend function returns a value in [0,1] for inputs in [0,1].
    const entry = Array.from(tracker.blendModes.entries())[0];
    expect(entry).toBeDefined();
    const result = entry![1].blend(0.4, 0.8);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('SAMP-003: getState() returns a structurally-cloneable snapshot', () => {
    const tracker: MockRegistryTracker = { blendModes: new Map() };
    const ctx = createMockContext(tracker);

    SamplePlugin.init?.(ctx);
    SamplePlugin.activate(ctx);

    const snap = SamplePlugin.getState!();

    // structuredClone must succeed — no functions, DOM nodes, or class
    // instances in the snapshot. This is what HotReloadManager relies on.
    expect(() => structuredClone(snap)).not.toThrow();

    // Snapshot is an independent copy: mutating it must not affect live state.
    const obj = snap as { counter: number; events: Map<string, number> };
    obj.counter = 9999;
    obj.events.set('mutated', 1);
    const second = SamplePlugin.getState!() as { counter: number; events: Map<string, number> };
    expect(second.counter).not.toBe(9999);
    expect(second.events.has('mutated')).toBe(false);
  });

  it('SAMP-004: round-trip getState -> structuredClone -> restoreState preserves counter, Map, and ArrayBuffer contents', () => {
    const tracker: MockRegistryTracker = { blendModes: new Map() };
    const ctx = createMockContext(tracker);

    SamplePlugin.init?.(ctx);
    SamplePlugin.activate(ctx);
    SamplePlugin.activate(ctx); // bump counter to 2

    // Mark the scratch buffer with a recognizable byte pattern via the
    // *live* internal state (the snapshot below will pick this up).
    const live = SamplePlugin._state;
    new Uint8Array(live.scratch)[0] = 0xab;
    new Uint8Array(live.scratch)[1] = 0xcd;
    live.events.set('custom', 7);

    const snap = SamplePlugin.getState!();
    const cloned = structuredClone(snap);

    // Wipe live state so we know restoreState actually rehydrates.
    SamplePlugin._state = {
      counter: 0,
      events: new Map<string, number>(),
      scratch: new ArrayBuffer(16),
    };

    SamplePlugin.restoreState!(cloned);

    expect(SamplePlugin._state.counter).toBe(2);
    expect(SamplePlugin._state.events.get('activate')).toBe(2);
    expect(SamplePlugin._state.events.get('custom')).toBe(7);
    expect(SamplePlugin._state.scratch.byteLength).toBe(16);
    const restoredBytes = new Uint8Array(SamplePlugin._state.scratch);
    expect(restoredBytes[0]).toBe(0xab);
    expect(restoredBytes[1]).toBe(0xcd);
  });

  it('SAMP-005: activate/deactivate are balanced — no leaked blend-mode registrations', () => {
    const tracker: MockRegistryTracker = { blendModes: new Map() };
    const ctx = createMockContext(tracker);

    const baseline = tracker.blendModes.size;

    SamplePlugin.init?.(ctx);
    SamplePlugin.activate(ctx);
    expect(tracker.blendModes.size).toBe(baseline + 1);

    // Simulate the PluginRegistry tearing down tracked contributions on
    // deactivate (the registry — not the plugin — owns this teardown).
    for (const name of Array.from(tracker.blendModes.keys())) {
      tracker.blendModes.delete(name);
    }
    SamplePlugin.deactivate?.(ctx);

    expect(tracker.blendModes.size).toBe(baseline);

    // Re-activate should produce exactly one new registration again.
    SamplePlugin.activate(ctx);
    expect(tracker.blendModes.size).toBe(baseline + 1);
  });
});
