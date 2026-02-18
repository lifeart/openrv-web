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
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  playback: true,
  view: true,
  color: false,
  annotations: false,
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
  | 'sync.state-request'
  | 'sync.state-response'
  | 'sync.webrtc-offer'
  | 'sync.webrtc-answer'
  | 'sync.webrtc-ice'
  | 'user.presence'
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
  action: 'add' | 'remove' | 'clear';
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
  sessionStateRequested: { requestId: string; requesterUserId: string };
  sessionStateReceived: {
    requestId: string;
    senderUserId: string;
    sessionState?: string;
    encryptedSessionState?: EncryptedSessionStatePayload;
    transport: 'webrtc' | 'websocket';
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
