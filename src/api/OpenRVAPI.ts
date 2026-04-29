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
import type { PlaylistManager } from '../core/session/PlaylistManager';
import type {
  ViewerProvider,
  ColorAdjustmentProvider,
  CDLProvider,
  CurvesProvider,
  LUTProvider,
  LUTPipelineProvider,
  ToneMappingProvider,
  DisplayProvider,
  DisplayCapabilitiesProvider,
  OCIOProvider,
  PixelProbeProvider,
} from './types';

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
import { SequenceAPI } from './SequenceAPI';
import { APIError } from '../core/errors';
import { ENGINE_VERSION } from '../plugin/version';

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
  /** Optional LUT provider for LUT load/clear/intensity control */
  lutProvider?: LUTProvider;
  /**
   * Optional LUT pipeline provider for per-stage output color-space
   * declarations (Pre-Cache / File / Look / Display).
   *
   * Sibling of {@link lutProvider}: kept as a separate field so that hosts
   * exposing only the simple single-LUT surface can omit it.
   */
  lutPipelineProvider?: LUTPipelineProvider;
  /** Optional tone mapping provider for tone mapping state control */
  toneMappingProvider?: ToneMappingProvider;
  /** Optional display profile provider for display color management */
  displayProvider?: DisplayProvider;
  /** Optional display capabilities provider for querying display features */
  displayCapabilitiesProvider?: DisplayCapabilitiesProvider;
  /** Optional OCIO provider for OpenColorIO pipeline control */
  ocioProvider?: OCIOProvider;
  /** Optional persistence manager for auto-checkpoint creation before destructive API operations */
  persistenceManager?: import('../AppPersistenceManager').AppPersistenceManager;
  /** Optional playlist manager for playlist-aware frame/duration in the public API */
  playlistManager?: PlaylistManager;
  /** Optional pixel probe provider for pixel-probe control through the view API */
  pixelProbeProvider?: PixelProbeProvider;
}

/**
 * The main OpenRV public API
 */
export class OpenRVAPI {
  /** API version following semver, derived from package.json */
  readonly version: string = ENGINE_VERSION;

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

  /** Sequence inspection methods */
  readonly sequence: SequenceAPI;

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
    this.media = new MediaAPI(config.session, config.persistenceManager);
    this.audio = new AudioAPI(config.session);
    this.loop = new LoopAPI(config.session);
    this.sequence = new SequenceAPI(config.session);
    this.view = new ViewAPI(config.viewer, config.pixelProbeProvider);
    this.color = new ColorAPI(
      config.colorControls,
      config.cdlControl,
      config.curvesControl,
      config.lutProvider,
      config.toneMappingProvider,
      config.displayProvider,
      config.displayCapabilitiesProvider,
      config.ocioProvider,
      config.lutPipelineProvider,
    );
    this.markers = new MarkersAPI(config.session);
    this.events = new EventsAPI(config.session, config.viewer);

    // Wire playlist manager into sub-APIs for playlist-aware behavior
    if (config.playlistManager) {
      this.playback.setPlaylistManager(config.playlistManager);
      this.events.setPlaylistManager(config.playlistManager);
    }
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

    // Detach the singleton plugin registry so that plugin contexts no longer
    // hold a reference to this (now-dead) API instance or its EventsAPI.
    pluginRegistry.detach();
  }
}
