/**
 * MemoryBudgetManager - Centralized memory budget accounting for frame caches.
 *
 * Maintains a running byte-total across all registered cache layers,
 * emits pressure events at configurable thresholds, and provides
 * allocation/deallocation tracking.
 *
 * Per-session with a shared budget across all source nodes (A/B compare).
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import { MB, GB } from '../config/CacheConfig';

/**
 * Memory pressure levels.
 */
export type MemoryPressureLevel = 'normal' | 'high' | 'critical';

/**
 * Events emitted by MemoryBudgetManager.
 */
export interface MemoryBudgetEvents extends EventMap {
  /** Emitted when pressure level changes */
  pressureChanged: MemoryPressureLevel;
  /** Emitted when an allocation is reported */
  allocationChanged: { currentUsage: number; totalBudget: number };
}

/**
 * Interface that cache layers must implement to register with the budget manager.
 */
export interface BudgetCacheLayer {
  /** Unique identifier for this cache layer */
  readonly layerId: string;
  /** Return the estimated total memory usage of this layer in bytes */
  getEstimatedMemoryUsage(): number;
}

/**
 * Configuration for the MemoryBudgetManager.
 */
export interface MemoryBudgetConfig {
  /** Total memory budget in bytes */
  totalBudget: number;
  /** High-water mark fraction (0-1) at which lookahead pauses */
  highWaterMark: number;
  /** Critical mark fraction (0-1) at which emergency eviction triggers */
  criticalMark: number;
  /** Interval in ms for periodic audit (0 to disable) */
  auditIntervalMs: number;
}

const DEFAULT_BUDGET_CONFIG: MemoryBudgetConfig = {
  totalBudget: 512 * MB,
  highWaterMark: 0.8,
  criticalMark: 0.95,
  auditIntervalMs: 7000, // ~7 seconds
};

