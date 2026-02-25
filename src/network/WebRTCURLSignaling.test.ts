import { describe, it, expect } from 'vitest';
import {
  encodeWebRTCURLSignal,
  decodeWebRTCURLSignal,
  extractWebRTCSignalToken,
  WEBRTC_URL_SIGNAL_PARAM,
  type WebRTCURLOfferSignal,
  type WebRTCURLAnswerSignal,
} from './WebRTCURLSignaling';

describe('WebRTCURLSignaling', () => {
  it('WUS-001: encodes and decodes offer signal payload', () => {
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      pinCode: '1234',
      createdAt: Date.now(),
      sdp: 'v=0\no=- 1 1 IN IP4 127.0.0.1',
    };

    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(token);
    expect(decoded).toEqual(offer);
  });

  it('WUS-002: encodes and decodes answer signal payload', () => {
    const answer: WebRTCURLAnswerSignal = {
      version: 1,
      type: 'answer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      guestUserId: 'guest-1',
      guestUserName: 'Guest',
      guestColor: '#4ade80',
      createdAt: Date.now(),
      sdp: 'v=0\no=- 2 2 IN IP4 127.0.0.1',
    };

    const token = encodeWebRTCURLSignal(answer);
    const decoded = decodeWebRTCURLSignal(token);
    expect(decoded).toEqual(answer);
  });

  it('WUS-003: extracts token from full URL input', () => {
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=- 1 1 IN IP4 127.0.0.1',
    };
    const token = encodeWebRTCURLSignal(offer);
    const extracted = extractWebRTCSignalToken(`https://openrv.test/?${WEBRTC_URL_SIGNAL_PARAM}=${token}`);
    expect(extracted).toBe(token);
  });

  it('WUS-004: rejects malformed payloads', () => {
    expect(decodeWebRTCURLSignal('')).toBeNull();
    const malformed = encodeWebRTCURLSignal({
      version: 1,
      type: 'offer',
      roomId: '',
      roomCode: '',
      hostUserId: '',
      hostUserName: '',
      hostColor: '',
      createdAt: Date.now(),
      sdp: '',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(malformed)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Empty SDP handling
  // ---------------------------------------------------------------------------

  it('WUS-005: rejects offer with empty SDP', () => {
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: '',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-006: rejects answer with empty SDP', () => {
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'answer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      guestUserId: 'guest-1',
      guestUserName: 'Guest',
      guestColor: '#4ade80',
      createdAt: Date.now(),
      sdp: '',
    } as unknown as WebRTCURLAnswerSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Large SDP handling
  // ---------------------------------------------------------------------------

  it('WUS-007: rejects SDP exceeding maximum length (120000 chars)', () => {
    const largeSDP = 'v=0\n' + 'a'.repeat(120_001);
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: largeSDP,
    });
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-008: accepts SDP at exactly maximum length boundary', () => {
    // MAX_SDP_LENGTH is 120_000
    const sdpAtLimit = 'v'.repeat(120_000);
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: sdpAtLimit,
    };
    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.sdp).toBe(sdpAtLimit);
  });

  // ---------------------------------------------------------------------------
  // Special characters in SDP
  // ---------------------------------------------------------------------------

  it('WUS-009: handles SDP with newlines and carriage returns', () => {
    const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp,
    };
    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.sdp).toBe(sdp);
  });

  it('WUS-010: handles SDP with unicode characters', () => {
    const sdp = 'v=0\no=- 1 1 IN IP4 127.0.0.1\ns=\u00e9\u00e8\u00ea\u4e16\u754c';
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp,
    };
    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.sdp).toBe(sdp);
  });

  it('WUS-011: handles SDP with base64-like characters (+/=)', () => {
    const sdp = 'v=0\na=ice-pwd:abc+def/ghi=jkl==\na=fingerprint:FF:FF:FF';
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp,
    };
    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.sdp).toBe(sdp);
  });

  // ---------------------------------------------------------------------------
  // Version mismatch handling
  // ---------------------------------------------------------------------------

  it('WUS-012: rejects signal with version 0', () => {
    const token = encodeWebRTCURLSignal({
      version: 0,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-013: rejects signal with version 2 (future)', () => {
    const token = encodeWebRTCURLSignal({
      version: 2,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Corrupted base64 input
  // ---------------------------------------------------------------------------

  it('WUS-014: returns null for corrupted base64 (invalid chars)', () => {
    expect(decodeWebRTCURLSignal('!!!invalid-base64!!!')).toBeNull();
  });

  it('WUS-015: returns null for truncated base64 payload', () => {
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=- 1 1 IN IP4 127.0.0.1',
    };
    const token = encodeWebRTCURLSignal(offer);
    // Truncate to half length
    const truncated = token.slice(0, Math.floor(token.length / 2));
    expect(decodeWebRTCURLSignal(truncated)).toBeNull();
  });

  it('WUS-016: returns null for valid base64 but invalid JSON', () => {
    // Encode "not json" as base64url
    const bytes = new TextEncoder().encode('not a json string');
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-017: returns null for valid JSON but missing required fields', () => {
    const payload = JSON.stringify({ version: 1, type: 'offer' });
    const bytes = new TextEncoder().encode(payload);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // extractWebRTCSignalToken edge cases
  // ---------------------------------------------------------------------------

  it('WUS-018: extractWebRTCSignalToken returns null for empty input', () => {
    expect(extractWebRTCSignalToken('')).toBeNull();
    expect(extractWebRTCSignalToken('   ')).toBeNull();
  });

  it('WUS-019: extractWebRTCSignalToken returns raw token for non-URL input', () => {
    const raw = 'some-raw-token-value';
    expect(extractWebRTCSignalToken(raw)).toBe(raw);
  });

  it('WUS-020: extractWebRTCSignalToken handles rtc= prefix format', () => {
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    };
    const token = encodeWebRTCURLSignal(offer);
    const extracted = extractWebRTCSignalToken(`${WEBRTC_URL_SIGNAL_PARAM}=${token}`);
    expect(extracted).toBe(token);
  });

  // ---------------------------------------------------------------------------
  // Validation edge cases
  // ---------------------------------------------------------------------------

  it('WUS-021: rejects offer with empty hostUserName', () => {
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: '',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-022: rejects answer with empty guestUserId', () => {
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'answer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      guestUserId: '',
      guestUserName: 'Guest',
      guestColor: '#4ade80',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    } as unknown as WebRTCURLAnswerSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-023: rejects signal with non-positive createdAt', () => {
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: 0,
      sdp: 'v=0\no=test',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-024: rejects signal with NaN createdAt', () => {
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: NaN,
      sdp: 'v=0\no=test',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-025: rejects signal with unknown type', () => {
    const token = encodeWebRTCURLSignal({
      version: 1,
      type: 'candidate' as 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    } as unknown as WebRTCURLOfferSignal);
    expect(decodeWebRTCURLSignal(token)).toBeNull();
  });

  it('WUS-026: preserves optional pinCode in offer', () => {
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      pinCode: '9876',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    };
    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(token) as WebRTCURLOfferSignal;
    expect(decoded).not.toBeNull();
    expect(decoded.pinCode).toBe('9876');
  });

  it('WUS-027: offer without pinCode decodes with pinCode undefined', () => {
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    };
    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(token) as WebRTCURLOfferSignal;
    expect(decoded).not.toBeNull();
    expect(decoded.pinCode).toBeUndefined();
  });

  it('WUS-028: decodeWebRTCURLSignal trims whitespace from token', () => {
    const offer: WebRTCURLOfferSignal = {
      version: 1,
      type: 'offer',
      roomId: 'room-1',
      roomCode: 'ABCD-EFGH',
      hostUserId: 'host-1',
      hostUserName: 'Host',
      hostColor: '#4a9eff',
      createdAt: Date.now(),
      sdp: 'v=0\no=test',
    };
    const token = encodeWebRTCURLSignal(offer);
    const decoded = decodeWebRTCURLSignal(`  ${token}  `);
    expect(decoded).not.toBeNull();
    expect(decoded!.roomId).toBe('room-1');
  });
});
