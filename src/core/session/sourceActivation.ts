/**
 * Shared policy for what happens to the playback range, frame and fps when
 * the active source changes (A/B flip, version switch, restore, sync).
 *
 * Kept as pure functions so SessionMedia (generic source switch) and
 * SessionPlayback (A/B switch) apply exactly the same rules.
 */

import type { MediaSource } from './SessionTypes';

export interface PlaybackRangeState {
  inPoint: number;
  outPoint: number;
  currentFrame: number;
}

/**
 * Resolve the in/out range and frame to use after switching from a source of
 * `previousDuration` frames to one of `nextDuration` frames.
 *
 * - A full-range selection on the old source stays full-range on the new one.
 * - A narrowed loop range is kept as long as it fits inside the new source,
 *   so comparing versions of the same shot keeps the loop on every flip.
 * - A range that doesn't fit falls back to the new source's full range.
 * - The frame is kept and clamped into the resulting range.
 */
export function resolveRangeOnSourceSwitch(
  previous: PlaybackRangeState,
  previousDuration: number,
  nextDuration: number,
): PlaybackRangeState {
  const duration = Math.max(1, nextDuration);
  const wasFullRange = previous.inPoint <= 1 && previous.outPoint >= previousDuration;
  const fits = previous.inPoint >= 1 && previous.outPoint <= duration && previous.inPoint <= previous.outPoint;

  const inPoint = !wasFullRange && fits ? previous.inPoint : 1;
  const outPoint = !wasFullRange && fits ? previous.outPoint : duration;
  const currentFrame = Math.min(Math.max(previous.currentFrame, inPoint), outPoint);
  return { inPoint, outPoint, currentFrame };
}

/**
 * Whether the session fps should follow this source's fps when it becomes
 * active. Stills carry whatever the session fps was when they loaded, so
 * they never drive the session rate.
 */
export function sourceDrivesFps(source: MediaSource | null): source is MediaSource {
  return (
    source !== null &&
    (source.type === 'video' || source.type === 'sequence') &&
    Number.isFinite(source.fps) &&
    source.fps > 0
  );
}
