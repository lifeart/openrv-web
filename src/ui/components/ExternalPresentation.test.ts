/**
 * ExternalPresentation Unit Tests
 *
 * Tests for the multi-device presentation system using BroadcastChannel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExternalPresentation,
  generatePresentationHTML,
  type AnyPresentationMessage,
  type SyncFrameMsg,
  type SyncPlaybackMsg,
  type SyncColorMsg,
  type PingMsg,
} from './ExternalPresentation';

// ---------------------------------------------------------------------------
// Mock BroadcastChannel
// ---------------------------------------------------------------------------

class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private closed = false;

  static instances: MockBroadcastChannel[] = [];

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error('Channel closed');

    // Deliver to all other instances with same name
    for (const instance of MockBroadcastChannel.instances) {
      if (instance !== this && instance.name === this.name && !instance.closed && instance.onmessage) {
        instance.onmessage({ data } as MessageEvent);
      }
    }
  }

  close(): void {
    this.closed = true;
    const idx = MockBroadcastChannel.instances.indexOf(this);
    if (idx >= 0) MockBroadcastChannel.instances.splice(idx, 1);
  }

  /** Test helper: simulate receiving a message on this channel */
  simulateMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

// ---------------------------------------------------------------------------
// Mock Window
// ---------------------------------------------------------------------------

function createMockWindow(closed = false): Window {
  return {
    closed,
    close: vi.fn(),
  } as unknown as Window;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePresentationHTML', () => {
  it('EP-HTML-001: generates valid HTML with window ID', () => {
    const html = generatePresentationHTML('test-window', 'test-channel', 'test-session-id');
    expect(html).toContain('test-window');
    expect(html).toContain('test-channel');
    expect(html).toContain('test-session-id');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<canvas');
    expect(html).toContain('BroadcastChannel');
  });

  it('EP-HTML-002: escapes XSS characters in windowId and channelName', () => {
    // The fix added escapeJSString() and escapeHTML() to prevent script injection
    const maliciousId = "test<script>alert('xss')</script>";
    const maliciousChannel = "chan';</script><script>alert(1)//";
    const html = generatePresentationHTML(maliciousId, maliciousChannel, 'session-1');

    // Should NOT contain raw <script> tags from the input
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).not.toContain("chan';</script>");

    // The JS string context should have escaped single quotes and < characters
    expect(html).not.toMatch(/const WINDOW_ID = '.*<script>/);
    // The HTML context should have escaped < and > characters
    expect(html).not.toMatch(/Presentation: .*<script>/);

    // Verify the output is still valid HTML structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('BroadcastChannel');
  });
});

