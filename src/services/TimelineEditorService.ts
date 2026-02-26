/**
 * TimelineEditorService - Manages EDL/SequenceGroup timeline editing logic.
 *
 * Extracted from App.ts to isolate timeline editor concerns:
 * - Synchronizing the timeline editor UI from the session graph
 * - Normalizing and applying EDL edits (cut trim/move/delete/insert/split)
 * - Handling cut selection (navigating to the correct frame/source)
 * - Building fallback EDL from loaded sources when no SequenceGroupNode exists
 * - Wiring timeline editor and session events
 */

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing - no need to import heavy classes)
// ---------------------------------------------------------------------------

/** Minimal EDL entry shape used by the service. */
export interface TimelineEDLEntry {
  frame: number;
  source: number;
  inPoint: number;
  outPoint: number;
}

/** Subset of SequenceGroupNode the service actually touches. */
export interface TimelineSequenceNode {
  setEDL(entries: TimelineEDLEntry[]): void;
  getTotalDurationFromEDL(): number;
}

/** Minimal source info needed for fallback EDL building. */
export interface TimelineSourceInfo {
  readonly name?: string;
  readonly duration?: number;
}

/** Subset of Session the timeline editor service touches. */
export interface TimelineEditorSession {
  readonly currentFrame: number;
  readonly currentSourceIndex: number;
  readonly frameCount: number;
  readonly sourceCount: number;
  readonly loopMode: string;
  readonly allSources: TimelineSourceInfo[];
  readonly graph: { getAllNodes(): unknown[] } | null;
  goToFrame(frame: number): void;
  setCurrentSource(index: number): void;
  setInPoint(frame: number): void;
  setOutPoint(frame: number): void;
  getSourceByIndex(index: number): TimelineSourceInfo | null;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
}

/** Minimal playlist clip for timeline editor. */
export interface TimelinePlaylistClip {
  readonly globalStartFrame: number;
  readonly sourceIndex: number;
  readonly sourceName: string;
  readonly inPoint: number;
  readonly outPoint: number;
}

/** Subset of PlaylistManager the service touches. */
export interface TimelinePlaylistManager {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  getClips(): TimelinePlaylistClip[];
  getClipByIndex(index: number): TimelinePlaylistClip | undefined;
  replaceClips(clips: { sourceIndex: number; sourceName: string; inPoint: number; outPoint: number }[]): void;
  getLoopMode(): string;
  setLoopMode(mode: 'none' | 'single' | 'all'): void;
  setCurrentFrame(frame: number): void;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
}

/** Subset of TimelineEditor UI component the service touches. */
export interface TimelineEditorComponent {
  getEDL(): TimelineEDLEntry[];
  loadFromEDL(entries: TimelineEDLEntry[], labels?: string[]): void;
  loadFromSequenceNode(node: TimelineSequenceNode): void;
  setTotalFrames(frames: number): void;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
}

/** Subset of Timeline the service touches. */
export interface TimelineRefreshable {
  refresh(): void;
}

/** Subset of PersistenceManager the service touches. */
export interface TimelinePersistence {
  syncGTOStore(): void;
}

/** Callback for navigating to a playlist global frame. */
export type JumpToPlaylistGlobalFrame = (globalFrame: number) => void;

/** Predicate to check if a node is a SequenceGroupNode. */
export type IsSequenceGroupNode = (node: unknown) => node is TimelineSequenceNode;

