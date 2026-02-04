/**
 * Renderer HDR Output Mode Tests
 *
 * Tests for HDR output mode support in the Renderer class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from './Renderer';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import { DEFAULT_CAPABILITIES } from '../color/DisplayCapabilities';

/**
 * Create a mock WebGL2 context that supports drawingBufferColorSpace.
 */
function createMockGL(opts: { supportP3?: boolean; supportHLG?: boolean; supportPQ?: boolean } = {}): WebGL2RenderingContext {
  let currentColorSpace = 'srgb';

  const supportedSpaces = new Set<string>(['srgb']);
  if (opts.supportP3) supportedSpaces.add('display-p3');
  if (opts.supportHLG) supportedSpaces.add('rec2100-hlg');
  if (opts.supportPQ) supportedSpaces.add('rec2100-pq');

  const gl = {
    canvas: document.createElement('canvas'),
    get drawingBufferColorSpace() {
      return currentColorSpace;
    },
    set drawingBufferColorSpace(value: string) {
      if (supportedSpaces.has(value)) {
        currentColorSpace = value;
      }
      // If unsupported, silently ignore (like real browsers)
    },
    getExtension: vi.fn(() => null),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    getAttribLocation: vi.fn(() => 0),
    useProgram: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    drawArrays: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    createTexture: vi.fn(() => ({})),
    deleteTexture: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    isContextLost: vi.fn(() => false),
    // Constants
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    COMPILE_STATUS: 0x8b81,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TRIANGLE_STRIP: 0x0005,
    COLOR_BUFFER_BIT: 0x4000,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812f,
    LINEAR: 0x2601,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
  } as unknown as WebGL2RenderingContext;

  return gl;
}

/**
 * Create capabilities with specified HDR support.
 */
function makeCaps(overrides: Partial<DisplayCapabilities> = {}): DisplayCapabilities {
  return { ...DEFAULT_CAPABILITIES, ...overrides };
}

/**
 * Initialize a Renderer with a mocked WebGL context by patching getContext.
 */
function initRendererWithMockGL(
  renderer: Renderer,
  glOpts: { supportP3?: boolean; supportHLG?: boolean; supportPQ?: boolean } = {},
): WebGL2RenderingContext {
  const mockGL = createMockGL(glOpts);
  const canvas = document.createElement('canvas');

  // Patch getContext to return our mock
  const originalGetContext = canvas.getContext.bind(canvas);
  canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
    if (contextId === 'webgl2') return mockGL;
    return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
  }) as typeof canvas.getContext;

  renderer.initialize(canvas);
  return mockGL;
}

describe('Renderer HDR Output Mode', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  it('REN-HDR-004: setHDROutputMode returns true for HLG when supported', () => {
    initRendererWithMockGL(renderer, { supportHLG: true });
    const caps = makeCaps({ webglHLG: true });

    const result = renderer.setHDROutputMode('hlg', caps);

    expect(result).toBe(true);
    expect(renderer.getHDROutputMode()).toBe('hlg');
  });

  it('REN-HDR-005: setHDROutputMode returns false for HLG when unsupported', () => {
    initRendererWithMockGL(renderer);
    const caps = makeCaps({ webglHLG: false });

    const result = renderer.setHDROutputMode('hlg', caps);

    expect(result).toBe(false);
    expect(renderer.getHDROutputMode()).toBe('sdr');
  });

  it('REN-HDR-006: setHDROutputMode returns true for PQ when supported', () => {
    initRendererWithMockGL(renderer, { supportPQ: true });
    const caps = makeCaps({ webglPQ: true });

    const result = renderer.setHDROutputMode('pq', caps);

    expect(result).toBe(true);
    expect(renderer.getHDROutputMode()).toBe('pq');
  });

  it('REN-HDR-007: setHDROutputMode returns false for PQ when unsupported', () => {
    initRendererWithMockGL(renderer);
    const caps = makeCaps({ webglPQ: false });

    const result = renderer.setHDROutputMode('pq', caps);

    expect(result).toBe(false);
    expect(renderer.getHDROutputMode()).toBe('sdr');
  });

  it('REN-HDR-008: setHDROutputMode SDR reverts to P3 when P3 supported', () => {
    const mockGL = initRendererWithMockGL(renderer, { supportP3: true, supportHLG: true });
    const caps = makeCaps({ webglP3: true, webglHLG: true });

    // First set to HLG
    renderer.setHDROutputMode('hlg', caps);
    expect(renderer.getHDROutputMode()).toBe('hlg');

    // Then revert to SDR
    const result = renderer.setHDROutputMode('sdr', caps);

    expect(result).toBe(true);
    expect(renderer.getHDROutputMode()).toBe('sdr');
    expect((mockGL as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace).toBe('display-p3');
  });

  it('REN-HDR-009: setHDROutputMode SDR reverts to sRGB when P3 unsupported', () => {
    const mockGL = initRendererWithMockGL(renderer, { supportHLG: true });
    const caps = makeCaps({ webglP3: false, webglHLG: true });

    // First set to HLG
    renderer.setHDROutputMode('hlg', caps);

    // Then revert to SDR
    const result = renderer.setHDROutputMode('sdr', caps);

    expect(result).toBe(true);
    expect(renderer.getHDROutputMode()).toBe('sdr');
    expect((mockGL as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace).toBe('srgb');
  });

  it('REN-HDR-010: setHDROutputMode returns false when gl is null', () => {
    // Do not initialize renderer - gl is null
    const caps = makeCaps({ webglHLG: true });

    const result = renderer.setHDROutputMode('hlg', caps);

    expect(result).toBe(false);
    expect(renderer.getHDROutputMode()).toBe('sdr');
  });

  it('REN-HDR-011: getHDROutputMode defaults to sdr', () => {
    expect(renderer.getHDROutputMode()).toBe('sdr');
  });

  it('REN-HDR-012: setHDROutputMode catches exceptions and returns false', () => {
    const canvas = document.createElement('canvas');
    const throwingGL = createMockGL();

    // Make drawingBufferColorSpace setter throw
    Object.defineProperty(throwingGL, 'drawingBufferColorSpace', {
      get: () => 'srgb',
      set: () => { throw new Error('Not supported'); },
      configurable: true,
    });

    canvas.getContext = vi.fn((contextId: string) => {
      if (contextId === 'webgl2') return throwingGL;
      return null;
    }) as typeof canvas.getContext;

    renderer.initialize(canvas);
    const caps = makeCaps({ webglHLG: true });

    const result = renderer.setHDROutputMode('hlg', caps);

    expect(result).toBe(false);
    expect(renderer.getHDROutputMode()).toBe('sdr');
  });
});
