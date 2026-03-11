/**
 * MuNetworkBridge — Network operations bridge
 *
 * Implements Mu's HTTP and remote connection commands using
 * the browser's fetch() API and WebSocket.
 */

import type { MuHttpResponse, RemoteConnectionInfo } from './types';

export class MuNetworkBridge {
  /** Active WebSocket connections by ID */
  private connections = new Map<string, WebSocket>();

  /** Connection metadata */
  private connectionInfo = new Map<string, RemoteConnectionInfo>();

  /** Local contact name for remote sessions */
  private localContactName = 'openrv-web';

  /** Remote networking enabled flag */
  private networkEnabled = false;

  /** Default permission level for remote connections (0=none, 1=read, 2=readwrite) */
  private defaultPermission = 0;

  /** Handler for incoming remote messages */
  private _onRemoteMessage: ((connectionId: string, messages: string[], senderContactName: string) => void) | null = null;

  /** Handler for incoming remote events */
  private _onRemoteEvent: ((connectionId: string, eventName: string, targetName: string, contents: string, interp: string[], senderContactName: string) => void) | null = null;

  /** Handler for incoming remote data events */
  private _onRemoteDataEvent: ((connectionId: string, eventName: string, targetName: string, contents: string, data: Uint8Array, interp: string[], senderContactName: string) => void) | null = null;

  /** Pending data event headers awaiting binary follow-up, keyed by connection ID */
  private pendingDataEvents = new Map<string, {
    header: { event: string; target: string; contents: string; interp: string[]; dataLength: number; senderContactName: string };
    timeoutId: ReturnType<typeof setTimeout>;
  }>();

  /** Timeout in ms for binary follow-up after a dataEvent header */
  private static readonly DATA_EVENT_TIMEOUT_MS = 5000;

  // ── HTTP Methods ──

