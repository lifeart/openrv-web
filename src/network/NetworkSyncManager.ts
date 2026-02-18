/**
 * NetworkSyncManager - Main orchestrator for network synchronization
 *
 * Connects WebSocketClient, SyncStateManager, and the Session/Viewer
 * to provide real-time sync between multiple OpenRV Web clients.
 */

import { EventEmitter } from '../utils/EventEmitter';
import type { ManagerBase } from '../core/ManagerBase';
import { WebSocketClient } from './WebSocketClient';
import { SyncStateManager } from './SyncStateManager';
import {
  createRoomCreateMessage,
  createRoomJoinMessage,
  createRoomLeaveMessage,
  createPlaybackSyncMessage,
  createFrameSyncMessage,
  createViewSyncMessage,
  createAnnotationSyncMessage,
  createCursorSyncMessage,
  createPermissionMessage,
  createStateRequestMessage,
  createStateResponseMessage,
  createMediaRequestMessage,
  createMediaOfferMessage,
  createMediaResponseMessage,
  createMediaChunkMessage,
  createMediaCompleteMessage,
  createWebRTCOfferMessage,
  createWebRTCAnswerMessage,
  createWebRTCIceMessage,
  generateMessageId,
  generateRoomCode,
  isValidRoomCode,
  validatePlaybackPayload,
  validateFramePayload,
  validateViewPayload,
  validateColorPayload,
  validateAnnotationPayload,
  validateCursorPayload,
  validatePermissionPayload,
  validateStateRequestPayload,
  validateMediaRequestPayload,
  validateMediaOfferPayload,
  validateMediaResponsePayload,
  validateMediaChunkPayload,
  validateMediaCompletePayload,
  validateWebRTCOfferPayload,
  validateWebRTCAnswerPayload,
  validateWebRTCIcePayload,
} from './MessageProtocol';
import type {
  ConnectionState,
  SyncUser,
  RoomInfo,
  SyncSettings,
  SyncMessage,
  NetworkSyncEvents,
  NetworkSyncConfig,
  PlaybackSyncPayload,
  FrameSyncPayload,
  ViewSyncPayload,
  ColorSyncPayload,
  AnnotationSyncPayload,
  CursorSyncPayload,
  ParticipantRole,
  ParticipantPermission,
  PermissionChangePayload,
  RoomCreatedPayload,
  RoomJoinedPayload,
  RoomLeftPayload,
  RoomUsersPayload,
  RoomErrorPayload,
  ErrorPayload,
  StateRequestPayload,
  StateResponsePayload,
  MediaOfferPayload,
  MediaChunkPayload,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIcePayload,
} from './types';
import { DEFAULT_SYNC_SETTINGS, DEFAULT_NETWORK_SYNC_CONFIG, USER_COLORS } from './types';

interface WebRTCPeerState {
  requestId: string;
  peerUserId: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
  stateSent: boolean;
}

export class NetworkSyncManager extends EventEmitter<NetworkSyncEvents> implements ManagerBase {
  private wsClient: WebSocketClient;
  private stateManager: SyncStateManager;
  private config: NetworkSyncConfig;

  private _connectionState: ConnectionState = 'disconnected';
  private _roomInfo: RoomInfo | null = null;
  private _userId: string = '';
  private _userName: string = 'User';
  private _pinCode: string = '';
  private _syncSettings: SyncSettings = { ...DEFAULT_SYNC_SETTINGS };
  private _disposed = false;
  private _webrtcPeers = new Map<string, WebRTCPeerState>();
  private _permissions = new Map<string, ParticipantRole>();
  private _remoteCursors = new Map<string, CursorSyncPayload>();

  // Subscriptions to clean up
  private _unsubscribers: Array<() => void> = [];

  constructor(config?: Partial<NetworkSyncConfig>) {
    super();
    this.config = { ...DEFAULT_NETWORK_SYNC_CONFIG, ...config };
    this._userId = generateMessageId();
    this._userName = this.config.userName;

    this.wsClient = new WebSocketClient(this.config);
    this.stateManager = new SyncStateManager(this.config.frameSyncThreshold);

    this.setupWebSocketEvents();
  }

  // ---- Public Getters ----

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get roomInfo(): RoomInfo | null {
    return this._roomInfo;
  }

  get userId(): string {
    return this._userId;
  }

  get userName(): string {
    return this._userName;
  }

  get pinCode(): string {
    return this._pinCode;
  }

  get users(): SyncUser[] {
    return this._roomInfo?.users ? [...this._roomInfo.users] : [];
  }

  get isHost(): boolean {
    return this._roomInfo?.hostId === this._userId;
  }

  get isConnected(): boolean {
    return this._connectionState === 'connected';
  }

  get syncSettings(): SyncSettings {
    return { ...this._syncSettings };
  }

