/**
 * Session State Types for Project Save/Load
 *
 * This module defines the serializable state interfaces for saving
 * and loading OpenRV Web projects (.orvproject files).
 */

import type { ColorAdjustments } from '../../ui/components/ColorControls';
import type { CDLValues } from '../../color/CDL';
import type { FilterSettings } from '../../ui/components/FilterControl';
import type { Transform2D } from '../../ui/components/TransformControl';
import type { CropState } from '../../ui/components/CropControl';
import type { LensDistortionParams } from '../../transform/LensDistortion';
import type { WipeState } from '../../ui/components/WipeControl';
import type { StackLayer } from '../../ui/components/StackControl';
import type { Annotation, PaintEffects } from '../../paint/types';
import type { LoopMode, MediaType, Marker } from './Session';
import type { PlaylistState } from './PlaylistManager';

/** Schema version for migration support */
export const SESSION_STATE_VERSION = 1;

/** Reference to a media file */
export interface MediaReference {
  /** Relative path from project file, or absolute URL */
  path: string;
  /** Original filename */
  name: string;
  /** Media type */
  type: MediaType;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Duration in frames */
  duration: number;
  /** Frames per second */
  fps: number;
  /** For sequences: pattern like "frame_####.exr" */
  sequencePattern?: string;
  /** For sequences: frame range */
  frameRange?: { start: number; end: number };
  /** True if original was a blob URL (requires user to reload file) */
  requiresReload?: boolean;
}

/** Playback state */
export interface PlaybackState {
  currentFrame: number;
  inPoint: number;
  outPoint: number;
  fps: number;
  loopMode: LoopMode;
  volume: number;
  muted: boolean;
  marks: Marker[] | number[]; // Support both old format (number[]) and new format (Marker[])
  currentSourceIndex: number;
}

/** Paint/annotation state (serializable version) */
export interface SerializedPaintState {
  nextId: number;
  show: boolean;
  /** Frame number -> annotations array */
  frames: Record<number, Annotation[]>;
  effects: PaintEffects;
}

/** View state (pan/zoom) */
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

/** Complete session state */
export interface SessionState {
  /** Schema version for migration */
  version: number;
  /** Human-readable project name */
  name: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last modified timestamp (ISO 8601) */
  modifiedAt: string;
  /** Media sources */
  media: MediaReference[];
  /** Playback configuration */
  playback: PlaybackState;
  /** Annotations */
  paint: SerializedPaintState;
  /** View configuration */
  view: ViewState;
  /** Color adjustments */
  color: ColorAdjustments;
  /** CDL grade */
  cdl: CDLValues;
  /** Filter effects */
  filters: FilterSettings;
  /** 2D transform */
  transform: Transform2D;
  /** Crop settings */
  crop: CropState;
  /** Lens distortion */
  lens: LensDistortionParams;
  /** Wipe comparison */
  wipe: WipeState;
  /** Layer stack */
  stack: StackLayer[];
  /** LUT file path (not embedded) */
  lutPath?: string;
  /** LUT intensity blend */
  lutIntensity: number;
  /** Playlist state (optional) */
  playlist?: PlaylistState;
}

/** Default values for empty state */
export const DEFAULT_VIEW_STATE: ViewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const DEFAULT_PLAYBACK_STATE: PlaybackState = {
  currentFrame: 1,
  inPoint: 1,
  outPoint: 1,
  fps: 24,
  loopMode: 'loop',
  volume: 0.7,
  muted: false,
  marks: [],
  currentSourceIndex: 0,
};
