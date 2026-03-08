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
   * 2. Deactivate and dispose the plugin
   * 3. Unregister the old plugin
   * 4. Re-import the module with cache-busting
   * 5. Register and activate the new version
   * 6. Restore state (if captured and plugin implements restoreState())
   */
  async reload(pluginId: PluginId): Promise<void> {
    const url = this.pluginURLs.get(pluginId);
    if (!url) {
      throw new Error(`No URL tracked for plugin "${pluginId}". Use trackURL() first.`);
    }

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

    // 2. Deactivate and dispose
    await this.registry.dispose(pluginId);

    // 3. Unregister (need this to re-register with same ID)
    this.registry.unregister(pluginId);

    // 4. Re-import with cache-busting
    const cacheBustUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const newId = await this.registry.loadFromURL(cacheBustUrl);

    // 5. Activate
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
