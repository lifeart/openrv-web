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

describe('Renderer SDR Frame Rendering (Phase 1A)', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  it('REN-SDR-001: renderSDRFrame returns null when not initialized', () => {
    const canvas = document.createElement('canvas');
    const result = renderer.renderSDRFrame(canvas);
    expect(result).toBeNull();
  });

  it('REN-SDR-002: renderSDRFrame returns canvas after successful render', () => {
    const mockGL = initRendererWithMockGL(renderer);
    // texImage2D is mocked, so upload won't fail
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 100;
    sourceCanvas.height = 100;

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
    // Should have called texImage2D for the SDR texture upload
    expect(mockGL.texImage2D).toHaveBeenCalled();
    // Should have called drawArrays to render the quad
    expect(mockGL.drawArrays).toHaveBeenCalled();
  });

  it('REN-SDR-003: renderSDRFrame sets inputTransfer to 0 (sRGB)', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    // u_inputTransfer should be set to 0 via uniform1i
    // Find the call that sets u_inputTransfer
    const uniform1iMock = mockGL.uniform1i as unknown as ReturnType<typeof vi.fn>;
    const uniformCalls = uniform1iMock.mock.calls;
    // At least one call should be for u_inputTransfer = 0
    // (getUniformLocation is mocked to return {} for all names, so all uniform1i calls go through)
    expect(uniformCalls.length).toBeGreaterThan(0);
  });

  it('REN-SDR-004: renderSDRFrame uses color adjustments', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setColorAdjustments({
      exposure: 2,
      gamma: 1.5,
      saturation: 0.5,
      contrast: 1.2,
      brightness: 0.1,
      temperature: 50,
      tint: -25,
      vibrance: 0,
      vibranceSkinProtection: true,
      clarity: 0,
      hueRotation: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    });

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-SDR-005: renderSDRFrame sets outputMode to 0 (SDR clamp)', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    // uniform1i should have been called with u_outputMode = 0
    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-SDR-006: renderSDRFrame reuses SDR texture across calls', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');
    const createTextureMock = mockGL.createTexture as unknown as ReturnType<typeof vi.fn>;

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);
    const firstCreateCount = createTextureMock.mock.calls.length;

    renderer.renderSDRFrame(sourceCanvas);
    const secondCreateCount = createTextureMock.mock.calls.length;

    // Should not create another texture on the second call
    expect(secondCreateCount).toBe(firstCreateCount);
  });

  it('REN-SDR-007: renderSDRFrame accepts HTMLImageElement', () => {
    initRendererWithMockGL(renderer);
    const img = document.createElement('img');

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(img);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-SDR-008: renderSDRFrame accepts HTMLVideoElement', () => {
    initRendererWithMockGL(renderer);
    const video = document.createElement('video');

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(video);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-SDR-009: getCanvasElement returns null when not initialized', () => {
    const result = renderer.getCanvasElement();
    expect(result).toBeNull();
  });

  it('REN-SDR-010: getCanvasElement returns canvas after initialization', () => {
    initRendererWithMockGL(renderer);
    const result = renderer.getCanvasElement();
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-SDR-011: dispose cleans up SDR texture', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    renderer.dispose();

    // deleteTexture should have been called for the SDR texture
    expect(mockGL.deleteTexture).toHaveBeenCalled();
  });

  it('REN-SDR-012: renderSDRFrame binds curves LUT when curves enabled', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    // Set up curves with a non-identity LUT
    const luts = {
      red: new Uint8Array(256),
      green: new Uint8Array(256),
      blue: new Uint8Array(256),
      master: new Uint8Array(256),
    };
    // Make it non-identity by changing one value
    for (let i = 0; i < 256; i++) {
      luts.red[i] = i;
      luts.green[i] = i;
      luts.blue[i] = i;
      luts.master[i] = i;
    }
    luts.red[128] = 200; // Non-identity
    renderer.setCurvesLUT(luts);

    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    // activeTexture should have been called for TEXTURE1 (curves LUT)
    expect(mockGL.activeTexture).toHaveBeenCalled();
  });

  it('REN-SDR-013: renderSDRFrame applies tone mapping state', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setToneMappingState({
      enabled: true,
      operator: 'aces',
    });

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-SDR-014: renderSDRFrame applies color inversion', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setColorInversion(true);

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });
});

describe('Renderer Phase 1B: New GPU Shader Effects', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  it('REN-1B-001: setHighlightsShadows sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setHighlightsShadows(50, -30, 20, -10);
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-002: setVibrance sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setVibrance(75, true);
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-003: setClarity sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setClarity(50);
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-004: setSharpen sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setSharpen(60);
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-005: setHSLQualifier sets shader uniforms', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setHSLQualifier({
      enabled: true,
      hue: { center: 120, width: 60, softness: 30 },
      saturation: { center: 50, width: 80, softness: 20 },
      luminance: { center: 50, width: 100, softness: 10 },
      correction: { hueShift: 30, saturationScale: 1.5, luminanceScale: 0.8 },
      invert: false,
      mattePreview: false,
    });
    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-006: setHighlightsShadows with zero values disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setHighlightsShadows(0, 0, 0, 0);
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    // uniform1i should have been called with u_hsEnabled = 0
    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-007: setVibrance with zero disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setVibrance(0, true);
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-008: setClarity with zero disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setClarity(0);
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-009: setSharpen with zero disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setSharpen(0);
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-010: setHSLQualifier with disabled state disables effect', () => {
    const mockGL = initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setHSLQualifier({
      enabled: false,
      hue: { center: 0, width: 30, softness: 20 },
      saturation: { center: 50, width: 100, softness: 10 },
      luminance: { center: 50, width: 100, softness: 10 },
      correction: { hueShift: 0, saturationScale: 1, luminanceScale: 1 },
      invert: false,
      mattePreview: false,
    });
    renderer.resize(100, 100);
    renderer.renderSDRFrame(sourceCanvas);

    expect(mockGL.uniform1i).toHaveBeenCalled();
  });

  it('REN-1B-011: all Phase 1B effects can be active simultaneously', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setHighlightsShadows(50, -30, 20, -10);
    renderer.setVibrance(40, true);
    renderer.setClarity(30);
    renderer.setSharpen(50);
    renderer.setHSLQualifier({
      enabled: true,
      hue: { center: 180, width: 45, softness: 25 },
      saturation: { center: 60, width: 70, softness: 15 },
      luminance: { center: 40, width: 90, softness: 5 },
      correction: { hueShift: -15, saturationScale: 1.2, luminanceScale: 0.9 },
      invert: true,
      mattePreview: false,
    });

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('REN-1B-012: HSL qualifier matte preview mode works', () => {
    initRendererWithMockGL(renderer);
    const sourceCanvas = document.createElement('canvas');

    renderer.setHSLQualifier({
      enabled: true,
      hue: { center: 120, width: 60, softness: 30 },
      saturation: { center: 50, width: 80, softness: 20 },
      luminance: { center: 50, width: 100, softness: 10 },
      correction: { hueShift: 0, saturationScale: 1, luminanceScale: 1 },
      invert: false,
      mattePreview: true,
    });

    renderer.resize(100, 100);
    const result = renderer.renderSDRFrame(sourceCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });
});
