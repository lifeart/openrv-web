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
import { CacheManagementPanel } from '../../ui/components/CacheManagementPanel';
import { SnapshotPanel } from '../../ui/components/SnapshotPanel';
import { PlaylistPanel } from '../../ui/components/PlaylistPanel';
import { createSessionSourceResolver } from '../../core/session/EditorialSourceMatcher';
import { ShotGridConfigUI } from '../../integrations/ShotGridConfig';
import { ShotGridPanel } from '../../ui/components/ShotGridPanel';
import {
  ConformPanel,
  type ConformPanelManager,
  type ConformSource,
  type UnresolvedClip,
  type ConformStatus,
} from '../../ui/components/ConformPanel';
import { createPanel, createPanelHeader } from '../../ui/components/shared/Panel';
import { PANEL_WIDTHS } from '../../ui/components/shared/theme';
import { linkExclusivePanels } from '../../ui/components/shared/linkExclusivePanels';
import { Logger } from '../../utils/Logger';
import { getGlobalHistoryManager } from '../../utils/HistoryManager';
import type { PanelControlGroup } from './ControlGroups';
import type { Session } from '../../core/session/Session';
import type { Viewer } from '../../ui/components/Viewer';
import type { ScopesControl } from '../../ui/components/ScopesControl';
import type { ColorControls } from '../../ui/components/ColorControls';
import type { SnapshotManager } from '../../core/session/SnapshotManager';
import type { PlaylistManager } from '../../core/session/PlaylistManager';
import type { TransitionManager } from '../../core/session/TransitionManager';
import type { MediaCacheManager } from '../../cache/MediaCacheManager';

const log = new Logger('createPanelControls');

export interface PanelControlDeps {
  session: Session;
  viewer: Viewer;
  scopesControl: ScopesControl;
  colorControls: ColorControls;
  snapshotManager: SnapshotManager;
  playlistManager: PlaylistManager;
  transitionManager: TransitionManager;
  cacheManager?: MediaCacheManager;
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

  // Mutual exclusion: HistoryPanel, NotePanel, and MarkerListPanel overlap in the same position
  notePanel.setExclusiveWith(markerListPanel);
  notePanel.setExclusiveWith(historyPanel);
  markerListPanel.setExclusiveWith(notePanel);
  markerListPanel.setExclusiveWith(historyPanel);
  historyPanel.setExclusiveWith(notePanel);
  historyPanel.setExclusiveWith(markerListPanel);

  // --- Layout panel content ---
  const rightPanelContent = new RightPanelContent(scopesControl);
  const leftPanelContent = new LeftPanelContent(colorControls, getGlobalHistoryManager());

  // --- Cache ---
  const cacheIndicator = new CacheIndicator(session, viewer);
  const cacheManagementPanel = deps.cacheManager ? new CacheManagementPanel(deps.cacheManager) : null;

  // --- Snapshot / Playlist panels ---
  const snapshotPanel = new SnapshotPanel(snapshotManager);
  const playlistPanel = new PlaylistPanel(playlistManager);
  playlistPanel.setTransitionManager(transitionManager);
  playlistPanel.setSourceUrlResolver((sourceIndex: number) => {
    const sources = session.allSources;
    if (sourceIndex < 0 || sourceIndex >= sources.length) return null;
    return sources[sourceIndex]?.url || null;
  });
  // Editorial import (EDL / RVEDL / OTIO) resolves clips against loaded media.
  playlistPanel.setSourceNameResolver(createSessionSourceResolver(() => session.allSources ?? []));
  playlistPanel.setSourceInfoResolver((sourceIndex: number) => {
    const source = session.getSourceByIndex(sourceIndex);
    if (!source) return null;
    return { frameCount: source.duration, startFrame: source.sequenceInfo?.startFrame };
  });
  // OTIO markers (timeline / track / clip) become session markers. OTIO
  // timeline time is 0-based; playlist frames are 1-based.
  playlistPanel.setMarkerImporter((markers) => {
    for (const m of markers) {
      const frame = m.timelineFrame + 1;
      const endFrame = m.durationFrames > 1 ? frame + m.durationFrames - 1 : undefined;
      const openrvMeta = m.metadata?.openrv;
      const metaColor =
        openrvMeta && typeof openrvMeta === 'object' ? (openrvMeta as { color?: unknown }).color : undefined;
      const color = typeof metaColor === 'string' ? metaColor : m.color?.startsWith('#') ? m.color : undefined;
      session.setMarker(frame, m.name, color, endFrame);
    }
  });
  playlistPanel.setMarkerProvider(() =>
    Array.from(session.marks.values()).map((m) => ({
      frame: m.frame,
      endFrame: m.endFrame,
      name: m.note,
      color: m.color,
    })),
  );

