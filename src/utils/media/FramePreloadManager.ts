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
  preloadAhead: 30,
  preloadBehind: 5,
  scrubWindow: 10,
  maxConcurrent: 3,  // Kept low: MediabunnyFrameExtractor serializes decoding internally,
                     // so extra concurrency just queues up without throughput gain.
                     // 3 slots = 1 for current frame + 2 for sequential preloading ahead.
  priorityDecayRate: 1.0,
};

// Bounds for cache size to prevent memory exhaustion
const MIN_CACHE_SIZE = 5;
const MAX_CACHE_SIZE = 500;

type FrameLoader<T> = (frame: number, signal?: AbortSignal) => Promise<T | null>;
type FrameDisposer<T> = (frame: number, data: T) => void;

/** Resolution metadata stored alongside each cached frame */
interface CachedEntry<T> {
  data: T;
  resolution?: { w: number; h: number };
}

export class FramePreloadManager<T> {
  private config: PreloadConfig;
  private cache: Map<number, CachedEntry<T>> = new Map();
  // LRU tracking using Map which maintains insertion order (O(1) operations)
  private accessOrder: Map<number, true> = new Map();

  // Current target resolution for frame extraction (undefined = full resolution)
  private currentTargetSize?: { w: number; h: number };
  private pendingRequests: Map<number, PreloadRequest<T>> = new Map();
  // Sorted array of pending requests by priority (lower = higher priority).
  // Kept in sync with pendingRequests Map to avoid O(n log n) re-sorting in processQueue().
  // Insertions use binary search for O(log n) placement; processQueue() iterates O(k) for k slots.
  private sortedPending: PreloadRequest<T>[] = [];
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

    // Merge config with defaults and validate bounds
    const mergedConfig = { ...DEFAULT_PRELOAD_CONFIG, ...config };

    // Clamp maxCacheSize to valid bounds to prevent memory exhaustion
    mergedConfig.maxCacheSize = Math.max(
      MIN_CACHE_SIZE,
      Math.min(MAX_CACHE_SIZE, mergedConfig.maxCacheSize)
    );

    // Ensure maxConcurrent is reasonable
    mergedConfig.maxConcurrent = Math.max(1, Math.min(16, mergedConfig.maxConcurrent));

