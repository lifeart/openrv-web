/**
 * ShotGridIntegrationBridge - Wires ShotGridConfigUI, ShotGridPanel,
 * and ShotGridBridge together with the application session.
 *
 * Handles:
 * - Connect/disconnect lifecycle
 * - Loading versions from playlists and shots
 * - Loading media into the session
 * - Pushing/pulling notes with deduplication
 * - Pushing status
 * - Race condition prevention via generation counter
 */

import { ShotGridBridge, ShotGridAPIError, mapStatusFromShotGrid, mapNoteStatusToShotGrid, mapNoteStatusFromShotGrid, type ShotGridNote, type ShotGridVersion, type AnnotationSummary } from './ShotGridBridge';
import type { ShotGridConfigUI } from './ShotGridConfig';
import type { ShotGridPanel } from '../ui/components/ShotGridPanel';
import type { Session } from '../core/session/Session';
import type { Note } from '../core/session/NoteManager';
import type { PlaylistManager } from '../core/session/PlaylistManager';
import type { Annotation } from '../paint/types';
import { isVideoExtension } from '../utils/media/SupportedMediaFormats';
import { isSequencePattern } from '../utils/media/SequenceLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Provider interface for paint annotations. Decouples the integration bridge
 * from the UI-layer PaintEngine so that annotation data can be read without
 * a direct dependency on PaintEngine.
 */
export interface AnnotationProvider {
  /** Return all annotations visible on a given frame */
  getAnnotationsForFrame(frame: number): Annotation[];
}

/**
 * Provider interface for rendering annotation thumbnails. Decouples the
 * integration bridge from PaintRenderer / canvas so that thumbnails can
 * be produced without pulling in the full rendering stack.
 */
export interface ThumbnailRenderer {
  /** Render annotations to a Blob (PNG). Returns null if rendering fails. */
  renderAnnotationThumbnail(annotations: Annotation[], width: number, height: number): Promise<Blob | null>;
}

export interface ShotGridIntegrationContext {
  session: Session;
  configUI: ShotGridConfigUI;
  panel: ShotGridPanel;
  /** Optional PlaylistManager — when provided, loadPlaylist also builds a review playlist */
  playlistManager?: PlaylistManager;
  /** Optional annotation provider — when provided, pushNotes includes annotation metadata */
  annotationProvider?: AnnotationProvider;
  /** Optional thumbnail renderer — when provided, pushNotes uploads annotation thumbnails */
  thumbnailRenderer?: ThumbnailRenderer;
}

export interface NoteResult {
  total: number;
  pushed: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// ShotGridIntegrationBridge
// ---------------------------------------------------------------------------

export class ShotGridIntegrationBridge {
  private readonly session: Session;
  private readonly configUI: ShotGridConfigUI;
  private readonly panel: ShotGridPanel;
  private readonly playlistManager: PlaylistManager | null;
  private readonly annotationProvider: AnnotationProvider | null;
  private readonly thumbnailRenderer: ThumbnailRenderer | null;
  private bridge: ShotGridBridge | null = null;
  private generation = 0;
  private disposed = false;
  private unsubscribers: (() => void)[] = [];

  /** SG note ID -> local note ID (for deduplication) */
  private sgNoteIdMap = new Map<number, string>();

  constructor(ctx: ShotGridIntegrationContext) {
    this.session = ctx.session;
    this.configUI = ctx.configUI;
    this.panel = ctx.panel;
    this.playlistManager = ctx.playlistManager ?? null;
    this.annotationProvider = ctx.annotationProvider ?? null;
    this.thumbnailRenderer = ctx.thumbnailRenderer ?? null;
  }

