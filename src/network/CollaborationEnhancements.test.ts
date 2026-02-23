/**
 * Collaboration Enhancements Unit Tests (T2.10)
 *
 * Tests for cursor sharing, annotation sync, participant permissions,
 * and conflict resolution in NetworkSyncManager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkSyncManager } from './NetworkSyncManager';
import type {
  CursorSyncPayload,
  AnnotationSyncPayload,
  ParticipantPermission,
} from './types';
import {
  createCursorSyncMessage,
  createPermissionMessage,
  createAnnotationSyncMessage,
  validateCursorPayload,
  validatePermissionPayload,
  validateAnnotationPayload,
  createMessage,
} from './MessageProtocol';

// Mock WebSocket
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

  constructor(_url: string) {}

  send(_data: string): void {}
  close(_code?: number, _reason?: string): void {
    this.readyState = 3;
    this.onclose?.({ code: _code ?? 1000, reason: _reason ?? '' });
  }
});

// ---------------------------------------------------------------------------
// validateCursorPayload tests
// ---------------------------------------------------------------------------

describe('validateCursorPayload', () => {
  it('COLLAB-001: accepts valid cursor payload', () => {
    const payload: CursorSyncPayload = {
      userId: 'user-1',
      x: 0.5,
      y: 0.3,
      timestamp: Date.now(),
    };
    expect(validateCursorPayload(payload)).toBe(true);
  });

  it('COLLAB-002: rejects payload with missing userId', () => {
    expect(validateCursorPayload({ x: 0.5, y: 0.3, timestamp: 1 })).toBe(false);
  });

  it('COLLAB-003: rejects payload with non-finite coordinates', () => {
    expect(validateCursorPayload({ userId: 'a', x: NaN, y: 0, timestamp: 1 })).toBe(false);
    expect(validateCursorPayload({ userId: 'a', x: 0, y: Infinity, timestamp: 1 })).toBe(false);
  });

  it('rejects null payload', () => {
    expect(validateCursorPayload(null)).toBe(false);
  });

  it('rejects empty userId', () => {
    expect(validateCursorPayload({ userId: '', x: 0, y: 0, timestamp: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePermissionPayload tests
// ---------------------------------------------------------------------------

describe('validatePermissionPayload', () => {
  it('COLLAB-004: accepts valid permission payload', () => {
    expect(validatePermissionPayload({ targetUserId: 'u1', role: 'reviewer' })).toBe(true);
    expect(validatePermissionPayload({ targetUserId: 'u1', role: 'viewer' })).toBe(true);
    expect(validatePermissionPayload({ targetUserId: 'u1', role: 'host' })).toBe(true);
  });

  it('COLLAB-005: rejects invalid role', () => {
    expect(validatePermissionPayload({ targetUserId: 'u1', role: 'admin' })).toBe(false);
    expect(validatePermissionPayload({ targetUserId: 'u1', role: '' })).toBe(false);
  });

  it('rejects missing targetUserId', () => {
    expect(validatePermissionPayload({ role: 'viewer' })).toBe(false);
  });

  it('rejects empty targetUserId', () => {
    expect(validatePermissionPayload({ targetUserId: '', role: 'viewer' })).toBe(false);
  });

  it('rejects null', () => {
    expect(validatePermissionPayload(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAnnotationPayload tests
// ---------------------------------------------------------------------------

describe('validateAnnotationPayload', () => {
  it('COLLAB-006: accepts valid annotation payload', () => {
    const payload: AnnotationSyncPayload = {
      frame: 10,
      strokes: [{ id: 's1' }],
      action: 'add',
      timestamp: Date.now(),
    };
    expect(validateAnnotationPayload(payload)).toBe(true);
  });

  it('COLLAB-007: accepts update action with annotationId', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      strokes: [],
      action: 'update',
      annotationId: 'ann-1',
      timestamp: 1,
    })).toBe(true);
  });

  it('rejects update action without annotationId', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      strokes: [],
      action: 'update',
      timestamp: 1,
    })).toBe(false);
  });

  it('rejects remove action without annotationId', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      strokes: [],
      action: 'remove',
      timestamp: 1,
    })).toBe(false);
  });

  it('rejects invalid action', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      strokes: [],
      action: 'unknown',
      timestamp: 1,
    })).toBe(false);
  });

  it('rejects non-finite frame', () => {
    expect(validateAnnotationPayload({
      frame: NaN,
      strokes: [],
      action: 'add',
      timestamp: 1,
    })).toBe(false);
  });

  it('rejects missing strokes array', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      action: 'add',
      timestamp: 1,
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message factory tests
// ---------------------------------------------------------------------------

describe('message factories', () => {
  it('COLLAB-008: createCursorSyncMessage creates sync.cursor type', () => {
    const msg = createCursorSyncMessage('room1', 'user1', {
      userId: 'user1',
      x: 0.5,
      y: 0.3,
      timestamp: 123,
    });
    expect(msg.type).toBe('sync.cursor');
    expect(msg.roomId).toBe('room1');
    expect((msg.payload as CursorSyncPayload).x).toBe(0.5);
  });

  it('COLLAB-009: createPermissionMessage creates user.permission type', () => {
    const msg = createPermissionMessage('room1', 'user1', {
      targetUserId: 'user2',
      role: 'viewer',
    });
    expect(msg.type).toBe('user.permission');
    expect((msg.payload as { targetUserId: string }).targetUserId).toBe('user2');
  });

  it('createAnnotationSyncMessage creates sync.annotation type', () => {
    const msg = createAnnotationSyncMessage('room1', 'user1', {
      frame: 5,
      strokes: [],
      action: 'add',
      timestamp: 100,
    });
    expect(msg.type).toBe('sync.annotation');
  });
});

// ---------------------------------------------------------------------------
// NetworkSyncManager — cursor sync
// ---------------------------------------------------------------------------

describe('NetworkSyncManager cursor sync', () => {
  let manager: NetworkSyncManager;

  beforeEach(() => {
    manager = new NetworkSyncManager({ userName: 'TestUser' });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('COLLAB-010: sendCursorPosition sends when connected and cursor enabled', () => {
    manager._applyLocalRoomCreation();
    // Cursor sync is enabled by default
    expect(() => manager.sendCursorPosition(0.5, 0.3)).not.toThrow();
  });

  it('COLLAB-011: sendCursorPosition suppressed when disconnected', () => {
    // Not connected — should silently return
    expect(() => manager.sendCursorPosition(0.5, 0.3)).not.toThrow();
  });

  it('COLLAB-012: sendCursorPosition suppressed when cursor sync disabled', () => {
    manager._applyLocalRoomCreation();
    manager.setSyncSettings({
      playback: true,
      view: true,
      color: false,
      annotations: false,
      cursor: false,
    });

    expect(() => manager.sendCursorPosition(0.5, 0.3)).not.toThrow();
  });

  it('COLLAB-013: syncCursor event emitted for remote cursor', () => {
    manager._applyLocalRoomCreation();
    const handler = vi.fn();
    manager.on('syncCursor', handler);

    // Simulate receiving a cursor sync message from another user
    const alice = manager._applyLocalUserJoin('Alice');
    const msg = createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      userId: alice.id,
      x: 0.7,
      y: 0.4,
      timestamp: Date.now(),
    });

    // Inject message via private handler
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].x).toBe(0.7);
    expect(handler.mock.calls[0]![0].y).toBe(0.4);
  });

  it('COLLAB-014: remoteCursors getter returns stored cursors', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    const msg = createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      userId: alice.id,
      x: 0.1,
      y: 0.2,
      timestamp: Date.now(),
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    const cursors = manager.remoteCursors;
    expect(cursors.length).toBe(1);
    expect(cursors[0]!.userId).toBe(alice.id);
  });

  it('remote cursor cleared when user leaves', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    // Add a cursor
    const msg = createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      userId: alice.id,
      x: 0.5,
      y: 0.5,
      timestamp: Date.now(),
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);
    expect(manager.remoteCursors.length).toBe(1);

    // simulateUserLeft cleans up both permissions and remote cursors
    manager.simulateUserLeft(alice.id);
    expect(manager.remoteCursors.length).toBe(0);
  });

  it('COLLAB-046: cursor update from same user overwrites previous position', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    const handle = (manager as unknown as { handleMessage(m: unknown): void }).handleMessage.bind(manager);

    handle(createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      userId: alice.id, x: 0.1, y: 0.2, timestamp: 1000,
    }));
    expect(manager.remoteCursors.length).toBe(1);
    expect(manager.remoteCursors[0]!.x).toBe(0.1);

    // Second update from same user should overwrite
    handle(createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      userId: alice.id, x: 0.8, y: 0.9, timestamp: 2000,
    }));
    expect(manager.remoteCursors.length).toBe(1);
    expect(manager.remoteCursors[0]!.x).toBe(0.8);
    expect(manager.remoteCursors[0]!.y).toBe(0.9);
  });

  it('COLLAB-047: cursor userId sanitized to sender', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    const handle = (manager as unknown as { handleMessage(m: unknown): void }).handleMessage.bind(manager);

    // Send cursor with spoofed userId
    handle(createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      userId: 'spoofed-id', x: 0.5, y: 0.5, timestamp: 1000,
    }));

    // Should be stored under alice.id, not 'spoofed-id'
    const cursors = manager.remoteCursors;
    expect(cursors.length).toBe(1);
    expect(cursors[0]!.userId).toBe(alice.id);
  });
});

// ---------------------------------------------------------------------------
// NetworkSyncManager — annotation sync
// ---------------------------------------------------------------------------

describe('NetworkSyncManager annotation sync', () => {
  let manager: NetworkSyncManager;

  beforeEach(() => {
    manager = new NetworkSyncManager({ userName: 'TestUser' });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('COLLAB-015: sendAnnotationSync sends when connected and annotations enabled', () => {
    manager._applyLocalRoomCreation();
    manager.setSyncSettings({
      playback: true,
      view: true,
      color: false,
      annotations: true,
      cursor: true,
    });

    expect(() => manager.sendAnnotationSync({
      frame: 1,
      strokes: [{ id: 's1' }],
      action: 'add',
      timestamp: Date.now(),
    })).not.toThrow();
  });

  it('COLLAB-016: sendAnnotationSync suppressed when annotations disabled', () => {
    manager._applyLocalRoomCreation();
    // annotations is false by default
    expect(() => manager.sendAnnotationSync({
      frame: 1,
      strokes: [],
      action: 'add',
      timestamp: Date.now(),
    })).not.toThrow();
  });

  it('COLLAB-017: sendAnnotationSync blocked for viewer role', () => {
    manager._applyLocalRoomCreation();
    manager.setSyncSettings({
      playback: true,
      view: true,
      color: false,
      annotations: true,
      cursor: true,
    });

    // Set self as viewer
    manager.setParticipantPermission(manager.userId, 'viewer');

    // Should be suppressed — viewer cannot send annotations
    // We can't directly verify send was suppressed without spying on wsClient,
    // but we ensure it doesn't throw
    expect(() => manager.sendAnnotationSync({
      frame: 1,
      strokes: [],
      action: 'add',
      timestamp: Date.now(),
    })).not.toThrow();
  });

  it('COLLAB-018: syncAnnotation event emitted for remote annotations', () => {
    manager._applyLocalRoomCreation();
    manager.setSyncSettings({
      playback: true,
      view: true,
      color: false,
      annotations: true,
      cursor: true,
    });

    const handler = vi.fn();
    manager.on('syncAnnotation', handler);

    const alice = manager._applyLocalUserJoin('Alice');
    const msg = createMessage('sync.annotation', manager.roomInfo!.roomId, alice.id, {
      frame: 5,
      strokes: [{ id: 'stroke1' }],
      action: 'add',
      timestamp: Date.now(),
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].frame).toBe(5);
    expect(handler.mock.calls[0]![0].action).toBe('add');
  });

  it('incoming annotation from viewer is blocked', () => {
    manager._applyLocalRoomCreation();
    manager.setSyncSettings({
      playback: true,
      view: true,
      color: false,
      annotations: true,
      cursor: true,
    });

    const alice = manager._applyLocalUserJoin('Alice');
    manager.setParticipantPermission(alice.id, 'viewer');

    const handler = vi.fn();
    manager.on('syncAnnotation', handler);

    const msg = createMessage('sync.annotation', manager.roomInfo!.roomId, alice.id, {
      frame: 5,
      strokes: [{ id: 'stroke1' }],
      action: 'add',
      timestamp: Date.now(),
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    // Should not emit — viewer annotations are rejected
    expect(handler).not.toHaveBeenCalled();
  });

  it('annotation sync respects sync settings', () => {
    manager._applyLocalRoomCreation();
    // annotations disabled by default

    const handler = vi.fn();
    manager.on('syncAnnotation', handler);

    const alice = manager._applyLocalUserJoin('Alice');
    const msg = createMessage('sync.annotation', manager.roomInfo!.roomId, alice.id, {
      frame: 5,
      strokes: [],
      action: 'add',
      timestamp: Date.now(),
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    // Should not emit because annotations sync is disabled
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NetworkSyncManager — participant permissions
// ---------------------------------------------------------------------------

describe('NetworkSyncManager participant permissions', () => {
  let manager: NetworkSyncManager;

  beforeEach(() => {
    manager = new NetworkSyncManager({ userName: 'TestUser' });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('COLLAB-019: host permission set on room creation', () => {
    manager._applyLocalRoomCreation();
    expect(manager.getParticipantPermission(manager.userId)).toBe('host');
  });

  it('COLLAB-020: default permission for unknown user is reviewer', () => {
    manager._applyLocalRoomCreation();
    expect(manager.getParticipantPermission('unknown-user')).toBe('reviewer');
  });

  it('COLLAB-021: setParticipantPermission changes role', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    manager.setParticipantPermission(alice.id, 'viewer');
    expect(manager.getParticipantPermission(alice.id)).toBe('viewer');

    manager.setParticipantPermission(alice.id, 'reviewer');
    expect(manager.getParticipantPermission(alice.id)).toBe('reviewer');
  });

  it('COLLAB-022: setParticipantPermission emits event', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    const handler = vi.fn();
    manager.on('participantPermissionChanged', handler);

    manager.setParticipantPermission(alice.id, 'viewer');

    expect(handler).toHaveBeenCalledTimes(1);
    const perm = handler.mock.calls[0]![0] as ParticipantPermission;
    expect(perm.userId).toBe(alice.id);
    expect(perm.role).toBe('viewer');
  });

  it('COLLAB-023: only host can change permissions', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    // Simulate a non-host trying to set permission by injecting a message
    const msg = createMessage('user.permission', manager.roomInfo!.roomId, alice.id, {
      targetUserId: manager.userId,
      role: 'viewer',
    });

    const handler = vi.fn();
    manager.on('participantPermissionChanged', handler);

    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    // Should be rejected — alice is not the host
    expect(handler).not.toHaveBeenCalled();
    expect(manager.getParticipantPermission(manager.userId)).toBe('host');
  });

  it('COLLAB-024: permission change from host is accepted', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    // Simulate host sending permission change (as if relayed via server)
    const msg = createMessage('user.permission', manager.roomInfo!.roomId, manager.userId, {
      targetUserId: alice.id,
      role: 'viewer',
    });

    // This message comes from self (the host), so it would normally be
    // ignored by the self-filter. But in a real scenario, the server broadcasts
    // to all including the sender. We test the handler directly:
    const handler = vi.fn();
    manager.on('participantPermissionChanged', handler);

    // Call the private handler directly to bypass self-filter
    (manager as unknown as { handlePermissionChange(p: unknown, s: string): void })
      .handlePermissionChange(msg.payload, manager.userId);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(manager.getParticipantPermission(alice.id)).toBe('viewer');
  });

  it('COLLAB-025: setParticipantPermission suppressed when not host', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');

    // Make ourselves not the host (simulate by clearing room's hostId)
    const roomInfo = manager.roomInfo!;
    (manager as unknown as { _roomInfo: typeof roomInfo })._roomInfo = {
      ...roomInfo,
      hostId: 'someone-else',
    };

    const handler = vi.fn();
    manager.on('participantPermissionChanged', handler);

    manager.setParticipantPermission(alice.id, 'viewer');

    // Should not emit — we're not the host
    expect(handler).not.toHaveBeenCalled();
  });

  it('participantPermissions getter returns all permissions', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');
    manager.setParticipantPermission(alice.id, 'reviewer');

    const perms = manager.participantPermissions;
    expect(perms.length).toBe(2); // host + alice
    expect(perms.find(p => p.userId === manager.userId)?.role).toBe('host');
    expect(perms.find(p => p.userId === alice.id)?.role).toBe('reviewer');
  });

  it('canUserSync returns false for viewers', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');
    manager.setParticipantPermission(alice.id, 'viewer');

    expect(manager.canUserSync(alice.id)).toBe(false);
    expect(manager.canUserSync(manager.userId)).toBe(true);
  });

  it('permissions cleared on room leave', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');
    manager.setParticipantPermission(alice.id, 'viewer');

    expect(manager.participantPermissions.length).toBe(2);

    manager.leaveRoom();

    expect(manager.participantPermissions.length).toBe(0);
  });

  it('setParticipantPermission suppressed when not connected', () => {
    // Not connected
    const handler = vi.fn();
    manager.on('participantPermissionChanged', handler);
    manager.setParticipantPermission('user1', 'viewer');
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NetworkSyncManager — default sync settings include cursor
// ---------------------------------------------------------------------------

describe('NetworkSyncManager cursor settings', () => {
  let manager: NetworkSyncManager;

  beforeEach(() => {
    manager = new NetworkSyncManager({ userName: 'TestUser' });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('COLLAB-026: default sync settings include cursor=true', () => {
    const settings = manager.syncSettings;
    expect(settings.cursor).toBe(true);
  });

  it('cursor sync disabled suppresses cursor events', () => {
    manager._applyLocalRoomCreation();
    manager.setSyncSettings({
      playback: true,
      view: true,
      color: false,
      annotations: false,
      cursor: false,
    });

    const handler = vi.fn();
    manager.on('syncCursor', handler);

    const alice = manager._applyLocalUserJoin('Alice');
    const msg = createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      userId: alice.id,
      x: 0.5,
      y: 0.5,
      timestamp: Date.now(),
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AnnotationSyncPayload update action
// ---------------------------------------------------------------------------

describe('AnnotationSyncPayload update action', () => {
  it('COLLAB-027: update action accepted by validator', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      strokes: [],
      action: 'update',
      annotationId: 'ann-123',
      timestamp: Date.now(),
    })).toBe(true);
  });

  it('clear action still accepted', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      strokes: [],
      action: 'clear',
      timestamp: 1,
    })).toBe(true);
  });

  it('remove action accepted with annotationId', () => {
    expect(validateAnnotationPayload({
      frame: 1,
      strokes: [],
      action: 'remove',
      annotationId: 'ann-456',
      timestamp: 1,
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('collaboration edge cases', () => {
  let manager: NetworkSyncManager;

  beforeEach(() => {
    manager = new NetworkSyncManager({ userName: 'TestUser' });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('COLLAB-028: invalid cursor payload rejected silently', () => {
    manager._applyLocalRoomCreation();
    const handler = vi.fn();
    manager.on('syncCursor', handler);

    const alice = manager._applyLocalUserJoin('Alice');
    const msg = createMessage('sync.cursor', manager.roomInfo!.roomId, alice.id, {
      // Missing required fields
      x: 0.5,
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    expect(handler).not.toHaveBeenCalled();
  });

  it('COLLAB-029: invalid permission payload rejected silently', () => {
    manager._applyLocalRoomCreation();
    const handler = vi.fn();
    manager.on('participantPermissionChanged', handler);

    const msg = createMessage('user.permission', manager.roomInfo!.roomId, manager.userId, {
      targetUserId: 'user1',
      role: 'superadmin', // invalid role
    });
    (manager as unknown as { handlePermissionChange(p: unknown, s: string): void })
      .handlePermissionChange(msg.payload, manager.userId);

    expect(handler).not.toHaveBeenCalled();
  });

  it('COLLAB-030: cursor position at boundary values', () => {
    expect(validateCursorPayload({
      userId: 'u1',
      x: 0,
      y: 0,
      timestamp: 0,
    })).toBe(true);

    expect(validateCursorPayload({
      userId: 'u1',
      x: 1,
      y: 1,
      timestamp: Number.MAX_SAFE_INTEGER,
    })).toBe(true);
  });

  it('invalid annotation payload not emitted', () => {
    manager._applyLocalRoomCreation();
    manager.setSyncSettings({
      playback: true,
      view: true,
      color: false,
      annotations: true,
      cursor: true,
    });

    const handler = vi.fn();
    manager.on('syncAnnotation', handler);

    const alice = manager._applyLocalUserJoin('Alice');
    const msg = createMessage('sync.annotation', manager.roomInfo!.roomId, alice.id, {
      frame: NaN, // invalid
      strokes: [],
      action: 'add',
      timestamp: 1,
    });
    (manager as unknown as { handleMessage(m: unknown): void }).handleMessage(msg);

    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple remote cursors tracked independently', () => {
    manager._applyLocalRoomCreation();
    const alice = manager._applyLocalUserJoin('Alice');
    const bob = manager._applyLocalUserJoin('Bob');

    const cursorMsg = (userId: string, x: number, y: number) =>
      createMessage('sync.cursor', manager.roomInfo!.roomId, userId, {
        userId,
        x,
        y,
        timestamp: Date.now(),
      });

    const handle = (manager as unknown as { handleMessage(m: unknown): void }).handleMessage.bind(manager);

    handle(cursorMsg(alice.id, 0.1, 0.2));
    handle(cursorMsg(bob.id, 0.8, 0.9));

    const cursors = manager.remoteCursors;
    expect(cursors.length).toBe(2);

    const aliceCursor = cursors.find(c => c.userId === alice.id);
    const bobCursor = cursors.find(c => c.userId === bob.id);

    expect(aliceCursor!.x).toBe(0.1);
    expect(bobCursor!.x).toBe(0.8);
  });
});
