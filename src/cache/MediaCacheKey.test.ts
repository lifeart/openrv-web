import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeCacheKey, setSubtleCrypto } from './MediaCacheKey';

// jsdom does not provide crypto.subtle. Dynamically import Node's webcrypto.
// @ts-expect-error -- Node built-in module not in browser tsconfig
const nodeCryptoModule = await import('node:crypto') as { webcrypto: Crypto };
const nodeSubtle = nodeCryptoModule.webcrypto.subtle;

/** Helper to create a File with specific content. */
function makeFile(
  name: string,
  content: string,
  options?: { lastModified?: number },
): File {
  return new File([content], name, {
    type: 'application/octet-stream',
    lastModified: options?.lastModified ?? Date.now(),
  });
}

describe('computeCacheKey', () => {
  beforeEach(() => {
    // Inject Node's SubtleCrypto for hashing support
    setSubtleCrypto(nodeSubtle);
  });

  afterEach(() => {
    setSubtleCrypto(null);
  });

  it('returns the same key for the same File object (memoized)', async () => {
    const file = makeFile('test.exr', 'hello world', { lastModified: 1000 });
    const key1 = await computeCacheKey(file);
    const key2 = await computeCacheKey(file);
    expect(key1).toBe(key2);
  });

  it('returns the same key for two Files with identical content and metadata', async () => {
    const content = 'identical content bytes';
    const f1 = makeFile('img.exr', content, { lastModified: 12345 });
    const f2 = makeFile('img.exr', content, { lastModified: 12345 });

    const key1 = await computeCacheKey(f1);
    const key2 = await computeCacheKey(f2);
    expect(key1).toBe(key2);
  });

  it('returns different keys for files with different content', async () => {
    const f1 = makeFile('img.exr', 'content-a', { lastModified: 100 });
    const f2 = makeFile('img.exr', 'content-b', { lastModified: 100 });

    const key1 = await computeCacheKey(f1);
    const key2 = await computeCacheKey(f2);
    expect(key1).not.toBe(key2);
  });

  it('returns different keys for files with different names', async () => {
    const content = 'same content';
    const f1 = makeFile('a.exr', content, { lastModified: 100 });
    const f2 = makeFile('b.exr', content, { lastModified: 100 });

    const key1 = await computeCacheKey(f1);
    const key2 = await computeCacheKey(f2);
    expect(key1).not.toBe(key2);
  });

  it('returns different keys for files with different lastModified', async () => {
    const content = 'same content';
    const f1 = makeFile('a.exr', content, { lastModified: 100 });
    const f2 = makeFile('a.exr', content, { lastModified: 200 });

    const key1 = await computeCacheKey(f1);
    const key2 = await computeCacheKey(f2);
    expect(key1).not.toBe(key2);
  });

  it('returns a hex string key when crypto.subtle is available', async () => {
    const file = makeFile('test.png', 'data', { lastModified: 1 });
    const key = await computeCacheKey(file);
    // SHA-256 hex is 64 characters
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('fallback when crypto.subtle is unavailable', () => {
    beforeEach(() => {
      // Provide a broken SubtleCrypto that simulates unavailability.
      // We can't just set null because the Node process may have its own
      // globalThis.crypto.subtle that bleeds through.
      const brokenSubtle = {
        digest() { throw new Error('subtle unavailable (test)'); },
      } as unknown as SubtleCrypto;
      setSubtleCrypto(brokenSubtle);
    });

    it('returns a fallback key based on metadata', async () => {
      const file = makeFile('fallback.exr', 'data', { lastModified: 42 });
      const key = await computeCacheKey(file);
      expect(key).toContain('fallback-');
      expect(key).toContain('fallback.exr');
      expect(key).toContain('42');
    });

    it('files with same name but different content produce the same fallback key', async () => {
      // Without crypto, content is not part of the key
      const f1 = makeFile('same.exr', 'aaa', { lastModified: 1 });
      const f2 = makeFile('same.exr', 'bbb', { lastModified: 1 });

      const key1 = await computeCacheKey(f1);
      const key2 = await computeCacheKey(f2);
      // Both have same metadata so fallback keys match (expected limitation)
      expect(key1).toBe(key2);
    });

    it('memoizes fallback key per File identity (WeakMap)', async () => {
      const file = makeFile('memo-test.exr', 'data', { lastModified: 99 });
      const key1 = await computeCacheKey(file);
      const key2 = await computeCacheKey(file);
      expect(key1).toBe(key2);
      expect(key1).toContain('fallback-');
    });
  });

  it('handles empty file content', async () => {
    const file = makeFile('empty.exr', '', { lastModified: 0 });
    const key = await computeCacheKey(file);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('handles large file name', async () => {
    const longName = 'a'.repeat(1000) + '.exr';
    const file = makeFile(longName, 'data', { lastModified: 1 });
    const key = await computeCacheKey(file);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
