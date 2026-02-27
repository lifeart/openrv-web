/**
 * AppNetworkBridge - Extracts network sync wiring from App
 *
 * Handles bidirectional sync between Session/Viewer and
 * NetworkSyncManager/NetworkControl.
 */

import type { Session } from './core/session/Session';
import type { MediaSource } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { PaintEngine } from './paint/PaintEngine';
import type { NetworkSyncManager } from './network/NetworkSyncManager';
import type { NetworkControl } from './ui/components/NetworkControl';
import type { ColorControls } from './ui/components/ColorControls';
import type { HeaderBar } from './ui/components/layout/HeaderBar';
import { type Annotation, isValidAnnotation } from './paint/types';
import type { Note } from './core/session/NoteManager';
import type {
  MediaTransferFileDescriptor,
  MediaTransferSourceDescriptor,
  AnnotationSyncPayload,
  NoteSyncPayload,
  ColorSyncPayload,
} from './network/types';
import {
  buildShareURL,
  decodeSessionState,
  encodeSessionState,
  type SessionURLState,
} from './core/session/SessionURLManager';
import {
  decryptSessionStateWithPin,
  encryptSessionStateWithPin,
  isValidPinCode,
} from './network/PinEncryption';
import { createThrottle, type Throttled } from './utils/throttle';
import { showConfirm } from './ui/components/shared/Modal';

const MEDIA_CHUNK_SIZE_BYTES = 48 * 1024;

interface PreparedMediaFile extends MediaTransferFileDescriptor {
  bytes: Uint8Array;
}

interface PreparedMediaBundle {
  files: PreparedMediaFile[];
  sources: MediaTransferSourceDescriptor[];
  totalBytes: number;
}

interface OutgoingMediaTransfer {
  requesterUserId: string;
  bundle: PreparedMediaBundle;
}

interface IncomingTransferFileState {
  descriptor: MediaTransferFileDescriptor;
  chunks: Map<number, string>;
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
  getSessionURLState?: () => SessionURLState;
  applySessionURLState?: (state: SessionURLState) => void;
}

export class AppNetworkBridge {
  private ctx: NetworkBridgeContext;
  private unsubscribers: (() => void)[] = [];
  private pendingStateByTransferId = new Map<string, SessionURLState>();
  private outgoingMediaTransfers = new Map<string, OutgoingMediaTransfer>();
  private incomingMediaTransfers = new Map<string, IncomingMediaTransfer>();
  private colorSyncThrottle: Throttled<[ColorSyncPayload]> | null = null;
  private frameSyncThrottle: Throttled<[number]> | null = null;
  private lastPlaybackSyncFrame = -1;
  private lastPlaybackSyncTime = 0;

  constructor(ctx: NetworkBridgeContext) {
    this.ctx = ctx;
  }

