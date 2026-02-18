/**
 * MessageProtocol Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateMessageId,
  generateRoomCode,
  isValidRoomCode,
  createMessage,
  createRoomCreateMessage,
  createRoomJoinMessage,
  createRoomLeaveMessage,
  createPlaybackSyncMessage,
  createFrameSyncMessage,
  createViewSyncMessage,
  createAnnotationSyncMessage,
  createStateResponseMessage,
  createWebRTCOfferMessage,
  createWebRTCAnswerMessage,
  createWebRTCIceMessage,
  createPingMessage,
  createPongMessage,
  serializeMessage,
  deserializeMessage,
  validateMessage,
  validatePlaybackPayload,
  validateFramePayload,
  validateViewPayload,
  validateColorPayload,
  validateStateRequestPayload,
  validateWebRTCOfferPayload,
  validateWebRTCAnswerPayload,
  validateWebRTCIcePayload,
} from './MessageProtocol';
import type { PlaybackSyncPayload, ViewSyncPayload } from './types';

describe('MessageProtocol', () => {
  describe('generateMessageId', () => {
    it('MPR-010: generates unique message IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateRoomCode', () => {
    it('MPR-011: generates room code in XXXX-XXXX format', () => {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('MPR-012: generates different codes each time', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 10; i++) {
        codes.add(generateRoomCode());
      }
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('isValidRoomCode', () => {
    it('MPR-013: accepts valid room codes', () => {
      expect(isValidRoomCode('ABCD-1234')).toBe(true);
      expect(isValidRoomCode('XY9Z-4KLM')).toBe(true);
    });

    it('MPR-014: rejects invalid room codes', () => {
      expect(isValidRoomCode('')).toBe(false);
      expect(isValidRoomCode('ABCD')).toBe(false);
      expect(isValidRoomCode('ABCD-12')).toBe(false);
      expect(isValidRoomCode('ABCD_1234')).toBe(false);
      expect(isValidRoomCode('abcd-1234')).toBe(true); // case insensitive check
    });
  });

  describe('createMessage', () => {
    it('MPR-001: creates message with all required fields', () => {
      const msg = createMessage('sync.playback', 'room-1', 'user-1', { isPlaying: true });
      expect(msg.id).toBeTruthy();
      expect(msg.type).toBe('sync.playback');
      expect(msg.roomId).toBe('room-1');
      expect(msg.userId).toBe('user-1');
      expect(msg.timestamp).toBeGreaterThan(0);
      expect(msg.payload).toEqual({ isPlaying: true });
    });

    it('MPR-011: includes timestamp in message', () => {
      const before = Date.now();
      const msg = createMessage('ping', '', '', {});
      const after = Date.now();
      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('createRoomCreateMessage', () => {
    it('MPR-015: creates room.create message', () => {
      const msg = createRoomCreateMessage('user-1', { userName: 'Alice' });
      expect(msg.type).toBe('room.create');
      expect(msg.userId).toBe('user-1');
      expect((msg.payload as any).userName).toBe('Alice');
    });
  });

  describe('createRoomJoinMessage', () => {
    it('MPR-016: creates room.join message', () => {
      const msg = createRoomJoinMessage('user-2', { roomCode: 'ABCD-1234', userName: 'Bob' });
      expect(msg.type).toBe('room.join');
      expect((msg.payload as any).roomCode).toBe('ABCD-1234');
    });
  });

  describe('createRoomLeaveMessage', () => {
    it('MPR-017: creates room.leave message', () => {
      const msg = createRoomLeaveMessage('room-1', 'user-1');
      expect(msg.type).toBe('room.leave');
      expect(msg.roomId).toBe('room-1');
    });
  });

  describe('createPlaybackSyncMessage', () => {
    it('MPR-001: serializes playback sync message', () => {
      const payload: PlaybackSyncPayload = {
        isPlaying: true,
        currentFrame: 42,
        playbackSpeed: 1.0,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      };
      const msg = createPlaybackSyncMessage('room-1', 'user-1', payload);
      expect(msg.type).toBe('sync.playback');
      expect((msg.payload as PlaybackSyncPayload).isPlaying).toBe(true);
      expect((msg.payload as PlaybackSyncPayload).currentFrame).toBe(42);
    });
  });

  describe('createFrameSyncMessage', () => {
    it('MPR-018: creates frame sync message', () => {
      const msg = createFrameSyncMessage('room-1', 'user-1', { currentFrame: 100, timestamp: Date.now() });
      expect(msg.type).toBe('sync.frame');
      expect((msg.payload as any).currentFrame).toBe(100);
    });
  });

  describe('createViewSyncMessage', () => {
    it('MPR-003: serializes view sync message', () => {
      const payload: ViewSyncPayload = {
        panX: 10,
        panY: 20,
        zoom: 2.0,
        channelMode: 'rgb',
      };
      const msg = createViewSyncMessage('room-1', 'user-1', payload);
      expect(msg.type).toBe('sync.view');
      expect((msg.payload as ViewSyncPayload).zoom).toBe(2.0);
    });
  });

  describe('createPingMessage', () => {
    it('MPR-019: creates ping with sentAt timestamp', () => {
      const before = Date.now();
      const msg = createPingMessage('room-1', 'user-1');
      expect(msg.type).toBe('ping');
      expect((msg.payload as any).sentAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('createPongMessage', () => {
    it('MPR-020: creates pong with sentAt and serverTime', () => {
      const msg = createPongMessage('room-1', 'user-1', 1000);
      expect(msg.type).toBe('pong');
      expect((msg.payload as any).sentAt).toBe(1000);
      expect((msg.payload as any).serverTime).toBeGreaterThan(0);
    });
  });

  describe('WebRTC signaling messages', () => {
    it('MPR-043: creates WebRTC offer message', () => {
      const msg = createWebRTCOfferMessage('room-1', 'user-1', {
        requestId: 'req-1',
        targetUserId: 'user-2',
        sdp: 'offer-sdp',
      });
      expect(msg.type).toBe('sync.webrtc-offer');
    });

    it('MPR-044: creates WebRTC answer message', () => {
      const msg = createWebRTCAnswerMessage('room-1', 'user-2', {
        requestId: 'req-1',
        targetUserId: 'user-1',
        sdp: 'answer-sdp',
      });
      expect(msg.type).toBe('sync.webrtc-answer');
    });

    it('MPR-045: creates WebRTC ICE message', () => {
      const msg = createWebRTCIceMessage('room-1', 'user-1', {
        requestId: 'req-1',
        targetUserId: 'user-2',
        candidate: {
          candidate: 'candidate:1 1 udp 2113937151 192.168.1.2 5000 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      });
      expect(msg.type).toBe('sync.webrtc-ice');
    });
  });

  describe('serializeMessage / deserializeMessage', () => {
    it('MPR-001/002: round-trips a playback sync message', () => {
      const original = createPlaybackSyncMessage('room-1', 'user-1', {
        isPlaying: true,
        currentFrame: 42,
        playbackSpeed: 1.5,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      });
      const serialized = serializeMessage(original);
      expect(typeof serialized).toBe('string');

      const deserialized = deserializeMessage(serialized);
      expect(deserialized).not.toBeNull();
      expect(deserialized!.type).toBe('sync.playback');
      expect(deserialized!.id).toBe(original.id);
    });

    it('MPR-003/004: round-trips a view sync message', () => {
      const original = createViewSyncMessage('room-1', 'user-1', {
        panX: 5, panY: -10, zoom: 3, channelMode: 'red',
      });
      const serialized = serializeMessage(original);
      const deserialized = deserializeMessage(serialized);
      expect(deserialized).not.toBeNull();
      expect((deserialized!.payload as ViewSyncPayload).channelMode).toBe('red');
    });

    it('MPR-007: returns null for invalid JSON', () => {
      expect(deserializeMessage('not json')).toBeNull();
    });

    it('MPR-008: returns null for valid JSON missing fields', () => {
      expect(deserializeMessage('{"type":"sync.playback"}')).toBeNull();
    });
  });

  describe('validateMessage', () => {
    it('MPR-005: validates message type', () => {
      const validMsg = createMessage('sync.playback', 'r', 'u', {});
      expect(validateMessage(validMsg)).toBe(true);
    });

    it('MPR-006: rejects missing required fields', () => {
      expect(validateMessage(null)).toBe(false);
      expect(validateMessage(undefined)).toBe(false);
      expect(validateMessage({})).toBe(false);
      expect(validateMessage({ id: '', type: 'sync.playback', roomId: '', userId: '', timestamp: 1, payload: {} })).toBe(false); // empty id
    });

    it('MPR-007: rejects unknown message type', () => {
      expect(validateMessage({
        id: 'test',
        type: 'unknown.type',
        roomId: '',
        userId: '',
        timestamp: 1,
        payload: {},
      })).toBe(false);
    });

    it('MPR-009: rejects non-finite timestamp', () => {
      expect(validateMessage({
        id: 'test',
        type: 'ping',
        roomId: '',
        userId: '',
        timestamp: NaN,
        payload: {},
      })).toBe(false);
    });

    it('MPR-010: rejects missing payload', () => {
      expect(validateMessage({
        id: 'test',
        type: 'ping',
        roomId: '',
        userId: '',
        timestamp: 1,
      })).toBe(false);
    });
  });

  describe('validatePlaybackPayload', () => {
    it('MPR-021: accepts valid playback payload', () => {
      expect(validatePlaybackPayload({
        isPlaying: true,
        currentFrame: 0,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      })).toBe(true);
    });

    it('MPR-022: rejects invalid playback payload', () => {
      expect(validatePlaybackPayload(null)).toBe(false);
      expect(validatePlaybackPayload({})).toBe(false);
      expect(validatePlaybackPayload({ isPlaying: 'true' })).toBe(false);
    });
  });

  describe('validateFramePayload', () => {
    it('MPR-023: accepts valid frame payload', () => {
      expect(validateFramePayload({ currentFrame: 10, timestamp: 1000 })).toBe(true);
    });

    it('MPR-024: rejects invalid frame payload', () => {
      expect(validateFramePayload(null)).toBe(false);
      expect(validateFramePayload({ currentFrame: 'ten' })).toBe(false);
    });
  });

  describe('validateViewPayload', () => {
    it('MPR-025: accepts valid view payload', () => {
      expect(validateViewPayload({ panX: 0, panY: 0, zoom: 1, channelMode: 'rgb' })).toBe(true);
    });

    it('MPR-026: rejects invalid view payload', () => {
      expect(validateViewPayload(null)).toBe(false);
      expect(validateViewPayload({ panX: 0 })).toBe(false);
    });
  });

  describe('validateColorPayload', () => {
    it('MPR-027: accepts valid color payload', () => {
      expect(validateColorPayload({
        exposure: 0, gamma: 1, saturation: 1,
        contrast: 1, temperature: 0, tint: 0, brightness: 0,
      })).toBe(true);
    });

    it('MPR-028: rejects invalid color payload', () => {
      expect(validateColorPayload(null)).toBe(false);
      expect(validateColorPayload({ exposure: 'zero' })).toBe(false);
    });
  });

  describe('state + WebRTC payload validation', () => {
    it('MPR-046: validateStateRequestPayload accepts requestId with optional target', () => {
      expect(validateStateRequestPayload({ requestId: 'req-1' })).toBe(true);
      expect(validateStateRequestPayload({ requestId: 'req-1', targetUserId: 'user-2' })).toBe(true);
    });

    it('MPR-047: validateStateRequestPayload rejects invalid values', () => {
      expect(validateStateRequestPayload({})).toBe(false);
      expect(validateStateRequestPayload({ requestId: 123 })).toBe(false);
      expect(validateStateRequestPayload({ requestId: 'req', targetUserId: 123 })).toBe(false);
    });

    it('MPR-048: validateWebRTCOfferPayload checks required fields', () => {
      expect(validateWebRTCOfferPayload({
        requestId: 'req-1',
        targetUserId: 'user-2',
        sdp: 'offer',
      })).toBe(true);
      expect(validateWebRTCOfferPayload({ requestId: 'req-1' })).toBe(false);
    });

    it('MPR-049: validateWebRTCAnswerPayload checks required fields', () => {
      expect(validateWebRTCAnswerPayload({
        requestId: 'req-1',
        targetUserId: 'user-1',
        sdp: 'answer',
      })).toBe(true);
      expect(validateWebRTCAnswerPayload({ requestId: 'req-1' })).toBe(false);
    });

    it('MPR-050: validateWebRTCIcePayload checks required fields', () => {
      expect(validateWebRTCIcePayload({
        requestId: 'req-1',
        targetUserId: 'user-2',
        candidate: { candidate: 'x' },
      })).toBe(true);
      expect(validateWebRTCIcePayload({
        requestId: 'req-1',
        targetUserId: 'user-2',
        candidate: null,
      })).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('MPR-030: validates message with null payload', () => {
      expect(validateMessage({
        id: 'test',
        type: 'ping',
        roomId: '',
        userId: '',
        timestamp: 1,
        payload: null,
      })).toBe(true);
    });

    it('MPR-031: validates message with array payload', () => {
      expect(validateMessage({
        id: 'test',
        type: 'ping',
        roomId: '',
        userId: '',
        timestamp: 1,
        payload: [1, 2, 3],
      })).toBe(true);
    });

    it('MPR-032: rejects Infinity timestamp', () => {
      expect(validateMessage({
        id: 'test',
        type: 'ping',
        roomId: '',
        userId: '',
        timestamp: Infinity,
        payload: {},
      })).toBe(false);
    });

    it('MPR-033: rejects negative Infinity timestamp', () => {
      expect(validateMessage({
        id: 'test',
        type: 'ping',
        roomId: '',
        userId: '',
        timestamp: -Infinity,
        payload: {},
      })).toBe(false);
    });

    it('MPR-034: deserializeMessage handles deeply nested JSON', () => {
      const nested = {
        id: 'test-nested',
        type: 'sync.playback',
        roomId: 'r',
        userId: 'u',
        timestamp: 1000,
        payload: { deep: { nested: { data: true } } },
      };
      const result = deserializeMessage(JSON.stringify(nested));
      expect(result).not.toBeNull();
      expect((result!.payload as any).deep.nested.data).toBe(true);
    });

    it('MPR-035: deserializeMessage returns null for empty string', () => {
      expect(deserializeMessage('')).toBeNull();
    });

    it('MPR-036: room code does not contain ambiguous characters (O, I, 0, 1)', () => {
      // The chars string excludes I, O, 0, 1 to avoid confusion
      // Generate many codes and check
      for (let i = 0; i < 20; i++) {
        const code = generateRoomCode();
        expect(code).not.toMatch(/[IO01]/);
      }
    });

    it('MPR-037: createStateResponseMessage sets correct type', () => {
      const msg = createStateResponseMessage('room-1', 'user-1', {
        requestId: 'req-1',
        playback: {
          isPlaying: false, currentFrame: 0, playbackSpeed: 1,
          playDirection: 1, loopMode: 'loop', timestamp: 0,
        },
        view: { panX: 0, panY: 0, zoom: 1, channelMode: 'rgb' },
      });
      expect(msg.type).toBe('sync.state-response');
    });

    it('MPR-038: createAnnotationSyncMessage sets correct type', () => {
      const msg = createAnnotationSyncMessage('room-1', 'user-1', {
        frame: 10,
        strokes: [],
        action: 'add',
      });
      expect(msg.type).toBe('sync.annotation');
    });

    it('MPR-039: isValidRoomCode rejects special characters', () => {
      expect(isValidRoomCode('ABCD-!@#$')).toBe(false);
      expect(isValidRoomCode('AB<D-1234')).toBe(false);
      expect(isValidRoomCode('ABCD-12"4')).toBe(false);
    });

    it('MPR-040: validatePlaybackPayload rejects extra wrong types', () => {
      expect(validatePlaybackPayload({
        isPlaying: true,
        currentFrame: 'ten',
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now(),
      })).toBe(false);
    });

    it('MPR-041: validateFramePayload rejects missing timestamp', () => {
      expect(validateFramePayload({ currentFrame: 10 })).toBe(false);
    });

    it('MPR-042: validateViewPayload rejects missing channelMode', () => {
      expect(validateViewPayload({ panX: 0, panY: 0, zoom: 1 })).toBe(false);
    });
  });
});
