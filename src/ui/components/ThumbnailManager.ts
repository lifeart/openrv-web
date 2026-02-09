/**
 * ThumbnailManager - Generates and caches frame preview thumbnails for the timeline.
 *
 * Features:
 * - LRU cache for thumbnails (max 150 entries)
 * - Slot-based layout calculation preserving aspect ratio
 * - Async generation with concurrent limit (2 simultaneous)
 * - AbortController support for cancellation on source change
 */

import { Session } from '../../core/session/Session';
import { LRUCache } from '../../utils/LRUCache';

export interface ThumbnailSlot {
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Frames that need to be retried later */
interface PendingFrame {
  frame: number;
  retryCount: number;
}

/** Maximum retry attempts for a frame */
const MAX_RETRY_ATTEMPTS = 3;
/** Delay between retry attempts in ms */
const RETRY_DELAY_MS = 500;

export class ThumbnailManager {
  private session: Session;
  private cache = new LRUCache<string, HTMLCanvasElement | OffscreenCanvas>(150);
  private pendingLoads: Map<number, Promise<void>> = new Map();
  private maxConcurrent = 2;
  private abortController: AbortController | null = null;
  private slots: ThumbnailSlot[] = [];
  private onThumbnailReady: (() => void) | null = null;
  private pendingRetries: PendingFrame[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _loadingPaused = false;

  // Thumbnail sizing
  private slotHeight = 20;
  private sourceId: string = '';

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Set callback for when a thumbnail becomes ready
   */
  setOnThumbnailReady(callback: () => void): void {
    this.onThumbnailReady = callback;
  }

  /**
   * Whether thumbnail loading is currently paused (e.g. during playback)
   */
  get isLoadingPaused(): boolean {
    return this._loadingPaused;
  }

  /**
   * Pause all thumbnail loading. Aborts pending loads and stops the retry timer.
   * Called during playback to prevent frame extraction contention.
   */
  pauseLoading(): void {
    this._loadingPaused = true;
    this.abortPending();
    this.clearRetryTimer();
    this.pendingRetries = [];
  }

  /**
   * Resume thumbnail loading after playback stops.
   * Restarts loading for all visible slots that are not yet cached.
   */
  resumeLoading(): void {
    this._loadingPaused = false;
    // Restart loading for visible range
    if (this.slots.length > 0 && this.sourceId) {
      this.loadThumbnails().catch((err) => {
        console.warn('Failed to resume thumbnail loading:', err);
      });
    }
  }

  /**
   * Clear all cached thumbnails and cancel pending operations
   */
  clear(): void {
    this.abortPending();
    this.cache.clear();
    this.slots = [];
    this.sourceId = '';
  }

  /**
   * Abort any pending thumbnail generation
   */
  abortPending(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.pendingLoads.clear();
  }

  /**
   * Calculate thumbnail slots for the current source and track dimensions
   */
  calculateSlots(
    trackX: number,
    trackY: number,
    trackWidth: number,
    trackHeight: number,
    duration: number,
    sourceWidth: number,
    sourceHeight: number
  ): ThumbnailSlot[] {
    if (duration <= 1 || sourceWidth <= 0 || sourceHeight <= 0 || trackWidth <= 0) {
      this.slots = [];
      return this.slots;
    }

    // Calculate thumbnail dimensions preserving aspect ratio
    const aspectRatio = sourceWidth / sourceHeight;
    const thumbHeight = Math.min(this.slotHeight, trackHeight - 4);
    const thumbWidth = Math.round(thumbHeight * aspectRatio);

    // How many thumbnails can fit
    const maxThumbnails = Math.floor(trackWidth / (thumbWidth + 2));
    const numThumbnails = Math.min(maxThumbnails, Math.max(5, Math.min(duration, 30)));

    if (numThumbnails <= 0) {
      this.slots = [];
      return this.slots;
    }

    // Distribute thumbnails evenly across duration
    const frameStep = (duration - 1) / Math.max(1, numThumbnails - 1);
    const slotSpacing = trackWidth / numThumbnails;

    const slots: ThumbnailSlot[] = [];
    for (let i = 0; i < numThumbnails; i++) {
      const frame = Math.round(1 + i * frameStep);
      const x = trackX + i * slotSpacing + (slotSpacing - thumbWidth) / 2;
      const y = trackY + (trackHeight - thumbHeight) / 2;

      slots.push({
        frame,
        x,
        y,
        width: thumbWidth,
        height: thumbHeight,
      });
    }

    this.slots = slots;
    return slots;
  }

  /**
   * Get the current thumbnail slots
   */
  getSlots(): ThumbnailSlot[] {
    return this.slots;
  }

  /**
   * Load thumbnails for all calculated slots
   */
  async loadThumbnails(): Promise<void> {
    if (this._loadingPaused) return;

    const source = this.session.currentSource;
    if (!source) return;

    // Create new source ID to track cache validity
    const newSourceId = `${source.name}-${source.width}x${source.height}`;
    if (newSourceId !== this.sourceId) {
      this.clear();
      this.sourceId = newSourceId;
    }

    // Abort any existing operations
    this.abortPending();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Load thumbnails with concurrency limit
    const loadPromises: Promise<void>[] = [];

    for (const slot of this.slots) {
      if (signal.aborted) break;

      const cacheKey = this.getCacheKey(slot.frame);
      if (this.cache.has(cacheKey)) {
        // Already cached; get() refreshes LRU access order
        this.cache.get(cacheKey);
        continue;
      }

      // Wait if too many concurrent loads
      while (this.pendingLoads.size >= this.maxConcurrent) {
        if (signal.aborted) break;
        await Promise.race(this.pendingLoads.values());
      }

      if (signal.aborted) break;

      // Start loading this thumbnail
      const loadPromise = this.loadThumbnail(slot.frame, signal);
      this.pendingLoads.set(slot.frame, loadPromise);
      loadPromises.push(loadPromise);

      loadPromise.finally(() => {
        this.pendingLoads.delete(slot.frame);
      });
    }

    await Promise.allSettled(loadPromises);
  }

  /**
   * Load a single thumbnail for a frame
   */
  private async loadThumbnail(frame: number, signal: AbortSignal): Promise<void> {
    if (this._loadingPaused) return;
    if (signal.aborted) return;

    try {
      const source = this.session.currentSource;
      if (!source) return;

      // Find the slot for this frame to get correct dimensions
      const slot = this.slots.find(s => s.frame === frame);
      const thumbWidth = slot?.width ?? 48;
      const thumbHeight = slot?.height ?? 27;

      const canvas = document.createElement('canvas');
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Get frame image based on source type
      let sourceElement: CanvasImageSource | null = null;

      if (source.type === 'sequence') {
        // For sequences, get the specific frame image
        const frameImage = await this.session.getSequenceFrameImage(frame);
        if (signal.aborted) return;
        sourceElement = frameImage;
      } else if (source.type === 'video') {
        // For video, only use cached mediabunny frames.
        // Never use the HTMLVideoElement directly — it causes contention with
        // audio sync and the mediabunny extraction queue during playback.
        const frameCanvas = this.session.getVideoFrameCanvas(frame);
        if (frameCanvas) {
          sourceElement = frameCanvas;
        } else {
          // No cached frame available — queue for retry (retries are paused during playback)
          this.queueRetry(frame);
          return;
        }
      } else if (source.type === 'image') {
        sourceElement = source.element ?? null;
      }

      if (!sourceElement || signal.aborted) return;

      // Use OffscreenCanvas if available for better performance
      let targetCanvas: HTMLCanvasElement | OffscreenCanvas;
      let targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

      if (typeof OffscreenCanvas !== 'undefined') {
        targetCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
        targetCtx = targetCanvas.getContext('2d');
      } else {
        targetCanvas = canvas;
        targetCtx = ctx;
      }

      if (!targetCtx) return;

      // Draw scaled thumbnail
      targetCtx.drawImage(sourceElement, 0, 0, thumbWidth, thumbHeight);

      // Add to cache with LRU eviction
      // For OffscreenCanvas, we need to convert to regular canvas for storage
      if (typeof OffscreenCanvas !== 'undefined' && targetCanvas instanceof OffscreenCanvas) {
        const regularCanvas = document.createElement('canvas');
        regularCanvas.width = thumbWidth;
        regularCanvas.height = thumbHeight;
        const regularCtx = regularCanvas.getContext('2d');
        if (regularCtx) {
          regularCtx.drawImage(targetCanvas, 0, 0);
          this.addToCache(frame, regularCanvas);
        }
      } else {
        this.addToCache(frame, targetCanvas as HTMLCanvasElement);
      }

      // Notify that a thumbnail is ready
      if (this.onThumbnailReady) {
        this.onThumbnailReady();
      }
    } catch (error) {
      if (!signal.aborted) {
        console.warn(`Failed to load thumbnail for frame ${frame}:`, error);
      }
    }
  }

  /**
   * Get cache key for a frame
   */
  private getCacheKey(frame: number): string {
    return `${this.sourceId}-${frame}`;
  }

  /**
   * Add thumbnail to cache with LRU eviction
   */
  private addToCache(frame: number, canvas: HTMLCanvasElement): void {
    const key = this.getCacheKey(frame);
    this.cache.set(key, canvas);
  }

  /**
   * Get cached thumbnail for a frame, if available
   */
  getThumbnail(frame: number): HTMLCanvasElement | OffscreenCanvas | null {
    const key = this.getCacheKey(frame);
    return this.cache.get(key) ?? null;
  }

  /**
   * Draw all available thumbnails to the context
   */
  drawThumbnails(ctx: CanvasRenderingContext2D): void {
    for (const slot of this.slots) {
      const thumbnail = this.getThumbnail(slot.frame);
      if (thumbnail) {
        // Draw thumbnail with slight border/shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;

        ctx.drawImage(
          thumbnail,
          slot.x,
          slot.y,
          slot.width,
          slot.height
        );

        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);

        ctx.restore();
      }
    }
  }

