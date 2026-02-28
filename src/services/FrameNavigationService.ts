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
}

/** Subset of Session that navigation actually touches. */
export interface NavSession {
  readonly currentFrame: number;
  readonly currentSourceIndex: number;
  goToFrame(frame: number): void;
  setCurrentSource(index: number): void;
  setInPoint(frame: number): void;
  setOutPoint(frame: number): void;
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
    const targetIndex = globalFrame > currentClipStart
      ? mapping.clipIndex
      : mapping.clipIndex - 1;
    if (targetIndex < 0) return;

    const clip = this.playlistManager.getClipByIndex(targetIndex);
    if (!clip) return;
    this.jumpToPlaylistGlobalFrame(clip.globalStartFrame);
  }

  /** Navigate to the start of the next shot (clip) in the playlist. */
  goToNextShot(): void {
    if (!this.playlistManager.isEnabled()) return;

    const result = this.playlistManager.goToNextClip(
      this.playlistManager.getCurrentFrame()
    );
    if (result) this.jumpToPlaylistGlobalFrame(result.frame);
  }

  /** Navigate to the start of the previous shot (clip) in the playlist. */
  goToPreviousShot(): void {
    if (!this.playlistManager.isEnabled()) return;

    const result = this.playlistManager.goToPreviousClip(
      this.playlistManager.getCurrentFrame()
    );
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

  /** Release references. */
  dispose(): void {
    // Currently no subscriptions to clean up.
    // Exists for lifecycle consistency with other services.
  }
}
