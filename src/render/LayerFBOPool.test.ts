/**
 * LayerFBOPool Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LayerFBOPool, MAX_STACK_LAYERS } from './LayerFBOPool';

// --- Minimal WebGL2 mock ---

function createMockGL(): WebGL2RenderingContext {
  let textureId = 1;
  let fboId = 1;
  const deletedTextures: number[] = [];
  const deletedFBOs: number[] = [];

  return {
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    RGBA16F: 0x881a,
    UNSIGNED_BYTE: 0x1401,
    HALF_FLOAT: 0x140b,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    FRAMEBUFFER_COMPLETE: 0x8cd5,

    createTexture: vi.fn(() => textureId++ as unknown as WebGLTexture),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    deleteTexture: vi.fn((tex) => deletedTextures.push(tex as unknown as number)),

    createFramebuffer: vi.fn(() => fboId++ as unknown as WebGLFramebuffer),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5), // FRAMEBUFFER_COMPLETE
    deleteFramebuffer: vi.fn((fbo) => deletedFBOs.push(fbo as unknown as number)),

    // For testing
    _deletedTextures: deletedTextures,
    _deletedFBOs: deletedFBOs,
  } as unknown as WebGL2RenderingContext;
}

describe('LayerFBOPool', () => {
  let pool: LayerFBOPool;
  let gl: WebGL2RenderingContext;

  beforeEach(() => {
    pool = new LayerFBOPool();
    gl = createMockGL();
  });

  describe('MAX_STACK_LAYERS', () => {
    it('is 8', () => {
      expect(MAX_STACK_LAYERS).toBe(8);
    });
  });

  describe('initial state', () => {
    it('starts with size 0', () => {
      expect(pool.size).toBe(0);
    });

    it('starts with zero dimensions', () => {
      expect(pool.width).toBe(0);
      expect(pool.height).toBe(0);
    });

    it('starts with rgba8 format', () => {
      expect(pool.format).toBe('rgba8');
    });
  });

  describe('ensure', () => {
    it('allocates requested number of FBOs', () => {
      const result = pool.ensure(gl, 3, 1920, 1080, 'rgba8');
      expect(result).toBe(true);
      expect(pool.size).toBe(3);
      expect(pool.width).toBe(1920);
      expect(pool.height).toBe(1080);
    });

    it('does not re-allocate when dimensions match', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      const createCalls = (gl.createTexture as ReturnType<typeof vi.fn>).mock.calls.length;

      pool.ensure(gl, 2, 800, 600, 'rgba8');
      // No new textures created
      expect((gl.createTexture as ReturnType<typeof vi.fn>).mock.calls.length).toBe(createCalls);
    });

    it('adds more FBOs when count increases', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      expect(pool.size).toBe(2);

      pool.ensure(gl, 4, 800, 600, 'rgba8');
      expect(pool.size).toBe(4);
    });

    it('re-allocates when dimensions change', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      pool.ensure(gl, 2, 1920, 1080, 'rgba8');
      // Old FBOs should be deleted and new ones created
      expect(pool.width).toBe(1920);
      expect(pool.height).toBe(1080);
    });

    it('re-allocates when format changes', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      pool.ensure(gl, 2, 800, 600, 'rgba16f');
      expect(pool.format).toBe('rgba16f');
    });

    it('clamps count to MAX_STACK_LAYERS', () => {
      pool.ensure(gl, 20, 800, 600, 'rgba8');
      expect(pool.size).toBe(MAX_STACK_LAYERS);
    });

    it('returns false when createTexture fails', () => {
      (gl.createTexture as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      const result = pool.ensure(gl, 1, 800, 600, 'rgba8');
      expect(result).toBe(false);
    });

    it('returns false when createFramebuffer fails', () => {
      (gl.createFramebuffer as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      const result = pool.ensure(gl, 1, 800, 600, 'rgba8');
      expect(result).toBe(false);
    });

    it('returns false when FBO is incomplete', () => {
      (gl.checkFramebufferStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce(0); // Not complete
      const result = pool.ensure(gl, 1, 800, 600, 'rgba8');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('returns FBO entry at valid index', () => {
      pool.ensure(gl, 3, 800, 600, 'rgba8');
      const entry = pool.get(0);
      expect(entry).not.toBeNull();
      expect(entry!.fbo).toBeDefined();
      expect(entry!.texture).toBeDefined();
    });

    it('returns null for out-of-range index', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      expect(pool.get(5)).toBeNull();
    });

    it('returns null for negative index', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      expect(pool.get(-1)).toBeNull();
    });
  });

  describe('shrink', () => {
    it('reduces pool size and deletes excess FBOs', () => {
      pool.ensure(gl, 4, 800, 600, 'rgba8');
      expect(pool.size).toBe(4);

      pool.shrink(gl, 2);
      expect(pool.size).toBe(2);
      // 2 textures and 2 FBOs deleted
      expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
      expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    });

    it('does nothing when count >= current size', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      pool.shrink(gl, 5);
      expect(pool.size).toBe(2);
    });
  });

  describe('dispose', () => {
    it('releases all GPU resources', () => {
      pool.ensure(gl, 3, 800, 600, 'rgba8');
      pool.dispose(gl);

      expect(pool.size).toBe(0);
      expect(pool.width).toBe(0);
      expect(pool.height).toBe(0);
      expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
      expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(3);
    });

    it('is safe to call multiple times', () => {
      pool.ensure(gl, 2, 800, 600, 'rgba8');
      pool.dispose(gl);
      pool.dispose(gl); // Should not throw
      expect(pool.size).toBe(0);
    });
  });
});
