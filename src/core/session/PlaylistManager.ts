/**
 * PlaylistManager - Manages multiple clips in sequence.
 *
 * Features:
 * - Add, remove, reorder clips
 * - Map global frames to source/local frames
 * - EDL import/export
 * - Loop and auto-advance options
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { parseOTIO, parseOTIOMultiTrack } from '../../utils/media/OTIOParser';
import type {
  ParsedOTIOClip,
  ParsedOTIOGap,
  ParsedOTIOMarker,
  ParsedOTIOTrack,
  ParsedOTIOTransition,
} from '../../utils/media/OTIOParser';
import { parseCMX3600, cmxTimecodeToFrames, type CMXEvent } from '../../formats/CMX3600Parser';
import { parseRVEDL } from '../../formats/RVEDLParser';
import { fileNameOf, type PlaylistSourceResolver, type ResolvedPlaylistSource } from './EditorialSourceMatcher';
import type { ManagerBase } from '../ManagerBase';
import type { TransitionConfig, TransitionFrameInfo } from '../types/transition';
import { isTransitionType } from '../types/transition';
import type { TransitionManager } from './TransitionManager';

import { Logger } from '../../utils/Logger';

const logger = new Logger('PlaylistManager');

export type { PlaylistSourceResolver, ResolvedPlaylistSource } from './EditorialSourceMatcher';

/** Clamp a 1-based local frame range to the media (when its length is known). */
function clampLocalRange(inPoint: number, outPoint: number, frameCount: number): { inPoint: number; outPoint: number } {
  let i = Math.max(1, Math.round(inPoint));
  let o = Math.round(outPoint);
  if (frameCount > 0) {
    if (o > frameCount || i > frameCount) {
      logger.debug(`Imported range ${inPoint}-${outPoint} exceeds media length ${frameCount}; clamping`);
    }
    o = Math.min(o, frameCount);
    i = Math.min(i, frameCount);
  }
  if (o < i) o = i;
  return { inPoint: i, outPoint: o };
}

/**
 * Convert an OTIO clip's media-time range to the source's 1-based local frames.
 * The media start is the reference's available_range start when present;
 * otherwise an image sequence's start frame (when the range uses sequence
 * frame numbers), else media time 0.
 */
function otioClipToLocalRange(
  clip: ParsedOTIOClip,
  ref: ResolvedPlaylistSource | null,
): { inPoint: number; outPoint: number } {
  let base = 0;
  if (clip.availableStartFrame !== undefined) {
    base = clip.availableStartFrame;
  } else if (ref?.startFrame !== undefined && ref.startFrame > 1 && clip.inFrame >= ref.startFrame) {
    base = ref.startFrame;
  }
  return clampLocalRange(clip.inFrame - base + 1, clip.outFrame - base + 1, ref?.frameCount ?? 0);
}

/** Display name of an EDL event (clip name, else reel). */
function edlEventName(event: CMXEvent): string {
  return event.clipName ?? event.reel;
}

/** Map an EDL transition to a playlist transition type. */
function edlTransitionType(event: CMXEvent): TransitionConfig['type'] {
  if (event.transition?.type === 'wipe') {
    // SMPTE wipe 001 is a horizontal (left-to-right) edge; 002 is vertical.
    return event.transition.wipeCode === 2 ? 'wipe-down' : 'wipe-right';
  }
  return 'dissolve';
}
/** Represents a single clip in the playlist */
export interface PlaylistClip {
  /** Unique ID for the clip */
  id: string;
  /** Index of the source in session's sources array */
  sourceIndex: number;
  /** Source name for display */
  sourceName: string;
  /** In point (start frame) within the source */
  inPoint: number;
  /** Out point (end frame) within the source */
  outPoint: number;
  /** Global start frame in the playlist timeline */
  globalStartFrame: number;
  /** Duration in frames */
  duration: number;
  /** Optional metadata (e.g. from OTIO import) */
  metadata?: Record<string, unknown>;
}

/** Input shape for replacing playlist clips in one operation */
export interface PlaylistClipInput {
  sourceIndex: number;
  sourceName: string;
  inPoint: number;
  outPoint: number;
  metadata?: Record<string, unknown>;
}

/** Playlist state for serialization */
export interface PlaylistState {
  /** List of clips */
  clips: PlaylistClip[];
  /** Whether playlist mode is active */
  enabled: boolean;
  /** Current playhead position (global frame) */
  currentFrame: number;
  /** Loop mode: none, single (current clip), all, pingpong */
  loopMode: 'none' | 'single' | 'all' | 'pingpong';
  /** Transitions between clips (optional, gap-indexed) */
  transitions?: (TransitionConfig | null)[];
}

/** Default playlist state */
export const DEFAULT_PLAYLIST_STATE: PlaylistState = {
  clips: [],
  enabled: false,
  currentFrame: 1,
  loopMode: 'none',
};

/** Events emitted by PlaylistManager */
export interface PlaylistManagerEvents extends EventMap {
  /** Emitted when clips change */
  clipsChanged: { clips: PlaylistClip[] };
  /** Emitted when enabled state changes */
  enabledChanged: { enabled: boolean };
  /** Emitted when current clip changes */
  clipChanged: { clip: PlaylistClip | null; index: number };
  /** Emitted when loop mode changes */
  loopModeChanged: { mode: 'none' | 'single' | 'all' | 'pingpong' };
  /** Emitted when playhead reaches end */
  playlistEnded: void;
}

/** An OTIO clip that could not be resolved during import */
export interface UnresolvedOTIOClip {
  id: string;
  name: string;
  sourceUrl: string;
  inFrame: number;
  outFrame: number;
  timelineIn: number;
}