export class MemoryBudgetManager extends EventEmitter<MemoryBudgetEvents> {
  private config: MemoryBudgetConfig;
  private currentUsageBytes: number = 0;
  private layers: Map<string, BudgetCacheLayer> = new Map();
  private pressureLevel: MemoryPressureLevel = 'normal';
  private auditTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<MemoryBudgetConfig>) {
    super();
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  /**
   * Get the current total memory budget in bytes.
   */
  getTotalBudget(): number {
    return this.config.totalBudget;
  }

  /**
   * Update the total memory budget.
   * Clamps to [256 MB, 4 GB].
   */
  setTotalBudget(bytes: number): void {
    this.config.totalBudget = Math.max(256 * MB, Math.min(4 * GB, bytes));
    this.updatePressureLevel();
    this.emit('allocationChanged', {
      currentUsage: this.currentUsageBytes,
      totalBudget: this.config.totalBudget,
    });
  }

  /**
   * Get the current memory usage in bytes.
   */
  getCurrentUsage(): number {
    return this.currentUsageBytes;
  }

  /**
   * Get the current memory pressure level.
   */
  getPressureLevel(): MemoryPressureLevel {
    return this.pressureLevel;
  }

  /**
   * Get the usage as a fraction of the total budget (0-1).
   */
  getUsageFraction(): number {
    if (this.config.totalBudget <= 0) return 1;
    return this.currentUsageBytes / this.config.totalBudget;
  }

  /**
   * Get the current configuration (read-only copy).
   */
  getConfig(): Readonly<MemoryBudgetConfig> {
    return { ...this.config };
  }

  // -----------------------------------------------------------------------
  // Layer registration
  // -----------------------------------------------------------------------

  /**
   * Register a cache layer for budget tracking and periodic auditing.
   */
  register(layer: BudgetCacheLayer): void {
    this.layers.set(layer.layerId, layer);
  }

  /**
   * Unregister a cache layer.
   */
  unregister(layerId: string): void {
    this.layers.delete(layerId);
  }

  /**
   * Get all registered layer IDs.
   */
  getRegisteredLayers(): string[] {
    return Array.from(this.layers.keys());
  }

  // -----------------------------------------------------------------------
  // Allocation tracking
  // -----------------------------------------------------------------------

  /**
   * Check if an allocation of the given size can be made within the budget.
   */
  canAllocate(bytes: number): boolean {
    return this.currentUsageBytes + bytes <= this.config.totalBudget;
  }

  /**
   * Report that memory has been allocated (e.g., a frame was added to cache).
   */
  reportAllocation(bytes: number): void {
    this.currentUsageBytes += bytes;
    this.updatePressureLevel();
    this.emit('allocationChanged', {
      currentUsage: this.currentUsageBytes,
      totalBudget: this.config.totalBudget,
    });
  }

  /**
   * Report that memory has been deallocated (e.g., a frame was evicted).
   */
  reportDeallocation(bytes: number): void {
    this.currentUsageBytes = Math.max(0, this.currentUsageBytes - bytes);
    this.updatePressureLevel();
    this.emit('allocationChanged', {
      currentUsage: this.currentUsageBytes,
      totalBudget: this.config.totalBudget,
    });
  }

  /**
   * Reset the usage counter to zero (e.g., when all caches are cleared).
   */
  resetUsage(): void {
    this.currentUsageBytes = 0;
    this.updatePressureLevel();
    this.emit('allocationChanged', {
      currentUsage: 0,
      totalBudget: this.config.totalBudget,
    });
  }

  // -----------------------------------------------------------------------
  // Pressure management
  // -----------------------------------------------------------------------

  /**
   * Get the number of bytes that need to be freed to reach the given pressure level.
   * Returns 0 if already at or below the target level.
   */
  getBytesToFree(targetLevel: MemoryPressureLevel = 'normal'): number {
    let targetFraction: number;
    switch (targetLevel) {
      case 'normal':
        targetFraction = this.config.highWaterMark;
        break;
      case 'high':
        targetFraction = this.config.criticalMark;
        break;
      case 'critical':
        return 0; // Already critical, nothing to free to reach critical
    }
    const targetBytes = this.config.totalBudget * targetFraction;
    return Math.max(0, this.currentUsageBytes - targetBytes);
  }

  /**
   * Check if the manager is at or above a given pressure level.
   */
  isAtOrAbove(level: MemoryPressureLevel): boolean {
    const levels: MemoryPressureLevel[] = ['normal', 'high', 'critical'];
    return levels.indexOf(this.pressureLevel) >= levels.indexOf(level);
  }

  // -----------------------------------------------------------------------
  // Periodic audit
  // -----------------------------------------------------------------------

  /**
   * Start the periodic audit timer.
   * The audit validates the running total against actual layer usage.
   */
  startAudit(): void {
    if (this.auditTimerId !== null || this.config.auditIntervalMs <= 0) return;
    this.auditTimerId = setInterval(() => {
      this.runAudit();
    }, this.config.auditIntervalMs);
  }

  /**
   * Stop the periodic audit timer.
   */
  stopAudit(): void {
    if (this.auditTimerId !== null) {
      clearInterval(this.auditTimerId);
      this.auditTimerId = null;
    }
  }

  /**
   * Run a single audit pass: sum estimated usage from all layers and compare
   * with the running total. Returns the discrepancy (positive = over-counted).
   */
  runAudit(): number {
    let actualTotal = 0;
    for (const layer of this.layers.values()) {
      actualTotal += layer.getEstimatedMemoryUsage();
    }

    const discrepancy = this.currentUsageBytes - actualTotal;

    // If discrepancy is significant (>5% of budget), correct it
    if (Math.abs(discrepancy) > this.config.totalBudget * 0.05) {
      this.currentUsageBytes = actualTotal;
      this.updatePressureLevel();
    }

    return discrepancy;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Dispose the manager and clean up resources.
   */
  dispose(): void {
    this.stopAudit();
    this.layers.clear();
    this.currentUsageBytes = 0;
    this.pressureLevel = 'normal';
    this.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private updatePressureLevel(): void {
    const fraction = this.getUsageFraction();
    let newLevel: MemoryPressureLevel;

    if (fraction >= this.config.criticalMark) {
      newLevel = 'critical';
    } else if (fraction >= this.config.highWaterMark) {
      newLevel = 'high';
    } else {
      newLevel = 'normal';
    }

    if (newLevel !== this.pressureLevel) {
      this.pressureLevel = newLevel;
      this.emit('pressureChanged', newLevel);
    }
  }
}
