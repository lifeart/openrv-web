/**
 * Session Serializer
 *
 * Handles saving and loading of OpenRV Web projects (.orvproject files).
 */

import type { Session, MediaSource } from './Session';
import type {
  SessionState,
  MediaReference,
  ViewState,
} from './SessionState';
import { SESSION_STATE_VERSION, DEFAULT_VIEW_STATE, DEFAULT_PLAYBACK_STATE } from './SessionState';
import { DEFAULT_PLAYLIST_STATE } from './PlaylistManager';
import type { PlaylistManager } from './PlaylistManager';
import type { PaintEngine } from '../../paint/PaintEngine';
import type { Viewer } from '../../ui/components/Viewer';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';
import { DEFAULT_FILTER_SETTINGS } from '../../core/types/filter';
import { DEFAULT_TRANSFORM, DEFAULT_CROP_STATE, DEFAULT_CROP_REGION } from '../../core/types/transform';
import { DEFAULT_BACKGROUND_PATTERN_STATE } from '../../core/types/background';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';
import { DEFAULT_WIPE_STATE } from '../types/wipe';
import { DEFAULT_PAR_STATE } from '../../utils/media/PixelAspectRatio';
import type { Annotation, PaintEffects } from '../../paint/types';
import { DEFAULT_PAINT_EFFECTS } from '../../paint/types';
import { showFileReloadPrompt } from '../../ui/components/shared/Modal';

/** Components needed for serialization */
export interface SessionComponents {
  session: Session;
  paintEngine: PaintEngine;
  viewer: Viewer;
  playlistManager?: PlaylistManager;
}

/**
 * Session Serializer - handles save/load of .orvproject files
 */
export class SessionSerializer {
  /**
   * Serialize all session state to JSON
   */
  static toJSON(
    components: SessionComponents,
    projectName: string = 'Untitled'
  ): SessionState {
    const { session, paintEngine, viewer } = components;
    const now = new Date().toISOString();

    // Get paint state
    const paintJSON = paintEngine.toJSON() as {
      nextId: number;
      show: boolean;
      frames: Record<number, Annotation[]>;
      effects: PaintEffects;
    };

    // Get view state
    const pan = viewer.getPan();
    const viewState: ViewState = {
      zoom: viewer.getZoom(),
      panX: pan.x,
      panY: pan.y,
    };

    return {
      version: SESSION_STATE_VERSION,
      name: projectName,
      createdAt: now,
      modifiedAt: now,

      media: this.serializeMedia(session.allSources),

      playback: session.getPlaybackState(),

      paint: {
        nextId: paintJSON.nextId,
        show: paintJSON.show,
        frames: paintJSON.frames,
        effects: paintJSON.effects,
      },

      view: viewState,

      color: viewer.getColorAdjustments(),
      cdl: viewer.getCDL(),
      filters: viewer.getFilterSettings(),
      transform: viewer.getTransform(),
      crop: viewer.getCropState(),
      lens: viewer.getLensParams(),
      wipe: viewer.getWipeState(),
      stack: viewer.getStackLayers(),
      lutPath: viewer.getLUT()?.title,
      lutIntensity: viewer.getLUTIntensity(),
      par: viewer.getPARState(),
      backgroundPattern: viewer.getBackgroundPatternState(),
      ...(components.playlistManager ? { playlist: components.playlistManager.getState() } : {}),
      notes: session.noteManager.toSerializable(),
    };
  }

  /**
   * Convert media sources to portable references.
   *
   * Blob URLs (created when loading local files via File API) are session-specific
   * and become invalid when the browser session ends. These are detected and marked
   * with `requiresReload: true` so the user can re-select the file on project load.
   */
  private static serializeMedia(sources: MediaSource[]): MediaReference[] {
    return sources.map(source => {
      // Check if the URL is a blob URL (not portable across sessions)
      const isBlob = source.url.startsWith('blob:');

      const ref: MediaReference = {
        // Don't save blob URLs - they're session-specific and won't work on reload
        path: isBlob ? '' : source.url,
        name: source.name,
        type: source.type,
        width: source.width,
        height: source.height,
        duration: source.duration,
        fps: source.fps,
        // Only set requiresReload when true to keep saved files cleaner
        ...(isBlob && { requiresReload: true }),
      };

      if (source.type === 'sequence' && source.sequenceInfo) {
        ref.sequencePattern = source.sequenceInfo.pattern;
        ref.frameRange = {
          start: source.sequenceInfo.startFrame,
          end: source.sequenceInfo.endFrame,
        };
      }

      return ref;
    });
  }

