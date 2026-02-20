/**
 * LuminanceAnalyzer Tests
 *
 * Tests for algorithmic logic: default values, clamping math, NaN/Infinity
 * handling, firstFrame flag, fence timeout behavior, dispose safety,
 * and one-frame latency.
 *
 * All WebGL2 APIs are mocked since tests run outside a browser context.
 * The mock is kept minimal -- only methods exercised by the code paths
 * under test are stubbed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LuminanceAnalyzer } from './LuminanceAnalyzer';

// Mock the ShaderProgram class
vi.mock('./ShaderProgram', () => ({
  ShaderProgram: vi.fn().mockImplementation(() => ({
    use: vi.fn(),
    setUniformInt: vi.fn(),
    getAttributeLocation: vi.fn().mockReturnValue(0),
    dispose: vi.fn(),
  })),
}));

// Mock the GLSL import
vi.mock('./shaders/luminance.frag.glsl?raw', () => ({ default: 'mock shader source' }));

/**
 * Create a minimal mock WebGL2RenderingContext.
 *
 * Only the methods actually called by LuminanceAnalyzer are stubbed.
 * `readbackPixels` controls the Float32Array returned by getBufferSubData.
 * `clientWaitSyncStatus` controls the value returned by clientWaitSync.
 * `extensionAvailable` controls whether EXT_color_buffer_float is present.
 */
function createMockGL(opts: {
  extensionAvailable?: boolean;
  clientWaitSyncStatus?: number;
  readbackPixels?: Float32Array;
} = {}) {
  const {
    extensionAvailable = true,
    clientWaitSyncStatus,
    readbackPixels,
  } = opts;

  const constants = {
    FRAMEBUFFER_BINDING: 0x8ca6,
    VIEWPORT: 0x0ba2,
    CURRENT_PROGRAM: 0x8b8d,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    PIXEL_PACK_BUFFER: 0x88eb,
    ARRAY_BUFFER: 0x8892,
    RGBA: 0x1908,
    RGBA16F: 0x881a,
    FLOAT: 0x1406,
    STATIC_DRAW: 0x88e4,
    STREAM_READ: 0x88e1,
    TRIANGLE_STRIP: 0x0005,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    CLAMP_TO_EDGE: 0x812f,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    SYNC_FLUSH_COMMANDS_BIT: 0x0001,
    ALREADY_SIGNALED: 0x911a,
    CONDITION_SATISFIED: 0x911c,
    TIMEOUT_EXPIRED: 0x911b,
    WAIT_FAILED: 0x911d,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
  };

  const resolvedClientWaitStatus = clientWaitSyncStatus ?? constants.ALREADY_SIGNALED;

  const gl = {
    ...constants,

    getExtension: vi.fn((name: string) =>
      name === 'EXT_color_buffer_float' && extensionAvailable ? {} : null,
    ),

    getParameter: vi.fn((param: number) => {
      if (param === constants.FRAMEBUFFER_BINDING) return null;
      if (param === constants.VIEWPORT) return new Int32Array([0, 0, 800, 600]);
      if (param === constants.CURRENT_PROGRAM) return null;
      return null;
    }),

    // Resource creation -- all return distinct truthy objects
    createTexture: vi.fn(() => ({})),
    createFramebuffer: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    fenceSync: vi.fn(() => ({})),

    // Binding / state
    bindTexture: vi.fn(),
    bindFramebuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bindVertexArray: vi.fn(),
    activeTexture: vi.fn(),
    useProgram: vi.fn(),

    // Texture
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    framebufferTexture2D: vi.fn(),
    generateMipmap: vi.fn(),

    // Buffer
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    // Draw
    viewport: vi.fn(),
    drawArrays: vi.fn(),

    // Readback
    readPixels: vi.fn(),
    getBufferSubData: vi.fn((_target: number, _offset: number, dest: Float32Array) => {
      const src = readbackPixels ?? new Float32Array([Math.log(0.18), 0.5, 0, 1]);
      dest.set(src);
    }),

    // Sync
    clientWaitSync: vi.fn(() => resolvedClientWaitStatus),
    deleteSync: vi.fn(),

    // Deletion
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),

    // Shader-related (for ShaderProgram mock constructor)
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    getAttribLocation: vi.fn(() => 0),
    uniform1i: vi.fn(),
  } as unknown as WebGL2RenderingContext;

  return gl;
}

