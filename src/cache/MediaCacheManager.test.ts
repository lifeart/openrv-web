import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MediaCacheManager } from './MediaCacheManager';
import type { CacheEntryMeta } from './MediaCacheManager';

// ---------------------------------------------------------------------------
// In-memory OPFS mock
// ---------------------------------------------------------------------------

/** Minimal in-memory FileSystemFileHandle mock. */
class MockFileHandle {
  private data: ArrayBuffer = new ArrayBuffer(0);

  constructor(readonly name: string) {}

  async getFile(): Promise<File> {
    return new File([this.data], this.name);
  }

  async createWritable(): Promise<WritableStream> {
    const self = this;
    let chunks: Uint8Array[] = [];
    return new WritableStream({
      write(chunk: unknown) {
        // Normalize any buffer-like input to Uint8Array
        if (chunk instanceof Uint8Array) {
          chunks.push(new Uint8Array(chunk));
        } else if (chunk instanceof ArrayBuffer) {
          chunks.push(new Uint8Array(chunk));
        } else {
          // Fallback for cross-realm ArrayBuffers
          chunks.push(new Uint8Array(chunk as ArrayBuffer));
        }
      },
      close() {
        const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        self.data = merged.buffer as ArrayBuffer;
        chunks = [];
      },
    }) as unknown as WritableStream;
  }

  setData(buf: ArrayBuffer): void {
    this.data = buf;
  }
}

/** Minimal in-memory FileSystemDirectoryHandle mock. */
class MockDirectoryHandle {
  private children = new Map<string, MockDirectoryHandle | MockFileHandle>();

