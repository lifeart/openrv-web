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

import { ShotGridBridge, ShotGridAPIError, mapStatusFromShotGrid, type ShotGridNote, type ShotGridVersion } from './ShotGridBridge';
import type { ShotGridConfigUI } from './ShotGridConfig';
import type { ShotGridPanel } from '../ui/components/ShotGridPanel';
import type { Session } from '../core/session/Session';
import { isVideoExtension } from '../utils/media/SupportedMediaFormats';
import { isSequencePattern } from '../utils/media/SequenceLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShotGridIntegrationContext {
  session: Session;
  configUI: ShotGridConfigUI;
  panel: ShotGridPanel;
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
          const isFrameSequencePath = mediaUrl === version.sg_path_to_frames &&
            !version.sg_uploaded_movie?.url &&
            !(version.sg_path_to_movie && (version.sg_path_to_movie.startsWith('http://') || version.sg_path_to_movie.startsWith('https://')));

          if (isFrameSequencePath && isSequencePattern(mediaUrl)) {
            // Route frame-sequence paths through the sequence loader
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

        let pushed = 0;
        let failed = 0;

        for (const note of notes) {
          if (!this.bridge || this.disposed) break;
          try {
            const frameRange =
              note.frameStart !== note.frameEnd ? `${note.frameStart}-${note.frameEnd}` : String(note.frameStart);

            const sgNote = await this.bridge.pushNote(versionId, {
              text: note.text,
              frameRange,
            });

            this.sgNoteIdMap.set(sgNote.id, note.id);
            pushed++;
          } catch {
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

  private addNotesFromShotGrid(sgNotes: ShotGridNote[], sourceIndex: number): void {
    for (const sgNote of sgNotes) {
      const sgExternalId = String(sgNote.id);

      // Fast-path dedup: check in-memory map first
      if (this.sgNoteIdMap.has(sgNote.id)) continue;

      // Fallback dedup: check persisted externalId in note manager
      // (survives disconnect/reconnect since notes are stored on the manager)
      const existing = this.session.noteManager.findNoteByExternalId(sgExternalId);
      if (existing) {
        // Re-populate the in-memory cache so future checks are fast
        this.sgNoteIdMap.set(sgNote.id, existing.id);
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

      const localNote = this.session.noteManager.addNote(
        sourceIndex,
        frameStart,
        frameEnd,
        sgNote.content || sgNote.subject,
        sgNote.user.name,
        {
          createdAt: sgNote.created_at || undefined,
          externalId: sgExternalId,
        },
      );

      this.sgNoteIdMap.set(sgNote.id, localNote.id);
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
