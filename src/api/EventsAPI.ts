/**
 * EventsAPI - Public event subscription system for the OpenRV API
 *
 * Bridges internal EventEmitter events to the public API surface.
 * Supports on/off/once patterns with unsubscribe functions.
 */

import type { Session } from '../core/session/Session';
import type { ViewerProvider } from './types';
import { ValidationError } from '../core/errors';
import { DisposableAPI } from './Disposable';

/**
 * Events that can be subscribed to via the public API
 */
export type OpenRVEventName =
  | 'frameChange'
  | 'play'
  | 'pause'
  | 'stop'
  | 'speedChange'
  | 'volumeChange'
  | 'muteChange'
  | 'audioScrubEnabledChange'
  | 'loopModeChange'
  | 'inOutChange'
  | 'markerChange'
  | 'sourceLoadingStarted'
  | 'sourceLoaded'
  | 'sourceLoadFailed'
  | 'viewTransformChanged'
  | 'renderedImagesChanged'
  | 'error';

/**
 * Event data types for each event
 */
export interface OpenRVEventData {
  frameChange: { frame: number };
  play: void;
  pause: void;
  stop: void;
  speedChange: { speed: number };
  volumeChange: { volume: number };
  muteChange: { muted: boolean };
  audioScrubEnabledChange: { enabled: boolean };
  loopModeChange: { mode: string };
  inOutChange: { inPoint: number; outPoint: number };
  markerChange: { markers: Array<{ frame: number; note: string; color: string; endFrame?: number }> };
  sourceLoadingStarted: { name: string };
  sourceLoaded: { name: string; type: string; width: number; height: number; duration: number; fps: number };
  sourceLoadFailed: { name: string };
  viewTransformChanged: {
    viewWidth: number;
    viewHeight: number;
    scale: number;
    translation: [number, number];
    imageWidth: number;
    imageHeight: number;
    pixelAspect: number;
  };
  renderedImagesChanged: {
    images: Array<{
      name: string;
      index: number;
      imageMin: [number, number];
      imageMax: [number, number];
      width: number;
      height: number;
      nodeName: string;
    }>;
  };
  error: { message: string; code?: string };
}

type EventCallback<T = unknown> = (data: T) => void;

const VALID_EVENTS: ReadonlySet<OpenRVEventName> = new Set([
  'frameChange',
  'play',
  'pause',
  'stop',
  'speedChange',
  'volumeChange',
  'muteChange',
  'audioScrubEnabledChange',
  'loopModeChange',
  'inOutChange',
  'markerChange',
  'sourceLoadingStarted',
  'sourceLoaded',
  'sourceLoadFailed',
  'viewTransformChanged',
  'renderedImagesChanged',
  'error',
]);

export class EventsAPI extends DisposableAPI {
  private listeners = new Map<OpenRVEventName, Set<EventCallback>>();
  private internalUnsubscribers: Array<() => void> = [];
  private session: Session;
  private viewer: ViewerProvider;

  /** Last loaded source info, used to build RenderedImageInfo on view changes */
  private _lastLoadedSource: { name: string; width: number; height: number } | null = null;

  constructor(session: Session, viewer: ViewerProvider) {
    super();
    this.session = session;
    this.viewer = viewer;
    this.wireInternalEvents();
  }

