/**
 * TextureCacheManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextureCacheManager } from './TextureCacheManager';

// Mock WebGL2RenderingContext
function createMockGL(): WebGL2RenderingContext {
  const textures: object[] = [];
  let textureIdCounter = 1;

  // Create a mock canvas for context loss testing
  const mockCanvas = document.createElement('canvas');

  return {
    // Canvas reference for context loss handling
    canvas: mockCanvas,
    isContextLost: vi.fn(() => false),

    // Format constants
    TEXTURE_2D: 0x0de1,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812f,
    LINEAR: 0x2601,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    RGB8: 0x8051,
    R8: 0x8229,
    RG8: 0x822b,
    RGBA32F: 0x8814,
    RGB32F: 0x8815,
    RG32F: 0x8230,
    R32F: 0x822e,
    RGBA16F: 0x881a,
    RGB16F: 0x881b,
    RG16F: 0x822f,
    R16F: 0x822d,
    R16UI: 0x8234,
    R16I: 0x8233,
    RG16UI: 0x823a,
    RG16I: 0x8239,
    RGB16UI: 0x8d77,
    RGB16I: 0x8d89,
    RGBA16UI: 0x8d76,
    RGBA16I: 0x8d88,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,

    createTexture: vi.fn(() => {
      const tex = { id: textureIdCounter++ };
      textures.push(tex);
      return tex;
    }),
    deleteTexture: vi.fn((tex: object) => {
      const idx = textures.indexOf(tex);
      if (idx >= 0) textures.splice(idx, 1);
    }),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),

    // Helper for tests
    _textures: textures,
  } as unknown as WebGL2RenderingContext;
}

describe('TextureCacheManager', () => {
  let gl: WebGL2RenderingContext;
  let cache: TextureCacheManager;

  beforeEach(() => {
    gl = createMockGL();
    cache = new TextureCacheManager(gl);
  });

  describe('getTexture', () => {
    it('TEX-U001: creates new texture for unknown key', () => {
      const texture = cache.getTexture('frame-1', 1920, 1080);

      expect(texture).toBeDefined();
      expect(gl.createTexture).toHaveBeenCalledTimes(1);
      expect(gl.texImage2D).toHaveBeenCalled();
    });

    it('TEX-U002: returns same texture for same key and dimensions', () => {
      const texture1 = cache.getTexture('frame-1', 1920, 1080);
      const texture2 = cache.getTexture('frame-1', 1920, 1080);

      expect(texture1).toBe(texture2);
      expect(gl.createTexture).toHaveBeenCalledTimes(1);
    });

    it('TEX-U003: creates new texture when dimensions change', () => {
      const texture1 = cache.getTexture('frame-1', 1920, 1080);
      const texture2 = cache.getTexture('frame-1', 1280, 720);

      expect(texture1).not.toBe(texture2);
      expect(gl.createTexture).toHaveBeenCalledTimes(2);
      expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    });

    it('TEX-U004: sets correct texture parameters', () => {
      cache.getTexture('frame-1', 100, 100);

      expect(gl.texParameteri).toHaveBeenCalledWith(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE
      );
      expect(gl.texParameteri).toHaveBeenCalledWith(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE
      );
      expect(gl.texParameteri).toHaveBeenCalledWith(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR
      );
      expect(gl.texParameteri).toHaveBeenCalledWith(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        gl.LINEAR
      );
    });

    it('TEX-U005: uses custom internal format', () => {
      cache.getTexture('frame-1', 100, 100, gl.RGBA32F, gl.RGBA, gl.FLOAT);

      expect(gl.texImage2D).toHaveBeenCalledWith(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        100,
        100,
        0,
        gl.RGBA,
        gl.FLOAT,
        null
      );
    });
  });

  describe('updateTexture', () => {
    it('TEX-U006: updates existing texture with new data', () => {
      cache.getTexture('frame-1', 100, 100);
      const data = new Uint8Array(100 * 100 * 4);

      const result = cache.updateTexture('frame-1', data);

      expect(result).toBe(true);
      expect(gl.texSubImage2D).toHaveBeenCalled();
    });

    it('TEX-U007: returns false for non-existent key', () => {
      const data = new Uint8Array(100);
      const result = cache.updateTexture('non-existent', data);

      expect(result).toBe(false);
      expect(gl.texSubImage2D).not.toHaveBeenCalled();
    });
  });

  describe('hasTexture', () => {
    it('TEX-U008: returns true for cached texture', () => {
      cache.getTexture('frame-1', 100, 100);
      expect(cache.hasTexture('frame-1')).toBe(true);
    });

    it('TEX-U009: returns false for non-cached texture', () => {
      expect(cache.hasTexture('frame-1')).toBe(false);
    });
  });

  describe('getTextureInfo', () => {
    it('TEX-U010: returns texture metadata', () => {
      cache.getTexture('frame-1', 1920, 1080);
      const info = cache.getTextureInfo('frame-1');

      expect(info).toBeDefined();
      expect(info!.width).toBe(1920);
      expect(info!.height).toBe(1080);
      expect(info!.sizeBytes).toBeGreaterThan(0);
    });

    it('TEX-U011: returns null for non-existent key', () => {
      const info = cache.getTextureInfo('non-existent');
      expect(info).toBeNull();
    });
  });

  describe('getMemoryUsage', () => {
    it('TEX-U012: tracks memory usage correctly', () => {
      const usage1 = cache.getMemoryUsage();
      expect(usage1.used).toBe(0);
      expect(usage1.entries).toBe(0);

      cache.getTexture('frame-1', 100, 100);
      const usage2 = cache.getMemoryUsage();

      expect(usage2.used).toBeGreaterThan(0);
      expect(usage2.entries).toBe(1);
    });

    it('TEX-U013: respects max memory configuration', () => {
      const smallCache = new TextureCacheManager(gl, { maxMemoryBytes: 1000, maxEntries: 10 });
      const usage = smallCache.getMemoryUsage();

      expect(usage.max).toBe(1000);
    });
  });

  describe('remove', () => {
    it('TEX-U014: removes texture from cache', () => {
      cache.getTexture('frame-1', 100, 100);
      expect(cache.hasTexture('frame-1')).toBe(true);

      const result = cache.remove('frame-1');

      expect(result).toBe(true);
      expect(cache.hasTexture('frame-1')).toBe(false);
      expect(gl.deleteTexture).toHaveBeenCalled();
    });

    it('TEX-U015: returns false for non-existent key', () => {
      const result = cache.remove('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('TEX-U016: removes all textures', () => {
      cache.getTexture('frame-1', 100, 100);
      cache.getTexture('frame-2', 100, 100);
      cache.getTexture('frame-3', 100, 100);

      cache.clear();

      expect(cache.getMemoryUsage().entries).toBe(0);
      expect(cache.getMemoryUsage().used).toBe(0);
      expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
    });

    it('TEX-U028: clear deletes ALL textures when cache has many entries (regression for map mutation)', () => {
      for (let i = 0; i < 5; i++) {
        cache.getTexture(`tex-${i}`, 100, 100);
      }
      expect(cache.getMemoryUsage().entries).toBe(5);

      cache.clear();

      expect(cache.getMemoryUsage().entries).toBe(0);
      expect(cache.getMemoryUsage().used).toBe(0);
      expect(gl.deleteTexture).toHaveBeenCalledTimes(5);
    });
  });

  describe('LRU eviction', () => {
    it('TEX-U017: evicts least recently used when entry limit exceeded', () => {
      const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

      smallCache.getTexture('frame-1', 10, 10);
      smallCache.getTexture('frame-2', 10, 10);
      smallCache.getTexture('frame-3', 10, 10);

      // Access frame-1 to make it recently used
      smallCache.getTexture('frame-1', 10, 10);

      // Add frame-4, should evict frame-2 (LRU)
      smallCache.getTexture('frame-4', 10, 10);

      expect(smallCache.hasTexture('frame-1')).toBe(true);
      expect(smallCache.hasTexture('frame-2')).toBe(false);
      expect(smallCache.hasTexture('frame-3')).toBe(true);
      expect(smallCache.hasTexture('frame-4')).toBe(true);
    });

    it('TEX-U029: updateTexture refreshes LRU order', () => {
      const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

      smallCache.getTexture('A', 10, 10);
      smallCache.getTexture('B', 10, 10);
      smallCache.getTexture('C', 10, 10);

      // Update A -- refreshes its LRU position to newest
      const data = new Uint8Array(10 * 10 * 4);
      smallCache.updateTexture('A', data);

      // Insert D -- should evict B (now the oldest)
      smallCache.getTexture('D', 10, 10);

      expect(smallCache.hasTexture('A')).toBe(true);  // refreshed via updateTexture
      expect(smallCache.hasTexture('B')).toBe(false); // evicted as oldest
      expect(smallCache.hasTexture('C')).toBe(true);
      expect(smallCache.hasTexture('D')).toBe(true);
    });

    it('TEX-U030: multiple access pattern maintains correct eviction order', () => {
      const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

      smallCache.getTexture('A', 10, 10);
      smallCache.getTexture('B', 10, 10);
      smallCache.getTexture('C', 10, 10);

      // Access in order C -> B -> A (A becomes newest, C becomes oldest)
      smallCache.getTexture('C', 10, 10);
      smallCache.getTexture('B', 10, 10);
      smallCache.getTexture('A', 10, 10);

      // Insert D -- should evict C (the oldest after re-access)
      smallCache.getTexture('D', 10, 10);

      expect(smallCache.hasTexture('C')).toBe(false); // evicted as oldest
      expect(smallCache.hasTexture('B')).toBe(true);
      expect(smallCache.hasTexture('A')).toBe(true);
      expect(smallCache.hasTexture('D')).toBe(true);
    });

    it('TEX-U031: dimension-change re-creation places entry at MRU position', () => {
      const smallCache = new TextureCacheManager(gl, { maxEntries: 3, maxMemoryBytes: 10000000 });

      smallCache.getTexture('A', 10, 10);
      smallCache.getTexture('B', 10, 10);
      smallCache.getTexture('C', 10, 10);

      // Re-create A with different dimensions -- deleteEntry + set puts it at end
      smallCache.getTexture('A', 20, 20);

      // Insert D -- should evict B (oldest after A was re-created)
      smallCache.getTexture('D', 10, 10);

      expect(smallCache.hasTexture('A')).toBe(true);  // re-created at MRU position
      expect(smallCache.hasTexture('B')).toBe(false); // evicted as oldest
      expect(smallCache.hasTexture('C')).toBe(true);
      expect(smallCache.hasTexture('D')).toBe(true);
    });

    it('TEX-U032: memory-based eviction respects LRU order', () => {
      // 10x10 RGBA8 = 400 bytes; limit allows ~2 entries
      const smallCache = new TextureCacheManager(gl, { maxMemoryBytes: 800, maxEntries: 100 });

      smallCache.getTexture('A', 10, 10); // 400 bytes
      smallCache.getTexture('B', 10, 10); // 400 bytes (total: 800)

      // Access A to refresh it
      smallCache.getTexture('A', 10, 10);

      // Insert C -- exceeds memory, should evict B (the oldest)
      smallCache.getTexture('C', 10, 10);

      expect(smallCache.hasTexture('A')).toBe(true);  // refreshed, survived
      expect(smallCache.hasTexture('B')).toBe(false); // evicted as oldest
      expect(smallCache.hasTexture('C')).toBe(true);
    });

    it('TEX-U033: sequential evictions evict in correct oldest-first order', () => {
      const smallCache = new TextureCacheManager(gl, { maxEntries: 2, maxMemoryBytes: 10000000 });

      smallCache.getTexture('A', 10, 10);
      smallCache.getTexture('B', 10, 10);

      // Access A so B is oldest
      smallCache.getTexture('A', 10, 10);

      // Add C -- evicts B (oldest)
      smallCache.getTexture('C', 10, 10);
      expect(smallCache.hasTexture('B')).toBe(false);
      expect(smallCache.hasTexture('A')).toBe(true);

      // Add D -- evicts A (now oldest; C is newer)
      smallCache.getTexture('D', 10, 10);
      expect(smallCache.hasTexture('A')).toBe(false);
      expect(smallCache.hasTexture('C')).toBe(true);
      expect(smallCache.hasTexture('D')).toBe(true);
    });

    it('TEX-U034: maxEntries 0 does not cause infinite loop', () => {
      const zeroCache = new TextureCacheManager(gl, { maxEntries: 0, maxMemoryBytes: 10000000 });

      // Should not hang -- ensureCapacity is a no-op on empty cache, entry is added
      const texture = zeroCache.getTexture('A', 10, 10);
      expect(texture).toBeDefined();
      expect(zeroCache.getMemoryUsage().entries).toBe(1);

      // Second insert: ensureCapacity evicts A (size 1 >= 0, size > 0), then B is added
      const texture2 = zeroCache.getTexture('B', 10, 10);
      expect(texture2).toBeDefined();
      expect(zeroCache.getMemoryUsage().entries).toBe(1);
      expect(zeroCache.hasTexture('A')).toBe(false);
      expect(zeroCache.hasTexture('B')).toBe(true);
    });

    it('TEX-U018: evicts when memory limit exceeded', () => {
      // Small memory limit that can only hold ~2 small textures
      const smallCache = new TextureCacheManager(gl, { maxMemoryBytes: 800, maxEntries: 100 });

      smallCache.getTexture('frame-1', 10, 10); // ~400 bytes (10*10*4)
      smallCache.getTexture('frame-2', 10, 10); // ~400 bytes

      // This should trigger eviction
      smallCache.getTexture('frame-3', 10, 10);

      expect(smallCache.getMemoryUsage().entries).toBeLessThanOrEqual(2);
    });
  });

  describe('dispose', () => {
    it('TEX-U019: releases all resources', () => {
      cache.getTexture('frame-1', 100, 100);
      cache.getTexture('frame-2', 100, 100);

      cache.dispose();

      expect(cache.getMemoryUsage().entries).toBe(0);
      expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    });
  });

  describe('texture format memory calculation', () => {
    it('TEX-U020: calculates RGBA8 size correctly', () => {
      cache.getTexture('test', 100, 100, gl.RGBA8);
      const info = cache.getTextureInfo('test');
      expect(info!.sizeBytes).toBe(100 * 100 * 4);
    });

    it('TEX-U021: calculates RGBA32F size correctly', () => {
      cache.getTexture('test', 100, 100, gl.RGBA32F);
      const info = cache.getTextureInfo('test');
      expect(info!.sizeBytes).toBe(100 * 100 * 16);
    });

    it('TEX-U022: calculates R8 size correctly', () => {
      cache.getTexture('test', 100, 100, gl.R8);
      const info = cache.getTextureInfo('test');
      expect(info!.sizeBytes).toBe(100 * 100 * 1);
    });
  });

  describe('context loss handling', () => {
    it('TEX-U023: isContextValid returns true initially', () => {
      expect(cache.isContextValid()).toBe(true);
    });

    it('TEX-U024: handles context loss by clearing cache', () => {
      cache.getTexture('frame-1', 100, 100);
      cache.getTexture('frame-2', 100, 100);

      expect(cache.getMemoryUsage().entries).toBe(2);

      // Simulate context loss
      const canvas = gl.canvas as HTMLCanvasElement;
      const event = new Event('webglcontextlost');
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      canvas.dispatchEvent(event);

      expect(cache.getMemoryUsage().entries).toBe(0);
      expect(cache.getMemoryUsage().used).toBe(0);
    });

    it('TEX-U025: throws error when creating texture after context loss', () => {
      // Simulate context loss
      const canvas = gl.canvas as HTMLCanvasElement;
      const event = new Event('webglcontextlost');
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      canvas.dispatchEvent(event);

      expect(() => cache.getTexture('frame-new', 100, 100)).toThrow('WebGL context lost');
    });

    it('TEX-U026: recovers after context restored', () => {
      // Simulate context loss
      const canvas = gl.canvas as HTMLCanvasElement;
      const lostEvent = new Event('webglcontextlost');
      Object.defineProperty(lostEvent, 'preventDefault', { value: vi.fn() });
      canvas.dispatchEvent(lostEvent);

      expect(cache.isContextValid()).toBe(false);

      // Simulate context restored
      canvas.dispatchEvent(new Event('webglcontextrestored'));

      expect(cache.isContextValid()).toBe(true);
      // Should be able to create textures again
      expect(() => cache.getTexture('frame-new', 100, 100)).not.toThrow();
    });

    it('TEX-U027: dispose removes context loss listeners', () => {
      const canvas = gl.canvas as HTMLCanvasElement;
      const removeEventListenerSpy = vi.spyOn(canvas, 'removeEventListener');

      cache.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});