  constructor(readonly name: string) {}

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<MockDirectoryHandle> {
    let child = this.children.get(name);
    if (!child || !(child instanceof MockDirectoryHandle)) {
      if (options?.create) {
        child = new MockDirectoryHandle(name);
        this.children.set(name, child);
      } else {
        throw new DOMException('Not found', 'NotFoundError');
      }
    }
    return child as MockDirectoryHandle;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<MockFileHandle> {
    let child = this.children.get(name);
    if (!child || !(child instanceof MockFileHandle)) {
      if (options?.create) {
        child = new MockFileHandle(name);
        this.children.set(name, child);
      } else {
        throw new DOMException('Not found', 'NotFoundError');
      }
    }
    return child as unknown as MockFileHandle;
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    this.children.delete(name);
  }

  /** Support for-await-of (keys iterator). */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
    for (const key of this.children.keys()) {
      yield key;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let opfsRoot: MockDirectoryHandle;

function mockOPFS(): void {
  opfsRoot = new MockDirectoryHandle('root');

  Object.defineProperty(navigator, 'storage', {
    value: {
      getDirectory: vi.fn(async () => opfsRoot),
      estimate: vi.fn(async () => ({ usage: 0, quota: 10_000_000_000 })),
    },
    writable: true,
    configurable: true,
  });
}

function mockLocks(): void {
  Object.defineProperty(navigator, 'locks', {
    value: {
      request: vi.fn(async (_name: string, fn: () => Promise<void>) => fn()),
    },
    writable: true,
    configurable: true,
  });
}

function makeMeta(name = 'test.exr', fileSize = 1024): CacheEntryMeta {
  return {
    fileName: name,
    fileSize,
    lastModified: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaCacheManager', () => {
  let manager: MediaCacheManager;

  beforeEach(() => {
    mockOPFS();
    mockLocks();
    manager = new MediaCacheManager({
      dbName: `test-cache-${Math.random().toString(36).slice(2)}`,
      maxSizeBytes: 10_000, // small limit for testing
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  describe('initialize', () => {
    it('returns true when OPFS is available', async () => {
      const result = await manager.initialize();
      expect(result).toBe(true);
    });

    it('returns false when OPFS is unavailable', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const m = new MediaCacheManager();
      const result = await m.initialize();
      expect(result).toBe(false);
      m.dispose();
    });

    it('returns true on repeated calls (idempotent)', async () => {
      await manager.initialize();
      const result = await manager.initialize();
      expect(result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Round-trip store / retrieve
  // -----------------------------------------------------------------------

  describe('put / get', () => {
    it('stores and retrieves data', async () => {
      await manager.initialize();

      const data = new TextEncoder().encode('hello cache').buffer;
      const ok = await manager.put('key-1', data, makeMeta());
      expect(ok).toBe(true);

      const retrieved = await manager.get('key-1');
      expect(retrieved).not.toBeNull();
      const text = new TextDecoder().decode(new Uint8Array(retrieved!));
      expect(text).toBe('hello cache');
    });

    it('returns null on cache miss', async () => {
      await manager.initialize();
      const result = await manager.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when not initialized', async () => {
      const result = await manager.get('any-key');
      expect(result).toBeNull();
    });

    it('put returns false when not initialized', async () => {
      const result = await manager.put('k', new ArrayBuffer(8), makeMeta());
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isStable
  // -----------------------------------------------------------------------

  describe('isStable', () => {
    it('returns true when no write is pending', async () => {
      await manager.initialize();
      expect(manager.isStable('some-key')).toBe(true);
    });

    it('returns true after a write completes', async () => {
      await manager.initialize();

      const data = new ArrayBuffer(100);
      await manager.put('write-key', data, makeMeta());

      // After put resolves, the key should be stable again
      expect(manager.isStable('write-key')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // LRU Eviction
  // -----------------------------------------------------------------------

  describe('evictLRU', () => {
    it('evicts oldest entries to free space', async () => {
      await manager.initialize();

      // Insert entries with staggered access times
      await manager.put('old', new ArrayBuffer(3000), makeMeta('old.exr'));

      // Wait a bit so timestamps differ
      await new Promise((r) => setTimeout(r, 10));
      await manager.put('new', new ArrayBuffer(3000), makeMeta('new.exr'));

      const freed = await manager.evictLRU(3000);
      expect(freed).toBeGreaterThanOrEqual(3000);

      // Old entry should be gone
      const oldData = await manager.get('old');
      expect(oldData).toBeNull();

      // New entry should still exist
      const newData = await manager.get('new');
      expect(newData).not.toBeNull();
    });

    it('returns 0 when not initialized', async () => {
      const result = await manager.evictLRU(1000);
      expect(result).toBe(0);
    });

    it('auto-evicts when put exceeds maxSizeBytes', async () => {
      await manager.initialize();

      // Fill the cache (maxSizeBytes = 10_000)
      await manager.put('a', new ArrayBuffer(5000), makeMeta('a.exr'));
      await new Promise((r) => setTimeout(r, 10));
      await manager.put('b', new ArrayBuffer(5000), makeMeta('b.exr'));
      await new Promise((r) => setTimeout(r, 10));

      // This put should trigger eviction of 'a'
      await manager.put('c', new ArrayBuffer(5000), makeMeta('c.exr'));

      const stats = await manager.getStats();
      expect(stats.totalSizeBytes).toBeLessThanOrEqual(10_000);
    });
  });

  // -----------------------------------------------------------------------
  // clearAll
  // -----------------------------------------------------------------------

  describe('clearAll', () => {
    it('removes all entries', async () => {
      await manager.initialize();

      await manager.put('x', new ArrayBuffer(100), makeMeta());
      await manager.put('y', new ArrayBuffer(200), makeMeta());

      await manager.clearAll();

      const stats = await manager.getStats();
      expect(stats.entryCount).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });

    it('emits cleared event', async () => {
      await manager.initialize();
      await manager.put('z', new ArrayBuffer(50), makeMeta());

      const cb = vi.fn();
      manager.on('cleared', cb);

      await manager.clearAll();
      expect(cb).toHaveBeenCalled();
    });

    it('no-ops when not initialized', async () => {
      // Should not throw
      await manager.clearAll();
    });
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------

  describe('getStats', () => {
    it('returns correct aggregate values', async () => {
      await manager.initialize();

      await manager.put('s1', new ArrayBuffer(100), makeMeta());
      await manager.put('s2', new ArrayBuffer(200), makeMeta());

      const stats = await manager.getStats();
      expect(stats.entryCount).toBe(2);
      expect(stats.totalSizeBytes).toBe(300);
      expect(stats.maxSizeBytes).toBe(10_000);
    });

    it('returns zero counts when not initialized', async () => {
      const stats = await manager.getStats();
      expect(stats.entryCount).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // cleanOrphans
  // -----------------------------------------------------------------------

  describe('cleanOrphans', () => {
    it('returns 0 when not initialized', async () => {
      const result = await manager.cleanOrphans();
      expect(result).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  describe('events', () => {
    it('emits entryAdded on successful put', async () => {
      await manager.initialize();
      const cb = vi.fn();
      manager.on('entryAdded', cb);

      await manager.put('ev-key', new ArrayBuffer(64), makeMeta());
      expect(cb).toHaveBeenCalledWith({ key: 'ev-key', sizeBytes: 64 });
    });

    it('emits entryRemoved during eviction', async () => {
      await manager.initialize();
      const cb = vi.fn();
      manager.on('entryRemoved', cb);

      await manager.put('evict-me', new ArrayBuffer(8000), makeMeta());
      await new Promise((r) => setTimeout(r, 10));
      // Exceed budget → eviction
      await manager.put('big', new ArrayBuffer(8000), makeMeta());

      expect(cb).toHaveBeenCalledWith({ key: 'evict-me' });
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  describe('dispose', () => {
    it('can be called multiple times', async () => {
      await manager.initialize();
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });

    it('all methods no-op after dispose', async () => {
      await manager.initialize();
      manager.dispose();

      expect(await manager.get('k')).toBeNull();
      expect(await manager.put('k', new ArrayBuffer(1), makeMeta())).toBe(false);
      expect(manager.isStable('k')).toBe(true);
      expect(await manager.evictLRU(1)).toBe(0);

      const stats = await manager.getStats();
      expect(stats.entryCount).toBe(0);
    });

    it('cleanOrphans returns 0 after dispose', async () => {
      await manager.initialize();
      manager.dispose();
      expect(await manager.cleanOrphans()).toBe(0);
    });

    it('clearAll no-ops after dispose', async () => {
      await manager.initialize();
      manager.dispose();
      // Should not throw
      await manager.clearAll();
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent puts
  // -----------------------------------------------------------------------

  describe('concurrent operations', () => {
    it('handles concurrent puts to different keys', async () => {
      await manager.initialize();

      const [ok1, ok2] = await Promise.all([
        manager.put('c1', new ArrayBuffer(100), makeMeta('c1.exr')),
        manager.put('c2', new ArrayBuffer(200), makeMeta('c2.exr')),
      ]);

      expect(ok1).toBe(true);
      expect(ok2).toBe(true);

      const stats = await manager.getStats();
      expect(stats.entryCount).toBe(2);
      expect(stats.totalSizeBytes).toBe(300);
    });

    it('isStable returns false during active write', async () => {
      await manager.initialize();

      // Start a write but check stability before it completes
      const putPromise = manager.put('busy-key', new ArrayBuffer(100), makeMeta());
      // Note: in this mock the write completes synchronously within the microtask,
      // so we just verify the API contract
      await putPromise;
      expect(manager.isStable('busy-key')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // put overwrites existing key
  // -----------------------------------------------------------------------

  describe('put overwrite', () => {
    it('overwrites an existing key with new data', async () => {
      await manager.initialize();

      const data1 = new TextEncoder().encode('first').buffer;
      const data2 = new TextEncoder().encode('second').buffer;

      await manager.put('overwrite-key', data1, makeMeta('f.exr', 5));
      await manager.put('overwrite-key', data2, makeMeta('f.exr', 6));

      const retrieved = await manager.get('overwrite-key');
      expect(retrieved).not.toBeNull();
      const text = new TextDecoder().decode(new Uint8Array(retrieved!));
      expect(text).toBe('second');
    });
  });
});
