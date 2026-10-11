/**
 * RoomCrypto + end-to-end encrypted room traffic tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  deriveRoomKey,
  generateRoomSecret,
  isValidRoomSecret,
  openMessage,
  parseRoomInviteLink,
  readRoomLinkSecret,
  sealMessage,
  withRoomLinkSecret,
} from './RoomCrypto';
import { NetworkSyncManager } from './NetworkSyncManager';
import { createMessage } from './MessageProtocol';
import type { SyncMessage } from './types';

vi.stubGlobal(
  'WebSocket',
  class {
    static OPEN = 1;
    readyState = 0;
    send(): void {}
    close(): void {}
  },
);

const ROOM_CODE = 'ABCD-EFGH';

describe('RoomCrypto', () => {
  it('RC-001: generates 128-bit base64url secrets', () => {
    const a = generateRoomSecret();
    const b = generateRoomSecret();
    expect(isValidRoomSecret(a)).toBe(true);
    expect(a).toHaveLength(22);
    expect(a).not.toBe(b);
    expect(isValidRoomSecret('1234')).toBe(false);
  });

  it('RC-002: sealed payloads hide content and open with the same key', async () => {
    const secret = generateRoomSecret();
    const key = await deriveRoomKey(secret, ROOM_CODE, '482913');
    const message = createMessage('sync.note', 'room-1', 'user-1', {
      action: 'add',
      note: { text: 'secret shot note' },
    });

    const sealed = await sealMessage(key, message);
    expect(JSON.stringify(sealed)).not.toContain('secret shot note');

    const opened = await openMessage(await deriveRoomKey(secret, ROOM_CODE, '482913'), sealed);
    expect(opened?.payload).toEqual(message.payload);
  });

  it('RC-003: a wrong PIN, room code or secret cannot open the payload', async () => {
    const secret = generateRoomSecret();
    const sealed = await sealMessage(
      await deriveRoomKey(secret, ROOM_CODE, '482913'),
      createMessage('sync.frame', 'r', 'u', { currentFrame: 3 }),
    );

    expect(await openMessage(await deriveRoomKey(secret, ROOM_CODE, '000000'), sealed)).toBeNull();
    expect(await openMessage(await deriveRoomKey(secret, 'WXYZ-1234', '482913'), sealed)).toBeNull();
    expect(await openMessage(await deriveRoomKey(generateRoomSecret(), ROOM_CODE, '482913'), sealed)).toBeNull();
  });

  it('RC-004: relabelling the sender or type of a sealed message is detected', async () => {
    const key = await deriveRoomKey(generateRoomSecret(), ROOM_CODE);
    const sealed = await sealMessage(
      key,
      createMessage('sync.annotation', 'r', 'alice', { action: 'clear', frame: 1 }),
    );

    expect(await openMessage(key, { ...sealed, userId: 'mallory' })).toBeNull();
    expect(await openMessage(key, { ...sealed, type: 'sync.note' })).toBeNull();
  });

  it('RC-005: the secret goes in the fragment, next to the session state, never the query', () => {
    const secret = generateRoomSecret();
    const link = withRoomLinkSecret('https://example.com/?room=ABCD-EFGH&pin=1234#s=eyJmIjoxfQ', secret, true);
    const url = new URL(link);

    expect(url.searchParams.get('pin')).toBeNull();
    expect(url.search).not.toContain(secret);
    expect(url.hash.startsWith('#s=eyJmIjoxfQ')).toBe(true);
    expect(readRoomLinkSecret(url.hash)).toEqual({ secret, pinRequired: true });
    expect(parseRoomInviteLink(link)).toEqual({ roomCode: 'ABCD-EFGH', secret, pinRequired: true });
    expect(parseRoomInviteLink('ABCD-EFGH')).toBeNull();
  });
});

// ---- Encrypted traffic between two managers ----

interface Peer {
  manager: NetworkSyncManager;
  sent: SyncMessage[];
}

function makePeer(secret: string | null, pin: string, opts: { hostId?: string; asHost?: boolean } = {}): Peer {
  const manager = new NetworkSyncManager({ userName: 'Peer' });
  const sent: SyncMessage[] = [];
  const internals = manager as unknown as {
    wsClient: { send(m: SyncMessage): boolean; isConnected: boolean };
    _roomInfo: unknown;
    _connectionState: string;
  };
  internals.wsClient.send = (m: SyncMessage) => {
    sent.push(m);
    return true;
  };
  if (secret) manager.setRoomSecret(secret);
  manager.setPinCode(pin);
  if (opts.asHost) {
    manager._applyLocalRoomCreation(ROOM_CODE);
  } else {
    internals._roomInfo = {
      roomId: 'room-1',
      roomCode: ROOM_CODE,
      hostId: opts.hostId ?? 'host',
      users: [],
      createdAt: Date.now(),
      maxUsers: 10,
    };
    internals._connectionState = 'connected';
    (manager as unknown as { setKeyRoomCode(code: string): void }).setKeyRoomCode(ROOM_CODE);
  }
  return { manager, sent };
}

function deliver(to: NetworkSyncManager, message: SyncMessage): void {
  (to as unknown as { handleMessage(m: SyncMessage, t: string): void }).handleMessage(message, 'websocket');
}

describe('end-to-end encrypted room traffic', () => {
  const peers: NetworkSyncManager[] = [];
  afterEach(() => {
    peers.splice(0).forEach((p) => p.dispose());
  });

  function track(peer: Peer): Peer {
    peers.push(peer.manager);
    return peer;
  }

  it('RC-010: peers holding the room key and PIN exchange sync messages', async () => {
    const secret = generateRoomSecret();
    const host = track(makePeer(secret, '482913', { asHost: true }));
    const guest = track(makePeer(secret, '482913', { hostId: host.manager.userId }));
    const received = vi.fn();
    guest.manager.on('syncFrame', received);

    host.manager.sendFrameSync(42);
    await vi.waitFor(() => expect(host.sent.length).toBe(1));
    expect(JSON.stringify(host.sent[0])).not.toContain('42,');
    expect((host.sent[0]!.payload as { e2e?: number }).e2e).toBe(1);

    deliver(guest.manager, { ...host.sent[0]!, roomId: 'room-1' });
    // roomId is bound into the ciphertext, so the copy above must fail...
    await new Promise((r) => setTimeout(r, 20));
    expect(received).not.toHaveBeenCalled();

    // ...while the untouched message opens.
    (guest.manager as unknown as { _roomInfo: { roomId: string } })._roomInfo.roomId = host.manager.roomInfo!.roomId;
    deliver(guest.manager, host.sent[0]!);
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(expect.objectContaining({ currentFrame: 42 })));
  });

  it('RC-011: a peer with the link but the wrong PIN reads nothing and is warned', async () => {
    const secret = generateRoomSecret();
    const host = track(makePeer(secret, '482913', { asHost: true }));
    const intruder = track(makePeer(secret, '111111', { hostId: host.manager.userId }));
    (intruder.manager as unknown as { _roomInfo: { roomId: string } })._roomInfo.roomId = host.manager.roomInfo!.roomId;
    const received = vi.fn();
    const toast = vi.fn();
    intruder.manager.on('syncFrame', received);
    intruder.manager.on('toastMessage', toast);

    host.manager.sendFrameSync(7);
    await vi.waitFor(() => expect(host.sent.length).toBe(1));
    deliver(intruder.manager, host.sent[0]!);

    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' })));
    expect(received).not.toHaveBeenCalled();
  });

  it('RC-012: plaintext messages are dropped in an encrypted room', () => {
    const host = track(makePeer(generateRoomSecret(), '', { asHost: true }));
    const handler = vi.fn();
    host.manager.on('syncAnnotation', handler);

    deliver(host.manager, {
      ...createMessage('sync.annotation', host.manager.roomInfo!.roomId, 'outsider', {
        action: 'clear',
        frame: 1,
        strokes: [],
        timestamp: Date.now(),
      }),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('RC-013: viewers cannot drive playback, and only the host assigns roles', () => {
    const host = track(makePeer(null, '', { asHost: true }));
    const roomId = host.manager.roomInfo!.roomId;
    (host.manager as unknown as { _permissions: Map<string, string> })._permissions.set('viewer-1', 'viewer');
    const frame = vi.fn();
    host.manager.on('syncFrame', frame);
    deliver(host.manager, createMessage('sync.frame', roomId, 'viewer-1', { currentFrame: 9, timestamp: Date.now() }));
    expect(frame).not.toHaveBeenCalled();

    const guest = track(makePeer(null, '', { hostId: 'the-host' }));
    const permission = vi.fn();
    guest.manager.on('participantPermissionChanged', permission);
    deliver(
      guest.manager,
      createMessage('user.permission', 'room-1', 'not-the-host', {
        targetUserId: guest.manager.userId,
        role: 'viewer',
      }),
    );
    deliver(
      guest.manager,
      createMessage('user.permission', 'room-1', 'the-host', { targetUserId: 'someone', role: 'host' }),
    );
    expect(permission).not.toHaveBeenCalled();
  });

  it('RC-014: new rooms are always end-to-end encrypted', async () => {
    const manager = new NetworkSyncManager({ userName: 'Host' });
    peers.push(manager);
    manager.createRoom('Host', '482913');
    expect(isValidRoomSecret(manager.roomSecret)).toBe(true);
  });
});
