import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransitionRenderer } from './TransitionRenderer';

// Create a comprehensive mock WebGL2 context matching the project's pattern
function createMockGL(): WebGL2RenderingContext {
  const mockTexture = {} as WebGLTexture;
  const mockFBO = {} as WebGLFramebuffer;
  const mockVAO = {} as WebGLVertexArrayObject;
  const mockBuffer = {} as WebGLBuffer;
  const mockProgram = {} as WebGLProgram;
  const mockShader = {} as WebGLShader;

  return {
    TEXTURE_2D: 0x0DE1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812F,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    TRIANGLE_STRIP: 0x0005,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,
    FLOAT: 0x1406,
    TEXTURE0: 0x84C0,
    TEXTURE1: 0x84C1,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,

    createTexture: vi.fn(() => mockTexture),
    createFramebuffer: vi.fn(() => mockFBO),
    createVertexArray: vi.fn(() => mockVAO),
    createBuffer: vi.fn(() => mockBuffer),
    createProgram: vi.fn(() => mockProgram),
    createShader: vi.fn(() => mockShader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn(() => 1),
    getAttribLocation: vi.fn(() => 0),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    viewport: vi.fn(),
    activeTexture: vi.fn(),
    bindVertexArray: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

describe('TransitionRenderer', () => {
  let renderer: TransitionRenderer;

  beforeEach(() => {
    renderer = new TransitionRenderer();
  });

  it('TR-U001: starts uninitialized', () => {
    expect(renderer.isInitialized()).toBe(false);
  });

  it('TR-U002: initializes with WebGL context', () => {
    const gl = createMockGL();
    renderer.initialize(gl);
    expect(renderer.isInitialized()).toBe(true);
  });

  it('TR-U003: dispose cleans up resources', () => {
    const gl = createMockGL();
    renderer.initialize(gl);
    renderer.dispose();
    expect(renderer.isInitialized()).toBe(false);
  });

  it('TR-U004: getFBOA returns null when not initialized', () => {
    expect(renderer.getFBOA(100, 100)).toBeNull();
  });

  it('TR-U005: getFBOB returns null when not initialized', () => {
    expect(renderer.getFBOB(100, 100)).toBeNull();
  });

  it('TR-U006: dispose is safe to call multiple times', () => {
    renderer.dispose();
    renderer.dispose();
    expect(renderer.isInitialized()).toBe(false);
  });

  it('TR-U007: dispose after initialize is safe to call multiple times', () => {
    const gl = createMockGL();
    renderer.initialize(gl);
    renderer.dispose();
    renderer.dispose();
    expect(renderer.isInitialized()).toBe(false);
  });

  it('TR-U008: getFBOA returns FBO when initialized', () => {
    const gl = createMockGL();
    renderer.initialize(gl);
    const result = renderer.getFBOA(640, 480);
    expect(result).not.toBeNull();
    expect(result!.fbo).toBeDefined();
    expect(result!.texture).toBeDefined();
  });

  it('TR-U009: getFBOB returns FBO when initialized', () => {
    const gl = createMockGL();
    renderer.initialize(gl);
    const result = renderer.getFBOB(640, 480);
    expect(result).not.toBeNull();
    expect(result!.fbo).toBeDefined();
    expect(result!.texture).toBeDefined();
  });

  it('TR-U010: FBOs are reused when dimensions match', () => {
    const gl = createMockGL();
    renderer.initialize(gl);
    const first = renderer.getFBOA(640, 480);
    const second = renderer.getFBOA(640, 480);
    // The underlying FBO and texture objects should be the same references
    expect(first!.fbo).toBe(second!.fbo);
    expect(first!.texture).toBe(second!.texture);
    // createFramebuffer should only have been called twice (A + B), not four times
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(2);
  });

  it('TR-U011: FBOs are recreated when dimensions change', () => {
    const gl = createMockGL();
    // Return unique objects for each call to detect re-creation
    let fboCount = 0;
    gl.createFramebuffer = vi.fn(() => ({ id: fboCount++ }) as unknown as WebGLFramebuffer);
    let texCount = 0;
    gl.createTexture = vi.fn(() => ({ id: texCount++ }) as unknown as WebGLTexture);

    renderer.initialize(gl);
    const first = renderer.getFBOA(640, 480);
    const second = renderer.getFBOA(800, 600);
    expect(first!.fbo).not.toBe(second!.fbo);
  });

  it('TR-U012: renderTransitionFrame does nothing when not initialized', () => {
    const texA = {} as WebGLTexture;
    const texB = {} as WebGLTexture;
    // Should not throw
    renderer.renderTransitionFrame(texA, texB, { type: 'crossfade', durationFrames: 12 }, 0.5, 640, 480);
  });

  it('TR-U013: renderTransitionFrame sets up shader and draws quad', () => {
    const gl = createMockGL();
    renderer.initialize(gl);

    const texA = {} as WebGLTexture;
    const texB = {} as WebGLTexture;
    renderer.renderTransitionFrame(texA, texB, { type: 'crossfade', durationFrames: 12 }, 0.5, 640, 480);

    expect(gl.useProgram).toHaveBeenCalled();
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE0);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE1);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLE_STRIP, 0, 4);
  });

  it('TR-U014: renderTransitionFrame sets correct uniform for wipe-left', () => {
    const gl = createMockGL();
    renderer.initialize(gl);

    const texA = {} as WebGLTexture;
    const texB = {} as WebGLTexture;
    renderer.renderTransitionFrame(texA, texB, { type: 'wipe-left', durationFrames: 24 }, 0.75, 1920, 1080);

    // u_transitionType should be set to 2 for wipe-left
    expect(gl.uniform1i).toHaveBeenCalledWith(expect.anything(), 2);
    // u_progress should be set to 0.75
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 0.75);
  });

  it('TR-U015: dispose deletes all GPU resources', () => {
    const gl = createMockGL();
    renderer.initialize(gl);

    // Allocate FBOs
    renderer.getFBOA(640, 480);

    renderer.dispose();

    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2); // fboA + fboB
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2); // texA + texB
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1); // shader dispose
  });

  it('TR-U016: renderTransitionFrame binds both input textures', () => {
    const gl = createMockGL();
    renderer.initialize(gl);

    const texA = { name: 'texA' } as unknown as WebGLTexture;
    const texB = { name: 'texB' } as unknown as WebGLTexture;
    renderer.renderTransitionFrame(texA, texB, { type: 'dissolve', durationFrames: 10 }, 0.3, 800, 600);

    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, texA);
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, texB);
  });

  it('TR-U017: renderTransitionFrame at progress 0.0 sets uniform to 0.0', () => {
    const gl = createMockGL();
    renderer.initialize(gl);

    const texA = {} as WebGLTexture;
    const texB = {} as WebGLTexture;
    renderer.renderTransitionFrame(texA, texB, { type: 'crossfade', durationFrames: 12 }, 0.0, 640, 480);

    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 0.0);
  });

  it('TR-U018: renderTransitionFrame at progress 1.0 sets uniform to 1.0', () => {
    const gl = createMockGL();
    renderer.initialize(gl);

    const texA = {} as WebGLTexture;
    const texB = {} as WebGLTexture;
    renderer.renderTransitionFrame(texA, texB, { type: 'crossfade', durationFrames: 12 }, 1.0, 640, 480);

    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 1.0);
  });

  it('TR-U019: re-initialize after dispose works', () => {
    const gl = createMockGL();
    renderer.initialize(gl);
    renderer.dispose();
    expect(renderer.isInitialized()).toBe(false);

    renderer.initialize(gl);
    expect(renderer.isInitialized()).toBe(true);

    const fbo = renderer.getFBOA(640, 480);
    expect(fbo).not.toBeNull();
  });

  it('TR-U020: getFBOA and getFBOB return different FBOs', () => {
    const gl = createMockGL();
    let fboCount = 0;
    gl.createFramebuffer = vi.fn(() => ({ id: fboCount++ }) as unknown as WebGLFramebuffer);
    let texCount = 0;
    gl.createTexture = vi.fn(() => ({ id: texCount++ }) as unknown as WebGLTexture);

    renderer.initialize(gl);
    const fboA = renderer.getFBOA(640, 480);
    const fboB = renderer.getFBOB(640, 480);

    expect(fboA).not.toBeNull();
    expect(fboB).not.toBeNull();
    expect(fboA!.fbo).not.toBe(fboB!.fbo);
    expect(fboA!.texture).not.toBe(fboB!.texture);
  });
});
