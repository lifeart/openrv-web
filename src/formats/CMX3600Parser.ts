/**
 * CMX3600 EDL parser.
 *
 * Parses CMX3600-style Edit Decision Lists into video edit events with
 * absolute timecode frame counts. Supports:
 *
 * - `FCM: DROP FRAME` / `FCM: NON-DROP FRAME` headers (may change mid-list)
 *   and drop-frame timecode (`;` separator).
 * - A caller-supplied frame rate (default 24). Drop-frame lists are always
 *   decoded at 29.97 / 59.94.
 * - Cuts (`C`), dissolves (`D nnn`) and wipes (`Wnnn nnn`), including the
 *   classic two-line transition form where the first line (same event number)
 *   describes the outgoing source.
 * - Record timecode (so gaps between events can be preserved by callers).
 * - `* FROM CLIP NAME:`, `* TO CLIP NAME:`, `* SOURCE FILE:` / `* FROM FILE:`
 *   comments, used for media resolution.
 *
 * Audio-only events and key (`K`) events are skipped.
 */

import { timecodeToFrames } from '../export/EDLWriter';
import { Logger } from '../utils/Logger';

const log = new Logger('CMX3600Parser');

/** Transition into an event. */
export interface CMXTransition {
  type: 'dissolve' | 'wipe';
  /** Transition duration in frames. */
  durationFrames: number;
  /** SMPTE wipe code for wipes (e.g. 1 for `W001`). */
  wipeCode?: number;
}

/** A parsed video event (one record segment). */
export interface CMXEvent {
  /** Event number as written in the list. */
  eventNumber: number;
  /** Reel / tape name. */
  reel: string;
  /** Channel field (e.g. `V`, `B`, `AA/V`). */
  track: string;
  /** Clip name from `* FROM CLIP NAME:` (or `* TO CLIP NAME:` for the incoming side of a transition). */
  clipName?: string;
  /** Source file path from `* SOURCE FILE:` / `* FROM FILE:` comments. */
  sourceFile?: string;
  /** Source in, as an absolute timecode frame count. */
  sourceIn: number;
  /** Source out (exclusive), as an absolute timecode frame count. */
  sourceOut: number;
  /** Record in, as an absolute timecode frame count. */
  recordIn: number;
  /** Record out (exclusive), as an absolute timecode frame count. */
  recordOut: number;
  /** Transition into this event (absent for cuts). */
  transition?: CMXTransition;
}

/** Parse options. */
export interface CMX3600ParseOptions {
  /** Frame rate used to decode timecode (default 24). */
  fps?: number;
}

/** Parse result. */
export interface CMX3600ParseResult {
  title?: string;
  /** Whether the list (first FCM header or timecodes) is drop-frame. */
  dropFrame: boolean;
  /** Effective frame rate used to decode timecode. */
  fps: number;
  /** Video events in list order. */
  events: CMXEvent[];
}

const TC = String.raw`\d{1,2}[:;.]\d{2}[:;.]\d{2}[:;.]\d{2}`;
const EVENT_REGEX = new RegExp(
  String.raw`^(\d{1,6})\s+(\S+)\s+(\S+)\s+(C|D|W\d{3}|K\s*[BO]?|KO|KB)\s+(?:(\d+)\s+)?(${TC})\s+(${TC})\s+(${TC})\s+(${TC})`,
  'i',
);

interface RawLine {
  eventNumber: number;
  reel: string;
  track: string;
  kind: string;
  duration: number;
  srcIn: string;
  srcOut: string;
  recIn: string;
  recOut: string;
  dropFrame: boolean;
  fromClipName?: string;
  toClipName?: string;
  sourceFile?: string;
}

function isTransitionKind(kind: string): boolean {
  return kind === 'D' || kind.startsWith('W');
}

function isVideoTrack(track: string): boolean {
  const t = track.toUpperCase();
  return t === 'B' || t.includes('V');
}

/** Effective decoding rate: drop-frame only exists at 29.97 / 59.94. */
function effectiveRate(fps: number, dropFrame: boolean): number {
  if (!dropFrame) return fps;
  if (Math.round(fps) >= 50) return 59.94;
  return 29.97;
}

function tcFrames(tc: string, fps: number, dropFrame: boolean): number {
  const isDrop = dropFrame || tc.includes(';');
  return timecodeToFrames(tc.replace(/\./g, ':'), effectiveRate(fps, isDrop), isDrop);
}

/**
 * Parse CMX3600 EDL text.
 */
