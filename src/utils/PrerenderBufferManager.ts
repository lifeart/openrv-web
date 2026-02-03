/**
 * PrerenderBufferManager - Pre-render frames with effects applied in the background
 *
 * This manager caches pre-rendered frames with effects applied, allowing for smooth
 * playback without the performance hit of applying CPU-intensive effects on every frame.
 *
 * Features:
 * - LRU cache of pre-rendered canvas frames
 * - Priority queue for background rendering
 * - Effects fingerprint to detect changes and invalidate cache
 * - Web Worker support for parallel processing (optional)
 * - Falls back to main thread if workers unavailable
 * - Direction-aware preloading (more frames in playback direction)
 */

import { EffectProcessor, AllEffectsState, computeEffectsHash, hasActiveEffects } from './EffectProcessor';
import { WorkerPool } from './WorkerPool';
import EffectWorker from '../workers/effectProcessor.worker?worker';

/**
 * Cached frame entry
 */
export interface CachedFrame {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  effectsHash: string;
  width: number;
  height: number;
}

/**
 * Configuration for the prerender buffer
 */
export interface PrerenderConfig {
  maxCacheSize: number;       // Max frames to keep in cache
  preloadAhead: number;       // Frames to preload ahead during playback
  preloadBehind: number;      // Frames to keep behind during playback
  maxConcurrent: number;      // Max concurrent prerender operations
  useWorkers: boolean;        // Enable Web Worker parallel processing
  numWorkers: number;         // Number of workers (default: navigator.hardwareConcurrency or 4)
}

// Calculate number of workers based on hardware concurrency
const DEFAULT_NUM_WORKERS = typeof navigator !== 'undefined' ? Math.min(navigator.hardwareConcurrency || 4, 8) : 4;

export const DEFAULT_PRERENDER_CONFIG: PrerenderConfig = {
  maxCacheSize: 100,
  preloadAhead: 30,
  preloadBehind: 10,
  // maxConcurrent should match numWorkers to fully utilize the worker pool
  maxConcurrent: DEFAULT_NUM_WORKERS,
  useWorkers: true,
  numWorkers: DEFAULT_NUM_WORKERS,
};

/**
 * Preload request entry
 */
interface PreloadRequest {
  frame: number;
  priority: number;
  inProgress: boolean;
  cancelled: boolean;
  promise?: Promise<void>;
}

/**
 * Frame loader function type - gets raw frame canvas/image from session
 */
type FrameLoader = (frame: number) => HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | null;

/**
 * Worker task message type (sent to worker)
 * Exported for type documentation; used internally by prerenderWithWorker
 */
export interface WorkerTaskMessage {
  type: 'process';
  id: number;
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  effectsState: AllEffectsState;
}

/**
 * Worker result message type (received from worker)
 */
interface WorkerResultMessage {
  type: 'result' | 'error' | 'ready';
  id: number;
  imageData?: Uint8ClampedArray;
  error?: string;
}

/**
 * PrerenderBufferManager class
 */
export class PrerenderBufferManager {
  private config: PrerenderConfig;
  private cache: Map<number, CachedFrame> = new Map();
  private accessOrder: Map<number, true> = new Map();
  private pendingRequests: Map<number, PreloadRequest> = new Map();
  private activeCount: number = 0;

  private effectProcessor: EffectProcessor = new EffectProcessor();
  private currentEffectsState: AllEffectsState | null = null;
  private currentEffectsHash: string = '';

  private playbackDirection: number = 1;
  private isPlaying: boolean = false;
  private totalFrames: number;
  private lastPreloadCenter: number = -1;
  private lastPreloadEffectsHash: string = '';

  private frameLoader: FrameLoader;
  private idleCallbackId: number | null = null;
  private usingIdleCallback: boolean = false;

  // Worker pool for parallel processing
  private workerPool: WorkerPool<WorkerResultMessage> | null = null;
  private workersInitialized: boolean = false;
  private workersAvailable: boolean = false;

  // Statistics
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private staleCacheHits: number = 0;

  // Callback for cache updates (for UI refresh)
  private onCacheUpdateCallback: (() => void) | null = null;

