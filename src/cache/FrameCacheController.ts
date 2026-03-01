/**
 * FrameCacheController - Central coordination layer for frame caching.
 *
 * Sits between frame sources (VideoSourceNode / MediabunnyFrameExtractor)
 * and the rendering pipeline, providing:
 *
 * - Region cache: Fixed window of decoded frames around playhead
 * - Lookahead: Speculative pre-fetch in playback direction
 * - Configurable memory budget with pressure management
 * - Three cache modes: off / region / lookahead
 * - Pre-roll warm-up before playback
 * - Multi-source coordination (shared budget across A/B sources)
 *
 * Per-session with a shared memory budget across all source nodes.
 */

import { EventEmitter, EventMap } from '../utils/EventEmitter';
import { MemoryBudgetManager, type MemoryPressureLevel } from './MemoryBudgetManager';
import {
  estimateFrameBytes,
  regionCapacity,
  calculateWindowSplit,
  evictionGuardRadius,
} from './FrameSizeEstimator';
import {
  type CacheMode,
  type CacheConfig,
  DEFAULT_CACHE_CONFIG,
  CACHE_MODE_CYCLE,
} from '../config/CacheConfig';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

/**
 * Events emitted by FrameCacheController.
 */
export interface FrameCacheControllerEvents extends EventMap {
  /** Cache mode changed */
  modeChanged: CacheMode;
  /** Cache state updated (frames added/evicted, region changed) */
  stateChanged: FrameCacheState;
  /** Memory pressure level changed */
  pressureChanged: MemoryPressureLevel;
  /** Warm-up completed */
  warmUpComplete: void;
  /** Region boundaries changed */
  regionChanged: { start: number; end: number };
}

/**
 * Snapshot of the cache state for UI consumption.
 */
export interface FrameCacheState {
  mode: CacheMode;
  totalBudgetBytes: number;
  currentUsageBytes: number;
  cachedFrameCount: number;
  regionStart: number;
  regionEnd: number;
  playheadFrame: number;
  isWarming: boolean;
  pressureLevel: MemoryPressureLevel;
}

/**
 * Playback state passed to the controller.
 */
export interface PlaybackInfo {
  isPlaying: boolean;
  direction: 1 | -1;
  speed: number;
  currentFrame: number;
  inPoint: number;
  outPoint: number;
}

/**
 * Source registration info for multi-source support.
 */
export interface CacheSourceInfo {
  sourceId: string;
  width: number;
  height: number;
  isHDR: boolean;
  totalFrames: number;
  targetSize?: { w: number; h: number };
  /** Callback to check if a frame is cached in this source */
  hasFrame: (frame: number) => boolean;
  /** Callback to get cached frame numbers */
  getCachedFrames: () => Set<number>;
  /** Callback to trigger preloading of specific frames */
  preloadFrames: (frames: number[]) => void;
  /** Callback to evict specific frames */
  evictFrames: (frames: number[]) => void;
  /** Callback to get the count of cached frames */
  getCachedFrameCount: () => number;
}

// -----------------------------------------------------------------------
// Controller
// -----------------------------------------------------------------------

export class FrameCacheController extends EventEmitter<FrameCacheControllerEvents> {
  private config: CacheConfig;
  private budgetManager: MemoryBudgetManager;

  // Registered sources
  private sources: Map<string, CacheSourceInfo> = new Map();
  private activeSourceId: string | null = null;

  // Playback state
  private playbackInfo: PlaybackInfo = {
    isPlaying: false,
    direction: 1,
    speed: 1,
    currentFrame: 1,
    inPoint: 1,
    outPoint: 1,
  };

  // Region state
  private regionStart: number = 1;
  private regionEnd: number = 1;

  // Warm-up state
  private isWarming: boolean = false;
  private warmUpResolve: (() => void) | null = null;
  private warmUpReject: ((err: Error) => void) | null = null;
  private warmUpTimerId: ReturnType<typeof setTimeout> | null = null;

