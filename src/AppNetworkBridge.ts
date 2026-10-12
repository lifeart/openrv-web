/**
 * AppNetworkBridge - Extracts network sync wiring from App
 *
 * Handles bidirectional sync between Session/Viewer and
 * NetworkSyncManager/NetworkControl.
 */

import type { Session, MediaSource } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { PaintEngine } from './paint/PaintEngine';
import type { NetworkSyncManager } from './network/NetworkSyncManager';
import type { NetworkControl } from './ui/components/NetworkControl';
import type { ColorControls } from './ui/components/ColorControls';
import type { HeaderBar } from './ui/components/layout/HeaderBar';
import { type Annotation, isValidAnnotation } from './paint/types';
import type { Note } from './core/session/NoteManager';
import type { WipeMode } from './core/types/wipe';
import type {
  MediaTransferFileDescriptor,
  MediaTransferSourceDescriptor,
  AnnotationSyncPayload,
  NoteSyncPayload,
  ColorSyncPayload,
  CursorSyncPayload,
  PlaybackSyncPayload,
  ViewSyncPayload,
} from './network/types';
import type { RemoteCursorsOverlay } from './ui/components/RemoteCursorsOverlay';
import {
  buildShareURL,
  decodeSessionState,
  encodeSessionState,
  type SessionURLState,
} from './core/session/SessionURLManager';
import { decryptSessionStateWithPin, isValidPinCode } from './network/PinEncryption';
import { generateRoomSecret, withRoomLinkSecret } from './network/RoomCrypto';
import { createThrottle, type Throttled } from './utils/throttle';
import { showConfirm } from './ui/components/shared/Modal';

import { Logger } from './utils/Logger';

const logger = new Logger('AppNetworkBridge');
const MEDIA_CHUNK_SIZE_BYTES = 48 * 1024;
const MEDIA_TRANSFER_TIMEOUT_MS = 30_000;
/** How long a prepared outgoing transfer waits for the requester to accept. */
const MEDIA_OFFER_TIMEOUT_MS = 120_000;
/** Outgoing transfers the host serves at once, across all requesters. */
const MAX_CONCURRENT_OUTGOING_TRANSFERS = 2;
/** Largest offer a client will even ask its user about. */
const MAX_INCOMING_TRANSFER_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_INCOMING_TRANSFER_FILES = 20_000;
/** How often the host re-broadcasts playback state while playing. */
const PLAYBACK_HEARTBEAT_MS = 1000;
const VIEW_SYNC_THROTTLE_MS = 100;
const CURSOR_SYNC_THROTTLE_MS = 50;
/** Media URLs from peers are only followed over these schemes. */
const ALLOWED_REMOTE_MEDIA_PROTOCOLS = new Set(['http:', 'https:']);

interface PreparedMediaFile extends MediaTransferFileDescriptor {
  /** Read lazily, one chunk at a time, while streaming. */
  file: Blob;
}

interface PreparedMediaBundle {
  files: PreparedMediaFile[];
  sources: MediaTransferSourceDescriptor[];
  totalBytes: number;
}

interface OutgoingMediaTransfer {
  requesterUserId: string;
  /** Null while the host is still deciding whether to share. */
  bundle: PreparedMediaBundle | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
}

interface IncomingTransferFileState {
  descriptor: MediaTransferFileDescriptor;
  chunks: Map<number, Uint8Array>;
  receivedBytes: number;
  totalChunks: number | null;
}

interface IncomingMediaTransfer {
  senderUserId: string;
  files: Map<string, IncomingTransferFileState>;
  sources: MediaTransferSourceDescriptor[];
  totalBytes: number;
}

/**
 * Context interface for dependencies needed by the network bridge.
 */
export interface NetworkBridgeContext {
  session: Session;
  viewer: Viewer;
  paintEngine?: PaintEngine;
  colorControls?: ColorControls;
  networkSyncManager: NetworkSyncManager;
  networkControl: NetworkControl;
  headerBar: HeaderBar;
  remoteCursorsOverlay?: RemoteCursorsOverlay;
  getSessionURLState?: () => SessionURLState;
  applySessionURLState?: (state: SessionURLState) => void;
}

export class AppNetworkBridge {
  private ctx: NetworkBridgeContext;
  private unsubscribers: (() => void)[] = [];
  private pendingStateByTransferId = new Map<string, SessionURLState>();
  /** Media transfers this client asked for, keyed by transfer id, valued by the peer asked. */
  private requestedMediaTransfers = new Map<string, string>();
  /** Last note state exchanged with the room, used to send per-note changes. */
  private syncedNotes = new Map<string, Note>();
  private outgoingMediaTransfers = new Map<string, OutgoingMediaTransfer>();
  private incomingMediaTransfers = new Map<string, IncomingMediaTransfer>();
  private incomingTransferTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private colorSyncThrottle: Throttled<[ColorSyncPayload]> | null = null;
  private frameSyncThrottle: Throttled<[number]> | null = null;
  private lastPlaybackSyncFrame = -1;
  private lastPlaybackSyncTime = 0;
  private playbackHeartbeat: ReturnType<typeof setInterval> | null = null;
  private viewSyncThrottle: Throttled<[ViewSyncPayload]> | null = null;
  private cursorSyncThrottle: Throttled<[number, number]> | null = null;
  /** Last view state sent or applied, to suppress echoes and no-op resends. */
  private lastViewSync: { panX: number; panY: number; zoom: number } | null = null;
  /** Per-frame annotation state last exchanged with the room (id -> JSON). */
  private syncedAnnotations = new Map<number, Map<string, string>>();

  constructor(ctx: NetworkBridgeContext) {
    this.ctx = ctx;
  }