/** Result of an OTIO import, including editorial structure */
export interface OTIOImportResult {
  /** Number of clips successfully imported */
  importedCount: number;
  /** Transitions from the OTIO timeline (first video track) */
  transitions: ParsedOTIOTransition[];
  /** Gaps from the OTIO timeline (first video track) */
  gaps: ParsedOTIOGap[];
  /** Markers from the OTIO timeline */
  markers: ParsedOTIOMarker[];
  /** Timeline-level metadata from the OTIO file */
  metadata?: Record<string, unknown>;
}

/** Result of mapping a global frame to source */
export interface FrameMapping {
  clip: PlaylistClip;
  clipIndex: number;
  sourceIndex: number;
  localFrame: number;
}

/**
 * PlaylistManager handles multi-clip playlist functionality
 */
export class PlaylistManager extends EventEmitter<PlaylistManagerEvents> implements ManagerBase {
  private clips: PlaylistClip[] = [];
  private enabled = false;
  private currentFrame = 1;
  private loopMode: 'none' | 'single' | 'all' | 'pingpong' = 'none';
  private pingpongDirection: 1 | -1 = 1;
  private nextClipId = 1;
  private _unresolvedClips: UnresolvedOTIOClip[] = [];
  private nextUnresolvedId = 1;
  private transitionManager: TransitionManager | null = null;
  private _transitionChangedHandler: (() => void) | null = null;
  private _transitionsResetHandler: (() => void) | null = null;
  private _lastOTIOImportResult: OTIOImportResult | null = null;
  /**
   * Empty frames preceding each clip (keyed by clip id), e.g. OTIO gaps.
   * Captured the first time a clip is laid out so that transition overlaps
   * can be applied on top of gap spacing without losing it.
   */
  private gapsBefore = new Map<string, number>();

  constructor() {
    super();
  }

  /**
   * Set the transition manager for overlap-aware frame calculation.
   */
  setTransitionManager(tm: TransitionManager): void {
    // Remove listeners from old transition manager
    if (this.transitionManager && this._transitionChangedHandler && this._transitionsResetHandler) {
      this.transitionManager.off('transitionChanged', this._transitionChangedHandler);
      this.transitionManager.off('transitionsReset', this._transitionsResetHandler);
    }

    this.transitionManager = tm;

    this._transitionChangedHandler = () => {
      this.recalculateGlobalFrames();
      this.emit('clipsChanged', { clips: [...this.clips] });
    };
    this._transitionsResetHandler = () => {
      this.recalculateGlobalFrames();
      this.emit('clipsChanged', { clips: [...this.clips] });
    };

    tm.on('transitionChanged', this._transitionChangedHandler);
    tm.on('transitionsReset', this._transitionsResetHandler);
  }

  /**
   * Get transition info at a global frame (delegates to TransitionManager).
   * Returns null if no transition manager is set or frame is not in a transition.
   */
  getTransitionAtFrame(globalFrame: number): TransitionFrameInfo | null {
    if (!this.transitionManager) return null;
    return this.transitionManager.getTransitionAtFrame(globalFrame, this.clips, this.resolveGapsBefore());
  }

  /**
   * Add a clip to the playlist
   */
  addClip(
    sourceIndex: number,
    sourceName: string,
    inPoint: number,
    outPoint: number,
    metadata?: Record<string, unknown>,
  ): PlaylistClip {
    const duration = outPoint - inPoint + 1;
    const globalStartFrame = this.getTotalDuration() + 1;

    const clip: PlaylistClip = {
      id: `clip-${this.nextClipId++}`,
      sourceIndex,
      sourceName,
      inPoint,
      outPoint,
      globalStartFrame,
      duration,
    };

    if (metadata) {
      clip.metadata = metadata;
    }

    this.resolveGapsBefore();
    this.clips.push(clip);
    this.gapsBefore.set(clip.id, 0);
    this.transitionManager?.resizeToClips(this.clips.length);
    this.emit('clipsChanged', { clips: [...this.clips] });
    return clip;
  }

  /**
   * Replace all clips in one atomic update.
   * Emits a single clipsChanged event.
   */
  replaceClips(clips: PlaylistClipInput[]): void {
    const nextClips: PlaylistClip[] = [];

    for (const clip of clips) {
      const inPoint = Math.max(1, Math.floor(clip.inPoint));
      const outPoint = Math.max(inPoint, Math.floor(clip.outPoint));
      const duration = outPoint - inPoint + 1;

      const entry: PlaylistClip = {
        id: `clip-${this.nextClipId++}`,
        sourceIndex: clip.sourceIndex,
        sourceName: clip.sourceName,
        inPoint,
        outPoint,
        globalStartFrame: 1, // will be recalculated
        duration,
      };

      if (clip.metadata) {
        entry.metadata = clip.metadata;
      }

      nextClips.push(entry);
    }

    this.transitionManager?.resizeToClips(nextClips.length);
    this.clips = nextClips;
    this.gapsBefore = new Map(nextClips.map((c) => [c.id, 0]));
    this.recalculateGlobalFrames();

    const totalDuration = this.getTotalDuration();
    this.currentFrame = Math.max(1, Math.min(this.currentFrame, totalDuration || 1));

    this.emit('clipsChanged', { clips: [...this.clips] });
  }

  /**
   * Remove a clip by ID
   */
  removeClip(clipId: string): boolean {
    const index = this.clips.findIndex((c) => c.id === clipId);
    if (index === -1) return false;

    this.resolveGapsBefore();
    this.clips.splice(index, 1);
    this.transitionManager?.resizeToClips(this.clips.length);
    this.recalculateGlobalFrames();
    this.emit('clipsChanged', { clips: [...this.clips] });
    return true;
  }

  /**
   * Move a clip to a new position
   */
  moveClip(clipId: string, newIndex: number): boolean {
    const currentIndex = this.clips.findIndex((c) => c.id === clipId);
    if (currentIndex === -1) return false;

    newIndex = Math.max(0, Math.min(newIndex, this.clips.length - 1));
    if (currentIndex === newIndex) return false;

    this.resolveGapsBefore();
    const removed = this.clips.splice(currentIndex, 1);
    const clip = removed[0];
    if (clip) {
      this.clips.splice(newIndex, 0, clip);
    } else {
      logger.warn(`PlaylistManager.moveClip: Failed to remove clip at index ${currentIndex}`);
      return false;
    }
    this.recalculateGlobalFrames();
    this.emit('clipsChanged', { clips: [...this.clips] });
    return true;
  }

