/**
 * Network Sync - Shared Type Definitions
 *
 * Types for WebSocket-based real-time synchronization between
 * multiple OpenRV Web clients viewing the same media.
 */

import type { EventMap } from '../utils/EventEmitter';

// ---- Connection States ----

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// ---- User / Room ----

export interface SyncUser {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomInfo {
  roomId: string;
  roomCode: string;
  hostId: string;
  users: SyncUser[];
  createdAt: number;
  maxUsers: number;
}

// ---- Sync Settings ----

export interface SyncSettings {
  playback: boolean;
  view: boolean;
  color: boolean;
  annotations: boolean;
  cursor: boolean;
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  playback: true,
  view: true,
  color: false,
  annotations: false,
  cursor: true,
};

// ---- Message Types ----

export type SyncMessageType =
  | 'room.create'
  | 'room.join'
  | 'room.leave'
  | 'room.users'
  | 'room.created'
  | 'room.joined'
  | 'room.left'
  | 'room.error'
  | 'sync.playback'
  | 'sync.frame'
  | 'sync.view'
  | 'sync.color'
  | 'sync.annotation'
  | 'sync.note'
  | 'sync.state-request'
  | 'sync.state-response'
  | 'sync.media-request'
  | 'sync.media-offer'
  | 'sync.media-response'
  | 'sync.media-chunk'
  | 'sync.media-complete'
  | 'sync.webrtc-offer'
  | 'sync.webrtc-answer'
  | 'sync.webrtc-ice'
  | 'sync.cursor'
  | 'user.presence'
  | 'user.permission'
  | 'ping'
  | 'pong'
  | 'error';

// ---- Base Message ----

export interface SyncMessage {
  id: string;
  type: SyncMessageType;
  roomId: string;
  userId: string;
  timestamp: number;
  payload: unknown;
}

// ---- Payloads ----

export interface RoomCreatePayload {
  userName: string;
  maxUsers?: number;
}

export interface RoomJoinPayload {
  roomCode: string;
  userName: string;
}

export interface RoomLeavePayload {
  reason?: string;
}

export interface RoomCreatedPayload {
  roomId: string;
  roomCode: string;
  user: SyncUser;
}

export interface RoomJoinedPayload {
  roomId: string;
  roomCode: string;
  user: SyncUser;
  users: SyncUser[];
}

export interface RoomLeftPayload {
  userId: string;
  userName: string;
  reason?: string;
}

export interface RoomUsersPayload {
  users: SyncUser[];
}

export interface RoomErrorPayload {
  code: string;
  message: string;
}

export type LoopModeSync = 'once' | 'loop' | 'pingpong';

export interface PlaybackSyncPayload {
  isPlaying: boolean;
  currentFrame: number;
  playbackSpeed: number;
  playDirection: number;
  loopMode: LoopModeSync;
  timestamp: number;
}

export interface FrameSyncPayload {
  currentFrame: number;
  timestamp: number;
}

export interface ViewSyncPayload {
  panX: number;
  panY: number;
  zoom: number;
  channelMode: string;
}

export interface ColorSyncPayload {
  exposure: number;
  gamma: number;
  saturation: number;
  contrast: number;
  temperature: number;
  tint: number;
  brightness: number;
}

export interface AnnotationSyncPayload {
  frame: number;
  strokes: unknown[];
  action: 'add' | 'remove' | 'clear' | 'update';
  annotationId?: string;
  timestamp: number;
}

export interface NoteSyncPayload {
  action: 'add' | 'remove' | 'update' | 'clear';
  note?: unknown;
  noteId?: string;
  timestamp: number;
}

// ---- Cursor Sync ----

export interface CursorSyncPayload {
  userId: string;
  x: number;
  y: number;
  timestamp: number;
}

// ---- Participant Permissions ----

export type ParticipantRole = 'host' | 'reviewer' | 'viewer';

export interface ParticipantPermission {
  userId: string;
  role: ParticipantRole;
}

export interface PermissionChangePayload {
  targetUserId: string;
  role: ParticipantRole;
}

export interface StateRequestPayload {
  requestId: string;
  targetUserId?: string;
}

export interface EncryptedSessionStatePayload {
  version: 1;
  algorithm: 'AES-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface StateResponsePayload {
  requestId: string;
  targetUserId?: string;
  playback?: PlaybackSyncPayload;
  view?: ViewSyncPayload;
  sessionState?: string;
  encryptedSessionState?: EncryptedSessionStatePayload;
}

export interface MediaRequestPayload {
  transferId: string;
  targetUserId?: string;
}

export interface MediaTransferFileDescriptor {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

export interface MediaTransferSourceDescriptor {
  kind: 'image' | 'video' | 'sequence';
  fileIds: string[];
  fps: number;
}

export interface MediaOfferPayload {
  transferId: string;
  targetUserId: string;
  totalBytes: number;
  files: MediaTransferFileDescriptor[];
  sources: MediaTransferSourceDescriptor[];
}

export interface MediaResponsePayload {
  transferId: string;
  targetUserId: string;
  accepted: boolean;
}

export interface MediaChunkPayload {
  transferId: string;
  targetUserId: string;
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;
}

export interface MediaCompletePayload {
  transferId: string;
  targetUserId: string;
}

export interface WebRTCOfferPayload {
  requestId: string;
  targetUserId: string;
  sdp: string;
}

export interface WebRTCAnswerPayload {
  requestId: string;
  targetUserId: string;
  sdp: string;
}

export interface WebRTCIcePayload {
  requestId: string;
  targetUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface PingPayload {
  sentAt: number;
}

export interface PongPayload {
  sentAt: number;
  serverTime: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// ---- Events ----

export interface NetworkSyncEvents extends EventMap {
  connectionStateChanged: ConnectionState;
  roomCreated: RoomInfo;
  roomJoined: RoomInfo;
  roomLeft: void;
  usersChanged: SyncUser[];
  userJoined: SyncUser;
  userLeft: SyncUser;
  syncPlayback: PlaybackSyncPayload;
  syncFrame: FrameSyncPayload;
  syncView: ViewSyncPayload;
  syncColor: ColorSyncPayload;
  syncAnnotation: AnnotationSyncPayload;
  syncNote: NoteSyncPayload;
  syncCursor: CursorSyncPayload;
  participantPermissionChanged: ParticipantPermission;
  sessionStateRequested: { requestId: string; requesterUserId: string };
  sessionStateReceived: {
    requestId: string;
    senderUserId: string;
    sessionState?: string;
    encryptedSessionState?: EncryptedSessionStatePayload;
    transport: 'webrtc' | 'websocket';
  };
  mediaSyncRequested: {
    transferId: string;
    requesterUserId: string;
  };
  mediaSyncOffered: {
    transferId: string;
    senderUserId: string;
    totalBytes: number;
    files: MediaTransferFileDescriptor[];
    sources: MediaTransferSourceDescriptor[];
  };
  mediaSyncResponded: {
    transferId: string;
    senderUserId: string;
    accepted: boolean;
  };
  mediaSyncChunkReceived: {
    transferId: string;
    senderUserId: string;
    fileId: string;
    chunkIndex: number;
    totalChunks: number;
    data: string;
  };
  mediaSyncCompleted: {
    transferId: string;
    senderUserId: string;
  };
  error: ErrorPayload;
  rttUpdated: number;
  toastMessage: { message: string; type: 'info' | 'success' | 'warning' | 'error' };
}

// ---- WebSocket Client Events ----

export interface WebSocketClientEvents extends EventMap {
  connected: void;
  disconnected: { code: number; reason: string };
  message: SyncMessage;
  error: Error;
  reconnecting: { attempt: number; maxAttempts: number };
  reconnected: void;
  reconnectFailed: void;
  rttUpdated: number;
}

// ---- Configuration ----

export interface NetworkSyncConfig {
  serverUrl: string;
  /** Optional prioritized signaling endpoints for failover. */
  serverUrls?: string[];
  iceServers: RTCIceServer[];
  reconnectMaxAttempts: number;
  reconnectBaseDelay: number;
  reconnectMaxDelay: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  frameSyncThreshold: number;
  userName: string;
}

export const DEFAULT_NETWORK_SYNC_CONFIG: NetworkSyncConfig = {
  serverUrl: 'wss://sync.openrv.local',
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  reconnectMaxAttempts: 10,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  heartbeatInterval: 5000,
  heartbeatTimeout: 10000,
  frameSyncThreshold: 2,
  userName: 'User',
};

// ---- User Colors ----

export const USER_COLORS = [
  '#4a9eff', // Blue
  '#4ade80', // Green
  '#f87171', // Red
  '#facc15', // Yellow
  '#c084fc', // Purple
  '#fb923c', // Orange
  '#2dd4bf', // Teal
  '#f472b6', // Pink
] as const;
