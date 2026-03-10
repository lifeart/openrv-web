/**
 * Session Serializer
 *
 * Handles saving and loading of OpenRV Web projects (.orvproject files).
 */

import type { Session } from './Session';
import type { MediaSource } from './SessionTypes';
import type { SessionState, MediaReference, ViewState } from './SessionState';
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
import { DEFAULT_NOISE_REDUCTION_PARAMS } from '../../filters/NoiseReduction';
import { DEFAULT_WATERMARK_STATE } from '../../ui/components/WatermarkOverlay';
import type { Annotation, PaintEffects } from '../../paint/types';
import { DEFAULT_PAINT_EFFECTS } from '../../paint/types';
import { showFileReloadPrompt } from '../../ui/components/shared/Modal';
import type { MediaCacheManager } from '../../cache/MediaCacheManager';
import { serializeRepresentation } from '../types/representation';
import { DEFAULT_TONE_MAPPING_STATE } from '../types/effects';
import { DEFAULT_GAMUT_MAPPING_STATE } from '../types/effects';
import { DEFAULT_STEREO_STATE } from '../types/stereo';
import { DEFAULT_GHOST_FRAME_STATE } from '../../ui/components/GhostFrameControl';
import { DEFAULT_DISPLAY_COLOR_STATE } from '../../color/DisplayTransfer';
import { DEFAULT_DIFFERENCE_MATTE_STATE } from '../../ui/components/DifferenceMatteControl';
import { DEFAULT_BLEND_MODE_STATE } from '../../ui/components/ComparisonManager';
import { isDefaultCurves } from '../../color/ColorCurves';
import {
  isDefaultStereoEyeTransformState,
  DEFAULT_STEREO_ALIGN_MODE,
} from '../../stereo/StereoRenderer';
import { isDeinterlaceActive } from '../../filters/Deinterlace';
import { isFilmEmulationActive } from '../../filters/FilmEmulation';
import { isPerspectiveActive } from '../../transform/PerspectiveCorrection';

/** Components needed for serialization */
export interface SessionComponents {
  session: Session;
  paintEngine: PaintEngine;
  viewer: Viewer;
  playlistManager?: PlaylistManager;
  cacheManager?: MediaCacheManager;
}

/**
 * Describes a viewer state that is not currently serialized.
 * Each gap includes enough context for UI warnings and future implementation.
 */
export interface SerializationGap {
  /** Human-readable name of the unserialized state */
  name: string;
  /** Which subsystem owns this state (color, view, compare) */
  category: 'color' | 'view' | 'compare';
  /** Whether the state is currently active / non-default */
  isActive: boolean;
  /** Brief explanation of impact when this state is not persisted */
  impact: string;
}

/**
 * Session Serializer - handles save/load of .orvproject files
 */
export class SessionSerializer {
  // TODO: The following viewer states are NOT serialized and will be lost on
  // save/load. Each is tracked by getSerializationGaps() so callers can warn
  // users about data that won't survive a round-trip.
  //
  // Color pipeline gaps:
  //   - OCIO configuration (config name, input/working/display color spaces, view, look)
  //   - Display profile (transfer function, display gamma)
  //   - Gamut mapping (mode, source/target gamut)
  //   - Color inversion (enabled/disabled)
  //   - Curves (per-channel curve adjustments)
  //
  // View/comparison gaps:
  //   - Tone mapping (operator + parameters)
  //   - Ghost frames (enabled, frame count, opacity, tint)
  //   - Stereo mode (mode, eye swap, offset)
  //   - Stereo eye transforms (per-eye flip, rotation, scale, translate)
  //   - Stereo align mode (off, grid, crosshair, difference, edges)
  //   - Compare state: difference matte (enabled, gain, heatmap)
  //   - Compare state: blend mode (mode, opacity, flicker frame)
  //   - Compare state: A/B compare assignment (sourceAIndex, sourceBIndex, etc.) (fix #132)
  //   - Channel isolation mode (R/G/B/A/luminance)
  //
  // Effects-tab gaps (fix #130):
  //   - Deinterlace (enabled, mode)
  //   - Film emulation (enabled, stock, intensity)
  //   - Perspective correction (enabled, corner points, quality)
  //   - Stabilization (enabled, smoothing, crop mode)
  //   - Uncrop (active, dimensions, offset)

