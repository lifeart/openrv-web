import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppNetworkBridge } from './AppNetworkBridge';
import { EventEmitter } from './utils/EventEmitter';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockSession extends EventEmitter {
  currentFrame = 1;
  playbackSpeed = 1;
  playDirection = 1;
  loopMode = 'loop';
  isPlaying = false;
  play = vi.fn();
  pause = vi.fn();
  goToFrame = vi.fn();
}

function createMockNetworkSyncManager() {
  return {
    isConnected: true,
    on: vi.fn(() => vi.fn()),
    sendPlaybackSync: vi.fn(),
    sendFrameSync: vi.fn(),
    getSyncStateManager: vi.fn(() => ({
      isApplyingRemoteState: false,
      beginApplyRemote: vi.fn(),
      endApplyRemote: vi.fn(),
      shouldApplyFrameSync: vi.fn(() => true),
    })),
    simulateRoomCreated: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    setSyncSettings: vi.fn(),
    roomInfo: null,
  };
}

function createMockNetworkControl() {
  return {
    on: vi.fn(() => vi.fn()),
    render: vi.fn(() => document.createElement('div')),
    setConnectionState: vi.fn(),
    setRoomInfo: vi.fn(),
    setUsers: vi.fn(),
    showError: vi.fn(),
    setRTT: vi.fn(),
  };
}

function createMockViewer() {
  return {
    setZoom: vi.fn(),
  };
}

function createMockHeaderBar() {
  return {
    setNetworkControl: vi.fn(),
  };
}

function createContext() {
  const session = new MockSession();
  const networkSyncManager = createMockNetworkSyncManager();
  const networkControl = createMockNetworkControl();
  const viewer = createMockViewer();
  const headerBar = createMockHeaderBar();

  return {
    session: session as any,
    viewer: viewer as any,
    networkSyncManager: networkSyncManager as any,
    networkControl: networkControl as any,
    headerBar: headerBar as any,
    // Keep typed references for assertions
    _session: session,
    _networkSyncManager: networkSyncManager,
    _networkControl: networkControl,
    _viewer: viewer,
    _headerBar: headerBar,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppNetworkBridge', () => {
  let ctx: ReturnType<typeof createContext>;
  let bridge: AppNetworkBridge;

  beforeEach(() => {
    ctx = createContext();
    bridge = new AppNetworkBridge({
      session: ctx.session,
      viewer: ctx.viewer,
      networkSyncManager: ctx.networkSyncManager,
      networkControl: ctx.networkControl,
      headerBar: ctx.headerBar,
    });
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('ANB-001: creates bridge without throwing', () => {
      expect(bridge).toBeInstanceOf(AppNetworkBridge);
    });
  });

  // -----------------------------------------------------------------------
  // setup
  // -----------------------------------------------------------------------
  describe('setup', () => {
    it('ANB-010: setup() wires events without throwing', () => {
      expect(() => bridge.setup()).not.toThrow();
    });

    it('ANB-011: after setup, session playbackChanged triggers sendPlaybackSync', () => {
      bridge.setup();

      ctx._session.emit('playbackChanged', true);

      expect(ctx._networkSyncManager.sendPlaybackSync).toHaveBeenCalledTimes(1);
      expect(ctx._networkSyncManager.sendPlaybackSync).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlaying: true,
          currentFrame: ctx._session.currentFrame,
          playbackSpeed: ctx._session.playbackSpeed,
          playDirection: ctx._session.playDirection,
          loopMode: ctx._session.loopMode,
        }),
      );
    });

    it('ANB-012: after setup, session frameChanged triggers sendFrameSync', () => {
      bridge.setup();

      ctx._session.emit('frameChanged', 42);

      expect(ctx._networkSyncManager.sendFrameSync).toHaveBeenCalledTimes(1);
      expect(ctx._networkSyncManager.sendFrameSync).toHaveBeenCalledWith(42);
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------
  describe('dispose', () => {
    it('ANB-020: dispose() calls unsubscribers (session event listeners are removed)', () => {
      bridge.setup();
      bridge.dispose();

      // After dispose, emitting events should not call sync methods
      ctx._session.emit('playbackChanged', true);
      ctx._session.emit('frameChanged', 10);

      expect(ctx._networkSyncManager.sendPlaybackSync).not.toHaveBeenCalled();
      expect(ctx._networkSyncManager.sendFrameSync).not.toHaveBeenCalled();
    });

    it('ANB-021: after dispose, session playbackChanged does NOT trigger sendPlaybackSync', () => {
      bridge.setup();

      // Verify it works before dispose
      ctx._session.emit('playbackChanged', false);
      expect(ctx._networkSyncManager.sendPlaybackSync).toHaveBeenCalledTimes(1);

      bridge.dispose();
      ctx._networkSyncManager.sendPlaybackSync.mockClear();

      // Should not trigger after dispose
      ctx._session.emit('playbackChanged', true);
      expect(ctx._networkSyncManager.sendPlaybackSync).not.toHaveBeenCalled();
    });

    it('ANB-022: after dispose, session frameChanged does NOT trigger sendFrameSync', () => {
      bridge.setup();

      // Verify it works before dispose
      ctx._session.emit('frameChanged', 5);
      expect(ctx._networkSyncManager.sendFrameSync).toHaveBeenCalledTimes(1);

      bridge.dispose();
      ctx._networkSyncManager.sendFrameSync.mockClear();

      // Should not trigger after dispose
      ctx._session.emit('frameChanged', 99);
      expect(ctx._networkSyncManager.sendFrameSync).not.toHaveBeenCalled();
    });

    it('ANB-023: dispose() is idempotent', () => {
      bridge.setup();

      expect(() => {
        bridge.dispose();
        bridge.dispose();
        bridge.dispose();
      }).not.toThrow();
    });

    it('ANB-024: dispose() empties unsubscribers array', () => {
      bridge.setup();
      bridge.dispose();

      // Access the private field via type assertion for verification
      expect((bridge as any).unsubscribers).toEqual([]);
    });

    it('ANB-025: dispose() without prior setup() does not throw', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect((bridge as any).unsubscribers).toEqual([]);
    });
  });
});
