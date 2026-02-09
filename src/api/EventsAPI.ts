/**
 * EventsAPI - Public event subscription system for the OpenRV API
 *
 * Bridges internal EventEmitter events to the public API surface.
 * Supports on/off/once patterns with unsubscribe functions.
 */

import type { Session } from '../core/session/Session';
import type { ViewerProvider } from './types';
import { ValidationError } from '../core/errors';

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
  | 'loopModeChange'
  | 'inOutChange'
  | 'markerChange'
  | 'sourceLoaded'
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
  loopModeChange: { mode: string };
  inOutChange: { inPoint: number; outPoint: number };
  markerChange: { markers: Array<{ frame: number; note: string; color: string }> };
  sourceLoaded: { name: string; type: string; width: number; height: number; duration: number; fps: number };
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
  'loopModeChange',
  'inOutChange',
  'markerChange',
  'sourceLoaded',
  'error',
]);

export class EventsAPI {
  private listeners = new Map<OpenRVEventName, Set<EventCallback>>();
  private internalUnsubscribers: Array<() => void> = [];
  private session: Session;

  constructor(session: Session, _viewer: ViewerProvider) {
    this.session = session;
    // Viewer parameter accepted for future extension (e.g., zoom/pan change events)
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
    return Array.from(VALID_EVENTS);
  }

  private validateEventName(event: string): asserts event is OpenRVEventName {
    if (typeof event !== 'string' || !VALID_EVENTS.has(event as OpenRVEventName)) {
      throw new ValidationError(
        `Invalid event name: "${event}". Valid events: ${Array.from(VALID_EVENTS).join(', ')}`
      );
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
      const markers = Array.from(marks.values()).map((m) => ({
        frame: m.frame,
        note: m.note,
        color: m.color,
      }));
      this.emit('markerChange', { markers });
    });
    this.internalUnsubscribers.push(unsubMarks);

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
   * Clean up all listeners and internal subscriptions.
   * After calling this, the EventsAPI instance should not be used.
   */
  dispose(): void {
    // Remove all internal subscriptions
    for (const unsub of this.internalUnsubscribers) {
      unsub();
    }
    this.internalUnsubscribers = [];

    // Clear all external listeners
    this.listeners.clear();
  }
}
