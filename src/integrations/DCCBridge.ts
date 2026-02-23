/**
 * DCCBridge - WebSocket-based integration bridge for DCC tools.
 *
 * Enables communication between OpenRV Web and DCC applications
 * (Nuke, Maya, Houdini, etc.) using a JSON message protocol over WebSocket.
 *
 * Features:
 * - JSON-based message protocol with typed message handlers
 * - Auto-reconnect with exponential backoff
 * - Heartbeat (ping/pong) for connection health monitoring
 * - Inbound commands: loadMedia, syncFrame, syncColor, ping
 * - Outbound events: frameChanged, colorChanged, annotationAdded
 */

import { EventEmitter, EventMap } from '../utils/EventEmitter';
import type { ManagerBase } from '../core/ManagerBase';

// ---------------------------------------------------------------------------
// Protocol types
// ---------------------------------------------------------------------------

/** All supported inbound message types */
export type DCCInboundMessageType = 'loadMedia' | 'syncFrame' | 'syncColor' | 'ping';

/** All supported outbound message types */
export type DCCOutboundMessageType = 'frameChanged' | 'colorChanged' | 'annotationAdded' | 'pong' | 'error';

/** Base message structure */
export interface DCCMessage {
  type: string;
  /** Optional message ID for request-response correlation */
  id?: string;
  /** ISO 8601 timestamp */
  timestamp?: string;
}

/** Inbound: load a media file */
export interface LoadMediaMessage extends DCCMessage {
  type: 'loadMedia';
  /** File path or URL */
  path: string;
  /** Optional frame to seek to after loading */
  frame?: number;
}

/** Inbound: sync to a specific frame */
export interface SyncFrameMessage extends DCCMessage {
  type: 'syncFrame';
  frame: number;
}

/** Inbound: sync color settings */
export interface SyncColorMessage extends DCCMessage {
  type: 'syncColor';
  /** Exposure value */
  exposure?: number;
  /** Gamma value */
  gamma?: number;
  /** White balance temperature in Kelvin */
  temperature?: number;
  /** Tint (green-magenta) */
  tint?: number;
  /** LUT file path */
  lutPath?: string;
}

/** Inbound: ping (heartbeat) */
export interface PingMessage extends DCCMessage {
  type: 'ping';
}

/** All inbound message types */
export type DCCInboundMessage = LoadMediaMessage | SyncFrameMessage | SyncColorMessage | PingMessage;

/** Outbound: frame changed notification */
export interface FrameChangedMessage extends DCCMessage {
  type: 'frameChanged';
  frame: number;
  totalFrames: number;
}

/** Outbound: color changed notification */
export interface ColorChangedMessage extends DCCMessage {
  type: 'colorChanged';
  exposure?: number;
  gamma?: number;
  temperature?: number;
  tint?: number;
}

/** Outbound: annotation added notification */
export interface AnnotationAddedMessage extends DCCMessage {
  type: 'annotationAdded';
  frame: number;
  annotationType: 'pen' | 'text' | 'shape';
  annotationId: string;
}

/** Outbound: pong (heartbeat response) */
export interface PongMessage extends DCCMessage {
  type: 'pong';
}

/** Outbound: error response */
export interface ErrorMessage extends DCCMessage {
  type: 'error';
  code: string;
  message: string;
}

/** All outbound message types */
export type DCCOutboundMessage =
  | FrameChangedMessage
  | ColorChangedMessage
  | AnnotationAddedMessage
  | PongMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** Connection states */