  /**
   * Return the list of viewer states that are NOT currently serialized,
   * annotated with whether each is active (non-default) on the given viewer.
   *
   * This allows callers to warn users before saving or after loading.
   */
  static getSerializationGaps(viewer: Viewer): SerializationGap[] {
    const gaps: SerializationGap[] = [];

    // --- Color pipeline gaps ---

    gaps.push({
      name: 'OCIO configuration',
      category: 'color',
      isActive: viewer.isOCIOEnabled(),
      impact: 'OCIO color space transforms will revert to defaults on reload',
    });

    const displayColor = viewer.getDisplayColorState();
    const displayColorActive =
      displayColor.transferFunction !== DEFAULT_DISPLAY_COLOR_STATE.transferFunction ||
      displayColor.displayGamma !== DEFAULT_DISPLAY_COLOR_STATE.displayGamma;
    gaps.push({
      name: 'Display profile',
      category: 'color',
      isActive: displayColorActive,
      impact: 'Display transfer function and gamma will revert to defaults on reload',
    });

    const gamutMapping = viewer.getGamutMappingState();
    const gamutMappingActive = gamutMapping.mode !== DEFAULT_GAMUT_MAPPING_STATE.mode;
    gaps.push({
      name: 'Gamut mapping',
      category: 'color',
      isActive: gamutMappingActive,
      impact: 'Gamut mapping will be disabled on reload',
    });

    const colorInversion = viewer.getColorInversion();
    gaps.push({
      name: 'Color inversion',
      category: 'color',
      isActive: colorInversion,
      impact: 'Color inversion will be disabled on reload',
    });

    const curves = viewer.getCurves();
    gaps.push({
      name: 'Curves',
      category: 'color',
      isActive: !isDefaultCurves(curves),
      impact: 'Curve adjustments will revert to identity on reload',
    });

    // --- View gaps ---

    const toneMapping = viewer.getToneMappingState();
    const toneMappingActive = toneMapping.enabled || toneMapping.operator !== DEFAULT_TONE_MAPPING_STATE.operator;
    gaps.push({
      name: 'Tone mapping',
      category: 'view',
      isActive: toneMappingActive,
      impact: 'Tone mapping operator and parameters will revert to defaults on reload',
    });

    const ghostFrame = viewer.getGhostFrameState();
    const ghostFrameActive = ghostFrame.enabled !== DEFAULT_GHOST_FRAME_STATE.enabled;
    gaps.push({
      name: 'Ghost frames',
      category: 'view',
      isActive: ghostFrameActive,
      impact: 'Ghost frame overlay will be disabled on reload',
    });

    const stereo = viewer.getStereoState();
    const stereoActive = stereo.mode !== DEFAULT_STEREO_STATE.mode;
    gaps.push({
      name: 'Stereo mode',
      category: 'view',
      isActive: stereoActive,
      impact: 'Stereo display mode will revert to off on reload',
    });

    const stereoEyeTransforms = viewer.getStereoEyeTransforms();
    gaps.push({
      name: 'Stereo eye transforms',
      category: 'view',
      isActive: !isDefaultStereoEyeTransformState(stereoEyeTransforms),
      impact: 'Per-eye stereo transforms will revert to identity on reload',
    });

    const stereoAlignMode = viewer.getStereoAlignMode();
    gaps.push({
      name: 'Stereo align mode',
      category: 'view',
      isActive: stereoAlignMode !== DEFAULT_STEREO_ALIGN_MODE,
      impact: 'Stereo alignment overlay will be disabled on reload',
    });

    const channelMode = viewer.getChannelMode();
    const channelActive = channelMode !== 'rgb';
    gaps.push({
      name: 'Channel isolation',
      category: 'view',
      isActive: channelActive,
      impact: 'Channel isolation will revert to RGB on reload',
    });

    // --- Effects-tab gaps (fix #130) ---

    const deinterlaceParams = viewer.getDeinterlaceParams();
    gaps.push({
      name: 'Deinterlace',
      category: 'view',
      isActive: isDeinterlaceActive(deinterlaceParams),
      impact: 'Deinterlace settings will revert to defaults on reload',
    });

    const filmEmulationParams = viewer.getFilmEmulationParams();
    gaps.push({
      name: 'Film emulation',
      category: 'view',
      isActive: isFilmEmulationActive(filmEmulationParams),
      impact: 'Film emulation settings will revert to defaults on reload',
    });

    const perspectiveParams = viewer.getPerspectiveParams();
    gaps.push({
      name: 'Perspective correction',
      category: 'view',
      isActive: isPerspectiveActive(perspectiveParams),
      impact: 'Perspective correction will revert to defaults on reload',
    });

    const stabilizationParams = viewer.getStabilizationParams();
    gaps.push({
      name: 'Stabilization',
      category: 'view',
      isActive: stabilizationParams.enabled === true,
      impact: 'Stabilization settings will revert to defaults on reload',
    });

    const uncropActive = viewer.isUncropActive();
    gaps.push({
      name: 'Uncrop',
      category: 'view',
      isActive: uncropActive,
      impact: 'Uncrop padding will be removed on reload',
    });

    // --- Compare gaps ---

    const differenceMatte = viewer.getDifferenceMatteState();
    const differenceMatteActive = differenceMatte.enabled !== DEFAULT_DIFFERENCE_MATTE_STATE.enabled;
    gaps.push({
      name: 'Difference matte',
      category: 'compare',
      isActive: differenceMatteActive,
      impact: 'Difference matte comparison will be disabled on reload',
    });

    const blendMode = viewer.getBlendModeState();
    const blendModeActive = blendMode.mode !== DEFAULT_BLEND_MODE_STATE.mode;
    gaps.push({
      name: 'Blend mode',
      category: 'compare',
      isActive: blendModeActive,
      impact: 'Blend mode comparison will revert to off on reload',
    });

    // TODO(#132): A/B compare assignment state (sourceAIndex, sourceBIndex, etc.)
    // is not persisted. Only wipe mode/position is saved via the wipe state.
    // console.info('[SessionSerializer] A/B compare assignment state is not persisted in .orvproject files.');

    return gaps;
  }

