/**
 * Type definitions for the Session module.
 *
 * These were extracted from Session.ts to reduce file size
 * and improve maintainability.
 */

import type { EventMap } from '../../utils/EventEmitter';
import type { RVEDLEntry } from '../../formats/RVEDLParser';
import type { SequenceFrame, SequenceInfo } from '../../utils/media/SequenceLoader';
import type { VideoSourceNode } from '../../nodes/sources/VideoSourceNode';
import type { FileSourceNode } from '../../nodes/sources/FileSourceNode';
import type { ProceduralSourceNode } from '../../nodes/sources/ProceduralSourceNode';
import type { UnsupportedCodecError, CodecFamily } from '../../utils/media/CodecUtils';
import type { Annotation, PaintEffects } from '../../paint/types';
import type { ColorAdjustments, ChannelMode, LinearizeState, ChannelSwizzle } from '../../core/types/color';
import type { FilterSettings } from '../../core/types/filter';
import type { Transform2D, CropState, UncropState } from '../../core/types/transform';
import type { NoiseReductionParams } from '../../filters/NoiseReduction';
import type { ScopesState } from '../../core/types/scopes';
import type { CDLValues } from '../../color/CDL';
import type { LensDistortionParams } from '../../transform/LensDistortion';
import type { StereoState } from '../types/stereo';
import type { StereoEyeTransformState, StereoAlignMode } from '../../stereo/StereoEyeTransform';
import type { LoopMode, MediaType, PlaybackMode } from '../types/session';
import type { GTOParseResult, SkippedNodeInfo } from './GTOGraphLoader';
import type { DegradedModeInfo } from '../../composite/BlendModes';
import type { SubFramePosition } from '../../utils/media/FrameInterpolator';
import type { FPSMeasurement } from './PlaybackEngine';
import type { Marker } from './MarkerManager';
import type { MediaRepresentation } from '../types/representation';

export interface GTOComponentDTO {
  property(name: string): {
    value(): unknown;
  };
}

export interface ParsedAnnotations {
  annotations: Annotation[];
  effects?: Partial<PaintEffects>;
}

/**
 * Information about an unsupported video codec
 */
export interface UnsupportedCodecInfo {
  filename: string;
  codec: string | null;
  codecFamily: CodecFamily;
  error: UnsupportedCodecError;
}

export interface GTOViewSettings {
  colorAdjustments?: Partial<ColorAdjustments>;
  filterSettings?: FilterSettings;
  cdl?: CDLValues;
  transform?: Transform2D;
  lens?: LensDistortionParams;
  crop?: CropState;
  channelMode?: ChannelMode;
  stereo?: StereoState;
  stereoEyeTransform?: StereoEyeTransformState;
  stereoAlignMode?: StereoAlignMode;
  scopes?: ScopesState;
  linearize?: LinearizeState;
  noiseReduction?: NoiseReductionParams;
  uncrop?: UncropState;
  outOfRange?: number; // 0=off, 1=clamp-to-black, 2=highlight
  channelSwizzle?: ChannelSwizzle;
}

/**
 * Matte overlay settings for letterbox/pillarbox display
 */
export interface MatteSettings {
  show: boolean;
  aspect: number; // Target aspect ratio (e.g., 2.35 for cinemascope)
  opacity: number; // Matte opacity (0-1)
  heightVisible: number; // Visible height fraction (-1 = auto)
  centerPoint: [number, number]; // Center offset
}

/**
 * Session metadata from GTO file
 */
export interface SessionMetadata {
  displayName: string;
  comment: string;
  version: number;
  origin: string;
  creationContext: number;
  clipboard: number;
  membershipContains: string[];
  /** Real-time playback rate (0 means use fps) */
  realtime: number;
  /** Background color as RGBA float array (0-1 range). Default: 18% gray */
  bgColor: [number, number, number, number];
}

/**
 * Audio playback error types
 */
export interface AudioPlaybackError {
  type: 'autoplay' | 'decode' | 'network' | 'aborted' | 'unknown';
  message: string;
  originalError?: Error;
}

