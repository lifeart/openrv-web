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
      // 1. Capture state if available.
      //
      // The plugin contract says getState() should return a copy, but defensively
      // structuredClone the captured state. This protects against:
      //   - Plugins that accidentally return a reference to live state
      //   - Concurrent mutation of state during the capture/restore window
      //   - Subsequent code paths (or the new plugin's restoreState) mutating
      //     the snapshot back into the old plugin's live state
      //
      // structuredClone handles Maps, Sets, ArrayBuffers, typed arrays, etc.
      // If state contains non-cloneable values (functions, DOM nodes, class
      // instances), structuredClone throws DataCloneError; we fall back to the
      // raw reference with a console.warn so dev can fix their getState().
      const plugin = this.registry.getPlugin(pluginId);
      let savedState: unknown = undefined;
      if (plugin && 'getState' in plugin && typeof plugin.getState === 'function') {
        try {
          const rawState = plugin.getState();
          savedState = deepCloneState(rawState, pluginId);
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

/**
 * Defensively deep-clone plugin state captured for hot-reload.
 *
 * `null` and `undefined` short-circuit (nothing to clone). Primitives also
 * short-circuit since structuredClone is unnecessary work for them.
 *
 * If structuredClone throws (e.g., DataCloneError for functions, DOM nodes,
 * or class instances), we log a warning and return the raw reference. This
 * preserves the prior behavior — a hot-reload that *would* have worked
 * before this hardening continues to work — while alerting the developer
 * that their getState() should return a structurally cloneable value.
 *
 * Errors are not silently swallowed: the warn is gated behind a real failure
 * mode and includes the cause.
 */
function deepCloneState(state: unknown, pluginId: PluginId): unknown {
  if (state === null || state === undefined) {
    return state;
  }
  // Primitives are immutable; cloning is a no-op.
  if (typeof state !== 'object' && typeof state !== 'function') {
    return state;
  }
  // structuredClone is available in Node 17+ and all modern browsers.
  // Guard for the unlikely case it's missing (e.g., old test runners).
  if (typeof structuredClone !== 'function') {
    console.warn(
      `[hot-reload:${pluginId}] structuredClone unavailable; using raw state reference. ` +
        `Plugin getState() should return a copy per contract.`,
    );
    return state;
  }
  try {
    return structuredClone(state);
  } catch (err) {
    console.warn(
      `[hot-reload:${pluginId}] structuredClone failed (state contains non-cloneable values); ` +
        `falling back to raw reference. Plugin getState() should return a structurally cloneable copy.`,
      err,
    );
    return state;
  }
}