  get rtt(): number {
    return this.wsClient.rtt;
  }

  /**
   * Get the permission role for a participant.
   * Returns 'reviewer' by default for unknown users.
   */
  getParticipantPermission(userId: string): ParticipantRole {
    return this._permissions.get(userId) ?? 'reviewer';
  }

  /**
   * Get all participant permissions as an array.
   */
  get participantPermissions(): ParticipantPermission[] {
    return Array.from(this._permissions.entries()).map(([userId, role]) => ({ userId, role }));
  }

  /**
   * Get all remote cursor positions.
   */
  get remoteCursors(): CursorSyncPayload[] {
    return Array.from(this._remoteCursors.values());
  }

  /**
   * Check whether a user can send sync updates (not a viewer).
   */
  canUserSync(userId: string): boolean {
    const role = this._permissions.get(userId);
    return role !== 'viewer';
  }

  /**
   * Get the SyncStateManager for testing/external use.
   */
  getSyncStateManager(): SyncStateManager {
    return this.stateManager;
  }

  setPinCode(pinCode: string): void {
    this._pinCode = pinCode.trim();
  }

  // ---- Room Management ----

  /**
   * Create a new sync room.
   */
  createRoom(userName?: string, pinCode?: string): void {
    if (this._connectionState !== 'disconnected' && this._connectionState !== 'error') return;

    if (userName) this._userName = userName;
    if (typeof pinCode === 'string') this.setPinCode(pinCode);

    this.setConnectionState('connecting');
    this.wsClient.setIdentity(this._userId, '');
    this.wsClient.connect(this.config.serverUrl, this._userId, '');

    // Once connected, send room.create (use `once` to avoid leak)
    const unsub = this.wsClient.once('connected', () => {
      const message = createRoomCreateMessage(this._userId, {
        userName: this._userName,
      });
      this.wsClient.send(message);
    });
    this._unsubscribers.push(unsub);
  }

  /**
   * Join an existing room by code.
   */
  joinRoom(roomCode: string, userName?: string, pinCode?: string): void {
    if (this._connectionState !== 'disconnected' && this._connectionState !== 'error') return;

    if (!isValidRoomCode(roomCode)) {
      this.emit('error', { code: 'INVALID_CODE', message: 'Invalid room code format. Expected XXXX-XXXX.' });
      return;
    }

    if (userName) this._userName = userName;
    if (typeof pinCode === 'string') this.setPinCode(pinCode);

    this.setConnectionState('connecting');
    this.wsClient.setIdentity(this._userId, '');
    this.wsClient.connect(this.config.serverUrl, this._userId, '');

    // Once connected, send room.join (use `once` to avoid leak)
    const unsub = this.wsClient.once('connected', () => {
      const message = createRoomJoinMessage(this._userId, {
        roomCode: roomCode.toUpperCase(),
        userName: this._userName,
      });
      this.wsClient.send(message);
    });
    this._unsubscribers.push(unsub);
  }

  /**
   * Leave the current room.
   */
  leaveRoom(): void {
    if (!this._roomInfo) return;

    const message = createRoomLeaveMessage(this._roomInfo.roomId, this._userId);
    this.wsClient.send(message);
    this.disposeAllWebRTCPeers();
    this.wsClient.disconnect();
    this.resetRoomState();
    this.setConnectionState('disconnected');
    this.emit('roomLeft', undefined);
  }

  // ---- Sync Settings ----

  setSyncSettings(settings: SyncSettings): void {
    this._syncSettings = { ...settings };
    this.stateManager.setSyncSettings(settings);
  }

  // ---- Outgoing Sync Messages ----

  /**
   * Send a playback state sync message.
   * Called by the app when local playback state changes.
   */
  sendPlaybackSync(payload: PlaybackSyncPayload): void {
    if (!this.isConnected || !this._roomInfo) return;
    if (!this._syncSettings.playback) return;
    if (this.stateManager.isApplyingRemoteState) return;

    this.stateManager.updateLocalPlayback(payload);
    const message = createPlaybackSyncMessage(this._roomInfo.roomId, this._userId, {
      ...payload,
      timestamp: Date.now(),
    });
    this.wsClient.send(message);
  }

  /**
   * Send a frame position sync message (lightweight, no playback state).
   */
  sendFrameSync(currentFrame: number): void {
    if (!this.isConnected || !this._roomInfo) return;
    if (!this._syncSettings.playback) return;
    if (this.stateManager.isApplyingRemoteState) return;

    const payload: FrameSyncPayload = {
      currentFrame,
      timestamp: Date.now(),
    };
    this.stateManager.updateLocalPlayback({ currentFrame });
    const message = createFrameSyncMessage(this._roomInfo.roomId, this._userId, payload);
    this.wsClient.send(message);
  }

