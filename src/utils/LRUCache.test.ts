import { describe, it, expect, vi } from 'vitest';
import { LRUCache } from './LRUCache';

describe('LRUCache', () => {
  describe('basic operations', () => {
    it('LRU-U001: set and get values', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('LRU-U002: returns undefined for missing keys', () => {
      const cache = new LRUCache<string, number>(10);
      expect(cache.get('missing')).toBeUndefined();
    });

    it('LRU-U003: has() returns correct results', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('LRU-U004: size reflects entry count', () => {
      const cache = new LRUCache<string, number>(10);
      expect(cache.size).toBe(0);
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('b', 2);
      expect(cache.size).toBe(2);
    });

    it('LRU-U005: overwriting a key updates the value', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('a', 99);
      expect(cache.get('a')).toBe(99);
      expect(cache.size).toBe(1);
    });
  });

  describe('eviction', () => {
    it('LRU-U006: evicts oldest entry when over capacity', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // should evict 'a'

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
      expect(cache.size).toBe(3);
    });

    it('LRU-U007: get() refreshes access order', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      cache.set('d', 4); // should evict 'b' (now the oldest)

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('LRU-U008: set() on existing key refreshes access order', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to refresh it
      cache.set('a', 10);

      cache.set('d', 4); // should evict 'b' (now the oldest)

      expect(cache.has('a')).toBe(true);
      expect(cache.get('a')).toBe(10);
      expect(cache.has('b')).toBe(false);
    });

    it('LRU-U009: calls onEvict callback when evicting', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>(2, onEvict);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // evicts 'a'

      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith('a', 1);
    });

    it('LRU-U010: maxSize of 1 evicts on every new set', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>(1, onEvict);

      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.size).toBe(1);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(onEvict).toHaveBeenCalledWith('a', 1);
    });
  });

  describe('delete', () => {
    it('LRU-U011: delete removes entry and calls onEvict', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>(10, onEvict);
      cache.set('a', 1);

      const result = cache.delete('a');

      expect(result).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.size).toBe(0);
      expect(onEvict).toHaveBeenCalledWith('a', 1);
    });

    it('LRU-U012: delete returns false for missing key', () => {
      const cache = new LRUCache<string, number>(10);
      expect(cache.delete('missing')).toBe(false);
    });
  });

  describe('clear', () => {
    it('LRU-U013: clear removes all entries', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
    });

    it('LRU-U014: clear calls onEvict for each entry', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>(10, onEvict);
      cache.set('a', 1);
      cache.set('b', 2);

      cache.clear();

      expect(onEvict).toHaveBeenCalledTimes(2);
      expect(onEvict).toHaveBeenCalledWith('a', 1);
      expect(onEvict).toHaveBeenCalledWith('b', 2);
    });
  });

  describe('edge cases', () => {
    it('LRU-U015: constructor clamps maxSize to at least 1', () => {
      const cache = new LRUCache<string, number>(0);
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('b', 2);
      expect(cache.size).toBe(1);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
    });

    it('LRU-U016: works with numeric keys', () => {
      const cache = new LRUCache<number, string>(3);
      cache.set(1, 'one');
      cache.set(2, 'two');
      cache.set(3, 'three');
      cache.set(4, 'four');

      expect(cache.has(1)).toBe(false);
      expect(cache.get(4)).toBe('four');
    });

    it('LRU-U017: onEvict is not called on overwrite', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>(10, onEvict);
      cache.set('a', 1);
      cache.set('a', 2);

      expect(onEvict).not.toHaveBeenCalled();
    });

    it('LRU-U018: sequential eviction order is correct', () => {
      const evicted: string[] = [];
      const cache = new LRUCache<string, number>(2, (key) => {
        evicted.push(key);
      });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // evicts 'a'
      cache.set('d', 4); // evicts 'b'

      expect(evicted).toEqual(['a', 'b']);
    });
  });
});