  /**
   * Update clip in/out points
   */
  updateClipPoints(clipId: string, inPoint: number, outPoint: number): boolean {
    const clip = this.clips.find((c) => c.id === clipId);
    if (!clip) return false;

    this.resolveGapsBefore();
    clip.inPoint = inPoint;
    clip.outPoint = outPoint;
    clip.duration = outPoint - inPoint + 1;
    this.recalculateGlobalFrames();
    this.emit('clipsChanged', { clips: [...this.clips] });
    return true;
  }

  /**
   * Get clip at a global frame position.
   *
   * Transition-aware: inside a transition overlap both the outgoing and the
   * incoming clip cover the frame. The incoming (later) clip owns the frame,
   * so playback advances through the overlap into the incoming clip instead
   * of being sent back into the outgoing one. The outgoing clip is the
   * blend's second input (see `getTransitionAtFrame`).
   */
  getClipAtFrame(globalFrame: number): FrameMapping | null {
    for (let i = this.clips.length - 1; i >= 0; i--) {
      const clip = this.clips[i];
      if (!clip) continue;

      const clipEnd = clip.globalStartFrame + clip.duration - 1;

      if (globalFrame >= clip.globalStartFrame && globalFrame <= clipEnd) {
        const localOffset = globalFrame - clip.globalStartFrame;
        const localFrame = clip.inPoint + localOffset;

        return {
          clip,
          clipIndex: i,
          sourceIndex: clip.sourceIndex,
          localFrame,
        };
      }
    }
    return null;
  }

  /**
   * Get the next frame, handling clip transitions and loop modes
   */
  getNextFrame(currentGlobal: number): { frame: number; clipChanged: boolean } {
    const totalDuration = this.getTotalDuration();
    if (totalDuration === 0) return { frame: currentGlobal, clipChanged: false };

    // In pingpong mode with reverse direction, "next" actually goes backwards
    if (this.loopMode === 'pingpong' && this.pingpongDirection === -1) {
      return this._getPreviousFrameInternal(currentGlobal);
    }

    const currentMapping = this.getClipAtFrame(currentGlobal);
    const nextGlobal = currentGlobal + 1;

    // Check if we're at the end of current clip
    if (currentMapping) {
      const clipEnd = currentMapping.clip.globalStartFrame + currentMapping.clip.duration - 1;

      if (currentGlobal >= clipEnd) {
        // At end of clip
        if (this.loopMode === 'single') {
          // Loop current clip
          return { frame: currentMapping.clip.globalStartFrame, clipChanged: false };
        }

        // Move to next clip or handle playlist end
        const nextClipIndex = currentMapping.clipIndex + 1;
        const nextClip = this.clips[nextClipIndex];
        if (nextClip) {
          return { frame: nextClip.globalStartFrame, clipChanged: true };
        }

        // At end of playlist
        if (this.loopMode === 'all') {
          return { frame: 1, clipChanged: true };
        }

        if (this.loopMode === 'pingpong') {
          // Reverse direction and go backwards
          this.pingpongDirection = -1;
          return this._getPreviousFrameInternal(currentGlobal);
        }

        // End of playlist, no loop
        this.emit('playlistEnded', undefined);
        return { frame: currentGlobal, clipChanged: false };
      }
    }

    // Normal frame advance
    const nextMapping = this.getClipAtFrame(nextGlobal);
    const clipChanged =
      (currentMapping === null && nextMapping !== null) ||
      (currentMapping !== null && nextMapping !== null && currentMapping.clipIndex !== nextMapping.clipIndex);

    return { frame: nextGlobal, clipChanged: !!clipChanged };
  }

  /**
   * Internal helper for going backwards (used by pingpong logic)
   */
  private _getPreviousFrameInternal(currentGlobal: number): { frame: number; clipChanged: boolean } {
    if (currentGlobal <= 1) {
      if (this.loopMode === 'pingpong') {
        // Reverse direction back to forward
        this.pingpongDirection = 1;
        const nextGlobal = currentGlobal + 1;
        const nextMapping = this.getClipAtFrame(nextGlobal);
        const currentMapping = this.getClipAtFrame(currentGlobal);
        const clipChanged =
          (currentMapping === null && nextMapping !== null) ||
          (currentMapping !== null && nextMapping !== null && currentMapping.clipIndex !== nextMapping.clipIndex);
        return { frame: nextGlobal, clipChanged: !!clipChanged };
      }
      if (this.loopMode === 'all') {
        const totalDuration = this.getTotalDuration();
        return { frame: totalDuration, clipChanged: true };
      }
      return { frame: 1, clipChanged: false };
    }

    const currentMapping = this.getClipAtFrame(currentGlobal);
    const prevGlobal = currentGlobal - 1;
    const prevMapping = this.getClipAtFrame(prevGlobal);

    const clipChanged =
      (currentMapping === null && prevMapping !== null) ||
      (currentMapping !== null && prevMapping !== null && currentMapping.clipIndex !== prevMapping.clipIndex);

    return { frame: prevGlobal, clipChanged: !!clipChanged };
  }

