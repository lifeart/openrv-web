/**
 * HotReloadManager - Development-time hot reload for plugins.
 *
 * Allows plugin developers to iterate quickly by reloading plugin modules
 * without restarting the application. Optionally preserves plugin state
 * across reloads via getState()/restoreState() lifecycle hooks.
 */

import type { PluginId } from '../types';
import type { PluginRegistry } from '../PluginRegistry';

export class HotReloadManager {
  /** Track URL -> pluginId for reload */
  private pluginURLs = new Map<PluginId, string>();

  /** Guard against concurrent reloads */
  private reloading = new Set<PluginId>();

  /** Reference to the plugin registry */
  private registry: PluginRegistry;

  constructor(registry: PluginRegistry) {
    this.registry = registry;
  }

  /**
   * Register a plugin's source URL for hot-reload.
   */
  trackURL(pluginId: PluginId, url: string): void {
    this.pluginURLs.set(pluginId, url);
  }

  /**
   * Reload a plugin from its original URL.
   *
   * Steps:
   * 1. Capture state (if plugin implements getState())
   * 2. Re-import the module with cache-busting (old plugin stays intact on failure)
   * 3. Deactivate and dispose the old plugin
   * 4. Unregister the old plugin
   * 5. Activate the new version
   * 6. Restore state (if captured and plugin implements restoreState())
   */
  async reload(pluginId: PluginId): Promise<void> {
    const url = this.pluginURLs.get(pluginId);
    if (!url) {
      throw new Error(`No URL tracked for plugin "${pluginId}". Use trackURL() first.`);
    }

    if (this.reloading.has(pluginId)) {
      throw new Error(`Plugin "${pluginId}" is already being reloaded`);
    }

    this.reloading.add(pluginId);
    try {
      // 1. Capture state if available
      const plugin = this.registry.getPlugin(pluginId);
      let savedState: unknown = undefined;
      if (plugin && 'getState' in plugin && typeof plugin.getState === 'function') {
        try {
          savedState = plugin.getState();
        } catch (err) {
          console.warn(`[hot-reload:${pluginId}] getState() threw:`, err);
        }
      }

      // 2. Re-import with cache-busting BEFORE disposing old plugin
      const cacheBustUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      const newId = await this.registry.loadFromURL(cacheBustUrl);

      // 3. Deactivate and dispose old plugin (only after new one loaded successfully)
      await this.registry.dispose(pluginId);

      // 4. Unregister old plugin
      this.registry.unregister(pluginId);

      // 5. Activate new plugin
      await this.registry.activate(newId);

      // 6. Restore state if available
      if (savedState !== undefined) {
        const newPlugin = this.registry.getPlugin(newId);
        if (newPlugin && 'restoreState' in newPlugin && typeof newPlugin.restoreState === 'function') {
          try {
            newPlugin.restoreState(savedState);
          } catch (err) {
            console.warn(`[hot-reload:${pluginId}] restoreState() threw:`, err);
          }
        }
      }

      // Update tracked URL (same base, new plugin version)
      this.pluginURLs.delete(pluginId);
      this.pluginURLs.set(newId, url);
    } finally {
      this.reloading.delete(pluginId);
    }
  }

  /**
   * Get all tracked plugin IDs.
   */
  getTrackedPlugins(): PluginId[] {
    return Array.from(this.pluginURLs.keys());
  }

  /**
   * Check if a plugin has a tracked URL.
   */
  isTracked(pluginId: PluginId): boolean {
    return this.pluginURLs.has(pluginId);
  }
}
