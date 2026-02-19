/**
 * ExternalPresentation - Multi-device presentation via secondary browser windows.
 *
 * Opens a secondary window (or multiple windows) showing only the viewer canvas
 * without UI controls. Frame/playback state is synchronized between windows
 * using the BroadcastChannel API for low-latency, same-origin communication.
 *
 * Features:
 * - Open/close presentation windows
 * - Sync frame number, playback state, and color settings
 * - BroadcastChannel-based message passing (no server required)
 * - Window lifecycle management (detect external close)
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { ManagerBase } from '../../core/ManagerBase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Message types sent over BroadcastChannel */
export type PresentationMessageType =
  | 'syncFrame'
  | 'syncPlayback'
  | 'syncColor'
  | 'ping'
  | 'pong'
  | 'windowReady'
  | 'windowClosed';

/** Base message structure */
export interface PresentationMessage {
  type: PresentationMessageType;
  /** Sender window ID */
  senderId: string;
  /** Session ID to prevent cross-tab interference */
  sessionId: string;
  /** Timestamp */
  timestamp: number;
}

/** Frame sync message */
export interface SyncFrameMsg extends PresentationMessage {
  type: 'syncFrame';
  frame: number;
  totalFrames: number;
}

/** Playback state sync message */
export interface SyncPlaybackMsg extends PresentationMessage {
  type: 'syncPlayback';
  playing: boolean;
  playbackRate: number;
  frame: number;
}

/** Color settings sync message */
export interface SyncColorMsg extends PresentationMessage {
  type: 'syncColor';
  exposure?: number;
  gamma?: number;
  temperature?: number;
  tint?: number;
}

/** Ping message for liveness check */
export interface PingMsg extends PresentationMessage {
  type: 'ping';
}

/** Pong response */
export interface PongMsg extends PresentationMessage {
  type: 'pong';
}

/** Window ready notification */
export interface WindowReadyMsg extends PresentationMessage {
  type: 'windowReady';
}

/** Window closed notification */
export interface WindowClosedMsg extends PresentationMessage {
  type: 'windowClosed';
}

/** All message types union */
export type AnyPresentationMessage =
  | SyncFrameMsg
  | SyncPlaybackMsg
  | SyncColorMsg
  | PingMsg
  | PongMsg
  | WindowReadyMsg
  | WindowClosedMsg;

/** Presentation window state */
export interface PresentationWindowState {
  /** Unique ID for this window */
  id: string;
  /** Whether the window is open */
  open: boolean;
  /** The Window reference (null if closed or external) */
  windowRef: Window | null;
  /** Last activity timestamp */
  lastActivity: number;
}

