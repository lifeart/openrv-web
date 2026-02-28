import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FBOPingPong } from '../FBOPingPong';

// Create a mock WebGL2 context with tracking for FBO/texture operations
function createMockGL() {
  let textureId = 0;
  let fboId = 0;

  const mockGL = {
    // Constants
    TEXTURE_2D: 0x0DE1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812F,
    RGBA8: 0x8058,
    RGBA16F: 0x881A,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    HALF_FLOAT: 0x140B,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    FRAMEBUFFER_COMPLETE: 0x8CD5,
    INVALID_INDEX: 0xFFFFFFFF,

    // Methods
    createTexture: vi.fn(() => ({ _id: textureId++ })),
    createFramebuffer: vi.fn(() => ({ _id: fboId++ })),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8CD5), // FRAMEBUFFER_COMPLETE
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    viewport: vi.fn(),
    invalidateFramebuffer: vi.fn(),
  } as unknown as WebGL2RenderingContext;

  return mockGL;
}

describe('FBOPingPong', () => {
  let pingPong: FBOPingPong;

  beforeEach(() => {
    pingPong = new FBOPingPong();
  });

  // ─── A-1: Allocation ──────────────────────────────────────────────

  it('A-1: allocates two FBOs at requested dimensions', () => {
    const gl = createMockGL();
    const result = pingPong.ensure(gl, 1920, 1080);

    expect(result).toBe(true);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(2);
    expect(gl.createTexture).toHaveBeenCalledTimes(2);
    // Verify texImage2D called with correct dimensions
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(gl.texImage2D).mock.calls;
    expect(calls[0]![3]).toBe(1920); // width
    expect(calls[0]![4]).toBe(1080); // height
    expect(calls[1]![3]).toBe(1920);
    expect(calls[1]![4]).toBe(1080);
  });

  it('A-1b: allocates with RGBA8 format by default', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);

    const calls = vi.mocked(gl.texImage2D).mock.calls;
    // texImage2D(target, level, internalFormat, width, height, border, format, type, data)
    // internalFormat should be RGBA8 (0x8058)
    expect(calls[0]![2]).toBe(0x8058);
    // type is arg[7] = UNSIGNED_BYTE (0x1401)
    expect(calls[0]![7]).toBe(0x1401);
  });

  it('A-1c: allocates with RGBA16F format when requested', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480, 'rgba16f');

    const calls = vi.mocked(gl.texImage2D).mock.calls;
    // internalFormat should be RGBA16F (0x881A)
    expect(calls[0]![2]).toBe(0x881A);
    // type is arg[7] = HALF_FLOAT (0x140B)
    expect(calls[0]![7]).toBe(0x140B);
  });

  // ─── A-2: Ping-pong alternation ──────────────────────────────────

  it('A-2: alternates read/write indices for 3 passes', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.resetChain();

    // Pass 1: write to FBO[0], read from FBO[1] (which holds initial data)
    const readTex1 = pingPong.beginPass(gl);
    expect(readTex1).not.toBeNull();
    const writeFBO1 = pingPong.writeFBO;
    pingPong.endPass();

    // Pass 2: write to FBO[1], read from FBO[0]
    const readTex2 = pingPong.beginPass(gl);
    const writeFBO2 = pingPong.writeFBO;
    pingPong.endPass();

    // Pass 3: write to FBO[0], read from FBO[1]
    const readTex3 = pingPong.beginPass(gl);
    const writeFBO3 = pingPong.writeFBO;
    pingPong.endPass();

    // Verify alternation
    expect(writeFBO1).toBe(writeFBO3); // Pass 1 and 3 write to same FBO
    expect(writeFBO1).not.toBe(writeFBO2); // Pass 1 and 2 write to different FBOs
    expect(readTex2).not.toBe(readTex1); // Different read textures
    expect(readTex3).not.toBe(readTex2); // Alternating
    expect(readTex3).toBe(readTex1); // Cycles back
  });

  it('A-2b: alternates read/write indices for 4 passes', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.resetChain();

    const writeFBOs: (WebGLFramebuffer | null)[] = [];
    for (let i = 0; i < 4; i++) {
      pingPong.beginPass(gl);
      writeFBOs.push(pingPong.writeFBO);
      pingPong.endPass();
    }

    // FBO[0], FBO[1], FBO[0], FBO[1]
    expect(writeFBOs[0]).toBe(writeFBOs[2]);
    expect(writeFBOs[1]).toBe(writeFBOs[3]);
    expect(writeFBOs[0]).not.toBe(writeFBOs[1]);
  });

  it('A-2c: alternates read/write indices for 5 passes', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.resetChain();

    const writeFBOs: (WebGLFramebuffer | null)[] = [];
    for (let i = 0; i < 5; i++) {
      pingPong.beginPass(gl);
      writeFBOs.push(pingPong.writeFBO);
      pingPong.endPass();
    }

    expect(writeFBOs[0]).toBe(writeFBOs[2]);
    expect(writeFBOs[0]).toBe(writeFBOs[4]);
    expect(writeFBOs[1]).toBe(writeFBOs[3]);
  });

  it('A-2d: alternates read/write indices for 6 passes', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.resetChain();

    const writeFBOs: (WebGLFramebuffer | null)[] = [];
    for (let i = 0; i < 6; i++) {
      pingPong.beginPass(gl);
      writeFBOs.push(pingPong.writeFBO);
      pingPong.endPass();
    }

    expect(writeFBOs[0]).toBe(writeFBOs[2]);
    expect(writeFBOs[0]).toBe(writeFBOs[4]);
    expect(writeFBOs[1]).toBe(writeFBOs[3]);
    expect(writeFBOs[1]).toBe(writeFBOs[5]);
  });

  // ─── A-3: FBO allocation success/failure ─────────────────────────

  it('A-3: ensure returns false on incomplete FBO, true on complete', () => {
    const gl = createMockGL();

    // RGBA16F: always fail
    vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0);
    expect(pingPong.ensure(gl, 640, 480, 'rgba16f')).toBe(false);

    // RGBA8: always succeed
    vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0x8CD5);
    expect(pingPong.ensure(gl, 640, 480, 'rgba8')).toBe(true);
  });

  it('A-3b: returns false when both formats fail', () => {
    const gl = createMockGL();
    // All FBO creations fail
    vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0);

    expect(pingPong.ensure(gl, 640, 480, 'rgba16f')).toBe(false);
    expect(pingPong.ensure(gl, 640, 480, 'rgba8')).toBe(false);
  });

  it('A-3c: returns false when createTexture returns null', () => {
    const gl = createMockGL();
    (gl.createTexture as ReturnType<typeof vi.fn>).mockReturnValue(null);

    expect(pingPong.ensure(gl, 640, 480)).toBe(false);
  });

  it('A-3d: returns false when createFramebuffer returns null', () => {
    const gl = createMockGL();
    (gl.createFramebuffer as ReturnType<typeof vi.fn>).mockReturnValue(null);

    expect(pingPong.ensure(gl, 640, 480)).toBe(false);
  });

  // ─── A-4: Dispose ────────────────────────────────────────────────

  it('A-4: dispose deletes all textures and FBOs', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.dispose(gl);

    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(pingPong.getWidth()).toBe(0);
    expect(pingPong.getHeight()).toBe(0);
  });

  it('A-4b: dispose resets format to default', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480, 'rgba16f');
    expect(pingPong.getFormat()).toBe('rgba16f');
    pingPong.dispose(gl);
    expect(pingPong.getFormat()).toBe('rgba8');
  });

  it('A-4c: dispose is safe to call on empty state', () => {
    const gl = createMockGL();
    // Should not throw
    pingPong.dispose(gl);
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
  });

  // ─── A-5: NEAREST filtering ──────────────────────────────────────

  it('A-5: uses NEAREST filtering by default', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);

    // Check texParameteri calls for NEAREST
    const calls = vi.mocked(gl.texParameteri).mock.calls;

    // Find MIN_FILTER and MAG_FILTER calls
    const minFilterCalls = calls.filter(c => c[1] === gl.TEXTURE_MIN_FILTER);
    const magFilterCalls = calls.filter(c => c[1] === gl.TEXTURE_MAG_FILTER);

    // All MIN and MAG filter calls should use NEAREST
    for (const call of minFilterCalls) {
      expect(call[2]).toBe(gl.NEAREST);
    }
    for (const call of magFilterCalls) {
      expect(call[2]).toBe(gl.NEAREST);
    }
    // Should have 2 MIN + 2 MAG calls (one per texture)
    expect(minFilterCalls).toHaveLength(2);
    expect(magFilterCalls).toHaveLength(2);
  });

  it('A-5b: setFilteringMode switches to LINEAR', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    vi.mocked(gl.texParameteri).mockClear();

    pingPong.setFilteringMode(gl, true);

    const calls = vi.mocked(gl.texParameteri).mock.calls;
    const minFilterCalls = calls.filter(c => c[1] === gl.TEXTURE_MIN_FILTER);
    const magFilterCalls = calls.filter(c => c[1] === gl.TEXTURE_MAG_FILTER);

    for (const call of minFilterCalls) {
      expect(call[2]).toBe(gl.LINEAR);
    }
    for (const call of magFilterCalls) {
      expect(call[2]).toBe(gl.LINEAR);
    }
  });

  it('A-5c: setFilteringMode switches back to NEAREST', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.setFilteringMode(gl, true);
    vi.mocked(gl.texParameteri).mockClear();

    pingPong.setFilteringMode(gl, false);

    const calls = vi.mocked(gl.texParameteri).mock.calls;
    const minFilterCalls = calls.filter(c => c[1] === gl.TEXTURE_MIN_FILTER);
    expect(minFilterCalls.length).toBeGreaterThan(0);
    for (const call of minFilterCalls) {
      expect(call[2]).toBe(gl.NEAREST);
    }
  });

  // ─── A-6: invalidateFramebuffer ──────────────────────────────────

  it('A-6: calls gl.invalidateFramebuffer in beginPass()', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.resetChain();

    pingPong.beginPass(gl);

    expect(gl.invalidateFramebuffer).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      [gl.COLOR_ATTACHMENT0],
    );
  });

  it('A-6b: calls invalidateFramebuffer on each pass', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    pingPong.resetChain();

    pingPong.beginPass(gl);
    pingPong.endPass();
    pingPong.beginPass(gl);
    pingPong.endPass();
    pingPong.beginPass(gl);

    expect(gl.invalidateFramebuffer).toHaveBeenCalledTimes(3);
  });

  // ─── Additional edge cases ────────────────────────────────────────

  it('reuses FBOs when dimensions and format match', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    const firstCallCount = vi.mocked(gl.createFramebuffer).mock.calls.length;

    pingPong.ensure(gl, 640, 480);
    const secondCallCount = vi.mocked(gl.createFramebuffer).mock.calls.length;

    expect(secondCallCount).toBe(firstCallCount); // No new FBOs created
  });

  it('recreates FBOs when dimensions change', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    const firstCallCount = vi.mocked(gl.createFramebuffer).mock.calls.length;

    pingPong.ensure(gl, 1920, 1080);
    const secondCallCount = vi.mocked(gl.createFramebuffer).mock.calls.length;

    expect(secondCallCount).toBeGreaterThan(firstCallCount);
    expect(pingPong.getWidth()).toBe(1920);
    expect(pingPong.getHeight()).toBe(1080);
  });

  it('recreates FBOs when format changes', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480, 'rgba8');
    const firstCallCount = vi.mocked(gl.createFramebuffer).mock.calls.length;

    pingPong.ensure(gl, 640, 480, 'rgba16f');
    const secondCallCount = vi.mocked(gl.createFramebuffer).mock.calls.length;

    expect(secondCallCount).toBeGreaterThan(firstCallCount);
    expect(pingPong.getFormat()).toBe('rgba16f');
  });

  it('beginPass sets viewport to FBO dimensions', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 320, 180);
    pingPong.resetChain();

    pingPong.beginPass(gl);

    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 320, 180);
  });

  it('resetChain resets write index to 0', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);

    // Do some passes
    pingPong.resetChain();
    pingPong.beginPass(gl);
    pingPong.endPass();
    pingPong.beginPass(gl);
    pingPong.endPass();

    // Reset
    pingPong.resetChain();
    const writeFBO1 = pingPong.writeFBO;

    // Do a fresh chain
    pingPong.beginPass(gl);
    const writeFBO2 = pingPong.writeFBO;

    // Should be the same FBO as the first write after reset
    expect(writeFBO1).toBe(writeFBO2);
  });

  it('partial allocation cleanup: second FBO fails, first is cleaned up', () => {
    const gl = createMockGL();
    let fboCallCount = 0;
    (gl.createFramebuffer as ReturnType<typeof vi.fn>).mockImplementation(() => {
      fboCallCount++;
      if (fboCallCount === 1) return { _id: 'fbo0' };
      return null; // second FBO creation fails
    });

    const result = pingPong.ensure(gl, 640, 480);
    expect(result).toBe(false);

    // The first texture should be cleaned up via dispose()
    expect(gl.deleteTexture).toHaveBeenCalled();
  });

  it('beginPass returns null and binds screen when not allocated', () => {
    const gl = createMockGL();
    // No ensure() call — FBOs not allocated
    pingPong.resetChain();
    const readTex = pingPong.beginPass(gl);

    expect(readTex).toBeNull();
    expect(pingPong.writeFBO).toBeNull();
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);
  });

  it('setFilteringMode is a no-op when FBOs are not allocated', () => {
    const gl = createMockGL();
    // No ensure() call — readTexture is null
    pingPong.setFilteringMode(gl, true);

    expect(gl.texParameteri).not.toHaveBeenCalled();
  });

  it('A-6c: beginPass works when gl.invalidateFramebuffer is undefined', () => {
    const gl = createMockGL();
    // Remove invalidateFramebuffer to simulate older/limited WebGL2 contexts
    (gl as any).invalidateFramebuffer = undefined;

    pingPong.ensure(gl, 640, 480);
    pingPong.resetChain();

    // Should not throw
    const readTex = pingPong.beginPass(gl);

    // Should still bind the write FBO and set viewport
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, pingPong.writeFBO);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(readTex).not.toBeNull();
  });

  it('setFilteringMode modifies exactly one texture (the read texture)', () => {
    const gl = createMockGL();
    pingPong.ensure(gl, 640, 480);
    vi.mocked(gl.texParameteri).mockClear();

    pingPong.setFilteringMode(gl, true);

    const minFilterCalls = vi.mocked(gl.texParameteri).mock.calls
      .filter(c => c[1] === gl.TEXTURE_MIN_FILTER);
    const magFilterCalls = vi.mocked(gl.texParameteri).mock.calls
      .filter(c => c[1] === gl.TEXTURE_MAG_FILTER);
    expect(minFilterCalls).toHaveLength(1);
    expect(magFilterCalls).toHaveLength(1);
  });
});