  /**
   * Get the previous frame, handling clip transitions
   */
  getPreviousFrame(currentGlobal: number): { frame: number; clipChanged: boolean } {
    // In pingpong mode with reverse direction, "previous" actually goes forward
    if (this.loopMode === 'pingpong' && this.pingpongDirection === -1) {
      // Going forward (opposite of the current reverse direction)
      const totalDuration = this.getTotalDuration();
      if (totalDuration === 0) return { frame: currentGlobal, clipChanged: false };

      const currentMapping = this.getClipAtFrame(currentGlobal);
      const nextGlobal = currentGlobal + 1;

      if (currentMapping) {
        const clipEnd = currentMapping.clip.globalStartFrame + currentMapping.clip.duration - 1;
        if (currentGlobal >= clipEnd) {
          const nextClipIndex = currentMapping.clipIndex + 1;
          const nextClip = this.clips[nextClipIndex];
          if (nextClip) {
            return { frame: nextClip.globalStartFrame, clipChanged: true };
          }
          // At end, reverse back to forward
          this.pingpongDirection = 1;
          return this._getPreviousFrameInternal(currentGlobal);
        }
      }

      const nextMapping = this.getClipAtFrame(nextGlobal);
      const clipChanged =
        (currentMapping === null && nextMapping !== null) ||
        (currentMapping !== null && nextMapping !== null && currentMapping.clipIndex !== nextMapping.clipIndex);
      return { frame: nextGlobal, clipChanged: !!clipChanged };
    }

    if (currentGlobal <= 1) {
      if (this.loopMode === 'all' && this.clips.length > 0) {
        const totalDuration = this.getTotalDuration();
        return { frame: totalDuration, clipChanged: true };
      }
      if (this.loopMode === 'pingpong' && this.clips.length > 0) {
        // Reverse direction back to forward
        this.pingpongDirection = 1;
        const nextGlobal = currentGlobal + 1;
        const nextMapping = this.getClipAtFrame(nextGlobal);
        const currentMapping = this.getClipAtFrame(currentGlobal);
        const clipChanged =
          (currentMapping === null && nextMapping !== null) ||
          (currentMapping !== null && nextMapping !== null && currentMapping.clipIndex !== nextMapping.clipIndex);
        return { frame: nextGlobal, clipChanged: !!clipChanged };
      }
      return { frame: 1, clipChanged: false };
    }

    const currentMapping = this.getClipAtFrame(currentGlobal);
    const prevGlobal = currentGlobal - 1;
    const prevMapping = this.getClipAtFrame(prevGlobal);

    const clipChanged =
      (currentMapping === null && prevMapping !== null) ||
      (currentMapping !== null && prevMapping !== null && currentMapping.clipIndex !== prevMapping.clipIndex);

    return { frame: prevGlobal, clipChanged: !!clipChanged };
  }

  /**
   * Jump to the start of the next clip in the playlist.
   * Wraps to first clip when loopMode='all' or 'pingpong'.
   * Returns null if at end with no loop, or if playlist is empty.
   */
  goToNextClip(currentGlobalFrame: number): { frame: number; clip: PlaylistClip } | null {
    const firstClip = this.clips[0];
    if (!firstClip) return null;

    const currentMapping = this.getClipAtFrame(currentGlobalFrame);
    if (!currentMapping) {
      // Not on any clip — go to first clip
      return { frame: firstClip.globalStartFrame, clip: firstClip };
    }

    const nextClip = this.clips[currentMapping.clipIndex + 1];
    if (nextClip) {
      return { frame: nextClip.globalStartFrame, clip: nextClip };
    }

    // At last clip
    if (this.loopMode === 'all' || this.loopMode === 'pingpong') {
      return { frame: firstClip.globalStartFrame, clip: firstClip };
    }

    return null;
  }

  /**
   * Jump to the start of the previous clip, or start of current clip if mid-clip.
   * If already at the start of a clip (within 1 frame), goes to previous clip.
   * Wraps to last clip when loopMode='all' or 'pingpong'.
   * Returns null if at beginning with no loop, or if playlist is empty.
   */
  goToPreviousClip(currentGlobalFrame: number): { frame: number; clip: PlaylistClip } | null {
    const lastClip = this.clips[this.clips.length - 1];
    if (!lastClip) return null;

    const currentMapping = this.getClipAtFrame(currentGlobalFrame);
    if (!currentMapping) {
      // Not on any clip — go to last clip
      return { frame: lastClip.globalStartFrame, clip: lastClip };
    }

    // If we're past the start of the clip (more than 1 frame in), go to start of current clip
    if (currentGlobalFrame > currentMapping.clip.globalStartFrame + 1) {
      return { frame: currentMapping.clip.globalStartFrame, clip: currentMapping.clip };
    }

    // At or near start of clip — go to previous clip
    const prevIndex = currentMapping.clipIndex - 1;
    const prevClip = prevIndex >= 0 ? this.clips[prevIndex] : undefined;
    if (prevClip) {
      return { frame: prevClip.globalStartFrame, clip: prevClip };
    }

    // At first clip
    if (this.loopMode === 'all' || this.loopMode === 'pingpong') {
      return { frame: lastClip.globalStartFrame, clip: lastClip };
    }

    return null;
  }

  /**
   * Get the clip that contains a given source index.
   * Returns the first matching clip, or null if not found.
   */
  getClipForSource(sourceIndex: number): PlaylistClip | null {
    return this.clips.find((c) => c.sourceIndex === sourceIndex) ?? null;
  }

  /**
   * Resolve the empty-frame gap preceding each clip, in clip order.
   *
   * Gaps are captured per clip id the first time a clip is laid out. A clip
   * seen for the first time is assumed to be positioned without transition
   * overlap (OTIO import positions, `addClip` appending after the current
   * end, or the placeholder positions of `replaceClips`), so its gap is the
   * distance from the end of the preceding clip's current position.
   * Entries for clips no longer in the playlist are dropped.
   */
  private resolveGapsBefore(): number[] {
    const gaps: number[] = [];
    const next = new Map<string, number>();
    this.clips.forEach((clip, i) => {
      let gap = this.gapsBefore.get(clip.id);
      if (gap === undefined) {
        const prev = this.clips[i - 1];
        const expectedStart = prev ? prev.globalStartFrame + prev.duration : 1;
        gap = Math.max(0, clip.globalStartFrame - expectedStart);
      }
      gaps.push(gap);
      next.set(clip.id, gap);
    });
    this.gapsBefore = next;
    return gaps;
  }

