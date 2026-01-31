/**
 * Frame Preload Manager
 *
 * Intelligent preloading system with:
 * - Priority-based queue (closer frames load first)
 * - Direction-aware preloading (more frames ahead in playback direction)
 * - Adaptive buffer sizing based on playback state
 * - Request cancellation when navigating away
 * - Memory management with LRU eviction
 */

export interface PreloadRequest<T> {
  frame: number;
  priority: number; // Lower = higher priority
  promise: Promise<T | null> | null;
  cancelled: boolean;
}

export interface PreloadConfig {
  maxCacheSize: number;       // Max frames to keep in cache
  preloadAhead: number;       // Frames to preload ahead during playback
  preloadBehind: number;      // Frames to keep behind during playback
  scrubWindow: number;        // Frames to preload in each direction when scrubbing
  maxConcurrent: number;      // Max concurrent preload requests
  priorityDecayRate: number;  // How much priority degrades with distance
}

export const DEFAULT_PRELOAD_CONFIG: PreloadConfig = {
  maxCacheSize: 100,
  preloadAhead: 20,
  preloadBehind: 5,
  scrubWindow: 10,
  maxConcurrent: 4,
  priorityDecayRate: 1.0,
};

type FrameLoader<T> = (frame: number, signal?: AbortSignal) => Promise<T | null>;
type FrameDisposer<T> = (frame: number, data: T) => void;

export class FramePreloadManager<T> {
  private config: PreloadConfig;
  private cache: Map<number, T> = new Map();
  // LRU tracking using Map which maintains insertion order (O(1) operations)
  private accessOrder: Map<number, true> = new Map();
  private pendingRequests: Map<number, PreloadRequest<T>> = new Map();
  private activeRequests: Set<number> = new Set();

  private playbackDirection: number = 1; // 1 = forward, -1 = reverse
  private isPlaying: boolean = false;

  // Statistics for debugging and monitoring
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private evictionCount: number = 0;

  private loader: FrameLoader<T>;
  private disposer: FrameDisposer<T> | null;

  private totalFrames: number;

  // AbortController for cancelling pending async operations
  private abortController: AbortController = new AbortController();

  constructor(
    totalFrames: number,
    loader: FrameLoader<T>,
    disposer?: FrameDisposer<T>,
    config: Partial<PreloadConfig> = {}
  ) {
    this.totalFrames = totalFrames;
    this.loader = loader;
    this.disposer = disposer ?? null;
    this.config = { ...DEFAULT_PRELOAD_CONFIG, ...config };
  }

  /**
   * Get a frame from cache, triggering preload if needed
   */
  async getFrame(frame: number): Promise<T | null> {
    if (frame < 1 || frame > this.totalFrames) {
      return null;
    }

    // Check cache first
    if (this.cache.has(frame)) {
      this.cacheHits++;
      this.updateAccessOrder(frame);
      return this.cache.get(frame)!;
    }

    this.cacheMisses++;

    // Check if already loading (reuse existing request)
    const pending = this.pendingRequests.get(frame);
    if (pending && pending.promise && !pending.cancelled) {
      return pending.promise;
    }

    // Create a new request and track it
    const request: PreloadRequest<T> = {
      frame,
      priority: 0, // Highest priority for direct requests
      promise: null,
      cancelled: false,
    };

    // Capture abort signal at request time to detect abort even after controller is replaced
    const requestSignal = this.abortController.signal;

    // Pass abort signal to loader for cancellation support
    const loadPromise = this.loader(frame, requestSignal)
      .then(data => {
        if (data !== null && !request.cancelled && !requestSignal.aborted) {
          this.addToCache(frame, data);
        }
        return data;
      })
      .catch(e => {
        // Don't log abort errors as warnings
        if (e?.name !== 'AbortError' && !requestSignal.aborted) {
          console.warn(`Failed to load frame ${frame}:`, e);
        }
        return null;
      })
      .finally(() => {
        this.pendingRequests.delete(frame);
      });

    request.promise = loadPromise as Promise<T>;
    this.pendingRequests.set(frame, request);

    return loadPromise;
  }