  /**
   * Send a view state sync message.
   */
  sendViewSync(payload: ViewSyncPayload): void {
    if (!this.isConnected || !this._roomInfo) return;
    if (!this._syncSettings.view) return;
    if (this.stateManager.isApplyingRemoteState) return;

    this.stateManager.updateLocalView(payload);
    const message = createViewSyncMessage(this._roomInfo.roomId, this._userId, payload);
    this.wsClient.send(message);
  }

  /**
   * Send a cursor position sync message.
   * Called by the app when the local cursor moves over the viewport.
   */
  sendCursorPosition(x: number, y: number): void {
    if (!this.isConnected || !this._roomInfo) return;
    if (!this._syncSettings.cursor) return;
    if (this.stateManager.isApplyingRemoteState) return;

    const payload: CursorSyncPayload = {
      userId: this._userId,
      x,
      y,
      timestamp: Date.now(),
    };
    const message = createCursorSyncMessage(this._roomInfo.roomId, this._userId, payload);
    this.wsClient.send(message);
  }

  /**
   * Send an annotation sync message.
   * Called when a local annotation is added, removed, or updated.
   */
  sendAnnotationSync(payload: AnnotationSyncPayload): void {
    if (!this.isConnected || !this._roomInfo) return;
    if (!this._syncSettings.annotations) return;
    if (this.stateManager.isApplyingRemoteState) return;
    // Viewers cannot send annotations
    if (this.getParticipantPermission(this._userId) === 'viewer') return;

    const message = createAnnotationSyncMessage(this._roomInfo.roomId, this._userId, {
      ...payload,
      timestamp: Date.now(),
    });
    this.wsClient.send(message);
  }

  /**
   * Set the permission role for a participant.
   * Only the host can change permissions.
   */
  setParticipantPermission(targetUserId: string, role: ParticipantRole): void {
    if (!this.isConnected || !this._roomInfo) return;
    if (!this.isHost) return;

    this._permissions.set(targetUserId, role);

    const message = createPermissionMessage(this._roomInfo.roomId, this._userId, {
      targetUserId,
      role,
    });
    this.wsClient.send(message);

    this.emit('participantPermissionChanged', { userId: targetUserId, role });
  }

  /**
   * Request full state sync from server/host (after reconnection).
   */
  requestStateSync(targetUserId?: string): void {
    if (!this.isConnected || !this._roomInfo) return;

    const message = createStateRequestMessage(this._roomInfo.roomId, this._userId, {
      requestId: generateMessageId(),
      targetUserId,
    });
    this.wsClient.send(message);
  }

  /**
   * Send session state response payload to a specific requester.
   * Attempts WebRTC transfer first, then falls back to WebSocket.
   */
  sendSessionStateResponse(
    requestId: string,
    requesterUserId: string,
    payload: Omit<StateResponsePayload, 'requestId' | 'targetUserId'>
  ): void {
    if (!this.isConnected || !this._roomInfo) return;

    const responsePayload: StateResponsePayload = {
      ...payload,
      requestId,
      targetUserId: requesterUserId,
    };

    if (this.canUseWebRTC()) {
      this.sendStateViaWebRTC(responsePayload, requesterUserId);
      return;
    }

    this.sendStateResponseOverWebSocket(responsePayload);
  }

  /**
   * Request media bytes from another peer (typically host) for missing local files.
   * Returns the generated transfer ID, or an empty string if request could not be sent.
   */
  requestMediaSync(targetUserId?: string): string {
    if (!this.isConnected || !this._roomInfo) return '';

    const transferId = generateMessageId();
    const message = createMediaRequestMessage(this._roomInfo.roomId, this._userId, {
      transferId,
      targetUserId,
    });
    this.wsClient.send(message);
    return transferId;
  }

  /**
   * Send a media transfer offer to a specific requester.
   */
  sendMediaOffer(
    transferId: string,
    requesterUserId: string,
    payload: Omit<MediaOfferPayload, 'transferId' | 'targetUserId'>
  ): void {
    if (!this.isConnected || !this._roomInfo) return;
    const message = createMediaOfferMessage(this._roomInfo.roomId, this._userId, {
      ...payload,
      transferId,
      targetUserId: requesterUserId,
    });
    this.wsClient.send(message);
  }

  /**
   * Respond to an incoming media offer.
   */
  sendMediaResponse(transferId: string, targetUserId: string, accepted: boolean): void {
    if (!this.isConnected || !this._roomInfo) return;
    const message = createMediaResponseMessage(this._roomInfo.roomId, this._userId, {
      transferId,
      targetUserId,
      accepted,
    });
    this.wsClient.send(message);
  }