  /**
   * HTTP GET request.
   * Mu signature: httpGet(url, headers, callback, progressCallback)
   * Web: Returns Promise<MuHttpResponse>.
   */
  async httpGet(
    url: string,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<MuHttpResponse> {
    return this.fetchWithMethod('GET', url, undefined, headers, timeout);
  }

  /**
   * HTTP POST request.
   * Mu signature: httpPost(url, body, headers, callback, progressCallback)
   */
  async httpPost(
    url: string,
    body: string | Uint8Array,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<MuHttpResponse> {
    return this.fetchWithMethod('POST', url, body, headers, timeout);
  }

  /**
   * HTTP PUT request.
   * Mu signature: httpPut(url, data, headers, callback, progressCallback)
   */
  async httpPut(
    url: string,
    body: string | Uint8Array,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<MuHttpResponse> {
    return this.fetchWithMethod('PUT', url, body, headers, timeout);
  }

  // ── Remote Connection Methods ──

  /**
   * Connect to a remote RV instance via WebSocket.
   * Mu signature: remoteConnect(name, host, port)
   */
  remoteConnect(name: string, host: string, port: number): void {
    if (!this.networkEnabled) {
      console.warn('[MuNetworkBridge] Remote networking is not enabled. Call remoteNetwork(true) first.');
      return;
    }

    try {
      let url: string;
      if (host.startsWith('ws://') || host.startsWith('wss://')) {
        // Explicit scheme provided — use as-is; avoid double port
        const afterScheme = host.replace(/^wss?:\/\//, '');
        url = /:\d+$/.test(afterScheme) ? host : `${host}:${port}`;
      } else if (host === 'localhost' || host === '127.0.0.1') {
        url = `ws://${host}:${port}`;
      } else {
        // Default to wss; only downgrade to ws when page is explicitly http
        const pageProtocol = typeof location !== 'undefined' ? location.protocol : 'https:';
        const scheme = pageProtocol === 'http:' ? 'ws' : 'wss';
        url = `${scheme}://${host}:${port}`;
      }

      const id = url;
      if (this.connections.has(id)) {
        console.warn(`[MuNetworkBridge] Already connected to ${id}`);
        return;
      }

      // Extract the effective port from the constructed URL
      const portMatch = url.match(/:(\d+)$/);
      const effectivePort = portMatch?.[1] ? parseInt(portMatch[1], 10) : port;

      const ws = new WebSocket(url);

      this.connections.set(id, ws);
      this.connectionInfo.set(id, {
        id,
        name,
        host,
        port: effectivePort,
        connected: false,
      });

      ws.addEventListener('open', () => {
        const info = this.connectionInfo.get(id);
        if (info) info.connected = true;

        // Send identification handshake with contact name and permission
        const handshake = JSON.stringify({
          type: 'handshake',
          contactName: this.localContactName || 'anonymous',
          permission: this.defaultPermission,
        });
        ws.send(handshake);
      });

      ws.addEventListener('close', () => {
        this.connections.delete(id);
        this.connectionInfo.delete(id);
        // Clean up any pending data event for this connection (Fix 2)
        const pending = this.pendingDataEvents.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingDataEvents.delete(id);
        }
      });

      ws.addEventListener('message', (event) => {
        this.handleIncomingMessage(id, event);
      });

      ws.addEventListener('error', (e) => {
        console.error(`[MuNetworkBridge] WebSocket error for ${id}:`, e);
      });
    } catch (err) {
      console.error(`[MuNetworkBridge] Failed to connect to ${host}:${port}:`, err);
    }
  }

  /**
   * Disconnect from a remote instance.
   */
  remoteDisconnect(connectionId: string): void {
    const ws = this.connections.get(connectionId);
    if (ws) {
      ws.close();
      this.connections.delete(connectionId);
      this.connectionInfo.delete(connectionId);
    }
    // Clean up any pending data event for this connection (Fix 2)
    const pending = this.pendingDataEvents.get(connectionId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingDataEvents.delete(connectionId);
    }
  }

  /**
   * Send a message to a remote connection.
   * Mu signature: remoteSendMessage(connectionId, messages)
   */
  remoteSendMessage(connectionId: string, messages: string[]): void {
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`[MuNetworkBridge] No open connection for ${connectionId}`);
      return;
    }
    ws.send(JSON.stringify({
      type: 'message',
      data: messages,
      senderContactName: this.localContactName || 'anonymous',
    }));
  }

  /**
   * Send an event to a remote connection.
   * Mu signature: remoteSendEvent(eventName, targetName, contents, interp)
   */
  remoteSendEvent(
    eventName: string,
    targetName: string,
    contents: string,
    interp: string[] = [],
  ): void {
    // Broadcast to all open connections
    const payload = JSON.stringify({
      type: 'event',
      event: eventName,
      target: targetName,
      contents,
      interp,
      senderContactName: this.localContactName || 'anonymous',
    });
    for (const [, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  /**
   * Send a data event with binary payload.
   */
  remoteSendDataEvent(
    eventName: string,
    targetName: string,
    contents: string,
    data: Uint8Array,
    interp: string[] = [],
  ): void {
    const header = JSON.stringify({
      type: 'dataEvent',
      event: eventName,
      target: targetName,
      contents,
      interp,
      dataLength: data.byteLength,
      senderContactName: this.localContactName || 'anonymous',
    });

    for (const [, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(header);
        ws.send(data);
      }
    }
  }

  /**
   * Get list of active remote connection IDs.
   */
  remoteConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get list of remote application names.
   */
  remoteApplications(): string[] {
    return Array.from(this.connectionInfo.values()).map((info) => info.name);
  }

  /**
   * Get list of remote contact names.
   */
  remoteContacts(): string[] {
    return Array.from(this.connectionInfo.values()).map((info) => info.name);
  }

  /**
   * Get local contact name.
   */
  remoteLocalContactName(): string {
    return this.localContactName;
  }

  /**
   * Set local contact name.
   */
  setRemoteLocalContactName(name: string): void {
    this.localContactName = name;
  }

  /**
   * Enable/disable remote networking.
   */
  remoteNetwork(enable: boolean): void {
    this.networkEnabled = enable;
    if (!enable) {
      // Close all connections
      for (const [id, ws] of this.connections) {
        ws.close();
        this.connections.delete(id);
        this.connectionInfo.delete(id);
      }
    }
  }

  /**
   * Get remote network status.
   * Returns: 0=off, 1=on, 2=connected
   */
  remoteNetworkStatus(): number {
    if (!this.networkEnabled) return 0;
    for (const info of this.connectionInfo.values()) {
      if (info.connected) return 2;
    }
    return 1;
  }

  /**
   * Get default remote permission level.
   */
  remoteDefaultPermission(): number {
    return this.defaultPermission;
  }

  /**
   * Set default remote permission level.
   */
  setRemoteDefaultPermission(level: number): void {
    this.defaultPermission = level;
  }

  /** Register a handler for incoming remote messages. */
  setOnRemoteMessage(handler: ((connectionId: string, messages: string[], senderContactName: string) => void) | null): void {
    this._onRemoteMessage = handler;
  }

  /** Register a handler for incoming remote events. */
  setOnRemoteEvent(handler: ((connectionId: string, eventName: string, targetName: string, contents: string, interp: string[], senderContactName: string) => void) | null): void {
    this._onRemoteEvent = handler;
  }

  /** Register a handler for incoming remote data events. */
  setOnRemoteDataEvent(handler: ((connectionId: string, eventName: string, targetName: string, contents: string, data: Uint8Array, interp: string[], senderContactName: string) => void) | null): void {
    this._onRemoteDataEvent = handler;
  }

  /** Get connection info including peer identity from handshake. */
  getConnectionInfo(connectionId: string): RemoteConnectionInfo | undefined {
    return this.connectionInfo.get(connectionId);
  }

  /**
   * Clean up all connections.
   */
  dispose(): void {
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.connectionInfo.clear();
    for (const pending of this.pendingDataEvents.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingDataEvents.clear();
    this._onRemoteMessage = null;
    this._onRemoteEvent = null;
    this._onRemoteDataEvent = null;
  }

  // ── Private ──

  /**
   * Handle incoming WebSocket messages with permission enforcement.
   */
  private handleIncomingMessage(connectionId: string, event: MessageEvent): void {
    // Handle binary frames (ArrayBuffer) for dataEvent payloads
    if (typeof event.data !== 'string') {
      const pending = this.pendingDataEvents.get(connectionId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingDataEvents.delete(connectionId);

        const data = event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new Uint8Array(0);

        if (this._onRemoteDataEvent) {
          this._onRemoteDataEvent(
            connectionId,
            pending.header.event,
            pending.header.target,
            pending.header.contents,
            data,
            pending.header.interp,
            pending.header.senderContactName,
          );
        }
      }
      // Binary frame without pending header — drop safely
      return;
    }

    try {
      const msg = JSON.parse(event.data);
      // Enforce permission: 0 = none → reject non-handshake messages
      if (this.defaultPermission === 0 && msg.type !== 'handshake') {
        console.warn(
          `[MuNetworkBridge] Rejecting incoming "${msg.type}" from ${connectionId}: permission is "none" (0)`,
        );
        return;
      }
      // Permission 1 = read-only → reject write-style messages
      if (this.defaultPermission === 1 && (msg.type === 'message' || msg.type === 'event' || msg.type === 'dataEvent')) {
        console.warn(
          `[MuNetworkBridge] Rejecting incoming "${msg.type}" from ${connectionId}: permission is "read" (1)`,
        );
        return;
      }

      // Dispatch allowed messages
      switch (msg.type) {
        case 'handshake': {
          const info = this.connectionInfo.get(connectionId);
          if (info) {
            info.peerContactName = msg.contactName ?? '';
            info.peerPermission = msg.permission ?? 0;
          }
          break;
        }
        case 'message': {
          if (this._onRemoteMessage) {
            this._onRemoteMessage(connectionId, msg.data ?? [], msg.senderContactName ?? '');
          }
          break;
        }
        case 'event': {
          if (this._onRemoteEvent) {
            this._onRemoteEvent(
              connectionId,
              msg.event ?? '',
              msg.target ?? '',
              msg.contents ?? '',
              msg.interp ?? [],
              msg.senderContactName ?? '',
            );
          }
          break;
        }
        case 'dataEvent': {
          // Clear any existing pending entry to avoid leaked timers (Fix 1)
          const existing = this.pendingDataEvents.get(connectionId);
          if (existing) {
            clearTimeout(existing.timeoutId);
          }

          const timeoutId = setTimeout(() => {
            this.pendingDataEvents.delete(connectionId);
          }, MuNetworkBridge.DATA_EVENT_TIMEOUT_MS);

          this.pendingDataEvents.set(connectionId, {
            header: {
              event: msg.event ?? '',
              target: msg.target ?? '',
              contents: msg.contents ?? '',
              interp: msg.interp ?? [],
              dataLength: msg.dataLength ?? 0,
              senderContactName: msg.senderContactName ?? '',
            },
            timeoutId,
          });
          break;
        }
      }
    } catch {
      // Non-JSON text payload — ignore
    }
  }

  private async fetchWithMethod(
    method: string,
    url: string,
    body?: string | Uint8Array,
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<MuHttpResponse> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body as BodyInit | undefined ?? undefined,
        signal: controller.signal,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const bodyText = new TextDecoder().decode(data);

      return {
        status: response.status,
        headers: responseHeaders,
        body: bodyText,
        data,
      };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}