  /**
   * Restore session state from JSON
   */
  static async fromJSON(
    state: SessionState,
    components: SessionComponents
  ): Promise<{ loadedMedia: number; warnings: string[] }> {
    const { session, paintEngine, viewer } = components;
    const warnings: string[] = [];

    // Version migration if needed
    const migrated = this.migrate(state);

    // Load media (track successes)
    let loadedMedia = 0;
    for (const ref of migrated.media) {
      try {
        // Handle files that require user to reload (originally blob URLs)
        if (ref.requiresReload) {
          const accept = ref.type === 'video' ? 'video/*' : 'image/*';
          const file = await showFileReloadPrompt(ref.name, {
            title: 'Reload File',
            accept,
          });

          if (file) {
            // User provided a file - load it
            try {
              await session.loadFile(file);
              loadedMedia++;
            } catch (loadErr) {
              warnings.push(`Failed to reload: ${ref.name}`);
            }
          } else {
            // User skipped - add warning
            warnings.push(`Skipped reload: ${ref.name}`);
          }
          continue;
        }

        // Defensive check: blob URLs should have been marked with requiresReload during save
        // If we encounter one here, it indicates a bug in serialization
        if (ref.path.startsWith('blob:')) {
          console.warn(`[SessionSerializer] Unexpected blob URL in saved project: ${ref.name}. This indicates a serialization bug.`);
          warnings.push(`Cannot load blob URL: ${ref.name}`);
          continue;
        }

        if (ref.type === 'image') {
          await session.loadImage(ref.name, ref.path);
          loadedMedia++;
        } else if (ref.type === 'video') {
          await session.loadVideo(ref.name, ref.path);
          loadedMedia++;
        } else if (ref.type === 'sequence') {
          // Sequences require file selection - emit warning
          warnings.push(`Sequence "${ref.name}" requires manual file selection`);
        }
      } catch (err) {
        warnings.push(`Failed to load: ${ref.name}`);
      }
    }

    // Restore playback state (only if media loaded)
    if (loadedMedia > 0) {
      session.setPlaybackState(migrated.playback);
    }

    // Restore playlist state when available (used by project save/load, snapshots,
    // and auto-save recovery in AppPersistenceManager).
    if (components.playlistManager) {
      if (migrated.playlist) {
        components.playlistManager.setState(migrated.playlist);
      } else {
        components.playlistManager.clear();
        components.playlistManager.setEnabled(false);
        components.playlistManager.setLoopMode('none');
        components.playlistManager.setCurrentFrame(1);
      }
    }

    // Restore paint/annotations
    const annotations: Annotation[] = Object.values(migrated.paint.frames).flat();
    paintEngine.loadFromAnnotations(annotations, migrated.paint.effects);

    // Restore viewer state
    viewer.setColorAdjustments(migrated.color);
    viewer.setCDL(migrated.cdl);
    viewer.setFilterSettings(migrated.filters);
    viewer.setTransform(migrated.transform);
    viewer.setCropState(migrated.crop);
    viewer.setLensParams(migrated.lens);
    viewer.setWipeState(migrated.wipe);
    viewer.setStackLayers(migrated.stack);
    viewer.setLUTIntensity(migrated.lutIntensity);
    if (migrated.par) {
      viewer.setPARState(migrated.par);
    }
    if (migrated.backgroundPattern) {
      viewer.setBackgroundPatternState(migrated.backgroundPattern);
    }
    viewer.setZoom(migrated.view.zoom);
    viewer.setPan(migrated.view.panX, migrated.view.panY);

    // Restore notes
    if (migrated.notes && migrated.notes.length > 0) {
      session.noteManager.fromSerializable(migrated.notes);
    }

    // LUT must be loaded separately (file reference)
    if (migrated.lutPath) {
      warnings.push(`LUT "${migrated.lutPath}" requires manual loading`);
    }

    return { loadedMedia, warnings };
  }