  /**
   * Check if a frame is in the cache
   */
  hasFrame(frame: number): boolean {
    return this.cache.has(frame);
  }

  /**
   * Get frame from cache only (no loading)
   * Returns null if frame is not cached (does not trigger loading)
   */
  getCachedFrame(frame: number): T | null {
    if (this.cache.has(frame)) {
      this.cacheHits++;
      this.updateAccessOrder(frame);
      return this.cache.get(frame)!;
    }
    return null;
  }

  /**
   * Update playback state for optimized preloading
   *
   * Aborts pending operations when:
   * - Stopping playback (prevents stale requests blocking new ones)
   * - Changing direction (old direction preloads are now useless)
   * - Starting playback (clears any old scrub-mode requests)
   */
  setPlaybackState(isPlaying: boolean, direction: number = 1): void {
    const wasPlaying = this.isPlaying;
    const oldDirection = this.playbackDirection;
    const newDirection = direction >= 0 ? 1 : -1;

    this.isPlaying = isPlaying;
    this.playbackDirection = newDirection;

    // Abort pending operations on significant state changes:
    // 1. Stopping playback - stale requests shouldn't block future requests
    // 2. Changing direction - preloaded frames in old direction are useless
    // 3. Starting playback - clear old scrub-mode requests for fresh start
    const stoppedPlaying = wasPlaying && !isPlaying;
    const startedPlaying = !wasPlaying && isPlaying;
    const changedDirection = wasPlaying && isPlaying && oldDirection !== newDirection;

    if (stoppedPlaying || startedPlaying || changedDirection) {
      this.abortPendingOperations();
    }
  }

  /**
   * Abort all pending frame load operations
   * Creates a new AbortController for future operations
   *
   * Note: Active in-flight requests will complete but their results
   * will be discarded (not added to cache) due to the aborted signal.
   * The .finally() handlers in startRequest() will clean up activeRequests.
   */
  abortPendingOperations(): void {
    // Abort current operations - this signals all in-flight loaders to stop
    this.abortController.abort();
    // Create new controller for future operations
    this.abortController = new AbortController();

    // Mark all pending (not-yet-started) requests as cancelled
    for (const request of this.pendingRequests.values()) {
      request.cancelled = true;
    }
    this.pendingRequests.clear();

    // Note: We intentionally do NOT clear activeRequests here.
    // Active requests are in-flight promises that will complete and
    // clean themselves up via .finally() handlers. Clearing the set
    // would lose track of running operations and cause issues with
    // the concurrency limit in processQueue().
  }

  /**
   * Get the current abort signal for external use.
   *
   * Use this to pass to external async operations that should be cancelled
   * when playback state changes. The signal is replaced after each abort,
   * so always call this method to get the current signal rather than caching it.
   *
   * @returns The current AbortSignal that will be aborted on state changes
   */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Trigger preloading around a specific frame
   * Uses different strategies for playing vs scrubbing
   */
  preloadAround(centerFrame: number): void {
    // Cancel requests for frames far from current position
    this.cancelDistantRequests(centerFrame);

    // Calculate frames to preload based on playback state
    const framesToPreload = this.isPlaying
      ? this.calculatePlaybackPreloadList(centerFrame)
      : this.calculateScrubPreloadList(centerFrame);

    // Queue preload requests with priorities
    for (const { frame, priority } of framesToPreload) {
      this.queuePreload(frame, priority);
    }

    // Process queue
    this.processQueue();

    // Evict distant frames only when cache is near capacity (80% full)
    // Skip eviction entirely if entire video fits in cache
    if (this.totalFrames > this.config.maxCacheSize &&
        this.cache.size >= this.config.maxCacheSize * 0.8) {
      this.evictDistantFrames(centerFrame);
    }
  }

