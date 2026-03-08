/**
 * FrameNavigationService - Handles frame/playlist navigation.
 *
 * Extracted from App.ts to isolate playlist/annotation navigation
 * from the top-level orchestrator. Provides methods for navigating
 * to playlist boundaries, shot boundaries, markers, and annotations.
 */

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing — no need to import heavy classes)
// ---------------------------------------------------------------------------

/** A playlist clip with the fields used by navigation. */
export interface NavPlaylistClip {
  readonly id: string;
  readonly globalStartFrame: number;
  readonly inPoint: number;
  readonly outPoint: number;
  readonly duration: number;
}

/** Frame mapping result from the playlist manager. */
export interface NavFrameMapping {
  readonly clip: NavPlaylistClip;
  readonly clipIndex: number;
  readonly sourceIndex: number;
  readonly localFrame: number;
}

/** Subset of PlaylistManager that navigation actually touches. */
export interface NavPlaylistManager {
  isEnabled(): boolean;
  getClipByIndex(index: number): NavPlaylistClip | undefined;
  getClipCount(): number;
  getClipAtFrame(globalFrame: number): NavFrameMapping | null;
  getCurrentFrame(): number;
  setCurrentFrame(frame: number): void;
  goToNextClip(currentGlobalFrame: number): { frame: number; clip: NavPlaylistClip } | null;
  goToPreviousClip(currentGlobalFrame: number): { frame: number; clip: NavPlaylistClip } | null;
  /** Get all clips for range boundary collection. */
  getClips?(): NavPlaylistClip[];
}

/** Subset of Session that navigation actually touches. */
export interface NavSession {
  readonly currentFrame: number;
  readonly currentSourceIndex: number;
  readonly inPoint: number;
  readonly outPoint: number;
  readonly loopMode: 'once' | 'loop' | 'pingpong';
  readonly marks: ReadonlyMap<number, { frame: number; endFrame?: number }>;
  readonly currentSource: { duration: number } | null;
  goToFrame(frame: number): void;
  setCurrentSource(index: number): void;
  setInPoint(frame: number): void;
  setOutPoint(frame: number): void;
  setInOutRange(inPoint: number, outPoint: number): void;
  emitRangeShifted(inPoint: number, outPoint: number): void;
  goToNextMarker(): number | null;
  goToPreviousMarker(): number | null;
}

/** Subset of PlaylistPanel that navigation actually touches. */
export interface NavPlaylistPanel {
  setActiveClip(clipId: string | null): void;
}

/** Subset of PaintEngine that navigation actually touches. */
export interface NavPaintEngine {
  getAnnotatedFrames(): Set<number>;
}

/** Dependencies for FrameNavigationService. */
export interface FrameNavigationDeps {
  session: NavSession;
  playlistManager: NavPlaylistManager;
  playlistPanel: NavPlaylistPanel;
  paintEngine: NavPaintEngine;
}

// ---------------------------------------------------------------------------
// Range segment types (exported for testing)
// ---------------------------------------------------------------------------

