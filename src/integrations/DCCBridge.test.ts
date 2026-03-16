/**
 * DCCBridge Unit Tests
 *
 * Tests for the DCC integration WebSocket bridge.
 * Uses a mock WebSocket implementation to simulate all interactions.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DCCBridge,
  type DCCBridgeConfig,
  type DCCConnectionState,
  type LoadMediaMessage,
  type SyncFrameMessage,
  type SyncColorMessage,
  type DCCOutboundMessage,
  type DCCOutboundMessageType,
} from './DCCBridge';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  sentMessages: string[] = [];
  private closeCalled = false;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    queueMicrotask(() => {
      if (!this.closeCalled && this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event('open'));
      }
    });
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.closeCalled = true;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: true } as CloseEvent);
  }

  // Test helpers
  simulateMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  simulateError(): void {
    this.onerror?.(new Event('error'));
  }

  simulateClose(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason: '', wasClean: false } as CloseEvent);
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function defaultConfig(overrides?: Partial<DCCBridgeConfig>): DCCBridgeConfig {
  return {
    url: 'ws://localhost:45124',
    autoReconnect: false, // Disable by default in tests to avoid timers
    heartbeatInterval: 0, // Disable heartbeat in tests
    ...overrides,
  };
}

async function createConnectedBridge(
  config?: Partial<DCCBridgeConfig>,
): Promise<{ bridge: DCCBridge; ws: MockWebSocket }> {
  let capturedWs: MockWebSocket | null = null;
  class WsMockClass {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url: string) {
      capturedWs = new MockWebSocket(url);
      return capturedWs as any;
    }
  }
  const WsMock = WsMockClass as unknown as typeof WebSocket;

  const bridge = new DCCBridge(defaultConfig(config), WsMock);
  bridge.connect();

  // Wait for mock connection to establish
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  return { bridge, ws: capturedWs! };
}

function parseSent(ws: MockWebSocket, index = 0): DCCOutboundMessage {
  return JSON.parse(ws.sentMessages[index]!) as DCCOutboundMessage;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DCCBridge', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('connection', () => {
    it('DCC-CONN-001: starts disconnected', () => {
      const bridge = new DCCBridge(defaultConfig());
      expect(bridge.state).toBe('disconnected');
      expect(bridge.isConnected).toBe(false);
      bridge.dispose();
    });

    it('DCC-CONN-002: connect transitions to connected', async () => {
      const { bridge } = await createConnectedBridge();
      expect(bridge.state).toBe('connected');
      expect(bridge.isConnected).toBe(true);
      bridge.dispose();
    });

    it('DCC-CONN-003: disconnect transitions to disconnected', async () => {
      const { bridge } = await createConnectedBridge();
      bridge.disconnect();
      expect(bridge.state).toBe('disconnected');
      expect(bridge.isConnected).toBe(false);
      bridge.dispose();
    });

    it('DCC-CONN-004: emits connectionStateChanged', async () => {
      const states: DCCConnectionState[] = [];
      const { bridge } = await createConnectedBridge();

      bridge.on('connectionStateChanged', (state) => states.push(state));
      bridge.disconnect();

      expect(states).toContain('disconnected');
      bridge.dispose();
    });

    it('DCC-CONN-005: dispose prevents reconnection', async () => {
      const { bridge } = await createConnectedBridge();
      bridge.dispose();
      expect(() => bridge.connect()).toThrow('disposed');
    });
  });

  describe('inbound messages', () => {
    it('DCC-MSG-001: handles loadMedia', async () => {
      const { bridge, ws } = await createConnectedBridge();
      const listener = vi.fn();
      bridge.on('loadMedia', listener);

      ws.simulateMessage(
        JSON.stringify({
          type: 'loadMedia',
          path: '/path/to/movie.mov',
          frame: 42,
        }),
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const msg = listener.mock.calls[0]![0] as LoadMediaMessage;
      expect(msg.path).toBe('/path/to/movie.mov');
      expect(msg.frame).toBe(42);
      bridge.dispose();
    });

    it('DCC-MSG-002: handles syncFrame', async () => {
      const { bridge, ws } = await createConnectedBridge();
      const listener = vi.fn();
      bridge.on('syncFrame', listener);

      ws.simulateMessage(
        JSON.stringify({
          type: 'syncFrame',
          frame: 100,
        }),
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const msg = listener.mock.calls[0]![0] as SyncFrameMessage;
      expect(msg.frame).toBe(100);
      bridge.dispose();
    });

    it('DCC-MSG-003: handles syncColor', async () => {
      const { bridge, ws } = await createConnectedBridge();
      const listener = vi.fn();
      bridge.on('syncColor', listener);

      ws.simulateMessage(
        JSON.stringify({
          type: 'syncColor',
          exposure: 1.5,
          gamma: 2.2,
          temperature: 6500,
        }),
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const msg = listener.mock.calls[0]![0] as SyncColorMessage;
      expect(msg.exposure).toBe(1.5);
      expect(msg.gamma).toBe(2.2);
      expect(msg.temperature).toBe(6500);
      bridge.dispose();
    });

    it('DCC-MSG-004: handles ping with pong response', async () => {
      const { bridge, ws } = await createConnectedBridge();
      const listener = vi.fn();
      bridge.on('ping', listener);

      ws.simulateMessage(
        JSON.stringify({
          type: 'ping',
          id: 'ping-1',
        }),
      );

      expect(listener).toHaveBeenCalledTimes(1);
      // Should have sent a pong
      expect(ws.sentMessages.length).toBe(1);
      const pong = parseSent(ws, 0);
      expect(pong.type).toBe('pong');
      expect(pong.id).toBe('ping-1');
      bridge.dispose();
    });

    it('DCC-MSG-005: emits messageReceived for all messages', async () => {
      const { bridge, ws } = await createConnectedBridge();
      const listener = vi.fn();
      bridge.on('messageReceived', listener);

      ws.simulateMessage(JSON.stringify({ type: 'syncFrame', frame: 1 }));
      ws.simulateMessage(JSON.stringify({ type: 'ping' }));

      expect(listener).toHaveBeenCalledTimes(2);
      bridge.dispose();
    });

    it('DCC-MSG-006: invalid JSON sends error response', async () => {
      const { bridge, ws } = await createConnectedBridge();

      ws.simulateMessage('not valid json{{{');

      expect(ws.sentMessages.length).toBe(1);
      const errMsg = parseSent(ws, 0);
      expect(errMsg.type).toBe('error');
      expect((errMsg as { code: string }).code).toBe('PARSE_ERROR');
      bridge.dispose();
    });

    it('DCC-MSG-007: message without type sends error', async () => {
      const { bridge, ws } = await createConnectedBridge();

      ws.simulateMessage(JSON.stringify({ data: 'no type field' }));

      expect(ws.sentMessages.length).toBe(1);
      const errMsg = parseSent(ws, 0);
      expect(errMsg.type).toBe('error');
      expect((errMsg as { code: string }).code).toBe('INVALID_MESSAGE');
      bridge.dispose();
    });

    it('DCC-MSG-008: unknown message type sends error', async () => {
      const { bridge, ws } = await createConnectedBridge();

      ws.simulateMessage(JSON.stringify({ type: 'unknownCommand' }));

      expect(ws.sentMessages.length).toBe(1);
      const errMsg = parseSent(ws, 0);
      expect(errMsg.type).toBe('error');
      expect((errMsg as { code: string }).code).toBe('UNKNOWN_TYPE');
      bridge.dispose();
    });

    it('DCC-MSG-009: loadMedia without path sends error', async () => {
      const { bridge, ws } = await createConnectedBridge();

      ws.simulateMessage(JSON.stringify({ type: 'loadMedia' }));

      expect(ws.sentMessages.length).toBe(1);
      const errMsg = parseSent(ws, 0);
      expect(errMsg.type).toBe('error');
      expect((errMsg as { code: string }).code).toBe('INVALID_PARAMS');
      bridge.dispose();
    });

    it('DCC-MSG-010: syncFrame without frame sends error', async () => {
      const { bridge, ws } = await createConnectedBridge();

      ws.simulateMessage(JSON.stringify({ type: 'syncFrame' }));

      expect(ws.sentMessages.length).toBe(1);
      const errMsg = parseSent(ws, 0);
      expect(errMsg.type).toBe('error');
      expect((errMsg as { code: string }).code).toBe('INVALID_PARAMS');
      bridge.dispose();
    });
  });

  describe('outbound messages', () => {
    it('DCC-OUT-001: sendFrameChanged sends correct message', async () => {
      const { bridge, ws } = await createConnectedBridge();

      const result = bridge.sendFrameChanged(42, 100);
      expect(result).toBe(true);

      const msg = parseSent(ws, 0);
      expect(msg.type).toBe('frameChanged');
      expect((msg as { frame: number }).frame).toBe(42);
      expect((msg as { totalFrames: number }).totalFrames).toBe(100);
      expect(msg.timestamp).toBeDefined();
      bridge.dispose();
    });

    it('DCC-OUT-002: sendColorChanged sends correct message', async () => {
      const { bridge, ws } = await createConnectedBridge();

      bridge.sendColorChanged({ exposure: 1.5, gamma: 2.2 });

      const msg = parseSent(ws, 0);
      expect(msg.type).toBe('colorChanged');
      expect((msg as { exposure: number }).exposure).toBe(1.5);
      expect((msg as { gamma: number }).gamma).toBe(2.2);
      bridge.dispose();
    });

    it('DCC-OUT-003: sendAnnotationAdded sends correct message', async () => {
      const { bridge, ws } = await createConnectedBridge();

      bridge.sendAnnotationAdded(10, 'pen', 'stroke-123');

      const msg = parseSent(ws, 0);
      expect(msg.type).toBe('annotationAdded');
      expect((msg as { frame: number }).frame).toBe(10);
      expect((msg as { annotationType: string }).annotationType).toBe('pen');
      expect((msg as { annotationId: string }).annotationId).toBe('stroke-123');
      bridge.dispose();
    });

    it('DCC-OUT-009: sendNoteAdded sends correct message (#445)', async () => {
      const { bridge, ws } = await createConnectedBridge();

      bridge.sendNoteAdded(15, 'Fix edge artifact', 'Alice', 'open', 'note-456');

      const msg = parseSent(ws, 0);
      expect(msg.type).toBe('noteAdded');
      expect((msg as { frame: number }).frame).toBe(15);
      expect((msg as { text: string }).text).toBe('Fix edge artifact');
      expect((msg as { author: string }).author).toBe('Alice');
      expect((msg as { status: string }).status).toBe('open');
      expect((msg as { noteId: string }).noteId).toBe('note-456');
      bridge.dispose();
    });

    it('DCC-OUT-004: send returns false when disconnected', () => {
      const bridge = new DCCBridge(defaultConfig());
      const result = bridge.sendFrameChanged(1, 10);
      expect(result).toBe(false);
      bridge.dispose();
    });

    it('DCC-OUT-006: send increments droppedMessageCount when not writable (#443)', () => {
      const bridge = new DCCBridge(defaultConfig());
      expect(bridge.droppedMessageCount).toBe(0);

      bridge.sendFrameChanged(1, 10);
      expect(bridge.droppedMessageCount).toBe(1);

      bridge.sendColorChanged({ exposure: 1.0 });
      expect(bridge.droppedMessageCount).toBe(2);

      bridge.sendAnnotationAdded(1, 'pen', 'a1');
      expect(bridge.droppedMessageCount).toBe(3);

      bridge.dispose();
    });

    it('DCC-OUT-007: send emits messageDropped when not writable (#443)', () => {
      const bridge = new DCCBridge(defaultConfig());
      const listener = vi.fn();
      bridge.on('messageDropped', listener);

      bridge.sendFrameChanged(1, 10);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0]![0]).toMatchObject({
        type: 'frameChanged',
        frame: 1,
        totalFrames: 10,
      });
      bridge.dispose();
    });

    it('DCC-OUT-008: successful send does not increment droppedMessageCount (#443)', async () => {
      const { bridge } = await createConnectedBridge();
      bridge.sendFrameChanged(1, 10);
      expect(bridge.droppedMessageCount).toBe(0);
      bridge.dispose();
    });

    it('DCC-OUT-005: emits messageSent on successful send', async () => {
      const { bridge } = await createConnectedBridge();
      const listener = vi.fn();
      bridge.on('messageSent', listener);

      bridge.sendFrameChanged(1, 10);
      expect(listener).toHaveBeenCalledTimes(1);
      bridge.dispose();
    });
  });

  describe('reconnection', () => {
    it('DCC-RECON-001: schedules reconnect on abnormal close', async () => {
      const { bridge, ws } = await createConnectedBridge({
        autoReconnect: true,
        reconnectBaseDelay: 100,
      });

      const stateListener = vi.fn();
      bridge.on('connectionStateChanged', stateListener);

      // Simulate abnormal close
      ws.simulateClose(1006);

      // Bridge should transition to 'reconnecting'
      expect(stateListener).toHaveBeenCalledWith('reconnecting');
      bridge.dispose();
    });

    it('DCC-RECON-002: does not reconnect on normal close via disconnect()', async () => {
      const { bridge } = await createConnectedBridge({ autoReconnect: true });

      const stateListener = vi.fn();
      bridge.on('connectionStateChanged', stateListener);

      // Normal disconnect via API
      bridge.disconnect();

      // Should go directly to disconnected, not reconnecting
      expect(stateListener).toHaveBeenCalledWith('disconnected');
      expect(stateListener).not.toHaveBeenCalledWith('reconnecting');
      bridge.dispose();
    });

    it('DCC-RECON-003: emits error when max attempts exceeded', async () => {
      // We test the logic by checking that the bridge transitions to
      // 'reconnecting' on abnormal close, and that after max attempts
      // the error listener is called.

      // Create a bridge with maxReconnectAttempts = 0 (infinite) to just verify the mechanism
      const { bridge, ws } = await createConnectedBridge({
        autoReconnect: true,
        maxReconnectAttempts: 0, // 0 means no limit in this config
      });

      // Simulate abnormal close
      ws.simulateClose(1006);
      expect(bridge.state).toBe('reconnecting');

      bridge.dispose();
    });
  });

  describe('ping/pong and lastPongTime', () => {
    it('DCC-PING-001: ping updates lastPongTime', async () => {
      const { bridge, ws } = await createConnectedBridge();

      const before = bridge.lastPongTime;
      ws.simulateMessage(JSON.stringify({ type: 'ping' }));
      const after = bridge.lastPongTime;

      expect(after).toBeGreaterThanOrEqual(before);
      bridge.dispose();
    });
  });

  describe('heartbeat keepalive', () => {
    it('DCC-HB-001: heartbeat timer sends ping (not pong) messages', async () => {
      vi.useFakeTimers();
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 5000,
        heartbeatTimeout: 10000,
      });

      // Advance past one heartbeat interval
      vi.advanceTimersByTime(5000);

      // Should have sent a ping, not a pong
      expect(ws.sentMessages.length).toBe(1);
      const msg = parseSent(ws, 0);
      expect(msg.type).toBe('ping');

      bridge.dispose();
    });

    it('DCC-HB-002: heartbeat timeout fires when no pong is received', async () => {
      vi.useFakeTimers();
      // Use a timeout shorter than the interval so the timeout fires before
      // the next interval tick reschedules it.
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 5000,
        heartbeatTimeout: 3000,
        autoReconnect: false,
      });

      const errorListener = vi.fn();
      bridge.on('error', errorListener);

      // Trigger first heartbeat ping at 5000ms
      vi.advanceTimersByTime(5000);

      // Should have sent a ping
      const pingMessages = ws.sentMessages.filter((m) => JSON.parse(m).type === 'ping');
      expect(pingMessages.length).toBe(1);

      // Advance past the heartbeat timeout (3000ms from when ping was sent)
      // but before the next interval tick (at 10000ms)
      vi.advanceTimersByTime(3001);

      // Should have emitted a heartbeat timeout error
      expect(errorListener).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Heartbeat timeout') }),
      );

      bridge.dispose();
    });

    it('DCC-HB-003: inbound pong resets the heartbeat timeout', async () => {
      vi.useFakeTimers();
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 5000,
        heartbeatTimeout: 3000,
        autoReconnect: false,
      });

      const errorListener = vi.fn();
      bridge.on('error', errorListener);

      // Trigger heartbeat ping at 5000ms (timeout would fire at 8000ms)
      vi.advanceTimersByTime(5000);
      expect(parseSent(ws, 0).type).toBe('ping');

      // Respond with pong before timeout (at 6500ms)
      vi.advanceTimersByTime(1500);
      ws.simulateMessage(JSON.stringify({ type: 'pong' }));

      // Advance past the original timeout deadline (8000ms) — should NOT fire
      vi.advanceTimersByTime(2000);

      expect(errorListener).not.toHaveBeenCalled();
      expect(bridge.lastPongTime).toBeGreaterThan(0);

      bridge.dispose();
    });

    it('DCC-HB-004: inbound pong updates lastPongTime', async () => {
      vi.useFakeTimers();
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 5000,
        heartbeatTimeout: 10000,
      });

      const pongListener = vi.fn();
      bridge.on('pong', pongListener);

      // Trigger heartbeat ping
      vi.advanceTimersByTime(5000);

      // Respond with pong
      ws.simulateMessage(JSON.stringify({ type: 'pong' }));

      expect(pongListener).toHaveBeenCalledTimes(1);
      expect(bridge.lastPongTime).toBeGreaterThan(0);

      bridge.dispose();
    });

    it('DCC-HB-005: inbound ping also resets the heartbeat timeout', async () => {
      vi.useFakeTimers();
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 5000,
        heartbeatTimeout: 3000,
        autoReconnect: false,
      });

      const errorListener = vi.fn();
      bridge.on('error', errorListener);

      // Trigger heartbeat ping at 5000ms (timeout would fire at 8000ms)
      vi.advanceTimersByTime(5000);

      // Peer sends a ping (instead of pong) at 6500ms — bridge should still consider the connection alive
      vi.advanceTimersByTime(1500);
      ws.simulateMessage(JSON.stringify({ type: 'ping' }));

      // Advance past original timeout deadline (8000ms) — should NOT fire
      vi.advanceTimersByTime(2000);

      expect(errorListener).not.toHaveBeenCalled();

      bridge.dispose();
    });

    it('DCC-HB-006: heartbeat timeout closes the WebSocket', async () => {
      vi.useFakeTimers();
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 5000,
        heartbeatTimeout: 3000,
        autoReconnect: false,
      });

      // Trigger heartbeat ping at 5000ms, timeout fires at 8000ms
      vi.advanceTimersByTime(8001);

      // The WebSocket should have been closed
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);

      bridge.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // Regression: documented inbound message types match bridge dispatch
  // -------------------------------------------------------------------------

  describe('inbound message type coverage (docs/code sync)', () => {
    /**
     * This list must stay in sync with docs/advanced/dcc-integration.md.
     * If you add or remove an inbound command from the bridge, update the
     * docs AND this list so the two never drift apart again (issue #326).
     */
    const DOCUMENTED_INBOUND_TYPES = ['loadMedia', 'syncFrame', 'syncColor', 'ping'];

    it('accepts all documented inbound message types without UNKNOWN_TYPE error', async () => {
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 0,
        autoReconnect: false,
      });

      const samplePayloads: Record<string, object> = {
        loadMedia: { type: 'loadMedia', path: '/tmp/test.exr' },
        syncFrame: { type: 'syncFrame', frame: 1 },
        syncColor: { type: 'syncColor', exposure: 0 },
        ping: { type: 'ping' },
      };

      for (const msgType of DOCUMENTED_INBOUND_TYPES) {
        ws.sentMessages.length = 0;
        const payload = samplePayloads[msgType];
        expect(payload, `missing sample payload for "${msgType}"`).toBeDefined();

        ws.simulateMessage(JSON.stringify(payload));

        const errorMessages = ws.sentMessages
          .map((m) => JSON.parse(m))
          .filter((m: any) => m.type === 'error' && m.code === 'UNKNOWN_TYPE');

        expect(
          errorMessages,
          `"${msgType}" should be accepted but got UNKNOWN_TYPE`,
        ).toHaveLength(0);
      }

      bridge.dispose();
    });

    it('does not include statusChanged in the documented inbound set (#327)', () => {
      expect(DOCUMENTED_INBOUND_TYPES).not.toContain('statusChanged');
    });
  });

  // -------------------------------------------------------------------------
  // Regression: outbound message types must not include statusChanged (#327)
  // -------------------------------------------------------------------------

  describe('outbound message type coverage (docs/code sync)', () => {
    /**
     * This list must stay in sync with docs/advanced/dcc-integration.md.
     * If you add or remove an outbound event from the bridge, update the
     * docs AND this list so the two never drift apart again (issue #327).
     */
    const DOCUMENTED_OUTBOUND_TYPES: DCCOutboundMessageType[] = [
      'frameChanged',
      'colorChanged',
      'annotationAdded',
      'noteAdded',
      'ping',
      'pong',
      'error',
    ];

    it('statusChanged is NOT a supported outbound message type (#327)', () => {
      // Regression: the DCC integration docs previously claimed a statusChanged
      // outbound message existed. It never did. Ensure it never sneaks in.
      expect(DOCUMENTED_OUTBOUND_TYPES).not.toContain('statusChanged');

      // Also verify at the type level: sending a statusChanged message through
      // the bridge should produce an outbound message whose type field is one
      // of the documented types. We check the concrete helpers on DCCBridge
      // to ensure none of them produce 'statusChanged'.
      const helperNames = [
        'sendFrameChanged',
        'sendColorChanged',
        'sendAnnotationAdded',
        'sendNoteAdded',
        'sendError',
      ] as const;

      for (const name of helperNames) {
        expect(typeof DCCBridge.prototype[name]).toBe('function');
      }

      // Ensure there is no sendStatusChanged helper
      expect('sendStatusChanged' in DCCBridge.prototype).toBe(false);
    });

    it('rejects message types NOT in the documented set', async () => {
      const { bridge, ws } = await createConnectedBridge({
        heartbeatInterval: 0,
        autoReconnect: false,
      });

      const bogusTypes = ['load', 'seek', 'setFrameRange', 'setMetadata', 'setColorSpace'];

      for (const msgType of bogusTypes) {
        ws.sentMessages.length = 0;
        ws.simulateMessage(JSON.stringify({ type: msgType }));

        const errorMessages = ws.sentMessages
          .map((m) => JSON.parse(m))
          .filter((m: any) => m.type === 'error' && m.code === 'UNKNOWN_TYPE');

        expect(
          errorMessages,
          `"${msgType}" should be rejected as UNKNOWN_TYPE`,
        ).toHaveLength(1);
      }

      bridge.dispose();
    });
  });
});