  /**
   * Send a media chunk to the target peer.
   */
  sendMediaChunk(
    transferId: string,
    targetUserId: string,
    payload: Omit<MediaChunkPayload, 'transferId' | 'targetUserId'>
  ): void {
    if (!this.isConnected || !this._roomInfo) return;
    const message = createMediaChunkMessage(this._roomInfo.roomId, this._userId, {
      ...payload,
      transferId,
      targetUserId,
    });
    this.wsClient.send(message);
  }

  /**
   * Notify the target peer that all media chunks were sent.
   */
  sendMediaComplete(transferId: string, targetUserId: string): void {
    if (!this.isConnected || !this._roomInfo) return;
    const message = createMediaCompleteMessage(this._roomInfo.roomId, this._userId, {
      transferId,
      targetUserId,
    });
    this.wsClient.send(message);
  }

  // ---- Private: WebSocket Event Handling ----

  private setupWebSocketEvents(): void {
    const unsub1 = this.wsClient.on('message', (message) => this.handleMessage(message));

    const unsub2 = this.wsClient.on('disconnected', () => {
      if (this._connectionState === 'connected') {
        this.setConnectionState('reconnecting');
        this.emit('toastMessage', {
          message: 'Connection lost. Reconnecting...',
          type: 'warning',
        });
      }
    });

    const unsub3 = this.wsClient.on('reconnecting', () => {
      this.setConnectionState('reconnecting');
    });

    const unsub4 = this.wsClient.on('reconnected', () => {
      this.setConnectionState('connected');
      this.emit('toastMessage', {
        message: 'Reconnected successfully',
        type: 'success',
      });
      // Request full state sync after reconnection
      this.requestStateSync(this._roomInfo?.hostId);
    });

    const unsub5 = this.wsClient.on('reconnectFailed', () => {
      this.setConnectionState('error');
      this.emit('toastMessage', {
        message: 'Failed to reconnect. Please try again.',
        type: 'error',
      });
      this.emit('error', { code: 'RECONNECT_FAILED', message: 'Maximum reconnection attempts reached.' });
    });

    const unsub6 = this.wsClient.on('rttUpdated', (rtt) => {
      this.stateManager.setRTT(rtt);
      this.emit('rttUpdated', rtt);
    });

    const unsub7 = this.wsClient.on('error', (err) => {
      this.emit('error', { code: 'WS_ERROR', message: err.message });
    });

    this._unsubscribers.push(unsub1, unsub2, unsub3, unsub4, unsub5, unsub6, unsub7);
  }

  private handleMessage(message: SyncMessage): void {
    // Server-originating message types should not be filtered by userId
    const isServerMessage =
      message.type === 'room.created' ||
      message.type === 'room.joined' ||
      message.type === 'room.left' ||
      message.type === 'room.users' ||
      message.type === 'room.error' ||
      message.type === 'error';

    // Ignore messages from self (except server-originating responses)
    if (!isServerMessage && message.userId === this._userId) return;

    switch (message.type) {
      case 'room.created':
        this.handleRoomCreated(message.payload as RoomCreatedPayload);
        break;
      case 'room.joined':
        this.handleRoomJoined(message.payload as RoomJoinedPayload);
        break;
      case 'room.left':
        this.handleRoomLeft(message.payload as RoomLeftPayload);
        break;
      case 'room.users':
        this.handleRoomUsers(message.payload as RoomUsersPayload);
        break;
      case 'room.error':
        this.handleRoomError(message.payload as RoomErrorPayload);
        break;
      case 'sync.playback':
        this.handleSyncPlayback(message.payload as PlaybackSyncPayload);
        break;
      case 'sync.frame':
        this.handleSyncFrame(message.payload as FrameSyncPayload);
        break;
      case 'sync.view':
        this.handleSyncView(message.payload as ViewSyncPayload);
        break;
      case 'sync.color':
        this.handleSyncColor(message.payload as ColorSyncPayload);
        break;
      case 'sync.annotation':
        this.handleSyncAnnotation(message.payload);
        break;
      case 'sync.cursor':
        this.handleSyncCursor(message.payload, message.userId);
        break;
      case 'user.permission':
        this.handlePermissionChange(message.payload, message.userId);
        break;
      case 'sync.state-request':
        this.handleStateRequest(message.payload, message.userId);
        break;
      case 'sync.state-response':
        this.handleStateResponse(message.payload, message.userId);
        break;
      case 'sync.media-request':
        this.handleMediaRequest(message.payload, message.userId);
        break;
      case 'sync.media-offer':
        this.handleMediaOffer(message.payload, message.userId);
        break;
      case 'sync.media-response':
        this.handleMediaResponse(message.payload, message.userId);
        break;
      case 'sync.media-chunk':
        this.handleMediaChunk(message.payload, message.userId);
        break;
      case 'sync.media-complete':
        this.handleMediaComplete(message.payload, message.userId);
        break;
      case 'sync.webrtc-offer':
        this.handleWebRTCOffer(message.payload, message.userId);
        break;
      case 'sync.webrtc-answer':
        this.handleWebRTCAnswer(message.payload, message.userId);
        break;
      case 'sync.webrtc-ice':
        this.handleWebRTCIce(message.payload, message.userId);
        break;
      case 'error':
        this.handleError(message.payload as ErrorPayload);
        break;
    }
  }

