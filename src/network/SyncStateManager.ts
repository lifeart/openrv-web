/**
 * SyncStateManager - State synchronization logic
 *
 * Handles:
 * - Local and remote state tracking
 * - Conflict detection and resolution (host authority / last-write-wins)
 * - Latency compensation via frame prediction
 * - Frame sync threshold to avoid jitter
 */

import type {
  PlaybackSyncPayload,
  ViewSyncPayload,
  ColorSyncPayload,
  SyncSettings,
} from './types';
import { DEFAULT_SYNC_SETTINGS } from './types';

// ---- Conflict Resolution Strategy ----

export type ConflictStrategy = 'last-write-wins' | 'host-authority';

// ---- State Snapshots ----

export interface PlaybackState {
  isPlaying: boolean;
  currentFrame: number;
  playbackSpeed: number;
  playDirection: number;
  loopMode: string;
  timestamp: number;
}

export interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
  channelMode: string;
}

export interface ColorState {
  exposure: number;
  gamma: number;
  saturation: number;
  contrast: number;
  temperature: number;
  tint: number;
  brightness: number;
}

const DEFAULT_PLAYBACK_STATE: PlaybackState = {
  isPlaying: false,
  currentFrame: 0,
  playbackSpeed: 1,
  playDirection: 1,
  loopMode: 'loop',
  timestamp: 0,
};

const DEFAULT_VIEW_STATE: ViewState = {
  panX: 0,
  panY: 0,
  zoom: 1,
  channelMode: 'rgb',
};

const DEFAULT_COLOR_STATE: ColorState = {
  exposure: 0,
  gamma: 1,
  saturation: 1,
  contrast: 1,
  temperature: 0,
  tint: 0,
  brightness: 0,
};

export class SyncStateManager {
  private _localPlayback: PlaybackState = { ...DEFAULT_PLAYBACK_STATE };
  private _remotePlayback: PlaybackState = { ...DEFAULT_PLAYBACK_STATE };
  private _localView: ViewState = { ...DEFAULT_VIEW_STATE };
  private _remoteView: ViewState = { ...DEFAULT_VIEW_STATE };
  private _localColor: ColorState = { ...DEFAULT_COLOR_STATE };
  private _remoteColor: ColorState = { ...DEFAULT_COLOR_STATE };

  private _isHost = false;
  private _rtt = 0;
  private _frameSyncThreshold = 2;
  private _syncSettings: SyncSettings = { ...DEFAULT_SYNC_SETTINGS };

  // Flag to suppress outgoing sync messages when applying remote state
  private _applyingRemoteState = false;

  constructor(frameSyncThreshold?: number) {
    if (frameSyncThreshold !== undefined) {
      this._frameSyncThreshold = frameSyncThreshold;
    }
  }

  // ---- Public Getters ----

  get isHost(): boolean {
    return this._isHost;
  }

  get isApplyingRemoteState(): boolean {
    return this._applyingRemoteState;
  }

  get syncSettings(): SyncSettings {
    return { ...this._syncSettings };
  }

  get localPlayback(): PlaybackState {
    return { ...this._localPlayback };
  }

  get remotePlayback(): PlaybackState {
    return { ...this._remotePlayback };
  }

  get localView(): ViewState {
    return { ...this._localView };
  }

  get remoteView(): ViewState {
    return { ...this._remoteView };
  }

  get localColor(): ColorState {
    return { ...this._localColor };
  }

  get remoteColor(): ColorState {
    return { ...this._remoteColor };
  }

  // ---- Configuration ----

  setHost(isHost: boolean): void {
    this._isHost = isHost;
  }

  setRTT(rtt: number): void {
    this._rtt = rtt;
  }

  setSyncSettings(settings: SyncSettings): void {
    this._syncSettings = { ...settings };
  }

  setFrameSyncThreshold(threshold: number): void {
    this._frameSyncThreshold = threshold;
  }

  // ---- Local State Updates ----

  updateLocalPlayback(state: Partial<PlaybackState>): void {
    this._localPlayback = {
      ...this._localPlayback,
      ...state,
      timestamp: state.timestamp ?? Date.now(),
    };
  }

  updateLocalView(state: Partial<ViewState>): void {
    this._localView = { ...this._localView, ...state };
  }

  updateLocalColor(state: Partial<ColorState>): void {
    this._localColor = { ...this._localColor, ...state };
  }

  // ---- Remote State Updates ----

  updateRemotePlayback(payload: PlaybackSyncPayload): void {
    this._remotePlayback = {
      isPlaying: payload.isPlaying,
      currentFrame: payload.currentFrame,
      playbackSpeed: payload.playbackSpeed,
      playDirection: payload.playDirection,
      loopMode: payload.loopMode,
      timestamp: payload.timestamp,
    };
  }

