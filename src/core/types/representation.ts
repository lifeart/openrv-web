/**
 * Multiple Media Representations (MMR) Type Definitions
 *
 * Defines types for per-source representation switching,
 * allowing a single logical source to carry multiple alternative
 * media (e.g. full-res frames, proxy video, streaming URL).
 */

import type { BaseSourceNode } from '../../nodes/sources/BaseSourceNode';

/** The kind of media representation */
export type RepresentationKind = 'frames' | 'movie' | 'proxy' | 'streaming';

/** Lifecycle status of a representation */
export type RepresentationStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Resolution descriptor */
export interface RepresentationResolution {
  width: number;
  height: number;
}

/**
 * A single media representation within a source.
 * Each representation encapsulates everything needed to load and render
 * one version of the content.
 */
export interface MediaRepresentation {
  /** Unique ID within the source (crypto.randomUUID() or manually assigned) */
  id: string;
  /** Human-readable label, e.g. "EXR Full (4096x2160)" */
  label: string;
  /** Kind determines loader strategy and UI icon */
  kind: RepresentationKind;
  /** Lower number = higher preference. 0 = full-res. */
  priority: number;
  /** Current lifecycle status */
  status: RepresentationStatus;
  /** Native resolution of this representation */
  resolution: RepresentationResolution;
  /** Pixel aspect ratio (1.0 = square pixels; != 1.0 for anamorphic) */
  par: number;
  /** The loaded source node (null until status === 'ready') */
  sourceNode: BaseSourceNode | null;
  /** Error message if status === 'error' */
  errorInfo?: string;
  /** Loader configuration for lazy/re-loading */
  loaderConfig: RepresentationLoaderConfig;
  /** Whether this representation has an audio track */
  audioTrackPresent: boolean;
  /**
   * Start frame / timecode offset for this representation.
   * EXR sequences often start at frame 1001 (editorial convention)
   * while proxy MOVs start at frame 0. Used for frame-accurate switching.
   */
  startFrame: number;
  /**
   * Color space metadata for this representation.
   * Avoids re-detection on switch and enables correct OCIO input transform.
   */
  colorSpace?: {
    /** e.g. 'sRGB', 'PQ', 'HLG', 'linear' */
    transferFunction?: string;
    /** e.g. 'bt709', 'bt2020', 'aces' */
    colorPrimaries?: string;
  };
}

/**
 * Serializable loader configuration.
 * The loader factory uses `kind` + these fields to construct the right loader.
 */
export interface RepresentationLoaderConfig {
  /** For file-based: the File object (runtime-only, not serializable) */
  file?: File;
  /** For file-based: the path or filename */
  path?: string;
  /** For URL-based: the URL */
  url?: string;
  /** For sequences: the file list (runtime-only, not serializable) */
  files?: File[];
  /** For sequences: glob pattern */
  pattern?: string;
  /** For sequences: frame range */
  frameRange?: { start: number; end: number };
  /** FPS override */
  fps?: number;
  /** OPFS cache key for resilience against File reference invalidation */
  opfsCacheKey?: string;
}

/**
 * Serialized representation for project save/load.
 * Excludes runtime-only fields like sourceNode and File objects.
 */
export interface SerializedRepresentation {
  id: string;
  label: string;
  kind: RepresentationKind;
  priority: number;
  resolution: RepresentationResolution;
  par: number;
  audioTrackPresent: boolean;
  startFrame: number;
  colorSpace?: {
    transferFunction?: string;
    colorPrimaries?: string;
  };
  loaderConfig: Omit<RepresentationLoaderConfig, 'file' | 'files'> & {
    path?: string;
    pattern?: string;
    opfsCacheKey?: string;
  };
}

/**
 * Configuration for adding a new representation to a source.
 */