describe('LuminanceAnalyzer', () => {
  let gl: WebGL2RenderingContext;
  let analyzer: LuminanceAnalyzer;
  const mockSourceTexture = {} as unknown as WebGLTexture;

  beforeEach(() => {
    vi.clearAllMocks();
    gl = createMockGL();
    analyzer = new LuminanceAnalyzer(gl);
  });

  // =========================================================================
  // Default / initialization
  // =========================================================================

  it('LA-001: returns default cached result { avg: 0.18, linearAvg: 1.0 }', () => {
    const result = analyzer.computeLuminanceStats(mockSourceTexture, 0);
    expect(result).toEqual({ avg: 0.18, linearAvg: 1.0 });
  });

  it('LA-002: returns default when EXT_color_buffer_float is unavailable', () => {
    const noExtGL = createMockGL({ extensionAvailable: false });
    const noExtAnalyzer = new LuminanceAnalyzer(noExtGL);

    const result = noExtAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    expect(result).toEqual({ avg: 0.18, linearAvg: 1.0 });
  });

  it('LA-003: warns when EXT_color_buffer_float is unavailable', () => {
    const noExtGL = createMockGL({ extensionAvailable: false });
    const noExtAnalyzer = new LuminanceAnalyzer(noExtGL);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    noExtAnalyzer.computeLuminanceStats(mockSourceTexture, 0);

    expect(warnSpy).toHaveBeenCalledWith(
      'LuminanceAnalyzer: EXT_color_buffer_float not available',
    );
  });

  // =========================================================================
  // firstFrame flag / PBO readback logic
  // =========================================================================

  it('LA-004: does not read previous PBO on first frame (firstFrame flag)', () => {
    analyzer.computeLuminanceStats(mockSourceTexture, 0);

    // On the very first frame, clientWaitSync should not be called
    // because firstFrame is true and there is no previous PBO result yet.
    expect(gl.clientWaitSync).not.toHaveBeenCalled();
  });

  it('LA-005: updates cached result with valid readback data (exp/clamp math)', () => {
    const logLum = Math.log(0.5);
    const linAvg = 0.3;
    const customGL = createMockGL({
      readbackPixels: new Float32Array([logLum, linAvg, 0, 1]),
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    // Frame 1: starts readback, returns default
    const first = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    expect(first).toEqual({ avg: 0.18, linearAvg: 1.0 });

    // Frame 2: reads previous PBO data, applies exp() and clamping
    const second = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    expect(second.avg).toBeCloseTo(0.5, 5); // exp(log(0.5)) = 0.5
    expect(second.linearAvg).toBeCloseTo(0.3, 5);
  });

  it('LA-006: clamps luminance to [1e-6, 1e6] upper bound', () => {
    const customGL = createMockGL({
      readbackPixels: new Float32Array([100, 1e7, 0, 1]),
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    const result = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);

    expect(result.avg).toBeLessThanOrEqual(1e6);
    expect(result.linearAvg).toBeLessThanOrEqual(1e6);
  });

  it('LA-007: clamps luminance to 1e-6 lower bound', () => {
    const customGL = createMockGL({
      readbackPixels: new Float32Array([-100, 1e-10, 0, 1]),
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    const result = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);

    expect(result.avg).toBeGreaterThanOrEqual(1e-6);
    expect(result.linearAvg).toBeGreaterThanOrEqual(1e-6);
  });

  it('LA-008: keeps cached result when fence returns TIMEOUT_EXPIRED (no stall)', () => {
    const customGL = createMockGL({
      clientWaitSyncStatus: 0x911b, // TIMEOUT_EXPIRED
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    const result = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);

    expect(customGL.getBufferSubData).not.toHaveBeenCalled();
    expect(result).toEqual({ avg: 0.18, linearAvg: 1.0 });
  });

  // =========================================================================
  // NaN / Infinity handling
  // =========================================================================

  it('LA-009: falls back to cached result when readback contains NaN', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const customGL = createMockGL({
      readbackPixels: new Float32Array([NaN, 0.5, 0, 1]),
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    const result = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);

    expect(result).toEqual({ avg: 0.18, linearAvg: 1.0 });
    expect(warnSpy).toHaveBeenCalledWith(
      'LuminanceAnalyzer: NaN/Infinity in readback, using cached result',
    );
  });

  it('LA-010: falls back to cached result when readback contains Infinity', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const customGL = createMockGL({
      readbackPixels: new Float32Array([0.5, Infinity, 0, 1]),
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    const result = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);

    expect(result).toEqual({ avg: 0.18, linearAvg: 1.0 });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('LA-011: warns only once for repeated NaN/Infinity readbacks', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const customGL = createMockGL({
      readbackPixels: new Float32Array([NaN, NaN, 0, 1]),
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0); // frame 1
    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0); // frame 2 - reads NaN
    customAnalyzer.computeLuminanceStats(mockSourceTexture, 0); // frame 3 - reads NaN again

    const nanWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('NaN/Infinity'),
    );
    expect(nanWarnings).toHaveLength(1);
  });

  // =========================================================================
  // Dispose safety
  // =========================================================================

  it('LA-012a: dispose without prior init does not throw', () => {
    expect(() => analyzer.dispose()).not.toThrow();
  });

  it('LA-012b: double dispose does not throw', () => {
    analyzer.computeLuminanceStats(mockSourceTexture, 0);
    analyzer.dispose();
    expect(() => analyzer.dispose()).not.toThrow();
  });

  // =========================================================================
  // Multi-frame latency
  // =========================================================================

  it('LA-013: returns one-frame-delayed result (latency by design)', () => {
    const logLum = Math.log(0.42);
    const linAvg = 0.65;
    const customGL = createMockGL({
      readbackPixels: new Float32Array([logLum, linAvg, 0, 1]),
    });
    const customAnalyzer = new LuminanceAnalyzer(customGL);

    // Frame 1: starts readback, returns default
    const frame1 = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    expect(frame1).toEqual({ avg: 0.18, linearAvg: 1.0 });

    // Frame 2: reads frame 1 result, starts new readback
    const frame2 = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    expect(frame2.avg).toBeCloseTo(0.42, 4);
    expect(frame2.linearAvg).toBeCloseTo(0.65, 5);

    // Frame 3: reads frame 2 result (same pixels, same answer)
    const frame3 = customAnalyzer.computeLuminanceStats(mockSourceTexture, 0);
    expect(frame3.avg).toBeCloseTo(0.42, 4);
    expect(frame3.linearAvg).toBeCloseTo(0.65, 5);
  });
});