export interface SessionEvents extends EventMap {
  frameChanged: number;
  playbackChanged: boolean;
  sourceLoaded: MediaSource;
  sessionLoaded: void;
  durationChanged: number;
  currentSourceChanged: number;
  inOutChanged: { inPoint: number; outPoint: number };
  loopModeChanged: LoopMode;
  playbackModeChanged: PlaybackMode;
  playDirectionChanged: number;
  playbackSpeedChanged: number;
  preservesPitchChanged: boolean;
  audioScrubEnabledChanged: boolean;
  audioScrubAvailabilityChanged: boolean;
  marksChanged: ReadonlyMap<number, Marker>;
  annotationsLoaded: ParsedAnnotations;
  settingsLoaded: GTOViewSettings;
  volumeChanged: number;
  mutedChanged: boolean;
  graphLoaded: GTOParseResult;
  /** Emitted when nodes are skipped during GTO import (lossy import warning) */
  skippedNodes: SkippedNodeInfo[];
  /** Emitted when composite modes are degraded during GTO import (lossy import warning) */
  degradedModes: DegradedModeInfo[];
  fpsChanged: number;
  abSourceChanged: { current: 'A' | 'B'; sourceIndex: number };
  // New events for GTO session integration
  paintEffectsLoaded: Partial<PaintEffects>;
  matteChanged: MatteSettings;
  metadataChanged: SessionMetadata;
  frameIncrementChanged: number;
  // Audio playback events
  audioError: AudioPlaybackError;
  // Codec events
  unsupportedCodec: UnsupportedCodecInfo;
  /** Emitted when HDR video is silently downgraded to SDR due to VideoSampleSink failure */
  hdrDowngraded: { filename: string };
  // Buffering events
  buffering: boolean;
  // Sub-frame interpolation events
  interpolationEnabledChanged: boolean;
  subFramePositionChanged: SubFramePosition | null;
  // FPS measurement events
  fpsUpdated: FPSMeasurement;
  // Frame decode timeout in play-all-frames mode
  frameDecodeTimeout: number;
  // EDL events
  edlLoaded: RVEDLEntry[];
  // Note/comment events
  notesChanged: void;
  versionsChanged: void;
  // Playback stopped (pause + return to start)
  playbackStopped: void;
  statusChanged: { sourceIndex: number; status: string; previous: string };
  statusesChanged: void;
  // Range shifting events
  rangeShifted: { inPoint: number; outPoint: number };
  // Representation events
  representationChanged: {
    sourceIndex: number;
    previousRepId: string | null;
    newRepId: string;
    representation: MediaRepresentation;
  };
  representationError: {
    sourceIndex: number;
    repId: string;
    error: string;
    userInitiated: boolean;
  };
  fallbackActivated: {
    sourceIndex: number;
    failedRepId: string;
    fallbackRepId: string;
    fallbackRepresentation: MediaRepresentation;
  };
}

export interface MediaSource {
  type: MediaType;
  name: string;
  url: string;
  width: number;
  height: number;
  duration: number; // in frames
  fps: number;
  element?: HTMLImageElement | HTMLVideoElement | ImageBitmap;
  // Sequence-specific data
  sequenceInfo?: SequenceInfo;
  sequenceFrames?: SequenceFrame[];
  // Video source node for mediabunny frame extraction
  videoSourceNode?: VideoSourceNode;
  // File source node for EXR files (supports layer selection)
  fileSourceNode?: FileSourceNode;
  // Procedural source node for test patterns (movieproc)
  proceduralSourceNode?: ProceduralSourceNode;
  // OPFS cache key (set after successful cache put)
  opfsCacheKey?: string;

  // --- Multiple Media Representations (MMR) ---
  /** All available representations for this source. Undefined or empty array = legacy mode. */
  representations?: MediaRepresentation[];
  /** Index into `representations` for the currently active one. -1 or undefined = legacy mode. */
  activeRepresentationIndex?: number;
}