  // Mutual exclusion: only one panel can be open at a time
  snapshotPanel.setExclusiveWith(playlistPanel);
  playlistPanel.setExclusiveWith(snapshotPanel);

  // --- ShotGrid integration ---
  const shotGridConfig = new ShotGridConfigUI();
  const shotGridPanel = new ShotGridPanel();
  shotGridPanel.setConfigUI(shotGridConfig);

  // Cross-group mutual exclusion: every panel above docks to the same
  // top-right area, so opening any of them closes all the others (U9).
  linkExclusivePanels([
    {
      isOpen: () => notePanel.isVisible(),
      hide: () => notePanel.hide(),
      onOpen: (cb) => notePanel.on('visibilityChanged', (open) => open && cb()),
    },
    {
      isOpen: () => markerListPanel.isVisible(),
      hide: () => markerListPanel.hide(),
      onOpen: (cb) => markerListPanel.on('visibilityChanged', (open) => open && cb()),
    },
    {
      isOpen: () => historyPanel.isVisible(),
      hide: () => historyPanel.hide(),
      onOpen: (cb) => historyPanel.on('visibilityChanged', (open) => open && cb()),
    },
    {
      isOpen: () => snapshotPanel.isOpen(),
      hide: () => snapshotPanel.hide(),
      onOpen: (cb) => snapshotPanel.on('visibilityChanged', ({ open }) => open && cb()),
    },
    {
      isOpen: () => playlistPanel.isOpen(),
      hide: () => playlistPanel.hide(),
      onOpen: (cb) => playlistPanel.on('visibilityChanged', ({ open }) => open && cb()),
    },
    {
      isOpen: () => shotGridPanel.isOpen(),
      hide: () => shotGridPanel.hide(),
      onOpen: (cb) => shotGridPanel.on('visibilityChanged', (open) => open && cb()),
    },
  ]);

  // --- Conform / Re-link panel ---
  const conformPanelElement = createPanel({ width: PANEL_WIDTHS.dialogExtraWide, maxHeight: '70vh', align: 'right' });
  conformPanelElement.element.appendChild(createPanelHeader('Conform / Re-link'));
  const conformPanelContainer = document.createElement('div');
  conformPanelContainer.style.cssText = 'padding: 8px; overflow-y: auto; max-height: 60vh;';
  conformPanelElement.element.appendChild(conformPanelContainer);

  const conformManager: ConformPanelManager = {
    getUnresolvedClips: (): UnresolvedClip[] =>
      playlistManager.unresolvedClips.map((c) => ({
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

  // Wire the file handler so browse buttons open real file pickers
  conformPanel.setFileHandler(async (file: File): Promise<number | null> => {
    const countBefore = (session.allSources ?? []).length;
    try {
      await session.loadImageFile(file);
    } catch (err) {
      log.warn('Conform relink: failed to load replacement file', file.name, err);
      return null;
    }
    const countAfter = (session.allSources ?? []).length;
    if (countAfter > countBefore) {
      return countAfter - 1;
    }
    return null;
  });

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
    cacheManagementPanel,
    conformPanel,
    conformPanelElement,
    conformPanelContainer,
  };
}