  constructor(
    totalFrames: number,
    frameLoader: FrameLoader,
    config: Partial<PrerenderConfig> = {}
  ) {
    this.totalFrames = totalFrames;
    this.frameLoader = frameLoader;
    this.config = { ...DEFAULT_PRERENDER_CONFIG, ...config };

    // Initialize workers if enabled
    if (this.config.useWorkers) {
      this.initWorkers();
    }
  }

  /**
   * Initialize Web Worker pool
   */
  private async initWorkers(): Promise<void> {
    if (this.workersInitialized) return;
    this.workersInitialized = true;

    try {
      // Check if Web Workers are available
      if (typeof Worker === 'undefined') {
        console.log('Web Workers not available, using main thread processing');
        return;
      }

      // Create worker pool using Vite's worker import
      this.workerPool = new WorkerPool<WorkerResultMessage>({
        maxWorkers: this.config.numWorkers,
        workerFactory: () => new EffectWorker(),
      });

      await this.workerPool.init();
      this.workersAvailable = true;
      console.log(`Prerender worker pool initialized with ${this.config.numWorkers} workers`);
    } catch (error) {
      console.warn('Failed to initialize worker pool, falling back to main thread:', error);
      this.workerPool = null;
      this.workersAvailable = false;
    }
  }

  /**
   * Get a pre-rendered frame from cache (synchronous)
   * Returns null if frame is not in cache.
   * During playback, returns stale cached frames as fallback to avoid
   * dropping to expensive live rendering while effects are being updated.
   */
  getFrame(frameNumber: number): CachedFrame | null {
    if (frameNumber < 1 || frameNumber > this.totalFrames) {
      return null;
    }

    const cached = this.cache.get(frameNumber);
    if (!cached) {
      this.cacheMisses++;
      return null;
    }

    if (cached.effectsHash === this.currentEffectsHash) {
      this.cacheHits++;
      this.updateAccessOrder(frameNumber);
      return cached;
    }

    // During playback, allow stale frames as fallback
    // (better than dropping to live render which causes stuttering)
    if (this.isPlaying) {
      this.staleCacheHits++;
      this.updateAccessOrder(frameNumber);
      return cached;
    }

    this.cacheMisses++;
    return null;
  }

  /**
   * Check if a frame is cached with current effects
   */
  hasFrame(frameNumber: number): boolean {
    const cached = this.cache.get(frameNumber);
    return cached !== null && cached !== undefined && cached.effectsHash === this.currentEffectsHash;
  }

  /**
   * Update the effects state and invalidate cache if changed.
   * During playback, performs a soft invalidation that keeps stale frames
   * as fallback while new frames are pre-rendered in the background.
   */
  updateEffects(state: AllEffectsState): void {
    const newHash = computeEffectsHash(state);

    if (newHash !== this.currentEffectsHash) {
      // Cancel pending prerender requests (they'd produce wrong results)
      for (const request of this.pendingRequests.values()) {
        request.cancelled = true;
      }
      this.pendingRequests.clear();
      this.activeCount = 0;

      if (this.idleCallbackId !== null) {
        if (this.usingIdleCallback && typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(this.idleCallbackId);
        } else {
          clearTimeout(this.idleCallbackId);
        }
        this.idleCallbackId = null;
      }

      if (!this.isPlaying) {
        // When paused, do a hard invalidation (accuracy matters more)
        this.cache.clear();
        this.accessOrder.clear();
      }
      // During playback, keep stale cached frames as fallback
      // (getFrame will return them with stale effectsHash)

      this.currentEffectsHash = newHash;
    }

    this.currentEffectsState = state;
  }