  /**
   * Wire all events between configUI, panel, bridge, and session.
   */
  setup(): void {
    // Connect
    this.unsubscribers.push(
      this.configUI.on('connect', async (config) => {
        this.generation++;
        const gen = this.generation;

        try {
          this.bridge = new ShotGridBridge(config);
          await this.bridge.authenticate();

          if (gen !== this.generation || this.disposed) return;

          this.configUI.setState('connected');
          this.panel.setConnected(true);
        } catch (err) {
          if (gen !== this.generation || this.disposed) return;

          this.bridge?.dispose();
          this.bridge = null;

          const message =
            err instanceof ShotGridAPIError
              ? `Auth failed (${err.status}): ${err.message}`
              : err instanceof Error
                ? err.message
                : 'Connection failed';

          this.configUI.setState('error', message);
          this.panel.setConnected(false);
        }
      }),
    );

    // Config loaded from storage — pre-fill only (do not auto-connect)
    this.unsubscribers.push(
      this.configUI.on('configLoaded', () => {
        // Form fields are already populated by loadConfig().
        // We intentionally don't auto-connect: the user must click Connect
        // because the API key may not be stored (security default).
      }),
    );

    // Disconnect
    this.unsubscribers.push(
      this.configUI.on('disconnect', () => {
        this.generation++;
        this.bridge?.dispose();
        this.bridge = null;
        this.panel.setConnected(false);
        this.panel.setVersions([]);
        this.sgNoteIdMap.clear();
      }),
    );

    // Load playlist
    this.unsubscribers.push(
      this.panel.on('loadPlaylist', async ({ playlistId }) => {
        if (!this.bridge) return;
        const gen = ++this.generation;

        this.panel.setLoading(true);
        try {
          const versions = await this.bridge.getVersionsForPlaylist(playlistId);
          if (gen !== this.generation || this.disposed) return;
          this.panel.setVersions(versions);

          // Build a review playlist if PlaylistManager is available
          if (this.playlistManager && versions.length > 0) {
            await this.buildPlaylistFromVersions(versions, gen);
          }
        } catch (err) {
          if (gen !== this.generation || this.disposed) return;
          this.handleError(err);
        } finally {
          if (gen === this.generation) this.panel.setLoading(false);
        }
      }),
    );

    // Load shot
    this.unsubscribers.push(
      this.panel.on('loadShot', async ({ shotId }) => {
        if (!this.bridge) return;
        const gen = ++this.generation;

        this.panel.setLoading(true);
        try {
          const versions = await this.bridge.getVersionsForShot(shotId);
          if (gen !== this.generation || this.disposed) return;
          this.panel.setVersions(versions);
        } catch (err) {
          if (gen !== this.generation || this.disposed) return;
          this.handleError(err);
        } finally {
          if (gen === this.generation) this.panel.setLoading(false);
        }
      }),
    );

    // Load single version by ID
    this.unsubscribers.push(
      this.panel.on('loadVersionById', async ({ versionId }) => {
        if (!this.bridge) return;
        const gen = ++this.generation;

        this.panel.setLoading(true);
        try {
          const version = await this.bridge.getVersionById(versionId);
          if (gen !== this.generation || this.disposed) return;
          this.panel.setVersions(version ? [version] : []);
        } catch (err) {
          if (gen !== this.generation || this.disposed) return;
          this.handleError(err);
        } finally {
          if (gen === this.generation) this.panel.setLoading(false);
        }
      }),
    );

    // Load version media
    this.unsubscribers.push(
      this.panel.on('loadVersion', async ({ version, mediaUrl }) => {
        if (!mediaUrl) return;
        const gen = this.generation;

        try {
          await this.loadVersionMedia(version, mediaUrl);

          if (gen !== this.generation || this.disposed) return;

          const sourceIndex = this.session.sourceCount - 1;
          this.panel.mapVersionToSource(version.id, sourceIndex);

          // Apply SG status to StatusManager
          const localStatus = mapStatusFromShotGrid(version.sg_status_list);
          this.session.statusManager.setStatus(sourceIndex, localStatus, 'ShotGrid');

          // Register in VersionManager so version navigation works
          this.registerVersionInManager(version, sourceIndex);
        } catch (err) {
          if (gen !== this.generation || this.disposed) return;
          this.handleError(err);
        }
      }),
    );

    // Push notes
    this.unsubscribers.push(
      this.panel.on('pushNotes', async ({ versionId, sourceIndex }) => {
        if (!this.bridge) return;

        const notes = this.session.noteManager.getNotesForSource(sourceIndex);
        if (notes.length === 0) return;

        // Sort notes so parents are pushed before children (topological order).
        // Top-level notes (parentId === null) come first, then children.
        const sorted = topologicalSortNotes(notes);

        // Map local note ID -> ShotGrid note ID for reply linkage
        const localToSgId = new Map<string, number>();

        let pushed = 0;
        let failed = 0;

        for (const note of sorted) {
          if (!this.bridge || this.disposed) break;
          try {
            const frameRange =
              note.frameStart !== note.frameEnd ? `${note.frameStart}-${note.frameEnd}` : String(note.frameStart);

            // Collect annotation summaries for the note's frame range
            const annotations = this.collectAnnotationSummaries(note.frameStart, note.frameEnd);

            // Render a thumbnail if annotations exist and a renderer is available
            let thumbnailBlob: Blob | null = null;
            if (annotations.length > 0 && this.thumbnailRenderer && this.annotationProvider) {
              // Gather raw annotations for the first frame (representative thumbnail)
              const rawAnnotations = this.annotationProvider.getAnnotationsForFrame(note.frameStart);
              if (rawAnnotations.length > 0) {
                thumbnailBlob = await this.thumbnailRenderer.renderAnnotationThumbnail(rawAnnotations, 960, 540);
              }
            }

            // Resolve reply-to SG note ID from parent
            let replyToNoteId: number | undefined;
            if (note.parentId) {
              replyToNoteId = localToSgId.get(note.parentId);
            }

            const sgNote = await this.bridge.pushNote(versionId, {
              text: note.text,
              frameRange,
              annotations: annotations.length > 0 ? annotations : undefined,
              thumbnailBlob: thumbnailBlob ?? undefined,
              replyToNoteId,
              noteStatus: mapNoteStatusToShotGrid(note.status),
            });

            localToSgId.set(note.id, sgNote.id);
            this.sgNoteIdMap.set(sgNote.id, note.id);
            pushed++;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.warn(`[ShotGrid] Failed to push note "${note.text.slice(0, 40)}": ${message}`);
            failed++;
          }
        }

        if (failed > 0) {
          this.panel.setError(`${pushed} of ${notes.length} notes pushed, ${failed} failed`);
        }
      }),
    );

    // Pull notes
    this.unsubscribers.push(
      this.panel.on('pullNotes', async ({ versionId, sourceIndex }) => {
        if (!this.bridge) return;

        try {
          const sgNotes = await this.bridge.getNotesForVersion(versionId);
          this.addNotesFromShotGrid(sgNotes, sourceIndex);
        } catch (err) {
          this.handleError(err);
        }
      }),
    );

    // Push status
    this.unsubscribers.push(
      this.panel.on('pushStatus', async ({ versionId, sourceIndex }) => {
        if (!this.bridge) return;

        try {
          const status = this.session.statusManager.getStatus(sourceIndex);
          await this.bridge.pushStatus(versionId, status);
        } catch (err) {
          this.handleError(err);
        }
      }),
    );

    // Restore saved config after all listeners are wired
    this.configUI.restoreConfig();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    this.bridge?.dispose();
    this.bridge = null;
    this.sgNoteIdMap.clear();
  }