  /**
   * Setup network sync: wire NetworkControl UI to NetworkSyncManager,
   * and listen for incoming sync events to apply to Session/Viewer.
   */
  setup(): void {
    const { session, viewer, networkSyncManager, networkControl, headerBar } = this.ctx;

    // Add NetworkControl to header bar
    headerBar.setNetworkControl(networkControl.render());

    // Wire UI events to manager
    this.unsubscribers.push(networkControl.on('createRoom', ({ userName }) => {
      networkSyncManager.createRoom(userName, this.getActivePinCode());
    }));

    this.unsubscribers.push(networkControl.on('joinRoom', ({ roomCode, userName }) => {
      networkSyncManager.joinRoom(roomCode, userName, this.getActivePinCode());
    }));

    this.unsubscribers.push(networkControl.on('leaveRoom', () => {
      networkSyncManager.leaveRoom();
      networkControl.setConnectionState('disconnected');
      networkControl.setIsHost(false);
      networkControl.setShareLinkKind('generic');
      networkControl.setResponseToken('');
      networkControl.setRoomInfo(null);
      networkControl.setUsers([]);
      networkControl.hideInfo();
      this.ctx.paintEngine?.setIdPrefix('');
    }));

    this.unsubscribers.push(networkControl.on('syncSettingsChanged', (settings) => {
      networkSyncManager.setSyncSettings(settings);
    }));

    this.unsubscribers.push(networkControl.on('copyLink', async (baseLink) => {
      try {
        const pinCode = this.getActivePinCode();
        const roomCode = networkSyncManager.roomInfo?.roomCode ?? '';
        const fallbackBase = roomCode ? this.buildRoomLink(roomCode, pinCode) : baseLink;
        let shareLink = baseLink.trim() || fallbackBase;

        const hasSessionHash = this.hasSessionShareState(shareLink);
        if (!hasSessionHash) {
          const state = this.ctx.getSessionURLState?.() ?? this.captureSessionURLState();
          shareLink = buildShareURL(shareLink, state);
        }

        const controlWithShare = networkControl as unknown as { setShareLink?: (url: string) => void };

        // Update the share link immediately with session state hash,
        // before attempting WebRTC offer generation which may be slow or fail.
        controlWithShare.setShareLink?.(shareLink);

        const managerWithServerless = networkSyncManager as unknown as {
          buildServerlessInviteShareURL?: (url: string) => Promise<string>;
        };
        if (networkSyncManager.isHost && typeof managerWithServerless.buildServerlessInviteShareURL === 'function') {
          shareLink = await managerWithServerless.buildServerlessInviteShareURL(shareLink);
          // Update again with the WebRTC offer token appended
          controlWithShare.setShareLink?.(shareLink);
        }
        await navigator.clipboard.writeText(shareLink);
      } catch (error) {
        if (error instanceof Error && /clipboard/i.test(error.message)) {
          networkControl.showError('Clipboard unavailable. Copy Share URL from the Network Sync panel.');
          return;
        }
        networkControl.showError(
          `Failed to generate share URL: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }));

    this.unsubscribers.push(networkControl.on('applyResponseLink', async (responseLink) => {
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
    }));

    // One-time state sync after join/reconnect
    this.unsubscribers.push(networkSyncManager.on('sessionStateRequested', async ({ requestId, requesterUserId }) => {
      if (!networkSyncManager.isHost) return;

      const encodedState = encodeSessionState(this.ctx.getSessionURLState?.() ?? this.captureSessionURLState());
      const pinCode = this.getActivePinCode();

      // Capture annotations and notes for full state transfer
      const paintSnapshot = this.ctx.paintEngine?.toJSON();
      const annotations = paintSnapshot
        ? Object.values(paintSnapshot.frames).flat()
        : undefined;
      const notes = session.noteManager.toSerializable();

      if (isValidPinCode(pinCode)) {
        try {
          const encrypted = await encryptSessionStateWithPin(encodedState, pinCode);
          networkSyncManager.sendSessionStateResponse(requestId, requesterUserId, {
            encryptedSessionState: encrypted,
            annotations,
            notes,
          });
          return;
        } catch (error) {
          networkControl.showError(
            `Failed to encrypt session state for transfer: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      }

      networkSyncManager.sendSessionStateResponse(requestId, requesterUserId, {
        sessionState: encodedState,
        annotations,
        notes,
      });
    }));

    this.unsubscribers.push(networkSyncManager.on('sessionStateReceived', async (payload) => {
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
            `Failed to decrypt session state: ${error instanceof Error ? error.message : 'unknown error'}`
          );
          return;
        }
      }

      if (!encodedState) return;
      const decoded = decodeSessionState(encodedState);
      if (!decoded) {
        networkControl.showError('Received an invalid session state payload.');
        return;
      }

      if (this.shouldRequestMediaSync(decoded)) {
        const transferId = networkSyncManager.requestMediaSync(payload.senderUserId);
        if (transferId) {
          this.pendingStateByTransferId.set(transferId, decoded);
          this.applySharedSessionState(decoded);
          this.applyReceivedAnnotationsAndNotes(payload.annotations, payload.notes);
          return;
        }
      }

      this.applySharedSessionState(decoded);
      this.applyReceivedAnnotationsAndNotes(payload.annotations, payload.notes);
    }));

    this.unsubscribers.push(networkSyncManager.on('mediaSyncRequested', async ({ transferId, requesterUserId }) => {
      if (!networkSyncManager.isHost) return;

      try {
        const bundle = await this.captureLocalMediaBundle();
        this.outgoingMediaTransfers.set(transferId, {
          requesterUserId,
          bundle,
        });

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
        networkControl.showError(
          `Failed to prepare media transfer: ${error instanceof Error ? error.message : 'unknown error'}`
        );
        networkSyncManager.sendMediaOffer(transferId, requesterUserId, {
          totalBytes: 0,
          files: [],
          sources: [],
        });
        networkSyncManager.sendMediaComplete(transferId, requesterUserId);
      }
    }));

    this.unsubscribers.push(networkSyncManager.on('mediaSyncOffered', async ({ transferId, senderUserId, totalBytes, files, sources }) => {
      const accepted = await this.confirmMediaSync(totalBytes, files.length);
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
          totalChunks: null,
        });
      });

      this.incomingMediaTransfers.set(transferId, {
        senderUserId,
        files: incomingFiles,
        sources,
        totalBytes,
      });
    }));

    this.unsubscribers.push(networkSyncManager.on('mediaSyncResponded', ({ transferId, senderUserId, accepted }) => {
      const transfer = this.outgoingMediaTransfers.get(transferId);
      if (!transfer) return;
      if (transfer.requesterUserId !== senderUserId) return;

      if (!accepted) {
        this.outgoingMediaTransfers.delete(transferId);
        return;
      }

      void this.streamOutgoingMediaTransfer(transferId, transfer);
    }));

    this.unsubscribers.push(networkSyncManager.on('mediaSyncChunkReceived', (payload) => {
      const transfer = this.incomingMediaTransfers.get(payload.transferId);
      if (!transfer || transfer.senderUserId !== payload.senderUserId) return;

      const fileState = transfer.files.get(payload.fileId);
      if (!fileState) return;

      if (fileState.totalChunks === null) {
        fileState.totalChunks = payload.totalChunks;
      }
      if (payload.totalChunks !== fileState.totalChunks) return;
      if (payload.chunkIndex < 0 || payload.chunkIndex >= payload.totalChunks) return;

      fileState.chunks.set(payload.chunkIndex, payload.data);
    }));

    this.unsubscribers.push(networkSyncManager.on('mediaSyncCompleted', async ({ transferId, senderUserId }) => {
      const transfer = this.incomingMediaTransfers.get(transferId);
      const pendingState = this.pendingStateByTransferId.get(transferId);

      try {
        if (transfer && transfer.senderUserId === senderUserId) {
          await this.importIncomingMediaTransfer(transfer);
        }
      } catch (error) {
        networkControl.showError(
          `Failed to import synced media: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      } finally {
        this.incomingMediaTransfers.delete(transferId);
        this.pendingStateByTransferId.delete(transferId);
      }

      if (pendingState) {
        this.applySharedSessionState(pendingState);
      }
    }));

    // Wire manager events to UI
    this.unsubscribers.push(networkSyncManager.on('connectionStateChanged', (state) => {
      networkControl.setConnectionState(state);
      if (state !== 'connected') {
        networkControl.setIsHost(false);
      } else {
        networkControl.setIsHost(networkSyncManager.isHost);
      }
    }));

    this.unsubscribers.push(networkSyncManager.on('roomCreated', (info) => {
      networkControl.setIsHost(true);
      networkControl.setShareLinkKind('invite');
      networkControl.setResponseToken('');
      networkControl.hideInfo();
      networkControl.setRoomInfo(info);
      networkControl.setUsers(info.users);
      this.ctx.paintEngine?.setIdPrefix(networkSyncManager.userId);
      void this.refreshShareLinkPreview();
    }));

    this.unsubscribers.push(networkSyncManager.on('roomJoined', (info) => {
      networkControl.setIsHost(networkSyncManager.isHost);
      networkControl.setShareLinkKind(networkSyncManager.isHost ? 'invite' : 'generic');
      networkControl.setRoomInfo(info);
      networkControl.setUsers(info.users);
      this.ctx.paintEngine?.setIdPrefix(networkSyncManager.userId);
      void this.refreshShareLinkPreview();
    }));

    this.unsubscribers.push(networkSyncManager.on('usersChanged', (users) => {
      networkControl.setUsers(users);
      void this.refreshShareLinkPreview();
    }));

    this.unsubscribers.push(networkSyncManager.on('error', (err) => {
      networkControl.showError(err.message);
    }));

    this.unsubscribers.push(networkSyncManager.on('rttUpdated', (rtt) => {
      networkControl.setRTT(rtt);
    }));

    // Wire incoming sync events to Session/Viewer
    this.unsubscribers.push(networkSyncManager.on('syncPlayback', (payload) => {
      const sm = networkSyncManager.getSyncStateManager();
      sm.beginApplyRemote();
      try {
        if (payload.isPlaying && !session.isPlaying) {
          session.play();
        } else if (!payload.isPlaying && session.isPlaying) {
          session.pause();
        }
        if (sm.shouldApplyFrameSync(session.currentFrame, payload.currentFrame)) {
          session.goToFrame(payload.currentFrame);
        }
        if (session.playbackSpeed !== payload.playbackSpeed) {
          session.playbackSpeed = payload.playbackSpeed;
        }
      } finally {
        sm.endApplyRemote();
      }
    }));

    this.unsubscribers.push(networkSyncManager.on('syncFrame', (payload) => {
      const sm = networkSyncManager.getSyncStateManager();
      if (sm.shouldApplyFrameSync(session.currentFrame, payload.currentFrame)) {
        sm.beginApplyRemote();
        try {
          session.goToFrame(payload.currentFrame);
        } finally {
          sm.endApplyRemote();
        }
      }
    }));

    this.unsubscribers.push(networkSyncManager.on('syncView', (payload) => {
      const sm = networkSyncManager.getSyncStateManager();
      sm.beginApplyRemote();
      try {
        viewer.setZoom(payload.zoom);
      } finally {
        sm.endApplyRemote();
      }
    }));

    // Wire incoming color sync
    this.unsubscribers.push(networkSyncManager.on('syncColor', (payload: ColorSyncPayload) => {
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
    }));

    // Wire outgoing color sync when local color adjustments change
    const colorControls = this.ctx.colorControls;
    if (colorControls) {
      this.colorSyncThrottle = createThrottle((payload: ColorSyncPayload) => {
        networkSyncManager.sendColorSync(payload);
      }, 100);

      this.unsubscribers.push(colorControls.on('adjustmentsChanged', (adjustments) => {
        if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
          this.colorSyncThrottle!.call({
            exposure: adjustments.exposure,
            gamma: adjustments.gamma,
            saturation: adjustments.saturation,
            contrast: adjustments.contrast,
            temperature: adjustments.temperature,
            tint: adjustments.tint,
            brightness: adjustments.brightness,
          });
        }
      }));
    }

    // Wire incoming annotation sync
    const paintEngine = this.ctx.paintEngine;
    if (paintEngine) {
      this.unsubscribers.push(networkSyncManager.on('syncAnnotation', (payload: AnnotationSyncPayload) => {
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
      }));

      // Send outgoing annotation sync when local annotations change
      this.unsubscribers.push(paintEngine.on('strokeAdded', (annotation: Annotation) => {
        if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
          networkSyncManager.sendAnnotationSync({
            frame: annotation.frame,
            strokes: [annotation],
            action: 'add',
            annotationId: annotation.id,
            timestamp: Date.now(),
          });
        }
      }));

      this.unsubscribers.push(paintEngine.on('strokeRemoved', (annotation: Annotation) => {
        if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
          networkSyncManager.sendAnnotationSync({
            frame: annotation.frame,
            strokes: [],
            action: 'remove',
            annotationId: annotation.id,
            timestamp: Date.now(),
          });
        }
      }));
    }

    // Wire incoming note sync
    this.unsubscribers.push(networkSyncManager.on('syncNote', (payload: NoteSyncPayload) => {
      const sm = networkSyncManager.getSyncStateManager();
      sm.beginApplyRemote();
      try {
        const noteManager = session.noteManager;
        switch (payload.action) {
          case 'add': {
            const note = payload.note as Note | undefined;
            if (note && note.id) {
              noteManager.importNote(note);
            }
            break;
          }
          case 'remove':
            if (payload.noteId) {
              noteManager.removeNote(payload.noteId);
            }
            break;
          case 'update': {
            const note = payload.note as Partial<Note> | undefined;
            if (payload.noteId && note) {
              noteManager.updateNote(payload.noteId, {
                text: note.text,
                status: note.status,
                color: note.color,
              });
            }
            break;
          }
          case 'clear':
            noteManager.fromSerializable([]);
            break;
          case 'snapshot':
            if (Array.isArray(payload.notes)) {
              noteManager.fromSerializable(payload.notes as Note[]);
            }
            break;
        }
      } finally {
        sm.endApplyRemote();
      }
    }));

    // Send outgoing note sync when notes change
    this.unsubscribers.push(session.on('notesChanged', () => {
      if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
        networkSyncManager.sendNoteSync({
          action: 'snapshot',
          notes: session.noteManager.toSerializable(),
          timestamp: Date.now(),
        });
      }
    }));

    // Send outgoing sync when local state changes
    this.unsubscribers.push(session.on('playbackChanged', (isPlaying) => {
      if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
        this.lastPlaybackSyncFrame = session.currentFrame;
        this.lastPlaybackSyncTime = Date.now();
        networkSyncManager.sendPlaybackSync({
          isPlaying,
          currentFrame: session.currentFrame,
          playbackSpeed: session.playbackSpeed,
          playDirection: session.playDirection,
          loopMode: session.loopMode,
          timestamp: Date.now(),
        });
      }
    }));

    this.frameSyncThrottle = createThrottle((frame: number) => {
      networkSyncManager.sendFrameSync(frame);
    }, 50);

    this.unsubscribers.push(session.on('frameChanged', (frame) => {
      if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
        // Skip if this frame was just sent via playbackChanged
        if (frame === this.lastPlaybackSyncFrame && Date.now() - this.lastPlaybackSyncTime < 50) {
          return;
        }
        this.frameSyncThrottle!.call(frame);
      }
    }));
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
      const pinCode = this.getActivePinCode();
      const state = this.ctx.getSessionURLState?.() ?? this.captureSessionURLState();
      const base = this.buildRoomLink(roomCode, pinCode);
      let shareLink = buildShareURL(base, state);

      const managerWithServerless = this.ctx.networkSyncManager as unknown as {
        buildServerlessInviteShareURL?: (url: string) => Promise<string>;
      };
      if (typeof managerWithServerless.buildServerlessInviteShareURL === 'function') {
        shareLink = await managerWithServerless.buildServerlessInviteShareURL(shareLink);
      }

      const controlWithShare = this.ctx.networkControl as unknown as {
        setShareLink?: (url: string) => void;
        setShareLinkKind?: (kind: 'invite' | 'response' | 'generic') => void;
        setResponseToken?: (token: string) => void;
      };
      controlWithShare.setShareLinkKind?.('invite');
      controlWithShare.setResponseToken?.('');
      controlWithShare.setShareLink?.(shareLink);
    } catch {
      // Keep existing share URL on preview update errors.
    }
  }

  private buildRoomLink(roomCode: string, pinCode: string): string {
    const fallbackBase = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const url = new URL(fallbackBase);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', roomCode);
    if (pinCode) {
      url.searchParams.set('pin', pinCode);
    }
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
    const hasAnnotations = Array.isArray(annotations) && annotations.length > 0 && this.ctx.paintEngine;
    const hasNotes = Array.isArray(notes) && notes.length > 0;
    if (!hasAnnotations && !hasNotes) return;

    const sm = this.ctx.networkSyncManager.getSyncStateManager();
    sm.beginApplyRemote();
    try {
      if (hasAnnotations) {
        this.ctx.paintEngine!.loadFromAnnotations(annotations as import('./paint/types').Annotation[]);
      }
      if (hasNotes) {
        this.ctx.session.noteManager.fromSerializable(notes as import('./core/session/NoteManager').Note[]);
      }
    } finally {
      sm.endApplyRemote();
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
      } catch {
        // fall through to browser confirm
      }
    }

    const fileLabel = fileCount === 1 ? 'file' : 'files';
    const sizeLabel = this.formatByteSize(totalBytes);
    return await showConfirm(`Accept media sync?\n\nIncoming: ${fileCount} ${fileLabel} (${sizeLabel}).`);
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
        const bytes = new Uint8Array(await file.arrayBuffer());
        files.push({
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified || Date.now(),
          bytes,
        });
        fileIds.push(id);
        totalBytes += bytes.byteLength;
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
    transfer: OutgoingMediaTransfer
  ): Promise<void> {
    const { networkSyncManager, networkControl } = this.ctx;

    try {
      for (const file of transfer.bundle.files) {
        const totalChunks = Math.max(1, Math.ceil(file.bytes.byteLength / MEDIA_CHUNK_SIZE_BYTES));
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * MEDIA_CHUNK_SIZE_BYTES;
          const end = Math.min(start + MEDIA_CHUNK_SIZE_BYTES, file.bytes.byteLength);
          const chunkBytes = file.bytes.subarray(start, end);
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
        `Failed to send media transfer: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    } finally {
      this.outgoingMediaTransfers.delete(transferId);
    }
  }

  private async importIncomingMediaTransfer(transfer: IncomingMediaTransfer): Promise<void> {
    const assembledFiles = new Map<string, File>();

    for (const [fileId, state] of transfer.files.entries()) {
      if (state.totalChunks === null) {
        throw new Error(`Incomplete transfer for file "${state.descriptor.name}".`);
      }

      const encodedChunks: string[] = [];
      for (let i = 0; i < state.totalChunks; i++) {
        const chunk = state.chunks.get(i);
        if (typeof chunk !== 'string') {
          throw new Error(`Missing chunk ${i + 1}/${state.totalChunks} for "${state.descriptor.name}".`);
        }
        encodedChunks.push(chunk);
      }

      const bytes = this.base64ToBytes(encodedChunks.join(''));
      const bufferView = new Uint8Array(bytes.byteLength);
      bufferView.set(bytes);
      const file = new File([bufferView.buffer], state.descriptor.name, {
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
        if (files.length === 0) continue;

        if (source.kind === 'sequence') {
          await session.loadSequence(files, source.fps);
        } else {
          await session.loadFile(files[0]!);
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
      for (let i = 0; i < chunk.length; i++) {
        binary += String.fromCharCode(chunk[i]!);
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

      if (typeof state.fps === 'number' && state.fps > 0) {
        session.fps = state.fps;
      }
      if (typeof state.inPoint === 'number') {
        session.setInPoint(state.inPoint);
      }
      if (typeof state.outPoint === 'number') {
        session.setOutPoint(state.outPoint);
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
      if (typeof state.frame === 'number') {
        session.goToFrame(state.frame);
      }
      if (state.transform) {
        viewer.setTransform(state.transform);
      }
      if (state.wipeMode) {
        viewer.setWipeState({
          mode: state.wipeMode as any,
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
    this.pendingStateByTransferId.clear();
    this.outgoingMediaTransfers.clear();
    this.incomingMediaTransfers.clear();
  }
}