  /**
   * Subscribe to an event. The callback is invoked each time the event fires.
   *
   * @param event - The event name to listen for (see {@link OpenRVEventName}).
   * @param callback - Handler function receiving the event-specific data payload.
   * @returns An idempotent unsubscribe function. Call it to stop listening.
   * @throws {ValidationError} If `event` is not a valid event name or `callback` is not a function.
   *
   * @example
   * ```ts
   * const unsub = openrv.events.on('frameChange', (d) => console.log(d.frame));
   * unsub(); // stop listening
   * ```
   */
  on<K extends OpenRVEventName>(event: K, callback: EventCallback<OpenRVEventData[K]>): () => void {
    this.assertNotDisposed();
    this.validateEventName(event);
    this.validateCallback(callback);

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    // Return unsubscribe function; make it idempotent
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        this.off(event, callback);
      }
    };
  }

  /**
   * Unsubscribe a specific callback from an event.
   *
   * @param event - The event name to unsubscribe from.
   * @param callback - The exact callback reference that was passed to {@link on}.
   *
   * @example
   * ```ts
   * openrv.events.off('frameChange', myHandler);
   * ```
   */
  off<K extends OpenRVEventName>(event: K, callback: EventCallback<OpenRVEventData[K]>): void {
    this.assertNotDisposed();
    this.listeners.get(event)?.delete(callback as EventCallback);
  }

  /**
   * Subscribe to an event, firing the callback only once then automatically unsubscribing.
   *
   * @param event - The event name to listen for.
   * @param callback - Handler function invoked once with the event data.
   * @returns An unsubscribe function (can be called early to cancel before it fires).
   * @throws {ValidationError} If `event` is not a valid event name or `callback` is not a function.
   *
   * @example
   * ```ts
   * openrv.events.once('sourceLoaded', (d) => console.log(d.name));
   * ```
   */
  once<K extends OpenRVEventName>(event: K, callback: EventCallback<OpenRVEventData[K]>): () => void {
    this.assertNotDisposed();
    this.validateEventName(event);
    this.validateCallback(callback);

    const wrapper: EventCallback<OpenRVEventData[K]> = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Get the list of all valid event names that can be subscribed to.
   *
   * @returns An array of valid event name strings.
   *
   * @example
   * ```ts
   * const names = openrv.events.getEventNames();
   * ```
   */
  getEventNames(): OpenRVEventName[] {
    this.assertNotDisposed();
    return Array.from(VALID_EVENTS);
  }

  private validateEventName(event: string): asserts event is OpenRVEventName {
    if (typeof event !== 'string' || !VALID_EVENTS.has(event as OpenRVEventName)) {
      throw new ValidationError(`Invalid event name: "${event}". Valid events: ${Array.from(VALID_EVENTS).join(', ')}`);
    }
  }

  /**
   * Validate that a callback is a function
   */
  private validateCallback(callback: unknown): asserts callback is EventCallback {
    if (typeof callback !== 'function') {
      throw new ValidationError('Event callback must be a function');
    }
  }

  private emit<K extends OpenRVEventName>(event: K, data: OpenRVEventData[K]): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error(`[OpenRV API] Error in event listener for "${event}":`, err);
      }
    });
  }

  /**
   * Wire internal Session/Viewer events to the public API events
   */
  private wireInternalEvents(): void {
    // Frame changes
    const unsubFrame = this.session.on('frameChanged', (frame) => {
      this.emit('frameChange', { frame });
    });
    this.internalUnsubscribers.push(unsubFrame);

    // Playback state
    const unsubPlayback = this.session.on('playbackChanged', (isPlaying) => {
      if (isPlaying) {
        this.emit('play', undefined as void);
      } else {
        this.emit('pause', undefined as void);
      }
    });
    this.internalUnsubscribers.push(unsubPlayback);

    // Stop (pause + return to start)
    const unsubStop = this.session.on('playbackStopped', () => {
      this.emit('stop', undefined as void);
    });
    this.internalUnsubscribers.push(unsubStop);

    // Speed changes
    const unsubSpeed = this.session.on('playbackSpeedChanged', (speed) => {
      this.emit('speedChange', { speed });
    });
    this.internalUnsubscribers.push(unsubSpeed);

    // Volume changes
    const unsubVolume = this.session.on('volumeChanged', (volume) => {
      this.emit('volumeChange', { volume });
    });
    this.internalUnsubscribers.push(unsubVolume);

    // Mute changes
    const unsubMute = this.session.on('mutedChanged', (muted) => {
      this.emit('muteChange', { muted });
    });
    this.internalUnsubscribers.push(unsubMute);

    // Audio scrub enabled changes
    const unsubAudioScrub = this.session.on('audioScrubEnabledChanged', (enabled) => {
      this.emit('audioScrubEnabledChange', { enabled });
    });
    this.internalUnsubscribers.push(unsubAudioScrub);

    // Loop mode changes
    const unsubLoop = this.session.on('loopModeChanged', (mode) => {
      this.emit('loopModeChange', { mode });
    });
    this.internalUnsubscribers.push(unsubLoop);

    // In/Out point changes
    const unsubInOut = this.session.on('inOutChanged', (data) => {
      this.emit('inOutChange', data);
    });
    this.internalUnsubscribers.push(unsubInOut);

    // Marker changes
    const unsubMarks = this.session.on('marksChanged', (marks) => {
      const markers = Array.from(marks.values()).map((m) => {
        const entry: { frame: number; note: string; color: string; endFrame?: number } = {
          frame: m.frame,
          note: m.note,
          color: m.color,
        };
        if (m.endFrame !== undefined) {
          entry.endFrame = m.endFrame;
        }
        return entry;
      });
      this.emit('markerChange', { markers });
    });
    this.internalUnsubscribers.push(unsubMarks);

    // Source loading started
    const unsubSourceStart = this.session.on('sourceLoadingStarted', (data) => {
      this.emit('sourceLoadingStarted', { name: data.name });
    });
    this.internalUnsubscribers.push(unsubSourceStart);

    // Source loaded
    const unsubSource = this.session.on('sourceLoaded', (source) => {
      this.emit('sourceLoaded', {
        name: source.name,
        type: source.type,
        width: source.width,
        height: source.height,
        duration: source.duration,
        fps: source.fps,
      });
    });
    this.internalUnsubscribers.push(unsubSource);

    // Source load failed
    const unsubSourceFail = this.session.on('sourceLoadFailed', (data) => {
      this.emit('sourceLoadFailed', { name: data.name });
    });
    this.internalUnsubscribers.push(unsubSourceFail);

    // Error bridging — wire internal Session error events to the public error channel

    // Audio playback errors (autoplay blocked, decode failures, network issues)
    const unsubAudioError = this.session.on('audioError', (err) => {
      this.emitError(`Audio error: ${err.message}`, `AUDIO_${err.type.toUpperCase()}`);
    });
    this.internalUnsubscribers.push(unsubAudioError);

    // Unsupported codec errors (media cannot be decoded)
    const unsubCodec = this.session.on('unsupportedCodec', (info) => {
      const codec = info.codec ?? 'unknown';
      this.emitError(
        `Unsupported codec "${codec}" in ${info.filename}`,
        'UNSUPPORTED_CODEC',
      );
    });
    this.internalUnsubscribers.push(unsubCodec);

    // Media representation switch failures
    const unsubRepError = this.session.on('representationError', (data) => {
      this.emitError(
        `Representation error for source ${data.sourceIndex}: ${data.error}`,
        'REPRESENTATION_ERROR',
      );
    });
    this.internalUnsubscribers.push(unsubRepError);

    // Frame decode timeout in play-all-frames mode
    const unsubDecodeTimeout = this.session.on('frameDecodeTimeout', (frame) => {
      this.emitError(
        `Frame ${frame} decode timed out`,
        'FRAME_DECODE_TIMEOUT',
      );
    });
    this.internalUnsubscribers.push(unsubDecodeTimeout);

    // View transform changes — subscribe to viewer's view change listener if available
    if (this.viewer.addViewChangeListener) {
      const unsubView = this.viewer.addViewChangeListener((panX, panY, zoom) => {
        const { width: viewWidth, height: viewHeight } = this.viewer.getViewportSize();
        const source = this.viewer.getSourceDimensions?.() ?? { width: 0, height: 0 };
        this.emit('viewTransformChanged', {
          viewWidth,
          viewHeight,
          scale: zoom,
          translation: [panX, panY],
          imageWidth: source.width,
          imageHeight: source.height,
          pixelAspect: 1,
        });
        // Also update rendered images on view change (same source, new transform)
        if (this._lastLoadedSource) {
          this.emitCurrentRenderedImages();
        }
      });
      this.internalUnsubscribers.push(unsubView);
    }

    // Rendered images — emit when a source finishes loading
    const unsubSourceRendered = this.session.on('sourceLoaded', (source) => {
      this._lastLoadedSource = { name: source.name, width: source.width, height: source.height };
      this.emitCurrentRenderedImages();
    });
    this.internalUnsubscribers.push(unsubSourceRendered);
  }

  /** Emit the current rendered images state based on the last loaded source. */
  private emitCurrentRenderedImages(): void {
    if (!this._lastLoadedSource) return;
    const { name, width, height } = this._lastLoadedSource;
    this.emit('renderedImagesChanged', {
      images: [{
        name,
        index: 0,
        imageMin: [0, 0] as [number, number],
        imageMax: [width, height] as [number, number],
        width,
        height,
        nodeName: name,
      }],
    });
  }

  /**
   * Emit an error event (for internal use by other API modules).
   *
   * @param message - Human-readable error description.
   * @param code - Optional machine-readable error code.
   */
  emitError(message: string, code?: string): void {
    this.emit('error', { message, code });
  }

  /**
   * Emit a view transform changed event (for external wiring).
   */
  emitViewTransformChanged(data: OpenRVEventData['viewTransformChanged']): void {
    this.emit('viewTransformChanged', data);
  }

  /**
   * Emit a rendered images changed event (for external wiring).
   */
  emitRenderedImagesChanged(data: OpenRVEventData['renderedImagesChanged']): void {
    this.emit('renderedImagesChanged', data);
  }

  /**
   * Clean up all listeners and internal subscriptions.
   * After calling this, the EventsAPI instance should not be used.
   */
  override dispose(): void {
    super.dispose();
    // Remove all internal subscriptions
    for (const unsub of this.internalUnsubscribers) {
      unsub();
    }
    this.internalUnsubscribers = [];

    // Clear all external listeners
    this.listeners.clear();
  }
}
