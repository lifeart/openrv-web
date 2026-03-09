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

    const id = `${host}:${port}`;
    if (this.connections.has(id)) {
      console.warn(`[MuNetworkBridge] Already connected to ${id}`);
      return;
    }

    try {
      const protocol = host === 'localhost' || host === '127.0.0.1' ? 'ws' : 'wss';
      const ws = new WebSocket(`${protocol}://${host}:${port}`);

      this.connections.set(id, ws);
      this.connectionInfo.set(id, {
        id,
        name,
        host,
        port,
        connected: false,
      });

      ws.addEventListener('open', () => {
        const info = this.connectionInfo.get(id);
        if (info) info.connected = true;
      });

      ws.addEventListener('close', () => {
        this.connections.delete(id);
        this.connectionInfo.delete(id);
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
    ws.send(JSON.stringify({ type: 'message', data: messages }));
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

  /**
   * Clean up all connections.
   */
  dispose(): void {
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.connectionInfo.clear();
  }

  // ── Private ──

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
