/**
 * MessageProtocol - Message serialization, deserialization, and validation
 *
 * Handles the creation and parsing of sync messages exchanged
 * between WebSocket clients.
 */

import type {
  SyncMessage,
  SyncMessageType,
  PlaybackSyncPayload,
  FrameSyncPayload,
  ViewSyncPayload,
  ColorSyncPayload,
  AnnotationSyncPayload,
  CursorSyncPayload,
  PermissionChangePayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomLeavePayload,
  PingPayload,
  PongPayload,
  StateRequestPayload,
  StateResponsePayload,
  MediaRequestPayload,
  MediaOfferPayload,
  MediaResponsePayload,
  MediaChunkPayload,
  MediaCompletePayload,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIcePayload,
} from './types';

// ---- Valid Message Types ----

const VALID_MESSAGE_TYPES: Set<SyncMessageType> = new Set([
  'room.create',
  'room.join',
  'room.leave',
  'room.users',
  'room.created',
  'room.joined',
  'room.left',
  'room.error',
  'sync.playback',
  'sync.frame',
  'sync.view',
  'sync.color',
  'sync.annotation',
  'sync.note',
  'sync.state-request',
  'sync.state-response',
  'sync.media-request',
  'sync.media-offer',
  'sync.media-response',
  'sync.media-chunk',
  'sync.media-complete',
  'sync.webrtc-offer',
  'sync.webrtc-answer',
  'sync.webrtc-ice',
  'sync.cursor',
  'user.presence',
  'user.permission',
  'ping',
  'pong',
  'error',
]);

// ---- ID Generation ----

let messageCounter = 0;

/**
 * Generate a unique message ID.
 * Uses crypto.randomUUID if available, otherwise falls back to counter-based ID.
 */
export function generateMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

/**
 * Generate a room code in XXXX-XXXX format.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    const index = Math.floor(Math.random() * chars.length);
    code += chars[index];
  }
  return code;
}

/**
 * Validate room code format (XXXX-XXXX).
 */
export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.toUpperCase());
}

// ---- Message Creation ----

/**
 * Create a base SyncMessage with common fields filled in.
 */
