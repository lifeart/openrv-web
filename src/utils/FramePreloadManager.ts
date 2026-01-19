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
  promise: Promise<T> | null;
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

type FrameLoader<T> = (frame: number) => Promise<T>;
type FrameDisposer<T> = (frame: number, data: T) => void;

export class FramePreloadManager<T> {
  private config: PreloadConfig;
  private cache: Map<number, T> = new Map();
  private accessOrder: number[] = []; // LRU tracking
  private pendingRequests: Map<number, PreloadRequest<T>> = new Map();
  private activeRequests: Set<number> = new Set();

  private currentFrame: number = 1;
  private playbackDirection: number = 1; // 1 = forward, -1 = reverse
  private isPlaying: boolean = false;

  private loader: FrameLoader<T>;
  private disposer: FrameDisposer<T> | null;

  private totalFrames: number;

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

    // Update current position
    this.currentFrame = frame;

    // Check cache first
    if (this.cache.has(frame)) {
      this.updateAccessOrder(frame);
      return this.cache.get(frame)!;
    }

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

    const loadPromise = this.loader(frame)
      .then(data => {
        if (!request.cancelled) {
          this.addToCache(frame, data);
        }
        return data;
      })
      .catch(e => {
        console.warn(`Failed to load frame ${frame}:`, e);
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
   */
  getCachedFrame(frame: number): T | null {
    if (this.cache.has(frame)) {
      this.updateAccessOrder(frame);
      return this.cache.get(frame)!;
    }
    return null;
  }

  /**
   * Update playback state for optimized preloading
   */
  setPlaybackState(isPlaying: boolean, direction: number = 1): void {
    this.isPlaying = isPlaying;
    this.playbackDirection = direction >= 0 ? 1 : -1;
  }

  /**
   * Trigger preloading around a specific frame
   * Uses different strategies for playing vs scrubbing
   */
  preloadAround(centerFrame: number): void {
    this.currentFrame = centerFrame;

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

    // Evict distant frames to manage memory
    this.evictDistantFrames(centerFrame);
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

    request.promise = this.loader(request.frame)
      .then(data => {
        if (!request.cancelled) {
          this.addToCache(request.frame, data);
        }
        return data;
      })
      .catch(e => {
        console.warn(`Preload failed for frame ${request.frame}:`, e);
        throw e;
      })
      .finally(() => {
        this.activeRequests.delete(request.frame);
        this.pendingRequests.delete(request.frame);
        // Process more from queue
        this.processQueue();
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
   * Update LRU access order
   */
  private updateAccessOrder(frame: number): void {
    const idx = this.accessOrder.indexOf(frame);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(frame);
  }

  /**
   * Enforce max cache size using LRU eviction
   */
  private enforceMaxCacheSize(): void {
    while (this.cache.size > this.config.maxCacheSize && this.accessOrder.length > 0) {
      const oldestFrame = this.accessOrder.shift()!;
      this.evictFrame(oldestFrame);
    }
  }

  /**
   * Evict frames too far from current position
   */
  private evictDistantFrames(centerFrame: number): void {
    const { maxCacheSize, preloadAhead, preloadBehind } = this.config;
    const keepRange = Math.max(maxCacheSize / 2, preloadAhead + preloadBehind + 10);

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
    if (data && this.disposer) {
      this.disposer(frame, data);
    }
    this.cache.delete(frame);

    const idx = this.accessOrder.indexOf(frame);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
  }

  /**
   * Get current cache statistics
   */
  getStats(): {
    cacheSize: number;
    pendingRequests: number;
    activeRequests: number;
  } {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      activeRequests: this.activeRequests.size,
    };
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
    // Cancel all pending
    for (const request of this.pendingRequests.values()) {
      request.cancelled = true;
    }
    this.pendingRequests.clear();

    // Dispose all cached
    for (const [frame, data] of this.cache) {
      if (this.disposer) {
        this.disposer(frame, data);
      }
    }
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Dispose the manager and clean up resources
   */
  dispose(): void {
    this.clear();
  }
}
