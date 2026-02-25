import { test, expect } from '@playwright/test';
import {
  loadImageFile,
  loadVideoFile,
  waitForTestHelper,
  getCacheManagerState,
} from './fixtures';

/**
 * OPFS Media Caching Tests
 *
 * Tests for the Origin Private File System (OPFS) media cache feature.
 *
 * Implementation:
 * - src/cache/MediaCacheManager.ts — IndexedDB manifest + OPFS binary blobs
 * - src/cache/MediaCacheKey.ts — SHA-256 cache key generation
 *
 * Features:
 * - Caches image files and sequence frames in OPFS
 * - IndexedDB manifest for metadata
 * - LRU eviction with configurable limit
 * - Graceful degradation when OPFS is unavailable
 */

test.describe('OPFS Media Caching', () => {
  test.describe('MediaCacheManager Initialization', () => {
    test('CACHE-E001: cache manager initializes on app startup', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const state = await getCacheManagerState(page);
      expect(state.initialized).toBe(true);
      expect(state.maxSizeBytes).toBeGreaterThan(0);
    });

    test('CACHE-E002: cache manager starts with empty cache', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Clear cache to ensure clean state
      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
      await page.waitForTimeout(100);

      const state = await getCacheManagerState(page);
      expect(state.entryCount).toBe(0);
      expect(state.totalSizeBytes).toBe(0);
    });

    test('CACHE-E003: cache manager has 2GB default limit', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const state = await getCacheManagerState(page);
      const twoGB = 2 * 1024 * 1024 * 1024;
      expect(state.maxSizeBytes).toBe(twoGB);
    });
  });

  test.describe('Cache Put/Get Operations', () => {
    test('CACHE-E004: can store and retrieve data via cache manager', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const success = await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        if (!cm) return false;

        const testData = new Uint8Array([10, 20, 30, 40, 50]).buffer;
        const key = 'e2e-test-key-' + Date.now();
        const meta = { fileName: 'test.bin', fileSize: 5, lastModified: Date.now() };

        const stored = await cm.put(key, testData, meta);
        if (!stored) return false;

        const retrieved = await cm.get(key);
        if (!retrieved) return false;

        const data = new Uint8Array(retrieved);
        return data.length === 5 && data[0] === 10 && data[4] === 50;
      });

      expect(success).toBe(true);

      // Cleanup
      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
    });

    test('CACHE-E005: cache miss returns null', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const result = await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        if (!cm) return 'no-cm';
        const data = await cm.get('nonexistent-key-12345');
        return data === null ? 'null' : 'found';
      });

      expect(result).toBe('null');
    });

    test('CACHE-E006: storing data updates entry count in stats', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Clear first
      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
      await page.waitForTimeout(100);

      const beforeState = await getCacheManagerState(page);
      expect(beforeState.entryCount).toBe(0);

      // Put an entry
      await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        const data = new Uint8Array(1024).buffer;
        await cm.put('e2e-stats-test', data, {
          fileName: 'stats-test.bin',
          fileSize: 1024,
          lastModified: Date.now(),
        });
      });
      await page.waitForTimeout(100);

      const afterState = await getCacheManagerState(page);
      expect(afterState.entryCount).toBe(1);
      expect(afterState.totalSizeBytes).toBe(1024);

      // Cleanup
      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
    });

    test('CACHE-E007: storing multiple entries accumulates size', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
      await page.waitForTimeout(100);

      await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        const meta = (name: string, size: number) => ({ fileName: name, fileSize: size, lastModified: Date.now() });

        await cm.put('entry-a', new Uint8Array(2048).buffer, meta('a.bin', 2048));
        await cm.put('entry-b', new Uint8Array(4096).buffer, meta('b.bin', 4096));
      });
      await page.waitForTimeout(100);

      const state = await getCacheManagerState(page);
      expect(state.entryCount).toBe(2);
      expect(state.totalSizeBytes).toBe(2048 + 4096);

      // Cleanup
      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
    });
  });

  test.describe('Cache Clear', () => {
    test('CACHE-E008: clearAll removes all entries', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Add some entries
      await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        const meta = { fileName: 'test.bin', fileSize: 512, lastModified: Date.now() };
        await cm.put('clear-test-1', new Uint8Array(512).buffer, meta);
        await cm.put('clear-test-2', new Uint8Array(512).buffer, meta);
      });
      await page.waitForTimeout(100);

      let state = await getCacheManagerState(page);
      expect(state.entryCount).toBe(2);

      // Clear all
      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
      await page.waitForTimeout(100);

      state = await getCacheManagerState(page);
      expect(state.entryCount).toBe(0);
      expect(state.totalSizeBytes).toBe(0);
    });

    test('CACHE-E009: data is gone after clearAll', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Put, clear, then try to get
      const result = await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        const data = new Uint8Array([1, 2, 3]).buffer;
        await cm.put('gone-after-clear', data, {
          fileName: 'test.bin', fileSize: 3, lastModified: Date.now(),
        });
        await cm.clearAll();
        const retrieved = await cm.get('gone-after-clear');
        return retrieved === null;
      });

      expect(result).toBe(true);
    });
  });

  test.describe('Media Loading Integration', () => {
    test('CACHE-E010: loading an image produces no cache errors', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const errors: string[] = [];
      page.on('pageerror', (err) => {
        errors.push(err.message);
      });

      await loadImageFile(page);
      await page.waitForTimeout(500);

      // Check that cache manager is still healthy after image load
      const state = await getCacheManagerState(page);
      expect(state.initialized).toBe(true);

      const cacheErrors = errors.filter(e =>
        e.toLowerCase().includes('cache') || e.toLowerCase().includes('opfs')
      );
      expect(cacheErrors).toHaveLength(0);
    });

    test('CACHE-E011: loading a video produces no cache errors', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      const errors: string[] = [];
      page.on('pageerror', (err) => {
        errors.push(err.message);
      });

      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const state = await getCacheManagerState(page);
      expect(state.initialized).toBe(true);

      const cacheErrors = errors.filter(e =>
        e.toLowerCase().includes('cache') || e.toLowerCase().includes('opfs')
      );
      expect(cacheErrors).toHaveLength(0);
    });

    test('CACHE-E012: cache manager survives app lifecycle without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => {
        errors.push(err.message);
      });

      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      // Perform a series of cache operations
      await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        if (!cm) return;

        const meta = { fileName: 'lifecycle.bin', fileSize: 256, lastModified: Date.now() };
        await cm.put('lifecycle-1', new Uint8Array(256).buffer, meta);
        await cm.get('lifecycle-1');
        await cm.get('nonexistent');
        await cm.getStats();
        await cm.clearAll();
        await cm.getStats();
      });

      const cacheErrors = errors.filter(e =>
        e.toLowerCase().includes('cache') || e.toLowerCase().includes('opfs')
      );
      expect(cacheErrors).toHaveLength(0);

      const state = await getCacheManagerState(page);
      expect(state.initialized).toBe(true);
      expect(state.entryCount).toBe(0);
    });
  });

  test.describe('Cache Overwrite Behavior', () => {
    test('CACHE-E013: putting same key twice overwrites the entry', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);

      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
      await page.waitForTimeout(100);

      const result = await page.evaluate(async () => {
        const cm = (window as any).__OPENRV_TEST__?.mutations?.getCacheManager();
        const key = 'overwrite-test';
        const meta = { fileName: 'test.bin', fileSize: 100, lastModified: Date.now() };

        await cm.put(key, new Uint8Array([1, 2, 3]).buffer, meta);
        await cm.put(key, new Uint8Array([4, 5, 6, 7]).buffer, { ...meta, fileSize: 4 });

        const data = await cm.get(key);
        if (!data) return { entryCount: -1, firstByte: -1 };

        const stats = await cm.getStats();
        return {
          entryCount: stats.entryCount,
          firstByte: new Uint8Array(data)[0],
        };
      });

      // Should have exactly 1 entry, and the data should be from the second put
      expect(result.entryCount).toBe(1);
      expect(result.firstByte).toBe(4);

      // Cleanup
      await page.evaluate(async () => {
        await (window as any).__OPENRV_TEST__?.mutations?.clearCache();
      });
    });
  });
});
