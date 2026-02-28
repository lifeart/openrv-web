/**
 * Tracks disposable subscriptions (signal connections, event listeners, etc.)
 * and disposes them all when the manager is disposed.
 *
 * Usage:
 *   const subs = new DisposableSubscriptionManager();
 *   subs.add(signal.connect(callback));
 *   subs.add(emitter.on('event', handler));
 *   subs.addDOMListener(element, 'click', handler);
 *   // Later:
 *   subs.dispose();
 */
export class DisposableSubscriptionManager {
  private disposers: (() => void)[] = [];
  private children: DisposableSubscriptionManager[] = [];
  private abortController: AbortController | null = null;
  private disposed = false;
  private _parent: DisposableSubscriptionManager | null = null;

  /**
   * Add an unsubscribe/dispose function to be called on dispose().
   * Works with both Signal.connect() and EventEmitter.on() return values.
   */
  add(disposer: () => void): void {
    if (this.disposed) {
      // Immediately call if already disposed (fail-safe)
      disposer();
      return;
    }
    this.disposers.push(disposer);
  }

  /**
   * Add a DOM event listener with automatic cleanup via AbortController.
   * Do not pass your own `signal` option — the manager controls the AbortController.
   */
  addDOMListener(
    target: EventTarget,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
  ): void {
    if (this.disposed) return;
    if (options?.signal) {
      throw new Error(
        'DisposableSubscriptionManager.addDOMListener: do not pass options.signal; the manager controls the AbortController'
      );
    }
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    target.addEventListener(event, handler, {
      ...options,
      signal: this.abortController.signal,
    });
  }

  /**
   * Create a child subscription manager whose lifetime is tied to this one.
   * When the parent is disposed, all children are disposed too.
   * When a child is independently disposed, it removes itself from the parent.
   */
  createChild(): DisposableSubscriptionManager {
    if (this.disposed) {
      const child = new DisposableSubscriptionManager();
      child.dispose();
      return child;
    }
    const child = new DisposableSubscriptionManager();
    this.children.push(child);
    child._parent = this;
    return child;
  }

  /**
   * Dispose all tracked subscriptions and children.
   * Idempotent: calling dispose() multiple times is safe.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Self-remove from parent to prevent stale references
    if (this._parent) {
      const idx = this._parent.children.indexOf(this);
      if (idx !== -1) this._parent.children.splice(idx, 1);
      this._parent = null;
    }

    // Dispose children first
    for (const child of [...this.children]) {
      child.dispose();
    }
    this.children = [];

    // Abort all DOM listeners
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Call all disposers
    for (const disposer of this.disposers) {
      try {
        disposer();
      } catch (err) {
        console.error('Error disposing subscription:', err);
      }
    }
    this.disposers = [];
  }

  /**
   * Whether this manager has been disposed.
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Number of tracked subscriptions (useful for testing/debugging).
   * Does not include child managers or DOM listeners.
   */
  get count(): number {
    return this.disposers.length;
  }
}