export interface ExternalPresentationEvents extends EventMap {
  windowOpened: string; // window ID
  windowClosed: string; // window ID
  syncFrame: SyncFrameMsg;
  syncPlayback: SyncPlaybackMsg;
  syncColor: SyncColorMsg;
  windowReady: string; // window ID
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNEL_NAME = 'openrv-presentation';
const WINDOW_CHECK_INTERVAL = 2000; // ms
const DEFAULT_WINDOW_FEATURES = 'width=1280,height=720,resizable=yes,scrollbars=no,menubar=no,toolbar=no,location=no,status=no';

// ---------------------------------------------------------------------------
// Presentation HTML template
// ---------------------------------------------------------------------------

/**
 * Generate the HTML content for a presentation window.
 * This creates a minimal page with just a canvas element for rendering.
 */
export function generatePresentationHTML(windowId: string, channelName: string, sessionId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OpenRV Presentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
    .info { position: fixed; bottom: 8px; right: 8px; color: #666; font: 12px monospace; pointer-events: none; }
  </style>
</head>
<body>
  <canvas id="viewer"></canvas>
  <div class="info" id="info">Presentation: ${windowId}</div>
  <script>
    const WINDOW_ID = '${windowId}';
    const SESSION_ID = '${sessionId}';
    const channel = new BroadcastChannel('${channelName}');

    // Notify main window that we're ready
    channel.postMessage({
      type: 'windowReady',
      senderId: WINDOW_ID,
      sessionId: SESSION_ID,
      timestamp: Date.now(),
    });

    // Handle messages
    channel.onmessage = function(event) {
      const msg = event.data;
      if (!msg || !msg.type) return;

      // Filter by session ID to prevent cross-tab interference
      if (msg.sessionId && msg.sessionId !== SESSION_ID) return;

      switch (msg.type) {
        case 'ping':
          channel.postMessage({
            type: 'pong',
            senderId: WINDOW_ID,
            sessionId: SESSION_ID,
            timestamp: Date.now(),
          });
          break;
        case 'syncFrame':
          document.getElementById('info').textContent =
            'Frame: ' + msg.frame + ' / ' + msg.totalFrames;
          break;
      }
    };

    // Notify on close
    window.addEventListener('beforeunload', function() {
      channel.postMessage({
        type: 'windowClosed',
        senderId: WINDOW_ID,
        sessionId: SESSION_ID,
        timestamp: Date.now(),
      });
    });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// ExternalPresentation class
// ---------------------------------------------------------------------------

/**
 * ExternalPresentation manages secondary presentation windows and
 * synchronizes frame/playback/color state between them.
 *
 * Usage:
 * ```ts
 * const presenter = new ExternalPresentation();
 * presenter.initialize();
 * const windowId = presenter.openWindow();
 *
 * // Sync state
 * presenter.syncFrame(42, 100);
 * presenter.syncPlayback(true, 1.0, 42);
 *
 * // Close
 * presenter.closeWindow(windowId);
 * presenter.dispose();
 * ```
 */
export class ExternalPresentation extends EventEmitter<ExternalPresentationEvents> implements ManagerBase {
  private instanceId: string;
  private sessionId: string;
  private channel: BroadcastChannel | null = null;
  private windows = new Map<string, PresentationWindowState>();
  private windowCheckTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private _windowOpenFn: ((url: string, target: string, features: string) => Window | null) | null = null;

  constructor() {
    super();
    this.instanceId = `main-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Unique session ID prevents cross-tab interference when multiple
    // OpenRV instances share the same BroadcastChannel name
    this.sessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** The unique ID of this main window instance. */
  get id(): string {
    return this.instanceId;
  }

  /** Number of currently open presentation windows. */
  get windowCount(): number {
    let count = 0;
    for (const w of this.windows.values()) {
      if (w.open) count++;
    }
    return count;
  }

  /** Whether any presentation windows are open. */
  get hasOpenWindows(): boolean {
    return this.windowCount > 0;
  }

  /**
   * Override the window.open function (for testing).
   */
  setWindowOpenFn(fn: (url: string, target: string, features: string) => Window | null): void {
    this._windowOpenFn = fn;
  }

  /**
   * Initialize the BroadcastChannel and start window monitoring.
   */
  initialize(): void {
    if (this.channel) return;

    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event) => {
      this.handleMessage(event.data as AnyPresentationMessage);
    };

    // Start periodic window check
    this.windowCheckTimer = setInterval(() => {
      this.checkWindows();
    }, WINDOW_CHECK_INTERVAL);
  }

  /**
   * Clean up all resources and close all windows.
   */
  dispose(): void {
    this.disposed = true;

    // Close all presentation windows
    for (const [id] of this.windows) {
      this.closeWindow(id);
    }
    this.windows.clear();

    // Stop window check timer
    if (this.windowCheckTimer !== null) {
      clearInterval(this.windowCheckTimer);
      this.windowCheckTimer = null;
    }

    // Close channel
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Window management
  // ---------------------------------------------------------------------------

  /**
   * Open a new presentation window.
   *
   * @param features - Optional window.open features string
   * @returns The window ID, or null if the window could not be opened
   */
  openWindow(features?: string): string | null {
    if (this.disposed) return null;

    const windowId = `pres-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Generate presentation page content with session ID for isolation
    const html = generatePresentationHTML(windowId, CHANNEL_NAME, this.sessionId);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Open the window
    const openFn = this._windowOpenFn ?? window.open.bind(window);
    const windowRef = openFn(url, windowId, features ?? DEFAULT_WINDOW_FEATURES);

    // Revoke the blob URL after a short delay (the window has already loaded it)
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    if (!windowRef) {
      // Popup blocker may have prevented the window from opening
      return null;
    }

    const state: PresentationWindowState = {
      id: windowId,
      open: true,
      windowRef,
      lastActivity: Date.now(),
    };

    this.windows.set(windowId, state);
    this.emit('windowOpened', windowId);

    return windowId;
  }

  /**
   * Close a specific presentation window.
   */
  closeWindow(id: string): boolean {
    const state = this.windows.get(id);
    if (!state) return false;

    if (state.windowRef && !state.windowRef.closed) {
      state.windowRef.close();
    }

    state.open = false;
    state.windowRef = null;
    this.windows.delete(id);
    this.emit('windowClosed', id);
    return true;
  }

  /**
   * Close all presentation windows.
   */
  closeAll(): void {
    for (const [id] of this.windows) {
      this.closeWindow(id);
    }
  }

  /**
   * Get the state of all windows.
   */
  getWindows(): PresentationWindowState[] {
    return Array.from(this.windows.values());
  }

  /**
   * Check if a specific window is still open.
   */
  isWindowOpen(id: string): boolean {
    const state = this.windows.get(id);
    if (!state) return false;
    return state.open && state.windowRef !== null && !state.windowRef.closed;
  }

  // ---------------------------------------------------------------------------
  // State synchronization
  // ---------------------------------------------------------------------------

  /**
   * Sync the current frame to all presentation windows.
   */
  syncFrame(frame: number, totalFrames: number): void {
    this.broadcast({
      type: 'syncFrame',
      senderId: this.instanceId,
      timestamp: Date.now(),
      frame,
      totalFrames,
    });
  }

  /**
   * Sync playback state to all presentation windows.
   */
  syncPlayback(playing: boolean, playbackRate: number, frame: number): void {
    this.broadcast({
      type: 'syncPlayback',
      senderId: this.instanceId,
      timestamp: Date.now(),
      playing,
      playbackRate,
      frame,
    });
  }

  /**
   * Sync color settings to all presentation windows.
   */
  syncColor(settings: Omit<SyncColorMsg, 'type' | 'senderId' | 'timestamp'>): void {
    this.broadcast({
      type: 'syncColor',
      senderId: this.instanceId,
      timestamp: Date.now(),
      ...settings,
    } as SyncColorMsg);
  }

  /**
   * Send a ping to all presentation windows.
   */
  ping(): void {
    this.broadcast({
      type: 'ping',
      senderId: this.instanceId,
      timestamp: Date.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private broadcast(message: AnyPresentationMessage): void {
    if (!this.channel) return;
    try {
      // Attach session ID to all outbound messages
      this.channel.postMessage({ ...message, sessionId: this.sessionId });
    } catch {
      // Channel may have been closed
    }
  }

  private handleMessage(message: AnyPresentationMessage): void {
    if (!message || !message.type) return;

    // Ignore our own messages
    if (message.senderId === this.instanceId) return;

    // Filter by session ID to prevent cross-tab interference
    if (message.sessionId && message.sessionId !== this.sessionId) return;

    // Update window activity timestamp
    const window = this.windows.get(message.senderId);
    if (window) {
      window.lastActivity = Date.now();
    }

    switch (message.type) {
      case 'windowReady':
        this.emit('windowReady', message.senderId);
        break;

      case 'windowClosed': {
        const w = this.windows.get(message.senderId);
        if (w) {
          w.open = false;
          w.windowRef = null;
          this.windows.delete(message.senderId);
          this.emit('windowClosed', message.senderId);
        }
        break;
      }

      case 'syncFrame':
        this.emit('syncFrame', message as SyncFrameMsg);
        break;

      case 'syncPlayback':
        this.emit('syncPlayback', message as SyncPlaybackMsg);
        break;

      case 'syncColor':
        this.emit('syncColor', message as SyncColorMsg);
        break;

      case 'pong':
        // Handled by activity timestamp update above
        break;
    }
  }

  /**
   * Periodically check if presentation windows are still open.
   * Windows may be closed by the user without notifying us.
   */
  private checkWindows(): void {
    for (const [id, state] of this.windows) {
      if (state.windowRef && state.windowRef.closed) {
        state.open = false;
        state.windowRef = null;
        this.windows.delete(id);
        this.emit('windowClosed', id);
      }
    }
  }
}
