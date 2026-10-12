/**
 * EditorialSourceMatcher - match editorial clip references (EDL / RVEDL / OTIO)
 * to the media sources loaded in the session.
 *
 * Matching is tiered; the first tier that yields a match wins:
 *   1. exact URL, or exact file name (of the URL / clip path / name)
 *   2. file name without extension
 *   3. clip name (e.g. EDL `* FROM CLIP NAME:`)
 *   4. reel / tape name
 *   5. fuzzy: case-insensitive, extension and frame-number patterns stripped
 *      (`.####.exr`, `%04d`, `.1001-1100#`, `[1001-1100]`, `.1001.exr`, ...),
 *      punctuation ignored, plus prefix matching for truncated (8-char) reel
 *      names. The fuzzy tier only matches when exactly one source qualifies.
 */

import type { MediaSource } from './SessionTypes';

/** Minimal source shape needed for matching. */
export interface MatchableSource {
  name: string;
  url?: string;
}

/** What an editorial clip tells us about its media. */
export interface SourceMatchQuery {
  /** Media URL / file path (OTIO target_url, EDL `* SOURCE FILE:`, RVEDL path). */
  url?: string;
  /** Primary display name. */
  name?: string;
  /** Clip name (EDL `* FROM CLIP NAME:`). */
  clipName?: string;
  /** Reel / tape name (EDL reel field). */
  reel?: string;
}

/** A resolved session source plus the information needed to map source time to local frames. */
export interface ResolvedPlaylistSource {
  /** Index of the source in the session. */
  index: number;
  /** Number of frames in the source (0 or less when unknown). */
  frameCount: number;
  /** Source frame rate, when known. */
  fps?: number;
  /** First frame number of an image sequence (local frame 1 maps to this frame number). */
  startFrame?: number;
  /** Embedded start timecode of the media (e.g. from MXF / QuickTime metadata). */
  startTimecode?: string;
}

/**
 * Resolver used by playlist imports. `name`/`url` are the primary identifiers;
 * `hints` carries additional names (clip name, reel) for tiered matching.
 */
export type PlaylistSourceResolver = (
  name: string,
  url?: string,
  hints?: { clipName?: string; reel?: string },
) => ResolvedPlaylistSource | null;

