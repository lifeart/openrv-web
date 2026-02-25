/**
 * MediaCacheManager - OPFS-backed media cache with IndexedDB manifest.
 *
 * Stores binary media blobs in the Origin Private File System (OPFS) and
 * tracks metadata in an IndexedDB manifest for fast lookups and LRU eviction.
 *
 * Designed to degrade gracefully: when OPFS or IndexedDB is unavailable,
 * all public methods become safe no-ops.
 */

import { EventEmitter } from '../utils/EventEmitter';
import type { EventMap } from '../utils/EventEmitter';
import { Logger } from '../utils/Logger';

const log = new Logger('MediaCacheManager');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CacheConfig {
  /** Maximum total cache size in bytes. Default: 2 GB. */
  maxSizeBytes: number;
  /** OPFS root directory name. Default: 'openrv-cache'. */
  opfsRootDir: string;
  /** IndexedDB database name. Default: 'openrv-web-media-cache'. */
  dbName: string;
}

export interface CacheEntryMeta {
  fileName: string;
  fileSize: number;
  lastModified: number;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface CacheManifestEntry {
  key: string;
  meta: CacheEntryMeta;
  sizeBytes: number;
  cachedAt: number;
  lastAccessedAt: number;
}

export interface CacheStats {
  totalSizeBytes: number;
  entryCount: number;
  maxSizeBytes: number;
}

export interface CacheManagerEvents extends EventMap {
  error: { message: string; key?: string };
  entryAdded: { key: string; sizeBytes: number };
  entryRemoved: { key: string };
  cleared: void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CacheConfig = {
  maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  opfsRootDir: 'openrv-cache',
  dbName: 'openrv-web-media-cache',
};

const MANIFEST_STORE = 'manifest';
const DB_VERSION = 1;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class MediaCacheManager extends EventEmitter<CacheManagerEvents> {
  private config: CacheConfig;
  private db: IDBDatabase | null = null;
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private mediaDir: FileSystemDirectoryHandle | null = null;
  private initialized = false;
  private pendingWrites = new Set<string>();

  constructor(config?: Partial<CacheConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  /**
   * Initialize OPFS and IndexedDB.
   * Returns `false` when OPFS is not available (all subsequent calls become no-ops).
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // 1. Open OPFS root
      if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
        log.warn('OPFS not available – caching disabled');
        return false;
      }

      const storageRoot = await navigator.storage.getDirectory();
      this.opfsRoot = await storageRoot.getDirectoryHandle(this.config.opfsRootDir, { create: true });
      this.mediaDir = await this.opfsRoot.getDirectoryHandle('media', { create: true });

      // 2. Open IndexedDB
      this.db = await this.openDB();

      this.initialized = true;
      log.info('MediaCacheManager initialized');
      return true;
    } catch (err) {
      log.error('Initialization failed:', err);
      this.emit('error', { message: `Initialization failed: ${String(err)}` });
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Read / Write
  // -----------------------------------------------------------------------

  /**
   * Retrieve cached data by key. Returns `null` on miss or when not initialized.
   */
  async get(cacheKey: string): Promise<ArrayBuffer | null> {
    if (!this.initialized || !this.mediaDir || !this.db) return null;

    try {
      const fileHandle = await this.mediaDir.getFileHandle(`${cacheKey}.bin`);
      const file = await fileHandle.getFile();
      const buffer = await file.arrayBuffer();

      // Touch lastAccessedAt in manifest
      await this.touchEntry(cacheKey);

      return buffer;
    } catch (_err) {
      // File not found is expected (cache miss)
      return null;
    }
  }

  /**
   * Store data under `cacheKey`. Triggers LRU eviction if needed.
   * Returns `true` on success.
   */
  async put(
    cacheKey: string,
    data: ArrayBuffer,
    meta: CacheEntryMeta,
  ): Promise<boolean> {
    if (!this.initialized || !this.mediaDir || !this.db) return false;

    this.pendingWrites.add(cacheKey);

    try {
      const sizeBytes = data.byteLength;

      // Evict if needed
      const stats = await this.getStats();
      const spaceNeeded = stats.totalSizeBytes + sizeBytes - this.config.maxSizeBytes;
      if (spaceNeeded > 0) {
        await this.evictLRU(spaceNeeded);
      }

      // Write to OPFS
      await this.writeFile(cacheKey, data);

      // Write manifest entry
      const entry: CacheManifestEntry = {
        key: cacheKey,
        meta,
        sizeBytes,
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      };
      await this.putManifestEntry(entry);

      this.emit('entryAdded', { key: cacheKey, sizeBytes });
      return true;
    } catch (err) {
      log.error('put() failed:', err);
      this.emit('error', { message: `put failed: ${String(err)}`, key: cacheKey });
      return false;
    } finally {
      this.pendingWrites.delete(cacheKey);
    }
  }

  /**
   * Returns `false` while a write for `cacheKey` is in progress.
   */
  isStable(cacheKey: string): boolean {
    return !this.pendingWrites.has(cacheKey);
  }

  // -----------------------------------------------------------------------
  // Eviction
  // -----------------------------------------------------------------------

  /**
   * Evict least-recently-accessed entries until at least `targetFreeBytes`
   * have been freed.  Returns the number of bytes freed.
   */
  async evictLRU(targetFreeBytes: number): Promise<number> {
    if (!this.initialized || !this.db || !this.mediaDir) return 0;

    const entries = await this.getAllManifestEntries();

    // Sort by lastAccessedAt ascending (oldest first)
    entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    let freedBytes = 0;

    for (const entry of entries) {
      if (freedBytes >= targetFreeBytes) break;

      try {
        await this.mediaDir.removeEntry(`${entry.key}.bin`);
      } catch {
        // File may already be gone
      }
      await this.deleteManifestEntry(entry.key);
      freedBytes += entry.sizeBytes;
      this.emit('entryRemoved', { key: entry.key });
    }

    return freedBytes;
  }

  // -----------------------------------------------------------------------
  // Housekeeping
  // -----------------------------------------------------------------------

  /**
   * Remove all cached data and manifest entries.
   */
  async clearAll(): Promise<void> {
    if (!this.initialized || !this.db || !this.opfsRoot) return;

    try {
      // Delete and re-create the media directory
      await this.opfsRoot.removeEntry('media', { recursive: true });
      this.mediaDir = await this.opfsRoot.getDirectoryHandle('media', { create: true });

      // Clear IndexedDB manifest store
      await this.clearManifestStore();

      this.emit('cleared', undefined as unknown as void);
    } catch (err) {
      log.error('clearAll() failed:', err);
      this.emit('error', { message: `clearAll failed: ${String(err)}` });
    }
  }

  /**
   * Get aggregate cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    if (!this.initialized || !this.db) {
      return { totalSizeBytes: 0, entryCount: 0, maxSizeBytes: this.config.maxSizeBytes };
    }

    const entries = await this.getAllManifestEntries();
    const totalSizeBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

    return {
      totalSizeBytes,
      entryCount: entries.length,
      maxSizeBytes: this.config.maxSizeBytes,
    };
  }

  /**
   * Scan OPFS media dir for files that are not in the IndexedDB manifest and
   * delete them. Returns the number of orphans removed.
   */
  async cleanOrphans(): Promise<number> {
    if (!this.initialized || !this.mediaDir || !this.db) return 0;

    const manifestKeys = new Set(
      (await this.getAllManifestEntries()).map((e) => e.key),
    );

    let removed = 0;

    // Iterate over OPFS media directory.
    // FileSystemDirectoryHandle.keys() is standard but not yet in TS lib types;
    // cast to AsyncIterable<string> as a workaround.
    const entries: string[] = [];
    const dirHandle = this.mediaDir as unknown as { keys(): AsyncIterable<string> };
    for await (const name of dirHandle.keys()) {
      entries.push(name);
    }

    for (const name of entries) {
      const key = name.replace(/\.bin$/, '');
      if (!manifestKeys.has(key)) {
        try {
          await this.mediaDir.removeEntry(name);
          removed++;
        } catch {
          // best effort
        }
      }
    }

    return removed;
  }

  /**
   * Release resources. Safe to call multiple times.
   */
  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.opfsRoot = null;
    this.mediaDir = null;
    this.initialized = false;
    this.pendingWrites.clear();
    this.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Internal helpers – OPFS
  // -----------------------------------------------------------------------

  private async writeFile(key: string, data: ArrayBuffer): Promise<void> {
    if (!this.mediaDir) return;

    const writeFn = async () => {
      const fileHandle = await this.mediaDir!.getFileHandle(`${key}.bin`, { create: true });

      // Use createWritable when available (standard OPFS API)
      if ('createWritable' in fileHandle && typeof (fileHandle as unknown as Record<string, unknown>).createWritable === 'function') {
        const writable = await (fileHandle as unknown as { createWritable(): Promise<WritableStream> }).createWritable();
        const writer = writable.getWriter();
        await writer.write(data);
        await writer.close();
      } else {
        // Fallback for environments where createWritable is not available
        // but getFileHandle works (some polyfills / test envs)
        throw new Error('createWritable not supported');
      }
    };

    // Use Web Locks for multi-tab safety if available
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request('opfs-cache-write', writeFn);
    } else {
      await writeFn();
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers – IndexedDB
  // -----------------------------------------------------------------------

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MANIFEST_STORE)) {
          db.createObjectStore(MANIFEST_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private putManifestEntry(entry: CacheManifestEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not open'));
      const tx = this.db.transaction(MANIFEST_STORE, 'readwrite');
      tx.objectStore(MANIFEST_STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private deleteManifestEntry(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not open'));
      const tx = this.db.transaction(MANIFEST_STORE, 'readwrite');
      tx.objectStore(MANIFEST_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private getAllManifestEntries(): Promise<CacheManifestEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction(MANIFEST_STORE, 'readonly');
      const request = tx.objectStore(MANIFEST_STORE).getAll();
      request.onsuccess = () => resolve(request.result as CacheManifestEntry[]);
      request.onerror = () => reject(request.error);
    });
  }

  private touchEntry(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(MANIFEST_STORE, 'readwrite');
      const store = tx.objectStore(MANIFEST_STORE);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const entry = getReq.result as CacheManifestEntry | undefined;
        if (entry) {
          entry.lastAccessedAt = Date.now();
          store.put(entry);
        }
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private clearManifestStore(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(MANIFEST_STORE, 'readwrite');
      tx.objectStore(MANIFEST_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
