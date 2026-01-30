/**
 * CacheIndicator - Visual indicator for frame caching status
 *
 * Features:
 * - Thin bar showing cached frame ranges
 * - Color coding: cached (green), loading (yellow), uncached (gray)
 * - Cache size display
 * - Manual cache clear option
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { Session } from '../../core/session/Session';
import type { Viewer } from './Viewer';

export interface CacheIndicatorState {
  visible: boolean;
  cachedFrames: Set<number>;
  pendingFrames: Set<number>;
  totalFrames: number;
  cachedCount: number;
  pendingCount: number;
  memorySizeMB: number;
}

export interface CacheIndicatorEvents extends EventMap {
  visibilityChanged: boolean;
  clearRequested: void;
}

export class CacheIndicator extends EventEmitter<CacheIndicatorEvents> {
  private container: HTMLElement;
  private barContainer: HTMLElement;
  private infoContainer: HTMLElement;
  private clearButton: HTMLButtonElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private session: Session;
  private viewer: Viewer | null = null;
  private visible = true;
  private updateScheduled = false;
  private totalFrames = 0;
  private inPoint = 1;
  private outPoint = 1;
  private prerenderStatsSpan: HTMLSpanElement | null = null;

  // Colors for cache states - resolved from CSS variables at runtime
  private static getCachedColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--success').trim() || '#4ade80';
  }
  private static getPendingColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#facc15';
  }
  private static getUncachedColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--bg-hover').trim() || '#374151';
  }

  constructor(session: Session, viewer?: Viewer) {
    super();
    this.session = session;
    this.viewer = viewer ?? null;

    // Register for prerender cache updates if viewer provided
    if (this.viewer) {
      this.viewer.setOnPrerenderCacheUpdate(() => this.scheduleUpdate());
    }

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'cache-indicator';
    this.container.dataset.testid = 'cache-indicator';
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 2px 0;
    `;

    // Create bar container (holds canvas)
    this.barContainer = document.createElement('div');
    this.barContainer.style.cssText = `
      height: 6px;
      background: var(--bg-hover);
      border-radius: 2px;
      overflow: hidden;
      position: relative;
    `;

    // Create canvas for drawing cache bars
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      width: 100%;
      height: 100%;
      display: block;
    `;
    this.barContainer.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Create info container (cache stats + clear button)
    this.infoContainer = document.createElement('div');
    this.infoContainer.dataset.testid = 'cache-indicator-info';
    this.infoContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: var(--text-muted);
    `;

    const statsSpan = document.createElement('span');
    statsSpan.className = 'cache-stats';
    statsSpan.dataset.testid = 'cache-indicator-stats';
    statsSpan.textContent = 'Cache: 0 / 0 frames';

    // Create prerender stats span (for effects cache)
    this.prerenderStatsSpan = document.createElement('span');
    this.prerenderStatsSpan.className = 'prerender-stats';
    this.prerenderStatsSpan.dataset.testid = 'prerender-indicator-stats';
    this.prerenderStatsSpan.style.cssText = `
      margin-left: 12px;
      color: var(--accent-primary);
    `;
    this.prerenderStatsSpan.textContent = '';

    this.clearButton = document.createElement('button');
    this.clearButton.dataset.testid = 'cache-indicator-clear';
    this.clearButton.textContent = 'Clear';
    this.clearButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-muted);
      padding: 1px 6px;
      font-size: 9px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.12s ease;
    `;
    this.clearButton.addEventListener('mouseenter', () => {
      this.clearButton.style.background = 'var(--bg-hover)';
      this.clearButton.style.color = 'var(--text-primary)';
    });
    this.clearButton.addEventListener('mouseleave', () => {
      this.clearButton.style.background = 'transparent';
      this.clearButton.style.color = 'var(--text-muted)';
    });
    this.clearButton.addEventListener('click', () => {
      this.session.clearVideoCache();
      this.emit('clearRequested', undefined);
      this.scheduleUpdate();
    });

    this.infoContainer.appendChild(statsSpan);
    this.infoContainer.appendChild(this.prerenderStatsSpan);
    this.infoContainer.appendChild(this.clearButton);

    this.container.appendChild(this.barContainer);
    this.container.appendChild(this.infoContainer);

    // Subscribe to session events
    this.session.on('frameChanged', () => this.scheduleUpdate());
    this.session.on('durationChanged', () => this.scheduleUpdate());
    this.session.on('sourceLoaded', () => this.scheduleUpdate());
    this.session.on('inOutChanged', () => this.scheduleUpdate());

    // Initial update
    this.scheduleUpdate();
  }

  /**
   * Get the container element
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Show/hide the cache indicator
   */
  setVisible(visible: boolean): void {
    if (this.visible !== visible) {
      this.visible = visible;
      this.container.style.display = visible ? 'flex' : 'none';
      this.emit('visibilityChanged', visible);
      if (visible) {
        this.scheduleUpdate();
      }
    }
  }

  /**
   * Check if indicator is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    this.setVisible(!this.visible);
  }

  /**
   * Get current state
   */
  getState(): CacheIndicatorState {
    const cachedFrames = this.session.getCachedFrames();
    const pendingFrames = this.session.getPendingFrames();
    const source = this.session.currentSource;
    const totalFrames = source?.duration ?? 0;
    const memorySizeMB = this.calculateMemorySizeMB(cachedFrames.size);

    return {
      visible: this.visible,
      cachedFrames,
      pendingFrames,
      totalFrames,
      cachedCount: cachedFrames.size,
      pendingCount: pendingFrames.size,
      memorySizeMB,
    };
  }

  /**
   * Calculate estimated memory size in MB for cached frames
   * Based on frame dimensions and RGBA color depth (4 bytes per pixel)
   */
  private calculateMemorySizeMB(cachedFrameCount: number): number {
    const source = this.session.currentSource;
    if (!source || cachedFrameCount === 0) {
      return 0;
    }

    const width = source.width || 0;
    const height = source.height || 0;
    const bytesPerPixel = 4; // RGBA
    const bytesPerFrame = width * height * bytesPerPixel;
    const totalBytes = bytesPerFrame * cachedFrameCount;
    const megabytes = totalBytes / (1024 * 1024);

    return megabytes;
  }

  /**
   * Format memory size for display
   */
  private formatMemorySize(megabytes: number): string {
    if (megabytes >= 1024) {
      return `${(megabytes / 1024).toFixed(1)} GB`;
    } else if (megabytes >= 1) {
      return `${Math.round(megabytes)} MB`;
    } else if (megabytes > 0) {
      return `${(megabytes * 1024).toFixed(0)} KB`;
    }
    return '0 MB';
  }

  /**
   * Schedule an update on the next animation frame
   */
  scheduleUpdate(): void {
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.render();
    });
  }

  /**
   * Render the cache indicator
   */
  private render(): void {
    if (!this.visible) return;

    // Only show for mediabunny sources
    if (!this.session.isUsingMediabunny()) {
      this.container.style.display = 'none';
      return;
    }
    this.container.style.display = 'flex';

    const source = this.session.currentSource;
    this.totalFrames = source?.duration ?? 0;
    this.inPoint = this.session.inPoint;
    this.outPoint = this.session.outPoint;

    if (this.totalFrames === 0) {
      return;
    }

    const cachedFrames = this.session.getCachedFrames();
    const pendingFrames = this.session.getPendingFrames();
    const stats = this.session.getCacheStats();

    // Update stats display
    const statsSpan = this.infoContainer.querySelector('.cache-stats') as HTMLSpanElement;
    if (statsSpan) {
      const memorySizeMB = this.calculateMemorySizeMB(cachedFrames.size);
      const memoryStr = this.formatMemorySize(memorySizeMB);
      statsSpan.textContent = `Cache: ${cachedFrames.size} / ${this.totalFrames} frames (${memoryStr})`;
      if (stats && pendingFrames.size > 0) {
        statsSpan.textContent += ` [${pendingFrames.size} loading]`;
      }
    }

    // Update prerender stats display
    this.updatePrerenderStats();

    // Render cache bar
    this.renderBar(cachedFrames, pendingFrames);
  }

  /**
   * Update prerender buffer stats display
   */
  private updatePrerenderStats(): void {
    if (!this.prerenderStatsSpan) return;

    if (!this.viewer) {
      this.prerenderStatsSpan.textContent = '';
      return;
    }

    const stats = this.viewer.getPrerenderStats();
    // Hide stats when nothing to show (no cache and no activity)
    if (!stats || (stats.cacheSize === 0 && stats.pendingRequests === 0 && stats.activeRequests === 0)) {
      this.prerenderStatsSpan.textContent = '';
      return;
    }

    const memoryStr = this.formatMemorySize(stats.memorySizeMB);
    let text = `Effects: ${stats.cacheSize} / ${stats.totalFrames} frames (${memoryStr})`;

    // Show active (processing) vs queued (waiting) for better visibility into worker utilization
    if (stats.activeRequests > 0 || stats.pendingRequests > 0) {
      text += ` [${stats.activeRequests} active, ${stats.pendingRequests} queued]`;
    }

    this.prerenderStatsSpan.textContent = text;
  }

  /**
   * Set the viewer reference for prerender stats
   */
  setViewer(viewer: Viewer): void {
    // Unregister from old viewer
    if (this.viewer) {
      this.viewer.setOnPrerenderCacheUpdate(null);
    }
    this.viewer = viewer;
    // Register for prerender cache updates
    this.viewer.setOnPrerenderCacheUpdate(() => this.scheduleUpdate());
    this.scheduleUpdate();
  }

  /**
   * Render the cache bar visualization
   */
  private renderBar(cachedFrames: Set<number>, pendingFrames: Set<number>): void {
    // Get actual pixel dimensions
    const rect = this.barContainer.getBoundingClientRect();
    const width = Math.floor(rect.width * window.devicePixelRatio);
    const height = Math.floor(rect.height * window.devicePixelRatio);

    if (width === 0 || height === 0) return;

    // Resize canvas if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Clear canvas
    this.ctx.fillStyle = CacheIndicator.getUncachedColor();
    this.ctx.fillRect(0, 0, width, height);

    // Draw cache status for each frame
    // We use the in/out range as the visible range
    const rangeStart = this.inPoint;
    const rangeEnd = this.outPoint;
    const rangeLength = rangeEnd - rangeStart + 1;

    if (rangeLength <= 0) return;

    // Calculate pixels per frame
    const pixelsPerFrame = width / rangeLength;

    // Draw cached frames (green)
    this.ctx.fillStyle = CacheIndicator.getCachedColor();
    for (const frame of cachedFrames) {
      if (frame >= rangeStart && frame <= rangeEnd) {
        const x = Math.floor((frame - rangeStart) * pixelsPerFrame);
        const w = Math.max(1, Math.ceil(pixelsPerFrame));
        this.ctx.fillRect(x, 0, w, height);
      }
    }

    // Draw pending frames (yellow) on top
    this.ctx.fillStyle = CacheIndicator.getPendingColor();
    for (const frame of pendingFrames) {
      if (frame >= rangeStart && frame <= rangeEnd) {
        const x = Math.floor((frame - rangeStart) * pixelsPerFrame);
        const w = Math.max(1, Math.ceil(pixelsPerFrame));
        this.ctx.fillRect(x, 0, w, height);
      }
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    // Unregister prerender cache update callback
    if (this.viewer) {
      this.viewer.setOnPrerenderCacheUpdate(null);
    }
    this.container.remove();
    this.removeAllListeners();
  }
}
