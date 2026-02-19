/**
 * OTIOWriter - Export playlist as OpenTimelineIO JSON
 *
 * Generates OTIO JSON from playlist clips and session sources.
 * The output is compatible with the existing OTIOParser import path,
 * enabling round-trip export → import.
 */

import type {
  OTIORationalTime,
  OTIOTimeRange,
  OTIOClip,
  OTIOGap,
  OTIOTransition,
  OTIOTrack,
  OTIOStack,
  OTIOTimeline,
  OTIOMediaReference,
  TransitionType,
} from './OTIOParser';

// ---------------------------------------------------------------------------
// Minimal interfaces — avoid hard dependency on full Session/PlaylistManager.
// ---------------------------------------------------------------------------

export interface OTIOExportClip {
  sourceName: string;
  sourceUrl: string;
  inPoint: number;       // 1-based frame within source
  outPoint: number;      // 1-based frame within source
  globalStartFrame: number;
  duration: number;      // outPoint - inPoint + 1
  fps: number;           // clip-level FPS (may differ per source)
}

/** Transition to insert between two clips */
export interface OTIOExportTransition {
  /** Display name */
  name?: string;
  /** Transition type (e.g. SMPTE_Dissolve, Custom_Transition) */
  transitionType: TransitionType;
  /** Frames borrowed from the outgoing (preceding) clip */
  inOffset: number;
  /** Frames borrowed from the incoming (following) clip */
  outOffset: number;
  /** FPS for the transition's rational times */
  fps: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/** A single track for multi-track export */
export interface OTIOExportTrack {
  /** Track name */
  name?: string;
  /** Clips on this track */
  clips: OTIOExportClip[];
  /** Transitions between clips (keyed by the index of the clip *before* the transition) */
  transitions?: Map<number, OTIOExportTransition>;
}

export interface OTIOExportOptions {
  name?: string;
  fps?: number;
}

export interface OTIOMultiTrackExportOptions extends OTIOExportOptions {
  /** Tracks to export. Each becomes a separate Video track in the Stack. */
  tracks: OTIOExportTrack[];
}

// ---------------------------------------------------------------------------
// OTIO node builders
// ---------------------------------------------------------------------------

function rationalTime(value: number, rate: number): OTIORationalTime {
  return { OTIO_SCHEMA: 'RationalTime.1', value, rate };
}

function timeRange(startValue: number, duration: number, rate: number): OTIOTimeRange {
  return {
    OTIO_SCHEMA: 'TimeRange.1',
    start_time: rationalTime(startValue, rate),
    duration: rationalTime(duration, rate),
  };
}

function buildClipNode(clip: OTIOExportClip): OTIOClip {
  const rate = clip.fps;
  const mediaRef: OTIOMediaReference = {
    OTIO_SCHEMA: 'ExternalReference.1',
    target_url: clip.sourceUrl,
  };

  return {
    OTIO_SCHEMA: 'Clip.1',
    name: clip.sourceName,
    source_range: timeRange(clip.inPoint, clip.duration, rate),
    media_reference: mediaRef,
  };
}

function buildGapNode(duration: number, rate: number): OTIOGap {
  return {
    OTIO_SCHEMA: 'Gap.1',
    source_range: timeRange(0, duration, rate),
  };
}

function buildTransitionNode(transition: OTIOExportTransition): OTIOTransition {
  const rate = transition.fps;
  const node: OTIOTransition = {
    OTIO_SCHEMA: 'Transition.1',
    name: transition.name,
    transition_type: transition.transitionType,
    in_offset: rationalTime(transition.inOffset, rate),
    out_offset: rationalTime(transition.outOffset, rate),
  };
  if (transition.metadata) {
    node.metadata = transition.metadata;
  }
  return node;
}

/**
 * Build track children (clips, gaps, transitions) from an export track definition.
 */
function buildTrackChildren(
  clips: OTIOExportClip[],
  transitions: Map<number, OTIOExportTransition> | undefined,
  defaultFps: number,
): (OTIOClip | OTIOGap | OTIOTransition)[] {
  const children: (OTIOClip | OTIOGap | OTIOTransition)[] = [];
  let timelinePosition = 1; // 1-based global frame tracker

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    const rate = clip.fps || defaultFps;

    // Insert gap if there's space before this clip
    const gapFrames = clip.globalStartFrame - timelinePosition;
    if (gapFrames > 0) {
      children.push(buildGapNode(gapFrames, rate));
    }

    children.push(buildClipNode(clip));
    timelinePosition = clip.globalStartFrame + clip.duration;

    // Insert transition after this clip if one is defined
    if (transitions?.has(i)) {
      const trans = transitions.get(i)!;
      children.push(buildTransitionNode(trans));
    }
  }

