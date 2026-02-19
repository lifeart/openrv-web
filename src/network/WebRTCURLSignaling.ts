/**
 * WebRTC URL Signaling helpers.
 *
 * Encodes/decodes offer/answer payloads so peers can exchange signaling
 * through shareable URLs without a signaling server.
 */

export const WEBRTC_URL_SIGNAL_PARAM = 'rtc';

const SIGNAL_VERSION = 1;
const MAX_SDP_LENGTH = 120_000;

interface WebRTCURLSignalBase {
  version: number;
  type: 'offer' | 'answer';
  roomId: string;
  roomCode: string;
  hostUserId: string;
  createdAt: number;
  sdp: string;
}

export interface WebRTCURLOfferSignal extends WebRTCURLSignalBase {
  type: 'offer';
  hostUserName: string;
  hostColor: string;
  pinCode?: string;
}

export interface WebRTCURLAnswerSignal extends WebRTCURLSignalBase {
  type: 'answer';
  guestUserId: string;
  guestUserName: string;
  guestColor: string;
}

export type WebRTCURLSignal = WebRTCURLOfferSignal | WebRTCURLAnswerSignal;

/**
 * Encode a WebRTC URL signal to a compact base64url token.
 */
export function encodeWebRTCURLSignal(signal: WebRTCURLSignal): string {
  const json = JSON.stringify(signal);
  return base64UrlEncode(json);
}

/**
 * Decode and validate a WebRTC URL signal token.
 */
export function decodeWebRTCURLSignal(token: string): WebRTCURLSignal | null {
  const normalized = token.trim();
  if (!normalized) return null;

  try {
    const decoded = base64UrlDecode(normalized);
    const parsed = JSON.parse(decoded);
    return parseSignal(parsed);
  } catch {
    return null;
  }
}

/**
 * Extract rtc token from a URL-like input or return the input itself if it
 * already looks like a raw token.
 */
export function extractWebRTCSignalToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fallbackBase = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
  try {
    const parsed = new URL(trimmed, fallbackBase);
    const token = parsed.searchParams.get(WEBRTC_URL_SIGNAL_PARAM);
    if (token && token.trim().length > 0) return token.trim();
  } catch {
    // ignore and try direct parsing below
  }

  if (trimmed.startsWith(`${WEBRTC_URL_SIGNAL_PARAM}=`)) {
    const params = new URLSearchParams(trimmed);
    const token = params.get(WEBRTC_URL_SIGNAL_PARAM);
    return token && token.trim().length > 0 ? token.trim() : null;
  }

  return trimmed;
}

function parseSignal(value: unknown): WebRTCURLSignal | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const base = parseBaseSignal(raw);
  if (!base) return null;

  if (base.type === 'offer') {
    if (typeof raw.hostUserName !== 'string' || raw.hostUserName.length === 0) return null;
    if (typeof raw.hostColor !== 'string' || raw.hostColor.length === 0) return null;
    if (raw.pinCode !== undefined && typeof raw.pinCode !== 'string') return null;
    return {
      ...base,
      type: 'offer',
      hostUserName: raw.hostUserName,
      hostColor: raw.hostColor,
      pinCode: typeof raw.pinCode === 'string' ? raw.pinCode : undefined,
    };
  }

  if (typeof raw.guestUserId !== 'string' || raw.guestUserId.length === 0) return null;
  if (typeof raw.guestUserName !== 'string' || raw.guestUserName.length === 0) return null;
  if (typeof raw.guestColor !== 'string' || raw.guestColor.length === 0) return null;
  return {
    ...base,
    type: 'answer',
    guestUserId: raw.guestUserId,
    guestUserName: raw.guestUserName,
    guestColor: raw.guestColor,
  };
}

function parseBaseSignal(raw: Record<string, unknown>): WebRTCURLSignalBase | null {
  if (raw.version !== SIGNAL_VERSION) return null;
  if (raw.type !== 'offer' && raw.type !== 'answer') return null;
  if (typeof raw.roomId !== 'string' || raw.roomId.length === 0) return null;
  if (typeof raw.roomCode !== 'string' || raw.roomCode.length === 0) return null;
  if (typeof raw.hostUserId !== 'string' || raw.hostUserId.length === 0) return null;
  if (typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt) || raw.createdAt <= 0) return null;
  if (typeof raw.sdp !== 'string' || raw.sdp.length === 0 || raw.sdp.length > MAX_SDP_LENGTH) return null;

  return {
    version: SIGNAL_VERSION,
    type: raw.type,
    roomId: raw.roomId,
    roomCode: raw.roomCode,
    hostUserId: raw.hostUserId,
    createdAt: raw.createdAt,
    sdp: raw.sdp,
  };
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
