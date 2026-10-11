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

/** OTIO media reference (ExternalReference, ImageSequenceReference, MissingReference, ... any version) */
export interface OTIOMediaReference {
  OTIO_SCHEMA: string;
  name?: string;
  target_url?: string;
  available_range?: OTIOTimeRange;
  /** ImageSequenceReference fields */
  target_url_base?: string;
  name_prefix?: string;
  name_suffix?: string;
  start_frame?: number;
  frame_step?: number;
  rate?: number;
  frame_zero_padding?: number;
  metadata?: Record<string, unknown>;
}

/** OTIO marker */
export interface OTIOMarker {
  OTIO_SCHEMA: string; // 'Marker.1', 'Marker.2', ...
  name: string;
  color?: string;
  marked_range?: OTIOTimeRange;
  metadata?: Record<string, unknown>;
}

/** OTIO clip (`Clip.1` uses `media_reference`; `Clip.2`+ uses `media_references`) */
export interface OTIOClip {
  OTIO_SCHEMA: string; // 'Clip.1', 'Clip.2', ...
  name: string;
  source_range?: OTIOTimeRange;
  media_reference?: OTIOMediaReference;
  media_references?: Record<string, OTIOMediaReference>;
  active_media_reference_key?: string;
  markers?: OTIOMarker[];
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

/** OTIO gap */
export interface OTIOGap {
  OTIO_SCHEMA: string; // 'Gap.1', ...
  name?: string;
  source_range?: OTIOTimeRange;
  /** Legacy gap duration field */
  duration?: OTIORationalTime;
}

/** OTIO transition */
export interface OTIOTransition {
  OTIO_SCHEMA: string; // 'Transition.1', ...
  name?: string;
  transition_type?: string;
  in_offset?: OTIORationalTime;
  out_offset?: OTIORationalTime;
  metadata?: Record<string, unknown>;
}

/** OTIO track item (union type). Tracks may also contain nested Stacks/Tracks. */
export type OTIOTrackItem = OTIOClip | OTIOGap | OTIOTransition | OTIOStack | OTIOTrack;

/** OTIO track */
export interface OTIOTrack {
  OTIO_SCHEMA: string; // 'Track.1', ...
  name: string;
  kind: string; // 'Video', 'Audio'
  children: OTIOTrackItem[];
  source_range?: OTIOTimeRange;
  markers?: OTIOMarker[];
  enabled?: boolean;
}

/** OTIO stack (collection of tracks) */
export interface OTIOStack {
  OTIO_SCHEMA: string; // 'Stack.1', ...
  name?: string;
  children: (OTIOTrack | OTIOStack)[];
  source_range?: OTIOTimeRange;
  markers?: OTIOMarker[];
  enabled?: boolean;
}

/** OTIO timeline (top-level) */
export interface OTIOTimeline {
  OTIO_SCHEMA: string; // 'Timeline.1', ...
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
  /** First frame of the clip in media time (the OTIO source_range coordinate space) */
  inFrame: number;
  /** Last frame (inclusive) of the clip in media time */
  outFrame: number;
  /** 0-based timeline frame where the clip starts */
  timelineInFrame: number;
  timelineOutFrame: number;
  /**
   * Media-time frame at which the media reference's available_range starts,
   * when the reference declares one. Local (1-based) source frame =
   * inFrame - availableStartFrame + 1.
   */
  availableStartFrame?: number;
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
  /** Transitions from the first video track */
  transitions: ParsedOTIOTransition[];
  /** Gaps from the first video track */
  gaps: ParsedOTIOGap[];
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
 * Base schema name of an OTIO object, without its version
 * (`'Clip.2'` -> `'Clip'`). Any schema version is accepted.
 */
export function otioSchemaName(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return '';
  const schema = (obj as { OTIO_SCHEMA?: unknown }).OTIO_SCHEMA;
  if (typeof schema !== 'string') return '';
  const dot = schema.lastIndexOf('.');
  return dot > 0 ? schema.slice(0, dot) : schema;
}

/**
 * Resolve the active media reference of a clip.
 * OTIO 0.15+ (`Clip.2`) stores references in `media_references` keyed by
 * `active_media_reference_key` (default `DEFAULT_MEDIA`); older files use
 * `media_reference`.
 */
export function getActiveMediaReference(clip: OTIOClip): OTIOMediaReference | undefined {
  const refs = clip.media_references;
  if (refs && typeof refs === 'object') {
    const key = clip.active_media_reference_key ?? 'DEFAULT_MEDIA';
    const ref = refs[key] ?? Object.values(refs)[0];
    if (ref) return ref;
  }
  return clip.media_reference;
}

/**
 * URL of a media reference. Image sequence references are expanded to a
 * `####`-style pattern (`base/prefix####suffix`).
 */
function mediaReferenceUrl(ref: OTIOMediaReference | undefined): string | undefined {
  if (!ref) return undefined;
  const kind = otioSchemaName(ref);
  if (kind === 'ImageSequenceReference') {
    const base = ref.target_url_base ?? '';
    const sep = base && !base.endsWith('/') ? '/' : '';
    const padding = ref.frame_zero_padding && ref.frame_zero_padding > 0 ? ref.frame_zero_padding : 4;
    return `${base}${sep}${ref.name_prefix ?? ''}${'#'.repeat(padding)}${ref.name_suffix ?? ''}`;
  }
  return ref.target_url;
}

/**
 * Media-time frame at which the reference's available media begins, if known.
 * Clip `source_range` values are expressed in this coordinate space.
 */
function mediaReferenceStartFrame(ref: OTIOMediaReference | undefined, fps: number): number | undefined {
  if (!ref) return undefined;
  if (ref.available_range) return rationalTimeToFrames(ref.available_range.start_time, fps);
  return undefined;
}

/** Duration of any composable item (clip, gap, nested track/stack), in frames. */
function itemDurationFrames(item: OTIOTrackItem | OTIOTrack | OTIOStack, fps: number): number {
  const kind = otioSchemaName(item);
  const sourceRange = (item as { source_range?: OTIOTimeRange }).source_range;
  if (kind === 'Transition') return 0;
  if (sourceRange) return timeRangeDurationFrames(sourceRange, fps);
  if (kind === 'Clip') {
    const ref = getActiveMediaReference(item as OTIOClip);
    return ref?.available_range ? timeRangeDurationFrames(ref.available_range, fps) : 0;
  }
  if (kind === 'Gap') {
    const dur = (item as OTIOGap).duration;
    return dur ? rationalTimeToFrames(dur, fps) : 0;
  }
  if (kind === 'Track') {
    return ((item as OTIOTrack).children ?? []).reduce((sum, child) => sum + itemDurationFrames(child, fps), 0);
  }
  if (kind === 'Stack') {
    return ((item as OTIOStack).children ?? []).reduce(
      (max, child) => Math.max(max, itemDurationFrames(child, fps)),
      0,
    );
  }
  return 0;
}

/** Pick the track of a (nested) stack that supplies the flattened clip list: the first video track. */
function primaryTrackOfStack(stack: OTIOStack): OTIOTrack | OTIOStack | undefined {
  const children = stack.children ?? [];
  return (
    children.find((c) => otioSchemaName(c) === 'Track' && (c as OTIOTrack).kind !== 'Audio') ??
    children.find((c) => otioSchemaName(c) === 'Stack')
  );
}

/** Mutable accumulator for the recursive track walker. */
interface TrackWalkState {
  fps: number;
  clips: ParsedOTIOClip[];
  transitions: ParsedOTIOTransition[];
  gaps: ParsedOTIOGap[];
  markers: ParsedOTIOMarker[];
  pendingTransition: OTIOTransition | null;
  pendingTransitionOutgoingClipIndex: number;
}

/**
 * Walk a track's children, appending clips/gaps/transitions/markers to `state`.
 *
 * `windowStart`/`windowEnd` restrict the walk to a range of the track's own
 * time (used for nested compositions with a `source_range`), and
 * `outerOffset` is the parent-timeline frame at which `windowStart` lands.
 * According to the OTIO spec transitions do not advance the timeline; they
 * overlap the neighbouring items.
 */
function walkTrackChildren(
  children: readonly (OTIOTrackItem | OTIOTrack | OTIOStack)[],
  state: TrackWalkState,
  outerOffset: number,
  windowStart: number,
  windowEnd: number,
): void {
  const { fps } = state;
  let pos = 0;

  for (const item of children) {
    const kind = otioSchemaName(item);
    if (kind === 'Transition') {
      // Resolved when the incoming clip is encountered; requires an outgoing clip
      // that ends at the current position.
      const last = state.clips[state.clips.length - 1];
      if (last && last.timelineOutFrame === outerOffset + (pos - windowStart) - 1) {
        state.pendingTransition = item as OTIOTransition;
        state.pendingTransitionOutgoingClipIndex = state.clips.length - 1;
      }
      continue;
    }

    const duration = itemDurationFrames(item, fps);
    const itemStart = pos;
    const itemEnd = pos + duration;
    pos = itemEnd;

    const visStart = Math.max(itemStart, windowStart);
    const visEnd = Math.min(itemEnd, windowEnd);
    if (visEnd <= visStart) {
      state.pendingTransition = null;
      continue;
    }
    const timelineIn = outerOffset + (visStart - windowStart);
    const visDuration = visEnd - visStart;

    const disabled = (item as { enabled?: boolean }).enabled === false;

    if (kind === 'Clip' && !disabled) {
      const clip = item as OTIOClip;
      const ref = getActiveMediaReference(clip);
      const range = clip.source_range ?? ref?.available_range;
      const rangeStart = range ? rationalTimeToFrames(range.start_time, fps) : 0;
      const inFrame = rangeStart + (visStart - itemStart);
      const clipIndex = state.clips.length;

      const parsed: ParsedOTIOClip = {
        name: clip.name,
        sourceUrl: mediaReferenceUrl(ref),
        inFrame,
        outFrame: inFrame + visDuration - 1,
        timelineInFrame: timelineIn,
        timelineOutFrame: timelineIn + visDuration - 1,
        metadata: clip.metadata,
      };
      const availableStart = mediaReferenceStartFrame(ref, fps);
      if (availableStart !== undefined) parsed.availableStartFrame = availableStart;
      state.clips.push(parsed);

      // Clip markers are expressed in the clip's source time.
      if (clip.markers) {
        state.markers.push(...parseMarkers(clip.markers, fps, timelineIn - inFrame));
      }

      const pending = state.pendingTransition;
      if (pending && state.pendingTransitionOutgoingClipIndex >= 0 && visStart === itemStart) {
        const transInOffset = pending.in_offset ? rationalTimeToFrames(pending.in_offset, fps) : 0;
        const transOutOffset = pending.out_offset ? rationalTimeToFrames(pending.out_offset, fps) : 0;
        const transDuration = transInOffset + transOutOffset;
        // The transition starts `inOffset` frames before the cut point.
        const transTimelineIn = timelineIn - transInOffset;

        state.transitions.push({
          name: pending.name ?? '',
          transitionType: normalizeTransitionType(pending.transition_type),
          inOffset: transInOffset,
          outOffset: transOutOffset,
          duration: transDuration,
          outgoingClipIndex: state.pendingTransitionOutgoingClipIndex,
          incomingClipIndex: clipIndex,
          timelineInFrame: transTimelineIn,
          timelineOutFrame: transTimelineIn + transDuration - 1,
          metadata: pending.metadata,
        });
      }
      state.pendingTransition = null;
      state.pendingTransitionOutgoingClipIndex = -1;
    } else if (kind === 'Track' || kind === 'Stack') {
      // Nested composition: flatten its (primary) track into this one,
      // honouring its source_range as a window into its own time.
      state.pendingTransition = null;
      const nested = item as OTIOTrack | OTIOStack;
      const nestedRange = nested.source_range;
      const nestedStart = nestedRange ? rationalTimeToFrames(nestedRange.start_time, fps) : 0;
      const innerStart = nestedStart + (visStart - itemStart);
      const innerEnd = innerStart + visDuration;
      const target = kind === 'Track' ? (nested as OTIOTrack) : primaryTrackOfStack(nested as OTIOStack);
      if (target) {
        walkComposition(target, state, timelineIn, innerStart, innerEnd);
      }
      if (nested.markers) {
        state.markers.push(...parseMarkers(nested.markers, fps, timelineIn - innerStart));
      }
    } else {
      // Gap (or disabled item, which renders as a gap)
      state.pendingTransition = null;
      state.gaps.push({ timelineInFrame: timelineIn, durationFrames: visDuration });
    }
  }
}

/** Walk a track or nested stack within a window of its own time. */
function walkComposition(
  comp: OTIOTrack | OTIOStack,
  state: TrackWalkState,
  outerOffset: number,
  windowStart: number,
  windowEnd: number,
): void {
  if (otioSchemaName(comp) === 'Stack') {
    const primary = primaryTrackOfStack(comp as OTIOStack);
    if (primary) walkComposition(primary, state, outerOffset, windowStart, windowEnd);
    return;
  }
  const track = comp as OTIOTrack;
  walkTrackChildren(track.children ?? [], state, outerOffset, windowStart, windowEnd);
  if (track.markers) {
    state.markers.push(...parseMarkers(track.markers, state.fps, outerOffset - windowStart));
  }
}

/**
 * Parse a single OTIO track into a ParsedOTIOTrack.
 * Extracts clips, gaps (which advance the timeline position), and transitions
 * (which create overlap regions between adjacent clips). Nested stacks and
 * tracks are flattened in place (their first video track supplies the clips).
 */
function parseTrack(track: OTIOTrack, fps: number): ParsedOTIOTrack {
  const state: TrackWalkState = {
    fps,
    clips: [],
    transitions: [],
    gaps: [],
    markers: [],
    pendingTransition: null,
    pendingTransitionOutgoingClipIndex: -1,
  };
  const children = track.children ?? [];
  walkTrackChildren(children, state, 0, 0, Number.POSITIVE_INFINITY);

  // Collect track-level markers
  if (track.markers) {
    state.markers.push(...parseMarkers(track.markers, fps, 0));
  }

  const totalFrames = children.reduce((sum, child) => sum + itemDurationFrames(child, fps), 0);

  return {
    name: track.name,
    clips: state.clips,
    transitions: state.transitions,
    gaps: state.gaps,
    markers: state.markers,
    totalFrames,
  };
}

/** Find the first rate used in the timeline (fallback when global_start_time is absent). */
function detectTimelineRate(timeline: OTIOTimeline): number {
  if (timeline.global_start_time?.rate && timeline.global_start_time.rate > 0) {
    return timeline.global_start_time.rate;
  }
  const stack: unknown[] = [timeline.tracks];
  let guard = 0;
  while (stack.length > 0 && guard++ < 10000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const range = (node as { source_range?: OTIOTimeRange }).source_range;
    if (range?.duration?.rate && range.duration.rate > 0) return range.duration.rate;
    const children = (node as { children?: unknown[] }).children;
    if (Array.isArray(children)) stack.push(...[...children].reverse());
  }
  return 24;
}

/** Video tracks at the top level of the timeline stack (any Track schema version). */
function topLevelVideoTracks(timeline: OTIOTimeline): OTIOTrack[] {
  return (timeline.tracks.children || []).filter(
    (t): t is OTIOTrack => otioSchemaName(t) === 'Track' && (t as OTIOTrack).kind === 'Video',
  );
}

/** Markers attached to the timeline itself and to its top-level stack. */
function timelineLevelMarkers(timeline: OTIOTimeline, fps: number): ParsedOTIOMarker[] {
  return [...parseMarkers(timeline.tracks.markers, fps, 0), ...parseMarkers(timeline.markers, fps, 0)];
}

/**
 * Validate and extract the OTIOTimeline from a JSON string.
 * Returns null if validation fails.
 */
function validateAndExtractTimeline(jsonString: string): OTIOTimeline | null {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    // Not JSON: not an OTIO file.
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (otioSchemaName(data) !== 'Timeline') return null;
  const tracks = (data as { tracks?: unknown }).tracks;
  if (!tracks || otioSchemaName(tracks) !== 'Stack') return null;
  return data as OTIOTimeline;
}

/**
 * Parse OTIO JSON string (single-track, backward-compatible).
 * Returns clips from the first video track only.
 * @returns Parsed result or null if invalid
 */
export function parseOTIO(jsonString: string): OTIOParseResult | null {
  const timeline = validateAndExtractTimeline(jsonString);
  if (!timeline) return null;

  const fps = detectTimelineRate(timeline);

  // Process only video tracks
  const videoTracks = topLevelVideoTracks(timeline);

  // Use first video track for linear playlist
  const primaryTrack = videoTracks[0];
  if (!primaryTrack) {
    return {
      timeline,
      clips: [],
      transitions: [],
      gaps: [],
      markers: timelineLevelMarkers(timeline, fps),
      fps,
      totalFrames: 0,
    };
  }

  const parsed = parseTrack(primaryTrack, fps);

  // Collect markers: track-level (from parseTrack) + timeline-level
  const allMarkers = [...parsed.markers];
  allMarkers.push(...timelineLevelMarkers(timeline, fps));

  return {
    timeline,
    clips: parsed.clips,
    transitions: parsed.transitions,
    gaps: parsed.gaps,
    markers: allMarkers,
    fps,
    totalFrames: parsed.totalFrames,
  };
}

/**
 * Parse an array of OTIO markers into ParsedOTIOMarker objects.
 * The timelineOffset is added to each marker's position.
 */
function parseMarkers(markers: OTIOMarker[] | undefined, fps: number, timelineOffset: number): ParsedOTIOMarker[] {
  if (!markers || !Array.isArray(markers)) return [];

  const result: ParsedOTIOMarker[] = [];
  for (const m of markers) {
    if (otioSchemaName(m) !== 'Marker') continue;

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

  const fps = detectTimelineRate(timeline);

  // Process only video tracks
  const videoTracks = topLevelVideoTracks(timeline);

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
  allMarkers.push(...timelineLevelMarkers(timeline, fps));

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
