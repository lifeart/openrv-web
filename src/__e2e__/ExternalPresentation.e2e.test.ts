/**
 * ExternalPresentation E2E Integration Tests
 *
 * Verifies multi-window presentation wiring end-to-end:
 * - Instantiation and initialization of BroadcastChannel
 * - syncFrame / syncPlayback message passing
 * - openWindow behavior and popup-blocked fallback
 * - Window lifecycle (open, close, external close detection)
 * - dispose cleanup (channel closed, timers cleared, windows closed)
 * - Session ID isolation (cross-tab message filtering)
 * - syncColor message passing
 * - hasOpenWindows guard efficiency
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ExternalPresentation,
  generatePresentationHTML,
  type SyncFrameMsg,
  type SyncPlaybackMsg,
  type SyncColorMsg,
  type AnyPresentationMessage,
} from '../ui/components/ExternalPresentation';

describe('ExternalPresentation E2E', () => {
  let presenter: ExternalPresentation;

  beforeEach(() => {
    presenter = new ExternalPresentation();
  });

  afterEach(() => {
    presenter.dispose();
  });

  // ---------------------------------------------------------------------------
  // Instantiation & initialization
  // ---------------------------------------------------------------------------

  describe('instantiation and initialization', () => {
    it('creates an instance with a unique ID', () => {
      expect(presenter.id).toMatch(/^main-/);
    });

    it('starts with no open windows', () => {
      expect(presenter.hasOpenWindows).toBe(false);
      expect(presenter.windowCount).toBe(0);
    });

    it('initialize sets up BroadcastChannel', () => {
      presenter.initialize();
      // Second call is a no-op (idempotent)
      presenter.initialize();
      // No error thrown - channel was created successfully
      expect(presenter.hasOpenWindows).toBe(false);
    });

    it('initialize is idempotent - calling twice does not create duplicate channels', () => {
      presenter.initialize();
      const id1 = presenter.id;
      presenter.initialize();
      expect(presenter.id).toBe(id1);
    });
  });

  // ---------------------------------------------------------------------------
  // openWindow
  // ---------------------------------------------------------------------------

  describe('openWindow behavior', () => {
    beforeEach(() => {
      presenter.initialize();
    });

    it('returns a window ID when window.open succeeds', () => {
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const windowId = presenter.openWindow();
      expect(windowId).not.toBeNull();
      expect(windowId).toMatch(/^pres-/);
      expect(presenter.hasOpenWindows).toBe(true);
      expect(presenter.windowCount).toBe(1);
    });

    it('returns null when popup is blocked (window.open returns null)', () => {
      presenter.setWindowOpenFn(() => null);

      const windowId = presenter.openWindow();
      expect(windowId).toBeNull();
      expect(presenter.hasOpenWindows).toBe(false);
      expect(presenter.windowCount).toBe(0);
    });

    it('returns null when disposed', () => {
      presenter.dispose();
      const windowId = presenter.openWindow();
      expect(windowId).toBeNull();
    });

    it('emits windowOpened event when window opens successfully', () => {
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const callback = vi.fn();
      presenter.on('windowOpened', callback);

      const windowId = presenter.openWindow();
      expect(callback).toHaveBeenCalledWith(windowId);
    });

    it('does not emit windowOpened when popup is blocked', () => {
      presenter.setWindowOpenFn(() => null);

      const callback = vi.fn();
      presenter.on('windowOpened', callback);

      presenter.openWindow();
      expect(callback).not.toHaveBeenCalled();
    });

    it('can open multiple presentation windows', () => {
      const mockWindow1 = { closed: false, close: vi.fn() } as unknown as Window;
      const mockWindow2 = { closed: false, close: vi.fn() } as unknown as Window;
      let callCount = 0;
      presenter.setWindowOpenFn(() => {
        callCount++;
        return callCount === 1 ? mockWindow1 : mockWindow2;
      });

      const id1 = presenter.openWindow();
      const id2 = presenter.openWindow();
      expect(id1).not.toBe(id2);
      expect(presenter.windowCount).toBe(2);
    });

    it('passes custom features string to window.open', () => {
      const openFn = vi.fn().mockReturnValue({ closed: false, close: vi.fn() });
      presenter.setWindowOpenFn(openFn);

      const features = 'width=800,height=600';
      presenter.openWindow(features);

      expect(openFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        features,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // closeWindow
  // ---------------------------------------------------------------------------

  describe('closeWindow', () => {
    beforeEach(() => {
      presenter.initialize();
    });

    it('closes a specific window and emits windowClosed', () => {
      const closeFn = vi.fn();
      const mockWindow = { closed: false, close: closeFn } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const windowId = presenter.openWindow()!;
      expect(presenter.hasOpenWindows).toBe(true);

      const callback = vi.fn();
      presenter.on('windowClosed', callback);

      const result = presenter.closeWindow(windowId);
      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalled();
      expect(presenter.hasOpenWindows).toBe(false);
      expect(callback).toHaveBeenCalledWith(windowId);
    });

    it('returns false when closing a non-existent window', () => {
      const result = presenter.closeWindow('non-existent-id');
      expect(result).toBe(false);
    });

    it('handles already-closed windowRef gracefully', () => {
      const mockWindow = { closed: true, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const windowId = presenter.openWindow()!;
      const result = presenter.closeWindow(windowId);
      expect(result).toBe(true);
      // close() should NOT be called since the window is already closed
      expect(mockWindow.close).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // closeAll
  // ---------------------------------------------------------------------------

  describe('closeAll', () => {
    it('closes all open windows', () => {
      presenter.initialize();
      const close1 = vi.fn();
      const close2 = vi.fn();
      let callCount = 0;
      presenter.setWindowOpenFn(() => {
        callCount++;
        return {
          closed: false,
          close: callCount === 1 ? close1 : close2,
        } as unknown as Window;
      });

      presenter.openWindow();
      presenter.openWindow();
      expect(presenter.windowCount).toBe(2);

      presenter.closeAll();
      expect(presenter.windowCount).toBe(0);
      expect(close1).toHaveBeenCalled();
      expect(close2).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // syncFrame message passing
  // ---------------------------------------------------------------------------

  describe('syncFrame message passing', () => {
    it('broadcasts syncFrame message over BroadcastChannel', () => {
      presenter.initialize();

      // We can verify the broadcast by listening on a separate channel instance
      const receivedMessages: AnyPresentationMessage[] = [];
      const receiverChannel = new BroadcastChannel('openrv-presentation');
      receiverChannel.onmessage = (event) => {
        receivedMessages.push(event.data);
      };

      presenter.syncFrame(42, 100);

      // BroadcastChannel messages are async (microtask), use setTimeout
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          receiverChannel.close();
          const frameMsg = receivedMessages.find((m) => m.type === 'syncFrame') as SyncFrameMsg | undefined;
          expect(frameMsg).toBeDefined();
          expect(frameMsg!.frame).toBe(42);
          expect(frameMsg!.totalFrames).toBe(100);
          expect(frameMsg!.senderId).toBe(presenter.id);
          expect(frameMsg!.sessionId).toBeDefined();
          resolve();
        }, 50);
      });
    });

    it('does not broadcast when channel is not initialized', () => {
      // No initialize() call - channel is null
      // Should not throw
      expect(() => presenter.syncFrame(1, 10)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // syncPlayback message passing
  // ---------------------------------------------------------------------------

  describe('syncPlayback message passing', () => {
    it('broadcasts syncPlayback message with correct fields', () => {
      presenter.initialize();

      const receivedMessages: AnyPresentationMessage[] = [];
      const receiverChannel = new BroadcastChannel('openrv-presentation');
      receiverChannel.onmessage = (event) => {
        receivedMessages.push(event.data);
      };

      presenter.syncPlayback(true, 2.0, 50);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          receiverChannel.close();
          const playbackMsg = receivedMessages.find((m) => m.type === 'syncPlayback') as SyncPlaybackMsg | undefined;
          expect(playbackMsg).toBeDefined();
          expect(playbackMsg!.playing).toBe(true);
          expect(playbackMsg!.playbackRate).toBe(2.0);
          expect(playbackMsg!.frame).toBe(50);
          expect(playbackMsg!.senderId).toBe(presenter.id);
          resolve();
        }, 50);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // syncColor message passing
  // ---------------------------------------------------------------------------

  describe('syncColor message passing', () => {
    it('broadcasts syncColor message with partial settings', () => {
      presenter.initialize();

      const receivedMessages: AnyPresentationMessage[] = [];
      const receiverChannel = new BroadcastChannel('openrv-presentation');
      receiverChannel.onmessage = (event) => {
        receivedMessages.push(event.data);
      };

      presenter.syncColor({ exposure: 1.5, gamma: 2.2 });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          receiverChannel.close();
          const colorMsg = receivedMessages.find((m) => m.type === 'syncColor') as SyncColorMsg | undefined;
          expect(colorMsg).toBeDefined();
          expect(colorMsg!.exposure).toBe(1.5);
          expect(colorMsg!.gamma).toBe(2.2);
          expect(colorMsg!.temperature).toBeUndefined();
          expect(colorMsg!.tint).toBeUndefined();
          resolve();
        }, 50);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Session ID isolation
  // ---------------------------------------------------------------------------

  describe('session ID isolation', () => {
    it('ignores messages from other sessions', () => {
      presenter.initialize();

      const callback = vi.fn();
      presenter.on('syncFrame', callback);

      // Simulate a message from a different session
      const foreignChannel = new BroadcastChannel('openrv-presentation');
      foreignChannel.postMessage({
        type: 'syncFrame',
        senderId: 'foreign-sender',
        sessionId: 'foreign-session-id',
        timestamp: Date.now(),
        frame: 99,
        totalFrames: 200,
      } as SyncFrameMsg);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          foreignChannel.close();
          // The callback should NOT have been called because session IDs don't match
          expect(callback).not.toHaveBeenCalled();
          resolve();
        }, 50);
      });
    });

    it('ignores own messages (senderId filtering)', () => {
      presenter.initialize();

      const callback = vi.fn();
      presenter.on('syncFrame', callback);

      // Manually broadcast a message with our own sender ID
      // This simulates the echo that BroadcastChannel produces
      // Note: BroadcastChannel does NOT deliver messages to the sender,
      // so we simulate by posting from another channel with our sender ID
      const echoChannel = new BroadcastChannel('openrv-presentation');
      echoChannel.postMessage({
        type: 'syncFrame',
        senderId: presenter.id,
        sessionId: undefined,
        timestamp: Date.now(),
        frame: 10,
        totalFrames: 50,
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          echoChannel.close();
          expect(callback).not.toHaveBeenCalled();
          resolve();
        }, 50);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Window lifecycle - external close detection
  // ---------------------------------------------------------------------------

  describe('window lifecycle', () => {
    it('isWindowOpen returns true for open windows', () => {
      presenter.initialize();
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const windowId = presenter.openWindow()!;
      expect(presenter.isWindowOpen(windowId)).toBe(true);
    });

    it('isWindowOpen returns false for unknown window IDs', () => {
      presenter.initialize();
      expect(presenter.isWindowOpen('unknown-id')).toBe(false);
    });

    it('isWindowOpen returns false after window is externally closed', () => {
      presenter.initialize();
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const windowId = presenter.openWindow()!;
      expect(presenter.isWindowOpen(windowId)).toBe(true);

      // Simulate user closing the window externally
      (mockWindow as any).closed = true;

      // isWindowOpen checks the windowRef.closed property directly
      expect(presenter.isWindowOpen(windowId)).toBe(false);
    });

    it('getWindows returns all tracked window states', () => {
      presenter.initialize();
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      presenter.openWindow();
      presenter.openWindow();

      const windows = presenter.getWindows();
      expect(windows.length).toBe(2);
      expect(windows[0]!.open).toBe(true);
      expect(windows[1]!.open).toBe(true);
    });

    it('handles windowClosed message from presentation window', () => {
      presenter.initialize();
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const windowId = presenter.openWindow()!;
      expect(presenter.windowCount).toBe(1);

      const callback = vi.fn();
      presenter.on('windowClosed', callback);

      // Simulate the presentation window sending a windowClosed message
      const remoteChannel = new BroadcastChannel('openrv-presentation');
      // We need to get the session ID. Since it's private, we infer from
      // a broadcast. Instead, we'll use a known window ID as senderId.
      // The windowClosed handler checks windows.get(message.senderId).
      // The window ID was generated internally, so we use the known ID.
      remoteChannel.postMessage({
        type: 'windowClosed',
        senderId: windowId,
        // No sessionId means it won't be filtered by session mismatch
        timestamp: Date.now(),
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          remoteChannel.close();
          // The window should have been removed from tracking
          expect(presenter.windowCount).toBe(0);
          expect(callback).toHaveBeenCalledWith(windowId);
          resolve();
        }, 50);
      });
    });

    it('handles windowReady message from presentation window', () => {
      presenter.initialize();
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const windowId = presenter.openWindow()!;

      const callback = vi.fn();
      presenter.on('windowReady', callback);

      const remoteChannel = new BroadcastChannel('openrv-presentation');
      remoteChannel.postMessage({
        type: 'windowReady',
        senderId: windowId,
        timestamp: Date.now(),
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          remoteChannel.close();
          expect(callback).toHaveBeenCalledWith(windowId);
          resolve();
        }, 50);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // dispose cleanup
  // ---------------------------------------------------------------------------

  describe('dispose cleanup', () => {
    it('closes all windows on dispose', () => {
      presenter.initialize();
      const closeFn = vi.fn();
      const mockWindow = { closed: false, close: closeFn } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      presenter.openWindow();
      presenter.openWindow();
      expect(presenter.windowCount).toBe(2);

      presenter.dispose();
      expect(closeFn).toHaveBeenCalledTimes(2);
    });

    it('clears the window check interval on dispose', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      presenter.initialize();
      presenter.dispose();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('closes BroadcastChannel on dispose', () => {
      presenter.initialize();
      // After dispose, broadcasting should be a no-op (no error)
      presenter.dispose();
      expect(() => presenter.syncFrame(1, 10)).not.toThrow();
    });

    it('removes all event listeners on dispose', () => {
      presenter.initialize();
      const callback = vi.fn();
      presenter.on('windowOpened', callback);

      presenter.dispose();

      // Events should no longer fire after dispose
      // (We can't easily trigger windowOpened after dispose since openWindow returns null,
      // but the removeAllListeners call ensures no listeners remain)
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);
      // openWindow returns null because disposed flag is set
      const result = presenter.openWindow();
      expect(result).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    });

    it('is idempotent - double dispose does not throw', () => {
      presenter.initialize();
      presenter.dispose();
      expect(() => presenter.dispose()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // hasOpenWindows guard efficiency
  // ---------------------------------------------------------------------------

  describe('hasOpenWindows guard', () => {
    it('returns false when no windows are open', () => {
      presenter.initialize();
      expect(presenter.hasOpenWindows).toBe(false);
    });

    it('returns true when at least one window is open', () => {
      presenter.initialize();
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      presenter.openWindow();
      expect(presenter.hasOpenWindows).toBe(true);
    });

    it('returns false after all windows are closed', () => {
      presenter.initialize();
      const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
      presenter.setWindowOpenFn(() => mockWindow);

      const id1 = presenter.openWindow()!;
      const id2 = presenter.openWindow()!;
      expect(presenter.hasOpenWindows).toBe(true);

      presenter.closeWindow(id1);
      expect(presenter.hasOpenWindows).toBe(true); // still has id2

      presenter.closeWindow(id2);
      expect(presenter.hasOpenWindows).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // ping
  // ---------------------------------------------------------------------------

  describe('ping', () => {
    it('broadcasts a ping message', () => {
      presenter.initialize();

      const receivedMessages: AnyPresentationMessage[] = [];
      const receiverChannel = new BroadcastChannel('openrv-presentation');
      receiverChannel.onmessage = (event) => {
        receivedMessages.push(event.data);
      };

      presenter.ping();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          receiverChannel.close();
          const pingMsg = receivedMessages.find((m) => m.type === 'ping');
          expect(pingMsg).toBeDefined();
          expect(pingMsg!.senderId).toBe(presenter.id);
          resolve();
        }, 50);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // generatePresentationHTML
  // ---------------------------------------------------------------------------

  describe('generatePresentationHTML', () => {
    it('generates valid HTML with window ID, channel name, and session ID', () => {
      const html = generatePresentationHTML('test-win-1', 'test-channel', 'test-session');

      expect(html).toContain('test-win-1');
      expect(html).toContain('test-channel');
      expect(html).toContain('test-session');
      expect(html).toContain('<canvas id="viewer">');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('BroadcastChannel');
    });

    it('includes windowReady notification on load', () => {
      const html = generatePresentationHTML('win-1', 'ch', 'sess');
      expect(html).toContain("type: 'windowReady'");
    });

    it('includes windowClosed notification on beforeunload', () => {
      const html = generatePresentationHTML('win-1', 'ch', 'sess');
      expect(html).toContain("type: 'windowClosed'");
      expect(html).toContain('beforeunload');
    });

    it('includes session ID filtering for cross-tab isolation', () => {
      const html = generatePresentationHTML('win-1', 'ch', 'my-session');
      expect(html).toContain('SESSION_ID');
      expect(html).toContain('my-session');
      expect(html).toContain('msg.sessionId !== SESSION_ID');
    });

    it('includes ping/pong handler for liveness checks', () => {
      const html = generatePresentationHTML('win-1', 'ch', 'sess');
      expect(html).toContain("case 'ping'");
      expect(html).toContain("type: 'pong'");
    });
  });
});
