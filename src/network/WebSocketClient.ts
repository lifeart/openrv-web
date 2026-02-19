/**
 * WebSocketClient - WebSocket connection handling with reconnection
 *
 * Manages the WebSocket connection lifecycle including:
 * - Connection establishment
 * - Heartbeat (ping/pong) for connection health
 * - Automatic reconnection with exponential backoff
 * - Message sending and receiving with JSON parsing
 */

import { EventEmitter } from '../utils/EventEmitter';
import type { SyncMessage, WebSocketClientEvents, NetworkSyncConfig } from './types';
import { DEFAULT_NETWORK_SYNC_CONFIG } from './types';
import {
  serializeMessage,
  deserializeMessage,
  createPingMessage,
} from './MessageProtocol';

export class WebSocketClient extends EventEmitter<WebSocketClientEvents> {
  private ws: WebSocket | null = null;
  private config: NetworkSyncConfig;
  private serverUrls: string[] = [];
  private serverUrlIndex = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _rtt = 0;
  private _isConnected = false;
  private _isReconnecting = false;
  private _shouldReconnect = true;
  private _userId = '';
  private _roomId = '';
  private _disposed = false;

  constructor(config?: Partial<NetworkSyncConfig>) {
    super();
    this.config = { ...DEFAULT_NETWORK_SYNC_CONFIG, ...config };
    this.serverUrls = this.normalizeServerUrls(this.config);
  }

  // ---- Public API ----

  /**
   * Get the current round-trip time in milliseconds.
   */
  get rtt(): number {
    return this._rtt;
  }

  /**
   * Whether the client is currently connected.
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Whether the client is attempting to reconnect.
   */
  get isReconnecting(): boolean {
    return this._isReconnecting;
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(url?: string, userId?: string, roomId?: string): void {
    if (this._disposed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const explicitUrl = this.normalizeServerUrl(url);
    if (explicitUrl) {
      const index = this.serverUrls.indexOf(explicitUrl);
      if (index >= 0) this.serverUrlIndex = index;
    }
    const serverUrl = explicitUrl ?? this.getCurrentServerUrl();
    this._userId = userId ?? this._userId;
    this._roomId = roomId ?? this._roomId;

    try {
      this.ws = new WebSocket(serverUrl);
      this.setupWebSocketHandlers();
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this._shouldReconnect = false;
    this.cleanup();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }

    if (this._isConnected) {
      this._isConnected = false;
      this.emit('disconnected', { code: 1000, reason: 'Client disconnect' });
    }
  }

  /**
   * Send a SyncMessage over the WebSocket connection.
   * Returns true if the message was sent, false otherwise.
   */
  send(message: SyncMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const data = serializeMessage(message);
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set the user and room IDs for heartbeat messages.
   */
  setIdentity(userId: string, roomId: string): void {
    this._userId = userId;
    this._roomId = roomId;
  }

  /**
   * Update config at runtime.
   */
  updateConfig(config: Partial<NetworkSyncConfig>): void {
    this.config = { ...this.config, ...config };
    this.serverUrls = this.normalizeServerUrls(this.config);
    this.serverUrlIndex = 0;
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this._disposed = true;
    this.disconnect();
    this.removeAllListeners();
  }

  // ---- Private Methods ----

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      const wasReconnecting = this._isReconnecting;
      this._isConnected = true;
      this._isReconnecting = false;
      this.reconnectAttempts = 0;
      this._shouldReconnect = true;
      this.startHeartbeat();
      this.emit('connected', undefined);

      // If we were reconnecting, emit reconnected event
      if (wasReconnecting) {
        this.emit('reconnected', undefined);
      }
    };

    this.ws.onclose = (event) => {
      const wasConnected = this._isConnected;
      this._isConnected = false;
      this.stopHeartbeat();

      if (wasConnected) {
        this.emit('disconnected', { code: event.code, reason: event.reason || 'Connection closed' });
      }

      if (this._shouldReconnect && !this._disposed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.emit('error', new Error('WebSocket connection error'));
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;

    const message = deserializeMessage(data);
    if (!message) {
      // Reject malformed messages silently
      return;
    }

    // Handle pong messages internally for RTT calculation
    if (message.type === 'pong') {
      this.handlePong(message);
      return;
    }

    // Handle ping messages by responding with pong
    if (message.type === 'ping') {
      this.resetHeartbeatTimeout();
      return;
    }

    this.emit('message', message);
  }

  private handlePong(message: SyncMessage): void {
    const payload = message.payload as { sentAt?: number };
    if (payload && typeof payload.sentAt === 'number') {
      this._rtt = Date.now() - payload.sentAt;
      this.emit('rttUpdated', this._rtt);
    }
    this.resetHeartbeatTimeout();
  }

  // ---- Heartbeat ----

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.config.heartbeatInterval);

    // Start initial timeout
    this.resetHeartbeatTimeout();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const pingMessage = createPingMessage(this._roomId, this._userId);
    this.send(pingMessage);
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }

    this.heartbeatTimeoutTimer = setTimeout(() => {
      // Connection timed out
      if (this.ws && this._isConnected) {
        this.ws.close(4000, 'Heartbeat timeout');
      }
    }, this.config.heartbeatTimeout);
  }

  // ---- Reconnection ----

  private scheduleReconnect(): void {
    if (this._disposed || !this._shouldReconnect) return;

    if (this.reconnectAttempts >= this.config.reconnectMaxAttempts) {
      this._isReconnecting = false;
      this.emit('reconnectFailed', undefined);
      return;
    }

    this._isReconnecting = true;
    this.reconnectAttempts++;

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.reconnectMaxAttempts,
    });

    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.reconnectMaxDelay
    );
    const jitter = delay * 0.1 * Math.random();

    this.reconnectTimer = setTimeout(() => {
      this.advanceServerUrl();
      this.connect();
    }, delay + jitter);
  }

  private normalizeServerUrl(url: string | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (!/^wss?:\/\//i.test(trimmed)) return null;
    return trimmed;
  }

  private normalizeServerUrls(config: NetworkSyncConfig): string[] {
    const candidates = [
      config.serverUrl,
      ...(Array.isArray(config.serverUrls) ? config.serverUrls : []),
    ];

    const seen = new Set<string>();
    const urls: string[] = [];

    for (const candidate of candidates) {
      const normalized = this.normalizeServerUrl(candidate);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
    }

    // Keep at least one URL so connect() always has a deterministic target.
    if (urls.length === 0) {
      urls.push(DEFAULT_NETWORK_SYNC_CONFIG.serverUrl);
    }

    return urls;
  }

  private getCurrentServerUrl(): string {
    if (this.serverUrls.length === 0) return this.config.serverUrl;
    const index = Math.max(0, Math.min(this.serverUrlIndex, this.serverUrls.length - 1));
    return this.serverUrls[index]!;
  }

  private advanceServerUrl(): void {
    if (this.serverUrls.length <= 1) return;
    this.serverUrlIndex = (this.serverUrlIndex + 1) % this.serverUrls.length;
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this._isReconnecting = false;
    this.reconnectAttempts = 0;
  }
}