  /**
   * Recalculate global start frames after clip changes.
   * Preserves gap spacing (e.g. OTIO gaps) and, when a transition manager is
   * set, applies transition overlaps on top of it.
   */
  private recalculateGlobalFrames(): void {
    const gaps = this.resolveGapsBefore();
    if (this.transitionManager) {
      const adjusted = this.transitionManager.calculateOverlapAdjustedFrames(this.clips, gaps);
      this.clips.forEach((clip, i) => {
        clip.globalStartFrame = adjusted[i]?.globalStartFrame ?? clip.globalStartFrame;
      });
    } else {
      let globalStart = 1;
      this.clips.forEach((clip, i) => {
        globalStart += gaps[i] ?? 0;
        clip.globalStartFrame = globalStart;
        globalStart += clip.duration;
      });
    }
  }

  /**
   * Get total playlist duration in frames.
   * Computed as the end of the last clip, so it accounts for both gap-spaced
   * clips (non-contiguous globalStartFrame values, e.g. OTIO gaps) and
   * transition overlaps (already applied to globalStartFrame by
   * recalculateGlobalFrames).
   */
  getTotalDuration(): number {
    if (this.clips.length === 0) return 0;

    // Find the end of the last clip by globalStartFrame + duration - 1
    // This correctly handles gaps (non-contiguous globalStartFrame values)
    // and overlaps (an overlapped clip ends before its successor does).
    let maxEnd = 0;
    for (const clip of this.clips) {
      const clipEnd = clip.globalStartFrame + clip.duration - 1;
      if (clipEnd > maxEnd) {
        maxEnd = clipEnd;
      }
    }
    return maxEnd;
  }

  /**
   * Get all clips
   */
  getClips(): PlaylistClip[] {
    return [...this.clips];
  }

  /**
   * Get clip by ID
   */
  getClip(clipId: string): PlaylistClip | undefined {
    return this.clips.find((c) => c.id === clipId);
  }

  /**
   * Get clip by index
   */
  getClipByIndex(index: number): PlaylistClip | undefined {
    return this.clips[index];
  }

  /**
   * Get clip count
   */
  getClipCount(): number {
    return this.clips.length;
  }

  /**
   * Enable/disable playlist mode
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.emit('enabledChanged', { enabled });
    }
  }

  /**
   * Check if playlist mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set loop mode
   */
  setLoopMode(mode: 'none' | 'single' | 'all' | 'pingpong'): void {
    if (this.loopMode !== mode) {
      this.loopMode = mode;
      if (mode !== 'pingpong') {
        this.pingpongDirection = 1;
      }
      this.emit('loopModeChanged', { mode });
    }
  }

  /**
   * Get current loop mode
   */
  getLoopMode(): 'none' | 'single' | 'all' | 'pingpong' {
    return this.loopMode;
  }

  /**
   * Get the current pingpong direction.
   * 1 = forward, -1 = reverse.
   */
  getPingpongDirection(): 1 | -1 {
    return this.pingpongDirection;
  }

  /**
   * Set current frame (global)
   */
  setCurrentFrame(frame: number): void {
    this.currentFrame = Math.max(1, Math.min(frame, this.getTotalDuration() || 1));
  }

  /**
   * Get current frame (global)
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * Clear all clips
   */
  clear(): void {
    this.clips = [];
    this.gapsBefore.clear();
    this.currentFrame = 1;
    if (this.transitionManager) {
      this.transitionManager.clear();
    }
    this.emit('clipsChanged', { clips: [] });
  }

  /**
   * Get state for serialization
   */
  getState(): PlaylistState {
    const state: PlaylistState = {
      clips: [...this.clips],
      enabled: this.enabled,
      currentFrame: this.currentFrame,
      loopMode: this.loopMode,
    };

    if (this.transitionManager) {
      const transitions = this.transitionManager.getState();
      if (transitions.length > 0) {
        state.transitions = transitions;
      }
    }

    return state;
  }