  // Scrub velocity tracking
  private lastScrubFrame: number = 0;
  private lastScrubTime: number = 0;
  private scrubVelocity: number = 0;

  // Lookahead throughput tracking
  private decodeTimestamps: number[] = [];

  constructor(config?: Partial<CacheConfig>, budgetManager?: MemoryBudgetManager) {
    super();

    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    this.budgetManager = budgetManager ?? new MemoryBudgetManager({
      totalBudget: this.config.memoryBudgetBytes,
      highWaterMark: this.config.highWaterMark,
      criticalMark: this.config.criticalMark,
    });

    // Forward pressure events
    this.budgetManager.on('pressureChanged', (level) => {
      this.emit('pressureChanged', level);
    });
  }

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  /**
   * Get the current cache mode.
   */
  getMode(): CacheMode {
    return this.config.mode;
  }

  /**
   * Set the cache mode.
   */
  setMode(mode: CacheMode): void {
    if (mode === this.config.mode) return;
    this.config.mode = mode;

    // When switching to 'off', evict everything except the minimal buffer
    if (mode === 'off') {
      this.evictToMinimalBuffer();
    }

    this.updateRegion();
    this.emit('modeChanged', mode);
    this.emitStateChanged();
  }

  /**
   * Cycle to the next cache mode.
   */
  cycleMode(): CacheMode {
    const currentIndex = CACHE_MODE_CYCLE.indexOf(this.config.mode);
    const nextIndex = (currentIndex + 1) % CACHE_MODE_CYCLE.length;
    const nextMode = CACHE_MODE_CYCLE[nextIndex]!;
    this.setMode(nextMode);
    return nextMode;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<CacheConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<CacheConfig>): void {
    Object.assign(this.config, config);
    if (config.memoryBudgetBytes !== undefined) {
      this.budgetManager.setTotalBudget(config.memoryBudgetBytes);
    }
    this.updateRegion();
    this.emitStateChanged();
  }

  /**
   * Get the MemoryBudgetManager instance.
   */
  getBudgetManager(): MemoryBudgetManager {
    return this.budgetManager;
  }

  // -----------------------------------------------------------------------
  // Source registration
  // -----------------------------------------------------------------------

  /**
   * Register a source node for cache coordination.
   */
  registerSource(source: CacheSourceInfo): void {
    this.sources.set(source.sourceId, source);
    if (!this.activeSourceId) {
      this.activeSourceId = source.sourceId;
    }
  }

