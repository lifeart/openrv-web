/**
 * AppNetworkBridge - Extracts network sync wiring from App
 *
 * Handles bidirectional sync between Session/Viewer and
 * NetworkSyncManager/NetworkControl.
 */

import type { Session } from './core/session/Session';
import type { MediaSource } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { NetworkSyncManager } from './network/NetworkSyncManager';
import type { NetworkControl } from './ui/components/NetworkControl';
import type { HeaderBar } from './ui/components/layout/HeaderBar';
import type { MediaTransferFileDescriptor, MediaTransferSourceDescriptor } from './network/types';
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
      networkControl.setRoomInfo(null);
      networkControl.setUsers([]);
    }));

    this.unsubscribers.push(networkControl.on('syncSettingsChanged', (settings) => {
      networkSyncManager.setSyncSettings(settings);
    }));

    this.unsubscribers.push(networkControl.on('copyLink', async (baseLink) => {
      try {
        const state = this.ctx.getSessionURLState?.() ?? this.captureSessionURLState();
        const shareLink = buildShareURL(baseLink, state);
        await navigator.clipboard.writeText(shareLink);
      } catch {
        // Clipboard API may not be available
      }
    }));

    // One-time state sync after join/reconnect
    this.unsubscribers.push(networkSyncManager.on('sessionStateRequested', async ({ requestId, requesterUserId }) => {
      if (!networkSyncManager.isHost) return;

      const encodedState = encodeSessionState(this.ctx.getSessionURLState?.() ?? this.captureSessionURLState());
      const pinCode = this.getActivePinCode();

      if (isValidPinCode(pinCode)) {
        try {
          const encrypted = await encryptSessionStateWithPin(encodedState, pinCode);
          networkSyncManager.sendSessionStateResponse(requestId, requesterUserId, {
            encryptedSessionState: encrypted,
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
          return;
        }
      }

      this.applySharedSessionState(decoded);
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

    this.unsubscribers.push(networkSyncManager.on('mediaSyncOffered', ({ transferId, senderUserId, totalBytes, files, sources }) => {
      const accepted = this.confirmMediaSync(totalBytes, files.length);
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
    }));

    this.unsubscribers.push(networkSyncManager.on('roomCreated', (info) => {
      networkControl.setRoomInfo(info);
      networkControl.setUsers(info.users);
    }));

    this.unsubscribers.push(networkSyncManager.on('roomJoined', (info) => {
      networkControl.setRoomInfo(info);
      networkControl.setUsers(info.users);
    }));

    this.unsubscribers.push(networkSyncManager.on('usersChanged', (users) => {
      networkControl.setUsers(users);
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

    // Send outgoing sync when local state changes
    this.unsubscribers.push(session.on('playbackChanged', (isPlaying) => {
      if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
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

    this.unsubscribers.push(session.on('frameChanged', (frame) => {
      if (networkSyncManager.isConnected && !networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
        networkSyncManager.sendFrameSync(frame);
      }
    }));
  }

  private getActivePinCode(): string {
    const controlWithPin = this.ctx.networkControl as unknown as { getPinCode?: () => string };
    const value = controlWithPin.getPinCode?.();
    return typeof value === 'string' ? value.trim() : '';
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

  private confirmMediaSync(totalBytes: number, fileCount: number): boolean {
    if (fileCount <= 0) return true;
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;

    const fileLabel = fileCount === 1 ? 'file' : 'files';
    const sizeLabel = this.formatByteSize(totalBytes);
    return window.confirm(`Accept media sync?\n\nIncoming: ${fileCount} ${fileLabel} (${sizeLabel}).`);
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
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const file = new File([buffer], state.descriptor.name, {
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
    this.pendingStateByTransferId.clear();
    this.outgoingMediaTransfers.clear();
    this.incomingMediaTransfers.clear();
  }
}
