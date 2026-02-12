/**
 * VideoFrameFetchTracker - Tracks pending video frame fetch state for the Viewer.
 *
 * Extracted from Viewer.ts to separate the video frame fetch tracking concern
 * (pending fetches, displayed frame tracking, source B caching) from the
 * monolithic Viewer class.
 *
 * This is a state container — the fetch logic itself remains in Viewer's
 * renderImage() method, which reads and writes these properties directly.
 */

export class VideoFrameFetchTracker {
  // Pending video frame fetch tracking (primary source)
  pendingVideoFrameFetch: Promise<void> | null = null;
  pendingVideoFrameNumber: number = 0;

  // Pending source B video frame fetch tracking (for split screen)
  pendingSourceBFrameFetch: Promise<void> | null = null;
  pendingSourceBFrameNumber: number = 0;
  hasDisplayedSourceBMediabunnyFrame = false;

  // Cache the last successfully rendered source B frame canvas to prevent flickering
  // when the next frame is being fetched asynchronously
  lastSourceBFrameCanvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null = null;

  // Track if we've ever displayed a mediabunny frame (for fallback logic)
  hasDisplayedMediabunnyFrame = false;

  /**
   * Reset all tracking state to defaults.
   * Called when a new source is loaded.
   */
  reset(): void {
    this.pendingVideoFrameFetch = null;
    this.pendingVideoFrameNumber = 0;
    this.pendingSourceBFrameFetch = null;
    this.pendingSourceBFrameNumber = 0;
    this.hasDisplayedSourceBMediabunnyFrame = false;
    this.lastSourceBFrameCanvas = null;
    this.hasDisplayedMediabunnyFrame = false;
  }

  /**
   * Cleanup resources held by the tracker.
   */
  dispose(): void {
    this.reset();
  }
}
