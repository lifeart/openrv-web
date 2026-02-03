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
import type { Viewer } from '../ui/components/Viewer';
import type { ColorControls } from '../ui/components/ColorControls';
import type { CDLControl } from '../ui/components/CDLControl';

import { PlaybackAPI } from './PlaybackAPI';
import { MediaAPI } from './MediaAPI';
import { AudioAPI } from './AudioAPI';
import { LoopAPI } from './LoopAPI';
import { ViewAPI } from './ViewAPI';
import { ColorAPI } from './ColorAPI';
import { MarkersAPI } from './MarkersAPI';
import { EventsAPI } from './EventsAPI';

/**
 * Configuration passed to initialize the API
 */
export interface OpenRVAPIConfig {
  session: Session;
  viewer: Viewer;
  colorControls: ColorControls;
  cdlControl: CDLControl;
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
   * Check if the API is initialized and ready for use
   */
  isReady(): boolean {
    return this._ready;
  }

  /**
   * Clean up all listeners and resources
   */
  dispose(): void {
    this._ready = false;
    this.events.dispose();
  }
}
