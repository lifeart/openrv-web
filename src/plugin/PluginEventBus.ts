/**
 * PluginEventBus - Event subscription system for plugins.
 *
 * Provides plugins with:
 * - Read-only subscriptions to application events (bridged from EventsAPI)
 * - Plugin-to-plugin custom events (namespaced by plugin ID)
 * - Auto-cleanup of all subscriptions on deactivation
 */

import { EventEmitter } from '../utils/EventEmitter';
import type { EventsAPI, OpenRVEventName, OpenRVEventData } from '../api/EventsAPI';
import type { PluginId } from './types';

// ---------------------------------------------------------------------------
// Plugin Event Types
// ---------------------------------------------------------------------------

/** Application event names available to plugins (prefixed with "app:") */
export type AppEventName =
  | 'app:frameChange'
  | 'app:play'
  | 'app:pause'
  | 'app:stop'
  | 'app:speedChange'
  | 'app:volumeChange'
  | 'app:muteChange'
  | 'app:audioScrubEnabledChange'
  | 'app:loopModeChange'
  | 'app:inOutChange'
  | 'app:markerChange'
  | 'app:sourceLoaded'
  | 'app:error'
  | 'plugin:activated'
  | 'plugin:deactivated'
  | 'plugin:error';

/** Data types for app events */
export interface AppEventDataMap {
  'app:frameChange': OpenRVEventData['frameChange'];
  'app:play': void;
  'app:pause': void;
  'app:stop': void;
  'app:speedChange': OpenRVEventData['speedChange'];
  'app:volumeChange': OpenRVEventData['volumeChange'];
  'app:muteChange': OpenRVEventData['muteChange'];
  'app:audioScrubEnabledChange': OpenRVEventData['audioScrubEnabledChange'];
  'app:loopModeChange': OpenRVEventData['loopModeChange'];
  'app:inOutChange': OpenRVEventData['inOutChange'];
  'app:markerChange': OpenRVEventData['markerChange'];
  'app:sourceLoaded': OpenRVEventData['sourceLoaded'];
  'app:error': OpenRVEventData['error'];
  'plugin:activated': { id: PluginId };
  'plugin:deactivated': { id: PluginId };
  'plugin:error': { id: PluginId; error: string };
}

/** Custom plugin event (namespaced: "{pluginId}:{eventName}") */
export type PluginCustomEvent = string;

/**
 * Per-plugin event subscription interface.
 * All subscriptions are tracked for automatic cleanup on deactivation.
 */
export interface PluginEventSubscription {
  /** Subscribe to an application event */
  onApp<K extends AppEventName>(event: K, callback: (data: AppEventDataMap[K]) => void): () => void;
  /** One-shot subscription to an application event */
  onceApp<K extends AppEventName>(event: K, callback: (data: AppEventDataMap[K]) => void): () => void;
  /** Subscribe to a custom plugin event */
  onPlugin(event: PluginCustomEvent, callback: (data: unknown) => void): () => void;
  /** Emit a custom plugin event (auto-namespaced to this plugin's ID) */
  emitPlugin(event: string, data: unknown): void;
}

// ---------------------------------------------------------------------------
// Mapping from app event names to EventsAPI event names
// ---------------------------------------------------------------------------

const APP_EVENT_TO_API: Partial<Record<AppEventName, OpenRVEventName>> = {
  'app:frameChange': 'frameChange',
  'app:play': 'play',
  'app:pause': 'pause',
  'app:stop': 'stop',
  'app:speedChange': 'speedChange',
  'app:volumeChange': 'volumeChange',
  'app:muteChange': 'muteChange',
  'app:audioScrubEnabledChange': 'audioScrubEnabledChange',
  'app:loopModeChange': 'loopModeChange',
  'app:inOutChange': 'inOutChange',
  'app:markerChange': 'markerChange',
  'app:sourceLoaded': 'sourceLoaded',
  'app:error': 'error',
};

// ---------------------------------------------------------------------------
// PluginEventBus
// ---------------------------------------------------------------------------

/** Diagnostic warning threshold per plugin — not a hard cap. Exceeding this count logs a warning to help detect potential listener leaks. */
const MAX_LISTENERS_PER_PLUGIN = 50;

export class PluginEventBus {
  /** Custom plugin-to-plugin event emitter */
  private customEmitter = new EventEmitter();

  /** App event emitter for plugin lifecycle events (untyped to avoid EventMap constraint on void values) */
  private appEmitter = new EventEmitter();

  /** Track subscriptions per plugin for auto-cleanup */
  private pluginSubscriptions = new Map<PluginId, Array<() => void>>();

  /** Reference to the application's EventsAPI */
  private eventsAPI: EventsAPI | null = null;

  /**
   * Set the EventsAPI reference for bridging application events.
   * Called during bootstrap.
   */
  setEventsAPI(api: EventsAPI): void {
    this.eventsAPI = api;
  }