  /**
   * Unregister a source node.
   */
  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId);
    if (this.activeSourceId === sourceId) {
      this.activeSourceId = this.sources.size > 0
        ? this.sources.keys().next().value ?? null
        : null;
    }
  }

  /**
   * Set the active source (the one currently being viewed).
   * The active source gets priority for lookahead.
   */
  setActiveSource(sourceId: string): void {
    if (this.sources.has(sourceId)) {
      this.activeSourceId = sourceId;
    }
  }

  /**
   * Get the active source ID.
   */
  getActiveSourceId(): string | null {
    return this.activeSourceId;
  }

  /**
   * Get all registered source IDs.
   */
  getRegisteredSourceIds(): string[] {
    return Array.from(this.sources.keys());
  }

  // -----------------------------------------------------------------------
  // Playback state
  // -----------------------------------------------------------------------

  /**
   * Notify the controller of a playback state change.
   */
  onPlaybackStateChange(info: Partial<PlaybackInfo>): void {
    const prevFrame = this.playbackInfo.currentFrame;

    Object.assign(this.playbackInfo, info);

    // Track scrub velocity
    if (info.currentFrame !== undefined && info.currentFrame !== prevFrame) {
      this.updateScrubVelocity(info.currentFrame);
    }

    // Update region when frame changes
    if (info.currentFrame !== undefined || info.isPlaying !== undefined || info.direction !== undefined) {
      this.updateRegion();
    }

    // Trigger preloading
    if (this.config.mode !== 'off') {
      this.triggerPreload();
    } else {
      // Even in 'off' mode, maintain 3-frame buffer
      this.preloadMinimalBuffer();
    }

    // Check warm-up completion
    if (this.isWarming && info.currentFrame !== undefined) {
      this.checkWarmUpComplete();
    }

    this.emitStateChanged();
  }

  /**
   * Notify the controller that playback has started.
   */
  onPlaybackStart(direction: 1 | -1, speed: number, currentFrame: number): void {
    this.onPlaybackStateChange({
      isPlaying: true,
      direction,
      speed,
      currentFrame,
    });
  }

  /**
   * Notify the controller that playback has stopped.
   */
  onPlaybackStop(): void {
    this.onPlaybackStateChange({ isPlaying: false });
    this.cancelWarmUp();
  }

  /**
   * Notify the controller of a seek to a specific frame.
   */
  onSeek(frame: number): void {
    this.scrubVelocity = 0;
    this.onPlaybackStateChange({ currentFrame: frame });
  }

  // -----------------------------------------------------------------------
  // Warm-up / Pre-roll
  // -----------------------------------------------------------------------

  /**
   * Buffer a minimum number of frames before playback can begin.
   *
   * Resolves when minPrerollFrames are cached, or rejects on timeout (5s).
   */
  warmUp(
    frame: number,
    direction: 1 | -1,
    minFrames?: number,
  ): Promise<void> {
    if (this.config.mode === 'off') {
      return Promise.resolve();
    }

    const targetFrames = minFrames ?? this.config.minPrerollFrames;

    // Check if already warm
    if (this.countCachedInDirection(frame, direction, targetFrames) >= targetFrames) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.isWarming = true;
      this.warmUpResolve = resolve;
      this.warmUpReject = reject;

      // Timeout after 5 seconds
      this.warmUpTimerId = setTimeout(() => {
        this.isWarming = false;
        this.warmUpResolve = null;
        const rejecter = this.warmUpReject;
        this.warmUpReject = null;
        this.warmUpTimerId = null;
        rejecter?.(new Error('Warm-up timeout'));
      }, 5000);

      // Trigger preloading
      this.playbackInfo.currentFrame = frame;
      this.playbackInfo.direction = direction;
      this.updateRegion();
      this.triggerPreload();
      this.emitStateChanged();
    });
  }

  /**
   * Cancel an in-progress warm-up.
   */
  cancelWarmUp(): void {
    if (this.warmUpTimerId !== null) {
      clearTimeout(this.warmUpTimerId);
      this.warmUpTimerId = null;
    }
    if (this.isWarming) {
      this.isWarming = false;
      const resolve = this.warmUpResolve;
      this.warmUpResolve = null;
      this.warmUpReject = null;
      // Resolve rather than reject to avoid unhandled rejections
      resolve?.();
    }
  }

  /**
   * Notify the controller that a frame has been decoded and cached.
   * This is called by cache layers when a frame is successfully added.
   */
  onFrameCached(_frame: number, sizeBytes: number): void {
    this.budgetManager.reportAllocation(sizeBytes);
    this.recordDecodeTiming();

    // Check warm-up
    if (this.isWarming) {
      this.checkWarmUpComplete();
    }

    this.emitStateChanged();
  }

  /**
   * Notify the controller that a frame has been evicted from cache.
   */
  onFrameEvicted(_frame: number, sizeBytes: number): void {
    this.budgetManager.reportDeallocation(sizeBytes);
    this.emitStateChanged();
  }

  // -----------------------------------------------------------------------
  // Region management
  // -----------------------------------------------------------------------

  /**
   * Get the current region boundaries.
   */
  getRegion(): { start: number; end: number } {
    return { start: this.regionStart, end: this.regionEnd };
  }

  /**
   * Calculate the region window based on current state.
   */
  private updateRegion(): void {
    const { currentFrame, inPoint, outPoint } = this.playbackInfo;

    if (this.config.mode === 'off') {
      // Minimal 3-frame buffer, clamped to valid range
      const clampedFrame = Math.max(inPoint, Math.min(outPoint, currentFrame));
      this.regionStart = Math.max(inPoint, clampedFrame - 1);
      this.regionEnd = Math.min(outPoint, clampedFrame + 1);
      // Ensure start <= end
      if (this.regionStart > this.regionEnd) {
        this.regionStart = this.regionEnd;
      }
      this.emit('regionChanged', { start: this.regionStart, end: this.regionEnd });
      return;
    }

    const source = this.getActiveSource();
    if (!source) {
      this.regionStart = currentFrame;
      this.regionEnd = currentFrame;
      return;
    }

    const bytesPerFrame = estimateFrameBytes(
      source.width, source.height, source.isHDR, source.targetSize,
    );

    const capacity = regionCapacity(this.config.memoryBudgetBytes, bytesPerFrame);
    if (capacity <= 0) {
      this.regionStart = currentFrame;
      this.regionEnd = currentFrame;
      return;
    }

    // Determine window split mode
    let splitMode: 'playback' | 'scrub' | 'scrubDirectional';
    if (this.playbackInfo.isPlaying) {
      splitMode = 'playback';
    } else if (Math.abs(this.scrubVelocity) > 5) {
      // Fast scrubbing: bias toward scrub direction
      splitMode = 'scrubDirectional';
    } else {
      splitMode = 'scrub';
    }

    const direction = this.playbackInfo.isPlaying
      ? this.playbackInfo.direction
      : (this.scrubVelocity >= 0 ? 1 : -1);

    const { aheadFrames, behindFrames } = calculateWindowSplit(
      capacity, splitMode, direction as 1 | -1,
    );

    // Apply lookahead depth adjustment
    let effectiveAhead = aheadFrames;
    if (this.config.mode === 'lookahead' && this.playbackInfo.isPlaying) {
      const throughput = this.getDecodeThroughput();
      if (throughput > 0) {
        const adaptiveDepth = Math.ceil(throughput * 2 / this.playbackInfo.speed);
        effectiveAhead = Math.min(aheadFrames, adaptiveDepth);
      }

      // Pause lookahead under high memory pressure
      if (this.budgetManager.isAtOrAbove('high')) {
        effectiveAhead = Math.min(effectiveAhead, 3);
      }
    }

    if (direction > 0) {
      this.regionStart = Math.max(inPoint, currentFrame - behindFrames);
      this.regionEnd = Math.min(outPoint, currentFrame + effectiveAhead);
    } else {
      this.regionStart = Math.max(inPoint, currentFrame - effectiveAhead);
      this.regionEnd = Math.min(outPoint, currentFrame + behindFrames);
    }

    // Ensure start <= end
    if (this.regionStart > this.regionEnd) {
      this.regionStart = this.regionEnd;
    }

    this.emit('regionChanged', { start: this.regionStart, end: this.regionEnd });
  }

  // -----------------------------------------------------------------------
  // Preloading
  // -----------------------------------------------------------------------

  /**
   * Trigger preloading based on current mode and state.
   */
  private triggerPreload(): void {
    const source = this.getActiveSource();
    if (!source) return;

    const { currentFrame } = this.playbackInfo;
    const framesToPreload: number[] = [];

    // Collect frames in the region that are not yet cached
    for (let f = this.regionStart; f <= this.regionEnd; f++) {
      if (!source.hasFrame(f)) {
        framesToPreload.push(f);
      }
    }

    // Sort by distance from playhead (closest first)
    framesToPreload.sort((a, b) => Math.abs(a - currentFrame) - Math.abs(b - currentFrame));

    if (framesToPreload.length > 0) {
      source.preloadFrames(framesToPreload);
    }
  }

  /**
   * Preload minimal 3-frame buffer for 'off' mode.
   */
  private preloadMinimalBuffer(): void {
    const source = this.getActiveSource();
    if (!source) return;

    const { currentFrame, inPoint, outPoint } = this.playbackInfo;
    const frames: number[] = [];

    // Current frame
    if (!source.hasFrame(currentFrame)) frames.push(currentFrame);
    // +1
    if (currentFrame + 1 <= outPoint && !source.hasFrame(currentFrame + 1)) {
      frames.push(currentFrame + 1);
    }
    // -1
    if (currentFrame - 1 >= inPoint && !source.hasFrame(currentFrame - 1)) {
      frames.push(currentFrame - 1);
    }

    if (frames.length > 0) {
      source.preloadFrames(frames);
    }
  }

  // -----------------------------------------------------------------------
  // Eviction
  // -----------------------------------------------------------------------

  /**
   * Determine which frames should be evicted from a source.
   * Returns frame numbers sorted by eviction priority (farthest from playhead first).
   *
   * Never evicts frames within the eviction guard radius of the playhead.
   */
  getFramesToEvict(sourceId: string, targetCount?: number): number[] {
    const source = this.sources.get(sourceId);
    if (!source) return [];

    const cachedFrames = source.getCachedFrames();
    const { currentFrame } = this.playbackInfo;
    const guardRadius = evictionGuardRadius(
      this.playbackInfo.speed,
      this.config.minEvictionGuard,
    );

    // Collect eviction candidates (outside guard radius and region)
    const candidates: Array<{ frame: number; distance: number }> = [];

    for (const frame of cachedFrames) {
      const distance = Math.abs(frame - currentFrame);
      // Never evict frames within the guard radius
      if (distance <= guardRadius) continue;
      // Never evict frames in the current region
      if (frame >= this.regionStart && frame <= this.regionEnd) continue;

      candidates.push({ frame, distance });
    }

    // Sort by distance descending (farthest first)
    candidates.sort((a, b) => b.distance - a.distance);

    const count = targetCount ?? candidates.length;
    return candidates.slice(0, count).map(c => c.frame);
  }

  /**
   * Trigger emergency eviction when memory pressure is critical.
   * Evicts 20% of frames (farthest from playhead), reduces region by 50%.
   */
  emergencyEviction(): void {
    for (const [sourceId, source] of this.sources) {
      const count = Math.ceil(source.getCachedFrameCount() * 0.2);
      const framesToEvict = this.getFramesToEvict(sourceId, count);
      if (framesToEvict.length > 0) {
        source.evictFrames(framesToEvict);
      }
    }
  }

  /**
   * Evict everything except the minimal 3-frame buffer (for 'off' mode).
   */
  private evictToMinimalBuffer(): void {
    const { currentFrame, inPoint, outPoint } = this.playbackInfo;
    const keep = new Set<number>();
    keep.add(currentFrame);
    if (currentFrame - 1 >= inPoint) keep.add(currentFrame - 1);
    if (currentFrame + 1 <= outPoint) keep.add(currentFrame + 1);

    for (const [, source] of this.sources) {
      const cached = source.getCachedFrames();
      const toEvict: number[] = [];
      for (const frame of cached) {
        if (!keep.has(frame)) {
          toEvict.push(frame);
        }
      }
      if (toEvict.length > 0) {
        source.evictFrames(toEvict);
      }
    }
  }

  // -----------------------------------------------------------------------
  // State queries
  // -----------------------------------------------------------------------

  /**
   * Get a snapshot of the current cache state for UI consumption.
   */
  getCacheState(): FrameCacheState {
    let cachedFrameCount = 0;
    for (const source of this.sources.values()) {
      cachedFrameCount += source.getCachedFrameCount();
    }

    return {
      mode: this.config.mode,
      totalBudgetBytes: this.config.memoryBudgetBytes,
      currentUsageBytes: this.budgetManager.getCurrentUsage(),
      cachedFrameCount,
      regionStart: this.regionStart,
      regionEnd: this.regionEnd,
      playheadFrame: this.playbackInfo.currentFrame,
      isWarming: this.isWarming,
      pressureLevel: this.budgetManager.getPressureLevel(),
    };
  }

  /**
   * Get the current playback info.
   */
  getPlaybackInfo(): Readonly<PlaybackInfo> {
    return { ...this.playbackInfo };
  }

  /**
   * Get the measured decode throughput in frames per second.
   */
  getDecodeThroughput(): number {
    if (this.decodeTimestamps.length < 2) return 0;

    const oldest = this.decodeTimestamps[0]!;
    const newest = this.decodeTimestamps[this.decodeTimestamps.length - 1]!;
    const elapsed = (newest - oldest) / 1000; // seconds

    if (elapsed <= 0) return 0;
    return (this.decodeTimestamps.length - 1) / elapsed;
  }

  /**
   * Get the current scrub velocity in frames per second.
   */
  getScrubVelocity(): number {
    return this.scrubVelocity;
  }

  // -----------------------------------------------------------------------
  // Visibility handling
  // -----------------------------------------------------------------------

  /**
   * Called when the tab becomes hidden.
   * Flushes lookahead cache, keeps only region.
   */
  onTabHidden(): void {
    if (this.config.mode === 'lookahead') {
      // Evict frames outside the core region
      for (const [sourceId, source] of this.sources) {
        const frames = this.getFramesToEvict(sourceId);
        if (frames.length > 0) {
          source.evictFrames(frames);
        }
      }
    }
  }

  /**
   * Called when the tab becomes visible again.
   * Triggers cache validation and re-fetch.
   */
  onTabVisible(): void {
    this.updateRegion();
    if (this.config.mode !== 'off') {
      this.triggerPreload();
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Dispose the controller and clean up resources.
   */
  dispose(): void {
    this.cancelWarmUp();
    this.sources.clear();
    this.decodeTimestamps = [];
    this.budgetManager.dispose();
    this.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private getActiveSource(): CacheSourceInfo | undefined {
    if (this.activeSourceId) {
      return this.sources.get(this.activeSourceId);
    }
    return undefined;
  }

  private updateScrubVelocity(newFrame: number): void {
    const now = performance.now();
    if (this.lastScrubTime > 0) {
      const dt = (now - this.lastScrubTime) / 1000;
      if (dt > 0 && dt < 1) {
        this.scrubVelocity = (newFrame - this.lastScrubFrame) / dt;
      } else {
        this.scrubVelocity = 0;
      }
    }
    this.lastScrubFrame = newFrame;
    this.lastScrubTime = now;
  }

  private recordDecodeTiming(): void {
    const now = performance.now();
    this.decodeTimestamps.push(now);
    // Keep only the last 10 entries for rolling average
    if (this.decodeTimestamps.length > 10) {
      this.decodeTimestamps.shift();
    }
  }

  private countCachedInDirection(frame: number, direction: 1 | -1, maxCount: number): number {
    const source = this.getActiveSource();
    if (!source) return 0;

    let count = 0;
    for (let i = 0; i < maxCount; i++) {
      const f = frame + (i * direction);
      if (f < this.playbackInfo.inPoint || f > this.playbackInfo.outPoint) break;
      if (source.hasFrame(f)) count++;
    }
    return count;
  }

  private checkWarmUpComplete(): void {
    if (!this.isWarming || !this.warmUpResolve) return;

    const { currentFrame, direction } = this.playbackInfo;
    const targetFrames = this.config.minPrerollFrames;
    const cached = this.countCachedInDirection(currentFrame, direction, targetFrames);

    if (cached >= targetFrames) {
      this.isWarming = false;
      if (this.warmUpTimerId !== null) {
        clearTimeout(this.warmUpTimerId);
        this.warmUpTimerId = null;
      }
      const resolve = this.warmUpResolve;
      this.warmUpResolve = null;
      this.warmUpReject = null;
      resolve();
      this.emit('warmUpComplete', undefined as unknown as void);
    }
  }

  private emitStateChanged(): void {
    this.emit('stateChanged', this.getCacheState());
  }
}