  /**
   * Migrate older versions to current
   */
  private static migrate(state: SessionState): SessionState {
    // Clone to avoid mutating input
    const migrated = JSON.parse(JSON.stringify(state)) as SessionState;

    // Apply migrations based on version
    if (migrated.version < SESSION_STATE_VERSION) {
      // Future: handle version migrations here
      migrated.version = SESSION_STATE_VERSION;
    }

    // Ensure all required fields have defaults
    migrated.playback = { ...DEFAULT_PLAYBACK_STATE, ...migrated.playback };
    migrated.view = { ...DEFAULT_VIEW_STATE, ...migrated.view };
    migrated.color = { ...DEFAULT_COLOR_ADJUSTMENTS, ...migrated.color };
    migrated.cdl = migrated.cdl ?? JSON.parse(JSON.stringify(DEFAULT_CDL));
    migrated.filters = { ...DEFAULT_FILTER_SETTINGS, ...migrated.filters };
    migrated.transform = { ...DEFAULT_TRANSFORM, ...migrated.transform };
    migrated.crop = {
      ...DEFAULT_CROP_STATE,
      ...migrated.crop,
      region: { ...DEFAULT_CROP_REGION, ...migrated.crop?.region },
    };
    migrated.lens = { ...DEFAULT_LENS_PARAMS, ...migrated.lens };
    migrated.wipe = { ...DEFAULT_WIPE_STATE, ...migrated.wipe };
    migrated.stack = migrated.stack ?? [];
    migrated.lutIntensity = migrated.lutIntensity ?? 1.0;
    migrated.par = migrated.par ? { ...DEFAULT_PAR_STATE, ...migrated.par } : undefined;
    migrated.backgroundPattern = migrated.backgroundPattern
      ? { ...DEFAULT_BACKGROUND_PATTERN_STATE, ...migrated.backgroundPattern }
      : undefined;
    if (migrated.playlist) {
      migrated.playlist = {
        ...DEFAULT_PLAYLIST_STATE,
        ...migrated.playlist,
        clips: Array.isArray(migrated.playlist.clips) ? migrated.playlist.clips : [],
      };
    }
    migrated.paint = migrated.paint ?? {
      nextId: 0,
      show: true,
      frames: {},
      effects: { ...DEFAULT_PAINT_EFFECTS },
    };

    return migrated;
  }

  /**
   * Save to .orvproject file (triggers download)
   */
  static async saveToFile(
    state: SessionState,
    filename: string = 'project.orvproject'
  ): Promise<void> {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.orvproject') ? filename : `${filename}.orvproject`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  /**
   * Load from .orvproject file
   */
  static async loadFromFile(file: File): Promise<SessionState> {
    const text = await file.text();
    const state = JSON.parse(text) as SessionState;

    // Validate basic structure
    if (typeof state.version !== 'number') {
      throw new Error('Invalid project file: missing version');
    }
    if (!state.media || !Array.isArray(state.media)) {
      throw new Error('Invalid project file: missing media array');
    }
    if (!state.playback) {
      throw new Error('Invalid project file: missing playback state');
    }

    return state;
  }

  /**
   * Create an empty session state with defaults
   */
  static createEmpty(name: string = 'Untitled'): SessionState {
    const now = new Date().toISOString();

    return {
      version: SESSION_STATE_VERSION,
      name,
      createdAt: now,
      modifiedAt: now,
      media: [],
      playback: { ...DEFAULT_PLAYBACK_STATE },
      paint: {
        nextId: 0,
        show: true,
        frames: {},
        effects: { ...DEFAULT_PAINT_EFFECTS },
      },
      view: { ...DEFAULT_VIEW_STATE },
      color: { ...DEFAULT_COLOR_ADJUSTMENTS },
      cdl: JSON.parse(JSON.stringify(DEFAULT_CDL)),
      filters: { ...DEFAULT_FILTER_SETTINGS },
      transform: { ...DEFAULT_TRANSFORM },
      crop: { ...DEFAULT_CROP_STATE, region: { ...DEFAULT_CROP_REGION } },
      lens: { ...DEFAULT_LENS_PARAMS },
      wipe: { ...DEFAULT_WIPE_STATE },
      stack: [],
      lutIntensity: 1.0,
    };
  }
}
