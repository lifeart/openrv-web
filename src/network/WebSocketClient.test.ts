/**
 * WebSocketClient Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from './WebSocketClient';
import type { SyncMessage } from './types';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  url: string;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Simulate async connection (can be disabled via mockAutoConnect flag)
    setTimeout(() => {
      if (mockAutoConnect && this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      }
    }, 10);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  }

  // Test helpers
  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }

  simulateClose(code: number = 1006, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  simulateError(): void {
    this.onerror?.();
  }
}

// Store reference to mock instances
let mockWSInstances: MockWebSocket[] = [];
// Flag to prevent auto-connect in mock (for simulating server-down scenarios)
let mockAutoConnect = true;

// Mock the global WebSocket
vi.stubGlobal('WebSocket', class extends MockWebSocket {
  constructor(url: string) {
    super(url);
    mockWSInstances.push(this);
  }
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
});

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWSInstances = [];
    mockAutoConnect = true;
    client = new WebSocketClient({
      serverUrl: 'wss://test.example.com',
      reconnectMaxAttempts: 3,
      reconnectBaseDelay: 100,
      reconnectMaxDelay: 1000,
      heartbeatInterval: 5000,
      heartbeatTimeout: 10000,
      frameSyncThreshold: 2,
      userName: 'Test',
    });
  });

  afterEach(() => {
    client.dispose();
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('WSC-001: connects to WebSocket URL', () => {
      client.connect('wss://test.example.com');
      expect(mockWSInstances.length).toBe(1);
      expect(mockWSInstances[0]!.url).toBe('wss://test.example.com');
    });

    it('WSC-002: handles connection open', async () => {
      const handler = vi.fn();
      client.on('connected', handler);
      client.connect();

      // Advance past the setTimeout in MockWebSocket constructor
      await vi.advanceTimersByTimeAsync(20);

      expect(handler).toHaveBeenCalled();
      expect(client.isConnected).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('WSC-003: handles connection close', async () => {
      const handler = vi.fn();
      client.on('disconnected', handler);
      client.connect();

      await vi.advanceTimersByTimeAsync(20);
      client.disconnect();

      expect(handler).toHaveBeenCalledWith({ code: 1000, reason: 'Client disconnect' });
      expect(client.isConnected).toBe(false);
    });
  });

  describe('send', () => {
    it('WSC-005: sends JSON messages', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      const message: SyncMessage = {
        id: 'test-1',
        type: 'ping',
        roomId: 'room-1',
        userId: 'user-1',
        timestamp: Date.now(),
        payload: { sentAt: Date.now() },
      };

      const sent = client.send(message);
      expect(sent).toBe(true);
      expect(mockWSInstances[0]!.sentMessages.length).toBe(1);

      const parsed = JSON.parse(mockWSInstances[0]!.sentMessages[0]!);
      expect(parsed.type).toBe('ping');
    });

    it('WSC-006: returns false when not connected', () => {
      const message: SyncMessage = {
        id: 'test-1',
        type: 'ping',
        roomId: '',
        userId: '',
        timestamp: Date.now(),
        payload: {},
      };
      expect(client.send(message)).toBe(false);
    });
  });

  describe('message handling', () => {
    it('WSC-007: emits message events for valid messages', async () => {
      const handler = vi.fn();
      client.on('message', handler);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      const validMessage = JSON.stringify({
        id: 'msg-1',
        type: 'sync.playback',
        roomId: 'room-1',
        userId: 'user-2',
        timestamp: Date.now(),
        payload: { isPlaying: true },
      });

      mockWSInstances[0]!.simulateMessage(validMessage);
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0]![0].type).toBe('sync.playback');
    });

    it('WSC-031: rejects malformed messages', async () => {
      const handler = vi.fn();
      client.on('message', handler);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      mockWSInstances[0]!.simulateMessage('not valid json');
      expect(handler).not.toHaveBeenCalled();

      mockWSInstances[0]!.simulateMessage(JSON.stringify({ incomplete: true }));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('WSC-010: sends ping messages on heartbeat interval', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20); // connect

      const ws = mockWSInstances[0]!;
      const initialCount = ws.sentMessages.length;

      // Advance past heartbeat interval
      await vi.advanceTimersByTimeAsync(5000);

      // Should have sent at least one ping
      const newMessages = ws.sentMessages.slice(initialCount);
      const pings = newMessages.filter(m => JSON.parse(m).type === 'ping');
      expect(pings.length).toBeGreaterThan(0);
    });

    it('WSC-011: calculates RTT from pong', async () => {
      const rttHandler = vi.fn();
      client.on('rttUpdated', rttHandler);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      // Simulate pong response
      const pongMessage = JSON.stringify({
        id: 'pong-1',
        type: 'pong',
        roomId: '',
        userId: '',
        timestamp: Date.now(),
        payload: { sentAt: Date.now() - 50, serverTime: Date.now() },
      });

      mockWSInstances[0]!.simulateMessage(pongMessage);
      expect(rttHandler).toHaveBeenCalled();
      expect(client.rtt).toBeGreaterThanOrEqual(0);
    });

    it('WSC-012: detects connection timeout', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      const disconnectHandler = vi.fn();
      client.on('disconnected', disconnectHandler);

      // Advance past heartbeat timeout without any pong
      await vi.advanceTimersByTimeAsync(15000);

      // The timeout should have triggered a close
      expect(disconnectHandler).toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    it('WSC-020: reconnects on unexpected close', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      const reconnectingHandler = vi.fn();
      client.on('reconnecting', reconnectingHandler);

      // Simulate unexpected close
      mockWSInstances[0]!.simulateClose(1006);

      // Advance past reconnect delay
      await vi.advanceTimersByTimeAsync(200);

      expect(reconnectingHandler).toHaveBeenCalled();
      expect(mockWSInstances.length).toBeGreaterThan(1);
    });

    it('WSC-021: applies backoff delay', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      const reconnectingHandler = vi.fn();
      client.on('reconnecting', reconnectingHandler);

      // First disconnect
      mockWSInstances[0]!.simulateClose(1006);
      await vi.advanceTimersByTimeAsync(200);
      expect(reconnectingHandler).toHaveBeenCalledTimes(1);
      expect(reconnectingHandler.mock.calls[0]![0].attempt).toBe(1);
    });

    it('WSC-022: limits reconnection attempts', async () => {
      const failHandler = vi.fn();
      client.on('reconnectFailed', failHandler);

      client.connect();
      await vi.advanceTimersByTimeAsync(20); // let initial connection open

      // Disable auto-connect for subsequent WS instances to simulate server down
      mockAutoConnect = false;

      // Simulate unexpected close to start reconnection cycle
      mockWSInstances[mockWSInstances.length - 1]!.simulateClose(1006);

      // Each reconnect attempt creates a new WS that stays in CONNECTING state.
      // The onclose callback in the CONNECTING WS triggers scheduleReconnect.
      // After 3 attempts (maxAttempts=3), reconnectFailed should fire.
      for (let attempt = 0; attempt < 4; attempt++) {
        // Advance past the reconnect backoff delay
        await vi.advanceTimersByTimeAsync(5000);

        // If a new WS was created, simulate connection failure
        const latestWs = mockWSInstances[mockWSInstances.length - 1]!;
        if (latestWs.readyState === MockWebSocket.CONNECTING) {
          latestWs.simulateClose(1006);
        }
      }

      expect(failHandler).toHaveBeenCalled();
    });

    it('WSC-023: rotates across signaling servers on reconnect attempts', async () => {
      client.dispose();
      mockWSInstances = [];
      mockAutoConnect = true;
      client = new WebSocketClient({
        serverUrl: 'wss://primary.example.com',
        serverUrls: ['wss://primary.example.com', 'wss://backup.example.com'],
        reconnectMaxAttempts: 3,
        reconnectBaseDelay: 100,
        reconnectMaxDelay: 1000,
        heartbeatInterval: 5000,
        heartbeatTimeout: 10000,
        frameSyncThreshold: 2,
        userName: 'Test',
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(20);
      expect(mockWSInstances[0]!.url).toBe('wss://primary.example.com');

      // Force reconnect and keep follow-up sockets from auto-opening.
      mockAutoConnect = false;
      mockWSInstances[0]!.simulateClose(1006);
      await vi.advanceTimersByTimeAsync(500);

      expect(mockWSInstances.length).toBeGreaterThan(1);
      expect(mockWSInstances[1]!.url).toBe('wss://backup.example.com');
    });
  });

  describe('error handling', () => {
    it('WSC-004: handles connection error', async () => {
      const errorHandler = vi.fn();
      client.on('error', errorHandler);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      mockWSInstances[0]!.simulateError();
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('identity', () => {
    it('WSC-030: sets user and room identity', () => {
      expect(() => client.setIdentity('user-123', 'room-456')).not.toThrow();
    });
  });

  describe('reconnected event', () => {
    it('WSC-050: emits reconnected event after successful reconnection', async () => {
      const reconnectedHandler = vi.fn();
      client.on('reconnected', reconnectedHandler);

      client.connect();
      await vi.advanceTimersByTimeAsync(20); // connect

      // Simulate unexpected close to trigger reconnection
      mockWSInstances[0]!.simulateClose(1006);

      // Advance past reconnect delay to trigger reconnect attempt
      await vi.advanceTimersByTimeAsync(200);

      // The new WebSocket instance should auto-connect
      await vi.advanceTimersByTimeAsync(20);

      expect(reconnectedHandler).toHaveBeenCalled();
    });
  });

  describe('connect guard', () => {
    it('WSC-051: ignores connect when already connected', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20);
      expect(mockWSInstances.length).toBe(1);

      // Calling connect again should not create a new WebSocket
      client.connect();
      expect(mockWSInstances.length).toBe(1);
    });

    it('WSC-052: ignores connect after dispose', async () => {
      client.dispose();
      client.connect();
      expect(mockWSInstances.length).toBe(0);
    });
  });

  describe('non-string messages', () => {
    it('WSC-053: ignores non-string message data', async () => {
      const handler = vi.fn();
      client.on('message', handler);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      // Simulate binary message (non-string)
      const ws = mockWSInstances[0]!;
      ws.onmessage?.({ data: 12345 as any });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('pong without sentAt', () => {
    it('WSC-054: handles pong with missing sentAt gracefully', async () => {
      const rttHandler = vi.fn();
      client.on('rttUpdated', rttHandler);
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      // Pong without sentAt in payload
      const pongMessage = JSON.stringify({
        id: 'pong-bad',
        type: 'pong',
        roomId: '',
        userId: '',
        timestamp: Date.now(),
        payload: {},
      });

      mockWSInstances[0]!.simulateMessage(pongMessage);
      // RTT should not be updated since sentAt is missing
      expect(rttHandler).not.toHaveBeenCalled();
    });
  });

  describe('disconnect when not connected', () => {
    it('WSC-055: disconnect is safe when not connected', () => {
      const handler = vi.fn();
      client.on('disconnected', handler);
      client.disconnect();
      // Should not emit disconnected since we were never connected
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('WSC-040: cleans up on dispose', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      client.dispose();

      expect(client.isConnected).toBe(false);
    });

    it('WSC-041: dispose cancels pending reconnection timer', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(20);

      // Simulate close to start reconnection cycle
      mockWSInstances[0]!.simulateClose(1006);
      // The first reconnecting event fires synchronously on close

      const wsCountAfterClose = mockWSInstances.length;

      // Dispose cancels the pending reconnect timer
      client.dispose();

      // Advance past reconnect delay
      await vi.advanceTimersByTimeAsync(5000);

      // No new WebSocket instances should have been created after dispose
      expect(mockWSInstances.length).toBe(wsCountAfterClose);
      expect(client.isReconnecting).toBe(false);
    });
  });
});