    this.config = mergedConfig;
  }

  /**
   * Set the target resolution for future frame extractions.
   * Cached frames at a different resolution are still returned (stale-while-revalidate)
   * but new extractions will use the updated size.
   */
  setTargetSize(targetSize?: { w: number; h: number }): void {
    this.currentTargetSize = targetSize;
  }

  /**
   * Get the current target resolution.
   */
  getTargetSize(): { w: number; h: number } | undefined {
    return this.currentTargetSize;
  }

  /**
   * Check if a cached entry's resolution matches the current target size.
   * Returns true if the cached resolution is at least as large as the target.
   */
  private isResolutionSufficient(entry: CachedEntry<T>): boolean {
    // No target size means full resolution is desired
    if (!this.currentTargetSize) {
      // Entry without resolution was extracted at full res
      return !entry.resolution;
    }
    // Entry at full resolution is always sufficient
    if (!entry.resolution) {
      return true;
    }
    return entry.resolution.w >= this.currentTargetSize.w &&
           entry.resolution.h >= this.currentTargetSize.h;
  }

  /**
   * Get a frame from cache, triggering preload if needed.
   * @param frame - Frame number (1-based)
   * @param targetSize - Optional target resolution. If not provided, uses the
   *   current targetSize set via setTargetSize().
   */
  async getFrame(frame: number, targetSize?: { w: number; h: number }): Promise<T | null> {
    if (frame < 1 || frame > this.totalFrames) {
      return null;
    }

    // Update current target size if explicitly provided
    if (targetSize !== undefined) {
      this.currentTargetSize = targetSize;
    }

    // Check cache first
    if (this.cache.has(frame)) {
      const entry = this.cache.get(frame)!;
      this.cacheHits++;
      this.updateAccessOrder(frame);

      // If cached at sufficient resolution, return immediately
      if (this.isResolutionSufficient(entry)) {
        return entry.data;
      }

      // Stale entry: return it for immediate use but also trigger re-extraction below
      // (The caller gets the low-res frame now; next getFrame() call will get the upgraded one)
      const staleData = entry.data;

      // Fall through to trigger a new extraction at the desired resolution
      // but first check if one is already pending
      const pending = this.pendingRequests.get(frame);
      if (pending && pending.promise && !pending.cancelled) {
        return staleData;
      }

      // Trigger upgrade extraction (don't await, return stale data immediately)
      this.queueUpgradeExtraction(frame);
      return staleData;
    }

    this.cacheMisses++;

    // Check if already loading (reuse existing request)
    const pending = this.pendingRequests.get(frame);
    if (pending && pending.promise && !pending.cancelled) {
      return pending.promise;
    }

    // During playback, abort queued preload operations so this urgent frame
    // goes to the front of the serial extraction queue instead of waiting
    // behind lower-priority preload frames (fixes priority inversion).
    if (this.isPlaying && this.activeRequests.size > 0) {
      this.abortPendingOperations();
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
      return this.cache.get(frame)!.data;
    }
    return null;
  }

  /**
   * Update playback state for optimized preloading
   *
   * Aborts pending operations when:
   * - Stopping playback (prevents stale requests blocking new ones)
   * - Changing direction (old direction preloads are now useless)
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
    // Note: Starting playback does NOT abort — scrub-mode preloads near
    // the current frame are still useful and shouldn't be discarded
    const stoppedPlaying = wasPlaying && !isPlaying;
    const changedDirection = wasPlaying && isPlaying && oldDirection !== newDirection;

    if (stoppedPlaying || changedDirection) {
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
    this.sortedPending.length = 0;

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
   * Queue a preload request with priority.
   * Maintains sortedPending in sorted order via binary search insertion (O(log n)).
   */
  private queuePreload(frame: number, priority: number): void {
    if (this.cache.has(frame)) return;
    if (this.activeRequests.has(frame)) return;

    const existing = this.pendingRequests.get(frame);
    if (existing && !existing.cancelled) {
      // Update priority if better
      if (priority < existing.priority) {
        // Remove from sorted array at old position
        this.removeSortedPending(existing);
        existing.priority = priority;
        // Re-insert at new sorted position
        this.insertSortedPending(existing);
      }
      return;
    }

    const request: PreloadRequest<T> = {
      frame,
      priority,
      promise: null,
      cancelled: false,
    };
    this.pendingRequests.set(frame, request);
    this.insertSortedPending(request);
  }

  /**
   * Insert a request into sortedPending at the correct position using binary search.
   * O(log n) search + O(n) shift for the splice, but n is small (typically < 40).
   */
  private insertSortedPending(request: PreloadRequest<T>): void {
    const arr = this.sortedPending;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid]!.priority < request.priority) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    arr.splice(lo, 0, request);
  }

  /**
   * Remove a request from sortedPending by identity.
   * Scans linearly since n is small and this only happens on priority updates.
   */
  private removeSortedPending(request: PreloadRequest<T>): void {
    const idx = this.sortedPending.indexOf(request);
    if (idx !== -1) {
      this.sortedPending.splice(idx, 1);
    }
  }

  /**
   * Process pending requests respecting concurrency limit.
   * Iterates the pre-sorted sortedPending array, skipping cancelled/started entries.
   * O(k) where k is the number of slots to fill, plus skipped stale entries.
   */
  private processQueue(): void {
    if (this.activeRequests.size >= this.config.maxConcurrent) {
      return;
    }

    let slotsAvailable = this.config.maxConcurrent - this.activeRequests.size;

    // Iterate sorted array (lowest priority value = highest importance first).
    // We collect indices of stale entries to remove after iteration.
    const indicesToRemove: number[] = [];

    for (let i = 0; i < this.sortedPending.length && slotsAvailable > 0; i++) {
      const request = this.sortedPending[i]!;
      if (request.cancelled || request.promise) {
        // Stale entry: mark for removal
        indicesToRemove.push(i);
        continue;
      }
      this.startRequest(request);
      slotsAvailable--;
    }

    // Clean up stale entries from sorted array (iterate in reverse to preserve indices)
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      this.sortedPending.splice(indicesToRemove[i]!, 1);
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
   * Cancel preload requests for frames far from current position.
   * Also removes cancelled entries from sortedPending to keep it clean.
   */
  private cancelDistantRequests(centerFrame: number): void {
    const threshold = this.config.maxCacheSize;
    let hasCancelled = false;

    for (const [frame, request] of this.pendingRequests) {
      if (!request.promise) {
        const distance = Math.abs(frame - centerFrame);
        if (distance > threshold) {
          request.cancelled = true;
          this.pendingRequests.delete(frame);
          hasCancelled = true;
        }
      }
    }

    // Remove cancelled entries from sorted array
    if (hasCancelled) {
      this.sortedPending = this.sortedPending.filter(r => !r.cancelled);
    }
  }

  /**
   * Add frame to cache with LRU tracking
   */
  private addToCache(frame: number, data: T): void {
    this.cache.set(frame, { data, resolution: this.currentTargetSize ? { ...this.currentTargetSize } : undefined });
    this.updateAccessOrder(frame);
    this.enforceMaxCacheSize();
  }

  /**
   * Queue an upgrade extraction for a frame that is cached at insufficient resolution.
   * The extraction runs asynchronously; on success the cache entry is replaced.
   */
  private queueUpgradeExtraction(frame: number): void {
    const requestSignal = this.abortController.signal;

    const promise = this.loader(frame, requestSignal)
      .then(data => {
        if (data !== null && !requestSignal.aborted) {
          // Dispose old entry before replacing
          const oldEntry = this.cache.get(frame);
          if (oldEntry && this.disposer) {
            this.disposer(frame, oldEntry.data);
          }
          this.addToCache(frame, data);
        }
        return data;
      })
      .catch(e => {
        if (e?.name !== 'AbortError' && !requestSignal.aborted) {
          console.warn(`Upgrade extraction failed for frame ${frame}:`, e);
        }
        return null;
      })
      .finally(() => {
        this.pendingRequests.delete(frame);
      });

    const request: PreloadRequest<T> = {
      frame,
      priority: 0,
      promise: promise as Promise<T>,
      cancelled: false,
    };
    this.pendingRequests.set(frame, request);
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
    const entry = this.cache.get(frame);
    if (entry !== undefined) {
      if (this.disposer) {
        this.disposer(frame, entry.data);
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
   * Update total frames count (e.g., after building accurate frame index)
   * This corrects the initial estimate from Math.round(duration * fps)
   */
  setTotalFrames(count: number): void {
    this.totalFrames = count;
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
   * Update configuration with bounds validation
   */
  updateConfig(config: Partial<PreloadConfig>): void {
    const mergedConfig = { ...this.config, ...config };

    // Clamp maxCacheSize to valid bounds
    if (config.maxCacheSize !== undefined) {
      mergedConfig.maxCacheSize = Math.max(
        MIN_CACHE_SIZE,
        Math.min(MAX_CACHE_SIZE, mergedConfig.maxCacheSize)
      );
    }

    // Ensure maxConcurrent is reasonable
    if (config.maxConcurrent !== undefined) {
      mergedConfig.maxConcurrent = Math.max(1, Math.min(16, mergedConfig.maxConcurrent));
    }

    this.config = mergedConfig;
  }

  /**
   * Clear all cached frames and pending requests
   */
  clear(): void {
    // Abort all pending async operations
    this.abortPendingOperations();

    // Dispose all cached
    for (const [frame, entry] of this.cache) {
      if (this.disposer) {
        this.disposer(frame, entry.data);
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
