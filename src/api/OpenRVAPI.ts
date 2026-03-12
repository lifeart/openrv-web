/**
 * OpenRVAPI - Main public API class for OpenRV Web
 *
 * Exposed as `window.openrv` to allow external scripting and browser console control.
 * Composes all sub-API modules into a single namespace.
 *
 * Usage from browser console:
 *   window.openrv.playback.play()
 *   window.openrv.playback.seek(100)
 *   window.openrv.view.setZoom(2)
 *   window.openrv.events.on('frameChange', (data) => console.log(data.frame))
 */

import type { Session } from '../core/session/Session';
import type { ViewerProvider, ColorAdjustmentProvider, CDLProvider, CurvesProvider } from './types';

import { PlaybackAPI } from './PlaybackAPI';
import { MediaAPI } from './MediaAPI';
import { AudioAPI } from './AudioAPI';
import { LoopAPI } from './LoopAPI';
import { ViewAPI } from './ViewAPI';
import { ColorAPI } from './ColorAPI';
import { MarkersAPI } from './MarkersAPI';
import { EventsAPI } from './EventsAPI';
import { pluginRegistry } from '../plugin/PluginRegistry';
import type { Plugin, PluginId, PluginState } from '../plugin/types';
import { APIError } from '../core/errors';

/**
 * Configuration passed to initialize the API.
 *
 * Uses abstract provider interfaces so that any object implementing the
 * required methods can be supplied — concrete UI classes (Viewer,
 * ColorControls, CDLControl) satisfy these via structural typing.
 */
export interface OpenRVAPIConfig {
  session: Session;
  viewer: ViewerProvider;
  colorControls: ColorAdjustmentProvider;
  cdlControl: CDLProvider;
  curvesControl: CurvesProvider;
}

/**
 * The main OpenRV public API
 */
export class OpenRVAPI {
  /** API version following semver */
  readonly version: string = '1.0.0';

  /** Playback control methods */
  readonly playback: PlaybackAPI;

  /** Media information methods */
  readonly media: MediaAPI;

  /** Audio control methods */
  readonly audio: AudioAPI;

  /** Loop control methods */
  readonly loop: LoopAPI;

  /** View control methods */
  readonly view: ViewAPI;

  /** Color adjustment methods */
  readonly color: ColorAPI;

  /** Marker management methods */
  readonly markers: MarkersAPI;

  /** Event subscription methods */
  readonly events: EventsAPI;

  /** Plugin management */
  readonly plugins = {
    /** Register a plugin object */
    register: (plugin: Plugin) => {
      this.assertNotDisposed();
      return pluginRegistry.register(plugin);
    },
    /** Activate a registered plugin */
    activate: (id: PluginId) => {
      this.assertNotDisposed();
      return pluginRegistry.activate(id);
    },
    /** Deactivate an active plugin */
    deactivate: (id: PluginId) => {
      this.assertNotDisposed();
      return pluginRegistry.deactivate(id);
    },
    /** Load and register a plugin from a URL */
    loadFromURL: (url: string) => {
      this.assertNotDisposed();
      return pluginRegistry.loadFromURL(url);
    },
    /** Get current state of a plugin */
    getState: (id: PluginId): PluginState | undefined => {
      this.assertNotDisposed();
      return pluginRegistry.getState(id);
    },
    /** List all registered plugin IDs */
    list: () => {
      this.assertNotDisposed();
      return pluginRegistry.getRegisteredIds();
    },
    /** Dispose a plugin (deactivate + run cleanup; must unregister before re-registering) */
    dispose: (id: PluginId) => {
      this.assertNotDisposed();
      return pluginRegistry.dispose(id);
    },
    /** Unregister a disposed plugin, removing it entirely so it can be re-registered */
    unregister: (id: PluginId) => {
      this.assertNotDisposed();
      return pluginRegistry.unregister(id);
    },
  };

  private _ready = false;
  private _disposed = false;
  private _readyListeners: Array<() => void> = [];

  /**
   * Throw an `APIError` if the API has been disposed.
   */
  private assertNotDisposed(): void {
    if (this._disposed) {
      throw new APIError('Cannot use API after dispose() has been called');
    }
  }

  constructor(config: OpenRVAPIConfig) {
    this.playback = new PlaybackAPI(config.session);
    this.media = new MediaAPI(config.session);
    this.audio = new AudioAPI(config.session);
    this.loop = new LoopAPI(config.session);
    this.view = new ViewAPI(config.viewer);
    this.color = new ColorAPI(config.colorControls, config.cdlControl, config.curvesControl);
    this.markers = new MarkersAPI(config.session);
    this.events = new EventsAPI(config.session, config.viewer);
  }

  /**
   * Mark the API as ready for use.
   *
   * Called by the bootstrap sequence after all async mount-time initialization
   * has completed (persistence, URL bootstrap, etc.). External consumers should
   * not call this method directly.
   */
  markReady(): void {
    if (this._disposed) return;
    this._ready = true;
    for (const listener of this._readyListeners) {
      listener();
    }
    this._readyListeners = [];
  }

  /**
   * Register a one-time callback that fires when the API becomes ready.
   * If the API is already ready, the callback fires synchronously.
   *
   * @param callback - Function to invoke when the API is ready.
   *
   * @example
   * ```ts
   * openrv.onReady(() => { openrv.playback.play(); });
   * ```
   */
  onReady(callback: () => void): void {
    if (this._ready) {
      callback();
    } else {
      this._readyListeners.push(callback);
    }
  }

  /**
   * Check if the API is initialized and ready for use.
   *
   * @returns `true` once the constructor has completed, `false` after {@link dispose} is called.
   *
   * @example
   * ```ts
   * if (openrv.isReady()) { openrv.playback.play(); }
   * ```
   */
  isReady(): boolean {
    return this._ready;
  }

  /**
   * Clean up all listeners and resources. After calling this, the API
   * instance should not be used (isReady() will return false).
   *
   * @example
   * ```ts
   * openrv.dispose();
   * ```
   */
  dispose(): void {
    this._ready = false;
    this._disposed = true;
    this._readyListeners = [];
    this.playback.dispose();
    this.media.dispose();
    this.audio.dispose();
    this.loop.dispose();
    this.view.dispose();
    this.color.dispose();
    this.markers.dispose();
    this.events.dispose();
  }
}