  /**
   * Restore state from serialization
   */
  setState(state: Partial<PlaylistState>): void {
    if (state.clips) {
      this.clips = [...state.clips];
      this.captureGapsFromLayout(state.transitions ?? []);
      // Ensure nextClipId is higher than any existing clip
      for (const clip of this.clips) {
        const match = clip.id.match(/clip-(\d+)/);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num >= this.nextClipId) {
            this.nextClipId = num + 1;
          }
        }
      }
      this.emit('clipsChanged', { clips: [...this.clips] });
    }
    if (state.currentFrame !== undefined) {
      this.currentFrame = state.currentFrame;
    }
    if (state.enabled !== undefined) {
      this.setEnabled(state.enabled);
    }
    if (state.loopMode !== undefined) {
      this.setLoopMode(state.loopMode);
    }
    // Restore transitions when transition manager is set
    if (this.transitionManager) {
      if (state.transitions) {
        this.transitionManager.setState(state.transitions);
      } else {
        this.transitionManager.clear();
      }
    }
  }

  /**
   * Re-derive per-clip gaps from a serialized layout whose globalStartFrame
   * values already include the given transition overlaps.
   */
  private captureGapsFromLayout(transitions: readonly (TransitionConfig | null)[]): void {
    this.gapsBefore = new Map();
    this.clips.forEach((clip, i) => {
      const prev = this.clips[i - 1];
      const prevTransition = i > 0 ? transitions[i - 1] : null;
      const overlap = prevTransition && prevTransition.type !== 'cut' ? Math.max(0, prevTransition.durationFrames) : 0;
      const expectedStart = prev ? prev.globalStartFrame + prev.duration - overlap : 1;
      this.gapsBefore.set(clip.id, Math.max(0, clip.globalStartFrame - expectedStart));
    });
  }

  /**
   * Export as EDL (Edit Decision List) format
   */
  toEDL(title = 'OpenRV Playlist'): string {
    const lines: string[] = ['TITLE: ' + title, 'FCM: NON-DROP FRAME', ''];

    let editNum = 1;
    for (const clip of this.clips) {
      // Format: EDIT# SOURCE TRACK TYPE START END RECORD_START RECORD_END
      // Simplified EDL format for basic compatibility
      const sourceIn = this.framesToTimecode(clip.inPoint);
      const sourceOut = this.framesToTimecode(clip.outPoint + 1);
      const recordIn = this.framesToTimecode(clip.globalStartFrame);
      const recordOut = this.framesToTimecode(clip.globalStartFrame + clip.duration);

      lines.push(
        `${String(editNum).padStart(3, '0')}  ${clip.sourceName.padEnd(8).slice(0, 8)} V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`,
      );
      lines.push(`* FROM CLIP NAME: ${clip.sourceName}`);
      lines.push('');
      editNum++;
    }

    return lines.join('\n');
  }

  /**
   * Convert frame number to timecode string (HH:MM:SS:FF at 24fps)
   */
  private framesToTimecode(frame: number, fps = 24): string {
    const totalSeconds = Math.floor(frame / fps);
    const frames = frame % fps;
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);

    return [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
      String(frames).padStart(2, '0'),
    ].join(':');
  }

  /**
   * Import from a CMX3600 EDL.
   *
   * - Timecode is decoded at `options.fps` (default 24); `FCM: DROP FRAME`
   *   and `;` timecodes are decoded as 29.97/59.94 drop-frame.
   * - Record timecode positions clips, so gaps between events are preserved
   *   (relative to the first event's record-in).
   * - Dissolves (`D nnn`) and wipes (`Wnnn nnn`) become playlist transitions.
   * - Media is resolved via `* SOURCE FILE:`, `* FROM CLIP NAME:` and the reel.
   *
   * Source timecode is converted to the matched source's 1-based local frames:
   * - When the source has an embedded start timecode, local = TC - startTC + 1.
   * - Otherwise TC is treated as relative to 00:00:00:00 (local = TC + 1).
   *   If that would place any event referencing the source beyond the end of
   *   the media (e.g. a 01:00:00:00-based list against a file without
   *   timecode metadata), the earliest source-in among that source's events
   *   is used as the media start instead, so frame ranges stay inside the media.
   *
   * @returns Number of clips imported
   */
  fromEDL(edl: string, sourceResolver: PlaylistSourceResolver, options?: { fps?: number }): number {
    const parsed = parseCMX3600(edl, { fps: options?.fps });
    this._unresolvedClips = [];

    // Order events by record time (stable)
    const events = parsed.events
      .map((event, order) => ({ event, order }))
      .sort((a, b) => a.event.recordIn - b.event.recordIn || a.order - b.order)
      .map((e) => e.event);
    const firstEvent = events[0];
    if (!firstEvent) return 0;

    const recordBase = firstEvent.recordIn;
    const timelineOffset = this.getTotalDuration();

    // Resolve every event first so per-source time bases can be computed.
    const resolvedEvents = events.map((event) => ({ event, ref: this.resolveEDLEvent(event, sourceResolver) }));

    const sourceBases = new Map<number, number>();
    const unresolvedBases = new Map<string, number>();
    for (const { event, ref } of resolvedEvents) {
      if (ref) {
        if (sourceBases.has(ref.index)) continue;
        sourceBases.set(ref.index, this.edlSourceBase(ref, events, resolvedEvents, parsed.fps));
      } else {
        const key = edlEventName(event);
        unresolvedBases.set(key, Math.min(unresolvedBases.get(key) ?? event.sourceIn, event.sourceIn));
      }
    }

    let importedCount = 0;
    const pendingTransitions: { gapIndex: number; config: TransitionConfig }[] = [];
    let previousImported: { clipIndex: number; clip: PlaylistClip; frameCount: number } | null = null;

    for (const { event, ref } of resolvedEvents) {
      const name = edlEventName(event);
      const timelineIn = event.recordIn - recordBase;

      if (!ref) {
        const base = unresolvedBases.get(name) ?? event.sourceIn;
        this._unresolvedClips.push({
          id: `unresolved-${this.nextUnresolvedId++}`,
          name,
          sourceUrl: event.sourceFile ?? '',
          inFrame: event.sourceIn - base + 1,
          outFrame: Math.max(event.sourceIn - base + 1, event.sourceOut - base),
          timelineIn,
        });
        previousImported = null;
        continue;
      }

      const base = sourceBases.get(ref.index) ?? 0;
      const range = clampLocalRange(event.sourceIn - base + 1, event.sourceOut - base, ref.frameCount);
      const clip: PlaylistClip = {
        id: `clip-${this.nextClipId++}`,
        sourceIndex: ref.index,
        sourceName: event.clipName ?? event.reel,
        inPoint: range.inPoint,
        outPoint: range.outPoint,
        globalStartFrame: timelineOffset + timelineIn + 1,
        duration: range.outPoint - range.inPoint + 1,
      };

      // Transition into this clip from the previous (record-adjacent) clip.
      if (event.transition && previousImported) {
        const prev = previousImported.clip;
        const wanted = event.transition.durationFrames;
        const existingOverlap = prev.globalStartFrame + prev.duration - clip.globalStartFrame;
        if (existingOverlap < wanted) {
          // Standard CMX: the outgoing source continues past the cut for the
          // length of the transition (A-side handle).
          const extend = wanted - Math.max(0, existingOverlap);
          const maxOut = previousImported.frameCount > 0 ? previousImported.frameCount : Infinity;
          prev.outPoint = Math.min(prev.outPoint + extend, maxOut);
          prev.duration = prev.outPoint - prev.inPoint + 1;
        }
        const overlap = Math.min(wanted, prev.globalStartFrame + prev.duration - clip.globalStartFrame);
        if (overlap > 0) {
          pendingTransitions.push({
            gapIndex: previousImported.clipIndex,
            config: { type: edlTransitionType(event), durationFrames: overlap },
          });
        }
      }

      this.clips.push(clip);
      previousImported = { clipIndex: this.clips.length - 1, clip, frameCount: ref.frameCount };
      importedCount++;
    }

    this.transitionManager?.resizeToClips(this.clips.length);
    this.applyImportedTransitions(pendingTransitions);
    this.emit('clipsChanged', { clips: [...this.clips] });
    return importedCount;
  }

  /** Resolve an EDL event: SOURCE FILE / clip name / reel are passed as matching hints. */
  private resolveEDLEvent(event: CMXEvent, resolver: PlaylistSourceResolver): ResolvedPlaylistSource | null {
    const hints = { clipName: event.clipName, reel: event.reel };
    const primary = event.clipName ?? event.reel;
    const resolved = resolver(primary, event.sourceFile, hints);
    if (resolved) return resolved;
    if (primary !== event.reel) return resolver(event.reel, event.sourceFile, hints);
    return null;
  }

  /** Media-start timecode (in frames) used to convert EDL source TC for one source. */
  private edlSourceBase(
    ref: ResolvedPlaylistSource,
    events: CMXEvent[],
    resolvedEvents: { event: CMXEvent; ref: ResolvedPlaylistSource | null }[],
    fps: number,
  ): number {
    if (ref.startTimecode) {
      return cmxTimecodeToFrames(ref.startTimecode, fps);
    }
    const own = resolvedEvents.filter((e) => e.ref?.index === ref.index).map((e) => e.event);
    const sourceEvents = own.length > 0 ? own : events;
    const maxOut = Math.max(...sourceEvents.map((e) => e.sourceOut));
    if (ref.frameCount > 0 && maxOut > ref.frameCount) {
      return Math.min(...sourceEvents.map((e) => e.sourceIn));
    }
    return 0;
  }

  /** Validate and apply imported transitions (gap index = outgoing clip index). */
  private applyImportedTransitions(transitions: { gapIndex: number; config: TransitionConfig }[]): void {
    if (!this.transitionManager) return;
    for (const { gapIndex, config } of transitions) {
      if (config.durationFrames <= 0) continue;
      const validated = this.transitionManager.validateTransition(gapIndex, config, this.clips);
      if (validated) {
        this.transitionManager.setTransition(gapIndex, validated);
      }
    }
  }

  /**
   * Import an OpenRV RVEDL file (`path inFrame outFrame` per line).
   *
   * Frame numbers are the media's own frame numbers: for image sequences
   * starting at e.g. 1001 they are converted to 1-based local frames. Clips
   * are appended sequentially (RVEDL carries no record timing).
   *
   * @returns Number of clips imported
   */
  fromRVEDL(text: string, sourceResolver: PlaylistSourceResolver): number {
    const entries = parseRVEDL(text);
    this._unresolvedClips = [];
    let importedCount = 0;
    let timelineIn = this.getTotalDuration();

    for (const entry of entries) {
      const name = fileNameOf(entry.sourcePath) || entry.sourcePath;
      const ref = sourceResolver(name, entry.sourcePath);
      const lo = Math.min(entry.inFrame, entry.outFrame);
      const hi = Math.max(entry.inFrame, entry.outFrame);

      if (!ref) {
        this._unresolvedClips.push({
          id: `unresolved-${this.nextUnresolvedId++}`,
          name,
          sourceUrl: entry.sourcePath,
          inFrame: lo,
          outFrame: hi,
          timelineIn,
        });
        timelineIn += hi - lo + 1;
        continue;
      }

      const startFrame = ref.startFrame ?? 1;
      const base = startFrame > 1 && lo >= startFrame ? startFrame : 1;
      const range = clampLocalRange(lo - base + 1, hi - base + 1, ref.frameCount);
      this.addClip(ref.index, name, range.inPoint, range.outPoint);
      timelineIn += range.outPoint - range.inPoint + 1;
      importedCount++;
    }

    return importedCount;
  }

  /**
   * Import from OTIO (OpenTimelineIO) format.
   *
   * Uses the multi-track parser to preserve full editorial structure:
   * - Transitions between clips
   * - Gap timing
   * - Markers from the timeline and clips
   * - Clip metadata
   *
   * The first video track is used for the playlist. If the multi-track
   * parser fails, falls back to the single-track parser for backward
   * compatibility.
   *
   * OTIO source ranges are in media time; they are converted to the matched
   * source's 1-based local frames relative to the media reference's
   * `available_range` start (or, without one, relative to media time 0 /
   * the image sequence's start frame).
   *
   * @param otioJson - Raw OTIO JSON string
   * @param sourceResolver - Resolves clip name/url to a source index and frame count
   * @returns Number of clips successfully imported
   */
  fromOTIO(
    otioJson: string,
    sourceResolver: PlaylistSourceResolver,
    options?: {
      /** Optional callback invoked with parsed markers after import */
      markerImporter?: (markers: ParsedOTIOMarker[]) => void;
    },
  ): number {
    // Try multi-track parser first for full editorial structure
    const multiResult = parseOTIOMultiTrack(otioJson);

    const primaryTrack = multiResult?.tracks[0];
    if (multiResult && primaryTrack) {
      return this.importOTIOTrack(
        primaryTrack,
        multiResult.markers,
        multiResult.timeline.metadata,
        sourceResolver,
        options?.markerImporter,
      );
    }

    // Fall back to single-track parser for backward compatibility
    const singleResult = parseOTIO(otioJson);
    if (!singleResult) return 0;

    return this.importOTIOTrack(
      {
        name: '',
        clips: singleResult.clips,
        transitions: singleResult.transitions,
        gaps: singleResult.gaps,
        markers: [],
        totalFrames: singleResult.totalFrames,
      },
      singleResult.markers,
      singleResult.timeline.metadata,
      sourceResolver,
      options?.markerImporter,
    );
  }

  /**
   * Import one parsed OTIO track.
   * Gap spacing from the OTIO timeline is preserved: each clip's
   * `globalStartFrame` is derived from its `timelineInFrame` (+1, since
   * playlist frames are 1-based) so that gaps produce empty regions.
   */
  private importOTIOTrack(
    track: ParsedOTIOTrack,
    markers: ParsedOTIOMarker[],
    metadata: Record<string, unknown> | undefined,
    sourceResolver: PlaylistSourceResolver,
    markerImporter?: (markers: ParsedOTIOMarker[]) => void,
  ): number {
    this._unresolvedClips = [];
    let importedCount = 0;
    const playlistIndexOf = new Map<number, number>();
    const frameCounts = new Map<number, number>();

    track.clips.forEach((clip, parsedIndex) => {
      const resolved = sourceResolver(clip.name, clip.sourceUrl);
      const local = otioClipToLocalRange(clip, resolved);
      if (resolved) {
        const entry: PlaylistClip = {
          id: `clip-${this.nextClipId++}`,
          sourceIndex: resolved.index,
          sourceName: clip.name,
          inPoint: local.inPoint,
          outPoint: local.outPoint,
          globalStartFrame: clip.timelineInFrame + 1,
          duration: local.outPoint - local.inPoint + 1,
        };

        if (clip.metadata) {
          entry.metadata = clip.metadata;
        }

        this.clips.push(entry);
        playlistIndexOf.set(parsedIndex, this.clips.length - 1);
        frameCounts.set(this.clips.length - 1, resolved.frameCount);
        importedCount++;
      } else {
        this._unresolvedClips.push({
          id: `unresolved-${this.nextUnresolvedId++}`,
          name: clip.name,
          sourceUrl: clip.sourceUrl ?? '',
          inFrame: local.inPoint,
          outFrame: local.outPoint,
          timelineIn: clip.timelineInFrame,
        });
      }
    });

    this.transitionManager?.resizeToClips(this.clips.length);

    // Map OTIO transitions onto the playlist's overlap model: OTIO clips do not
    // overlap (the transition borrows `inOffset` frames of handle before the
    // incoming clip and `outOffset` frames after the outgoing clip), whereas a
    // playlist transition overlaps the tail of clip[i] with the head of clip[i+1].
    const pendingTransitions: { gapIndex: number; config: TransitionConfig }[] = [];
    for (const trans of track.transitions) {
      const outIdx = playlistIndexOf.get(trans.outgoingClipIndex);
      const inIdx = playlistIndexOf.get(trans.incomingClipIndex);
      if (outIdx === undefined || inIdx === undefined || inIdx !== outIdx + 1) continue;
      const outgoing = this.clips[outIdx];
      const incoming = this.clips[inIdx];
      if (!outgoing || !incoming) continue;

      const outFrameCount = frameCounts.get(outIdx) ?? 0;
      const maxOut = outFrameCount > 0 ? outFrameCount : Infinity;
      const tail = Math.max(0, Math.min(trans.outOffset, maxOut - outgoing.outPoint));
      const head = Math.max(0, Math.min(trans.inOffset, incoming.inPoint - 1));
      outgoing.outPoint += tail;
      outgoing.duration += tail;
      incoming.inPoint -= head;
      incoming.duration += head;
      incoming.globalStartFrame -= head;

      // OpenRV exports record the original transition type in metadata.
      const openrvMeta = trans.metadata?.openrv;
      const metaType =
        openrvMeta && typeof openrvMeta === 'object' ? (openrvMeta as { type?: unknown }).type : undefined;
      const transType: TransitionConfig['type'] =
        typeof metaType === 'string' && isTransitionType(metaType) && metaType !== 'cut'
          ? metaType
          : trans.transitionType === 'SMPTE_Dissolve'
            ? 'dissolve'
            : 'crossfade';
      // When the media lacks handles the transition still keeps its full
      // duration and overlaps visible frames of the neighbouring clips.
      pendingTransitions.push({ gapIndex: outIdx, config: { type: transType, durationFrames: trans.duration } });
    }
    this.applyImportedTransitions(pendingTransitions);

    this.emit('clipsChanged', { clips: [...this.clips] });

    // Store the full import result for consumers that need editorial structure
    this._lastOTIOImportResult = {
      importedCount,
      transitions: track.transitions,
      gaps: track.gaps,
      markers,
      metadata,
    };

    // Invoke the marker importer callback if provided
    if (markerImporter && markers.length > 0) {
      markerImporter(markers);
    }

    return importedCount;
  }

  /**
   * Get the result of the last OTIO import, including editorial structure.
   * Returns null if no OTIO import has been performed.
   */
  get lastOTIOImportResult(): OTIOImportResult | null {
    return this._lastOTIOImportResult;
  }

  /**
   * Get clips that could not be resolved during the last OTIO import.
   */
  get unresolvedClips(): readonly UnresolvedOTIOClip[] {
    return this._unresolvedClips;
  }

  /**
   * Re-link an unresolved clip to a source.
   * Returns true if the clip was found and re-linked successfully.
   */
  relinkUnresolvedClip(clipId: string, sourceIndex: number, sourceName: string, frameCount: number): boolean {
    const idx = this._unresolvedClips.findIndex((c) => c.id === clipId);
    if (idx === -1) return false;

    const clip = this._unresolvedClips[idx];
    if (!clip) return false;
    const outFrame = Math.min(clip.outFrame, frameCount);
    this.addClip(sourceIndex, sourceName, clip.inFrame, outFrame);
    this._unresolvedClips.splice(idx, 1);
    return true;
  }

  /**
   * Clear the list of unresolved clips.
   */
  clearUnresolvedClips(): void {
    this._unresolvedClips = [];
  }

  dispose(): void {
    this.clips = [];
  }
}