export function parseCMX3600(text: string, options: CMX3600ParseOptions = {}): CMX3600ParseResult {
  const requestedFps = options.fps && Number.isFinite(options.fps) && options.fps > 0 ? options.fps : 24;
  const lines = text.split(/\r?\n/);
  let title: string | undefined;
  let fcmDrop = false;
  let sawFcm = false;
  let listDrop: boolean | undefined;
  const rawLines: RawLine[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE:')) {
      title = line.slice(6).trim();
      continue;
    }
    if (upper.startsWith('FCM:')) {
      fcmDrop = !upper.includes('NON') && upper.includes('DROP');
      if (!sawFcm) {
        sawFcm = true;
        listDrop = fcmDrop;
      }
      continue;
    }
    if (line.startsWith('*')) {
      const last = rawLines[rawLines.length - 1];
      if (!last) continue;
      const comment = line.replace(/^\*\s*/, '');
      const match = comment.match(/^(FROM CLIP NAME|TO CLIP NAME|SOURCE FILE|FROM FILE|TO FILE)\s*:\s*(.*)$/i);
      if (!match) continue;
      const [, rawKey = '', rawValue = ''] = match;
      const key = rawKey.toUpperCase();
      const value = rawValue.trim();
      if (!value) continue;
      if (key === 'FROM CLIP NAME') last.fromClipName = value;
      else if (key === 'TO CLIP NAME') last.toClipName = value;
      else if (key === 'TO FILE') last.sourceFile = value;
      else if (!last.sourceFile || key === 'SOURCE FILE') last.sourceFile = value;
      continue;
    }

    const m = line.match(EVENT_REGEX);
    if (!m) continue;
    const [, num = '', reel = '', track = '', kind = '', dur, srcIn = '', srcOut = '', recIn = '', recOut = ''] = m;
    const dropFrame = fcmDrop || srcIn.includes(';') || recIn.includes(';');
    if (listDrop === undefined) listDrop = dropFrame;
    rawLines.push({
      eventNumber: Number(num),
      reel,
      track,
      kind: kind.toUpperCase().replace(/\s+/g, ''),
      duration: dur ? Number(dur) : 0,
      srcIn,
      srcOut,
      recIn,
      recOut,
      dropFrame,
    });
  }

  const events: CMXEvent[] = [];
  for (const [i, raw] of rawLines.entries()) {
    if (!isVideoTrack(raw.track)) continue;
    if (raw.kind.startsWith('K')) {
      log.warn(`Event ${raw.eventNumber}: key events are not supported, skipping`);
      continue;
    }

    const next = rawLines[i + 1];

    // Two-line transition: this line (cut) is the outgoing side, the next line
    // with the same event number carries the transition and the incoming source.
    const isOutgoingSide =
      raw.kind === 'C' && next !== undefined && next.eventNumber === raw.eventNumber && isTransitionKind(next.kind);

    const event = toEvent(raw, requestedFps);
    if (isOutgoingSide) {
      // Comments following the pair are attached to the incoming line; share
      // the FROM name with the outgoing side.
      if (!event.clipName && next.fromClipName) event.clipName = next.fromClipName;
      if (!event.sourceFile && next.sourceFile) event.sourceFile = next.sourceFile;
      // A zero-length outgoing line only describes the A-side handle; it is
      // not a record segment of its own.
      if (event.recordOut > event.recordIn) events.push(event);
      continue;
    }

    if (isTransitionKind(raw.kind)) {
      const prev = rawLines[i - 1];
      const twoLine = prev !== undefined && prev.eventNumber === raw.eventNumber && prev.kind === 'C';
      // For two-line transitions the incoming clip is named by TO CLIP NAME.
      event.clipName = twoLine ? (raw.toClipName ?? undefined) : (raw.fromClipName ?? raw.toClipName);
      if (raw.kind === 'D') {
        event.transition = { type: 'dissolve', durationFrames: raw.duration };
      } else {
        event.transition = { type: 'wipe', durationFrames: raw.duration, wipeCode: Number(raw.kind.slice(1)) };
      }
      if (event.transition.durationFrames <= 0) delete event.transition;
    }

    events.push(event);
  }

  return {
    title,
    dropFrame: listDrop ?? false,
    fps: effectiveRate(requestedFps, listDrop ?? false),
    events,
  };
}

function toEvent(raw: RawLine, fps: number): CMXEvent {
  const event: CMXEvent = {
    eventNumber: raw.eventNumber,
    reel: raw.reel,
    track: raw.track,
    sourceIn: tcFrames(raw.srcIn, fps, raw.dropFrame),
    sourceOut: tcFrames(raw.srcOut, fps, raw.dropFrame),
    recordIn: tcFrames(raw.recIn, fps, raw.dropFrame),
    recordOut: tcFrames(raw.recOut, fps, raw.dropFrame),
  };
  if (raw.fromClipName) event.clipName = raw.fromClipName;
  if (raw.sourceFile) event.sourceFile = raw.sourceFile;
  return event;
}

/**
 * Parse a timecode string (e.g. a source's embedded start timecode) to an
 * absolute frame count, honouring drop-frame separators.
 */
export function cmxTimecodeToFrames(tc: string, fps: number, dropFrame = false): number {
  return tcFrames(tc, fps > 0 ? fps : 24, dropFrame);
}