  // ---- Room Event Handlers ----

  private handleRoomCreated(payload: RoomCreatedPayload): void {
    this._roomInfo = {
      roomId: payload.roomId,
      roomCode: payload.roomCode,
      hostId: this._userId,
      users: [payload.user],
      createdAt: Date.now(),
      maxUsers: 10,
    };

    this.wsClient.setIdentity(this._userId, payload.roomId);
    this.stateManager.setHost(true);
    this._permissions.set(this._userId, 'host');
    this.setConnectionState('connected');

    this.emit('roomCreated', { ...this._roomInfo });
    this.emit('usersChanged', [...this._roomInfo.users]);
  }

  private handleRoomJoined(payload: RoomJoinedPayload): void {
    this._roomInfo = {
      roomId: payload.roomId,
      roomCode: payload.roomCode,
      hostId: payload.users.find(u => u.isHost)?.id ?? '',
      users: payload.users,
      createdAt: Date.now(),
      maxUsers: 10,
    };

    this.wsClient.setIdentity(this._userId, payload.roomId);
    this.stateManager.setHost(false);
    this.setConnectionState('connected');

    this.emit('roomJoined', { ...this._roomInfo });
    this.emit('usersChanged', [...this._roomInfo.users]);

    // Notify about the new user
    this.emit('userJoined', payload.user);
    this.emit('toastMessage', {
      message: `${payload.user.name} joined the room`,
      type: 'info',
    });

    // Request one-time host state sync immediately after joining.
    if (this._roomInfo.hostId) {
      this.requestStateSync(this._roomInfo.hostId);
    }
  }

  private handleRoomLeft(payload: RoomLeftPayload): void {
    if (!this._roomInfo) return;

    const leavingUser = this._roomInfo.users.find(u => u.id === payload.userId);
    if (leavingUser) {
      this._roomInfo.users = this._roomInfo.users.filter(u => u.id !== payload.userId);
      this._permissions.delete(payload.userId);
      this._remoteCursors.delete(payload.userId);
      this.emit('usersChanged', [...this._roomInfo.users]);
      this.emit('userLeft', leavingUser);
      this.emit('toastMessage', {
        message: `${leavingUser.name} left the room`,
        type: 'info',
      });
    }
  }

  private handleRoomUsers(payload: RoomUsersPayload): void {
    if (!this._roomInfo) return;

    this._roomInfo.users = payload.users;
    this.emit('usersChanged', [...this._roomInfo.users]);
  }

  private handleRoomError(payload: RoomErrorPayload): void {
    this.setConnectionState('error');
    this.emit('error', { code: payload.code, message: payload.message });
    this.emit('toastMessage', {
      message: payload.message,
      type: 'error',
    });
    // Disconnect on room errors
    this.wsClient.disconnect();
    this.resetRoomState();
    this.setConnectionState('disconnected');
  }

  // ---- Sync Event Handlers ----

  private handleSyncPlayback(payload: PlaybackSyncPayload): void {
    if (!this.stateManager.shouldSyncPlayback()) return;
    if (!validatePlaybackPayload(payload)) return;

    this.stateManager.updateRemotePlayback(payload);
    this.emit('syncPlayback', payload);
  }

  private handleSyncFrame(payload: FrameSyncPayload): void {
    if (!this.stateManager.shouldSyncPlayback()) return;
    if (!validateFramePayload(payload)) return;

    this.emit('syncFrame', payload);
  }

  private handleSyncView(payload: ViewSyncPayload): void {
    if (!this.stateManager.shouldSyncView()) return;
    if (!validateViewPayload(payload)) return;

    this.stateManager.updateRemoteView(payload);
    this.emit('syncView', payload);
  }

  private handleSyncColor(payload: ColorSyncPayload): void {
    if (!this.stateManager.shouldSyncColor()) return;
    if (!validateColorPayload(payload)) return;

    this.stateManager.updateRemoteColor(payload);
    this.emit('syncColor', payload);
  }

  private handleSyncAnnotation(payload: unknown): void {
    if (!this.stateManager.shouldSyncAnnotations()) return;
    if (!validateAnnotationPayload(payload)) return;

    this.emit('syncAnnotation', payload);
  }

  private handleSyncCursor(payload: unknown, senderUserId: string): void {
    if (!this._syncSettings.cursor) return;
    if (!validateCursorPayload(payload)) return;

    this._remoteCursors.set(senderUserId, payload);
    this.emit('syncCursor', payload);
  }