export interface RangeSegment {
  inPoint: number;
  outPoint: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FrameNavigationService {
  private readonly session: NavSession;
  private readonly playlistManager: NavPlaylistManager;
  private readonly playlistPanel: NavPlaylistPanel;
  private readonly paintEngine: NavPaintEngine;

  constructor(deps: FrameNavigationDeps) {
    this.session = deps.session;
    this.playlistManager = deps.playlistManager;
    this.playlistPanel = deps.playlistPanel;
    this.paintEngine = deps.paintEngine;
  }

  /** Navigate to the first frame of the first playlist clip. */
  goToPlaylistStart(): void {
    const firstClip = this.playlistManager.getClipByIndex(0);
    if (!firstClip) return;
    this.jumpToPlaylistGlobalFrame(firstClip.globalStartFrame);
  }

  /** Navigate to the last frame of the last playlist clip. */
  goToPlaylistEnd(): void {
    const count = this.playlistManager.getClipCount();
    const lastClip = this.playlistManager.getClipByIndex(count - 1);
    if (!lastClip) return;
    this.jumpToPlaylistGlobalFrame(lastClip.globalStartFrame + lastClip.duration - 1);
  }

  /**
   * Navigate to the next marker. If no marker is found, navigate to the
   * start of the next clip boundary in the playlist.
   */
  goToNextMarkOrBoundary(): void {
    if (this.session.goToNextMarker() !== null) return;
    if (!this.playlistManager.isEnabled()) return;

    const mapping = this.playlistManager.getClipAtFrame(this.playlistManager.getCurrentFrame());
    if (!mapping) return;

    const nextClip = this.playlistManager.getClipByIndex(mapping.clipIndex + 1);
    if (!nextClip) return;
    this.jumpToPlaylistGlobalFrame(nextClip.globalStartFrame);
  }

  /**
   * Navigate to the previous marker. If no marker is found, navigate to
   * the start of the current clip (if mid-clip) or the previous clip boundary.
   */
  goToPreviousMarkOrBoundary(): void {
    if (this.session.goToPreviousMarker() !== null) return;
    if (!this.playlistManager.isEnabled()) return;

    const globalFrame = this.playlistManager.getCurrentFrame();
    const mapping = this.playlistManager.getClipAtFrame(globalFrame);
    if (!mapping) return;

    const currentClipStart = mapping.clip.globalStartFrame;
    const targetIndex = globalFrame > currentClipStart ? mapping.clipIndex : mapping.clipIndex - 1;
    if (targetIndex < 0) return;

    const clip = this.playlistManager.getClipByIndex(targetIndex);
    if (!clip) return;
    this.jumpToPlaylistGlobalFrame(clip.globalStartFrame);
  }

  /** Navigate to the start of the next shot (clip) in the playlist. */
  goToNextShot(): void {
    if (!this.playlistManager.isEnabled()) return;

    const result = this.playlistManager.goToNextClip(this.playlistManager.getCurrentFrame());
    if (result) this.jumpToPlaylistGlobalFrame(result.frame);
  }

  /** Navigate to the start of the previous shot (clip) in the playlist. */
  goToPreviousShot(): void {
    if (!this.playlistManager.isEnabled()) return;

    const result = this.playlistManager.goToPreviousClip(this.playlistManager.getCurrentFrame());
    if (result) this.jumpToPlaylistGlobalFrame(result.frame);
  }

  /** Navigate to the next frame that has an annotation, wrapping to start. */
  goToNextAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => a - b);

