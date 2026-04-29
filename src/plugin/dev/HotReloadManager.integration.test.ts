/**
 * HotReloadManager integration tests (MED-19 / PR-2).
 *
 * Exercise the manager against a *real* PluginRegistry to verify:
 *   - Schema-change reload: settings schema is unregistered + re-registered
 *     when a plugin reloads with a different settingsSchema shape.
 *   - Coalesce-with-trailing-replay race policy at the bridge layer.
 *   - The actual `pluginStateChanged` Signal emits `'active'` (not
 *     `'activated'`) and uses the `(value, oldValue)` callback signature.
 *
 * These tests use a stub `loadFromURL` (the registry doesn't natively
 * import test modules). The relevant integration is between the
 * HotReloadManager and the *real* PluginRegistry — lifecycle ordering,
 * schema bookkeeping, signal emission — not the dynamic-import path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HotReloadManager } from './HotReloadManager';
import { PluginRegistry } from '../PluginRegistry';
import type { Plugin, PluginContext, PluginManifest, PluginState, PluginId } from '../types';
import type { PluginSettingsSchema } from '../PluginSettingsStore';

function makePlugin(manifest: PluginManifest, hooks?: Partial<Plugin>): Plugin {
  return {
    manifest,
    init: hooks?.init,
    activate: hooks?.activate ?? (() => {}),
    deactivate: hooks?.deactivate,
    dispose: hooks?.dispose,
    getState: hooks?.getState,
    restoreState: hooks?.restoreState,
  };
}

describe('HotReloadManager integration', () => {
  let registry: PluginRegistry;
  let manager: HotReloadManager;

  beforeEach(() => {
    registry = new PluginRegistry();
    manager = new HotReloadManager(registry);
  });

  describe('schema-change reload', () => {
    it('PHRINT-001: settings schema is re-registered when plugin reloads with different shape', async () => {
      // The manager's reload sequence calls `loadFromURL` (which registers
      // the new module) BEFORE disposing/unregistering the old one. The
      // PluginRegistry rejects re-registering the same id while the old
      // entry is still present, so a real hot-reload that changes
      // `manifest.id` is the supported path. We use distinct ids here to
      // match that contract; the test still verifies the schema registry
      // is correctly torn down for the old id and re-registered for the
      // new id.
      const v1Schema: PluginSettingsSchema = {
        settings: [{ key: 'foo', label: 'Foo', type: 'string', default: 'a' }],
      };
      const v2Schema: PluginSettingsSchema = {
        settings: [{ key: 'bar', label: 'Bar', type: 'number', default: 1 }],
      };

      const v1: Plugin = makePlugin({
        id: 'integ.schema-reload.v1',
        name: 'Schema Reload',
        version: '1.0.0',
        contributes: ['decoder'],
        settingsSchema: v1Schema,
      });
      const v2: Plugin = makePlugin({
        id: 'integ.schema-reload.v2',
        name: 'Schema Reload',
        version: '2.0.0',
        contributes: ['decoder'],
        settingsSchema: v2Schema,
      });

      const unregisterSpy = vi.spyOn(registry.settingsStore, 'unregisterSchema');
      const registerSpy = vi.spyOn(registry.settingsStore, 'registerSchema');

      registry.register(v1);
      await registry.activate(v1.manifest.id);
      // Stub loadFromURL: register the v2 plugin into the registry as if
      // we'd just imported it from disk.
      vi.spyOn(registry, 'loadFromURL').mockImplementation(async () => {
        registry.register(v2);
        return v2.manifest.id;
      });

      manager.trackURL(v1.manifest.id, 'http://localhost/plugin.ts');

      // Reset call counts so we only count reload-driven calls.
      unregisterSpy.mockClear();
      registerSpy.mockClear();

      const newId = await manager.reload(v1.manifest.id);

      expect(newId).toBe(v2.manifest.id);
      // dispose() flow calls unregisterSchema for the old plugin id.
      expect(unregisterSpy).toHaveBeenCalledWith(v1.manifest.id);
      // The newly-registered plugin re-registers a different schema shape.
      expect(registerSpy).toHaveBeenCalledWith(v2.manifest.id, v2Schema);

      // Final stored schema lives under the new id with the v2 keys.
      const settings = registry.settingsStore.getSettings(v2.manifest.id);
      expect(Object.keys(settings)).toEqual(['bar']);
      // Old id's settings are gone.
      expect(registry.settingsStore.getSettings(v1.manifest.id)).toEqual({});
    });
  });

  describe('coalesce-with-trailing-replay', () => {
    it('PHRINT-010: a burst of N events while one reload is in-flight produces at most 2 reloads', async () => {
      // We don't import the bridge module directly (it imports the
      // singleton pluginRegistry); instead we replicate its policy here so
      // we can drive it deterministically.
      const inFlight = new Map<PluginId, Promise<unknown>>();
      const pending = new Set<PluginId>();
      let reloadCount = 0;
      // Queue of resolvers so each manager.reload() call can be unblocked
      // independently (the in-flight reload + the trailing replay).
      const resolvers: Array<() => void> = [];

      vi.spyOn(manager, 'reload').mockImplementation(async (id) => {
        reloadCount += 1;
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        return id;
      });

      const triggerReload = (pluginId: PluginId): void => {
        if (inFlight.has(pluginId)) {
          pending.add(pluginId);
          return;
        }
        const run = manager
          .reload(pluginId)
          .catch(() => pending.delete(pluginId))
          .finally(() => {
            inFlight.delete(pluginId);
            if (pending.delete(pluginId)) {
              triggerReload(pluginId);
            }
          });
        inFlight.set(pluginId, run);
      };

      // Fire 5 events while the first reload is held open.
      for (let i = 0; i < 5; i++) {
        triggerReload('integ.coalesce');
      }

      // Only one reload has started so far.
      expect(reloadCount).toBe(1);

      // Resolve the in-flight reload; this unblocks finalizers which then
      // schedule the trailing replay.
      const first = resolvers.shift();
      if (first) first();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      // Resolve the trailing replay too.
      const second = resolvers.shift();
      if (second) second();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      // Exactly 2 reloads ran total (in-flight + 1 trailing replay) even
      // though 5 events were dispatched.
      expect(reloadCount).toBe(2);
    });
  });

  describe('real state-name signal contract', () => {
    it('PHRINT-020: pluginStateChanged emits state="active" (not "activated") and uses (value, oldValue) callback', async () => {
      const observed: Array<{
        current: { id: string; state: PluginState };
        previous: { id: string; state: PluginState };
      }> = [];

      registry.pluginStateChanged.connect((value, oldValue) => {
        observed.push({ current: value, previous: oldValue });
      });

      const plugin: Plugin = makePlugin({
        id: 'integ.state-names',
        name: 'State Names',
        version: '1.0.0',
        contributes: ['decoder'],
      });

      registry.register(plugin);
      await registry.activate('integ.state-names');

      const states = observed.map((o) => o.current.state);

      // Must include 'active' and never the misspelling 'activated'.
      expect(states).toContain('active');
      expect(states).not.toContain('activated' as PluginState);

      // Verify the callback received both value and oldValue arguments.
      const activeEvent = observed.find((o) => o.current.state === 'active');
      expect(activeEvent).toBeDefined();
      expect(activeEvent!.previous).toBeDefined();
      expect(activeEvent!.previous.id).toBe('integ.state-names');
      expect(activeEvent!.previous.state).toBe('initialized');
    });

    it('PHRINT-021: bridge-style URL tracking on "active" only fires once per activation', async () => {
      const trackUrlSpy = vi.spyOn(manager, 'trackURL');

      // Replicate the bridge's tracking subscription.
      registry.pluginStateChanged.connect((current) => {
        if (current.state !== 'active') return;
        manager.trackURL(current.id, `http://localhost/${current.id}.ts`);
      });

      const plugin: Plugin = makePlugin({
        id: 'integ.tracker',
        name: 'Tracker',
        version: '1.0.0',
        contributes: ['decoder'],
      });

      registry.register(plugin);
      await registry.activate('integ.tracker');

      // Exactly one trackURL call for the single 'active' transition.
      expect(trackUrlSpy).toHaveBeenCalledTimes(1);
      expect(trackUrlSpy).toHaveBeenCalledWith('integ.tracker', 'http://localhost/integ.tracker.ts');
    });
  });

  describe('reload returns new plugin id', () => {
    it('PHRINT-030: reload() resolves to the new plugin id (PR-2 signature change)', async () => {
      const v1: Plugin = makePlugin({
        id: 'integ.return-id.v1',
        name: 'Return Id',
        version: '1.0.0',
        contributes: ['decoder'],
      });
      const v2: Plugin = makePlugin({
        id: 'integ.return-id.v2',
        name: 'Return Id',
        version: '2.0.0',
        contributes: ['decoder'],
      });

      registry.register(v1);
      await registry.activate(v1.manifest.id);

      vi.spyOn(registry, 'loadFromURL').mockImplementation(async () => {
        registry.register(v2);
        return v2.manifest.id;
      });

      manager.trackURL(v1.manifest.id, 'http://localhost/plugin.ts');
      const result = await manager.reload(v1.manifest.id);

      expect(typeof result).toBe('string');
      // Pre-PR-2 the return type was `Promise<void>`; this assertion
      // documents the new contract: reload yields the post-reload id.
      expect(result).toBe(v2.manifest.id);
    });
  });

  // Suppress unused-import warning on PluginContext under noUnusedLocals.
  it('PHRINT-099: PluginContext type import is referenced', () => {
    const _ctx: PluginContext | undefined = undefined;
    expect(_ctx).toBeUndefined();
  });
});