  private handlePermissionChange(payload: unknown, senderUserId: string): void {
    if (!validatePermissionPayload(payload)) return;

    const perm = payload as PermissionChangePayload;
    // Only accept permission changes from the host
    if (this._roomInfo && senderUserId !== this._roomInfo.hostId) return;

    this._permissions.set(perm.targetUserId, perm.role);
    this.emit('participantPermissionChanged', {
      userId: perm.targetUserId,
      role: perm.role,
    });
  }

  private handleStateRequest(payload: unknown, senderUserId: string): void {
    if (!validateStateRequestPayload(payload)) return;

    const requestPayload = payload as StateRequestPayload;
    if (requestPayload.targetUserId && requestPayload.targetUserId !== this._userId) {
      return;
    }

    this.emit('sessionStateRequested', {
      requestId: requestPayload.requestId,
      requesterUserId: senderUserId,
    });
  }

  private handleStateResponse(payload: unknown, senderUserId: string): void {
    if (!payload || typeof payload !== 'object') return;
    const responsePayload = payload as StateResponsePayload;
    if (typeof responsePayload.requestId !== 'string' || responsePayload.requestId.length === 0) return;
    if (responsePayload.targetUserId && responsePayload.targetUserId !== this._userId) return;

    const hasState =
      typeof responsePayload.sessionState === 'string' ||
      responsePayload.encryptedSessionState !== undefined;
    if (!hasState) return;

    this.emit('sessionStateReceived', {
      requestId: responsePayload.requestId,
      senderUserId,
      sessionState: responsePayload.sessionState,
      encryptedSessionState: responsePayload.encryptedSessionState,
      transport: 'websocket',
    });
  }

  private handleMediaRequest(payload: unknown, senderUserId: string): void {
    if (!validateMediaRequestPayload(payload)) return;

    const requestPayload = payload as { transferId: string; targetUserId?: string };
    if (requestPayload.targetUserId && requestPayload.targetUserId !== this._userId) return;

    this.emit('mediaSyncRequested', {
      transferId: requestPayload.transferId,
      requesterUserId: senderUserId,
    });
  }

  private handleMediaOffer(payload: unknown, senderUserId: string): void {
    if (!validateMediaOfferPayload(payload)) return;

    const offerPayload = payload as MediaOfferPayload;
    if (offerPayload.targetUserId !== this._userId) return;

    this.emit('mediaSyncOffered', {
      transferId: offerPayload.transferId,
      senderUserId,
      totalBytes: offerPayload.totalBytes,
      files: offerPayload.files,
      sources: offerPayload.sources,
    });
  }

  private handleMediaResponse(payload: unknown, senderUserId: string): void {
    if (!validateMediaResponsePayload(payload)) return;

    const responsePayload = payload as { transferId: string; targetUserId: string; accepted: boolean };
    if (responsePayload.targetUserId !== this._userId) return;

    this.emit('mediaSyncResponded', {
      transferId: responsePayload.transferId,
      senderUserId,
      accepted: responsePayload.accepted,
    });
  }

  private handleMediaChunk(payload: unknown, senderUserId: string): void {
    if (!validateMediaChunkPayload(payload)) return;

    const chunkPayload = payload as MediaChunkPayload;
    if (chunkPayload.targetUserId !== this._userId) return;

    this.emit('mediaSyncChunkReceived', {
      transferId: chunkPayload.transferId,
      senderUserId,
      fileId: chunkPayload.fileId,
      chunkIndex: chunkPayload.chunkIndex,
      totalChunks: chunkPayload.totalChunks,
      data: chunkPayload.data,
    });
  }

  private handleMediaComplete(payload: unknown, senderUserId: string): void {
    if (!validateMediaCompletePayload(payload)) return;

    const completePayload = payload as { transferId: string; targetUserId: string };
    if (completePayload.targetUserId !== this._userId) return;

    this.emit('mediaSyncCompleted', {
      transferId: completePayload.transferId,
      senderUserId,
    });
  }

  private canUseWebRTC(): boolean {
    return (
      typeof RTCPeerConnection === 'function' &&
      Array.isArray(this.config.iceServers) &&
      this.config.iceServers.length > 0
    );
  }

  private getWebRTCKey(requestId: string, peerUserId: string): string {
    return `${requestId}:${peerUserId}`;
  }