  /**
   * Setup network sync: wire NetworkControl UI to NetworkSyncManager,
   * and listen for incoming sync events to apply to Session/Viewer.
   */
  setup(): void {
    const { session, viewer, networkSyncManager, networkControl, headerBar } = this.ctx;
    const presenceOverlay = viewer.getPresenceOverlay();

    // Add NetworkControl to header bar
    headerBar.setNetworkControl(networkControl.render());

    // Wire UI events to manager
    this.unsubscribers.push(
      networkControl.on('createRoom', ({ userName }) => {
        // Every room gets a fresh end-to-end key.
        networkSyncManager.setRoomSecret(generateRoomSecret());
        networkSyncManager.createRoom(userName, this.getActivePinCode());
      }),
    );

    this.unsubscribers.push(
      networkControl.on('joinRoom', ({ roomCode, userName, roomSecret }) => {
        if (roomSecret) {
          networkSyncManager.setRoomSecret(roomSecret);
        }
        if (!networkSyncManager.roomSecret) {
          networkControl.showError(
            'Rooms are end-to-end encrypted, so the room code alone is not enough. Paste the full invite link instead.',
          );
          return;
        }
        networkSyncManager.joinRoom(roomCode, userName, this.getActivePinCode());
      }),
    );

    this.unsubscribers.push(
      networkControl.on('participantRoleChange', ({ userId, role }) => {
        networkSyncManager.setParticipantPermission(userId, role);
      }),
    );

    this.unsubscribers.push(
      networkControl.on('leaveRoom', () => {
        networkSyncManager.leaveRoom();
        networkControl.setConnectionState('disconnected');
        networkControl.setIsHost(false);
        networkControl.setShareLinkKind('generic');
        networkControl.setResponseToken('');
        networkControl.setRoomInfo(null);
        networkControl.setUsers([]);
        networkControl.hideInfo();
        presenceOverlay.setUsers([]);
        presenceOverlay.hide();
        this.ctx.paintEngine?.setIdPrefix('');
      }),
    );

    this.unsubscribers.push(
      networkControl.on('reconnect', () => {
        networkSyncManager.manualReconnect();
      }),
    );

    this.unsubscribers.push(
      networkControl.on('syncSettingsChanged', (settings) => {
        networkSyncManager.setSyncSettings(settings);
      }),
    );

    this.unsubscribers.push(
      networkControl.on('copyLink', async (baseLink) => {
        try {
          const roomCode = networkSyncManager.roomInfo?.roomCode ?? '';
          const fallbackBase = roomCode ? this.buildRoomLink(roomCode) : baseLink;
          let shareLink = baseLink.trim() || fallbackBase;

          const hasSessionHash = this.hasSessionShareState(shareLink);
          if (!hasSessionHash) {
            const state = this.ctx.getSessionURLState?.() ?? this.captureSessionURLState();
            shareLink = buildShareURL(shareLink, state);
          }
          shareLink = this.withRoomSecret(shareLink);

          const controlWithShare = networkControl as unknown as { setShareLink?: (url: string) => void };

          // Update the share link immediately with session state hash,
          // before attempting WebRTC offer generation which may be slow or fail.
          controlWithShare.setShareLink?.(shareLink);

          const managerWithServerless = networkSyncManager as unknown as {
            buildServerlessInviteShareURL?: (url: string) => Promise<string>;
          };
          if (networkSyncManager.isHost && typeof managerWithServerless.buildServerlessInviteShareURL === 'function') {
            shareLink = this.withRoomSecret(await managerWithServerless.buildServerlessInviteShareURL(shareLink));
            // Update again with the WebRTC offer token appended
            controlWithShare.setShareLink?.(shareLink);
          }
          await navigator.clipboard.writeText(shareLink);
          networkControl.reportCopyResult(true);
        } catch (error) {
          if (error instanceof Error && /clipboard/i.test(error.message)) {
            networkControl.reportCopyResult(
              false,
              'Clipboard unavailable. Copy Share URL from the Network Sync panel.',
            );
            return;
          }
          networkControl.reportCopyResult(
            false,
            `Failed to generate share URL: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }),
    );

    this.unsubscribers.push(
      networkControl.on('applyResponseLink', async (responseLink) => {
        const managerWithServerless = networkSyncManager as unknown as {
          applyServerlessResponseLink?: (value: string) => Promise<boolean>;
        };
        if (typeof managerWithServerless.applyServerlessResponseLink !== 'function') return;

        const applied = await managerWithServerless.applyServerlessResponseLink(responseLink);
        if (!applied) {
          networkControl.showError('Invalid WebRTC response link or no pending invite.');
          return;
        }
        networkControl.hideError();
        networkControl.showInfo('Guest response applied. WebRTC peer is connecting.');
      }),
    );

    // One-time state sync after join/reconnect
    this.unsubscribers.push(
      networkSyncManager.on('sessionStateRequested', async ({ requestId, requesterUserId }) => {
        if (!networkSyncManager.isHost) return;

        const encodedState = encodeSessionState(this.ctx.getSessionURLState?.() ?? this.captureSessionURLState());

        // Capture annotations and notes for full state transfer. The whole
        // response (like all peer traffic) is sealed with the room key.
        const paintSnapshot = this.ctx.paintEngine?.toJSON();
        const annotations = paintSnapshot ? Object.values(paintSnapshot.frames).flat() : undefined;
        const notes = session.noteManager.toSerializable();

        networkSyncManager.sendSessionStateResponse(requestId, requesterUserId, {
          sessionState: encodedState,
          annotations,
          notes,
        });
        networkSyncManager.broadcastParticipantPermissions();
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('sessionStateReceived', async (payload) => {
        let encodedState = payload.sessionState;

        if (!encodedState && payload.encryptedSessionState) {
          const pinCode = this.getActivePinCode();
          if (!isValidPinCode(pinCode)) {
            networkControl.showError('A valid PIN code is required to decrypt the synced session state.');
            return;
          }

          try {
            encodedState = await decryptSessionStateWithPin(payload.encryptedSessionState, pinCode);
          } catch (error) {
            networkControl.showError(
              `Failed to decrypt session state: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            return;
          }
        }

        if (!encodedState) return;
        const parsed = decodeSessionState(encodedState);
        if (!parsed) {
          networkControl.showError('Received an invalid session state payload.');
          return;
        }
        const decoded = sanitizeRemoteSessionState(parsed);

        if (this.shouldRequestMediaSync(decoded)) {
          const transferId = networkSyncManager.requestMediaSync(payload.senderUserId);
          if (transferId) {
            this.requestedMediaTransfers.set(transferId, payload.senderUserId);
            this.pendingStateByTransferId.set(transferId, decoded);
            this.applySharedSessionState(decoded);
            this.applyReceivedAnnotationsAndNotes(payload.annotations, payload.notes);
            return;
          }
        }

        this.applySharedSessionState(decoded);
        this.applyReceivedAnnotationsAndNotes(payload.annotations, payload.notes);
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('mediaSyncRequested', async ({ transferId, requesterUserId }) => {
        if (!networkSyncManager.isHost) return;
        if (this.outgoingMediaTransfers.has(transferId)) return;
        // One transfer per requester, and a small global cap, so repeated
        // requests cannot pile up copies of the host's media.
        for (const transfer of this.outgoingMediaTransfers.values()) {
          if (transfer.requesterUserId === requesterUserId) return;
        }
        if (this.outgoingMediaTransfers.size >= MAX_CONCURRENT_OUTGOING_TRANSFERS) {
          networkSyncManager.sendMediaOffer(transferId, requesterUserId, { totalBytes: 0, files: [], sources: [] });
          networkSyncManager.sendMediaComplete(transferId, requesterUserId);
          return;
        }

        const transfer: OutgoingMediaTransfer = { requesterUserId, bundle: null, expiryTimer: null };
        this.outgoingMediaTransfers.set(transferId, transfer);

        try {
          const bundle = await this.captureLocalMediaBundle();
          const allowed = await this.confirmMediaShare(requesterUserId, bundle);
          if (this.outgoingMediaTransfers.get(transferId) !== transfer) return;
          if (!allowed) {
            this.releaseOutgoingTransfer(transferId);
            networkSyncManager.sendMediaOffer(transferId, requesterUserId, { totalBytes: 0, files: [], sources: [] });
            networkSyncManager.sendMediaComplete(transferId, requesterUserId);
            return;
          }
          transfer.bundle = bundle;
          transfer.expiryTimer = setTimeout(() => this.releaseOutgoingTransfer(transferId), MEDIA_OFFER_TIMEOUT_MS);

          networkSyncManager.sendMediaOffer(transferId, requesterUserId, {
            totalBytes: bundle.totalBytes,
            files: bundle.files.map(({ id, name, type, size, lastModified }) => ({
              id,
              name,
              type,
              size,
              lastModified,
            })),
            sources: bundle.sources,
          });
        } catch (error) {
          this.releaseOutgoingTransfer(transferId);
          networkControl.showError(
            `Failed to prepare media transfer: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
          networkSyncManager.sendMediaOffer(transferId, requesterUserId, {
            totalBytes: 0,
            files: [],
            sources: [],
          });
          networkSyncManager.sendMediaComplete(transferId, requesterUserId);
        }
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('mediaSyncOffered', async ({ transferId, senderUserId, totalBytes, files, sources }) => {
        // Only offers answering our own request, from the peer we asked.
        if (this.requestedMediaTransfers.get(transferId) !== senderUserId) return;
        this.requestedMediaTransfers.delete(transferId);
        if (this.incomingMediaTransfers.has(transferId)) return;

        const declaredBytes = files.reduce((sum, file) => sum + file.size, 0);
        const withinLimits =
          files.length <= MAX_INCOMING_TRANSFER_FILES &&
          totalBytes <= MAX_INCOMING_TRANSFER_BYTES &&
          declaredBytes <= MAX_INCOMING_TRANSFER_BYTES;
        const accepted = withinLimits && (await this.confirmMediaSync(totalBytes, files.length));
        networkSyncManager.sendMediaResponse(transferId, senderUserId, accepted);

        if (!accepted) {
          const pendingState = this.pendingStateByTransferId.get(transferId);
          if (pendingState) {
            this.applySharedSessionState(pendingState);
            this.pendingStateByTransferId.delete(transferId);
          }
          return;
        }

        const incomingFiles = new Map<string, IncomingTransferFileState>();
        files.forEach((descriptor) => {
          incomingFiles.set(descriptor.id, {
            descriptor,
            chunks: new Map(),
            receivedBytes: 0,
            totalChunks: null,
          });
        });

        this.incomingMediaTransfers.set(transferId, {
          senderUserId,
          files: incomingFiles,
          sources,
          totalBytes,
        });

        this.startTransferTimeout(transferId);
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('mediaSyncResponded', ({ transferId, senderUserId, accepted }) => {
        const transfer = this.outgoingMediaTransfers.get(transferId);
        if (!transfer) return;
        if (transfer.requesterUserId !== senderUserId) return;

        if (!accepted || !transfer.bundle) {
          this.releaseOutgoingTransfer(transferId);
          return;
        }

        if (transfer.expiryTimer) {
          clearTimeout(transfer.expiryTimer);
          transfer.expiryTimer = null;
        }
        void this.streamOutgoingMediaTransfer(transferId, transfer, transfer.bundle);
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('mediaSyncChunkReceived', (payload) => {
        const transfer = this.incomingMediaTransfers.get(payload.transferId);
        if (!transfer || transfer.senderUserId !== payload.senderUserId) return;

        const fileState = transfer.files.get(payload.fileId);
        if (!fileState) return;

        const expectedChunks = Math.max(1, Math.ceil(fileState.descriptor.size / MEDIA_CHUNK_SIZE_BYTES));
        if (payload.totalChunks !== expectedChunks) return;
        fileState.totalChunks = expectedChunks;
        if (payload.chunkIndex < 0 || payload.chunkIndex >= payload.totalChunks) return;
        if (fileState.chunks.has(payload.chunkIndex)) return;

        let bytes: Uint8Array;
        try {
          bytes = this.base64ToBytes(payload.data);
        } catch (error) {
          logger.warn('Dropped malformed media chunk', { error });
          return;
        }
        // Never hold more than the size the sender declared up front.
        if (bytes.byteLength > MEDIA_CHUNK_SIZE_BYTES) return;
        if (fileState.receivedBytes + bytes.byteLength > fileState.descriptor.size) return;

        fileState.chunks.set(payload.chunkIndex, bytes);
        fileState.receivedBytes += bytes.byteLength;

        this.startTransferTimeout(payload.transferId);
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('mediaSyncCompleted', async ({ transferId, senderUserId }) => {
        const transfer = this.incomingMediaTransfers.get(transferId);
        const pendingState = this.pendingStateByTransferId.get(transferId);

        try {
          if (transfer && transfer.senderUserId === senderUserId) {
            await this.importIncomingMediaTransfer(transfer);
          }
        } catch (error) {
          networkControl.showError(
            `Failed to import synced media: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        } finally {
          this.clearTransferTimeout(transferId);
          this.incomingMediaTransfers.delete(transferId);
          this.pendingStateByTransferId.delete(transferId);
        }

        if (pendingState) {
          this.applySharedSessionState(pendingState);
        }
      }),
    );

    // Wire manager events to UI
    this.unsubscribers.push(
      networkSyncManager.on('connectionStateChanged', (state) => {
        networkControl.setConnectionState(state);
        if (state !== 'connected' && state !== 'conflict') {
          networkControl.setIsHost(false);
          presenceOverlay.hide();
        } else {
          networkControl.setIsHost(networkSyncManager.isHost);
          presenceOverlay.show();
        }
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('roomCreated', (info) => {
        networkControl.setLocalUserId(networkSyncManager.userId);
        networkControl.setIsHost(true);
        networkControl.setShareLinkKind('invite');
        networkControl.setResponseToken('');
        networkControl.hideInfo();
        networkControl.setRoomInfo(info);
        networkControl.setUsers(info.users);
        presenceOverlay.setUsers(info.users);
        presenceOverlay.show();
        this.ctx.paintEngine?.setIdPrefix(networkSyncManager.userId);
        void this.refreshShareLinkPreview();
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('roomJoined', (info) => {
        networkControl.setLocalUserId(networkSyncManager.userId);
        networkControl.setIsHost(networkSyncManager.isHost);
        networkControl.setShareLinkKind(networkSyncManager.isHost ? 'invite' : 'generic');
        networkControl.setRoomInfo(info);
        networkControl.setUsers(info.users);
        presenceOverlay.setUsers(info.users);
        presenceOverlay.show();
        this.ctx.paintEngine?.setIdPrefix(networkSyncManager.userId);
        void this.refreshShareLinkPreview();
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('usersChanged', (users) => {
        networkControl.setUsers(users);
        presenceOverlay.setUsers(users);
        void this.refreshShareLinkPreview();
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('error', (err) => {
        networkControl.showError(err.message);
      }),
    );

    // Wire participant permission changes to NetworkControl UI
    this.unsubscribers.push(
      networkSyncManager.on('participantPermissionChanged', (permission) => {
        networkControl.setParticipantPermission(permission);
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('rttUpdated', (rtt) => {
        networkControl.setRTT(rtt);
      }),
    );

    // Wire toast messages to NetworkControl UI
    this.unsubscribers.push(
      networkSyncManager.on('toastMessage', ({ message, type }) => {
        if (type === 'error') {
          networkControl.showError(message);
        } else {
          networkControl.showInfo(message);
        }
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('reconnectExhausted', () => {
        networkControl.setReconnectExhausted(true);
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('roomLeft', () => {
        networkControl.setLocalUserId(null);
        networkControl.setConnectionState('disconnected');
        networkControl.setIsHost(false);
        networkControl.setShareLinkKind('generic');
        networkControl.setResponseToken('');
        networkControl.setRoomInfo(null);
        networkControl.setUsers([]);
        networkControl.hideInfo();
        this.ctx.paintEngine?.setIdPrefix('');
      }),
    );

    // Wire incoming sync events to Session/Viewer
    this.unsubscribers.push(
      networkSyncManager.on('syncPlayback', (payload) => {
        const sm = networkSyncManager.getSyncStateManager();
        sm.beginApplyRemote();
        try {
          if (session.playbackSpeed !== payload.playbackSpeed) {
            session.playbackSpeed = payload.playbackSpeed;
          }
          if (payload.playbackMode && session.playbackMode !== payload.playbackMode) {
            session.playbackMode = payload.playbackMode;
          }
          if (payload.loopMode && session.loopMode !== payload.loopMode) {
            session.loopMode = payload.loopMode;
          }
          if (
            (payload.playDirection === 1 || payload.playDirection === -1) &&
            session.playDirection !== payload.playDirection
          ) {
            session.togglePlayDirection();
          }
          if (typeof payload.inPoint === 'number' && session.inPoint !== payload.inPoint) {
            session.setInPoint(payload.inPoint);
          }
          if (typeof payload.outPoint === 'number' && session.outPoint !== payload.outPoint) {
            session.setOutPoint(payload.outPoint);
          }
          if (payload.isPlaying && !session.isPlaying) {
            session.play();
          } else if (!payload.isPlaying && session.isPlaying) {
            session.pause();
          }
          // Compensate for one-way latency. The sender's clock is not
          // comparable to ours, so only the measured RTT is used.
          const target = this.predictRemoteFrame(payload);
          if (sm.shouldApplyFrameSync(session.currentFrame, target)) {
            session.goToFrame(target);
          }
        } finally {
          sm.endApplyRemote();
        }
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('syncFrame', (payload) => {
        const sm = networkSyncManager.getSyncStateManager();
        if (sm.shouldApplyFrameSync(session.currentFrame, payload.currentFrame)) {
          sm.beginApplyRemote();
          try {
            session.goToFrame(payload.currentFrame);
          } finally {
            sm.endApplyRemote();
          }
        }
      }),
    );

    this.unsubscribers.push(
      networkSyncManager.on('syncView', (payload) => {
        const sm = networkSyncManager.getSyncStateManager();
        sm.beginApplyRemote();
        try {
          this.lastViewSync = { panX: payload.panX, panY: payload.panY, zoom: payload.zoom };
          viewer.setZoom(payload.zoom);
          if (Number.isFinite(payload.panX) && Number.isFinite(payload.panY)) {
            const withPan = viewer as unknown as { setPan?: (x: number, y: number) => void };
            withPan.setPan?.(payload.panX, payload.panY);
          }
        } finally {
          sm.endApplyRemote();
        }
      }),
    );

    // Wire incoming color sync
    this.unsubscribers.push(
      networkSyncManager.on('syncColor', (payload: ColorSyncPayload) => {
        const sm = networkSyncManager.getSyncStateManager();
        sm.beginApplyRemote();
        try {
          const current = viewer.getColorAdjustments();
          viewer.setColorAdjustments({
            ...current,
            exposure: payload.exposure,
            gamma: payload.gamma,
            saturation: payload.saturation,
            contrast: payload.contrast,
            temperature: payload.temperature,
            tint: payload.tint,
            brightness: payload.brightness,
          });
        } finally {
          sm.endApplyRemote();
        }
      }),
    );

    // Wire outgoing color sync when local color adjustments change
    const colorControls = this.ctx.colorControls;
    if (colorControls) {
      this.colorSyncThrottle = createThrottle((payload: ColorSyncPayload) => {
        networkSyncManager.sendColorSync(payload);
      }, 100);

      this.unsubscribers.push(
        colorControls.on('adjustmentsChanged', (adjustments) => {
          if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
            this.colorSyncThrottle?.call({
              exposure: adjustments.exposure,
              gamma: adjustments.gamma,
              saturation: adjustments.saturation,
              contrast: adjustments.contrast,
              temperature: adjustments.temperature,
              tint: adjustments.tint,
              brightness: adjustments.brightness,
            });
          }
        }),
      );
    }

    // Wire incoming annotation sync
    const paintEngine = this.ctx.paintEngine;
    if (paintEngine) {
      this.unsubscribers.push(
        networkSyncManager.on('syncAnnotation', (payload: AnnotationSyncPayload) => {
          const sm = networkSyncManager.getSyncStateManager();
          sm.beginApplyRemote();
          try {
            switch (payload.action) {
              case 'add':
                for (const stroke of payload.strokes) {
                  if (isValidAnnotation(stroke)) {
                    paintEngine.addRemoteAnnotation(stroke);
                  }
                }
                break;
              case 'remove':
                if (payload.annotationId) {
                  paintEngine.removeRemoteAnnotation(payload.annotationId, payload.frame);
                }
                break;
              case 'clear':
                paintEngine.clearRemoteFrame(payload.frame);
                break;
              case 'update':
                // For updates, remove then re-add
                if (payload.annotationId) {
                  paintEngine.removeRemoteAnnotation(payload.annotationId, payload.frame);
                }
                for (const stroke of payload.strokes) {
                  if (isValidAnnotation(stroke)) {
                    paintEngine.addRemoteAnnotation(stroke);
                  }
                }
                break;
            }
          } finally {
            sm.endApplyRemote();
          }
        }),
      );

      // Send outgoing annotation sync whenever a frame's annotations change:
      // new strokes, erasing, clearing a frame, editing a shape, undo and redo.
      // Each change is sent per annotation so concurrent work by others on
      // the same frame is kept.
      this.unsubscribers.push(
        paintEngine.on('annotationsChanged', (frame: number) => {
          const current = this.snapshotAnnotationFrame(frame);
          if (!networkSyncManager.isConnected || networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
            this.syncedAnnotations.set(frame, current);
            return;
          }
          this.sendAnnotationChanges(frame, current);
        }),
      );
      this.unsubscribers.push(networkSyncManager.on('roomCreated', () => this.rememberSyncedAnnotations()));
      this.unsubscribers.push(networkSyncManager.on('roomJoined', () => this.rememberSyncedAnnotations()));
    }

    // Wire incoming note sync
    this.unsubscribers.push(
      networkSyncManager.on('syncNote', (payload: NoteSyncPayload) => {
        const sm = networkSyncManager.getSyncStateManager();
        sm.beginApplyRemote();
        try {
          const noteManager = session.noteManager;
          switch (payload.action) {
            case 'add': {
              // importNote never overwrites an existing note, so a peer
              // cannot replace someone else's note (or its author) this way.
              if (isValidNote(payload.note)) {
                noteManager.importNote(payload.note);
              }
              break;
            }
            case 'remove':
              if (typeof payload.noteId === 'string') {
                noteManager.removeNote(payload.noteId);
              }
              break;
            case 'update': {
              const note = payload.note as Partial<Note> | undefined;
              if (typeof payload.noteId === 'string' && note && typeof note === 'object') {
                // Only content fields; id, author and timestamps of the
                // original note are kept.
                noteManager.updateNote(payload.noteId, pickNoteUpdate(note));
              }
              break;
            }
            case 'clear':
              noteManager.fromSerializable([]);
              break;
            case 'snapshot':
              // Host-only (enforced by NetworkSyncManager); keeps each note's author.
              if (Array.isArray(payload.notes)) {
                noteManager.fromSerializable(payload.notes.filter(isValidNote));
              }
              break;
          }
        } finally {
          sm.endApplyRemote();
          this.rememberSyncedNotes();
        }
      }),
    );

    // Send outgoing note sync when notes change: one operation per changed
    // note, so concurrent edits to different notes don't overwrite each other.
    this.unsubscribers.push(
      session.on('notesChanged', () => {
        if (networkSyncManager.getSyncStateManager().isApplyingRemoteState) return;
        if (!networkSyncManager.isConnected) {
          this.rememberSyncedNotes();
          return;
        }
        this.sendNoteChanges();
      }),
    );

    // Start each room from the notes we have now.
    this.unsubscribers.push(networkSyncManager.on('roomCreated', () => this.rememberSyncedNotes()));
    this.unsubscribers.push(networkSyncManager.on('roomJoined', () => this.rememberSyncedNotes()));

    // Wire remote cursors overlay
    const remoteCursorsOverlay = this.ctx.remoteCursorsOverlay;
    if (remoteCursorsOverlay) {
      // Activate/deactivate overlay on connection state changes
      this.unsubscribers.push(
        networkSyncManager.on('connectionStateChanged', (state) => {
          remoteCursorsOverlay.setActive(state === 'connected');
        }),
      );

      // Forward user list to overlay for name/color lookup
      this.unsubscribers.push(
        networkSyncManager.on('usersChanged', (users) => {
          remoteCursorsOverlay.setUsers(users);
        }),
      );

      // Forward room created/joined user lists
      this.unsubscribers.push(
        networkSyncManager.on('roomCreated', (info) => {
          remoteCursorsOverlay.setUsers(info.users);
          remoteCursorsOverlay.setActive(true);
        }),
      );

      this.unsubscribers.push(
        networkSyncManager.on('roomJoined', (info) => {
          remoteCursorsOverlay.setUsers(info.users);
          remoteCursorsOverlay.setActive(true);
        }),
      );

      // Clear overlay on room leave
      this.unsubscribers.push(
        networkSyncManager.on('roomLeft', () => {
          remoteCursorsOverlay.setActive(false);
        }),
      );

      // Remove individual cursor on user leave
      this.unsubscribers.push(
        networkSyncManager.on('userLeft', (user) => {
          remoteCursorsOverlay.removeCursor(user.id);
        }),
      );

      // Forward incoming cursor sync to the overlay
      this.unsubscribers.push(
        networkSyncManager.on('syncCursor', (payload: CursorSyncPayload) => {
          remoteCursorsOverlay.updateCursor(payload);
        }),
      );
    }

    // Send outgoing view (pan/zoom) changes
    const viewerWithListeners = viewer as unknown as {
      addViewChangeListener?: (cb: (panX: number, panY: number, zoom: number) => void) => () => void;
      getChannelMode?: () => string;
      getContainer?: () => HTMLElement;
    };
    if (typeof viewerWithListeners.addViewChangeListener === 'function') {
      this.viewSyncThrottle = createThrottle((payload: ViewSyncPayload) => {
        networkSyncManager.sendViewSync(payload);
      }, VIEW_SYNC_THROTTLE_MS);
      this.unsubscribers.push(
        viewerWithListeners.addViewChangeListener((panX, panY, zoom) => {
          if (!networkSyncManager.isConnected || networkSyncManager.getSyncStateManager().isApplyingRemoteState) return;
          const last = this.lastViewSync;
          if (last && last.panX === panX && last.panY === panY && last.zoom === zoom) return;
          this.lastViewSync = { panX, panY, zoom };
          this.viewSyncThrottle?.call({
            panX,
            panY,
            zoom,
            channelMode: viewerWithListeners.getChannelMode?.() ?? 'rgb',
          });
        }),
      );
    }

    // Send the local cursor position over the viewer (normalized 0..1)
    const viewerContainer = viewerWithListeners.getContainer?.();
    if (viewerContainer) {
      this.cursorSyncThrottle = createThrottle((x: number, y: number) => {
        networkSyncManager.sendCursorPosition(x, y);
      }, CURSOR_SYNC_THROTTLE_MS);
      const onPointerMove = (event: PointerEvent) => {
        if (!networkSyncManager.isConnected) return;
        const rect = viewerContainer.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        this.cursorSyncThrottle?.call(x, y);
      };
      viewerContainer.addEventListener('pointermove', onPointerMove);
      this.unsubscribers.push(() => viewerContainer.removeEventListener('pointermove', onPointerMove));
    }

    // Send outgoing sync when local state changes
    this.unsubscribers.push(
      session.on('playbackChanged', (isPlaying) => {
        if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
          this.lastPlaybackSyncFrame = session.currentFrame;
          this.lastPlaybackSyncTime = Date.now();
          networkSyncManager.sendPlaybackSync(this.capturePlaybackSync(isPlaying));
        }
      }),
    );

    // Loop mode, direction and in/out are part of the shared playback state.
    const sendPlaybackStateChange = () => {
      if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
        networkSyncManager.sendPlaybackSync(this.capturePlaybackSync());
      }
    };
    this.unsubscribers.push(session.on('loopModeChanged', sendPlaybackStateChange));
    this.unsubscribers.push(session.on('inOutChanged', sendPlaybackStateChange));
    this.unsubscribers.push(
      session.on('playDirectionChanged', () => {
        // Ping-pong bounces happen on every client by themselves.
        if (session.isPlaying && session.loopMode === 'pingpong') return;
        sendPlaybackStateChange();
      }),
    );

    // While playing, only the host keeps everyone aligned, with a periodic
    // heartbeat. Followers correct drift from it instead of every client
    // broadcasting its own frames and pulling the others backwards.
    this.playbackHeartbeat = setInterval(() => {
      if (!networkSyncManager.isConnected || !networkSyncManager.isHost || !session.isPlaying) return;
      if (networkSyncManager.getSyncStateManager().isApplyingRemoteState) return;
      networkSyncManager.sendPlaybackSync(this.capturePlaybackSync());
    }, PLAYBACK_HEARTBEAT_MS);

    this.frameSyncThrottle = createThrottle((frame: number) => {
      networkSyncManager.sendFrameSync(frame);
    }, 50);

    this.unsubscribers.push(
      session.on('frameChanged', (frame) => {
        // Frames advancing during playback are covered by the host heartbeat.
        if (session.isPlaying) return;
        if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
          // Skip if this frame was just sent via playbackChanged
          if (frame === this.lastPlaybackSyncFrame && Date.now() - this.lastPlaybackSyncTime < 50) {
            return;
          }
          this.frameSyncThrottle?.call(frame);
        }
      }),
    );
  }

  private capturePlaybackSync(isPlaying = this.ctx.session.isPlaying): PlaybackSyncPayload {
    const { session } = this.ctx;
    return {
      isPlaying,
      currentFrame: session.currentFrame,
      playbackSpeed: session.playbackSpeed,
      playDirection: session.playDirection,
      loopMode: session.loopMode,
      playbackMode: session.playbackMode,
      inPoint: session.inPoint,
      outPoint: session.outPoint,
      timestamp: Date.now(),
    };
  }

  /** Where the sender is now, given one-way latency, clamped to in/out. */
  private predictRemoteFrame(payload: PlaybackSyncPayload): number {
    const { session, networkSyncManager } = this.ctx;
    if (!payload.isPlaying) return payload.currentFrame;
    const sm = networkSyncManager.getSyncStateManager();
    const predicted = sm.predictFrame({ ...payload, timestamp: Date.now() }, session.fps);
    const low = typeof payload.inPoint === 'number' ? payload.inPoint : session.inPoint;
    const high = typeof payload.outPoint === 'number' ? payload.outPoint : session.outPoint;
    return high >= low ? Math.min(high, Math.max(low, predicted)) : predicted;
  }

  private snapshotAnnotationFrame(frame: number): Map<string, string> {
    const annotations = this.ctx.paintEngine?.toJSON().frames[frame] ?? [];
    return new Map(annotations.map((a) => [a.id, JSON.stringify(a)]));
  }

  private rememberSyncedAnnotations(): void {
    this.syncedAnnotations.clear();
    const frames = this.ctx.paintEngine?.toJSON().frames ?? {};
    for (const [frame, annotations] of Object.entries(frames)) {
      this.syncedAnnotations.set(Number(frame), new Map(annotations.map((a) => [a.id, JSON.stringify(a)])));
    }
  }

  private sendAnnotationChanges(frame: number, current: Map<string, string>): void {
    const { networkSyncManager } = this.ctx;
    const previous = this.syncedAnnotations.get(frame) ?? new Map<string, string>();
    const timestamp = Date.now();
    const added: Annotation[] = [];

    for (const [id, json] of current) {
      const before = previous.get(id);
      if (before === json) continue;
      const annotation = JSON.parse(json) as Annotation;
      if (before === undefined) {
        added.push(annotation);
      } else {
        networkSyncManager.sendAnnotationSync({
          frame,
          strokes: [annotation],
          action: 'update',
          annotationId: id,
          timestamp,
        });
      }
    }
    if (added.length > 0) {
      networkSyncManager.sendAnnotationSync({
        frame,
        strokes: added,
        action: 'add',
        annotationId: added.length === 1 ? added[0]?.id : undefined,
        timestamp,
      });
    }
    for (const id of previous.keys()) {
      if (!current.has(id)) {
        networkSyncManager.sendAnnotationSync({ frame, strokes: [], action: 'remove', annotationId: id, timestamp });
      }
    }
    this.syncedAnnotations.set(frame, current);
  }

  /** Add the room secret (and PIN flag) to a share link's fragment. */
  private withRoomSecret(link: string): string {
    const secret = this.ctx.networkSyncManager.roomSecret;
    if (!secret || !link) return link;
    return withRoomLinkSecret(link, secret, isValidPinCode(this.getActivePinCode()));
  }

  private rememberSyncedNotes(): void {
    this.syncedNotes = new Map(this.ctx.session.noteManager.toSerializable().map((note) => [note.id, note]));
  }

  private sendNoteChanges(): void {
    const { session, networkSyncManager } = this.ctx;
    const current = new Map(session.noteManager.toSerializable().map((note) => [note.id, note]));
    const timestamp = Date.now();

    for (const [id, note] of current) {
      const previous = this.syncedNotes.get(id);
      if (!previous) {
        networkSyncManager.sendNoteSync({ action: 'add', noteId: id, note, timestamp });
      } else if (!sameNoteContent(previous, note)) {
        networkSyncManager.sendNoteSync({ action: 'update', noteId: id, note: pickNoteUpdate(note), timestamp });
      }
    }
    for (const id of this.syncedNotes.keys()) {
      if (!current.has(id)) {
        networkSyncManager.sendNoteSync({ action: 'remove', noteId: id, timestamp });
      }
    }
    this.syncedNotes = current;
  }

  private getActivePinCode(): string {
    const controlWithPin = this.ctx.networkControl as unknown as { getPinCode?: () => string };
    const value = controlWithPin.getPinCode?.();
    return typeof value === 'string' ? value.trim() : '';
  }

  private async refreshShareLinkPreview(): Promise<void> {
    if (!this.ctx.networkSyncManager.isHost) return;

    const roomCode = this.ctx.networkSyncManager.roomInfo?.roomCode;
    if (!roomCode) return;

    try {
      const state = this.ctx.getSessionURLState?.() ?? this.captureSessionURLState();
      const base = this.buildRoomLink(roomCode);
      let shareLink = buildShareURL(base, state);

      const controlWithShare = this.ctx.networkControl as unknown as {
        setShareLink?: (url: string) => void;
        setShareLinkKind?: (kind: 'invite' | 'response' | 'generic') => void;
        setResponseToken?: (token: string) => void;
      };
      // Show a usable (keyed) link right away; the WebRTC offer can take seconds.
      controlWithShare.setShareLink?.(this.withRoomSecret(shareLink));

      const managerWithServerless = this.ctx.networkSyncManager as unknown as {
        buildServerlessInviteShareURL?: (url: string) => Promise<string>;
      };
      if (typeof managerWithServerless.buildServerlessInviteShareURL === 'function') {
        shareLink = await managerWithServerless.buildServerlessInviteShareURL(shareLink);
      }
      shareLink = this.withRoomSecret(shareLink);

      controlWithShare.setShareLinkKind?.('invite');
      controlWithShare.setResponseToken?.('');
      controlWithShare.setShareLink?.(shareLink);
    } catch (error) {
      // Keep existing share URL on preview update errors.
      logger.debug('share link preview update failed; keeping existing URL', { error });
    }
  }

  /** Room link without the PIN; the PIN is always shared separately. */
  private buildRoomLink(roomCode: string): string {
    const fallbackBase = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const url = new URL(fallbackBase);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', roomCode);
    return url.toString();
  }

  private hasSessionShareState(urlLike: string): boolean {
    const fallbackBase = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    try {
      const url = new URL(urlLike, fallbackBase);
      return url.hash.startsWith('#s=');
    } catch {
      return false;
    }
  }

  private applyReceivedAnnotationsAndNotes(annotations?: unknown[], notes?: unknown[]): void {
    const validAnnotations = Array.isArray(annotations) ? annotations.filter(isValidAnnotation) : [];
    const validNotes = Array.isArray(notes) ? notes.filter(isValidNote) : [];
    const paintEngine = validAnnotations.length > 0 ? this.ctx.paintEngine : undefined;
    const hasNotes = validNotes.length > 0;
    if (!paintEngine && !hasNotes) return;

    const sm = this.ctx.networkSyncManager.getSyncStateManager();
    sm.beginApplyRemote();
    try {
      if (paintEngine) {
        paintEngine.loadFromAnnotations(validAnnotations);
        this.rememberSyncedAnnotations();
      }
      if (hasNotes) {
        this.ctx.session.noteManager.fromSerializable(validNotes);
      }
    } finally {
      sm.endApplyRemote();
      this.rememberSyncedNotes();
    }
  }

  private applySharedSessionState(state: SessionURLState): void {
    if (this.ctx.applySessionURLState) {
      this.ctx.applySessionURLState(state);
      return;
    }
    this.applyCapturedSessionURLState(state);
  }

  private shouldRequestMediaSync(state: SessionURLState): boolean {
    return this.ctx.session.sourceCount === 0 && state.sourceIndex >= 0;
  }

  private async confirmMediaSync(totalBytes: number, fileCount: number): Promise<boolean> {
    if (fileCount <= 0) return true;

    const uiWithPrompt = this.ctx.networkControl as unknown as {
      promptMediaSyncConfirmation?: (options: { fileCount: number; totalBytes: number }) => Promise<boolean>;
    };

    if (typeof uiWithPrompt.promptMediaSyncConfirmation === 'function') {
      try {
        return await uiWithPrompt.promptMediaSyncConfirmation({ fileCount, totalBytes });
      } catch (error) {
        // fall through to browser confirm
        logger.warn('promptMediaSyncConfirmation failed; falling back to browser confirm', { error });
      }
    }

    const fileLabel = fileCount === 1 ? 'file' : 'files';
    const sizeLabel = this.formatByteSize(totalBytes);
    return await showConfirm(`Accept media sync?\n\nIncoming: ${fileCount} ${fileLabel} (${sizeLabel}).`);
  }

  /** Ask the host before any media leaves this machine. */
  private async confirmMediaShare(requesterUserId: string, bundle: PreparedMediaBundle): Promise<boolean> {
    const requester = this.ctx.networkSyncManager.users.find((user) => user.id === requesterUserId);
    const who = requester?.name ? `"${requester.name}"` : 'A participant';
    const fileLabel = bundle.files.length === 1 ? 'file' : 'files';
    return showConfirm(
      `${who} is asking for a copy of your media: ${bundle.files.length} ${fileLabel} (${this.formatByteSize(bundle.totalBytes)}).\n\nSend it?`,
      { title: 'Share media', confirmText: 'Send', cancelText: "Don't send" },
    );
  }

  private releaseOutgoingTransfer(transferId: string): void {
    const transfer = this.outgoingMediaTransfers.get(transferId);
    if (!transfer) return;
    if (transfer.expiryTimer) clearTimeout(transfer.expiryTimer);
    this.outgoingMediaTransfers.delete(transferId);
  }

  private async captureLocalMediaBundle(): Promise<PreparedMediaBundle> {
    const { session } = this.ctx;
    const files: PreparedMediaFile[] = [];
    const sources: MediaTransferSourceDescriptor[] = [];
    let totalBytes = 0;

    for (let index = 0; index < session.sourceCount; index++) {
      const source = session.getSourceByIndex(index);
      if (!source) continue;

      const sourceFiles = await this.captureSourceFiles(source);
      if (sourceFiles.length === 0) continue;

      const fileIds: string[] = [];
      for (const file of sourceFiles) {
        const id = `file-${files.length}`;
        files.push({
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified || Date.now(),
          file,
        });
        fileIds.push(id);
        totalBytes += file.size;
      }

      const kind: MediaTransferSourceDescriptor['kind'] =
        source.type === 'video' ? 'video' : source.type === 'sequence' ? 'sequence' : 'image';

      sources.push({
        kind,
        fileIds,
        fps: source.fps,
      });
    }

    if (files.length === 0 || sources.length === 0) {
      throw new Error('No transferable media found in the current session.');
    }

    return { files, sources, totalBytes };
  }

  private async captureSourceFiles(source: MediaSource): Promise<File[]> {
    if (source.type === 'sequence' && source.sequenceFrames && source.sequenceFrames.length > 0) {
      return source.sequenceFrames.map((frame) => frame.file);
    }

    if (source.type === 'image' || source.type === 'video') {
      const file = await this.resolveSourceFile(source);
      return file ? [file] : [];
    }

    return [];
  }

  private async resolveSourceFile(source: MediaSource): Promise<File | null> {
    const candidateUrl =
      source.url ||
      (source.element instanceof HTMLVideoElement
        ? source.element.currentSrc || source.element.src
        : source.element instanceof HTMLImageElement
          ? source.element.currentSrc || source.element.src
          : '');

    if (!candidateUrl) return null;

    try {
      const response = await fetch(candidateUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      const type = blob.type || (source.type === 'video' ? 'video/mp4' : 'application/octet-stream');
      return new File([blob], source.name || 'media', {
        type,
        lastModified: Date.now(),
      });
    } catch {
      return null;
    }
  }

  private async streamOutgoingMediaTransfer(
    transferId: string,
    transfer: OutgoingMediaTransfer,
    bundle: PreparedMediaBundle,
  ): Promise<void> {
    const { networkSyncManager, networkControl } = this.ctx;

    try {
      for (const file of bundle.files) {
        const totalChunks = Math.max(1, Math.ceil(file.size / MEDIA_CHUNK_SIZE_BYTES));
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          if (this.outgoingMediaTransfers.get(transferId) !== transfer || !networkSyncManager.isConnected) return;
          // Back-pressure: wait for the socket/data channel to drain before queueing more.
          await networkSyncManager.waitForSendCapacity();
          const start = chunkIndex * MEDIA_CHUNK_SIZE_BYTES;
          const end = Math.min(start + MEDIA_CHUNK_SIZE_BYTES, file.size);
          const chunkBytes = new Uint8Array(await file.file.slice(start, end).arrayBuffer());
          const data = this.bytesToBase64(chunkBytes);

          networkSyncManager.sendMediaChunk(transferId, transfer.requesterUserId, {
            fileId: file.id,
            chunkIndex,
            totalChunks,
            data,
          });
        }
      }

      networkSyncManager.sendMediaComplete(transferId, transfer.requesterUserId);
    } catch (error) {
      networkControl.showError(
        `Failed to send media transfer: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.releaseOutgoingTransfer(transferId);
    }
  }

  private async importIncomingMediaTransfer(transfer: IncomingMediaTransfer): Promise<void> {
    const assembledFiles = new Map<string, File>();

    for (const [fileId, state] of transfer.files.entries()) {
      if (state.totalChunks === null) {
        throw new Error(`Incomplete transfer for file "${state.descriptor.name}".`);
      }

      const parts: BlobPart[] = [];
      for (let i = 0; i < state.totalChunks; i++) {
        const chunk = state.chunks.get(i);
        if (!chunk) {
          throw new Error(`Missing chunk ${i + 1}/${state.totalChunks} for "${state.descriptor.name}".`);
        }
        parts.push(chunk as Uint8Array<ArrayBuffer>);
      }

      // Assemble from the per-chunk buffers; no single giant string or copy.
      const file = new File(parts, state.descriptor.name, {
        type: state.descriptor.type,
        lastModified: state.descriptor.lastModified,
      });
      assembledFiles.set(fileId, file);
    }

    const { session, networkSyncManager } = this.ctx;
    const sm = networkSyncManager.getSyncStateManager();
    sm.beginApplyRemote();
    try {
      for (const source of transfer.sources) {
        const files = source.fileIds
          .map((fileId) => assembledFiles.get(fileId))
          .filter((file): file is File => file instanceof File);
        const [firstFile] = files;
        if (!firstFile) continue;

        if (source.kind === 'sequence') {
          await session.loadSequence(files, source.fps);
        } else {
          await session.loadFile(firstFile);
        }
      }
    } finally {
      sm.endApplyRemote();
    }
  }

  private bytesToBase64(bytes: Uint8Array): string {
    if (bytes.byteLength === 0) return '';

    const chunkSize = 0x4000;
    const parts: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      let binary = '';
      for (const byte of chunk) {
        binary += String.fromCharCode(byte);
      }
      parts.push(binary);
    }
    return btoa(parts.join(''));
  }

  private base64ToBytes(encoded: string): Uint8Array {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private startTransferTimeout(transferId: string): void {
    this.clearTransferTimeout(transferId);
    const timer = setTimeout(() => {
      const transfer = this.incomingMediaTransfers.get(transferId);
      if (transfer) {
        logger.warn(
          `[AppNetworkBridge] Media transfer "${transferId}" timed out after ${MEDIA_TRANSFER_TIMEOUT_MS}ms — cleaning up leaked chunks.`,
        );
        this.incomingMediaTransfers.delete(transferId);
        this.pendingStateByTransferId.delete(transferId);
      }
      this.incomingTransferTimeouts.delete(transferId);
    }, MEDIA_TRANSFER_TIMEOUT_MS);
    this.incomingTransferTimeouts.set(transferId, timer);
  }

  private clearTransferTimeout(transferId: string): void {
    const existing = this.incomingTransferTimeouts.get(transferId);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.incomingTransferTimeouts.delete(transferId);
    }
  }

  private clearAllTransferTimeouts(): void {
    for (const timer of this.incomingTransferTimeouts.values()) {
      clearTimeout(timer);
    }
    this.incomingTransferTimeouts.clear();
  }

  private formatByteSize(bytes: number): string {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  private captureSessionURLState(): SessionURLState {
    const { session, viewer } = this.ctx;
    const wipeState = viewer.getWipeState();
    const source = session.currentSource;

    return {
      frame: session.currentFrame,
      fps: session.fps,
      inPoint: session.inPoint,
      outPoint: session.outPoint,
      sourceIndex: session.currentSourceIndex,
      sourceUrl: source?.url,
      sourceAIndex: session.sourceAIndex,
      sourceBIndex: session.sourceBIndex >= 0 ? session.sourceBIndex : undefined,
      currentAB: session.currentAB,
      transform: viewer.getTransform(),
      wipeMode: wipeState.mode,
      wipePosition: wipeState.position,
    };
  }

  private applyCapturedSessionURLState(state: SessionURLState): void {
    const { session, viewer, networkSyncManager } = this.ctx;
    const sm = networkSyncManager.getSyncStateManager();
    sm.beginApplyRemote();
    try {
      if (session.sourceCount > 0) {
        const sourceIndex = Math.max(0, Math.min(session.sourceCount - 1, state.sourceIndex));
        session.setCurrentSource(sourceIndex);
      }

      if (typeof state.sourceAIndex === 'number') {
        session.setSourceA(state.sourceAIndex);
      }
      if (typeof state.sourceBIndex === 'number') {
        session.setSourceB(state.sourceBIndex);
      }
      if (state.currentAB === 'A' || state.currentAB === 'B') {
        session.setCurrentAB(state.currentAB);
      }
      // Range and fps after the source switches, which adapt them to the new source.
      if (typeof state.fps === 'number' && state.fps > 0) {
        session.fps = state.fps;
      }
      if (typeof state.inPoint === 'number' || typeof state.outPoint === 'number') {
        session.setInOutRange(
          typeof state.inPoint === 'number' ? state.inPoint : session.inPoint,
          typeof state.outPoint === 'number' ? state.outPoint : session.outPoint,
        );
      }
      if (typeof state.frame === 'number') {
        session.goToFrame(state.frame);
      }
      if (state.transform) {
        viewer.setTransform(state.transform);
      }
      if (state.wipeMode) {
        viewer.setWipeState({
          mode: state.wipeMode as WipeMode,
          position: state.wipePosition ?? 0.5,
          showOriginal: state.wipeMode === 'horizontal' ? 'left' : 'top',
        });
      }
    } finally {
      sm.endApplyRemote();
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.colorSyncThrottle?.cancel();
    this.colorSyncThrottle = null;
    this.frameSyncThrottle?.cancel();
    this.frameSyncThrottle = null;
    this.viewSyncThrottle?.cancel();
    this.viewSyncThrottle = null;
    this.cursorSyncThrottle?.cancel();
    this.cursorSyncThrottle = null;
    if (this.playbackHeartbeat !== null) {
      clearInterval(this.playbackHeartbeat);
      this.playbackHeartbeat = null;
    }
    this.syncedAnnotations.clear();
    this.clearAllTransferTimeouts();
    this.pendingStateByTransferId.clear();
    for (const transferId of Array.from(this.outgoingMediaTransfers.keys())) {
      this.releaseOutgoingTransfer(transferId);
    }
    this.incomingMediaTransfers.clear();
    this.requestedMediaTransfers.clear();
    this.syncedNotes.clear();
  }
}

// ---- Validation of data received from peers ----

const NOTE_STATUSES = new Set(['open', 'resolved', 'wontfix']);
const NOTE_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);

function isValidNote(value: unknown): value is Note {
  if (!value || typeof value !== 'object') return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    n.id.length > 0 &&
    typeof n.sourceIndex === 'number' &&
    Number.isFinite(n.frameStart) &&
    Number.isFinite(n.frameEnd) &&
    typeof n.text === 'string' &&
    typeof n.author === 'string' &&
    typeof n.createdAt === 'string' &&
    typeof n.modifiedAt === 'string' &&
    typeof n.status === 'string' &&
    NOTE_STATUSES.has(n.status) &&
    (n.parentId === null || typeof n.parentId === 'string') &&
    typeof n.color === 'string' &&
    (n.priority === undefined || (typeof n.priority === 'string' && NOTE_PRIORITIES.has(n.priority))) &&
    (n.category === undefined || typeof n.category === 'string') &&
    (n.externalId === undefined || n.externalId === null || typeof n.externalId === 'string')
  );
}

type NoteUpdate = Partial<Pick<Note, 'text' | 'status' | 'color' | 'priority' | 'category'>>;

function pickNoteUpdate(note: Partial<Note>): NoteUpdate {
  const update: NoteUpdate = {};
  if (typeof note.text === 'string') update.text = note.text;
  if (typeof note.status === 'string' && NOTE_STATUSES.has(note.status)) update.status = note.status;
  if (typeof note.color === 'string') update.color = note.color;
  if (typeof note.priority === 'string' && NOTE_PRIORITIES.has(note.priority)) update.priority = note.priority;
  if (typeof note.category === 'string') update.category = note.category;
  return update;
}

function sameNoteContent(a: Note, b: Note): boolean {
  return (
    a.text === b.text &&
    a.status === b.status &&
    a.color === b.color &&
    a.priority === b.priority &&
    a.category === b.category
  );
}

function isAllowedRemoteMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    return ALLOWED_REMOTE_MEDIA_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Drop media references a peer should not be able to make us load
 * (blob:, data:, file:, javascript: and other non-http schemes).
 */
function sanitizeRemoteSessionState(state: SessionURLState): SessionURLState {
  const sanitized: SessionURLState = { ...state };
  if (sanitized.sourceUrl !== undefined && !isAllowedRemoteMediaUrl(sanitized.sourceUrl)) {
    delete sanitized.sourceUrl;
  }
  if (sanitized.sourceUrls) {
    const urls = sanitized.sourceUrls.filter(isAllowedRemoteMediaUrl);
    if (urls.length === sanitized.sourceUrls.length) {
      sanitized.sourceUrls = urls;
    } else {
      // Indices only line up if every source survives; otherwise load none.
      delete sanitized.sourceUrls;
    }
  }
  if (sanitized.representations) {
    sanitized.representations = sanitized.representations.filter(
      (rep) => rep.loaderConfig.url === undefined || isAllowedRemoteMediaUrl(rep.loaderConfig.url),
    );
  }
  return sanitized;
}