  return children;
}

// ---------------------------------------------------------------------------
// Export function
// ---------------------------------------------------------------------------

/**
 * Export playlist clips as an OTIO JSON string.
 *
 * Clips are placed sequentially on a single video track. Gaps between
 * clips (based on globalStartFrame differences) produce Gap.1 items.
 */
export function exportOTIO(clips: OTIOExportClip[], options?: OTIOExportOptions): string {
  const name = options?.name ?? 'Untitled Timeline';
  const defaultFps = options?.fps ?? 24;

  const children: (OTIOClip | OTIOGap)[] = [];
  let timelinePosition = 1; // 1-based global frame tracker

  for (const clip of clips) {
    const rate = clip.fps || defaultFps;

    // Insert gap if there's space between the current position and this clip's start
    const gapFrames = clip.globalStartFrame - timelinePosition;
    if (gapFrames > 0) {
      children.push(buildGapNode(gapFrames, rate));
    }

    children.push(buildClipNode(clip));
    timelinePosition = clip.globalStartFrame + clip.duration;
  }

  const track: OTIOTrack = {
    OTIO_SCHEMA: 'Track.1',
    name: 'Video Track',
    kind: 'Video',
    children,
  };

  const stack: OTIOStack = {
    OTIO_SCHEMA: 'Stack.1',
    children: [track],
  };

  const timeline: OTIOTimeline = {
    OTIO_SCHEMA: 'Timeline.1',
    name,
    global_start_time: rationalTime(0, defaultFps),
    tracks: stack,
  };

  return JSON.stringify(timeline, null, 2);
}

/**
 * Export a multi-track timeline with optional transitions as an OTIO JSON string.
 *
 * Each OTIOExportTrack becomes a separate Video track in the Stack.
 * Transitions are placed between clips according to the transition map.
 */
export function exportOTIOMultiTrack(options: OTIOMultiTrackExportOptions): string {
  const name = options.name ?? 'Untitled Timeline';
  const defaultFps = options.fps ?? 24;

  const otioTracks: OTIOTrack[] = [];

  for (let trackIdx = 0; trackIdx < options.tracks.length; trackIdx++) {
    const exportTrack = options.tracks[trackIdx]!;
    const trackName = exportTrack.name ?? `Video Track ${trackIdx + 1}`;

    const children = buildTrackChildren(exportTrack.clips, exportTrack.transitions, defaultFps);

    otioTracks.push({
      OTIO_SCHEMA: 'Track.1',
      name: trackName,
      kind: 'Video',
      children,
    });
  }

  const stack: OTIOStack = {
    OTIO_SCHEMA: 'Stack.1',
    children: otioTracks,
  };

  const timeline: OTIOTimeline = {
    OTIO_SCHEMA: 'Timeline.1',
    name,
    global_start_time: rationalTime(0, defaultFps),
    tracks: stack,
  };

  return JSON.stringify(timeline, null, 2);
}

// ---------------------------------------------------------------------------
// Convenience: build export clips from playlist + session sources
// ---------------------------------------------------------------------------

export interface OTIOSourceInfo {
  url: string;
  fps: number;
}

/**
 * Build OTIOExportClip array from playlist clips and source info.
 * This is the bridge between PlaylistManager data and the export function.
 */
export function buildExportClips(
  clips: Array<{
    sourceName: string;
    sourceIndex: number;
    inPoint: number;
    outPoint: number;
    globalStartFrame: number;
    duration: number;
  }>,
  getSource: (index: number) => OTIOSourceInfo | null,
  defaultFps?: number,
): OTIOExportClip[] {
  const result: OTIOExportClip[] = [];
  const fps = defaultFps ?? 24;

  for (const clip of clips) {
    const source = getSource(clip.sourceIndex);
    result.push({
      sourceName: clip.sourceName,
      sourceUrl: source?.url ?? '',
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
      globalStartFrame: clip.globalStartFrame,
      duration: clip.duration,
      fps: source?.fps ?? fps,
    });
  }

  return result;
}