describe('ExternalPresentation', () => {
  let presenter: ExternalPresentation;

  beforeEach(() => {
    MockBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn(),
    });

    presenter = new ExternalPresentation();
  });

  afterEach(() => {
    presenter.dispose();
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('EP-INIT-001: starts with no windows', () => {
      expect(presenter.windowCount).toBe(0);
      expect(presenter.hasOpenWindows).toBe(false);
    });

    it('EP-INIT-002: has a unique instance ID', () => {
      expect(presenter.id).toContain('main-');
    });

    it('EP-INIT-003: initialize creates BroadcastChannel', () => {
      presenter.initialize();
      expect(MockBroadcastChannel.instances.length).toBeGreaterThan(0);
    });
  });

  describe('window management', () => {
    it('EP-WIN-001: openWindow creates a window', () => {
      presenter.initialize();
      const mockWin = createMockWindow();
      presenter.setWindowOpenFn((_url, _target, _features) => mockWin);

      const id = presenter.openWindow();
      expect(id).not.toBeNull();
      expect(presenter.windowCount).toBe(1);
      expect(presenter.hasOpenWindows).toBe(true);
    });

    it('EP-WIN-002: openWindow returns null if popup blocked', () => {
      presenter.initialize();
      presenter.setWindowOpenFn(() => null);

      const id = presenter.openWindow();
      expect(id).toBeNull();
      expect(presenter.windowCount).toBe(0);
    });

    it('EP-WIN-003: closeWindow closes a window', () => {
      presenter.initialize();
      const mockWin = createMockWindow();
      presenter.setWindowOpenFn(() => mockWin);

      const id = presenter.openWindow()!;
      expect(presenter.windowCount).toBe(1);

      presenter.closeWindow(id);
      expect(presenter.windowCount).toBe(0);
      expect(mockWin.close).toHaveBeenCalled();
    });

    it('EP-WIN-004: closeWindow returns false for unknown ID', () => {
      presenter.initialize();
      expect(presenter.closeWindow('nonexistent')).toBe(false);
    });

    it('EP-WIN-005: closeAll closes all windows', () => {
      presenter.initialize();
      const mockWin1 = createMockWindow();
      const mockWin2 = createMockWindow();
      let callCount = 0;
      presenter.setWindowOpenFn(() => {
        callCount++;
        return callCount === 1 ? mockWin1 : mockWin2;
      });

      presenter.openWindow();
      presenter.openWindow();
      expect(presenter.windowCount).toBe(2);

      presenter.closeAll();
      expect(presenter.windowCount).toBe(0);
    });

    it('EP-WIN-006: isWindowOpen checks window state', () => {
      presenter.initialize();
      const mockWin = createMockWindow();
      presenter.setWindowOpenFn(() => mockWin);

      const id = presenter.openWindow()!;
      expect(presenter.isWindowOpen(id)).toBe(true);

      presenter.closeWindow(id);
      expect(presenter.isWindowOpen(id)).toBe(false);
    });

    it('EP-WIN-007: getWindows returns all window states', () => {
      presenter.initialize();
      presenter.setWindowOpenFn(() => createMockWindow());

      presenter.openWindow();
      presenter.openWindow();

      const windows = presenter.getWindows();
      expect(windows).toHaveLength(2);
      expect(windows[0]!.open).toBe(true);
    });

    it('EP-WIN-008: openWindow after dispose returns null', () => {
      presenter.initialize();
      presenter.dispose();

      // Re-create since dispose removes listeners
      presenter = new ExternalPresentation();
      presenter.initialize();
      presenter.dispose();

      expect(presenter.openWindow()).toBeNull();
    });
  });

  describe('events', () => {
    it('EP-EVT-001: emits windowOpened', () => {
      presenter.initialize();
      presenter.setWindowOpenFn(() => createMockWindow());

      const listener = vi.fn();
      presenter.on('windowOpened', listener);

      presenter.openWindow();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('EP-EVT-002: emits windowClosed on close', () => {
      presenter.initialize();
      presenter.setWindowOpenFn(() => createMockWindow());

      const listener = vi.fn();
      presenter.on('windowClosed', listener);

      const id = presenter.openWindow()!;
      presenter.closeWindow(id);
      expect(listener).toHaveBeenCalledWith(id);
    });
  });

  describe('state synchronization', () => {
    it('EP-SYNC-001: syncFrame broadcasts frame data', () => {
      presenter.initialize();

      // Create a second channel to receive messages
      const receiver = new MockBroadcastChannel('openrv-presentation');
      const received: AnyPresentationMessage[] = [];
      receiver.onmessage = (event) => {
        received.push(event.data as AnyPresentationMessage);
      };

      presenter.syncFrame(42, 100);

      expect(received.length).toBe(1);
      const msg = received[0] as SyncFrameMsg;
      expect(msg.type).toBe('syncFrame');
      expect(msg.frame).toBe(42);
      expect(msg.totalFrames).toBe(100);
      expect(msg.senderId).toBe(presenter.id);
      expect(msg.timestamp).toBeGreaterThan(0);

      receiver.close();
    });

    it('EP-SYNC-002: syncPlayback broadcasts playback state', () => {
      presenter.initialize();

      const receiver = new MockBroadcastChannel('openrv-presentation');
      const received: AnyPresentationMessage[] = [];
      receiver.onmessage = (event) => {
        received.push(event.data as AnyPresentationMessage);
      };

      presenter.syncPlayback(true, 2.0, 10);

      expect(received.length).toBe(1);
      const msg = received[0] as SyncPlaybackMsg;
      expect(msg.type).toBe('syncPlayback');
      expect(msg.playing).toBe(true);
      expect(msg.playbackRate).toBe(2.0);
      expect(msg.frame).toBe(10);

      receiver.close();
    });

    it('EP-SYNC-003: syncColor broadcasts color settings', () => {
      presenter.initialize();

      const receiver = new MockBroadcastChannel('openrv-presentation');
      const received: AnyPresentationMessage[] = [];
      receiver.onmessage = (event) => {
        received.push(event.data as AnyPresentationMessage);
      };

      presenter.syncColor({ exposure: 1.5, gamma: 2.2 });

      expect(received.length).toBe(1);
      const msg = received[0] as SyncColorMsg;
      expect(msg.type).toBe('syncColor');
      expect(msg.exposure).toBe(1.5);
      expect(msg.gamma).toBe(2.2);

      receiver.close();
    });
  });

  describe('incoming messages', () => {
    it('EP-IN-001: handles windowReady from presentation', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('windowReady', listener);

      // Simulate a presentation window sending windowReady
      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'windowReady',
        senderId: 'pres-123',
        timestamp: Date.now(),
      });

      expect(listener).toHaveBeenCalledWith('pres-123');
    });

    it('EP-IN-002: handles windowClosed from presentation', () => {
      presenter.initialize();
      presenter.setWindowOpenFn(() => createMockWindow());
      const id = presenter.openWindow()!;

      const listener = vi.fn();
      presenter.on('windowClosed', listener);

      // Simulate the presentation window sending windowClosed
      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'windowClosed',
        senderId: id,
        timestamp: Date.now(),
      });

      expect(listener).toHaveBeenCalledWith(id);
      expect(presenter.windowCount).toBe(0);
    });

    it('EP-IN-003: ignores messages from self', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncFrame', listener);

      // Simulate a message with our own senderId
      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'syncFrame',
        senderId: presenter.id,
        frame: 42,
        totalFrames: 100,
        timestamp: Date.now(),
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('EP-IN-004: handles syncFrame from another window', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncFrame', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'syncFrame',
        senderId: 'other-window',
        frame: 50,
        totalFrames: 200,
        timestamp: Date.now(),
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const msg = listener.mock.calls[0]![0] as SyncFrameMsg;
      expect(msg.frame).toBe(50);
      expect(msg.totalFrames).toBe(200);
    });

    it('EP-IN-005: ignores null/invalid messages', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncFrame', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage(null);
      channel.simulateMessage({ noType: true });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('presentation HTML message handling', () => {
    it('EP-HTML-MSG-001: generated HTML handles syncPlayback messages', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // Verify the HTML contains syncPlayback handler
      expect(html).toContain("case 'syncPlayback':");
      expect(html).toContain('msg.playing');
      expect(html).toContain('msg.playbackRate');
    });

    it('EP-HTML-MSG-002: generated HTML handles syncColor messages', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // Verify the HTML contains syncColor handler
      expect(html).toContain("case 'syncColor':");
      expect(html).toContain('msg.exposure');
      expect(html).toContain('msg.gamma');
    });

    it('EP-HTML-MSG-003: generated HTML handles all sync message types without silent drops', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // All message types the main app sends must be handled
      expect(html).toContain("case 'ping':");
      expect(html).toContain("case 'syncFrame':");
      expect(html).toContain("case 'syncPlayback':");
      expect(html).toContain("case 'syncColor':");
      // Unknown message types should produce a warning (default case)
      expect(html).toContain('default:');
      expect(html).toContain('Unhandled message type');
    });

    it('EP-HTML-MSG-004: generated HTML logs warning for color sync without WebGL', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // syncColor should warn that color pipeline can't be applied
      expect(html).toContain('cannot be applied without WebGL viewer');
    });

    it('EP-HTML-MSG-005: generated HTML logs info for playback state sync', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // syncPlayback should log info about state
      expect(html).toContain('Playback state synced');
    });
  });

  describe('state sync event forwarding', () => {
    it('EP-SYNC-004: handles syncPlayback from another window', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncPlayback', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'syncPlayback',
        senderId: 'other-window',
        playing: true,
        playbackRate: 2.0,
        frame: 25,
        timestamp: Date.now(),
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const msg = listener.mock.calls[0]![0] as SyncPlaybackMsg;
      expect(msg.playing).toBe(true);
      expect(msg.playbackRate).toBe(2.0);
      expect(msg.frame).toBe(25);
    });

    it('EP-SYNC-005: handles syncColor from another window', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncColor', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'syncColor',
        senderId: 'other-window',
        exposure: 1.5,
        gamma: 2.2,
        temperature: 6500,
        tint: 0.1,
        timestamp: Date.now(),
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const msg = listener.mock.calls[0]![0] as SyncColorMsg;
      expect(msg.exposure).toBe(1.5);
      expect(msg.gamma).toBe(2.2);
      expect(msg.temperature).toBe(6500);
      expect(msg.tint).toBe(0.1);
    });
  });

  describe('session isolation', () => {
    it('EP-ISO-001: rejects messages from a different session', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncFrame', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'syncFrame',
        senderId: 'other-window',
        sessionId: 'different-session-id',
        frame: 10,
        totalFrames: 50,
        timestamp: Date.now(),
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('EP-ISO-002: accepts messages without sessionId (from child windows)', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncFrame', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'syncFrame',
        senderId: 'other-window',
        frame: 10,
        totalFrames: 50,
        timestamp: Date.now(),
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('window lifecycle', () => {
    it('EP-LIFE-001: detects externally closed windows via checkWindows', () => {
      vi.useFakeTimers();
      presenter.initialize();
      const mockWin = createMockWindow();
      presenter.setWindowOpenFn(() => mockWin);

      const id = presenter.openWindow()!;
      expect(presenter.isWindowOpen(id)).toBe(true);

      // Simulate user closing the window
      (mockWin as unknown as { closed: boolean }).closed = true;

      // Advance timer to trigger window check
      vi.advanceTimersByTime(2500);

      expect(presenter.windowCount).toBe(0);
      vi.useRealTimers();
    });

    it('EP-LIFE-002: emits windowClosed when external close detected', () => {
      vi.useFakeTimers();
      presenter.initialize();
      const mockWin = createMockWindow();
      presenter.setWindowOpenFn(() => mockWin);

      const listener = vi.fn();
      presenter.on('windowClosed', listener);

      const id = presenter.openWindow()!;
      (mockWin as unknown as { closed: boolean }).closed = true;

      vi.advanceTimersByTime(2500);

      expect(listener).toHaveBeenCalledWith(id);
      vi.useRealTimers();
    });

    it('EP-LIFE-003: can reopen window after previous one was closed', () => {
      presenter.initialize();
      const mockWin1 = createMockWindow();
      const mockWin2 = createMockWindow();
      let callCount = 0;
      presenter.setWindowOpenFn(() => {
        callCount++;
        return callCount === 1 ? mockWin1 : mockWin2;
      });

      const id1 = presenter.openWindow()!;
      presenter.closeWindow(id1);
      expect(presenter.windowCount).toBe(0);

      const id2 = presenter.openWindow()!;
      expect(id2).not.toBe(id1);
      expect(presenter.windowCount).toBe(1);
    });
  });

  describe('dispose', () => {
    it('EP-DISP-001: dispose closes channel', () => {
      presenter.initialize();
      presenter.dispose();
      // Channel instance should have been closed
      // (MockBroadcastChannel removes from instances on close)
      expect(MockBroadcastChannel.instances.length).toBe(0);
    });

    it('EP-DISP-002: dispose closes all windows', () => {
      presenter.initialize();
      const mockWin = createMockWindow();
      presenter.setWindowOpenFn(() => mockWin);
      presenter.openWindow();

      presenter.dispose();
      expect(mockWin.close).toHaveBeenCalled();
    });

    it('EP-DISP-003: double dispose does not throw', () => {
      presenter.initialize();
      presenter.dispose();
      expect(() => presenter.dispose()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('EP-EDGE-001: syncFrame without initialize does not throw', () => {
      // Channel is null when not initialized — broadcast should silently return
      expect(() => presenter.syncFrame(1, 100)).not.toThrow();
    });

    it('EP-EDGE-002: syncPlayback without initialize does not throw', () => {
      expect(() => presenter.syncPlayback(true, 1.0, 5)).not.toThrow();
    });

    it('EP-EDGE-003: syncColor without initialize does not throw', () => {
      expect(() => presenter.syncColor({ exposure: 1.0 })).not.toThrow();
    });

    it('EP-EDGE-004: syncColor with empty settings broadcasts message', () => {
      presenter.initialize();

      const receiver = new MockBroadcastChannel('openrv-presentation');
      const received: AnyPresentationMessage[] = [];
      receiver.onmessage = (event) => {
        received.push(event.data as AnyPresentationMessage);
      };

      presenter.syncColor({});

      expect(received.length).toBe(1);
      const msg = received[0] as SyncColorMsg;
      expect(msg.type).toBe('syncColor');
      expect(msg.exposure).toBeUndefined();
      expect(msg.gamma).toBeUndefined();

      receiver.close();
    });

    it('EP-EDGE-005: syncColor with partial fields only sends provided fields', () => {
      presenter.initialize();

      const receiver = new MockBroadcastChannel('openrv-presentation');
      const received: AnyPresentationMessage[] = [];
      receiver.onmessage = (event) => {
        received.push(event.data as AnyPresentationMessage);
      };

      presenter.syncColor({ gamma: 2.2 });

      const msg = received[0] as SyncColorMsg;
      expect(msg.gamma).toBe(2.2);
      expect(msg.exposure).toBeUndefined();
      expect(msg.temperature).toBeUndefined();
      expect(msg.tint).toBeUndefined();

      receiver.close();
    });

    it('EP-EDGE-006: rapid sequential messages are all delivered', () => {
      presenter.initialize();

      const receiver = new MockBroadcastChannel('openrv-presentation');
      const received: AnyPresentationMessage[] = [];
      receiver.onmessage = (event) => {
        received.push(event.data as AnyPresentationMessage);
      };

      for (let i = 0; i < 50; i++) {
        presenter.syncFrame(i, 100);
      }

      expect(received.length).toBe(50);
      expect((received[0] as SyncFrameMsg).frame).toBe(0);
      expect((received[49] as SyncFrameMsg).frame).toBe(49);

      receiver.close();
    });

    it('EP-EDGE-007: handles message with unknown type gracefully', () => {
      presenter.initialize();

      const channel = MockBroadcastChannel.instances[0]!;
      // Should not throw for completely unknown types
      expect(() => {
        channel.simulateMessage({
          type: 'unknownType',
          senderId: 'other-window',
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });

    it('EP-EDGE-008: handles message with missing senderId', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('syncFrame', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      // senderId is undefined — should not match self, so message passes through
      channel.simulateMessage({
        type: 'syncFrame',
        frame: 10,
        totalFrames: 50,
        timestamp: Date.now(),
      });

      // Message without senderId should still be forwarded since undefined !== instanceId
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('EP-EDGE-009: pong updates activity but does not emit events', () => {
      presenter.initialize();
      const mockWin = createMockWindow();
      presenter.setWindowOpenFn(() => mockWin);
      const id = presenter.openWindow()!;

      // No event emitter for pong
      const syncFrameListener = vi.fn();
      const syncPlaybackListener = vi.fn();
      const syncColorListener = vi.fn();
      presenter.on('syncFrame', syncFrameListener);
      presenter.on('syncPlayback', syncPlaybackListener);
      presenter.on('syncColor', syncColorListener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'pong',
        senderId: id,
        timestamp: Date.now(),
      });

      expect(syncFrameListener).not.toHaveBeenCalled();
      expect(syncPlaybackListener).not.toHaveBeenCalled();
      expect(syncColorListener).not.toHaveBeenCalled();
    });

    it('EP-EDGE-010: ping broadcasts to all channels', () => {
      presenter.initialize();

      const receiver = new MockBroadcastChannel('openrv-presentation');
      const received: AnyPresentationMessage[] = [];
      receiver.onmessage = (event) => {
        received.push(event.data as AnyPresentationMessage);
      };

      presenter.ping();

      expect(received.length).toBe(1);
      expect((received[0] as PingMsg).type).toBe('ping');

      receiver.close();
    });

    it('EP-EDGE-011: windowClosed from unknown sender is ignored gracefully', () => {
      presenter.initialize();

      const listener = vi.fn();
      presenter.on('windowClosed', listener);

      const channel = MockBroadcastChannel.instances[0]!;
      channel.simulateMessage({
        type: 'windowClosed',
        senderId: 'unknown-window-id',
        timestamp: Date.now(),
      });

      // windowClosed from unknown sender should not emit event
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('generated HTML behavior (syncFrame vs updateInfoDisplay)', () => {
    it('EP-HTML-BEH-001: syncFrame sets textContent directly without playback/color info', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // The syncFrame case sets textContent directly with just frame info,
      // bypassing updateInfoDisplay() which would include playback and color state.
      // This is the domain expert observation — syncFrame loses enriched display temporarily.
      expect(html).toContain(
        "document.getElementById('info').textContent =\n            'Frame: ' + msg.frame + ' / ' + msg.totalFrames;"
      );

      // Confirm syncPlayback and syncColor use updateInfoDisplay() instead
      expect(html).toMatch(/case 'syncPlayback':[\s\S]*?updateInfoDisplay\(\)/);
      expect(html).toMatch(/case 'syncColor':[\s\S]*?updateInfoDisplay\(\)/);
    });

    it('EP-HTML-BEH-002: updateInfoDisplay includes both playback and color state', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // updateInfoDisplay should show frame, playback status, and color info
      expect(html).toContain("parts.push('\\u25B6 ' + playbackState.playbackRate + 'x')");
      expect(html).toContain("parts.push('\\u23F8')");
      expect(html).toContain("colorParts.push('Exp:' + colorState.exposure.toFixed(2))");
      expect(html).toContain("colorParts.push('\\u03B3:' + colorState.gamma.toFixed(2))");
    });

    it('EP-HTML-BEH-003: syncFrame updates playbackState.frame for subsequent updateInfoDisplay calls', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // syncFrame should update playbackState.frame so when updateInfoDisplay
      // is later called by syncPlayback/syncColor, it has the right frame
      expect(html).toContain('playbackState.frame = msg.frame;');
    });

    it('EP-HTML-BEH-004: default case in switch only warns for truly unknown types', () => {
      const html = generatePresentationHTML('win-1', 'test-channel', 'sess-1');

      // The default case should not warn for known non-action messages
      expect(html).toContain("msg.type !== 'windowReady'");
      expect(html).toContain("msg.type !== 'windowClosed'");
      expect(html).toContain("msg.type !== 'pong'");
    });
  });
});