  // ---- Private ----

  /**
   * Build a review playlist from ShotGrid versions by loading each version's
   * media into the session and then wiring clips into the PlaylistManager.
   * Preserves the order from ShotGrid's playlist.
   */
  private async buildPlaylistFromVersions(versions: ShotGridVersion[], gen: number): Promise<void> {
    if (!this.playlistManager) return;

    const clipInputs: Array<{ sourceIndex: number; sourceName: string; version: ShotGridVersion }> = [];

    for (const version of versions) {
      if (gen !== this.generation || this.disposed) return;

      const mediaUrl = this.panel.resolveMediaUrl(version);
      if (!mediaUrl) continue;

      try {
        await this.loadVersionMedia(version, mediaUrl);
        if (gen !== this.generation || this.disposed) return;

        const sourceIndex = this.session.sourceCount - 1;
        this.panel.mapVersionToSource(version.id, sourceIndex);

        // Apply SG status to StatusManager
        const localStatus = mapStatusFromShotGrid(version.sg_status_list);
        this.session.statusManager.setStatus(sourceIndex, localStatus, 'ShotGrid');

        // Register in VersionManager so version navigation works
        this.registerVersionInManager(version, sourceIndex);

        clipInputs.push({ sourceIndex, sourceName: version.code, version });
      } catch (err) {
        // Log but continue with remaining versions
        const message = err instanceof Error ? err.message : 'Failed to load version';
        console.warn(`[ShotGrid] Skipping version ${version.code}: ${message}`);
      }
    }

    if (gen !== this.generation || this.disposed) return;

    if (clipInputs.length > 0) {
      this.playlistManager.replaceClips(
        clipInputs.map((c) => ({
          sourceIndex: c.sourceIndex,
          sourceName: c.sourceName,
          inPoint: 1,
          outPoint: this.getSourceFrameCount(c.sourceIndex),
          metadata: { sgVersionId: c.version.id, sgShotName: c.version.entity.name },
        })),
      );
      this.playlistManager.setEnabled(true);
    }
  }

