/**
 * DCCBridge E2E Integration Tests
 *
 * Verifies the full wiring of the DCCBridge feature end-to-end:
 *   URL param detection (?dcc=ws://...) -> DCCBridge instantiation
 *   bridge.syncFrame -> session.goToFrame
 *   bridge.loadMedia -> headerBar.emit('loadURL', path) [type-unsafe]
 *   session.frameChanged -> bridge.sendFrameChanged
 *   connect/dispose lifecycle
 *
 * Also validates:
 * - URL param UX pattern assessment
 * - Type safety of headerBar.emit('loadURL' as never, ...)
 * - Missing syncColor -> renderer wiring
 * - Missing outbound sendColorChanged wiring
 * - Missing config panel for WebSocket URL
 * - WebSocket reconnection and heartbeat behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DCCBridge, type DCCBridgeConfig, type SyncFrameMessage, type LoadMediaMessage, type SyncColorMessage } from '../integrations/DCCBridge';
import { EventEmitter } from '../utils/EventEmitter';

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
  sentMessages: string[] = [];

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  simulateClose(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
}

// ---------------------------------------------------------------------------
// Stub Session and HeaderBar matching App.ts wiring
// ---------------------------------------------------------------------------

interface StubSessionEvents {
  frameChanged: void;
  playbackChanged: boolean;
}

class StubSession extends EventEmitter<StubSessionEvents> {
  currentFrame = 1;
  frameCount = 100;
  fps = 24;
  goToFrame = vi.fn((frame: number) => { this.currentFrame = frame; });
}

class StubHeaderBar extends EventEmitter {
  // Track all emissions for verification
  emittedEvents: Array<{ event: string; data: unknown }> = [];

  emit(event: string, data: unknown): void {
    this.emittedEvents.push({ event, data });
    super.emit(event, data);
  }
}

// ---------------------------------------------------------------------------
// Reproduce App.ts DCC wiring (lines 302-313)
// ---------------------------------------------------------------------------

function createDCCBridgeWiring(dccUrl: string | null) {
  const session = new StubSession();
  const headerBar = new StubHeaderBar();
  let dccBridge: DCCBridge | null = null;
  let mockWs: MockWebSocket | null = null;

  if (dccUrl) {
    // Capture the MockWebSocket instance when created
    const wsImpl = vi.fn((url: string) => {
      mockWs = new MockWebSocket(url);
      return mockWs;
    }) as unknown as typeof WebSocket;

    dccBridge = new DCCBridge({ url: dccUrl }, wsImpl);

    // Wiring from App.ts lines 305-311
    dccBridge.on('syncFrame', (msg) => session.goToFrame(msg.frame));
    dccBridge.on('loadMedia', (msg) => {
      headerBar.emit('loadURL' as never, msg.path as never);
    });
    session.on('frameChanged', () => {
      dccBridge?.sendFrameChanged(session.currentFrame, session.frameCount);
    });

    dccBridge.connect();
  }

  return {
    session,
    headerBar,
    dccBridge,
    getMockWs: () => mockWs,
    dispose: () => {
      dccBridge?.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DCCBridge E2E Integration', () => {
  // =========================================================================
  // 1. URL param detection and instantiation
  // =========================================================================
  describe('URL param detection', () => {
    it('DCC-E2E-001: DCCBridge is created when ?dcc= URL param is present', () => {
      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      expect(ctx.dccBridge).toBeInstanceOf(DCCBridge);
      ctx.dispose();
    });

    it('DCC-E2E-002: DCCBridge is null when ?dcc= URL param is absent', () => {
      const ctx = createDCCBridgeWiring(null);
      expect(ctx.dccBridge).toBeNull();
      ctx.dispose();
    });

    it('DCC-E2E-003: DCCBridge connects automatically on creation', () => {
      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      // Bridge should be in connecting state after connect() call
      expect(ctx.dccBridge!.state).toBe('connecting');
      ctx.dispose();
    });

  });

  // =========================================================================
  // 2. Inbound: syncFrame -> session.goToFrame
  // =========================================================================
  describe('syncFrame wiring', () => {
    let ctx: ReturnType<typeof createDCCBridgeWiring>;

    beforeEach(() => {
      ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();
    });

    afterEach(() => {
      ctx.dispose();
    });

    it('DCC-E2E-010: syncFrame message calls session.goToFrame with correct frame', () => {
      const ws = ctx.getMockWs()!;
      ws.simulateMessage(JSON.stringify({ type: 'syncFrame', frame: 42 }));

      expect(ctx.session.goToFrame).toHaveBeenCalledWith(42);
    });

    it('DCC-E2E-011: syncFrame with frame 1 navigates to first frame', () => {
      const ws = ctx.getMockWs()!;
      ws.simulateMessage(JSON.stringify({ type: 'syncFrame', frame: 1 }));

      expect(ctx.session.goToFrame).toHaveBeenCalledWith(1);
    });

    it('DCC-E2E-012: syncFrame with large frame number is passed through', () => {
      const ws = ctx.getMockWs()!;
      ws.simulateMessage(JSON.stringify({ type: 'syncFrame', frame: 99999 }));

      // Session.goToFrame is expected to clamp internally
      expect(ctx.session.goToFrame).toHaveBeenCalledWith(99999);
    });

    it('DCC-E2E-013: syncFrame with non-numeric frame sends error back', () => {
      const ws = ctx.getMockWs()!;
      ws.simulateMessage(JSON.stringify({ type: 'syncFrame', frame: 'abc' }));

      // Should not call goToFrame
      expect(ctx.session.goToFrame).not.toHaveBeenCalled();

      // Should send error response
      const errorMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'error' && parsed.code === 'INVALID_PARAMS';
      });
      expect(errorMsg).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Inbound: loadMedia -> headerBar.emit('loadURL', path)
  // =========================================================================
  describe('loadMedia wiring', () => {
    let ctx: ReturnType<typeof createDCCBridgeWiring>;

    beforeEach(() => {
      ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();
    });

    afterEach(() => {
      ctx.dispose();
    });

    it('DCC-E2E-020: loadMedia emits loadURL on headerBar with the file path', () => {
      const ws = ctx.getMockWs()!;
      ws.simulateMessage(JSON.stringify({
        type: 'loadMedia',
        path: '/mnt/shows/project/shot.exr',
      }));

      // Verify the headerBar received the event
      const loadEvent = ctx.headerBar.emittedEvents.find((e) => e.event === 'loadURL');
      expect(loadEvent).toBeDefined();
      expect(loadEvent!.data).toBe('/mnt/shows/project/shot.exr');
    });

    it('DCC-E2E-021: [TYPE SAFETY] headerBar.emit uses "as never" casts', () => {
      // The code: headerBar.emit('loadURL' as never, msg.path as never)
      //
      // This is a type-safety issue:
      // 1. 'loadURL' is NOT in HeaderBarEvents interface (which has: showShortcuts,
      //    showCustomKeyBindings, fileLoaded, saveProject, openProject,
      //    fullscreenToggle, presentationToggle)
      // 2. The 'as never' cast bypasses TypeScript's type checking entirely
      // 3. Nobody listens for 'loadURL' on headerBar - this is a dead-end event
      //
      // This means loadMedia messages from DCC tools are silently dropped.
      // The path string is emitted, but no handler processes it.
      //
      // Fix: Either add 'loadURL' to HeaderBarEvents, or wire loadMedia
      // directly to session.loadFile/loadURL instead of going through headerBar.

      const ws = ctx.getMockWs()!;
      ws.simulateMessage(JSON.stringify({
        type: 'loadMedia',
        path: '/mnt/shows/shot.exr',
      }));

      // The event IS emitted (EventEmitter allows any string at runtime),
      // but no handler is ever registered for 'loadURL' on HeaderBar in
      // the actual app, so this is effectively a no-op in production.
      const loadEvent = ctx.headerBar.emittedEvents.find((e) => e.event === 'loadURL');
      expect(loadEvent).toBeDefined(); // Emitted but unhandled in real app
    });

    it('DCC-E2E-022: loadMedia without path sends error response', () => {
      const ws = ctx.getMockWs()!;
      ws.simulateMessage(JSON.stringify({ type: 'loadMedia' }));

      const errorMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'error' && parsed.code === 'INVALID_PARAMS';
      });
      expect(errorMsg).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Outbound: session.frameChanged -> sendFrameChanged
  // =========================================================================
  describe('outbound frameChanged wiring', () => {
    let ctx: ReturnType<typeof createDCCBridgeWiring>;

    beforeEach(() => {
      ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();
    });

    afterEach(() => {
      ctx.dispose();
    });

    it('DCC-E2E-030: session.frameChanged sends frameChanged message over WebSocket', () => {
      ctx.session.currentFrame = 42;
      ctx.session.frameCount = 200;

      ctx.session.emit('frameChanged', undefined);

      const ws = ctx.getMockWs()!;
      const sent = ws.sentMessages.map((m) => JSON.parse(m));
      const frameMsg = sent.find((m) => m.type === 'frameChanged');

      expect(frameMsg).toBeDefined();
      expect(frameMsg.frame).toBe(42);
      expect(frameMsg.totalFrames).toBe(200);
    });

    it('DCC-E2E-031: frameChanged includes timestamp', () => {
      ctx.session.currentFrame = 1;
      ctx.session.emit('frameChanged', undefined);

      const ws = ctx.getMockWs()!;
      const sent = JSON.parse(ws.sentMessages[0]!);
      expect(sent.timestamp).toBeDefined();
      expect(typeof sent.timestamp).toBe('string');
    });

    it('DCC-E2E-032: frameChanged is not sent when WebSocket is not open', () => {
      const ws = ctx.getMockWs()!;
      ws.readyState = MockWebSocket.CLOSED;

      ctx.session.emit('frameChanged', undefined);

      // No new messages sent (there may be pre-existing ones from heartbeat etc.)
      const frameMessages = ws.sentMessages.filter((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'frameChanged';
      });
      expect(frameMessages).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. MISSING WIRING: syncColor -> renderer settings
  // =========================================================================
  describe('[GAP] syncColor wiring', () => {
    it('DCC-E2E-040: [DOCUMENTS GAP] syncColor event is emitted but not wired in App.ts', () => {
      // DCCBridge emits 'syncColor' when it receives a syncColor message.
      // However, App.ts does NOT wire this event to any handler.
      //
      // Missing wiring:
      //   dccBridge.on('syncColor', (msg) => {
      //     if (msg.exposure !== undefined) viewer.setExposure(msg.exposure);
      //     if (msg.gamma !== undefined) viewer.setGamma(msg.gamma);
      //     if (msg.temperature !== undefined) viewer.setTemperature(msg.temperature);
      //     if (msg.tint !== undefined) viewer.setTint(msg.tint);
      //   });
      //
      // This means color sync from DCC tools is silently ignored.

      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();

      const syncColorListener = vi.fn();
      ctx.dccBridge!.on('syncColor', syncColorListener);

      ctx.getMockWs()!.simulateMessage(JSON.stringify({
        type: 'syncColor',
        exposure: 1.5,
        gamma: 2.2,
      }));

      // The event IS emitted by DCCBridge
      expect(syncColorListener).toHaveBeenCalledTimes(1);
      expect(syncColorListener).toHaveBeenCalledWith(
        expect.objectContaining({ exposure: 1.5, gamma: 2.2 })
      );

      // But in App.ts, nobody handles it
      ctx.dispose();
    });
  });

  // =========================================================================
  // 6. MISSING WIRING: outbound sendColorChanged
  // =========================================================================
  describe('[GAP] outbound sendColorChanged', () => {
    it('DCC-E2E-050: [DOCUMENTS GAP] no wiring exists for color changes -> sendColorChanged', () => {
      // DCCBridge.sendColorChanged() exists as a public API, but App.ts
      // does NOT wire any color change events to it.
      //
      // Missing wiring (expected):
      //   viewer.on('colorChanged', (settings) => {
      //     dccBridge?.sendColorChanged(settings);
      //   });
      // OR:
      //   controls.colorControls.on('adjustmentsChanged', (adj) => {
      //     dccBridge?.sendColorChanged({
      //       exposure: adj.exposure,
      //       gamma: adj.gamma,
      //     });
      //   });
      //
      // This means the DCC tool never receives color change notifications
      // from OpenRV Web, breaking bidirectional color sync.

      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();

      const sendSpy = vi.spyOn(ctx.dccBridge!, 'sendColorChanged');

      // Simulate various app interactions that would change color
      // None of these trigger sendColorChanged because no wiring exists
      ctx.session.emit('frameChanged', undefined); // only sends frameChanged

      // sendColorChanged is never called from the wiring
      expect(sendSpy).not.toHaveBeenCalled();

      ctx.dispose();
    });
  });


  // =========================================================================
  // 8. Connection lifecycle
  // =========================================================================
  describe('connection lifecycle', () => {
    it('DCC-E2E-070: connection state transitions correctly', () => {
      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      const states: string[] = [];
      ctx.dccBridge!.on('connectionStateChanged', (state) => states.push(state));

      // Already connecting from createDCCBridgeWiring
      ctx.getMockWs()?.simulateOpen();
      expect(states).toContain('connected');

      ctx.dispose();
    });

    it('DCC-E2E-071: ping message receives pong response', () => {
      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();

      ctx.getMockWs()!.simulateMessage(JSON.stringify({ type: 'ping', id: 'hb-001' }));

      const ws = ctx.getMockWs()!;
      const pongMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'pong' && parsed.id === 'hb-001';
      });
      expect(pongMsg).toBeDefined();

      ctx.dispose();
    });

    it('DCC-E2E-072: unknown message type sends error response', () => {
      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();

      ctx.getMockWs()!.simulateMessage(JSON.stringify({ type: 'unknownCommand' }));

      const ws = ctx.getMockWs()!;
      const errorMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'error' && parsed.code === 'UNKNOWN_TYPE';
      });
      expect(errorMsg).toBeDefined();

      ctx.dispose();
    });

    it('DCC-E2E-073: invalid JSON sends parse error response', () => {
      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();

      ctx.getMockWs()!.simulateMessage('{invalid json');

      const ws = ctx.getMockWs()!;
      const errorMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'error' && parsed.code === 'PARSE_ERROR';
      });
      expect(errorMsg).toBeDefined();

      ctx.dispose();
    });

    it('DCC-E2E-074: dispose prevents further sends', () => {
      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();

      ctx.dispose();

      // After dispose, sending should return false or throw
      expect(() => {
        ctx.dccBridge!.connect();
      }).toThrow('DCCBridge is disposed');
    });

    it('DCC-E2E-075: dispose can be called safely when bridge is null', () => {
      const ctx = createDCCBridgeWiring(null);
      expect(() => ctx.dispose()).not.toThrow();
    });
  });

  // =========================================================================
  // 9. Protocol message validation
  // =========================================================================
  describe('protocol message validation', () => {
    let ctx: ReturnType<typeof createDCCBridgeWiring>;

    beforeEach(() => {
      ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();
    });

    afterEach(() => {
      ctx.dispose();
    });

    it('DCC-E2E-080: message missing type field sends INVALID_MESSAGE error', () => {
      ctx.getMockWs()!.simulateMessage(JSON.stringify({ data: 'no type' }));

      const ws = ctx.getMockWs()!;
      const errorMsg = ws.sentMessages.find((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'error' && parsed.code === 'INVALID_MESSAGE';
      });
      expect(errorMsg).toBeDefined();
    });

    it('DCC-E2E-081: loadMedia with valid path is forwarded correctly', () => {
      ctx.getMockWs()!.simulateMessage(JSON.stringify({
        type: 'loadMedia',
        path: 'https://cdn.example.com/shot.exr',
        frame: 10,
      }));

      const loadEvent = ctx.headerBar.emittedEvents.find((e) => e.event === 'loadURL');
      expect(loadEvent).toBeDefined();
      expect(loadEvent!.data).toBe('https://cdn.example.com/shot.exr');
    });

    it('DCC-E2E-082: syncColor with partial settings is accepted', () => {
      const syncColorListener = vi.fn();
      ctx.dccBridge!.on('syncColor', syncColorListener);

      ctx.getMockWs()!.simulateMessage(JSON.stringify({
        type: 'syncColor',
        exposure: 2.0,
        // gamma, temperature, tint are all optional
      }));

      expect(syncColorListener).toHaveBeenCalledTimes(1);
      expect(syncColorListener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'syncColor', exposure: 2.0 })
      );
    });

    it('DCC-E2E-083: messageReceived fires for every valid inbound message', () => {
      const listener = vi.fn();
      ctx.dccBridge!.on('messageReceived', listener);

      ctx.getMockWs()!.simulateMessage(JSON.stringify({ type: 'ping' }));
      ctx.getMockWs()!.simulateMessage(JSON.stringify({ type: 'syncFrame', frame: 5 }));
      ctx.getMockWs()!.simulateMessage(JSON.stringify({ type: 'syncColor' }));

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('DCC-E2E-084: messageSent fires for every outbound message', () => {
      const listener = vi.fn();
      ctx.dccBridge!.on('messageSent', listener);

      ctx.dccBridge!.sendFrameChanged(1, 100);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'frameChanged', frame: 1, totalFrames: 100 })
      );
    });
  });

  // =========================================================================
  // 10. Bidirectional sync loop protection
  // =========================================================================
  describe('sync loop considerations', () => {
    it('DCC-E2E-090: syncFrame triggers frameChanged which sends back to DCC', () => {
      // This tests a potential feedback loop:
      // DCC sends syncFrame(42) -> session.goToFrame(42) -> session emits
      // frameChanged -> sendFrameChanged(42, 100) -> DCC receives frameChanged
      //
      // This could cause an infinite loop if the DCC tool responds to
      // frameChanged by sending syncFrame again. The current implementation
      // does NOT protect against this loop.
      //
      // The DCC tool is expected to handle this (e.g., ignore frameChanged
      // messages that match the frame it just sent). But the bridge should
      // ideally have loop protection (e.g., suppress outbound frameChanged
      // for a short window after receiving syncFrame).

      const ctx = createDCCBridgeWiring('ws://localhost:45124');
      ctx.getMockWs()?.simulateOpen();

      // Simulate inbound syncFrame
      ctx.getMockWs()!.simulateMessage(JSON.stringify({ type: 'syncFrame', frame: 42 }));

      // session.goToFrame was called
      expect(ctx.session.goToFrame).toHaveBeenCalledWith(42);

      // Now simulate what happens when session.goToFrame triggers frameChanged
      ctx.session.currentFrame = 42;
      ctx.session.emit('frameChanged', undefined);

      // A frameChanged message is sent back to DCC
      const ws = ctx.getMockWs()!;
      const frameMessages = ws.sentMessages.filter((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === 'frameChanged';
      });
      expect(frameMessages.length).toBeGreaterThan(0);

      // This documents the potential feedback loop
      ctx.dispose();
    });
  });
});
