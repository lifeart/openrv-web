/**
 * AppNetworkBridge - Extracts network sync wiring from App
 *
 * Handles bidirectional sync between Session/Viewer and
 * NetworkSyncManager/NetworkControl.
 */

import type { Session } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { NetworkSyncManager } from './network/NetworkSyncManager';
import type { NetworkControl } from './ui/components/NetworkControl';
import type { HeaderBar } from './ui/components/layout/HeaderBar';

/**
 * Context interface for dependencies needed by the network bridge.
 */
export interface NetworkBridgeContext {
  session: Session;
  viewer: Viewer;
  networkSyncManager: NetworkSyncManager;
  networkControl: NetworkControl;
  headerBar: HeaderBar;
}

export class AppNetworkBridge {
  private ctx: NetworkBridgeContext;
  private unsubscribers: (() => void)[] = [];

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
    this.unsubscribers.push(networkControl.on('createRoom', () => {
      networkSyncManager.simulateRoomCreated();
      const info = networkSyncManager.roomInfo;
      if (info) {
        networkControl.setConnectionState('connected');
        networkControl.setRoomInfo(info);
        networkControl.setUsers(info.users);
      }
    }));

    this.unsubscribers.push(networkControl.on('joinRoom', ({ roomCode, userName }) => {
      networkSyncManager.joinRoom(roomCode, userName);
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

    this.unsubscribers.push(networkControl.on('copyLink', async (link) => {
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        // Clipboard API may not be available
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

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }
}