export function createMessage(
  type: SyncMessageType,
  roomId: string,
  userId: string,
  payload: unknown
): SyncMessage {
  return {
    id: generateMessageId(),
    type,
    roomId,
    userId,
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create a room.create message.
 */
export function createRoomCreateMessage(userId: string, payload: RoomCreatePayload): SyncMessage {
  return createMessage('room.create', '', userId, payload);
}

/**
 * Create a room.join message.
 */
export function createRoomJoinMessage(userId: string, payload: RoomJoinPayload): SyncMessage {
  return createMessage('room.join', '', userId, payload);
}

/**
 * Create a room.leave message.
 */
export function createRoomLeaveMessage(roomId: string, userId: string, payload?: RoomLeavePayload): SyncMessage {
  return createMessage('room.leave', roomId, userId, payload ?? {});
}

/**
 * Create a sync.playback message.
 */
export function createPlaybackSyncMessage(
  roomId: string,
  userId: string,
  payload: PlaybackSyncPayload
): SyncMessage {
  return createMessage('sync.playback', roomId, userId, payload);
}

/**
 * Create a sync.frame message.
 */
export function createFrameSyncMessage(
  roomId: string,
  userId: string,
  payload: FrameSyncPayload
): SyncMessage {
  return createMessage('sync.frame', roomId, userId, payload);
}

/**
 * Create a sync.view message.
 */
export function createViewSyncMessage(
  roomId: string,
  userId: string,
  payload: ViewSyncPayload
): SyncMessage {
  return createMessage('sync.view', roomId, userId, payload);
}

/**
 * Create a sync.color message.
 */
export function createColorSyncMessage(
  roomId: string,
  userId: string,
  payload: ColorSyncPayload
): SyncMessage {
  return createMessage('sync.color', roomId, userId, payload);
}

/**
 * Create a sync.annotation message.
 */
export function createAnnotationSyncMessage(
  roomId: string,
  userId: string,
  payload: AnnotationSyncPayload
): SyncMessage {
  return createMessage('sync.annotation', roomId, userId, payload);
}

/**
 * Create a sync.cursor message.
 */
export function createCursorSyncMessage(
  roomId: string,
  userId: string,
  payload: CursorSyncPayload
): SyncMessage {
  return createMessage('sync.cursor', roomId, userId, payload);
}

/**
 * Create a user.permission message.
 */
export function createPermissionMessage(
  roomId: string,
  userId: string,
  payload: PermissionChangePayload
): SyncMessage {
  return createMessage('user.permission', roomId, userId, payload);
}

/**
 * Create a sync.state-request message.
 */
export function createStateRequestMessage(
  roomId: string,
  userId: string,
  payload: StateRequestPayload
): SyncMessage {
  return createMessage('sync.state-request', roomId, userId, payload);
}

/**
 * Create a sync.state-response message.
 */
export function createStateResponseMessage(
  roomId: string,
  userId: string,
  payload: StateResponsePayload
): SyncMessage {
  return createMessage('sync.state-response', roomId, userId, payload);
}

/**
 * Create a sync.media-request message.
 */
export function createMediaRequestMessage(
  roomId: string,
  userId: string,
  payload: MediaRequestPayload
): SyncMessage {
  return createMessage('sync.media-request', roomId, userId, payload);
}

/**
 * Create a sync.media-offer message.
 */
export function createMediaOfferMessage(
  roomId: string,
  userId: string,
  payload: MediaOfferPayload
): SyncMessage {
  return createMessage('sync.media-offer', roomId, userId, payload);
}

/**
 * Create a sync.media-response message.
 */
export function createMediaResponseMessage(
  roomId: string,
  userId: string,
  payload: MediaResponsePayload
): SyncMessage {
  return createMessage('sync.media-response', roomId, userId, payload);
}

/**
 * Create a sync.media-chunk message.
 */
export function createMediaChunkMessage(
  roomId: string,
  userId: string,
  payload: MediaChunkPayload
): SyncMessage {
  return createMessage('sync.media-chunk', roomId, userId, payload);
}

/**
 * Create a sync.media-complete message.
 */
export function createMediaCompleteMessage(
  roomId: string,
  userId: string,
  payload: MediaCompletePayload
): SyncMessage {
  return createMessage('sync.media-complete', roomId, userId, payload);
}

/**
 * Create a sync.webrtc-offer message.
 */
export function createWebRTCOfferMessage(
  roomId: string,
  userId: string,
  payload: WebRTCOfferPayload
): SyncMessage {
  return createMessage('sync.webrtc-offer', roomId, userId, payload);
}

/**
 * Create a sync.webrtc-answer message.
 */
export function createWebRTCAnswerMessage(
  roomId: string,
  userId: string,
  payload: WebRTCAnswerPayload
): SyncMessage {
  return createMessage('sync.webrtc-answer', roomId, userId, payload);
}

/**
 * Create a sync.webrtc-ice message.
 */
export function createWebRTCIceMessage(
  roomId: string,
  userId: string,
  payload: WebRTCIcePayload
): SyncMessage {
  return createMessage('sync.webrtc-ice', roomId, userId, payload);
}

/**
 * Create a ping message.
 */
export function createPingMessage(roomId: string, userId: string): SyncMessage {
  const payload: PingPayload = { sentAt: Date.now() };
  return createMessage('ping', roomId, userId, payload);
}

/**
 * Create a pong message in response to a ping.
 */
export function createPongMessage(roomId: string, userId: string, sentAt: number): SyncMessage {
  const payload: PongPayload = { sentAt, serverTime: Date.now() };
  return createMessage('pong', roomId, userId, payload);
}

// ---- Serialization ----

/**
 * Serialize a SyncMessage to a JSON string for WebSocket transmission.
 */
export function serializeMessage(message: SyncMessage): string {
  return JSON.stringify(message);
}

/**
 * Deserialize a JSON string into a SyncMessage.
 * Returns null if the string is not valid JSON or fails validation.
 */
export function deserializeMessage(data: string): SyncMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (validateMessage(parsed)) {
      return parsed as SyncMessage;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Validation ----

/**
 * Validate that an object conforms to the SyncMessage structure.
 */
export function validateMessage(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const msg = obj as Record<string, unknown>;

  // Required fields
  if (typeof msg.id !== 'string' || msg.id.length === 0) {
    return false;
  }
  if (typeof msg.type !== 'string' || !VALID_MESSAGE_TYPES.has(msg.type as SyncMessageType)) {
    return false;
  }
  if (typeof msg.roomId !== 'string') {
    return false;
  }
  if (typeof msg.userId !== 'string') {
    return false;
  }
  if (typeof msg.timestamp !== 'number' || !isFinite(msg.timestamp)) {
    return false;
  }

  // Payload must exist (can be null/object/array)
  if (msg.payload === undefined) {
    return false;
  }

  return true;
}

/**
 * Validate a playback sync payload.
 */
export function validatePlaybackPayload(payload: unknown): payload is PlaybackSyncPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.isPlaying === 'boolean' &&
    typeof p.currentFrame === 'number' &&
    typeof p.playbackSpeed === 'number' &&
    typeof p.playDirection === 'number' &&
    typeof p.loopMode === 'string' &&
    typeof p.timestamp === 'number'
  );
}

/**
 * Validate a frame sync payload.
 */
export function validateFramePayload(payload: unknown): payload is FrameSyncPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return typeof p.currentFrame === 'number' && typeof p.timestamp === 'number';
}

/**
 * Validate a view sync payload.
 */
export function validateViewPayload(payload: unknown): payload is ViewSyncPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.panX === 'number' &&
    typeof p.panY === 'number' &&
    typeof p.zoom === 'number' &&
    typeof p.channelMode === 'string'
  );
}

/**
 * Validate a color sync payload.
 */
export function validateColorPayload(payload: unknown): payload is ColorSyncPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.exposure === 'number' &&
    typeof p.gamma === 'number' &&
    typeof p.saturation === 'number' &&
    typeof p.contrast === 'number' &&
    typeof p.temperature === 'number' &&
    typeof p.tint === 'number' &&
    typeof p.brightness === 'number'
  );
}

