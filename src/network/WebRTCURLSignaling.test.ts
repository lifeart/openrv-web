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
});
