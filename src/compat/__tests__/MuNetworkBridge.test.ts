/**
 * Tests for MuNetworkBridge — WebSocket scheme selection in remoteConnect.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MuNetworkBridge } from '../MuNetworkBridge';

// Mock WebSocket so remoteConnect doesn't actually open connections
class MockWebSocket {
  url: string;
  readyState = 0;
  addEventListener = vi.fn();
  send = vi.fn();
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
  }
}

describe('MuNetworkBridge remoteConnect scheme selection', () => {
  let bridge: MuNetworkBridge;
  let originalLocation: PropertyDescriptor | undefined;
  const createdSockets: MockWebSocket[] = [];

  beforeEach(() => {
    bridge = new MuNetworkBridge();
    bridge.remoteNetwork(true);
    createdSockets.length = 0;

    vi.stubGlobal(
      'WebSocket',
      class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdSockets.push(this);
        }
      },
    );

    // Save original location descriptor
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
  });

  afterEach(() => {
    bridge.dispose();
    vi.unstubAllGlobals();
    // Restore original location
    if (originalLocation) {
      Object.defineProperty(window, 'location', originalLocation);
    }
  });

  function setProtocol(protocol: string) {
    Object.defineProperty(window, 'location', {
      value: { protocol },
      writable: true,
      configurable: true,
    });
  }

  function lastSocketUrl(): string {
    return createdSockets[createdSockets.length - 1]!.url;
  }

  it('uses ws:// for localhost', () => {
    bridge.remoteConnect('test', 'localhost', 45124);
    expect(lastSocketUrl()).toBe('ws://localhost:45124');
  });

  it('uses ws:// for 127.0.0.1', () => {
    bridge.remoteConnect('test', '127.0.0.1', 45124);
    expect(lastSocketUrl()).toBe('ws://127.0.0.1:45124');
  });

  it('uses ws:// for remote host when page protocol is http:', () => {
    setProtocol('http:');
    bridge.remoteConnect('test', 'internal-server.local', 9000);
    expect(lastSocketUrl()).toBe('ws://internal-server.local:9000');
  });

  it('uses wss:// for remote host when page protocol is https:', () => {
    setProtocol('https:');
    bridge.remoteConnect('test', 'remote.example.com', 9000);
    expect(lastSocketUrl()).toBe('wss://remote.example.com:9000');
  });

  it('uses explicit ws:// prefix as-is', () => {
    bridge.remoteConnect('test', 'ws://myhost', 9000);
    expect(lastSocketUrl()).toBe('ws://myhost:9000');
  });

  it('uses explicit wss:// prefix as-is', () => {
    bridge.remoteConnect('test', 'wss://myhost', 9000);
    expect(lastSocketUrl()).toBe('wss://myhost:9000');
  });

  it('does not double the port when explicit scheme already includes port', () => {
    bridge.remoteConnect('test', 'ws://myhost:7777', 9000);
    expect(lastSocketUrl()).toBe('ws://myhost:7777');
  });
});

describe('MuNetworkBridge remoteContacts', () => {
  let bridge: MuNetworkBridge;
  const createdSockets: MockWebSocket[] = [];
  /** Captured 'message' event listeners keyed by socket URL */
  const messageListeners = new Map<string, (event: { data: string }) => void>();

  beforeEach(() => {
    bridge = new MuNetworkBridge();
    bridge.remoteNetwork(true);
    bridge.setRemoteDefaultPermission(2); // allow handshake processing
    createdSockets.length = 0;
    messageListeners.clear();

    vi.stubGlobal(
      'WebSocket',
      class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdSockets.push(this);
          // Capture addEventListener calls to extract the 'message' handler
          this.addEventListener = vi.fn().mockImplementation((type: string, handler: (...args: unknown[]) => void) => {
            if (type === 'message') {
              messageListeners.set(url, handler as (event: { data: string }) => void);
            }
          });
        }
      },
    );
  });

  afterEach(() => {
    bridge.dispose();
    vi.unstubAllGlobals();
  });

  it('returns the local connection label before handshake', () => {
    bridge.remoteConnect('my-local-label', 'localhost', 9000);
    expect(bridge.remoteContacts()).toEqual(['my-local-label']);
  });

  it('returns peer contact name after handshake', () => {
    bridge.remoteConnect('my-local-label', 'localhost', 9000);

    // Simulate receiving a handshake message from the peer
    const onMessage = messageListeners.get('ws://localhost:9000');
    expect(onMessage).toBeDefined();
    onMessage!({
      data: JSON.stringify({
        type: 'handshake',
        contactName: 'peer-identity',
        permission: 1,
      }),
    });

    expect(bridge.remoteContacts()).toEqual(['peer-identity']);
  });

  it('returns peer contact names for multiple connections', () => {
    bridge.remoteConnect('label-a', 'localhost', 9000);
    bridge.remoteConnect('label-b', 'localhost', 9001);

    // Handshake only the first connection
    const onMessageA = messageListeners.get('ws://localhost:9000');
    onMessageA!({
      data: JSON.stringify({
        type: 'handshake',
        contactName: 'peer-a',
        permission: 2,
      }),
    });

    // Second connection hasn't received handshake yet — should fall back
    const contacts = bridge.remoteContacts();
    expect(contacts).toEqual(['peer-a', 'label-b']);
  });

  it('remoteApplications still returns local connection labels', () => {
    bridge.remoteConnect('my-app-label', 'localhost', 9000);

    // Simulate handshake
    const onMessage = messageListeners.get('ws://localhost:9000');
    onMessage!({
      data: JSON.stringify({
        type: 'handshake',
        contactName: 'peer-name',
        permission: 1,
      }),
    });

    // remoteApplications should still return the local label
    expect(bridge.remoteApplications()).toEqual(['my-app-label']);
  });
});