  /**
   * Calculate frames to preload during playback
   * More frames ahead in playback direction
   */
  private calculatePlaybackPreloadList(centerFrame: number): Array<{ frame: number; priority: number }> {
    const list: Array<{ frame: number; priority: number }> = [];
    const { preloadAhead, preloadBehind, priorityDecayRate } = this.config;
    const dir = this.playbackDirection;

    // Ahead frames (in playback direction) with higher priority
    for (let i = 1; i <= preloadAhead; i++) {
      const frame = centerFrame + (i * dir);
      if (frame >= 1 && frame <= this.totalFrames && !this.cache.has(frame)) {
        list.push({
          frame,
          priority: i * priorityDecayRate, // Closer frames have lower (better) priority
        });
      }
    }

    // Behind frames with lower priority
    for (let i = 1; i <= preloadBehind; i++) {
      const frame = centerFrame - (i * dir);
      if (frame >= 1 && frame <= this.totalFrames && !this.cache.has(frame)) {
        list.push({
          frame,
          priority: preloadAhead + i * priorityDecayRate,
        });
      }
    }

    return list;
  }

  /**
   * Calculate frames to preload during scrubbing
   * Symmetric window around current frame
   */
  private calculateScrubPreloadList(centerFrame: number): Array<{ frame: number; priority: number }> {
    const list: Array<{ frame: number; priority: number }> = [];
    const { scrubWindow, priorityDecayRate } = this.config;

    for (let i = 1; i <= scrubWindow; i++) {
      // Forward
      const forwardFrame = centerFrame + i;
      if (forwardFrame >= 1 && forwardFrame <= this.totalFrames && !this.cache.has(forwardFrame)) {
        list.push({ frame: forwardFrame, priority: i * priorityDecayRate });
      }

      // Backward
      const backwardFrame = centerFrame - i;
      if (backwardFrame >= 1 && backwardFrame <= this.totalFrames && !this.cache.has(backwardFrame)) {
        list.push({ frame: backwardFrame, priority: i * priorityDecayRate });
      }
    }

    return list;
  }

  /**
   * Queue a preload request with priority
   */
  private queuePreload(frame: number, priority: number): void {
    if (this.cache.has(frame)) return;
    if (this.activeRequests.has(frame)) return;

    const existing = this.pendingRequests.get(frame);
    if (existing && !existing.cancelled) {
      // Update priority if better
      if (priority < existing.priority) {
        existing.priority = priority;
      }
      return;
    }

    this.pendingRequests.set(frame, {
      frame,
      priority,
      promise: null,
      cancelled: false,
    });
  }

  /**
   * Process pending requests respecting concurrency limit
   */
  private processQueue(): void {
    if (this.activeRequests.size >= this.config.maxConcurrent) {
      return;
    }

    // Sort by priority and get next requests
    const pending = Array.from(this.pendingRequests.values())
      .filter(r => !r.cancelled && !r.promise)
      .sort((a, b) => a.priority - b.priority);

    const slotsAvailable = this.config.maxConcurrent - this.activeRequests.size;

    for (let i = 0; i < Math.min(slotsAvailable, pending.length); i++) {
      const request = pending[i]!;
      this.startRequest(request);
    }
  }

  /**
   * Start a preload request
   */
  private startRequest(request: PreloadRequest<T>): void {
    this.activeRequests.add(request.frame);

    // Capture abort signal at request time to detect abort even after controller is replaced
    const requestSignal = this.abortController.signal;

    // Pass abort signal to loader for cancellation support
    request.promise = this.loader(request.frame, requestSignal)
      .then(data => {
        if (data !== null && !request.cancelled && !requestSignal.aborted) {
          this.addToCache(request.frame, data);
        }
        return data;
      })
      .catch(e => {
        // Don't log abort errors as warnings
        if (e?.name !== 'AbortError' && !requestSignal.aborted) {
          console.warn(`Preload failed for frame ${request.frame}:`, e);
        }
        // Return null instead of re-throwing to avoid unhandled promise rejections
        return null;
      })
      .finally(() => {
        this.activeRequests.delete(request.frame);
        this.pendingRequests.delete(request.frame);
        // Process more from queue (only if not aborted)
        if (!requestSignal.aborted) {
          this.processQueue();
        }
      });
  }

