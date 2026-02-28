/**
 * Factory for the PanelControlGroup.
 */
import { HistoryPanel } from '../../ui/components/HistoryPanel';
import { InfoPanel } from '../../ui/components/InfoPanel';
import { MarkerListPanel } from '../../ui/components/MarkerListPanel';
import { NotePanel } from '../../ui/components/NotePanel';
import { RightPanelContent } from '../../ui/layout/panels/RightPanelContent';
import { LeftPanelContent } from '../../ui/layout/panels/LeftPanelContent';
import { CacheIndicator } from '../../ui/components/CacheIndicator';
import { SnapshotPanel } from '../../ui/components/SnapshotPanel';
import { PlaylistPanel } from '../../ui/components/PlaylistPanel';
import { ShotGridConfigUI } from '../../integrations/ShotGridConfig';
import { ShotGridPanel } from '../../ui/components/ShotGridPanel';
import { ConformPanel, type ConformPanelManager, type ConformSource, type UnresolvedClip, type ConformStatus } from '../../ui/components/ConformPanel';
import { createPanel, createPanelHeader } from '../../ui/components/shared/Panel';
import { getGlobalHistoryManager } from '../../utils/HistoryManager';
import type { PanelControlGroup } from './ControlGroups';
import type { Session } from '../../core/session/Session';
import type { Viewer } from '../../ui/components/Viewer';
import type { ScopesControl } from '../../ui/components/ScopesControl';
import type { ColorControls } from '../../ui/components/ColorControls';
import type { SnapshotManager } from '../../core/session/SnapshotManager';
import type { PlaylistManager } from '../../core/session/PlaylistManager';
import type { TransitionManager } from '../../core/session/TransitionManager';

export interface PanelControlDeps {
  session: Session;
  viewer: Viewer;
  scopesControl: ScopesControl;
  colorControls: ColorControls;
  snapshotManager: SnapshotManager;
  playlistManager: PlaylistManager;
  transitionManager: TransitionManager;
}

export interface PanelControlGroupInternal extends PanelControlGroup {
  /** The conform panel DOM wrapper (Panel element). */
  readonly conformPanelElement: ReturnType<typeof createPanel>;
  /** The conform panel container div. */
  readonly conformPanelContainer: HTMLElement;
}

export function createPanelControls(deps: PanelControlDeps): PanelControlGroupInternal {
  const { session, viewer, scopesControl, colorControls, snapshotManager, playlistManager, transitionManager } = deps;

  // --- Panels ---
  const historyPanel = new HistoryPanel(getGlobalHistoryManager());
  const infoPanel = new InfoPanel();
  const markerListPanel = new MarkerListPanel(session);
  const notePanel = new NotePanel(session);

  // Mutual exclusion: NotePanel and MarkerListPanel overlap in the same position
  notePanel.setExclusiveWith(markerListPanel);
  markerListPanel.setExclusiveWith(notePanel);

  // --- Layout panel content ---
  const rightPanelContent = new RightPanelContent(scopesControl);
  const leftPanelContent = new LeftPanelContent(colorControls, getGlobalHistoryManager());

  // --- Cache ---
  const cacheIndicator = new CacheIndicator(session, viewer);

  // --- Snapshot / Playlist panels ---
  const snapshotPanel = new SnapshotPanel(snapshotManager);
  const playlistPanel = new PlaylistPanel(playlistManager);
  playlistPanel.setTransitionManager(transitionManager);

  // Mutual exclusion: only one panel can be open at a time
  snapshotPanel.setExclusiveWith(playlistPanel);
  playlistPanel.setExclusiveWith(snapshotPanel);

  // --- ShotGrid integration ---
  const shotGridConfig = new ShotGridConfigUI();
  const shotGridPanel = new ShotGridPanel();
  shotGridPanel.setConfigUI(shotGridConfig);

  // --- Conform / Re-link panel ---
  const conformPanelElement = createPanel({ width: '500px', maxHeight: '70vh', align: 'right' });
  conformPanelElement.element.appendChild(createPanelHeader('Conform / Re-link'));
  const conformPanelContainer = document.createElement('div');
  conformPanelContainer.style.cssText = 'padding: 8px; overflow-y: auto; max-height: 60vh;';
  conformPanelElement.element.appendChild(conformPanelContainer);

  const conformManager: ConformPanelManager = {
    getUnresolvedClips: (): UnresolvedClip[] =>
      playlistManager.unresolvedClips.map(c => ({
        id: c.id,
        name: c.name,
        originalUrl: c.sourceUrl,
        inFrame: c.inFrame,
        outFrame: c.outFrame,
        timelineIn: c.timelineIn,
        reason: 'not_found' as const,
      })),
    getAvailableSources: (): ConformSource[] =>
      (session.allSources ?? []).map((s, i) => ({
        index: i,
        name: s.name,
        url: s.url,
        frameCount: s.duration,
      })),
    relinkClip: (clipId: string, sourceIndex: number): boolean => {
      const source = session.getSourceByIndex(sourceIndex);
      if (!source) return false;
      return playlistManager.relinkUnresolvedClip(clipId, sourceIndex, source.name, source.duration);
    },
    getResolutionStatus: (): ConformStatus => {
      const unresolved = playlistManager.unresolvedClips.length;
      const total = playlistManager.getClips().length + unresolved;
      return { resolved: total - unresolved, total };
    },
  };
  const conformPanel = new ConformPanel(conformPanelContainer, conformManager);

  return {
    historyPanel,
    infoPanel,
    markerListPanel,
    notePanel,
    rightPanelContent,
    leftPanelContent,
    cacheIndicator,
    snapshotPanel,
    playlistPanel,
    shotGridConfig,
    shotGridPanel,
    conformPanel,
    conformPanelElement,
    conformPanelContainer,
  };
}