    // Find next frame after current
    for (const frame of sortedFrames) {
      if (frame > currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to first annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  /** Navigate to the previous frame that has an annotation, wrapping to end. */
  goToPreviousAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => b - a); // Descending

    // Find previous frame before current
    for (const frame of sortedFrames) {
      if (frame < currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to last annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  /**
   * Jump to a specific global frame in the playlist.
   * Maps the global frame to the correct source and local frame,
   * switches sources if necessary, and updates playlist state.
   */
  jumpToPlaylistGlobalFrame(globalFrame: number): void {
    const mapping = this.playlistManager.getClipAtFrame(globalFrame);
    if (!mapping) return;

    if (this.session.currentSourceIndex !== mapping.sourceIndex) {
      this.session.setCurrentSource(mapping.sourceIndex);
    }
    this.session.setInPoint(mapping.clip.inPoint);
    this.session.setOutPoint(mapping.clip.outPoint);
    this.playlistManager.setCurrentFrame(globalFrame);
    this.playlistPanel.setActiveClip(mapping.clip.id);
    this.session.goToFrame(mapping.localFrame);
  }

  // -----------------------------------------------------------------------
  // Mark-to-mark range shifting
  // -----------------------------------------------------------------------

  /**
   * Shift the in/out range to the next mark pair segment.
   * Returns the new range or null if no shift occurred.
   */
  shiftRangeToNext(): RangeSegment | null {
    const segments = this.buildCurrentSegments();
    if (segments.length <= 1) return null;

    const currentIndex = this.findCurrentSegmentIndex(segments);
    const nextIndex = currentIndex + 1;

    let target: RangeSegment | undefined;
    if (nextIndex < segments.length) {
      target = segments[nextIndex];
    } else if (this.session.loopMode === 'loop' || this.session.loopMode === 'pingpong') {
      target = segments[0];
    }

    if (!target) return null;
    return this.applyRangeShift(target);
  }

  /**
   * Shift the in/out range to the previous mark pair segment.
   * Returns the new range or null if no shift occurred.
   */
  shiftRangeToPrevious(): RangeSegment | null {
    const segments = this.buildCurrentSegments();
    if (segments.length <= 1) return null;

    const currentIndex = this.findCurrentSegmentIndex(segments);
    const prevIndex = currentIndex - 1;

    let target: RangeSegment | undefined;
    if (prevIndex >= 0) {
      target = segments[prevIndex];
    } else if (this.session.loopMode === 'loop' || this.session.loopMode === 'pingpong') {
      target = segments[segments.length - 1];
    }

    if (!target) return null;
    return this.applyRangeShift(target);
  }

  // -----------------------------------------------------------------------
  // Range shifting helpers (package-private for testing)
  // -----------------------------------------------------------------------

  /**
   * Collect all range boundary frames from marks and playlist clips.
   * User marks are in local frame space; they are converted to global
   * frame space when in playlist mode.
   */
  collectRangeBoundaries(): number[] {
    const boundaries = new Set<number>();
    const sourceDuration = this.session.currentSource?.duration ?? 1;

    // Always include start and end of the source
    boundaries.add(1);
    boundaries.add(sourceDuration);

    // Determine if we're in playlist mode
    const playlistEnabled = this.playlistManager.isEnabled();

    // Add all user marks, converting to global frame space if in playlist mode
    for (const marker of this.session.marks.values()) {
      let frame = marker.frame;
      let endFrame = marker.endFrame;

      // Clamp mark frames to valid range
      frame = Math.max(1, Math.min(frame, sourceDuration));

      boundaries.add(frame);

      // Duration markers: add end frame as a boundary too
      if (endFrame !== undefined) {
        endFrame = Math.max(1, Math.min(endFrame, sourceDuration));
        boundaries.add(endFrame);
      }
    }

    // Add playlist clip boundaries (already in global frame space)
    if (playlistEnabled && this.playlistManager.getClips) {
      const clips = this.playlistManager.getClips();
      for (const clip of clips) {
        boundaries.add(clip.globalStartFrame);
        boundaries.add(clip.globalStartFrame + clip.duration - 1);
      }
    }

    return Array.from(boundaries).sort((a, b) => a - b);
  }

  /**
   * Build range segments from sorted boundary frames.
   */
  buildSegments(boundaries: number[]): RangeSegment[] {
    if (boundaries.length < 2) return [];

    const segments: RangeSegment[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      segments.push({
        inPoint: boundaries[i]!,
        outPoint: boundaries[i + 1]!,
      });
    }
    return segments;
  }

  /**
   * Find which segment index the current in point or frame falls in.
   */
  findCurrentSegmentIndex(segments: RangeSegment[]): number {
    if (segments.length === 0) return 0;

    const currentInPoint = this.session.inPoint;
    const currentFrame = this.session.currentFrame;

    // First, try to find a segment matching the current in point exactly
    const exactMatch = segments.findIndex((s) => s.inPoint === currentInPoint);
    if (exactMatch !== -1) return exactMatch;

    // Fall back to finding which segment contains the current frame
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentFrame >= segments[i]!.inPoint && currentFrame <= segments[i]!.outPoint) {
        return i;
      }
    }

    // Default to first segment
    return 0;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildCurrentSegments(): RangeSegment[] {
    const boundaries = this.collectRangeBoundaries();
    return this.buildSegments(boundaries);
  }

  private applyRangeShift(target: RangeSegment): RangeSegment {
    this.session.setInOutRange(target.inPoint, target.outPoint);
    this.session.goToFrame(target.inPoint);
    this.session.emitRangeShifted(target.inPoint, target.outPoint);
    return target;
  }

  /** Release references. */
  dispose(): void {
    // Currently no subscriptions to clean up.
    // Exists for lifecycle consistency with other services.
  }
}
