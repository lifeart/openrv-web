/**
 * OTIOParser - Parse OpenTimelineIO JSON format
 *
 * OpenTimelineIO (OTIO) is an interchange format for editorial timeline information.
 * This parser handles the JSON serialization format and extracts clip information
 * suitable for playlist integration.
 */

/** OTIO rational time */
export interface OTIORationalTime {
  OTIO_SCHEMA: 'RationalTime.1';
  value: number;
  rate: number;
}

/** OTIO time range */
export interface OTIOTimeRange {
  OTIO_SCHEMA: 'TimeRange.1';
  start_time: OTIORationalTime;
  duration: OTIORationalTime;
}

/** OTIO media reference */
export interface OTIOMediaReference {
  OTIO_SCHEMA: string; // 'ExternalReference.1' or 'MissingReference.1'
  target_url?: string;
  available_range?: OTIOTimeRange;
}

/** OTIO marker */
export interface OTIOMarker {
  OTIO_SCHEMA: 'Marker.1';
  name: string;
  color?: string;
  marked_range?: OTIOTimeRange;
  metadata?: Record<string, unknown>;
}

/** OTIO clip */
export interface OTIOClip {
  OTIO_SCHEMA: 'Clip.1';
  name: string;
  source_range?: OTIOTimeRange;
  media_reference?: OTIOMediaReference;
  markers?: OTIOMarker[];
  metadata?: Record<string, unknown>;
}

/** OTIO gap */
export interface OTIOGap {
  OTIO_SCHEMA: 'Gap.1';
  name?: string;
  source_range?: OTIOTimeRange;
}

/** OTIO transition */
export interface OTIOTransition {
  OTIO_SCHEMA: 'Transition.1';
  name?: string;
  transition_type?: string;
  in_offset?: OTIORationalTime;
  out_offset?: OTIORationalTime;
  metadata?: Record<string, unknown>;
}

/** OTIO track item (union type) */
export type OTIOTrackItem = OTIOClip | OTIOGap | OTIOTransition;

/** OTIO track */
export interface OTIOTrack {
  OTIO_SCHEMA: 'Track.1';
  name: string;
  kind: string; // 'Video', 'Audio'
  children: OTIOTrackItem[];
  markers?: OTIOMarker[];
}

/** OTIO stack (collection of tracks) */
export interface OTIOStack {
  OTIO_SCHEMA: 'Stack.1';
  name?: string;
  children: OTIOTrack[];
}

/** OTIO timeline (top-level) */
export interface OTIOTimeline {
  OTIO_SCHEMA: 'Timeline.1';
  name: string;
  global_start_time?: OTIORationalTime;
  tracks: OTIOStack;
  markers?: OTIOMarker[];
  metadata?: Record<string, unknown>;
}

/** Parsed clip result for playlist integration */
export interface ParsedOTIOClip {
  name: string;
  sourceUrl?: string;
  inFrame: number;
  outFrame: number;
  timelineInFrame: number;
  timelineOutFrame: number;
  metadata?: Record<string, unknown>;
}

/**
 * Mapping from OTIO marker color names to hex values.
 * Covers the standard colors defined by the OTIO Marker schema.
 */
export const OTIO_MARKER_COLOR_MAP: Record<string, string> = {
  RED: '#ff4444',
  PINK: '#ff88cc',
  ORANGE: '#ff8800',
  YELLOW: '#ffff00',
  GREEN: '#44ff44',
  CYAN: '#44ffff',
  BLUE: '#4444ff',
  PURPLE: '#9944ff',
  MAGENTA: '#ff44ff',
  WHITE: '#ffffff',
  BLACK: '#000000',
};

/**
 * Convert an OTIO marker color name to a hex string.
 * Returns the hex value if recognized, or the original string if not.
 */
export function otioMarkerColorToHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return OTIO_MARKER_COLOR_MAP[color] ?? color;
}

