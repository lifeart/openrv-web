type SignalCallback<T> = (value: T, oldValue: T) => void;

export class Signal<T> {
  private callbacks = new Set<SignalCallback<T>>();

  connect(callback: SignalCallback<T>): () => void {
    this.callbacks.add(callback);
    return () => this.disconnect(callback);
  }

  disconnect(callback: SignalCallback<T>): void {
    this.callbacks.delete(callback);
  }

  emit(value: T, oldValue: T): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(value, oldValue);
      } catch (err) {
        console.error('Error in signal callback:', err);
      }
    });
  }

  disconnectAll(): void {
    this.callbacks.clear();
  }

  get hasConnections(): boolean {
    return this.callbacks.size > 0;
  }
}

export class ComputedSignal<T> {
  private cachedValue: T;
  private dirty = true;
  readonly changed = new Signal<T>();

  constructor(
    private compute: () => T,
    dependencies: Signal<any>[] = []
  ) {
    this.cachedValue = compute();

    // Subscribe to dependencies
    for (const dep of dependencies) {
      dep.connect(() => {
        this.dirty = true;
        const oldValue = this.cachedValue;
        this.cachedValue = this.compute();
        this.changed.emit(this.cachedValue, oldValue);
      });
    }
  }

  get value(): T {
    if (this.dirty) {
      this.cachedValue = this.compute();
      this.dirty = false;
    }
    return this.cachedValue;
  }
}