  /**
   * Emit a plugin lifecycle event (called by PluginRegistry).
   */
  emitPluginLifecycle(
    event: 'plugin:activated' | 'plugin:deactivated' | 'plugin:error',
    data: AppEventDataMap[typeof event],
  ): void {
    this.appEmitter.emit(event, data);
  }

  /**
   * Create a scoped event subscription interface for a specific plugin.
   * All subscriptions are tracked and cleaned up when disposePlugin() is called.
   */
  createSubscription(pluginId: PluginId): PluginEventSubscription {
    const bus = this;

    return {
      onApp<K extends AppEventName>(event: K, callback: (data: AppEventDataMap[K]) => void): () => void {
        return bus.subscribeApp(pluginId, event, callback, false);
      },

      onceApp<K extends AppEventName>(event: K, callback: (data: AppEventDataMap[K]) => void): () => void {
        return bus.subscribeApp(pluginId, event, callback, true);
      },

      onPlugin(event: PluginCustomEvent, callback: (data: unknown) => void): () => void {
        return bus.subscribeCustom(pluginId, event, callback);
      },

      emitPlugin(event: string, data: unknown): void {
        const namespacedEvent = `${pluginId}:${event}`;
        bus.customEmitter.emit(namespacedEvent, data);
      },
    };
  }

  /**
   * Clean up all subscriptions for a plugin (called on deactivation/disposal).
   */
  disposePlugin(pluginId: PluginId): void {
    const subs = this.pluginSubscriptions.get(pluginId);
    if (subs) {
      for (const unsub of subs) {
        unsub();
      }
      this.pluginSubscriptions.delete(pluginId);
    }
  }

  /**
   * Dispose the entire event bus (application shutdown).
   */
  dispose(): void {
    for (const pluginId of this.pluginSubscriptions.keys()) {
      this.disposePlugin(pluginId);
    }
    this.customEmitter.removeAllListeners();
    this.appEmitter.removeAllListeners();
    this.eventsAPI = null;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private trackSubscription(pluginId: PluginId, unsub: () => void): () => void {
    if (!this.pluginSubscriptions.has(pluginId)) {
      this.pluginSubscriptions.set(pluginId, []);
    }

    const subs = this.pluginSubscriptions.get(pluginId)!;
    if (subs.length >= MAX_LISTENERS_PER_PLUGIN) {
      console.warn(`[plugin:${pluginId}] Maximum listeners (${MAX_LISTENERS_PER_PLUGIN}) reached`);
    }

    subs.push(unsub);

    // Return a wrapper that also removes from tracking
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      unsub();
      const idx = subs.indexOf(unsub);
      if (idx >= 0) {
        subs.splice(idx, 1);
      }
    };
  }

  private subscribeApp<K extends AppEventName>(
    pluginId: PluginId,
    event: K,
    callback: (data: AppEventDataMap[K]) => void,
    once: boolean,
  ): () => void {
    // Plugin lifecycle events: subscribe to internal emitter
    if (event === 'plugin:activated' || event === 'plugin:deactivated' || event === 'plugin:error') {
      const wrappedCb = (data: AppEventDataMap[K]) => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[plugin:${pluginId}] Error in event listener for "${event}":`, err);
        }
      };

      const unsub = once ? this.appEmitter.once(event, wrappedCb as any) : this.appEmitter.on(event, wrappedCb as any);
      return this.trackSubscription(pluginId, unsub);
    }

    // Application events: bridge via EventsAPI
    const apiEvent = APP_EVENT_TO_API[event];
    if (!apiEvent) {
      console.warn(`[plugin:${pluginId}] Unknown app event "${event}"`);
      return () => {};
    }
    if (!this.eventsAPI) {
      console.warn(`[plugin:${pluginId}] Cannot subscribe to "${event}": EventsAPI not available`);
      return () => {};
    }

    const wrappedCb = (data: unknown) => {
      try {
        callback(data as AppEventDataMap[K]);
      } catch (err) {
        console.error(`[plugin:${pluginId}] Error in event listener for "${event}":`, err);
      }
    };

    // Cast to any to bridge the type boundary between AppEventDataMap and OpenRVEventData

    const unsub = once
      ? this.eventsAPI.once(apiEvent, wrappedCb as any)
      : this.eventsAPI.on(apiEvent, wrappedCb as any);

    return this.trackSubscription(pluginId, unsub);
  }

  private subscribeCustom(pluginId: PluginId, event: PluginCustomEvent, callback: (data: unknown) => void): () => void {
    const wrappedCb = (data: unknown) => {
      try {
        callback(data);
      } catch (err) {
        console.error(`[plugin:${pluginId}] Error in custom event listener for "${event}":`, err);
      }
    };
    const unsub = this.customEmitter.on(event, wrappedCb);
    return this.trackSubscription(pluginId, unsub);
  }
}