export type DCCConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface DCCBridgeEvents extends EventMap {
  connectionStateChanged: DCCConnectionState;
  loadMedia: LoadMediaMessage;
  syncFrame: SyncFrameMessage;
  syncColor: SyncColorMessage;
  ping: PingMessage;
  error: Error;
  messageReceived: DCCInboundMessage;
  messageSent: DCCOutboundMessage;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DCCBridgeConfig {
  /** WebSocket server URL (e.g. 'ws://localhost:45124') */
  url: string;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (default: 10, 0 = infinite) */
  maxReconnectAttempts?: number;
  /** Base reconnect delay in ms (default: 1000) */
  reconnectBaseDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  reconnectMaxDelay?: number;
  /** Heartbeat interval in ms (default: 5000, 0 = disabled) */
  heartbeatInterval?: number;
  /** Heartbeat timeout in ms (default: 10000) */
  heartbeatTimeout?: number;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Required<Omit<DCCBridgeConfig, 'url'>> = {
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  heartbeatInterval: 5000,
  heartbeatTimeout: 10000,
};

// ---------------------------------------------------------------------------
// DCCBridge class
// ---------------------------------------------------------------------------

/**
 * DCCBridge manages a WebSocket connection to DCC tools,
 * handling the message protocol, reconnection, and heartbeat.
 *
 * Usage:
 * ```ts
 * const bridge = new DCCBridge({ url: 'ws://localhost:45124' });
 * bridge.on('loadMedia', (msg) => loadFile(msg.path));
 * bridge.on('syncFrame', (msg) => seekToFrame(msg.frame));
 * bridge.connect();
 *
 * // Send outbound events
 * bridge.sendFrameChanged(42, 100);
 * ```
 */
export class DCCBridge extends EventEmitter<DCCBridgeEvents> implements ManagerBase {
  private config: Required<DCCBridgeConfig>;
  private ws: WebSocket | null = null;
  private _state: DCCConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastPongTime = 0;
  private disposed = false;

  /** Custom WebSocket constructor for testing (defaults to globalThis.WebSocket) */
  private WebSocketImpl: typeof WebSocket;

  constructor(config: DCCBridgeConfig, wsImpl?: typeof WebSocket) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<DCCBridgeConfig>;
    this.WebSocketImpl = wsImpl ?? globalThis.WebSocket;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Current connection state. */
  get state(): DCCConnectionState {
    return this._state;
  }

  /** Whether the bridge is currently connected. */
  get isConnected(): boolean {
    return this._state === 'connected';
  }

  /** Timestamp of the last received pong. */
  get lastPongTime(): number {
    return this._lastPongTime;
  }

  /**
   * Connect to the DCC bridge WebSocket server.
   */
  connect(): void {
    if (this.disposed) throw new Error('DCCBridge is disposed');
    if (this._state === 'connected' || this._state === 'connecting') return;

    this.setState('connecting');
    this.createWebSocket();
  }

  /**
   * Disconnect from the DCC bridge.
   */
  disconnect(): void {
    this.stopReconnect();
    this.stopHeartbeat();

    if (this.ws) {
      // Remove handlers before close to avoid triggering reconnect
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }

    this.setState('disconnected');
  }

  /**
   * Send a typed outbound message.
   */
  send(message: DCCOutboundMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    const envelope: DCCOutboundMessage = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    try {
      this.ws.send(JSON.stringify(envelope));
      this.emit('messageSent', envelope);
      return true;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /**
   * Send a frame-changed notification.
   */
  sendFrameChanged(frame: number, totalFrames: number): boolean {
    return this.send({
      type: 'frameChanged',
      frame,
      totalFrames,
    });
  }

  /**
   * Send a color-changed notification.
   */
  sendColorChanged(settings: Omit<ColorChangedMessage, 'type' | 'timestamp'>): boolean {
    return this.send({
      type: 'colorChanged',
      ...settings,
    });
  }

  /**
   * Send an annotation-added notification.
   */
  sendAnnotationAdded(frame: number, annotationType: 'pen' | 'text' | 'shape', annotationId: string): boolean {
    return this.send({
      type: 'annotationAdded',
      frame,
      annotationType,
      annotationId,
    });
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // WebSocket management
  // ---------------------------------------------------------------------------

  private createWebSocket(): void {
    try {
      this.ws = new this.WebSocketImpl(this.config.url);
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.setState('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      this.ws = null;

      if (!this.disposed && event.code !== 1000) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = (_event) => {
      this.emit('error', new Error(`WebSocket error for ${this.config.url}`));
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private handleMessage(raw: string | ArrayBuffer | Blob): void {
    if (typeof raw !== 'string') return; // Only handle text messages

    let message: DCCMessage;
    try {
      message = JSON.parse(raw) as DCCMessage;
    } catch {
      this.emit('error', new Error(`Failed to parse incoming message: ${raw.slice(0, 200)}`));
      this.send({
        type: 'error',
        code: 'PARSE_ERROR',
        message: 'Invalid JSON message',
      });
      return;
    }

    if (!message.type) {
      this.send({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Message missing "type" field',
      });
      return;
    }

    // Emit the generic messageReceived event
    this.emit('messageReceived', message as DCCInboundMessage);

    // Dispatch to specific handlers
    switch (message.type) {
      case 'loadMedia':
        this.handleLoadMedia(message as LoadMediaMessage);
        break;
      case 'syncFrame':
        this.handleSyncFrame(message as SyncFrameMessage);
        break;
      case 'syncColor':
        this.handleSyncColor(message as SyncColorMessage);
        break;
      case 'ping':
        this.handlePing(message as PingMessage);
        break;
      default:
        this.send({
          type: 'error',
          code: 'UNKNOWN_TYPE',
          message: `Unknown message type: ${message.type}`,
        });
    }
  }

  private handleLoadMedia(message: LoadMediaMessage): void {
    if (!message.path) {
      this.send({
        type: 'error',
        code: 'INVALID_PARAMS',
        message: 'loadMedia requires a "path" field',
        id: message.id,
      });
      return;
    }
    this.emit('loadMedia', message);
  }

  private handleSyncFrame(message: SyncFrameMessage): void {
    if (typeof message.frame !== 'number') {
      this.send({
        type: 'error',
        code: 'INVALID_PARAMS',
        message: 'syncFrame requires a numeric "frame" field',
        id: message.id,
      });
      return;
    }
    this.emit('syncFrame', message);
  }

  private handleSyncColor(message: SyncColorMessage): void {
    this.emit('syncColor', message);
  }

  private handlePing(message: PingMessage): void {
    this._lastPongTime = Date.now();
    this.send({ type: 'pong', id: message.id });
    this.emit('ping', message);
  }

  // ---------------------------------------------------------------------------
  // Reconnection
  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (!this.config.autoReconnect || this.disposed) return;
    if (this.config.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState('disconnected');
      this.emit('error', new Error(`Max reconnection attempts (${this.config.maxReconnectAttempts}) exceeded`));
      return;
    }

    this.setState('reconnecting');

    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 500,
      this.config.reconnectMaxDelay,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.createWebSocket();
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    if (this.config.heartbeatInterval <= 0) return;

    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'pong' }); // We send a keepalive; the DCC tool should ping us
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer !== null) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  private setState(state: DCCConnectionState): void {
    if (state !== this._state) {
      this._state = state;
      this.emit('connectionStateChanged', state);
    }
  }
}
