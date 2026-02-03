/**
 * NetworkSyncManager - Main orchestrator for network synchronization
 *
 * Connects WebSocketClient, SyncStateManager, and the Session/Viewer
 * to provide real-time sync between multiple OpenRV Web clients.
 */

import { EventEmitter } from '../utils/EventEmitter';
import { WebSocketClient } from './WebSocketClient';
import { SyncStateManager } from './SyncStateManager';
import {
  createRoomCreateMessage,
  createRoomJoinMessage,
  createRoomLeaveMessage,
  createPlaybackSyncMessage,
  createFrameSyncMessage,
  createViewSyncMessage,
  createStateRequestMessage,
  generateMessageId,
  generateRoomCode,
  isValidRoomCode,
  validatePlaybackPayload,
  validateFramePayload,
  validateViewPayload,
  validateColorPayload,
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
  RoomCreatedPayload,
  RoomJoinedPayload,
  RoomLeftPayload,
  RoomUsersPayload,
  RoomErrorPayload,
  ErrorPayload,
} from './types';
import { DEFAULT_SYNC_SETTINGS, DEFAULT_NETWORK_SYNC_CONFIG, USER_COLORS } from './types';

export class NetworkSyncManager extends EventEmitter<NetworkSyncEvents> {
  private wsClient: WebSocketClient;
  private stateManager: SyncStateManager;
  private config: NetworkSyncConfig;

  private _connectionState: ConnectionState = 'disconnected';
  private _roomInfo: RoomInfo | null = null;
  private _userId: string = '';
  private _userName: string = 'User';
  private _syncSettings: SyncSettings = { ...DEFAULT_SYNC_SETTINGS };
  private _disposed = false;

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
   * Get the SyncStateManager for testing/external use.
   */
  getSyncStateManager(): SyncStateManager {
    return this.stateManager;
  }

  // ---- Room Management ----

  /**
   * Create a new sync room.
   */
  createRoom(userName?: string): void {
    if (this._connectionState !== 'disconnected' && this._connectionState !== 'error') return;

    if (userName) this._userName = userName;

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
  joinRoom(roomCode: string, userName?: string): void {
    if (this._connectionState !== 'disconnected' && this._connectionState !== 'error') return;

    if (!isValidRoomCode(roomCode)) {
      this.emit('error', { code: 'INVALID_CODE', message: 'Invalid room code format. Expected XXXX-XXXX.' });
      return;
    }

    if (userName) this._userName = userName;

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
   * Request full state sync from server/host (after reconnection).
   */
  requestStateSync(): void {
    if (!this.isConnected || !this._roomInfo) return;

    const message = createStateRequestMessage(this._roomInfo.roomId, this._userId, {
      requestId: generateMessageId(),
    });
    this.wsClient.send(message);
  }

  // ---- Private: WebSocket Event Handling ----

  private setupWebSocketEvents(): void {
    const unsub1 = this.wsClient.on('message', (message) => this.handleMessage(message));

    const unsub2 = this.wsClient.on('disconnected', ({ code, reason }) => {
      if (this._connectionState === 'connected') {
        this.setConnectionState('reconnecting');
        this.emit('toastMessage', {
          message: 'Connection lost. Reconnecting...',
          type: 'warning',
        });
      }
    });

    const unsub3 = this.wsClient.on('reconnecting', ({ attempt, maxAttempts }) => {
      this.setConnectionState('reconnecting');
    });

    const unsub4 = this.wsClient.on('reconnected', () => {
      this.setConnectionState('connected');
      this.emit('toastMessage', {
        message: 'Reconnected successfully',
        type: 'success',
      });
      // Request full state sync after reconnection
      this.requestStateSync();
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
      message.type === 'sync.state-response' ||
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
  }

  private handleRoomLeft(payload: RoomLeftPayload): void {
    if (!this._roomInfo) return;

    const leavingUser = this._roomInfo.users.find(u => u.id === payload.userId);
    if (leavingUser) {
      this._roomInfo.users = this._roomInfo.users.filter(u => u.id !== payload.userId);
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
    this._roomInfo = null;
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
      color: USER_COLORS[this._roomInfo.users.length % USER_COLORS.length],
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

    this.wsClient.dispose();
    this.stateManager.reset();
    this.removeAllListeners();
  }
}