  /**
   * Load a single version's media into the session.
   * Shared by both individual loadVersion events and batch playlist building.
   */
  private async loadVersionMedia(version: ShotGridVersion, mediaUrl: string): Promise<void> {
    const isFrameSequencePath = mediaUrl === version.sg_path_to_frames &&
      !version.sg_uploaded_movie?.url &&
      !(version.sg_path_to_movie && (version.sg_path_to_movie.startsWith('http://') || version.sg_path_to_movie.startsWith('https://')));

    if (isFrameSequencePath && isSequencePattern(mediaUrl)) {
      console.info(`[ShotGrid] Loading frame sequence path: ${mediaUrl}`);

      const startFrame = version.sg_first_frame ?? 1;
      const endFrame = version.sg_last_frame ?? this.parseEndFrameFromRange(version.frame_range, startFrame);

      await this.session.loadImageSequenceFromPattern(
        version.code,
        mediaUrl,
        startFrame,
        endFrame,
      );
    } else {
      const cleanUrl = mediaUrl.split('?')[0]!.split('#')[0]!;
      const rawExt = cleanUrl.split('.').pop() ?? '';
      const isVideo = isVideoExtension(rawExt.toLowerCase());
      if (isVideo) {
        await this.session.loadVideo(version.code, mediaUrl);
      } else {
        await this.session.loadImage(version.code, mediaUrl);
      }
    }
  }

  /**
   * Get the frame count (duration) for a loaded source.
   * Falls back to 1 if the source cannot be found.
   */
  private getSourceFrameCount(sourceIndex: number): number {
    const source = this.session.getSourceByIndex(sourceIndex);
    if (source && typeof source.duration === 'number' && source.duration > 0) {
      return source.duration;
    }
    return 1;
  }

  /**
   * Register a loaded ShotGrid version in the session's VersionManager.
   * Uses the shot entity name as the group key so multiple versions of the
   * same shot are grouped together for version navigation.
   */
  private registerVersionInManager(version: ShotGridVersion, sourceIndex: number): void {
    const vm = this.session.versionManager;
    if (!vm) return;
    const shotName = version.entity.name;
    const label = version.code;

    // Look for an existing group for this shot
    const existingGroup = vm.getGroups().find((g) => g.shotName === shotName);

    if (existingGroup) {
      // Add to existing group
      vm.addVersionToGroup(existingGroup.id, sourceIndex, {
        label,
        metadata: { sgVersionId: String(version.id), sgStatus: version.sg_status_list },
      });
    } else {
      // Create a new group for this shot
      vm.createGroup(shotName, [sourceIndex], {
        labels: [label],
      });
    }
  }

  /**
   * Collect annotation summaries for a frame range by querying the annotation provider.
   * Returns an empty array if no annotation provider is configured.
   */
  private collectAnnotationSummaries(frameStart: number, frameEnd: number): AnnotationSummary[] {
    if (!this.annotationProvider) return [];

    const summaries: AnnotationSummary[] = [];
    const seenIds = new Set<string>();

    for (let frame = frameStart; frame <= frameEnd; frame++) {
      const annotations = this.annotationProvider.getAnnotationsForFrame(frame);
      for (const ann of annotations) {
        // Deduplicate annotations that span multiple frames
        if (seenIds.has(ann.id)) continue;
        seenIds.add(ann.id);

        summaries.push({
          frame: ann.frame,
          type: ann.type,
          user: ann.user,
          description: summarizeAnnotation(ann),
        });
      }
    }

    return summaries;
  }

  private addNotesFromShotGrid(sgNotes: ShotGridNote[], sourceIndex: number): void {
    // Map SG note ID -> local note ID so we can resolve reply_to_entity references
    // within this batch. The sgNoteIdMap also tracks across batches.
    const sgIdToLocalId = new Map<number, string>();

    // Pre-populate from existing mappings
    for (const [sgId, localId] of this.sgNoteIdMap) {
      sgIdToLocalId.set(sgId, localId);
    }

    // Sort notes so parents come before children. If ShotGrid returns a reply
    // before its parent, the parentId won't resolve without this sort.
    const sorted = topologicalSortShotGridNotes(sgNotes);

    for (const sgNote of sorted) {
      const sgExternalId = String(sgNote.id);

      // Fast-path dedup: check in-memory map first
      if (this.sgNoteIdMap.has(sgNote.id)) continue;

      // Fallback dedup: check persisted externalId in note manager
      // (survives disconnect/reconnect since notes are stored on the manager)
      const existing = this.session.noteManager.findNoteByExternalId(sgExternalId);
      if (existing) {
        // Re-populate the in-memory cache so future checks are fast
        this.sgNoteIdMap.set(sgNote.id, existing.id);
        sgIdToLocalId.set(sgNote.id, existing.id);
        continue;
      }

      // Extract frame range from ShotGrid note, falling back to 1-1
      let frameStart = 1;
      let frameEnd = 1;

      if (sgNote.sg_first_frame != null && sgNote.sg_last_frame != null) {
        frameStart = sgNote.sg_first_frame;
        frameEnd = sgNote.sg_last_frame;
      } else if (sgNote.frame_range) {
        const match = sgNote.frame_range.match(/^(\d+)-(\d+)$/);
        if (match) {
          frameStart = parseInt(match[1]!, 10);
          frameEnd = parseInt(match[2]!, 10);
        }
      }

      // Resolve parentId from ShotGrid reply_to_entity
      let parentId: string | undefined;
      if (sgNote.reply_to_entity) {
        parentId = sgIdToLocalId.get(sgNote.reply_to_entity.id);
      }

      // Map ShotGrid note status to local NoteStatus
      const status = mapNoteStatusFromShotGrid(sgNote.sg_status_list ?? null);

      const localNote = this.session.noteManager.addNote(
        sourceIndex,
        frameStart,
        frameEnd,
        sgNote.content || sgNote.subject,
        sgNote.user.name,
        {
          createdAt: sgNote.created_at || undefined,
          externalId: sgExternalId,
          parentId,
          status,
        },
      );

      this.sgNoteIdMap.set(sgNote.id, localNote.id);
      sgIdToLocalId.set(sgNote.id, localNote.id);
    }
  }