  /**
   * Invalidate all cached frames
   */
  invalidateAll(): void {
    for (const request of this.pendingRequests.values()) {
      request.cancelled = true;
    }
    this.pendingRequests.clear();
    this.activeCount = 0;

    this.cache.clear();
    this.accessOrder.clear();

    if (this.idleCallbackId !== null) {
      if (this.usingIdleCallback && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.idleCallbackId);
      } else {
        clearTimeout(this.idleCallbackId);
      }
      this.idleCallbackId = null;
    }
  }

  /**
   * Set playback state for direction-aware preloading
   */
  setPlaybackState(isPlaying: boolean, direction: number = 1): void {
    this.isPlaying = isPlaying;
    this.playbackDirection = direction >= 0 ? 1 : -1;
  }

  /**
   * Trigger preloading around a specific frame
   */
  preloadAround(centerFrame: number): void {
    if (!this.currentEffectsState || !hasActiveEffects(this.currentEffectsState)) {
      return;
    }

    // Skip if we already preloaded around this frame with the same effects
    if (centerFrame === this.lastPreloadCenter && this.currentEffectsHash === this.lastPreloadEffectsHash) {
      return;
    }
    this.lastPreloadCenter = centerFrame;
    this.lastPreloadEffectsHash = this.currentEffectsHash;

    this.cancelDistantRequests(centerFrame);

    const framesToPreload = this.isPlaying
      ? this.calculatePlaybackPreloadList(centerFrame)
      : this.calculateScrubPreloadList(centerFrame);

    for (const { frame, priority } of framesToPreload) {
      this.queuePreload(frame, priority);
    }

    this.scheduleBackgroundWork();

    // Only evict distant frames when cache is near capacity (80% full)
    // Skip eviction entirely if entire video fits in cache
    if (this.totalFrames > this.config.maxCacheSize &&
        this.cache.size >= this.config.maxCacheSize * 0.8) {
      this.evictDistantFrames(centerFrame);
    }
  }

  private calculatePlaybackPreloadList(centerFrame: number): Array<{ frame: number; priority: number }> {
    const list: Array<{ frame: number; priority: number }> = [];
    const { preloadAhead, preloadBehind } = this.config;
    const dir = this.playbackDirection;

    for (let i = 1; i <= preloadAhead; i++) {
      const frame = centerFrame + (i * dir);
      if (frame >= 1 && frame <= this.totalFrames && !this.hasFrame(frame)) {
        list.push({ frame, priority: i });
      }
    }

    for (let i = 1; i <= preloadBehind; i++) {
      const frame = centerFrame - (i * dir);
      if (frame >= 1 && frame <= this.totalFrames && !this.hasFrame(frame)) {
        list.push({ frame, priority: preloadAhead + i });
      }
    }

    return list;
  }

  private calculateScrubPreloadList(centerFrame: number): Array<{ frame: number; priority: number }> {
    const list: Array<{ frame: number; priority: number }> = [];
    const window = Math.floor((this.config.preloadAhead + this.config.preloadBehind) / 2);

    for (let i = 1; i <= window; i++) {
      const forwardFrame = centerFrame + i;
      if (forwardFrame >= 1 && forwardFrame <= this.totalFrames && !this.hasFrame(forwardFrame)) {
        list.push({ frame: forwardFrame, priority: i });
      }

      const backwardFrame = centerFrame - i;
      if (backwardFrame >= 1 && backwardFrame <= this.totalFrames && !this.hasFrame(backwardFrame)) {
        list.push({ frame: backwardFrame, priority: i });
      }
    }

    return list;
  }

  private queuePreload(frame: number, priority: number): void {
    // Check if frame is already cached with current effects (not stale)
    if (this.hasFrame(frame)) return;

    const existing = this.pendingRequests.get(frame);
    if (existing && !existing.cancelled) {
      if (priority < existing.priority) {
        existing.priority = priority;
      }
      return;
    }

    this.pendingRequests.set(frame, {
      frame,
      priority,
      inProgress: false,
      cancelled: false,
    });
  }

  private scheduleBackgroundWork(): void {
    if (this.idleCallbackId !== null) {
      return;
    }

    if (typeof requestIdleCallback !== 'undefined') {
      this.usingIdleCallback = true;
      this.idleCallbackId = requestIdleCallback(
        (deadline) => this.processQueue(deadline),
        { timeout: 100 }
      );
    } else {
      this.usingIdleCallback = false;
      this.idleCallbackId = window.setTimeout(() => {
        this.processQueue(null);
      }, 16);
    }
  }

  private processQueue(deadline: IdleDeadline | null): void {
    this.idleCallbackId = null;

    const slotsAvailable = this.config.maxConcurrent - this.activeCount;
    if (slotsAvailable <= 0) {
      return;
    }

    const pending = Array.from(this.pendingRequests.values())
      .filter(r => !r.cancelled && !r.inProgress)
      .sort((a, b) => a.priority - b.priority);

    let processed = 0;
    for (const request of pending) {
      if (deadline && deadline.timeRemaining() < 5) {
        break;
      }

      if (processed >= slotsAvailable) {
        break;
      }

      this.startPrerenderRequest(request);
      processed++;
    }

    if (this.pendingRequests.size > 0 && this.activeCount < this.config.maxConcurrent) {
      this.scheduleBackgroundWork();
    }
  }

  /**
   * Start a prerender request - uses worker if available, otherwise main thread
   */
  private startPrerenderRequest(request: PreloadRequest): void {
    request.inProgress = true;
    this.activeCount++;

    if (this.workersAvailable && this.workerPool) {
      this.prerenderWithWorker(request);
    } else {
      this.prerenderOnMainThread(request);
    }
  }

  /**
   * Prerender using Web Worker
   */
  private async prerenderWithWorker(request: PreloadRequest): Promise<void> {
    try {
      if (!this.currentEffectsState || !this.workerPool) {
        return; // completeRequest called in finally
      }

      const rawFrame = this.frameLoader(request.frame);
      if (!rawFrame || request.cancelled) {
        return; // completeRequest called in finally
      }

      let width: number, height: number;
      if (rawFrame instanceof HTMLImageElement) {
        width = rawFrame.naturalWidth || rawFrame.width;
        height = rawFrame.naturalHeight || rawFrame.height;
      } else {
        width = rawFrame.width;
        height = rawFrame.height;
      }

      if (width === 0 || height === 0) {
        return;
      }

      // Create temporary canvas to get image data
      // Use willReadFrequently for better getImageData performance
      let tempCanvas: HTMLCanvasElement | OffscreenCanvas;
      let tempCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

      if (typeof OffscreenCanvas !== 'undefined') {
        tempCanvas = new OffscreenCanvas(width, height);
        tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      } else {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      }

      if (!tempCtx) {
        return;
      }

      tempCtx.drawImage(rawFrame, 0, 0, width, height);
      const imageData = tempCtx.getImageData(0, 0, width, height);

      try {
        // Send to worker for processing
        const result = await this.workerPool.submit(
          {
            type: 'process',
            imageData: imageData.data,
            width,
            height,
            effectsState: this.currentEffectsState,
          },
          [imageData.data.buffer],
          request.priority
        );

        if (request.cancelled) {
          return;
        }

        if (result.type === 'result' && result.imageData) {
          // Validate worker result
          const expectedLength = width * height * 4;
          if (result.imageData.length !== expectedLength) {
            console.warn(
              `Worker returned invalid imageData: expected ${expectedLength} bytes, got ${result.imageData.length}`
            );
            return;
          }

          // Create final canvas with processed data
          let canvas: HTMLCanvasElement | OffscreenCanvas;
          let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

          if (typeof OffscreenCanvas !== 'undefined') {
            canvas = new OffscreenCanvas(width, height);
            ctx = canvas.getContext('2d');
          } else {
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            ctx = canvas.getContext('2d');
          }

          if (ctx) {
            const processedImageData = new ImageData(
              new Uint8ClampedArray(result.imageData),
              width,
              height
            );
            ctx.putImageData(processedImageData, 0, 0);

            this.addToCache(request.frame, {
              canvas,
              effectsHash: this.currentEffectsHash,
              width,
              height,
            });
          }
        }
      } catch (error) {
        console.warn(`Worker prerender failed for frame ${request.frame}:`, error);
        // Fall back to main thread
        this.prerenderOnMainThreadSync(request);
      }
    } finally {
      this.completeRequest(request);
    }
  }

  /**
   * Prerender on main thread (async with setTimeout)
   */
  private prerenderOnMainThread(request: PreloadRequest): void {
    setTimeout(() => {
      try {
        if (request.cancelled) {
          return;
        }
        this.prerenderOnMainThreadSync(request);
      } finally {
        this.completeRequest(request);
      }
    }, 0);
  }

  /**
   * Prerender on main thread (synchronous)
   */
  private prerenderOnMainThreadSync(request: PreloadRequest): void {
    try {
      const result = this.prerenderFrame(request.frame);
      if (result && !request.cancelled) {
        this.addToCache(request.frame, result);
      }
    } catch (e) {
      console.warn(`Failed to prerender frame ${request.frame}:`, e);
    }
  }

  private completeRequest(request: PreloadRequest): void {
    this.pendingRequests.delete(request.frame);
    // Guard against going negative (can happen if updateEffects/invalidateAll
    // resets activeCount while in-flight workers are still completing)
    if (this.activeCount > 0) {
      this.activeCount--;
    }

    if (this.pendingRequests.size > 0 && this.activeCount < this.config.maxConcurrent) {
      this.scheduleBackgroundWork();
    }
  }

  private prerenderFrame(frameNumber: number): CachedFrame | null {
    if (!this.currentEffectsState) {
      return null;
    }

    const rawFrame = this.frameLoader(frameNumber);
    if (!rawFrame) {
      return null;
    }

    let width: number, height: number;
    if (rawFrame instanceof HTMLImageElement) {
      width = rawFrame.naturalWidth || rawFrame.width;
      height = rawFrame.naturalHeight || rawFrame.height;
    } else {
      width = rawFrame.width;
      height = rawFrame.height;
    }

    if (width === 0 || height === 0) {
      return null;
    }

    // Use willReadFrequently for better getImageData performance
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } else {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    if (!ctx) {
      return null;
    }

    ctx.drawImage(rawFrame, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    this.effectProcessor.applyEffects(imageData, width, height, this.currentEffectsState);
    ctx.putImageData(imageData, 0, 0);

    return {
      canvas,
      effectsHash: this.currentEffectsHash,
      width,
      height,
    };
  }

  private addToCache(frame: number, cached: CachedFrame): void {
    this.cache.set(frame, cached);
    this.updateAccessOrder(frame);
    this.enforceMaxCacheSize();
    // Notify UI of cache update
    this.onCacheUpdateCallback?.();
  }

  private updateAccessOrder(frame: number): void {
    this.accessOrder.delete(frame);
    this.accessOrder.set(frame, true);
  }

  private enforceMaxCacheSize(): void {
    const evictionCount = this.cache.size - this.config.maxCacheSize;
    if (evictionCount <= 0) {
      return;
    }

    const framesToEvict: number[] = [];
    for (const frame of this.accessOrder.keys()) {
      if (framesToEvict.length >= evictionCount) break;
      framesToEvict.push(frame);
    }

    for (const frame of framesToEvict) {
      this.evictFrame(frame);
    }
  }

  private cancelDistantRequests(centerFrame: number): void {
    const threshold = this.config.maxCacheSize;

    for (const [frame, request] of this.pendingRequests) {
      if (!request.inProgress) {
        const distance = Math.abs(frame - centerFrame);
        if (distance > threshold) {
          request.cancelled = true;
          this.pendingRequests.delete(frame);
        }
      }
    }
  }

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

  private evictFrame(frame: number): void {
    this.cache.delete(frame);
    this.accessOrder.delete(frame);
  }

  getStats(): {
    cacheSize: number;
    pendingRequests: number;
    activeRequests: number;
    cacheHits: number;
    cacheMisses: number;
    staleCacheHits: number;
    hitRate: number;
    workersAvailable: boolean;
    numWorkers: number;
  } {
    const totalRequests = this.cacheHits + this.staleCacheHits + this.cacheMisses;
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      activeRequests: this.activeCount,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      staleCacheHits: this.staleCacheHits,
      hitRate: totalRequests > 0 ? (this.cacheHits + this.staleCacheHits) / totalRequests : 0,
      workersAvailable: this.workersAvailable,
      numWorkers: this.workersAvailable ? this.config.numWorkers : 0,
    };
  }

  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.staleCacheHits = 0;
  }

  setTotalFrames(totalFrames: number): void {
    this.totalFrames = totalFrames;
  }

  updateConfig(config: Partial<PrerenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set callback to be called when cache is updated (frame added)
   * Used by UI components to refresh display in real-time
   */
  setOnCacheUpdate(callback: (() => void) | null): void {
    this.onCacheUpdateCallback = callback;
  }

  clear(): void {
    this.invalidateAll();
  }

  dispose(): void {
    this.clear();
    if (this.workerPool) {
      this.workerPool.dispose();
      this.workerPool = null;
    }
    this.workersAvailable = false;
  }
}