export interface TimelineEditorServiceDeps {
  session: TimelineEditorSession;
  timelineEditor: TimelineEditorComponent;
  playlistManager: TimelinePlaylistManager;
  timeline: TimelineRefreshable;
  persistenceManager: TimelinePersistence;
  jumpToPlaylistGlobalFrame: JumpToPlaylistGlobalFrame;
  isSequenceGroupNode: IsSequenceGroupNode;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TimelineEditorService {
  private readonly session: TimelineEditorSession;
  private readonly timelineEditor: TimelineEditorComponent;
  private readonly playlistManager: TimelinePlaylistManager;
  private readonly timeline: TimelineRefreshable;
  private readonly persistenceManager: TimelinePersistence;
  private readonly jumpToPlaylistGlobalFrame: JumpToPlaylistGlobalFrame;
  private readonly isSequenceGroupNode: IsSequenceGroupNode;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(deps: TimelineEditorServiceDeps) {
    this.session = deps.session;
    this.timelineEditor = deps.timelineEditor;
    this.playlistManager = deps.playlistManager;
    this.timeline = deps.timeline;
    this.persistenceManager = deps.persistenceManager;
    this.jumpToPlaylistGlobalFrame = deps.jumpToPlaylistGlobalFrame;
    this.isSequenceGroupNode = deps.isSequenceGroupNode;
  }

  /**
   * Wire up timeline editor and session events.
   * Call once after construction.
   */
  bindEvents(): void {
    // Timeline editor UI events
    this.unsubscribers.push(
      this.timelineEditor.on('cutSelected', (data: unknown) => {
        const { cutIndex } = data as { cutIndex: number };
        this.handleCutSelected(cutIndex);
      }),
      this.timelineEditor.on('cutTrimmed', () => this.applyEdits()),
      this.timelineEditor.on('cutMoved', () => this.applyEdits()),
      this.timelineEditor.on('cutDeleted', () => this.applyEdits()),
      this.timelineEditor.on('cutInserted', () => this.applyEdits()),
      this.timelineEditor.on('cutSplit', () => this.applyEdits()),
    );

    // Session events that require re-sync
    this.unsubscribers.push(
      this.session.on('graphLoaded', () => this.syncFromGraph()),
      this.session.on('durationChanged', () => this.syncFromGraph()),
      this.session.on('sourceLoaded', () => this.syncFromGraph()),
    );

    // Playlist clips changed — re-sync only when no SequenceGroupNode exists
    this.unsubscribers.push(
      this.playlistManager.on('clipsChanged', () => {
        if (!this.getSequenceGroupNodeFromGraph()) {
          this.syncFromGraph();
        }
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Public methods (delegated from App)
  // -------------------------------------------------------------------------

  /** Find the SequenceGroupNode in the session graph, if any. */
  getSequenceGroupNodeFromGraph(): TimelineSequenceNode | null {
    const graph = this.session.graph;
    if (!graph) return null;
    const node = graph.getAllNodes().find((candidate) => this.isSequenceGroupNode(candidate));
    return this.isSequenceGroupNode(node) ? node : null;
  }

  /** Handle cut selection: navigate to the correct frame/source. */
  handleCutSelected(cutIndex: number): void {
    const sequenceNode = this.getSequenceGroupNodeFromGraph();
    if (sequenceNode) {
      const entry = this.timelineEditor.getEDL()[cutIndex];
      if (entry) {
        this.session.goToFrame(entry.frame);
      }
      return;
    }

    const playlistClip = this.playlistManager.getClipByIndex(cutIndex);
    if (playlistClip) {
      this.jumpToPlaylistGlobalFrame(playlistClip.globalStartFrame);
      return;
    }

    const entry = this.timelineEditor.getEDL()[cutIndex];
    if (!entry) return;

    if (entry.source >= 0 && entry.source < this.session.sourceCount) {
      if (this.session.currentSourceIndex !== entry.source) {
        this.session.setCurrentSource(entry.source);
      }
      const targetFrame = Math.max(1, Math.min(entry.inPoint, this.session.frameCount));
      this.session.goToFrame(targetFrame);
    }
  }

  /** Build a fallback EDL from the session's loaded sources. */
  buildFallbackEDLFromSources(): { edl: TimelineEDLEntry[]; labels: string[] } {
    const edl: TimelineEDLEntry[] = [];
    const labels: string[] = [];

    let nextFrame = 1;
    const sources = this.session.allSources;
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      if (!source) continue;

      const duration = Math.max(1, source.duration || 1);
      edl.push({
        frame: nextFrame,
        source: i,
        inPoint: 1,
        outPoint: duration,
      });
      labels.push(source.name || `Source ${i + 1}`);
      nextFrame += duration;
    }

    return { edl, labels };
  }

  /** Normalize an EDL: sanitize entries, recompute contiguous frame starts. */
  normalizeEDL(edl: TimelineEDLEntry[]): TimelineEDLEntry[] {
    const sanitized = edl
      .filter((entry) => Number.isFinite(entry.source))
      .map((entry) => ({
        frame: Math.max(1, Math.floor(entry.frame)),
        source: Math.max(0, Math.floor(entry.source)),
        inPoint: Math.max(1, Math.floor(entry.inPoint)),
        outPoint: Math.max(Math.max(1, Math.floor(entry.inPoint)), Math.floor(entry.outPoint)),
      }))
      .sort((a, b) => a.frame - b.frame);

    const normalized: TimelineEDLEntry[] = [];
    let nextFrame = 1;

    for (const entry of sanitized) {
      normalized.push({
        frame: nextFrame,
        source: entry.source,
        inPoint: entry.inPoint,
        outPoint: entry.outPoint,
      });
      nextFrame += entry.outPoint - entry.inPoint + 1;
    }

    return normalized;
  }

  /** Sync the timeline editor UI from the current session graph state. */
  syncFromGraph(): void {
    const sequenceNode = this.getSequenceGroupNodeFromGraph();
    if (sequenceNode) {
      this.timelineEditor.loadFromSequenceNode(sequenceNode);
      return;
    }

    const clips = this.playlistManager.getClips();
    if (clips.length > 0) {
      this.timelineEditor.loadFromEDL(
        clips.map((clip) => ({
          frame: clip.globalStartFrame,
          source: clip.sourceIndex,
          inPoint: clip.inPoint,
          outPoint: clip.outPoint,
        })),
        clips.map((clip) => clip.sourceName),
      );
      return;
    }

    const fallback = this.buildFallbackEDLFromSources();
    if (fallback.edl.length > 0) {
      this.timelineEditor.loadFromEDL(fallback.edl, fallback.labels);
      return;
    }

    this.timelineEditor.setTotalFrames(this.session.frameCount);
    this.timelineEditor.loadFromEDL([]);
  }

  /** Apply EDL edits to the playlist (no SequenceGroupNode path). */
  applyEditsToPlaylist(edl: TimelineEDLEntry[]): void {
    const clips = edl
      .filter((entry) => entry.source >= 0 && entry.source < this.session.sourceCount)
      .map((entry) => {
        const source = this.session.getSourceByIndex(entry.source);
        return {
          sourceIndex: entry.source,
          sourceName: source?.name || `Source ${entry.source + 1}`,
          inPoint: entry.inPoint,
          outPoint: entry.outPoint,
        };
      });

    this.playlistManager.replaceClips(clips);

    const playlistEnabled = this.playlistManager.isEnabled();
    if (clips.length === 0) {
      if (playlistEnabled) {
        this.playlistManager.setEnabled(false);
      }
    } else if (clips.length === 1) {
      // Single-cut edits should behave like native in/out trimming and use
      // session loop mode directly (no playlist runtime takeover).
      if (playlistEnabled) {
        this.playlistManager.setEnabled(false);
      }

      const clip = clips[0]!;
      if (this.session.currentSourceIndex !== clip.sourceIndex) {
        this.session.setCurrentSource(clip.sourceIndex);
      }
      this.session.setInPoint(clip.inPoint);
      this.session.setOutPoint(clip.outPoint);
      this.playlistManager.setCurrentFrame(1);

      if (this.session.currentFrame < clip.inPoint || this.session.currentFrame > clip.outPoint) {
        this.session.goToFrame(clip.inPoint);
      }
    } else {
      // Multi-cut timelines use playlist runtime for cross-cut playback.
      if (!playlistEnabled) {
        const mappedMode = this.session.loopMode === 'once' ? 'none' : 'all';
        this.playlistManager.setLoopMode(mappedMode as 'none' | 'single' | 'all');
        this.playlistManager.setEnabled(true);
      } else if (
        this.playlistManager.getLoopMode() === 'none' &&
        this.session.loopMode !== 'once'
      ) {
        // Preserve expected looping when user loop mode is not "once".
        this.playlistManager.setLoopMode('all');
      }
    }

    // Force immediate timeline redraw after EDL edits so canvas reflects
    // new in/out playback bounds without waiting for external resize.
    this.timeline.refresh();
    this.persistenceManager.syncGTOStore();
  }

  /** Normalize the current EDL and apply edits. */
  applyEdits(): void {
    const normalizedEDL = this.normalizeEDL(this.timelineEditor.getEDL());
    const sequenceNode = this.getSequenceGroupNodeFromGraph();
    if (!sequenceNode) {
      this.applyEditsToPlaylist(normalizedEDL);
      return;
    }

    sequenceNode.setEDL(normalizedEDL);

    const totalDuration = Math.max(1, sequenceNode.getTotalDurationFromEDL());
    this.session.setInPoint(1);
    this.session.setOutPoint(totalDuration);
    if (this.session.currentFrame > totalDuration) {
      this.session.goToFrame(totalDuration);
    }

    this.timelineEditor.loadFromEDL(normalizedEDL);
    this.timeline.refresh();
    this.persistenceManager.syncGTOStore();
  }

  /** Release all event subscriptions. */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }
}