export interface AddRepresentationConfig {
  /** Optional explicit ID (defaults to crypto.randomUUID()) */
  id?: string;
  /** Human-readable label */
  label?: string;
  /** The kind of representation */
  kind: RepresentationKind;
  /** Priority (lower = preferred) */
  priority?: number;
  /** Native resolution */
  resolution: RepresentationResolution;
  /** Pixel aspect ratio (default: 1.0) */
  par?: number;
  /** Whether this representation has an audio track */
  audioTrackPresent?: boolean;
  /** Start frame / timecode offset */
  startFrame?: number;
  /** Color space metadata */
  colorSpace?: {
    transferFunction?: string;
    colorPrimaries?: string;
  };
  /** Loader configuration */
  loaderConfig: RepresentationLoaderConfig;
  /** Optional pre-loaded source node (skips loading) */
  sourceNode?: BaseSourceNode;
}

/**
 * Options for switching representations.
 */
export interface SwitchRepresentationOptions {
  /** Whether this switch was initiated by the user (affects fallback behavior) */
  userInitiated?: boolean;
}

/**
 * Events emitted by MediaRepresentationManager.
 */
export interface RepresentationManagerEvents {
  [event: string]: unknown;
  /** Fired when the active representation changes */
  representationChanged: {
    sourceIndex: number;
    previousRepId: string | null;
    newRepId: string;
    representation: MediaRepresentation;
  };
  /** Fired when a representation encounters an error */
  representationError: {
    sourceIndex: number;
    repId: string;
    error: string;
    userInitiated: boolean;
  };
  /** Fired when auto-fallback activates a different representation */
  fallbackActivated: {
    sourceIndex: number;
    failedRepId: string;
    fallbackRepId: string;
    fallbackRepresentation: MediaRepresentation;
  };
}

/**
 * Generate a unique representation ID.
 * Uses crypto.randomUUID if available, falls back to a simple random string.
 */
export function generateRepresentationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `rep-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create a MediaRepresentation from an AddRepresentationConfig.
 */
export function createRepresentation(config: AddRepresentationConfig): MediaRepresentation {
  return {
    id: config.id ?? generateRepresentationId(),
    label: config.label ?? `${config.kind} (${config.resolution.width}x${config.resolution.height})`,
    kind: config.kind,
    priority: config.priority ?? getDefaultPriority(config.kind),
    status: config.sourceNode ? 'ready' : 'idle',
    resolution: { ...config.resolution },
    par: config.par ?? 1.0,
    sourceNode: config.sourceNode ?? null,
    loaderConfig: { ...config.loaderConfig },
    audioTrackPresent: config.audioTrackPresent ?? false,
    startFrame: config.startFrame ?? 0,
    colorSpace: config.colorSpace ? { ...config.colorSpace } : undefined,
  };
}

/**
 * Get the default priority for a representation kind.
 */
function getDefaultPriority(kind: RepresentationKind): number {
  switch (kind) {
    case 'frames':
      return 0;
    case 'movie':
      return 1;
    case 'proxy':
      return 2;
    case 'streaming':
      return 3;
  }
}

/**
 * Serialize a MediaRepresentation for project save.
 */
export function serializeRepresentation(rep: MediaRepresentation): SerializedRepresentation {
  const { file: _file, files: _files, ...serializableConfig } = rep.loaderConfig;
  return {
    id: rep.id,
    label: rep.label,
    kind: rep.kind,
    priority: rep.priority,
    resolution: { ...rep.resolution },
    par: rep.par,
    audioTrackPresent: rep.audioTrackPresent,
    startFrame: rep.startFrame,
    colorSpace: rep.colorSpace ? { ...rep.colorSpace } : undefined,
    loaderConfig: { ...serializableConfig },
  };
}

/**
 * Deserialize a SerializedRepresentation back to a MediaRepresentation (in idle state).
 */
export function deserializeRepresentation(serialized: SerializedRepresentation): MediaRepresentation {
  return {
    id: serialized.id,
    label: serialized.label,
    kind: serialized.kind,
    priority: serialized.priority,
    status: 'idle',
    resolution: { ...serialized.resolution },
    par: serialized.par,
    sourceNode: null,
    loaderConfig: { ...serialized.loaderConfig },
    audioTrackPresent: serialized.audioTrackPresent,
    startFrame: serialized.startFrame,
    colorSpace: serialized.colorSpace ? { ...serialized.colorSpace } : undefined,
  };
}
