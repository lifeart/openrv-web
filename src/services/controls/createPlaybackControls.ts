/**
 * Factory for the PlaybackControlGroup.
 */
import { AutoSaveManager } from '../../core/session/AutoSaveManager';
import { AutoSaveIndicator } from '../../ui/components/AutoSaveIndicator';
import { SnapshotManager } from '../../core/session/SnapshotManager';
import { PlaylistManager } from '../../core/session/PlaylistManager';
import { TransitionManager } from '../../core/session/TransitionManager';
import { PresentationMode } from '../../utils/ui/PresentationMode';
import { NetworkSyncManager } from '../../network/NetworkSyncManager';
import { NetworkControl } from '../../ui/components/NetworkControl';
import type { PlaybackControlGroup } from './ControlGroups';
import type { NetworkSyncConfig } from '../../network/types';

function parseSignalingServerList(raw: string | undefined): string[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => /^wss?:\/\//i.test(value));

  return Array.from(new Set(values));
}

function resolveNetworkSyncConfigFromEnv(): Partial<NetworkSyncConfig> {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const raw =
    env.VITE_NETWORK_SIGNALING_SERVERS ??
    env.VITE_NETWORK_SIGNALING_URLS ??
    env.VITE_NETWORK_SIGNALING_URL;

  const signalingServers = parseSignalingServerList(raw);
  if (signalingServers.length === 0) return {};

  return {
    serverUrl: signalingServers[0],
    serverUrls: signalingServers,
  };
}

export function createPlaybackControls(): PlaybackControlGroup {
  const autoSaveManager = new AutoSaveManager();
  const autoSaveIndicator = new AutoSaveIndicator();
  const snapshotManager = new SnapshotManager();
  const playlistManager = new PlaylistManager();
  const transitionManager = new TransitionManager();
  playlistManager.setTransitionManager(transitionManager);

  const presentationMode = new PresentationMode();
  presentationMode.loadPreference();

  const networkSyncManager = new NetworkSyncManager(resolveNetworkSyncConfigFromEnv());
  const networkControl = new NetworkControl();

  return {
    autoSaveManager,
    autoSaveIndicator,
    snapshotManager,
    playlistManager,
    transitionManager,
    presentationMode,
    networkSyncManager,
    networkControl,
  };
}
