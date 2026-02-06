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

/** OTIO clip */
export interface OTIOClip {
  OTIO_SCHEMA: 'Clip.1';
  name: string;
  source_range?: OTIOTimeRange;
  media_reference?: OTIOMediaReference;
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

/** Parse result */
export interface OTIOParseResult {
  timeline: OTIOTimeline;
  clips: ParsedOTIOClip[];
  fps: number;
  totalFrames: number;
}

/**
 * Convert OTIO rational time to frame number at the given target rate.
 * When the source rate differs from targetRate, the value is rescaled:
 *   frames = Math.round(rt.value * targetRate / rt.rate)
 * When rates match, this simplifies to Math.round(rt.value).
 */
export function rationalTimeToFrames(
  rt: OTIORationalTime,
  targetRate: number
): number {
  if (rt.rate === targetRate) {
    return Math.round(rt.value);
  }
  return Math.round((rt.value * targetRate) / rt.rate);
}

/**
 * Get duration in frames from a time range at the given target rate.
 */
export function timeRangeDurationFrames(
  range: OTIOTimeRange,
  targetRate: number
): number {
  return rationalTimeToFrames(range.duration, targetRate);
}

/**
 * Parse OTIO JSON string
 * @returns Parsed result or null if invalid
 */
export function parseOTIO(jsonString: string): OTIOParseResult | null {
  try {
    const data = JSON.parse(jsonString);

    // Validate top-level schema
    if (!data || typeof data !== 'object') return null;
    if (data.OTIO_SCHEMA !== 'Timeline.1') return null;
    if (!data.tracks || data.tracks.OTIO_SCHEMA !== 'Stack.1') return null;

    const timeline = data as OTIOTimeline;
    const fps = timeline.global_start_time?.rate ?? 24;

    // Extract clips from all video tracks
    const clips: ParsedOTIOClip[] = [];
    let timelinePosition = 0;

    // Process only video tracks
    const videoTracks = (timeline.tracks.children || []).filter(
      (t: OTIOTrack) => t.OTIO_SCHEMA === 'Track.1' && t.kind === 'Video'
    );

    // Use first video track for linear playlist
    const primaryTrack = videoTracks[0];
    if (primaryTrack) {
      for (const item of primaryTrack.children) {
        if (item.OTIO_SCHEMA === 'Clip.1') {
          const clip = item as OTIOClip;
          const sourceRange = clip.source_range;

          let inFrame = 0;
          let duration = 0;

          if (sourceRange) {
            inFrame = rationalTimeToFrames(sourceRange.start_time, fps);
            duration = timeRangeDurationFrames(sourceRange, fps);
          } else if (clip.media_reference?.available_range) {
            inFrame = rationalTimeToFrames(
              clip.media_reference.available_range.start_time,
              fps
            );
            duration = timeRangeDurationFrames(
              clip.media_reference.available_range,
              fps
            );
          }

          const outFrame = inFrame + duration - 1;

          clips.push({
            name: clip.name,
            sourceUrl: clip.media_reference?.target_url,
            inFrame,
            outFrame,
            timelineInFrame: timelinePosition,
            timelineOutFrame: timelinePosition + duration - 1,
            metadata: clip.metadata,
          });

          timelinePosition += duration;
        } else if (item.OTIO_SCHEMA === 'Gap.1') {
          const gap = item as OTIOGap;
          if (gap.source_range) {
            timelinePosition += timeRangeDurationFrames(gap.source_range, fps);
          }
        }
        // Transitions don't advance timeline position (they overlap)
      }
    }

    return {
      timeline,
      clips,
      fps,
      totalFrames: timelinePosition,
    };
  } catch {
    return null;
  }
}