/** Last path segment of a path or URL, without query/hash, URI-decoded. */
export function fileNameOf(pathOrUrl: string | undefined): string {
  if (!pathOrUrl) return '';
  let s = pathOrUrl.trim();
  s = s.replace(/[?#].*$/, '');
  s = s.replace(/[\\/]+$/, '');
  const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  const base = idx >= 0 ? s.slice(idx + 1) : s;
  try {
    const decoded = decodeURIComponent(base);
    // `%04d` frame tokens look like percent-encoding; keep the raw name when
    // decoding produces control characters.
    // eslint-disable-next-line no-control-regex
    return /[\x00-\x1f]/.test(decoded) ? base : decoded;
  } catch {
    // Malformed percent-encoding: the raw segment is still a usable name.
    return base;
  }
}

/** File name without its final extension. */
export function stemOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

const FRAME_PATTERN_SUFFIX = /[._-]?(?:#+|@+|%0?\d*d|\$F\d*|<f\d*>|\[\d+-\d+\]|\d+-\d+[#@]*|\d{4,}|<udim>)$/i;

/** Strip an image-sequence frame token (and the separator before it) from the end of a stem. */
export function stripFramePattern(stem: string): string {
  const stripped = stem.replace(FRAME_PATTERN_SUFFIX, '');
  return stripped.length > 0 ? stripped : stem;
}

/** Case-insensitive, extension- and frame-pattern-free key used by the fuzzy tier. */
export function fuzzyKey(nameOrPath: string | undefined): string {
  const file = fileNameOf(nameOrPath);
  if (!file) return '';
  let s = stemOf(file);
  // Sequences can carry the frame token before the extension (`shot.####.exr`)
  // or a range after it (`shot.exr 1001-1100`); strip repeatedly.
  for (let i = 0; i < 3; i++) {
    const next = stripFramePattern(s);
    if (next === s) break;
    s = next;
  }
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sourceKeys(source: MatchableSource): string[] {
  const keys = [source.name, fileNameOf(source.url)].filter((k): k is string => !!k);
  return [...new Set(keys)];
}

function firstIndex(sources: readonly MatchableSource[], pred: (s: MatchableSource) => boolean): number {
  return sources.findIndex(pred);
}

function matchNames(sources: readonly MatchableSource[], names: string[]): number {
  if (names.length === 0) return -1;
  const exact = firstIndex(sources, (s) => sourceKeys(s).some((k) => names.includes(k)));
  if (exact >= 0) return exact;
  const stems = names.map(stemOf);
  return firstIndex(sources, (s) => sourceKeys(s).some((k) => stems.includes(stemOf(k))));
}

/**
 * Find the index of the session source referenced by an editorial clip.
 * Returns -1 when nothing matches.
 */
export function matchEditorialSource(sources: readonly MatchableSource[], query: SourceMatchQuery): number {
  if (sources.length === 0) return -1;

  // Tier 1: exact URL
  if (query.url) {
    const byUrl = firstIndex(sources, (s) => !!s.url && s.url === query.url);
    if (byUrl >= 0) return byUrl;
  }

  // Tiers 1-2: file name / stem of the URL or primary name
  const primary = [fileNameOf(query.url), query.name ? fileNameOf(query.name) : ''].filter((n) => !!n);
  const byPrimary = matchNames(sources, primary);
  if (byPrimary >= 0) return byPrimary;

  // Tier 3: clip name
  if (query.clipName) {
    const byClip = matchNames(sources, [fileNameOf(query.clipName)]);
    if (byClip >= 0) return byClip;
  }

  // Tier 4: reel
  if (query.reel) {
    const byReel = matchNames(sources, [query.reel]);
    if (byReel >= 0) return byReel;
  }

  // Tier 5: fuzzy
  const queryKeys = [query.url, query.name, query.clipName, query.reel]
    .map((n) => fuzzyKey(n))
    .filter((k) => k.length > 0);
  if (queryKeys.length === 0) return -1;

  const unique = (pred: (keys: string[]) => boolean): number => {
    let found = -1;
    for (const [i, source] of sources.entries()) {
      const keys = sourceKeys(source).map((k) => fuzzyKey(k));
      if (pred(keys)) {
        if (found >= 0) return -1; // ambiguous
        found = i;
      }
    }
    return found;
  };

  const byKey = unique((keys) => keys.some((k) => queryKeys.includes(k)));
  if (byKey >= 0) return byKey;

  // Prefix match (reel names are often truncated to 8 characters).
  return unique((keys) =>
    keys.some((k) =>
      queryKeys.some((q) => {
        const shorter = q.length <= k.length ? q : k;
        const longer = q.length <= k.length ? k : q;
        return shorter.length >= 4 && longer.startsWith(shorter);
      }),
    ),
  );
}

/**
 * Create a playlist import resolver that matches against the session's
 * currently loaded sources.
 */
export function createSessionSourceResolver(getSources: () => readonly MediaSource[]): PlaylistSourceResolver {
  return (name, url, hints) => {
    const sources = getSources() ?? [];
    const index = matchEditorialSource(sources, { name, url, clipName: hints?.clipName, reel: hints?.reel });
    const source = sources[index];
    if (!source) return null;
    const resolved: ResolvedPlaylistSource = { index, frameCount: source.duration };
    if (source.fps > 0) resolved.fps = source.fps;
    if (source.sequenceInfo) resolved.startFrame = source.sequenceInfo.startFrame;
    if (source.sourceTimecode) resolved.startTimecode = source.sourceTimecode;
    return resolved;
  };
}