  updateRemoteView(payload: ViewSyncPayload): void {
    this._remoteView = {
      panX: payload.panX,
      panY: payload.panY,
      zoom: payload.zoom,
      channelMode: payload.channelMode,
    };
  }

  updateRemoteColor(payload: ColorSyncPayload): void {
    this._remoteColor = {
      exposure: payload.exposure,
      gamma: payload.gamma,
      saturation: payload.saturation,
      contrast: payload.contrast,
      temperature: payload.temperature,
      tint: payload.tint,
      brightness: payload.brightness,
    };
  }

  // ---- Conflict Detection ----

  /**
   * Check if the local and remote playback states conflict.
   * A conflict occurs when both sides have diverged since the last sync.
   */
  hasPlaybackConflict(): boolean {
    const local = this._localPlayback;
    const remote = this._remotePlayback;

    // Different play/pause states
    if (local.isPlaying !== remote.isPlaying) return true;

    // Different frames beyond threshold
    if (Math.abs(local.currentFrame - remote.currentFrame) > this._frameSyncThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Check if the local and remote view states conflict.
   */
  hasViewConflict(): boolean {
    const local = this._localView;
    const remote = this._remoteView;

    return (
      local.panX !== remote.panX ||
      local.panY !== remote.panY ||
      local.zoom !== remote.zoom ||
      local.channelMode !== remote.channelMode
    );
  }

  // ---- Conflict Resolution ----

  /**
   * Resolve a playback conflict using host-authority strategy.
   * Returns the winning state.
   */
  resolvePlaybackConflict(strategy: ConflictStrategy = 'host-authority'): PlaybackState {
    if (strategy === 'host-authority') {
      // Host always wins for playback
      return this._isHost
        ? { ...this._localPlayback }
        : { ...this._remotePlayback };
    }

    // Last-write-wins: use the more recent timestamp
    if (this._localPlayback.timestamp >= this._remotePlayback.timestamp) {
      return { ...this._localPlayback };
    }
    return { ...this._remotePlayback };
  }

  /**
   * Resolve a view conflict using last-write-wins strategy.
   */
  resolveViewConflict(strategy: ConflictStrategy = 'last-write-wins'): ViewState {
    // For view state, last-write-wins is the default
    if (strategy === 'host-authority') {
      return this._isHost
        ? { ...this._localView }
        : { ...this._remoteView };
    }
    // For LWW with no timestamps on view state, defer to remote
    return { ...this._remoteView };
  }

  // ---- Latency Compensation ----

  /**
   * Predict the current frame position based on playback state and RTT.
   * This accounts for network latency when syncing frame positions.
   */
  predictFrame(state: PlaybackState, fps: number): number {
    if (!state.isPlaying || fps === 0) {
      return state.currentFrame;
    }

    // Calculate how many frames have elapsed since the timestamp
    // accounting for half the round-trip time (one-way latency)
    const elapsedMs = Date.now() - state.timestamp + (this._rtt / 2);
    const elapsedFrames = (elapsedMs / 1000) * fps * state.playbackSpeed * state.playDirection;

    return Math.round(state.currentFrame + elapsedFrames);
  }

  /**
   * Determine if a frame sync update should be applied.
   * Returns false if the difference is within the threshold (to avoid jitter).
   */
  shouldApplyFrameSync(localFrame: number, remoteFrame: number): boolean {
    return Math.abs(localFrame - remoteFrame) > this._frameSyncThreshold;
  }

  // ---- Apply Remote State ----

  /**
   * Begin applying remote state. Sets a flag to suppress outgoing sync.
   */
  beginApplyRemote(): void {
    this._applyingRemoteState = true;
  }

  /**
   * End applying remote state.
   */
  endApplyRemote(): void {
    this._applyingRemoteState = false;
  }

  /**
   * Should a sync update be applied based on current settings?
   */
  shouldSyncPlayback(): boolean {
    return this._syncSettings.playback;
  }

  shouldSyncView(): boolean {
    return this._syncSettings.view;
  }

  shouldSyncColor(): boolean {
    return this._syncSettings.color;
  }

  shouldSyncAnnotations(): boolean {
    return this._syncSettings.annotations;
  }

  shouldSyncCursor(): boolean {
    return this._syncSettings.cursor;
  }

  // ---- Reset ----

  reset(): void {
    this._localPlayback = { ...DEFAULT_PLAYBACK_STATE };
    this._remotePlayback = { ...DEFAULT_PLAYBACK_STATE };
    this._localView = { ...DEFAULT_VIEW_STATE };
    this._remoteView = { ...DEFAULT_VIEW_STATE };
    this._localColor = { ...DEFAULT_COLOR_STATE };
    this._remoteColor = { ...DEFAULT_COLOR_STATE };
    this._isHost = false;
    this._rtt = 0;
    this._applyingRemoteState = false;
    this._syncSettings = { ...DEFAULT_SYNC_SETTINGS };
  }
}