/** Parsed marker for playlist integration */
export interface ParsedOTIOMarker {
  /** Display name of the marker */
  name: string;
  /** Marker color as hex (e.g. '#ff4444') or raw OTIO color name if unmapped */
  color?: string;
  /** Frame where the marker starts on the timeline */
  timelineFrame: number;
  /** Duration in frames (0 for point markers) */
  durationFrames: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/** Parsed gap for preserving gap timing */
export interface ParsedOTIOGap {
  /** Timeline frame where the gap begins */
  timelineInFrame: number;
  /** Duration in frames */
  durationFrames: number;
}

/** Supported transition types */
export type TransitionType = 'SMPTE_Dissolve' | 'Custom_Transition';

/** Parsed transition between two adjacent clips */
export interface ParsedOTIOTransition {
  /** Display name of the transition */
  name: string;
  /** Transition type (e.g. SMPTE_Dissolve) */
  transitionType: TransitionType;
  /**
   * Number of frames the transition eats into the outgoing (preceding) clip.
   * The outgoing clip's last `inOffset` frames overlap with the transition.
   */
  inOffset: number;
  /**
   * Number of frames the transition eats into the incoming (following) clip.
   * The incoming clip's first `outOffset` frames overlap with the transition.
   */
  outOffset: number;
  /** Total transition duration in frames (inOffset + outOffset) */
  duration: number;
  /** Index of the outgoing clip (in the track's clips array) */
  outgoingClipIndex: number;
  /** Index of the incoming clip (in the track's clips array) */
  incomingClipIndex: number;
  /** Timeline frame where the transition begins */
  timelineInFrame: number;
  /** Timeline frame where the transition ends */
  timelineOutFrame: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/** A single parsed video track */
export interface ParsedOTIOTrack {
  /** Track name */
  name: string;
  /** Clips within this track */
  clips: ParsedOTIOClip[];
  /** Transitions within this track */
  transitions: ParsedOTIOTransition[];
  /** Gaps within this track */
  gaps: ParsedOTIOGap[];
  /** Markers within this track (track-level + clip-level combined) */
  markers: ParsedOTIOMarker[];
  /** Total frames for this track */
  totalFrames: number;
}

/** Parse result */
export interface OTIOParseResult {
  timeline: OTIOTimeline;
  clips: ParsedOTIOClip[];
  /** Markers from clips and timeline */
  markers: ParsedOTIOMarker[];
  fps: number;
  totalFrames: number;
}

/** Multi-track parse result */
export interface OTIOMultiTrackParseResult {
  timeline: OTIOTimeline;
  /** All video tracks with their clips and transitions */
  tracks: ParsedOTIOTrack[];
  /** Flattened clips from all tracks (tracks[0] first, then tracks[1], etc.) */
  clips: ParsedOTIOClip[];
  /** Flattened transitions from all tracks */
  transitions: ParsedOTIOTransition[];
  /** Flattened gaps from all tracks */
  gaps: ParsedOTIOGap[];
  /** Markers from the timeline and clips */
  markers: ParsedOTIOMarker[];
  fps: number;
  /** Total frames = max of all track durations */
  totalFrames: number;
}

/**
 * Convert OTIO rational time to frame number at the given target rate.
 * When the source rate differs from targetRate, the value is rescaled:
 *   frames = Math.round(rt.value * targetRate / rt.rate)
 * When rates match, this simplifies to Math.round(rt.value).
 */
export function rationalTimeToFrames(rt: OTIORationalTime, targetRate: number): number {
  if (rt.rate <= 0 || targetRate <= 0) return 0;
  if (rt.rate === targetRate) {
    return Math.round(rt.value);
  }
  return Math.round((rt.value * targetRate) / rt.rate);
}

/**
 * Get duration in frames from a time range at the given target rate.
 */
export function timeRangeDurationFrames(range: OTIOTimeRange, targetRate: number): number {
  return rationalTimeToFrames(range.duration, targetRate);
}

/**
 * Normalize a transition_type string to our supported TransitionType union.
 * Unknown types default to 'SMPTE_Dissolve'.
 */
function normalizeTransitionType(raw?: string): TransitionType {
  if (raw === 'Custom_Transition') return 'Custom_Transition';
  // Default: treat anything else (including SMPTE_Dissolve, undefined) as dissolve
  return 'SMPTE_Dissolve';
}

/**
 * Parse a single OTIO track into a ParsedOTIOTrack.
 * Extracts clips, gaps (which advance the timeline position), and transitions
 * (which create overlap regions between adjacent clips).
 */
function parseTrack(track: OTIOTrack, fps: number): ParsedOTIOTrack {
  const clips: ParsedOTIOClip[] = [];
  const transitions: ParsedOTIOTransition[] = [];
  const gaps: ParsedOTIOGap[] = [];
  const markers: ParsedOTIOMarker[] = [];
  let timelinePosition = 0;

  // First pass: we need to figure out clip indices for transitions.
  // In OTIO, a Transition sits *between* two clips and borrows time from both.
  // The transition's in_offset eats into the preceding clip's tail, and
  // the out_offset eats into the following clip's head.
  //
  // According to the OTIO spec, transitions do NOT advance the timeline
  // position. Instead they create overlap regions. The timeline position
  // only advances for Clips and Gaps.
  //
  // We collect pending transitions and resolve them once the incoming clip is known.

  let pendingTransition: OTIOTransition | null = null;
  let pendingTransitionOutgoingClipIndex = -1;

  for (const item of track.children) {
    if (item.OTIO_SCHEMA === 'Clip.1') {
      const clip = item as OTIOClip;
      const sourceRange = clip.source_range;

      let inFrame = 0;
      let duration = 0;

      if (sourceRange) {
        inFrame = rationalTimeToFrames(sourceRange.start_time, fps);
        duration = timeRangeDurationFrames(sourceRange, fps);
      } else if (clip.media_reference?.available_range) {
        inFrame = rationalTimeToFrames(clip.media_reference.available_range.start_time, fps);
        duration = timeRangeDurationFrames(clip.media_reference.available_range, fps);
      }

      const outFrame = inFrame + duration - 1;
      const clipIndex = clips.length;

      clips.push({
        name: clip.name,
        sourceUrl: clip.media_reference?.target_url,
        inFrame,
        outFrame,
        timelineInFrame: timelinePosition,
        timelineOutFrame: timelinePosition + duration - 1,
        metadata: clip.metadata,
      });

      // Collect clip-level markers
      if (clip.markers) {
        markers.push(...parseMarkers(clip.markers, fps, timelinePosition));
      }

      // Resolve any pending transition now that we know the incoming clip
      if (pendingTransition && pendingTransitionOutgoingClipIndex >= 0) {
        const transInOffset = pendingTransition.in_offset ? rationalTimeToFrames(pendingTransition.in_offset, fps) : 0;
        const transOutOffset = pendingTransition.out_offset
          ? rationalTimeToFrames(pendingTransition.out_offset, fps)
          : 0;
        const transDuration = transInOffset + transOutOffset;

        // The transition starts `inOffset` frames before the cut point
        // (i.e. before the current timeline position).
        const transTimelineIn = timelinePosition - transInOffset;

        transitions.push({
          name: pendingTransition.name ?? '',
          transitionType: normalizeTransitionType(pendingTransition.transition_type),
          inOffset: transInOffset,
          outOffset: transOutOffset,
          duration: transDuration,
          outgoingClipIndex: pendingTransitionOutgoingClipIndex,
          incomingClipIndex: clipIndex,
          timelineInFrame: transTimelineIn,
          timelineOutFrame: transTimelineIn + transDuration - 1,
          metadata: pendingTransition.metadata,
        });

        pendingTransition = null;
        pendingTransitionOutgoingClipIndex = -1;
      }

      timelinePosition += duration;
    } else if (item.OTIO_SCHEMA === 'Gap.1') {
      const gap = item as OTIOGap;
      if (gap.source_range) {
        const gapDuration = timeRangeDurationFrames(gap.source_range, fps);
        if (gapDuration > 0) {
          gaps.push({
            timelineInFrame: timelinePosition,
            durationFrames: gapDuration,
          });
        }
        timelinePosition += gapDuration;
      }
    } else if (item.OTIO_SCHEMA === 'Transition.1') {
      // Store the transition; it will be resolved when the next clip is encountered.
      // Only valid if there is a preceding clip (outgoing side).
      if (clips.length > 0) {
        pendingTransition = item as OTIOTransition;
        pendingTransitionOutgoingClipIndex = clips.length - 1;
      }
    }
  }

  // Collect track-level markers
  if (track.markers) {
    markers.push(...parseMarkers(track.markers, fps, 0));
  }

  return {
    name: track.name,
    clips,
    transitions,
    gaps,
    markers,
    totalFrames: timelinePosition,
  };
}

/**
 * Validate and extract the OTIOTimeline from a JSON string.
 * Returns null if validation fails.
 */
function validateAndExtractTimeline(jsonString: string): OTIOTimeline | null {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') return null;
    if (data.OTIO_SCHEMA !== 'Timeline.1') return null;
    if (!data.tracks || data.tracks.OTIO_SCHEMA !== 'Stack.1') return null;
    return data as OTIOTimeline;
  } catch {
    return null;
  }
}

/**
 * Parse OTIO JSON string (single-track, backward-compatible).
 * Returns clips from the first video track only.
 * @returns Parsed result or null if invalid
 */
export function parseOTIO(jsonString: string): OTIOParseResult | null {
  const timeline = validateAndExtractTimeline(jsonString);
  if (!timeline) return null;

  const fps = timeline.global_start_time?.rate ?? 24;

  // Process only video tracks
  const videoTracks = (timeline.tracks.children || []).filter(
    (t: OTIOTrack) => t.OTIO_SCHEMA === 'Track.1' && t.kind === 'Video',
  );

  // Use first video track for linear playlist
  const primaryTrack = videoTracks[0];
  if (!primaryTrack) {
    return { timeline, clips: [], markers: [], fps, totalFrames: 0 };
  }

  const parsed = parseTrack(primaryTrack, fps);

  // Collect markers: track-level (from parseTrack) + timeline-level
  const allMarkers = [...parsed.markers];
  allMarkers.push(...parseMarkers(timeline.markers, fps, 0));

  return {
    timeline,
    clips: parsed.clips,
    markers: allMarkers,
    fps,
    totalFrames: parsed.totalFrames,
  };
}

/**
 * Parse an array of OTIO markers into ParsedOTIOMarker objects.
 * The timelineOffset is added to each marker's position.
 */
function parseMarkers(
  markers: OTIOMarker[] | undefined,
  fps: number,
  timelineOffset: number,
): ParsedOTIOMarker[] {
  if (!markers || !Array.isArray(markers)) return [];

  const result: ParsedOTIOMarker[] = [];
  for (const m of markers) {
    if (m.OTIO_SCHEMA !== 'Marker.1') continue;

    let timelineFrame = timelineOffset;
    let durationFrames = 0;

    if (m.marked_range) {
      timelineFrame += rationalTimeToFrames(m.marked_range.start_time, fps);
      durationFrames = timeRangeDurationFrames(m.marked_range, fps);
    }

    result.push({
      name: m.name ?? '',
      color: otioMarkerColorToHex(m.color),
      timelineFrame,
      durationFrames,
      metadata: m.metadata,
    });
  }
  return result;
}

/**
 * Parse OTIO JSON string with full multi-track and transition support.
 * Returns all video tracks, their clips, and transitions.
 * @returns Multi-track parse result or null if invalid
 */
export function parseOTIOMultiTrack(jsonString: string): OTIOMultiTrackParseResult | null {
  const timeline = validateAndExtractTimeline(jsonString);
  if (!timeline) return null;

  const fps = timeline.global_start_time?.rate ?? 24;

  // Process only video tracks
  const videoTracks = (timeline.tracks.children || []).filter(
    (t: OTIOTrack) => t.OTIO_SCHEMA === 'Track.1' && t.kind === 'Video',
  );

  const tracks: ParsedOTIOTrack[] = [];
  const allClips: ParsedOTIOClip[] = [];
  const allTransitions: ParsedOTIOTransition[] = [];
  const allGaps: ParsedOTIOGap[] = [];
  const allMarkers: ParsedOTIOMarker[] = [];
  let maxTotalFrames = 0;

  for (const vt of videoTracks) {
    const parsed = parseTrack(vt, fps);
    tracks.push(parsed);
    allClips.push(...parsed.clips);
    allTransitions.push(...parsed.transitions);
    allGaps.push(...parsed.gaps);
    allMarkers.push(...parsed.markers);
    if (parsed.totalFrames > maxTotalFrames) {
      maxTotalFrames = parsed.totalFrames;
    }
  }

  // Parse timeline-level markers
  allMarkers.push(...parseMarkers(timeline.markers, fps, 0));

  return {
    timeline,
    tracks,
    clips: allClips,
    transitions: allTransitions,
    gaps: allGaps,
    markers: allMarkers,
    fps,
    totalFrames: maxTotalFrames,
  };
}
