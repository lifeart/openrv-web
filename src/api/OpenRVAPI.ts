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
import type { ViewerProvider, ColorAdjustmentProvider, CDLProvider } from './types';

import { PlaybackAPI } from './PlaybackAPI';
import { MediaAPI } from './MediaAPI';
import { AudioAPI } from './AudioAPI';
import { LoopAPI } from './LoopAPI';
import { ViewAPI } from './ViewAPI';
import { ColorAPI } from './ColorAPI';
import { MarkersAPI } from './MarkersAPI';
import { EventsAPI } from './EventsAPI';

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

  private _ready = false;

  constructor(config: OpenRVAPIConfig) {
    this.playback = new PlaybackAPI(config.session);
    this.media = new MediaAPI(config.session);
    this.audio = new AudioAPI(config.session);
    this.loop = new LoopAPI(config.session);
    this.view = new ViewAPI(config.viewer);
    this.color = new ColorAPI(config.colorControls, config.cdlControl);
    this.markers = new MarkersAPI(config.session);
    this.events = new EventsAPI(config.session, config.viewer);

    this._ready = true;
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
    this.events.dispose();
  }
}
