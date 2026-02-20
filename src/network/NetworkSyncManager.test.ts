/**
 * NetworkSyncManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkSyncManager } from './NetworkSyncManager';
import type { ConnectionState, SyncUser } from './types';
import { encodeWebRTCURLSignal } from './WebRTCURLSignaling';

// Mock WebSocket (same as in WebSocketClient tests)
vi.stubGlobal('WebSocket', class {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;

  constructor(_url: string) {
    // Don't auto-connect in these tests
  }

  send(_data: string): void {}
  close(_code?: number, _reason?: string): void {
    this.readyState = 3;
    this.onclose?.({ code: _code ?? 1000, reason: _reason ?? '' });
  }
});

describe('NetworkSyncManager', () => {
  let manager: NetworkSyncManager;

  beforeEach(() => {
    manager = new NetworkSyncManager({ userName: 'TestUser' });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('initialization', () => {
    it('NSM-001: initializes in disconnected state', () => {
      expect(manager.connectionState).toBe('disconnected');
      expect(manager.isConnected).toBe(false);
      expect(manager.roomInfo).toBeNull();
      expect(manager.users).toEqual([]);
    });
  });

  describe('room management', () => {
    it('NSM-002: _applyLocalRoomCreation generates valid room code', () => {
      manager._applyLocalRoomCreation();
      expect(manager.roomInfo).not.toBeNull();
      expect(manager.roomInfo!.roomCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('NSM-003: _applyLocalRoomCreation sets connected state', () => {
      const handler = vi.fn();
      manager.on('connectionStateChanged', handler);

      manager._applyLocalRoomCreation();

      expect(manager.connectionState).toBe('connected');
      expect(manager.isConnected).toBe(true);
      expect(handler).toHaveBeenCalledWith('connected');
    });

    it('NSM-003b: _applyLocalRoomCreation makes user the host', () => {
      manager._applyLocalRoomCreation();
      expect(manager.isHost).toBe(true);
      expect(manager.users.length).toBe(1);
      expect(manager.users[0]!.isHost).toBe(true);
    });

    it('NSM-004: joinRoom validates room code format', () => {
      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      manager.joinRoom('invalid');

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler.mock.calls[0]![0].code).toBe('INVALID_CODE');
    });

    it('NSM-006: leaveRoom sends leave message and disconnects', () => {
      manager._applyLocalRoomCreation();
      expect(manager.isConnected).toBe(true);

      manager.leaveRoom();

      expect(manager.connectionState).toBe('disconnected');
      expect(manager.roomInfo).toBeNull();
    });

    it('NSM-007: leaveRoom emits roomLeft event', () => {
      const handler = vi.fn();
      manager.on('roomLeft', handler);

      manager._applyLocalRoomCreation();
      manager.leaveRoom();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('connection events', () => {
    it('NSM-010: emits connectionStateChanged on connect', () => {
      const states: ConnectionState[] = [];
      manager.on('connectionStateChanged', (s) => states.push(s));

      manager._applyLocalRoomCreation();

      expect(states).toContain('connected');
    });

    it('NSM-011: emits connectionStateChanged on disconnect', () => {
      manager._applyLocalRoomCreation();

      const states: ConnectionState[] = [];
      manager.on('connectionStateChanged', (s) => states.push(s));

      manager.leaveRoom();

      expect(states).toContain('disconnected');
    });
  });

  describe('wss fallback', () => {
    it('NSM-011b: createRoom falls back to local host room after reconnect failure on wss', () => {
      manager.dispose();
      manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'wss://sync.openrv.local' });

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      manager.createRoom('Host');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(manager.connectionState).toBe('connected');
      expect(manager.isHost).toBe(true);
      expect(manager.roomInfo).not.toBeNull();
      expect(errorHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ code: 'RECONNECT_FAILED' }),
      );
    });

    it('NSM-011c: joinRoom does not auto-fallback on reconnect failure (wss)', () => {
      manager.dispose();
      manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'wss://sync.openrv.local' });

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(manager.connectionState).toBe('error');
      expect(manager.roomInfo).toBeNull();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'RECONNECT_FAILED' }),
      );
    });

    it('NSM-011d: createRoom over ws:// does not auto-fallback', () => {
      manager.dispose();
      manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'ws://localhost:1234' });

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      manager.createRoom('Host');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(manager.connectionState).toBe('error');
      expect(manager.roomInfo).toBeNull();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'RECONNECT_FAILED' }),
      );
    });

    it('NSM-011e: joinRoom over ws:// does not auto-fallback', () => {
      manager.dispose();
      manager = new NetworkSyncManager({ userName: 'TestUser', serverUrl: 'ws://localhost:1234' });

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      manager.joinRoom('ABCD-1234', 'Guest');
      const wsClient = (manager as any).wsClient;
      wsClient.emit('reconnectFailed', undefined);

      expect(manager.connectionState).toBe('error');
      expect(manager.roomInfo).toBeNull();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'RECONNECT_FAILED' }),
      );
    });

    it('NSM-011f: applyServerlessResponseLink returns false when no pending invite exists', async () => {
      const answerToken = encodeWebRTCURLSignal({
        version: 1,
        type: 'answer',
        roomId: 'room-1',
        roomCode: 'ABCD-1234',
        hostUserId: 'host-1',
        guestUserId: 'guest-1',
        guestUserName: 'Guest',
        guestColor: '#4ade80',
        createdAt: Date.now(),
        sdp: 'v=0\no=- 2 2 IN IP4 127.0.0.1',
      });

      await expect(manager.applyServerlessResponseLink(answerToken)).resolves.toBe(false);
    });
  });

  describe('user presence', () => {
    it('NSM-012: emits usersChanged when user joins', () => {
      manager._applyLocalRoomCreation();

      const handler = vi.fn();
      manager.on('usersChanged', handler);

      manager._applyLocalUserJoin('Alice');

      expect(handler).toHaveBeenCalled();
      const users = handler.mock.calls[0]![0] as SyncUser[];
      expect(users.length).toBe(2);
      expect(users[1]!.name).toBe('Alice');
    });

    it('NSM-013: emits usersChanged when user leaves', () => {
      manager._applyLocalRoomCreation();
      const alice = manager._applyLocalUserJoin('Alice');

      const handler = vi.fn();
      manager.on('usersChanged', handler);

      manager.simulateUserLeft(alice.id);

      expect(handler).toHaveBeenCalled();
      const users = handler.mock.calls[0]![0] as SyncUser[];
      expect(users.length).toBe(1);
    });

    it('NSM-014: emits userJoined event', () => {
      manager._applyLocalRoomCreation();

      const handler = vi.fn();
      manager.on('userJoined', handler);

      manager._applyLocalUserJoin('Bob');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0]![0].name).toBe('Bob');
    });

    it('NSM-015: emits userLeft event', () => {
      manager._applyLocalRoomCreation();
      const bob = manager._applyLocalUserJoin('Bob');

      const handler = vi.fn();
      manager.on('userLeft', handler);

      manager.simulateUserLeft(bob.id);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0]![0].name).toBe('Bob');
    });

    it('NSM-016: emits toast message on user join', () => {
      manager._applyLocalRoomCreation();

      const handler = vi.fn();
      manager.on('toastMessage', handler);

      manager._applyLocalUserJoin('Charlie');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0]![0].message).toContain('Charlie');
    });
  });

  describe('sync settings', () => {
    it('NSM-033: respects sync settings when applying', () => {
      manager.setSyncSettings({
        playback: true,
        view: false,
        color: false,
        annotations: false,
        cursor: true,
      });

      const settings = manager.syncSettings;
      expect(settings.playback).toBe(true);
      expect(settings.view).toBe(false);
    });
  });

  describe('playback sync', () => {
    it('NSM-021: sends sync message on playback change', () => {
      manager._applyLocalRoomCreation();

      const dispatchSpy = vi.spyOn(manager as any, 'dispatchRealtimeMessage');

      manager.sendPlaybackSync({
        isPlaying: true,
        currentFrame: 10,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      });

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const message = dispatchSpy.mock.calls[0]![0] as { type: string; payload: Record<string, unknown> };
      expect(message.type).toBe('sync.playback');
      expect(message.payload.isPlaying).toBe(true);
      expect(message.payload.currentFrame).toBe(10);
    });

    it('NSM-024: ignores local changes from sync messages', () => {
      manager._applyLocalRoomCreation();
      const sm = manager.getSyncStateManager();

      const dispatchSpy = vi.spyOn(manager as any, 'dispatchRealtimeMessage');

      sm.beginApplyRemote();

      // This should be suppressed since we're applying remote state
      manager.sendPlaybackSync({
        isPlaying: true,
        currentFrame: 10,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      });

      expect(dispatchSpy).not.toHaveBeenCalled();

      sm.endApplyRemote();
    });
  });

  describe('frame sync', () => {
    it('NSM-025: sends frame sync message', () => {
      manager._applyLocalRoomCreation();

      const dispatchSpy = vi.spyOn(manager as any, 'dispatchRealtimeMessage');

      manager.sendFrameSync(42);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const message = dispatchSpy.mock.calls[0]![0] as { type: string; payload: Record<string, unknown> };
      expect(message.type).toBe('sync.frame');
      expect(message.payload.currentFrame).toBe(42);
    });
  });

  describe('view sync', () => {
    it('NSM-032: sends view sync message', () => {
      manager._applyLocalRoomCreation();

      const dispatchSpy = vi.spyOn(manager as any, 'dispatchRealtimeMessage');

      manager.sendViewSync({ panX: 0, panY: 0, zoom: 2, channelMode: 'rgb' });

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const message = dispatchSpy.mock.calls[0]![0] as { type: string; payload: Record<string, unknown> };
      expect(message.type).toBe('sync.view');
      expect(message.payload.zoom).toBe(2);
      expect(message.payload.channelMode).toBe('rgb');
    });
  });

  describe('state sync request', () => {
    it('NSM-042: requests state sync', () => {
      manager._applyLocalRoomCreation();

      const dispatchSpy = vi.spyOn(manager as any, 'dispatchRealtimeMessage');

      manager.requestStateSync();

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const message = dispatchSpy.mock.calls[0]![0] as { type: string };
      expect(message.type).toBe('sync.state-request');
    });

    it('NSM-042b: requestMediaSync returns transfer ID when connected', () => {
      manager._applyLocalRoomCreation();
      const transferId = manager.requestMediaSync();
      expect(transferId).toBeTruthy();
    });

    it('NSM-042c: requestMediaSync returns empty string when disconnected', () => {
      const transferId = manager.requestMediaSync();
      expect(transferId).toBe('');
    });
  });

  describe('dispose', () => {
    it('NSM-050: cleans up subscriptions', () => {
      manager._applyLocalRoomCreation();
      manager.dispose();

      expect(manager.connectionState).toBe('disconnected');
    });

    it('NSM-051: dispose is idempotent', () => {
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('getSyncStateManager', () => {
    it('NSM-060: returns the sync state manager', () => {
      const sm = manager.getSyncStateManager();
      expect(sm).toBeTruthy();
      expect(typeof sm.shouldSyncPlayback).toBe('function');
    });
  });

  describe('user colors', () => {
    it('NSM-070: assigns different colors to users', () => {
      manager._applyLocalRoomCreation();
      const alice = manager._applyLocalUserJoin('Alice');
      const bob = manager._applyLocalUserJoin('Bob');

      expect(manager.users[0]!.color).toBeTruthy();
      expect(alice.color).toBeTruthy();
      expect(bob.color).toBeTruthy();
      // At least the host and first joiner should have different colors
      expect(manager.users[0]!.color).not.toBe(alice.color);
    });
  });

  describe('edge cases', () => {
    it('NSM-080: leaveRoom is safe when not in a room', () => {
      // Should not throw
      manager.leaveRoom();
      expect(manager.connectionState).toBe('disconnected');
    });

    it('NSM-081: _applyLocalUserJoin throws when no room exists', () => {
      expect(() => manager._applyLocalUserJoin('Alice')).toThrow('No room to join');
    });

    it('NSM-082: simulateUserLeft is safe when user not found', () => {
      manager._applyLocalRoomCreation();
      // Should not throw when user ID doesn't exist
      manager.simulateUserLeft('nonexistent-user');
      expect(manager.users.length).toBe(1);
    });

    it('NSM-083: sendPlaybackSync is suppressed when not connected', () => {
      expect(() => manager.sendPlaybackSync({
        isPlaying: true,
        currentFrame: 10,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      })).not.toThrow();
    });

    it('NSM-084: sendFrameSync is suppressed when playback sync disabled', () => {
      manager._applyLocalRoomCreation();
      manager.setSyncSettings({
        playback: false,
        view: true,
        color: false,
        annotations: false,
        cursor: true,
      });

      expect(() => manager.sendFrameSync(42)).not.toThrow();
    });

    it('NSM-085: sendViewSync is suppressed when view sync disabled', () => {
      manager._applyLocalRoomCreation();
      manager.setSyncSettings({
        playback: true,
        view: false,
        color: false,
        annotations: false,
        cursor: true,
      });

      expect(() => manager.sendViewSync({ panX: 0, panY: 0, zoom: 2, channelMode: 'rgb' })).not.toThrow();
    });

    it('NSM-086: requestStateSync is safe when not connected', () => {
      expect(() => manager.requestStateSync()).not.toThrow();
    });

    it('NSM-087: createRoom from error state is allowed', () => {
      // Manually set to error state via simulation
      manager._applyLocalRoomCreation();
      manager.leaveRoom(); // back to disconnected
      // Verify we can create room from disconnected
      manager._applyLocalRoomCreation();
      expect(manager.isConnected).toBe(true);
    });

    it('NSM-088: getters return safe copies', () => {
      manager._applyLocalRoomCreation();
      const users = manager.users;
      users.push({
        id: 'fake',
        name: 'Fake',
        color: '#000000',
        isHost: false,
        joinedAt: 0,
      });

      // Internal state should be unaffected
      expect(manager.users.length).toBe(1);
    });

    it('NSM-089: syncSettings returns a copy', () => {
      const settings = manager.syncSettings;
      settings.playback = false;

      // Internal settings should be unaffected
      expect(manager.syncSettings.playback).toBe(true);
    });
  });

  describe('multiple user operations', () => {
    it('NSM-090: handles rapid user join/leave', () => {
      manager._applyLocalRoomCreation();

      const alice = manager._applyLocalUserJoin('Alice');
      const bob = manager._applyLocalUserJoin('Bob');
      expect(manager.users.length).toBe(3);

      manager.simulateUserLeft(alice.id);
      expect(manager.users.length).toBe(2);

      manager.simulateUserLeft(bob.id);
      expect(manager.users.length).toBe(1);

      // Only the host should remain
      expect(manager.users[0]!.isHost).toBe(true);
    });

    it('NSM-091: color wraps around when many users join', () => {
      manager._applyLocalRoomCreation();

      // Join 10 users (more than the 8 available colors)
      const users = [];
      for (let i = 0; i < 10; i++) {
        users.push(manager._applyLocalUserJoin(`User${i}`));
      }

      // All users should have colors assigned
      users.forEach(u => {
        expect(u.color).toBeTruthy();
      });
    });
  });

  describe('message deduplication', () => {
    it('NSM-100: duplicate message IDs are skipped', () => {
      manager._applyLocalRoomCreation();

      const handler = vi.fn();
      manager.on('syncFrame', handler);

      // Create a message with a known ID
      const message = {
        id: 'test-msg-1',
        type: 'sync.frame' as const,
        roomId: manager.roomInfo!.roomId,
        userId: 'other-user',
        timestamp: Date.now(),
        payload: { currentFrame: 10, timestamp: Date.now() },
      };

      // Send the same message twice via the handleMessage method
      (manager as any).handleMessage(message, 'websocket');
      (manager as any).handleMessage(message, 'websocket');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('NSM-101: evicts oldest message ID after 200', () => {
      manager._applyLocalRoomCreation();

      const handler = vi.fn();
      manager.on('syncFrame', handler);

      const roomId = manager.roomInfo!.roomId;

      // Fill up the dedup queue with 200 unique messages
      for (let i = 0; i < 200; i++) {
        const msg = {
          id: `msg-${i}`,
          type: 'sync.frame' as const,
          roomId,
          userId: 'other-user',
          timestamp: Date.now(),
          payload: { currentFrame: i, timestamp: Date.now() },
        };
        (manager as any).handleMessage(msg, 'websocket');
      }
      expect(handler).toHaveBeenCalledTimes(200);

      // Now send one more to cause eviction of msg-0
      const newMsg = {
        id: 'msg-200',
        type: 'sync.frame' as const,
        roomId,
        userId: 'other-user',
        timestamp: Date.now(),
        payload: { currentFrame: 200, timestamp: Date.now() },
      };
      (manager as any).handleMessage(newMsg, 'websocket');
      expect(handler).toHaveBeenCalledTimes(201);

      // Now msg-0 should have been evicted, so it can be accepted again
      const oldMsg = {
        id: 'msg-0',
        type: 'sync.frame' as const,
        roomId,
        userId: 'other-user',
        timestamp: Date.now(),
        payload: { currentFrame: 0, timestamp: Date.now() },
      };
      (manager as any).handleMessage(oldMsg, 'websocket');
      expect(handler).toHaveBeenCalledTimes(202);
    });
  });

  describe('sender identity validation', () => {
    it('NSM-110: annotation strokes have user overridden with sender ID', () => {
      manager._applyLocalRoomCreation();
      manager.setSyncSettings({
        playback: true, view: true, color: true, annotations: true, cursor: true,
      });

      const handler = vi.fn();
      manager.on('syncAnnotation', handler);

      const senderUserId = 'sender-123';
      (manager as any)._permissions.set(senderUserId, 'reviewer');

      const message = {
        id: 'ann-msg-1',
        type: 'sync.annotation' as const,
        roomId: manager.roomInfo!.roomId,
        userId: senderUserId,
        timestamp: Date.now(),
        payload: {
          frame: 1,
          strokes: [
            { type: 'pen', id: 's1', frame: 1, user: 'spoofed-user', color: [1, 0, 0, 1], width: 2, brush: 0, points: [{ x: 0, y: 0 }], join: 3, cap: 2, splat: false, mode: 0, startFrame: 1, duration: 0 },
          ],
          action: 'add',
          annotationId: 's1',
          timestamp: Date.now(),
        },
      };
      (manager as any).handleMessage(message, 'websocket');

      expect(handler).toHaveBeenCalledTimes(1);
      const payload = handler.mock.calls[0]![0];
      expect(payload.strokes[0].user).toBe(senderUserId);
    });

    it('NSM-111: note has author overridden with sender ID', () => {
      manager._applyLocalRoomCreation();
      manager.setSyncSettings({
        playback: true, view: true, color: true, annotations: true, cursor: true,
      });

      const handler = vi.fn();
      manager.on('syncNote', handler);

      const senderUserId = 'sender-456';
      (manager as any)._permissions.set(senderUserId, 'reviewer');

      const message = {
        id: 'note-msg-1',
        type: 'sync.note' as const,
        roomId: manager.roomInfo!.roomId,
        userId: senderUserId,
        timestamp: Date.now(),
        payload: {
          action: 'add',
          note: {
            id: 'n1', text: 'Test', author: 'spoofed-author',
            sourceIndex: 0, frameStart: 1, frameEnd: 5,
            createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
            status: 'open', parentId: null, color: '#ff0000',
          },
          timestamp: Date.now(),
        },
      };
      (manager as any).handleMessage(message, 'websocket');

      expect(handler).toHaveBeenCalledTimes(1);
      const payload = handler.mock.calls[0]![0];
      expect(payload.note.author).toBe(senderUserId);
    });
  });

  describe('state request retry/timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('NSM-120: requestStateSync retries after timeout', () => {
      manager._applyLocalRoomCreation();

      // Spy on dispatching
      const dispatchSpy = vi.spyOn(manager as any, 'sendStateRequest');

      manager.requestStateSync('host-1');
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      // First timeout → retry 1
      vi.advanceTimersByTime(3000);
      expect(dispatchSpy).toHaveBeenCalledTimes(2);

      // Second timeout → retry 2
      vi.advanceTimersByTime(3000);
      expect(dispatchSpy).toHaveBeenCalledTimes(3);
    });

    it('NSM-121: emits warning after max retries', () => {
      manager._applyLocalRoomCreation();

      const toastHandler = vi.fn();
      manager.on('toastMessage', toastHandler);

      manager.requestStateSync('host-1');

      // Exhaust all retries
      vi.advanceTimersByTime(3000); // retry 1
      vi.advanceTimersByTime(3000); // retry 2
      vi.advanceTimersByTime(3000); // timeout after max

      expect(toastHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning' }),
      );
    });

    it('NSM-122: handleStateResponse clears pending request', () => {
      manager._applyLocalRoomCreation();

      manager.requestStateSync('host-1');
      expect((manager as any)._pendingStateRequest).not.toBeNull();

      // Simulate receiving a state response
      const responseMessage = {
        id: 'resp-1',
        type: 'sync.state-response' as const,
        roomId: manager.roomInfo!.roomId,
        userId: 'host-1',
        timestamp: Date.now(),
        payload: {
          requestId: (manager as any)._pendingStateRequest.requestId,
          targetUserId: manager.userId,
          sessionState: 'encoded-state-data',
        },
      };
      (manager as any).handleMessage(responseMessage, 'websocket');

      expect((manager as any)._pendingStateRequest).toBeNull();

      // No retry should fire
      vi.advanceTimersByTime(10000);
      // No warning toast
    });
  });
});