  /**
   * Extract the end frame from a frame_range string like '1001-1100'.
   * Falls back to startFrame if the range cannot be parsed.
   */
  private parseEndFrameFromRange(frameRange: string | null, startFrame: number): number {
    if (!frameRange) return startFrame;
    const match = frameRange.match(/^(\d+)-(\d+)$/);
    if (match) {
      return parseInt(match[2]!, 10);
    }
    return startFrame;
  }

  private handleError(err: unknown): void {
    if (err instanceof ShotGridAPIError && err.status === 401) {
      this.configUI.setState('error', 'Authentication expired. Please reconnect.');
      this.panel.setConnected(false);
      this.bridge?.dispose();
      this.bridge = null;
    } else {
      const message = err instanceof Error ? err.message : 'An error occurred';
      this.panel.setError(message);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a human-readable summary string for an annotation.
 */
function summarizeAnnotation(ann: Annotation): string {
  switch (ann.type) {
    case 'pen':
      return `${ann.points.length}-point stroke`;
    case 'text':
      return ann.text.length > 40 ? ann.text.slice(0, 40) + '...' : ann.text;
    case 'shape':
      return `${ann.shapeType} shape`;
    default:
      return 'annotation';
  }
}

/**
 * Sort ShotGrid notes so that parent notes come before their children.
 * Top-level notes (reply_to_entity === null) appear first, followed by
 * their replies in order. This ensures parent SG IDs are resolved
 * before children reference them during pull.
 */
function topologicalSortShotGridNotes(sgNotes: ShotGridNote[]): ShotGridNote[] {
  const topLevel: ShotGridNote[] = [];
  const childrenMap = new Map<number, ShotGridNote[]>();

  for (const note of sgNotes) {
    if (note.reply_to_entity === null) {
      topLevel.push(note);
    } else {
      let children = childrenMap.get(note.reply_to_entity.id);
      if (!children) {
        children = [];
        childrenMap.set(note.reply_to_entity.id, children);
      }
      children.push(note);
    }
  }

  const result: ShotGridNote[] = [];
  const visit = (note: ShotGridNote): void => {
    result.push(note);
    const children = childrenMap.get(note.id);
    if (children) {
      for (const child of children) {
        visit(child);
      }
    }
  };

  for (const note of topLevel) {
    visit(note);
  }

  // Append any orphaned children (parent not in this batch)
  for (const note of sgNotes) {
    if (!result.includes(note)) {
      result.push(note);
    }
  }

  return result;
}

/**
 * Sort notes so that parent notes come before their children.
 * Top-level notes (parentId === null) appear first, followed by
 * their replies in order. This ensures parent SG IDs are available
 * when pushing child notes.
 */
function topologicalSortNotes(notes: Note[]): Note[] {
  const topLevel: Note[] = [];
  const childrenMap = new Map<string, Note[]>();

  for (const note of notes) {
    if (note.parentId === null) {
      topLevel.push(note);
    } else {
      let children = childrenMap.get(note.parentId);
      if (!children) {
        children = [];
        childrenMap.set(note.parentId, children);
      }
      children.push(note);
    }
  }

  const result: Note[] = [];
  const visit = (note: Note): void => {
    result.push(note);
    const children = childrenMap.get(note.id);
    if (children) {
      for (const child of children) {
        visit(child);
      }
    }
  };

  for (const note of topLevel) {
    visit(note);
  }

  // Append any orphaned children (parent not in this source's notes)
  for (const note of notes) {
    if (!result.includes(note)) {
      result.push(note);
    }
  }

  return result;
}