  private createPeerConnection(requestId: string, peerUserId: string): WebRTCPeerState {
    const pc = new RTCPeerConnection({ iceServers: this.config.iceServers });
    const key = this.getWebRTCKey(requestId, peerUserId);

    const state: WebRTCPeerState = {
      requestId,
      peerUserId,
      pc,
      channel: null,
      fallbackTimer: null,
      stateSent: false,
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this._roomInfo) return;
      const message = createWebRTCIceMessage(this._roomInfo.roomId, this._userId, {
        requestId,
        targetUserId: peerUserId,
        candidate: event.candidate.toJSON(),
      });
      this.wsClient.send(message);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.disposeWebRTCPeer(key);
      }
    };

    this._webrtcPeers.set(key, state);
    return state;
  }

  private getOrCreatePeerConnection(requestId: string, peerUserId: string): WebRTCPeerState {
    const key = this.getWebRTCKey(requestId, peerUserId);
    const existing = this._webrtcPeers.get(key);
    if (existing) return existing;
    return this.createPeerConnection(requestId, peerUserId);
  }

  private disposeWebRTCPeer(key: string): void {
    const state = this._webrtcPeers.get(key);
    if (!state) return;

    if (state.fallbackTimer) {
      clearTimeout(state.fallbackTimer);
      state.fallbackTimer = null;
    }
    if (state.channel) {
      try {
        state.channel.close();
      } catch {
        // ignore close errors
      }
      state.channel = null;
    }
    try {
      state.pc.close();
    } catch {
      // ignore close errors
    }
    this._webrtcPeers.delete(key);
  }

  private disposeAllWebRTCPeers(): void {
    const keys = Array.from(this._webrtcPeers.keys());
    keys.forEach((key) => this.disposeWebRTCPeer(key));
  }

  private sendStateResponseOverWebSocket(payload: StateResponsePayload): void {
    if (!this._roomInfo) return;
    const message = createStateResponseMessage(this._roomInfo.roomId, this._userId, payload);
    this.wsClient.send(message);
  }

  private sendStateViaWebRTC(payload: StateResponsePayload, requesterUserId: string): void {
    if (!this._roomInfo) return;
    const { requestId } = payload;
    const state = this.getOrCreatePeerConnection(requestId, requesterUserId);
    const key = this.getWebRTCKey(requestId, requesterUserId);

    const channel = state.pc.createDataChannel('session-state', { ordered: true });
    state.channel = channel;

    channel.onopen = () => {
      if (state.stateSent) return;
      state.stateSent = true;
      channel.send(JSON.stringify(payload));
      if (state.fallbackTimer) {
        clearTimeout(state.fallbackTimer);
        state.fallbackTimer = null;
      }
      setTimeout(() => this.disposeWebRTCPeer(key), 250);
    };

    channel.onerror = () => {
      if (!state.stateSent) {
        this.sendStateResponseOverWebSocket(payload);
      }
      this.disposeWebRTCPeer(key);
    };

    state.fallbackTimer = setTimeout(() => {
      if (!state.stateSent) {
        this.sendStateResponseOverWebSocket(payload);
      }
      this.disposeWebRTCPeer(key);
    }, 7000);

    void (async () => {
      try {
        const offer = await state.pc.createOffer();
        await state.pc.setLocalDescription(offer);
        if (!state.pc.localDescription?.sdp) throw new Error('Missing local SDP offer');

        const message = createWebRTCOfferMessage(this._roomInfo!.roomId, this._userId, {
          requestId,
          targetUserId: requesterUserId,
          sdp: state.pc.localDescription.sdp,
        });
        this.wsClient.send(message);
      } catch {
        this.sendStateResponseOverWebSocket(payload);
        this.disposeWebRTCPeer(key);
      }
    })();
  }

  private handleWebRTCOffer(payload: unknown, senderUserId: string): void {
    if (!this.canUseWebRTC()) return;
    if (!validateWebRTCOfferPayload(payload)) return;
    const offerPayload = payload as WebRTCOfferPayload;
    if (offerPayload.targetUserId !== this._userId) return;

    const state = this.getOrCreatePeerConnection(offerPayload.requestId, senderUserId);
    const key = this.getWebRTCKey(offerPayload.requestId, senderUserId);

    state.pc.ondatachannel = (event) => {
      const channel = event.channel;
      state.channel = channel;
      channel.onmessage = (msg) => {
        if (typeof msg.data !== 'string') return;
        try {
          const responsePayload = JSON.parse(msg.data) as StateResponsePayload;
          if (typeof responsePayload.requestId !== 'string') return;
          this.emit('sessionStateReceived', {
            requestId: responsePayload.requestId,
            senderUserId,
            sessionState: responsePayload.sessionState,
            encryptedSessionState: responsePayload.encryptedSessionState,
            transport: 'webrtc',
          });
        } catch {
          // ignore malformed payloads
        }
      };
      channel.onclose = () => this.disposeWebRTCPeer(key);
    };

    void (async () => {
      try {
        await state.pc.setRemoteDescription({ type: 'offer', sdp: offerPayload.sdp });
        const answer = await state.pc.createAnswer();
        await state.pc.setLocalDescription(answer);
        if (!state.pc.localDescription?.sdp || !this._roomInfo) throw new Error('Missing local SDP answer');

        const message = createWebRTCAnswerMessage(this._roomInfo.roomId, this._userId, {
          requestId: offerPayload.requestId,
          targetUserId: senderUserId,
          sdp: state.pc.localDescription.sdp,
        });
        this.wsClient.send(message);
      } catch {
        this.disposeWebRTCPeer(key);
      }
    })();
  }

  private handleWebRTCAnswer(payload: unknown, senderUserId: string): void {
    if (!this.canUseWebRTC()) return;
    if (!validateWebRTCAnswerPayload(payload)) return;
    const answerPayload = payload as WebRTCAnswerPayload;
    if (answerPayload.targetUserId !== this._userId) return;

    const key = this.getWebRTCKey(answerPayload.requestId, senderUserId);
    const state = this._webrtcPeers.get(key);
    if (!state) return;

    void state.pc.setRemoteDescription({ type: 'answer', sdp: answerPayload.sdp }).catch(() => {
      this.disposeWebRTCPeer(key);
    });
  }

  private handleWebRTCIce(payload: unknown, senderUserId: string): void {
    if (!this.canUseWebRTC()) return;
    if (!validateWebRTCIcePayload(payload)) return;
    const icePayload = payload as WebRTCIcePayload;
    if (icePayload.targetUserId !== this._userId) return;

    const key = this.getWebRTCKey(icePayload.requestId, senderUserId);
    const state = this._webrtcPeers.get(key);
    if (!state) return;

    void state.pc.addIceCandidate(icePayload.candidate).catch(() => {
      // ignore invalid/late ICE candidates
    });
  }

  private handleError(payload: ErrorPayload): void {
    this.emit('error', payload);
  }

  // ---- Private Helpers ----

  private setConnectionState(state: ConnectionState): void {
    if (this._connectionState === state) return;
    this._connectionState = state;
    this.emit('connectionStateChanged', state);
  }

  private resetRoomState(): void {
    this.disposeAllWebRTCPeers();
    this._roomInfo = null;
    this._permissions.clear();
    this._remoteCursors.clear();
    this.stateManager.reset();
  }

  // ---- Simulate Server Responses (for testing without a real server) ----

  /**
   * Simulate a successful room creation response.
   * Used for testing and mock scenarios.
   */
  simulateRoomCreated(roomCode?: string): void {
    const code = roomCode ?? generateRoomCode();
    const user: SyncUser = {
      id: this._userId,
      name: this._userName,
      color: USER_COLORS[0],
      isHost: true,
      joinedAt: Date.now(),
    };

    this._roomInfo = {
      roomId: generateMessageId(),
      roomCode: code,
      hostId: this._userId,
      users: [user],
      createdAt: Date.now(),
      maxUsers: 10,
    };

    this.stateManager.setHost(true);
    this._permissions.set(this._userId, 'host');
    this.setConnectionState('connected');
    this.emit('roomCreated', { ...this._roomInfo });
    this.emit('usersChanged', [...this._roomInfo.users]);
  }

  /**
   * Simulate a user joining the room.
   */
  simulateUserJoined(userName: string): SyncUser {
    if (!this._roomInfo) {
      throw new Error('No room to join');
    }

    const user: SyncUser = {
      id: generateMessageId(),
      name: userName,
      color: USER_COLORS[this._roomInfo.users.length % USER_COLORS.length] ?? USER_COLORS[0],
      isHost: false,
      joinedAt: Date.now(),
    };

    this._roomInfo.users.push(user);
    this.emit('usersChanged', [...this._roomInfo.users]);
    this.emit('userJoined', user);
    this.emit('toastMessage', {
      message: `${userName} joined the room`,
      type: 'info',
    });

    return user;
  }

  /**
   * Simulate a user leaving the room.
   */
  simulateUserLeft(userId: string): void {
    if (!this._roomInfo) return;

    const user = this._roomInfo.users.find(u => u.id === userId);
    if (user) {
      this._roomInfo.users = this._roomInfo.users.filter(u => u.id !== userId);
      this._permissions.delete(userId);
      this._remoteCursors.delete(userId);
      this.emit('usersChanged', [...this._roomInfo.users]);
      this.emit('userLeft', user);
      this.emit('toastMessage', {
        message: `${user.name} left the room`,
        type: 'info',
      });
    }
  }

  // ---- Cleanup ----

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    // Unsubscribe all listeners
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];

    // Leave room if connected
    if (this._roomInfo) {
      this.leaveRoom();
    }

    this.disposeAllWebRTCPeers();
    this.wsClient.dispose();
    this.stateManager.reset();
    this.removeAllListeners();
  }
}
