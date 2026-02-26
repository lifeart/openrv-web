/**
 * Reference-counted wrapper around VideoFrame that ensures explicit
 * VRAM cleanup. Each ManagedVideoFrame tracks how many owners hold
 * a reference; the underlying VideoFrame.close() is called only when
 * the last owner releases.
 *
 * Typical flow:
 *   const managed = ManagedVideoFrame.wrap(videoFrame);
 *   // ... pass to IPImage, cache, etc.
 *   managed.release(); // decrements refcount; closes when 0
 *
 * **Constraint:** ManagedVideoFrame must only be used on the main thread.
 * Cross-worker VideoFrame transfer requires a different protocol.
 */
export class ManagedVideoFrame {
  private _refCount = 1;
  private _closed = false;

  /** For debugging: creation stack trace (only in dev builds) */
  readonly creationStack?: string;

  private constructor(
    public readonly frame: VideoFrame,
    /** Unique ID for leak tracking */
    public readonly id: number,
  ) {
    if (import.meta.env.DEV) {
      this.creationStack = new Error().stack;
    }
    ManagedVideoFrame._activeCount++;
    ManagedVideoFrame._activeIds.add(id);
    ManagedVideoFrame._registry?.register(this, id, this);
  }

  // --- Static tracking for leak detection ---
  private static _nextId = 0;
  private static _activeCount = 0;
  /** Track active frame IDs for deterministic leak detection (more reliable than frame.format checks in mocks) */
  private static _activeIds = new Set<number>();
  private static _registry: FinalizationRegistry<number> | null = null;
  private static _onLeak: ((id: number) => void) | null = null;
  /** Guard against double-wrapping the same raw VideoFrame */
  private static _wrappedFrames = new WeakSet<VideoFrame>();

  /** Number of ManagedVideoFrames currently alive (for tests/monitoring) */
  static get activeCount(): number {
    return ManagedVideoFrame._activeCount;
  }

  /**
   * Enable leak detection via FinalizationRegistry.
   * Call once at app startup in development mode.
   * The callback fires if a ManagedVideoFrame is GC'd without release().
   */
  static enableLeakDetection(onLeak: (id: number) => void): void {
    ManagedVideoFrame._onLeak = onLeak;
    ManagedVideoFrame._registry = new FinalizationRegistry((id: number) => {
      // Check if this ID is still in the active set — if so, it was never released
      if (ManagedVideoFrame._activeIds.has(id)) {
        ManagedVideoFrame._onLeak?.(id);
      }
    });
  }

  /**
   * Wrap a raw VideoFrame in a ManagedVideoFrame. Transfers ownership.
   * @throws if the VideoFrame is already closed (format === null)
   * @throws if the VideoFrame is already managed by another ManagedVideoFrame
   */
  static wrap(frame: VideoFrame): ManagedVideoFrame {
    if (frame.format === null) {
      throw new Error('Cannot wrap an already-closed VideoFrame');
    }
    if (ManagedVideoFrame._wrappedFrames.has(frame)) {
      throw new Error('VideoFrame is already managed by a ManagedVideoFrame (double-wrap)');
    }
    ManagedVideoFrame._wrappedFrames.add(frame);
    return new ManagedVideoFrame(frame, ManagedVideoFrame._nextId++);
  }

  /** Acquire an additional reference (e.g., when caching). */
  acquire(): this {
    if (this._closed) {
      throw new Error(`ManagedVideoFrame #${this.id} already closed`);
    }
    this._refCount++;
    return this;
  }

  /**
   * Release one reference. When refCount hits 0, VideoFrame.close() is called.
   * Safe to call multiple times (no-op after close).
   */
  release(): void {
    if (this._closed) return;
    this._refCount--;
    if (this._refCount <= 0) {
      this._closed = true;
      ManagedVideoFrame._activeCount--;
      ManagedVideoFrame._activeIds.delete(this.id);
      ManagedVideoFrame._wrappedFrames.delete(this.frame);
      // Unregister from FinalizationRegistry to prevent finalizer noise for properly-released frames
      ManagedVideoFrame._registry?.unregister(this);
      try {
        this.frame.close();
      } catch {
        // Already closed externally
      }
    }
  }

  /** Whether this managed frame has been fully released. */
  get isClosed(): boolean {
    return this._closed;
  }

  /** Current reference count (for debugging). */
  get refs(): number {
    return this._refCount;
  }

  /**
   * Reset all static state. **Only for use in tests.**
   * Call in beforeEach to ensure test isolation.
   */
  static resetForTesting(): void {
    ManagedVideoFrame._nextId = 0;
    ManagedVideoFrame._activeCount = 0;
    ManagedVideoFrame._activeIds.clear();
    ManagedVideoFrame._registry = null;
    ManagedVideoFrame._onLeak = null;
    ManagedVideoFrame._wrappedFrames = new WeakSet<VideoFrame>();
  }
}