  /**
   * Serialize all session state to JSON
   */
  static toJSON(components: SessionComponents, projectName: string = 'Untitled'): SessionState {
    const { session, paintEngine, viewer } = components;
    const now = new Date().toISOString();

    // Warn about viewer states that won't be persisted
    const gaps = this.getSerializationGaps(viewer);
    const activeGaps = gaps.filter((g) => g.isActive);
    if (activeGaps.length > 0) {
      const names = activeGaps.map((g) => g.name).join(', ');
      console.warn(
        `[SessionSerializer] The following active viewer states are NOT saved in the project file: ${names}. ` +
          `These will revert to defaults when the project is reloaded.`,
      );
    }

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

      media: this.serializeMedia(session.allSources, components.cacheManager),

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
      noiseReduction: viewer.getNoiseReductionParams(),
      watermark: viewer.getWatermarkState(),
      lutPath: viewer.getLUT()?.title,
      lutIntensity: viewer.getLUTIntensity(),
      par: viewer.getPARState(),
      backgroundPattern: viewer.getBackgroundPatternState(),
      ...(components.playlistManager ? { playlist: components.playlistManager.getState() } : {}),
      // TODO(#126): The node graph serializer exists (SessionGTOExporter) but is not wired
      // into .orvproject save/load. The `graph` field in SessionState schema is reserved for
      // this purpose but requires careful design to avoid breaking existing projects.
      // graph: undefined,
      notes: session.noteManager.toSerializable(),
      versionGroups: session.versionManager.toSerializable(),
      statuses: session.statusManager.toSerializable(),
    };
  }

  /**
   * Convert media sources to portable references.
   *
   * Blob URLs (created when loading local files via File API) are session-specific
   * and become invalid when the browser session ends. These are detected and marked
   * with `requiresReload: true` so the user can re-select the file on project load.
   */
  private static serializeMedia(sources: MediaSource[], cacheManager?: MediaCacheManager): MediaReference[] {
    return sources.map((source) => {
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

      // Include OPFS cache key when the cache entry is stable (write complete)
      if (isBlob && source.opfsCacheKey && cacheManager?.isStable(source.opfsCacheKey)) {
        ref.opfsCacheKey = source.opfsCacheKey;
      }

      if (source.type === 'sequence' && source.sequenceInfo) {
        ref.sequencePattern = source.sequenceInfo.pattern;
        ref.frameRange = {
          start: source.sequenceInfo.startFrame,
          end: source.sequenceInfo.endFrame,
        };
      }

      // Serialize representations (if any)
      if (source.representations && source.representations.length > 0) {
        ref.representations = source.representations.map(serializeRepresentation);
        const activeIdx = source.activeRepresentationIndex ?? -1;
        if (activeIdx >= 0 && activeIdx < source.representations.length) {
          const activeRep = source.representations[activeIdx];
          if (activeRep) {
            ref.activeRepresentationId = activeRep.id;
          }
        }
      }

      return ref;
    });
  }

  /**
   * Restore session state from JSON
   */
  static async fromJSON(
    state: SessionState,
    components: SessionComponents,
  ): Promise<{ loadedMedia: number; warnings: string[] }> {
    const { session, paintEngine, viewer } = components;
    const warnings: string[] = [];

    // Version migration if needed
    const migrated = this.migrate(state);

    // Clear existing media before loading new project to replace the session (fix #121).
    session.clearSources();

    // Load media (track successes)
    let loadedMedia = 0;
    for (const ref of migrated.media) {
      try {
        // Handle files that require user to reload (originally blob URLs)
        if (ref.requiresReload) {
          // Attempt to load from OPFS cache first
          if (ref.opfsCacheKey && components.cacheManager) {
            try {
              const cached = await components.cacheManager.get(ref.opfsCacheKey);
              if (cached) {
                const cachedFile = new File([cached], ref.name, {
                  type: ref.type === 'video' ? 'video/mp4' : 'image/png',
                });
                await session.loadFile(cachedFile);
                loadedMedia++;
                continue;
              }
            } catch {
              // Cache lookup failed – fall through to file picker
            }
          }

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
            } catch (_loadErr) {
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
          console.warn(
            `[SessionSerializer] Unexpected blob URL in saved project: ${ref.name}. This indicates a serialization bug.`,
          );
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
      } catch (_err) {
        warnings.push(`Failed to load: ${ref.name}`);
      }
    }

    // TODO(#134): Media representations and activeRepresentationId are serialized
    // in toJSON() but never restored here. On project load, representations are
    // lost and the active representation is not reselected. This needs a
    // representation rebuild + reselect pass after media loading completes.
    console.info(
      '[SessionSerializer] Media representations are saved but not restored on load. ' +
        'Active representation selection will be lost.',
    );

    // Restore playback state regardless of media count (fix #124).
    // Playback settings (loop mode, volume, etc.) are valid even without media.
    session.setPlaybackState(migrated.playback);

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
    viewer.setNoiseReductionParams(migrated.noiseReduction ?? DEFAULT_NOISE_REDUCTION_PARAMS);
    viewer.setWatermarkState(migrated.watermark ?? DEFAULT_WATERMARK_STATE);
    viewer.setLUTIntensity(migrated.lutIntensity);
    if (migrated.par) {
      viewer.setPARState(migrated.par);
    }
    if (migrated.backgroundPattern) {
      viewer.setBackgroundPatternState(migrated.backgroundPattern);
    }
    viewer.setZoom(migrated.view.zoom);
    viewer.setPan(migrated.view.panX, migrated.view.panY);

    // Restore notes (fix #123: always call, even for empty arrays, to clear old data)
    if (migrated.notes) {
      session.noteManager.fromSerializable(migrated.notes);
    }

    // Restore version groups (fix #123: always call, even for empty arrays, to clear old data)
    if (migrated.versionGroups) {
      session.versionManager.fromSerializable(migrated.versionGroups);
    }

    // Restore statuses (fix #123: always call, even for empty arrays, to clear old data)
    if (migrated.statuses) {
      session.statusManager.fromSerializable(migrated.statuses);
    }

    // LUT must be loaded separately (file reference) — binary LUT data is not
    // embedded in the project file, so the user needs to re-apply the LUT manually.
    if (migrated.lutPath) {
      const intensityNote =
        migrated.lutIntensity !== undefined && migrated.lutIntensity !== 1.0
          ? ` (intensity was ${migrated.lutIntensity})`
          : '';
      warnings.push(
        `LUT "${migrated.lutPath}" needs to be reloaded manually${intensityNote}. ` +
          `The LUT intensity setting has been preserved.`,
      );
    }

    // Reset omitted viewer states to defaults so that stale state from the
    // previous session does not leak into the newly-loaded project (fix #136).
    viewer.resetToneMappingState();
    viewer.resetGhostFrameState();
    viewer.resetStereoState();
    viewer.resetStereoEyeTransforms();
    viewer.resetStereoAlignMode();
    viewer.resetChannelMode();
    viewer.resetDifferenceMatteState();

    // Append warnings about viewer states that are not persisted in the project
    // file, so the caller can surface them to the user.  Only warn about gaps
    // that are *actively* non-default — clean loads should not produce gap
    // warnings (fix #137).
    const gaps = this.getSerializationGaps(viewer);
    const activeGaps = gaps.filter((g) => g.isActive);
    if (activeGaps.length > 0) {
      const gapNames = activeGaps.map((g) => g.name);
      warnings.push(
        `The following viewer states are not saved in project files and use defaults: ${gapNames.join(', ')}. ` +
          `Adjust them manually if needed after loading.`,
      );
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
    migrated.noiseReduction = { ...DEFAULT_NOISE_REDUCTION_PARAMS, ...migrated.noiseReduction };
    migrated.watermark = { ...DEFAULT_WATERMARK_STATE, ...migrated.watermark };
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
        // Preserve transitions array if present
        transitions: Array.isArray(migrated.playlist.transitions) ? migrated.playlist.transitions : undefined,
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
  static async saveToFile(state: SessionState, filename: string = 'project.orvproject'): Promise<void> {
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
      noiseReduction: { ...DEFAULT_NOISE_REDUCTION_PARAMS },
      watermark: { ...DEFAULT_WATERMARK_STATE },
      lutIntensity: 1.0,
    };
  }
}
