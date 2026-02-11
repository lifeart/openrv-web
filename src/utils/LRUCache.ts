/**
 * Simple generic LRU cache using Map (O(1) operations, insertion-order iteration).
 * On get(), refreshes entry position. On set(), evicts oldest if over capacity.
 * Optional onEvict callback for resource cleanup (e.g. .close(), URL.revokeObjectURL()).
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>();
  private maxSize: number;
  private onEvict?: (key: K, value: V) => void;

  constructor(maxSize: number, onEvict?: (key: K, value: V) => void) {
    this.maxSize = Math.max(1, maxSize);
    this.onEvict = onEvict;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Refresh position: delete and re-insert to move to end (most recent)
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /**
   * Return the cached value WITHOUT refreshing its LRU position.
   * Use this on hot paths (e.g. the render loop) where the value is read
   * every frame and the Map delete+re-insert would cause unnecessary GC pressure.
   */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const oldValue = this.map.get(key)!;
      this.map.delete(key);
      // Call onEvict for the replaced value so resources (e.g. VideoFrame) are cleaned up
      if (oldValue !== value) {
        this.onEvict?.(key, oldValue);
      }
    }
    this.map.set(key, value);
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value!;
      const oldestValue = this.map.get(oldest)!;
      this.map.delete(oldest);
      this.onEvict?.(oldest, oldestValue);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const value = this.map.get(key);
    if (value === undefined) return false;
    this.map.delete(key);
    this.onEvict?.(key, value);
    return true;
  }

  clear(): void {
    if (this.onEvict) {
      for (const [key, value] of this.map) {
        this.onEvict(key, value);
      }
    }
    this.map.clear();
  }

  keys(): Set<K> {
    return new Set(this.map.keys());
  }

  get size(): number {
    return this.map.size;
  }

  get capacity(): number {
    return this.maxSize;
  }

  setCapacity(newSize: number): void {
    this.maxSize = Math.max(1, newSize);
    // Evict excess entries if needed
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value!;
      const oldestValue = this.map.get(oldest)!;
      this.map.delete(oldest);
      this.onEvict?.(oldest, oldestValue);
    }
  }
}
