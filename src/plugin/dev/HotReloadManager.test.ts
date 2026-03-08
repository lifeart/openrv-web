import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotReloadManager } from './HotReloadManager';
import type { PluginRegistry } from '../PluginRegistry';
import type { Plugin } from '../types';

function createMockRegistry(): PluginRegistry {
  const plugins = new Map<string, Plugin>();

  return {
    getPlugin: vi.fn((id: string) => plugins.get(id)),
    getState: vi.fn(),
    dispose: vi.fn(),
    activate: vi.fn(),
    unregister: vi.fn(),
    loadFromURL: vi.fn(async (_url: string) => {
      // Simulate loading a plugin from URL
      const id = 'reloaded.plugin';
      plugins.set(id, {
        manifest: { id, name: 'Reloaded', version: '2.0.0', contributes: ['decoder'] },
        activate: vi.fn(),
      });
      return id;
    }),
  } as unknown as PluginRegistry;
}

describe('HotReloadManager', () => {
  let manager: HotReloadManager;
  let registry: ReturnType<typeof createMockRegistry>;

  beforeEach(() => {
    registry = createMockRegistry();
    manager = new HotReloadManager(registry);
  });

  describe('trackURL', () => {
    it('PHOT-001: tracks plugin URL', () => {
      manager.trackURL('test.plugin', 'http://localhost:3000/plugin.js');
      expect(manager.isTracked('test.plugin')).toBe(true);
    });

    it('PHOT-002: getTrackedPlugins returns all tracked', () => {
      manager.trackURL('a', 'http://a.com/p.js');
      manager.trackURL('b', 'http://b.com/p.js');
      expect(manager.getTrackedPlugins()).toEqual(['a', 'b']);
    });
  });

  describe('reload', () => {
    it('PHOT-010: throws if plugin not tracked', async () => {
      await expect(manager.reload('unknown')).rejects.toThrow('No URL tracked');
    });

    it('PHOT-011: disposes, unregisters, and reloads plugin', async () => {
      manager.trackURL('test.plugin', 'http://localhost:3000/plugin.js');

      await manager.reload('test.plugin');

      expect(registry.dispose).toHaveBeenCalledWith('test.plugin');
      expect(registry.unregister).toHaveBeenCalledWith('test.plugin');
      expect(registry.loadFromURL).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3000/plugin.js?t='));
      expect(registry.activate).toHaveBeenCalledWith('reloaded.plugin');
    });

    it('PHOT-012: preserves state via getState/restoreState', async () => {
      const savedState = { counter: 42 };
      const mockPlugin: Plugin = {
        manifest: { id: 'test.plugin', name: 'Test', version: '1.0.0', contributes: ['decoder'] },
        activate: vi.fn(),
        getState: vi.fn().mockReturnValue(savedState),
      };

      const restoreStateFn = vi.fn();
      const reloadedPlugin: Plugin = {
        manifest: { id: 'reloaded.plugin', name: 'Reloaded', version: '2.0.0', contributes: ['decoder'] },
        activate: vi.fn(),
        restoreState: restoreStateFn,
      };

      // Set up the registry to return our mock plugins
      (registry.getPlugin as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
        if (id === 'test.plugin') return mockPlugin;
        if (id === 'reloaded.plugin') return reloadedPlugin;
        return undefined;
      });

      manager.trackURL('test.plugin', 'http://localhost:3000/plugin.js');
      await manager.reload('test.plugin');

      expect(mockPlugin.getState).toHaveBeenCalled();
      expect(restoreStateFn).toHaveBeenCalledWith(savedState);
    });

    it('PHOT-013: handles cache-busting URL with query params', async () => {
      manager.trackURL('test.plugin', 'http://localhost:3000/plugin.js?v=1');
      await manager.reload('test.plugin');

      expect(registry.loadFromURL).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000/plugin.js?v=1&t='),
      );
    });
  });
});