  /**
   * Check if all slots have loaded thumbnails
   */
  isFullyLoaded(): boolean {
    for (const slot of this.slots) {
      if (!this.getThumbnail(slot.frame)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Clear the retry timer if active
   */
  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Queue a frame for retry loading later
   */
  private queueRetry(frame: number): void {
    // Check if already queued
    const existing = this.pendingRetries.find(p => p.frame === frame);
    if (existing) {
      return;
    }

    this.pendingRetries.push({ frame, retryCount: 0 });
    this.scheduleRetry();
  }

  /**
   * Schedule retry processing
   */
  private scheduleRetry(): void {
    if (this._loadingPaused) return;
    if (this.retryTimer || this.pendingRetries.length === 0) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.processRetries();
    }, RETRY_DELAY_MS);
  }

  /**
   * Process pending retry queue
   */
  private async processRetries(): Promise<void> {
    if (this._loadingPaused) return;
    if (!this.abortController || this.pendingRetries.length === 0) return;

    const signal = this.abortController.signal;
    const toRetry = this.pendingRetries.splice(0, this.maxConcurrent);

    for (const pending of toRetry) {
      if (signal.aborted) break;

      // Skip if already cached
      const cacheKey = this.getCacheKey(pending.frame);
      if (this.cache.has(cacheKey)) continue;

      pending.retryCount++;

      if (pending.retryCount < MAX_RETRY_ATTEMPTS) {
        await this.loadThumbnail(pending.frame, signal);

        // If still not cached, re-queue
        if (!this.cache.has(cacheKey)) {
          this.pendingRetries.push(pending);
        }
      }
    }

    // Schedule next batch if more pending
    if (this.pendingRetries.length > 0) {
      this.scheduleRetry();
    }
  }

  dispose(): void {
    this.clear();
    this.clearRetryTimer();
    this.pendingRetries = [];
    this._loadingPaused = false;
  }
}