/**
 * Validate a state-request payload.
 */
export function validateStateRequestPayload(payload: unknown): payload is StateRequestPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.requestId !== 'string' || p.requestId.length === 0) return false;
  if (p.targetUserId !== undefined && typeof p.targetUserId !== 'string') return false;
  return true;
}

/**
 * Validate a media-request payload.
 */
export function validateMediaRequestPayload(payload: unknown): payload is MediaRequestPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.transferId !== 'string' || p.transferId.length === 0) return false;
  if (p.targetUserId !== undefined && typeof p.targetUserId !== 'string') return false;
  return true;
}

/**
 * Validate a media-offer payload.
 */
export function validateMediaOfferPayload(payload: unknown): payload is MediaOfferPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.transferId !== 'string' || p.transferId.length === 0) return false;
  if (typeof p.targetUserId !== 'string' || p.targetUserId.length === 0) return false;
  if (typeof p.totalBytes !== 'number' || !Number.isFinite(p.totalBytes) || p.totalBytes < 0) return false;
  if (!Array.isArray(p.files) || !Array.isArray(p.sources)) return false;
  return true;
}

/**
 * Validate a media-response payload.
 */
export function validateMediaResponsePayload(payload: unknown): payload is MediaResponsePayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.transferId === 'string' &&
    p.transferId.length > 0 &&
    typeof p.targetUserId === 'string' &&
    p.targetUserId.length > 0 &&
    typeof p.accepted === 'boolean'
  );
}

/**
 * Validate a media-chunk payload.
 */
export function validateMediaChunkPayload(payload: unknown): payload is MediaChunkPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.transferId === 'string' &&
    p.transferId.length > 0 &&
    typeof p.targetUserId === 'string' &&
    p.targetUserId.length > 0 &&
    typeof p.fileId === 'string' &&
    p.fileId.length > 0 &&
    typeof p.chunkIndex === 'number' &&
    Number.isFinite(p.chunkIndex) &&
    p.chunkIndex >= 0 &&
    typeof p.totalChunks === 'number' &&
    Number.isFinite(p.totalChunks) &&
    p.totalChunks >= 1 &&
    typeof p.data === 'string'
  );
}

/**
 * Validate a media-complete payload.
 */
export function validateMediaCompletePayload(payload: unknown): payload is MediaCompletePayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.transferId === 'string' &&
    p.transferId.length > 0 &&
    typeof p.targetUserId === 'string' &&
    p.targetUserId.length > 0
  );
}

/**
 * Validate a WebRTC offer payload.
 */
export function validateWebRTCOfferPayload(payload: unknown): payload is WebRTCOfferPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.requestId === 'string' &&
    p.requestId.length > 0 &&
    typeof p.targetUserId === 'string' &&
    p.targetUserId.length > 0 &&
    typeof p.sdp === 'string' &&
    p.sdp.length > 0
  );
}

/**
 * Validate a WebRTC answer payload.
 */
export function validateWebRTCAnswerPayload(payload: unknown): payload is WebRTCAnswerPayload {
  return validateWebRTCOfferPayload(payload);
}

/**
 * Validate a WebRTC ICE payload.
 */
export function validateWebRTCIcePayload(payload: unknown): payload is WebRTCIcePayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.requestId === 'string' &&
    p.requestId.length > 0 &&
    typeof p.targetUserId === 'string' &&
    p.targetUserId.length > 0 &&
    p.candidate !== null &&
    typeof p.candidate === 'object'
  );
}

/**
 * Validate an annotation sync payload.
 */
export function validateAnnotationPayload(payload: unknown): payload is AnnotationSyncPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.frame !== 'number' || !Number.isFinite(p.frame)) return false;
  if (!Array.isArray(p.strokes)) return false;
  if (typeof p.action !== 'string') return false;
  const validActions = ['add', 'remove', 'clear', 'update'];
  if (!validActions.includes(p.action)) return false;
  if (typeof p.timestamp !== 'number' || !Number.isFinite(p.timestamp)) return false;
  // remove and update require annotationId
  if ((p.action === 'remove' || p.action === 'update') &&
      (typeof p.annotationId !== 'string' || p.annotationId.length === 0)) {
    return false;
  }
  return true;
}

/**
 * Validate a cursor sync payload.
 */
export function validateCursorPayload(payload: unknown): payload is CursorSyncPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.userId === 'string' &&
    p.userId.length > 0 &&
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y) &&
    typeof p.timestamp === 'number' &&
    Number.isFinite(p.timestamp)
  );
}

/**
 * Validate a permission change payload.
 */
export function validatePermissionPayload(payload: unknown): payload is PermissionChangePayload {
  if (payload === null || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.targetUserId !== 'string' || p.targetUserId.length === 0) return false;
  if (typeof p.role !== 'string') return false;
  const validRoles = ['host', 'reviewer', 'viewer'];
  if (!validRoles.includes(p.role)) return false;
  return true;
}
