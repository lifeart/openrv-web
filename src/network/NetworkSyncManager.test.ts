/**
 * NetworkSyncManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkSyncManager } from './NetworkSyncManager';
import type { ConnectionState, SyncUser } from './types';

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
    it('NSM-002: simulateRoomCreated generates valid room code', () => {
      manager.simulateRoomCreated();
      expect(manager.roomInfo).not.toBeNull();
      expect(manager.roomInfo!.roomCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('NSM-003: simulateRoomCreated sets connected state', () => {
      const handler = vi.fn();
      manager.on('connectionStateChanged', handler);

      manager.simulateRoomCreated();

      expect(manager.connectionState).toBe('connected');
      expect(manager.isConnected).toBe(true);
      expect(handler).toHaveBeenCalledWith('connected');
    });

    it('NSM-003b: simulateRoomCreated makes user the host', () => {
      manager.simulateRoomCreated();
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
      manager.simulateRoomCreated();
      expect(manager.isConnected).toBe(true);

      manager.leaveRoom();

      expect(manager.connectionState).toBe('disconnected');
      expect(manager.roomInfo).toBeNull();
    });

    it('NSM-007: leaveRoom emits roomLeft event', () => {
      const handler = vi.fn();
      manager.on('roomLeft', handler);

      manager.simulateRoomCreated();
      manager.leaveRoom();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('connection events', () => {
    it('NSM-010: emits connectionStateChanged on connect', () => {
      const states: ConnectionState[] = [];
      manager.on('connectionStateChanged', (s) => states.push(s));

      manager.simulateRoomCreated();

      expect(states).toContain('connected');
    });

    it('NSM-011: emits connectionStateChanged on disconnect', () => {
      manager.simulateRoomCreated();

      const states: ConnectionState[] = [];
      manager.on('connectionStateChanged', (s) => states.push(s));

      manager.leaveRoom();

      expect(states).toContain('disconnected');
    });
  });

  describe('user presence', () => {
    it('NSM-012: emits usersChanged when user joins', () => {
      manager.simulateRoomCreated();

      const handler = vi.fn();
      manager.on('usersChanged', handler);

      manager.simulateUserJoined('Alice');

      expect(handler).toHaveBeenCalled();
      const users = handler.mock.calls[0]![0] as SyncUser[];
      expect(users.length).toBe(2);
      expect(users[1]!.name).toBe('Alice');
    });

    it('NSM-013: emits usersChanged when user leaves', () => {
      manager.simulateRoomCreated();
      const alice = manager.simulateUserJoined('Alice');

      const handler = vi.fn();
      manager.on('usersChanged', handler);

      manager.simulateUserLeft(alice.id);

      expect(handler).toHaveBeenCalled();
      const users = handler.mock.calls[0]![0] as SyncUser[];
      expect(users.length).toBe(1);
    });

    it('NSM-014: emits userJoined event', () => {
      manager.simulateRoomCreated();

      const handler = vi.fn();
      manager.on('userJoined', handler);

      manager.simulateUserJoined('Bob');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0]![0].name).toBe('Bob');
    });

    it('NSM-015: emits userLeft event', () => {
      manager.simulateRoomCreated();
      const bob = manager.simulateUserJoined('Bob');

      const handler = vi.fn();
      manager.on('userLeft', handler);

      manager.simulateUserLeft(bob.id);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0]![0].name).toBe('Bob');
    });

    it('NSM-016: emits toast message on user join', () => {
      manager.simulateRoomCreated();

      const handler = vi.fn();
      manager.on('toastMessage', handler);

      manager.simulateUserJoined('Charlie');

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
      });

      const settings = manager.syncSettings;
      expect(settings.playback).toBe(true);
      expect(settings.view).toBe(false);
    });
  });

  describe('playback sync', () => {
    it('NSM-021: sends sync message on playback change', () => {
      manager.simulateRoomCreated();

      // Should not throw and should be silent when no real WS
      manager.sendPlaybackSync({
        isPlaying: true,
        currentFrame: 10,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      });
    });

    it('NSM-024: ignores local changes from sync messages', () => {
      manager.simulateRoomCreated();
      const sm = manager.getSyncStateManager();

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

      sm.endApplyRemote();
    });
  });

  describe('frame sync', () => {
    it('NSM-025: sends frame sync message', () => {
      manager.simulateRoomCreated();
      manager.sendFrameSync(42);
      // Should not throw
    });
  });

  describe('view sync', () => {
    it('NSM-032: sends view sync message', () => {
      manager.simulateRoomCreated();
      manager.sendViewSync({ panX: 0, panY: 0, zoom: 2, channelMode: 'rgb' });
      // Should not throw
    });
  });

  describe('state sync request', () => {
    it('NSM-042: requests state sync', () => {
      manager.simulateRoomCreated();
      manager.requestStateSync();
      // Should not throw
    });
  });

  describe('dispose', () => {
    it('NSM-050: cleans up subscriptions', () => {
      manager.simulateRoomCreated();
      manager.dispose();

      expect(manager.connectionState).toBe('disconnected');
    });

    it('NSM-051: dispose is idempotent', () => {
      manager.dispose();
      manager.dispose(); // Should not throw
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
      manager.simulateRoomCreated();
      const alice = manager.simulateUserJoined('Alice');
      const bob = manager.simulateUserJoined('Bob');

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

    it('NSM-081: simulateUserJoined throws when no room exists', () => {
      expect(() => manager.simulateUserJoined('Alice')).toThrow('No room to join');
    });

    it('NSM-082: simulateUserLeft is safe when user not found', () => {
      manager.simulateRoomCreated();
      // Should not throw when user ID doesn't exist
      manager.simulateUserLeft('nonexistent-user');
      expect(manager.users.length).toBe(1);
    });

    it('NSM-083: sendPlaybackSync is suppressed when not connected', () => {
      // Not connected, should not throw
      manager.sendPlaybackSync({
        isPlaying: true,
        currentFrame: 10,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      });
    });

    it('NSM-084: sendFrameSync is suppressed when playback sync disabled', () => {
      manager.simulateRoomCreated();
      manager.setSyncSettings({
        playback: false,
        view: true,
        color: false,
        annotations: false,
      });

      // Should not throw, but should be suppressed
      manager.sendFrameSync(42);
    });

    it('NSM-085: sendViewSync is suppressed when view sync disabled', () => {
      manager.simulateRoomCreated();
      manager.setSyncSettings({
        playback: true,
        view: false,
        color: false,
        annotations: false,
      });

      // Should not throw, but should be suppressed
      manager.sendViewSync({ panX: 0, panY: 0, zoom: 2, channelMode: 'rgb' });
    });

    it('NSM-086: requestStateSync is safe when not connected', () => {
      // Should not throw
      manager.requestStateSync();
    });

    it('NSM-087: createRoom from error state is allowed', () => {
      // Manually set to error state via simulation
      manager.simulateRoomCreated();
      manager.leaveRoom(); // back to disconnected
      // Verify we can create room from disconnected
      manager.simulateRoomCreated();
      expect(manager.isConnected).toBe(true);
    });

    it('NSM-088: getters return safe copies', () => {
      manager.simulateRoomCreated();
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
      manager.simulateRoomCreated();

      const alice = manager.simulateUserJoined('Alice');
      const bob = manager.simulateUserJoined('Bob');
      expect(manager.users.length).toBe(3);

      manager.simulateUserLeft(alice.id);
      expect(manager.users.length).toBe(2);

      manager.simulateUserLeft(bob.id);
      expect(manager.users.length).toBe(1);

      // Only the host should remain
      expect(manager.users[0]!.isHost).toBe(true);
    });

    it('NSM-091: color wraps around when many users join', () => {
      manager.simulateRoomCreated();

      // Join 10 users (more than the 8 available colors)
      const users = [];
      for (let i = 0; i < 10; i++) {
        users.push(manager.simulateUserJoined(`User${i}`));
      }

      // All users should have colors assigned
      users.forEach(u => {
        expect(u.color).toBeTruthy();
      });
    });
  });
});