  /**
   * Cancel preload requests for frames far from current position
   */
  private cancelDistantRequests(centerFrame: number): void {
    const threshold = this.config.maxCacheSize;

    for (const [frame, request] of this.pendingRequests) {
      if (!request.promise) {
        const distance = Math.abs(frame - centerFrame);
        if (distance > threshold) {
          request.cancelled = true;
          this.pendingRequests.delete(frame);
        }
      }
    }
  }

  /**
   * Add frame to cache with LRU tracking
   */
  private addToCache(frame: number, data: T): void {
    this.cache.set(frame, data);
    this.updateAccessOrder(frame);
    this.enforceMaxCacheSize();
  }

  /**
   * Update LRU access order (O(1) using Map's insertion order)
   */
  private updateAccessOrder(frame: number): void {
    // Delete and re-add to move to end (most recently used)
    this.accessOrder.delete(frame);
    this.accessOrder.set(frame, true);
  }

  /**
   * Enforce max cache size using LRU eviction
   * Uses single iterator pass to avoid repeated iterator creation
   */
  private enforceMaxCacheSize(): void {
    const evictionCount = this.cache.size - this.config.maxCacheSize;
    if (evictionCount <= 0) {
      return;
    }

    // Collect frames to evict in single iterator pass (oldest first from LRU order)
    // We collect first to avoid iterator invalidation during eviction
    const framesToEvict: number[] = [];
    for (const frame of this.accessOrder.keys()) {
      if (framesToEvict.length >= evictionCount) break;
      framesToEvict.push(frame);
    }

    // Evict collected frames
    for (const frame of framesToEvict) {
      this.evictFrame(frame);
    }
  }

  /**
   * Evict frames too far from current position
   */
  private evictDistantFrames(centerFrame: number): void {
    const { maxCacheSize, preloadAhead, preloadBehind } = this.config;
    // Keep frames within maxCacheSize distance, but at minimum the preload range + buffer
    const keepRange = Math.max(maxCacheSize, preloadAhead + preloadBehind + 20);

    const framesToEvict: number[] = [];

    for (const frame of this.cache.keys()) {
      const distance = Math.abs(frame - centerFrame);
      if (distance > keepRange) {
        framesToEvict.push(frame);
      }
    }

    for (const frame of framesToEvict) {
      this.evictFrame(frame);
    }
  }

  /**
   * Evict a single frame from cache
   */
  private evictFrame(frame: number): void {
    const data = this.cache.get(frame);
    if (data !== undefined) {
      if (this.disposer) {
        this.disposer(frame, data);
      }
      this.cache.delete(frame);
      this.accessOrder.delete(frame);
      this.evictionCount++;
    }
  }

  /**
   * Get current cache statistics for debugging and monitoring
   */
  getStats(): {
    cacheSize: number;
    pendingRequests: number;
    activeRequests: number;
    cacheHits: number;
    cacheMisses: number;
    evictionCount: number;
    hitRate: number;
  } {
    const totalRequests = this.cacheHits + this.cacheMisses;
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      activeRequests: this.activeRequests.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      evictionCount: this.evictionCount,
      hitRate: totalRequests > 0 ? this.cacheHits / totalRequests : 0,
    };
  }

  /**
   * Get the set of cached frame numbers
   */
  getCachedFrames(): Set<number> {
    return new Set(this.cache.keys());
  }

  /**
   * Get the set of pending (loading) frame numbers
   */
  getPendingFrames(): Set<number> {
    return new Set(this.pendingRequests.keys());
  }

  /**
   * Get total frames count
   */
  getTotalFrames(): number {
    return this.totalFrames;
  }

  /**
   * Get max cache size
   */
  getMaxCacheSize(): number {
    return this.config.maxCacheSize;
  }

  /**
   * Reset statistics counters (useful for benchmarking)
   */
  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.evictionCount = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PreloadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear all cached frames and pending requests
   */
  clear(): void {
    // Abort all pending async operations
    this.abortPendingOperations();

    // Dispose all cached
    for (const [frame, data] of this.cache) {
      if (this.disposer) {
        this.disposer(frame, data);
      }
    }
    this.cache.clear();
    this.accessOrder.clear();
  }

  /**
   * Dispose the manager and clean up resources
   */
  dispose(): void {
    this.clear();
  }
}
